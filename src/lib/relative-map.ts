import { prisma } from "./prisma";
import { isRubberCategory } from "./types";
import { computeAxisRatings, type AxisKey, type PairwiseInput } from "./ranking";

// 相対マップ: 全ユーザーの全A/B比較を1つの順序推定に合成し、
// 軸ごとに全ラバーの相対位置を返す。推移律で疎データでも地図になる。

const AXIS_COLUMN: Record<AxisKey, keyof ComparisonAxisRow> = {
  overall: "winnerOverall",
  speed: "winnerSpeed",
  spin: "winnerSpin",
  control: "winnerControl",
  hardness: "winnerHardness",
  ballHold: "winnerBallHold",
  arc: "winnerArc",
};

interface ComparisonAxisRow {
  optionAEquipmentId: string;
  optionBEquipmentId: string;
  hasActualExperience: string | null;
  winnerOverall: string | null;
  winnerSpeed: string | null;
  winnerSpin: string | null;
  winnerControl: string | null;
  winnerHardness: string | null;
  winnerBallHold: string | null;
  winnerArc: string | null;
}

// 実体験ほど信頼できるので重み付け (イメージ回答も地図には薄く効かせる)
function experienceWeight(exp: string | null): number {
  if (exp === "BOTH") return 1.0;
  if (exp === "ONE") return 0.45;
  return 0.3; // NEITHER / null
}

export interface MapEntry {
  id: string;
  name: string;
  manufacturer: string;
  category: string;
  imageUrl: string | null;
  hardness: number | null;
  price: number | null;
  /** 0-100 のその軸の相対位置 (高いほど 速い/かかる/硬い/球持ち良い/好まれる) */
  score: number;
  logStrength: number;
  /** この軸でこのラバーが関わった実比較の本数 (信頼度) */
  comparisons: number;
  /** うち「両方使った人」の比較本数 */
  bothComparisons: number;
}

export interface RelativeMap {
  axis: AxisKey;
  entries: MapEntry[]; // logStrength 降順
  /** 軸全体で使った実比較の総数 */
  totalComparisons: number;
}

export async function buildRelativeMap(axis: AxisKey): Promise<RelativeMap> {
  const col = AXIS_COLUMN[axis];
  const [equipments, rows] = await Promise.all([
    prisma.equipment.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        manufacturer: true,
        category: true,
        imageUrl: true,
        hardness: true,
        price: true,
      },
    }),
    prisma.comparison.findMany({
      select: {
        optionAEquipmentId: true,
        optionBEquipmentId: true,
        hasActualExperience: true,
        winnerOverall: true,
        winnerSpeed: true,
        winnerSpin: true,
        winnerControl: true,
        winnerHardness: true,
        winnerBallHold: true,
        winnerArc: true,
      },
    }),
  ]);

  const byId = new Map(equipments.map((e) => [e.id, e]));
  const inputs: PairwiseInput[] = [];
  const bothCount = new Map<string, number>();
  let totalComparisons = 0;

  for (const r of rows as ComparisonAxisRow[]) {
    const winner = r[col];
    if (winner !== "A" && winner !== "B" && winner !== "SAME") continue;
    // ラバー同士の比較のみ地図化する (ラケットは別軸)
    const a = byId.get(r.optionAEquipmentId);
    const b = byId.get(r.optionBEquipmentId);
    if (!a || !b) continue;
    if (!isRubberCategory(a.category) || !isRubberCategory(b.category)) continue;

    inputs.push({
      aId: r.optionAEquipmentId,
      bId: r.optionBEquipmentId,
      winner,
      weight: experienceWeight(r.hasActualExperience),
    });
    totalComparisons++;
    if (r.hasActualExperience === "BOTH") {
      bothCount.set(
        r.optionAEquipmentId,
        (bothCount.get(r.optionAEquipmentId) ?? 0) + 1,
      );
      bothCount.set(
        r.optionBEquipmentId,
        (bothCount.get(r.optionBEquipmentId) ?? 0) + 1,
      );
    }
  }

  const { ratings } = computeAxisRatings(inputs);
  const entries: MapEntry[] = [];
  for (const [id, rating] of ratings) {
    const e = byId.get(id);
    if (!e) continue;
    entries.push({
      id: e.id,
      name: e.name,
      manufacturer: e.manufacturer,
      category: e.category,
      imageUrl: e.imageUrl,
      hardness: e.hardness,
      price: e.price,
      score: rating.score,
      logStrength: rating.logStrength,
      comparisons: rating.comparisons,
      bothComparisons: bothCount.get(id) ?? 0,
    });
  }
  entries.sort((x, y) => y.logStrength - x.logStrength);
  return { axis, entries, totalComparisons };
}

// 用具詳細ページ用: 1つの用具の全軸の相対位置を1回のDB取得で算出する。
export interface AxisPosition {
  axis: AxisKey;
  score: number; // 0-100
  comparisons: number;
  bothComparisons: number;
  rank: number; // 1-based (logStrength 降順)
  totalRanked: number;
}

const ALL_AXES: AxisKey[] = [
  "overall",
  "speed",
  "spin",
  "control",
  "ballHold",
  "arc",
  "hardness",
];

export async function getEquipmentAxisPositions(
  equipmentId: string,
): Promise<AxisPosition[]> {
  const [equipments, rows] = await Promise.all([
    prisma.equipment.findMany({
      where: { isActive: true },
      select: { id: true, category: true },
    }),
    prisma.comparison.findMany({
      select: {
        optionAEquipmentId: true,
        optionBEquipmentId: true,
        hasActualExperience: true,
        winnerOverall: true,
        winnerSpeed: true,
        winnerSpin: true,
        winnerControl: true,
        winnerHardness: true,
        winnerBallHold: true,
        winnerArc: true,
      },
    }),
  ]);
  const cat = new Map(equipments.map((e) => [e.id, e.category]));
  const isRubberPair = (a: string, b: string) =>
    isRubberCategory(cat.get(a) ?? "") && isRubberCategory(cat.get(b) ?? "");

  const positions: AxisPosition[] = [];
  for (const axis of ALL_AXES) {
    const col = AXIS_COLUMN[axis];
    const inputs: PairwiseInput[] = [];
    let both = 0;
    for (const r of rows as ComparisonAxisRow[]) {
      const winner = r[col];
      if (winner !== "A" && winner !== "B" && winner !== "SAME") continue;
      if (!isRubberPair(r.optionAEquipmentId, r.optionBEquipmentId)) continue;
      inputs.push({
        aId: r.optionAEquipmentId,
        bId: r.optionBEquipmentId,
        winner,
        weight: experienceWeight(r.hasActualExperience),
      });
      if (
        r.hasActualExperience === "BOTH" &&
        (r.optionAEquipmentId === equipmentId ||
          r.optionBEquipmentId === equipmentId)
      ) {
        both++;
      }
    }
    const { ratings } = computeAxisRatings(inputs);
    const mine = ratings.get(equipmentId);
    if (!mine) continue;
    const ranked = [...ratings.values()].sort(
      (a, b) => b.logStrength - a.logStrength,
    );
    const rank = ranked.findIndex((r) => r.id === equipmentId) + 1;
    positions.push({
      axis,
      score: mine.score,
      comparisons: mine.comparisons,
      bothComparisons: both,
      rank,
      totalRanked: ranked.length,
    });
  }
  return positions;
}
