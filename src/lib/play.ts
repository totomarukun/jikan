import { prisma } from "./prisma";
import {
  generateQuestion,
  type GearLite,
  type GeneratedQuestion,
} from "./question-generator";
import { GEAR_SIDE_LABELS, THICKNESS_LABELS } from "./types";
import type { GearSide, Thickness } from "./types";

export interface QuestionPayload {
  question: GeneratedQuestion & {
    /** 表示用の使用条件 例: "フォア・厚 / ビスカリア" */
    conditionA: string | null;
    conditionB: string | null;
  };
  progress: {
    answerCount: number;
    gearCount: number;
    context: {
      level: string;
      playstyle: string;
      bladeCategory: string;
    };
  };
}

function conditionLabel(gear: GearLite | null): string | null {
  if (!gear) return null;
  const side = GEAR_SIDE_LABELS[gear.side as GearSide] ?? gear.side;
  const thickness =
    gear.thickness !== "UNKNOWN"
      ? `・${THICKNESS_LABELS[gear.thickness as Thickness]}`
      : "";
  const blade = gear.bladeName ? ` / ${gear.bladeName}` : "";
  return `${side}${thickness}${blade}で使用`;
}

/** マイギアと出題履歴から次の1問を組み立てる (M3 / GET /api/question 共用) */
export async function buildQuestionPayload(
  sessionId: string,
): Promise<QuestionPayload | null> {
  const progress = await prisma.sessionProgress.findUnique({
    where: { sessionId },
  });
  if (!progress) return null;

  const [equipments, gearItems, recent] = await Promise.all([
    prisma.equipment.findMany({ where: { isActive: true } }),
    prisma.gearItem.findMany({
      where: { sessionId },
      include: { blade: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.comparison.findMany({
      where: { sessionId },
      orderBy: { answeredAt: "desc" },
      select: {
        optionAEquipmentId: true,
        optionBEquipmentId: true,
        winnerOverall: true,
        winnerSpeed: true,
        winnerSpin: true,
        winnerHardness: true,
        winnerBallHold: true,
      },
    }),
  ]);

  const gear: GearLite[] = gearItems.map((g) => ({
    id: g.id,
    equipmentId: g.equipmentId,
    side: g.side,
    thickness: g.thickness,
    bladeName: g.blade?.name ?? null,
    isCurrent: g.isCurrent,
  }));

  // 回答済みの (ペア×軸) をすべて展開して除外する。
  // 1行 (=1ペア) に複数軸の回答が入るため、1行=1軸とみなすと
  // 回答済みの質問が再出題されてしまう
  const recentAsked: Array<{ pairKey: string; axis: string }> = [];
  for (const r of recent) {
    const key = [r.optionAEquipmentId, r.optionBEquipmentId].sort().join("|");
    const answered: Array<[string, string | null]> = [
      ["overall", r.winnerOverall],
      ["speed", r.winnerSpeed],
      ["spin", r.winnerSpin],
      ["hardness", r.winnerHardness],
      ["ballHold", r.winnerBallHold],
    ];
    for (const [axis, winner] of answered) {
      if (winner) recentAsked.push({ pairKey: key, axis });
    }
  }

  const question = generateQuestion(equipments, { gear, recentAsked });
  if (!question) return null;

  return {
    question: {
      ...question,
      conditionA: conditionLabel(question.gearA),
      conditionB: conditionLabel(question.gearB),
    },
    progress: {
      answerCount: progress.answerCount,
      gearCount: gear.length,
      context: {
        level: progress.level,
        playstyle: progress.playstyle,
        bladeCategory: progress.bladeCategory,
      },
    },
  };
}
