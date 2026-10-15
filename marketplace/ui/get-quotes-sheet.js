// get-quotes-sheet.js — homeowner "Get quotes" bottom sheet (v10 .sheet). Two steps: what's shared + contact -> named pros + consent -> sent.
import { esc, money } from './mp-client.js';
import { badgeHtml } from './pro-profile.js';
/**
 * openGetQuotesSheet({ client, snapshot, zip, services, photo?, render?, estimateUsd?, contact?, onSent? }) -> Promise<lead|null>
 * snapshot: share.js makeSnapshot({bid, takeoff, ...}) output (plants, bid lines/totals). photo/render: JPEG/PNG data URLs (<350 KB).
 */
export function openGetQuotesSheet(o) {
  const d = document.createElement('dialog'); d.className = 'sheet mp'; d.setAttribute('aria-labelledby', 'gq-t'); document.body.appendChild(d);
  const snap = o.snapshot || {}, plants = (snap.plants || []).reduce((n, p) => n + (p.count || 0), 0), lines = (snap.bid?.lines || []).length;
  const est = o.estimateUsd ?? snap.bid?.totals?.total ?? 0, svcAll = o.allServices || o.services || [];
  let lead = null, token = null, done;
  const result = new Promise(r => { done = r; });
  const close = v => { d.close(); d.remove(); done(v ?? lead); };
  d.addEventListener('cancel', e => { e.preventDefault(); close(null); });
  function step1(err = '') {
    d.innerHTML = `<div class="sheet__grab" aria-hidden="true"></div><div class="stack">
    <h2 id="gq-t">Get quotes from local pros</h2><p class="muted">We'll find up to ${o.cap || 1} licensed pro${(o.cap || 1) > 1 ? 's' : ''} near ${esc(o.zip)}. Nothing is shared until you say yes.</p>
    <div class="card card--on-surface pad"><b>What we'll share</b><ul class="share-list">
      ${o.photo ? '<li>Your yard photo</li>' : ''}${o.render ? '<li>Your design render</li>' : ''}<li>Plant list (${plants} plants)</li><li>Takeoff (${lines} line items)</li>
      <li>Your estimate: ${money(est * 100, { whole: true })}<span class="badge gq-badge">Non-binding estimate</span></li><li>Your name, email, phone and address below</li></ul></div>
    <div class="field"><label for="gq-n">Your name</label><input class="input" id="gq-n" autocomplete="name" value="${esc(o.contact?.name || '')}"></div>
    <div class="field"><label for="gq-e">Email</label><input class="input" id="gq-e" type="email" autocomplete="email" value="${esc(o.contact?.email || '')}"></div>
    <div class="field"><label for="gq-p">Phone (optional)</label><input class="input" id="gq-p" type="tel" autocomplete="tel" value="${esc(o.contact?.phone || '')}"></div>
    <div class="field"><label for="gq-a">Street address (optional)</label><input class="input" id="gq-a" autocomplete="street-address" value="${esc(o.contact?.address || '')}"></div>
    <div class="field"><label>What do you need?</label><div class="chips">${svcAll.map(s => `<button type="button" class="chip" aria-pressed="${(o.services || []).includes(s)}" data-svc="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>
    ${err ? `<p class="error-text" role="alert">${esc(err)}</p>` : ''}
    <div class="sheet__footer"><button class="btn btn--ghost" data-x>Not now</button><button class="btn btn--primary btn--lg" data-find>Find pros</button></div></div>`;
    d.querySelectorAll('[data-svc]').forEach(b => b.onclick = () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'));
    d.querySelector('[data-x]').onclick = () => close(null);
    d.querySelector('[data-find]').onclick = async () => {
      const services = [...d.querySelectorAll('[data-svc][aria-pressed="true"]')].map(b => b.dataset.svc);
      const contact = { name: d.querySelector('#gq-n').value, email: d.querySelector('#gq-e').value, phone: d.querySelector('#gq-p').value, address: d.querySelector('#gq-a').value };
      if (!contact.name.trim()) return step1('Add your name so pros know who to contact.');
      if (!/^\S+@\S+\.\S+$/.test(contact.email)) return step1('Enter a valid email.'); if (!services.length) return step1('Pick at least one service.');
      try { const r = await o.client.requestQuotes({ zip: o.zip, services, contact, estimateUsd: est, package: snap, photo: o.photo, render: o.render }); token = r.homeownerToken; lead = r; step2(); }
      catch (e) { step1(e.data?.errors ? 'Please check: ' + e.data.errors.join(', ') : 'Something went wrong. Try again.'); }
    };
  }
  function step2(err = '') {
    const pend = lead.pending, ms = pend?.matches || [];
    if (!ms.length) { d.innerHTML = `<div class="sheet__grab"></div><div class="stack"><h2 id="gq-t">No pros available yet</h2><p class="muted">No licensed pros cover ${esc(o.zip)} for these services right now. Your design is saved; try again later.</p><div class="sheet__footer"><button class="btn btn--secondary btn--block" data-x>Done</button></div></div>`;
      d.querySelector('[data-x]').onclick = () => close(null); return; }
    d.innerHTML = `<div class="sheet__grab" aria-hidden="true"></div><div class="stack"><h2 id="gq-t">Send to ${ms.length === 1 ? 'this pro' : 'these pros'}?</h2>
    ${ms.map(m => `<div class="card card--on-surface pad"><div class="row"><b>${esc(m.businessName)}</b>${badgeHtml(m.verification)}</div><div class="foot">${esc(m.license)} · ${m.distanceMiles} mi away${m.rating.count ? ` · ★ ${m.rating.average}` : ''}</div></div>`).join('')}
    <label class="consent"><input type="checkbox" id="gq-c"><span>${esc(pend.consentText)}</span></label>
    <label class="consent"><input type="checkbox" id="gq-s"><span>${esc(pend.smsConsentText)}</span></label>
    <p class="foot">Yardplan isn't the contractor. Your estimate is non-binding; pros will confirm a real price.</p>
    ${err ? `<p class="error-text" role="alert">${esc(err)}</p>` : ''}
    <div class="sheet__footer"><button class="btn btn--ghost" data-x>Cancel</button><button class="btn btn--primary btn--lg" data-send disabled>Send to ${ms.length} pro${ms.length > 1 ? 's' : ''}</button></div></div>`;
    const c = d.querySelector('#gq-c'), send = d.querySelector('[data-send]'); c.onchange = () => { send.disabled = !c.checked; };
    d.querySelector('[data-x]').onclick = () => close(null);
    send.onclick = async () => { const sms = d.querySelector('#gq-s').checked;
      try { lead = { ...lead, ...(await o.client.consent(token, lead.id, { consent: true, consentText: pend.consentText, smsConsent: sms, smsConsentText: sms ? pend.smsConsentText : undefined })) }; step3(); }
      catch (e) { if (e.data?.error === 'matches_changed') { lead.pending = e.data.pending; step2('The available pros changed. Please review and confirm again.'); }
        else step2(e.data?.error === 'phone_required_for_sms' ? 'Add a phone number to get texts, or leave that box unchecked.' : 'Couldn\'t send. Try again.'); } };
  }
  function step3() {
    d.innerHTML = `<div class="sheet__grab"></div><div class="stack"><h2 id="gq-t">Sent!</h2><p class="muted">These pros got your design. They usually reply within 1–2 days.</p>
    <ul class="share-list">${lead.sentTo.map(s => `<li><b>${esc(s.businessName)}</b> · ${esc(s.status)}</li>`).join('')}</ul>
    <div class="sheet__footer"><button class="btn btn--primary btn--block" data-x>Done</button></div></div>`;
    d.querySelector('[data-x]').onclick = () => { o.onSent && o.onSent({ lead, homeownerToken: token }); close(lead); };
  }
  step1(); d.showModal();
  result.token = () => token;
  return result;
}
