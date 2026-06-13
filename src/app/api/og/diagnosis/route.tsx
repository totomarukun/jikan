import { ImageResponse } from "next/og";

// 診断結果カードの動的OG画像 (SNS流入装置)。シェアURLのクエリから生成するため
// クローラ(セッション無し)でもカードが出る。リサーチで#1のシェア資産=診断結果カード。
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = (searchParams.get("type") ?? "あなたの用具スタイル").slice(0, 40);
  const pct = searchParams.get("pct");

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
        </div>

        <div style={{ display: "flex", marginTop: "44px", fontSize: "32px", color: "#5f5e5a" }}>
          私の卓球用具スタイルは
        </div>
        <div
          style={{
            display: "flex",
            marginTop: "8px",
            fontSize: "92px",
            fontWeight: 800,
            color: "#0f6e56",
            lineHeight: 1.05,
          }}
        >
          {type}
        </div>

        {pct && (
          <div
            style={{
              display: "flex",
              marginTop: "28px",
              fontSize: "34px",
              color: "#1a1a1a",
            }}
          >
            全プレイヤーの {pct}% が該当
          </div>
        )}

        <div
          style={{
            display: "flex",
            marginTop: "auto",
            fontSize: "28px",
            color: "#5f5e5a",
          }}
        >
          AB比較から、あなたに合う用具を相対的に。 #TacTap
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
