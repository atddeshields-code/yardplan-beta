// siteplan/render.js — SVG markup for a site model (shared by the plan editor, plan2d and the proposal capture).
import { TYPES, area, centroid, edges, fmtFt, bbox } from './core.js';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pts = P => P.map(p => p.join(',')).join(' ');
const sf = A => `${Math.round(A).toLocaleString('en-US')} sq ft`;
const FILL = { house: 'url(#sp-hatch)', driveway: '#cfcdc8', patio: '#ddd3c2', pool: '#8fd0ee', lawn: '#b5dba1', bed: '#c49a70', gravel: '#d6d1c7' };
export const defs = () => `<defs><pattern id="sp-hatch" width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1.6" height="1.6" fill="#e2e2e6"/><path d="M0 0V1.6" stroke="#a5a5ad" stroke-width=".22"/></pattern></defs>`;
/** base layers: lot fill, hardscape, house, trees, easements. items with pts (lawn/beds) are drawn by plan2d itself (they are design items). */
export function base(site, { withAreas = true, skipTypes = [], see = false } = {}) {
  let s = defs() + `<polygon points="${pts(site.lot)}" fill="${see ? 'none' : '#f7f6f2'}" stroke="none"/>`;
  const order = ['lawn', 'bed', 'gravel', 'driveway', 'patio', 'pool', 'house'];
  for (const t of order) for (const sh of site.shapes.filter(x => x.type === t && !skipTypes.includes(t))) s += `<polygon class="sp-shape" data-sid="${sh.id}" points="${pts(sh.pts)}" fill="${FILL[t]}" fill-opacity="${see ? (t === 'house' ? .5 : .45) : 1}" stroke="${TYPES[t].stroke}" stroke-width="${t === 'house' ? .3 : .15}" stroke-linejoin="round"/>`;
  for (const t of site.trees) s += `<g class="sp-tree" data-sid="${t.id}"><circle cx="${t.x}" cy="${t.z}" r="${t.r}" fill="rgba(46,110,52,.22)" stroke="#2e6e34" stroke-width=".15" stroke-dasharray=".8 .4"/><circle cx="${t.x}" cy="${t.z}" r=".35" fill="#2e6e34"/></g>`;
  for (const sh of site.shapes.filter(x => x.type === 'easement' || x.type === 'setback')) s += `<polygon class="sp-shape" data-sid="${sh.id}" points="${pts(sh.pts)}" fill="${sh.type === 'easement' ? 'rgba(142,68,173,.08)' : 'none'}" stroke="${TYPES[sh.type].stroke}" stroke-width=".18" stroke-dasharray="1.2 .6"/>`;
  return s;
}
const dimLine = (a, b, label, off, size) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, nx = -dz / L * off, nz = dx / L * off, A = [a[0] + nx, a[1] + nz], B = [b[0] + nx, b[1] + nz];
  let ang = Math.atan2(dz, dx) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180; const m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  const t = .5; return `<line x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}"/><line x1="${A[0] - nx / off * t}" y1="${A[1] - nz / off * t}" x2="${A[0] + nx / off * t}" y2="${A[1] + nz / off * t}"/><line x1="${B[0] - nx / off * t}" y1="${B[1] - nz / off * t}" x2="${B[0] + nx / off * t}" y2="${B[1] + nz / off * t}"/>`
    + `<text x="${m[0]}" y="${m[1]}" transform="rotate(${ang} ${m[0]} ${m[1]})" dy="-.35" text-anchor="middle" font-size="${size}" stroke="#fff" stroke-width=".35" paint-order="stroke">${label}</text>`; };
/** outward offset sign for a ring (dims drawn outside) */
const outward = P => { const c = centroid(P); return e => { const nx = -(e.b[1] - e.a[1]), nz = e.b[0] - e.a[0]; return (e.mid[0] - c[0]) * nx + (e.mid[1] - c[1]) * nz > 0 ? 1 : -1; }; };
/** overlay: dimension strings, area labels, north arrow, scale bar, title block, attribution */
export function overlay(site, { forExport = false, title = 'Site plan', sub = '', attribution = '', vb } = {}) {
  let s = `<g class="sp-dims" fill="#1d1d1f" stroke="#1d1d1f" stroke-width=".07" font-weight="600" font-family="Inter, Helvetica, Arial, sans-serif" pointer-events="none">`;
  // lot lines: dash-dot + dims on every edge (≥ 3 ft)
  s += `<polygon points="${pts(site.lot)}" fill="none" stroke="#C0262D" stroke-width=".25" stroke-dasharray="2 .5 .4 .5"/>`;
  const bb = bbox(site.lot), K = Math.max(1, Math.max(bb.x1 - bb.x0, bb.z1 - bb.z0) / 80); s = s.replace('stroke-width=".07"', `stroke-width="${.07 * K}"`);
  const oL = outward(site.lot); for (const e of edges(site.lot)) if (e.len >= 3) s += dimLine(e.a, e.b, fmtFt(e.len), 2.4 * K * oL(e), 1.3 * K);
  for (const H of site.shapes.filter(x => x.type === 'house')) { const oH = outward(H.pts); for (const e of edges(H.pts)) if (e.len >= 6) s += dimLine(e.a, e.b, fmtFt(e.len), 1.4 * K * oH(e), 1 * K); }
  for (const sh of site.shapes) { if (sh.type === 'easement' || sh.type === 'setback') continue; const A = area(sh.pts); if (A < 40) continue; const [x, z] = centroid(sh.pts), big = sh.type === 'house', K2 = Math.max(1, Math.max(bbox(site.lot).x1 - bbox(site.lot).x0, bbox(site.lot).z1 - bbox(site.lot).z0) / 80);
    s += `<text x="${x}" y="${z}" text-anchor="middle" font-size="${(big ? 1.3 : .95) * K2}" stroke="none" fill="#333">${esc(sh.label || TYPES[sh.type].name)}</text><text x="${x}" y="${z + (big ? 1.6 : 1.2) * K2}" text-anchor="middle" font-size="${(big ? 1.05 : .85) * K2}" font-weight="500" stroke="none" fill="#555">${sf(A)}</text>`; }
  for (const sh of site.shapes.filter(x => x.type === 'easement' || x.type === 'setback')) { const [x, z] = centroid(sh.pts); s += `<text x="${x}" y="${z}" text-anchor="middle" font-size=".9" stroke="none" fill="${sh.type === 'easement' ? '#8e44ad' : '#d35400'}">${esc(sh.label || TYPES[sh.type].name)}</text>`; }
  const b = bbox(site.lot), V = vb || viewBox(site);
  // north arrow (site.north = rotation applied to the drawing, radians)
  const nx = V.x + 3, nz = V.y + 3.5, na = (site.north || 0) * 180 / Math.PI;
  s += `<g transform="rotate(${na} ${nx} ${nz})"><path d="M${nx} ${nz - 2}L${nx + .9} ${nz + 1}L${nx} ${nz + .4}L${nx - .9} ${nz + 1}Z" stroke="none"/><text x="${nx}" y="${nz - 2.4}" text-anchor="middle" font-size="1" stroke="none">N</text></g>`;
  // scale bar 0–10–20 ft
  const sx = V.x + 2, sy = V.y + V.h - 9.5 * Math.max(1, Math.max(V.w, V.h) / 110); s += `<rect x="${sx}" y="${sy}" width="10" height=".45" stroke="none"/><rect x="${sx + 10}" y="${sy}" width="10" height=".45" fill="#fff"/><text x="${sx}" y="${sy - .5}" font-size=".8" stroke="none">0</text><text x="${sx + 10}" y="${sy - .5}" font-size=".8" text-anchor="middle" stroke="none">10</text><text x="${sx + 20}" y="${sy - .5}" font-size=".8" text-anchor="middle" stroke="none">20 ft</text>`;
  // title block
  const KT = Math.max(1, Math.max(V.w, V.h) / 110), tw = Math.min(V.w - 4, 46 * KT), tx = V.x + V.w - tw - 2, ty = V.y + V.h - 7.2 * KT, src = site.source === 'survey' ? `Lot lines per survey${site.surveyDate ? ' dated ' + esc(site.surveyDate) : ''}${site.surveyor ? ' by ' + esc(site.surveyor) : ''}` : site.lotEstimated ? 'Lot lines estimated — confirm on site' : 'Approximate, from aerial + public parcel data. Not a survey.';
  s += `<g><rect x="${tx}" y="${ty}" width="${tw}" height="${6.4 * KT}" fill="#fff" stroke="#1d1d1f" stroke-width="${.12 * KT}"/><text x="${tx + .8 * KT}" y="${ty + 1.7 * KT}" font-size="${1.15 * KT}" stroke="none">${esc(title)}</text><text x="${tx + .8 * KT}" y="${ty + 3.1 * KT}" font-size="${.8 * KT}" font-weight="500" stroke="none">${esc(sub || site.label || '')}</text>`
    + `<text x="${tx + .8 * KT}" y="${ty + 4.4 * KT}" font-size="${.72 * KT}" font-weight="500" stroke="none" fill="${site.source === 'survey' ? '#1d1d1f' : '#C0262D'}">${src}</text><text x="${tx + .8 * KT}" y="${ty + 5.6 * KT}" font-size="${.6 * KT}" font-weight="400" stroke="none" fill="#666">${esc(attribution || site.attribution || '')}</text></g>`;
  return s + '</g>';
}
export const viewBox = site => { const b = bbox(site.lot), K = Math.max(1, Math.max(b.x1 - b.x0, b.z1 - b.z0) / 110); return { x: b.x0 - 8 * K, y: b.z0 - 8 * K, w: b.x1 - b.x0 + 16 * K, h: b.z1 - b.z0 + 8 * K + 14 * K }; };
if (typeof window !== 'undefined') window.SiteRender = { base, overlay, viewBox, defs };
