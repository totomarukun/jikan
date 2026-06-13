"use client";

import { useEffect, useMemo, useState } from "react";
import { searchEquipment, type SearchableItem } from "@/lib/search";

export interface RubberItem {
  id: string;
  name: string;
  manufacturer: string;
  category?: string;
}

// 全件 (kind別) を一度だけ取得してモジュールキャッシュ。137件規模なので
// クライアントで正規化・表記揺れ・日英・ローマ字・あいまい検索を完結できる。
const cache = new Map<string, RubberItem[]>();
const inflight = new Map<string, Promise<RubberItem[]>>();

function loadAll(kind: "rubber" | "blade"): Promise<RubberItem[]> {
  if (cache.has(kind)) return Promise.resolve(cache.get(kind)!);
  if (inflight.has(kind)) return inflight.get(kind)!;
  const filter = kind === "rubber" ? "rubberOnly=1" : "bladeOnly=1";
  const p = fetch(`/api/equipment?all=1&${filter}`)
    .then((r) => (r.ok ? r.json() : { equipments: [] }))
    .then((d) => {
      const items = (d.equipments ?? []) as RubberItem[];
      cache.set(kind, items);
      return items;
    })
    .catch(() => [] as RubberItem[]);
  inflight.set(kind, p);
  return p;
}

function useAllEquipment(kind: "rubber" | "blade"): RubberItem[] {
  const [items, setItems] = useState<RubberItem[]>(() => cache.get(kind) ?? []);
  useEffect(() => {
    let active = true;
    loadAll(kind).then((d) => {
      if (active) setItems(d);
    });
    return () => {
      active = false;
    };
  }, [kind]);
  return items;
}

/** 用具名の正規化・表記揺れ・日英・ローマ字・あいまい対応のインクリメンタル検索 */
export function useEquipmentSearch(
  query: string,
  kind: "rubber" | "blade" = "rubber",
  limit = 6,
): RubberItem[] {
  const all = useAllEquipment(kind);
  return useMemo(
    () =>
      searchEquipment(all as SearchableItem[], query, { limit }) as RubberItem[],
    [all, query, limit],
  );
}

/** よく使われているラバー (検索前のワンタップ候補)。初回マウント時に一度だけ取得 */
export function usePopularRubbers(): RubberItem[] {
  const [results, setResults] = useState<RubberItem[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/equipment?popular=1", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setResults(d.equipments);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return results;
}

/** 後方互換のエイリアス */
export function useRubberSearch(query: string, limit = 6): RubberItem[] {
  return useEquipmentSearch(query, "rubber", limit);
}
