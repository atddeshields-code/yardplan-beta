// Pro / Contractor panel: takeoff, price book, bid (Good/Better/Best), compliance flags and proposal PDF.
// Classic-script globals used here (declared with const/let at top level, so reachable by name from this
// module, which runs after them): PLANTS, PLANT_SIZE (data.js), MATERIALS, priceProvider (prices.js), state, esc, go (app.js).
import { ensureIrrigationItems } from './contractor/irrigation-takeoff.js';
import { budgetValue } from './contractor/parse-budget.js';
import { STATE_SALES_TAX } from './contractor/data/state-sales-tax.js';
import { depositDefault } from './contractor/data/state-deposit.js';
import { zip3ToState } from './marketplace/data/zip3-state.js';
import { takeoff, toCSV } from './contractor/takeoff.js';
import { createPriceBook, seedFromProvider, setItem, setPlantPrice, setSettings, loadFromStorage, saveToStorage } from './contractor/pricebook.js';
import { generateBid, marginPctToMarkupPct } from './contractor/bid.js';
import { overheadPctOnDirect, bidProfit } from './contractor/overhead.js';
import { priceSanityChecks } from './contractor/sanity.js';
import { checkCompliance } from './contractor/compliance.js';
import { buildProposalPdf } from './contractor/proposal-pdf.js';
import { buildTakeoff, priceProject, roundLines } from './contractor/budget-fit.js';

const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);
const PKEY = 'yardplan.pro.profile.v1', DKEY = 'yardplan.design.v3';
const money = n => '$' + Math.round(+n || 0).toLocaleString('en-US');   // whole dollars
const rate = n => '$' + (+n || 0).toLocaleString('en-US', { minimumFractionDigits: (+n % 1) ? 2 : 0, maximumFractionDigits: 2 });   // unit prices keep cents
let profile = {}; try { profile = JSON.parse(localStorage.getItem(PKEY)) || {}; } catch (e) { }
let book = loadFromStorage() || createPriceBook({ materials: MATERIALS }); ensureIrrigationItems(book);
let design = null, take = null, bid = null, priced = null, tier = profile.tier || 'good', warnings = [];

// ---------- profile ----------
const getP = path => path.split('.').reduce((o, k) => o && o[k], profile);
const setP = (path, v) => { const ks = path.split('.'); let o = profile; ks.slice(0, -1).forEach(k => o = o[k] = o[k] || {}); o[ks.at(-1)] = v; };
$$('#proProfile [data-p]').forEach(i => { const v = getP(i.dataset.p); if (v != null) i.value = v;
  i.oninput = () => { setP(i.dataset.p, i.value); $('#proSaved').textContent = lsSet(PKEY, JSON.stringify(profile)) ? 'Saved on this device.' : "Couldn't save on this device."; if (i.dataset.p === 'project.budget' && bid) renderBid(); }; });
const ico = n => `<svg class="ico" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const hexRgb = h => { const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(h || ''); return m ? m.slice(1).map(x => parseInt(x, 16)) : [46, 94, 62]; };

// ---------- design source ----------
async function loadDesign() {
  if (window.planApi) { await window.planApi.whenReady(); return { d: window.planApi.serialize(), src: 'current site plan' }; }
  try { const d = JSON.parse(localStorage.getItem(DKEY)); if (d) return { d, src: 'saved site plan' }; } catch (e) { }
  return { d: { v: 2, yard: { w: 50, d: 36 }, items: [] }, src: 'empty design' };
}
// Seed ZIP prices once per ZIP, for BOTH the homeowner estimate and the Pro bid, so the two always use the same book.
let seededZip = null, seeding = null;
// Overnight B4: tax was 0% everywhere. Default to the job state's base sales-tax rate on materials (Tax Foundation, July 2026)
// unless the contractor typed their own rate (taxSource 'user'). Local/district taxes are NOT included; the UI says so.
function applyStateTax(zip) { const st = (state.place?.st) || zip3ToState[String(zip || '').slice(0, 3)] || ''; const s = book.settings;
  if (s.taxSource === 'user' || !st || !(st in STATE_SALES_TAX)) return; const r = STATE_SALES_TAX[st];
  if (s.taxPct !== r || s.taxState !== st) { setSettings(book, { taxPct: r, taxOn: 'materials', taxState: st, taxSource: 'state-default' }); saveToStorage(book); } }
async function bookReady() {
  if (seededZip === (state.zip || '')) return book;
  const z = state.zip || ''; seeding = seeding && seeding.z === z ? seeding : { z, p: seedFromProvider(book, priceProvider, z).then(() => { saveToStorage(book); seededZip = z; }) };
  await seeding.p; ensureIrrigationItems(book); applyStateTax(z); return book;
}
async function refresh() {
  $('#proSrc').textContent = 'Reading the site plan…';
  const { d, src } = await loadDesign(); design = d; document.querySelectorAll('#proLawn,#proLawnTake').forEach(x => x.checked = !!d.includeLawn);
  const walls = d.items.filter(i => i.kind === 'wall').length, g = d.items.find(i => i.kind === 'grade');
  $('#proSrc').textContent = `From the ${src}: ${d.yard.w} × ${d.yard.d} ft yard, ${d.items.filter(i => i.kind === 'plant').length} plants, ${d.items.filter(i => !['plant', 'grade'].includes(i.kind)).length} features${walls ? ` (${walls} wall${walls > 1 ? 's' : ''})` : ''}${g ? `, grading ${g.cutCuYd} cut / ${g.fillCuYd} fill cu yd` : ''}.`;
  await bookReady();
  recompute();
}
function recompute() {
  if (!design) return;
  take = buildTakeoff(design, { catalog: { plants: PLANTS, plant3d: PLANT_SIZE }, includeLawn: !!design.includeLawn });
  if (irr && !take.irrigation) { const have = new Set(take.lines.map(l => l.key)); take.lines.push(...irr.lines.filter(l => !have.has(l.key) && book.items[l.key]).map(l => ({ ...l, name: book.items[l.key].name, basis: 'count', waste: 0, irrigation: true }))); }
  bid = generateBid(take, book, { tiers: true, autoFees: book.settings.autoFees !== false });
  // headline = the single pricing path (same as proBid().rounded.total and the homeowner "hire a pro" total)
  priced = priceProject({ takeoff: take, book, catalog: { plants: PLANTS, plant3d: PLANT_SIZE } });
  // number walls 1..n instead of raw item indexes in the messages
  const wallNo = {}; design.items.forEach((it, i) => { if (it.kind === 'wall') wallNo[i] = Object.keys(wallNo).length + 1; });
  warnings = checkCompliance(design).map(w => w.itemIndex != null ? { ...w, message: w.message.replace('#' + w.itemIndex, '#' + wallNo[w.itemIndex]) } : w);
  renderTake(); renderBook(); renderBid(); renderWarn(); renderImgs();
  window.dispatchEvent(new Event('yardplan:bid'));
}
// ---------- takeoff ----------
function renderTake() {
  $('#proTake').innerHTML = `<tr><th>Material</th><th class="n">Qty</th><th>Unit</th><th class="n">Measured</th><th class="n">Waste</th></tr>` + (take.lines.length ? take.lines.map(l =>
    `<tr><td>${esc(l.name)}</td><td class="n"><b>${l.qty}</b></td><td>${esc(l.unit)}</td><td class="n">${l.basis === 'count' ? 'irrigation guide' : l.basis === 'length' ? l.length + ' ft' : l.basis === 'volume' ? l.volumeCuYd + ' cu yd' : l.area + ' sq ft'}</td><td class="n">${Math.round(l.waste * 100)}%</td></tr>`).join('')
    : '<tr><td colspan="5" class="small">No beds, paths, walls or grading in the design yet.</td></tr>');
  $('#proPlants').innerHTML = `<tr><th>Plant</th><th>Container</th><th class="n">Qty</th><th class="n">Mature size</th></tr>` + (take.plants.length ? take.plants.map(p =>
    `<tr><td>${esc(p.name)}<div class="small"><i>${esc(p.sci)}</i>${p.native ? ' · ' + esc(p.native) : ''}</div></td><td>${esc(p.container)}</td><td class="n"><b>${p.count}</b></td><td class="n">${p.matureH} × ${p.matureW} ft</td></tr>`).join('')
    : '<tr><td colspan="4" class="small">No plants yet.</td></tr>');
}
// Run 5 (R5-2): the lawn toggle lives on the design (per job, shared with homeownerEstimate). Two checkboxes mirror it.
document.querySelectorAll('#proLawn,#proLawnTake').forEach(c => c.onchange = () => { const on = c.checked; document.querySelectorAll('#proLawn,#proLawnTake').forEach(x => x.checked = on);
  if (design) design.includeLawn = on; if (window.jobsApi?.current?.()?.design) window.dispatchEvent(new CustomEvent('yardplan:lawn', { detail: on })); else { window.planApi?.apply?.({ ...window.planApi.serialize(), includeLawn: on }); recompute(); } });
$('#proRefresh').onclick = refresh;
$('#proCsv').onclick = () => { if (!take) return; const a = document.createElement('a'); a.download = 'yardplan-takeoff.csv'; a.href = URL.createObjectURL(new Blob([toCSV(take)], { type: 'text/csv' })); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };
// ---------- price book ----------
function renderBook() {
  const s = book.settings; $$('[data-s]').forEach(i => { if (document.activeElement !== i) i.value = s[i.dataset.s] ?? 0; });
  { const tn = $('#taxNote'); if (tn) tn.textContent = s.taxSource === 'user' ? 'Your rate, on ' + (s.taxOn === 'all' ? 'the whole job.' : 'materials.') : s.taxState ? `${s.taxState} statewide base rate on materials (Tax Foundation, July 2026). Add your city/county district rate, and check whether ${s.taxState} taxes landscaping labor.` : 'Set your sales tax rate.'; }
  { const dn = $('#depNote'), st = (state.place?.st) || zip3ToState[String(state.zip || '').slice(0, 3)] || ''; if (dn) dn.textContent = st === 'CA' || !st ? '' : 'Proposal deposit: ' + depositDefault(st, 0).note; } // v19 (Austin #2)
  $('#proDiff').value = typeof s.siteDifficulty === 'string' ? s.siteDifficulty : ({ 1: 'easy', 1.25: 'moderate', 1.5: 'hard' }[s.siteDifficulty] || 'easy');
  $('#proFees').checked = s.autoFees !== false; $('#proSplit').checked = !!s.markups; $('#proMarkups').hidden = !s.markups;
  $$('[data-m]').forEach(i => { if (document.activeElement !== i) i.value = s.markups ? s.markups[i.dataset.m] ?? s.markupPct : s.markupPct; });
  if ($('#proBook').contains(document.activeElement)) return; // don't rebuild under the user's cursor
  const used = new Set(take.lines.map(l => l.key)), conts = new Set(take.plants.map(p => p.container));
  const row = (kind, key, e, label, unit) => `<tr class="${(kind === 'm' ? used.has(key) : conts.has(key)) ? '' : 'dim'}"><td>${esc(label)}${e.overridden ? ' <span class="tag-own">yours</span>' : e.isEstimate === false ? ' <span class="tag-live">live</span>' : ''}<div class="small">${esc(unit)}</div></td>
    <td><span class="inwrap mini"><em>$</em><input type="number" min="0" step="0.01" inputmode="decimal" data-b="${kind}:${key}:unitCost" value="${+e.unitCost || 0}"></span></td>
    <td><span class="inwrap mini"><input type="number" min="0" step="0.01" inputmode="decimal" data-b="${kind}:${key}:${e.laborPerUnit != null ? 'laborPerUnit' : 'laborHoursPerUnit'}" value="${e.laborPerUnit != null ? e.laborPerUnit : (+e.laborHoursPerUnit || 0)}"><em>${e.laborPerUnit != null ? '$' : 'h'}</em></span></td></tr>`;
  $('#proBook').innerHTML = `<tr><th>Item</th><th>Cost / unit</th><th>Labor / unit</th></tr>` + Object.values(book.items).map(e => row('m', e.key, e, e.name, e.unit)).join('')
    + `<tr class="sub"><th colspan="3">Plants by container size</th></tr>` + Object.values(book.plants).filter(p => p.container).map(p => row('p', p.container, p, p.container + ' plant', 'each, installed')).join('');
}
$('#proBook').addEventListener('change', e => { const b = e.target.dataset.b; if (!b) return; const [kind, key, field] = b.split(':'); const v = Math.max(0, +e.target.value || 0);
  if (kind === 'm') setItem(book, key, { [field]: v }); else setPlantPrice(book, key, { [field]: v }); saveToStorage(book); recompute(); });
$$('[data-s]').forEach(i => i.onchange = () => { setSettings(book, { [i.dataset.s]: Math.max(0, Math.min(i.dataset.s === 'taxPct' ? 20 : 1e6, +i.value || 0)), ...(i.dataset.s === 'taxPct' ? { taxSource: 'user' } : {}) }); saveToStorage(book); recompute(); });
const setS = patch => { setSettings(book, patch); saveToStorage(book); recompute(); };
$('#proDiff').onchange = e => setS({ siteDifficulty: e.target.value });
$('#proFees').onchange = e => setS({ autoFees: e.target.checked });
$('#proSplit').onchange = e => { const m = book.settings.markupPct; setS({ markups: e.target.checked ? { materials: m, plants: m, labor: m, equipment: m, subs: m } : null }); };
$$('[data-m]').forEach(i => i.onchange = () => { if (!book.settings.markups) return; setS({ markups: { ...book.settings.markups, [i.dataset.m]: Math.max(0, +i.value || 0) } }); });
$('#proSuggest').onclick = async () => {
  const out = $('#proSuggestOut'); const zip = /^\d{5}$/.test(state.zip || '') ? state.zip : '95814'; // default: California (Sacramento) until a ZIP is set
  out.textContent = 'Looking up wages…';
  try { const { suggestLaborRate } = await import('./contractor/labor-rates.js'); const r = suggestLaborRate(zip);
    out.innerHTML = `<b>$${r.hourlyRate.toFixed(2)}/h</b> for ${esc(r.area.name)} (${esc(r.area.level)}): crew wage $${r.wage.toFixed(2)} + ${r.burdenPct}% burden ÷ ${Math.round(r.billableRatio * 100)}% billable. ${esc(r.source || '')} <button class="btn ghost sm" id="proSuggestUse" type="button">Use it</button>`;
    $('#proSuggestUse').onclick = () => { setS({ hourlyRate: r.hourlyRate }); out.innerHTML = `Labor cost set to $${r.hourlyRate.toFixed(2)}/h. ${esc(r.caveat || '')}`; };
  } catch (e) { out.textContent = 'Could not suggest a rate: ' + e.message; }
};
const mOut = () => { const v = +$('#proMargin').value; $('#proMarginOut').textContent = v > 0 && v < 100 ? marginPctToMarkupPct(v).toFixed(1) + '%' : '—'; };
$('#proMargin').oninput = mOut; $('#proMarginApply').onclick = () => { const v = +$('#proMargin').value; if (v > 0 && v < 100) setS({ markupPct: marginPctToMarkupPct(v), markups: null }); };
let ohVal = null;
const ohCalc = () => { ohVal = null; try { const c = +$('#ohCost').value, r = +$('#ohRev').value; if (c > 0 && r > 0) ohVal = overheadPctOnDirect(c, r, { netProfitPct: +$('#ohProfit').value || 0 }); } catch (e) { $('#ohOut').textContent = 'Overhead exceeds revenue'; return; } $('#ohOut').textContent = ohVal != null ? ohVal.toFixed(1) + '%' : '—'; };
['#ohCost', '#ohRev', '#ohProfit'].forEach(id => $(id).oninput = ohCalc); $('#ohApply').onclick = () => { if (ohVal != null) setS({ overheadPct: ohVal }); };
$('#proSeed').onclick = async () => { await seedFromProvider(book, priceProvider, state.zip); saveToStorage(book); recompute(); };
$('#proBookReset').onclick = async () => { if (!confirm('Reset the price book to the example defaults? Your edited costs will be lost.')) return; book = createPriceBook({ materials: MATERIALS }); ensureIrrigationItems(book); await seedFromProvider(book, priceProvider, state.zip); saveToStorage(book); recompute(); };
// ---------- bid ----------
const sumRowsFor = T => [['Materials &amp; plants', T.materials], ...(T.equipment ? [['Equipment', T.equipment]] : []), ...(T.subs ? [['Subcontractors', T.subs]] : []), [`Labor (${T.laborHours} h)`, T.labor], [`Overhead ${book.settings.overheadPct}%`, T.overhead], [book.settings.markups ? 'Markup (by category)' : `Markup ${book.settings.markupPct}%`, T.markup], ...(T.fees ? [['Fees (pass-through)', T.fees]] : []), ...(T.minimumAdjustment ? [['Job minimum adjustment', T.minimumAdjustment]] : []), [`Tax ${book.settings.taxPct}%`, T.tax]];
// v16: read-only view of the selected tier for the Jobs bid screen (same numbers as the #proBid table).
function bidView() {
  if (!bid) return null;
  const sel = bid.tiers.find(t => t.id === tier) || bid.tiers[0], T = sel.totals;
  const tierTotal = t => t.id === 'good' && priced ? priced.total : Math.round(t.totals.total);
  const total = sel.id === 'good' && priced ? priced.total : Math.round(T.total), sumRows = sumRowsFor(T);
  const sumR = roundLines(sumRows.map(r => r[1]), total), lineR = roundLines(sel.lines.map(l => l.total));
  const budget = budgetValue((profile.project || {}).budget);
  let san = []; try { san = priceSanityChecks(take, bid, { tierId: sel.id }); } catch (e) { }
  return { tier: sel.id, name: sel.name, total, budget, tiers: bid.tiers.map(t => ({ id: t.id, name: t.name, total: tierTotal(t) })),
    lines: sel.lines.map((l, i) => ({ key: l.key, category: l.category, description: l.description, qty: l.qty, unit: l.unit, unitCost: l.unitCost, laborUnit: l.laborUnit, laborHours: l.laborHours, total: lineR[i] })),
    sums: sumRows.map(([k], i) => [k, sumR[i]]), profit: bidProfit({ totals: T, settings: bid.settings || book.settings }), sanity: san, warnings, settings: book.settings };
}
// v16: edit one bid line's price from the Jobs bid screen. Saves to the price book (same storage as the #proBook table).
function editLine(key, { unitCost, labor }) {
  const v = x => Math.min(MAX_UNIT, Math.max(0, +x || 0));
  if (key.startsWith('fee:')) { const f = { 'fee:mobilization': 'mobilizationFee', 'fee:delivery': 'deliveryFeeBulk', 'fee:dump': 'dumpFeePerLoad' }[key]; if (f && unitCost != null) setS({ [f]: v(unitCost) }); return; }
  if (key.startsWith('plant:')) { const p = take && take.plants.find(x => 'plant:' + x.id === key); if (!p) return; const e = book.plants[p.container] || {};
    setPlantPrice(book, p.container, { ...(unitCost != null ? { unitCost: v(unitCost) } : {}), ...(labor != null ? { [e.laborPerUnit != null ? 'laborPerUnit' : 'laborHoursPerUnit']: v(labor) } : {}) }); }
  else { const e = book.items[key]; if (!e) return; setItem(book, key, { ...(unitCost != null ? { unitCost: v(unitCost) } : {}), ...(labor != null ? { [e.laborPerUnit != null ? 'laborPerUnit' : 'laborHoursPerUnit']: v(labor) } : {}) }); }
  saveToStorage(book); recompute();
}
// Overnight B7: reference prices for sanity checks on line edits (the shipped default book, not the user's edits).
let refBook = null; const MAX_UNIT = 100000, MAX_LABOR = 100000;
function lineRef(key) { refBook ||= createPriceBook({}); if (key.startsWith('fee:')) return null;
  if (key.startsWith('plant:')) { const p = take && take.plants.find(x => 'plant:' + x.id === key); const e = p && refBook.plants[p.container]; return e ? { unitCost: +e.unitCost || 0 } : null; }
  const e = refBook.items[key]; return e ? { unitCost: +e.unitCost || 0 } : null; }
function lineEntry(key) {
  if (key.startsWith('plant:')) { const p = take && take.plants.find(x => 'plant:' + x.id === key); const e = p && book.plants[p.container]; return e ? { unitCost: +e.unitCost || 0, labor: e.laborPerUnit != null ? e.laborPerUnit : +e.laborHoursPerUnit || 0, laborUnit: e.laborPerUnit != null ? '$' : 'h', unit: p.container + ' plant' } : null; }
  if (key.startsWith('fee:')) return null;
  const e = book.items[key]; return e ? { unitCost: +e.unitCost || 0, labor: e.laborPerUnit != null ? e.laborPerUnit : +e.laborHoursPerUnit || 0, laborUnit: e.laborPerUnit != null ? '$' : 'h', unit: e.unit } : null;
}
// v16: a job supplies client / project / tier instead of the single global slot (business stays global).
function setJob({ client = {}, project = {}, tier: t } = {}) {
  profile.client = { ...client }; profile.project = { ...project }; if (t) { tier = t; profile.tier = t; }
  lsSet(PKEY, JSON.stringify(profile));
  $$('#proProfile [data-p]').forEach(i => { const v = getP(i.dataset.p); i.value = v != null ? v : (i.type === 'color' ? '#2e5e3e' : ''); });
  if (bid) { renderBid(); renderImgs(); window.dispatchEvent(new Event('yardplan:bid')); }
}
function setBusiness(patch) { profile.business = { ...(profile.business || {}), ...patch }; lsSet(PKEY, JSON.stringify(profile));
  $$('#proProfile [data-p^="business."]').forEach(i => { const v = getP(i.dataset.p); if (v != null) i.value = v; }); }
function renderBid() {
  const sel = bid.tiers.find(t => t.id === tier) || bid.tiers[0], T = sel.totals;
  // whole dollars: Good is the base bid, so it uses the single-path total (== homeowner "hire a pro" total)
  const tierTotal = t => t.id === 'good' && priced ? priced.total : Math.round(t.totals.total);
  $$('#proTier button').forEach(b => b.classList.toggle('on', b.dataset.t === sel.id));
  $('#proTiers').innerHTML = bid.tiers.map(t => `<button data-t="${t.id}" class="${t.id === sel.id ? 'on' : ''}"><small>${esc(t.name)}</small><b>${money(tierTotal(t))}</b></button>`).join('');
  const hl = $('#proHeadline') || $('#proTiers').insertAdjacentElement('beforebegin', Object.assign(document.createElement('p'), { id: 'proHeadline', className: 'small' }));
  hl.innerHTML = `Bid total <b>${money(priced ? priced.total : T.total)}</b>. This is the same number the homeowner sees for "Hire a pro". Better and Best are optional upgrades.`;
  const cb = budgetValue((profile.project || {}).budget), tb = $('#proTierBudget') || $('#proTiers').insertAdjacentElement('afterend', Object.assign(document.createElement('p'), { id: 'proTierBudget', className: 'small' }));
  tb.innerHTML = cb ? `Client budget <b>${money(cb)}</b> · ${bid.tiers.map(t => { const v = tierTotal(t); return `${esc(t.name)} ${v <= cb ? `<span class="ok">✓ fits (${money(cb - v)} under)</span>` : `<span class="over">▲ ${money(v - cb)} over</span>`}`; }).join(' · ')}` : 'Add the client\'s budget below (optional) to see which option fits.';
  const totR = sel.id === 'good' && priced ? priced.total : Math.round(T.total);
  const sumRows = sumRowsFor(T);
  const sumR = roundLines(sumRows.map(r => r[1]), totR), lineR = roundLines(sel.lines.map(l => l.total));
  $('#proBid').innerHTML = `<tr><th>Line</th><th class="n">Qty</th><th class="n hm">Materials</th><th class="n hm">Labor</th><th class="n">Total</th></tr>`
    + sel.lines.map((l, i) => `<tr><td>${esc(l.description)}<div class="small">${esc(l.unit)} @ ${rate(l.unitCost)}</div></td><td class="n">${l.qty}</td><td class="n hm">${money(l.materialCost)}</td><td class="n hm">${money(l.laborCost)}</td><td class="n">${money(lineR[i])}</td></tr>`).join('')
    + sumRows.map(([k], i) => `<tr class="tot"><td colspan="2">${k}</td><td class="hm"></td><td class="hm"></td><td class="n">${money(sumR[i])}</td></tr>`).join('')
    + `<tr class="total"><th colspan="2">${esc(sel.name)} total</th><th class="hm"></th><th class="hm"></th><th class="n">${money(totR)}</th></tr>`;
  const pf = bidProfit({ totals: T, settings: bid.settings || book.settings });
  $('#proBid').insertAdjacentHTML('beforeend', `<tr class="tot"><td colspan="2">Break-even ${money(pf.breakEven)} · net profit ${money(pf.netProfit)} (${pf.netMarginPct}% margin)</td><td class="hm"></td><td class="hm"></td><td></td></tr>`);
  let san = []; try { san = priceSanityChecks(take, bid, { tierId: sel.id }); } catch (e) { console.warn(e); }
  $('#proSanity').innerHTML = san.map(c => `<li class="${c.status === 'ok' ? 'info' : 'warn'}"><span>${ico(c.status === 'ok' ? 'check' : 'triangle-alert')}</span><span>${esc(c.message)}</span></li>`).join('');
}
const pickTier = e => { const b = e.target.closest('button[data-t]'); if (!b) return; tier = b.dataset.t; profile.tier = tier; lsSet(PKEY, JSON.stringify(profile)); renderBid(); renderImgs(); window.dispatchEvent(new Event('yardplan:bid')); };
$('#proTier').onclick = pickTier; $('#proTiers').onclick = pickTier;
// ---------- compliance ----------
function renderWarn() {
  const ic = { error: ico('octagon-alert'), warn: ico('triangle-alert'), info: ico('info') };
  $('#proWarn').innerHTML = warnings.map(w => `<li class="${w.level}"><span>${ic[w.level]}</span><span>${esc(w.message)}</span></li>`).join('');
}
// ---------- proposal ----------
function renderImgs() {
  const ph = window.overlayApi && window.overlayApi.hasPhoto(), n = ph ? window.overlayApi.items().length : 0;
  $('#proImgs').innerHTML = `<li class="${ph ? 'ok' : ''}">${ph ? '✓' : '○'} Before / after photo ${ph ? `(your photo with ${n} plant${n === 1 ? '' : 's'})` : '— optional: add the client\'s photo in the <a href="#" data-jgo="2">Photo and plan</a> step'}</li>
    <li class="${window.renderHook?.lastResult && !window.renderHook.lastResult.mock ? 'ok' : ''}">${window.renderHook?.lastResult && !window.renderHook.lastResult.mock ? '✓' : '○'} AI concept render of the client's yard</li><li class="ok">✓ Top-down site plan with dimensions</li><li class="ok">✓ Scope &amp; price for the <b>${esc(tier[0].toUpperCase() + tier.slice(1))}</b> option, plus the options table</li><li class="ok">✓ ${warnings.filter(w => w.level !== 'info').length} permit/safety flag(s) and standard notices</li>`;
}
let jsPdfP;
const loadJsPdf = () => jsPdfP || (jsPdfP = window.jspdf ? Promise.resolve() : new Promise((ok, bad) => { const s = document.createElement('script'); s.src = 'contractor/vendor/jspdf.umd.min.js'; s.onload = ok; s.onerror = () => { jsPdfP = null; bad(new Error('Could not load the PDF library')); }; document.head.appendChild(s); }));
// The 2D site plan image for the proposal is drawn ahead of time and cached by design signature, so the PDF builds instantly.
let shotCache = null, shotP = null;
const designSig = () => { try { return JSON.stringify(window.planApi?.serialize?.() || null); } catch { return ''; } };
function planShot() {
  if (!window.planApi) return Promise.resolve(null);
  const sig = designSig(); if (shotCache && shotCache.sig === sig) return Promise.resolve(shotCache.img);
  if (shotP) return shotP;
  return shotP = window.planApi.capture(1400, 'image/jpeg', .85, { spacing: true }).then(([img]) => { shotCache = { sig, img }; shotP = null; return img; }, e => { shotP = null; throw e; });
}
const prefetchShots = () => (window.requestIdleCallback || (f => setTimeout(f, 300)))(() => planShot().catch(e => console.warn(e)), { timeout: 2000 });
async function makeProposal() {
  const T = performance.now(), mark = n => (window.__pdfT = (window.__pdfT || []).concat(n + ':' + Math.round(performance.now() - T)));
  await refresh(); mark('refresh'); await loadJsPdf(); mark('jspdf');
  const ba = window.overlayApi && window.overlayApi.captureBeforeAfter(1600) || {};
  mark('ba'); const plan = await planShot(); mark('plan');
  const B = profile.business || {}, C = profile.client || {}, P = profile.project || {};
  return buildProposalPdf({ business: { ...B, color: hexRgb(B.colorHex) }, client: C,
    project: { title: P.title || 'Landscape design', date: new Date().toLocaleDateString(), zip: state.zip, zone: state.zoneLabel, budget: P.budget },
    images: { before: ba.before, after: (() => { const r = window.renderHook?.lastResult; return r && !r.mock ? (r.dataURL || r.imageUrl) : undefined; })(), plan },
    takeoff: take, bid, tier, warnings });
}
$('#proPdf').onclick = async () => {
  const b = $('#proPdf'); b.disabled = true; $('#proPdfMsg').textContent = 'Building your proposal…';
  try { const doc = await makeProposal(); const name = ((profile.client || {}).name || 'client').replace(/[^\w-]+/g, '-'); const fn = `proposal-${name}.pdf`; doc.save(fn); const url = URL.createObjectURL(doc.output('blob'));
    $('#proPdfMsg').innerHTML = `Done: ${doc.getNumberOfPages()} pages, saved as ${esc(fn)}. <a href="${url}" target="_blank" rel="noopener" id="proPdfOpen">Open PDF</a>`; }
  catch (e) { console.error(e); $('#proPdfMsg').textContent = 'Sorry, the PDF could not be built: ' + e.message; }
  finally { b.disabled = false; }
};
// Irrigation parts from the care guide (yardplan-guides plan.priceBookItems / takeoffLines)
let irr = null;
function addIrrigation(plan) {
  for (const [k, v] of Object.entries(plan.priceBookItems || {})) if (!book.items[k]?.overridden) book.items[k] = { key: k, name: v.name, unit: v.unit, unitCost: v.unitCost, laborPerUnit: null, laborHoursPerUnit: v.laborHoursPerUnit, source: 'irrigation-guide (example price)', isEstimate: true };
  irr = { lines: plan.takeoffLines || [], valves: plan.valveCount }; try { saveToStorage(book); } catch {}
  if (design) recompute(); return Object.keys(plan.priceBookItems || {}).length;
}
// E-sign record retention (days; 0 = keep until deleted), sent as retentionDays when a proposal is shared for e-sign.
const RKEY = 'yardplan.esign.retentionDays';
$('#proRetention').value = localStorage.getItem(RKEY) ?? '2557';
$('#proRetention').onchange = e => lsSet(RKEY, e.target.value);
const esignRetentionDays = () => +$('#proRetention').value;
window.proApi = { bidView, editLine, lineEntry, lineRef, setJob, setBusiness, profile: () => JSON.parse(JSON.stringify(profile)), setTier: t => { tier = t; profile.tier = t; lsSet(PKEY, JSON.stringify(profile)); if (bid) { renderBid(); renderImgs(); window.dispatchEvent(new Event('yardplan:bid')); } }, recompute, bookReady, total: () => priced?.total ?? null, shotsReady: () => !!shotCache && shotCache.sig === designSig(), esignRetentionDays, addIrrigation, irrigation: () => irr, refresh, makeProposal, book: () => book, bid: () => bid, take: () => take, warnings: () => warnings };
window.onProShow = () => { refresh(); prefetchShots(); };
window.addEventListener('yardplan:design', () => { if (document.body.dataset.mode === 'pro') prefetchShots(); });
if ($('#tab-pro').classList.contains('active')) refresh();
