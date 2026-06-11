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
  title: {
    default: "TacTap | 卓球用具のAB比較",
    template: "%s | TacTap",
  },
  description:
    "3秒のAB比較で、あなたに合う卓球用具がわかる。データで、用具選びの後悔を減らす。",
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
        <header className="border-b border-tt-gray30/40 bg-white">
          <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4">
            <LogoHorizontal />
            <nav className="flex items-center gap-4 text-sm text-tt-gray70">
              <Link href="/compare/select" className="hover:text-tt-charcoal">
                用具対決
              </Link>
              <Link href="/me" className="hover:text-tt-charcoal">
                マイページ
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
          {children}
        </main>
        <footer className="border-t border-tt-gray30/40 py-6 text-center text-xs text-tt-gray70">
          <p>TacTap — 卓球用具のAB比較。データで、用具選びの後悔を減らす。</p>
        </footer>
      </body>
    </html>
  );
}
