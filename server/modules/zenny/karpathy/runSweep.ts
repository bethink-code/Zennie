// runSweep — Stage 2 of the testing/optimisation layer: try DIFFERENT settings.
//
//   Backtest  → what do our CURRENT settings produce?
//   Karpathy  → what if we tried DIFFERENT settings?   (this file)
//   Implement → adopt the optimised settings.
//
// Runs the FACTUAL backtest once per config variant and ranks them by score, so
// the output is the concrete answer: "this config wins — change to it." The
// search space (which variants to try) is the caller's concern (the planner);
// this just executes and ranks. Deterministic — same variants, same ranking.

import {
  runBacktest,
  type BacktestConfig,
  type BacktestInput,
} from "../backtest/runBacktest";
import type { BacktestSummary } from "../backtest/summariseBacktest";

export interface SweepVariant {
  label: string;
  config: BacktestConfig;
}

export interface SweepRanked {
  label: string;
  config: BacktestConfig;
  summary: BacktestSummary;
}

export async function runSweep(
  base: Omit<BacktestInput, "config">,
  variants: SweepVariant[],
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<SweepRanked[]> {
  const results: SweepRanked[] = [];
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const r = await runBacktest({ ...base, config: v.config });
    results.push({ label: v.label, config: v.config, summary: r.summary });
    onProgress?.(i + 1, variants.length, v.label);
  }
  // Highest score first.
  return results.sort((a, b) => b.summary.score - a.summary.score);
}
