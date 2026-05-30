import { describe, expect, it } from "vitest";
import type { Candle } from "../../../../../shared/zennyTypes";
import { findLiquidityPools } from "./findLiquidityPools";

function c(
  i: number,
  open: number,
  high: number,
  low: number,
  close: number,
): Candle {
  const stepMs = 900_000;
  return {
    openTime: Date.UTC(2026, 0, 1) + i * stepMs,
    closeTime: Date.UTC(2026, 0, 1) + (i + 1) * stepMs - 1,
    open,
    high,
    low,
    close,
    volume: 1,
  };
}

describe("findLiquidityPools (pure detector — full zones, no depletion)", () => {
  it("emits the FULL wick zone (body line → wick extreme)", () => {
    const pools = findLiquidityPools({
      symbol: "BTCUSDT",
      timeframe: "15m",
      candles: [
        c(0, 100, 101, 99, 100),
        c(1, 100, 110, 99, 104), // upper wick 104→110
        c(2, 104, 106, 102, 105),
        c(3, 105, 106, 103, 104),
      ],
    });

    const pool = pools.find(
      (p) => p.side === "RESISTANCE" && p.sourceIndex === 1,
    );
    expect(pool).toBeDefined();
    // Full zone: body top max(open,close)=104 → wick top 110. (Previously the
    // depletion model shrank this to 106; lifecycle now lives in checkPoolAliveness.)
    expect(pool?.zoneLow).toBe(104);
    expect(pool?.zoneHigh).toBe(110);
    expect(pool?.targetPrice).toBe(104);
  });

  it("does NOT shrink the zone when later candles enter it", () => {
    const pools = findLiquidityPools({
      symbol: "BTCUSDT",
      timeframe: "15m",
      candles: [
        c(0, 100, 101, 99, 100),
        c(1, 100, 110, 99, 104),
        c(2, 104, 107, 102, 105), // reaches into the zone — must NOT shrink it
        c(3, 105, 106, 103, 104),
      ],
    });
    const pool = pools.find(
      (p) => p.side === "RESISTANCE" && p.sourceIndex === 1,
    );
    expect(pool?.zoneLow).toBe(104);
    expect(pool?.zoneHigh).toBe(110);
  });

  it("does not create a pool from the most recent (possibly forming) candle", () => {
    const pools = findLiquidityPools({
      symbol: "BTCUSDT",
      timeframe: "15m",
      candles: [
        c(0, 100, 101, 99, 100),
        c(1, 100, 110, 99, 104),
        c(2, 104, 106, 102, 105),
        c(3, 105, 112, 104, 106), // last candle — must not birth a pool
      ],
    });
    expect(pools.some((p) => p.sourceIndex === 3)).toBe(false);
  });

  it("does not create wick-probe pools from mid-range noise", () => {
    const pools = findLiquidityPools({
      symbol: "BTCUSDT",
      timeframe: "15m",
      candles: [
        c(0, 100, 110, 95, 108),
        c(1, 108, 112, 101, 110),
        c(2, 110, 111, 100, 109),
        c(3, 109, 109.5, 98, 107),
        c(4, 107, 113, 102, 112),
        c(5, 112, 114, 105, 113),
      ],
    });

    expect(
      pools.some(
        (p) =>
          p.kind === "pivot_probe" &&
          p.side === "SUPPORT" &&
          p.sourceIndex === 2,
      ),
    ).toBe(false);
  });
});
