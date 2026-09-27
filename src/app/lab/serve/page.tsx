import { ServeLab } from "@/components/serve-lab";
import { ServeLabIntro } from "@/components/serve-lab-intro";

export const metadata = {
  title: "サーブ解析ラボ",
  description: "ラケットの角度・スイング・ラバーを変えて、卓球のサーブの回転と軌道をシミュレーションする。",
};

// 用具の違いを「打球の結果」で体感するための実験ページ。
// 計算はすべてブラウザ内（src/lib/serve-sim.ts）で完結し、DB は使わない。
export default function ServeLabPage() {
  return (
    <div className="space-y-6">
      <ServeLabIntro />
      <ServeLab />
    </div>
  );
}
