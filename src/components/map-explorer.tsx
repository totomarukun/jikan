"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EquipmentVisual } from "@/components/equipment-visual";
import { searchEquipment, type SearchableItem } from "@/lib/search";
import type { MapEntry } from "@/lib/relative-map";

// 用具マップの検索・絞り込み (P0): ユーザーの思考は「種類→メーカー→…」から入るため、
// 相対マップに 種類/メーカー のファセットと表記揺れ・日英対応の検索を載せる。
// 重い相対順位計算はサーバ側、ここは表示中エントリの絞り込みに専念する。

const CAT_LABEL: Record<string, string> = {
  RUBBER_INVERTED: "裏ソフト",
  RUBBER_PIMPLE_OUT: "表ソフト",
  RUBBER_PIMPLE_LONG: "粒高",
  RUBBER_ANTI: "アンチ",
  RUBBER_STICKY: "粘着",
};

export function MapExplorer({
  entries,
  gearIds,
  currentIds,
  axisLabel,
}: {
  entries: MapEntry[];
  gearIds: string[];
  currentIds: string[];
  axisLabel: string;
}) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [mfr, setMfr] = useState<string>("");
  const [sort, setSort] = useState<"rank" | "near">("rank");

  const gearSet = useMemo(() => new Set(gearIds), [gearIds]);
  const currentSet = useMemo(() => new Set(currentIds), [currentIds]);

  // 現用ラバーがこの軸にデータを持っていれば「現用に近い順」を提供できる
  const currentEntry = useMemo(
    () => entries.find((e) => currentSet.has(e.id)) ?? null,
    [entries, currentSet],
  );

  // ファセット候補 (表示中のエントリに存在する種類・メーカーのみ)
  const cats = useMemo(() => {
    const set = new Set(entries.map((e) => e.category));
    return [...set].filter((c) => CAT_LABEL[c]);
  }, [entries]);
  const mfrs = useMemo(
    () => [...new Set(entries.map((e) => e.manufacturer))].sort((a, b) => a.localeCompare(b, "ja")),
    [entries],
  );

  const filtered = useMemo(() => {
    let list = entries;
    if (cat) list = list.filter((e) => e.category === cat);
    if (mfr) list = list.filter((e) => e.manufacturer === mfr);
    if (query.trim()) {
      const matched = new Set(
        searchEquipment(list as SearchableItem[], query, { limit: 200 }).map(
          (x) => x.id,
        ),
      );
      list = list.filter((e) => matched.has(e.id)); // 相対順位の並びは保持
    }
    if (sort === "near" && currentEntry) {
      const base = currentEntry.score;
      list = [...list].sort(
        (a, b) => Math.abs(a.score - base) - Math.abs(b.score - base),
      );
    }
    return list;
  }, [entries, cat, mfr, query, sort, currentEntry]);

  const hasFilter = Boolean(query.trim() || cat || mfr);

  return (
    <div className="mt-4">
      {/* 検索 */}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="用具名で検索（ひらがな・英語・ローマ字OK）"
        className="block w-full rounded-full border border-tt-gray30/50 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-tt-green focus:outline-none"
      />

      {/* 種類ファセット */}
      {cats.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <FacetChip active={cat === null} onClick={() => setCat(null)}>
            すべての種類
          </FacetChip>
          {cats.map((c) => (
            <FacetChip key={c} active={cat === c} onClick={() => setCat(c)}>
              {CAT_LABEL[c]}
            </FacetChip>
          ))}
        </div>
      )}

      {/* メーカーファセット */}
      {mfrs.length > 1 && (
        <select
          value={mfr}
          onChange={(e) => setMfr(e.target.value)}
          className="mt-2 w-full rounded-full border border-tt-gray30/50 bg-white px-4 py-2 text-sm"
        >
          <option value="">すべてのメーカー</option>
          {mfrs.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      )}

      {/* 並び替え (現用ラバーがこの軸にデータを持つときのみ「現用に近い順」) */}
      {currentEntry && (
        <div className="mt-2 flex gap-1.5">
          <FacetChip active={sort === "rank"} onClick={() => setSort("rank")}>
            相対順位
          </FacetChip>
          <FacetChip active={sort === "near"} onClick={() => setSort("near")}>
            現用に近い順
          </FacetChip>
        </div>
      )}

      {/* 件数 + 絞り込み解除 */}
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
            }}
            className="font-bold text-tt-green underline"
          >
            絞り込みを解除
          </button>
        )}
      </div>

      {/* 結果 */}
      {filtered.length === 0 ? (
        <div className="mt-4 rounded-2xl border-2 border-dashed border-tt-gray30/50 p-8 text-center text-sm text-tt-gray70">
          該当する用具がありません。検索語や絞り込みを見直してください。
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {filtered.map((e, i) => (
            <PositionBar
              key={e.id}
              entry={e}
              rank={sort === "near" ? undefined : i + 1}
              isGear={gearSet.has(e.id)}
              isCurrent={currentSet.has(e.id)}
              axisLabel={axisLabel}
              deltaVsCurrent={
                sort === "near" && currentEntry && e.id !== currentEntry.id
                  ? Math.round(e.score - currentEntry.score)
                  : null
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FacetChip({
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

function PositionBar({
  entry,
  rank,
  isGear,
  isCurrent,
  axisLabel,
  deltaVsCurrent,
}: {
  entry: MapEntry;
  rank?: number;
  isGear: boolean;
  isCurrent: boolean;
  axisLabel: string;
  deltaVsCurrent?: number | null;
}) {
  const pct = Math.round(entry.score);
  const lowConfidence = entry.comparisons < 3;
  return (
    <Link
      href={`/equipment/${entry.id}`}
      className={`block rounded-xl p-3 shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-md ${
        isGear ? "bg-white ring-tt-green/40" : "bg-white ring-black/5"
      }`}
    >
      <div className="flex items-center gap-2">
        {rank != null && (
          <span className="w-5 shrink-0 text-center font-mono text-xs text-tt-gray70">
            {rank}
          </span>
        )}
        <EquipmentVisual
          category={entry.category}
          manufacturer={entry.manufacturer}
          imageUrl={entry.imageUrl}
          name={entry.name}
          size={28}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-bold">
          {entry.name}
          {isCurrent && (
            <span className="ml-1.5 rounded-full bg-tt-charcoal px-1.5 py-0.5 text-[10px] font-bold text-white">
              使用中
            </span>
          )}
          {isGear && !isCurrent && (
            <span className="ml-1.5 rounded-full bg-tt-green px-1.5 py-0.5 text-[10px] font-bold text-white">
              マイギア
            </span>
          )}
        </span>
        {deltaVsCurrent != null && (
          <span
            className={`shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold ${
              deltaVsCurrent > 0
                ? "bg-tt-soft-green text-tt-deep-green"
                : deltaVsCurrent < 0
                  ? "bg-tt-soft-coral text-tt-deep-coral"
                  : "bg-tt-gray30/30 text-tt-gray70"
            }`}
          >
            現用比 {deltaVsCurrent > 0 ? "+" : ""}
            {deltaVsCurrent}
          </span>
        )}
        <span className="shrink-0 font-mono text-xs text-tt-gray70">
          {entry.bothComparisons > 0
            ? `実${entry.bothComparisons}/全${entry.comparisons}件`
            : `${entry.comparisons}件`}
        </span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-tt-gray30/30">
        <div
          className={`h-2.5 rounded-full ${
            lowConfidence
              ? "bg-tt-gray30"
              : "bg-gradient-to-r from-tt-green to-tt-deep-green"
          }`}
          style={{ width: `${Math.max(4, pct)}%` }}
        />
      </div>
      {lowConfidence && (
        <p className="mt-1 text-[10px] text-tt-gray70">
          支持が少なく中央寄りの暫定位置（{axisLabel}）
        </p>
      )}
    </Link>
  );
}
