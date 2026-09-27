// サーブ解析シミュレーター（卓球）の物理エンジン。
//
// 座標系（メートル・秒）:
//   x = 台の長手方向。0 = サーバー側エンドライン、TABLE.length = 相手側エンドライン
//   y = 左右。+ = サーバーから見て左
//   z = 高さ。0 = 台の上面
//
// 物理モデルの出典（MODEL_SOURCES にも同じ内容を持ち、画面に表示する）:
//   - 飛行・台バウンド: Dürr et al., "Outplaying elite table tennis players with an
//     autonomous robot", Nature 652 (2026) の Methods（トップ選手と対戦したロボット Ace の
//     学習用シミュレーター）。空気抵抗 c_d=0.55、速度/回転比に依存するマグヌス係数、
//     台の反発 ε=0.98−0.02·v_z、摩擦 μ=0.25、滑り/転がりの切り替え。
//   - ラケット: Ace と同じ撃力モデルの形。ただし論文はラバーの係数を公開していないため、
//     反発の速度依存（衝突速度 1m/s あたり約 0.019 低下, ISJOS v15）以外は推定値。
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

const G = 9.81;
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
// ITTF: トスは手のひらから 16cm 以上
export const MIN_TOSS = 0.16;

const AREA = Math.PI * BALL.radius ** 2;
const K_DRAG = (0.5 * AIR_DENSITY * DRAG_COEF * AREA) / BALL.mass;
const K_MAGNUS_BASE = ((4 / 3) * Math.PI * AIR_DENSITY * BALL.radius ** 3) / BALL.mass;
// 中空球の慣性モーメント係数（I = 2/3 m r²）
const INERTIA_FACTOR = 2 / 3;

/** Ace: 台の反発係数は衝突速度で下がる（v_z は m/s の大きさ）。 */
export function tableRestitution(vzIn: number) {
  return Math.min(0.98, Math.max(0.5, 0.98 - 0.02 * Math.abs(vzIn)));
}

/** ラバーの反発係数。衝突速度 1m/s あたり 0.019 下がる（ISJOS v15, 1.4〜20.2m/s で線形）。 */
export function racketRestitution(base: number, vnIn: number) {
  return Math.max(0.3, base - 0.019 * Math.abs(vnIn));
}

export type Vec3 = { x: number; y: number; z: number };

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const add = (a: Vec3, b: Vec3) => v(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a: Vec3, b: Vec3) => v(a.x - b.x, a.y - b.y, a.z - b.z);
const scale = (a: Vec3, s: number) => v(a.x * s, a.y * s, a.z * s);
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3) =>
  v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const norm = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
const rad = (deg: number) => (deg * Math.PI) / 180;

/** 画面に出すモデルの根拠。status: sourced = 論文・規格の値 / estimated = 推定値。 */
export const MODEL_SOURCES: { part: string; detail: string; source: string; status: "sourced" | "estimated" }[] = [
  {
    part: "空気抵抗",
    detail: "抗力係数 0.55・空気密度 1.204kg/m³",
    source: "Dürr et al., Nature 652 (2026) Methods",
    status: "sourced",
  },
  {
    part: "回転による曲がり（マグヌス力）",
    detail: "c_M = 0.1·|v|/(r|ω|) − 0.001（速度と回転の比で変わる）",
    source: "Dürr et al., Nature 652 (2026) Methods",
    status: "sourced",
  },
  {
    part: "低回転（ナックル付近）の曲がり",
    detail: "回転比に比例して0に近づくよう補正（上の式はプロのラリーで同定されたため）",
    source: "野球ボールの低回転域の近似（Sawicki et al., 2003）を流用",
    status: "estimated",
  },
  {
    part: "台でのバウンド",
    detail: "反発 0.98 − 0.02·v_z、摩擦 0.25、滑り/転がりの切り替え",
    source: "Dürr et al., Nature 652 (2026) Methods ／ ITTF の台の検査（30cm→約23〜26cm）で検証",
    status: "sourced",
  },
  {
    part: "ラバーの反発の速度依存",
    detail: "衝突が速いほど反発が下がる（1m/s あたり 0.019）",
    source: "Impact Velocity and COR of a Table Tennis Ball, ISJOS v15",
    status: "sourced",
  },
  {
    part: "ラバーごとの反発・摩擦の基準値",
    detail: "テンション/粘着/表/粒高の数値そのもの",
    source: "公開値が見つからず推定（Ace の論文もラバー係数は非公開）",
    status: "estimated",
  },
  {
    part: "較正の基準",
    detail: "プリセットの回転数をプロの試合の実測に合わせた",
    source: "Tamaki & Yoshida (2025), Tリーグのサーブ 1773本",
    status: "sourced",
  },
];

export type RubberType = "tension" | "tacky" | "shortPips" | "longPips";

// 用具の「面の性質」を2値に落としたもの。製品名ではなく一般的な傾向。
export const RUBBERS: Record<
  RubberType,
  { label: string; restitution: number; friction: number; note: string }
> = {
  tension: {
    label: "裏ソフト（テンション系）",
    restitution: 0.85,
    friction: 0.9,
    note: "よく弾み、よく引っかかる（数値は推定）",
  },
  tacky: {
    label: "裏ソフト（粘着系）",
    restitution: 0.75,
    friction: 1.1,
    note: "弾みは控えめ、回転がかけやすい（数値は推定）",
  },
  shortPips: {
    label: "表ソフト",
    restitution: 0.85,
    friction: 0.5,
    note: "弾くが回転はかかりにくい（数値は推定）",
  },
  longPips: {
    label: "粒高",
    restitution: 0.6,
    friction: 0.25,
    note: "自分からは回転がかかりにくい（数値は推定）",
  },
};

export type ServeParams = {
  /** トスの高さ（手のひら=台面の高さから, m） */
  tossHeight: number;
  /** 打点の高さ（台面から, m） */
  contactHeight: number;
  /** 打点の前後位置（エンドラインからの距離, m。後ろが正） */
  contactBehind: number;
  /** 打点の左右位置（台の中心線から, m。左が正） */
  contactSide: number;
  /** スイングの速さ (m/s) */
  swingSpeed: number;
  /** スイングの上下方向 (度)。+ = 上向き（こすり上げ）、- = 下向き（切り下ろし） */
  swingPitch: number;
  /** スイングの左右方向 (度)。+ = 左へ振る、- = 右へ振る */
  swingYaw: number;
  /** ラケット面の上下角度 (度)。0 = 垂直、+ = 上向き（開く）、- = 下向き（かぶせる） */
  faceTilt: number;
  /** ラケット面の左右向き (度)。+ = 左を向く、- = 右を向く */
  faceYaw: number;
  rubber: RubberType;
};

export type SpinBreakdown = {
  /** 総回転数 (rps) */
  total: number;
  /** 上回転(+)/下回転(-) 成分 (rps) */
  topBack: number;
  /** 横回転成分 (rps)。+ = 左へ曲がる、- = 右へ曲がる */
  side: number;
  /** ジャイロ（進行方向軸）成分 (rps) */
  gyro: number;
  label: string;
};

export type ContactInfo = {
  hit: boolean;
  /** 打球直後の球速 (m/s) */
  ballSpeed: number;
  spin: SpinBreakdown;
  /** ボール上の接触位置（ラケット面の法線の逆向き）: 真下からの角度・左右 */
  contactOnBall: { fromBottomDeg: number; sideDeg: number };
  /** 摩擦が足りずにラバー上を滑ったか（=回転が頭打ち） */
  slipped: boolean;
  /** 打球直後の打ち出し角（水平から, 度） */
  launchAngle: number;
};

export type TrajectoryEvent =
  | { kind: "contact"; t: number; p: Vec3 }
  | { kind: "bounce"; t: number; p: Vec3; side: "own" | "opponent" }
  | { kind: "net"; t: number; p: Vec3 }
  | { kind: "floor"; t: number; p: Vec3 };

export type TrajectoryPoint = { t: number; p: Vec3 };

export type Verdict =
  | "short" // 相手コートで2バウンド（台上で止まる短いサーブ）
  | "long" // 相手コートに1バウンドして台から出る
  | "net"
  | "missOwn" // 自コートに落ちない
  | "missOpponent" // 相手コートに入らない
  | "whiff"; // ラケットに当たらない

export type SimResult = {
  params: ServeParams;
  contact: ContactInfo;
  points: TrajectoryPoint[];
  events: TrajectoryEvent[];
  verdict: Verdict;
  verdictLabel: string;
  legal: boolean;
  /** ネット上を通過したときの高さ（ネット上端からの余裕, m） */
  netClearance: number | null;
  /** 相手コートでの2バウンド目の位置（相手エンドラインからの距離, m。負 = 台の外） */
  secondBounceFromEnd: number | null;
  /** 相手コート1バウンド目の直後の回転 */
  spinAtOpponent: SpinBreakdown | null;
  warnings: string[];
  contactTime: number;
};

// プリセットは実測に合わせて較正: Tリーグのサーブ（Tamaki & Yoshida 2025, 1773本）の
// 回転数の中央値は ショート 46.4rps（男子）/38.9rps（女子）、ロング 50.9/47.6rps。
export const DEFAULT_PARAMS: ServeParams = {
  tossHeight: 0.4,
  contactHeight: 0.18,
  contactBehind: 0.2,
  contactSide: 0.35,
  swingSpeed: 9,
  swingPitch: -10,
  swingYaw: -5,
  faceTilt: 80,
  faceYaw: 0,
  rubber: "tension",
};

export const PRESETS: { id: string; label: string; params: ServeParams }[] = [
  {
    id: "backspin-short",
    label: "下回転ショート",
    params: DEFAULT_PARAMS,
  },
  {
    id: "side-back",
    label: "横下回転",
    params: {
      ...DEFAULT_PARAMS,
      swingSpeed: 8,
      swingPitch: -5,
      swingYaw: -45,
      faceTilt: 56,
      faceYaw: 30,
      contactSide: 0.45,
    },
  },
  {
    id: "knuckle",
    label: "ナックル（無回転系）",
    params: {
      ...DEFAULT_PARAMS,
      swingSpeed: 2,
      swingPitch: 0,
      faceTilt: 44,
    },
  },
  {
    id: "topspin-long",
    label: "上回転ロング",
    params: {
      ...DEFAULT_PARAMS,
      contactHeight: 0.14,
      swingSpeed: 10,
      swingPitch: 25,
      faceTilt: -40,
    },
  },
];

/** 実測の比較基準（Tリーグのサーブの回転数・中央値, rps）。 */
export const PRO_SERVE_SPIN = {
  short: { men: 46.4, women: 38.9 },
  long: { men: 50.9, women: 47.6 },
} as const;

function toRps(omega: number) {
  return omega / (2 * Math.PI);
}

/** 回転ベクトルを「上下回転 / 横回転 / ジャイロ」に分解する。 */
export function breakdownSpin(omega: Vec3, vel: Vec3): SpinBreakdown {
  const speed2d = Math.hypot(vel.x, vel.y);
  // 進行方向（水平面内）。止まっていれば +x とみなす
  const fwd = speed2d > 1e-6 ? v(vel.x / speed2d, vel.y / speed2d, 0) : v(1, 0, 0);
  // 進行方向の左
  const left = v(-fwd.y, fwd.x, 0);
  const topBack = toRps(dot(omega, left));
  const side = toRps(omega.z);
  const gyro = toRps(dot(omega, fwd));
  const total = toRps(norm(omega));
  return { total, topBack, side, gyro, label: spinLabel(topBack, side, gyro, total) };
}

function spinLabel(topBack: number, side: number, gyro: number, total: number) {
  if (total < 5) return "ナックル（ほぼ無回転）";
  const parts: string[] = [];
  const main = Math.max(Math.abs(topBack), Math.abs(side), Math.abs(gyro));
  if (Math.abs(side) >= main * 0.4) parts.push("横");
  if (Math.abs(topBack) >= main * 0.4) parts.push(topBack > 0 ? "上" : "下");
  if (parts.length === 0) return "ジャイロ回転";
  return `${parts.join("")}回転`;
}

/** ラケット面の法線（面が向いている方向の単位ベクトル）。 */
export function faceNormal(p: ServeParams): Vec3 {
  const t = rad(p.faceTilt);
  const y = rad(p.faceYaw);
  return v(Math.cos(t) * Math.cos(y), Math.cos(t) * Math.sin(y), Math.sin(t));
}

/** スイング方向の単位ベクトル。 */
export function swingDirection(p: ServeParams): Vec3 {
  const ph = rad(p.swingPitch);
  const yw = rad(p.swingYaw);
  return v(Math.cos(ph) * Math.cos(yw), Math.cos(ph) * Math.sin(yw), Math.sin(ph));
}

/**
 * 接触面での衝突（法線方向は反発係数、接線方向は摩擦の上限つきで「転がり」に向かう）。
 * surfaceVel = 接触面の速度、n = 接触面から球へ向く法線。
 * Ace の台/ラケット接触モデル（滑り: α=μ(1+ε)v_n/|v_T|、転がり: α=2/5）と同じ式を
 * 撃力の形で書いたもの。restitution は衝突速度（法線方向の大きさ）の関数。
 */
function collide(
  vel: Vec3,
  omega: Vec3,
  n: Vec3,
  surfaceVel: Vec3,
  restitution: (normalSpeed: number) => number,
  friction: number,
) {
  const rel = sub(vel, surfaceVel);
  const un = dot(rel, n);
  if (un >= 0) return null; // 近づいていない
  const jn = BALL.mass * (1 + restitution(-un)) * -un;
  const rc = scale(n, -BALL.radius); // 球の中心から接触点
  const relT = sub(rel, scale(n, un));
  const slip = add(relT, cross(omega, rc));
  const slipMag = norm(slip);
  // 滑りをゼロにする撃力: 中空球では J = -(2/5) m s
  let jt = scale(slip, -(2 / 5) * BALL.mass);
  let slipped = false;
  if (norm(jt) > friction * jn && slipMag > 0) {
    jt = scale(slip, (-friction * jn) / slipMag);
    slipped = true;
  }
  const inertia = INERTIA_FACTOR * BALL.mass * BALL.radius ** 2;
  const newVel = add(vel, scale(add(scale(n, jn), jt), 1 / BALL.mass));
  const newOmega = add(omega, scale(cross(rc, jt), 1 / inertia));
  return { vel: newVel, omega: newOmega, slipped };
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
function rk4(pos: Vec3, vel: Vec3, omega: Vec3, dt: number) {
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

function inOwnCourt(p: Vec3) {
  return p.x >= 0 && p.x <= TABLE.netX && Math.abs(p.y) <= TABLE.width / 2;
}
function inOpponentCourt(p: Vec3) {
  return p.x > TABLE.netX && p.x <= TABLE.length && Math.abs(p.y) <= TABLE.width / 2;
}
function onTable(p: Vec3) {
  return p.x >= 0 && p.x <= TABLE.length && Math.abs(p.y) <= TABLE.width / 2;
}

const VERDICT_LABEL: Record<Verdict, string> = {
  short: "入った：相手コートで2バウンド（短いサーブ）",
  long: "入った：台から出る（長いサーブ）",
  net: "ネットにかかった",
  missOwn: "自コートに落ちなかった",
  missOpponent: "相手コートに入らなかった",
  whiff: "ラケットに当たらない（面とスイングの向きを見直す）",
};

export function simulateServe(params: ServeParams, dt = 0.001): SimResult {
  const rubber = RUBBERS[params.rubber];
  const warnings: string[] = [];
  if (params.tossHeight < MIN_TOSS) {
    warnings.push("トスが16cm未満（ルール違反）");
  }
  if (params.contactHeight > params.tossHeight) {
    warnings.push("打点がトスの頂点より高い（届かない高さ）");
  }
  if (params.contactHeight < BALL.radius) {
    warnings.push("打点が台面より低い（ルール違反）");
  }
  if (params.contactBehind < 0) {
    warnings.push("打点がエンドラインより前（ルール違反）");
  }

  // トス: 手のひら(台面の高さ)から真上に投げ、頂点から落ちてきたところを打つ
  const toss = Math.max(params.tossHeight, params.contactHeight);
  const upV = Math.sqrt(2 * G * toss);
  const tossPath: TrajectoryPoint[] = [];
  const start = v(-params.contactBehind, params.contactSide, 0);
  const tApex = upV / G;
  const tDrop = Math.sqrt((2 * (toss - params.contactHeight)) / G);
  const contactTime = tApex + tDrop;
  for (let t = 0; t < contactTime; t += 0.01) {
    tossPath.push({ t, p: v(start.x, start.y, upV * t - 0.5 * G * t * t) });
  }
  const contactPos = v(start.x, start.y, params.contactHeight);
  const inVel = v(0, 0, -G * tDrop);

  const n = faceNormal(params);
  const hitRes = collide(
    inVel,
    v(0, 0, 0),
    n,
    scale(swingDirection(params), params.swingSpeed),
    (vn) => racketRestitution(rubber.restitution, vn),
    rubber.friction,
  );

  const nb = scale(n, -1);
  const contactOnBall = {
    fromBottomDeg: (Math.acos(Math.max(-1, Math.min(1, -nb.z))) * 180) / Math.PI,
    sideDeg: (Math.atan2(nb.y, -nb.x) * 180) / Math.PI,
  };

  const events: TrajectoryEvent[] = [{ kind: "contact", t: contactTime, p: contactPos }];

  if (!hitRes) {
    const zero = breakdownSpin(v(0, 0, 0), v(1, 0, 0));
    return {
      params,
      contact: { hit: false, ballSpeed: 0, spin: zero, contactOnBall, slipped: false, launchAngle: 0 },
      points: [...tossPath, { t: contactTime, p: contactPos }],
      events,
      verdict: "whiff",
      verdictLabel: VERDICT_LABEL.whiff,
      legal: false,
      netClearance: null,
      secondBounceFromEnd: null,
      spinAtOpponent: null,
      warnings,
      contactTime,
    };
  }

  let pos = contactPos;
  let vel = hitRes.vel;
  let omega = hitRes.omega;
  const contact: ContactInfo = {
    hit: true,
    ballSpeed: norm(vel),
    spin: breakdownSpin(omega, vel),
    contactOnBall,
    slipped: hitRes.slipped,
    launchAngle: (Math.atan2(vel.z, Math.hypot(vel.x, vel.y)) * 180) / Math.PI,
  };

  const points: TrajectoryPoint[] = [...tossPath, { t: contactTime, p: pos }];
  let t = contactTime;
  let netClearance: number | null = null;
  let netChecked = false;
  let spinAtOpponent: SpinBreakdown | null = null;
  const bounces: { side: "own" | "opponent" | "off"; p: Vec3 }[] = [];
  let hitNet = false;
  let sampleAcc = 0;
  const maxT = contactTime + 3;

  while (t < maxT) {
    const step = rk4(pos, vel, omega, dt);
    const next = step.pos;
    vel = step.vel;
    t += dt;

    // ネット面（x = netX）の通過判定
    if (!netChecked && pos.x < TABLE.netX && next.x >= TABLE.netX) {
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
      const side = next.x <= TABLE.netX ? "own" : "opponent";
      const r = collide(vel, omega, v(0, 0, 1), v(0, 0, 0), tableRestitution, TABLE_FRICTION);
      if (r) {
        vel = r.vel;
        omega = r.omega;
      }
      bounces.push({ side, p });
      events.push({ kind: "bounce", t, p, side });
      if (side === "opponent" && !spinAtOpponent) spinAtOpponent = breakdownSpin(omega, vel);
      pos = p;
      points.push({ t, p });
      sampleAcc = 0;
      if (bounces.length >= 3) break;
      continue;
    }

    pos = next;
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

  let verdict: Verdict;
  const [b1, b2, b3] = bounces;
  if (hitNet) verdict = "net";
  else if (!b1 || b1.side !== "own" || !inOwnCourt(b1.p)) verdict = "missOwn";
  else if (!b2 || b2.side !== "opponent" || !inOpponentCourt(b2.p)) verdict = "missOpponent";
  else if (b3 && b3.side === "opponent") verdict = "short";
  else verdict = "long";

  let secondBounceFromEnd: number | null = null;
  if (verdict === "short" && b3) secondBounceFromEnd = TABLE.length - b3.p.x;
  if (verdict === "long") secondBounceFromEnd = -1;

  const ruleOk = !warnings.some((w) => w.includes("ルール違反"));
  return {
    params,
    contact,
    points,
    events,
    verdict,
    verdictLabel: VERDICT_LABEL[verdict],
    legal: ruleOk && (verdict === "short" || verdict === "long"),
    netClearance,
    secondBounceFromEnd,
    spinAtOpponent,
    warnings,
    contactTime,
  };
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
      const r = collide(step.vel, omega, v(0, 0, 1), v(0, 0, 0), tableRestitution, TABLE_FRICTION);
      vel = r ? r.vel : step.vel;
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

/** 結果から、次に何を変えるとよいかの手がかりを文章で返す（断定しすぎない表現にする）。 */
export function serveInsights(r: SimResult): string[] {
  const out: string[] = [];
  const cm = (m: number) => Math.round(m * 100);
  const bounces = r.events.filter((e) => e.kind === "bounce");
  switch (r.verdict) {
    case "whiff":
      out.push("面の向きとスイングの向きが離れすぎて、ボールに当たっていません。面が向いている側へ振る成分が必要です。");
      break;
    case "net":
      out.push("ネットにかかりました。面を少し開く・スイングを少し上向きにする・スイングを速くする、のどれかで越えやすくなります。");
      break;
    case "missOwn":
      out.push(
        bounces.length === 0 || bounces[0].p.x > TABLE.netX
          ? "自コートに落ちる前に相手側へ飛んでいます。スイングを遅くするか、面を立てて打ち出しを低くしてみてください。"
          : "自コートの外に落ちています。打点の左右位置やスイングの左右方向を見直してください。",
      );
      break;
    case "missOpponent":
      out.push("自コートには入りましたが、相手コートに入りませんでした。長すぎる場合はスイングを遅く、横に切れる場合は左右の向きを調整します。");
      break;
    case "short":
      if (r.secondBounceFromEnd !== null) {
        out.push(`相手コートで2バウンドします。2バウンド目はエンドラインから約${cm(r.secondBounceFromEnd)}cm手前です。`);
      }
      break;
    case "long":
      out.push("相手コートに1バウンドして台の外へ出ます。長いサーブとして使うなら、深さとスピードが鍵になります。");
      break;
  }
  if (r.netClearance !== null && r.verdict !== "net" && r.netClearance > 0.12) {
    out.push(`ネットの上を約${cm(r.netClearance)}cm通過しています。高く浮くサーブは相手に強く打たれやすくなります。`);
  }
  if (r.contact.hit && r.contact.slipped) {
    out.push("ボールがラバーの上で滑っています（摩擦の上限）。ここから回転を増やすには、スイングを速くするか摩擦の大きいラバーが有効です。");
  }
  if (r.contact.hit && r.contact.spin.total > 5 && r.spinAtOpponent) {
    const drop = 1 - r.spinAtOpponent.total / r.contact.spin.total;
    if (drop > 0.25) {
      out.push(`台でのバウンドで回転が約${Math.round(drop * 100)}%減っています。相手が受けるのはバウンド後の回転です。`);
    }
  }
  return out;
}
