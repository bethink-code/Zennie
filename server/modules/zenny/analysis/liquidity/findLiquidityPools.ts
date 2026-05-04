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
  depletionCandles?: Candle[];
}

export function findLiquidityPools(
  input: FindLiquidityPoolsInput,
): LiquidityPoolCandidate[] {
  return findDepletedWickPools(input);
}

function findDepletedWickPools(
  input: FindLiquidityPoolsInput,
): LiquidityPoolCandidate[] {
  const candles = input.candles;
  const depletionCandles = input.depletionCandles ?? candles;
  if (candles.length < 2) return [];

  const ranges = candles.map((c) => c.high - c.low).filter((r) => r > 0);
  if (ranges.length === 0) return [];

  const medianRange = median(ranges);
  const candidates: LiquidityPoolCandidate[] = [];

  // Last candle may still be forming. It can consume older liquidity but
  // should not create a confirmed pool yet.
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
      const remaining = remainingResistanceZone({
        zoneLow: highBody,
        zoneHigh: candle.high,
        sourceIndex,
        sourceOpenTime: candle.openTime,
        depletionCandles,
        sameTimeframe: depletionCandles === candles,
      });
      if (remaining !== null) {
        candidates.push({
          idSeed: `${input.symbol}-${input.timeframe}-wick-res-${sourceIndex}`,
          kind: "pivot_probe",
          side: "RESISTANCE",
          targetPrice: remaining.zoneLow,
          zoneHigh: remaining.zoneHigh,
          zoneLow: remaining.zoneLow,
          sourceIndex,
          sourceOpenTime: candle.openTime,
          touchCount: 1,
        });
      }
    }

    if (
      lowerProbe >= minProbe &&
      lowerProbe / range >= 0.28 &&
      isLocalRangeEdge(candles, sourceIndex, "SUPPORT", 8, 2, 0.0008)
    ) {
      const remaining = remainingSupportZone({
        zoneHigh: lowBody,
        zoneLow: candle.low,
        sourceIndex,
        sourceOpenTime: candle.openTime,
        depletionCandles,
        sameTimeframe: depletionCandles === candles,
      });
      if (remaining !== null) {
        candidates.push({
          idSeed: `${input.symbol}-${input.timeframe}-wick-sup-${sourceIndex}`,
          kind: "pivot_probe",
          side: "SUPPORT",
          targetPrice: remaining.zoneHigh,
          zoneHigh: remaining.zoneHigh,
          zoneLow: remaining.zoneLow,
          sourceIndex,
          sourceOpenTime: candle.openTime,
          touchCount: 1,
        });
      }
    }
  }

  return dedupeCandidates(
    keepBestByPrice(candidates, 0.0008).sort(
      (a, b) => a.sourceIndex - b.sourceIndex,
    ),
  );
}

function remainingResistanceZone(zone: {
    zoneLow: number;
    zoneHigh: number;
    sourceIndex: number;
    sourceOpenTime: number;
    depletionCandles: Candle[];
    sameTimeframe: boolean;
}): { zoneLow: number; zoneHigh: number } | null {
  let remainingLow = zone.zoneLow;
  const candlesToRight = zone.sameTimeframe
    ? zone.depletionCandles.slice(zone.sourceIndex + 1)
    : zone.depletionCandles.filter(
        (candle) => candle.openTime > zone.sourceOpenTime,
      );
  for (const candle of candlesToRight) {
    const high = candle.high;
    if (high >= zone.zoneHigh) return null;
    if (high > remainingLow) remainingLow = high;
  }
  return remainingLow < zone.zoneHigh
    ? { zoneLow: remainingLow, zoneHigh: zone.zoneHigh }
    : null;
}

function remainingSupportZone(zone: {
    zoneLow: number;
    zoneHigh: number;
    sourceIndex: number;
    sourceOpenTime: number;
    depletionCandles: Candle[];
    sameTimeframe: boolean;
}): { zoneLow: number; zoneHigh: number } | null {
  let remainingHigh = zone.zoneHigh;
  const candlesToRight = zone.sameTimeframe
    ? zone.depletionCandles.slice(zone.sourceIndex + 1)
    : zone.depletionCandles.filter(
        (candle) => candle.openTime > zone.sourceOpenTime,
      );
  for (const candle of candlesToRight) {
    const low = candle.low;
    if (low <= zone.zoneLow) return null;
    if (low < remainingHigh) remainingHigh = low;
  }
  return zone.zoneLow < remainingHigh
    ? { zoneLow: zone.zoneLow, zoneHigh: remainingHigh }
    : null;
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
