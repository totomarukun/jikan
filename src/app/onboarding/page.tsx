"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GearForm, type GearDraft } from "@/components/gear-form";
import {
  BLADE_CATEGORY_LABELS,
  GEAR_SIDE_LABELS,
  LEVEL_LABELS,
  PLAYSTYLE_LABELS,
  THICKNESS_LABELS,
} from "@/lib/types";

// M2: 前提質問 (3問) + マイギア登録。
// マイギア (使ったことのあるラバー) がこのサービスの土台:
// 出題はギア内ペアから生成されるため、2本以上の登録を促す。
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
const GEAR_STEP = QUESTIONS.length;
const TOTAL_STEPS = QUESTIONS.length + 1;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [gear, setGear] = useState<GearDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // プロフィール編集での再訪時は前回の回答をプリフィルする
  useEffect(() => {
    let cancelled = false;
    fetch("/api/onboarding")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        const prefilled: Record<string, string> = {};
        for (const q of QUESTIONS) {
          if (typeof d[q.key] === "string" && d[q.key]) prefilled[q.key] = d[q.key];
        }
        if (Object.keys(prefilled).length > 0) {
          setAnswers((prev) => ({ ...prefilled, ...prev }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function select(value: string) {
    setAnswers({ ...answers, [QUESTIONS[step].key]: value });
    setStep(step + 1);
  }

  async function finish() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(answers),
    });
    if (!res.ok) {
      setSubmitting(false);
      setError("送信に失敗しました。お手数ですが、もう一度お試しください。");
      return;
    }
    for (const g of gear) {
      await fetch("/api/gear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equipmentId: g.equipment.id,
          side: g.side,
          thickness: g.thickness,
          bladeEquipmentId: g.blade?.id,
          isCurrent: g.isCurrent,
        }),
      });
    }
    router.push("/play");
  }

  return (
    <div className="mx-auto max-w-md py-8">
      <div className="mb-6">
        <div className="mb-2 flex justify-between text-sm text-tt-gray70">
          <span>{step < GEAR_STEP ? "かんたんな質問" : "マイギア登録"}</span>
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

      {step < GEAR_STEP ? (
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
        <div className="animate-rise">
          <h1 className="mb-1 text-lg font-bold">
            使ったことのあるラバーを登録
          </h1>
          <p className="mb-4 text-sm leading-6 text-tt-gray70">
            あなたが<strong className="text-tt-charcoal">実際に使った</strong>
            ラバー同士の比較だけを質問します。
            <strong className="text-tt-charcoal">2本以上</strong>
            登録すると比較が始まります（あとから追加できます）。
          </p>

          {/* 登録済みリスト */}
          {gear.length > 0 && (
            <ul className="mb-4 space-y-2">
              {gear.map((g, i) => (
                <li
                  key={`${g.equipment.id}-${g.side}-${i}`}
                  className="flex items-center justify-between rounded-xl bg-tt-soft-green p-3 text-sm ring-1 ring-tt-green/20"
                >
                  <div>
                    <p className="font-bold">
                      {g.equipment.name}
                      {g.isCurrent && (
                        <span className="ml-2 rounded-full bg-tt-charcoal px-2 py-0.5 text-[10px] font-bold text-white">
                          いま使用中
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-tt-gray70">
                      {GEAR_SIDE_LABELS[g.side]}面・{THICKNESS_LABELS[g.thickness]}
                      {g.blade && ` / ${g.blade.name}`}
                    </p>
                  </div>
                  <button
                    onClick={() => setGear(gear.filter((_, j) => j !== i))}
                    className="text-xs text-tt-gray70 underline"
                  >
                    削除
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <GearForm
              onAdd={(draft) => setGear([...gear, draft])}
              existing={gear.map((g) => ({
                equipmentId: g.equipment.id,
                side: g.side,
                thickness: g.thickness,
              }))}
            />
          </div>

          {error && <p className="mt-3 text-sm text-tt-deep-coral">{error}</p>}

          <div className="mt-5 space-y-3">
            <button
              disabled={submitting || gear.length === 0}
              onClick={finish}
              className="w-full rounded-xl bg-gradient-to-r from-tt-green to-tt-deep-green py-3.5 font-bold text-white shadow-lg shadow-tt-green/20 transition hover:opacity-90 active:scale-95 disabled:opacity-40"
            >
              {submitting
                ? "保存中..."
                : gear.length >= 2
                  ? `${gear.length}本のギアで始める`
                  : gear.length === 1
                    ? "1本だけで始める（イメージ比較になります）"
                    : "ラバーを追加してください"}
            </button>
            <button
              disabled={submitting}
              onClick={finish}
              className="w-full rounded-xl border border-tt-gray30/50 bg-white py-3 text-sm text-tt-gray70 transition hover:bg-tt-offwhite disabled:opacity-50"
            >
              あとで登録する（スキップ）
            </button>
          </div>
        </div>
      )}

      {step > 0 && step < GEAR_STEP && (
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
