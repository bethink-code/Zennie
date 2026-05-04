import { describe, expect, it } from "vitest";
import type { Candle } from "../../../../../shared/zennyTypes";
import { findBodyPivots } from "./findBodyPivots";

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

describe("findBodyPivots", () => {
  it("uses wick extremes to identify leg-top pivots and body extremes for the line", () => {
    const candles = [
      c(0, 8, 9, 7, 8),
      c(1, 9, 100, 8, 9),
      c(2, 10, 11, 9, 10),
      c(3, 8, 9, 7, 8),
      c(4, 7, 8, 6, 7),
    ];

    expect(findBodyPivots({ candles, n: 1 })).toEqual([
      {
        index: 1,
        side: "RESISTANCE",
        price: 9,
        wickPrice: 100,
        candleOpenTime: 1,
      },
    ]);
  });

  it("lets the later candle win wick ties but keeps the strongest tied body anchor", () => {
    const candles = [
      c(0, 8, 9, 7, 8),
      c(1, 9, 15, 8, 10),
      c(2, 10, 15, 7, 8),
      c(3, 7, 8, 6, 7),
    ];

    expect(findBodyPivots({ candles, n: 1 })).toEqual([
      {
        index: 2,
        side: "RESISTANCE",
        price: 10,
        wickPrice: 15,
        candleOpenTime: 2,
      },
    ]);
  });
});
