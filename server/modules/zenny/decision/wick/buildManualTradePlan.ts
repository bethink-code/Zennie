// buildManualTradePlan — turn a human's chosen wick geometry into a validated
// TradePlan. This is where a MANUAL (discretionary) wick trade enters the
// system: the person picked the wick and set entry/stop/target; this validates
// the geometry and packages it.
//
// NO auto-decision, NO scoring. The human's call is authoritative — we only
// reject geometry that physically can't be a trade (stop/target on the wrong
// side of entry, non-positive prices). Sizing happens later (submitPosition),
// from the account-risk budget, not from this plan.
//
// Pure function. Returns null on invalid geometry.

import type { Timeframe } from "../../../../../shared/zennyTypes";
import type { Playbook } from "../../analysis/regime/types";
import type { TradePlan, TradeSide } from "../types";

export interface BuildManualTradePlanInput {
  timeframe: Timeframe;
  side: TradeSide;
  entry: number;
  stop: number;
  target: number;
  // Regime context at the time of the trade — metadata only, never a gate.
  playbook?: Playbook;
  // Conviction multiplier (default 1.0). The risk budget itself is the
  // account-risk-% applied at sizing, NOT this.
  sizeMultiplier?: number;
  // The chosen wick's pool id — the anchor that lets us later measure whether
  // the wicks you picked beat the trade-everything baseline.
  anchorPoolId?: string | null;
  rationale?: string[];
}

export function buildManualTradePlan(
  input: BuildManualTradePlanInput,
): TradePlan | null {
  const { timeframe, side, entry, stop, target } = input;

  if (![entry, stop, target].every((n) => Number.isFinite(n) && n > 0)) {
    return null;
  }
  // A real trade: stop on the loss side, target on the profit side of entry.
  if (side === "long" && !(stop < entry && entry < target)) return null;
  if (side === "short" && !(target < entry && entry < stop)) return null;

  const riskAbs = Math.abs(entry - stop);
  const rewardAbs = Math.abs(target - entry);
  if (riskAbs === 0) return null;

  return {
    timeframe,
    playbook: input.playbook ?? "ranging",
    phase: "take",
    side,
    entry,
    stop,
    target,
    riskRewardRatio: rewardAbs / riskAbs,
    riskPct: (riskAbs / entry) * 100,
    sizeMultiplier: input.sizeMultiplier ?? 1.0,
    anchorPoolId: input.anchorPoolId ?? null,
    rationale: input.rationale ?? ["manual wick trade"],
  };
}
