import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionId } from "@/lib/session";
import { aggregatePairs, getEquipmentRecord } from "@/lib/data";
import { feelStatements, getFeelProfile } from "@/lib/feel";
import { amazonSearchUrl, rakutenSearchUrl } from "@/lib/links";
import { FeelProfileCard } from "@/components/feel-profile";
import { EquipmentVisual } from "@/components/equipment-visual";
import { VersusBarOrPending } from "@/components/versus-bar";
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
  const [record, battles, progress, gearEntry] = await Promise.all([
    getEquipmentRecord(id),
    aggregatePairs({ involvingEquipmentId: id, take: 5 }),
    sessionId
      ? prisma.sessionProgress.findUnique({ where: { sessionId } })
      : null,
    sessionId
      ? prisma.gearItem.findFirst({
          where: { sessionId, equipmentId: id },
          select: { id: true },
        })
      : null,
  ]);
  const currentRubberId = progress?.currentRubberId ?? null;
  const isMyGear = gearEntry != null || currentRubberId === id;

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
  // 判定数が少ないうちは % を断言しない (リスト側の「集計中」ルールと統一)
  const decided = record.wins + record.losses;
  const winRate = decided >= 5 ? Math.round((record.wins / decided) * 100) : null;

  return (
    <div className="mx-auto max-w-md py-4">
      {/* ヘッダーカード */}
      <div className="rounded-3xl bg-gradient-to-br from-tt-soft-green via-white to-tt-soft-coral p-6 shadow-sm ring-1 ring-black/5">
        <div className="flex items-start gap-4">
          <EquipmentVisual
            category={equipment.category}
            manufacturer={equipment.manufacturer}
            bladeSubcategory={equipment.bladeSubcategory}
            imageUrl={equipment.imageUrl}
            name={equipment.name}
            size={72}
          />
          <div className="min-w-0">
            <p className="text-xs font-medium text-tt-gray70">
              {EQUIPMENT_CATEGORY_LABELS[equipment.category as EquipmentCategory]}
            </p>
            <h1 className="mt-1 text-2xl font-bold">{equipment.name}</h1>
            <p className="text-sm text-tt-gray70">{equipment.manufacturer}</p>
          </div>
        </div>
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
              <span className="text-tt-gray70">公称硬度 </span>
              <span className="font-mono font-bold">{equipment.hardness}°</span>
              <span className="text-tt-gray70"> (自社基準)</span>
            </div>
          )}
          {winRate != null ? (
            <div className="rounded-full bg-white/80 px-3 py-1.5 ring-1 ring-black/5">
              <span className="text-tt-gray70">「好み」勝率 </span>
              <span className="font-mono font-bold text-tt-deep-green">
                {winRate}%
              </span>
              <span className="font-mono text-tt-gray70">
                ({record.wins}勝{record.losses}敗)
              </span>
            </div>
          ) : (
            <div className="rounded-full bg-white/80 px-3 py-1.5 ring-1 ring-black/5">
              <span className="text-tt-gray70">「好み」評価 </span>
              <span className="font-mono font-bold">収集中</span>
              <span className="font-mono text-tt-gray70">
                (判定{decided}件)
              </span>
            </div>
          )}
        </dl>
      </div>

      {/* あなたの基準への体感翻訳 */}
      {currentRubberId &&
        currentRubberId !== id &&
        isRubberCategory(equipment.category) && (
          <YourFeelSection
            currentRubberId={currentRubberId}
            targetId={id}
            targetName={equipment.name}
          />
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
        {/* 気になる→検討の導線を1タップに (用具ページを行き止まりにしない) */}
        {isRubberCategory(equipment.category) &&
          (isMyGear ? (
            <Link
              href={`/switch?base=${id}`}
              className="block rounded-full bg-tt-charcoal px-8 py-3.5 font-bold text-white shadow-lg transition hover:opacity-90 active:scale-95"
            >
              これを基準に乗り換えを検討する →
            </Link>
          ) : (
            <Link
              href={`/switch?c=${id}`}
              className="block rounded-full bg-tt-charcoal px-8 py-3.5 font-bold text-white shadow-lg transition hover:opacity-90 active:scale-95"
            >
              乗り換え検討の候補に入れる →
            </Link>
          ))}
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

// 「使ってみないと分からない」への回答: あなたが使っているラバーを錨に、
// 両方使った人の相対判定を「あなた基準の体感」として表示する
async function YourFeelSection({
  currentRubberId,
  targetId,
  targetName,
}: {
  currentRubberId: string;
  targetId: string;
  targetName: string;
}) {
  const [currentRubber, statements] = await Promise.all([
    prisma.equipment.findUnique({
      where: { id: currentRubberId },
      select: { name: true },
    }),
    getFeelProfile(currentRubberId, targetId).then(feelStatements),
  ]);
  if (!currentRubber) return null;

  return (
    <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <h2 className="font-bold">
        あなたの「{currentRubber.name}」と比べると？
      </h2>
      <p className="mt-0.5 text-xs text-tt-gray70">
        両方使った人の相対判定を、あなたの基準に翻訳して表示します。
      </p>
      <div className="mt-3">
        <FeelProfileCard
          baseName={currentRubber.name}
          targetName={targetName}
          statements={statements}
          compact
        />
      </div>
      <Link
        href={`/compare/${currentRubberId}/vs/${targetId}`}
        className="mt-4 block rounded-xl bg-tt-charcoal py-3 text-center text-sm font-bold text-white transition hover:opacity-90 active:scale-[0.99]"
      >
        対決データの詳細を見る →
      </Link>
    </section>
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
