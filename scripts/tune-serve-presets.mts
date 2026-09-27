// サーブの種類ごとの「基本のスイング」を探索で決めるスクリプト（結果は serve-sim.ts の PRESETS に貼る）。
// 実行: npx tsx scripts/tune-serve-presets.mts [serveType]
//
// 条件: 関節は可動域の中・しゃがみ 5〜40cm・関節の速さ 1500°/s 以下・ルール上入るショート・
// 回転数は Tリーグのショートの中央値付近（42rps）・横回転の向きがサーブの定義どおり、
// そしてサーブごとの体の使い方（下記 DESCRIPTORS）。
import { JOINTS, SERVE_TYPES, type JointAngles, type ServeType } from "../src/lib/arm";
import { simulateServe, swingDirection, type ServeParams, type SimResult } from "../src/lib/serve-sim";
import { dot, unit, v } from "../src/lib/vec3";

const TRUNK: Record<ServeType, [number, number]> = {
  pendulum: [-110, -40],
  hook: [-110, -40],
  yg: [-100, -10],
  tomahawk: [-90, -10],
  backhand: [-20, 30],
};

/** サーブごとの体の使い方。0 なら条件を満たす、正の値は外れ具合。 */
const DESCRIPTORS: Record<ServeType, (r: SimResult) => number> = {
  // 右から左へ振り子のように（台の幅方向で自分の左へ）、ラケットの先は下向き
  pendulum: (r) => along(r, "tableLeft", 0.2) + Math.max(0, 0.1 - r.racket.pose0.handle.z),
  // 体の方へ巻き込む
  hook: (r) => along(r, "toBody", 0.3),
  // 内から外へ（台の幅方向で自分の右へ）、肘が手首より高い
  yg: (r) => along(r, "tableRight", 0.3) + Math.max(0, r.racket.armAt(0).wrist.z + 0.05 - r.racket.armAt(0).elbow.z) * 10,
  // ラケットの先を上に立て、上から下へ
  tomahawk: (r) => Math.max(0, r.racket.pose0.handle.z + 0.5) + Math.max(0, swingDirection(r).z + 0.3),
  // 体の正面で左から右へ（台の幅方向で自分の右へ）
  backhand: (r) => along(r, "tableRight", 0.3),
};

// 台の幅方向: サーバーから見て左 = +y
function along(r: SimResult, dir: "left" | "right" | "toBody" | "tableLeft" | "tableRight", min: number) {
  const a = r.racket.armAt(0);
  const f = unit(v(a.shoulder.x - a.leftShoulder.x, a.shoulder.y - a.leftShoulder.y, 0)); // 体の右
  const d =
    dir === "tableLeft"
      ? v(0, 1, 0)
      : dir === "tableRight"
        ? v(0, -1, 0)
        : dir === "right"
          ? f
          : dir === "left"
            ? v(-f.x, -f.y, 0)
            : unit(v(a.spine.x - a.racket.center.x, a.spine.y - a.racket.center.y, 0));
  return Math.max(0, min - dot(swingDirection(r), d)) * 5;
}

function cost(p: ServeParams, coarse = true): number {
  const r = simulateServe(p, coarse ? 0.003 : 0.001, coarse ? 6e-6 : 1e-6);
  if (!r.contact.hit) return 1e4;
  const kind = SERVE_TYPES.find((t) => t.id === p.serveType)!;
  let c = 0;
  c += 200 * r.racket.clampedJoints.length;
  c += 500 * (Math.max(0, 0.05 - r.racket.crouch) + Math.max(0, r.racket.crouch - 0.4));
  for (const j of JOINTS) {
    const cap = j.key === "trunk" ? 600 : 1500;
    c += 0.05 * Math.max(0, Math.abs(r.racket.jointSpeeds[j.key]) - cap);
  }
  if (r.verdict !== "short") {
    c += 300;
    if (r.verdict === "net") c += 1000 * Math.max(0, -(r.netClearance ?? 0));
    if (r.verdict === "long" || r.verdict === "missOpponent") c += 30 * r.contact.ballSpeed;
  }
  c += 3 * Math.abs(r.contact.spin.total - 42);
  const side = r.contact.spin.side;
  c += kind.side === "順横" ? 20 * Math.max(0, side + 12) : 20 * Math.max(0, 12 - side);
  if (r.netClearance !== null) c += 500 * (Math.max(0, 0.02 - r.netClearance) + Math.max(0, r.netClearance - 0.07));
  c += 40 * DESCRIPTORS[p.serveType](r);
  return c;
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

type Getter = { get: (p: ServeParams) => number; set: (p: ServeParams, x: number) => ServeParams; lo: number; hi: number; step: number };
const vars = (type: ServeType): Getter[] => {
  const out: Getter[] = [];
  for (const j of JOINTS) {
    const [lo, hi] = j.key === "trunk" ? TRUNK[type] : j.rom;
    out.push({ get: (p) => p.contact[j.key], set: (p, x) => ({ ...p, contact: { ...p.contact, [j.key]: x } }), lo, hi, step: 8 });
    const sw = j.key === "trunk" ? 40 : j.key.startsWith("wrist") || j.key === "pronation" ? 90 : 60;
    out.push({ get: (p) => p.sweep[j.key], set: (p, x) => ({ ...p, sweep: { ...p.sweep, [j.key]: x } }), lo: -sw, hi: sw, step: 8 });
  }
  out.push({ get: (p) => p.tempo, set: (p, x) => ({ ...p, tempo: x }), lo: 0.04, hi: 0.1, step: 0.005 });
  out.push({ get: (p) => p.hitAlong, set: (p, x) => ({ ...p, hitAlong: x }), lo: -0.03, hi: 0.06, step: 0.01 });
  // 打点（高さ・エンドラインからの距離）もサーブによって違うので探す
  out.push({ get: (p) => p.contactHeight, set: (p, x) => ({ ...p, contactHeight: x }), lo: 0.12, hi: 0.3, step: 0.02 });
  out.push({ get: (p) => p.contactBehind, set: (p, x) => ({ ...p, contactBehind: x }), lo: 0.05, hi: 0.35, step: 0.03 });
  return out;
};

const zero = (): JointAngles => ({ trunk: 0, shoulderAz: 0, shoulderEl: 0, humeralRot: 0, elbow: 0, pronation: 0, wristFlex: 0, wristDev: 0 });

function tune(type: ServeType, seed: number) {
  const rand = mulberry32(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  const base: ServeParams = {
    serveType: type,
    height: 1.7,
    tossHeight: 0.4,
    contactHeight: 0.18,
    contactBehind: 0.2,
    contactSide: type === "backhand" ? 0.1 : 0.45,
    contact: zero(),
    sweep: zero(),
    tempo: 0.06,
    snapFlex: 0,
    snapDev: 0,
    snapPron: 0,
    hitAlong: 0.02,
    hitAcross: 0,
  };
  const V = vars(type);
  const clampV = (g: Getter, x: number) => Math.min(g.hi, Math.max(g.lo, x));
  const fromVec = (x: number[]) => V.reduce((p, g, i) => g.set(p, clampV(g, x[i])), base);
  const toVec = (p: ServeParams) => V.map((g) => g.get(p));

  // A) 乱択
  const pool: { x: number[]; c: number }[] = [];
  for (let i = 0; i < 6000; i++) {
    const x = V.map((g) => g.lo + rand() * (g.hi - g.lo));
    pool.push({ x, c: cost(fromVec(x)) });
  }
  pool.sort((a, b) => a.c - b.c);

  // B) 進化戦略（上位から、平均と幅を絞りながら）
  const refined: { x: number[]; c: number }[] = [];
  for (const start of pool.slice(0, 8)) {
    let mean = start.x;
    let best = start;
    let sigma = V.map((g) => (g.hi - g.lo) * 0.15);
    for (let it = 0; it < 40; it++) {
      const kids = Array.from({ length: 24 }, () => {
        const x = mean.map((m, i) => clampV(V[i], m + sigma[i] * gauss()));
        return { x, c: cost(fromVec(x)) };
      });
      kids.sort((a, b) => a.c - b.c);
      const elite = kids.slice(0, 6);
      mean = mean.map((_, i) => elite.reduce((s2, k) => s2 + k.x[i], 0) / elite.length);
      if (kids[0].c < best.c) best = kids[0];
      sigma = sigma.map((sg) => sg * 0.93);
    }
    refined.push(best);
  }
  refined.sort((a, b) => a.c - b.c);

  // C) 細かい刻みで山登り
  let final = { p: fromVec(refined[0].x), c: cost(fromVec(refined[0].x), false) };
  for (const cand of refined.slice(0, 3)) {
    let cur = fromVec(cand.x);
    let cc = cost(cur, false);
    for (const shrink of [0.5, 0.25, 0.125]) {
      let improved = true;
      let guard = 0;
      while (improved && guard++ < 12) {
        improved = false;
        for (const g of V) {
          for (const dir of [1, -1]) {
            const p = g.set(cur, clampV(g, g.get(cur) + dir * g.step * shrink));
            const c = cost(p, false);
            if (c < cc) {
              cur = p;
              cc = c;
              improved = true;
            }
          }
        }
      }
    }
    if (cc < final.c) final = { p: cur, c: cc };
  }
  void toVec;
  return final;
}

const round = (p: ServeParams): ServeParams => {
  const r = (x: number) => Math.round(x);
  const ra = (a: JointAngles) => Object.fromEntries(Object.entries(a).map(([k, x]) => [k, r(x)])) as JointAngles;
  return {
    ...p,
    contact: ra(p.contact),
    sweep: ra(p.sweep),
    tempo: Math.round(p.tempo * 1000) / 1000,
    hitAlong: Math.round(p.hitAlong * 200) / 200,
    contactHeight: Math.round(p.contactHeight * 100) / 100,
    contactBehind: Math.round(p.contactBehind * 100) / 100,
  };
};

const only = process.argv[2] as ServeType | undefined;
for (const t of SERVE_TYPES.filter((t) => !only || t.id === only)) {
  let best: { p: ServeParams; c: number } | null = null;
  for (const seed of (process.argv[3] ?? "1,2").split(",").map(Number)) {
    const b = tune(t.id, seed * 7919);
    if (!best || b.c < best.c) best = b;
  }
  const p = round(best!.p);
  const r = simulateServe(p);
  console.log(
    JSON.stringify({
      type: t.id,
      cost: Math.round(cost(p, false)),
      verdict: r.verdict,
      spin: `${r.contact.spin.label} ${r.contact.spin.total.toFixed(1)} tb ${r.contact.spin.topBack.toFixed(1)} side ${r.contact.spin.side.toFixed(1)}`,
      net: r.netClearance?.toFixed(3),
      crouch: r.racket.crouch.toFixed(2),
      hitV: r.contact.impact?.hitPointSpeed.toFixed(1),
      warnings: r.warnings,
      params: { contact: p.contact, sweep: p.sweep, tempo: p.tempo, hitAlong: p.hitAlong, contactSide: p.contactSide, contactHeight: p.contactHeight, contactBehind: p.contactBehind },
    }),
  );
}
