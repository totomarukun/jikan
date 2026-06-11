import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionId, getUserId } from "@/lib/session";
import { answerSchema, isRubberCategory, MILESTONES } from "@/lib/types";

export async function POST(request: Request) {
  const sessionId = await getSessionId();
  if (!sessionId) {
    return NextResponse.json({ error: "onboarding_required" }, { status: 401 });
  }
  const progress = await prisma.sessionProgress.findUnique({
    where: { sessionId },
  });
  if (!progress) {
    return NextResponse.json({ error: "onboarding_required" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = answerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "入力内容が不正です" }, { status: 400 });
  }
  const { optionAEquipmentId, optionBEquipmentId, axis, winner, hasActualExperience } =
    parsed.data;

  const [optionA, optionB] = await Promise.all([
    prisma.equipment.findUnique({ where: { id: optionAEquipmentId } }),
    prisma.equipment.findUnique({ where: { id: optionBEquipmentId } }),
  ]);
  if (!optionA || !optionB || optionA.id === optionB.id) {
    return NextResponse.json({ error: "用具が見つかりません" }, { status: 400 });
  }

  const userId = await getUserId();
  const axisColumn = {
    overall: "winnerOverall",
    speed: "winnerSpeed",
    spin: "winnerSpin",
    control: "winnerControl",
  }[axis] as "winnerOverall" | "winnerSpeed" | "winnerSpin" | "winnerControl";

  const newCount = progress.answerCount + 1;
  const unlocked: number[] = JSON.parse(progress.unlockedMilestones);
  const reachedMilestone =
    MILESTONES.find((m) => m === newCount && !unlocked.includes(m)) ?? null;
  if (reachedMilestone) unlocked.push(reachedMilestone);

  await prisma.$transaction([
    prisma.comparison.create({
      data: {
        sessionId,
        userId,
        category: isRubberCategory(optionA.category) ? "rubber" : "blade",
        optionAEquipmentId,
        optionBEquipmentId,
        contextPlaystyle: progress.playstyle,
        contextLevel: progress.level,
        contextBladeCategory: progress.bladeCategory,
        contextGrip: progress.grip,
        [axisColumn]: winner,
        hasActualExperience,
      },
    }),
    prisma.sessionProgress.update({
      where: { sessionId },
      data: {
        answerCount: newCount,
        unlockedMilestones: JSON.stringify(unlocked),
      },
    }),
  ]);

  return NextResponse.json({
    answerCount: newCount,
    reachedMilestone,
    nextMilestone: MILESTONES.find((m) => m > newCount) ?? null,
  });
}
