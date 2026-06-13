import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPopularRubbers } from "@/lib/data";
import { searchEquipment, type SearchableItem } from "@/lib/search";

const SELECT = {
  id: true,
  category: true,
  manufacturer: true,
  name: true,
  price: true,
  hardness: true,
  bladeSubcategory: true,
  imageUrl: true,
} as const;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const category = searchParams.get("category");
  const rubberOnly = searchParams.get("rubberOnly") === "1";
  const bladeOnly = searchParams.get("bladeOnly") === "1";

  // よく使われているラバー (検索前のワンタップ候補)
  if (searchParams.get("popular") === "1") {
    const equipments = await getPopularRubbers(8);
    return NextResponse.json({ equipments });
  }

  // all=1: 全件返す (クライアント側で正規化・あいまい検索する用)
  const all = searchParams.get("all") === "1";

  const where = {
    isActive: true,
    ...(category ? { category } : {}),
    ...(rubberOnly ? { category: { startsWith: "RUBBER_" } } : {}),
    ...(bladeOnly ? { category: "BLADE" } : {}),
  };

  // q 検索: 素朴な部分一致でなく検索コア(正規化+日英+ローマ字+あいまい)で処理する。
  // 全候補を取得しサーバ側で searchEquipment にかける(数百件で十分軽量)。
  if (q && !all) {
    const candidates = await prisma.equipment.findMany({
      where,
      select: SELECT,
      take: 1000,
    });
    const equipments = searchEquipment(candidates as SearchableItem[], q, {
      limit: 50,
    });
    return NextResponse.json({ equipments });
  }

  const equipments = await prisma.equipment.findMany({
    where,
    orderBy: [{ manufacturer: "asc" }, { name: "asc" }],
    take: all ? 1000 : 50,
    select: SELECT,
  });

  return NextResponse.json({ equipments });
}
