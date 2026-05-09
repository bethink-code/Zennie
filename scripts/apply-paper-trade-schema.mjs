// One-off: apply the paper-trading schema additions (zenny_paper_positions,
// zenny_paper_account, zenny_paper_tick_log) to the connected Neon DB.
//
// Idempotent — uses CREATE TABLE IF NOT EXISTS so re-runs are safe.
// Run via:    doppler run -- node scripts/apply-paper-trade-schema.mjs
// For prod:   doppler run --config prd -- node scripts/apply-paper-trade-schema.mjs

import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set. Run via `doppler run`.");
  process.exit(1);
}

const url = process.env.DATABASE_URL.replace(
  /[&?]channel_binding=require/,
  "",
);

const pool = new Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  max: 2,
});

const SQL = `
CREATE TABLE IF NOT EXISTS zenny_paper_positions (
  id text PRIMARY KEY,
  symbol varchar(32) NOT NULL,
  timeframe varchar(8) NOT NULL,
  phase varchar(8) NOT NULL DEFAULT 'take',
  side varchar(8) NOT NULL,
  entry_price numeric(20, 8) NOT NULL,
  stop_price numeric(20, 8) NOT NULL,
  target_price numeric(20, 8) NOT NULL,
  risk_pct numeric(8, 4) NOT NULL,
  size_multiplier numeric(8, 4) NOT NULL,
  size numeric(24, 8),
  notional numeric(24, 8),
  emitted_at_bar_ts numeric(20, 0) NOT NULL,
  submitted_at_bar_ts numeric(20, 0),
  filled_at_bar_ts numeric(20, 0),
  closed_at_bar_ts numeric(20, 0),
  fill_price numeric(20, 8),
  close_price numeric(20, 8),
  realised_pnl numeric(24, 8),
  status varchar(16) NOT NULL,
  exit_reason varchar(32),
  rejection_reason text,
  last_evaluated_at numeric(20, 0) NOT NULL,
  playbook varchar(16),
  anchor_pool_id text,
  rationale jsonb,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS zenny_paper_pos_symbol_tf_status_idx
  ON zenny_paper_positions USING btree (symbol, timeframe, status);

CREATE INDEX IF NOT EXISTS zenny_paper_pos_status_idx
  ON zenny_paper_positions USING btree (status);

-- Idempotent column add for previously-deployed instances
ALTER TABLE zenny_paper_positions
  ADD COLUMN IF NOT EXISTS phase varchar(8) NOT NULL DEFAULT 'take';

CREATE TABLE IF NOT EXISTS zenny_paper_account (
  id text PRIMARY KEY,
  starting_equity numeric(24, 8) NOT NULL,
  current_equity numeric(24, 8) NOT NULL,
  peak_equity numeric(24, 8) NOT NULL,
  kill_status varchar(16) DEFAULT 'OK' NOT NULL,
  drawdown_pct numeric(8, 4) DEFAULT '0' NOT NULL,
  kill_tripped_at timestamp,
  manual_unhalt_at timestamp,
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS zenny_paper_tick_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tick_at timestamp DEFAULT now() NOT NULL,
  symbol varchar(32) NOT NULL,
  timeframe varchar(8) NOT NULL,
  summary jsonb NOT NULL,
  error text
);

CREATE INDEX IF NOT EXISTS zenny_paper_tick_at_idx
  ON zenny_paper_tick_log USING btree (tick_at);
`;

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(SQL);
    await client.query("COMMIT");

    // Sanity — list the 3 tables to confirm.
    const r = await client.query(
      `SELECT tablename FROM pg_tables WHERE tablename LIKE 'zenny_paper_%' ORDER BY tablename`,
    );
    console.log("Tables now present:");
    for (const row of r.rows) console.log("  -", row.tablename);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Migration failed:", err);
    process.exit(2);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
