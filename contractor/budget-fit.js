// budget-fit.js — homeowner budget fit + the SINGLE pricing path shared by the homeowner "hire a pro" total and the Pro bid.
//
// ROOT CAUSE of the ~2x gap (read from /workspace/yardplan, not edited):
//  1) flow.js priceDesign() calls takeoff(design, { includeLawn: true }) unconditionally, so every "hire a pro" estimate adds
//     sod + topsoil for the WHOLE leftover yard (yard w×d minus beds/paths). pro.js only adds lawn when the contractor ticks
//     #proLawn (unchecked by default). On the sample design that alone is +$6.1k (10,463 -> 16,545).
//  2) flow.js then takes `pro = tiers[1]`, i.e. the pricebook "Better" tier (materials ×1.25, labor ×1.1), and calls it the
//     pro total; the Pro bid's headline is the base (un-multiplied) bid. Another +19% (16,545 -> 19,717 = 1.88x the bid).
//  Overhead/markup are NOT double counted, and both use the same contractor price book (no retail-vs-wholesale split).
//  Fix: priceProject() below is the only place a pro price is computed; homeownerEstimate() and proBid() both call it with the
//  same includeLawn flag and no tier multiplier, so they are identical by construction.
import { irrigationPlan, irrigationLines, irrigationMode } from './irrigation-takeoff.js';
import { takeoff as runTakeoff } from './takeoff.js';
import { generateBid } from './bid.js';
import { REBATE_RULES } from './data/rebates.js';

// ---------------------------------------------------------------- whole-dollar rounding
/** roundLines(amounts[], target?) -> integer dollars. Largest-remainder (Hamilton) rounding: every line is floor or ceil of its
 *  exact value, and Σ rounded == target (default Math.round(Σ exact)). Ties go to the earlier line. Deterministic. */
export function roundLines(amounts, target) {
  const cents = amounts.map(a => Math.round((+a || 0) * 100));
  const tot = target ?? Math.round(cents.reduce((s, c) => s + c, 0) / 100);
  const fl = cents.map(c => Math.floor(c / 100));
  let left = tot - fl.reduce((s, v) => s + v, 0);
  const order = cents.map((c, i) => [c - fl[i] * 100, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const out = fl.slice();
  for (let k = 0; left > 0 && order.length; k = (k + 1) % order.length, left--) out[order[k][1]]++;
  for (let k = order.length - 1; left < 0 && order.length; k = (k - 1 + order.length) % order.length, left++) out[order[k][1]]--;
  return out;
}

// ---------------------------------------------------------------- the single pricing path
const markupPct = (s, bucket) => { const m = s.markups; if (!m) return +s.markupPct || 0;
  const v = bucket === 'plant' ? m.plants ?? m.materials : m[bucket === 'material' ? 'materials' : bucket === 'sub' ? 'subs' : bucket];
  return v != null ? +v : +s.markupPct || 0; };

/** buildTakeoff(design, { catalog, includeLawn=false }) — takeoff.js, but plants may carry a per-item `container` (budget-fit
 *  downsizing) so two plants of one species in different sizes are priced separately. */
export function buildTakeoff(design, { catalog, includeLawn = false } = {}) {
  const items = design.items || [], plants = items.filter(i => i.kind === 'plant'), rest = items.filter(i => i.kind !== 'plant' && !i.existing); // existing site surfaces (auto plan / survey) aren't new work
  const base = runTakeoff({ ...design, items: [...rest, ...plants.filter(p => !p.container)] }, { catalog, includeLawn, containerSizes: design.containerSizes });
  const groups = new Map(); for (const p of plants.filter(p => p.container)) { const k = p.id + '|' + p.container; (groups.get(k) || groups.set(k, []).get(k)).push(p); }
  for (const [k, ps] of groups) { const [id, c] = k.split('|');
    for (const row of runTakeoff({ items: ps }, { catalog, containerSizes: { [id]: c } }).plants) base.plants.push({ ...row, id: row.id + '@' + c, key: 'plant:' + row.id + '@' + c, speciesId: row.id }); }
  // book.plants lookups use p.id first: keep the container lookup working for the suffixed ids
  base.totals.plantCount = base.plants.reduce((s, p) => s + p.count, 0);
  // irrigation (design.irrigation = 'drip' | 'spray'): parts from the guides generator, same lines for homeowner and pro
  if (irrigationMode(design) !== 'none') { try { const plan = irrigationPlan(design, { catalog }); base.lines.push(...irrigationLines(plan)); base.irrigation = plan; } catch (e) { base.irrigationError = e.message; } }
  return base;
}

/**
 * priceProject({ design | takeoff, book, catalog, includeLawn=false, bidOpts }) -> PricedProject
 *  { takeoff, bid (generateBid output, untouched), lines:[{key,category,description,qty,unit,exact,amount}], total, exactTotal }
 *  lines[].amount = whole-dollar SELL price of that line (its cost × (1+overhead) × (1+markup bucket); fees pass through; plus
 *  minimum-charge and tax lines). Σ amount === total === Math.round(bid.totals.total).
 */
export function priceProject({ design, takeoff, book, catalog, includeLawn = false, bidOpts = {} }) {
  const t = takeoff || buildTakeoff(design, { catalog, includeLawn });
  const bid = generateBid(t, book, { autoFees: book.settings.autoFees !== false, ...bidOpts, tiers: null });
  const s = book.settings, oh = 1 + (+s.overheadPct || 0) / 100, fm = !!s.feesMarkedUp, T = bid.totals;
  const rows = bid.lines.map(l => {
    const ct = l.costType || 'material';
    let exact;
    if (l.adjustment) exact = l.total;
    else if (ct === 'fee') exact = fm ? l.materialCost * oh * (1 + markupPct(s, 'material') / 100) : l.materialCost;
    else exact = l.materialCost * oh * (1 + markupPct(s, ct) / 100) + l.laborCost * oh * (1 + markupPct(s, 'labor') / 100);
    return { key: l.key, category: l.category, description: l.description, qty: l.qty, unit: l.unit, exact };
  });
  if (T.tax) rows.push({ key: 'tax', category: 'tax', description: `Sales tax ${s.taxPct}%`, qty: 1, unit: 'job', exact: T.tax });
  const total = Math.round(T.total), amt = roundLines(rows.map(r => r.exact), total);
  return { takeoff: t, bid, lines: rows.map((r, i) => ({ ...r, exact: Math.round(r.exact * 100) / 100, amount: amt[i] })), total, exactTotal: T.total };
}

/** diyLines(takeoff, book, { wasteFactor=1.1 }) -> whole-dollar DIY lines: materials/plants/equipment rental at book unit cost
 *  × waste, no labor, overhead or markup. */
export function diyLines(t, book, { wasteFactor = 1.1 } = {}) {
  const bid = generateBid(t, book, { autoFees: false, tiers: null });
  const rows = bid.lines.map(l => ({ key: l.key, category: l.category, description: l.description, qty: l.qty, unit: l.unit, exact: l.materialCost * wasteFactor }));
  const amt = roundLines(rows.map(r => r.exact));
  return rows.map((r, i) => ({ ...r, exact: Math.round(r.exact * 100) / 100, amount: amt[i] }));
}
const sum = ls => ls.reduce((s, l) => s + l.amount, 0);

/** homeownerEstimate(design, book, { catalog, includeLawn=false, zip, utility, turfSf, date }) ->
 *  { pro:{lines,total}, diy:{lines,total}, rebate, bid } — pro.total is the SAME number proBid() returns. */
export function homeownerEstimate(design, book, opts = {}) {
  const P = priceProject({ design, book, catalog: opts.catalog, includeLawn: opts.includeLawn });
  const diy = diyLines(P.takeoff, book);
  const rebate = opts.turfSf ? computeRebate({ zip: opts.zip, utility: opts.utility, turfSf: opts.turfSf, date: opts.date, eligibleExpenses: opts.eligibleExpenses }) : null;
  return { pro: { lines: P.lines, total: P.total }, diy: { lines: diy, total: sum(diy) }, rebate, bid: P.bid, takeoff: P.takeoff };
}
/** proBid(design, book, { catalog, includeLawn=false, tiers? }) -> generateBid output + { rounded:{lines,total} }.
 *  rounded.total === homeownerEstimate(...).pro.total; bid.tiers (if requested) are optional Good/Better/Best upsells only. */
export function proBid(design, book, opts = {}) {
  const P = priceProject({ design, book, catalog: opts.catalog, includeLawn: opts.includeLawn });
  const bid = opts.tiers ? generateBid(P.takeoff, book, { autoFees: book.settings.autoFees !== false, tiers: opts.tiers }) : P.bid;
  return { ...bid, rounded: { lines: P.lines, total: P.total } };
}

// ---------------------------------------------------------------- rebates
const iso = d => (d instanceof Date ? d.toISOString() : String(d || new Date().toISOString())).slice(0, 10);
const inWindow = (r, day) => (!r.effectiveFrom || day >= r.effectiveFrom) && (!r.effectiveTo || day <= r.effectiveTo);
const norm = s => String(s || '').toLowerCase().trim();
/** lookupRebates({ zip, utility, date, rules, includeUnverified=false }) -> [{ rule, matchedBy:'utility'|'zip', active }] */
export function lookupRebates({ zip, utility, date, rules = REBATE_RULES, includeUnverified = false } = {}) {
  const day = iso(date), u = norm(utility), z = String(zip || '').slice(0, 5);
  const out = [];
  for (const r of rules) {
    if (!includeUnverified && !r.verified) continue;
    let by = null;
    if (u && r.utilities.some(a => a === u || u.includes(a))) by = 'utility';
    else if (!u && z && !r.addOnOnly && (r.zipPrefixes || []).some(p => z.startsWith(p))) by = 'zip';
    if (by) out.push({ rule: r, matchedBy: by, active: inWindow(r, day) && !r.closed });
  }
  return out;
}
/** amountFor(rule, sqft) -> uncapped-by-receipts $ for one rule */
export function amountFor(r, sqft) {
  if (r.minSqFt && sqft < r.minSqFt) return 0;
  const sf = r.maxSqFt ? Math.min(sqft, r.maxSqFt) : sqft;
  let a;
  if (r.flatTiers) a = r.flatTiers.filter(t => sf >= t.minSqFt).reduce((m, t) => Math.max(m, t.amount), 0);
  else if (r.rateTiers) { a = 0; let prev = 0; for (const t of r.rateTiers) { const hi = t.upToSqFt ?? Infinity; if (sf > prev) a += (Math.min(sf, hi) - prev) * t.rate; prev = hi; } }
  else a = sf * (r.ratePerSqFt || 0);
  return r.capUsd != null ? Math.min(a, r.capUsd) : a;
}
/**
 * computeRebate({ zip, utility, turfSf, date=today, eligibleExpenses?, rules?, includeUnverified? }) ->
 *  { amount (whole $), programs:[{id,name,amount,sourceUrl,preApprovalRequired,verified}], preApprovalRequired, paidAs,
 *    needsUtilityConfirmation, alternatives:[...], notes[] }
 * Only LIVE turf sq ft. Superseded rules are dropped; add-ons stack. ZIP-only matches pick the most conservative program.
 */
export function computeRebate({ zip, utility, turfSf = 0, date, eligibleExpenses, rules = REBATE_RULES, includeUnverified = false } = {}) {
  const notes = [], found = lookupRebates({ zip, utility, date, rules, includeUnverified });
  const active = found.filter(f => f.active);
  for (const f of found) if (!f.active) notes.push(`${f.rule.name}: outside its application window or closed on ${iso(date)}.`);
  const zipOnly = active.length > 0 && active.every(f => f.matchedBy === 'zip');
  // cross-agency supersession needs a known utility (a ZIP can't tell LADWP from a neighbouring MWD agency); same-agency always applies
  let picks = active.filter(f => !active.some(g => (g.rule.supersedes || []).includes(f.rule.id) && (!zipOnly || g.rule.agency === f.rule.agency)));
  let alternatives = [];
  if (zipOnly && picks.length > 1) {
    const scored = picks.map(f => ({ f, a: amountFor(f.rule, turfSf) })).sort((x, y) => x.a - y.a);
    alternatives = scored.slice(1).map(x => ({ id: x.f.rule.id, name: x.f.rule.name, amount: Math.round(x.a) }));
    picks = [scored[0].f]; notes.push('Matched by ZIP only; showing the most conservative program. Select your water utility for an exact match.');
  }
  // add-ons that stack (utility-matched only)
  const progs = picks.map(f => ({ r: f.rule, a: amountFor(f.rule, turfSf) }));
  for (const p of [...progs]) for (const sid of p.r.stacksWith || []) { const add = active.find(f => f.rule.id === sid && !progs.some(q => q.r.id === sid)); if (add) progs.push({ r: add.rule, a: amountFor(add.rule, turfSf) }); }
  let total = progs.reduce((s, p) => s + p.a, 0);
  if (eligibleExpenses != null && progs.some(p => p.r.limitedToReceipts) && total > eligibleExpenses) { total = eligibleExpenses; notes.push('Limited to eligible receipts.'); }
  return { amount: Math.floor(total), programs: progs.map(p => ({ id: p.r.id, name: p.r.name, amount: Math.floor(p.a), sourceUrl: p.r.sourceUrl, preApprovalRequired: p.r.preApprovalRequired, verified: p.r.verified, effectiveTo: p.r.effectiveTo })),
    preApprovalRequired: progs.some(p => p.r.preApprovalRequired), paidAs: progs.length ? 'reimbursement' : null,
    needsUtilityConfirmation: !!zipOnly, alternatives, notes };
}

// ---------------------------------------------------------------- budget fit (greedy MCKP)
export const LOCKED_KINDS = ['grade', 'drip', 'excavation', 'drain', 'irrigation'];   // grading / drainage / irrigation
export const CATEGORY_WEIGHT = { path: 1.0, dg: 0.8, plant: 0.8, wall: 0.6, mulch: 0.4, gravel: 0.4, lawn: 0.5 };
const DIYABLE = ['mulch', 'gravel', 'dg', 'plant'];
const LADDER = ['4 in pot', '1 gal', '5 gal', '15 gal', '24 in box'];
const LEVER_ORDER = { diy: 0, downsize: 1, swap: 2, reduce: 3, defer: 4, remove: 5, designed: 6 };
export const TIER_MULTS = { good: 0.85, better: 1.0, best: 1.35 };
const anchorOf = (it, i) => it.renderAnchor || `item-${i}`;

function containerOf(it, catalog) { if (it.container) return it.container;
  const p = (catalog?.plants || []).find(c => c.id === it.id); const type = catalog?.plant3d?.[it.id]?.model === 'succulent' ? 'succulent' : p?.type;
  return ({ tree: '15 gal', shrub: '5 gal', perennial: '1 gal', grass: '1 gal', groundcover: '4 in pot', succulent: '5 gal' })[type] || '1 gal'; }

function optionsFor(it, i, req) {
  const imp = it.impact ?? (CATEGORY_WEIGHT[it.kind] ?? 0.3) * (it.kind === 'plant' ? 0.05 : it.kind === 'wall' ? Math.min(1, (+it.w || 0) * (+it.h || 0) / 60) : Math.min(1, ((+it.w || 0) * (+it.d || 0)) / 200));
  const o = [{ lever: 'designed', label: 'As designed', item: it, doer: 'pro', impact: imp }];
  const canDiy = req.mode === 'diy' ? DIYABLE.includes(it.kind) : req.mode === 'mix' ? (req.diyTasks || []).includes(it.kind) && DIYABLE.includes(it.kind) : false;
  if (canDiy) o.push({ lever: 'diy', label: 'You do it', item: it, doer: 'you', impact: imp });
  if (it.kind === 'plant') { const c = containerOf(it, req.catalog), k = LADDER.indexOf(c);
    if (k > 0) { const sm = { ...it, container: LADDER[k - 1] }; o.push({ lever: 'downsize', label: `${LADDER[k - 1]} instead of ${c}`, item: sm, doer: 'pro', impact: imp * 0.7 });
      if (canDiy) o.push({ lever: 'downsize', label: `${LADDER[k - 1]}, you plant it`, item: sm, doer: 'you', impact: imp * 0.7 }); } }
  if (it.kind === 'path') { o.push({ lever: 'swap', label: 'Decomposed granite, same shape', item: { ...it, kind: 'dg' }, doer: 'pro', impact: imp * 0.65 });
    o.push({ lever: 'swap', label: 'Gravel, same shape', item: { ...it, kind: 'gravel' }, doer: 'pro', impact: imp * 0.5 }); }
  if (['path', 'dg', 'mulch', 'gravel'].includes(it.kind) && it.w * it.d > 120) { const f = Math.sqrt(Math.max(120 / (it.w * it.d), 0.7));
    o.push({ lever: 'reduce', label: 'Smaller area', item: { ...it, w: +(it.w * f).toFixed(2), d: +(it.d * f).toFixed(2) }, doer: 'pro', impact: imp * 0.7 }); }
  o.push({ lever: 'defer', label: 'Phase 2 (later)', item: null, doer: 'pro', impact: imp * 0.4, deferred: true });
  if (it.kind !== 'wall') o.push({ lever: 'remove', label: 'Leave out (mulch fill)', item: null, doer: 'pro', impact: 0 });
  return o;
}

/** fitBudget(req) -> FitResult. req: { design, book, catalog, budget, mode:'pro'|'diy'|'mix', diyTasks?, mustHaves?:[anchor],
 *  zip?, utility?, existing?:{turfSf}, date?, countRebate=false, tier?, preferDiy? } */
export function fitBudget(req) {
  // repair: per-item costs exclude job-level fees/minimum/rounding, so re-fit with a tighter internal budget if the priced total overshoots
  let shrink = 0, r;
  for (let k = 0; k < 6; k++) { r = fitCore(req, shrink); if (r.belowMinimum || r.total <= req.budget) return r; shrink += r.total - req.budget + 1; }
  return r;
}
function fitCore(req, shrink) {
  const items = req.design.items || [], must = new Set(req.mustHaves || []);
  const cpct = req.mode === 'pro' ? 0.10 : 0.15;
  const nodes = items.map((it, i) => {
    const anchor = anchorOf(it, i), locked = !!it.locked || must.has(anchor) || LOCKED_KINDS.includes(it.kind);
    const opts = locked ? [{ lever: 'designed', label: 'As designed (locked)', item: it, doer: 'pro', impact: 1 }] : optionsFor(it, i, req);
    for (const o of opts) o.cost = o.item ? (o.doer === 'you' ? sum(diyLines(buildTakeoff({ items: [o.item] }, { catalog: req.catalog }), req.book))
      : priceProject({ design: { items: [o.item] }, book: { ...req.book, settings: { ...req.book.settings, minimumJobCharge: 0 } }, catalog: req.catalog, bidOpts: { autoFees: false } }).total) : 0;
    return { i, it, anchor, locked, opts, sel: 0 };
  });
  const rebate = req.existing?.turfSf ? computeRebate({ zip: req.zip, utility: req.utility, turfSf: req.existing.turfSf, date: req.date }) : null;
  const B = req.budget / (1 + cpct) - shrink / (1 + cpct) + (req.countRebate && rebate ? rebate.amount : 0);
  const cost = () => nodes.reduce((s, n) => s + n.opts[n.sel].cost, 0);
  const pref = o => (req.preferDiy && o.doer === 'you' ? -1 : 0) + LEVER_ORDER[o.lever];
  const changes = [];
  const minViable = nodes.reduce((s, n) => s + (n.locked ? n.opts[0].cost : Math.min(...n.opts.map(o => o.cost))), 0);
  let belowMinimum = false;
  if (minViable > B) { belowMinimum = true; for (const n of nodes) if (!n.locked) n.sel = n.opts.reduce((b, o, j) => o.cost < n.opts[b].cost ? j : b, 0); }
  else while (cost() > B) {
    let best = null;
    for (const n of nodes) { if (n.locked) continue; const cur = n.opts[n.sel];
      n.opts.forEach((o, j) => { if (o.cost >= cur.cost) return; const saved = cur.cost - o.cost, lost = Math.max(0, cur.impact - o.impact), ratio = saved / Math.max(1e-6, lost);
        if (!best || ratio > best.ratio + 1e-9 || (Math.abs(ratio - best.ratio) <= 1e-9 && pref(o) < pref(best.o))) best = { n, j, o, saved, lost, ratio }; }); }
    if (!best) break;
    changes.push({ anchor: best.n.anchor, itemIndex: best.n.i, from: best.n.opts[best.n.sel].label, to: best.o.label, lever: best.o.lever, saved: Math.round(best.saved), impactLost: +best.lost.toFixed(4) });
    best.n.sel = best.j;
  }
  // upgrade pass: spend leftover on best impact-per-$ moves back toward the design
  for (;;) { let up = null; const room = B - cost();
    for (const n of nodes) { if (n.locked) continue; const cur = n.opts[n.sel];
      n.opts.forEach((o, j) => { const add = o.cost - cur.cost, gain = o.impact - cur.impact; if (add <= 0 || gain <= 0 || add > room) return; const r = gain / add; if (!up || r > up.r) up = { n, j, o, add, gain, r }; }); }
    if (!up) break;
    changes.push({ anchor: up.n.anchor, itemIndex: up.n.i, from: up.n.opts[up.n.sel].label, to: up.o.label, lever: 'upgrade', saved: -Math.round(up.add), impactLost: -+up.gain.toFixed(4) });
    up.n.sel = up.j;
  }
  // final pricing through the single path: pro-installed items priced together (fees, minimum), DIY items at materials
  const pick = nodes.map(n => ({ n, o: n.opts[n.sel] }));
  const proItems = pick.filter(p => p.o.item && p.o.doer === 'pro').map(p => p.o.item), diyItems = pick.filter(p => p.o.item && p.o.doer === 'you').map(p => p.o.item);
  const pro = proItems.length ? priceProject({ design: { ...req.design, items: proItems }, book: req.book, catalog: req.catalog }) : { lines: [], total: 0 };
  const diy = diyItems.length ? diyLines(buildTakeoff({ items: diyItems }, { catalog: req.catalog }), req.book) : [];
  const lines = [...pro.lines.map(l => ({ ...l, doer: 'pro' })), ...diy.map(l => ({ ...l, doer: 'you' }))];
  const subtotal = sum(lines), contingency = Math.round(subtotal * cpct), total = subtotal + contingency;
  const deferred = pick.filter(p => p.o.deferred).map(p => ({ anchor: p.n.anchor, kind: p.n.it.kind, cost: Math.round(p.n.opts[0].cost) }));
  const impactScore = +(pick.reduce((s, p) => s + p.o.impact, 0) / Math.max(1e-9, nodes.reduce((s, n) => s + n.opts[0].impact, 0))).toFixed(4);
  const reb = rebate?.amount || 0;
  return { tier: req.tier || 'better', budget: req.budget, mode: req.mode, lines, subtotal, contingencyPct: cpct, contingency, total,
    rebate, netAfterRebate: total - reb, overBy: total > req.budget ? total - req.budget : 0, belowMinimum, minViable: Math.round(minViable * (1 + cpct)),
    selections: pick.map(p => ({ anchor: p.n.anchor, itemIndex: p.n.i, kind: p.n.it.kind, locked: p.n.locked, lever: p.o.lever, label: p.o.label, doer: p.o.doer, item: p.o.item, deferred: !!p.o.deferred })),
    changes, deferred, impactScore };
}

/** fitTiers(req) -> { good, better, best }: same design/anchors at 0.85 / 1.0 / 1.35 × budget. Good prefers DIY when mode≠'pro'.
 *  Best never pads: it is capped at the designed plan's cost. */
export function fitTiers(req) {
  return Object.fromEntries(Object.entries(TIER_MULTS).map(([tier, m]) => [tier, fitBudget({ ...req, tier, budget: Math.round(req.budget * m), preferDiy: tier === 'good' && req.mode !== 'pro' })]));
}
