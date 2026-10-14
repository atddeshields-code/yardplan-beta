// guide-ui.js — renders the Irrigation / Maintenance guide for a picked design (browser).
import { generateIrrigationPlan } from './irrigation.js';
import { generateMaintenanceGuide } from './maintenance.js';
import { buildICS } from './ics.js';
import { buildGuidePdf } from './guide-pdf.js';
import { rectCorners } from './geometry.js';
import { MONTHS } from './location.js';

const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FILL = { lawn: '#9fd18b', mulch: '#a47a55', gravel: '#c4c4c4', path: '#d9c7a3', dg: '#e5d3a8', wall: '#6b5a4a' };

/** drawPlanOverlay(canvas, design, irrigationPlan, { showEmitters, showHeads }) — top-down plan with hydrozones. */
export function drawPlanOverlay(canvas, design, plan, o = {}) {
  const ctx = canvas.getContext('2d'), Wpx = canvas.width, Hpx = canvas.height, { w, d } = design.yard;
  const s = Math.min((Wpx - 20) / w, (Hpx - 20) / d), ox = Wpx / 2, oz = Hpx / 2, P = (x, z) => [ox + x * s, oz + z * s];
  ctx.clearRect(0, 0, Wpx, Hpx); ctx.fillStyle = '#eef3e6'; ctx.fillRect(ox - w / 2 * s, oz - d / 2 * s, w * s, d * s); ctx.strokeStyle = '#555'; ctx.strokeRect(ox - w / 2 * s, oz - d / 2 * s, w * s, d * s);
  const poly = (pts, fill, stroke, lw = 1, dash) => { ctx.beginPath(); pts.forEach(([x, z], i) => { const [a, b] = P(x, z); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.setLineDash(dash || []); ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); ctx.setLineDash([]); } };
  for (const it of design.items) if (FILL[it.kind]) poly(rectCorners(it.kind === 'wall' ? { ...it, d: it.d || 1 } : it), FILL[it.kind], null);
  for (const z of plan.overlay.zones) { poly(z.outline, z.color + '33', z.color, 2, [6, 4]); }
  for (const it of design.items) if (it.kind === 'plant') { const [a, b] = P(it.x, it.z); ctx.fillStyle = '#2f6b2f'; ctx.beginPath(); ctx.arc(a, b, Math.max(2, s * 0.6), 0, 7); ctx.fill(); }
  for (const z of plan.overlay.zones) {
    ctx.fillStyle = z.color; if (o.showEmitters !== false) for (const e of z.emitters) { const [a, b] = P(e.x, e.z); ctx.fillRect(a - 1.5, b - 1.5, 3, 3); }
    if (o.showHeads !== false) for (const hd of z.heads) { const [a, b] = P(hd.x, hd.z); ctx.beginPath(); ctx.arc(a, b, 3, 0, 7); ctx.fill(); ctx.globalAlpha = .12; ctx.beginPath(); ctx.arc(a, b, hd.radius * s, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
    const c = z.outline.reduce((acc, p) => [acc[0] + p[0] / z.outline.length, acc[1] + p[1] / z.outline.length], [0, 0]); const [a, b] = P(c[0], c[1]);
    ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = '#fff'; ctx.strokeStyle = z.color; ctx.lineWidth = 3; ctx.strokeText(z.id, a - 8, b + 4); ctx.fillStyle = z.color; ctx.fillText(z.id, a - 8, b + 4);
  }
  const [mx, mz] = P(plan.overlay.manifold.x, plan.overlay.manifold.z); ctx.fillStyle = '#111'; ctx.fillRect(mx - 5, mz - 5, 10, 10); ctx.font = '11px sans-serif'; ctx.fillText('Valves', mx + 8, mz + 4);
  return canvas;
}

const ruleItem = r => `<b>${h(r.utility)}</b> <small class="${r.verified ? 'ypg-ok' : 'ypg-unv'}">${r.verified ? 'checked against official page ' + h(r.checked) : 'unverified' + (r.verifyNote ? ' — ' + h(r.verifyNote) : '')}</small>${r.alert ? `<p><b>⚠ ${h(r.alert)}</b></p>` : ''}<ul>${r.notes.map(n => `<li>${h(n)}</li>`).join('')}</ul>${r.rebates && r.rebates.length ? `<small>Rebates: ${r.rebates.map(x => h(x)).join(' · ')}</small><br>` : ''}<small>Sources: ${r.sources.map(u => `<a href="${h(u)}">${h(u)}</a>`).join(' · ')}</small>`;
function rulesBlock(R) { return `<h3>Local watering rules</h3><div class="ypg-note">${ruleItem(R)}${(R.layers || []).map(l => `<hr>${ruleItem(l)}`).join('')}<p><small>Rules change with drought stages — confirm with your water provider before programming the controller.</small></p></div>`; }
function mweloBlock(M) { return `<h3>California MWELO check (estimate)</h3><div class="ypg-note"><p>Landscape area ≈ <b>${M.landscapeSqft.toLocaleString()} sq ft</b> (${h(M.propertyType)}, ${h(M.projectType)}). MAWA = ETo ${M.etoIn} in × 0.62 × ${M.etaf} × LA = <b>${M.mawaGallons.toLocaleString()} gal/yr</b>; estimated ETWU = <b>${M.etwuGallons.toLocaleString()} gal/yr</b> → ${M.compliant ? '✓ within MAWA' : '⚠ exceeds MAWA — lower plant factors, reduce turf or use drip'} (site ETAF ${M.siteEtaf}).</p>
   <table class="ypg-t ypg-small"><tr><th>Zone</th><th>PF</th><th>HA sq ft</th><th>IE</th><th>ETWU gal</th></tr>${M.zones.map(z => `<tr><td>${h(z.id)} ${h(z.name)}</td><td>${z.pf}</td><td>${z.ha}</td><td>${z.ie}</td><td>${z.gallons.toLocaleString()}</td></tr>`).join('')}</table>
   <ul>${M.hints.map(x => `<li>${h(x)}</li>`).join('')}</ul><small>${h(M.etoNote)} Source: <a href="${h(M.source)}">MWELO (23 CCR ch. 2.7)</a></small></div>`; }
function download(name, data, type) { const a = document.createElement('a'); a.download = name; a.href = typeof data === 'string' && data.startsWith('data:') ? data : URL.createObjectURL(new Blob([data], { type })); document.body.appendChild(a); a.click(); a.remove(); }

/**
 * renderGuide(el, { design, zip, catalog, jsPDF?, waterSource?, pressurePsi?, flowGpm?, tab? }) -> { irrigation, maintenance, exportPdf(), exportIcs(), print(), setTab(t) }
 */
export function renderGuide(el, opts) {
  const irrigation = generateIrrigationPlan(opts.design, opts);
  const maintenance = generateMaintenanceGuide(opts.design, { ...opts, irrigationPlan: irrigation, location: irrigation.location });
  const L = irrigation.location, I = irrigation, G = maintenance; const byId = new Map(G.tasks.map(t => [t.id, t]));
  el.classList.add('ypg');
  el.innerHTML = `
  <div class="ypg-head"><div><h2>Your yard care guide</h2><div class="ypg-sub">ZIP ${h(L.zip)} · ${h(L.state)} · Zone ${h(L.zone)} · ${L.climate.lastFrost ? `last frost ~${h(L.climate.lastFrost)}, first ~${h(L.climate.firstFrost)}` : 'frost rare'} · ETo ≈ ${L.climate.etoAnnual} in/yr <span title="${h(L.estimates.join(' '))}">(Hargreaves est.)</span> · NOAA station ${h(L.station.id)} ${h(L.station.name)} (${L.station.distanceMi} mi)</div></div>
   <div class="ypg-actions noprint"><button data-act="print">Print</button><button data-act="pdf">Export PDF</button><button data-act="ics">Calendar (.ics)</button></div></div>
  <div class="ypg-tabs noprint" role="tablist"><button role="tab" data-tab="irrigation">Irrigation</button><button role="tab" data-tab="maintenance">Maintenance</button></div>
  <section data-panel="irrigation">
   <div class="ypg-cards">
    <div class="ypg-card"><b>${I.valveCount}</b><span>valves (${I.dripValves} drip · ${I.lawnValves} lawn)</span></div>
    <div class="ypg-card"><b>${I.waterUse.annualGallons.toLocaleString()}</b><span>gal/yr est. · ${I.waterUse.savingsPct}% less than all-lawn (${I.waterUse.baselineAnnualGallons.toLocaleString()})</span></div>
    <div class="ypg-card"><b>${I.maxValveGpm} / ${I.supply.designBudgetGpm}</b><span>max GPM per valve / budget ${I.withinFlowBudget ? '✓' : '⚠'}</span></div>
    <div class="ypg-card"><b>$${Math.round(I.partsTotal).toLocaleString()}</b><span>parts (example prices)</span></div></div>
   <div class="ypg-plan"><canvas width="720" height="520" aria-label="Plan with hydrozones"></canvas>
    <ul class="ypg-legend">${I.hydrozones.map(z => `<li><i style="background:${z.color}"></i>${z.id} ${h(z.name)}</li>`).join('')}</ul></div>
   <h3>Hydrozones</h3>
   <table class="ypg-t"><thead><tr><th>Zone</th><th>Method</th><th>Plants</th><th>Emitters / heads</th><th>GPH · GPM</th><th>Valves</th><th>Peak runtime</th><th>Gal/yr</th></tr></thead><tbody>
   ${I.hydrozones.map(z => { const pk = z.monthly.reduce((a, b) => b.gallons > a.gallons ? b : a); return `<tr><td><i class="dot" style="background:${z.color}"></i>${z.id} ${h(z.name)}<br><small>PF ${z.plantFactor} · eff ${z.efficiency}</small></td><td>${h(z.method)}</td><td>${z.plants.map(p => h(p.name)).filter((v, i, a) => a.indexOf(v) === i).join(', ') || h(z.irrigatedSqft + ' sq ft lawn')}</td><td>${z.emitterCount || z.headCount}</td><td>${z.totalGph || '–'} · ${z.gpm}</td><td>${z.valves}</td><td>${pk.minutesPerEvent} min × ${pk.eventsPerWeek}/wk (${pk.month})${pk.cycleSoak ? '<br><small>' + h(pk.cycleSoak) + '</small>' : ''}</td><td>${z.annualGallons.toLocaleString()}</td></tr>`; }).join('')}
   </tbody></table>
   <h3>Runtimes by month (minutes per watering · times per week)</h3>
   <table class="ypg-t ypg-small"><thead><tr><th>Zone</th>${MONTHS.map(m => `<th>${m}</th>`).join('')}</tr></thead><tbody>
   ${I.hydrozones.map(z => `<tr><td>${z.id}</td>${z.monthly.map(m => `<td>${m.off ? 'off' : `${Math.round(m.minutesPerEvent)}<small>×${m.eventsPerWeek}</small>`}</td>`).join('')}</tr>`).join('')}
   <tr><td>ETo in</td>${L.climate.eto.map(e => `<td>${e}</td>`).join('')}</tr></tbody></table>
   <h3>Establishment (first 12 weeks) vs established</h3>
   ${I.hydrozones.map(z => `<p><b>${z.id}</b> ${z.establishment.map(e => `wk ${h(e.weeks)}: ${h(e.frequency)}${typeof e.minutesPerEvent === 'number' ? `, ${e.minutesPerEvent} min` : ''}`).join(' → ')}</p>`).join('')}
   <h3>Equipment</h3><ul>
    <li><b>Controller:</b> ${h(I.equipment.controller.recommendation)}; ${h(I.equipment.controller.sensors.join('; '))}</li>
    <li><b>Backflow:</b> ${h(I.equipment.backflow.recommendation)}</li>
    <li><b>Pressure:</b> drip ${h(I.equipment.pressureRegulation.drip)}; sprays ${h(I.equipment.pressureRegulation.sprays)}; house ${h(I.equipment.pressureRegulation.house)}</li>
    <li><b>Filter:</b> ${h(I.equipment.filter)}</li>
    ${I.noIrrigation.length ? `<li><b>No irrigation:</b> ${I.noIrrigation.map(n => `${h(n.kind)} ${n.sqft} sq ft`).join(', ')}</li>` : ''}</ul>
   <h3>Parts list</h3><table class="ypg-t ypg-small"><thead><tr><th>Item</th><th>Qty</th><th>Unit $</th><th>Ext $</th></tr></thead><tbody>
   ${I.parts.map(p => `<tr><td>${h(p.name)}</td><td>${p.qty} ${h(p.unit)}</td><td>${p.unitCost}</td><td>${Math.round(p.extended).toLocaleString('en-US')}</td></tr>`).join('')}</tbody></table>
   ${L.restrictions ? rulesBlock(L.restrictions) : ''}
   ${I.mwelo ? mweloBlock(I.mwelo) : ''}
   ${[...I.warnings, ...I.notes].length ? `<ul class="ypg-warn">${[...I.warnings, ...I.notes].map(n => `<li>${h(n)}</li>`).join('')}</ul>` : ''}
   <p class="ypg-disc">${h(I.disclaimer)} ${h(I.waterUse.method)}</p>
  </section>
  <section data-panel="maintenance">
   <div class="ypg-cards"><div class="ypg-card ypg-level-${G.score.level}"><b>${G.score.level}</b><span>maintenance level (${G.score.points} pts)</span></div>
    <div class="ypg-card"><b>${G.annual.hours} h</b><span>per year DIY</span></div><div class="ypg-card"><b>$${G.annual.diyCost}</b><span>materials/yr</span></div><div class="ypg-card"><b>$${G.annual.proCost.toLocaleString()}</b><span>if hired (≈$${G.proRate}/h)</span></div></div>
   <div class="ypg-cal">${G.months.map(m => `<div class="ypg-month"><h4>${MONTHS[m.month - 1]}</h4>${m.tasks.map(id => { const t = byId.get(id); return `<div class="ypg-task c-${h(t.category.replace(/\W+/g, '').toLowerCase())}" title="${h(t.details || '')}"><b>${h(t.title)}</b><small>${h(t.category)} · ${t.minutes} min · DIY $${t.diyCost} / pro $${t.proCost}</small>${t.details ? `<p>${h(t.details)}</p>` : ''}</div>`; }).join('') || '<small>Nothing scheduled — enjoy the yard.</small>'}</div>`).join('')}</div>
   <p class="ypg-disc">${h(G.disclaimer)}</p>
  </section>`;
  const canvas = el.querySelector('canvas'); drawPlanOverlay(canvas, opts.design, I);
  const setTab = t => { el.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === t)); el.querySelectorAll('[data-panel]').forEach(p => p.hidden = p.dataset.panel !== t); };
  el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => setTab(b.dataset.tab)); setTab(opts.tab || 'irrigation');
  const api = { irrigation: I, maintenance: G, setTab,
    pdfDoc: () => buildGuidePdf({ jsPDF: opts.jsPDF, irrigation: I, maintenance: G, planImage: canvas.toDataURL('image/png') }),
    exportPdf: () => { api.pdfDoc().save(`yardplan-guide-${L.zip}.pdf`); },
    icsText: () => buildICS(G, { name: `Yardplan yard care ${L.zip}` }),
    exportIcs: () => download(`yardplan-maintenance-${L.zip}.ics`, api.icsText(), 'text/calendar'),
    print: () => { el.classList.add('ypg-printing'); el.querySelectorAll('[data-panel]').forEach(p => p.hidden = false); window.print(); el.classList.remove('ypg-printing'); setTab(opts.tab || 'irrigation'); } };
  el.querySelector('[data-act=print]').onclick = api.print; el.querySelector('[data-act=pdf]').onclick = api.exportPdf; el.querySelector('[data-act=ics]').onclick = api.exportIcs;
  return api;
}
export { generateIrrigationPlan, generateMaintenanceGuide, buildICS, buildGuidePdf };
