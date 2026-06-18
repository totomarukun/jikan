"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Wordmark } from "@/components/logo";

// M6: 登録フォーム
export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, nickname: nickname || undefined }),
    });
    if (res.ok) {
      router.push("/me");
      return;
    }
    const data = await res.json().catch(() => null);
    setError(data?.error ?? "登録に失敗しました。もう一度お試しください。");
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-sm py-10">
      <div className="animate-rise rounded-3xl bg-white p-7 shadow-card ring-1 ring-black/5">
        <div className="flex flex-col items-center text-center">
          <Wordmark size={30} />
          <h1 className="mt-5 text-2xl font-bold">ガチスペを、はじめる</h1>
          <p className="mt-1 text-sm text-tt-gray70">
            これまでの回答とギアは、登録後も引き継がれます。
          </p>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-bold">
              メールアドレス
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-tt-gray30/60 bg-white px-3.5 outline-none transition focus:border-tt-green focus:ring-2 focus:ring-tt-green/20"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-bold">
              パスワード（8文字以上）
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-tt-gray30/60 bg-white px-3.5 outline-none transition focus:border-tt-green focus:ring-2 focus:ring-tt-green/20"
            />
          </div>
          <div>
            <label htmlFor="nickname" className="mb-1 block text-sm font-bold">
              ニックネーム（任意）
            </label>
            <input
              id="nickname"
              type="text"
              maxLength={30}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-tt-gray30/60 bg-white px-3.5 outline-none transition focus:border-tt-green focus:ring-2 focus:ring-tt-green/20"
              placeholder="たくたろう"
            />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 h-4 w-4 accent-tt-green"
            />
            <span>
              <Link href="/terms" className="font-bold text-tt-green underline">
                利用規約
              </Link>
              に同意します
            </span>
          </label>

          {error && (
            <p className="rounded-lg bg-tt-soft-green px-3 py-2 text-sm text-tt-green">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!agreed || busy}
            className="min-h-12 w-full rounded-full bg-tt-green font-bold text-white shadow-sm transition hover:opacity-90 active:scale-[0.99] disabled:opacity-40"
          >
            {busy ? "作成中..." : "登録する"}
          </button>
        </form>
      </div>

      <p className="mt-6 text-center text-sm text-tt-gray70">
        アカウントをお持ちの方は{" "}
        <Link href="/login" className="font-bold text-tt-green underline">
          ログイン
        </Link>
      </p>
    </div>
  );
}
