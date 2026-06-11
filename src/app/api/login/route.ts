import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrCreateSessionId, setUserSession } from "@/lib/session";

// MVP の簡易ログイン (メールアドレスのみ)。
// 本番リリース時は Supabase Auth のマジックリンクへ置き換える (README 参照)。
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = z.object({ email: z.string().email() }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "メールアドレスの形式が正しくありません" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });
  if (!user) {
    return NextResponse.json(
      { error: "このメールアドレスは登録されていません" },
      { status: 404 },
    );
  }

  // ログイン後の匿名回答もユーザーに紐付くようマージ
  const sessionId = await getOrCreateSessionId();
  await prisma.comparison.updateMany({
    where: { sessionId, userId: null },
    data: { userId: user.id },
  });

  await setUserSession(user.id);
  return NextResponse.json({ ok: true });
}
