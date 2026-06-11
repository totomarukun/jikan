"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  BLADE_CATEGORY_LABELS,
  LEVEL_LABELS,
  PLAYSTYLE_LABELS,
} from "@/lib/types";

// M2: 前提質問 (3問・9秒以内に完了が許容ライン)
const QUESTIONS = [
  {
    key: "level" as const,
    text: "卓球レベルは？",
    options: Object.entries(LEVEL_LABELS),
  },
  {
    key: "playstyle" as const,
    text: "プレースタイルは？",
    options: Object.entries(PLAYSTYLE_LABELS),
  },
  {
    key: "bladeCategory" as const,
    text: "使っているラケットの系統は？",
    options: Object.entries(BLADE_CATEGORY_LABELS),
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const question = QUESTIONS[step];

  async function select(value: string) {
    const next = { ...answers, [question.key]: value };
    setAnswers(next);
    if (step < QUESTIONS.length - 1) {
      setStep(step + 1);
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    if (res.ok) {
      router.push("/play");
    } else {
      setSubmitting(false);
      setError("送信に失敗しました。お手数ですが、もう一度お試しください。");
    }
  }

  return (
    <div className="mx-auto max-w-md py-8">
      <div className="mb-6">
        <div className="mb-2 flex justify-between text-sm text-tt-gray70">
          <span>前提質問</span>
          <span className="font-mono">
            {step + 1} / {QUESTIONS.length}
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-tt-gray30/30">
          <div
            className="h-2.5 rounded-full bg-gradient-to-r from-tt-green to-tt-deep-green transition-all duration-300"
            style={{ width: `${((step + 1) / QUESTIONS.length) * 100}%` }}
          />
        </div>
      </div>

      <h1 key={step} className="animate-rise mb-6 text-lg font-bold">
        {question.text}
      </h1>

      <div key={`opts-${step}`} className="animate-rise flex flex-col gap-3 [animation-delay:60ms]">
        {question.options.map(([value, label]) => (
          <button
            key={value}
            disabled={submitting}
            onClick={() => select(value)}
            className={`h-12 rounded-xl border px-4 text-left shadow-sm transition hover:border-tt-green hover:bg-tt-soft-green active:scale-[0.98] disabled:opacity-50 ${
              answers[question.key] === value
                ? "border-tt-green bg-tt-soft-green"
                : "border-tt-gray30/50 bg-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-tt-deep-coral">{error}</p>}

      {step > 0 && (
        <button
          onClick={() => setStep(step - 1)}
          disabled={submitting}
          className="mt-6 text-sm text-tt-gray70 underline"
        >
          ← 戻る
        </button>
      )}
    </div>
  );
}
