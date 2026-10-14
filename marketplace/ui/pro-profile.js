// pro-profile.js — pro card + full profile (badge, rating, license # with board lookup link, service area).
import { esc } from './mp-client.js';
const BADGE = { verified: ['badge--verified', '✓ License verified'], pending: ['badge--pending', 'Verification pending'], unverified: ['', 'Not verified yet'], rejected: ['badge--rejected', 'Not verified'] };
export const badgeHtml = v => { const [c, t] = BADGE[v] || BADGE.unverified; return `<span class="badge ${c}">${t}</span>`; };
export const starsHtml = r => r && r.count ? `<span class="stars" aria-label="${r.average} out of 5">★ ${r.average.toFixed(1)}</span> <span class="muted">(${r.count})</span>` : '<span class="muted">No reviews yet</span>';
export const licenseHtml = p => (p.licenses || []).map(l => `<div class="lic">${esc(l.state)} lic. #${esc(l.number)} · ${esc((l.classes || []).join(', '))}${l.lookupUrl ? ` · <a href="${esc(l.lookupUrl)}" target="_blank" rel="noopener">Check with ${esc(l.board || 'state board')}</a>` : ''}</div>`).join('');
/** proCardHtml(pro) — directory card */
export function proCardHtml(p) {
  return `<article class="card pro-card" data-pro="${esc(p.id)}"><div class="row"><h3>${esc(p.businessName)}</h3>${badgeHtml(p.verification)}</div>
  <div class="row">${starsHtml(p.rating)}${p.distanceMiles != null ? `<span class="muted">· ${p.distanceMiles} mi away</span>` : ''}</div>
  <div class="foot">Serves ${esc(p.serviceZips.slice(0, 3).join(', '))}${p.serviceZips.length > 3 ? '…' : ''} + ${p.radiusMiles} mi · ${esc(p.services.join(', '))}</div>
  ${licenseHtml(p)}<button class="btn btn--secondary btn--sm" data-open="${esc(p.id)}">View profile</button></article>`;
}
/** renderProProfile(el, pro) — pro is GET /api/pros/:id output (with reviews) */
export function renderProProfile(el, p) {
  el.innerHTML = `<div class="mp stack"><div class="row"><h2>${esc(p.businessName)}</h2>${badgeHtml(p.verification)}</div>
  <div>${starsHtml(p.rating)}</div><p>${esc(p.about || '')}</p>
  ${licenseHtml(p)}<div class="foot">${p.insuranceAttested ? 'Says they carry liability insurance (self-reported).' : ''} Yardplan is not the contractor. Check the license with the state board before hiring.</div>
  <div class="foot">Service area: ${esc(p.serviceZips.join(', '))} + ${p.radiusMiles} mi · Services: ${esc(p.services.join(', '))} · On Yardplan since ${esc(p.since)}</div>
  ${(p.photos || []).length ? `<div class="row">${p.photos.map(src => `<img src="${esc(src)}" alt="" style="width:96px;height:96px;object-fit:cover;border-radius:var(--radius-sm)">`).join('')}</div>` : ''}
  <h2>Reviews</h2>${(p.reviews || []).map(r => `<div class="card pad"><div>${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)} <span class="muted">${esc(r.author)} · ${esc(r.at.slice(0, 10))}</span></div><p>${esc(r.text)}</p>${r.reply ? `<p class="foot"><b>Reply from ${esc(p.businessName)}:</b> ${esc(r.reply.text)}</p>` : ''}</div>`).join('') || '<p class="muted">No reviews yet.</p>'}</div>`;
}
