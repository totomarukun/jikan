import { describe, expect, it } from "vitest";
import {
  BALL_RADIUS,
  buildRacketKinematics,
  racketRestitution,
  simulateRacketContact,
  type RacketMotionParams,
} from "../racket";
import { DEFAULT_PARAMS, RUBBER, simulateServe } from "../serve-sim";
import { add, scale, v } from "../vec3";

const still: RacketMotionParams = {
  faceTilt: 0,
  faceYaw: 0,
  gripAngle: 0,
  swingSpeed: 0,
  swingPitch: 0,
  swingYaw: 0,
  arcRadius: 0.4,
  forearmRoll: 0,
  hitAlong: 0,
  hitAcross: 0,
};

/** 止まったラケット（面は +x 向き）に、ボールを真正面からぶつける。 */
function dropOnStillRacket(speed: number, rubber = RUBBER) {
  const hit = v(0, 0, 0.2);
  const kin = buildRacketKinematics(still, hit);
  const ball0 = add(hit, scale(kin.pose0.normal, BALL_RADIUS));
  return simulateRacketContact(kin, rubber, ball0, v(-speed, 0, 0));
}

/** 止まったラケットに、面に沿う速さ tangential・押し込む速さ 1m/s でボールを当てる。 */
function obliqueOnStillRacket(tangential: number, rubber = RUBBER) {
  const hit = v(0, 0, 0.2);
  const kin = buildRacketKinematics(still, hit);
  const ball0 = add(hit, scale(kin.pose0.normal, BALL_RADIUS));
  return simulateRacketContact(kin, rubber, ball0, v(-1, 0, tangential));
}

describe("ボールとラバーの接触（時間分解）", () => {
  it("接触時間は約1ms（広く引用される値。硬いガラス板でも0.6ms）", () => {
    const r = dropOnStillRacket(5);
    expect(r.duration).toBeGreaterThan(0.0008);
    expect(r.duration).toBeLessThan(0.0012);
  });

  it("正面衝突の反発係数は、速度依存の式（ISJOS v15）どおりになる", () => {
    for (const speed of [3, 8, 12]) {
      const r = dropOnStillRacket(speed);
      const e = r.vel.x / speed;
      expect(e).toBeCloseTo(racketRestitution(RUBBER.restitution, speed), 1);
    }
  });

  it("速くぶつけるほど反発係数は下がる", () => {
    const slow = dropOnStillRacket(3);
    const fast = dropOnStillRacket(12);
    expect(fast.vel.x / 12).toBeLessThan(slow.vel.x / 3);
  });

  it("正面衝突ではほぼ回転は生まれない（接触中の重力のぶんだけ）", () => {
    const r = dropOnStillRacket(5);
    const rps = Math.hypot(r.omega.x, r.omega.y, r.omega.z) / (2 * Math.PI);
    expect(rps).toBeLessThan(0.2);
  });

  it("ラバーが食いつくと、たわみの戻りで転がり以上に回る（over-spin, Rinaldi 2019）", () => {
    const r = simulateServe({ ...DEFAULT_PARAMS, faceTilt: 45, swingPitch: -20, swingSpeed: 4 });
    expect(r.contact.impact!.slipFraction).toBeLessThan(0.5);
    expect(r.contact.impact!.overspinRatio).toBeGreaterThan(1);
  });

  it("摩擦が小さいと接触中ほとんど滑る", () => {
    const r = obliqueOnStillRacket(6, { ...RUBBER, friction: 0.25 });
    expect(r.slipFraction).toBeGreaterThan(0.8);
  });
});

describe("ラケットの動き", () => {
  it("柄と直交して振ると、先端ほど打球点が速い（手首の弧）", () => {
    const base = { ...DEFAULT_PARAMS, arcRadius: 0.15, gripAngle: 90 };
    const tip = simulateServe({ ...base, hitAlong: 0.06 });
    const root = simulateServe({ ...base, hitAlong: -0.05 });
    expect(tip.contact.impact!.hitPointSpeed).toBeGreaterThan(root.contact.impact!.hitPointSpeed * 1.3);
  });

  it("柄の方向に押し出すだけなら、先端でも根元でも打球点の速さは同じ", () => {
    const base = { ...DEFAULT_PARAMS, arcRadius: 0.15, gripAngle: 0, swingYaw: 0, swingPitch: 0, faceYaw: 0 };
    const tip = simulateServe({ ...base, hitAlong: 0.06 });
    const root = simulateServe({ ...base, hitAlong: -0.05 });
    expect(tip.contact.impact!.hitPointSpeed).toBeCloseTo(root.contact.impact!.hitPointSpeed, 1);
  });

  it("滑っている間は、こする速さを上げても回転は摩擦×押す力で頭打ち", () => {
    const slippery = { ...RUBBER, friction: 0.25 };
    const slow = obliqueOnStillRacket(6, slippery);
    const fast = obliqueOnStillRacket(9, slippery);
    const rps = (o: { x: number; y: number; z: number }) => Math.hypot(o.x, o.y, o.z) / (2 * Math.PI);
    expect(rps(fast.omega) / rps(slow.omega)).toBeLessThan(1.2);
  });

  it("ブレード中心の速さは、回転半径を変えてもスイングの速さのまま", () => {
    const a = simulateServe({ ...DEFAULT_PARAMS, hitAlong: 0, arcRadius: 0.15 });
    const b = simulateServe({ ...DEFAULT_PARAMS, hitAlong: 0, arcRadius: 0.6 });
    expect(a.contact.impact!.hitPointSpeed).toBeCloseTo(DEFAULT_PARAMS.swingSpeed, 1);
    expect(b.contact.impact!.hitPointSpeed).toBeCloseTo(DEFAULT_PARAMS.swingSpeed, 1);
  });

  it("前腕のひねりは向きしだいで回転を増やしも減らしもする", () => {
    const base = { ...DEFAULT_PARAMS, hitAcross: 0.04 };
    const plain = simulateServe(base).contact.spin.total;
    const plus = simulateServe({ ...base, forearmRoll: 1200 }).contact.spin.total;
    const minus = simulateServe({ ...base, forearmRoll: -1200 }).contact.spin.total;
    expect(Math.max(plus, minus)).toBeGreaterThan(plain * 1.1);
    expect(Math.min(plus, minus)).toBeLessThan(plain * 0.9);
  });

  it("打球の瞬間、ラケットの打球点はボールの接点にある", () => {
    const r = simulateServe(DEFAULT_PARAMS);
    const pose = r.racket.poseAt(0);
    const contact = r.events[0].p;
    // ボール中心から面までの距離 = ボール半径
    const d =
      (contact.x - pose.center.x) * pose.normal.x +
      (contact.y - pose.center.y) * pose.normal.y +
      (contact.z - pose.center.z) * pose.normal.z;
    expect(d).toBeCloseTo(BALL_RADIUS, 6);
  });
});
