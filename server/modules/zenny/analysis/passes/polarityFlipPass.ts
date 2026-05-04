// PolarityFlip pass - applies the classic support/resistance flip rule.
//
// A level only flips after market structure proves it:
//   1. a later closed source-TF candle closes through the level, then
//   2. a later closed source-TF candle retests the level from the new side
//      and still closes on that new side.
//
// This keeps the institutional distinction intact: a close-through can
// break the original level, but the opposite-side role is not earned until
// price comes back and respects it.
//
// Crossings count is informational: number of close-direction transitions
// on the source-TF candles. High count means price has been noisy around
// this level; aggregate pass / user can choose to downweight. We do not
// auto-mark DEAD here because it caused too many false positives near
// level boundaries.

import type { AnalysisLevel } from "../orchestrator";
import type { Candle } from "../../../../../shared/zennyTypes";
import type { PassRunInput, PolarityFlipPassConfig } from "./types";

export type PolaritySide = "RESISTANCE" | "SUPPORT" | "DEAD";

export interface PolarityFlipPassResult {
  effectiveSide: PolaritySide;
  flipped: boolean;
  crossings: number;
}

const RETEST_TOLERANCE_PCT = 0.0015;

export function runPolarityFlipPass(
  input: PassRunInput,
  config: PolarityFlipPassConfig,
): Map<string, PolarityFlipPassResult> {
  const results = new Map<string, PolarityFlipPassResult>();
  if (!config.enabled) return results;

  for (const level of input.levels) {
    const rawSourceCandles = input.perTfCandles.get(level.sourceTimeframe);
    const sourceCandles =
      rawSourceCandles && rawSourceCandles.length > 1
        ? rawSourceCandles.slice(0, -1)
        : (rawSourceCandles ?? []);

    const crossings = countCloseCrossings(level, sourceCandles);
    const effectiveSide = findConfirmedFlip(level, sourceCandles);
    const flipped = effectiveSide !== level.side;

    results.set(level.id, { effectiveSide, flipped, crossings });
  }

  return results;
}

function countCloseCrossings(
  level: AnalysisLevel,
  sourceCandles: Candle[],
): number {
  const startIdx = sourceCandles.findIndex(
    (c) => c.openTime === level.swingCandleTime,
  );
  if (startIdx < 0) return 0;

  let crossings = 0;
  let prevAbove: boolean | null = null;
  for (let i = startIdx + 1; i < sourceCandles.length; i++) {
    const above = sourceCandles[i].close > level.price;
    if (prevAbove !== null && above !== prevAbove) crossings += 1;
    prevAbove = above;
  }
  return crossings;
}

function findConfirmedFlip(
  level: AnalysisLevel,
  sourceCandles: Candle[],
): PolaritySide {
  const startIdx = sourceCandles.findIndex(
    (c) => c.openTime === level.swingCandleTime,
  );
  if (startIdx < 0) return level.side;

  const tolerance = level.price * RETEST_TOLERANCE_PCT;

  if (level.side === "RESISTANCE") {
    const breakIdx = sourceCandles.findIndex(
      (c, i) => i > startIdx && c.close > level.price,
    );
    if (breakIdx < 0) return level.side;

    const hasRetest = sourceCandles.some(
      (c, i) =>
        i > breakIdx &&
        c.low <= level.price + tolerance &&
        c.close >= level.price,
    );
    return hasRetest ? "SUPPORT" : level.side;
  }

  const breakIdx = sourceCandles.findIndex(
    (c, i) => i > startIdx && c.close < level.price,
  );
  if (breakIdx < 0) return level.side;

  const hasRetest = sourceCandles.some(
    (c, i) =>
      i > breakIdx &&
      c.high >= level.price - tolerance &&
      c.close <= level.price,
  );
  return hasRetest ? "RESISTANCE" : level.side;
}
