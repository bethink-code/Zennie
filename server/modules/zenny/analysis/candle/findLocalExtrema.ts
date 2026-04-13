// FindLocalExtrema — swing high / swing low detection.
// N=7 candles each side (research-backed for 1H BTC; same parameter applies to higher TFs).
// STRICT inequality — ties excluded to prevent adjacent double-pivots.
//
// ⚠ DESIGN DECISION (session 2026-04-13, refined):
// We use a HYBRID: wick-based DETECTION + body-based PRICE STORAGE.
//
// - Detection uses candle.high / candle.low (LuxAlgo / Williams Fractals /
//   Pine `ta.pivothigh` / `ta.pivotlow` semantics). This catches the same
//   pivot set TA practitioners expect — including dramatic rejection
//   candles with tall wicks and small bodies. These ARE swing pivots.
// - The stored pivot.price is the body extreme of the swing candle:
//     swing_high → max(open, close)
//     swing_low  → min(open, close)
//   This is the price participants committed to before the wick rejection.
//   Order block / SMC methodology draws the level at the body, not the wick.
//
// First attempt was body-based detection (which dropped tall-wick rejection
// candles entirely and looked wrong). Second iteration corrected to this
// hybrid: same pivot set as wick-based, line drawn at body.
//
// See zenny_level_definition.md for the full reasoning.

import type { Candle } from "../../../../../shared/zennyTypes";

export interface SwingExtremum {
  index: number; // index into the input array
  candleOpenTime: number; // ms epoch
  price: number; // body extreme of the swing candle (NOT the wick)
  wickPrice: number; // wick extreme (high for swing_high, low for swing_low) — kept for diagnostics
  type: "swing_high" | "swing_low";
}

export interface FindLocalExtremaInput {
  candles: Candle[];
  n?: number; // candles each side; default 7
}

function bodyTop(c: Candle): number {
  return Math.max(c.open, c.close);
}
function bodyBottom(c: Candle): number {
  return Math.min(c.open, c.close);
}

export function findLocalExtrema(
  input: FindLocalExtremaInput,
): SwingExtremum[] {
  const N = input.n ?? 7;
  const candles = input.candles;
  const result: SwingExtremum[] = [];

  for (let i = N; i < candles.length - N; i++) {
    if (isSwingHigh(candles, i, N)) {
      result.push({
        index: i,
        candleOpenTime: candles[i].openTime,
        price: bodyTop(candles[i]), // body for line drawing
        wickPrice: candles[i].high, // wick for diagnostics
        type: "swing_high",
      });
    }
    if (isSwingLow(candles, i, N)) {
      result.push({
        index: i,
        candleOpenTime: candles[i].openTime,
        price: bodyBottom(candles[i]),
        wickPrice: candles[i].low,
        type: "swing_low",
      });
    }
  }

  return result;
}

// STRICT inequality on WICK extremes — same as Pine's ta.pivothigh.
// This is the pivot DETECTION rule. The price we store is body-based (above).
export function isSwingHigh(candles: Candle[], i: number, N: number): boolean {
  if (i < N || i > candles.length - N - 1) return false;
  const pivot = candles[i].high;
  for (let j = i - N; j <= i + N; j++) {
    if (j === i) continue;
    if (candles[j].high >= pivot) return false;
  }
  return true;
}

export function isSwingLow(candles: Candle[], i: number, N: number): boolean {
  if (i < N || i > candles.length - N - 1) return false;
  const pivot = candles[i].low;
  for (let j = i - N; j <= i + N; j++) {
    if (j === i) continue;
    if (candles[j].low <= pivot) return false;
  }
  return true;
}
