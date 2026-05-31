import { describe, expect, it } from "vitest";
import { cancelPosition } from "./cancelPosition";
import { createPosition } from "./createPosition";
import type { TradePlan } from "../decision/types";

const PLAN: TradePlan = {
  timeframe: "1H",
  playbook: "ranging",
  phase: "take",
  side: "long",
  entry: 100,
  stop: 95,
  target: 110,
  riskRewardRatio: 2,
  riskPct: 1,
  sizeMultiplier: 1,
  anchorPoolId: "p1",
  rationale: ["test"],
};

describe("cancelPosition", () => {
  it("PLANNED → CANCELLED with operator reason", () => {
    const pos = createPosition({
      id: "p",
      symbol: "BTCUSDT",
      plan: PLAN,
      emittedAtBarTs: 0,
      accountRiskPct: PLAN.riskPct,
    });
    const next = cancelPosition({
      position: pos,
      reason: "operator",
      atBarTs: 1000,
    });
    expect(next.status).toBe("CANCELLED");
    expect(next.exitReason).toBe("operator");
    expect(next.lastEvaluatedAt).toBe(1000);
  });

  it("idempotent on already-cancelled positions", () => {
    const pos = createPosition({
      id: "p",
      symbol: "BTCUSDT",
      plan: PLAN,
      emittedAtBarTs: 0,
      accountRiskPct: PLAN.riskPct,
    });
    const cancelled = cancelPosition({
      position: pos,
      reason: "operator",
      atBarTs: 1000,
    });
    const again = cancelPosition({
      position: cancelled,
      reason: "kill-switch",
      atBarTs: 2000,
    });
    expect(again).toBe(cancelled); // identical reference; no transition
  });
});
