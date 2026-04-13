// Admin Panel 2 — Pool list (Phase 2: simplified for multi-TF model).
// Lists every pool with its source TF and confluence count.
// The old "validation pass/fail" semantics are gone — in the new model, a
// level becomes a pool if its strength is medium+, with no separate
// validation step that can fail. Rejected candidates are now just
// trivial/weak levels that didn't graduate.

import type { AnalysisStateClient } from "./types";

interface Props {
  state: AnalysisStateClient;
}

export function ValidationPanel({ state }: Props) {
  const sorted = [...state.pools].sort((a, b) => b.linePrice - a.linePrice);
  const alive = state.pools.filter((p) => p.status === "active").length;
  const taken = state.pools.filter((p) => p.status === "dead").length;

  return (
    <div className="bg-white border border-black/10 rounded-lg overflow-hidden">
      <header className="px-4 py-2 border-b border-black/10 flex items-center justify-between">
        <h3 className="text-sm font-medium">Panel 2 · Pools</h3>
        <span className="text-xs text-[#888780]">
          {alive} alive · {taken} taken
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
                <td className="px-3 py-1.5 font-mono">{formatPrice(p.linePrice)}</td>
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
                  {p.confluenceCount}×
                </td>
                <td className="px-2 py-1.5 text-right text-[10px] text-[#73726c]">
                  {p.kind === "historical_respect" ? "historical" : "untaken"}
                </td>
                <td className="px-3 py-1.5 text-right text-[10px]">
                  {p.status === "active" ? (
                    <span className="text-[#0F6E56]">alive</span>
                  ) : (
                    <span className="text-[#888780]">taken</span>
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
