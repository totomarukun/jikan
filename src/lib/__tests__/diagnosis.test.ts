import { describe, expect, it } from "vitest";
import { diagnose, type DiagnosisInput } from "../diagnosis";

function overallAnswer(
  winner: "A" | "B",
  specA: { speed: number; spin: number; hardness: number },
  specB: { speed: number; spin: number; hardness: number },
): DiagnosisInput {
  return {
    axis: "overall",
    winner,
    optionA: {
      officialSpeed: specA.speed,
      officialSpin: specA.spin,
      hardness: specA.hardness,
    },
    optionB: {
      officialSpeed: specB.speed,
      officialSpin: specB.spin,
      hardness: specB.hardness,
    },
  };
}

describe("diagnose", () => {
  it("高スピン用具を選び続けるとスピン重視と判定される", () => {
    const answers = Array.from({ length: 10 }, () =>
      overallAnswer(
        "A",
        { speed: 70, spin: 95, hardness: 45 },
        { speed: 95, spin: 70, hardness: 45 },
      ),
    );
    const result = diagnose(answers);
    expect(result.spinVsSpeed).toBeGreaterThan(0.4);
    expect(result.styleName).toContain("スピン重視");
  });

  it("高スピード用具を選び続けるとスピード重視と判定される", () => {
    const answers = Array.from({ length: 10 }, () =>
      overallAnswer(
        "B",
        { speed: 70, spin: 95, hardness: 45 },
        { speed: 95, spin: 70, hardness: 45 },
      ),
    );
    const result = diagnose(answers);
    expect(result.spinVsSpeed).toBeLessThan(-0.4);
    expect(result.styleName).toContain("スピード重視");
  });

  it("SAME / UNKNOWN の回答はスコアに影響しない", () => {
    const answers: DiagnosisInput[] = [
      {
        ...overallAnswer(
          "A",
          { speed: 70, spin: 95, hardness: 45 },
          { speed: 95, spin: 70, hardness: 45 },
        ),
        winner: "SAME",
      },
      {
        ...overallAnswer(
          "A",
          { speed: 70, spin: 95, hardness: 45 },
          { speed: 95, spin: 70, hardness: 45 },
        ),
        winner: "UNKNOWN",
      },
    ];
    const result = diagnose(answers);
    expect(result.spinVsSpeed).toBe(0);
    expect(result.hardness).toBe(0);
  });

  it("回答ゼロでもバランス型として安全に診断を返す", () => {
    const result = diagnose([]);
    expect(result.styleName).toContain("バランス");
  });

  it("スペック欠損 (null) があっても例外を投げない", () => {
    const answers: DiagnosisInput[] = [
      {
        axis: "overall",
        winner: "A",
        optionA: { officialSpeed: null, officialSpin: null, hardness: null },
        optionB: { officialSpeed: 80, officialSpin: 80, hardness: 40 },
      },
    ];
    expect(() => diagnose(answers)).not.toThrow();
  });
});
