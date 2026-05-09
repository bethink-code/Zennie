// findRecentSwing — locate a recent pullback swing point in the trade
// direction, used as the entry price for REACH `pullback-swing` mode.
//
// For a long REACH (we're going UP toward an upper pool), we want a recent
// swing LOW within the lookback window — that's the pullback we'd buy at.
//
// For a short REACH (we're going DOWN toward a lower pool), we want a recent
// swing HIGH.
//
// "Swing" in v0 = simple lowest-low / highest-high of the lookback window.
// This is intentionally loose — we'll refine to N-bar pivots if v0 entries
// are too eager. Pure function, no fancy state.

import type { Candle } from "../../../../../shared/zennyTypes";

export function findRecentSwingLow(
  candles: Candle[],
  lookbackBars: number,
): number | null {
  if (candles.length === 0) return null;
  const start = Math.max(0, candles.length - lookbackBars);
  let lo = Infinity;
  for (let i = start; i < candles.length; i++) {
    if (candles[i].low < lo) lo = candles[i].low;
  }
  return Number.isFinite(lo) ? lo : null;
}

export function findRecentSwingHigh(
  candles: Candle[],
  lookbackBars: number,
): number | null {
  if (candles.length === 0) return null;
  const start = Math.max(0, candles.length - lookbackBars);
  let hi = -Infinity;
  for (let i = start; i < candles.length; i++) {
    if (candles[i].high > hi) hi = candles[i].high;
  }
  return Number.isFinite(hi) ? hi : null;
}
