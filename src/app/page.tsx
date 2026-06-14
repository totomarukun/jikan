import Link from "next/link";
import { LogoMark } from "@/components/logo";
import {
  HeroCompareIllustration,
  IconRuler,
  IconBothUsed,
  IconSplit,
} from "@/components/hero-illustration";
import { prisma } from "@/lib/prisma";
import { getSessionId } from "@/lib/session";

// M1: ランディング画面
// SNS流入の着地点。実データ (注目の対決・累計回答数) を見せて
// 「答えるとこのデータが見られる/育つ」を3秒で伝える。
export default async function LandingPage() {
  const [totalAnswers, equipmentCount, sessionId] = await Promise.all([
    // 看板数値は匿名セッション量産で水増しできない「実体験ベースの判定数」を出す
    prisma.comparison.count({ where: { hasActualExperience: "BOTH" } }),
    prisma.equipment.count({ where: { isActive: true } }),
    getSessionId(),
  ]);
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
          次の用具選び、
          <br className="sm:hidden" />
          もう迷わない。
        </h1>
        <p className="animate-rise mt-3 leading-7 text-tt-gray70 [animation-delay:80ms]">
          「この用具、自分に合うかな？」を、
          <strong className="text-tt-charcoal">みんなの比較データ</strong>で解決。
          気になる用具の特徴が、いまの自分の用具と比べて
          <strong className="text-tt-charcoal">ひと目で分かります</strong>。
        </p>
        <HeroCompareIllustration className="animate-rise mx-auto mt-6 w-full max-w-[280px] [animation-delay:120ms]" />
        <div className="animate-rise mt-6 [animation-delay:160ms]">
          <Link
            href="/catalog?view=map"
            className="inline-block rounded-full bg-gradient-to-r from-tt-green to-tt-deep-green px-12 py-4 text-lg font-bold text-white shadow-lg shadow-tt-green/25 transition hover:opacity-90 active:scale-95"
          >
            用具マップを見る
          </Link>
          <p className="mt-3 text-sm text-tt-gray70">登録なしで見られます</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link
              href="/catalog"
              className="inline-block rounded-full bg-white/80 px-6 py-2.5 text-sm font-bold text-tt-charcoal ring-1 ring-black/10 transition hover:bg-white active:scale-95"
            >
              用具を名前で探す →
            </Link>
          </div>
        </div>

        {/* ライブ統計 (比較データは集まってから出す) */}
        <dl
          className={`mt-8 grid gap-3 text-center ${totalAnswers > 0 ? "grid-cols-2" : "grid-cols-1"}`}
        >
          {totalAnswers > 0 && (
            <div className="rounded-2xl bg-white/70 p-3 ring-1 ring-black/5">
              <dt className="text-xs text-tt-gray70">集まった比較データ</dt>
              <dd className="font-mono text-2xl font-bold text-tt-deep-green">
                {totalAnswers.toLocaleString()}
              </dd>
            </div>
          )}
          <div className="rounded-2xl bg-white/70 p-3 ring-1 ring-black/5">
            <dt className="text-xs text-tt-gray70">収録用具</dt>
            <dd className="font-mono text-2xl font-bold text-tt-deep-coral">
              {equipmentCount.toLocaleString()}
            </dd>
          </div>
        </dl>
      </section>

      {/* 価値訴求: 根本ペイン「感覚は人によって違う」への回答 */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-tt-soft-green p-5 ring-1 ring-tt-green/10">
          <div className="flex items-center justify-between">
            <p className="font-mono text-2xl font-bold text-tt-deep-green">01</p>
            <IconRuler className="h-8 w-8" />
          </div>
          <h2 className="mt-2 font-bold text-tt-deep-green">
            「硬い」を自分基準に
          </h2>
          <p className="mt-1 text-sm leading-6 text-tt-gray70">
            あなたが使ったラバーを基準に「それより硬いと感じた人が68%」と表示します。
          </p>
        </div>
        <div className="rounded-2xl bg-tt-soft-coral p-5 ring-1 ring-tt-coral/10">
          <div className="flex items-center justify-between">
            <p className="font-mono text-2xl font-bold text-tt-deep-coral">02</p>
            <IconBothUsed className="h-8 w-8" />
          </div>
          <h2 className="mt-2 font-bold text-tt-deep-coral">
            「両方使った人」に絞れる比較
          </h2>
          <p className="mt-1 text-sm leading-6 text-tt-gray70">
            回答には「実際に両方を使ったか」の印が付きます。使っていない人の予想も参考に集めますが、ワンタップで「両方使った人だけ」に絞れます。
          </p>
        </div>
        <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
          <div className="flex items-center justify-between">
            <p className="font-mono text-2xl font-bold">03</p>
            <IconSplit className="h-8 w-8" />
          </div>
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
              "答えるほど地図がくわしくなります。うろ覚えでも答えてOK",
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
