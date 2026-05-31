// summariseBacktest — turn a list of closed trades + equity curve into the
// scored outcome. The `score` is the single comparable number the Karpathy
// optimiser maximises; everything else is the human-readable breakdown.
//
// Default objective: net return % (pnlPct). Clear and honest. Swap this when
// you want to penalise drawdown or reward consistency — the components are all
// here, so changing the objective is a one-line edit.

import type { PositionRecord } from "../execution/types";

export interface BacktestSummary {
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  pnlAbs: number;
  pnlPct: number;
  maxDrawdownPct: number;
  profitFactor: number | null; // gross win / gross loss; null when no losses
  expectancy: number | null; // avg realised P&L per trade
  score: number; // optimiser objective — default = pnlPct
}

export function summariseBacktest(
  closed: PositionRecord[],
  startingEquity: number,
  finalEquity: number,
  equityCurve: Array<{ t: number; equity: number }>,
): BacktestSummary {
  const pnls = closed.map((p) => p.realisedPnl ?? 0);
  const trades = pnls.length;
  const wins = pnls.filter((p) => p > 0).length;
  const losses = pnls.filter((p) => p < 0).length;
  const grossWin = pnls.filter((p) => p > 0).reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(
    pnls.filter((p) => p < 0).reduce((a, b) => a + b, 0),
  );

  const pnlAbs = finalEquity - startingEquity;
  const pnlPct = startingEquity > 0 ? (pnlAbs / startingEquity) * 100 : 0;
  const winRate = trades > 0 ? wins / trades : null;
  const expectancy = trades > 0 ? pnlAbs / trades : null;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : null;
  const maxDrawdownPct = computeMaxDrawdownPct(equityCurve);

  return {
    trades,
    wins,
    losses,
    winRate,
    pnlAbs,
    pnlPct,
    maxDrawdownPct,
    profitFactor,
    expectancy,
    score: pnlPct,
  };
}

function computeMaxDrawdownPct(
  curve: Array<{ t: number; equity: number }>,
): number {
  let peak = -Infinity;
  let maxDd = 0;
  for (const { equity } of curve) {
    if (equity > peak) peak = equity;
    if (peak > 0) {
      const dd = ((peak - equity) / peak) * 100;
      if (dd > maxDd) maxDd = dd;
    }
  }
  return maxDd;
}
