// 相対評価エンジン (根本転換の中核):
//
// 従来は「ペアごとに3票溜まったら勝率%を出す」集計だった。これは疎データで
// 何も出力できず、単独ユーザー・コールドスタートで死ぬ。
//
// 代わりに、全ユーザーの全A/B比較を1つの順序推定に合成する。
// 推移律 (A>B かつ B>C ⇒ A>C) を使うため、直接対決していないラバー同士でも
// 相対位置が決まり、1票の比較が地図全体に寄与する。
//
// 手法: 正則化 Bradley-Terry (MM法)。各ラバーに強さ p>0 を割り当て、
// 「i が j に勝つ確率 = p_i/(p_i+p_j)」を最尤化する。
// 全ラバーを仮想アンカー(平均ラバー, 強さ=1.0)と alpha 回ずつ引き分けさせる
// ことで、(1)比較グラフが分断していても単一スケールに乗る (2)全勝/全敗でも
// 有限値になる (3)支持データが薄い項目は中央へ縮約される、を同時に満たす。

export type AxisKey =
  | "overall"
  | "speed"
  | "spin"
  | "control"
  | "hardness"
  | "ballHold";

export interface PairwiseInput {
  aId: string;
  bId: string;
  /** その軸での勝者。A=aId が強い / B=bId が強い / SAME=互角 */
  winner: "A" | "B" | "SAME";
  /** 信頼度の重み (実体験=1.0 / イメージ=0.4 等)。既定1.0 */
  weight?: number;
}

export interface Rating {
  id: string;
  /** log 強さ。アンカー(平均)=0。正なら平均より「強い」軸 */
  logStrength: number;
  /** 表示用 0-100 (その軸の出現項目内で min-max 正規化) */
  score: number;
  /** この項目が関わった実比較の本数 (信頼度の目安) */
  comparisons: number;
}

export interface AxisRatingResult {
  ratings: Map<string, Rating>;
  /** 実比較が1本でもある項目数 */
  rankedCount: number;
}

interface Accum {
  // wins[i] = i の総勝ち数 (SAME は 0.5 ずつ)
  wins: Map<string, number>;
  // games[i] = Map<opponentId, 対戦数>
  games: Map<string, Map<string, number>>;
  // realComparisons[i] = 実比較本数 (アンカー分は含めない)
  realComparisons: Map<string, number>;
}

function ensure(m: Map<string, number>, k: string): number {
  return m.get(k) ?? 0;
}

/**
 * 1軸ぶんのペアワイズ結果から各ラバーの相対強さを推定する。
 * @param alpha 仮想アンカーとの引き分け回数 (正則化の強さ。既定1.0)
 */
export function computeAxisRatings(
  inputs: PairwiseInput[],
  alpha = 1.0,
): AxisRatingResult {
  const acc: Accum = {
    wins: new Map(),
    games: new Map(),
    realComparisons: new Map(),
  };
  const ids = new Set<string>();

  const addGame = (i: string, j: string, n: number) => {
    const gi = acc.games.get(i) ?? new Map<string, number>();
    gi.set(j, (gi.get(j) ?? 0) + n);
    acc.games.set(i, gi);
  };

  for (const { aId, bId, winner, weight } of inputs) {
    if (aId === bId) continue;
    const w = weight ?? 1.0;
    if (w <= 0) continue;
    ids.add(aId);
    ids.add(bId);
    addGame(aId, bId, w);
    addGame(bId, aId, w);
    // 実比較本数は重みでなく実数 (信頼度表示用)
    acc.realComparisons.set(aId, ensure(acc.realComparisons, aId) + 1);
    acc.realComparisons.set(bId, ensure(acc.realComparisons, bId) + 1);
    if (winner === "A") {
      acc.wins.set(aId, ensure(acc.wins, aId) + w);
    } else if (winner === "B") {
      acc.wins.set(bId, ensure(acc.wins, bId) + w);
    } else {
      acc.wins.set(aId, ensure(acc.wins, aId) + w / 2);
      acc.wins.set(bId, ensure(acc.wins, bId) + w / 2);
    }
  }

  const ANCHOR_STRENGTH = 1.0;
  // 仮想アンカーとの対戦: 各項目 alpha 回、半分勝ち半分負け
  for (const id of ids) {
    acc.wins.set(id, ensure(acc.wins, id) + alpha / 2);
  }

  // MM 反復
  const idList = [...ids];
  const p = new Map<string, number>(idList.map((id) => [id, 1.0]));
  const MAX_ITER = 500;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    let maxDelta = 0;
    for (const id of idList) {
      const wins = ensure(acc.wins, id);
      const pi = p.get(id)!;
      let denom = alpha / (pi + ANCHOR_STRENGTH); // アンカー分
      const opponents = acc.games.get(id);
      if (opponents) {
        for (const [oppId, n] of opponents) {
          denom += n / (pi + p.get(oppId)!);
        }
      }
      const next = wins / denom;
      maxDelta = Math.max(maxDelta, Math.abs(Math.log(next) - Math.log(pi)));
      p.set(id, next);
    }
    if (maxDelta < 1e-10) break;
  }

  // log 強さ (アンカー=0 基準)
  const logs = new Map<string, number>(
    idList.map((id) => [id, Math.log(p.get(id)! / ANCHOR_STRENGTH)]),
  );

  // 表示用 0-100 正規化 (実比較がある項目で min-max)
  const ranked = idList.filter((id) => ensure(acc.realComparisons, id) > 0);
  const logVals = ranked.map((id) => logs.get(id)!);
  const min = logVals.length ? Math.min(...logVals) : 0;
  const max = logVals.length ? Math.max(...logVals) : 0;
  const span = max - min;

  const ratings = new Map<string, Rating>();
  for (const id of ranked) {
    const lg = logs.get(id)!;
    ratings.set(id, {
      id,
      logStrength: lg,
      score: span > 1e-9 ? ((lg - min) / span) * 100 : 50,
      comparisons: ensure(acc.realComparisons, id),
    });
  }
  return { ratings, rankedCount: ranked.length };
}
