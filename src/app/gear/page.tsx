"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GearForm, type GearDraft } from "@/components/gear-form";
import { EquipmentVisual } from "@/components/equipment-visual";
import {
  GEAR_SIDE_LABELS,
  THICKNESS_LABELS,
  type GearSide,
  type Thickness,
} from "@/lib/types";
import { gearReminder } from "@/lib/gear-reminder";

// マイギア: このサービスの土台。使ったことのあるラバーの記録 (使用条件つき)。
// ここに登録された用具同士から出題が生成される。

interface FeelEntry {
  aId: string;
  bId: string;
  nameA: string;
  nameB: string;
  isGearBased: boolean;
  axes: Record<string, string>;
}

const AXIS_SHORT: Record<string, string> = {
  overall: "好み",
  hardness: "硬さ",
  speed: "速さ",
  spin: "スピン",
  ballHold: "球持ち",
};

interface GearEntry {
  id: string;
  side: GearSide;
  thickness: Thickness;
  isCurrent: boolean;
  usageStartedAt: string | null;
  note: string | null;
  weightGrams: number | null;
  bladeWeightGrams: number | null;
  equipment: {
    id: string;
    name: string;
    manufacturer: string;
    category: string;
    imageUrl: string | null;
  };
  blade: { id: string; name: string } | null;
}

export default function GearPage() {
  const [gear, setGear] = useState<GearEntry[] | null>(null);
  const [feel, setFeel] = useState<FeelEntry[]>([]);
  const [showForm, setShowForm] = useState(false);

  async function reload() {
    const res = await fetch("/api/gear");
    if (res.ok) {
      const data = await res.json();
      setGear(data.gear);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/gear")
      .then((r) => (r.ok ? r.json() : { gear: [] }))
      .then((d) => {
        if (!cancelled) setGear(d.gear);
      });
    fetch("/api/my-feel")
      .then((r) => (r.ok ? r.json() : { entries: [] }))
      .then((d) => {
        if (!cancelled) setFeel(d.entries);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function add(draft: GearDraft) {
    await fetch("/api/gear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        equipmentId: draft.equipment.id,
        side: draft.side,
        thickness: draft.thickness,
        bladeEquipmentId: draft.blade?.id,
        isCurrent: draft.isCurrent,
        weightGrams: draft.weightGrams ?? undefined,
      }),
    });
    setShowForm(false);
    await reload();
  }

  async function remove(id: string) {
    await fetch(`/api/gear?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await reload();
  }

  // 既存ギアの貼った日・メモを更新 (同一 equipmentId×side は更新扱い)
  async function saveDetails(
    g: GearEntry,
    patch: {
      note?: string;
      usageStartedAt?: string;
      weightGrams?: number;
      bladeWeightGrams?: number;
    },
  ) {
    await fetch("/api/gear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        equipmentId: g.equipment.id,
        side: g.side,
        thickness: "UNKNOWN", // 既存の厚さを保持
        note: patch.note,
        usageStartedAt: patch.usageStartedAt,
        weightGrams: patch.weightGrams,
        bladeWeightGrams: patch.bladeWeightGrams,
      }),
    });
    await reload();
  }

  // 出題は同じ面で使ったペアのみ生成されるため、面別にペア数を数える
  const sideCounts = (() => {
    const counts: Record<GearSide, number> = { FH: 0, BH: 0 };
    if (!gear) return counts;
    for (const side of ["FH", "BH"] as const) {
      counts[side] = new Set(
        gear.filter((g) => g.side === side).map((g) => g.equipment.id),
      ).size;
    }
    return counts;
  })();
  const pairCount = (["FH", "BH"] as const).reduce(
    (total, side) => total + (sideCounts[side] * (sideCounts[side] - 1)) / 2,
    0,
  );
  // 1本だけの面はペアが組めず出題ゼロになる。理由と次の一手を示す
  const loneSides = (["FH", "BH"] as const).filter(
    (side) => sideCounts[side] === 1,
  );

  return (
    <div className="mx-auto max-w-md py-4">
      <h1 className="text-2xl font-bold">マイギア</h1>

      {gear === null ? (
        <p className="py-12 text-center text-sm text-tt-gray70">マイギアを読み込んでいます…</p>
      ) : (
        <>
          {gear.length >= 2 && (
            <p className="mt-4 rounded-xl bg-tt-soft-green p-3 text-sm text-tt-deep-green ring-1 ring-tt-green/20">
              {gear.length}本登録済み → 同じ面のペアで最大{" "}
              <span className="font-mono font-bold">{pairCount * 5}</span>{" "}
              問の比較に答えられます
            </p>
          )}

          {gear.some((g) => g.isCurrent) && (
            <button
              type="button"
              onClick={() => shareGear(gear)}
              className="mt-3 block w-full rounded-full border border-tt-gray30/50 bg-white py-2.5 text-center text-sm font-bold transition hover:bg-tt-offwhite active:scale-[0.98]"
            >
              ギア構成をシェア
            </button>
          )}

          {loneSides.length > 0 && (
            <p className="mt-2 rounded-xl bg-tt-offwhite p-3 text-xs leading-5 text-tt-gray70 ring-1 ring-black/5">
              {loneSides
                .map((side) => GEAR_SIDE_LABELS[side])
                .join("面・")}
              面は1本だけなので、まだ比較質問を作れません。
              同じ面で使ったことのあるラバーをもう1本追加すると、比較が
              <span className="font-mono font-bold text-tt-charcoal">+5問</span>
              ずつ増えます。
            </p>
          )}

          {(() => {
            const current = gear.filter((g) => g.isCurrent);
            const past = gear.filter((g) => !g.isCurrent);
            return (
              <>
                {current.length > 0 && (
                  <>
                    <div className="mt-4 flex items-baseline justify-between">
                      <h2 className="text-sm font-bold text-tt-deep-green">
                        現在の構成
                      </h2>
                      {(() => {
                        const weighed = current.filter(
                          (g) => g.weightGrams != null,
                        );
                        if (weighed.length === 0) return null;
                        const rubberSum = weighed.reduce(
                          (s, g) => s + (g.weightGrams ?? 0),
                          0,
                        );
                        // ラケット重量は1本だけ加算 (FH/BHで同じブレードを共有するため)
                        const bladeW =
                          current.find((g) => g.bladeWeightGrams != null)
                            ?.bladeWeightGrams ?? null;
                        const partial = weighed.length < current.length;
                        return (
                          <span className="text-right text-xs text-tt-gray70">
                            {bladeW != null ? (
                              <>
                                合計{" "}
                                <span className="font-mono font-bold text-tt-charcoal">
                                  {rubberSum + bladeW}g
                                </span>
                                <span className="text-[10px]">
                                  （ラケット込）
                                </span>
                              </>
                            ) : (
                              <>
                                ラバー計{" "}
                                <span className="font-mono font-bold text-tt-charcoal">
                                  {rubberSum}g
                                </span>
                                {partial && "（記録分）"}
                              </>
                            )}
                          </span>
                        );
                      })()}
                    </div>
                    <ul className="mt-2 space-y-2">
                      {current.map((g) => (
                        <GearRow
                          key={g.id}
                          g={g}
                          onRemove={remove}
                          onSave={saveDetails}
                        />
                      ))}
                    </ul>
                  </>
                )}
                {past.length > 0 && (
                  <>
                    <h2 className="mt-5 text-sm font-bold text-tt-gray70">
                      これまで使った用具（遍歴）
                    </h2>
                    <p className="text-xs text-tt-gray70">
                      乗り換えの軌跡。メモを残すと、次の選択の精度が上がります。
                    </p>
                    <ul className="mt-2 space-y-2">
                      {past.map((g) => (
                        <GearRow
                          key={g.id}
                          g={g}
                          onRemove={remove}
                          onSave={saveDetails}
                        />
                      ))}
                    </ul>
                  </>
                )}
              </>
            );
          })()}

          {gear.length === 0 && !showForm && (
            <div className="mt-6 rounded-2xl border-2 border-dashed border-tt-gray30/50 p-8 text-center text-sm text-tt-gray70">
              まだ登録がありません。
              <br />
              これまで使ってきたラバーを思い出して追加してみてください。
            </div>
          )}

          <div className="mt-5">
            {showForm ? (
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <div className="mb-3 flex items-center justify-between">
                  <p className="font-bold">ラバーを追加</p>
                  <button
                    onClick={() => setShowForm(false)}
                    className="text-xs text-tt-gray70 underline"
                  >
                    閉じる
                  </button>
                </div>
                <GearForm
                  onAdd={add}
                  existing={gear.map((g) => ({
                    equipmentId: g.equipment.id,
                    side: g.side,
                    thickness: g.thickness,
                  }))}
                />
              </div>
            ) : (
              <button
                onClick={() => setShowForm(true)}
                className="w-full rounded-xl bg-gradient-to-r from-tt-green to-gs-red-strong py-3.5 font-bold text-white shadow-lg shadow-tt-green/20 transition hover:opacity-90 active:scale-95"
              >
                ＋ 使ったことのあるラバーを追加
              </button>
            )}
          </div>

          {gear.length >= 2 && (
            <Link
              href="/play"
              className="mt-3 block rounded-xl border border-tt-gray30/50 bg-white py-3 text-center text-sm font-bold transition hover:bg-tt-offwhite"
            >
              このギアで比較に答える →
            </Link>
          )}

          {/* あなたの体感メモ: 回答が自分の資産として残る */}
          {feel.length > 0 && (
            <section className="mt-8">
              <h2 className="font-bold">あなたの体感メモ</h2>
              <p className="mt-0.5 text-xs text-tt-gray70">
                あなたの回答から自動でできる、自分用の比較メモ。
              </p>
              <ul className="mt-3 space-y-2">
                {feel.map((f) => (
                  <li key={`${f.aId}-${f.bId}`}>
                    <Link
                      href={`/compare/${f.aId}/vs/${f.bId}`}
                      className="block rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <p className="text-sm font-bold">
                        {f.nameA} <span className="text-tt-gray30">vs</span>{" "}
                        {f.nameB}
                        {f.isGearBased && (
                          <span className="ml-2 rounded-full bg-tt-soft-green px-2 py-0.5 text-[10px] font-bold text-tt-deep-green">
                            両方使った
                          </span>
                        )}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {Object.entries(f.axes).map(([axis, winner]) => (
                          <span
                            key={axis}
                            className="rounded-full bg-tt-offwhite px-2 py-0.5 text-[11px] ring-1 ring-black/5"
                          >
                            {AXIS_SHORT[axis] ?? axis}:{" "}
                            <span className="font-bold">
                              {winner === "A"
                                ? f.nameA
                                : winner === "B"
                                  ? f.nameB
                                  : winner === "SAME"
                                    ? "同等"
                                    : "—"}
                            </span>
                          </span>
                        ))}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

// ギア構成をSNSシェア: 現用のFH/BHラバー+ラケットから公開カードURLを組み立て、
// Web Share → X投稿。シェアされたURLには動的OGカード(/api/og/gear)が付く。
function shareGear(gear: GearEntry[]) {
  const cur = gear.filter((g) => g.isCurrent);
  const fhItem = cur.find((g) => g.side === "FH");
  const bhItem = cur.find((g) => g.side === "BH");
  const fh = fhItem?.equipment.name ?? "";
  const bh = bhItem?.equipment.name ?? "";
  const blade = cur.find((g) => g.blade)?.blade?.name ?? "";
  const q = new URLSearchParams();
  if (blade) q.set("blade", blade);
  if (fh) q.set("fh", fh);
  if (bh) q.set("bh", bh);
  if (fhItem && fhItem.thickness !== "UNKNOWN")
    q.set("ft", THICKNESS_LABELS[fhItem.thickness]);
  if (bhItem && bhItem.thickness !== "UNKNOWN")
    q.set("bt", THICKNESS_LABELS[bhItem.thickness]);
  // 合計重量(ラバー + ラケット)が記録されていれば載せる
  const rubberSum = cur.reduce((s, g) => s + (g.weightGrams ?? 0), 0);
  const bladeW = cur.find((g) => g.bladeWeightGrams != null)?.bladeWeightGrams;
  if (rubberSum > 0) q.set("tw", String(rubberSum + (bladeW ?? 0)));
  const url = `${window.location.origin}/share/gear?${q.toString()}`;
  const text = "私の卓球ギア構成 #ガチスペ";
  if (typeof navigator !== "undefined" && navigator.share) {
    navigator.share({ text, url }).catch(() => {});
    return;
  }
  window.open(
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
    "_blank",
    "noopener,noreferrer",
  );
}

// マイギア1行: 表示 + 貼った日・メモのインライン編集 (遍歴の質的記録)
function GearRow({
  g,
  onRemove,
  onSave,
}: {
  g: GearEntry;
  onRemove: (id: string) => void;
  onSave: (
    g: GearEntry,
    patch: {
      note?: string;
      usageStartedAt?: string;
      weightGrams?: number;
      bladeWeightGrams?: number;
    },
  ) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(g.note ?? "");
  const [date, setDate] = useState(
    g.usageStartedAt ? g.usageStartedAt.slice(0, 10) : "",
  );
  const [weight, setWeight] = useState(
    g.weightGrams != null ? String(g.weightGrams) : "",
  );
  const [bladeWeight, setBladeWeight] = useState(
    g.bladeWeightGrams != null ? String(g.bladeWeightGrams) : "",
  );
  const [saving, setSaving] = useState(false);
  const reminder = g.isCurrent ? gearReminder(g.usageStartedAt) : null;

  async function save() {
    setSaving(true);
    const w = weight.trim() ? Number(weight) : NaN;
    const bw = bladeWeight.trim() ? Number(bladeWeight) : NaN;
    await onSave(g, {
      note,
      usageStartedAt: date ? new Date(date).toISOString() : undefined,
      weightGrams: Number.isFinite(w) && w > 0 ? Math.round(w) : undefined,
      bladeWeightGrams:
        Number.isFinite(bw) && bw > 0 ? Math.round(bw) : undefined,
    });
    setSaving(false);
    setEditing(false);
  }

  return (
    <li className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <EquipmentVisual
            category={g.equipment.category}
            manufacturer={g.equipment.manufacturer}
            imageUrl={g.equipment.imageUrl}
            name={g.equipment.name}
            size={44}
          />
          <div className="min-w-0">
            <p className="font-bold">
              <Link
                href={`/equipment/${g.equipment.id}`}
                className="hover:underline"
              >
                {g.equipment.name}
              </Link>
              {g.isCurrent && (
                <span className="ml-2 rounded-full bg-tt-charcoal px-2 py-0.5 text-[10px] font-bold text-white">
                  いま使用中
                </span>
              )}
            </p>
            <p className="text-xs text-tt-gray70">
              {g.equipment.manufacturer} ・ {GEAR_SIDE_LABELS[g.side]}面・
              {THICKNESS_LABELS[g.thickness]}
              {g.weightGrams != null && ` ・ ${g.weightGrams}g`}
              {g.blade && ` / ${g.blade.name}`}
            </p>
            {reminder && (
              <p
                className={`mt-1 text-xs ${
                  reminder.due
                    ? "font-bold text-tt-deep-coral"
                    : "text-tt-gray70"
                }`}
              >
                {reminder.due ? "⚠ " : "🏓 "}
                {reminder.elapsedLabel}
                {reminder.message ? ` — ${reminder.message}` : ""}
              </p>
            )}
            {!editing && g.note && (
              <p className="mt-1 text-xs italic text-tt-gray70">「{g.note}」</p>
            )}
          </div>
        </div>
        <div className="ml-3 flex shrink-0 flex-col items-end gap-1">
          <button
            onClick={() => setEditing((v) => !v)}
            className="text-xs text-tt-green underline"
          >
            {editing ? "閉じる" : "編集"}
          </button>
          <button
            onClick={() => onRemove(g.id)}
            className="text-xs text-tt-gray70 underline"
          >
            削除
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-3 space-y-2 border-t border-tt-gray30/30 pt-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-medium text-tt-gray70">
              使い始めた日（古さ・張替の目安）
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-tt-gray30/50 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs font-medium text-tt-gray70">
              重さ（カット後・g）
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={150}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="例: 47"
                className="mt-1 block w-full rounded-lg border border-tt-gray30/50 px-3 py-2 text-sm"
              />
            </label>
          </div>
          {g.blade && (
            <label className="block text-xs font-medium text-tt-gray70">
              ラケット「{g.blade.name}」の重さ（g・任意）
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={200}
                value={bladeWeight}
                onChange={(e) => setBladeWeight(e.target.value)}
                placeholder="例: 88（合計ラケット重量の計算に）"
                className="mt-1 block w-full rounded-lg border border-tt-gray30/50 px-3 py-2 text-sm"
              />
            </label>
          )}
          <label className="block text-xs font-medium text-tt-gray70">
            メモ（乗り換え理由・感想など）
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="例: 前のラバーより球持ちが欲しくて乗り換え"
              className="mt-1 block w-full rounded-lg border border-tt-gray30/50 px-3 py-2 text-sm"
            />
          </label>
          <button
            onClick={save}
            disabled={saving}
            className="w-full rounded-full bg-tt-charcoal py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      )}
    </li>
  );
}
