import { ImageResponse } from "next/og";

// ギアカード(WITB=用具構成晒し)の動的OG画像 (SNS流入装置)。
// 卓球の「使用用具を見せる/参照する」文化に乗る。クエリ(blade/fh/bh)から生成。
export const dynamic = "force-dynamic";

function row(label: string, value: string | null) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "20px" }}>
      <div
        style={{
          width: "120px",
          fontSize: "30px",
          fontWeight: 700,
          color: "#0f6e56",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: "44px", fontWeight: 800, color: "#1a1a1a" }}>
        {value || "—"}
      </div>
    </div>
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clip = (s: string | null) => (s ? s.slice(0, 30) : null);
  const blade = clip(searchParams.get("blade"));
  const fh = clip(searchParams.get("fh"));
  const bh = clip(searchParams.get("bh"));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background:
            "linear-gradient(135deg, #e1f5ee 0%, #fafaf7 55%, #faece7 100%)",
          padding: "72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "12px",
              background: "#0f6e56",
            }}
          />
          <div style={{ fontSize: "32px", fontWeight: 700, color: "#0f6e56" }}>
            TacTap
          </div>
          <div style={{ fontSize: "26px", color: "#5f5e5a" }}>私のギア構成</div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "26px",
            marginTop: "52px",
          }}
        >
          {row("ラケット", blade)}
          {row("フォア", fh)}
          {row("バック", bh)}
        </div>

        <div
          style={{
            display: "flex",
            marginTop: "auto",
            fontSize: "26px",
            color: "#5f5e5a",
          }}
        >
          用具の特徴を相対的に。あなたのギアも登録しよう。 #TacTap
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
