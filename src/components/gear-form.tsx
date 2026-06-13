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
  usePopularRubbers,
  type RubberItem,
} from "./use-rubber-search";

export interface GearDraft {
  equipment: RubberItem;
  side: GearSide;
  thickness: Thickness;
  blade: RubberItem | null;
  isCurrent: boolean;
}

export interface ExistingGearInfo {
  equipmentId: string;
  side: GearSide;
  thickness: Thickness;
}

const MANUFACTURERS = [
  "バタフライ",
  "ニッタク",
  "ヤサカ",
  "ヴィクタス",
  "ティバー",
  "ドニック",
  "アンドロ",
  "XIOM",
  "スティガ",
  "JOOLA",
  "紅双喜",
  "ミズノ",
  "その他",
];

const RUBBER_TYPE_OPTIONS: Array<[string, string]> = [
  ["RUBBER_INVERTED", "裏ソフト"],
  ["RUBBER_STICKY", "粘着"],
  ["RUBBER_PIMPLE_OUT", "表ソフト"],
  ["RUBBER_PIMPLE_LONG", "粒高"],
];

// 検索に出てこないラバーをその場でマスタに追加する (UGC補完)
function SuggestRubber({
  name,
  onCreated,
}: {
  name: string;
  onCreated: (item: RubberItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [manufacturer, setManufacturer] = useState(MANUFACTURERS[0]);
  const [category, setCategory] = useState(RUBBER_TYPE_OPTIONS[0][0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/equipment/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, manufacturer, category }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("追加に失敗しました。製品名を確認してください。");
      return;
    }
    const data = await res.json();
    onCreated(data.equipment);
  }

  if (!open) {
    return (
      <div className="mt-2 rounded-xl border border-dashed border-tt-gray30/60 p-3 text-sm">
        <p className="text-tt-gray70">
          「{name}」は見つかりませんでした。
        </p>
        <button
          onClick={() => setOpen(true)}
          className="mt-1 font-bold text-tt-green underline"
        >
          このラバーを追加して登録する →
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-3 rounded-xl border border-tt-green/40 bg-tt-soft-green/40 p-3 text-sm">
      <p className="font-bold">「{name}」をマスタに追加</p>
      <div className="grid grid-cols-2 gap-2">
        <select
          value={manufacturer}
          onChange={(e) => setManufacturer(e.target.value)}
          className="h-10 rounded-xl border border-tt-gray30/50 bg-white px-2"
        >
          {MANUFACTURERS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-10 rounded-xl border border-tt-gray30/50 bg-white px-2"
        >
          {RUBBER_TYPE_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-xs text-tt-deep-coral">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={busy}
          className="flex-1 rounded-xl bg-gradient-to-r from-tt-green to-tt-deep-green py-2.5 font-bold text-white transition hover:opacity-90 active:scale-95 disabled:opacity-50"
        >
          {busy ? "追加中..." : "追加する"}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded-xl border border-tt-gray30/50 bg-white px-4 text-tt-gray70"
        >
          やめる
        </button>
      </div>
      <p className="text-xs text-tt-gray70">
        ※追加された製品はみんなの検索にも表示されます。正式名称での登録にご協力ください。
      </p>
    </div>
  );
}

// 使ったことのあるラバーを「使用条件つき」で1本追加するフォーム。
// 厚さ・貼り面・当時のラケットが揃って初めて比較データとして意味を持つ。
export function GearForm({
  onAdd,
  submitLabel = "この条件で追加",
  existing = [],
}: {
  onAdd: (draft: GearDraft) => void | Promise<void>;
  submitLabel?: string;
  /** 登録済みギア (重複時に前回条件をプリフィルし、上書き事故を防ぐ) */
  existing?: ExistingGearInfo[];
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
  const popularRubbers = usePopularRubbers();

  // 既に登録済みのラバーを選んだら、前回の条件をプリフィルする
  function pick(item: RubberItem) {
    setPicked(item);
    const prev = existing.find((e) => e.equipmentId === item.id);
    if (prev) {
      setSide(prev.side);
      setThickness(prev.thickness);
    }
  }
  const duplicate = picked
    ? existing.find((e) => e.equipmentId === picked.id && e.side === side)
    : undefined;

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
            placeholder="ラバー名で検索（ひらがな・英語・ローマ字OK 例: rozena / tenergy）"
            className="h-12 w-full rounded-xl border border-tt-gray30/50 bg-white px-4 shadow-sm outline-none focus:border-tt-green"
          />
          {rubberResults.length > 0 && (
            <div className="mt-2 flex flex-col gap-2">
              {rubberResults.map((item) => (
                <button
                  key={item.id}
                  onClick={() => pick(item)}
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
          {/* UGC補完: 見つからないラバーはその場で追加できる */}
          {query.trim().length >= 2 && rubberResults.length === 0 && (
            <SuggestRubber name={query.trim()} onCreated={setPicked} />
          )}
          {/* 検索前はよく使われているラバーをワンタップで選べる (入力の手間を減らす) */}
          {query.trim().length === 0 && popularRubbers.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-tt-gray70">よく登録されているラバー:</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {popularRubbers.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => pick(item)}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-medium shadow-sm ring-1 ring-tt-gray30/40 transition hover:bg-tt-soft-green hover:ring-tt-green active:scale-95"
                  >
                    + {item.name}
                  </button>
                ))}
              </div>
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
                  placeholder="ラケット名で検索（英語・ローマ字OK 例: viscaria）/ 空欄でスキップ"
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

          {duplicate && (
            <p className="rounded-xl bg-tt-soft-coral p-3 text-xs text-tt-deep-coral">
              このラバーは{duplicate.side === "FH" ? "フォア" : "バック"}面で登録済みです
              （{THICKNESS_LABELS[duplicate.thickness]}）。
              条件を変更したい場合のみ追加してください。
            </p>
          )}

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
