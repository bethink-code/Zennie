import { describe, expect, it } from "vitest";
import type { Candle } from "../../../../../shared/zennyTypes";
import { checkPoolAliveness } from "./checkPoolAliveness";
import { formPool } from "./formPool";

function c(
  i: number,
  open: number,
  high: number,
  low: number,
  close: number,
): Candle {
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
    expect(
      formPool(c(0, 10, 12, 8, 9), "RESISTANCE", { wickExtreme: 15 }),
    ).toEqual({
      linePrice: 10,
      wickHigh: 15,
      wickLow: 10,
      centreLine: 12.5,
    });
  });

  it("forms support pools from the body line to an optional aggregated wick", () => {
    expect(formPool(c(0, 10, 12, 7, 9), "SUPPORT", { wickExtreme: 5 })).toEqual(
      {
        linePrice: 9,
        wickHigh: 9,
        wickLow: 5,
        centreLine: 7,
      },
    );
  });

  it("marks wick-taken liquidity as swept while keeping structure alive", () => {
    const candles = [
      c(0, 10, 12, 8, 9),
      c(1, 9, 13, 8, 9.5), // wicks to 13 (> extreme 12), closes 9.5 (< 12)
      c(2, 9.5, 11, 8, 9.8),
    ];

    expect(
      checkPoolAliveness({
        candles,
        startIndex: 0,
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
    const candles = [c(0, 10, 12, 8, 9), c(1, 9, 12, 8, 9.5)];

    expect(
      checkPoolAliveness({
        candles,
        startIndex: 0,
        wickHigh: 12,
        wickLow: 10,
        side: "RESISTANCE",
      }).status,
    ).toBe("active");
  });

  it("stays alive on a drift up into the zone that holds below the extreme", () => {
    // Close 11.5 is above the old body line (10) but below the wick extreme
    // (12). The old body-line death rule killed this; now it stays active —
    // the resting liquidity at the extreme is still untouched.
    const candles = [c(0, 10, 12, 8, 9), c(1, 9, 11.8, 8, 11.5)];

    expect(
      checkPoolAliveness({
        candles,
        startIndex: 0,
        wickHigh: 12,
        wickLow: 10,
        side: "RESISTANCE",
      }).status,
    ).toBe("active");
  });

  it("can use a target sweep price separate from the visual zone edge", () => {
    const candles = [c(0, 100, 104, 99, 101), c(1, 101, 105.25, 100, 104)];

    expect(
      checkPoolAliveness({
        candles,
        startIndex: 0,
        sweepPrice: 105,
        wickHigh: 106,
        wickLow: 105,
        side: "RESISTANCE",
      }).status,
    ).toBe("swept");
  });

  it("kills structure on a close accepted past the wick extreme", () => {
    const candles = [
      c(0, 10, 12, 8, 9),
      c(1, 9, 11, 8, 9.5),
      c(2, 9.5, 12.5, 8, 12.5), // closes 12.5 > extreme 12 → dead (takes the wick too)
    ];

    expect(
      checkPoolAliveness({
        candles,
        startIndex: 0,
        wickHigh: 12,
        wickLow: 10,
        side: "RESISTANCE",
      }),
    ).toEqual({
      status: "dead",
      sweptCandleIndex: 2,
      sweptCandleOpenTime: 2,
      sweepReason: "wick_took_pool_extreme",
      deathCandleIndex: 2,
      deathCandleOpenTime: 2,
      deathReason: "close_past_line",
    });
  });

  it("SUPPORT: swept when the low is taken but the close holds above the extreme", () => {
    const candles = [c(0, 10, 12, 8, 11), c(1, 11, 12, 7, 11)]; // low 7 < extreme 8

    expect(
      checkPoolAliveness({
        candles,
        startIndex: 0,
        wickHigh: 10,
        wickLow: 8,
        side: "SUPPORT",
      }).status,
    ).toBe("swept");
  });
});
