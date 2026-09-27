import { describe, expect, it } from "vitest";
import { PRESETS, simulateServe, type SpinBreakdown } from "../serve-sim";
import { spinAtReceive } from "../serve-search";
import { kindMatch, searchSpinShift, spinAngle, spinTimeline, tempoSweep } from "../spin-shift";

const sp = (topBack: number, side: number, gyro: number): SpinBreakdown => ({
  topBack,
  side,
  gyro,
  total: Math.hypot(topBack, side, gyro),
  label: "",
});

describe("回転の向き", () => {
  it("下回転と上回転は 180°、下回転と横回転は 90° 違う", () => {
    expect(spinAngle(sp(-20, 0, 0), sp(20, 0, 0))).toBeCloseTo(180, 6);
    expect(spinAngle(sp(-20, 0, 0), sp(0, 15, 0))).toBeCloseTo(90, 6);
  });

  it("種類への近さ: 純粋な下回転は「下回転」に 1、「横」に 0。ジャイロは軸の前後を問わない", () => {
    expect(kindMatch(sp(-20, 0, 0), "back")).toBeCloseTo(1, 6);
    expect(kindMatch(sp(-20, 0, 0), "sideR")).toBeCloseTo(0, 6);
    expect(kindMatch(sp(0, 0, -10), "gyro")).toBeCloseTo(1, 6);
    expect(kindMatch(sp(0, 0, 10), "gyro")).toBeCloseTo(1, 6);
  });
});

describe("回転の移り変わり", () => {
  const r = simulateServe(PRESETS.find((p) => p.id === "hook")!.params);
  const tl = spinTimeline(r, "apex");

  it("打球直後は打球時の回転、最後は相手の打球点の回転", () => {
    expect(tl.samples[0].topBack).toBeCloseTo(r.contact.spin.topBack, 6);
    const end = tl.samples[tl.samples.length - 1];
    expect(end.topBack).toBeCloseTo(spinAtReceive(r, "apex")!.spin.topBack, 6);
    expect(tl.bounces.map((b) => b.side)).toEqual(["own", "opponent"]);
  });

  it("台で弾んでも縦軸まわりの横回転はほぼ変わらない（変わるのは上下・ジャイロ）", () => {
    const s0 = tl.samples[0];
    const s1 = tl.samples[tl.samples.length - 1];
    expect(Math.abs(s1.side - s0.side) / Math.abs(s0.side)).toBeLessThan(0.1);
  });

  it("スイングの鋭さを変えると打球時の回転量が変わる", () => {
    const rows = tempoSweep(r.params, "apex", [0.8, 1, 1.25]);
    expect(rows[2].contactSpin!.total).toBeGreaterThan(rows[0].contactSpin!.total);
  });
});

describe("回転の変化探索", () => {
  it("打球時は下回転、届くときは横回転 のサーブを探せる", async () => {
    const list = await searchSpinShift(
      { from: "back", to: "sideR", minRps: 8, timing: "apex" },
      { types: ["hook"], lengths: ["short"], budgetPerRun: 300 },
    );
    expect(list).not.toBeNull();
    const c = list![0];
    expect(c.result.legal).toBe(true);
    expect(c.contactSpin.topBack).toBeLessThan(0);
    expect(c.receiveSpin.side).toBeGreaterThan(0);
    expect(c.angleDeg).toBeGreaterThan(45);
    expect(c.receiveSpin.total).toBeGreaterThan(8 - 1e-9);
  }, 60000);
});
