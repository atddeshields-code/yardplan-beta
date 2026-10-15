// siteplan/editor.js — "Site plan" sheet: auto-draw from aerial, survey upload/trace, drone scale, and a 2D editor.
// Opens with window.siteApi.open({ mode: 'aerial'|'survey'|'edit', address, site, who: 'home'|'pro', onDone(site, design) }).
import { TYPES, AREA_TYPES, classify, buildSite, clipToLot, siteToDesign, rectilinear, area, centroid, dist, rot, edges, setEdgeLength, fmtFt, bbox, sid, parseCall, traverse, distanceLabels, callsIn, align2 } from './core.js';
import { base as rBase, overlay as rOverlay, viewBox } from './render.js';
import { gather, ATTR } from './sources.js';
const $ = s => document.querySelector(s), esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const NS = 'http://www.w3.org/2000/svg';
let view = { z: 1, dx: 0, dz: 0 }, S = null, opts = {}, layers = {}, cache = null, undo = [], redo = [], sel = null, mode = 'select', snap = true, ortho = true, trace = null, pick = null, show = { aerial: true, survey: true };
// ---------- markup ----------
const html = `<dialog class="sheet sheet--full sp" id="siteSheet" aria-labelledby="spT"><div class="sheet__inner sp__inner">
 <div class="sp__head"><button class="iconbtn" type="button" data-sp="close" aria-label="Close"><svg class="ico"><use href="#i-x"/></svg></button><div><h2 id="spT">Your yard from above</h2><p class="sp__src" id="spSrc"></p></div><button class="btn btn--primary btn--sm" type="button" data-sp="done" id="spDone" disabled>Use this plan</button></div>
 <div class="sp__prog" id="spProg" hidden></div>
 <div class="sp__survey" id="spSurvey" hidden></div>
 <div class="sp__stage" id="spStage"><svg id="spSvg" role="img" aria-label="Site plan"></svg><p class="sp__hint" id="spHint" aria-live="polite"></p><div class="sp__edit" id="spLen" hidden><label>Length (ft)<input id="spLenIn" class="input" inputmode="decimal"></label><button class="btn btn--primary btn--sm" type="button" data-sp="lenok">Set</button></div></div>
 <div class="sp__bar" id="spBar" role="toolbar" aria-label="Edit plan">
  <button type="button" data-sp="zin" aria-label="Zoom in">＋<span>Zoom</span></button><button type="button" data-sp="zout" aria-label="Zoom out">−<span>Out</span></button>
  <button type="button" data-sp="undo" aria-label="Undo">↶<span>Undo</span></button><button type="button" data-sp="redo" aria-label="Redo">↷<span>Redo</span></button>
  <label class="sp__sel"><span>Add</span><select id="spAdd" aria-label="Add a shape"><option value="">+ Add…</option>${['bed', 'lawn', 'patio', 'driveway', 'pool', 'house', 'gravel', 'tree', 'easement', 'setback'].map(t => `<option value="${t}">${TYPES[t].name}</option>`).join('')}<option value="trace">Trace by tapping…</option></select></label>
  <label class="sp__sel"><span>Type</span><select id="spType" aria-label="Change type of selected shape" disabled>${[...AREA_TYPES, 'setback'].map(t => `<option value="${t}">${TYPES[t].name}</option>`).join('')}</select></label>
  <button type="button" data-sp="del" id="spDel" disabled aria-label="Delete selected">✕<span>Delete</span></button>
  <button type="button" data-sp="snap" aria-pressed="true">⌗<span>Snap</span></button><button type="button" data-sp="ortho" aria-pressed="true">⊾<span>Square</span></button>
  <button type="button" data-sp="layers" id="spLayers">◐<span>Photo</span></button>
  <button type="button" data-sp="scale" id="spScaleBtn">↔<span>Set scale</span></button>
  <button type="button" data-sp="align" id="spAlignBtn" hidden>⇄<span>Align</span></button>
  <button type="button" data-sp="redraw" id="spRedraw">⟳<span>Redo auto-draw</span></button>
 </div></div></dialog>`;
function mount() { if ($('#siteSheet')) return; document.body.insertAdjacentHTML('beforeend', html); wire(); }
// ---------- progress ----------
const STEPS = [['addr', 'Finding the address'], ['lot', 'Lot lines (county parcel data)'], ['house', 'House outline (public building data)'], ['aerial', 'USDA aerial photo + near-infrared'], ['surf', 'Lawn, trees and paving'], ['draw', 'Drawing the plan']];
function prog(st) { const el = $('#spProg'); el.hidden = false; el.innerHTML = `<ol>${STEPS.map(([k, n]) => `<li data-st="${st[k] || ''}"><i aria-hidden="true"></i><span>${n}</span></li>`).join('')}</ol><p class="footnote">Public data services can take up to a minute.</p>`; }
// ---------- open ----------
export async function open(o = {}) {
  mount(); opts = o; view = { z: 1, dx: 0, dz: 0 }; undo = []; redo = []; sel = null; trace = null; pick = null; mode = 'select'; cache = o.cache || cache;
  const d = $('#siteSheet'); $('#spT').textContent = o.mode === 'survey' ? 'Use a survey' : 'Your yard from above'; $('#spSurvey').hidden = true; $('#spProg').hidden = true; $('#spDone').disabled = true;
  if (!d.open) d.showModal();
  if (o.site) { S = JSON.parse(JSON.stringify(o.site)); layers = o.layers || layers; setSrc(); render(); $('#spDone').disabled = false; if (o.mode === 'survey') surveyPanel(); return; }
  if (o.mode === 'survey') { S = null; layers = { ...(layers.aerial && o.keepAerial ? { aerial: layers.aerial } : {}) }; surveyPanel(); render(); return; }
  if (o.mode === 'drone') { S = null; layers = {}; await dronePhoto(o.file); return; }
  await autoDraw();
}
async function autoDraw() {
  const st = {}, step = (k, v) => { st[k] = v; prog(st); }; S = null; render(); hint('');
  try { step('addr', 'run'); let lat = opts.lat, lon = opts.lon, label = opts.address || '';
    if (lat == null) { const g = await window.overlayApi.geocode(opts.address); lat = g.lat; lon = g.lon; label = g.label || label; } step('addr', 'ok');
    const G = await gather({ lat, lon, address: label, onStep: step }); cache = { G, label };
    step('surf', 'run'); await new Promise(r => setTimeout(r, 30)); finishAuto(); step('surf', 'ok'); step('draw', 'ok');
    setTimeout(() => { $('#spProg').hidden = true; }, 900); $('#spDone').disabled = false;
    hint(S.lotEstimated ? 'No public lot lines here. Drag the red lot corners to match your fences, then check the dimensions.' : 'Tap a shape to edit it. Drag corners, or tap a dimension to type a length.');
  } catch (e) { console.warn(e); const k = STEPS.find(([k]) => st[k] === 'run')?.[0]; if (k) step(k, 'err');
    $('#spProg').insertAdjacentHTML('beforeend', `<div class="sp__fail"><p><b>We couldn't finish the automatic drawing.</b> ${esc(e.message || '')}</p><button class="btn btn--primary btn--sm" type="button" data-sp="manual">Draw it myself${cache?.G?.aerial ? ' over the aerial' : ''}</button> <button class="btn btn--secondary btn--sm" type="button" data-sp="retry">Try again</button></div>`); }
}
function finishAuto() { const { G, label } = cache, A = G.aerial;
  const cls = classify(A, { lot: G.lot, house: G.allBuildings || G.housesRaw, street: G.street });
  S = buildSite({ lot: G.lot, houses: G.houses, cls, label, street: G.street, lotSource: G.parcel?.source || '', houseSource: G.houses.length ? (G.buildingSource === 'osm' ? 'OpenStreetMap' : 'USA Structures') : '' });
  clipToLot(S); S.stats = cls.stats; S.attribution = [ATTR.naip, G.houses.length ? (G.buildingSource === 'osm' ? ATTR.osm : ATTR.structures) : '', G.parcel ? ATTR.sac : ''].filter(Boolean).join(' · ');
  if (!G.houses.length) S.warnHouse = true; recenter(); layers.aerial = { url: A.url, W: A.W, H: A.H, ftPerPx: A.ftPerPx, ...S._aerialPose }; delete S._aerialPose; if (G.lotEstimated) S.lotEstimated = true; setSrc(); render(); }
// buildSite rotated by S.north around the lot centroid; put the aerial image in the same frame and centre on the lot bbox
function recenter() { const G = cache.G, ref = G.lot || G.houses[0], c = ref ? centroid(ref) : [0, 0], a = -(S.north || 0);
  let p = rot([0, 0], -a, c).map((v, i) => v - c[i]); const b = bbox(S.lot), sh = [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2]; shift(S, sh);
  S._aerialPose = { cx: p[0] - sh[0], cz: p[1] - sh[1], rot: -a }; }
function shift(site, [dx, dz]) { const m = p => [+(p[0] - dx).toFixed(2), +(p[1] - dz).toFixed(2)]; site.lot = site.lot.map(m); site.shapes.forEach(s => s.pts = s.pts.map(m)); site.trees.forEach(t => { t.x = +(t.x - dx).toFixed(2); t.z = +(t.z - dz).toFixed(2); }); if (site.street) site.street = m(site.street); }
function manual() { const A = cache?.G?.aerial; $('#spProg').hidden = true;
  S = { v: 1, source: A ? 'aerial' : 'manual', approx: true, label: cache?.label || opts.address || '', north: 0, lot: [[-35, -25], [35, -25], [35, 25], [-35, 25]], shapes: [], trees: [], lotEstimated: true, attribution: A ? ATTR.naip : '' };
  if (A) layers.aerial = { url: A.url, W: A.W, H: A.H, ftPerPx: A.ftPerPx, cx: 0, cz: 0, rot: 0 };
  setSrc(); render(); $('#spDone').disabled = false; hint('Drag the red lot corners to your property lines, then add the house and beds with + Add.'); }
function setSrc() { if (!S) return; $('#spSrc').textContent = S.source === 'survey' ? `From survey${S.surveyDate ? ' dated ' + S.surveyDate : ''}` : S.source === 'drone' ? 'From your drone photo · approximate' : 'Approximate · from aerial, not a survey';
  $('#spAlignBtn').hidden = !(layers.survey && layers.aerial); $('#spRedraw').hidden = !cache?.G; }
// ---------- drawing ----------
const pts = P => P.map(p => p.join(',')).join(' ');
function vb() { const V0 = vb0(), z = view.z; if (z === 1) return V0; const w = V0.w / z, h = V0.h / z; return { x: V0.x + V0.w / 2 - w / 2 + view.dx, y: V0.y + V0.h / 2 - h / 2 + view.dz, w, h }; }
function vb0() { if (!S) { const L = layers.survey || layers.aerial; const w = L ? L.W * L.ftPerPx : 100, h = L ? L.H * L.ftPerPx : 80; return { x: -w / 2 - 4, y: -h / 2 - 4, w: w + 8, h: h + 8 }; } const v = viewBox(S); const L = layers.survey || layers.drone; if (!L || !show[layers.survey ? 'survey' : 'drone']) return v;
  const c = Math.abs(Math.cos(L.rot || 0)), sn2 = Math.abs(Math.sin(L.rot || 0)), hw = (L.W * c + L.H * sn2) * L.ftPerPx / 2, hh = (L.W * sn2 + L.H * c) * L.ftPerPx / 2;
  const x0 = Math.min(v.x, (L.cx || 0) - hw), y0 = Math.min(v.y, (L.cz || 0) - hh), x1 = Math.max(v.x + v.w, (L.cx || 0) + hw), y1 = Math.max(v.y + v.h, (L.cz || 0) + hh); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; }
function render() {
  const svg = $('#spSvg'); if (!svg) return; const V = vb(), k = Math.max(V.w, V.h) / 100; svg.setAttribute('viewBox', `${V.x} ${V.y} ${V.w} ${V.h}`); svg.style.setProperty('--k', k);
  let s = `<rect x="${V.x}" y="${V.y}" width="${V.w}" height="${V.h}" fill="var(--plan-bg,#f4f4f2)"/>`;
  for (const [key, L] of Object.entries(layers)) if (L?.url && show[key]) s += `<image href="${L.url}" x="${-L.W / 2}" y="${-L.H / 2}" width="${L.W}" height="${L.H}" transform="translate(${L.cx || 0} ${L.cz || 0}) rotate(${(L.rot || 0) * 180 / Math.PI}) scale(${L.ftPerPx})" opacity="${S ? (key === 'survey' ? .75 : .9) : 1}" preserveAspectRatio="none"/>`;
  if (S) { s += `<g class="sp-base">${rBase(S, { see: Object.keys(layers).some(k => show[k]) })}</g>`; s += rOverlay(S, { vb: V, sub: S.label, attribution: S.attribution || '' }); s += dimHits(k) + handles(k); }
  if (trace) s += `<polyline points="${pts(trace.pts)}" fill="none" stroke="#00873A" stroke-width="${.25 * k}" stroke-dasharray="${k} ${.5 * k}"/>` + trace.pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${(i ? .6 : .9) * k}" fill="${i ? '#00873A' : '#fff'}" stroke="#00873A" stroke-width="${.2 * k}" ${i ? '' : 'data-sp-close="1"'}/>`).join('');
  if (pick) s += pick.pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="${.7 * k}" fill="#e67e22" stroke="#fff" stroke-width="${.2 * k}"/>`).join('') + (pick.pts.length === 2 ? `<line x1="${pick.pts[0][0]}" y1="${pick.pts[0][1]}" x2="${pick.pts[1][0]}" y2="${pick.pts[1][1]}" stroke="#e67e22" stroke-width="${.25 * k}"/>` : '');
  svg.innerHTML = s;
  const shape = selShape(); $('#spType').disabled = !shape || shape.type === 'lot' || sel?.kind === 'tree'; if (shape && shape.type !== 'lot') $('#spType').value = shape.type; $('#spDel').disabled = !sel || sel.kind === 'lot';
  $('#spBar [data-sp=undo]').disabled = !undo.length; $('#spBar [data-sp=redo]').disabled = !redo.length;
}
const selShape = () => !sel || !S ? null : sel.kind === 'lot' ? { type: 'lot', pts: S.lot } : sel.kind === 'tree' ? null : S.shapes.find(s => s.id === sel.id);
const selPts = () => sel?.kind === 'lot' ? S.lot : selShape()?.pts;
function handles(k) { if (!sel) return ''; if (sel.kind === 'tree') { const t = S.trees.find(t => t.id === sel.id); if (!t) return ''; return `<circle cx="${t.x}" cy="${t.z}" r="${t.r}" fill="none" stroke="#00873A" stroke-width="${.25 * k}"/><circle class="sp-h" data-h="r" cx="${t.x + t.r}" cy="${t.z}" r="${.9 * k}" fill="#fff" stroke="#00873A" stroke-width="${.25 * k}"/>`; }
  const P = selPts(); if (!P) return ''; return `<polygon points="${pts(P)}" fill="rgba(0,135,58,.08)" stroke="#00873A" stroke-width="${.25 * k}" class="sp-selbody" data-body="1"/>` + P.map((p, i) => `<circle class="sp-h" data-h="${i}" cx="${p[0]}" cy="${p[1]}" r="${.9 * k}" fill="#fff" stroke="#00873A" stroke-width="${.25 * k}"/>`).join('')
    + edges(P).map(e => `<circle class="sp-mid" data-mid="${e.i}" cx="${e.mid[0]}" cy="${e.mid[1]}" r="${.55 * k}" fill="#00873A" opacity=".55"/>`).join(''); }
// tappable dimension labels for the selected shape (or the lot when nothing is selected)
function dimHits(k) { const P = sel ? selPts() : S.lot; if (!P) return ''; const c = centroid(P);
  return edges(P).filter(e => e.len >= 3).map(e => { const nx = -(e.b[1] - e.a[1]) / e.len, nz = (e.b[0] - e.a[0]) / e.len, sgn = (e.mid[0] - c[0]) * nx + (e.mid[1] - c[1]) * nz > 0 ? 1 : -1, off = (sel ? 3.6 : 2.4) * sgn, x = e.mid[0] + nx * off, z = e.mid[1] + nz * off;
    return `<g class="sp-dimhit" data-edge="${e.i}" role="button" tabindex="0" aria-label="Edge ${fmtFt(e.len)}, tap to type a length"><rect x="${x - 2.6 * k}" y="${z - 1 * k}" width="${5.2 * k}" height="${2 * k}" rx="${.6 * k}" fill="${sel ? '#00873A' : 'transparent'}" opacity="${sel ? .92 : 1}"/>${sel ? `<text x="${x}" y="${z + .45 * k}" text-anchor="middle" font-size="${1.15 * k}" fill="#fff" font-weight="700">${fmtFt(e.len)}</text>` : ''}</g>`; }).join(''); }
// ---------- edit ops ----------
const snapshot = () => JSON.stringify(S);
function commit(prev) { undo.push(prev); if (undo.length > 80) undo.shift(); redo = []; render(); }
function hint(t) { const h = $('#spHint'); if (h) h.textContent = t; }
function toFt(e) { const svg = $('#spSvg'), p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const q = p.matrixTransform(svg.getScreenCTM().inverse()); return [q.x, q.y]; }
const sn = v => snap ? Math.round(v * 2) / 2 : +v.toFixed(2);
function orthoFix(P, i, p) { if (!ortho || P.length < 3) return p; const n = P.length, a = P[(i - 1 + n) % n], b = P[(i + 1) % n]; let [x, z] = p; // align with neighbours if nearly horizontal/vertical
  for (const q of [a, b]) { if (Math.abs(q[0] - x) < 1.5) x = q[0]; if (Math.abs(q[1] - z) < 1.5) z = q[1]; } return [x, z]; }
let drag = null;
function wire() {
  const d = $('#siteSheet'), svg = $('#spSvg');
  d.addEventListener('click', e => { const b = e.target.closest('[data-sp]'); if (!b) return; const a = b.dataset.sp;
    if (a === 'zin' || a === 'zout') { view.z = Math.max(1, Math.min(8, view.z * (a === 'zin' ? 1.6 : 1 / 1.6))); if (view.z === 1) view.dx = view.dz = 0; render(); }
    if (a === 'close') d.close(); if (a === 'done') done(); if (a === 'manual') manual(); if (a === 'retry') autoDraw();
    if (a === 'undo' && undo.length) { redo.push(snapshot()); S = JSON.parse(undo.pop()); sel = null; render(); }
    if (a === 'redo' && redo.length) { undo.push(snapshot()); S = JSON.parse(redo.pop()); sel = null; render(); }
    if (a === 'del' && sel && S) { const prev = snapshot(); if (sel.kind === 'tree') S.trees = S.trees.filter(t => t.id !== sel.id); else S.shapes = S.shapes.filter(s => s.id !== sel.id); sel = null; commit(prev); }
    if (a === 'snap' || a === 'ortho') { if (a === 'snap') snap = !snap; else ortho = !ortho; b.setAttribute('aria-pressed', String(a === 'snap' ? snap : ortho)); }
    if (a === 'layers') { const any = Object.keys(layers).length; if (!any) return; const k = Object.keys(layers); const on = k.some(x => show[x]); k.forEach(x => show[x] = !on); b.setAttribute('aria-pressed', String(!on)); render(); }
    if (a === 'redraw' && cache?.G) { if (S && !confirm('Redo the automatic drawing? Your edits will be replaced (Undo brings them back).')) return; const prev = S ? snapshot() : null; finishAuto(); if (prev) undo.push(prev); render(); hint('Redrawn from the aerial.'); }
    if (a === 'scale') startScale(); if (a === 'align') startAlign(); if (a === 'lenok') applyLen();
    if (a === 'bearings') applyBearings(); if (a === 'trace-lot') startTrace('lot'); if (a === 'trace-house') startTrace('house'); if (a === 'trace-easement') startTrace('easement'); if (a === 'trace-setback') startTrace('setback');
    if (a === 'finish') finishTrace();
  });
  $('#spAdd').onchange = e => { const t = e.target.value; e.target.value = ''; if (!t) return; if (t === 'trace') return startTrace('bed'); addShape(t); };
  $('#spType').onchange = e => { const s = selShape(); if (!s || s.type === 'lot') return; const prev = snapshot(); s.type = e.target.value; if (['house', 'pool', 'driveway', 'patio'].includes(s.type)) s.pts = rectilinear(s.pts, .5); commit(prev); };
  $('#spLenIn').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyLen(); } if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); $('#spLen').hidden = true; } });
  svg.addEventListener('pointerdown', e => {
    const p = toFt(e);
    if (pick) { pick.pts.push(p); render(); pick.next(); return; }
    if (trace) { const c = e.target.closest('[data-sp-close]'); if (c && trace.pts.length > 2) return finishTrace(); trace.pts.push([sn(p[0]), sn(p[1])].map((v, i) => trace.pts.length && ortho ? orthoFix([...trace.pts, [0, 0]], trace.pts.length, [sn(p[0]), sn(p[1])])[i] : v)); render(); hint(`${trace.pts.length} points. Tap the first point or Finish to close.`); return; }
    if (!S) return;
    const dh = e.target.closest('[data-edge]'); if (dh) { openLen(+dh.dataset.edge); return; }
    const h = e.target.closest('[data-h]'), m = e.target.closest('[data-mid]');
    if (m && sel) { const prev = snapshot(), P = selPts(), i = +m.dataset.mid, a = P[i], b = P[(i + 1) % P.length]; P.splice(i + 1, 0, [sn((a[0] + b[0]) / 2), sn((a[1] + b[1]) / 2)]); drag = { kind: 'v', i: i + 1, prev, moved: true }; svg.setPointerCapture(e.pointerId); render(); return; }
    if (h && sel) { drag = { kind: h.dataset.h === 'r' ? 'r' : 'v', i: +h.dataset.h, prev: snapshot() }; svg.setPointerCapture(e.pointerId); return; }
    if (e.target.closest('[data-body]')) { drag = { kind: 'move', last: p, prev: snapshot() }; svg.setPointerCapture(e.pointerId); return; }
    const t = e.target.closest('.sp-tree'), s = e.target.closest('.sp-shape');
    if (t) sel = { kind: 'tree', id: t.dataset.sid }; else if (s) sel = { kind: 'shape', id: s.dataset.sid }; else sel = hitLot(p) ? { kind: 'lot' } : null;
    if (sel) { drag = { kind: 'move', last: p, prev: snapshot() }; svg.setPointerCapture(e.pointerId); } else if (view.z > 1) { drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, d0: [view.dx, view.dz], k: vb().w / svg.clientWidth }; svg.setPointerCapture(e.pointerId); }
    render(); const sh = selShape(); hint(sel ? sel.kind === 'tree' ? 'Tree canopy: drag to move, drag the handle to resize.' : `${sel.kind === 'lot' ? 'Lot lines' : TYPES[sh.type].name}: drag corners, tap a green length to type it, tap a dot on an edge to add a corner.` : '');
  });
  svg.addEventListener('pointermove', e => { if (!drag || !S) return; const p = toFt(e); drag.moved = true;
    if (drag.kind === 'pan') { view.dx = drag.d0[0] - (e.clientX - drag.sx) * drag.k; view.dz = drag.d0[1] - (e.clientY - drag.sy) * drag.k; render(); return; }
    if (drag.kind === 'v') { const P = selPts(); P[drag.i] = orthoFix(P, drag.i, [sn(p[0]), sn(p[1])]); }
    else if (drag.kind === 'r') { const t = S.trees.find(t => t.id === sel.id); t.r = Math.max(1, +dist([t.x, t.z], p).toFixed(1)); }
    else if (drag.kind === 'move') { const dx = p[0] - drag.last[0], dz = p[1] - drag.last[1]; drag.last = p; if (sel.kind === 'tree') { const t = S.trees.find(t => t.id === sel.id); t.x += dx; t.z += dz; } else { const P = selPts(); P.forEach(q => { q[0] += dx; q[1] += dz; }); } }
    render(); });
  const up = () => { if (drag?.kind === 'pan') { drag = null; return; } if (drag?.moved) { if (drag.kind === 'move') { const P = selPts(); if (P && snap) P.forEach(q => { q[0] = +q[0].toFixed(2); q[1] = +q[1].toFixed(2); }); } commit(drag.prev); } drag = null; };
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', () => { drag = null; });
  d.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); d.querySelector(`[data-sp=${e.shiftKey ? 'redo' : 'undo'}]`).click(); } if ((e.key === 'Delete' || e.key === 'Backspace') && sel && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) d.querySelector('[data-sp=del]').click(); });
}
const hitLot = p => { const P = S.lot; return edges(P).some(e => { const t = Math.max(0, Math.min(1, ((p[0] - e.a[0]) * (e.b[0] - e.a[0]) + (p[1] - e.a[1]) * (e.b[1] - e.a[1])) / (e.len * e.len || 1))); return dist(p, [e.a[0] + t * (e.b[0] - e.a[0]), e.a[1] + t * (e.b[1] - e.a[1])]) < 1.5; }); };
function addShape(t) { if (!S) return; const prev = snapshot(), V = viewBox(S), c = [V.x + V.w / 2, V.y + (V.h - 14) / 2];
  if (t === 'tree') { const id = sid(); S.trees.push({ id, x: c[0], z: c[1], r: 6 }); sel = { kind: 'tree', id }; }
  else { const w = { house: 40, driveway: 12, pool: 14, patio: 12, setback: 30, easement: 30 }[t] || 14, h = { house: 30, driveway: 30, pool: 28 }[t] || 8, id = sid();
    S.shapes.push({ id, type: t, pts: [[c[0] - w / 2, c[1] - h / 2], [c[0] + w / 2, c[1] - h / 2], [c[0] + w / 2, c[1] + h / 2], [c[0] - w / 2, c[1] + h / 2]] }); sel = { kind: 'shape', id }; }
  commit(prev); hint(`Added ${TYPES[t].name}. Drag it into place.`); }
let lenEdge = null;
function openLen(i) { const P = sel ? selPts() : S.lot; if (!sel) sel = { kind: 'lot' }; lenEdge = i; const e = edges(P)[i]; $('#spLen').hidden = false; const inp = $('#spLenIn'); inp.value = (Math.round(e.len * 100) / 100).toString(); inp.focus(); inp.select(); render(); }
function applyLen() { const v = parseFloat(String($('#spLenIn').value).replace(/[^\d.]/g, '')); $('#spLen').hidden = true; if (!(v > 0)) return;
  if (pick?.wantLen) return pick.done(v);
  const P = selPts(); if (!P || lenEdge == null) return; const prev = snapshot(), Q = setEdgeLength(P, lenEdge, v); P.splice(0, P.length, ...Q); commit(prev); hint(`Set to ${fmtFt(v)}.`); }
function startTrace(type) { if (!S) S = { v: 1, source: layers.survey ? 'survey' : 'manual', approx: !layers.survey, label: opts.address || '', north: 0, lot: [[-35, -25], [35, -25], [35, 25], [-35, 25]], shapes: [], trees: [], lotEstimated: true };
  trace = { type, pts: [] }; sel = null; collapseSurvey(); render(); hint(`Tracing ${TYPES[type].name.toLowerCase()}: tap each corner, then tap the first point or Finish.`); showFinish(true); }
function showFinish(on) { let b = $('#spFinish'); if (on && !b) { $('#spStage').insertAdjacentHTML('beforeend', '<button class="btn btn--primary btn--sm sp__finish" id="spFinish" type="button" data-sp="finish">Finish shape</button>'); } else if (!on && b) b.remove(); }
function finishTrace() { if (!trace) return; showFinish(false); const t = trace; trace = null; if (t.pts.length < 3) { render(); return hint('A shape needs at least 3 corners.'); }
  const prev = snapshot(), src = layers.survey ? 'survey' : undefined;
  if (t.type === 'lot') { S.lot = t.pts; S.lotEstimated = false; if (src) { S.source = 'survey'; S.approx = false; } sel = { kind: 'lot' }; }
  else { const id = sid(); S.shapes.push({ id, type: t.type, pts: ['house', 'pool'].includes(t.type) ? rectilinear(t.pts, .5) : t.pts, src }); sel = { kind: 'shape', id }; }
  commit(prev); setSrc(); $('#spDone').disabled = false; hint('Done. Tap a length to correct it.'); }
// ---------- scale (drone photo / survey): two taps + a known length ----------
const collapseSurvey = () => { const d = document.querySelector('.sp__sv'); if (d) d.open = false; };
function startScale() { collapseSurvey(); const key = layers.survey ? 'survey' : layers.drone ? 'drone' : layers.aerial ? 'aerial' : null; if (!key) return hint('Load a survey or drone photo first.');
  pick = { pts: [], next() { if (pick.pts.length === 2 && pendingLen) { const v = pendingLen; pendingLen = null; pick.done(v); } else if (pick.pts.length === 2) { pick.wantLen = true; $('#spLen').hidden = false; $('#spLenIn').value = ''; $('#spLenIn').focus(); hint('Type the real length between the two points (ft), e.g. from the scale bar or a labeled dimension.'); } else hint('Now tap the other end.'); },
    done(v) { const L = layers[key], d = dist(pick.pts[0], pick.pts[1]); if (d > 0) { const k = v / d; L.ftPerPx *= k; L.cx = (L.cx || 0) * k; L.cz = (L.cz || 0) * k; if (S) scaleGeom(k, key); } pick = null; render(); hint(`Scale set: ${fmtFt(v)} between your two points.`); } };
  render(); hint('Tap one end of a known length (scale bar or a labeled line).'); }
function scaleGeom(k, key) { if (!S) return; const f = p => [+(p[0] * k).toFixed(2), +(p[1] * k).toFixed(2)]; const mine = s => key === 'aerial' || s.src === key || (key === 'survey' && s.src === 'survey');
  if (key !== 'aerial' && S.source === key) S.lot = S.lot.map(f); S.shapes.filter(mine).forEach(s => s.pts = s.pts.map(f)); render(); }
// ---------- align survey to aerial (2 points each) ----------
function startAlign() { collapseSurvey(); if (!(layers.survey && layers.aerial)) return; const keep = { ...show }; show = { aerial: false, survey: true }; render();
  const sPts = []; pick = { pts: [], next() { if (pick.pts.length === 2 && !sPts.length) { sPts.push(...pick.pts); pick.pts = []; show = { aerial: true, survey: false }; render(); hint('Now tap the same two points on the aerial, in the same order.'); }
    else if (pick.pts.length === 2) { const T = align2(sPts, pick.pts, true), prev = snapshot(), L = layers.survey; const c = T.map([L.cx || 0, L.cz || 0]); L.cx = c[0]; L.cz = c[1]; L.rot = (L.rot || 0) + T.th;
      if (S) { if (S.source === 'survey') S.lot = S.lot.map(T.map); S.shapes.filter(s => s.src === 'survey').forEach(s => s.pts = s.pts.map(T.map)); }
      pick = null; show = keep; commit(prev); hint(`Survey aligned to the aerial (rotated ${(T.th * 180 / Math.PI).toFixed(1)}°). The survey keeps its own scale; the aerial differs by ${Math.abs((T.s - 1) * 100).toFixed(1)}% between your points.`); S.alignedToAerial = { th: T.th, scaleDiff: T.s }; } else hint('Tap the second point.'); } };
  hint('Align: tap two well-spaced points on the survey (e.g. two lot corners).'); }
// ---------- survey ----------
function surveyPanel() { const el = $('#spSurvey'); el.hidden = false; $('#spProg').hidden = true;
  el.innerHTML = `<details class="sp__sv" open><summary>Survey or plot plan</summary>
   <label class="btn btn--secondary btn--sm sp__file">Upload PDF or photo<input type="file" id="spFile" accept="application/pdf,image/*" hidden></label>
   <div class="sp__row"><label>Survey date<input class="input" id="spDate" placeholder="e.g. 03/14/2019" value="${esc(S?.surveyDate || '')}"></label><label>Surveyor<input class="input" id="spBy" placeholder="Name or firm" value="${esc(S?.surveyor || '')}"></label></div>
   <p class="footnote" id="spSvMsg">1 · Upload · 2 · Set scale (tap both ends of the scale bar or a labeled line, type its length) · 3 · Trace the lot, house, easements and setbacks — or type the lot's bearings and distances.</p>
   <div class="chips" id="spLens"></div>
   <div class="chips"><button class="chip" type="button" data-sp="scale">Set scale</button><button class="chip" type="button" data-sp="trace-lot">Trace lot lines</button><button class="chip" type="button" data-sp="trace-house">Trace house</button><button class="chip" type="button" data-sp="trace-easement">Easement</button><button class="chip" type="button" data-sp="trace-setback">Setback</button></div>
   <label class="field">Lot bearings and distances (one per line)<textarea class="input" id="spCalls" rows="4" placeholder="N 12°30' E 85.00'&#10;S 77°30' E 120.00'&#10;S 12°30' W 85.00'&#10;N 77°30' W 120.00'"></textarea></label>
   <button class="btn btn--secondary btn--sm" type="button" data-sp="bearings">Draw lot from bearings</button> <span class="footnote" id="spClose"></span></details>`;
  el.querySelector('#spFile').onchange = e => e.target.files[0] && loadSurvey(e.target.files[0]);
  el.querySelector('#spDate').oninput = e => { if (S) S.surveyDate = e.target.value; setSrc(); }; el.querySelector('#spBy').oninput = e => { if (S) S.surveyor = e.target.value; };
}
let pdfjsP = null; const pdfjs = () => pdfjsP || (pdfjsP = import('../contractor/vendor/pdfjs/pdf.min.mjs').then(m => { m.GlobalWorkerOptions.workerSrc = new URL('../contractor/vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href; return m; }));
export async function loadSurvey(file) { const msg = $('#spSvMsg'); msg.textContent = 'Reading the survey…';
  try { let url, W, H, text = '';
    if (/pdf/.test(file.type) || /\.pdf$/i.test(file.name)) { const lib = await pdfjs(), pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise, pg = await pdf.getPage(1), vp = pg.getViewport({ scale: 2 });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise; url = c.toDataURL('image/jpeg', .85); W = c.width; H = c.height;
      text = (await pg.getTextContent()).items.map(i => i.str).join(' '); }
    else { url = await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(file); }); const im = new Image(); im.src = url; await im.decode(); W = im.naturalWidth; H = im.naturalHeight; }
    // until the scale is set, assume the drawing spans ~150 ft
    const prevAerial = layers.aerial; layers = { ...(prevAerial ? { aerial: prevAerial } : {}), survey: { url, W, H, ftPerPx: 150 / Math.max(W, H), cx: 0, cz: 0, rot: 0 } }; show = { aerial: !!prevAerial, survey: true };
    if (!S) S = { v: 1, source: 'survey', approx: false, label: opts.address || '', north: 0, lot: [[-35, -25], [35, -25], [35, 25], [-35, 25]], shapes: [], trees: [], lotEstimated: true };
    S.source = 'survey'; S.approx = false; S.surveyDate = $('#spDate').value || S.surveyDate || ''; S.surveyor = $('#spBy').value || S.surveyor || ''; S.attribution = (S.attribution ? S.attribution + ' · ' : '') + 'Lot per user-supplied survey';
    const lens = distanceLabels(text), calls = callsIn(text);
    $('#spLens').innerHTML = lens.length ? `<span class="footnote">Lengths found on the survey (tap to use when setting scale):</span>` + lens.slice(0, 16).map(v => `<button class="chip" type="button" data-len="${v}">${v}'</button>`).join('') : '';
    $('#spLens').onclick = e => { const b = e.target.closest('[data-len]'); if (b) { $('#spLenIn').value = b.dataset.len; if (pick?.wantLen) applyLen(); else { startScale(); hint(`Tap both ends of the ${b.dataset.len}' line.`); pendingLen = +b.dataset.len; } } };
    if (calls.length >= 3) $('#spCalls').value = calls.join('\n');
    msg.textContent = `Loaded ${file.name}${text ? ` · ${lens.length} distance labels${calls.length ? `, ${calls.length} bearings` : ''} found in the text` : ''}. Next: Set scale.`;
    setSrc(); render(); $('#spDone').disabled = false;
  } catch (e) { console.warn(e); msg.textContent = "Couldn't read that file. Try a PDF or a clear photo of the survey."; } }
let pendingLen = null;
function applyBearings() { const lines = $('#spCalls').value.split(/\n+/).map(s => s.trim()).filter(Boolean), calls = lines.map(parseCall); const bad = lines.filter((l, i) => !calls[i]);
  if (bad.length || calls.length < 3) { $('#spClose').textContent = bad.length ? `Couldn't read: ${bad[0]}` : 'Enter at least 3 lines.'; return; }
  const T = traverse(calls), c = centroid(T.pts), P = T.pts.map(p => [+(p[0] - c[0]).toFixed(2), +(p[1] - c[1]).toFixed(2)]);
  if (!S) S = { v: 1, source: 'survey', approx: false, label: opts.address || '', north: 0, lot: P, shapes: [], trees: [] };
  const prev = snapshot(); S.lot = P; S.source = 'survey'; S.approx = false; S.lotEstimated = false; S.north = 0; S.surveyDate = $('#spDate').value || S.surveyDate || '';
  $('#spClose').textContent = `Closure error ${T.closure} ft${T.closure > 1 ? ' — check the calls' : ''}. Lot area ${Math.round(area(P)).toLocaleString()} sq ft.`; commit(prev); setSrc(); $('#spDone').disabled = false; }
// ---------- drone photo: EXIF/XMP altitude + 35 mm focal length, else two-tap scale ----------
export function droneScale(buf, W) { const s = new TextDecoder('latin1').decode(new Uint8Array(buf.slice(0, Math.min(buf.byteLength, 200000))));
  const alt = +((/RelativeAltitude="?\+?([\d.]+)/.exec(s) || [])[1] || 0), f35 = exifTag(buf, 0xA405); return alt > 2 && f35 ? { ftPerPx: alt * 36 / (f35 * W) * 3.28084, alt, f35 } : null; }
// ground sample distance (m/px) = altitude × 36 mm (35 mm-equivalent sensor width) ÷ (35 mm-equivalent focal length × image width)
function exifTag(buf, tag) { const v = new DataView(buf); if (v.getUint16(0) !== 0xFFD8) return null; let o = 2; while (o < v.byteLength - 4) { const m = v.getUint16(o), L = v.getUint16(o + 2); if (m === 0xFFE1 && v.getUint32(o + 4) === 0x45786966) { const t = o + 10, le = v.getUint16(t) === 0x4949, g16 = p => v.getUint16(p, le), g32 = p => v.getUint32(p, le);
      const scan = (ifd) => { const n = g16(t + ifd); for (let i = 0; i < n; i++) { const e = t + ifd + 2 + i * 12, id = g16(e); if (id === tag) return g16(e + 8); if (id === 0x8769) { const r = scan(g32(e + 8)); if (r) return r; } } return null; }; return scan(g32(t + 4)); } o += 2 + L; } return null; }
async function dronePhoto(file) { if (!file) return; const buf = await file.arrayBuffer(), url = await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(file); }), im = new Image(); im.src = url; await im.decode();
  const W = im.naturalWidth, H = im.naturalHeight, sc = droneScale(buf, W); const ftPerPx = sc ? sc.ftPerPx : 120 / Math.max(W, H);
  layers = { drone: { url, W, H, ftPerPx, cx: 0, cz: 0, rot: 0 } }; show.drone = true; manual(); S.source = 'drone'; S.attribution = 'Your drone photo'; delete layers.aerial; setSrc(); render();
  hint(sc ? `Scale from the photo: ${sc.alt} m altitude, ${sc.f35} mm (35 mm equiv.). Check one known length with Set scale.` : 'No altitude in this photo. Tap Set scale and mark one length you know (e.g. the garage door).'); }
// ---------- done ----------
function done() { if (!S) return; clipToLot(S); const design = siteToDesign(S, opts.base || {}); const d = $('#siteSheet'); d.close(); opts.onDone?.(JSON.parse(JSON.stringify(S)), design, layers); }
export const state = () => ({ site: S, layers, cache });
window.siteApi = { open, state, loadSurvey, droneScale, _trace: () => trace };
