// replayPosition — step one position through a sequence of closed bars.
//
// The cron cadence is decoupled from the trading timeframe (an hourly cron
// against 15m bars leaves several bars to process per tick), so a position
// must be advanced over EVERY closed bar since it was last evaluated — not
// just the most recent. A stop or target hit on an intermediate bar cannot be
// skipped because the cron only fired once.
//
// Pure function. Folds reduceStep over the bars:
//   - Bars at or before the position's lastEvaluatedAt are skipped (idempotent
//     re-runs of the same tick are safe; reduceStep would otherwise throw on
//     the lookahead invariant).
//   - reduceStep is itself idempotent on terminal states and does not advance
//     the cursor past them, so trailing bars after a CLOSED transition are
//     harmless no-ops — no explicit terminal guard required.
//
// Bars MUST be ascending by openTime. Equity is held constant across the
// replay: sizing happens once at PLANNED→LIVE, and realised PnL is folded into
// the account by the caller after the position reaches a terminal state.

import type { ExecutionConfig } from "./executionConfig";
import { reduceStep } from "./reduceStep";
import type { ExecutionBar, PositionRecord } from "./types";

export interface ReplayPositionInput {
  position: PositionRecord;
  bars: ExecutionBar[];
  equity: number;
  config: ExecutionConfig;
}

export function replayPosition(input: ReplayPositionInput): PositionRecord {
  let current = input.position;
  for (const bar of input.bars) {
    if (bar.openTime <= current.lastEvaluatedAt) continue;
    current = reduceStep({
      position: current,
      bar,
      equity: input.equity,
      config: input.config,
    });
  }
  return current;
}
