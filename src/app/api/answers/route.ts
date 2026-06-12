import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionId, getUserId } from "@/lib/session";
import { answerSchema, isRubberCategory } from "@/lib/types";
import { tallyPair } from "@/lib/data";

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
  const { optionAEquipmentId, optionBEquipmentId, axis, winner } = parsed.data;

  const [optionA, optionB, gearItems] = await Promise.all([
    prisma.equipment.findUnique({ where: { id: optionAEquipmentId } }),
    prisma.equipment.findUnique({ where: { id: optionBEquipmentId } }),
    prisma.gearItem.findMany({ where: { sessionId } }),
  ]);
  if (!optionA || !optionB || optionA.id === optionB.id) {
    return NextResponse.json({ error: "用具が見つかりません" }, { status: 400 });
  }

  // 経験フラグはマイギアから自動判定 (クライアントには聞かない)
  const gearA = gearItems.find((g) => g.equipmentId === optionAEquipmentId);
  const gearB = gearItems.find((g) => g.equipmentId === optionBEquipmentId);
  const hasActualExperience =
    gearA && gearB ? "BOTH" : gearA || gearB ? "ONE" : "NEITHER";

  const userId = await getUserId();
  const axisColumn = {
    overall: "winnerOverall",
    speed: "winnerSpeed",
    spin: "winnerSpin",
    control: "winnerControl",
    hardness: "winnerHardness",
    ballHold: "winnerBallHold",
  }[axis] as
    | "winnerOverall"
    | "winnerSpeed"
    | "winnerSpin"
    | "winnerControl"
    | "winnerHardness"
    | "winnerBallHold";

  const newCount = progress.answerCount + 1;

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
        optionAGearItemId: gearA?.id ?? null,
        optionBGearItemId: gearB?.id ?? null,
      },
    }),
    prisma.sessionProgress.update({
      where: { sessionId },
      data: { answerCount: newCount },
    }),
  ]);

  // 回答直後の「みんなの回答」フィードバック用集計 (今回の回答を含む)
  const tally = await tallyPair(optionAEquipmentId, optionBEquipmentId);

  return NextResponse.json({
    answerCount: newCount,
    hasActualExperience,
    tally,
  });
}
