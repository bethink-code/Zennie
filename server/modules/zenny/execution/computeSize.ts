// computeSize — risk-parity position sizing.
//
//   size = (equity × riskPct × sizeMultiplier) / |entry - stop|
//
// Output:
//   { size, notional }    notional = size × entry
//
// Returns null when sizing fails (zero stop distance, zero/negative equity,
// or zero risk%). The caller (reduceStep, on PLANNED → LIVE) treats null as
// REJECTED with reason 'sizing'.
//
// Pure function. No tenant or exchange-specific limits applied here —
// MIN_NOTIONAL etc. is the live exchange adapter's job.

import type { PlanInputForPosition } from "./types";

export interface ComputeSizeInput {
  equity: number; // current account equity
  plan: Pick<
    PlanInputForPosition,
    "entry" | "stop" | "riskPct" | "sizeMultiplier"
  >;
}

export interface ComputeSizeOutput {
  size: number;
  notional: number;
}

export function computeSize(
  input: ComputeSizeInput,
): ComputeSizeOutput | null {
  if (input.equity <= 0) return null;
  if (input.plan.riskPct <= 0) return null;
  if (input.plan.sizeMultiplier <= 0) return null;

  const stopDistance = Math.abs(input.plan.entry - input.plan.stop);
  if (stopDistance === 0) return null;

  const riskBudget =
    input.equity * (input.plan.riskPct / 100) * input.plan.sizeMultiplier;
  const size = riskBudget / stopDistance;
  if (!Number.isFinite(size) || size <= 0) return null;

  const notional = size * input.plan.entry;
  return { size, notional };
}
