import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Card プリミティブ (design.md §1.5 / §2)。既定 elevation=0 (影でなく1pxボーダー)。
const cardVariants = cva("rounded-xl", {
  variants: {
    surface: {
      // 既定: 白地 + 線のみ
      base: "bg-white ring-1 ring-tt-gray30/40",
      // 重要カード: 線 + ごく薄い影
      raised: "bg-white ring-1 ring-tt-gray30/40 shadow-sm",
      // ネスト面 / 控えめなブロック
      muted: "bg-tt-offwhite ring-1 ring-tt-gray30/30",
      // 肯定・自分基準の薄背景
      accent: "bg-tt-soft-green ring-1 ring-tt-green/15",
    },
    pad: {
      none: "",
      sm: "p-3",
      md: "p-4",
      lg: "p-5",
    },
  },
  defaultVariants: { surface: "base", pad: "md" },
});

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export function Card({ className, surface, pad, ...props }: CardProps) {
  return (
    <div className={cn(cardVariants({ surface, pad }), className)} {...props} />
  );
}
