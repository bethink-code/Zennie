// RiskConfig — the discrete "how much to risk" knob.
//
// Deliberately separate from the other three pieces:
//   - decision   (geometry: where the entry/stop/target sit, the R-multiple)
//   - SIZING      (computeSize: how big, given a budget + stop distance)
//   - execution   (reduceStep: order lifecycle, fills, exits, kill switch)
//
// Account risk is a FIXED budget — the fraction of equity a single trade may
// lose if it hits its stop. It is NOT derived from the stop distance (that is
// geometry). computeSize combines the two for true risk-parity:
//   $ risked = equity × accountRiskPct% × convictionMultiplier   (constant)
//   size     = $ risked / |entry - stop|                         (varies)

export interface RiskConfig {
  // Percent of account equity to risk on a single trade at full conviction
  // (convictionMultiplier = 1). E.g. 0.5 = lose 0.5% of equity if stopped.
  accountRiskPct: number;
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  accountRiskPct: 0.5,
};
