import { prisma } from "./prisma";

// 初心者の「はじめの基準(参考)」= コールドスタートでも相対地図に入るための"原点候補"。
// planning-anchor 判断(サイクル21 / M8)に従う:
// - これは「おすすめ/推薦」ではなく、相対比較を読み解くための起点(原点)の供給。
// - 公称スペックの数値・軸別順位は出さない(各社基準・他社比較不可=企画書B2)。
//   選定は「一般に"扱いやすい"と言われる定番・手頃な裏ソフト」という定評ベースの
//   キュレーション(複数・非断定)。1枚に断定せず幅を持たせる。
// - 表示側で「参考」と明示し、実コミュニティ集計とは分離する。
//
// 定番リストは広く共有された定評(複数の独立ソースが一致)に基づく入口の例。
// DB に存在するものだけを、この順序の優先で返す。
const ENTRY_ANCHOR_NAMES = [
  "マークV",
  "ロゼナ",
  "ファクティブ",
  "ラクザ7ソフト",
  "スレイバー",
  "ヴェンタスレギュラー",
  "フレクストラ",
] as const;

export interface EntryAnchor {
  id: string;
  name: string;
  manufacturer: string;
  imageUrl: string | null;
  price: number | null;
}

export async function getEntryPointAnchors(limit = 3): Promise<EntryAnchor[]> {
  const rows = await prisma.equipment.findMany({
    where: {
      isActive: true,
      category: "RUBBER_INVERTED",
      name: { in: [...ENTRY_ANCHOR_NAMES] },
    },
    select: {
      id: true,
      name: true,
      manufacturer: true,
      imageUrl: true,
      price: true,
    },
  });
  // 定評リストの順序を保つ(価格や公称スペックで並べ替えない=数値順位を出さない)
  const order = new Map<string, number>(
    ENTRY_ANCHOR_NAMES.map((n, i) => [n, i]),
  );
  rows.sort(
    (a, b) => (order.get(a.name) ?? 99) - (order.get(b.name) ?? 99),
  );
  return rows.slice(0, limit);
}
