// サーブ解析シミュレーター（卓球）の物理エンジン。
//
// 座標系（メートル・秒）:
//   x = 台の長手方向。0 = サーバー側エンドライン、TABLE.length = 相手側エンドライン
//   y = 左右。+ = サーバーから見て左
//   z = 高さ。0 = 台の上面
//
// 物理モデルの出典（MODEL_SOURCES にも同じ内容を持ち、画面に表示する）:
//   - 飛行・台バウンド: flight.ts（卓球ロボット Ace の公開モデル, Nature 2026）
//   - ラケットの動きとラバーとの接触: racket.ts（接触を 1µs 刻みで時間分解）
//   ラバーは裏ソフト（テンション系）1種類に固定している。
import {
  BALL,
  TABLE,
  flyBall,
  type BallState,
  type TrajectoryPoint,
} from "./flight";
import {
  buildRacketKinematics,
  faceNormalOf,
  simulateRacketContact,
  swingDirectionOf,
  type ContactResult,
  type RacketKinematics,
  type RacketMotionParams,
  type RubberContactProps,
} from "./racket";
import { dot, norm, scale, sub, v, type Vec3 } from "./vec3";

export {
  BALL,
  TABLE,
  dropTestBounceHeight,
  magnusCoefficient,
  positionAt,
  tableRestitution,
  type BallState,
  type TrajectoryPoint,
} from "./flight";
export type { Vec3 } from "./vec3";
export { racketRestitution } from "./racket";

const G = 9.81;
// ITTF: トスは手のひらから 16cm 以上
export const MIN_TOSS = 0.16;

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
    part: "ボールがラバーに触れている時間",
    detail: "約1ms（押す方向はばね＋ダンパー、1マイクロ秒刻みで計算）",
    source: "広く引用される値。硬いガラス板で約0.6ms（Phys. Rev. E のボール座屈実験）",
    status: "estimated",
  },
  {
    part: "ラバーのたわみによる回転の上乗せ",
    detail: "表面が横にたわんで戻る力で、転がり以上に回る（over-spin）",
    source: "現象は Rinaldi et al., Applied Sciences (2019) が実験で確認。強さ（横/縦の硬さ比 0.67）は弾性理論（Mindlin）からの推定",
    status: "estimated",
  },
  {
    part: "ラケットの動き",
    detail: "手首まわりの弧＋前腕のひねり＋柄方向の押し出しを持つ剛体",
    source: "運動学のモデル（関節の角度や筋力は扱わない）",
    status: "estimated",
  },
  {
    part: "手首のスナップ",
    detail: "打球の前後 約12ms だけの速い動き（腕の動きとは別）。前腕のひねりも約20msの短い動き",
    source: "動きの長さは推定（手首が打球の瞬間に最も速く動くという一般的な知見に合わせた形）",
    status: "estimated",
  },
  {
    part: "相手のレシーブ",
    detail: "読んだ回転で、入る角度（ネット上 5cm 以上の余裕）にラケットを合わせ、その角度のまま実際のボールを打つ",
    source: "各技術の標準的なスイング速さ・向きと安全の余裕は推定。打球の物理はサーブと同じモデル",
    status: "estimated",
  },
  {
    part: "見た目の差",
    detail: "打球の前後 ±0.1秒のラケットの位置・面の向きの差。ただし ±20ms は相手が見分けにくいとして除外",
    source: "±20ms は仮定（人の目で打球の瞬間の細部を追いにくいという前提。実験で決めた値ではない）",
    status: "estimated",
  },
  {
    part: "裏ソフトの反発・摩擦の基準値",
    detail: "反発 0.85（低速時）・摩擦 0.9",
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

/** 裏ソフト（テンション系）。反発の速度依存以外の数値は推定。 */
export const RUBBER: RubberContactProps & { label: string } = {
  label: "裏ソフト（テンション系）",
  restitution: 0.85,
  friction: 0.9,
  contactTime: 0.001,
};

export type ServeParams = RacketMotionParams & {
  /** トスの高さ（手のひら=台面の高さから, m） */
  tossHeight: number;
  /** 打点の高さ（台面から, m） */
  contactHeight: number;
  /** 打点の前後位置（エンドラインからの距離, m。後ろが正） */
  contactBehind: number;
  /** 打点の左右位置（台の中心線から, m。左が正） */
  contactSide: number;
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
  /** ボールがラバーに触れていた約1msの中身（時間分解した接触計算） */
  impact: ContactResult | null;
};

export type TrajectoryEvent =
  | { kind: "contact"; t: number; p: Vec3 }
  | { kind: "bounce"; t: number; p: Vec3; side: "own" | "opponent" }
  | { kind: "net"; t: number; p: Vec3 }
  | { kind: "floor"; t: number; p: Vec3 };


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
  /** ボールがラケットに触れた時刻（トス開始から, 秒） */
  contactTime: number;
  /** ラケットの剛体運動（描画用） */
  racket: RacketKinematics;
  /** 相手コートで1バウンドした後のボールの状態（毎ms）。レシーブの打球点を選ぶのに使う */
  receiverSide: BallState[];
};

// プリセットは実測に合わせて較正: Tリーグのサーブ（Tamaki & Yoshida 2025, 1773本）の
// 回転数の中央値は ショート 46.4rps（男子）/38.9rps（女子）、ロング 50.9/47.6rps。
export const DEFAULT_PARAMS: ServeParams = {
  tossHeight: 0.4,
  contactHeight: 0.18,
  contactBehind: 0.2,
  contactSide: 0.35,
  swingSpeed: 6,
  swingPitch: -5,
  swingYaw: -5,
  faceTilt: 86,
  faceYaw: 0,
  gripAngle: 45,
  arcRadius: 0.4,
  forearmRoll: 0,
  hitAlong: 0.03,
  hitAcross: 0,
  snapBrush: 0,
  snapPush: 0,
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
      swingSpeed: 6,
      swingPitch: -5,
      swingYaw: -45,
      faceTilt: 58,
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
      swingPitch: -5,
      faceTilt: 42,
    },
  },
  {
    id: "topspin-long",
    label: "上回転ロング",
    params: {
      ...DEFAULT_PARAMS,
      contactHeight: 0.14,
      swingSpeed: 6,
      swingPitch: 10,
      faceTilt: -34,
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
export const faceNormal = (p: ServeParams): Vec3 => faceNormalOf(p);

/** スイング方向の単位ベクトル。 */
export const swingDirection = (p: ServeParams): Vec3 => swingDirectionOf(p);

function inOwnCourt(p: Vec3) {
  return p.x >= 0 && p.x <= TABLE.netX && Math.abs(p.y) <= TABLE.width / 2;
}
function inOpponentCourt(p: Vec3) {
  return p.x > TABLE.netX && p.x <= TABLE.length && Math.abs(p.y) <= TABLE.width / 2;
}

const VERDICT_LABEL: Record<Verdict, string> = {
  short: "入った：相手コートで2バウンド（短いサーブ）",
  long: "入った：台から出る（長いサーブ）",
  net: "ネットにかかった",
  missOwn: "自コートに落ちなかった",
  missOpponent: "相手コートに入らなかった",
  whiff: "ラケットに当たらない（面とスイングの向きを見直す）",
};

/**
 * サーブを計算する。dt は飛行の刻み、contactDt はラバーとの接触の刻み（探索では粗くして速くする）。
 */
export function simulateServe(params: ServeParams, dt = 0.001, contactDt = 1e-6): SimResult {
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
  const racket = buildRacketKinematics(params, sub(contactPos, scale(n, BALL.radius)));
  const impact = simulateRacketContact(racket, RUBBER, contactPos, inVel, v(0, 0, 0), contactDt);

  const nb = scale(n, -1);
  const contactOnBall = {
    fromBottomDeg: (Math.acos(Math.max(-1, Math.min(1, -nb.z))) * 180) / Math.PI,
    sideDeg: (Math.atan2(nb.y, -nb.x) * 180) / Math.PI,
  };

  const events: TrajectoryEvent[] = [{ kind: "contact", t: contactTime, p: contactPos }];

  if (!impact.hit) {
    const zero = breakdownSpin(v(0, 0, 0), v(1, 0, 0));
    return {
      params,
      contact: {
        hit: false,
        ballSpeed: 0,
        spin: zero,
        contactOnBall,
        slipped: false,
        launchAngle: 0,
        impact: null,
      },
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
      racket,
      receiverSide: [],
    };
  }

  const vel = impact.vel;
  const contact: ContactInfo = {
    hit: true,
    ballSpeed: norm(vel),
    spin: breakdownSpin(impact.omega, vel),
    contactOnBall,
    slipped: impact.slipFraction > 0.5,
    launchAngle: (Math.atan2(vel.z, Math.hypot(vel.x, vel.y)) * 180) / Math.PI,
    impact,
  };

  // 打球後の飛行。自コート→相手コート→（短ければ）相手コート2バウンド目まで
  const flight = flyBall(
    { t: contactTime + impact.duration, pos: impact.exitPos, vel, omega: impact.omega },
    { dt, maxBounces: 3, recordFromBounce: 1 },
  );
  const points: TrajectoryPoint[] = [...tossPath, { t: contactTime, p: contactPos }, ...flight.points];
  for (const e of flight.events) {
    if (e.kind === "bounce") events.push({ kind: "bounce", t: e.t, p: e.p, side: e.half === "near" ? "own" : "opponent" });
    else events.push(e);
  }
  const bounces = flight.bounces.map((b) => ({ side: b.half === "near" ? "own" : "opponent", p: b.p }));
  const hitNet = flight.hitNet;
  const netClearance = flight.netClearance;
  const b2 = flight.bounces[1];
  const spinAtOpponent = b2 && b2.half === "far" ? breakdownSpin(b2.after.omega, b2.after.vel) : null;
  // 相手コートでの1バウンド後（2バウンド目 or 台から出るまで）の状態
  const receiverSide = b2 && b2.half === "far" ? flight.recorded : [];

  let verdict: Verdict;
  const [b1, bb2, b3] = bounces;
  if (hitNet) verdict = "net";
  else if (!b1 || b1.side !== "own" || !inOwnCourt(b1.p)) verdict = "missOwn";
  else if (!bb2 || bb2.side !== "opponent" || !inOpponentCourt(bb2.p)) verdict = "missOpponent";
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
    racket,
    receiverSide,
  };
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
  const impact = r.contact.impact;
  if (impact && impact.slipFraction > 0.8) {
    out.push(
      "接触中ずっとラバーの上で滑っています。滑っている間の回転は「摩擦 × 押す力」で決まるので、こする速さを上げるより、少し厚く当てて押す力を増やすか、摩擦の大きいラバーの方が効きます。",
    );
  } else if (impact && impact.slipFraction < 0.3 && impact.overspinRatio > 1.2) {
    out.push(
      `ラバーがボールに食いついています。たわんだラバーが戻る力で、転がりの約${impact.overspinRatio.toFixed(1)}倍の回転になっています。`,
    );
  }
  // 柄の方向に押し出すスイングでは手首の弧が使えず、先端に当てても速くならない
  if (impact && r.params.swingSpeed > 1 && norm(r.racket.pivotVel) > 0.8 * r.params.swingSpeed) {
    out.push("柄の方向に押し出すスイングになっています。グリップの向きを変えて柄と直交する方向に振ると、手首の弧で先端が速く動きます。");
  }
  if (r.contact.hit && r.contact.spin.total > 5 && r.spinAtOpponent) {
    const drop = 1 - r.spinAtOpponent.total / r.contact.spin.total;
    if (drop > 0.25) {
      out.push(`台でのバウンドで回転が約${Math.round(drop * 100)}%減っています。相手が受けるのはバウンド後の回転です。`);
    }
  }
  return out;
}
