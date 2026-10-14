// maintenance.js — month-by-month maintenance guide for a Yardplan design + location climate.
// General guide only; timing shifts with weather, microclimate and cultivar.
import { getLocation, MONTHS } from './location.js';
import { plantIndex } from './catalog.js';
import { area } from './geometry.js';

export const PRO_RATE = 65; // example $/hr for a maintenance pro (override via opts.proRate)
// Species-specific pruning / care (catalog ids). when: 'late-winter' | 'after-bloom' | 'spring' | 'early-summer' | 'fall' | 'summer'
export const SPECIES = {
  japmaple: { prune: 'late-winter', note: 'Light structural thinning only while dormant; protect from afternoon sun/wind scorch.', pests: 'aphids, leaf scorch, verticillium wilt' },
  redmaple: { prune: 'late-summer', note: 'Maples bleed sap in late winter — structural pruning in late summer/fall is fine.', pests: 'aphids, chlorosis in alkaline soil' },
  redbud: { prune: 'after-bloom', note: 'Blooms on old wood: prune right after spring flowering.', pests: 'canker, leafhoppers' },
  dogwood: { prune: 'after-bloom', note: 'Prune after flowering; avoid wounding trunk (borers).', pests: 'anthracnose, powdery mildew, borers' },
  serviceberry: { prune: 'late-winter', note: 'Remove suckers and crossing branches while dormant.', pests: 'cedar-apple rust, fireblight' },
  magnolia: { prune: 'after-bloom', note: 'Minimal pruning right after bloom.', pests: 'scale' },
  crape: { prune: 'late-winter', note: 'Remove suckers/crossing limbs only — no "crape murder" topping.', pests: 'aphids, powdery mildew, crape myrtle bark scale' },
  olive: { prune: 'late-winter', note: 'Thin after hard frost risk; fruitless types reduce litter.', pests: 'olive knot, scale' },
  buroak: { prune: 'late-winter', note: 'Prune oaks only while dormant (oak wilt / beetle risk).', pests: 'oak wilt (prune Nov–Feb only), galls' },
  liveoak: { prune: 'late-winter', note: 'Dormant-season pruning only (oak wilt); paint cuts where oak wilt is present.', pests: 'oak wilt' },
  riverbirch: { prune: 'late-summer', note: 'Birch bleed sap in spring — prune summer/fall.', pests: 'aphids, chlorosis' },
  desertwillow: { prune: 'late-winter', note: 'Shape and remove seed pods/deadwood before leaf-out.', pests: 'few' },
  paloverde: { prune: 'late-summer', note: 'Avoid heavy summer cuts (sunscald); light thinning late summer.', pests: 'palo verde root borer' },
  oakleaf: { prune: 'after-bloom', note: 'Blooms on old wood: prune lightly right after flowering.', pests: 'few' },
  bigleaf: { prune: 'after-bloom', note: 'Most bloom on old wood: deadhead only; remove dead canes in spring.', pests: 'powdery mildew, chlorosis' },
  annabelle: { prune: 'late-winter', note: 'Blooms on new wood: cut to 12–18 in. in late winter.', pests: 'few' },
  azalea: { prune: 'after-bloom', note: 'Prune within 3 weeks after flowering.', pests: 'lace bug, root rot' },
  boxwood: { prune: 'early-summer', note: 'Shear after spring flush; avoid fall shearing (winter burn).', pests: 'boxwood leafminer, psyllid, boxwood blight' },
  arborvitae: { prune: 'spring', note: 'Light shear only on green growth; never into bare wood.', pests: 'spider mites, bagworms, winter burn' },
  inkberry: { prune: 'spring', note: 'Shape in early spring.', pests: 'chlorosis in high-pH soils' },
  lavender: { prune: 'after-bloom', note: 'Shear spent spikes after first bloom; light shaping in spring — never cut into old bare wood.', pests: 'root rot from overwatering' },
  rosemary: { prune: 'after-bloom', note: 'Tip-prune after flowering; avoid hard cuts.', pests: 'spittlebugs, root rot' },
  russiansage: { prune: 'late-winter', note: 'Cut back to ~12 in. as new buds break in spring.', pests: 'few' },
  ninebark: { prune: 'after-bloom', note: 'Renew 1/3 of oldest stems after bloom.', pests: 'powdery mildew' },
  redtwig: { prune: 'late-winter', note: 'Remove 1/3 oldest canes for best winter color.', pests: 'leaf spot' },
  texassage: { prune: 'late-winter', note: 'Light shaping only; avoid shearing into balls.', pests: 'few' },
  hibiscus: { prune: 'late-winter', note: 'Prune after frost risk.', pests: 'aphids, whitefly' },
  agave: { prune: 'spring', note: 'Remove only dead lower leaves; wear eye protection.', pests: 'agave snout weevil' },
  yucca: { prune: 'spring', note: 'Remove spent flower stalks and dead leaves.', pests: 'yucca weevil' },
  hosta: { prune: 'fall', note: 'Cut foliage after hard frost.', pests: 'slugs/snails, deer' },
  beebalm: { prune: 'summer', note: 'Deadhead; thin for airflow.', pests: 'powdery mildew' },
  coneflower: { prune: 'late-winter', note: 'Leave seedheads for birds; cut back in late winter.', pests: 'aster yellows, Japanese beetles' },
  catmint: { prune: 'after-bloom', note: 'Shear by half after first flush for rebloom.', pests: 'few' },
  liriope: { prune: 'late-winter', note: 'Mow/cut to 3 in. before new growth.', pests: 'scale, anthracnose' },
};
const TYPE_DEFAULT = {
  tree: { prune: 'late-winter', note: 'Dormant-season structural pruning (remove dead, crossing, rubbing limbs).' },
  shrub: { prune: 'spring', note: 'Shape lightly; prune spring bloomers after flowering, summer bloomers in late winter.' },
  perennial: { prune: 'late-winter', note: 'Deadhead in summer; cut back last year\'s growth in late winter (leave stems over winter for pollinators).' },
  grass: { prune: 'late-winter', note: 'Cut warm-season grasses to 4–6 in. before new growth; comb out cool-season grasses (fescue) instead of cutting.' },
  groundcover: { prune: 'after-bloom', note: 'Shear lightly after bloom to keep dense.' },
};
const BLOOM_MONTH = { redbud: 4, dogwood: 4, serviceberry: 4, magnolia: 4, azalea: 4, lavender: 6, rosemary: 3, catmint: 5, ninebark: 6, oakleaf: 6, bigleaf: 7, phlox: 4, thyme: 6 };

const md = s => s ? { m: +s.slice(0, 2), d: +s.slice(3, 5) } : null;
const clampM = m => ((m - 1 + 12) % 12) + 1;

/**
 * generateMaintenanceGuide(design, { zip, catalog, location?, irrigationPlan?, proRate?, lawnType? })
 * -> { location, months[12]{month, tasks[]}, tasks[], score{level,points,breakdown}, annual{hours,diyCost,proCost}, disclaimer }
 */
export function generateMaintenanceGuide(design, opts = {}) {
  const items = (design && design.items) || []; const idx = plantIndex(opts.catalog);
  const loc = opts.location || getLocation(opts.zip, { zipFallback: opts.catalog && opts.catalog.zipFallback });
  if (!loc) throw new Error(`Unknown ZIP ${opts.zip}`);
  const C = loc.climate, rate = opts.proRate ?? PRO_RATE; const zoneNum = parseInt(loc.zone, 10);
  const lawnType = opts.lawnType || (opts.irrigationPlan && opts.irrigationPlan.lawnType) || (zoneNum >= 8 && C.summer !== 'mild' ? 'warm' : 'cool');
  const lf = md(C.lastFrost), ff = md(C.firstFrost), freeze = !!lf && C.freezeClimate;
  const frostFree = C.frostFree;
  // derived timing
  const lateWinter = freeze ? clampM(lf.m - 2) : 1;            // ~6–8 weeks before last frost
  const springM = freeze ? lf.m : 3;
  const firstMonthAbove = t => { const i = C.tmean.findIndex(x => x >= t); return i < 0 ? null : i + 1; };
  const preEmergSpring = clampM((firstMonthAbove(50) || 2) - (C.tmean[(firstMonthAbove(50) || 2) - 1] > 58 ? 1 : 0)); // soil ~50–55°F
  const fallPreEmerg = (() => { for (let m = 8; m <= 11; m++) if (C.tmean[m - 1] < 70) return m; return 10; })();
  const peakM = C.eto.indexOf(Math.max(...C.eto)) + 1;
  const tasks = []; const T = (o) => tasks.push({ recurrence: 'yearly', minutes: 30, materials: 0, ...o, proCost: Math.round(((o.minutes ?? 30) / 60) * rate + (o.materials || 0)), diyCost: Math.round(o.materials || 0) });

  const plants = items.filter(it => it.kind === 'plant' && idx.has(it.id)).map(it => idx.get(it.id));
  const byId = new Map(); plants.forEach(p => byId.set(p.id, { p, n: (byId.get(p.id)?.n || 0) + 1 }));
  const has = k => items.some(it => it.kind === k), sq = k => items.filter(it => it.kind === k).reduce((s, it) => s + area(it), 0);
  const lawnSq = sq('lawn'), mulchSq = sq('mulch'), gravelSq = sq('gravel'), dgSq = sq('dg'), pathSq = sq('path');

  // --- Pruning per species
  const pestList = [];
  for (const { p, n } of byId.values()) {
    const s = SPECIES[p.id] || {}; const def = TYPE_DEFAULT[p.type] || TYPE_DEFAULT.shrub; const when = s.prune || def.prune;
    let months;
    if (when === 'late-winter') months = [lateWinter];
    else if (when === 'after-bloom') months = [clampM((BLOOM_MONTH[p.id] || (p.type === 'groundcover' ? 5 : 6)) + 1)];
    else if (when === 'spring') months = [springM];
    else if (when === 'early-summer') months = [clampM(springM + 1)];
    else if (when === 'late-summer') months = [8];
    else if (when === 'summer') months = [7];
    else if (when === 'fall') months = [ff ? ff.m : 11];
    const per = { tree: 45, shrub: 15, perennial: 5, grass: 6, groundcover: 5 }[p.type] || 10;
    T({ id: `prune-${p.id}`, category: 'Pruning', title: `Prune ${p.name}${n > 1 ? ` (×${n})` : ''}`, months, minutes: per * n, details: s.note || def.note, appliesTo: [p.id] });
    if (s.pests && s.pests !== 'few') pestList.push(`${p.name}: ${s.pests}`);
  }
  if (pestList.length) T({ id: 'pest-walk', category: 'Pest & disease', title: `Pest & disease walk (${pestList.length} species to watch)`, months: [clampM(springM + 1), clampM(peakM)], minutes: 10 + 3 * pestList.length,
    details: `Watch for — ${pestList.join('; ')}. IPM first: hose off, prune affected parts, horticultural oil/soap; confirm ID with your local extension office before treating.` });
  // perennials deadheading
  const perennials = plants.filter(p => p.type === 'perennial' || p.type === 'groundcover');
  if (perennials.length) T({ id: 'deadhead', category: 'Pruning', title: `Deadhead perennials (${perennials.length} plants)`, months: [6, 7, 8].map(m => frostFree ? m - 1 : m), recurrence: 'monthly-in-season', minutes: Math.ceil(perennials.length * 2), details: 'Remove spent blooms to extend flowering; leave late-season seedheads for birds.' });
  // --- Fertilizing
  const shrubsTrees = plants.filter(p => p.type === 'tree' || p.type === 'shrub');
  const lowOnly = plants.length && plants.every(p => p.water === 'low');
  if (plants.length) T({ id: 'fert-beds', category: 'Fertilizing', title: lowOnly ? 'Light compost top-dress (low-water/native plants need little or no fertilizer)' : 'Slow-release fertilizer / compost for shrubs, trees and perennials', months: [springM], minutes: 20 + shrubsTrees.length * 3, materials: lowOnly ? 15 : 30, details: 'Apply as new growth begins. Skip for xeric natives (lavender, yarrow, Russian sage, agave) — excess N causes floppy, short-lived plants. Do not fertilize after late summer in freeze climates.' });
  // --- Mulch
  if (mulchSq) { const cuyd = mulchSq * (1 / 12) / 27; T({ id: 'mulch', category: 'Mulch', title: `Top up mulch ~1 in. (${Math.round(mulchSq)} sq ft beds ≈ ${cuyd.toFixed(1)} cu yd)`, months: [clampM(springM + (freeze ? 0 : 0))], minutes: Math.round(mulchSq * 0.05 + 15), materials: Math.round(cuyd * 40), details: 'Keep 2–3 in. total depth; pull mulch 3–6 in. away from trunks/crowns; reposition drip tubing under mulch.' }); }
  // --- Weeds
  const weedSq = mulchSq + gravelSq + dgSq;
  if (weedSq) {
    T({ id: 'preemergent-spring', category: 'Weeds', title: 'Spring pre-emergent (or corn gluten) in beds, gravel and DG', months: [preEmergSpring], minutes: 20 + Math.round(weedSq * 0.01), materials: 25, details: 'Apply when soil reaches ~50–55°F (forsythia bloom). Do not use where you are sowing seed. Water in per label.' });
    T({ id: 'preemergent-fall', category: 'Weeds', title: 'Fall pre-emergent for winter annual weeds', months: [fallPreEmerg], minutes: 20 + Math.round(weedSq * 0.01), materials: 25, details: 'Targets cheatgrass, annual bluegrass, bittercress etc. Optional where winter weeds are not a problem.' });
    T({ id: 'weeding', category: 'Weeds', title: 'Hand-weed beds, gravel and DG', months: (frostFree ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : MONTHS.map((_, i) => i + 1).filter(m => m >= springM && m <= (ff ? ff.m : 11))), recurrence: 'monthly', minutes: Math.round(10 + weedSq * 0.02), details: 'Pull weeds before they set seed; spot-treat gravel joints.' });
  }
  // --- Lawn
  if (lawnSq) {
    const cool = lawnType === 'cool'; const mowMonths = MONTHS.map((_, i) => i + 1).filter(m => C.tmean[m - 1] >= (cool ? 45 : 60));
    T({ id: 'mow', category: 'Lawn', title: `Mow lawn at ${cool ? '3–3.5 in.' : '1.5–2.5 in. (bermuda 1–2 in., zoysia/St. Augustine 2–3.5 in.)'} — weekly in season`, months: mowMonths, recurrence: 'weekly-in-season', minutes: Math.round(15 + lawnSq * 0.02), details: 'Never remove more than 1/3 of blade height; leave clippings (grasscycling); sharpen blade each spring.' });
    T({ id: 'aerate', category: 'Lawn', title: 'Core-aerate lawn', months: cool ? [9] : [clampM(springM + 2)], minutes: Math.round(30 + lawnSq * 0.02), materials: 70, details: cool ? 'Early fall while grass actively grows (spring is the second choice).' : 'Early summer when warm-season grass is actively growing.' });
    if (cool) T({ id: 'overseed', category: 'Lawn', title: 'Overseed thin areas', months: [9], minutes: 30, materials: 30, details: 'Right after aeration; keep seed moist 2–3 weeks (see irrigation establishment schedule).' });
    T({ id: 'fert-lawn', category: 'Lawn', title: cool ? 'Fertilize cool-season lawn (main feedings fall + late fall, light late spring)' : 'Fertilize warm-season lawn (late spring–summer)', months: cool ? [5, 9, 10] : [5, 6, 8], minutes: 20, materials: 25, details: 'Slow-release N ~0.5–1 lb N per 1,000 sq ft per feeding; skip if restricted or lawn is dormant.' });
    T({ id: 'dethatch', category: 'Lawn', title: 'Check thatch; dethatch if > 1/2 in.', months: cool ? [9] : [6], recurrence: 'every-2-years', minutes: 20 });
  }
  // --- Irrigation
  const dripPresent = !opts.irrigationPlan || opts.irrigationPlan.dripValves > 0 || plants.length;
  const irrMonths = frostFree ? MONTHS.map((_, i) => i + 1) : MONTHS.map((_, i) => i + 1).filter(m => m >= springM && m <= (ff ? ff.m : 10));
  if (dripPresent && plants.length) {
    T({ id: 'drip-check', category: 'Irrigation', title: 'Drip check: run each zone, look for clogged/missing emitters, leaks, clean filter', months: irrMonths, recurrence: 'monthly', minutes: 20, details: 'Flush line ends 2× a year; move/add emitters outward as plants grow; confirm regulator output.' });
  }
  for (const m of [3, 5, 7, 9, 11]) {
    const pct = Math.round(C.eto[m - 1] / Math.max(...C.eto) * 100);
    if (!frostFree && freeze && (m < springM || m > (ff ? ff.m : 10))) continue;
    T({ id: `irr-adjust-${m}`, category: 'Irrigation', title: `Seasonal irrigation adjustment: set water budget ≈ ${pct}% of peak`, months: [m], minutes: 10, details: `Local ETo this month ≈ ${C.eto[m - 1]} in vs peak ${Math.max(...C.eto)} in (${MONTHS[C.eto.indexOf(Math.max(...C.eto))]}). Smart controllers adjust automatically — verify.${loc.restrictions ? ' Follow ' + loc.restrictions.utility + ' watering-day rules.' : ''}` });
  }
  if (freeze) {
    T({ id: 'spring-startup', category: 'Irrigation', title: 'Spring irrigation start-up', months: [clampM(lf.m)], date: `${String(lf.m).padStart(2, '0')}-${String(Math.min(28, lf.d)).padStart(2, '0')}`, minutes: 60, details: 'After hard-freeze risk (~last frost): slowly open supply, close drains, check backflow (test if required), replace controller battery, run each zone and fix heads/emitters.' });
    T({ id: 'winterize', category: 'Irrigation', title: lawnSq ? 'Winterize & blow out irrigation (compressed air)' : 'Winterize drip: shut off, drain, insulate backflow', months: [ff.m], date: `${String(ff.m).padStart(2, '0')}-${String(Math.max(1, ff.d - 7)).padStart(2, '0')}`, minutes: lawnSq ? 60 : 30, materials: lawnSq ? 0 : 0, details: 'Before the first hard freeze: shut off supply, drain/blow out lines at ≤50 psi for poly/drip (≤80 psi PVC), insulate or remove backflow device, set controller to off/rain mode. Many owners hire this out (~$60–$120).' });
    T({ id: 'winter-water', category: 'Irrigation', title: 'Winter watering during dry spells (trees/shrubs)', months: [12, 1, 2].filter(m => m !== lf.m), minutes: 20, details: 'When soil is unfrozen and temps > 40°F, hand-water evergreens and young trees monthly if no rain/snow.' });
  } else {
    T({ id: 'backflow-test', category: 'Irrigation', title: 'Backflow test / inspect (if required locally)', months: [3], minutes: 15, materials: 0, details: 'Many utilities require an annual test by a certified tester.' });
  }
  // --- Hardscape
  if (pathSq) {
    T({ id: 'paver-sand', category: 'Hardscape', title: 'Pavers: sweep/refill joint sand, pull weeds, check for settling', months: [springM], minutes: Math.round(20 + pathSq * 0.05), materials: 20, details: 'Polymeric sand needs dry weather to set. Reset sunken pavers on bedding sand.' });
    T({ id: 'paver-seal', category: 'Hardscape', title: 'Pavers: clean and seal (optional)', months: [clampM(springM + 1)], recurrence: 'every-3-years', minutes: Math.round(30 + pathSq * 0.1), materials: Math.round(pathSq * 0.4), details: 'Seal every 2–3 years with a breathable paver sealer after joints are full.' });
  }
  if (dgSq) T({ id: 'dg', category: 'Hardscape', title: 'Decomposed granite: rake, top up ~1/4 in. where thin, wet & re-compact', months: [springM], minutes: Math.round(20 + dgSq * 0.05), materials: Math.round(dgSq / 81 * 60), details: 'Wet thoroughly and roll/plate-compact; fix erosion channels after storms.' });
  if (gravelSq) T({ id: 'gravel', category: 'Hardscape', title: 'Gravel: rake level, remove debris, top up thin spots', months: [springM, 10], minutes: Math.round(10 + gravelSq * 0.03), materials: 10 });
  if (has('wall')) T({ id: 'wall', category: 'Hardscape', title: 'Retaining wall: check drainage/weep outlets, cap stones, leaning or bulging', months: [springM, ff ? ff.m : 11], minutes: 15, details: 'Keep irrigation from soaking soil behind the wall. Bulging/leaning walls > 4 ft need an engineer.' });
  // --- Seasonal general
  if (freeze) T({ id: 'fall-cleanup', category: 'Cleanup', title: 'Fall cleanup: leaves off lawn/hardscape, leave perennial stems for pollinators', months: [ff.m, clampM(ff.m + 1)], minutes: 60 + Math.round(lawnSq * 0.02) });
  if (C.summer === 'hot-dry' || C.aridity === 'arid') T({ id: 'heat', category: 'Pest & disease', title: 'Heat/stress watch: wilting, scorch, spider mites in hot dry weather', months: [clampM(peakM - 1), peakM, clampM(peakM + 1)], minutes: 10 });

  // Calendar
  const months = MONTHS.map((name, i) => ({ month: i + 1, name, tasks: tasks.filter(t => t.months.includes(i + 1)).map(t => t.id) }));
  const occ = t => t.recurrence === 'weekly-in-season' ? t.months.length * 4.3 : t.recurrence === 'every-2-years' ? 0.5 * t.months.length : t.recurrence === 'every-3-years' ? t.months.length / 3 : t.months.length;
  const hours = tasks.reduce((s, t) => s + occ(t) * t.minutes / 60, 0), diy = tasks.reduce((s, t) => s + occ(t) * t.diyCost, 0), pro = tasks.reduce((s, t) => s + occ(t) * t.proCost, 0);
  // Score
  const breakdown = {
    lawn: Math.round(lawnSq / 250), hedges: (byId.get('boxwood')?.n || 0) + (byId.get('arborvitae')?.n || 0),
    perennials: Math.round(perennials.length / 4), highWater: plants.filter(p => p.water === 'high').length,
    trees: plants.filter(p => p.type === 'tree').length, hardscape: Math.round((pathSq + dgSq) / 200),
    lowWaterCredit: -Math.round(plants.filter(p => p.water === 'low').length / 6),
  };
  const points = Object.values(breakdown).reduce((a, b) => a + b, 0) + Math.round(hours / 25);
  const level = points <= 6 ? 'easy' : points <= 14 ? 'moderate' : 'high';
  return { v: 1, location: loc, lawnType, freezeClimate: freeze, frostFree, frost: { last: C.lastFrost, first: C.firstFrost },
    tasks, months, annual: { hours: +hours.toFixed(1), diyCost: Math.round(diy), proCost: Math.round(pro) }, score: { level, points, breakdown, hoursPerYear: +hours.toFixed(1) },
    proRate: rate, disclaimer: 'General maintenance guide; adjust timing to actual weather and local extension-service advice. Follow pesticide labels and local water rules.' };
}
