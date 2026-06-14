// A vs B の集計バー (サーバー/クライアント両用の純粋コンポーネント)
export function VersusBar({
  votesA,
  votesB,
  votesSame = 0,
  nameA,
  nameB,
  animate = false,
}: {
  votesA: number;
  votesB: number;
  votesSame?: number;
  nameA: string;
  nameB: string;
  animate?: boolean;
}) {
  const total = votesA + votesB + votesSame;
  if (total === 0) return null;
  const pa = Math.round((votesA / total) * 100);
  const pb = Math.round((votesB / total) * 100);
  const ps = 100 - pa - pb;
  return (
    <div>
      <div className="flex items-baseline justify-between font-mono text-sm font-bold">
        <span className="text-tt-deep-green">{pa}%</span>
        {ps > 0 && <span className="text-xs text-tt-gray30">{ps}%</span>}
        <span className="text-tt-deep-coral">{pb}%</span>
      </div>
      <div
        className={`mt-1 flex h-3 overflow-hidden rounded-full bg-tt-gray30/30 ${
          animate ? "bar-grow" : ""
        }`}
      >
        {pa > 0 && (
          <div
            className="bg-gradient-to-r from-tt-green to-tt-deep-green"
            style={{ width: `${pa}%` }}
          />
        )}
        {ps > 0 && <div className="bg-tt-gray30" style={{ width: `${ps}%` }} />}
        {pb > 0 && (
          <div
            className="bg-gradient-to-r from-tt-deep-coral to-tt-coral"
            style={{ width: `${pb}%` }}
          />
        )}
      </div>
      <div className="mt-1 flex justify-between text-xs text-tt-gray70">
        <span className="max-w-[45%] truncate">{nameA}</span>
        <span className="max-w-[45%] truncate text-right">{nameB}</span>
      </div>
    </div>
  );
}

/** n が少ないペアは % を出さず「集計中」と表示する (信頼性の一貫性) */
export function VersusBarOrPending(props: {
  votesA: number;
  votesB: number;
  votesSame?: number;
  nameA: string;
  nameB: string;
  minTotal?: number;
}) {
  const total = props.votesA + props.votesB + (props.votesSame ?? 0);
  if (total < (props.minTotal ?? 3)) {
    return (
      <p className="text-xs text-tt-gray70">
        回答{total}件・
        <span className="font-bold text-tt-deep-coral">
          あと{(props.minTotal ?? 3) - total}件で結果が見られます
        </span>
      </p>
    );
  }
  return <VersusBar {...props} />;
}
