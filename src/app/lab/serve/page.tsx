import { ServeLab } from "@/components/serve-lab";

export const metadata = {
  title: "サーブ解析ラボ",
  description: "ラケットの角度・スイング・ラバーを変えて、卓球のサーブの回転と軌道をシミュレーションする。",
};

// 用具の違いを「打球の結果」で体感するための実験ページ。
// 計算はすべてブラウザ内（src/lib/serve-sim.ts）で完結し、DB は使わない。
export default function ServeLabPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-eyebrow font-bold tracking-widest text-tt-coral">LAB（試験版）</p>
        <h1 className="mt-1 text-2xl font-bold">サーブ解析ラボ</h1>
        <p className="mt-2 text-sm leading-7 text-tt-gray70">
          ラケット面の角度・スイングの速さと向き・打点・ラバーを動かすと、打球直後の回転と軌道、
          相手コートで何バウンドするかをその場で計算します。
        </p>
      </header>
      <ServeLab />
    </div>
  );
}
