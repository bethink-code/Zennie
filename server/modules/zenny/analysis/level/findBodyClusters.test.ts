import { describe, expect, it } from "vitest";
import type { Candle } from "../../../../../shared/zennyTypes";
import { findBodyClusters } from "./findBodyClusters";

function c(i: number, open: number, high: number, low: number, close: number): Candle {
  return {
    openTime: i,
    closeTime: i + 1,
    open,
    high,
    low,
    close,
    volume: 1,
  };
}

describe("findBodyClusters", () => {
  it("finds density windows that start after the first sorted price", () => {
    const candles = [
      c(0, 100, 101, 99, 99),
      c(1, 100.4, 101, 99, 99),
      c(2, 100.8, 101, 99, 99),
      c(3, 101.2, 102, 99, 99),
    ];

    const clusters = findBodyClusters({
      candles,
      tolerancePct: 0.008,
      minTouches: 3,
    }).filter((cluster) => cluster.side === "RESISTANCE");

    expect(clusters).toEqual([
      {
        price: 100.8,
        side: "RESISTANCE",
        touchCount: 3,
        firstTouchIndex: 1,
        lastTouchIndex: 3,
        firstTouchOpenTime: 1,
        lastTouchOpenTime: 3,
      },
    ]);
  });

  it("keeps separate non-overlapping dense zones on the same side", () => {
    const candles = [
      c(0, 100, 101, 90, 99),
      c(1, 100.2, 101, 90, 99),
      c(2, 100.3, 101, 90, 99),
      c(3, 106, 107, 90, 99),
      c(4, 106.2, 107, 90, 99),
      c(5, 106.3, 107, 90, 99),
    ];

    const clusters = findBodyClusters({
      candles,
      tolerancePct: 0.004,
      minTouches: 3,
    }).filter((cluster) => cluster.side === "RESISTANCE");

    expect(clusters.map((cluster) => cluster.price)).toEqual([100.2, 106.2]);
    expect(clusters.map((cluster) => cluster.touchCount)).toEqual([3, 3]);
  });

  it("selects the denser overlapping zone instead of emitting duplicates", () => {
    const candles = [
      c(0, 100, 101, 90, 99),
      c(1, 100.1, 101, 90, 99),
      c(2, 100.2, 101, 90, 99),
      c(3, 100.35, 101, 90, 99),
      c(4, 100.45, 101, 90, 99),
    ];

    const clusters = findBodyClusters({
      candles,
      tolerancePct: 0.005,
      minTouches: 3,
    }).filter((cluster) => cluster.side === "RESISTANCE");

    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toMatchObject({
      price: 100.2,
      touchCount: 5,
      firstTouchIndex: 0,
      lastTouchIndex: 4,
    });
  });
});
