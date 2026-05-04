// Trades column — collapsed shows active position count, expanded shows
// trade details. Placeholder for Phase 2 execution module.

const C = {
  text: "#888780",
  textStrong: "#3d3d3a",
};

interface Props {
  chartHeight: number;
}

export function TradesColumnCollapsed({ chartHeight }: Props) {
  return (
    <div
      className="relative w-full h-full flex flex-col items-center justify-center"
      style={{ paddingTop: 24, color: C.text }}
    >
      <div style={{ fontSize: 18, fontWeight: 600, color: C.textStrong }}>0</div>
      <div style={{ fontSize: 9, marginTop: 2 }}>active</div>
    </div>
  );
}

export function TradesColumnExpanded() {
  return (
    <div style={{ color: C.text, fontSize: 11 }}>
      <div style={{ fontWeight: 600, color: C.textStrong, marginBottom: 8 }}>
        Active Positions
      </div>
      <div style={{ color: C.text, fontStyle: "italic" }}>
        No active positions. Paper trading mode.
      </div>
      <div
        style={{
          marginTop: 16,
          fontWeight: 600,
          color: C.textStrong,
          marginBottom: 8,
        }}
      >
        Pre-placed Orders
      </div>
      <div style={{ color: C.text, fontStyle: "italic" }}>
        No orders placed. Strategy engine not yet active.
      </div>
    </div>
  );
}
