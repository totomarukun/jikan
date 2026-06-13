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
  const { optionAEquipmentId, optionBEquipmentId, axis, winner, comment } =
    parsed.data;
  const trimmedComment = comment?.trim() || null;

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
    arc: "winnerArc",
    tackiness: "winnerTackiness",
  }[axis] as
    | "winnerOverall"
    | "winnerSpeed"
    | "winnerSpin"
    | "winnerControl"
    | "winnerHardness"
    | "winnerBallHold"
    | "winnerArc"
    | "winnerTackiness";

  // 同一セッション×ペア×軸の再回答は「最新で上書き」する。
  // 連投で n (母数) と % を1人で水増しできると、表示している
  // データ全体の信頼が崩れるため、票は常に1セッション1票に丸める
  const existing = await prisma.comparison.findFirst({
    where: {
      sessionId,
      [axisColumn]: { not: null },
      OR: [
        { optionAEquipmentId, optionBEquipmentId },
        {
          optionAEquipmentId: optionBEquipmentId,
          optionBEquipmentId: optionAEquipmentId,
        },
      ],
    },
    orderBy: { answeredAt: "desc" },
  });

  let newCount = progress.answerCount;
  let revised = false;
  if (existing) {
    // 既存行の A/B 格納順が今回と逆なら勝者も反転させて保存する
    const flipped = existing.optionAEquipmentId === optionBEquipmentId;
    const storedWinner =
      flipped && (winner === "A" || winner === "B")
        ? winner === "A"
          ? "B"
          : "A"
        : winner;
    await prisma.comparison.update({
      where: { id: existing.id },
      data: {
        [axisColumn]: storedWinner,
        answeredAt: new Date(),
        userId: existing.userId ?? userId,
        // 経験フラグは現在のマイギアで毎回再判定する。
        // 後からギア登録した後の再回答が「イメージ」のまま固定され、
        // 「両方使った人の声」が実体験を反映しないバグを防ぐ。
        hasActualExperience,
        // コメントは送られたときだけ上書き (空送信で既存の言葉を消さない)
        ...(trimmedComment ? { comment: trimmedComment } : {}),
      },
    });
    revised = true;
  } else {
    newCount = progress.answerCount + 1;
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
          comment: trimmedComment,
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
  }

  // 回答直後の「みんなの回答」フィードバック用集計 (答えた軸・今回の回答を含む)
  const tally = await tallyPair(optionAEquipmentId, optionBEquipmentId, axis);

  return NextResponse.json({
    answerCount: newCount,
    hasActualExperience,
    tally,
    revised,
  });
}
