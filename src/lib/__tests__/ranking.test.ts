import { describe, expect, it } from "vitest";
import { computeAxisRatings, type PairwiseInput } from "../ranking";

function order(ratings: Map<string, { logStrength: number }>): string[] {
  return [...ratings.entries()]
    .sort((a, b) => b[1].logStrength - a[1].logStrength)
    .map(([id]) => id);
}

describe("computeAxisRatings (推移律ベースの相対評価)", () => {
  it("直接対決した2本を正しく順序づける", () => {
    const inputs: PairwiseInput[] = [
      { aId: "A", bId: "B", winner: "A" },
    ];
    const { ratings } = computeAxisRatings(inputs);
    expect(ratings.get("A")!.logStrength).toBeGreaterThan(
      ratings.get("B")!.logStrength,
    );
    expect(ratings.get("A")!.comparisons).toBe(1);
  });

  it("推移律: A>B, B>C なら直接対決のない A>C も導ける (中核価値)", () => {
    const inputs: PairwiseInput[] = [
      { aId: "A", bId: "B", winner: "A" },
      { aId: "B", bId: "C", winner: "A" },
    ];
    const { ratings, rankedCount } = computeAxisRatings(inputs);
    expect(rankedCount).toBe(3);
    expect(order(ratings)).toEqual(["A", "B", "C"]);
    // A と C は一度も直接対決していないのに順序がつく
    expect(ratings.get("A")!.logStrength).toBeGreaterThan(
      ratings.get("C")!.logStrength,
    );
  });

  it("より長い連鎖でも一貫した順序になる (A>B>C>D)", () => {
    const inputs: PairwiseInput[] = [
      { aId: "A", bId: "B", winner: "A" },
      { aId: "B", bId: "C", winner: "A" },
      { aId: "C", bId: "D", winner: "A" },
    ];
    const { ratings } = computeAxisRatings(inputs);
    expect(order(ratings)).toEqual(["A", "B", "C", "D"]);
  });

  it("互角(SAME)は両者を近い強さに保つ", () => {
    const inputs: PairwiseInput[] = [
      { aId: "A", bId: "B", winner: "SAME" },
    ];
    const { ratings } = computeAxisRatings(inputs);
    expect(
      Math.abs(ratings.get("A")!.logStrength - ratings.get("B")!.logStrength),
    ).toBeLessThan(1e-6);
  });

  it("支持データが多いほど中央(アンカー)から離れられる = 信頼度が効く", () => {
    // X は1勝、Y は同じ相手に5勝。Y の方が強く振れるはず
    const few: PairwiseInput[] = [{ aId: "X", bId: "P", winner: "A" }];
    const many: PairwiseInput[] = Array.from({ length: 5 }, () => ({
      aId: "Y",
      bId: "Q",
      winner: "A" as const,
    }));
    const rx = computeAxisRatings(few).ratings.get("X")!;
    const ry = computeAxisRatings(many).ratings.get("Y")!;
    expect(ry.logStrength).toBeGreaterThan(rx.logStrength);
    expect(ry.comparisons).toBe(5);
    expect(rx.comparisons).toBe(1);
  });

  it("矛盾する比較 (A>B かつ B>A 同数) は互角に収束する", () => {
    const inputs: PairwiseInput[] = [
      { aId: "A", bId: "B", winner: "A" },
      { aId: "A", bId: "B", winner: "B" },
    ];
    const { ratings } = computeAxisRatings(inputs);
    expect(
      Math.abs(ratings.get("A")!.logStrength - ratings.get("B")!.logStrength),
    ).toBeLessThan(1e-6);
  });

  it("比較が無い項目はランキングに含めない", () => {
    const { ratings, rankedCount } = computeAxisRatings([]);
    expect(rankedCount).toBe(0);
    expect(ratings.size).toBe(0);
  });
});
