"use client";

import { useState } from "react";

// 体感コメント投稿: funnel思想「レビューを見るために、自分の体感を書く」。
// 好みの選択(A/B/同等)とひとことを /api/answers に送る(overall軸)。
export function PairCommentForm({
  aId,
  bId,
  nameA,
  nameB,
}: {
  aId: string;
  bId: string;
  nameA: string;
  nameB: string;
}) {
  const [pick, setPick] = useState<"A" | "B" | "SAME" | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!pick) return;
    setSaving(true);
    const res = await fetch("/api/answers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionId: "voice",
        optionAEquipmentId: aId,
        optionBEquipmentId: bId,
        axis: "overall",
        winner: pick,
        comment: comment.trim() || undefined,
      }),
    });
    setSaving(false);
    if (res.ok) setDone(true);
  }

  if (done) {
    return (
      <p className="rounded-xl bg-tt-soft-green p-3 text-sm font-bold text-tt-deep-green">
        ありがとうございます。あなたの体感が相対マップに反映されました。
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-tt-gray70">
        どちらが好みでしたか？（ひとこと体感を添えると、両方使った人の言葉として残ります）
      </p>
      <div className="flex gap-2">
        {(
          [
            ["A", nameA],
            ["SAME", "同等"],
            ["B", nameB],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setPick(v)}
            className={`flex-1 truncate rounded-full px-3 py-2 text-xs font-bold transition ${
              pick === v
                ? "bg-tt-deep-green text-white"
                : "bg-white text-tt-gray70 ring-1 ring-tt-gray30/50 hover:bg-tt-soft-green"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        maxLength={280}
        placeholder="例: ロゼナより球持ちがあって、バックのループで掴む感覚が出しやすい"
        className="block w-full rounded-lg border border-tt-gray30/50 px-3 py-2 text-sm"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!pick || saving}
        className="w-full rounded-full bg-tt-charcoal py-2.5 text-sm font-bold text-white disabled:opacity-50"
      >
        {saving ? "送信中…" : "体感を残す"}
      </button>
    </div>
  );
}
