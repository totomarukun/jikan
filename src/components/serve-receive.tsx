"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { BallState } from "@/lib/flight";
import {
  RECEIVE_TIMINGS,
  SPIN_READS,
  TECHNIQUES,
  readSpin,
  simulateReceive,
  type ReceiveOutcome,
  type ReceiveResult,
  type ReceiveTiming,
  type SpinRead,
  type Technique,
} from "@/lib/receive";
import { breakdownSpin, type SimResult, type SpinBreakdown } from "@/lib/serve-sim";

export const OUTCOME_STYLE: Record<ReceiveOutcome, { short: string; cls: string }> = {
  in: { short: "返された", cls: "bg-tt-offwhite text-tt-charcoal" },
  high: { short: "浮いた", cls: "bg-tt-soft-coral text-tt-deep-coral" },
  net: { short: "ネット", cls: "bg-tt-soft-green text-tt-green" },
  out: { short: "オーバー", cls: "bg-tt-soft-green text-tt-green" },
  miss: { short: "当たらず", cls: "bg-tt-soft-green text-tt-green" },
};

const TECHNIQUE_ORDER: Technique[] = ["push", "stop", "flick", "drive"];

/** 受け手から見た回転の言い方（横回転は受け手の左右に直す）。 */
export function receiverSpinText(sp: SpinBreakdown) {
  const tb = Math.abs(sp.topBack) < 1 ? "上下の回転ほぼなし" : `${sp.topBack > 0 ? "上回転" : "下回転"} ${Math.abs(sp.topBack).toFixed(1)}rps`;
  // サーバー基準の +（サーバーから見て左へ曲がる）は、受け手から見ると右へ曲がる
  const sd = Math.abs(sp.side) < 1 ? "横回転ほぼなし" : `受け手から見て${sp.side > 0 ? "右" : "左"}へ曲がる横回転 ${Math.abs(sp.side).toFixed(1)}rps`;
  return { tb, sd };
}

export function ReceivePanel({
  result,
  state,
  timing,
  onTiming,
  technique,
  onTechnique,
  read,
  onRead,
  receive,
}: {
  result: SimResult;
  state: BallState | null;
  timing: ReceiveTiming;
  onTiming: (t: ReceiveTiming) => void;
  technique: Technique;
  onTechnique: (t: Technique) => void;
  read: SpinRead;
  onRead: (r: SpinRead) => void;
  receive: ReceiveResult | null;
}) {
  if (!state) {
    return (
      <p className="rounded-xl bg-tt-offwhite p-4 text-sm leading-6">
        このサーブは相手コートに入っていないため、相手の打球点がありません。まずサーブを入れてください。
      </p>
    );
  }
  const sp = breakdownSpin(state.omega, state.vel);
  const text = receiverSpinText(sp);
  const drop = result.contact.spin.total > 1 ? 1 - sp.total / result.contact.spin.total : 0;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-bold text-tt-gray70">相手が打つタイミング</p>
        <Chips items={RECEIVE_TIMINGS} value={timing} onChange={onTiming} />
      </div>

      <div className="rounded-xl p-4 ring-1 ring-tt-gray30/50">
        <p className="text-xs font-bold">相手のラケットに当たる瞬間の回転</p>
        <p className="mt-2 text-2xl font-bold">{sp.label}</p>
        <ul className="mt-2 space-y-1 text-sm">
          <li>{text.tb}</li>
          <li>{text.sd}</li>
        </ul>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="総回転" value={sp.total.toFixed(1)} unit="rps" />
          <Stat label="ボールの高さ" value={((state.pos.z - 0.02) * 100).toFixed(0)} unit="cm" />
          <Stat label="ボールの速さ" value={(Math.hypot(state.vel.x, state.vel.y, state.vel.z) * 3.6).toFixed(1)} unit="km/h" />
        </div>
        <p className="mt-3 text-xs leading-5 text-tt-gray70">
          打球直後の {result.contact.spin.total.toFixed(1)}rps から、台での2回のバウンドなどで約{Math.round(drop * 100)}%
          {drop >= 0 ? "減って" : "増えて"}います。相手が受けるのはこの回転です。
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-bold text-tt-gray70">相手のレシーブ技術</p>
        <Chips items={TECHNIQUE_ORDER.map((id) => ({ id, label: TECHNIQUES[id].label }))} value={technique} onChange={onTechnique} />
        <p className="text-xs text-tt-gray70">{TECHNIQUES[technique].description}</p>
        <p className="pt-1 text-xs font-bold text-tt-gray70">相手の回転の読み</p>
        <Chips items={SPIN_READS} value={read} onChange={onRead} />
        <p className="text-xs leading-5 text-tt-gray70">
          相手は「読んだ回転」で入る角度にラケットを合わせ、その角度のまま実際の回転のボールを打ちます。
        </p>
      </div>

      {receive && <ReceiveOutcomeCard receive={receive} />}

      {/* サーブ（打球点のボール）が変わったら作り直して、古い結果を消す */}
      <ReceiveMatrix key={`${state.t}:${state.pos.x}:${state.pos.y}:${state.omega.x}:${state.omega.z}`} state={state} />
    </div>
  );
}

function ReceiveOutcomeCard({ receive }: { receive: ReceiveResult }) {
  const style = OUTCOME_STYLE[receive.outcome];
  return (
    <div className="rounded-xl p-4 ring-1 ring-tt-gray30/50">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${style.cls}`}>{style.short}</span>
        <p className="text-sm font-bold">{receive.outcomeLabel}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="返球の着地点"
          value={receive.landing ? (receive.landing.x * 100).toFixed(0) : "—"}
          unit={receive.landing ? "cm（自陣エンドラインから）" : ""}
        />
        <Stat
          label="ネット上の高さ"
          value={receive.netClearance === null ? "—" : (receive.netClearance * 100).toFixed(1)}
          unit={receive.netClearance === null ? "" : "cm"}
        />
        <Stat label="返球の速さ" value={(receive.returnSpeed * 3.6).toFixed(1)} unit="km/h" />
        <Stat label="返球の回転" value={receive.returnSpin.total.toFixed(1)} unit={`rps ${receive.returnSpin.label}`} />
      </div>
      <p className="mt-3 text-xs leading-5 text-tt-gray70">
        相手のラケット: 面の角度 {receive.racket.faceTilt.toFixed(0)}°（＋で上向き）・左右 {receive.racket.faceYaw.toFixed(0)}°・
        スイング {receive.racket.swingSpeed.toFixed(1)}m/s（上下 {receive.racket.swingPitch.toFixed(0)}°）
      </p>
    </div>
  );
}

/** 技術 × 読み を総当たりして、読み違いがどれだけミスにつながるかを見る。 */
function ReceiveMatrix({ state }: { state: BallState }) {
  const [rows, setRows] = useState<Record<string, ReceiveOutcome> | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const token = useRef(0);

  // 画面を離れたら（サーブが変わって作り直されたときも）計算を止める
  useEffect(() => {
    const t = token;
    return () => {
      t.current++;
    };
  }, []);

  const run = async () => {
    const my = ++token.current;
    const out: Record<string, ReceiveOutcome> = {};
    const total = TECHNIQUE_ORDER.length * SPIN_READS.length;
    let done = 0;
    setProgress(0);
    for (const tech of TECHNIQUE_ORDER) {
      for (const r of SPIN_READS) {
        await new Promise((res) => setTimeout(res, 0));
        if (token.current !== my) return;
        out[`${tech}:${r.id}`] = simulateReceive(state, tech, readSpin(state.omega, state.vel, r.id)).outcome;
        done++;
        setProgress(done / total);
      }
    }
    setRows(out);
    setProgress(null);
  };

  const misread = rows
    ? TECHNIQUE_ORDER.flatMap((t) => SPIN_READS.filter((r) => r.id !== "actual").map((r) => rows[`${t}:${r.id}`]))
    : [];
  const errors = misread.filter((o) => o === "net" || o === "out" || o === "miss").length;
  const floats = misread.filter((o) => o === "high").length;

  return (
    <div className="rounded-xl p-4 ring-1 ring-tt-gray30/50">
      <p className="text-xs font-bold">読み違いの影響（技術 × 読み の総当たり）</p>
      <p className="mt-1 text-xs leading-5 text-tt-gray70">
        読み違えたときにミスや浮き球になりやすいほど、「回転を悟られたくない」サーブとして価値があります。
      </p>
      {!rows && (
        <div className="mt-3 flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={run} disabled={progress !== null}>
            {progress === null ? "総当たりで調べる（数秒）" : `計算中 ${Math.round(progress * 100)}%`}
          </Button>
        </div>
      )}
      {rows && (
        <>
          <p className="mt-3 text-sm">
            読み違い {misread.length}通りのうち、ミス <span className="font-mono font-bold">{errors}</span>・浮き球{" "}
            <span className="font-mono font-bold">{floats}</span>
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[520px] border-separate border-spacing-1 text-center text-xs">
              <thead>
                <tr>
                  <th className="text-left font-normal text-tt-gray70">技術＼読み</th>
                  {SPIN_READS.map((r) => (
                    <th key={r.id} className="font-normal text-tt-gray70">
                      {r.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TECHNIQUE_ORDER.map((t) => (
                  <tr key={t}>
                    <th className="text-left font-bold">{TECHNIQUES[t].label}</th>
                    {SPIN_READS.map((r) => {
                      const o = rows[`${t}:${r.id}`];
                      return (
                        <td key={r.id} className={`rounded-md px-1 py-1.5 font-bold ${OUTCOME_STYLE[o].cls}`}>
                          {OUTCOME_STYLE[o].short}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export function Chips<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => onChange(it.id)}
          aria-pressed={value === it.id}
          className={`min-h-9 rounded-full px-3 text-xs font-bold transition ${
            value === it.id ? "bg-tt-charcoal text-white" : "bg-white text-tt-charcoal ring-1 ring-tt-gray30/60 hover:bg-tt-offwhite"
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-lg bg-tt-offwhite px-2.5 py-2 text-left">
      <p className="text-[11px] leading-4 text-tt-gray70">{label}</p>
      <p className="mt-0.5 font-mono text-base font-bold tabular-nums">
        {value}
        <span className="ml-1 text-[11px] font-normal text-tt-gray70">{unit}</span>
      </p>
    </div>
  );
}
