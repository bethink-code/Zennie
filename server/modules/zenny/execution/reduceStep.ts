// reduceStep — single-bar reducer for one position. The main pure function
// of the execution module.
//
//   reduceStep({ position, bar, equity, config }) → PositionRecord'
//
// Hard invariants (throw on violation — these are bugs, not user errors):
//   I1. bar.openTime > position.lastEvaluatedAt
//        Catches lookahead — re-feeding the same bar or a stale bar.
//   I2. equity > 0
//        Account zero-out is a separate concern; reducer should never run.
//
// Soft invariants (return position unchanged with reason):
//   S1. bar.gapFilled === true
//        No transitions on synthesised data.
//   S2. position.status is terminal (CLOSED / CANCELLED / EXPIRED / REJECTED)
//        Idempotent.
//
// State transitions:
//   PLANNED → REJECTED (sizing fails, gap, equity zero)
//   PLANNED → LIVE     (sizing OK, order accepted)
//   LIVE    → EXPIRED  (entryValidBars elapsed)
//   LIVE    → FILLED   (entry touched on bar > submittedAtBarTs)
//   FILLED  → CLOSED   (stop or target touched; conflict resolved per config)
//
// Pure function. The reducer NEVER mutates the input position; it returns
// a new record. Persistence is the caller's job.

import {
  checkEntryFill,
  checkStopFill,
  checkTargetFill,
} from "./applyFillRules";
import { computeSize } from "./computeSize";
import type { ExecutionConfig } from "./executionConfig";
import { resolveSameBarConflict } from "./resolveSameBarConflict";
import type {
  ExecutionBar,
  ExitReason,
  FillResult,
  PositionRecord,
  TradeSide,
} from "./types";

export interface ReduceStepInput {
  position: PositionRecord;
  bar: ExecutionBar;
  equity: number;
  config: ExecutionConfig;
}

export function reduceStep(input: ReduceStepInput): PositionRecord {
  const { position, bar, equity, config } = input;

  // I1 — lookahead invariant.
  if (bar.openTime <= position.lastEvaluatedAt) {
    throw new Error(
      `reduceStep lookahead violation: bar.openTime ${bar.openTime} <= lastEvaluatedAt ${position.lastEvaluatedAt}`,
    );
  }
  // I2 — equity sanity.
  if (equity <= 0) {
    throw new Error(`reduceStep requires equity > 0, got ${equity}`);
  }

  // S2 — terminal idempotence.
  if (isTerminal(position.status)) return position;

  // S1 — gap-filled bar; bump cursor but no transition.
  if (bar.gapFilled === true) {
    return { ...position, lastEvaluatedAt: bar.openTime };
  }

  if (position.status === "PLANNED") {
    return tryPlannedTransition(position, bar, equity);
  }
  if (position.status === "LIVE") {
    return tryLiveTransition(position, bar, config);
  }
  if (position.status === "FILLED") {
    return tryFilledTransition(position, bar, config);
  }
  return position;
}

// PLANNED → LIVE | REJECTED
function tryPlannedTransition(
  position: PositionRecord,
  bar: ExecutionBar,
  equity: number,
): PositionRecord {
  const sizing = computeSize({
    equity,
    plan: {
      entry: position.entryPrice,
      stop: position.stopPrice,
      riskPct: position.riskPct,
      sizeMultiplier: position.sizeMultiplier,
    },
  });
  if (sizing === null) {
    return reject(position, bar, "sizing");
  }
  return {
    ...position,
    status: "LIVE",
    size: sizing.size,
    notional: sizing.notional,
    submittedAtBarTs: bar.openTime,
    lastEvaluatedAt: bar.openTime,
  };
}

// LIVE → FILLED | EXPIRED | (no change)
function tryLiveTransition(
  position: PositionRecord,
  bar: ExecutionBar,
  config: ExecutionConfig,
): PositionRecord {
  const submittedAt = position.submittedAtBarTs ?? position.emittedAtBarTs;

  // Lookahead invariant for the order itself: don't fill on or before
  // submission bar. The order is on the book starting on the bar AFTER it
  // was submitted.
  if (bar.openTime <= submittedAt) {
    return { ...position, lastEvaluatedAt: bar.openTime };
  }

  // E4 — entryValidBars expiry. The reducer doesn't know the TF bar
  // duration, so we approximate by dividing the elapsed time since
  // submission by the duration of the current bar. The runner can supply
  // exact bar counts later if this approximation drifts.
  const approxBarMs = Math.max(1, bar.closeTime - bar.openTime + 1);
  const elapsedBars = Math.floor(
    (bar.openTime - submittedAt) / approxBarMs,
  );
  if (elapsedBars >= config.entryValidBars) {
    return expire(position, bar);
  }

  const fill = checkEntryFill({
    side: position.side,
    bar,
    entryPrice: position.entryPrice,
    config,
  });
  if (fill === null) {
    return { ...position, lastEvaluatedAt: bar.openTime };
  }
  return fillEntry(position, bar, fill);
}

// FILLED → CLOSED | (no change)
function tryFilledTransition(
  position: PositionRecord,
  bar: ExecutionBar,
  config: ExecutionConfig,
): PositionRecord {
  // E6 — max bars in trade.
  if (
    config.maxBarsInTrade !== null &&
    position.filledAtBarTs !== null
  ) {
    const approxBarMs = Math.max(1, bar.closeTime - bar.openTime + 1);
    const elapsedBars = Math.floor(
      (bar.openTime - position.filledAtBarTs) / approxBarMs,
    );
    if (elapsedBars >= config.maxBarsInTrade) {
      // Time-exit treated as CLOSED with exit at bar's close.
      return closeAt(position, bar, bar.close, "operator");
    }
  }

  const stopFill = checkStopFill({
    side: position.side,
    bar,
    stopPrice: position.stopPrice,
    config,
  });
  const targetFill = checkTargetFill({
    side: position.side,
    bar,
    targetPrice: position.targetPrice,
    config,
  });

  if (stopFill === null && targetFill === null) {
    return { ...position, lastEvaluatedAt: bar.openTime };
  }
  if (stopFill !== null && targetFill === null) {
    return closeAt(position, bar, stopFill.fillPrice, "stop");
  }
  if (stopFill === null && targetFill !== null) {
    return closeAt(position, bar, targetFill.fillPrice, "target");
  }

  // Same-bar conflict — both filled inside [low, high].
  const winner = resolveSameBarConflict({
    bar,
    side: position.side,
    mode: config.sameBarConflict,
  });
  const fill = winner === "stop-market" ? stopFill! : targetFill!;
  const reason: ExitReason = winner === "stop-market" ? "stop" : "target";
  return closeAt(position, bar, fill.fillPrice, reason);
}

// --- helpers ---------------------------------------------------------------

function isTerminal(status: PositionRecord["status"]): boolean {
  return (
    status === "CLOSED" ||
    status === "CANCELLED" ||
    status === "EXPIRED" ||
    status === "REJECTED"
  );
}

function reject(
  position: PositionRecord,
  bar: ExecutionBar,
  reason: ExitReason,
): PositionRecord {
  return {
    ...position,
    status: "REJECTED",
    exitReason: reason,
    rejectionReason: rejectionMessage(reason),
    lastEvaluatedAt: bar.openTime,
  };
}

function expire(
  position: PositionRecord,
  bar: ExecutionBar,
): PositionRecord {
  return {
    ...position,
    status: "EXPIRED",
    exitReason: "valid-bars-elapsed",
    lastEvaluatedAt: bar.openTime,
  };
}

function fillEntry(
  position: PositionRecord,
  bar: ExecutionBar,
  fill: FillResult,
): PositionRecord {
  return {
    ...position,
    status: "FILLED",
    fillPrice: fill.fillPrice,
    filledAtBarTs: bar.openTime,
    lastEvaluatedAt: bar.openTime,
  };
}

function closeAt(
  position: PositionRecord,
  bar: ExecutionBar,
  closePrice: number,
  reason: ExitReason,
): PositionRecord {
  if (position.fillPrice === null || position.size === null) {
    // Shouldn't happen — only FILLED → CLOSED transitions reach here.
    return position;
  }
  const pnl = computePnl(
    position.side,
    position.fillPrice,
    closePrice,
    position.size,
  );
  return {
    ...position,
    status: "CLOSED",
    closePrice,
    closedAtBarTs: bar.openTime,
    realisedPnl: pnl,
    exitReason: reason,
    lastEvaluatedAt: bar.openTime,
  };
}

function computePnl(
  side: TradeSide,
  entry: number,
  exit: number,
  size: number,
): number {
  return side === "long"
    ? (exit - entry) * size
    : (entry - exit) * size;
}

function rejectionMessage(reason: ExitReason): string {
  if (reason === "sizing") return "computeSize returned null";
  if (reason === "gap") return "first bar after PLANNED was gap-filled";
  if (reason === "equity-zero") return "account equity is zero or negative";
  if (reason === "risk-veto") return "risk manager rejected the plan";
  return reason;
}
