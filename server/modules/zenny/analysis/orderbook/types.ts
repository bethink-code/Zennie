// Order book depth — shared types for the depth analysis subsystem.
//
// Two-self-standing-models principle: this module is independent of the
// ZigZag level detector. They render side-by-side on the same canvas but
// share no code, no scoring, and no merge logic. The visual cross-check
// happens in the human eye, not in the data layer.

// Raw depth snapshot from Binance /fapi/v1/depth.
// Each entry is [price, quantity in BTC]. Bids descend from best bid;
// asks ascend from best ask.
export interface RawOrderBookDepth {
  symbol: string;
  lastUpdateId: number;
  fetchedAtMs: number;
  bids: Array<[number, number]>; // [price, qty]
  asks: Array<[number, number]>;
}

// One bucket in the aggregated depth gradient. Bid and ask sizes are
// kept separate so the renderer can colour them differently if needed
// and so the inspection panel can show the bid/ask split.
export interface DepthBucket {
  priceLow: number;
  priceHigh: number;
  bidSizeUsd: number;
  askSizeUsd: number;
  totalSizeUsd: number;
}

// Output of aggregateDepthIntoBuckets — the shape the canvas renders
// and the route returns.
export interface DepthSnapshot {
  symbol: string;
  fetchedAtMs: number;
  // Mid price at snapshot time (best bid + best ask) / 2. Used by the
  // gradient renderer to visually anchor "now" on the price axis.
  midPrice: number;
  // Price range the buckets span. Set by the caller — usually matches
  // the chart's visible Y-range so the gradient lines up with candles.
  priceLow: number;
  priceHigh: number;
  buckets: DepthBucket[];
  // Maximum totalSizeUsd across all buckets — pre-computed so the
  // renderer doesn't have to scan the array to normalise opacity.
  maxBucketSizeUsd: number;
}
