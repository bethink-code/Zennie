// aggregateDepthIntoBuckets — pure function that bins a raw Binance
// depth snapshot into N price buckets across a given price range.
//
// Why bucketing: the raw snapshot has hundreds or thousands of price
// levels with tiny quantities each. The eye can't read that on a
// chart. Bucketing collapses the ladder into a small number of bands
// that render as a horizontal-stripe gradient on the canvas, where
// opacity = relative size. Fat stripes are walls.
//
// Pure: no I/O, no clock, no randomness. Same input → same output.
// Testable in isolation. The only knob is bucketCount.

import type {
  DepthBucket,
  DepthSnapshot,
  RawOrderBookDepth,
} from "./types";

export interface AggregateDepthInput {
  raw: RawOrderBookDepth;
  // The price range to bin into. Usually matches the chart's visible
  // Y-range so the gradient aligns with candles. Levels outside this
  // range are dropped (not clamped — they belong to a different
  // viewport and would distort the bucket sizing).
  priceLow: number;
  priceHigh: number;
  // Number of buckets to split the range into. 80 is a reasonable
  // default for a 540px chart — gives ~7px per stripe.
  bucketCount: number;
}

export function aggregateDepthIntoBuckets(
  input: AggregateDepthInput,
): DepthSnapshot {
  const { raw, priceLow, priceHigh, bucketCount } = input;

  if (priceHigh <= priceLow || bucketCount < 1) {
    return {
      symbol: raw.symbol,
      fetchedAtMs: raw.fetchedAtMs,
      midPrice: midPriceOf(raw),
      priceLow,
      priceHigh,
      buckets: [],
      maxBucketSizeUsd: 0,
    };
  }

  const bucketStep = (priceHigh - priceLow) / bucketCount;
  const buckets: DepthBucket[] = [];
  for (let i = 0; i < bucketCount; i++) {
    buckets.push({
      priceLow: priceLow + i * bucketStep,
      priceHigh: priceLow + (i + 1) * bucketStep,
      bidSizeUsd: 0,
      askSizeUsd: 0,
      totalSizeUsd: 0,
    });
  }

  // Bin bids
  for (const [price, qty] of raw.bids) {
    if (price < priceLow || price >= priceHigh) continue;
    const idx = Math.min(
      bucketCount - 1,
      Math.floor((price - priceLow) / bucketStep),
    );
    const sizeUsd = price * qty;
    buckets[idx].bidSizeUsd += sizeUsd;
    buckets[idx].totalSizeUsd += sizeUsd;
  }

  // Bin asks
  for (const [price, qty] of raw.asks) {
    if (price < priceLow || price >= priceHigh) continue;
    const idx = Math.min(
      bucketCount - 1,
      Math.floor((price - priceLow) / bucketStep),
    );
    const sizeUsd = price * qty;
    buckets[idx].askSizeUsd += sizeUsd;
    buckets[idx].totalSizeUsd += sizeUsd;
  }

  let maxBucketSizeUsd = 0;
  for (const b of buckets) {
    if (b.totalSizeUsd > maxBucketSizeUsd) maxBucketSizeUsd = b.totalSizeUsd;
  }

  return {
    symbol: raw.symbol,
    fetchedAtMs: raw.fetchedAtMs,
    midPrice: midPriceOf(raw),
    priceLow,
    priceHigh,
    buckets,
    maxBucketSizeUsd,
  };
}

function midPriceOf(raw: RawOrderBookDepth): number {
  const bestBid = raw.bids.length > 0 ? raw.bids[0][0] : 0;
  const bestAsk = raw.asks.length > 0 ? raw.asks[0][0] : 0;
  if (bestBid > 0 && bestAsk > 0) return (bestBid + bestAsk) / 2;
  return bestBid > 0 ? bestBid : bestAsk;
}
