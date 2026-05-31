// DEFAULT_WICK_CONFIG — research-backed defaults for the wick decision module.
//
// Every value here is a starting point, not a settled answer. The paper-testing
// schedule (memory/zenny_paper_testing_schedule.md, items W1–W6) lists the
// alternatives we'll explore once we have live verdicts. Edit defaults here
// when paper-trading produces a verdict; do not override silently in callers.

import type { WickTradeConfig } from "./types";

export const DEFAULT_WICK_CONFIG: WickTradeConfig = {
  // W4 — buffer formula
  buffer: {
    rule: "max",
    percentage: 0.002, // 0.2% — crypto SFP convention
    atrPeriod: 14, // standard ATR lookback
    atrMultiple: 0.25, // tight; the small stop is the edge for #2
  },

  // W1 — confirmation gate
  confirmation: {
    // Default: extreme/beyond require close-back-inside; midpoint is exempt
    // because the entry is already deeper than the wick (structurally implied).
    requiredFor: ["extreme", "beyond"],
    maxBarsAfterSweep: 1, // same/next bar
  },

  // W5 — beyond interpretation
  beyond: {
    interpretation: "second-sweep-fade", // ICT/SMC/Bookmap consensus
    stopMultiplier: 2, // wider stop to absorb the second sweep
  },

  // W2 + W6 — anticipatory (#4)
  // requireTrendingRegime relaxed 2026-05-09 — the regimeMatrix is now the
  // authoritative gate for which regimes allow anticipatory. The internal
  // requireTrendingRegime flag is now redundant; kept as belt-and-braces.
  anticipatory: {
    enabled: true, // ICT canon kept by default
    distanceRule: "fixed-buffer", // simplest v1 — refine to OTE later
    fixedBufferMultiple: 1.5,
    oteFraction: 0.705, // ICT Sweet Spot
    requireTrendingRegime: false,
  },

  // W3 — regime → entry style matrix. This is the regime GATE for fading.
  // Per the 2026-05-30 deep-research (Scratch/regime-strategy-research-2026-05-30.md):
  // FADE only in mean-reverting regimes (ranging, accumulation). TRENDING and
  // BREAKOUT are FOLLOW regimes — fading there is what got the bot gamed — so
  // they get NO fade styles (an empty list = stand aside; the follow playbook
  // is a later module). The proposer tries the listed styles in order.
  regimeMatrix: {
    ranging: ["midpoint", "extreme", "under-touching"],
    accumulation: ["midpoint", "under-touching"],
    trending: [],
    breakout: [],
  },

  // Per-style size multipliers (conviction). Conservative inner entries get
  // full size; the wider-stop second-sweep gets less.
  sizeMultiplier: {
    "under-touching": 1.0,
    midpoint: 1.0,
    extreme: 1.0,
    beyond: 0.7,
    anticipatory: 0.5,
  },

  minRiskRewardRatio: 1.0,

  // Beyond ~5 bars, the sweep is stale and the fade window has closed.
  maxBarsSinceSweep: 5,
};
