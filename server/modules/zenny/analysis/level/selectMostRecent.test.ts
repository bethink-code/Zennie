import { describe, it, expect } from "vitest";
import { selectMostRecent } from "./selectMostRecent";
import type { SwingExtremum } from "../candle/findLocalExtrema";

function mkPivot(
  index: number,
  type: "swing_high" | "swing_low",
  price = 100,
): SwingExtremum {
  return {
    index,
    candleOpenTime: index * 1000,
    price,
    wickPrice: price,
    type,
  };
}

describe("selectMostRecent", () => {
  it("returns N most recent highs and N most recent lows (default 2)", () => {
    const extrema: SwingExtremum[] = [
      mkPivot(10, "swing_high", 100),
      mkPivot(20, "swing_low", 80),
      mkPivot(40, "swing_high", 110),
      mkPivot(55, "swing_low", 85),
      mkPivot(70, "swing_high", 105),
      mkPivot(90, "swing_low", 90),
      mkPivot(120, "swing_high", 115),
      mkPivot(150, "swing_low", 92),
    ];
    const result = selectMostRecent({ extrema });
    // 2 most recent highs: index 120, 70
    // 2 most recent lows: index 150, 90
    expect(result.map((e) => e.index)).toEqual([70, 90, 120, 150]);
  });

  it("respects perSide override", () => {
    const extrema: SwingExtremum[] = [
      mkPivot(1, "swing_high"),
      mkPivot(2, "swing_high"),
      mkPivot(3, "swing_high"),
      mkPivot(4, "swing_high"),
      mkPivot(5, "swing_low"),
      mkPivot(6, "swing_low"),
      mkPivot(7, "swing_low"),
      mkPivot(8, "swing_low"),
    ];
    const result = selectMostRecent({ extrema, perSide: 1 });
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.index)).toEqual([4, 8]);
  });

  it("handles empty input", () => {
    expect(selectMostRecent({ extrema: [] })).toEqual([]);
  });

  it("handles fewer than perSide pivots on a side", () => {
    const extrema: SwingExtremum[] = [
      mkPivot(10, "swing_high"),
      mkPivot(20, "swing_low"),
      mkPivot(30, "swing_low"),
    ];
    const result = selectMostRecent({ extrema });
    // 1 high (all we have), 2 lows
    expect(result).toHaveLength(3);
  });

  it("returns results in chronological order", () => {
    const extrema: SwingExtremum[] = [
      mkPivot(100, "swing_high"),
      mkPivot(50, "swing_high"),
      mkPivot(75, "swing_low"),
      mkPivot(25, "swing_low"),
    ];
    const result = selectMostRecent({ extrema });
    // All four should be in result, sorted ascending
    expect(result.map((e) => e.index)).toEqual([25, 50, 75, 100]);
  });
});
