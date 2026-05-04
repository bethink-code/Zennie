// Historical liquidation level overlay — rendered on top of the chart
// when the Order Flow column is expanded. Shows Hyblock liq levels as
// horizontal lines projecting LEFT from each bar position, with
// recency-based decay fade.
//
// Bar times from Hyblock are offset by the local timezone (stored as
// local midnight, not UTC). We correct by 2h (UTC+2, South Africa).

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Candle } from "@shared/zennyTypes";

interface LiqLevelRaw {
  barTime: number;
  side: "long" | "short";
  tier: number;
  price: number;
}

const COLORS = {
  long: "rgba(29,158,117,",   // green — long liq below price
  short: "rgba(226,75,74,",   // red — short liq above price
};

// Hyblock ISO strings were parsed in UTC+2, shift back to UTC
const TZ_OFFSET_MS = 2 * 3600 * 1000;

interface Props {
  symbol: string;
  candles: Candle[];
  chartWidth: number;
  chartHeight: number;
  priceMin: number;
  priceMax: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
  decayFactor: number; // 0–1, 1 = no decay, 0 = max decay
  onClose: () => void;
}

export function LiqOverlay({
  symbol,
  candles,
  priceMin,
  priceMax,
  padLeft,
  padRight,
  padTop,
  padBottom,
  decayFactor,
  onClose,
}: Props) {
  const coin = symbol.replace(/USDT$/i, "").toLowerCase();
  const startTime = candles.length > 0 ? candles[0].openTime : 0;
  const endTime = candles.length > 0 ? candles[candles.length - 1].openTime : 0;

  const { data } = useQuery<{ levels: LiqLevelRaw[] }>({
    queryKey: [`/api/hyblock/liq-levels?coin=${coin}&startTime=${startTime - TZ_OFFSET_MS}&endTime=${endTime + TZ_OFFSET_MS}`],
    enabled: candles.length > 0,
  });

  const N = candles.length;
  const priceRange = priceMax - priceMin;

  // Aggregate liq levels into unique price lines. For each unique price,
  // find the EARLIEST bar it appears on — that's how far left the line
  // projects from the right edge (NOW). Lines go from right edge leftward.
  const lines = useMemo(() => {
    if (!data?.levels || N === 0 || priceRange <= 0) return [];

    // Group by price (rounded to avoid float duplication)
    const priceMap = new Map<string, { price: number; side: "long" | "short"; tier: number; earliestIdx: number; latestIdx: number; count: number }>();

    // Current price = last candle close. Filter: long liq only below,
    // short liq only above. Stale historical levels on the wrong side
    // of current price are no longer relevant.
    const currentPrice = candles[candles.length - 1]?.close ?? (priceMin + priceMax) / 2;

    for (const l of data.levels) {
      if (l.price < priceMin || l.price > priceMax) continue;
      if (l.side === "long" && l.price > currentPrice) continue;
      if (l.side === "short" && l.price < currentPrice) continue;

      const correctedTime = l.barTime - TZ_OFFSET_MS;
      let closestIdx = 0;
      let closestDelta = Infinity;
      for (let i = 0; i < candles.length; i++) {
        const d = Math.abs(candles[i].openTime - correctedTime);
        if (d < closestDelta) {
          closestDelta = d;
          closestIdx = i;
        }
      }

      const key = `${l.side}-${l.tier}-${l.price.toFixed(2)}`;
      const existing = priceMap.get(key);
      if (existing) {
        existing.earliestIdx = Math.min(existing.earliestIdx, closestIdx);
        existing.latestIdx = Math.max(existing.latestIdx, closestIdx);
        existing.count++;
      } else {
        priceMap.set(key, {
          price: l.price,
          side: l.side,
          tier: l.tier,
          earliestIdx: closestIdx,
          latestIdx: closestIdx,
          count: 1,
        });
      }
    }

    // Filter out consumed levels: if any candle AFTER the level's latest
    // appearance swept through the price, that level was liquidated.
    // Short liq at price P is consumed if any candle high >= P after it.
    // Long liq at price P is consumed if any candle low <= P after it.
    //
    // Pre-compute suffix max-high and suffix min-low for O(1) lookups.
    const suffixMaxHigh = new Array(candles.length).fill(0);
    const suffixMinLow = new Array(candles.length).fill(Infinity);
    suffixMaxHigh[candles.length - 1] = candles[candles.length - 1].high;
    suffixMinLow[candles.length - 1] = candles[candles.length - 1].low;
    for (let i = candles.length - 2; i >= 0; i--) {
      suffixMaxHigh[i] = Math.max(candles[i].high, suffixMaxHigh[i + 1]);
      suffixMinLow[i] = Math.min(candles[i].low, suffixMinLow[i + 1]);
    }

    // Filter consumed entries
    const alive = Array.from(priceMap.values()).filter((entry) => {
      const checkFrom = Math.min(entry.latestIdx + 1, candles.length - 1);
      if (entry.side === "short") {
        // Short liq consumed if price went above it
        return suffixMaxHigh[checkFrom] < entry.price;
      } else {
        // Long liq consumed if price went below it
        return suffixMinLow[checkFrom] > entry.price;
      }
    });

    return alive.map((entry) => {
      // Line projects from right edge (100%) leftward to earliest bar
      const xStartFrac = (entry.earliestIdx + 0.5) / N;
      const yFrac = 1 - (entry.price - priceMin) / priceRange;
      // Opacity: more appearances = more opaque, tier 0 = strongest
      const baseOpacity = Math.min(0.6, 0.1 + entry.count * 0.03);
      const tierScale = 1 - entry.tier * 0.12;
      const opacity = baseOpacity * tierScale * decayFactor;

      return {
        xStartFrac,
        yFrac,
        side: entry.side,
        opacity: Math.max(0.03, opacity),
      };
    });
  }, [data, candles, priceMin, priceMax, priceRange, decayFactor, N]);

  return (
    <div
      className="absolute inset-0 z-10"
      style={{ pointerEvents: "none" }}
    >
      {/* Close button */}
      <div
        className="absolute top-0 right-0 z-20 px-2 py-1 text-xs cursor-pointer bg-white/80 border-b border-l border-black/10 rounded-bl"
        style={{ pointerEvents: "auto", color: "#888780" }}
        onClick={onClose}
      >
        close overlay
      </div>

      {/* Lines projecting left from each bar's liq level */}
      <div
        className="absolute overflow-hidden"
        style={{
          left: padLeft,
          right: padRight,
          top: padTop,
          bottom: padBottom,
        }}
      >
        {lines.map((m, i) => (
          <div
            key={i}
            className="absolute"
            style={{
              left: `${m.xStartFrac * 100}%`,
              right: 0,
              top: `${m.yFrac * 100}%`,
              height: 1,
              background: `${COLORS[m.side]}${m.opacity})`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
