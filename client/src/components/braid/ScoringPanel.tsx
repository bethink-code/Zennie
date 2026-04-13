// Admin Panel 3 — Confluence (Phase 2: replaces the old 7-component scoring).
// In the multi-TF model, the primary signal is multi-TF confluence, not a
// 7-component additive score. This panel groups levels by their confluence
// count, showing which prices have the most TFs agreeing.

import type { AnalysisStateClient, AnalysisLevelClient } from "./types";

interface Props {
  state: AnalysisStateClient;
}

export function ScoringPanel({ state }: Props) {
  // Group levels into confluence clusters. Two levels in the same cluster
  // if either is in the other's cluster member list.
  const clusters = buildClusters(state.levels);
  // Sort clusters by max confluence in the cluster, descending
  clusters.sort(
    (a, b) =>
      Math.max(...b.map((l) => l.confluenceCount)) -
      Math.max(...a.map((l) => l.confluenceCount)),
  );

  return (
    <div className="bg-white border border-black/10 rounded-lg overflow-hidden">
      <header className="px-4 py-2 border-b border-black/10 flex items-center justify-between">
        <h3 className="text-sm font-medium">Panel 3 · Confluence</h3>
        <span className="text-xs text-[#888780]">
          {clusters.length} clusters · {state.levels.length} levels
        </span>
      </header>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-xs">
          <thead className="text-[#888780] sticky top-0 bg-white">
            <tr>
              <th className="text-left px-3 py-2">Avg price</th>
              <th className="text-left px-2 py-2">Side</th>
              <th className="text-left px-2 py-2">TFs</th>
              <th className="text-right px-3 py-2">Conf</th>
            </tr>
          </thead>
          <tbody>
            {clusters.map((cluster, i) => {
              const avgPrice =
                cluster.reduce((s, l) => s + l.price, 0) / cluster.length;
              const sides = new Set(cluster.map((l) => l.side));
              const side = sides.size === 1 ? cluster[0].side : "MIXED";
              const tfs = Array.from(
                new Set(cluster.map((l) => l.sourceTimeframe)),
              );
              const tfOrder = ["15m", "1H", "4H", "12H", "D", "W", "M"];
              tfs.sort((a, b) => tfOrder.indexOf(a) - tfOrder.indexOf(b));
              const maxConf = Math.max(...cluster.map((l) => l.confluenceCount));
              return (
                <tr key={`cluster-${i}`} className="border-t border-black/5">
                  <td className="px-3 py-1.5 font-mono">
                    {formatPrice(avgPrice)}
                  </td>
                  <td className="px-2 py-1.5">
                    <span
                      className={
                        side === "RESISTANCE"
                          ? "text-[#A32D2D]"
                          : side === "SUPPORT"
                            ? "text-[#0F6E56]"
                            : "text-[#888780]"
                      }
                    >
                      {side === "RESISTANCE"
                        ? "RES"
                        : side === "SUPPORT"
                          ? "SUP"
                          : "MIX"}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 font-mono text-[10px]">
                    {tfs.join("+")}
                  </td>
                  <td className="px-3 py-1.5 text-right font-medium">
                    {maxConf}×
                  </td>
                </tr>
              );
            })}
            {clusters.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-[#888780]">
                  no clusters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <footer className="px-3 py-2 border-t border-black/10 text-[10px] text-[#888780]">
        Confluence count = how many of the trader's four TFs (4H/D/W/M) agree.
        Higher = more structurally significant.
      </footer>
    </div>
  );
}

// Build clusters: two levels are in the same cluster if either is in the
// other's clusterMemberIds list, OR if they share at least one cluster member.
// Simple union-find based on clusterMemberIds.
function buildClusters(
  levels: AnalysisLevelClient[],
): AnalysisLevelClient[][] {
  const idToLevel = new Map(levels.map((l) => [l.id, l]));
  const visited = new Set<string>();
  const clusters: AnalysisLevelClient[][] = [];

  for (const seed of levels) {
    if (visited.has(seed.id)) continue;
    const cluster: AnalysisLevelClient[] = [];
    const queue: AnalysisLevelClient[] = [seed];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.id)) continue;
      visited.add(current.id);
      cluster.push(current);
      for (const memberId of current.clusterMemberIds) {
        const member = idToLevel.get(memberId);
        if (member && !visited.has(member.id)) {
          queue.push(member);
        }
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

function formatPrice(p: number): string {
  return "$" + p.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
