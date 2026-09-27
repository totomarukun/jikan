// サーブ解析ラボの見出し。アプリ内ページ（/lab/serve）と単体版（scripts/serve-lab-standalone）で共有する。
export function ServeLabIntro() {
  return (
    <header>
      <p className="text-eyebrow font-bold tracking-widest text-tt-coral">LAB（試験版）</p>
      <h1 className="mt-1 text-2xl font-bold">サーブ解析ラボ</h1>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-tt-gray70">
        相手に回転を悟られにくいサーブのフォームを研究するためのシミュレーター（右利き・裏ソフト）。
        ラケットの動きから、相手のラケットに当たる瞬間の回転、相手のレシーブがどう返るか、
        見た目が同じで回転だけ違う打ち方までを物理で計算します。
      </p>
    </header>
  );
}
