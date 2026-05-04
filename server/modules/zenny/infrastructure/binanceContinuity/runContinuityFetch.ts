// Idempotent incremental Binance continuity fetch. For each tracked symbol
// and interval, finds the latest stored timestamp, fetches anything newer
// from Binance, appends. Safe to re-run; never duplicates.

import { and, eq, sql } from "drizzle-orm";
import { db } from "../../../../db";
import {
  binanceOi,
  binanceFundingRates,
  binanceLongShortRatio,
} from "../../../../../shared/schema";
import { fetchBinanceOI } from "./fetchBinanceOI";
import { fetchBinanceFunding } from "./fetchBinanceFunding";
import { fetchBinanceLS } from "./fetchBinanceLS";

const COINS = [
  "BTC", "ETH", "SOL", "XRP", "BNB", "SUI",
  "CRV", "HBAR", "PENDLE", "ONDO", "VET", "FET", "RSR", "RENDER",
];

const OI_LS_INTERVALS = ["1d", "4h"];

// Fallback when a (symbol, interval) has no rows yet — start 30 days back.
const DEFAULT_LOOKBACK_MS = 30 * 86400000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ContinuityFetchResult {
  startedAt: Date;
  finishedAt: Date;
  inserted: { oi: number; funding: number; ls: number };
  errors: Array<{ symbol: string; metric: string; error: string }>;
}

export async function runContinuityFetch(): Promise<ContinuityFetchResult> {
  const startedAt = new Date();
  const result: ContinuityFetchResult = {
    startedAt,
    finishedAt: startedAt,
    inserted: { oi: 0, funding: 0, ls: 0 },
    errors: [],
  };

  const fallbackStart = Date.now() - DEFAULT_LOOKBACK_MS;

  for (const coin of COINS) {
    const symbol = coin + "USDT";

    // ---- OI ----
    for (const interval of OI_LS_INTERVALS) {
      try {
        const last = await db
          .select({ ts: sql<Date>`max(${binanceOi.timestamp})` })
          .from(binanceOi)
          .where(and(eq(binanceOi.symbol, symbol), eq(binanceOi.interval, interval)));
        const start = last[0]?.ts ? new Date(last[0].ts).getTime() + 1 : fallbackStart;
        const rows = await fetchBinanceOI(symbol, interval, start);
        const fresh = rows.filter((r) => r.timestamp.getTime() >= start);
        for (let i = 0; i < fresh.length; i += 200) {
          await db.insert(binanceOi).values(fresh.slice(i, i + 200));
        }
        result.inserted.oi += fresh.length;
      } catch (e: any) {
        result.errors.push({ symbol, metric: `oi:${interval}`, error: e.message });
      }
      await sleep(250);
    }

    // ---- Funding ----
    try {
      const last = await db
        .select({ ts: sql<Date>`max(${binanceFundingRates.fundingTime})` })
        .from(binanceFundingRates)
        .where(eq(binanceFundingRates.symbol, symbol));
      const start = last[0]?.ts ? new Date(last[0].ts).getTime() + 1 : fallbackStart;
      const rows = await fetchBinanceFunding(symbol, start);
      const fresh = rows.filter((r) => r.fundingTime.getTime() >= start);
      for (let i = 0; i < fresh.length; i += 200) {
        await db.insert(binanceFundingRates).values(fresh.slice(i, i + 200));
      }
      result.inserted.funding += fresh.length;
    } catch (e: any) {
      result.errors.push({ symbol, metric: "funding", error: e.message });
    }
    await sleep(250);

    // ---- LS ----
    for (const interval of OI_LS_INTERVALS) {
      try {
        const last = await db
          .select({ ts: sql<Date>`max(${binanceLongShortRatio.timestamp})` })
          .from(binanceLongShortRatio)
          .where(
            and(
              eq(binanceLongShortRatio.symbol, symbol),
              eq(binanceLongShortRatio.interval, interval),
            ),
          );
        const start = last[0]?.ts ? new Date(last[0].ts).getTime() + 1 : fallbackStart;
        const rows = await fetchBinanceLS(symbol, interval, start);
        const fresh = rows.filter((r) => r.timestamp.getTime() >= start);
        for (let i = 0; i < fresh.length; i += 200) {
          await db.insert(binanceLongShortRatio).values(fresh.slice(i, i + 200));
        }
        result.inserted.ls += fresh.length;
      } catch (e: any) {
        result.errors.push({ symbol, metric: `ls:${interval}`, error: e.message });
      }
      await sleep(250);
    }
  }

  result.finishedAt = new Date();
  return result;
}
