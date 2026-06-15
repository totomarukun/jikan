import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Button プリミティブ (design.md §2)。見た目はミニマル=単色・rounded-lg・影は控えめ。
// Link をボタン見た目にするときは `className={buttonVariants({ variant, size })}` を使う。
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg font-bold transition active:scale-95 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tt-green/40",
  {
    variants: {
      variant: {
        primary: "bg-tt-green text-white hover:bg-tt-deep-green",
        secondary:
          "bg-white text-tt-charcoal ring-1 ring-tt-gray30/60 hover:bg-tt-offwhite",
        ghost: "text-tt-deep-green hover:bg-tt-soft-green",
        danger: "bg-tt-coral text-white hover:bg-tt-deep-coral",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-6 text-sm",
        lg: "h-12 px-8 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
