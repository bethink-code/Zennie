import { describe, it, expect } from "vitest";
import {
  strengthFromConfluence,
  strengthFromRecency,
  combinedLevelStrength,
  STRENGTH_RANK,
} from "./strength";

describe("strengthFromConfluence", () => {
  it("trivial for 0 confluence", () => {
    expect(strengthFromConfluence(0)).toBe("trivial");
  });
  it("weak for 1 TF (local only)", () => {
    expect(strengthFromConfluence(1)).toBe("weak");
  });
  it("medium for 2 TFs", () => {
    expect(strengthFromConfluence(2)).toBe("medium");
  });
  it("strong for 3 TFs (structural)", () => {
    expect(strengthFromConfluence(3)).toBe("strong");
  });
  it("very_strong for 4+ TFs (cycle-defining megalevel)", () => {
    expect(strengthFromConfluence(4)).toBe("very_strong");
    expect(strengthFromConfluence(5)).toBe("very_strong");
  });
});

describe("strengthFromRecency", () => {
  it("trivial for old levels", () => {
    expect(strengthFromRecency(0)).toBe("trivial");
    expect(strengthFromRecency(0.5)).toBe("trivial");
    expect(strengthFromRecency(0.69)).toBe("trivial");
  });
  it("medium at 0.70 (boundary)", () => {
    expect(strengthFromRecency(0.7)).toBe("medium");
  });
  it("strong at 0.85 (boundary)", () => {
    expect(strengthFromRecency(0.85)).toBe("strong");
  });
  it("very_strong at 0.95 (boundary)", () => {
    expect(strengthFromRecency(0.95)).toBe("very_strong");
    expect(strengthFromRecency(1.0)).toBe("very_strong");
  });
});

describe("combinedLevelStrength", () => {
  it("returns the max of the two tiers", () => {
    // Full confluence, old → confluence wins
    expect(combinedLevelStrength(4, 0.1)).toBe("very_strong");
    // No confluence, very recent → recency wins
    expect(combinedLevelStrength(1, 0.97)).toBe("very_strong");
    // 2-TF + moderately recent → medium (both are medium)
    expect(combinedLevelStrength(2, 0.75)).toBe("medium");
  });

  it("the dramatic untaken-liquidity case: 1 TF + very recent", () => {
    // A fresh swing low that nothing else agrees with yet, but it's the most recent
    expect(combinedLevelStrength(1, 0.97)).toBe("very_strong");
  });

  it("an old level with all four TFs agreeing is still very_strong", () => {
    expect(combinedLevelStrength(4, 0.0)).toBe("very_strong");
  });

  it("structural 3-TF level beats medium recency", () => {
    expect(combinedLevelStrength(3, 0.5)).toBe("strong");
  });

  it("trivial when both are weak", () => {
    expect(combinedLevelStrength(0, 0.5)).toBe("trivial");
  });
});

describe("STRENGTH_RANK", () => {
  it("orders tiers from weakest to strongest", () => {
    expect(STRENGTH_RANK.trivial).toBeLessThan(STRENGTH_RANK.weak);
    expect(STRENGTH_RANK.weak).toBeLessThan(STRENGTH_RANK.medium);
    expect(STRENGTH_RANK.medium).toBeLessThan(STRENGTH_RANK.strong);
    expect(STRENGTH_RANK.strong).toBeLessThan(STRENGTH_RANK.very_strong);
  });
});
