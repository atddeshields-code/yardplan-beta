import { designOnSite } from './siteplan/core.js';
import { parseBudget } from './contractor/parse-budget.js';
import { followUpDue, followUpText, LOST_REASONS, winStats } from './contractor/followup.js';
// jobs.js — v16 contractor side: Jobs home, 4-step job (Client → Photo & plan → Bid → Proposal), ••• menu sheets,
// backup/restore and owner unlock. Pricing and the proposal PDF still come from pro.js (bid math and PDF unchanged);
// a job only supplies client / project / design / tier. Storage: localStorage 'yardplan.jobs.v1' (array of jobs).
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const JKEY = 'yardplan.jobs.v1', AKEY = 'yardplan.jobs.active', OKEY = 'yardplan.owner.v1', BKEY = 'yardplan.backup.last';
// Owner passphrase: PBKDF2-SHA256 hash only (the passphrase itself is not in the app). Client-side gate for this static beta.
// Overnight B13: client-side owner unlock is NOT real security (anyone can set localStorage). Gate nothing paid on it.
// Run 5 (R5-3): there is no constant token any more. A correct passphrase stores a random 128-bit token plus an HMAC tag over it;
// a pasted or old constant value fails. Still client-only: the HMAC key is in the bundle, so a determined user can mint a tag.
// Only server auth fixes this. Gate nothing paid on it.
const OWNER = { salt: 'f960043fbece4b02be4efea1c0ed0744', hash: '705e368b9b6458469497898da9a17728e8dc4c8bb832a9fcf2add0c7ba16b308', iter: 210000 };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = n => '$' + Math.round(+n || 0).toLocaleString('en-US');
const ico = (n, c = 'ico') => `<svg class="${c}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const uid = () => 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
// Overnight B6: storage writes used to fail silently (quota full / private mode) and jobs were lost with no warning.
const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { storageFailed(e); return false; } } };
function storageFailed(e) { if (document.getElementById('storeWarn')) return; const d = document.createElement('div'); d.id = 'storeWarn'; d.className = 'storewarn'; d.setAttribute('role', 'alert');
  const pro = document.body.dataset.mode === 'pro'; d.innerHTML = `<span><b>▲ Can't save on this device.</b> Storage is full or blocked (private browsing?). ${pro ? 'Back up your jobs now so nothing is lost.' : 'Your design is still on screen, but it may not be here next time. Delete an old plan in My plans to free space.'}</span>${pro ? '<button type="button" class="btn btn--secondary" data-sw="bk">Back up jobs</button>' : ''}<button type="button" class="btn btn--ghost" data-sw="x" aria-label="Dismiss">✕</button>`;
  d.onclick = ev => { const b = ev.target.closest('[data-sw]'); if (!b) return; if (b.dataset.sw === 'bk') { try { openBackup(); } catch {} } d.remove(); }; document.body.append(d); console.warn('storage write failed', e?.name || e); }
window.storageFailed = storageFailed; if (window.__lsFail) storageFailed(window.__lsFail);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const toast = m => window.toast?.(m);
const STEPS = ['Client', 'Photo and plan', 'Bid', 'Proposal'];
const STATUS = { draft: ['Draft', ''], sent: ['Sent', 'info'], viewed: ['Viewed', 'info'], signed: ['Signed', 'success'], won: ['Won', 'success badge--solid'], lost: ['Lost', 'danger'], archived: ['Archived', ''] };
const badge = st => { const [t, c] = STATUS[st] || STATUS.draft; return `<span class="badge${c ? ' badge--' + c : ''}">${t}</span>`; };

// ---------- data ----------
function newJob(o = {}) { const t = Date.now(); return { id: uid(), createdAt: t, updatedAt: t, status: 'draft', step: 1, client: { name: '', email: '', phone: '', address: '', zip: '' }, title: '', budget: '',
  design: null, styleId: null, renderRef: null, tier: 'good', total: null, bidSnapshot: null, sentAt: null, signId: null, ...o }; }
function migrate() {
  let prof = {}, d = null; try { prof = JSON.parse(ls.get('yardplan.pro.profile.v1')) || {}; } catch {} try { d = JSON.parse(ls.get('yardplan.design.v3')); } catch {}
  const c = prof.client || {}, pj = prof.project || {};
  const has = c.name || c.address || c.email || pj.title || (d && d.items && d.items.length);
  return has ? [newJob({ client: { name: c.name || '', email: c.email || '', phone: '', address: c.address || '', zip: '' }, title: pj.title || '', budget: pj.budget || '', design: d || null,
    styleId: d?.style || null, tier: prof.tier || 'good', step: 3, migrated: true })] : [];
}
let jobs = (() => { try { const j = JSON.parse(ls.get(JKEY)); if (Array.isArray(j)) return j; } catch {} const m = migrate(); ls.set(JKEY, JSON.stringify(m)); return m; })();
// overnight P3: typing in job fields saved the whole jobs array on every keystroke; field edits now coalesce (250 ms) and flush on pagehide/hidden. Any other save() writes immediately and supersedes a pending one.
let saveT = 0; const save = () => { clearTimeout(saveT); saveT = 0; return ls.set(JKEY, JSON.stringify(jobs)); };
const touch = () => { if (cur) cur.updatedAt = Date.now(); save(); };
const touchSoon = () => { if (cur) cur.updatedAt = Date.now(); clearTimeout(saveT); saveT = setTimeout(save, 250); };
const flushSave = () => { if (saveT) save(); }; addEventListener('pagehide', flushSave); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
let cur = null, applying = false, filter = 'all', query = '', fromJob = false;

// ---------- routing ----------
const _go = window.go;
window.go = function (tab) {
  if (tab === 'pro' || tab === 'jobs') { setMode('pro'); _go('jobs'); renderJobs(); history.replaceState(null, '', location.pathname + location.search + '#/jobs'); window.proApi?.refresh?.()?.catch?.(() => {}); return chrome('jobs'); }
  if (document.body.dataset.mode === 'pro' && ['site', 'overlay', 'materials', 'care', 'leads', 'credits', 'plants'].includes(tab)) fromJob = document.body.dataset.tab === 'job' || (fromJob && document.body.dataset.tab !== 'jobs');
  _go(tab); chrome(tab);
};
function chrome(tab) {
  const pro = document.body.dataset.mode === 'pro';
  $('#pBack').hidden = !(pro && !['jobs', 'job'].includes(tab)); $('#pBack span').textContent = fromJob && cur ? 'Job' : 'Jobs';
  $('#siteDone').hidden = !(pro && tab === 'site' && cur); if (cur) $('#siteDoneName').textContent = cur.client.name || 'this job';
}
$('#pBack').onclick = () => { if (fromJob && cur) { _go('job'); chrome('job'); } else go('pro'); };
$('#siteDoneBtn').onclick = () => { _go('job'); chrome('job'); jstep(2); };

// ---------- Jobs home ----------
const ago = t => { const s = (Date.now() - t) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 86400 * 7) return Math.floor(s / 86400) + 'd ago'; return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
const inChip = (j, c) => c === 'all' ? j.status !== 'archived' : c === 'sent' ? ['sent', 'viewed'].includes(j.status) : j.status === c;
// Overnight B9: "New job" saved a blank draft right away, so abandoned "Untitled job" rows piled up. A job that was never
// touched (no client info, budget, look pick, site plan or photo, still on step 1) is dropped when you leave it.
const pristine = j => j && j.status === 'draft' && (j.step || 1) === 1 && !j.client?.name?.trim() && !j.client?.address?.trim() && !j.client?.zip && !j.client?.email && !String(j.budget || '').trim() && !j.title && !j.site && !j.lookPicked && !j.sentAt;
function prunePristine() { const keep = jobs.filter(j => !(pristine(j) && !(j === cur && document.body.dataset.tab === 'job'))); if (keep.length !== jobs.length) { jobs.splice(0, jobs.length, ...keep); save(); } }
function renderJobs() { prunePristine();
  const chips = ['all', 'draft', 'sent', 'signed', 'won', 'lost'].concat(jobs.some(j => j.status === 'archived') ? ['archived'] : []);
  if (!chips.includes(filter)) filter = 'all';
  $('#jobChips').innerHTML = chips.map(c => `<button type="button" class="chip" data-chip="${c}" aria-pressed="${c === filter}">${c === 'all' ? 'All' : STATUS[c][0]} <span class="chip__n">${jobs.filter(j => inChip(j, c)).length}</span></button>`).join('');
  const q = query.trim().toLowerCase();
  const list = jobs.filter(j => inChip(j, filter)).filter(j => !q || [j.client.name, j.client.address, j.client.zip, j.title].join(' ').toLowerCase().includes(q)).sort((a, b) => b.updatedAt - a.updatedAt);
  const el = $('#jobList');
  document.body.dataset.jobs = jobs.length ? '1' : '0';
  if (!jobs.length) { el.innerHTML = `<section class="empty jempty"><img src="img/styles/mediterranean-800.webp" alt="" width="800" height="450"><h2>No jobs yet</h2><p class="muted">Start with a client's name and address. You can add a photo on site.</p><button class="btn btn--secondary btn--lg" type="button" data-jnew>${ico('plus')}New job</button></section>`; return; }
  if (!list.length) { el.innerHTML = q ? `<section class="empty empty--sm">${ico('search', 'ico ico--lg')}<h2>No jobs match "${esc(query.trim())}"</h2><p class="muted">Try a client name, street or ZIP.</p><button class="btn btn--secondary" type="button" id="jClearQ">Clear search</button></section>`
    : `<section class="empty empty--sm">${ico(filter === 'signed' ? 'file-signature' : 'clipboard-list', 'ico ico--lg')}<h2>Nothing ${STATUS[filter][0].toLowerCase()} yet</h2><p class="muted">${{ signed: 'Jobs move here when a client signs.', sent: 'Jobs move here when you send a proposal.', won: 'Mark a job as won from its ••• menu.', lost: 'Jobs you mark as lost show up here.', draft: 'New jobs start as drafts.', archived: '' }[filter] || ''}</p><button class="btn btn--secondary" type="button" id="jShowAll">Show all jobs</button></section>`;
    $('#jClearQ') && ($('#jClearQ').onclick = () => { query = ''; $('#jobSearch').value = ''; renderJobs(); }); $('#jShowAll') && ($('#jShowAll').onclick = () => { filter = 'all'; renderJobs(); }); return; }
  el.innerHTML = '<ul class="jobs" role="list">' + list.map(j => `<li><button type="button" class="jobrow" data-job="${esc(j.id)}"><span class="jobrow__name">${esc(j.client.name || j.title || 'Untitled job')}</span><span class="jobrow__total">${(j.status !== 'draft' && j.sentTotal != null) ? money(j.sentTotal) : j.total != null ? money(j.total) : '—'}</span>
    <span class="jobrow__meta">${esc(j.client.address || (j.client.zip ? 'ZIP ' + j.client.zip : 'No address yet'))} · ${['sent', 'viewed'].includes(j.status) && j.sentAt ? 'Sent ' + ago(j.sentAt) : ago(j.updatedAt)}</span><span class="jobrow__st">${badge(j.status)}</span></button>${(() => { const f = followUpDue(j); return f ? `<button type="button" class="chip chip--fu" data-fu="${esc(j.id)}" aria-label="Follow up · ${f.days}d, no reply: ${esc(j.client.name || 'client')}">${ico('send', 'ico ico--sm')}Follow up · ${f.days}d, no reply</button>` : ''; })()}</li>`).join('') + '</ul>';
  const ws = winStats(jobs), wl = $('#jobStats'); if (wl) { wl.hidden = !ws; wl.textContent = ws ? `Win rate ${ws.pct}% · won ${ws.won} of ${ws.decided} decided` : ''; }
}
$('#jobChips').onclick = e => { const b = e.target.closest('[data-chip]'); if (b) { filter = b.dataset.chip; renderJobs(); } };
$('#jobSearch').oninput = e => { query = e.target.value; renderJobs(); };
document.addEventListener('click', e => { const g = e.target.closest('[data-jgo]'); if (g && cur) { e.preventDefault(); jstep(+g.dataset.jgo); return; } if (e.target.closest('[data-jnew]')) { e.preventDefault(); createJob(); } const fu = e.target.closest('[data-fu]'); if (fu) { openFollowUp(fu.dataset.fu); return; } const r = e.target.closest('[data-job]'); if (r) openJob(r.dataset.job); });

// ---------- one job ----------
const getPath = (o, p) => p.split('.').reduce((a, k) => a && a[k], o);
const setPath = (o, p, v) => { const ks = p.split('.'); let x = o; ks.slice(0, -1).forEach(k => x = x[k] = x[k] || {}); x[ks.at(-1)] = v; };
function pushJob() { if (!cur || !window.proApi) return; window.proApi.setJob({ client: { name: cur.client.name, email: cur.client.email, phone: cur.client.phone, address: cur.client.address }, project: { title: cur.title || (cur.client.name ? cur.client.name.split(' ').slice(-1)[0] + ' landscape' : ''), budget: cur.budget }, tier: cur.tier }); }
function setZip(z) { z = /^\d{5}$/.test(z || '') ? z : '95814'; if (state.zip === z) return; const i = $('#zip'); if (!i) return; i.value = z; $('#zipForm').requestSubmit(); }
function createJob() { const j = newJob(); jobs.unshift(j); save(); openJob(j.id, 1); }
async function openJob(id, step) {
  cur = jobs.find(j => j.id === id); if (!cur) return go('pro'); jobReady = false;
  ls.set(AKEY, id); setMode('pro'); fromJob = false; _go('job'); chrome('job'); lastDoc = null; lastSig = ''; shown = null;
  history.replaceState(null, '', location.pathname + location.search + '#/jobs/' + id);
  $$('[data-j]').forEach(i => { const v = getPath(cur, i.dataset.j); i.value = v ?? ''; }); $('#jErr')?.remove(); { const bi = $('[data-j="budget"]'); if (bi) budgetHint(bi); }
  $$('#proLawn,#proLawnTake').forEach(c => c.checked = !!cur.design?.includeLawn);
  $('#jPhotoImg').hidden = true; $('#jPlanImg').hidden = true;
  pushJob(); setZip(cur.client.zip);
  jstep(step || cur.step || 1);
  applying = true;
  try { await window.planApi?.whenReady?.(); if (cur.design) { if (!cur.design.irrigation) cur.design.irrigation = (cur.design.items || []).some(i => ['plant', 'lawn', 'mulch'].includes(i.kind)) ? 'drip' : 'none'; window.planApi.apply(cur.design); } else await buildFromLook(cur.styleId || defaultLook(), false); } catch (e) { console.warn(e); }
  applying = false;
  await window.proApi?.refresh?.(); jobReady = true;
  if (cur?.step === 3) renderBidView(); if (cur?.step === 2) planPreview();
}
function jstep(n) {
  if (!cur) return; cur.step = n; save();
  $$('[data-jstep]').forEach(s => s.hidden = +s.dataset.jstep !== n);
  $$('#jProg i').forEach((i, k) => i.classList.toggle('on', k < n));
  $('#jEye').textContent = `Step ${n} of 4`; $('#jTitle').textContent = n === 1 && !cur.client.name ? 'New job' : STEPS[n - 1];
  $('#jNext').innerHTML = n === 4 ? ico('send') + '<span>Send proposal</span>' : `<span>${['Next', 'Next', 'Review proposal'][n - 1]}</span>`;
  $('#tab-job').dataset.step = n;
  if (!reduced()) { const s = $(`[data-jstep="${n}"]`); s.classList.remove('jin'); void s.offsetWidth; s.classList.add('jin'); }
  window.scrollTo({ top: 0, behavior: 'auto' });
  if (n === 2) { renderLooks(); planPreview(); siteNote(); if (cur.site && !siteLayers[cur.id]) { try { siteLayers[cur.id] = JSON.parse(localStorage.getItem('yardplan.site.layers.' + cur.id)) || {}; } catch {} } } if (n === 3) renderBidView(); if (n === 4) renderProposal();
}
$('#jBack').onclick = () => { if (!cur || cur.step <= 1) return go('pro'); jstep(cur.step - 1); };
$('#jNext').onclick = () => {
  if (!cur) return; const n = cur.step;
  if (n === 1 && !cur.client.name.trim() && !cur.client.address.trim()) { const f = $('[data-j="client.name"]'); f.focus(); if (!$('#jErr')) f.closest('.field').insertAdjacentHTML('beforeend', '<span class="error-text" id="jErr" role="alert">Add the client\'s name or address.</span>'); return; }
  if (n < 4) return jstep(n + 1); send();
};
$('#jMore').onclick = () => openJobActions();
let pushT; $$('[data-j]').forEach(i => i.addEventListener('input', () => { if (!cur) return; setPath(cur, i.dataset.j, i.value); touchSoon(); $('#jErr')?.remove();
  if (i.dataset.j === 'client.name' && cur.step === 1) $('#jTitle').textContent = i.value ? 'Client' : 'New job';
  if (i.dataset.j === 'client.zip' && /^\d{5}$/.test(i.value)) setZip(i.value);
  if (i.dataset.j === 'budget') budgetHint(i);
  clearTimeout(pushT); pushT = setTimeout(pushJob, 200); }));

function budgetHint(i) { let h = i.closest('.field').querySelector('.jbhint'); if (!h) { h = document.createElement('span'); h.className = 'footnote jbhint'; h.setAttribute('aria-live', 'polite'); i.closest('.field').append(h); }
  const p = parseBudget(i.value); h.textContent = !i.value.trim() ? '' : p.value ? `Reads as ${money(p.value)}${p.range ? ' (top of the range)' : ''}` : "We can't read that as a dollar amount."; }
// step 2: photo, look, plan
const GROUND = { xeriscape: 'dg', japanese: 'gravel', mediterranean: 'gravel', tropical: 'mulch' };
// Look follows the job's ZIP (state + zone), not the first ZIP digit (overnight B3: 995xx AK / 967xx HI / 97-98xxx OR-WA read as CA).
const defaultLook = () => window.flowApi?.defaultLook?.() || 'cottage';
async function buildFromLook(id, refresh = true) {
  if (!cur || !window.flowApi) return; cur.styleId = id;
  let d = window.flowApi.designFor(id, window.flowApi.pickPlants(id), GROUND[id] || 'lawn'); d.irrigation = cur.design?.irrigation || 'drip';
  if (cur.site) d = designOnSite(cur.site, d);
  await window.planApi.whenReady(); applying = true; window.planApi.apply(d); applying = false;
  cur.design = window.planApi.serialize(); touch(); renderLooks(); planPreview();
  if (refresh) window.proApi?.refresh?.();
}
function renderLooks() {
  const sel = cur?.styleId || cur?.design?.style || null;
  $('#jLooks').innerHTML = STYLES.map(s => `<button type="button" class="jlook" role="radio" aria-checked="${s.id === sel}" data-look="${s.id}"><img src="img/styles/${s.id}-800.webp" alt="" loading="lazy" width="800" height="450"><span>${esc(s.name.split(' / ')[0])}</span>${s.id === sel ? ico('check', 'ico jlook__ck') : ''}</button>`).join('');
}
$('#jLooks').onclick = e => { const b = e.target.closest('[data-look]'); if (b && b.getAttribute('aria-checked') !== 'true') { cur.lookPicked = true; buildFromLook(b.dataset.look); } };
let prevT; function planPreview() {
  clearTimeout(prevT); prevT = setTimeout(async () => { if (!window.planApi?.ready?.()) return; const d = window.planApi.serialize(), it = d.items || [];
    $('#jPlanSum').textContent = `${d.yard.w} × ${d.yard.d} ft · ${it.filter(i => i.kind === 'plant').length} plants · ${it.filter(i => !['plant', 'grade'].includes(i.kind)).length} beds, paths and features`;
    try { const [img] = await window.planApi.capture(900, 'image/jpeg', .82); const im = $('#jPlanImg'); im.src = img; im.hidden = false; } catch (e) { console.warn(e); } }, 120);
}
$('#jEditPlan').onclick = () => go('site');
// v17: site plan from aerial or survey (siteplan/editor.js). The edited site becomes the job's plan; the look is fitted onto the lot.
const siteLayers = Object.create(null);
function siteNote() { const n = $('#jSiteNote'), s = cur?.site; $('#jSiteEdit').hidden = !s; if (!n) return;
  n.textContent = s ? (s.source === 'survey' ? `Lot per survey${s.surveyDate ? ' dated ' + s.surveyDate : ''}.` : 'Site plan from aerial and public data — approximate, not a survey.') + ` Lot ${Math.round(Math.abs(s.lot.reduce((a, p, i) => { const q = s.lot[(i + 1) % s.lot.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2)).toLocaleString()} sq ft.` : 'Draw the real lot from a USDA aerial, or trace a property survey.'; }
function openSite(mode) { if (!cur) return; const address = [cur.client.address, cur.client.zip].filter(Boolean).join(' ');
  if (mode === 'aerial' && !cur.client.address.trim()) { toast('Add the job address in step 1 first.'); return; }
  window.siteApi.open({ mode, address, who: 'pro', site: mode === 'edit' || (mode === 'survey' && cur.site) ? cur.site : null, layers: siteLayers[cur.id] || {}, keepAerial: true,
    onDone: async (site, design, layers) => { cur.site = site; siteLayers[cur.id] = layers; if (!ls.set('yardplan.site.layers.' + cur.id, JSON.stringify(layers || {}))) toast('▲ The survey image is too big to keep on this device; the traced plan is saved.'); touch();
      await buildFromLook(cur.styleId || defaultLook()); siteNote(); toast(site.source === 'survey' ? 'Plan updated from the survey.' : 'Site plan drawn. The bid uses it now.'); } }); }
$('#jAuto').onclick = () => openSite('aerial'); $('#jSurvey').onclick = () => openSite('survey'); // overnight B8: one path, so a re-run persists layers, awaits the rebuild and confirms
$('#jSiteEdit').onclick = () => openSite('edit');
$('#jPhotoBtn').onclick = () => $('#jPhotoIn').click();
$('#jPhotoIn').onchange = async e => { const f = e.target.files[0]; if (!f) return; const im = $('#jPhotoImg'); im.src = URL.createObjectURL(f); im.hidden = false;
  $('#jPhotoBtn span').textContent = 'Change photo'; try { await window.overlayApi?.loadFile?.(f); } catch (er) { console.warn(er); } };
let desT;
window.addEventListener('yardplan:design', () => { if (applying || !cur || document.body.dataset.mode !== 'pro' || !window.planApi?.ready?.()) return;
  cur.design = window.planApi.serialize(); touch(); if (cur.step === 2) planPreview(); clearTimeout(desT); desT = setTimeout(() => window.proApi?.refresh?.(), 250); });

// step 3: bid
let shown = null;
function tick(el, to) { const from = shown; shown = to; if (from == null || from === to || reduced()) { el.textContent = money(to); return; }
  const t0 = performance.now(); const f = t => { const k = Math.min(1, (t - t0) / 400), e = 1 - Math.pow(1 - k, 3); el.textContent = money(from + (to - from) * e); if (k < 1) requestAnimationFrame(f); }; requestAnimationFrame(f); }
let jobReady = false;
// One source of truth for a job's total (overnight B1): only the bid priced for THIS job's design + ZIP book is synced.
function syncTotal(v) { if (!jobReady || applying || building) return; if (cur && v && (cur.total !== v.total || cur.tier !== v.tier)) { cur.total = v.total; cur.tier = v.tier; cur.bidSnapshot = { tier: v.tier, total: v.total, at: Date.now() }; save(); } }
function renderBidView() {
  const v = window.proApi?.bidView?.(); if (!v || !cur) { $('#jHero').textContent = '…'; return; }
  $('#jBidFor').textContent = cur.client.name ? cur.client.name + (cur.title ? ' · ' + cur.title : '') : cur.title || 'This job';
  tick($('#jHero'), v.total);
  const fit = $('#jFit'); fit.className = 'jfit' + (v.budget ? v.total <= v.budget ? ' is-ok' : ' is-over' : '');
  fit.textContent = v.budget ? v.total <= v.budget ? `Fits the ${money(v.budget)} budget` : `${money(v.total - v.budget)} over the ${money(v.budget)} budget` : 'Add a budget in step 1 to see if it fits.';
  renderBidIrr(v);
  $('#jLines').innerHTML = v.lines.filter(l => !String(l.key).startsWith('irr-')).map(l => `<li><button type="button" class="jline" data-line="${esc(l.key)}"><span class="jline__d">${esc(l.description.replace(/ \(.*\)$/, ''))}<small>${l.qty} ${esc(l.unit)}</small></span><span class="jline__t">${money(l.total)}</span>${ico('chevron-right', 'ico jline__c')}</button></li>`).join('') || '<li class="muted">No lines yet. Pick a look or edit the plan.</li>';
  $('#jSums').innerHTML = v.sums.map(([k, n]) => `<li class="jsum"><span>${k}</span><span>${money(n)}</span></li>`).join('') + `<li class="jsum jsum--t"><span>${esc(v.name)} total</span><span>${money(v.total)}</span></li>`;
  $('#jProfit').textContent = `Profit ${money(v.profit.netProfit)} · ${v.profit.netMarginPct}% margin · break-even ${money(v.profit.breakEven)}`;
  syncTotal(v);
}
// Irrigation section of the bid: on by default (drip) when the job has beds or lawn; its lines flow into the bid and proposal scope.
const IRRN = { drip: 'Drip', spray: 'Sprinklers', none: 'None' };
function renderBidIrr(v) {
  const el = $('#jIrr'); if (!el) return; const m = cur.design?.irrigation || 'none', P = window.proApi.take()?.irrigation;
  const L = v.lines.filter(l => String(l.key).startsWith('irr-')), tot = L.reduce((a, l) => a + l.total, 0), hrs = L.reduce((a, l) => a + (l.laborHours || 0), 0);
  const zones = P?.hydrozones || [], em = zones.reduce((a, z) => a + (z.emitterCount || 0), 0), hd = zones.reduce((a, z) => a + (z.headCount || 0), 0);
  el.innerHTML = `<div class="bidirr__top"><h2>Irrigation</h2><span class="jline__t">${m === 'none' ? 'Not included' : money(tot)}</span></div>
   <div class="seg3" role="radiogroup" aria-label="Irrigation" id="jIrrSeg">${['drip', 'spray', 'none'].map(k => `<button type="button" role="radio" aria-checked="${m === k}" data-irr="${k}">${IRRN[k]}</button>`).join('')}</div>
   ${m === 'none' || !P ? `<p class="footnote">${m === 'none' ? 'No irrigation in this bid or the proposal.' : 'Nothing to water in this plan yet.'}</p>` : `
   <div class="bidirr__stats"><div><b>${zones.length}</b><span>zones</span></div><div><b>${P.valveCount}</b><span>valves</span></div><div><b>${em || hd}</b><span>${em ? 'emitters' : 'heads'}${em && hd ? ` + ${hd} heads` : ''}</span></div><div><b>${P.equipment.controller.stations}</b><span>controller stations</span></div><div><b>${Math.round(hrs * 10) / 10}</b><span>labor hours</span></div></div>
   <ul class="irr__zones">${zones.map((z, i) => `<li><i style="background:${z.color}"></i><div><b>Zone ${i + 1}</b><span>${esc(z.name)}</span></div></li>`).join('')}</ul>
   <ul class="jlines">${L.map(l => `<li><button type="button" class="jline" data-line="${esc(l.key)}"><span class="jline__d">${esc(l.description.replace(/ \(.*\)$/, '').replace(/ — .*$/, ''))}<small>${l.qty} ${esc(l.unit)}</small></span><span class="jline__t">${money(l.total)}</span>${ico('chevron-right', 'ico jline__c')}</button></li>`).join('')}</ul>
   <p class="footnote">Parts and labor are in the total above and in the proposal scope. Example prices; edit any line.</p>`}`;
  el.querySelectorAll('[data-irr]').forEach(b => b.onclick = async () => { if (!cur.design || b.dataset.irr === m) return; cur.design.irrigation = b.dataset.irr; touch(); applying = true; window.planApi.apply(cur.design); applying = false; await window.proApi.refresh(); renderBidView(); });
  el.onclick = e => { const b = e.target.closest('[data-line]'); if (b) openLine(b.dataset.line); };
}
window.addEventListener('yardplan:bid', () => { renderBook2(); const v = window.proApi?.bidView?.(); if (!building) syncTotal(v); else pendingSync = true;
  if (document.body.dataset.tab === 'job' && cur?.step === 3) renderBidView(); if (!building && document.body.dataset.tab === 'job' && cur?.step === 4) renderProposal(); });
let pendingSync = false;
// ZIP changed (async lookup) while a job is open: re-seed the ZIP price book and re-price, so bid, proposal and list agree.
let zipT2; window.addEventListener('yardplan:zone', () => { if (!cur || document.body.dataset.mode !== 'pro' || !state.zone) return; clearTimeout(zipT2); zipT2 = setTimeout(async () => { if (cur && !cur.lookPicked && (cur.step || 1) <= 2 && !cur.site && cur.styleId !== defaultLook()) { await buildFromLook(defaultLook()); if (cur.step === 2) renderLooks(); } window.proApi?.refresh?.(); }, 150); });
$('#jTakeBtn').onclick = () => openSheet('#takeSheet');
// line edit sheet
let lineKey = null;
$('#jLines').onclick = e => { const b = e.target.closest('[data-line]'); if (b) openLine(b.dataset.line); };
function openLine(key) {
  const v = window.proApi.bidView(), l = v.lines.find(x => x.key === key); if (!l) return; lineKey = key; const e = window.proApi.lineEntry(key);
  $('#lineT').textContent = l.description.replace(/ \(.*\)$/, '');
  $('#lineBody').innerHTML = `<div class="fgrid"><label class="field">Price per ${esc(e?.unit || l.unit)}<span class="inwrap"><em>$</em><input type="number" min="0" step="0.01" inputmode="decimal" id="lnCost" max="100000" value="${e ? e.unitCost : l.unitCost}"></span></label>
    ${e ? `<label class="field">Labor per ${esc(e.unit)}<span class="inwrap"><input type="number" min="0" step="0.01" inputmode="decimal" id="lnLab" value="${e.labor}"><em>${e.laborUnit === '$' ? '$' : 'h'}</em></span></label>` : ''}</div>
    <p class="jline-q">Quantity <b>${l.qty} ${esc(l.unit)}</b> <span class="muted">(from the plan)</span></p><p class="footnote">${ico('book-open')} Saves to your pricebook, so your next bids use it too.</p>`;
  openSheet('#lineSheet'); setTimeout(() => $('#lnCost')?.focus(), 50);
}
// Overnight B7: cap and sanity-check line prices (a $1e9 unit cost made a $113 billion bid).
let lineWarned = '';
$('#lineDone').onclick = () => { if (lineKey) { const c = $('#lnCost'), l = $('#lnLab'), uc = c ? +c.value : null, lb = l ? +l.value : null, ref = window.proApi.lineRef?.(lineKey);
    const bad = [uc, lb].some(x => x != null && (!isFinite(x) || x < 0 || x > 100000));
    let w = $('#lnWarn'); const warn = t => { if (!w) { w = document.createElement('p'); w.id = 'lnWarn'; w.className = 'error-text'; w.setAttribute('role', 'alert'); $('#lineBody').append(w); } w.textContent = t; };
    if (bad) return warn('▲ Enter a price between $0 and $100,000.');
    const k = ref?.unitCost > 0 && uc != null ? uc / ref.unitCost : 1, sig = lineKey + ':' + uc;
    if ((k > 10 || (k < 0.1 && uc > 0)) && lineWarned !== sig) { lineWarned = sig; return warn(`▲ $${uc.toLocaleString('en-US')} is ${k > 10 ? Math.round(k) + '× more than' : 'far below'} the usual $${ref.unitCost.toLocaleString('en-US')}. Tap Save again to keep it.`); }
    lineWarned = ''; window.proApi.editLine(lineKey, { unitCost: c ? c.value : null, labor: l ? l.value : null }); } $('#lineSheet').close(); };

// step 4: proposal (unchanged PDF from pro.js makeProposal, previewed with pdf.js)
let building = false, lastDoc = null, lastSig = '', pdfjsP = null;
const pdfjs = () => pdfjsP || (pdfjsP = import('./contractor/vendor/pdfjs/pdf.min.mjs').then(m => { m.GlobalWorkerOptions.workerSrc = new URL('./contractor/vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href; return m; }));
const sig = () => JSON.stringify([cur?.id, window.proApi?.bidView?.()?.total, window.proApi?.profile?.()?.tier, window.proApi?.profile?.()?.business, window.proApi?.profile?.()?.client, cur?.design && cur.updatedAt]);
async function renderProposal(force) {
  if (!cur || building) return; const s = sig(); sendNote();
  if (!force && s === lastSig && lastDoc) return; building = true; lastSig = s;
  const box = $('#jPages'); box.setAttribute('aria-busy', 'true'); if (!lastDoc) box.innerHTML = '<div class="jpage jpage--sk skeleton"></div><div class="jpage jpage--sk skeleton"></div><div class="jpage jpage--sk skeleton"></div>';
  try {
    const doc = await window.proApi.makeProposal(); lastDoc = doc; const n = doc.getNumberOfPages(), v = window.proApi.bidView();
    $('#jPMeta').innerHTML = `<b>${esc(v.name)}</b> · ${money(v.total)} · ${n} page${n > 1 ? 's' : ''} <button type="button" class="linkbtn" id="jOpenPdf">Open full PDF</button>`;
    $('#jOpenPdf').onclick = () => window.open(URL.createObjectURL(doc.output('blob')), '_blank', 'noopener');
    const lib = await pdfjs(), pdf = await lib.getDocument({ data: new Uint8Array(doc.output('arraybuffer')) }).promise, dpr = Math.min(2, devicePixelRatio || 1);
    const figs = [];
    for (let i = 1; i <= pdf.numPages; i++) { const pg = await pdf.getPage(i), vp0 = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale: 240 * dpr / vp0.width });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; c.setAttribute('aria-label', `Proposal page ${i}`); c.setAttribute('role', 'img'); await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      const f = document.createElement('figure'); f.className = 'jpage'; f.append(c); f.insertAdjacentHTML('beforeend', `<figcaption>Page ${i}</figcaption>`); figs.push(f); }
    box.replaceChildren(...figs); pdf.destroy?.();
  } catch (e) { console.error(e); box.innerHTML = `<p class="error-text">The preview couldn't be built: ${esc(e.message)}</p>`; lastSig = ''; }
  finally { building = false; box.removeAttribute('aria-busy'); if (pendingSync) { pendingSync = false; syncTotal(window.proApi?.bidView?.()); if (sig() !== lastSig && cur?.step === 4) setTimeout(() => renderProposal(), 0); } }
  if (sig() !== lastSig && cur?.step === 4 && document.body.dataset.tab === 'job') renderProposal();
}
function sendNote() { if (!cur) return; $('#jSendNote').innerHTML = cur.sentAt ? `${badge(cur.status)} Sent ${new Date(cur.sentAt).toLocaleDateString()}. When the client says yes, mark it signed or won from the ${ico('ellipsis')} menu.`
  : 'Opens your share sheet (Messages, Mail and more) with the PDF attached. Where sharing isn\'t available, it saves the PDF and copies a message for you. E-signature links need the signing server, which isn\'t connected in this beta.'; }
let afterBiz = false;
async function send() {
  const P = window.proApi.profile(); if (!P.business?.name) { openBiz(true); return; }
  const b = $('#jNext'); b.disabled = true;
  try {
    if (!lastDoc || sig() !== lastSig) await renderProposal(true);
    const doc = lastDoc, v = window.proApi.bidView(), first = (cur.client.name || '').split(' ')[0];
    const fn = `proposal-${(cur.client.name || 'client').replace(/[^\w-]+/g, '-')}.pdf`, blob = doc.output('blob'), file = new File([blob], fn, { type: 'application/pdf' });
    const text = `${first ? 'Hi ' + first + ', h' : 'H'}ere's your landscape proposal from ${P.business.name}: ${v.name} option, ${money(v.total)}. Reply with any questions.`;
    let how = 'download';
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Landscape proposal', text }); how = 'share'; } catch (e) { if (e.name === 'AbortError') return; throw e; } }
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fn; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 8000);
      try { await navigator.clipboard.writeText(text); how = 'copied'; } catch {} }
    if (cur.status === 'draft') cur.status = 'sent'; cur.sentAt = Date.now(); cur.sentTotal = v.total; cur.total = v.total; cur.tier = v.tier; touch(); sendNote();
    toast(how === 'share' ? 'Sent. The job is marked Sent.' : how === 'copied' ? 'PDF saved and message copied. Attach the PDF in your text or email. Marked Sent.' : 'PDF saved. Attach it in your text or email. Marked Sent.');
  } catch (e) { console.error(e); toast('Could not send: ' + e.message); }
  finally { b.disabled = false; }
}

// ---------- sheets ----------
function openSheet(sel) { const d = $(sel); $$('dialog[open]').forEach(x => x !== d && x.close()); if (!d.open) d.showModal(); }
$('#proMenuBtn').onclick = () => openSheet('#proMenuSheet');
$('#proMenuSheet').addEventListener('click', e => { const r = e.target.closest('[data-pm]'); if (!r) return; const k = r.dataset.pm; if (k === 'home') return;
  if (['book', 'biz', 'lic', 'backup', 'owner'].includes(k)) { ({ book: openBook, biz: () => openBiz(false), lic: () => openSheet('#licSheet'), backup: openBackup, owner: openOwner })[k](); return; }
  $('#proMenuSheet').close(); go(k); });
// pricebook (search over the pro.js table)
function openBook() { openSheet('#pbSheet'); filterBook(); }
function filterBook() { const q = ($('#pbSearch').value || '').trim().toLowerCase(); let n = 0;
  $$('#proBook tr').forEach(tr => { if (tr.querySelector('th')) { tr.hidden = !!q; return; } const hit = !q || tr.textContent.toLowerCase().includes(q); tr.hidden = !hit; if (hit) n++; });
  $('#pbEmpty').hidden = n > 0; }
function renderBook2() { if ($('#pbSheet').open) filterBook(); }
$('#pbSearch').oninput = filterBook;
// business profile (also asked at first send)
function openBiz(first) { afterBiz = !!first; $('#bizT').textContent = first ? 'Add your business' : 'Business profile';
  $('#bizLead').textContent = first ? "Add your business so clients know who it's from. You only do this once." : 'Shown on every proposal.';
  $('#bizDone').textContent = first ? 'Save and send' : 'Done'; openSheet('#bizSheet');
  if (first) setTimeout(() => $('#proProfile [data-p="business.name"]')?.focus(), 50); }
$('#bizDone').onclick = () => { $('#bizSheet').close(); lastSig = ''; if (afterBiz && window.proApi.profile().business?.name) { afterBiz = false; send(); } };
// job actions
function openJobActions() { if (!cur) return; $('[data-ja=signed]').hidden = !['sent', 'viewed'].includes(cur.status); $('[data-ja=draft]').hidden = cur.status === 'draft';
  $('[data-ja=won]').hidden = cur.status === 'won'; $('[data-ja=lost]').hidden = cur.status === 'lost'; $('#jaT').textContent = cur.client.name || 'Job'; openSheet('#jobActSheet'); }
$('#proPdf').addEventListener('click', () => setTimeout(() => $('#jobActSheet').close(), 0));
$('#jobActSheet').addEventListener('click', e => { const b = e.target.closest('[data-ja]'); if (!b || !cur) return; const a = b.dataset.ja; $('#jobActSheet').close();
  if (a === 'bid') return jstep(3);
  if (['signed', 'won', 'lost', 'draft', 'archive'].includes(a)) { cur.status = a === 'archive' ? 'archived' : a; if (a !== 'lost') delete cur.lostReason; touch(); if (a === 'lost') { sendNote(); openLost(); return; } sendNote(); toast(a === 'archive' ? 'Archived.' : `Marked ${STATUS[cur.status][0]}.`); if (a === 'archive') go('pro'); return; }
  if (a === 'dup') { const c = JSON.parse(JSON.stringify(cur)); const j = newJob({ ...c, id: uid(), status: 'draft', createdAt: Date.now(), updatedAt: Date.now(), sentAt: null, sentTotal: null, total: null, bidSnapshot: null, signId: null, followUps: null, lostReason: null, title: (c.title || c.client.name || 'Job') + ' (copy)', step: 1 }); jobs.unshift(j); save(); { const L = ls.get('yardplan.site.layers.' + c.id); if (L) { ls.set('yardplan.site.layers.' + j.id, L); siteLayers[j.id] = siteLayers[c.id]; } } toast('Duplicated.'); return openJob(j.id, 1); }
  if (a === 'delete') { if (!confirm(`Delete ${cur.client.name || 'this job'}? This can't be undone.`)) return; jobs = jobs.filter(j => j.id !== cur.id); try { localStorage.removeItem('yardplan.site.layers.' + cur.id); } catch {} delete siteLayers[cur.id]; cur = null; save(); toast('Job deleted.'); go('pro'); } });

// Run 5 (R5-2): "Add new lawn" is per job, stored on the design, so the homeowner estimate and the bid price the same thing.
window.addEventListener('yardplan:lawn', async e => { if (!cur || !cur.design) return; cur.design.includeLawn = !!e.detail; touch(); applying = true; window.planApi?.apply?.(cur.design); applying = false; await window.proApi?.refresh?.(); if (typeof renderBidView === 'function') renderBidView(); });
// ---------- v19: follow-up reminders (Austin #3) and lost reasons (Austin #4) ----------
let fuJob = null;
function openFollowUp(id) { const j = jobs.find(x => x.id === id); if (!j) return; fuJob = j; const f = followUpDue(j);
  const P = window.proApi?.profile?.() || {};
  $('#fuT').textContent = `Follow up with ${j.client.name || 'your client'}`;
  $('#fuLead').textContent = f ? `Sent ${f.days} days ago, no reply yet. Edit the message, then share it your usual way. Nothing is sent automatically.` : 'Edit the message, then share it your usual way.';
  $('#fuText').value = followUpText({ first: (j.client.name || '').trim().split(/\s+/)[0], sentAt: j.sentAt, total: j.sentTotal ?? j.total, business: P.business?.name || '' });
  $('#fuMsg').textContent = ''; openSheet('#fuSheet'); }
$('#fuShare').onclick = async () => { const j = fuJob; if (!j) return; const text = $('#fuText').value.trim(); if (!text) { $('#fuMsg').textContent = 'Add a message first.'; return; }
  let how = '';
  if (navigator.share) { try { await navigator.share({ title: 'Landscape proposal', text }); how = 'share'; } catch (e) { if (e.name === 'AbortError') return; } }
  if (!how) { try { await navigator.clipboard.writeText(text); how = 'copied'; } catch { $('#fuText').select(); $('#fuMsg').textContent = "Couldn't copy. Select the text and copy it yourself."; return; } }
  j.followUps = [...(Array.isArray(j.followUps) ? j.followUps : []), Date.now()]; j.updatedAt = Date.now(); save(); $('#fuSheet').close(); renderJobs();
  toast(how === 'share' ? 'Follow-up shared.' : 'Message copied. Paste it in your text or email.'); };
$('#fuSkip').onclick = () => { const j = fuJob; if (j) { j.followUps = [...(Array.isArray(j.followUps) ? j.followUps : []), Date.now()]; save(); renderJobs(); } $('#fuSheet').close(); toast('Reminder dismissed.'); };
function openLost() { $$('#lostReasons [data-lr]').forEach(b => b.setAttribute('aria-checked', String(cur?.lostReason === b.dataset.lr))); openSheet('#lostSheet'); }
$('#lostReasons').addEventListener('click', e => { const b = e.target.closest('[data-lr]'); if (!b || !cur) return; cur.lostReason = b.dataset.lr; touch(); $('#lostSheet').close(); toast(`Marked Lost · ${LOST_REASONS[b.dataset.lr]}.`); });
$('#lostSkip').onclick = () => { $('#lostSheet').close(); toast('Marked Lost.'); };
// ---------- backup / restore ----------
function openBackup() { const l = +ls.get(BKEY) || 0; $('#bkMeta').innerHTML = `<b>${jobs.length} job${jobs.length === 1 ? '' : 's'}</b> on this device · last backup ${l ? new Date(l).toLocaleString() : 'never'}`; openSheet('#backupSheet'); }
function backupData() { let prof = {}; try { prof = JSON.parse(ls.get('yardplan.pro.profile.v1')) || {}; } catch {}
  let book = null; try { book = JSON.parse(ls.get('yardplan.contractor.pricebook.v1')); } catch {}
  // Overnight C3: site plan layers (aerial/survey images) lived only in separate localStorage keys and were lost on restore.
  const layers = {}; for (const j of jobs) { const raw = ls.get('yardplan.site.layers.' + j.id); if (raw) { try { layers[j.id] = JSON.parse(raw); } catch { layers[j.id] = raw; } } else if (siteLayers[j.id]) layers[j.id] = siteLayers[j.id]; }
  return { schema: 'yardplan.backup.v1', exportedAt: new Date().toISOString(), jobs, business: prof.business || {}, pricebook: book, siteLayers: layers, retentionDays: ls.get('yardplan.esign.retentionDays') }; }
$('#bkExport').onclick = () => { const data = backupData(), a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
  a.download = `yardplan-jobs-${new Date().toISOString().slice(0, 10)}.json`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 8000);
  ls.set(BKEY, Date.now()); openBackup(); $('#bkMsg').textContent = `Saved ${data.jobs.length} job${data.jobs.length === 1 ? '' : 's'} to a file. Keep it somewhere safe (Files, iCloud, Drive or email it to yourself).`; };
$('#bkImport').onclick = () => $('#bkFile').click();
$('#bkFile').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (f) $('#bkMsg').textContent = restore(await f.text()); };
// Run 5 (R5-1/R5-4): a backup file is untrusted input. Ids are validated (the uid() charset; an id was rendered into the
// Jobs list unescaped, so a crafted file ran script), every field is coerced to its type, malformed designs are dropped,
// __proto__/constructor keys are ignored and oversized files are refused before JSON.parse.
const ID_RE = /^[\w-]{1,64}$/, BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']), MAX_BACKUP = 20 * 1024 * 1024;
const str = (x, n = 200) => (typeof x === 'string' || typeof x === 'number') ? String(x).slice(0, n) : '';
const plainObj = o => o && typeof o === 'object' && !Array.isArray(o);
function cleanJob(j) {
  if (!plainObj(j) || typeof j.id !== 'string' || !ID_RE.test(j.id) || BAD_KEYS.has(j.id)) return null;
  const c = plainObj(j.client) ? j.client : {};
  const out = newJob();
  for (const [k, v] of Object.entries(j)) if (!BAD_KEYS.has(k) && !(k in out) && (v === null || ['string', 'number', 'boolean'].includes(typeof v))) out[k] = typeof v === 'string' ? v.slice(0, 2000) : v;
  Object.assign(out, { id: j.id, client: { name: str(c.name), email: str(c.email), phone: str(c.phone, 40), address: str(c.address), zip: /^\d{5}$/.test(str(c.zip)) ? str(c.zip) : '' },
    title: str(j.title), budget: str(j.budget, 60), status: Object.hasOwn(STATUS, j.status) ? j.status : 'draft', step: [1, 2, 3, 4].includes(+j.step) ? +j.step : 1,
    tier: ['good', 'better', 'best'].includes(j.tier) ? j.tier : 'good', styleId: typeof j.styleId === 'string' && ID_RE.test(j.styleId) ? j.styleId : null,
    createdAt: +j.createdAt || Date.now(), updatedAt: +j.updatedAt || Date.now(), sentAt: +j.sentAt || null,
    total: Number.isFinite(+j.total) && j.total !== null && j.total !== '' ? +j.total : null, sentTotal: Number.isFinite(+j.sentTotal) && j.sentTotal != null && j.sentTotal !== '' ? +j.sentTotal : null,
    signId: typeof j.signId === 'string' ? j.signId.slice(0, 100) : null, lookPicked: !!j.lookPicked,
    followUps: Array.isArray(j.followUps) ? j.followUps.map(Number).filter(n => n > 0).slice(0, 3) : null, lostReason: Object.hasOwn(LOST_REASONS, j.lostReason) && j.status === 'lost' ? j.lostReason : null,
    design: plainObj(j.design) && Array.isArray(j.design.items) && plainObj(j.design.yard) && j.design.items.every(plainObj) ? JSON.parse(JSON.stringify(j.design), (k, v) => BAD_KEYS.has(k) ? undefined : v) : null,
    site: plainObj(j.site) ? JSON.parse(JSON.stringify(j.site), (k, v) => BAD_KEYS.has(k) ? undefined : v) : null,
    bidSnapshot: plainObj(j.bidSnapshot) ? JSON.parse(JSON.stringify(j.bidSnapshot), (k, v) => BAD_KEYS.has(k) ? undefined : v) : null });
  if (out.design && typeof out.design.includeLawn !== 'boolean') delete out.design.includeLawn;
  return out;
}
function restore(txt) {
  if (typeof txt !== 'string' || txt.length > MAX_BACKUP) return "That file is too big to be a Yardplan backup (over 20 MB).";
  let d; try { d = JSON.parse(txt); } catch { return "That file isn't a Yardplan backup."; }
  // Overnight C3: accept v1 and older files that only have a jobs array (no schema / unknown schema with jobs).
  if (!plainObj(d) || !Array.isArray(d.jobs)) return "That file isn't a Yardplan backup.";
  let added = 0, updated = 0, layersN = 0, skipped = 0; const seen = new Set();
  for (const raw of d.jobs) { const j = cleanJob(raw); if (!j || seen.has(j.id)) { skipped++; continue; } seen.add(j.id); const i = jobs.findIndex(x => x.id === j.id);
    if (i < 0) { jobs.push(j); added++; } else if ((j.updatedAt || 0) > (jobs[i].updatedAt || 0)) { jobs[i] = j; updated++; } }
  if (plainObj(d.siteLayers)) {
    for (const [id, L] of Object.entries(d.siteLayers)) {
      if (!ID_RE.test(id) || BAD_KEYS.has(id) || !jobs.some(j => j.id === id)) continue;
      let obj; try { obj = typeof L === 'string' ? JSON.parse(L) : L; } catch { continue; } if (!plainObj(obj)) continue;
      if (ls.set('yardplan.site.layers.' + id, JSON.stringify(obj))) { siteLayers[id] = obj; layersN++; }
    }
  }
  save();
  // Run 5 (R5-6): settings used to be dropped silently. Apply them when this device has none; otherwise say they were kept.
  const P = window.proApi?.profile?.() || {}; let extra = '';
  if (plainObj(d.business) && d.business.name) { if (!P.business?.name) { window.proApi?.setBusiness?.(d.business); extra = ' Business profile restored.'; } else extra = ' Business profile on this device kept (the file\'s was not applied).'; }
  if (plainObj(d.pricebook)) { if (!ls.get('yardplan.contractor.pricebook.v1')) { ls.set('yardplan.contractor.pricebook.v1', JSON.stringify(d.pricebook)); extra += ' Pricebook restored (reload to use it).'; } else extra += ' Pricebook on this device kept (the file\'s was not applied).'; }
  const rd = parseInt(d.retentionDays, 10);
  if (rd > 0 && rd <= 3650) { if (!ls.get('yardplan.esign.retentionDays')) { ls.set('yardplan.esign.retentionDays', String(rd)); extra += ' Retention setting restored.'; } else if (ls.get('yardplan.esign.retentionDays') !== String(rd)) extra += ' Retention setting on this device kept.'; }
  if (layersN) extra += ` ${layersN} site plan image${layersN === 1 ? '' : 's'} restored.`;
  if (skipped) extra += ` ${skipped} entr${skipped === 1 ? 'y was' : 'ies were'} unreadable and skipped.`;
  renderJobs(); if ($('#backupSheet').open) openBackup();
  return `Restored: ${added} new job${added === 1 ? '' : 's'}${updated ? `, ${updated} updated` : ''}. Nothing was deleted.${extra}`;
}

// ---------- owner unlock ----------
let ownerOk = false;
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
async function ownerTag(t) { const k = await crypto.subtle.importKey('raw', new TextEncoder().encode('yp-owner-v2:' + OWNER.hash), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(t))); }
async function verifyOwner() { let ok = false; try { const [t, tag] = String(ls.get(OKEY) || '').split('.'); ok = /^[0-9a-f]{32}$/.test(t || '') && /^[0-9a-f]{64}$/.test(tag || '') && tag === await ownerTag(t); } catch {} ownerOk = ok; return ok; }
async function mintOwner() { const t = hex(crypto.getRandomValues(new Uint8Array(16))); ls.set(OKEY, t + '.' + await ownerTag(t)); return verifyOwner(); }
const isOwner = () => ownerOk;
async function checkPass(p) { const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(p), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(OWNER.salt.match(/../g).map(h => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: OWNER.iter }, k, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('') === OWNER.hash; }
function ownerUi() { const on = isOwner(); document.documentElement.dataset.owner = on ? '1' : ''; $('#ownerBadge').hidden = !on;
  $('#pmOwner b').textContent = on ? 'Owner mode' : 'Owner sign-in'; $('#pmOwnerS').textContent = on ? 'On: everything unlocked on this device' : 'Unlock everything on this device'; }
function openOwner() {
  const on = isOwner();
  $('#owBody').innerHTML = on ? `<p class="ownerline">${ico('badge-check')}<b>Owner mode is on</b> for this device.</p><ul class="owlist"><li>Every feature unlocked</li><li>No lead fees in Leads</li><li>Pro review queue in Leads</li></ul>
    <p class="footnote">Your jobs are still saved only in this browser. Use Back up jobs to keep a copy. Signing in across phones needs the Yardplan server (not connected in this beta).</p><button class="btn btn--secondary btn--block" type="button" id="owOff">Turn off owner mode</button>`
    : `<form id="owForm" class="stack"><label class="field">Owner passphrase<input class="input" type="password" id="owPass" autocomplete="current-password" required></label><p class="error-text" id="owErr" role="alert" hidden></p>
    <button class="btn btn--primary btn--block btn--lg" type="submit" id="owGo">Unlock</button></form><p class="footnote">For the Yardplan owner. Unlocks every feature on this device (no lead fees, review queue). This beta gate is device-local only — it is not server auth, and nothing paid is charged through it. Your jobs stay on this device; real sign-in across devices needs the Yardplan server.</p>`;
  openSheet('#ownerSheet');
  if (on) $('#owOff').onclick = () => { try { localStorage.removeItem(OKEY); } catch {} ownerOk = false; ownerUi(); openOwner(); toast('Owner mode off.'); };
  else $('#owForm').onsubmit = async e => { e.preventDefault(); const b = $('#owGo'); b.disabled = true; b.textContent = 'Checking…';
    let ok = false; try { ok = await checkPass($('#owPass').value); } catch (er) { console.warn(er); }
    b.disabled = false; b.textContent = 'Unlock';
    if (!ok) { const m = $('#owErr'); m.hidden = false; m.textContent = "That passphrase didn't match."; return; }
    await mintOwner(); ownerUi(); openOwner(); toast('Owner mode on. Everything is unlocked.'); };
}
window.ownerApi = { isOwner, check: checkPass, verify: verifyOwner };
ownerUi(); verifyOwner().then(ownerUi);
addEventListener('storage', e => { if (e.key === OKEY) verifyOwner().then(ownerUi); });

// ---------- appearance (both menus) ----------
function theme(t) { if (t === 'light' || t === 'dark') { document.documentElement.dataset.theme = t; ls.set('yardplan.theme', t); } else { delete document.documentElement.dataset.theme; try { localStorage.removeItem('yardplan.theme'); } catch {} }
  $$('[data-theme-set]').forEach(b => { const on = b.dataset.themeSet === (t || 'system'); b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; }); }
document.addEventListener('click', e => { const b = e.target.closest('[data-theme-set]'); if (b) theme(b.dataset.themeSet); });
// Run 4 (R3-3 #4): APG radio pattern on Appearance only. Arrows/Home/End move focus and check (wrapping); Tab lands on the checked one.
$$('[data-appear]').forEach(g => g.addEventListener('keydown', e => { const k = e.key, r = [...g.querySelectorAll('[data-theme-set]')], i = r.indexOf(document.activeElement); if (i < 0) return;
  const n = k === 'ArrowRight' || k === 'ArrowDown' ? (i + 1) % r.length : k === 'ArrowLeft' || k === 'ArrowUp' ? (i - 1 + r.length) % r.length : k === 'Home' ? 0 : k === 'End' ? r.length - 1 : -1;
  if (n < 0) return; e.preventDefault(); r[n].focus(); r[n].click(); }));
theme(ls.get('yardplan.theme') || 'system');

window.jobsApi = { jobs: () => jobs, current: () => cur, open: openJob, create: createJob, step: jstep, send, render: renderJobs, renderProposal, restore, backupData, isOwner };
// ---------- start ----------
renderJobs();
const hm = /^#\/jobs\/([\w-]+)/.exec(location.hash);
if (hm && jobs.some(j => j.id === hm[1])) addEventListener('DOMContentLoaded', () => setTimeout(() => openJob(hm[1]), 0));
