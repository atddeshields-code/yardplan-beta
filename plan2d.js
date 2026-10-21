import "./siteplan/render.js";
import { nearestPairs, tooClosePairs, edgeTarget, fixSpacing, schedule, spreadOf, spacingIssues, spacingAdvice, rectPoly } from './siteplan/spacing.js';
import { fmtFt } from './siteplan/core.js';
import { isWalk, walkPoints, walkMeasure, syncWalk, moveVertex, addBend, removeBend, cornerFor, WALK, distToWalk } from './siteplan/walkway.js';
// 2D site plan editor (top-down, SVG, no WebGL). Same design format as before (v2: yard {w,d} ft, house, items with
// kind plant|mulch|gravel|dg|path|lawn|wall|grade, x/z = center in ft from the yard center, w/d ft (plants: scale), r radians).
// Classic globals: PLANTS, PLANT_SIZE, CREDITS, fits, go, renderMaterials ($('#area')…).
const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);
const KEY = 'yardplan.design.v3', NS = 'http://www.w3.org/2000/svg';
const FEAT = {
  mulch: { name: 'Mulch bed', fill: '#7a5a3c', stroke: '#5d4430' }, gravel: { name: 'Gravel', fill: '#b9b4aa', stroke: '#8f8a80', dots: true },
  dg: { name: 'Decomposed granite', fill: '#d8c29a', stroke: '#b59e73' }, path: { name: 'Paver path / patio', fill: '#cfc6b8', stroke: '#9d9384', pavers: true },
  lawn: { name: 'Lawn', fill: '#8fc27a', stroke: '#6fa25b' }, wall: { name: 'Retaining wall', fill: '#9a9184', stroke: '#6d665c' },
};
const yard = { w: 50, d: 36 }; let meta = {}, items = [], selected = null, placing = null, placingHouse = false, house = null, grade = { cutCuYd: 0, fillCuYd: 0 }, irr = null, inited = false;
// Run 6: the on-screen plan skips plant photos until the plan is visible (Site tab) or the page is idle after load, so the
// ~11 plant JPEGs don't compete with first paint. Exports (capture → proposal PDF/PNG) always inline every photo.
let imgsLive = false;
const uid = () => Math.random().toString(36).slice(2, 9);
const svg = $('#planSvg');
const M = 6; // margin ft around the yard (house strip lives here)
const defaultHouse = () => ({ x: -yard.w / 2 - 3, z: -2, side: 'left', isDefault: true });
const getHouse = () => house || defaultHouse();
function setHouse(h) { house = h ? { x: h.x, z: h.z, side: h.side || (Math.abs(h.x) / yard.w > Math.abs(h.z) / yard.d ? (h.x < 0 ? 'left' : 'right') : (h.z < 0 ? 'back' : 'front')) } : null; draw(); window.dispatchEvent(new Event('yardplan:design')); }
function manifold() { const h = getHouse(); return { x: +Math.max(-yard.w / 2 + 1.5, Math.min(yard.w / 2 - 1.5, h.x)).toFixed(2), z: +Math.max(-yard.d / 2 + 1.5, Math.min(yard.d / 2 - 1.5, h.z)).toFixed(2) }; }
const plantW = it => (PLANT_SIZE[it.id]?.w || 3) * (it.w || 1);
const el = (tag, a = {}, kids = []) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); kids.forEach(c => e.appendChild(c)); return e; };
const txt = (s, a) => { const t = el('text', a); t.textContent = s; return t; };
const ft = v => `${Math.round(v * 10) / 10} ft`;
// v20 (Austin): plant spacing. "Show spacing" draws spread labels + nearest-neighbour and wall/edge dimensions for every plant;
// the selected plant always gets them. Default on for contractors (and the proposal plan image), off for homeowners.
const isPro = () => { const r = document.documentElement.dataset.role; return r === 'contractor' || ((!r || r === 'none') && document.body.dataset.mode === 'pro'); };
const SPKEY = () => 'yardplan.spacing.' + (isPro() ? 'pro' : 'home');
const spacingOn = () => { try { const v = localStorage.getItem(SPKEY()); return v == null ? isPro() : v === '1'; } catch { return isPro(); } };
const DIM = '#1d1d1f', WARN = '#C0262D';
function drawSpacing(target, { forExport, all }) {
  const plants = items.filter(i => i.kind === 'plant'); if (!plants.length) return;
  const sel = !forExport && selected?.kind === 'plant' ? selected : null; if (!all && !sel) return;
  const show = p => all || p === sel, warnC = forExport ? WARN : 'var(--danger, #C0262D)';
  const g = el('g', { class: 'pl-spacing', stroke: DIM, 'stroke-width': .08, fill: DIM, 'font-size': 1.0, 'font-weight': 600, 'pointer-events': 'none' });
  const placed = [];
  const lab = (s, x, y, a = {}) => txt(s, { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'middle', stroke: '#fff', 'stroke-width': .28, 'paint-order': 'stroke', ...a });
  const dimLine = (x1, z1, x2, z2, label, color = DIM) => { const L = Math.hypot(x2 - x1, z2 - z1) || 1, nx = -(z2 - z1) / L * .4, nz = (x2 - x1) / L * .4;
    g.append(el('line', { x1, y1: z1, x2, y2: z2, stroke: color }), el('line', { x1: x1 - nx, y1: z1 - nz, x2: x1 + nx, y2: z1 + nz, stroke: color }), el('line', { x1: x2 - nx, y1: z2 - nz, x2: x2 + nx, y2: z2 + nz, stroke: color }));
    // keep it uncluttered: a label that would overlap another is hidden (the line stays)
    const wTxt = label.length * .55; for (const t of [.5]) { /* v20.1: hide a label that would overlap, don't squeeze it */ const x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t;
      if (!placed.some(b => Math.abs(b.x - x) < (b.w + wTxt) / 2 + .2 && Math.abs(b.z - z) < 1.15)) { placed.push({ x, z, w: wTxt }); g.append(lab(label, x, z, { fill: color })); return; } } };
  // mature-spread labels (the circle itself is drawn with the plant)
  for (const p of plants) if (show(p)) { const r = spreadOf(p, PLANT_SIZE) / 2, s2 = fmtFt(r * 2), x = p.x, z = p.z + r + .8, w = s2.length * .47; if (all && placed.some(b => Math.abs(b.x - x) < (b.w + w) / 2 + .2 && Math.abs(b.z - z) < 1.1)) continue; placed.push({ x, z, w }); g.append(lab(s2, x, z, { 'font-size': .85, 'font-weight': 500 })); }
  // centre-to-centre to the nearest neighbour
  const pairs = nearestPairs(plants, PLANT_SIZE);
  if (sel && !all) { const i = plants.indexOf(sel); let best = null; plants.forEach((q, j) => { if (j !== i) { const d = Math.hypot(q.x - sel.x, q.z - sel.z); if (!best || d < best.dist) best = { a: i, b: j, dist: d, need: (spreadOf(sel, PLANT_SIZE) + spreadOf(q, PLANT_SIZE)) / 2 }; } }); pairs.length = 0; if (best) pairs.push({ ...best, tooClose: best.dist < best.need - 1e-6 }); }
  for (const pr of pairs) { const A = plants[pr.a], B = plants[pr.b]; if (!all && A !== sel && B !== sel) continue;
    dimLine(A.x, A.z, B.x, B.z, (pr.tooClose ? '⚠ ' : '') + fmtFt(pr.dist), pr.tooClose ? warnC : DIM); }
  // shrubs and trees: distance to the nearest wall or yard/lot edge
  const walls = items.filter(i => i.kind === 'wall'), lot = meta.site?.lot;
  for (const p of plants) { if (!show(p) || PLANTS.find(q => q.id === p.id)?.type !== 'tree') continue; const t = edgeTarget(p, { yard, lot, walls }); if (!t || t.dist >= spreadOf(p, PLANT_SIZE) / 2 - .05) continue; // v20.1: trees only, only when short of half the spread
    dimLine(p.x, p.z, t.to[0], t.to[1], '⚠ ' + fmtFt(t.dist) + (t.what === 'wall' ? ' to wall' : ' to edge'), warnC); }
  target.appendChild(g);
}
function draw(target = svg, { forExport = false, imgs = {}, spacing = null } = {}) {
  const SP = meta.site && window.SiteRender, SV = SP ? window.SiteRender.viewBox(meta.site) : null;
  const W = SP ? SV.w : yard.w + 2 * M, H = SP ? SV.h : yard.d + 2 * M; target.setAttribute('viewBox', SP ? `${SV.x} ${SV.y} ${SV.w} ${SV.h}` : `${-W / 2} ${-H / 2} ${W} ${H}`); target.replaceChildren();
  const defs = el('defs'); target.appendChild(defs);
  defs.appendChild(el('pattern', { id: 'pv', width: 2, height: 2, patternUnits: 'userSpaceOnUse' }, [el('rect', { width: 2, height: 2, fill: FEAT.path.fill }), el('path', { d: 'M0 0H2M0 0V2', stroke: '#fff', 'stroke-width': .12, opacity: .8 })]));
  defs.appendChild(el('pattern', { id: 'gv', width: 1.2, height: 1.2, patternUnits: 'userSpaceOnUse' }, [el('rect', { width: 1.2, height: 1.2, fill: FEAT.gravel.fill }), el('circle', { cx: .3, cy: .4, r: .12, fill: '#8f8a80' }), el('circle', { cx: .9, cy: .9, r: .1, fill: '#e3dfd6' })]));
  // surround + house strip
  target.appendChild(el('rect', SP ? { x: SV.x, y: SV.y, width: W, height: H, fill: forExport ? '#ffffff' : 'var(--plan-bg, #f4f4f2)' } : { x: -W / 2, y: -H / 2, width: W, height: H, fill: forExport ? '#ffffff' : 'var(--plan-bg, #f4f4f2)' }));
  if (SP) { const g0 = el('g', { class: 'pl-site' }); g0.innerHTML = window.SiteRender.base(meta.site, { skipTypes: ['lawn', 'bed', 'gravel'] }); target.appendChild(g0); }
  if (!SP) {
  const h = getHouse(), side = h.side || 'left', hs = 4.5;
  const hr = side === 'left' ? { x: -yard.w / 2 - hs - .6, y: -yard.d / 2, width: hs, height: yard.d } : side === 'right' ? { x: yard.w / 2 + .6, y: -yard.d / 2, width: hs, height: yard.d } : side === 'back' ? { x: -yard.w / 2, y: -yard.d / 2 - hs - .6, width: yard.w, height: hs } : { x: -yard.w / 2, y: yard.d / 2 + .6, width: yard.w, height: hs };
  target.appendChild(el('rect', { ...hr, fill: '#d9d9de', stroke: '#9a9aa2', 'stroke-width': .15, rx: .3 }));
  target.appendChild(txt('House', { x: hr.x + hr.width / 2, y: hr.y + hr.height / 2, 'font-size': 1.3, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: '#55555c', 'font-weight': 600, transform: side === 'left' || side === 'right' ? `rotate(-90 ${hr.x + hr.width / 2} ${hr.y + hr.height / 2})` : '' }));
  // yard (lawn base) + 5 ft grid
  target.appendChild(el('rect', { x: -yard.w / 2, y: -yard.d / 2, width: yard.w, height: yard.d, fill: '#a9d394', stroke: '#5e8f4c', 'stroke-width': .2 }));
  const grid = el('g', { stroke: '#ffffff', 'stroke-width': .06, opacity: .45 });
  for (let x = -yard.w / 2 + 5; x < yard.w / 2; x += 5) grid.appendChild(el('line', { x1: x, y1: -yard.d / 2, x2: x, y2: yard.d / 2 }));
  for (let z = -yard.d / 2 + 5; z < yard.d / 2; z += 5) grid.appendChild(el('line', { x1: -yard.w / 2, y1: z, x2: yard.w / 2, y2: z }));
  target.appendChild(grid);
  }
  // hardscape / beds first, plants on top (big first so small ones stay visible)
  const live = forExport || imgsLive || (target === svg && svg.getClientRects().length > 0 && (imgsLive = true));
  let vtxG = null; const order = [...items].sort((a, b) => (a.kind === 'plant') - (b.kind === 'plant') || (a.kind === 'plant' ? plantW(b) - plantW(a) : 0));
  for (const it of order) {
    const g = el('g', { 'data-uid': it.uid, class: 'pl-item' + (it === selected ? ' sel' : ''), transform: `translate(${it.x} ${it.z}) rotate(${-(it.r || 0) * 180 / Math.PI})` });
    if (it.kind === 'plant') {
      const r = plantW(it) / 2, p = PLANTS.find(q => q.id === it.id), src = imgs[it.id] || (live && CREDITS[it.id] ? `img/plants/${it.id}.jpg` : null), cid = 'c' + it.uid;
      g.appendChild(el('circle', { r, fill: p?.type === 'tree' ? 'rgba(46,110,52,.30)' : 'rgba(46,110,52,.45)', stroke: '#2e6e34', 'stroke-width': .12 }));
      const ir = Math.min(r * .72, 2.4, Math.max(.7, r * .6));
      if (src) { defs.appendChild(el('clipPath', { id: cid }, [el('circle', { r: ir })])); const im = el('image', { href: src, x: -ir, y: -ir, width: ir * 2, height: ir * 2, 'clip-path': `url(#${cid})`, preserveAspectRatio: 'xMidYMid slice' }); g.appendChild(im); g.appendChild(el('circle', { r: ir, fill: 'none', stroke: '#fff', 'stroke-width': .1 })); }
      else g.appendChild(txt(p?.icon || '•', { 'font-size': ir, 'text-anchor': 'middle', 'dominant-baseline': 'central' }));
    } else if (isWalk(it)) { // v21: walkway polyline from the house (paver strip + edge restraint), corners square or rounded
      const f = FEAT[it.kind] || FEAT.path, S = walkPoints(it), d = 'M' + S.map(p => p.map(v => +v.toFixed(3)).join(' ')).join('L'), j = it.corner === 'rounded' ? 'round' : 'miter';
      g.setAttribute('transform', ''); g.setAttribute('class', g.getAttribute('class') + ' pl-walk'); g.dataset.corner = it.corner || 'square';
      g.append(el('path', { d, fill: 'none', stroke: f.stroke, 'stroke-width': it.w + .3, 'stroke-linejoin': j, 'stroke-miterlimit': 10, 'stroke-linecap': 'butt' }),
        el('path', { d, fill: 'none', stroke: f.pavers ? 'url(#pv)' : f.dots ? 'url(#gv)' : f.fill, 'stroke-width': it.w, 'stroke-linejoin': j, 'stroke-miterlimit': 10, 'stroke-linecap': 'butt', class: 'pl-walk__fill' }));
      if (it === selected && !forExport) { g.append(el('path', { d, fill: 'none', stroke: '#0B6B3A', 'stroke-width': .18, 'stroke-dasharray': '.6 .4' }));
        vtxG = el('g', { class: 'pl-item pl-vtxs', 'data-uid': it.uid }); it.line.forEach((p, i) => vtxG.append(el('circle', { cx: p[0], cy: p[1], r: i ? .75 : .95, class: 'pl-vtx' + (i === selV ? ' on' : ''), 'data-i': i, fill: i ? '#fff' : '#0B6B3A', stroke: '#0B6B3A', 'stroke-width': .2 }))); }
    } else if (it.pts) {
      const f = FEAT[it.kind] || FEAT.mulch; g.setAttribute('transform', '');
      g.appendChild(el('polygon', { points: it.pts.map(p => p.join(',')).join(' '), fill: f.pavers ? 'url(#pv)' : f.dots ? 'url(#gv)' : f.fill, 'fill-opacity': it.existing ? .75 : 1, stroke: f.stroke, 'stroke-width': .15, 'stroke-linejoin': 'round' }));
    } else {
      const f = FEAT[it.kind] || FEAT.mulch, wd = it.kind === 'wall' ? Math.max(.8, it.d || 1) : it.d;
      g.appendChild(el('rect', { x: -it.w / 2, y: -wd / 2, width: it.w, height: wd, rx: it.kind === 'mulch' || it.kind === 'lawn' ? Math.min(1.5, wd / 3) : .15, fill: f.pavers ? 'url(#pv)' : f.dots ? 'url(#gv)' : f.fill, stroke: f.stroke, 'stroke-width': .15 }));
    }
    if (it === selected && !forExport && !it.pts && !isWalk(it)) {
      const bw = it.kind === 'plant' ? plantW(it) : it.w, bd = it.kind === 'plant' ? plantW(it) : (it.kind === 'wall' ? Math.max(.8, it.d || 1) : it.d);
      g.appendChild(el('rect', { x: -bw / 2 - .4, y: -bd / 2 - .4, width: bw + .8, height: bd + .8, fill: 'none', stroke: '#0B6B3A', 'stroke-width': .18, 'stroke-dasharray': '.6 .4', rx: it.kind === 'plant' ? bw / 2 + .4 : .4 }));
    }
    target.appendChild(g);
  }
  if (vtxG) target.appendChild(vtxG); // v21b: walkway handles on top of patios/plants so every point can be grabbed
  drawSpacing(target, { forExport, all: spacing ?? spacingOn() });
  // irrigation overlay (zones, emitters, heads)
  if (irr?.overlay && !forExport) {
    const ig = el('g', { class: 'pl-irr', 'pointer-events': 'none' });
    for (const z of irr.overlay.zones) { const c = z.color || '#2a7';
      if (z.outline?.length > 2) ig.appendChild(el('polygon', { points: z.outline.map(([x, zz]) => `${x},${zz}`).join(' '), fill: c, 'fill-opacity': .14, stroke: c, 'stroke-width': .18, 'stroke-dasharray': '1 .6' }));
      for (const e of z.emitters || []) { const [x, zz] = Array.isArray(e) ? e : [e.x, e.z]; ig.appendChild(el('circle', { cx: x, cy: zz, r: .22, fill: c })); }
      for (const hd of z.heads || []) { const [x, zz, r] = Array.isArray(hd) ? hd : [hd.x, hd.z, hd.radius || hd.r || 12]; ig.appendChild(el('circle', { cx: x, cy: zz, r, fill: 'none', stroke: c, 'stroke-width': .12, opacity: .7 })); ig.appendChild(el('circle', { cx: x, cy: zz, r: .35, fill: '#222' })); } }
    target.appendChild(ig);
  }
  // valve manifold marker
  if (irr || placingHouse || house) { const m = manifold(); target.appendChild(el('g', { transform: `translate(${m.x} ${m.z})`, 'pointer-events': 'none' }, [el('rect', { x: -.9, y: -.6, width: 1.8, height: 1.2, rx: .25, fill: '#0B6B3A', stroke: '#fff', 'stroke-width': .12 }), txt('Valves', { y: -1, 'font-size': .9, 'text-anchor': 'middle', fill: '#1d1d1f', 'font-weight': 600 })])); }
  if (SP) { const g1 = el('g', { class: 'pl-site-ov' }); g1.innerHTML = window.SiteRender.overlay(meta.site, { forExport, vb: SV, sub: meta.site.label || '', attribution: meta.site.attribution || '' }); target.appendChild(g1); if (target === svg) refreshList(); return target; }
  // dimensions
  const dim = el('g', { stroke: '#1d1d1f', 'stroke-width': .08, fill: '#1d1d1f', 'font-size': 1.15, 'font-weight': 600, 'pointer-events': 'none' }), yT = yard.d / 2 + 2.2, xR = yard.w / 2 + 2.2;
  if ((getHouse().side || 'left') === 'front') { /* keep dims on top when the house is in front */ }
  dim.append(el('line', { x1: -yard.w / 2, y1: yT, x2: yard.w / 2, y2: yT }), el('line', { x1: -yard.w / 2, y1: yT - .5, x2: -yard.w / 2, y2: yT + .5 }), el('line', { x1: yard.w / 2, y1: yT - .5, x2: yard.w / 2, y2: yT + .5 }));
  dim.append(txt(ft(yard.w), { x: 0, y: yT + 1.7, 'text-anchor': 'middle', stroke: 'none' }));
  if ((getHouse().side || 'left') !== 'right') { dim.append(el('line', { x1: xR, y1: -yard.d / 2, x2: xR, y2: yard.d / 2 }), el('line', { x1: xR - .5, y1: -yard.d / 2, x2: xR + .5, y2: -yard.d / 2 }), el('line', { x1: xR - .5, y1: yard.d / 2, x2: xR + .5, y2: yard.d / 2 }));
    dim.append(txt(ft(yard.d), { x: xR + .6, y: 0, stroke: 'none', transform: `rotate(-90 ${xR + .6} 0)`, 'text-anchor': 'middle', dy: -.4 })); }
  if (selected && !forExport && selected.kind !== 'plant' && !isWalk(selected)) { const s = selected, /* v20: plants get their spread label from the spacing layer */ bw = s.kind === 'plant' ? plantW(s) : s.w, bd = s.kind === 'plant' ? plantW(s) : s.d;
    dim.append(txt(s.kind === 'plant' ? `${ft(bw)} wide` : `${ft(bw)} × ${ft(bd)}`, { x: s.x, y: s.z - bd / 2 - 1, 'text-anchor': 'middle', stroke: '#fff', 'stroke-width': .3, 'paint-order': 'stroke' })); }
  // north arrow + scale bar
  const nx = -W / 2 + 2, ny = -H / 2 + 2.2;
  dim.append(el('path', { d: `M${nx} ${ny - 1.2}L${nx + .7} ${ny + .6}L${nx} ${ny + .2}L${nx - .7} ${ny + .6}Z`, stroke: 'none' }), txt('N', { x: nx, y: ny - 1.5, 'text-anchor': 'middle', stroke: 'none', 'font-size': .9 }));
  const sx = -W / 2 + 4; dim.append(el('rect', { x: sx, y: H / 2 - 1.6, width: 10, height: .35, stroke: 'none' }), txt('10 ft', { x: sx + 5, y: H / 2 - 2, 'text-anchor': 'middle', stroke: 'none', 'font-size': .9 }));
  target.appendChild(dim);
  if (target === svg) refreshList();
  return target;
}
// ---- interaction ----
function toFt(e) { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const q = p.matrixTransform(svg.getScreenCTM().inverse()); return { x: q.x, z: q.y }; }
const clampX = x => Math.max(-yard.w / 2, Math.min(yard.w / 2, x)), clampZ = z => Math.max(-yard.d / 2, Math.min(yard.d / 2, z));
let drag = null;
svg.addEventListener('pointerdown', e => {
  const p = toFt(e);
  if (placingHouse) { setHouse({ x: p.x, z: p.z }); placingHouse = false; $('#plHouse').classList.remove('on'); hint('Valve spot set. The irrigation plan starts here.'); return; }
  if (placing) { if (Math.abs(p.x) > yard.w / 2 || Math.abs(p.z) > yard.d / 2) return hint('Tap inside the yard.'); const it = { uid: uid(), kind: 'plant', id: placing, x: +p.x.toFixed(2), z: +p.z.toFixed(2), r: 0, w: 1, d: 1 }; items.push(it); select(it); changed(); hint(`Placed ${PLANTS.find(q => q.id === placing).name}. Tap again to add more.`); return; }
  const g = e.target.closest('.pl-item'); const it = g && items.find(i => i.uid === g.dataset.uid), v = e.target.closest('.pl-vtx');
  if (it && v && isWalk(it)) { selV = +v.dataset.i; svg.setPointerCapture(e.pointerId); drag = { it, vtx: selV, moved: false }; select(it); return; }
  if (it !== selected) selV = -1; select(it || null); if (it) { svg.setPointerCapture(e.pointerId); drag = { it, dx: p.x - it.x, dz: p.z - it.z, moved: false, x0: p.x, z0: p.z, line0: it.line ? it.line.map(q => [...q]) : null }; }
});
svg.addEventListener('pointermove', e => { if (!drag || drag.it.pts) return; const p = toFt(e);
  if (drag.vtx != null) { moveVertex(drag.it, drag.vtx, +clampX(p.x).toFixed(2), +clampZ(p.z).toFixed(2)); drag.moved = true; walkInfo(); draw(); return; }
  if (drag.line0) { const dx = p.x - drag.x0, dz = p.z - drag.z0; drag.it.line = drag.line0.map(q => [clampX(q[0] + dx), clampZ(q[1] + dz)]); syncWalk(drag.it); drag.moved = true; draw(); return; } drag.it.x = +clampX(p.x - drag.dx).toFixed(2); drag.it.z = +clampZ(p.z - drag.dz).toFixed(2); drag.moved = true; draw(); });
svg.addEventListener('pointerup', () => { if (drag?.moved) changed(); drag = null; });
svg.addEventListener('pointercancel', () => { drag = null; });
function select(it) { selected = it; const s = !!it; $$('.pl-edit').forEach(b => b.disabled = !s); $('#plSel').textContent = it ? (it.kind === 'plant' ? `${PLANTS.find(p => p.id === it.id)?.name} · ${ft(plantW(it))} wide` : (isWalk(it) ? `Walkway · ${ft(it.w)} wide × ${ft(it.d)} long` : `${FEAT[it.kind]?.name || it.kind} · ${ft(it.w)} × ${ft(it.d)}`)) : 'Nothing selected';
  const wk = isWalk(it); $('#plWalkEd').hidden = !wk; if (wk) { $('#plWalkW').value = it.w; $('#plWalkC').value = it.corner || 'square'; walkInfo(); }
  const w = it?.kind === 'wall'; $('#plWallEd').hidden = !w; if (w) { $('#plWallH').value = it.h; $('#plWallF').value = it.footing; $('#plWallS').value = it.surcharge || ''; } draw(); }
function hint(t) { $('#plHint').textContent = t; }
function setPlacing(id) { placing = id; placingHouse = false; $('#plHouse').classList.remove('on'); $$('#paletteSite button').forEach(b => b.classList.toggle('on', b.dataset.id === id)); hint(id ? `Tap the plan to place ${PLANTS.find(p => p.id === id).name}. Tap it again below to stop.` : 'Tap a plant below, then tap the plan. Drag anything to move it.'); }
function renderPalette() { $('#paletteSite').innerHTML = PLANTS.filter(p => typeof fits !== 'function' || fits(p)).map(p => `<button data-id="${p.id}" class="${p.id === placing ? 'on' : ''}">${CREDITS[p.id] ? `<img src="img/plants/${p.id}.jpg" alt="" loading="lazy" decoding="async">` : `<span class="fbr">${p.icon}</span>`}${p.name}<small>${PLANT_SIZE[p.id]?.w || '?'} ft wide</small></button>`).join(''); }
$('#paletteSite').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setPlacing(placing === b.dataset.id ? null : b.dataset.id); });
function addFeature(kind, x, z, w, d) { const it = { uid: uid(), kind, x, z, w, d, r: 0, ...(kind === 'wall' ? { h: 2.5, footing: .5, surcharge: false } : {}) }; items.push(it); setPlacing(null); select(it); changed(); }
$('#plPath').onclick = () => addFeature('path', yard.w * .25, yard.d * .2, Math.min(10, yard.w * .3), Math.min(8, yard.d * .3));
// v21: walkway editing. The first point is the house end (back door / patio edge); drag any point, add or remove a bend, set width.
let selV = -1;
function walkInfo() { const it = selected; if (!isWalk(it)) return; const m = walkMeasure(it); $('#plWalkInfo').textContent = `${Math.round(m.area)} sq ft of pavers · ${Math.round(m.edging)} ft of edge restraint · ${it.line.length - 2} bend${it.line.length === 3 ? '' : 's'}`; }
function walkFromHouse() { const h = getHouse(), side = h.side || 'left', W = yard.w / 2, D = yard.d / 2, e = WALK.edge + WALK.defW / 2 + .25, cl = (v, a) => Math.max(-a + e, Math.min(a - e, v));
  const door = side === 'left' ? [-W, cl(h.z, D)] : side === 'right' ? [W, cl(h.z, D)] : side === 'back' ? [cl(h.x, W), -D] : [cl(h.x, W), D];
  const inn = side === 'left' ? [-W + e, door[1]] : side === 'right' ? [W - e, door[1]] : side === 'back' ? [door[0], -D + e] : [door[0], D - e];
  const end = side === 'left' || side === 'right' ? [0, door[1] > 0 ? D - e - 2 : -D + e + 2] : [door[0] > 0 ? -W * .4 : W * .4, 0];
  const mid = side === 'left' || side === 'right' ? [inn[0], end[1]] : [end[0], inn[1]];
  return syncWalk({ uid: uid(), kind: 'path', walk: true, line: [door, inn, mid, end], w: WALK.defW, corner: cornerFor(meta.style), dest: 'bed' }); }
$('#plWalk').onclick = () => { const it = walkFromHouse(); items.push(it); setPlacing(null); selV = -1; select(it); changed(); hint('Walkway added from the house. Drag its points to route it; the filled point is the house end.'); };
$('#plWalkW').oninput = e => { if (isWalk(selected)) { selected.w = Math.max(3, Math.min(6, +e.target.value || WALK.defW)); syncWalk(selected); walkInfo(); changed(); draw(); } };
$('#plWalkC').onchange = e => { if (isWalk(selected)) { selected.corner = e.target.value === 'rounded' ? 'rounded' : 'square'; syncWalk(selected); walkInfo(); changed(); draw(); } };
$('#plBendAdd').onclick = () => { if (!isWalk(selected)) return; selV = addBend(selected); walkInfo(); changed(); draw(); hint('Bend added. Drag it to shape the walkway.'); };
$('#plBendDel').onclick = () => { if (!isWalk(selected)) return; if (removeBend(selected, selV > 0 ? selV : null)) { selV = -1; walkInfo(); changed(); draw(); hint('Bend removed.'); } else hint('A walkway needs at least a start and an end.'); };
$('#plMulch').onclick = () => addFeature('mulch', -yard.w * .2, -yard.d * .25, Math.min(14, yard.w * .4), 6);
$('#plGravel').onclick = () => addFeature('gravel', yard.w * .2, -yard.d * .2, Math.min(10, yard.w * .3), 6);
$('#plDg').onclick = () => addFeature('dg', 0, 0, Math.min(12, yard.w * .3), 8);
$('#plWall').onclick = () => addFeature('wall', 0, -yard.d * .38, Math.min(20, yard.w * .5), 1);
$('#plHouse').onclick = () => { setPlacing(null); placingHouse = !placingHouse; $('#plHouse').classList.toggle('on', placingHouse); draw(); hint(placingHouse ? 'Tap the spot by the house where the irrigation controller and valves go.' : ''); };
$('#plRot').onclick = () => { if (selected && selected.kind !== 'plant' && !isWalk(selected)) { selected.r = ((selected.r || 0) + Math.PI / 2) % (2 * Math.PI); [selected.w, selected.d] = [selected.w, selected.d]; changed(); draw(); } };
const resize = k => { if (!selected) return; if (isWalk(selected)) { selected.w = Math.max(3, Math.min(6, +(selected.w * k).toFixed(1))); syncWalk(selected); select(selected); changed(); return; } if (selected.kind === 'plant') selected.w = selected.d = Math.max(.4, Math.min(3, (selected.w || 1) * k)); else { selected.w = +Math.max(1, selected.w * k).toFixed(1); if (selected.kind !== 'wall') selected.d = +Math.max(1, selected.d * k).toFixed(1); } select(selected); changed(); };
$('#plGrow').onclick = () => resize(1.2); $('#plShrink').onclick = () => resize(1 / 1.2);
$('#plDel').onclick = () => { if (!selected) return; items = items.filter(i => i !== selected); select(null); changed(); };
$('#plWallH').oninput = e => { if (selected?.kind === 'wall') { selected.h = Math.min(12, Math.max(.5, +e.target.value || 2.5)); changed(); } };
$('#plWallF').oninput = e => { if (selected?.kind === 'wall') { selected.footing = Math.min(6, Math.max(0, +e.target.value || 0)); changed(); } };
$('#plWallS').onchange = e => { if (selected?.kind === 'wall') { selected.surcharge = e.target.value || false; changed(); } };
for (const [id, key] of [['#plCut', 'cutCuYd'], ['#plFill', 'fillCuYd']]) $(id).oninput = e => { grade[key] = Math.min(100000, Math.max(0, +e.target.value || 0)); changed(); };
$('#plSize').onsubmit = e => { e.preventDefault(); yard.w = Math.max(10, Math.min(300, +$('#plW').value || 50)); yard.d = Math.max(10, Math.min(300, +$('#plD').value || 36)); $('#plW').value = yard.w; $('#plD').value = yard.d; changed(); draw(); };
let saveT; function changed() { clearTimeout(saveT); saveT = setTimeout(() => { try { lsSet(KEY, JSON.stringify(serialize())); } catch {} window.dispatchEvent(new Event('yardplan:design')); }, 250); refreshList(); }
function refreshList() {
  const plants = items.filter(o => o.kind === 'plant'), counts = {}; plants.forEach(o => counts[o.id] = (counts[o.id] || 0) + 1);
  const area = k => items.filter(o => o.kind === k).reduce((s, o) => s + o.w * o.d, 0), A = { mulch: area('mulch'), path: area('path'), gravel: area('gravel'), dg: area('dg') };
  $('#y3count').textContent = plants.length;
  $('#plList').innerHTML = (Object.keys(counts).length ? Object.entries(counts).map(([id, n]) => { const p = PLANTS.find(x => x.id === id);
    return `<li><img src="img/plants/${id}.jpg" alt="" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'"><span><b>${p?.name || id}</b><small>${PLANT_SIZE[id]?.h} ft tall × ${PLANT_SIZE[id]?.w} ft wide · ${p?.type || ''}</small></span><em>×${n}</em></li>`; }).join('') : '<li class="small">No plants yet. Pick one below and tap the plan.</li>')
    + Object.entries(A).filter(([, v]) => v).map(([k, v]) => `<li class="ft"><i style="background:${FEAT[k].fill}"></i><span><b>${FEAT[k].name}</b><small>${v.toFixed(0)} sq ft</small></span></li>`).join('')
    + items.filter(o => o.kind === 'wall').map(o => `<li class="ft"><i style="background:${FEAT.wall.fill}"></i><span><b>Retaining wall</b><small>${o.w.toFixed(0)} ft long × ${o.h} ft high + ${o.footing} ft footing${o.surcharge ? ' · load: ' + o.surcharge : ''}</small></span></li>`).join('')
    + (grade.cutCuYd || grade.fillCuYd ? `<li class="ft"><i style="background:#8a6a4a"></i><span><b>Grading</b><small>${grade.cutCuYd} cu yd cut · ${grade.fillCuYd} cu yd fill</small></span></li>` : '');
  Object.assign($('#plEst').dataset, { mulch: A.mulch, path: A.path, gravel: A.gravel });
  renderSpacingUi(plants);
}
// v20: too-close warning + Fix spacing, and the plant schedule (Site view)
function spacingCtx() { const site = meta.site, H = site?.shapes?.find(x => x.type === 'house');
  const zones = items.filter(i => ['mulch', 'gravel', 'dg'].includes(i.kind) && !isWalk(i)).map(i => ({ kind: i.kind, poly: i.pts || rectPoly(i.x, i.z, i.w, i.d, i.r || 0) }));
  return { yard, lot: site?.lot, house: H?.pts || null, zones, walks: items.filter(isWalk) }; }
const nameOf = id => PLANTS.find(p => p.id === id)?.name || id;
function renderSpacingUi(plants) {
  const w = $('#plSpaceWarn'), iss = spacingIssues(plants, PLANT_SIZE, spacingCtx()), n = iss.pairs.length + iss.room.length;
  if (w) { w.hidden = !n; if (n) { const adv = spacingAdvice(plants, iss, nameOf, PLANT_SIZE);
    $('#plSpaceTxt').textContent = `${iss.pairs.length ? `${iss.pairs.length} pair${iss.pairs.length === 1 ? ' is' : 's are'} closer than their mature spread` : ''}${iss.pairs.length && iss.room.length ? ', and ' : ''}${iss.room.length ? `${iss.room.length} plant${iss.room.length === 1 ? ' is' : 's are'} too close to the yard edge, house or walkway` : ''}. ${adv[0]}`; } }
  const t = $('#plSched'); if (!t) return; const rows = schedule(plants, PLANTS, PLANT_SIZE);
  t.innerHTML = '<caption class="sr-only">Plant schedule</caption><thead><tr><th scope="col">Plant</th><th scope="col" class="n">Qty</th><th scope="col" class="n">Spacing (on center)</th><th scope="col" class="n">Mature size</th></tr></thead><tbody>'
    + (rows.length ? rows.map(r => `<tr><td>${esc(r.name)}${r.sci ? `<div class="small"><i>${esc(r.sci)}</i></div>` : ''}</td><td class="n">${r.qty}</td><td class="n">${fmtFt(r.oc)}</td><td class="n">${r.h ? fmtFt(r.h) + ' tall × ' : ''}${fmtFt(r.w)} wide</td></tr>`).join('') : '<tr><td colspan="4" class="small">No plants yet.</td></tr>') + '</tbody>';
}
// v20.1: Fix spacing keeps every centre in the yard, half a spread from the edge and house, in its bed where possible; pairs that
// can't both fit are left where they were and reported with a remove/swap suggestion instead of being forced apart.
function fixPlantSpacing() { const plants = items.filter(i => i.kind === 'plant');
  const r = fixSpacing(plants, PLANT_SIZE, spacingCtx()); changed(); draw(); const adv = spacingAdvice(plants, r, nameOf, PLANT_SIZE);
  hint((r.moved ? `Moved ${r.moved} plant${r.moved === 1 ? '' : 's'}. ` : '') + (adv.length ? `${adv.length} still need${adv.length === 1 ? 's' : ''} more room: ${adv[0]}${adv.length > 1 ? ` (+${adv.length - 1} more)` : ''}` : 'Every plant now has room for its mature spread.'));
  return r; }
$('#plEst').onclick = () => {
  const d = $('#plEst').dataset, mA = +d.mulch || 0, pA = +d.path || 0, gA = +d.gravel || 0, area = Math.round(mA || pA || gA || yard.w * yard.d); $('#area').value = area;
  $$('#matChecks input').forEach(c => c.checked = mA ? ['mulch', 'fabric', 'edging'].includes(c.value) : pA ? c.value === 'pavers' : gA ? ['rock', 'fabric'].includes(c.value) : c.value === 'sod');
  renderMaterials(); go('materials');
};
function serialize() { return { v: 2, ...meta, yard: { ...yard }, house: { ...getHouse(), manifold: manifold() }, items: items.map(o => ({ kind: o.kind, id: o.id, x: o.x, z: o.z, r: +(o.r || 0).toFixed(3), w: o.w ?? 1, d: o.d ?? 1, ...(o.container ? { container: o.container } : {}), ...(o.renderAnchor ? { renderAnchor: o.renderAnchor } : {}), ...(o.pts ? { pts: o.pts, existing: !!o.existing, siteId: o.siteId } : {}), ...(isWalk(o) ? { walk: true, line: o.line.map(p => [...p]), corner: o.corner || 'square', dest: o.dest || 'bed' } : {}), ...(o.seat ? { seat: true } : {}), ...(o.kind === 'wall' ? { h: o.h, footing: o.footing, surcharge: o.surcharge || false } : {}) })).concat(grade.cutCuYd || grade.fillCuYd ? [{ kind: 'grade', cutCuYd: grade.cutCuYd, fillCuYd: grade.fillCuYd }] : []) }; }
// Run 6/7: restored or saved designs are untrusted. Numbers are coerced and clamped; out-of-range values are announced politely.
const fin = (v, dflt) => { const n = typeof v === 'string' && /^\s*[+-]?Infinity\s*$/.test(v) ? +v : +v; return Number.isFinite(n) ? n : Number.isNaN(n) || v == null || typeof v === 'object' ? dflt : n; };
const clampN = (v, lo, hi, dflt, bad, label) => { const n = v == null || v === '' ? NaN : typeof v === 'object' ? NaN : +v; let o;
  if (Number.isNaN(n)) o = dflt; else o = Math.min(hi, Math.max(lo, n)); if (v != null && o !== n) bad.add(label); return o; };
function apply(data) {
  data = data && typeof data === 'object' ? data : {}; const bad = new Set();
  meta = {}; for (const k of ['style', 'containerSizes', 'budgetOpts', 'irrigation', 'site', 'includeLawn']) if (data[k] != null) meta[k] = data[k];
  const yMax = data.site ? 2000 : 300, dy = data.yard || {}, yv = (v, d) => { const n = +v; if (!(Number.isFinite(n) && n > 0)) { if (v != null) bad.add('yard size'); return d; } const o = Math.min(yMax, Math.max(10, n)); if (o !== n) bad.add('yard size'); return o; };
  yard.w = yv(dy.w, 50); yard.d = yv(dy.d, 36);
  const h = data.house; house = h && !h.isDefault && Number.isFinite(+h.x) && Number.isFinite(+h.z) && typeof h.x !== 'object' && typeof h.z !== 'object' && h.x !== '' && h.z !== '' ? { x: +h.x, z: +h.z, side: h.side } : null;
  const g = (data.items || []).find(it => it && it.kind === 'grade'); grade = g ? { cutCuYd: clampN(g.cutCuYd, 0, 100000, 0, bad, 'grading'), fillCuYd: clampN(g.fillCuYd, 0, 100000, 0, bad, 'grading') } : { cutCuYd: 0, fillCuYd: 0 };
  items = (Array.isArray(data.items) ? data.items : []).filter(it => it && it.kind !== 'grade' && (it.kind !== 'plant' || PLANT_SIZE[it.id])).map(it => { const o = { uid: uid(), ...it };
    for (const k of ['x', 'z', 'r']) if (k in o) { const n = +o[k]; o[k] = Number.isFinite(n) && typeof it[k] !== 'object' ? n : 0; } else if ((k === 'x' || k === 'z') && !o.pts) o[k] = 0;
    for (const k of ['w', 'd']) { const n = it[k] == null ? 1 : +it[k]; if (!Number.isFinite(n) || n <= 0) { if (it[k] != null) bad.add('item size'); o[k] = Number.isFinite(n) && n !== 0 ? Math.abs(n) : 1; } else o[k] = n; }
    if (o.kind === 'wall') { o.h = clampN(it.h ?? 2.5, .5, 12, 2.5, bad, 'wall height'); o.footing = clampN(it.footing ?? 0, 0, 6, 0, bad, 'wall footing'); o.surcharge = it.surcharge || false; }
    if (Array.isArray(it.line)) { const L = it.line.filter(q => Array.isArray(q) && Number.isFinite(+q[0]) && Number.isFinite(+q[1])).map(q => [+q[0], +q[1]]);
      if (L.length >= 2) { o.line = L; o.walk = true; o.corner = it.corner === 'rounded' ? 'rounded' : 'square'; syncWalk(o); } else delete o.line; }
    return o; });
  $('#plW').value = yard.w; $('#plD').value = yard.d; $('#plCut').value = grade.cutCuYd || ''; $('#plFill').value = grade.fillCuYd || ''; selected = null; draw();
  if (bad.size) { const sr = $('#srLive'); if (sr) { sr.textContent = ''; setTimeout(() => { sr.textContent = `Some saved sizes were out of range and were reset: ${[...bad].join(', ')}.`; }, 50); } }
}
$('#plSave').onclick = () => { lsSet(KEY, JSON.stringify(serialize())); hint(`Saved ${items.length} items on this device.`); };
$('#plLoad').onclick = () => { try { const d = JSON.parse(localStorage.getItem(KEY)); if (d) { apply(d); hint('Design loaded.'); } else hint('No saved design yet.'); } catch { hint('No saved design yet.'); } };
$('#plClear').onclick = () => { items = []; grade = { cutCuYd: 0, fillCuYd: 0 }; select(null); refreshList(); hint('Cleared. Your saved design stays untouched until you Save.'); };
$('#plPng').onclick = async () => { const a = document.createElement('a'); a.download = 'yardplan-plan.png'; a.href = (await capture(1600, 'image/png', .88, { spacing: spacingOn() }))[0]; a.click(); };
const DEMO = { yard: { w: 50, d: 36 }, items: [
  { kind: 'mulch', x: -4, z: -11, w: 34, d: 9, r: 0 }, { kind: 'path', x: 8, z: 6, w: 20, d: 4.5, r: 0 }, { kind: 'gravel', x: 16, z: -1, w: 10, d: 6, r: 0 },
  { kind: 'plant', id: 'japmaple', x: -16, z: -12, r: .4 }, { kind: 'plant', id: 'arborvitae', x: 21, z: -14, r: 0 }, { kind: 'plant', id: 'arborvitae', x: 17, z: -15, r: 1.2 },
  { kind: 'plant', id: 'redbud', x: 9, z: -12, r: 1 }, { kind: 'plant', id: 'oakleaf', x: -8, z: -12, r: 0 }, { kind: 'plant', id: 'boxwood', x: -3, z: -9, r: 0 }, { kind: 'plant', id: 'boxwood', x: 1, z: -9, r: 2 },
  { kind: 'plant', id: 'coneflower', x: -11, z: -8, r: 0 }, { kind: 'plant', id: 'coneflower', x: -13, z: -7.5, r: 2 }, { kind: 'plant', id: 'karlfoerster', x: 4, z: -10, r: 0 }, { kind: 'plant', id: 'karlfoerster', x: 6, z: -9, r: 1 },
  { kind: 'plant', id: 'lavender', x: 0, z: 3, r: 0 }, { kind: 'plant', id: 'lavender', x: 3, z: 3, r: 1 }, { kind: 'plant', id: 'lavender', x: 6, z: 3, r: 2 },
  { kind: 'plant', id: 'agave', x: 16, z: -1, r: 0 }, { kind: 'plant', id: 'hosta', x: -6, z: -8, r: 0 }, { kind: 'plant', id: 'redmaple', x: -18, z: 10, r: 0 }] };
function init() { if (inited) return Promise.resolve(); inited = true; let d = null; try { d = JSON.parse(localStorage.getItem(KEY)); } catch {} apply(d && d.items ? d : DEMO); renderPalette(); setPlacing(null); return Promise.resolve(); }
function setIrrigation(plan) { irr = plan || null; draw(); }
// Plan image (JPEG/PNG data URL) for proposals and export: plant photos are inlined so the SVG renders standalone.
const imgCache = {};
async function toData(url) { if (imgCache[url]) return imgCache[url]; try { const b = await (await fetch(url)).blob(); return imgCache[url] = await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); }); } catch { return null; } }
async function capture(W = 1600, type = 'image/jpeg', q = .88, o = {}) {
  init(); const ids = [...new Set(items.filter(i => i.kind === 'plant' && CREDITS[i.id]).map(i => i.id))], imgs = {};
  await Promise.all(ids.map(async id => { const d = await toData(`img/plants/${id}.jpg`); if (d) imgs[id] = d; }));
  const s = el('svg', { xmlns: NS }); s.setAttribute('font-family', 'Inter, Helvetica, Arial, sans-serif'); const keep = selected; selected = null; draw(s, { forExport: true, imgs, spacing: !!(o && o.spacing) }); selected = keep;
  const vb = s.getAttribute('viewBox').split(' ').map(Number), H = Math.round(W * vb[3] / vb[2]); s.setAttribute('width', W); s.setAttribute('height', H);
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(s)), im = new Image(); im.src = url; await im.decode();
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.drawImage(im, 0, 0, W, H); return [c.toDataURL(type, q)];
}
function goLive() { if (imgsLive) return; imgsLive = true; if (inited) draw(); }
window.onSiteShow = () => { init(); goLive(); renderPalette(); draw(); };
{ const idle = () => (window.requestIdleCallback || (f => setTimeout(f, 1)))(goLive, { timeout: 4000 }); if (document.readyState === 'complete') idle(); else window.addEventListener('load', idle, { once: true }); }
window.addEventListener('yardplan:zone', () => { if (inited) renderPalette(); });
{ const t = $('#plSpacing'); if (t) { t.checked = spacingOn(); t.onchange = () => { try { localStorage.setItem(SPKEY(), t.checked ? '1' : '0'); } catch {} draw(); }; }
  const f = $('#plFixSp'); if (f) f.onclick = fixPlantSpacing; }
window.addEventListener('yardplan:mode', () => { const t = $('#plSpacing'); if (t) t.checked = spacingOn(); });
window.planApi = { fixSpacing: fixPlantSpacing, spacingOn, ready: () => inited, whenReady: init, setIrrigation, setHouse, getHouse, manifold, serialize, apply, capture, draw: () => draw(), items: () => items, select: i => select(items[i]) };
init();
