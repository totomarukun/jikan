import type { QuestionAxis } from "./types";
import { isRubberCategory } from "./types";

// 企画書 第9章: 3レイヤー戦略
//   Layer 1 関連性 60% / Layer 2 データ補完 30% / Layer 3 探索 10%
// 共通フィルタ: 直近10問のペアと重複しない / 同一カテゴリ (ラバー or ラケット)

export interface EquipmentLite {
  id: string;
  category: string;
  manufacturer: string;
  name: string;
  officialSpeed: number | null;
  officialSpin: number | null;
  hardness: number | null;
  price: number | null;
  bladeSubcategory: string | null;
}

export interface GeneratorContext {
  bladeCategory: string;
  level: string;
  playstyle: string;
  /** いま使っているラバー (超高関連レイヤー: 現用 vs 他 の出題に使う) */
  currentRubberId?: string | null;
  /** 直近に出題したペア (新しい順、最大10) */
  recentPairs: Array<[string, string]>;
  /** 用具ID → 回答に登場した回数 (人気度・補完優先度の代用) */
  appearanceCounts: Map<string, number>;
  /** 0-1 の乱数源 (テスト時に差し替え可能) */
  random?: () => number;
}

export interface GeneratedQuestion {
  id: string;
  optionA: EquipmentLite;
  optionB: EquipmentLite;
  axis: QuestionAxis;
  prompt: string;
  layer: 1 | 2 | 3;
  /** optionA がユーザーの現用ラバーである出題 (UIで「いま使用中」を表示) */
  optionAIsCurrent?: boolean;
}

export function pairKey(aId: string, bId: string): string {
  return [aId, bId].sort().join("|");
}

function pickRandom<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

/** 文脈に「関連性が高い」ラバーカテゴリ群を返す */
function relevantRubberCategories(bladeCategory: string): string[] {
  if (bladeCategory === "STICKY") return ["RUBBER_STICKY", "RUBBER_INVERTED"];
  return ["RUBBER_INVERTED"];
}

function selectQuestionType(random: () => number): {
  axis: QuestionAxis;
  template: (a: EquipmentLite, b: EquipmentLite) => string;
} {
  const r = random();
  // シンプルAB 60% / 軸指定AB 30% / シナリオAB 10%。
  // 軸指定には感覚言語のズレが大きい「硬さ」「球持ち」を含める
  // (絶対評価では伝わらない感覚を、相対比較として収集する)。
  if (r < 0.6) {
    return { axis: "overall", template: () => "どちらが好み？" };
  }
  if (r < 0.675) {
    return { axis: "speed", template: () => "スピードが速いのはどちら？" };
  }
  if (r < 0.75) {
    return { axis: "spin", template: () => "回転がかかるのはどちら？" };
  }
  if (r < 0.825) {
    return { axis: "hardness", template: () => "硬く感じるのはどちら？" };
  }
  if (r < 0.9) {
    return {
      axis: "ballHold",
      template: () => "球持ちが良いと感じるのはどちら？",
    };
  }
  const scenarios = [
    "バック面で使うなら？",
    "中陣ドライブで威力を出すなら？",
    "レシーブの安定感を取るなら？",
  ];
  const scenario = scenarios[Math.floor(random() * scenarios.length)];
  return { axis: "overall", template: () => scenario };
}

/**
 * 出題ペアを1つ生成する。候補が尽きた場合は null。
 * equipments は isActive な全用具を渡す。
 */
export function generateQuestion(
  equipments: EquipmentLite[],
  context: GeneratorContext,
): GeneratedQuestion | null {
  const random = context.random ?? Math.random;
  const recentKeys = new Set(
    context.recentPairs.slice(0, 10).map(([a, b]) => pairKey(a, b)),
  );

  // カテゴリ選択: ラバー 75% / ラケット 25% (マスタ構成比に概ね一致)
  const useRubber = random() < 0.75;
  const pool = equipments.filter((e) =>
    useRubber ? isRubberCategory(e.category) : e.category === "BLADE",
  );
  if (pool.length < 2) return null;

  // 超高関連 (企画書 9.2): 現用ラバーが登録済みなら、ラバー出題の35%を
  // 「現用 vs 他」に固定する。基準点が明確で答えやすく、乗り換え検討に直結する。
  if (useRubber && context.currentRubberId && random() < 0.35) {
    const current = pool.find((e) => e.id === context.currentRubberId);
    if (current) {
      const others = pool.filter(
        (e) =>
          e.id !== current.id &&
          e.category === current.category &&
          !recentKeys.has(pairKey(current.id, e.id)),
      );
      if (others.length > 0) {
        const optionB = pickRandom(others, random);
        const { axis, template } = selectQuestionType(random);
        const prompt =
          axis === "overall"
            ? `いまの「${current.name}」と比べてどっち？`
            : template(current, optionB);
        return {
          id: pairKey(current.id, optionB.id),
          optionA: current,
          optionB,
          axis,
          prompt,
          layer: 1,
          optionAIsCurrent: true,
        };
      }
    }
  }

  const layerRoll = random();
  const layer: 1 | 2 | 3 = layerRoll < 0.6 ? 1 : layerRoll < 0.9 ? 2 : 3;

  let candidates = pool;
  if (layer === 1 && useRubber) {
    // Layer 1: 投稿者のラケット系統に合うラバー群を優先
    const cats = relevantRubberCategories(context.bladeCategory);
    const filtered = pool.filter((e) => cats.includes(e.category));
    if (filtered.length >= 2) candidates = filtered;
  } else if (layer === 1 && !useRubber) {
    // 同系統のラケット同士を優先
    const sub =
      context.bladeCategory === "OUTER_CARBON" ||
      context.bladeCategory === "INNER_CARBON"
        ? context.bladeCategory
        : null;
    if (sub) {
      const filtered = pool.filter((e) => e.bladeSubcategory === sub);
      if (filtered.length >= 2) candidates = filtered;
    }
  }
  // Layer 3 (探索) はカテゴリ・系統を問わず pool 全体から選ぶ

  const tryPick = (cands: EquipmentLite[]): [EquipmentLite, EquipmentLite] | null => {
    for (let attempt = 0; attempt < 30; attempt++) {
      let a: EquipmentLite;
      let b: EquipmentLite;
      if (layer === 2) {
        // Layer 2: 登場回数が少ない用具を優先してデータの偏りを補完。
        // 上位グループ内の全ペアが直近出題と重複し得るため、試行ごとに候補を広げる
        const sorted = [...cands].sort(
          (x, y) =>
            (context.appearanceCounts.get(x.id) ?? 0) -
            (context.appearanceCounts.get(y.id) ?? 0),
        );
        const head = sorted.slice(
          0,
          Math.max(2, Math.ceil(sorted.length / 3)) + attempt,
        );
        a = pickRandom(head, random);
        b = pickRandom(head, random);
      } else {
        a = pickRandom(cands, random);
        b = pickRandom(cands, random);
      }
      if (a.id === b.id) continue;
      // 異種ラバー同士の対決は避ける (裏 vs 粒高 等は比較が成立しにくい)
      if (
        isRubberCategory(a.category) &&
        isRubberCategory(b.category) &&
        a.category !== b.category &&
        layer !== 3
      ) {
        continue;
      }
      if (recentKeys.has(pairKey(a.id, b.id))) continue;
      return [a, b];
    }
    return null;
  };

  let picked = tryPick(candidates);
  if (!picked && candidates !== pool) picked = tryPick(pool);
  if (!picked) return null;

  const [optionA, optionB] = picked;
  const { axis, template } = selectQuestionType(random);
  return {
    id: pairKey(optionA.id, optionB.id),
    optionA,
    optionB,
    axis,
    prompt: template(optionA, optionB),
    layer,
  };
}
