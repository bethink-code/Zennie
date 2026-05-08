// Exchange adapter interface. Concrete implementations (Binance, Bybit) live
// in sibling files. Only fetchSymbols is consumed today (admin pair registry
// in routes.ts) — fetchCandles + fetchPrice are kept for callers that may
// land before the Zenny infrastructure provider takes over fully.

export type Timeframe = "15m" | "1h" | "4h" | "12h" | "1d";

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export interface ExchangeAdapter {
  readonly name: string;

  // Fetch N most recent closed candles for a pair + timeframe. Used by the
  // bot runner on every tick and by the backtest replay.
  fetchCandles(args: {
    symbol: string; // e.g. "BTCUSDT"
    timeframe: Timeframe;
    limit: number;
    endTime?: number; // ms — fetch candles ending at or before this time
  }): Promise<Candle[]>;

  // Last traded price — used as a fallback when candles haven't closed yet.
  fetchPrice(symbol: string): Promise<number>;
}
