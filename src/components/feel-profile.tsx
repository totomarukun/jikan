import type { FeelStatement } from "@/lib/feel";

// 「あなたの◯◯基準の体感」表示。
// 多数派の体感を文として出し、割れている場合は割れていると正直に見せる。
export function FeelProfileCard({
  baseName,
  targetName,
  statements,
  compact = false,
}: {
  baseName: string;
  targetName: string;
  statements: FeelStatement[];
  compact?: boolean;
}) {
  if (statements.length === 0) {
    return (
      <p className="text-sm leading-6 text-tt-gray70">
        「{baseName}」と「{targetName}
        」の体感比較データはまだありません。両方使ったことがある人の回答が集まると、
        試打せずに体感がわかるようになります。
      </p>
    );
  }

  const bothOnly = statements.every((s) => s.tally.bothOnly);

  return (
    <div>
      {!compact && (
        <p className="mb-2 text-xs text-tt-gray70">
          {bothOnly
            ? "両方使ったことがある人の体感だけを集計しています。"
            : "回答がまだ少ないため、イメージ回答も含めた集計です。"}
        </p>
      )}
      <div className="space-y-2.5">
        {statements.map((s) => (
          <FeelRow key={s.axis} statement={s} />
        ))}
      </div>
    </div>
  );
}

function FeelRow({ statement: s }: { statement: FeelStatement }) {
  const decided = s.tally.more + s.tally.less;
  const total = decided + s.tally.same;
  const morePct = Math.round((s.tally.more / total) * 100);
  const lessPct = Math.round((s.tally.less / total) * 100);

  return (
    <div className="rounded-xl bg-tt-offwhite p-3 ring-1 ring-black/5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-bold text-tt-gray70">{s.label}</span>
        <span className="font-mono text-[10px] text-tt-gray70">
          n={s.tally.n}
          {s.tally.bothOnly && " (両方使った人)"}
        </span>
      </div>
      <p className="mt-1 text-sm font-bold">
        {s.verdict === "split" ? (
          <>
            意見が割れています
            <span className="ml-1 font-mono text-xs font-normal text-tt-gray70">
              ({s.tally.more}人 vs {s.tally.less}人)
            </span>
          </>
        ) : (
          <>
            <span
              className={
                s.verdict === "more" ? "text-tt-deep-coral" : "text-tt-deep-green"
              }
            >
              {s.verdict === "more" ? s.moreLabel : s.lessLabel}
            </span>
            <span className="ml-1.5 font-mono text-xs text-tt-gray70">
              {s.pct}%
            </span>
          </>
        )}
      </p>
      {/* 分布バー: 左=基準寄り / 中=同じ / 右=対象寄り */}
      <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-tt-gray30/30">
        {lessPct > 0 && (
          <div className="bg-tt-green/70" style={{ width: `${lessPct}%` }} />
        )}
        {total - decided > 0 && (
          <div
            className="bg-tt-gray30"
            style={{ width: `${100 - morePct - lessPct}%` }}
          />
        )}
        {morePct > 0 && (
          <div className="bg-tt-coral/70" style={{ width: `${morePct}%` }} />
        )}
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-tt-gray70">
        <span>{s.lessLabel}</span>
        <span>{s.moreLabel}</span>
      </div>
    </div>
  );
}
