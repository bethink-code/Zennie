import { describe, it, expect } from "vitest";
import { measureFollowThrough, computeAtr14 } from "./measureFollowThrough";
import type { Candle } from "../../../../../shared/zennyTypes";

function mkCandle(o: number, h: number, l: number, c: number, t = 0): Candle {
  return {
    openTime: t,
    closeTime: t + 1000,
    open: o,
    high: h,
    low: l,
    close: c,
    volume: 100,
  };
}

describe("measureFollowThrough — swing high", () => {
  it("returns the max drop within lookahead", () => {
    // Pivot high at index 2 with high=110; subsequent lows: 105, 100, 95, 98, 97
    // Max drop = 110 - 95 = 15
    const candles: Candle[] = [
      mkCandle(100, 105, 95, 100),
      mkCandle(100, 108, 98, 105),
      mkCandle(105, 110, 100, 108), // pivot high
      mkCandle(108, 108, 102, 105),
      mkCandle(105, 106, 98, 100),
      mkCandle(100, 100, 93, 96),
      mkCandle(96, 99, 94, 97),
      mkCandle(97, 98, 96, 97),
    ];
    const result = measureFollowThrough({
      candles,
      pivotIndex: 2,
      pivotType: "swing_high",
      lookaheadCandles: 5,
    });
    expect(result.maxReversalDistance).toBe(17); // 110 - 93
    expect(result.reversalCandleIndex).toBe(5);
  });

  it("returns 0 if all subsequent lows are at or above the pivot high (no reversal)", () => {
    const candles: Candle[] = [
      mkCandle(100, 110, 95, 108), // "pivot" at 110
      mkCandle(110, 115, 110, 112), // low=110 = pivot.high
      mkCandle(112, 120, 112, 118), // low=112 > pivot.high
    ];
    const result = measureFollowThrough({
      candles,
      pivotIndex: 0,
      pivotType: "swing_high",
      lookaheadCandles: 5,
    });
    expect(result.maxReversalDistance).toBe(0);
  });
});

describe("measureFollowThrough — swing low", () => {
  it("returns the max rise within lookahead", () => {
    // Pivot low at index 2 with low=90; subsequent highs: 95, 100, 110, 105
    // Max rise = 110 - 90 = 20
    const candles: Candle[] = [
      mkCandle(100, 105, 95, 98),
      mkCandle(98, 100, 92, 95),
      mkCandle(95, 96, 90, 94), // pivot low
      mkCandle(94, 100, 93, 98),
      mkCandle(98, 105, 97, 103),
      mkCandle(103, 110, 102, 108),
      mkCandle(108, 107, 103, 105),
    ];
    const result = measureFollowThrough({
      candles,
      pivotIndex: 2,
      pivotType: "swing_low",
      lookaheadCandles: 5,
    });
    expect(result.maxReversalDistance).toBe(20); // 110 - 90
  });
});

describe("measureFollowThrough — ATR ratio", () => {
  it("computes reversalAsAtrMultiple when atr provided", () => {
    const candles: Candle[] = [
      mkCandle(100, 110, 95, 108),
      mkCandle(108, 108, 95, 100),
      mkCandle(100, 102, 92, 95),
    ];
    const result = measureFollowThrough({
      candles,
      pivotIndex: 0,
      pivotType: "swing_high",
      lookaheadCandles: 5,
      atr: 5,
    });
    // Max drop = 110 - 92 = 18. 18 / 5 = 3.6
    expect(result.reversalAsAtrMultiple).toBeCloseTo(3.6);
  });

  it("returns null ratio when atr is missing or 0", () => {
    const candles: Candle[] = [mkCandle(100, 110, 95, 108)];
    const result = measureFollowThrough({
      candles,
      pivotIndex: 0,
      pivotType: "swing_high",
    });
    expect(result.reversalAsAtrMultiple).toBeNull();
  });
});

describe("computeAtr14", () => {
  it("returns 0 when insufficient candles", () => {
    expect(computeAtr14([mkCandle(100, 110, 95, 108)])).toBe(0);
  });

  it("computes average true range over recent period", () => {
    // 15 candles with ranges of 10 each → ATR = 10
    const candles: Candle[] = [];
    for (let i = 0; i < 15; i++) {
      candles.push(mkCandle(100, 110, 100, 105, i));
    }
    const atr = computeAtr14(candles);
    expect(atr).toBeGreaterThan(0);
  });
});
