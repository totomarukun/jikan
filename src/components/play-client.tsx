"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  BLADE_CATEGORY_LABELS,
  EQUIPMENT_CATEGORY_LABELS,
  EXPERIENCE_LABELS,
  LEVEL_LABELS,
  type BladeCategory,
  type EquipmentCategory,
  type Experience,
  type Level,
  type Winner,
} from "@/lib/types";
import type { QuestionPayload } from "@/lib/play";

const DIAGNOSIS_AT = 30;

export function PlayClient({ initial }: { initial: QuestionPayload }) {
  const router = useRouter();
  const [question, setQuestion] = useState(initial.question);
  const [progress, setProgress] = useState(initial.progress);
  const [pendingWinner, setPendingWinner] = useState<Winner | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadNext() {
    const res = await fetch("/api/question");
    if (res.status === 401) {
      router.replace("/onboarding");
      return;
    }
    if (!res.ok) {
      setError("出題できる質問がありません。時間をおいてお試しください。");
      return;
    }
    const data: QuestionPayload = await res.json();
    setQuestion(data.question);
    setProgress(data.progress);
    setPendingWinner(null);
    setError(null);
  }

  async function submit(experience: Experience) {
    if (pendingWinner === null || busy) return;
    setBusy(true);
    const res = await fetch("/api/answers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionId: question.id,
        optionAEquipmentId: question.optionA.id,
        optionBEquipmentId: question.optionB.id,
        axis: question.axis,
        winner: pendingWinner,
        hasActualExperience: experience,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("保存に失敗しました。お手数ですが、もう一度お試しください。");
      setPendingWinner(null);
      return;
    }
    const data = await res.json();
    if (data.reachedMilestone === DIAGNOSIS_AT) {
      router.push("/diagnosis");
    } else if (data.reachedMilestone) {
      router.push(`/unlock/${data.reachedMilestone}`);
    } else {
      await loadNext();
    }
  }

  const count = progress.answerCount;
  const remaining =
    progress.nextMilestone !== null ? progress.nextMilestone - count : null;

  return (
    <div className="mx-auto max-w-md">
      {/* ヘッダー: 進捗 */}
      <div className="mb-6">
        <div className="mb-2 flex justify-between text-sm text-tt-gray70">
          <span className="font-mono">
            {Math.min(count, DIAGNOSIS_AT)} / {DIAGNOSIS_AT}問
          </span>
          {remaining !== null && (
            <span>
              あと{remaining}問で
              {progress.nextMilestone === DIAGNOSIS_AT ? "診断" : "報酬"}
              アンロック
            </span>
          )}
        </div>
        <div className="h-2 rounded-full bg-tt-gray30/40">
          <div
            className="h-2 rounded-full bg-tt-green transition-all"
            style={{
              width: `${Math.min((count / DIAGNOSIS_AT) * 100, 100)}%`,
            }}
          />
        </div>
        <p className="mt-2 text-xs text-tt-gray70">
          条件:{" "}
          {BLADE_CATEGORY_LABELS[progress.context.bladeCategory as BladeCategory]}{" "}
          × {LEVEL_LABELS[progress.context.level as Level]}
        </p>
      </div>

      {/* メインカード */}
      <h1 className="mb-4 text-center text-lg font-medium">{question.prompt}</h1>

      <div className="flex flex-col gap-2">
        <EquipmentCard option={question.optionA} side="A" />
        <p className="text-center text-sm font-bold text-tt-gray70">VS</p>
        <EquipmentCard option={question.optionB} side="B" />
      </div>

      {/* アクション or 経験フラグ */}
      {pendingWinner === null ? (
        <div className="mt-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setPendingWinner("A")}
              className="h-12 rounded-lg bg-tt-green font-bold text-white transition hover:opacity-90"
            >
              Aを選ぶ
            </button>
            <button
              onClick={() => setPendingWinner("B")}
              className="h-12 rounded-lg bg-tt-coral font-bold text-white transition hover:opacity-90"
            >
              Bを選ぶ
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setPendingWinner("SAME")}
              className="h-11 rounded-lg border border-tt-gray30/60 bg-white text-tt-gray70 transition hover:bg-tt-offwhite"
            >
              同じくらい
            </button>
            <button
              onClick={() => setPendingWinner("UNKNOWN")}
              className="h-11 rounded-lg border border-tt-gray30/60 bg-white text-tt-gray70 transition hover:bg-tt-offwhite"
            >
              わからない
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-xl bg-white p-4 ring-1 ring-tt-gray30/40">
          <p className="mb-3 text-sm font-medium">この2つの用具は…</p>
          <div className="flex flex-col gap-2">
            {(Object.entries(EXPERIENCE_LABELS) as [Experience, string][]).map(
              ([value, label]) => (
                <button
                  key={value}
                  disabled={busy}
                  onClick={() => submit(value)}
                  className="h-11 rounded-lg border border-tt-gray30/60 px-3 text-left text-sm transition hover:border-tt-green hover:bg-tt-soft-green disabled:opacity-50"
                >
                  {label}
                </button>
              ),
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="mt-4 text-center text-sm text-tt-deep-coral">{error}</p>
      )}
    </div>
  );
}

function EquipmentCard({
  option,
  side,
}: {
  option: QuestionPayload["question"]["optionA"];
  side: "A" | "B";
}) {
  const palette =
    side === "A"
      ? "bg-tt-soft-green ring-tt-green/30"
      : "bg-tt-soft-coral ring-tt-coral/30";
  return (
    <div className={`rounded-xl p-4 ring-1 ${palette}`}>
      <div className="flex items-baseline justify-between">
        <span
          className={`font-mono text-sm font-bold ${
            side === "A" ? "text-tt-deep-green" : "text-tt-deep-coral"
          }`}
        >
          {side}
        </span>
        <span className="text-xs text-tt-gray70">
          {EQUIPMENT_CATEGORY_LABELS[option.category as EquipmentCategory]}
        </span>
      </div>
      <p className="mt-1 text-lg font-bold">{option.name}</p>
      <p className="text-sm text-tt-gray70">
        {option.manufacturer}
        {option.hardness != null && ` ・ スポンジ硬度 ${option.hardness}°`}
      </p>
    </div>
  );
}
