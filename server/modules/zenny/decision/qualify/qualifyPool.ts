// qualifyPool — Step 1 of the regime-scoped strategy: is THIS swept pool a
// turning point (fade) or about to be run through (don't fade)?
//
// Runs the deep-research-verified sequence:
//   1. swept?            pool.status === 'swept' (+ a sweep candle index)
//   2. reclaimed?        close back inside the level within reclaimMaxBars
//                        (reuses checkConfirmation — the SFP close-back-inside)
//   3. structure shift?  a market-structure shift (MSS/CHoCH) in the reversal
//                        direction (detectStructureShift)
//
// Verdict:
//   turning-point : reclaimed AND reversal structure shift (full sequence).
//                   (requireStructureShift=false relaxes to reclaim-only.)
//   run-through   : NOT reclaimed AND a continuation shift (BOS in the sweep
//                   direction) — the sweep had follow-through, do not fade.
//   unconfirmed   : neither sequence complete — stand aside.
//
// Direction: RESISTANCE pool is faded SHORT (sweep was up; reversal is down);
// SUPPORT pool is faded LONG (sweep was down; reversal is up).
//
// Pure function. No DB, no order placement. The decision layer consumes the
// verdict; PD-array entry/stop/target construction is a later step.

import type { Candle } from "../../../../../shared/zennyTypes";
import type { BodyPivot } from "../../analysis/level/findBodyPivots";
import type { AnalysisPool } from "../../analysis/orchestrator";
import { checkConfirmation } from "../wick/checkConfirmation";
import { DEFAULT_QUALIFY_CONFIG } from "./defaultConfig";
import { detectStructureShift } from "./detectStructureShift";
import type { PoolQualification, QualifyConfig } from "./types";

export interface QualifyPoolInput {
  pool: AnalysisPool;
  candles: Candle[];
  pivots: BodyPivot[];
  config?: QualifyConfig;
}

export function qualifyPool(input: QualifyPoolInput): PoolQualification {
  const cfg = input.config ?? DEFAULT_QUALIFY_CONFIG;
  const { pool, candles, pivots } = input;
  const reasons: string[] = [];

  const fadeDirection = pool.type === "RESISTANCE" ? "short" : "long";

  // 1. Sweep. Checking sweptIdx directly narrows it to a number below.
  const sweptIdx = pool.sweptCandleIndexOnPrimary;
  if (pool.status !== "swept" || sweptIdx === null || sweptIdx < 0) {
    return base(pool.id, "unconfirmed", null, false, false, false, 0, [
      "no sweep — pool not in swept state",
    ]);
  }

  // 2. Reclaim (close back inside the level).
  const reclaimed = checkConfirmation({
    pool,
    candles,
    maxBarsAfterSweep: cfg.reclaimMaxBars,
  }).satisfied;
  reasons.push(reclaimed ? "reclaimed (close back inside)" : "no reclaim");

  // 3. Structure shift. Reversal direction is opposite the sweep; continuation
  // direction is the same as the sweep.
  const reversalDir = pool.type === "RESISTANCE" ? "down" : "up";
  const continuationDir = pool.type === "RESISTANCE" ? "up" : "down";

  const reversalShift = detectStructureShift({
    candles,
    pivots,
    afterIndex: sweptIdx,
    direction: reversalDir,
    lookbackPivots: cfg.structureLookbackPivots,
  });
  const continuationShift = detectStructureShift({
    candles,
    pivots,
    afterIndex: sweptIdx,
    direction: continuationDir,
    lookbackPivots: cfg.structureLookbackPivots,
  });

  const price = candles[candles.length - 1].close;
  const minDisp = cfg.minShiftDisplacementPct * price;
  const reversalShifted =
    reversalShift.shifted && reversalShift.displacement >= minDisp;
  const continuationShifted =
    continuationShift.shifted && continuationShift.displacement >= minDisp;

  // Turning point: reclaim + reversal shift (or reclaim alone if the MSS gate
  // is disabled for A/B testing).
  if (reclaimed && (reversalShifted || !cfg.requireStructureShift)) {
    reasons.push(
      reversalShifted
        ? `reversal MSS (${reversalDir})`
        : "MSS gate disabled — reclaim only",
    );
    return base(
      pool.id,
      "turning-point",
      fadeDirection,
      true,
      true,
      reversalShifted,
      reversalShift.displacement,
      reasons,
    );
  }

  // Run-through: no reclaim + a continuation BOS in the sweep direction.
  if (!reclaimed && continuationShifted) {
    reasons.push(`continuation BOS (${continuationDir}) — do not fade`);
    return base(
      pool.id,
      "run-through",
      null,
      true,
      false,
      true,
      continuationShift.displacement,
      reasons,
    );
  }

  reasons.push("sequence incomplete");
  return base(pool.id, "unconfirmed", null, true, reclaimed, false, 0, reasons);
}

function base(
  poolId: string,
  verdict: PoolQualification["verdict"],
  fadeDirection: PoolQualification["fadeDirection"],
  swept: boolean,
  reclaimed: boolean,
  structureShifted: boolean,
  displacement: number,
  reasons: string[],
): PoolQualification {
  return {
    poolId,
    verdict,
    fadeDirection,
    swept,
    reclaimed,
    structureShifted,
    displacement,
    reasons,
  };
}
