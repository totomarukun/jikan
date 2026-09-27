// ボールの飛行・台でのバウンド・ネット判定（サーブにもレシーブにも使う共通部分）。
//
// 座標系（メートル・秒）:
//   x = 台の長手方向。0 = サーバー側エンドライン、TABLE.length = レシーバー側エンドライン
//   y = 左右。+ = サーバーから見て左
//   z = 高さ。0 = 台の上面
//
// 出典: 飛行と台バウンドは Dürr et al., Nature 652 (2026) Methods（卓球ロボット Ace）。
//   抗力 c_d=0.55、マグヌス係数 c_M=0.1·|v|/(r|ω|)−0.001、台の反発 0.98−0.02·v_z、摩擦 0.25。
import { add, cross, norm, scale, sub, v, type Vec3 } from "./vec3";

export const TABLE = {
  length: 2.74,
  width: 1.525,
  netX: 1.37,
  netHeight: 0.1525,
  // ITTF: ネットポストはサイドラインの外側 15.25cm まで
  netOverhang: 0.1525,
  heightFromFloor: 0.76,
} as const;

export const BALL = {
  radius: 0.02,
  mass: 0.0027,
} as const;

export const G = 9.81;
// Ace: 室温・標準気圧の乾燥空気
const AIR_DENSITY = 1.204;
// Ace: 抗力係数
const DRAG_COEF = 0.55;
// Ace: c_M = 0.1·|v|/(r|ω|) − 0.001
const MAGNUS_A = 0.1;
const MAGNUS_B = 0.001;
// Ace の式は回転が小さい領域でも一定の揚力を出す（トップ選手のラリーで同定した式のため）。
// ナックル付近では揚力が回転比 S=rω/v に比例して 0 に近づくよう、低回転側だけ
// 揚力係数 C_L ≈ 1.5·S（野球ボールの低回転域の近似, Sawicki et al. 2003）でつなぐ【推定】。
const LOW_SPIN_LIFT_SLOPE = 1.5;
// Ace: 台の動摩擦係数
const TABLE_FRICTION = 0.25;

const AREA = Math.PI * BALL.radius ** 2;
const K_DRAG = (0.5 * AIR_DENSITY * DRAG_COEF * AREA) / BALL.mass;
const K_MAGNUS_BASE = ((4 / 3) * Math.PI * AIR_DENSITY * BALL.radius ** 3) / BALL.mass;
// 中空球の慣性モーメント I = 2/3 m r²
const INERTIA = (2 / 3) * BALL.mass * BALL.radius ** 2;

export type TrajectoryPoint = { t: number; p: Vec3 };

/** ある時刻のボールの状態。 */
export type BallState = { t: number; pos: Vec3; vel: Vec3; omega: Vec3 };

/** 台のどちら側か。near = サーバー側（x ≤ netX）、far = レシーバー側。 */
export type TableHalf = "near" | "far";

export type FlightEvent =
  | { kind: "bounce"; t: number; p: Vec3; half: TableHalf }
  | { kind: "net"; t: number; p: Vec3 }
  | { kind: "floor"; t: number; p: Vec3 };

export type Bounce = { t: number; p: Vec3; half: TableHalf; after: BallState };

export type FlightResult = {
  points: TrajectoryPoint[];
  events: FlightEvent[];
  bounces: Bounce[];
  hitNet: boolean;
  /** ネット面を通過したときの、ネット上端からの余裕 (m)。通過していなければ null */
  netClearance: number | null;
  /** recordFromBounce で指定したバウンド以降、毎ステップの状態 */
  recorded: BallState[];
  end: BallState;
};

/** Ace: 台の反発係数は衝突速度で下がる（v_z は m/s の大きさ）。 */
export function tableRestitution(vzIn: number) {
  return Math.min(0.98, Math.max(0.5, 0.98 - 0.02 * Math.abs(vzIn)));
}

/**
 * マグヌス係数 c_M（f_M = c_M·(4/3)πρr³·(ω×v)）。
 * Ace の式に、低回転域だけ揚力が回転比に比例して消えるよう補正をかける。
 */
export function magnusCoefficient(speed: number, spin: number) {
  if (speed < 1e-9 || spin < 1e-9) return 0;
  const S = (BALL.radius * spin) / speed;
  const ace = MAGNUS_A / S - MAGNUS_B;
  // Ace の式を揚力係数に直すと C_L = (8/3)·c_M·S
  const aceLift = (8 / 3) * ace * S;
  const lowSpinLift = LOW_SPIN_LIFT_SLOPE * S;
  return aceLift > lowSpinLift ? ace * (lowSpinLift / aceLift) : ace;
}

function accel(vel: Vec3, omega: Vec3): Vec3 {
  const s = norm(vel);
  const drag = scale(vel, -K_DRAG * s);
  const cm = magnusCoefficient(s, norm(omega));
  const magnus = scale(cross(omega, vel), K_MAGNUS_BASE * cm);
  return add(add(drag, magnus), v(0, 0, -G));
}

/** 4次のルンゲ＝クッタ法で1ステップ進める（Ace と同じく飛行中の回転は一定とみなす）。 */
export function rk4(pos: Vec3, vel: Vec3, omega: Vec3, dt: number) {
  const a1 = accel(vel, omega);
  const v2 = add(vel, scale(a1, dt / 2));
  const a2 = accel(v2, omega);
  const v3 = add(vel, scale(a2, dt / 2));
  const a3 = accel(v3, omega);
  const v4 = add(vel, scale(a3, dt));
  const a4 = accel(v4, omega);
  const nextVel = add(vel, scale(add(add(a1, scale(add(a2, a3), 2)), a4), dt / 6));
  const nextPos = add(pos, scale(add(add(vel, scale(add(v2, v3), 2)), v4), dt / 6));
  return { pos: nextPos, vel: nextVel };
}

/**
 * 台でのバウンド（Ace の接触モデルを撃力の形で書いたもの）。
 * 滑り: 摩擦 μ(1+ε)v_n まで、転がり: 接点の滑りがちょうど0になるところ（中空球で 2/5）。
 */
export function tableBounce(vel: Vec3, omega: Vec3) {
  const n = v(0, 0, 1);
  const un = vel.z;
  if (un >= 0) return { vel, omega };
  const jn = BALL.mass * (1 + tableRestitution(-un)) * -un;
  const rc = scale(n, -BALL.radius);
  const relT = v(vel.x, vel.y, 0);
  const slip = add(relT, cross(omega, rc));
  const slipMag = norm(slip);
  let jt = scale(slip, -(2 / 5) * BALL.mass);
  if (norm(jt) > TABLE_FRICTION * jn && slipMag > 0) jt = scale(slip, (-TABLE_FRICTION * jn) / slipMag);
  return {
    vel: add(vel, scale(add(scale(n, jn), jt), 1 / BALL.mass)),
    omega: add(omega, scale(cross(rc, jt), 1 / INERTIA)),
  };
}

export function onTable(p: Vec3) {
  return p.x >= 0 && p.x <= TABLE.length && Math.abs(p.y) <= TABLE.width / 2;
}

/**
 * ボールを飛ばす。台でのバウンド・ネット・床を処理し、軌跡とイベントを返す。
 * ネットはどちら向きに越えても判定する。
 */
export function flyBall(
  start: BallState,
  opts: { dt?: number; maxTime?: number; maxBounces?: number; recordFromBounce?: number } = {},
): FlightResult {
  const dt = opts.dt ?? 0.001;
  const maxT = start.t + (opts.maxTime ?? 3);
  const maxBounces = opts.maxBounces ?? 3;
  let { pos, vel, omega } = start;
  let t = start.t;
  const points: TrajectoryPoint[] = [{ t, p: pos }];
  const events: FlightEvent[] = [];
  const bounces: Bounce[] = [];
  const recorded: BallState[] = [];
  let netClearance: number | null = null;
  let netChecked = false;
  let hitNet = false;
  let sampleAcc = 0;

  while (t < maxT) {
    const step = rk4(pos, vel, omega, dt);
    const next = step.pos;
    vel = step.vel;
    t += dt;

    // ネット面（x = netX）の通過判定（向きは問わない）
    if (!netChecked && (pos.x - TABLE.netX) * (next.x - TABLE.netX) <= 0 && pos.x !== next.x) {
      netChecked = true;
      const f = (TABLE.netX - pos.x) / (next.x - pos.x);
      const z = pos.z + (next.z - pos.z) * f;
      const y = pos.y + (next.y - pos.y) * f;
      const withinNet = Math.abs(y) <= TABLE.width / 2 + TABLE.netOverhang;
      netClearance = z - BALL.radius - TABLE.netHeight;
      if (withinNet && z - BALL.radius < TABLE.netHeight && z > -BALL.radius) {
        hitNet = true;
        const p = v(TABLE.netX, y, z);
        events.push({ kind: "net", t, p });
        points.push({ t, p });
        break;
      }
    }

    // 台面でのバウンド
    if (next.z < BALL.radius && pos.z >= BALL.radius && onTable(next)) {
      const p = v(next.x, next.y, BALL.radius);
      const half: TableHalf = next.x <= TABLE.netX ? "near" : "far";
      const r = tableBounce(vel, omega);
      vel = r.vel;
      omega = r.omega;
      pos = p;
      const after: BallState = { t, pos, vel, omega };
      bounces.push({ t, p, half, after });
      events.push({ kind: "bounce", t, p, half });
      points.push({ t, p });
      sampleAcc = 0;
      if (opts.recordFromBounce !== undefined && bounces.length - 1 === opts.recordFromBounce) recorded.push(after);
      if (bounces.length >= maxBounces) break;
      continue;
    }

    pos = next;
    if (opts.recordFromBounce !== undefined && bounces.length - 1 >= opts.recordFromBounce) {
      recorded.push({ t, pos, vel, omega });
    }
    sampleAcc += dt;
    if (sampleAcc >= 0.005) {
      points.push({ t, p: pos });
      sampleAcc = 0;
    }
    if (pos.z < -TABLE.heightFromFloor + BALL.radius) {
      events.push({ kind: "floor", t, p: pos });
      break;
    }
  }
  if (points[points.length - 1].t !== t) points.push({ t, p: pos });
  return { points, events, bounces, hitNet, netClearance, recorded, end: { t, pos, vel, omega } };
}

/**
 * ITTF の台の検査（30cm から落として何cm弾むか）を再現する。モデル検証用。
 * 戻り値は跳ね返りの最高点（台面からボール下端まで, m）。
 */
export function dropTestBounceHeight(dropHeight = 0.3, dt = 0.0005): number {
  let pos = v(1, 0, dropHeight + BALL.radius);
  let vel = v(0, 0, 0);
  const omega = v(0, 0, 0);
  let bounced = false;
  let peak = 0;
  for (let t = 0; t < 2; t += dt) {
    const step = rk4(pos, vel, omega, dt);
    if (!bounced && step.pos.z < BALL.radius) {
      vel = tableBounce(step.vel, omega).vel;
      pos = v(step.pos.x, step.pos.y, BALL.radius);
      bounced = true;
      continue;
    }
    pos = step.pos;
    vel = step.vel;
    if (bounced) {
      peak = Math.max(peak, pos.z - BALL.radius);
      if (vel.z < 0) break;
    }
  }
  return peak;
}

/** 時刻 t におけるボール位置（軌跡を線形補間）。 */
export function positionAt(points: TrajectoryPoint[], t: number): Vec3 {
  if (points.length === 0) return v(0, 0, 0);
  if (t <= points[0].t) return points[0].p;
  for (let i = 1; i < points.length; i++) {
    if (points[i].t >= t) {
      const a = points[i - 1];
      const b = points[i];
      const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
      return add(a.p, scale(sub(b.p, a.p), f));
    }
  }
  return points[points.length - 1].p;
}

/**
 * レシーバー側から見た座標への変換（台の中心を通る縦軸まわりの180°回転）。
 * 回転なので位置・速度・角速度のどれにも同じ形で使え、2回かけると元に戻る。
 */
export const mirrorPoint = (p: Vec3): Vec3 => v(TABLE.length - p.x, -p.y, p.z);
export const mirrorVector = (a: Vec3): Vec3 => v(-a.x, -a.y, a.z);
export const mirrorState = (s: BallState): BallState => ({
  t: s.t,
  pos: mirrorPoint(s.pos),
  vel: mirrorVector(s.vel),
  omega: mirrorVector(s.omega),
});

