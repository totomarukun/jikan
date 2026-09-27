// 3次元ベクトルの小さな道具箱（サーブ解析ラボの物理計算用）。

export type Vec3 = { x: number; y: number; z: number };

export const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3) => v(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3) => v(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec3, s: number) => v(a.x * s, a.y * s, a.z * s);
export const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3) =>
  v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const norm = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
export const unit = (a: Vec3) => {
  const n = norm(a);
  return n < 1e-12 ? v(0, 0, 0) : scale(a, 1 / n);
};
export const rad = (deg: number) => (deg * Math.PI) / 180;

/** 軸 axis（単位ベクトル）まわりに角度 angle だけ回す（ロドリゲスの回転公式）。 */
export function rotate(p: Vec3, axis: Vec3, angle: number): Vec3 {
  if (Math.abs(angle) < 1e-15) return p;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return add(add(scale(p, c), scale(cross(axis, p), s)), scale(axis, dot(axis, p) * (1 - c)));
}
