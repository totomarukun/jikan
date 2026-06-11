import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionId } from "@/lib/session";
import {
  BLADE_CATEGORIES,
  BLADE_CATEGORY_LABELS,
  LEVELS,
  LEVEL_LABELS,
  PLAYSTYLES,
  PLAYSTYLE_LABELS,
  type BladeCategory,
  type Level,
  type Playstyle,
} from "@/lib/types";

export const metadata = { title: "用具対決" };

// L2: 用具対決ビュー (コア価値)

interface Filters {
  playstyle: string | null;
  level: string | null;
  blade: string | null;
  expOnly: boolean;
}

export default async function CompareViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ aId: string; bId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { aId, bId } = await params;
  const sp = await searchParams;

  const [equipA, equipB] = await Promise.all([
    prisma.equipment.findUnique({ where: { id: aId } }),
    prisma.equipment.findUnique({ where: { id: bId } }),
  ]);
  if (!equipA || !equipB || aId === bId) notFound();

  // デフォルトは「あなたと似た人で絞り込み」(セッション文脈があれば)
  const sessionId = await getSessionId();
  const progress = sessionId
    ? await prisma.sessionProgress.findUnique({ where: { sessionId } })
    : null;

  const mode = typeof sp.mode === "string" ? sp.mode : null;
  const similarDefault = mode !== "all" && progress != null;

  const filters: Filters = {
    playstyle:
      typeof sp.playstyle === "string" && sp.playstyle
        ? sp.playstyle
        : similarDefault
          ? progress.playstyle
          : null,
    level:
      typeof sp.level === "string" && sp.level
        ? sp.level
        : similarDefault
          ? progress.level
          : null,
    blade:
      typeof sp.blade === "string" && sp.blade
        ? sp.blade
        : similarDefault
          ? progress.bladeCategory
          : null,
    expOnly: sp.exp === "both",
  };

  const where = {
    OR: [
      { optionAEquipmentId: aId, optionBEquipmentId: bId },
      { optionAEquipmentId: bId, optionBEquipmentId: aId },
    ],
    ...(filters.playstyle ? { contextPlaystyle: filters.playstyle } : {}),
    ...(filters.level ? { contextLevel: filters.level } : {}),
    ...(filters.blade ? { contextBladeCategory: filters.blade } : {}),
    ...(filters.expOnly ? { hasActualExperience: "BOTH" } : {}),
  };
  const comparisons = await prisma.comparison.findMany({ where });

  // A/B を equipA / equipB 基準に正規化して集計
  const tally = {
    overall: { a: 0, b: 0, same: 0 },
    speed: { a: 0, b: 0, same: 0 },
    spin: { a: 0, b: 0, same: 0 },
  };
  for (const c of comparisons) {
    const flipped = c.optionAEquipmentId === bId;
    const add = (
      bucket: { a: number; b: number; same: number },
      winner: string | null,
    ) => {
      if (winner === "A") {
        if (flipped) bucket.b++;
        else bucket.a++;
      } else if (winner === "B") {
        if (flipped) bucket.a++;
        else bucket.b++;
      } else if (winner === "SAME") {
        bucket.same++;
      }
    };
    add(tally.overall, c.winnerOverall);
    add(tally.speed, c.winnerSpeed);
    add(tally.spin, c.winnerSpin);
  }
  const total = comparisons.length;

  const insight = buildInsight(equipA.name, equipB.name, tally.overall);

  return (
    <div className="mx-auto max-w-md py-4">
      <h1 className="text-center text-xl font-bold">
        <span className="text-tt-deep-green">{equipA.name}</span>
        <span className="mx-2 text-sm text-tt-gray70">vs</span>
        <span className="text-tt-deep-coral">{equipB.name}</span>
      </h1>
      <p className="mt-1 text-center text-xs text-tt-gray70">
        {equipA.manufacturer} / {equipB.manufacturer}
      </p>

      {/* フィルタ */}
      <form
        method="get"
        className="mt-6 rounded-xl bg-white p-4 ring-1 ring-tt-gray30/40"
      >
        <input type="hidden" name="mode" value="custom" />
        <p className="mb-2 text-sm font-medium">絞り込み</p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <FilterSelect
            name="playstyle"
            current={filters.playstyle}
            options={PLAYSTYLES.filter((p) => p !== "UNDECIDED").map((p) => [
              p,
              PLAYSTYLE_LABELS[p as Playstyle],
            ])}
            allLabel="スタイル: 全部"
          />
          <FilterSelect
            name="level"
            current={filters.level}
            options={LEVELS.filter((l) => l !== "NON_PLAYER").map((l) => [
              l,
              LEVEL_LABELS[l as Level],
            ])}
            allLabel="レベル: 全部"
          />
          <FilterSelect
            name="blade"
            current={filters.blade}
            options={BLADE_CATEGORIES.filter((b) => b !== "UNKNOWN").map(
              (b) => [b, BLADE_CATEGORY_LABELS[b as BladeCategory]],
            )}
            allLabel="ラケット: 全部"
          />
          <select
            key={filters.expOnly ? "both" : "all"}
            name="exp"
            defaultValue={filters.expOnly ? "both" : ""}
            className="h-10 rounded-lg border border-tt-gray30/60 bg-white px-2"
          >
            <option value="">全データ</option>
            <option value="both">両方使った人のみ</option>
          </select>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="submit"
            className="h-9 flex-1 rounded-full bg-tt-green text-sm font-bold text-white"
          >
            この条件で見る
          </button>
          <Link
            href={`/compare/${aId}/vs/${bId}?mode=all`}
            className="flex h-9 flex-1 items-center justify-center rounded-full border border-tt-gray30/60 text-sm"
          >
            絞り込み解除
          </Link>
        </div>
        {similarDefault && (
          <p className="mt-2 text-xs text-tt-gray70">
            現在「あなたと似た人」で絞り込み中
          </p>
        )}
      </form>

      {/* 集計結果 */}
      <div className="mt-6 space-y-4">
        {total === 0 ? (
          <div className="rounded-xl bg-white p-5 text-center text-sm text-tt-gray70 ring-1 ring-tt-gray30/40">
            <p>このフィルタでは結果がありません。</p>
            {(filters.playstyle || filters.level || filters.blade) && (
              <Link
                href={`/compare/${aId}/vs/${bId}?mode=all`}
                className="mt-2 inline-block text-tt-green underline"
              >
                絞り込みを外して見る
              </Link>
            )}
          </div>
        ) : (
          <>
            {total < 20 && (
              <p className="rounded-lg bg-tt-soft-coral p-3 text-xs text-tt-deep-coral">
                データが少ないため参考程度に（n={total}）
              </p>
            )}
            <VoteBar label="好み" a={tally.overall.a} b={tally.overall.b} same={tally.overall.same} nameA={equipA.name} nameB={equipB.name} />
            <VoteBar label="スピード" a={tally.speed.a} b={tally.speed.b} same={tally.speed.same} nameA={equipA.name} nameB={equipB.name} />
            <VoteBar label="スピン" a={tally.spin.a} b={tally.spin.b} same={tally.spin.same} nameA={equipA.name} nameB={equipB.name} />
            <div className="rounded-xl bg-tt-soft-green p-4 text-sm ring-1 ring-tt-green/30">
              <p className="font-bold text-tt-deep-green">インサイト</p>
              <p className="mt-1">{insight}</p>
            </div>
          </>
        )}
      </div>

      <div className="mt-8 space-y-3 text-center">
        <Link
          href="/play"
          className="block rounded-full bg-tt-green px-8 py-3 font-bold text-white transition hover:opacity-90"
        >
          この対決に答える
        </Link>
        <Link
          href="/compare/select"
          className="block text-sm text-tt-gray70 underline"
        >
          別の対決を作成
        </Link>
      </div>
    </div>
  );
}

function FilterSelect({
  name,
  current,
  options,
  allLabel,
}: {
  name: string;
  current: string | null;
  options: Array<[string, string]>;
  allLabel: string;
}) {
  return (
    // defaultValue はクライアント遷移では再評価されないため、key で再マウントさせる
    <select
      key={current ?? "all"}
      name={name}
      defaultValue={current ?? ""}
      className="h-10 rounded-lg border border-tt-gray30/60 bg-white px-2"
    >
      <option value="">{allLabel}</option>
      {options.map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}

function VoteBar({
  label,
  a,
  b,
  same,
  nameA,
  nameB,
}: {
  label: string;
  a: number;
  b: number;
  same: number;
  nameA: string;
  nameB: string;
}) {
  const total = a + b + same;
  if (total === 0) {
    return (
      <div className="rounded-xl bg-white p-4 ring-1 ring-tt-gray30/40">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-1 text-xs text-tt-gray70">この軸の回答はまだありません</p>
      </div>
    );
  }
  const pa = Math.round((a / total) * 100);
  const pb = Math.round((b / total) * 100);
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-tt-gray30/40">
      <div className="flex justify-between text-sm">
        <p className="font-medium">{label}</p>
        <p className="font-mono text-xs text-tt-gray70">n={total}</p>
      </div>
      <div className="mt-2 flex h-5 overflow-hidden rounded-full bg-tt-gray30/40">
        {a > 0 && (
          <div className="bg-tt-green" style={{ width: `${pa}%` }} />
        )}
        {same > 0 && (
          <div
            className="bg-tt-gray30"
            style={{ width: `${100 - pa - pb}%` }}
          />
        )}
        {b > 0 && <div className="bg-tt-coral" style={{ width: `${pb}%` }} />}
      </div>
      <div className="mt-1 flex justify-between text-xs text-tt-gray70">
        <span>
          {nameA} {pa}%
        </span>
        <span>
          {nameB} {pb}%
        </span>
      </div>
    </div>
  );
}

function buildInsight(
  nameA: string,
  nameB: string,
  overall: { a: number; b: number; same: number },
): string {
  const total = overall.a + overall.b + overall.same;
  if (total === 0) return "「好み」の回答が集まると、ここに傾向の解釈が表示されます。";
  if (overall.a === overall.b) {
    return `この条件では ${nameA} と ${nameB} の好みは拮抗しています。`;
  }
  const winner = overall.a > overall.b ? nameA : nameB;
  const pct = Math.round(
    (Math.max(overall.a, overall.b) / Math.max(overall.a + overall.b, 1)) * 100,
  );
  return `この条件では ${winner} を好む人が${pct}%と多数派です。`;
}
