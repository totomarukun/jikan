import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionId } from "@/lib/session";
import { aggregatePairs, getEquipmentRecord } from "@/lib/data";
import { amazonSearchUrl, rakutenSearchUrl } from "@/lib/links";
import { VersusBar } from "@/components/versus-bar";
import {
  EQUIPMENT_CATEGORY_LABELS,
  isRubberCategory,
  type EquipmentCategory,
} from "@/lib/types";

// 用具個別ページ: 公称スペック + AB比較での対戦成績
export default async function EquipmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const equipment = await prisma.equipment.findUnique({ where: { id } });
  if (!equipment || !equipment.isActive) notFound();

  const sessionId = await getSessionId();
  const [record, battles, progress] = await Promise.all([
    getEquipmentRecord(id),
    aggregatePairs({ involvingEquipmentId: id, take: 5 }),
    sessionId
      ? prisma.sessionProgress.findUnique({ where: { sessionId } })
      : null,
  ]);
  const currentRubberId = progress?.currentRubberId ?? null;

  // 乗り換え先候補: この用具との対決で勝ち越している相手 (n>=2)
  const alternatives = battles
    .map((p) => {
      const isA = p.aId === id;
      const oppVotes = isA ? p.votesB : p.votesA;
      const myVotes = isA ? p.votesA : p.votesB;
      return {
        id: isA ? p.bId : p.aId,
        name: isA ? p.nameB : p.nameA,
        manufacturer: isA ? p.manufacturerB : p.manufacturerA,
        oppVotes,
        myVotes,
        total: p.total,
      };
    })
    .filter((o) => o.total >= 2 && o.oppVotes > o.myVotes)
    .slice(0, 3);
  const winRate =
    record.wins + record.losses > 0
      ? Math.round((record.wins / (record.wins + record.losses)) * 100)
      : null;

  const specs: Array<{ label: string; value: number | null; max: number; unit?: string }> = [
    { label: "スピード", value: equipment.officialSpeed, max: 100 },
    { label: "スピン", value: equipment.officialSpin, max: 100 },
    { label: "弧線", value: equipment.officialArc, max: 100 },
  ];

  return (
    <div className="mx-auto max-w-md py-4">
      {/* ヘッダーカード */}
      <div className="rounded-3xl bg-gradient-to-br from-tt-soft-green via-white to-tt-soft-coral p-6 shadow-sm ring-1 ring-black/5">
        <p className="text-xs font-medium text-tt-gray70">
          {EQUIPMENT_CATEGORY_LABELS[equipment.category as EquipmentCategory]}
        </p>
        <h1 className="mt-1 text-2xl font-bold">{equipment.name}</h1>
        <p className="text-sm text-tt-gray70">{equipment.manufacturer}</p>
        <dl className="mt-4 flex flex-wrap gap-2 text-xs">
          {equipment.price != null && (
            <div className="rounded-full bg-white/80 px-3 py-1.5 ring-1 ring-black/5">
              <span className="text-tt-gray70">参考価格 </span>
              <span className="font-mono font-bold">
                ¥{equipment.price.toLocaleString()}
              </span>
            </div>
          )}
          {equipment.hardness != null && (
            <div className="rounded-full bg-white/80 px-3 py-1.5 ring-1 ring-black/5">
              <span className="text-tt-gray70">スポンジ硬度 </span>
              <span className="font-mono font-bold">{equipment.hardness}°</span>
            </div>
          )}
          {winRate != null && (
            <div className="rounded-full bg-white/80 px-3 py-1.5 ring-1 ring-black/5">
              <span className="text-tt-gray70">AB比較勝率 </span>
              <span className="font-mono font-bold text-tt-deep-green">
                {winRate}%
              </span>
              <span className="font-mono text-tt-gray70">
                ({record.wins}勝{record.losses}敗)
              </span>
            </div>
          )}
        </dl>
      </div>

      {/* 公称スペック */}
      {specs.some((s) => s.value != null) && (
        <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <h2 className="font-bold">公称スペック (参考値)</h2>
          <div className="mt-3 space-y-3">
            {specs
              .filter((s) => s.value != null)
              .map((s) => (
                <div key={s.label}>
                  <div className="flex justify-between text-sm">
                    <span>{s.label}</span>
                    <span className="font-mono font-bold">{s.value}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-tt-gray30/30">
                    <div
                      className="bar-grow h-2 rounded-full bg-gradient-to-r from-tt-green to-tt-deep-green"
                      style={{ width: `${(s.value! / s.max) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
          </div>
          <p className="mt-3 text-xs text-tt-gray70">
            ※メーカー公称値をもとにした0-100の正規化値。実際の使用感はAB比較データを参照してください。
          </p>
        </section>
      )}

      {/* あなたの基準と比べる */}
      {currentRubberId &&
        currentRubberId !== id &&
        isRubberCategory(equipment.category) && (
          <Link
            href={`/compare/${currentRubberId}/vs/${id}`}
            className="mt-4 block rounded-2xl bg-tt-charcoal p-4 text-center font-bold text-white shadow-lg transition hover:opacity-90 active:scale-[0.99]"
          >
            いまのあなたのラバーと比べる →
          </Link>
        )}

      {/* 乗り換え先候補 */}
      {alternatives.length > 0 && (
        <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <h2 className="font-bold">この用具より好まれている用具</h2>
          <p className="mt-0.5 text-xs text-tt-gray70">
            直接対決で勝ち越している相手 (乗り換え先の候補に)
          </p>
          <ul className="mt-3 space-y-2">
            {alternatives.map((alt) => (
              <li key={alt.id}>
                <Link
                  href={`/equipment/${alt.id}`}
                  className="flex items-center justify-between rounded-xl bg-tt-offwhite p-3 ring-1 ring-black/5 transition hover:bg-tt-soft-green"
                >
                  <span>
                    <span className="text-sm font-bold">{alt.name}</span>
                    <span className="ml-2 text-xs text-tt-gray70">
                      {alt.manufacturer}
                    </span>
                  </span>
                  <span className="font-mono text-xs text-tt-deep-green">
                    {alt.oppVotes}-{alt.myVotes}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* この用具の対決 */}
      <section className="mt-6">
        <h2 className="mb-3 font-bold">この用具が登場する対決</h2>
        {battles.length === 0 ? (
          <div className="rounded-2xl bg-white p-5 text-center shadow-sm ring-1 ring-black/5">
            <p className="text-sm text-tt-gray70">
              まだ対決データがありません。
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {battles.map((p) => (
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
                <VersusBar
                  votesA={p.votesA}
                  votesB={p.votesB}
                  votesSame={p.votesSame}
                  nameA={p.nameA}
                  nameB={p.nameB}
                />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 購入導線 */}
      <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <h2 className="font-bold">この用具を探す</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <a
            href={amazonSearchUrl(equipment.manufacturer, equipment.name)}
            target="_blank"
            rel="noreferrer nofollow"
            className="rounded-xl border border-tt-gray30/50 py-3 text-center font-bold transition hover:bg-tt-offwhite active:scale-[0.98]"
          >
            Amazonで探す
          </a>
          <a
            href={rakutenSearchUrl(equipment.manufacturer, equipment.name)}
            target="_blank"
            rel="noreferrer nofollow"
            className="rounded-xl border border-tt-gray30/50 py-3 text-center font-bold transition hover:bg-tt-offwhite active:scale-[0.98]"
          >
            楽天で探す
          </a>
        </div>
        <p className="mt-2 text-xs text-tt-gray70">
          ※外部ECの検索結果へ移動します。価格・在庫は移動先でご確認ください。
        </p>
      </section>

      <div className="mt-8 space-y-3 text-center">
        <Link
          href="/compare/select"
          className="block rounded-full bg-gradient-to-r from-tt-green to-tt-deep-green px-8 py-3.5 font-bold text-white shadow-lg shadow-tt-green/25 transition hover:opacity-90 active:scale-95"
        >
          この用具で対決を作る
        </Link>
        <Link href="/battles" className="block text-sm text-tt-gray70 underline">
          人気の対決を見る
        </Link>
      </div>
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const equipment = await prisma.equipment.findUnique({
    where: { id },
    select: { name: true, manufacturer: true },
  });
  return {
    title: equipment ? `${equipment.name} (${equipment.manufacturer})` : "用具",
  };
}
