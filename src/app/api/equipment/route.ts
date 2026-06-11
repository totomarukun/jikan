import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const category = searchParams.get("category");

  const equipments = await prisma.equipment.findMany({
    where: {
      isActive: true,
      ...(category ? { category } : {}),
      ...(q
        ? {
            OR: [{ name: { contains: q } }, { manufacturer: { contains: q } }],
          }
        : {}),
    },
    orderBy: [{ manufacturer: "asc" }, { name: "asc" }],
    take: 50,
    select: {
      id: true,
      category: true,
      manufacturer: true,
      name: true,
      price: true,
      hardness: true,
      bladeSubcategory: true,
    },
  });

  return NextResponse.json({ equipments });
}
