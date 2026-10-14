// bid.js — bid generator: takeoff + price book -> line items, subtotals, totals (optionally Good/Better/Best).
// hourlyRate in the price book is the BURDENED LABOR COST per billable hour (not the billed rate); overhead and markup are added on top.
import { priceFor, plantPriceFor, laborCostPerUnit, difficultyFactor, DEFAULT_TIERS } from './pricebook.js';
const c2 = n => Math.round(n * 100) / 100;

// ---- margin <-> markup ----
/** marginToMarkup(0.13) -> 0.1494 (fractions). markup = m / (1 - m) */
export const marginToMarkup = m => { if (!(m < 1)) throw new Error('margin_must_be_below_1'); return m / (1 - m); };
/** markupToMargin(0.15) -> 0.1304. margin = k / (1 + k) */
export const markupToMargin = k => k / (1 + k);
export const marginPctToMarkupPct = p => c2(marginToMarkup(p / 100) * 100);
export const markupPctToMarginPct = p => c2(markupToMargin(p / 100) * 100);
/** effectiveSellRate(settings) = hourlyRate × (1+overhead) × (1+labor markup) — what a labor hour actually bills at */
export const effectiveSellRate = s => c2((+s.hourlyRate || 0) * (1 + (+s.overheadPct || 0) / 100) * (1 + markupPctFor(s, 'labor') / 100));
const markupPctFor = (s, bucket) => { const m = s.markups; if (!m) return +s.markupPct || 0;
  const v = bucket === 'plant' ? m.plants ?? m.materials : m[bucket === 'material' ? 'materials' : bucket === 'sub' ? 'subs' : bucket];
  return v != null ? +v : +s.markupPct || 0; };

function line(category, key, description, qty, unit, unitCost, laborUnit, laborHours, costType, extra = {}) {
  return { category, key, description, qty, unit, unitCost, costType, materialCost: c2(unitCost * qty), laborUnit, laborHours,
    laborCost: c2(laborUnit * qty), total: c2(unitCost * qty + laborUnit * qty), ...extra };
}
function buildLines(t, book, tier, opts) {
  const s = book.settings, rate = +s.hourlyRate || 0, mm = tier ? tier.materialMult ?? 1 : 1, lm = tier ? tier.laborMult ?? 1 : 1;
  const dfAll = difficultyFactor(opts.difficulty ?? s.siteDifficulty), dfBy = opts.difficultyByKey || {};
  const ov = (tier && tier.overrides) || {};
  const lines = [];
  for (const l of t.lines) {
    const e = { ...(priceFor(book, l.key) || { name: l.name, unit: l.unit, unitCost: 0 }), ...(ov[l.key] || {}) };
    const df = difficultyFactor(dfBy[l.key] ?? dfAll);
    const unitCost = c2((+e.unitCost || 0) * (ov[l.key]?.unitCost != null ? 1 : mm));
    const laborUnit = c2(laborCostPerUnit(e, rate, df) * lm);
    const hours = e.laborPerUnit == null ? c2((+e.laborHoursPerUnit || 0) * df * l.qty * lm) : null;
    lines.push(line('material', l.key, l.name, l.qty, l.unit, unitCost, laborUnit, hours, e.costType || 'material', df !== 1 ? { difficulty: df } : {}));
  }
  for (const p of t.plants) {
    const e = { ...plantPriceFor(book, p), ...(ov['plant:' + p.id] || {}) };
    const df = difficultyFactor(dfBy['plant:' + p.id] ?? dfAll);
    const unitCost = c2((+e.unitCost || 0) * mm), laborUnit = c2(laborCostPerUnit(e, rate, df) * lm);
    lines.push(line('plant', 'plant:' + p.id, `${p.name} (${p.sci})`, p.count, p.container, unitCost, laborUnit,
      e.laborPerUnit == null ? c2((+e.laborHoursPerUnit || 0) * df * p.count * lm) : null, 'plant', df !== 1 ? { difficulty: df } : {}));
  }
  for (const x of book.extras || []) lines.push(line('other', x.key || 'extra', x.description, x.qty ?? 1, x.unit || 'ea', +x.unitCost || 0, +x.laborUnit || 0, null, x.costType || 'material'));
  if (opts.autoFees !== false) lines.push(...feeLines(t, s, opts));
  return lines;
}
/** feeLines(takeoff, settings, {deliveries?, haulCuYd?, dumpLoads?}) -> automatic mobilization / delivery / dump lines (pass-through costType 'fee') */
export function feeLines(t, s, o = {}) {
  const out = [], fee = (key, desc, qty, unit, amt) => out.push(line('fee', key, desc, qty, unit, c2(amt), 0, null, 'fee', { auto: true }));
  if (+s.mobilizationFee > 0) fee('fee:mobilization', 'Mobilization (crew & equipment)', 1, 'job', +s.mobilizationFee);
  const bulk = t.lines.filter(l => l.unit === 'cu yd' && !['grading', 'excavation'].includes(l.key)).reduce((a, l) => a + l.qty, 0);
  const deliveries = o.deliveries ?? (bulk > 0 ? Math.ceil(bulk / (+s.bulkLoadCuYd || 10)) : 0);
  if (+s.deliveryFeeBulk > 0 && deliveries > 0) fee('fee:delivery', `Bulk material delivery (${c2(bulk)} cu yd)`, deliveries, 'load', +s.deliveryFeeBulk);
  const haul = (o.haulCuYd ?? 0) + t.lines.filter(l => l.key === 'excavation').reduce((a, l) => a + l.qty, 0);
  const loads = o.dumpLoads ?? (haul > 0 ? Math.ceil(haul / (+s.dumpLoadCuYd || 6)) : 0);
  if (+s.dumpFeePerLoad > 0 && loads > 0) fee('fee:dump', `Dump / disposal fees (${c2(haul)} cu yd)`, loads, 'load', +s.dumpFeePerLoad);
  return out;
}

/**
 * totalsFor(lines, settings)
 * Buckets by line.costType: material|plant -> materials, equipment, sub -> subs, fee -> fees; laborCost -> labor.
 * overhead = direct × overhead% (direct = materials+equipment+subs+labor [+fees if feesMarkedUp]);
 * markup = Σ bucket × (1+overhead%) × bucket markup% (settings.markups {materials,plants,labor,equipment,subs}; else markupPct for all);
 * fees pass through (unless feesMarkedUp); minimumJobCharge lifts subtotal; tax on materials (or 'all').
 * Lines flagged adjustment:true (the minimum-charge line) are ignored as input and recomputed.
 */
export function totalsFor(lines, s) {
  const L = lines.filter(l => !l.adjustment), sum = f => c2(L.reduce((a, l) => a + f(l), 0));
  const by = t => sum(l => (l.costType || 'material') === t ? l.materialCost : 0);
  const plants = by('plant'), materials = c2(by('material') + plants), equipment = by('equipment'), subs = by('sub'), fees = by('fee');
  const labor = sum(l => l.laborCost), laborHours = sum(l => l.laborHours || 0);
  const fm = !!s.feesMarkedUp, oh = (+s.overheadPct || 0) / 100;
  const direct = c2(materials + equipment + subs + labor + (fm ? fees : 0)), overhead = c2(direct * oh);
  const mk = (amt, b) => amt * (1 + oh) * markupPctFor(s, b) / 100;
  const markup = c2(mk(materials - plants, 'material') + mk(plants, 'plant') + mk(labor, 'labor') + mk(equipment, 'equipment') + mk(subs, 'sub') + (fm ? mk(fees, 'material') : 0));
  let subtotal = c2(direct + overhead + markup + (fm ? 0 : fees));
  const min = +s.minimumJobCharge || 0, minimumAdjustment = min > subtotal ? c2(min - subtotal) : 0; subtotal = c2(subtotal + minimumAdjustment);
  const tax = c2((s.taxOn === 'all' ? subtotal : materials) * (+s.taxPct || 0) / 100);
  return { materials, plants, equipment, subs, fees, labor, laborHours, direct, overhead, markup, minimumAdjustment, subtotal, tax, total: c2(subtotal + tax) };
}
const withMinimumLine = (lines, totals) => totals.minimumAdjustment > 0
  ? [...lines, line('fee', 'fee:minimum', 'Minimum job charge adjustment', 1, 'job', totals.minimumAdjustment, 0, null, 'fee', { auto: true, adjustment: true })] : lines;

/**
 * generateBid(takeoffResult, priceBook, { tiers?, autoFees=true, difficulty?, difficultyByKey?, deliveries?, haulCuYd?, dumpLoads? })
 *  -> { lines, subtotals:{material,plant,other,fee}, totals, settings, tiers?:[{id,name,lines,totals}], createdAt }
 */
export function generateBid(t, book, opts = {}) {
  const raw = buildLines(t, book, null, opts), totals = totalsFor(raw, book.settings), lines = withMinimumLine(raw, totals);
  const sub = cat => c2(lines.filter(l => l.category === cat).reduce((a, l) => a + l.total, 0));
  const bid = { createdAt: new Date().toISOString(), settings: { ...book.settings }, lines,
    subtotals: { material: sub('material'), plant: sub('plant'), other: sub('other'), fee: sub('fee') }, totals };
  const tiers = opts.tiers === true ? DEFAULT_TIERS : opts.tiers || book.settings.tiers;
  if (tiers && tiers.length) bid.tiers = tiers.map(tr => { const ls = buildLines(t, book, tr, opts), tt = totalsFor(ls, book.settings); return { id: tr.id, name: tr.name, lines: withMinimumLine(ls, tt), totals: tt }; });
  return bid;
}
export const bidToJSON = b => JSON.stringify(b);
