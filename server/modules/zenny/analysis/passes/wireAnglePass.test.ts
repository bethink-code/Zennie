import { describe, expect, it } from "vitest";
import type { Candle } from "../../../../../shared/zennyTypes";
import {
  classifyBracket,
  classifyDirection,
  runWireAnglePass,
  smoothCloses,
} from "./wireAnglePass";
import type { PassRunInput } from "./types";

function c(i: number, close: number): Candle {
  return {
    openTime: i,
    closeTime: i + 1,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
  };
}

function input(closes: number[]): PassRunInput {
  const candles = closes.map((p, i) => c(i, p));
  return {
    levels: [],
    perTfCandles: new Map([["1H", candles]]),
    primaryCandles: candles,
    primaryTimeframe: "1H",
  };
}

// Build a raw close series such that, after the [1,2,3,2,1]/9 smoothing,
// the smoothed close N-1 bars ago equals `startClose` and the most recent
// smoothed close equals `startClose * (1 + pctChange/100)`. Lets tests
// reason about the % change the angle pass actually sees, rather than the
// raw % change which the smoothing kernel attenuates.
function rampForSmoothedPct(
  startClose: number,
  pctChange: number,
  N: number,
): number[] {
  const endClose = startClose * (1 + pctChange / 100);
  const slope = (endClose - startClose) / (N - 1);
  const base = startClose - slope * 2;
  const totalRaw = N + 4;
  return Array.from({ length: totalRaw }, (_, i) => base + slope * i);
}

const enabledConfig = { enabled: true, lookbackCandles: 14 };

describe("classifyBracket", () => {
  it("uses |angle| for bracket selection", () => {
    expect(classifyBracket(0)).toBe("NO_TRADE");
    expect(classifyBracket(13.99)).toBe("NO_TRADE");
    expect(classifyBracket(-13.99)).toBe("NO_TRADE");
    expect(classifyBracket(14)).toBe("ACCUMULATION");
    expect(classifyBracket(-26.24)).toBe("ACCUMULATION");
    expect(classifyBracket(26.25)).toBe("RANGING");
    expect(classifyBracket(-44.99)).toBe("RANGING");
    expect(classifyBracket(45)).toBe("TRENDING");
    expect(classifyBracket(-63.74)).toBe("TRENDING");
    expect(classifyBracket(63.75)).toBe("BREAKOUT");
    expect(classifyBracket(-89)).toBe("BREAKOUT");
  });
});

describe("classifyDirection", () => {
  it("preserves sign, treats near-zero as flat", () => {
    expect(classifyDirection(10)).toBe("up");
    expect(classifyDirection(-10)).toBe("down");
    expect(classifyDirection(0.4)).toBe("flat");
    expect(classifyDirection(-0.4)).toBe("flat");
    expect(classifyDirection(0)).toBe("flat");
  });
});

describe("smoothCloses", () => {
  it("returns empty for fewer than 5 candles", () => {
    expect(smoothCloses([])).toEqual([]);
    expect(smoothCloses([c(0, 1), c(1, 2), c(2, 3), c(3, 4)])).toEqual([]);
  });

  it("applies the [1,2,3,2,1]/9 kernel", () => {
    // Constant series stays constant — kernel is normalised.
    const flat = [100, 100, 100, 100, 100, 100, 100].map((p, i) => c(i, p));
    const smoothed = smoothCloses(flat);
    expect(smoothed).toHaveLength(3);
    smoothed.forEach((v) => expect(v).toBeCloseTo(100, 6));
  });

  it("reduces length by 4 (2 each side)", () => {
    const ramp = [10, 11, 12, 13, 14, 15, 16, 17, 18].map((p, i) => c(i, p));
    const smoothed = smoothCloses(ramp);
    expect(smoothed).toHaveLength(ramp.length - 4);
  });

  it("smooths anomalous spikes", () => {
    const spike = [100, 100, 200, 100, 100].map((p, i) => c(i, p));
    const smoothed = smoothCloses(spike);
    // Single value: (100 + 2*100 + 3*200 + 2*100 + 100) / 9 = 1200/9 ≈ 133.33
    expect(smoothed).toHaveLength(1);
    expect(smoothed[0]).toBeCloseTo(1200 / 9, 6);
  });
});

describe("runWireAnglePass", () => {
  it("returns null when disabled", () => {
    const result = runWireAnglePass(input([100, 101, 102, 103, 104]), {
      enabled: false,
      lookbackCandles: 14,
    });
    expect(result).toBeNull();
  });

  it("returns null when there are too few candles for the lookback window", () => {
    // 14 candle lookback + smoothing buffer (4) = need 18 raw candles minimum.
    const closes = Array.from({ length: 17 }, (_, i) => 100 + i);
    expect(runWireAnglePass(input(closes), enabledConfig)).toBeNull();
  });

  it("computes the spec example: 2.8% over N=14 ≈ 11.31°", () => {
    // From spec §1.2 example. pct_change=2.8, slope=0.2, atan(0.2) ≈ 11.31°.
    const closes = rampForSmoothedPct(100, 2.8, 14);
    const result = runWireAnglePass(input(closes), enabledConfig);
    expect(result).not.toBeNull();
    expect(result!.pctChange).toBeCloseTo(2.8, 5);
    expect(result!.angleDeg).toBeCloseTo(11.31, 1);
    expect(result!.gannBracket).toBe("NO_TRADE");
    expect(result!.tradePermitted).toBe(false);
    expect(result!.direction).toBe("up");
  });

  it("computes the spec TRENDING example: 14% over N=14 → 45°", () => {
    // From spec §1.2 example: pct_change=14, slope=1.0, atan(1) = 45°.
    const closes = rampForSmoothedPct(100, 14, 14);
    const result = runWireAnglePass(input(closes), enabledConfig);
    expect(result).not.toBeNull();
    expect(result!.pctChange).toBeCloseTo(14, 5);
    expect(result!.angleDeg).toBeCloseTo(45, 5);
    expect(result!.gannBracket).toBe("TRENDING");
    expect(result!.tradePermitted).toBe(true);
  });

  it("downtrend produces negative angle, same bracket as positive", () => {
    const closes = rampForSmoothedPct(100, -14, 14);
    const result = runWireAnglePass(input(closes), enabledConfig);
    expect(result).not.toBeNull();
    expect(result!.angleDeg).toBeLessThan(0);
    // -14% over 100 = -14 absolute, slope = -14/100/14 — but pct uses relative
    // base, which is the *prior* close, so result is slightly steeper than 45°.
    expect(Math.abs(result!.angleDeg)).toBeGreaterThan(44);
    expect(Math.abs(result!.angleDeg)).toBeLessThan(50);
    expect(result!.gannBracket).toBe("TRENDING");
    expect(result!.direction).toBe("down");
  });

  it("flat market sits at NO_TRADE with no permitted bracket", () => {
    const closes = Array.from({ length: 30 }, () => 100);
    const result = runWireAnglePass(input(closes), enabledConfig);
    expect(result).not.toBeNull();
    expect(result!.angleDeg).toBe(0);
    expect(result!.gannBracket).toBe("NO_TRADE");
    expect(result!.tradePermitted).toBe(false);
    expect(result!.direction).toBe("flat");
  });

  it("trade permitted only when |angle| ≥ 26.25 (RegimeGuard, spec §2.9)", () => {
    // tan(26.25°) ≈ 0.4931. Need pct = slope × N ≈ 6.903%.
    const justOver = rampForSmoothedPct(100, 7.1, 14);
    const r1 = runWireAnglePass(input(justOver), enabledConfig);
    expect(r1!.tradePermitted).toBe(true);
    expect(r1!.gannBracket).toBe("RANGING");

    const justUnder = rampForSmoothedPct(100, 6.7, 14);
    const r2 = runWireAnglePass(input(justUnder), enabledConfig);
    expect(r2!.tradePermitted).toBe(false);
    expect(r2!.gannBracket).toBe("ACCUMULATION");
  });
});
