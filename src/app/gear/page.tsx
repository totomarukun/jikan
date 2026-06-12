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
  spin: "回転",
  ballHold: "球持ち",
};

interface GearEntry {
  id: string;
  side: GearSide;
  thickness: Thickness;
  isCurrent: boolean;
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
      }),
    });
    setShowForm(false);
    await reload();
  }

  async function remove(id: string) {
    await fetch(`/api/gear?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await reload();
  }

  const pairCount = gear
    ? (new Set(gear.map((g) => g.equipment.id)).size *
        (new Set(gear.map((g) => g.equipment.id)).size - 1)) /
      2
    : 0;

  return (
    <div className="mx-auto max-w-md py-4">
      <h1 className="text-2xl font-bold">マイギア</h1>
      <p className="mt-1 text-sm leading-6 text-tt-gray70">
        使ったことのあるラバーの記録。ここに登録した用具同士の比較だけが
        質問されるので、増えるほど答えやすい質問が増えます。
      </p>

      {gear === null ? (
        <p className="py-12 text-center text-sm text-tt-gray70">読み込み中...</p>
      ) : (
        <>
          {gear.length >= 2 && (
            <p className="mt-4 rounded-xl bg-tt-soft-green p-3 text-sm text-tt-deep-green ring-1 ring-tt-green/20">
              {gear.length}本登録済み → 最大{" "}
              <span className="font-mono font-bold">{pairCount * 5}</span>{" "}
              問の実体験比較に答えられます
            </p>
          )}

          <ul className="mt-4 space-y-2">
            {gear.map((g) => (
              <li
                key={g.id}
                className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5"
              >
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
                    {g.blade && ` / ${g.blade.name}`}
                  </p>
                  </div>
                </div>
                <button
                  onClick={() => remove(g.id)}
                  className="ml-3 shrink-0 text-xs text-tt-gray70 underline"
                >
                  削除
                </button>
              </li>
            ))}
          </ul>

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
                <GearForm onAdd={add} />
              </div>
            ) : (
              <button
                onClick={() => setShowForm(true)}
                className="w-full rounded-xl bg-gradient-to-r from-tt-green to-tt-deep-green py-3.5 font-bold text-white shadow-lg shadow-tt-green/20 transition hover:opacity-90 active:scale-95"
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
                            実体験
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
