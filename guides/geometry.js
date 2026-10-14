// geometry.js — design-space helpers (feet; x right, z toward viewer, rotation r about Y like three.js).
export function toLocal(it, px, pz) { const dx = px - it.x, dz = pz - it.z, c = Math.cos(it.r || 0), s = Math.sin(it.r || 0); return [dx * c - dz * s, dx * s + dz * c]; }
export function toWorld(it, lx, lz) { const c = Math.cos(it.r || 0), s = Math.sin(it.r || 0); return [it.x + lx * c + lz * s, it.z - lx * s + lz * c]; }
export function inRect(it, px, pz) { const [lx, lz] = toLocal(it, px, pz); return Math.abs(lx) <= Math.abs(it.w) / 2 && Math.abs(lz) <= Math.abs(it.d) / 2; }
export function rectCorners(it) { const w = Math.abs(it.w) / 2, d = Math.abs(it.d) / 2; return [[-w, -d], [w, -d], [w, d], [-w, d]].map(([a, b]) => toWorld(it, a, b)); }
export const area = it => Math.abs(+it.w || 0) * Math.abs(+it.d || 0);
export function convexHull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
/** Hull of circles (center, radius) approximated with 8 points each. */
export function blobHull(circles) { const pts = []; for (const [x, z, r] of circles) for (let k = 0; k < 8; k++) pts.push([x + r * Math.cos(k * Math.PI / 4), z + r * Math.sin(k * Math.PI / 4)]); return convexHull(pts).map(([a, b]) => [+a.toFixed(2), +b.toFixed(2)]); }
/** Greedy nearest-neighbour path length from start through points (ft). */
export function nnPathLength(start, pts) { let cur = start, left = pts.slice(), L = 0;
  while (left.length) { let bi = 0, bd = Infinity; left.forEach((p, i) => { const d = Math.hypot(p[0] - cur[0], p[1] - cur[1]); if (d < bd) { bd = d; bi = i; } }); L += bd; cur = left.splice(bi, 1)[0]; } return L; }
