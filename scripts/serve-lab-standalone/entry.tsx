// サーブ解析ラボの単体版エントリ。アプリと同じコンポーネントをそのまま使う。
import { createRoot } from "react-dom/client";
import { ServeLab } from "@/components/serve-lab";
import { ServeLabIntro } from "@/components/serve-lab-intro";

function App() {
  return (
    <main className="mx-auto w-full max-w-[1440px] space-y-4 px-4 py-4">
      <ServeLabIntro />
      <ServeLab />
      <p className="text-xs text-tt-gray70">ガチスペ — スペックの裏まで、ガチで比較。</p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
