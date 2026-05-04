// Cross-check Hyblock OHLC data against Binance klines API
// Run: doppler run -- npx tsx scripts/verify-hyblock.ts

import { db } from "../server/db";
import { hyblockOhlc } from "../shared/schema";
import { eq, and, asc } from "drizzle-orm";

async function main() {
  // Get first 5 and last 5 BTC daily bars from Hyblock
  const first5 = await db
    .select()
    .from(hyblockOhlc)
    .where(and(eq(hyblockOhlc.coin, "btc"), eq(hyblockOhlc.exchange, "binance")))
    .orderBy(asc(hyblockOhlc.barTime))
    .limit(5);

  console.log("Cross-checking Hyblock OHLC vs Binance klines (BTC daily)\n");
  console.log("Date         | Source   | Open      | High      | Low       | Close");
  console.log("-------------|----------|-----------|-----------|-----------|----------");

  let matches = 0;
  let mismatches = 0;

  for (const r of first5) {
    const ms = r.barTime.getTime();
    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1d&startTime=${ms}&endTime=${ms + 86399999}&limit=1`;
    const resp = await fetch(url);
    const data = await resp.json();
    const date = r.barTime.toISOString().slice(0, 10);

    console.log(
      `${date} | Hyblock  | ${Number(r.open).toFixed(1).padStart(9)} | ${Number(r.high).toFixed(1).padStart(9)} | ${Number(r.low).toFixed(1).padStart(9)} | ${Number(r.close).toFixed(1).padStart(9)}`,
    );

    if (data?.[0]) {
      const k = data[0];
      const bO = Number(k[1]);
      const bH = Number(k[2]);
      const bL = Number(k[3]);
      const bC = Number(k[4]);

      console.log(
        `${date} | Binance  | ${bO.toFixed(1).padStart(9)} | ${bH.toFixed(1).padStart(9)} | ${bL.toFixed(1).padStart(9)} | ${bC.toFixed(1).padStart(9)}`,
      );

      const dO = Math.abs(Number(r.open) - bO);
      const dH = Math.abs(Number(r.high) - bH);
      const dL = Math.abs(Number(r.low) - bL);
      const dC = Math.abs(Number(r.close) - bC);
      const ok = dO < 5 && dH < 5 && dL < 5 && dC < 5;

      console.log(
        `             | ${ok ? "MATCH  " : "MISMATCH"} | d=${dO.toFixed(2).padStart(8)} | d=${dH.toFixed(2).padStart(8)} | d=${dL.toFixed(2).padStart(8)} | d=${dC.toFixed(2).padStart(8)}`,
      );
      console.log("-------------|----------|-----------|-----------|-----------|----------");

      if (ok) matches++;
      else mismatches++;
    }

    // Rate limit
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\nResult: ${matches} matches, ${mismatches} mismatches out of ${first5.length} bars`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
