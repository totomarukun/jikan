"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chips, Stat, receiverSpinText } from "@/components/serve-receive";
import type { ReceiveTiming } from "@/lib/receive";
import { searchServeForSpin, type ServeSearchResult } from "@/lib/serve-search";
import { JOINTS } from "@/lib/arm";
import type { ServeParams } from "@/lib/serve-sim";

const fmt = (d: number) => (d > 0 ? `+${d}` : `${d}`);

/** 「相手の打球点でこの回転にしたい」から、サーブのスイングを逆算する。 */
export function InversePanel({
  params,
  timing,
  onApply,
}: {
  params: ServeParams;
  timing: ReceiveTiming;
  onApply: (p: ServeParams) => void;
}) {
  const [topBack, setTopBack] = useState(-20);
  // 画面では受け手から見た向きで指定する（+ = 受け手から見て右へ曲がる = サーバー基準の +）
  const [side, setSide] = useState(0);
  const [length, setLength] = useState<"short" | "long">("short");
  const [progress, setProgress] = useState<number | null>(null);
  const [found, setFound] = useState<ServeSearchResult | null>(null);
  const [failed, setFailed] = useState(false);
  const cancel = useRef(false);

  const run = async () => {
    cancel.current = false;
    setFound(null);
    setFailed(false);
    setProgress(0);
    const r = await searchServeForSpin({ topBack, side, length, timing }, params, {
      onProgress: setProgress,
      isCancelled: () => cancel.current,
    });
    setProgress(null);
    if (r) setFound(r);
    else setFailed(true);
  };

  const text = found ? receiverSpinText(found.spin) : null;
  const p = found?.params;

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6">
        相手のラケットに当たる瞬間に<strong>この回転</strong>にしたい、を指定すると、そのサーブを出すスイングを探します。
        サーブの種類（体の使い方）・トス・打点・ラケットのどこに当てるかは今の設定のままで、関節は可動域の中だけで探します。
      </p>
      <div className="space-y-3 rounded-xl p-4 ring-1 ring-tt-gray30/50">
        <Range
          id="inv-topback"
          label="上回転(+) / 下回転(−)"
          value={topBack}
          min={-40}
          max={40}
          onChange={setTopBack}
        />
        <Range
          id="inv-side"
          label="横回転（＋で受け手から見て右へ曲がる）"
          value={side}
          min={-30}
          max={30}
          onChange={setSide}
        />
        <div>
          <p className="text-xs font-bold text-tt-gray70">長さ</p>
          <Chips
            items={[
              { id: "short", label: "ショート（相手コートで2バウンド）" },
              { id: "long", label: "ロング（台から出る）" },
            ]}
            value={length}
            onChange={setLength}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" onClick={run} disabled={progress !== null}>
            {progress === null ? "このサーブを探す" : `探しています ${Math.round(progress * 100)}%`}
          </Button>
          {progress !== null && (
            <Button size="sm" variant="ghost" onClick={() => (cancel.current = true)}>
              やめる
            </Button>
          )}
        </div>
      </div>

      {failed && (
        <p className="rounded-xl bg-tt-soft-green p-3 text-sm">
          入るサーブが見つかりませんでした。回転を控えめにするか、長さを変えてみてください。
        </p>
      )}

      {found && p && text && (
        <div className="rounded-xl p-4 ring-1 ring-tt-gray30/50">
          <p className="text-xs font-bold">見つかったサーブ</p>
          <p className="mt-1 text-sm">
            相手の打球点で <strong>{found.spin.label}</strong>（{text.tb}、{text.sd}）。狙いとの差{" "}
            <span className="font-mono font-bold">{found.error.toFixed(1)}rps</span>
          </p>
          <p className="mt-3 text-xs font-bold">今の設定から変わる関節（打球の瞬間の角度 / 振り幅）</p>
          <ul className="mt-1 space-y-1 text-sm">
            {JOINTS.map((j) => {
              const dc = p.contact[j.key] - params.contact[j.key];
              const ds = p.sweep[j.key] - params.sweep[j.key];
              if (Math.abs(dc) < 1 && Math.abs(ds) < 1) return null;
              return (
                <li key={j.key} className="flex justify-between gap-3 border-b border-tt-gray30/30 py-1">
                  <span>{j.label}</span>
                  <span className="font-mono tabular-nums">
                    {p.contact[j.key]}°（{fmt(dc)}）/ 振り幅 {p.sweep[j.key]}°（{fmt(ds)}）
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Stat label="打球点の速さ" value={(found.result.contact.impact?.hitPointSpeed ?? 0).toFixed(1)} unit="m/s" />
            <Stat label="スイングの鋭さ" value={(p.tempo * 1000).toFixed(0)} unit="ms" />
          </div>
          <div className="mt-3">
            <Button size="sm" variant="secondary" onClick={() => onApply(p)}>
              このサーブを今の設定にする
            </Button>
          </div>
          <p className="mt-2 text-xs leading-5 text-tt-gray70">
            同じ回転を出すスイングは1つではありません。見つかるのはその一例です（同じ回転なら、ネットの上を低く通るものを優先）。
          </p>
        </div>
      )}
    </div>
  );
}

function Range({
  id,
  label,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-bold">
          {label}
        </label>
        <span className="font-mono text-sm tabular-nums">{value > 0 ? `+${value}` : value}rps</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 h-8 w-full accent-[var(--color-gs-red)]"
      />
    </div>
  );
}
