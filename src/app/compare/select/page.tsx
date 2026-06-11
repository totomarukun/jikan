"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  EQUIPMENT_CATEGORY_LABELS,
  type EquipmentCategory,
} from "@/lib/types";

// C1: 用具マスタ検索 (対決作成)

interface EquipmentItem {
  id: string;
  category: EquipmentCategory;
  manufacturer: string;
  name: string;
  price: number | null;
}

export default function CompareSelectPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EquipmentItem[]>([]);
  const [selected, setSelected] = useState<{
    a: EquipmentItem | null;
    b: EquipmentItem | null;
  }>({ a: null, b: null });

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const res = await fetch(
        `/api/equipment?q=${encodeURIComponent(query)}`,
        { signal: controller.signal },
      ).catch(() => null);
      if (res?.ok) {
        const data = await res.json();
        setResults(data.equipments);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function pick(item: EquipmentItem) {
    if (selected.a?.id === item.id) {
      setSelected({ ...selected, a: null });
    } else if (selected.b?.id === item.id) {
      setSelected({ ...selected, b: null });
    } else if (!selected.a) {
      setSelected({ ...selected, a: item });
    } else if (!selected.b) {
      setSelected({ ...selected, b: item });
    }
  }

  const ready = selected.a && selected.b;

  return (
    <div className="mx-auto max-w-md py-4">
      <h1 className="mb-4 text-xl font-bold">対決させる用具を選択</h1>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <SelectedSlot label="A" item={selected.a} palette="green" />
        <SelectedSlot label="B" item={selected.b} palette="coral" />
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="用具名・メーカー名で検索"
        className="mb-4 h-11 w-full rounded-lg border border-tt-gray30/60 bg-white px-3 outline-none focus:border-tt-green"
      />

      <ul className="space-y-2">
        {results.map((item) => {
          const isPicked =
            selected.a?.id === item.id || selected.b?.id === item.id;
          return (
            <li key={item.id}>
              <button
                onClick={() => pick(item)}
                className={`w-full rounded-lg border p-3 text-left text-sm transition ${
                  isPicked
                    ? "border-tt-green bg-tt-soft-green"
                    : "border-tt-gray30/40 bg-white hover:border-tt-green"
                }`}
              >
                <p className="font-medium">{item.name}</p>
                <p className="text-xs text-tt-gray70">
                  {item.manufacturer} ・{" "}
                  {EQUIPMENT_CATEGORY_LABELS[item.category]}
                </p>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-4 mt-6">
        <button
          disabled={!ready}
          onClick={() =>
            router.push(`/compare/${selected.a!.id}/vs/${selected.b!.id}`)
          }
          className="h-12 w-full rounded-full bg-tt-green font-bold text-white shadow transition hover:opacity-90 disabled:opacity-40"
        >
          対決を見る
        </button>
      </div>
    </div>
  );
}

function SelectedSlot({
  label,
  item,
  palette,
}: {
  label: string;
  item: EquipmentItem | null;
  palette: "green" | "coral";
}) {
  const colors =
    palette === "green"
      ? "bg-tt-soft-green text-tt-deep-green ring-tt-green/30"
      : "bg-tt-soft-coral text-tt-deep-coral ring-tt-coral/30";
  return (
    <div className={`rounded-xl p-3 ring-1 ${colors}`}>
      <p className="font-mono text-xs font-bold">{label}</p>
      <p className="mt-1 truncate text-sm font-medium">
        {item ? item.name : "未選択"}
      </p>
    </div>
  );
}
