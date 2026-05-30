import { describe, expect, it } from "vitest";
import type { Candle } from "../../../../../shared/zennyTypes";
import type { BodyPivot } from "../../analysis/level/findBodyPivots";
import { detectStructureShift } from "./detectStructureShift";

// Minimal candle — only close is read by the detector, but fill all fields.
function c(i: number, close: number): Candle {
  return {
    openTime: i * 900_000,
    closeTime: i * 900_000 + 900_000,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1,
  };
}

function highPivot(index: number, price: number): BodyPivot {
  return {
    index,
    side: "RESISTANCE",
    price,
    wickPrice: price + 1,
    candleOpenTime: index * 900_000,
  };
}
function lowPivot(index: number, price: number): BodyPivot {
  return {
    index,
    side: "SUPPORT",
    price,
    wickPrice: price - 1,
    candleOpenTime: index * 900_000,
  };
}

describe("detectStructureShift", () => {
  it("detects an UP shift when a close breaks above the recent swing high", () => {
    const candles = [90, 91, 100, 95, 96, 97, 102, 98].map((v, i) => c(i, v));
    const pivots = [highPivot(2, 100)];
    const out = detectStructureShift({
      candles,
      pivots,
      afterIndex: 4,
      direction: "up",
      lookbackPivots: 3,
    });
    expect(out.shifted).toBe(true);
    expect(out.direction).toBe("up");
    expect(out.brokenPivotIndex).toBe(2);
    expect(out.brokenAtIndex).toBe(6);
    expect(out.displacement).toBeCloseTo(2);
  });

  it("detects a DOWN shift when a close breaks below the recent swing low", () => {
    const candles = [60, 59, 50, 55, 54, 53, 47, 52].map((v, i) => c(i, v));
    const pivots = [lowPivot(2, 50)];
    const out = detectStructureShift({
      candles,
      pivots,
      afterIndex: 4,
      direction: "down",
      lookbackPivots: 3,
    });
    expect(out.shifted).toBe(true);
    expect(out.direction).toBe("down");
    expect(out.displacement).toBeCloseTo(3);
  });

  it("does not shift when no close breaks the reference level", () => {
    const candles = [90, 91, 100, 95, 96, 97, 99, 98].map((v, i) => c(i, v));
    const out = detectStructureShift({
      candles,
      pivots: [highPivot(2, 100)],
      afterIndex: 4,
      direction: "up",
      lookbackPivots: 3,
    });
    expect(out.shifted).toBe(false);
    expect(out.brokenAtIndex).toBeNull();
  });

  it("breaks the NEAREST (easiest) swing high, not the highest", () => {
    const candles = [90, 91, 100, 105, 96, 97, 102, 98].map((v, i) => c(i, v));
    // Two recent highs: 100 (nearer) and 105 (further). A close at 102 clears
    // 100 but not 105 — structure has shifted at the 100 pivot.
    const pivots = [highPivot(2, 100), highPivot(3, 105)];
    const out = detectStructureShift({
      candles,
      pivots,
      afterIndex: 4,
      direction: "up",
      lookbackPivots: 3,
    });
    expect(out.shifted).toBe(true);
    expect(out.brokenPivotIndex).toBe(2);
  });

  it("ignores the break candle at or before the sweep index", () => {
    // The only break is at index 3, before afterIndex=4 — must not count.
    const candles = [90, 91, 100, 102, 96, 97, 98, 99].map((v, i) => c(i, v));
    const out = detectStructureShift({
      candles,
      pivots: [highPivot(2, 100)],
      afterIndex: 4,
      direction: "up",
      lookbackPivots: 3,
    });
    expect(out.shifted).toBe(false);
  });

  it("returns no shift when there is no reference pivot on the relevant side", () => {
    const candles = [90, 91, 100, 95, 96, 97, 102, 98].map((v, i) => c(i, v));
    const out = detectStructureShift({
      candles,
      pivots: [lowPivot(2, 50)], // wrong side for an up shift
      afterIndex: 4,
      direction: "up",
      lookbackPivots: 3,
    });
    expect(out.shifted).toBe(false);
  });
});
