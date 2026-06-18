"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Wordmark } from "@/components/logo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      router.push("/me");
      return;
    }
    const data = await res.json().catch(() => null);
    setError(data?.error ?? "ログインに失敗しました。もう一度お試しください。");
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-sm py-10">
      <div className="animate-rise rounded-3xl bg-white p-7 shadow-card ring-1 ring-black/5">
        <div className="flex flex-col items-center text-center">
          <Wordmark size={30} />
          <h1 className="mt-5 text-2xl font-bold">おかえりなさい</h1>
          <p className="mt-1 text-sm text-tt-gray70">
            あなたのギアと本音記録に、もう一度。
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
              パスワード
            </label>
            <input
              id="password"
              type="password"
              required
              maxLength={72}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-tt-gray30/60 bg-white px-3.5 outline-none transition focus:border-tt-green focus:ring-2 focus:ring-tt-green/20"
            />
          </div>
          {error && (
            <p className="rounded-lg bg-tt-soft-green px-3 py-2 text-sm text-tt-green">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="min-h-12 w-full rounded-full bg-tt-green font-bold text-white shadow-sm transition hover:opacity-90 active:scale-[0.99] disabled:opacity-40"
          >
            {busy ? "ログイン中..." : "ログイン"}
          </button>
        </form>
      </div>
      <p className="mt-6 text-center text-sm text-tt-gray70">
        はじめての方は{" "}
        <Link href="/signup" className="font-bold text-tt-green underline">
          アカウント作成
        </Link>
      </p>
    </div>
  );
}
