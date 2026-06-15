import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Badge プリミティブ (design.md §2)。現用/基準/実体験/データ少なめ などの状態ラベル。
const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold",
  {
    variants: {
      tone: {
        current: "bg-tt-charcoal text-white", // いま使用中
        base: "bg-tt-deep-green text-white", // 基準
        experience: "bg-tt-soft-green text-tt-deep-green", // 実体験
        // データ少なめ・確信度低 (色を出さず主張しない)
        muted: "bg-tt-gray30/30 text-tt-gray70",
        neutral: "bg-white text-tt-gray70 ring-1 ring-tt-gray30/50",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
