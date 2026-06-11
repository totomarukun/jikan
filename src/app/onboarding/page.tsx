"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  useRubberSearch,
  type RubberItem,
} from "@/components/use-rubber-search";
import {
  BLADE_CATEGORY_LABELS,
  LEVEL_LABELS,
  PLAYSTYLE_LABELS,
} from "@/lib/types";

// M2: 前提質問 (3問 + 任意の現用ラバー登録)
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
const RUBBER_STEP = QUESTIONS.length; // 4問目: 現用ラバー (任意)
const TOTAL_STEPS = QUESTIONS.length + 1;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish(currentRubberId: string | null) {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...answers,
        ...(currentRubberId ? { currentRubberId } : {}),
      }),
    });
    if (res.ok) {
      router.push("/play");
    } else {
      setSubmitting(false);
      setError("送信に失敗しました。お手数ですが、もう一度お試しください。");
    }
  }

  function select(value: string) {
    setAnswers({ ...answers, [QUESTIONS[step].key]: value });
    setStep(step + 1);
  }

  return (
    <div className="mx-auto max-w-md py-8">
      <div className="mb-6">
        <div className="mb-2 flex justify-between text-sm text-tt-gray70">
          <span>前提質問</span>
          <span className="font-mono">
            {step + 1} / {TOTAL_STEPS}
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-tt-gray30/30">
          <div
            className="h-2.5 rounded-full bg-gradient-to-r from-tt-green to-tt-deep-green transition-all duration-300"
            style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
          />
        </div>
      </div>

      {step < RUBBER_STEP ? (
        <>
          <h1 key={step} className="animate-rise mb-6 text-lg font-bold">
            {QUESTIONS[step].text}
          </h1>
          <div
            key={`opts-${step}`}
            className="animate-rise flex flex-col gap-3 [animation-delay:60ms]"
          >
            {QUESTIONS[step].options.map(([value, label]) => (
              <button
                key={value}
                disabled={submitting}
                onClick={() => select(value)}
                className={`h-12 rounded-xl border px-4 text-left shadow-sm transition hover:border-tt-green hover:bg-tt-soft-green active:scale-[0.98] disabled:opacity-50 ${
                  answers[QUESTIONS[step].key] === value
                    ? "border-tt-green bg-tt-soft-green"
                    : "border-tt-gray30/50 bg-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <RubberStep submitting={submitting} onFinish={finish} />
      )}

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

function RubberStep({
  submitting,
  onFinish,
}: {
  submitting: boolean;
  onFinish: (currentRubberId: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<RubberItem | null>(null);
  const results = useRubberSearch(query);

  return (
    <div className="animate-rise">
      <h1 className="mb-1 text-lg font-bold">
        いま使っているフォア面ラバーは？
      </h1>
      <p className="mb-5 text-sm text-tt-gray70">
        登録すると「いまの自分の用具と比べてどうか」で比較できます（あとで変更可）。
      </p>

      {picked ? (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-tt-green bg-tt-soft-green p-4">
          <div>
            <p className="font-bold">{picked.name}</p>
            <p className="text-xs text-tt-gray70">{picked.manufacturer}</p>
          </div>
          <button
            onClick={() => setPicked(null)}
            className="text-sm text-tt-gray70 underline"
          >
            変更
          </button>
        </div>
      ) : (
        <>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="例: ロゼナ / テナジー / マークV"
            className="mb-3 h-12 w-full rounded-xl border border-tt-gray30/50 bg-white px-4 shadow-sm outline-none focus:border-tt-green"
          />
          <div className="mb-4 flex flex-col gap-2">
            {results.map((item) => (
              <button
                key={item.id}
                onClick={() => setPicked(item)}
                className="rounded-xl border border-tt-gray30/50 bg-white p-3 text-left text-sm shadow-sm transition hover:border-tt-green hover:bg-tt-soft-green active:scale-[0.98]"
              >
                <span className="font-bold">{item.name}</span>
                <span className="ml-2 text-xs text-tt-gray70">
                  {item.manufacturer}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="space-y-3">
        <button
          disabled={submitting || !picked}
          onClick={() => onFinish(picked!.id)}
          className="w-full rounded-xl bg-gradient-to-r from-tt-green to-tt-deep-green py-3.5 font-bold text-white shadow-lg shadow-tt-green/20 transition hover:opacity-90 active:scale-95 disabled:opacity-40"
        >
          この内容で始める
        </button>
        <button
          disabled={submitting}
          onClick={() => onFinish(null)}
          className="w-full rounded-xl border border-tt-gray30/50 bg-white py-3 text-sm text-tt-gray70 transition hover:bg-tt-offwhite disabled:opacity-50"
        >
          わからない / 使っていない（スキップ）
        </button>
      </div>
    </div>
  );
}
