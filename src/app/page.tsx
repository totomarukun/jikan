import Link from "next/link";
import { LogoMark } from "@/components/logo";
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
import { Stat } from "@/components/ui/stat";

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
      {/* ヒーロー: ミニマル=単色のやわらかい地 + 1pxボーダー (影は使わない) */}
      <section className="relative overflow-hidden rounded-2xl bg-tt-soft-green/40 p-8 text-center ring-1 ring-tt-green/15 sm:p-12">
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
        <HeroCompareIllustration className="animate-rise mx-auto mt-7 w-full max-w-[330px] [animation-delay:120ms]" />
        <div className="animate-rise mt-6 [animation-delay:160ms]">
          <Link
            href="/catalog?view=map"
            className={buttonVariants({ size: "lg" })}
          >
            用具マップを見る
          </Link>
          <p className="mt-3 text-sm text-tt-gray70">登録なしで見られます</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link
              href="/catalog"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              用具を名前で探す →
            </Link>
          </div>
        </div>

        {/* ライブ統計 (データ前面。比較データは集まってから出す) */}
        <dl
          className={`mt-8 grid gap-3 text-center ${totalAnswers > 0 ? "grid-cols-2" : "grid-cols-1"}`}
        >
          {totalAnswers > 0 && (
            <Stat label="集まった比較データ" value={totalAnswers} tone="green" />
          )}
          <Stat label="収録用具" value={equipmentCount} tone="coral" />
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
