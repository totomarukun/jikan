import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionId } from "@/lib/session";
import { buildRelativeMap } from "@/lib/relative-map";
import type { AxisKey } from "@/lib/ranking";
import { RUBBER_AXES } from "@/lib/axes";
import { MapExplorer } from "@/components/map-explorer";

export const metadata = { title: "用具マップ" };

// 相対マップ (根本転換の中核):
// 全A/B比較を1枚の順序推定に合成し、軸ごとに全ラバーの相対位置を見せる。
// 3票ゲートで「結論を出さない」のをやめ、推定位置 + 支持本数(信頼度)を出す。

// 軸はラバー軸モデル(axes.ts)に一本化。粘着は粘着系専用なので一覧タブには出さない。
const AXES = RUBBER_AXES.filter((a) => !a.tackyOnly);

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const axisKey = (typeof sp.axis === "string" ? sp.axis : "speed") as AxisKey;
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

  return (
    <div className="mx-auto max-w-md py-4">
      <h1 className="text-2xl font-bold">用具マップ</h1>

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

      {/* 全体マップ (検索・絞り込み付き)。自分のギアは一覧内でバッジ表示される */}
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
