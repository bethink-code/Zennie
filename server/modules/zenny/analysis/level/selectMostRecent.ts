// selectMostRecent — given a list of swing extrema (from findLocalExtrema),
// return the N most recent highs and N most recent lows. Used to prune the
// per-TF candidate set to just the handful of pivots a human would draw.
//
// Right-to-left scan semantics: sort by pivot index descending, take the
// first N highs and first N lows encountered. Pure.

import type { SwingExtremum } from "../candle/findLocalExtrema";

export interface SelectMostRecentInput {
  extrema: SwingExtremum[];
  perSide?: number; // default 2 — "the most recent 2 swings per side per TF"
}

export function selectMostRecent(
  input: SelectMostRecentInput,
): SwingExtremum[] {
  const perSide = input.perSide ?? 2;
  // Sort descending by index (most recent first)
  const sorted = [...input.extrema].sort((a, b) => b.index - a.index);

  const highs: SwingExtremum[] = [];
  const lows: SwingExtremum[] = [];
  for (const e of sorted) {
    if (e.type === "swing_high" && highs.length < perSide) {
      highs.push(e);
    } else if (e.type === "swing_low" && lows.length < perSide) {
      lows.push(e);
    }
    if (highs.length >= perSide && lows.length >= perSide) break;
  }

  // Return in original (chronological) order so the consumer doesn't have
  // to think about sort direction. The caller can always re-sort.
  return [...highs, ...lows].sort((a, b) => a.index - b.index);
}
