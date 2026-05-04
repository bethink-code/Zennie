// levelStrength — derive a strength label from sourceTimeframe + recency.
//
// Brief: levels come from candles alone, no multi-TF confluence in this cut.
// The natural gradient is timeframe scale × how recently the swing formed.
// Monthly/Weekly swings carry more weight than 15m. Recent swings carry more
// weight than ones near the left edge of the window (older = more likely to
// have already been tested even if not yet broken).

import type { Timeframe } from "../../../../../shared/zennyTypes";

export type LevelStrength =
  | "trivial"
  | "weak"
  | "medium"
  | "strong"
  | "very_strong";

const TF_BASE: Record<Timeframe, number> = {
  "15m": 0,
  "1H": 1,
  "4H": 2,
  "12H": 2,
  D: 3,
  W: 4,
  M: 5,
};

export interface LevelStrengthInput {
  sourceTimeframe: Timeframe;
  recency: number; // 0..1, 1 = newest candle in primary TF window
  isPrimaryTimeframe: boolean;
}

export function levelStrength(input: LevelStrengthInput): LevelStrength {
  const base = TF_BASE[input.sourceTimeframe] ?? 0;
  const recencyBoost = input.recency >= 0.7 ? 1 : 0;
  const primaryBoost = input.isPrimaryTimeframe ? 1 : 0;
  const score = base + recencyBoost + primaryBoost;

  if (score <= 0) return "trivial";
  if (score === 1) return "weak";
  if (score <= 3) return "medium";
  if (score <= 5) return "strong";
  return "very_strong";
}
