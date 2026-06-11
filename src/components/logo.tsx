import Link from "next/link";

/** 分割円ロゴ (企画書 10.2)。左: TacTap Green / 右: TacTap Coral */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="TacTap"
    >
      <path d="M32 2 A30 30 0 0 0 32 62 Z" fill="#1A8917" />
      <path d="M32 2 A30 30 0 0 1 32 62 Z" fill="#D85A30" />
      <rect x="30.5" y="2" width="3" height="60" fill="#FAFAF7" />
    </svg>
  );
}

export function LogoHorizontal() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <LogoMark size={28} />
      <span className="text-lg font-bold tracking-tight">TacTap</span>
    </Link>
  );
}
