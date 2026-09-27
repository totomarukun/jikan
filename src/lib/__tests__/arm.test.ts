import { describe, expect, it } from "vitest";
import { JOINTS, SERVE_TYPES, buildArmKinematics, forwardKinematics, jointsAt, type ArmParams } from "../arm";
import { BALL_RADIUS } from "../racket";
import { PRESETS, simulateServe } from "../serve-sim";
import { dot, norm, sub, v } from "../vec3";

const base: ArmParams = PRESETS[0].params;

describe("腕のモデル（右利き）", () => {
  it("上腕・前腕の長さは身長の比のまま（関節を曲げても伸び縮みしない）", () => {
    for (const tau of [-0.05, 0, 0.05]) {
      const a = forwardKinematics(base, jointsAt(base, tau).q, v(0, 0, 0));
      expect(norm(sub(a.elbow, a.shoulder))).toBeCloseTo(0.186 * base.height, 6);
      expect(norm(sub(a.wrist, a.elbow))).toBeCloseTo(0.146 * base.height, 6);
    }
  });

  it("右利き: ラケットを持つ肩は体の右側にある", () => {
    const a = forwardKinematics(base, jointsAt(base, 0).q, v(0, 0, 0));
    const chest = v(Math.cos((base.contact.trunk * Math.PI) / 180), Math.sin((base.contact.trunk * Math.PI) / 180), 0);
    const right = v(chest.y, -chest.x, 0);
    expect(dot(sub(a.shoulder, a.spine), right)).toBeGreaterThan(0);
  });

  it("関節は大きく振っても可動域（AAOS）を超えない", () => {
    const wild: ArmParams = {
      ...base,
      sweep: Object.fromEntries(JOINTS.map((j) => [j.key, 300])) as ArmParams["sweep"],
      snapFlex: 200,
      snapDev: 200,
      snapPron: 200,
    };
    for (let tau = -0.2; tau <= 0.2; tau += 0.01) {
      const { q } = jointsAt(wild, tau);
      for (const j of JOINTS) {
        expect(q[j.key]).toBeGreaterThanOrEqual(j.rom[0]);
        expect(q[j.key]).toBeLessThanOrEqual(j.rom[1]);
      }
    }
  });

  it("打球の瞬間、ブレード上の打球点がボールに接する（体の位置をそこに合わせる）", () => {
    const ball = v(-0.2, 0.4, 0.18);
    const kin = buildArmKinematics(base, ball);
    const d = dot(sub(ball, kin.pose0.center), kin.pose0.normal);
    expect(d).toBeCloseTo(BALL_RADIUS, 6);
  });

  it("手首の振り幅を大きくすると、打球点が速く動く", () => {
    const ball = v(-0.2, 0.4, 0.18);
    const hitSpeed = (p: ArmParams) => {
      const kin = buildArmKinematics(p, ball);
      return norm(kin.pointVelocity(sub(ball, v(kin.pose0.normal.x * BALL_RADIUS, kin.pose0.normal.y * BALL_RADIUS, kin.pose0.normal.z * BALL_RADIUS)), 0));
    };
    const small = hitSpeed({ ...base, sweep: { ...base.sweep, wristFlex: 10 } });
    const big = hitSpeed({ ...base, sweep: { ...base.sweep, wristFlex: 60 } });
    expect(big).toBeGreaterThan(small);
  });
});

describe("サーブの種類ごとの基本のスイング", () => {
  for (const t of SERVE_TYPES) {
    it(`${t.label}: ルール上入り、横回転は${t.side}、関節は可動域の中、無理のない姿勢`, () => {
      const preset = PRESETS.find((p) => p.params.serveType === t.id)!;
      const r = simulateServe(preset.params);
      expect(r.legal).toBe(true);
      // 順横 = 相手から見て左へ曲がる = サーバー基準の横回転がマイナス
      if (t.side === "順横") expect(r.contact.spin.side).toBeLessThan(-5);
      else expect(r.contact.spin.side).toBeGreaterThan(5);
      expect(r.racket.clampedJoints).toEqual([]);
      expect(r.racket.crouch).toBeGreaterThan(0.03);
      expect(r.racket.crouch).toBeLessThan(0.45);
    });
  }

  it("トマホークはラケットの先を上に、振り子はラケットの先を下に向けて打つ", () => {
    const tip = (id: string) => {
      const r = simulateServe(PRESETS.find((p) => p.params.serveType === id)!.params);
      return -r.racket.pose0.handle.z;
    };
    expect(tip("tomahawk")).toBeGreaterThan(0.3);
    expect(tip("pendulum")).toBeLessThan(0);
  });
});
