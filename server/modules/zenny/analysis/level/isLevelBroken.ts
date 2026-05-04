// isLevelBroken — walk forward from a body pivot's index and return true
// if any subsequent candle's close went past the pivot's body-extreme price.
//
// "Past" means strictly above for a resistance, strictly below for a support.
// Wick excursions don't count — the wick territory is the pool zone where
// stops live, and price testing it without closing past is exactly what the
// pool is for. The pool dies when commitment (a close) crosses the body line.

import type { Candle } from "../../../../../shared/zennyTypes";
import type { BodyPivot } from "./findBodyPivots";

export interface BreakResult {
  broken: boolean;
  breakCandleIndex: number | null;
  breakCandleOpenTime: number | null;
}

export function isLevelBroken(
  candles: Candle[],
  pivot: BodyPivot,
): BreakResult {
  for (let i = pivot.index + 1; i < candles.length; i++) {
    const close = candles[i].close;
    if (pivot.side === "RESISTANCE" && close > pivot.price) {
      return {
        broken: true,
        breakCandleIndex: i,
        breakCandleOpenTime: candles[i].openTime,
      };
    }
    if (pivot.side === "SUPPORT" && close < pivot.price) {
      return {
        broken: true,
        breakCandleIndex: i,
        breakCandleOpenTime: candles[i].openTime,
      };
    }
  }
  return { broken: false, breakCandleIndex: null, breakCandleOpenTime: null };
}
