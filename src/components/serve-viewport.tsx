"use client";

import { BLADE, type RacketPose } from "@/lib/racket";
import type { ReceiveResult } from "@/lib/receive";
import { BALL, TABLE, positionAt, swingDirection, type SimResult } from "@/lib/serve-sim";
import { add, cross, dot, norm, scale, sub, unit, type Vec3 } from "@/lib/vec3";

export type CameraId = "racket" | "overview" | "behind" | "side" | "top";

export const CAMERAS: { id: CameraId; label: string }[] = [
  { id: "racket", label: "打点アップ" },
  { id: "overview", label: "全体" },
  { id: "behind", label: "後ろ" },
  { id: "side", label: "横" },
  { id: "top", label: "上" },
];

const W = 800;
const H = 450;

type Camera = { pos: Vec3; target: Vec3; up: Vec3; focal: number };

const CAMERA_DEFS: Record<Exclude<CameraId, "racket">, Camera> = {
  overview: { pos: { x: -1.2, y: -1.3, z: 0.95 }, target: { x: 1.0, y: 0.15, z: 0 }, up: { x: 0, y: 0, z: 1 }, focal: 640 },
  behind: { pos: { x: -2.1, y: 0, z: 0.75 }, target: { x: 1.4, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 }, focal: 760 },
  side: { pos: { x: 1.2, y: -9, z: 0.2 }, target: { x: 1.2, y: 0, z: 0.2 }, up: { x: 0, y: 0, z: 1 }, focal: 2300 },
  top: { pos: { x: 1.3, y: 0, z: 9 }, target: { x: 1.3, y: 0, z: 0 }, up: { x: 1, y: 0, z: 0 }, focal: 1300 },
};

function makeProjector(cam: Camera) {
  const f = unit(sub(cam.target, cam.pos));
  const r = unit(cross(f, cam.up));
  const u = cross(r, f);
  return (p: Vec3): [number, number, number] => {
    const d = sub(p, cam.pos);
    const zc = Math.max(0.05, dot(d, f));
    return [W / 2 + (cam.focal * dot(d, r)) / zc, H / 2 - (cam.focal * dot(d, u)) / zc, zc];
  };
}

const P = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

function poly(project: (p: Vec3) => [number, number, number], pts: Vec3[]) {
  return pts.map((p) => project(p).slice(0, 2).map((n) => n.toFixed(1)).join(",")).join(" ");
}

function ring(center: Vec3, radius: number, a: Vec3, b: Vec3, steps = 24): Vec3[] {
  return Array.from({ length: steps }, (_, i) => {
    const th = (i / steps) * Math.PI * 2;
    const c = Math.cos(th) * radius;
    const s = Math.sin(th) * radius;
    return P(center.x + a.x * c + b.x * s, center.y + a.y * c + b.y * s, center.z + a.z * c + b.z * s);
  });
}

export function ServeViewport({
  result,
  ghost,
  receive,
  time,
  camera,
}: {
  result: SimResult;
  ghost: SimResult | null;
  /** 相手のレシーブ（打球点・ラケット・返球） */
  receive: ReceiveResult | null;
  time: number;
  camera: CameraId;
}) {
  const contact = result.events[0].p;
  // 打点アップ: 打点を斜め後ろ・やや上から見る
  const cam: Camera =
    camera === "racket"
      ? { pos: add(contact, { x: -0.55, y: -0.5, z: 0.28 }), target: contact, up: { x: 0, y: 0, z: 1 }, focal: 900 }
      : CAMERA_DEFS[camera];
  const project = makeProjector(cam);
  const hw = TABLE.width / 2;
  const L = TABLE.length;
  const legH = -TABLE.heightFromFloor;

  const pathD = (pts: SimResult["points"], from: number, to = Infinity) =>
    pts
      .filter((pt) => pt.t >= from && pt.t <= to)
      .map((pt, i) => {
        const [x, y] = project(pt.p);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  // ボール（時刻に応じた位置）と台面上の影。レシーブ後は返球の軌跡をたどる
  const servePoints = receive ? result.points.filter((pt) => pt.t <= receive.hitTime) : result.points;
  const ballPos = receive && time > receive.hitTime ? positionAt(receive.points, time) : positionAt(servePoints, time);
  const [bx, by, bz] = project(ballPos);
  const ballR = Math.max(3, (cam.focal * BALL.radius) / bz);
  const shadowOnTable =
    ballPos.x >= 0 && ballPos.x <= L && Math.abs(ballPos.y) <= hw && ballPos.z > 0;
  const [sx, sy] = project(P(ballPos.x, ballPos.y, 0));

  // ラケット: 計算した剛体運動（手首まわりの弧＋前腕のひねり）に沿って動かす。
  // 表示するのは打球の前後、ラケットが最大 ±70° ほど回る範囲。
  const kin = result.racket;
  const w = Math.max(1e-6, norm(kin.omega));
  const tauMin = -Math.min(0.12, 1.2 / w);
  const tauMax = Math.min(0.08, 0.8 / w);
  const tau = Math.min(tauMax, Math.max(tauMin, time - result.contactTime));
  const pose = kin.poseAt(tau);
  // スイング軌道（ブレード中心の通り道）
  const trail = Array.from({ length: 41 }, (_, i) => kin.poseAt(tauMin + ((tauMax - tauMin) * i) / 40).center);
  const swing = swingDirection(result.params);
  const [s0x, s0y] = project(kin.pose0.center);
  const [s1x, s1y] = project(add(kin.pose0.center, scale(swing, 0.12)));

  const bounceMarks = result.events.filter((e) => e.kind === "bounce" || e.kind === "net");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      role="img"
      aria-label="サーブの軌道（3Dビュー）"
    >
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#ffd166" />
        </marker>
      </defs>
      <rect width={W} height={H} fill="#16171b" />

      {/* 脚（奥行きの手がかり） */}
      {[P(0.15, -hw + 0.1, 0), P(0.15, hw - 0.1, 0), P(L - 0.15, -hw + 0.1, 0), P(L - 0.15, hw - 0.1, 0)].map((p, i) => {
        const [x1, y1] = project(p);
        const [x2, y2] = project(P(p.x, p.y, legH));
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#3a3b42" strokeWidth={4} />;
      })}

      {/* 台 */}
      <polygon points={poly(project, [P(0, -hw, 0), P(L, -hw, 0), P(L, hw, 0), P(0, hw, 0)])} fill="var(--color-gs-blue)" />
      <g stroke="#fff" strokeWidth={2} fill="none" opacity={0.9}>
        <polygon points={poly(project, [P(0, -hw, 0), P(L, -hw, 0), P(L, hw, 0), P(0, hw, 0)])} />
        <polyline points={poly(project, [P(0, 0, 0), P(L, 0, 0)])} strokeWidth={1} />
      </g>

      {/* ゴースト（比較用に保存した軌道） */}
      {ghost && (
        <path d={pathD(ghost.points, ghost.contactTime)} stroke="#b9b9bd" strokeWidth={2} strokeDasharray="4 5" fill="none" opacity={0.7} />
      )}

      {/* 影は台より手前に描く（ネットより奥の影がネットの前に出ないよう、先に描く） */}
      {shadowOnTable && <ellipse cx={sx} cy={sy} rx={ballR} ry={ballR * 0.5} fill="#000" opacity={0.35} />}

      {/* ネット */}
      <polygon
        points={poly(project, [
          P(TABLE.netX, -hw - TABLE.netOverhang, 0),
          P(TABLE.netX, hw + TABLE.netOverhang, 0),
          P(TABLE.netX, hw + TABLE.netOverhang, TABLE.netHeight),
          P(TABLE.netX, -hw - TABLE.netOverhang, TABLE.netHeight),
        ])}
        fill="#e8e8ea"
        fillOpacity={0.35}
        stroke="#fff"
        strokeWidth={1.5}
      />

      {/* トス（打点まで）と打球後の軌道。レシーブがあれば打球点まで */}
      <path d={pathD(result.points, 0, result.contactTime)} stroke="#8fd3ff" strokeWidth={1.5} strokeDasharray="2 4" fill="none" />
      <path d={pathD(servePoints, result.contactTime)} stroke="#ffd166" strokeWidth={2.5} strokeDasharray="7 5" fill="none" />
      {receive && (
        <>
          <path d={pathD(receive.points, receive.hitTime)} stroke="#7cd4ff" strokeWidth={2.5} strokeDasharray="7 5" fill="none" />
          <RacketShape pose={receive.poseAt(Math.max(-0.06, Math.min(0.05, time - receive.hitTime)))} project={project} camPos={cam.pos} tone="receiver" />
        </>
      )}

      {bounceMarks.map((e, i) => {
        const [x, y] = project(e.p);
        const color = e.kind === "net" ? "#ff5a6b" : e.kind === "bounce" && e.side === "own" ? "#ffd166" : "#7cf0b0";
        return (
          <g key={i}>
            <polygon
              points={poly(project, ring(P(e.p.x, e.p.y, 0.001), 0.05, P(1, 0, 0), P(0, 1, 0)))}
              fill="none"
              stroke={color}
              strokeWidth={2}
            />
            <circle cx={x} cy={y} r={2.5} fill={color} />
          </g>
        );
      })}

      {/* スイング軌道・ラケット（柄＋ブレード）・打球の瞬間のスイング方向 */}
      <polyline points={poly(project, trail)} fill="none" stroke="#ffd166" strokeOpacity={0.45} strokeWidth={2} />
      <RacketShape pose={pose} project={project} camPos={cam.pos} tone="server" />
      {Math.abs(tau) < 0.01 && (
        <line x1={s0x} y1={s0y} x2={s1x} y2={s1y} stroke="#ffd166" strokeWidth={2} markerEnd="url(#arrow)" />
      )}

      {/* ボール */}
      <circle cx={bx} cy={by} r={ballR} fill="#fff" stroke="#f3a712" strokeWidth={1} />
    </svg>
  );
}

/** ラケット（柄＋ブレード）。カメラ側を向いている面の色で、打つ面（赤）か裏面（黒）かが分かる。 */
function RacketShape({
  pose,
  project,
  camPos,
  tone,
}: {
  pose: RacketPose;
  project: (p: Vec3) => [number, number, number];
  camPos: Vec3;
  tone: "server" | "receiver";
}) {
  const blade = ring(pose.center, 1, scale(pose.side, BLADE.halfWidth), scale(pose.handle, BLADE.halfLength), 32);
  const handleStart = add(pose.center, scale(pose.handle, BLADE.halfLength * 0.92));
  const handleEnd = add(pose.center, scale(pose.handle, BLADE.halfLength + BLADE.handleLength));
  const hw = scale(pose.side, 0.0125);
  const handlePoly = [add(handleStart, hw), add(handleEnd, hw), sub(handleEnd, hw), sub(handleStart, hw)];
  const facingCamera = dot(pose.normal, sub(camPos, pose.center)) > 0;
  const face = tone === "server" ? "var(--color-gs-red)" : "#e0e4ea";
  const faceStroke = tone === "server" ? "#ff8a95" : "#9aa4b1";
  return (
    <g>
      <polygon points={poly(project, handlePoly)} fill="#c9a36b" stroke="#6b5230" strokeWidth={1} />
      <polygon
        points={poly(project, blade)}
        fill={facingCamera ? face : "#1f1f24"}
        stroke={facingCamera ? faceStroke : "#6a6a72"}
        strokeWidth={1.5}
      />
    </g>
  );
}
