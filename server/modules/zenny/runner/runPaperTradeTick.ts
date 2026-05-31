// runPaperTradeTick — single cron tick. Stateless function called on schedule
// (e.g. hourly via Vercel Cron). Drives one (symbol, timeframe) through:
//
//   1. Load account state from DB.
//   2. If kill switch HARD_TRIPPED → no-op, log, return.
//   3. Run analysis → extract candles + TradePlan.
//   4. Collect every CLOSED bar (closeTime ≤ now), ascending.
//   5. Load any open position.
//   6. If open: replay reduceStep over EVERY closed bar since the position's
//      lastEvaluatedAt — not just the most recent one.
//      - On CLOSED transition: update account currentEquity + peakEquity.
//   7. Else if no open AND TradePlan exists: create + submit the paper order.
//   8. Re-evaluate kill switch with new equity.
//   9. Persist account + log tick.
//
// Why replay multiple bars (step 6): the cron cadence is decoupled from the
// trading timeframe to keep DB compute cheap (an hourly cron against 15m bars
// leaves 4 bars to process per tick). Exits must be checked on EVERY closed
// bar — a stop hit on an intermediate bar can't be skipped just because the
// cron only fires hourly. The reducer is bar-by-bar and bumps lastEvaluatedAt,
// so replaying successive bars is exact. New entries (step 7) still fire only
// at cron cadence — they enter at the current decision price, so deferring
// them to the tick is correct, not a fidelity loss.
//
// All state lives in DB. Never holds in-memory state across invocations.

import type { Candle, Timeframe } from "../../../../shared/zennyTypes";
import { runAnalysis } from "../analysis/orchestrator";
import { fetchRecentLiquidations } from "../analysis/data/fetchRecentLiquidations";
import { createPosition, submitPosition } from "../execution/createPosition";
import { DEFAULT_RISK_CONFIG } from "../execution/riskConfig";
import {
  DEFAULT_EXECUTION_CONFIG,
  type ExecutionConfig,
} from "../execution/executionConfig";
import { killSwitchEvaluate } from "../execution/killSwitchEvaluate";
import { replayPosition } from "../execution/replayPosition";
import type { ExecutionBar, PositionRecord } from "../execution/types";
import type { MarketDataProvider } from "../infrastructure/providers/providerInterface";
import {
  loadAccount,
  loadOpenPositions,
  logTick,
  upsertAccount,
  upsertPosition,
  type PaperAccountRow,
} from "../persistence/paperTradeStore";

export interface RunPaperTradeTickInput {
  provider: MarketDataProvider;
  symbol: string;
  timeframe: Timeframe;
  candleCount?: number;
  config?: ExecutionConfig;
  // ms-since-epoch — defaults to Date.now(); injected for tests/replay.
  now?: number;
}

export interface RunPaperTradeTickResult {
  symbol: string;
  timeframe: Timeframe;
  tickAt: number;
  hadOpenPosition: boolean;
  newPositionId: string | null;
  transitions: Array<{
    id: string;
    from: string;
    to: string;
    reason: string | null;
  }>;
  account: {
    currentEquity: number;
    peakEquity: number;
    killStatus: string;
    drawdownPct: number;
  };
  noTransitionReason: string | null;
}

export async function runPaperTradeTick(
  input: RunPaperTradeTickInput,
): Promise<RunPaperTradeTickResult> {
  const cfg = input.config ?? DEFAULT_EXECUTION_CONFIG;
  const now = input.now ?? Date.now();

  let account = await loadAccount();
  const transitions: RunPaperTradeTickResult["transitions"] = [];
  let newPositionId: string | null = null;
  let noTransitionReason: string | null = null;

  // Kill switch hard-trip guard. v0: no auto-cancel of LIVE / FILLED positions
  // here — closing positions on hard-trip is a deliberate runner concern that
  // needs review (forced market close on stale bars adds slippage). Future:
  // wire cancelPosition('kill-switch') for all open positions.
  if (account.killStatus === "HARD_TRIPPED") {
    noTransitionReason = "kill-switch-hard-tripped";
    await logTick({
      symbol: input.symbol,
      timeframe: input.timeframe,
      summary: {
        hadOpenPosition: false,
        transitions,
        account,
        noTransitionReason,
      },
    });
    return {
      symbol: input.symbol,
      timeframe: input.timeframe,
      tickAt: now,
      hadOpenPosition: false,
      newPositionId: null,
      transitions,
      account: pickAccount(account),
      noTransitionReason,
    };
  }

  // Run the analysis pipeline. Failure here is fatal for the tick — log and
  // bail rather than half-update DB state.
  let analysisState: Awaited<ReturnType<typeof runAnalysis>>;
  try {
    let liquidations: Array<{ price: number; usdValue: number }> = [];
    try {
      liquidations = await fetchRecentLiquidations({ symbol: input.symbol });
    } catch {
      // Non-fatal — regime input just marks itself unavailable.
    }
    analysisState = await runAnalysis({
      provider: input.provider,
      symbol: input.symbol,
      primaryTimeframe: input.timeframe,
      candleCountPerTf: input.candleCount ?? 200,
      liquidations,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logTick({
      symbol: input.symbol,
      timeframe: input.timeframe,
      summary: { error: msg, account },
      error: msg,
    });
    throw err;
  }

  const closedBars = collectClosedBars(analysisState.candles, now);
  const latestClosedBar = closedBars.at(-1) ?? null;
  if (!latestClosedBar) {
    noTransitionReason = "no-closed-bar-yet";
    await logTick({
      symbol: input.symbol,
      timeframe: input.timeframe,
      summary: {
        hadOpenPosition: false,
        transitions,
        account,
        noTransitionReason,
      },
    });
    return {
      symbol: input.symbol,
      timeframe: input.timeframe,
      tickAt: now,
      hadOpenPosition: false,
      newPositionId: null,
      transitions,
      account: pickAccount(account),
      noTransitionReason,
    };
  }

  // Process any open position(s). v0: at most one per (symbol, tf) but loop
  // handles N to keep the structure honest. Each position is replayed bar by
  // bar over every closed bar since its lastEvaluatedAt, so exits land on the
  // exact bar that hit them regardless of cron cadence. We persist once per
  // position after the replay (one write, not one per bar).
  const openPositions = await loadOpenPositions(input.symbol, input.timeframe);
  for (const pos of openPositions) {
    const before = pos.status;
    const current = replayPosition({
      position: pos,
      bars: closedBars,
      equity: account.currentEquity,
      config: cfg,
    });
    await upsertPosition(current);
    if (current.status !== before) {
      transitions.push({
        id: current.id,
        from: before,
        to: current.status,
        reason: current.exitReason,
      });
    }
    // Newly CLOSED this tick — fold realised PnL into the account. `before` is
    // always non-terminal (loadOpenPositions only returns PLANNED/LIVE/FILLED),
    // so a position that goes LIVE→CLOSED within one batch is still counted.
    if (current.status === "CLOSED" && current.realisedPnl !== null) {
      account = applyPnl(account, current.realisedPnl);
    }
  }

  // New-entry handling. The decision layer now selects one active plan per
  // timeframe, but we still dedup by phase so stale open positions from older
  // ticks do not get duplicated. Soft-kill blocks NEW entries.
  const tfPlans =
    analysisState.tradePlanResult.plansPerTimeframe?.[input.timeframe] ?? [];
  const stillOpen = (
    await loadOpenPositions(input.symbol, input.timeframe)
  ).filter(
    (p) =>
      p.status === "PLANNED" || p.status === "LIVE" || p.status === "FILLED",
  );
  const openPhases = new Set(stillOpen.map((p) => p.phase));
  const newPositionIds: string[] = [];

  if (account.killStatus === "OK") {
    for (const plan of tfPlans) {
      if (openPhases.has(plan.phase)) continue; // dedup
      const drafted = createPosition({
        id: makePositionId(
          input.symbol,
          input.timeframe,
          plan.phase,
          latestClosedBar.openTime,
        ),
        symbol: input.symbol,
        plan,
        emittedAtBarTs: latestClosedBar.openTime,
        accountRiskPct: DEFAULT_RISK_CONFIG.accountRiskPct,
      });
      const pos = submitPosition(
        drafted,
        account.currentEquity,
        latestClosedBar.closeTime,
      );
      await upsertPosition(pos);
      newPositionIds.push(pos.id);
      openPhases.add(plan.phase);
    }
  }
  if (newPositionIds.length > 0) {
    newPositionId = newPositionIds[0]; // backward-compat — first new id
  } else if (tfPlans.length === 0 && stillOpen.length === 0) {
    noTransitionReason = "no-trade-plan";
  } else if (account.killStatus === "SOFT_TRIPPED") {
    noTransitionReason = "kill-switch-soft-tripped";
  }

  // Kill switch evaluation after PnL applied.
  const killOut = killSwitchEvaluate({
    currentEquity: account.currentEquity,
    peakEquity: account.peakEquity,
    startingEquity: account.startingEquity,
    previousKillStatus: account.killStatus,
    config: cfg,
  });
  account = {
    ...account,
    killStatus: killOut.killStatus,
    drawdownPct: killOut.drawdownPct,
  };

  await upsertAccount(account);

  await logTick({
    symbol: input.symbol,
    timeframe: input.timeframe,
    summary: {
      hadOpenPosition: openPositions.length > 0,
      transitions,
      newPositionId,
      account: pickAccount(account),
      noTransitionReason,
    },
  });

  return {
    symbol: input.symbol,
    timeframe: input.timeframe,
    tickAt: now,
    hadOpenPosition: openPositions.length > 0,
    newPositionId,
    transitions,
    account: pickAccount(account),
    noTransitionReason,
  };
}

// --- helpers ---------------------------------------------------------------

function applyPnl(account: PaperAccountRow, pnl: number): PaperAccountRow {
  const newEquity = account.currentEquity + pnl;
  const newPeak = Math.max(account.peakEquity, newEquity);
  return {
    ...account,
    currentEquity: newEquity,
    peakEquity: newPeak,
  };
}

function pickAccount(account: PaperAccountRow) {
  return {
    currentEquity: account.currentEquity,
    peakEquity: account.peakEquity,
    killStatus: account.killStatus,
    drawdownPct: account.drawdownPct,
  };
}

function collectClosedBars(candles: Candle[], now: number): ExecutionBar[] {
  // Analysis candles are ascending by time; the final entry may be the
  // in-progress bar (closeTime > now). Keep every bar that has closed, in
  // order, so the caller can replay them sequentially.
  const bars: ExecutionBar[] = [];
  for (const c of candles) {
    if (c.closeTime <= now) {
      bars.push({
        openTime: c.openTime,
        closeTime: c.closeTime,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      });
    }
  }
  return bars;
}

function makePositionId(
  symbol: string,
  timeframe: Timeframe,
  phase: string,
  bar: number,
): string {
  return `${symbol}-${timeframe}-${phase}-${bar}`;
}
