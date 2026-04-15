import { describe, expect, it } from "vitest";
import { aggregateDepthIntoBuckets } from "./aggregateDepthIntoBuckets";
import type { RawOrderBookDepth } from "./types";

function makeRaw(bids: Array<[number, number]>, asks: Array<[number, number]>): RawOrderBookDepth {
  return {
    symbol: "BTCUSDT",
    lastUpdateId: 1,
    fetchedAtMs: 1_700_000_000_000,
    bids,
    asks,
  };
}

describe("aggregateDepthIntoBuckets", () => {
  it("bins flat depth into uniform buckets", () => {
    const raw = makeRaw(
      [
        [99, 1],
        [98, 1],
      ],
      [
        [101, 1],
        [102, 1],
      ],
    );
    const out = aggregateDepthIntoBuckets({
      raw,
      priceLow: 95,
      priceHigh: 105,
      bucketCount: 10,
    });
    expect(out.buckets.length).toBe(10);
    expect(out.buckets.every((b) => b.priceHigh - b.priceLow === 1)).toBe(true);
    expect(out.midPrice).toBe(100);
  });

  it("concentrates a wall into the bucket containing it", () => {
    const raw = makeRaw(
      [
        [89, 100], // big bid wall at $89
        [88, 1],
      ],
      [[91, 1]],
    );
    const out = aggregateDepthIntoBuckets({
      raw,
      priceLow: 80,
      priceHigh: 100,
      bucketCount: 20,
    });
    // $89 falls into bucket index 9 (priceLow 89, priceHigh 90)
    const wallBucket = out.buckets[9];
    expect(wallBucket.priceLow).toBe(89);
    expect(wallBucket.bidSizeUsd).toBe(89 * 100);
    expect(wallBucket.totalSizeUsd).toBe(89 * 100);
    expect(out.maxBucketSizeUsd).toBe(89 * 100);
  });

  it("drops levels outside the price range", () => {
    const raw = makeRaw(
      [
        [50, 1000], // way below range — should be ignored
        [99, 1],
      ],
      [
        [101, 1],
        [200, 1000], // way above range — ignored
      ],
    );
    const out = aggregateDepthIntoBuckets({
      raw,
      priceLow: 95,
      priceHigh: 105,
      bucketCount: 10,
    });
    const totalUsd = out.buckets.reduce((s, b) => s + b.totalSizeUsd, 0);
    // Only the $99 bid and $101 ask should count
    expect(totalUsd).toBe(99 + 101);
  });

  it("computes USD size as price × qty", () => {
    const raw = makeRaw([[100, 5]], [[101, 3]]);
    const out = aggregateDepthIntoBuckets({
      raw,
      priceLow: 99,
      priceHigh: 102,
      bucketCount: 3,
    });
    // $100 bid: bucket 1 ($100..101), 100 × 5 = $500
    // $101 ask: bucket 2 ($101..102), 101 × 3 = $303
    expect(out.buckets[1].bidSizeUsd).toBe(500);
    expect(out.buckets[2].askSizeUsd).toBe(303);
  });

  it("keeps bid and ask sizes separate within the same bucket", () => {
    const raw = makeRaw([[100.4, 2]], [[100.6, 3]]);
    const out = aggregateDepthIntoBuckets({
      raw,
      priceLow: 100,
      priceHigh: 101,
      bucketCount: 1, // one bucket containing both
    });
    expect(out.buckets[0].bidSizeUsd).toBe(100.4 * 2);
    expect(out.buckets[0].askSizeUsd).toBe(100.6 * 3);
    expect(out.buckets[0].totalSizeUsd).toBe(100.4 * 2 + 100.6 * 3);
  });

  it("returns empty bucket array on degenerate price range", () => {
    const raw = makeRaw([[100, 1]], [[101, 1]]);
    const out = aggregateDepthIntoBuckets({
      raw,
      priceLow: 100,
      priceHigh: 100,
      bucketCount: 10,
    });
    expect(out.buckets).toEqual([]);
    expect(out.maxBucketSizeUsd).toBe(0);
  });

  it("computes mid price from best bid + best ask", () => {
    const raw = makeRaw(
      [
        [99.8, 1], // best bid
        [99.5, 1],
      ],
      [
        [100.2, 1], // best ask
        [100.5, 1],
      ],
    );
    const out = aggregateDepthIntoBuckets({
      raw,
      priceLow: 90,
      priceHigh: 110,
      bucketCount: 20,
    });
    expect(out.midPrice).toBeCloseTo(100, 5);
  });
});
