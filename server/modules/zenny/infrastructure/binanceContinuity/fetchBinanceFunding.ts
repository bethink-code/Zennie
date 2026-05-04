// Fetch Binance Futures funding rate history for a symbol since startTime.
// Pure: no DB.

export interface BinanceFundingRow {
  symbol: string;
  fundingTime: Date;
  fundingRate: string;
  markPrice: string;
}

const BASE = "https://fapi.binance.com";

export async function fetchBinanceFunding(
  symbol: string,
  startTime: number,
): Promise<BinanceFundingRow[]> {
  const url = `${BASE}/fapi/v1/fundingRate?symbol=${symbol}&startTime=${startTime}&limit=1000`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Funding fetch ${resp.status}: ${url.split("?")[0]}`);
  }
  const data = await resp.json();
  if (!Array.isArray(data)) return [];
  return data.map((d: any) => ({
    symbol,
    fundingTime: new Date(d.fundingTime),
    fundingRate: String(d.fundingRate),
    markPrice: String(d.markPrice ?? "0"),
  }));
}
