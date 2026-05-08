import { describe, expect, it } from "vitest";
import type { Candle } from "../../../../../shared/zennyTypes";
import type { AnalysisPool } from "../../analysis/orchestrator";
import { checkConfirmation } from "./checkConfirmation";

function poolFix(opts: {
  type: "RESISTANCE" | "SUPPORT";
  linePrice: number;
  sweptCandleIndexOnPrimary: number | null;
}): AnalysisPool {
  return {
    id: "p",
    symbol: "BTCUSDT",
    sourceTimeframe: "1H",
    type: opts.type,
    kind: "pivot_probe",
    linePrice: opts.linePrice,
    wickHigh: opts.linePrice + 5,
    wickLow: opts.linePrice - 5,
    centreLine: opts.linePrice,
    birthCandleTime: 0,
    birthCandleIndexOnPrimary: 0,
    sweptCandleTime:
      opts.sweptCandleIndexOnPrimary != null ? 1000 : null,
    sweptCandleIndexOnPrimary: opts.sweptCandleIndexOnPrimary,
    sweepReason: null,
    deathCandleTime: null,
    deathCandleIndexOnPrimary: null,
    deathReason: null,
    status: "swept",
    confluenceCount: 1,
    strength: "strong",
    pull: null,
  };
}

function candle(close: number, openTime: number): Candle {
  return {
    open: close,
    high: close,
    low: close,
    close,
    openTime,
    closeTime: openTime + 999,
    volume: 1,
  };
}

describe("checkConfirmation", () => {
  it("RESISTANCE: same-bar close back below line is confirmation", () => {
    const pool = poolFix({
      type: "RESISTANCE",
      linePrice: 100,
      sweptCandleIndexOnPrimary: 2,
    });
    const candles = [
      candle(95, 0),
      candle(95, 1),
      candle(99, 2), // sweep candle, closes below 100
    ];
    const result = checkConfirmation({ pool, candles, maxBarsAfterSweep: 1 });
    expect(result.satisfied).toBe(true);
    expect(result.confirmedAtIndex).toBe(2);
  });

  it("RESISTANCE: next-bar close back below line is confirmation when window=1", () => {
    const pool = poolFix({
      type: "RESISTANCE",
      linePrice: 100,
      sweptCandleIndexOnPrimary: 1,
    });
    const candles = [
      candle(95, 0),
      candle(101, 1), // sweep candle, closes ABOVE line
      candle(99, 2), // next bar, closes back below
    ];
    const result = checkConfirmation({ pool, candles, maxBarsAfterSweep: 1 });
    expect(result.satisfied).toBe(true);
    expect(result.confirmedAtIndex).toBe(2);
  });

  it("RESISTANCE: no close back inside within window → unsatisfied", () => {
    const pool = poolFix({
      type: "RESISTANCE",
      linePrice: 100,
      sweptCandleIndexOnPrimary: 1,
    });
    const candles = [
      candle(95, 0),
      candle(101, 1),
      candle(102, 2),
      candle(99, 3), // close back, but outside window=1
    ];
    const result = checkConfirmation({ pool, candles, maxBarsAfterSweep: 1 });
    expect(result.satisfied).toBe(false);
    expect(result.reason).toMatch(/no close-back/);
  });

  it("SUPPORT: close back above line is confirmation", () => {
    const pool = poolFix({
      type: "SUPPORT",
      linePrice: 100,
      sweptCandleIndexOnPrimary: 1,
    });
    const candles = [candle(105, 0), candle(101, 1)];
    const result = checkConfirmation({ pool, candles, maxBarsAfterSweep: 1 });
    expect(result.satisfied).toBe(true);
  });

  it("returns unsatisfied when pool not swept", () => {
    const pool = poolFix({
      type: "RESISTANCE",
      linePrice: 100,
      sweptCandleIndexOnPrimary: null,
    });
    const result = checkConfirmation({
      pool,
      candles: [candle(99, 0)],
      maxBarsAfterSweep: 1,
    });
    expect(result.satisfied).toBe(false);
    expect(result.reason).toMatch(/not swept/);
  });
});
