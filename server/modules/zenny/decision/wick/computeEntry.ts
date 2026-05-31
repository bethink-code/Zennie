// computeEntry — entry price for a wick trade given the pool, side, entry
// style, and current buffer.
//
// Pool side semantics (for the trade DIRECTION, not the pool):
//   pool.type === RESISTANCE → fade short (sweep was wick poking UP)
//   pool.type === SUPPORT    → fade long  (sweep was wick poking DOWN)
//
// The "swept extreme" is the wick tip on the pool side:
//   RESISTANCE → wickHigh
//   SUPPORT    → wickLow
//
// The "swept midpoint" is the average of the line price (body extreme of the
// pivot candle) and the wick extreme — the 50% of the wick territory.
//
// Entry rules per style (RESISTANCE / short trade shown; SUPPORT mirrors):
//   midpoint     : (linePrice + wickHigh) / 2
//   extreme      : wickHigh
//   beyond       : wickHigh + buffer (entry only fires on second sweep)
//   anticipatory : wickHigh - (fixedBufferMultiple × buffer)
//                  (limit fill inside the range, before the wick is touched)
//
// Pure function. Returns null when the geometry doesn't resolve (e.g. an
// anticipatory entry that prices past current price would be a stop order,
// not a limit, and we keep this v1 to limit-only).

import type { AnalysisPool } from "../../analysis/orchestrator";
import type { AnticipatoryConfig, EntryStyle } from "./types";

export interface ComputeEntryInput {
  pool: AnalysisPool;
  style: EntryStyle;
  buffer: number;
  anticipatory: AnticipatoryConfig;
}

export function computeEntry(input: ComputeEntryInput): number | null {
  const { pool, style, buffer, anticipatory } = input;

  if (pool.type === "RESISTANCE") {
    // Short fade entries
    switch (style) {
      case "under-touching":
        // Inner edge of the wick zone — sell at the body line on the pullback.
        return pool.linePrice;
      case "midpoint":
        return (pool.linePrice + pool.wickHigh) / 2;
      case "extreme":
        return pool.wickHigh;
      case "beyond":
        return pool.wickHigh + buffer;
      case "anticipatory":
        return resolveAnticipatoryEntry(
          pool.wickHigh,
          buffer,
          "RESISTANCE",
          anticipatory,
        );
    }
  }

  // SUPPORT — long fade entries
  switch (style) {
    case "under-touching":
      // Inner edge of the wick zone — buy at the body line on the pullback.
      return pool.linePrice;
    case "midpoint":
      return (pool.linePrice + pool.wickLow) / 2;
    case "extreme":
      return pool.wickLow;
    case "beyond":
      return pool.wickLow - buffer;
    case "anticipatory":
      return resolveAnticipatoryEntry(
        pool.wickLow,
        buffer,
        "SUPPORT",
        anticipatory,
      );
  }
}

function resolveAnticipatoryEntry(
  wickExtreme: number,
  buffer: number,
  side: "RESISTANCE" | "SUPPORT",
  cfg: AnticipatoryConfig,
): number | null {
  if (cfg.distanceRule === "fixed-buffer") {
    // Entry inside the range, fixedBufferMultiple buffers from the wick.
    const offset = buffer * cfg.fixedBufferMultiple;
    return side === "RESISTANCE" ? wickExtreme - offset : wickExtreme + offset;
  }
  if (cfg.distanceRule === "current-price") {
    // Caller supplies current price elsewhere; this rule means "take it at
    // market" — we signal that by returning the wick extreme so the caller
    // can swap in current price. v1 fallback to fixed-buffer.
    const offset = buffer * cfg.fixedBufferMultiple;
    return side === "RESISTANCE" ? wickExtreme - offset : wickExtreme + offset;
  }
  // ote-fraction not yet wired — needs a dealing-range definition we don't
  // have first-class. Falls back to fixed-buffer.
  const offset = buffer * cfg.fixedBufferMultiple;
  return side === "RESISTANCE" ? wickExtreme - offset : wickExtreme + offset;
}
