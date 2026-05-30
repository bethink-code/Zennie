import type { Candle, Timeframe } from "../../../../../shared/zennyTypes";
import type { PivotSide } from "../level/findBodyPivots";

export type LiquidityPoolKind =
  | "pivot_probe"
  | "equal_extremes"
  | "round_number"
  | "session_extreme";

export interface LiquidityPoolCandidate {
  idSeed: string;
  kind: LiquidityPoolKind;
  side: PivotSide;
  targetPrice: number;
  zoneHigh: number;
  zoneLow: number;
  sourceIndex: number;
  sourceOpenTime: number;
  touchCount: number;
}

export interface FindLiquidityPoolsInput {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
}

// findLiquidityPools — pure DETECTOR. Identifies where wick-probe liquidity
// pools are born, at their FULL zone (wick extreme → body line). It does NOT
// decide whether a pool is still alive — depletion/sweep/death is the lifecycle
// concern of checkPoolAliveness, run downstream against the trading-TF candles.
// (Earlier this function shrank and deleted pools as later price consumed them,
// which discarded the very sweep events the strategy needs to fade.)
export function findLiquidityPools(
  input: FindLiquidityPoolsInput,
): LiquidityPoolCandidate[] {
  const candles = input.candles;
  if (candles.length < 2) return [];

  const ranges = candles.map((c) => c.high - c.low).filter((r) => r > 0);
  if (ranges.length === 0) return [];

  const medianRange = median(ranges);
  const candidates: LiquidityPoolCandidate[] = [];

  // Last candle may still be forming — it can sweep older pools (a lifecycle
  // concern) but should not birth a confirmed pool yet.
  for (let sourceIndex = candles.length - 2; sourceIndex >= 0; sourceIndex--) {
    const candle = candles[sourceIndex];
    const range = candle.high - candle.low;
    if (range <= 0) continue;

    const highBody = bodyHigh(candle);
    const lowBody = bodyLow(candle);
    const upperProbe = candle.high - highBody;
    const lowerProbe = lowBody - candle.low;
    const minProbe = Math.max(medianRange * 0.2, candle.close * 0.0008);

    if (
      upperProbe >= minProbe &&
      upperProbe / range >= 0.28 &&
      isLocalRangeEdge(candles, sourceIndex, "RESISTANCE", 8, 2, 0.0008)
    ) {
      // Full zone: body top (the commitment line) → wick top (the extreme
      // where stop liquidity rests).
      candidates.push({
        idSeed: `${input.symbol}-${input.timeframe}-wick-res-${sourceIndex}`,
        kind: "pivot_probe",
        side: "RESISTANCE",
        targetPrice: highBody,
        zoneHigh: candle.high,
        zoneLow: highBody,
        sourceIndex,
        sourceOpenTime: candle.openTime,
        touchCount: 1,
      });
    }

    if (
      lowerProbe >= minProbe &&
      lowerProbe / range >= 0.28 &&
      isLocalRangeEdge(candles, sourceIndex, "SUPPORT", 8, 2, 0.0008)
    ) {
      // Full zone: wick bottom (the extreme) → body bottom (the line).
      candidates.push({
        idSeed: `${input.symbol}-${input.timeframe}-wick-sup-${sourceIndex}`,
        kind: "pivot_probe",
        side: "SUPPORT",
        targetPrice: lowBody,
        zoneHigh: lowBody,
        zoneLow: candle.low,
        sourceIndex,
        sourceOpenTime: candle.openTime,
        touchCount: 1,
      });
    }
  }

  return dedupeCandidates(
    keepBestByPrice(candidates, 0.0008).sort(
      (a, b) => a.sourceIndex - b.sourceIndex,
    ),
  );
}

function isLocalRangeEdge(
  candles: Candle[],
  index: number,
  side: PivotSide,
  lookback: number,
  lookahead: number,
  tolerancePct = 0,
): boolean {
  const candle = candles[index];
  if (!candle) return false;
  const from = Math.max(0, index - lookback);
  const to = Math.min(candles.length - 1, index + lookahead);
  for (let i = from; i <= to; i++) {
    if (i === index) continue;
    if (
      side === "RESISTANCE" &&
      candles[i].high > candle.high &&
      Math.abs(candles[i].high - candle.high) / candle.high > tolerancePct
    ) {
      return false;
    }
    if (
      side === "SUPPORT" &&
      candles[i].low < candle.low &&
      Math.abs(candles[i].low - candle.low) / candle.low > tolerancePct
    ) {
      return false;
    }
  }
  return true;
}

function bodyHigh(c: Candle): number {
  return c.open > c.close ? c.open : c.close;
}

function bodyLow(c: Candle): number {
  return c.open < c.close ? c.open : c.close;
}

function keepBestByPrice(
  candidates: LiquidityPoolCandidate[],
  tolerancePct: number,
): LiquidityPoolCandidate[] {
  const sorted = [...candidates].sort((a, b) => {
    const touches = b.touchCount - a.touchCount;
    if (touches !== 0) return touches;
    return b.sourceIndex - a.sourceIndex;
  });
  const accepted: LiquidityPoolCandidate[] = [];
  for (const candidate of sorted) {
    const overlaps = accepted.some((existing) => {
      if (existing.side !== candidate.side) return false;
      const mid = (existing.targetPrice + candidate.targetPrice) / 2;
      return (
        mid > 0 &&
        Math.abs(existing.targetPrice - candidate.targetPrice) / mid <=
          tolerancePct
      );
    });
    if (!overlaps) accepted.push(candidate);
  }
  return accepted.sort((a, b) => a.sourceIndex - b.sourceIndex);
}

function dedupeCandidates(
  candidates: LiquidityPoolCandidate[],
): LiquidityPoolCandidate[] {
  const seen = new Set<string>();
  const out: LiquidityPoolCandidate[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.kind}-${candidate.side}-${Math.round(candidate.targetPrice * 100)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
