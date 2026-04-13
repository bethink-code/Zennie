// FindLocalExtrema — swing high / swing low detection across a candle window.
//
// HYBRID model (see zenny_level_definition.md memory, Phase 2 refinement):
//   - Detection uses candle.high / candle.low via isSwingHigh / isSwingLow
//     (Pine ta.pivothigh / ta.pivotlow / Williams Fractals semantics)
//   - Stored pivot.price is the CLOSE of the swing candle — NOT the body top
//     or wick high. This is a Phase 2 refinement: the user's actual method
//     ("draw through the CLOSE of that candle") and matches SMC / order-block
//     rendering where the close represents where the market agreed at the
//     pivot moment.
//   - wickPrice field still carries the wick extreme for diagnostics.
//
// N=7 candles each side default. STRICT inequality — ties excluded.
// Optional follow-through filter: reject pivots where price didn't reverse
// by at least minReversalAtrMultiple × ATR within the next N candles.
// Pure function.

import type { Candle } from "../../../../../shared/zennyTypes";
import { isSwingHigh } from "./isSwingHigh";
import { isSwingLow } from "./isSwingLow";
import { measureFollowThrough, computeAtr14 } from "./measureFollowThrough";

export interface SwingExtremum {
  index: number;
  candleOpenTime: number;
  price: number; // close of the swing candle (what gets drawn)
  wickPrice: number; // wick extreme (high for swing_high, low for swing_low)
  type: "swing_high" | "swing_low";
}

export interface FindLocalExtremaInput {
  candles: Candle[];
  n?: number;
  // Optional follow-through filter. If set, pivots are only kept if the
  // subsequent reversal exceeded this multiple of ATR within lookaheadCandles.
  minReversalAtrMultiple?: number; // e.g. 2.5 for swing trading
  lookaheadCandles?: number; // e.g. 5
}

export function findLocalExtrema(
  input: FindLocalExtremaInput,
): SwingExtremum[] {
  const N = input.n ?? 7;
  const candles = input.candles;
  const result: SwingExtremum[] = [];

  // Compute ATR once per call if the follow-through filter is active
  const filterActive = input.minReversalAtrMultiple !== undefined;
  const atr = filterActive ? computeAtr14(candles, 14) : 0;

  for (let i = N; i < candles.length - N; i++) {
    if (isSwingHigh(candles, i, N)) {
      const pivot: SwingExtremum = {
        index: i,
        candleOpenTime: candles[i].openTime,
        price: candles[i].close, // CLOSE, not body top or wick
        wickPrice: candles[i].high,
        type: "swing_high",
      };
      if (!filterActive || passesFollowThroughFilter(pivot, candles, atr, input)) {
        result.push(pivot);
      }
    }
    if (isSwingLow(candles, i, N)) {
      const pivot: SwingExtremum = {
        index: i,
        candleOpenTime: candles[i].openTime,
        price: candles[i].close, // CLOSE, not body bottom or wick
        wickPrice: candles[i].low,
        type: "swing_low",
      };
      if (!filterActive || passesFollowThroughFilter(pivot, candles, atr, input)) {
        result.push(pivot);
      }
    }
  }

  return result;
}

function passesFollowThroughFilter(
  pivot: SwingExtremum,
  candles: Candle[],
  atr: number,
  input: FindLocalExtremaInput,
): boolean {
  if (atr <= 0) return true; // ATR unavailable — fall through, accept the pivot
  const minMultiple = input.minReversalAtrMultiple ?? 2.5;
  const lookahead = input.lookaheadCandles ?? 5;
  const followThrough = measureFollowThrough({
    candles,
    pivotIndex: pivot.index,
    pivotType: pivot.type,
    lookaheadCandles: lookahead,
    atr,
  });
  return (
    followThrough.reversalAsAtrMultiple !== null &&
    followThrough.reversalAsAtrMultiple >= minMultiple
  );
}
