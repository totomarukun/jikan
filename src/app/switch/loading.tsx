// 候補追加時のサーバー集計 (体感プロファイル等) 中に「無反応」に見えないよう、
// 即時にスケルトンを表示する
export default function SwitchLoading() {
  return (
    <div className="mx-auto max-w-md py-4" aria-busy>
      <div className="h-8 w-40 animate-pulse rounded-lg bg-tt-gray30/30" />
      <div className="mt-2 h-4 w-72 animate-pulse rounded bg-tt-gray30/20" />
      <div className="mt-6 h-24 animate-pulse rounded-2xl bg-tt-gray30/20" />
      <div className="mt-4 h-12 animate-pulse rounded-xl bg-tt-gray30/20" />
      <div className="mt-6 h-64 animate-pulse rounded-2xl bg-tt-gray30/20" />
      <p className="mt-4 text-center text-xs text-tt-gray70">
        実体験データを集計しています…
      </p>
    </div>
  );
}
