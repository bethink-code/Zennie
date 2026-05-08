// checkConfirmation — close-back-inside test for fade entries.
//
// The SFP / Turtle Soup convention: after a wick sweeps a level, the entry
// is only valid if the SAME bar (or within `maxBarsAfterSweep`) closes back
// INSIDE the swept level. Without that, the sweep was a continuation, not
// a fade — entering at the extreme front-runs a real breakout.
//
// "Inside the level" depends on the pool side:
//   RESISTANCE pool, swept high : "inside" = close < linePrice
//   SUPPORT pool, swept low     : "inside" = close > linePrice
//
// Returns:
//   { satisfied: true,  confirmedAtIndex }  — confirmation found within window
//   { satisfied: false, reason }            — sweep too old, no close-back, etc.
//
// Pure function. The caller decides whether to enforce: confirmation is
// required only for entry styles in ConfirmationConfig.requiredFor.

import type { Candle } from "../../../../../shared/zennyTypes";
import type { AnalysisPool } from "../../analysis/orchestrator";

export interface CheckConfirmationInput {
  pool: AnalysisPool;
  candles: Candle[];
  maxBarsAfterSweep: number;
}

export interface CheckConfirmationResult {
  satisfied: boolean;
  reason?: string;
  confirmedAtIndex?: number;
}

export function checkConfirmation(
  input: CheckConfirmationInput,
): CheckConfirmationResult {
  const { pool, candles, maxBarsAfterSweep } = input;
  const sweptIdx = pool.sweptCandleIndexOnPrimary;

  if (sweptIdx === null) {
    return { satisfied: false, reason: "pool not swept" };
  }
  if (sweptIdx < 0 || sweptIdx >= candles.length) {
    return { satisfied: false, reason: "sweep index out of range" };
  }

  // Walk from the sweep candle forward up to maxBarsAfterSweep candles.
  // Inclusive of the sweep candle itself — same-bar close-back-inside counts.
  const lastIdx = Math.min(
    candles.length - 1,
    sweptIdx + maxBarsAfterSweep,
  );

  for (let i = sweptIdx; i <= lastIdx; i++) {
    const c = candles[i];
    if (pool.type === "RESISTANCE" && c.close < pool.linePrice) {
      return { satisfied: true, confirmedAtIndex: i };
    }
    if (pool.type === "SUPPORT" && c.close > pool.linePrice) {
      return { satisfied: true, confirmedAtIndex: i };
    }
  }

  return {
    satisfied: false,
    reason: `no close-back-inside within ${maxBarsAfterSweep} bars`,
  };
}
