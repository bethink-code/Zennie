// computeAsymmetry — pull ratio between the dominant and subordinate arms.
//
//   asymmetry = pull_dominant / pull_subordinate
//
// Returns null when either arm is missing or pull data isn't available.
// Used by proposeReachTrade as the gate (default threshold 2.0).
//
// Pure function.

import type { ExtractedArms } from "../../analysis/arms/extractArms";

export interface AsymmetryResult {
  asymmetry: number;
  dominantSide: "upper" | "lower";
  dominantPull: number;
  subordinatePull: number;
}

export function computeAsymmetry(
  arms: ExtractedArms,
): AsymmetryResult | null {
  if (arms.dominantSide === "neither") return null;
  const upperPull = arms.upper?.pullDecayed ?? 0;
  const lowerPull = arms.lower?.pullDecayed ?? 0;

  // We need the dominant side to have positive pull. Subordinate can be
  // zero (one-sided range edge) — in that case asymmetry is "infinite" so
  // we report a large finite number to keep callers' arithmetic sane.
  if (arms.dominantSide === "upper") {
    if (upperPull <= 0) return null;
    const asymmetry =
      lowerPull <= 0 ? 999 : upperPull / lowerPull;
    return {
      asymmetry,
      dominantSide: "upper",
      dominantPull: upperPull,
      subordinatePull: lowerPull,
    };
  }
  // lower
  if (lowerPull <= 0) return null;
  const asymmetry =
    upperPull <= 0 ? 999 : lowerPull / upperPull;
  return {
    asymmetry,
    dominantSide: "lower",
    dominantPull: lowerPull,
    subordinatePull: upperPull,
  };
}
