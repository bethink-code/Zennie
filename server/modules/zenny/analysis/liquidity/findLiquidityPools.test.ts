import { describe, expect, it } from "vitest";
import type { Candle } from "../../../../../shared/zennyTypes";
import { findLiquidityPools } from "./findLiquidityPools";

function c(i: number, open: number, high: number, low: number, close: number): Candle {
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

describe("findLiquidityPools", () => {
  it("creates wick liquidity from closed candles without requiring pivots", () => {
    const pools = findLiquidityPools({
      symbol: "BTCUSDT",
      timeframe: "15m",
      candles: [
        c(0, 100, 101, 99, 100),
        c(1, 100, 110, 99, 104),
        c(2, 104, 106, 102, 105),
        c(3, 105, 106, 103, 104),
      ],
    });

    expect(
      pools.some(
        (p) =>
          p.side === "RESISTANCE" &&
          p.sourceIndex === 1 &&
          p.zoneLow === 106 &&
          p.zoneHigh === 110,
      ),
    ).toBe(true);
  });

  it("draws only the unconsumed remainder after later candles enter the pool", () => {
    const pools = findLiquidityPools({
      symbol: "BTCUSDT",
      timeframe: "15m",
      candles: [
        c(0, 100, 101, 99, 100),
        c(1, 100, 110, 99, 104),
        c(2, 104, 107, 102, 105),
        c(3, 105, 106, 103, 104),
      ],
    });

    const pool = pools.find((p) => p.side === "RESISTANCE" && p.sourceIndex === 1);
    expect(pool).toBeDefined();
    expect(pool?.zoneLow).toBe(107);
    expect(pool?.zoneHigh).toBe(110);
  });

  it("removes a pool once later candles fully consume its wick zone", () => {
    const pools = findLiquidityPools({
      symbol: "BTCUSDT",
      timeframe: "15m",
      candles: [
        c(0, 100, 101, 99, 100),
        c(1, 100, 110, 99, 104),
        c(2, 104, 111, 102, 105),
        c(3, 105, 106, 103, 104),
      ],
    });

    expect(
      pools.some((p) => p.side === "RESISTANCE" && p.sourceIndex === 1),
    ).toBe(false);
  });

  it("uses the most recent candle to consume pools but not create them", () => {
    const pools = findLiquidityPools({
      symbol: "BTCUSDT",
      timeframe: "15m",
      candles: [
        c(0, 100, 101, 99, 100),
        c(1, 100, 110, 99, 104),
        c(2, 104, 106, 102, 105),
        c(3, 105, 112, 104, 106),
      ],
    });

    expect(pools.some((p) => p.sourceIndex === 3)).toBe(false);
    expect(
      pools.some((p) => p.side === "RESISTANCE" && p.sourceIndex === 1),
    ).toBe(false);
  });

  it("depletes higher-timeframe pools with lower-timeframe candles inside the source candle", () => {
    const hourMs = 3_600_000;
    const minuteMs = 60_000;
    const pools = findLiquidityPools({
      symbol: "BTCUSDT",
      timeframe: "1H",
      candles: [
        {
          openTime: 0,
          closeTime: hourMs,
          open: 100,
          high: 110,
          low: 99,
          close: 104,
          volume: 1,
        },
        {
          openTime: hourMs,
          closeTime: 2 * hourMs,
          open: 104,
          high: 106,
          low: 102,
          close: 105,
          volume: 1,
        },
      ],
      depletionCandles: [
        c(0, 100, 101, 99, 100),
        {
          openTime: 15 * minuteMs,
          closeTime: 30 * minuteMs,
          open: 104,
          high: 107,
          low: 102,
          close: 105,
          volume: 1,
        },
        {
          openTime: 30 * minuteMs,
          closeTime: 45 * minuteMs,
          open: 105,
          high: 106,
          low: 103,
          close: 104,
          volume: 1,
        },
      ],
    });

    const pool = pools.find((p) => p.side === "RESISTANCE" && p.sourceIndex === 0);
    expect(pool).toBeDefined();
    expect(pool?.zoneLow).toBe(107);
    expect(pool?.zoneHigh).toBe(110);
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
