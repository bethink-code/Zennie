// Fetch Binance Futures global long/short account ratio for a
// (symbol, interval) since startTime. Pure: no DB.

export interface BinanceLSRow {
  symbol: string;
  timestamp: Date;
  longShortRatio: string;
  longAccount: string;
  shortAccount: string;
  interval: string;
}

const BASE = "https://fapi.binance.com";

export async function fetchBinanceLS(
  symbol: string,
  interval: string,
  startTime: number,
): Promise<BinanceLSRow[]> {
  const url = `${BASE}/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=${interval}&startTime=${startTime}&limit=500`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`LS fetch ${resp.status}: ${url.split("?")[0]}`);
  }
  const data = await resp.json();
  if (!Array.isArray(data)) return [];
  return data.map((d: any) => ({
    symbol,
    timestamp: new Date(d.timestamp),
    longShortRatio: String(d.longShortRatio),
    longAccount: String(d.longAccount),
    shortAccount: String(d.shortAccount),
    interval,
  }));
}
