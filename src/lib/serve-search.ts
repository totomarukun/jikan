// サーブの研究用の探索。
//   1) 逆算: 「相手の打球点でこの回転にしたい」→ そのサーブを出すスイングを探す
//   2) フォーム研究: 見た目（ラケットの動き）をほぼ変えずに、回転だけを大きく変える打ち方を探す
//   3) 見誤り探索: 2) の基準のフォームそのものも動かし、読み違えを生みやすいフォームをサーブの種類ごとに探す
//
// どちらも乱択 → 座標ごとの山登り。ブラウザを固めないよう、少しずつ await で手を離す。
import { JOINTS, SERVE_TYPES, type ServeType } from "./arm";
import { BLADE } from "./racket";
import { receiveState, simulateReceive, type ReceiveOutcome, type ReceiveTiming, type Technique } from "./receive";
import { PRESETS, breakdownSpin, simulateServe, type ServeParams, type SimResult, type SpinBreakdown } from "./serve-sim";
import { dot, norm, scale, sub, type Vec3 } from "./vec3";
import type { BallState } from "./flight";

/** 探索中は刻みを粗くして速くする（最後に細かい刻みで計算し直す）。 */
const COARSE = { dt: 0.003, contactDt: 6e-6 };

export function spinAtReceive(r: SimResult, timing: ReceiveTiming): { state: BallState; spin: SpinBreakdown } | null {
  const state = receiveState(r.receiverSide, timing);
  if (!state) return null;
  return { state, spin: breakdownSpin(state.omega, state.vel) };
}

/** 探索する変数（入れ子の関節角度も扱えるよう、読み書きの関数で持つ）。 */
type Range<T = ServeParams> = {
  get: (p: T) => number;
  set: (p: T, x: number) => T;
  min: number;
  max: number;
  step: number;
};

/** 関節角度（打球の瞬間 or 振り幅）を base のまわり ±span で、可動域の中だけ動かす。 */
function jointRanges(base: ServeParams, group: "contact" | "sweep", span: number, step: number): Range[] {
  return JOINTS.map((j) => {
    const c = base[group][j.key];
    const [lo, hi] = group === "contact" ? j.rom : [-120, 120];
    return {
      get: (p: ServeParams) => p[group][j.key],
      set: (p: ServeParams, x: number) => ({ ...p, [group]: { ...p[group], [j.key]: x } }),
      min: Math.max(lo, c - span),
      max: Math.min(hi, c + span),
      step,
    };
  });
}

type ScalarKey = "tempo" | "snapFlex" | "snapDev" | "snapPron" | "hitAlong" | "hitAcross" | "contactHeight" | "contactBehind" | "contactSide";

function scalarRange(key: ScalarKey, min: number, max: number, step: number): Range {
  return { get: (p) => p[key], set: (p, x) => ({ ...p, [key]: x }), min, max, step };
}

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
  /** 乱択に使う割合（残りは山登り） */
  randomShare?: number;
};

/** 乱択＋座標山登りの共通部分。cost は小さいほど良い。 */
async function optimize<T = ServeParams>(
  base: T,
  ranges: Range<T>[],
  cost: (p: T) => number,
  opts: SearchOpts,
): Promise<{ params: T; cost: number }[] | null> {
  const budget = opts.budget ?? 800;
  const rand = mulberry32(opts.seed ?? 20260927);
  let used = 0;
  const top: { params: T; cost: number }[] = [];
  const consider = async (params: T) => {
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
  const randomBudget = Math.floor(budget * (opts.randomShare ?? 0.55));
  while (used < randomBudget) {
    if (opts.isCancelled?.()) return null;
    let q = base;
    for (const r of ranges) q = r.set(q, r.min + rand() * (r.max - r.min));
    await consider(q);
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
            const p = r.set(cur, clamp(r.get(cur) + dir * r.step * shrink, r.min, r.max));
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
  // サーブの種類（体の使い方）は変えず、打球の瞬間の関節角度・振り幅・速さを可動域の中で動かす
  const ranges: Range[] = [
    ...jointRanges(base, "contact", 30, 6),
    ...jointRanges(base, "sweep", 40, 8),
    scalarRange("tempo", 0.035, 0.12, 0.005),
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

/** 打球から tau 秒ずれた瞬間の、2つのサーブの見た目の差（ラケット中心・先端・横の端と肘・手首の位置、面の向き）。 */
function differenceAt(a: SimResult, b: SimResult, tau: number) {
  // 相手に見えるのはラケットだけでなく腕も。ラケット（中心・先端・横の端）と肘・手首の位置を比べる
  const pts = (r: SimResult) => {
    const arm = r.racket.armAt(tau);
    const p = arm.racket;
    return {
      normal: p.normal,
      points: [
        p.center,
        sub(p.center, scale(p.handle, BLADE.halfLength)),
        add3(p.center, scale(p.side, BLADE.halfWidth)),
        arm.elbow,
        arm.wrist,
      ],
    };
  };
  const pa = pts(a);
  const pb = pts(b);
  const cm = pa.points.map((q, i) => norm(sub(q, pb.points[i])) * 100);
  const faceDeg = (Math.acos(Math.max(-1, Math.min(1, dot(pa.normal, pb.normal)))) * 180) / Math.PI;
  return { cm, faceDeg };
}

/** 2つのサーブの「相手から見えるラケットと腕の動き」がどれだけ違うか。 */
export function visibleDifference(a: SimResult, b: SimResult): VisibleDifference {
  let sum = 0;
  let max = 0;
  let face = 0;
  let n = 0;
  for (let tau = -VISIBLE_WINDOW_S; tau <= VISIBLE_WINDOW_S + 1e-9; tau += 0.005) {
    if (Math.abs(tau) < HIDDEN_WINDOW_S) continue;
    const d = differenceAt(a, b, tau);
    for (const x of d.cm) {
      sum += x;
      max = Math.max(max, x);
    }
    face += d.faceDeg;
    n++;
  }
  return { meanCm: sum / (n * 5), maxCm: max, faceDeg: face / n };
}

export type DifferenceSample = {
  /** 打球からの時間 (秒) */
  tau: number;
  /** ラケットと腕の位置のずれ（5点の平均, cm） */
  cm: number;
  /** 面の向きのずれ (度) */
  faceDeg: number;
  /** 相手が見分けにくいとみなして比較から除いた時間か */
  hidden: boolean;
};

/** 見た目の差を時間ごとに（グラフ用）。 */
export function differenceSeries(a: SimResult, b: SimResult, step = 0.0025): DifferenceSample[] {
  const out: DifferenceSample[] = [];
  for (let tau = -VISIBLE_WINDOW_S; tau <= VISIBLE_WINDOW_S + 1e-9; tau += step) {
    const d = differenceAt(a, b, tau);
    out.push({ tau, cm: d.cm.reduce((x, y) => x + y, 0) / d.cm.length, faceDeg: d.faceDeg, hidden: Math.abs(tau) < HIDDEN_WINDOW_S });
  }
  return out;
}

const add3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });

export type DisguiseMode = "more" | "less" | "any";

/**
 * 見誤り探索で最大化する「回転の違い」。上下の回転の違いを横回転の違いより重く見る【推定】。
 * このモデルで試すと、レシーブが崩れるかは主に上下の回転の読み違えで決まり、横回転だけの違いでは崩れにくかったため。
 */
const MISREAD_SIDE_WEIGHT = 0.5;

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

type PairRef = { a: SimResult; ra: NonNullable<ReturnType<typeof spinAtReceive>>; landA: Vec3 };

/** A（基準）に対する B の「回転の違い（gain）」と「見た目・軌道の差が上限を超えたぶん（over）」。 */
function comparePair(ref: PairRef, b: SimResult, timing: ReceiveTiming, mode: DisguiseMode | "misread", limits: DisguiseLimits) {
  const { a, ra, landA } = ref;
  const rb = spinAtReceive(b, timing);
  const landB = firstReceiverBounce(b);
  if (!b.legal || b.verdict !== a.verdict || !rb || !landB) return null;
  const gain =
    mode === "more"
      ? rb.spin.total - ra.spin.total
      : mode === "less"
        ? ra.spin.total - rb.spin.total
        : mode === "misread"
          ? Math.hypot(rb.spin.topBack - ra.spin.topBack, MISREAD_SIDE_WEIGHT * (rb.spin.side - ra.spin.side))
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

  // どれが「見えにくい」かは決め打ちせず、すべてを少しずつ動かして、見え方は visibleDifference で測る
  const ranges: Range[] = [
    ...jointRanges(base, "contact", 8, 2),
    ...jointRanges(base, "sweep", 15, 4),
    scalarRange("tempo", base.tempo * 0.85, base.tempo * 1.15, base.tempo * 0.05),
    scalarRange("snapFlex", -40, 40, 5),
    scalarRange("snapDev", -30, 30, 5),
    scalarRange("snapPron", -40, 40, 5),
    scalarRange("hitAlong", -0.05, 0.065, 0.01),
    scalarRange("hitAcross", -0.05, 0.05, 0.01),
  ];
  const ref: PairRef = { a, ra, landA };
  const measure = (b: SimResult) => comparePair(ref, b, timing, mode, limits);
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
export function roundParams(p: ServeParams): ServeParams {
  const r = (x: number, step: number) => Math.round(x / step) * step;
  const ra = (a: ServeParams["contact"]) =>
    Object.fromEntries(Object.entries(a).map(([k, x]) => [k, r(x, 1)])) as ServeParams["contact"];
  return {
    ...p,
    contact: ra(p.contact),
    sweep: ra(p.sweep),
    tempo: r(p.tempo, 0.001),
    snapFlex: r(p.snapFlex, 1),
    snapDev: r(p.snapDev, 1),
    snapPron: r(p.snapPron, 1),
    hitAlong: r(p.hitAlong, 0.005),
    hitAcross: r(p.hitAcross, 0.005),
  };
}

// ─────────────────────────────── 3) 見誤りを生みやすいフォーム ───────────────────────────────
//
// 「フォーム研究」は今のサーブ（A）を固定して B を探す。ここでは A そのもの（基本のフォーム）も動かし、
// 「見た目がほぼ同じ 2 本（A・B）で、相手の打球点での回転がいちばん違う組」をサーブの種類ごとに探す。
// 最後に、相手が片方だと思ってもう片方を受けたとき（読み違え）に実際にレシーブが崩れるかを計算して並べる。

/** B を A からどれだけ変えるか（差分）。見えにくいかどうかは決め打ちせず visibleDifference で測る。 */
type Delta = {
  contact: ServeParams["contact"];
  sweep: ServeParams["sweep"];
  tempoRatio: number;
  snapFlex: number;
  snapDev: number;
  snapPron: number;
  hitAlong: number;
  hitAcross: number;
};

type Pair = { a: ServeParams; d: Delta };

const zeroJoints = () => Object.fromEntries(JOINTS.map((j) => [j.key, 0])) as ServeParams["contact"];

function applyDelta(a: ServeParams, d: Delta): ServeParams {
  const add = (x: ServeParams["contact"], y: ServeParams["contact"]) =>
    Object.fromEntries(JOINTS.map((j) => [j.key, x[j.key] + y[j.key]])) as ServeParams["contact"];
  return {
    ...a,
    contact: add(a.contact, d.contact),
    sweep: add(a.sweep, d.sweep),
    tempo: a.tempo * d.tempoRatio,
    snapFlex: clamp(a.snapFlex + d.snapFlex, -40, 40),
    snapDev: clamp(a.snapDev + d.snapDev, -30, 30),
    snapPron: clamp(a.snapPron + d.snapPron, -40, 40),
    hitAlong: clamp(a.hitAlong + d.hitAlong, -0.06, 0.07),
    hitAcross: clamp(a.hitAcross + d.hitAcross, -0.06, 0.06),
  };
}

/**
 * A（基本のフォーム）と B（A からの差分）の探索範囲。
 * near: プリセットのまわりだけ。wide: 関節は可動域いっぱい近くまで、打点の位置・当てる位置も動かす。
 */
function pairRanges(base: ServeParams, wide: boolean): { aRanges: Range<Pair>[]; dRanges: Range<Pair>[] } {
  const aBase: Range[] = wide
    ? [
        ...jointRanges(base, "contact", 30, 6),
        ...jointRanges(base, "sweep", 40, 8),
        scalarRange("tempo", base.tempo * 0.75, base.tempo * 1.3, base.tempo * 0.05),
        scalarRange("contactHeight", 0.08, 0.35, 0.03),
        scalarRange("contactBehind", 0.05, 0.45, 0.04),
        scalarRange("contactSide", Math.max(-0.7, base.contactSide - 0.3), Math.min(0.7, base.contactSide + 0.3), 0.05),
        scalarRange("hitAlong", -0.05, 0.065, 0.01),
      ]
    : [
        ...jointRanges(base, "contact", 12, 3),
        ...jointRanges(base, "sweep", 18, 5),
        scalarRange("tempo", base.tempo * 0.8, base.tempo * 1.2, base.tempo * 0.05),
      ];
  const aRanges = aBase.map((r) => ({ ...r, get: (p: Pair) => r.get(p.a), set: (p: Pair, x: number) => ({ ...p, a: r.set(p.a, x) }) }));
  // B: A からの差分。「フォーム研究」と同じ幅（トス・打点の位置は相手に見えるので A と同じ）
  const dj = (group: "contact" | "sweep", span: number, step: number): Range<Pair>[] =>
    JOINTS.map((j) => ({
      get: (p: Pair) => p.d[group][j.key],
      set: (p: Pair, x: number) => ({ ...p, d: { ...p.d, [group]: { ...p.d[group], [j.key]: x } } }),
      min: -span,
      max: span,
      step,
    }));
  const ds = (key: Exclude<keyof Delta, "contact" | "sweep">, min: number, max: number, step: number): Range<Pair> => ({
    get: (p) => p.d[key],
    set: (p, x) => ({ ...p, d: { ...p.d, [key]: x } }),
    min,
    max,
    step,
  });
  const dRanges = [
    ...dj("contact", 8, 2),
    ...dj("sweep", 15, 4),
    ds("tempoRatio", 0.85, 1.15, 0.05),
    ds("snapFlex", -40, 40, 5),
    ds("snapDev", -30, 30, 5),
    ds("snapPron", -40, 40, 5),
    ds("hitAlong", -0.05, 0.05, 0.01),
    ds("hitAcross", -0.05, 0.05, 0.01),
  ];
  return { aRanges, dRanges };
}

/** 人が無理なく打てる姿勢か（関節が可動域の端に張り付かない・しゃがみ込みすぎない）。 */
function postureCost(r: SimResult) {
  return 20 * r.racket.clampedJoints.length + 500 * (Math.max(0, 0.03 - r.racket.crouch) + Math.max(0, r.racket.crouch - 0.45));
}

export type MisreadCheck = {
  technique: Technique;
  /** 本当は B、相手は A だと思って受けた */
  bReadAsA: ReceiveOutcome;
  /** B を B と正しく読んだ */
  bReadAsB: ReceiveOutcome;
  /** 本当は A、相手は B だと思って受けた */
  aReadAsB: ReceiveOutcome;
  /** A を A と正しく読んだ */
  aReadAsA: ReceiveOutcome;
};

export type DeceptionCandidate = {
  serveType: ServeType;
  length: "short" | "long";
  /** 下の checks を計算した相手の打つタイミング */
  timing: ReceiveTiming;
  /** 相手の打つタイミングごとの、読み違えで崩れた数（上位のみ） */
  byTiming?: TimingCheck[];
  /** 見た目の基準になるサーブ（A） */
  a: ServeParams;
  resultA: SimResult;
  /** A と見た目がほぼ同じで回転が違うサーブ（B）。「フォーム研究」と同じ形 */
  disguise: DisguiseResult;
  /** 相手の打球点での A と B の回転の差 (rps) */
  spinGap: number;
  checks: MisreadCheck[];
  /** 正しく読めば入るのに、読み違えると入らなかった数（A→B・B→A の両方向） */
  misreadFailures: number;
  /** 上の分母（正しく読めば入った数） */
  misreadChances: number;
};

/** 相手の技術の候補。短いサーブには払う・止める・はじく、長いサーブには打つ・はじく・払う。 */
export function techniquesFor(r: SimResult): Technique[] {
  return r.verdict === "long" ? ["drive", "flick", "push"] : ["push", "stop", "flick"];
}

/** 読み違え（A と思って B、B と思って A）で、正しく読めば入るレシーブがどれだけ崩れるか。 */
export async function misreadChecks(stateA: BallState, stateB: BallState, techniques: Technique[]) {
  const checks: MisreadCheck[] = [];
  for (const t of techniques) {
    await tick();
    checks.push({
      technique: t,
      bReadAsA: simulateReceive(stateB, t, stateA.omega).outcome,
      bReadAsB: simulateReceive(stateB, t, stateB.omega).outcome,
      aReadAsB: simulateReceive(stateA, t, stateB.omega).outcome,
      aReadAsA: simulateReceive(stateA, t, stateA.omega).outcome,
    });
  }
  let failures = 0;
  let chances = 0;
  for (const c of checks) {
    if (c.bReadAsB === "in") {
      chances++;
      if (c.bReadAsA !== "in") failures++;
    }
    if (c.aReadAsA === "in") {
      chances++;
      if (c.aReadAsB !== "in") failures++;
    }
  }
  return { checks, failures, chances };
}

type DeceptionOpts = SearchOpts & {
  types?: ServeType[];
  /** 1種類あたりの探索回数 */
  budgetPerType?: number;
  /** サーブの長さ（既定はショート） */
  length?: "short" | "long";
};

type PairSearch = {
  type: ServeType;
  length: "short" | "long";
  timing: ReceiveTiming;
  limits: DisguiseLimits;
  wide: boolean;
  budget: number;
  seed: number;
  onProgress: (f: number) => void;
  isCancelled?: () => boolean;
};

/**
 * 1つのサーブの種類・長さについて、見た目がほぼ同じで相手の打球点での回転がいちばん違う A・B の組を探し、
 * 上位 2 組の読み違えの影響を確かめて良いほうを返す。やめた場合は null、見つからなければ undefined。
 */
async function searchPair(q: PairSearch): Promise<DeceptionCandidate | null | undefined> {
  const preset = PRESETS.find((p) => p.params.serveType === q.type);
  if (!preset) return undefined;
  const { timing, limits, length } = q;
  // 粗い刻みでは上限の 9 割で見る（細かい刻みで計算し直したときに上限を超えないよう）
  const coarseLimits: DisguiseLimits = {
    visibleCm: limits.visibleCm * 0.9,
    visibleDeg: limits.visibleDeg * 0.9,
    landingCm: limits.landingCm * 0.9,
    netCm: limits.netCm * 0.9,
  };
  // A の計算は差分（B）だけ動かしている間は同じなので使い回す
  let lastA: ServeParams | null = null;
  let lastRef: PairRef | null = null;
  let lastACost = 0;
  const cost = (pair: Pair) => {
    if (pair.a !== lastA) {
      lastA = pair.a;
      const a = simulateServe(pair.a, COARSE.dt, COARSE.contactDt);
      const ra = spinAtReceive(a, timing);
      const landA = firstReceiverBounce(a);
      lastRef = a.legal && a.verdict === length && ra && landA ? { a, ra, landA } : null;
      lastACost = lastRef ? postureCost(a) + Math.max(0, 0.015 - (a.netClearance ?? 0)) * 500 : 0;
    }
    if (!lastRef) return 2000;
    const b = simulateServe(applyDelta(pair.a, pair.d), COARSE.dt, COARSE.contactDt);
    const m = comparePair(lastRef, b, timing, "misread", coarseLimits);
    if (!m) return 1000;
    return -m.gain + m.over + lastACost + postureCost(b);
  };
  const start: Pair = {
    a: preset.params,
    d: { contact: zeroJoints(), sweep: zeroJoints(), tempoRatio: 1, snapFlex: 0, snapDev: 0, snapPron: 0, hitAlong: 0, hitAcross: 0 },
  };
  const { aRanges, dRanges } = pairRanges(preset.params, q.wide);
  const zero = start.d;
  const rand = mulberry32(q.seed);
  let pool: { params: Pair; cost: number }[] = [];

  if (q.wide) {
    // 広く探すとき: ① 入る A（この長さのサーブになるフォーム）をいくつか見つける
    const starts: Pair[] = [];
    if (cost(start) < 1000) starts.push(start);
    for (let i = 0; i < 400 && starts.length < 5; i++) {
      if (i % 40 === 0) {
        if (q.isCancelled?.()) return null;
        q.onProgress((0.05 * i) / 400);
        await tick();
      }
      let a = start;
      for (const r of aRanges) a = r.set(a, r.min + rand() * (r.max - r.min));
      if (cost(a) < 1000) starts.push(a);
    }
    if (starts.length === 0) return undefined;
    // ② それぞれで B の差分を軽く探して見込みを比べ、③ 見込みのある 2 つを深く探す（B → A → B）
    const screenBudget = Math.floor(q.budget * 0.08);
    const screened: { params: Pair; cost: number }[] = [];
    for (const [i, st] of starts.entries()) {
      const r = await optimize(st, dRanges, cost, {
        budget: screenBudget,
        randomShare: 0.5,
        seed: q.seed + 100 + i,
        isCancelled: q.isCancelled,
        onProgress: (f) => q.onProgress((0.05 + ((i + f) / starts.length) * 0.35) * 0.8),
      });
      if (!r) return null;
      screened.push(r[0]);
    }
    screened.sort((x, y) => x.cost - y.cost);
    const deep = screened.slice(0, 2);
    const each = (q.budget * 0.6) / deep.length;
    for (const [di, d0] of deep.entries()) {
      let cur = [d0];
      const stages = [
        { ranges: dRanges, share: 0.4, random: 0.3 },
        { ranges: aRanges, share: 0.3, random: 0.2 },
        { ranges: dRanges, share: 0.3, random: 0.2 },
      ];
      let done = 0;
      for (const [si, st] of stages.entries()) {
        const r = await optimize(cur[0].params, st.ranges, cost, {
          budget: Math.floor(each * st.share),
          randomShare: st.random,
          seed: q.seed + 200 + di * 10 + si,
          isCancelled: q.isCancelled,
          onProgress: (f) => q.onProgress((0.4 + ((di + done + f * st.share) / deep.length) * 0.6) * 0.8),
        });
        if (!r) return null;
        done += st.share;
        cur = [...cur, ...r].sort((x, y) => x.cost - y.cost);
      }
      pool.push(...cur.slice(0, 2));
    }
    pool.sort((x, y) => x.cost - y.cost);
  } else {
    // プリセットのまわり: B の差分 → A のフォーム → B の差分 と交互に探す
    const stages = [
      { ranges: dRanges, share: 0.4, random: 0.5 },
      { ranges: aRanges, share: 0.3, random: 0.2 },
      { ranges: dRanges, share: 0.3, random: 0.2 },
    ];
    pool = [{ params: { ...start, d: zero }, cost: cost(start) }];
    let done = 0;
    for (const [si, st] of stages.entries()) {
      const r = await optimize(pool[0].params, st.ranges, cost, {
        budget: Math.floor(q.budget * st.share),
        randomShare: st.random,
        seed: q.seed + si,
        isCancelled: q.isCancelled,
        onProgress: (f) => q.onProgress((done + f * st.share) * 0.8),
      });
      if (!r) return null;
      done += st.share;
      pool = [...pool, ...r].sort((x, y) => x.cost - y.cost).slice(0, 4);
    }
  }

  // 細かい刻みで計算し直し、上位 2 組について読み違えの影響を確かめる
  const fine: { a: ServeParams; resultA: SimResult; d: DisguiseResult; score: number }[] = [];
  for (const cand of pool) {
    const a = roundParams(cand.params.a);
    const resultA = simulateServe(a);
    const ra = spinAtReceive(resultA, timing);
    const landA = firstReceiverBounce(resultA);
    if (!resultA.legal || resultA.verdict !== length || !ra || !landA) continue;
    const params = roundParams(applyDelta(a, cand.params.d));
    const b = simulateServe(params);
    const m = comparePair({ a: resultA, ra, landA }, b, timing, "misread", limits);
    if (!m) continue;
    fine.push({
      a,
      resultA,
      score: -m.gain + m.over + postureCost(resultA) + postureCost(b),
      d: {
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
      },
    });
  }
  fine.sort((x, y) => x.score - y.score);
  let best: DeceptionCandidate | undefined;
  for (const [i, f] of fine.slice(0, 2).entries()) {
    if (q.isCancelled?.()) return null;
    const mc = await misreadChecks(f.d.stateA, f.d.stateB, techniquesFor(f.resultA));
    q.onProgress(0.8 + 0.1 * (i + 1));
    const cand: DeceptionCandidate = {
      serveType: q.type,
      length,
      timing,
      a: f.a,
      resultA: f.resultA,
      disguise: f.d,
      spinGap: Math.hypot(f.d.spinB.topBack - f.d.spinA.topBack, f.d.spinB.side - f.d.spinA.side),
      checks: mc.checks,
      misreadFailures: mc.failures,
      misreadChances: mc.chances,
    };
    if (!best || compareDeception(cand, best) < 0) best = cand;
  }
  q.onProgress(1);
  return best;
}

/**
 * サーブの種類ごとに「見た目がほぼ同じで、相手の打球点での回転がいちばん違う A・B の組」を
 * プリセットのまわりで探し、読み違えでレシーブが崩れる数 → 回転の差 の順に並べる。
 */
export async function searchMostDeceptive(
  timing: ReceiveTiming,
  limits: DisguiseLimits = DEFAULT_LIMITS,
  opts: DeceptionOpts = {},
): Promise<DeceptionCandidate[] | null> {
  const types = opts.types ?? SERVE_TYPES.map((t) => t.id);
  const out: DeceptionCandidate[] = [];
  for (const [ti, type] of types.entries()) {
    const c = await searchPair({
      type,
      length: opts.length ?? "short",
      timing,
      limits,
      wide: false,
      budget: opts.budgetPerType ?? 1200,
      seed: (opts.seed ?? 20260927) + ti * 10,
      onProgress: (f) => opts.onProgress?.((ti + f) / types.length),
      isCancelled: opts.isCancelled,
    });
    if (c === null) return null;
    if (c) out.push(c);
  }
  return out.sort(compareDeception);
}

export type TimingCheck = { timing: ReceiveTiming; failures: number; chances: number };

type GlobalOpts = SearchOpts & {
  /** 1回（サーブの種類 × 長さ）あたりの探索回数 */
  budgetPerRun?: number;
  types?: ServeType[];
  lengths?: ("short" | "long")[];
  /** 相手の3つの打つタイミングすべてで確かめる上位の数 */
  robustTop?: number;
  /** 途中経過（見つかった順） */
  onPartial?: (list: DeceptionCandidate[]) => void;
  /** 前に探した結果。種類 × 長さごとに良いほうを残す（探すたびに結果を積み上げる） */
  previous?: DeceptionCandidate[];
};

/** 頂点での読み違えだけで比べる（別々に探した結果を合わせるとき用）。 */
function compareAtApex(x: DeceptionCandidate, y: DeceptionCandidate) {
  return compareDeception({ ...x, byTiming: undefined }, { ...y, byTiming: undefined });
}

function mergeBest(list: DeceptionCandidate[], c: DeceptionCandidate) {
  const i = list.findIndex((x) => x.serveType === c.serveType && x.length === c.length);
  if (i < 0) list.push(c);
  else if (compareAtApex(c, list[i]) < 0) list[i] = c;
}

/**
 * 今のサーブを使わずに、見誤りがいちばん大きくなるサーブを探す。
 * サーブの種類 5 × 長さ 2 のそれぞれで、フォーム・打点の位置まで広く動かして A・B の組を探し、
 * 読み違えでレシーブが崩れる割合で並べる。上位は相手の打つタイミング（早め・頂点・遅め）すべてで確かめ直す。
 */
export async function searchMostDeceptiveOverall(
  limits: DisguiseLimits = DEFAULT_LIMITS,
  opts: GlobalOpts = {},
): Promise<DeceptionCandidate[] | null> {
  const types = opts.types ?? SERVE_TYPES.map((t) => t.id);
  const lengths = opts.lengths ?? ["short", "long"];
  const runs = types.flatMap((type) => lengths.map((length) => ({ type, length })));
  const robustTop = opts.robustTop ?? 3;
  // 進み具合: 探索 85%、タイミング別の確かめ 15%
  const searchShare = robustTop > 0 ? 0.85 : 1;
  const found: DeceptionCandidate[] = [...(opts.previous ?? [])];
  for (const [i, run] of runs.entries()) {
    const c = await searchPair({
      ...run,
      timing: "apex",
      limits,
      wide: true,
      budget: opts.budgetPerRun ?? 1000,
      seed: (opts.seed ?? 20260927) + i * 10,
      onProgress: (f) => opts.onProgress?.(((i + f) / runs.length) * searchShare),
      isCancelled: opts.isCancelled,
    });
    if (c === null) return null;
    if (c) {
      mergeBest(found, c);
      found.sort(compareDeception);
      opts.onPartial?.([...found]);
    }
  }
  // 上位は、相手が早め・遅めに打った場合でも読み違えで崩れるかを確かめる（頂点の結果は計算済み）
  found.sort(compareAtApex);
  const top = found.slice(0, robustTop);
  for (const [i, c] of top.entries()) {
    if (c.byTiming) continue;
    const byTiming: TimingCheck[] = [{ timing: "apex", failures: c.misreadFailures, chances: c.misreadChances }];
    for (const timing of ["rising", "falling"] as const) {
      if (opts.isCancelled?.()) return null;
      const sa = receiveState(c.resultA.receiverSide, timing);
      const sb = receiveState(c.disguise.result.receiverSide, timing);
      if (!sa || !sb) continue;
      const mc = await misreadChecks(sa, sb, techniquesFor(c.resultA));
      byTiming.push({ timing, failures: mc.failures, chances: mc.chances });
    }
    top[i] = { ...c, byTiming };
    opts.onProgress?.(searchShare + ((1 - searchShare) * (i + 1)) / top.length);
  }
  // 確かめ直した上位から外れた組は、頂点の結果だけで並べる
  const rest = found.slice(robustTop).map((c) => (c.byTiming ? { ...c, byTiming: undefined } : c));
  top.sort(compareDeception);
  const out = [...top, ...rest];
  opts.onProgress?.(1);
  return out;
}

/** 並べ順: 上限を守れた組 → 読み違えで崩れた割合 → 回転の差。 */
export function compareDeception(x: DeceptionCandidate, y: DeceptionCandidate) {
  if (x.disguise.withinLimits !== y.disguise.withinLimits) return x.disguise.withinLimits ? -1 : 1;
  // 3つのタイミングで確かめた組どうしはその合計で、そうでなければ頂点で比べる
  const both = x.byTiming && y.byTiming;
  const rate = (c: DeceptionCandidate) => {
    const list = both ? c.byTiming! : [{ failures: c.misreadFailures, chances: c.misreadChances }];
    const ch = list.reduce((s, t) => s + t.chances, 0);
    return ch ? list.reduce((s, t) => s + t.failures, 0) / ch : 0;
  };
  if (rate(x) !== rate(y)) return rate(y) - rate(x);
  return y.spinGap - x.spinGap;
}
