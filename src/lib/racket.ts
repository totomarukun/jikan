// ラケットの動き（運動学）と、ボールがラバーに触れている約1ミリ秒の間の接触計算。
//
// ■ ラケットの動き
//   打球の瞬間の「面の向き・スイング方向・速さ」に加えて、
//   - スイングの回転半径（手首だけの小さな弧 〜 腕全体の大きな弧）
//   - 前腕のひねり（柄を軸にした面の回転）
//   - ボールが当たるラケット上の位置（先端寄り / 根元寄り / 左右）
//   - グリップの向き（面の上で柄がどちらを向いているか）
//   を持つ剛体として動かす。回転の中心（手首）は柄の延長上にあり、そこから弧を描く。
//   先端に当てるほど、ひねるほど、当たった点の速度が変わる。
//
// ■ 接触（1ミリ秒の中身を 1マイクロ秒刻みで計算）
//   - 押す方向: ラバー＋スポンジをばね＋ダンパーとみなす。接触時間が約1ms
//     （広く引用される値。硬いガラス板でも約0.6ms: Phys. Rev. E の座屈実験）になる硬さにし、
//     減衰は反発係数の速度依存（ISJOS v15）に一致させる。
//   - こする方向: ラバー表面が横にたわむばね（弾性体の接線/法線剛性比 2(1−ν)/(2−ν),
//     ゴムの ν≈0.5 で 0.67）＋摩擦の上限（クーロン摩擦）。たわみが戻るとき
//     ボールを余分に回す（over-spin）。卓球のラバーで over-spin が起きることは
//     Rinaldi et al. (Applied Sciences, 2019) が実験で示している。
//   - ラケットは手に持たれていて十分重いので、ボールに押されても動きは変わらないとみなす。

import {
  add,
  cross,
  dot,
  norm,
  rad,
  rotate,
  scale,
  sub,
  unit,
  v,
  type Vec3,
} from "./vec3";

export const BALL_RADIUS = 0.02;
export const BALL_MASS = 0.0027;
// 中空球の慣性モーメント I = 2/3 m r²
const INERTIA = (2 / 3) * BALL_MASS * BALL_RADIUS ** 2;
const G = v(0, 0, -9.81);

/** 手首のスナップの持続時間の目安 (秒)。打球の前後これくらいの間だけ速く動く【推定】。 */
export const SNAP_BURST_S = 0.012;

/** 前腕のひねり込みの持続時間の目安 (秒)。打球の前後これくらいの間だけ面が回る【推定】。 */
export const ROLL_BURST_S = 0.02;

/** 誤差関数（Abramowitz & Stegun 7.1.26, 誤差 1.5e-7 以下）。 */
function erf(x: number) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return sign * y;
}

/** ブレードの大きさ（一般的なシェークハンド: 幅約150mm × 高さ約157mm）。 */
export const BLADE = { halfWidth: 0.075, halfLength: 0.079, handleLength: 0.1 } as const;

// 弾性体の接線/法線剛性比（Mindlin）。ゴムは非圧縮に近く ν≈0.5。
const POISSON = 0.5;
const TANGENTIAL_STIFFNESS_RATIO = (2 * (1 - POISSON)) / (2 - POISSON);

export type RacketMotionParams = {
  /** 面の上下角度 (度)。0 = 垂直、+ = 上向き（開く） */
  faceTilt: number;
  /** 面の左右向き (度)。+ = 左を向く */
  faceYaw: number;
  /** グリップの向き (度)。0 = 柄が自分側、+ = 面の側から見て反時計回り */
  gripAngle: number;
  /** ブレード中心の速さ (m/s) */
  swingSpeed: number;
  /** スイングの上下方向 (度) */
  swingPitch: number;
  /** スイングの左右方向 (度) */
  swingYaw: number;
  /** スイングの回転半径 (m)。手首だけ ≈ 0.15、前腕まで ≈ 0.4、腕全体 ≈ 0.6 */
  arcRadius: number;
  /** 前腕のひねり (度/秒)。柄を軸にした面の回転。+ = 面の側から見て反時計回り */
  forearmRoll: number;
  /** 打球位置: ブレード中心から先端方向へ (m)。− は根元寄り */
  hitAlong: number;
  /** 打球位置: ブレード中心から横方向へ (m) */
  hitAcross: number;
  /**
   * 手首のスナップ（打球の瞬間だけの速い動き）: 面に沿ってこする方向の速さ (m/s)。
   * + = スイング方向にさらにこする。腕の動き（見える部分）は変えない。
   */
  snapBrush?: number;
  /** 手首のスナップ: ボールを押す方向（面の向き）の速さ (m/s)。+ = 押し込む、− = 引く */
  snapPush?: number;
};

export type RubberContactProps = {
  /** 低速時の反発係数（速度が上がると下がる） */
  restitution: number;
  /** ボールとの摩擦係数 */
  friction: number;
  /** 接触時間の目安 (秒) */
  contactTime: number;
};

/** ある時刻のラケットの姿勢。 */
export type RacketPose = {
  center: Vec3;
  /** 面の法線（打つ面が向いている方向） */
  normal: Vec3;
  /** ブレード中心から柄の方へ向く単位ベクトル */
  handle: Vec3;
  /** 面の中の横方向（normal × handle） */
  side: Vec3;
};

export type RacketKinematics = {
  /** 打球の瞬間（τ=0）の姿勢 */
  pose0: RacketPose;
  /** 回転中心（手首）の位置（τ=0） */
  pivot0: Vec3;
  /** 回転中心の並進速度（柄方向に押し出す成分） */
  pivotVel: Vec3;
  /** ラケットの角速度ベクトル (rad/s) */
  omega: Vec3;
  /** τ 秒後の姿勢 */
  poseAt: (tau: number) => RacketPose;
  /** τ 秒後に、ラケット上の点 p（その時刻の位置）が動いている速度 */
  pointVelocity: (p: Vec3, tau: number) => Vec3;
};

/** 面の法線（面が向いている方向）。 */
export function faceNormalOf(p: Pick<RacketMotionParams, "faceTilt" | "faceYaw">): Vec3 {
  const t = rad(p.faceTilt);
  const y = rad(p.faceYaw);
  return v(Math.cos(t) * Math.cos(y), Math.cos(t) * Math.sin(y), Math.sin(t));
}

/** スイング方向の単位ベクトル。 */
export function swingDirectionOf(p: Pick<RacketMotionParams, "swingPitch" | "swingYaw">): Vec3 {
  const ph = rad(p.swingPitch);
  const yw = rad(p.swingYaw);
  return v(Math.cos(ph) * Math.cos(yw), Math.cos(ph) * Math.sin(yw), Math.sin(ph));
}

/** 面の中で「柄が自分側を向く」基準方向を作り、グリップ角だけ回す。 */
function handleDirection(n: Vec3, gripAngle: number): Vec3 {
  // 自分側（−x）を面に投影。面がほぼ真横を向いていて投影が潰れる場合は下向きを使う
  let ref = sub(v(-1, 0, 0), scale(n, -n.x));
  if (norm(ref) < 0.2) ref = sub(v(0, 0, -1), scale(n, -n.z));
  return rotate(unit(ref), n, rad(gripAngle));
}

/**
 * ラケットの剛体運動を組み立てる。打球の瞬間にブレード上の打球点が hitPoint にあるよう置く。
 * 運動 = 手首（柄の延長上、ブレード中心から arcRadius）まわりの回転 ＋ 柄方向の押し出し。
 */
export function buildRacketKinematics(p: RacketMotionParams, hitPoint: Vec3): RacketKinematics {
  const n = faceNormalOf(p);
  const h = handleDirection(n, p.gripAngle);
  const s = cross(n, h);
  const tip = scale(h, -1);
  // 打球点がブレード中心からどれだけずれているか（面内）
  const offset = add(scale(tip, p.hitAlong), scale(s, p.hitAcross));
  const center = sub(hitPoint, offset);
  const pose0: RacketPose = { center, normal: n, handle: h, side: s };

  const vCenter = scale(swingDirectionOf(p), p.swingSpeed);
  const rho = Math.max(0.05, p.arcRadius);
  const pivot0 = add(center, scale(h, rho));
  // 柄に沿う成分は腕の押し出し（並進）、柄に直交する成分は手首まわりの回転で作る
  const along = dot(vCenter, h);
  const pivotVel = scale(h, along);
  const vPerp = sub(vCenter, pivotVel);
  const omegaArc = scale(cross(vPerp, h), 1 / rho);
  const rollRate = rad(p.forearmRoll);
  // 打球の瞬間の角速度（接触の1msの間はこれでほぼ一定）
  const omega = add(omegaArc, scale(h, rollRate));
  const wArc = norm(omegaArc);
  const arcAxis = wArc > 1e-9 ? scale(omegaArc, 1 / wArc) : v(0, 0, 1);
  // 前腕のひねりは打球の前後だけの短い「ひねり込み」（幅 ROLL_BURST_S のベル型）。
  // 腕の弧は打球の前後で続く。
  const rollAngle = (tau: number) => rollRate * ROLL_BURST_S * (Math.sqrt(Math.PI) / 2) * erf(tau / ROLL_BURST_S);
  const rollRateAt = (tau: number) => rollRate * Math.exp(-((tau / ROLL_BURST_S) ** 2));

  // 手首のスナップ: 打球の前後 SNAP_BURST_S 程度だけ、ラケット全体に速度を足す（ベル型）
  const brushDir = (() => {
    const along = sub(vCenter, scale(n, dot(vCenter, n)));
    return norm(along) > 1e-6 ? unit(along) : s;
  })();
  const snapVel = add(scale(brushDir, p.snapBrush ?? 0), scale(n, p.snapPush ?? 0));
  const snapShift = (tau: number) => scale(snapVel, SNAP_BURST_S * (Math.sqrt(Math.PI) / 2) * erf(tau / SNAP_BURST_S));
  const snapVelAt = (tau: number) => scale(snapVel, Math.exp(-((tau / SNAP_BURST_S) ** 2)));

  const poseAt = (tau: number): RacketPose => {
    const pivot = add(add(pivot0, scale(pivotVel, tau)), snapShift(tau));
    const roll = rollAngle(tau);
    const ang = wArc * tau;
    const turn = (a: Vec3) => rotate(rotate(a, h, roll), arcAxis, ang);
    return {
      center: add(pivot, turn(sub(center, pivot0))),
      normal: turn(n),
      handle: turn(h),
      side: turn(s),
    };
  };
  const pointVelocity = (pt: Vec3, tau: number) =>
    add(
      add(pivotVel, snapVelAt(tau)),
      cross(add(omegaArc, scale(h, rollRateAt(tau))), sub(pt, add(add(pivot0, scale(pivotVel, tau)), snapShift(tau)))),
    );

  return { pose0, pivot0, pivotVel, omega, poseAt, pointVelocity };
}

/** ラバーの反発係数。衝突速度 1m/s あたり 0.019 下がる（ISJOS v15）。 */
export function racketRestitution(base: number, normalSpeed: number) {
  return Math.max(0.3, base - 0.019 * Math.abs(normalSpeed));
}

export type ContactSample = {
  /** 接触開始からの時間 (ms) */
  tMs: number;
  /** 押す力 (N) */
  normalForce: number;
  /** こする力 (N) */
  tangentialForce: number;
  /** 総回転数 (rps) */
  spinRps: number;
  /** ラバー上で滑っているか */
  slipping: boolean;
};

export type ContactResult = {
  hit: boolean;
  vel: Vec3;
  omega: Vec3;
  /** ボールが離れた位置 */
  exitPos: Vec3;
  /** 接触時間 (秒) */
  duration: number;
  /** 接触中にボールがラバー上を移動した距離 (m)。いわゆる球持ちの長さ */
  travelOnRubber: number;
  /** 接触時間のうち滑っていた割合 */
  slipFraction: number;
  /**
   * 転がりの限界に対する回転の上乗せ（1.0 = ちょうど転がり、>1 = ラバーのたわみで余分に回った）。
   * 離れる瞬間の「接点の回転速度 / ボール中心の接線速度」から求める。
   */
  overspinRatio: number;
  /** 打球の瞬間の、ラケット上の打球点の速度 (m/s) */
  hitPointSpeed: number;
  trace: ContactSample[];
};

/**
 * ボールとラバーの接触を時間分解して計算する。
 * ballPos0 は接触開始時のボール中心（面に触れた位置）、ballVel0 は入射速度、
 * ballOmega0 は入射時の回転（レシーブでは相手のサーブの回転が乗っている）。
 */
export function simulateRacketContact(
  kin: RacketKinematics,
  rubber: RubberContactProps,
  ballPos0: Vec3,
  ballVel0: Vec3,
  ballOmega0: Vec3 = v(0, 0, 0),
  dt = 1e-6,
): ContactResult {
  const hitPoint = sub(ballPos0, scale(kin.pose0.normal, BALL_RADIUS));
  const hitVel = kin.pointVelocity(hitPoint, 0);
  const vn0 = dot(sub(ballVel0, hitVel), kin.pose0.normal);
  const empty: ContactResult = {
    hit: false,
    vel: ballVel0,
    omega: ballOmega0,
    exitPos: ballPos0,
    duration: 0,
    travelOnRubber: 0,
    slipFraction: 0,
    overspinRatio: 0,
    hitPointSpeed: norm(hitVel),
    trace: [],
  };
  if (vn0 >= -1e-6) return empty; // 面がボールから離れる向きに動いている

  // 反発係数（衝突速度で変わる）→ 減衰比、接触時間 → ばねの硬さ
  const e = racketRestitution(rubber.restitution, -vn0);
  const lnE = Math.log(e);
  const zeta = -lnE / Math.sqrt(Math.PI ** 2 + lnE ** 2);
  const wn = Math.PI / (rubber.contactTime * Math.sqrt(1 - zeta ** 2));
  const kN = BALL_MASS * wn ** 2;
  const cN = 2 * zeta * Math.sqrt(kN * BALL_MASS);
  // こする方向: 横剛性は法線剛性の 0.67 倍（Mindlin）。接点の実効質量は中空球で (2/5)m なので、
  // 横方向の固有振動は押す方向より速く、接触中にたわみが戻って over-spin が生まれる。
  const mT = (2 / 5) * BALL_MASS;
  const kT = TANGENTIAL_STIFFNESS_RATIO * kN;
  const cT = 2 * zeta * Math.sqrt(kT * mT);

  let pos = ballPos0;
  let vel = ballVel0;
  let omega = ballOmega0;
  let spring = v(0, 0, 0); // ラバー表面の横たわみ
  let t = 0;
  let slipTime = 0;
  let started = false;
  const trace: ContactSample[] = [];
  let lastSample = -1;
  // ラケット座標での接点位置（球持ちの距離を測る）
  const startLocal = localPoint(kin, hitPoint, 0);
  let lastContact = hitPoint;
  const maxT = rubber.contactTime * 4;

  while (t < maxT) {
    const pose = kin.poseAt(t);
    const n = pose.normal;
    const pen = BALL_RADIUS - dot(sub(pos, pose.center), n);
    if (pen <= 0 && started) break;
    if (pen > 0) started = true;

    const rc = scale(n, -BALL_RADIUS);
    const contact = add(pos, rc);
    const surfVel = kin.pointVelocity(contact, t);
    const vc = sub(add(vel, cross(omega, rc)), surfVel);
    const vn = dot(vc, n);
    const vt = sub(vc, scale(n, vn));

    const fn = pen > 0 ? Math.max(0, kN * pen - cN * vn) : 0;
    // ばねは面内に保つ（面が回るぶんを射影で追従）
    spring = sub(spring, scale(n, dot(spring, n)));
    spring = add(spring, scale(vt, dt));
    let ft = sub(scale(spring, -kT), scale(vt, cT));
    const ftMag = norm(ft);
    const limit = rubber.friction * fn;
    let slipping = false;
    if (ftMag > limit) {
      slipping = true;
      ft = ftMag > 1e-12 ? scale(ft, limit / ftMag) : v(0, 0, 0);
      spring = scale(ft, -1 / kT);
      slipTime += dt;
    }
    if (fn === 0) spring = v(0, 0, 0);

    const acc = add(scale(add(scale(n, fn), ft), 1 / BALL_MASS), G);
    const alpha = scale(cross(rc, ft), 1 / INERTIA);
    vel = add(vel, scale(acc, dt));
    omega = add(omega, scale(alpha, dt));
    pos = add(pos, scale(vel, dt));
    lastContact = contact;

    if (t - lastSample >= 1e-5) {
      trace.push({
        tMs: t * 1000,
        normalForce: fn,
        tangentialForce: norm(ft),
        spinRps: norm(omega) / (2 * Math.PI),
        slipping,
      });
      lastSample = t;
    }
    t += dt;
  }

  const endLocal = localPoint(kin, lastContact, t);
  const travel = Math.hypot(endLocal.a - startLocal.a, endLocal.b - startLocal.b);

  // 離れる瞬間の over-spin 比: 面に沿ったボール中心の速度（ラケット基準）と、回転による接点速度の比
  const pose = kin.poseAt(t);
  const relCenter = sub(vel, kin.pointVelocity(pos, t));
  const tangential = sub(relCenter, scale(pose.normal, dot(relCenter, pose.normal)));
  const spinSurface = cross(omega, scale(pose.normal, -BALL_RADIUS));
  const tMag = norm(tangential);
  const overspinRatio = tMag > 1e-6 ? -dot(spinSurface, tangential) / (tMag * tMag) : 0;

  return {
    hit: true,
    vel,
    omega,
    exitPos: pos,
    duration: t,
    travelOnRubber: travel,
    slipFraction: t > 0 ? slipTime / t : 0,
    overspinRatio,
    hitPointSpeed: norm(hitVel),
    trace,
  };
}

/** ワールド座標の点を、時刻 τ のラケット面内の座標（先端方向 a, 横方向 b）に直す。 */
function localPoint(kin: RacketKinematics, p: Vec3, tau: number) {
  const pose = kin.poseAt(tau);
  const d = sub(p, pose.center);
  return { a: -dot(d, pose.handle), b: dot(d, pose.side) };
}
