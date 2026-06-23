// Trades column — collapsed shows active count for current symbol/TF; expanded
// shows the full paper account: summary, Manage trigger, resting orders,
// in-trade with unrealised PnL, and recent closed history (all symbols).

import type { PaperPositionClient } from "./types";

const C = {
  text: "#888780",
  textStrong: "#3d3d3a",
  textDim: "#aaaaa3",
  rule: "rgba(0,0,0,0.06)",
  long: "#1d9e75",
  short: "#b14746",
  green: "#2f7d4f",
  red: "#b4453a",
};

// Mirrors the shape returned by GET /api/zenny/paper-trades/all
export interface AllData {
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
  open: AllPosition[];
  closed: AllPosition[];
  totalUnrealisedPnl?: number;
  computedAtMs: number;
}

interface AllPosition {
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
  markPrice?: number;
  unrealisedPnl?: number;
}

interface CollapsedProps {
  chartHeight: number;
  openPositions: PaperPositionClient[];
}

interface ExpandedProps {
  allData: AllData | null;
  onManage: () => void;
  managing: boolean;
}

export function TradesColumnCollapsed({ chartHeight, openPositions }: CollapsedProps) {
  return (
    <div
      className="relative w-full h-full flex flex-col items-center justify-center"
      style={{ paddingTop: 24, color: C.text }}
    >
      <div style={{ fontSize: 18, fontWeight: 600, color: C.textStrong }}>
        {openPositions.length}
      </div>
      <div style={{ fontSize: 9, marginTop: 2 }}>active</div>
    </div>
  );
}

export function TradesColumnExpanded({ allData, onManage, managing }: ExpandedProps) {
  if (!allData) {
    return (
      <div className="flex flex-col gap-3" style={{ color: C.text }}>
        <SectionLabel title="PAPER ACCOUNT" />
        <div style={{ fontSize: 11, color: C.textDim }}>Loading…</div>
        <ManageButton onManage={onManage} managing={managing} />
      </div>
    );
  }

  const { account, pnl, open, closed, totalUnrealisedPnl } = allData;
  const resting = open.filter((p) => p.status !== "FILLED");
  const inTrade = open.filter((p) => p.status === "FILLED");
  const pnlColour = pnl.abs > 0 ? C.green : pnl.abs < 0 ? C.red : C.text;

  return (
    <div className="flex flex-col gap-3" style={{ color: C.textStrong }}>
      {/* Account summary */}
      <div>
        <SectionLabel title="PAPER ACCOUNT" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 8px", marginTop: 4 }}>
          <KV label="Equity" value={`$${account.currentEquity.toFixed(2)}`} />
          <KV
            label="P&L"
            value={`${money(pnl.abs)} (${pnl.pct >= 0 ? "+" : ""}${pnl.pct.toFixed(1)}%)`}
            colour={pnlColour}
          />
          <KV
            label="Trades"
            value={`${pnl.closedTrades} · ${pnl.winners}W ${pnl.losers}L${pnl.winRate != null ? ` · ${(pnl.winRate * 100).toFixed(0)}%` : ""}`}
          />
          <KV
            label="Kill"
            value={`${account.killStatus} (${account.drawdownPct.toFixed(1)}% dd)`}
            colour={account.killStatus === "OK" ? C.green : C.red}
          />
        </div>
      </div>

      <ManageButton onManage={onManage} managing={managing} />

      {/* Resting orders */}
      <div>
        <SectionLabel title={`RESTING (${resting.length})`} />
        {resting.length === 0 ? (
          <Empty>No resting orders.</Empty>
        ) : (
          resting.map((p, i) => <RestingRow key={i} pos={p} />)
        )}
      </div>

      {/* In trade */}
      <div>
        <SectionLabel
          title={`IN TRADE (${inTrade.length})${inTrade.length > 0 && totalUnrealisedPnl != null ? ` · ${money(totalUnrealisedPnl)}` : ""}`}
        />
        {inTrade.length === 0 ? (
          <Empty>No positions in trade.</Empty>
        ) : (
          inTrade.map((p, i) => <InTradeRow key={i} pos={p} />)
        )}
      </div>

      {/* Closed */}
      <div>
        <SectionLabel title={`CLOSED (${closed.length})`} />
        {closed.length === 0 ? (
          <Empty>Nothing closed yet.</Empty>
        ) : (
          closed.slice(0, 8).map((p, i) => <ClosedRow key={i} pos={p} />)
        )}
      </div>
    </div>
  );
}

function ManageButton({ onManage, managing }: { onManage: () => void; managing: boolean }) {
  return (
    <button
      onClick={onManage}
      disabled={managing}
      style={{
        width: "100%",
        padding: "5px 0",
        border: "1px solid rgba(0,0,0,0.12)",
        borderRadius: 4,
        fontSize: 11,
        background: managing ? "rgba(0,0,0,0.04)" : "white",
        color: managing ? C.text : C.textStrong,
        cursor: managing ? "wait" : "pointer",
        letterSpacing: "0.04em",
      }}
      title="Advance all open positions over the latest bars (fill / stop / target / close)"
    >
      {managing ? "Managing…" : "Manage positions"}
    </button>
  );
}

function RestingRow({ pos }: { pos: AllPosition }) {
  const sideColour = pos.side === "long" ? C.long : C.short;
  const rrVal = (() => {
    const risk = Math.abs(pos.entryPrice - pos.stopPrice);
    const reward = Math.abs(pos.targetPrice - pos.entryPrice);
    return risk > 0 ? `${(reward / risk).toFixed(1)}R` : "—";
  })();
  return (
    <div style={{ paddingTop: 6, borderTop: `1px solid ${C.rule}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
        <span style={{ fontWeight: 600, color: sideColour }}>
          {pos.side === "long" ? "▲" : "▼"} {pos.symbol} {pos.timeframe}
        </span>
        <span style={{ color: C.text }}>{rrVal}</span>
      </div>
      <div style={{ display: "flex", gap: 6, fontSize: 10, color: C.text, marginTop: 2 }}>
        <span>E {fmt(pos.entryPrice)}</span>
        <span>·</span>
        <span style={{ color: C.red }}>S {fmt(pos.stopPrice)}</span>
        <span>·</span>
        <span style={{ color: C.green }}>T {fmt(pos.targetPrice)}</span>
      </div>
    </div>
  );
}

function InTradeRow({ pos }: { pos: AllPosition }) {
  const sideColour = pos.side === "long" ? C.long : C.short;
  const unreal = pos.unrealisedPnl ?? null;
  return (
    <div style={{ paddingTop: 6, borderTop: `1px solid ${C.rule}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
        <span style={{ fontWeight: 600, color: sideColour }}>
          {pos.side === "long" ? "▲" : "▼"} {pos.symbol} {pos.timeframe}
        </span>
        {unreal != null && (
          <span style={{ color: unreal >= 0 ? C.green : C.red, fontWeight: 600 }}>
            {money(unreal)}
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, fontSize: 10, color: C.text, marginTop: 2 }}>
        <span>Fill {fmt(pos.fillPrice ?? pos.entryPrice)}</span>
        {pos.markPrice != null && (
          <>
            <span>·</span>
            <span>Mark {fmt(pos.markPrice)}</span>
          </>
        )}
      </div>
    </div>
  );
}

function ClosedRow({ pos }: { pos: AllPosition }) {
  const sideColour = pos.side === "long" ? C.long : C.short;
  const pnl = pos.realisedPnl ?? 0;
  return (
    <div style={{ paddingTop: 6, borderTop: `1px solid ${C.rule}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
        <span style={{ color: sideColour }}>
          {pos.side === "long" ? "▲" : "▼"} {pos.symbol} {pos.timeframe}
        </span>
        <span style={{ color: pnl >= 0 ? C.green : C.red, fontWeight: 600 }}>
          {money(pnl)}
        </span>
      </div>
      {pos.exitReason && (
        <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>
          {pos.exitReason}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ title }: { title: string }) {
  return (
    <div
      style={{
        color: C.text,
        fontSize: 10,
        letterSpacing: "0.06em",
        marginBottom: 4,
      }}
    >
      {title}
    </div>
  );
}

function KV({ label, value, colour }: { label: string; value: string; colour?: string }) {
  return (
    <div>
      <div style={{ color: C.textDim, fontSize: 9, letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ color: colour ?? C.textStrong, fontSize: 11, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ color: C.textDim, fontStyle: "italic", fontSize: 11, paddingTop: 4 }}>
      {children}
    </div>
  );
}

function fmt(p: number): string {
  if (p >= 10_000) return "$" + (p / 1000).toFixed(2) + "K";
  if (p >= 1_000) return "$" + p.toFixed(0);
  if (p >= 1) return "$" + p.toFixed(2);
  return "$" + p.toFixed(4);
}

function money(n: number): string {
  const sign = n >= 0 ? "+" : "−";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}
