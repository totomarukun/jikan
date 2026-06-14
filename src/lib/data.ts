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

/** 定番ラバー (登録実績が少ないうちのワンタップ候補のフォールバック) */
const STAPLE_RUBBER_NAMES = [
  "ロゼナ",
  "テナジー05",
  "ファスタークG-1",
  "マークV",
  "ラクザ7",
  "ヴェガアジア",
  "V>15エキストラ",
  "エボリューションMX-P",
];

/**
 * よく使われているラバーの上位を返す (マイギア登録数の多い順)。
 * 登録がまだ少ないうちは定番ラバーで埋める。
 */
export async function getPopularRubbers(
  take = 8,
  excludeIds: string[] = [],
): Promise<Array<{ id: string; name: string; manufacturer: string }>> {
  const grouped = await prisma.gearItem.groupBy({
    by: ["equipmentId"],
    _count: { equipmentId: true },
    orderBy: { _count: { equipmentId: "desc" } },
    take: take * 3,
  });
  const byCount = grouped
    .map((g) => g.equipmentId)
    .filter((id) => !excludeIds.includes(id));
  const fromGear = (
    await prisma.equipment.findMany({
      where: {
        id: { in: byCount },
        isActive: true,
        category: { startsWith: "RUBBER_" },
      },
      select: { id: true, name: true, manufacturer: true },
    })
  ).sort((a, b) => byCount.indexOf(a.id) - byCount.indexOf(b.id));

  const out = fromGear.slice(0, take);
  if (out.length < take) {
    const staples = await prisma.equipment.findMany({
      where: {
        name: { in: STAPLE_RUBBER_NAMES },
        isActive: true,
        category: { startsWith: "RUBBER_" },
        id: { notIn: [...excludeIds, ...out.map((o) => o.id)] },
      },
      select: { id: true, name: true, manufacturer: true },
    });
    staples.sort(
      (a, b) =>
        STAPLE_RUBBER_NAMES.indexOf(a.name) - STAPLE_RUBBER_NAMES.indexOf(b.name),
    );
    out.push(...staples.slice(0, take - out.length));
  }
  return out;
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
  /** この回答数未満のペアを除外 (n=1 の100%表示は信頼性を毀損する) */
  minTotal?: number;
  /**
   * 両方使った人 (BOTH) の判定だけを数える。
   * 看板・ランキング等の公開集計は、匿名セッションを量産した票の水増しに
   * 汚染されうるため、サーバ計算で詐称不能な実体験フラグでガードする。
   */
  experiencedOnly?: boolean;
}): Promise<PairAggregate[]> {
  const comparisons = await prisma.comparison.findMany({
    where: {
      winnerOverall: { in: ["A", "B", "SAME"] },
      ...(options?.experiencedOnly ? { hasActualExperience: "BOTH" } : {}),
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
    .filter((p) => p.total >= (options?.minTotal ?? 0))
    .sort((x, y) => y.total - x.total)
    .slice(0, options?.take ?? 20);
}

const TALLY_AXIS_COLUMN = {
  overall: "winnerOverall",
  speed: "winnerSpeed",
  spin: "winnerSpin",
  control: "winnerControl",
  hardness: "winnerHardness",
  ballHold: "winnerBallHold",
  arc: "winnerArc",
  tackiness: "winnerTackiness",
  attackEase: "winnerAttackEase",
  defenseEase: "winnerDefenseEase",
} as const;

/** 特定ペア・特定軸の即時集計 (M3 の回答後フィードバック用) */
export async function tallyPair(
  aId: string,
  bId: string,
  axis: keyof typeof TALLY_AXIS_COLUMN = "overall",
): Promise<{ a: number; b: number; same: number; total: number }> {
  // 回答直後のフィードバックは「答えた軸」の集計を返す。
  // overall 固定だと、スピン/球持ちを答えても好みの集計が出て誤解を招く。
  const col = TALLY_AXIS_COLUMN[axis];
  const rows = await prisma.comparison.findMany({
    where: {
      OR: [
        { optionAEquipmentId: aId, optionBEquipmentId: bId },
        { optionAEquipmentId: bId, optionBEquipmentId: aId },
      ],
      [col]: { in: ["A", "B", "SAME"] },
    },
    select: {
      optionAEquipmentId: true,
      [col]: true,
    },
  });
  const tally = { a: 0, b: 0, same: 0, total: rows.length };
  for (const r of rows) {
    const winner = (r as Record<string, string | null>)[col];
    const flipped = r.optionAEquipmentId === bId;
    if (winner === "SAME") tally.same++;
    else if ((winner === "A") !== flipped) tally.a++;
    else tally.b++;
  }
  return tally;
}

export interface Voice {
  comment: string;
  /** この用具(対象)を指す側の相手用具名 */
  otherName: string;
  /** 両方使った人の言葉か */
  both: boolean;
  answeredAt: Date;
}

/**
 * 用具個別ページ用: 「両方使った人の言葉」(体感コメント)。
 * 対象用具を含む比較のうちコメントがあるものを、実体験を優先して返す。
 */
export async function getEquipmentVoices(
  equipmentId: string,
  take = 8,
): Promise<Voice[]> {
  const rows = await prisma.comparison.findMany({
    where: {
      comment: { not: null },
      OR: [
        { optionAEquipmentId: equipmentId },
        { optionBEquipmentId: equipmentId },
      ],
    },
    select: {
      comment: true,
      hasActualExperience: true,
      answeredAt: true,
      optionAEquipmentId: true,
      optionA: { select: { name: true } },
      optionB: { select: { name: true } },
    },
    orderBy: { answeredAt: "desc" },
    take: take * 2,
  });
  const voices: Voice[] = rows.map((r) => {
    const isA = r.optionAEquipmentId === equipmentId;
    return {
      comment: r.comment as string,
      otherName: isA ? r.optionB.name : r.optionA.name,
      both: r.hasActualExperience === "BOTH",
      answeredAt: r.answeredAt,
    };
  });
  // 実体験を上に
  voices.sort((a, b) => Number(b.both) - Number(a.both));
  return voices.slice(0, take);
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
      // 公開する「好み勝率」も実体験基準に揃える (水増し票を排除)
      hasActualExperience: "BOTH",
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
