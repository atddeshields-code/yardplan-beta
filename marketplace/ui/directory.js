// directory.js — "Hire a pro" directory: filter by ZIP + service, cards, open profile.
import { esc } from './mp-client.js';
import { proCardHtml, renderProProfile } from './pro-profile.js';
/** renderDirectory(el, { client, zip, service, services, onOpen? }) */
export async function renderDirectory(el, { client, zip = '', service = '', services = [], onOpen } = {}) {
  el.innerHTML = `<div class="mp stack"><div class="input-row"><input class="input" id="dirZip" inputmode="numeric" maxlength="5" placeholder="Your ZIP code" value="${esc(zip)}" aria-label="Your ZIP code">
    <select class="input" id="dirSvc" aria-label="Service"><option value="">Any service</option>${services.map(s => `<option ${s === service ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
    <div id="dirList" class="cards stack" aria-live="polite"></div><div id="dirProfile"></div></div>`;
  const list = el.querySelector('#dirList'), prof = el.querySelector('#dirProfile');
  async function load() { const z = el.querySelector('#dirZip').value.trim(), s = el.querySelector('#dirSvc').value;
    if (z && !/^\d{5}$/.test(z)) { list.innerHTML = '<p class="error-text">Enter a 5-digit US ZIP code.</p>'; return; }
    list.innerHTML = '<p class="muted">Finding pros…</p>';
    try { const { pros } = await client.directory({ zip: z, service: s }); list.innerHTML = pros.map(proCardHtml).join('') || '<div class="card"><p><strong>No verified pros here yet.</strong></p><p class="muted">We only list pros whose state landscaping license we\'ve checked. Try a nearby ZIP.</p></div>'; }
    catch (e) { list.innerHTML = `<p class="error-text">Couldn't load pros (${esc(e.message)}).</p>`; } }
  el.querySelector('#dirZip').addEventListener('change', load); el.querySelector('#dirSvc').addEventListener('change', load);
  list.addEventListener('click', async e => { const id = e.target.closest('[data-open]')?.dataset.open; if (!id) return; const p = await client.pro(id); renderProProfile(prof, p); onOpen && onOpen(p); prof.scrollIntoView?.({ behavior: 'smooth' }); });
  await load(); return { reload: load };
}
