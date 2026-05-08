// computeATR — average true range over the last `period` candles.
//
// True range for candle i:
//   TR_i = max( high_i - low_i, |high_i - close_{i-1}|, |low_i - close_{i-1}| )
//
// ATR = simple mean of the last `period` TRs. Wilder's smoothing (EMA-ish) is
// the textbook variant; SMA is the common simplification and what most
// practitioner SFP/Turtle Soup material assumes when they say "ATR(14)".
//
// Returns null when there aren't enough candles to compute (need period + 1).
// Pure function — no side effects, no caching.

import type { Candle } from "../../../../../shared/zennyTypes";

export function computeATR(
  candles: Candle[],
  period: number,
): number | null {
  if (period <= 0) return null;
  if (candles.length < period + 1) return null;

  const trs: number[] = [];
  // Walk the LAST `period` candles, comparing each to its predecessor.
  const start = candles.length - period;
  for (let i = start; i < candles.length; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close),
    );
    trs.push(tr);
  }

  let sum = 0;
  for (const tr of trs) sum += tr;
  return sum / trs.length;
}
