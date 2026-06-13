import { prisma } from "@/lib/prisma";
import { CatalogExplorer } from "@/components/catalog-explorer";

export const metadata = { title: "用具カタログ" };

// 用具カタログ: 全用具を比較データ無しでもブラウズできる「探す」入口。
export default async function CatalogPage() {
  const rows = await prisma.equipment.findMany({
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
  });
  const items = rows.map(({ _count, ...e }) => ({
    ...e,
    popularity:
      _count.comparisonsAsA + _count.comparisonsAsB + _count.gearEntries,
  }));

  return (
    <div className="mx-auto max-w-md py-4">
      <h1 className="text-2xl font-bold">用具カタログ</h1>
      <p className="mt-1 text-sm leading-6 text-tt-gray70">
        収録{items.length}件。種類・メーカー・価格・硬度で絞り込み、用具名で検索（日本語・
        英語・ローマ字OK）。気になる用具の詳細・相対位置・両方使った人の声へ。
      </p>
      <div className="mt-4">
        <CatalogExplorer items={items} />
      </div>
    </div>
  );
}
