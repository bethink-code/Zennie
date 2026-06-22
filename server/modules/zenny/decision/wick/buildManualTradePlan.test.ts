import { describe, expect, it } from "vitest";
import { buildManualTradePlan } from "./buildManualTradePlan";

describe("buildManualTradePlan", () => {
  it("builds a valid long plan with correct R:R and risk%", () => {
    const plan = buildManualTradePlan({
      timeframe: "15m",
      side: "long",
      entry: 100,
      stop: 90,
      target: 130,
      anchorPoolId: "pool-1",
    });
    expect(plan).not.toBeNull();
    expect(plan!.side).toBe("long");
    expect(plan!.phase).toBe("take");
    expect(plan!.riskRewardRatio).toBeCloseTo(3, 5); // 30 reward / 10 risk
    expect(plan!.riskPct).toBeCloseTo(10, 5); // 10/100
    expect(plan!.anchorPoolId).toBe("pool-1");
    expect(plan!.sizeMultiplier).toBe(1.0);
  });

  it("builds a valid short plan", () => {
    const plan = buildManualTradePlan({
      timeframe: "15m",
      side: "short",
      entry: 100,
      stop: 110,
      target: 80,
    });
    expect(plan).not.toBeNull();
    expect(plan!.side).toBe("short");
    expect(plan!.riskRewardRatio).toBeCloseTo(2, 5); // 20 / 10
  });

  it("rejects a long with stop above entry", () => {
    expect(
      buildManualTradePlan({
        timeframe: "15m",
        side: "long",
        entry: 100,
        stop: 105,
        target: 130,
      }),
    ).toBeNull();
  });

  it("rejects a short with target above entry", () => {
    expect(
      buildManualTradePlan({
        timeframe: "15m",
        side: "short",
        entry: 100,
        stop: 110,
        target: 120,
      }),
    ).toBeNull();
  });

  it("rejects non-finite or non-positive prices", () => {
    expect(
      buildManualTradePlan({
        timeframe: "15m",
        side: "long",
        entry: 100,
        stop: NaN,
        target: 130,
      }),
    ).toBeNull();
    expect(
      buildManualTradePlan({
        timeframe: "15m",
        side: "long",
        entry: 0,
        stop: -1,
        target: 130,
      }),
    ).toBeNull();
  });
});
