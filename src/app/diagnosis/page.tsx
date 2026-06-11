import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionId, getUserId } from "@/lib/session";
import { getAnswersForDiagnosis } from "@/lib/data";
import { diagnose, tendencyRows } from "@/lib/diagnosis";
import { DIAGNOSIS_MILESTONE } from "@/lib/types";
import { ShareButton } from "@/components/share-button";

export const metadata = { title: "スタイル診断" };

// M5: スタイル診断画面 (30問達成の集大成)
export default async function DiagnosisPage() {
  const sessionId = await getSessionId();
  if (!sessionId) redirect("/onboarding");
  const progress = await prisma.sessionProgress.findUnique({
    where: { sessionId },
  });
  if (!progress) redirect("/onboarding");
  if (progress.answerCount < DIAGNOSIS_MILESTONE) redirect("/play");

  const answers = await getAnswersForDiagnosis(sessionId);
  const result = diagnose(answers);

  if (progress.diagnosedStyle !== result.styleName) {
    await prisma.sessionProgress.update({
      where: { sessionId },
      data: { diagnosedStyle: result.styleName },
    });
  }

  // 該当率: 診断済みセッション全体のうち同じスタイルの割合
  const [total, same] = await Promise.all([
    prisma.sessionProgress.count({ where: { diagnosedStyle: { not: null } } }),
    prisma.sessionProgress.count({
      where: { diagnosedStyle: result.styleName },
    }),
  ]);
  const sharePct = total > 0 ? Math.round((same / total) * 100) : null;

  const userId = await getUserId();

  return (
    <div className="mx-auto max-w-md py-8">
      <p className="mb-4 text-center font-mono text-sm text-tt-gray70">
        {DIAGNOSIS_MILESTONE} / {DIAGNOSIS_MILESTONE}問達成
      </p>

      <div className="animate-pop rounded-3xl bg-gradient-to-br from-tt-soft-green via-white to-tt-soft-coral p-8 text-center shadow-sm ring-1 ring-tt-green/20">
        <p className="text-sm font-medium text-tt-deep-green">
          あなたの卓球用具スタイル
        </p>
        <h1 className="mt-3 text-3xl font-bold leading-snug text-tt-deep-green">
          {result.styleName}
        </h1>
        {sharePct !== null && (
          <p className="mt-3 inline-block rounded-full bg-white/80 px-4 py-1.5 text-sm text-tt-gray70 ring-1 ring-black/5">
            全プレイヤーの
            <span className="font-mono font-bold text-tt-deep-green">
              {sharePct}%
            </span>
            が該当
          </p>
        )}
      </div>

      <div className="animate-rise mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 [animation-delay:120ms]">
        <h2 className="mb-3 font-bold">傾向スコア</h2>
        <div className="space-y-3">
          {tendencyRows(result).map((row) => (
            <div key={row.label}>
              <div className="flex justify-between text-sm">
                <span>{row.label}</span>
                <span className="font-mono font-bold">
                  +{row.value.toFixed(1)}
                </span>
              </div>
              <div className="mt-1 h-2.5 rounded-full bg-tt-gray30/30">
                <div
                  className="bar-grow h-2.5 rounded-full bg-gradient-to-r from-tt-green to-tt-deep-green"
                  style={{ width: `${Math.min(row.value * 33, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 space-y-3 text-center">
        {userId ? (
          <Link
            href="/me"
            className="block rounded-full bg-gradient-to-r from-tt-green to-tt-deep-green px-8 py-3.5 font-bold text-white shadow-lg shadow-tt-green/25 transition hover:opacity-90 active:scale-95"
          >
            マイページで見る
          </Link>
        ) : (
          <Link
            href="/signup"
            className="block rounded-full bg-gradient-to-r from-tt-green to-tt-deep-green px-8 py-3.5 font-bold text-white shadow-lg shadow-tt-green/25 transition hover:opacity-90 active:scale-95"
          >
            登録して詳細レポートを見る
          </Link>
        )}
        <ShareButton styleName={result.styleName} sharePct={sharePct} />
        <Link href="/play" className="block text-sm text-tt-gray70 underline">
          登録せず続ける
        </Link>
      </div>
    </div>
  );
}
