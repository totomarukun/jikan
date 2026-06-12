import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionId } from "@/lib/session";
import { aggregatePairs } from "@/lib/data";
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
import { VersusBarOrPending } from "@/components/versus-bar";
import { EquipmentVisual } from "@/components/equipment-visual";

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
  const similarDefault = mode !== "all" && mode !== "custom" && progress != null;

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
  const [comparisons, related] = await Promise.all([
    prisma.comparison.findMany({ where }),
    aggregatePairs({
      involvingEquipmentId: aId,
      take: 3,
      excludePair: [aId, bId],
    }),
  ]);

  // A/B を equipA / equipB 基準に正規化して集計
  const tally = {
    overall: { a: 0, b: 0, same: 0 },
    speed: { a: 0, b: 0, same: 0 },
    spin: { a: 0, b: 0, same: 0 },
    hardness: { a: 0, b: 0, same: 0 },
    ballHold: { a: 0, b: 0, same: 0 },
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
    add(tally.hardness, c.winnerHardness);
    add(tally.ballHold, c.winnerBallHold);
  }
  const total = comparisons.length;

  const insight = buildInsight(equipA.name, equipB.name, tally.overall);

  // 表示するのはメーカー公称の生値のみ (独自の0-100正規化値は信頼性を
  // 毀損するため廃止)。硬さは中立軸のため優位表示しない。価格は安い側を優位
  const specRows: Array<{
    label: string;
    a: number | null;
    b: number | null;
    unit?: string;
    neutral?: boolean;
    lowerWins?: boolean;
  }> = [
    {
      label: "公称硬度",
      a: equipA.hardness,
      b: equipB.hardness,
      unit: "°",
      neutral: true,
    },
    {
      label: "参考価格",
      a: equipA.price,
      b: equipB.price,
      unit: "円",
      lowerWins: true,
    },
  ];

  return (
    <div className="mx-auto max-w-md py-4">
      {/* ヘッダー: 対決カード */}
      <div className="relative grid grid-cols-2 gap-3">
        <Link
          href={`/equipment/${equipA.id}`}
          className="rounded-2xl bg-gradient-to-br from-tt-soft-green to-white p-4 shadow-sm ring-1 ring-tt-green/25 transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-tt-green font-mono text-xs font-bold text-white">
            A
          </span>
          <EquipmentVisual
            category={equipA.category}
            manufacturer={equipA.manufacturer}
            bladeSubcategory={equipA.bladeSubcategory}
            imageUrl={equipA.imageUrl}
            name={equipA.name}
            size={48}
            className="mt-2"
          />
          <p className="mt-1 font-bold leading-snug">{equipA.name}</p>
          <p className="text-xs text-tt-gray70">{equipA.manufacturer}</p>
        </Link>
        <Link
          href={`/equipment/${equipB.id}`}
          className="rounded-2xl bg-gradient-to-br from-tt-soft-coral to-white p-4 text-right shadow-sm ring-1 ring-tt-coral/25 transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <span className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-tt-coral font-mono text-xs font-bold text-white">
            B
          </span>
          <EquipmentVisual
            category={equipB.category}
            manufacturer={equipB.manufacturer}
            bladeSubcategory={equipB.bladeSubcategory}
            imageUrl={equipB.imageUrl}
            name={equipB.name}
            size={48}
            className="ml-auto mt-2"
          />
          <p className="mt-1 font-bold leading-snug">{equipB.name}</p>
          <p className="text-xs text-tt-gray70">{equipB.manufacturer}</p>
        </Link>
        <span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-tt-charcoal font-mono text-xs font-bold text-white shadow-lg">
          VS
        </span>
      </div>

      {/* フィルタ */}
      <form
        method="get"
        className="mt-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5"
      >
        <input type="hidden" name="mode" value="custom" />
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-sm font-bold">絞り込み</p>
          {similarDefault && (
            <p className="text-xs font-medium text-tt-green">
              あなたと似た人で絞り込み中
            </p>
          )}
        </div>
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
            className="h-10 rounded-xl border border-tt-gray30/50 bg-white px-2"
          >
            <option value="">全データ</option>
            <option value="both">両方使った人のみ</option>
          </select>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="submit"
            className="h-9 flex-1 rounded-full bg-gradient-to-r from-tt-green to-tt-deep-green text-sm font-bold text-white transition hover:opacity-90 active:scale-95"
          >
            この条件で見る
          </button>
          <Link
            href={`/compare/${aId}/vs/${bId}?mode=all`}
            className="flex h-9 flex-1 items-center justify-center rounded-full border border-tt-gray30/50 text-sm transition hover:bg-tt-offwhite"
          >
            絞り込み解除
          </Link>
        </div>
      </form>

      {/* 集計結果 */}
      <div className="mt-6 space-y-4">
        {total === 0 ? (
          <div className="rounded-2xl bg-white p-6 text-center text-sm text-tt-gray70 shadow-sm ring-1 ring-black/5">
            <p>このフィルタでは結果がありません。</p>
            {(filters.playstyle || filters.level || filters.blade) && (
              <Link
                href={`/compare/${aId}/vs/${bId}?mode=all`}
                className="mt-2 inline-block font-medium text-tt-green underline"
              >
                絞り込みを外して見る
              </Link>
            )}
          </div>
        ) : (
          <>
            {total < 20 && (
              <p className="rounded-xl bg-tt-soft-coral p-3 text-xs text-tt-deep-coral">
                データが少ないため参考程度に（n={total}）
              </p>
            )}
            <AxisCard label="好み" bucket={tally.overall} nameA={equipA.name} nameB={equipB.name} />
            <AxisCard label="スピード" bucket={tally.speed} nameA={equipA.name} nameB={equipB.name} />
            <AxisCard label="スピン" bucket={tally.spin} nameA={equipA.name} nameB={equipB.name} />
            <AxisCard label="硬く感じる" bucket={tally.hardness} nameA={equipA.name} nameB={equipB.name} />
            <AxisCard label="球持ちが良いと感じる" bucket={tally.ballHold} nameA={equipA.name} nameB={equipB.name} />
            <div className="rounded-2xl bg-tt-soft-green p-4 text-sm ring-1 ring-tt-green/20">
              <p className="font-bold text-tt-deep-green">インサイト</p>
              <p className="mt-1 leading-6">{insight}</p>
            </div>
          </>
        )}
      </div>

      {/* 公称スペック比較 */}
      <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <h2 className="font-bold">メーカー公称情報</h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-xs text-tt-gray70">
              <th className="pb-2 text-left font-medium text-tt-deep-green">
                {equipA.name}
              </th>
              <th className="pb-2 text-center font-normal" />
              <th className="pb-2 text-right font-medium text-tt-deep-coral">
                {equipB.name}
              </th>
            </tr>
          </thead>
          <tbody>
            {specRows
              .filter((r) => r.a != null || r.b != null)
              .map((r) => {
                const comparable =
                  !r.neutral && r.a != null && r.b != null && r.a !== r.b;
                const aWins = comparable && (r.lowerWins ? r.a! < r.b! : r.a! > r.b!);
                const bWins = comparable && !aWins;
                return (
                  <tr key={r.label} className="border-t border-tt-gray30/20">
                    <td
                      className={`py-2 text-left font-mono ${
                        aWins ? "font-bold text-tt-deep-green" : ""
                      }`}
                    >
                      {r.a != null
                        ? `${r.a.toLocaleString()}${r.unit ?? ""}`
                        : "—"}
                    </td>
                    <td className="py-2 text-center text-xs text-tt-gray70">
                      {r.label}
                    </td>
                    <td
                      className={`py-2 text-right font-mono ${
                        bWins ? "font-bold text-tt-deep-coral" : ""
                      }`}
                    >
                      {r.b != null
                        ? `${r.b.toLocaleString()}${r.unit ?? ""}`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-tt-gray70">
          ※硬度は各社独自基準のため、メーカーが異なる場合は直接比較できません。
          使用感は上のAB比較データを参照してください。太字は価格の安い側。
        </p>
      </section>

      {/* 関連対決 */}
      {related.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 font-bold">よく比較される対決</h2>
          <div className="space-y-3">
            {related.map((p) => (
              <Link
                key={`${p.aId}-${p.bId}`}
                href={`/compare/${p.aId}/vs/${p.bId}`}
                className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-bold">
                    {p.nameA} <span className="text-tt-gray30">vs</span>{" "}
                    {p.nameB}
                  </span>
                  <span className="font-mono text-xs text-tt-gray70">
                    n={p.total}
                  </span>
                </div>
                <VersusBarOrPending
                  votesA={p.votesA}
                  votesB={p.votesB}
                  votesSame={p.votesSame}
                  nameA={p.nameA}
                  nameB={p.nameB}
                />
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mt-8 space-y-3 text-center">
        <Link
          href="/play"
          className="block rounded-full bg-gradient-to-r from-tt-green to-tt-deep-green px-8 py-3.5 font-bold text-white shadow-lg shadow-tt-green/25 transition hover:opacity-90 active:scale-95"
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

function AxisCard({
  label,
  bucket,
  nameA,
  nameB,
}: {
  label: string;
  bucket: { a: number; b: number; same: number };
  nameA: string;
  nameB: string;
}) {
  const total = bucket.a + bucket.b + bucket.same;
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <div className="flex justify-between text-sm">
        <p className="font-bold">{label}</p>
        <p className="font-mono text-xs text-tt-gray70">n={total}</p>
      </div>
      <div className="mt-2">
        {total === 0 ? (
          <p className="text-xs text-tt-gray70">
            この軸の回答はまだありません
          </p>
        ) : (
          /* n が少ない軸は % を断言しない (リスト類と同じルール) */
          <VersusBarOrPending
            votesA={bucket.a}
            votesB={bucket.b}
            votesSame={bucket.same}
            nameA={nameA}
            nameB={nameB}
          />
        )}
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
      className="h-10 rounded-xl border border-tt-gray30/50 bg-white px-2"
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

function buildInsight(
  nameA: string,
  nameB: string,
  overall: { a: number; b: number; same: number },
): string {
  const total = overall.a + overall.b + overall.same;
  // n が少ないうちは % や多数派を断言しない (バー表示と同じルール)
  if (total < 3) {
    return `「好み」の回答が${total}件あります。あと${3 - total}件集まると傾向の解釈が表示されます。`;
  }
  if (overall.a === overall.b) {
    return `この条件では ${nameA} と ${nameB} の好みは拮抗しています。`;
  }
  const winner = overall.a > overall.b ? nameA : nameB;
  const pct = Math.round(
    (Math.max(overall.a, overall.b) / Math.max(overall.a + overall.b, 1)) * 100,
  );
  return `この条件では ${winner} を好む人が${pct}%と多数派です。`;
}
