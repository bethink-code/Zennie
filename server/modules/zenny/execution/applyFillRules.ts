// applyFillRules — given an open order (entry / stop / target), the next
// bar, and the slippage config, return the fill result if the bar's range
// touched the order price; otherwise null.
//
// Slippage convention (research-backed):
//   - Limit orders (entry-limit, target-limit): exact fill at order price.
//     The trader provided liquidity; no slippage unless `applySlippageToLimits`
//     is opted-in.
//   - Stop orders (stop-market): fills at order price slipped against the
//     trader's interest by `slippageBps`.
//
// Direction of slippage:
//   long stop hit  → fillPrice = stopPrice × (1 - bps/10000)   (price falling)
//   short stop hit → fillPrice = stopPrice × (1 + bps/10000)   (price rising)
//
// The fillMode='next-bar-touch' contract is the caller's responsibility —
// applyFillRules just checks the bar range. The reducer enforces the
// "bar after submission" invariant separately.
//
// Pure function.

import type { ExecutionConfig } from "./executionConfig";
import type {
  ExecutionBar,
  FillResult,
  OrderKind,
  TradeSide,
} from "./types";

export interface ApplyFillRulesInput {
  orderKind: OrderKind;
  orderPrice: number;
  side: TradeSide; // direction of the position the order belongs to
  bar: ExecutionBar;
  slippageBps: number;
  applySlippageToLimits: boolean;
}

export function applyFillRules(
  input: ApplyFillRulesInput,
): FillResult | null {
  const { orderKind, orderPrice, side, bar } = input;

  // Touch check — bar's range must contain the order price for a fill.
  const touched = orderPrice >= bar.low && orderPrice <= bar.high;
  if (!touched) return null;

  const isLimit =
    orderKind === "entry-limit" || orderKind === "target-limit";
  const slipApplies =
    !isLimit || input.applySlippageToLimits;
  if (!slipApplies) {
    return { kind: orderKind, fillPrice: orderPrice };
  }

  const slipFactor = input.slippageBps / 10_000;
  // Slip against the trader. For a long stop fill, price was falling — fill
  // is BELOW the stop. For a short stop fill, price was rising — fill is
  // ABOVE the stop.
  const slipped =
    side === "long"
      ? orderPrice * (1 - slipFactor)
      : orderPrice * (1 + slipFactor);
  return { kind: orderKind, fillPrice: slipped };
}

// Convenience helper used by reduceStep — checks all three orders against
// the bar in priority order based on conflict mode. Returns the first fill
// or null.
export interface CheckBarFillsInput {
  side: TradeSide;
  bar: ExecutionBar;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  config: ExecutionConfig;
}

export function checkEntryFill(input: {
  side: TradeSide;
  bar: ExecutionBar;
  entryPrice: number;
  config: ExecutionConfig;
}): FillResult | null {
  return applyFillRules({
    orderKind: "entry-limit",
    orderPrice: input.entryPrice,
    side: input.side,
    bar: input.bar,
    slippageBps: input.config.slippageBps,
    applySlippageToLimits: input.config.applySlippageToLimits,
  });
}

export function checkStopFill(input: {
  side: TradeSide;
  bar: ExecutionBar;
  stopPrice: number;
  config: ExecutionConfig;
}): FillResult | null {
  return applyFillRules({
    orderKind: "stop-market",
    orderPrice: input.stopPrice,
    side: input.side,
    bar: input.bar,
    slippageBps: input.config.slippageBps,
    applySlippageToLimits: input.config.applySlippageToLimits,
  });
}

export function checkTargetFill(input: {
  side: TradeSide;
  bar: ExecutionBar;
  targetPrice: number;
  config: ExecutionConfig;
}): FillResult | null {
  return applyFillRules({
    orderKind: "target-limit",
    orderPrice: input.targetPrice,
    side: input.side,
    bar: input.bar,
    slippageBps: input.config.slippageBps,
    applySlippageToLimits: input.config.applySlippageToLimits,
  });
}
