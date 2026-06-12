/* eslint-disable @next/next/no-img-element */
// 全用具のプロダクトビジュアル。
// 実写真 (imageUrl) があればそれを表示し、なければカテゴリ・メーカーから
// 決定的に生成するオリジナルSVGイラストを表示する。
// メーカー写真の無断利用 (スクレイピング) は企画書 12.4 の方針どおり行わない。
// 実写真は将来、楽天/Amazon 公式アフィリエイトAPI経由で imageUrl に格納する。

interface VisualProps {
  category: string;
  manufacturer: string;
  bladeSubcategory?: string | null;
  imageUrl?: string | null;
  name?: string;
  size?: number;
  className?: string;
}

// メーカーの雰囲気に寄せたアクセント色 (ロゴ・商標は使わない)
const MAKER_COLORS: Record<string, string> = {
  バタフライ: "#1a1a1a",
  ニッタク: "#1f3a93",
  ヤサカ: "#0e7a3a",
  ヴィクタス: "#0a4d8c",
  ティバー: "#b3261e",
  ドニック: "#0f5cad",
  アンドロ: "#0d8a8a",
  XIOM: "#d97706",
  スティガ: "#15489c",
  JOOLA: "#c2185b",
  紅双喜: "#b3261e",
  ミズノ: "#15246b",
  アームストロング: "#475569",
};

const FALLBACK_COLORS = [
  "#0f6e56",
  "#993c1d",
  "#1f3a93",
  "#6d28d9",
  "#0e7490",
  "#a16207",
];

function makerColor(manufacturer: string): string {
  if (MAKER_COLORS[manufacturer]) return MAKER_COLORS[manufacturer];
  let h = 0;
  for (const ch of manufacturer) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return FALLBACK_COLORS[h % FALLBACK_COLORS.length];
}

export function EquipmentVisual({
  category,
  manufacturer,
  bladeSubcategory,
  imageUrl,
  name,
  size = 64,
  className = "",
}: VisualProps) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name ?? ""}
        width={size}
        height={size}
        className={`rounded-xl object-cover ${className}`}
      />
    );
  }
  const color = makerColor(manufacturer);
  return (
    <span
      className={`inline-block shrink-0 ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {category === "BLADE" ? (
        <BladeSvg color={color} subcategory={bladeSubcategory ?? null} />
      ) : (
        <RubberSvg color={color} category={category} />
      )}
    </span>
  );
}

// ラバー: シート + スポンジ断面。カテゴリで表面の質感を変える
function RubberSvg({ color, category }: { color: string; category: string }) {
  const pimples =
    category === "RUBBER_PIMPLE_OUT" || category === "RUBBER_PIMPLE_LONG";
  const long = category === "RUBBER_PIMPLE_LONG";
  const sticky = category === "RUBBER_STICKY";
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <defs>
        <linearGradient id={`sheet-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.92" />
          <stop offset="100%" stopColor={color} stopOpacity="0.72" />
        </linearGradient>
      </defs>
      {/* スポンジ */}
      <rect x="8" y="46" width="48" height="8" rx="3" fill="#F2C9A8" />
      <rect x="8" y="46" width="48" height="2.5" rx="1" fill="#E2A878" />
      {/* シート */}
      <rect
        x="8"
        y="10"
        width="48"
        height="38"
        rx="7"
        fill={`url(#sheet-${color})`}
      />
      {/* 質感 */}
      {pimples &&
        Array.from({ length: 4 }).map((_, row) =>
          Array.from({ length: 6 }).map((_, col) => (
            <circle
              key={`${row}-${col}`}
              cx={15 + col * 7}
              cy={17 + row * 7.5}
              r={long ? 1.3 : 2.1}
              fill="#ffffff"
              opacity={0.5}
            />
          )),
        )}
      {!pimples && sticky && (
        <path
          d="M14 14 L34 14 L20 42 L12 42 Z"
          fill="#ffffff"
          opacity="0.28"
        />
      )}
      {!pimples && !sticky && (
        <rect x="12" y="14" width="40" height="6" rx="3" fill="#fff" opacity="0.18" />
      )}
    </svg>
  );
}

// ラケット: ブレード + グリップ。系統で輪郭を変える
function BladeSvg({
  color,
  subcategory,
}: {
  color: string;
  subcategory: string | null;
}) {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <defs>
        <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#E4BC8B" />
          <stop offset="100%" stopColor="#C28E55" />
        </linearGradient>
      </defs>
      {/* グリップ */}
      <rect
        x="28"
        y="40"
        width="8"
        height="20"
        rx="3"
        fill={color}
        transform="rotate(0 32 50)"
      />
      {/* ブレード面 */}
      <ellipse cx="32" cy="26" rx="21" ry="23" fill="url(#wood)" />
      {/* 木目 */}
      <path d="M18 16 Q32 22 46 14" stroke="#A9763F" strokeWidth="1.2" fill="none" opacity="0.6" />
      <path d="M16 26 Q32 32 48 24" stroke="#A9763F" strokeWidth="1.2" fill="none" opacity="0.6" />
      <path d="M18 36 Q32 42 46 34" stroke="#A9763F" strokeWidth="1.2" fill="none" opacity="0.6" />
      {/* 系統: アウター=外周リング / インナー=内側リング */}
      {subcategory === "OUTER_CARBON" && (
        <ellipse cx="32" cy="26" rx="21" ry="23" fill="none" stroke={color} strokeWidth="3" />
      )}
      {subcategory === "INNER_CARBON" && (
        <ellipse
          cx="32"
          cy="26"
          rx="13"
          ry="15"
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeDasharray="4 3"
        />
      )}
    </svg>
  );
}
