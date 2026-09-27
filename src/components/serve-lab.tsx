"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DisguisePanel } from "@/components/serve-disguise";
import { DeceptionPanel, type DeceptionRun } from "@/components/serve-deception";
import { InversePanel } from "@/components/serve-inverse";
import { ReceivePanel } from "@/components/serve-receive";
import { CAMERAS, ServeViewport, type CameraId } from "@/components/serve-viewport";
import { JOINTS, SERVE_TYPES, jointsAt, type JointKey } from "@/lib/arm";
import { readSpin, receiveState, simulateReceive, type ReceiveTiming, type SpinRead, type Technique } from "@/lib/receive";
import type { DisguiseResult } from "@/lib/serve-search";
import {
  MODEL_SOURCES,
  PRESETS,
  PRO_SERVE_SPIN,
  TABLE,
  faceNormal,
  serveInsights,
  simulateServe,
  swingDirection,
  type ServeParams,
  type SimResult,
  type SpinBreakdown,
} from "@/lib/serve-sim";
import { BLADE, type ContactResult } from "@/lib/racket";
import { norm } from "@/lib/vec3";

const SPEEDS = [0.1, 0.25, 0.5, 1] as const;

type Tab = "serve" | "receive" | "inverse" | "disguise" | "deceive";

const TABS: { id: Tab; label: string }[] = [
  { id: "serve", label: "サーブ" },
  { id: "receive", label: "レシーブ" },
  { id: "inverse", label: "逆算" },
  { id: "disguise", label: "フォーム研究" },
  { id: "deceive", label: "見誤り探索" },
];

type ScalarKey = "height" | "tempo" | "snapFlex" | "snapDev" | "snapPron" | "hitAlong" | "hitAcross" | "tossHeight" | "contactHeight" | "contactBehind" | "contactSide";

type SliderDef = {
  key: ScalarKey;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  /** 表示用の倍率（m → cm など） */
  display?: number;
  hint: string;
};

const GROUPS: { title: string; sliders: SliderDef[] }[] = [
  {
    title: "スイングの速さ・手首のスナップ",
    sliders: [
      { key: "tempo", label: "スイングの鋭さ", min: 0.03, max: 0.12, step: 0.001, unit: "ms", display: 1000, hint: "関節が打球の前後どれくらいの時間で動くか。短いほど鋭く速い（関節の振り幅が同じなら）" },
      { key: "snapFlex", label: "手首のスナップ（掌屈）", min: -40, max: 40, step: 1, unit: "°", hint: "打球の前後 約12ms だけの手首の返し。腕の動き（見える部分）はほぼ変わらない" },
      { key: "snapDev", label: "手首のスナップ（橈屈）", min: -30, max: 30, step: 1, unit: "°", hint: "同じく親指側（＋）/ 小指側（−）へ" },
      { key: "snapPron", label: "前腕のひねり込み", min: -40, max: 40, step: 1, unit: "°", hint: "打球の前後 約20ms だけの回内（＋）/ 回外（−）" },
    ],
  },
  {
    title: "ラケットのどこに当てるか",
    sliders: [
      { key: "hitAlong", label: "先端 ⇔ 根元", min: -0.06, max: 0.07, step: 0.005, unit: "mm", display: 1000, hint: "ブレード中心から先端方向へ。先端ほど速く動いている" },
      { key: "hitAcross", label: "左右", min: -0.06, max: 0.06, step: 0.005, unit: "mm", display: 1000, hint: "ブレード中心から横方向へ" },
    ],
  },
  {
    title: "トスと打点・体",
    sliders: [
      { key: "tossHeight", label: "トスの高さ", min: 0.16, max: 1.5, step: 0.01, unit: "cm", display: 100, hint: "手のひら（台面の高さ）から。16cm以上がルール" },
      { key: "contactHeight", label: "打点の高さ", min: 0.02, max: 0.5, step: 0.01, unit: "cm", display: 100, hint: "台面からの高さ" },
      { key: "contactBehind", label: "打点の前後", min: 0, max: 0.6, step: 0.01, unit: "cm", display: 100, hint: "エンドラインの後ろへの距離" },
      { key: "contactSide", label: "打点の左右", min: -0.7, max: 0.7, step: 0.01, unit: "cm", display: 100, hint: "台の中心線から。＋が左（バック側）" },
      { key: "height", label: "身長", min: 1.4, max: 2.0, step: 0.01, unit: "cm", display: 100, hint: "腕の長さ・肩の高さを身長から決める（比率は推定）" },
    ],
  },
];

export function ServeLab() {
  const [params, setParams] = useState<ServeParams>(PRESETS[0].params);
  const [ghost, setGhost] = useState<SimResult | null>(null);
  const [camera, setCamera] = useState<CameraId>("overview");
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(0.25);
  const [playing, setPlaying] = useState(true);
  const [loop, setLoop] = useState(true);
  const [time, setTime] = useState(0);
  const [activePreset, setActivePreset] = useState<string | null>(PRESETS[0].id);

  const [tab, setTab] = useState<Tab>("serve");
  const [timing, setTiming] = useState<ReceiveTiming>("apex");
  const [technique, setTechnique] = useState<Technique>("push");
  const [read, setRead] = useState<SpinRead>("actual");
  // フォーム研究の B は、どのサーブ（A）に対して探したかと一緒に持つ。A を変えたら自動で無効になる
  const [found, setFound] = useState<{ base: ServeParams; d: DisguiseResult } | null>(null);
  const [showingRaw, setShowing] = useState<"A" | "B">("A");
  const variant = found && found.base === params ? found.d : null;
  // 見誤り探索の結果（タブを切り替えても残す）。選んだ組は A を今のサーブ・B をフォーム研究の B にして表示する
  const [deception, setDeception] = useState<DeceptionRun | null>(null);
  const selectedDeception = variant ? (deception?.list.find((c) => c.disguise === variant) ?? null) : null;
  const showing = variant ? showingRaw : "A";

  const baseResult = useMemo(() => simulateServe(params), [params]);
  // フォーム研究で B を表示しているときは B を主役に、A を比較用（灰色）にする
  const result = variant && showing === "B" ? variant.result : baseResult;
  const compare = variant && showing === "B" ? baseResult : ghost;
  const insights = useMemo(() => serveInsights(result), [result]);

  // 相手のレシーブ（サーブの計算より重いので、入力中は少し遅れて追いかける）
  const deferred = useDeferredValue({ result, timing, technique, read, tab });
  const receiveBall = useMemo(() => receiveState(deferred.result.receiverSide, deferred.timing), [deferred.result, deferred.timing]);
  const receive = useMemo(() => {
    if (!receiveBall || deferred.tab === "serve" || deferred.tab === "inverse") return null;
    const readOmega = readSpin(receiveBall.omega, receiveBall.vel, deferred.read);
    return simulateReceive(receiveBall, deferred.technique, readOmega);
  }, [receiveBall, deferred.technique, deferred.read, deferred.tab]);
  const shownReceive = receive && deferred.result === result ? receive : null;

  const serveEnd = result.points[result.points.length - 1]?.t ?? 1;
  const endTime = shownReceive ? Math.max(serveEnd, shownReceive.points[shownReceive.points.length - 1].t) : serveEnd;

  // 再生ループ（requestAnimationFrame で時刻を進める）
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = ((now - last) / 1000) * speed;
      last = now;
      setTime((t) => {
        const next = t + dt;
        if (next <= endTime + 0.3) return next;
        if (loop) return 0;
        setPlaying(false);
        return endTime;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [playing, speed, loop, endTime]);

  const restart = () => {
    setActivePreset(null);
    setTime(0);
    setPlaying(true);
  };
  const update = (patch: Partial<ServeParams>) => {
    setParams((p) => ({ ...p, ...patch }));
    restart();
  };
  const updateJoint = (group: "contact" | "sweep", key: JointKey, value: number) => {
    setParams((p) => ({ ...p, [group]: { ...p[group], [key]: value } }));
    restart();
  };

  const { contact } = result;
  const phase =
    time < result.contactTime ? "トス" : result.events.find((e) => e.kind === "bounce" && e.t <= time) ? "バウンド後" : "打球直後";
  const curve = lateralCurve(result);
  const serveType = SERVE_TYPES.find((t) => t.id === params.serveType)!;

  return (
    <div className="grid gap-4 landscape:sm:grid-cols-[minmax(0,1.3fr)_minmax(320px,1fr)] lg:grid-cols-[minmax(0,1.4fr)_minmax(380px,1fr)]">
      {/* 左: シミュレーション（横画面では固定） */}
      <div className="min-w-0 landscape:sm:sticky landscape:sm:top-2 landscape:sm:self-start lg:sticky lg:top-2 lg:self-start">
        <div className="overflow-hidden rounded-2xl bg-tt-charcoal shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-2 text-white">
            <div>
              <p className="font-mono text-lg font-bold leading-none sm:text-xl">
                {(contact.ballSpeed * 3.6).toFixed(1)}
                <span className="ml-1 text-xs font-normal">km/h</span>
                <span className="ml-3">{contact.spin.total.toFixed(0)}</span>
                <span className="ml-1 text-xs font-normal">rps</span>
              </p>
              <p className="mt-1 text-xs text-white/80">
                {serveType.label}（{contact.hit ? contact.spin.label : "—"}）・{phase}
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {CAMERAS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCamera(c.id)}
                  aria-pressed={camera === c.id}
                  className={`min-h-8 rounded-md px-2 text-xs font-bold ${
                    camera === c.id ? "bg-white text-tt-charcoal" : "bg-white/15 text-white hover:bg-white/25"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <ServeViewport result={result} ghost={compare} receive={shownReceive} time={time} camera={camera} />

          {/* 再生コントロール */}
          <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-3 py-2 text-white">
            <button
              type="button"
              onClick={() => {
                if (!playing && time >= endTime) setTime(0);
                setPlaying((p) => !p);
              }}
              className="min-h-8 rounded-md bg-white/15 px-3 text-xs font-bold hover:bg-white/25"
            >
              {playing ? "一時停止" : "再生"}
            </button>
            <label className="flex items-center gap-1 text-xs">
              速度
              <select
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value) as (typeof SPEEDS)[number])}
                className="rounded-md bg-white/15 px-1 py-1 text-xs"
              >
                {SPEEDS.map((s) => (
                  <option key={s} value={s} className="text-tt-charcoal">
                    ×{s}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
              ループ
            </label>
            <input
              type="range"
              aria-label="再生位置"
              min={0}
              max={endTime}
              step={0.001}
              value={Math.min(time, endTime)}
              onChange={(e) => {
                setPlaying(false);
                setTime(Number(e.target.value));
              }}
              className="min-w-24 flex-1 accent-[var(--color-gs-red)]"
            />
            <span className="font-mono text-xs tabular-nums">t={Math.max(0, time - result.contactTime).toFixed(3)}s</span>
          </div>
          <div className="grid grid-cols-3 gap-px border-t border-white/10 bg-white/10 text-white">
            <HudStat label="横の曲がり（相手コート1バウンド目）" value={curve.first === null ? "—" : `${curve.first.toFixed(0)}cm`} />
            <HudStat label="横の曲がり（2バウンド目）" value={curve.second === null ? "—" : `${curve.second.toFixed(0)}cm`} />
            <HudStat label="ネット上の余裕" value={result.netClearance === null ? "—" : `${(result.netClearance * 100).toFixed(1)}cm`} />
          </div>
        </div>
      </div>

      {/* 右: 変数をいじる */}
      <div className="min-w-0 space-y-4">
        <div>
          <p className="text-xs font-bold text-tt-gray70">サーブの種類（右利き・基本のスイング）</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setParams(p.params);
                  setActivePreset(p.id);
                  setTime(0);
                  setPlaying(true);
                }}
                aria-pressed={activePreset === p.id}
                className={`min-h-10 rounded-full px-3 text-sm font-bold transition ${
                  activePreset === p.id ? "bg-tt-charcoal text-white" : "bg-white text-tt-charcoal ring-1 ring-tt-gray30/60 hover:bg-tt-offwhite"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-tt-gray70">
            {serveType.label}: {serveType.note}（{serveType.side}）
          </p>
        </div>

        <div role="tablist" aria-label="研究の切り替え" className="flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`min-h-10 shrink-0 rounded-full px-3 text-sm font-bold transition ${
                tab === t.id ? "bg-tt-charcoal text-white" : "bg-white text-tt-charcoal ring-1 ring-tt-gray30/60 hover:bg-tt-offwhite"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "receive" && (
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <ReceivePanel
              result={result}
              state={receiveBall && deferred.result === result ? receiveBall : receiveState(result.receiverSide, timing)}
              timing={timing}
              onTiming={setTiming}
              technique={technique}
              onTechnique={setTechnique}
              read={read}
              onRead={setRead}
              receive={shownReceive}
            />
          </section>
        )}
        {tab === "inverse" && (
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <InversePanel
              params={params}
              timing={timing}
              onApply={(p) => {
                setParams(p);
                restart();
              }}
            />
          </section>
        )}
        {tab === "disguise" && (
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <p className="mb-3 text-xs text-tt-gray70">
              相手が打つタイミング: {timing === "apex" ? "頂点" : timing === "rising" ? "早め（上昇中）" : "遅め（落ち際）"}
              （「レシーブ」で変えられます）
            </p>
            <DisguisePanel
              params={params}
              timing={timing}
              variant={variant}
              onVariant={(d) => {
                setFound(d ? { base: params, d } : null);
                if (d) setShowing("B");
              }}
              showing={showing}
              onShowing={setShowing}
              onAdopt={(p) => {
                setParams(p);
                setActivePreset(null);
              }}
            />
          </section>
        )}

        {tab === "deceive" && (
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <p className="mb-3 text-xs text-tt-gray70">
              相手が打つタイミング: {timing === "apex" ? "頂点" : timing === "rising" ? "早め（上昇中）" : "遅め（落ち際）"}
              （「レシーブ」で変えられます）
            </p>
            <DeceptionPanel
              timing={timing}
              run={deception}
              onRun={setDeception}
              selected={selectedDeception}
              onSelect={(c) => {
                setParams(c.a);
                setActivePreset(null);
                setFound({ base: c.a, d: c.disguise });
                setShowing("B");
                restart();
              }}
            />
          </section>
        )}

        {tab === "serve" && (
          <>
            <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    result.legal ? "bg-tt-soft-coral text-tt-deep-coral" : "bg-tt-soft-green text-tt-green"
                  }`}
                >
                  {result.legal ? "入った" : "ミス"}
                </span>
                <p className="text-sm font-bold">{result.verdictLabel}</p>
              </div>
              {result.warnings.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-tt-green">
                  {result.warnings.map((w) => (
                    <li key={w}>⚠ {w}</li>
                  ))}
                </ul>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Metric label="球速（打球直後）" value={(contact.ballSpeed * 3.6).toFixed(1)} unit="km/h" />
                <Metric label="総回転数" value={contact.spin.total.toFixed(1)} unit="rps" />
              </div>
              <div className="mt-3 grid gap-2">
                <SpinTable title="打球直後の回転" spin={contact.hit ? contact.spin : null} />
                <SpinTable title="相手コートでバウンドした後" spin={result.spinAtOpponent} />
              </div>
              {(result.verdict === "short" || result.verdict === "long") && (
                <ProComparison kind={result.verdict} spin={contact.spin.total} />
              )}
              {insights.length > 0 && (
                <ul className="mt-3 space-y-2 rounded-xl bg-tt-offwhite p-3 text-sm leading-6">
                  {insights.map((t) => (
                    <li key={t}>・{t}</li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => setGhost(result)}>
                  この軌道を比較用に残す
                </Button>
                {ghost && (
                  <Button variant="ghost" size="sm" onClick={() => setGhost(null)}>
                    比較を消す
                  </Button>
                )}
              </div>
            </section>

            <JointPanel params={params} result={result} onChange={updateJoint} />

            {GROUPS.map((g) => (
              <fieldset key={g.title} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <legend className="px-1 text-sm font-bold">{g.title}</legend>
                <div className="space-y-3">
                  {g.sliders.map((s) => (
                    <Slider key={s.key} def={s} value={params[s.key] as number} onChange={(val) => update({ [s.key]: val })} />
                  ))}
                </div>
              </fieldset>
            ))}

            <div className="grid gap-4 sm:grid-cols-2">
              <ContactDial result={result} />
              <BladeHitPicker params={params} onChange={(hitAlong, hitAcross) => update({ hitAlong, hitAcross })} />
            </div>

            {contact.impact && (
              <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <ImpactPanel impact={contact.impact} racketOmega={norm(result.racket.omega)} />
              </section>
            )}
          </>
        )}

        <ModelBasis />
      </div>
    </div>
  );
}

/** サーブの横の曲がり: 打球直後の向きから、相手コートの1・2バウンド目がどれだけ横にずれたか (cm)。 */
function lateralCurve(r: SimResult): { first: number | null; second: number | null } {
  const pts = r.points.filter((p) => p.t > r.contactTime);
  if (pts.length < 3) return { first: null, second: null };
  const p0 = pts[0].p;
  const p1 = (pts.find((p) => p.t > pts[0].t + 0.02) ?? pts[1]).p;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const L = Math.hypot(dx, dy) || 1;
  const lat = (p: { x: number; y: number }) => Math.abs(((p.x - p0.x) * -dy + (p.y - p0.y) * dx) / L) * 100;
  const opp = r.events.filter((e) => e.kind === "bounce" && e.p.x > TABLE.netX);
  return { first: opp[0] ? lat(opp[0].p) : null, second: opp[1] ? lat(opp[1].p) : null };
}

function HudStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-tt-charcoal px-2 py-1.5">
      <p className="text-[10px] leading-3 text-white/60">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-bold tabular-nums">{value}</p>
    </div>
  );
}

/**
 * 関節ごとに「打球の瞬間の角度」と「スイングの振り幅」を調整する。
 * 横棒は可動域（AAOS）で、赤い帯がスイング中に使う範囲、白い線が打球の瞬間。
 */
function JointPanel({
  params,
  result,
  onChange,
}: {
  params: ServeParams;
  result: SimResult;
  onChange: (group: "contact" | "sweep", key: JointKey, value: number) => void;
}) {
  const speeds = result.racket.jointSpeeds;
  return (
    <fieldset className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <legend className="px-1 text-sm font-bold">体と腕（右利き）</legend>
      <p className="text-xs leading-5 text-tt-gray70">
        各関節の「打球の瞬間の角度」と「スイングで動かす幅」。関節は人の可動域（AAOS）の中でしか動きません。
        帯は可動域、赤がスイング中に使う範囲、白線が打球の瞬間です。
      </p>
      <div className="mt-3 space-y-4">
        {JOINTS.map((j) => {
          const [lo, hi] = j.rom;
          const c = params.contact[j.key];
          const sw = params.sweep[j.key];
          const used = [jointsAt(params, -0.12).q[j.key], jointsAt(params, 0.12).q[j.key]];
          const a = Math.min(...used);
          const b = Math.max(...used);
          const pct = (x: number) => ((x - lo) / (hi - lo)) * 100;
          const clamped = result.racket.clampedJoints.includes(j.key);
          return (
            <div key={j.key}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-bold">
                  {j.label}
                  <span className="ml-1 text-[10px] font-normal text-tt-gray70">可動域 {lo}〜{hi}°（{j.source}）</span>
                </span>
                <span className="font-mono text-xs tabular-nums text-tt-gray70">{Math.round(speeds[j.key])}°/s</span>
              </div>
              <div className="relative mt-1 h-2 rounded-full bg-tt-offwhite ring-1 ring-tt-gray30/50">
                <div
                  className={`absolute inset-y-0 rounded-full ${clamped ? "bg-tt-green" : "bg-tt-green/60"}`}
                  style={{ left: `${pct(a)}%`, width: `${Math.max(1, pct(b) - pct(a))}%` }}
                />
                <div className="absolute inset-y-[-3px] w-0.5 bg-tt-charcoal" style={{ left: `${pct(c)}%` }} />
              </div>
              <div className="mt-1 grid grid-cols-2 gap-3">
                <label className="text-[11px] text-tt-gray70">
                  打球の瞬間 <span className="font-mono text-tt-charcoal">{c}°</span>
                  <input
                    type="range"
                    min={lo}
                    max={hi}
                    step={1}
                    value={c}
                    onChange={(e) => onChange("contact", j.key, Number(e.target.value))}
                    className="block h-7 w-full accent-[var(--color-gs-red)]"
                  />
                </label>
                <label className="text-[11px] text-tt-gray70">
                  振り幅 <span className="font-mono text-tt-charcoal">{sw > 0 ? `+${sw}` : sw}°</span>
                  <input
                    type="range"
                    min={-120}
                    max={120}
                    step={1}
                    value={sw}
                    onChange={(e) => onChange("sweep", j.key, Number(e.target.value))}
                    className="block h-7 w-full accent-[var(--color-gs-blue)]"
                  />
                </label>
              </div>
              <p className="text-[11px] leading-4 text-tt-gray70">{j.hint}</p>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

function signed(n: number, digits: number) {
  const s = n.toFixed(digits);
  return n > 0 && s !== (0).toFixed(digits) ? `+${s}` : s;
}

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-xl bg-tt-offwhite p-3">
      <p className="text-xs text-tt-gray70">{label}</p>
      <p className="mt-1 font-mono text-xl font-bold tabular-nums">
        {value}
        <span className="ml-1 text-xs font-normal text-tt-gray70">{unit}</span>
      </p>
    </div>
  );
}

function SpinTable({ title, spin }: { title: string; spin: SpinBreakdown | null }) {
  return (
    <div className="rounded-xl ring-1 ring-tt-gray30/50">
      <p className="border-b border-tt-gray30/40 px-3 py-2 text-xs font-bold">
        {title}
        {spin && <span className="ml-2 text-tt-coral">{spin.label}</span>}
      </p>
      {spin ? (
        <dl className="grid grid-cols-3 px-3 py-2 text-center">
          <SpinCell label="上(+)/下(−)" value={spin.topBack} />
          <SpinCell label="横 ＋左/−右" value={spin.side} />
          <SpinCell label="ジャイロ" value={spin.gyro} />
        </dl>
      ) : (
        <p className="px-3 py-3 text-xs text-tt-gray70">相手コートに届いていません</p>
      )}
    </div>
  );
}

function SpinCell({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[11px] text-tt-gray70">{label}</dt>
      <dd className="font-mono text-base font-bold tabular-nums">{signed(value, 1)}</dd>
    </div>
  );
}

function Slider({ def, value, onChange }: { def: SliderDef; value: number; onChange: (v: number) => void }) {
  const shown = def.display ? Math.round(value * def.display) : Number.isInteger(def.step) ? value : value.toFixed(1);
  const id = `slider-${def.key}`;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-bold">
          {def.label}
        </label>
        <span className="font-mono text-sm tabular-nums">
          {shown}
          {def.unit}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={def.min}
        max={def.max}
        step={def.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 h-8 w-full accent-[var(--color-gs-red)]"
      />
      <p className="text-xs text-tt-gray70">{def.hint}</p>
    </div>
  );
}

/**
 * 「ボールのどこを打つか」— 自分から見たボールの裏側と、ラケットが当たる位置・こする方向。
 * 当たる位置は面の法線の逆側、矢印はスイングの面に沿った成分（＝こする向き）。
 */
function ContactDial({ result }: { result: SimResult }) {
  const R = 70;
  const c = 90;
  const n = faceNormal(result);
  const sw = swingDirection(result);
  // 自分から見て: 画面右 = −y、画面上 = +z
  const px = c + n.y * R;
  const py = c + n.z * R;
  const behind = n.x > 0;
  const along = sw.x * n.x + sw.y * n.y + sw.z * n.z;
  const t = { y: sw.y - along * n.y, z: sw.z - along * n.z };
  const tl = Math.hypot(t.y, t.z);
  const arrowLen = 40;
  const ax = tl > 0.05 ? px + (-t.y / tl) * arrowLen : px;
  const ay = tl > 0.05 ? py - (t.z / tl) * arrowLen : py;
  const fromBottom = Math.round((Math.acos(Math.max(-1, Math.min(1, n.z))) * 180) / Math.PI);

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <p className="text-sm font-bold">ボールのどこを打つか</p>
      <svg viewBox="0 0 180 180" className="mx-auto mt-2 block w-40" role="img" aria-label="ボール上の接触位置">
        <defs>
          <marker id="dial-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--color-gs-blue)" />
          </marker>
        </defs>
        <circle cx={c} cy={c} r={R} fill="#fafafa" stroke="#b9b9bd" strokeWidth={2} />
        <line x1={c - R} y1={c} x2={c + R} y2={c} stroke="#e1e1e4" />
        <line x1={c} y1={c - R} x2={c} y2={c + R} stroke="#e1e1e4" />
        <text x={c} y={14} textAnchor="middle" fontSize="10" fill="#57575a">上</text>
        <text x={c} y={176} textAnchor="middle" fontSize="10" fill="#57575a">下</text>
        <text x={8} y={c + 3} fontSize="10" fill="#57575a">左</text>
        <text x={164} y={c + 3} fontSize="10" fill="#57575a">右</text>
        {tl > 0.05 && behind && (
          <line x1={px} y1={py} x2={ax} y2={ay} stroke="var(--color-gs-blue)" strokeWidth={3} markerEnd="url(#dial-arrow)" />
        )}
        <circle
          cx={px}
          cy={py}
          r={8}
          fill={behind ? "var(--color-gs-red)" : "none"}
          stroke="var(--color-gs-red)"
          strokeWidth={2}
        />
      </svg>
      <p className="mt-2 text-xs leading-5 text-tt-gray70">
        自分から見たボールの裏側。<span className="font-bold text-tt-green">赤</span>
        が当たる位置（真下から{fromBottom}°）、<span className="font-bold text-tt-coral">青</span>
        の矢印がこする向き。中心から離れた位置を長くこするほど回転が増えます。
      </p>
    </div>
  );
}

/** プロの試合の実測（Tリーグ）と、いまのサーブの回転数を並べる。 */
function ProComparison({ kind, spin }: { kind: "short" | "long"; spin: number }) {
  const ref = PRO_SERVE_SPIN[kind];
  const max = 70;
  const pct = (x: number) => `${Math.min(100, (x / max) * 100)}%`;
  return (
    <div className="mt-4 rounded-xl ring-1 ring-tt-gray30/50 p-3">
      <p className="text-xs font-bold">
        プロの試合との比較（{kind === "short" ? "ショート" : "ロング"}サーブの回転数）
      </p>
      <div className="relative mt-6 h-3 rounded-full bg-tt-offwhite">
        <div className="absolute inset-y-0 left-0 rounded-full bg-tt-green/80" style={{ width: pct(spin) }} />
        {[
          { label: "女子", v: ref.women },
          { label: "男子", v: ref.men },
        ].map((m) => (
          <div key={m.label} className="absolute -top-5 -translate-x-1/2 text-center" style={{ left: pct(m.v) }}>
            <span className="block text-[10px] leading-none text-tt-gray70">
              {m.label} {m.v}
            </span>
            <span className="mx-auto mt-0.5 block h-6 w-px bg-tt-charcoal" />
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs leading-5 text-tt-gray70">
        このサーブは <span className="font-mono font-bold text-tt-charcoal">{spin.toFixed(1)}rps</span>。
        縦線はTリーグの試合で実測されたサーブの回転数の中央値（Tamaki & Yoshida, 2025）。
      </p>
    </div>
  );
}

/** 物理モデルの根拠。どこが論文の値で、どこが推定かを隠さず見せる。 */
function ModelBasis() {
  return (
    <details className="rounded-2xl bg-white p-4 text-sm shadow-sm ring-1 ring-black/5">
      <summary className="cursor-pointer font-bold">物理モデルの根拠（どこまで現実に近いか）</summary>
      <p className="mt-3 text-xs leading-6 text-tt-gray70">
        飛び方と台でのバウンドは、トップ選手と試合をした卓球ロボットの研究で使われた物理モデルに合わせています。
        ラバーごとの数値は公開データがないため推定です。
      </p>
      <ul className="mt-3 space-y-2">
        {MODEL_SOURCES.map((m) => (
          <li key={m.part} className="rounded-lg bg-tt-offwhite p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{m.part}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  m.status === "sourced" ? "bg-tt-soft-coral text-tt-deep-coral" : "bg-tt-soft-green text-tt-green"
                }`}
              >
                {m.status === "sourced" ? "論文・規格の値" : "推定"}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5">{m.detail}</p>
            <p className="mt-1 text-[11px] leading-5 text-tt-gray70">出典: {m.source}</p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs leading-6 text-tt-gray70">
        まだ入っていないもの: ボールがスポンジに沈み込んで生まれる「食い込み」（摩擦以上のひっかかり）、ブレードのしなり、ボールの変形。
      </p>
    </details>
  );
}

/**
 * インパクトの約1ミリ秒を分解して見せる。回転の立ち上がりと押す力を、時間軸をそろえた2つの小さなグラフで。
 * 灰色の帯はラバーの上で滑っている時間（摩擦の上限に達している）。
 */
function ImpactPanel({ impact, racketOmega }: { impact: ContactResult; racketOmega: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const trace = impact.trace;
  if (trace.length < 2) return null;
  const tMax = trace[trace.length - 1].tMs;
  const W = 320;
  const H = 76;
  const PAD_L = 4;
  const PAD_R = 4;
  const x = (t: number) => PAD_L + ((W - PAD_L - PAD_R) * t) / tMax;
  const spinMax = Math.max(1, ...trace.map((s) => s.spinRps));
  const forceMax = Math.max(0.1, ...trace.map((s) => s.normalForce));
  const line = (get: (s: (typeof trace)[number]) => number, max: number) =>
    trace.map((s, i) => `${i === 0 ? "M" : "L"}${x(s.tMs).toFixed(1)},${(H - 4 - ((H - 12) * get(s)) / max).toFixed(1)}`).join(" ");
  // 滑っている区間を帯にまとめる
  const bands: [number, number][] = [];
  trace.forEach((s, i) => {
    const next = trace[i + 1]?.tMs ?? s.tMs;
    if (!s.slipping) return;
    const last = bands[bands.length - 1];
    if (last && Math.abs(last[1] - s.tMs) < 1e-9) last[1] = next;
    else bands.push([s.tMs, next]);
  });
  const hs = hover === null ? null : trace[hover];
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const t = ((e.clientX - rect.left) / rect.width) * (W / (W - PAD_L - PAD_R)) * tMax;
    let best = 0;
    trace.forEach((s, i) => {
      if (Math.abs(s.tMs - t) < Math.abs(trace[best].tMs - t)) best = i;
    });
    setHover(best);
  };
  const chart = (title: string, unit: string, get: (s: (typeof trace)[number]) => number, max: number, color: string) => (
    <div>
      <div className="flex items-baseline justify-between text-[11px] text-tt-gray70">
        <span className="font-bold text-tt-charcoal">{title}</span>
        <span className="font-mono tabular-nums">
          最大 {max.toFixed(max < 10 ? 1 : 0)}
          {unit}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-1 block h-auto w-full touch-none"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`${title}の時間変化`}
      >
        {bands.map(([a, b]) => (
          <rect key={a} x={x(a)} y={0} width={Math.max(1, x(b) - x(a))} height={H} fill="#e9e9ec" />
        ))}
        <line x1={0} y1={H - 4} x2={W} y2={H - 4} stroke="#b9b9bd" strokeWidth={1} />
        <path d={line(get, max)} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {hs && <line x1={x(hs.tMs)} y1={0} x2={x(hs.tMs)} y2={H} stroke="#57575a" strokeWidth={1} strokeDasharray="2 2" />}
      </svg>
    </div>
  );

  return (
    <div className="mt-4 rounded-xl p-3 ring-1 ring-tt-gray30/50">
      <p className="text-xs font-bold">インパクトの1ミリ秒（ボールがラバーに触れている間）</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <MiniStat label="接触時間" value={(impact.duration * 1000).toFixed(2)} unit="ms" />
        <MiniStat label="ラバー上を転がった距離" value={(impact.travelOnRubber * 1000).toFixed(1)} unit="mm" />
        <MiniStat label="滑っていた時間の割合" value={Math.round(impact.slipFraction * 100).toString()} unit="%" />
        <MiniStat
          label="回転の上乗せ（転がり比）"
          value={impact.overspinRatio > 0 ? impact.overspinRatio.toFixed(2) : "—"}
          unit={impact.overspinRatio > 0 ? "倍" : ""}
        />
        <MiniStat label="打球点の速さ" value={impact.hitPointSpeed.toFixed(1)} unit="m/s" />
        <MiniStat label="ラケットの回転の速さ" value={Math.round((racketOmega * 180) / Math.PI).toString()} unit="°/s" />
      </div>
      <div className="mt-3 space-y-2">
        {chart("回転数の立ち上がり", "rps", (s) => s.spinRps, spinMax, "var(--color-gs-red)")}
        {chart("ボールを押す力", "N", (s) => s.normalForce, forceMax, "var(--color-gs-blue)")}
        <div className="flex justify-between font-mono text-[10px] text-tt-gray70 tabular-nums">
          <span>0ms</span>
          <span>{(tMax / 2).toFixed(2)}ms</span>
          <span>{tMax.toFixed(2)}ms</span>
        </div>
      </div>
      <p className="mt-2 min-h-5 font-mono text-xs tabular-nums text-tt-charcoal">
        {hs
          ? `${hs.tMs.toFixed(2)}ms: 回転 ${hs.spinRps.toFixed(1)}rps / 押す力 ${hs.normalForce.toFixed(1)}N / ${hs.slipping ? "滑っている" : "食いついている"}`
          : "グラフをなぞると、その瞬間の値を表示します"}
      </p>
      <p className="mt-1 text-xs leading-5 text-tt-gray70">
        灰色の帯はラバーの上で滑っている時間。「回転の上乗せ」が1倍を超えるのは、横にたわんだラバーが戻るときにボールを余分に回すためです（1倍＝ちょうど転がり）。
      </p>
    </div>
  );
}

function MiniStat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-lg bg-tt-offwhite px-2.5 py-2">
      <p className="text-[11px] leading-4 text-tt-gray70">{label}</p>
      <p className="mt-0.5 font-mono text-base font-bold tabular-nums">
        {value}
        <span className="ml-1 text-[11px] font-normal text-tt-gray70">{unit}</span>
      </p>
    </div>
  );
}

/** ブレードの正面図。クリック（タップ）した位置に打球点を動かす。 */
function BladeHitPicker({
  params,
  onChange,
}: {
  params: ServeParams;
  onChange: (hitAlong: number, hitAcross: number) => void;
}) {
  const S = 700; // m → px
  const cx = 90;
  const cy = 78;
  const rx = BLADE.halfWidth * S;
  const ry = BLADE.halfLength * S;
  const px = cx + params.hitAcross * S;
  const py = cy - params.hitAlong * S;
  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * 180;
    const sy = ((e.clientY - rect.top) / rect.height) * 200;
    const across = (sx - cx) / S;
    const along = (cy - sy) / S;
    // ブレードの内側（ボール半径ぶん内側）に収める
    const k = Math.hypot(across / (BLADE.halfWidth - 0.015), along / (BLADE.halfLength - 0.015));
    const f = k > 1 ? 1 / k : 1;
    onChange(Math.round((along * f) / 0.005) * 0.005, Math.round((across * f) / 0.005) * 0.005);
  };
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <p className="text-sm font-bold">ラケットのどこに当てるか</p>
      <svg
        viewBox="0 0 180 200"
        className="mx-auto mt-2 block w-36 cursor-crosshair touch-none"
        onPointerDown={pick}
        role="img"
        aria-label="ブレード上の打球位置"
      >
        <rect x={cx - 9} y={cy + ry - 6} width={18} height={70} rx={4} fill="#c9a36b" stroke="#6b5230" />
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="var(--color-gs-red)" stroke="#a00c1d" strokeWidth={2} />
        <line x1={cx} y1={cy - ry} x2={cx} y2={cy + ry} stroke="#fff" strokeOpacity={0.35} />
        <line x1={cx - rx} y1={cy} x2={cx + rx} y2={cy} stroke="#fff" strokeOpacity={0.35} />
        <circle cx={px} cy={py} r={BALL_R_PX} fill="#fff" stroke="#0e0e10" strokeWidth={1.5} />
        <text x={cx} y={12} textAnchor="middle" fontSize="10" fill="#57575a">先端</text>
      </svg>
      <p className="mt-1 text-xs leading-5 text-tt-gray70">
        タップした位置にボールが当たります。先端寄りほど、手首の回転でラバーが速く動き、回転がかかりやすくなります。
      </p>
    </div>
  );
}

const BALL_R_PX = 0.02 * 700;
