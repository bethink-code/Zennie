// assembleTradePlans — top-level entry that runs once per analysed TF and
// produces TradePlans for every playbook family that resolves geometry.
//
// V1 (2026-05-09) two-phase split: REACH (Phase 1) AND TAKE (Phase 2) can
// both fire on the same TF — they're independent setups (one rides toward
// the pool, the other fades after the sweep). Returns multiple TradePlans
// per TF in `plansPerTimeframe`. Backward-compat fields `primary` and
// `perTimeframe` carry the first non-null plan (TAKE preferred — it's the
// higher-edge half of the cycle).
//
// Per the per-TF self-containment model, each TF stands alone: its own
// regime assessment, its own arms + pools, its own trade plans.
//
// Pure function. No DB. No order placement. The execution module
// consumes these plans and turns them into orders.

import type { Candle, Timeframe } from "../../../../shared/zennyTypes";
import type { ExtractedArms } from "../analysis/arms/extractArms";
import type { AnalysisPool } from "../analysis/orchestrator";
import type {
  RegimeAssessmentResult,
  TfRegimeAssessment,
} from "../analysis/regime/types";
import { proposeReachTrade } from "./reach/proposeReachTrade";
import type { ReachTradeConfig } from "./reach/types";
import type { TradePlan, TradePlanResult } from "./types";
import { proposeWickTrade } from "./wick/proposeWickTrade";
import type { WickTradeConfig } from "./wick/types";

export interface AssembleTradePlansInput {
  primaryTimeframe: Timeframe;
  perTfCandles: Map<Timeframe, Candle[]>;
  armsPerTimeframe: Partial<Record<Timeframe, ExtractedArms>>;
  enrichedPoolsPerTimeframe: Partial<Record<Timeframe, AnalysisPool[]>>;
  regimeAssessment: RegimeAssessmentResult | null;
  wickConfig?: WickTradeConfig;
  reachConfig?: ReachTradeConfig;
}

export function assembleTradePlans(
  input: AssembleTradePlansInput,
): TradePlanResult {
  const perTimeframe: Partial<Record<Timeframe, TradePlan>> = {};
  const plansPerTimeframe: Partial<Record<Timeframe, TradePlan[]>> = {};
  if (!input.regimeAssessment) {
    return { primary: null, perTimeframe, plansPerTimeframe };
  }

  for (const [tf, tfAssessment] of Object.entries(
    input.regimeAssessment.perTimeframe,
  ) as Array<[Timeframe, TfRegimeAssessment]>) {
    if (!tfAssessment.recommended) continue;

    const tfCandles = input.perTfCandles.get(tf);
    const tfArms = input.armsPerTimeframe[tf];
    const tfPools = input.enrichedPoolsPerTimeframe[tf];
    if (!tfCandles || !tfArms || !tfPools) continue;
    if (tfCandles.length === 0) continue;
    const currentPrice = tfCandles[tfCandles.length - 1].close;
    if (currentPrice <= 0) continue;

    const tfPlans: TradePlan[] = [];

    // TAKE — sweep-fade (the wick module). Higher per-trade edge.
    const takePlan = proposeWickTrade({
      timeframe: tf,
      candles: tfCandles,
      currentPrice,
      arms: tfArms,
      pools: tfPools,
      assessment: tfAssessment,
      config: input.wickConfig,
    });
    if (takePlan !== null) tfPlans.push(takePlan);

    // REACH — pull-target (Phase 1). Fires more often than TAKE.
    const reachPlan = proposeReachTrade({
      timeframe: tf,
      candles: tfCandles,
      currentPrice,
      arms: tfArms,
      pools: tfPools,
      assessment: tfAssessment,
      config: input.reachConfig,
    });
    if (reachPlan !== null) tfPlans.push(reachPlan);

    if (tfPlans.length > 0) {
      plansPerTimeframe[tf] = tfPlans;
      perTimeframe[tf] = tfPlans[0]; // first wins for backward compat
    }
  }

  return {
    primary: perTimeframe[input.primaryTimeframe] ?? null,
    perTimeframe,
    plansPerTimeframe,
  };
}
