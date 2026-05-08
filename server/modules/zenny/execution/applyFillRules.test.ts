import { describe, expect, it } from "vitest";
import {
  applyFillRules,
  checkStopFill,
  checkTargetFill,
} from "./applyFillRules";
import type { ExecutionBar } from "./types";

const bar = (low: number, high: number): ExecutionBar => ({
  openTime: 1000,
  closeTime: 1999,
  open: (low + high) / 2,
  high,
  low,
  close: (low + high) / 2,
});

describe("applyFillRules — touch check", () => {
  it("returns null when bar range does not contain order price", () => {
    const r = applyFillRules({
      orderKind: "entry-limit",
      orderPrice: 100,
      side: "long",
      bar: bar(95, 99),
      slippageBps: 5,
      applySlippageToLimits: false,
    });
    expect(r).toBeNull();
  });

  it("limit order fills at exact price (no slippage by default)", () => {
    const r = applyFillRules({
      orderKind: "entry-limit",
      orderPrice: 100,
      side: "long",
      bar: bar(99, 101),
      slippageBps: 5,
      applySlippageToLimits: false,
    });
    expect(r).not.toBeNull();
    expect(r!.fillPrice).toBe(100);
  });

  it("stop fill (long): slips DOWN by bps", () => {
    const r = applyFillRules({
      orderKind: "stop-market",
      orderPrice: 100,
      side: "long",
      bar: bar(99, 101),
      slippageBps: 5,
      applySlippageToLimits: false,
    });
    expect(r!.fillPrice).toBeCloseTo(100 * (1 - 5 / 10_000), 6);
  });

  it("stop fill (short): slips UP by bps", () => {
    const r = applyFillRules({
      orderKind: "stop-market",
      orderPrice: 100,
      side: "short",
      bar: bar(99, 101),
      slippageBps: 5,
      applySlippageToLimits: false,
    });
    expect(r!.fillPrice).toBeCloseTo(100 * (1 + 5 / 10_000), 6);
  });

  it("limit slippage applies when opted in", () => {
    const r = applyFillRules({
      orderKind: "target-limit",
      orderPrice: 100,
      side: "long",
      bar: bar(99, 101),
      slippageBps: 5,
      applySlippageToLimits: true,
    });
    expect(r!.fillPrice).toBeCloseTo(100 * (1 - 5 / 10_000), 6);
  });
});

describe("checkStopFill / checkTargetFill helpers", () => {
  const cfg = {
    fillMode: "next-bar-touch" as const,
    sameBarConflict: "stop-wins" as const,
    slippageBps: 5,
    applySlippageToLimits: false,
    entryValidBars: 5,
    trailMode: "static" as const,
    maxBarsInTrade: null,
    softKillDrawdownPct: 20,
    hardKillDrawdownPct: 30,
    killSwitchReference: "peak" as const,
  };

  it("stop and target both inside bar range yield non-null results", () => {
    const stop = checkStopFill({
      side: "long",
      bar: bar(94, 106),
      stopPrice: 95,
      config: cfg,
    });
    const target = checkTargetFill({
      side: "long",
      bar: bar(94, 106),
      targetPrice: 105,
      config: cfg,
    });
    expect(stop).not.toBeNull();
    expect(target).not.toBeNull();
  });
});
