// findBodyClusters — horizontal-cluster identification.
//
// Different identification method to findBodyPivots. A "cluster" is a price
// where many candle bodies have stopped (close or open landed there) within
// a tolerance band, regardless of whether any single candle is a strict
// local extremum.
//
// Why: some prices are tested four or five times across a window without
// any single candle forming a clean N-bar swing pivot. The eye sees the
// repeated rejections; an N-bar pivot detector misses them. This pass adds
// those prices as separate level candidates, marked with source="cluster"
// so the renderer/inspector can tell them apart from swing pivots.
//
// Algorithm: collect every candle's body extremes (one per side per
// candle), sort, generate every bounded density window whose full price
// span fits inside tolerance, then greedily keep the densest/tightest
// non-overlapping zones. This is deliberately closer to 1D DBSCAN/zone
// selection than the old anchor-and-jump loop: a valid cluster can start
// anywhere, not only at the first unconsumed sorted price.

import type { Candle } from "../../../../../shared/zennyTypes";

export type ClusterSide = "RESISTANCE" | "SUPPORT";

export interface BodyCluster {
  price: number;
  side: ClusterSide;
  touchCount: number; // distinct candle indexes
  firstTouchIndex: number;
  lastTouchIndex: number;
  firstTouchOpenTime: number;
  lastTouchOpenTime: number;
}

function bodyHigh(c: Candle): number {
  return c.open > c.close ? c.open : c.close;
}
function bodyLow(c: Candle): number {
  return c.open < c.close ? c.open : c.close;
}

export interface FindBodyClustersInput {
  candles: Candle[];
  tolerancePct?: number; // default 0.004 (0.4%)
  minTouches?: number; // default 3
}

export function findBodyClusters(
  input: FindBodyClustersInput,
): BodyCluster[] {
  const candles = input.candles;
  const tolerancePct = input.tolerancePct ?? 0.004;
  const minTouches = input.minTouches ?? 3;
  if (candles.length === 0) return [];

  return [
    ...clusterOneSide(candles, "RESISTANCE", tolerancePct, minTouches),
    ...clusterOneSide(candles, "SUPPORT", tolerancePct, minTouches),
  ];
}

function clusterOneSide(
  candles: Candle[],
  side: ClusterSide,
  tolerancePct: number,
  minTouches: number,
): BodyCluster[] {
  const extreme = side === "RESISTANCE" ? bodyHigh : bodyLow;
  const points: ClusterPoint[] = candles.map(
    (c, i) => ({ price: extreme(c), index: i }),
  );
  points.sort((a, b) => a.price - b.price);

  const candidates: ClusterCandidate[] = [];
  for (let start = 0; start < points.length; start++) {
    const indexes = new Set<number>();
    for (let end = start; end < points.length; end++) {
      const window = points.slice(start, end + 1);
      if (!withinToleranceWindow(window, tolerancePct)) break;

      indexes.add(points[end].index);
      if (indexes.size < minTouches) continue;

      candidates.push({
        start,
        end,
        prices: window.map((p) => p.price),
        indexes: [...indexes],
        spanPct: spanPct(window),
      });
    }
  }

  candidates.sort((a, b) => {
    const touchDelta = b.indexes.length - a.indexes.length;
    if (touchDelta !== 0) return touchDelta;
    const spanDelta = a.spanPct - b.spanPct;
    if (spanDelta !== 0) return spanDelta;
    return lastIndex(b) - lastIndex(a);
  });

  const accepted: ClusterCandidate[] = [];
  for (const candidate of candidates) {
    if (
      accepted.some((existing) =>
        priceWindowsOverlap(candidate, existing, points, tolerancePct),
      )
    ) {
      continue;
    }
    accepted.push(candidate);
  }

  return accepted
    .sort((a, b) => firstIndex(a) - firstIndex(b))
    .map((candidate) => toBodyCluster(candidate, candles, side));
}

interface ClusterPoint {
  price: number;
  index: number;
}

interface ClusterCandidate {
  start: number;
  end: number;
  prices: number[];
  indexes: number[];
  spanPct: number;
}

function withinToleranceWindow(
  points: ClusterPoint[],
  tolerancePct: number,
): boolean {
  if (points.length === 0) return false;
  return spanPct(points) <= tolerancePct;
}

function spanPct(points: ClusterPoint[]): number {
  if (points.length <= 1) return 0;
  const low = points[0].price;
  const high = points[points.length - 1].price;
  const mid = (low + high) / 2;
  return mid > 0 ? (high - low) / mid : 0;
}

function priceWindowsOverlap(
  a: ClusterCandidate,
  b: ClusterCandidate,
  points: ClusterPoint[],
  tolerancePct: number,
): boolean {
  const aLow = points[a.start].price;
  const aHigh = points[a.end].price;
  const bLow = points[b.start].price;
  const bHigh = points[b.end].price;
  if (aHigh < bLow) {
    const mid = (aHigh + bLow) / 2;
    return mid > 0 && (bLow - aHigh) / mid <= tolerancePct;
  }
  if (bHigh < aLow) {
    const mid = (bHigh + aLow) / 2;
    return mid > 0 && (aLow - bHigh) / mid <= tolerancePct;
  }
  return true;
}

function toBodyCluster(
  candidate: ClusterCandidate,
  candles: Candle[],
  side: ClusterSide,
): BodyCluster {
  const sortedPrices = [...candidate.prices].sort((a, b) => a - b);
  const median = sortedPrices[Math.floor(sortedPrices.length / 2)];
  const sortedIndexes = [...candidate.indexes].sort((a, b) => a - b);
  const first = sortedIndexes[0];
  const last = sortedIndexes[sortedIndexes.length - 1];

  return {
    price: median,
    side,
    touchCount: sortedIndexes.length,
    firstTouchIndex: first,
    lastTouchIndex: last,
    firstTouchOpenTime: candles[first].openTime,
    lastTouchOpenTime: candles[last].openTime,
  };
}

function firstIndex(candidate: ClusterCandidate): number {
  return Math.min(...candidate.indexes);
}

function lastIndex(candidate: ClusterCandidate): number {
  return Math.max(...candidate.indexes);
}
