// Trade overlay — renders probable trades (TradePlans the system sees but
// hasn't acted on) and actual paper-trading positions on top of the chart.
//
// Two layers:
//
// PROBABLE TRADES — dashed lines for every TradePlan in
//   tradePlanResult.plansPerTimeframe[primary]. Shows entry/stop/target.
//   These are "what the system would do if it were acting."
//
// ACTUAL TRADES — solid lines for every PaperPosition in paperPositions.
//   Open positions render with a pulse and current state colour.
//   Closed positions render desaturated with a P&L badge.
//
// Coordinates are derived from the same chart geometry as LeftFrameCanvas:
// price → Y via (price - priceMin) / priceRange; bar index → X via the
// candles array. Caller passes geometry as props.

import type { Candle } from "@shared/zennyTypes";
import type {
  PaperPositionClient,
  PositionStatusClient,
  TradePhaseClient,
  TradePlanClient,
} from "./types";

interface Props {
  candles: Candle[];
  plans: TradePlanClient[]; // probable trades for the primary TF
  positions: PaperPositionClient[]; // all paper positions for symbol+TF
  priceMin: number;
  priceMax: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
}

// Colour scheme
const COLORS = {
  entry: "rgba(80,120,200,",
  stop: "rgba(226,75,74,",
  target: "rgba(29,158,117,",
  reach: "rgba(155,89,182,",  // purple = REACH
  take: "rgba(80,120,200,",   // blue = TAKE
};

const PHASE_LABEL: Record<TradePhaseClient, string> = {
  reach: "REACH",
  take: "TAKE",
};

const STATUS_BADGE_COLOR: Record<PositionStatusClient, string> = {
  PLANNED: "rgba(140,140,140,0.85)",
  LIVE: "rgba(80,120,200,0.85)",
  FILLED: "rgba(200,154,74,0.9)",
  CLOSED: "rgba(60,60,60,0.9)",
  CANCELLED: "rgba(140,140,140,0.6)",
  EXPIRED: "rgba(140,140,140,0.6)",
  REJECTED: "rgba(226,75,74,0.6)",
};

export function TradeOverlay({
  candles,
  plans,
  positions,
  priceMin,
  priceMax,
  padLeft,
  padRight,
  padTop,
  padBottom,
}: Props) {
  const priceRange = priceMax - priceMin;
  if (priceRange <= 0 || candles.length === 0) return null;

  const N = candles.length;
  const yFrac = (price: number) =>
    Math.max(0, Math.min(1, 1 - (price - priceMin) / priceRange));
  const xFracForOpenTime = (openTime: number): number | null => {
    // Find candle closest to openTime
    let closestIdx = -1;
    let closestDelta = Infinity;
    for (let i = 0; i < N; i++) {
      const d = Math.abs(candles[i].openTime - openTime);
      if (d < closestDelta) {
        closestDelta = d;
        closestIdx = i;
      }
    }
    if (closestIdx < 0) return null;
    return (closestIdx + 0.5) / N;
  };

  return (
    <div
      className="absolute inset-0 z-10"
      style={{ pointerEvents: "none" }}
    >
      <div
        className="absolute"
        style={{
          left: padLeft,
          right: padRight,
          top: padTop,
          bottom: padBottom,
        }}
      >
        {/* PROBABLE TRADES — dashed lines for every TradePlan */}
        {plans.map((plan, i) => (
          <ProbableTrade key={`plan-${i}`} plan={plan} yFrac={yFrac} />
        ))}

        {/* ACTUAL TRADES — paper positions */}
        {positions.map((pos) => (
          <ActualTrade
            key={pos.id}
            pos={pos}
            yFrac={yFrac}
            xFracForOpenTime={xFracForOpenTime}
          />
        ))}
      </div>
    </div>
  );
}

// --- Probable trade ---------------------------------------------------------

function ProbableTrade({
  plan,
  yFrac,
}: {
  plan: TradePlanClient;
  yFrac: (p: number) => number;
}) {
  const phaseColor =
    plan.phase === "reach" ? COLORS.reach : COLORS.take;
  return (
    <>
      <DashedLine
        yFrac={yFrac(plan.entry)}
        color={`${COLORS.entry}0.65)`}
        label={`${PHASE_LABEL[plan.phase]} ${plan.side.toUpperCase()} entry ${formatPrice(plan.entry)}`}
        labelColor={`${phaseColor}1.0)`}
      />
      <DashedLine
        yFrac={yFrac(plan.stop)}
        color={`${COLORS.stop}0.55)`}
        label={`stop ${formatPrice(plan.stop)}`}
      />
      <DashedLine
        yFrac={yFrac(plan.target)}
        color={`${COLORS.target}0.6)`}
        label={`target ${formatPrice(plan.target)} · R:R ${plan.riskRewardRatio.toFixed(1)}`}
      />
      {plan.target2 != null && (
        <DashedLine
          yFrac={yFrac(plan.target2)}
          color={`${COLORS.target}0.35)`}
          label={`TP1 ${formatPrice(plan.target2)}`}
        />
      )}
    </>
  );
}

// --- Actual trade -----------------------------------------------------------

function ActualTrade({
  pos,
  yFrac,
  xFracForOpenTime,
}: {
  pos: PaperPositionClient;
  yFrac: (p: number) => number;
  xFracForOpenTime: (t: number) => number | null;
}) {
  const isClosed = pos.status === "CLOSED";
  const isOpen = pos.status === "LIVE" || pos.status === "FILLED";
  const isTerminal = !isOpen && pos.status !== "PLANNED";

  const opacity = isClosed ? 0.45 : isOpen ? 0.95 : 0.6;
  const sideLabel = pos.side.toUpperCase();
  const phaseLabel = PHASE_LABEL[pos.phase];
  const statusColor = STATUS_BADGE_COLOR[pos.status];

  const fillX =
    pos.filledAtBarTs != null ? xFracForOpenTime(pos.filledAtBarTs) : null;
  const closeX =
    pos.closedAtBarTs != null ? xFracForOpenTime(pos.closedAtBarTs) : null;

  return (
    <>
      <SolidLine
        yFrac={yFrac(pos.entryPrice)}
        color={`${COLORS.entry}${opacity})`}
        label={`${phaseLabel} ${sideLabel} · ${pos.status}${
          pos.realisedPnl != null
            ? ` · PnL ${formatPnl(pos.realisedPnl)}`
            : ""
        }`}
        labelColor={statusColor}
      />
      <SolidLine
        yFrac={yFrac(pos.stopPrice)}
        color={`${COLORS.stop}${opacity * 0.85})`}
        label={isTerminal ? "" : `stop ${formatPrice(pos.stopPrice)}`}
      />
      <SolidLine
        yFrac={yFrac(pos.targetPrice)}
        color={`${COLORS.target}${opacity * 0.85})`}
        label={isTerminal ? "" : `target ${formatPrice(pos.targetPrice)}`}
      />

      {/* Markers — entry candle and (if closed) close candle */}
      {fillX != null && (
        <Marker
          xFrac={fillX}
          yFrac={yFrac(pos.fillPrice ?? pos.entryPrice)}
          color={`${COLORS.entry}${opacity})`}
          symbol="●"
        />
      )}
      {closeX != null && (
        <Marker
          xFrac={closeX}
          yFrac={yFrac(pos.closePrice ?? pos.targetPrice)}
          color={
            pos.exitReason === "target"
              ? `${COLORS.target}${opacity})`
              : `${COLORS.stop}${opacity})`
          }
          symbol="✕"
        />
      )}
    </>
  );
}

// --- atomic SVG-ish helpers (DOM divs, mirroring LiqOverlay style) ----------

function DashedLine({
  yFrac,
  color,
  label,
  labelColor,
}: {
  yFrac: number;
  color: string;
  label?: string;
  labelColor?: string;
}) {
  return (
    <>
      <div
        className="absolute"
        style={{
          left: 0,
          right: 0,
          top: `${yFrac * 100}%`,
          height: 0,
          borderTop: `1px dashed ${color}`,
        }}
      />
      {label && (
        <div
          className="absolute text-[10px] leading-none px-1 rounded bg-white/80 whitespace-nowrap"
          style={{
            right: 4,
            top: `calc(${yFrac * 100}% - 8px)`,
            color: labelColor ?? color,
          }}
        >
          {label}
        </div>
      )}
    </>
  );
}

function SolidLine({
  yFrac,
  color,
  label,
  labelColor,
}: {
  yFrac: number;
  color: string;
  label?: string;
  labelColor?: string;
}) {
  return (
    <>
      <div
        className="absolute"
        style={{
          left: 0,
          right: 0,
          top: `${yFrac * 100}%`,
          height: 1,
          background: color,
        }}
      />
      {label && (
        <div
          className="absolute text-[10px] leading-none px-1 rounded bg-white whitespace-nowrap font-medium"
          style={{
            left: 4,
            top: `calc(${yFrac * 100}% - 8px)`,
            color: labelColor ?? color,
            border: `1px solid ${color}`,
          }}
        >
          {label}
        </div>
      )}
    </>
  );
}

function Marker({
  xFrac,
  yFrac,
  color,
  symbol,
}: {
  xFrac: number;
  yFrac: number;
  color: string;
  symbol: string;
}) {
  return (
    <div
      className="absolute text-[14px] leading-none font-bold"
      style={{
        left: `${xFrac * 100}%`,
        top: `${yFrac * 100}%`,
        transform: "translate(-50%, -50%)",
        color,
      }}
    >
      {symbol}
    </div>
  );
}

function formatPrice(p: number): string {
  if (p >= 10000) return p.toFixed(0);
  if (p >= 100) return p.toFixed(1);
  return p.toFixed(2);
}

function formatPnl(p: number): string {
  const sign = p >= 0 ? "+" : "";
  return `${sign}${p.toFixed(2)}`;
}
