import { describe, expect, it } from "vitest";
import type { Candle } from "../../../../../shared/zennyTypes";
import type { BodyPivot } from "../../analysis/level/findBodyPivots";
import type { AnalysisPool } from "../../analysis/orchestrator";
import { qualifyPool } from "./qualifyPool";

function c(
  i: number,
  close: number,
  high = close + 0.5,
  low = close - 0.5,
): Candle {
  return {
    openTime: i * 900_000,
    closeTime: i * 900_000 + 900_000,
    open: close,
    high,
    low,
    close,
    volume: 1,
  };
}

function lowPivot(index: number, price: number): BodyPivot {
  return {
    index,
    side: "SUPPORT",
    price,
    wickPrice: price - 1,
    candleOpenTime: index * 900_000,
  };
}
function highPivot(index: number, price: number): BodyPivot {
  return {
    index,
    side: "RESISTANCE",
    price,
    wickPrice: price + 1,
    candleOpenTime: index * 900_000,
  };
}

function pool(opts: {
  type: "RESISTANCE" | "SUPPORT";
  linePrice: number;
  wickHigh: number;
  wickLow: number;
  status?: "active" | "swept" | "dead";
  sweptCandleIndexOnPrimary?: number | null;
}): AnalysisPool {
  return {
    id: "p1",
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
    sweptCandleTime: opts.sweptCandleIndexOnPrimary != null ? 1000 : null,
    sweptCandleIndexOnPrimary: opts.sweptCandleIndexOnPrimary ?? null,
    sweepReason:
      opts.sweptCandleIndexOnPrimary != null ? "wick_took_pool_extreme" : null,
    deathCandleTime: null,
    deathCandleIndexOnPrimary: null,
    deathReason: null,
    status: opts.status ?? "active",
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
  };
}

describe("qualifyPool", () => {
  it("is unconfirmed when the pool was never swept", () => {
    const candles = [100, 100, 100, 100].map((v, i) => c(i, v));
    const out = qualifyPool({
      pool: pool({
        type: "RESISTANCE",
        linePrice: 100,
        wickHigh: 101,
        wickLow: 99,
        status: "active",
      }),
      candles,
      pivots: [],
    });
    expect(out.verdict).toBe("unconfirmed");
    expect(out.swept).toBe(false);
  });

  it("turning-point: RESISTANCE sweep that reclaims then shifts structure DOWN → fade short", () => {
    // idx5 sweeps above wickHigh(101) but closes back below linePrice(100) →
    // reclaim. idx7 closes below the swing low 95 → bearish MSS.
    const closes = [98, 97, 95, 96, 99, 99, 98, 94, 94, 94];
    const candles = closes.map((v, i) =>
      i === 5 ? c(i, 99, 102 /* sweeps */, 98) : c(i, v),
    );
    const out = qualifyPool({
      pool: pool({
        type: "RESISTANCE",
        linePrice: 100,
        wickHigh: 101,
        wickLow: 99,
        status: "swept",
        sweptCandleIndexOnPrimary: 5,
      }),
      candles,
      pivots: [lowPivot(2, 95)],
    });
    expect(out.verdict).toBe("turning-point");
    expect(out.fadeDirection).toBe("short");
    expect(out.reclaimed).toBe(true);
    expect(out.structureShifted).toBe(true);
  });

  it("run-through: RESISTANCE sweep that does NOT reclaim and breaks structure UP → do not fade", () => {
    // Closes stay above linePrice(100); idx7 closes above the swing high 103 →
    // bullish BOS, continuation.
    const closes = [101, 101, 103, 101, 101, 100.5, 101, 105, 105, 105];
    const candles = closes.map((v, i) =>
      i === 5 ? c(i, 100.5, 102 /* sweeps */, 100) : c(i, v),
    );
    const out = qualifyPool({
      pool: pool({
        type: "RESISTANCE",
        linePrice: 100,
        wickHigh: 101,
        wickLow: 99,
        status: "swept",
        sweptCandleIndexOnPrimary: 5,
      }),
      candles,
      pivots: [highPivot(2, 103)],
    });
    expect(out.verdict).toBe("run-through");
    expect(out.fadeDirection).toBeNull();
    expect(out.reclaimed).toBe(false);
  });

  it("unconfirmed: swept and reclaimed but no structure shift (full sequence required)", () => {
    const closes = [98, 97, 95, 96, 99, 99, 98, 99, 99, 99];
    const candles = closes.map((v, i) =>
      i === 5 ? c(i, 99, 102, 98) : c(i, v),
    );
    const out = qualifyPool({
      pool: pool({
        type: "RESISTANCE",
        linePrice: 100,
        wickHigh: 101,
        wickLow: 99,
        status: "swept",
        sweptCandleIndexOnPrimary: 5,
      }),
      candles,
      pivots: [lowPivot(2, 90)], // never broken — no MSS
    });
    expect(out.verdict).toBe("unconfirmed");
    expect(out.reclaimed).toBe(true);
    expect(out.structureShifted).toBe(false);
  });

  it("reclaim-only qualifies as turning-point when requireStructureShift is off", () => {
    const closes = [98, 97, 95, 96, 99, 99, 98, 99, 99, 99];
    const candles = closes.map((v, i) =>
      i === 5 ? c(i, 99, 102, 98) : c(i, v),
    );
    const out = qualifyPool({
      pool: pool({
        type: "RESISTANCE",
        linePrice: 100,
        wickHigh: 101,
        wickLow: 99,
        status: "swept",
        sweptCandleIndexOnPrimary: 5,
      }),
      candles,
      pivots: [lowPivot(2, 90)],
      config: {
        reclaimMaxBars: 3,
        structureLookbackPivots: 3,
        minShiftDisplacementPct: 0.001,
        requireStructureShift: false,
      },
    });
    expect(out.verdict).toBe("turning-point");
  });
});
