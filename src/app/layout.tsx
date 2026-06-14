import type { Metadata } from "next";
import { Inter, Noto_Sans_JP, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { LogoHorizontal } from "@/components/logo";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const notoSansJp = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // OGカードの絶対URL解決に必要。本番URLは環境変数で上書き。
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "TacTap | 卓球用具を、比較で選ぶ。",
    template: "%s | TacTap",
  },
  description:
    "両方使った人の比較から、卓球用具の特徴がわかる。データで、用具選びの後悔を減らす。",
  openGraph: {
    title: "TacTap | 卓球用具を、比較で選ぶ。",
    description: "両方使った人の比較から、卓球用具の特徴がわかる。",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${inter.variable} ${notoSansJp.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-20 border-b border-tt-gray30/30 bg-white/85 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4">
            <LogoHorizontal />
            <nav className="flex items-center gap-4 text-sm font-medium text-tt-gray70 sm:gap-6">
              <Link href="/catalog" className="transition hover:text-tt-green">
                用具をみる
              </Link>
              <Link href="/play" className="transition hover:text-tt-green">
                答える
              </Link>
              <Link href="/me" className="transition hover:text-tt-green">
                マイページ
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
          {children}
        </main>
        <footer className="border-t border-tt-gray30/30 bg-white">
          <div className="mx-auto w-full max-w-3xl px-4 py-8">
            <p className="text-sm font-bold">TacTap — 卓球用具を、比較で選ぶ。</p>
            <p className="mt-1 text-xs text-tt-gray70">
              データで、用具選びの後悔を減らす。
            </p>
            <nav className="mt-4 flex flex-wrap gap-4 text-xs text-tt-gray70">
              <Link href="/play" className="hover:text-tt-green">
                比較に答える
              </Link>
              <Link href="/catalog" className="hover:text-tt-green">
                用具を探す
              </Link>
              <Link href="/catalog?view=map" className="hover:text-tt-green">
                用具マップ
              </Link>
              <Link href="/battles" className="hover:text-tt-green">
                人気の対決
              </Link>
              <Link href="/switch" className="hover:text-tt-green">
                乗り換え検討
              </Link>
              <Link href="/compare/select" className="hover:text-tt-green">
                対決を作る
              </Link>
              <Link href="/terms" className="hover:text-tt-green">
                利用規約
              </Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
