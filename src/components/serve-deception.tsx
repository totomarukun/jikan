"use client";

import { Fragment, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChangeList, LimitSlider, SpinCard } from "@/components/serve-disguise";
import { Chips, OUTCOME_STYLE } from "@/components/serve-receive";
import { SERVE_TYPES } from "@/lib/arm";
import { TECHNIQUES, type ReceiveOutcome, type ReceiveTiming } from "@/lib/receive";
import {
  DEFAULT_LIMITS,
  HIDDEN_WINDOW_S,
  VISIBLE_WINDOW_S,
  compareDeception,
  searchMostDeceptive,
  type DeceptionCandidate,
  type DisguiseLimits,
} from "@/lib/serve-search";
import { PRESETS } from "@/lib/serve-sim";
import type { BallState } from "@/lib/flight";
import { norm } from "@/lib/vec3";

export type DeceptionRun = { timing: ReceiveTiming; limits: DisguiseLimits; length: "short" | "long"; list: DeceptionCandidate[] };

type SortKey = "misread" | "look" | "spin";
const SORTS: { id: SortKey; label: string }[] = [
  { id: "misread", label: "読み違えで崩れる順" },
  { id: "look", label: "見た目が近い順" },
  { id: "spin", label: "回転の差が大きい順" },
];
const SORT_FNS: Record<SortKey, (x: DeceptionCandidate, y: DeceptionCandidate) => number> = {
  misread: compareDeception,
  look: (x, y) => x.disguise.visible.meanCm - y.disguise.visible.meanCm,
  spin: (x, y) => y.spinGap - x.spinGap,
};

const typeLabel = (id: string) => SERVE_TYPES.find((t) => t.id === id)?.label ?? id;

/**
 * 見誤り探索: サーブの種類ごとに「見た目がほぼ同じで、相手の打球点での回転がいちばん違う 2 本（A・B）」を
 * 基本のフォームごと探し、読み違えでレシーブが崩れる割合の順に並べる。
 */
export function DeceptionPanel({
  timing,
  run: last,
  onRun,
  selected,
  onSelect,
}: {
  timing: ReceiveTiming;
  run: DeceptionRun | null;
  onRun: (r: DeceptionRun | null) => void;
  selected: DeceptionCandidate | null;
  onSelect: (c: DeceptionCandidate) => void;
}) {
  const [limits, setLimits] = useState<DisguiseLimits>(last?.limits ?? DEFAULT_LIMITS);
  const [length, setLength] = useState<"short" | "long">(last?.length ?? "short");
  const [progress, setProgress] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const cancel = useRef(false);

  const start = async () => {
    cancel.current = false;
    setFailed(false);
    onRun(null);
    setProgress(0);
    const list = await searchMostDeceptive(timing, limits, {
      length,
      onProgress: setProgress,
      isCancelled: () => cancel.current,
    });
    setProgress(null);
    if (!list) return;
    if (list.length === 0) {
      setFailed(true);
      return;
    }
    onRun({ timing, limits, length, list });
    onSelect(list[0]);
  };

  const [sort, setSort] = useState<SortKey>("misread");
  const sorted = last ? [...last.list].sort(SORT_FNS[sort]) : [];
  const missing = last ? SERVE_TYPES.filter((t) => !last.list.some((c) => c.serveType === t.id)) : [];

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6">
        相手から見て<strong>ほぼ同じフォーム</strong>なのに、相手のラケットに当たる瞬間の回転が<strong>いちばん違う 2 本（A・B）</strong>を、
        5種類のサーブそれぞれで基本のフォームごと探します。そのうえで相手が片方だと思ってもう片方を受けたとき、
        <strong>正しく読めば入るレシーブが崩れるか</strong>を計算して並べます。
      </p>

      <div className="space-y-3 rounded-xl p-4 ring-1 ring-tt-gray30/50">
        <div>
          <p className="text-xs font-bold text-tt-gray70">長さ</p>
          <Chips
            items={[
              { id: "short", label: "ショート" },
              { id: "long", label: "ロング" },
            ]}
            value={length}
            onChange={setLength}
          />
        </div>
        <LimitSlider
          id="dec-cm"
          label="見た目の差の上限（ラケット・腕の位置のずれ）"
          value={limits.visibleCm}
          min={0.5}
          max={5}
          step={0.5}
          unit="cm"
          onChange={(v) => setLimits({ ...limits, visibleCm: v })}
        />
        <LimitSlider
          id="dec-deg"
          label="見た目の差の上限（面の向きのずれ）"
          value={limits.visibleDeg}
          min={1}
          max={15}
          step={1}
          unit="°"
          onChange={(v) => setLimits({ ...limits, visibleDeg: v })}
        />
        <LimitSlider
          id="dec-land"
          label="軌道の差の上限（着地点のずれ）"
          value={limits.landingCm}
          min={5}
          max={60}
          step={5}
          unit="cm"
          onChange={(v) => setLimits({ ...limits, landingCm: v })}
        />
        <LimitSlider
          id="dec-net"
          label="軌道の差の上限（ネット上の高さの差）"
          value={limits.netCm}
          min={1}
          max={20}
          step={1}
          unit="cm"
          onChange={(v) => setLimits({ ...limits, netCm: v })}
        />
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" onClick={start} disabled={progress !== null}>
            {progress === null ? "見誤りを生みやすいフォームを探す" : `探しています ${Math.round(progress * 100)}%`}
          </Button>
          {progress !== null && (
            <Button size="sm" variant="ghost" onClick={() => (cancel.current = true)}>
              やめる
            </Button>
          )}
        </div>
        <p className="text-xs leading-5 text-tt-gray70">
          5種類ぶん計算するので 30〜60 秒ほどかかります。「見た目の差」は打球の前後 ±{VISIBLE_WINDOW_S * 1000}ms のラケットと腕（肘・手首）の動きの差で、
          打球の前後 ±{HIDDEN_WINDOW_S * 1000}ms は相手が見分けにくいと仮定して除いています（実験で決めた値ではありません）。
        </p>
      </div>

      {failed && (
        <p className="rounded-xl bg-tt-soft-green p-3 text-sm">条件を満たす組が見つかりませんでした。上限をゆるめるか、長さを変えてみてください。</p>
      )}

      {last && (
        <div className="space-y-2">
          <p className="text-xs font-bold">
            サーブの種類ごとの結果（相手が打つタイミング: {last.timing === "apex" ? "頂点" : last.timing === "rising" ? "早め" : "遅め"}）
          </p>
          <Chips items={SORTS} value={sort} onChange={setSort} />
          <table className="w-full border-separate border-spacing-y-1 text-xs">
            <thead>
              <tr className="text-left text-tt-gray70">
                <th className="font-normal">サーブ</th>
                <th className="text-right font-normal">見た目の差</th>
                <th className="text-right font-normal">回転の差</th>
                <th className="text-right font-normal">読み違えで崩れる</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c, i) => {
                const active = selected === c;
                const cell = active ? "bg-tt-charcoal text-white" : "bg-white hover:bg-tt-offwhite";
                return (
                  <tr key={c.serveType} onClick={() => onSelect(c)} aria-selected={active} className="cursor-pointer">
                    <td className={`rounded-l-lg py-2 pl-2 ${cell}`}>
                      <button type="button" className="text-left text-sm font-bold">
                        {i + 1}. {typeLabel(c.serveType)}
                      </button>
                    </td>
                    <td className={`py-2 text-right font-mono tabular-nums ${cell}`}>
                      {c.disguise.visible.meanCm.toFixed(1)}cm・{c.disguise.visible.faceDeg.toFixed(0)}°
                    </td>
                    <td className={`py-2 text-right font-mono tabular-nums ${cell}`}>{c.spinGap.toFixed(1)}rps</td>
                    <td className={`rounded-r-lg py-2 pr-2 text-right font-mono font-bold tabular-nums ${cell}`}>
                      {c.misreadFailures}/{c.misreadChances}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {missing.length > 0 && (
            <p className="text-xs text-tt-gray70">
              {missing.map((t) => t.label).join("・")}: この条件で入る組が見つかりませんでした。
            </p>
          )}
          <p className="text-xs leading-5 text-tt-gray70">
            どの組も「相手から見てほぼ同じ」（見た目の差が上限以内）になるように探しています。そのうえで
            「見た目の差」は小さいほど見分けにくく、「回転の差」は大きいほど読み違えたときのずれが大きく、
            「崩れる」は正しく読めば入るレシーブ（3技術 × A→B・B→A の2方向）のうち読み違えると入らなかった数です。
            探索は乱数を使うため、実行ごとに少し結果が変わります。
          </p>
        </div>
      )}

      {selected && last && <CandidateDetail c={selected} limits={last.limits} />}
    </div>
  );
}

const fmtTb = (x: number) => (Math.abs(x) < 1 ? "ほぼなし" : `${x > 0 ? "上" : "下"} ${Math.abs(x).toFixed(1)}`);
// サーバー基準の +（サーバーから見て左へ曲がる）は、受け手から見ると右へ曲がる
const fmtSd = (x: number) => (Math.abs(x) < 1 ? "ほぼなし" : `${x > 0 ? "右" : "左"}へ ${Math.abs(x).toFixed(1)}`);
const kmh = (s: BallState) => (norm(s.vel) * 3.6).toFixed(1);

/** なぜこの組が「読み違えを生む」のかを、見た目・回転・結果の3段で言葉にする。 */
function whyText(c: DeceptionCandidate, limits: DisguiseLimits) {
  const d = c.disguise;
  const look = `相手の目線で見たフォームの差は平均 ${d.visible.meanCm.toFixed(1)}cm・面 ${d.visible.faceDeg.toFixed(1)}°（上限 ${limits.visibleCm}cm・${limits.visibleDeg}°${d.withinLimits ? "の内側" : "を少し超える"}）。軌道も着地点 ${d.landingGapCm.toFixed(0)}cm・ネット上 ${d.netGapCm.toFixed(1)}cm の差しかない。`;
  const spin = `一方、相手のラケットに当たる瞬間の回転は 上下が ${fmtTb(d.spinA.topBack)} → ${fmtTb(d.spinB.topBack)}rps、横が ${fmtSd(d.spinA.side)} → ${fmtSd(d.spinB.side)}rps と違う（差 ${c.spinGap.toFixed(1)}rps）。`;
  const fails: string[] = [];
  for (const k of c.checks) {
    const t = TECHNIQUES[k.technique].label;
    if (k.bReadAsB === "in" && k.bReadAsA !== "in") fails.push(`B を A と読んで${t} → ${OUTCOME_STYLE[k.bReadAsA].short}`);
    if (k.aReadAsA === "in" && k.aReadAsB !== "in") fails.push(`A を B と読んで${t} → ${OUTCOME_STYLE[k.aReadAsB].short}`);
  }
  const result =
    fails.length > 0
      ? `その結果、正しく読めば返せるのに ${fails.join("、")}（${c.misreadFailures}/${c.misreadChances}）。`
      : "ただ、この程度の回転の差では、読み違えてもどのレシーブも入った（崩れない）。";
  return [look, spin, result];
}

function CandidateDetail({ c, limits }: { c: DeceptionCandidate; limits: DisguiseLimits }) {
  const preset = PRESETS.find((p) => p.params.serveType === c.serveType)!;
  const d = c.disguise;
  const rows: { group: string; label: string; a: string; b: string; diff: string }[] = [
    { group: "相手に見えるもの", label: "フォーム（ラケット・腕の位置）", a: "—", b: "—", diff: `平均 ${d.visible.meanCm.toFixed(1)}cm（最大 ${d.visible.maxCm.toFixed(1)}cm）` },
    { group: "", label: "ラケットの面の向き", a: "—", b: "—", diff: `平均 ${d.visible.faceDeg.toFixed(1)}°` },
    { group: "", label: "ボールの速さ（相手の打球点）", a: `${kmh(d.stateA)}km/h`, b: `${kmh(d.stateB)}km/h`, diff: `${Math.abs(norm(d.stateB.vel) - norm(d.stateA.vel)) * 3.6 < 0.05 ? "0" : (Math.abs(norm(d.stateB.vel) - norm(d.stateA.vel)) * 3.6).toFixed(1)}km/h` },
    {
      group: "",
      label: "ネットの上を通る高さ",
      a: `${((c.resultA.netClearance ?? 0) * 100).toFixed(1)}cm`,
      b: `${((d.result.netClearance ?? 0) * 100).toFixed(1)}cm`,
      diff: `${d.netGapCm.toFixed(1)}cm`,
    },
    { group: "", label: "相手コートの着地点", a: "—", b: "—", diff: `${d.landingGapCm.toFixed(0)}cm ずれ` },
    { group: "見えないもの（回転）", label: "上回転 / 下回転", a: fmtTb(d.spinA.topBack), b: fmtTb(d.spinB.topBack), diff: `${Math.abs(d.spinB.topBack - d.spinA.topBack).toFixed(1)}rps` },
    { group: "", label: "横回転（受け手から見て）", a: fmtSd(d.spinA.side), b: fmtSd(d.spinB.side), diff: `${Math.abs(d.spinB.side - d.spinA.side).toFixed(1)}rps` },
    { group: "", label: "回転の種類", a: d.spinA.label, b: d.spinB.label, diff: `${c.spinGap.toFixed(1)}rps` },
  ];
  return (
    <div className="space-y-4 rounded-xl p-4 ring-1 ring-tt-gray30/50">
      <p className="text-sm">
        <strong>{typeLabel(c.serveType)}</strong> の A と B を、左に<strong>相手の目線</strong>で並べています（打球の瞬間をそろえて同時に再生）。
      </p>

      <div className="rounded-lg bg-tt-offwhite p-3 text-sm leading-6">
        <p className="text-xs font-bold text-tt-gray70">なぜこの組が読み違えを生むか</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          {whyText(c, limits).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ol>
      </div>

      <div>
        <p className="text-xs font-bold">A と B の比較</p>
        <table className="mt-2 w-full border-separate border-spacing-y-0.5 text-xs">
          <thead>
            <tr className="text-left text-tt-gray70">
              <th className="font-normal">項目</th>
              <th className="font-normal">A</th>
              <th className="font-normal">B</th>
              <th className="text-right font-normal">差</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.label}>
                {r.group && (
                  <tr>
                    <th colSpan={4} className="pt-2 text-left text-[11px] font-bold text-tt-gray70">
                      {r.group}
                    </th>
                  </tr>
                )}
                <tr className="border-b border-tt-gray30/30">
                  <th className="py-1 pr-2 text-left font-normal">{r.label}</th>
                  <td className="py-1 pr-2 font-mono tabular-nums">{r.a}</td>
                  <td className="py-1 pr-2 font-mono tabular-nums">{r.b}</td>
                  <td className="py-1 text-right font-mono font-bold tabular-nums">{r.diff}</td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <p className="text-xs font-bold">読み違えたときのレシーブ</p>
        <table className="mt-2 w-full border-separate border-spacing-1 text-center text-xs">
          <thead>
            <tr className="text-tt-gray70">
              <th className="text-left font-normal">技術</th>
              <th className="font-normal">B を A と読む</th>
              <th className="font-normal">B を正しく</th>
              <th className="font-normal">A を B と読む</th>
              <th className="font-normal">A を正しく</th>
            </tr>
          </thead>
          <tbody>
            {c.checks.map((k) => (
              <tr key={k.technique}>
                <th className="text-left font-bold">{TECHNIQUES[k.technique].label}</th>
                <Cell o={k.bReadAsA} />
                <Cell o={k.bReadAsB} />
                <Cell o={k.aReadAsB} />
                <Cell o={k.aReadAsA} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SpinCard tag="A（見せるフォーム）" spin={d.spinA} />
        <SpinCard tag="B（同じに見せて違う回転）" spin={d.spinB} />
      </div>

      <ChangeList from={preset.params} to={c.a} title={`A: 基本の${typeLabel(c.serveType)}から変えたところ`} empty="基本のフォームのまま。" />
      <ChangeList from={c.a} to={d.params} title="B: A から変えたところ（相手に見えにくい違い）" />
    </div>
  );
}

function Cell({ o }: { o: ReceiveOutcome }) {
  return <td className={`rounded-md py-1.5 font-bold ${OUTCOME_STYLE[o].cls}`}>{OUTCOME_STYLE[o].short}</td>;
}
