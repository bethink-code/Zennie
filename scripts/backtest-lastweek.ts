// Backtest the new strategy over the last ~6 days on real Binance candles,
// to compare against the live paper account's actual result (the old logic).
// Throwaway diagnostic.
import { BinanceProvider } from "../server/modules/zenny/infrastructure/providers/binanceProvider";
import { DEFAULT_INFRASTRUCTURE_CONFIG } from "../server/modules/zenny/infrastructure/types";
import { MockProvider } from "../server/modules/zenny/infrastructure/providers/mockProvider";
import { runBacktest } from "../server/modules/zenny/backtest/runBacktest";
import type { Timeframe } from "../shared/zennyTypes";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const TFS: Timeframe[] = ["15m", "1H", "4H", "12H", "D", "W", "M"];

const binance = new BinanceProvider(DEFAULT_INFRASTRUCTURE_CONFIG);
const mock = new MockProvider();

console.log("Fetching history…");
for (const s of SYMBOLS) {
  for (const tf of TFS) {
    try {
      const candles = await binance.getCandles({ symbol: s, timeframe: tf, count: 1000 });
      mock.setCandles(s, tf, candles);
    } catch (e) {
      console.log(`  fetch failed ${s} ${tf}: ${e}`);
    }
  }
}

const now = Date.now();
const fromMs = now - 6 * 24 * 60 * 60 * 1000;

console.log(`Replaying ${SYMBOLS.join(", ")} over last 6 days…`);
const result = await runBacktest({
  provider: mock,
  symbols: SYMBOLS,
  timeframe: "15m",
  fromMs,
  toMs: now,
  startingEquity: 500,
  // current settings (defaults) — the FACTUAL baseline
});

const s = result.summary;
console.log("\n=== BACKTEST (new strategy, current settings) ===");
console.log(`equity:   $${result.startingEquity} → $${result.finalEquity.toFixed(2)}  (${s.pnlPct.toFixed(2)}%)`);
console.log(`trades:   ${s.trades}  (${s.wins}W / ${s.losses}L)  winRate ${s.winRate !== null ? (s.winRate * 100).toFixed(1) + "%" : "—"}`);
console.log(`expectancy/trade: $${s.expectancy?.toFixed(2) ?? "—"}  profitFactor ${s.profitFactor?.toFixed(2) ?? "—"}  maxDD ${s.maxDrawdownPct.toFixed(1)}%`);
console.log(`score:    ${s.score.toFixed(2)}`);
console.log("\n=== vs OLD live account (actual, same week) ===");
console.log(`equity $500 → ~$475.66 (-4.87%), 51 trades, 14W/37L (27.5%)`);

console.log("\n--- backtest trades ---");
for (const t of result.trades) {
  console.log(
    `  ${t.symbol.padEnd(8)} ${t.phase} ${t.side} entry ${t.fillPrice?.toFixed(2) ?? "—"} exit ${t.closePrice?.toFixed(2) ?? "—"} ${t.exitReason ?? ""} pnl $${(t.realisedPnl ?? 0).toFixed(2)}`,
  );
}
process.exit(0);
