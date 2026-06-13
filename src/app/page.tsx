import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { VersusBarOrPending } from "@/components/versus-bar";
import { aggregatePairs } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { getSessionId } from "@/lib/session";

// M1: ランディング画面
// SNS流入の着地点。実データ (注目の対決・累計回答数) を見せて
// 「答えるとこのデータが見られる/育つ」を3秒で伝える。
export default async function LandingPage() {
  // eslint-disable-next-line prefer-const
  let [featured, totalAnswers, equipmentCount, sessionId] =
    await Promise.all([
      aggregatePairs({ take: 3, minTotal: 3, experiencedOnly: true }),
      // 看板数値は匿名セッション量産で水増しできない「実体験ベースの判定数」を出す
      prisma.comparison.count({ where: { hasActualExperience: "BOTH" } }),
      prisma.equipment.count({ where: { isActive: true } }),
      getSessionId(),
    ]);
  if (featured.length === 0) {
    // コールドスタート時のみ少数サンプルでも見せる (正直に n を表示している)
    featured = await aggregatePairs({ take: 3, experiencedOnly: true });
  }
  const hasSession = sessionId
    ? (await prisma.sessionProgress.findUnique({
        where: { sessionId },
        select: { sessionId: true },
      })) !== null
    : false;

  return (
    <div className="space-y-12 py-6">
      {/* ヒーロー */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-tt-soft-green via-white to-tt-soft-coral p-8 text-center shadow-sm ring-1 ring-black/5 sm:p-12">
        <div className="animate-pop mx-auto w-fit">
          <LogoMark size={84} />
        </div>
        <h1 className="animate-rise mt-6 text-3xl font-bold leading-snug sm:text-4xl">
          あの用具は、いまの自分と
          <br className="sm:hidden" />
          比べてどう違う？
        </h1>
        <p className="animate-rise mt-3 leading-7 text-tt-gray70 [animation-delay:80ms]">
          「硬い」「弾む」の感じ方は人それぞれ。
          <br />
          だからTacTapは、<strong className="text-tt-charcoal">両方使った人の比較</strong>
          を1枚の地図に合成して、
          <br />
          用具の特徴を<strong className="text-tt-charcoal">相対的に</strong>見られるようにしました。
        </p>
        <div className="animate-rise mt-8 [animation-delay:160ms]">
          <Link
            href="/map"
            className="inline-block rounded-full bg-gradient-to-r from-tt-green to-tt-deep-green px-12 py-4 text-lg font-bold text-white shadow-lg shadow-tt-green/25 transition hover:opacity-90 active:scale-95"
          >
            用具マップを見る
          </Link>
          <p className="mt-3 text-sm text-tt-gray70">登録なしで見られます</p>
          <Link
            href={hasSession ? "/switch" : "/onboarding"}
            className="mt-4 inline-block rounded-full bg-white/80 px-6 py-2.5 text-sm font-bold text-tt-charcoal ring-1 ring-black/10 transition hover:bg-white active:scale-95"
          >
            {hasSession
              ? "いまのラバー基準で見る →"
              : "自分のギア基準で見る（無料登録）→"}
          </Link>
        </div>

        {/* ライブ統計 */}
        <dl className="mt-8 grid grid-cols-2 gap-3 text-center">
          <div className="rounded-2xl bg-white/70 p-3 ring-1 ring-black/5">
            <dt className="text-xs text-tt-gray70">両方使った人の判定</dt>
            <dd className="font-mono text-2xl font-bold text-tt-deep-green">
              {totalAnswers.toLocaleString()}
            </dd>
          </div>
          <div className="rounded-2xl bg-white/70 p-3 ring-1 ring-black/5">
            <dt className="text-xs text-tt-gray70">収録用具</dt>
            <dd className="font-mono text-2xl font-bold text-tt-deep-coral">
              {equipmentCount.toLocaleString()}
            </dd>
          </div>
        </dl>
      </section>

      {/* 注目の対決 (実データ) */}
      {featured.length > 0 && (
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-lg font-bold">いま注目の対決</h2>
            <Link
              href="/battles"
              className="text-sm font-medium text-tt-green hover:underline"
            >
              すべて見る →
            </Link>
          </div>
          <div className="space-y-3">
            {featured.map((p) => (
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

      {/* 価値訴求: 根本ペイン「感覚は人によって違う」への回答 */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-tt-soft-green p-5 ring-1 ring-tt-green/10">
          <p className="font-mono text-2xl font-bold text-tt-deep-green">01</p>
          <h2 className="mt-2 font-bold text-tt-deep-green">
            あなたの感覚に翻訳
          </h2>
          <p className="mt-1 text-sm leading-6 text-tt-gray70">
            レビューの「硬い」はその人の感覚。TacTapは、あなたが使ったことのあるラバーを基準に「それより硬いと感じた人が68%」という形で示します。
          </p>
        </div>
        <div className="rounded-2xl bg-tt-soft-coral p-5 ring-1 ring-tt-coral/10">
          <p className="font-mono text-2xl font-bold text-tt-deep-coral">02</p>
          <h2 className="mt-2 font-bold text-tt-deep-coral">
            「両方使った人」に絞れる比較
          </h2>
          <p className="mt-1 text-sm leading-6 text-tt-gray70">
            すべての回答に経験フラグが付きます。イメージ回答も集めますが、ワンタップで「実際に両方使った人の判定だけ」に絞り込めます。
          </p>
        </div>
        <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
          <p className="font-mono text-2xl font-bold">03</p>
          <h2 className="mt-2 font-bold">割れる意見も、そのまま</h2>
          <p className="mt-1 text-sm leading-6 text-tt-gray70">
            感じ方が分かれる用具は「意見が割れています」と正直に表示。断定しないから、判断を間違えにくい。
          </p>
        </div>
      </section>

      {/* 流れ */}
      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
        <h2 className="text-lg font-bold">使い方</h2>
        <ol className="mt-4 space-y-4">
          {[
            [
              "用具マップで特徴を相対的に見る",
              "登録なしでOK。両方使った人の比較から、用具の位置関係が読める",
            ],
            [
              "マイギアを登録して「自分基準」にする",
              "いまのラバーを原点に、候補がどう違うかで読めるようになる",
            ],
            [
              "気になった所で、体感を1問だけ答える",
              "答えるほど地図の解像度が上がる。記憶で答えられる軽さ",
            ],
          ].map(([title, desc], i) => (
            <li key={title} className="flex items-start gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tt-green font-mono text-sm font-bold text-white">
                {i + 1}
              </span>
              <div>
                <p className="font-bold">{title}</p>
                <p className="text-sm text-tt-gray70">{desc}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-6 text-center">
          <Link
            href={hasSession ? "/play" : "/onboarding"}
            className="inline-block rounded-full bg-gradient-to-r from-tt-green to-tt-deep-green px-10 py-3.5 font-bold text-white shadow-lg shadow-tt-green/25 transition hover:opacity-90 active:scale-95"
          >
            いますぐ始める
          </Link>
        </div>
      </section>

      <p className="text-center text-sm text-tt-gray70">
        アカウントをお持ちの方は{" "}
        <Link href="/login" className="font-medium text-tt-green underline">
          ログイン
        </Link>
      </p>
    </div>
  );
}
