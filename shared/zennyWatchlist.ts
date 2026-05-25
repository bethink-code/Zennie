// Single source of truth for the symbols the paper runner watches and the
// Braid UI offers as quick-switch options. Server (PAPER_TRADE_WATCHLIST) and
// client (symbol picker) both import this so they can never drift.

export const WATCHLIST_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
] as const;

// Quote assets we recognise so a bare base symbol can be normalised. Typing
// "SOL" should resolve to "SOLUSDT"; "ETHUSDC" is left alone.
const KNOWN_QUOTES = ["USDT", "USDC", "FDUSD", "BUSD", "USD", "BTC", "ETH"];

// Forgiving symbol normaliser for the picker: uppercases and appends USDT when
// the input is a bare base asset with no recognised quote suffix.
export function normaliseSymbol(raw: string): string {
  const s = raw.trim().toUpperCase();
  if (!s) return s;
  if (KNOWN_QUOTES.some((q) => s.endsWith(q))) return s;
  return `${s}USDT`;
}
