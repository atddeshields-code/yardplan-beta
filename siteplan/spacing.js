// v20: plant spacing on the 2D plan (Austin). Pure geometry, no DOM; plan2d.js draws it, tests import it.
// Units: feet, plan coords (x east, z south). A plant's mature spread = catalog mature width (data.js PLANT_SIZE.w, every
// catalog plant has one) × the item's scale (plan "−/+" buttons). "Too close" = centers nearer than the average of the two spreads,
// i.e. the canopies would overlap at maturity (standard on-center spacing = mature width, e.g. NC State Extension Plant Toolbox / UF IFAS
// "space plants by their mature width").
import { walkPoints } from './walkway.js';
export const spreadOf = (it, sizes) => (sizes?.[it.id]?.w || 3) * (it.w || 1);
export const isWoody = type => type === 'tree' || type === 'shrub';
const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
/** pairs(plants, sizes) -> nearest-neighbour pairs, deduped: [{ a, b, dist, need, tooClose }] (a/b are indexes into plants) */
export function nearestPairs(plants, sizes) {
  const seen = new Set(), out = [];
  plants.forEach((p, i) => { let best = -1, bd = Infinity; plants.forEach((q, j) => { if (i !== j) { const d = d2(p, q); if (d < bd) { bd = d; best = j; } } });
    if (best < 0) return; const k = Math.min(i, best) + ':' + Math.max(i, best); if (seen.has(k)) return; seen.add(k);
    const need = (spreadOf(p, sizes) + spreadOf(plants[best], sizes)) / 2; out.push({ a: Math.min(i, best), b: Math.max(i, best), dist: bd, need, tooClose: bd < need - 1e-6 }); });
  return out;
}
/** every too-close pair (not only nearest neighbours), for warnings */
export function tooClosePairs(plants, sizes) {
  const out = []; for (let i = 0; i < plants.length; i++) for (let j = i + 1; j < plants.length; j++) { const d = d2(plants[i], plants[j]), need = (spreadOf(plants[i], sizes) + spreadOf(plants[j], sizes)) / 2; if (d < need - 1e-6) out.push({ a: i, b: j, dist: d, need }); }
  return out;
}
/** closest point on segment ab to p */
function segPt(p, a, b) { const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz; let t = L ? ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / L : 0; t = Math.max(0, Math.min(1, t)); return [a[0] + t * dx, a[1] + t * dz]; }
/** wall item (centre x/z, length w, rotation r as drawn by plan2d: SVG rotate(-r)) -> centre-line segment */
export function wallSeg(w) { const c = Math.cos(-(w.r || 0)), s = Math.sin(-(w.r || 0)), h = (w.w || 1) / 2; return [[w.x - c * h, w.z - s * h], [w.x + c * h, w.z + s * h]]; }
/** edgeTarget(p, { yard, lot, walls }) -> { dist, to:[x,z], what:'wall'|'edge' } — nearest wall face or yard/lot boundary */
export function edgeTarget(p, { yard, lot, walls = [] }) {
  let best = null; const consider = (pt, what, off = 0) => { const d = Math.max(0, Math.hypot(pt[0] - p.x, pt[1] - p.z) - off); if (!best || d < best.dist) best = { dist: d, to: pt, what }; };
  const poly = Array.isArray(lot) && lot.length >= 3 ? lot : [[-yard.w / 2, -yard.d / 2], [yard.w / 2, -yard.d / 2], [yard.w / 2, yard.d / 2], [-yard.w / 2, yard.d / 2]];
  for (let i = 0; i < poly.length; i++) consider(segPt(p, poly[i], poly[(i + 1) % poly.length]), 'edge');
  for (const w of walls) { const [a, b] = wallSeg(w); const pt = segPt(p, a, b), half = Math.max(.8, w.d || 1) / 2, d = Math.hypot(pt[0] - p.x, pt[1] - p.z);
    // land the dimension on the wall face, not its centre line
    const face = d > half ? [pt[0] + (p.x - pt[0]) * half / d, pt[1] + (p.z - pt[1]) * half / d] : pt; consider(face, 'wall'); }
  return best;
}
// ---------- v20.1: constrained Fix spacing ----------
// Rules (Austin review of v20): every plant centre stays inside the yard polygon at least half its mature spread from the edge
// and from the house; plants keep to the bed/zone they started in where possible; pairs that can't both fit are NOT forced
// apart — they are put back and reported with a remove/swap suggestion.
export const rectPoly = (x, z, w, d, r = 0) => { const c = Math.cos(-r), s = Math.sin(-r); return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([u, v]) => [x + u * c - v * s, z + u * s + v * c]); };
export function inPoly(p, P) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > p.z) !== (zj > p.z) && p.x < (xj - xi) * (p.z - zi) / (zj - zi) + xi) c = !c; } return c; }
function nearestOnPoly(p, P) { let best = null; for (let i = 0; i < P.length; i++) { const q = segPt(p, P[i], P[(i + 1) % P.length]), d = Math.hypot(q[0] - p.x, q[1] - p.z); if (!best || d < best.d) best = { q, d }; } return best; }
/** signed clearance: + = inside poly, distance to its boundary; − = outside */
export const clearance = (p, P) => { const n = nearestOnPoly(p, P); return inPoly(p, P) ? n.d : -n.d; };
const cen = P => [P.reduce((s, q) => s + q[0], 0) / P.length, P.reduce((s, q) => s + q[1], 0) / P.length];
/** move p so it is inside P with clearance ≥ m (best effort: toward the centroid if the poly is too thin) */
function keepIn(p, P, m) { for (let k = 0; k < 6; k++) { const c = clearance(p, P); if (c >= m - 1e-6) return true;
    const n = nearestOnPoly(p, P), [cx, cz] = cen(P); let ux, uz; if (c > 1e-6) { ux = p.x - n.q[0]; uz = p.z - n.q[1]; } else { ux = cx - n.q[0]; uz = cz - n.q[1]; }
    const L = Math.hypot(ux, uz) || 1; p.x = n.q[0] + ux / L * m; p.z = n.q[1] + uz / L * m; } return clearance(p, P) >= m - 1e-3; }
// v21: plants stay off the walkway: centre ≥ half the path width + min(spread/2, 2 ft) from its centre line
const walkGap = (r, w) => w.w / 2 + Math.min(r, 2);
function nearWalk(p, w) { const S = walkPoints(w); let best = null; for (let i = 1; i < S.length; i++) { const q = segPt(p, S[i - 1], S[i]), d = Math.hypot(q[0] - p.x, q[1] - p.z); if (!best || d < best.d) best = { q, d }; } return best; }
function keepOffWalk(p, w, r) { const n = nearWalk(p, w), m = walkGap(r, w); if (!n || n.d >= m - 1e-6) return; let ux = p.x - n.q[0], uz = p.z - n.q[1], L = Math.hypot(ux, uz); if (L < 1e-6) { ux = 0; uz = -1; L = 1; } p.x = n.q[0] + ux / L * m; p.z = n.q[1] + uz / L * m; }
function keepOut(p, P, m) { if (!P) return; const c = clearance(p, P); if (c <= -m + 1e-6) return; const n = nearestOnPoly(p, P); let ux = p.x - n.q[0], uz = p.z - n.q[1];
  if (c > 0) { ux = -ux; uz = -uz; } const L = Math.hypot(ux, uz) || 1; p.x = n.q[0] + ux / L * m; p.z = n.q[1] + uz / L * m; }
/** ctx = { yard, lot?, house? (poly), zones? [{poly, kind}] } -> per-plant constraints */
function setup(plants, sizes, ctx) { const Y = Array.isArray(ctx.lot) && ctx.lot.length >= 3 ? ctx.lot : rectPoly(0, 0, ctx.yard.w, ctx.yard.d);
  return plants.map(p => { const r = spreadOf(p, sizes) / 2, z = (ctx.zones || []).find(Z => inPoly(p, Z.poly)); return { r, yard: Y, zone: z ? z.poly : null }; }); }
/** spacingIssues(plants, sizes, ctx) -> { pairs:[{a,b,dist,need,short}], room:[{i,short}] } — short = ft more room needed */
export function spacingIssues(plants, sizes, ctx) { const C = setup(plants, sizes, ctx);
  const room = []; plants.forEach((p, i) => { let short = C[i].r - clearance(p, C[i].yard); if (ctx.house) short = Math.max(short, C[i].r + clearance(p, ctx.house)); for (const w of ctx.walks || []) { const n = nearWalk(p, w); if (n) short = Math.max(short, walkGap(C[i].r, w) - n.d); } if (short > .05) room.push({ i, short }); });
  return { pairs: tooClosePairs(plants, sizes).map(x => ({ ...x, short: x.need - x.dist })), room }; }
/** fixSpacing(plants, sizes, ctx) — in place. Returns { moved, pairs, room } (what is still wrong after fixing; nothing forced). */
export function fixSpacing(plants, sizes, ctx, iters = 300) {
  if (ctx && 'x0' in ctx) ctx = { yard: { w: ctx.x1 - ctx.x0, d: ctx.z1 - ctx.z0 } }; // old signature (bounds)
  const C = setup(plants, sizes, ctx), start = plants.map(p => [p.x, p.z]);
  const project = i => { const p = plants[i], c = C[i]; if (c.zone) keepIn(p, c.zone, Math.min(.5, c.r)); keepOut(p, ctx.house, c.r); for (const w of ctx.walks || []) keepOffWalk(p, w, c.r); keepIn(p, c.yard, c.r); };
  plants.forEach((_, i) => project(i));
  for (let k = 0; k < iters; k++) { const bad = tooClosePairs(plants, sizes); if (!bad.length) break;
    for (const { a, b, dist, need } of bad) { const P = plants[a], Q = plants[b]; let ux = Q.x - P.x, uz = Q.z - P.z, L = Math.hypot(ux, uz);
      if (L < 1e-6) { const ang = (a * 2.399963 + b) % (2 * Math.PI); ux = Math.cos(ang); uz = Math.sin(ang); L = 1; }
      const push = (need - dist) / 2 + .01; P.x -= ux / L * push; P.z -= uz / L * push; Q.x += ux / L * push; Q.z += uz / L * push; project(a); project(b); } }
  // a pair that still overlaps can't both fit: put both back where the designer had them (inside the yard) instead of forcing it
  const stuck = new Set(); for (const x of tooClosePairs(plants, sizes)) { stuck.add(x.a); stuck.add(x.b); }
  for (const i of stuck) { plants[i].x = start[i][0]; plants[i].z = start[i][1]; keepIn(plants[i], C[i].yard, Math.min(C[i].r, .01)); }
  plants.forEach(p => { p.x = +p.x.toFixed(2); p.z = +p.z.toFixed(2); });
  const iss = spacingIssues(plants, sizes, ctx);
  return { moved: plants.filter((p, i) => Math.abs(p.x - start[i][0]) > .01 || Math.abs(p.z - start[i][1]) > .01).length, pairs: iss.pairs, room: iss.room, remaining: iss.pairs.length + iss.room.length };
}
/** advice for what's left: a sentence per problem, biggest first */
export function spacingAdvice(plants, iss, nameOf, sizes) {
  const ft = v => { const f = Math.floor(v + 1e-6), i = Math.round((v - f) * 12); return i === 12 ? `${f + 1}'` : i ? `${f}' ${i}"` : `${f}'`; };
  const out = [];
  for (const x of iss.pairs.slice().sort((p, q) => q.short - p.short)) { const A = plants[x.a], B = plants[x.b], big = spreadOf(A, sizes) >= spreadOf(B, sizes) ? A : B;
    out.push(`${nameOf(A.id)} and ${nameOf(B.id)} need ${ft(x.short)} more room. Remove one, or swap ${nameOf(big.id)} for a smaller plant.`); }
  for (const r of iss.room.slice().sort((p, q) => q.short - p.short)) out.push(`${nameOf(plants[r.i].id)} needs ${ft(r.short)} more room from the yard edge, house or walkway. Move it, or swap it for a smaller plant.`);
  return out;
}
/** schedule(plants, catalog, sizes) -> rows { id, name, qty, oc (ft, on-centre = mature width), h, w } sorted big → small */
export function schedule(plants, catalog, sizes) {
  const m = new Map(); for (const p of plants) { const r = m.get(p.id) || { id: p.id, qty: 0, ws: [] }; r.qty++; r.ws.push(spreadOf(p, sizes)); m.set(p.id, r); }
  return [...m.values()].map(r => { const c = catalog.find(q => q.id === r.id) || {}, s = sizes?.[r.id] || {}; const w = Math.max(...r.ws);
    return { id: r.id, name: c.name || r.id, sci: c.sci || '', type: c.type || '', qty: r.qty, oc: w, h: s.h || null, w }; }).sort((a, b) => b.w - a.w || a.name.localeCompare(b.name));
}
// ---------- v21: plant layout that starts with zero spacing warnings ----------
/**
 * layoutPlants(reqs, sizes, ctx) — reqs: [{ id, tx, tz, zones:[rect index…|'lawn'], ...extra }] in priority order; ctx: { yard,
 * beds:[{x,z,w,d}], lawn?:{x,z,w,d}, walks?:[walk items], step? }. Each plant goes to the free spot nearest its target where: the
 * centre is inside an allowed bed (½ ft in), at least half its mature spread from the yard edge, its canopy doesn't overlap any
 * plant already placed (centres ≥ the average of the two spreads), and it stays clear of the walkway (centre ≥ half the path
 * width + min(spread/2, 2 ft) from the path centre line). Returns { placed:[{...req, x, z}], skipped:[req] } — nothing is forced.
 */
const WD = { key: null, m: null }; // walkway-distance cache shared across calls (the picker lays out the same walk many times)
export function layoutPlants(reqs, sizes, ctx, distToWalk) {
  const W = ctx.yard.w / 2, D = ctx.yard.d / 2, step = ctx.step || .5, walks = ctx.walks || [], placed = [], skipped = [];
  const wkey = walks.map(w => JSON.stringify([w.line, w.w, w.corner])).join('|'); if (WD.key !== wkey) { WD.key = wkey; WD.m = new Map(); }
  const cache = WD.m, wd = (x, z) => { const k = x + ',' + z; if (!cache.has(k)) cache.set(k, Math.min(Infinity, ...walks.map(w => distToWalk([x, z], w) - w.w / 2))); return cache.get(k); };
  const grid = R => { const out = [], m = .5; for (let x = R.x - R.w / 2 + m; x <= R.x + R.w / 2 - m + 1e-9; x += step) for (let z = R.z - R.d / 2 + m; z <= R.z + R.d / 2 - m + 1e-9; z += step) out.push([+x.toFixed(2), +z.toFixed(2)]); return out; };
  const grids = ctx.beds.map(grid), lawnGrid = ctx.lawn ? grid(ctx.lawn) : [];
  for (const q of reqs) { const s = spreadOf({ id: q.id, w: 1 }, sizes), r = s / 2; let best = null, bd = Infinity;
    for (const zn of q.zones) { const G = zn === 'lawn' ? lawnGrid : grids[zn] || [];
      for (const [x, z] of G) { if (Math.abs(x) > W - r + 1e-9 || Math.abs(z) > D - r + 1e-9) continue;
        const d = Math.hypot(x - q.tx, z - q.tz); if (d >= bd) continue;
        if (walks.length && wd(x, z) < Math.min(r, 2) - 1e-9) continue;
        if (placed.some(p => Math.hypot(p.x - x, p.z - z) < (p.s + s) / 2 + 1e-6)) continue;
        best = [x, z]; bd = d; }
      if (best) break; }
    if (best) placed.push({ ...q, x: best[0], z: best[1], s }); else skipped.push(q); }
  return { placed: placed.map(({ s, ...p }) => p), skipped };
}
