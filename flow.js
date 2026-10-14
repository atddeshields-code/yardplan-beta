// Homeowner Design flow (v10, per yardplan-research/design-system.md + homeowner-microcopy.md):
// Landing → 1 Photo (consent + ZIP) → 2 Style → 3 Preview (render when a backend exists) → 4 Tweak → 5 Plan.
// One primary button per screen (sticky bottom bar). Classic globals: state, PLANTS, PLANT3D, STYLES, esc, go, fits.
const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);
const HAS_RENDER = !!window.YARDPLAN_RENDER_URL;
const F = { step: 0, photo: false, sample: false, style: '', plants: [], ground: '', plan: null, mode: localStorage.getItem('yardplan.mode.who') || 'diy', saved: false,
  budget: +localStorage.getItem('yardplan.budget') || 10000, tier: null, edits: null, utility: localStorage.getItem('yardplan.utility') || '', turfSf: +localStorage.getItem('yardplan.turfSf') || 0 };
const flow = $('#flow'), next = $('#fNext'), back = $('#fBack');
const money = n => '$' + Math.round(+n || 0).toLocaleString('en-US');
const moneyK = n => n >= 1000 ? '$' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : money(n);
const styleName = () => (STYLES.find(s => s.id === F.style)?.name || '').split(' /')[0];
const SHORT = { modern: 'Clean lines, grasses, gravel', cottage: 'Soft, colorful, full of flowers', xeriscape: 'Low water, big texture', woodland: 'Shady, layered, natural', japanese: 'Calm, mossy, stone and maple', prairie: 'Native grasses and wildflowers', mediterranean: 'Silvery, fragrant, sun-loving', formal: 'Clipped hedges and symmetry', tropical: 'Big leaves, bold color' };
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 4000); }
// ---------- before/after slider (§3.5) ----------
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
// ---------- step machine ----------
function step(n) {
  F.step = n = Math.max(0, Math.min(5, n)); flow.dataset.step = n; document.body.dataset.step = n;
  $$('#flow .step').forEach(s => s.hidden = +s.dataset.step !== n);
  $('.steps').hidden = n === 0;
  $$('.steps li').forEach(li => { const s = +li.dataset.s; li.classList.toggle('is-done', s < n); li.classList.toggle('is-current', s === n); li.toggleAttribute('aria-current', s === n); li.tabIndex = s < n ? 0 : -1; });
  $('#stepSr').textContent = n ? `Step ${n} of 5` : '';
  back.hidden = n === 0;
  if (n === 2) renderStyles(); if (n === 3) renderPreview(); if (n === 4) renderTweak(); if (n === 5) renderPlan();
  update(); const h = $(`#flow .step[data-step="${n}"] h1`); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } window.scrollTo({ top: 0 });
}
function update() {
  const n = F.step; let label = 'Continue', ok = true;
  if (n === 0) label = 'Start with a photo';
  if (n === 1) { ok = (F.photo || !!window.overlayApi?.hasPhoto?.()) && !!state.zone; label = !F.photo && !window.overlayApi?.hasPhoto?.() ? 'Add a photo to continue' : !state.zone ? 'Enter your ZIP to continue' : 'Continue'; }
  if (n === 2) { ok = !!F.style; label = F.style ? `See my yard in ${styleName()}` : 'Tap a style to continue'; }
  if (n === 3) label = 'Tweak plants and materials';
  if (n === 4) label = HAS_RENDER ? 'Update render' : 'See my plan';
  if (n === 5) label = F.saved ? 'Open care guide' : 'Save';
  next.disabled = !ok; next.setAttribute('aria-disabled', String(!ok)); next.textContent = label;
}
$('.steps').addEventListener('click', e => { const li = e.target.closest('li.is-done'); if (li) step(+li.dataset.s); });
$('.steps').addEventListener('keydown', e => { const li = e.target.closest('li.is-done'); if (li && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); step(+li.dataset.s); } });
next.onclick = async () => {
  const n = F.step;
  if (n === 2) { F.edits = null; F.tier = null; try { const base = designFor(F.style, F.plants.length ? F.plants : pickPlants(F.style), F.ground || defaultGround(F.style)); if (totalFor(await priceDesign(base)) > F.budget) F.tier = 'better'; } catch (e) { console.warn(e); } F.placed = false; }
  if (n === 4) { F.manual = null; buildDesign(); if (HAS_RENDER) { step(3); return; } }
  if (n === 5) { if (F.saved) go('care'); else { savePlan(); update(); } return; }
  step(n + 1);
};
back.onclick = () => step(F.step - 1);
window.addEventListener('yardplan:zone', () => { update(); if (F.step === 2) renderStyles(); });
// ---------- 1 Photo ----------
$('#fOwn').onchange = e => { const on = e.target.checked; $('#fPhoto').disabled = !on; $('#fDrop').setAttribute('aria-disabled', String(!on)); $('#fDropTxt').textContent = on ? 'JPG, PNG or HEIC' : 'Tick the box below first'; };
$('#fDrop').addEventListener('click', e => { if (!$('#fOwn').checked) { e.preventDefault(); const c = $('.chk.own'); c.classList.add('nudge'); $('#fOwn').focus(); setTimeout(() => c.classList.remove('nudge'), 600); } });
$('#fPhoto').onchange = async e => {
  const f = e.target.files[0]; if (!f || !$('#fOwn').checked) return;
  if (!/^image\//.test(f.type) && !/\.(heic|heif|jpe?g|png|webp)$/i.test(f.name)) { $('#fDropTxt').textContent = "That file isn't a photo. Try a JPG, PNG or HEIC."; return; }
  $('#fDropTxt').textContent = 'Getting your photo ready…';
  try { const b = await window.overlayApi.loadFile(f); setPhoto(URL.createObjectURL(b)); F.sample = false; }
  catch (err) { $('#fDropTxt').textContent = "We couldn't open that photo. Try another one."; }
  update();
};
function setPhoto(url) { F.photo = true; const d = $('#fDrop'); d.style.backgroundImage = `url("${url}")`; d.classList.add('has'); $('#fDropTxt').textContent = 'Tap to change photo'; }
$('#fAddrGo').onclick = async () => {
  const q = $('#fAddr').value.trim(); if (q.length < 5) return; const m = $('#fAddrMsg'); m.textContent = 'Finding your address…';
  try { const g = await window.overlayApi.geocode(q); const zip = (/(\d{5})(?:-\d{4})?\s*$/.exec(g.label || '') || [])[1];
    if (zip && zip !== state.zip) { $('#zip').value = zip; $('#zipForm').requestSubmit(); }
    m.textContent = 'Loading the aerial view… this can take up to a minute.';
    await window.overlayApi.loadNaip(q); setPhoto(window.overlayApi.imageUrl()); m.textContent = `Aerial loaded for ${g.label}. Imagery: USDA NAIP (public domain).`; update();
  } catch (err) { m.textContent = err.message; }
};
// sample yard
$('#lSample').onclick = async () => {
  const b = await (await fetch('render/assets/yard-before.jpg')).blob(); await window.overlayApi.loadFile(new File([b], 'sample-yard.jpg', { type: 'image/jpeg' }));
  F.sample = true; F.photo = true; setPhoto('render/assets/yard-before.jpg'); $('#fOwn').checked = true; $('#fOwn').onchange({ target: $('#fOwn') });
  if (!state.zone) { $('#zip').value = '95814'; $('#zipForm').requestSubmit(); }
  F.style = 'xeriscape'; await new Promise(r => { const t = setInterval(() => { if (state.zone) { clearInterval(t); r(); } }, 100); setTimeout(() => { clearInterval(t); r(); }, 5000); });
  buildDesign(true); step(3);
};
// ---------- 2 Style ----------
function renderStyles() {
  $('#fStyles').innerHTML = STYLES.map(s => { const n = PLANTS.filter(p => p.styles.includes(s.id) && fits(p)).length;
    return `<button class="card card--interactive fsc${F.style === s.id ? ' card--selected' : ''}" role="radio" aria-checked="${F.style === s.id}" data-id="${s.id}" ${n < 3 ? 'disabled' : ''}><img class="card__media" src="img/styles/${s.id}-800.webp" srcset="img/styles/${s.id}-800.webp 800w, img/styles/${s.id}-1600.webp 1600w" sizes="(min-width: 900px) 400px, 100vw" alt="" loading="lazy"><span class="card__body"><b class="card__title">${esc(s.name.split(' /')[0])}</b><span class="fsc__cost footnote" aria-live="polite">${n < 3 ? '' : 'Pricing…'}</span><span class="footnote">${n < 3 ? 'Few plants for your zone' : esc(SHORT[s.id] || '')}</span></span><i class="tick" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></i></button>`; }).join('');
  $('#fStyleHelp').textContent = state.zone ? `Plants are chosen to do well in Zone ${state.zoneLabel}.` : '';
  setBudget(F.budget); setWho(F.mode);
}
$('#fStyles').onclick = e => { const b = e.target.closest('[data-id]'); if (!b || b.disabled) return; if (F.style !== b.dataset.id) { F.style = b.dataset.id; F.plants = []; F.ground = ''; }
  localStorage.setItem('yardplan.style', F.style); $$('#fStyles .fsc').forEach(x => { const on = x === b; x.classList.toggle('card--selected', on); x.setAttribute('aria-checked', on); }); update(); };
// ---------- budget (Style step) ----------
const BMIN = 1000, BMAX = 50000, toT = b => Math.round(100 * Math.log(b / BMIN) / Math.log(BMAX / BMIN)), fromT = t => { const v = BMIN * Math.pow(BMAX / BMIN, t / 100); return v < 10000 ? Math.round(v / 250) * 250 : Math.round(v / 1000) * 1000; };
const fmtB = b => Math.round(b).toLocaleString();
function setBudget(b, from) {
  F.budget = Math.max(500, Math.min(250000, Math.round(+b || 0))); localStorage.setItem('yardplan.budget', F.budget);
  if (from !== 'input') $('#bInput').value = fmtB(F.budget); if (from !== 'range') $('#bRange').value = toT(Math.min(BMAX, Math.max(BMIN, F.budget)));
  $('#bRange').style.setProperty('--p', toT(Math.min(BMAX, Math.max(BMIN, F.budget))) + '%');
  $$('#bPresets [data-b]').forEach(c => c.setAttribute('aria-pressed', +c.dataset.b === F.budget)); F.fitDone = false; scheduleStyleCosts();
}
function setWho(m) { F.mode = m; localStorage.setItem('yardplan.mode.who', m); $$('#bMode [data-m]').forEach(b => b.setAttribute('aria-checked', b.dataset.m === m)); F.fitDone = false; scheduleStyleCosts(); }
$('#bRange').oninput = e => setBudget(fromT(+e.target.value), 'range');
$('#bInput').oninput = e => { const v = +e.target.value.replace(/[^\d]/g, ''); if (v) setBudget(v, 'input'); };
$('#bInput').onblur = () => $('#bInput').value = fmtB(F.budget);
$('#bPresets').onclick = e => { const c = e.target.closest('[data-b]'); if (c) setBudget(+c.dataset.b); };
$('#bMode').onclick = e => { const b = e.target.closest('[data-m]'); if (b) setWho(b.dataset.m); };
// ---------- pricing: ONE path shared with Pro mode (contractor/budget-fit.js) ----------
// homeownerEstimate().pro.total === proBid().rounded.total for the same design, so "hire a pro" here matches the Pro bid.
let BF = null, REB = null; const loadCostMods = () => Promise.all([import('./contractor/budget-fit.js'), import('./contractor/data/rebates.js')]).then(([m, r]) => (BF = m, REB = r.REBATE_RULES, m));
loadCostMods().catch(e => console.warn(e));
const CATALOG = () => ({ plants: PLANTS, plant3d: PLANT3D });
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
  if (F.step !== 2 || !window.proApi?.book?.()) return; const m = BF || await loadCostMods();
  for (const s of STYLES) { const card = $(`#fStyles .fsc[data-id="${s.id}"]`); if (!card || card.disabled) continue;
    try { const base = designFor(s.id, pickPlants(s.id), defaultGround(s.id)); let tot = totalFor(await priceDesign(base)), ok = tot <= F.budget, txt;
      if (ok) txt = `About ${moneyK(tot)} · fits`;
      else { const f = m.fitBudget(fitReq(base)); if (f.belowMinimum) txt = `From ${moneyK(f.minViable)} · over budget`; else { tot = totalFor(await priceDesign(applyEdits(base, editsOf(f)))); ok = tot <= F.budget; txt = ok ? `About ${moneyK(tot)} · fits with trims` : `From ${moneyK(tot)} · over budget`; } }
      const tag = card.querySelector('.fsc__cost'); tag.textContent = txt; tag.classList.toggle('is-over', !ok); card.dataset.fit = ok ? '1' : '0'; } catch (e) { console.warn(e); } }
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
  F.design = applyEdits(F.base, F.edits); localStorage.setItem('yardplan.design3d.v2', JSON.stringify(F.design));
  if (window.planApi?.ready?.()) window.planApi.apply(F.design); window.dispatchEvent(new Event('yardplan:design'));
  F.placed = false; F.plan = null; F.saved = false;
}
async function placeOnPhoto() {
  const o = window.overlayApi; if (!o?.hasPhoto?.() || F.placed) return; const ids = []; F.plants.forEach(id => { ids.push(id); if (PLANTS.find(p => p.id === id)?.type !== 'tree') ids.push(id); });
  await o.autoPlace(ids.slice(0, 10)); F.placed = true;
}
// ---------- 3 Preview ----------
async function renderPreview() {
  if (!F.design) buildDesign();
  const el = $('#fPreview'); const photoUrl = window.overlayApi?.imageUrl?.() || '';
  el.innerHTML = `<h1>${HAS_RENDER ? `Here's your yard in ${esc(styleName())}` : `Your yard in ${esc(styleName())}`}</h1><p class="lead">${HAS_RENDER ? 'Drag the slider to compare.' : 'Each circle is a plant at its full-grown width.'}</p>
   <div class="stage" id="pStage">${HAS_RENDER ? `<div class="render-wait" id="pWait" role="status" aria-live="polite"><img src="${photoUrl}" alt="" class="render-wait__photo"><div class="render-wait__sweep" aria-hidden="true"></div><div class="render-wait__panel"><p class="render-wait__msg" id="pMsg">Reading your yard…</p><div class="bar"><i id="pBar" style="--p:8%"></i></div></div></div>` : ''}
    <figure class="ba photo" id="pBA" style="--pos:${HAS_RENDER ? 50 : 100}%" ${HAS_RENDER ? 'hidden' : ''}><img class="ba__before" id="pBefore" src="${photoUrl}" alt="Your yard today"><div class="ba__after"><img id="pAfter" alt="AI concept of your yard"></div>
     <canvas class="measure" id="pMeasure" aria-hidden="true" hidden></canvas>${HAS_RENDER ? '<span class="ba__tag ba__tag--l">Before</span><span class="ba__tag ba__tag--r">After</span><span class="ai-label">AI concept · not to scale</span><div class="ba__handle" role="slider" tabindex="0" aria-label="Before and after comparison" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"></div>' : ''}
     ${F.sample ? '<span class="sample-banner">Sample yard: this isn\'t your home.</span>' : ''}</figure></div>
   <div class="stage-ctl">${HAS_RENDER ? '<div class="seg2" role="radiogroup" aria-label="View"><button role="radio" aria-checked="false" data-v="before">Before</button><button role="radio" aria-checked="true" data-v="after">After</button></div>' : ''}
    <label class="switch"><input type="checkbox" id="pMeas" ${HAS_RENDER ? '' : 'checked'}><span>Show measurements</span></label><button class="btn btn--ghost btn--sm" type="button" id="pAdjust">Adjust</button></div>`;
  $('#pAdjust').onclick = () => openSheet('#adjustSheet');
  await placeOnPhoto(); if (!HAS_RENDER) $('#pBefore').src = window.overlayApi.imageUrl();
  const meas = () => drawMeasure($('#pMeas').checked); $('#pMeas').onchange = meas; $('#pBefore').onload = meas; meas();
  if (!HAS_RENDER) return;
  const setPos = slider($('#pBA')); $$('.seg2 button').forEach(b => b.onclick = () => { $$('.seg2 button').forEach(x => x.setAttribute('aria-checked', x === b)); setPos(b.dataset.v === 'before' ? 100 : 0); });
  const msgs = ['Reading your yard…', 'Finding the ground and the edges…', `Choosing plants for Zone ${state.zoneLabel || ''}…`, 'Planting and mulching…', 'Adding the finishing touches…', 'Almost there…'];
  let i = 0, t0 = Date.now(); window.renderHook?.refresh?.(true);
  const iv = setInterval(() => { if (F.step !== 3) return clearInterval(iv); const h = window.renderHook, res = h?.lastResult, s = h?.status || {};
    if (res && !res.mock && s.state === 'done') { clearInterval(iv); $('#pBar').style.setProperty('--p', '100%'); $('#pAfter').src = res.dataURL || res.imageUrl; $('#pWait').hidden = true; $('#pBA').hidden = false; drawMeasure($('#pMeas').checked); return; }
    if (s.state === 'failed' || s.state === 'unavailable') { clearInterval(iv); $('#pWait').hidden = true; $('#pBA').hidden = false; $('#pBA').style.setProperty('--pos', '100%'); toast("We couldn't make your render this time. Your design is safe. Try again in a minute."); return; }
    const el = (Date.now() - t0) / 1000; if (++i % 8 === 0) $('#pMsg').textContent = el > 40 ? 'Taking a little longer than usual. Hang tight.' : msgs[Math.min(msgs.length - 1, Math.floor(i / 8))];
    $('#pBar').style.setProperty('--p', Math.min(90, 8 + el * 2) + '%'); }, 500);
}
function drawMeasure(on) {
  const c = $('#pMeasure'), img = $('#pBefore'); if (!c || !img) return; c.hidden = !on; if (!on) return;
  const r = img.getBoundingClientRect(), d = devicePixelRatio || 1; c.width = r.width * d; c.height = r.height * d; const x = c.getContext('2d'), W = c.width, H = c.height;
  // image is object-fit:cover inside the stage; map image fractions to the visible box
  const iw = img.naturalWidth || 1, ih = img.naturalHeight || 1, k = Math.max(r.width / iw, r.height / ih), ox = (r.width - iw * k) / 2, oy = (r.height - ih * k) / 2;
  const view = window.overlayApi.st?.view, flat = view === 'top' ? 1 : view === 'drone' ? .6 : .35;
  x.lineWidth = 2 * d; x.font = `600 ${12 * d}px -apple-system, "Inter", system-ui, sans-serif`;
  for (const p of window.overlayApi.projectItems()) {
    const px = (ox + p.x * iw * k) * d, py = (oy + p.y * ih * k) * d, R = Math.max(10 * d, p.r * iw * k * d), pl = PLANTS.find(q => q.id === p.id);
    x.setLineDash([6 * d, 4 * d]); x.strokeStyle = 'rgba(255,255,255,.95)'; x.beginPath(); x.ellipse(px, py, R, R * flat, 0, 0, 7); x.stroke(); x.setLineDash([]);
    x.fillStyle = '#00C805'; x.strokeStyle = '#fff'; x.beginPath(); x.arc(px, py, 6 * d, 0, 7); x.fill(); x.stroke();
    const t = `${pl?.name || p.id} · ${Math.round(PLANT3D[p.id]?.w || 3)} ft`, tw = x.measureText(t).width + 12 * d; x.fillStyle = 'rgba(20,20,22,.72)'; x.fillRect(px + 10 * d, py - 10 * d, tw, 20 * d); x.fillStyle = '#fff'; x.fillText(t, px + 16 * d, py + 4 * d);
  }
}
// ---------- 4 Tweak ----------
const GROUNDS = [['lawn', 'Lawn'], ['dg', 'Decomposed granite'], ['gravel', 'Gravel'], ['mulch', 'Mulch']];
function renderTweak() {
  if (!F.design) buildDesign();
  const P = F.plants.map(id => PLANTS.find(p => p.id === id)).filter(Boolean), w = { low: 'Low water', med: 'Some water', high: 'Needs regular water' };
  $('#fTweak').innerHTML = `<h1>Make it yours</h1><p class="lead">Swap plants and materials.${HAS_RENDER ? ' Tap Update to see the change.' : ''}</p>
   <div class="chips" role="tablist" aria-label="Tweak"><button class="chip" role="tab" aria-pressed="true" data-t="plants">Plants</button><button class="chip" role="tab" aria-pressed="false" data-t="ground">Ground</button></div>
   <ul class="plist" data-panel="plants">${P.map(p => `<li><img src="img/plants/${p.id}.jpg" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><div><b>${esc(p.name)}</b><span>${p.sun.includes('full') ? 'Full sun' : p.sun.includes('part') ? 'Part shade' : 'Shade'} · ${w[p.water]} · ${esc(p.size)}</span></div><button class="btn btn--secondary btn--sm" data-swap="${p.id}" aria-label="Swap ${esc(p.name)}">Swap</button></li>`).join('')}</ul>
   <div data-panel="ground" hidden><p class="footnote">The open area in the middle of the yard (about 480 sq ft).</p><div class="chips" role="radiogroup" aria-label="Ground">${GROUNDS.map(([k, n]) => `<button class="chip" role="radio" aria-pressed="${F.ground === k}" data-g="${k}">${n}</button>`).join('')}</div></div>
   <button class="btn btn--ghost btn--sm" type="button" id="tAdjust" style="margin-top:16px">Adjust photo and camera</button>`;
  $('#tAdjust').onclick = () => openSheet('#adjustSheet');
  $$('#fTweak [data-t]').forEach(b => b.onclick = () => { $$('#fTweak [data-t]').forEach(x => x.setAttribute('aria-pressed', x === b)); $$('#fTweak [data-panel]').forEach(p => p.hidden = p.dataset.panel !== b.dataset.t); });
  $$('#fTweak [data-g]').forEach(b => b.onclick = () => { F.ground = b.dataset.g; $$('#fTweak [data-g]').forEach(x => x.setAttribute('aria-pressed', x === b)); toast(HAS_RENDER ? 'Changed. Update the render to see it.' : 'Changed.'); });
  $$('#fTweak [data-swap]').forEach(b => b.onclick = () => openSwap(b.dataset.swap));
}
function openSwap(id) {
  const p = PLANTS.find(q => q.id === id), alts = PLANTS.filter(q => q.type === p.type && q.id !== id && fits(q) && !F.plants.includes(q.id)).slice(0, 12);
  $('#swapT').textContent = `Swap ${p.name} for…`; $('#swapHelp').textContent = `These all grow well in Zone ${state.zoneLabel || 'your zone'} and fit this spot.`;
  $('#swapList').innerHTML = alts.map(q => `<button class="prow" data-to="${q.id}"><img src="img/plants/${q.id}.jpg" alt="" decoding="sync" onerror="this.style.visibility='hidden'"><span><b>${esc(q.name)}</b><span>${esc(q.size)} · ${q.water === 'low' ? 'Low water' : q.water === 'med' ? 'Some water' : 'Needs regular water'}</span></span></button>`).join('') || '<p class="muted">No other matches for your zone.</p>';
  $('#swapList').onclick = e => { const b = e.target.closest('[data-to]'); if (!b) return; F.plants = F.plants.map(x => x === id ? b.dataset.to : x); closeSheet('#swapSheet'); renderTweak(); toast(HAS_RENDER ? 'Swapped. Update the render to see it.' : 'Swapped.'); };
  openSheet('#swapSheet');
}
// ---------- sheets ----------
function openSheet(sel) { const d = $(sel); if (!d.open) d.showModal(); }
function closeSheet(sel) { const d = $(sel); if (d.open) d.close(); }
$$('dialog.sheet').forEach(d => { d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]') || e.target.closest('[data-go]')) d.close(); }); });
$('#adjustSheet').addEventListener('click', async e => { const b = e.target.closest('[data-adj=rotate]'); if (b) { await window.overlayApi.rotatePhoto(); F.placed = false; if (F.step === 3) renderPreview(); toast('Rotated.'); }
  const v = e.target.closest('[data-v]'); if (v) { window.overlayApi.setView(v.dataset.v); $$('#adjView .chip').forEach(x => x.setAttribute('aria-pressed', x === v)); F.placed = false; if (F.step === 3) renderPreview(); } });
$('#adjustSheet').addEventListener('close', () => {});
document.getElementById('adjustSheet').addEventListener('toggle', () => { const v = window.overlayApi?.st?.view; $$('#adjView .chip').forEach(x => x.setAttribute('aria-pressed', x.dataset.v === v)); });
// ---------- 5 Plan ----------
async function renderPlan() {
  buildDesign(); const P = F.plants.map(id => PLANTS.find(p => p.id === id)).filter(Boolean);
  $('#fPlan').innerHTML = `<h1>Your plan</h1>
   <section class="estimate" aria-labelledby="estL"><p id="estL" class="footnote">${F.mode === 'diy' ? 'Estimated total · do it yourself' : 'Estimated total · hire a pro'}</p><p class="hero-number" id="pCost"><span class="skeleton skeleton--text" style="width:5ch;display:inline-block"></span></p>
    <p class="footnote" id="pOf">of your ${money(F.budget)} budget · <button type="button" class="linkbtn" id="pBudgetEdit">Change</button></p>
    <div class="meter" id="pMeter" role="meter" aria-label="Spending versus budget" aria-valuemin="0" aria-valuemax="${F.budget}" aria-valuenow="0"><i></i></div>
    <p class="meter__status" id="pStatus" aria-live="polite"></p>
    <div class="chips" role="radiogroup" aria-label="Who does the work"><button class="chip" role="radio" aria-pressed="${F.mode === 'diy'}" data-m="diy">DIY</button><button class="chip" role="radio" aria-pressed="${F.mode === 'pro'}" data-m="pro">Hire a pro</button></div>
    <p class="callout" id="pRange"></p>
    <div class="fit" id="pFit" aria-live="polite"></div>
    <div class="rebate" id="pRebate" aria-live="polite"></div>
    ${F.mode === 'pro' ? '<button class="btn btn--secondary btn--lg" type="button" id="pQuotes" style="width:100%;margin:8px 0">Get quotes from local pros</button>' : ''}<p class="footnote">An estimate from example prices${state.zip ? ' near ' + esc(state.zip) : ''}, not a quote. Prices change. Check with your store or contractor.</p></section>
   <div class="cards2"><button class="card card--stat card--interactive" data-go="care"><span class="footnote">Watering plan</span><b class="num" id="pWater">…</b><span class="footnote" id="pWaterS">Estimating…</span></button>
    <button class="card card--stat card--interactive" data-go="care"><span class="footnote">Care guide</span><b class="num">Month by month</b><span class="footnote">When to water, prune and feed. <u>Open guide</u></span></button></div>
   <div class="sec"><h2>Plants</h2><span class="footnote" id="pBreak"></span></div>
   <ul class="plist">${P.map(p => `<li><img src="img/plants/${p.id}.jpg" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><div><b>${esc(p.name)}</b><span>${esc(p.size)} · ${p.water === 'low' ? 'Low water' : p.water === 'med' ? 'Some water' : 'Needs regular water'}</span></div></li>`).join('')}</ul>
   <div class="sec"><h2>Ground</h2><span class="footnote">${GROUNDS.find(g => g[0] === F.ground)?.[1] || ''} · mulched beds · paver path</span></div>
   <p class="footnote legal">For planning only, not for construction. Call 811 before you dig.</p>`;
  $$('#fPlan [data-m]').forEach(b => b.onclick = () => { setWho(b.dataset.m); renderPlan(); });
  $('#pBudgetEdit').onclick = () => step(2);
  const q = $('#pQuotes'); if (q) q.onclick = () => window.mpApi?.getQuotes({ bid: F.bid, takeoff: F.takeoff, zip: state.zip, style: styleName(), photo: window.overlayApi?.hasPhoto?.() ? window.overlayApi.imageUrl() : null, render: window.renderHook?.lastResult && !window.renderHook.lastResult.mock ? (window.renderHook.lastResult.dataURL || window.renderHook.lastResult.imageUrl) : null });
  try { await cost(); } catch (e) { console.warn(e); $('#pCost').textContent = '—'; }
  try { await water(); } catch (e) { $('#pWater').textContent = '—'; $('#pWaterS').textContent = 'Add your ZIP to estimate water use.'; }
}
async function cost() {
  const P = await priceDesign(F.design), { t, bid, diy, pro } = P, total = totalFor(P), B = F.budget;
  F.bid = bid; F.takeoff = t; F.plan = { diy, pro, plants: P.plantsDiy, materials: P.materialsDiy, budget: B, total, rebate: P.rebate?.amount || 0 };
  $('#pCost').textContent = money(total);
  const pct = Math.min(100, total / B * 100), over = total > B, m = $('#pMeter');
  m.style.setProperty('--p', pct + '%'); m.classList.toggle('is-over', over); m.setAttribute('aria-valuenow', Math.round(total)); m.setAttribute('aria-valuetext', `${money(total)} of ${money(B)}`);
  $('#pStatus').textContent = over ? `Over by ${money(total - B)}` : `Under budget by ${money(B - total)}`; $('#pStatus').className = 'meter__status ' + (over ? 'is-over' : 'is-under');
  $('#pRange').textContent = F.mode === 'diy' ? `Materials ${money(P.materialsDiy)} · plants ${money(P.plantsDiy)}. Hiring a pro: about ${money(pro)}.` : `Priced the same way as a contractor's bid for this plan. Doing it yourself: about ${money(diy)} in materials and plants.`;
  $('#pBreak').textContent = `${t.plants.reduce((a, p) => a + p.count, 0)} plants · ${money(P.plantsDiy)}`;
  renderRebate(P.rebate, total);
  fitSuggestions(total, over).catch(e => console.warn(e));
}
// Turf-removal rebate: amount, net after rebate, pre-approval, source, and a utility check when we only matched the ZIP.
function renderRebate(r, total) {
  const el = $('#pRebate'), sf = turfSf(F.base), est = !F.turfSf;
  const turf = `<label class="rebate__turf">Grass you're replacing <span class="inwrap"><input id="pTurf" inputmode="numeric" value="${sf}" aria-label="Square feet of grass you're replacing"> sq ft</span></label>${est ? '<small class="footnote">Our guess from the new beds and paths. Change it to match your lawn.</small>' : ''}`;
  if (!state.zip) { el.innerHTML = ''; return; }
  if (!r || !r.amount) { el.innerHTML = `<div class="rebate__card"><p class="rebate__h">No turf rebate found${r?.notes?.length ? '' : ` for ZIP ${esc(state.zip)}`}</p>${(r?.notes || []).map(n => `<p class="footnote">${esc(n)}</p>`).join('')}${turf}${utilityPick(r)}</div>`; bindRebate(); return; }
  const pr = r.programs[0], names = r.programs.map(p => esc(p.name)).join(' + ');
  el.innerHTML = `<div class="rebate__card"><p class="rebate__h">Rebate: up to ${money(r.amount)} from ${names}</p>
    <p class="rebate__net">Net after rebate: <b>${money(Math.max(0, total - r.amount))}</b></p>
    ${r.preApprovalRequired ? `<p class="footnote"><b>Get pre-approval before you remove any grass.</b> It's paid back as a reimbursement after the work${r.programs.some(p => p.effectiveTo) ? `; this offer runs until ${esc(new Date(r.programs.find(p => p.effectiveTo).effectiveTo + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))}` : ''}. Your budget bar doesn't count it.</p>` : ''}
    ${r.programs.map(p => `<p class="footnote">Source: <a href="${esc(p.sourceUrl)}" target="_blank" rel="noopener">${esc(p.name)}</a></p>`).join('')}
    ${turf}${utilityPick(r)}</div>`;
  bindRebate();
}
// Programs that serve this ZIP, so the user can say which utility bills them for water.
function utilityPick(r) {
  if (!REB || !state.zip) return '';
  const cands = REB.filter(x => x.verified && !x.addOnOnly && (x.zipPrefixes || []).some(p => state.zip.startsWith(p)));
  const agencies = [...new Map(cands.map(x => [x.agency, x.utilities[0]])).entries()];
  if (!agencies.length || (!r?.needsUtilityConfirmation && !F.utility)) return '';
  return `<div class="rebate__util">${r?.needsUtilityConfirmation ? '<p class="footnote"><b>Confirm your water utility.</b> We matched by ZIP only, and utility areas don\'t follow ZIPs. Check the name on your water bill.</p>' : ''}
    <label class="field">Water utility<select id="pUtil"><option value="">Not sure (show the most conservative)</option>${agencies.map(([a, u]) => `<option value="${esc(u)}"${F.utility === u ? ' selected' : ''}>${esc(a)}</option>`).join('')}</select></label></div>`;
}
function bindRebate() {
  const tf = $('#pTurf'); if (tf) tf.onchange = () => { const v = Math.max(0, Math.round(+tf.value.replace(/[^\d.]/g, '') || 0)); F.turfSf = v; localStorage.setItem('yardplan.turfSf', v || ''); cost().catch(e => console.warn(e)); };
  const u = $('#pUtil'); if (u) u.onchange = () => { F.utility = u.value; localStorage.setItem('yardplan.utility', u.value); cost().catch(e => console.warn(e)); };
}
// Budget fit (contractor/budget-fit.js): Good / Better / Best fits of the designed plan, plus the biggest single savings.
async function fitSuggestions(total, over) {
  const el = $('#pFit'), m = BF || await loadCostMods(), req = fitReq(F.base);
  const tiers = m.fitTiers(req), rows = [];
  const NAMES = { good: ['Good', 'Saves the most'], better: ['Better', 'Fits your budget'], best: ['Best', 'Closest to the full design'] };
  for (const k of ['good', 'better', 'best']) { const f = tiers[k], ed = editsOf(f), d = applyEdits(F.base, ed), tot = totalFor(await priceDesign(d));
    rows.push({ k, ed, tot, n: Object.keys(ed).length, impact: Math.round(f.impactScore * 100), below: f.belowMinimum }); }
  const designed = totalFor(await priceDesign(F.base));
  // single changes from the Better fit, grouped per item (largest saving first)
  const better = tiers.better, by = {}; for (const c of better.changes) by[c.itemIndex] = (by[c.itemIndex] || 0) + c.saved;
  const curEd = F.edits || {}, singles = Object.entries(by).filter(([i, sv]) => sv > 0 && !(i in curEd)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([i, sv]) => {
    const sel = better.selections[+i], it = F.base.items[+i], nm = it.kind === 'plant' ? (PLANTS.find(p => p.id === it.id)?.name || 'Plant') : ({ path: 'Paver path', dg: 'DG area', mulch: 'Mulch bed', gravel: 'Gravel area', lawn: 'Lawn', wall: 'Wall' }[it.kind] || it.kind);
    return { i: +i, sv, label: `${nm}: ${sel.label.toLowerCase()}`, item: sel.item }; });
  if (F.step !== 5) return;
  const cur = F.manual ? 'custom' : F.tier || 'designed', fmtRow = (id, name, sub, tot) => `<button type="button" class="fit__row${cur === id ? ' is-on' : ''}" data-tier="${id}" aria-pressed="${cur === id}"><span>${name}<small>${sub}</small></span><b class="${tot <= F.budget ? 'is-save' : ''}">${money(tot)}</b></button>`;
  el.innerHTML = `<p class="fit__h">${over ? 'Fit to budget' : 'Ways to spend your budget'}</p>`
    + (over && singles.length ? singles.map((r, j) => `<button type="button" class="fit__row" data-one="${j}"><span>${esc(r.label)}<small>One change</small></span><b class="is-save">−${money(r.sv)}</b></button>`).join('') : '')
    + (!over && rows.every(r => !r.n) ? `<p class="footnote">Your full design fits your budget with room to spare, so there's nothing to cut.</p>` : rows.map(r => fmtRow(r.k, `${NAMES[r.k][0]} · ${money(Math.round(F.budget * m.TIER_MULTS[r.k]))} target`, r.below ? 'Leanest version of this design' : `${NAMES[r.k][1]} · ${r.n ? `${r.n} change${r.n === 1 ? '' : 's'}, keeps ${r.impact}% of the look` : 'nothing cut'}`, r.tot)).join(''))
    + fmtRow('designed', 'As designed', 'Every plant and path as planned', designed)
    + (over && !rows[1].below ? `<button type="button" class="btn btn--secondary btn--block" id="pFitAll">Fit to budget · ${money(rows[1].tot)}</button>` : '')
    + (rows[1].below ? `<p class="footnote">Even the leanest version of this design is over ${money(F.budget)}. Try a lower-cost style or raise the budget.</p>` : '')
    + '<p class="footnote">Fits keep grading, drainage and irrigation as designed. Fit targets include a 10–15% contingency.</p>';
  el.querySelectorAll('[data-tier]').forEach(b => b.onclick = () => { const t = b.dataset.tier; F.manual = null; F.tier = t === 'designed' ? null : t; F.placed = false; renderPlan(); toast(t === 'designed' ? 'Back to the full design.' : `Switched to the ${NAMES[t][0]} fit.`); });
  el.querySelectorAll('[data-one]').forEach(b => b.onclick = () => { const r = singles[+b.dataset.one]; F.manual = { ...(F.edits || {}), [r.i]: r.item ? { ...r.item } : null }; F.placed = false; renderPlan(); toast(`Saved about ${money(r.sv)}.`); });
  const fa = $('#pFitAll'); if (fa) fa.onclick = () => { F.manual = null; F.tier = 'better'; F.placed = false; renderPlan(); toast('Fitted to your budget.'); };
}
async function water() {
  if (!state.zip) throw new Error('no zip');
  const [irr, loc, cat] = await Promise.all([import('./guides/irrigation.js'), import('./guides/location.js'), import('./guides/catalog.js')]);
  const location = loc.getLocation(state.zip, { zone: state.zoneLabel || undefined }); if (!location) throw new Error('zip');
  const plan = irr.generateIrrigationPlan(F.design, { zip: state.zip, location, catalog: cat.catalogFromGlobals({ PLANTS, PLANT3D }) }), w = plan.waterUse;
  $('#pWater').textContent = `${w.savingsPct}% less`; $('#pWaterS').textContent = `About ${w.annualGallons.toLocaleString()} gal a year vs. an all-lawn yard.`;
}
// ---------- My plans ----------
const PKEY = 'yardplan.plans.v1'; const plans = () => { try { return JSON.parse(localStorage.getItem(PKEY)) || []; } catch { return []; } };
async function thumb() { const u = window.overlayApi?.imageUrl?.(); if (!u || !window.overlayApi.hasPhoto()) return `img/styles/${F.style}-800.webp`;
  const im = new Image(); im.src = u; await im.decode().catch(() => {}); const c = document.createElement('canvas'), k = 240 / Math.max(im.naturalWidth || 1, im.naturalHeight || 1); c.width = (im.naturalWidth || 1) * k; c.height = (im.naturalHeight || 1) * k; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', .7); }
async function savePlan() {
  try { const list = plans(), now = new Date(); list.unshift({ id: now.getTime().toString(36), name: `${styleName()} yard`, style: F.style, plants: F.plants, ground: F.ground, zip: state.zip, zone: state.zoneLabel, cost: F.plan, thumb: await thumb(), created: now.toISOString() });
    localStorage.setItem(PKEY, JSON.stringify(list.slice(0, 20))); F.saved = true; update(); toast('Design saved'); renderPlans(); }
  catch (e) { toast("We couldn't save right now. Your design is still here. Try again."); }
}
function renderPlans() {
  const list = plans(), el = $('#plansList');
  el.innerHTML = list.length ? `<ul class="plans">${list.map(p => `<li><button class="prow" data-open="${p.id}"><img src="${p.thumb}" alt=""><span><b>${esc(p.name)}</b><span>${new Date(p.created).toLocaleDateString()} · Zone ${esc(p.zone || '?')}${p.cost ? ' · DIY ' + money(p.cost.diy) : ''}</span></span></button><button class="btn btn--ghost btn--sm" data-del="${p.id}" aria-label="Delete ${esc(p.name)}">Delete</button></li>`).join('')}</ul>`
    : `<section class="empty"><h2>No saved designs yet</h2><p class="muted">Your designs will show up here.</p><button class="btn btn--primary btn--lg" data-go="home">Start a design</button></section>`;
}
$('#plansList').onclick = e => {
  const o = e.target.closest('[data-open]'), d = e.target.closest('[data-del]');
  if (o) { const p = plans().find(x => x.id === o.dataset.open); Object.assign(F, { style: p.style, plants: p.plants, ground: p.ground, saved: true }); if (p.zip && p.zip !== state.zip) { $('#zip').value = p.zip; $('#zipForm').requestSubmit(); } go('home'); step(5); }
  if (d) { const p = plans().find(x => x.id === d.dataset.del); if (confirm(`Delete "${p.name}"? This can't be undone.`)) { localStorage.setItem(PKEY, JSON.stringify(plans().filter(x => x.id !== p.id))); renderPlans(); toast('Design deleted'); } }
};
const _go = window.go; window.addEventListener('click', e => { if (e.target.closest('[data-tab=plans],[data-go=plans]')) renderPlans(); }, true);
renderPlans();
window.flowApi = { step, state: F, pickPlants, designFor, renderPlans };
step(0);
