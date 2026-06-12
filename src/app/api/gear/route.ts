import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateSessionId, getSessionId } from "@/lib/session";
import { gearSchema } from "@/lib/types";

// マイギア (使ったことのある用具 + 使用条件) の管理

async function syncCurrentRubber(sessionId: string) {
  // 現用FHラバーを SessionProgress.currentRubberId に同期 (乗り換え検討の基準点)
  const currentFh = await prisma.gearItem.findFirst({
    where: { sessionId, isCurrent: true, side: "FH" },
    orderBy: { createdAt: "desc" },
  });
  await prisma.sessionProgress.upsert({
    where: { sessionId },
    create: { sessionId, currentRubberId: currentFh?.equipmentId ?? null },
    update: { currentRubberId: currentFh?.equipmentId ?? null },
  });
}

export async function GET() {
  const sessionId = await getSessionId();
  if (!sessionId) return NextResponse.json({ gear: [] });
  const gear = await prisma.gearItem.findMany({
    where: { sessionId },
    include: {
      equipment: {
        select: { id: true, name: true, manufacturer: true, category: true, imageUrl: true },
      },
      blade: { select: { id: true, name: true } },
    },
    orderBy: [{ isCurrent: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ gear });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = gearSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "入力内容が不正です" }, { status: 400 });
  }
  const { equipmentId, side, thickness, bladeEquipmentId, isCurrent } =
    parsed.data;

  const equipment = await prisma.equipment.findUnique({
    where: { id: equipmentId },
    select: { id: true, category: true },
  });
  if (!equipment?.category.startsWith("RUBBER_")) {
    return NextResponse.json(
      { error: "ラバーが見つかりません" },
      { status: 400 },
    );
  }
  if (bladeEquipmentId) {
    const blade = await prisma.equipment.findUnique({
      where: { id: bladeEquipmentId },
      select: { category: true },
    });
    if (blade?.category !== "BLADE") {
      return NextResponse.json(
        { error: "ラケットが見つかりません" },
        { status: 400 },
      );
    }
  }

  const sessionId = await getOrCreateSessionId();

  // 同一用具×同一面の重複登録は更新扱い
  const existing = await prisma.gearItem.findFirst({
    where: { sessionId, equipmentId, side },
  });

  if (isCurrent) {
    // 現用は面ごとに1本
    await prisma.gearItem.updateMany({
      where: { sessionId, side, isCurrent: true },
      data: { isCurrent: false },
    });
  }

  const item = existing
    ? await prisma.gearItem.update({
        where: { id: existing.id },
        data: {
          // 再追加時に未指定 (UNKNOWN/null) で既存の詳細情報を潰さない
          thickness: thickness === "UNKNOWN" ? existing.thickness : thickness,
          bladeEquipmentId: bladeEquipmentId ?? existing.bladeEquipmentId,
          isCurrent: isCurrent ?? existing.isCurrent,
        },
      })
    : await prisma.gearItem.create({
        data: {
          sessionId,
          equipmentId,
          side,
          thickness,
          bladeEquipmentId: bladeEquipmentId ?? null,
          isCurrent: isCurrent ?? false,
        },
      });

  await syncCurrentRubber(sessionId);
  return NextResponse.json({ ok: true, id: item.id });
}

export async function DELETE(request: Request) {
  const sessionId = await getSessionId();
  if (!sessionId) {
    return NextResponse.json({ error: "session_required" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id が必要です" }, { status: 400 });
  }
  // 自分のギアのみ削除可能
  await prisma.gearItem.deleteMany({ where: { id, sessionId } });
  await syncCurrentRubber(sessionId);
  return NextResponse.json({ ok: true });
}
