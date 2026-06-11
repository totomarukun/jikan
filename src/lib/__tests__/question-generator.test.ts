import { describe, expect, it } from "vitest";
import {
  generateQuestion,
  pairKey,
  type EquipmentLite,
} from "../question-generator";

function makeEquipment(
  id: string,
  category: string,
  overrides: Partial<EquipmentLite> = {},
): EquipmentLite {
  return {
    id,
    category,
    manufacturer: "テスト",
    name: `用具${id}`,
    officialSpeed: 80,
    officialSpin: 80,
    hardness: 40,
    price: 5000,
    bladeSubcategory: category === "BLADE" ? "WOOD" : null,
    ...overrides,
  };
}

const baseContext = {
  bladeCategory: "OUTER_CARBON",
  level: "INTERMEDIATE",
  playstyle: "DRIVE",
  recentPairs: [] as Array<[string, string]>,
  appearanceCounts: new Map<string, number>(),
};

describe("generateQuestion", () => {
  const equipments = [
    ...Array.from({ length: 10 }, (_, i) =>
      makeEquipment(`r${i}`, "RUBBER_INVERTED"),
    ),
    ...Array.from({ length: 5 }, (_, i) => makeEquipment(`b${i}`, "BLADE")),
  ];

  it("異なる2つの用具からなるペアを生成する", () => {
    for (let i = 0; i < 50; i++) {
      const q = generateQuestion(equipments, baseContext);
      expect(q).not.toBeNull();
      expect(q!.optionA.id).not.toBe(q!.optionB.id);
    }
  });

  it("直近10問のペアと重複しない", () => {
    const rubbers = equipments.filter((e) => e.category === "RUBBER_INVERTED");
    // r0-r4 の全組み合わせ10ペアを「直近」とし、残りからのみ出題されること
    const recent: Array<[string, string]> = [];
    for (let i = 0; i < 5; i++) {
      for (let j = i + 1; j < 5; j++) {
        recent.push([rubbers[i].id, rubbers[j].id]);
      }
    }
    const recentKeys = new Set(recent.map(([a, b]) => pairKey(a, b)));
    for (let i = 0; i < 100; i++) {
      const q = generateQuestion(equipments, {
        ...baseContext,
        recentPairs: recent,
      });
      expect(q).not.toBeNull();
      expect(recentKeys.has(pairKey(q!.optionA.id, q!.optionB.id))).toBe(false);
    }
  });

  it("ラバーとラケットを混ぜたペアは生成しない", () => {
    for (let i = 0; i < 100; i++) {
      const q = generateQuestion(equipments, baseContext)!;
      const aIsRubber = q.optionA.category.startsWith("RUBBER_");
      const bIsRubber = q.optionB.category.startsWith("RUBBER_");
      expect(aIsRubber).toBe(bIsRubber);
    }
  });

  it("候補が2つ未満なら null を返す", () => {
    const q = generateQuestion([makeEquipment("solo", "RUBBER_INVERTED")], {
      ...baseContext,
      random: () => 0.0, // ラバー側を選択
    });
    expect(q).toBeNull();
  });

  it("現用ラバー登録時は「現用 vs 他」の出題が一定割合で発生する", () => {
    let pinned = 0;
    for (let i = 0; i < 300; i++) {
      const q = generateQuestion(equipments, {
        ...baseContext,
        currentRubberId: "r0",
      });
      if (q?.optionAIsCurrent) {
        pinned++;
        expect(q.optionA.id).toBe("r0");
        expect(q.optionB.id).not.toBe("r0");
      }
    }
    // ラバー出題75% × ピン留め35% ≈ 26% 前後。下限だけ緩く検証
    expect(pinned).toBeGreaterThan(30);
  });

  it("現用ピン留めでも直近ペアとは重複しない", () => {
    const others = equipments.filter(
      (e) => e.category === "RUBBER_INVERTED" && e.id !== "r0",
    );
    // r0 と他全ラバーの組み合わせを直近に置くと、ピン留め出題は発生しない
    const recent: Array<[string, string]> = others.map((e) => ["r0", e.id]);
    for (let i = 0; i < 100; i++) {
      const q = generateQuestion(equipments, {
        ...baseContext,
        currentRubberId: "r0",
        recentPairs: recent,
      });
      expect(q?.optionAIsCurrent ?? false).toBe(false);
    }
  });

  it("粘着ユーザーのLayer 1では粘着ラバーが優先候補に含まれる", () => {
    const stickyPool = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeEquipment(`s${i}`, "RUBBER_STICKY"),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeEquipment(`v${i}`, "RUBBER_INVERTED"),
      ),
    ];
    let sawSticky = false;
    for (let i = 0; i < 200; i++) {
      const q = generateQuestion(stickyPool, {
        ...baseContext,
        bladeCategory: "STICKY",
      });
      if (q && q.optionA.category === "RUBBER_STICKY") sawSticky = true;
    }
    expect(sawSticky).toBe(true);
  });
});
