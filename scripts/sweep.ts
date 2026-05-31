// Karpathy sweep — try different settings over last week, rank by score, print
// the winning config. Search space targets the three diagnosed issues: entry
// placement, stop width (buffer), and the R:R floor. REACH off to isolate the
// fade. Throwaway diagnostic.
import { BinanceProvider } from "../server/modules/zenny/infrastructure/providers/binanceProvider";
import { DEFAULT_INFRASTRUCTURE_CONFIG } from "../server/modules/zenny/infrastructure/types";
import { MockProvider } from "../server/modules/zenny/infrastructure/providers/mockProvider";
import { runSweep, type SweepVariant } from "../server/modules/zenny/karpathy/runSweep";
import { DEFAULT_WICK_CONFIG } from "../server/modules/zenny/decision/wick/defaultConfig";
import { DEFAULT_REACH_CONFIG } from "../server/modules/zenny/decision/reach/defaultConfig";
import type { EntryStyle } from "../server/modules/zenny/decision/wick/types";
import type { BacktestConfig } from "../server/modules/zenny/backtest/runBacktest";
import type { Timeframe } from "../shared/zennyTypes";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const TFS: Timeframe[] = ["15m", "1H", "4H", "12H", "D", "W", "M"];

// REACH off everywhere — isolate the fade.
const reachOff = { ...DEFAULT_REACH_CONFIG, allowedPlaybooks: [] as never[] };

function mk(entry: EntryStyle, bufferPct: number, rrFloor: number): SweepVariant {
  const config: BacktestConfig = {
    reachConfig: reachOff,
    wickConfig: {
      ...DEFAULT_WICK_CONFIG,
      regimeMatrix: {
        ranging: [entry],
        accumulation: [entry],
        trending: [],
        breakout: [],
      },
      buffer: { ...DEFAULT_WICK_CONFIG.buffer, percentage: bufferPct },
      minRiskRewardRatio: rrFloor,
    },
  };
  return { label: `${entry}|buf${bufferPct}|rr${rrFloor}`, config };
}

// Coordinate sweep from the current baseline (midpoint, 0.2% buffer, R:R≥1),
// plus a combined "diagnosis fix" guess (under-touching, wider stop, R:R≥2).
const entries: EntryStyle[] = ["under-touching", "midpoint", "extreme", "beyond"];
const buffers = [0.002, 0.005, 0.01];
const rrFloors = [1.0, 1.5, 2.0, 3.0];

const seen = new Set<string>();
const variants: SweepVariant[] = [];
const add = (v: SweepVariant) => {
  if (!seen.has(v.label)) {
    seen.add(v.label);
    variants.push(v);
  }
};
for (const e of entries) add(mk(e, 0.002, 1.0)); // entry sweep
for (const b of buffers) add(mk("midpoint", b, 1.0)); // stop-width sweep
for (const r of rrFloors) add(mk("midpoint", 0.002, r)); // R:R sweep
add(mk("under-touching", 0.005, 2.0)); // combined fix guess

const binance = new BinanceProvider(DEFAULT_INFRASTRUCTURE_CONFIG);
const mock = new MockProvider();
console.log("Fetching history…");
for (const s of SYMBOLS) {
  for (const tf of TFS) {
    try {
      mock.setCandles(s, tf, await binance.getCandles({ symbol: s, timeframe: tf, count: 1000 }));
    } catch (e) {
      console.log(`  fetch failed ${s} ${tf}`);
    }
  }
}

const now = Date.now();
const base = {
  provider: mock,
  symbols: SYMBOLS,
  timeframe: "15m" as Timeframe,
  fromMs: now - 6 * 24 * 60 * 60 * 1000,
  toMs: now,
  startingEquity: 500,
};

console.log(`Sweeping ${variants.length} configs over last 6 days (${SYMBOLS.join(", ")})…\n`);
const ranked = await runSweep(base, variants, (done, total, label) => {
  console.log(`  [${done}/${total}] ${label} done`);
});

console.log("\n=== RANKED (best score first) ===");
console.log("score%  ret%   trades  win%   PF     maxDD%  config");
for (const r of ranked) {
  const s = r.summary;
  console.log(
    `${s.score.toFixed(2).padStart(6)}  ${s.pnlPct.toFixed(2).padStart(5)}  ${String(s.trades).padStart(6)}  ${(s.winRate !== null ? (s.winRate * 100).toFixed(0) : "—").padStart(4)}  ${(s.profitFactor !== null ? s.profitFactor.toFixed(2) : "—").padStart(5)}  ${s.maxDrawdownPct.toFixed(1).padStart(6)}  ${r.label}`,
  );
}
const best = ranked[0];
console.log(`\n=== WINNER: ${best.label}  →  ${best.summary.pnlPct.toFixed(2)}% (${best.summary.trades} trades, ${best.summary.winRate !== null ? (best.summary.winRate * 100).toFixed(0) : "—"}% win, PF ${best.summary.profitFactor?.toFixed(2) ?? "—"})`);
process.exit(0);
