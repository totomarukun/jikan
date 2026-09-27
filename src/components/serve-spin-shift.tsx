"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chips } from "@/components/serve-receive";
import { SERVE_TYPES } from "@/lib/arm";
import type { ReceiveTiming } from "@/lib/receive";
import type { SimResult, SpinBreakdown, ServeParams } from "@/lib/serve-sim";
import {
  MAX_NET_M,
  SPIN_KINDS,
  compareShift,
  searchSpinShift,
  spinAngle,
  spinTimeline,
  tempoSweep,
  type SpinKind,
  type SpinShiftCandidate,
  type SpinShiftQuery,
  type SpinTimeline,
} from "@/lib/spin-shift";

export type ShiftRun = { query: SpinShiftQuery; list: SpinShiftCandidate[]; done: boolean; runs: number };

const typeLabel = (id: string) => SERVE_TYPES.find((t) => t.id === id)?.label ?? id;
const lengthLabel = (l: "short" | "long") => (l === "short" ? "ショート" : "ロング");
const TIMING_LABEL: Record<ReceiveTiming, string> = { rising: "早め（上昇中）", apex: "頂点", falling: "遅め（落ち際）" };

// 3つの成分の色（上下 = 赤、横 = 青、ジャイロ = 灰の点線）
const C_TB = "var(--color-gs-red)";
const C_SD = "var(--color-gs-blue)";
const C_GY = "var(--color-tt-gray70)";

/**
 * 回転の変化: 打球したときの回転（相手がスイングから思い描く回転）と、相手のラケットに届くときの回転とで、
 * 向きが大きく変わるサーブを探す。今のサーブの回転の移り変わりも見られる。
 */
export function SpinShiftPanel({
  result,
  params,
  timing,
  run: last,
  onRun,
  onApply,
}: {
  result: SimResult;
  params: ServeParams;
  timing: ReceiveTiming;
  run: ShiftRun | null;
  onRun: (r: ShiftRun | null) => void;
  onApply: (c: SpinShiftCandidate) => void;
}) {
  const [from, setFrom] = useState<SpinKind>(last?.query.from ?? "any");
  const [to, setTo] = useState<SpinKind>(last?.query.to ?? "any");
  const [minRps, setMinRps] = useState(last?.query.minRps ?? 10);
  const [progress, setProgress] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const cancel = useRef(false);
  const runs = useRef(last?.runs ?? 0);

  const query: SpinShiftQuery = { from, to, minRps, timing };
  const sameQuery = (q: SpinShiftQuery) => q.from === from && q.to === to && q.minRps === minRps && q.timing === timing;
  const canAdd = !!last?.done && sameQuery(last.query);

  const start = async (add: boolean) => {
    cancel.current = false;
    setFailed(false);
    const previous = add && last ? last.list : undefined;
    if (!add) onRun(null);
    runs.current = add ? runs.current + 1 : 1;
    setProgress(0);
    const list = await searchSpinShift(query, {
      previous,
      seed: 20260927 + (runs.current - 1) * 7919,
      onProgress: setProgress,
      onPartial: (partial) => onRun({ query, list: partial, done: false, runs: runs.current }),
      isCancelled: () => cancel.current,
    });
    setProgress(null);
    if (!list) return;
    if (list.length === 0) {
      setFailed(true);
      onRun(null);
      return;
    }
    onRun({ query, list, done: true, runs: runs.current });
    onApply(list[0]);
  };

  const sorted = last ? [...last.list].sort(compareShift) : [];
  const selected = last?.list.find((c) => c.params === params) ?? null;

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6">
        打球したときは下回転なのに、相手のラケットに届くときは横回転になっている、のように
        <strong>回転の向きが途中で大きく変わるサーブ</strong>を探します。相手はスイング（＝打球時の回転）から回転を読むので、
        途中で変わるほど読み違えやすいと考えられます。
      </p>

      <SpinJourney result={result} timing={timing} params={params} />

      <div className="space-y-3 rounded-xl p-4 ring-1 ring-tt-gray30/50">
        <p className="text-sm font-bold">回転の向きが変わるサーブを探す（今のサーブの設定は使いません）</p>
        <div>
          <p className="text-xs font-bold text-tt-gray70">打球したときの回転（相手がスイングから思い描く回転）</p>
          <Chips items={SPIN_KINDS} value={from} onChange={setFrom} />
        </div>
        <div>
          <p className="text-xs font-bold text-tt-gray70">相手のラケットに届くときの回転</p>
          <Chips items={SPIN_KINDS} value={to} onChange={setTo} />
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="shift-min" className="text-sm font-bold">
              届くときの回転量の下限
            </label>
            <span className="font-mono text-sm tabular-nums">{minRps}rps</span>
          </div>
          <input
            id="shift-min"
            type="range"
            min={3}
            max={30}
            step={1}
            value={minRps}
            onChange={(e) => setMinRps(Number(e.target.value))}
            className="mt-1 h-8 w-full accent-[var(--color-gs-red)]"
          />
          <p className="text-xs leading-5 text-tt-gray70">
            回転がほとんど残っていないと「向き」に意味がないので、これより少ないものは除きます。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button onClick={() => start(false)} disabled={progress !== null}>
            {progress === null ? "回転の向きが変わるサーブを探す" : `探しています ${Math.round(progress * 100)}%`}
          </Button>
          {canAdd && progress === null && (
            <Button variant="secondary" onClick={() => start(true)}>
              もう一度探して結果に足す
            </Button>
          )}
          {progress !== null && (
            <Button size="sm" variant="ghost" onClick={() => (cancel.current = true)}>
              やめる
            </Button>
          )}
        </div>
        <p className="text-xs leading-5 text-tt-gray70">
          5種類のサーブ × ショート/ロングの10通りで、フォーム・スイングの鋭さ（回転量）・スナップ・打点の位置・ラケットのどこに当てるかを広く動かします（30秒ほど）。
          山なりのサーブは除くため、ネットの上 {MAX_NET_M * 100}cm 以内を通るものだけを探します（実戦で使える低さの目安として置いた値）。
          相手が打つタイミングは「{TIMING_LABEL[timing]}」（「レシーブ」タブで変えられます）。
        </p>
      </div>

      {failed && <p className="rounded-xl bg-tt-soft-green p-3 text-sm">条件に合うサーブが見つかりませんでした。条件をゆるめてみてください。</p>}

      {last && (
        <div className="space-y-2">
          <p className="text-xs font-bold">{last.done ? `結果（${last.runs}回ぶん・押すとそのサーブを表示）` : "見つかった順（計算中）"}</p>
          <table className="w-full border-separate border-spacing-y-1 text-xs">
            <thead>
              <tr className="text-left text-tt-gray70">
                <th className="font-normal">サーブ</th>
                <th className="font-normal">打球したとき</th>
                <th className="font-normal">届くとき</th>
                <th className="text-right font-normal">向きの変化</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c, i) => {
                const active = selected === c;
                const cell = active ? "bg-tt-charcoal text-white" : "bg-white hover:bg-tt-offwhite";
                const weak = c.score < 1;
                return (
                  <tr key={`${c.serveType}-${c.length}`} onClick={() => onApply(c)} aria-selected={active} className="cursor-pointer">
                    <td className={`rounded-l-lg py-2 pl-2 ${cell}`}>
                      <button type="button" className="text-left text-sm font-bold">
                        {i + 1}. {typeLabel(c.serveType)}
                        <span className="ml-1 text-xs font-normal">{lengthLabel(c.length)}</span>
                      </button>
                    </td>
                    <td className={`py-2 ${cell}`}>
                      {c.contactSpin.label}
                      <span className="ml-1 font-mono">{c.contactSpin.total.toFixed(0)}</span>
                    </td>
                    <td className={`py-2 ${cell}`}>
                      {c.receiveSpin.label}
                      <span className="ml-1 font-mono">{c.receiveSpin.total.toFixed(0)}</span>
                    </td>
                    <td className={`rounded-r-lg py-2 pr-2 text-right font-mono font-bold tabular-nums ${cell}`}>
                      {c.angleDeg.toFixed(0)}°{weak && "*"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-xs leading-5 text-tt-gray70">
            数字は回転数 (rps)。「向きの変化」は、上下・横・ジャイロの3成分で表した回転の向きが何度変わったか（180° = 正反対）。
            並びは、向きの変化 × 指定した回転の種類への近さ の順。「*」は指定した種類に当てはまらなかったもの。
          </p>
        </div>
      )}
    </div>
  );
}

/** 今のサーブの、打球直後から相手の打球点までの回転の移り変わり。 */
function SpinJourney({ result, timing, params }: { result: SimResult; timing: ReceiveTiming; params: ServeParams }) {
  const tl = useMemo(() => spinTimeline(result, timing), [result, timing]);
  const sweep = useMemo(() => (result.legal ? tempoSweep(params, timing) : []), [params, timing, result.legal]);
  if (tl.samples.length < 2) {
    return <p className="rounded-xl bg-tt-offwhite p-3 text-sm">今のサーブは相手の打球点まで届かないため、回転の移り変わりを表示できません。</p>;
  }
  const first = tl.samples[0];
  const lastS = tl.samples[tl.samples.length - 1];
  const moments = keyMoments(tl);

  return (
    <div className="space-y-3 rounded-xl p-4 ring-1 ring-tt-gray30/50">
      <p className="text-sm font-bold">今のサーブの回転の移り変わり</p>
      <p className="text-sm leading-6">
        打球したとき <strong>{first.label}</strong>（{first.total.toFixed(0)}rps）→ 相手のラケットに届くとき <strong>{lastS.label}</strong>（
        {lastS.total.toFixed(0)}rps）。向きの変化 <strong className="font-mono">{spinAngle(first, lastS).toFixed(0)}°</strong>
      </p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <SpinCompass tl={tl} moments={moments} />
        <SpinChart tl={tl} />
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-tt-gray70">
            <th className="font-normal">いつ</th>
            <th className="text-right font-normal">上下</th>
            <th className="text-right font-normal">横</th>
            <th className="text-right font-normal">ジャイロ</th>
            <th className="pl-2 font-normal">回転</th>
          </tr>
        </thead>
        <tbody>
          {moments.map((m) => (
            <tr key={m.label} className="border-b border-tt-gray30/30">
              <th className="py-1 text-left font-normal">
                <span className="mr-1 inline-block size-4 rounded-full bg-tt-charcoal text-center text-[10px] leading-4 text-white">{m.mark}</span>
                {m.label}
              </th>
              <td className="py-1 text-right font-mono tabular-nums">{fmtTb(m.s.topBack)}</td>
              <td className="py-1 text-right font-mono tabular-nums">{fmtSd(m.s.side)}</td>
              <td className="py-1 text-right font-mono tabular-nums">{m.s.gyro.toFixed(1)}</td>
              <td className="py-1 pl-2">{m.s.label}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs leading-5 text-tt-gray70">
        上下・横・ジャイロはボールの進行方向を基準にした成分 (rps)。横の「右/左」は受け手から見て曲がる向き。
        このモデルでは、台で弾むと摩擦で上下とジャイロの成分が変わり、縦軸まわりの横回転はほぼ変わりません（Ace らの接触モデル）。
        そのため、下回転が弾むたびに削られて、隠れていた横回転が表に出る、といった変化が起きます。
      </p>

      {sweep.length > 0 && (
        <div>
          <p className="text-xs font-bold">スイングの鋭さ（＝打球時の回転量と速さ）だけを変えると</p>
          <table className="mt-1 w-full text-xs">
            <thead>
              <tr className="text-left text-tt-gray70">
                <th className="font-normal">鋭さ</th>
                <th className="font-normal">打球したとき</th>
                <th className="font-normal">届くとき</th>
                <th className="text-right font-normal">向きの変化</th>
              </tr>
            </thead>
            <tbody>
              {sweep.map((r) => (
                <tr key={r.factor} className={`border-b border-tt-gray30/30 ${r.factor === 1 ? "font-bold" : ""}`}>
                  <td className="py-1 font-mono tabular-nums">×{r.factor.toFixed(2)}</td>
                  <td className="py-1">{r.contactSpin ? `${r.contactSpin.label} ${r.contactSpin.total.toFixed(0)}` : "—"}</td>
                  <td className="py-1">{r.ok && r.receiveSpin ? `${r.receiveSpin.label} ${r.receiveSpin.total.toFixed(0)}` : "入らない"}</td>
                  <td className="py-1 text-right font-mono tabular-nums">{r.angleDeg === null ? "—" : `${r.angleDeg.toFixed(0)}°`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const fmtTb = (x: number) => (Math.abs(x) < 0.5 ? "0" : `${x > 0 ? "上" : "下"}${Math.abs(x).toFixed(1)}`);
// サーバー基準の +（サーバーから見て左へ曲がる）は、受け手から見ると右へ曲がる
const fmtSd = (x: number) => (Math.abs(x) < 0.5 ? "0" : `${x > 0 ? "右" : "左"}${Math.abs(x).toFixed(1)}`);

type Moment = { mark: string; label: string; s: SpinBreakdown & { t: number } };

/** 表と図で使う節目: 打球直後・各バウンドの直前と直後・相手の打球点。 */
function keyMoments(tl: SpinTimeline): Moment[] {
  const out: Moment[] = [{ mark: "1", label: "打球直後", s: tl.samples[0] }];
  for (const b of tl.bounces) {
    const before = [...tl.samples].reverse().find((s) => s.t < b.t - 1e-9);
    const after = tl.samples.find((s) => s.t > b.t + 1e-9);
    const where = b.side === "own" ? "自コート" : "相手コート";
    if (before) out.push({ mark: String(out.length + 1), label: `${where}で弾む直前`, s: before });
    if (after) out.push({ mark: String(out.length + 1), label: `${where}で弾んだ直後`, s: after });
  }
  const end = tl.samples[tl.samples.length - 1];
  if (tl.receiveT !== null) out.push({ mark: String(out.length + 1), label: "相手の打球点", s: end });
  return out;
}

/**
 * 回転の向きの地図。上 = 上回転、下 = 下回転、右 = 受け手から見て右へ曲がる横回転、中心 = ジャイロ（進行方向の軸）。
 * 円の中の位置は向きだけ（回転量は含まない）。
 */
function SpinCompass({ tl, moments }: { tl: SpinTimeline; moments: Moment[] }) {
  const R = 80;
  const cx = 100;
  const cy = 100;
  const pos = (s: SpinBreakdown) => {
    const n = Math.hypot(s.topBack, s.side, s.gyro) || 1;
    return [cx + (s.side / n) * R, cy - (s.topBack / n) * R] as const;
  };
  const path = tl.samples
    .map((s, i) => {
      const [x, y] = pos(s);
      return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 200 200" className="mx-auto block h-auto w-full max-w-[240px]" role="img" aria-label="回転の向きの移り変わり">
      <circle cx={cx} cy={cy} r={R} fill="var(--color-tt-offwhite)" stroke="var(--color-tt-gray30)" />
      <line x1={cx - R} x2={cx + R} y1={cy} y2={cy} stroke="var(--color-tt-gray30)" />
      <line x1={cx} x2={cx} y1={cy - R} y2={cy + R} stroke="var(--color-tt-gray30)" />
      <text x={cx} y={cy - R - 6} textAnchor="middle" fontSize={11} fill={C_TB}>
        上回転
      </text>
      <text x={cx} y={cy + R + 14} textAnchor="middle" fontSize={11} fill={C_TB}>
        下回転
      </text>
      <text x={cx + R + 2} y={cy - 4} textAnchor="end" fontSize={10} fill={C_SD}>
        右横
      </text>
      <text x={cx - R - 2} y={cy - 4} textAnchor="start" fontSize={10} fill={C_SD}>
        左横
      </text>
      <text x={cx + 4} y={cy + 12} fontSize={9} fill={C_GY}>
        ジャイロ
      </text>
      <path d={path} fill="none" stroke="var(--color-tt-charcoal)" strokeWidth={1.5} strokeDasharray="3 3" />
      {moments.map((m) => {
        const [x, y] = pos(m.s);
        return (
          <g key={m.label}>
            <circle cx={x} cy={y} r={7} fill="var(--color-tt-charcoal)" />
            <text x={x} y={y + 3.5} textAnchor="middle" fontSize={9} fill="#fff">
              {m.mark}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** 上下・横・ジャイロの回転数の時間変化（縦線 = 台で弾んだ時刻）。 */
function SpinChart({ tl }: { tl: SpinTimeline }) {
  const W = 360;
  const H = 180;
  const pad = { l: 36, r: 8, t: 10, b: 22 };
  const tMax = tl.samples[tl.samples.length - 1].t;
  const vmax = Math.max(5, ...tl.samples.map((s) => Math.max(Math.abs(s.topBack), Math.abs(s.side), Math.abs(s.gyro))));
  const top = Math.ceil(vmax / 10) * 10;
  const x = (t: number) => pad.l + (t / tMax) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + ((top - v) / (2 * top)) * (H - pad.t - pad.b);
  const line = (f: (s: SpinBreakdown) => number) =>
    tl.samples.map((s, i) => `${i ? "L" : "M"}${x(s.t).toFixed(1)},${y(f(s)).toFixed(1)}`).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="回転の成分の時間変化">
        {[-top, 0, top].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--color-tt-gray30)" strokeOpacity={v === 0 ? 1 : 0.5} />
            <text x={pad.l - 4} y={y(v) + 3} textAnchor="end" fontSize={10} fill="var(--color-tt-gray70)">
              {v}
            </text>
          </g>
        ))}
        {tl.bounces.map((b) => (
          <g key={b.t}>
            <line x1={x(b.t)} x2={x(b.t)} y1={pad.t} y2={H - pad.b} stroke="var(--color-tt-charcoal)" strokeDasharray="2 3" />
            <text x={x(b.t)} y={H - 8} textAnchor="middle" fontSize={9} fill="var(--color-tt-gray70)">
              {b.side === "own" ? "自コート" : "相手コート"}
            </text>
          </g>
        ))}

        <path d={line((s) => s.topBack)} fill="none" stroke={C_TB} strokeWidth={2} />
        <path d={line((s) => s.side)} fill="none" stroke={C_SD} strokeWidth={2} />
        <path d={line((s) => s.gyro)} fill="none" stroke={C_GY} strokeWidth={2} strokeDasharray="5 3" />
      </svg>
      <p className="mt-1 flex flex-wrap gap-3 text-[11px] text-tt-gray70">
        <span style={{ color: C_TB }}>━ 上(+)/下(−)</span>
        <span style={{ color: C_SD }}>━ 横（+ = 受け手の右へ）</span>
        <span>┅ ジャイロ</span>
        <span>単位 rps・横軸は打球 → 相手の打球点の時間</span>
      </p>
    </div>
  );
}
