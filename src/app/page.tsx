import Link from "next/link";
import { LogoMark } from "@/components/logo";

// M1: ランディング画面
export default function LandingPage() {
  return (
    <div className="flex flex-col items-center gap-8 py-16 text-center">
      <LogoMark size={96} />
      <div className="space-y-3">
        <h1 className="text-3xl font-bold leading-snug sm:text-4xl">
          ラバー、結局
          <br className="sm:hidden" />
          どっちが自分に合う？
        </h1>
        <p className="text-tt-gray70">
          3秒のAB比較で、あなたに合う用具がわかる。
        </p>
      </div>
      <div className="flex flex-col items-center gap-3">
        <Link
          href="/onboarding"
          className="rounded-full bg-tt-green px-10 py-3.5 text-lg font-bold text-white shadow transition hover:opacity-90"
        >
          始める（無料）
        </Link>
        <p className="text-sm text-tt-gray70">登録なしで参加できます</p>
      </div>
      <div className="mt-8 grid w-full gap-4 text-left sm:grid-cols-3">
        <div className="rounded-xl bg-tt-soft-green p-4">
          <h2 className="font-bold text-tt-deep-green">似た人の選択がわかる</h2>
          <p className="mt-1 text-sm text-tt-gray70">
            プレースタイル・レベル・ラケットが近いプレイヤーの選好を表示。
          </p>
        </div>
        <div className="rounded-xl bg-tt-soft-coral p-4">
          <h2 className="font-bold text-tt-deep-coral">3秒で1問の軽さ</h2>
          <p className="mt-1 text-sm text-tt-gray70">
            SNSを開く感覚で、サクサク答えられるAB比較。
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 ring-1 ring-tt-gray30/40">
          <h2 className="font-bold">失敗を減らせる</h2>
          <p className="mt-1 text-sm text-tt-gray70">
            絶対評価より精緻な「相対比較データ」で意思決定が変わる。
          </p>
        </div>
      </div>
      <p className="text-sm text-tt-gray70">
        アカウントをお持ちの方は{" "}
        <Link href="/login" className="font-medium text-tt-green underline">
          ログイン
        </Link>
      </p>
    </div>
  );
}
