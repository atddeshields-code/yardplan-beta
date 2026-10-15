// mp-app.js: wires the marketplace UI into Yardplan v10. Backend = window.YARDPLAN_MARKET_URL (Worker or `node marketplace/tools/dev-server.mjs`),
// else the in-browser mock (mock.js). Classic globals used: state, go, toast? (optional).
import { createMarketClient } from './ui/mp-client.js';
import { openGetQuotesSheet } from './ui/get-quotes-sheet.js';
import { renderDirectory } from './ui/directory.js';
import { renderProInbox } from './ui/pro-inbox.js';
const URL_ = window.YARDPLAN_MARKET_URL || '';
let ready;
function init() {
  if (ready) return ready;
  ready = (async () => {
    if (URL_) { const client = createMarketClient(URL_); let pros = []; try { pros = (await (await fetch(URL_.replace(/\/$/, '') + '/dev/seed')).json()).pros || []; } catch {} return { client, pros, mock: false, cfg: await client.config() }; }
    const { createMockMarket } = await import('./mock.js'); const m = await createMockMarket(); const client = createMarketClient('', { fetchImpl: m.fetchImpl });
    return { client, pros: m.pros, mock: true, cfg: await client.config() };
  })();
  return ready;
}
const mockNote = mock => mock ? '<p class="footnote mp-note">Demo mode: sample pros, nothing is sent, texted or charged.</p>' : '';
async function toDataUrl(src, max = 640) { if (!src) return null; try { const im = new Image(); im.src = src; await im.decode(); const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', .72); } catch { return null; } }
async function getQuotes({ bid, takeoff, zip, style, photo, render } = {}) {
  const m = await init(); const { makeSnapshot } = await import('../contractor/p1/share.js');
  const snapshot = makeSnapshot({ bid, takeoff, project: { title: `${style || 'New'} yard`, zip } });
  const services = ['design', 'planting'].concat(/xeri/i.test(style || '') ? ['xeriscape'] : []);
  return openGetQuotesSheet({ client: m.client, snapshot, zip: zip || '95814', services, allServices: m.cfg.services, cap: m.cfg.leadCap, estimateUsd: bid?.totals?.total,
    photo: await toDataUrl(photo), render: await toDataUrl(render),
    onSent: () => { window.toast?.('Sent your plan to local pros.'); } });
}
async function showDirectory(zip) {
  const m = await init(), el = document.querySelector('#prosDir'); el.innerHTML = '';
  await renderDirectory(el, { client: m.client, zip: zip || state.zip || '95814', services: m.cfg.services });
  el.insertAdjacentHTML('beforeend', mockNote(m.mock));
}
async function showInbox() {
  const m = await init(), el = document.querySelector('#leadsBox'), who = document.querySelector('#leadsWho');
  if (!who.options.length) { who.innerHTML = m.pros.map(p => `<option value="${p.proToken}">${p.businessName} (${p.verification})</option>`).join(''); who.onchange = showInbox; }
  document.querySelector('#leadsNote').innerHTML = mockNote(m.mock);
  if (!who.value) { el.innerHTML = '<p class="muted">Sign in to see your leads.</p>'; return; }
  await renderProInbox(el, { client: m.client, token: who.value, owner: !!window.ownerApi?.isOwner() });
  await showAdminQueue(m);
}
// Owner only: verification review queue (mock backend uses the mock admin token; a real Worker needs the owner's ADMIN_TOKEN, not stored in the app).
async function showAdminQueue(m) {
  const q = document.querySelector('#adminQueue'); if (!q) return; const on = !!window.ownerApi?.isOwner(); q.hidden = !on; if (!on) return;
  if (!m.mock) { q.innerHTML = '<div class="card pad"><h3>Review queue</h3><p class="footnote">Connect the marketplace Worker with your admin token to review pros here.</p></div>'; return; }
  const T = 'mock-admin', esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  let pros = []; try { const r = await m.client.admin.pros(T); pros = r.pros || r || []; } catch (e) { q.innerHTML = '<p class="footnote">Review queue unavailable.</p>'; return; }
  const pend = pros.filter(p => p.verification !== 'verified');
  q.innerHTML = `<div class="card pad stack"><div class="row"><h3>Review queue</h3><span class="badge badge--success">Owner</span></div>
    <p class="footnote">Pros waiting for license verification. Demo data.</p>${pend.length ? pend.map(p => `<div class="aq"><div><b>${esc(p.businessName)}</b><span class="foot"> ${esc(p.license || '')} · ${esc(p.verification)}</span></div><span class="row"><button class="btn btn--primary btn--sm" data-aq="verified" data-id="${esc(p.id)}">Verify</button><button class="btn btn--secondary btn--sm" data-aq="rejected" data-id="${esc(p.id)}">Reject</button></span></div>`).join('') : '<p class="muted">Nothing to review.</p>'}</div>`;
  q.querySelectorAll('[data-aq]').forEach(b => b.onclick = async () => { try { await m.client.admin.verify(T, b.dataset.id, b.dataset.aq, 'owner review'); } catch (e) { console.warn(e); } showAdminQueue(m); });
}
window.addEventListener('yardplan:tab', e => { if (e.detail === 'pros') showDirectory(); if (e.detail === 'leads') showInbox(); });
window.mpApi = { init, getQuotes, showDirectory, showInbox };
