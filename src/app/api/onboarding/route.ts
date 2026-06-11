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
  const { level, playstyle, bladeCategory } = parsed.data;

  await prisma.sessionProgress.upsert({
    where: { sessionId },
    create: { sessionId, level, playstyle, bladeCategory },
    update: { level, playstyle, bladeCategory },
  });

  return NextResponse.json({ ok: true });
}
