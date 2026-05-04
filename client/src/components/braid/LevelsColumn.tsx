// Levels column — collapsed shows tick marks + TF tags at each level price.
// Expanded shows full level detail table.

import type { AnalysisLevelClient } from "./types";

const COLORS = {
  resistance: "#e24b4a",
  support: "#1d9e75",
  text: "#888780",
  textStrong: "#3d3d3a",
};

const TF_RANK: Record<string, number> = {
  "15m": 0, "1H": 1, "4H": 2, "12H": 3, D: 4, W: 5, M: 6,
};

interface Props {
  levels: AnalysisLevelClient[];
  primaryTimeframe: string;
  chartHeight: number;
  priceMin: number;
  priceMax: number;
  padTop: number;
  padBottom: number;
}

export function LevelsColumnCollapsed({
  levels,
  primaryTimeframe,
  chartHeight,
  priceMin,
  priceMax,
  padTop,
  padBottom,
}: Props) {
  const plotH = chartHeight - padTop - padBottom;
  const priceRange = priceMax - priceMin;
  const toY = (price: number) =>
    padTop + plotH * (1 - (price - priceMin) / priceRange);

  const visible = levels.filter(
    (l) => !l.broken && l.price >= priceMin && l.price <= priceMax,
  );
  const deduped = dedupeClose(visible, 0.003);

  return (
    <div className="relative w-full" style={{ height: chartHeight }}>
      {deduped.map((level) => {
        const y = toY(level.price);
        const color =
          level.side === "RESISTANCE" ? COLORS.resistance : COLORS.support;
        const tag = buildTfTag(
          level.sourceTimeframe,
          level.matchingTimeframes,
          primaryTimeframe,
        );

        return (
          <div
            key={level.id}
            className="absolute flex items-center"
            style={{ top: y - 7, left: 0, right: 0, height: 14 }}
            title={`${level.side} ${level.strength} $${level.price.toFixed(0)} [${tag}]`}
          >
            <div
              style={{
                width: 6,
                height: 2,
                background: color,
                opacity: strengthOpacity(level.strength),
                flexShrink: 0,
              }}
            />
            <span
              className="ml-0.5 truncate"
              style={{
                fontSize: 10,
                lineHeight: "12px",
                color,
                opacity: strengthOpacity(level.strength),
                fontWeight: level.confluenceCount >= 2 ? 600 : 400,
              }}
            >
              {tag}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function LevelsColumnExpanded({
  levels,
  primaryTimeframe,
}: {
  levels: AnalysisLevelClient[];
  primaryTimeframe: string;
}) {
  const visible = levels.filter((l) => !l.broken);
  const sorted = [...visible].sort((a, b) => b.price - a.price);

  // Detect which passes have any data in this set so we only render columns
  // for enabled passes. Absent passes = absent columns.
  const hasRecency = visible.some((l) => l.passes?.recency !== undefined);
  const hasTouchCount = visible.some((l) => l.passes?.touchCount !== undefined);
  const hasLastLeg = visible.some((l) => l.passes?.lastLeg !== undefined);
  const hasAggregate = visible.some((l) => l.passes?.aggregate !== undefined);

  return (
    <div style={{ fontSize: 11 }}>
      <div style={{ fontWeight: 600, color: COLORS.textStrong, marginBottom: 8 }}>
        {visible.length} Active Levels
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ color: COLORS.text, fontSize: 10, textAlign: "left" }}>
            <th style={{ padding: "2px 4px" }}>Price</th>
            <th style={{ padding: "2px 4px" }}>Side</th>
            <th style={{ padding: "2px 4px" }}>TFs</th>
            <th style={{ padding: "2px 4px" }}>Str</th>
            {hasAggregate && <th style={{ padding: "2px 4px" }} title="Aggregate score (composite of all enabled passes)">Σ</th>}
            {hasRecency && <th style={{ padding: "2px 4px" }} title="Recency pass">Rec</th>}
            {hasTouchCount && <th style={{ padding: "2px 4px" }} title="Touch count pass">Tch</th>}
            {hasLastLeg && <th style={{ padding: "2px 4px" }} title="Last leg structural recency">Leg</th>}
          </tr>
        </thead>
        <tbody>
          {sorted.map((l) => {
            const color = l.side === "RESISTANCE" ? COLORS.resistance : COLORS.support;
            const tag = buildTfTag(l.sourceTimeframe, l.matchingTimeframes, primaryTimeframe);
            const recency = l.passes?.recency;
            const touchCount = l.passes?.touchCount;
            const lastLeg = l.passes?.lastLeg;
            const aggregate = l.passes?.aggregate;
            const filteredOut = recency?.wouldFilter ?? false;
            return (
              <tr
                key={l.id}
                style={{
                  borderTop: "1px solid rgba(0,0,0,0.05)",
                  color: COLORS.textStrong,
                  opacity: filteredOut ? 0.35 : 1,
                  textDecoration: filteredOut ? "line-through" : undefined,
                }}
              >
                <td style={{ padding: "3px 4px", fontVariantNumeric: "tabular-nums" }}>
                  ${l.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </td>
                <td style={{ padding: "3px 4px", color }}>
                  {l.side === "RESISTANCE" ? "R" : "S"}
                </td>
                <td
                  style={{ padding: "3px 4px", fontWeight: l.confluenceCount >= 2 ? 600 : 400 }}
                  title={l.source === "cluster" ? "horizontal cluster" : "swing pivot"}
                >
                  {tag}
                  {l.source === "cluster" && (
                    <sup style={{ color: "#c97a2c", marginLeft: 2 }}>c</sup>
                  )}
                </td>
                <td style={{ padding: "3px 4px", color: COLORS.text, fontSize: 10 }}>
                  {l.strength.slice(0, 3)}
                </td>
                {hasAggregate && (
                  <td
                    style={{
                      padding: "3px 4px",
                      fontVariantNumeric: "tabular-nums",
                      fontSize: 10,
                      fontWeight: (aggregate?.score ?? 0) >= 0.5 ? 700 : 400,
                      color: (aggregate?.score ?? 0) >= 0.5 ? COLORS.textStrong : COLORS.text,
                    }}
                    title={`aggregate=${aggregate?.score.toFixed(3) ?? "—"} contributors=[${aggregate?.contributors.join(", ") ?? ""}]`}
                  >
                    {aggregate ? aggregate.score.toFixed(2) : "—"}
                  </td>
                )}
                {hasRecency && (
                  <td
                    style={{ padding: "3px 4px", fontVariantNumeric: "tabular-nums", fontSize: 10 }}
                    title={`recency=${recency?.value.toFixed(3) ?? "—"}, wouldFilter=${recency?.wouldFilter ?? "—"}`}
                  >
                    {recency ? recency.value.toFixed(2) : "—"}
                  </td>
                )}
                {hasTouchCount && (
                  <td
                    style={{ padding: "3px 4px", fontVariantNumeric: "tabular-nums", fontSize: 10 }}
                    title={`touch count = ${touchCount?.value ?? 0}`}
                  >
                    {touchCount?.value ?? 0}
                  </td>
                )}
                {hasLastLeg && (
                  <td
                    style={{
                      padding: "3px 4px",
                      fontVariantNumeric: "tabular-nums",
                      fontSize: 10,
                      fontWeight: (lastLeg?.value ?? 0) >= 0.7 ? 700 : 400,
                      color: (lastLeg?.value ?? 0) >= 0.7 ? COLORS.textStrong : COLORS.text,
                    }}
                    title={`last-leg proximity = ${lastLeg?.value.toFixed(3) ?? "—"} (${lastLeg?.nearestSwing ?? "—"})`}
                  >
                    {lastLeg ? lastLeg.value.toFixed(2) : "—"}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function buildTfTag(source: string, matching: string[], primary: string): string {
  const primaryRank = TF_RANK[primary] ?? 0;
  const all = new Set([source, ...matching]);
  const order = ["15m", "1H", "4H", "12H", "D", "W", "M"];
  return order.filter((tf) => all.has(tf) && (TF_RANK[tf] ?? -1) >= primaryRank).join("+");
}

function strengthOpacity(s: string): number {
  const map: Record<string, number> = { trivial: 0.3, weak: 0.5, medium: 0.7, strong: 0.9, very_strong: 1.0 };
  return map[s] ?? 0.5;
}

function dedupeClose(levels: AnalysisLevelClient[], tolerancePct: number): AnalysisLevelClient[] {
  const sorted = [...levels].sort((a, b) => b.price - a.price);
  const result: AnalysisLevelClient[] = [];
  for (const level of sorted) {
    const idx = result.findIndex(
      (r) => Math.abs(r.price - level.price) / level.price < tolerancePct,
    );
    if (idx < 0) result.push(level);
    else if (level.confluenceCount > result[idx].confluenceCount) result[idx] = level;
  }
  return result;
}
