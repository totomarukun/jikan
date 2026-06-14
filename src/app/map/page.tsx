import { redirect } from "next/navigation";

// 用具マップは「ラバーダッシュボード」(/catalog) の分布ビューに統合した。
// 旧URL・ブックマークはそちらへ恒久リダイレクトする。
export default function MapPage() {
  redirect("/catalog?view=map");
}
