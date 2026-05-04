// TouchCount pass — for each level, count subsequent re-tests on the level's
// own source TF. A re-test is a candle whose wick reached within tolerancePct
// of the level price, where the PREVIOUS candle's wick did not (i.e., a
// fresh approach from outside the zone, not consolidation).
//
// Stops counting at the candle that breaks the level (close past), since
// touches after a break don't mean the same thing.
//
// Output per level (under key "touchCount"):
//   { value: number }

import type { AnalysisLevel } from "../orchestrator";
import type { PassRunInput, TouchCountPassConfig } from "./types";

export interface TouchCountPassResult {
  value: number;
}

export function runTouchCountPass(
  input: PassRunInput,
  config: TouchCountPassConfig,
): Map<string, TouchCountPassResult> {
  const results = new Map<string, TouchCountPassResult>();
  if (!config.enabled) return results;

  for (const level of input.levels) {
    const candles = input.perTfCandles.get(level.sourceTimeframe);
    if (!candles || candles.length === 0) {
      results.set(level.id, { value: 0 });
      continue;
    }

    const startIdx = candles.findIndex(
      (c) => c.openTime === level.swingCandleTime,
    );
    if (startIdx < 0) {
      results.set(level.id, { value: 0 });
      continue;
    }

    const lookforward =
      config.lookforwardCandles > 0
        ? Math.min(candles.length - 1, startIdx + config.lookforwardCandles)
        : candles.length - 1;

    const inZone = (c: { high: number; low: number }): boolean => {
      if (level.side === "RESISTANCE") {
        return c.high >= level.price * (1 - config.tolerancePct);
      }
      return c.low <= level.price * (1 + config.tolerancePct);
    };

    let count = 0;
    // The level's birth candle is, by definition, in its own zone. Start
    // from that state so immediate consolidation after birth is not counted
    // as a fresh re-test.
    let prevInZone = true;
    for (let i = startIdx + 1; i <= lookforward; i++) {
      const c = candles[i];
      if (level.side === "RESISTANCE" && c.close > level.price) break;
      if (level.side === "SUPPORT" && c.close < level.price) break;

      const cur = inZone(c);
      if (cur && !prevInZone) count += 1;
      prevInZone = cur;
    }
    results.set(level.id, { value: count });
  }
  return results;
}
