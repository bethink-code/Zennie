// proposeWickTrade — the TAKE proposer: fade a confirmed turning-point pool.
//
// Selection logic (V3, 2026-05-31 — qualified-pool fade):
//   1. Regime gate: the recommended playbook must allow fade styles
//      (regimeMatrix[playbook] non-empty). FADE only in ranging/accumulation;
//      trending/breakout get [] and stand aside (follow is a later module).
//   2. Candidate pools = those qualifyPool labelled 'turning-point' (the
//      verified sweep → reclaim → structure-shift sequence). The fade direction
//      comes from the qualification (RESISTANCE → short, SUPPORT → long).
//   3. Pick the nearest turning-point to current price (most actionable).
//   4. For each allowed entry style in order, build entry/stop/target geometry
//      and return the first that resolves with acceptable reward/risk.
//
// This replaces the old V2 logic that faded the dominant ARM pool — which is
// always ACTIVE (arms exclude swept pools), so the fade styles could never
// fire and only the anticipatory front-run ran. The qualification gate means
// confirmation is already done; the proposer is now pure geometry + selection.
//
// Pure function.

import type { AnalysisPool } from "../../analysis/orchestrator";
import type { Playbook, TfRegimeAssessment } from "../../analysis/regime/types";
import type { ExtractedArms } from "../../analysis/arms/extractArms";
import type { Candle, Timeframe } from "../../../../../shared/zennyTypes";
import type { TradePlan, TradeSide } from "../types";
import { computeBuffer } from "./computeBuffer";
import { computeEntry } from "./computeEntry";
import { computeStop } from "./computeStop";
import { computeTarget } from "./computeTarget";
import { DEFAULT_WICK_CONFIG } from "./defaultConfig";
import type { EntryStyle, WickTradeConfig } from "./types";

export interface ProposeWickTradeInput {
  timeframe: Timeframe;
  candles: Candle[];
  currentPrice: number;
  arms: ExtractedArms;
  pools: AnalysisPool[];
  assessment: TfRegimeAssessment;
  config?: WickTradeConfig;
}

export function proposeWickTrade(
  input: ProposeWickTradeInput,
): TradePlan | null {
  const cfg = input.config ?? DEFAULT_WICK_CONFIG;
  const playbook = input.assessment.recommended?.playbook;
  if (!playbook) return null;

  // Regime gate — only fade regimes carry entry styles.
  const allowedStyles = cfg.regimeMatrix[playbook];
  if (!allowedStyles || allowedStyles.length === 0) return null;

  // Pick the nearest confirmed turning-point pool to fade.
  const pool = pickTurningPoint(input.pools, input.currentPrice);
  if (!pool) return null;
  const side = pool.qualification?.fadeDirection;
  if (!side) return null;

  const buffer = computeBuffer(input.currentPrice, input.candles, cfg.buffer);

  for (const style of allowedStyles) {
    const plan = tryStyle({ style, pool, side, input, cfg, buffer, playbook });
    if (plan !== null) return plan;
  }
  return null;
}

// ---------------------------------------------------------------------------

// Nearest pool that qualifyPool marked a fade-able turning point.
function pickTurningPoint(
  pools: AnalysisPool[],
  currentPrice: number,
): AnalysisPool | null {
  const candidates = pools.filter(
    (p) =>
      p.qualification?.verdict === "turning-point" &&
      p.qualification.fadeDirection !== null,
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, p) =>
    Math.abs(p.linePrice - currentPrice) <
    Math.abs(best.linePrice - currentPrice)
      ? p
      : best,
  );
}

interface TryStyleArgs {
  style: EntryStyle;
  pool: AnalysisPool;
  side: TradeSide;
  input: ProposeWickTradeInput;
  cfg: WickTradeConfig;
  buffer: number;
  playbook: Playbook;
}

function tryStyle(args: TryStyleArgs): TradePlan | null {
  const { style, pool, side, input, cfg, buffer, playbook } = args;

  const entry = computeEntry({
    pool,
    style,
    buffer,
    anticipatory: cfg.anticipatory,
  });
  if (entry === null) return null;
  const stop = computeStop({ pool, style, buffer, beyond: cfg.beyond });
  const targetOut = computeTarget({ pool, arms: input.arms, entry, side });

  // Sanity: stop on the loss side of entry, target on the profit side.
  if (side === "short" && (stop <= entry || targetOut.target >= entry)) {
    return null;
  }
  if (side === "long" && (stop >= entry || targetOut.target <= entry)) {
    return null;
  }

  const riskAbs = Math.abs(entry - stop);
  const rewardAbs = Math.abs(targetOut.target - entry);
  if (riskAbs === 0 || entry === 0) return null;
  const riskRewardRatio = rewardAbs / riskAbs;
  if (riskRewardRatio < cfg.minRiskRewardRatio) return null;

  const rationale: string[] = [
    `fade ${playbook} turning-point`,
    `pool ${pool.id} (${pool.type})`,
    `entry style ${style}`,
    `target via ${targetOut.source}`,
  ];

  return {
    timeframe: input.timeframe,
    playbook,
    phase: "take",
    side,
    entry,
    stop,
    target: targetOut.target,
    riskRewardRatio,
    riskPct: (riskAbs / entry) * 100,
    sizeMultiplier: cfg.sizeMultiplier[style],
    anchorPoolId: pool.id,
    rationale,
  };
}
