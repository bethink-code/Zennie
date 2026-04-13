// setPoolBoundaries — compute pool rectangle bounds.
//
// Phase 2 refactor: ONE-SIDED rectangle. The pool sits on the "stops side"
// of the line — ABOVE a resistance line (where shorts' stops cluster),
// BELOW a support line (where longs' stops cluster). The rectangle's height
// is the distance stops typically sit beyond the line (ATR × 1.0 default).
//
// Before: rectangle centered on line, height from percentile-of-wicks.
// After:  rectangle one-sided, height from ATR × multiplier. Matches how
// stops actually cluster and matches the user's method description:
//   "Above every resistance line — sellers are sitting with their stop
//    losses just above it. Below every support line — buyers are sitting
//    with their stop losses just below it. Those are the liquidity pools."
//
// Pure function.

export interface SetBoundariesInput {
  linePrice: number; // the level price (close of swing candle)
  side: "RESISTANCE" | "SUPPORT";
  atr: number; // ATR_14 value for the timeframe
  offsetMultiplier?: number; // default 1.0 — how far the pool extends beyond the line
  currentPrice: number; // for fallback min width clamp
  minWidthPct?: number; // 0.005 (0.5% of current price) as a fallback
}

export interface PoolBoundaries {
  wickHigh: number;
  wickLow: number;
  centreLine: number; // the line price — the "near edge" of the pool
  widthPct: number;
  fallbackApplied: boolean;
}

export function setPoolBoundaries(input: SetBoundariesInput): PoolBoundaries {
  const offsetMult = input.offsetMultiplier ?? 1.0;
  const minWidthPct = input.minWidthPct ?? 0.005;

  // Primary: offset by ATR × multiplier
  let offset = input.atr * offsetMult;

  // Fallback: if ATR is zero or tiny (happens on very quiet periods or
  // when the ATR input is missing), use minWidthPct of current price
  const minOffset = input.currentPrice * minWidthPct;
  let fallbackApplied = false;
  if (offset < minOffset) {
    offset = minOffset;
    fallbackApplied = true;
  }

  let wickHigh: number;
  let wickLow: number;
  if (input.side === "RESISTANCE") {
    // Pool extends ABOVE the line — where shorts' stops are
    wickHigh = input.linePrice + offset;
    wickLow = input.linePrice;
  } else {
    // Pool extends BELOW the line — where longs' stops are
    wickHigh = input.linePrice;
    wickLow = input.linePrice - offset;
  }

  const widthPct = (wickHigh - wickLow) / input.currentPrice;

  return {
    wickHigh,
    wickLow,
    centreLine: input.linePrice, // the line itself is one edge of the pool
    widthPct,
    fallbackApplied,
  };
}
