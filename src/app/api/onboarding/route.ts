import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateSessionId } from "@/lib/session";
import { onboardingSchema } from "@/lib/types";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = onboardingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "入力内容が不正です" }, { status: 400 });
  }

  const sessionId = await getOrCreateSessionId();
  const { level, playstyle, bladeCategory, currentRubberId } = parsed.data;

  // 現用ラバーは実在チェック (不正IDは黙ってスキップ扱い)
  let validRubberId: string | null = null;
  if (currentRubberId) {
    const rubber = await prisma.equipment.findUnique({
      where: { id: currentRubberId },
      select: { id: true, category: true },
    });
    if (rubber?.category.startsWith("RUBBER_")) validRubberId = rubber.id;
  }

  await prisma.sessionProgress.upsert({
    where: { sessionId },
    create: {
      sessionId,
      level,
      playstyle,
      bladeCategory,
      currentRubberId: validRubberId,
    },
    update: {
      level,
      playstyle,
      bladeCategory,
      currentRubberId: validRubberId,
    },
  });

  return NextResponse.json({ ok: true });
}
