import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, PRESETS, serveInsights, simulateServe } from "../serve-sim";

describe("simulateServe", () => {
  it("全プリセットがルール上入るサーブになる", () => {
    for (const preset of PRESETS) {
      const r = simulateServe(preset.params);
      expect(r.legal, preset.label).toBe(true);
    }
  });

  it("ラケット面を上に開いて前に振ると下回転になる", () => {
    const r = simulateServe(DEFAULT_PARAMS);
    expect(r.contact.spin.topBack).toBeLessThan(-10);
    expect(r.contact.spin.label).toContain("下");
  });

  it("面をかぶせて振り上げると上回転になる", () => {
    const r = simulateServe(PRESETS.find((p) => p.id === "topspin-long")!.params);
    expect(r.contact.spin.topBack).toBeGreaterThan(10);
    expect(r.verdict).toBe("long");
  });

  it("スイングを速くすると回転量が増える", () => {
    const slow = simulateServe({ ...DEFAULT_PARAMS, swingSpeed: 4 });
    const fast = simulateServe({ ...DEFAULT_PARAMS, swingSpeed: 8 });
    expect(fast.contact.spin.total).toBeGreaterThan(slow.contact.spin.total);
  });

  it("摩擦の小さいラバーは回転がかかりにくい", () => {
    const tension = simulateServe({ ...DEFAULT_PARAMS, rubber: "tension" });
    const pips = simulateServe({ ...DEFAULT_PARAMS, rubber: "longPips" });
    expect(pips.contact.spin.total).toBeLessThan(tension.contact.spin.total);
    expect(pips.contact.slipped).toBe(true);
  });

  it("横回転の向きに合わせて飛行中に進路が曲がる", () => {
    // 空気抵抗は進行方向に沿うので、水平面での向きを変えるのは横回転（マグヌス力）だけ
    const heading = (r: ReturnType<typeof simulateServe>) => {
      const i = r.points.findIndex((pt) => pt.t > r.contactTime);
      const a = r.points[i];
      const b = r.points[i + 20];
      const c = r.points[i + 21];
      const early = Math.atan2(r.points[i + 1].p.y - a.p.y, r.points[i + 1].p.x - a.p.x);
      const late = Math.atan2(c.p.y - b.p.y, c.p.x - b.p.x);
      return late - early;
    };
    const left = simulateServe({ ...DEFAULT_PARAMS, faceTilt: 0, faceYaw: 45, swingYaw: -15, swingSpeed: 5 });
    const right = simulateServe({ ...DEFAULT_PARAMS, faceTilt: 0, faceYaw: -45, swingYaw: 15, swingSpeed: 5 });
    expect(left.contact.spin.side).toBeGreaterThan(5);
    expect(right.contact.spin.side).toBeLessThan(-5);
    expect(heading(left)).toBeGreaterThan(0);
    expect(heading(right)).toBeLessThan(0);
  });

  it("面とスイングが離れる向きだと空振りになる", () => {
    const r = simulateServe({ ...DEFAULT_PARAMS, faceTilt: -80, swingPitch: 60 });
    expect(r.verdict).toBe("whiff");
    expect(r.legal).toBe(false);
  });

  it("トスが16cm未満だと警告しルール違反扱いにする", () => {
    const r = simulateServe({ ...DEFAULT_PARAMS, tossHeight: 0.1, contactHeight: 0.08 });
    expect(r.warnings.some((w) => w.includes("16cm"))).toBe(true);
    expect(r.legal).toBe(false);
  });

  it("ボール上の接触位置は面の向きから求まる（面を上に向けるほど下側）", () => {
    const open = simulateServe({ ...DEFAULT_PARAMS, faceTilt: 80 });
    const vertical = simulateServe({ ...DEFAULT_PARAMS, faceTilt: 0 });
    expect(open.contact.contactOnBall.fromBottomDeg).toBeCloseTo(10, 5);
    expect(vertical.contact.contactOnBall.fromBottomDeg).toBeCloseTo(90, 5);
  });
});

describe("serveInsights", () => {
  it("短いサーブでは2バウンド目の位置を伝える", () => {
    const tips = serveInsights(simulateServe(DEFAULT_PARAMS));
    expect(tips.some((t) => t.includes("2バウンド"))).toBe(true);
  });

  it("空振りでは当たらない理由を伝える", () => {
    const tips = serveInsights(simulateServe({ ...DEFAULT_PARAMS, faceTilt: -80, swingPitch: 60 }));
    expect(tips[0]).toContain("当たっていません");
  });
});
