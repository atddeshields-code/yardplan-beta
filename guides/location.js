// location.js — offline ZIP -> location/climate profile. All data local (see data/ and README "Data sources").
import ZCTA from './data/zcta.js';
import { ROWS, META as NORMALS_META } from './data/climate-stations.js';
import { findRules, CHECKED as RULES_CHECKED } from './data/restrictions.js';
import { ZIP_COUNTY, COUNTIES } from './data/zip-county.js';
import USDA_ZONES, { ZONE_SOURCE } from './data/usda-zones.js';
export { NORMALS_META };
// Station rows: [id, name, lat, lon, elevFt, tmax[12], tmin[12], precip[12], lastFrost50, firstFrost50, days32]
const STATIONS = ROWS.map(r => ({ id: r[0], name: r[1], lat: r[2], lon: r[3], elevFt: r[4], tmax: r[5], tmin: r[6], precip: r[7], lastFrost: r[8], firstFrost: r[9], days32: r[10] }));
export const STATION_COUNT = STATIONS.length;
/** Rough USDA zone estimate from the coldest monthly mean Tmin (extreme min ≈ that − 20°F). Normals do not include the annual extreme minimum. */
export function estimateZone(minTminF) { const t = minTminF - 20, n = Math.max(1, Math.min(13, Math.floor((t + 60) / 10) + 1)), half = ((t + 60) % 10 + 10) % 10 >= 5 ? 'b' : 'a'; return `${n}${half}`; }
function classify(tmax, precipAnnual, etoAnnual) { const ai = precipAnnual / Math.max(1, etoAnnual); const aridity = ai < 0.2 ? 'arid' : ai < 0.5 ? 'semiarid' : ai < 0.75 ? 'subhumid' : 'humid';
  const hot = Math.max(...tmax); const summer = hot >= 90 ? (ai < 0.5 ? 'hot-dry' : 'hot-humid') : hot <= 78 ? 'mild' : ai < 0.5 ? 'warm-dry' : 'warm-humid'; return { aridity, summer, aridityIndex: +ai.toFixed(2) }; }

// 3-digit ZIP prefix ranges -> state (USPS allocation; public).
const PREFIX = [[5,5,'NY'],[6,9,'PR'],[10,27,'MA'],[28,29,'RI'],[30,38,'NH'],[39,49,'ME'],[50,59,'VT'],[60,69,'CT'],[70,89,'NJ'],[90,99,'AE'],
  [100,149,'NY'],[150,196,'PA'],[197,199,'DE'],[200,205,'DC'],[206,219,'MD'],[220,246,'VA'],[247,268,'WV'],[270,289,'NC'],[290,299,'SC'],
  [300,319,'GA'],[320,349,'FL'],[350,369,'AL'],[370,385,'TN'],[386,397,'MS'],[398,399,'GA'],[400,427,'KY'],[430,459,'OH'],[460,479,'IN'],
  [480,499,'MI'],[500,528,'IA'],[530,549,'WI'],[550,567,'MN'],[569,569,'DC'],[570,577,'SD'],[580,588,'ND'],[590,599,'MT'],[600,629,'IL'],
  [630,658,'MO'],[660,679,'KS'],[680,693,'NE'],[700,714,'LA'],[716,729,'AR'],[730,749,'OK'],[750,799,'TX'],[800,816,'CO'],[820,831,'WY'],
  [832,838,'ID'],[840,847,'UT'],[850,865,'AZ'],[870,884,'NM'],[885,885,'TX'],[889,898,'NV'],[900,961,'CA'],[962,966,'AP'],[967,968,'HI'],
  [969,969,'GU'],[970,979,'OR'],[980,994,'WA'],[995,999,'AK']];
export const stateForZip = zip => { const c = COUNTIES[ZIP_COUNTY[String(zip).slice(0, 5)]]; if (c) return c[0]; const p = parseInt(String(zip).slice(0, 3), 10); const r = PREFIX.find(([a, b]) => p >= a && p <= b); return r ? r[2] : null; };

const rad = d => d * Math.PI / 180;
export function distMi(a, b) { const R = 3958.8, dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }

const MID_DOY = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349], DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** Extraterrestrial radiation Ra (MJ m-2 day-1), FAO-56 eq. 21. */
export function extraterrestrialRadiation(latDeg, doy) {
  const phi = rad(latDeg), dr = 1 + 0.033 * Math.cos(2 * Math.PI * doy / 365), dec = 0.409 * Math.sin(2 * Math.PI * doy / 365 - 1.39);
  const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(dec))));
  return 24 * 60 / Math.PI * 0.0820 * dr * (ws * Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.sin(ws));
}
const fToC = f => (f - 32) * 5 / 9;
/** Hargreaves–Samani (1985) reference ET, inches/month, from monthly mean Tmax/Tmin (°F). FAO-56 eq. 52. */
export function hargreavesEToMonthly(latDeg, tmaxF, tminF) {
  return tmaxF.map((tx, i) => { const Tx = fToC(tx), Tn = fToC(tminF[i]), Tm = (Tx + Tn) / 2, Ra = extraterrestrialRadiation(latDeg, MID_DOY[i]);
    const mmDay = Math.max(0, 0.0023 * 0.408 * Ra * (Tm + 17.8) * Math.sqrt(Math.max(0, Tx - Tn)));
    return +(mmDay * DAYS[i] / 25.4).toFixed(2); });
}

/**
 * getLocation(zip, { zipFallback? (app ZIP_FALLBACK zone table), zone? override }) -> profile | null
 * profile: { zip, lat, lon, state, station{...,distanceMi}, zone, zoneSource, climate{tmax,tmin,tmean,precip,eto,etoAnnual,precipAnnual,
 *   lastFrost,firstFrost,frostFree,freezeClimate,summer,aridity}, restrictions|null, confidence, estimates[] }
 */
export function getLocation(zip, opts = {}) {
  zip = String(zip || '').trim().slice(0, 5); const ll = ZCTA[zip]; if (!ll) return null;
  let best = null; for (const s of STATIONS) { const d = distMi(ll, [s.lat, s.lon]); if (!best || d < best.d) best = { s, d }; }
  const s = best.s, lat = ll[0];
  const eto = hargreavesEToMonthly(lat, s.tmax, s.tmin), tmean = s.tmax.map((x, i) => +((x + s.tmin[i]) / 2).toFixed(1));
  const etoAnnual = +eto.reduce((a, b) => a + b, 0).toFixed(1), precipAnnual = +s.precip.reduce((a, b) => a + b, 0).toFixed(2);
  const minTmin = Math.min(...s.tmin), cls = classify(s.tmax, precipAnnual, etoAnnual);
  const fromApp = opts.zipFallback && opts.zipFallback[zip];
  const usda = USDA_ZONES[zip];
  const zone = opts.zone || usda || fromApp || estimateZone(minTmin);
  const zoneSource = opts.zone ? 'user/app lookup' : usda ? 'USDA 2023 Plant Hardiness Zone Map by ZIP (PRISM/OSU)' : fromApp ? 'Yardplan app ZIP_FALLBACK table' : 'ESTIMATE from NOAA coldest-month mean min (−20°F); use the app phzmapi.org lookup';
  const rules = findRules(zip, ll[0], ll[1], distMi);
  const frostFree = !s.lastFrost; // no 50% 32°F date: freezes occur in fewer than half of years (or never)
  return {
    zip, lat, lon: ll[1], state: stateForZip(zip),
    station: { id: s.id, name: s.name, lat: s.lat, lon: s.lon, elevFt: s.elevFt, distanceMi: Math.round(best.d * 10) / 10, source: 'NOAA NCEI 1991–2020 Normals' },
    zone, zoneSource,
    climate: { tmax: s.tmax, tmin: s.tmin, tmean, precip: s.precip, eto, etoAnnual, precipAnnual, lastFrost: s.lastFrost, firstFrost: s.firstFrost,
      daysBelow32: s.days32, frostFree, freezeClimate: !frostFree && minTmin <= 32, ...cls },
    county: rules.county,
    restrictions: rules.primary ? { metro: rules.primary.id.startsWith('default-') ? null : rules.primary.id, ...rules.primary, isDefault: rules.primary.id.startsWith('default-'), layers: rules.layers } : null,
    confidence: best.d <= 15 ? 'station-local' : best.d <= 40 ? 'regional' : 'low (nearest NOAA normals station is far; verify locally)',
    estimates: ['ETo is a Hargreaves–Samani estimate from NOAA 1991–2020 monthly Tmax/Tmin normals and the ZIP latitude, not measured ETo.',
      'Climate comes from the nearest NOAA normals station; elevation differences (mountain/valley) can shift temperatures and frost dates.',
      ...(zoneSource.startsWith('ESTIMATE') ? ['USDA zone estimated (normals lack the annual extreme minimum).'] : [])],
    sources: { normals: NORMALS_META.urls, zcta: 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_Gaz_zcta_national.zip', restrictionsChecked: RULES_CHECKED },
  };
}
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
