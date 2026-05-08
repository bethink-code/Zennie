import { describe, expect, it } from "vitest";
import type { Candle } from "../../../../../shared/zennyTypes";
import { computeBuffer } from "./computeBuffer";
import type { BufferConfig } from "./types";

function flatCandles(count: number, price: number): Candle[] {
  // Zero true range — high == low == close. Forces ATR = 0 so we can compare
  // pct vs atr deterministically.
  return Array.from({ length: count }, (_, i) => ({
    open: price,
    high: price,
    low: price,
    close: price,
    openTime: i * 1000,
    closeTime: i * 1000 + 999,
    volume: 1,
  }));
}

function rangyCandles(count: number, price: number, range: number): Candle[] {
  // Constant true range = `range`. Lets us assert atrBuffer = range × multiple.
  return Array.from({ length: count }, (_, i) => ({
    open: price,
    high: price + range / 2,
    low: price - range / 2,
    close: price,
    openTime: i * 1000,
    closeTime: i * 1000 + 999,
    volume: 1,
  }));
}

const CFG_PCT: BufferConfig = {
  rule: "percentage",
  percentage: 0.002,
  atrPeriod: 14,
  atrMultiple: 0.25,
};

const CFG_ATR: BufferConfig = { ...CFG_PCT, rule: "atr" };
const CFG_MAX: BufferConfig = { ...CFG_PCT, rule: "max" };

describe("computeBuffer", () => {
  it("percentage rule returns price × percentage", () => {
    const out = computeBuffer(100, flatCandles(20, 100), CFG_PCT);
    expect(out).toBeCloseTo(0.2, 6); // 100 × 0.002
  });

  it("atr rule returns ATR × multiple when ATR is computable", () => {
    const out = computeBuffer(100, rangyCandles(20, 100, 4), CFG_ATR);
    // TR = high - low = 4 every bar (constant). ATR(14) = 4. Buffer = 4 × 0.25.
    expect(out).toBeCloseTo(1.0, 6);
  });

  it("atr rule falls back to percentage when too few candles", () => {
    const out = computeBuffer(100, flatCandles(3, 100), CFG_ATR);
    expect(out).toBeCloseTo(0.2, 6);
  });

  it("max rule picks the larger of pct and atr", () => {
    // Rangy: ATR × 0.25 = 1.0, pct = 0.2 → max = 1.0
    const rangy = computeBuffer(100, rangyCandles(20, 100, 4), CFG_MAX);
    expect(rangy).toBeCloseTo(1.0, 6);
    // Flat: ATR × 0.25 = 0, pct = 0.2 → max = 0.2
    const flat = computeBuffer(100, flatCandles(20, 100), CFG_MAX);
    expect(flat).toBeCloseTo(0.2, 6);
  });
});
