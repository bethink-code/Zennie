// detectStructureShift — the market-structure-shift (MSS / CHoCH / BOS) primitive.
//
// "Structure" is the sequence of swing pivots (findBodyPivots). A shift is a
// candle that CLOSES beyond the body level of the most recent reference pivot,
// AFTER a reference index (the sweep):
//
//   direction "up"   : close ABOVE the most recent swing-HIGH (RESISTANCE pivot)
//                      — a bullish break of structure.
//   direction "down" : close BELOW the most recent swing-LOW (SUPPORT pivot)
//                      — a bearish break of structure.
//
// The same primitive expresses BOS and CHoCH/MSS; the caller decides which it
// is by choosing the direction relative to the sweep:
//   reversal shift  = OPPOSITE to the sweep (turning point)
//   continuation    = SAME as the sweep (run-through / BOS)
//
// Body level (pivot.price), not the wick, defines the break — a close beyond
// the commitment boundary, consistent with level/break semantics elsewhere.
//
// Pure function.

import type { Candle } from "../../../../../shared/zennyTypes";
import type { BodyPivot } from "../../analysis/level/findBodyPivots";
import type { ShiftDirection, StructureShift } from "./types";

export interface DetectStructureShiftInput {
  candles: Candle[];
  pivots: BodyPivot[];
  // Look for a break strictly after this candle index (the sweep candle).
  afterIndex: number;
  direction: ShiftDirection;
  // Consider only the most-recent K pivots of the reference side.
  lookbackPivots: number;
}

const NO_SHIFT: StructureShift = {
  shifted: false,
  direction: null,
  brokenPivotIndex: null,
  brokenAtIndex: null,
  displacement: 0,
};

export function detectStructureShift(
  input: DetectStructureShiftInput,
): StructureShift {
  const { candles, pivots, afterIndex, direction, lookbackPivots } = input;
  if (candles.length === 0) return NO_SHIFT;

  // Reference pivot side: an UP shift breaks a prior swing HIGH (RESISTANCE);
  // a DOWN shift breaks a prior swing LOW (SUPPORT).
  const refSide = direction === "up" ? "RESISTANCE" : "SUPPORT";

  // Most-recent reference pivots at or before the sweep, newest first, capped
  // at lookbackPivots — that is the "current structure".
  const refPivots = pivots
    .filter((p) => p.side === refSide && p.index <= afterIndex)
    .sort((a, b) => b.index - a.index)
    .slice(0, Math.max(1, lookbackPivots));
  if (refPivots.length === 0) return NO_SHIFT;

  // The reference level the reversal/continuation must break is the nearest
  // swing in the path of price: for an up break, the LOWEST recent swing high
  // is the easiest to clear and the first structural marker; for a down break,
  // the HIGHEST recent swing low. (Breaking the closest structural level is
  // what flips character.)
  const reference =
    direction === "up"
      ? refPivots.reduce((lo, p) => (p.price < lo.price ? p : lo))
      : refPivots.reduce((hi, p) => (p.price > hi.price ? p : hi));

  // Scan forward from just after the sweep for the first qualifying close.
  const start = Math.max(afterIndex + 1, reference.index + 1);
  for (let i = start; i < candles.length; i++) {
    const close = candles[i].close;
    const broke =
      direction === "up" ? close > reference.price : close < reference.price;
    if (broke) {
      const displacement =
        direction === "up" ? close - reference.price : reference.price - close;
      return {
        shifted: true,
        direction,
        brokenPivotIndex: reference.index,
        brokenAtIndex: i,
        displacement,
      };
    }
  }

  return NO_SHIFT;
}
