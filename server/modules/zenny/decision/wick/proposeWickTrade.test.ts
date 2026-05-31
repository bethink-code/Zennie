import { describe, expect, it } from "vitest";
import type { Candle, Timeframe } from "../../../../../shared/zennyTypes";
import type { ExtractedArms } from "../../analysis/arms/extractArms";
import type { AnalysisPool } from "../../analysis/orchestrator";
import type { Playbook, TfRegimeAssessment } from "../../analysis/regime/types";
import { DEFAULT_WICK_CONFIG } from "./defaultConfig";
import { proposeWickTrade } from "./proposeWickTrade";
import type { WickTradeConfig } from "./types";

// --- Fixtures --------------------------------------------------------------

function pool(opts: {
  id: string;
  type: "RESISTANCE" | "SUPPORT";
  linePrice: number;
  wickHigh: number;
  wickLow: number;
  verdict?: "turning-point" | "run-through" | "unconfirmed";
  fadeDirection?: "long" | "short" | null;
}): AnalysisPool {
  const turning = opts.verdict === "turning-point";
  return {
    id: opts.id,
    symbol: "BTCUSDT",
    sourceTimeframe: "15m",
    type: opts.type,
    kind: "pivot_probe",
    linePrice: opts.linePrice,
    wickHigh: opts.wickHigh,
    wickLow: opts.wickLow,
    centreLine: (opts.wickHigh + opts.wickLow) / 2,
    birthCandleTime: 0,
    birthCandleIndexOnPrimary: 0,
    sweptCandleTime: opts.verdict ? 1000 : null,
    sweptCandleIndexOnPrimary: opts.verdict ? 4 : null,
    sweepReason: opts.verdict ? "wick_took_pool_extreme" : null,
    deathCandleTime: null,
    deathCandleIndexOnPrimary: null,
    deathReason: null,
    status: opts.verdict ? "swept" : "active",
    confluenceCount: 1,
    strength: "strong",
    pull: {
      raw: 50,
      normalized: 80,
      decayed: 60,
      distancePct: 1,
      candlesMovingAway: 0,
      sEffectiveStandIn: 80,
    },
    qualification: opts.verdict
      ? {
          poolId: opts.id,
          verdict: opts.verdict,
          fadeDirection:
            opts.fadeDirection !== undefined
              ? opts.fadeDirection
              : turning
                ? opts.type === "RESISTANCE"
                  ? "short"
                  : "long"
                : null,
          swept: true,
          reclaimed: turning,
          structureShifted: turning,
          displacement: 1,
          reasons: [],
        }
      : null,
  };
}

function arms(args: {
  upper?: AnalysisPool;
  lower?: AnalysisPool;
  dominantSide: "upper" | "lower" | "neither";
}): ExtractedArms {
  return {
    upper: args.upper
      ? {
          side: "upper",
          pool: args.upper,
          pullDecayed: 60,
          role: args.dominantSide === "upper" ? "dominant" : "subordinate",
        }
      : null,
    lower: args.lower
      ? {
          side: "lower",
          pool: args.lower,
          pullDecayed: 60,
          role: args.dominantSide === "lower" ? "dominant" : "subordinate",
        }
      : null,
    dominantSide: args.dominantSide,
  };
}

function assessment(playbook: Playbook): TfRegimeAssessment {
  const stub = (p: Playbook) => ({
    playbook: p,
    tradeable: p === playbook,
    strength: p === playbook ? 0.7 : 0.2,
    confidence: 0.6,
    reasons: [],
    drivers: [],
  });
  return {
    timeframe: "15m",
    pattern: "RANGING",
    playbooks: {
      accumulation: stub("accumulation"),
      ranging: stub("ranging"),
      trending: stub("trending"),
      breakout: stub("breakout"),
    },
    recommended: { playbook, strength: 0.7 },
    inputs: {
      angle: { available: false, reason: "test" },
      dwell: { available: false, reason: "test" },
      boundaryDistance: { available: false, reason: "test" },
      htfAgreement: { available: false, reason: "test" },
      armPull: { available: false, reason: "test" },
      poolStrength: { available: false, reason: "test" },
      polarityFlips: { available: false, reason: "test" },
      touchQuality: { available: false, reason: "test" },
      recency: { available: false, reason: "test" },
      feedHealth: { available: false, reason: "test" },
      liquidationProximity: { available: false, reason: "test" },
      spread: { available: false, reason: "test" },
      depth: { available: false, reason: "test" },
      ofi: { available: false, reason: "test" },
      volumeDelta: { available: false, reason: "test" },
      cancelPullRatio: { available: false, reason: "test" },
      realizedVolatility: { available: false, reason: "test" },
      tickDensity: { available: false, reason: "test" },
      absorption: { available: false, reason: "test" },
    },
  };
}

// Flat, zero-range candles so ATR = 0 and buffer = percentage × price (0.2%),
// keeping geometry assertions exact.
function flatCandles(price: number, n = 20): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    open: price,
    high: price,
    low: price,
    close: price,
    openTime: i * 1000,
    closeTime: i * 1000 + 999,
    volume: 1,
  }));
}

function cfg(overrides: Partial<WickTradeConfig> = {}): WickTradeConfig {
  return { ...DEFAULT_WICK_CONFIG, ...overrides };
}

const TF: Timeframe = "15m";

// --- Tests -----------------------------------------------------------------

describe("proposeWickTrade — fades qualified turning points", () => {
  it("RANGING + turning-point RESISTANCE → short midpoint fade", () => {
    const upper = pool({
      id: "u",
      type: "RESISTANCE",
      linePrice: 100,
      wickHigh: 106,
      wickLow: 100,
      verdict: "turning-point",
    });
    const lower = pool({
      id: "l",
      type: "SUPPORT",
      linePrice: 90,
      wickHigh: 90,
      wickLow: 86,
    });
    const plan = proposeWickTrade({
      timeframe: TF,
      candles: flatCandles(99),
      currentPrice: 99,
      arms: arms({ upper, lower, dominantSide: "upper" }),
      pools: [upper, lower],
      assessment: assessment("ranging"),
      config: cfg({
        regimeMatrix: {
          ...DEFAULT_WICK_CONFIG.regimeMatrix,
          ranging: ["midpoint"],
        },
      }),
    });
    expect(plan).not.toBeNull();
    expect(plan!.side).toBe("short");
    expect(plan!.entry).toBeCloseTo(103, 5); // (100+106)/2
    expect(plan!.stop).toBeCloseTo(106 + 0.198, 2); // wickHigh + 0.2%×99
    expect(plan!.target).toBe(88); // lower centre = (86+90)/2
    expect(plan!.anchorPoolId).toBe("u");
    expect(plan!.rationale[0]).toMatch(/turning-point/);
  });

  it("RANGING + turning-point SUPPORT → long midpoint fade", () => {
    const lower = pool({
      id: "l",
      type: "SUPPORT",
      linePrice: 100,
      wickHigh: 100,
      wickLow: 94,
      verdict: "turning-point",
    });
    const upper = pool({
      id: "u",
      type: "RESISTANCE",
      linePrice: 110,
      wickHigh: 114,
      wickLow: 110,
    });
    const plan = proposeWickTrade({
      timeframe: TF,
      candles: flatCandles(101),
      currentPrice: 101,
      arms: arms({ upper, lower, dominantSide: "lower" }),
      pools: [upper, lower],
      assessment: assessment("ranging"),
      config: cfg({
        regimeMatrix: {
          ...DEFAULT_WICK_CONFIG.regimeMatrix,
          ranging: ["midpoint"],
        },
      }),
    });
    expect(plan).not.toBeNull();
    expect(plan!.side).toBe("long");
    expect(plan!.entry).toBe(97); // (94+100)/2
    expect(plan!.target).toBe(112); // upper centre
  });

  it("under-touching entry sits at the body line", () => {
    const upper = pool({
      id: "u",
      type: "RESISTANCE",
      linePrice: 100,
      wickHigh: 106,
      wickLow: 100,
      verdict: "turning-point",
    });
    const lower = pool({
      id: "l",
      type: "SUPPORT",
      linePrice: 90,
      wickHigh: 90,
      wickLow: 86,
    });
    const plan = proposeWickTrade({
      timeframe: TF,
      candles: flatCandles(99),
      currentPrice: 99,
      arms: arms({ upper, lower, dominantSide: "upper" }),
      pools: [upper, lower],
      assessment: assessment("ranging"),
      config: cfg({
        regimeMatrix: {
          ...DEFAULT_WICK_CONFIG.regimeMatrix,
          ranging: ["under-touching"],
        },
      }),
    });
    expect(plan).not.toBeNull();
    expect(plan!.entry).toBe(100); // linePrice
  });

  it("does NOT fade a run-through pool", () => {
    const upper = pool({
      id: "u",
      type: "RESISTANCE",
      linePrice: 100,
      wickHigh: 106,
      wickLow: 100,
      verdict: "run-through",
      fadeDirection: null,
    });
    const lower = pool({
      id: "l",
      type: "SUPPORT",
      linePrice: 90,
      wickHigh: 90,
      wickLow: 86,
    });
    const plan = proposeWickTrade({
      timeframe: TF,
      candles: flatCandles(99),
      currentPrice: 99,
      arms: arms({ upper, lower, dominantSide: "upper" }),
      pools: [upper, lower],
      assessment: assessment("ranging"),
    });
    expect(plan).toBeNull();
  });

  it("returns null when there are no turning-point pools", () => {
    const upper = pool({
      id: "u",
      type: "RESISTANCE",
      linePrice: 100,
      wickHigh: 106,
      wickLow: 100,
    });
    const plan = proposeWickTrade({
      timeframe: TF,
      candles: flatCandles(99),
      currentPrice: 99,
      arms: arms({ upper, dominantSide: "upper" }),
      pools: [upper],
      assessment: assessment("ranging"),
    });
    expect(plan).toBeNull();
  });

  it("regime gate: does not fade in TRENDING even with a turning point", () => {
    const upper = pool({
      id: "u",
      type: "RESISTANCE",
      linePrice: 100,
      wickHigh: 106,
      wickLow: 100,
      verdict: "turning-point",
    });
    const lower = pool({
      id: "l",
      type: "SUPPORT",
      linePrice: 90,
      wickHigh: 90,
      wickLow: 86,
    });
    const plan = proposeWickTrade({
      timeframe: TF,
      candles: flatCandles(99),
      currentPrice: 99,
      arms: arms({ upper, lower, dominantSide: "upper" }),
      pools: [upper, lower],
      assessment: assessment("trending"), // fade matrix is empty here
    });
    expect(plan).toBeNull();
  });

  it("picks the turning point nearest current price", () => {
    const near = pool({
      id: "near",
      type: "RESISTANCE",
      linePrice: 101,
      wickHigh: 104,
      wickLow: 101,
      verdict: "turning-point",
    });
    const far = pool({
      id: "far",
      type: "RESISTANCE",
      linePrice: 130,
      wickHigh: 134,
      wickLow: 130,
      verdict: "turning-point",
    });
    const lower = pool({
      id: "l",
      type: "SUPPORT",
      linePrice: 90,
      wickHigh: 90,
      wickLow: 86,
    });
    const plan = proposeWickTrade({
      timeframe: TF,
      candles: flatCandles(99),
      currentPrice: 99,
      arms: arms({ upper: near, lower, dominantSide: "upper" }),
      pools: [far, near, lower],
      assessment: assessment("ranging"),
    });
    expect(plan).not.toBeNull();
    expect(plan!.anchorPoolId).toBe("near");
  });

  it("returns null when regime has no recommended playbook", () => {
    const upper = pool({
      id: "u",
      type: "RESISTANCE",
      linePrice: 100,
      wickHigh: 106,
      wickLow: 100,
      verdict: "turning-point",
    });
    const a = assessment("ranging");
    a.recommended = null;
    const plan = proposeWickTrade({
      timeframe: TF,
      candles: flatCandles(99),
      currentPrice: 99,
      arms: arms({ upper, dominantSide: "upper" }),
      pools: [upper],
      assessment: a,
    });
    expect(plan).toBeNull();
  });
});
