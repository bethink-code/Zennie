// debug-4h-pivots.ts — list every 4H pivot in the 50-candle window the
// user is looking at, broken or alive, with prices and candle indexes.
// Helps diagnose "I expected a level at $X but don't see it" cases.
//
// Usage: doppler run --config dev -- npx tsx scripts/debug-4h-pivots.ts

import { BinanceProvider } from "../server/modules/zenny/infrastructure/providers/binanceProvider";
import { DEFAULT_INFRASTRUCTURE_CONFIG } from "../server/modules/zenny/infrastructure/types";
import { getCandles } from "../server/modules/zenny/analysis/data/getCandles";
import { findBodyPivots } from "../server/modules/zenny/analysis/level/findBodyPivots";
import { isLevelBroken } from "../server/modules/zenny/analysis/level/isLevelBroken";
import { findLastLegSwings } from "../server/modules/zenny/analysis/passes/lastLegPass";
import { findBodyClusters } from "../server/modules/zenny/analysis/level/findBodyClusters";

async function main() {
  const provider = new BinanceProvider(DEFAULT_INFRASTRUCTURE_CONFIG);
  const count = parseInt(process.env.COUNT || "50", 10);
  const candles = await getCandles(provider, {
    symbol: "BTCUSDT",
    timeframe: "4H",
    count,
  });

  console.log(`4H BTCUSDT, ${candles.length} candles\n`);
  console.log("All pivots (n=2, body extremes):");
  const pivots = findBodyPivots({ candles, n: 2 });
  for (const p of pivots) {
    const broken = isLevelBroken(candles, p);
    const tag = p.side === "RESISTANCE" ? "R" : "S";
    const status = broken.broken
      ? `broken at idx ${broken.breakCandleIndex}`
      : "ALIVE";
    console.log(
      `  idx ${p.index.toString().padStart(2)} ${tag} body=$${p.price.toFixed(0).padStart(6)} wick=$${p.wickPrice.toFixed(0).padStart(6)}  ${status}`,
    );
  }

  console.log("\nAll ZigZag swings (reversalPct=0.015):");
  const swings = findLastLegSwings(candles, 0.015);
  for (const s of swings) {
    console.log(
      `  idx ${s.index.toString().padStart(2)} ${s.type === "high" ? "H" : "L"} @ $${s.price.toFixed(0)}`,
    );
  }

  console.log("\nBody clusters (tolerancePct=0.004, minTouches=3):");
  const clusters = findBodyClusters({ candles });
  for (const c of clusters) {
    console.log(
      `  ${c.side === "RESISTANCE" ? "R" : "S"} @ $${c.price.toFixed(0)} touches=${c.touchCount} first=idx${c.firstTouchIndex} last=idx${c.lastTouchIndex}`,
    );
  }

  console.log("\nCandles near interesting prices ($77.4K, $78.6K, $79.4K):");
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const bodyHigh = Math.max(c.open, c.close);
    const bodyLow = Math.min(c.open, c.close);
    const near77 = bodyHigh >= 77100 && bodyLow <= 77600;
    const near78 = bodyHigh >= 78400 && bodyLow <= 78900;
    const near79 = bodyHigh >= 79100 && bodyLow <= 79500;
    if (near77 || near78 || near79) {
      console.log(
        `  idx ${i.toString().padStart(2)} O=$${c.open.toFixed(0)} H=$${c.high.toFixed(0)} L=$${c.low.toFixed(0)} C=$${c.close.toFixed(0)} bodyH=$${bodyHigh.toFixed(0)} bodyL=$${bodyLow.toFixed(0)}`,
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
