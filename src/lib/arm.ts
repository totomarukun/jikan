// 右利きの腕のモデル。ラケットは手に握られていて、肩・肘・前腕・手首の関節角度からラケットの
// 位置と向きが決まる（順運動学）。関節は人の可動域の中でしか動かない。
//
// ■ 関節と可動域（AAOS の正常可動域）
//   肘の屈曲 0〜150° / 前腕の回内・回外 各80° / 手首の掌屈80°・背屈70° / 橈屈20°・尺屈45° /
//   肩の外旋90°・内旋70°。肩の上腕の向き（水平・上下）はサーブで使う範囲に絞った簡略版【推定】。
// ■ 体の寸法: 身長に対する比（上腕 0.186・前腕 0.146・手 0.108・肩の高さ 0.818・肩幅 0.259）。
//   Winter / Drillis & Contini として広く引用される値だが、原典は未確認【推定】。
// ■ スイング: 各関節は「打球の瞬間に一番速い」ベル型の速さで動く（打球の瞬間の角度 ± 振り幅/2）。
//   手首のスナップ・前腕のひねりは打球の前後だけの短い動きとして別に足せる。
import { BALL_RADIUS, BLADE, type RacketKinematics, type RacketPose } from "./racket";
import { add, cross, dot, norm, rad, rotate, scale, sub, unit, v, type Vec3 } from "./vec3";

export type ServeType = "pendulum" | "hook" | "yg" | "tomahawk" | "backhand";

export const SERVE_TYPES: {
  id: ServeType;
  label: string;
  /** 右利きでの横回転の向き。順横 = 相手から見て左へ曲がる、逆横 = 右へ曲がる */
  side: "順横" | "逆横";
  face: "forehand" | "backhand";
  note: string;
}[] = [
  { id: "pendulum", label: "フォアサーブ（振り子）", side: "順横", face: "forehand", note: "ラケットを右から左へ振り子のように" },
  { id: "hook", label: "巻き込み", side: "逆横", face: "forehand", note: "ボールの右側を、腕全体で体の方へ巻き込む" },
  { id: "yg", label: "YG", side: "逆横", face: "forehand", note: "肘を上げ、手首を返してボールの右側を内から外へ" },
  { id: "tomahawk", label: "トマホーク", side: "逆横", face: "forehand", note: "ラケットの先を上に立て、ボールの右側を上から下へ" },
  { id: "backhand", label: "バックサーブ", side: "逆横", face: "backhand", note: "体の正面でバック面を使い、左から右へ" },
];

export type JointKey =
  | "trunk"
  | "shoulderAz"
  | "shoulderEl"
  | "humeralRot"
  | "elbow"
  | "pronation"
  | "wristFlex"
  | "wristDev";

export type JointAngles = Record<JointKey, number>;

export const JOINTS: { key: JointKey; label: string; hint: string; rom: [number, number]; source: "AAOS" | "推定" }[] = [
  { key: "trunk", label: "体の向き", hint: "胸が向いている方向。0°=相手の方、−90°=自分の右（横向き）", rom: [-120, 60], source: "推定" },
  { key: "shoulderAz", label: "腕の振り出し（左右）", hint: "上腕の水平方向。0°=胸の正面、＋で外（右）へ、−で体の前を横切る", rom: [-40, 130], source: "推定" },
  { key: "shoulderEl", label: "腕の高さ（上下）", hint: "上腕の上下。−90°=真下に垂らす、0°=肩の高さ", rom: [-90, 90], source: "推定" },
  { key: "humeralRot", label: "上腕のひねり", hint: "＋=外旋（外へひねる）、−=内旋", rom: [-70, 90], source: "AAOS" },
  { key: "elbow", label: "肘の曲げ", hint: "0°=伸ばしきる、90°=直角", rom: [0, 150], source: "AAOS" },
  { key: "pronation", label: "前腕のひねり（回内・回外）", hint: "＋=回内（手のひらを下へ）、−=回外（上へ）", rom: [-80, 80], source: "AAOS" },
  { key: "wristFlex", label: "手首の曲げ（掌屈・背屈）", hint: "＋=掌屈（手のひら側へ）、−=背屈（甲側へ）", rom: [-70, 80], source: "AAOS" },
  { key: "wristDev", label: "手首の傾き（橈屈・尺屈）", hint: "＋=橈屈（親指側へ）、−=尺屈（小指側へ）", rom: [-45, 20], source: "AAOS" },
];

export type ArmParams = {
  serveType: ServeType;
  /** 身長 (m) */
  height: number;
  /** 打球の瞬間の関節角度（度） */
  contact: JointAngles;
  /** スイング全体での各関節の振り幅（度）。打球の前後に半分ずつ */
  sweep: JointAngles;
  /** スイングの速さの時間スケール（秒）。小さいほど鋭く速い */
  tempo: number;
  /** 手首のスナップ（打球の前後 約12msだけの振り幅, 度）: 掌屈方向 */
  snapFlex: number;
  /** 手首のスナップ: 橈屈方向 */
  snapDev: number;
  /** 前腕のひねり込み（打球の前後 約20msだけの振り幅, 度）: 回内方向 */
  snapPron: number;
  /** 打球位置: ブレード中心から先端方向へ (m) */
  hitAlong: number;
  /** 打球位置: ブレード中心から横方向へ (m) */
  hitAcross: number;
};

// 体の寸法（身長比）【推定】
const SEG = { upperArm: 0.186, forearm: 0.146, hand: 0.108, shoulderHeight: 0.818, shoulderWidth: 0.259 };
/** 手首からグリップの中心まで（手の長さに対する比）【推定】 */
const GRIP_ON_HAND = 0.45;
/** シェークハンドで、手の軸に対してラケットの軸が親指側へ傾く角度【推定】 */
const GRIP_TILT_DEG = 30;
/** グリップの中心からブレード中心まで (m)：柄の半分 + ブレードの半分 */
const GRIP_TO_BLADE = BLADE.handleLength / 2 + BLADE.halfLength;
/** 台の高さ（床から） */
const TABLE_TOP = 0.76;

export const SNAP_FLEX_S = 0.012;
export const SNAP_PRON_S = 0.02;

/** 誤差関数（Abramowitz & Stegun 7.1.26）。 */
function erf(x: number) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return sign * y;
}

const ROM = Object.fromEntries(JOINTS.map((j) => [j.key, j.rom])) as Record<JointKey, [number, number]>;

/** τ 秒（打球からの時間）での関節角度と、可動域の限界に当たった関節。 */
export function jointsAt(p: ArmParams, tau: number): { q: JointAngles; clamped: JointKey[] } {
  const q = {} as JointAngles;
  const clamped: JointKey[] = [];
  const e = erf(tau / p.tempo) / 2;
  const eFlex = erf(tau / SNAP_FLEX_S) / 2;
  const ePron = erf(tau / SNAP_PRON_S) / 2;
  for (const j of JOINTS) {
    let val = p.contact[j.key] + p.sweep[j.key] * e;
    if (j.key === "wristFlex") val += p.snapFlex * eFlex;
    if (j.key === "wristDev") val += p.snapDev * eFlex;
    if (j.key === "pronation") val += p.snapPron * ePron;
    const [lo, hi] = ROM[j.key];
    if (val < lo || val > hi) clamped.push(j.key);
    q[j.key] = Math.min(hi, Math.max(lo, val));
  }
  return { q, clamped };
}

export type ArmPose = {
  /** 背骨（肩の高さ）の位置 */
  spine: Vec3;
  leftShoulder: Vec3;
  shoulder: Vec3;
  elbow: Vec3;
  wrist: Vec3;
  grip: Vec3;
  racket: RacketPose;
};

/** 関節角度から腕とラケットの位置・向きを求める（背骨の位置 spine を原点に置く前の相対座標）。 */
export function forwardKinematics(p: ArmParams, q: JointAngles, spine: Vec3): ArmPose {
  const H = p.height;
  const up = v(0, 0, 1);
  const f = v(Math.cos(rad(q.trunk)), Math.sin(rad(q.trunk)), 0); // 胸の向き
  const l = v(-f.y, f.x, 0); // 体の左
  const shoulder = add(spine, scale(l, (-SEG.shoulderWidth / 2) * H));
  const leftShoulder = add(spine, scale(l, (SEG.shoulderWidth / 2) * H));

  // 上腕の向き: 水平の向き（胸の正面から右へ az）と上下（el）
  const az = rad(q.shoulderAz);
  const el = rad(q.shoulderEl);
  const dUa = add(scale(add(scale(f, Math.cos(az)), scale(l, -Math.sin(az))), Math.cos(el)), scale(up, Math.sin(el)));
  // 肘を曲げたときに前腕が向く方向（上腕のひねり0 = 胸の正面寄り）。上腕のひねりで回る
  let p0 = sub(f, scale(dUa, dot(f, dUa)));
  if (norm(p0) < 1e-3) p0 = sub(up, scale(dUa, dot(up, dUa)));
  const pFlex = rotate(unit(p0), dUa, rad(q.humeralRot));
  const elbow = add(shoulder, scale(dUa, SEG.upperArm * H));

  // 前腕
  const th_e = rad(q.elbow);
  const dFa = add(scale(dUa, Math.cos(th_e)), scale(pFlex, Math.sin(th_e)));
  const wrist = add(elbow, scale(dFa, SEG.forearm * H));
  // 手のひらの向き（回内外0 = 親指が上で手のひらが体の内側）。回内で下を向く
  const palm0 = unit(cross(pFlex, dUa));
  const palm = rotate(palm0, dFa, -rad(q.pronation));
  const thumb = cross(dFa, palm);

  // 手首: 掌屈（親指の軸まわり）→ 橈屈（手のひらの軸まわり）
  const flex = rad(q.wristFlex);
  let dH = rotate(dFa, thumb, flex);
  let palmH = rotate(palm, thumb, flex);
  const dev = rad(q.wristDev);
  const thumbH = rotate(thumb, palmH, -dev);
  dH = rotate(dH, palmH, -dev);
  palmH = unit(palmH);

  // ラケット: グリップは手の中、ラケットの軸は手の軸から親指側へ傾く。フォア面 = 手のひら側
  const grip = add(wrist, scale(dH, GRIP_ON_HAND * SEG.hand * H));
  const axis = unit(rotate(dH, palmH, -rad(GRIP_TILT_DEG)));
  const center = add(grip, scale(axis, GRIP_TO_BLADE));
  const face = SERVE_TYPES.find((t) => t.id === p.serveType)?.face ?? "forehand";
  const normal = face === "forehand" ? palmH : scale(palmH, -1);
  const handle = scale(axis, -1);
  void thumbH;
  return {
    spine,
    leftShoulder,
    shoulder,
    elbow,
    wrist,
    grip,
    racket: { center, normal, handle, side: cross(normal, handle) },
  };
}

export type ArmKinematics = RacketKinematics & {
  armAt: (tau: number) => ArmPose;
  /** 打球の前後 ±0.1秒で可動域の限界に当たった関節 */
  clampedJoints: JointKey[];
  /** 立った姿勢からどれだけ肩を下げているか (m)。負 = 背伸びしないと届かない */
  crouch: number;
  /** 打球の瞬間の各関節の角速度 (度/秒) */
  jointSpeeds: Record<JointKey, number>;
};

/**
 * 腕のモデルからラケットの剛体運動を作る。打球の瞬間にブレード上の打球点がボールに接するよう、
 * 体（背骨）の位置を決める。背骨は鉛直のまま、肩の高さで動かない。
 */
export function buildArmKinematics(p: ArmParams, ballCenter: Vec3): ArmKinematics {
  const q0 = jointsAt(p, 0).q;
  const rel0 = forwardKinematics(p, q0, v(0, 0, 0));
  const tip = scale(rel0.racket.handle, -1);
  const hitRel = add(add(rel0.racket.center, scale(tip, p.hitAlong)), scale(rel0.racket.side, p.hitAcross));
  const hitWorld = sub(ballCenter, scale(rel0.racket.normal, BALL_RADIUS));
  const spine = sub(hitWorld, hitRel);

  const armAt = (tau: number) => forwardKinematics(p, jointsAt(p, tau).q, spine);
  const poseAt = (tau: number) => armAt(tau).racket;
  const h = 1e-5;
  const pointVelocity = (pt: Vec3, tau: number): Vec3 => {
    const pose = poseAt(tau);
    const d = sub(pt, pose.center);
    const a = dot(d, pose.handle);
    const b = dot(d, pose.side);
    const c = dot(d, pose.normal);
    const at = (t: number) => {
      const ps = poseAt(t);
      return add(add(add(ps.center, scale(ps.handle, a)), scale(ps.side, b)), scale(ps.normal, c));
    };
    return scale(sub(at(tau + h), at(tau - h)), 1 / (2 * h));
  };
  // ラケットの角速度: ω = ½ Σ e_i × ė_i
  const pa = poseAt(-h);
  const pb = poseAt(h);
  let omega = v(0, 0, 0);
  for (const k of ["normal", "handle", "side"] as const) {
    const e = poseAt(0)[k];
    const de = scale(sub(pb[k], pa[k]), 1 / (2 * h));
    omega = add(omega, scale(cross(e, de), 0.5));
  }

  const clamped = new Set<JointKey>();
  for (let tau = -0.1; tau <= 0.1 + 1e-9; tau += 0.005) for (const k of jointsAt(p, tau).clamped) clamped.add(k);

  const jointSpeeds = {} as Record<JointKey, number>;
  const qa = jointsAt(p, -h).q;
  const qb = jointsAt(p, h).q;
  for (const j of JOINTS) jointSpeeds[j.key] = (qb[j.key] - qa[j.key]) / (2 * h);

  const standingShoulder = SEG.shoulderHeight * p.height;
  const crouch = standingShoulder - (spine.z + TABLE_TOP);

  return {
    pose0: poseAt(0),
    omega,
    poseAt,
    pointVelocity,
    armAt,
    clampedJoints: [...clamped],
    crouch,
    jointSpeeds,
  };
}
