import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPopularRubbers } from "@/lib/data";

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

  // all=1: 全件返す (クライアント側で正規化・あいまい検索する用。約137件で十分軽量)
  const all = searchParams.get("all") === "1";

  const equipments = await prisma.equipment.findMany({
    where: {
      isActive: true,
      ...(category ? { category } : {}),
      ...(rubberOnly ? { category: { startsWith: "RUBBER_" } } : {}),
      ...(bladeOnly ? { category: "BLADE" } : {}),
      ...(q && !all
        ? {
            OR: [{ name: { contains: q } }, { manufacturer: { contains: q } }],
          }
        : {}),
    },
    orderBy: [{ manufacturer: "asc" }, { name: "asc" }],
    take: all ? 1000 : 50,
    select: {
      id: true,
      category: true,
      manufacturer: true,
      name: true,
      price: true,
      hardness: true,
      bladeSubcategory: true,
      imageUrl: true,
    },
  });

  return NextResponse.json({ equipments });
}
