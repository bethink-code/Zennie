import { describe, expect, it } from "vitest";
import { computeSize } from "./computeSize";

describe("computeSize", () => {
  it("standard long: risk 1% of $10k with $5 stop → $100/$5 = 20 units", () => {
    const out = computeSize({
      equity: 10_000,
      plan: { entry: 100, stop: 95, riskPct: 1, sizeMultiplier: 1 },
    });
    expect(out).not.toBeNull();
    expect(out!.size).toBe(20);
    expect(out!.notional).toBe(2000);
  });

  it("size multiplier scales the position", () => {
    const out = computeSize({
      equity: 10_000,
      plan: { entry: 100, stop: 95, riskPct: 1, sizeMultiplier: 0.5 },
    });
    expect(out!.size).toBe(10);
  });

  it("short: same math with stop above entry", () => {
    const out = computeSize({
      equity: 10_000,
      plan: { entry: 100, stop: 105, riskPct: 1, sizeMultiplier: 1 },
    });
    expect(out!.size).toBe(20);
  });

  it("returns null when stop distance is zero", () => {
    const out = computeSize({
      equity: 10_000,
      plan: { entry: 100, stop: 100, riskPct: 1, sizeMultiplier: 1 },
    });
    expect(out).toBeNull();
  });

  it("returns null when equity is non-positive", () => {
    const out = computeSize({
      equity: 0,
      plan: { entry: 100, stop: 95, riskPct: 1, sizeMultiplier: 1 },
    });
    expect(out).toBeNull();
  });

  it("returns null when riskPct is zero", () => {
    const out = computeSize({
      equity: 10_000,
      plan: { entry: 100, stop: 95, riskPct: 0, sizeMultiplier: 1 },
    });
    expect(out).toBeNull();
  });
});
