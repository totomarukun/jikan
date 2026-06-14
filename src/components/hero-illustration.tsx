// トップのビジュアル: 「2本のラバーを比べて、特徴(スピード/スピン/かたさ…)が
// 相対的に分かる」というコア価値を、文字より先に1枚で伝えるためのSVGイラスト。
// 画像生成は使わず、ブランドカラーのフラットなSVGで表現する。

const GREEN = "#1a8917";
const DEEP_GREEN = "#0f6e56";
const CORAL = "#d85a30";

export function HeroCompareIllustration({
  className = "",
}: {
  className?: string;
}) {
  // 実プロダクト(用具マップ)を模したミニ画面: 使った人の比較で並んだラバーと、
  // 現用ラバーを基準にした相対スコア。「比較で特徴が分かる」を1枚で伝える。
  const rows = [
    { color: GREEN, label: 92, score: 96, you: false },
    { color: CORAL, label: 74, score: 70, you: true },
    { color: "#3b6fd4", label: 86, score: 52, you: false },
    { color: DEEP_GREEN, label: 60, score: 34, you: false },
  ];
  return (
    <svg
      viewBox="0 0 320 244"
      className={className}
      role="img"
      aria-label="用具マップで、使った人の比較から用具の特徴が相対的に分かるイメージ"
    >
      {/* アプリ画面のカード */}
      <rect
        x="14"
        y="12"
        width="292"
        height="220"
        rx="22"
        fill="#ffffff"
        stroke="#ece9e1"
        strokeWidth="2"
      />
      {/* ヘッダー: タイトル + 軸タブ */}
      <rect x="34" y="34" width="86" height="11" rx="5.5" fill="#1a1a1a" opacity="0.82" />
      <rect x="206" y="31" width="80" height="18" rx="9" fill="#e1f5ee" />
      <text
        x="246"
        y="44"
        textAnchor="middle"
        fontSize="10"
        fontWeight="700"
        fill="#0f6e56"
        fontFamily="sans-serif"
      >
        スピード
      </text>

      {rows.map((r, i) => {
        const y = 80 + i * 38;
        return (
          <g key={i}>
            {r.you && (
              <rect x="22" y={y - 16} width="276" height="32" rx="12" fill="#e1f5ee" />
            )}
            <circle cx="42" cy={y} r="11" fill={r.color} />
            <circle cx="42" cy={y} r="11" fill="url(#hdots)" opacity="0.25" />
            <rect x="62" y={y - 5} width={r.label} height="9" rx="4.5" fill="#e7e4dc" />
            {r.you && (
              <>
                <rect x={62 + r.label + 6} y={y - 8} width="32" height="15" rx="7.5" fill="#1a1a1a" />
                <text
                  x={62 + r.label + 22}
                  y={y + 3}
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="700"
                  fill="#ffffff"
                  fontFamily="sans-serif"
                >
                  現用
                </text>
              </>
            )}
            {/* 相対スコアのバー */}
            <rect x="196" y={y - 5} width="92" height="10" rx="5" fill="#ece9e1" />
            <rect
              x="196"
              y={y - 5}
              width={(92 * r.score) / 100}
              height="10"
              rx="5"
              fill={r.you ? CORAL : GREEN}
            />
          </g>
        );
      })}

      <defs>
        <pattern id="hdots" width="7" height="7" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="1.1" fill="#ffffff" />
        </pattern>
      </defs>
    </svg>
  );
}

// 3つの特徴セクション用の小アイコン (28x28 想定)。
export function IconRuler({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect
        x="4"
        y="11"
        width="24"
        height="10"
        rx="2"
        fill="#e1f5ee"
        stroke="#0f6e56"
        strokeWidth="2"
      />
      <path
        d="M10 11v4M16 11v6M22 11v4"
        stroke="#0f6e56"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconBothUsed({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="13" cy="16" r="8" fill="#faece7" stroke="#993c1d" strokeWidth="2" />
      <circle cx="21" cy="16" r="8" fill="#d85a30" opacity="0.9" />
      <path
        d="M15 16.5l2.2 2.2 4-4.4"
        stroke="#ffffff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function IconSplit({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="4" y="13" width="11" height="6" rx="3" fill="#1a8917" />
      <rect x="17" y="13" width="11" height="6" rx="3" fill="#d85a30" />
      <path d="M16 8v16" stroke="#b4b2a9" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 3" />
    </svg>
  );
}

// 使い方ステップ用の小アイコン (相対位置を見る / 基準を置く / 答えて育てる)
export function IconMap({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="5" y="9" width="14" height="3.5" rx="1.75" fill="#1a8917" />
      <rect x="5" y="15" width="22" height="3.5" rx="1.75" fill="#bfe9d8" />
      <rect x="5" y="21" width="9" height="3.5" rx="1.75" fill="#0f6e56" />
    </svg>
  );
}

export function IconTarget({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="16" cy="16" r="11" fill="none" stroke="#0f6e56" strokeWidth="2.4" />
      <circle cx="16" cy="16" r="5.5" fill="none" stroke="#1a8917" strokeWidth="2.4" />
      <circle cx="16" cy="16" r="1.8" fill="#d85a30" />
    </svg>
  );
}

export function IconNote({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="6" y="5" width="16" height="22" rx="3" fill="#e1f5ee" stroke="#0f6e56" strokeWidth="2" />
      <path d="M10 12h8M10 17h8M10 22h5" stroke="#1a8917" strokeWidth="2" strokeLinecap="round" />
      <path d="M20 24l3 3 5-6" stroke="#d85a30" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
