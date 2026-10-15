// siteplan/sources.js — free/open data for the auto site plan (browser).
//  Aerial: USDA NAIP via USGS The National Map ImageServer (public domain), RGB + near-infrared band.
//  Buildings: OpenStreetMap via Overpass API (© OpenStreetMap contributors, ODbL 1.0 — attribution shown on the plan).
//  Parcels: Sacramento County Parcels FeatureServer (public open data, ArcGIS Online). Other counties: none yet → estimated lot.
import { projector, rectilinear, area, inPoly, centroid, dist, estimateLot } from './core.js';
const NAIP = 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const STRUCT = 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/USA_Structures_View/FeatureServer/0/query';
export const ATTR = { structures: 'Buildings: FEMA/ORNL USA Structures (public domain)', naip: 'Aerial: USDA NAIP (public domain) via USGS The National Map', osm: 'Buildings © OpenStreetMap contributors (ODbL)', sac: 'Parcels: Sacramento County open data (approximate, not a survey)' };
export const PARCELS = [ // free ArcGIS REST parcel layers (WGS84 query); bbox = [w, s, e, n]
  { id: 'sac', name: 'Sacramento County, CA', bbox: [-121.87, 38.01, -121.02, 38.74], url: 'https://services1.arcgis.com/5NARefyPVtAeuJPU/arcgis/rest/services/Parcels/FeatureServer/0/query',
    addr: (num, street) => `STREET_NBR='${num}' AND STREET_NAM LIKE '${street}%'`, attr: ATTR.sac }
];
const tmo = (ms) => { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; };
async function getJSON(url, opts = {}, ms = 30000) { const r = await fetch(url, { ...opts, signal: tmo(ms) }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }
/** parcel polygon (lon/lat ring) for an address/point, or null when no free county layer covers it */
export async function fetchParcel(lat, lon, address = '') {
  const P = PARCELS.find(p => lon >= p.bbox[0] && lon <= p.bbox[2] && lat >= p.bbox[1] && lat <= p.bbox[3]); if (!P) return null;
  const base = `${P.url}?outFields=*&returnGeometry=true&outSR=4326&f=json`, m = /^\s*(\d+)\s+([^,]+)/.exec(address);
  try { if (m) { const street = m[2].toUpperCase().replace(/'/g, '').replace(/\b(STREET|AVENUE|BOULEVARD|DRIVE|ROAD|COURT|LANE|WAY)\b.*$/, x => ({ STREET: 'ST', AVENUE: 'AVE', BOULEVARD: 'BLVD', DRIVE: 'DR', ROAD: 'RD', COURT: 'CT', LANE: 'LN', WAY: 'WAY' })[x.split(' ')[0]]).trim();
      const j = await getJSON(base + '&where=' + encodeURIComponent(P.addr(m[1], street)) + '&resultRecordCount=5');
      const f = (j.features || []).sort((a, b) => near(a, lat, lon) - near(b, lat, lon))[0]; if (f) return { ring: f.geometry.rings[0], attrs: f.attributes, source: P.attr, layer: P.name }; }
    const j = await getJSON(base + `&geometry=${lon},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&distance=12&units=esriSRUnit_Meter`);
    const f = j.features?.[0]; return f ? { ring: f.geometry.rings[0], attrs: f.attributes, source: P.attr, layer: P.name } : null;
  } catch (e) { console.warn('parcel', e); return null; }
}
const near = (f, lat, lon) => { const r = f.geometry?.rings?.[0] || [[0, 0]]; const c = r.reduce((s, p) => [s[0] + p[0] / r.length, s[1] + p[1] / r.length], [0, 0]); return Math.hypot(c[0] - lon, c[1] - lat); };
/** FEMA / ORNL USA Structures footprints (public domain, nationwide) within ~r metres */
export async function fetchStructures(lat, lon, r = 70) { const dy = r / 111320, dx = dy / Math.cos(lat * Math.PI / 180);
  const j = await getJSON(`${STRUCT}?geometry=${lon - dx},${lat - dy},${lon + dx},${lat + dy}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=OCC_CLS,SQFEET,SOURCE,IMAGE_DATE&returnGeometry=true&outSR=4326&f=json`, {}, 20000);
  return (j.features || []).filter(f => f.geometry?.rings?.[0]?.length > 3).map(f => ({ id: 's' + f.attributes.OBJECTID, tags: f.attributes, ring: f.geometry.rings[0].slice(0, -1), src: 'structures' })); }
/** OSM building rings (lon/lat) within r metres; tries mirrors */
export async function fetchBuildings(lat, lon, r = 70) {
  const q = `[out:json][timeout:20];way[building](around:${r},${lat},${lon});out geom;`; let last;
  for (const u of OVERPASS) { try { const j = await getJSON(u, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 25000);
    return (j.elements || []).filter(e => e.geometry?.length > 3).map(e => ({ id: e.id, tags: e.tags || {}, ring: e.geometry.map(g => [g.lon, g.lat]).slice(0, -1) })); } catch (e) { last = e; } }
  throw last || new Error('buildings unavailable');
}
/** NAIP RGB + NIR around (lat, lon): square of sizeFt; returns pixels + a dataURL for display */
export async function fetchAerial(lat, lon, sizeFt = 200, px = 768) {
  const R = 6378137, x = lon * Math.PI / 180 * R, y = Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * R, half = sizeFt * 0.3048 / 2 / Math.cos(lat * Math.PI / 180);
  const u = b => `${NAIP}?bbox=${x - half},${y - half},${x + half},${y + half}&bboxSR=3857&imageSR=3857&size=${px},${px}&format=jpg${b ? '&bandIds=' + b : ''}&f=image`;
  const one = async b => { let last; for (let k = 0; k < 3; k++) { try { const r = await fetch(u(b), { signal: tmo(90000) }); if (r.ok && /image/.test(r.headers.get('content-type') || 'image')) return await r.blob(); last = new Error('HTTP ' + r.status); } catch (e) { last = e; } } throw last; };
  const [rgbB, nirB] = await Promise.all([one(''), one('3').catch(() => null)]);
  const px2 = async blob => { const bmp = await createImageBitmap(blob), c = new OffscreenCanvas(px, px), g = c.getContext('2d'); g.drawImage(bmp, 0, 0, px, px); return g.getImageData(0, 0, px, px).data; };
  const rgb = await px2(rgbB), nir = nirB ? await px2(nirB) : null;
  const url = await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(rgbB); });
  const ftPerPx = sizeFt / px; return { rgb, nir, W: px, H: px, ftPerPx, sizeFt, url, toFt: (pxX, pxY) => [(pxX - px / 2) * ftPerPx, (pxY - px / 2) * ftPerPx] };
}
/** everything for one address. onStep(key, state) drives the progress UI. */
export async function gather({ lat, lon, address, onStep = () => {} }) {
  const out = { lat, lon, warnings: [] };
  onStep('lot', 'run'); onStep('house', 'run');
  const [parcel, st] = await Promise.all([fetchParcel(lat, lon, address).catch(() => null), fetchStructures(lat, lon).catch(() => [])]);
  let blds = st; out.buildingSource = st.length ? 'structures' : '';
  if (!blds.length) { blds = await fetchBuildings(lat, lon).catch(() => { out.warnings.push('Building outlines are unavailable right now.'); return []; }); if (blds.length) out.buildingSource = 'osm'; }
  onStep('lot', parcel ? 'ok' : 'warn');
  // centre on the parcel when we have one (the geocoder point sits on the street)
  const c0 = parcel ? parcel.ring.reduce((s, p) => [s[0] + p[0] / parcel.ring.length, s[1] + p[1] / parcel.ring.length], [0, 0]) : [lon, lat];
  const toFt = projector(c0[1], c0[0]); out.center = { lat: c0[1], lon: c0[0] };
  const lot = parcel ? parcel.ring.map(toFt).slice(0, parcel.ring.length > 3 && dist(toFt(parcel.ring[0]), toFt(parcel.ring[parcel.ring.length - 1])) < .1 ? -1 : undefined) : null;
  const all = blds.map(b => ({ ...b, pts: b.ring.map(toFt) })).filter(b => area(b.pts) > 80); let houses = all, lotEst = null;
  if (lot) houses = all.filter(b => inPoly(centroid(b.pts), lot));
  else { const s = toFt([lon, lat]), res = b => !b.tags?.OCC_CLS || b.tags.OCC_CLS === 'Residential';
    houses = all.slice().sort((a, b) => (res(b) - res(a)) || (dist(centroid(a.pts), s) - dist(centroid(b.pts), s))).slice(0, 1);
    if (houses[0]) { lotEst = estimateLot(houses[0].pts, all.filter(b => b !== houses[0]).map(b => b.pts), s); houses = houses.concat(all.filter(b => b !== houses[0] && inPoly(centroid(b.pts), lotEst) && area(b.pts) < 900)); } }
  out.allBuildings = all.map(b => b.pts);
  houses.sort((a, b) => area(b.pts) - area(a.pts));
  out.housesRaw = houses.map(h => h.pts); out.houses = houses.map(h => rectilinear(h.pts, 1.2)); onStep('house', houses.length ? 'ok' : 'warn');
  out.lot = lot || lotEst; out.lotEstimated = !lot; out.parcel = parcel; out.street = toFt([lon, lat]);
  // aerial sized to the lot (or a typical 200 ft square)
  let size = 200; if (out.lot) { const xs = out.lot.map(p => Math.abs(p[0])), zs = out.lot.map(p => Math.abs(p[1])); size = Math.min(400, Math.max(140, Math.ceil(2 * Math.max(...xs, ...zs) + 40))); }
  onStep('aerial', 'run'); out.aerial = await fetchAerial(out.center.lat, out.center.lon, size); onStep('aerial', out.aerial.nir ? 'ok' : 'warn');
  return out;
}
