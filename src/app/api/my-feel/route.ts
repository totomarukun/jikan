import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionId } from "@/lib/session";

// 自分の体感メモ: 自分が答えたペア×軸の最新回答を返す。
// 「回答が自分の資産になる」体験の基盤 (12問答えても何も残らない問題への回答)。
export async function GET() {
  const sessionId = await getSessionId();
  if (!sessionId) return NextResponse.json({ entries: [] });

  const comparisons = await prisma.comparison.findMany({
    where: { sessionId },
    include: {
      optionA: { select: { id: true, name: true } },
      optionB: { select: { id: true, name: true } },
    },
    orderBy: { answeredAt: "desc" },
    take: 200,
  });

  // ペアごとに軸別の最新回答をまとめる
  interface Entry {
    aId: string;
    bId: string;
    nameA: string;
    nameB: string;
    isGearBased: boolean;
    axes: Record<string, string>; // axis -> "A" | "B" | "SAME" | "UNKNOWN"
  }
  const map = new Map<string, Entry>();
  for (const c of comparisons) {
    const flip = c.optionAEquipmentId > c.optionBEquipmentId;
    const key = [c.optionAEquipmentId, c.optionBEquipmentId].sort().join("|");
    const entry =
      map.get(key) ??
      ({
        aId: flip ? c.optionBEquipmentId : c.optionAEquipmentId,
        bId: flip ? c.optionAEquipmentId : c.optionBEquipmentId,
        nameA: flip ? c.optionB.name : c.optionA.name,
        nameB: flip ? c.optionA.name : c.optionB.name,
        isGearBased: false,
        axes: {},
      } satisfies Entry);

    const norm = (w: string | null) =>
      w == null ? null : flip ? (w === "A" ? "B" : w === "B" ? "A" : w) : w;

    const axisPairs: Array<[string, string | null]> = [
      ["overall", norm(c.winnerOverall)],
      ["hardness", norm(c.winnerHardness)],
      ["speed", norm(c.winnerSpeed)],
      ["spin", norm(c.winnerSpin)],
      ["ballHold", norm(c.winnerBallHold)],
    ];
    for (const [axis, winner] of axisPairs) {
      // 新しい順に走査しているため、既にあれば (=より新しい回答) 保持
      if (winner && !(axis in entry.axes)) entry.axes[axis] = winner;
    }
    if (c.hasActualExperience === "BOTH") entry.isGearBased = true;
    map.set(key, entry);
  }

  return NextResponse.json({ entries: [...map.values()] });
}
