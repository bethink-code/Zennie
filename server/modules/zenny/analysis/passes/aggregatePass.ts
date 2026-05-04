// Aggregate pass — combines other passes' per-level outputs into a single
// composite score plus a "show your working" record of which passes
// contributed.
//
// Architecturally distinct: aggregate is the ONLY pass that depends on
// other passes' results. Runs last in the chain, after all per-level
// passes have written their own keys. Disabled passes simply don't
// contribute to the weighted sum.
//
// Output per level (under key "aggregate"):
//   { score: 0..1, contributors: string[] }
//
// `contributors` is the list of pass names whose value was non-zero and
// counted toward the score. The renderer / table can show them as a
// small breakdown so the aggregate isn't a magic number.

import type { AnalysisLevel } from "../orchestrator";
import type { AggregatePassConfig } from "./types";

export interface AggregatePassResult {
  score: number; // 0..1
  contributors: string[];
}

interface PassValueAccess {
  enabled: boolean;
  weight: number;
  read: (level: AnalysisLevel) => number | null;
  name: string;
}

export function runAggregatePass(
  levels: AnalysisLevel[],
  config: AggregatePassConfig,
): Map<string, AggregatePassResult> {
  const results = new Map<string, AggregatePassResult>();
  if (!config.enabled) return results;

  // Every contributor reads from the level's existing passes bag — this
  // is how aggregate composes others without duplicating their logic.
  const contributors: PassValueAccess[] = [
    {
      name: "recency",
      enabled: true,
      weight: config.weightRecency,
      read: (l) => readNum(l.passes.recency, "value"),
    },
    {
      name: "lastLeg",
      enabled: true,
      weight: config.weightLastLeg,
      read: (l) => readNum(l.passes.lastLeg, "value"),
    },
    {
      name: "touchCount",
      enabled: true,
      weight: config.weightTouchCount,
      read: (l) => {
        const v = readNum(l.passes.touchCount, "value");
        if (v === null) return null;
        // Normalise: 0 → 0, 3+ → 1.
        return Math.min(1, v / 3);
      },
    },
  ];

  for (const level of levels) {
    let weightedSum = 0;
    let totalWeight = 0;
    const used: string[] = [];
    for (const c of contributors) {
      if (!c.enabled || c.weight <= 0) continue;
      const v = c.read(level);
      if (v === null) continue; // pass disabled at the source
      weightedSum += v * c.weight;
      totalWeight += c.weight;
      if (v > 0) used.push(c.name);
    }

    let score = totalWeight === 0 ? 0 : weightedSum / totalWeight;

    // Broken levels carry consumed liquidity. Knock their composite score
    // down hard so the strength slider naturally hides them as it's
    // raised, even if individual passes scored them moderately.
    if (level.broken) score *= config.brokenPenalty;

    results.set(level.id, {
      score: Math.max(0, Math.min(1, score)),
      contributors: used,
    });
  }

  return results;
}

function readNum(passResult: unknown, key: string): number | null {
  if (passResult === null || passResult === undefined) return null;
  if (typeof passResult !== "object") return null;
  const v = (passResult as Record<string, unknown>)[key];
  return typeof v === "number" ? v : null;
}
