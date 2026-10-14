// catalog.js — helpers to use the Yardplan app catalog (yardplan/data.js) without modifying it.
// Browser: load ../yardplan/data.js as a classic <script>, then call catalogFromGlobals().
// Node: use loadAppCatalog() from catalog-node.js.
export function catalogFromGlobals(g = globalThis) {
  // data.js declares top-level `const` (global lexical scope, not window props) — read them via indirect eval.
  const get = n => { try { return (0, eval)(n); } catch (e) { return g[n]; } };
  return { plants: get('PLANTS'), plant3d: get('PLANT_SIZE'), zipFallback: get('ZIP_FALLBACK'), materials: get('MATERIALS') };
}
/** Normalize: { plants: [...] , plant3d } -> Map id -> plant with numeric heightFt/spreadFt */
export function plantIndex(catalog) {
  const m = new Map(); const p3 = (catalog && catalog.plant3d) || {};
  for (const p of (catalog && catalog.plants) || []) {
    const d = p3[p.id] || {}; const nums = String(p.size || '').match(/\d+(\.\d+)?/g) || [];
    const hNum = d.h || (nums.length ? +nums[nums.length - 1] * (/in\b/.test(p.size) && !/ft/.test(p.size) ? 1 / 12 : 1) : 3);
    m.set(p.id, { ...p, heightFt: hNum, spreadFt: d.w || Math.max(1, hNum * 0.8) });
  }
  return m;
}
