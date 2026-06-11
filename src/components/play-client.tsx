"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  BLADE_CATEGORY_LABELS,
  EQUIPMENT_CATEGORY_LABELS,
  EXPERIENCE_LABELS,
  LEVEL_LABELS,
  MILESTONES,
  type BladeCategory,
  type EquipmentCategory,
  type Experience,
  type Level,
  type Winner,
} from "@/lib/types";
import type { QuestionPayload } from "@/lib/play";
import { VersusBar } from "@/components/versus-bar";

const DIAGNOSIS_AT = 30;

interface Tally {
  a: number;
  b: number;
  same: number;
  total: number;
}

type Phase =
  | { kind: "choose" }
  | { kind: "experience"; winner: Winner }
  | {
      kind: "reveal";
      winner: Winner;
      tally: Tally;
      reachedMilestone: number | null;
    };

export function PlayClient({ initial }: { initial: QuestionPayload }) {
  const router = useRouter();
  const [question, setQuestion] = useState(initial.question);
  const [progress, setProgress] = useState(initial.progress);
  const [phase, setPhase] = useState<Phase>({ kind: "choose" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadNext() {
    if (busy) return;
    setBusy(true);
    const res = await fetch("/api/question");
    setBusy(false);
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
    setPhase({ kind: "choose" });
    setError(null);
  }

  async function submit(experience: Experience) {
    if (phase.kind !== "experience" || busy) return;
    setBusy(true);
    const res = await fetch("/api/answers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionId: question.id,
        optionAEquipmentId: question.optionA.id,
        optionBEquipmentId: question.optionB.id,
        axis: question.axis,
        winner: phase.winner,
        hasActualExperience: experience,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("保存に失敗しました。お手数ですが、もう一度お試しください。");
      setPhase({ kind: "choose" });
      return;
    }
    const data = await res.json();
    setProgress((p) => ({
      ...p,
      answerCount: data.answerCount,
      nextMilestone: data.nextMilestone,
    }));
    setPhase({
      kind: "reveal",
      winner: phase.winner,
      tally: data.tally,
      reachedMilestone: data.reachedMilestone,
    });
  }

  function advance(reachedMilestone: number | null) {
    if (reachedMilestone === DIAGNOSIS_AT) {
      router.push("/diagnosis");
    } else if (reachedMilestone) {
      router.push(`/unlock/${reachedMilestone}`);
    } else {
      loadNext();
    }
  }

  const count = progress.answerCount;
  const remaining =
    progress.nextMilestone !== null ? progress.nextMilestone - count : null;

  return (
    <div className="mx-auto max-w-md">
      {/* ヘッダー: 進捗 + マイルストーン目盛り */}
      <div className="mb-6">
        <div className="mb-2 flex items-baseline justify-between text-sm text-tt-gray70">
          <span className="font-mono font-bold text-tt-charcoal">
            {Math.min(count, DIAGNOSIS_AT)}
            <span className="font-normal text-tt-gray70"> / {DIAGNOSIS_AT}問</span>
          </span>
          {remaining !== null && (
            <span>
              あと
              <span className="font-mono font-bold text-tt-green">
                {remaining}
              </span>
              問で{progress.nextMilestone === DIAGNOSIS_AT ? "診断" : "報酬"}
            </span>
          )}
        </div>
        <div className="relative h-2.5 rounded-full bg-tt-gray30/30">
          <div
            className="h-2.5 rounded-full bg-gradient-to-r from-tt-green to-tt-deep-green transition-all duration-500"
            style={{
              width: `${Math.min((count / DIAGNOSIS_AT) * 100, 100)}%`,
            }}
          />
          {MILESTONES.map((m) => (
            <span
              key={m}
              className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-sm ${
                count >= m ? "bg-tt-green" : "bg-tt-gray30"
              }`}
              style={{ left: `${(m / DIAGNOSIS_AT) * 100}%` }}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-tt-gray70">
          条件:{" "}
          {BLADE_CATEGORY_LABELS[progress.context.bladeCategory as BladeCategory]}{" "}
          × {LEVEL_LABELS[progress.context.level as Level]}
        </p>
      </div>

      {/* メインカード (質問ごとに key でアニメーション) */}
      <div key={question.id} className="animate-rise">
        <h1 className="mb-4 text-center text-lg font-bold">
          {question.prompt}
        </h1>

        <div className="relative flex flex-col gap-3">
          <EquipmentCard
            option={question.optionA}
            side="A"
            picked={phase.kind !== "choose" && phase.winner === "A"}
            dimmed={phase.kind !== "choose" && phase.winner === "B"}
          />
          <span className="absolute left-1/2 top-1/2 z-10 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-tt-charcoal font-mono text-xs font-bold text-white shadow-lg">
            VS
          </span>
          <EquipmentCard
            option={question.optionB}
            side="B"
            picked={phase.kind !== "choose" && phase.winner === "B"}
            dimmed={phase.kind !== "choose" && phase.winner === "A"}
          />
        </div>
      </div>

      {/* フェーズ別アクション */}
      {phase.kind === "choose" && (
        <div className="mt-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setPhase({ kind: "experience", winner: "A" })}
              className="h-13 rounded-xl bg-gradient-to-r from-tt-green to-tt-deep-green py-3.5 font-bold text-white shadow-lg shadow-tt-green/20 transition hover:opacity-90 active:scale-95"
            >
              Aを選ぶ
            </button>
            <button
              onClick={() => setPhase({ kind: "experience", winner: "B" })}
              className="h-13 rounded-xl bg-gradient-to-r from-tt-deep-coral to-tt-coral py-3.5 font-bold text-white shadow-lg shadow-tt-coral/20 transition hover:opacity-90 active:scale-95"
            >
              Bを選ぶ
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setPhase({ kind: "experience", winner: "SAME" })}
              className="h-11 rounded-xl border border-tt-gray30/60 bg-white text-tt-gray70 transition hover:bg-tt-offwhite active:scale-95"
            >
              同じくらい
            </button>
            <button
              onClick={() => setPhase({ kind: "experience", winner: "UNKNOWN" })}
              className="h-11 rounded-xl border border-tt-gray30/60 bg-white text-tt-gray70 transition hover:bg-tt-offwhite active:scale-95"
            >
              わからない
            </button>
          </div>
        </div>
      )}

      {phase.kind === "experience" && (
        <div className="animate-rise mt-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <p className="mb-3 text-sm font-bold">この2つの用具は…</p>
          <div className="flex flex-col gap-2">
            {(Object.entries(EXPERIENCE_LABELS) as [Experience, string][]).map(
              ([value, label]) => (
                <button
                  key={value}
                  disabled={busy}
                  onClick={() => submit(value)}
                  className="h-11 rounded-xl border border-tt-gray30/50 px-3 text-left text-sm transition hover:border-tt-green hover:bg-tt-soft-green active:scale-[0.98] disabled:opacity-50"
                >
                  {label}
                </button>
              ),
            )}
          </div>
        </div>
      )}

      {phase.kind === "reveal" && (
        <RevealPanel
          phase={phase}
          nameA={question.optionA.name}
          nameB={question.optionB.name}
          busy={busy}
          onNext={() => advance(phase.reachedMilestone)}
        />
      )}

      {error && (
        <p className="mt-4 text-center text-sm text-tt-deep-coral">{error}</p>
      )}
    </div>
  );
}

function RevealPanel({
  phase,
  nameA,
  nameB,
  busy,
  onNext,
}: {
  phase: Extract<Phase, { kind: "reveal" }>;
  nameA: string;
  nameB: string;
  busy: boolean;
  onNext: () => void;
}) {
  const { tally, winner, reachedMilestone } = phase;
  const majority =
    tally.a === tally.b ? null : tally.a > tally.b ? "A" : "B";
  let verdict: string;
  if (tally.total <= 1) {
    verdict = "この対決の最初の回答者です。あなたがデータを作っています！";
  } else if (winner === "SAME" || winner === "UNKNOWN") {
    verdict = `この対決には ${tally.total}人が回答しています。`;
  } else if (majority === null) {
    verdict = "みんなの意見はちょうど真っ二つです。";
  } else if (winner === majority) {
    const pct = Math.round(
      (Math.max(tally.a, tally.b) / tally.total) * 100,
    );
    verdict = `あなたは多数派！ ${pct}%が同じ選択をしています。`;
  } else {
    verdict = "あなたは少数派。その感覚、貴重なデータです。";
  }

  return (
    <div className="animate-rise mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <p className="text-xs font-bold tracking-wide text-tt-gray70">
        みんなの回答
        <span className="ml-2 font-mono font-normal">n={tally.total}</span>
      </p>
      <div className="mt-3">
        <VersusBar
          votesA={tally.a}
          votesB={tally.b}
          votesSame={tally.same}
          nameA={nameA}
          nameB={nameB}
          animate
        />
      </div>
      <p className="mt-3 text-sm">{verdict}</p>
      <button
        onClick={onNext}
        disabled={busy}
        autoFocus
        className={`mt-4 w-full rounded-xl py-3.5 font-bold text-white shadow-lg transition hover:opacity-90 active:scale-95 disabled:opacity-50 ${
          reachedMilestone
            ? "bg-gradient-to-r from-tt-deep-coral to-tt-coral shadow-tt-coral/20"
            : "bg-gradient-to-r from-tt-green to-tt-deep-green shadow-tt-green/20"
        }`}
      >
        {reachedMilestone === DIAGNOSIS_AT
          ? "スタイル診断を見る"
          : reachedMilestone
            ? `${reachedMilestone}問達成！ 報酬を見る`
            : "次の質問へ"}
      </button>
    </div>
  );
}

function EquipmentCard({
  option,
  side,
  picked,
  dimmed,
}: {
  option: QuestionPayload["question"]["optionA"];
  side: "A" | "B";
  picked: boolean;
  dimmed: boolean;
}) {
  const palette =
    side === "A"
      ? "bg-gradient-to-br from-tt-soft-green to-white ring-tt-green/25"
      : "bg-gradient-to-br from-tt-soft-coral to-white ring-tt-coral/25";
  const pickedRing =
    side === "A" ? "ring-2 ring-tt-green" : "ring-2 ring-tt-coral";
  return (
    <div
      className={`rounded-2xl p-4 shadow-sm ring-1 transition ${palette} ${
        picked ? pickedRing : ""
      } ${dimmed ? "opacity-50" : ""}`}
    >
      <div className="flex items-baseline justify-between">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-full font-mono text-sm font-bold text-white ${
            side === "A" ? "bg-tt-green" : "bg-tt-coral"
          }`}
        >
          {side}
        </span>
        <span className="text-xs text-tt-gray70">
          {EQUIPMENT_CATEGORY_LABELS[option.category as EquipmentCategory]}
        </span>
      </div>
      <p className="mt-2 text-xl font-bold">{option.name}</p>
      <p className="mt-0.5 text-sm text-tt-gray70">
        {option.manufacturer}
        {option.hardness != null && ` ・ スポンジ硬度 ${option.hardness}°`}
      </p>
    </div>
  );
}
