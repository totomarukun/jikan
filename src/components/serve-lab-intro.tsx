// サーブ解析ラボの見出し。アプリ内ページ（/lab/serve）と単体版（scripts/serve-lab-standalone）で共有する。
export function ServeLabIntro() {
  return (
    <header>
      <p className="text-eyebrow font-bold tracking-widest text-tt-coral">LAB（試験版）</p>
      <h1 className="mt-1 text-2xl font-bold">サーブ解析ラボ</h1>
      <p className="mt-2 text-sm leading-7 text-tt-gray70">
        ラケット面の角度・スイングの速さと向き・打点・ラバーを動かすと、打球直後の回転と軌道、
        相手コートで何バウンドするかをその場で計算します。
      </p>
    </header>
  );
}
