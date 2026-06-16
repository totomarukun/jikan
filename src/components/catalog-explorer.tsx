"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EquipmentVisual } from "@/components/equipment-visual";
import { searchEquipment, type SearchableItem } from "@/lib/search";
import { RUBBER_AXES } from "@/lib/axes";
import { rubberGroup } from "@/lib/types";
import { EmptyState } from "@/components/ui/empty-state";

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
type View = "list" | "map" | "cost" | "compare";

export function CatalogExplorer({
  items,
  currentIds = [],
  gearRubbers = [],
  initialBaseId = null,
  initialView = "list",
  initialCat = null,
  initialMapAxis = "speed",
}: {
  items: CatalogItem[];
  currentIds?: string[];
  gearRubbers?: Array<{ id: string; name: string }>;
  initialBaseId?: string | null;
  initialView?: View;
  initialCat?: string | null;
  initialMapAxis?: string;
}) {
  const [view, setView] = useState<View>(initialView);
  const [mapAxis, setMapAxis] = useState<string>(initialMapAxis);
  const [kind, setKind] = useState<Kind>("rubber");
  const [query, setQuery] = useState("");
  const [baseId, setBaseId] = useState<string | null>(initialBaseId);
  const [basePickerOpen, setBasePickerOpen] = useState(false);
  const [cat, setCat] = useState<string | null>(initialCat);
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
  // 基準ラバー: これを置くと一覧/分布/くらべるが「自分基準(差分・近い順)」になる。
  const baseItem = useMemo(
    () => items.find((e) => e.id === baseId) ?? null,
    [items, baseId],
  );
  const baseline = baseItem?.scores ?? null;
  // 基準ラバーの比較可能グループ(表/裏系/粒高/アンチ)。基準を置くと一覧・分布を
  // この種類の中だけに閉じる (種類を跨いだ差分・近い順は意味を成さないため)。
  const baseGroup = useMemo(
    () => (baseItem ? rubberGroup(baseItem.category) : null),
    [baseItem],
  );

  const togglePick = (item: CatalogItem) =>
    setPicked((cur) => {
      if (cur.some((p) => p.id === item.id))
        return cur.filter((p) => p.id !== item.id);
      return [...cur, item].slice(-2); // 直近2本を保持
    });

  const byKind = useMemo(
    () =>
      items.filter((e) => {
        if (kind === "blade") return e.category === "BLADE";
        const isRubber = e.category.startsWith("RUBBER_");
        if (kind === "rubber" && !isRubber) return false;
        // 基準ラバーがあるとき、ラバーは同じ比較可能グループだけに残す。
        // (表ソフト基準に裏ソフトを「近い順」で混ぜない。詳細/分布と同じ種類隔離)
        if (baseGroup && isRubber && rubberGroup(e.category) !== baseGroup)
          return false;
        return true;
      }),
    [items, kind, baseGroup],
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
              if (k === "blade") setView("list");
            }}
          >
            {label}
          </Chip>
        ))}
      </div>

      {/* ビュー切替: 一覧(表) / 分布(マップ) / くらべる (ラバーのみ) */}
      {kind !== "blade" && (
        <div className="mt-3 grid grid-cols-4 gap-1 rounded-full bg-tt-offwhite p-1">
          {(
            [
              ["list", "一覧"],
              ["map", "分布"],
              ["cost", "コスパ"],
              ["compare", "くらべる"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-full py-1.5 text-xs font-bold transition ${
                view === v
                  ? "bg-white text-tt-deep-green shadow-sm"
                  : "text-tt-gray70"
              }`}
            >
              {label}
              {v === "compare" && picked.length > 0 ? `（${picked.length}）` : ""}
            </button>
          ))}
        </div>
      )}

      {/* 基準ピッカー: 基準を置くと全ビューが自分基準(差分・近い順)になる */}
      {kind !== "blade" && (
        <BasePicker
          baseItem={baseItem}
          gearRubbers={gearRubbers}
          items={items}
          open={basePickerOpen}
          setOpen={setBasePickerOpen}
          onSet={(id) => {
            setBaseId(id);
            setBasePickerOpen(false);
          }}
          onClear={() => setBaseId(null)}
        />
      )}

      {view !== "compare" && (
        <>
      {/* 検索 + サジェスト (タイプして候補から直接ジャンプ) */}
      <div className="relative mt-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          placeholder="用具名で検索（ひらがな・英語・ローマ字OK 例: rozena）"
          className="block w-full rounded-full border border-tt-gray30/50 bg-white px-4 py-2.5 pr-10 text-sm focus:border-tt-green focus:outline-none"
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
          <ul className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-tt-gray30/50 bg-white shadow-lg">
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
        {view === "map" || view === "cost" ? (
          <select
            value={mapAxis}
            onChange={(e) => setMapAxis(e.target.value)}
            className="min-w-0 flex-1 rounded-full border border-tt-gray30/50 bg-white px-3 py-2 text-sm"
          >
            {STRIP_AXES.map((a) => (
              <option key={a.key} value={a.key}>
                {view === "cost" ? `価格×${a.label}` : `${a.label}で並べる`}
              </option>
            ))}
          </select>
        ) : (
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
              {baseline && <option value="near">基準に近い順</option>}
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
        )}
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
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-tt-deep-green px-1 text-[11px] text-white">
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
        <div className="mt-3 space-y-3 rounded-xl bg-tt-offwhite p-3 ring-1 ring-black/5">
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
        </>
      )}

      {view === "list" && (
        <>
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
          スコアの数字は
          <span className="font-bold text-tt-charcoal">
            基準「{baseItem?.name}」
          </span>
          との差（<span className="font-bold text-tt-deep-green">+</span>が上 /{" "}
          <span className="font-bold text-tt-deep-coral">−</span>が下）。「少」は実比較3件未満。
        </p>
      )}
      {showScores && !baseline && (
        <p className="mt-2 text-[11px] leading-5 text-tt-gray70">
          スコアは使った人の比較から推定した相対位置（0-100）。
          「少」は実比較が3件未満で、まだ位置を確定できないものです。
        </p>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          className="mt-4"
          title="該当する用具がありません"
          description="検索語や絞り込みを変えてみてください。"
        />
      ) : (
        <ul className="mt-3 space-y-2 pb-20">
          {filtered.map((e) => {
            const isPicked = picked.some((p) => p.id === e.id);
            const isBase = e.id === baseId;
            const isCurrent = currentSet.has(e.id);
            return (
              <li
                key={e.id}
                className={`rounded-xl bg-white p-3 ring-1 transition ${
                  isBase
                    ? "ring-2 ring-tt-green"
                    : isPicked
                      ? "ring-tt-green/60"
                      : "ring-tt-gray30/40"
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
                        {isBase ? (
                          <span className="shrink-0 rounded-full bg-tt-deep-green px-1.5 py-0.5 text-[9px] font-bold text-white">
                            基準
                          </span>
                        ) : (
                          isCurrent && (
                            <span className="shrink-0 rounded-full bg-tt-charcoal px-1.5 py-0.5 text-[9px] font-bold text-white">
                              現用
                            </span>
                          )
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
                  <div className="flex shrink-0 items-center gap-1.5">
                    {!isBase && e.category.startsWith("RUBBER_") && (
                      <button
                        type="button"
                        onClick={() => setBaseId(e.id)}
                        title="このラバーを基準にする"
                        className="rounded-full px-2 py-1 text-[11px] font-bold text-tt-gray70 ring-1 ring-tt-gray30/50 transition hover:bg-tt-soft-green hover:text-tt-deep-green"
                      >
                        基準に
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => togglePick(e)}
                      className={`rounded-full px-2.5 py-1 text-xs font-bold transition ${
                        isPicked
                          ? "bg-tt-deep-green text-white"
                          : "bg-tt-offwhite text-tt-gray70 ring-1 ring-tt-gray30/50 hover:bg-tt-soft-green"
                      }`}
                    >
                      {isPicked ? "選択中" : "比較"}
                    </button>
                  </div>
                </div>
                {showScores && e.category.startsWith("RUBBER_") && (
                  <ScoreStrip
                    scores={e.scores}
                    baseline={baseline && !isBase ? baseline : null}
                    comparisons={e.comparisons}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
        </>
      )}

      {/* 分布 (マップ): 選んだ軸でラバーを相対位置に並べる。基準ラバーを強調 */}
      {view === "map" && (
        <MapBars
          items={filtered}
          axisKey={mapAxis}
          baseId={baseId}
          currentSet={currentSet}
        />
      )}

      {/* コスパ: 価格×選んだ軸スコアの2軸散布(価格は確定値なので疎データでも団子化しない) */}
      {view === "cost" && (
        <CostScatter
          items={filtered}
          axisKey={mapAxis}
          baseId={baseId}
          currentSet={currentSet}
        />
      )}

      {/* くらべる: 選んだ2本を軸ごとに見比べる */}
      {view === "compare" && (
        <CompareView
          picked={picked}
          onGoList={() => setView("list")}
          onClear={() => setPicked([])}
        />
      )}

      {/* 比較バー: 2本選ぶと対決ページへ (一覧・分布のみ) */}
      {view !== "compare" && picked.length > 0 && (
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
                className="shrink-0 rounded-full bg-tt-green px-4 py-2 text-xs font-bold text-white"
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
// 支持(実比較本数)が薄いと0-100は1票で100/0に飽和し「満点ラバー」と誤読されるため、
// 閾値未満は数値を断定せず「少」表示・バーをグレーに縮約する(他画面の非断定ルールと統一)。
function ScoreStrip({
  scores,
  baseline,
  comparisons,
}: {
  scores?: Record<string, number>;
  baseline?: Record<string, number> | null;
  comparisons: number;
}) {
  const low = comparisons < 3;
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
                  className={`block h-1.5 rounded-full ${low ? "bg-tt-gray30" : "bg-tt-green"}`}
                  style={{ width: `${Math.max(4, Math.round(v))}%` }}
                />
              )}
            </span>
            <span className="w-7 shrink-0 text-right font-mono text-[9px] tabular-nums">
              {!has ? (
                <span className="text-tt-gray30">–</span>
              ) : low ? (
                <span className="text-tt-gray30" title="データ少なめ">
                  少
                </span>
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

// 基準ピッカー: 基準ラバーを置く/変える/外す。基準ありで全ビューが自分基準になる。
// マイギアからワンタップ、または検索で任意のラバーを基準にできる。
function BasePicker({
  baseItem,
  gearRubbers,
  items,
  open,
  setOpen,
  onSet,
  onClear,
}: {
  baseItem: CatalogItem | null;
  gearRubbers: Array<{ id: string; name: string }>;
  items: CatalogItem[];
  open: boolean;
  setOpen: (v: boolean) => void;
  onSet: (id: string) => void;
  onClear: () => void;
}) {
  const [q, setQ] = useState("");
  const results =
    q.trim().length >= 1
      ? searchEquipment(
          items.filter((e) => e.category.startsWith("RUBBER_")),
          q,
          { limit: 6 },
        )
      : [];
  return (
    <div className="mt-3 rounded-xl bg-tt-soft-green/50 p-2.5 ring-1 ring-tt-green/20">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[11px] font-bold text-tt-deep-green">
          基準
        </span>
        {baseItem ? (
          <span className="min-w-0 flex-1 truncate text-sm font-bold">
            {baseItem.name}
          </span>
        ) : (
          <span className="min-w-0 flex-1 text-sm text-tt-gray70">
            未設定（全体スコアで表示）
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-bold text-tt-deep-green ring-1 ring-tt-green/30"
        >
          {baseItem ? "変える" : "基準を選ぶ"}
        </button>
        {baseItem && (
          <button
            type="button"
            onClick={onClear}
            aria-label="基準を解除"
            className="shrink-0 px-1 text-tt-gray70"
          >
            ✕
          </button>
        )}
      </div>

      {baseItem && (
        <p className="mt-1 text-[11px] leading-5 text-tt-gray70">
          {CAT_LABEL[baseItem.category] ?? "同じ種類"}の中で「{baseItem.name}
          」基準（差分・近い順）に。
          <Link
            href={`/switch?base=${baseItem.id}`}
            className="ml-1 font-bold text-tt-deep-green underline"
          >
            乗り換えをじっくり検討 →
          </Link>
        </p>
      )}

      {open && (
        <div className="mt-2 rounded-xl bg-white p-2.5 ring-1 ring-black/5">
          {gearRubbers.length > 0 && (
            <div className="mb-2">
              <p className="mb-1 text-[11px] font-bold text-tt-gray70">
                マイギアから
              </p>
              <div className="flex flex-wrap gap-1.5">
                {gearRubbers.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => onSet(g.id)}
                    className="rounded-full bg-tt-offwhite px-2.5 py-1 text-xs font-bold text-tt-charcoal ring-1 ring-tt-gray30/50 transition hover:bg-tt-soft-green"
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="基準にするラバーを検索"
            className="block w-full rounded-full border border-tt-gray30/50 bg-white px-3 py-2 text-sm focus:border-tt-green focus:outline-none"
          />
          {results.length > 0 && (
            <ul className="mt-1.5 space-y-1">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSet(r.id);
                      setQ("");
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-tt-soft-green"
                  >
                    <span className="truncate font-bold">{r.name}</span>
                    <span className="ml-auto shrink-0 text-[11px] text-tt-gray70">
                      {r.manufacturer}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// コスパ(価格×軸)ビュー: 横軸=価格(確定値)、縦軸=選んだ軸スコア(使った人の比較)。
// 片軸が確定値の価格なので疎データでも団子化しない(planning-anchor)。
// 左上(安くて強い)がコスパ良し。価格と比較データが両方ある用具のみ。
function CostScatter({
  items,
  axisKey,
  baseId,
  currentSet,
}: {
  items: CatalogItem[];
  axisKey: string;
  baseId: string | null;
  currentSet: Set<string>;
}) {
  const meta = STRIP_AXES.find((a) => a.key === axisKey);
  const pts = items
    .filter((e) => e.category.startsWith("RUBBER_"))
    .map((e) => ({ e, price: e.price, score: e.scores?.[axisKey] }))
    .filter(
      (x): x is { e: CatalogItem; price: number; score: number } =>
        typeof x.price === "number" && typeof x.score === "number",
    );
  if (pts.length < 2) {
    return (
      <div className="mt-4 rounded-xl border-2 border-dashed border-tt-gray30/50 p-8 text-center text-sm leading-6 text-tt-gray70">
        この軸はまだ比較データが少なく、コスパの散布を出せません。
        <br />
        比較に答えると、価格と特徴の地図が育ちます。
      </div>
    );
  }
  const prices = pts.map((p) => p.price);
  const pmin = Math.min(...prices);
  const pmax = Math.max(...prices);
  const xOf = (p: number) => (pmax === pmin ? 50 : ((p - pmin) / (pmax - pmin)) * 100);
  // コスパ = 高スコア & 低価格。安いほど・強いほど上位。
  const ranked = [...pts].sort(
    (a, b) => b.score - xOf(b.price) * 0.6 - (a.score - xOf(a.price) * 0.6),
  );
  return (
    <div className="mt-3 pb-20">
      <p className="mb-2 text-[11px] leading-5 text-tt-gray70">
        横軸=価格、縦軸={meta?.label ?? ""}。
        <span className="font-bold text-tt-deep-green">左上＝安くて{meta?.high ?? "強い"}</span>
        ＝コスパ良し。価格は確定値、{meta?.label ?? ""}は使った人の比較から推定（
        <span className="text-tt-gray30">少</span>はデータ少なめ）。
      </p>
      {/* 散布図 */}
      <div className="relative h-56 rounded-xl bg-tt-offwhite ring-1 ring-tt-gray30/30">
        {/* 左上=コスパ良しの淡い強調 */}
        <div className="pointer-events-none absolute left-0 top-0 h-1/2 w-1/2 rounded-tl-xl bg-tt-soft-green/40" />
        {pts.map(({ e, price, score }) => {
          const x = xOf(price);
          const y = score;
          const isBase = e.id === baseId;
          const isCur = currentSet.has(e.id);
          const low = e.comparisons < 3;
          return (
            <Link
              key={e.id}
              href={`/equipment/${e.id}`}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${x}%`, top: `${100 - y}%` }}
              title={`${e.name} ¥${price.toLocaleString()} / ${meta?.label}${Math.round(score)}`}
            >
              <span
                className={`block h-2.5 w-2.5 rounded-full ring-2 ring-white ${
                  isBase
                    ? "bg-tt-deep-green"
                    : isCur
                      ? "bg-tt-charcoal"
                      : low
                        ? "bg-tt-gray30"
                        : "bg-tt-green"
                }`}
              />
            </Link>
          );
        })}
        <span className="absolute bottom-1 left-2 text-[10px] text-tt-gray70">
          ← 安い
        </span>
        <span className="absolute bottom-1 right-2 text-[10px] text-tt-gray70">
          高い →
        </span>
        <span className="absolute left-2 top-1 text-[10px] font-bold text-tt-deep-green">
          {meta?.high ?? "強い"} ↑
        </span>
      </div>
      {/* コスパ上位リスト(散布の名前を補う) */}
      <p className="mt-3 text-xs font-bold">
        コスパ上位（安くて{meta?.high ?? "強い"}）
      </p>
      <ul className="mt-2 space-y-1.5">
        {ranked.slice(0, 6).map(({ e, price, score }) => {
          const low = e.comparisons < 3;
          return (
            <li key={e.id}>
              <Link
                href={`/equipment/${e.id}`}
                className="flex items-center gap-2 rounded-lg bg-white p-2.5 text-sm ring-1 ring-tt-gray30/40 transition hover:bg-tt-soft-green"
              >
                <EquipmentVisual
                  category={e.category}
                  manufacturer={e.manufacturer}
                  imageUrl={e.imageUrl}
                  name={e.name}
                  size={22}
                />
                <span className="min-w-0 flex-1 truncate font-bold">
                  {e.name}
                </span>
                <span className="shrink-0 font-mono text-xs text-tt-gray70">
                  ¥{price.toLocaleString()} ・ {meta?.label}
                  {low ? (
                    <span className="text-tt-gray30">少</span>
                  ) : (
                    Math.round(score)
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// 分布(マップ)ビュー: 選んだ軸でラバーを相対位置(0-100)に並べる。基準は太枠で強調。
function MapBars({
  items,
  axisKey,
  baseId,
  currentSet,
}: {
  items: CatalogItem[];
  axisKey: string;
  baseId: string | null;
  currentSet: Set<string>;
}) {
  const meta = STRIP_AXES.find((a) => a.key === axisKey);
  const rubbers = items.filter((e) => e.category.startsWith("RUBBER_"));
  const ranked = rubbers
    .map((e) => ({ e, v: e.scores?.[axisKey] }))
    .filter((x): x is { e: CatalogItem; v: number } => typeof x.v === "number")
    .sort((a, b) => b.v - a.v);
  const pending = rubbers.length - ranked.length;
  // 現用基準の距離マップ: 基準ラバーにその軸のスコアがあれば、中央=基準として
  // 「あなたの基準より速い/遅い」を距離で見せる(コア価値=自分基準で相対的に分かる)。
  const baseItem = baseId ? items.find((e) => e.id === baseId) : null;
  const baseScore =
    baseItem && typeof baseItem.scores?.[axisKey] === "number"
      ? (baseItem.scores![axisKey] as number)
      : null;
  const centered = baseScore !== null;
  const baseName = baseItem?.name ?? "";

  if (ranked.length === 0) {
    return (
      <div className="mt-4 rounded-xl border-2 border-dashed border-tt-gray30/50 p-8 text-center text-sm leading-6 text-tt-gray70">
        この軸はまだ比較データが少なく、分布を出せません。
        <br />
        「一覧」から探すか、比較に答えると地図が育ちます。
      </div>
    );
  }
  return (
    <div className="mt-3 pb-20">
      <p className="mb-2 text-[11px] leading-5 text-tt-gray70">
        {centered ? (
          <>
            中央の
            <span className="font-bold text-tt-deep-green">「{baseName}」</span>
            を基準に、{meta?.label ?? ""}が
            <span className="font-bold text-tt-deep-green">右＝強い</span> /{" "}
            <span className="font-bold text-tt-deep-coral">左＝弱い</span>
            。
          </>
        ) : (
          <>
            この軸で比較データのある{" "}
            <span className="font-mono font-bold text-tt-charcoal">
              {ranked.length}
            </span>
            本を表示中
          </>
        )}
        {pending > 0 && (
          <>
            （残り
            <span className="font-mono">{pending}</span>
            本はまだ比較が少なく位置を出せません）
          </>
        )}
        。
      </p>
      {meta && (
        <div className="mb-2 flex justify-between text-[11px] text-tt-gray70">
          <span>
            ← {centered ? `${baseName}より` : ""}
            {meta.low}
          </span>
          <span className="font-bold text-tt-deep-green">
            {centered ? `${baseName}より` : ""}
            {meta.high} →
          </span>
        </div>
      )}
      <ul className="space-y-2">
        {ranked.map(({ e, v }) => {
          const pct = Math.round(v);
          const isBase = e.id === baseId;
          const isCur = currentSet.has(e.id);
          const low = e.comparisons < 3;
          // 距離マップ: 基準との差(delta)。中央50%を基準に左右へ。
          const delta = centered ? Math.round(v - baseScore!) : 0;
          const pos = centered
            ? 50 + Math.max(-100, Math.min(100, v - baseScore!)) / 2
            : 0;
          return (
            <li key={e.id}>
              <Link
                href={`/equipment/${e.id}`}
                className={`block rounded-xl bg-white p-3 ring-1 transition hover:-translate-y-0.5 hover:shadow-md ${
                  isBase ? "ring-2 ring-tt-green" : "ring-tt-gray30/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <EquipmentVisual
                    category={e.category}
                    manufacturer={e.manufacturer}
                    imageUrl={e.imageUrl}
                    bladeSubcategory={e.bladeSubcategory}
                    name={e.name}
                    size={24}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">
                    {e.name}
                    {isBase ? (
                      <span className="ml-1.5 rounded-full bg-tt-deep-green px-1.5 py-0.5 text-[9px] font-bold text-white">
                        基準
                      </span>
                    ) : (
                      isCur && (
                        <span className="ml-1.5 rounded-full bg-tt-charcoal px-1.5 py-0.5 text-[9px] font-bold text-white">
                          現用
                        </span>
                      )
                    )}
                  </span>
                  <span className="shrink-0 font-mono text-xs">
                    {low ? (
                      <span className="text-tt-gray30" title="データ少なめ">
                        少
                      </span>
                    ) : centered ? (
                      <span
                        className={
                          delta > 0
                            ? "text-tt-deep-green"
                            : delta < 0
                              ? "text-tt-deep-coral"
                              : "text-tt-gray70"
                        }
                      >
                        {isBase ? "基準" : delta > 0 ? `+${delta}` : delta}
                      </span>
                    ) : (
                      <span className="text-tt-gray70">{pct}</span>
                    )}
                  </span>
                </div>
                {centered ? (
                  // 中央=基準。基準より右(緑)=強い / 左(コーラル)=弱い。
                  <div className="relative mt-1.5 h-2 rounded-full bg-tt-gray30/30">
                    <div className="absolute left-1/2 top-[-2px] h-3 w-px -translate-x-1/2 bg-tt-gray30" />
                    {!low && delta !== 0 && (
                      <div
                        className={`absolute top-0 h-2 rounded-full ${
                          delta > 0 ? "bg-tt-green" : "bg-tt-coral"
                        }`}
                        style={{
                          left: delta > 0 ? "50%" : `${pos}%`,
                          width: `${Math.abs(v - baseScore!) / 2}%`,
                        }}
                      />
                    )}
                    {isBase && (
                      <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-tt-deep-green" />
                    )}
                  </div>
                ) : (
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-tt-gray30/30">
                    <div
                      className={`h-2 rounded-full ${
                        low ? "bg-tt-gray30" : "bg-tt-green"
                      }`}
                      style={{ width: `${Math.max(4, pct)}%` }}
                    />
                  </div>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-[11px] leading-5 text-tt-gray70">
        ※メーカーの数値ではなく、使った人の比較から推定した相対位置です。
        「少」グレーは実比較が3件未満で、まだ位置を確定できないものです。
      </p>
    </div>
  );
}

// くらべるビュー: 選んだ2本を軸ごとに上下のバーで見比べる。
function CompareView({
  picked,
  onGoList,
  onClear,
}: {
  picked: CatalogItem[];
  onGoList: () => void;
  onClear: () => void;
}) {
  if (picked.length < 2) {
    return (
      <div className="mt-4 rounded-xl border-2 border-dashed border-tt-gray30/50 p-8 text-center text-sm leading-6 text-tt-gray70">
        くらべたいラバーを
        <span className="font-bold text-tt-charcoal">2本</span>えらびます。
        {picked.length === 1 && (
          <p className="mt-1">
            いま選択中: <span className="font-bold">{picked[0].name}</span>
          </p>
        )}
        <button
          type="button"
          onClick={onGoList}
          className="mt-3 inline-block rounded-full bg-tt-green px-5 py-2 text-xs font-bold text-white"
        >
          一覧から選ぶ →
        </button>
      </div>
    );
  }
  const [a, b] = picked;
  return (
    <div className="mt-3 pb-20">
      <div className="grid grid-cols-2 gap-2">
        {[a, b].map((e, i) => (
          <Link
            key={e.id}
            href={`/equipment/${e.id}`}
            className={`rounded-xl p-3 text-center ring-1 ${
              i === 0
                ? "bg-tt-soft-green ring-tt-green/25"
                : "bg-tt-soft-coral ring-tt-coral/25"
            }`}
          >
            <EquipmentVisual
              category={e.category}
              manufacturer={e.manufacturer}
              imageUrl={e.imageUrl}
              bladeSubcategory={e.bladeSubcategory}
              name={e.name}
              size={36}
              className="mx-auto"
            />
            <p className="mt-1 truncate text-sm font-bold">{e.name}</p>
            <p className="truncate text-[11px] text-tt-gray70">
              {e.manufacturer}
            </p>
          </Link>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {STRIP_AXES.map((ax) => (
          <div key={ax.key}>
            <p className="text-xs font-bold">{ax.label}</p>
            <div className="mt-1 space-y-1">
              <CompareBar value={a.scores?.[ax.key]} side="a" />
              <CompareBar value={b.scores?.[ax.key]} side="b" />
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] leading-5 text-tt-gray70">
        上が <span className="font-bold text-tt-deep-green">{a.name}</span> / 下が{" "}
        <span className="font-bold text-tt-deep-coral">{b.name}</span>
        。スコアは使った人の比較から推定（–はデータなし）。
      </p>

      <div className="mt-4 flex gap-2">
        <Link
          href={`/compare/${a.id}/vs/${b.id}`}
          className="flex-1 rounded-full bg-tt-green py-2.5 text-center text-sm font-bold text-white"
        >
          くわしく比較（みんなの回答・声）→
        </Link>
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 rounded-full border border-tt-gray30/50 px-4 text-sm text-tt-gray70"
        >
          選び直す
        </button>
      </div>
    </div>
  );
}

function CompareBar({ value, side }: { value?: number; side: "a" | "b" }) {
  const has = typeof value === "number";
  return (
    <div className="flex items-center gap-2">
      <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-tt-gray30/30">
        {has && (
          <span
            className={`block h-2.5 rounded-full ${
              side === "a"
                ? "bg-tt-green"
                : "bg-tt-coral"
            }`}
            style={{ width: `${Math.max(4, Math.round(value))}%` }}
          />
        )}
      </span>
      <span className="w-7 shrink-0 text-right font-mono text-[11px] tabular-nums text-tt-gray70">
        {has ? Math.round(value) : "–"}
      </span>
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
