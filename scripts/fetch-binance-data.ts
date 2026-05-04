// Fetch Open Interest, Funding Rates, and Long/Short Ratios from Binance
// for all 14 coins. Binance gives ~30 days of history for OI/LS, and
// longer for funding rates.
//
// Run: doppler run -- npx tsx scripts/fetch-binance-data.ts

import { db } from "../server/db";
import { binanceOi, binanceFundingRates, binanceLongShortRatio } from "../shared/schema";
import { sql } from "drizzle-orm";

const COINS = [
  "BTC", "ETH", "SOL", "XRP", "BNB", "SUI",
  "CRV", "HBAR", "PENDLE", "ONDO", "VET", "FET", "RSR", "RENDER",
];

function toSymbol(coin: string): string {
  return coin.toUpperCase() + "USDT";
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url: string): Promise<any> {
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${resp.status} ${url.split("?")[0]}: ${text.slice(0, 200)}`);
  }
  return resp.json();
}

// ---------- Open Interest History ----------
// /futures/data/openInterestHist — max 30 days, intervals: 5m,15m,30m,1h,2h,4h,6h,12h,1d
async function fetchOI(coin: string) {
  const symbol = toSymbol(coin);
  // Fetch daily OI for 30 days, then 4h for 30 days
  for (const interval of ["1d", "4h"]) {
    const url = `https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=${interval}&limit=500`;
    try {
      const data = await fetchJson(url);
      if (!Array.isArray(data) || data.length === 0) {
        console.log(`  OI ${symbol} ${interval}: no data`);
        continue;
      }
      const rows = data.map((d: any) => ({
        symbol,
        timestamp: new Date(d.timestamp),
        openInterest: d.sumOpenInterest,
        openInterestValue: d.sumOpenInterestValue,
        interval,
      }));
      for (let i = 0; i < rows.length; i += 200) {
        await db.insert(binanceOi).values(rows.slice(i, i + 200));
      }
      console.log(`  OI ${symbol} ${interval}: ${rows.length} rows`);
    } catch (e: any) {
      console.log(`  OI ${symbol} ${interval}: ERROR - ${e.message}`);
    }
    await sleep(300);
  }
}

// ---------- Funding Rates ----------
// /fapi/v1/fundingRate — up to 1000 entries, pageable
async function fetchFunding(coin: string) {
  const symbol = toSymbol(coin);
  let allRows: any[] = [];
  let startTime = Date.now() - 90 * 86400000; // 90 days back

  while (true) {
    const url = `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&startTime=${startTime}&limit=1000`;
    try {
      const data = await fetchJson(url);
      if (!Array.isArray(data) || data.length === 0) break;
      const rows = data.map((d: any) => ({
        symbol,
        fundingTime: new Date(d.fundingTime),
        fundingRate: d.fundingRate,
        markPrice: d.markPrice || "0",
      }));
      allRows.push(...rows);
      if (data.length < 1000) break;
      startTime = data[data.length - 1].fundingTime + 1;
    } catch (e: any) {
      console.log(`  Funding ${symbol}: ERROR - ${e.message}`);
      break;
    }
    await sleep(200);
  }

  if (allRows.length > 0) {
    for (let i = 0; i < allRows.length; i += 200) {
      await db.insert(binanceFundingRates).values(allRows.slice(i, i + 200));
    }
  }
  console.log(`  Funding ${symbol}: ${allRows.length} rows`);
}

// ---------- Long/Short Account Ratio ----------
// /futures/data/globalLongShortAccountRatio — max 30 days
async function fetchLSRatio(coin: string) {
  const symbol = toSymbol(coin);
  for (const period of ["1d", "4h"]) {
    const url = `https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=${period}&limit=500`;
    try {
      const data = await fetchJson(url);
      if (!Array.isArray(data) || data.length === 0) {
        console.log(`  LS ${symbol} ${period}: no data`);
        continue;
      }
      const rows = data.map((d: any) => ({
        symbol,
        timestamp: new Date(d.timestamp),
        longShortRatio: d.longShortRatio,
        longAccount: d.longAccount,
        shortAccount: d.shortAccount,
        interval: period,
      }));
      for (let i = 0; i < rows.length; i += 200) {
        await db.insert(binanceLongShortRatio).values(rows.slice(i, i + 200));
      }
      console.log(`  LS ${symbol} ${period}: ${rows.length} rows`);
    } catch (e: any) {
      console.log(`  LS ${symbol} ${period}: ERROR - ${e.message}`);
    }
    await sleep(300);
  }
}

// ---------- Main ----------
async function main() {
  console.log(`Fetching Binance data for ${COINS.length} coins...\n`);

  for (const coin of COINS) {
    console.log(`\n--- ${coin} ---`);
    await fetchOI(coin);
    await fetchFunding(coin);
    await fetchLSRatio(coin);
  }

  // Summary
  const [oiCount] = await db.execute(sql`SELECT count(*) as c FROM binance_oi`);
  const [frCount] = await db.execute(sql`SELECT count(*) as c FROM binance_funding_rates`);
  const [lsCount] = await db.execute(sql`SELECT count(*) as c FROM binance_long_short_ratio`);
  console.log("\n=== DONE ===");
  console.log(`OI rows: ${(oiCount as any).c}`);
  console.log(`Funding rate rows: ${(frCount as any).c}`);
  console.log(`Long/Short ratio rows: ${(lsCount as any).c}`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
