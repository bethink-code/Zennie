// PassPlayground — drawer for toggling and tuning analysis passes.
//
// Multi-pass architecture: each pass is independent. Toggling one on/off
// re-runs the orchestrator with that pass enabled (or disabled), and the
// renderer keys on the result presence in level.passes[passName].
//
// New passes added on the server side: drop a row here, no other code moves.

import type {
  PassConfigClient,
  RecencyPassConfigClient,
  TouchCountPassConfigClient,
  LastLegPassConfigClient,
  AggregatePassConfigClient,
  PolarityFlipPassConfigClient,
} from "./types";

interface Props {
  config: PassConfigClient;
  defaultConfig: PassConfigClient;
  viewSettings?: React.ReactNode;
  onChange: (next: PassConfigClient) => void;
  onClose: () => void;
}

export function PassPlayground({
  config,
  defaultConfig,
  viewSettings,
  onChange,
  onClose,
}: Props) {
  const setRecency = (next: Partial<RecencyPassConfigClient>) =>
    onChange({ ...config, recency: { ...config.recency, ...next } });
  const setTouchCount = (next: Partial<TouchCountPassConfigClient>) =>
    onChange({ ...config, touchCount: { ...config.touchCount, ...next } });
  const setLastLeg = (next: Partial<LastLegPassConfigClient>) =>
    onChange({ ...config, lastLeg: { ...config.lastLeg, ...next } });
  const setAggregate = (next: Partial<AggregatePassConfigClient>) =>
    onChange({ ...config, aggregate: { ...config.aggregate, ...next } });
  const setPolarityFlip = (next: Partial<PolarityFlipPassConfigClient>) =>
    onChange({ ...config, polarityFlip: { ...config.polarityFlip, ...next } });

  return (
    <div className="absolute top-0 right-0 h-full w-[380px] max-w-[min(380px,100vw)] bg-white border-l border-black/10 shadow-lg z-30 flex flex-col">
      <div className="flex-shrink-0 border-b border-black/10 px-3 py-2 flex items-center justify-between">
        <h2 className="text-sm font-medium">Settings</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onChange(defaultConfig)}
            className="text-[11px] text-[#888780] hover:text-[#3d3d3a] px-2 py-0.5 rounded border border-black/10 hover:bg-[#f1efe8]"
            title="Reset all passes to the current timeframe defaults"
          >
            Reset passes
          </button>
          <button
            onClick={onClose}
            className="text-[#888780] hover:text-[#3d3d3a] text-sm px-2 py-0.5 rounded hover:bg-[#f1efe8]"
          >
            ×
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4 text-sm">
        {viewSettings}

        <p className="text-xs text-[#888780] leading-snug">
          Each pass is independent. Toggle to add/remove its verdict from
          every level. Levels are <strong>identified</strong> by the engine
          (frozen) and then each enabled pass annotates them — strength,
          recency, etc. No pass affects another (except Aggregate, which
          composes them all).
        </p>

        {/* Aggregate — primary control: strength slider that filters by
            composite score across all enabled passes. */}
        <PassCard
          title="Aggregate (strength filter)"
          enabled={config.aggregate.enabled}
          onToggle={(v) => setAggregate({ enabled: v })}
          summary="Combines other enabled passes into a single 0..1 score per level. Slider hides everything below the threshold — the simplifier."
        >
          <div className="text-[12px] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[#888780]">Strength threshold</span>
              <span className="font-medium tabular-nums">
                {config.aggregate.strengthThreshold.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={config.aggregate.strengthThreshold}
              onChange={(e) =>
                setAggregate({
                  strengthThreshold: parseFloat(e.target.value),
                })
              }
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-[#888780]">
              <span>show all</span>
              <span>only strongest</span>
            </div>
          </div>
          <Field label="Weight: recency">
            <NumberInput
              value={config.aggregate.weightRecency}
              min={0}
              max={2}
              step={0.05}
              onChange={(v) => setAggregate({ weightRecency: v })}
            />
          </Field>
          <Field label="Weight: last leg">
            <NumberInput
              value={config.aggregate.weightLastLeg}
              min={0}
              max={2}
              step={0.05}
              onChange={(v) => setAggregate({ weightLastLeg: v })}
            />
          </Field>
          <Field label="Weight: touch count">
            <NumberInput
              value={config.aggregate.weightTouchCount}
              min={0}
              max={2}
              step={0.05}
              onChange={(v) => setAggregate({ weightTouchCount: v })}
            />
          </Field>
          <Field label="Broken penalty">
            <NumberInput
              value={config.aggregate.brokenPenalty}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => setAggregate({ brokenPenalty: v })}
            />
            <span className="text-xs text-[#888780]">× broken levels</span>
          </Field>
        </PassCard>

        {/* Recency pass */}
        <PassCard
          title="Recency"
          enabled={config.recency.enabled}
          onToggle={(v) => setRecency({ enabled: v })}
          summary="Right > left. Newer levels score higher. Below threshold = wouldFilter."
        >
          <Field label="Curve">
            <select
              value={config.recency.curve}
              onChange={(e) =>
                setRecency({ curve: e.target.value as "linear" | "exponential" })
              }
              className="border border-black/15 rounded px-1 py-0.5 bg-white text-xs"
            >
              <option value="linear">linear</option>
              <option value="exponential">exponential</option>
            </select>
          </Field>
          {config.recency.curve === "exponential" && (
            <Field label="Half-life (candles)">
              <NumberInput
                value={config.recency.halfLifeCandles}
                min={1}
                max={500}
                step={5}
                onChange={(v) => setRecency({ halfLifeCandles: v })}
              />
            </Field>
          )}
          <Field label="Filter threshold">
            <NumberInput
              value={config.recency.threshold}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => setRecency({ threshold: v })}
            />
          </Field>
        </PassCard>

        {/* TouchCount pass */}
        <PassCard
          title="Touch count"
          enabled={config.touchCount.enabled}
          onToggle={(v) => setTouchCount({ enabled: v })}
          summary="Subsequent re-tests of the level on its own TF. Each fresh approach into the zone counts as one touch."
        >
          <Field label="Tolerance %">
            <NumberInput
              value={config.touchCount.tolerancePct * 100}
              min={0.05}
              max={1}
              step={0.05}
              onChange={(v) => setTouchCount({ tolerancePct: v / 100 })}
            />
            <span className="text-xs text-[#888780]">% of price</span>
          </Field>
          <Field label="Lookforward (candles)">
            <NumberInput
              value={config.touchCount.lookforwardCandles}
              min={0}
              max={1000}
              step={10}
              onChange={(v) => setTouchCount({ lookforwardCandles: v })}
            />
            <span className="text-xs text-[#888780]">0 = no limit</span>
          </Field>
        </PassCard>

        {/* Polarity flip — support↔resistance flip rule */}
        <PassCard
          title="Polarity flip"
          enabled={config.polarityFlip.enabled}
          onToggle={(v) => setPolarityFlip({ enabled: v })}
          summary="Classic S↔R rule. Walks source-TF candles and counts crossings: 0 = original side, 1 = flipped (resistance becomes support after a clean break), 2+ = dead. Renderer recolours flipped levels."
        />

        {/* LastLeg pass — structural recency */}
        <PassCard
          title="Last leg"
          enabled={config.lastLeg.enabled}
          onToggle={(v) => setLastLeg({ enabled: v })}
          summary="ZigZag swings on wick extremes. Each level scored by proximity to the closest of the last N swings. N=3 gives the bounding swings of the current leg + the previous reversal."
        >
          <Field label="Last N swings">
            <NumberInput
              value={config.lastLeg.lastN}
              min={1}
              max={10}
              step={1}
              onChange={(v) => setLastLeg({ lastN: v })}
            />
            <span className="text-xs text-[#888780]">structural prices</span>
          </Field>
          <Field label="Reversal %">
            <NumberInput
              value={config.lastLeg.reversalPct * 100}
              min={0.5}
              max={20}
              step={0.5}
              onChange={(v) => setLastLeg({ reversalPct: v / 100 })}
            />
            <span className="text-xs text-[#888780]">% — swing confirm</span>
          </Field>
          <Field label="Tolerance %">
            <NumberInput
              value={config.lastLeg.tolerancePct * 100}
              min={0.1}
              max={5}
              step={0.1}
              onChange={(v) => setLastLeg({ tolerancePct: v / 100 })}
            />
            <span className="text-xs text-[#888780]">% — match band</span>
          </Field>
        </PassCard>

        <p className="text-xs text-[#888780] pt-2 border-t border-black/5 leading-snug">
          More passes (bounce magnitude, volume z-score, polarity flip,
          aggregate) drop in here as separate cards as they're built.
          Identification stays untouched.
        </p>
      </div>
    </div>
  );
}

function PassCard({
  title,
  enabled,
  onToggle,
  summary,
  children,
}: {
  title: string;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  summary: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="border border-black/10 rounded p-2 space-y-2 bg-[#fbfaf6]">
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="mt-0.5"
        />
        <div className="flex-1">
          <div className="font-medium text-[13px]">{title}</div>
          <div className="text-[11px] text-[#888780] leading-snug">{summary}</div>
        </div>
      </label>
      {enabled && children && <div className="pl-6 space-y-1.5">{children}</div>}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className="text-[#888780] w-32">{label}</span>
      {children}
    </div>
  );
}

function NumberInput({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (next: number) => void;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const n = parseFloat(e.target.value);
        if (!Number.isNaN(n)) onChange(n);
      }}
      className="border border-black/15 rounded px-1.5 py-0.5 w-20 bg-white text-xs tabular-nums"
    />
  );
}
