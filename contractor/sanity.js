// sanity.js — compare a bid's installed $/sq ft to market ranges (data/pricing-defaults.json installedPriceChecks + contractor-pricing.md §4).
import { INSTALLED_PRICE_CHECKS } from './pricebook.js';
const c2 = n => Math.round(n * 100) / 100;
/** Ranges from contractor-pricing.md §4 not present in the JSON (Ecostify 2026, national). */
export const WHOLE_LANDSCAPE_CHECKS = { softscape: { perSqFt: [5, 10], source: 'Ecostify 2026 (via contractor-pricing.md)' }, withHardscape: { perSqFt: [15, 25], source: 'Ecostify 2026 (via contractor-pricing.md)' } };
const HARD = ['path', 'gravel', 'dg', 'wall'];
/**
 * priceSanityChecks(takeoff, bid, { checks?, regionalMult=1, tierId? }) -> [{code, label, perSqFt, range, status:'low'|'ok'|'high', level:'warn'|'info', message, source}]
 * Sell price per line = line.total × (subtotal − fees − minimumAdjustment) ÷ (direct cost) — i.e. with overhead + markup, before tax.
 * regionalMult scales ranges (research: West Coast / Northeast often +15–30%).
 */
export function priceSanityChecks(t, bid, { checks = INSTALLED_PRICE_CHECKS, regionalMult = 1, tierId } = {}) {
  const tr = tierId && bid.tiers ? bid.tiers.find(x => x.id === tierId) : null, lines = tr ? tr.lines : bid.lines, T = tr ? tr.totals : bid.totals;
  const k = T.direct ? (T.subtotal - (T.fees || 0) * (bid.settings?.feesMarkedUp ? 0 : 1) - (T.minimumAdjustment || 0)) / T.direct : 1;
  const sell = keys => c2(lines.filter(l => keys.includes(l.key)).reduce((a, l) => a + l.total * k, 0));
  const fa = t.featureArea || {}, out = [];
  const check = (code, label, area, price, range, source) => {
    if (!(area > 0) || !range) return; const per = c2(price / area), [lo, hi] = range.map(v => c2(v * regionalMult));
    const status = per < lo ? 'low' : per > hi ? 'high' : 'ok';
    out.push({ code, label, area: c2(area), price, perSqFt: per, range: [lo, hi], status, level: status === 'ok' ? 'info' : 'warn', source,
      message: `${label}: $${per.toFixed(2)}/sq ft vs market $${lo}–${hi}` + (status === 'ok' ? ' (within range).' : status === 'low' ? ' — below market; check quantities, labor and markup.' : ' — above market; check unit costs and production rates.') });
  };
  const wb = t.lines.find(l => l.key === 'wallblock');
  check('paver-patio', 'Paver patio/path (pavers + base + sand)', fa.path, sell(['pavers', 'base', 'sand']), checks.paverPatioConcrete?.perSqFt, checks.paverPatioConcrete?.source);
  check('dg', 'Decomposed granite', fa.dg, sell(['dg']), checks.decomposedGranite?.perSqFt, checks.decomposedGranite?.source);
  check('sod', 'Sod installed (sod + topsoil)', fa.lawn, sell(['sod', 'topsoil']), checks.sodInstalled?.perSqFt, checks.sodInstalled?.source);
  check('retaining-wall', 'Retaining wall (per sq ft face)', wb ? wb.area : 0, sell(['wallblock']), checks.retainingWallBlock?.perSqFtFace, checks.retainingWallBlock?.source);
  const area = Object.entries(fa).filter(([kd]) => !['wall', 'grade', 'excavation', 'drip'].includes(kd)).reduce((a, [, v]) => a + v, 0);
  const hasHard = HARD.some(h => fa[h] > 0), W = hasHard ? WHOLE_LANDSCAPE_CHECKS.withHardscape : WHOLE_LANDSCAPE_CHECKS.softscape;
  check('whole-landscape', `Whole job per landscaped sq ft (${hasHard ? 'with hardscape' : 'softscape'})`, area, c2(T.subtotal), W.perSqFt, W.source);
  return out;
}
