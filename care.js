// Care guide tab: irrigation plan + maintenance calendar from /guides (yardplan-guides). Everything here is lazy:
// guide-ui.js -> location.js pulls data/zcta.js (0.8 MB) and data/climate-stations.js (1.8 MB) only when the tab opens.
// Classic globals used: state (app.js: zip, zoneLabel), PLANTS/PLANT_SIZE (data.js), ZIP_FALLBACK (if present), go.
const $ = s => document.querySelector(s);
let modsP = null, jsPdfP = null, guide = null, lastKey = '', overlayOn = false;
const loadMods = () => modsP || (modsP = Promise.all([import('./guides/guide-ui.js'), import('./guides/location.js'), import('./guides/catalog.js')]).catch(e => { modsP = null; throw e; }));
const loadJsPdf = () => jsPdfP || (jsPdfP = window.jspdf ? Promise.resolve() : new Promise((ok, bad) => { const s = document.createElement('script'); s.src = 'contractor/vendor/jspdf.umd.min.js'; s.onload = ok; s.onerror = () => { jsPdfP = null; bad(new Error('Could not load the PDF library')); }; document.head.appendChild(s); }));
let cssEl = null; const ensureCss = () => { if (!cssEl) { cssEl = document.createElement('link'); cssEl.rel = 'stylesheet'; cssEl.href = 'guides/guide.css'; document.head.appendChild(cssEl); } };
const msg = (html) => { $('#careOut').innerHTML = `<div class="empty">${html}</div>`; $('#careTools').hidden = true; guide = null; };

async function show(force) {
  ensureCss();
  const api = window.planApi; let design = null, manifold = null;
  if (api?.ready?.()) { design = api.serialize(); manifold = api.manifold(); }
  else { try { design = JSON.parse(localStorage.getItem('yardplan.design.v3')); } catch {} if (design) { const w = design.yard.w, d = design.yard.d; design.house = design.house || { x: -w / 2 - 7.2, z: -2, side: 'left', isDefault: true }; manifold = { x: -w / 2 + 1.5, z: Math.max(-d / 2 + 1.5, Math.min(d / 2 - 1.5, design.house.z)) }; } }
  const zip = (state.zip || '95814').trim(); // default: Sacramento, CA until the user sets a ZIP
  $('#careZip').value = zip;
  if (!design || !design.items.some(i => i.kind === 'plant' || ['lawn', 'mulch', 'gravel', 'dg', 'path'].includes(i.kind))) return msg('<b>Pick a design first</b>Pick a style in <a href="#" data-go="home">Design</a>, or add beds and plants in the <a href="#" data-go="site">Site plan</a>. The irrigation plan and care calendar are built from that design.');
  if (!/^\d{5}$/.test(zip)) return msg('<b>Enter your ZIP</b>The watering schedule and care calendar use your local climate (NOAA normals) and USDA zone.');
  const key = JSON.stringify([design, zip, state.zoneLabel, $('#careSrc').value, $('#carePsi').value, $('#careGpm').value]);
  if (!force && key === lastKey && guide) return;
  $('#careOut').innerHTML = '<div class="empty"><b>Loading local climate data…</b>(about 2.6 MB, first time only)</div>';
  let mods; try { [mods] = [await loadMods(), await loadJsPdf().catch(() => null)]; } catch (e) { return msg('<b>Could not load the guide</b>' + esc(e.message)); }
  const [ui, loc, cat] = mods;
  const location = loc.getLocation(zip, { zone: state.zoneLabel || undefined, zipFallback: typeof ZIP_FALLBACK !== 'undefined' ? ZIP_FALLBACK : undefined });
  if (!location) return msg(`<b>ZIP ${esc(zip)} isn't in our offline ZIP table</b>Try a nearby ZIP.`);
  const el = document.createElement('div'); $('#careOut').replaceChildren(el);
  try {
    guide = ui.renderGuide(el, { design, zip, location, catalog: cat.catalogFromGlobals({ PLANTS, PLANT_SIZE }), manifold, jsPDF: window.jspdf?.jsPDF,
      waterSource: $('#careSrc').value, pressurePsi: +$('#carePsi').value || undefined, flowGpm: +$('#careGpm').value || undefined, tab: $('#careOut').dataset.tab || 'irrigation' });
  } catch (e) { console.warn(e); return msg('<b>Could not build the guide</b>' + esc(e.message)); }
  if (!window.jspdf) el.querySelector('[data-act=pdf]').disabled = true;
  const G = guide.maintenance, W = guide.irrigation.waterUse, m = new Date().getMonth(), byId = new Map(G.tasks.map(t => [t.id, t]));
  const mon = (G.months[m]?.tasks || []).map(id => byId.get(id)).filter(Boolean); let nm = m, up = mon;
  if (!up.length) for (let k = 1; k < 12 && !up.length; k++) { nm = (m + k) % 12; up = (G.months[nm]?.tasks || []).map(id => byId.get(id)).filter(Boolean); }
  const MN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.querySelector('#tab-care .care-hero')?.remove(); const hero = document.createElement('div'); hero.className = 'care-hero';
  hero.innerHTML = `<div class="care-nums"><div class="card card--stat"><span class="footnote">Water a year</span><b class="num">${Math.round(W.annualGallons).toLocaleString()} gal</b><span class="footnote">${W.savingsPct}% less than lawn</span></div>
   <div class="card card--stat"><span class="footnote">Yard care</span><b class="num">~${Math.round(G.annual.hours)} h</b><span class="footnote">a year, doing it yourself</span></div>
   <div class="card card--stat"><span class="footnote">Supplies</span><b class="num">$${Math.round(G.annual.diyCost).toLocaleString()}</b><span class="footnote">a year</span></div></div>
   <section class="month-card"><h2>${nm === m ? 'This month' : 'Next up: ' + MN[nm]}</h2>${up.slice(0, 3).map(t => `<label><input type="checkbox"><span><b>${esc(t.title)}</b><small>${t.minutes} min${t.details ? ' · ' + esc(t.details) : ''}</small></span></label>`).join('')}
   <button class="btn btn--primary btn--block btn--lg" type="button" id="careCal" style="margin-top:16px">Add to calendar</button></section>${mweloCard(guide.irrigation.mwelo)}`;
  document.querySelector('#tab-care .sechead').after(hero); hero.querySelector('#careCal').onclick = () => guide.exportIcs();
  lastKey = key; $('#careTools').hidden = false; window.careApi.guide = guide;
  el.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { $('#careOut').dataset.tab = b.dataset.tab; }));
  const I = guide.irrigation; $('#careSum').textContent = `${I.hydrozones.length} hydrozones · ${I.valveCount} valves · manifold at the house (${design.house.side} side${design.house.isDefault ? ', default' : ''})`;
  if (overlayOn && api?.ready?.()) api.setIrrigation(I);
}
function mweloCard(M) {
  if (!M) return '';
  const pct = M.mawaGallons ? Math.round(100 * M.etwuGallons / M.mawaGallons) : 0;
  return `<section class="card mwelo-card"><span class="footnote">Water allowance (California)</span><b class="num">${M.compliant ? 'Within allowance' : 'Over allowance'}</b>
   <div class="bar" aria-hidden="true"><i style="--p:${Math.min(100, pct)}%"></i></div>
   <p class="footnote">Uses about ${M.etwuGallons.toLocaleString()} of the ${M.mawaGallons.toLocaleString()} gal a year the state water ordinance (MWELO) allows for ${M.landscapeSqft.toLocaleString()} sq ft (${pct}%). ${M.applies ? 'A permit check applies at this size.' : 'Below the size where a permit check applies.'}</p>
   ${M.hints?.length ? `<p class="footnote">${esc(M.hints[0])}</p>` : ''}<p class="footnote">Estimate for planning, not the official worksheet. Check with your city or water supplier.</p></section>`;
}
window.onCareShow = () => show().catch(e => console.warn(e));
window.addEventListener('yardplan:design', () => { lastKey = ''; });
$('#careZipForm').onsubmit = e => { e.preventDefault(); const z = $('#careZip').value.trim(); if (!/^\d{5}$/.test(z)) return; const f = $('#zipForm'), i = $('#zip'); i.value = z; f.requestSubmit(); setTimeout(() => show(true), 600); };
['careSrc', 'carePsi', 'careGpm'].forEach(id => $('#' + id).onchange = () => show(true));
$('#careOverlay').onclick = () => { overlayOn = !overlayOn; $('#careOverlay').classList.toggle('on', overlayOn); if (overlayOn) go('site'); window.planApi.whenReady().then(() => window.planApi.setIrrigation(overlayOn && guide ? guide.irrigation : null)); };
$('#careParts').onclick = () => { if (!guide || !window.proApi) return; const n = window.proApi.addIrrigation(guide.irrigation); $('#careParts').textContent = `✓ ${n} irrigation parts in price book`; };
$('#careHouse').onclick = () => { go('site'); setTimeout(() => $('#plHouse').click(), 300); };
window.careApi = { show, overlay: on => { overlayOn = on; window.planApi.setIrrigation(on && guide ? guide.irrigation : null); }, guide: null };
