"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/catalog", label: "用具をみる", match: ["/catalog", "/equipment", "/switch", "/map"] },
  { href: "/play", label: "答える", match: ["/play"] },
  { href: "/me", label: "マイページ", match: ["/me", "/gear", "/diagnosis"] },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 text-sm font-bold sm:gap-2">
      {LINKS.map((l) => {
        const active = l.match.some(
          (m) => pathname === m || pathname.startsWith(m + "/"),
        );
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`min-h-11 inline-flex items-center rounded-full px-3 transition ${
              active
                ? "bg-tt-charcoal text-white"
                : "text-tt-gray70 hover:bg-tt-offwhite hover:text-tt-charcoal"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
