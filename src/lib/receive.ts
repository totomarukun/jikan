// 相手のレシーブ。「読んだ回転」に合わせてラケット角度を決め、その角度のまま
// 「実際の回転」のボールを打つ。読みが外れると、浮く・ネット・オーバーになる。
//
// 計算はレシーバー側から見た座標（flight.ts の mirror*）で行い、結果を元の座標に戻す。
// レシーバーのラケットとボールの接触は、サーブと同じ時間分解モデル（racket.ts）。
import {
  BALL,
  TABLE,
  flyBall,
  mirrorPoint,
  mirrorState,
  mirrorVector,
  type BallState,
  type TrajectoryPoint,
} from "./flight";
import {
  buildRacketKinematics,
  faceNormalOf,
  simulateRacketContact,
  type RacketKinematics,
  type RacketMotionParams,
  type RacketPose,
} from "./racket";
import { breakdownSpin, RUBBER, type SpinBreakdown } from "./serve-sim";
import { dot, norm, scale, sub, v, type Vec3 } from "./vec3";

export type ReceiveTiming = "rising" | "apex" | "falling";

export const RECEIVE_TIMINGS: { id: ReceiveTiming; label: string }[] = [
  { id: "rising", label: "早め（上昇中）" },
  { id: "apex", label: "頂点" },
  { id: "falling", label: "遅め（落ち際）" },
];

/**
 * 相手コートでバウンドした後のどの瞬間に打つか。
 * states は相手コート1バウンド直後からの状態（serve-sim の receiverSide）。
 */
export function receiveState(states: BallState[], timing: ReceiveTiming): BallState | null {
  if (states.length < 3) return null;
  const bounce = states[0];
  let apex = states.findIndex((s, i) => i > 0 && s.vel.z <= 0);
  if (apex < 0) apex = states.length - 1;
  const ta = states[apex].t;
  const tb = bounce.t;
  const target = timing === "apex" ? ta : timing === "rising" ? tb + 0.6 * (ta - tb) : ta + 0.5 * (ta - tb);
  let i = states.findIndex((s) => s.t >= target);
  if (i < 0) i = states.length - 1;
  // 台より低くなってしまう場合は頂点で打つ
  if (states[i].pos.z < 0.05) i = apex;
  return states[i];
}

export type Technique = "push" | "stop" | "flick" | "drive";

type TechniqueDef = {
  label: string;
  description: string;
  swingSpeed: number;
  swingPitch: number;
  /** 面の上下角度の探索範囲 (度) */
  tilt: [number, number];
  /** 狙う着地点: サーバー側エンドラインからの距離 (m) */
  targetFromServerEnd: number;
  /** ネット上を低く通したい度合い（大きいほど低さを重視） */
  lowWeight: number;
};

// 各技術の標準的なスイング（速さ・上下方向）は一般的な目安で、選手によって幅がある【推定】。
export const TECHNIQUES: Record<Technique, TechniqueDef> = {
  push: {
    label: "ツッツキ",
    description: "面を開いて前へ運び、低く深く返す",
    swingSpeed: 3,
    swingPitch: -10,
    tilt: [5, 88],
    targetFromServerEnd: 0.45,
    lowWeight: 3,
  },
  stop: {
    label: "ストップ",
    description: "当てるだけで短く返す",
    swingSpeed: 1.5,
    swingPitch: 0,
    tilt: [0, 88],
    targetFromServerEnd: 1.0,
    lowWeight: 4,
  },
  flick: {
    label: "フリック",
    description: "台上で弾いて速く返す",
    swingSpeed: 6,
    swingPitch: 15,
    tilt: [-45, 50],
    targetFromServerEnd: 0.5,
    lowWeight: 1,
  },
  drive: {
    label: "ドライブ",
    description: "こすり上げて上回転で返す（長いサーブ向き）",
    swingSpeed: 10,
    swingPitch: 30,
    tilt: [-70, 20],
    targetFromServerEnd: 0.5,
    lowWeight: 0.5,
  },
};

export type SpinRead = "actual" | "none" | "stronger" | "weaker" | "flipSide" | "flipTopBack";

export const SPIN_READS: { id: SpinRead; label: string }[] = [
  { id: "actual", label: "正しく読む" },
  { id: "none", label: "無回転と読む" },
  { id: "stronger", label: "回転を多めに読む" },
  { id: "weaker", label: "回転を少なめに読む" },
  { id: "flipSide", label: "横回転を逆に読む" },
  { id: "flipTopBack", label: "上下を逆に読む" },
];

/** 実際の回転から「相手が読んだ回転」を作る。 */
export function readSpin(actual: Vec3, vel: Vec3, read: SpinRead): Vec3 {
  switch (read) {
    case "actual":
      return actual;
    case "none":
      return v(0, 0, 0);
    case "stronger":
      return scale(actual, 1.6);
    case "weaker":
      return scale(actual, 0.4);
    case "flipSide":
      return v(actual.x, actual.y, -actual.z);
    case "flipTopBack": {
      // 進行方向の左向き成分（上下回転）だけ符号を反転
      const h = Math.hypot(vel.x, vel.y) || 1;
      const left = v(-vel.y / h, vel.x / h, 0);
      const c = dot(actual, left);
      return sub(actual, scale(left, 2 * c));
    }
  }
}

export type ReceiveOutcome = "in" | "high" | "net" | "out" | "miss";

export type ReceiveResult = {
  technique: Technique;
  /** 相手が合わせたラケット（レシーバー側から見た座標での値） */
  racket: RacketMotionParams;
  outcome: ReceiveOutcome;
  outcomeLabel: string;
  /** 返球の軌跡（元の座標） */
  points: TrajectoryPoint[];
  /** サーバー側コートに落ちた位置（元の座標）。落ちていなければ null */
  landing: Vec3 | null;
  /** 狙った位置からのずれ (m) */
  missDistance: number | null;
  netClearance: number | null;
  returnSpeed: number;
  returnSpin: SpinBreakdown;
  /** 打った時刻（サーブと同じ時間軸） */
  hitTime: number;
  /** ラケットの姿勢（元の座標）。τ = 打球からの秒数 */
  poseAt: (tau: number) => RacketPose;
};

const RECEIVER_BASE: Omit<RacketMotionParams, "faceTilt" | "faceYaw" | "swingSpeed" | "swingPitch"> = {
  gripAngle: 45,
  swingYaw: 0,
  arcRadius: 0.35,
  forearmRoll: 0,
  hitAlong: 0.02,
  hitAcross: 0,
};

const OUTCOME_LABEL: Record<ReceiveOutcome, string> = {
  in: "入った（低く返った）",
  high: "入ったが浮いた（チャンスボール）",
  net: "ネット",
  out: "オーバー / サイドアウト",
  miss: "空振り・当たり損ね",
};

type Shot = {
  kin: RacketKinematics;
  racket: RacketMotionParams;
  hit: boolean;
  flight: ReturnType<typeof flyBall> | null;
  start: BallState | null;
};

/** レシーバー座標で1本打つ。 */
function shoot(ball: BallState, omega: Vec3, racket: RacketMotionParams, fine: boolean): Shot {
  const n = faceNormalOf(racket);
  const kin = buildRacketKinematics(racket, sub(ball.pos, scale(n, BALL.radius)));
  const c = simulateRacketContact(kin, RUBBER, ball.pos, ball.vel, omega, fine ? 1e-6 : 8e-6);
  if (!c.hit) return { kin, racket, hit: false, flight: null, start: null };
  const start: BallState = { t: ball.t + c.duration, pos: c.exitPos, vel: c.vel, omega: c.omega };
  const flight = flyBall(start, { dt: fine ? 0.001 : 0.003, maxBounces: fine ? 2 : 1, maxTime: 1.5 });
  return { kin, racket, hit: true, flight, start };
}

/** 狙いへの近さ（小さいほど良い）。レシーバー座標で、相手（サーバー）側は x < netX。 */
function aimError(shot: Shot, target: Vec3, lowWeight: number) {
  if (!shot.hit || !shot.flight) return 100;
  const f = shot.flight;
  if (f.hitNet) return 20 + Math.max(0, -(f.netClearance ?? 0));
  const b = f.bounces[0];
  if (!b || b.half !== "far") return 10 + norm(sub(f.end.pos, target));
  const inCourt = b.p.x <= TABLE.length && Math.abs(b.p.y) <= TABLE.width / 2;
  const dist = Math.hypot(b.p.x - target.x, b.p.y - target.y);
  const clr = f.netClearance ?? 0;
  // 人はネットすれすれを狙わず、5cm ほどの安全な余裕を取る【推定】
  return (inCourt ? 0 : 5) + dist + lowWeight * Math.max(0, clr - 0.1) + 20 * Math.max(0, 0.05 - clr);
}

/**
 * 相手が readOmega の回転だと思って狙いを定め、実際には ball（実際の回転つき）を打つ。
 * ball, readOmega は元の座標（サーバー基準）で渡す。
 */
export function simulateReceive(ball: BallState, technique: Technique, readOmega: Vec3): ReceiveResult {
  const def = TECHNIQUES[technique];
  const mb = mirrorState(ball);
  const readM = mirrorVector(readOmega);
  // レシーバー座標での狙い: サーバー側エンドラインから targetFromServerEnd
  const target = v(TABLE.length - def.targetFromServerEnd, 0, 0);
  const base = { ...RECEIVER_BASE, swingSpeed: def.swingSpeed, swingPitch: def.swingPitch };

  // 1) 読んだ回転で、面の上下角度・左右向き・スイングの上下を粗く探してから細かく詰める
  //    （相手はその技術の範囲で、入ると思う角度に合わせてくる）
  let best = { tilt: 0, yaw: 0, pitch: def.swingPitch, err: Infinity };
  const evalAt = (tilt: number, yaw: number, pitch: number) => {
    const r = { ...base, faceTilt: tilt, faceYaw: yaw, swingPitch: pitch };
    const e = aimError(shoot({ ...mb, omega: readM }, readM, r, false), target, def.lowWeight);
    if (e < best.err) best = { tilt, yaw, pitch, err: e };
  };
  for (const pitch of [def.swingPitch - 10, def.swingPitch, def.swingPitch + 10]) {
    for (let tilt = def.tilt[0]; tilt <= def.tilt[1]; tilt += 6) {
      for (let yaw = -40; yaw <= 40; yaw += 10) evalAt(tilt, yaw, pitch);
    }
  }
  for (const step of [3, 1]) {
    const c = best;
    for (let dt = -2; dt <= 2; dt++) for (let dy = -2; dy <= 2; dy++) evalAt(c.tilt + dt * step, c.yaw + dy * step * 1.5, c.pitch);
  }
  const racket: RacketMotionParams = { ...base, faceTilt: best.tilt, faceYaw: best.yaw, swingPitch: best.pitch };

  // 2) その角度のまま、実際の回転のボールを打つ
  const shot = shoot(mb, mb.omega, racket, true);
  const poseAt = (tau: number): RacketPose => {
    const p = shot.kin.poseAt(tau);
    return {
      center: mirrorPoint(p.center),
      normal: mirrorVector(p.normal),
      handle: mirrorVector(p.handle),
      side: mirrorVector(p.side),
    };
  };
  if (!shot.hit || !shot.flight || !shot.start) {
    return {
      technique,
      racket,
      outcome: "miss",
      outcomeLabel: OUTCOME_LABEL.miss,
      points: [{ t: ball.t, p: ball.pos }],
      landing: null,
      missDistance: null,
      netClearance: null,
      returnSpeed: 0,
      returnSpin: breakdownSpin(v(0, 0, 0), v(-1, 0, 0)),
      hitTime: ball.t,
      poseAt,
    };
  }
  const f = shot.flight;
  const b = f.bounces[0];
  let outcome: ReceiveOutcome;
  if (f.hitNet) outcome = "net";
  else if (!b || b.half !== "far" || b.p.x > TABLE.length || Math.abs(b.p.y) > TABLE.width / 2) outcome = "out";
  else if ((f.netClearance ?? 0) > 0.2) outcome = "high";
  else outcome = "in";
  const landing = b && b.half === "far" ? mirrorPoint(b.p) : null;
  const velW = mirrorVector(shot.start.vel);
  return {
    technique,
    racket,
    outcome,
    outcomeLabel: OUTCOME_LABEL[outcome],
    points: [{ t: ball.t, p: ball.pos }, ...f.points.map((pt) => ({ t: pt.t, p: mirrorPoint(pt.p) }))],
    landing,
    missDistance: b && b.half === "far" ? Math.hypot(b.p.x - target.x, b.p.y - target.y) : null,
    netClearance: f.netClearance,
    returnSpeed: norm(shot.start.vel),
    returnSpin: breakdownSpin(mirrorVector(shot.start.omega), velW),
    hitTime: ball.t,
    poseAt,
  };
}
