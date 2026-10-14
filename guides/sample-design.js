// Reno, NV (ZIP 89501, zone 7b) sample design using Yardplan catalog ids (yard3d serialize() v2, feet).
export const RENO_ZIP = '89501';
export const RENO_DESIGN = { v: 2, yard: { w: 50, d: 36 }, items: [
  { kind: 'lawn', x: -10, z: 8, r: 0, w: 22, d: 14 },
  { kind: 'mulch', x: -4, z: -12, r: 0, w: 34, d: 9 },             // mixed back border
  { kind: 'mulch', x: 16, z: 10, r: 0, w: 12, d: 8 },              // dense low-water pollinator bed -> inline drip
  { kind: 'gravel', x: 16, z: -1, r: 0, w: 10, d: 6 },
  { kind: 'path', x: 8, z: 3, r: 0, w: 20, d: 4 },                 // paver path
  { kind: 'dg', x: -18, z: -2, r: 0, w: 10, d: 8 },                // DG seating pad
  { kind: 'wall', x: -4, z: -16.8, r: 0, w: 34, d: 1, h: 2, footing: 0.5 },
  { kind: 'plant', id: 'serviceberry', x: -17, z: -12, r: 0 }, { kind: 'plant', id: 'buroak', x: -20, z: 14, r: 0 },
  { kind: 'plant', id: 'ninebark', x: -10, z: -13, r: 0 }, { kind: 'plant', id: 'ninebark', x: 8, z: -13, r: 1 },
  { kind: 'plant', id: 'boxwood', x: -3, z: -10, r: 0 }, { kind: 'plant', id: 'boxwood', x: 1, z: -10, r: 0 },
  { kind: 'plant', id: 'hosta', x: -14, z: -9, r: 0 }, { kind: 'plant', id: 'heuchera', x: -12, z: -9, r: 0 },
  { kind: 'plant', id: 'karlfoerster', x: 4, z: -13, r: 0 }, { kind: 'plant', id: 'karlfoerster', x: 6, z: -11, r: 0 },
  { kind: 'plant', id: 'russiansage', x: 11, z: -12, r: 0 }, { kind: 'plant', id: 'coneflower', x: -6, z: -14, r: 0 },
  { kind: 'plant', id: 'yucca', x: 14, z: -1, r: 0 }, { kind: 'plant', id: 'bluefescue', x: 18, z: -2, r: 0 }, { kind: 'plant', id: 'bluefescue', x: 18, z: 0, r: 0 },
  ...[[12,8],[14,8],[16,8],[18,8],[20,8],[12,10.5],[14,10.5],[16,10.5],[18,10.5],[20,10.5],[13,12.5],[17,12.5],[19,12.5]].map(([x, z], i) =>
    ({ kind: 'plant', id: ['catmint', 'yarrow', 'penstemon'][i % 3] === 'penstemon' ? 'gaillardia' : ['catmint', 'yarrow', 'lavender'][i % 3], x, z, r: 0 })),
] };

// DEFAULT sample: Sacramento, CA (ZIP 95814, USDA 2023 zone 9b) — water-wise front yard, lawn kept under MWELO's 25% residential cap.
export const SACRAMENTO_ZIP = '95814';
export const SACRAMENTO_DESIGN = { v: 2, yard: { w: 50, d: 36 }, items: [
  { kind: 'lawn', x: -14, z: 10, r: 0, w: 16, d: 12 },               // 192 sq ft "functional" play lawn
  { kind: 'mulch', x: -2, z: -11, r: 0, w: 40, d: 10 },              // back border, CA natives + Mediterranean
  { kind: 'mulch', x: 15, z: 10, r: 0, w: 14, d: 10 },               // dense pollinator bed -> inline drip
  { kind: 'dg', x: 2, z: 6, r: 0, w: 12, d: 10 },                    // DG patio
  { kind: 'path', x: 2, z: -3, r: 0, w: 4, d: 8 },
  { kind: 'gravel', x: -16, z: -1, r: 0, w: 10, d: 6 },
  { kind: 'plant', id: 'liveoak', x: -18, z: -12, r: 0 }, { kind: 'plant', id: 'crape', x: 14, z: -12, r: 0 },
  { kind: 'plant', id: 'manzanita', x: -10, z: -12, r: 0 }, { kind: 'plant', id: 'manzanita', x: 6, z: -12, r: 0 },
  { kind: 'plant', id: 'rosemary', x: -4, z: -9, r: 0 }, { kind: 'plant', id: 'rosemary', x: 0, z: -9, r: 0 },
  { kind: 'plant', id: 'deergrass', x: -6, z: -13, r: 0 }, { kind: 'plant', id: 'deergrass', x: 2, z: -13, r: 0 },
  { kind: 'plant', id: 'heuchera', x: -14, z: -9, r: 0 }, { kind: 'plant', id: 'heuchera', x: -12, z: -9, r: 0 },
  { kind: 'plant', id: 'pinkmuhly', x: 10, z: -9, r: 0 }, { kind: 'plant', id: 'yucca', x: -16, z: -1, r: 0 }, { kind: 'plant', id: 'agave', x: -13, z: 0, r: 0 },
  ...[[10, 7], [12, 7], [14, 7], [16, 7], [18, 7], [20, 7], [10, 10], [12, 10], [14, 10], [16, 10], [18, 10], [20, 10], [11, 13], [15, 13], [19, 13]].map(([x, z], i) =>
    ({ kind: 'plant', id: ['yarrow', 'gaillardia', 'lantana'][i % 3], x, z, r: 0 })),
] };
export const DEFAULT_ZIP = SACRAMENTO_ZIP, DEFAULT_DESIGN = SACRAMENTO_DESIGN;
export const SAMPLES = { sacramento: { zip: SACRAMENTO_ZIP, design: SACRAMENTO_DESIGN, label: 'Sacramento 95814 (default, CA)' }, reno: { zip: RENO_ZIP, design: RENO_DESIGN, label: 'Reno 89501 (alternate)' } };
