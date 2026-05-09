// ColumnInnerTabs — small wrapper used inside each NOW column's expanded
// content to switch between an "info" view (the data) and a "settings" view
// (the column-scoped tunables). When `settings` is undefined, just renders
// info (no tab UI), so columns without settings yet stay clean.
//
// Pattern matches CLAUDE.md UX rule: "Consistent tab pattern — text tabs
// with underline for all tabbed interfaces."

import { useState } from "react";
import type { ReactNode } from "react";

interface Props {
  info: ReactNode;
  settings?: ReactNode;
  // Default tab to show. "info" by default; useful when a column has more
  // settings than data and operators want settings on first open.
  defaultTab?: "info" | "settings";
}

export function ColumnInnerTabs({ info, settings, defaultTab = "info" }: Props) {
  const [tab, setTab] = useState<"info" | "settings">(defaultTab);

  if (!settings) {
    return <>{info}</>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider border-b border-black/8">
        <Tab
          label="info"
          active={tab === "info"}
          onClick={() => setTab("info")}
        />
        <Tab
          label="settings"
          active={tab === "settings"}
          onClick={() => setTab("settings")}
        />
      </div>
      <div>{tab === "info" ? info : settings}</div>
    </div>
  );
}

function Tab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="px-1 py-1.5 transition-colors"
      style={{
        color: active ? "#3d3d3a" : "#888780",
        fontWeight: active ? 600 : 400,
        borderBottom: active ? "1.5px solid #3d3d3a" : "1.5px solid transparent",
        marginBottom: -1,
      }}
    >
      {label}
    </button>
  );
}
