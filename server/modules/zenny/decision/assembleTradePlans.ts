// assembleTradePlans — top-level entry that runs once per analysed TF and
// produces a TradePlan when proposeWickTrade resolves geometry for the
// regime's recommended playbook.
//
// Per the per-TF self-containment model, each TF stands alone: its own
// regime assessment, its own arms + pools, its own trade plan. Cross-TF
// trades aren't a thing — each TF makes its own decision.
//
// Pure function. No DB. No order placement. The execution module
// consumes these plans (when built) and turns them into orders.

import type { Candle, Timeframe } from "../../../../shared/zennyTypes";
import type { ExtractedArms } from "../analysis/arms/extractArms";
import type { AnalysisPool } from "../analysis/orchestrator";
import type {
  RegimeAssessmentResult,
  TfRegimeAssessment,
} from "../analysis/regime/types";
import type { TradePlan, TradePlanResult } from "./types";
import { proposeWickTrade } from "./wick/proposeWickTrade";
import type { WickTradeConfig } from "./wick/types";

export interface AssembleTradePlansInput {
  primaryTimeframe: Timeframe;
  perTfCandles: Map<Timeframe, Candle[]>;
  armsPerTimeframe: Partial<Record<Timeframe, ExtractedArms>>;
  enrichedPoolsPerTimeframe: Partial<Record<Timeframe, AnalysisPool[]>>;
  regimeAssessment: RegimeAssessmentResult | null;
  // Optional config override — when paper-trade tuning lands, this is how
  // a tenant or session swaps in a non-default WickTradeConfig.
  wickConfig?: WickTradeConfig;
}

export function assembleTradePlans(
  input: AssembleTradePlansInput,
): TradePlanResult {
  const perTimeframe: Partial<Record<Timeframe, TradePlan>> = {};
  if (!input.regimeAssessment) {
    return { primary: null, perTimeframe };
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

    const plan = proposeWickTrade({
      timeframe: tf,
      candles: tfCandles,
      currentPrice,
      arms: tfArms,
      pools: tfPools,
      assessment: tfAssessment,
      config: input.wickConfig,
    });
    if (plan !== null) perTimeframe[tf] = plan;
  }

  return {
    primary: perTimeframe[input.primaryTimeframe] ?? null,
    perTimeframe,
  };
}
