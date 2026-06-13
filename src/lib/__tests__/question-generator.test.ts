import { describe, expect, it } from "vitest";
import {
  generateQuestion,
  pairKey,
  type EquipmentLite,
  type GearLite,
} from "../question-generator";

function makeEquipment(
  id: string,
  category = "RUBBER_INVERTED",
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
    imageUrl: null,
    ...overrides,
  };
}

function makeGear(
  equipmentId: string,
  overrides: Partial<GearLite> = {},
): GearLite {
  return {
    id: `gear-${equipmentId}`,
    equipmentId,
    side: "FH",
    thickness: "ATSU",
    bladeName: null,
    isCurrent: false,
    ...overrides,
  };
}

const equipments = [
  ...Array.from({ length: 10 }, (_, i) => makeEquipment(`r${i}`)),
  makeEquipment("b0", "BLADE"),
];

const AXES = ["overall", "hardness", "spin", "speed", "ballHold", "arc"];

describe("generateQuestion (マイギア中心)", () => {
  it("ギアが2本以上あればギア内ペアから出題し、使用条件を返す", () => {
    for (let i = 0; i < 50; i++) {
      const q = generateQuestion(equipments, {
        gear: [makeGear("r0"), makeGear("r1")],
        recentAsked: [],
      });
      expect(q).not.toBeNull();
      expect(q!.source).toBe("gear");
      expect([q!.optionA.id, q!.optionB.id].sort()).toEqual(["r0", "r1"]);
      expect(q!.gearA).not.toBeNull();
      expect(q!.gearB).not.toBeNull();
    }
  });

  it("同一ペアでも軸が違えば出題し、(ペア×軸) を出し尽くすと explore に切り替わる", () => {
    const gear = [makeGear("r0"), makeGear("r1")];
    const key = pairKey("r0", "r1");
    // 全6軸のうち5軸を出題済みにすると、残り1軸が出る
    const askedAllButLast = AXES.slice(0, AXES.length - 1).map((axis) => ({
      pairKey: key,
      axis,
    }));
    for (let i = 0; i < 20; i++) {
      const q = generateQuestion(equipments, {
        gear,
        recentAsked: askedAllButLast,
      });
      expect(q!.source).toBe("gear");
      expect(q!.axis).toBe(AXES[AXES.length - 1]);
    }
    // 全軸出題済みなら explore (ギア外との比較)
    const askedAll = AXES.map((axis) => ({ pairKey: key, axis }));
    const q = generateQuestion(equipments, { gear, recentAsked: askedAll });
    expect(q!.source).toBe("explore");
  });

  it("explore は現用ギアを基準にギア外のラバーと比較する", () => {
    const gear = [makeGear("r0", { isCurrent: true })];
    for (let i = 0; i < 30; i++) {
      const q = generateQuestion(equipments, { gear, recentAsked: [] });
      expect(q!.source).toBe("explore");
      expect(q!.optionA.id).toBe("r0");
      expect(q!.optionB.id).not.toBe("r0");
      expect(q!.optionB.category).not.toBe("BLADE");
    }
  });

  it("フォア現用+バック1本でも、バック面ラバーが explore 基準として出題される (B3行き止まり解消)", () => {
    // 同面ペアを作れない単独面のラバー(ロゼナ役 r1=BH)が永遠に出題されない問題
    const gear = [
      makeGear("r0", { side: "FH", isCurrent: true }), // 現用フォア
      makeGear("r1", { side: "BH" }), // バック1本 = 本命
    ];
    // 回答するたび履歴を蓄積する実セッションを再現
    const recentAsked: Array<{ pairKey: string; axis: string }> = [];
    const baseIds = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const q = generateQuestion(equipments, { gear, recentAsked });
      expect(q!.source).toBe("explore"); // 同面ペアがないので必ず explore
      baseIds.add(q!.optionA.id); // optionA = 基準ラバー
      expect(q!.optionB.id).not.toBe("r0"); // 所有ラバーは相手側に来ない
      expect(q!.optionB.id).not.toBe("r1");
      recentAsked.unshift({ pairKey: pairKey(q!.optionA.id, q!.optionB.id), axis: q!.axis });
    }
    // データが偏らないよう基準は巡回する。r0(現用フォア)だけでなく
    // r1(バック面の本命)も基準として登場すること
    expect(baseIds.has("r1")).toBe(true);
    expect(baseIds.has("r0")).toBe(true);
  });

  it("ギアが空でもラバー同士の explore を出題できる", () => {
    const q = generateQuestion(equipments, { gear: [], recentAsked: [] });
    expect(q).not.toBeNull();
    expect(q!.source).toBe("explore");
    expect(q!.optionA.id).not.toBe(q!.optionB.id);
  });

  it("同じ面で使ったギア同士のペアが優先される", () => {
    const gear = [
      makeGear("r0", { side: "FH" }),
      makeGear("r1", { side: "FH" }),
      makeGear("r2", { side: "BH" }),
    ];
    let sameSide = 0;
    const total = 200;
    for (let i = 0; i < total; i++) {
      const q = generateQuestion(equipments, { gear, recentAsked: [] });
      if (q!.gearA!.side === q!.gearB!.side) sameSide++;
    }
    // 80%で同面優先のため過半数を大きく超えるはず
    expect(sameSide).toBeGreaterThan(total * 0.6);
  });

  it("用具が1つしかなければ null", () => {
    const q = generateQuestion([makeEquipment("solo")], {
      gear: [],
      recentAsked: [],
    });
    expect(q).toBeNull();
  });
});
