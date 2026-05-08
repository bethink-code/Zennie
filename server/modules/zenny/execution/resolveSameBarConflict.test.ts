import { describe, expect, it } from "vitest";
import { resolveSameBarConflict } from "./resolveSameBarConflict";
import type { ExecutionBar } from "./types";

const bar = (open: number, high: number, low: number): ExecutionBar => ({
  openTime: 0,
  closeTime: 1,
  open,
  high,
  low,
  close: open,
});

describe("resolveSameBarConflict", () => {
  it("stop-wins always returns stop-market", () => {
    expect(
      resolveSameBarConflict({
        bar: bar(100, 110, 90),
        side: "long",
        mode: "stop-wins",
      }),
    ).toBe("stop-market");
  });

  it("target-wins always returns target-limit", () => {
    expect(
      resolveSameBarConflict({
        bar: bar(100, 110, 90),
        side: "long",
        mode: "target-wins",
      }),
    ).toBe("target-limit");
  });

  it("ohlc-heuristic, bullish bar (open near low), long position → stop hit first", () => {
    // open=92, high=110, low=90 — open is close to low → low-first → stop.
    const out = resolveSameBarConflict({
      bar: bar(92, 110, 90),
      side: "long",
      mode: "ohlc-heuristic",
    });
    expect(out).toBe("stop-market");
  });

  it("ohlc-heuristic, bearish bar (open near high), long position → target hit first", () => {
    // open=108, high=110, low=90 — open near high → high-first → target.
    const out = resolveSameBarConflict({
      bar: bar(108, 110, 90),
      side: "long",
      mode: "ohlc-heuristic",
    });
    expect(out).toBe("target-limit");
  });

  it("ohlc-heuristic, bullish bar, short position → target hit first", () => {
    // For short with stop above + target below, low-first means target hit first.
    const out = resolveSameBarConflict({
      bar: bar(92, 110, 90),
      side: "short",
      mode: "ohlc-heuristic",
    });
    expect(out).toBe("target-limit");
  });
});
