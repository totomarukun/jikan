import { describe, expect, it } from "vitest";
import {
  buildFeelProfile,
  feelStatements,
  type FeelRowInput,
} from "../feel";

const BASE = "base";
const TARGET = "target";

function row(overrides: Partial<FeelRowInput>): FeelRowInput {
  return {
    optionAEquipmentId: BASE,
    hasActualExperience: "BOTH",
    winnerHardness: null,
    winnerSpeed: null,
    winnerSpin: null,
    winnerBallHold: null,
    winnerOverall: null,
    ...overrides,
  };
}

describe("buildFeelProfile", () => {
  it("target が B 側でも「target の方が硬い」に正規化される", () => {
    // A=base, B=target で B が硬い → target が more
    const r1 = row({ winnerHardness: "B" });
    // A=target, B=base で A が硬い → target が more
    const r2 = row({ optionAEquipmentId: TARGET, winnerHardness: "A" });
    const profile = buildFeelProfile([r1, r2], TARGET);
    expect(profile.hardness).toMatchObject({ more: 2, less: 0, n: 2 });
  });

  it("BOTH の回答が3件以上あれば、両方使った人のみで集計する", () => {
    const both = Array.from({ length: 3 }, () =>
      row({ winnerHardness: "B" }),
    );
    const imagined = Array.from({ length: 10 }, () =>
      row({ winnerHardness: "A", hasActualExperience: "NEITHER" }),
    );
    const profile = buildFeelProfile([...both, ...imagined], TARGET);
    expect(profile.hardness).toMatchObject({ more: 3, less: 0, bothOnly: true });
  });

  it("BOTH が3件未満なら全回答にフォールバックする", () => {
    const rows = [
      row({ winnerHardness: "B" }),
      row({ winnerHardness: "B", hasActualExperience: "NEITHER" }),
    ];
    const profile = buildFeelProfile(rows, TARGET);
    expect(profile.hardness).toMatchObject({ n: 2, bothOnly: false });
  });

  it("回答ゼロの軸は null", () => {
    const profile = buildFeelProfile([row({ winnerSpeed: "A" })], TARGET);
    expect(profile.hardness).toBeNull();
    expect(profile.speed).not.toBeNull();
  });
});

describe("feelStatements", () => {
  it("60%以上で多数派の体感、未満なら「割れている」になる", () => {
    const majority = buildFeelProfile(
      [
        ...Array.from({ length: 7 }, () => row({ winnerHardness: "B" })),
        ...Array.from({ length: 3 }, () => row({ winnerHardness: "A" })),
      ],
      TARGET,
    );
    const split = buildFeelProfile(
      [
        ...Array.from({ length: 5 }, () => row({ winnerHardness: "B" })),
        ...Array.from({ length: 5 }, () => row({ winnerHardness: "A" })),
      ],
      TARGET,
    );
    expect(feelStatements(majority)[0]).toMatchObject({
      verdict: "more",
      pct: 70,
    });
    expect(feelStatements(split)[0]).toMatchObject({ verdict: "split" });
  });

  it("好み (preference) は体感ステートメントに含めない", () => {
    const profile = buildFeelProfile([row({ winnerOverall: "B" })], TARGET);
    expect(feelStatements(profile)).toHaveLength(0);
  });
});
