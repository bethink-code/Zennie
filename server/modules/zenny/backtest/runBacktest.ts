// runBacktest — Stage 1 of the testing/optimisation layer: the FACTUAL replay.
//
//   Backtest  → what do our CURRENT settings produce?   (this file)
//   Karpathy  → what if we tried DIFFERENT settings?    (sweeps this)
//   Implement → adopt the optimised settings.
//
// Given ONE config, step every bar of history in order (no lookahead) and
// report what the live bot would have done. It calls the SAME functions the
// live runner calls — runAnalysis (as-of), createPosition, submitPosition,
// reduceStep, killSwitchEvaluate — so the result is trustworthy. Only the data
// feed (as-of cutoff) and the account store (in-memory) differ from live.
//
// One shared account across all symbols, mirroring the live paper account.
// Output is config-in → scored-outcome-out so the optimiser can rank configs.

import type { Candle, Timeframe } from "../../../../shared/zennyTypes";
import { TF_BAR_DURATION_MS } from "../../../../shared/zennyTypes";
import { runAnalysis } from "../analysis/orchestrator";
import type { QualifyConfig } from "../decision/qualify/types";
import type { ReachTradeConfig } from "../decision/reach/types";
import type { WickTradeConfig } from "../decision/wick/types";
import { createPosition, submitPosition } from "../execution/createPosition";
import {
  DEFAULT_EXECUTION_CONFIG,
  type ExecutionConfig,
} from "../execution/executionConfig";
import { killSwitchEvaluate } from "../execution/killSwitchEvaluate";
import { reduceStep } from "../execution/reduceStep";
import { DEFAULT_RISK_CONFIG } from "../execution/riskConfig";
import type { ExecutionBar, PositionRecord } from "../execution/types";
import type { MarketDataProvider } from "../infrastructure/providers/providerInterface";
import { summariseBacktest, type BacktestSummary } from "./summariseBacktest";

export interface BacktestConfig {
  executionConfig?: ExecutionConfig;
  accountRiskPct?: number;
  qualifyConfig?: QualifyConfig;
  wickConfig?: WickTradeConfig;
  reachConfig?: ReachTradeConfig;
  candleCount?: number; // analysis lookback per bar (default 200)
}

export interface BacktestInput {
  provider: MarketDataProvider; // preloaded with full history (e.g. MockProvider)
  symbols: string[];
  timeframe: Timeframe;
  fromMs: number; // first bar openTime to trade
  toMs: number; // last bar openTime to trade
  startingEquity: number;
  config?: BacktestConfig;
}

export interface BacktestResult {
  startingEquity: number;
  finalEquity: number;
  trades: PositionRecord[]; // CLOSED, in close order
  equityCurve: Array<{ t: number; equity: number }>;
  summary: BacktestSummary;
}

interface BtAccount {
  startingEquity: number;
  currentEquity: number;
  peakEquity: number;
  killStatus: "OK" | "SOFT_TRIPPED" | "HARD_TRIPPED";
  drawdownPct: number;
}

const TERMINAL = new Set(["CLOSED", "EXPIRED", "REJECTED", "CANCELLED"]);

export async function runBacktest(
  input: BacktestInput,
): Promise<BacktestResult> {
  const exec = input.config?.executionConfig ?? DEFAULT_EXECUTION_CONFIG;
  const accountRiskPct =
    input.config?.accountRiskPct ?? DEFAULT_RISK_CONFIG.accountRiskPct;
  const candleCount = input.config?.candleCount ?? 200;

  const account: BtAccount = {
    startingEquity: input.startingEquity,
    currentEquity: input.startingEquity,
    peakEquity: input.startingEquity,
    killStatus: "OK",
    drawdownPct: 0,
  };

  // Open positions in memory, keyed by id. Closed ones accumulate.
  const open = new Map<string, PositionRecord>();
  const closed: PositionRecord[] = [];
  const equityCurve: Array<{ t: number; equity: number }> = [];

  // Unified ascending list of bar openTimes in the window (any symbol's grid;
  // 15m boundaries are shared across symbols).
  const barTimes = await collectBarTimes(input, candleCount);

  for (const t of barTimes) {
    for (const symbol of input.symbols) {
      const state = await runAnalysis({
        provider: input.provider,
        symbol,
        primaryTimeframe: input.timeframe,
        candleCountPerTf: candleCount,
        asOfMs: t,
        qualifyConfig: input.config?.qualifyConfig,
        wickConfig: input.config?.wickConfig,
        reachConfig: input.config?.reachConfig,
      });

      const bar = barFromState(state.candles, t);
      if (!bar) continue;

      // 1. Step this symbol's open positions over the just-closed bar.
      for (const pos of [...open.values()]) {
        if (pos.symbol !== symbol) continue;
        if (bar.openTime <= pos.lastEvaluatedAt) continue;
        const next = reduceStep({
          position: pos,
          bar,
          equity: account.currentEquity,
          config: exec,
        });
        open.set(next.id, next);
        if (TERMINAL.has(next.status)) {
          open.delete(next.id);
          if (next.status === "CLOSED") {
            closed.push(next);
            if (next.realisedPnl !== null) applyPnl(account, next.realisedPnl);
          }
        }
      }

      // 2. New entries — soft/hard kill blocks them. Dedup by (symbol, phase).
      if (account.killStatus === "OK") {
        const plans =
          state.tradePlanResult.plansPerTimeframe?.[input.timeframe] ?? [];
        const openPhases = new Set(
          [...open.values()]
            .filter((p) => p.symbol === symbol)
            .map((p) => p.phase),
        );
        for (const plan of plans) {
          if (openPhases.has(plan.phase)) continue;
          const id = `${symbol}-${input.timeframe}-${plan.phase}-${bar.openTime}`;
          if (open.has(id)) continue;
          const drafted = createPosition({
            id,
            symbol,
            plan,
            emittedAtBarTs: bar.openTime,
            accountRiskPct,
          });
          const live = submitPosition(
            drafted,
            account.currentEquity,
            bar.closeTime,
          );
          if (live.status === "LIVE") {
            open.set(live.id, live);
            openPhases.add(plan.phase);
          }
        }
      }
    }

    // 3. Kill switch after the bar.
    const ks = killSwitchEvaluate({
      currentEquity: account.currentEquity,
      peakEquity: account.peakEquity,
      startingEquity: account.startingEquity,
      previousKillStatus: account.killStatus,
      config: exec,
    });
    account.killStatus = ks.killStatus;
    account.drawdownPct = ks.drawdownPct;
    equityCurve.push({ t, equity: account.currentEquity });
  }

  return {
    startingEquity: account.startingEquity,
    finalEquity: account.currentEquity,
    trades: closed,
    equityCurve,
    summary: summariseBacktest(
      closed,
      account.startingEquity,
      account.currentEquity,
      equityCurve,
    ),
  };
}

// --- helpers ---------------------------------------------------------------

function applyPnl(account: BtAccount, pnl: number): void {
  account.currentEquity += pnl;
  account.peakEquity = Math.max(account.peakEquity, account.currentEquity);
}

function barFromState(candles: Candle[], t: number): ExecutionBar | null {
  // asOfMs = t, so the last candle is the bar that opened at t.
  const c = candles[candles.length - 1];
  if (!c || c.openTime !== t) {
    const found = candles.find((x) => x.openTime === t);
    if (!found) return null;
    return pickBar(found);
  }
  return pickBar(c);
}

function pickBar(c: Candle): ExecutionBar {
  return {
    openTime: c.openTime,
    closeTime: c.closeTime,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  };
}

// Derive the ascending bar openTimes in [fromMs, toMs] from the first symbol's
// candle grid (as-of toMs so we see the whole window).
async function collectBarTimes(
  input: BacktestInput,
  candleCount: number,
): Promise<number[]> {
  const barMs = TF_BAR_DURATION_MS[input.timeframe];
  const span = Math.ceil((input.toMs - input.fromMs) / barMs) + candleCount + 2;
  const candles = await input.provider.getCandles({
    symbol: input.symbols[0],
    timeframe: input.timeframe,
    count: span,
    endTimeMs: input.toMs,
  });
  return candles
    .map((c) => c.openTime)
    .filter((t) => t >= input.fromMs && t <= input.toMs)
    .sort((a, b) => a - b);
}
