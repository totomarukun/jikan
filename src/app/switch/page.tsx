import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionId } from "@/lib/session";
import { aggregatePairs, tallyPair } from "@/lib/data";
import { feelStatements, getFeelProfile, type FeelStatement } from "@/lib/feel";
import { amazonSearchUrl, rakutenSearchUrl } from "@/lib/links";
import { VersusBar } from "@/components/versus-bar";
import { FeelProfileCard } from "@/components/feel-profile";
import {
  CandidatePicker,
  CurrentRubberSetter,
} from "@/components/switch-picker";
import type { Equipment } from "@prisma/client";

export const metadata = { title: "乗り換え検討" };

// 乗り換え検討ハブ: 「いまの自分のラバー」を基準点に候補を比較する、
// 購買検討のための中核画面。レビューの基準点問題 (企画書 2.2) への直接回答。
export default async function SwitchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const sessionId = await getSessionId();
  const progress = sessionId
    ? await prisma.sessionProgress.findUnique({ where: { sessionId } })
    : null;
  const current = progress?.currentRubberId
    ? await prisma.equipment.findUnique({
        where: { id: progress.currentRubberId },
      })
    : null;

  return (
    <div className="mx-auto max-w-md py-4">
      <h1 className="text-2xl font-bold">乗り換え検討</h1>
      <p className="mt-1 text-sm leading-6 text-tt-gray70">
        いま使っているラバーを基準に、候補を実データで比べる。
        「弾む」「球持ち」の言葉のズレに惑わされない用具選びを。
      </p>

      {!current ? (
        <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <h2 className="font-bold">まず、いま使っているラバーを教えてください</h2>
          <p className="mt-1 mb-4 text-sm text-tt-gray70">
            すべての比較が「自分の基準」で見られるようになります。
          </p>
          <CurrentRubberSetter />
        </div>
      ) : (
        <SwitchBoard current={current} sp={sp} />
      )}
    </div>
  );
}

async function SwitchBoard({
  current,
  sp,
}: {
  current: Equipment;
  sp: Record<string, string | string[] | undefined>;
}) {
  const candidateIds = (typeof sp.c === "string" ? sp.c.split(",") : [])
    .filter((id) => id && id !== current.id)
    .slice(0, 3);

  // 検討フローはラバー基準のため、候補もラバーのみに限定する
  const candidates = (
    await Promise.all(
      candidateIds.map((id) =>
        prisma.equipment.findUnique({ where: { id } }),
      ),
    )
  ).filter(
    (e): e is Equipment =>
      e != null && e.isActive && e.category.startsWith("RUBBER_"),
  );

  const [tallies, feels] = await Promise.all([
    Promise.all(candidates.map((c) => tallyPair(current.id, c.id))),
    Promise.all(
      candidates.map(async (c) =>
        feelStatements(await getFeelProfile(current.id, c.id)),
      ),
    ),
  ]);

  // ワンタップ候補: この用具と対決データがあるラバー (人気順)
  const suggestions = (
    await aggregatePairs({ involvingEquipmentId: current.id, take: 6 })
  )
    .map((p) => {
      const opponentSide = p.aId === current.id ? "B" : "A";
      return {
        id: opponentSide === "A" ? p.aId : p.bId,
        name: opponentSide === "A" ? p.nameA : p.nameB,
      };
    })
    .filter(
      (s) => !candidateIds.includes(s.id) && s.id !== current.id,
    )
    .slice(0, 4);

  return (
    <>
      {/* 基準: 現用ラバー */}
      <div className="mt-6 rounded-2xl bg-gradient-to-br from-tt-soft-green to-white p-4 shadow-sm ring-1 ring-tt-green/25">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-tt-deep-green">
              あなたの基準 (いま使用中)
            </p>
            <p className="mt-1 text-lg font-bold">{current.name}</p>
            <p className="text-xs text-tt-gray70">
              {current.manufacturer}
              {current.hardness != null && ` ・ 硬度 ${current.hardness}°`}
              {current.price != null &&
                ` ・ ¥${current.price.toLocaleString()}`}
            </p>
          </div>
          <Link
            href={`/equipment/${current.id}`}
            className="shrink-0 text-xs text-tt-green underline"
          >
            詳細
          </Link>
        </div>
      </div>

      {/* 候補追加 */}
      <div className="mt-4">
        <CandidatePicker candidateIds={candidates.map((c) => c.id)} />
        {suggestions.length > 0 && candidates.length < 3 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="text-xs text-tt-gray70">よく比較される:</span>
            {suggestions.map((s) => (
              <Link
                key={s.id}
                href={`/switch?c=${[...candidates.map((c) => c.id), s.id].join(",")}`}
                className="rounded-full bg-white px-3 py-1 text-xs font-medium shadow-sm ring-1 ring-tt-gray30/40 transition hover:bg-tt-soft-green hover:ring-tt-green"
              >
                + {s.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* 候補カード */}
      {candidates.length === 0 ? (
        <div className="mt-6 rounded-2xl border-2 border-dashed border-tt-gray30/50 p-8 text-center text-sm text-tt-gray70">
          気になるラバーを検索して候補に追加すると、
          <br />
          「{current.name}」との実データ比較がここに並びます。
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {candidates.map((cand, i) => (
            <CandidateCard
              key={cand.id}
              current={current}
              candidate={cand}
              tally={tallies[i]}
              feel={feels[i]}
              remainingIds={candidates
                .filter((c) => c.id !== cand.id)
                .map((c) => c.id)}
            />
          ))}
        </div>
      )}

      <div className="mt-8 rounded-2xl bg-tt-soft-coral p-4 text-sm ring-1 ring-tt-coral/15">
        <p className="font-bold text-tt-deep-coral">
          データが足りない対決があります？
        </p>
        <p className="mt-1 leading-6 text-tt-gray70">
          AB比較に答えるほど、あなたの「{current.name}」基準のデータが増えます。
        </p>
        <Link
          href="/play"
          className="mt-3 inline-block rounded-full bg-gradient-to-r from-tt-deep-coral to-tt-coral px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-tt-coral/20 transition hover:opacity-90 active:scale-95"
        >
          AB比較に答えてデータを増やす
        </Link>
      </div>
    </>
  );
}

function CandidateCard({
  current,
  candidate,
  tally,
  feel,
  remainingIds,
}: {
  current: Equipment;
  candidate: Equipment;
  tally: { a: number; b: number; same: number; total: number };
  feel: FeelStatement[];
  remainingIds: string[];
}) {
  const deltas: Array<{ label: string; delta: number | null; unit: string; neutral?: boolean }> = [
    {
      label: "スピード",
      delta:
        candidate.officialSpeed != null && current.officialSpeed != null
          ? candidate.officialSpeed - current.officialSpeed
          : null,
      unit: "",
    },
    {
      label: "スピン",
      delta:
        candidate.officialSpin != null && current.officialSpin != null
          ? candidate.officialSpin - current.officialSpin
          : null,
      unit: "",
    },
    {
      label: "硬度",
      delta:
        candidate.hardness != null && current.hardness != null
          ? candidate.hardness - current.hardness
          : null,
      unit: "°",
      neutral: true,
    },
    {
      label: "価格",
      delta:
        candidate.price != null && current.price != null
          ? candidate.price - current.price
          : null,
      unit: "円",
      neutral: true,
    },
  ];

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="flex items-start justify-between">
        <div>
          <Link
            href={`/equipment/${candidate.id}`}
            className="text-lg font-bold hover:underline"
          >
            {candidate.name}
          </Link>
          <p className="text-xs text-tt-gray70">
            {candidate.manufacturer}
            {candidate.price != null &&
              ` ・ ¥${candidate.price.toLocaleString()}`}
          </p>
        </div>
        <Link
          href={`/switch?c=${remainingIds.join(",")}`}
          className="shrink-0 text-xs text-tt-gray70 underline"
        >
          候補から外す
        </Link>
      </div>

      {/* みんなの好み (現用 vs 候補) */}
      <div className="mt-4">
        <p className="text-xs font-bold text-tt-gray70">
          みんなの好み
          <span className="ml-2 font-mono font-normal">n={tally.total}</span>
        </p>
        {tally.total === 0 ? (
          <p className="mt-1 text-sm text-tt-gray70">
            この対決のデータはまだありません。
            <Link href="/play" className="text-tt-green underline">
              答えて最初のデータを作る
            </Link>
          </p>
        ) : (
          <div className="mt-2">
            <VersusBar
              votesA={tally.a}
              votesB={tally.b}
              votesSame={tally.same}
              nameA={`${current.name} (いまの)`}
              nameB={candidate.name}
            />
          </div>
        )}
      </div>

      {/* 体感翻訳: あなたの現用基準で他人の感覚を読む */}
      <div className="mt-4">
        <p className="text-xs font-bold text-tt-gray70">
          {current.name}と比べた体感
        </p>
        <div className="mt-2">
          <FeelProfileCard
            baseName={current.name}
            targetName={candidate.name}
            statements={feel}
            compact
          />
        </div>
      </div>

      {/* スペック差分 (いまの基準) */}
      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        {deltas.map((d) => (
          <div key={d.label} className="rounded-xl bg-tt-offwhite p-2 ring-1 ring-black/5">
            <p className="text-[10px] text-tt-gray70">{d.label}</p>
            <p
              className={`font-mono text-sm font-bold ${
                d.delta == null || d.neutral || d.delta === 0
                  ? ""
                  : d.delta > 0
                    ? "text-tt-deep-green"
                    : "text-tt-deep-coral"
              }`}
            >
              {d.delta == null
                ? "—"
                : `${d.delta > 0 ? "+" : ""}${d.delta.toLocaleString()}${d.unit}`}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-1 text-[10px] text-tt-gray70">
        ※いまの{current.name}との公称値の差。硬度・価格は中立 (好み次第)。
      </p>

      {/* アクション */}
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <Link
          href={`/compare/${current.id}/vs/${candidate.id}`}
          className="rounded-full bg-gradient-to-r from-tt-green to-tt-deep-green px-5 py-2 font-bold text-white shadow shadow-tt-green/20 transition hover:opacity-90 active:scale-95"
        >
          詳細比較を見る
        </Link>
        <a
          href={amazonSearchUrl(candidate.manufacturer, candidate.name)}
          target="_blank"
          rel="noreferrer nofollow"
          className="text-xs text-tt-gray70 underline"
        >
          Amazonで探す
        </a>
        <a
          href={rakutenSearchUrl(candidate.manufacturer, candidate.name)}
          target="_blank"
          rel="noreferrer nofollow"
          className="text-xs text-tt-gray70 underline"
        >
          楽天で探す
        </a>
      </div>
    </div>
  );
}
