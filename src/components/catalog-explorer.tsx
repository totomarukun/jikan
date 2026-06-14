"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EquipmentVisual } from "@/components/equipment-visual";
import { searchEquipment, type SearchableItem } from "@/lib/search";
import { RUBBER_AXES } from "@/lib/axes";

// 用具カタログのブラウズ (探す/調べる の入口): 356件を比較データ無しでも
// 種類・メーカー・価格で絞り込み＋検索して詳細へ。ユーザーの思考「種類→メーカー→…」に対応。

export interface CatalogItem {
  id: string;
  name: string;
  manufacturer: string;
  category: string;
  hardness: number | null;
  price: number | null;
  imageUrl: string | null;
  bladeSubcategory: string | null;
  comparisons: number;
  popularity: number;
  /** 軸別スコア(0-100)。両方使った人の比較から推定。データが無い軸は欠落 */
  scores?: Record<string, number>;
}

// ダッシュボードのスコア列に出すラバー軸 (粘着は粘着系専用なので一覧には出さない)
const STRIP_AXES = RUBBER_AXES.filter((a) => !a.tackyOnly);
const AXIS_SHORT: Record<string, string> = {
  speed: "スピード",
  spin: "スピン",
  hardness: "かたさ",
  arc: "弧線",
  attackEase: "攻撃",
  defenseEase: "守備",
};

const CAT_LABEL: Record<string, string> = {
  RUBBER_INVERTED: "裏ソフト",
  RUBBER_PIMPLE_OUT: "表ソフト",
  RUBBER_PIMPLE_LONG: "粒高",
  RUBBER_ANTI: "アンチ",
  RUBBER_STICKY: "粘着",
  BLADE: "ラケット",
};

const PRICE_BANDS: Array<{ label: string; min: number; max: number }> = [
  { label: "〜2,000円", min: 0, max: 2000 },
  { label: "2,000〜4,000円", min: 2000, max: 4000 },
  { label: "4,000〜6,000円", min: 4000, max: 6000 },
  { label: "6,000〜8,000円", min: 6000, max: 8000 },
  { label: "8,000円〜", min: 8000, max: Infinity },
];

const HARDNESS_BANDS: Array<{ label: string; min: number; max: number }> = [
  { label: "軟（〜37°）", min: 0, max: 37 },
  { label: "中（37〜45°）", min: 37, max: 45 },
  { label: "硬（45〜50°）", min: 45, max: 50 },
  { label: "極硬（50°〜）", min: 50, max: Infinity },
];

type Kind = "all" | "rubber" | "blade";
// "popular" | "name" | "priceAsc" | "priceDesc" | "hardness" | "near" | 軸キー
type Sort = string;

export function CatalogExplorer({
  items,
  currentIds = [],
}: {
  items: CatalogItem[];
  currentIds?: string[];
}) {
  const [kind, setKind] = useState<Kind>("rubber");
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [mfr, setMfr] = useState("");
  const [band, setBand] = useState<number>(-1);
  const [hard, setHard] = useState<number>(-1);
  const [sort, setSort] = useState<Sort>("popular");
  const [showScores, setShowScores] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  // 比較する2本の選択 (ブラウズ→対決作成の導線)
  const [picked, setPicked] = useState<CatalogItem[]>([]);

  const currentSet = useMemo(() => new Set(currentIds), [currentIds]);
  // 現用ラバー(基準)の軸スコア。あれば「現用に近い順」と差分表示に使う。
  const baseline = useMemo(() => {
    const base = items.find((e) => currentSet.has(e.id));
    return base?.scores ?? null;
  }, [items, currentSet]);

  const togglePick = (item: CatalogItem) =>
    setPicked((cur) => {
      if (cur.some((p) => p.id === item.id))
        return cur.filter((p) => p.id !== item.id);
      return [...cur, item].slice(-2); // 直近2本を保持
    });

  const byKind = useMemo(
    () =>
      items.filter((e) =>
        kind === "all"
          ? true
          : kind === "blade"
            ? e.category === "BLADE"
            : e.category.startsWith("RUBBER_"),
      ),
    [items, kind],
  );

  const cats = useMemo(
    () =>
      [...new Set(byKind.map((e) => e.category))].filter(
        (c) => CAT_LABEL[c] && c !== "BLADE",
      ),
    [byKind],
  );
  const mfrs = useMemo(
    () =>
      [...new Set(byKind.map((e) => e.manufacturer))].sort((a, b) =>
        a.localeCompare(b, "ja"),
      ),
    [byKind],
  );

  const filtered = useMemo(() => {
    let list = byKind;
    if (cat) list = list.filter((e) => e.category === cat);
    if (mfr) list = list.filter((e) => e.manufacturer === mfr);
    if (band >= 0) {
      const { min, max } = PRICE_BANDS[band];
      list = list.filter((e) => e.price != null && e.price >= min && e.price < max);
    }
    if (hard >= 0) {
      const { min, max } = HARDNESS_BANDS[hard];
      list = list.filter(
        (e) => e.hardness != null && e.hardness >= min && e.hardness < max,
      );
    }
    if (query.trim()) {
      const matched = new Set(
        searchEquipment(list as SearchableItem[], query, { limit: 400 }).map(
          (x) => x.id,
        ),
      );
      list = list.filter((e) => matched.has(e.id));
    }
    const byName = (a: CatalogItem, b: CatalogItem) =>
      a.manufacturer.localeCompare(b.manufacturer, "ja") ||
      a.name.localeCompare(b.name, "ja");
    // 現用ラバーとの軸プロフィール距離 (小さいほど近い)
    const axisDist = (e: CatalogItem) => {
      if (!baseline || !e.scores) return Infinity;
      let sum = 0;
      let n = 0;
      for (const a of STRIP_AXES) {
        const v = e.scores[a.key];
        const b = baseline[a.key];
        if (typeof v === "number" && typeof b === "number") {
          sum += (v - b) ** 2;
          n++;
        }
      }
      return n ? Math.sqrt(sum / n) : Infinity;
    };
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sort === "popular") return b.popularity - a.popularity || byName(a, b);
      if (sort === "priceAsc") return (a.price ?? 1e9) - (b.price ?? 1e9);
      if (sort === "priceDesc") return (b.price ?? -1) - (a.price ?? -1);
      if (sort === "hardness") return (b.hardness ?? -1) - (a.hardness ?? -1);
      if (sort === "near") return axisDist(a) - axisDist(b) || byName(a, b);
      if (sort.startsWith("axis:")) {
        const k = sort.slice(5);
        const av = typeof a.scores?.[k] === "number" ? a.scores![k] : -1;
        const bv = typeof b.scores?.[k] === "number" ? b.scores![k] : -1;
        return bv - av || byName(a, b);
      }
      return byName(a, b);
    });
    return sorted;
  }, [byKind, cat, mfr, band, hard, query, sort, baseline]);

  // タイプ即サジェスト: 候補から用具詳細へ直接ジャンプできる (≤6件)
  const suggestions = useMemo(
    () =>
      query.trim().length >= 1
        ? searchEquipment(byKind, query, { limit: 6 })
        : [],
    [byKind, query],
  );

  // 適用中フィルタ (常に見える・個別に外せる)
  const activeFilters: Array<{ id: string; label: string; clear: () => void }> =
    [];
  if (cat)
    activeFilters.push({
      id: "cat",
      label: CAT_LABEL[cat] ?? cat,
      clear: () => setCat(null),
    });
  if (mfr)
    activeFilters.push({ id: "mfr", label: mfr, clear: () => setMfr("") });
  if (band >= 0)
    activeFilters.push({
      id: "band",
      label: PRICE_BANDS[band].label,
      clear: () => setBand(-1),
    });
  if (hard >= 0)
    activeFilters.push({
      id: "hard",
      label: HARDNESS_BANDS[hard].label,
      clear: () => setHard(-1),
    });
  const clearAll = () => {
    setCat(null);
    setMfr("");
    setBand(-1);
    setHard(-1);
  };

  return (
    <div>
      {/* ラバー/ラケット */}
      <div className="flex gap-1.5">
        {(
          [
            ["rubber", "ラバー"],
            ["blade", "ラケット"],
            ["all", "すべて"],
          ] as const
        ).map(([k, label]) => (
          <Chip
            key={k}
            active={kind === k}
            onClick={() => {
              setKind(k);
              setCat(null);
              setPicked([]);
            }}
          >
            {label}
          </Chip>
        ))}
      </div>

      {/* 検索 + サジェスト (タイプして候補から直接ジャンプ) */}
      <div className="relative mt-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          placeholder="用具名で検索（ひらがな・英語・ローマ字OK 例: rozena）"
          className="block w-full rounded-full border border-tt-gray30/50 bg-white px-4 py-2.5 pr-10 text-sm shadow-sm focus:border-tt-green focus:outline-none"
        />
        {query && (
          <button
            type="button"
            aria-label="検索をクリア"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setQuery("")}
            className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-tt-gray30/40 text-sm text-tt-gray70 transition hover:bg-tt-gray30/70"
          >
            ×
          </button>
        )}
        {focused && suggestions.length > 0 && (
          <ul className="absolute z-30 mt-1 w-full overflow-hidden rounded-2xl border border-tt-gray30/50 bg-white shadow-lg">
            {suggestions.map((s) => (
              <li
                key={s.id}
                className="border-b border-tt-gray30/20 last:border-0"
              >
                <Link
                  href={`/equipment/${s.id}`}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm transition hover:bg-tt-soft-green"
                >
                  <EquipmentVisual
                    category={s.category}
                    manufacturer={s.manufacturer}
                    imageUrl={s.imageUrl}
                    bladeSubcategory={s.bladeSubcategory}
                    name={s.name}
                    size={24}
                  />
                  <span className="truncate font-bold">{s.name}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-tt-gray70">
                    {s.manufacturer}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 並べ替え + 絞り込み開閉 */}
      <div className="mt-2 flex gap-2">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="min-w-0 flex-1 rounded-full border border-tt-gray30/50 bg-white px-3 py-2 text-sm"
        >
          <optgroup label="並べ替え">
            <option value="popular">人気順</option>
            <option value="name">メーカー順</option>
            <option value="priceAsc">価格が安い順</option>
            <option value="priceDesc">価格が高い順</option>
            <option value="hardness">硬度が高い順</option>
            {baseline && <option value="near">現用に近い順</option>}
          </optgroup>
          {kind !== "blade" && (
            <optgroup label="特徴スコアが高い順">
              {STRIP_AXES.map((a) => (
                <option key={a.key} value={`axis:${a.key}`}>
                  {a.label}が高い順
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          className={`flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-bold transition ${
            filtersOpen || activeFilters.length > 0
              ? "border-tt-green bg-tt-soft-green text-tt-deep-green"
              : "border-tt-gray30/50 bg-white text-tt-gray70"
          }`}
        >
          絞り込み
          {activeFilters.length > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-tt-deep-green px-1 text-[10px] text-white">
              {activeFilters.length}
            </span>
          )}
        </button>
      </div>

      {/* 適用中フィルタ (常に見える・個別に外せる) */}
      {activeFilters.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {activeFilters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={f.clear}
              className="flex items-center gap-1 rounded-full bg-tt-soft-green px-2.5 py-1 text-xs font-bold text-tt-deep-green transition hover:bg-tt-green/15"
            >
              {f.label}
              <span className="text-tt-deep-green/60">×</span>
            </button>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="ml-1 text-xs font-bold text-tt-gray70 underline"
          >
            すべて解除
          </button>
        </div>
      )}

      {/* 絞り込みパネル (折りたたみ。普段は閉じてスッキリ) */}
      {filtersOpen && (
        <div className="mt-3 space-y-3 rounded-2xl bg-tt-offwhite p-3 ring-1 ring-black/5">
          {cats.length > 1 && (
            <div>
              <p className="mb-1 text-[11px] font-bold text-tt-gray70">種類</p>
              <div className="flex flex-wrap gap-1.5">
                <Chip active={cat === null} onClick={() => setCat(null)}>
                  すべて
                </Chip>
                {cats.map((c) => (
                  <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
                    {CAT_LABEL[c]}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2">
            <select
              value={mfr}
              onChange={(e) => setMfr(e.target.value)}
              className="rounded-full border border-tt-gray30/50 bg-white px-3 py-2 text-sm"
            >
              <option value="">すべてのメーカー</option>
              {mfrs.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <select
              value={band}
              onChange={(e) => setBand(Number(e.target.value))}
              className="rounded-full border border-tt-gray30/50 bg-white px-3 py-2 text-sm"
            >
              <option value={-1}>すべての価格</option>
              {PRICE_BANDS.map((p, i) => (
                <option key={p.label} value={i}>
                  {p.label}
                </option>
              ))}
            </select>
            {kind !== "blade" && (
              <select
                value={hard}
                onChange={(e) => setHard(Number(e.target.value))}
                className="rounded-full border border-tt-gray30/50 bg-white px-3 py-2 text-sm"
              >
                <option value={-1}>すべての硬度</option>
                {HARDNESS_BANDS.map((h, i) => (
                  <option key={h.label} value={i}>
                    {h.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-xs text-tt-gray70">
        <div className="flex items-center gap-3">
          <span>
            <span className="font-mono font-bold text-tt-charcoal">
              {filtered.length}
            </span>
            件
          </span>
          {kind !== "blade" && (
            <button
              onClick={() => setShowScores((v) => !v)}
              className="font-bold text-tt-green underline"
            >
              {showScores ? "スコアを隠す" : "スコアを表示"}
            </button>
          )}
        </div>
      </div>

      {showScores && baseline && (
        <p className="mt-2 text-[11px] leading-5 text-tt-gray70">
          スコアの数字は<span className="font-bold text-tt-charcoal">現用ラバー</span>
          との差（<span className="font-bold text-tt-deep-green">+</span>が上 /{" "}
          <span className="font-bold text-tt-deep-coral">−</span>が下）。
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="mt-4 rounded-2xl border-2 border-dashed border-tt-gray30/50 p-8 text-center text-sm text-tt-gray70">
          該当する用具がありません。
        </div>
      ) : (
        <ul className="mt-3 space-y-2 pb-20">
          {filtered.map((e) => {
            const isPicked = picked.some((p) => p.id === e.id);
            const isCurrentBase = currentSet.has(e.id);
            return (
              <li
                key={e.id}
                className={`rounded-xl bg-white p-3 shadow-sm ring-1 transition ${
                  isCurrentBase
                    ? "ring-tt-green/70"
                    : isPicked
                      ? "ring-tt-green/60"
                      : "ring-black/5"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Link
                    href={`/equipment/${e.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <EquipmentVisual
                      category={e.category}
                      manufacturer={e.manufacturer}
                      imageUrl={e.imageUrl}
                      bladeSubcategory={e.bladeSubcategory}
                      name={e.name}
                      size={36}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-bold">
                        <span className="truncate">{e.name}</span>
                        {isCurrentBase && (
                          <span className="shrink-0 rounded-full bg-tt-charcoal px-1.5 py-0.5 text-[9px] font-bold text-white">
                            現用
                          </span>
                        )}
                        {e.comparisons > 0 && (
                          <span className="shrink-0 rounded-full bg-tt-soft-green px-1.5 py-0.5 text-[9px] font-bold text-tt-deep-green">
                            比較{e.comparisons}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-tt-gray70">
                        {e.manufacturer} ・ {CAT_LABEL[e.category] ?? ""}
                        {e.hardness != null && ` ・ ${e.hardness}°`}
                        {e.price != null && ` ・ ¥${e.price.toLocaleString()}`}
                      </p>
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={() => togglePick(e)}
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold transition ${
                      isPicked
                        ? "bg-tt-deep-green text-white"
                        : "bg-tt-offwhite text-tt-gray70 ring-1 ring-tt-gray30/50 hover:bg-tt-soft-green"
                    }`}
                  >
                    {isPicked ? "選択中" : "比較"}
                  </button>
                </div>
                {showScores && e.category.startsWith("RUBBER_") && (
                  <ScoreStrip
                    scores={e.scores}
                    baseline={baseline && !isCurrentBase ? baseline : null}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* 比較バー: 2本選ぶと対決ページへ */}
      {picked.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-tt-gray30/40 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-md items-center gap-2 px-4 py-3">
            <div className="min-w-0 flex-1 truncate text-xs">
              <span className="font-bold">{picked[0].name}</span>
              {picked[1] && (
                <>
                  <span className="mx-1 text-tt-gray30">vs</span>
                  <span className="font-bold">{picked[1].name}</span>
                </>
              )}
              {picked.length < 2 && (
                <span className="text-tt-gray70">
                  {" "}
                  ・ もう1本選ぶと比較できます
                </span>
              )}
            </div>
            <button
              onClick={() => setPicked([])}
              className="shrink-0 text-xs text-tt-gray70 underline"
            >
              解除
            </button>
            {picked.length === 2 ? (
              <Link
                href={`/compare/${picked[0].id}/vs/${picked[1].id}`}
                className="shrink-0 rounded-full bg-gradient-to-r from-tt-green to-tt-deep-green px-4 py-2 text-xs font-bold text-white"
              >
                比較する →
              </Link>
            ) : (
              <span className="shrink-0 rounded-full bg-tt-gray30/40 px-4 py-2 text-xs font-bold text-tt-gray70">
                比較する →
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// 軸スコアの一覧帯。基準(現用)があるときは差分(+/-)を、無ければ絶対スコア(0-100)を出す。
function ScoreStrip({
  scores,
  baseline,
}: {
  scores?: Record<string, number>;
  baseline?: Record<string, number> | null;
}) {
  return (
    <div className="mt-2 grid grid-cols-3 gap-x-2.5 gap-y-1">
      {STRIP_AXES.map((a) => {
        const v = scores?.[a.key];
        const has = typeof v === "number";
        const bv = baseline?.[a.key];
        const delta =
          has && typeof bv === "number" ? Math.round(v - bv) : null;
        return (
          <div key={a.key} className="flex items-center gap-1">
            <span className="w-9 shrink-0 text-[9px] text-tt-gray70">
              {AXIS_SHORT[a.key]}
            </span>
            <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-tt-gray30/30">
              {has && (
                <span
                  className="block h-1.5 rounded-full bg-gradient-to-r from-tt-green to-tt-deep-green"
                  style={{ width: `${Math.max(4, Math.round(v))}%` }}
                />
              )}
            </span>
            <span className="w-7 shrink-0 text-right font-mono text-[9px] tabular-nums">
              {!has ? (
                <span className="text-tt-gray30">–</span>
              ) : delta != null ? (
                <span
                  className={
                    delta > 0
                      ? "text-tt-deep-green"
                      : delta < 0
                        ? "text-tt-deep-coral"
                        : "text-tt-gray70"
                  }
                >
                  {delta > 0 ? `+${delta}` : delta}
                </span>
              ) : (
                <span className="text-tt-gray70">{Math.round(v)}</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-bold transition ${
        active
          ? "bg-tt-deep-green text-white"
          : "bg-white text-tt-gray70 ring-1 ring-tt-gray30/50 hover:bg-tt-soft-green"
      }`}
    >
      {children}
    </button>
  );
}
