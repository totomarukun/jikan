"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chips, OUTCOME_STYLE, Stat, receiverSpinText } from "@/components/serve-receive";
import { simulateReceive, TECHNIQUES, type ReceiveOutcome, type ReceiveTiming, type Technique } from "@/lib/receive";
import {
  DEFAULT_LIMITS,
  DISGUISE_MODES,
  HIDDEN_WINDOW_S,
  VISIBLE_WINDOW_S,
  searchDisguise,
  type DisguiseLimits,
  type DisguiseMode,
  type DisguiseResult,
} from "@/lib/serve-search";
import { JOINTS } from "@/lib/arm";
import type { ServeParams } from "@/lib/serve-sim";

type Check = { technique: Technique; fooled: ReceiveOutcome; correct: ReceiveOutcome };

// サーブの差分を、人が読める言葉にする（関節の角度・振り幅・スナップ・当てる位置）
type DiffDef = { id: string; label: string; unit: string; get: (p: ServeParams) => number; scale?: number; digits?: number };
const DIFF_LABELS: DiffDef[] = [
  ...JOINTS.map((j) => ({ id: `c-${j.key}`, label: `${j.label}（打球の瞬間）`, unit: "°", get: (p: ServeParams) => p.contact[j.key], digits: 0 })),
  ...JOINTS.map((j) => ({ id: `s-${j.key}`, label: `${j.label}（振り幅）`, unit: "°", get: (p: ServeParams) => p.sweep[j.key], digits: 0 })),
  { id: "tempo", label: "スイングの鋭さ", unit: "ms", get: (p) => p.tempo, scale: 1000, digits: 0 },
  { id: "snapFlex", label: "手首のスナップ（掌屈）", unit: "°", get: (p) => p.snapFlex, digits: 0 },
  { id: "snapDev", label: "手首のスナップ（橈屈）", unit: "°", get: (p) => p.snapDev, digits: 0 },
  { id: "snapPron", label: "前腕のひねり込み", unit: "°", get: (p) => p.snapPron, digits: 0 },
  { id: "hitAlong", label: "当てる位置（先端方向）", unit: "mm", get: (p) => p.hitAlong, scale: 1000, digits: 0 },
  { id: "hitAcross", label: "当てる位置（横）", unit: "mm", get: (p) => p.hitAcross, scale: 1000, digits: 0 },
];

/**
 * フォーム研究: 今のサーブ（A）と見た目がほぼ同じで、相手の打球点での回転が違うサーブ（B）を探し、
 * 相手が A だと思って B を受けたらどうなるかを見る。
 */
export function DisguisePanel({
  params,
  timing,
  variant,
  onVariant,
  showing,
  onShowing,
  onAdopt,
}: {
  params: ServeParams;
  timing: ReceiveTiming;
  variant: DisguiseResult | null;
  onVariant: (d: DisguiseResult | null) => void;
  showing: "A" | "B";
  onShowing: (s: "A" | "B") => void;
  onAdopt: (p: ServeParams) => void;
}) {
  const [mode, setMode] = useState<DisguiseMode>("any");
  const [limits, setLimits] = useState<DisguiseLimits>(DEFAULT_LIMITS);
  const [progress, setProgress] = useState<number | null>(null);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [failed, setFailed] = useState(false);
  const cancel = useRef(false);

  const run = async () => {
    cancel.current = false;
    onVariant(null);
    setChecks(null);
    setFailed(false);
    setProgress(0);
    const d = await searchDisguise(params, timing, mode, limits, {
      onProgress: (f) => setProgress(f * 0.85),
      isCancelled: () => cancel.current,
    });
    if (!d) {
      setProgress(null);
      setFailed(true);
      return;
    }
    // 相手が A と思って B を受けたら？（技術ごと）。比較のため正しく読んだ場合も
    const techs: Technique[] = d.result.verdict === "long" ? ["drive", "flick", "push"] : ["push", "stop", "flick"];
    const out: Check[] = [];
    for (const [i, t] of techs.entries()) {
      await new Promise((r) => setTimeout(r, 0));
      out.push({
        technique: t,
        fooled: simulateReceive(d.stateB, t, d.stateA.omega).outcome,
        correct: simulateReceive(d.stateB, t, d.stateB.omega).outcome,
      });
      setProgress(0.85 + (0.15 * (i + 1)) / techs.length);
    }
    setChecks(out);
    onVariant(d);
    setProgress(null);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6">
        今のサーブを <strong>A</strong> とします。<strong>見た目（ラケットの動き）がほぼ同じ</strong>まま、
        相手の打球点での回転がなるべく違うサーブ <strong>B</strong> を探し、相手が A だと思って B を受けたらどうなるかを計算します。
      </p>

      <div className="space-y-3 rounded-xl p-4 ring-1 ring-tt-gray30/50">
        <div>
          <p className="text-xs font-bold text-tt-gray70">B をどう変えるか</p>
          <Chips items={DISGUISE_MODES} value={mode} onChange={setMode} />
        </div>
        <LimitSlider
          id="lim-cm"
          label="見た目の差の上限（ラケット位置のずれ）"
          value={limits.visibleCm}
          min={0.5}
          max={5}
          step={0.5}
          unit="cm"
          onChange={(v) => setLimits({ ...limits, visibleCm: v })}
        />
        <LimitSlider
          id="lim-deg"
          label="見た目の差の上限（面の向きのずれ）"
          value={limits.visibleDeg}
          min={1}
          max={15}
          step={1}
          unit="°"
          onChange={(v) => setLimits({ ...limits, visibleDeg: v })}
        />
        <LimitSlider
          id="lim-land"
          label="軌道の差の上限（相手コートの着地点のずれ）"
          value={limits.landingCm}
          min={5}
          max={60}
          step={5}
          unit="cm"
          onChange={(v) => setLimits({ ...limits, landingCm: v })}
        />
        <LimitSlider
          id="lim-net"
          label="軌道の差の上限（ネット上を通る高さの差）"
          value={limits.netCm}
          min={1}
          max={20}
          step={1}
          unit="cm"
          onChange={(v) => setLimits({ ...limits, netCm: v })}
        />
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" onClick={run} disabled={progress !== null}>
            {progress === null ? "見た目が同じで回転が違うサーブを探す" : `探しています ${Math.round(progress * 100)}%`}
          </Button>
          {progress !== null && (
            <Button size="sm" variant="ghost" onClick={() => (cancel.current = true)}>
              やめる
            </Button>
          )}
        </div>
        <p className="text-xs leading-5 text-tt-gray70">
          「見た目の差」は打球の前後 ±{VISIBLE_WINDOW_S * 1000}ms のラケットの動きの差です。ただし打球の前後 ±
          {HIDDEN_WINDOW_S * 1000}ms は相手が見分けにくいと仮定して除いています（実験で決めた値ではありません）。
        </p>
      </div>

      {failed && (
        <p className="rounded-xl bg-tt-soft-green p-3 text-sm">
          条件を満たすサーブが見つかりませんでした。今のサーブが入っていない可能性があります。上限をゆるめるか、サーブを見直してください。
        </p>
      )}

      {variant && (
        <div className="space-y-4 rounded-xl p-4 ring-1 ring-tt-gray30/50">
          <div className="grid grid-cols-2 gap-3">
            <SpinCard tag="A（今のサーブ）" spin={variant.spinA} />
            <SpinCard tag="B（見つかったサーブ）" spin={variant.spinB} />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="見た目の差（位置）" value={variant.visible.meanCm.toFixed(1)} unit="cm" />
            <Stat label="見た目の差（面）" value={variant.visible.faceDeg.toFixed(1)} unit="°" />
            <Stat label="着地点のずれ" value={variant.landingGapCm.toFixed(0)} unit="cm" />
            <Stat label="ネット上の高さの差" value={variant.netGapCm.toFixed(1)} unit="cm" />
          </div>
          {!variant.withinLimits && (
            <p className="text-xs text-tt-green">上限をすべて満たす候補はなく、いちばん近いものを表示しています。</p>
          )}

          <ChangeList from={params} to={variant.params} />

          {checks && (
            <div>
              <p className="text-xs font-bold">相手が A だと思って B を受けると</p>
              <table className="mt-2 w-full border-separate border-spacing-1 text-center text-xs">
                <thead>
                  <tr className="text-tt-gray70">
                    <th className="text-left font-normal">技術</th>
                    <th className="font-normal">A と読んだ場合</th>
                    <th className="font-normal">B と正しく読んだ場合</th>
                  </tr>
                </thead>
                <tbody>
                  {checks.map((c) => (
                    <tr key={c.technique}>
                      <th className="text-left font-bold">{TECHNIQUES[c.technique].label}</th>
                      <td className={`rounded-md py-1.5 font-bold ${OUTCOME_STYLE[c.fooled].cls}`}>{OUTCOME_STYLE[c.fooled].short}</td>
                      <td className={`rounded-md py-1.5 font-bold ${OUTCOME_STYLE[c.correct].cls}`}>{OUTCOME_STYLE[c.correct].short}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Chips
              items={[
                { id: "A", label: "A を表示" },
                { id: "B", label: "B を表示（A は灰色の点線）" },
              ]}
              value={showing}
              onChange={onShowing}
            />
          </div>
          <Button size="sm" variant="secondary" onClick={() => onAdopt(variant.params)}>
            B を今のサーブにする
          </Button>
        </div>
      )}
    </div>
  );
}

/** A → B で変えたところを、関節・スナップ・当てる位置の言葉で並べる。 */
export function ChangeList({
  from,
  to,
  title = "A → B で変えたところ",
  empty = "変えるところが見つかりませんでした（この条件では A の回転は変えにくい）。",
}: {
  from: ServeParams;
  to: ServeParams;
  title?: string;
  empty?: string;
}) {
  const diffs = DIFF_LABELS.map((d) => ({ ...d, delta: (d.get(to) - d.get(from)) * (d.scale ?? 1) })).filter(
    (d) => Math.abs(d.delta) >= (d.digits === 0 ? 1 : 0.1),
  );
  return (
    <div>
      <p className="text-xs font-bold">{title}</p>
      {diffs.length === 0 ? (
        <p className="mt-1 text-sm">{empty}</p>
      ) : (
        <ul className="mt-1 space-y-1 text-sm">
          {diffs.map((d) => (
            <li key={d.id} className="flex justify-between gap-3 border-b border-tt-gray30/30 py-1">
              <span>{d.label}</span>
              <span className="font-mono tabular-nums">
                {d.delta > 0 ? "+" : ""}
                {d.delta.toFixed(d.digits ?? 1)}
                {d.unit}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SpinCard({ tag, spin }: { tag: string; spin: DisguiseResult["spinA"] }) {
  const t = receiverSpinText(spin);
  return (
    <div className="rounded-lg bg-tt-offwhite p-3">
      <p className="text-[11px] text-tt-gray70">{tag}</p>
      <p className="mt-1 text-lg font-bold">{spin.label}</p>
      <p className="font-mono text-sm tabular-nums">{spin.total.toFixed(1)}rps</p>
      <p className="mt-1 text-[11px] leading-4 text-tt-gray70">
        {t.tb}
        <br />
        {t.sd}
      </p>
    </div>
  );
}

export function LimitSlider({
  id,
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-bold">
          {label}
        </label>
        <span className="font-mono text-sm tabular-nums">
          {value}
          {unit}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 h-8 w-full accent-[var(--color-gs-red)]"
      />
    </div>
  );
}
