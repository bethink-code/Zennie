// computeStop — stop price for a wick trade given the pool, entry style, and
// buffer. Stop placement is style-dependent:
//
//   midpoint, extreme, anticipatory : wickExtreme + buffer (RESISTANCE)
//                                     wickExtreme - buffer (SUPPORT)
//
//   beyond                          : wickExtreme + (stopMultiplier × buffer)
//                                     stopMultiplier defaults to 2 — wider to
//                                     absorb the deeper second sweep.
//
// "wickExtreme" is the wick tip on the pool side: wickHigh for RESISTANCE,
// wickLow for SUPPORT. Buffer is computed in computeBuffer.
//
// Pure function.

import type { AnalysisPool } from "../../analysis/orchestrator";
import type { BeyondConfig, EntryStyle } from "./types";

export interface ComputeStopInput {
  pool: AnalysisPool;
  style: EntryStyle;
  buffer: number;
  beyond: BeyondConfig;
}

export function computeStop(input: ComputeStopInput): number {
  const { pool, style, buffer, beyond } = input;
  const multiplier = style === "beyond" ? beyond.stopMultiplier : 1;

  if (pool.type === "RESISTANCE") {
    return pool.wickHigh + buffer * multiplier;
  }
  return pool.wickLow - buffer * multiplier;
}
