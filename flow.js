import { designOnSite } from './siteplan/core.js';
// Homeowner flow (v15, per yardplan-research/simplify-v15.md): 3 steps, one primary action per screen.
// 1 Your yard (photo + ZIP) → 2 Pick a look (style + budget) → 3 Your new yard (render, price, rows → sheets).
// Pro tools (site plan, photo calibration, materials, measurements, water pressure, MWELO) live in contractor mode only.
// Classic globals: state, PLANTS, PLANT_SIZE, STYLES, esc, go, fits.
const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);
const HAS_RENDER = !!window.YARDPLAN_RENDER_URL;
const SAMPLE_RENDER = 'render/assets/sample-real-render.jpg';
const F = { irrigation: ['drip','spray'].includes(localStorage.getItem('yardplan.irrigation')) ? localStorage.getItem('yardplan.irrigation') : 'none', step: 1, photo: false, sample: false, style: '', stylePicked: false, plants: [], ground: '', plan: null, mode: localStorage.getItem('yardplan.mode.who') || 'diy', saved: false, savedId: null,
  budget: +localStorage.getItem('yardplan.budget') || 10000, tier: null, manual: null, edits: null, utility: localStorage.getItem('yardplan.utility') || '', turfSf: +localStorage.getItem('yardplan.turfSf') || 0,
  render: null, reopened: null };
const flow = $('#flow'), next = $('#fNext'), back = $('#fBack');
const money = n => '$' + Math.round(+n || 0).toLocaleString('en-US');
const moneyK = n => n >= 1000 ? '$' + (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : money(n);
const NAME = { mediterranean: 'Mediterranean', xeriscape: 'Low-water', modern: 'Modern', cottage: 'Cottage', prairie: 'Native meadow', japanese: 'Japanese', woodland: 'Woodland', formal: 'Formal', tropical: 'Tropical' };
const MAIN6 = ['mediterranean', 'xeriscape', 'modern', 'cottage', 'prairie', 'japanese'], MORE3 = ['woodland', 'formal', 'tropical'];
const styleName = id => NAME[id || F.style] || (STYLES.find(s => s.id === (id || F.style))?.name || '').split(' /')[0];
const SHORT = { modern: 'Clean lines, grasses, gravel', cottage: 'Soft, colorful, full of flowers', xeriscape: 'Big texture, little water', woodland: 'Shady, layered, natural', japanese: 'Calm, mossy, stone and maple', prairie: 'Native grasses and wildflowers', mediterranean: 'Silvery, fragrant, sun-loving', formal: 'Clipped hedges and symmetry', tropical: 'Big leaves, bold color' };
const place = () => state.place ? `${state.place.city}, ${state.place.st}` : '';
const near = () => state.place ? `near ${state.place.city}` : 'where you live';
window.toast = (...a) => toast(...a);
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 4000); }
// ---------- ZIP → state (offline, Census ZIP3 majority state) ----------
let Z3 = null; import('./marketplace/data/zip3-state.js').then(m => { Z3 = m.zip3ToState; if (F.step === 2) renderStyles(); }).catch(e => console.warn(e));
const usState = () => state.place?.st || (state.zip && Z3 ? Z3[state.zip.slice(0, 3)] : '') || '';
function defaultStyleFor(st) { return ['CA', 'NV', 'AZ'].includes(st) ? 'mediterranean' : ['TX', 'CO', 'NM', 'UT'].includes(st) ? 'xeriscape' : 'cottage'; }
// ---------- before/after slider ----------
function slider(fig) {
  const h = fig.querySelector('.ba__handle'); let pos = 50;
  const set = v => { pos = Math.max(0, Math.min(100, v)); fig.style.setProperty('--pos', pos + '%'); h.setAttribute('aria-valuenow', Math.round(pos)); h.setAttribute('aria-valuetext', `${Math.round(100 - pos)}% after`); };
  const at = e => { const r = fig.getBoundingClientRect(); set((e.clientX - r.left) / r.width * 100); };
  fig.addEventListener('pointerdown', e => { if (e.target.closest('button,a')) return; fig.setPointerCapture(e.pointerId); at(e); fig.onpointermove = at; });
  fig.addEventListener('pointerup', () => fig.onpointermove = null);
  h.addEventListener('keydown', e => { const d = e.shiftKey ? 20 : 5; if (e.key === 'ArrowLeft') set(pos - d); else if (e.key === 'ArrowRight') set(pos + d); else if (e.key === 'Home') set(0); else if (e.key === 'End') set(100); else return; e.preventDefault(); });
  set(50); return set;
}
slider($('#lBA'));
// ---------- step machine (3 steps) ----------
const prog = $('#prog');
function step(n) {
  n = Math.max(1, Math.min(3, +n || 1)); const from = F.step; F.step = n; flow.dataset.step = n; document.body.dataset.step = n;
  if (from === 1 && n > 1) localStorage.setItem('yardplan.seen', '1');
  if (n !== 3) cancelRender();
  $$('#flow .step').forEach(s => s.hidden = +s.dataset.step !== n);
  prog.setAttribute('aria-valuenow', n); prog.setAttribute('aria-label', `Step ${n} of 3`);
  $$('#prog li').forEach(li => { const s = +li.dataset.s; li.classList.toggle('is-done', s < n); li.classList.toggle('is-current', s === n); });
  $('#stepSr').textContent = `Step ${n} of 3`;
  back.hidden = n === 1; $('#hero1').hidden = n !== 1 || !!localStorage.getItem('yardplan.seen');
  if (n === 2) renderStyles(); if (n === 3) renderResult();
  update(); const h = $(`#flow .step[data-step="${n}"] h1:not(.display)`) || $(`#flow .step[data-step="${n}"] h1`); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } window.scrollTo({ top: 0 });
}
const hasPhoto = () => F.photo || !!window.overlayApi?.hasPhoto?.();
function update() {
  const n = F.step; let label = 'Continue', ok = true, help = '', note = '';
  if (n === 1) { ok = hasPhoto() && !!state.zone; help = !hasPhoto() ? 'Add a photo to continue' : !state.zone ? (state.zip && !$('#zoneManual').hidden ? 'Pick your zone to continue' : 'Add your ZIP to continue') : '';
    note = 'By tapping Continue, you confirm you took this photo or have permission to use it.'; }
  if (n === 2) { ok = !!F.style; label = 'See my yard'; note = 'About 30 seconds'; }
  if (n === 3) { const R = F.render; label = R?.state === 'failed' ? 'Try again' : F.saved ? 'Share' : 'Save my plan'; }
  next.setAttribute('aria-disabled', String(!ok)); next.classList.toggle('is-disabled', !ok); next.textContent = label;
  $('#fHelp').textContent = help; $('#fHelp').hidden = !help; $('#fNote').textContent = note; $('#fNote').hidden = !note;
  const pr = $('#fPrice'); pr.hidden = n !== 3 || !F.plan; if (n === 3 && F.plan) pr.innerHTML = `<small>About</small>${money(F.plan.total)}`;
}
next.onclick = async () => {
  if (next.getAttribute('aria-disabled') === 'true') { if (F.step === 1) (hasPhoto() ? $('#zip') : $('#fDrop')).focus(); return; }
  const n = F.step;
  if (n === 1) { F.consentAt = new Date().toISOString(); localStorage.setItem('yardplan.photoConsent', F.consentAt); }
  if (n === 2) { F.edits = null; F.tier = null; F.manual = null; F.plants = []; F.ground = ''; F.reopened = null; F.saved = false; F.savedId = null; F.placed = false; }
  if (n === 3) { if (F.render?.state === 'failed') return startRender(true); if (F.saved) return share(); return savePlan(); }
  step(n + 1);
};
back.onclick = () => step(F.step - 1);
window.addEventListener('yardplan:zone', () => { update(); if (F.step === 2) renderStyles(); });
// ---------- 1 Your yard ----------
$('#fPhoto').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  if (!/^image\//.test(f.type) && !/\.(heic|heif|jpe?g|png|webp)$/i.test(f.name)) { $('#fDropTxt').textContent = "That file isn't a photo. Try a JPG, PNG or HEIC."; return; }
  $('#fDropTxt').textContent = 'Getting your photo ready…';
  try { const b = await window.overlayApi.loadFile(f); setPhoto(URL.createObjectURL(b)); F.sample = false; F.placed = false; }
  catch (err) { $('#fDropTxt').textContent = "We couldn't open that photo. Try another one."; }
  update();
};
function setPhoto(url) { F.photo = true; const d = $('#fDrop'); d.style.backgroundImage = `url("${url}")`; d.classList.add('has'); $('#fDropTxt').textContent = 'Change photo'; d.querySelector('b').textContent = 'Photo added'; }
// ZIP: auto-lookup at 5 digits (debounced), no button. app.js #zipForm does the lookup and shows "City, ST · Zone".
let zipT; $('#zip').addEventListener('input', () => { const v = $('#zip').value.replace(/\D/g, '').slice(0, 5); if (v !== $('#zip').value) $('#zip').value = v; clearTimeout(zipT); if (v.length === 5) zipT = setTimeout(() => { if (v !== state.zip || !state.zone) $('#zipForm').requestSubmit(); }, 250); });
$('#fAddrOpen').onclick = () => { const b = $('#fAddrBox'), on = b.hidden; b.hidden = !on; $('#fAddrOpen').setAttribute('aria-expanded', String(on)); if (on) $('#fAddr').focus(); };
$('#fAddrGo').textContent = 'Find';
$('#fAddrGo').onclick = async () => {
  const q = $('#fAddr').value.trim(); if (q.length < 5) return; const m = $('#fAddrMsg'); m.textContent = 'Finding your yard from above… up to a minute';
  try { const g = await window.overlayApi.geocode(q); const zip = (/(\d{5})(?:-\d{4})?\s*$/.exec(g.label || '') || [])[1];
    if (zip && zip !== state.zip) { $('#zip').value = zip; $('#zipForm').requestSubmit(); }
    await window.overlayApi.loadNaip(q); setPhoto(window.overlayApi.imageUrl()); F.sample = false; F.placed = false; m.textContent = `Using an aerial view of ${g.label.split(',')[0]}.`; F.addr = { q, lat: g.lat, lon: g.lon, label: g.label }; $('#fSiteRow').hidden = false; update();
  } catch (err) { m.textContent = "We couldn't find that address. Try adding the city and state."; }
};
$('#lSample').onclick = async () => {
  const b = await (await fetch('render/assets/yard-before.jpg')).blob(); await window.overlayApi.loadFile(new File([b], 'sample-yard.jpg', { type: 'image/jpeg' }));
  F.sample = true; F.placed = false; setPhoto('render/assets/yard-before.jpg');
  if (!state.zone || state.zip !== '95814') { $('#zip').value = '95814'; $('#zipForm').requestSubmit(); }
  await new Promise(r => { const t = setInterval(() => { if (state.zone) { clearInterval(t); r(); } }, 100); setTimeout(() => { clearInterval(t); r(); }, 5000); });
  F.style = 'xeriscape'; F.stylePicked = true; localStorage.setItem('yardplan.style', F.style); F.plants = []; F.ground = ''; F.tier = null; F.manual = null; F.saved = false; F.savedId = null; F.reopened = null;
  step(3);
};
// ---------- 2 Pick a look ----------
let moreOpen = false;
function renderStyles() {
  const avail = id => PLANTS.filter(p => p.styles.includes(id) && fits(p)).length >= 3;
  if (!F.stylePicked || !avail(F.style)) { let d = defaultStyleFor(usState()); if (!avail(d)) d = [...MAIN6, ...MORE3].find(avail) || ''; F.style = d; if (d) localStorage.setItem('yardplan.style', d); }
  if (MORE3.includes(F.style)) moreOpen = true;
  const ids = moreOpen ? [...MAIN6, ...MORE3] : MAIN6;
  $('#fStyles').innerHTML = ids.map(id => { const ok = avail(id), on = F.style === id;
    return `<button class="card card--interactive fsc${on ? ' card--selected' : ''}" type="button" role="radio" aria-checked="${on}" data-id="${id}" ${ok ? '' : 'disabled'}><img class="card__media" src="img/styles/${id}-800.webp" srcset="img/styles/${id}-800.webp 800w, img/styles/${id}-1600.webp 1600w" sizes="(min-width: 900px) 300px, 50vw" alt="" loading="lazy" width="800" height="600"><span class="card__body"><b class="card__title">${esc(styleName(id))}</b><span class="footnote">${ok ? esc(SHORT[id] || '') : 'Few plants grow here'}</span><span class="fsc__cost footnote" aria-live="polite">${ok ? '<span class="skeleton skeleton--text" style="width:6ch;display:inline-block"></span>' : ''}</span></span><i class="tick" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></i></button>`; }).join('');
  $('#fMore').hidden = moreOpen; $('#fMore').setAttribute('aria-expanded', String(moreOpen));
  $('#fStyleLead').textContent = `You can change it later. Plants are picked to grow well ${near()}.`;
  setBudget(F.budget); setWho(F.mode); update();
}
$('#fMore').onclick = () => { moreOpen = true; renderStyles(); $('#fStyles [data-id="woodland"]')?.focus(); };
$('#fStyles').onclick = e => { const b = e.target.closest('[data-id]'); if (!b || b.disabled) return; if (F.style !== b.dataset.id) { F.style = b.dataset.id; F.plants = []; F.ground = ''; }
  F.stylePicked = true; localStorage.setItem('yardplan.style', F.style); $$('#fStyles .fsc').forEach(x => { const on = x === b; x.classList.toggle('card--selected', on); x.setAttribute('aria-checked', on); }); update(); };
// ---------- budget ----------
const BMIN = 1000, BMAX = 50000, toT = b => Math.round(100 * Math.log(b / BMIN) / Math.log(BMAX / BMIN)), fromT = t => { const v = BMIN * Math.pow(BMAX / BMIN, t / 100); return v < 10000 ? Math.round(v / 250) * 250 : Math.round(v / 1000) * 1000; };
function setBudget(b) {
  F.budget = Math.max(500, Math.min(250000, Math.round(+b || 0))); localStorage.setItem('yardplan.budget', F.budget);
  $$('#bPresets [data-b]').forEach(c => c.setAttribute('aria-checked', String(+c.dataset.b === F.budget)));
  const r = $('#adjRange'); if (r) { r.value = toT(Math.min(BMAX, Math.max(BMIN, F.budget))); r.style.setProperty('--p', r.value + '%'); $('#adjBudgetVal').textContent = money(F.budget) + (F.budget >= BMAX ? '+' : ''); }
  scheduleStyleCosts();
}
function setWho(m) { F.mode = m; localStorage.setItem('yardplan.mode.who', m); $('#bWho').firstChild.textContent = m === 'diy' ? 'Doing it yourself · ' : 'Hiring a pro · ';
  $$('#adjWho [data-m]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.m === m))); scheduleStyleCosts(); }
$('#bWho').innerHTML = 'Doing it yourself · <button type="button" class="linkbtn" id="bWhoBtn">Change</button>';
$('#bWhoBtn').onclick = () => setWho(F.mode === 'diy' ? 'pro' : 'diy');
$('#bPresets').onclick = e => { const c = e.target.closest('[data-b]'); if (c) setBudget(+c.dataset.b); };
let BF = null, REB = null; const loadCostMods = () => Promise.all([import('./contractor/budget-fit.js'), import('./contractor/data/rebates.js')]).then(([m, r]) => (BF = m, REB = r.REBATE_RULES, m));
loadCostMods().catch(e => console.warn(e));
const CATALOG = () => ({ plants: PLANTS, plant3d: PLANT_SIZE });
const bookOrThrow = () => { const b = window.proApi?.book?.(); if (!b) throw new Error('no price book'); return b; };
// Lawn being taken out: what the user typed, else the new beds and hardscape area (assumes they replace grass).
const turfEstimate = d => Math.round((d?.items || []).filter(i => !['plant', 'lawn', 'grade', 'wall'].includes(i.kind)).reduce((a, i) => a + (+i.w || 0) * (+i.d || 0), 0));
const turfSf = d => F.turfSf || turfEstimate(d || F.base || F.design);
async function priceDesign(design, turfFrom = design === F.design ? F.base : design) {
  const m = BF || await loadCostMods(); if (window.proApi?.bookReady) await window.proApi.bookReady(); const book = bookOrThrow();
  const e = m.homeownerEstimate(design, book, { catalog: CATALOG(), zip: state.zip, utility: F.utility || undefined, turfSf: turfSf(turfFrom) });
  const plants = e.diy.lines.filter(l => String(l.key).startsWith('plant:')).reduce((a, l) => a + l.amount, 0);
  // receipt-limited programs can't pay more than what's spent (DIY receipts = materials and plants)
  const spend = F.mode === 'diy' ? e.diy.total : e.pro.total, ts = turfSf(turfFrom);
  const rebate = ts && state.zip ? m.computeRebate({ zip: state.zip, utility: F.utility || undefined, turfSf: ts, eligibleExpenses: spend }) : null;
  return { est: e, t: e.takeoff, bid: e.bid, diy: e.diy.total, pro: e.pro.total, plantsDiy: plants, materialsDiy: e.diy.total - plants, rebate };
}
const totalFor = (p, m = F.mode) => m === 'diy' ? p.diy : p.pro;
const fitReq = (design, budget = F.budget) => ({ design, book: bookOrThrow(), catalog: CATALOG(), budget, mode: F.mode === 'diy' ? 'diy' : 'pro', zip: state.zip, utility: F.utility || undefined, existing: { turfSf: turfSf(design) } });
// A fit result -> per-item edits on the designed plan (item replaced, or null = left out / phase 2)
const editsOf = fit => Object.fromEntries(fit.selections.filter(x => x.lever !== 'designed').map(x => [x.itemIndex, x.item ? { ...x.item } : null]));
const applyEdits = (base, edits) => !edits ? base : { ...base, items: base.items.map((it, i) => i in edits ? edits[i] : it).filter(Boolean) };
let costT; function scheduleStyleCosts() { clearTimeout(costT); costT = setTimeout(styleCosts, 150); }
async function styleCosts() {
  if (F.step !== 2 || !window.proApi?.book?.()) { if (F.step === 2) costT = setTimeout(styleCosts, 400); return; }
  for (const card of $$('#fStyles .fsc:not([disabled])')) { const id = card.dataset.id;
    try { const base = designFor(id, pickPlants(id), defaultGround(id)), tot = totalFor(await priceDesign(base)), ok = tot <= F.budget;
      const tag = card.querySelector('.fsc__cost'); if (!tag) continue; tag.textContent = ok ? `About ${moneyK(tot)}` : 'Over budget'; tag.classList.toggle('is-over', !ok); card.dataset.fit = ok ? '1' : '0'; } catch (e) { console.warn(e); } }
}
// ---------- design model ----------
function pickPlants(styleId) {
  const ok = PLANTS.filter(p => p.styles.includes(styleId) && fits(p)), by = t => ok.filter(p => p.type === t);
  let list = [...by('tree').slice(0, 2), ...by('shrub').slice(0, 3), ...[...by('perennial'), ...by('grass')].slice(0, 4), ...by('groundcover').slice(0, 1)];
  if (list.length < 6) list = [...new Set([...list, ...ok])].slice(0, 8); return list.map(p => p.id);
}
const defaultGround = s => ({ xeriscape: 'dg', japanese: 'gravel', mediterranean: 'gravel', tropical: 'mulch' }[s] || 'lawn');
function designFor(styleId, ids, ground, o) {
  o = o || { size: 'standard', path: 'pavers', dense: 1 };
  const P = ids.map(id => PLANTS.find(p => p.id === id)).filter(Boolean);
  const items = [{ kind: 'mulch', x: 0, z: -12.5, r: 0, w: 46, d: 9 }, { kind: styleId === 'xeriscape' ? 'gravel' : 'mulch', x: 17, z: 2, r: 0, w: 12, d: 14 },
    { kind: ground, x: -6, z: 5, r: 0, w: 30, d: 16 }, { kind: o.path === 'dg' ? 'dg' : 'path', x: 6, z: 15.5, r: 0, w: 34, d: 3.5 }];
  const trees = P.filter(p => p.type === 'tree'), shrubs = P.filter(p => p.type === 'shrub'), small = P.filter(p => !['tree', 'shrub'].includes(p.type));
  trees.forEach((p, i) => items.push({ kind: 'plant', id: p.id, x: i ? 15 : -17, z: -13, r: i }));
  shrubs.forEach((p, i) => { const x0 = -10 + i * 9; items.push({ kind: 'plant', id: p.id, x: x0, z: -12, r: 0 }); if (o.dense >= 1) items.push({ kind: 'plant', id: p.id, x: x0 + 3, z: -11.5, r: 1 }); });
  small.forEach((p, i) => { const side = i % 2, bx = side ? 15 + (i % 3) * 2 : -14 + i * 6, bz = side ? -2 + i * 2 : -8.5;
    for (let k = 0; k < (o.dense >= 1 ? 3 : 2); k++) items.push({ kind: 'plant', id: p.id, x: +(bx + k * 1.6).toFixed(1), z: +(bz + (k % 2) * 1.2).toFixed(1), r: k }); });
  return { v: 2, yard: { w: 50, d: 36 }, items: items.map((it, i) => ({ ...it, renderAnchor: `item-${i}` })), style: styleId };
}
function buildDesign(force) {
  if (!F.plants.length || force) F.plants = pickPlants(F.style); if (!F.ground) F.ground = defaultGround(F.style);
  F.base = designFor(F.style, F.plants, F.ground); F.edits = F.manual || null;
  if (!F.manual && F.tier && BF) { try { const r = F.tier === 'better' ? BF.fitBudget(fitReq(F.base)) : BF.fitTiers(fitReq(F.base))[F.tier]; F.edits = editsOf(r); } catch (e) { console.warn(e); } }
  if (F.site) { try { F.base = designOnSite(F.site, F.base); } catch (e) { console.warn(e); } }
  F.base.irrigation = F.irrigation; F.design = applyEdits(F.base, F.edits); F.design.irrigation = F.irrigation; try { localStorage.setItem('yardplan.design.v3', JSON.stringify(F.design)); } catch (e) {};
  if (window.planApi?.ready?.()) window.planApi.apply(F.design); window.dispatchEvent(new Event('yardplan:design'));
  F.placed = false; F.plan = null; F.P = null; F.saved = false;
}
async function placeOnPhoto() {
  const o = window.overlayApi; if (!o?.hasPhoto?.() || F.placed) return; const ids = []; F.plants.forEach(id => { ids.push(id); if (PLANTS.find(p => p.id === id)?.type !== 'tree') ids.push(id); });
  await o.autoPlace(ids.slice(0, 10)); F.placed = true;
}
// ---------- v17: optional site plan from above / survey ----------
function openSiteHome(mode) { const a = F.addr || { q: $('#fAddr').value.trim() };
  window.siteApi.open({ mode: F.site && mode === 'aerial' ? 'edit' : mode, site: F.site && mode !== 'aerial' ? F.site : (mode === 'edit' ? F.site : null), address: a.label || a.q, lat: a.lat, lon: a.lon, who: 'home', layers: F.siteLayers || {}, keepAerial: true,
    onDone: (site, d, layers) => { F.site = site; F.siteLayers = layers; try { localStorage.setItem('yardplan.site.v1', JSON.stringify(site)); } catch {}
      const A = Math.round(Math.abs(site.lot.reduce((s2, p, i) => { const q = site.lot[(i + 1) % site.lot.length]; return s2 + p[0] * q[1] - q[0] * p[1]; }, 0) / 2));
      $('#fSiteNote').textContent = `${site.source === 'survey' ? 'From your survey' : 'Drawn from above (approximate)'} · lot about ${A.toLocaleString()} sq ft. Your design will fit this yard.`; $('#fSiteGo').textContent = 'Edit my yard from above';
      F.manual = null; F.saved = false; if (F.step === 3) renderResult(); toast('Got it — your plan now uses your real yard.'); } }); }
$('#fSiteGo').onclick = () => openSiteHome(F.site ? 'edit' : 'aerial'); $('#fSurveyGo').onclick = () => openSiteHome('survey');
// ---------- 3 Your new yard ----------
const GROUNDS = [['lawn', 'Lawn'], ['gravel', 'Gravel'], ['dg', 'Crushed rock path'], ['mulch', 'Mulch']];
const groundName = k => GROUNDS.find(g => g[0] === k)?.[1] || k;
const sunOf = p => p.sun.includes('full') ? 'Sun' : p.sun.includes('part') ? 'Part shade' : 'Shade';
const waterOf = p => p.water === 'low' ? 'Low water' : p.water === 'med' ? 'Some water' : 'Regular water';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function renderResult() {
  const re = F.reopened, wasSaved = F.saved, id = F.savedId;
  if (!BF) await loadCostMods().catch(e => console.warn(e));
  buildDesign(); F.savedId = id; if (re && wasSaved) F.saved = true;
  $('#fResult').innerHTML = `<div class="res"><div class="res__media" id="rMedia"></div><div class="res__body">
   <h1 id="rH">Your yard, ${esc(styleName())}</h1>
   <p class="price-line" id="rPrice" aria-live="polite"><span class="skeleton skeleton--text" style="width:16ch;display:inline-block"></span></p>
   <p class="reb-line" id="rReb" hidden></p>
   <div class="res__btns"><button class="btn btn--secondary" type="button" id="rAdjust">Adjust</button><button class="btn btn--secondary" type="button" id="rAnother">Try another look</button></div>
   <div class="list rows" id="rRows">
    <button class="row" type="button" data-info="in"><b>What's in it</b><span id="rInS">Plants and ground</span></button>
    <button class="row" type="button" data-info="budget"><b>Budget and rebates</b><span id="rBudS">Your total, ways to save, rebates</span></button>
    <button class="row" type="button" data-info="irr"><b>Watering and irrigation</b><span id="rIrrS">${F.irrigation === 'none' ? 'Add irrigation · optional' : (F.irrigation === 'drip' ? 'Drip' : 'Sprinklers') + ' · included in your price'}</span></button>
    <button class="row" type="button" data-info="care"><b>Yard care</b><span>Water use, yard care, this month</span></button>
    <button class="row" type="button" data-info="quotes"><b>Get quotes from local pros</b><span>Licensed landscapers near you</span></button></div>
   <p class="footnote legal">For planning only, not for construction. Call 811 before you dig.</p></div></div>`;
  $('#rAdjust').onclick = openAdjust; $('#rAnother').onclick = () => step(2);
  $$('#rRows [data-info]').forEach(b => b.onclick = () => openInfo(b.dataset.info));
  if (re && !hasPhoto()) { F.render = { state: 'static' }; $('#rMedia').innerHTML = `<figure class="ba photo"><img class="ba__before" src="${esc(re.render || re.thumb)}" alt="Saved picture of your ${esc(styleName())} yard"><span class="ai-label">Saved plan</span></figure>`; }
  else { await placeOnPhoto().catch(e => console.warn(e)); if (F.step === 3) startRender(false); }
  try { await cost(); } catch (e) { console.warn(e); $('#rPrice').textContent = "We couldn't price this right now."; }
}
// Render: ETA progress (median of the last 20 renders, seeded 30 s), Cancel, 90 s timeout, retry, failure state. Never plant circles.
let RS = 0, rTimer = null;
const RKEY = 'yardplan.renderMs', medianMs = () => { try { const a = (JSON.parse(localStorage.getItem(RKEY)) || []).slice().sort((x, y) => x - y); return a.length ? a[a.length >> 1] : 30000; } catch { return 30000; } };
function recordMs(ms) { try { const a = JSON.parse(localStorage.getItem(RKEY)) || []; a.push(Math.round(ms)); localStorage.setItem(RKEY, JSON.stringify(a.slice(-20))); } catch {} }
function cancelRender() { RS++; clearInterval(rTimer); if (F.render?.state === 'rendering') F.render = { state: 'cancelled' }; }
async function startRender(force) {
  const my = ++RS; clearInterval(rTimer); const media = $('#rMedia'); if (!media) return;
  const photoUrl = window.overlayApi?.imageUrl?.() || '';
  if (!HAS_RENDER) { F.render = { state: 'sample', url: SAMPLE_RENDER }; showBA(photoUrl, SAMPLE_RENDER, true); $('#rH').textContent = `Your yard, ${styleName()}`; update(); return; }
  F.render = { state: 'rendering', t0: Date.now() }; $('#rH').textContent = `Your yard, ${styleName()}`; update();
  media.innerHTML = `<div class="render-wait" id="rWait" role="status" aria-live="polite"><img src="${photoUrl}" alt="" class="render-wait__photo"><div class="render-wait__sweep" aria-hidden="true"></div><div class="render-wait__panel"><p class="render-wait__msg" id="rMsg">Looking at your yard…</p><div class="bar"><i id="rBar" style="--p:2%"></i></div><p class="render-wait__eta"><span id="rEta"></span><button type="button" class="linkbtn" id="rCancel">Cancel</button></p></div></div>`;
  $('#rCancel').onclick = () => { cancelRender(); step(2); };
  const med = medianMs(), tau = med / 2.3, msgs = ['Looking at your yard…', 'Finding the ground and edges…', `Picking plants that grow ${near()}…`, 'Planting and mulching…', 'Adding finishing touches…'];
  rTimer = setInterval(() => {
    if (my !== RS) return clearInterval(rTimer); const t = Date.now() - F.render.t0, bar = $('#rBar'), msg = $('#rMsg'); if (!bar) return;
    bar.style.setProperty('--p', (Math.min(.92, 1 - Math.exp(-t / tau)) * 100).toFixed(1) + '%');
    const m = F.render.limited ? "Lots of yards are being drawn right now. We'll keep trying for a minute." : t > 45000 ? 'Taking a little longer than usual. Hang tight.' : msgs[Math.floor(t / 4000) % msgs.length];
    if (msg.textContent !== m && (t - (F.render.ann || 0) > 4000 || F.render.limited || t > 45000)) { msg.textContent = m; F.render.ann = t; }
    $('#rEta').textContent = t < med ? `About ${Math.max(1, Math.round((med - t) / 1000))} sec left · ` : '';
    if (t > 90000) { RS++; clearInterval(rTimer); renderFailed('timeout'); }
  }, 250);
  for (let k = 0; k < 30 && !window.renderHook; k++) await sleep(100);
  let code = 'unavailable';
  for (let i = 0; i < 4; i++) {
    let res = null, err = null;
    try { res = await window.renderHook?.refresh?.(force || i > 0); } catch (e) { err = e; }
    if (my !== RS) return;
    const s = window.renderHook?.status || {}, url = res && !res.mock && (res.dataURL || res.imageUrl);
    if (url) { clearInterval(rTimer); recordMs(Date.now() - F.render.t0); F.render = { state: 'done', url }; $('#rBar')?.style.setProperty('--p', '100%'); showBA(photoUrl, url, false); toast('Your yard is ready'); update(); return; }
    code = err?.code || s.code || s.state || 'error';
    if (/rate|429|limit|busy/i.test(`${code} ${s.message || ''} ${err?.message || ''}`) && i < 3) { F.render.limited = true; await sleep(5000 * 2 ** i); if (my !== RS) return; continue; }
    break;
  }
  clearInterval(rTimer); console.info('[yardplan] render failed:', code); renderFailed(code);
}
function renderFailed(code) {
  F.render = { state: 'failed', code }; const media = $('#rMedia'); if (!media) return;
  const photoUrl = window.overlayApi?.imageUrl?.() || '';
  $('#rH').textContent = "We couldn't draw your yard this time";
  document.body.dataset.rfail = '1';
  media.innerHTML = `<div class="render-fail" role="status"><p>Your design and price are still here. Try again in a minute.</p><button type="button" class="linkbtn" id="rSaveAnyway">Save my plan anyway</button></div>
   <figure class="ba photo"><img class="ba__before" src="${photoUrl}" alt="Your yard today"><span class="ai-label">${esc(styleName())} look</span></figure>`;
  $('#rSaveAnyway').onclick = () => savePlan(); update();
}
function showBA(before, after, sample) {
  const media = $('#rMedia'); if (!media) return; delete document.body.dataset.rfail; F.demoNote = !!(sample && !F.sample);
  media.innerHTML = `<figure class="ba photo" id="rBA" style="--pos:50%"><img class="ba__before" src="${esc(before)}" alt="Your yard today"><div class="ba__after"><img src="${esc(after)}" alt="${sample ? 'Sample AI picture of a redesigned yard (not your yard)' : `AI picture of your yard as a ${esc(styleName())} garden`}"></div>
    <span class="ba__tag ba__tag--l">Before</span><span class="ba__tag ba__tag--r">${sample ? 'Sample' : 'After'}</span><span class="ai-label">AI concept · not to scale</span>
    <div class="ba__handle" role="slider" tabindex="0" aria-label="Before and after comparison" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"></div>
    ${sample ? `<span class="sample-banner sample-banner--demo">${F.sample ? 'Sample yard and sample picture' : 'Sample picture · not your yard'}</span>` : F.sample ? '<span class="sample-banner">Sample yard: this isn\'t your home.</span>' : ''}</figure>
`;
  slider($('#rBA'));
}
async function cost() {
  const P = await priceDesign(F.design), total = totalFor(P), B = F.budget;
  F.bid = P.bid; F.takeoff = P.t; F.P = P; F.plan = { diy: P.diy, pro: P.pro, plants: P.plantsDiy, materials: P.materialsDiy, budget: B, total, rebate: P.rebate?.amount || 0, mode: F.mode };
  const el = $('#rPrice'); if (el) { const over = total > B; el.className = 'price-line ' + (over ? 'is-over' : 'is-fit');
    el.innerHTML = over ? `About ${money(total)} · ${money(total - B)} over your ${money(B)} budget <button type="button" class="linkbtn" id="rFit">Make it fit</button>` : `About ${money(total)} · fits your ${money(B)} budget`;
    const f = $('#rFit'); if (f) f.onclick = makeFit;
    const rb = $('#rReb'), amt = P.rebate?.amount || 0; rb.hidden = !(amt > 0); if (amt > 0) rb.textContent = amt >= total ? 'Rebates may cover most of this' : `Up to ${money(amt)} back in local rebates`;
    const n = P.t.plants.reduce((a, p) => a + p.count, 0); $('#rInS').textContent = `${n} plants · ${groundName(F.ground)}`;
    $('#rBudS').textContent = `${F.mode === 'diy' ? 'Doing it yourself' : 'Hiring a pro'} · ${money(total)}${amt > 0 ? ` · up to ${money(amt)} back` : ''}`; }
  update(); return P;
}
async function makeFit() {
  const m = BF || await loadCostMods(); if (F.plan && F.plan.total <= F.budget && !F.tier) { toast('Your plan already fits your budget.'); return; } const f = m.fitBudget(fitReq(F.base));
  if (f.belowMinimum) { toast(`Even the simplest version is about ${money(f.minViable)}. Try a smaller look or raise the budget.`); return; }
  F.manual = null; F.tier = 'better'; buildDesign(); const P = await cost(); toast(`Trimmed to fit: ${money(totalFor(P))}`);
  if ($('#infoSheet').open && $('#infoSheet').dataset.kind === 'budget') renderBudgetSheet();
}
// ---------- save + share ----------
const PKEY = 'yardplan.plans.v1'; const plans = () => { try { return JSON.parse(localStorage.getItem(PKEY)) || []; } catch { return []; } };
async function small(u, max = 360) { if (!u) return null; try { const im = new Image(); im.crossOrigin = 'anonymous'; im.src = u; await im.decode(); const c = document.createElement('canvas'), k = max / Math.max(im.naturalWidth || 1, im.naturalHeight || 1); c.width = Math.round((im.naturalWidth || 1) * k); c.height = Math.round((im.naturalHeight || 1) * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', .7); } catch { return null; } }
async function savePlan() {
  try { const list = plans().filter(p => p.id !== F.savedId), now = new Date(), id = F.savedId || now.getTime().toString(36);
    const photo = hasPhoto() ? await small(window.overlayApi.imageUrl(), 240) : null, rend = F.render?.state === 'done' ? await small(F.render.url, 480) : null;
    list.unshift({ id, name: `${styleName()} yard`, style: F.style, plants: F.plants, ground: F.ground, tier: F.tier, manual: F.manual, irrigation: F.irrigation, budget: F.budget, mode: F.mode, zip: state.zip, zone: state.zoneLabel, place: place(), cost: F.plan,
      thumb: rend || photo || `img/styles/${F.style}-800.webp`, render: rend, sampleRender: F.render?.state === 'sample', created: now.toISOString() });
    localStorage.setItem(PKEY, JSON.stringify(list.slice(0, 20))); F.saved = true; F.savedId = id; update(); updateNav(); renderPlans(); toast('Saved to My plans on this device.'); }
  catch (e) { console.warn(e); toast("We couldn't save right now. Your design is still here. Try again."); }
}
async function share() {
  const url = F.render?.url || (hasPhoto() ? window.overlayApi.imageUrl() : `img/styles/${F.style}-800.webp`), text = `My Yardplan design: ${styleName()} look, about ${money(F.plan?.total)}.`;
  try { const blob = await (await fetch(url)).blob(), file = new File([blob], `yardplan-${F.style}.jpg`, { type: blob.type || 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'My Yardplan design', text }); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Picture downloaded.');
  } catch (e) { if (e?.name !== 'AbortError') { console.warn(e); toast("Couldn't share right now. Try again."); } }
}
// ---------- sheets ----------
let opener = null;
function openSheet(sel) { const d = $(sel); opener = document.activeElement; if (!d.open) d.showModal(); }
function closeSheet(sel) { const d = $(sel); if (d.open) d.close(); }
$$('dialog.sheet').forEach(d => { d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]') || e.target.closest('[data-go]')) d.close(); }); d.addEventListener('close', () => { if (opener?.isConnected) opener.focus({ preventScroll: true }); }); });
// Detail sheets from the result rows
async function openInfo(kind) {
  if (kind === 'quotes') return window.mpApi?.getQuotes({ bid: F.bid, takeoff: F.takeoff, zip: state.zip, style: styleName(), photo: hasPhoto() ? window.overlayApi.imageUrl() : null, render: F.render?.state === 'done' ? F.render.url : null });
  const d = $('#infoSheet'); d.dataset.kind = kind; $('#infoBody').innerHTML = ''; $('#inDl')?.remove();
  $('#infoT').textContent = { in: "What's in it", budget: 'Budget and rebates', care: 'Yard care', irr: 'Watering and irrigation' }[kind];
  openSheet('#infoSheet');
  if (kind === 'in') renderInSheet(); if (kind === 'budget') renderBudgetSheet(); if (kind === 'care') renderCareSheet(); if (kind === 'irr') renderIrrSheet();
}
function plantRows() { const c = {}; (F.design?.items || []).filter(i => i.kind === 'plant').forEach(i => c[i.id] = (c[i.id] || 0) + 1);
  return Object.entries(c).map(([id, n]) => ({ p: PLANTS.find(q => q.id === id), n })).filter(r => r.p); }
function renderInSheet() {
  const rows = plantRows();
  $('#infoBody').innerHTML = `<ul class="plist">${rows.map(({ p, n }) => `<li><img src="img/plants/${p.id}.jpg" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><div><b>${esc(p.name)}${n > 1 ? ` <span class="muted">× ${n}</span>` : ''}</b><span>${sunOf(p)} · ${waterOf(p)} · ${Math.round(PLANT_SIZE[p.id]?.w || 3)} ft wide</span></div></li>`).join('')}</ul>
   <p class="footnote"><b>Ground:</b> ${esc(groundName(F.ground))} in the middle · mulched beds · ${F.design.items.some(i => i.kind === 'path') ? 'paver path' : 'crushed rock path'}</p>
   ${F.demoNote ? '<p class="footnote" id="rSampleNote"><b>Demo mode.</b> Pictures of your own yard aren\'t switched on in this preview, so the "after" side is a sample picture of a different yard. Your plants, price and plan are for your yard.</p>' : ''}
   <p class="footnote legal">For planning only, not for construction. Call 811 before you dig.</p>`;
  $('#infoFoot').insertAdjacentHTML('afterbegin', '<button class="btn btn--secondary btn--lg" type="button" id="inDl">Download plant list</button>');
  $('#inDl').onclick = () => { const csv = 'Plant,Botanical name,Count,Sun,Water,Width (ft)\n' + rows.map(({ p, n }) => [p.name, p.sci, n, sunOf(p), waterOf(p), Math.round(PLANT_SIZE[p.id]?.w || 3)].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `yardplan-${F.style}-plants.csv`; document.body.append(a); a.click(); a.remove(); };
}
const COVERED = ['CA', 'NV', 'AZ', 'CO', 'TX'];
async function renderBudgetSheet() {
  const el = $('#infoBody'); el.innerHTML = '<p class="footnote"><span class="skeleton skeleton--text" style="width:20ch;display:inline-block"></span></p>';
  const P = F.P || await cost(), total = totalFor(P), B = F.budget, over = total > B, pct = Math.min(100, total / B * 100);
  let asOf = ''; try { asOf = (await import('./contractor/data/rebates.js')).REBATES_META?.asOf || ''; } catch {}
  el.innerHTML = `<section class="estimate"><p class="footnote">${F.mode === 'diy' ? 'Doing it yourself' : 'Hiring a pro'}</p><p class="hero-number">${money(total)}</p>
    <div class="meter${over ? ' is-over' : ''}" role="meter" aria-label="Spending versus budget" aria-valuemin="0" aria-valuemax="${B}" aria-valuenow="${Math.round(total)}" aria-valuetext="${money(total)} of ${money(B)}" style="--p:${pct}%"><i></i></div>
    <p class="meter__status ${over ? 'is-over' : 'is-under'}">${over ? `${money(total - B)} over your ${money(B)} budget` : `Fits your ${money(B)} budget`}</p>
    <p class="callout">Doing it yourself: about ${money(P.diy)} · Hiring a pro: about ${money(P.pro)}</p></section>
   <div class="fit" id="pFit" aria-live="polite"></div><div class="rebate" id="pRebate" aria-live="polite"></div>
   <p class="footnote">An estimate from example prices near ${esc(state.zip || 'you')}, not a quote.${asOf ? ` Rebate rules checked ${esc(new Date(asOf + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))}.` : ''}</p>`;
  renderRebate($('#pRebate'), P.rebate, total, false);
  fitRows(total, over).catch(e => console.warn(e));
}
// Budget fits (contractor/budget-fit.js), relabeled for homeowners: Save more · Fits budget · Go bigger · As designed.
async function fitRows(total, over) {
  const el = $('#pFit'), m = BF || await loadCostMods(), req = fitReq(F.base), tiers = m.fitTiers(req), rows = [];
  const NAMES = { good: 'Save more', better: 'Fits budget', best: 'Go bigger' };
  for (const k of ['good', 'better', 'best']) { const f = tiers[k], ed = editsOf(f); rows.push({ k, n: Object.keys(ed).length, tot: totalFor(await priceDesign(applyEdits(F.base, ed))), below: f.belowMinimum, min: f.minViable }); }
  const designed = totalFor(await priceDesign(F.base));
  const better = tiers.better, by = {}; for (const c of better.changes) by[c.itemIndex] = (by[c.itemIndex] || 0) + c.saved;
  const curEd = F.edits || {}, singles = Object.entries(by).filter(([i, sv]) => sv > 0 && !(i in curEd)).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([i, sv]) => {
    const sel = better.selections[+i], it = F.base.items[+i], nm = it.kind === 'plant' ? (PLANTS.find(p => p.id === it.id)?.name || 'Plant') : ({ path: 'Paver path', dg: 'Crushed rock area', mulch: 'Mulch bed', gravel: 'Gravel area', lawn: 'Lawn', wall: 'Wall' }[it.kind] || it.kind);
    return { i: +i, sv, label: `${nm}: ${sel.label.toLowerCase()}`, item: sel.item }; });
  if (!el?.isConnected) return;
  const cur = F.manual ? 'custom' : F.tier || 'designed', row = (id, name, sub, tot) => `<button type="button" class="fit__row${cur === id ? ' is-on' : ''}" data-tier="${id}" role="radio" aria-checked="${cur === id}"><span>${name}<small>${sub}</small></span><b class="${tot <= F.budget ? 'is-save' : ''}">${money(tot)}</b></button>`;
  const seen = new Set(), uniq = rows.filter(r => { if (!r.n || seen.has(r.tot)) return false; seen.add(r.tot); return true; });
  el.innerHTML = `<p class="fit__h">${over ? 'Ways to fit your budget' : 'Other versions'}</p>`
    + (over && singles.length ? singles.map((r, j) => `<button type="button" class="fit__row" data-one="${j}"><span>${esc(r.label)}<small>One change</small></span><b class="is-save">−${money(r.sv)}</b></button>`).join('') : '')
    + (uniq.length ? uniq.map(r => row(r.k, NAMES[r.k], r.below ? 'The simplest version of this look' : `${r.n} change${r.n === 1 ? '' : 's'}`, r.tot)).join('') : '<p class="footnote">Your full design fits your budget, so there\'s nothing to cut.</p>')
    + row('designed', 'As designed', 'Every plant and path as planned', designed)
    + (rows[1].below ? `<p class="footnote">Even the simplest version is about ${money(rows[1].min || rows[0].tot)}. Try a smaller look or raise the budget.</p>` : '');
  el.querySelectorAll('[data-tier]').forEach(b => b.onclick = async () => { const t = b.dataset.tier; F.manual = null; F.tier = t === 'designed' ? null : t; buildDesign(); await cost(); renderBudgetSheet(); toast(t === 'designed' ? 'Back to the full design.' : `Switched to ${NAMES[t]}.`); });
  el.querySelectorAll('[data-one]').forEach(b => b.onclick = async () => { const r = singles[+b.dataset.one]; F.manual = { ...(F.edits || {}), [r.i]: r.item ? { ...r.item } : null }; buildDesign(); await cost(); renderBudgetSheet(); toast(`Saved about ${money(r.sv)}.`); });
}
// Turf-removal rebate card. withInputs: lawn size + water company (Adjust → Rebates).
function renderRebate(el, r, total, withInputs) {
  if (!el) return; const sf = turfSf(F.base), st = usState();
  const inputs = withInputs ? `<label class="rebate__turf">Lawn you're replacing: about <span class="inwrap"><input id="pTurf" inputmode="numeric" value="${sf}" aria-label="Square feet of lawn you're replacing"> sq ft</span></label>${utilityPick(r)}` : '';
  if (!state.zip) { el.innerHTML = ''; return; }
  if (!r || !r.amount) { el.innerHTML = `<div class="rebate__card"><p class="rebate__h">No rebate matched</p><p class="footnote">${COVERED.includes(st) || !st ? "No lawn-replacement rebate matched your ZIP right now. Programs change, so check your water company's site." : `We don't track rebates in ${esc(st)} yet. Your water company may still offer one.`}</p>${inputs}</div>`; bindRebate(); return; }
  const names = r.programs.map(p => esc(p.name)).join(' + ');
  el.innerHTML = `<div class="rebate__card"><p class="rebate__h">Up to ${money(r.amount)} back from ${names}</p>
    <p class="rebate__net">After the rebate: <b>${money(Math.max(0, total - r.amount))}</b></p>
    ${r.preApprovalRequired ? `<p class="footnote"><b>Get approval before you remove any grass.</b> The rebate is paid back after the work${r.programs.some(p => p.effectiveTo) ? `; this offer runs until ${esc(new Date(r.programs.find(p => p.effectiveTo).effectiveTo + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))}` : ''}. Your budget doesn't count it.</p>` : ''}
    ${r.programs.map(p => `<p class="footnote">Source: <a href="${esc(p.sourceUrl)}" target="_blank" rel="noopener">${esc(p.name)}</a></p>`).join('')}${inputs}</div>`;
  bindRebate();
}
// Programs that serve this ZIP, so the user can say which utility bills them for water.
function utilityPick(r) {
  if (!REB || !state.zip) return '';
  const cands = REB.filter(x => x.verified && !x.addOnOnly && (x.zipPrefixes || []).some(p => state.zip.startsWith(p)));
  const agencies = [...new Map(cands.map(x => [x.agency, x.utilities[0]])).entries()];
  if (!agencies.length || (!r?.needsUtilityConfirmation && !F.utility)) return '';
  return `<div class="rebate__util">${r?.needsUtilityConfirmation ? '<p class="footnote"><b>Which water company bills you?</b> We matched by ZIP only. Check the name on your water bill.</p>' : ''}
    <label class="field">Water company<select id="pUtil"><option value="">Not sure (show the most conservative)</option>${agencies.map(([a, u]) => `<option value="${esc(u)}"${F.utility === u ? ' selected' : ''}>${esc(a)}</option>`).join('')}</select></label></div>`;
}
function bindRebate() {
  const tf = $('#pTurf'); if (tf) tf.onchange = () => { const v = Math.max(0, Math.round(+tf.value.replace(/[^\d.]/g, '') || 0)); F.turfSf = v; localStorage.setItem('yardplan.turfSf', v || ''); repriced(); };
  const u = $('#pUtil'); if (u) u.onchange = () => { F.utility = u.value; localStorage.setItem('yardplan.utility', u.value); repriced(); };
}
const repriced = () => cost().then(() => { if ($('#adjustSheet').open) renderAdjRebate(); if ($('#infoSheet').open && $('#infoSheet').dataset.kind === 'budget') renderBudgetSheet(); }).catch(e => console.warn(e));
async function renderCareSheet() {
  const el = $('#infoBody'); el.innerHTML = '<p class="footnote">Working out your care plan… (loads local climate data the first time)</p>';
  try { if (!state.zip) throw new Error('zip'); await window.careApi.show(true); const g = window.careApi.guide; if (!g) throw new Error('guide');
    const G = g.maintenance, W = g.irrigation.waterUse, Mw = g.irrigation.mwelo, m = new Date().getMonth(), byId = new Map(G.tasks.map(t => [t.id, t]));
    let nm = m, up = []; for (let k = 0; k < 12 && !up.length; k++) { nm = (m + k) % 12; up = (G.months[nm]?.tasks || []).map(id => byId.get(id)).filter(Boolean); }
    const MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    if (!el.isConnected || $('#infoSheet').dataset.kind !== 'care') return;
    el.innerHTML = `<div class="care-nums"><div class="card card--stat"><span class="footnote">Water</span><b class="num">${Math.round(W.annualGallons).toLocaleString()} gal</b><span class="footnote">a year · ${W.savingsPct}% less than lawn</span></div>
      <div class="card card--stat"><span class="footnote">Yard care</span><b class="num">~${Math.round(G.annual.hours)} hours</b><span class="footnote">a year, doing it yourself</span></div>
      <div class="card card--stat"><span class="footnote">${nm === m ? 'This month' : 'Next up: ' + MN[nm]}</span><b class="num care-task">${esc(up[0]?.title || 'Nothing to do')}</b><span class="footnote">${up.length > 1 ? `+ ${up.length - 1} more` : ''}</span></div></div>
      ${Mw && Mw.compliant === false && usState() === 'CA' ? '<p class="callout">This plan may use more water than California allows for new yards. A pro can check it.</p>' : ''}
      <button class="btn btn--primary btn--block btn--lg" type="button" id="cCal">Add to calendar</button>
      <button class="btn btn--secondary btn--block" type="button" id="cPdf" style="margin-top:8px">Download care guide (PDF)</button>
      <p class="footnote">A planning guide based on your local climate, not an engineered irrigation design.</p>`;
    $('#cCal').onclick = () => g.exportIcs();
    const pdf = document.querySelector('#careOut [data-act=pdf]'); $('#cPdf').disabled = !pdf || pdf.disabled; $('#cPdf').onclick = () => pdf?.click();
  } catch (e) { console.warn(e); if (el.isConnected) el.innerHTML = '<p class="footnote">Add your ZIP to see watering and care for your area.</p>'; }
}
// ---------- Watering and irrigation (optional add-on for homeowners) ----------
const IRRN = { none: 'No irrigation', drip: 'Drip', spray: 'Sprinklers' };
function irrCost(P) { const f = ls => (ls || []).filter(l => String(l.key).startsWith('irr-')).reduce((a, l) => a + l.amount, 0); return { pro: f(P?.est?.pro?.lines), diy: f(P?.est?.diy?.lines) }; }
async function setIrrigation(m, from) {
  F.irrigation = m; localStorage.setItem('yardplan.irrigation', m); if (F.design) { F.base.irrigation = m; F.design.irrigation = m; if (window.planApi?.ready?.()) window.planApi.apply(F.design); }
  const s = $('#rIrrS'); if (s) s.textContent = m === 'none' ? 'Add irrigation · optional' : IRRN[m] + ' · included in your price';
  F.saved = false; const P = await cost(); toast(m === 'none' ? `Irrigation removed. About ${money(totalFor(P))}.` : `${IRRN[m]} irrigation added. About ${money(totalFor(P))}.`);
  if (from === 'sheet' && $('#infoSheet').dataset.kind === 'irr') renderIrrSheet(); if (from === 'adj') renderAdjust();
}
const segIrr = (id) => `<div class="seg3" role="radiogroup" aria-label="Irrigation" id="${id}">${['none', 'drip', 'spray'].map(k => `<button type="button" role="radio" aria-checked="${F.irrigation === k}" data-irr="${k}">${k === 'none' ? 'None' : k === 'drip' ? 'Drip' : 'Sprinklers'}</button>`).join('')}</div>`;
async function renderIrrSheet() {
  const el = $('#infoBody'), m = F.irrigation, P = F.P || await cost(), c = irrCost(P), who = F.mode === 'diy' ? c.diy : c.pro;
  const tut = await import('./guides/irrigation-tutorials.js');
  el.innerHTML = `<section class="irr">${segIrr('irrSeg')}
   ${m === 'none' ? `<div class="irr__add"><p><b>Irrigation is optional.</b> Your price doesn't include it. Most yards in dry areas do better with drip: it waters the roots, uses less water and is easy to install yourself.</p>
      <button class="btn btn--primary btn--block" type="button" id="irrAdd">Add drip irrigation</button></div>`
   : `<p class="irr__price"><b>${IRRN[m]}</b> · about <b>${money(who)}</b> ${F.mode === 'diy' ? 'in parts (doing it yourself)' : 'installed'}, included in your ${money(totalFor(P))} total.</p>
      <p class="footnote">Recommended: drip for beds and trees, ${F.ground === 'lawn' ? 'efficient rotary sprinklers for the lawn' : 'no lawn to spray'}.${m === 'spray' ? ' Sprinklers water beds less efficiently than drip.' : ''}</p>
      <h3 class="irr__h">Zones</h3><ul class="irr__zones" id="irrZones"><li class="footnote">Working out your zones…</li></ul>
      <h3 class="irr__h">Watering schedule${state.zip ? ' for ' + esc(place() || state.zip) : ''}</h3><div id="irrSched"><p class="footnote">${state.zip ? 'Loading local climate…' : 'Add your ZIP in Adjust → Location to see a schedule and local water rules.'}</p></div>`}
   <h3 class="irr__h">How-to guides</h3><p class="footnote">Simple step-by-step guides with diagrams if you do it yourself.</p>
   <ul class="mlist irr__tuts">${tut.TUTORIALS.map(t => `<li><button class="row" type="button" data-tut="${t.id}"><b>${esc(t.title)}</b><span>${esc(t.summary)}</span></button></li>`).join('')}</ul>
   <div id="irrTut"></div>
   <p class="footnote legal">A planning guide, not a construction plan. Follow local codes; backflow devices often need a licensed installer. Call 811 before you dig.</p></section>`;
  el.querySelectorAll('#irrSeg [data-irr]').forEach(b => b.onclick = () => setIrrigation(b.dataset.irr, 'sheet'));
  const add = $('#irrAdd'); if (add) add.onclick = () => setIrrigation('drip', 'sheet');
  el.querySelectorAll('[data-tut]').forEach(b => b.onclick = () => { const t = tut.TUTORIALS.find(x => x.id === b.dataset.tut); const box = $('#irrTut'); box.innerHTML = tut.tutorialHtml(t, esc); box.querySelector('[data-tutclose]').onclick = () => { box.innerHTML = ''; b.focus(); }; box.scrollIntoView({ block: 'start', behavior: 'smooth' }); box.querySelector('h3')?.focus(); });
  if (m === 'none') return;
  const T = F.takeoff?.irrigation, zl = $('#irrZones');
  if (T) zl.innerHTML = T.hydrozones.map((z, i) => `<li><i style="background:${z.color}"></i><div><b>Zone ${i + 1}</b><span>${esc(z.name)} · ${z.emitterCount ? z.emitterCount + ' drippers' : z.headCount + ' sprinkler heads'}</span></div></li>`).join('') + `<li class="footnote">${esc(T.equipment.controller.recommendation)}</li>`;
  $('#inDl')?.remove(); $('#infoFoot').insertAdjacentHTML('afterbegin', '<button class="btn btn--secondary btn--lg" type="button" id="inDl">Download parts list</button>');
  $('#inDl').onclick = () => { const L = (F.mode === 'diy' ? P.est.diy.lines : P.est.pro.lines).filter(l => String(l.key).startsWith('irr-'));
    const csv = 'Part,Qty,Unit,Estimated cost\n' + L.map(l => [l.description, l.qty, l.unit, l.amount].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `yardplan-irrigation-parts.csv`; document.body.append(a); a.click(); a.remove(); };
  if (!state.zip) return;
  try { const g = await import('./guides/irrigation.js'); const plan = g.generateIrrigationPlan(F.irrigation === 'spray' ? sprayView(F.design) : F.design, { catalog: CATALOG(), zip: state.zip });
    if (!$('#irrSched')?.isConnected || F.irrigation !== m) return; const mo = new Date().getMonth();
    const rows = plan.hydrozones.map((z, i) => { const x = z.monthly[mo]; return `<li><b>Zone ${i + 1}</b><span>${x.off || !x.eventsPerWeek ? 'Off this month (rain or dormant)' : `${x.eventsPerWeek >= 1 ? Math.round(x.eventsPerWeek) + '× a week' : 'Every ' + x.intervalDays + ' days'}, about ${Math.round(x.minutesPerEvent)} min`}</span></li>`; }).join('');
    const rules = plan.notes.filter(n => /^Local rules/.test(n));
    $('#irrSched').innerHTML = `<p class="footnote">This month (${plan.hydrozones[0]?.monthly[mo]?.month || ''}). New plants need more for the first 12 weeks.</p><ul class="irr__sched">${rows}</ul>
      ${rules.length ? rules.map(r => `<p class="callout">${esc(r)}</p>`).join('') : '<p class="footnote">Check your water utility for watering-day rules.</p>'}
      ${state.zip && /^9[0-6]/.test(state.zip) ? `<p class="footnote">California water budget (MWELO): ${plan.mwelo.compliant ? 'this plan fits the state water budget' : 'over the state water budget — use more low-water plants or less lawn'}${plan.mwelo.applies ? '' : ' (a permit is usually only needed for 500+ sq ft of new landscape)'}.</p>` : ''}`;
  } catch (e) { console.warn(e); const s = $('#irrSched'); if (s) s.innerHTML = '<p class="footnote">Couldn\'t load a local schedule. Water early morning, deeply and less often.</p>'; }
}
const sprayView = d => ({ ...d, items: d.items.filter(i => i.kind !== 'plant').map(i => i.kind === 'mulch' ? { ...i, kind: 'lawn' } : i) });
// ---------- the Adjust sheet (one sheet, rows expand inline) ----------
let dirty = false, swapOpen = null;
let adjStart = null;
function openAdjust() { dirty = false; swapOpen = null; adjStart = { b: F.budget, m: F.mode }; renderAdjust(); openSheet('#adjustSheet'); }
function setDirty() { dirty = true; $('#adjDone').textContent = 'Update my yard'; }
function renderAdjust() {
  const P = F.plants.map(id => PLANTS.find(p => p.id === id)).filter(Boolean), v = window.overlayApi?.st?.view;
  $('#adjBody').innerHTML = `
   <details class="adj" data-row="budget"><summary>Budget <span>${money(F.budget)} · ${F.mode === 'diy' ? 'Doing it yourself' : 'Hiring a pro'}</span></summary>
    <p class="adj__val" id="adjBudgetVal">${money(F.budget)}</p><input type="range" id="adjRange" min="0" max="100" step="1" aria-label="Budget" class="budget__range">
    <div class="seg2" role="radiogroup" aria-label="Who does the work" id="adjWho"><button type="button" role="radio" aria-checked="${F.mode === 'diy'}" data-m="diy">Doing it yourself</button><button type="button" role="radio" aria-checked="${F.mode === 'pro'}" data-m="pro">Hiring a pro</button></div>
    <button class="btn btn--secondary btn--block" type="button" id="adjFit">Make it fit</button></details>
   <details class="adj" data-row="swap"${swapOpen ? ' open' : ''}><summary>Swap a plant <span>${P.length} plants</span></summary>
    <ul class="plist">${P.map(p => `<li><img src="img/plants/${p.id}.jpg" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><div><b>${esc(p.name)}</b><span>${sunOf(p)} · ${waterOf(p)}</span></div><button class="btn btn--secondary btn--sm" type="button" data-swap="${p.id}" aria-expanded="${swapOpen === p.id}" aria-label="Swap ${esc(p.name)}">Swap</button></li>${swapOpen === p.id ? `<li class="swaplist"><div class="pick">${swapAlts(p).map(q => `<button class="prow" type="button" data-to="${q.id}"><img src="img/plants/${q.id}.jpg" alt="" onerror="this.style.visibility='hidden'"><span><b>${esc(q.name)}</b><span>${esc(q.size)} · ${waterOf(q)}</span></span></button>`).join('') || '<p class="muted">No other matches for your area.</p>'}</div></li>` : ''}`).join('')}</ul></details>
   <details class="adj" data-row="ground"><summary>Ground <span>${esc(groundName(F.ground))}</span></summary>
    <div class="chips" role="radiogroup" aria-label="Ground">${GROUNDS.map(([k, n]) => `<button class="chip" type="button" role="radio" aria-checked="${F.ground === k}" aria-pressed="${F.ground === k}" data-g="${k}">${n}</button>`).join('')}</div></details>
   <details class="adj" data-row="irrigation"><summary>Irrigation <span>${F.irrigation === 'none' ? 'Not included · optional' : IRRN[F.irrigation] + ' · included'}</span></summary>
    <p class="footnote">Add a watering system to your plan. Drip is best for beds and trees.</p>${segIrr('adjIrr')}</details>
   <details class="adj" data-row="rebates"><summary>Rebates <span id="adjRebS">${F.plan?.rebate ? 'Up to ' + money(F.plan.rebate) : 'Check yours'}</span></summary><div id="adjReb"></div></details>
   <details class="adj" data-row="photo"><summary>Photo <span>Rotate or fix the view</span></summary>
    <div class="chips"><button class="chip" type="button" data-adj="rotate">Rotate</button></div>
    <p class="footnote">Wrong view?</p><div class="chips" id="adjView" role="radiogroup" aria-label="View"><button class="chip" type="button" role="radio" data-v="ground" aria-checked="${v === 'ground'}">Ground</button><button class="chip" type="button" role="radio" data-v="drone" aria-checked="${v === 'drone'}">Drone</button><button class="chip" type="button" role="radio" data-v="top" aria-checked="${v === 'top'}">From above</button></div></details>
   <details class="adj" data-row="location"><summary>Location <span>${esc(place() || state.zip || 'Not set')}</span></summary>
    <label class="field">ZIP code<input id="adjZip" class="input" inputmode="numeric" maxlength="5" autocomplete="postal-code" value="${esc(state.zip || '')}"></label><p class="footnote" id="adjZipMsg" aria-live="polite"></p></details>`;
  $('#adjDone').textContent = dirty ? 'Update my yard' : 'Done';
  setBudget(F.budget); renderAdjRebate();
  const b = $('#adjBody');
  b.querySelector('#adjRange').oninput = e => { setBudget(fromT(+e.target.value)); clearTimeout(renderAdjust.t); renderAdjust.t = setTimeout(repriced, 250); };
  b.querySelectorAll('#adjWho [data-m]').forEach(x => x.onclick = () => { setWho(x.dataset.m); repriced(); });
  b.querySelector('#adjFit').onclick = makeFit;
  b.querySelectorAll('#adjIrr [data-irr]').forEach(x => x.onclick = () => { if (x.dataset.irr === F.irrigation) return; setIrrigation(x.dataset.irr, 'adj').then(() => b.querySelector('[data-row=irrigation]')?.setAttribute('open', '')); });
  b.querySelectorAll('[data-swap]').forEach(x => x.onclick = () => { swapOpen = swapOpen === x.dataset.swap ? null : x.dataset.swap; renderAdjust(); b.querySelector(`[data-swap="${x.dataset.swap}"]`)?.focus(); });
  b.querySelectorAll('[data-to]').forEach(x => x.onclick = () => { const was = swapOpen; F.plants = F.plants.map(i => i === was ? x.dataset.to : i); swapOpen = null; setDirty(); renderAdjust(); toast('Swapped. Tap Update my yard to see it.'); });
  b.querySelectorAll('[data-g]').forEach(x => x.onclick = () => { F.ground = x.dataset.g; b.querySelectorAll('[data-g]').forEach(y => { y.setAttribute('aria-checked', String(y === x)); y.setAttribute('aria-pressed', String(y === x)); }); b.querySelector('[data-row=ground] summary span').textContent = groundName(F.ground); setDirty(); });
  b.querySelector('[data-adj=rotate]').onclick = async () => { await window.overlayApi.rotatePhoto(); F.placed = false; setDirty(); toast('Rotated.'); };
  b.querySelectorAll('#adjView [data-v]').forEach(x => x.onclick = () => { window.overlayApi.setView(x.dataset.v); b.querySelectorAll('#adjView [data-v]').forEach(y => y.setAttribute('aria-checked', String(y === x))); F.placed = false; setDirty(); });
  const z = b.querySelector('#adjZip'); z.oninput = () => { const v2 = z.value.replace(/\D/g, '').slice(0, 5); z.value = v2; if (v2.length === 5 && v2 !== state.zip) { $('#zip').value = v2; $('#zipForm').requestSubmit(); $('#adjZipMsg').textContent = 'Looking up your area…'; setDirty(); } };
}
const swapAlts = p => PLANTS.filter(q => q.type === p.type && q.id !== p.id && fits(q) && !F.plants.includes(q.id)).slice(0, 8);
function renderAdjRebate() { const el = $('#adjReb'); if (!el || !F.P) return; renderRebate(el, F.P.rebate, totalFor(F.P), true); $('#adjRebS').textContent = F.P.rebate?.amount ? 'Up to ' + money(F.P.rebate.amount) : 'Check yours'; }
window.addEventListener('yardplan:zone', () => { const m = $('#adjZipMsg'); if (m && state.zone) m.textContent = `${place() || 'ZIP ' + state.zip} · plants picked for your area.`; });
$('#adjDone').onclick = async () => { closeSheet('#adjustSheet');
  if (dirty) { dirty = false; F.manual = null; F.placed = false; F.saved = false; F.reopened = null; if (F.step === 3) renderResult(); }
  else if (F.step === 3) { if (F.tier && !F.manual && adjStart && (adjStart.b !== F.budget || adjStart.m !== F.mode)) buildDesign(); cost().catch(e => console.warn(e)); } };
// ---------- My plans + nav ----------
function updateNav() { const has = plans().length > 0; document.body.dataset.plans = has ? '1' : '0'; $('#hnav').hidden = !has; }
function renderPlans() {
  const list = plans(), el = $('#plansList');
  el.innerHTML = list.length ? `<ul class="plans">${list.map(p => `<li><button class="prow" type="button" data-open="${p.id}"><img src="${esc(p.thumb)}" alt=""><span><b>${esc(p.name)}</b><span>${new Date(p.created).toLocaleDateString()}${p.place ? ' · ' + esc(p.place) : ''}${p.cost ? ' · about ' + money(p.cost.total ?? p.cost.diy) : ''}</span></span></button><button class="btn btn--ghost btn--sm" type="button" data-del="${p.id}" aria-label="Delete ${esc(p.name)}">Delete</button></li>`).join('')}</ul>`
    : `<section class="empty"><h2>No saved yards yet</h2><p class="muted">Your designs will show up here.</p><button class="btn btn--primary btn--lg" type="button" data-menu="new">Start a design</button></section>`;
}
$('#plansList').onclick = e => {
  const o = e.target.closest('[data-open]'), d = e.target.closest('[data-del]');
  if (o) { const p = plans().find(x => x.id === o.dataset.open); Object.assign(F, { style: p.style, stylePicked: true, plants: p.plants, ground: p.ground, tier: p.tier || null, manual: p.manual || null, saved: true, savedId: p.id, reopened: p });
    if (p.budget) setBudget(p.budget); if (p.mode) F.mode = p.mode; F.irrigation = p.irrigation || 'none'; localStorage.setItem('yardplan.style', p.style);
    if (p.zip && p.zip !== state.zip) { $('#zip').value = p.zip; $('#zipForm').requestSubmit(); } go('home'); step(3); }
  if (d) { const p = plans().find(x => x.id === d.dataset.del); if (confirm(`Delete "${p.name}"? This can't be undone.`)) { localStorage.setItem(PKEY, JSON.stringify(plans().filter(x => x.id !== p.id))); renderPlans(); updateNav(); toast('Design deleted'); } }
};
function newDesign() { Object.assign(F, { style: '', stylePicked: false, plants: [], ground: '', tier: null, manual: null, edits: null, saved: false, savedId: null, reopened: null, plan: null, P: null, render: null }); go('home'); step(1); }
document.addEventListener('click', e => { const m = e.target.closest('[data-menu]'); if (!m) return; closeSheet('#menuSheet'); if (m.dataset.menu === 'new') newDesign(); if (m.dataset.menu === 'pro') go('pro'); });
$('#menuBtn').onclick = () => openSheet('#menuSheet');
window.addEventListener('click', e => { if (e.target.closest('[data-tab=plans],[data-go=plans]')) renderPlans(); }, true);
window.addEventListener('offline', () => toast("You're offline. You can look around, but new pictures need a connection."));
renderPlans(); updateNav();
window.flowApi = { step, state: F, pickPlants, designFor, renderPlans, openAdjust, openInfo, savePlan };
// Start: prefilled ZIP (95814, CA) is looked up silently so the default path needs no typing; users anywhere can change it.
if (/^\d{5}$/.test($('#zip').value) && !state.zip) $('#zipForm').requestSubmit();
step(1);
