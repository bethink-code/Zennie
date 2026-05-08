// killSwitchEvaluate — drawdown-from-peak gate.
//
// Two-stage:
//   drawdown ≥ softKillDrawdownPct  → SOFT_TRIPPED
//                                      (refuse new entries; existing trades run)
//   drawdown ≥ hardKillDrawdownPct  → HARD_TRIPPED
//                                      (close all open positions market-style)
//
// Drawdown is computed against the killSwitchReference:
//   peak         all-time high-water mark
//   starting     starting equity (loses meaning after equity grows)
//   daily-peak   not implemented in v0 — falls through to peak
//
// Once HARD_TRIPPED, requires manual unhalt — never auto-resumes here.
// Pure function. The caller (runner / persistence) tracks the actual halt
// flag and applies the close-all decision.

import type {
  ExecutionConfig,
  KillSwitchReference,
} from "./executionConfig";
import type { KillState } from "./types";

export interface KillSwitchEvaluateInput {
  currentEquity: number;
  peakEquity: number;
  startingEquity: number;
  // Pre-existing kill state from the previous evaluation. HARD_TRIPPED is
  // sticky — the function never returns OK once HARD_TRIPPED has been seen.
  previousKillStatus: KillState;
  config: Pick<
    ExecutionConfig,
    "softKillDrawdownPct" | "hardKillDrawdownPct" | "killSwitchReference"
  >;
}

export interface KillSwitchEvaluateOutput {
  killStatus: KillState;
  drawdownPct: number;
  reference: KillSwitchReference;
}

export function killSwitchEvaluate(
  input: KillSwitchEvaluateInput,
): KillSwitchEvaluateOutput {
  // HARD_TRIPPED is sticky.
  if (input.previousKillStatus === "HARD_TRIPPED") {
    return {
      killStatus: "HARD_TRIPPED",
      drawdownPct: drawdown(
        input.currentEquity,
        referenceEquity(input),
      ),
      reference: input.config.killSwitchReference,
    };
  }

  const ref = referenceEquity(input);
  if (ref <= 0) {
    return {
      killStatus: "OK",
      drawdownPct: 0,
      reference: input.config.killSwitchReference,
    };
  }

  const ddPct = drawdown(input.currentEquity, ref);

  if (ddPct >= input.config.hardKillDrawdownPct) {
    return {
      killStatus: "HARD_TRIPPED",
      drawdownPct: ddPct,
      reference: input.config.killSwitchReference,
    };
  }
  if (ddPct >= input.config.softKillDrawdownPct) {
    return {
      killStatus: "SOFT_TRIPPED",
      drawdownPct: ddPct,
      reference: input.config.killSwitchReference,
    };
  }
  return {
    killStatus: "OK",
    drawdownPct: ddPct,
    reference: input.config.killSwitchReference,
  };
}

function referenceEquity(input: KillSwitchEvaluateInput): number {
  if (input.config.killSwitchReference === "starting") {
    return input.startingEquity;
  }
  // 'peak' or 'daily-peak' (which v0 falls back to peak)
  return input.peakEquity;
}

function drawdown(current: number, reference: number): number {
  if (reference <= 0) return 0;
  if (current >= reference) return 0;
  return ((reference - current) / reference) * 100;
}
