"use client";

import { useMemo } from "react";
import { ServeViewport } from "@/components/serve-viewport";
import { HIDDEN_WINDOW_S, VISIBLE_WINDOW_S, differenceSeries } from "@/lib/serve-search";
import type { SimResult, SpinBreakdown } from "@/lib/serve-sim";

/**
 * A と B を「相手の目線」で横に並べ、同じ瞬間（打球からの時間をそろえる）を見比べる。
 * 下のグラフは、その瞬間ごとのラケットと腕の位置のずれ。
 */
export function AbReceiverCompare({
  a,
  b,
  spinA,
  spinB,
  tau,
  onSeek,
}: {
  a: SimResult;
  b: SimResult;
  /** 相手の打球点での回転 */
  spinA: SpinBreakdown;
  spinB: SpinBreakdown;
  /** 打球からの時間 (秒)。A・B とも打球の瞬間をそろえて表示する */
  tau: number;
  onSeek: (tau: number) => void;
}) {
  const series = useMemo(() => differenceSeries(a, b), [a, b]);
  const now = series.reduce((best, s) => (Math.abs(s.tau - tau) < Math.abs(best.tau - tau) ? s : best), series[0]);
  const inWindow = Math.abs(tau) <= VISIBLE_WINDOW_S;

  return (
    <div className="border-t border-white/10 px-3 py-2 text-white">
      <p className="text-xs font-bold">相手の目線で A と B を並べる（打球の瞬間をそろえて同時に再生）</p>
      <div className="mt-1 grid grid-cols-2 gap-2">
        {([
          ["A", a, spinA],
          ["B", b, spinB],
        ] as const).map(([label, r, sp]) => (
          <div key={label} className="overflow-hidden rounded-md ring-1 ring-white/15">
            <p className="bg-white/10 px-2 py-0.5 text-[11px]">
              {label}: 相手の打球点で {sp.label} {sp.total.toFixed(0)}rps
            </p>
            <ServeViewport result={r} ghost={null} receive={null} time={r.contactTime + tau} camera="receiver" />
          </div>
        ))}
      </div>
      <DifferenceChart series={series} tau={tau} onSeek={onSeek} />
      <p className="mt-1 font-mono text-[11px] tabular-nums text-white/80">
        {inWindow
          ? `打球から ${(tau * 1000).toFixed(0)}ms: 位置のずれ ${now.cm.toFixed(1)}cm・面の向きのずれ ${now.faceDeg.toFixed(1)}°${now.hidden ? "（見分けにくいとみなす時間）" : ""}`
          : "グラフの範囲（打球の前後 ±100ms）の外です"}
      </p>
    </div>
  );
}

const CW = 600;
const CH = 120;
const PAD = { l: 34, r: 8, t: 8, b: 20 };

function DifferenceChart({
  series,
  tau,
  onSeek,
}: {
  series: ReturnType<typeof differenceSeries>;
  tau: number;
  onSeek: (tau: number) => void;
}) {
  const maxCm = Math.max(2, Math.ceil(Math.max(...series.map((s) => s.cm))));
  const x = (t: number) => PAD.l + ((t + VISIBLE_WINDOW_S) / (2 * VISIBLE_WINDOW_S)) * (CW - PAD.l - PAD.r);
  const y = (cm: number) => CH - PAD.b - (cm / maxCm) * (CH - PAD.t - PAD.b);
  const line = series.map((s, i) => `${i ? "L" : "M"}${x(s.tau).toFixed(1)},${y(s.cm).toFixed(1)}`).join(" ");
  const area = `${line} L${x(VISIBLE_WINDOW_S)},${y(0)} L${x(-VISIBLE_WINDOW_S)},${y(0)} Z`;
  const cursor = Math.min(VISIBLE_WINDOW_S, Math.max(-VISIBLE_WINDOW_S, tau));

  return (
    <svg
      viewBox={`0 0 ${CW} ${CH}`}
      className="mt-2 block h-auto w-full cursor-pointer"
      role="img"
      aria-label="A と B の見た目の差（時間ごと）"
      onClick={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        const px = ((e.clientX - box.left) / box.width) * CW;
        const t = ((px - PAD.l) / (CW - PAD.l - PAD.r)) * 2 * VISIBLE_WINDOW_S - VISIBLE_WINDOW_S;
        onSeek(Math.min(VISIBLE_WINDOW_S, Math.max(-VISIBLE_WINDOW_S, t)));
      }}
    >
      <rect x={x(-HIDDEN_WINDOW_S)} y={PAD.t} width={x(HIDDEN_WINDOW_S) - x(-HIDDEN_WINDOW_S)} height={CH - PAD.t - PAD.b} fill="#ffffff" opacity={0.08} />
      <text x={x(0)} y={PAD.t + 10} fill="#ffffff" opacity={0.6} fontSize={10} textAnchor="middle">
        見分けにくい
      </text>
      {[0, maxCm / 2, maxCm].map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={CW - PAD.r} y1={y(v)} y2={y(v)} stroke="#ffffff" opacity={0.12} />
          <text x={PAD.l - 4} y={y(v) + 3} fill="#ffffff" opacity={0.7} fontSize={10} textAnchor="end">
            {v}cm
          </text>
        </g>
      ))}
      {[-0.1, -0.05, 0, 0.05, 0.1].map((t) => (
        <text key={t} x={x(t)} y={CH - 6} fill="#ffffff" opacity={0.7} fontSize={10} textAnchor="middle">
          {t === 0 ? "打球" : `${t > 0 ? "+" : ""}${Math.round(t * 1000)}ms`}
        </text>
      ))}
      <path d={area} fill="var(--color-gs-red)" opacity={0.25} />
      <path d={line} fill="none" stroke="var(--color-gs-red)" strokeWidth={2} />
      <line x1={x(cursor)} x2={x(cursor)} y1={PAD.t} y2={CH - PAD.b} stroke="#ffd166" strokeWidth={1.5} />
    </svg>
  );
}
