// guide-pdf.js — printable PDF of irrigation + maintenance guides using vendored jsPDF 2.5.2
// (../yardplan-contractor/vendor/jspdf.umd.min.js). Browser: window.jspdf; Node: pass { jsPDF }.
import { MONTHS } from './location.js';
/** buildGuidePdf({ jsPDF?, irrigation, maintenance, title?, planImage?: dataURL }) -> jsPDF doc */
export function buildGuidePdf(o) {
  const J = o.jsPDF || (globalThis.jspdf && globalThis.jspdf.jsPDF); if (!J) throw new Error('jsPDF not loaded');
  const doc = new J({ unit: 'pt', format: 'letter' }); const W = 612, M = 40; let y = M;
  const ascii = s => String(s ?? '').replace(/[–—]/g, '-').replace(/[≈]/g, '~').replace(/[×]/g, 'x').replace(/[≤]/g, '<=').replace(/[≥]/g, '>=').replace(/[°]/g, ' deg').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7E]/g, '');
  const need = h => { if (y + h > 792 - M) { doc.addPage(); y = M; } };
  const text = (s, size = 10, bold = false, indent = 0) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size);
    for (const line of doc.splitTextToSize(ascii(s), W - 2 * M - indent)) { need(size + 4); doc.text(line, M + indent, y); y += size + 3; } };
  const I = o.irrigation, G = o.maintenance, L = (I || G).location;
  text(o.title || 'Yardplan irrigation & maintenance guide', 18, true); y += 4;
  text(`ZIP ${L.zip} (${L.state}) - USDA zone ${L.zone} - climate station ${L.station.name} (${L.station.distanceMi} mi) - annual ETo ~${L.climate.etoAnnual} in (est.), rain ${L.climate.precipAnnual} in - frost ${L.climate.lastFrost ? 'last ~' + L.climate.lastFrost + ', first ~' + L.climate.firstFrost : 'rare/none'}`, 9);
  y += 6;
  if (o.planImage) { need(250); try { doc.addImage(o.planImage, 'PNG', M, y, 330, 240); } catch (e) { } y += 250; }
  if (I) {
    text('Irrigation plan', 14, true);
    text(`${I.valveCount} valves (${I.dripValves} drip, ${I.lawnValves} lawn); supply ${I.supply.flowGpm} GPM @ ${I.supply.pressurePsi} psi${I.supply.assumed.flow ? ' (assumed)' : ''}; design budget ${I.supply.designBudgetGpm} GPM; max valve ${I.maxValveGpm} GPM - ${I.withinFlowBudget ? 'within budget' : 'OVER budget'}.`);
    text(`Annual water use ~${I.waterUse.annualGallons.toLocaleString('en-US')} gal vs all-lawn baseline ~${I.waterUse.baselineAnnualGallons.toLocaleString('en-US')} gal (${I.waterUse.savingsPct}% less).`);
    for (const z of I.hydrozones) { y += 3; text(`${z.id} ${z.name}`, 11, true);
      text(`PF ${z.plantFactor}, eff ${z.efficiency}; ${z.plantCount} plants, ${z.emitterCount || z.headCount} ${z.headCount ? 'MP heads' : 'emitters'}, ${z.totalGph ? z.totalGph + ' GPH / ' : ''}${z.gpm} GPM, ${z.valves} valve(s); annual ~${z.annualGallons} gal`, 9, false, 10);
      const pk = z.monthly.reduce((a, b) => b.gallons > a.gallons ? b : a); text(`Peak (${pk.month}): ${pk.minutesPerEvent} min x ${pk.eventsPerWeek}/wk${pk.cycleSoak ? ' - ' + pk.cycleSoak : ''}. Establishment: ${z.establishment.map(e => `wk ${e.weeks}: ${e.frequency}${typeof e.minutesPerEvent === 'number' ? ' ' + e.minutesPerEvent + ' min' : ''}`).join('; ')}`, 9, false, 10); }
    y += 4; text('Equipment', 11, true); text(`Controller: ${I.equipment.controller.recommendation}. Sensors: ${I.equipment.controller.sensors.join('; ')}.`, 9); text(`Backflow: ${I.equipment.backflow.recommendation}`, 9);
    text(`Pressure: drip ${I.equipment.pressureRegulation.drip}; sprays ${I.equipment.pressureRegulation.sprays}. Filter: ${I.equipment.filter}`, 9);
    y += 4; text(`Parts (example costs, total ~$${I.partsTotal})`, 11, true); for (const p of I.parts) text(`${p.qty} ${p.unit}  ${p.name}  @ $${p.unitCost} = $${p.extended}`, 8, false, 10);
    for (const w of [...I.warnings, ...I.notes]) text('* ' + w, 8);
    const R = L.restrictions; if (R) { y += 4; text('Local watering rules', 11, true); for (const r of [R, ...(R.layers || [])]) { text(`${r.utility} (${r.verified ? 'checked ' + r.checked : 'unverified'})`, 9, true); for (const n of r.notes) text('- ' + n, 8, false, 8); text('Source: ' + r.sources[0], 7, false, 8); } }
    if (I.mwelo) { const M = I.mwelo; y += 4; text('California MWELO check (estimate)', 11, true); text(`Landscape area ~${M.landscapeSqft} sq ft; MAWA ~${M.mawaGallons} gal/yr; ETWU ~${M.etwuGallons} gal/yr - ${M.compliant ? 'within MAWA' : 'exceeds MAWA'}.`, 9); for (const x of M.hints) text('- ' + x, 8, false, 8); }
  }
  if (G) { doc.addPage(); y = M; text('Maintenance calendar', 14, true);
    text(`Maintenance level: ${G.score.level.toUpperCase()} (${G.score.points} pts) - ~${G.annual.hours} h/yr DIY, materials ~$${G.annual.diyCost}/yr, pro ~$${G.annual.proCost}/yr (example rate $${G.proRate}/h).`);
    const byId = new Map(G.tasks.map(t => [t.id, t]));
    for (const m of G.months) { if (!m.tasks.length) continue; y += 3; text(MONTHS[m.month - 1], 11, true); for (const id of m.tasks) { const t = byId.get(id); text(`- ${t.title} (${t.minutes} min)`, 9, false, 8); } }
  }
  y += 8; text((I || G).disclaimer, 8); if (I && G) text(G.disclaimer, 8);
  return doc;
}
