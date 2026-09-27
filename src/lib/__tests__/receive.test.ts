import { describe, expect, it } from "vitest";
import { flyBall, mirrorState, type BallState } from "../flight";
import { readSpin, receiveState, simulateReceive } from "../receive";
import { PRESETS, breakdownSpin, simulateServe } from "../serve-sim";
import { compareDeception, searchDisguise, searchMostDeceptive, searchServeForSpin, visibleDifference } from "../serve-search";
import { v } from "../vec3";

const preset = (id: string) => PRESETS.find((p) => p.id === id)!.params;

/** 基本スイングのサーブが、相手の打球点（頂点）に来たときのボール。 */
const ballAt = (presetId: string) => receiveState(simulateServe(preset(presetId)).receiverSide, "apex")!;

/** 打ち出し直後の速度・回転を直接与えたボール（物理の確認用）。 */
const launched = (vel: ReturnType<typeof v>, omega: ReturnType<typeof v>) => {
  const f = flyBall({ t: 0, pos: v(-0.15, 0.2, 0.2), vel, omega }, { maxBounces: 3, recordFromBounce: 1 });
  expect(f.hitNet).toBe(false);
  return receiveState(f.recorded, "apex")!;
};
const knuckleBall = () => launched(v(3.5, 0, 1.4), v(0, 0, 0));
const topspinLong = () => launched(v(7, 0, -1.5), v(0, 2 * Math.PI * 45, 0));

describe("相手の打球点", () => {
  it("レシーバー座標への変換は2回かけると元に戻る", () => {
    const s: BallState = { t: 1, pos: v(0.3, 0.2, 0.1), vel: v(4, -1, 2), omega: v(10, -20, 30) };
    const back = mirrorState(mirrorState(s));
    for (const k of ["pos", "vel", "omega"] as const) {
      for (const c of ["x", "y", "z"] as const) expect(back[k][c]).toBeCloseTo(s[k][c], 12);
    }
  });

  it("無回転で出したサーブも、台で弾むと上回転になって相手に届く（台の摩擦）", () => {
    const st = knuckleBall();
    expect(breakdownSpin(st.omega, st.vel).topBack).toBeGreaterThan(5);
  });

  it("横下回転（巻き込み）は相手の打球点でも下回転の成分が残る", () => {
    const st = ballAt("hook");
    expect(breakdownSpin(st.omega, st.vel).topBack).toBeLessThan(-5);
  });
});

describe("レシーブ（読んだ回転で角度を合わせ、実際の回転を打つ）", () => {
  it("正しく読めば、5種類の基本スイングのサーブはどれかの技術で低く返せる。上回転のロングはドライブで返せる", () => {
    for (const p of PRESETS) {
      const st = receiveState(simulateServe(p.params).receiverSide, "apex")!;
      const outcomes = (["push", "stop", "flick"] as const).map((t) => simulateReceive(st, t, readSpin(st.omega, st.vel, "actual")).outcome);
      expect(outcomes, p.label).toContain("in");
    }
    const st = topspinLong();
    expect(simulateReceive(st, "drive", readSpin(st.omega, st.vel, "actual")).outcome).toBe("in");
  });

  it("横下回転を無回転と読んでツッツキすると、返球が大きく落ちる", () => {
    const st = ballAt("hook");
    const right = simulateReceive(st, "push", readSpin(st.omega, st.vel, "actual"));
    const wrong = simulateReceive(st, "push", readSpin(st.omega, st.vel, "none"));
    expect(right.netClearance! - (wrong.netClearance ?? -1)).toBeGreaterThan(0.05);
  });

  it("上下の回転を逆に読んでツッツキすると、ネットにかかる", () => {
    const st = ballAt("hook");
    const r = simulateReceive(st, "push", readSpin(st.omega, st.vel, "flipTopBack"));
    expect(r.outcome).toBe("net");
  });

  it("上回転のロングを無回転と読んでドライブすると、オーバーする", () => {
    const st = topspinLong();
    const r = simulateReceive(st, "drive", readSpin(st.omega, st.vel, "none"));
    expect(r.outcome).toBe("out");
  });
});

describe("研究ツール", () => {
  it("逆算: 巻き込みの体の使い方のまま、相手の打球点で横下回転（下10・横10rps）を出すスイングが見つかる", async () => {
    const r = await searchServeForSpin({ topBack: -10, side: 10, length: "short", timing: "apex" }, preset("hook"));
    expect(r).not.toBeNull();
    expect(r!.result.verdict).toBe("short");
    expect(r!.error).toBeLessThan(5);
  });

  it("見た目の差: 同じサーブ同士は0", () => {
    const a = simulateServe(preset("hook"));
    expect(visibleDifference(a, a).meanCm).toBe(0);
  });

  it("フォーム研究: YG は見た目・軌道がほぼ同じまま、横下を横上に変えられ、横下と読んだ相手のフリックはオーバーする", async () => {
    const limits = { visibleCm: 3, visibleDeg: 10, landingCm: 40, netCm: 5 };
    const d = await searchDisguise(preset("yg"), "apex", "any", limits);
    expect(d).not.toBeNull();
    expect(d!.withinLimits).toBe(true);
    expect(d!.spinA.topBack).toBeLessThan(0);
    expect(d!.spinB.topBack).toBeGreaterThan(0);
    expect(simulateReceive(d!.stateB, "flick", d!.stateA.omega).outcome).toBe("out");
    expect(simulateReceive(d!.stateB, "flick", d!.stateB.omega).outcome).toBe("in");
  }, 30000);

  it("見誤り探索: 基本のフォームごと動かして、見た目の差が上限以内で回転が違う A・B の組を見つけ、読み違えの影響を数える", async () => {
    const limits = { visibleCm: 3, visibleDeg: 10, landingCm: 20, netCm: 5 };
    const list = await searchMostDeceptive("apex", limits, { types: ["yg", "backhand"], budgetPerType: 400 });
    expect(list).not.toBeNull();
    expect(list!.length).toBeGreaterThan(0);
    for (const c of list!) {
      const d = c.disguise;
      expect(c.resultA.legal).toBe(true);
      expect(c.resultA.verdict).toBe("short");
      expect(d.result.verdict).toBe("short");
      expect(c.spinGap).toBeGreaterThan(1);
      // 表示している差は、細かい刻みで計算し直した A と B の差そのもの
      expect(visibleDifference(c.resultA, d.result).meanCm).toBeCloseTo(d.visible.meanCm, 6);
      // 崩れた数は「正しく読めば入った」うちの数
      expect(c.misreadFailures).toBeLessThanOrEqual(c.misreadChances);
      expect(c.checks).toHaveLength(3);
    }
    // 並び順どおり
    for (let i = 1; i < list!.length; i++) expect(compareDeception(list![i - 1], list![i])).toBeLessThanOrEqual(0);
  }, 60000);
});
