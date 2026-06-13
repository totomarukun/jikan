import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateSessionId, getUserId } from "@/lib/session";
import { onboardingSchema } from "@/lib/types";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = onboardingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "入力内容が不正です" }, { status: 400 });
  }

  const sessionId = await getOrCreateSessionId();
  const { level, playstyle, bladeCategory } = parsed.data;

  // currentRubberId はマイギア (POST /api/gear) 側で同期するため、ここでは触らない
  await prisma.sessionProgress.upsert({
    where: { sessionId },
    create: { sessionId, level, playstyle, bladeCategory },
    update: { level, playstyle, bladeCategory },
  });

  // ログイン済みならアカウント側のプロフィールも同期する。
  // ここを怠ると /me がデフォルト値 (中級 等) を表示し続け、信頼を毀損する
  const userId = await getUserId();
  if (userId) {
    await prisma.user
      .update({
        where: { id: userId },
        data: { level, playstyle, bladeCategory },
      })
      .catch(() => null);
  }

  return NextResponse.json({ ok: true });
}

// プロフィール編集時のプリフィル用に現在の回答を返す
export async function GET() {
  const sessionId = await getOrCreateSessionId();
  const progress = await prisma.sessionProgress.findUnique({
    where: { sessionId },
  });
  return NextResponse.json({
    level: progress?.level ?? null,
    playstyle: progress?.playstyle ?? null,
    bladeCategory: progress?.bladeCategory ?? null,
  });
}
