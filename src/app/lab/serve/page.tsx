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
    // 横画面ではシミュレーション（左）と操作（右）を並べるため、サイト共通の狭い幅から広げる
    <div className="relative left-1/2 w-screen max-w-none -translate-x-1/2 px-4">
      <div className="mx-auto max-w-[1440px] space-y-4">
        <ServeLabIntro />
        <ServeLab />
      </div>
    </div>
  );
}
