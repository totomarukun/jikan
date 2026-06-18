import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { getEquipmentAxisPositions } from "@/lib/relative-map";
import { isRubberCategory } from "@/lib/types";

// SNSシェア用の動的OGカード (用具カード): シェアされたとき、用具名と
// 「相対マップ上の位置」が1枚で伝わる。卓球コミュニティの「用具を見せる/参照する」
// 文化に乗せる狙い。flexbox のみ・Node ランタイム(Prisma利用)。

export const alt = "ガチスペ 用具カード";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const AXIS_LABEL: Record<string, string> = {
  speed: "スピード",
  spin: "スピン",
  hardness: "かたさ",
  arc: "弧線",
  attackEase: "攻撃のしやすさ",
  defenseEase: "守備のしやすさ",
  tackiness: "粘着",
};

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const equipment = await prisma.equipment.findUnique({
    where: { id },
    select: { name: true, manufacturer: true, category: true },
  });

  const positions =
    equipment && isRubberCategory(equipment.category)
      ? (await getEquipmentAxisPositions(id))
          .filter((p) => p.axis !== "overall")
          .slice(0, 4)
      : [];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #fdecee 0%, #ffffff 55%, #e7f1f8 100%)",
          padding: "64px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "12px",
              background: "#0e0e10",
            }}
          />
          <div style={{ fontSize: "32px", fontWeight: 700, color: "#0e0e10" }}>
            ガチスペ
          </div>
          <div style={{ fontSize: "24px", color: "#5f5e5a" }}>
            用具マップ上の位置
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: "36px" }}>
          <div style={{ fontSize: "30px", color: "#5f5e5a" }}>
            {equipment?.manufacturer ?? ""}
          </div>
          <div
            style={{
              fontSize: "76px",
              fontWeight: 800,
              color: "#1a1a1a",
              lineHeight: 1.1,
            }}
          >
            {equipment?.name ?? "用具"}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "18px",
            marginTop: "40px",
          }}
        >
          {positions.length > 0 ? (
            positions.map((p) => (
              <div
                key={p.axis}
                style={{ display: "flex", alignItems: "center", gap: "20px" }}
              >
                <div
                  style={{
                    width: "200px",
                    fontSize: "30px",
                    fontWeight: 700,
                    color: "#1a1a1a",
                  }}
                >
                  {AXIS_LABEL[p.axis] ?? p.axis}
                </div>
                <div
                  style={{
                    display: "flex",
                    width: "620px",
                    height: "28px",
                    borderRadius: "14px",
                    background: "#b4b2a9",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.max(4, Math.round(p.score))}%`,
                      height: "28px",
                      borderRadius: "14px",
                      background: "#e5132b",
                    }}
                  />
                </div>
              </div>
            ))
          ) : (
            <div style={{ fontSize: "34px", color: "#5f5e5a" }}>
              みんなのA/B比較を1枚の相対地図に。
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            marginTop: "auto",
            fontSize: "26px",
            color: "#5f5e5a",
          }}
        >
          両方使った人の比較から、用具の特徴を相対的に。
        </div>
      </div>
    ),
    { ...size },
  );
}
