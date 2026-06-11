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
): Promise<Array<{ name: string; manufacturer: string; wins: number }>> {
  const similar = await prisma.comparison.findMany({
    where: {
      sessionId: { not: excludeSessionId },
      contextLevel: level,
      contextPlaystyle: playstyle,
      winnerOverall: { in: ["A", "B"] },
    },
    include: {
      optionA: { select: { name: true, manufacturer: true } },
      optionB: { select: { name: true, manufacturer: true } },
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
            optionA: { select: { name: true, manufacturer: true } },
            optionB: { select: { name: true, manufacturer: true } },
          },
          take: 500,
          orderBy: { answeredAt: "desc" },
        });

  const wins = new Map<string, { name: string; manufacturer: string; wins: number }>();
  for (const c of pool) {
    const winner = c.winnerOverall === "A" ? c.optionA : c.optionB;
    const key = `${winner.manufacturer}|${winner.name}`;
    const entry = wins.get(key) ?? { ...winner, wins: 0 };
    entry.wins++;
    wins.set(key, entry);
  }
  return [...wins.values()].sort((a, b) => b.wins - a.wins).slice(0, take);
}
