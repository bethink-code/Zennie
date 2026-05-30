// Pool-qualification types — Step 1 of the regime-scoped strategy redesign.
//
// A pool, once swept, is one of three things to the strategy layer:
//   turning-point : the sweep FAILED — fade it (reversal). Validated sequence:
//                   sweep -> reclaim (close back inside) -> market-structure
//                   shift (MSS/CHoCH) in the reversal direction.
//   run-through   : the sweep is CONTINUATION — do not fade. Price did not
//                   reclaim and broke structure (BOS) in the sweep direction.
//   unconfirmed   : neither sequence is complete yet — stand aside.
//
// Source: Scratch/regime-strategy-research-2026-05-30.md (deep-research verified).
// Numbers here are starting points only; real per-regime base rates must be
// measured by our own backtest before they are trusted (research refuted all
// borrowed thresholds).

export type PoolVerdict = "turning-point" | "run-through" | "unconfirmed";

export type ShiftDirection = "up" | "down";

export interface StructureShift {
  shifted: boolean;
  direction: ShiftDirection | null;
  // Pivot whose body level was broken (the reference swing), and the candle
  // that closed beyond it.
  brokenPivotIndex: number | null;
  brokenAtIndex: number | null;
  // Magnitude of the break, in price (how far beyond the pivot price closed).
  displacement: number;
}

export interface PoolQualification {
  poolId: string;
  verdict: PoolVerdict;
  // Direction to fade IF turning-point (RESISTANCE -> short, SUPPORT -> long).
  fadeDirection: "long" | "short" | null;
  // Diagnostic breakdown of the sequence (drives the integrity log + UI later).
  swept: boolean;
  reclaimed: boolean;
  structureShifted: boolean;
  displacement: number;
  reasons: string[];
}

export interface QualifyConfig {
  // Close-back-inside window after the sweep (reused by checkConfirmation).
  reclaimMaxBars: number;
  // Only the most-recent K pivots of the reference side are considered the
  // "current structure" — older pivots are stale.
  structureLookbackPivots: number;
  // Minimum break size as a fraction of price to count as a real MSS (not a
  // one-tick poke). 0 disables the displacement gate.
  minShiftDisplacementPct: number;
  // When true, a turning-point verdict REQUIRES the structure shift (the full
  // validated sequence). When false, reclaim alone qualifies (looser, for
  // A/B testing the contribution of the MSS gate).
  requireStructureShift: boolean;
}
