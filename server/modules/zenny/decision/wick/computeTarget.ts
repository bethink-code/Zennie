// computeTarget — target price for a wick trade. Target rule is shared across
// all four entry styles: opposing arm centre line. The arm structure (top
// pull above + below current price) gives us the natural "other side" of the
// range to aim for.
//
// Side semantics:
//   short (fading RESISTANCE) → target = lower arm centre
//   long  (fading SUPPORT)    → target = upper arm centre
//
// When the opposing arm doesn't exist (no qualifying pool that side), fall
// back to a measured move: 1× the distance from entry to the trading pool
// projected to the other side. Coarse but better than skipping the trade
// for missing geometry that may reflect a one-sided range edge.
//
// Pure function.

import type { ExtractedArms } from "../../analysis/arms/extractArms";
import type { AnalysisPool } from "../../analysis/orchestrator";

export interface ComputeTargetInput {
  pool: AnalysisPool;
  arms: ExtractedArms;
  entry: number;
  side: "long" | "short";
}

export interface ComputeTargetOutput {
  target: number;
  source: "opposing-arm" | "measured-move";
}

export function computeTarget(input: ComputeTargetInput): ComputeTargetOutput {
  const { pool, arms, entry, side } = input;
  const opposingArm = side === "short" ? arms.lower : arms.upper;
  if (opposingArm) {
    return { target: opposingArm.pool.centreLine, source: "opposing-arm" };
  }
  // Measured move: distance entry → pool centre, mirrored.
  const distance = Math.abs(entry - pool.centreLine);
  const target = side === "short" ? entry - distance : entry + distance;
  return { target, source: "measured-move" };
}
