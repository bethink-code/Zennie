// manageOpenPositions — advance every open paper position over the latest bars.
//
// This is the MANAGEMENT half of the old runner, kept after the DECISION half
// (auto trade-selection) was stripped. It does NOT place trades — it only
// advances positions the human placed via the wick tool: fill-on-touch, stops,
// targets, time-stops, closes. It reuses the exact execution engine
// (replayPosition -> reduceStep) the backtest uses, so paper and backtest stay
// identical.
//
// Triggered on demand (the P&L page calls it), so there is no background cron
// cost. A light scheduled version + fill/close alerts can sit on top of this
// later — but the same management core.

import type { Candle, Timeframe } from "../../../../shared/zennyTypes";
import {
  DEFAULT_EXECUTION_CONFIG,
  type ExecutionConfig,
} from "../execution/executionConfig";
import { killSwitchEvaluate } from "../execution/killSwitchEvaluate";
import { replayPosition } from "../execution/replayPosition";
import type {
  ExecutionBar,
  PositionRecord,
  PositionStatus,
} from "../execution/types";
import type { MarketDataProvider } from "../infrastructure/providers/providerInterface";
import {
  listAllPositions,
  loadAccount,
  upsertAccount,
  upsertPosition,
  type PaperAccountRow,
} from "../persistence/paperTradeStore";

const OPEN_STATES: PositionStatus[] = ["PLANNED", "LIVE", "FILLED"];

export interface ManageResult {
  evaluated: number;
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
}

export interface ManageInput {
  provider: MarketDataProvider;
  now?: number; // ms; injectable for tests/replay
  candleCount?: number; // bars fetched per stream (default 300)
  config?: ExecutionConfig;
}

export async function manageOpenPositions(
  input: ManageInput,
): Promise<ManageResult> {
  const cfg = input.config ?? DEFAULT_EXECUTION_CONFIG;
  const now = input.now ?? Date.now();
  const candleCount = input.candleCount ?? 300;

  let account = await loadAccount();

  const open = (await listAllPositions(1000)).filter((p) =>
    OPEN_STATES.includes(p.status),
  );

  // Group by (symbol, timeframe) so candles are fetched once per stream.
  const byStream = new Map<string, PositionRecord[]>();
  for (const p of open) {
    const key = `${p.symbol}|${p.timeframe}`;
    const list = byStream.get(key);
    if (list) list.push(p);
    else byStream.set(key, [p]);
  }

  const transitions: ManageResult["transitions"] = [];
  let evaluated = 0;

  for (const [key, positions] of byStream) {
    const [symbol, timeframe] = key.split("|") as [string, Timeframe];
    let candles: Candle[];
    try {
      candles = await input.provider.getCandles({
        symbol,
        timeframe,
        count: candleCount,
      });
    } catch {
      continue; // a bad symbol/feed shouldn't abort the rest of the basket
    }
    const bars: ExecutionBar[] = candles
      .filter((c) => c.closeTime <= now)
      .map((c) => ({
        openTime: c.openTime,
        closeTime: c.closeTime,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

    for (const pos of positions) {
      const before = pos.status;
      const next = replayPosition({
        position: pos,
        bars,
        equity: account.currentEquity,
        config: cfg,
      });
      evaluated++;
      if (next.status !== before || next.lastEvaluatedAt !== pos.lastEvaluatedAt) {
        await upsertPosition(next);
      }
      if (next.status !== before) {
        transitions.push({
          id: next.id,
          from: before,
          to: next.status,
          reason: next.exitReason,
        });
        if (next.status === "CLOSED" && next.realisedPnl !== null) {
          account = applyPnl(account, next.realisedPnl);
        }
      }
    }
  }

  const ks = killSwitchEvaluate({
    currentEquity: account.currentEquity,
    peakEquity: account.peakEquity,
    startingEquity: account.startingEquity,
    previousKillStatus: account.killStatus,
    config: cfg,
  });
  account = { ...account, killStatus: ks.killStatus, drawdownPct: ks.drawdownPct };
  await upsertAccount(account);

  return {
    evaluated,
    transitions,
    account: {
      currentEquity: account.currentEquity,
      peakEquity: account.peakEquity,
      killStatus: account.killStatus,
      drawdownPct: account.drawdownPct,
    },
  };
}

function applyPnl(account: PaperAccountRow, pnl: number): PaperAccountRow {
  const newEquity = account.currentEquity + pnl;
  return {
    ...account,
    currentEquity: newEquity,
    peakEquity: Math.max(account.peakEquity, newEquity),
  };
}
