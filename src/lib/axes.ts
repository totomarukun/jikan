import type { AxisKey } from "./ranking";

// ラバー軸モデルの単一の真実 (Single Source of Truth)。
// マップ・用具詳細・比較・乗り換え・出題の全てがここから軸を引く。
//
// 設計方針 (企画レビュー反映):
// - 「好み(overall)」は用具の体感ではなく主観なので、表示・出題から外す
//   (型・DBカラムは診断/対決の後方互換のため残す)。
// - 「コントロール/球持ち」は独立軸にせず「かたさ(やわらかい=球持ち・コントロール /
//   かたい=弾き)」1軸に集約する。
// - 「攻撃のしやすさ/守備のしやすさ」を新設し、技術視点で読めるようにする。
// - 「粘着」は粘着系ラバー同士でのみ意味を持つ条件付き軸。テンション系には聞かない。

export interface RubberAxisMeta {
  key: AxisKey;
  label: string;
  low: string;
  high: string;
  /** 粘着系ラバー同士のときだけ出題・表示する軸 */
  tackyOnly?: boolean;
  /** /play 出題の相対重み */
  weight: number;
  /** ギア(実体験)出題プロンプト */
  gearPrompt: string;
  /** explore(イメージ)出題プロンプト */
  explorePrompt: string;
}

export const RUBBER_AXES: RubberAxisMeta[] = [
  {
    key: "speed",
    label: "スピード",
    low: "おそい",
    high: "はやい",
    weight: 0.2,
    gearPrompt: "スピードが出たのはどちら？",
    explorePrompt: "イメージでOK: 速そうなのはどちら？",
  },
  {
    key: "spin",
    label: "スピン",
    low: "かからない",
    high: "かかる",
    weight: 0.2,
    gearPrompt: "スピンがかかったのはどちら？",
    explorePrompt: "イメージでOK: スピンがかかりそうなのは？",
  },
  {
    key: "hardness",
    label: "かたさ",
    low: "やわらかい",
    high: "かたい",
    weight: 0.2,
    gearPrompt: "硬く感じたのはどちら？",
    explorePrompt: "イメージでOK: 硬そうなのはどちら？",
  },
  {
    key: "arc",
    label: "弧線",
    low: "直線的",
    high: "山なり",
    weight: 0.12,
    gearPrompt: "弧線が高かった（山なりだった）のはどちら？",
    explorePrompt: "イメージでOK: 弧線が高そう（山なり）なのは？",
  },
  {
    key: "attackEase",
    label: "攻撃のしやすさ",
    low: "むずかしい",
    high: "しやすい",
    weight: 0.13,
    gearPrompt: "攻撃（ドライブ・スマッシュ）がしやすかったのは？",
    explorePrompt: "イメージでOK: 攻撃しやすそうなのは？",
  },
  {
    key: "defenseEase",
    label: "守備のしやすさ",
    low: "むずかしい",
    high: "しやすい",
    weight: 0.1,
    gearPrompt: "守備（ツッツキ・ブロック）がしやすかったのは？",
    explorePrompt: "イメージでOK: 守備しやすそうなのは？",
  },
  {
    key: "tackiness",
    label: "粘着",
    low: "弱い",
    high: "強い",
    tackyOnly: true,
    weight: 0.05,
    gearPrompt: "粘着が強かった（ひっかかった）のはどちら？",
    explorePrompt: "イメージでOK: 粘着が強そうなのは？",
  },
];

/** マップ/詳細/比較で表示・順位付けに使うラバー軸キー (表示順) */
export const RUBBER_AXIS_KEYS: AxisKey[] = RUBBER_AXES.map((a) => a.key);

export const RUBBER_AXIS_BY_KEY: Record<string, RubberAxisMeta> =
  Object.fromEntries(RUBBER_AXES.map((a) => [a.key, a]));

/** 粘着の軸・質問が意味を持つカテゴリ (粘着系ラバー) */
export function isTackyCategory(category: string): boolean {
  return category === "RUBBER_STICKY";
}

/** このペアで出題・表示してよい軸 (粘着は粘着系同士のときだけ) */
export function axesForPair(catA: string, catB: string): RubberAxisMeta[] {
  const bothTacky = isTackyCategory(catA) && isTackyCategory(catB);
  return RUBBER_AXES.filter((a) => !a.tackyOnly || bothTacky);
}
