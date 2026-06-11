import { NextResponse } from "next/server";
import { getSessionId } from "@/lib/session";
import { buildQuestionPayload } from "@/lib/play";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const sessionId = await getSessionId();
  if (!sessionId) {
    return NextResponse.json({ error: "onboarding_required" }, { status: 401 });
  }
  const progress = await prisma.sessionProgress.findUnique({
    where: { sessionId },
    select: { sessionId: true },
  });
  if (!progress) {
    return NextResponse.json({ error: "onboarding_required" }, { status: 401 });
  }

  const payload = await buildQuestionPayload(sessionId);
  if (!payload) {
    return NextResponse.json({ error: "no_question_available" }, { status: 503 });
  }
  return NextResponse.json(payload);
}
