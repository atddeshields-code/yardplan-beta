// Photo tools (no 3D, no WebGL): the user's photo with plant pins and optional to-scale measurement rings.
// Plant positions live on the ground plane in feet; a plain pinhole camera model (ground / drone) or an orthographic
// top-down scale maps them to the photo. The positions only feed the AI render guide and the measurement overlay.
const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);
const D2R = Math.PI / 180;
const st = { view: 'ground', horizon: .42, fov: 50, camH: 5.5, tilt: 40, alt: 100, ftPerPx: null, natW: 0, natH: 0, tool: null, ref: null, scaleLine: null, measure: false };
let items = [], selected = null, placing = null; const imgEl = $('#ovImg');
const fovRad = () => st.fov * D2R;
const pitchRad = () => st.view === 'drone' ? -st.tilt * D2R : -Math.atan((.5 - st.horizon) * 2 * Math.tan(fovRad() / 2));
const camHeight = () => st.view === 'drone' ? st.alt : st.camH;
const aspect = () => st.natW / st.natH || 1.5;
// world (x, 0, z) ft -> image fraction {x, y, z: depth}; null if behind the camera
function project(x, z) {
  if (st.view === 'top') { const w = st.natW * st.ftPerPx, h = st.natH * st.ftPerPx; return { x: .5 + x / w, y: .5 + z / h, d: 1 }; }
  const a = -pitchRad(), y0 = -camHeight(), yc = y0 * Math.cos(a) - z * Math.sin(a), zc = y0 * Math.sin(a) + z * Math.cos(a);
  if (zc >= -0.3) return null; const t = Math.tan(fovRad() / 2);
  return { x: .5 + (x / -zc) / (t * aspect()) / 2, y: .5 - (yc / -zc) / t / 2, d: -zc };
}
// image fraction -> ground point {x, z} ft; null above the horizon
function groundAt(f) {
  if (st.view === 'top') { const w = st.natW * st.ftPerPx, h = st.natH * st.ftPerPx; return { x: (f.x - .5) * w, z: (f.y - .5) * h }; }
  const t = Math.tan(fovRad() / 2), dx = (f.x * 2 - 1) * t * aspect(), dy = -(f.y * 2 - 1) * t, dz = -1, p = pitchRad();
  const wy = dy * Math.cos(p) - dz * Math.sin(p), wz = dy * Math.sin(p) + dz * Math.cos(p); if (wy >= -1e-4) return null;
  const k = camHeight() / -wy, g = { x: dx * k, z: wz * k }; return Math.hypot(g.x, g.z) > 3000 ? null : g;
}
const render = () => drawGuides();
function layout() {
  if (!st.natW) return; const stage = $('#ovStage'); const maxH = innerHeight * .72; const cw = stage.parentElement.clientWidth;
  let w = cw, h = cw * st.natH / st.natW; if (h > maxH) { h = maxH; w = h * st.natW / st.natH; }
  stage.style.width = w + 'px'; stage.style.height = h + 'px'; const g = $('#ovGuide'); g.width = Math.round(w * devicePixelRatio); g.height = Math.round(h * devicePixelRatio); drawGuides();
}
new ResizeObserver(layout).observe($('#ovStage'));
// ---- metadata-based view guess ----
async function readMeta(file) {
  const out = {}; try {
    const buf = await file.slice(0, 262144).arrayBuffer(), dv = new DataView(buf); const txt = new TextDecoder('latin1').decode(new Uint8Array(buf));
    let m = txt.match(/GimbalPitchDegree\s*=?\s*["'>]?\s*\+?(-?[\d.]+)/); if (m) out.gimbalPitch = +m[1];
    m = txt.match(/RelativeAltitude\s*=?\s*["'>]?\s*\+?(-?[\d.]+)/); if (m) out.relAlt = +m[1];
    if (dv.getUint16(0) === 0xFFD8) { let p = 2; while (p < dv.byteLength - 10) { const mk = dv.getUint16(p), len = dv.getUint16(p + 2); if (mk === 0xFFE1 && txt.substr(p + 4, 4) === 'Exif') { tiff(dv, p + 10, out); break; } if ((mk & 0xFF00) !== 0xFF00) break; p += 2 + len; } }
  } catch (e) { } return out;
}
function tiff(dv, t, out) {
  const le = dv.getUint16(t) === 0x4949, u16 = o => dv.getUint16(o, le), u32 = o => dv.getUint32(o, le);
  const str = (o, n) => { let s = ''; for (let i = 0; i < n - 1 && o + i < dv.byteLength; i++) { const c = dv.getUint8(o + i); if (!c) break; s += String.fromCharCode(c); } return s; };
  const ifd = (off, cb) => { const n = u16(t + off); for (let i = 0; i < n; i++) { const e = t + off + 2 + i * 12; cb(u16(e), u32(e + 4), e + 8); } };
  let ex = 0; ifd(u32(t + 4), (tag, cnt, vo) => { if (tag === 0x10f) out.make = str(cnt > 4 ? t + u32(vo) : vo, cnt); if (tag === 0x110) out.model = str(cnt > 4 ? t + u32(vo) : vo, cnt); if (tag === 0x8769) ex = u32(vo); });
  if (ex) ifd(ex, (tag, cnt, vo) => { if (tag === 0xa405) out.f35 = u16(vo); });
}
function guessView(meta) {
  if (meta.f35) { const diag = 2 * Math.atan(43.27 / (2 * meta.f35)); const ar = st.natW / st.natH; st.fov = Math.round(2 * Math.atan(Math.tan(diag / 2) / Math.sqrt(1 + ar * ar)) / D2R); }
  if (meta.gimbalPitch != null) {
    if (meta.relAlt) st.alt = Math.round(meta.relAlt * 3.281);
    if (meta.gimbalPitch <= -75) return ['top', `Drone photo looking straight down (gimbal ${meta.gimbalPitch}°). Draw a scale line to set the size.`];
    st.tilt = Math.round(-meta.gimbalPitch); return ['drone', `Drone photo (gimbal ${meta.gimbalPitch}°${meta.relAlt ? `, ${st.alt} ft up` : ''}). Camera set from the photo's metadata.`];
  }
  if (/DJI|Parrot|Autel|Skydio/i.test(meta.make || '')) return ['drone', `Drone photo (${meta.make}). Adjust the tilt and altitude to match.`];
  if (meta.make) return ['ground', `Camera photo (${meta.make} ${meta.model || ''}). Set the horizon, then add a reference height.`];
  return [null, "No camera metadata (this happens with screenshots and edited images). Pick the view type above."];
}
// ---- photo loading ----
$('#ownPhoto').onchange = e => { $('#photo').disabled = !e.target.checked; $('#photoBtn').setAttribute('aria-disabled', String(!e.target.checked)); };
$('#photoBtn').addEventListener('click', e => { if (!$('#ownPhoto').checked) { e.preventDefault(); $('#viewGuess').textContent = 'Tick "This is my photo" first. Only upload photos you took or have permission to use.'; } });
$('#photo').onchange = async e => {
  const f = e.target.files[0]; if (!f) return; if (!$('#ownPhoto').checked) { e.target.value = ''; return; } st.source = 'own'; st.attribution = ''; await loadImage(await normalizePhoto(f), f); };
// Apply EXIF orientation and cap the size (phones store portrait photos sideways + an orientation tag; canvases ignore it).
async function normalizePhoto(f, maxPx = 2400) {
  let bmp; try { bmp = await createImageBitmap(f, { imageOrientation: 'from-image' }); } catch { return f; }
  const k = Math.min(1, maxPx / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.(); return await new Promise(ok => c.toBlob(b => ok(b || f), 'image/jpeg', .9));
}
async function rotatePhoto() {
  if (!st.natW) return; const c = document.createElement('canvas'); c.width = st.natH; c.height = st.natW; const x = c.getContext('2d');
  x.translate(c.width / 2, c.height / 2); x.rotate(Math.PI / 2); x.drawImage(imgEl, -st.natW / 2, -st.natH / 2);
  const b = await new Promise(ok => c.toBlob(ok, 'image/jpeg', .92)); const v = st.view; items.length = 0; selected = null;
  await loadImage(b, null, { view: v, st: {}, msg: 'Rotated.' });
}
async function loadImage(blob, metaFile, preset) {
  const f = metaFile;
  const url = URL.createObjectURL(blob); await new Promise(r => { imgEl.onload = r; imgEl.src = url; });
  st.natW = imgEl.naturalWidth; st.natH = imgEl.naturalHeight; st.ftPerPx = 120 / st.natW; st.scaleSet = false; st.ref = null; st.scaleLine = null;
  if (preset) { $('#ovEmpty').hidden = true; $('#exportBtn').disabled = false; Object.assign(st, preset.st); setView(preset.view || 'top', true); $('#viewGuess').textContent = preset.msg; syncInputs(); layout(); return; }
  const meta = await readMeta(f); const [v, msg] = guessView(meta);
  $('#ovEmpty').hidden = true; $('#exportBtn').disabled = false;
  setView(v || 'ground', true); $('#viewGuess').textContent = (v ? 'Auto-detected: ' : '') + msg; syncInputs(); layout();
}
// ---- USDA NAIP aerial (public domain) via the USGS National Map image service; geocode: ZIP centroid (offline table) or U.S. Census geocoder (JSONP) ----
const NAIP = 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage';
const NAIP_ATTR = 'Imagery: USDA NAIP (public domain) via USGS The National Map';
function censusGeocode(q) { return new Promise((ok, bad) => { const cb = '__ypGeo' + Date.now(), s = document.createElement('script'); const done = () => { delete window[cb]; s.remove(); clearTimeout(t); };
  const t = setTimeout(() => { done(); bad(new Error('Address lookup timed out')); }, 15000);
  window[cb] = d => { done(); const m = d?.result?.addressMatches?.[0]; m ? ok({ lat: m.coordinates.y, lon: m.coordinates.x, label: m.matchedAddress }) : bad(new Error('Address not found. Try street, city, state or a ZIP.')); };
  s.onerror = () => { done(); bad(new Error('Address lookup failed')); };
  s.src = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=jsonp&callback=' + cb + '&address=' + encodeURIComponent(q); document.head.appendChild(s); }); }
async function geocode(q) {
  if (/^\d{5}$/.test(q)) { const ZCTA = (await import('./guides/data/zcta.js')).default; const ll = ZCTA[q]; if (!ll) throw new Error('ZIP not found'); return { lat: ll[0], lon: ll[1], label: 'the center of ZIP ' + q + ' (enter a street address to center on your lot)', zip: true }; }
  return censusGeocode(q);
}
async function loadNaip(q, sizeFt = 240) {
  const g = await geocode(q); const R = 6378137, x = g.lon * Math.PI / 180 * R, y = Math.log(Math.tan(Math.PI / 4 + g.lat * Math.PI / 360)) * R;
  const half = sizeFt * 0.3048 / 2 / Math.cos(g.lat * Math.PI / 180); // Web Mercator metres per ground metre
  const px = 768, url = `${NAIP}?bbox=${x - half},${y - half},${x + half},${y + half}&bboxSR=3857&imageSR=3857&size=${px},${px}&format=jpg&f=image`;
  let r = null; for (let k = 0; k < 3 && !(r && r.ok); k++) { try { r = await fetch(url); } catch { r = null; } } // the USGS service is slow (~30 s) and sometimes 502s
  if (!r || !r.ok) throw new Error('The USDA imagery service is busy right now (it can take up to a minute). Please try again.');
  const bmp = await createImageBitmap(await r.blob()); const c = document.createElement('canvas'); c.width = px; c.height = px; const x2 = c.getContext('2d');
  x2.drawImage(bmp, 0, 0, px, px); x2.font = '600 14px system-ui, sans-serif'; const tw = x2.measureText(NAIP_ATTR).width;
  x2.fillStyle = 'rgba(0,0,0,.55)'; x2.fillRect(px - tw - 16, 0, tw + 16, 24); x2.fillStyle = '#fff'; x2.fillText(NAIP_ATTR, px - tw - 8, 17);
  const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', .9));
  st.source = 'naip'; st.attribution = NAIP_ATTR;
  await loadImage(blob, null, { st: { ftPerPx: sizeFt / px, scaleSet: true }, msg: `Top-down USDA aerial, ${sizeFt} × ${sizeFt} ft around ${g.label}. Scale is set from the map (${(sizeFt / px * 12).toFixed(1)} in per pixel). ${NAIP_ATTR}.` });
  return g;
}
$('#naipForm').onsubmit = async e => { e.preventDefault(); const q = $('#naipQ').value.trim(); if (!q) return; const m = $('#naipMsg'), old = m.dataset.old || (m.dataset.old = m.textContent);
  m.textContent = 'Loading USDA aerial… the public USGS service can take 30–60 seconds.'; try { await loadNaip(q); m.textContent = old; } catch (err) { m.textContent = err.message + ' ' + old; } };
function setView(v, quiet) {
  st.view = v; $$('#viewSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); $('.calib').dataset.v = v; setTool(null);
  if (!quiet) $('#viewGuess').textContent = { ground: 'Ground level: drag the horizon slider to where the ground meets the sky, then set a reference height.', drone: 'Drone (angled): match the tilt and altitude, or set a reference height.', top: 'Top-down: draw a scale line over something with a known length.' }[v];
  render();
}
$('#viewSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; setView(b.dataset.v); };
const fmt = { horizon: v => `${Math.round(v * 100)}% from top`, tilt: v => `${v}°`, alt: v => `${v} ft`, fov: v => `${v}°` };
function syncInputs() {
  $('#horizon').value = st.horizon * 100; $('#tilt').value = st.tilt; $('#alt').value = st.alt; $('#fov').value = st.fov;
  $('#horVal').textContent = fmt.horizon(st.horizon); $('#tiltVal').textContent = fmt.tilt(st.tilt); $('#altVal').textContent = fmt.alt(st.alt); $('#fovVal').textContent = fmt.fov(st.fov);
  $('#camHVal').textContent = camHeight().toFixed(1) + ' ft';
  $('#scaleVal').textContent = !st.ftPerPx ? 'not set' : st.scaleSet ? `${(1 / st.ftPerPx).toFixed(2)} px per ft` : `not set yet (assuming the photo is 120 ft wide, ${(1 / st.ftPerPx).toFixed(2)} px per ft)`;
}
for (const [id, key, k] of [['horizon', 'horizon', .01], ['tilt', 'tilt', 1], ['alt', 'alt', 1], ['fov', 'fov', 1]]) $('#' + id).oninput = e => { st[key] = +e.target.value * k; syncInputs(); render(); };
function setTool(t) { st.tool = t; $('#refBtn').classList.toggle('active', t === 'ref'); $('#scaleBtn').classList.toggle('active', t === 'scale'); if (t) { const r = $('#ovStage').getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) $('#ovStage').scrollIntoView({ block: 'center' }); setPlacing(null); ovHint(t === 'ref' ? 'Drag from the base to the top of your reference object.' : 'Drag along the object with the known length.'); } else ovHint(''); drawGuides(); }
$('#refBtn').onclick = () => setTool(st.tool === 'ref' ? null : 'ref');
$('#scaleBtn').onclick = () => setTool(st.tool === 'scale' ? null : 'scale');
$('#refH').oninput = () => { if (st.ref) applyRef(); }; $('#scaleL').oninput = () => { if (st.scaleLine) applyScale(); };
const belowHoriz = yf => Math.atan((yf - .5) * 2 * Math.tan(fovRad() / 2)) - pitchRad();
function applyRef() {
  const { a, b } = st.ref; const base = Math.max(a.y, b.y), top = Math.min(a.y, b.y); const H = +$('#refH').value || 7;
  const tb = belowHoriz(base), tt = belowHoriz(top);
  if (tb <= .002) { ovHint('The base of the reference must be below the horizon line. Move the horizon up first.'); return; }
  const camH = H / (1 - Math.tan(tt) / Math.tan(tb));
  if (!(camH > .5 && camH < 3000)) { ovHint('That reference does not fit the current horizon. Adjust the horizon and try again.'); return; }
  if (st.view === 'drone') st.alt = Math.round(camH); else st.camH = camH;
  syncInputs(); render(); ovHint(`Camera height set to ${camH.toFixed(1)} ft from your ${H} ft reference.`);
}
function applyScale() { const { a, b } = st.scaleLine; const px = Math.hypot((a.x - b.x) * st.natW, (a.y - b.y) * st.natH); if (px < 5) return; st.ftPerPx = (+$('#scaleL').value || 20) / px; st.scaleSet = true; syncInputs(); render(); ovHint(`Scale set: ${(+$('#scaleL').value)} ft = ${Math.round(px)} px.`); }
const widthFt = it => (PLANT_SIZE[it.id]?.w || 3) * it.s;
function drawGuides() {
  const g = $('#ovGuide'), x = g.getContext('2d'); x.clearRect(0, 0, g.width, g.height); if (!st.natW) return;
  const W = g.width, H = g.height, d = devicePixelRatio; x.lineWidth = 2 * d; x.font = `600 ${12 * d}px Inter, system-ui, sans-serif`;
  if (st.view === 'ground') { const y = st.horizon * H; x.setLineDash([8 * d, 6 * d]); x.strokeStyle = 'rgba(255,255,255,.9)'; x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke(); x.setLineDash([]); label(x, 'horizon', 8 * d, y - 6 * d); }
  const line = (l, txt, col) => { if (!l) return; x.strokeStyle = col; x.lineWidth = 3 * d; x.beginPath(); x.moveTo(l.a.x * W, l.a.y * H); x.lineTo(l.b.x * W, l.b.y * H); x.stroke(); for (const p of [l.a, l.b]) { x.fillStyle = col; x.beginPath(); x.arc(p.x * W, p.y * H, 5 * d, 0, 7); x.fill(); } label(x, txt, (l.a.x + l.b.x) / 2 * W + 8 * d, (l.a.y + l.b.y) / 2 * H); };
  const flat = st.view === 'top' ? 1 : st.view === 'drone' ? .6 : .35;
  projectItems().forEach(p => { const px = p.x * W, py = p.y * H, it = items[p.i], on = it === selected;
    if (st.measure) { const R = Math.max(4 * d, p.r * W); x.setLineDash([6 * d, 4 * d]); x.strokeStyle = on ? '#f2b84b' : 'rgba(255,255,255,.95)'; x.lineWidth = 2 * d; x.beginPath(); x.ellipse(px, py, R, R * flat, 0, 0, 7); x.stroke(); x.setLineDash([]);
      const pl = PLANTS.find(q => q.id === p.id); label(x, `${pl ? pl.name : p.id} · ${Math.round(widthFt(it))} ft wide`, px + R + 4 * d, py); }
    x.fillStyle = on ? '#f2b84b' : '#00873A'; x.strokeStyle = '#fff'; x.lineWidth = 2 * d; x.beginPath(); x.arc(px, py, 6 * d, 0, 7); x.fill(); x.stroke(); });
  if (st.view !== 'top') line(st.ref, `${$('#refH').value} ft`, '#f2b84b'); else line(st.scaleLine, `${$('#scaleL').value} ft`, '#f2b84b');
  function label(x, t, px, py) { const w = x.measureText(t).width + 10 * d; x.fillStyle = 'rgba(17,17,17,.78)'; x.fillRect(px - 4 * d, py - 14 * d, w, 18 * d); x.fillStyle = '#fff'; x.fillText(t, px + d, py); }
}
function ovHint(t) { const h = $('#ovHint'); h.hidden = !t; h.textContent = t; }
function setPlacing(id) { placing = id; $$('#palette button').forEach(b => b.classList.toggle('on', b.dataset.id === id)); if (id) ovHint(`Tap the ground in the photo to place ${PLANTS.find(p => p.id === id).name}.`); }
$('#palette').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (!st.natW) { ovHint('Upload a photo first.'); return; } setTool(null); setPlacing(placing === b.dataset.id ? null : b.dataset.id); });
function addPlant(id, p) { const it = { id, x: p.x, z: p.z, s: 1, rot: 0 }; items.push(it); select(it); return it; }
function select(it) { selected = it || null; render(); }
function frac(e) { const r = $('#ovGuide').getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; }
function pick(f) { let best = null, bd = 1e9; for (const p of projectItems()) { const dd = Math.hypot((p.x - f.x) * st.natW, (p.y - f.y) * st.natH) / Math.max(st.natW, st.natH); const lim = Math.max(.03, p.r * .9); if (dd < lim && dd < bd) { bd = dd; best = items[p.i]; } } return best; }
const ptrs = new Map(); let gest = null, downAt = null; const G = $('#ovGuide');
G.addEventListener('pointerdown', e => {
  if (!st.natW) return; G.setPointerCapture(e.pointerId); const f = frac(e); ptrs.set(e.pointerId, f); downAt = { f, t: Date.now() };
  if (st.tool && ptrs.size === 1) { const l = { a: f, b: f }; if (st.tool === 'ref') st.ref = l; else st.scaleLine = l; gest = { type: 'line' }; return; }
  if (ptrs.size === 1) { if (placing) { gest = null; return; } const it = pick(f); if (it) { select(it); const g = groundAt(f); gest = { type: 'drag', off: g ? { x: g.x - it.x, z: g.z - it.z } : { x: 0, z: 0 } }; } else gest = null; }
  else if (ptrs.size === 2 && selected) { const [a, b] = [...ptrs.values()]; gest = { type: 'pinch', d: Math.hypot((b.x - a.x) * st.natW, (b.y - a.y) * st.natH), s: selected.s }; }
});
G.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return; const f = frac(e); ptrs.set(e.pointerId, f); if (!gest) return;
  if (gest.type === 'line') { (st.tool === 'ref' ? st.ref : st.scaleLine).b = f; drawGuides(); }
  else if (gest.type === 'drag' && ptrs.size === 1 && selected) { const g = groundAt(f); if (g) { selected.x = g.x - gest.off.x; selected.z = g.z - gest.off.z; render(); } }
  else if (gest.type === 'pinch' && ptrs.size === 2 && selected) { const [a, b] = [...ptrs.values()]; selected.s = Math.max(.2, Math.min(4, gest.s * Math.hypot((b.x - a.x) * st.natW, (b.y - a.y) * st.natH) / gest.d)); render(); }
});
G.addEventListener('pointerup', e => {
  if (!ptrs.has(e.pointerId)) return; const f = frac(e); ptrs.delete(e.pointerId);
  if (gest?.type === 'line') { gest = null; const l = st.tool === 'ref' ? st.ref : st.scaleLine; if (Math.hypot(l.a.x - l.b.x, l.a.y - l.b.y) > .01) { st.tool === 'ref' ? applyRef() : applyScale(); } const keep = $('#ovHint').textContent; setTool(null); ovHint(keep); return; }
  if (ptrs.size === 0) gest = null;
  if (placing && downAt && Math.hypot(f.x - downAt.f.x, f.y - downAt.f.y) < .015) {
    const g = groundAt(f); if (!g) { ovHint('That spot is above the horizon. Tap on the ground.'); return; }
    addPlant(placing, g); ovHint(`Placed ${PLANTS.find(p => p.id === placing).name}. Tap again to add more, or tap the plant in the list to stop.`);
  } else if (!placing && downAt && Math.hypot(f.x - downAt.f.x, f.y - downAt.f.y) < .01 && !pick(f)) select(null);
});
G.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); gest = null; });
G.addEventListener('wheel', e => { if (!selected) return; e.preventDefault(); selected.s = Math.max(.2, Math.min(4, selected.s * (e.deltaY < 0 ? 1.08 : .92))); render(); }, { passive: false });
$('#bigger').onclick = () => { if (selected) { selected.s = Math.min(4, selected.s * 1.15); render(); } };
$('#smaller').onclick = () => { if (selected) { selected.s = Math.max(.2, selected.s / 1.15); render(); } };
$('#del').onclick = () => { if (!selected) return; items = items.filter(i => i !== selected); select(null); };
$('#exportBtn').onclick = () => {
  const r = window.renderHook?.lastResult; if (!r || r.mock) { ovHint('Export is available once the photoreal render is ready.'); return; }
  const a = document.createElement('a'); a.download = 'yardplan-render.jpg'; a.href = r.dataURL || r.imageUrl; a.target = '_blank'; a.click();
};
function photoJpeg(maxPx = 1600, q = .85) { const k = Math.min(1, maxPx / Math.max(st.natW, st.natH)), c = document.createElement('canvas'); c.width = Math.round(st.natW * k); c.height = Math.round(st.natH * k); c.getContext('2d').drawImage(imgEl, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', q); }
// Before image for proposals and the render request. "after" is the same photo: the only "after" users ever see is the AI render.
function captureBeforeAfter(maxPx = 1600, q = .85) { if (!st.natW) return null; const before = photoJpeg(maxPx, q); return { before, after: before, plants: items.length, view: st.view }; }
window.onOverlayShow = () => layout();
syncInputs();
// [{id, x, y, r, i}] image fractions; r = canopy radius as a fraction of image width.
function projectItems() {
  if (!st.natW) return []; const out = [];
  items.forEach((it, i) => { const c = project(it.x, it.z); if (!c) return; const e = project(it.x + widthFt(it) / 2, it.z); if (!e) return;
    if (c.x < -.05 || c.x > 1.05 || c.y < -.05 || c.y > 1.05) return; out.push({ id: it.id, x: Math.min(1, Math.max(0, c.x)), y: Math.min(1, Math.max(0, c.y)), r: Math.abs(e.x - c.x), i }); });
  return out;
}
async function loadFile(f) { $('#ownPhoto').checked = true; $('#ownPhoto').onchange({ target: $('#ownPhoto') }); st.source = 'own'; st.attribution = ''; const b = await normalizePhoto(f); await loadImage(b, f); return b; }
async function autoPlace(ids) {
  if (!st.natW) return 0; items.length = 0; selected = null;
  const top = st.view === 'top', rows = [[.68], [.8], [.9]];
  const sorted = [...ids].sort((a, b) => (PLANT_SIZE[b]?.h || 0) - (PLANT_SIZE[a]?.h || 0)), per = Math.ceil(sorted.length / 3); let n = 0;
  sorted.forEach((id, i) => { const row = Math.min(2, Math.floor(i / per)), inRow = sorted.filter((_, j) => Math.min(2, Math.floor(j / per)) === row), fx = (inRow.indexOf(id) + 1) / (inRow.length + 1);
    const g = groundAt(top ? { x: .15 + row * .35, y: .2 + fx * .6 } : { x: .08 + fx * .84, y: rows[row][0] }); if (g) { items.push({ id, x: g.x, z: g.z, s: 1, rot: 0 }); n++; } });
  select(null); return n;
}
window.overlayApi = { rotatePhoto, imageUrl: () => imgEl.src, geocode, loadFile, autoPlace, setMeasure: on => { st.measure = !!on; drawGuides(); }, loadNaip, projectItems, project, groundAt, captureBeforeAfter, hasPhoto: () => !!st.natW, st, items: () => items, render, setView, syncInputs, applyRef, applyScale, addPlant, select: i => select(items[i]), ready: () => true };
