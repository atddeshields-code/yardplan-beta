// mwelo.js — California Model Water Efficient Landscape Ordinance (23 CCR ch. 2.7) compliance HINTS for a design.
// MAWA = (ETo − Eppt) × 0.62 × [ETAF × RLA + 1.0 × SLA]; ETWU = (ETo − Eppt) × 0.62 × Σ(PF × HA / IE) + SLA term.
// ETAF max 0.55 residential / 0.45 non-residential; default IE 0.75 overhead / 0.81 drip (DWR MWELO guidance). Eppt optional (25% of annual rain).
// This is an estimate for planning, not a Landscape Documentation Package. Use CIMIS / Appendix A ETo for the official worksheet.
import { area, inRect } from './geometry.js';
export const MWELO_SOURCE = 'https://water.ca.gov/-/media/DWR-Website/Web-Pages/Programs/Water-Use-And-Efficiency/MWELO-Rulemaking/Final-MWELO-Text-and-Appendices_20250103.pdf';
export const ETAF = { residential: 0.55, nonresidential: 0.45 };
export const IE = { drip: 0.81, overhead: 0.75 };

/** mawaGallons(etoIn, rlaSqft, { etaf, slaSqft, epptIn }) */
export const mawaGallons = (eto, rla, { etaf = 0.55, sla = 0, eppt = 0 } = {}) => (eto - eppt) * 0.62 * (etaf * rla + 1.0 * sla);

/** mweloCheck(design, plan, { propertyType:'residential'|'nonresidential', projectType:'new'|'rehab', useEppt, permitRequired }) */
export function mweloCheck(design, plan, o = {}) {
  const items = design.items || []; const C = plan.location.climate; const res = (o.propertyType || 'residential') !== 'nonresidential';
  const eto = C.etoAnnual, eppt = o.useEppt ? 0.25 * C.precipAnnual : 0, etaf = res ? ETAF.residential : ETAF.nonresidential;
  const beds = items.filter(it => ['mulch', 'gravel', 'dg'].includes(it.kind)), lawns = items.filter(it => it.kind === 'lawn');
  // Hydrozone areas (HA): lawn = lawn rect; inline bed = bed; point drip = each plant's share of its bed (or canopy if outside beds).
  const bedPlants = beds.map(b => items.filter(it => it.kind === 'plant' && inRect(b, it.x, it.z)).length);
  const zones = plan.hydrozones.map(z => {
    let ha = 0;
    if (z.method === 'mp-rotator') ha = lawns.reduce((s, l) => s + area(l), 0);
    else if (z.method === 'inline-drip') ha = z.irrigatedSqft;
    else for (const p of z.plants) { const bi = beds.findIndex(b => inRect(b, p.x, p.z)); ha += bi >= 0 && bedPlants[bi] ? area(beds[bi]) / bedPlants[bi] : (p.canopySqft || Math.PI * (p.spreadFt / 2) ** 2); }
    const ie = z.method === 'mp-rotator' ? IE.overhead : IE.drip;
    return { id: z.id, name: z.name, pf: z.plantFactor, ha: Math.round(ha), ie, etaf: +(z.plantFactor / ie).toFixed(3), gallons: Math.round((eto - eppt) * 0.62 * z.plantFactor * ha / ie) };
  });
  const la = zones.reduce((s, z) => s + z.ha, 0); // landscape area (irrigated planting + turf; hardscape excluded)
  const etwu = zones.reduce((s, z) => s + z.gallons, 0), mawa = Math.round(mawaGallons(eto, la, { etaf, eppt }));
  const turf = lawns.reduce((s, l) => s + area(l), 0); const lowPfArea = zones.filter(z => z.pf <= 0.3).reduce((s, z) => s + z.ha, 0);
  const avgPf = la ? zones.reduce((s, z) => s + z.pf * z.ha, 0) / la : 0; const sitePf = la ? etwu / ((eto - eppt) * 0.62 * la) : 0;
  const narrowLawn = lawns.filter(l => Math.min(Math.abs(l.w), Math.abs(l.d)) < 10);
  const projectType = o.projectType || 'rehab'; const threshold = projectType === 'new' ? 500 : 2500;
  const hints = [];
  hints.push(la >= threshold ? `Landscape area ≈${Math.round(la)} sq ft ≥ ${threshold} sq ft (${projectType === 'new' ? 'new construction' : 'rehabilitated'}): MWELO applies if the project needs a building/landscape permit, plan check or design review${la <= 2500 ? ' — the Prescriptive Pathway (Appendix D) may be used' : ' — Performance Pathway with Water Efficient Landscape Worksheet'}.`
    : `Landscape area ≈${Math.round(la)} sq ft is below the ${threshold} sq ft ${projectType === 'new' ? 'new-construction' : 'rehabilitation'} threshold: MWELO generally does not apply (local ordinances may be stricter).`);
  if (res && turf > 0.25 * la) hints.push(`Turf ≈${Math.round(turf / la * 100)}% of landscape area — prescriptive pathway caps residential turf at 25%.`);
  if (!res && turf > 0) hints.push('Non-residential prescriptive pathway: no turf (except functional/recreational areas); AB 1572 bans potable irrigation of nonfunctional turf at CII sites from 2028.');
  if (la && lowPfArea / la < (res ? 0.75 : 1)) hints.push(`Low-water (PF ≤0.3) plantings cover ≈${Math.round(lowPfArea / la * 100)}% of the landscape; prescriptive pathway asks ${res ? '75%' : '100%'} (average PF 0.3), excluding edibles.`);
  for (const l of narrowLawn) hints.push(`Lawn strip ${Math.min(Math.abs(l.w), Math.abs(l.d))} ft wide: areas <10 ft in any direction need subsurface/drip (no overhead spray); turf is prohibited in parkways <10 ft wide.`);
  if (lawns.length) hints.push('No overhead spray within 24 in. of non-permeable surfaces (paths, driveways) — use drip or a mulch/gravel setback; slopes >25%: no turf, application rate ≤0.75 in/hr.');
  hints.push('Also required: ≥3 in. mulch on exposed soil, weather- or soil-moisture-based controller, pressure regulation, manual shut-off valve, hydrozones by plant water need, and an irrigation audit for permitted projects.');
  return { applies: la >= threshold, projectType, propertyType: res ? 'residential' : 'nonresidential', etoIn: eto, epptIn: +eppt.toFixed(2), etaf, landscapeSqft: Math.round(la), turfSqft: Math.round(turf),
    mawaGallons: mawa, etwuGallons: etwu, compliant: etwu <= mawa, siteEtaf: +sitePf.toFixed(3), avgPlantFactor: +avgPf.toFixed(2), zones, hints,
    etoNote: 'ETo here is a Hargreaves estimate from NOAA normals; the official worksheet uses Appendix A / CIMIS ETo for the city.', source: MWELO_SOURCE };
}
