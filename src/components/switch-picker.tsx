"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useRubberSearch } from "./use-rubber-search";

/** 乗り換え候補の検索・追加 (URL の ?c= に反映して共有可能にする) */
export function CandidatePicker({
  candidateIds,
  maxCandidates = 3,
}: {
  candidateIds: string[];
  maxCandidates?: number;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const results = useRubberSearch(query);

  function add(id: string) {
    if (candidateIds.includes(id) || candidateIds.length >= maxCandidates)
      return;
    setQuery("");
    router.push(`/switch?c=${[...candidateIds, id].join(",")}`);
  }

  if (candidateIds.length >= maxCandidates) {
    return (
      <p className="text-xs text-tt-gray70">
        候補は{maxCandidates}つまで。外すには各カードの「候補から外す」を押してください。
      </p>
    );
  }

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="気になるラバーを検索して候補に追加"
        className="h-12 w-full rounded-xl border border-tt-gray30/50 bg-white px-4 shadow-sm outline-none focus:border-tt-green"
      />
      {results.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {results.map((item) => (
            <button
              key={item.id}
              onClick={() => add(item.id)}
              disabled={candidateIds.includes(item.id)}
              className="rounded-xl border border-tt-gray30/50 bg-white p-3 text-left text-sm shadow-sm transition hover:border-tt-green hover:bg-tt-soft-green active:scale-[0.98] disabled:opacity-40"
            >
              <span className="font-bold">{item.name}</span>
              <span className="ml-2 text-xs text-tt-gray70">
                {item.manufacturer}
              </span>
              {candidateIds.includes(item.id) && (
                <span className="ml-2 text-xs text-tt-green">追加済み</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 現用ラバーの設定フォーム (/switch で未設定のとき表示) */
export function CurrentRubberSetter() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const results = useRubberSearch(query);

  async function set(id: string) {
    if (busy) return;
    setBusy(true);
    const res = await fetch("/api/current-rubber", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ equipmentId: id }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="例: ロゼナ / テナジー / マークV"
        className="h-12 w-full rounded-xl border border-tt-gray30/50 bg-white px-4 shadow-sm outline-none focus:border-tt-green"
      />
      {results.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {results.map((item) => (
            <button
              key={item.id}
              onClick={() => set(item.id)}
              disabled={busy}
              className="rounded-xl border border-tt-gray30/50 bg-white p-3 text-left text-sm shadow-sm transition hover:border-tt-green hover:bg-tt-soft-green active:scale-[0.98] disabled:opacity-50"
            >
              <span className="font-bold">{item.name}</span>
              <span className="ml-2 text-xs text-tt-gray70">
                {item.manufacturer}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
