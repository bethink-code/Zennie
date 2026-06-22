// ORDERS column — the operator's actual placed wick orders on the active
// timeframe (resting + queued).
//
// The old auto-decider's "STRATEGY / POSSIBLE TRADE / WHY THIS GEOMETRY"
// recommendation was removed with the auto-trader: the tool no longer GIVES a
// verdict, it RECORDS the trades you place. (A fuller open-trades report —
// including in-trade and closed — is a later slice.)

import type { PaperPositionClient } from "./types";

const C = {
  text: "#888780",
  textStrong: "#3d3d3a",
  textDim: "#aaaaa3",
  rule: "rgba(0,0,0,0.06)",
  long: "#1d9e75",
  short: "#b14746",
};

export function OrdersStrategyColumnCollapsed({
  restingOrders,
  chartHeight,
}: {
  restingOrders: PaperPositionClient[];
  chartHeight: number;
}) {
  if (restingOrders.length === 0) {
    return (
      <div
        className="relative w-full flex items-center justify-center"
        style={{ height: chartHeight, color: C.textDim, fontSize: 10 }}
      >
        <span style={{ writingMode: "vertical-rl", letterSpacing: "0.05em" }}>
          no orders
        </span>
      </div>
    );
  }
  const order = restingOrders[0];
  const stateLabel = order.submittedAtBarTs != null ? "on book" : "queued";
  const sideColor = order.side === "long" ? C.long : C.short;
  return (
    <div
      className="relative w-full flex flex-col items-center justify-center gap-1"
      style={{ height: chartHeight }}
    >
      <div
        style={{ color: sideColor, fontSize: 13, fontWeight: 600, lineHeight: 1 }}
      >
        {order.side === "long" ? "▲" : "▼"}
      </div>
      <div
        style={{
          color: C.textStrong,
          fontSize: 8,
          fontWeight: 600,
          lineHeight: 1,
          letterSpacing: "0.04em",
        }}
      >
        {order.phase.slice(0, 3).toUpperCase()}
      </div>
      <div style={{ color: C.textDim, fontSize: 8, lineHeight: 1 }}>
        {stateLabel}
      </div>
      {restingOrders.length > 1 && (
        <div style={{ color: C.textDim, fontSize: 8, lineHeight: 1 }}>
          {restingOrders.length}x
        </div>
      )}
    </div>
  );
}

export function OrdersStrategyColumnExpanded({
  restingOrders,
}: {
  restingOrders: PaperPositionClient[];
}) {
  const sorted = restingOrders
    .slice()
    .sort(
      (a, b) =>
        (b.submittedAtBarTs ?? b.emittedAtBarTs) -
        (a.submittedAtBarTs ?? a.emittedAtBarTs),
    );

  if (sorted.length === 0) {
    return (
      <div style={{ color: C.text, fontSize: 11, lineHeight: 1.5 }}>
        No open orders on this timeframe. Use the wick tool on the chart to place
        one — the machine sizes and manages it; it doesn&rsquo;t pick it.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" style={{ color: C.textStrong }}>
      <div style={{ color: C.text, fontSize: 11 }}>
        {sorted.length} paper order{sorted.length === 1 ? "" : "s"} on this
        timeframe.
      </div>
      <div className="flex flex-col gap-2">
        {sorted.map((order) => (
          <RestingOrderBlock key={order.id} order={order} />
        ))}
      </div>
    </div>
  );
}

function RestingOrderBlock({ order }: { order: PaperPositionClient }) {
  const sideColor = order.side === "long" ? C.long : C.short;
  const stateLabel =
    order.submittedAtBarTs != null
      ? "RESTING PAPER ORDER"
      : "QUEUED PAPER ORDER";
  const stopDistance =
    ((order.stopPrice - order.entryPrice) / order.entryPrice) * 100;
  const targetDistance =
    ((order.targetPrice - order.entryPrice) / order.entryPrice) * 100;

  return (
    <div style={{ paddingTop: 8, borderTop: `1px dashed ${C.rule}` }}>
      <div className="flex justify-between items-baseline">
        <div style={{ color: C.text, fontSize: 10, letterSpacing: "0.06em" }}>
          {stateLabel}
        </div>
        <div
          style={{
            color: C.textDim,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.04em",
          }}
        >
          {order.phase.toUpperCase()}
        </div>
      </div>

      <div
        className="flex justify-between items-baseline"
        style={{ marginTop: 6 }}
      >
        <div
          style={{
            color: sideColor,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.04em",
          }}
        >
          {order.side === "long" ? "▲ LONG" : "▼ SHORT"}
        </div>
        <div style={{ color: C.text, fontSize: 11 }}>{order.status}</div>
      </div>

      <div className="flex flex-col gap-1" style={{ marginTop: 8 }}>
        <Row label="Entry" value={formatPrice(order.entryPrice)} />
        <Row
          label="Stop"
          value={`${formatPrice(order.stopPrice)}  (${formatSignedPct(stopDistance)})`}
          tone="negative"
        />
        <Row
          label="Target"
          value={`${formatPrice(order.targetPrice)}  (${formatSignedPct(targetDistance)})`}
          tone="positive"
        />
      </div>

      <div
        className="flex gap-4"
        style={{
          marginTop: 8,
          paddingTop: 8,
          borderTop: `1px dashed ${C.rule}`,
          fontSize: 11,
        }}
      >
        <span style={{ color: C.text }}>
          Risk{" "}
          <span className="tabular-nums" style={{ color: C.textStrong }}>
            {order.riskPct.toFixed(2)}%
          </span>
        </span>
        <span style={{ color: C.text }}>
          Size{" "}
          <span className="tabular-nums" style={{ color: C.textStrong }}>
            {order.sizeMultiplier.toFixed(1)}x
          </span>
        </span>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const valueColor =
    tone === "positive" ? C.long : tone === "negative" ? C.short : C.textStrong;
  return (
    <div className="flex justify-between items-baseline">
      <span style={{ color: C.text, fontSize: 11 }}>{label}</span>
      <span
        className="tabular-nums"
        style={{ color: valueColor, fontSize: 12, fontWeight: 500 }}
      >
        {value}
      </span>
    </div>
  );
}

function formatPrice(p: number): string {
  if (p >= 10_000) return "$" + (p / 1000).toFixed(2) + "K";
  if (p >= 1_000) return "$" + p.toFixed(0);
  if (p >= 1) return "$" + p.toFixed(2);
  return "$" + p.toFixed(4);
}

function formatSignedPct(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}
