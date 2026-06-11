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
      <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-tt-green text-2xl font-bold text-white">
        {milestone}
      </div>
      <h1 className="text-2xl font-bold">{milestone}問達成！</h1>

      <div className="mt-6 rounded-xl bg-white p-5 text-left ring-1 ring-tt-gray30/40">
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
            <p className="rounded-lg bg-tt-soft-green p-3 text-center text-lg font-bold text-tt-deep-green">
              {result.styleName}
            </p>
            <p className="mt-3 text-sm text-tt-gray70">
              あと10問で詳細なスタイル診断がアンロックされます。
              登録すると、結果はいつでも見返せます。
            </p>
          </>
        )}
      </div>

      <div className="mt-6 space-y-3">
        <Link
          href="/play"
          className="block rounded-full bg-tt-green px-8 py-3 font-bold text-white transition hover:opacity-90"
        >
          続けて回答する
        </Link>
        <p className="text-sm text-tt-gray70">
          あと{nextMilestone - milestone}問で
          {nextMilestone === 30 ? "フル診断" : "次の報酬"}
        </p>
        {milestone === 20 && (
          <Link href="/signup" className="text-sm text-tt-green underline">
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
            <span className="font-mono">+{row.value.toFixed(1)}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-tt-gray30/40">
            <div
              className="h-2 rounded-full bg-tt-green"
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
      <p className="text-sm text-tt-gray70">
        まだ十分なデータがありません。あなたの回答が、これからの比較データを作ります。
      </p>
    );
  }
  return (
    <ol className="space-y-2">
      {picks.map((p, i) => (
        <li
          key={`${p.manufacturer}-${p.name}`}
          className="flex items-center gap-3 rounded-lg bg-tt-offwhite p-3"
        >
          <span className="font-mono text-sm font-bold text-tt-green">
            {i + 1}
          </span>
          <div>
            <p className="font-medium">{p.name}</p>
            <p className="text-xs text-tt-gray70">{p.manufacturer}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
