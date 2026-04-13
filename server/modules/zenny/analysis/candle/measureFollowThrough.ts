// measureFollowThrough — quantify how dramatically price reversed after a pivot.
//
// Used to filter out "noise pivots" — swings where price barely moved away
// before resuming its prior direction. A genuine swing high should have
// price moving HARD to the downside in the following candles; a genuine
// swing low should see a hard upside move.
//
// Returns the max reversal distance within `lookahead` candles, as a
// multiple of ATR (so the measure is volatility-adjusted). Pure function.
//
// Literature defaults (zigzag/swing indicators across TradingView):
//   scalping   : 1.8× ATR
//   day/swing  : 2.5× ATR
//   weekly/+   : 3.0× ATR
// Configurable per-TF in the orchestrator.

import type { Candle } from "../../../../../shared/zennyTypes";

export interface FollowThroughInput {
  candles: Candle[];
  pivotIndex: number;
  pivotType: "swing_high" | "swing_low";
  lookaheadCandles?: number; // default 5
  atr?: number; // required if you want the ratio; otherwise returns raw distance
}

export interface FollowThroughResult {
  // Absolute price distance the market moved in the opposing direction
  // within the lookahead window. For a swing high: the furthest drop
  // from the pivot high. For a swing low: the furthest rise from the pivot low.
  maxReversalDistance: number;
  // Same as above, expressed as a multiple of ATR. null if no atr provided.
  reversalAsAtrMultiple: number | null;
  // The candle index at which the max reversal was observed.
  reversalCandleIndex: number;
}

export function measureFollowThrough(
  input: FollowThroughInput,
): FollowThroughResult {
  const lookahead = input.lookaheadCandles ?? 5;
  const pivot = input.candles[input.pivotIndex];
  if (!pivot) {
    return {
      maxReversalDistance: 0,
      reversalAsAtrMultiple: null,
      reversalCandleIndex: input.pivotIndex,
    };
  }

  const end = Math.min(input.candles.length, input.pivotIndex + 1 + lookahead);
  let maxDistance = 0;
  let maxIndex = input.pivotIndex;

  if (input.pivotType === "swing_high") {
    // Pivot high is pivot.high; look for the lowest low in the next N candles
    const pivotPrice = pivot.high;
    for (let j = input.pivotIndex + 1; j < end; j++) {
      const distance = pivotPrice - input.candles[j].low;
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = j;
      }
    }
  } else {
    // Pivot low is pivot.low; look for the highest high in the next N candles
    const pivotPrice = pivot.low;
    for (let j = input.pivotIndex + 1; j < end; j++) {
      const distance = input.candles[j].high - pivotPrice;
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = j;
      }
    }
  }

  return {
    maxReversalDistance: maxDistance,
    reversalAsAtrMultiple:
      input.atr !== undefined && input.atr > 0 ? maxDistance / input.atr : null,
    reversalCandleIndex: maxIndex,
  };
}

// Helper: compute ATR(14) for a candle series. Used alongside the follow-through
// check. Simple-mean version (not Wilder-smoothed) — adequate for a filter.
export function computeAtr14(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return 0;
  const recent = candles.slice(-period - 1);
  const trs: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const c = recent[i];
    const prev = recent[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close),
    );
    trs.push(tr);
  }
  return trs.reduce((s, n) => s + n, 0) / trs.length;
}
