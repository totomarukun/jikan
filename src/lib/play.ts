import { prisma } from "./prisma";
import { generateQuestion, type GeneratedQuestion } from "./question-generator";
import { MILESTONES } from "./types";

export interface QuestionPayload {
  question: GeneratedQuestion;
  progress: {
    answerCount: number;
    nextMilestone: number | null;
    context: {
      level: string;
      playstyle: string;
      bladeCategory: string;
    };
  };
}

/** セッションの文脈・出題履歴から次の1問を組み立てる (M3 / GET /api/question 共用) */
export async function buildQuestionPayload(
  sessionId: string,
): Promise<QuestionPayload | null> {
  const progress = await prisma.sessionProgress.findUnique({
    where: { sessionId },
  });
  if (!progress) return null;

  const [equipments, recent, grouped] = await Promise.all([
    prisma.equipment.findMany({ where: { isActive: true } }),
    prisma.comparison.findMany({
      where: { sessionId },
      orderBy: { answeredAt: "desc" },
      take: 10,
      select: { optionAEquipmentId: true, optionBEquipmentId: true },
    }),
    prisma.comparison.groupBy({
      by: ["optionAEquipmentId"],
      _count: { _all: true },
    }),
  ]);

  const appearanceCounts = new Map<string, number>(
    grouped.map((g) => [g.optionAEquipmentId, g._count._all]),
  );

  const question = generateQuestion(equipments, {
    bladeCategory: progress.bladeCategory,
    level: progress.level,
    playstyle: progress.playstyle,
    currentRubberId: progress.currentRubberId,
    recentPairs: recent.map((r) => [r.optionAEquipmentId, r.optionBEquipmentId]),
    appearanceCounts,
  });
  if (!question) return null;

  return {
    question,
    progress: {
      answerCount: progress.answerCount,
      nextMilestone: MILESTONES.find((m) => m > progress.answerCount) ?? null,
      context: {
        level: progress.level,
        playstyle: progress.playstyle,
        bladeCategory: progress.bladeCategory,
      },
    },
  };
}
