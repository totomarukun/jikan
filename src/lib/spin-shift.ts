// 回転の変化探索: 打球したときの回転（スイングから相手が思い描く回転）と、
// 相手のラケットに届くときの回転とで、回転の「向き」が大きく変わるサーブを探す。
//
// 回転の向きは、ボールの進行方向を基準にした 3 成分で表す（breakdownSpin と同じ）:
//   上下（上回転+ / 下回転−）・横（縦軸まわり。+ = 受け手から見て右へ曲がる）・ジャイロ（進行方向の軸まわり）
// 向きが変わる仕組み（このモデルで起きること）:
//   - 台でのバウンド: 摩擦で上下・ジャイロの成分が変わる（縦軸まわりの横回転はほぼ変わらない。Ace の接触モデル）
//   - 進行方向の変化: 回転軸は空中ではほぼ一定なので、ボールが曲がる・跳ねる向きが変わると成分の割合が入れ替わる
//   - 空気による減衰（すべての成分が同じ割合で減る）
import { SERVE_TYPES, type ServeType } from "./arm";
import { flyBall, type BallState } from "./flight";
import type { ReceiveTiming } from "./receive";
import {
  COARSE,
  jointRanges,
  mulberry32,
  optimize,
  postureCost,
  roundParams,
  scalarRange,
  spinAtReceive,
  tick,
  type Range,
  type SearchOpts,
} from "./serve-search";
import { PRESETS, breakdownSpin, simulateServe, type ServeParams, type SimResult, type SpinBreakdown } from "./serve-sim";

export type SpinKind = "any" | "back" | "top" | "sideR" | "sideL" | "gyro";

export const SPIN_KINDS: { id: SpinKind; label: string }[] = [
  { id: "any", label: "なんでも" },
  { id: "back", label: "下回転" },
  { id: "top", label: "上回転" },
  { id: "sideR", label: "横（受け手の右へ曲がる）" },
  { id: "sideL", label: "横（受け手の左へ曲がる）" },
  { id: "gyro", label: "ジャイロ" },
];

type V3 = [number, number, number];

/** 回転の向き（上下・横・ジャイロの単位ベクトル）。回転がほぼないときは null。 */
export function spinDirection(s: SpinBreakdown): V3 | null {
  const n = Math.hypot(s.topBack, s.side, s.gyro);
  return n < 1e-6 ? null : [s.topBack / n, s.side / n, s.gyro / n];
}

const KIND_DIR: Record<Exclude<SpinKind, "any">, V3> = {
  back: [-1, 0, 0],
  top: [1, 0, 0],
  sideR: [0, 1, 0],
  sideL: [0, -1, 0],
  gyro: [0, 0, 1],
};

const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** 回転がその種類にどれだけ近いか（0〜1）。ジャイロは軸の向き（前後）を問わない。 */
export function kindMatch(s: SpinBreakdown, kind: SpinKind): number {
  if (kind === "any") return 1;
  const d = spinDirection(s);
  if (!d) return 0;
  const u: V3 = kind === "gyro" ? [d[0], d[1], Math.abs(d[2])] : d;
  return Math.max(0, dot3(u, KIND_DIR[kind]));
}

/** 2つの回転の向きの違い (度)。 */
export function spinAngle(a: SpinBreakdown, b: SpinBreakdown): number {
  const da = spinDirection(a);
  const db = spinDirection(b);
  if (!da || !db) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, dot3(da, db)))) * 180) / Math.PI;
}

/** 探すサーブのネットの上の高さの上限 (m)。実戦で使える低さの目安【仮定】。 */
export const MAX_NET_M = 0.2;

export type SpinShiftQuery = {
  /** 打球したときの回転（相手がスイングから思い描く回転） */
  from: SpinKind;
  /** 相手のラケットに届くときの回転 */
  to: SpinKind;
  /** 届くときの回転がこれより少ないと「向き」に意味がないので対象外 (rps) */
  minRps: number;
  timing: ReceiveTiming;
};

export const DEFAULT_SHIFT_QUERY: SpinShiftQuery = { from: "any", to: "any", minRps: 10, timing: "apex" };

/** 回転の変化の点数: 向きの違い(度) × 打球時・到達時が指定の種類にどれだけ近いか。 */
export function shiftScore(s0: SpinBreakdown, s1: SpinBreakdown, q: SpinShiftQuery) {
  return spinAngle(s0, s1) * kindMatch(s0, q.from) * kindMatch(s1, q.to);
}

export type SpinShiftCandidate = {
  serveType: ServeType;
  length: "short" | "long";
  params: ServeParams;
  result: SimResult;
  /** 打球直後の回転 */
  contactSpin: SpinBreakdown;
  /** 相手の打球点での回転 */
  receiveSpin: SpinBreakdown;
  receiveState: BallState;
  /** 回転の向きの違い (度) */
  angleDeg: number;
  score: number;
};

function measure(r: SimResult, q: SpinShiftQuery, length: "short" | "long") {
  if (!r.legal || r.verdict !== length) return null;
  const rs = spinAtReceive(r, q.timing);
  if (!rs) return null;
  const s0 = r.contact.spin;
  const s1 = rs.spin;
  const score = shiftScore(s0, s1, q);
  const cost =
    -score +
    10 * Math.max(0, q.minRps - s1.total) +
    10 * Math.max(0, 10 - s0.total) +
    postureCost(r) +
    500 * Math.max(0, 0.015 - (r.netClearance ?? 0)) +
    // 山なりに高く上げるサーブは実戦では打たれてしまうので、ネットの上 MAX_NET_M までに抑える
    300 * Math.max(0, (r.netClearance ?? 0) - MAX_NET_M);
  return { rs, s0, s1, score, cost };
}

function wideRanges(base: ServeParams): Range[] {
  return [
    ...jointRanges(base, "contact", 30, 6),
    ...jointRanges(base, "sweep", 40, 8),
    scalarRange("tempo", base.tempo * 0.6, base.tempo * 1.4, base.tempo * 0.05),
    scalarRange("snapFlex", -40, 40, 5),
    scalarRange("snapDev", -30, 30, 5),
    scalarRange("snapPron", -40, 40, 5),
    scalarRange("hitAlong", -0.05, 0.065, 0.01),
    scalarRange("hitAcross", -0.05, 0.05, 0.01),
    scalarRange("contactHeight", 0.08, 0.35, 0.03),
    scalarRange("contactBehind", 0.05, 0.45, 0.04),
    scalarRange("contactSide", Math.max(-0.7, base.contactSide - 0.3), Math.min(0.7, base.contactSide + 0.3), 0.05),
  ];
}

type ShiftRun = {
  type: ServeType;
  length: "short" | "long";
  q: SpinShiftQuery;
  budget: number;
  seed: number;
  onProgress: (f: number) => void;
  isCancelled?: () => boolean;
};

/** 1つのサーブの種類・長さで探す。やめたら null、入るサーブが見つからなければ undefined。 */
async function searchRun(run: ShiftRun): Promise<SpinShiftCandidate | null | undefined> {
  const preset = PRESETS.find((p) => p.params.serveType === run.type);
  if (!preset) return undefined;
  const cost = (p: ServeParams) => measure(simulateServe(p, COARSE.dt, COARSE.contactDt), run.q, run.length)?.cost ?? 1000;
  const ranges = wideRanges(preset.params);
  const rand = mulberry32(run.seed);

  // ① この長さで入るサーブをいくつか見つける（プリセットも候補）
  const starts: { p: ServeParams; c: number }[] = [];
  const c0 = cost(preset.params);
  if (c0 < 1000) starts.push({ p: preset.params, c: c0 });
  for (let i = 0; i < 300 && starts.length < 6; i++) {
    if (i % 30 === 0) {
      if (run.isCancelled?.()) return null;
      run.onProgress((0.1 * i) / 300);
      await tick();
    }
    let p = preset.params;
    for (const r of ranges) p = r.set(p, r.min + rand() * (r.max - r.min));
    const c = cost(p);
    if (c < 1000) starts.push({ p, c });
  }
  if (starts.length === 0) return undefined;

  // ② それぞれ軽く山登りして見込みを比べ、③ 良い 2 つを深く探す
  const screened: { params: ServeParams; cost: number }[] = [];
  for (const [i, st] of starts.entries()) {
    const r = await optimize(st.p, ranges, cost, {
      budget: Math.floor((run.budget * 0.35) / starts.length),
      randomShare: 0.2,
      seed: run.seed + 10 + i,
      isCancelled: run.isCancelled,
      onProgress: (f) => run.onProgress(0.1 + ((i + f) / starts.length) * 0.35),
    });
    if (!r) return null;
    screened.push(r[0]);
  }
  screened.sort((x, y) => x.cost - y.cost);
  const deep = screened.slice(0, 2);
  const pool: { params: ServeParams; cost: number }[] = [];
  for (const [i, d] of deep.entries()) {
    const r = await optimize(d.params, ranges, cost, {
      budget: Math.floor((run.budget * 0.55) / deep.length),
      randomShare: 0.1,
      seed: run.seed + 50 + i,
      isCancelled: run.isCancelled,
      onProgress: (f) => run.onProgress(0.45 + ((i + f) / deep.length) * 0.5),
    });
    if (!r) return null;
    pool.push(...r);
  }
  pool.sort((x, y) => x.cost - y.cost);

  // 細かい刻みで計算し直して一番良いものを採る
  let best: SpinShiftCandidate | undefined;
  let bestCost = Infinity;
  for (const cand of pool.slice(0, 4)) {
    const params = roundParams(cand.params);
    const result = simulateServe(params);
    const m = measure(result, run.q, run.length);
    if (!m || m.cost >= bestCost) continue;
    bestCost = m.cost;
    best = {
      serveType: run.type,
      length: run.length,
      params,
      result,
      contactSpin: m.s0,
      receiveSpin: m.s1,
      receiveState: m.rs.state,
      angleDeg: spinAngle(m.s0, m.s1),
      score: m.score,
    };
  }
  run.onProgress(1);
  return best;
}

/** 並べ順: 点数（向きの違い × 種類の一致）→ 届くときの回転量。 */
export function compareShift(x: SpinShiftCandidate, y: SpinShiftCandidate) {
  if (Math.abs(x.score - y.score) > 1e-9) return y.score - x.score;
  return y.receiveSpin.total - x.receiveSpin.total;
}

/**
 * 今のサーブを使わずに、サーブの種類 × 長さのそれぞれで、打球時と到達時の回転の向きがいちばん変わるサーブを探す。
 * previous を渡すと、種類 × 長さごとに良いほうを残す（探し直すたびに積み上げる）。
 */
export async function searchSpinShift(
  q: SpinShiftQuery = DEFAULT_SHIFT_QUERY,
  opts: SearchOpts & {
    types?: ServeType[];
    lengths?: ("short" | "long")[];
    budgetPerRun?: number;
    previous?: SpinShiftCandidate[];
    onPartial?: (list: SpinShiftCandidate[]) => void;
  } = {},
): Promise<SpinShiftCandidate[] | null> {
  const types = opts.types ?? SERVE_TYPES.map((t) => t.id);
  const lengths = opts.lengths ?? ["short", "long"];
  const runs = types.flatMap((type) => lengths.map((length) => ({ type, length })));
  const found: SpinShiftCandidate[] = [...(opts.previous ?? [])];
  for (const [i, r] of runs.entries()) {
    const c = await searchRun({
      ...r,
      q,
      budget: opts.budgetPerRun ?? 900,
      seed: (opts.seed ?? 20260927) + i * 97,
      onProgress: (f) => opts.onProgress?.((i + f) / runs.length),
      isCancelled: opts.isCancelled,
    });
    if (c === null) return null;
    if (!c) continue;
    const j = found.findIndex((x) => x.serveType === c.serveType && x.length === c.length);
    if (j < 0) found.push(c);
    else if (compareShift(c, found[j]) < 0) found[j] = c;
    found.sort(compareShift);
    opts.onPartial?.([...found]);
  }
  opts.onProgress?.(1);
  return found.sort(compareShift);
}

// ─────────────────────────────── 回転の移り変わり ───────────────────────────────

export type SpinSample = SpinBreakdown & {
  /** 打球からの時間 (秒) */
  t: number;
  /** それまでに台で弾んだ回数 */
  bounces: number;
};

export type SpinTimeline = {
  samples: SpinSample[];
  /** 台で弾んだ時刻（打球からの秒）と、自コート / 相手コート */
  bounces: { t: number; side: "own" | "opponent" }[];
  /** 相手が打つ時刻（打球からの秒） */
  receiveT: number | null;
};

/** 打球直後から相手の打球点までの、回転（進行方向基準の 3 成分）の移り変わり。 */
export function spinTimeline(r: SimResult, timing: ReceiveTiming, step = 0.004): SpinTimeline {
  const impact = r.contact.impact;
  if (!impact) return { samples: [], bounces: [], receiveT: null };
  const t0 = r.contactTime + impact.duration;
  const flight = flyBall({ t: t0, pos: impact.exitPos, vel: impact.vel, omega: impact.omega }, { maxBounces: 3, recordFromBounce: -1 });
  const rs = spinAtReceive(r, timing);
  const tEnd = rs ? rs.state.t : flight.end.t;
  const bounces = flight.bounces.filter((b) => b.t <= tEnd + 1e-9).map((b) => ({ t: b.t - r.contactTime, side: b.half === "near" ? ("own" as const) : ("opponent" as const) }));
  const samples: SpinSample[] = [{ ...breakdownSpin(impact.omega, impact.vel), t: t0 - r.contactTime, bounces: 0 }];
  let next = t0 + step;
  let prevBounces = 0;
  for (const s of flight.recorded) {
    if (s.t > tEnd + 1e-9) break;
    const n = flight.bounces.filter((b) => b.t <= s.t + 1e-9).length;
    // 弾んだ直後は必ず 1 点入れる（バウンドでの変化が見えるように）
    if (s.t >= next - 1e-9 || n !== prevBounces) {
      samples.push({ ...breakdownSpin(s.omega, s.vel), t: s.t - r.contactTime, bounces: n });
      next = s.t + step;
      prevBounces = n;
    }
  }
  if (rs) samples.push({ ...rs.spin, t: rs.state.t - r.contactTime, bounces: flight.bounces.filter((b) => b.t <= rs.state.t).length });
  return { samples, bounces, receiveT: rs ? rs.state.t - r.contactTime : null };
}

export type SweepRow = {
  /** スイングの鋭さの倍率 */
  factor: number;
  ok: boolean;
  verdict: SimResult["verdict"];
  contactSpin: SpinBreakdown | null;
  receiveSpin: SpinBreakdown | null;
  angleDeg: number | null;
};

/** スイングの鋭さ（＝打球時の回転量と速さ）だけを変えたとき、回転の変わり方がどう変わるか。 */
export function tempoSweep(params: ServeParams, timing: ReceiveTiming, factors = [0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.4]): SweepRow[] {
  return factors.map((factor) => {
    const r = simulateServe({ ...params, tempo: params.tempo / factor });
    const rs = r.legal ? spinAtReceive(r, timing) : null;
    return {
      factor,
      ok: r.legal && !!rs,
      verdict: r.verdict,
      contactSpin: r.contact.hit ? r.contact.spin : null,
      receiveSpin: rs?.spin ?? null,
      angleDeg: rs ? spinAngle(r.contact.spin, rs.spin) : null,
    };
  });
}
