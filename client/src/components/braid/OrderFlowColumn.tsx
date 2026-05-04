// Order Flow column — narrow glanceable strip in the NOW zone.
// Shows: depth gradient (bid/ask walls), liquidation levels from Hyblock,
// and summary stats (OI, funding, L/S ratio).
//
// Y-axis is aligned to the chart's price range via the same toY math.
// Width: 48px. Height: matches chartHeight.

import { useMemo } from "react";
import type {
  DepthSnapshotClient,
  OrderFlowSnapshotClient,
  LiqLevelClient,
} from "./types";

const W = 56;
const COL_BG = "#f8f7f4";

const COLORS = {
  bid: "rgba(29,158,117,", // green — bids / longs
  ask: "rgba(226,75,74,", // red — asks / shorts
  liqLong: "#1d9e75", // long liq = green (longs get liquidated here)
  liqShort: "#e24b4a", // short liq = red (shorts get liquidated here)
  divider: "rgba(0,0,0,0.08)",
  text: "#888780",
  textStrong: "#3d3d3a",
};

interface Props {
  depth: DepthSnapshotClient | null;
  orderFlow: OrderFlowSnapshotClient | null;
  chartHeight: number;
  priceMin: number;
  priceMax: number;
  padTop: number;
  padBottom: number;
  liqHeatmapLevels?: Array<{ price: number; side: "long" | "short"; tier: number; barTime: number }>;
  showLiqHeatmap?: boolean;
  candles?: Array<{ high: number; low: number; openTime: number }>;
}

export function OrderFlowColumn({
  depth,
  orderFlow,
  chartHeight,
  priceMin,
  priceMax,
  padTop,
  padBottom,
  liqHeatmapLevels,
  showLiqHeatmap,
  candles,
}: Props) {
  const plotH = chartHeight - padTop - padBottom;
  const priceRange = priceMax - priceMin;
  const toY = (price: number) =>
    padTop + plotH * (1 - (price - priceMin) / priceRange);

  return (
    <div
      className="relative flex-shrink-0 border-l border-black/10"
      style={{ width: W, height: chartHeight, background: COL_BG }}
    >
      {/* Depth gradient */}
      {depth && (
        <DepthGradient depth={depth} toY={toY} plotH={plotH} padTop={padTop} />
      )}

      {/* Liq density heatmap — shown when overlay is expanded, filtered to unconsumed only */}
      {showLiqHeatmap && liqHeatmapLevels && liqHeatmapLevels.length > 0 && candles && candles.length > 0 && (
        <LiqDensityHeatmap
          levels={filterConsumedLevels(liqHeatmapLevels, candles)}
          toY={toY}
          plotH={plotH}
          padTop={padTop}
          priceMin={priceMin}
          priceMax={priceMax}
        />
      )}

      {/* Stats moved to expanded panel */}
    </div>
  );
}

// Hyblock ISO strings were parsed in UTC+2
const TZ_OFFSET_MS = 2 * 3600 * 1000;

// Filter out consumed liq levels — same logic as LiqOverlay
function filterConsumedLevels(
  levels: Array<{ price: number; side: "long" | "short"; tier: number; barTime: number }>,
  candles: Array<{ high: number; low: number; openTime: number }>,
) {
  if (candles.length === 0) return levels;

  // Build suffix arrays for O(1) sweep checks
  const suffixMaxHigh = new Array(candles.length).fill(0);
  const suffixMinLow = new Array(candles.length).fill(Infinity);
  suffixMaxHigh[candles.length - 1] = candles[candles.length - 1].high;
  suffixMinLow[candles.length - 1] = candles[candles.length - 1].low;
  for (let i = candles.length - 2; i >= 0; i--) {
    suffixMaxHigh[i] = Math.max(candles[i].high, suffixMaxHigh[i + 1]);
    suffixMinLow[i] = Math.min(candles[i].low, suffixMinLow[i + 1]);
  }

  const currentPrice = candles[candles.length - 1].low +
    (candles[candles.length - 1].high - candles[candles.length - 1].low) / 2;

  return levels.filter((l) => {
    // Wrong side of current price = stale
    if (l.side === "long" && l.price > currentPrice) return false;
    if (l.side === "short" && l.price < currentPrice) return false;

    // Find closest candle to this level's bar time
    const correctedTime = l.barTime - TZ_OFFSET_MS;
    let closestIdx = 0;
    let closestDelta = Infinity;
    for (let i = 0; i < candles.length; i++) {
      const d = Math.abs(candles[i].openTime - correctedTime);
      if (d < closestDelta) { closestDelta = d; closestIdx = i; }
    }
    const checkFrom = Math.min(closestIdx + 1, candles.length - 1);

    // Consumed if price swept through after this bar
    if (l.side === "short" && suffixMaxHigh[checkFrom] >= l.price) return false;
    if (l.side === "long" && suffixMinLow[checkFrom] <= l.price) return false;

    return true;
  });
}

// --- Liq density heatmap sub-component ---

function LiqDensityHeatmap({
  levels,
  toY,
  plotH,
  padTop,
  priceMin,
  priceMax,
}: {
  levels: Array<{ price: number; side: "long" | "short"; tier: number }>;
  toY: (p: number) => number;
  plotH: number;
  padTop: number;
  priceMin: number;
  priceMax: number;
}) {
  // Bin levels into ~40 price bands and count density
  const BANDS = 40;
  const bandSize = (priceMax - priceMin) / BANDS;

  const bands = useMemo(() => {
    const b = Array.from({ length: BANDS }, (_, i) => ({
      priceLow: priceMin + i * bandSize,
      priceHigh: priceMin + (i + 1) * bandSize,
      longCount: 0,
      shortCount: 0,
    }));
    for (const l of levels) {
      if (l.price < priceMin || l.price > priceMax) continue;
      const idx = Math.min(BANDS - 1, Math.floor((l.price - priceMin) / bandSize));
      if (l.side === "long") b[idx].longCount++;
      else b[idx].shortCount++;
    }
    return b;
  }, [levels, priceMin, priceMax, bandSize]);

  const maxCount = Math.max(1, ...bands.map((b) => b.longCount + b.shortCount));

  return (
    <>
      {bands.map((b, i) => {
        const total = b.longCount + b.shortCount;
        if (total === 0) return null;
        const y1 = toY(b.priceHigh);
        const y2 = toY(b.priceLow);
        const h = Math.max(1, y2 - y1);
        if (y2 < padTop || y1 > padTop + plotH) return null;
        const intensity = total / maxCount;
        // Color: blend green/red based on long vs short dominance
        const longFrac = b.longCount / total;
        const color = longFrac > 0.5
          ? `rgba(29,158,117,${intensity * 0.6})`
          : `rgba(226,75,74,${intensity * 0.6})`;
        return (
          <div
            key={i}
            className="absolute"
            style={{
              left: 0,
              width: W,
              top: y1,
              height: h,
              background: color,
            }}
          />
        );
      })}
    </>
  );
}

// --- Depth gradient sub-component ---

function DepthGradient({
  depth,
  toY,
  plotH,
  padTop,
}: {
  depth: DepthSnapshotClient;
  toY: (p: number) => number;
  plotH: number;
  padTop: number;
}) {
  const max = depth.maxBucketSizeUsd;
  if (max <= 0) return null;

  return (
    <>
      {depth.buckets.map((b, i) => {
        const y1 = toY(b.priceHigh);
        const y2 = toY(b.priceLow);
        const h = Math.max(1, y2 - y1);
        if (y2 < padTop || y1 > padTop + plotH) return null;

        const bidW = Math.round((b.bidSizeUsd / max) * (W * 0.9));
        const askW = Math.round((b.askSizeUsd / max) * (W * 0.9));

        return (
          <div key={i} className="absolute left-0" style={{ top: y1, height: h, width: W }}>
            {/* Bid bar — left-aligned, green */}
            {bidW > 0 && (
              <div
                className="absolute left-0"
                style={{
                  top: 0,
                  height: h,
                  width: bidW,
                  background: COLORS.bid + "0.5)",
                }}
              />
            )}
            {/* Ask bar — right-aligned, red */}
            {askW > 0 && (
              <div
                className="absolute right-0"
                style={{
                  top: 0,
                  height: h,
                  width: askW,
                  background: COLORS.ask + "0.5)",
                }}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

// --- Liquidation level markers ---

function LiqMarkers({
  levels,
  toY,
  priceMin,
  priceMax,
  midPrice,
}: {
  levels: Array<{ price: number; side: "long" | "short"; tier: number }>;
  toY: (p: number) => number;
  priceMin: number;
  priceMax: number;
  midPrice: number;
}) {
  return (
    <>
      {levels
        .filter((l) => {
          if (l.price < priceMin || l.price > priceMax) return false;
          // Long liq only below price, short liq only above
          if (l.side === "long" && l.price > midPrice) return false;
          if (l.side === "short" && l.price < midPrice) return false;
          return true;
        })
        .map((l, i) => {
          const y = toY(l.price);
          const color = l.side === "long" ? COLORS.liqLong : COLORS.liqShort;
          // Higher tier (closer to price) = more opaque
          const opacity = 0.3 + (4 - l.tier) * 0.15;
          return (
            <div
              key={i}
              className="absolute"
              style={{
                top: y - 1,
                left: 2,
                right: 2,
                height: 2,
                background: color,
                opacity,
              }}
              title={`${l.side} liq T${l.tier}: $${l.price.toFixed(0)}`}
            />
          );
        })}
    </>
  );
}

// --- Summary stat helpers ---

function StatRow({
  label,
  value,
  delta,
  positive,
}: {
  label: string;
  value: string;
  delta?: number | null;
  positive?: boolean;
}) {
  return (
    <div className="flex justify-between items-center">
      <span style={{ color: COLORS.text }}>{label}</span>
      <span style={{ color: COLORS.textStrong }}>{value}</span>
      {delta != null && (
        <span style={{ color: delta >= 0 ? "#1d9e75" : "#e24b4a" }}>
          {delta >= 0 ? "+" : ""}
          {delta.toFixed(1)}%
        </span>
      )}
      {positive !== undefined && delta == null && (
        <span style={{ color: positive ? "#1d9e75" : "#e24b4a" }}>
          {positive ? "L" : "S"}
        </span>
      )}
    </div>
  );
}

function LSBar({ longPct, shortPct }: { longPct: number; shortPct: number }) {
  const lw = Math.round(longPct * 100);
  return (
    <div className="flex mt-0.5" style={{ height: 4 }}>
      <div style={{ width: `${lw}%`, background: COLORS.bid + "0.6)" }} />
      <div style={{ width: `${100 - lw}%`, background: COLORS.ask + "0.6)" }} />
    </div>
  );
}

function formatCompact(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return n.toFixed(0);
}
