// computeBuffer — distance past the wick used for stops and (where applicable)
// entries. Three rules supported:
//
//   percentage : buffer = price × percentage
//   atr        : buffer = ATR(period) × atrMultiple
//   max        : buffer = max(percentage rule, atr rule). The default; covers
//                both the % default the SFP literature uses and the vol-aware
//                default the volatility-stop literature uses.
//
// When the ATR cannot be computed (insufficient candles) and rule is 'atr' or
// 'max', the rule degrades to 'percentage'. Documented gracefully — never
// returns null. Pure function.

import type { Candle } from "../../../../../shared/zennyTypes";
import { computeATR } from "./computeATR";
import type { BufferConfig } from "./types";

export function computeBuffer(
  price: number,
  candles: Candle[],
  config: BufferConfig,
): number {
  const pctBuffer = price * config.percentage;
  if (config.rule === "percentage") return pctBuffer;

  const atr = computeATR(candles, config.atrPeriod);
  const atrBuffer = atr === null ? null : atr * config.atrMultiple;

  if (config.rule === "atr") {
    // ATR unavailable → fall back to percentage. Better to take a trade with
    // a defensible % stop than to skip because of a missing indicator.
    return atrBuffer ?? pctBuffer;
  }

  // 'max' rule — the larger of the two.
  if (atrBuffer === null) return pctBuffer;
  return Math.max(pctBuffer, atrBuffer);
}
