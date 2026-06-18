"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  EQUIPMENT_CATEGORY_LABELS,
  type EquipmentCategory,
  type Winner,
} from "@/lib/types";
import type { QuestionPayload } from "@/lib/play";
import { VersusBar } from "@/components/versus-bar";
import { EquipmentVisual } from "@/components/equipment-visual";

// M3: AB比較カード。
// マイギア内ペアの出題なので経験フラグの確認は不要 = 1問1タップ。
// 回答→「みんなの回答」開示→次へ、のシンプルなループ。

interface Tally {
  a: number;
  b: number;
  same: number;
  total: number;
}

type Phase =
  | { kind: "choose" }
  | { kind: "reveal"; winner: Winner; tally: Tally };

export function PlayClient({ initial }: { initial: QuestionPayload }) {
  const router = useRouter();
  const [question, setQuestion] = useState(initial.question);
  const [progress, setProgress] = useState(initial.progress);
  const [phase, setPhase] = useState<Phase>({ kind: "choose" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function answer(winner: Winner) {
    if (busy) return;
    setBusy(true);
    const res = await fetch("/api/answers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionId: question.id,
        optionAEquipmentId: question.optionA.id,
        optionBEquipmentId: question.optionB.id,
        axis: question.axis,
        winner,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("保存に失敗しました。お手数ですが、もう一度お試しください。");
      return;
    }
    const data = await res.json();
    setProgress((p) => ({ ...p, answerCount: data.answerCount }));
    setPhase({ kind: "reveal", winner, tally: data.tally });
    setError(null);
  }

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
      setError("出題できる質問がありません。マイギアを追加してみてください。");
      return;
    }
    const data: QuestionPayload = await res.json();
    setQuestion(data.question);
    setProgress(data.progress);
    setPhase({ kind: "choose" });
    setError(null);
  }

  const isGearQuestion = question.source === "gear";

  return (
    <div className="mx-auto max-w-md">
      {/* ヘッダー */}
      <div className="mb-5 flex items-center justify-between text-sm">
        <span className="text-tt-gray70">
          回答 <span className="font-mono font-bold text-tt-charcoal">{progress.answerCount}</span> 件
        </span>
        <Link href="/gear" className="font-medium text-tt-green underline">
          マイギア ({progress.gearCount})
        </Link>
      </div>

      {/* 出題種別 */}
      {isGearQuestion ? (
        <p className="mb-3 text-center text-xs font-bold text-tt-deep-green">
          あなたが両方使ったことのある2本です
        </p>
      ) : progress.gearPairCount > 0 ? (
        /* 実体験ペアが「あった」が全軸出し尽くした、という正しい状態 */
        <div className="mb-3 rounded-xl bg-tt-soft-coral p-3 text-center text-xs ring-1 ring-tt-coral/15">
          <p className="font-bold text-tt-deep-coral">
            あなたのギア内の比較は出し尽くしました！
          </p>
          <p className="mt-0.5 text-tt-gray70">
            ここからはイメージ回答 (参考データ)。
            <Link href="/gear" className="font-bold text-tt-deep-coral underline">
              ラバーをもう1本追加
            </Link>
            すると質問が最大5問増えます。
          </p>
        </div>
      ) : (
        /* 実体験ペアがまだ作れていない (同面2本未満)。「出し尽くした」ではない。
           面跨ぎの2本は比較にならないため、同じ面にもう1本を促す */
        <div className="mb-3 rounded-xl bg-tt-soft-coral p-3 text-center text-xs ring-1 ring-tt-coral/15">
          <p className="font-bold text-tt-deep-coral">予想で答える（参考データ）</p>
          <p className="mt-0.5 text-tt-gray70">
            <Link href="/gear" className="font-bold text-tt-deep-coral underline">
              同じ面のラバーをもう1本
            </Link>
            登録すると、両方使った比較が出ます。
          </p>
        </div>
      )}

      {/* メインカード */}
      <div key={question.id} className="animate-rise">
        <h1 className="mb-4 text-center text-lg font-bold">{question.prompt}</h1>

        <div className="relative flex flex-col gap-3">
          <EquipmentCard
            option={question.optionA}
            side="A"
            condition={question.conditionA}
            isCurrent={question.gearA?.isCurrent ?? false}
            picked={phase.kind === "reveal" && phase.winner === "A"}
            dimmed={phase.kind === "reveal" && phase.winner === "B"}
          />
          <span className="absolute left-1/2 top-1/2 z-10 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-tt-charcoal font-mono text-xs font-bold text-white shadow-lg">
            VS
          </span>
          <EquipmentCard
            option={question.optionB}
            side="B"
            condition={question.conditionB}
            isCurrent={question.gearB?.isCurrent ?? false}
            picked={phase.kind === "reveal" && phase.winner === "B"}
            dimmed={phase.kind === "reveal" && phase.winner === "A"}
          />
        </div>
      </div>

      {/* アクション: 1タップで回答完了 */}
      {phase.kind === "choose" ? (
        <div className="mt-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <button
              disabled={busy}
              onClick={() => answer("A")}
              className="rounded-xl bg-gradient-to-r from-tt-green to-gs-red-strong py-3.5 font-bold text-white shadow-lg shadow-tt-green/20 transition hover:opacity-90 active:scale-95 disabled:opacity-50"
            >
              Aを選ぶ
            </button>
            <button
              disabled={busy}
              onClick={() => answer("B")}
              className="rounded-xl bg-gradient-to-r from-tt-deep-coral to-tt-coral py-3.5 font-bold text-white shadow-lg shadow-tt-coral/20 transition hover:opacity-90 active:scale-95 disabled:opacity-50"
            >
              Bを選ぶ
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              disabled={busy}
              onClick={() => answer("SAME")}
              className="h-11 rounded-xl border border-tt-gray30/60 bg-white text-tt-gray70 transition hover:bg-tt-offwhite active:scale-95 disabled:opacity-50"
            >
              同じくらい
            </button>
            <button
              disabled={busy}
              onClick={() => answer("UNKNOWN")}
              className="h-11 rounded-xl border border-tt-gray30/60 bg-white text-tt-gray70 transition hover:bg-tt-offwhite active:scale-95 disabled:opacity-50"
            >
              わからない
            </button>
          </div>
        </div>
      ) : (
        <RevealPanel
          tally={phase.tally}
          winner={phase.winner}
          nameA={question.optionA.name}
          nameB={question.optionB.name}
          aId={question.optionA.id}
          bId={question.optionB.id}
          busy={busy}
          onNext={loadNext}
        />
      )}

      {error && (
        <p className="mt-4 text-center text-sm text-tt-deep-coral">{error}</p>
      )}
    </div>
  );
}

function RevealPanel({
  tally,
  winner,
  nameA,
  nameB,
  aId,
  bId,
  busy,
  onNext,
}: {
  tally: Tally;
  winner: Winner;
  nameA: string;
  nameB: string;
  aId: string;
  bId: string;
  busy: boolean;
  onNext: () => void;
}) {
  const majority = tally.a === tally.b ? null : tally.a > tally.b ? "A" : "B";
  let verdict: string;
  if (tally.total <= 1) {
    verdict = "この比較にいちばん乗り！あなたの1票から見えてきます。";
  } else if (winner === "SAME" || winner === "UNKNOWN") {
    verdict = `この対決には ${tally.total}人が回答しています。`;
  } else if (majority === null) {
    verdict = "みんなの意見はちょうど真っ二つです。";
  } else if (winner === majority) {
    const pct = Math.round((Math.max(tally.a, tally.b) / tally.total) * 100);
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
      <p className="mt-1 text-xs text-tt-green">
        +1 回答ありがとう！この比較に反映されました
        {tally.total < 3 && (
          <span className="ml-1 text-tt-deep-coral">
            — あと{3 - tally.total}件でみんなに公開されます
          </span>
        )}
      </p>
      <button
        onClick={onNext}
        disabled={busy}
        autoFocus
        className="mt-4 w-full rounded-xl bg-gradient-to-r from-tt-green to-gs-red-strong py-3.5 font-bold text-white shadow-lg shadow-tt-green/20 transition hover:opacity-90 active:scale-95 disabled:opacity-50"
      >
        次の質問へ
      </button>
      <a
        href={`/compare/${aId}/vs/${bId}`}
        target="_blank"
        rel="noreferrer"
        className="mt-3 block text-center text-xs text-tt-gray70 underline"
      >
        この対決の詳細データを見る（軸別・絞り込み）
      </a>
    </div>
  );
}

function EquipmentCard({
  option,
  side,
  condition,
  isCurrent,
  picked,
  dimmed,
}: {
  option: QuestionPayload["question"]["optionA"];
  side: "A" | "B";
  condition: string | null;
  isCurrent: boolean;
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
        <span className="flex items-center gap-2">
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full font-mono text-sm font-bold text-white ${
              side === "A" ? "bg-tt-green" : "bg-tt-coral"
            }`}
          >
            {side}
          </span>
          {isCurrent && (
            <span className="rounded-full bg-tt-charcoal px-2.5 py-0.5 text-xs font-bold text-white">
              いま使用中
            </span>
          )}
        </span>
        <span className="text-xs text-tt-gray70">
          {EQUIPMENT_CATEGORY_LABELS[option.category as EquipmentCategory]}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <EquipmentVisual
          category={option.category}
          manufacturer={option.manufacturer}
          bladeSubcategory={option.bladeSubcategory}
          imageUrl={option.imageUrl}
          name={option.name}
          size={56}
        />
        <div className="min-w-0">
          <p className="text-xl font-bold leading-snug">{option.name}</p>
          <p className="mt-0.5 text-sm text-tt-gray70">{option.manufacturer}</p>
        </div>
      </div>
      {condition && (
        <p className="mt-1.5 inline-block rounded-full bg-white/80 px-2.5 py-1 text-xs text-tt-gray70 ring-1 ring-black/5">
          {condition}
        </p>
      )}
    </div>
  );
}
