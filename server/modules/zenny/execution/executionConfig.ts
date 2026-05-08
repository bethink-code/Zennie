// ExecutionConfig — research-backed defaults for the paper-trading execution
// module. Every value here has a paper-testing schedule entry (E1–E10).
//
// Editing these is a real decision. The alternatives + paper-test plan live
// in memory/zenny_paper_testing_schedule.md. Don't override silently in
// callers — pass a partial config to reduceStep instead.

export type FillMode = "next-bar-touch" | "next-bar-open" | "cheat-on-close";

export type SameBarConflictMode =
  | "stop-wins"
  | "target-wins"
  | "ohlc-heuristic"
  | "use-lower-tf";

export type TrailMode = "static" | "breakeven-on-1R" | "structure";

export type KillSwitchReference = "peak" | "starting" | "daily-peak";

export interface ExecutionConfig {
  // E1
  fillMode: FillMode;
  // E2
  sameBarConflict: SameBarConflictMode;
  // E3
  slippageBps: number;
  applySlippageToLimits: boolean;
  // E4
  entryValidBars: number;
  // E5
  trailMode: TrailMode;
  // E6
  maxBarsInTrade: number | null;
  // E7
  softKillDrawdownPct: number;
  // E8
  hardKillDrawdownPct: number;
  // E9
  killSwitchReference: KillSwitchReference;
}

export const DEFAULT_EXECUTION_CONFIG: ExecutionConfig = {
  fillMode: "next-bar-touch",
  sameBarConflict: "stop-wins",
  slippageBps: 5,
  applySlippageToLimits: false,
  entryValidBars: 5,
  trailMode: "static",
  maxBarsInTrade: null,
  softKillDrawdownPct: 20,
  hardKillDrawdownPct: 30,
  killSwitchReference: "peak",
};
