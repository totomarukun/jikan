"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useRubberSearch } from "./use-rubber-search";

export interface GearChip {
  equipmentId: string;
  name: string;
}

/** 乗り換え候補の検索・追加 (URL の ?c= に反映して共有可能にする) */
export function CandidatePicker({
  candidateIds,
  suggestions = [],
  suggestionsLabel = "よく比較される:",
  maxCandidates = 3,
  baseId,
}: {
  candidateIds: string[];
  /** よく比較される候補 (ワンタップ追加チップ) */
  suggestions?: GearChip[];
  suggestionsLabel?: string;
  maxCandidates?: number;
  /** 検討の基準ラバー (URL に固定し、基準切り替えと共存させる) */
  baseId?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const results = useRubberSearch(query);

  function add(id: string) {
    if (candidateIds.includes(id) || candidateIds.length >= maxCandidates)
      return;
    setQuery("");
    // 集計中であることを必ず見せる (無反応に見える問題への恒久対応)
    const base = baseId ? `base=${baseId}&` : "";
    startTransition(() => {
      router.push(`/switch?${base}c=${[...candidateIds, id].join(",")}`);
    });
  }

  if (candidateIds.length >= maxCandidates) {
    return (
      <p className="text-xs text-tt-gray70">
        候補は{maxCandidates}つまで。外すには各カードの「候補から外す」を押してください。
      </p>
    );
  }

  if (isPending) {
    return (
      <div className="rounded-xl bg-tt-soft-green p-4 text-center text-sm ring-1 ring-tt-green/20">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-tt-green border-t-transparent align-middle" />
        <span className="ml-2 align-middle font-bold text-tt-deep-green">
          実体験データを集計しています…
        </span>
      </div>
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
      {suggestions.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-tt-gray70">{suggestionsLabel}</span>
          {suggestions
            .filter((s) => !candidateIds.includes(s.equipmentId))
            .map((s) => (
              <button
                key={s.equipmentId}
                onClick={() => add(s.equipmentId)}
                className="rounded-full bg-white px-3 py-1 text-xs font-medium shadow-sm ring-1 ring-tt-gray30/40 transition hover:bg-tt-soft-green hover:ring-tt-green active:scale-95"
              >
                + {s.name}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

/** 基準ラバー未設定時、マイギアからワンタップで選べるようにする */
export function BaseFromGear({ gear }: { gear: GearChip[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function setBase(id: string) {
    if (busyId) return;
    setBusyId(id);
    const res = await fetch("/api/current-rubber", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ equipmentId: id }),
    });
    if (res.ok) router.refresh();
    else setBusyId(null);
  }

  if (gear.length === 0) return null;
  return (
    <div className="mb-4">
      <p className="mb-2 text-xs font-bold text-tt-gray70">
        マイギアから選ぶ (ワンタップ)
      </p>
      <div className="flex flex-wrap gap-2">
        {gear.map((g) => (
          <button
            key={g.equipmentId}
            onClick={() => setBase(g.equipmentId)}
            disabled={busyId !== null}
            className="rounded-full bg-tt-soft-green px-4 py-2 text-sm font-bold text-tt-deep-green ring-1 ring-tt-green/30 transition hover:bg-tt-green hover:text-white active:scale-95 disabled:opacity-50"
          >
            {busyId === g.equipmentId ? "設定中…" : g.name}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-tt-gray70">または検索:</p>
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
