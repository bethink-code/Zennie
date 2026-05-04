// verify-rebuild.ts — quick end-to-end smoke test of the new analysis pipeline.
// Calls runAnalysis directly with a real BinanceProvider. No auth, no server.
//
// Usage: doppler run --config dev -- npx tsx scripts/verify-rebuild.ts
//
// Prints level/pool counts per timeframe and a sample of the levels so we can
// eyeball the output before opening the Braid in a browser.

import { BinanceProvider } from "../server/modules/zenny/infrastructure/providers/binanceProvider";
import { DEFAULT_INFRASTRUCTURE_CONFIG } from "../server/modules/zenny/infrastructure/types";
import { runAnalysis } from "../server/modules/zenny/analysis/orchestrator";

async function main() {
  const provider = new BinanceProvider(DEFAULT_INFRASTRUCTURE_CONFIG);
  console.log("Running analysis: BTCUSDT, primary=D, count=200…");

  const primaryTimeframe = (process.env.TF as any) || "D";
  const candleCountPerTf = parseInt(process.env.COUNT || "200", 10);

  const t0 = Date.now();
  const state = await runAnalysis({
    provider,
    symbol: "BTCUSDT",
    primaryTimeframe,
    candleCountPerTf,
  });
  const elapsed = Date.now() - t0;

  console.log(`Done in ${elapsed}ms.\n`);
  console.log(`Symbol:              ${state.symbol}`);
  console.log(`Primary TF:          ${state.primaryTimeframe}`);
  console.log(`Analysed TFs:        ${state.analysedTimeframes.join(", ")}`);
  console.log(`Primary candles:     ${state.candles.length}`);
  console.log(`Levels (total):      ${state.levels.length}`);
  console.log(`  active (unbroken): ${state.levels.filter((l) => !l.broken).length}`);
  console.log(`  broken:            ${state.levels.filter((l) => l.broken).length}`);
  console.log(`Pools (total):       ${state.pools.length}`);
  console.log(`  active:            ${state.pools.filter((p) => p.status === "active").length}`);
  console.log(`  dead:              ${state.pools.filter((p) => p.status === "dead").length}`);

  console.log("\nPer-TF level counts:");
  const tfCounts = new Map<string, { total: number; active: number }>();
  for (const lvl of state.levels) {
    const tf = lvl.sourceTimeframe;
    const cur = tfCounts.get(tf) ?? { total: 0, active: 0 };
    cur.total++;
    if (!lvl.broken) cur.active++;
    tfCounts.set(tf, cur);
  }
  for (const [tf, c] of tfCounts) {
    console.log(`  ${tf.padEnd(4)}  active=${c.active}/${c.total}`);
  }

  // Find the level closest to a target price for polarity-flip diagnosis
  const targetPrice = parseFloat(process.env.TARGET || "0");
  if (targetPrice > 0) {
    console.log(`\nLevels near $${targetPrice.toFixed(0)} (within 3%):`);
    const near = state.levels
      .filter((l) => Math.abs(l.price - targetPrice) / targetPrice < 0.03)
      .sort((a, b) => Math.abs(a.price - targetPrice) - Math.abs(b.price - targetPrice));
    const lastClose = state.candles.length
      ? state.candles[state.candles.length - 1].close
      : 0;
    console.log(`Last close: $${lastClose.toFixed(0)}`);
    for (const l of near) {
      const pf = (l.passes as any)?.polarityFlip;
      const a = (l.passes as any)?.aggregate;
      const pfStr = pf
        ? `polarity=${pf.effectiveSide} crossings=${pf.crossings} flipped=${pf.flipped}`
        : "polarity=NOT_RUN";
      console.log(
        `  $${l.price.toFixed(0).padStart(7)} ${l.side === "RESISTANCE" ? "R" : "S"} ${l.sourceTimeframe.padEnd(3)} src=${(l as any).source ?? "—"} broken=${l.broken} ${pfStr} agg=${a?.score.toFixed(2) ?? "—"}`,
      );
    }
    return;
  }

  console.log("\nSample of active levels (top 10 most recent) with pass results:");
  const sample = [...state.levels]
    .filter((l) => !l.broken)
    .sort((a, b) => b.recency - a.recency)
    .slice(0, 10);
  for (const l of sample) {
    const r = (l.passes as any)?.recency;
    const t = (l.passes as any)?.touchCount;
    const ll = (l.passes as any)?.lastLeg;
    const recStr = r
      ? `rec=${r.value.toFixed(2)}${r.wouldFilter ? " [filter]" : ""}`
      : "rec=—";
    const tchStr = t ? `tch=${t.value}` : "tch=—";
    const llStr = ll
      ? `leg=${ll.value.toFixed(2)} (${ll.nearestSwing ?? "—"})`
      : "leg=—";
    console.log(
      `  $${l.price.toFixed(0).padStart(7)} ${l.side === "RESISTANCE" ? "R" : "S"} ${l.sourceTimeframe.padEnd(3)} ${l.strength.padEnd(11)} ${recStr} ${tchStr} ${llStr}`,
    );
  }

  console.log("\nSample of active pools (top 5):");
  const poolSample = state.pools
    .filter((p) => p.status === "active")
    .sort((a, b) => b.linePrice - a.linePrice)
    .slice(0, 5);
  for (const p of poolSample) {
    console.log(
      `  ${p.type === "RESISTANCE" ? "R" : "S"} ${p.sourceTimeframe.padEnd(3)} line=$${p.linePrice.toFixed(0)} wickHigh=$${p.wickHigh.toFixed(0)} wickLow=$${p.wickLow.toFixed(0)}`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("FAILED:", err);
    process.exit(1);
  });
