"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EquipmentVisual } from "@/components/equipment-visual";
import { searchEquipment, type SearchableItem } from "@/lib/search";

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
  popularity: number;
}

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
type Sort = "popular" | "name" | "priceAsc" | "priceDesc" | "hardness";

export function CatalogExplorer({ items }: { items: CatalogItem[] }) {
  const [kind, setKind] = useState<Kind>("rubber");
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [mfr, setMfr] = useState("");
  const [band, setBand] = useState<number>(-1);
  const [hard, setHard] = useState<number>(-1);
  const [sort, setSort] = useState<Sort>("popular");

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
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sort === "popular") return b.popularity - a.popularity || byName(a, b);
      if (sort === "priceAsc") return (a.price ?? 1e9) - (b.price ?? 1e9);
      if (sort === "priceDesc") return (b.price ?? -1) - (a.price ?? -1);
      if (sort === "hardness") return (b.hardness ?? -1) - (a.hardness ?? -1);
      return byName(a, b);
    });
    return sorted;
  }, [byKind, cat, mfr, band, hard, query, sort]);

  const hasFilter = Boolean(
    query.trim() || cat || mfr || band >= 0 || hard >= 0,
  );

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
            }}
          >
            {label}
          </Chip>
        ))}
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="用具名で検索（ひらがな・英語・ローマ字OK 例: rozena / dignics）"
        className="mt-3 block w-full rounded-full border border-tt-gray30/50 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-tt-green focus:outline-none"
      />

      {cats.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Chip active={cat === null} onClick={() => setCat(null)}>
            すべての種類
          </Chip>
          {cats.map((c) => (
            <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
              {CAT_LABEL[c]}
            </Chip>
          ))}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        <select
          value={mfr}
          onChange={(e) => setMfr(e.target.value)}
          className="flex-1 rounded-full border border-tt-gray30/50 bg-white px-3 py-2 text-sm"
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
          className="flex-1 rounded-full border border-tt-gray30/50 bg-white px-3 py-2 text-sm"
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
            className="flex-1 rounded-full border border-tt-gray30/50 bg-white px-3 py-2 text-sm"
          >
            <option value={-1}>すべての硬度</option>
            {HARDNESS_BANDS.map((h, i) => (
              <option key={h.label} value={i}>
                {h.label}
              </option>
            ))}
          </select>
        )}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="flex-1 rounded-full border border-tt-gray30/50 bg-white px-3 py-2 text-sm"
        >
          <option value="popular">人気順</option>
          <option value="name">メーカー順</option>
          <option value="priceAsc">価格が安い順</option>
          <option value="priceDesc">価格が高い順</option>
          <option value="hardness">硬度が高い順</option>
        </select>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-tt-gray70">
        <span>
          <span className="font-mono font-bold text-tt-charcoal">
            {filtered.length}
          </span>
          件
        </span>
        {hasFilter && (
          <button
            onClick={() => {
              setQuery("");
              setCat(null);
              setMfr("");
              setBand(-1);
              setHard(-1);
            }}
            className="font-bold text-tt-green underline"
          >
            絞り込みを解除
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="mt-4 rounded-2xl border-2 border-dashed border-tt-gray30/50 p-8 text-center text-sm text-tt-gray70">
          該当する用具がありません。
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {filtered.map((e) => (
            <li key={e.id}>
              <Link
                href={`/equipment/${e.id}`}
                className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md"
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
                  <p className="truncate text-sm font-bold">{e.name}</p>
                  <p className="text-xs text-tt-gray70">
                    {e.manufacturer} ・ {CAT_LABEL[e.category] ?? ""}
                    {e.hardness != null && ` ・ ${e.hardness}°`}
                  </p>
                </div>
                {e.price != null && (
                  <span className="shrink-0 font-mono text-xs text-tt-gray70">
                    ¥{e.price.toLocaleString()}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
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
