"use client";

import { useEffect, useState } from "react";

export interface RubberItem {
  id: string;
  name: string;
  manufacturer: string;
}

/** 用具名のデバウンス付きインクリメンタル検索 */
export function useEquipmentSearch(
  query: string,
  kind: "rubber" | "blade" = "rubber",
  limit = 6,
): RubberItem[] {
  const [results, setResults] = useState<RubberItem[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      const filter = kind === "rubber" ? "rubberOnly=1" : "bladeOnly=1";
      const res = await fetch(
        `/api/equipment?q=${encodeURIComponent(query)}&${filter}`,
        { signal: controller.signal },
      ).catch(() => null);
      if (res?.ok) {
        const data = await res.json();
        setResults(data.equipments.slice(0, limit));
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, kind, limit]);

  return results;
}

/** 後方互換のエイリアス */
export function useRubberSearch(query: string, limit = 6): RubberItem[] {
  return useEquipmentSearch(query, "rubber", limit);
}
