// pricebook.js — contractor price book. Unit costs are per takeoff unit (same unit strings as data.js MATERIALS).
// EXAMPLE defaults only; contractors must override with their own costs.
import RESEARCH from './data/pricing-defaults.js';
// LEGACY_* = the original P0 example defaults (kept for backward compatibility: createPriceBook({ defaults: 'legacy' })).
export const LEGACY_CONTRACTOR_DEFAULTS = {
  mulch: { laborHoursPerUnit: 0.05 }, rock: { laborHoursPerUnit: 0.04 }, pavers: { laborHoursPerUnit: 0.08 }, sod: { laborHoursPerUnit: 2.5 },
  topsoil: { laborHoursPerUnit: 0.04 }, edging: { laborHoursPerUnit: 0.5 }, fabric: { laborHoursPerUnit: 0.5 },
  base: { name: 'Compacted gravel base (4" deep)', unit: 'cu yd', unitCost: 45, laborHoursPerUnit: 1.5 },
  sand: { name: 'Bedding sand (1" deep)', unit: 'cu yd', unitCost: 50, laborHoursPerUnit: 1 },
  wallblock: { name: 'Segmental retaining wall block', unit: 'sq ft face', unitCost: 18, laborPerUnit: 25 },
  grading: { name: 'Grading cut/fill', unit: 'cu yd', unitCost: 0, laborPerUnit: 60 },
};
export const LEGACY_PLANT_DEFAULTS = {
  '15 gal': { unitCost: 150, laborHoursPerUnit: 1.0 }, '5 gal': { unitCost: 35, laborHoursPerUnit: 0.4 },
  '1 gal': { unitCost: 12, laborHoursPerUnit: 0.15 }, '4 in pot': { unitCost: 4, laborHoursPerUnit: 0.05 },
};
const NEW_SETTINGS = { siteDifficulty: 'easy', markups: null, minimumJobCharge: 0, mobilizationFee: 0, deliveryFeeBulk: 0, dumpFeePerLoad: 0,
  bulkLoadCuYd: 10, dumpLoadCuYd: 6, feesMarkedUp: false };
export const LEGACY_SETTINGS = { hourlyRate: 65, markupPct: 20, overheadPct: 10, taxPct: 0, taxOn: 'materials', currency: 'USD', tiers: null, ...NEW_SETTINGS };
const clean = o => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')));
const COST_TYPES = { grading: 'equipment' }; // unitCost of these items is equipment rental share, not material
/** Research-backed defaults (data/pricing-defaults.json, 2026-10-13). hourlyRate = BURDENED COST per billable hour, not sell rate. */
export const CONTRACTOR_DEFAULTS = Object.fromEntries(Object.entries(RESEARCH.items).map(([k, v]) => [k, { ...clean(v), ...(COST_TYPES[k] ? { costType: COST_TYPES[k] } : {}) }]));
export const PLANT_DEFAULTS = Object.fromEntries(Object.entries(RESEARCH.plants).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, { unitCost: v.unitCost, laborHoursPerUnit: v.laborHoursPerUnit }]));
export const DEFAULT_SETTINGS = { ...NEW_SETTINGS, ...clean(RESEARCH.settings), tiers: null };
export const PRICING_DEFAULTS_META = RESEARCH._meta;
export const INSTALLED_PRICE_CHECKS = clean(RESEARCH.installedPriceChecks);
export const LABOR_REGIONS = clean(RESEARCH.laborRegions);
export const SITE_DIFFICULTY = { easy: 1.0, moderate: 1.25, hard: 1.5 };
/** difficultyFactor('moderate'|1.3) -> number (labor-hour multiplier) */
export const difficultyFactor = d => typeof d === 'number' && d > 0 ? d : SITE_DIFFICULTY[d] ?? 1;
const DEFAULT_SETS = { research: { items: CONTRACTOR_DEFAULTS, plants: PLANT_DEFAULTS, settings: DEFAULT_SETTINGS },
  legacy: { items: LEGACY_CONTRACTOR_DEFAULTS, plants: LEGACY_PLANT_DEFAULTS, settings: LEGACY_SETTINGS } };
const resolveDefaults = d => typeof d === 'object' && d ? { items: d.items || {}, plants: d.plants || {}, settings: { ...NEW_SETTINGS, ...(d.settings || {}) } } : DEFAULT_SETS[d || 'research'];
export const DEFAULT_TIERS = [
  { id: 'good', name: 'Good', materialMult: 1.0, laborMult: 1.0 },
  { id: 'better', name: 'Better', materialMult: 1.25, laborMult: 1.1 },
  { id: 'best', name: 'Best', materialMult: 1.6, laborMult: 1.25 },
];
const itemFrom = (k, d, m = {}) => ({ key: k, name: m.name || d.name || k, unit: m.unit || d.unit || 'unit', unitCost: m.price ?? d.unitCost ?? 0,
  laborPerUnit: d.laborPerUnit ?? null, laborHoursPerUnit: d.laborHoursPerUnit ?? null, costType: d.costType || 'material',
  source: m.price != null ? 'example (data.js)' : 'contractor default' });

/**
 * createPriceBook({ materials?, settings?, items? }) -> PriceBook
 * materials: data.js MATERIALS (name/unit/price) used as example seed.
 */
export function createPriceBook({ materials = {}, settings = {}, items = {}, defaults = 'research' } = {}) {
  const D = resolveDefaults(defaults);
  const book = { version: 2, defaultsSet: typeof defaults === 'string' ? defaults : 'custom', settings: { ...D.settings, ...settings },
    settingsOverridden: Object.keys(settings), items: {}, plants: {}, extras: [], updatedAt: new Date().toISOString() };
  for (const [k, d] of Object.entries(D.items)) book.items[k] = itemFrom(k, d, materials[k]);
  for (const [c, d] of Object.entries(D.plants)) book.plants[c] = { container: c, ...d, laborPerUnit: null };
  for (const [k, v] of Object.entries(items)) setItem(book, k, v);
  return book;
}
/**
 * applyDefaults(book, defaults='research', { materials }) — re-seed from a defaults set. Keeps every user override
 * (items/plants marked overridden, settings changed through setSettings/createPriceBook settings). Returns book.
 */
export function applyDefaults(book, defaults = 'research', { materials = {} } = {}) {
  const D = resolveDefaults(defaults), keep = new Set(book.settingsOverridden || []);
  for (const [k, v] of Object.entries(D.settings)) if (!keep.has(k)) book.settings[k] = v;
  for (const [k, d] of Object.entries(D.items)) if (!book.items[k]?.overridden) book.items[k] = itemFrom(k, d, materials[k] || (book.items[k]?.source?.startsWith('example') ? { price: book.items[k].unitCost, name: book.items[k].name, unit: book.items[k].unit } : undefined));
  for (const [c, d] of Object.entries(D.plants)) if (!book.plants[c]?.overridden) book.plants[c] = { container: c, ...d, laborPerUnit: null };
  book.defaultsSet = typeof defaults === 'string' ? defaults : 'custom'; book.updatedAt = new Date().toISOString(); return book;
}

/** seedFromProvider(book, provider, zip, keys?) — async; fills unitCost from provider.getPrice(key, zip). Returns book. */
export async function seedFromProvider(book, provider, zip, keys) {
  const ks = keys || Object.keys(book.items);
  await Promise.all(ks.map(async k => {
    let p = null; try { p = await provider.getPrice(k, zip); } catch (e) { }
    if (p && typeof p.price === 'number' && p.price > 0 && !book.items[k].overridden) {
      Object.assign(book.items[k], { unitCost: p.price, unit: p.unit || book.items[k].unit,
        source: p.source || 'provider', store: p.store || null, asOf: p.asOf ? new Date(p.asOf).toISOString() : null, isEstimate: p.isEstimate !== false });
    }
  }));
  return book;
}

/** setItem(book, key, patch) — override unit cost / labor; marks overridden so provider seeding won't clobber it. */
export function setItem(book, key, patch) {
  const cur = book.items[key] || { key, name: key, unit: 'unit', unitCost: 0, laborPerUnit: null, laborHoursPerUnit: null };
  book.items[key] = { ...cur, ...patch, overridden: true, source: patch.source || 'contractor' };
  book.updatedAt = new Date().toISOString(); return book;
}
export function setPlantPrice(book, idOrContainer, patch) { book.plants[idOrContainer] = { ...(book.plants[idOrContainer] || {}), ...patch, overridden: true }; return book; }
export function setSettings(book, patch) { Object.assign(book.settings, patch); book.settingsOverridden = [...new Set([...(book.settingsOverridden || []), ...Object.keys(patch)])]; return book; }

/** priceFor(book, key) -> item; plantPriceFor(book, plantRow) -> species override, else container default */
export const priceFor = (book, key) => book.items[key] || null;
export const plantPriceFor = (book, p) => book.plants[p.id] || book.plants[p.container] || { unitCost: 0, laborHoursPerUnit: 0 };
/** laborCostPerUnit(entry, hourlyRate, difficulty=1): flat $/unit wins (not scaled by difficulty); else hours/unit × difficulty × rate */
export const laborCostPerUnit = (e, rate, difficulty = 1) => e.laborPerUnit != null ? +e.laborPerUnit : (+e.laborHoursPerUnit || 0) * difficulty * rate;

export const toJSON = book => JSON.stringify(book);
// fromJSON: v1 books (P0) get the new settings fields with neutral values (no fees, uniform markup, easy site), so totals are unchanged.
export const fromJSON = s => { const b = typeof s === 'string' ? JSON.parse(s) : s; const base = b.version >= 2 ? DEFAULT_SETTINGS : { ...NEW_SETTINGS };
  return { extras: [], settingsOverridden: [], ...b, settings: { ...base, ...b.settings } }; };
export const STORAGE_KEY = 'yardplan.contractor.pricebook.v1';
export function saveToStorage(book, storage = globalThis.localStorage, key = STORAGE_KEY) { storage.setItem(key, toJSON(book)); }
export function loadFromStorage(storage = globalThis.localStorage, key = STORAGE_KEY) { const s = storage && storage.getItem(key); return s ? fromJSON(s) : null; }
