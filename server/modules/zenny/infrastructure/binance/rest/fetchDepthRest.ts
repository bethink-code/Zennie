// Fetch order book depth snapshot from Binance Futures REST API.
// Mirrors fetchKlinesRest — same makeRestRequest path for rate limiting,
// retries, circuit breaker.
//
// Returns RawOrderBookDepth — the canonical shape used by the depth
// analysis module. The Binance response is parsed (string price/qty
// → number) here so analysis code never sees raw strings.
//
// Two-self-standing-models: this fetcher knows nothing about levels.
// It just retrieves a depth snapshot at a moment in time. Aggregation
// and rendering live in their own modules.

import type { RawOrderBookDepth } from "../../../analysis/orderbook/types";
import { makeRestRequest, type RestDeps } from "./makeRestRequest";

const BINANCE_FUTURES_BASE = "https://fapi.binance.com";

export interface FetchDepthInput {
  symbol: string;
  // Binance accepts: 5, 10, 20, 50, 100, 500, 1000. Any other value is
  // rejected. We default to 1000 (deepest) so the gradient gets the
  // full ladder; weight cost is 20.
  limit?: 5 | 10 | 20 | 50 | 100 | 500 | 1000;
}

interface BinanceDepthResponse {
  lastUpdateId: number;
  E?: number; // message output time (futures only)
  T?: number; // transaction time (futures only)
  bids: Array<[string, string]>;
  asks: Array<[string, string]>;
}

// Binance weight: 2 for limit ≤50, 5 for 100, 10 for 500, 20 for 1000.
function weightForLimit(limit: number): number {
  if (limit <= 50) return 2;
  if (limit <= 100) return 5;
  if (limit <= 500) return 10;
  return 20;
}

export async function fetchDepthRest(
  input: FetchDepthInput,
  deps: RestDeps,
): Promise<RawOrderBookDepth> {
  const limit = input.limit ?? 1000;
  const params = new URLSearchParams({
    symbol: input.symbol.toUpperCase(),
    limit: String(limit),
  });
  const url = `${BINANCE_FUTURES_BASE}/fapi/v1/depth?${params.toString()}`;

  const resp = await makeRestRequest<BinanceDepthResponse>(
    {
      url,
      method: "GET",
      weightCost: weightForLimit(limit),
      endpoint: "GET /fapi/v1/depth",
    },
    deps,
  );

  return {
    symbol: input.symbol.toUpperCase(),
    lastUpdateId: resp.lastUpdateId,
    fetchedAtMs: deps.nowMs(),
    bids: resp.bids.map(([p, q]): [number, number] => [parseFloat(p), parseFloat(q)]),
    asks: resp.asks.map(([p, q]): [number, number] => [parseFloat(p), parseFloat(q)]),
  };
}
