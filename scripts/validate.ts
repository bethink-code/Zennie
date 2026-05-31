// Validation backtest — full 8-symbol watchlist over ~3 weeks, paginated 15m
// history. Tests whether the sweep's candidate (under-touching + REACH off)
// holds its edge on real sample size vs the current default. Throwaway.
import { BinanceProvider } from "../server/modules/zenny/infrastructure/providers/binanceProvider";
import { DEFAULT_INFRASTRUCTURE_CONFIG } from "../server/modules/zenny/infrastructure/types";
import { MockProvider } from "../server/modules/zenny/infrastructure/providers/mockProvider";
import { runSweep, type SweepVariant } from "../server/modules/zenny/karpathy/runSweep";
import { DEFAULT_WICK_CONFIG } from "../server/modules/zenny/decision/wick/defaultConfig";
import { DEFAULT_REACH_CONFIG } from "../server/modules/zenny/decision/reach/defaultConfig";
import { WATCHLIST_SYMBOLS } from "../shared/zennyWatchlist";
import type { EntryStyle } from "../server/modules/zenny/decision/wick/types";
import type { BacktestConfig } from "../server/modules/zenny/backtest/runBacktest";
import type { Candle, Timeframe } from "../shared/zennyTypes";

const SYMBOLS = [...WATCHLIST_SYMBOLS];
const TFS: Timeframe[] = ["15m", "1H", "4H", "12H", "D", "W", "M"];
const reachOff = { ...DEFAULT_REACH_CONFIG, allowedPlaybooks: [] as never[] };

function wick(entries: EntryStyle[]): BacktestConfig["wickConfig"] {
  return {
    ...DEFAULT_WICK_CONFIG,
    regimeMatrix: { ranging: entries, accumulation: entries, trending: [], breakout: [] },
  };
}

const variants: SweepVariant[] = [
  { label: "DEFAULT (midpoint, REACH on)", config: {} },
  { label: "candidate: under-touching + REACH off", config: { reachConfig: reachOff, wickConfig: wick(["under-touching"]) } },
  { label: "control: midpoint + REACH off", config: { reachConfig: reachOff, wickConfig: wick(["midpoint"]) } },
];

async function fetchHistory(
  binance: BinanceProvider,
  symbol: string,
  tf: Timeframe,
  pages: number,
): Promise<Candle[]> {
  let all: Candle[] = [];
  let endTimeMs: number | undefined = undefined;
  for (let p = 0; p < pages; p++) {
    const batch = await binance.getCandles({ symbol, timeframe: tf, count: 1500, endTimeMs });
    if (batch.length === 0) break;
    all = [...batch, ...all];
    endTimeMs = batch[0].openTime - 1;
  }
  const map = new Map(all.map((c) => [c.openTime, c]));
  return [...map.values()].sort((a, b) => a.openTime - b.openTime);
}

const binance = new BinanceProvider(DEFAULT_INFRASTRUCTURE_CONFIG);
const mock = new MockProvider();
console.log(`Fetching history for ${SYMBOLS.length} symbols (paginated 15m)…`);
for (const s of SYMBOLS) {
  for (const tf of TFS) {
    try {
      mock.setCandles(s, tf, await fetchHistory(binance, s, tf, tf === "15m" ? 2 : 1));
    } catch {
      console.log(`  fetch failed ${s} ${tf}`);
    }
  }
}

const now = Date.now();
const base = {
  provider: mock,
  symbols: SYMBOLS,
  timeframe: "15m" as Timeframe,
  fromMs: now - 20 * 24 * 60 * 60 * 1000, // ~3 weeks
  toMs: now,
  startingEquity: 500,
};

console.log(`Validating ${variants.length} configs, 8 symbols, ~20 days…\n`);
const ranked = await runSweep(base, variants, (d, t, label) =>
  console.log(`  [${d}/${t}] ${label} done`),
);

console.log("\n=== RESULTS (8 symbols, ~20 days) ===");
console.log("ret%    trades  win%   PF     expR   maxDD%  config");
for (const r of ranked) {
  const s = r.summary;
  console.log(
    `${s.pnlPct.toFixed(2).padStart(6)}  ${String(s.trades).padStart(6)}  ${(s.winRate !== null ? (s.winRate * 100).toFixed(0) : "—").padStart(4)}  ${(s.profitFactor !== null ? s.profitFactor.toFixed(2) : "—").padStart(5)}  ${(s.expectancy !== null ? s.expectancy.toFixed(2) : "—").padStart(5)}  ${s.maxDrawdownPct.toFixed(1).padStart(6)}  ${r.label}`,
  );
}
process.exit(0);
