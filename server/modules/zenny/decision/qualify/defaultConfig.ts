// DEFAULT_QUALIFY_CONFIG — starting points for the pool-qualification gate.
//
// IMPORTANT: every value is a hypothesis, not a settled answer. The deep
// research (Scratch/regime-strategy-research-2026-05-30.md) explicitly REFUTED
// all borrowed numeric thresholds (reclaim-within-N-bars, test-volume %, etc.).
// These must be calibrated by our own backtest engine against measured BTC/ETH
// 15m base rates. See memory: zenny_regime_strategy_research, zenny_paper_testing_schedule.

import type { QualifyConfig } from "./types";

export const DEFAULT_QUALIFY_CONFIG: QualifyConfig = {
  // Sweep then close back inside within 3 bars. Mirrors the wick module's
  // SFP convention; left generous until the backtest narrows it.
  reclaimMaxBars: 3,
  // Consider the last 3 swing pivots per side as the live structure.
  structureLookbackPivots: 3,
  // 0.1% minimum break to count as a structure shift (filters one-tick pokes).
  minShiftDisplacementPct: 0.001,
  // Full validated sequence by default — reclaim alone is not enough.
  requireStructureShift: true,
};
