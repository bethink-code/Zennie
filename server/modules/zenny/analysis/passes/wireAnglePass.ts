// Wire angle pass — global to the primary timeframe, not per-level.
//
// Implements zenny_math.docx §1.2 (MeasureWireAngle), §1.3 (Gann brackets),
// §1.5 (SmoothWire). Output lives in passInfo.wireAngle, consumed by the
// Now badge and downstream by the pull/arm/tendency passes.
//
// The wire angle is the spec's first regime gate: trades are only permitted
// when |angle| ≥ 26.25° (RANGING bracket and above). NO_TRADE and
// ACCUMULATION suppress decisions globally.
//
//   angle_deg = atan(pct_change / N) × (180/π)
//     pct_change = (close[0] − close[N-1]) / close[N-1] × 100
//     N = 14 (matches RSI/ROC/ADX standard lookback per spec)
//
// Brackets use |angle|; sign of angle is preserved for trade direction.

import type { Candle } from "../../../../../shared/zennyTypes";
import type { PassRunInput, WireAnglePassConfig } from "./types";

export type GannBracket =
  | "NO_TRADE"
  | "ACCUMULATION"
  | "RANGING"
  | "TRENDING"
  | "BREAKOUT";

export type WireDirection = "up" | "down" | "flat";

export interface WireAnglePassInfo {
  angleDeg: number; // signed
  gannBracket: GannBracket; // based on |angle|
  direction: WireDirection; // sign of angle
  tradePermitted: boolean; // |angle| ≥ 26.25 per spec §2.9 RegimeGuard
  lookback: number; // N
  smoothedClose: number; // smoothed close at right edge
  smoothedCloseNAgo: number; // smoothed close N-1 bars ago
  pctChange: number; // for debugging / Now badge breakdown
}

// Spec-fixed thresholds. These come straight from §1.3 and are not tunables —
// the whole point of normalising by % change is that the bracket math is
// timeframe-invariant. If you change these you've changed the strategy.
const BRACKET_NO_TRADE = 14;
const BRACKET_ACCUMULATION = 26.25;
const BRACKET_RANGING = 45;
const BRACKET_TRENDING = 63.75;

const FLAT_EPSILON_DEG = 0.5; // below this magnitude, direction = "flat"

export function runWireAnglePass(
  input: PassRunInput,
  config: WireAnglePassConfig,
): WireAnglePassInfo | null {
  if (!config.enabled) return null;

  const N = Math.max(2, Math.floor(config.lookbackCandles));
  const smoothed = smoothCloses(input.primaryCandles);

  // Need at least N smoothed values to span the lookback window.
  if (smoothed.length < N) return null;

  const closeNow = smoothed[smoothed.length - 1];
  const closeNAgo = smoothed[smoothed.length - N];

  if (closeNAgo === 0) return null;

  const pctChange = ((closeNow - closeNAgo) / closeNAgo) * 100;
  const slope = pctChange / N;
  const angleDeg = Math.atan(slope) * (180 / Math.PI);

  return {
    angleDeg,
    gannBracket: classifyBracket(angleDeg),
    direction: classifyDirection(angleDeg),
    tradePermitted: Math.abs(angleDeg) >= BRACKET_ACCUMULATION,
    lookback: N,
    smoothedClose: closeNow,
    smoothedCloseNAgo: closeNAgo,
    pctChange,
  };
}

// 5-tap [1,2,3,2,1]/9 kernel — algebraically identical to a 3-period SMA
// applied twice (spec §1.5). Output is shorter than input by 4 (2 each end).
export function smoothCloses(candles: Candle[]): number[] {
  if (candles.length < 5) return [];
  const out: number[] = [];
  for (let i = 2; i < candles.length - 2; i++) {
    out.push(
      (candles[i - 2].close +
        2 * candles[i - 1].close +
        3 * candles[i].close +
        2 * candles[i + 1].close +
        candles[i + 2].close) /
        9,
    );
  }
  return out;
}

export function classifyBracket(angleDeg: number): GannBracket {
  const a = Math.abs(angleDeg);
  if (a < BRACKET_NO_TRADE) return "NO_TRADE";
  if (a < BRACKET_ACCUMULATION) return "ACCUMULATION";
  if (a < BRACKET_RANGING) return "RANGING";
  if (a < BRACKET_TRENDING) return "TRENDING";
  return "BREAKOUT";
}

export function classifyDirection(angleDeg: number): WireDirection {
  if (Math.abs(angleDeg) < FLAT_EPSILON_DEG) return "flat";
  return angleDeg > 0 ? "up" : "down";
}
