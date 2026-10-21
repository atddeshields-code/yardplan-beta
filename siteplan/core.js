import { syncWalk } from './walkway.js';
// siteplan/core.js — pure geometry + aerial classification for the 2D auto site plan (no DOM, node-testable).
// Units: feet. Plan coordinates: x to the right (east when north = 0), z down (south). Polygons: [[x, z], ...].
export const FT_PER_M = 3.28084;
export const TYPES = {
  lot: { name: 'Lot line', fill: 'none', stroke: '#c0392b' }, house: { name: 'House', fill: '#d9d9de', stroke: '#6b6b73' },
  driveway: { name: 'Driveway', fill: '#c8c6c1', stroke: '#8d8a83' }, patio: { name: 'Patio / walk', fill: '#d8cfc0', stroke: '#9d9384' },
  pool: { name: 'Pool', fill: '#7cc4e6', stroke: '#2b86b5' }, lawn: { name: 'Lawn', fill: '#a9d394', stroke: '#6fa25b' },
  bed: { name: 'Planting bed', fill: '#b58b62', stroke: '#7a5a3c' }, gravel: { name: 'Gravel', fill: '#cfcac0', stroke: '#8f8a80' },
  easement: { name: 'Easement', fill: 'none', stroke: '#8e44ad', dash: true }, setback: { name: 'Setback line', fill: 'none', stroke: '#e67e22', dash: true },
  tree: { name: 'Tree canopy', fill: 'rgba(46,110,52,.28)', stroke: '#2e6e34' }
};
export const AREA_TYPES = ['house', 'driveway', 'patio', 'pool', 'lawn', 'bed', 'gravel', 'easement'];
// ---------- geometry ----------
/** selfIntersects(P): true when two non-adjacent edges cross (bow-tie). Overnight B10. */
export function selfIntersects(P) { const n = P?.length || 0; if (n < 4) return false;
  const cr = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { if (j === i + 1 || (i === 0 && j === n - 1)) continue;
    const a = P[i], b = P[(i + 1) % n], c = P[j], d = P[(j + 1) % n], d1 = cr(c, d, a), d2 = cr(c, d, b), d3 = cr(a, b, c), d4 = cr(a, b, d);
    if (((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9))) return true; }
  return false; }
export const area = P => Math.abs(P.reduce((s, [x, z], i) => { const [x2, z2] = P[(i + 1) % P.length]; return s + x * z2 - x2 * z; }, 0) / 2);
export const perimeter = P => P.reduce((s, p, i) => s + dist(p, P[(i + 1) % P.length]), 0);
export const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
export const centroid = P => { let A = 0, cx = 0, cz = 0; P.forEach(([x, z], i) => { const [x2, z2] = P[(i + 1) % P.length], k = x * z2 - x2 * z; A += k; cx += (x + x2) * k; cz += (z + z2) * k; });
  return Math.abs(A) < 1e-9 ? [P.reduce((s, p) => s + p[0], 0) / P.length, P.reduce((s, p) => s + p[1], 0) / P.length] : [cx / (3 * A), cz / (3 * A)]; };
export const bbox = P => { const xs = P.map(p => p[0]), zs = P.map(p => p[1]); return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) }; };
export const rot = ([x, z], a, [cx, cz] = [0, 0]) => { const c = Math.cos(a), s = Math.sin(a); return [cx + (x - cx) * c - (z - cz) * s, cz + (x - cx) * s + (z - cz) * c]; };
export function inPoly([x, z], P) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; }
export function simplify(P, tol) { // Douglas–Peucker on a closed ring
  if (P.length < 4) return P; const dp = (pts) => { if (pts.length < 3) return pts; const a = pts[0], b = pts[pts.length - 1]; let m = -1, idx = 0;
    for (let i = 1; i < pts.length - 1; i++) { const d = segDist(pts[i], a, b); if (d > m) { m = d; idx = i; } } return m > tol ? [...dp(pts.slice(0, idx + 1)).slice(0, -1), ...dp(pts.slice(idx))] : [a, b]; };
  let far = 0, fd = -1; P.forEach((p, i) => { const d = dist(p, P[0]); if (d > fd) { fd = d; far = i; } });
  const out = [...dp(P.slice(0, far + 1)).slice(0, -1), ...dp([...P.slice(far), P[0]]).slice(0, -1)]; return out.length >= 3 ? out : P;
}
function segDist(p, a, b) { const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz; if (!L) return dist(p, a); let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L; t = Math.max(0, Math.min(1, t)); return dist(p, [a[0] + t * dx, a[1] + t * dz]); }
/** dominant orientation (radians in [0, π/2)) weighted by edge length */
export function dominantAngle(P) { let sx = 0, sz = 0; P.forEach((p, i) => { const q = P[(i + 1) % P.length], L = dist(p, q), a = Math.atan2(q[1] - p[1], q[0] - p[0]) * 4; sx += L * Math.cos(a); sz += L * Math.sin(a); });
  let a = Math.atan2(sz, sx) / 4; if (a < 0) a += Math.PI / 2; return a; }
/** snap a footprint to right angles: rotate to its dominant axis, make every edge axis-aligned, merge collinear, rotate back */
export function rectilinear(P, tol = 1) {
  if (P.length < 3) return P; const a = dominantAngle(P), c = centroid(P); let Q = simplify(P.map(p => rot(p, -a, c)), tol);
  const n = Q.length, out = []; // each edge becomes horizontal or vertical; vertices at intersections of consecutive snapped edges
  const edges = Q.map((p, i) => { const q = Q[(i + 1) % n], h = Math.abs(q[0] - p[0]) >= Math.abs(q[1] - p[1]); return { h, v: h ? (p[1] + q[1]) / 2 : (p[0] + q[0]) / 2 }; });
  const merged = []; edges.forEach(e => { const last = merged[merged.length - 1]; if (last && last.h === e.h) last.v = (last.v + e.v) / 2; else merged.push({ ...e }); });
  if (merged.length > 1 && merged[0].h === merged[merged.length - 1].h) { merged[0].v = (merged[0].v + merged.pop().v) / 2; }
  if (merged.length < 4 || merged.length % 2) { const b = bbox(Q); return [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]].map(p => rot(p, a, c)); }
  for (let i = 0; i < merged.length; i++) { const e = merged[i], f = merged[(i + 1) % merged.length]; out.push(e.h ? [f.v, e.v] : [e.v, f.v]); }
  return out.map(p => rot(p, a, c)).map(r2);
}
const r2 = ([x, z]) => [Math.round(x * 100) / 100, Math.round(z * 100) / 100];
export const fmtFt = v => { const f = Math.floor(v + 1e-6), i = Math.round((v - f) * 12); return i === 12 ? `${f + 1}'` : i ? `${f}' ${i}"` : `${f}'`; };
// ---------- geo ----------
/** lon/lat → local feet around (lat0, lon0): x east, z south */
export const projector = (lat0, lon0) => { const ky = 111320 * FT_PER_M, kx = ky * Math.cos(lat0 * Math.PI / 180); return ([lon, lat]) => [(lon - lon0) * kx, -(lat - lat0) * ky]; };
// ---------- bearings (surveys) ----------
/** parse "N 12°30' E 85.00'" / "S12-30-15W 120.5" → { az (radians, clockwise from north), len (ft) } */
export function parseCall(s) {
  const m = /([NS])\s*(\d+(?:\.\d+)?)\s*(?:°|d|-|\s)\s*(?:(\d+(?:\.\d+)?)\s*(?:'|′|m|-|\s)\s*)?(?:(\d+(?:\.\d+)?)\s*(?:"|″|s)?\s*)?([EW])\s*,?\s*(\d+(?:\.\d+)?)\s*(m(?:et(?:er|re)s?)?\b|ft\b|feet\b|'|′)?/i.exec(String(s).replace(/[’]/g, "'"));
  if (!m) return null; if ((+m[3] || 0) >= 60 || (+m[4] || 0) >= 60) return null; const deg = +m[2] + (+m[3] || 0) / 60 + (+m[4] || 0) / 3600; if (deg > 90) return null;
  const ns = m[1].toUpperCase(), ew = m[5].toUpperCase(); let az = ns === 'N' ? (ew === 'E' ? deg : 360 - deg) : (ew === 'E' ? 180 - deg : 180 + deg);
  // Run 5 (R5-5): "25.9m" / "25.9 metres" was read as 25.9 ft (lot 3.28× too small). Metres convert; ft/'/none = feet.
  const metric = /^m/i.test(m[7] || '');
  return { az: az * Math.PI / 180, len: metric ? Math.round(+m[6] * FT_PER_M * 100) / 100 : +m[6], ...(metric ? { unit: 'm' } : {}) };
}
/** traverse calls from [0,0]; returns { pts, closure (ft misclosure) } in plan coords (x east, z south) */
export function traverse(calls) { let p = [0, 0]; const pts = [p];
  for (const c of calls) { p = [p[0] + c.len * Math.sin(c.az), p[1] - c.len * Math.cos(c.az)]; pts.push(r2(p)); }
  const closure = dist(pts[0], pts[pts.length - 1]); if (closure < 0.5 && pts.length > 3) pts.pop(); return { pts, closure: Math.round(closure * 100) / 100 }; }
/** distance labels from a survey's text layer: 85.00', 120.5 ft, 12°30' bearings */
export function distanceLabels(text) { const out = new Set(); for (const m of String(text).matchAll(/(?<![\d.])(\d{1,4}\.\d{1,2})\s*(?:'|′|ft\b|feet\b)?/g)) { const v = +m[1]; if (v >= 2 && v <= 2000) out.add(v); } return [...out].slice(0, 40); }
export const callsIn = text => [...String(text).matchAll(/[NS]\s*\d{1,2}\s*°\s*\d{1,2}\s*['′]\s*(?:\d{1,2}(?:\.\d+)?\s*["″])?\s*[EW]\s*,?\s*\d+(?:\.\d+)?/gi)].map(m => m[0]);
// ---------- similarity transform from two point pairs (survey → aerial align) ----------
/** align2(src pair, dst pair, rigid): similarity (or rigid: rotation + translation, scale kept) mapping src → dst; rigid anchors the midpoints */
export function align2([a1, b1], [a2, b2], rigid = false) { const v1 = [b1[0] - a1[0], b1[1] - a1[1]], v2 = [b2[0] - a2[0], b2[1] - a2[1]];
  const s = Math.hypot(...v2) / Math.hypot(...v1), th = Math.atan2(v2[1], v2[0]) - Math.atan2(v1[1], v1[0]), k = rigid ? 1 : s;
  const m1 = rigid ? [(a1[0] + b1[0]) / 2, (a1[1] + b1[1]) / 2] : a1, m2 = rigid ? [(a2[0] + b2[0]) / 2, (a2[1] + b2[1]) / 2] : a2;
  return { s, th, map: p => { const q = rot([(p[0] - m1[0]) * k, (p[1] - m1[1]) * k], th); return [q[0] + m2[0], q[1] + m2[1]]; } }; }
// ---------- raster → polygons ----------
/** boundary of a component on a grid (cells true), returned as a ring of cell corners in grid units */
export function traceComponent(mask, W, H, comp, id) {
  const inC = (x, y) => x >= 0 && y >= 0 && x < W && y < H && comp[y * W + x] === id;
  // directed boundary edges, then chain them
  const next = new Map(); const key = (x, y) => x + ',' + y;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inC(x, y)) {
    if (!inC(x, y - 1)) next.set(key(x, y), [x + 1, y]); if (!inC(x + 1, y)) next.set(key(x + 1, y), [x + 1, y + 1]);
    if (!inC(x, y + 1)) next.set(key(x + 1, y + 1), [x, y + 1]); if (!inC(x - 1, y)) next.set(key(x, y + 1), [x, y]); }
  // longest loop = outer boundary
  let best = []; const seen = new Set();
  for (const k of next.keys()) { if (seen.has(k)) continue; const ring = []; let cur = k, guard = 0; while (!seen.has(cur) && guard++ < 1e6) { seen.add(cur); const [x, y] = cur.split(',').map(Number); ring.push([x, y]); const n = next.get(cur); if (!n) break; cur = key(...n); } if (ring.length > best.length) best = ring; }
  return best;
}
export function components(mask, W, H) { const comp = new Int32Array(W * H).fill(-1), sizes = []; let id = 0;
  for (let i = 0; i < W * H; i++) { if (!mask[i] || comp[i] >= 0) continue; const st = [i]; comp[i] = id; let n = 0;
    while (st.length) { const j = st.pop(); n++; const x = j % W, y = (j / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const k = Y * W + X; if (mask[k] && comp[k] < 0) { comp[k] = id; st.push(k); } } }
    sizes.push(n); id++; }
  return { comp, sizes }; }
function morph(mask, W, H, r, dilate) { const out = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = dilate ? 0 : 1;
  for (let dy = -r; dy <= r && (dilate ? !v : v); dy++) for (let dx = -r; dx <= r; dx++) { const X = x + dx, Y = y + dy; const m = X >= 0 && Y >= 0 && X < W && Y < H ? mask[Y * W + X] : 0; if (dilate && m) { v = 1; break; } if (!dilate && !m) { v = 0; break; } } out[y * W + x] = v; } return out; }
const openClose = (m, W, H, r) => morph(morph(morph(morph(m, W, H, r, false), W, H, r, true), W, H, r, true), W, H, r, false);
/**
 * classify(img) — img: { rgb: Uint8ClampedArray RGBA, nir: Uint8ClampedArray RGBA (NIR in R) | null, W, H, ftPerPx, toFt(px,py)->[x,z] }
 * opts: { lot: ring ft | null, house: [rings ft], street: [x,z] | null }
 * Returns { shapes: [{ type, pts, auto:true }], trees: [{x,z,r}], stats }
 * NDVI = (NIR − R)/(NIR + R) separates plants from paving; NIR texture (local std) separates tree canopy from lawn;
 * blue-dominant pixels are pools; low-saturation bright pixels are paving. Without NIR, a green-excess index is used instead.
 */
export function classify(img, opts = {}) {
  const { rgb, nir, W, H, ftPerPx, toFt } = img, cell = Math.max(1, Math.round(2 / ftPerPx)), gw = Math.floor(W / cell), gh = Math.floor(H / cell);
  const N = gw * gh, cls = new Uint8Array(N), nd = new Float32Array(N), tex = new Float32Array(N), bri = new Float32Array(N); // 0 none 1 lawn 2 tree 3 pave 4 pool 5 other
  const lot = opts.lot, houses = opts.house || [];
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    let r = 0, g = 0, b = 0, n = 0, n2 = 0, k = 0;
    for (let y = gy * cell; y < gy * cell + cell; y++) for (let x = gx * cell; x < gx * cell + cell; x++) { const i = (y * W + x) * 4; r += rgb[i]; g += rgb[i + 1]; b += rgb[i + 2]; const v = nir ? nir[i] : 0; n += v; n2 += v * v; k++; }
    r /= k; g /= k; b /= k; n /= k; const sd = Math.sqrt(Math.max(0, n2 / k - n * n));
    const [fx, fz] = toFt((gx + .5) * cell, (gy + .5) * cell), j = gy * gw + gx;
    if (lot && !inPoly([fx, fz], lot)) continue; if (houses.some(h => inPoly([fx, fz], h))) continue;
    const ndvi = nir ? (n - r) / (n + r + 1e-6) : (2 * g - r - b) / (r + g + b + 1e-6), mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0;
    nd[j] = ndvi; tex[j] = nir ? n : g; bri[j] = (r + g + b) / 3;
    if (ndvi > (nir ? .18 : .08)) cls[j] = 1; else if (b > r + 18 && b > g + 4 && b > 90) cls[j] = 4; else if (sat < .22 && mx > 95) cls[j] = 3; else cls[j] = 5;
  }
  // texture: canopy is rougher in NIR and darker in visible; use a 5×5 window std of NDVI-cells' NIR std
  const T = opts.texT ?? (nir ? 11 : 13), D = opts.darkT ?? 78, tr = new Uint8Array(N);
  for (let j = 0; j < N; j++) if (cls[j] === 1) { const x = j % gw, y = (j / gw) | 0; let s = 0, s2 = 0, c = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < gw && Y < gh) { const v = tex[Y * gw + X]; s += v; s2 += v * v; c++; } }
    const sd = Math.sqrt(Math.max(0, s2 / c - (s / c) ** 2)); if (sd > T || bri[j] < D) tr[j] = 1; }
  for (let j = 0; j < N; j++) if (tr[j]) cls[j] = 2;
  const ftc = cell * ftPerPx, shapes = [], trees = [], toPlan = ([cx, cy]) => toFt(cx * cell, cy * cell).map(v => Math.round(v * 100) / 100);
  const polysOf = (c, minSf, tol) => { const mask = openClose(cls.map(v => +(v === c)), gw, gh, 1), { comp, sizes } = components(mask, gw, gh), out = [];
    sizes.forEach((sz, id) => { if (sz * ftc * ftc < minSf) return; const ring = traceComponent(mask, gw, gh, comp, id); const P = simplify(ring.map(toPlan), tol); if (P.length >= 3) out.push(P); }); return out; };
  polysOf(1, 60, 1.5).forEach(P => shapes.push({ type: 'lawn', pts: P, auto: true }));
  polysOf(4, 60, 1).forEach(P => shapes.push({ type: 'pool', pts: rectilinear(P, 1), auto: true }));
  polysOf(3, 50, 1.5).forEach(P => { const c = centroid(P), nearStreet = opts.street && lot ? lotEdgeDist(c, lot, opts.street) : false; shapes.push({ type: nearStreet ? 'driveway' : 'patio', pts: rectilinear(P, 1.5), auto: true }); });
  // trees: crowns = local maxima of near-infrared (or green) brightness inside the canopy mask, ≥ 12 ft apart; radius from spacing
  { const mask = openClose(cls.map(v => +(v === 2)), gw, gh, 1), sm = new Float32Array(N), sep = Math.max(3, Math.round(12 / ftc)), cand = [];
    for (let j = 0; j < N; j++) if (mask[j]) { const x = j % gw, y = (j / gw) | 0; let s = 0, c = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < gw && Y < gh) { s += tex[Y * gw + X]; c++; } } sm[j] = s / c; cand.push(j); }
    cand.sort((a, b) => sm[b] - sm[a]); const picked = [];
    for (const j of cand) { const x = j % gw, y = (j / gw) | 0; if (picked.every(([px, py]) => Math.hypot(px - x, py - y) >= sep)) picked.push([x, y]); if (picked.length > 60) break; }
    const masked = new Set(cand); for (const [x, y] of picked) { // grow radius until the ring leaves the canopy
      let r = 2; for (; r < 16 / ftc; r++) { let inside = 0, tot = 0; for (let a = 0; a < 16; a++) { const X = Math.round(x + r * Math.cos(a * Math.PI / 8)), Y = Math.round(y + r * Math.sin(a * Math.PI / 8)); tot++; if (masked.has(Y * gw + X)) inside++; } if (inside / tot < .6) break; }
      const near = picked.filter(q => q[0] !== x || q[1] !== y).reduce((m, q) => Math.min(m, Math.hypot(q[0] - x, q[1] - y)), 1e9); const rr = Math.min(r, near * .62) * ftc;
      if (rr >= 3) { const [fx, fz] = toPlan([x + .5, y + .5]); trees.push({ x: r1(fx), z: r1(fz), r: r1(rr) }); } } }
  const count = c => cls.reduce((s, v) => s + (v === c), 0) * ftc * ftc;
  return { shapes, trees, stats: { lawnSf: Math.round(count(1)), canopySf: Math.round(count(2)), paveSf: Math.round(count(3)), poolSf: Math.round(count(4)), cellFt: ftc, nir: !!nir } };
}
const r1 = v => Math.round(v * 10) / 10;
function lotEdgeDist(c, lot, street) { // is c within the half of the lot facing the street point?
  const lc = centroid(lot); return (c[0] - lc[0]) * (street[0] - lc[0]) + (c[1] - lc[1]) * (street[1] - lc[1]) > 0; }
// ---------- site model ----------
let n = 0; export const sid = () => 's' + Date.now().toString(36) + (n++).toString(36);
/** buildSite: assemble a site model from fetched data + classification; everything rotated so the lot's long axis is horizontal. */
/** drop near-collinear / duplicate vertices (angle < deg) */
export function dropCollinear(P, deg = 4) { let Q = P.slice(), ch = true; while (ch && Q.length > 3) { ch = false; for (let i = 0; i < Q.length; i++) { const a = Q[(i - 1 + Q.length) % Q.length], b = Q[i], c = Q[(i + 1) % Q.length];
  const t = Math.abs(Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0])), tt = Math.min(t, 2 * Math.PI - t); if (tt < deg * Math.PI / 180 || dist(a, b) < .3) { Q.splice(i, 1); ch = true; break; } } } return Q; }
export function buildSite({ lot, houses, cls, source = 'aerial', label = '', street = null, lotSource = '', houseSource = '' }) {
  const ref = lot || houses[0] || [[0, 0], [1, 0], [1, 1]], a = dominantAngle(ref), c = centroid(ref), R = p => r2(rot(p, -a, c).map((v, i) => v - c[i]));
  const site = { v: 1, source, approx: source !== 'survey', label, north: -a, lotSource, houseSource, created: Date.now(),
    lot: lot ? dropCollinear(lot.map(R)) : null, shapes: [], trees: [], dims: true, street: street ? R(street) : null };
  houses.forEach((h, i) => site.shapes.push({ id: sid(), type: 'house', pts: h.map(R), auto: true, ...(i && area(h) < 900 ? { label: 'Garage / shed' } : {}) }));
  let sh = (cls?.shapes || []).slice();
  if (!houses.length) { const cand = sh.filter(s => (s.type === 'patio' || s.type === 'driveway') && area(s.pts) > 700).sort((a, b) => area(b.pts) - area(a.pts))[0]; if (cand) { cand.type = 'house'; cand.pts = rectilinear(cand.pts, 2); cand.guessed = true; site.houseSource = 'roof seen in the aerial (guess)'; } }
  sh.forEach(s => site.shapes.push({ id: sid(), ...s, pts: s.pts.map(R) }));
  (cls?.trees || []).forEach(t => { const [x, z] = R([t.x, t.z]); site.trees.push({ id: sid(), x, z, r: t.r }); });
  if (!site.lot) { const b = bbox(site.shapes.flatMap(s => s.pts).concat(houses.length ? [] : [[-40, -30], [40, 30]])); site.lot = [[b.x0 - 5, b.z0 - 5], [b.x1 + 5, b.z0 - 5], [b.x1 + 5, b.z1 + 5], [b.x0 - 5, b.z1 + 5]].map(r2); site.lotEstimated = true; }
  return clipToLot(site);
}
/** Sutherland–Hodgman: clip polygon P to convex polygon C */
export function clipPoly(P, C) { const ccw = (C.reduce((s, [x, z], i) => { const [x2, z2] = C[(i + 1) % C.length]; return s + x * z2 - x2 * z; }, 0)) > 0; let out = P;
  for (let i = 0; i < C.length && out.length; i++) { const a = C[i], b = C[(i + 1) % C.length], inside = p => { const c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]); return ccw ? c >= 0 : c <= 0; };
    const inp = out; out = []; for (let j = 0; j < inp.length; j++) { const p = inp[j], q = inp[(j + 1) % inp.length], ip = inside(p), iq = inside(q);
      if (ip) out.push(p); if (ip !== iq) { const d1 = [q[0] - p[0], q[1] - p[1]], d2 = [b[0] - a[0], b[1] - a[1]], den = d1[0] * d2[1] - d1[1] * d2[0]; if (Math.abs(den) > 1e-9) { const t = ((a[0] - p[0]) * d2[1] - (a[1] - p[1]) * d2[0]) / den; out.push(r2([p[0] + t * d1[0], p[1] + t * d1[1]])); } } } }
  return out; }
const isConvex = P => { let sg = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], c = P[(i + 2) % P.length], cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]); if (Math.abs(cr) < 1e-6) continue; if (!sg) sg = Math.sign(cr); else if (Math.sign(cr) !== sg) return false; } return true; };
export function clipToLot(site) { const L = site.lot, cv = isConvex(L);
  site.shapes = site.shapes.map(s => (s.auto && cv && !['house', 'easement', 'setback'].includes(s.type)) ? { ...s, pts: clipPoly(s.pts, L) } : s).filter(s => s.pts.length >= 3 && (s.type !== 'lawn' && s.type !== 'patio' && s.type !== 'driveway' || area(s.pts) >= 25));
  site.shapes = site.shapes.filter(s => s.type === 'house' || s.type === 'easement' || s.type === 'setback' || inPoly(centroid(s.pts), L)); site.trees = site.trees.filter(t => inPoly([t.x, t.z], L)); return site; }
/** site → plan2d design fields. Existing lawn and beds become unpriced items (irrigation still waters them); the rest stays in design.site. */
export function siteToDesign(site, base = {}) {
  const b = bbox(site.lot), cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, sh = p => [r2([p[0] - cx, p[1] - cz])[0], r2([p[0] - cx, p[1] - cz])[1]];
  const S = { ...site, lot: site.lot.map(sh), shapes: site.shapes.map(s => ({ ...s, pts: s.pts.map(sh) })), trees: site.trees.map(t => ({ ...t, x: r1(t.x - cx), z: r1(t.z - cz) })), street: site.street ? sh(site.street) : null };
  const yard = { w: Math.ceil(b.x1 - b.x0), d: Math.ceil(b.z1 - b.z0) };
  const ex = S.shapes.filter(s => s.type === 'lawn' || s.type === 'bed' || s.type === 'gravel').map(s => polyItem(s));
  const keep = (base.items || []).filter(i => !i.existing && !i.siteId);
  const H = S.shapes.find(s => s.type === 'house'), house = H ? { ...houseAnchor(H.pts, yard) } : base.house;
  return { ...base, v: 2, yard, site: S, house, items: [...ex, ...keep] };
}
export function polyItem(s) { const b = bbox(s.pts), A = area(s.pts), bw = Math.max(1, b.x1 - b.x0), bd = Math.max(1, b.z1 - b.z0), k = Math.sqrt(A / (bw * bd)), [x, z] = centroid(s.pts);
  return { kind: s.type === 'bed' ? 'mulch' : s.type, x: r1(x), z: r1(z), r: 0, w: r1(bw * k), d: r1(bd * k), pts: s.pts, existing: !s.redo, siteId: s.id }; }
function houseAnchor(P, yard) { const c = centroid(P); const side = Math.abs(c[0]) / yard.w > Math.abs(c[1]) / yard.d ? (c[0] < 0 ? 'left' : 'right') : (c[1] < 0 ? 'back' : 'front');
  // valves go on the house wall closest to the yard center
  let best = null; P.forEach((p, i) => { const q = P[(i + 1) % P.length], m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], d = Math.hypot(m[0], m[1]); if (!best || d < best.d) best = { d, m }; });
  return { x: r1(best.m[0]), z: r1(best.m[1]), side }; }
/** edge dimension strings for a ring: [{a, b, len, mid, ang}] */
export const edges = P => P.map((p, i) => { const q = P[(i + 1) % P.length]; return { i, a: p, b: q, len: dist(p, q), mid: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], ang: Math.atan2(q[1] - p[1], q[0] - p[0]) }; });
/** set edge i of ring P to length L by moving its end vertex (and, if ortho, the next vertex along) */
export function setEdgeLength(P, i, L) { const n = P.length, a = P[i], b = P[(i + 1) % n], d = dist(a, b); if (!d || !(L > 0)) return P; const ux = (b[0] - a[0]) / d, uz = (b[1] - a[1]) / d, dx = ux * (L - d), dz = uz * (L - d);
  // translate the far side of the shape: every vertex after b up to (not including) a, so neighbours keep their direction (rectangles stay rectangles)
  const out = P.map(p => [...p]); for (let k = (i + 1) % n, c = 0; k !== i && c < n; k = (k + 1) % n, c++) { const prev = P[(k - 1 + n) % n]; const onFar = projAlong(P[k], a, ux, uz) > d / 2 - 1e-6; if (onFar) { out[k][0] += dx; out[k][1] += dz; } }
  return out.map(r2); }
const projAlong = (p, a, ux, uz) => (p[0] - a[0]) * ux + (p[1] - a[1]) * uz;
/** designOnSite(site, styleDesign): plan2d design on the real lot. The style's new work (beds, paths, plants; designed on a
 *  w×d yard) is fitted into the main lawn (largest lawn shape, else the open part of the lot); that lawn is marked replaced
 *  (not an existing item any more). Other lawn, beds and all hardscape stay as existing conditions (not priced). */
export function designOnSite(site, style = {}) {
  const s0 = JSON.parse(JSON.stringify(site)); s0.shapes.forEach(s => delete s.replaced);
  const lawns = s0.shapes.filter(s => s.type === 'lawn').sort((a, b) => area(b.pts) - area(a.pts)), main = lawns[0] && area(lawns[0].pts) > 150 ? lawns[0] : null;
  if (main) main.replaced = true;
  const d = siteToDesign(s0, { ...style, items: [] }), S = d.site;
  d.items = d.items.filter(i => !S.shapes.find(s => s.id === i.siteId)?.replaced);
  let R; if (main) R = bbox(S.shapes.find(s => s.id === main.id).pts); else { const b = bbox(S.lot), H = S.shapes.find(s => s.type === 'house'), hb = H ? bbox(H.pts) : null;
    const cands = hb ? [{ x0: b.x0 + 3, x1: b.x1 - 3, z0: b.z0 + 3, z1: hb.z0 - 2 }, { x0: b.x0 + 3, x1: b.x1 - 3, z0: hb.z1 + 2, z1: b.z1 - 3 }, { x0: b.x0 + 3, x1: hb.x0 - 2, z0: b.z0 + 3, z1: b.z1 - 3 }, { x0: hb.x1 + 2, x1: b.x1 - 3, z0: b.z0 + 3, z1: b.z1 - 3 }] : [{ x0: b.x0 + 3, x1: b.x1 - 3, z0: b.z0 + 3, z1: b.z1 - 3 }];
    const sc = r => { const w = r.x1 - r.x0, d = r.z1 - r.z0; return w > 6 && d > 6 ? Math.min(w, d * 2.5) * Math.min(d, w * 2.5) : 0; }; R = cands.sort((p, q) => sc(q) - sc(p))[0]; }
  const yw = style.yard?.w || 50, yd = style.yard?.d || 36, rw = Math.max(8, R.x1 - R.x0), rd = Math.max(8, R.z1 - R.z0), kx = rw / yw, kz = rd / yd, cx = (R.x0 + R.x1) / 2, cz = (R.z0 + R.z1) / 2;
  const HS = S.shapes.find(s => s.type === 'house'), toHouse = p => { if (!HS) return p; let best = null; for (let k = 0; k < HS.pts.length; k++) { const a = HS.pts[k], b = HS.pts[(k + 1) % HS.pts.length], dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz, t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L)) : 0, q = [a[0] + t * dx, a[1] + t * dz], d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (!best || d < best.d) best = { q, d }; } return best.q.map(r1); };
  // v21: the walkway keeps its width and shape (scaled to the region) and its first point snaps onto the house wall nearest the path
  const walkOn = i => { const line = i.line.map(([x, z]) => [r1(cx + x * kx), r1(cz + z * kz)]); line[0] = toHouse(line[1]); return syncWalk({ ...i, line }); };
  const placed = (style.items || []).filter(i => !i.existing && !i.siteId && i.kind !== 'lawn').map(i => Array.isArray(i.line) ? walkOn(i) : i.kind === 'plant' ? { ...i, x: r1(cx + i.x * kx), z: r1(cz + i.z * kz) } : { ...i, x: r1(cx + i.x * kx), z: r1(cz + i.z * kz), w: r1(Math.max(1, i.w * kx)), d: r1(Math.max(1, i.d * kz)) });
  if (main) { const L = style.items?.find(i => i.kind === 'lawn'); if (L) placed.unshift({ ...L, x: r1(cx + L.x * kx), z: r1(cz + L.z * kz), w: r1(L.w * kx), d: r1(L.d * kz) }); }
  d.items = [...d.items, ...placed]; d.region = { ...R, replacedSf: main ? Math.round(area(main.pts)) : 0 }; return d;
}
/** estimateLot(house, others, street): no parcel data → lot rectangle around the house, half-way to the neighbouring
 *  buildings on each side (in the house's own axis), front edge toward the street point. Capped to typical residential sizes. */
export function estimateLot(house, others = [], street = null) {
  const a = dominantAngle(house), c = centroid(house), R = p => rot(p, -a, c), hb = bbox(house.map(R)), ext = { x0: 30, x1: 30, z0: 30, z1: 30 };
  for (const o of others) { const ob = bbox(o.map(R)), oc = [(ob.x0 + ob.x1) / 2, (ob.z0 + ob.z1) / 2], ovZ = ob.z1 > hb.z0 && ob.z0 < hb.z1, ovX = ob.x1 > hb.x0 && ob.x0 < hb.x1;
    if (ovZ && oc[0] > hb.x1) ext.x1 = Math.min(ext.x1, (ob.x0 - hb.x1) / 2); if (ovZ && oc[0] < hb.x0) ext.x0 = Math.min(ext.x0, (hb.x0 - ob.x1) / 2);
    if (ovX && oc[1] > hb.z1) ext.z1 = Math.min(ext.z1, (ob.z0 - hb.z1) / 2); if (ovX && oc[1] < hb.z0) ext.z0 = Math.min(ext.z0, (hb.z0 - ob.z1) / 2); }
  for (const k in ext) ext[k] = Math.max(4, Math.min(45, ext[k]));
  if (street) { const s = R(street); const d = { x0: hb.x0 - s[0], x1: s[0] - hb.x1, z0: hb.z0 - s[1], z1: s[1] - hb.z1 }; const k = Object.keys(d).sort((p, q) => d[q] - d[p])[0]; if (d[k] > 0) ext[k] = Math.max(4, Math.min(ext[k], d[k] - 12)); }
  const L = [[hb.x0 - ext.x0, hb.z0 - ext.z0], [hb.x1 + ext.x1, hb.z0 - ext.z0], [hb.x1 + ext.x1, hb.z1 + ext.z1], [hb.x0 - ext.x0, hb.z1 + ext.z1]];
  return L.map(p => r2(rot(p, a, c)));
}
