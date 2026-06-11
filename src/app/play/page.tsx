import { redirect } from "next/navigation";
import { getSessionId } from "@/lib/session";
import { buildQuestionPayload } from "@/lib/play";
import { PlayClient } from "@/components/play-client";

export const metadata = { title: "AB比較" };

// M3: AB比較カード (コア体験)。初回の1問はサーバーで生成して即表示する。
export default async function PlayPage() {
  const sessionId = await getSessionId();
  if (!sessionId) redirect("/onboarding");

  const payload = await buildQuestionPayload(sessionId);
  if (!payload) redirect("/onboarding");

  return <PlayClient initial={payload} />;
}
