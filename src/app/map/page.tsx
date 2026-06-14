import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionId } from "@/lib/session";
import { buildRelativeMap } from "@/lib/relative-map";
import type { AxisKey } from "@/lib/ranking";
import { EquipmentVisual } from "@/components/equipment-visual";
import { MapExplorer } from "@/components/map-explorer";

export const metadata = { title: "用具マップ" };

// 相対マップ (根本転換の中核):
// 全A/B比較を1枚の順序推定に合成し、軸ごとに全ラバーの相対位置を見せる。
// 3票ゲートで「結論を出さない」のをやめ、推定位置 + 支持本数(信頼度)を出す。

const AXES: Array<{ key: AxisKey; label: string; low: string; high: string }> = [
  { key: "overall", label: "好み", low: "ひかえめ", high: "好まれる" },
  { key: "speed", label: "スピード", low: "おそい", high: "はやい" },
  { key: "spin", label: "スピン", low: "かからない", high: "かかる" },
  { key: "control", label: "コントロール", low: "むずかしい", high: "扱いやすい" },
  { key: "ballHold", label: "球持ち", low: "弾く", high: "球持ち良い" },
  { key: "arc", label: "弧線", low: "直線的", high: "山なり" },
  { key: "tackiness", label: "粘着", low: "弱い", high: "強い" },
  { key: "hardness", label: "硬さ", low: "やわらかい", high: "かたい" },
];

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const axisKey = (typeof sp.axis === "string" ? sp.axis : "overall") as AxisKey;
  const axis = AXES.find((a) => a.key === axisKey) ?? AXES[0];

  const sessionId = await getSessionId();
  const gearItems = sessionId
    ? await prisma.gearItem.findMany({
        where: {
          sessionId,
          equipment: { category: { startsWith: "RUBBER_" } },
        },
        select: { equipmentId: true, isCurrent: true, side: true },
      })
    : [];
  const gearIds = new Set(gearItems.map((g) => g.equipmentId));
  const currentIds = new Set(
    gearItems.filter((g) => g.isCurrent).map((g) => g.equipmentId),
  );

  const map = await buildRelativeMap(axis.key);

  // ギアを地図上で最初に見つけやすく: 自分のギアを上部にも要約表示
  const myEntries = map.entries.filter((e) => gearIds.has(e.id));

  return (
    <div className="mx-auto max-w-md py-4">
      <h1 className="text-2xl font-bold">用具マップ</h1>
      <p className="mt-1 text-sm leading-6 text-tt-gray70">
        使った人の「こっちが上」を集めて、用具を1本の軸に並べました。
        直接比べていない用具も、まわりの比較から
        <strong className="text-tt-charcoal">だいたいの位置</strong>がわかります。
      </p>

      {/* 軸タブ */}
      <div className="mt-4 flex flex-wrap gap-2">
        {AXES.map((a) => (
          <Link
            key={a.key}
            href={`/map?axis=${a.key}`}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
              a.key === axis.key
                ? "bg-tt-deep-green text-white"
                : "bg-white text-tt-gray70 ring-1 ring-tt-gray30/50 hover:bg-tt-soft-green"
            }`}
          >
            {a.label}
          </Link>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-tt-gray70">
        <span>
          ← {axis.low}／
          <span className="font-bold text-tt-deep-green">{axis.high}</span> →
        </span>
        <span className="font-mono">比較 {map.totalComparisons} 件</span>
      </div>

      {/* 自分のギアの現在地 */}
      {myEntries.length > 0 && (
        <div className="mt-3 rounded-2xl bg-tt-soft-green p-3 ring-1 ring-tt-green/25">
          <p className="text-xs font-bold text-tt-deep-green">
            あなたのギア（{axis.label}）
          </p>
          <div className="mt-2 space-y-2">
            {myEntries.map((e) => (
              <PositionBar
                key={e.id}
                entry={e}
                isGear
                isCurrent={currentIds.has(e.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* 全体マップ (検索・絞り込み付き) */}
      {map.entries.length === 0 ? (
        <div className="mt-6 rounded-2xl border-2 border-dashed border-tt-gray30/50 p-8 text-center text-sm leading-6 text-tt-gray70">
          この項目はまだデータがありません。
          <br />
          <Link href="/play" className="font-bold text-tt-green underline">
            比較に1つ答える
          </Link>
          と、ここに用具が並び始めます。
          <br />
          <Link href="/catalog" className="font-bold text-tt-green underline">
            カタログから探す
          </Link>
          のもおすすめです。
        </div>
      ) : (
        <MapExplorer
          entries={map.entries}
          gearIds={[...gearIds]}
          currentIds={[...currentIds]}
        />
      )}

      <p className="mt-6 text-xs leading-6 text-tt-gray70">
        ※メーカーの数値ではなく、使った人の比較から推定した位置です。
        両方使った人の声を重く見ています。データが少ない用具は真ん中寄りになります。
      </p>

      <div className="mt-6 flex gap-3">
        <Link
          href="/play"
          className="flex-1 rounded-full bg-gradient-to-r from-tt-green to-tt-deep-green py-3 text-center text-sm font-bold text-white shadow-lg shadow-tt-green/20"
        >
          比較に答えて地図を育てる
        </Link>
        <Link
          href="/gear"
          className="flex-1 rounded-full border border-tt-gray30/50 bg-white py-3 text-center text-sm font-medium"
        >
          マイギアを編集
        </Link>
      </div>
    </div>
  );
}

function PositionBar({
  entry,
  rank,
  isGear,
  isCurrent,
}: {
  entry: import("@/lib/relative-map").MapEntry;
  rank?: number;
  isGear: boolean;
  isCurrent: boolean;
}) {
  const pct = Math.round(entry.score);
  // データの薄さ = 信頼度の低さをラベルで明示
  const lowConfidence = entry.comparisons < 3;
  return (
    <Link
      href={`/equipment/${entry.id}`}
      className={`block rounded-xl p-3 shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-md ${
        isGear
          ? "bg-white ring-tt-green/40"
          : "bg-white ring-black/5"
      }`}
    >
      <div className="flex items-center gap-2">
        {rank != null && (
          <span className="w-5 shrink-0 text-center font-mono text-xs text-tt-gray70">
            {rank}
          </span>
        )}
        <EquipmentVisual
          category={entry.category}
          manufacturer={entry.manufacturer}
          imageUrl={entry.imageUrl}
          name={entry.name}
          size={28}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-bold">
          {entry.name}
          {isCurrent && (
            <span className="ml-1.5 rounded-full bg-tt-charcoal px-1.5 py-0.5 text-[10px] font-bold text-white">
              使用中
            </span>
          )}
          {isGear && !isCurrent && (
            <span className="ml-1.5 rounded-full bg-tt-green px-1.5 py-0.5 text-[10px] font-bold text-white">
              マイギア
            </span>
          )}
        </span>
        <span className="shrink-0 font-mono text-xs text-tt-gray70">
          {entry.comparisons}件
        </span>
      </div>
      {/* 相対位置バー */}
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-tt-gray30/30">
        <div
          className={`h-2.5 rounded-full ${
            lowConfidence
              ? "bg-tt-gray30"
              : "bg-gradient-to-r from-tt-green to-tt-deep-green"
          }`}
          style={{ width: `${Math.max(4, pct)}%` }}
        />
      </div>
      {lowConfidence && (
        <p className="mt-1 text-[10px] text-tt-gray70">
          データ少なめ（おおよその位置）
        </p>
      )}
    </Link>
  );
}
