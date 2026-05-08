// resolveSameBarConflict — when both stop and target fill within the same
// bar, decide which one wins.
//
// Modes:
//   stop-wins      pessimistic; integrity-first. v0 default.
//   target-wins    optimistic; rarely defensible. Useful for "best case" sims.
//   ohlc-heuristic PineScript-style direction inference from OHLC pattern.
//   use-lower-tf   not implemented in v0 — falls through to stop-wins.
//
// Pure function. Returns the order kind that resolves first; the caller
// applies the fill from that order.

import type { SameBarConflictMode } from "./executionConfig";
import type { ExecutionBar, OrderKind } from "./types";

export interface ResolveSameBarConflictInput {
  bar: ExecutionBar;
  side: "long" | "short";
  mode: SameBarConflictMode;
}

export function resolveSameBarConflict(
  input: ResolveSameBarConflictInput,
): "stop-market" | "target-limit" {
  const { mode, bar, side } = input;

  if (mode === "stop-wins") return "stop-market";
  if (mode === "target-wins") return "target-limit";
  if (mode === "use-lower-tf") return "stop-market"; // v0 fallback

  // ohlc-heuristic — PineScript convention.
  //   Bullish bar (closer to high than low at open) → assume path was
  //     open → low → high → close. So LOW reached first.
  //   Bearish bar → open → high → low → close. So HIGH reached first.
  // Translate to which order won:
  //   long  with stop below, target above:  low-first → stop;  high-first → target.
  //   short with stop above, target below:  low-first → target; high-first → stop.
  const distFromOpenToHigh = Math.abs(bar.high - bar.open);
  const distFromOpenToLow = Math.abs(bar.open - bar.low);
  const lowFirst = distFromOpenToLow < distFromOpenToHigh; // bullish bar

  if (side === "long") {
    return lowFirst ? "stop-market" : "target-limit";
  }
  return lowFirst ? "target-limit" : "stop-market";
}
