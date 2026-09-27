import { describe, expect, it } from "vitest";
import { mirrorState, type BallState } from "../flight";
import { readSpin, receiveState, simulateReceive } from "../receive";
import { DEFAULT_PARAMS, PRESETS, breakdownSpin, simulateServe } from "../serve-sim";
import { searchDisguise, searchServeForSpin, visibleDifference } from "../serve-search";
import { v } from "../vec3";

const ballAt = (presetId: string) => {
  const r = simulateServe(PRESETS.find((p) => p.id === presetId)!.params);
  return receiveState(r.receiverSide, "apex")!;
};

describe("相手の打球点", () => {
  it("レシーバー座標への変換は2回かけると元に戻る", () => {
    const s: BallState = { t: 1, pos: v(0.3, 0.2, 0.1), vel: v(4, -1, 2), omega: v(10, -20, 30) };
    const back = mirrorState(mirrorState(s));
    for (const k of ["pos", "vel", "omega"] as const) {
      for (const c of ["x", "y", "z"] as const) expect(back[k][c]).toBeCloseTo(s[k][c], 12);
    }
  });

  it("無回転で出したサーブも、台で弾むと上回転になって相手に届く（台の摩擦）", () => {
    const st = ballAt("knuckle");
    expect(breakdownSpin(st.omega, st.vel).topBack).toBeGreaterThan(5);
  });

  it("下回転サーブは相手の打球点でも下回転", () => {
    const st = ballAt("backspin-short");
    expect(breakdownSpin(st.omega, st.vel).topBack).toBeLessThan(-5);
  });
});

describe("レシーブ（読んだ回転で角度を合わせ、実際の回転を打つ）", () => {
  it("正しく読めば、ショートにはツッツキ、ロングにはドライブで返せる", () => {
    for (const [id, tech] of [
      ["backspin-short", "push"],
      ["side-back", "push"],
      ["knuckle", "push"],
      ["topspin-long", "drive"],
    ] as const) {
      const st = ballAt(id);
      const r = simulateReceive(st, tech, readSpin(st.omega, st.vel, "actual"));
      expect(r.outcome, id).toBe("in");
    }
  });

  it("下回転を無回転と読んでツッツキすると、返球が大きく落ちる（ネットすれすれ）", () => {
    const st = ballAt("backspin-short");
    const right = simulateReceive(st, "push", readSpin(st.omega, st.vel, "actual"));
    const wrong = simulateReceive(st, "push", readSpin(st.omega, st.vel, "none"));
    expect(right.netClearance! - (wrong.netClearance ?? -1)).toBeGreaterThan(0.05);
  });

  it("上下の回転を逆に読んでツッツキすると、ネットにかかる", () => {
    const st = ballAt("backspin-short");
    const r = simulateReceive(st, "push", readSpin(st.omega, st.vel, "flipTopBack"));
    expect(r.outcome).toBe("net");
  });

  it("上回転のロングを無回転と読んでドライブすると、オーバーする", () => {
    const st = ballAt("topspin-long");
    const r = simulateReceive(st, "drive", readSpin(st.omega, st.vel, "none"));
    expect(r.outcome).toBe("out");
  });
});

describe("研究ツール", () => {
  it("逆算: 相手の打球点で下回転10rpsのショートを出すスイングが見つかる", async () => {
    const r = await searchServeForSpin({ topBack: -10, side: 0, length: "short", timing: "apex" }, DEFAULT_PARAMS);
    expect(r).not.toBeNull();
    expect(r!.result.verdict).toBe("short");
    expect(r!.error).toBeLessThan(5);
  });

  it("見た目の差: 同じサーブ同士は0", () => {
    const a = simulateServe(DEFAULT_PARAMS);
    expect(visibleDifference(a, a).meanCm).toBe(0);
  });

  it("フォーム研究: 横下回転と見た目・軌道がほぼ同じまま、上下の回転が逆（横上）のサーブが見つかる", async () => {
    const limits = { visibleCm: 3, visibleDeg: 10, landingCm: 40, netCm: 5 };
    const sideBack = PRESETS.find((p) => p.id === "side-back")!.params;
    const d = await searchDisguise(sideBack, "apex", "less", limits);
    expect(d).not.toBeNull();
    expect(d!.withinLimits).toBe(true);
    expect(d!.spinA.topBack).toBeLessThan(0);
    expect(d!.spinB.topBack).toBeGreaterThan(0);
    expect(d!.netGapCm).toBeLessThanOrEqual(5);
  });
});
