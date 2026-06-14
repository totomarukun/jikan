import Link from "next/link";
import type { Metadata } from "next";
import { LogoMark } from "@/components/logo";

// 診断結果カードの公開ランディング (SNS流入の着地点)。
// OGカードで「私のスタイルは◯◯」を見せ、本体の診断/オンボへ送客する。

function ogImage(sp: Record<string, string | string[] | undefined>): string {
  const type = typeof sp.type === "string" ? sp.type : "";
  const pct = typeof sp.pct === "string" ? sp.pct : "";
  const q = new URLSearchParams();
  if (type) q.set("type", type);
  if (pct) q.set("pct", pct);
  return `/api/og/diagnosis?${q.toString()}`;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const type = typeof sp.type === "string" ? sp.type : "あなたの用具スタイル";
  const img = ogImage(sp);
  const title = `卓球用具スタイル診断: ${type}`;
  const description =
    "TacTapのAB比較で分かる、あなたの卓球用具スタイル。あなたも診断してみよう。";
  return {
    title,
    description,
    openGraph: { title, description, images: [img] },
    twitter: { card: "summary_large_image", title, description, images: [img] },
  };
}

export default async function ShareDiagnosisPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const type = typeof sp.type === "string" ? sp.type : null;
  const pct = typeof sp.pct === "string" ? sp.pct : null;

  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <div className="mx-auto w-fit">
        <LogoMark size={72} />
      </div>
      <p className="mt-6 text-sm font-medium text-tt-deep-green">
        卓球用具スタイル診断
      </p>
      {type ? (
        <h1 className="mt-2 text-3xl font-bold leading-snug text-tt-deep-green">
          「{type}」
        </h1>
      ) : (
        <h1 className="mt-2 text-3xl font-bold leading-snug text-tt-deep-green">
          あなたの用具スタイルは？
        </h1>
      )}
      {pct && (
        <p className="mt-3 inline-block rounded-full bg-tt-soft-green px-4 py-1.5 text-sm text-tt-gray70 ring-1 ring-tt-green/20">
          全プレイヤーの
          <span className="font-mono font-bold text-tt-deep-green">{pct}%</span>
          が該当
        </p>
      )}
      <p className="mt-6 leading-7 text-tt-gray70">
        TacTapは、両方使った人のAB比較から、用具の特徴を相対的に見られるサービス。
        数問答えるだけで、あなたの用具スタイルと、合いそうな1本がわかります。
      </p>
      <div className="mt-8">
        <Link
          href="/onboarding"
          className="inline-block rounded-full bg-gradient-to-r from-tt-green to-tt-deep-green px-12 py-4 text-lg font-bold text-white shadow-lg shadow-tt-green/25 transition hover:opacity-90 active:scale-95"
        >
          あなたも診断する（無料）
        </Link>
        <p className="mt-3 text-sm text-tt-gray70">
          <Link href="/catalog?view=map" className="font-bold text-tt-green underline">
            用具マップを見る
          </Link>
        </p>
      </div>
    </div>
  );
}
