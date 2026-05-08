import { describe, expect, it } from "vitest";
import { DEFAULT_EXECUTION_CONFIG } from "./executionConfig";
import { killSwitchEvaluate } from "./killSwitchEvaluate";

describe("killSwitchEvaluate", () => {
  it("OK when current is at or above reference", () => {
    const out = killSwitchEvaluate({
      currentEquity: 10_000,
      peakEquity: 10_000,
      startingEquity: 10_000,
      previousKillStatus: "OK",
      config: DEFAULT_EXECUTION_CONFIG,
    });
    expect(out.killStatus).toBe("OK");
    expect(out.drawdownPct).toBe(0);
  });

  it("SOFT_TRIPPED at 20% below peak (default soft threshold)", () => {
    const out = killSwitchEvaluate({
      currentEquity: 8_000, // 20% drawdown from 10k peak
      peakEquity: 10_000,
      startingEquity: 10_000,
      previousKillStatus: "OK",
      config: DEFAULT_EXECUTION_CONFIG,
    });
    expect(out.killStatus).toBe("SOFT_TRIPPED");
    expect(out.drawdownPct).toBeCloseTo(20, 5);
  });

  it("HARD_TRIPPED at 30% below peak (default hard threshold)", () => {
    const out = killSwitchEvaluate({
      currentEquity: 7_000,
      peakEquity: 10_000,
      startingEquity: 10_000,
      previousKillStatus: "OK",
      config: DEFAULT_EXECUTION_CONFIG,
    });
    expect(out.killStatus).toBe("HARD_TRIPPED");
    expect(out.drawdownPct).toBeCloseTo(30, 5);
  });

  it("HARD_TRIPPED is sticky — never returns OK once tripped", () => {
    const out = killSwitchEvaluate({
      currentEquity: 12_000, // recovered above peak
      peakEquity: 10_000,
      startingEquity: 10_000,
      previousKillStatus: "HARD_TRIPPED",
      config: DEFAULT_EXECUTION_CONFIG,
    });
    expect(out.killStatus).toBe("HARD_TRIPPED");
  });

  it("uses startingEquity when reference is 'starting'", () => {
    // Account grew from 10k to 20k; current 16k. Versus peak: 20% dd → SOFT.
    // Versus starting: 60% above starting → OK.
    const out = killSwitchEvaluate({
      currentEquity: 16_000,
      peakEquity: 20_000,
      startingEquity: 10_000,
      previousKillStatus: "OK",
      config: { ...DEFAULT_EXECUTION_CONFIG, killSwitchReference: "starting" },
    });
    expect(out.killStatus).toBe("OK");
  });
});
