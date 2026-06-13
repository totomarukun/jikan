import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionId } from "@/lib/session";
import { buildRelativeMap } from "@/lib/relative-map";
import type { AxisKey } from "@/lib/ranking";
import { EquipmentVisual } from "@/components/equipment-visual";

export const metadata = { title: "用具マップ" };

// 相対マップ (根本転換の中核):
// 全A/B比較を1枚の順序推定に合成し、軸ごとに全ラバーの相対位置を見せる。
// 3票ゲートで「結論を出さない」のをやめ、推定位置 + 支持本数(信頼度)を出す。

const AXES: Array<{ key: AxisKey; label: string; high: string }> = [
  { key: "overall", label: "好み", high: "好まれる" },
  { key: "speed", label: "スピード", high: "速い" },
  { key: "spin", label: "スピン", high: "かかる" },
  { key: "control", label: "コントロール", high: "扱いやすい" },
  { key: "ballHold", label: "球持ち", high: "球持ち良い" },
  { key: "arc", label: "弧線", high: "弧線が高い" },
  { key: "hardness", label: "硬さ", high: "硬い" },
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
        みんなのA/B比較を1枚の相対地図に合成。直接対決していないラバー同士も、
        他の比較を経由して相対位置が決まります（A&gt;B・B&gt;C なら A&gt;C）。
        各ラバーには<strong className="text-tt-charcoal">何件の比較に支えられているか</strong>
        を添えています。
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
          ← 平均より弱い／
          <span className="font-bold text-tt-deep-green">{axis.high}</span> →
        </span>
        <span className="font-mono">この軸の比較 {map.totalComparisons} 件</span>
      </div>

      {/* 自分のギアの現在地 */}
      {myEntries.length > 0 && (
        <div className="mt-3 rounded-2xl bg-tt-soft-green p-3 ring-1 ring-tt-green/25">
          <p className="text-xs font-bold text-tt-deep-green">
            あなたのギアの現在地（{axis.label}）
          </p>
          <div className="mt-2 space-y-2">
            {myEntries.map((e) => (
              <PositionBar
                key={e.id}
                entry={e}
                isGear
                isCurrent={currentIds.has(e.id)}
                axisLabel={axis.label}
              />
            ))}
          </div>
        </div>
      )}

      {/* 全体マップ */}
      {map.entries.length === 0 ? (
        <div className="mt-6 rounded-2xl border-2 border-dashed border-tt-gray30/50 p-8 text-center text-sm text-tt-gray70">
          まだこの軸の比較データがありません。
          <br />
          <Link href="/play" className="font-bold text-tt-green underline">
            AB比較に答える
          </Link>
          と、1票から地図が描かれ始めます。
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {map.entries.map((e, i) => (
            <PositionBar
              key={e.id}
              entry={e}
              rank={i + 1}
              isGear={gearIds.has(e.id)}
              isCurrent={currentIds.has(e.id)}
              axisLabel={axis.label}
            />
          ))}
        </div>
      )}

      <p className="mt-6 text-xs leading-6 text-tt-gray70">
        ※位置は実際のA/B比較からの推定です（実体験の回答を重く、イメージ回答を
        軽く扱います）。支持本数が少ないラバーは中央（平均）寄りに置かれます。
        メーカー公称スペックではなく、使った人の相対判定に基づきます。
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
  axisLabel,
}: {
  entry: import("@/lib/relative-map").MapEntry;
  rank?: number;
  isGear: boolean;
  isCurrent: boolean;
  axisLabel: string;
}) {
  const pct = Math.round(entry.score);
  // 支持の薄さ = 信頼度の低さを点線とラベルで明示
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
          {entry.bothComparisons > 0
            ? `実${entry.bothComparisons}/全${entry.comparisons}件`
            : `${entry.comparisons}件`}
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
          支持が少なく中央寄りの暫定位置（{axisLabel}）
        </p>
      )}
    </Link>
  );
}
