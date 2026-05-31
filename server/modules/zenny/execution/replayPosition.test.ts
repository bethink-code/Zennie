import { describe, expect, it } from "vitest";
import { createPosition } from "./createPosition";
import { DEFAULT_EXECUTION_CONFIG } from "./executionConfig";
import { replayPosition } from "./replayPosition";
import type { ExecutionBar, PositionRecord } from "./types";
import type { TradePlan } from "../decision/types";

const TF_MS = 60 * 60 * 1000; // 1H

function plan(opts: {
  side?: "long" | "short";
  entry: number;
  stop: number;
  target: number;
}): TradePlan {
  return {
    timeframe: "1H",
    playbook: "ranging",
    phase: "take",
    side: opts.side ?? "long",
    entry: opts.entry,
    stop: opts.stop,
    target: opts.target,
    riskRewardRatio:
      Math.abs(opts.target - opts.entry) / Math.abs(opts.entry - opts.stop),
    riskPct: 1,
    sizeMultiplier: 1,
    anchorPoolId: "p1",
    rationale: ["test"],
  };
}

function bar(opts: {
  openTime: number;
  high: number;
  low: number;
  close?: number;
}): ExecutionBar {
  return {
    openTime: opts.openTime,
    closeTime: opts.openTime + TF_MS - 1,
    open: (opts.high + opts.low) / 2,
    high: opts.high,
    low: opts.low,
    close: opts.close ?? (opts.high + opts.low) / 2,
  };
}

function newPos(p: TradePlan): PositionRecord {
  return createPosition({
    id: "test-1",
    symbol: "BTCUSDT",
    plan: p,
    emittedAtBarTs: 0,
    accountRiskPct: p.riskPct,
  });
}

describe("replayPosition — multi-bar replay in a single tick", () => {
  it("drives PLANNED → LIVE → FILLED → CLOSED across four bars in one call", () => {
    const pos = newPos(plan({ entry: 100, stop: 95, target: 130 }));
    const bars: ExecutionBar[] = [
      bar({ openTime: TF_MS, high: 99, low: 97 }), // PLANNED → LIVE
      bar({ openTime: 2 * TF_MS, high: 102, low: 99 }), // entry 100 touched → FILLED
      bar({ openTime: 3 * TF_MS, high: 105, low: 99 }), // holds, no exit
      bar({ openTime: 4 * TF_MS, high: 132, low: 120 }), // target 130 hit → CLOSED
    ];
    const out = replayPosition({
      position: pos,
      bars,
      equity: 10_000,
      config: DEFAULT_EXECUTION_CONFIG,
    });
    expect(out.status).toBe("CLOSED");
    expect(out.exitReason).toBe("target");
    expect(out.closedAtBarTs).toBe(4 * TF_MS);
    expect(out.realisedPnl).not.toBeNull();
    expect(out.realisedPnl!).toBeGreaterThan(0);
  });

  it("honours a stop on an intermediate bar even when the LATEST bar hits target", () => {
    // The regression that motivates batching: at hourly cadence four 15m bars
    // accumulate. The old single-latest-bar logic would only see the final
    // bar — here a target hit — and book a winner. Replaying every bar catches
    // the stop that actually fired two bars earlier.
    const pos = newPos(plan({ entry: 100, stop: 95, target: 130 }));
    const bars: ExecutionBar[] = [
      bar({ openTime: TF_MS, high: 99, low: 97 }), // PLANNED → LIVE
      bar({ openTime: 2 * TF_MS, high: 102, low: 99 }), // entry touched → FILLED
      bar({ openTime: 3 * TF_MS, high: 101, low: 94 }), // stop 95 hit → CLOSED (loss)
      bar({ openTime: 4 * TF_MS, high: 131, low: 120 }), // target territory — too late
    ];
    const out = replayPosition({
      position: pos,
      bars,
      equity: 10_000,
      config: DEFAULT_EXECUTION_CONFIG,
    });
    expect(out.status).toBe("CLOSED");
    expect(out.exitReason).toBe("stop");
    expect(out.closedAtBarTs).toBe(3 * TF_MS);
    expect(out.realisedPnl!).toBeLessThan(0);
  });

  it("is idempotent — skips already-evaluated bars and re-running is stable", () => {
    const pos = newPos(plan({ entry: 100, stop: 95, target: 130 }));
    const bars: ExecutionBar[] = [
      bar({ openTime: TF_MS, high: 99, low: 97 }),
      bar({ openTime: 2 * TF_MS, high: 102, low: 99 }),
      bar({ openTime: 3 * TF_MS, high: 101, low: 94 }),
    ];
    const first = replayPosition({
      position: pos,
      bars,
      equity: 10_000,
      config: DEFAULT_EXECUTION_CONFIG,
    });
    // Cron fires again in the same window with the same bars — must no-op.
    const second = replayPosition({
      position: first,
      bars,
      equity: 10_000,
      config: DEFAULT_EXECUTION_CONFIG,
    });
    expect(second).toEqual(first);
    expect(second.closedAtBarTs).toBe(3 * TF_MS);
  });
});
