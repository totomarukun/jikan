"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CAMERAS, ServeViewport, type CameraId } from "@/components/serve-viewport";
import {
  DEFAULT_PARAMS,
  MODEL_SOURCES,
  PRESETS,
  PRO_SERVE_SPIN,
  RUBBERS,
  faceNormal,
  serveInsights,
  simulateServe,
  swingDirection,
  type RubberType,
  type ServeParams,
  type SimResult,
  type SpinBreakdown,
} from "@/lib/serve-sim";

const SPEEDS = [0.1, 0.25, 0.5, 1] as const;

type SliderDef = {
  key: Exclude<keyof ServeParams, "rubber">;
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
    title: "ラケット面の角度",
    sliders: [
      { key: "faceTilt", label: "上下の角度", min: -80, max: 89, step: 1, unit: "°", hint: "0°=垂直、＋で上向きに開く、−で下向きにかぶせる" },
      { key: "faceYaw", label: "左右の向き", min: -60, max: 60, step: 1, unit: "°", hint: "＋で左を向く、−で右を向く（自分から見て）" },
    ],
  },
  {
    title: "スイング",
    sliders: [
      { key: "swingSpeed", label: "速さ", min: 0.5, max: 16, step: 0.1, unit: "m/s", hint: "打った瞬間のラケットの速さ" },
      { key: "swingPitch", label: "上下の方向", min: -60, max: 60, step: 1, unit: "°", hint: "＋でこすり上げ、−で切り下ろし" },
      { key: "swingYaw", label: "左右の方向", min: -70, max: 70, step: 1, unit: "°", hint: "＋で左へ、−で右へ振る" },
    ],
  },
  {
    title: "トスと打点",
    sliders: [
      { key: "tossHeight", label: "トスの高さ", min: 0.1, max: 1.5, step: 0.01, unit: "cm", display: 100, hint: "手のひら（台面の高さ）から。16cm以上がルール" },
      { key: "contactHeight", label: "打点の高さ", min: 0.02, max: 0.5, step: 0.01, unit: "cm", display: 100, hint: "台面からの高さ。低いほど低く出しやすい" },
      { key: "contactBehind", label: "打点の前後", min: 0, max: 0.6, step: 0.01, unit: "cm", display: 100, hint: "エンドラインの後ろへの距離" },
      { key: "contactSide", label: "打点の左右", min: -0.7, max: 0.7, step: 0.01, unit: "cm", display: 100, hint: "台の中心線から。＋が左（バック側）" },
    ],
  },
];

export function ServeLab() {
  const [params, setParams] = useState<ServeParams>(DEFAULT_PARAMS);
  const [ghost, setGhost] = useState<SimResult | null>(null);
  const [camera, setCamera] = useState<CameraId>("overview");
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(0.25);
  const [playing, setPlaying] = useState(true);
  const [loop, setLoop] = useState(true);
  const [time, setTime] = useState(0);
  const [activePreset, setActivePreset] = useState<string | null>(PRESETS[0].id);

  const result = useMemo(() => simulateServe(params), [params]);
  const insights = useMemo(() => serveInsights(result), [result]);
  const endTime = result.points[result.points.length - 1]?.t ?? 1;

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

  const update = (patch: Partial<ServeParams>) => {
    setParams((p) => ({ ...p, ...patch }));
    setActivePreset(null);
    setTime(0);
    setPlaying(true);
  };

  const { contact } = result;
  const phase =
    time < result.contactTime ? "トス" : result.events.find((e) => e.kind === "bounce" && e.t <= time) ? "バウンド後" : "打球直後";

  return (
    <div className="space-y-5">
      {/* プリセット */}
      <div className="flex flex-wrap gap-2">
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
            className={`min-h-11 rounded-full px-4 text-sm font-bold transition ${
              activePreset === p.id
                ? "bg-tt-charcoal text-white"
                : "bg-white text-tt-charcoal ring-1 ring-tt-gray30/60 hover:bg-tt-offwhite"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* ビューポート */}
      <div className="overflow-hidden rounded-2xl bg-tt-charcoal shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-3 text-white">
          <div>
            <p className="font-mono text-xl font-bold leading-none sm:text-2xl">
              {(contact.ballSpeed * 3.6).toFixed(1)}
              <span className="ml-1 text-xs font-normal">km/h</span>
              <span className="ml-3">{signed(contact.spin.topBack, 0)}</span>
              <span className="ml-1 text-xs font-normal">rps</span>
            </p>
            <p className="mt-1 text-xs text-white/80">
              サーブ（{contact.hit ? contact.spin.label : "—"}）・{phase}
            </p>
          </div>
          <div className="flex gap-1">
            {CAMERAS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCamera(c.id)}
                aria-pressed={camera === c.id}
                className={`min-h-9 rounded-md px-2.5 text-xs font-bold ${
                  camera === c.id ? "bg-white text-tt-charcoal" : "bg-white/15 text-white hover:bg-white/25"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <ServeViewport result={result} ghost={ghost} time={time} camera={camera} />

        {/* 再生コントロール */}
        <div className="flex flex-wrap items-center gap-3 border-t border-white/10 px-3 py-2 text-white">
          <button
            type="button"
            onClick={() => {
              if (!playing && time >= endTime) setTime(0);
              setPlaying((p) => !p);
            }}
            className="min-h-9 rounded-md bg-white/15 px-3 text-xs font-bold hover:bg-white/25"
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
            className="min-w-32 flex-1 accent-[var(--color-gs-red)]"
          />
          <span className="font-mono text-xs tabular-nums">t={Math.max(0, time - result.contactTime).toFixed(3)}s</span>
        </div>
      </div>

      {/* 判定と数値 */}
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 sm:p-5">
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

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="球速（打球直後）" value={(contact.ballSpeed * 3.6).toFixed(1)} unit="km/h" />
          <Metric label="総回転数" value={contact.spin.total.toFixed(1)} unit="rps" />
          <Metric label="打ち出し角" value={contact.launchAngle.toFixed(0)} unit="°" />
          <Metric
            label="ネット上の余裕"
            value={result.netClearance === null ? "—" : (result.netClearance * 100).toFixed(1)}
            unit={result.netClearance === null ? "" : "cm"}
          />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <SpinTable title="打球直後の回転" spin={contact.hit ? contact.spin : null} />
          <SpinTable title="相手コートでバウンドした後" spin={result.spinAtOpponent} />
        </div>

        {(result.verdict === "short" || result.verdict === "long") && (
          <ProComparison kind={result.verdict} spin={contact.spin.total} />
        )}

        {insights.length > 0 && (
          <ul className="mt-4 space-y-2 rounded-xl bg-tt-offwhite p-3 text-sm leading-6">
            {insights.map((t) => (
              <li key={t}>・{t}</li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setGhost(result)}>
            この軌道を比較用に残す
          </Button>
          {ghost && (
            <Button variant="ghost" size="sm" onClick={() => setGhost(null)}>
              比較を消す
            </Button>
          )}
        </div>
        {ghost && (
          <p className="mt-2 text-xs text-tt-gray70">
            灰色の点線が比較用の軌道（{ghost.contact.spin.label}・{(ghost.contact.ballSpeed * 3.6).toFixed(1)}km/h・
            {ghost.contact.spin.total.toFixed(1)}rps）
          </p>
        )}
      </section>

      {/* 入力 */}
      <section className="grid gap-4 sm:grid-cols-[1fr_200px]">
        <div className="space-y-4">
          {GROUPS.map((g) => (
            <fieldset key={g.title} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <legend className="px-1 text-sm font-bold">{g.title}</legend>
              <div className="space-y-3">
                {g.sliders.map((s) => (
                  <Slider key={s.key} def={s} value={params[s.key]} onChange={(val) => update({ [s.key]: val })} />
                ))}
              </div>
            </fieldset>
          ))}
          <fieldset className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <legend className="px-1 text-sm font-bold">ラバー（面の性質）</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(RUBBERS) as RubberType[]).map((k) => (
                <label
                  key={k}
                  className={`flex min-h-11 cursor-pointer flex-col justify-center rounded-lg px-3 py-2 text-sm ring-1 ${
                    params.rubber === k ? "bg-tt-soft-coral ring-tt-coral" : "ring-tt-gray30/60 hover:bg-tt-offwhite"
                  }`}
                >
                  <span className="flex items-center gap-2 font-bold">
                    <input
                      type="radio"
                      name="rubber"
                      checked={params.rubber === k}
                      onChange={() => update({ rubber: k })}
                    />
                    {RUBBERS[k].label}
                  </span>
                  <span className="ml-6 text-xs text-tt-gray70">{RUBBERS[k].note}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="space-y-4">
          <ContactDial params={params} />
        </div>
      </section>

      <ModelBasis />
    </div>
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
function ContactDial({ params }: { params: ServeParams }) {
  const R = 70;
  const c = 90;
  const n = faceNormal(params);
  const sw = swingDirection(params);
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
        まだ入っていないもの: ラケットの材質の影響（しなり）、ボールの変形、打球の「球持ち」（接触時間）。
      </p>
    </details>
  );
}
