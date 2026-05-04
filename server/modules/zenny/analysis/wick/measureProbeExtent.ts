// measureProbeExtent — for a body pivot candle, compute the wick distance
// past the body extreme. This is the "stop probe" zone — how far price
// reached above the body before retreating, on the side stops would sit.
//
// For a RESISTANCE pivot: bodyExtreme = max(open,close), wickExtreme = high.
//   The probe zone is [bodyExtreme, wickExtreme] — the territory above
//   the level where short stops cluster.
// For a SUPPORT pivot: bodyExtreme = min(open,close), wickExtreme = low.
//   The probe zone is [wickExtreme, bodyExtreme] — territory below the
//   level where long stops cluster.

import type { Candle } from "../../../../../shared/zennyTypes";

export type ProbeSide = "RESISTANCE" | "SUPPORT";

export interface ProbeExtent {
  bodyExtreme: number;
  wickExtreme: number;
  extent: number; // absolute distance, always >= 0
}

export function measureProbeExtent(
  candle: Candle,
  side: ProbeSide,
): ProbeExtent {
  if (side === "RESISTANCE") {
    const bodyExtreme =
      candle.open > candle.close ? candle.open : candle.close;
    return {
      bodyExtreme,
      wickExtreme: candle.high,
      extent: candle.high - bodyExtreme,
    };
  }
  const bodyExtreme = candle.open < candle.close ? candle.open : candle.close;
  return {
    bodyExtreme,
    wickExtreme: candle.low,
    extent: bodyExtreme - candle.low,
  };
}
