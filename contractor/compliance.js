// compliance.js — "Pro required" flags from design data. Not legal advice; local codes vary.
export const STANDARD_NOTICES = [
  { code: 'conceptual', level: 'info', message: 'Conceptual design, not for construction.' },
  { code: 'call811', level: 'info', message: 'Call 811 before you dig (call811.com), at least 2–3 business days before excavation.' },
];
/**
 * checkCompliance(design, { wallLimitFt=4, wallWarnFt=3.5, gradingLimitCuYd=50, takeoff? }) -> [{code, level:'error'|'warn'|'info', message, itemIndex?}]
 * Walls: item.kind==='wall', w=length ft, h=exposed height ft, footing=ft below grade, surcharge=true|'driveway'|'slope'|...
 * Grading: item.kind==='grade' {cutCuYd, fillCuYd} and/or design.grading {cutCuYd, fillCuYd}.
 */
export function checkCompliance(design, o = {}) {
  const lim = o.wallLimitFt ?? 4, warnAt = o.wallWarnFt ?? 3.5, gLim = o.gradingLimitCuYd ?? 50;
  const out = [];
  let cy = 0;
  ((design && design.items) || []).forEach((it, i) => {
    if (it.kind === 'wall') {
      const total = (+it.h || 0) + (+it.footing || 0);
      if (it.surcharge) out.push({ code: 'wall-surcharge', level: 'error', itemIndex: i,
        message: `Retaining wall #${i} supports a surcharge (${it.surcharge === true ? 'load' : it.surcharge}). Engineer design and building permit typically required.` });
      if (total > lim) out.push({ code: 'wall-height', level: 'error', itemIndex: i,
        message: `Retaining wall #${i} is ${total.toFixed(1)} ft from bottom of footing to top (> ${lim} ft). Engineer design and building permit typically required.` });
      else if (total > warnAt) out.push({ code: 'wall-height-near', level: 'warn', itemIndex: i,
        message: `Retaining wall #${i} is ${total.toFixed(1)} ft from footing — close to the ${lim} ft permit threshold. Verify final height with local building dept.` });
    }
    if (it.kind === 'grade') cy += (+it.cutCuYd || 0) + (+it.fillCuYd || 0);
  });
  if (design && design.grading) cy += (+design.grading.cutCuYd || 0) + (+design.grading.fillCuYd || 0);
  if (cy > gLim) out.push({ code: 'grading-volume', level: 'warn',
    message: `Grading of about ${cy.toFixed(0)} cu yd (cut + fill) exceeds ~${gLim} cu yd; a grading permit and engineered plan may be required.` });
  return out.concat(STANDARD_NOTICES.map(n => ({ ...n })));
}
