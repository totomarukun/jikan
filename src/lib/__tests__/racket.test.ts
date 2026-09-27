import { describe, expect, it } from "vitest";
import {
  BALL_RADIUS,
  buildRacketKinematics,
  racketRestitution,
  simulateRacketContact,
  type RacketMotionParams,
} from "../racket";
import { RUBBER } from "../serve-sim";
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
    const r = obliqueOnStillRacket(1);
    expect(r.slipFraction).toBeLessThan(0.5);
    expect(r.overspinRatio).toBeGreaterThan(1);
  });

  it("摩擦が小さいと接触中ほとんど滑る", () => {
    const r = obliqueOnStillRacket(6, { ...RUBBER, friction: 0.25 });
    expect(r.slipFraction).toBeGreaterThan(0.8);
  });
});
