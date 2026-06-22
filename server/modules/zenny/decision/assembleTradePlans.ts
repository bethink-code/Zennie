// assembleTradePlans — runs the wick proposer per analysed TF and returns the
// TradePlan it would generate. This is the "trade every qualified wick"
// MECHANICAL BASELINE — the bar a discretionary wick-selection has to beat. It
// is NOT a live auto-trader (that path, the runner, was removed); it exists to
// drive the backtest harness so we can measure selection edge against it.
//
// Per the per-TF self-containment model, each TF stands alone: its own regime
// assessment, its own arms + pools, its own trade plan.
//
// Pure function. No DB. No order placement.

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
  wickConfig?: WickTradeConfig;
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

    // TAKE — sweep-fade (the wick module). The mechanical baseline trade.
    const takePlan = proposeWickTrade({
      timeframe: tf,
      candles: tfCandles,
      currentPrice,
      arms: tfArms,
      pools: tfPools,
      assessment: tfAssessment,
      config: input.wickConfig,
    });
    if (takePlan !== null) {
      plansPerTimeframe[tf] = [takePlan];
      perTimeframe[tf] = takePlan;
    }
  }

  return {
    primary: perTimeframe[input.primaryTimeframe] ?? null,
    perTimeframe,
    plansPerTimeframe,
  };
}
