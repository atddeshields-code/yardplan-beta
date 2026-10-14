// takeoff.js — quantity takeoff from Yardplan design data (yard3d serialize() format).
// Units: feet. Design: { v:2, yard:{w,d}, items:[{kind,id?,x,z,r,w,d, h?,footing?,surcharge?, cutCuYd?,fillCuYd?}] }
export const CUFT_PER_CUYD = 27;

// App purchase units (mirror data.js MATERIALS.unit) plus contractor-only keys.
export const UNIT_DEFS = {
  mulch:   { name: 'Shredded mulch (3" deep)', unit: '2 cu ft bag', per: 2, basis: 'volume', depthIn: 3 },
  rock:    { name: 'River rock / gravel (2" deep)', unit: '0.5 cu ft bag', per: 0.5, basis: 'volume', depthIn: 2 },
  pavers:  { name: 'Concrete pavers 12"×12"', unit: 'paver', per: 1, basis: 'area' },
  sod:     { name: 'Sod', unit: 'pallet (~450 sq ft)', per: 450, basis: 'area' },
  topsoil: { name: 'Topsoil (4" deep)', unit: '0.75 cu ft bag', per: 0.75, basis: 'volume', depthIn: 4 },
  edging:  { name: 'Landscape edging', unit: '20 ft roll', per: 20, basis: 'length' },
  fabric:  { name: 'Landscape fabric', unit: '3×50 ft roll (150 sq ft)', per: 150, basis: 'area' },
  base:    { name: 'Compacted gravel base (4" deep)', unit: 'cu yd', per: 27, basis: 'volume', depthIn: 4 },
  sand:    { name: 'Bedding sand (1" deep)', unit: 'cu yd', per: 27, basis: 'volume', depthIn: 1 },
  wallblock: { name: 'Segmental retaining wall block', unit: 'sq ft face', per: 1, basis: 'area' },
  grading: { name: 'Grading cut/fill', unit: 'cu yd', per: 27, basis: 'volume' },
  dg:      { name: 'Decomposed granite (3" compacted)', unit: 'cu yd', per: 27, basis: 'volume', depthIn: 3 },
  excavation: { name: 'Excavation & haul-off', unit: 'cu yd', per: 27, basis: 'volume', depthIn: 6 },
  drip:    { name: 'Drip irrigation zone', unit: 'zone', per: 1, basis: 'count' },
};

export const DEFAULT_WASTE = { dg: .10, excavation: 0, drip: 0, mulch: .10, rock: .10, pavers: .05, sod: .05, topsoil: .10, edging: .10, fabric: .10, base: .10, sand: .10, wallblock: .05, grading: 0 };

// Which materials each design feature kind consumes.
export const FEATURE_RECIPES = {
  mulch:  ['mulch', 'fabric', 'edging'],
  path:   ['pavers', 'base', 'sand', 'edging'],
  gravel: ['rock', 'fabric', 'edging'],
  lawn:   ['sod', 'topsoil'],
  wall:   ['wallblock'],
  grade:  ['grading', 'excavation'],   // excavation only when item.haulCuYd > 0
  dg:     ['dg', 'fabric', 'edging'],  // contractor extension kinds (not produced by the app yet)
  excavation: ['excavation'],         // {kind:'excavation', w, d, depthIn=6} or {haulCuYd}
  drip:   ['drip'],                   // {kind:'drip', zones=1}
};

export const DEFAULT_CONTAINER = { tree: '15 gal', shrub: '5 gal', perennial: '1 gal', grass: '1 gal', groundcover: '4 in pot', succulent: '5 gal' };

const r2 = n => Math.round(n * 100) / 100;

/** Measure one design item: {area sqft, perimeter ft, length ft, faceArea sqft} */
export function measureItem(it) {
  const w = Math.abs(+it.w || 0), d = Math.abs(+it.d || 0);
  if (it.kind === 'wall') { const h = +it.h || 0; return { area: 0, perimeter: 0, length: w, height: h, faceArea: w * (h + (+it.footing || 0)) }; }
  return { area: w * d, perimeter: 2 * (w + d), length: 0 };
}

/**
 * takeoff(design, { catalog, waste, includeLawn, recipes, containerSizes }) -> { lines, plants, totals, design }
 * catalog: { plants: PLANTS (data.js), plant3d?: PLANT3D }
 */
export function takeoff(design, opts = {}) {
  const waste = { ...DEFAULT_WASTE, ...(opts.waste || {}) };
  const recipes = { ...FEATURE_RECIPES, ...(opts.recipes || {}) };
  const items = (design && design.items) || [];
  const acc = {}; // key -> {area,length,volume(cuft),sources[]}
  const add = (key, m, src) => {
    const a = acc[key] || (acc[key] = { area: 0, length: 0, volume: 0, count: 0, sources: [] });
    a.count += m.count || 0; a.area += m.area || 0; a.length += m.length || 0; a.volume += m.volume || 0; if (src != null) a.sources.push(src);
  };
  const featureArea = {};
  items.forEach((it, idx) => {
    if (it.kind === 'plant') return;
    const rec = recipes[it.kind]; if (!rec) return;
    const m = measureItem(it);
    featureArea[it.kind] = (featureArea[it.kind] || 0) + m.area;
    for (const key of rec) {
      const u = UNIT_DEFS[key]; if (!u) continue;
      if (key === 'excavation') { const cy = +it.haulCuYd || (it.kind === 'excavation' ? m.area * (+it.depthIn || u.depthIn) / 12 / CUFT_PER_CUYD : 0); if (cy > 0) add(key, { area: it.kind === 'excavation' ? m.area : 0, volume: cy * CUFT_PER_CUYD }, idx); }
      else if (key === 'drip') add(key, { count: Math.max(1, Math.round(+it.zones || 1)) }, idx);
      else if (key === 'grading') add(key, { volume: ((+it.cutCuYd || 0) + (+it.fillCuYd || 0)) * CUFT_PER_CUYD }, idx);
      else if (key === 'wallblock') add(key, { area: m.faceArea, length: m.length }, idx);
      else if (u.basis === 'length') add(key, { length: m.perimeter }, idx);
      else if (u.basis === 'volume') add(key, { area: m.area, volume: m.area * u.depthIn / 12 }, idx);
      else add(key, { area: m.area }, idx);
    }
  });
  if (opts.includeLawn && design.yard) {
    const used = Object.entries(featureArea).filter(([k]) => !['wall', 'grade', 'excavation', 'drip'].includes(k)).reduce((s, [, v]) => s + v, 0);
    const lawn = Math.max(0, design.yard.w * design.yard.d - used);
    featureArea.lawn = lawn;
    for (const key of recipes.lawn) { const u = UNIT_DEFS[key]; add(key, u.basis === 'volume' ? { area: lawn, volume: lawn * u.depthIn / 12 } : { area: lawn }, 'lawn'); }
  }
  const lines = Object.entries(acc).map(([key, a]) => {
    const u = UNIT_DEFS[key], wf = waste[key] ?? 0;
    const measure = u.basis === 'count' ? a.count : u.basis === 'volume' ? a.volume : u.basis === 'length' ? a.length : a.area;
    const net = measure / u.per;
    const qty = u.per === CUFT_PER_CUYD ? Math.ceil(net * (1 + wf) * 10) / 10 : Math.ceil(r2(net * (1 + wf)));
    return { key, name: u.name, unit: u.unit, basis: u.basis, area: r2(a.area), length: r2(a.length),
      volumeCuFt: r2(a.volume), volumeCuYd: r2(a.volume / CUFT_PER_CUYD), waste: wf, netQty: r2(net), qty, sources: a.sources };
  });
  const plants = plantSchedule(design, opts);
  return { lines, plants, featureArea: Object.fromEntries(Object.entries(featureArea).map(([k, v]) => [k, r2(v)])),
    totals: { plantCount: plants.reduce((s, p) => s + p.count, 0), lineCount: lines.length } };
}

/** plantSchedule(design, {catalog, containerSizes}) -> [{id,name,sci,type,size,container,count,native,matureH,matureW}] */
export function plantSchedule(design, opts = {}) {
  const cat = (opts.catalog && opts.catalog.plants) || [];
  const p3 = (opts.catalog && opts.catalog.plant3d) || {};
  const cont = { ...DEFAULT_CONTAINER, ...(opts.containerSizes || {}) };
  const counts = new Map();
  for (const it of (design && design.items) || []) if (it.kind === 'plant' && it.id) counts.set(it.id, (counts.get(it.id) || 0) + 1);
  return [...counts].map(([id, count]) => {
    const p = cat.find(c => c.id === id) || { id, name: id, sci: '', type: 'unknown', size: '' };
    const m = p3[id] || {};
    const type = m.model === 'succulent' ? 'succulent' : p.type;
    return { id, key: 'plant:' + id, name: p.name, sci: p.sci, type: p.type, size: p.size, native: p.native || '',
      container: (opts.containerSizes && opts.containerSizes[id]) || cont[type] || cont[p.type] || '1 gal',
      matureH: m.h ?? null, matureW: m.w ?? null, count };
  }).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
}

const csvCell = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
/** toCSV(takeoffResult) -> string (materials section then plant schedule) */
export function toCSV(t) {
  const rows = [['section', 'key', 'name', 'qty', 'unit', 'area_sqft', 'length_ft', 'volume_cuyd', 'waste_pct', 'net_qty']];
  for (const l of t.lines) rows.push(['material', l.key, l.name, l.qty, l.unit, l.area, l.length, l.volumeCuYd, Math.round(l.waste * 100), l.netQty]);
  rows.push([]);
  rows.push(['section', 'id', 'common_name', 'count', 'container', 'botanical_name', 'type', 'mature_size']);
  for (const p of t.plants) rows.push(['plant', p.id, p.name, p.count, p.container, p.sci, p.type, p.size]);
  return rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n';
}
