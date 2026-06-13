import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionId } from "@/lib/session";
import { aggregatePairs, getPopularRubbers, tallyPair } from "@/lib/data";
import { feelStatements, getFeelProfile, type FeelStatement } from "@/lib/feel";
import { amazonSearchUrl, rakutenSearchUrl } from "@/lib/links";
import {
  buildSwitchCandidates,
  type SwitchCandidate,
} from "@/lib/relative-map";
import { VersusBarOrPending } from "@/components/versus-bar";
import { FeelProfileCard } from "@/components/feel-profile";
import { EquipmentVisual } from "@/components/equipment-visual";
import {
  BaseFromGear,
  CandidatePicker,
  CurrentRubberSetter,
} from "@/components/switch-picker";
import { GEAR_SIDE_LABELS, type GearSide } from "@/lib/types";
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

  // 基準の切り替え: マイギアのラバーなら ?base= でFH/BHどちらの基準でも検討できる
  // (フォアとバックで選定基準は別物 — 現用FH固定にしない)
  const gearRubbers = sessionId
    ? await prisma.gearItem.findMany({
        where: { sessionId, equipment: { category: { startsWith: "RUBBER_" } } },
        include: { equipment: { select: { id: true, name: true } } },
        orderBy: [{ isCurrent: "desc" }, { createdAt: "asc" }],
      })
    : [];
  const baseOptions: Array<{
    id: string;
    name: string;
    sides: string[];
    isCurrent: boolean;
  }> = [];
  for (const g of gearRubbers) {
    const found = baseOptions.find((o) => o.id === g.equipmentId);
    const sideLabel = GEAR_SIDE_LABELS[g.side as GearSide] ?? g.side;
    if (found) {
      if (!found.sides.includes(sideLabel)) found.sides.push(sideLabel);
      found.isCurrent = found.isCurrent || g.isCurrent;
    } else {
      baseOptions.push({
        id: g.equipmentId,
        name: g.equipment.name,
        sides: [sideLabel],
        isCurrent: g.isCurrent,
      });
    }
  }

  const baseId = typeof sp.base === "string" ? sp.base : null;
  let current: Equipment | null = null;
  if (baseId && baseOptions.some((o) => o.id === baseId)) {
    current = await prisma.equipment.findUnique({ where: { id: baseId } });
    if (current && (!current.isActive || !current.category.startsWith("RUBBER_"))) {
      current = null;
    }
  }
  if (!current && progress?.currentRubberId) {
    current = await prisma.equipment.findUnique({
      where: { id: progress.currentRubberId },
    });
  }

  return (
    <div className="mx-auto max-w-md py-4">
      <h1 className="text-2xl font-bold">乗り換え検討</h1>
      <p className="mt-1 text-sm leading-6 text-tt-gray70">
        いま使っているラバーを基準に、候補を実データで比べる。
        「弾む」「球持ち」の言葉のズレに惑わされない用具選びを。
      </p>

      {!current ? (
        <NoBaseSetup sessionId={sessionId} />
      ) : (
        <SwitchBoard
          current={current}
          sp={sp}
          baseOptions={baseOptions}
          sessionId={sessionId}
        />
      )}
    </div>
  );
}

const SWITCH_AXIS_LABEL: Record<string, string> = {
  overall: "好み",
  speed: "スピード",
  spin: "スピン",
  control: "コントロール",
  ballHold: "球持ち",
  arc: "弧線",
  tackiness: "粘着",
  hardness: "硬さ",
};

// 相対マップ(推移律)から、基準に対する候補を軸別差分つきで出す。
// 直接対決がなくても他の比較経由で「基準よりスピード上/球持ち同等」が出るため、
// コールドスタートでも「集計中」で固まらず、必ず手応えのある候補が並ぶ。
async function RelativeCandidates({
  baseId,
  baseName,
}: {
  baseId: string;
  baseName: string;
}) {
  const { baseRanked, candidates } = await buildSwitchCandidates(baseId, 6);
  if (!baseRanked || candidates.length === 0) {
    return (
      <section className="mt-4 rounded-2xl border border-dashed border-tt-gray30/50 bg-white p-4 text-sm text-tt-gray70">
        <p className="font-bold text-tt-charcoal">相対マップから見た候補</p>
        <p className="mt-1">
          「{baseName}」を含む比較がまだありません。
          <Link href="/play" className="font-bold text-tt-green underline">
            ひと比較
          </Link>
          答えると、ここに{baseName}基準の候補が並び始めます（1票から育ちます）。
        </p>
      </section>
    );
  }
  return (
    <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <p className="font-bold">相対マップから見た候補</p>
      <p className="mt-0.5 text-xs text-tt-gray70">
        みんなの比較を合成した相対評価で、「{baseName}」と比べた各軸の違い。
        直接対決がなくても、他の比較を経由して位置が決まります。
      </p>
      <ul className="mt-3 space-y-2">
        {candidates.map((c) => (
          <RelativeCandidateRow key={c.id} c={c} baseName={baseName} />
        ))}
      </ul>
    </section>
  );
}

function RelativeCandidateRow({
  c,
  baseName,
}: {
  c: SwitchCandidate;
  baseName: string;
}) {
  const sym = (d: string) =>
    d === "up" ? "▲" : d === "down" ? "▼" : "≈";
  const color = (d: string) =>
    d === "up"
      ? "text-tt-deep-green"
      : d === "down"
        ? "text-tt-deep-coral"
        : "text-tt-gray70";
  // 支持が薄い軸は「量」を信用できない(疎データの飽和値)。確信度が乗るまで
  // 数値を出さず方向のみ・グレーに縮約する。閾値=実比較3件。
  const LOW = 3;
  const provisional = c.axes.some((a) => a.comparisons < LOW);
  return (
    <li>
      <Link
        href={`/equipment/${c.id}`}
        className="block rounded-xl bg-tt-offwhite p-3 ring-1 ring-black/5 transition hover:bg-tt-soft-green"
      >
        <div className="flex items-center gap-2">
          <EquipmentVisual
            category={c.category}
            manufacturer={c.manufacturer}
            imageUrl={c.imageUrl}
            name={c.name}
            size={28}
          />
          <span className="min-w-0 flex-1 truncate text-sm font-bold">
            {c.name}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-tt-gray70">
            共通{c.sharedAxes}軸
          </span>
          {provisional && (
            <span className="shrink-0 rounded-full bg-tt-gray30/40 px-1.5 py-0.5 text-[9px] font-bold text-tt-gray70">
              参考程度
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {c.axes.map((a) => {
            const low = a.comparisons < LOW;
            return (
              <span
                key={a.axis}
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-black/5 ${
                  low ? "bg-tt-gray30/20 text-tt-gray70" : `bg-white ${color(a.diff)}`
                }`}
              >
                {SWITCH_AXIS_LABEL[a.axis] ?? a.axis} {sym(a.diff)}
                {/* 量は支持が十分なときだけ出す。薄い根拠では方向のみ。 */}
                {!low && a.diff !== "even" && a.scoreDelta !== 0 && (
                  <span className="ml-0.5 font-mono">
                    {a.scoreDelta > 0 ? "+" : ""}
                    {a.scoreDelta}
                  </span>
                )}
                <span className="ml-0.5 font-mono text-[9px] opacity-60">
                  n{a.comparisons}
                </span>
              </span>
            );
          })}
        </div>
        <p className="mt-1 text-[10px] text-tt-gray70">
          {baseName}比 ・ 数値=相対位置の差(0-100) ・ n=支持本数 ・ 薄い根拠(グレー)は
          方向のみ ▲高い ▼低い ≈同等
        </p>
      </Link>
    </li>
  );
}

// 基準未設定時: マイギアがあればワンタップで基準にできる (再入力させない)
async function NoBaseSetup({ sessionId }: { sessionId: string | null }) {
  const gearItems = sessionId
    ? await prisma.gearItem.findMany({
        where: { sessionId, equipment: { category: { startsWith: "RUBBER_" } } },
        include: { equipment: { select: { id: true, name: true } } },
        orderBy: [{ isCurrent: "desc" }, { createdAt: "desc" }],
        take: 6,
      })
    : [];
  const seen = new Set<string>();
  const chips = gearItems
    .filter((g) => !seen.has(g.equipmentId) && seen.add(g.equipmentId))
    .map((g) => ({ equipmentId: g.equipmentId, name: g.equipment.name }));

  return (
    <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <h2 className="font-bold">まず、基準にするラバーを選んでください</h2>
      <p className="mt-1 mb-4 text-sm text-tt-gray70">
        すべての比較が「自分の基準」で見られるようになります。
      </p>
      <BaseFromGear gear={chips} />
      <CurrentRubberSetter />
    </div>
  );
}

async function SwitchBoard({
  current,
  sp,
  baseOptions,
  sessionId,
}: {
  current: Equipment;
  sp: Record<string, string | string[] | undefined>;
  baseOptions: Array<{
    id: string;
    name: string;
    sides: string[];
    isCurrent: boolean;
  }>;
  sessionId: string | null;
}) {
  let candidateIds = (typeof sp.c === "string" ? sp.c.split(",") : [])
    .filter((id) => id && id !== current.id)
    .slice(0, 3);

  // 候補が未指定なら、自分が基準ラバーと比較回答済みのラバーを自動で候補にする。
  // せっかく実体験を答えたのに乗り換え画面が空のまま、という分断を防ぐ。
  let autoFilledFromMyAnswers = false;
  if (candidateIds.length === 0 && sessionId) {
    const myRows = await prisma.comparison.findMany({
      where: {
        sessionId,
        OR: [
          { optionAEquipmentId: current.id },
          { optionBEquipmentId: current.id },
        ],
      },
      orderBy: { answeredAt: "desc" },
      select: { optionAEquipmentId: true, optionBEquipmentId: true },
    });
    const opp: string[] = [];
    for (const r of myRows) {
      const id =
        r.optionAEquipmentId === current.id
          ? r.optionBEquipmentId
          : r.optionAEquipmentId;
      if (id !== current.id && !opp.includes(id)) opp.push(id);
    }
    candidateIds = opp.slice(0, 3);
    autoFilledFromMyAnswers = candidateIds.length > 0;
  }

  // 基準切り替え時も検討中の候補は引き継ぐ (新基準と同じ候補は表示側で除外される)
  const keepCandidates =
    typeof sp.c === "string" && sp.c ? `&c=${encodeURIComponent(sp.c)}` : "";
  const currentBase = baseOptions.find((o) => o.id === current.id);
  const baseLabel = currentBase
    ? `あなたの基準 (${currentBase.sides.join("・")}面${
        currentBase.isCurrent ? "・いま使用中" : "で使用歴あり"
      })`
    : "あなたの基準 (いま使用中)";

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
  let suggestionsLabel = "よく比較される:";
  let suggestions = (
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
  // 対決データがまだない基準でも、検索ゼロで検討を始められるようにする
  if (suggestions.length === 0) {
    suggestionsLabel = "よく使われている:";
    suggestions = (
      await getPopularRubbers(4, [current.id, ...candidateIds])
    ).map((p) => ({ id: p.id, name: p.name }));
  }

  return (
    <>
      {/* 基準: 現用ラバー */}
      <div className="mt-6 rounded-2xl bg-gradient-to-br from-tt-soft-green to-white p-4 shadow-sm ring-1 ring-tt-green/25">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <EquipmentVisual
              category={current.category}
              manufacturer={current.manufacturer}
              imageUrl={current.imageUrl}
              name={current.name}
              size={52}
            />
            <div>
            <p className="text-xs font-bold text-tt-deep-green">
              {baseLabel}
            </p>
            <p className="mt-1 text-lg font-bold">{current.name}</p>
            <p className="text-xs text-tt-gray70">
              {current.manufacturer}
              {current.hardness != null && ` ・ 硬度 ${current.hardness}°`}
              {current.price != null &&
                ` ・ ¥${current.price.toLocaleString()}`}
            </p>
            </div>
          </div>
          <Link
            href={`/equipment/${current.id}`}
            className="shrink-0 text-xs text-tt-green underline"
          >
            詳細
          </Link>
        </div>
      </div>

      {/* 基準の切り替え: フォアとバックで選定基準は別物なので、
          マイギアのラバーならどれでも基準にできる */}
      {baseOptions.length > 1 && (
        <div className="mt-3">
          <p className="text-[11px] font-bold text-tt-gray70">基準を切り替え</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {baseOptions.map((o) =>
              o.id === current.id ? (
                <span
                  key={o.id}
                  className="rounded-full bg-tt-deep-green px-3 py-1.5 text-xs font-bold text-white"
                >
                  {o.name} ({o.sides.join("・")})
                </span>
              ) : (
                <Link
                  key={o.id}
                  href={`/switch?base=${o.id}${keepCandidates}`}
                  className="rounded-full bg-white px-3 py-1.5 text-xs ring-1 ring-tt-gray30/50 transition hover:bg-tt-soft-green hover:ring-tt-green/40"
                >
                  {o.name} ({o.sides.join("・")})
                </Link>
              ),
            )}
          </div>
        </div>
      )}

      {/* 相対マップから見た乗り換え候補 (推移律。疎データでも必ず何か返す) */}
      <RelativeCandidates baseId={current.id} baseName={current.name} />

      {/* 候補追加 (追加中は「集計しています…」を必ず表示) */}
      <div className="mt-4">
        <CandidatePicker
          candidateIds={candidates.map((c) => c.id)}
          suggestions={suggestions.map((s) => ({
            equipmentId: s.id,
            name: s.name,
          }))}
          suggestionsLabel={suggestionsLabel}
          baseId={current.id}
        />
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
          {autoFilledFromMyAnswers && (
            <p className="rounded-xl bg-tt-soft-green p-3 text-xs text-tt-deep-green ring-1 ring-tt-green/20">
              あなたが「{current.name}」と比較した候補を表示しています。
            </p>
          )}
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

      {/* 検討まとめ: 候補を並べた後の「で、どれにする？」に1表で答える */}
      {candidates.length >= 2 && (
        <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <h2 className="font-bold">検討まとめ</h2>
          <p className="mt-0.5 text-xs text-tt-gray70">
            基準「{current.name}」に対する候補の比較一覧。
          </p>
          <table className="mt-3 w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] text-tt-gray70">
                <th className="pb-1.5 font-medium">候補</th>
                <th className="pb-1.5 font-medium">みんなの好み</th>
                <th className="pb-1.5 text-right font-medium">公称硬度差</th>
                <th className="pb-1.5 text-right font-medium">価格差</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((cand, i) => {
                const t = tallies[i];
                const decidedPct =
                  t.total >= 3 ? Math.round((t.b / t.total) * 100) : null;
                const sameMaker = cand.manufacturer === current.manufacturer;
                const hardnessDelta =
                  sameMaker && cand.hardness != null && current.hardness != null
                    ? cand.hardness - current.hardness
                    : null;
                const priceDelta =
                  cand.price != null && current.price != null
                    ? cand.price - current.price
                    : null;
                return (
                  <tr key={cand.id} className="border-t border-tt-gray30/30">
                    <td className="py-2 pr-2">
                      <Link
                        href={`/equipment/${cand.id}`}
                        className="font-bold hover:underline"
                      >
                        {cand.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-2">
                      {decidedPct != null ? (
                        <span>
                          <span className="font-mono font-bold text-tt-deep-green">
                            {decidedPct}%
                          </span>
                          がこちら派
                          <span className="font-mono text-tt-gray70">
                            {" "}
                            (n={t.total})
                          </span>
                        </span>
                      ) : (
                        <span className="text-tt-gray70">
                          集計中 (回答{t.total}件)
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right font-mono">
                      {hardnessDelta == null
                        ? "—"
                        : `${hardnessDelta > 0 ? "+" : ""}${hardnessDelta}°`}
                    </td>
                    <td className="py-2 text-right font-mono">
                      {priceDelta == null
                        ? "—"
                        : `${priceDelta > 0 ? "+" : ""}${priceDelta.toLocaleString()}円`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-tt-gray70">
            ※「好み」は判定3件以上のみ%表示。硬度差は同一メーカー間のみ
            (各社基準が異なるため)。
          </p>
        </section>
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
  // メーカー公称の生値の差のみ表示 (独自正規化値は廃止)。
  // 硬度は同一メーカー同士のときだけ差を出す (各社基準が異なるため)
  const sameMaker = candidate.manufacturer === current.manufacturer;
  const deltas: Array<{ label: string; delta: number | null; unit: string }> = [
    {
      label: sameMaker ? "公称硬度差" : "公称硬度差(他社)",
      delta:
        sameMaker && candidate.hardness != null && current.hardness != null
          ? candidate.hardness - current.hardness
          : null,
      unit: "°",
    },
    {
      label: "価格差",
      delta:
        candidate.price != null && current.price != null
          ? candidate.price - current.price
          : null,
      unit: "円",
    },
  ];

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <EquipmentVisual
            category={candidate.category}
            manufacturer={candidate.manufacturer}
            imageUrl={candidate.imageUrl}
            name={candidate.name}
            size={48}
          />
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
        </div>
        <Link
          href={
            remainingIds.length > 0
              ? `/switch?base=${current.id}&c=${remainingIds.join(",")}`
              : `/switch?base=${current.id}`
          }
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
            {/* n が少ないうちは % を断言しない (リスト類と同じルール) */}
            <VersusBarOrPending
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

      {/* メーカー公称の差分 (いまの基準) */}
      <div className="mt-4 grid grid-cols-2 gap-2 text-center">
        {deltas.map((d) => (
          <div key={d.label} className="rounded-xl bg-tt-offwhite p-2 ring-1 ring-black/5">
            <p className="text-[10px] text-tt-gray70">{d.label}</p>
            <p className="font-mono text-sm font-bold">
              {d.delta == null
                ? "—"
                : `${d.delta > 0 ? "+" : ""}${d.delta.toLocaleString()}${d.unit}`}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-1 text-[10px] text-tt-gray70">
        ※硬度は各社独自基準のため他社間では表示しません。体感は上の実体験データを参照。
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
