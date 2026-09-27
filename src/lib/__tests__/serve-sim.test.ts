import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMS,
  PRESETS,
  PRO_SERVE_SPIN,
  dropTestBounceHeight,
  magnusCoefficient,
  serveInsights,
  simulateServe,
  tableRestitution,
} from "../serve-sim";
import { decaySpin } from "../flight";

const preset = (id: string) => PRESETS.find((p) => p.id === id)!.params;

describe("simulateServe", () => {
  it("全プリセット（5種類の基本スイング）がルール上入るサーブになる", () => {
    for (const p of PRESETS) {
      const r = simulateServe(p.params);
      expect(r.legal, p.label).toBe(true);
    }
  });

  it("スイングを鋭くする（同じ振り幅を短い時間で）と回転量が増える", () => {
    const base = preset("hook");
    const slow = simulateServe({ ...base, tempo: base.tempo * 1.3 });
    const fast = simulateServe({ ...base, tempo: base.tempo * 0.8 });
    expect(fast.contact.spin.total).toBeGreaterThan(slow.contact.spin.total);
  });

  it("横回転の向きに合わせて飛行中に進路が曲がる（順横は右へ、逆横は左へ）", () => {
    // 空気抵抗は進行方向に沿うので、水平面での向きを変えるのは横回転（マグヌス力）だけ
    // 打球から自コートの1バウンド目までの「空中」だけで測る（バウンドでの横跳ねは別の現象）
    const heading = (r: ReturnType<typeof simulateServe>) => {
      const firstBounce = r.events.find((e) => e.kind === "bounce")!.t;
      const pts = r.points.filter((pt) => pt.t > r.contactTime && pt.t < firstBounce);
      const a = pts[0];
      const b = pts[1];
      const c = pts[pts.length - 2];
      const d = pts[pts.length - 1];
      const early = Math.atan2(b.p.y - a.p.y, b.p.x - a.p.x);
      const late = Math.atan2(d.p.y - c.p.y, d.p.x - c.p.x);
      return late - early;
    };
    expect(heading(simulateServe(preset("pendulum")))).toBeLessThan(0);
    expect(heading(simulateServe(preset("tomahawk")))).toBeGreaterThan(0);
  });

  it("ラケットがボールから離れる向きに動くと空振りになる", () => {
    const base = preset("hook");
    const away = Object.fromEntries(Object.entries(base.sweep).map(([k, x]) => [k, -x])) as typeof base.sweep;
    const r = simulateServe({ ...base, sweep: away });
    expect(r.verdict).toBe("whiff");
    expect(r.legal).toBe(false);
  });

  it("トスが16cm未満だと警告しルール違反扱いにする", () => {
    const r = simulateServe({ ...DEFAULT_PARAMS, tossHeight: 0.1, contactHeight: 0.08 });
    expect(r.warnings.some((w) => w.includes("16cm"))).toBe(true);
    expect(r.legal).toBe(false);
  });

  it("ボール上の接触位置は、打球の瞬間の面の向きから求まる", () => {
    const r = simulateServe(DEFAULT_PARAMS);
    const n = r.racket.pose0.normal;
    expect(r.contact.contactOnBall.fromBottomDeg).toBeCloseTo((Math.acos(n.z) * 180) / Math.PI, 5);
  });
});

describe("serveInsights", () => {
  it("短いサーブでは2バウンド目の位置を伝える", () => {
    const tips = serveInsights(simulateServe(preset("hook")));
    expect(tips.some((t) => t.includes("2バウンド"))).toBe(true);
  });

  it("空振りでは当たらない理由を伝える", () => {
    const base = preset("hook");
    const away = Object.fromEntries(Object.entries(base.sweep).map(([k, x]) => [k, -x])) as typeof base.sweep;
    const tips = serveInsights(simulateServe({ ...base, sweep: away }));
    expect(tips[0]).toContain("当たっていません");
  });
});

// 実世界の測定値・公開モデルとの照合（モデルを変えたらここが最初に壊れるべき）
describe("実測との照合", () => {
  it("ITTF の台の検査: 30cm から落とすと 23〜26cm 弾む", () => {
    const h = dropTestBounceHeight(0.3);
    expect(h).toBeGreaterThan(0.23);
    expect(h).toBeLessThan(0.26);
  });

  it("台の反発係数は Ace の式（0.98 − 0.02·v_z）どおり", () => {
    expect(tableRestitution(2)).toBeCloseTo(0.94, 10);
    expect(tableRestitution(10)).toBeCloseTo(0.78, 10);
  });

  it("十分な回転ではマグヌス係数が Ace の式と一致する", () => {
    const speed = 10;
    const spin = 300; // rad/s
    expect(magnusCoefficient(speed, spin)).toBeCloseTo((0.1 * speed) / (0.02 * spin) - 0.001, 10);
  });

  it("回転が小さいほど揚力は0に近づく（ナックル付近の補正）", () => {
    const lift = (spin: number) => magnusCoefficient(10, spin) * spin;
    expect(lift(0)).toBe(0);
    expect(lift(5)).toBeLessThan(lift(50));
    expect(lift(50)).toBeLessThan(lift(300) * 1.01);
  });

  it("全プリセットの回転数はTリーグのショートサーブの範囲に入る", () => {
    // 中央値 ± 四分位範囲の半分（男子 46.4±15.8/2、女子 38.9±13.6/2）の外側の包絡
    const lo = PRO_SERVE_SPIN.short.women - 13.6 / 2;
    const hi = PRO_SERVE_SPIN.short.men + 15.8 / 2;
    for (const p of PRESETS) {
      const r = simulateServe(p.params);
      expect(r.verdict, p.label).toBe("short");
      expect(r.contact.spin.total, p.label).toBeGreaterThan(lo);
      expect(r.contact.spin.total, p.label).toBeLessThan(hi);
    }
  });

  it("台でのバウンドでは横回転（縦軸まわり）はほぼ変わらない（Ace の接触モデル。空気での減衰ぶんだけ減る）", () => {
    const r = simulateServe(preset("tomahawk"));
    expect(Math.abs(r.spinAtOpponent!.side - r.contact.spin.side) / Math.abs(r.contact.spin.side)).toBeLessThan(0.05);
  });

  it("飛行中の回転の減衰: 3m 飛ぶと約3%（スポーツボールのトルク係数 0.012·S）", () => {
    let w = { x: 0, y: 300, z: 0 };
    for (let i = 0; i < 300; i++) w = decaySpin(w, 10, 0.001);
    expect(1 - w.y / 300).toBeGreaterThan(0.02);
    expect(1 - w.y / 300).toBeLessThan(0.05);
  });
});
