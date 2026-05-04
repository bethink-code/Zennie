import { describe, expect, it } from "vitest";
import type { Candle } from "../../../../../shared/zennyTypes";
import { checkPoolAliveness } from "./checkPoolAliveness";
import { formPool } from "./formPool";

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

describe("pool logic", () => {
  it("forms resistance pools from the body line to an optional aggregated wick", () => {
    expect(formPool(c(0, 10, 12, 8, 9), "RESISTANCE", { wickExtreme: 15 })).toEqual({
      linePrice: 10,
      wickHigh: 15,
      wickLow: 10,
      centreLine: 12.5,
    });
  });

  it("forms support pools from the body line to an optional aggregated wick", () => {
    expect(formPool(c(0, 10, 12, 7, 9), "SUPPORT", { wickExtreme: 5 })).toEqual({
      linePrice: 9,
      wickHigh: 9,
      wickLow: 5,
      centreLine: 7,
    });
  });

  it("marks wick-taken liquidity as swept while keeping structure alive", () => {
    const candles = [
      c(0, 10, 12, 8, 9),
      c(1, 9, 13, 8, 9.5),
      c(2, 9.5, 11, 8, 9.8),
    ];

    expect(
      checkPoolAliveness({
        candles,
        startIndex: 0,
        linePrice: 10,
        wickHigh: 12,
        wickLow: 10,
        side: "RESISTANCE",
      }),
    ).toEqual({
      status: "swept",
      sweptCandleIndex: 1,
      sweptCandleOpenTime: 1,
      sweepReason: "wick_took_pool_extreme",
      deathCandleIndex: null,
      deathCandleOpenTime: null,
      deathReason: null,
    });
  });

  it("does not treat an equal high retest as a liquidity sweep", () => {
    const candles = [
      c(0, 10, 12, 8, 9),
      c(1, 9, 12, 8, 9.5),
    ];

    expect(
      checkPoolAliveness({
        candles,
        startIndex: 0,
        linePrice: 10,
        wickHigh: 12,
        wickLow: 10,
        side: "RESISTANCE",
      }),
    ).toEqual({
      status: "active",
      sweptCandleIndex: null,
      sweptCandleOpenTime: null,
      sweepReason: null,
      deathCandleIndex: null,
      deathCandleOpenTime: null,
      deathReason: null,
    });
  });

  it("can use a target sweep price separate from the visual zone edge", () => {
    const candles = [
      c(0, 100, 104, 99, 101),
      c(1, 101, 105.25, 100, 104),
    ];

    expect(
      checkPoolAliveness({
        candles,
        startIndex: 0,
        linePrice: 105,
        sweepPrice: 105,
        wickHigh: 106,
        wickLow: 105,
        side: "RESISTANCE",
      }),
    ).toEqual({
      status: "swept",
      sweptCandleIndex: 1,
      sweptCandleOpenTime: 1,
      sweepReason: "wick_took_pool_extreme",
      deathCandleIndex: null,
      deathCandleOpenTime: null,
      deathReason: null,
    });
  });

  it("kills structure only on a close past the body line", () => {
    const candles = [
      c(0, 10, 12, 8, 9),
      c(1, 9, 11, 8, 9.5),
      c(2, 9.5, 11, 8, 10.5),
    ];

    expect(
      checkPoolAliveness({
        candles,
        startIndex: 0,
        linePrice: 10,
        wickHigh: 12,
        wickLow: 10,
        side: "RESISTANCE",
      }),
    ).toEqual({
      status: "dead",
      sweptCandleIndex: null,
      sweptCandleOpenTime: null,
      sweepReason: null,
      deathCandleIndex: 2,
      deathCandleOpenTime: 2,
      deathReason: "close_past_line",
    });
  });
});
