import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateSessionId, setUserSession } from "@/lib/session";
import { signupSchema } from "@/lib/types";

// MVP の簡易登録 (メールアドレスのみ、確認なし)。
// 本番リリース時は Supabase Auth のマジックリンクへ置き換える (README 参照)。
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "メールアドレスの形式が正しくありません" },
      { status: 400 },
    );
  }
  const { email, nickname } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "このメールアドレスは登録済みです。ログインしてください。" },
      { status: 409 },
    );
  }

  const sessionId = await getOrCreateSessionId();
  const progress = await prisma.sessionProgress.findUnique({
    where: { sessionId },
  });

  const user = await prisma.user.create({
    data: {
      email,
      nickname: nickname || null,
      playstyle: progress?.playstyle ?? "UNDECIDED",
      level: progress?.level ?? "INTERMEDIATE",
      bladeCategory: progress?.bladeCategory ?? "UNKNOWN",
      grip: progress?.grip ?? "SHAKEHAND",
      currentFhRubberId: progress?.currentRubberId ?? null,
    },
  });

  // 匿名データをユーザーに紐付け (企画書 8.2: sessionId → userId マージ)
  await prisma.$transaction([
    prisma.comparison.updateMany({
      where: { sessionId, userId: null },
      data: { userId: user.id },
    }),
    prisma.gearItem.updateMany({
      where: { sessionId, userId: null },
      data: { userId: user.id },
    }),
  ]);

  await setUserSession(user.id);
  return NextResponse.json({ ok: true });
}
