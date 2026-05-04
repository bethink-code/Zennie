import { db } from "../server/db";
import { autoresearchSessions, autoresearchIterations } from "../shared/schema";
import { desc, eq } from "drizzle-orm";
import { getBinance } from "../server/modules/exchange/binance";
import { runBacktest } from "../server/modules/backtestEngine";
import { DEFAULT_PARAMS } from "../server/modules/autoresearch/prompt";
import { storage } from "../server/storage";
import type { Timeframe } from "../server/modules/exchange/types";

async function main() {
  const [s] = await db
    .select()
    .from(autoresearchSessions)
    .orderBy(desc(autoresearchSessions.startedAt))
    .limit(1);
  const its = await db
    .select()
    .from(autoresearchIterations)
    .where(eq(autoresearchIterations.sessionId, s.id));
  const profitable = its
    .filter((i) => i.trades > 0 && Number(i.netPnl) > 0)
    .sort((a, b) => Number(b.netPnl) - Number(a.netPnl));
  const best = profitable[0];
  if (!best) {
    console.log("no profitable iteration");
    return;
  }
  console.log(`BEST iteration #${best.idx}: ${best.trades} trades, net ${best.netPnl}`);

  const pair = await storage.getMarketPair(s.pairId);
  if (!pair) return;
  const symbol = `${pair.baseAsset}${pair.quoteAsset}`;
  const candles = await getBinance().fetchCandles({
    symbol,
    timeframe: s.timeframe as Timeframe,
    limit: s.lookbackBars,
  });
  const firstCandle = candles[0].openTime;
  const lastCandle = candles[candles.length - 1].openTime;

  const p = { ...DEFAULT_PARAMS, ...(best.params as Partial<typeof DEFAULT_PARAMS>) };
  const result = runBacktest({
    candles,
    regime: s.regime as Parameters<typeof runBacktest>[0]["regime"],
    startingCapital: 10_000,
    warmupCandles: 100,
    config: {
      riskPercentPerTrade: 1.0,
      minRiskRewardRatio: p.minRiskRewardRatio,
      minLevelRank: p.minLevelRank,
      maxConcurrentPositions: p.maxConcurrentPositions,
      dailyDrawdownLimitPct: 3.0,
      weeklyDrawdownLimitPct: 6.0,
    },
    levelConfig: {
      swingLookback: p.swingLookback,
      equalTolerancePct: p.equalTolerancePct,
      mergeTolerancePct: p.mergeTolerancePct,
      minTouches: p.minTouches,
    },
    sweepConfig: { minWickProtrusionPct: p.minWickProtrusionPct },
    proposalConfig: { targetDistanceMultiplier: p.targetDistanceMultiplier },
  });

  console.log(`\nWindow: bar 0 to bar ${candles.length - 1}`);
  console.log(`Window time: ${new Date(firstCandle).toISOString()} → ${new Date(lastCandle).toISOString()}`);
  console.log(`\nTrades (${result.tradeLog.length}):`);
  console.log("  bar | time                | side  | entry   | PnL     | outcome");
  console.log("  ----|---------------------|-------|---------|---------|--------");
  for (const t of result.tradeLog) {
    const barIdx = candles.findIndex((c) => c.openTime === t.openedAt);
    console.log(
      `  ${String(barIdx).padStart(3)} | ${new Date(t.openedAt).toISOString().slice(0, 19)} | ${t.side.padEnd(5)} | ${t.entry.toFixed(2).padStart(7)} | ${t.realisedPnl.toFixed(2).padStart(7)} | ${t.outcome}`
    );
  }

  console.log(`\nRejection aggregate for this iteration:`);
  const rejs = result.diagnostic.rejections;
  const total = Object.values(rejs).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(rejs).sort((a, b) => b[1] - a[1]);
  for (const [k, v] of sorted) {
    const pct = ((v / total) * 100).toFixed(1);
    console.log(`  ${k}: ${v} (${pct}%)`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
