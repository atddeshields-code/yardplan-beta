// labor-rates.js — suggest a burdened hourlyRate from ZIP using offline BLS OEWS May 2025 wages (data/labor-wages.js).
// ZIP -> CBSA is DERIVED from Census 2020 ZCTA-county + 2023 CBSA delineation (HUD's crosswalk needs a token); see data _meta.
import WAGES from './data/labor-wages.js';
export const LABOR_DATA_META = WAGES._meta;
export const OCCUPATIONS = WAGES._meta.occupations;
/** Default crew: 3 landscaping workers per first-line supervisor (assumption). */
export const DEFAULT_CREW_MIX = [{ occ: '37-3011', share: 0.75 }, { occ: '37-1012', share: 0.25 }];

/** lookupArea(zip, data?) -> { level:'metro'|'state'|'national', cbsa?, state?, name, wages, estimatedMapping } */
export function lookupArea(zip, data = WAGES) {
  const z = String(zip || '').trim().slice(0, 5);
  const cb = data.zipToCbsa[z];
  if (cb && data.metros[cb]) return { level: 'metro', cbsa: cb, name: data.metros[cb].name, state: data.zip3ToState[z.slice(0, 3)] || null, wages: data.metros[cb].wages, estimatedMapping: true };
  const st = /^\d{5}$/.test(z) ? data.zip3ToState[z.slice(0, 3)] : null;
  if (st && data.states[st]) return { level: 'state', state: st, name: st + ' (statewide)', wages: data.states[st], estimatedMapping: true };
  return { level: 'national', name: 'United States', wages: data.national, estimatedMapping: false };
}
/** burdenedRate(wage, burdenPct=30, billableRatio=0.85) = wage × (1+burden) ÷ billable ratio  (cost per BILLABLE hour) */
export const burdenedRate = (wage, burdenPct = 30, billableRatio = 0.85) => Math.round(wage * (1 + burdenPct / 100) / billableRatio * 100) / 100;

/**
 * suggestLaborRate(zip, { crewMix=DEFAULT_CREW_MIX, stat='median'|'mean'|'p25'|'p75'|'p90', burdenPct=30, billableRatio=0.85, data? })
 * -> { hourlyRate, wage, burdenPct, billableRatio, stat, area:{level,name,cbsa,state}, components:[{occ,title,share,wage,level}], source, notes[] }
 * If an occupation is suppressed in the metro, that component falls back to the state, then national wage (noted).
 */
export function suggestLaborRate(zip, { crewMix = DEFAULT_CREW_MIX, stat = 'median', burdenPct = 30, billableRatio = 0.85, data = WAGES } = {}) {
  const area = lookupArea(zip, data), notes = [];
  if (area.estimatedMapping) notes.push('ZIP→metro mapping estimated from Census ZCTA/county data (not HUD USPS crosswalk).');
  if (area.level !== 'metro') notes.push(`ZIP not in a covered metro; using ${area.level} wages.`);
  const tot = crewMix.reduce((a, c) => a + c.share, 0) || 1;
  const components = crewMix.map(c => {
    const pick = (w, level) => w && w[c.occ] && w[c.occ][stat] != null ? { wage: w[c.occ][stat], level } : null;
    const r = pick(area.wages, area.level) || (area.state && pick(data.states[area.state], 'state')) || pick(data.national, 'national');
    if (!r) throw new Error('no_wage_data:' + c.occ);
    if (r.level !== area.level) notes.push(`${c.occ} not published for ${area.name}; used ${r.level} wage.`);
    return { occ: c.occ, title: OCCUPATIONS[c.occ] || c.occ, share: c.share / tot, wage: r.wage, level: r.level };
  });
  const wage = Math.round(components.reduce((a, c) => a + c.wage * c.share, 0) * 100) / 100;
  return { hourlyRate: burdenedRate(wage, burdenPct, billableRatio), wage, burdenPct, billableRatio, stat,
    area: { level: area.level, name: area.name, cbsa: area.cbsa || null, state: area.state || null }, components,
    source: 'BLS OEWS May 2025 hourly ' + stat + ' wage', notes: [...new Set(notes)],
    caveat: 'hourlyRate is burdened COST per billable hour (wage × (1+burden) ÷ billable ratio), not a sell rate. Burden 25–40% typical; verify your workers-comp class rate.' };
}

/**
 * Optional live hook (never called in tests): BLS Public Data API. v1 needs no key (low daily limit); pass registrationKey for v2.
 * blsOewsSeriesId({areaType:'M'|'S'|'N', area:'0039900', occ:'37-3011', datatype:'08'}) — 08 = hourly median, 03 = hourly mean (verified 2026-10-13).
 * State area = 2-digit FIPS + '00000' (e.g. NV '3200000'); national = '0000000'; metro = '00' + 5-digit CBSA.
 */
export const blsOewsSeriesId = ({ areaType = 'M', area, occ = '37-3011', datatype = '08' }) =>
  `OEU${areaType}${String(area).padStart(7, '0')}000000${occ.replace('-', '')}${datatype}`;
export async function fetchBlsOewsWage({ cbsa, occ = '37-3011', datatype = '08', registrationKey, fetchImpl = globalThis.fetch } = {}) {
  const id = blsOewsSeriesId({ areaType: 'M', area: '00' + cbsa, occ, datatype });
  const v = registrationKey ? 'v2' : 'v1', url = `https://api.bls.gov/publicAPI/${v}/timeseries/data/`;
  const r = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seriesid: [id], ...(registrationKey ? { registrationkey: registrationKey } : {}) }) });
  const j = await r.json(); const d = j?.Results?.series?.[0]?.data?.[0];
  return d ? { seriesId: id, year: d.year, value: +d.value, latest: d.latest === 'true', status: j.status } : { seriesId: id, value: null, status: j.status, message: j.message };
}
