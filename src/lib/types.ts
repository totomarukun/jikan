import { z } from "zod";

// ---- enum 定義 (SQLite は enum 非対応のため String + Zod で検証する) ----

export const PLAYSTYLES = [
  "DRIVE",
  "QUICK_ATTACK",
  "CUT",
  "OTHER",
  "UNDECIDED",
] as const;
export const LEVELS = [
  "BEGINNER",
  "INTERMEDIATE",
  "ADVANCED",
  "NON_PLAYER",
] as const;
export const BLADE_CATEGORIES = [
  "OUTER_CARBON",
  "INNER_CARBON",
  "WOOD",
  "STICKY",
  "UNKNOWN",
] as const;
export const EQUIPMENT_CATEGORIES = [
  "RUBBER_INVERTED",
  "RUBBER_PIMPLE_OUT",
  "RUBBER_PIMPLE_LONG",
  "RUBBER_ANTI",
  "RUBBER_STICKY",
  "BLADE",
] as const;
export const WINNERS = ["A", "B", "SAME", "UNKNOWN"] as const;
export const EXPERIENCES = ["BOTH", "ONE", "NEITHER"] as const;
export const GEAR_SIDES = ["FH", "BH"] as const;
export const THICKNESSES = ["TOKUATSU", "ATSU", "CHU", "USU", "UNKNOWN"] as const;
export const QUESTION_AXES = [
  "overall",
  "speed",
  "spin",
  "control",
  "hardness",
  "ballHold",
  "arc",
] as const;

export type Playstyle = (typeof PLAYSTYLES)[number];
export type Level = (typeof LEVELS)[number];
export type BladeCategory = (typeof BLADE_CATEGORIES)[number];
export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number];
export type Winner = (typeof WINNERS)[number];
export type Experience = (typeof EXPERIENCES)[number];
export type QuestionAxis = (typeof QUESTION_AXES)[number];
export type GearSide = (typeof GEAR_SIDES)[number];
export type Thickness = (typeof THICKNESSES)[number];

export const playstyleSchema = z.enum(PLAYSTYLES);
export const levelSchema = z.enum(LEVELS);
export const bladeCategorySchema = z.enum(BLADE_CATEGORIES);
export const winnerSchema = z.enum(WINNERS);
export const experienceSchema = z.enum(EXPERIENCES);

export const onboardingSchema = z.object({
  level: levelSchema,
  playstyle: playstyleSchema,
  bladeCategory: bladeCategorySchema,
  // いま使っているフォア面ラバー (任意・スキップ可)
  currentRubberId: z.string().min(1).optional(),
});

// 経験フラグはクライアントから受け取らず、サーバー側でマイギアから自動判定する
export const answerSchema = z.object({
  questionId: z.string().min(1),
  optionAEquipmentId: z.string().min(1),
  optionBEquipmentId: z.string().min(1),
  axis: z.enum(QUESTION_AXES),
  winner: winnerSchema,
});

export const gearSchema = z.object({
  equipmentId: z.string().min(1),
  side: z.enum(GEAR_SIDES),
  thickness: z.enum(THICKNESSES),
  bladeEquipmentId: z.string().min(1).optional(),
  isCurrent: z.boolean().optional(),
  // 貼った日 (張り替えリマインドの起点)。未指定なら現用登録時に当日を既定。
  usageStartedAt: z.string().datetime().optional(),
  // 乗り換え理由・感想メモ
  note: z.string().max(500).optional(),
});

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  nickname: z.string().max(30).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(72),
});

// ---- 表示用ラベル ----

export const PLAYSTYLE_LABELS: Record<Playstyle, string> = {
  DRIVE: "ドライブ主戦",
  QUICK_ATTACK: "前陣速攻",
  CUT: "カット",
  OTHER: "その他",
  UNDECIDED: "決まっていない",
};

export const LEVEL_LABELS: Record<Level, string> = {
  BEGINNER: "初級",
  INTERMEDIATE: "中級",
  ADVANCED: "上級",
  NON_PLAYER: "プレーしない",
};

export const BLADE_CATEGORY_LABELS: Record<BladeCategory, string> = {
  OUTER_CARBON: "アウターカーボン",
  INNER_CARBON: "インナーカーボン",
  WOOD: "合板",
  STICKY: "粘着用",
  UNKNOWN: "わからない",
};

export const EQUIPMENT_CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  RUBBER_INVERTED: "裏ソフトラバー",
  RUBBER_PIMPLE_OUT: "表ソフトラバー",
  RUBBER_PIMPLE_LONG: "粒高ラバー",
  RUBBER_ANTI: "アンチラバー",
  RUBBER_STICKY: "粘着ラバー",
  BLADE: "ラケット",
};

export const EXPERIENCE_LABELS: Record<Experience, string> = {
  BOTH: "両方使ったことがある",
  ONE: "片方だけ使ったことがある",
  NEITHER: "どちらも使ったことはない（イメージで回答）",
};

export const GEAR_SIDE_LABELS: Record<GearSide, string> = {
  FH: "フォア",
  BH: "バック",
};

export const THICKNESS_LABELS: Record<Thickness, string> = {
  TOKUATSU: "特厚(MAX)",
  ATSU: "厚",
  CHU: "中",
  USU: "薄",
  UNKNOWN: "厚さ不明",
};

/** スタイル診断に最低限必要な回答数 (報酬ゲートではなく精度の下限) */
export const MIN_DIAGNOSIS_ANSWERS = 10;

export function isRubberCategory(category: string): boolean {
  return category.startsWith("RUBBER_");
}
