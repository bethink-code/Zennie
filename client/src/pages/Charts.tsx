// Watchlist gallery — a small Braid chart per symbol with its resting/open
// order drawn on, so you can scan the whole watchlist and eyeball whether the
// engine is placing orders sensibly. Deliberately read-only and simple; drill
// into the full Braid page for detail.

import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { WATCHLIST_SYMBOLS } from "@shared/zennyWatchlist";
import { MiniBraidChart } from "@/components/braid/MiniBraidChart";

export default function Charts() {
  const qc = useQueryClient();
  const refreshAll = () =>
    qc.invalidateQueries({
      predicate: (q) =>
        typeof q.queryKey[0] === "string" &&
        (q.queryKey[0] as string).startsWith("/api/zenny/braid-view-model"),
    });

  return (
    <div className="min-h-screen bg-[#f8f7f4] text-[#3d3d3a]">
      <header className="flex items-center justify-between border-b border-black/10 bg-white px-4 py-2">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-medium">Watchlist Charts</h1>
          <Link href="/">
            <button className="rounded border border-black/15 px-2 py-0.5 text-sm hover:bg-[#f1efe8]">
              ← Braid
            </button>
          </Link>
          <Link href="/pnl">
            <button className="rounded border border-black/15 px-2 py-0.5 text-sm hover:bg-[#f1efe8]">
              P&L
            </button>
          </Link>
        </div>
        <button
          onClick={refreshAll}
          className="rounded border border-black/15 px-2 py-0.5 text-sm hover:bg-[#f1efe8]"
        >
          Refresh all
        </button>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-2">
        {WATCHLIST_SYMBOLS.map((s) => (
          <MiniBraidChart key={s} symbol={s} timeframe="15m" />
        ))}
      </div>
    </div>
  );
}
