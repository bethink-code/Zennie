// MarketDataProvider — the interface analysis/ depends on.
// Three implementations: BinanceProvider (real), ReplayProvider (historical), MockProvider (test).
// Analysis functions take this interface as a parameter so they're testable without network.

import type { Candle, Timeframe } from "../../../../../shared/zennyTypes";
import type { RawOrderBookDepth } from "../../analysis/orderbook/types";

export interface CandleQuery {
  symbol: string;
  timeframe: Timeframe;
  count: number;
  endTimeMs?: number; // optional: latest candle to include (defaults to "latest available")
}

export interface OrderBookDepthQuery {
  symbol: string;
  // Binance allowed values: 5, 10, 20, 50, 100, 500, 1000. Default 1000.
  limit?: 5 | 10 | 20 | 50 | 100 | 500 | 1000;
}

export interface MarketDataProvider {
  // Fetch historical/recent candles. Closed candles only — current forming candle excluded.
  getCandles(query: CandleQuery): Promise<Candle[]>;

  // Fetch a single order-book depth snapshot. No caching by default —
  // depth is realtime and a stale snapshot is worse than no snapshot.
  // The implementation MAY cache for sub-second windows if rate limits
  // demand it, but should default to fresh.
  getOrderBookDepth(query: OrderBookDepthQuery): Promise<RawOrderBookDepth>;

  // Provider name for logging/diagnostics.
  readonly name: "binance" | "replay" | "mock";
}
