"use client";

import { useState } from "react";

// 体感を残す: funnel思想「レビューを見るために、自分の体感を書く」。
// 好み(overall)だけでなく軸別(スピード/スピン/コントロール/球持ち/弧線/硬さ)にも
// 答えられる。軸別nが貯まらないと「軸別の相対差分」というコア価値がデータ枯渇するため、
// 軸別投票の導線をここに置く。各軸の回答は /api/answers に1件ずつ送る。

type Winner = "A" | "B" | "SAME";

const AXES: Array<{ key: string; label: string; primary?: boolean }> = [
  { key: "overall", label: "好み", primary: true },
  { key: "speed", label: "スピード" },
  { key: "spin", label: "スピン" },
  { key: "control", label: "コントロール" },
  { key: "ballHold", label: "球持ち" },
  { key: "arc", label: "弧線" },
  { key: "hardness", label: "硬さ" },
];

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
  const [picks, setPicks] = useState<Record<string, Winner>>({});
  const [comment, setComment] = useState("");
  const [showAxes, setShowAxes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const setPick = (axis: string, w: Winner) =>
    setPicks((p) => (p[axis] === w ? omit(p, axis) : { ...p, [axis]: w }));

  const pickedAxes = Object.keys(picks);
  const canSubmit = pickedAxes.length > 0 && !saving;

  async function submit() {
    setSaving(true);
    // コメントは overall に付ける(なければ最初に選んだ軸)
    const commentAxis = picks.overall ? "overall" : pickedAxes[0];
    for (const axis of pickedAxes) {
      await fetch("/api/answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: "voice",
          optionAEquipmentId: aId,
          optionBEquipmentId: bId,
          axis,
          winner: picks[axis],
          comment:
            axis === commentAxis && comment.trim()
              ? comment.trim()
              : undefined,
        }),
      });
    }
    setSaving(false);
    setDone(true);
  }

  if (done) {
    return (
      <p className="rounded-xl bg-tt-soft-green p-3 text-sm font-bold text-tt-deep-green">
        ありがとうございます。{pickedAxes.length}軸の体感が相対マップに反映されました。
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <AxisRow
        label="どちらが好み？"
        nameA={nameA}
        nameB={nameB}
        value={picks.overall}
        onPick={(w) => setPick("overall", w)}
      />

      <button
        type="button"
        onClick={() => setShowAxes((v) => !v)}
        className="text-xs font-bold text-tt-green underline"
      >
        {showAxes ? "軸別を閉じる" : "軸別にも答える（任意・地図の解像度が上がります）"}
      </button>

      {showAxes && (
        <div className="space-y-2 rounded-xl bg-tt-offwhite p-3 ring-1 ring-black/5">
          {AXES.filter((a) => !a.primary).map((a) => (
            <AxisRow
              key={a.key}
              label={a.label}
              nameA={nameA}
              nameB={nameB}
              value={picks[a.key]}
              onPick={(w) => setPick(a.key, w)}
              compact
            />
          ))}
        </div>
      )}

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        maxLength={280}
        placeholder="ひとこと体感（例: ロゼナより球持ちがあって、バックのループで掴みやすい）"
        className="block w-full rounded-lg border border-tt-gray30/50 px-3 py-2 text-sm"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="w-full rounded-full bg-tt-charcoal py-2.5 text-sm font-bold text-white disabled:opacity-50"
      >
        {saving
          ? "送信中…"
          : pickedAxes.length > 0
            ? `体感を残す（${pickedAxes.length}軸）`
            : "どちらが好みか選んでください"}
      </button>
    </div>
  );
}

function AxisRow({
  label,
  nameA,
  nameB,
  value,
  onPick,
  compact,
}: {
  label: string;
  nameA: string;
  nameB: string;
  value: Winner | undefined;
  onPick: (w: Winner) => void;
  compact?: boolean;
}) {
  const btn = (w: Winner, text: string) => (
    <button
      type="button"
      onClick={() => onPick(w)}
      className={`flex-1 truncate rounded-full px-2 py-1.5 text-xs font-bold transition ${
        value === w
          ? "bg-tt-deep-green text-white"
          : "bg-white text-tt-gray70 ring-1 ring-tt-gray30/50 hover:bg-tt-soft-green"
      }`}
    >
      {text}
    </button>
  );
  return (
    <div>
      {!compact && (
        <p className="mb-1 text-xs text-tt-gray70">{label}</p>
      )}
      <div className="flex items-center gap-1.5">
        {compact && (
          <span className="w-16 shrink-0 text-[11px] font-bold text-tt-gray70">
            {label}
          </span>
        )}
        {btn("A", nameA)}
        {btn("SAME", "同等")}
        {btn("B", nameB)}
      </div>
    </div>
  );
}

function omit<T extends Record<string, unknown>>(obj: T, key: string): T {
  const { [key]: _omit, ...rest } = obj;
  void _omit;
  return rest as T;
}
