// proposal-pdf.js — branded client proposal PDF with vendored jsPDF 2.5.2 (vendor/jspdf.umd.min.js).
// Browser: <script src="vendor/jspdf.umd.min.js"></script> sets window.jspdf. Node: pass { jsPDF } explicitly.
import { roundLines } from './budget-fit.js';
import { STANDARD_NOTICES } from './compliance.js';
import { parseBudget } from './parse-budget.js';
import { caDepositPct } from './p1/phasing.js';
import { depositDefault, NEUTRAL_PCT } from './data/state-deposit.js';
import { zip3ToState } from '../marketplace/data/zip3-state.js';

const money = n => '$' + Math.round(+n || 0).toLocaleString('en-US');   // whole dollars everywhere client-facing
// Standard PDF fonts are WinAnsi-only: map common Unicode to safe text.
export const pdfText = s => String(s ?? '').replace(/[–—]/g, '-').replace(/[“”″]/g, '"').replace(/[‘’′]/g, "'").replace(/×/g, 'x')
  .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/…/g, '...').replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, '');
const imgFmt = d => (/^data:image\/(png|jpe?g|webp)/i.exec(d || '') || [, 'PNG'])[1].toUpperCase().replace('JPG', 'JPEG');

/**
 * buildProposalPdf(opts) -> jsPDF doc   (call doc.save(name) in browser, doc.output('arraybuffer') in Node)
 * opts: { jsPDF?, business:{name,phone,email,address,license,logo(dataURL)}, client:{name,address,phone,email},
 *   project:{title,date,zip,zone}, images:{before,after (AI render),plan (2D site plan),renders:[dataURL|{src,caption}]}, takeoff, bid, tier?:id,
 *   warnings (from checkCompliance), terms:[string]|string, validDays=30, footers=true (false: skip page footers; caller must draw them) }
 */
const budgetNum = v => parseBudget(v).value; // overnight C2: reuse parseBudget (ranges / k / m) — never concatenate digits
export function buildProposalPdf(o = {}) {
  const J = o.jsPDF || (globalThis.jspdf && globalThis.jspdf.jsPDF) || globalThis.jsPDF;
  if (!J) throw new Error('jsPDF not loaded: include vendor/jspdf.umd.min.js or pass { jsPDF }');
  const doc = new J({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40, CW = W - 2 * M;
  const B = o.business || {}, C = o.client || {}, P = o.project || {}, I = o.images || {};
  const brand = B.color || [46, 94, 62];
  let y = M;
  const T = (s, x, yy, op) => doc.text(pdfText(s), x, yy, op);
  const need = h => { if (y + h > H - 60) { doc.addPage(); y = M; } };
  const h2 = s => { need(30); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...brand); T(s, M, y + 12); y += 22; doc.setTextColor(0); doc.setFont('helvetica', 'normal'); doc.setFontSize(10); };
  const para = (s, size = 10) => { doc.setFontSize(size); for (const ln of doc.splitTextToSize(pdfText(s), CW)) { need(size + 4); T(ln, M, y + size); y += size + 3; } y += 4; };
  const img = (src, x, yy, w, h, label) => {
    doc.setDrawColor(180); doc.rect(x, yy, w, h);
    if (src) { try { doc.addImage(src, imgFmt(src), x + 1, yy + 1, w - 2, h - 2); } catch (e) { doc.setFontSize(8); T('[image error]', x + 4, yy + 12); } }
    else { doc.setFontSize(9); doc.setTextColor(150); T(`[${label} image]`, x + w / 2, yy + h / 2, { align: 'center' }); doc.setTextColor(0); }
    doc.setFontSize(8); T(label, x, yy + h + 10);
  };
  // table: cols [{h, w, a:'left'|'right', k(row)}]
  const table = (cols, rows, totalRows = []) => {
    const head = () => { need(18); doc.setFillColor(...brand); doc.rect(M, y, CW, 16, 'F'); doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
      let x = M; for (const c of cols) { T(c.h, c.a === 'right' ? x + c.w - 4 : x + 4, y + 11, c.a === 'right' ? { align: 'right' } : undefined); x += c.w; } y += 16; doc.setTextColor(0); doc.setFont('helvetica', 'normal'); };
    head();
    rows.forEach((r, i) => {
      const cells = cols.map(c => doc.splitTextToSize(pdfText(c.k(r)), c.w - 8));
      const rh = Math.max(...cells.map(c => c.length)) * 10 + 5;
      if (y + rh > H - 60) { doc.addPage(); y = M; head(); }
      if (i % 2) { doc.setFillColor(244, 246, 242); doc.rect(M, y, CW, rh, 'F'); }
      let x = M; cols.forEach((c, j) => { doc.text(cells[j], c.a === 'right' ? x + c.w - 4 : x + 4, y + 10, c.a === 'right' ? { align: 'right' } : undefined); x += c.w; });
      y += rh;
    });
    for (const [label, val, bold] of totalRows) { need(14); doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 10.5 : 9);
      T(label, W - M - 110, y + 10, { align: 'right' }); T(val, W - M - 4, y + 10, { align: 'right' }); y += 14; }
    doc.setFont('helvetica', 'normal'); y += 8;
  };

  // ---- header ----
  let hx = M;
  if (B.logo) { try { doc.addImage(B.logo, imgFmt(B.logo), M, y, 60, 60); hx = M + 72; } catch (e) { } }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...brand); T(B.name || 'Your Landscaping Co.', hx, y + 20);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(80);
  [B.address, [B.phone, B.email].filter(Boolean).join(' | '), B.license && 'License: ' + B.license].filter(Boolean).forEach((s, i) => T(s, hx, y + 34 + i * 11));
  doc.setTextColor(0); doc.setFontSize(20); doc.setFont('helvetica', 'bold'); T('Landscape Proposal', W - M, y + 20, { align: 'right' });
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  T(`Date: ${P.date || new Date().toLocaleDateString('en-US')}`, W - M, y + 34, { align: 'right' });
  T(`Valid for ${o.validDays ?? 30} days`, W - M, y + 45, { align: 'right' });
  y += 72; doc.setDrawColor(...brand); doc.setLineWidth(1.5); doc.line(M, y, W - M, y); doc.setLineWidth(.5); y += 14;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); T('Prepared for', M, y + 10); T('Project', M + CW / 2, y + 10); doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  [C.name, C.address, C.phone, C.email].filter(Boolean).forEach((s, i) => T(s, M, y + 23 + i * 11));
  [P.title || 'Landscape installation', P.zip && 'ZIP ' + P.zip, P.zone && 'USDA zone ' + P.zone, budgetNum(P.budget) && 'Client budget $' + budgetNum(P.budget).toLocaleString('en-US')].filter(Boolean).forEach((s, i) => T(s, M + CW / 2, y + 23 + i * 11));
  y += 72;
  // ---- images ----
  const iw = (CW - 12) / 2, ih = iw * 0.62;
  if (I.before || I.after) { h2(I.after ? 'Before & after' : 'Your yard today'); need(ih + 16);
    img(I.before, M, y, iw, ih, 'Before'); img(I.after, M + iw + 12, y, iw, ih, I.after ? 'After (AI concept render, not to scale)' : 'After: AI concept render not made yet'); y += ih + 20; }
  if (I.plan) { // top-down 2D site plan, full width, aspect preserved
    let pw = CW, ph = CW * 0.72; try { const pr = doc.getImageProperties(I.plan); ph = Math.min(CW * pr.height / pr.width, H - M - 90); pw = ph * pr.width / pr.height; } catch (e) { }
    need(ph + 16 + 22); h2('Site plan (top view, to scale)'); img(I.plan, M + (CW - pw) / 2, y, pw, ph, I.planCaption || 'Plant circles show typical mature spread. Dimensions in feet.'); y += ph + 20; }
  const renders = (I.renders || []).map(r => typeof r === 'string' ? { src: r } : r);
  if (renders.length || o.renderSlots) {
    h2('Design views');
    const slots = renders.length ? renders : Array.from({ length: o.renderSlots || 2 }, () => ({}));
    for (let i = 0; i < slots.length; i += 2) { need(ih + 16);
      img(slots[i].src, M, y, iw, ih, slots[i].caption || `View ${i + 1}`);
      if (slots[i + 1]) img(slots[i + 1].src, M + iw + 12, y, iw, ih, slots[i + 1].caption || `View ${i + 2}`); y += ih + 20; }
  }
  // ---- plant schedule ----
  const plants = (o.takeoff && o.takeoff.plants) || [];
  if (plants.length) { h2('Plant schedule');
    table([{ h: 'Qty', w: 36, a: 'right', k: p => p.count }, { h: 'Common name', w: 130, k: p => p.name }, { h: 'Botanical name', w: 130, k: p => p.sci },
      { h: 'Size', w: 60, k: p => p.container }, { h: 'Type', w: 66, k: p => p.type }, { h: 'Mature size', w: CW - 422, k: p => p.size }], plants); }
  // ---- bid ----
  const bid = o.bid;
  if (bid) {
    const tierSel = o.tier && bid.tiers && bid.tiers.find(t => t.id === o.tier);
    const lines = tierSel ? tierSel.lines : bid.lines, tot = tierSel ? tierSel.totals : bid.totals;
    h2('Scope & price' + (tierSel ? ` - ${tierSel.name} option` : ''));
    // client-facing: distribute overhead+markup into line prices proportionally
    // whole dollars that add up: lines sum to the subtotal, subtotal + tax = total
    const k = tot.direct ? tot.subtotal / tot.direct : 1, taxR = Math.round(tot.tax || 0), subR = Math.round(tot.total) - taxR, amt = roundLines(lines.map(l => l.total * k), subR);
    table([{ h: 'Item', w: 250, k: l => l.description }, { h: 'Qty', w: 50, a: 'right', k: l => l.qty }, { h: 'Unit', w: 112, k: l => l.unit },
      { h: 'Amount', w: CW - 412, a: 'right', k: l => money(amt[lines.indexOf(l)]) }], lines,
      [['Subtotal', money(subR)], ...(tot.tax ? [['Tax', money(taxR)]] : []), ['Total', money(tot.total), true]]);
    if (bid.tiers && bid.tiers.length > 1) { h2('Options');
      table([{ h: 'Option', w: 200, k: t => t.name }, { h: 'Total', w: CW - 200, a: 'right', k: t => money(t.totals.total) }], bid.tiers); }
  }
  // ---- compliance & terms ----
  const warns = (o.warnings || []).filter(w => w.level !== 'info');
  h2('Important notices');
  for (const w of warns) para('PRO REQUIRED: ' + w.message);
  for (const n of STANDARD_NOTICES) para(n.message);
  h2('Terms');
  // Overnight C5: default deposit followed the old 50% line, which breaks CA home-improvement law (CSLB: lesser of $1,000 or 10%).
  // Layout unchanged; only the default terms string is state-aware. Pass o.terms to override.
  const st = (o.project && o.project.state) || zip3ToState[String((o.project && o.project.zip) || '').slice(0, 3)] || 'CA';
  const totAmt = bid ? Math.round(((o.tier && bid.tiers && bid.tiers.find(t => t.id === o.tier)) ? bid.tiers.find(t => t.id === o.tier).totals : bid.totals).total || 0) : 0;
  const depDefault = (() => {
    if (st === 'CA' || !st) { const pct = caDepositPct(totAmt), amt = Math.round(totAmt * pct / 100);
      return totAmt > 0 ? `Deposit due at signing: $${amt.toLocaleString('en-US')} (${pct % 1 ? pct.toFixed(1) : pct}% — California home-improvement cap: the lesser of $1,000 or 10%). Balance due on completion.`
        : 'Deposit due at signing: the lesser of $1,000 or 10% of the contract price (California home-improvement cap). Balance due on completion.'; }
    // v19 (Austin #2): other states — statutory cap preset where verified (data/state-deposit.js, sources cited there); else neutral 10% + edit note.
    const D = depositDefault(st, totAmt), pc = D.pct % 1 ? (D.pct === 100 / 3 ? 'one-third' : D.pct.toFixed(1) + '%') : D.pct + '%';
    if (D.preset) return totAmt > 0 ? `Deposit due at signing: $${D.amount.toLocaleString('en-US')} (${pc} — ${D.label}). Balance due on completion.` : `Deposit due at signing: ${D.label}. Balance due on completion.`;
    return totAmt > 0 ? `Deposit due at signing: $${D.amount.toLocaleString('en-US')} (${pc}). Balance due on completion. (Default only: deposit rules differ by state. Edit these terms for your state's law.)`
      : `Deposit due at signing: ${NEUTRAL_PCT}% of the contract price. Balance due on completion. (Default only: deposit rules differ by state. Edit these terms for your state's law.)`;
  })();
  const terms = Array.isArray(o.terms) ? o.terms : o.terms ? [o.terms] : [
    'Price includes materials, labor, and cleanup for the scope listed. Changes to scope will be quoted separately in writing.',
    depDefault, 'Plant material warrantied for one year when watered per care instructions.',
    'Quantities are estimates from a conceptual design; final quantities confirmed on site. Excludes permits, engineering, and utility relocation unless listed.'];
  terms.forEach((t, i) => para(`${i + 1}. ${t}`, 9));
  // ---- signatures ----
  need(80); y += 20; doc.setDrawColor(0);
  [['Client signature', M], [`${B.name || 'Contractor'} signature`, M + CW / 2 + 10]].forEach(([l, x]) => {
    doc.line(x, y + 30, x + CW / 2 - 10, y + 30); doc.setFontSize(8.5); T(l, x, y + 41); T('Date', x + CW / 2 - 60, y + 41); });
  y += 50;
  // ---- footer on every page ----
  if (o.footers === false) return doc; // caller draws footers after appending pages
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120, 30, 30); doc.setFont('helvetica', 'bold');
    T('Conceptual design, not for construction. Call 811 before you dig.', M, H - 24);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(120); T(`Page ${i} of ${n}`, W - M, H - 24, { align: 'right' }); doc.setTextColor(0); }
  return doc;
}
/** downloadProposalPdf(opts, filename) — browser convenience */
export function downloadProposalPdf(o, filename = 'proposal.pdf') { const d = buildProposalPdf(o); d.save(filename); return d; }
