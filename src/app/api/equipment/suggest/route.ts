import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrCreateSessionId } from "@/lib/session";

// UGC補完 (企画書 12.4): マスタにないラバーをユーザーがその場で追加できる。
// isUserSubmitted=true で記録し、スペック等は後から整備する。

const RUBBER_CATEGORIES = [
  "RUBBER_INVERTED",
  "RUBBER_PIMPLE_OUT",
  "RUBBER_PIMPLE_LONG",
  "RUBBER_STICKY",
] as const;

const suggestSchema = z.object({
  name: z.string().trim().min(1).max(40),
  manufacturer: z.string().trim().min(1).max(20),
  category: z.enum(RUBBER_CATEGORIES),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = suggestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "製品名とメーカーを確認してください" },
      { status: 400 },
    );
  }
  const { name, manufacturer, category } = parsed.data;

  // セッション必須 (無差別な自動投稿の抑止。将来はレート制限を追加)
  await getOrCreateSessionId();

  // 既存と重複していればそれを返す (大文字小文字・空白ゆらぎはMVPでは許容)
  const equipment = await prisma.equipment.upsert({
    where: { manufacturer_name: { manufacturer, name } },
    create: {
      manufacturer,
      name,
      category,
      isActive: true,
      isUserSubmitted: true,
    },
    update: {},
    select: { id: true, name: true, manufacturer: true, category: true },
  });

  return NextResponse.json({ equipment });
}
