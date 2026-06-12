import type { QuestionAxis } from "./types";
import { isRubberCategory } from "./types";

// マイギア中心の出題 (サービス再設計の核):
// - 出題は原則「ユーザーが使ったことのあるラバー同士」(ギア内ペア)。
//   両方使った人の相対判定だけが信頼できるデータであり、回答者にとっても
//   イメージではなく記憶で答えられる。
// - ギア内ペアを出し尽くしたら「現用 vs 未使用の人気ラバー」を
//   イメージ回答 (explore) として明示したうえで出す。
// - 報酬・マイルストーンの概念は持たない。

export interface EquipmentLite {
  id: string;
  category: string;
  manufacturer: string;
  name: string;
  officialSpeed: number | null;
  officialSpin: number | null;
  hardness: number | null;
  price: number | null;
  bladeSubcategory: string | null;
  imageUrl: string | null;
}

export interface GearLite {
  id: string;
  equipmentId: string;
  side: string; // FH | BH
  thickness: string;
  bladeName: string | null;
  isCurrent: boolean;
}

export interface AskedRecord {
  pairKey: string;
  axis: string;
}

export interface GeneratorContext {
  gear: GearLite[];
  /** 直近に出題した (ペア×軸)。新しい順、最大20程度 */
  recentAsked: AskedRecord[];
  random?: () => number;
}

export interface GeneratedQuestion {
  id: string;
  optionA: EquipmentLite;
  optionB: EquipmentLite;
  axis: QuestionAxis;
  prompt: string;
  /** gear: ギア内ペア (実体験) / explore: イメージ回答 */
  source: "gear" | "explore";
  /** 表示用の使用条件 (ギア由来のときのみ) */
  gearA: GearLite | null;
  gearB: GearLite | null;
}

export function pairKey(aId: string, bId: string): string {
  return [aId, bId].sort().join("|");
}

const FEEL_AXES: Array<{ axis: QuestionAxis; weight: number }> = [
  { axis: "overall", weight: 0.35 },
  { axis: "hardness", weight: 0.2 },
  { axis: "spin", weight: 0.15 },
  { axis: "speed", weight: 0.15 },
  { axis: "ballHold", weight: 0.15 },
];

const GEAR_PROMPTS: Record<string, string> = {
  overall: "どちらが好みだった？",
  hardness: "硬く感じたのはどちら？",
  spin: "回転がかかったのはどちら？",
  speed: "スピードが出たのはどちら？",
  ballHold: "球持ちが良かったのはどちら？",
};

const EXPLORE_PROMPTS: Record<string, string> = {
  overall: "イメージでOK: どちらが好みそう？",
  hardness: "イメージでOK: 硬そうなのはどちら？",
  spin: "イメージでOK: 回転がかかりそうなのは？",
  speed: "イメージでOK: 速そうなのはどちら？",
  ballHold: "イメージでOK: 球持ちが良さそうなのは？",
};

function pickRandom<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

function pickAxis(
  available: QuestionAxis[],
  random: () => number,
): QuestionAxis {
  const candidates = FEEL_AXES.filter((a) => available.includes(a.axis));
  const total = candidates.reduce((s, a) => s + a.weight, 0);
  let r = random() * total;
  for (const c of candidates) {
    r -= c.weight;
    if (r <= 0) return c.axis;
  }
  return candidates[candidates.length - 1].axis;
}

const ASKABLE_AXES = FEEL_AXES.map((a) => a.axis);

/**
 * 次の1問を生成する。出題できるものがなければ null
 * (ギアが少ない場合は explore にフォールバックする)。
 */
export function generateQuestion(
  equipments: EquipmentLite[],
  context: GeneratorContext,
): GeneratedQuestion | null {
  const random = context.random ?? Math.random;
  const byId = new Map(equipments.map((e) => [e.id, e]));
  const askedKeys = new Set(
    context.recentAsked.slice(0, 20).map((r) => `${r.pairKey}#${r.axis}`),
  );

  // ギアのうちラバーのみ。同じ用具を複数条件で使っていた場合は最初の1件を代表に
  const gearRubbers: GearLite[] = [];
  const seen = new Set<string>();
  for (const g of context.gear) {
    const eq = byId.get(g.equipmentId);
    if (!eq || !isRubberCategory(eq.category)) continue;
    if (seen.has(g.equipmentId)) continue;
    seen.add(g.equipmentId);
    gearRubbers.push(g);
  }

  // 1) ギア内ペア (実体験): ペア×軸の未出題組み合わせから選ぶ。
  //    フォアとバックで役割が違うため、同じ面で使ったペアのみ比較する
  //    (面を跨いだ「どちらが速い？」は比較として成立しない)。
  if (gearRubbers.length >= 2) {
    const candidates: Array<{
      a: GearLite;
      b: GearLite;
      axes: QuestionAxis[];
      key: string;
    }> = [];
    for (let i = 0; i < gearRubbers.length; i++) {
      for (let j = i + 1; j < gearRubbers.length; j++) {
        const a = gearRubbers[i];
        const b = gearRubbers[j];
        if (a.side !== b.side) continue;
        const key = pairKey(a.equipmentId, b.equipmentId);
        const axes = ASKABLE_AXES.filter(
          (axis) => !askedKeys.has(`${key}#${axis}`),
        );
        if (axes.length > 0) {
          candidates.push({ a, b, axes, key });
        }
      }
    }
    if (candidates.length > 0) {
      // 直前と同じペアの連続出題を避ける (他に選択肢がある場合)
      const lastPair = context.recentAsked[0]?.pairKey;
      const fresh = candidates.filter((c) => c.key !== lastPair);
      const pool = fresh.length > 0 ? fresh : candidates;
      const picked = pickRandom(pool, random);
      const axis = pickAxis(picked.axes, random);
      const optionA = byId.get(picked.a.equipmentId)!;
      const optionB = byId.get(picked.b.equipmentId)!;
      return {
        id: pairKey(optionA.id, optionB.id),
        optionA,
        optionB,
        axis,
        prompt: GEAR_PROMPTS[axis],
        source: "gear",
        gearA: picked.a,
        gearB: picked.b,
      };
    }
  }

  // 2) explore: 基準 (現用 or ギア内ランダム) vs 未使用の人気ラバー。
  //    ギアが空なら完全ランダムの2本 (イメージ回答として明示)。
  const rubberPool = equipments.filter(
    (e) => isRubberCategory(e.category) && e.category !== "RUBBER_ANTI",
  );
  if (rubberPool.length < 2) return null;

  const base =
    gearRubbers.find((g) => g.isCurrent) ??
    (gearRubbers.length > 0 ? pickRandom(gearRubbers, random) : null);

  for (let attempt = 0; attempt < 40; attempt++) {
    let optionA: EquipmentLite;
    let optionB: EquipmentLite;
    let gearA: GearLite | null = null;
    if (base) {
      optionA = byId.get(base.equipmentId)!;
      gearA = base;
      const others = rubberPool.filter(
        (e) => e.id !== optionA.id && !seen.has(e.id),
      );
      if (others.length === 0) return null;
      optionB = pickRandom(others, random);
    } else {
      optionA = pickRandom(rubberPool, random);
      optionB = pickRandom(rubberPool, random);
      if (optionA.id === optionB.id) continue;
      if (optionA.category !== optionB.category) continue;
    }
    const key = pairKey(optionA.id, optionB.id);
    const axes = ASKABLE_AXES.filter((axis) => !askedKeys.has(`${key}#${axis}`));
    if (axes.length === 0) continue;
    const axis = pickAxis(axes, random);
    return {
      id: key,
      optionA,
      optionB,
      axis,
      prompt: EXPLORE_PROMPTS[axis],
      source: "explore",
      gearA,
      gearB: null,
    };
  }
  return null;
}
