// Local one-shot integration test of the paper-trade tick. Bypasses the
// Express server / cron auth — calls runPaperTradeTick directly against
// the configured DATABASE_URL.
//
// Usage:  doppler run -- npx tsx scripts/test-paper-trade-tick.ts

import { BinanceProvider } from "../server/modules/zenny/infrastructure/providers/binanceProvider";
import { DEFAULT_INFRASTRUCTURE_CONFIG } from "../server/modules/zenny/infrastructure/types";
import { runPaperTradeTick } from "../server/modules/zenny/runner/runPaperTradeTick";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set. Run via doppler.");
    process.exit(1);
  }

  const provider = new BinanceProvider(DEFAULT_INFRASTRUCTURE_CONFIG);

  const result = await runPaperTradeTick({
    provider,
    symbol: "BTCUSDT",
    timeframe: "1H",
  });

  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
