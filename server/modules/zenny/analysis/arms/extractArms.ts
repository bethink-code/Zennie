// extractArms — pure function over an enriched analysis state. Picks the
// top-pull active pool above current price (upper arm) and the top-pull
// active pool below (lower arm), gated by ARM_MINIMUM_PULL = 15.0.
// Determines dominance from comparative pull.
//
// Per spec §2.10:
//   RankPoolsByPull → pull-descending
//   DetermineArmDominance → higher pull = dominant
//   ARM_MINIMUM_PULL = 15.0 → arms below this threshold are suppressed
//                              entirely (no render, no trade plan)
//
// The returned Arm object carries everything the right-frame canvas needs
// to draw the panel: the pool itself, the pull (so wire thickness can be
// derived), the dominance role, and the side. The canvas does no further
// analysis — render-only consumption.

import type { AnalysisPool } from "../orchestrator";

export const ARM_MINIMUM_PULL = 15.0;

export type ArmRole = "dominant" | "subordinate" | "equal";
export type ArmSide = "upper" | "lower";

export interface Arm {
  side: ArmSide;
  pool: AnalysisPool; // includes pool.pull populated by pullPass
  pullDecayed: number; // convenience copy of pool.pull.decayed
  role: ArmRole;
}

export interface ExtractedArms {
  upper: Arm | null;
  lower: Arm | null;
  // Which side, if any, is dominant. "neither" when both arms have equal
  // pull (rare with floating-point pull but per spec must be representable)
  // or when one of the arms doesn't exist.
  dominantSide: ArmSide | "neither";
}

export interface ExtractArmsInput {
  pools: AnalysisPool[];
  currentPrice: number;
}

export function extractArms(input: ExtractArmsInput): ExtractedArms {
  if (!Number.isFinite(input.currentPrice) || input.currentPrice <= 0) {
    return { upper: null, lower: null, dominantSide: "neither" };
  }

  let upperBest: AnalysisPool | null = null;
  let upperBestPull = -Infinity;
  let lowerBest: AnalysisPool | null = null;
  let lowerBestPull = -Infinity;

  for (const pool of input.pools) {
    if (pool.status !== "active") continue;
    if (pool.pull == null) continue;
    if (pool.pull.decayed < ARM_MINIMUM_PULL) continue;

    const aboveCurrent = pool.centreLine > input.currentPrice;
    if (aboveCurrent) {
      if (pool.pull.decayed > upperBestPull) {
        upperBest = pool;
        upperBestPull = pool.pull.decayed;
      }
    } else {
      if (pool.pull.decayed > lowerBestPull) {
        lowerBest = pool;
        lowerBestPull = pool.pull.decayed;
      }
    }
  }

  const upperArm: Arm | null = upperBest
    ? {
        side: "upper",
        pool: upperBest,
        pullDecayed: upperBestPull,
        role: "subordinate", // overwritten below
      }
    : null;
  const lowerArm: Arm | null = lowerBest
    ? {
        side: "lower",
        pool: lowerBest,
        pullDecayed: lowerBestPull,
        role: "subordinate",
      }
    : null;

  let dominantSide: ArmSide | "neither" = "neither";
  if (upperArm && lowerArm) {
    if (upperArm.pullDecayed > lowerArm.pullDecayed) {
      upperArm.role = "dominant";
      lowerArm.role = "subordinate";
      dominantSide = "upper";
    } else if (lowerArm.pullDecayed > upperArm.pullDecayed) {
      lowerArm.role = "dominant";
      upperArm.role = "subordinate";
      dominantSide = "lower";
    } else {
      upperArm.role = "equal";
      lowerArm.role = "equal";
      dominantSide = "neither";
    }
  } else if (upperArm) {
    upperArm.role = "dominant";
    dominantSide = "upper";
  } else if (lowerArm) {
    lowerArm.role = "dominant";
    dominantSide = "lower";
  }

  return { upper: upperArm, lower: lowerArm, dominantSide };
}
