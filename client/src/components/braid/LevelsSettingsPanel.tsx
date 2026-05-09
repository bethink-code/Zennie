// LevelsSettingsPanel — column-scoped settings for the LEVELS column.
// Owns: pool visibility, swing markers, max levels per side, current/higher
// TF toggles. State + setters come from the page (Braid.tsx) where they're
// persisted to localStorage.

interface Props {
  showPools: boolean;
  setShowPools: (v: boolean) => void;
  showSweptPools: boolean;
  setShowSweptPools: (v: boolean) => void;
  showDeadPools: boolean;
  setShowDeadPools: (v: boolean) => void;
  showCurrentTf: boolean;
  setShowCurrentTf: (v: boolean) => void;
  showOtherTfs: boolean;
  setShowOtherTfs: (v: boolean) => void;
  showSwingMarkers: boolean;
  setShowSwingMarkers: (v: boolean) => void;
  maxLevelsPerSide: number;
  setMaxLevelsPerSide: (v: number) => void;
}

export function LevelsSettingsPanel(props: Props) {
  return (
    <div className="space-y-3 text-xs">
      <SettingsGroup title="Levels & pools">
        <ToggleRow
          label="Pools"
          checked={props.showPools}
          onChange={props.setShowPools}
          hint="Tinted rectangular zones — active liquidity pools."
        />
        <ToggleRow
          label="Swept pools"
          checked={props.showSweptPools}
          onChange={props.setShowSweptPools}
          disabled={!props.showPools}
          hint="Wick poked through but body still inside. Hatched."
        />
        <ToggleRow
          label="Dead pools"
          checked={props.showDeadPools}
          onChange={props.setShowDeadPools}
          disabled={!props.showPools}
          hint="Close past line. Faded + dashed."
        />
        <ToggleRow
          label="Current TF levels"
          checked={props.showCurrentTf}
          onChange={props.setShowCurrentTf}
          hint="Hide to see only HTF structure."
        />
        <ToggleRow
          label="Higher TF levels"
          checked={props.showOtherTfs}
          onChange={props.setShowOtherTfs}
        />
        <ToggleRow
          label="Pivot marks"
          checked={props.showSwingMarkers}
          onChange={props.setShowSwingMarkers}
          hint="Outlined rects on pivot candles — diagnostic only."
        />
      </SettingsGroup>

      <SettingsGroup title="Density">
        <label className="grid grid-cols-[88px_1fr] items-center gap-2">
          <span className="text-[#888780]">Max levels</span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={20}
              step={1}
              value={props.maxLevelsPerSide}
              onChange={(e) =>
                props.setMaxLevelsPerSide(parseInt(e.target.value, 10) || 0)
              }
              className="flex-1"
            />
            <span className="w-14 tabular-nums text-[#888780]">
              {props.maxLevelsPerSide === 0
                ? "all"
                : `${props.maxLevelsPerSide}/side`}
            </span>
          </div>
        </label>
        <div className="text-[10px] text-[#888780] leading-snug">
          Caps the rendered levels above and below current price independently,
          ranked by aggregate score → source TF → recency.
        </div>
      </SettingsGroup>
    </div>
  );
}

function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wider text-[#888780] font-medium">
        {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <label
        className="flex items-center gap-2 cursor-pointer select-none"
        style={{ opacity: disabled ? 0.5 : 1 }}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="w-3.5 h-3.5"
        />
        <span className="text-[#3d3d3a]">{label}</span>
      </label>
      {hint && (
        <div className="text-[10px] text-[#888780] leading-snug pl-6">
          {hint}
        </div>
      )}
    </div>
  );
}
