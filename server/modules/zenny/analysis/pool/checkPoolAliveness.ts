// checkPoolAliveness — has price swept the pool, or been ACCEPTED beyond it?
//
// A liquidity pool is the wick zone beside a swing. Its lifecycle is read off
// the later (trading-TF) candles after birth:
// - active: no later candle reached the wick extreme — the resting liquidity
//           at the extreme is untouched.
// - swept:  a later wick traded THROUGH the extreme (took the liquidity) but no
//           candle has CLOSED beyond it — price poked and was rejected. This is
//           the fade setup the strategy trades.
// - dead:   a later candle CLOSED beyond the extreme — price accepted past the
//           swept level; the pool is consumed (continuation), do not fade.
//
// Death is measured at the wick EXTREME (deathLine default), NOT the body line.
// Measuring death at the body line (the low edge of the zone) killed pools on
// any minor drift up before a clean sweep-and-reject could ever register as
// swept — starving the fade strategy. deathLine is a caller-tunable so the
// boundary can be calibrated later against measured base rates.

import type { Candle } from "../../../../../shared/zennyTypes";

export type PoolStatus = "active" | "swept" | "dead";
export type DeathReason = "close_past_line";
export type SweepReason = "wick_took_pool_extreme";

export type PoolAlivenessSide = "RESISTANCE" | "SUPPORT";

export interface AlivenessInput {
  candles: Candle[];
  startIndex: number; // index of the pivot/birth candle
  wickHigh: number;
  wickLow: number;
  side: PoolAlivenessSide;
  // Wick extreme — a high/low beyond this takes the liquidity (swept).
  // Defaults to the wick extreme for the side.
  sweepPrice?: number;
  // Close beyond this = accepted past the level = dead. Defaults to the wick
  // extreme: a pool dies only when price closes past the swept extreme, not on
  // a drift into the zone.
  deathLine?: number;
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
  const extreme = input.side === "RESISTANCE" ? input.wickHigh : input.wickLow;
  const sweepPrice = input.sweepPrice ?? extreme;
  const deathLine = input.deathLine ?? extreme;

  let sweptCandleIndex: number | null = null;
  let sweptCandleOpenTime: number | null = null;

  for (let i = input.startIndex + 1; i < input.candles.length; i++) {
    const candle = input.candles[i];

    if (sweptCandleIndex === null) {
      const swept =
        input.side === "RESISTANCE"
          ? candle.high > sweepPrice
          : candle.low < sweepPrice;
      if (swept) {
        sweptCandleIndex = i;
        sweptCandleOpenTime = candle.openTime;
      }
    }

    const dead =
      input.side === "RESISTANCE"
        ? candle.close > deathLine
        : candle.close < deathLine;
    if (dead) {
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
