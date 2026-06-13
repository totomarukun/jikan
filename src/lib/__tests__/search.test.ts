import { describe, expect, it } from "vitest";
import {
  normalizeForSearch,
  searchEquipment,
  type SearchableItem,
} from "../search";

const items: SearchableItem[] = [
  { id: "1", name: "テナジー05", manufacturer: "バタフライ", category: "RUBBER_INVERTED" },
  { id: "2", name: "ディグニクス05", manufacturer: "バタフライ", category: "RUBBER_INVERTED" },
  { id: "3", name: "ロゼナ", manufacturer: "バタフライ", category: "RUBBER_INVERTED" },
  { id: "4", name: "ファスタークG-1", manufacturer: "ニッタク", category: "RUBBER_INVERTED" },
  { id: "5", name: "キョウヒョウNEO3", manufacturer: "紅双喜", category: "RUBBER_STICKY" },
  { id: "6", name: "ラザンターR47", manufacturer: "アンドロ", category: "RUBBER_INVERTED" },
];

const ids = (r: SearchableItem[]) => r.map((x) => x.id);

describe("normalizeForSearch", () => {
  it("全角/半角・かな種・長音・中黒の揺れを畳む", () => {
    // ひらがな→カタカナ、長音除去
    expect(normalizeForSearch("てなじー")).toBe(normalizeForSearch("テナジー"));
    // 全角英数→半角・小文字
    expect(normalizeForSearch("Ｇ－１")).toBe(normalizeForSearch("g1"));
    // 中黒・空白除去
    expect(normalizeForSearch("ラ・クザ 7")).toBe(normalizeForSearch("ラクザ7"));
  });
});

describe("searchEquipment", () => {
  it("日本語の前方一致", () => {
    expect(ids(searchEquipment(items, "テナジー"))).toContain("1");
  });

  it("ひらがな入力でカタカナ名にヒット", () => {
    expect(ids(searchEquipment(items, "ろぜな"))).toContain("3");
  });

  it("英語名でヒット (テナジー→tenergy)", () => {
    expect(ids(searchEquipment(items, "tenergy"))).toContain("1");
    expect(ids(searchEquipment(items, "dignics"))).toContain("2");
  });

  it("ローマ字入力で日本語名にヒット (rozena→ロゼナ)", () => {
    expect(ids(searchEquipment(items, "rozena"))).toContain("3");
  });

  it("メーカー名(日/英)で絞れる", () => {
    expect(ids(searchEquipment(items, "butterfly")).length).toBeGreaterThanOrEqual(3);
    expect(ids(searchEquipment(items, "バタフライ")).length).toBeGreaterThanOrEqual(3);
  });

  it("略称エイリアスでヒット (G-1→g1)", () => {
    expect(ids(searchEquipment(items, "g1"))).toContain("4");
  });

  it("表記揺れ(中黒・ハイフン)を無視してヒット", () => {
    expect(ids(searchEquipment(items, "ファスタークg1"))).toContain("4");
  });

  it("タイポをファジーで救済", () => {
    // 「らさんたー」→ ラザンター(濁点違い) をファジーで拾う
    expect(ids(searchEquipment(items, "ラザンタ"))).toContain("6");
  });

  it("空クエリは空", () => {
    expect(searchEquipment(items, "  ")).toEqual([]);
  });
});
