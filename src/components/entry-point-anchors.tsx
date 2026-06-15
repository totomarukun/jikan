import Link from "next/link";
import { EquipmentVisual } from "@/components/equipment-visual";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EntryAnchor } from "@/lib/entry-anchors";

// 「はじめの基準(参考)」= コールドスタート/基準ゼロのユーザーが相対地図に入るための原点候補。
// planning-anchor 判断(M8)に従う:
// - 「おすすめ/推薦」ではなく「相対比較を読み解くための起点(原点)」。提示後の主動作は
//   「これを基準に用具マップを見る」。1枚を勧めて終わらせない。
// - 「べき/最適/正解」を使わず、主語は常にユーザー。「一般に言われる特徴(参考)」と明示。
// - 実コミュニティ集計とは視覚的に分離(参考バッジ・控えめな面)。数値順位は出さない。
export function EntryPointAnchors({
  anchors,
  className,
}: {
  anchors: EntryAnchor[];
  className?: string;
}) {
  if (anchors.length === 0) return null;
  return (
    <Card surface="muted" pad="lg" className={cn(className)}>
      <div className="flex items-center gap-2">
        <h2 className="font-bold">はじめの基準</h2>
        <Badge tone="muted">参考</Badge>
      </div>
      <p className="mt-1 text-sm leading-6 text-tt-gray70">
        最初の基準が無いと用具マップは読みにくいので、よく「扱いやすい」と言われる
        定番の裏ソフトを参考に挙げます。これを起点にすると、ほかの用具との違いが見えてきます。
      </p>
      <ul className="mt-3 space-y-2">
        {anchors.map((a) => (
          <li
            key={a.id}
            className="rounded-lg bg-white p-3 ring-1 ring-tt-gray30/40"
          >
            <div className="flex items-center gap-3">
              <EquipmentVisual
                category="RUBBER_INVERTED"
                manufacturer={a.manufacturer}
                imageUrl={a.imageUrl}
                name={a.name}
                size={36}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{a.name}</p>
                <p className="text-xs text-tt-gray70">
                  {a.manufacturer}
                  {a.price != null && ` ・ ¥${a.price.toLocaleString()}`}
                </p>
              </div>
            </div>
            <Link
              href={`/catalog?base=${a.id}`}
              className={cn(
                buttonVariants({ variant: "secondary", size: "sm" }),
                "mt-2 w-full",
              )}
            >
              これを基準に用具マップを見る →
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] leading-5 text-tt-gray70">
        ※おすすめの断定ではありません。一般に言われる特徴をもとにした入口の例です。
        使った人の比較が集まると、ここが実データで置き換わっていきます。
      </p>
    </Card>
  );
}
