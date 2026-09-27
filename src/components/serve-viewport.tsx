"use client";

import {
  BALL,
  TABLE,
  faceNormal,
  positionAt,
  swingDirection,
  type SimResult,
  type Vec3,
} from "@/lib/serve-sim";

export type CameraId = "overview" | "behind" | "side" | "top";

export const CAMERAS: { id: CameraId; label: string }[] = [
  { id: "overview", label: "全体" },
  { id: "behind", label: "後ろ" },
  { id: "side", label: "横" },
  { id: "top", label: "上" },
];

const W = 800;
const H = 450;

type Camera = { pos: Vec3; target: Vec3; up: Vec3; focal: number };

const CAMERA_DEFS: Record<CameraId, Camera> = {
  overview: { pos: { x: -1.2, y: -1.3, z: 0.95 }, target: { x: 1.0, y: 0.15, z: 0 }, up: { x: 0, y: 0, z: 1 }, focal: 640 },
  behind: { pos: { x: -2.1, y: 0, z: 0.75 }, target: { x: 1.4, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 }, focal: 760 },
  side: { pos: { x: 1.2, y: -9, z: 0.2 }, target: { x: 1.2, y: 0, z: 0.2 }, up: { x: 0, y: 0, z: 1 }, focal: 2300 },
  top: { pos: { x: 1.3, y: 0, z: 9 }, target: { x: 1.3, y: 0, z: 0 }, up: { x: 1, y: 0, z: 0 }, focal: 1300 },
};

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const unit = (a: Vec3): Vec3 => {
  const n = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / n, y: a.y / n, z: a.z / n };
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
  time,
  camera,
}: {
  result: SimResult;
  ghost: SimResult | null;
  time: number;
  camera: CameraId;
}) {
  const project = makeProjector(CAMERA_DEFS[camera]);
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

  // ボール（時刻に応じた位置）と台面上の影
  const ballPos = positionAt(result.points, time);
  const [bx, by, bz] = project(ballPos);
  const ballR = Math.max(3, (CAMERA_DEFS[camera].focal * BALL.radius) / bz);
  const shadowOnTable =
    ballPos.x >= 0 && ballPos.x <= L && Math.abs(ballPos.y) <= hw && ballPos.z > 0;
  const [sx, sy] = project(P(ballPos.x, ballPos.y, 0));

  // ラケット: 打点でボールの背後に、面の法線を向けて置く
  const n = faceNormal(result.params);
  const contact = result.events[0].p;
  const center = P(
    contact.x - n.x * (BALL.radius + 0.005),
    contact.y - n.y * (BALL.radius + 0.005),
    contact.z - n.z * (BALL.radius + 0.005),
  );
  const helper = Math.abs(n.z) < 0.9 ? P(0, 0, 1) : P(1, 0, 0);
  const a = unit(cross(n, helper));
  const b = cross(n, a);
  const racketPts = ring(center, 0.075, a, b);
  const showRacket = time <= result.contactTime + 0.25;

  const swing = swingDirection(result.params);
  const [s0x, s0y] = project(center);
  const [s1x, s1y] = project(P(center.x + swing.x * 0.25, center.y + swing.y * 0.25, center.z + swing.z * 0.25));

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

      {/* トス（打点まで）と打球後の軌道 */}
      <path d={pathD(result.points, 0, result.contactTime)} stroke="#8fd3ff" strokeWidth={1.5} strokeDasharray="2 4" fill="none" />
      <path d={pathD(result.points, result.contactTime)} stroke="#ffd166" strokeWidth={2.5} strokeDasharray="7 5" fill="none" />

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

      {/* ラケット面とスイング方向 */}
      {showRacket && (
        <g>
          <polygon points={poly(project, racketPts)} fill="var(--color-gs-red)" fillOpacity={0.55} stroke="#ff8a95" strokeWidth={1.5} />
          <line x1={s0x} y1={s0y} x2={s1x} y2={s1y} stroke="#ffd166" strokeWidth={2} markerEnd="url(#arrow)" />
        </g>
      )}

      {/* ボール */}
      <circle cx={bx} cy={by} r={ballR} fill="#fff" stroke="#f3a712" strokeWidth={1} />
    </svg>
  );
}
