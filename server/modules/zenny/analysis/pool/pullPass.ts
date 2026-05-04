// Pull score pass — gravitational ranking of active pools relative to
// current price. Per spec §4.1–4.3.
//
//   pull_raw[pool]    = S_effective[pool] / (distance_pct[pool] + DISTANCE_FLOOR)
//   distance_pct      = |price_now - pool.centreLine| / price_now × 100
//   pull_norm[pool]   = pull_raw / max(pull_raw across active pools) × 100
//   pull_decayed[pool] = pull_norm × DECAY_RATE^candles_moving_away
//                       (floored at MIN_PULL_FLOOR)
//
// Decay tracks consecutive candles where distance_pct increased; resets to 0
// on any candle where price moved toward the pool. The floor prevents pull
// from collapsing to zero so a long-dormant pool can still be re-activated
// if price returns to it.
//
// S_effective in the spec is the 7-component pool score (depth, freshness,
// touch quality, departure, confluence, wick cluster, volume profile —
// §3.1). Until those components are built we use a stand-in that maps the
// existing strength tier to the spec's 0–105 range. Marked clearly so the
// substitution is obvious when the real score lands.
//
// Pure function. No DB. No side effects.

import type { Candle } from "../../../../../shared/zennyTypes";
import type { LevelStrength } from "../level/levelStrength";
import type { AnalysisPool } from "../orchestrator";

export interface PullPassConfig {
  enabled: boolean;
  // Spec constants — exposed only so research can probe sensitivity.
  // Production should leave these at the spec values.
  distanceFloor: number; // §4.1, default 0.1
  decayRate: number; // §4.3, default 0.95
  minPullFloor: number; // §4.3, default 5.0
}

export const DEFAULT_PULL_PASS_CONFIG: PullPassConfig = {
  enabled: true,
  distanceFloor: 0.1,
  decayRate: 0.95,
  minPullFloor: 5.0,
};

export interface PoolPull {
  raw: number; // S_effective / (distance_pct + floor)
  normalized: number; // 0..100 across all active pools at this tick
  decayed: number; // after time decay; THE pull score for downstream use
  distancePct: number; // |price_now - pool.centre| / price_now × 100
  candlesMovingAway: number; // consecutive bars price has retreated from pool
  sEffectiveStandIn: number; // surfaced for transparency until real score lands
}

export interface RunPullPassInput {
  pools: AnalysisPool[];
  primaryCandles: Candle[];
}

export function runPullPass(
  input: RunPullPassInput,
  config: PullPassConfig = DEFAULT_PULL_PASS_CONFIG,
): Map<string, PoolPull> {
  const results = new Map<string, PoolPull>();
  if (!config.enabled) return results;
  if (input.primaryCandles.length === 0) return results;

  const currentPrice =
    input.primaryCandles[input.primaryCandles.length - 1].close;
  if (currentPrice <= 0) return results;

  // First sweep: raw pull + distance + decay counter for each active pool.
  const raws = new Map<string, number>();
  const dists = new Map<string, number>();
  const decayCounters = new Map<string, number>();
  const standIns = new Map<string, number>();

  for (const pool of input.pools) {
    if (pool.status !== "active") continue;

    const distancePct =
      (Math.abs(currentPrice - pool.centreLine) / currentPrice) * 100;
    const sEffective = sEffectiveStandIn(pool.strength);
    const raw = sEffective / (distancePct + config.distanceFloor);

    raws.set(pool.id, raw);
    dists.set(pool.id, distancePct);
    standIns.set(pool.id, sEffective);
    decayCounters.set(
      pool.id,
      computeCandlesMovingAway(pool, input.primaryCandles),
    );
  }

  if (raws.size === 0) return results;

  // Second sweep: normalise. The pool with the highest raw pull becomes the
  // 100; everything else scales proportionally.
  let maxRaw = 0;
  for (const v of raws.values()) {
    if (v > maxRaw) maxRaw = v;
  }
  if (maxRaw <= 0) return results;

  for (const [poolId, raw] of raws) {
    const normalized = (raw / maxRaw) * 100;
    const cma = decayCounters.get(poolId) ?? 0;
    const decayed = Math.max(
      config.minPullFloor,
      normalized * Math.pow(config.decayRate, cma),
    );
    results.set(poolId, {
      raw,
      normalized,
      decayed,
      distancePct: dists.get(poolId) ?? 0,
      candlesMovingAway: cma,
      sEffectiveStandIn: standIns.get(poolId) ?? 0,
    });
  }

  return results;
}

// STAND-IN until spec §3.1's 7-component pool score is implemented.
// Maps the existing strength tier (derived from recency × source-TF) to
// the 0–105 range S_effective uses in the spec. Replace this function
// with the real composite (depth + freshness curve + touch quality +
// departure strength + TF confluence + wick cluster + volume profile)
// when those components land — no other call site needs to change.
export function sEffectiveStandIn(strength: LevelStrength): number {
  switch (strength) {
    case "trivial":
      return 20;
    case "weak":
      return 40;
    case "medium":
      return 60;
    case "strong":
      return 80;
    case "very_strong":
      return 95;
    default:
      return 50;
  }
}

// candles_moving_away — count of consecutive primary-TF candles after pool
// birth where distance to the pool centre increased. Resets to 0 on any
// candle where distance decreased (price moved toward the pool). Equality
// (distance unchanged) is treated as "no progress in either direction"
// and neither increments nor resets.
export function computeCandlesMovingAway(
  pool: AnalysisPool,
  candles: Candle[],
): number {
  if (candles.length === 0) return 0;
  const startIdxRaw = pool.birthCandleIndexOnPrimary;
  const startIdx =
    startIdxRaw < 0
      ? 0
      : Math.min(startIdxRaw, candles.length - 1);
  if (startIdx >= candles.length - 1) return 0;

  let counter = 0;
  let prevDistance = Math.abs(candles[startIdx].close - pool.centreLine);
  for (let i = startIdx + 1; i < candles.length; i++) {
    const d = Math.abs(candles[i].close - pool.centreLine);
    if (d > prevDistance) counter++;
    else if (d < prevDistance) counter = 0;
    prevDistance = d;
  }
  return counter;
}
