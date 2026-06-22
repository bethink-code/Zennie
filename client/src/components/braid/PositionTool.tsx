// PositionTool — the TradingView-style position widget, wired to the chart's
// price scale. Three draggable handles (entry / stop / target), a green reward
// zone and red risk zone, live R:R + %-move labels, and Place / Cancel.
//
// This is the SURFACE of the wick tool. It does not decide anything and it does
// not score the wick — the human sets the geometry, this renders + edits it and
// hands the final values to the caller (which posts to /api/zenny/wick-trade,
// where the risk engine sizes it and the managed execution takes over).
//
// Rendering is an absolutely-positioned overlay: the container is
// pointer-events:none so chart clicks pass through; only the handles and
// buttons opt back into pointer events.

import { useEffect, useRef, useState, type CSSProperties } from "react";

export type TradeSideClient = "long" | "short";

export interface PositionDraft {
  side: TradeSideClient;
  entry: number;
  stop: number;
  target: number;
}

// The slice of the chart's coordinate mapping the tool needs. Supplied by the
// host chart (LeftFrameCanvas) so the box always lines up with the candles.
export interface ChartScale {
  toY: (price: number) => number; // price -> pixel Y
  fromY: (y: number) => number; // pixel Y -> price
  leftX: number; // left edge of the plot area
  rightX: number; // right edge of the plot area
  width: number; // full overlay width
  height: number; // full overlay height
}

interface Props {
  scale: ChartScale;
  value: PositionDraft;
  onChange: (next: PositionDraft) => void;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}

type Handle = "entry" | "stop" | "target";

const COLOR = { reward: "#1d9e75", risk: "#e24b4a", entry: "#3d3d3a" };

export function PositionTool({
  scale,
  value,
  onChange,
  onConfirm,
  onCancel,
  busy,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Handle | null>(null);

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      const price = scale.fromY(e.clientY - rect.top);
      if (!(price > 0)) return;
      onChange(clampDraft({ ...value, [drag]: price }, drag));
    };
    const up = () => setDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag, scale, value, onChange]);

  const yEntry = scale.toY(value.entry);
  const yStop = scale.toY(value.stop);
  const yTarget = scale.toY(value.target);
  const x = scale.leftX;
  const w = scale.rightX - scale.leftX;

  const risk = Math.abs(value.entry - value.stop);
  const reward = Math.abs(value.target - value.entry);
  const rr = risk > 0 ? reward / risk : 0;
  const pct = (delta: number) =>
    value.entry > 0 ? ((delta / value.entry) * 100).toFixed(2) : "0.00";

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: scale.width,
        height: scale.height,
        pointerEvents: "none",
      }}
      data-codesign-element="position-tool"
      data-side={value.side}
    >
      <svg
        width={scale.width}
        height={scale.height}
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        {/* reward zone: entry <-> target */}
        <rect
          x={x}
          y={Math.min(yEntry, yTarget)}
          width={w}
          height={Math.abs(yTarget - yEntry)}
          fill="rgba(29,158,117,0.12)"
        />
        {/* risk zone: entry <-> stop */}
        <rect
          x={x}
          y={Math.min(yEntry, yStop)}
          width={w}
          height={Math.abs(yStop - yEntry)}
          fill="rgba(226,75,74,0.12)"
        />
        <Line y={yTarget} x={x} w={w} color={COLOR.reward} />
        <Line y={yEntry} x={x} w={w} color={COLOR.entry} dashed />
        <Line y={yStop} x={x} w={w} color={COLOR.risk} />
      </svg>

      <DragHandle y={yTarget} x={x + w / 2} color={COLOR.reward} onDown={() => setDrag("target")} />
      <DragHandle y={yEntry} x={x + w / 2} color={COLOR.entry} onDown={() => setDrag("entry")} />
      <DragHandle y={yStop} x={x + w / 2} color={COLOR.risk} onDown={() => setDrag("stop")} />

      <Label y={yTarget} x={x + 8} color={COLOR.reward} text={`Target ${fmt(value.target)}  +${pct(reward)}%`} />
      <Label
        y={yEntry}
        x={x + 8}
        color={COLOR.entry}
        text={`${value.side.toUpperCase()} ${fmt(value.entry)}   R:R ${rr.toFixed(2)}`}
      />
      <Label y={yStop} x={x + 8} color={COLOR.risk} text={`Stop ${fmt(value.stop)}  -${pct(risk)}%`} />

      <div
        style={{
          position: "absolute",
          top: yEntry + 8,
          left: Math.max(x + 8, x + w - 220),
          display: "flex",
          gap: 6,
          pointerEvents: "auto",
        }}
      >
        <button
          onClick={() => onChange(flipSide(value))}
          disabled={busy}
          style={btn(value.side === "long" ? COLOR.reward : COLOR.risk, false)}
          title="Flip long / short"
        >
          {value.side === "long" ? "Long ⇄" : "Short ⇄"}
        </button>
        <button onClick={onCancel} disabled={busy} style={btn("#888780", false)}>
          Cancel
        </button>
        <button onClick={onConfirm} disabled={busy} style={btn(COLOR.reward, true)}>
          {busy ? "Placing…" : "Place"}
        </button>
      </div>
    </div>
  );
}

// --- sub-components ---------------------------------------------------------

function Line({
  y,
  x,
  w,
  color,
  dashed,
}: {
  y: number;
  x: number;
  w: number;
  color: string;
  dashed?: boolean;
}) {
  return (
    <line
      x1={x}
      y1={y}
      x2={x + w}
      y2={y}
      stroke={color}
      strokeWidth={1.25}
      strokeDasharray={dashed ? "5 4" : undefined}
    />
  );
}

function DragHandle({
  y,
  x,
  color,
  onDown,
}: {
  y: number;
  x: number;
  color: string;
  onDown: () => void;
}) {
  return (
    <div
      onPointerDown={(e) => {
        e.preventDefault();
        onDown();
      }}
      style={{
        position: "absolute",
        top: y - 6,
        left: x - 6,
        width: 12,
        height: 12,
        borderRadius: 3,
        background: "white",
        border: `2px solid ${color}`,
        cursor: "ns-resize",
        pointerEvents: "auto",
        boxSizing: "border-box",
      }}
    />
  );
}

function Label({
  y,
  x,
  color,
  text,
}: {
  y: number;
  x: number;
  color: string;
  text: string;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: y - 9,
        left: x,
        background: color,
        color: "white",
        fontSize: 11,
        fontFamily: "system-ui, sans-serif",
        fontWeight: 600,
        padding: "1px 6px",
        borderRadius: 3,
        whiteSpace: "nowrap",
        pointerEvents: "none",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {text}
    </div>
  );
}

// --- helpers ----------------------------------------------------------------

// Keep the box a valid trade as a handle is dragged: stop on the loss side,
// target on the profit side of entry. The server validates again on Place.
function clampDraft(d: PositionDraft, h: Handle): PositionDraft {
  const eps = Math.max(d.entry * 0.0001, 1e-6);
  if (d.side === "long") {
    if (h === "stop") d.stop = Math.min(d.stop, d.entry - eps);
    if (h === "target") d.target = Math.max(d.target, d.entry + eps);
    if (h === "entry")
      d.entry = Math.max(d.stop + eps, Math.min(d.target - eps, d.entry));
  } else {
    if (h === "stop") d.stop = Math.max(d.stop, d.entry + eps);
    if (h === "target") d.target = Math.min(d.target, d.entry - eps);
    if (h === "entry")
      d.entry = Math.max(d.target + eps, Math.min(d.stop - eps, d.entry));
  }
  return d;
}

// Flip long <-> short, mirroring stop and target across entry so the risk and
// reward DISTANCES are preserved — only the direction changes, not the shape.
function flipSide(d: PositionDraft): PositionDraft {
  const risk = Math.abs(d.entry - d.stop);
  const reward = Math.abs(d.target - d.entry);
  return d.side === "long"
    ? {
        side: "short",
        entry: d.entry,
        stop: d.entry + risk,
        target: d.entry - reward,
      }
    : {
        side: "long",
        entry: d.entry,
        stop: d.entry - risk,
        target: d.entry + reward,
      };
}

function fmt(p: number): string {
  if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

function btn(color: string, filled: boolean): CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 600,
    padding: "3px 10px",
    borderRadius: 4,
    border: `1px solid ${color}`,
    background: filled ? color : "white",
    color: filled ? "white" : color,
    cursor: "pointer",
    fontFamily: "system-ui, sans-serif",
  };
}
