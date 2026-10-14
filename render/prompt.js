// buildRenderPrompt(design, opts) -> { prompt, negative, provider, length, truncated }
// Pure ESM, no DOM. Works in browser, Worker and Node.
import { PLANTS, STYLES } from './catalog.js';

export const VIEW_TYPES = ['ground', 'drone', 'top'];
export const PROVIDER_LIMITS = { xai: 2500, 'fal-kontext': 900, 'hf-space': 700, 'cf-img2img': 320, pollinations: 700, openai: 4000, gemini: 4000, mock: 4000, default: 1800 }; // chars; conservative [UNVERIFIED exact limits]
export const HARDSCAPE = {
  pavers: 'irregular natural flagstone / concrete pavers with tight gravel joints',
  dg: 'compacted decomposed granite (DG) paths in warm tan',
  riverrock: 'rounded river rock (2-4 in) in dry-creek bands',
  boulders: 'a few large weathered granite boulders, partly buried so they look natural',
  edging: 'clean steel landscape edging separating beds from paths',
  mulch: 'dark shredded bark mulch in planting beds',
  gravel: 'crushed gravel ground cover',
  wall: 'low stacked-stone retaining wall',
};
const REGION_CUES = {
  'high-desert': 'high-desert Great Basin setting (Reno, NV area): dry clear air, sagebrush hills, intense sun, water-wise planting',
};
const STYLE_CUES = {
  xeriscape: 'water-wise xeriscape, plants grouped by water need, mineral mulches, no lawn',
  cottage: 'informal abundant English cottage borders, layered flowering perennials, curving path',
  modern: 'clean modern minimalist geometry, restrained palette, repeated mass plantings',
  japanese: 'Japanese garden: asymmetric balance, raked gravel, natural stone, careful pruning',
  prairie: 'naturalistic native prairie meadow drifts of grasses and wildflowers',
  mediterranean: 'Mediterranean: silver aromatic drought-tolerant plants, warm stone, terracotta',
  formal: 'formal classical layout: symmetry, clipped hedges, crisp edges',
  woodland: 'layered woodland shade garden with understory and groundcover',
  tropical: 'lush tropical resort planting with bold large leaves and saturated flowers',
};
const SEASON = { spring: 'late spring, fresh growth and blooms', summer: 'mid-summer, full foliage', fall: 'early autumn color', winter: 'winter dormancy, evergreen structure' };

export const zoneNum = z => (z == null ? null : parseInt(String(z), 10) || null);

function plantPhrase(p, count) {
  const n = count > 1 ? `${count}× ` : '';
  const sz = p.h != null ? `~${fmt(p.h)} ft tall × ${fmt(p.w)} ft wide mature` : p.size;
  const cue = { decid: 'deciduous shade tree', flowertree: 'small flowering tree', conifer: 'conifer', roundshrub: 'rounded shrub', grass: 'ornamental grass clump', groundcover: 'low spreading groundcover', perennial: 'perennial', succulent: 'succulent rosette' }[p.model] || p.type;
  return `${n}${p.name} (${cue}, ${sz}${p.bloom ? ', in bloom' : ''})`;
}
const fmt = v => (Number.isInteger(v) ? v : (+v).toFixed(1));

/** Pick sensible default plants when the design names none: style + zone + low water first. */
export function suggestPlants(style, zone, n = 6) {
  const z = zoneNum(zone);
  return PLANTS.filter(p => p.styles.includes(style) && (z == null || (p.zmin <= z && p.zmax >= z)))
    .sort((a, b) => (a.water === 'low' ? 0 : 1) - (b.water === 'low' ? 0 : 1)).slice(0, n).map(p => p.id);
}

/**
 * design: { style, zone, region, plants:[id|{id,count}], hardscape:[keys], layout:[{id,x,y}] (x,y image fractions 0..1), notes }
 * opts:   { view:'ground'|'drone'|'top', provider, season, timeOfDay, mask:boolean, guide:boolean, aspect:'3:4', maxChars }
 */
export function buildRenderPrompt(design = {}, opts = {}) {
  const view = VIEW_TYPES.includes(opts.view) ? opts.view : 'ground'; if (opts.equirect) opts = { ...opts, aspect: '2:1' };
  const style = STYLES.find(s => s.id === design.style) || STYLES[0];
  const z = zoneNum(design.zone);
  const ids = (design.plants && design.plants.length ? design.plants : suggestPlants(style.id, z)).map(x => (typeof x === 'string' ? { id: x, count: 1 } : x));
  const counts = new Map(); for (const { id, count = 1 } of ids) counts.set(id, (counts.get(id) || 0) + count);
  for (const l of design.layout || []) if (!counts.has(l.id)) counts.set(l.id, 0);
  const warnings = [];
  const plants = [...counts].map(([id, c]) => { const p = PLANTS.find(q => q.id === id); if (!p) { warnings.push(`unknown plant ${id}`); return null; }
    if (z != null && (p.zmin > z || p.zmax < z)) warnings.push(`${p.name} is rated zones ${p.zmin}-${p.zmax}, design zone ${z}`);
    const placed = (design.layout || []).filter(l => l.id === id).length; return { p, c: Math.max(c, placed) }; }).filter(Boolean);
  const hard = (design.hardscape || []).filter(k => HARDSCAPE[k]).map(k => HARDSCAPE[k]);
  const region = REGION_CUES[design.region] || (design.region ? String(design.region).slice(0, 120) : '');

  const keep = view === 'top'
    ? 'This is a top-down plan view (satellite/drone straight down). Keep it seen from directly above: same orthographic framing, scale, north orientation, roof outlines, fences, driveways and property lines exactly where they are. Show trees and shrubs as canopy circles sized to their mature spread with soft shadows; no perspective change, no tilt, no horizon.'
    : `Keep the exact same camera position, lens, perspective, horizon and framing${view === 'drone' ? ' of this oblique aerial view' : ''}. Preserve the house, sheds, fences, gates, walls, poles, neighboring buildings, hills and sky exactly as they are; only change the ground/landscape inside the yard.`;
  const tagged = [
    [0, `Photorealistic landscape design visualization: edit this ${view === 'top' ? 'aerial plan' : 'photo'} of a residential yard into a finished, professionally installed ${style.name} landscape (${STYLE_CUES[style.id]}).`],
    [0, keep],
    [0, `Output must keep the input image's aspect ratio${opts.aspect ? ` (${opts.aspect})` : ''} and full frame; do not crop, pad, rotate or zoom.`],
    [2, 'Remove clutter: hoses, toys, tools, loose lumber, trash, construction debris, tire ruts and the photographer\'s shadow.'],
    [5, region && `Setting: ${region}.`],
    [6, z != null && `USDA hardiness zone ${design.zone}; plants look healthy and climate-appropriate.`],
    [1, plants.length && `Plants (correct scale for a young-to-mid-maturity install${view === 'top' ? ', canopy circles' : ''}): ${plants.map(({ p, c }) => plantPhrase(p, c)).join('; ')}.`],
    [3, hard.length && `Hardscape: ${hard.join('; ')}.`],
    [1, layoutText(design.layout, view)],
    [1, opts.guide && 'A second image is a layout guide rendered from the to-scale 3D plan: match plant positions and sizes to its colored markers, but make everything photographic (do not copy the guide\'s look).'],
    [0, opts.styleRef && 'Another image is the STYLE REFERENCE: an earlier render of this same yard from a different angle. Use exactly the same plant species, sizes, bed shapes, path material, boulders and colors so the views match; only the camera differs.'],
    [0, opts.equirect && 'The input is a 360° equirectangular panorama (2:1). Keep it equirectangular with the same projection and horizon line; the left and right edges must join seamlessly with no visible seam; do not straighten curved lines.'],
    [1, opts.seed != null && `Variation seed ${opts.seed}: keep the design consistent with other views using this seed.`],
    [0, opts.mask && 'Only change areas inside the provided mask; leave everything outside the mask pixel-identical.'],
    [7, `Lighting: natural ${opts.timeOfDay || 'late-afternoon'} sun consistent with the original shadows, ${SEASON[opts.season] || SEASON.summer}. Realistic materials, no CGI look.`],
    [8, design.notes && `Notes: ${String(design.notes).slice(0, 200)}.`],
  ];
  const negative = 'Avoid: text, labels, watermarks, logos, people, animals, cars, changed camera angle, changed aspect ratio, cropping, warped fences or buildings, new structures, lawn (unless requested), oversaturated colors, cartoon or 3D-render look, plants floating or out of scale.';
  const max = opts.maxChars || PROVIDER_LIMITS[opts.provider] || PROVIDER_LIMITS.default;
  if (max < 900 && !opts.noCompact) { const c = compactPrompt({ view, style, region: design.region, plants, hard: design.hardscape || [], layout: design.layout, opts, max }); return { ...c, negative, view, warnings }; }
  const inlineNeg = opts.provider !== 'sdxl'; // SDXL takes a separate negative_prompt
  let live = tagged.filter(t => t[1]); const join = () => { const p = live.map(t => t[1]).join(' '); return inlineNeg ? `${p} ${negative}` : p; };
  let text = join(), truncated = false;
  for (const lvl of [8, 7, 6, 5, 3]) { if (text.length <= max) break; truncated = true; live = live.filter(t => t[0] !== lvl); text = join(); }
  if (text.length > max) { truncated = true; text = text.slice(0, max - 1).replace(/\s+\S*$/, '') + '…'; }
  return { prompt: text, negative, view, warnings, truncated, length: text.length };
}

/** Image-relative layout hints: [{id,x,y}] fractions -> sentence like "Desert Willow at lower-left (x 20%, y 70%)". */
export function layoutText(layout, view) {
  if (!layout || !layout.length) return '';
  const where = (x, y) => `${y < .34 ? (view === 'top' ? 'top' : 'back') : y > .66 ? (view === 'top' ? 'bottom' : 'front') : 'middle'}-${x < .34 ? 'left' : x > .66 ? 'right' : 'center'}`;
  const items = layout.slice(0, 24).map(l => { const p = PLANTS.find(q => q.id === l.id); return p && `${p.name} at ${where(l.x, l.y)} (x ${Math.round(l.x * 100)}%, y ${Math.round(l.y * 100)}%)`; }).filter(Boolean);
  return items.length ? `Placement (positions as % of image width/height from top-left): ${items.join('; ')}${layout.length > 24 ? `; plus ${layout.length - 24} more` : ''}.` : '';
}

/** Concise instruction style for models with short text encoders (Kontext dev/pro ~512 T5 tokens, SD1.5 CLIP 77 tokens).
 * Tested 2026-10-13 on Austin's photo: Kontext dev gave a far better result with this than with the long prompt. */
export function compactPrompt({ view, style, region, plants, hard, layout, opts = {}, max = 700 }) {
  const reg = region === 'high-desert' ? 'high-desert (Reno, Nevada) ' : '';
  const hs = { pavers: 'a curving natural flagstone path', dg: 'decomposed granite paths', riverrock: 'a river rock dry creek', boulders: 'a few large granite boulders', edging: 'steel edging', mulch: 'dark bark mulch beds', gravel: 'gravel', wall: 'a low stone wall' };
  const hardTxt = hard.map(k => hs[k]).filter(Boolean); const names = plants.map(({ p }) => p.name.replace(/\s*\(.*?\)|'.*?'/g, '').trim().toLowerCase());
  const lay = (layout || []).slice(0, 6).map(l => { const p = plants.find(x => x.p.id === l.id); return p && `${p.p.name.toLowerCase()} ${l.y > .66 ? 'in front' : l.y < .34 ? 'at the back' : 'mid-yard'} ${l.x < .34 ? 'left' : l.x > .66 ? 'right' : 'center'}`; }).filter(Boolean);
  const top = view === 'top';
  const parts = [
    `Transform this ${top ? 'top-down aerial view of a' : 'bare'} backyard into a finished, professionally installed ${reg}${style.name.toLowerCase()} garden.`,
    hardTxt.length && `Add ${hardTxt.join(', ')}.`,
    names.length && `Plants: ${names.join(', ')}.`,
    lay.length && `Place ${lay.join('; ')}.`,
    'Remove hoses, toys, lumber, tools and shadows of people.',
    top ? 'Keep it seen from directly above with the same framing, scale and structures; plants as canopy circles.' : 'Keep the same camera angle, framing, aspect ratio, house, shed, fences, poles, hills and sky exactly.',
    opts.equirect && 'Keep the 360 equirectangular projection with seamless left/right edges.',
    'Photorealistic, natural late-afternoon light.',
  ].filter(Boolean);
  let t = parts.join(' '); const truncated = t.length > max; if (truncated) { const keep = [parts[0], parts.find(x => x.startsWith('Keep')), parts.find(x => x.startsWith('Plants'))].filter(Boolean); t = keep.join(' ').slice(0, max); }
  return { prompt: t, truncated, length: t.length, compact: true };
}
