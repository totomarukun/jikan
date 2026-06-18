import Link from "next/link";

const RED = "#E5132B";
const INK = "#0E0E10";
const BLUE = "#0B6FB8";

/**
 * ロゴマーク: 赤/黒のスプリット角丸タイル（赤=ガチ/本音・黒=スペ/データ、
 * 卓球ラバーの公式色）＋白いピンポン玉。小サイズでも卓球と分かる。
 */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="ガチスペ"
    >
      <defs>
        <clipPath id="gs-rounded">
          <rect x="2" y="2" width="60" height="60" rx="15" />
        </clipPath>
      </defs>
      <g clipPath="url(#gs-rounded)">
        <rect x="2" y="2" width="30" height="60" fill={RED} />
        <rect x="32" y="2" width="30" height="60" fill={INK} />
      </g>
      {/* ピンポン玉 */}
      <circle cx="32" cy="30" r="11" fill="#FFFFFF" stroke={INK} strokeWidth="2.4" />
      <line x1="25" y1="30" x2="39" y2="30" stroke="rgba(14,14,16,0.25)" strokeWidth="1.6" />
    </svg>
  );
}

/**
 * 確定ワードマーク「ガチスペ」。
 * 「ガ」の濁点=2本の点（前傾）、「ペ」の半濁点=白いピンポン玉＋インクリング＋シーム、
 * その上に青いバウンド軌道で「卓球の打球」を示す。ガチ=赤 / スペ=黒（反転時は白）。
 * size はおおよその文字高(px)。各装飾は em 比で追従する。
 */
export function Wordmark({
  size = 22,
  onDark = false,
}: {
  size?: number;
  onDark?: boolean;
}) {
  const spe = onDark ? "#FFFFFF" : INK;
  const ballRing = onDark ? "#FFFFFF" : INK;
  const kana = (ch: string, color: string) => (
    <span style={{ color, display: "inline-block" }}>{ch}</span>
  );
  return (
    <span
      aria-label="ガチスペ"
      role="img"
      style={{
        display: "inline-flex",
        alignItems: "flex-start",
        fontSize: `${size}px`,
        fontWeight: 800,
        lineHeight: 1,
        letterSpacing: "-0.02em",
        transform: "skewX(-4deg)",
        whiteSpace: "nowrap",
      }}
    >
      {/* ガ = カ + 濁点(2本の点) */}
      <span style={{ position: "relative", display: "inline-flex" }}>
        {kana("カ", RED)}
        <span
          style={{
            position: "absolute",
            top: "-0.02em",
            right: "-0.13em",
            display: "inline-flex",
            gap: "0.05em",
          }}
        >
          <span style={{ width: "0.06em", height: "0.2em", background: RED, borderRadius: "0.03em", transform: "skewX(-16deg)", display: "inline-block" }} />
          <span style={{ width: "0.06em", height: "0.2em", background: RED, borderRadius: "0.03em", transform: "skewX(-16deg)", display: "inline-block" }} />
        </span>
      </span>
      {kana("チ", RED)}
      {kana("ス", spe)}
      {/* ペ = ヘ + 白球(半濁点) + バウンド軌道 */}
      <span style={{ position: "relative", display: "inline-flex" }}>
        {kana("ヘ", spe)}
        {/* バウンド軌道 */}
        <span style={{ position: "absolute", top: "-0.36em", right: "-0.04em", display: "inline-flex" }}>
          <svg width={`${size * 0.92}px`} height={`${size * 0.42}px`} viewBox="0 0 100 46">
            <path
              d="M3,8 Q22,52 41,16 Q56,-6 72,20"
              fill="none"
              stroke={BLUE}
              strokeWidth="3.4"
              strokeLinecap="round"
              strokeDasharray="1.5 9"
            />
          </svg>
        </span>
        {/* 白球 */}
        <span
          style={{
            position: "absolute",
            top: "-0.04em",
            right: "-0.05em",
            width: "0.26em",
            height: "0.26em",
            borderRadius: "9999px",
            background: "#FFFFFF",
            border: `0.02em solid ${ballRing}`,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ width: "0.16em", height: "0.012em", minHeight: "1px", background: "rgba(14,14,16,0.25)", borderRadius: "9999px", display: "inline-block" }} />
        </span>
      </span>
    </span>
  );
}

/** ヘッダー等の横組みロックアップ（マーク＋ワードマーク、ホームへのリンク） */
export function LogoHorizontal({ onDark = false }: { onDark?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label="ガチスペ ホーム">
      <LogoMark size={26} />
      <Wordmark size={19} onDark={onDark} />
    </Link>
  );
}
