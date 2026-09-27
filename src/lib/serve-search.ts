// サーブの研究用の探索。
//   1) 逆算: 「相手の打球点でこの回転にしたい」→ そのサーブを出すスイングを探す
//   2) フォーム研究: 見た目（ラケットの動き）をほぼ変えずに、回転だけを大きく変える打ち方を探す
//
// どちらも乱択 → 座標ごとの山登り。ブラウザを固めないよう、少しずつ await で手を離す。
import { BLADE } from "./racket";
import { receiveState, type ReceiveTiming } from "./receive";
import { breakdownSpin, simulateServe, type ServeParams, type SimResult, type SpinBreakdown } from "./serve-sim";
import { dot, norm, scale, sub, type Vec3 } from "./vec3";
import type { BallState } from "./flight";

/** 探索中は刻みを粗くして速くする（最後に細かい刻みで計算し直す）。 */
const COARSE = { dt: 0.003, contactDt: 6e-6 };

export function spinAtReceive(r: SimResult, timing: ReceiveTiming): { state: BallState; spin: SpinBreakdown } | null {
  const state = receiveState(r.receiverSide, timing);
  if (!state) return null;
  return { state, spin: breakdownSpin(state.omega, state.vel) };
}

type Range = { key: keyof ServeParams; min: number; max: number; step: number };

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

type SearchOpts = {
  budget?: number;
  onProgress?: (fraction: number) => void;
  isCancelled?: () => boolean;
  seed?: number;
};

/** 乱択＋座標山登りの共通部分。cost は小さいほど良い。 */
async function optimize(
  base: ServeParams,
  ranges: Range[],
  cost: (p: ServeParams) => number,
  opts: SearchOpts,
): Promise<{ params: ServeParams; cost: number }[] | null> {
  const budget = opts.budget ?? 800;
  const rand = mulberry32(opts.seed ?? 20260927);
  let used = 0;
  const top: { params: ServeParams; cost: number }[] = [];
  const consider = async (params: ServeParams) => {
    const c = cost(params);
    used++;
    top.push({ params, cost: c });
    top.sort((a, b) => a.cost - b.cost);
    if (top.length > 4) top.pop();
    if (used % 20 === 0) {
      opts.onProgress?.(Math.min(1, used / budget));
      await tick();
    }
    return c;
  };

  await consider(base);
  const randomBudget = Math.floor(budget * 0.55);
  while (used < randomBudget) {
    if (opts.isCancelled?.()) return null;
    const p = { ...base };
    for (const r of ranges) (p[r.key] as number) = r.min + rand() * (r.max - r.min);
    await consider(p);
  }
  // 上位から山登り（刻みを半分にしながら）
  for (const start of [...top]) {
    let cur = start.params;
    let curCost = start.cost;
    for (const shrink of [1, 0.5, 0.25]) {
      let improved = true;
      while (improved && used < budget) {
        improved = false;
        for (const r of ranges) {
          for (const dir of [1, -1]) {
            if (opts.isCancelled?.()) return null;
            const p = { ...cur, [r.key]: clamp((cur[r.key] as number) + dir * r.step * shrink, r.min, r.max) };
            const c = await consider(p);
            if (c < curCost) {
              cur = p;
              curCost = c;
              improved = true;
            }
          }
        }
      }
    }
  }
  opts.onProgress?.(1);
  return top;
}

// ─────────────────────────────── 1) 逆算 ───────────────────────────────

export type SpinTarget = {
  /** 相手の打球点での上回転(+)/下回転(−) (rps) */
  topBack: number;
  /** 相手の打球点での横回転 (rps)。+ = サーバーから見て左へ曲がる */
  side: number;
  length: "short" | "long";
  timing: ReceiveTiming;
};

export type ServeSearchResult = {
  params: ServeParams;
  result: SimResult;
  spin: SpinBreakdown;
  /** 狙った回転からのずれ (rps) */
  error: number;
};

function targetCost(r: SimResult, target: SpinTarget) {
  if (!r.contact.hit) return 2000;
  if (!r.legal) return 1000;
  if (r.verdict !== target.length) return 500;
  const rs = spinAtReceive(r, target.timing);
  if (!rs) return 800;
  const err = Math.hypot(rs.spin.topBack - target.topBack, rs.spin.side - target.side);
  const clr = r.netClearance ?? 0;
  // 同じ回転なら低く通るサーブを優先。ただしネットすれすれ（刻みしだいで入らない）は避ける
  return err + 30 * Math.max(0, clr - 0.05) + 500 * Math.max(0, 0.015 - clr);
}

/** 相手の打球点で狙った回転になるサーブを探す（トス・打点・グリップ・当てる位置は base のまま）。 */
export async function searchServeForSpin(
  target: SpinTarget,
  base: ServeParams,
  opts: SearchOpts = {},
): Promise<ServeSearchResult | null> {
  const ranges: Range[] = [
    { key: "faceTilt", min: -70, max: 89, step: 8 },
    { key: "faceYaw", min: -50, max: 50, step: 8 },
    { key: "swingSpeed", min: 1, max: 14, step: 1 },
    { key: "swingPitch", min: -45, max: 45, step: 8 },
    { key: "swingYaw", min: -70, max: 70, step: 10 },
    { key: "forearmRoll", min: -1500, max: 1500, step: 200 },
  ];
  const top = await optimize(
    base,
    ranges,
    (p) => targetCost(simulateServe(p, COARSE.dt, COARSE.contactDt), target),
    { budget: 900, ...opts },
  );
  if (!top) return null;
  // 粗い刻みで良かった候補を、細かい刻みで計算し直して一番良いものを採る
  let out: ServeSearchResult | null = null;
  let outCost = Infinity;
  for (const cand of top) {
    const params = roundParams(cand.params);
    const result = simulateServe(params);
    const rs = spinAtReceive(result, target.timing);
    const c = targetCost(result, target);
    if (rs && c < outCost) {
      outCost = c;
      out = { params, result, spin: rs.spin, error: Math.hypot(rs.spin.topBack - target.topBack, rs.spin.side - target.side) };
    }
  }
  return out;
}

// ─────────────────────────────── 2) フォーム研究 ───────────────────────────────

/** 相手から見えるとみなすラケットの動きの範囲（打球の前後 ±0.1秒）。 */
export const VISIBLE_WINDOW_S = 0.1;
/**
 * 打球の前後この時間のラケットの動きは、相手には見分けにくいとみなす【仮定】。
 * 人の目で打球の瞬間の細部を追えない、という前提を置いた値で、実験で決めた値ではない。
 */
export const HIDDEN_WINDOW_S = 0.02;

export type VisibleDifference = {
  /** ラケット（中心・先端・横の端）の位置のずれの平均 (cm) */
  meanCm: number;
  /** 同じく最大 (cm) */
  maxCm: number;
  /** 面の向きのずれの平均 (度) */
  faceDeg: number;
};

/** 2つのサーブの「相手から見えるラケットの動き」がどれだけ違うか。 */
export function visibleDifference(a: SimResult, b: SimResult): VisibleDifference {
  let sum = 0;
  let max = 0;
  let face = 0;
  let n = 0;
  const pts = (r: SimResult, tau: number) => {
    const p = r.racket.poseAt(tau);
    return {
      normal: p.normal,
      points: [p.center, sub(p.center, scale(p.handle, BLADE.halfLength)), add3(p.center, scale(p.side, BLADE.halfWidth))],
    };
  };
  for (let tau = -VISIBLE_WINDOW_S; tau <= VISIBLE_WINDOW_S + 1e-9; tau += 0.005) {
    if (Math.abs(tau) < HIDDEN_WINDOW_S) continue;
    const pa = pts(a, tau);
    const pb = pts(b, tau);
    for (let i = 0; i < pa.points.length; i++) {
      const d = norm(sub(pa.points[i], pb.points[i])) * 100;
      sum += d;
      max = Math.max(max, d);
    }
    face += (Math.acos(Math.max(-1, Math.min(1, dot(pa.normal, pb.normal)))) * 180) / Math.PI;
    n++;
  }
  return { meanCm: sum / (n * 3), maxCm: max, faceDeg: face / n };
}

const add3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });

export type DisguiseMode = "more" | "less" | "any";

export const DISGUISE_MODES: { id: DisguiseMode; label: string }[] = [
  { id: "any", label: "回転を変える（向きも含む）" },
  { id: "less", label: "回転を減らす（ナックル寄り）" },
  { id: "more", label: "回転を増やす" },
];

export type DisguiseLimits = {
  /** 見た目の差（ラケット位置のずれの平均）の上限 (cm) */
  visibleCm: number;
  /** 見た目の差（面の向きのずれの平均）の上限 (度) */
  visibleDeg: number;
  /** 相手コートでの1バウンド目の位置のずれの上限 (cm)。軌道で見抜かれないように */
  landingCm: number;
  /** ネット上を通る高さの差の上限 (cm)。山なりの違いで見抜かれないように */
  netCm: number;
};

export const DEFAULT_LIMITS: DisguiseLimits = { visibleCm: 1.5, visibleDeg: 6, landingCm: 20, netCm: 5 };

export type DisguiseResult = {
  params: ServeParams;
  result: SimResult;
  visible: VisibleDifference;
  spinA: SpinBreakdown;
  spinB: SpinBreakdown;
  stateA: BallState;
  stateB: BallState;
  /** 相手コートでの1バウンド目の位置のずれ (cm)。軌道で見抜かれにくいか */
  landingGapCm: number;
  /** ネット上の高さの差 (cm) */
  netGapCm: number;
  /** 上限をすべて守れたか */
  withinLimits: boolean;
};

function firstReceiverBounce(r: SimResult) {
  return r.events.find((e) => e.kind === "bounce" && e.side === "opponent")?.p ?? null;
}

/**
 * base と見た目の差が上限以内のまま、相手の打球点での回転がなるべく違うサーブを探す。
 * どの要素が「見えにくいか」は決め打ちせず、ラケットのすべての要素を少しずつ動かし、
 * 見えるかどうかは visibleDifference（打球前後 ±0.1秒のラケットの動きの差）で測る。
 */
export async function searchDisguise(
  base: ServeParams,
  timing: ReceiveTiming,
  mode: DisguiseMode,
  limits: DisguiseLimits = DEFAULT_LIMITS,
  opts: SearchOpts = {},
): Promise<DisguiseResult | null> {
  const a = simulateServe(base);
  const ra = spinAtReceive(a, timing);
  const landA = firstReceiverBounce(a);
  if (!a.legal || !ra || !landA) return null;
  const totalA = ra.spin.total;

  const ranges: Range[] = [
    { key: "faceTilt", min: base.faceTilt - 8, max: Math.min(89, base.faceTilt + 8), step: 2 },
    { key: "faceYaw", min: base.faceYaw - 8, max: base.faceYaw + 8, step: 2 },
    { key: "swingSpeed", min: base.swingSpeed * 0.8, max: base.swingSpeed * 1.2, step: base.swingSpeed * 0.05 },
    { key: "swingPitch", min: base.swingPitch - 8, max: base.swingPitch + 8, step: 2 },
    { key: "swingYaw", min: base.swingYaw - 8, max: base.swingYaw + 8, step: 2 },
    { key: "forearmRoll", min: -1500, max: 1500, step: 250 },
    { key: "hitAlong", min: -0.05, max: 0.065, step: 0.01 },
    { key: "hitAcross", min: -0.05, max: 0.05, step: 0.01 },
    { key: "snapBrush", min: -4, max: 4, step: 0.5 },
    { key: "snapPush", min: -2, max: 3, step: 0.5 },
  ];
  const measure = (b: SimResult) => {
    const rb = spinAtReceive(b, timing);
    const landB = firstReceiverBounce(b);
    if (!b.legal || b.verdict !== a.verdict || !rb || !landB) return null;
    const gain =
      mode === "more"
        ? rb.spin.total - totalA
        : mode === "less"
          ? totalA - rb.spin.total
          : Math.hypot(rb.spin.topBack - ra.spin.topBack, rb.spin.side - ra.spin.side);
    const vis = visibleDifference(a, b);
    const landingGapCm = Math.hypot(landB.x - landA.x, landB.y - landA.y) * 100;
    const netGapCm = Math.abs((b.netClearance ?? 0) - (a.netClearance ?? 0)) * 100;
    // ネットすれすれは計算の刻みしだいで入ったり入らなかったりするので避ける
    const edge = Math.max(0, 0.015 - (b.netClearance ?? 0)) * 500;
    const over =
      edge +
      Math.max(0, vis.meanCm - limits.visibleCm) * 20 +
      Math.max(0, vis.faceDeg - limits.visibleDeg) * 5 +
      Math.max(0, landingGapCm - limits.landingCm) * 1 +
      Math.max(0, netGapCm - limits.netCm) * 3;
    return { rb, landB, gain, vis, landingGapCm, netGapCm, over };
  };
  const cost = (p: ServeParams) => {
    const m = measure(simulateServe(p, COARSE.dt, COARSE.contactDt));
    if (!m) return 1000;
    return -m.gain + m.over;
  };
  const top = await optimize(base, ranges, cost, { budget: 900, ...opts });
  if (!top) return null;
  // 細かい刻みで計算し直して、条件を満たす中で一番良いものを採る
  let pick: { params: ServeParams; b: SimResult; m: NonNullable<ReturnType<typeof measure>> } | null = null;
  for (const cand of [...top, { params: base, cost: 0 }]) {
    const params = roundParams(cand.params);
    const b = simulateServe(params);
    const m = measure(b);
    if (m && (!pick || -m.gain + m.over < -pick.m.gain + pick.m.over)) pick = { params, b, m };
  }
  if (!pick) return null;
  const { params, b, m } = pick;
  return {
    params,
    result: b,
    visible: m.vis,
    spinA: ra.spin,
    spinB: m.rb.spin,
    stateA: ra.state,
    stateB: m.rb.state,
    landingGapCm: m.landingGapCm,
    netGapCm: m.netGapCm,
    withinLimits: m.over < 1e-9,
  };
}

/** スライダーで扱いやすい刻みに丸める。 */
function roundParams(p: ServeParams): ServeParams {
  const r = (x: number, step: number) => Math.round(x / step) * step;
  return {
    ...p,
    faceTilt: r(p.faceTilt, 1),
    faceYaw: r(p.faceYaw, 1),
    swingSpeed: r(p.swingSpeed, 0.1),
    swingPitch: r(p.swingPitch, 1),
    swingYaw: r(p.swingYaw, 1),
    forearmRoll: r(p.forearmRoll, 10),
    hitAlong: r(p.hitAlong, 0.005),
    hitAcross: r(p.hitAcross, 0.005),
    snapBrush: r(p.snapBrush ?? 0, 0.1),
    snapPush: r(p.snapPush ?? 0, 0.1),
  };
}
