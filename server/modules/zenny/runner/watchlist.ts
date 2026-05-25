// Paper-trade watchlist + per-cron driver.
//
// One shared definition of which (symbol, timeframe) streams the paper runner
// ticks, used by both the cron route and local scripts so the basket can never
// drift between them. v0 keeps this hardcoded; Phase 6 sources it from the
// admin-curated market_pairs registry (PRD §13).
//
// 15m is the designated trading timeframe (HTFs are confluence only). The
// hourly cron batches every closed 15m bar per tick (see runPaperTradeTick),
// so cadence is decoupled from this timeframe.

import type { Timeframe } from "../../../../shared/zennyTypes";
import { WATCHLIST_SYMBOLS } from "../../../../shared/zennyWatchlist";
import type { MarketDataProvider } from "../infrastructure/providers/providerInterface";
import { runPaperTradeTick } from "./runPaperTradeTick";

export const PAPER_TRADE_WATCHLIST: Array<{
  symbol: string;
  timeframe: Timeframe;
}> = WATCHLIST_SYMBOLS.map((symbol) => ({ symbol, timeframe: "15m" }));

// Tick every watched stream. Per-stream failures are isolated so one bad
// symbol can't abort the rest of the basket.
export async function runPaperTradeWatchlistTick(provider: MarketDataProvider) {
  const results = [];
  for (const watch of PAPER_TRADE_WATCHLIST) {
    try {
      const r = await runPaperTradeTick({
        provider,
        symbol: watch.symbol,
        timeframe: watch.timeframe,
      });
      results.push(r);
    } catch (e) {
      results.push({
        symbol: watch.symbol,
        timeframe: watch.timeframe,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return results;
}
