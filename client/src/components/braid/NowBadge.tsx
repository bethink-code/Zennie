// Now badge — first column in the NOW zone.
// Collapsed: vertical pill showing wire angle and Gann bracket abbreviation.
// Expanded: full breakdown — angle, bracket, direction, % change, lookback,
// regime-guard verdict.
//
// Math source: spec §1 (wire angle), §1.3 (Gann brackets), §2.9 (RegimeGuard).
// Pass output: passInfo.wireAngle from server/modules/zenny/analysis/passes/
// wireAnglePass.ts.

import type { GannBracketClient, WireAnglePassInfoClient } from "./types";

const C = {
  text: "#888780",
  textStrong: "#3d3d3a",
  textDim: "#aaaaa3",
};

const BRACKET_COLOR: Record<GannBracketClient, string> = {
  NO_TRADE: "#b14746", // red — RegimeGuard blocks
  ACCUMULATION: "#c89a4a", // amber — still blocked, but approaching permit
  RANGING: "#3a8d65", // green — permitted
  TRENDING: "#1d9e75", // bright green — full strategy
  BREAKOUT: "#2a6da3", // blue — permitted but reduced size per spec
};

const BRACKET_LABEL: Record<GannBracketClient, string> = {
  NO_TRADE: "NO TRADE",
  ACCUMULATION: "ACCUM",
  RANGING: "RANGING",
  TRENDING: "TRENDING",
  BREAKOUT: "BREAKOUT",
};

const BRACKET_ABBR: Record<GannBracketClient, string> = {
  NO_TRADE: "—",
  ACCUMULATION: "ACC",
  RANGING: "RNG",
  TRENDING: "TRN",
  BREAKOUT: "BRK",
};

interface Props {
  wireAngle: WireAnglePassInfoClient | null;
  chartHeight: number;
}

export function NowBadgeCollapsed({ wireAngle, chartHeight }: Props) {
  if (!wireAngle) {
    return (
      <div
        className="relative w-full flex items-center justify-center"
        style={{ height: chartHeight, color: C.textDim, fontSize: 10 }}
      >
        <span style={{ writingMode: "vertical-rl", letterSpacing: "0.05em" }}>
          no wire
        </span>
      </div>
    );
  }

  const color = BRACKET_COLOR[wireAngle.gannBracket];
  const arrow =
    wireAngle.direction === "up"
      ? "▲"
      : wireAngle.direction === "down"
        ? "▼"
        : "·";

  return (
    <div
      className="relative w-full flex flex-col items-center justify-center gap-1"
      style={{ height: chartHeight }}
    >
      <div
        style={{
          color,
          fontSize: 13,
          fontWeight: 600,
          lineHeight: 1,
        }}
        title={`${formatAngle(wireAngle.angleDeg)} · ${BRACKET_LABEL[wireAngle.gannBracket]}`}
      >
        {arrow}
      </div>
      <div
        className="tabular-nums"
        style={{
          color: C.textStrong,
          fontSize: 11,
          fontWeight: 500,
          lineHeight: 1,
        }}
      >
        {formatAngle(wireAngle.angleDeg)}
      </div>
      <div
        style={{
          color,
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.04em",
          lineHeight: 1,
        }}
      >
        {BRACKET_ABBR[wireAngle.gannBracket]}
      </div>
    </div>
  );
}

export function NowBadgeExpanded({ wireAngle }: Props) {
  if (!wireAngle) {
    return (
      <div className="text-sm" style={{ color: C.textDim }}>
        Wire angle pass disabled or not enough candles for the lookback window.
      </div>
    );
  }

  const color = BRACKET_COLOR[wireAngle.gannBracket];

  return (
    <div className="flex flex-col gap-3" style={{ color: C.textStrong }}>
      <div>
        <div
          style={{
            color: C.text,
            fontSize: 10,
            letterSpacing: "0.06em",
            marginBottom: 4,
          }}
        >
          REGIME
        </div>
        <div
          style={{
            color,
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: "0.03em",
          }}
        >
          {BRACKET_LABEL[wireAngle.gannBracket]}
        </div>
        <div style={{ color: C.text, fontSize: 11, marginTop: 2 }}>
          {wireAngle.tradePermitted
            ? "Trade permitted — RegimeGuard pass"
            : "Trade blocked by RegimeGuard"}
        </div>
      </div>

      <Row label="Wire angle" value={formatAngle(wireAngle.angleDeg)} />
      <Row
        label="Direction"
        value={
          wireAngle.direction === "up"
            ? "Bullish ▲"
            : wireAngle.direction === "down"
              ? "Bearish ▼"
              : "Flat ·"
        }
      />
      <Row
        label="% change"
        value={`${wireAngle.pctChange >= 0 ? "+" : ""}${wireAngle.pctChange.toFixed(2)}%`}
      />
      <Row label="Lookback" value={`${wireAngle.lookback} candles`} />
      <Row
        label="Smoothed"
        value={`${wireAngle.smoothedCloseNAgo.toFixed(2)} → ${wireAngle.smoothedClose.toFixed(2)}`}
      />

      <div
        style={{
          fontSize: 11,
          color: C.text,
          lineHeight: 1.5,
          marginTop: 8,
          paddingTop: 8,
          borderTop: "1px solid rgba(0,0,0,0.06)",
        }}
      >
        Bracket from |angle| (spec §1.3): &lt;14° NO_TRADE, 14–26.25 ACCUM,
        26.25–45 RANGING, 45–63.75 TRENDING, &gt;63.75 BREAKOUT. Sign drives
        direction bias. RegimeGuard permits trades from 26.25° upward.
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline">
      <span style={{ color: C.text, fontSize: 11 }}>{label}</span>
      <span
        className="tabular-nums"
        style={{ color: C.textStrong, fontSize: 12, fontWeight: 500 }}
      >
        {value}
      </span>
    </div>
  );
}

function formatAngle(angleDeg: number): string {
  const sign = angleDeg > 0 ? "+" : "";
  return `${sign}${angleDeg.toFixed(1)}°`;
}
