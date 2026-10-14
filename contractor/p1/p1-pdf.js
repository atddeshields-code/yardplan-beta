// p1-pdf.js — change-order addendum PDF + phasing/payment pages, reusing ../proposal-pdf.js (jsPDF 2.5.2 vendored in ../vendor).
import { buildProposalPdf, pdfText } from '../proposal-pdf.js';
const money = n => (n < 0 ? '-$' : '$') + Math.abs(+n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const getJ = o => o.jsPDF || (globalThis.jspdf && globalThis.jspdf.jsPDF) || globalThis.jsPDF;

function kit(doc, brand = [46, 94, 62]) {
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40, CW = W - 2 * M; const k = { W, H, M, CW, y: M };
  const T = (s, x, y, o) => doc.text(pdfText(s), x, y, o);
  k.T = T; k.need = h => { if (k.y + h > H - 60) { doc.addPage(); k.y = M; } };
  k.h2 = s => { k.need(30); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...brand); T(s, M, k.y + 12); k.y += 22; doc.setTextColor(0); doc.setFont('helvetica', 'normal'); doc.setFontSize(10); };
  k.para = (s, size = 10) => { doc.setFontSize(size); for (const ln of doc.splitTextToSize(pdfText(s), CW)) { k.need(size + 4); T(ln, M, k.y + size); k.y += size + 3; } k.y += 4; };
  k.table = (cols, rows, totals = []) => {
    const head = () => { k.need(18); doc.setFillColor(...brand); doc.rect(M, k.y, CW, 16, 'F'); doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
      let x = M; for (const c of cols) { T(c.h, c.a === 'right' ? x + c.w - 4 : x + 4, k.y + 11, c.a === 'right' ? { align: 'right' } : undefined); x += c.w; } k.y += 16; doc.setTextColor(0); doc.setFont('helvetica', 'normal'); };
    head();
    rows.forEach((r, i) => { const cells = cols.map(c => doc.splitTextToSize(pdfText(c.k(r)), c.w - 8)); const rh = Math.max(...cells.map(c => c.length)) * 10 + 5;
      if (k.y + rh > H - 60) { doc.addPage(); k.y = M; head(); }
      if (i % 2) { doc.setFillColor(244, 246, 242); doc.rect(M, k.y, CW, rh, 'F'); }
      let x = M; cols.forEach((c, j) => { doc.text(cells[j], c.a === 'right' ? x + c.w - 4 : x + 4, k.y + 10, c.a === 'right' ? { align: 'right' } : undefined); x += c.w; }); k.y += rh; });
    for (const [l, v, b] of totals) { k.need(14); doc.setFont('helvetica', b ? 'bold' : 'normal'); doc.setFontSize(b ? 10.5 : 9); T(l, W - M - 110, k.y + 10, { align: 'right' }); T(v, W - M - 4, k.y + 10, { align: 'right' }); k.y += 14; }
    doc.setFont('helvetica', 'normal'); k.y += 8; };
  k.sign = (labels) => { k.need(70); k.y += 20; labels.forEach((l, i) => { const x = M + i * (CW / 2 + 10); doc.line(x, k.y + 30, x + CW / 2 - 10, k.y + 30); doc.setFontSize(8.5); T(l, x, k.y + 41); T('Date', x + CW / 2 - 60, k.y + 41); }); k.y += 50; };
  return k;
}
/** Draw the conceptual/811 + "Page i of n" footer on every page. Call once, after all pages exist. */
export function stampFooters(doc) {
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(120, 30, 30); doc.setFont('helvetica', 'bold'); doc.text('Conceptual design, not for construction. Call 811 before you dig.', 40, H - 24);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(120); doc.text(`Page ${i} of ${n}`, W - 40, H - 24, { align: 'right' }); doc.setTextColor(0); }
  return doc;
}
/** appendPhasingPages(doc, phasing, schedule) — doc must not have footers yet (build it with footers:false); adds "Project phases" + "Payment schedule" on a new page. */
export function appendPhasingPages(doc, phasing, schedule, { brand } = {}) {
  doc.addPage(); const k = kit(doc, brand);
  if (phasing) { k.h2('Project phases');
    k.table([{ h: '#', w: 24, k: p => p.n }, { h: 'Phase', w: 170, k: p => p.name }, { h: 'Includes', w: k.CW - 284, k: p => p.lines.map(l => l.description.replace(/ \(.*\)$/, '')).join(', ') },
      { h: 'Amount', w: 90, a: 'right', k: p => money(p.total) }], phasing.phases.map((p, i) => ({ ...p, n: i + 1 })), [['Total', money(phasing.totals.total), true]]); }
  if (schedule) { k.h2('Payment schedule');
    k.table([{ h: 'Payment', w: 170, k: s => s.name }, { h: 'Due', w: k.CW - 320, k: s => s.due }, { h: '%', w: 60, a: 'right', k: s => s.pct.toFixed(1) + '%' },
      { h: 'Amount', w: 90, a: 'right', k: s => money(s.amount) }], schedule, [['Total', money(schedule.reduce((a, s) => a + s.amount, 0)), true]]); }
  return stampFooters(doc);
}
/** buildProposalWithPhasing(proposalOpts, phasing, schedule) -> doc (P0 proposal + phases + payment pages) */
export const buildProposalWithPhasing = (opts, phasing, schedule) => appendPhasingPages(buildProposalPdf({ ...opts, footers: false }), phasing, schedule, { brand: opts.business?.color });

/**
 * buildChangeOrderPdf({ jsPDF?, business, client, project, changeOrder (createChangeOrder output), parent:{id, snapshotHash, signedAt}, signature?:{name, signedAt, png} }) -> doc
 */
export function buildChangeOrderPdf(o) {
  const J = getJ(o); if (!J) throw new Error('jsPDF not loaded'); const doc = new J({ unit: 'pt', format: 'letter' }); const k = kit(doc, o.business?.color);
  const B = o.business || {}, C = o.client || {}, co = o.changeOrder, par = o.parent || {};
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...(B.color || [46, 94, 62])); k.T(B.name || 'Contractor', k.M, k.y + 18);
  doc.setTextColor(0); doc.setFontSize(16); k.T(`Change Order #${co.version}`, k.W - k.M, k.y + 18, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  k.T(`Addendum to proposal ${par.id || ''}${par.signedAt ? ' signed ' + par.signedAt.slice(0, 10) : ''}`, k.W - k.M, k.y + 32, { align: 'right' });
  if (par.snapshotHash) k.T(`Original SHA-256: ${par.snapshotHash.slice(0, 32)}...`, k.W - k.M, k.y + 43, { align: 'right' });
  k.T(`Client: ${[C.name, C.address].filter(Boolean).join(', ')}`, k.M, k.y + 34); k.T(`Date: ${co.createdAt.slice(0, 10)}`, k.M, k.y + 45); k.y += 64;
  k.h2('Reason for change'); k.para(co.reason);
  k.h2('Changes');
  k.table([{ h: 'Change', w: 70, k: c => c.type }, { h: 'Item', w: 230, k: c => (c.after || c.before).description }, { h: 'Qty', w: 90, a: 'right', k: c => c.before && c.after ? `${c.before.qty} -> ${c.after.qty}` : (c.after || c.before).qty },
    { h: 'Price change', w: k.CW - 390, a: 'right', k: c => money(c.delta) }], co.changes);
  k.h2('Contract price');
  k.table([{ h: '', w: k.CW - 120, k: r => r[0] }, { h: 'Amount', w: 120, a: 'right', k: r => r[1] }],
    [['Previous contract total', money(co.prevTotals.total)], ['This change order (incl. overhead, markup, tax)', money(co.delta.total)], ['New contract total', money(co.totals.total)]]);
  k.para('All other terms of the original signed proposal remain unchanged. This change order is not effective until signed by both parties.', 9);
  if (o.signature && o.signature.png) { try { k.need(70); doc.addImage(o.signature.png, 'PNG', k.M, k.y, 160, 50); k.y += 52; k.para(`Signed electronically by ${o.signature.name} on ${o.signature.signedAt}`, 8); } catch (e) { } }
  k.sign(['Client signature', `${B.name || 'Contractor'} signature`]);
  return stampFooters(doc);
}
