// Recency pass — scores each level by how close its swing candle is to the
// right edge of the primary timeframe window. Right > left.
//
// Output per level (under key "recency"):
//   { value: 0..1, wouldFilter: boolean }
//
// The pass DOES NOT remove levels. It marks them. The renderer / aggregator
// decides what to do with `wouldFilter`. That keeps every pass independent.

import type { AnalysisLevel } from "../orchestrator";
import type { PassRunInput, RecencyPassConfig } from "./types";

export interface RecencyPassResult {
  value: number;
  wouldFilter: boolean;
}

export function runRecencyPass(
  input: PassRunInput,
  config: RecencyPassConfig,
): Map<string, RecencyPassResult> {
  const results = new Map<string, RecencyPassResult>();
  if (!config.enabled) return results;

  const totalCandles = input.primaryCandles.length;
  if (totalCandles === 0) return results;

  for (const level of input.levels) {
    const value = scoreRecency(level, totalCandles, config);
    const wouldFilter = value < config.threshold;
    results.set(level.id, { value, wouldFilter });
  }
  return results;
}

function scoreRecency(
  level: AnalysisLevel,
  totalCandles: number,
  config: RecencyPassConfig,
): number {
  // Linear: same as the existing 0..1 recency baked into AnalysisLevel.
  // Exponential: use halfLifeCandles to shape a decay from the right edge.
  if (config.curve === "linear") {
    return Math.max(0, Math.min(1, level.recency));
  }

  // Exponential: 1.0 at the right edge, halves every halfLifeCandles back.
  if (level.swingCandleIndexOnPrimary < 0) return 0;
  const fromRightEdge =
    totalCandles - 1 - level.swingCandleIndexOnPrimary;
  const halfLife = Math.max(1, config.halfLifeCandles);
  const score = Math.pow(0.5, fromRightEdge / halfLife);
  return Math.max(0, Math.min(1, score));
}
