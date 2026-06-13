import { isRomaji, toKatakana } from "wanakana";
import Fuse from "fuse.js";

// 用具検索コア (137件規模・クライアント完結):
// 正規化 → 完全/前方/部分一致(エイリアス含む) → ファジー(取りこぼし救済) のカスケード。
// 日本語の表記揺れ(全半角/かな種/長音/中黒)を畳み、ローマ字入力と日英表記に対応する。

export interface SearchableItem {
  id: string;
  name: string;
  manufacturer: string;
  category?: string;
}

// メーカー日→英 (ローマ字/英語入力でのヒット用)
const MANUFACTURER_EN: Record<string, string> = {
  バタフライ: "butterfly",
  ヤサカ: "yasaka",
  ニッタク: "nittaku",
  ミズノ: "mizuno",
  ヴィクタス: "victas",
  ティバー: "tibhar",
  ドニック: "donic",
  アンドロ: "andro",
  スティガ: "stiga",
  紅双喜: "dhs",
  アームストロング: "armstrong",
};

// シリーズ/用語の日→英 (製品名内の部分を英字化して照合キーに加える)
const TERM_EN: Array<[RegExp, string]> = [
  [/テナジー/g, "tenergy"],
  [/ディグニクス/g, "dignics"],
  [/ロゼナ/g, "rozena"],
  [/グレイザー/g, "glayzer"],
  [/スレイバー/g, "sriver"],
  [/ラクザ/g, "rakza"],
  [/マークV/g, "markv"],
  [/ファスターク/g, "fastarc"],
  [/ファクティブ/g, "factive"],
  [/ハモンド/g, "hammond"],
  [/ヴェガ/g, "vega"],
  [/オメガ/g, "omega"],
  [/エボリューション/g, "evolution"],
  [/ラザンター/g, "rasanter"],
  [/バラクーダ/g, "barracuda"],
  [/ブルーファイア/g, "bluefire"],
  [/ブルーストーム/g, "bluestorm"],
  [/ライザー/g, "rhyzer"],
  [/ダイナライズ/g, "dynaryz"],
  [/キョウヒョウ/g, "hurricane"],
  [/スペクトル/g, "spectol"],
  [/モリスト/g, "morist"],
  [/カール/g, "curl"],
  [/フェイント/g, "feint"],
  [/ヴェンタス/g, "ventus"],
  [/インパーシャル/g, "impartial"],
  [/エキストラ/g, "extra"],
  [/プロ/g, "pro"],
  [/ソフト/g, "soft"],
  [/ハード/g, "hard"],
];

// 略称・俗称 (機械変換できないものをデータで補完)
const ALIASES: Record<string, string[]> = {
  ディグニクス05: ["d05", "でぃぐ05"],
  ディグニクス09C: ["d09c", "d09"],
  テナジー05: ["てな05", "t05"],
  "ファスタークG-1": ["g1", "ファスタークg1"],
  キョウヒョウNEO3: ["neo3", "粘着neo3"],
  キョウヒョウ3: ["狂飆3", "h3"],
};

/** 索引・クエリ双方に同一適用する正規化。NFKC→小文字→かなはカタカナへ→揺れ記号を除去。 */
export function normalizeForSearch(s: string): string {
  let t = s.normalize("NFKC").toLowerCase();
  // ひらがな→カタカナに統一 (ローマ字/英字はそのまま)
  t = toKatakana(t, { passRomaji: true });
  // 長音「ー」「ｰ」/中黒/空白/各種ハイフンを除去して揺れを畳む
  t = t.replace(/[ー・\s‐-―ー－-]/g, "");
  return t;
}

/** 製品名を英字化した変種 (例: テナジー05 → tenergy05)。日英入力の橋渡し。 */
function toEnVariant(name: string): string {
  let t = name;
  for (const [re, en] of TERM_EN) t = t.replace(re, en);
  return t;
}

interface Enriched<T> {
  item: T;
  keys: string[]; // 正規化済みの照合キー集合
  name: string;
  manufacturer: string;
  en: string; // Fuse 用の英字キー
}

function enrich<T extends SearchableItem>(item: T): Enriched<T> {
  const en = toEnVariant(item.name);
  const manuEn = MANUFACTURER_EN[item.manufacturer] ?? "";
  const aliases = ALIASES[item.name] ?? [];
  const keys = [
    normalizeForSearch(item.name),
    normalizeForSearch(item.manufacturer),
    normalizeForSearch(en),
    normalizeForSearch(manuEn),
    ...aliases.map(normalizeForSearch),
  ].filter(Boolean);
  return {
    item,
    keys,
    name: normalizeForSearch(item.name),
    manufacturer: normalizeForSearch(item.manufacturer),
    en: normalizeForSearch(en),
  };
}

/** クエリの照合候補 (正規化形 + ローマ字ならカタカナ化した形)。 */
function queryVariants(query: string): string[] {
  const variants = new Set<string>();
  const base = normalizeForSearch(query);
  if (base) variants.add(base);
  // ローマ字入力ならカタカナへ変換した形も試す (rozena → ロゼナ)
  if (isRomaji(query)) {
    const kata = normalizeForSearch(toKatakana(query));
    if (kata) variants.add(kata);
  }
  return [...variants];
}

export interface SearchOptions {
  limit?: number;
  /** ファジーの厳しさ (小さいほど厳格)。短い日本語の誤マッチを避けるため既定0.3 */
  fuzzyThreshold?: number;
}

/**
 * 用具検索: 正規化 → 前方/部分一致 → ファジー の順でスコアし、上位を返す。
 */
export function searchEquipment<T extends SearchableItem>(
  items: T[],
  query: string,
  options: SearchOptions = {},
): T[] {
  const limit = options.limit ?? 8;
  const q = query.trim();
  if (!q) return [];

  const enriched = items.map(enrich);
  const variants = queryVariants(q);

  // 1) 完全/前方/部分一致でスコア
  const scored: Array<{ e: Enriched<T>; score: number }> = [];
  const matchedIds = new Set<string>();
  for (const e of enriched) {
    let best = 0;
    for (const v of variants) {
      for (const k of e.keys) {
        if (!k || !v) continue;
        if (k === v) best = Math.max(best, 4);
        else if (k.startsWith(v)) best = Math.max(best, 3);
        else if (k.includes(v)) best = Math.max(best, 2);
      }
    }
    if (best > 0) {
      scored.push({ e, score: best });
      matchedIds.add(e.item.id);
    }
  }
  scored.sort(
    (a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name, "ja"),
  );
  const ordered: T[] = scored.map((s) => s.e.item);

  if (ordered.length >= limit) return ordered.slice(0, limit);

  // 2) ファジーで取りこぼしを救済 (まだ拾えていない用具のみ)
  const remaining = enriched.filter((e) => !matchedIds.has(e.item.id));
  if (remaining.length > 0 && q.length >= 2) {
    const fuse = new Fuse(remaining, {
      includeScore: true,
      ignoreLocation: true,
      minMatchCharLength: 2,
      threshold: options.fuzzyThreshold ?? 0.3,
      keys: [
        { name: "name", weight: 1 },
        { name: "en", weight: 0.7 },
        { name: "keys", weight: 0.6 },
        { name: "manufacturer", weight: 0.4 },
      ],
    });
    for (const v of variants) {
      for (const r of fuse.search(v)) {
        if (!matchedIds.has(r.item.item.id)) {
          ordered.push(r.item.item);
          matchedIds.add(r.item.item.id);
        }
      }
    }
  }
  return ordered.slice(0, limit);
}
