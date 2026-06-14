import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionId } from "@/lib/session";
import { aggregatePairs, getEquipmentVoices } from "@/lib/data";
import { feelStatements, getFeelProfile } from "@/lib/feel";
import {
  getEquipmentAxisPositions,
  findSimilarEquipment,
  type AxisPosition,
} from "@/lib/relative-map";
import {
  amazonSearchUrl,
  rakutenSearchUrl,
  youtubeSearchUrl,
} from "@/lib/links";
import { FeelProfileCard } from "@/components/feel-profile";
import { ShareLinkButton } from "@/components/share-link-button";
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

  const isRubber = isRubberCategory(equipment.category);
  const sessionId = await getSessionId();
  const [battles, progress, gearEntry, axisPositions] =
    await Promise.all([
      // 詳細の「この用具が登場する対決」は、貢献(回答)を必ず可視化するため
      // 経験フラグで絞らない。少数票は VersusBarOrPending が「集計中」と正直表示する。
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
      isRubber ? getEquipmentAxisPositions(id) : Promise.resolve([]),
    ]);
  const [voices, similar, altPairs] = isRubber
    ? await Promise.all([
        getEquipmentVoices(id, 6),
        findSimilarEquipment(id, 4),
        // 乗り換え候補は信頼のため「両方使った人」の判定だけから導く
        aggregatePairs({ involvingEquipmentId: id, take: 6, experiencedOnly: true }),
      ])
    : [[], [], []];
  const currentRubberId = progress?.currentRubberId ?? null;
  const isMyGear = gearEntry != null || currentRubberId === id;

  // 乗り換え先候補: この用具との対決で勝ち越している相手 (両方使った人, n>=2)
  const alternatives = altPairs
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
        </dl>
      </div>

      {/* メーカー公称スペック (比較データが無くても見える基礎情報) */}
      <MakerSpecSection
        isRubber={isRubber}
        speed={equipment.officialSpeed}
        spin={equipment.officialSpin}
        arc={equipment.officialArc}
      />

      {/* 相対マップ上の位置 (この用具は他と比べてどんな特徴か) */}
      {isRubber && axisPositions.length > 0 && (
        <RelativePositionSection positions={axisPositions} />
      )}

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

      {/* これに似た用具 (相対プロフィールが近い) */}
      {isRubber && similar.length > 0 && (
        <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <h2 className="font-bold">これに似た用具</h2>
          <p className="mt-0.5 text-xs text-tt-gray70">
            特徴が近い順。次に試す1本の候補に。
          </p>
          <ul className="mt-3 space-y-2">
            {similar.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/equipment/${s.id}`}
                  className="flex items-center gap-2 rounded-xl bg-tt-offwhite p-3 ring-1 ring-black/5 transition hover:bg-tt-soft-green"
                >
                  <EquipmentVisual
                    category={s.category}
                    manufacturer={s.manufacturer}
                    imageUrl={s.imageUrl}
                    name={s.name}
                    size={28}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">
                    {s.name}
                    <span className="ml-2 text-xs font-normal text-tt-gray70">
                      {s.manufacturer}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-tt-gray70">
                    {s.sharedAxes}項目で近い
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 両方使った人の声 (定性レビュー) */}
      {isRubber && voices.length > 0 && (
        <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <h2 className="font-bold">両方使った人の声</h2>
          <p className="mt-0.5 text-xs text-tt-gray70">
            この用具を使った人が残した、ひとことの声。
          </p>
          <ul className="mt-3 space-y-2">
            {voices.map((v, i) => (
              <li
                key={i}
                className="rounded-xl bg-tt-offwhite p-3 text-sm ring-1 ring-black/5"
              >
                <p className="leading-6">「{v.comment}」</p>
                <p className="mt-1 text-[10px] text-tt-gray70">
                  {v.otherName} と比較 ・{v.both ? "両方使った人" : "イメージ"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* レビュー動画・購入導線 */}
      <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <h2 className="font-bold">もっと知る・探す</h2>
        <a
          href={youtubeSearchUrl(equipment.manufacturer, equipment.name)}
          target="_blank"
          rel="noreferrer nofollow"
          className="mt-3 flex items-center justify-between rounded-xl border border-tt-gray30/50 px-4 py-3 text-sm font-bold transition hover:bg-tt-offwhite active:scale-[0.98]"
        >
          <span>試打レビュー動画を探す</span>
          <span className="text-tt-gray70">YouTube ↗</span>
        </a>
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
          ※外部サイトの検索結果へ移動します。価格・在庫は移動先でご確認ください。
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
        <ShareLinkButton
          text={`${equipment.name} (${equipment.manufacturer}) の相対マップ上の位置 #TacTap`}
          label="この用具カードをシェア"
        />
        <Link href="/battles" className="block text-sm text-tt-gray70 underline">
          人気の対決を見る
        </Link>
      </div>
    </div>
  );
}

// メーカー公称スペック (0-100の自社基準値) を棒で表示。相対マップ(使った人の判定)とは
// 別物であることを明示する。比較データが無い用具でも基礎情報が見える。
function MakerSpecSection({
  isRubber,
  speed,
  spin,
  arc,
}: {
  isRubber: boolean;
  speed: number | null;
  spin: number | null;
  arc: number | null;
}) {
  const rows: Array<[string, number | null]> = isRubber
    ? [
        ["スピード", speed],
        ["スピン", spin],
        ["弧線", arc],
      ]
    : [
        ["スピード", speed],
        ["コントロール", arc],
      ];
  if (rows.every(([, v]) => v == null)) return null;
  return (
    <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <h2 className="font-bold">メーカー公称スペック</h2>
      <p className="mt-0.5 text-xs text-tt-gray70">
        各社の自社基準の数値です（メーカーをまたいだ比較はできません）。使った人の評価は「用具マップ」で。
      </p>
      <ul className="mt-3 space-y-2">
        {rows.map(([label, v]) =>
          v == null ? null : (
            <li key={label} className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-xs font-bold">{label}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-tt-gray30/30">
                <div
                  className="h-2.5 rounded-full bg-gradient-to-r from-tt-green/70 to-tt-deep-green/70"
                  style={{ width: `${Math.max(4, Math.min(100, v))}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right font-mono text-xs text-tt-gray70">
                {v}
              </span>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

const AXIS_META: Record<string, { label: string; high: string }> = {
  speed: { label: "スピード", high: "速い" },
  spin: { label: "スピン", high: "かかる" },
  hardness: { label: "かたさ", high: "かたい" },
  arc: { label: "弧線", high: "弧線が高い" },
  attackEase: { label: "攻撃のしやすさ", high: "攻撃しやすい" },
  defenseEase: { label: "守備のしやすさ", high: "守備しやすい" },
  tackiness: { label: "粘着", high: "粘着が強い" },
};

// 相対マップ上の位置: みんなのA/B比較を合成した相対評価で、この用具が
// 各軸でどのあたりに位置するか。3票ゲートでなく推定位置+支持本数を出す。
function RelativePositionSection({ positions }: { positions: AxisPosition[] }) {
  return (
    <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <h2 className="font-bold">用具マップ上の位置</h2>
      <p className="mt-0.5 text-xs text-tt-gray70">
        使った人の比較から推定した、全ラバー中での位置です。
      </p>
      <ul className="mt-3 space-y-2.5">
        {positions.map((p) => {
          const meta = AXIS_META[p.axis] ?? { label: p.axis, high: "" };
          const pct = Math.round(p.score);
          const low = p.comparisons < 3;
          return (
            <li key={p.axis}>
              <Link href="/catalog?view=map" className="block">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold">{meta.label}</span>
                  <span className="font-mono text-tt-gray70">
                    {p.totalRanked}本中 {p.rank}位 ・ {p.comparisons}件
                  </span>
                </div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-tt-gray30/30">
                  <div
                    className={`h-2.5 rounded-full ${
                      low
                        ? "bg-tt-gray30"
                        : "bg-gradient-to-r from-tt-green to-tt-deep-green"
                    }`}
                    style={{ width: `${Math.max(4, pct)}%` }}
                  />
                </div>
                {low && (
                  <p className="mt-0.5 text-[10px] text-tt-gray70">
                    データ少なめ（おおよその位置）
                  </p>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] leading-5 text-tt-gray70">
        ※右にいくほど強い特徴。メーカーの数値ではなく、使った人の比較に基づきます。
      </p>
    </section>
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
