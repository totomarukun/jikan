"use client";

import { useState } from "react";

// 汎用シェア: まず Web Share API (モバイルのネイティブ共有)、なければ X 投稿画面。
// 共有URLには動的OGカード(opengraph-image)が付く。
export function ShareLinkButton({
  text,
  label = "シェアする",
}: {
  text: string;
  label?: string;
}) {
  const [opened, setOpened] = useState(false);

  async function onClick() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text, url });
        return;
      } catch {
        return; // キャンセル等
      }
    }
    const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      text,
    )}&url=${encodeURIComponent(url)}`;
    if (typeof window !== "undefined") {
      window.open(intent, "_blank", "noopener,noreferrer");
      setOpened(true);
      setTimeout(() => setOpened(false), 2000);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-full border border-tt-gray30/50 bg-white py-3 text-center text-sm font-bold transition hover:bg-tt-offwhite active:scale-[0.98]"
    >
      {opened ? "Xを開きました" : label}
    </button>
  );
}
