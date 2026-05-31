// Throwaway: print pool-qualification verdicts on real candles for a few
// symbols, to eyeball Step 1 before it gates live trades. Delete after use.
import { BinanceProvider } from "../server/modules/zenny/infrastructure/providers/binanceProvider";
import { DEFAULT_INFRASTRUCTURE_CONFIG } from "../server/modules/zenny/infrastructure/types";
import { runAnalysis } from "../server/modules/zenny/analysis/orchestrator";

const provider = new BinanceProvider(DEFAULT_INFRASTRUCTURE_CONFIG);

for (const symbol of ["BTCUSDT", "ETHUSDT", "SOLUSDT"]) {
  const state = await runAnalysis({
    provider,
    symbol,
    primaryTimeframe: "15m",
    candleCountPerTf: 1000,
    liquidations: [],
  });
  // Cheap independent sweep check: how many active pools have had their wick
  // extreme exceeded by a LATER candle (i.e. SHOULD have been swept)?
  const shouldBeSwept = state.pools.filter((p) => {
    if (p.status !== "active") return false;
    const birth = p.birthCandleIndexOnPrimary;
    for (let i = birth + 1; i < state.candles.length; i++) {
      const c = state.candles[i];
      if (p.type === "RESISTANCE" && c.high > p.wickHigh) return true;
      if (p.type === "SUPPORT" && c.low < p.wickLow) return true;
    }
    return false;
  }).length;
  console.log(`  active pools whose wick was later exceeded (should be swept/dead): ${shouldBeSwept}`);
  const byStatus: Record<string, number> = {};
  for (const p of state.pools) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
  const swept = state.pools.filter((p) => p.status === "swept");
  const counts: Record<string, number> = {};
  for (const p of swept) {
    const v = p.qualification?.verdict ?? "none";
    counts[v] = (counts[v] ?? 0) + 1;
  }
  console.log(
    `\n${symbol}: ${state.pools.length} pools, status=`,
    byStatus,
    `swept-verdicts=`,
    counts,
  );
  for (const p of swept.filter(
    (p) => p.qualification && p.qualification.verdict !== "unconfirmed",
  )) {
    const q = p.qualification!;
    console.log(
      `  ${p.type.padEnd(10)} @${p.linePrice.toFixed(2)}  ${q.verdict}` +
        (q.fadeDirection ? ` (${q.fadeDirection})` : "") +
        `  [${q.reasons.join("; ")}]`,
    );
  }
  // Decision output — does the proposer now produce a fade plan?
  const plans = state.tradePlanResult.plansPerTimeframe?.["15m"] ?? [];
  const playbook = state.regimeAssessment?.primary?.recommended?.playbook;
  console.log(`  regime=${playbook ?? "none"}  plans=${plans.length}`);
  for (const pl of plans) {
    console.log(
      `    → ${pl.phase} ${pl.side} entry ${pl.entry.toFixed(2)} stop ${pl.stop.toFixed(2)} target ${pl.target.toFixed(2)} R:R ${pl.riskRewardRatio.toFixed(2)} [${pl.rationale.join("; ")}]`,
    );
  }
}
process.exit(0);
