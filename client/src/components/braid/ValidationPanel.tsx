// Admin Panel 2 - Pool list (Phase 2: simplified for multi-TF model).
// Lists every pool with its source TF and liquidity/structure state.

import type { AnalysisStateClient } from "./types";

interface Props {
  state: AnalysisStateClient;
}

export function ValidationPanel({ state }: Props) {
  const sorted = [...state.pools].sort((a, b) => b.linePrice - a.linePrice);
  const live = state.pools.filter((p) => p.status === "active").length;
  const swept = state.pools.filter((p) => p.status === "swept").length;
  const broken = state.pools.filter((p) => p.status === "dead").length;

  return (
    <div className="bg-white border border-black/10 rounded-lg overflow-hidden">
      <header className="px-4 py-2 border-b border-black/10 flex items-center justify-between">
        <h3 className="text-sm font-medium">Panel 2 - Pools</h3>
        <span className="text-xs text-[#888780]">
          {live} live / {swept} swept / {broken} broken
        </span>
      </header>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-xs">
          <thead className="text-[#888780] sticky top-0 bg-white">
            <tr>
              <th className="text-left px-3 py-2">Line</th>
              <th className="text-left px-2 py-2">Side</th>
              <th className="text-left px-2 py-2">Source</th>
              <th className="text-right px-2 py-2">Conf</th>
              <th className="text-right px-2 py-2">Kind</th>
              <th className="text-right px-3 py-2">State</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id} className="border-t border-black/5">
                <td className="px-3 py-1.5 font-mono">
                  {formatPrice(p.linePrice)}
                </td>
                <td className="px-2 py-1.5">
                  <span
                    className={
                      p.type === "RESISTANCE"
                        ? "text-[#A32D2D]"
                        : "text-[#0F6E56]"
                    }
                  >
                    {p.type === "RESISTANCE" ? "RES" : "SUP"}
                  </span>
                </td>
                <td className="px-2 py-1.5 font-mono text-[10px]">
                  {p.sourceTimeframe}
                </td>
                <td className="px-2 py-1.5 text-right font-mono">
                  {p.confluenceCount}x
                </td>
                <td className="px-2 py-1.5 text-right text-[10px] text-[#73726c]">
                  {formatKind(p.kind)}
                </td>
                <td className="px-3 py-1.5 text-right text-[10px]">
                  {p.status === "active" && (
                    <span className="text-[#0F6E56]">live</span>
                  )}
                  {p.status === "swept" && (
                    <span className="text-[#c97a2c]">swept</span>
                  )}
                  {p.status === "dead" && (
                    <span className="text-[#888780]">broken</span>
                  )}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-[#888780]">
                  no pools
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

function formatKind(kind: string): string {
  if (kind === "pivot_probe") return "probe";
  if (kind === "equal_extremes") return "equal";
  if (kind === "round_number") return "round";
  if (kind === "session_extreme") return "session";
  return kind;
}
