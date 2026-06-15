import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionId, getUserId } from "@/lib/session";
import { getAnswersForDiagnosis } from "@/lib/data";
import { diagnose } from "@/lib/diagnosis";
import {
  BLADE_CATEGORY_LABELS,
  MIN_DIAGNOSIS_ANSWERS,
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
  const sessionId = await getSessionId();
  // 匿名でもギア・回答・プロフィールは sessionId に紐づいて存在する。
  // ログインを壁にせず、自分の原点として見せる (登録は端末間引き継ぎの任意アップグレード)。
  if (!userId && !sessionId) redirect("/onboarding");
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId } })
    : null;

  // 登録済みは userId、匿名は sessionId で自分のデータを引く
  const ownWhere = userId ? { userId } : { sessionId: sessionId! };
  const answerCount = await prisma.comparison.count({ where: ownWhere });

  // プロフィールはオンボーディング回答 (SessionProgress) を優先する。
  // User 側はデフォルト値のまま残っている既存アカウントがあるため
  const progress = sessionId
    ? await prisma.sessionProgress.findUnique({ where: { sessionId } })
    : null;
  const profile = {
    level: progress?.level ?? user?.level ?? null,
    playstyle: progress?.playstyle ?? user?.playstyle ?? null,
    bladeCategory: progress?.bladeCategory ?? user?.bladeCategory ?? null,
  };

  let styleName: string | null = null;
  if (sessionId && answerCount >= MIN_DIAGNOSIS_ANSWERS) {
    const answers = await getAnswersForDiagnosis(sessionId);
    if (answers.length >= MIN_DIAGNOSIS_ANSWERS) {
      styleName = diagnose(answers, profile.playstyle ?? undefined).styleName;
    }
  }

  const recent = await prisma.comparison.findMany({
    where: ownWhere,
    include: {
      optionA: { select: { name: true } },
      optionB: { select: { name: true } },
    },
    orderBy: { answeredAt: "desc" },
    take: 5,
  });

  // 体感メモ (自分の回答からできる比較メモ) のペア数
  const feelPairCount = sessionId
    ? new Set(
        (
          await prisma.comparison.findMany({
            where: { sessionId },
            select: { optionAEquipmentId: true, optionBEquipmentId: true },
          })
        ).map((c) =>
          [c.optionAEquipmentId, c.optionBEquipmentId].sort().join("|"),
        ),
      ).size
    : 0;

  // 回答を「自分の体感レビュー」として読めるよう、軸ごとの自分の判定を添える
  const axisColumns: Array<{ key: keyof (typeof recent)[number]; label: string }> = [
    { key: "winnerOverall", label: "好み" },
    { key: "winnerSpeed", label: "速さ" },
    { key: "winnerSpin", label: "スピン" },
    { key: "winnerControl", label: "コントロール" },
    { key: "winnerHardness", label: "硬さ" },
    { key: "winnerBallHold", label: "球持ち" },
    { key: "winnerArc", label: "弧線" },
    { key: "winnerTackiness", label: "粘着" },
  ];

  return (
    <div className="mx-auto max-w-md py-4">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-tt-green text-xl font-bold text-white">
          {(user?.nickname ?? user?.email ?? "あ")[0].toUpperCase()}
        </div>
        <div>
          <h1 className="text-xl font-bold">{user?.nickname ?? "あなた"}</h1>
          {profile.level ? (
            <p className="text-sm text-tt-gray70">
              {LEVEL_LABELS[profile.level as Level]} ・{" "}
              {PLAYSTYLE_LABELS[profile.playstyle as Playstyle]} ・{" "}
              {BLADE_CATEGORY_LABELS[profile.bladeCategory as BladeCategory]}
            </p>
          ) : (
            <p className="text-sm text-tt-gray70">プロフィール未設定</p>
          )}
          <Link
            href="/onboarding"
            className="text-xs text-tt-gray70 underline"
          >
            プロフィールを編集
          </Link>
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
            {MIN_DIAGNOSIS_ANSWERS}問以上回答するとスタイル診断が見られます（現在{" "}
            <span className="font-mono">{answerCount}</span> 問回答済み）。
          </p>
        </div>
      )}

      <Link
        href="/gear"
        className="mt-6 block rounded-2xl bg-white p-4 text-center text-sm font-bold shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md"
      >
        マイギアを管理する →
      </Link>

      {/* 回答=資産: 自分の体感メモへの常設導線 (B1) */}
      {feelPairCount > 0 && (
        <Link
          href="/gear"
          className="mt-3 block rounded-2xl bg-tt-soft-green p-4 text-sm shadow-sm ring-1 ring-tt-green/25 transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <span className="font-bold text-tt-deep-green">
            あなたの体感メモ
          </span>
          <span className="ml-2 text-xs text-tt-gray70">
            {feelPairCount}ペア分の自分用比較メモが見られます →
          </span>
        </Link>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Link
          href="/compare/select"
          className="rounded-2xl bg-tt-green p-4 text-center font-bold text-white shadow-lg shadow-tt-green/20 transition hover:opacity-90 active:scale-95"
        >
          新しい対決を作成
        </Link>
        <Link
          href="/play"
          className="rounded-2xl bg-tt-coral p-4 text-center font-bold text-white shadow-lg shadow-tt-coral/20 transition hover:opacity-90 active:scale-95"
        >
          比較を続ける
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
          {recent.map((c) => {
            const verdicts = axisColumns
              .map(({ key, label }) => ({ label, winner: c[key] as string | null }))
              .filter(
                (v): v is { label: string; winner: string } =>
                  v.winner === "A" || v.winner === "B" || v.winner === "SAME",
              );
            return (
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
                  {c.hasActualExperience === "BOTH" && (
                    <span className="ml-2 rounded-full bg-tt-soft-green px-2 py-0.5 text-[11px] font-bold text-tt-deep-green">
                      両方使った
                    </span>
                  )}
                </Link>
                {verdicts.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {verdicts.map((v) => (
                      <span
                        key={v.label}
                        className="rounded-full bg-tt-offwhite px-2 py-0.5 text-[11px] ring-1 ring-black/5"
                      >
                        {v.label}:{" "}
                        <span className="font-bold">
                          {v.winner === "A"
                            ? c.optionA.name
                            : v.winner === "B"
                              ? c.optionB.name
                              : "同等"}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-10 border-t border-tt-gray30/40 pt-4">
        {user ? (
          <LogoutButton />
        ) : (
          <div className="rounded-2xl bg-tt-soft-green p-4 ring-1 ring-tt-green/25">
            <p className="text-sm font-bold text-tt-deep-green">
              この内容はこの端末にだけ保存されています
            </p>
            <p className="mt-1 text-xs text-tt-gray70">
              登録すると、ギア・回答・体感メモを他の端末でも引き継げます。
            </p>
            <Link
              href="/signup"
              className="mt-3 inline-block rounded-full bg-tt-green px-4 py-2 text-sm font-bold text-white transition hover:opacity-90"
            >
              登録してデータを引き継ぐ
            </Link>
            <Link
              href="/login"
              className="ml-3 text-sm text-tt-gray70 underline"
            >
              ログイン
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
