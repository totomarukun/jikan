import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionId, getUserId } from "@/lib/session";
import { getAnswersForDiagnosis } from "@/lib/data";
import { diagnose } from "@/lib/diagnosis";
import {
  BLADE_CATEGORY_LABELS,
  DIAGNOSIS_MILESTONE,
  LEVEL_LABELS,
  PLAYSTYLE_LABELS,
  type BladeCategory,
  type Level,
  type Playstyle,
} from "@/lib/types";
import { LogoutButton } from "@/components/logout-button";

export const metadata = { title: "マイページ" };

// L1: マイページ
export default async function MyPage() {
  const userId = await getUserId();
  if (!userId) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) redirect("/login");

  const sessionId = await getSessionId();
  const answerCount = await prisma.comparison.count({ where: { userId } });

  let styleName: string | null = null;
  if (sessionId && answerCount >= DIAGNOSIS_MILESTONE) {
    const answers = await getAnswersForDiagnosis(sessionId);
    if (answers.length >= DIAGNOSIS_MILESTONE) {
      styleName = diagnose(answers).styleName;
    }
  }

  const recent = await prisma.comparison.findMany({
    where: { userId },
    include: {
      optionA: { select: { name: true } },
      optionB: { select: { name: true } },
    },
    orderBy: { answeredAt: "desc" },
    take: 5,
  });

  return (
    <div className="mx-auto max-w-md py-4">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-tt-green text-xl font-bold text-white">
          {(user.nickname ?? user.email)[0].toUpperCase()}
        </div>
        <div>
          <h1 className="text-xl font-bold">{user.nickname ?? "プレイヤー"}</h1>
          <p className="text-sm text-tt-gray70">
            {LEVEL_LABELS[user.level as Level]} ・{" "}
            {PLAYSTYLE_LABELS[user.playstyle as Playstyle]} ・{" "}
            {BLADE_CATEGORY_LABELS[user.bladeCategory as BladeCategory]}
          </p>
        </div>
      </div>

      {styleName ? (
        <div className="mt-6 rounded-xl bg-tt-soft-green p-4 ring-1 ring-tt-green/30">
          <p className="text-xs text-tt-deep-green">あなたの卓球用具スタイル</p>
          <p className="text-lg font-bold text-tt-deep-green">{styleName}</p>
          <Link href="/diagnosis" className="text-sm text-tt-green underline">
            診断結果を見る
          </Link>
        </div>
      ) : (
        <div className="mt-6 rounded-xl bg-white p-4 ring-1 ring-tt-gray30/40">
          <p className="text-sm text-tt-gray70">
            30問回答するとスタイル診断がアンロックされます（現在{" "}
            <span className="font-mono">{answerCount}</span> 問回答済み）。
          </p>
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3">
        <Link
          href="/compare/select"
          className="rounded-2xl bg-gradient-to-br from-tt-green to-tt-deep-green p-4 text-center font-bold text-white shadow-lg shadow-tt-green/20 transition hover:opacity-90 active:scale-95"
        >
          新しい対決を作成
        </Link>
        <Link
          href="/play"
          className="rounded-2xl bg-gradient-to-br from-tt-deep-coral to-tt-coral p-4 text-center font-bold text-white shadow-lg shadow-tt-coral/20 transition hover:opacity-90 active:scale-95"
        >
          AB比較を続ける
        </Link>
      </div>

      <Link
        href="/switch"
        className="mt-3 block rounded-2xl bg-tt-charcoal p-4 text-center text-sm font-bold text-white shadow-lg transition hover:opacity-90 active:scale-[0.99]"
      >
        ラバーの乗り換えを検討する →
      </Link>
      <Link
        href="/battles"
        className="mt-3 block rounded-2xl bg-white p-4 text-center text-sm font-bold shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md"
      >
        人気の対決ランキングを見る →
      </Link>

      <h2 className="mt-8 mb-3 font-bold">最近の回答</h2>
      {recent.length === 0 ? (
        <p className="text-sm text-tt-gray70">まだ回答がありません。</p>
      ) : (
        <ul className="space-y-2">
          {recent.map((c) => (
            <li
              key={c.id}
              className="rounded-lg bg-white p-3 text-sm ring-1 ring-tt-gray30/40"
            >
              <Link
                href={`/compare/${c.optionAEquipmentId}/vs/${c.optionBEquipmentId}`}
                className="hover:underline"
              >
                {c.optionA.name} <span className="text-tt-gray70">vs</span>{" "}
                {c.optionB.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-10 border-t border-tt-gray30/40 pt-4">
        <LogoutButton />
      </div>
    </div>
  );
}
