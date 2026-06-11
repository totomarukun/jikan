import { prisma } from "./prisma";
import type { DiagnosisInput } from "./diagnosis";

/** セッションの回答を診断ロジックの入力形式に変換して返す */
export async function getAnswersForDiagnosis(
  sessionId: string,
): Promise<DiagnosisInput[]> {
  const comparisons = await prisma.comparison.findMany({
    where: { sessionId },
    include: {
      optionA: {
        select: { officialSpeed: true, officialSpin: true, hardness: true },
      },
      optionB: {
        select: { officialSpeed: true, officialSpin: true, hardness: true },
      },
    },
    orderBy: { answeredAt: "asc" },
  });

  return comparisons.map((c) => {
    let axis = "overall";
    let winner = c.winnerOverall;
    if (c.winnerSpeed) {
      axis = "speed";
      winner = c.winnerSpeed;
    } else if (c.winnerSpin) {
      axis = "spin";
      winner = c.winnerSpin;
    } else if (c.winnerControl) {
      axis = "control";
      winner = c.winnerControl;
    } else if (c.winnerHardness) {
      axis = "hardness";
      winner = c.winnerHardness;
    } else if (c.winnerBallHold) {
      axis = "ballHold";
      winner = c.winnerBallHold;
    }
    return {
      axis,
      winner: winner ?? "UNKNOWN",
      optionA: c.optionA,
      optionB: c.optionB,
    };
  });
}

/**
 * 同じレベル × プレースタイルの他セッションで「勝ち」が多い用具の上位を返す。
 * データが少ない場合は全体集計にフォールバックする。
 */
export async function getPopularPicksForSimilarUsers(
  level: string,
  playstyle: string,
  excludeSessionId: string,
  take = 3,
): Promise<
  Array<{
    id: string;
    name: string;
    manufacturer: string;
    category: string;
    wins: number;
  }>
> {
  const similar = await prisma.comparison.findMany({
    where: {
      sessionId: { not: excludeSessionId },
      contextLevel: level,
      contextPlaystyle: playstyle,
      winnerOverall: { in: ["A", "B"] },
    },
    include: {
      optionA: { select: { id: true, name: true, manufacturer: true, category: true } },
      optionB: { select: { id: true, name: true, manufacturer: true, category: true } },
    },
    take: 500,
    orderBy: { answeredAt: "desc" },
  });

  const pool =
    similar.length >= 5
      ? similar
      : await prisma.comparison.findMany({
          where: {
            sessionId: { not: excludeSessionId },
            winnerOverall: { in: ["A", "B"] },
          },
          include: {
            optionA: { select: { id: true, name: true, manufacturer: true, category: true } },
            optionB: { select: { id: true, name: true, manufacturer: true, category: true } },
          },
          take: 500,
          orderBy: { answeredAt: "desc" },
        });

  const wins = new Map<
    string,
    {
      id: string;
      name: string;
      manufacturer: string;
      category: string;
      wins: number;
    }
  >();
  for (const c of pool) {
    const winner = c.winnerOverall === "A" ? c.optionA : c.optionB;
    const key = winner.id;
    const entry = wins.get(key) ?? { ...winner, wins: 0 };
    entry.wins++;
    wins.set(key, entry);
  }
  return [...wins.values()].sort((a, b) => b.wins - a.wins).slice(0, take);
}

export interface PairAggregate {
  aId: string;
  bId: string;
  nameA: string;
  nameB: string;
  manufacturerA: string;
  manufacturerB: string;
  votesA: number;
  votesB: number;
  votesSame: number;
  total: number;
}

/**
 * 「好み」回答をペア単位で集計して返す (回答数の多い順)。
 * Comparison は A/B の格納順が対決ごとに異なるため、ID順に正規化して集計する。
 */
export async function aggregatePairs(options?: {
  /** この用具が含まれるペアのみ */
  involvingEquipmentId?: string;
  take?: number;
  /** このペアは除外 (関連対決の自己除外用) */
  excludePair?: [string, string];
}): Promise<PairAggregate[]> {
  const comparisons = await prisma.comparison.findMany({
    where: {
      winnerOverall: { in: ["A", "B", "SAME"] },
      ...(options?.involvingEquipmentId
        ? {
            OR: [
              { optionAEquipmentId: options.involvingEquipmentId },
              { optionBEquipmentId: options.involvingEquipmentId },
            ],
          }
        : {}),
    },
    include: {
      optionA: { select: { name: true, manufacturer: true } },
      optionB: { select: { name: true, manufacturer: true } },
    },
    orderBy: { answeredAt: "desc" },
    take: 2000,
  });

  const excludeKey = options?.excludePair
    ? [...options.excludePair].sort().join("|")
    : null;

  const pairs = new Map<string, PairAggregate>();
  for (const c of comparisons) {
    const flip = c.optionAEquipmentId > c.optionBEquipmentId;
    const [aId, bId] = flip
      ? [c.optionBEquipmentId, c.optionAEquipmentId]
      : [c.optionAEquipmentId, c.optionBEquipmentId];
    const key = `${aId}|${bId}`;
    if (key === excludeKey) continue;
    const [a, b] = flip ? [c.optionB, c.optionA] : [c.optionA, c.optionB];
    const entry =
      pairs.get(key) ??
      ({
        aId,
        bId,
        nameA: a.name,
        nameB: b.name,
        manufacturerA: a.manufacturer,
        manufacturerB: b.manufacturer,
        votesA: 0,
        votesB: 0,
        votesSame: 0,
        total: 0,
      } satisfies PairAggregate);
    const winner = c.winnerOverall;
    if (winner === "SAME") entry.votesSame++;
    else if ((winner === "A") !== flip) entry.votesA++;
    else entry.votesB++;
    entry.total++;
    pairs.set(key, entry);
  }

  return [...pairs.values()]
    .sort((x, y) => y.total - x.total)
    .slice(0, options?.take ?? 20);
}

/** 特定ペアの「好み」即時集計 (M3 の回答後フィードバック用) */
export async function tallyPair(
  aId: string,
  bId: string,
): Promise<{ a: number; b: number; same: number; total: number }> {
  const rows = await prisma.comparison.findMany({
    where: {
      OR: [
        { optionAEquipmentId: aId, optionBEquipmentId: bId },
        { optionAEquipmentId: bId, optionBEquipmentId: aId },
      ],
      winnerOverall: { in: ["A", "B", "SAME"] },
    },
    select: {
      optionAEquipmentId: true,
      winnerOverall: true,
    },
  });
  const tally = { a: 0, b: 0, same: 0, total: rows.length };
  for (const r of rows) {
    const flipped = r.optionAEquipmentId === bId;
    if (r.winnerOverall === "SAME") tally.same++;
    else if ((r.winnerOverall === "A") !== flipped) tally.a++;
    else tally.b++;
  }
  return tally;
}

/** 用具個別ページ用: 対象用具の勝敗サマリ */
export async function getEquipmentRecord(equipmentId: string): Promise<{
  wins: number;
  losses: number;
  same: number;
  total: number;
}> {
  const rows = await prisma.comparison.findMany({
    where: {
      OR: [
        { optionAEquipmentId: equipmentId },
        { optionBEquipmentId: equipmentId },
      ],
      winnerOverall: { in: ["A", "B", "SAME"] },
    },
    select: { optionAEquipmentId: true, winnerOverall: true },
  });
  const record = { wins: 0, losses: 0, same: 0, total: rows.length };
  for (const r of rows) {
    const isA = r.optionAEquipmentId === equipmentId;
    if (r.winnerOverall === "SAME") record.same++;
    else if ((r.winnerOverall === "A") === isA) record.wins++;
    else record.losses++;
  }
  return record;
}
