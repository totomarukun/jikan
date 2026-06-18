import Link from "next/link";
import type { Metadata } from "next";
import { LogoMark } from "@/components/logo";

// ギアカード(WITB)の公開ランディング (SNS流入の着地点)。
// 「私のギア構成」を見せ、本体のマイギア登録/マップへ送客する。

function ogImage(sp: Record<string, string | string[] | undefined>): string {
  const q = new URLSearchParams();
  for (const k of ["blade", "fh", "bh"]) {
    const v = sp[k];
    if (typeof v === "string" && v) q.set(k, v);
  }
  return `/api/og/gear?${q.toString()}`;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const img = ogImage(sp);
  const title = "私の卓球ギア構成 | ガチスペ";
  const description =
    "ラケット・フォア・バックの構成。ガチスペで用具の特徴を相対的に見て、あなたのギアも登録しよう。";
  return {
    title,
    description,
    openGraph: { title, description, images: [img] },
    twitter: { card: "summary_large_image", title, description, images: [img] },
  };
}

export default async function ShareGearPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const withThick = (name: string | null, th: string | null) =>
    name ? (th ? `${name}（${th}）` : name) : null;
  const totalWeight = get("tw");
  const rows: Array<[string, string | null]> = [
    ["ラケット", get("blade")],
    ["フォア", withThick(get("fh"), get("ft"))],
    ["バック", withThick(get("bh"), get("bt"))],
  ];

  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <div className="mx-auto w-fit">
        <LogoMark size={72} />
      </div>
      <p className="mt-6 text-sm font-medium text-tt-deep-green">私のギア構成</p>
      <div className="mt-4 space-y-2 rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-black/5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline gap-3">
            <span className="w-16 shrink-0 text-xs font-bold text-tt-deep-green">
              {label}
            </span>
            <span className="text-lg font-bold">{value || "—"}</span>
          </div>
        ))}
        {totalWeight && (
          <div className="mt-1 flex items-baseline gap-3 border-t border-tt-gray30/30 pt-2">
            <span className="w-16 shrink-0 text-xs font-bold text-tt-deep-green">
              合計重量
            </span>
            <span className="font-mono text-lg font-bold">{totalWeight}g</span>
          </div>
        )}
      </div>
      <p className="mt-6 leading-7 text-tt-gray70">
        ガチスペは、両方使った人のAB比較から用具の特徴を相対的に見られるサービス。
        あなたのギアを登録すると、それを基準に乗り換え候補が読めます。
      </p>
      <div className="mt-8">
        <Link
          href="/onboarding"
          className="inline-block rounded-full bg-tt-green px-12 py-4 text-lg font-bold text-white shadow-lg shadow-tt-green/25 transition hover:opacity-90 active:scale-95"
        >
          あなたのギアを登録する（無料）
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
