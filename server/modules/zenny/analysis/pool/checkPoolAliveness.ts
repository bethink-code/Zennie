// checkPoolAliveness - has price swept the pool or closed past the level?
//
// Pool state is intentionally split from structural level breakage:
// - active: no later candle took the wick-side liquidity
// - swept: a later wick traded through the pool extreme, but no close broke
//          the body line
// - dead: a later close crossed the body line; structure failed
//
// This preserves the TA distinction we care about: wicks can consume stops
// without invalidating the level. A close past the body line is the separate
// commitment signal.

import type { Candle } from "../../../../../shared/zennyTypes";

export type PoolStatus = "active" | "swept" | "dead";
export type DeathReason = "close_past_line";
export type SweepReason = "wick_took_pool_extreme";

export type PoolAlivenessSide = "RESISTANCE" | "SUPPORT";

export interface AlivenessInput {
  candles: Candle[];
  startIndex: number; // index of the pivot candle
  linePrice: number; // body-extreme line
  sweepPrice?: number; // liquidity is consumed once price trades through this
  wickHigh: number;
  wickLow: number;
  side: PoolAlivenessSide;
}

export interface AlivenessResult {
  status: PoolStatus;
  sweptCandleIndex: number | null;
  sweptCandleOpenTime: number | null;
  sweepReason: SweepReason | null;
  deathCandleIndex: number | null;
  deathCandleOpenTime: number | null;
  deathReason: DeathReason | null;
}

export function checkPoolAliveness(input: AlivenessInput): AlivenessResult {
  let sweptCandleIndex: number | null = null;
  let sweptCandleOpenTime: number | null = null;

  for (let i = input.startIndex + 1; i < input.candles.length; i++) {
    const candle = input.candles[i];
    const close = candle.close;

    if (sweptCandleIndex === null) {
      const sweepPrice =
        input.sweepPrice ??
        (input.side === "RESISTANCE" ? input.wickHigh : input.wickLow);
      const swept =
        input.side === "RESISTANCE"
          ? candle.high > sweepPrice
          : candle.low < sweepPrice;
      if (swept) {
        sweptCandleIndex = i;
        sweptCandleOpenTime = candle.openTime;
      }
    }

    if (input.side === "RESISTANCE" && close > input.linePrice) {
      return {
        status: "dead",
        sweptCandleIndex,
        sweptCandleOpenTime,
        sweepReason:
          sweptCandleIndex !== null ? "wick_took_pool_extreme" : null,
        deathCandleIndex: i,
        deathCandleOpenTime: candle.openTime,
        deathReason: "close_past_line",
      };
    }

    if (input.side === "SUPPORT" && close < input.linePrice) {
      return {
        status: "dead",
        sweptCandleIndex,
        sweptCandleOpenTime,
        sweepReason:
          sweptCandleIndex !== null ? "wick_took_pool_extreme" : null,
        deathCandleIndex: i,
        deathCandleOpenTime: candle.openTime,
        deathReason: "close_past_line",
      };
    }
  }

  return {
    status: sweptCandleIndex === null ? "active" : "swept",
    sweptCandleIndex,
    sweptCandleOpenTime,
    sweepReason: sweptCandleIndex !== null ? "wick_took_pool_extreme" : null,
    deathCandleIndex: null,
    deathCandleOpenTime: null,
    deathReason: null,
  };
}
