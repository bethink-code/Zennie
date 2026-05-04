// findBodyPivots - N-bar swing detection on wick extremes, body anchoring.
//
// A swing high pivot is the candle whose wick high marks the local top of
// a leg. Mirror for swing low on wick low. The level line still anchors to
// the candle body extreme: max(open, close) for resistance, min(open, close)
// for support.
//
// Why: liquidity pools live in wick/probe territory. A candle can be the
// literal top of a leg even if a later candle has a higher body close/open.
// Using wicks for identification catches that swing/probe candle; using the
// body for `price` keeps the actionable line at the commitment boundary.

import type { Candle } from "../../../../../shared/zennyTypes";

export type PivotSide = "RESISTANCE" | "SUPPORT";

export interface BodyPivot {
  index: number;
  side: PivotSide;
  price: number; // body extreme: max(open,close) for high, min for low
  wickPrice: number; // wick extreme: candle.high for high, candle.low for low
  candleOpenTime: number;
}

function bodyHigh(c: Candle): number {
  return c.open > c.close ? c.open : c.close;
}

function bodyLow(c: Candle): number {
  return c.open < c.close ? c.open : c.close;
}

export interface FindBodyPivotsInput {
  candles: Candle[];
  n?: number; // bars on each side (default 2 -> 5-bar swing)
}

export function findBodyPivots(input: FindBodyPivotsInput): BodyPivot[] {
  const { candles } = input;
  const n = input.n ?? 2;
  const pivots: BodyPivot[] = [];
  if (candles.length < n * 2 + 1) return pivots;

  for (let i = n; i < candles.length - n; i++) {
    const c = candles[i];

    // Later wins ties. Earlier candles disqualify only with a strictly more
    // extreme wick; later candles disqualify on equal-or-more extreme wicks.
    let isHigh = true;
    let isLow = true;
    for (let j = i - n; j <= i + n; j++) {
      if (j === i) continue;
      const o = candles[j];
      if (j < i) {
        if (o.high > c.high) isHigh = false;
        if (o.low < c.low) isLow = false;
      } else {
        if (o.high >= c.high) isHigh = false;
        if (o.low <= c.low) isLow = false;
      }
      if (!isHigh && !isLow) break;
    }

    if (isHigh) {
      let aggregateBodyHigh = bodyHigh(c);
      let aggregateHigh = c.high;
      for (let j = i - 1; j >= Math.max(0, i - n); j--) {
        if (candles[j].high !== c.high) break;
        aggregateBodyHigh = Math.max(aggregateBodyHigh, bodyHigh(candles[j]));
        aggregateHigh = Math.max(aggregateHigh, candles[j].high);
      }
      pivots.push({
        index: i,
        side: "RESISTANCE",
        price: aggregateBodyHigh,
        wickPrice: aggregateHigh,
        candleOpenTime: c.openTime,
      });
    } else if (isLow) {
      let aggregateBodyLow = bodyLow(c);
      let aggregateLow = c.low;
      for (let j = i - 1; j >= Math.max(0, i - n); j--) {
        if (candles[j].low !== c.low) break;
        aggregateBodyLow = Math.min(aggregateBodyLow, bodyLow(candles[j]));
        aggregateLow = Math.min(aggregateLow, candles[j].low);
      }
      pivots.push({
        index: i,
        side: "SUPPORT",
        price: aggregateBodyLow,
        wickPrice: aggregateLow,
        candleOpenTime: c.openTime,
      });
    }
  }

  return pivots;
}
