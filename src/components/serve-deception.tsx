"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChangeList, LimitSlider, SpinCard } from "@/components/serve-disguise";
import { Chips, OUTCOME_STYLE, Stat } from "@/components/serve-receive";
import { SERVE_TYPES } from "@/lib/arm";
import { TECHNIQUES, type ReceiveOutcome, type ReceiveTiming } from "@/lib/receive";
import {
  DEFAULT_LIMITS,
  HIDDEN_WINDOW_S,
  VISIBLE_WINDOW_S,
  searchMostDeceptive,
  type DeceptionCandidate,
  type DisguiseLimits,
} from "@/lib/serve-search";
import { PRESETS } from "@/lib/serve-sim";

export type DeceptionRun = { timing: ReceiveTiming; limits: DisguiseLimits; length: "short" | "long"; list: DeceptionCandidate[] };

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
          <ol className="space-y-2">
            {last.list.map((c, i) => {
              const active = selected === c;
              return (
                <li key={c.serveType}>
                  <button
                    type="button"
                    onClick={() => onSelect(c)}
                    aria-pressed={active}
                    className={`w-full rounded-xl p-3 text-left ring-1 transition-colors ${
                      active ? "bg-tt-charcoal text-white ring-tt-charcoal" : "bg-white ring-tt-gray30/60 hover:bg-tt-offwhite"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-bold">
                        {i + 1}. {typeLabel(c.serveType)}
                      </span>
                      <span className="font-mono text-sm font-bold tabular-nums">
                        読み違えで崩れる {c.misreadFailures}/{c.misreadChances}
                      </span>
                    </div>
                    <p className={`mt-1 text-xs ${active ? "text-white/80" : "text-tt-gray70"}`}>
                      A {c.disguise.spinA.label} {c.disguise.spinA.total.toFixed(0)}rps ⇔ B {c.disguise.spinB.label}{" "}
                      {c.disguise.spinB.total.toFixed(0)}rps（回転の差 {c.spinGap.toFixed(1)}rps）
                      {!c.disguise.withinLimits && " ・上限を少し超えた組"}
                    </p>
                  </button>
                </li>
              );
            })}
          </ol>
          {missing.length > 0 && (
            <p className="text-xs text-tt-gray70">
              {missing.map((t) => t.label).join("・")}: この条件で入る組が見つかりませんでした。
            </p>
          )}
          <p className="text-xs leading-5 text-tt-gray70">
            「崩れる」は、正しく読めば入るレシーブ（払う・止める・はじく など3技術 × A→B・B→A の2方向）のうち、読み違えると入らなかった数です。
            並びは 上限を守れた組 → 崩れる割合 → 回転の差 の順。探索は乱数を使うため、実行ごとに少し結果が変わります。
          </p>
        </div>
      )}

      {selected && <CandidateDetail c={selected} />}
    </div>
  );
}

function CandidateDetail({ c }: { c: DeceptionCandidate }) {
  const preset = PRESETS.find((p) => p.params.serveType === c.serveType)!;
  const d = c.disguise;
  return (
    <div className="space-y-4 rounded-xl p-4 ring-1 ring-tt-gray30/50">
      <p className="text-sm">
        <strong>{typeLabel(c.serveType)}</strong> の組を左に表示しています（B が主役、A は灰色の点線）。「フォーム研究」で A・B を切り替えられます。
      </p>
      <div className="grid grid-cols-2 gap-3">
        <SpinCard tag="A（見せるフォーム）" spin={d.spinA} />
        <SpinCard tag="B（同じに見せて違う回転）" spin={d.spinB} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="見た目の差（位置）" value={d.visible.meanCm.toFixed(1)} unit="cm" />
        <Stat label="見た目の差（面）" value={d.visible.faceDeg.toFixed(1)} unit="°" />
        <Stat label="着地点のずれ" value={d.landingGapCm.toFixed(0)} unit="cm" />
        <Stat label="ネット上の高さの差" value={d.netGapCm.toFixed(1)} unit="cm" />
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

      <ChangeList from={preset.params} to={c.a} title={`A: 基本の${typeLabel(c.serveType)}から変えたところ`} empty="基本のフォームのまま。" />
      <ChangeList from={c.a} to={d.params} title="B: A から変えたところ（相手に見えにくい違い）" />
    </div>
  );
}

function Cell({ o }: { o: ReceiveOutcome }) {
  return <td className={`rounded-md py-1.5 font-bold ${OUTCOME_STYLE[o].cls}`}>{OUTCOME_STYLE[o].short}</td>;
}
