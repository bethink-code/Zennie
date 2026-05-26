// Global paper-trading view — every symbol in one place. Open orders, closed
// trades, and account P&L. Deliberately simple: the per-symbol Braid TRADES
// tab is for drilling in; this is the "show me everything" summary.

import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

interface Position {
  symbol: string;
  timeframe: string;
  side: "long" | "short";
  status: string;
  phase: string;
  entryPrice: number;
  fillPrice: number | null;
  closePrice: number | null;
  stopPrice: number;
  targetPrice: number;
  realisedPnl: number | null;
  exitReason: string | null;
}

interface AllResponse {
  account: {
    currentEquity: number;
    startingEquity: number;
    peakEquity: number;
    killStatus: string;
    drawdownPct: number;
  };
  pnl: {
    abs: number;
    pct: number;
    closedTrades: number;
    winners: number;
    losers: number;
    winRate: number | null;
  };
  open: Position[];
  closed: Position[];
  computedAtMs: number;
}

const px = (n: number | null) =>
  n === null ? "—" : n < 1 ? n.toFixed(5) : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const money = (n: number) => `${n >= 0 ? "+" : "−"}$${Math.abs(n).toFixed(2)}`;
const pnlColour = (n: number) => (n > 0 ? "#2f7d4f" : n < 0 ? "#b4453a" : "#888780");

export default function PnL() {
  const { data, isFetching, refetch } = useQuery<AllResponse | null>({
    queryKey: ["/api/zenny/paper-trades/all"],
    refetchInterval: 60_000, // light auto-refresh; this is an active monitor view
  });

  return (
    <div className="min-h-screen bg-[#f8f7f4] text-[#3d3d3a]">
      <header className="flex items-center justify-between border-b border-black/10 bg-white px-4 py-2">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-medium">Paper Trading — All</h1>
          <Link href="/">
            <button className="rounded border border-black/15 px-2 py-0.5 text-sm hover:bg-[#f1efe8]">
              ← Braid
            </button>
          </Link>
        </div>
        <div className="flex items-center gap-3 text-xs text-[#888780]">
          {data && <span>updated {new Date(data.computedAtMs).toLocaleTimeString()}</span>}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="rounded border border-black/15 px-2 py-0.5 text-sm hover:bg-[#f1efe8] disabled:opacity-50"
          >
            {isFetching ? "..." : "Refresh"}
          </button>
        </div>
      </header>

      {!data ? (
        <div className="p-8 text-[#888780]">Loading…</div>
      ) : (
        <div className="mx-auto max-w-5xl space-y-8 p-6">
          {/* Account summary */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Equity" value={`$${data.account.currentEquity.toFixed(2)}`} sub={`start $${data.account.startingEquity.toFixed(0)}`} />
            <Stat label="Total P&L" value={money(data.pnl.abs)} sub={`${data.pnl.pct >= 0 ? "+" : ""}${data.pnl.pct.toFixed(2)}%`} colour={pnlColour(data.pnl.abs)} />
            <Stat
              label="Closed trades"
              value={String(data.pnl.closedTrades)}
              sub={`${data.pnl.winners}W / ${data.pnl.losers}L${data.pnl.winRate !== null ? ` · ${(data.pnl.winRate * 100).toFixed(0)}%` : ""}`}
            />
            <Stat label="Kill switch" value={data.account.killStatus} sub={`drawdown ${data.account.drawdownPct.toFixed(1)}%`} colour={data.account.killStatus === "OK" ? "#2f7d4f" : "#b4453a"} />
          </div>

          {/* Open */}
          <Section title={`Open & resting orders (${data.open.length})`}>
            {data.open.length === 0 ? (
              <Empty>No open orders right now.</Empty>
            ) : (
              <Table
                head={["Symbol", "TF", "Side", "State", "Entry", "Stop", "Target"]}
                rows={data.open.map((p) => [
                  p.symbol,
                  p.timeframe,
                  <Side key="s" side={p.side} />,
                  p.status === "FILLED" ? "in trade" : "resting",
                  px(p.status === "FILLED" ? p.fillPrice : p.entryPrice),
                  px(p.stopPrice),
                  px(p.targetPrice),
                ])}
              />
            )}
          </Section>

          {/* Closed */}
          <Section title={`Closed trades (${data.closed.length})`}>
            {data.closed.length === 0 ? (
              <Empty>Nothing closed yet.</Empty>
            ) : (
              <Table
                head={["Symbol", "TF", "Side", "Exit", "Fill", "Close", "P&L"]}
                rows={data.closed.map((p) => [
                  p.symbol,
                  p.timeframe,
                  <Side key="s" side={p.side} />,
                  p.exitReason ?? "—",
                  px(p.fillPrice),
                  px(p.closePrice),
                  <span key="p" style={{ color: pnlColour(p.realisedPnl ?? 0) }}>
                    {money(p.realisedPnl ?? 0)}
                  </span>,
                ])}
              />
            )}
          </Section>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, colour }: { label: string; value: string; sub?: string; colour?: string }) {
  return (
    <div className="rounded border border-black/10 bg-white p-3">
      <div className="text-xs uppercase tracking-wide text-[#888780]">{label}</div>
      <div className="text-xl font-semibold" style={colour ? { color: colour } : undefined}>
        {value}
      </div>
      {sub && <div className="text-xs text-[#888780]">{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-[#888780]">{title}</h2>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded border border-dashed border-black/10 bg-white p-4 text-sm text-[#888780]">{children}</div>;
}

function Side({ side }: { side: "long" | "short" }) {
  return (
    <span style={{ color: side === "long" ? "#2f7d4f" : "#b4453a" }}>
      {side === "long" ? "▲ LONG" : "▼ SHORT"}
    </span>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded border border-black/10 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-[#888780]">
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-black/5 last:border-0">
              {r.map((cell, j) => (
                <td key={j} className="px-3 py-2 tabular-nums">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
