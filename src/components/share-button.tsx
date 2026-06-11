"use client";

export function ShareButton({
  styleName,
  sharePct,
}: {
  styleName: string;
  sharePct: number | null;
}) {
  function share() {
    const pctLine =
      sharePct !== null ? `全プレイヤーの${sharePct}%が該当するタイプ。\n` : "";
    const text = `私の卓球用具スタイルは「${styleName}」でした！\n${pctLine}あなたも診断してみる→`;
    const url = window.location.origin;
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      "_blank",
      "noopener",
    );
  }

  return (
    <button
      onClick={share}
      className="block w-full rounded-full border border-tt-gray30/60 bg-white px-8 py-3 font-medium transition hover:bg-tt-offwhite"
    >
      Xでシェア
    </button>
  );
}
