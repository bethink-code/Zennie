// NowColumn — generic expandable column in the NOW zone.
// Collapsed: narrow strip with label + summary content.
// Expanded: slides left over the chart as an overlay with smooth animation.

import { type ReactNode } from "react";

const COLLAPSED_W = 56;
const EXPANDED_W = 360;

const C = {
  bg: "#f8f7f4",
  bgExpanded: "rgba(255,255,255,0.96)",
  border: "rgba(0,0,0,0.1)",
  text: "#888780",
  textStrong: "#3d3d3a",
};

interface Props {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  chartHeight: number;
  collapsedContent: ReactNode;
  expandedContent: ReactNode;
  markPriceY?: number; // Y pixel position of mark price line
}

export function NowColumn({
  label,
  expanded,
  onToggle,
  chartHeight,
  collapsedContent,
  expandedContent,
  markPriceY,
}: Props) {
  return (
    <div
      className="relative flex-shrink-0 border-l cursor-pointer select-none overflow-hidden"
      style={{
        width: expanded ? EXPANDED_W : COLLAPSED_W,
        height: chartHeight,
        borderColor: C.border,
        background: expanded ? C.bgExpanded : C.bg,
        transition: "width 300ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
      onClick={onToggle}
    >
      {/* Label at top */}
      <div
        className="absolute top-0 left-0 right-0 z-10 text-center py-1 border-b"
        style={{
          fontSize: 10,
          color: C.text,
          letterSpacing: "0.05em",
          borderColor: C.border,
          background: expanded ? C.bgExpanded : C.bg,
        }}
      >
        {label}
      </div>

      {/* Mark price line — collapsed only */}
      {!expanded && markPriceY != null && markPriceY > 0 && (
        <div
          className="absolute left-0 right-0 z-10 pointer-events-none"
          style={{
            top: markPriceY,
            height: 1,
            background: "rgba(61,61,58,0.3)",
          }}
        />
      )}

      {/* Collapsed content — always rendered, fades out when expanded */}
      <div
        style={{
          opacity: expanded ? 0 : 1,
          transition: "opacity 200ms ease",
          pointerEvents: expanded ? "none" : "auto",
          position: "absolute",
          top: 0,
          left: 0,
          width: COLLAPSED_W,
          height: chartHeight,
        }}
      >
        {collapsedContent}
      </div>

      {/* Expanded content — slides in from right */}
      <div
        style={{
          opacity: expanded ? 1 : 0,
          transition: "opacity 250ms ease 100ms",
          pointerEvents: expanded ? "auto" : "none",
          position: "absolute",
          top: 20,
          left: 0,
          right: 0,
          bottom: 0,
          overflowY: "auto",
          padding: "8px 12px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {expanded && expandedContent}
      </div>
    </div>
  );
}

export { COLLAPSED_W, EXPANDED_W };
