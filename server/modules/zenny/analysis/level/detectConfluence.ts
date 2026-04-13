// detectConfluence — cluster levels from multiple timeframes into confluent
// groups. A level where Weekly + Daily + 4H agree is a structural pillar;
// the confluence count drives strength.
//
// Input: a flat list of levels, each tagged with a source timeframe.
// Output: per-level enrichment — which OTHER TFs have a matching level at
// the same price (within a tolerance band), and the total confluence count.
//
// Only "confluence-scoring" timeframes contribute to the count (the
// "trader's four": 4H / D / W / M). Lower TFs (15m, 1H) have their lines
// drawn but don't factor into confluence — they'd otherwise dilute the signal.
//
// Pure function.

import type { Timeframe } from "../../../../../shared/zennyTypes";
import { CONFLUENCE_TIMEFRAMES } from "../../../../../shared/zennyTypes";

export interface LevelInput {
  id: string;
  price: number;
  side: "RESISTANCE" | "SUPPORT";
  sourceTimeframe: Timeframe;
}

export interface ConfluenceInfo {
  // Which OTHER timeframes have a level at this price (excluding self).
  // Always a subset of CONFLUENCE_TIMEFRAMES — execution TFs don't contribute.
  matchingTimeframes: Timeframe[];
  // matchingTimeframes.length + 1 if this level's own TF is in CONFLUENCE_TIMEFRAMES
  // (i.e. how many of the trader's four agree).
  confluenceCount: number;
  // IDs of the levels we clustered with (for drill-down / panel display).
  clusterMemberIds: string[];
}

export interface DetectConfluenceInput {
  levels: LevelInput[];
  tolerancePct?: number; // default 0.005 (0.5%)
}

// Returns a Map: levelId → ConfluenceInfo. Every level in the input gets
// an entry, even if its confluence count is 1 (self only).
export function detectConfluence(
  input: DetectConfluenceInput,
): Map<string, ConfluenceInfo> {
  const tolerance = input.tolerancePct ?? 0.005;
  const result = new Map<string, ConfluenceInfo>();

  for (const level of input.levels) {
    const upper = level.price * (1 + tolerance);
    const lower = level.price * (1 - tolerance);
    const matchingTfs = new Set<Timeframe>();
    const clusterIds = new Set<string>();

    for (const other of input.levels) {
      if (other.id === level.id) continue;
      // Must be the same side (resistance with resistance, support with support)
      if (other.side !== level.side) continue;
      if (other.price < lower || other.price > upper) continue;
      // Only count confluence-scoring TFs
      if (!CONFLUENCE_TIMEFRAMES.includes(other.sourceTimeframe)) continue;
      matchingTfs.add(other.sourceTimeframe);
      clusterIds.add(other.id);
    }

    // If THIS level's own TF is a confluence-scoring TF, it counts too.
    const selfContributes = CONFLUENCE_TIMEFRAMES.includes(level.sourceTimeframe);
    const confluenceCount = matchingTfs.size + (selfContributes ? 1 : 0);

    result.set(level.id, {
      matchingTimeframes: Array.from(matchingTfs).sort(timeframeOrder),
      confluenceCount,
      clusterMemberIds: Array.from(clusterIds),
    });
  }

  return result;
}

// Sort order for displaying matching TFs: smallest → largest
const TF_ORDER: Record<Timeframe, number> = {
  "15m": 0,
  "1H": 1,
  "4H": 2,
  "12H": 3,
  D: 4,
  W: 5,
  M: 6,
};

function timeframeOrder(a: Timeframe, b: Timeframe): number {
  return TF_ORDER[a] - TF_ORDER[b];
}
