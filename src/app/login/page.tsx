"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
    <div className="mx-auto max-w-sm py-8">
      <h1 className="mb-6 text-2xl font-bold">ログイン</h1>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium">
            メールアドレス
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 w-full rounded-lg border border-tt-gray30/60 bg-white px-3 outline-none focus:border-tt-green"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium">
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
            className="h-11 w-full rounded-lg border border-tt-gray30/60 bg-white px-3 outline-none focus:border-tt-green"
          />
        </div>
        {error && <p className="text-sm text-tt-deep-coral">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="h-12 w-full rounded-full bg-tt-green font-bold text-white transition hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "ログイン中..." : "ログイン"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-tt-gray70">
        はじめての方は{" "}
        <Link href="/signup" className="text-tt-green underline">
          アカウント作成
        </Link>
      </p>
    </div>
  );
}
