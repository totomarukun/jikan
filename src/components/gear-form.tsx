"use client";

import { useState } from "react";
import {
  GEAR_SIDE_LABELS,
  GEAR_SIDES,
  THICKNESS_LABELS,
  THICKNESSES,
  type GearSide,
  type Thickness,
} from "@/lib/types";
import {
  useEquipmentSearch,
  type RubberItem,
} from "./use-rubber-search";

export interface GearDraft {
  equipment: RubberItem;
  side: GearSide;
  thickness: Thickness;
  blade: RubberItem | null;
  isCurrent: boolean;
}

// 使ったことのあるラバーを「使用条件つき」で1本追加するフォーム。
// 厚さ・貼り面・当時のラケットが揃って初めて比較データとして意味を持つ。
export function GearForm({
  onAdd,
  submitLabel = "この条件で追加",
}: {
  onAdd: (draft: GearDraft) => void | Promise<void>;
  submitLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<RubberItem | null>(null);
  const [side, setSide] = useState<GearSide>("FH");
  const [thickness, setThickness] = useState<Thickness>("UNKNOWN");
  const [bladeQuery, setBladeQuery] = useState("");
  const [blade, setBlade] = useState<RubberItem | null>(null);
  const [isCurrent, setIsCurrent] = useState(false);
  const [busy, setBusy] = useState(false);
  const rubberResults = useEquipmentSearch(query, "rubber");
  const bladeResults = useEquipmentSearch(bladeQuery, "blade");

  async function submit() {
    if (!picked || busy) return;
    setBusy(true);
    await onAdd({ equipment: picked, side, thickness, blade, isCurrent });
    // 連続追加できるようリセット
    setQuery("");
    setPicked(null);
    setSide("FH");
    setThickness("UNKNOWN");
    setBladeQuery("");
    setBlade(null);
    setIsCurrent(false);
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      {/* 1. ラバー選択 */}
      {picked ? (
        <div className="flex items-center justify-between rounded-xl border border-tt-green bg-tt-soft-green p-3">
          <div>
            <p className="font-bold">{picked.name}</p>
            <p className="text-xs text-tt-gray70">{picked.manufacturer}</p>
          </div>
          <button
            onClick={() => setPicked(null)}
            className="text-xs text-tt-gray70 underline"
          >
            変更
          </button>
        </div>
      ) : (
        <div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ラバー名で検索 (例: ロゼナ / テナジー)"
            className="h-12 w-full rounded-xl border border-tt-gray30/50 bg-white px-4 shadow-sm outline-none focus:border-tt-green"
          />
          {rubberResults.length > 0 && (
            <div className="mt-2 flex flex-col gap-2">
              {rubberResults.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setPicked(item)}
                  className="rounded-xl border border-tt-gray30/50 bg-white p-3 text-left text-sm shadow-sm transition hover:border-tt-green hover:bg-tt-soft-green active:scale-[0.98]"
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
      )}

      {picked && (
        <>
          {/* 2. 使用条件 */}
          <div>
            <p className="mb-1.5 text-xs font-bold text-tt-gray70">
              どちらの面で使った？
            </p>
            <div className="grid grid-cols-2 gap-2">
              {GEAR_SIDES.map((s) => (
                <button
                  key={s}
                  onClick={() => setSide(s)}
                  className={`h-10 rounded-xl border text-sm font-medium transition ${
                    side === s
                      ? "border-tt-green bg-tt-soft-green"
                      : "border-tt-gray30/50 bg-white"
                  }`}
                >
                  {GEAR_SIDE_LABELS[s]}面
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-bold text-tt-gray70">
              スポンジの厚さは？
            </p>
            <div className="flex flex-wrap gap-2">
              {THICKNESSES.map((t) => (
                <button
                  key={t}
                  onClick={() => setThickness(t)}
                  className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
                    thickness === t
                      ? "border-tt-green bg-tt-soft-green font-bold"
                      : "border-tt-gray30/50 bg-white"
                  }`}
                >
                  {t === "UNKNOWN" ? "わからない" : THICKNESS_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-bold text-tt-gray70">
              そのとき使っていたラケット (任意)
            </p>
            {blade ? (
              <div className="flex items-center justify-between rounded-xl border border-tt-gray30/50 bg-white p-3 text-sm">
                <span className="font-medium">{blade.name}</span>
                <button
                  onClick={() => setBlade(null)}
                  className="text-xs text-tt-gray70 underline"
                >
                  変更
                </button>
              </div>
            ) : (
              <div>
                <input
                  type="search"
                  value={bladeQuery}
                  onChange={(e) => setBladeQuery(e.target.value)}
                  placeholder="ラケット名で検索 (例: ビスカリア) / 空欄でスキップ"
                  className="h-11 w-full rounded-xl border border-tt-gray30/50 bg-white px-3 text-sm shadow-sm outline-none focus:border-tt-green"
                />
                {bladeResults.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    {bladeResults.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setBlade(item);
                          setBladeQuery("");
                        }}
                        className="rounded-xl border border-tt-gray30/50 bg-white p-2.5 text-left text-sm transition hover:border-tt-green hover:bg-tt-soft-green"
                      >
                        <span className="font-medium">{item.name}</span>
                        <span className="ml-2 text-xs text-tt-gray70">
                          {item.manufacturer}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isCurrent}
              onChange={(e) => setIsCurrent(e.target.checked)}
            />
            いまも使っている
          </label>

          <button
            onClick={submit}
            disabled={busy}
            className="w-full rounded-xl bg-gradient-to-r from-tt-green to-tt-deep-green py-3 font-bold text-white shadow-lg shadow-tt-green/20 transition hover:opacity-90 active:scale-95 disabled:opacity-50"
          >
            {busy ? "追加中..." : submitLabel}
          </button>
        </>
      )}
    </div>
  );
}
