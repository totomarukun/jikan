import Link from "next/link";
import { aggregatePairs } from "@/lib/data";
import { VersusBar } from "@/components/versus-bar";

export const metadata = { title: "人気の対決" };

// ランキングは蓄積データの入口なので、ビルド時固定ではなく60秒ごとに再集計
export const revalidate = 60;

// 蓄積データの入口。回答数の多い対決をランキング表示する。
const MIN_N = 3;

export default async function BattlesPage() {
  // ランキングは「両方使った人」基準のみ集計する。匿名セッションの量産で
  // 票を水増しできる「全データ」基準を看板に出すと、捏造的な100%対決が1位に立つ
  const [pairs, all] = await Promise.all([
    aggregatePairs({ take: 30, minTotal: MIN_N, experiencedOnly: true }),
    aggregatePairs({ take: 500, experiencedOnly: true }),
  ]);
  const pendingCount = all.filter((p) => p.total < MIN_N).length;

  return (
    <div className="mx-auto max-w-md py-4">
      <h1 className="text-2xl font-bold">人気の対決</h1>
      <p className="mt-1 text-sm text-tt-gray70">
        「両方使った人」の比較が{MIN_N}件以上たまった対決を、人気順に。
      </p>

      {pairs.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-black/5">
          {pendingCount > 0 ? (
            <p className="text-sm text-tt-gray70">
              いま集計中の対決が{" "}
              <span className="font-mono font-bold text-tt-charcoal">
                {pendingCount}
              </span>{" "}
              件あります。「両方使った人」の比較が{MIN_N}件に届くと、ここに
              ランキングとして出ます。あなたが両方使った2本を答えると、公開が
              一歩近づきます。
            </p>
          ) : (
            <p className="text-sm text-tt-gray70">
              ランキングはこれからです。あなたが実際に両方使った2本を比べると、
              最初の対決データになります。
            </p>
          )}
          <p className="mt-2 text-xs text-tt-gray70">
            ※ 使っていない人の予想も集めますが、ランキングは公平のため
            「両方使った人」の比較だけで作ります。
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link
              href="/gear"
              className="inline-block rounded-full bg-tt-green px-6 py-3 font-bold text-white shadow-lg shadow-tt-green/25"
            >
              使った用具を登録して答える
            </Link>
            <Link
              href="/catalog?view=map"
              className="inline-block rounded-full bg-white px-6 py-3 font-bold text-tt-charcoal ring-1 ring-black/10"
            >
              用具マップを見る
            </Link>
          </div>
        </div>
      ) : (
        <ol className="mt-6 space-y-3">
          {pairs.map((p, i) => (
            <li key={`${p.aId}-${p.bId}`}>
              <Link
                href={`/compare/${p.aId}/vs/${p.bId}`}
                className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="mb-2 flex items-center gap-3">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold ${
                      i < 3
                        ? "bg-tt-charcoal text-white"
                        : "bg-tt-gray30/30 text-tt-gray70"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">
                      {p.nameA} <span className="text-tt-gray30">vs</span>{" "}
                      {p.nameB}
                    </p>
                    <p className="truncate text-xs text-tt-gray70">
                      {p.manufacturerA} / {p.manufacturerB}
                    </p>
                  </div>
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
            </li>
          ))}
        </ol>
      )}

      {pairs.length > 0 && pendingCount > 0 && (
        <p className="mt-4 text-center text-xs text-tt-gray70">
          ほか {pendingCount} 対決が集計中（「両方使った人」の比較が{MIN_N}件未満のため非表示）
        </p>
      )}

      <div className="mt-8 text-center">
        <Link
          href="/compare/select"
          className="text-sm font-medium text-tt-green underline"
        >
          見たい対決がない？ 自分で対決を作る →
        </Link>
      </div>
    </div>
  );
}
