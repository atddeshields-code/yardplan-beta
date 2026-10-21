// v21 (Austin): the paver walkway starts at the house (back door / patio edge, a movable point) and winds through the yard to a
// destination (a seating pad, the far bed, or a loop back to the house). Pure geometry, no DOM: flow.js generates it, plan2d.js
// draws/edits it, contractor/takeoff.js measures it, tests import it. Units ft, plan coords (x east, z south).
// Item: { kind:'path'|'dg'|'gravel', walk:true, line:[[x,z],…] centre line, w: width, d: centre-line length (kept in sync so
// every w×d area reader prices it right), corner:'square'|'rounded', dest:'seat'|'bed'|'loop', x/z: bbox centre }.
// Exact measures: square corners use mitred edges and rounded corners use circular fillets on the centre line (radius ≥ half the
// width), and for both the paver area is width × centre-line length and the two side edges add up to 2 × centre-line length.
export const WALK = { minW: 3, maxW: 4, defW: 3.5, edge: 2, radius: 7, straight: 3 };
export const cornerFor = style => ['modern', 'formal'].includes(style) ? 'square' : 'rounded';
export const isWalk = it => !!(it && Array.isArray(it.line) && it.line.length >= 2);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], len = v => Math.hypot(v[0], v[1]);
/** fillet geometry per interior vertex: { i, R, t (tangent length), th (deflection, rad) } */
export function fillets(it) {
  const P = it.line, out = []; if (it.corner !== 'rounded') return out;
  const L = P.slice(1).map((p, i) => len(sub(p, P[i])));
  for (let i = 1; i < P.length - 1; i++) { const a = sub(P[i], P[i - 1]), b = sub(P[i + 1], P[i]), la = L[i - 1], lb = L[i];
    if (!la || !lb) continue; let th = Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1]) / (la * lb)))); if (th < 1e-4) continue; th = Math.min(th, Math.PI - 1e-3);
    const tn = Math.tan(th / 2), avail = Math.min(i === 1 ? la - Math.min(WALK.straight, la / 2) : la / 2, i === P.length - 2 ? lb - Math.min(WALK.straight, lb / 2) : lb / 2); // v21b: ends stay straight for 3 ft (out of the door)
    const R = Math.max(Math.min(WALK.radius, avail / tn), 0); out.push({ i, R, t: R * tn, th }); }
  return out;
}
/** exact centre-line length (fillet arcs included) */
export function walkLength(it) { if (!isWalk(it)) return 0; const P = it.line; let L = 0; for (let i = 1; i < P.length; i++) L += len(sub(P[i], P[i - 1]));
  for (const f of fillets(it)) L += f.R * f.th - 2 * f.t; return L; }
/** exact measures: paver area, edge restraint (both sides + any free end; ends at the house need none) */
export function walkMeasure(it) { const L = walkLength(it), w = Math.abs(+it.w || 0), ends = (it.dest === 'loop' ? 0 : 1);
  return { length: L, area: w * L, edging: 2 * L + ends * w, perimeter: 2 * L + ends * w }; }
/** sampled centre line (arcs subdivided) for drawing and distance checks */
export function walkPoints(it, step = .5) {
  if (!isWalk(it)) return []; const P = it.line, F = new Map(fillets(it).map(f => [f.i, f])), out = [P[0]];
  for (let i = 1; i < P.length; i++) { const f = F.get(i);
    if (!f || f.R < 1e-6) { out.push(P[i]); continue; }
    const a = sub(P[i], P[i - 1]), b = sub(P[i + 1], P[i]), ua = [a[0] / len(a), a[1] / len(a)], ub = [b[0] / len(b), b[1] / len(b)];
    const s = [P[i][0] - ua[0] * f.t, P[i][1] - ua[1] * f.t], e = [P[i][0] + ub[0] * f.t, P[i][1] + ub[1] * f.t];
    const cr = ua[0] * ub[1] - ua[1] * ub[0], nrm = cr > 0 ? [-ua[1], ua[0]] : [ua[1], -ua[0]], c = [s[0] + nrm[0] * f.R, s[1] + nrm[1] * f.R];
    const a0 = Math.atan2(s[1] - c[1], s[0] - c[0]), n = Math.max(2, Math.ceil(f.R * f.th / step)), sg = cr > 0 ? 1 : -1;
    out.push(s); for (let k = 1; k < n; k++) { const an = a0 + sg * f.th * k / n; out.push([c[0] + f.R * Math.cos(an), c[1] + f.R * Math.sin(an)]); } out.push(e); }
  return out;
}
function segDist(p, a, b) { const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz; let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dz - p[1]); }
/** distance from point [x,z] to the walkway centre line */
export function distToWalk(p, it) { const S = walkPoints(it); let d = Infinity; for (let i = 1; i < S.length; i++) d = Math.min(d, segDist(p, S[i - 1], S[i])); return d; }
/** distance from the walkway's paved edge to a rectangle/polygon (negative = overlap) — sampled, conservative */
export function walkClearanceTo(it, poly) { const S = walkPoints(it, .25), hw = it.w / 2; let m = Infinity;
  const inside = (p, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > p[1]) !== (zj > p[1]) && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) c = !c; } return c; };
  for (const p of S) { let d = Infinity; for (let i = 0; i < poly.length; i++) d = Math.min(d, segDist(p, poly[i], poly[(i + 1) % poly.length])); m = Math.min(m, inside(p, poly) ? -d - hw : d - hw); } return m; }
/** keep d / x / z in sync after the line or width changed */
// v21b: square mode = every segment horizontal or vertical with true 90° turns. A diagonal segment gets an L corner.
export const isAxis = (a, b) => Math.abs(a[0] - b[0]) < 1e-6 || Math.abs(a[1] - b[1]) < 1e-6;
export function orthogonalize(it) { const P = it.line, out = [P[0]];
  for (let i = 1; i < P.length; i++) { const a = out[out.length - 1], b = P[i]; if (!isAxis(a, b)) { const prevH = out.length > 1 && Math.abs(out[out.length - 2][1] - a[1]) < 1e-6; out.push(prevH ? [a[0], b[1]] : [b[0], a[1]]); } out.push(b); }
  it.line = out.filter((p, i) => !i || Math.hypot(p[0] - out[i - 1][0], p[1] - out[i - 1][1]) > 1e-6); return it; }
export function syncWalk(it) { if (it.corner === 'square' && Array.isArray(it.line)) { it.line = it.line.map(p => [+(+p[0]).toFixed(2), +(+p[1]).toFixed(2)]); orthogonalize(it); } it.w = Math.max(WALK.minW - .5, Math.min(6, +it.w || WALK.defW)); it.line = it.line.map(p => [+(+p[0]).toFixed(2), +(+p[1]).toFixed(2)]);
  const xs = it.line.map(p => p[0]), zs = it.line.map(p => p[1]); it.x = +((Math.min(...xs) + Math.max(...xs)) / 2).toFixed(2); it.z = +((Math.min(...zs) + Math.max(...zs)) / 2).toFixed(2);
  it.d = +walkLength(it).toFixed(3); it.r = 0; return it; }
/**
 * genWalk(yard, { dest, width, corner, doorZ }) -> { walk, lawn:{x,z,w,d}, seat? } for the standard layout (house on the left/west
 * edge, back bed along the north edge, side bed east). Centre line kept ≥ 2 ft + half the width from the yard edges except where it
 * meets the house; it runs along bed edges, never through them.
 */
export function genWalk(yard, o = {}) {
  const W = yard.w / 2, D = yard.d / 2, w = Math.max(WALK.minW, Math.min(WALK.maxW, +o.width || WALK.defW)), hw = w / 2, e = WALK.edge + hw + .25;
  const dest = ['seat', 'bed', 'loop'].includes(o.dest) ? o.dest : 'seat', corner = o.corner === 'square' ? 'square' : 'rounded';
  const doorZ = o.doorZ ?? +(D * .15).toFixed(2), xs = -W + e + (corner === 'rounded' ? 3 : 0), zf = D - e, zf2 = zf - 1.25; // front lane wanders 1.25 ft
  const bedFront = -D + 10, sideX0 = W - 14, sideZ1 = D - 9; // back bed z ≤ -D+10, side bed x ≥ W-14, z ≤ D-9 (flow.js layout)
  let line, seat = null, lawnX1 = sideX0 - 2;
  if (dest === 'loop') { const xr = sideX0 - 2 - hw - .25, zb = bedFront + hw + .5; lawnX1 = xr - hw - .75;
    line = [[-W, doorZ], [xs, doorZ], [xs, zf], [(xs + xr) / 2, zf2], [xr, zf], [xr, zb], [(xs + xr) / 2, zb], [-W, zb]]; }
  else if (dest === 'bed') { const xe = sideX0 + 5; line = [[-W, doorZ], [xs, doorZ], [xs, zf], [-W * .35, zf2], [W * .05, zf], [xe - 4, zf2], [xe, sideZ1 + hw + .5]]; }
  else { const sw = 8, sd = Math.min(6.5, D - WALK.edge - sideZ1 - .5), sx = W - WALK.edge - sw / 2, sz = D - WALK.edge - sd / 2;
    seat = { kind: 'path', seat: true, x: +sx.toFixed(2), z: +sz.toFixed(2), r: 0, w: sw, d: +sd.toFixed(2) };
    line = [[-W, doorZ], [xs, doorZ], [xs, zf], [-W * .35, zf2], [W * .05, zf], [sx - sw / 2 + .5, sz]]; }
  if (corner === 'square') line = dest === 'loop' ? [[-W, doorZ], [xs, doorZ], [xs, zf], [line[4][0], zf], line[5], line[7]]
    : dest === 'bed' ? [[-W, doorZ], [xs, doorZ], [xs, zf], [line[6][0], zf], line[6]] : [[-W, doorZ], [xs, doorZ], [xs, zf], [line[5][0], zf]];
  if (dest === 'loop' && corner === 'rounded') line = line.filter((p, i) => i !== 6); // one long sweep back along the bed
  const walk = syncWalk({ kind: 'path', walk: true, line, w, corner, dest });
  const zLawn1 = Math.min(zf2, zf) - hw - .75, zLawn0 = dest === 'loop' ? bedFront + w + 1.25 : bedFront + 5, xLawn0 = xs + hw + .75;
  const lawn = { x: +((xLawn0 + lawnX1) / 2).toFixed(2), z: +((zLawn0 + zLawn1) / 2).toFixed(2), w: +(lawnX1 - xLawn0).toFixed(2), d: +(zLawn1 - zLawn0).toFixed(2) };
  return { walk, lawn, seat };
}
/** move one vertex (0 = the house end), add a bend in the longest segment, remove a bend — all keep d/x/z in sync */
export function moveVertex(it, i, x, z) { const P = it.line;
  if (it.corner === 'square') for (const j of [i - 1, i + 1]) { if (j < 0 || j >= P.length) continue; const horiz = Math.abs(P[j][1] - P[i][1]) < 1e-6 && Math.abs(P[j][0] - P[i][0]) > 1e-6;
    if (horiz) P[j] = [P[j][0], z]; else P[j] = [x, P[j][1]]; } // the attached segments slide with the point and stay horizontal/vertical
  P[i] = [x, z]; return syncWalk(it); }
export function addBend(it, near) { const P = it.line; let bi = 1, bl = -1;
  for (let i = 1; i < P.length; i++) { const l = len(sub(P[i], P[i - 1])), m = [(P[i][0] + P[i - 1][0]) / 2, (P[i][1] + P[i - 1][1]) / 2], s = near ? -Math.hypot(m[0] - near[0], m[1] - near[1]) : l; if (s > bl) { bl = s; bi = i; } }
  P.splice(bi, 0, [(P[bi][0] + P[bi - 1][0]) / 2, (P[bi][1] + P[bi - 1][1]) / 2]); syncWalk(it); return bi; }
export function removeBend(it, i) { if (it.line.length <= 2) return false; if (i == null || i <= 0 || i >= it.line.length - 1) i = it.line.length - 2; if (i <= 0) return false; it.line.splice(i, 1); syncWalk(it); return true; }
/** walk description for the photoreal render prompt */
export function walkText(it, mat = 'paver') { if (!isWalk(it)) return ''; const to = { seat: 'a paved seating area', bed: 'the far planting bed', loop: 'a loop that returns to the house' }[it.dest] || 'the garden';
  return `a ${Math.round(it.w * 2) / 2} ft wide ${mat} walkway that starts at the house's back door and ${it.corner === 'square' ? 'runs with crisp square turns' : 'winds in gentle curves'} through the yard to ${to}, edged on both sides`; }
