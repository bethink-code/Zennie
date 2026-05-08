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
//
// Multi-TF: the same computation runs against every analysed timeframe in
// the stack. The primary TF drives the spec's RegimeGuard (tradePermitted).
// Higher timeframes contribute a confluence/conviction signal — captured
// in `agreement` — but never act as a separate gate. The decision module
// can read `agreement.htfConfirms` to size or weight a trade, but the
// permit boundary stays at the primary TF.

import type { Candle, Timeframe } from "../../../../../shared/zennyTypes";
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

// Multi-TF agreement summary. Derived once per run from the per-TF angles
// so the renderer + decision module don't reimplement the comparison logic.
//
// "Aligned" = same sign as primary (flat is treated as neutral and excluded
// from both numerator and denominator). The verdict is HTF-only — primary
// is excluded from `htfConfirms` because the primary IS the thing being
// confirmed.
export interface WireAngleAgreement {
  // Direction match across analysed TFs (primary included).
  matchingDirectionCount: number;
  totalAnalysed: number;
  matchingDirectionRatio: number; // 0..1; 0 if totalAnalysed === 0

  // Of the directionally-aligned TFs, how many ALSO clear |angle|≥26.25?
  // Useful as a conviction multiplier — many TFs in trade-permit territory
  // pulling the same way is a stronger setup than one TF doing it alone.
  alignedTradePermittedCount: number;

  // Weakest bracket among directionally-aligned TFs. If only primary is
  // aligned, this is just primary's bracket. Null when no TF is aligned
  // (primary is flat, or there are no analysed TFs).
  weakestAlignedBracket: GannBracket | null;

  // HTF-only verdict (primary excluded). Drives the conviction signal.
  //   "yes"   = every HTF that has an opinion (non-flat) agrees with primary
  //   "no"    = every opinionated HTF opposes primary
  //   "mixed" = some agree, some oppose, OR no HTFs had data, OR primary is flat
  htfConfirms: "yes" | "mixed" | "no";
}

// Spec-fixed thresholds. These come straight from §1.3 and are not tunables —
// the whole point of normalising by % change is that the bracket math is
// timeframe-invariant. If you change these you've changed the strategy.
const BRACKET_NO_TRADE = 14;
const BRACKET_ACCUMULATION = 26.25;
const BRACKET_RANGING = 45;
const BRACKET_TRENDING = 63.75;

const FLAT_EPSILON_DEG = 0.5; // below this magnitude, direction = "flat"

// Bracket ordering for "weakest aligned" lookup. Lower = weaker.
const BRACKET_RANK: Record<GannBracket, number> = {
  NO_TRADE: 0,
  ACCUMULATION: 1,
  RANGING: 2,
  TRENDING: 3,
  BREAKOUT: 4,
};

export interface WireAnglePassResult {
  primary: WireAnglePassInfo;
  // Sparse map — only TFs with enough candles for the lookback are present.
  perTimeframe: Partial<Record<Timeframe, WireAnglePassInfo>>;
  agreement: WireAngleAgreement;
}

export function runWireAnglePass(
  input: PassRunInput,
  config: WireAnglePassConfig,
): WireAnglePassResult | null {
  if (!config.enabled) return null;

  const N = Math.max(2, Math.floor(config.lookbackCandles));

  const primary = computeAngleFor(input.primaryCandles, N);
  if (primary === null) return null;

  // Per-TF: same computation against each analysed TF's candle series.
  // A TF with too few candles is just absent from the map (sparse).
  const perTimeframe: Partial<Record<Timeframe, WireAnglePassInfo>> = {};
  for (const [tf, candles] of input.perTfCandles) {
    const info =
      tf === input.primaryTimeframe ? primary : computeAngleFor(candles, N);
    if (info !== null) perTimeframe[tf] = info;
  }

  const agreement = computeAgreement(
    primary,
    input.primaryTimeframe,
    perTimeframe,
  );

  return { primary, perTimeframe, agreement };
}

// Pure helper: candles + lookback → WireAnglePassInfo or null when there
// aren't enough smoothed values for the lookback window. Extracted so the
// per-TF loop can reuse the exact same logic that drives the primary.
export function computeAngleFor(
  candles: Candle[],
  N: number,
): WireAnglePassInfo | null {
  const smoothed = smoothCloses(candles);
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

export function computeAgreement(
  primary: WireAnglePassInfo,
  primaryTf: Timeframe,
  perTimeframe: Partial<Record<Timeframe, WireAnglePassInfo>>,
): WireAngleAgreement {
  const entries = Object.entries(perTimeframe) as Array<
    [Timeframe, WireAnglePassInfo]
  >;
  const totalAnalysed = entries.length;

  let matchingDirectionCount = 0;
  let alignedTradePermittedCount = 0;
  let weakestAlignedBracket: GannBracket | null = null;

  for (const [, info] of entries) {
    if (info.direction === "flat" || primary.direction === "flat") continue;
    if (info.direction !== primary.direction) continue;

    matchingDirectionCount += 1;
    if (info.tradePermitted) alignedTradePermittedCount += 1;
    if (
      weakestAlignedBracket === null ||
      BRACKET_RANK[info.gannBracket] < BRACKET_RANK[weakestAlignedBracket]
    ) {
      weakestAlignedBracket = info.gannBracket;
    }
  }

  // HTF verdict. Examine every TF other than primary, ignoring flats
  // (no-opinion). If every opinionated HTF agrees with primary → "yes".
  // If every opinionated HTF opposes → "no". Anything else (including
  // "no HTF had data" or "primary itself is flat") → "mixed".
  let htfConfirms: WireAngleAgreement["htfConfirms"] = "mixed";
  if (primary.direction !== "flat") {
    let agreeCount = 0;
    let opposeCount = 0;
    for (const [tf, info] of entries) {
      if (tf === primaryTf) continue;
      if (info.direction === "flat") continue;
      if (info.direction === primary.direction) agreeCount += 1;
      else opposeCount += 1;
    }
    if (agreeCount > 0 && opposeCount === 0) htfConfirms = "yes";
    else if (opposeCount > 0 && agreeCount === 0) htfConfirms = "no";
  }

  return {
    matchingDirectionCount,
    totalAnalysed,
    matchingDirectionRatio:
      totalAnalysed === 0 ? 0 : matchingDirectionCount / totalAnalysed,
    alignedTradePermittedCount,
    weakestAlignedBracket,
    htfConfirms,
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
