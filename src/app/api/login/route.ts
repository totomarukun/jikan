import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  adoptSessionId,
  getOrCreateSessionId,
  setUserSession,
} from "@/lib/session";
import { hashPassword, verifyPassword } from "@/lib/password";
import { loginSchema } from "@/lib/types";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "メールアドレスとパスワードを入力してください" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });
  if (!user) {
    return NextResponse.json(
      { error: "メールアドレスまたはパスワードが正しくありません" },
      { status: 401 },
    );
  }

  // パスワード照合。パスワード導入前の旧アカウントはハッシュ未設定のため、
  // 初回ログインで入力されたパスワードをそのまま設定する (救済移行)
  if (user.passwordHash) {
    if (!verifyPassword(parsed.data.password, user.passwordHash)) {
      return NextResponse.json(
        { error: "メールアドレスまたはパスワードが正しくありません" },
        { status: 401 },
      );
    }
  } else {
    if (parsed.data.password.length < 8) {
      return NextResponse.json(
        { error: "パスワードは8文字以上で設定してください" },
        { status: 400 },
      );
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(parsed.data.password) },
    });
  }

  // データ本体 (マイギア・回答・オンボーディング) はセッションに紐づくため、
  // ログイン時にユーザーの primarySessionId へ cookie を付け替えて復元する。
  // primary 未設定の旧アカウントは、過去に userId 紐付けされたデータの
  // セッションを本体として復元する (空セッションで上書きしない)
  const currentSessionId = await getOrCreateSessionId();
  let primary = user.primarySessionId;
  if (!primary) {
    const lastGear = await prisma.gearItem.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { sessionId: true },
    });
    const lastComparison = lastGear
      ? null
      : await prisma.comparison.findFirst({
          where: { userId: user.id },
          orderBy: { answeredAt: "desc" },
          select: { sessionId: true },
        });
    primary = lastGear?.sessionId ?? lastComparison?.sessionId ?? null;
  }

  if (primary && primary !== currentSessionId) {
    const [currentProgress, primaryProgress] = await Promise.all([
      prisma.sessionProgress.findUnique({
        where: { sessionId: currentSessionId },
      }),
      prisma.sessionProgress.findUnique({ where: { sessionId: primary } }),
    ]);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { primarySessionId: primary },
      }),
      prisma.comparison.updateMany({
        where: { sessionId: currentSessionId },
        data: { sessionId: primary, userId: user.id },
      }),
      prisma.gearItem.updateMany({
        where: { sessionId: currentSessionId },
        data: { sessionId: primary, userId: user.id },
      }),
      ...(currentProgress && primaryProgress
        ? [
            prisma.sessionProgress.update({
              where: { sessionId: primary },
              data: {
                answerCount:
                  primaryProgress.answerCount + currentProgress.answerCount,
              },
            }),
            prisma.sessionProgress.delete({
              where: { sessionId: currentSessionId },
            }),
          ]
        : []),
    ]);
    await adoptSessionId(primary);
  } else {
    // 過去データなし: いまのセッションを本体として登録する
    await prisma.user.update({
      where: { id: user.id },
      data: { primarySessionId: currentSessionId },
    });
    await prisma.$transaction([
      prisma.comparison.updateMany({
        where: { sessionId: currentSessionId, userId: null },
        data: { userId: user.id },
      }),
      prisma.gearItem.updateMany({
        where: { sessionId: currentSessionId, userId: null },
        data: { userId: user.id },
      }),
    ]);
  }

  await setUserSession(user.id);
  return NextResponse.json({ ok: true });
}
