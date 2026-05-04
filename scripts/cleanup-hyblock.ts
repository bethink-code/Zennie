// Clean up Hyblock harvest: fix exchange field, remove duplicate captures
// Run: doppler run -- npx tsx scripts/cleanup-hyblock.ts

import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  // 1. Fix exchange field: '{"binance"}' -> 'binance'
  await db.execute(
    sql`UPDATE hyblock_captures SET exchange = 'binance' WHERE exchange != 'binance'`,
  );
  await db.execute(
    sql`UPDATE hyblock_ohlc SET exchange = 'binance' WHERE exchange != 'binance'`,
  );
  await db.execute(
    sql`UPDATE hyblock_liq_levels SET exchange = 'binance' WHERE exchange != 'binance'`,
  );
  console.log("Fixed exchange fields");

  // 2. Remove duplicate captures (keep earliest per coin+lookback)
  const dupes = await db.execute(sql`
    DELETE FROM hyblock_captures
    WHERE id NOT IN (
      SELECT DISTINCT ON (coin, lookback) id
      FROM hyblock_captures
      ORDER BY coin, lookback, captured_at ASC
    )
    RETURNING coin, lookback
  `);
  const dupeRows = dupes.rows ?? dupes ?? [];
  console.log(`Removed ${Array.isArray(dupeRows) ? dupeRows.length : 0} duplicate captures`);
  if (Array.isArray(dupeRows)) {
    for (const d of dupeRows) console.log(`  - ${(d as any).coin} / ${(d as any).lookback}`);
  }

  // 3. Final count
  const remaining = await db.execute(
    sql`SELECT coin, lookback, bar_count, captured_at FROM hyblock_captures ORDER BY lookback, coin`,
  );
  const rows = remaining.rows ?? remaining ?? [];
  console.log(`\nFinal: ${Array.isArray(rows) ? rows.length : 0} captures`);
  for (const r of (Array.isArray(rows) ? rows : []) as any[])
    console.log(`  ${r.coin.toUpperCase().padEnd(8)} / ${r.lookback.padEnd(10)} — ${r.bar_count} bars`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
