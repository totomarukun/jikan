"use client";

import { useEffect, useState } from "react";

export interface RubberItem {
  id: string;
  name: string;
  manufacturer: string;
}

/** ラバー名のデバウンス付きインクリメンタル検索 */
export function useRubberSearch(query: string, limit = 6): RubberItem[] {
  const [results, setResults] = useState<RubberItem[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      const res = await fetch(
        `/api/equipment?q=${encodeURIComponent(query)}&rubberOnly=1`,
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
  }, [query, limit]);

  return results;
}
