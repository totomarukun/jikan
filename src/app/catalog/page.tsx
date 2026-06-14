import { prisma } from "@/lib/prisma";
import { getSessionId } from "@/lib/session";
import { getRubberScores } from "@/lib/relative-map";
import { CatalogExplorer } from "@/components/catalog-explorer";

export const metadata = { title: "ラバーを探す" };

// ラバーダッシュボード: 全用具をブラウズしつつ、軸スコア(両方使った人の比較から推定)で
// 並べ替え・比較できる「探す/見極める」入口。現用ラバーを基準に差分も読める。
export default async function CatalogPage() {
  const sessionId = await getSessionId();
  const [rows, scores, gearItems] = await Promise.all([
    prisma.equipment.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        manufacturer: true,
        category: true,
        hardness: true,
        price: true,
        imageUrl: true,
        bladeSubcategory: true,
        // 人気度の代理: 比較への登場数 + マイギア登録数
        _count: {
          select: {
            comparisonsAsA: true,
            comparisonsAsB: true,
            gearEntries: true,
          },
        },
      },
      orderBy: [{ manufacturer: "asc" }, { name: "asc" }],
    }),
    getRubberScores(),
    sessionId
      ? prisma.gearItem.findMany({
          where: {
            sessionId,
            equipment: { category: { startsWith: "RUBBER_" } },
          },
          select: { equipmentId: true, isCurrent: true },
        })
      : Promise.resolve([]),
  ]);

  const items = rows.map(({ _count, ...e }) => ({
    ...e,
    comparisons: _count.comparisonsAsA + _count.comparisonsAsB,
    popularity:
      _count.comparisonsAsA + _count.comparisonsAsB + _count.gearEntries,
    scores: scores.get(e.id) ?? {},
  }));
  const currentIds = gearItems
    .filter((g) => g.isCurrent)
    .map((g) => g.equipmentId);

  return (
    <div className="mx-auto max-w-md py-4">
      <h1 className="text-2xl font-bold">ラバーを探す</h1>
      <div className="mt-4">
        <CatalogExplorer items={items} currentIds={currentIds} />
      </div>
    </div>
  );
}
