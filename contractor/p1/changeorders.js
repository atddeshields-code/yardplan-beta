// changeorders.js — change orders against an accepted bid (bid.js output). Pure functions.
import { totalsFor } from '../bid.js';
const c2 = n => Math.round(n * 100) / 100;
const recalc = l => ({ ...l, materialCost: c2(l.unitCost * l.qty), laborCost: c2(l.laborUnit * l.qty), total: c2((l.unitCost + l.laborUnit) * l.qty),
  laborHours: l.laborHours != null && l._hpu != null ? c2(l._hpu * l.qty) : l.laborHours });

/**
 * createChangeOrder(baseBid, { add:[line], remove:[key], modify:[{key, qty?, unitCost?, laborUnit?, description?}] }, { reason, version?, settings? })
 * baseBid: accepted bid (or current revision from applyChangeOrders). Returns
 * { version, reason, createdAt, changes:[{type,key,before,after,delta}], lines, prevTotals, totals, delta:{subtotal,tax,total} }
 */
export function createChangeOrder(base, { add = [], remove = [], modify = [] } = {}, { reason = '', version, settings } = {}) {
  if (!reason || !String(reason).trim()) throw new Error('reason_required');
  const s = settings || base.settings;
  const prevTotals = base.totals || totalsFor(base.lines, s);
  const byKey = new Map(base.lines.map(l => [l.key, { ...l, _hpu: l.laborHours != null && l.qty ? l.laborHours / l.qty : null }]));
  const changes = [];
  for (const k of remove) { const b = byKey.get(k); if (!b) throw new Error('unknown_line:' + k); byKey.delete(k); changes.push({ type: 'removed', key: k, before: strip(b), after: null, delta: c2(-b.total) }); }
  for (const m of modify) { const b = byKey.get(m.key); if (!b) throw new Error('unknown_line:' + m.key);
    const a = recalc({ ...b, ...pick(m, ['qty', 'unitCost', 'laborUnit', 'description', 'unit']) }); byKey.set(m.key, a);
    changes.push({ type: 'modified', key: m.key, before: strip(b), after: strip(a), delta: c2(a.total - b.total) }); }
  for (const x of add) { const key = x.key || 'co:' + (byKey.size + changes.length + 1); if (byKey.has(key)) throw new Error('duplicate_line:' + key);
    const a = recalc({ category: x.category || 'other', key, description: x.description || key, qty: +x.qty || 1, unit: x.unit || 'ea',
      unitCost: +x.unitCost || 0, laborUnit: +x.laborUnit || 0, laborHours: null }); byKey.set(key, a);
    changes.push({ type: 'added', key, before: null, after: strip(a), delta: a.total }); }
  const lines = [...byKey.values()].map(strip), totals = totalsFor(lines, s);
  return { version: version ?? (base.version || 0) + 1, reason: String(reason).trim(), createdAt: new Date().toISOString(), changes, lines, settings: s,
    prevTotals, totals, delta: { direct: c2(totals.direct - prevTotals.direct), subtotal: c2(totals.subtotal - prevTotals.subtotal), tax: c2(totals.tax - prevTotals.tax), total: c2(totals.total - prevTotals.total) } };
}
const pick = (o, ks) => Object.fromEntries(ks.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
const strip = ({ _hpu, ...l }) => l;
/** applyChangeOrders(acceptedBid, [specs]) -> {current:{lines,totals,version,settings}, orders:[co]} — chains versions 1..n */
export function applyChangeOrders(bid, specs) {
  let cur = { lines: bid.lines, totals: bid.totals, settings: bid.settings, version: 0 }; const orders = [];
  for (const sp of specs) { const co = createChangeOrder(cur, sp.changes || sp, { reason: sp.reason, settings: bid.settings }); orders.push(co); cur = { lines: co.lines, totals: co.totals, settings: bid.settings, version: co.version }; }
  return { current: cur, orders };
}
