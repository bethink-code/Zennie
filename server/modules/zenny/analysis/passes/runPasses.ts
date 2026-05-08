// runPasses — applies the configured pass chain to a level set.
//
// Every pass is independent and runs against the original identified
// levels. Disabled passes write nothing. Results are merged into each
// level's `passes` bag under the pass's own key.
//
// New passes register here. Adding one is purely additive — existing
// passes keep their key, the renderer keys on presence not order.

import type { AnalysisLevel } from "../orchestrator";
import type { PassConfig, PassRunInput } from "./types";
import { DEFAULT_PASS_CONFIG } from "./types";
import { runRecencyPass } from "./recencyPass";
import { runTouchCountPass } from "./touchCountPass";
import {
  runLastLegPass,
  findLastLegSwings,
  type LastLegSwing,
} from "./lastLegPass";
import { runAggregatePass } from "./aggregatePass";
import { runPolarityFlipPass } from "./polarityFlipPass";
import {
  runWireAnglePass,
  type WireAnglePassResult,
} from "./wireAnglePass";

// Some passes have GLOBAL state that the renderer needs (not per-level).
// We expose it as `passInfo`: a parallel bag where each pass can stash a
// shared output. The lastLeg pass uses it to publish the swings list so
// the chart can render markers at swing prices regardless of whether a
// pivot/cluster level happens to coincide with each swing.
export interface PassInfo {
  lastLeg?: {
    swings: LastLegSwing[];
  };
  wireAngle?: WireAnglePassResult;
}

export interface RunPassesResult {
  levels: AnalysisLevel[];
  passInfo: PassInfo;
}

export function runPasses(
  input: PassRunInput,
  config: PassConfig,
): RunPassesResult {
  // Defensive merge: a config that pre-dates a pass (e.g. an old client
  // localStorage value) won't carry that pass's slot. Filling in defaults
  // for missing slots keeps the orchestrator from blowing up when a new
  // pass is added.
  const c: PassConfig = {
    recency: { ...DEFAULT_PASS_CONFIG.recency, ...(config.recency ?? {}) },
    touchCount: {
      ...DEFAULT_PASS_CONFIG.touchCount,
      ...(config.touchCount ?? {}),
    },
    lastLeg: { ...DEFAULT_PASS_CONFIG.lastLeg, ...(config.lastLeg ?? {}) },
    polarityFlip: {
      ...DEFAULT_PASS_CONFIG.polarityFlip,
      ...(config.polarityFlip ?? {}),
    },
    aggregate: {
      ...DEFAULT_PASS_CONFIG.aggregate,
      ...(config.aggregate ?? {}),
    },
    wireAngle: {
      ...DEFAULT_PASS_CONFIG.wireAngle,
      ...(config.wireAngle ?? {}),
    },
  };
  const recency = runRecencyPass(input, c.recency);
  const touchCount = runTouchCountPass(input, c.touchCount);
  const lastLeg = runLastLegPass(input, c.lastLeg);
  const polarityFlip = runPolarityFlipPass(input, c.polarityFlip);
  const wireAngle = runWireAnglePass(input, c.wireAngle);

  const passInfo: PassInfo = {};
  if (c.lastLeg.enabled) {
    const allSwings = findLastLegSwings(
      input.primaryCandles,
      c.lastLeg.reversalPct,
    );
    const lastN = Math.max(1, Math.floor(c.lastLeg.lastN));
    passInfo.lastLeg = { swings: allSwings.slice(-lastN) };
  }
  if (wireAngle !== null) {
    passInfo.wireAngle = wireAngle;
  }

  // First merge: per-level passes (recency/touchCount/lastLeg). Aggregate
  // runs after this because it READS the enriched passes bag — it's the
  // only pass with cross-pass dependency.
  const enrichedLevels = input.levels.map((level) => {
    const passes: Record<string, unknown> = { ...(level.passes ?? {}) };
    const r = recency.get(level.id);
    if (r !== undefined) passes.recency = r;
    const t = touchCount.get(level.id);
    if (t !== undefined) passes.touchCount = t;
    const ll = lastLeg.get(level.id);
    if (ll !== undefined) passes.lastLeg = ll;
    const pf = polarityFlip.get(level.id);
    if (pf !== undefined) passes.polarityFlip = pf;
    return { ...level, passes };
  });

  // Aggregate over enriched levels, then merge its result back.
  const aggregate = runAggregatePass(enrichedLevels, c.aggregate);
  const finalLevels = enrichedLevels.map((level) => {
    const a = aggregate.get(level.id);
    if (a === undefined) return level;
    return {
      ...level,
      passes: { ...level.passes, aggregate: a },
    };
  });

  return { levels: finalLevels, passInfo };
}
