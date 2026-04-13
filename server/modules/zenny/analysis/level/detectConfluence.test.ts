import { describe, it, expect } from "vitest";
import { detectConfluence, type LevelInput } from "./detectConfluence";

function mkLevel(
  id: string,
  price: number,
  side: "RESISTANCE" | "SUPPORT",
  tf: LevelInput["sourceTimeframe"],
): LevelInput {
  return { id, price, side, sourceTimeframe: tf };
}

describe("detectConfluence", () => {
  it("a single level has confluence count 1 if on a scoring TF", () => {
    const levels = [mkLevel("a", 100, "RESISTANCE", "D")];
    const r = detectConfluence({ levels });
    expect(r.get("a")?.confluenceCount).toBe(1);
    expect(r.get("a")?.matchingTimeframes).toEqual([]);
  });

  it("a single level has confluence count 0 if on a non-scoring TF", () => {
    // 15m is execution-only, not in CONFLUENCE_TIMEFRAMES
    const levels = [mkLevel("a", 100, "RESISTANCE", "15m")];
    const r = detectConfluence({ levels });
    expect(r.get("a")?.confluenceCount).toBe(0);
  });

  it("two confluent levels from different scoring TFs count each other", () => {
    const levels = [
      mkLevel("a", 100, "RESISTANCE", "4H"),
      mkLevel("b", 100.3, "RESISTANCE", "D"), // within 0.5%
    ];
    const r = detectConfluence({ levels });
    expect(r.get("a")?.confluenceCount).toBe(2);
    expect(r.get("a")?.matchingTimeframes).toEqual(["D"]);
    expect(r.get("b")?.confluenceCount).toBe(2);
    expect(r.get("b")?.matchingTimeframes).toEqual(["4H"]);
  });

  it("all four trader TFs agreeing gives confluence 4", () => {
    const levels = [
      mkLevel("a", 70000, "RESISTANCE", "4H"),
      mkLevel("b", 70100, "RESISTANCE", "D"),
      mkLevel("c", 69900, "RESISTANCE", "W"),
      mkLevel("d", 70050, "RESISTANCE", "M"),
    ];
    const r = detectConfluence({ levels });
    expect(r.get("a")?.confluenceCount).toBe(4);
    expect(r.get("a")?.matchingTimeframes).toEqual(["D", "W", "M"]);
  });

  it("support and resistance don't mix even at the same price", () => {
    const levels = [
      mkLevel("a", 100, "RESISTANCE", "D"),
      mkLevel("b", 100, "SUPPORT", "W"),
    ];
    const r = detectConfluence({ levels });
    expect(r.get("a")?.confluenceCount).toBe(1);
    expect(r.get("b")?.confluenceCount).toBe(1);
  });

  it("execution TFs (15m/1H) don't contribute to confluence count", () => {
    const levels = [
      mkLevel("a", 100, "RESISTANCE", "15m"),
      mkLevel("b", 100.2, "RESISTANCE", "1H"),
      mkLevel("c", 100.3, "RESISTANCE", "D"),
    ];
    const r = detectConfluence({ levels });
    // Level a (15m) itself doesn't contribute, but D is matching → count 1
    expect(r.get("a")?.confluenceCount).toBe(1);
    expect(r.get("a")?.matchingTimeframes).toEqual(["D"]);
    // Level c (D) is a scoring TF itself, but neither 15m nor 1H count → self only
    expect(r.get("c")?.confluenceCount).toBe(1);
    expect(r.get("c")?.matchingTimeframes).toEqual([]);
  });

  it("levels outside tolerance do not cluster", () => {
    const levels = [
      mkLevel("a", 100, "RESISTANCE", "4H"),
      mkLevel("b", 102, "RESISTANCE", "D"), // 2% away, outside default 0.5%
    ];
    const r = detectConfluence({ levels });
    expect(r.get("a")?.confluenceCount).toBe(1);
    expect(r.get("b")?.confluenceCount).toBe(1);
  });
});
