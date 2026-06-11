import { prisma } from "./prisma";

// 体感翻訳: ペアワイズ回答は「同じ人の感覚系の中での相対判定」なので、
// ユーザーが使ったことのあるラバーを錨 (アンカー) にすれば、
// 他人の感覚を「あなたの◯◯と比べてどうか」という形に翻訳できる。
// 絶対評価レビューの「硬い/柔らかいが人によって違う」問題への直接回答。

export interface FeelAxis {
  /** target の方が「強い」(硬い/速い/かかる/球持ちが良い) と感じた人数 */
  more: number;
  /** base の方が強いと感じた人数 */
  less: number;
  same: number;
  n: number;
  /** 両方使った人 (経験フラグ BOTH) のみの集計か */
  bothOnly: boolean;
}

export interface FeelProfile {
  hardness: FeelAxis | null;
  speed: FeelAxis | null;
  spin: FeelAxis | null;
  ballHold: FeelAxis | null;
  preference: FeelAxis | null;
}

const AXIS_COLUMNS = {
  hardness: "winnerHardness",
  speed: "winnerSpeed",
  spin: "winnerSpin",
  ballHold: "winnerBallHold",
  preference: "winnerOverall",
} as const;

/** 両方使った人の回答が3件以上あればそちらを優先する */
const BOTH_PREFER_THRESHOLD = 3;

export interface FeelRowInput {
  optionAEquipmentId: string;
  hasActualExperience: string | null;
  winnerHardness: string | null;
  winnerSpeed: string | null;
  winnerSpin: string | null;
  winnerBallHold: string | null;
  winnerOverall: string | null;
}

/**
 * base (あなたが使ったことのあるラバー) を基準にした target の体感プロファイル。
 * 軸ごとに「両方使った人のみ」を優先し、足りなければ全回答で補う。
 */
export async function getFeelProfile(
  baseId: string,
  targetId: string,
): Promise<FeelProfile> {
  const rows = await prisma.comparison.findMany({
    where: {
      OR: [
        { optionAEquipmentId: baseId, optionBEquipmentId: targetId },
        { optionAEquipmentId: targetId, optionBEquipmentId: baseId },
      ],
    },
    select: {
      optionAEquipmentId: true,
      hasActualExperience: true,
      winnerHardness: true,
      winnerSpeed: true,
      winnerSpin: true,
      winnerBallHold: true,
      winnerOverall: true,
    },
  });
  return buildFeelProfile(rows, targetId);
}

/** 集計の純粋部分 (テスト可能) */
export function buildFeelProfile(
  rows: FeelRowInput[],
  targetId: string,
): FeelProfile {
  const profile = {} as FeelProfile;
  for (const [axis, column] of Object.entries(AXIS_COLUMNS) as Array<
    [keyof FeelProfile, (typeof AXIS_COLUMNS)[keyof typeof AXIS_COLUMNS]]
  >) {
    const tallyOf = (bothOnly: boolean): FeelAxis => {
      const t: FeelAxis = { more: 0, less: 0, same: 0, n: 0, bothOnly };
      for (const r of rows) {
        if (bothOnly && r.hasActualExperience !== "BOTH") continue;
        const winner = r[column];
        if (winner !== "A" && winner !== "B" && winner !== "SAME") continue;
        const targetIsA = r.optionAEquipmentId === targetId;
        if (winner === "SAME") t.same++;
        else if ((winner === "A") === targetIsA) t.more++;
        else t.less++;
        t.n++;
      }
      return t;
    };
    const both = tallyOf(true);
    const tally = both.n >= BOTH_PREFER_THRESHOLD ? both : tallyOf(false);
    profile[axis] = tally.n > 0 ? tally : null;
  }
  return profile;
}

export interface FeelStatement {
  axis: keyof FeelProfile;
  label: string;
  /** 例: 「硬く感じる」side の表現 */
  moreLabel: string;
  lessLabel: string;
  tally: FeelAxis;
  /** 多数派の側 ("more" | "less") か、割れている場合 null */
  verdict: "more" | "less" | "split";
  /** 多数派の割合 (%) */
  pct: number;
}

const AXIS_LABELS: Record<
  keyof FeelProfile,
  { label: string; more: string; less: string }
> = {
  hardness: { label: "打感", more: "硬く感じる", less: "柔らかく感じる" },
  speed: { label: "スピード", more: "速いと感じる", less: "遅いと感じる" },
  spin: { label: "スピン", more: "かかると感じる", less: "かからないと感じる" },
  ballHold: {
    label: "球持ち",
    more: "球持ちが良いと感じる",
    less: "球離れが速いと感じる",
  },
  preference: { label: "好み", more: "こちらが好み", less: "基準の方が好み" },
};

/** 判定が「割れている」とみなす境界 (多数派が60%未満) */
const SPLIT_THRESHOLD = 0.6;

export function feelStatements(profile: FeelProfile): FeelStatement[] {
  const out: FeelStatement[] = [];
  for (const axis of ["hardness", "speed", "spin", "ballHold"] as const) {
    const tally = profile[axis];
    if (!tally) continue;
    const decided = tally.more + tally.less;
    if (decided === 0) continue;
    const moreRatio = tally.more / decided;
    const verdict: FeelStatement["verdict"] =
      moreRatio >= SPLIT_THRESHOLD
        ? "more"
        : moreRatio <= 1 - SPLIT_THRESHOLD
          ? "less"
          : "split";
    out.push({
      axis,
      label: AXIS_LABELS[axis].label,
      moreLabel: AXIS_LABELS[axis].more,
      lessLabel: AXIS_LABELS[axis].less,
      tally,
      verdict,
      pct: Math.round(Math.max(moreRatio, 1 - moreRatio) * 100),
    });
  }
  return out;
}
