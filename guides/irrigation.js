// irrigation.js — design-driven irrigation plan for Yardplan designs (yard3d serialize() v2, feet).
// General planning guide only — follow local codes / water rules; backflow often requires a licensed installer.
import { getLocation, MONTHS } from './location.js';
import { daysCap } from './data/restrictions.js';
import { mweloCheck } from './mwelo.js';
import { plantIndex } from './catalog.js';
import { inRect, rectCorners, area, blobHull, nnPathLength, toWorld } from './geometry.js';

export const PLANT_FACTOR = { low: 0.2, med: 0.5, high: 0.8 };            // WUCOLS-style midpoints (low .1–.3, mod .4–.6, high .7–.9)
export const PF_RANGE = { low: [0.1, 0.3], med: [0.4, 0.6], high: [0.7, 0.9] };
export const LAWN_PF = { cool: 0.8, warm: 0.6 };                            // cool-season turf ~0.8, warm-season ~0.6 (common ET-based turf coefficients)
export const EFFICIENCY = { drip: 0.9, inline: 0.9, mp: 0.75, spray: 0.65 };  // application efficiency / DU-lq style planning values
export const GAL_PER_SQFT_IN = 0.623;
const WATER_LABEL = { low: 'Low', med: 'Moderate', high: 'High' };
const COLORS = ['#2b8cbe', '#e6550d', '#31a354', '#756bb1', '#de2d26', '#636363', '#fd8d3c', '#3182bd', '#a1d99b', '#9e9ac8'];
const NO_WATER = new Set(['gravel', 'path', 'wall', 'dg', 'grade']);
const BED_KINDS = ['mulch', 'gravel', 'dg'];
const DRIP_CIRCUIT_MAX_GPH = 240;     // ~1/2" (0.6" ID) poly lateral, ≤200 ft run, typical manufacturer guidance
const MP_PR_IN_HR = 0.4;              // MP Rotator matched precipitation ~0.4 in/hr
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Example unit costs (USD, 2026, retail ballpark). Override via priceBook.items in contractor tool. */
export const IRRIGATION_PARTS = {
  'irr-backflow': { name: 'Backflow preventer (1" PVB or RPZ per local code) — licensed install often required', unit: 'ea', unitCost: 95, laborHoursPerUnit: 2 },
  'irr-valve': { name: '1" anti-siphon/inline valve (spray/rotor zone)', unit: 'ea', unitCost: 28, laborHoursPerUnit: 0.75 },
  'irr-drip-kit': { name: 'Drip control zone kit (low-flow valve + 150–200 mesh filter + 25–30 psi regulator)', unit: 'ea', unitCost: 48, laborHoursPerUnit: 0.75 },
  'irr-valve-box': { name: 'Valve box (10" round / 12" std)', unit: 'ea', unitCost: 22, laborHoursPerUnit: 0.3 },
  'irr-controller': { name: 'WaterSense-labeled smart (weather-based) controller', unit: 'ea', unitCost: 180, laborHoursPerUnit: 1 },
  'irr-sensor-rain': { name: 'Wireless rain/freeze sensor', unit: 'ea', unitCost: 55, laborHoursPerUnit: 0.3 },
  'irr-sensor-soil': { name: 'Soil-moisture sensor (optional, for lawn/high zone)', unit: 'ea', unitCost: 95, laborHoursPerUnit: 0.5 },
  'irr-house-prv': { name: 'Whole-line pressure-reducing valve (static > 80 psi)', unit: 'ea', unitCost: 120, laborHoursPerUnit: 1.5 },
  'irr-poly-half': { name: '1/2" drip distribution tubing (poly)', unit: 'ft', unitCost: 0.22, laborHoursPerUnit: 0.01 },
  'irr-quarter': { name: '1/4" micro tubing', unit: 'ft', unitCost: 0.1, laborHoursPerUnit: 0.01 },
  'irr-inline': { name: 'Inline emitter dripline 0.6 GPH @ 12" (pressure-compensating)', unit: 'ft', unitCost: 0.38, laborHoursPerUnit: 0.012 },
  'irr-emitter-05': { name: 'PC emitter 0.5 GPH', unit: 'ea', unitCost: 0.3, laborHoursPerUnit: 0.02 },
  'irr-emitter-1': { name: 'PC emitter 1 GPH', unit: 'ea', unitCost: 0.3, laborHoursPerUnit: 0.02 },
  'irr-emitter-2': { name: 'PC emitter 2 GPH', unit: 'ea', unitCost: 0.3, laborHoursPerUnit: 0.02 },
  'irr-fittings': { name: 'Drip fittings, stakes, flush caps (allowance per drip circuit)', unit: 'set', unitCost: 25, laborHoursPerUnit: 0.25 },
  'irr-mp-nozzle': { name: 'MP Rotator / high-efficiency rotary nozzle', unit: 'ea', unitCost: 9, laborHoursPerUnit: 0.05 },
  'irr-spray-body': { name: '4–6" pop-up body with 40 psi pressure-regulating stem (PRS)', unit: 'ea', unitCost: 9, laborHoursPerUnit: 0.35 },
  'irr-pvc-lateral': { name: '3/4"–1" PVC/poly lateral pipe', unit: 'ft', unitCost: 0.65, laborHoursPerUnit: 0.03 },
  'irr-mainline': { name: '1" mainline POC → manifold (field-measure; allowance)', unit: 'ft', unitCost: 0.9, laborHoursPerUnit: 0.05 },
  'irr-wire': { name: '18-gauge multi-strand valve wire', unit: 'ft', unitCost: 0.45, laborHoursPerUnit: 0.005 },
};

function sizeClass(p, p3) {
  const model = (p3 && p3.model) || ''; const s = p.spreadFt, h = p.heightFt;
  if (p.type === 'tree') return 'tree';
  if (model === 'succulent') return 'succulent';
  if (p.type === 'groundcover') return 'groundcover';
  if (p.type === 'shrub' && (s >= 5 || h >= 5)) return 'large-shrub';
  if (p.type === 'shrub') return 'small-shrub';
  return s >= 3 ? 'large-perennial' : 'small-perennial'; // perennial, grass
}
/** Emitter recipe by size class: { n, gph } (established); tree ring expands with growth. */
export function emitterRecipe(cls, spread) {
  switch (cls) {
    case 'tree': return { n: Math.min(8, Math.max(4, Math.ceil(Math.PI * Math.min(spread / 2, 4) ** 2 / 8))), gph: 2 };
    case 'large-shrub': return { n: 2, gph: 2 };
    case 'small-shrub': return { n: 2, gph: 1 };
    case 'large-perennial': return { n: 1, gph: 2 };
    case 'small-perennial': return { n: 1, gph: 1 };
    case 'succulent': return { n: 1, gph: spread >= 5 ? 1 : 0.5 };
    default: return { n: 1, gph: 0.5 };
  }
}
const CONTAINER = { tree: '15 gal', 'large-shrub': '5 gal', 'small-shrub': '5 gal', succulent: '5 gal', 'large-perennial': '1 gal', 'small-perennial': '1 gal', groundcover: '4 in pot' };
const ROOTBALL_GAL = { '15 gal': 5, '5 gal': 1.5, '1 gal': 0.5, '4 in pot': 0.15 }; // water to re-wet root ball per event (approx.)

/** Monthly net irrigation depth (in) for plant factor pf: max(0, ETo*pf - effRain) / eff. Effective rain = 50% of normal precip (planning rule). */
export function netDepthIn(eto, rain, pf, eff, effRainFrac = 0.5) { return Math.max(0, eto * pf - effRainFrac * rain) / eff; }
/** Runtime minutes per watering event for drip: gallons needed / GPH. */
export function dripRuntimeMin(galPerDay, gph, intervalDays) { return gph > 0 ? galPerDay * intervalDays / gph * 60 : 0; }
/** Lawn runtime minutes per week = depth(in/week) / PR(in/hr) * 60 */
export function lawnRuntimeMinPerWeek(depthInPerWeek, prInHr = MP_PR_IN_HR) { return depthInPerWeek / prInHr * 60; }

function lawnHeads(it, spacing = 15) {
  const W = Math.abs(it.w), D = Math.abs(it.d), nx = Math.max(2, Math.ceil(W / spacing) + 1), nz = Math.max(2, Math.ceil(D / spacing) + 1); const heads = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const edgeX = i === 0 || i === nx - 1, edgeZ = j === 0 || j === nz - 1; const arc = edgeX && edgeZ ? 90 : edgeX || edgeZ ? 180 : 360;
    const [x, z] = toWorld(it, -W / 2 + W * i / (nx - 1), -D / 2 + D * j / (nz - 1));
    heads.push({ x: +x.toFixed(2), z: +z.toFixed(2), arc, radius: Math.min(spacing, Math.max(W / (nx - 1), D / (nz - 1))), gpm: { 90: 0.47, 180: 0.91, 360: 1.86 }[arc] * Math.min(1, (Math.max(W / (nx - 1), D / (nz - 1)) / 17) ** 2 + 0.2) });
  }
  return heads.map(h => ({ ...h, gpm: +h.gpm.toFixed(2) }));
}

/**
 * generateIrrigationPlan(design, { zip, catalog, waterSource?, pressurePsi?, flowGpm?, location?, lawnType?, manifold? })
 * See README for the returned shape.
 */
export function generateIrrigationPlan(design, opts = {}) {
  const items = (design && design.items) || []; const yard = (design && design.yard) || { w: 50, d: 36 };
  const idx = plantIndex(opts.catalog); const p3d = (opts.catalog && opts.catalog.plant3d) || {};
  const loc = opts.location || getLocation(opts.zip, { zipFallback: opts.catalog && opts.catalog.zipFallback });
  if (!loc) throw new Error(`Unknown ZIP ${opts.zip}`);
  const C = loc.climate; const warnings = [], notes = [];
  const zoneNum = parseInt(loc.zone, 10);
  const lawnType = opts.lawnType || (zoneNum >= 8 && C.summer !== 'mild' ? 'warm' : 'cool');
  const waterSource = opts.waterSource || 'municipal';
  const pressurePsi = opts.pressurePsi ?? (waterSource === 'well' ? 45 : 60);
  const flowGpm = opts.flowGpm ?? (waterSource === 'well' ? 8 : 12);
  const budgetGpm = +(flowGpm * 0.75).toFixed(2); // design to ≤75% of available flow
  if (opts.flowGpm == null) notes.push(`Flow not measured — assumed ${flowGpm} GPM (${waterSource}). Do a bucket test at the hose bib/POC and re-run with flowGpm.`);
  if (opts.pressurePsi == null) notes.push(`Static pressure not measured — assumed ${pressurePsi} psi. Check with a hose-bib gauge.`);
  const manifold = opts.manifold || { x: +(-yard.w / 2 + 1.5).toFixed(2), z: +(yard.d / 2 - 1.5).toFixed(2) };
  const beds = items.filter(it => BED_KINDS.includes(it.kind));
  const plants = items.map((it, i) => ({ it, i })).filter(o => o.it.kind === 'plant' && idx.has(o.it.id));
  items.forEach(it => { if (it.kind === 'plant' && !idx.has(it.id)) warnings.push(`Plant id "${it.id}" not in catalog — skipped.`); });

  // Dense beds -> inline drip
  const bedInfo = beds.map((b, bi) => {
    const inside = plants.filter(o => idx.get(o.it.id).type !== 'tree' && inRect(b, o.it.x, o.it.z));
    const canopy = inside.reduce((s, o) => s + Math.PI * (idx.get(o.it.id).spreadFt / 2) ** 2, 0); const A = area(b);
    const waters = new Set(inside.map(o => idx.get(o.it.id).water));
    const dense = b.kind === 'mulch' && inside.length >= 6 && A > 0 && canopy / A >= 0.5 && waters.size === 1;
    return { b, bi, inside, dense, canopy, A };
  });
  const denseOf = new Map(); bedInfo.filter(x => x.dense).forEach(x => x.inside.forEach(o => denseOf.set(o.i, x)));

  // Group into hydrozones
  const groups = new Map(); const g = (key, init) => groups.get(key) || (groups.set(key, init()), groups.get(key));
  for (const o of plants) {
    const p = idx.get(o.it.id); const cls = sizeClass(p, p3d[p.id]);
    const exposure = p.sun.includes('full') ? 'sun' : 'shade';
    const dense = denseOf.get(o.i);
    const method = dense ? 'inline-drip' : 'drip-point';
    const key = cls === 'tree' ? `tree|${p.water}` : dense ? `inline|${p.water}|${exposure}|bed${dense.bi}` : `point|${p.water}|${exposure}`;
    const z = g(key, () => ({ key, method, water: p.water, exposure: cls === 'tree' ? 'mixed' : exposure, trees: cls === 'tree', plants: [], bed: dense ? dense.b : null }));
    z.plants.push({ itemIndex: o.i, id: p.id, name: p.name, type: p.type, cls, x: o.it.x, z: o.it.z, spreadFt: p.spreadFt, sun: p.sun, container: CONTAINER[cls] });
  }
  // Consolidate tiny drip-point zones (<3 plants) into the same-water zone with the other exposure (saves a valve).
  if (opts.consolidate !== false) for (const [k, z] of [...groups]) {
    if (z.method !== 'drip-point' || z.trees || z.plants.length >= 3) continue;
    const other = [...groups.values()].find(o => o !== z && o.method === 'drip-point' && !o.trees && o.water === z.water);
    if (other) { other.plants.push(...z.plants); other.exposure = 'mixed'; groups.delete(k); notes.push(`Merged ${z.plants.length} ${z.exposure} plant(s) into the ${WATER_LABEL[z.water].toLowerCase()}-water drip zone to save a valve (adjust emitters per plant if exposure differs a lot).`); }
  }
  const lawns = items.filter(it => it.kind === 'lawn');
  if (lawns.length) groups.set('lawn', { key: 'lawn', method: 'mp-rotator', water: 'high', exposure: 'sun', lawns, plants: [] });

  const peakIdx = C.eto.indexOf(Math.max(...C.eto));
  const zones = []; let zi = 0;
  for (const z of groups.values()) {
    const pf = z.method === 'mp-rotator' ? LAWN_PF[lawnType] : PLANT_FACTOR[z.water];
    const eff = z.method === 'mp-rotator' ? EFFICIENCY.mp : EFFICIENCY.drip;
    let emitters = [], heads = [], gph = 0, gpm = 0, irrigatedSqft = 0, tubing = { halfInchFt: 0, quarterInchFt: 0, inlineFt: 0, lateralPipeFt: 0 }, outline;
    if (z.method === 'drip-point') {
      for (const pl of z.plants) {
        const r = emitterRecipe(pl.cls, pl.spreadFt); const rad = pl.cls === 'tree' ? Math.min(3, Math.max(1.5, pl.spreadFt * 0.08)) : Math.max(0.5, pl.spreadFt * 0.25);
        pl.emitters = r.n; pl.gph = r.n * r.gph; pl.emitterGph = r.gph; gph += pl.gph;
        for (let k = 0; k < r.n; k++) { const a = 2 * Math.PI * k / r.n + 0.3; emitters.push({ x: +(pl.x + rad * Math.cos(a)).toFixed(2), z: +(pl.z + rad * Math.sin(a)).toFixed(2), gph: r.gph, plant: pl.id }); tubing.quarterInchFt += r.n === 1 ? 1 : rad + 1; }
        pl.canopySqft = pl.cls === 'tree' ? Math.PI * Math.min(pl.spreadFt / 2, 4) ** 2 : Math.PI * (pl.spreadFt / 2) ** 2; // trees: young-tree root zone (~8 ft wetted diameter); expand as tree grows
        irrigatedSqft += pl.canopySqft;
      }
      tubing.halfInchFt = Math.ceil(nnPathLength([manifold.x, manifold.z], z.plants.map(p => [p.x, p.z])) * 1.15 + 5);
      outline = blobHull(z.plants.map(p => [p.x, p.z, Math.max(1, Math.min(p.spreadFt / 2, 6))]));
    } else if (z.method === 'inline-drip') {
      const b = z.bed, W = Math.abs(b.w), D = Math.abs(b.d), rows = Math.max(1, Math.ceil((D - 1) / 1.5)), rowLen = Math.max(1, W - 1);
      tubing.inlineFt = Math.ceil(rows * rowLen); tubing.halfInchFt = Math.ceil(2 * D + Math.hypot(b.x - manifold.x, b.z - manifold.z) * 1.1);
      for (let r = 0; r < rows; r++) for (let s = 0; s <= rowLen; s += 1) { const [x, zz] = toWorld(b, -rowLen / 2 + s, -D / 2 + 0.5 + r * 1.5 + 0.25); emitters.push({ x: +x.toFixed(2), z: +zz.toFixed(2), gph: 0.6 }); }
      gph = emitters.length * 0.6; irrigatedSqft = area(b); outline = rectCorners(b).map(([a, c]) => [+a.toFixed(2), +c.toFixed(2)]);
      z.plants.forEach(p => { p.emitters = null; p.gph = null; });
    } else if (z.method === 'mp-rotator') {
      for (const l of z.lawns) { const h = lawnHeads(l); heads.push(...h); irrigatedSqft += area(l); tubing.lateralPipeFt += Math.ceil((Math.abs(l.w) + Math.abs(l.d)) * Math.max(2, Math.ceil(Math.abs(l.d) / 15) + 1) / 2 + Math.hypot(l.x - manifold.x, l.z - manifold.z)); }
      gpm = heads.reduce((s, h) => s + h.gpm, 0); outline = z.lawns.length === 1 ? rectCorners(z.lawns[0]).map(([a, c]) => [+a.toFixed(2), +c.toFixed(2)]) : blobHull(z.lawns.flatMap(l => rectCorners(l).map(([a, c]) => [a, c, 0.5])));
    }
    if (z.method !== 'mp-rotator') gpm = gph / 60;
    // valves: split by flow budget and (drip) circuit capacity
    const valves = Math.max(1, Math.ceil(gpm / budgetGpm), z.method === 'mp-rotator' ? 1 : Math.ceil(gph / DRIP_CIRCUIT_MAX_GPH));
    // Monthly schedule (established)
    const monthly = C.eto.map((eto, m) => {
      const depth = netDepthIn(eto, C.precip[m], pf, eff); const ratio = eto / C.eto[peakIdx];
      const galMonth = depth * irrigatedSqft * GAL_PER_SQFT_IN;
      const lfM = C.lastFrost && C.freezeClimate ? +C.lastFrost.slice(0, 2) : null, ffM = lfM ? +C.firstFrost.slice(0, 2) : null;
      if (lfM && (m + 1 < lfM - 1 || m + 1 > ffM)) return { month: MONTHS[m], depthIn: +depth.toFixed(2), gallons: 0, off: true, winterized: true, eventsPerWeek: 0, minutesPerEvent: 0, note: 'System winterized — hand-water trees/evergreens monthly in dry, unfrozen spells' };
      if (depth < 0.05) return { month: MONTHS[m], depthIn: +depth.toFixed(2), gallons: Math.round(galMonth), off: true, eventsPerWeek: 0, minutesPerEvent: 0 };
      if (z.method === 'mp-rotator') {
        const wk = depth / (DAYS[m] / 7); let ev = ratio > 0.75 ? 3 : ratio > 0.45 ? 2 : 1; const cap = daysCap(loc.restrictions, m, 'spray'); if (cap != null) ev = Math.max(1, Math.min(ev, cap));
        const minWeek = lawnRuntimeMinPerWeek(wk); const per = minWeek / ev; const cycles = per > 30 ? Math.min(4, Math.ceil(per / 30)) : 1;
        return { month: MONTHS[m], depthIn: +depth.toFixed(2), gallons: Math.round(galMonth), off: false, eventsPerWeek: ev, minutesPerEvent: +per.toFixed(1), cycleSoak: cycles > 1 ? `${cycles} × ${(per / cycles).toFixed(0)} min, 30–60 min soak between` : null };
      }
      const galDay = galMonth / DAYS[m]; const base = { low: 7, med: 4, high: 2 }[z.water] || 4;
      const dcap = daysCap(loc.restrictions, m, 'drip'); const iv = Math.max(dcap ? Math.ceil(7 / dcap) : 1, Math.min(21, Math.max(1, Math.round(base / Math.max(ratio, 0.2))))); const interval = Math.min(28, iv * (z.trees ? 2 : 1));
      const min = dripRuntimeMin(galDay, gph, interval);
      return { month: MONTHS[m], depthIn: +depth.toFixed(2), gallons: Math.round(galMonth), off: false, intervalDays: interval, eventsPerWeek: +(7 / interval).toFixed(2), minutesPerEvent: +min.toFixed(1) };
    });
    // Establishment schedule (first ~12 weeks after planting; trees longer)
    let establishment;
    if (z.method === 'mp-rotator') establishment = [
      { weeks: '1–2', frequency: 'Seed: 3–4 short cycles daily (keep surface moist); Sod: daily, deep enough to wet soil under sod', minutesPerEvent: 'Seed 3–5 min / Sod 10–15 min' },
      { weeks: '3–4', frequency: 'Every 1–2 days, longer cycles', minutesPerEvent: '10–20 min (cycle-soak)' },
      { weeks: '5–8', frequency: 'Taper to 3 days/week, then established schedule', minutesPerEvent: 'established peak-month runtime' }];
    else {
      const rb = z.plants.map(p => ROOTBALL_GAL[p.container] / (p.gph || 0.6 * 1.5)).sort((a, b) => a - b); const med = rb[Math.floor(rb.length / 2)] || 0.5;
      const run = Math.max(10, Math.round(med * 60));
      establishment = [
        { weeks: '1–2', frequency: 'Daily (every day in heat; every 2 days if cool)', minutesPerEvent: run },
        { weeks: '3–6', frequency: 'Every 2–3 days', minutesPerEvent: Math.round(run * 1.5) },
        { weeks: '7–12', frequency: 'Every 3–5 days', minutesPerEvent: Math.round(run * 2) },
        { weeks: '13+', frequency: z.trees ? 'Trees: keep weekly deep soaks through the first 1–2 summers (≈1 yr per inch of trunk caliper), expand emitter ring outward annually' : 'Switch to established schedule', minutesPerEvent: 'see established' }];
    }
    const annualGal = monthly.reduce((s, m) => s + m.gallons, 0);
    const name = z.method === 'mp-rotator' ? `Lawn (${lawnType}-season) — MP rotators` : z.trees ? `Trees — ${WATER_LABEL[z.water]} water (deep drip ring)` : `${WATER_LABEL[z.water]} water, ${{ sun: 'full sun', shade: 'part shade/shade', mixed: 'mixed sun/shade' }[z.exposure]} — ${z.method === 'inline-drip' ? 'inline drip bed' : 'drip emitters'}`;
    zones.push({ id: `Z${++zi}`, key: z.key, name, method: z.method, trees: !!z.trees, water: z.water, exposure: z.exposure, plantFactor: pf, plantFactorRange: z.method === 'mp-rotator' ? null : PF_RANGE[z.water], efficiency: eff,
      color: COLORS[(zi - 1) % COLORS.length], plants: z.plants, plantCount: z.plants.length, emitterCount: emitters.length, headCount: heads.length,
      totalGph: +gph.toFixed(1), gpm: +gpm.toFixed(2), valves, irrigatedSqft: Math.round(irrigatedSqft), tubing, monthly, establishment, annualGallons: annualGal,
      overlay: { outline, emitters, heads } });
  }
  // Hardscape / no-water features
  const noIrrigation = items.filter(it => NO_WATER.has(it.kind)).map(it => ({ kind: it.kind, sqft: Math.round(area(it)) }));
  const totalValves = zones.reduce((s, z) => s + z.valves, 0); const maxZoneGpm = Math.max(0, ...zones.map(z => z.gpm / z.valves));
  const dripValves = zones.filter(z => z.method !== 'mp-rotator').reduce((s, z) => s + z.valves, 0), lawnValves = totalValves - dripValves;
  const stations = [4, 6, 8, 12, 16].find(n => n >= totalValves + 1) || totalValves + 2;
  const hasLawn = zones.some(z => z.method === 'mp-rotator');
  const hasLawnZone = zones.some(z => z.method === 'mp-rotator');
  if (pressurePsi < 30) warnings.push(`Pressure ${pressurePsi} psi is low: MP rotators need ~40 psi at the nozzle; consider drip-only or a booster pump.`);
  if (pressurePsi > 80) warnings.push(`Static pressure ${pressurePsi} psi > 80 psi: install a whole-line pressure-reducing valve.`);
  if (hasLawn && pressurePsi < 40) warnings.push('Lawn MP rotators: expect reduced radius below 40 psi; tighten head spacing.');
  if (loc.restrictions) { const R = loc.restrictions; notes.push(R.isDefault ? `${R.notes[0]}` : `Local rules (${R.utility}, ${R.verified ? 'checked ' + R.checked : 'unverified — confirm with the utility'}): ${R.notes[0]}`); if (R.alert) warnings.push(`${R.utility}: ${R.alert}`);
    if (R.sprayMinutesCap && hasLawnZone) notes.push(`${R.utility} caps spray runtime: ${R.sprayMinutesCap.standard} min/station (standard) or ${R.sprayMinutesCap.conservingNozzle} min (conserving nozzles such as MP rotators) per watering day — use more days/cycles within the allowed days or reduce turf.`); }
  const equipment = {
    controller: { recommendation: `WaterSense-labeled smart (weather-based ET) controller, ${stations}-station (${totalValves} valves + spare)`, stations,
      sensors: [hasLawn || C.precipAnnual > 10 ? 'Rain/freeze sensor (WaterSense controllers often include weather data; sensor still recommended)' : 'Freeze sensor', ...(hasLawn ? ['Soil-moisture sensor on the lawn zone (optional, can cut use 20–40%)'] : [])] },
    backflow: { recommendation: 'Backflow preventer on irrigation supply (PVB 12" above highest head, or RPZ/DCVA as required). Many jurisdictions require a licensed/certified installer and annual testing.', required: true },
    pressureRegulation: { drip: `${dripValves ? '25–30 psi regulator on each drip zone (in the drip control kit)' : 'n/a'}`, sprays: hasLawn ? '40 psi PRS stems on MP rotator bodies' : 'n/a', house: pressurePsi > 80 ? 'Whole-line PRV required' : 'not needed at assumed pressure' },
    filter: dripValves ? '150–200 mesh filter on each drip zone (clean monthly in season)' : 'n/a',
  };
  // Parts list (feeds contractor price book)
  const q = {}; const add = (k, n) => { if (n > 0) q[k] = +((q[k] || 0) + n).toFixed(1); };
  add('irr-backflow', 1); add('irr-controller', 1); add('irr-sensor-rain', 1); if (hasLawn) add('irr-sensor-soil', 1); if (pressurePsi > 80) add('irr-house-prv', 1);
  add('irr-drip-kit', dripValves); add('irr-valve', lawnValves); add('irr-valve-box', Math.ceil(totalValves / 2));
  for (const z of zones) {
    add('irr-poly-half', Math.ceil(z.tubing.halfInchFt * 1.1)); add('irr-quarter', Math.ceil(z.tubing.quarterInchFt * 1.1)); add('irr-inline', Math.ceil(z.tubing.inlineFt * 1.05));
    if (z.method !== 'mp-rotator') add('irr-fittings', z.valves);
    for (const e of z.method === 'drip-point' ? z.overlay.emitters : []) add(e.gph >= 2 ? 'irr-emitter-2' : e.gph >= 1 ? 'irr-emitter-1' : 'irr-emitter-05', 1);
    add('irr-mp-nozzle', z.headCount); add('irr-spray-body', z.headCount); add('irr-pvc-lateral', z.tubing.lateralPipeFt);
  }
  add('irr-mainline', 25); add('irr-wire', 25 + Math.ceil(Math.hypot(yard.w, yard.d)));
  const parts = Object.entries(q).map(([key, qty]) => ({ key, ...IRRIGATION_PARTS[key], qty, extended: +(qty * IRRIGATION_PARTS[key].unitCost).toFixed(2) }));
  const priceBookItems = Object.fromEntries(parts.map(p => [p.key, { name: p.name, unit: p.unit, unitCost: p.unitCost, laborHoursPerUnit: p.laborHoursPerUnit }]));
  const takeoffLines = [{ key: 'drip', qty: dripValves, unit: 'zone', note: 'contractor takeoff "drip" key (per drip zone)' }, ...parts.map(p => ({ key: p.key, qty: p.qty, unit: p.unit }))];
  // Water use vs all-lawn baseline
  const yardSqft = yard.w * yard.d; const hardSqft = items.filter(it => it.kind === 'path' || it.kind === 'wall').reduce((s, it) => s + (it.kind === 'wall' ? Math.abs(it.w) * 1 : area(it)), 0);
  const baselineSqft = Math.max(0, yardSqft - hardSqft);
  const baselineMonthly = C.eto.map((e, m) => Math.round(netDepthIn(e, C.precip[m], LAWN_PF[lawnType], EFFICIENCY.spray) * baselineSqft * GAL_PER_SQFT_IN));
  const planMonthly = C.eto.map((_, m) => zones.reduce((s, z) => s + z.monthly[m].gallons, 0));
  const annual = planMonthly.reduce((a, b) => a + b, 0), base = baselineMonthly.reduce((a, b) => a + b, 0);
  const plan = {
    v: 1, generatedFor: { zip: loc.zip, yard }, location: loc, lawnType,
    supply: { waterSource, pressurePsi, flowGpm, designBudgetGpm: budgetGpm, assumed: { pressure: opts.pressurePsi == null, flow: opts.flowGpm == null } },
    hydrozones: zones, noIrrigation, valveCount: totalValves, dripValves, lawnValves, maxValveGpm: +maxZoneGpm.toFixed(2), withinFlowBudget: maxZoneGpm <= budgetGpm,
    equipment, parts, partsTotal: +parts.reduce((s, p) => s + p.extended, 0).toFixed(2), priceBookItems, takeoffLines,
    waterUse: { annualGallons: annual, monthlyGallons: planMonthly, baselineAnnualGallons: base, baselineMonthlyGallons: baselineMonthly, baselineSqft: Math.round(baselineSqft),
      savingsGallons: base - annual, savingsPct: base > 0 ? Math.round((1 - annual / base) * 100) : 0,
      method: `Gallons = max(0, ETo×PF − 0.5×rain)/efficiency × area × 0.623. Baseline = all non-hardscape area as ${lawnType}-season lawn (PF ${LAWN_PF[lawnType]}) on standard sprays (eff ${EFFICIENCY.spray}).` },
    overlay: { manifold, zones: zones.map(z => ({ id: z.id, name: z.name, color: z.color, method: z.method, outline: z.overlay.outline, emitters: z.overlay.emitters, heads: z.overlay.heads })) },
    warnings, notes,
    disclaimer: 'General planning guide only. Verify flow/pressure on site, follow local plumbing codes and water-use rules; backflow devices often require a licensed installer and annual testing.',
  };
  plan.mwelo = loc.state === 'CA' ? mweloCheck(design, plan, opts.mwelo || {}) : null;
  return plan;
}
