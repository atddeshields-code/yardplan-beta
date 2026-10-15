// irrigation-takeoff.js — turns a design's irrigation choice (design.irrigation = 'drip' | 'spray' | 'none') into priced takeoff lines.
// Uses the guides irrigation generator (guides/irrigation-core.js, no data tables). Parts and quantities don't depend on climate,
// so pricing uses a fixed planning climate; the homeowner sheet re-runs the plan with the real ZIP climate for the watering schedule.
// The same function feeds the homeowner estimate and the contractor bid (budget-fit.buildTakeoff), so their totals stay equal.
import { generateIrrigationPlan, IRRIGATION_PARTS } from '../guides/irrigation-core.js';
export { IRRIGATION_PARTS };
export const IRR_MODES = ['drip', 'spray', 'none'];
export const IRR_LABEL = { drip: 'Drip (recommended)', spray: 'Sprinklers', none: 'None' };
const PLAN_LOC = { zone: '9b', climate: { eto: [1.6, 2.2, 3.7, 5.1, 6.6, 7.6, 8.1, 7.2, 5.6, 3.8, 2.1, 1.4], precip: [3.6, 3.5, 2.6, 1.2, .6, .2, 0, .1, .3, 1, 2.3, 3.4], summer: 'hot', precipAnnual: 18.8, lastFrost: null, freezeClimate: false }, restrictions: null };
export const irrigationMode = d => (d && IRR_MODES.includes(d.irrigation)) ? d.irrigation : 'none';
const watered = d => (d.items || []).some(i => i.kind === 'plant' || i.kind === 'lawn');
/** irrigationPlan(design, { catalog, mode?, location? }) -> guides plan (+ .mode) or null (none / nothing to water) */
export function irrigationPlan(design, { catalog, mode, location } = {}) {
  mode = mode || irrigationMode(design); if (mode === 'none' || !design || !watered(design)) return null;
  // Sprinklers everywhere: beds become spray-head areas, plants are watered by the sprays.
  const d = mode === 'spray' ? { ...design, items: design.items.filter(i => i.kind !== 'plant').map(i => i.kind === 'mulch' ? { ...i, kind: 'lawn' } : i) } : design;
  if (!watered(d)) return null;
  const manifold = design.house && !design.house.isDefault && design.house.manifold ? design.house.manifold : undefined;
  const plan = generateIrrigationPlan(d, { catalog, location: location || PLAN_LOC, manifold, consolidate: true });
  plan.mode = mode;
  if (mode === 'spray') plan.hydrozones.forEach(z => { z.name = 'Sprinklers (beds and lawn) — pop-up spray heads with high-efficiency nozzles'; });
  return plan;
}
/** takeoff lines for a plan (keys irr-*; priced from the price book like any material) */
export const irrigationLines = plan => plan ? plan.parts.map(p => ({ key: p.key, name: p.name, qty: p.qty, unit: p.unit, basis: 'count', waste: 0, irrigation: true })) : [];
/** add any missing irrigation parts to a price book (never overwrites the contractor's own prices) */
export function ensureIrrigationItems(book) {
  let n = 0; for (const [k, v] of Object.entries(IRRIGATION_PARTS)) if (!book.items[k]) { book.items[k] = { key: k, name: v.name, unit: v.unit, unitCost: v.unitCost, laborPerUnit: null, laborHoursPerUnit: v.laborHoursPerUnit, source: 'irrigation-guide (example price)', isEstimate: true }; n++; }
  return n;
}
