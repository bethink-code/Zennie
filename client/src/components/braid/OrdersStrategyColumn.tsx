// ORDERS column content — the trading strategy for the current regime
// and the concrete TradePlan it produced.
//
// Replaces the previous Hyblock-liq-levels content. Liq-level data still
// renders as a chart overlay (LiqOverlay) when ORDERS is expanded; this
// component is about "what would I trade on this regime?" not "what's
// in the order book / liquidation map."
//
// COLLAPSED — small vertical pill showing direction + R:R or "no trade."
// EXPANDED  — full strategy block:
//   • playbook + tagline + strength/confidence
//   • TradePlan: side, entry, stop, target, R:R, size, with $ and %
//   • Why-this-geometry rationale (from proposer)
//   • Invalidation: the stop level + plain-language meaning
//
// Renders directly off AnalysisStateClient.tradePlan +
// AnalysisStateClient.regimeAssessment.primary. Both come from the
// orchestrator — no fetching here.

import type {
  PlaybookClient,
  RegimeAssessmentResultClient,
  TradePlanClient,
} from "./types";

const C = {
  text: "#888780",
  textStrong: "#3d3d3a",
  textDim: "#aaaaa3",
  rule: "rgba(0,0,0,0.06)",
  bgSubtle: "rgba(0,0,0,0.025)",
  long: "#1d9e75",
  short: "#b14746",
  amber: "#c89a4a",
};

const PLAYBOOK_LABEL: Record<PlaybookClient, string> = {
  accumulation: "ACCUMULATION",
  ranging: "RANGING",
  trending: "TRENDING",
  breakout: "BREAKOUT",
};

const PLAYBOOK_TAGLINE: Record<PlaybookClient, string> = {
  accumulation: "Buy-and-hold / DCA in a defined zone",
  ranging: "Mean-revert at pool extremes",
  trending: "Continuation on pullbacks",
  breakout: "Initial break + retest, reduced size",
};

const PLAYBOOK_COLOR: Record<PlaybookClient, string> = {
  accumulation: "#c89a4a",
  ranging: "#3a8d65",
  trending: "#1d9e75",
  breakout: "#2a6da3",
};

interface Props {
  tradePlan: TradePlanClient | null;
  assessment: RegimeAssessmentResultClient | null;
  chartHeight: number;
}

// ---------------------------------------------------------------------------
// Collapsed
// ---------------------------------------------------------------------------

export function OrdersStrategyColumnCollapsed({
  tradePlan,
  chartHeight,
}: Props) {
  if (!tradePlan) {
    return (
      <div
        className="relative w-full flex items-center justify-center"
        style={{ height: chartHeight, color: C.textDim, fontSize: 10 }}
      >
        <span style={{ writingMode: "vertical-rl", letterSpacing: "0.05em" }}>
          no trade
        </span>
      </div>
    );
  }
  const sideColor = tradePlan.side === "long" ? C.long : C.short;
  const arrow = tradePlan.side === "long" ? "▲" : "▼";
  const playbookColor = PLAYBOOK_COLOR[tradePlan.playbook];
  return (
    <div
      className="relative w-full flex flex-col items-center justify-center gap-1"
      style={{ height: chartHeight }}
      title={`${PLAYBOOK_LABEL[tradePlan.playbook]} ${tradePlan.side.toUpperCase()} · entry ${formatPrice(tradePlan.entry)} · stop ${formatPrice(tradePlan.stop)} · target ${formatPrice(tradePlan.target)} · R:R ${tradePlan.riskRewardRatio.toFixed(1)}× · size ${tradePlan.sizeMultiplier.toFixed(1)}×`}
    >
      <div
        style={{ color: sideColor, fontSize: 13, fontWeight: 600, lineHeight: 1 }}
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
        {tradePlan.riskRewardRatio.toFixed(1)}R
      </div>
      <div
        style={{
          color: playbookColor,
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.04em",
          lineHeight: 1,
        }}
      >
        {tradePlan.playbook.slice(0, 3).toUpperCase()}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expanded
// ---------------------------------------------------------------------------

export function OrdersStrategyColumnExpanded({
  tradePlan,
  assessment,
}: Props) {
  if (!tradePlan) {
    return <NoTradeBlock assessment={assessment} />;
  }
  return (
    <div className="flex flex-col gap-3" style={{ color: C.textStrong }}>
      <StrategyBlock
        playbook={tradePlan.playbook}
        assessment={assessment}
      />
      <TradePlanBlock plan={tradePlan} />
      <RationaleBlock rationale={tradePlan.rationale} />
      <InvalidationBlock plan={tradePlan} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StrategyBlock({
  playbook,
  assessment,
}: {
  playbook: PlaybookClient;
  assessment: RegimeAssessmentResultClient | null;
}) {
  const color = PLAYBOOK_COLOR[playbook];
  const playbookData = assessment?.primary.playbooks[playbook];
  return (
    <div>
      <div
        style={{
          color: C.text,
          fontSize: 10,
          letterSpacing: "0.06em",
          marginBottom: 4,
        }}
      >
        STRATEGY
      </div>
      <div
        style={{
          color,
          fontSize: 16,
          fontWeight: 600,
          letterSpacing: "0.03em",
        }}
      >
        {PLAYBOOK_LABEL[playbook]}
      </div>
      <div style={{ color: C.text, fontSize: 11, marginTop: 2 }}>
        {PLAYBOOK_TAGLINE[playbook]}
      </div>
      {playbookData && (
        <div
          className="flex gap-3"
          style={{ marginTop: 4, fontSize: 11, color: C.text }}
        >
          <span>
            strength{" "}
            <span style={{ color: C.textStrong }}>
              {playbookData.strength.toFixed(2)}
            </span>
          </span>
          <span>
            confidence{" "}
            <span style={{ color: C.textStrong }}>
              {Math.round(playbookData.confidence * 100)}%
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

function TradePlanBlock({ plan }: { plan: TradePlanClient }) {
  const sideColor = plan.side === "long" ? C.long : C.short;
  const stopDistance = ((plan.stop - plan.entry) / plan.entry) * 100;
  const targetDistance = ((plan.target - plan.entry) / plan.entry) * 100;
  return (
    <div
      style={{
        paddingTop: 8,
        borderTop: `1px solid ${C.rule}`,
      }}
    >
      <div className="flex justify-between items-baseline">
        <div
          style={{
            color: C.text,
            fontSize: 10,
            letterSpacing: "0.06em",
          }}
        >
          POSSIBLE TRADE
        </div>
        <div
          style={{
            color: sideColor,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.04em",
          }}
        >
          {plan.side === "long" ? "▲ LONG" : "▼ SHORT"}
        </div>
      </div>

      <div className="flex flex-col gap-1" style={{ marginTop: 8 }}>
        <Row label="Entry" value={formatPrice(plan.entry)} />
        <Row
          label="Stop"
          value={`${formatPrice(plan.stop)}  (${formatSignedPct(stopDistance)})`}
          tone="negative"
        />
        <Row
          label="Target"
          value={`${formatPrice(plan.target)}  (${formatSignedPct(targetDistance)})`}
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
          R:R{" "}
          <span
            className="tabular-nums"
            style={{ color: C.textStrong, fontWeight: 600 }}
          >
            {plan.riskRewardRatio.toFixed(1)}×
          </span>
        </span>
        <span style={{ color: C.text }}>
          Risk{" "}
          <span
            className="tabular-nums"
            style={{ color: C.textStrong }}
          >
            {plan.riskPct.toFixed(2)}%
          </span>
        </span>
        <span style={{ color: C.text }}>
          Size{" "}
          <span
            className="tabular-nums"
            style={{ color: C.textStrong }}
          >
            {plan.sizeMultiplier.toFixed(1)}×
          </span>
        </span>
      </div>
    </div>
  );
}

function RationaleBlock({ rationale }: { rationale: string[] }) {
  if (rationale.length === 0) return null;
  return (
    <div
      style={{
        paddingTop: 8,
        borderTop: `1px solid ${C.rule}`,
      }}
    >
      <div
        style={{
          color: C.text,
          fontSize: 10,
          letterSpacing: "0.06em",
          marginBottom: 4,
        }}
      >
        WHY THIS GEOMETRY
      </div>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          fontSize: 11,
          color: C.textStrong,
          lineHeight: 1.5,
        }}
      >
        {rationale.map((line, i) => (
          <li key={i} style={{ position: "relative", paddingLeft: 10 }}>
            <span
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                color: C.textDim,
              }}
            >
              ·
            </span>
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

function InvalidationBlock({ plan }: { plan: TradePlanClient }) {
  const direction =
    plan.side === "long" ? "below" : "above";
  return (
    <div
      style={{
        paddingTop: 8,
        borderTop: `1px solid ${C.rule}`,
      }}
    >
      <div
        style={{
          color: C.text,
          fontSize: 10,
          letterSpacing: "0.06em",
          marginBottom: 4,
        }}
      >
        INVALIDATED IF
      </div>
      <div
        style={{
          fontSize: 11,
          color: C.textStrong,
          lineHeight: 1.5,
        }}
      >
        Price closes {direction}{" "}
        <span
          className="tabular-nums"
          style={{ fontWeight: 600 }}
        >
          {formatPrice(plan.stop)}
        </span>
        {" — "}
        the {plan.side === "long" ? "support" : "resistance"} that anchors this
        plan has failed.
      </div>
    </div>
  );
}

function NoTradeBlock({
  assessment,
}: {
  assessment: RegimeAssessmentResultClient | null;
}) {
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
          STRATEGY
        </div>
        <div
          style={{
            color: C.short,
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: "0.03em",
          }}
        >
          NO TRADE
        </div>
        <div style={{ color: C.text, fontSize: 11, marginTop: 2 }}>
          No playbook is recommended on the primary timeframe.
        </div>
      </div>
      {assessment && (
        <div
          style={{
            paddingTop: 8,
            borderTop: `1px solid ${C.rule}`,
            fontSize: 11,
            color: C.text,
          }}
        >
          <div style={{ marginBottom: 4 }}>
            Each playbook is either below the threshold or vetoed by the
            regime layer. Open the REGIME column to see strengths +
            reasons per playbook.
          </div>
        </div>
      )}
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
    tone === "positive"
      ? C.long
      : tone === "negative"
        ? C.short
        : C.textStrong;
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
