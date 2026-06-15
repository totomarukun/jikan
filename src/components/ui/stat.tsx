import { cn } from "@/lib/utils";

// Stat / Metric (design.md §2)。数値は等幅(font-mono)で前面に。データ前面の主役。
export function Stat({
  label,
  value,
  tone = "green",
  className,
}: {
  label: string;
  value: string | number;
  tone?: "green" | "coral" | "charcoal";
  className?: string;
}) {
  const valueColor =
    tone === "coral"
      ? "text-tt-deep-coral"
      : tone === "charcoal"
        ? "text-tt-charcoal"
        : "text-tt-deep-green";
  return (
    <div
      className={cn(
        "rounded-lg bg-white p-3 ring-1 ring-tt-gray30/40",
        className,
      )}
    >
      <dt className="text-xs text-tt-gray70">{label}</dt>
      <dd className={cn("font-mono text-2xl font-bold", valueColor)}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </dd>
    </div>
  );
}
