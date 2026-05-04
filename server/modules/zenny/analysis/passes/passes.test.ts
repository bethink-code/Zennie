import { describe, expect, it } from "vitest";
import type { Candle, Timeframe } from "../../../../../shared/zennyTypes";
import type { AnalysisLevel } from "../orchestrator";
import { runAggregatePass } from "./aggregatePass";
import { runPolarityFlipPass } from "./polarityFlipPass";
import { runRecencyPass } from "./recencyPass";
import { runTouchCountPass } from "./touchCountPass";
import type { PassRunInput } from "./types";

function c(i: number, open: number, high: number, low: number, close: number): Candle {
  return {
    openTime: i,
    closeTime: i + 1,
    open,
    high,
    low,
    close,
    volume: 1,
  };
}

function level(overrides: Partial<AnalysisLevel> = {}): AnalysisLevel {
  return {
    id: "L1",
    price: 100,
    wickPrice: 110,
    side: "RESISTANCE",
    sourceTimeframe: "D",
    swingCandleTime: 0,
    swingCandleIndexOnPrimary: 0,
    source: "swing",
    matchingTimeframes: [],
    confluenceCount: 0,
    clusterMemberIds: [],
    recency: 0,
    strength: "medium",
    graduatedToPoolId: null,
    broken: false,
    passes: {},
    ...overrides,
  };
}

function input(levels: AnalysisLevel[], primaryCandles: Candle[], tf: Timeframe = "D"): PassRunInput {
  return {
    levels,
    perTfCandles: new Map([[tf, primaryCandles]]),
    primaryCandles,
    primaryTimeframe: tf,
  };
}

describe("passes", () => {
  it("does not count immediate post-birth consolidation as a fresh retest", () => {
    const candles = [
      c(0, 99, 101, 98, 100),
      c(1, 99, 100.5, 98, 99.5),
      c(2, 95, 96, 94, 95),
      c(3, 96, 100.25, 95, 96),
    ];

    const results = runTouchCountPass(input([level()], candles), {
      enabled: true,
      lookforwardCandles: 0,
      tolerancePct: 0.002,
    });

    expect(results.get("L1")).toEqual({ value: 1 });
  });

  it("supports linear and exponential recency scoring", () => {
    const candles = [c(0, 1, 1, 1, 1), c(1, 1, 1, 1, 1), c(2, 1, 1, 1, 1)];
    const levels = [level({ recency: 0.5, swingCandleIndexOnPrimary: 1 })];

    expect(
      runRecencyPass(input(levels, candles), {
        enabled: true,
        curve: "linear",
        halfLifeCandles: 1,
        threshold: 0.2,
      }).get("L1"),
    ).toEqual({ value: 0.5, wouldFilter: false });

    expect(
      runRecencyPass(input(levels, candles), {
        enabled: true,
        curve: "exponential",
        halfLifeCandles: 1,
        threshold: 0.6,
      }).get("L1"),
    ).toEqual({ value: 0.5, wouldFilter: true });
  });

  it("does not flip polarity from current price alone", () => {
    const candles = [
      c(0, 100, 101, 99, 99),
      c(1, 99, 103, 98, 102),
      c(2, 102, 104, 101, 103),
    ];

    expect(
      runPolarityFlipPass(input([level()], candles), { enabled: true }).get("L1"),
    ).toEqual({ effectiveSide: "RESISTANCE", flipped: false, crossings: 0 });
  });

  it("flips polarity after a close-through and retest from the new side", () => {
    const candles = [
      c(0, 100, 101, 99, 99),
      c(1, 99, 103, 98, 102),
      c(2, 102, 103, 99.95, 101),
      c(3, 101, 104, 100.5, 103),
    ];

    expect(
      runPolarityFlipPass(input([level()], candles), { enabled: true }).get("L1"),
    ).toEqual({ effectiveSide: "SUPPORT", flipped: true, crossings: 0 });
  });

  it("applies broken penalties to aggregate scores", () => {
    const results = runAggregatePass(
      [
        level({
          broken: true,
          passes: {
            recency: { value: 1 },
            lastLeg: { value: 1 },
            touchCount: { value: 3 },
          },
        }),
      ],
      {
        enabled: true,
        weightRecency: 1,
        weightLastLeg: 1,
        weightTouchCount: 1,
        brokenPenalty: 0.3,
        strengthThreshold: 0,
      },
    );

    expect(results.get("L1")).toEqual({
      score: 0.3,
      contributors: ["recency", "lastLeg", "touchCount"],
    });
  });
});
