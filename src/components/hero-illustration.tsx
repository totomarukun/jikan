// トップのビジュアル: 「2本のラバーを比べて、特徴(スピード/スピン/かたさ…)が
// 相対的に分かる」というコア価値を、文字より先に1枚で伝えるためのSVGイラスト。
// 画像生成は使わず、ブランドカラーのフラットなSVGで表現する。

const GREEN = "#1a8917";
const DEEP_GREEN = "#0f6e56";
const CORAL = "#d85a30";
const GRAY = "#b4b2a9";

export function HeroCompareIllustration({
  className = "",
}: {
  className?: string;
}) {
  // 3本の比較バー: 緑の帯=みんなの比較で決まった位置、珊瑚の丸=もう片方の用具
  const bars = [
    { y: 122, green: 168, coral: 232 },
    { y: 150, green: 96, coral: 150 },
    { y: 178, green: 210, coral: 120 },
  ];
  return (
    <svg
      viewBox="0 0 320 210"
      className={className}
      role="img"
      aria-label="2本のラバーを比較して特徴を相対的に見るイメージ"
    >
      {/* 左ラバー (緑) */}
      <g>
        <rect x="86" y="78" width="8" height="26" rx="4" fill={GRAY} />
        <circle cx="90" cy="50" r="34" fill="#e1f5ee" />
        <circle cx="90" cy="50" r="26" fill={GREEN} />
        <circle cx="90" cy="50" r="26" fill="url(#dots)" opacity="0.25" />
      </g>
      {/* 右ラバー (珊瑚) */}
      <g>
        <rect x="226" y="78" width="8" height="26" rx="4" fill={GRAY} />
        <circle cx="230" cy="50" r="34" fill="#faece7" />
        <circle cx="230" cy="50" r="26" fill={CORAL} />
        <circle cx="230" cy="50" r="26" fill="url(#dots)" opacity="0.25" />
      </g>
      {/* VS */}
      <circle cx="160" cy="50" r="16" fill="#1a1a1a" />
      <text
        x="160"
        y="55"
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        fill="#ffffff"
        fontFamily="sans-serif"
      >
        VS
      </text>

      {/* 比較バー */}
      {bars.map((b, i) => (
        <g key={i}>
          <rect x="40" y={b.y} width="240" height="10" rx="5" fill="#ece9e1" />
          <rect
            x="40"
            y={b.y}
            width={b.green}
            height="10"
            rx="5"
            fill={i === 1 ? DEEP_GREEN : GREEN}
          />
          <circle cx={40 + b.coral} cy={b.y + 5} r="8" fill={CORAL} />
          <circle cx={40 + b.coral} cy={b.y + 5} r="8" fill="#ffffff" opacity="0.15" />
        </g>
      ))}

      <defs>
        <pattern
          id="dots"
          width="7"
          height="7"
          patternUnits="userSpaceOnUse"
        >
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
