import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

// EmptyState (design.md §2): データが無い/薄いことを正直に見せ、次の一手へ導く。
// 破線枠 + 説明 + (任意の)アクション。誇張せず「まだ無い」を堂々と。
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  action?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border-2 border-dashed border-tt-gray30/50 p-8 text-center",
        className,
      )}
    >
      <p className="text-sm font-bold text-tt-charcoal">{title}</p>
      {description && (
        <p className="mt-1.5 text-sm leading-6 text-tt-gray70">{description}</p>
      )}
      {action && (
        <Link
          href={action.href}
          className={cn(buttonVariants({ size: "sm" }), "mt-4")}
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
