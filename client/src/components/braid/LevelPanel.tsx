// Admin Panel 1 — Level Identification (Phase 2 multi-TF version).
// Lists every detected level. Each level shows its source TF and the other
// TFs it's confluent with. Sorted by strength descending.

import type { AnalysisStateClient, LevelStrengthClient } from "./types";

interface Props {
  state: AnalysisStateClient;
}

const STRENGTH_RANK: Record<LevelStrengthClient, number> = {
  very_strong: 4,
  strong: 3,
  medium: 2,
  weak: 1,
  trivial: 0,
};

const STRENGTH_LABEL: Record<LevelStrengthClient, string> = {
  very_strong: "very strong",
  strong: "strong",
  medium: "medium",
  weak: "weak",
  trivial: "trivial",
};

const STRENGTH_COLOUR: Record<LevelStrengthClient, string> = {
  very_strong: "text-[#3d3d3a] font-medium",
  strong: "text-[#5F5E5A]",
  medium: "text-[#73726c]",
  weak: "text-[#888780]",
  trivial: "text-[#a8a7a0]",
};

export function LevelPanel({ state }: Props) {
  const sorted = [...state.levels].sort((a, b) => {
    const ds = STRENGTH_RANK[b.strength] - STRENGTH_RANK[a.strength];
    if (ds !== 0) return ds;
    return b.price - a.price;
  });
  const graduated = state.levels.filter((l) => l.graduatedToPoolId !== null).length;

  return (
    <div className="bg-white border border-black/10 rounded-lg overflow-hidden">
      <header className="px-4 py-2 border-b border-black/10 flex items-center justify-between">
        <h3 className="text-sm font-medium">Panel 1 · Levels</h3>
        <span className="text-xs text-[#888780]">
          {state.levels.length} total · {graduated} → pools
        </span>
      </header>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-xs">
          <thead className="text-[#888780] sticky top-0 bg-white">
            <tr>
              <th className="text-left px-3 py-2">Price</th>
              <th className="text-left px-2 py-2">Side</th>
              <th className="text-left px-2 py-2">Source</th>
              <th className="text-left px-2 py-2">Confluent with</th>
              <th className="text-right px-2 py-2">Strength</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((l) => (
              <tr key={l.id} className="border-t border-black/5">
                <td className="px-3 py-1.5 font-mono">{formatPrice(l.price)}</td>
                <td className="px-2 py-1.5">
                  <span
                    className={
                      l.side === "RESISTANCE"
                        ? "text-[#A32D2D]"
                        : "text-[#0F6E56]"
                    }
                  >
                    {l.side === "RESISTANCE" ? "RES" : "SUP"}
                  </span>
                </td>
                <td className="px-2 py-1.5 font-mono text-[10px]">
                  {l.sourceTimeframe}
                </td>
                <td className="px-2 py-1.5 font-mono text-[10px] text-[#5F5E5A]">
                  {l.matchingTimeframes.length === 0
                    ? "—"
                    : l.matchingTimeframes.join("+")}
                  {l.confluenceCount >= 2 && (
                    <span className="ml-1 text-[#888780]">
                      ({l.confluenceCount}×)
                    </span>
                  )}
                </td>
                <td
                  className={`px-2 py-1.5 text-right text-[10px] ${STRENGTH_COLOUR[l.strength]}`}
                >
                  {STRENGTH_LABEL[l.strength]}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-[#888780]">
                  no levels detected
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatPrice(p: number): string {
  return "$" + p.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
