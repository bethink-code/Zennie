import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  const tables = [
    "hyblock_captures",
    "hyblock_ohlc",
    "hyblock_liq_levels",
    "binance_oi",
    "binance_funding_rates",
    "binance_long_short_ratio",
  ];
  console.log("=== Database Summary ===\n");
  for (const t of tables) {
    const result = await db.execute(sql.raw(`SELECT count(*) as c FROM ${t}`));
    const rows = result.rows ?? result;
    const count = Array.isArray(rows) ? (rows[0] as any)?.c : (rows as any)?.c;
    console.log(`${t.padEnd(30)} ${String(count).padStart(8)} rows`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
