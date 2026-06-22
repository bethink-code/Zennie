// Walk-forward edge test: is the strategy (under-touching + reach off)
// repeatably positive across many independent windows, or was +2.87% noise?
//
// Pre-committed decision rule:
//   PASS if positive in >= 4 of 6 windows AND mean > 0 AND mean-excl-best > 0.
//   Else FAIL (no edge -> stop). Backtest is optimistic (exact limit fills, no
//   fees) so a marginal pass reads as a real-world fail.
import { BinanceProvider } from "../server/modules/zenny/infrastructure/providers/binanceProvider";
import { DEFAULT_INFRASTRUCTURE_CONFIG } from "../server/modules/zenny/infrastructure/types";
import { MockProvider } from "../server/modules/zenny/infrastructure/providers/mockProvider";
import { runBacktest } from "../server/modules/zenny/backtest/runBacktest";
import { DEFAULT_WICK_CONFIG } from "../server/modules/zenny/decision/wick/defaultConfig";
import { WATCHLIST_SYMBOLS } from "../shared/zennyWatchlist";
import type { Candle, Timeframe } from "../shared/zennyTypes";

const SYMBOLS = [...WATCHLIST_SYMBOLS];
const TFS: Timeframe[] = ["15m", "1H", "4H", "12H", "D", "W", "M"];
const DAY = 86400000;
const WINDOW_DAYS = 14;
const N_WINDOWS = 6;

async function fetchHistory(b: BinanceProvider, symbol: string, tf: Timeframe, pages: number): Promise<Candle[]> {
  let all: Candle[] = [];
  let endTimeMs: number | undefined;
  for (let p = 0; p < pages; p++) {
    const batch = await b.getCandles({ symbol, timeframe: tf, count: 1500, endTimeMs });
    if (!batch.length) break;
    all = [...batch, ...all];
    endTimeMs = batch[0].openTime - 1;
  }
  return [...new Map(all.map((c) => [c.openTime, c])).values()].sort((a, b) => a.openTime - b.openTime);
}

const binance = new BinanceProvider(DEFAULT_INFRASTRUCTURE_CONFIG);
const mock = new MockProvider();
console.log(`Fetching ${SYMBOLS.length} symbols (8 pages 15m ≈ 125 days)…`);
for (const s of SYMBOLS) {
  for (const tf of TFS) {
    try { mock.setCandles(s, tf, await fetchHistory(binance, s, tf, tf === "15m" ? 8 : 1)); }
    catch { console.log(`  fetch failed ${s} ${tf}`); }
  }
}

const now = Date.now();
// 6 consecutive 14-day blocks ending now: oldest first.
const windows = Array.from({ length: N_WINDOWS }, (_, i) => {
  const to = now - (N_WINDOWS - 1 - i) * WINDOW_DAYS * DAY;
  return { from: to - WINDOW_DAYS * DAY, to };
});

console.log(`\nWalk-forward: ${N_WINDOWS} × ${WINDOW_DAYS}d, fresh $500 each, under-touching + reach off\n`);
console.log("window                         ret%   submitted  filled  win%");
const rets: number[] = [];
for (const w of windows) {
  const r = await runBacktest({
    provider: mock, symbols: SYMBOLS, timeframe: "15m",
    fromMs: w.from, toMs: w.to, startingEquity: 500,
    config: { wickConfig: { ...DEFAULT_WICK_CONFIG } },
  });
  rets.push(r.summary.pnlPct);
  const label = `${new Date(w.from).toISOString().slice(5, 10)}→${new Date(w.to).toISOString().slice(5, 10)}`;
  console.log(
    `${label.padEnd(14)}  ${r.summary.pnlPct.toFixed(2).padStart(8)}  ${String(r.submitted).padStart(9)}  ${String(r.trades.length).padStart(6)}  ${(r.summary.winRate !== null ? (r.summary.winRate * 100).toFixed(0) : "—").padStart(4)}`,
  );
}

const positive = rets.filter((r) => r > 0).length;
const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
const best = Math.max(...rets);
const exclBest = rets.filter((r) => r !== best);
const meanExclBest = exclBest.reduce((a, b) => a + b, 0) / exclBest.length;
const pass = positive >= 4 && mean > 0 && meanExclBest > 0;

console.log("\n=== VERDICT ===");
console.log(`positive windows:   ${positive}/${N_WINDOWS}   (need ≥4)`);
console.log(`mean window ret:    ${mean.toFixed(2)}%   (need >0)`);
console.log(`mean excl. best:    ${meanExclBest.toFixed(2)}%   (need >0)`);
console.log(`\n${pass ? "PASS — edge survives walk-forward (still optimistic; marginal = fail)" : "FAIL — no repeatable edge → stop"}`);
process.exit(0);
