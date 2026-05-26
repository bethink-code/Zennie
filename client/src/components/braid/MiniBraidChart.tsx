// MiniBraidChart — a compact, read-only Braid chart for one symbol: candles,
// liquidity pools, levels, regime strip, and the resting/open paper order drawn
// on top. Small multiples of these make the watchlist gallery (/charts) where
// you can eyeball whether the engine is placing orders sensibly.
//
// Reuses the exact rendering the full Braid page uses (LeftFrameCanvas +
// TradeOverlay), sharing chartGeometry so the overlay aligns by construction.

import { useQuery } from "@tanstack/react-query";
import type { Timeframe } from "@shared/zennyTypes";
import { CHART_PAD, computePriceRange } from "./chartGeometry";
import { LeftFrameCanvas } from "./LeftFrameCanvas";
import { TradeOverlay } from "./TradeOverlay";
import type { AnalysisStateClient } from "./types";

const MINI_H = 240;
const MINI_COUNT = 160; // recent action is what matters here; keep it light

export function MiniBraidChart({
  symbol,
  timeframe = "15m",
}: {
  symbol: string;
  timeframe?: Timeframe;
}) {
  const { data, isFetching } = useQuery<AnalysisStateClient>({
    queryKey: [
      `/api/zenny/braid-view-model?symbol=${symbol}&timeframe=${timeframe}&count=${MINI_COUNT}`,
    ],
  });

  const candles = data?.candles ?? [];
  const open = (data?.paperPositions ?? []).filter(
    (p) => p.status === "LIVE" || p.status === "FILLED",
  );
  const playbook = data?.regimeAssessment?.primary?.recommended?.playbook;
  const order = open[0];
  const range = candles.length ? computePriceRange(candles) : null;

  return (
    <div className="overflow-hidden rounded border border-black/10 bg-white">
      <div className="flex items-center justify-between border-b border-black/5 px-3 py-1.5">
        <span className="text-sm font-medium">{symbol}</span>
        <div className="flex items-center gap-2 text-xs">
          {playbook && (
            <span className="uppercase tracking-wide text-[#888780]">{playbook}</span>
          )}
          {order ? (
            <span style={{ color: order.side === "long" ? "#2f7d4f" : "#b4453a" }}>
              {order.side === "long" ? "▲" : "▼"} {order.status === "FILLED" ? "in trade" : "resting"}
            </span>
          ) : (
            <span className="text-[#888780]">no order</span>
          )}
        </div>
      </div>
      <div className="relative" style={{ height: MINI_H }}>
        {!range ? (
          <div className="flex h-full items-center justify-center text-xs text-[#888780]">
            {isFetching ? "loading…" : "no data"}
          </div>
        ) : (
          <>
            <LeftFrameCanvas
              state={data!}
              height={MINI_H}
              showPools
              showSweptPools
              showLevels
              showRegimeStrip
              showOtherTfs={false}
              showSwingMarkers={false}
              maxLevelsPerSide={4}
              strengthThreshold={0.5}
            />
            <TradeOverlay
              candles={candles}
              plans={[]}
              positions={open}
              priceMin={range.priceMin}
              priceMax={range.priceMax}
              padLeft={CHART_PAD.l}
              padRight={CHART_PAD.r}
              padTop={CHART_PAD.t}
              padBottom={CHART_PAD.b}
            />
          </>
        )}
      </div>
    </div>
  );
}
