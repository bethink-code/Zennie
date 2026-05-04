import { describe, expect, it } from "vitest";
import type { AnalysisPool } from "../orchestrator";
import type { PoolPull } from "../pool/pullPass";
import { ARM_MINIMUM_PULL, extractArms } from "./extractArms";

function pull(decayed: number): PoolPull {
  return {
    raw: decayed,
    normalized: decayed,
    decayed,
    distancePct: 1,
    candlesMovingAway: 0,
    sEffectiveStandIn: 60,
  };
}

function pool(overrides: Partial<AnalysisPool> = {}): AnalysisPool {
  return {
    id: "P",
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
    pull: pull(50),
    ...overrides,
  } as AnalysisPool;
}

describe("extractArms", () => {
  it("returns no arms when current price is invalid", () => {
    const r = extractArms({ pools: [pool()], currentPrice: 0 });
    expect(r).toEqual({ upper: null, lower: null, dominantSide: "neither" });
  });

  it("ignores swept and dead pools", () => {
    const pools = [
      pool({ id: "swept", status: "swept", centreLine: 110 }),
      pool({ id: "dead", status: "dead", centreLine: 90 }),
    ];
    const r = extractArms({ pools, currentPrice: 100 });
    expect(r.upper).toBeNull();
    expect(r.lower).toBeNull();
  });

  it("ignores pools without a pull score", () => {
    const pools = [pool({ centreLine: 110, pull: null })];
    const r = extractArms({ pools, currentPrice: 100 });
    expect(r.upper).toBeNull();
  });

  it("suppresses arms below ARM_MINIMUM_PULL", () => {
    const pools = [
      pool({
        id: "weak-up",
        centreLine: 110,
        pull: pull(ARM_MINIMUM_PULL - 0.01),
      }),
      pool({
        id: "weak-down",
        centreLine: 90,
        pull: pull(ARM_MINIMUM_PULL - 5),
      }),
    ];
    const r = extractArms({ pools, currentPrice: 100 });
    expect(r.upper).toBeNull();
    expect(r.lower).toBeNull();
  });

  it("picks the highest-pull pool above and below current price", () => {
    const pools = [
      pool({ id: "up-low", centreLine: 110, pull: pull(40) }),
      pool({ id: "up-high", centreLine: 115, pull: pull(80) }),
      pool({ id: "down-low", centreLine: 90, pull: pull(30) }),
      pool({ id: "down-high", centreLine: 85, pull: pull(60) }),
    ];
    const r = extractArms({ pools, currentPrice: 100 });
    expect(r.upper?.pool.id).toBe("up-high");
    expect(r.lower?.pool.id).toBe("down-high");
  });

  it("dominance goes to the higher-pull arm", () => {
    const pools = [
      pool({ id: "U", centreLine: 110, pull: pull(80) }),
      pool({ id: "D", centreLine: 90, pull: pull(50) }),
    ];
    const r = extractArms({ pools, currentPrice: 100 });
    expect(r.upper?.role).toBe("dominant");
    expect(r.lower?.role).toBe("subordinate");
    expect(r.dominantSide).toBe("upper");
  });

  it("equal pull scores resolve to no dominance", () => {
    const pools = [
      pool({ id: "U", centreLine: 110, pull: pull(50) }),
      pool({ id: "D", centreLine: 90, pull: pull(50) }),
    ];
    const r = extractArms({ pools, currentPrice: 100 });
    expect(r.upper?.role).toBe("equal");
    expect(r.lower?.role).toBe("equal");
    expect(r.dominantSide).toBe("neither");
  });

  it("a single arm is dominant by default", () => {
    const pools = [pool({ id: "U", centreLine: 110, pull: pull(70) })];
    const r = extractArms({ pools, currentPrice: 100 });
    expect(r.upper?.role).toBe("dominant");
    expect(r.lower).toBeNull();
    expect(r.dominantSide).toBe("upper");
  });

  it("a pool exactly at current price counts as below", () => {
    // Tie-breaker: centreLine > price = upper, otherwise lower. A pool
    // straddling current price is treated as the supportive (lower) side.
    const pools = [
      pool({ id: "at-price", centreLine: 100, pull: pull(50) }),
    ];
    const r = extractArms({ pools, currentPrice: 100 });
    expect(r.upper).toBeNull();
    expect(r.lower?.pool.id).toBe("at-price");
  });
});
