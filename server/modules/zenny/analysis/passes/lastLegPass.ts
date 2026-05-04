// LastLeg pass — structural recency.
//
// Walks the PRIMARY timeframe candles tracking running wick highs and lows.
// Confirms a swing when price reverses by reversalPct from the
// running extreme.
//
// The pass returns the LAST N swings in the order they occurred (typically
// alternating high, low, high, low). Each level is scored by proximity to
// the closest of those swings:
//   value = max(0, 1 - distancePct / tolerancePct)
// Levels right at a swing extreme score 1.0; levels at or beyond
// tolerancePct away score 0. Smooth linear fall-off in between.
//
// Why N>1? "Last leg" in the user's framing means the bounding swings of
// the most recent move(s). With N=3 you get the absolute high, the
// reversal low, and the current up-leg high (or whatever shape the recent
// price action took). The ONE-most-recent-swing version misses the
// structural top from earlier in the same window.
//
// Why wick extremes? For liquidity-pool trading, the leg top/bottom is where
// price probed and rejected. The actual level can still be body-anchored,
// but structural swing detection should see the wick that ended the leg.

import type { Candle } from "../../../../../shared/zennyTypes";
import type { AnalysisLevel } from "../orchestrator";
import type { PassRunInput, LastLegPassConfig } from "./types";

export interface LastLegSwing {
  index: number;
  price: number;
  openTime: number;
  type: "high" | "low";
}

export interface LastLegPassResult {
  value: number; // 0..1, max proximity to nearest swing
  nearestSwing: "high" | "low" | null;
  swingsConsidered: number; // how many swings the score was computed against
}

// Walk the candles confirming swings. Returns ALL detected swings in order.
// The pass that consumes this picks the last N.
export function findLastLegSwings(
  candles: Candle[],
  reversalPct: number,
): LastLegSwing[] {
  if (candles.length === 0) return [];

  let runMaxIdx = 0;
  let runMinIdx = 0;
  let direction: "up" | "down" = "up";

  const swings: LastLegSwing[] = [];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;

    if (direction === "up") {
      if (high > candles[runMaxIdx].high) runMaxIdx = i;
      const peak = candles[runMaxIdx].high;
      const dropPct = peak > 0 ? (peak - low) / peak : 0;
      if (dropPct >= reversalPct) {
        swings.push({
          type: "high",
          index: runMaxIdx,
          price: peak,
          openTime: candles[runMaxIdx].openTime,
        });
        runMinIdx = i;
        direction = "down";
      }
    } else {
      if (low < candles[runMinIdx].low) runMinIdx = i;
      const trough = candles[runMinIdx].low;
      const risePct = trough > 0 ? (high - trough) / trough : 0;
      if (risePct >= reversalPct) {
        swings.push({
          type: "low",
          index: runMinIdx,
          price: trough,
          openTime: candles[runMinIdx].openTime,
        });
        runMaxIdx = i;
        direction = "up";
      }
    }
  }

  // Append the unconfirmed extreme — the most recent leg often hasn't
  // reversed yet, and that running extreme is the latest swing in spirit.
  if (direction === "up") {
    const peak = candles[runMaxIdx].high;
    swings.push({
      type: "high",
      index: runMaxIdx,
      price: peak,
      openTime: candles[runMaxIdx].openTime,
    });
  } else {
    const trough = candles[runMinIdx].low;
    swings.push({
      type: "low",
      index: runMinIdx,
      price: trough,
      openTime: candles[runMinIdx].openTime,
    });
  }

  return swings;
}

export function runLastLegPass(
  input: PassRunInput,
  config: LastLegPassConfig,
): Map<string, LastLegPassResult> {
  const results = new Map<string, LastLegPassResult>();
  if (!config.enabled) return results;

  const allSwings = findLastLegSwings(
    input.primaryCandles,
    config.reversalPct,
  );

  // Take the LAST N swings in order. With N=3 on a typical leg pattern you
  // get the bounding high + low of the last completed leg + the running
  // extreme of the leg in progress — three structural prices.
  const lastN = Math.max(1, Math.floor(config.lastN));
  const swings = allSwings.slice(-lastN);
  if (swings.length === 0) return results;

  for (const level of input.levels) {
    let bestScore = 0;
    let bestSwing: "high" | "low" | null = null;

    for (const swing of swings) {
      const dist =
        swing.price > 0
          ? Math.abs(level.price - swing.price) / swing.price
          : 1;
      const s = Math.max(0, 1 - dist / Math.max(1e-9, config.tolerancePct));
      if (s > bestScore) {
        bestScore = s;
        bestSwing = swing.type;
      }
    }

    results.set(level.id, {
      value: bestScore,
      nearestSwing: bestSwing,
      swingsConsidered: swings.length,
    });
  }
  return results;
}

// Re-export for tests/diagnostics
export type { AnalysisLevel };
