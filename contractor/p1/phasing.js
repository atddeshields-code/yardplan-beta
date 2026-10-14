// phasing.js — split bid lines into phases, per-phase totals, payment schedule.
const c2 = n => Math.round(n * 100) / 100;
export const DEFAULT_PHASES = [
  { id: 'prep', name: 'Site prep & grading' },
  { id: 'hardscape', name: 'Hardscape (walls, paths, gravel)' },
  { id: 'planting', name: 'Planting' },
  { id: 'finish', name: 'Mulch, lawn & cleanup' },
];
export const AUTO_RULES = { grading: 'prep', topsoil: 'prep', wallblock: 'hardscape', base: 'hardscape', sand: 'hardscape', pavers: 'hardscape',
  rock: 'hardscape', edging: 'hardscape', dg: 'hardscape', excavation: 'prep', drip: 'planting', fabric: 'finish', mulch: 'finish', sod: 'finish' };
/** suggestPhases(lines) -> {lineKey: phaseId}  (plants -> planting; fees -> prep; unknown 'other' -> finish) */
export function suggestPhases(lines) {
  return Object.fromEntries(lines.map(l => [l.key, l.category === 'plant' || l.key.startsWith('plant:') ? 'planting' : l.category === 'fee' ? 'prep' : AUTO_RULES[l.key] || (l.category === 'other' ? 'finish' : 'hardscape')]));
}
/** Split amount across weights so parts sum exactly to amount (largest-remainder on cents). */
export function allocate(amount, weights) {
  const cents = Math.round(amount * 100), W = weights.reduce((a, b) => a + b, 0);
  if (!W) return weights.map((_, i) => i === weights.length - 1 ? amount : 0);
  const raw = weights.map(w => cents * w / W), fl = raw.map(Math.floor); let rem = cents - fl.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - fl[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (rem-- > 0) fl[i]++; });
  return fl.map(c => c / 100);
}
/**
 * buildPhasing(bid, { phases?, assignments? (manual overrides {lineKey: phaseId}) }) ->
 * { phases:[{id,name,lineKeys,lines,direct,overhead,markup,tax,total}], assignments, totals }
 * Overhead/markup/tax are allocated to phases proportional to direct cost (tax: proportional to materials if taxOn==='materials').
 */
export function buildPhasing(bid, { phases = DEFAULT_PHASES, assignments = {} } = {}) {
  const asg = { ...suggestPhases(bid.lines), ...assignments };
  const ids = phases.map(p => p.id);
  for (const [k, v] of Object.entries(asg)) if (!ids.includes(v)) throw new Error(`unknown_phase:${v} for ${k}`);
  const T = bid.totals, s = bid.settings || {};
  const ps = phases.map(p => { const lines = bid.lines.filter(l => asg[l.key] === p.id);
    return { id: p.id, name: p.name, lineKeys: lines.map(l => l.key), lines, materials: c2(lines.reduce((a, l) => a + l.materialCost, 0)), direct: c2(lines.reduce((a, l) => a + l.total, 0)) }; });
  const ov = allocate(T.overhead, ps.map(p => p.direct)), mk = allocate(T.markup, ps.map(p => p.direct));
  const tx = allocate(T.tax, ps.map(p => s.taxOn === 'all' ? p.direct : p.materials));
  ps.forEach((p, i) => Object.assign(p, { overhead: ov[i], markup: mk[i], tax: tx[i], total: c2(p.direct + ov[i] + mk[i] + tx[i]) }));
  const out = ps.filter(p => p.lines.length);
  return { phases: out, assignments: asg, totals: { total: c2(out.reduce((a, p) => a + p.total, 0)), bidTotal: T.total } };
}
/**
 * paymentSchedule(total, { depositPct=30, phasing?, milestones? }) -> [{name, pct, amount, due}]
 * Default: deposit at signing, then remainder split by phase total, due on phase completion.
 * Custom milestones: [{name, pct, due?}] after the deposit; pcts must sum with deposit to 100.
 */
export function paymentSchedule(total, { depositPct = 30, phasing = null, milestones = null, finalPct = 0 } = {}) {
  let parts;
  if (milestones) {
    parts = [{ name: 'Deposit', pct: depositPct, due: 'At signing' }, ...milestones.map(m => ({ name: m.name, pct: +m.pct, due: m.due || 'On milestone completion' }))];
    const sum = parts.reduce((a, p) => a + p.pct, 0); if (Math.abs(sum - 100) > 1e-6) throw new Error('milestones_must_sum_to_100');
  } else {
    const ph = phasing ? phasing.phases : [{ name: 'Completion', total: 1 }];
    const rest = 100 - depositPct - finalPct, w = ph.map(p => p.total), W = w.reduce((a, b) => a + b, 0) || 1;
    parts = [{ name: 'Deposit', pct: depositPct, due: 'At signing' }, ...ph.map((p, i) => ({ name: p.name, pct: rest * w[i] / W, due: `On completion of ${p.name}` }))];
    if (finalPct) parts.push({ name: 'Final walkthrough', pct: finalPct, due: 'On final walkthrough' });
  }
  const amounts = allocate(total, parts.map(p => p.pct));
  return parts.map((p, i) => ({ ...p, pct: Math.round(p.pct * 100) / 100, amount: amounts[i] }));
}
