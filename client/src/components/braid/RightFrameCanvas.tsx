// RightFrameCanvas — the TRADING zone of the Braid.
//
// Stacked panels: upper panel for the resistance arm (top half), lower panel
// for the support arm (bottom half), with the current-price line at their
// shared boundary.
//
// Each panel has its OWN focused Y scale — NOT the left frame's full price
// range — so pools and wires breathe even when both arms cluster within a
// few hundred dollars of current price. The spec line "pool rectangle
// continues at same Y" gets sacrificed here for legibility; the trade-off
// is intentional and documented because the alternative (full-range axis)
// crushes the trading view to a sliver when arms are close.
//
// Per-panel scale:
//   Upper: [currentPrice, upperPool.wickHigh + headroom]   (price grows up)
//   Lower: [lowerPool.wickLow - headroom, currentPrice]    (price grows up)
//   Headroom = max(15% of arm spread, 0.1% of price) — keeps pools off
//              the panel edge.
//
// One-arm case: that arm's panel fills the canvas. No-arm case: empty
// state. Pool rectangles are <div>s (render-primitives rule); wires are
// SVG so thickness can be data-driven.

import type {
  AnalysisPoolClient,
  ArmClient,
  ExtractedArmsClient,
} from "./types";
import type { Candle } from "@shared/zennyTypes";

const C = {
  resistance: "#e24b4a",
  support: "#1d9e75",
  candleUp: "#1d9e75",
  candleDown: "#e24b4a",
  dominantWire: "#7a4dba", // purple
  subordinateWire: "#888780", // muted
  upperPanelTint: "rgba(122, 77, 186, 0.04)",
  lowerPanelTint: "rgba(29, 158, 117, 0.04)",
  nowLine: "rgba(61, 61, 58, 0.5)",
  labelText: "#3d3d3a",
  labelDim: "#888780",
};

const GAP_PX = 8;
const PANEL_X_PAD = 8; // horizontal breathing room inside each panel
const PANEL_Y_PAD = 12; // vertical breathing room inside each panel
const HEADROOM_FRACTION = 0.15;
const MIN_HEADROOM_PCT = 0.001;

// Recent-candle context: last N primary-TF candles render in the RIGHT
// portion of each panel, using that panel's focused Y scale. Wires occupy
// the LEFT — the braid's natural origin is the now-line at the left edge
// of the right-frame canvas, so the projection reads left → right
// (now → arm endpoint), with recent-context candles further right showing
// how price has been behaving inside that arm's price band.
const CONTEXT_CANDLE_COUNT = 25;
const WIRE_AREA_FRACTION = 0.42; // leftmost share given to the wire
const INNER_GAP_PX = 6; // gap between wire area and candle area

interface Props {
  arms: ExtractedArmsClient;
  candles: Candle[];
  chartHeight: number;
  width: number;
  // Override for the recent-context candle count. Defaults to
  // CONTEXT_CANDLE_COUNT; the panel will use whichever is smaller given
  // available data.
  contextCandleCount?: number;
  // Optional setter — when provided, an inline slider renders in the
  // top-right corner so the user can tune the context window without
  // leaving the canvas.
  onChangeContextCandleCount?: (n: number) => void;
}

const CONTEXT_MIN = 5;
const CONTEXT_MAX = 100;

export function RightFrameCanvas({
  arms,
  candles,
  chartHeight,
  width,
  contextCandleCount = CONTEXT_CANDLE_COUNT,
  onChangeContextCandleCount,
}: Props) {
  if (candles.length === 0 || width <= 0) {
    return <ShellEmpty width={width} height={chartHeight} />;
  }

  const clampedCount = Math.max(
    CONTEXT_MIN,
    Math.min(CONTEXT_MAX, contextCandleCount),
  );
  const currentPrice = candles[candles.length - 1].close;
  const recentCandles = candles.slice(-clampedCount);

  if (!arms.upper && !arms.lower) {
    return (
      <Shell width={width} height={chartHeight}>
        <div
          className="absolute inset-0 flex items-center justify-center text-center px-3"
          style={{ color: C.labelDim, fontSize: 11, lineHeight: 1.5 }}
        >
          No arm qualifies.
          <br />
          Both pull scores below 15.0.
        </div>
      </Shell>
    );
  }

  // Layout: split the canvas height between whichever arms exist.
  const halfHeight = (chartHeight - GAP_PX) / 2;
  const upperHeight =
    arms.upper && arms.lower
      ? halfHeight
      : arms.upper
        ? chartHeight
        : 0;
  const lowerHeight =
    arms.upper && arms.lower
      ? halfHeight
      : arms.lower
        ? chartHeight
        : 0;
  const lowerTop =
    arms.upper && arms.lower ? upperHeight + GAP_PX : 0;

  return (
    <Shell width={width} height={chartHeight}>
      {arms.upper && (
        <Panel
          arm={arms.upper}
          currentPrice={currentPrice}
          recentCandles={recentCandles}
          width={width}
          panelHeight={upperHeight}
          panelTop={0}
        />
      )}
      {arms.lower && (
        <Panel
          arm={arms.lower}
          currentPrice={currentPrice}
          recentCandles={recentCandles}
          width={width}
          panelHeight={lowerHeight}
          panelTop={lowerTop}
        />
      )}

      {/* Current-price marker at the boundary between panels (or at top of
          lower-only / bottom of upper-only). */}
      {arms.upper && arms.lower && (
        <NowMarker
          y={upperHeight + GAP_PX / 2}
          width={width}
          price={currentPrice}
        />
      )}
      {arms.upper && !arms.lower && (
        <NowMarker
          y={chartHeight - 1}
          width={width}
          price={currentPrice}
          align="bottom"
        />
      )}
      {arms.lower && !arms.upper && (
        <NowMarker y={1} width={width} price={currentPrice} align="top" />
      )}

      {onChangeContextCandleCount && (
        <CandleCountControl
          count={clampedCount}
          onChange={onChangeContextCandleCount}
        />
      )}
    </Shell>
  );
}

function CandleCountControl({
  count,
  onChange,
}: {
  count: number;
  onChange: (n: number) => void;
}) {
  return (
    <div
      className="absolute flex items-center gap-1.5"
      style={{
        top: 4,
        right: 6,
        background: "rgba(255,255,255,0.9)",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 3,
        padding: "1px 6px",
        fontSize: 10,
        color: C.labelDim,
        zIndex: 10,
      }}
      title="Number of recent candles shown in each panel"
    >
      <span>candles</span>
      <input
        type="range"
        min={CONTEXT_MIN}
        max={CONTEXT_MAX}
        value={count}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: 70 }}
      />
      <span
        className="tabular-nums"
        style={{ width: 22, textAlign: "right", color: C.labelText }}
      >
        {count}
      </span>
    </div>
  );
}

function Shell({
  width,
  height,
  children,
}: {
  width: number;
  height: number;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="relative flex-shrink-0"
      style={{
        width,
        height,
        borderLeft: "1px solid rgba(0,0,0,0.1)",
        background: "#fbfaf8",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

function ShellEmpty({ width, height }: { width: number; height: number }) {
  return (
    <div
      style={{
        width,
        height,
        borderLeft: "1px solid rgba(0,0,0,0.1)",
        background: "#f8f7f4",
      }}
    />
  );
}

function Panel({
  arm,
  currentPrice,
  recentCandles,
  width,
  panelHeight,
  panelTop,
}: {
  arm: ArmClient;
  currentPrice: number;
  recentCandles: Candle[];
  width: number;
  panelHeight: number;
  panelTop: number;
}) {
  if (panelHeight <= 0) return null;

  const isUpper = arm.side === "upper";
  const pool = arm.pool;

  // Focused price range for this panel. The current-price edge is anchored
  // (where the wire starts); the pool edge gets headroom so the rectangle
  // doesn't kiss the panel border.
  const farPrice = isUpper ? pool.wickHigh : pool.wickLow;
  const spread = Math.abs(farPrice - currentPrice);
  const headroom = Math.max(
    spread * HEADROOM_FRACTION,
    currentPrice * MIN_HEADROOM_PCT,
  );
  const panelMin = isUpper ? currentPrice : farPrice - headroom;
  const panelMax = isUpper ? farPrice + headroom : currentPrice;

  // Y mapping inside this panel (0..panelHeight). PANEL_Y_PAD on each end.
  const plotH = Math.max(1, panelHeight - PANEL_Y_PAD * 2);
  const priceRange = Math.max(1e-9, panelMax - panelMin);
  const toLocalY = (price: number) =>
    PANEL_Y_PAD + plotH * (1 - (price - panelMin) / priceRange);

  // Convert local Y → absolute Y in the canvas.
  const absY = (price: number) => panelTop + toLocalY(price);

  // Geometry for the pool rectangle (clipped to the panel's price band).
  const clampedTop = Math.min(pool.wickHigh, panelMax);
  const clampedBottom = Math.max(pool.wickLow, panelMin);
  const poolTopY = absY(clampedTop);
  const poolBotY = absY(clampedBottom);
  const poolHeight = Math.max(2, poolBotY - poolTopY);

  const poolColor =
    pool.type === "RESISTANCE" ? C.resistance : C.support;
  const poolOpacity = arm.role === "dominant" ? 0.22 : 0.12;

  // Layout: wire on the LEFT (the braid origin = now-line at the left
  // edge), candles on the RIGHT showing recent price action in this
  // arm's focused Y band. Reads left → right as now → endpoint.
  const innerWidth = Math.max(40, width - PANEL_X_PAD * 2);
  const wireAreaWidth = Math.max(
    40,
    Math.floor(innerWidth * WIRE_AREA_FRACTION),
  );
  const projectionLeft = PANEL_X_PAD;
  const projectionRight = projectionLeft + wireAreaWidth;
  const candleAreaLeft = projectionRight + INNER_GAP_PX;
  const candleAreaRight = width - PANEL_X_PAD;

  // Wire endpoints. Starts at the now-line × current-price Y at the LEFT
  // edge, ends at the right of the wire area × pool centre Y.
  const wireStartY = absY(currentPrice);
  const wireEndY = absY(pool.centreLine);

  // Wire thickness from spec §3.1: 1 + (pull/100) × 5 → 1..6 px.
  const thickness = 1 + (arm.pullDecayed / 100) * 5;
  const wireColor =
    arm.role === "dominant" ? C.dominantWire : C.subordinateWire;
  const wireOpacity = arm.role === "dominant" ? 0.95 : 0.65;

  const tint = isUpper ? C.upperPanelTint : C.lowerPanelTint;

  // Label sits beside the pool, anchored to the right edge of the canvas.
  // Above the pool centre for the upper arm, below it for the lower arm,
  // so neither label collides with the wire.
  const isDominant = arm.role === "dominant";
  const labelAnchorY = absY(pool.centreLine);
  const labelTop = isUpper ? labelAnchorY - 44 : labelAnchorY + 6;

  return (
    <>
      {/* Panel tint */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: panelTop,
          height: panelHeight,
          left: 0,
          right: 0,
          background: tint,
        }}
      />
      {/* Pool rectangle (background) — spans full panel width so candles
          show against it. */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: poolTopY,
          height: poolHeight,
          left: PANEL_X_PAD,
          right: PANEL_X_PAD,
          background: poolColor,
          opacity: poolOpacity,
          borderTop: `1px solid ${poolColor}`,
          borderBottom: `1px solid ${poolColor}`,
        }}
        title={poolTitle(pool, arm.pullDecayed, arm.role)}
      />
      {/* SVG layer: candles in the left area, wire in the right. */}
      <svg
        width={width}
        height={panelTop + panelHeight}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          pointerEvents: "none",
        }}
      >
        <Candles
          candles={recentCandles}
          areaLeft={candleAreaLeft}
          areaRight={candleAreaRight}
          panelTop={panelTop}
          panelHeight={panelHeight}
          panelMin={panelMin}
          panelMax={panelMax}
          absY={absY}
        />
        <line
          x1={projectionLeft}
          y1={wireStartY}
          x2={projectionRight}
          y2={wireEndY}
          stroke={wireColor}
          strokeWidth={thickness}
          strokeLinecap="round"
          opacity={wireOpacity}
        />
      </svg>
      {/* Now-line: vertical dashed at the LEFT edge of the panel — the
          braid origin. The wire begins here. */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: panelTop,
          height: panelHeight,
          left: projectionLeft,
          width: 0,
          borderLeft: `1px dashed ${C.nowLine}`,
        }}
      />
      {/* Tiny price tag at the wire origin so the user can see what the
          braid is anchored to. Only on the dominant arm; the subordinate
          would just duplicate the same price. */}
      {isDominant && (
        <div
          className="absolute pointer-events-none tabular-nums"
          style={{
            left: projectionLeft + 3,
            top: wireStartY + (isUpper ? -13 : 2),
            fontSize: 9,
            color: C.labelDim,
            background: "rgba(255,255,255,0.85)",
            padding: "0 2px",
            borderRadius: 2,
          }}
        >
          ${formatPrice(currentPrice)}
        </div>
      )}
      {/* Label */}
      <div
        className="absolute pointer-events-none"
        style={{
          right: PANEL_X_PAD + 2,
          top: labelTop,
          textAlign: "right",
        }}
      >
        <div
          className="tabular-nums"
          style={{
            color: C.labelText,
            fontSize: 12,
            fontWeight: isDominant ? 700 : 500,
            lineHeight: 1.1,
          }}
        >
          ${formatPrice(pool.centreLine)}
        </div>
        <div
          className="tabular-nums"
          style={{
            color: poolColor,
            fontSize: 10,
            fontWeight: isDominant ? 600 : 400,
            lineHeight: 1.2,
            opacity: isDominant ? 1 : 0.85,
          }}
        >
          pull {arm.pullDecayed.toFixed(0)} ·{" "}
          {arm.role === "dominant"
            ? "DOM"
            : arm.role === "equal"
              ? "EQ"
              : "sub"}
        </div>
        <div
          style={{
            color: C.labelDim,
            fontSize: 9,
            letterSpacing: "0.04em",
            marginTop: 1,
          }}
        >
          {pool.kind.replace("_", " ")} · {pool.sourceTimeframe}
        </div>
      </div>
    </>
  );
}

// Candles — recent N bars rendered in the left portion of a panel using
// that panel's focused Y scale. Wicks (vertical line) + body (rectangle).
// Anything outside the panel's price band gets clipped at the SVG level
// so the candle shows partially rather than disappearing.
function Candles({
  candles,
  areaLeft,
  areaRight,
  panelTop,
  panelHeight,
  panelMin,
  panelMax,
  absY,
}: {
  candles: Candle[];
  areaLeft: number;
  areaRight: number;
  panelTop: number;
  panelHeight: number;
  panelMin: number;
  panelMax: number;
  absY: (price: number) => number;
}) {
  if (candles.length === 0) return null;

  const totalWidth = areaRight - areaLeft;
  const slotWidth = totalWidth / candles.length;
  const bodyWidth = Math.max(1, Math.floor(slotWidth * 0.7));
  const wickWidth = 1;
  const clipId = `panel-clip-${panelTop}`;

  return (
    <g clipPath={`url(#${clipId})`}>
      <defs>
        <clipPath id={clipId}>
          <rect
            x={areaLeft}
            y={panelTop}
            width={areaRight - areaLeft}
            height={panelHeight}
          />
        </clipPath>
      </defs>
      {candles.map((candle, i) => {
        // Skip candles whose entire range is outside the panel band.
        if (candle.high < panelMin || candle.low > panelMax) return null;

        const slotX = areaLeft + i * slotWidth;
        const bodyX = slotX + (slotWidth - bodyWidth) / 2;
        const wickX = slotX + slotWidth / 2 - wickWidth / 2;

        const yHigh = absY(candle.high);
        const yLow = absY(candle.low);
        const yOpen = absY(candle.open);
        const yClose = absY(candle.close);

        const bullish = candle.close >= candle.open;
        const color = bullish ? C.candleUp : C.candleDown;
        const bodyTop = Math.min(yOpen, yClose);
        const bodyHeight = Math.max(1, Math.abs(yClose - yOpen));

        return (
          <g key={`${candle.openTime}-${i}`}>
            <rect
              x={wickX}
              y={Math.min(yHigh, yLow)}
              width={wickWidth}
              height={Math.max(1, Math.abs(yLow - yHigh))}
              fill={color}
              opacity={0.7}
            />
            <rect
              x={bodyX}
              y={bodyTop}
              width={bodyWidth}
              height={bodyHeight}
              fill={color}
              opacity={0.85}
            />
          </g>
        );
      })}
    </g>
  );
}

function NowMarker({
  y,
  width,
  price,
  align = "centre",
}: {
  y: number;
  width: number;
  price: number;
  align?: "centre" | "top" | "bottom";
}) {
  return (
    <>
      <div
        className="absolute pointer-events-none"
        style={{
          top: y,
          left: 0,
          right: 0,
          height: 0,
          borderTop: `1px dashed ${C.nowLine}`,
        }}
      />
      <div
        className="absolute pointer-events-none tabular-nums"
        style={{
          right: 4,
          top:
            align === "top" ? y + 2 : align === "bottom" ? y - 14 : y - 7,
          fontSize: 10,
          color: C.labelDim,
          background: "#fbfaf8",
          padding: "0 3px",
          // Suppresses unused warning while reserving room for future
          // canvas-width-aware adjustments.
        }}
      >
        ${formatPrice(price)}
      </div>
      <span style={{ display: "none" }}>{width}</span>
    </>
  );
}

function formatPrice(p: number): string {
  if (p >= 1000) return p.toFixed(0);
  if (p >= 10) return p.toFixed(2);
  return p.toFixed(4);
}

function poolTitle(
  pool: AnalysisPoolClient,
  pull: number,
  role: string,
): string {
  return `${pool.type} ${pool.kind} @ $${formatPrice(pool.centreLine)} · pull=${pull.toFixed(1)} · ${role}`;
}
