// formPool — turn a body pivot into a pool zone.
//
// The pool is the rectangle between the body extreme (the level line) and
// the wick extreme of the same candle. For a resistance, the pool sits
// above the line (where short stops live). For a support, below.
//
// Width is whatever the wick was — no ATR multipliers, no fudge. The wick
// itself IS the probe extent the market already revealed at this level.

import type { Candle } from "../../../../../shared/zennyTypes";
import { measureProbeExtent } from "../wick/measureProbeExtent";

export type PoolSide = "RESISTANCE" | "SUPPORT";

export interface PoolBoundaries {
  linePrice: number; // the level line (body extreme)
  wickHigh: number; // top of pool zone
  wickLow: number; // bottom of pool zone
  centreLine: number; // midpoint of the pool zone
}

export interface FormPoolOptions {
  wickExtreme?: number;
}

export function formPool(
  candle: Candle,
  side: PoolSide,
  options: FormPoolOptions = {},
): PoolBoundaries {
  const probe = measureProbeExtent(candle, side);
  const wickExtreme = options.wickExtreme ?? probe.wickExtreme;
  if (side === "RESISTANCE") {
    return {
      linePrice: probe.bodyExtreme,
      wickHigh: wickExtreme,
      wickLow: probe.bodyExtreme,
      centreLine: (probe.bodyExtreme + wickExtreme) / 2,
    };
  }
  return {
    linePrice: probe.bodyExtreme,
    wickHigh: probe.bodyExtreme,
    wickLow: wickExtreme,
    centreLine: (probe.bodyExtreme + wickExtreme) / 2,
  };
}
