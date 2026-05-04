// Fetch Binance Futures Open Interest history for a (symbol, interval)
// since startTime. Pure: no DB. Caller paginates / persists.

export interface BinanceOIRow {
  symbol: string;
  timestamp: Date;
  openInterest: string;
  openInterestValue: string;
  interval: string;
}

const BASE = "https://fapi.binance.com";

export async function fetchBinanceOI(
  symbol: string,
  interval: string,
  startTime: number,
): Promise<BinanceOIRow[]> {
  const url = `${BASE}/futures/data/openInterestHist?symbol=${symbol}&period=${interval}&startTime=${startTime}&limit=500`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`OI fetch ${resp.status}: ${url.split("?")[0]}`);
  }
  const data = await resp.json();
  if (!Array.isArray(data)) return [];
  return data.map((d: any) => ({
    symbol,
    timestamp: new Date(d.timestamp),
    openInterest: String(d.sumOpenInterest),
    openInterestValue: String(d.sumOpenInterestValue),
    interval,
  }));
}
