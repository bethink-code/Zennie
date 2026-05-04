import { describe, expect, it } from "vitest";
import type { Candle } from "../../../../../shared/zennyTypes";
import type { AnalysisPool } from "../orchestrator";
import {
  computeCandlesMovingAway,
  DEFAULT_PULL_PASS_CONFIG,
  runPullPass,
  sEffectiveStandIn,
} from "./pullPass";

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

function pool(overrides: Partial<AnalysisPool> = {}): AnalysisPool {
  return {
    id: "P1",
    symbol: "BTCUSDT",
    sourceTimeframe: "1H",
    type: "RESISTANCE",
    kind: "pivot_probe",
    linePrice: 100,
    wickHigh: 110,
    wickLow: 100,
    centreLine: 105,
    birthCandleTime: 0,
    birthCandleIndexOnPrimary: 0,
    sweptCandleTime: null,
    sweptCandleIndexOnPrimary: null,
    sweepReason: null,
    deathCandleTime: null,
    deathCandleIndexOnPrimary: null,
    deathReason: null,
    status: "active",
    confluenceCount: 0,
    strength: "medium",
    pull: null,
    ...overrides,
  } as AnalysisPool;
}

describe("sEffectiveStandIn", () => {
  it("maps strength tier into the 0-105 spec range", () => {
    expect(sEffectiveStandIn("trivial")).toBe(20);
    expect(sEffectiveStandIn("weak")).toBe(40);
    expect(sEffectiveStandIn("medium")).toBe(60);
    expect(sEffectiveStandIn("strong")).toBe(80);
    expect(sEffectiveStandIn("very_strong")).toBe(95);
  });
});

describe("computeCandlesMovingAway", () => {
  it("returns 0 when there are no post-birth candles", () => {
    const p = pool({ birthCandleIndexOnPrimary: 0 });
    expect(computeCandlesMovingAway(p, [c(0, 100)])).toBe(0);
  });

  it("counts consecutive bars where distance to centre increases", () => {
    const p = pool({ centreLine: 100, birthCandleIndexOnPrimary: 0 });
    // Distances:    0   1    2    3   (each bar moves further)
    const candles = [c(0, 100), c(1, 101), c(2, 103), c(3, 106)];
    expect(computeCandlesMovingAway(p, candles)).toBe(3);
  });

  it("resets to 0 when price moves back toward the centre", () => {
    const p = pool({ centreLine: 100, birthCandleIndexOnPrimary: 0 });
    // Distances: 0 → 5 → 10 (away) → 8 (toward, reset) → 12 (away again)
    const candles = [c(0, 100), c(1, 105), c(2, 110), c(3, 108), c(4, 112)];
    expect(computeCandlesMovingAway(p, candles)).toBe(1);
  });

  it("treats unchanged distance as neither increment nor reset", () => {
    const p = pool({ centreLine: 100, birthCandleIndexOnPrimary: 0 });
    const candles = [c(0, 100), c(1, 105), c(2, 105), c(3, 110)];
    // Distances: 0 → 5 (+) → 5 (=) → 10 (+)  → counter = 2
    expect(computeCandlesMovingAway(p, candles)).toBe(2);
  });
});

describe("runPullPass", () => {
  it("returns empty when disabled", () => {
    const result = runPullPass(
      { pools: [pool()], primaryCandles: [c(0, 100)] },
      { ...DEFAULT_PULL_PASS_CONFIG, enabled: false },
    );
    expect(result.size).toBe(0);
  });

  it("returns empty when there are no pools", () => {
    const result = runPullPass({ pools: [], primaryCandles: [c(0, 100)] });
    expect(result.size).toBe(0);
  });

  it("ignores swept and dead pools", () => {
    const pools = [
      pool({ id: "swept", status: "swept" }),
      pool({ id: "dead", status: "dead" }),
    ];
    const result = runPullPass({ pools, primaryCandles: [c(0, 100)] });
    expect(result.size).toBe(0);
  });

  it("closer pool gets higher pull (same score)", () => {
    const pools = [
      pool({ id: "near", centreLine: 102 }), // distance ~2%
      pool({ id: "far", centreLine: 110 }), // distance ~10%
    ];
    const result = runPullPass({ pools, primaryCandles: [c(0, 100)] });
    const near = result.get("near")!;
    const far = result.get("far")!;
    expect(near.raw).toBeGreaterThan(far.raw);
    expect(near.normalized).toBe(100); // strongest pull
    expect(far.normalized).toBeLessThan(50);
  });

  it("higher score gets higher pull (same distance)", () => {
    const pools = [
      pool({ id: "weak", strength: "weak", centreLine: 105 }),
      pool({ id: "strong", strength: "strong", centreLine: 105 }),
    ];
    const result = runPullPass({ pools, primaryCandles: [c(0, 100)] });
    expect(result.get("strong")!.raw).toBeGreaterThan(result.get("weak")!.raw);
    expect(result.get("strong")!.normalized).toBe(100);
  });

  it("price inside a pool uses distance floor (no divide by zero)", () => {
    // Pool centreLine = 100, current price = 100 → distance 0
    const pools = [pool({ centreLine: 100 })];
    const result = runPullPass({ pools, primaryCandles: [c(0, 100)] });
    expect(result.get("P1")!.distancePct).toBe(0);
    expect(result.get("P1")!.raw).toBeGreaterThan(0); // floor protects div
    expect(Number.isFinite(result.get("P1")!.raw)).toBe(true);
  });

  it("decay drops normalized pull over time when price walks away", () => {
    const p = pool({ id: "P", centreLine: 100, birthCandleIndexOnPrimary: 0 });
    // 10 candles each one step further from the centre
    const candles = Array.from({ length: 11 }, (_, i) => c(i, 100 + i));
    const result = runPullPass({ pools: [p], primaryCandles: candles });
    const r = result.get("P")!;
    expect(r.candlesMovingAway).toBe(10);
    // normalized = 100, decayed = 100 × 0.95^10 ≈ 59.87
    expect(r.decayed).toBeCloseTo(100 * Math.pow(0.95, 10), 4);
  });

  it("decayed pull never falls below the floor", () => {
    const p = pool({ id: "P", centreLine: 100, birthCandleIndexOnPrimary: 0 });
    // 200 candles walking away → 0.95^200 ≈ 3.5e-5, would round to ~0
    const candles = Array.from({ length: 201 }, (_, i) => c(i, 100 + i));
    const result = runPullPass({ pools: [p], primaryCandles: candles });
    expect(result.get("P")!.decayed).toBe(5); // MIN_PULL_FLOOR
  });

  it("normalises across multiple active pools", () => {
    const pools = [
      pool({ id: "A", centreLine: 102, strength: "strong" }), // close + high score
      pool({ id: "B", centreLine: 104, strength: "weak" }), // mid-range
      pool({ id: "C", centreLine: 110, strength: "trivial" }), // far + low
    ];
    const result = runPullPass({ pools, primaryCandles: [c(0, 100)] });
    expect(result.get("A")!.normalized).toBe(100);
    expect(result.get("B")!.normalized).toBeLessThan(100);
    expect(result.get("B")!.normalized).toBeGreaterThan(
      result.get("C")!.normalized,
    );
  });
});
