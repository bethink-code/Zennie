// cancelPosition — external transition that takes a non-terminal position
// to CANCELLED. Triggered by the runner / kill-switch / operator-override
// paths, not by reduceStep (which only sees bars, not external events).
//
// Idempotent: terminal positions return unchanged.
//
// Pure function.

import type { ExitReason, PositionRecord } from "./types";

const CANCEL_REASONS: ExitReason[] = ["operator", "regime", "kill-switch"];

export interface CancelPositionInput {
  position: PositionRecord;
  reason: "operator" | "regime" | "kill-switch";
  atBarTs: number;
}

export function cancelPosition(
  input: CancelPositionInput,
): PositionRecord {
  const { position } = input;
  // Idempotent on terminal states.
  if (
    position.status === "CLOSED" ||
    position.status === "CANCELLED" ||
    position.status === "EXPIRED" ||
    position.status === "REJECTED"
  ) {
    return position;
  }
  if (!CANCEL_REASONS.includes(input.reason)) {
    throw new Error(
      `cancelPosition: invalid reason ${input.reason}; allowed = ${CANCEL_REASONS.join(",")}`,
    );
  }
  return {
    ...position,
    status: "CANCELLED",
    exitReason: input.reason,
    lastEvaluatedAt: input.atBarTs,
  };
}
