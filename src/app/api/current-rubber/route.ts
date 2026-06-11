import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrCreateSessionId } from "@/lib/session";

// 現用フォア面ラバーの設定/変更 (乗り換え検討ハブ・マイページから)
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = z
    .object({ equipmentId: z.string().min(1).nullable() })
    .safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "入力内容が不正です" }, { status: 400 });
  }

  let equipmentId = parsed.data.equipmentId;
  if (equipmentId) {
    const rubber = await prisma.equipment.findUnique({
      where: { id: equipmentId },
      select: { id: true, category: true },
    });
    if (!rubber?.category.startsWith("RUBBER_")) {
      return NextResponse.json(
        { error: "ラバーが見つかりません" },
        { status: 400 },
      );
    }
    equipmentId = rubber.id;
  }

  const sessionId = await getOrCreateSessionId();
  await prisma.sessionProgress.upsert({
    where: { sessionId },
    create: { sessionId, currentRubberId: equipmentId },
    update: { currentRubberId: equipmentId },
  });

  return NextResponse.json({ ok: true });
}
