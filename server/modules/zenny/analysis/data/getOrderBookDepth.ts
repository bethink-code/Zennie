// GetOrderBookDepth — thin wrapper over MarketDataProvider for fetching
// a depth snapshot. Mirrors getCandles. Pure delegation; no caching, no
// transformation. The provider abstraction is what makes this testable
// (swap in MockProvider, return canned snapshots).

import type {
  MarketDataProvider,
  OrderBookDepthQuery,
} from "../../infrastructure/providers/providerInterface";
import type { RawOrderBookDepth } from "../orderbook/types";

export async function getOrderBookDepth(
  provider: MarketDataProvider,
  query: OrderBookDepthQuery,
): Promise<RawOrderBookDepth> {
  return provider.getOrderBookDepth(query);
}
