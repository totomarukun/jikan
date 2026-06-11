"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

// M6: 登録フォーム
export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
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
      body: JSON.stringify({ email, nickname: nickname || undefined }),
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
    <div className="mx-auto max-w-sm py-8">
      <h1 className="mb-2 text-2xl font-bold">アカウントを作成</h1>
      <p className="mb-6 text-sm text-tt-gray70">
        これまでの回答は登録後も引き継がれます。
      </p>

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
          <label htmlFor="nickname" className="mb-1 block text-sm font-medium">
            ニックネーム（任意）
          </label>
          <input
            id="nickname"
            type="text"
            maxLength={30}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="h-11 w-full rounded-lg border border-tt-gray30/60 bg-white px-3 outline-none focus:border-tt-green"
            placeholder="たくたろう"
          />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1"
          />
          <span>
            <Link href="/terms" className="text-tt-green underline">
              利用規約
            </Link>
            に同意します
          </span>
        </label>

        {error && <p className="text-sm text-tt-deep-coral">{error}</p>}

        <button
          type="submit"
          disabled={!agreed || busy}
          className="h-12 w-full rounded-full bg-tt-green font-bold text-white transition hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "作成中..." : "登録する"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-tt-gray70">
        アカウントをお持ちの方は{" "}
        <Link href="/login" className="text-tt-green underline">
          ログイン
        </Link>
      </p>
    </div>
  );
}
