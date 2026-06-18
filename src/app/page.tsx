import Link from "next/link";
import { Wordmark } from "@/components/logo";
import {
  HeroCompareIllustration,
  IconRuler,
  IconBothUsed,
  IconSplit,
  IconMap,
  IconTarget,
  IconNote,
} from "@/components/hero-illustration";
import { prisma } from "@/lib/prisma";
import { getSessionId } from "@/lib/session";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

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
      {/* ヒーロー: 黒地・ガチで比較。表(公称)→裏(本音)の演出 */}
      <section className="relative overflow-hidden rounded-3xl bg-tt-charcoal p-8 text-center shadow-lift ring-1 ring-black/20 sm:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-tt-green/20 blur-3xl"
        />
        <div className="animate-pop mx-auto w-fit">
          <Wordmark size={56} onDark />
        </div>
        <p className="animate-rise mt-2 font-mono text-[11px] tracking-[0.34em] text-tt-coral [animation-delay:60ms]">
          UNVEIL THE TRUE SPEC.
        </p>
        <h1 className="animate-rise mt-6 text-3xl font-bold leading-snug text-white [animation-delay:80ms] sm:text-4xl">
          メーカーの数字じゃない。
          <br />
          <span className="text-tt-green">使った人の本音</span>で選ぶ。
        </h1>
        <p className="animate-rise mt-3 leading-7 text-white/70 [animation-delay:120ms]">
          公称スペック（表）と、両方使った人のガチ評価（裏）。
          いまの自分の用具と比べて、特徴がひと目で分かります。
        </p>
        <HeroCompareIllustration className="animate-rise mx-auto mt-7 w-full max-w-[330px] drop-shadow-[0_16px_32px_rgba(0,0,0,0.4)] [animation-delay:140ms]" />
        <div className="animate-rise mt-7 [animation-delay:180ms]">
          <Link
            href="/catalog?view=map"
            className="inline-flex min-h-12 items-center rounded-full bg-tt-green px-12 py-4 text-lg font-bold text-white shadow-lg shadow-tt-green/30 transition hover:opacity-90 active:scale-95"
          >
            用具マップを見る
          </Link>
          <p className="mt-3 text-sm text-white/60">登録なしで見られます</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link
              href="/catalog"
              className="inline-flex min-h-11 items-center rounded-full bg-white/10 px-6 py-2.5 text-sm font-bold text-white ring-1 ring-white/20 transition hover:bg-white/20 active:scale-95"
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
            <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
              <dt className="text-xs text-white/60">両方使った人の比較</dt>
              <dd className="font-mono text-2xl font-bold text-tt-green">
                {totalAnswers.toLocaleString()}
              </dd>
            </div>
          )}
          <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
            <dt className="text-xs text-white/60">収録用具</dt>
            <dd className="font-mono text-2xl font-bold text-tt-coral">
              {equipmentCount.toLocaleString()}
            </dd>
          </div>
        </dl>
      </section>

      {/* 価値訴求: 根本ペイン「感覚は人によって違う」への回答 */}
      <section className="grid gap-4 sm:grid-cols-3">
        <Card surface="accent" pad="lg">
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
        </Card>
        <Card pad="lg" className="bg-tt-soft-coral ring-tt-coral/15">
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
        </Card>
        <Card pad="lg">
          <div className="flex items-center justify-between">
            <p className="font-mono text-2xl font-bold">03</p>
            <IconSplit className="h-8 w-8" />
          </div>
          <h2 className="mt-2 font-bold">割れる意見も、そのまま</h2>
          <p className="mt-1 text-sm leading-6 text-tt-gray70">
            感じ方が分かれる用具は「意見が割れています」と正直に表示。断定しないから、判断を間違えにくい。
          </p>
        </Card>
      </section>

      {/* 流れ */}
      <Card pad="lg" className="sm:p-6">
        <h2 className="text-lg font-bold">使い方</h2>
        <ol className="mt-4 space-y-3">
          {[
            {
              Icon: IconMap,
              title: "「用具をみる」で特徴を相対的に",
              desc: "登録なしでOK。使った人の比較から、用具の位置関係がわかる。",
            },
            {
              Icon: IconTarget,
              title: "気になるラバーを「基準」に置く",
              desc: "いまの自分の用具を原点に、候補がどう違うか（差分・近い順）で読める。",
            },
            {
              Icon: IconNote,
              title: "マイギアを育てる・体感を答える",
              desc: "重さや張替も管理。使った2本を答えると、あなたの体感が比較の資産になる。",
            },
          ].map(({ Icon, title, desc }, i) => (
            <li
              key={title}
              className="flex items-start gap-3 rounded-lg bg-tt-offwhite p-3 ring-1 ring-tt-gray30/30"
            >
              <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-tt-green/20">
                <Icon className="h-7 w-7" />
                <span className="absolute -left-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-tt-green font-mono text-[11px] font-bold text-white">
                  {i + 1}
                </span>
              </span>
              <div className="pt-0.5">
                <p className="font-bold">{title}</p>
                <p className="mt-0.5 text-sm leading-6 text-tt-gray70">{desc}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-6 text-center">
          <Link
            href={hasSession ? "/play" : "/onboarding"}
            className={buttonVariants({ size: "lg" })}
          >
            いますぐ始める
          </Link>
        </div>
      </Card>

      <p className="text-center text-sm text-tt-gray70">
        アカウントをお持ちの方は{" "}
        <Link href="/login" className="font-medium text-tt-green underline">
          ログイン
        </Link>
      </p>
    </div>
  );
}
