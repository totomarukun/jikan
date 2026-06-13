import { prisma } from "@/lib/prisma";
import { CatalogExplorer } from "@/components/catalog-explorer";

export const metadata = { title: "用具カタログ" };

// 用具カタログ: 全用具を比較データ無しでもブラウズできる「探す」入口。
export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const initialStyle =
    typeof sp.style === "string" ? sp.style : null;
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
    comparisons: _count.comparisonsAsA + _count.comparisonsAsB,
    popularity:
      _count.comparisonsAsA + _count.comparisonsAsB + _count.gearEntries,
  }));

  return (
    <div className="mx-auto max-w-md py-4">
      <h1 className="text-2xl font-bold">用具カタログ</h1>
      <p className="mt-1 text-sm leading-6 text-tt-gray70">
        {items.length}件から探せます。名前で検索（ひらがな・英語・ローマ字OK）、
        種類・メーカー・価格・硬さで絞り込み。
      </p>
      <div className="mt-4">
        <CatalogExplorer items={items} initialStyle={initialStyle} />
      </div>
    </div>
  );
}
