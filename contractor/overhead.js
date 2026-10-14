// overhead.js — overhead recovery and break-even helpers. Percent inputs/outputs are 0–100 unless noted.
import { marginPctToMarkupPct } from './bid.js';
const r2 = n => Math.round(n * 100) / 100;
/** overheadPctOfRevenue(annualOverhead, annualRevenue) -> % of revenue */
export const overheadPctOfRevenue = (oh, rev) => { if (!(rev > 0)) throw new Error('revenue_required'); return r2(oh / rev * 100); };
/**
 * overheadPctOnDirect(annualOverhead, annualRevenue, { netProfitPct=0 }) -> % to enter as book.settings.overheadPct
 * bid.js applies overhead to DIRECT cost, so recover OH over direct cost = revenue − overhead − profit.
 */
export function overheadPctOnDirect(oh, rev, { netProfitPct = 0 } = {}) {
  const direct = rev - oh - rev * netProfitPct / 100; if (!(direct > 0)) throw new Error('overhead_exceeds_revenue'); return r2(oh / direct * 100);
}
/** overheadPerFieldHour(annualOverhead, billableFieldHours) -> $/hr (LMN-style FLH recovery) */
export const overheadPerFieldHour = (oh, hours) => r2(oh / hours);
/** breakEvenRevenue(annualOverhead, grossMarginPct) -> annual revenue where gross profit just covers overhead */
export const breakEvenRevenue = (oh, gmPct) => { if (!(gmPct > 0)) throw new Error('gross_margin_required'); return r2(oh / (gmPct / 100)); };
/** breakEvenPrice(directCost, overheadPct) -> job price with zero profit (direct + overhead recovery) */
export const breakEvenPrice = (direct, ohPct) => r2(direct * (1 + ohPct / 100));
/** priceForMargin(directCost, overheadPct, netMarginPct) -> price where net margin on price = target */
export const priceForMargin = (direct, ohPct, mPct) => { if (!(mPct < 100)) throw new Error('margin_must_be_below_100'); return r2(breakEvenPrice(direct, ohPct) / (1 - mPct / 100)); };
/** breakEvenHourlyRate(burdenedRate, annualOverhead, billableFieldHours) -> sell rate per hour that covers labor + overhead */
export const breakEvenHourlyRate = (rate, oh, hours) => r2(rate + oh / hours);
/** bidProfit(bid) -> { netProfit (= markup + fee margin 0), netMarginPct on pre-tax subtotal, breakEven } */
export function bidProfit(bid) { const T = bid.totals, be = r2(T.direct + T.overhead + (bid.settings?.feesMarkedUp ? 0 : T.fees || 0));
  const profit = r2(T.subtotal - be); return { breakEven: be, netProfit: profit, netMarginPct: T.subtotal ? r2(profit / T.subtotal * 100) : 0 }; }
/** overheadSettings({annualOverhead, annualRevenue, netProfitPct?, targetNetMarginPct?}) -> {overheadPct, markupPct} patch for setSettings */
export function overheadSettings({ annualOverhead, annualRevenue, netProfitPct = 0, targetNetMarginPct = 10 }) {
  return { overheadPct: overheadPctOnDirect(annualOverhead, annualRevenue, { netProfitPct }), markupPct: marginPctToMarkupPct(targetNetMarginPct) };
}
