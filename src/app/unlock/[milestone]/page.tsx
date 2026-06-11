import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionId } from "@/lib/session";
import { getAnswersForDiagnosis, getPopularPicksForSimilarUsers } from "@/lib/data";
import { diagnose, tendencyRows } from "@/lib/diagnosis";
import { MILESTONES } from "@/lib/types";

// M4: アンロック報酬画面
export default async function UnlockPage({
  params,
}: {
  params: Promise<{ milestone: string }>;
}) {
  const { milestone: raw } = await params;
  const milestone = Number(raw);
  if (!MILESTONES.includes(milestone as (typeof MILESTONES)[number])) {
    notFound();
  }
  if (milestone === 30) redirect("/diagnosis");

  const sessionId = await getSessionId();
  if (!sessionId) redirect("/onboarding");
  const progress = await prisma.sessionProgress.findUnique({
    where: { sessionId },
  });
  if (!progress || progress.answerCount < milestone) redirect("/play");

  const answers = await getAnswersForDiagnosis(sessionId);
  const result = diagnose(answers);
  const nextMilestone = MILESTONES.find((m) => m > milestone)!;

  return (
    <div className="mx-auto max-w-md py-8 text-center">
      {/* 達成バッジ */}
      <div className="animate-pop mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-tt-green to-tt-deep-green shadow-lg shadow-tt-green/30 ring-4 ring-tt-soft-green">
        <span className="font-mono text-3xl font-bold text-white">
          {milestone}
        </span>
      </div>
      <h1 className="animate-rise mt-4 text-2xl font-bold">
        {milestone}問達成！
      </h1>

      <div className="animate-rise mt-6 rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-black/5 [animation-delay:100ms]">
        {milestone === 5 && (
          <>
            <h2 className="mb-3 font-bold">あなたの選択傾向（プチ分析）</h2>
            <TendencyBars rows={tendencyRows(result)} />
          </>
        )}
        {milestone === 10 && (
          <>
            <h2 className="mb-3 font-bold">あなたと似た傾向の人の好み</h2>
            <SimilarPicks
              level={progress.level}
              playstyle={progress.playstyle}
              sessionId={sessionId}
            />
          </>
        )}
        {milestone === 20 && (
          <>
            <h2 className="mb-3 font-bold">あなたの推定プレースタイル</h2>
            <p className="rounded-xl bg-gradient-to-br from-tt-soft-green to-white p-4 text-center text-lg font-bold text-tt-deep-green ring-1 ring-tt-green/20">
              {result.styleName}
            </p>
            <p className="mt-3 text-sm leading-6 text-tt-gray70">
              あと10問で詳細なスタイル診断がアンロックされます。
              登録すると、結果はいつでも見返せます。
            </p>
          </>
        )}
      </div>

      <div className="mt-6 space-y-3">
        <Link
          href="/play"
          className="block rounded-full bg-gradient-to-r from-tt-green to-tt-deep-green px-8 py-3.5 font-bold text-white shadow-lg shadow-tt-green/25 transition hover:opacity-90 active:scale-95"
        >
          続けて回答する
        </Link>
        <p className="text-sm text-tt-gray70">
          あと
          <span className="font-mono font-bold text-tt-green">
            {nextMilestone - milestone}
          </span>
          問で{nextMilestone === 30 ? "フル診断" : "次の報酬"}
        </p>
        {milestone === 20 && (
          <Link
            href="/signup"
            className="inline-block text-sm font-medium text-tt-green underline"
          >
            先にアカウントを作っておく
          </Link>
        )}
      </div>
    </div>
  );
}

function TendencyBars({
  rows,
}: {
  rows: Array<{ label: string; value: number }>;
}) {
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="flex justify-between text-sm">
            <span>{row.label}</span>
            <span className="font-mono font-bold">+{row.value.toFixed(1)}</span>
          </div>
          <div className="mt-1 h-2.5 rounded-full bg-tt-gray30/30">
            <div
              className="bar-grow h-2.5 rounded-full bg-gradient-to-r from-tt-green to-tt-deep-green"
              style={{ width: `${Math.min(row.value * 33, 100)}%` }}
            />
          </div>
        </div>
      ))}
      <p className="text-xs text-tt-gray70">
        ※回答数が少ないため参考程度に。続けるほど精度が上がります。
      </p>
    </div>
  );
}

async function SimilarPicks({
  level,
  playstyle,
  sessionId,
}: {
  level: string;
  playstyle: string;
  sessionId: string;
}) {
  const picks = await getPopularPicksForSimilarUsers(level, playstyle, sessionId);
  if (picks.length === 0) {
    return (
      <p className="text-sm leading-6 text-tt-gray70">
        まだ十分なデータがありません。あなたの回答が、これからの比較データを作ります。
      </p>
    );
  }
  return (
    <ol className="space-y-2">
      {picks.map((p, i) => (
        <li
          key={`${p.manufacturer}-${p.name}`}
          className="flex items-center gap-3 rounded-xl bg-tt-offwhite p-3 ring-1 ring-black/5"
        >
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold ${
              i === 0
                ? "bg-gradient-to-br from-tt-green to-tt-deep-green text-white"
                : "bg-tt-gray30/30 text-tt-gray70"
            }`}
          >
            {i + 1}
          </span>
          <div>
            <p className="font-bold">{p.name}</p>
            <p className="text-xs text-tt-gray70">{p.manufacturer}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
