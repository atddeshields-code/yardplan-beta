// Front-end photoreal render module. ESM, no build step. Works in browsers; core logic is testable in Node (inject fetch/canvas).
//   const r = createRenderer({ apiBase: 'https://yardplan-render.x.workers.dev', mock: false });
//   const res = await r.generate({ image: dataURL, design, opts: { view: 'ground' }, onProgress });
//   attachToOverlay(window.overlayApi, { renderer: r, getDesign, stage: document.querySelector('#ovStage') });
import { buildRenderPrompt, VIEW_TYPES } from './prompt.js';
import { PLANTS } from './catalog.js';

export const LABEL = 'AI concept image, not to scale';
export function fnv(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); }
/** Fast photo hash: length + 4 KB sampled across the data URL (good enough to key a cache; not cryptographic). */
export function photoHash(dataURL) { const s = String(dataURL || ''); const step = Math.max(1, Math.floor(s.length / 4096)); let t = s.length + ':'; for (let i = 0; i < s.length; i += step) t += s[i]; return fnv(t); }
const stable = v => (Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${k}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v));
export function designHash(design, opts) { const d = { ...design, layout: (design?.layout || []).map(l => ({ id: l.id, x: +(+l.x).toFixed(2), y: +(+l.y).toFixed(2) })) }; return fnv(stable({ d, o: opts || {} })); }

export function nearestAspect(w, h) { if (!w || !h) return undefined; const r = w / h;
  const list = ['21:9', '2:1', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16', '1:2']; let best = list[0], d = 1e9;
  for (const a of list) { const [x, y] = a.split(':').map(Number); const e = Math.abs(Math.log(r / (x / y))); if (e < d) { d = e; best = a; } } return best; }

/** View type from overlay state (+ optional explicit hint): 'ground' | 'drone' | 'top'. */
export function detectViewType(st = {}, hint) {
  if (VIEW_TYPES.includes(hint)) return hint;
  if (st.view === 'top') return 'top'; if (st.view === 'drone') return 'drone';
  return 'ground';
}

/** Project overlay plants (feet, ground plane) to image fractions, replicating overlay3d.js setupCamera() math. */
export function projectOverlayItems(st, items, sizes = {}) {
  const out = []; const aspect = st.natW / st.natH || 1.5;
  for (const it of items || []) {
    const p = it.obj ? it.obj.position : it; const S = sizes[it.id] || PLANTS.find(q => q.id === it.id) || {}; const wft = (S.w || 3) * (it.obj?.scale?.x || 1);
    if (st.view === 'top') { const W = st.natW * st.ftPerPx, H = st.natH * st.ftPerPx; if (!W || !H) continue;
      const x = .5 + p.x / W, y = .5 + p.z / H; if (x >= 0 && x <= 1 && y >= 0 && y <= 1) out.push({ id: it.id, x, y, r: wft / 2 / W }); continue; }
    const fov = (st.fov || 50) * Math.PI / 180, t = Math.tan(fov / 2);
    const pitch = st.view === 'drone' ? -(st.tilt || 40) * Math.PI / 180 : -Math.atan((.5 - (st.horizon ?? .42)) * 2 * t);
    const H = st.view === 'drone' ? (st.alt || 100) : (st.camH || 5.5); const y0 = -H, z0 = p.z;
    const yc = y0 * Math.cos(pitch) + z0 * Math.sin(pitch), zc = -y0 * Math.sin(pitch) + z0 * Math.cos(pitch);
    if (zc >= -0.3) continue; const nx = (p.x / -zc) / (t * aspect), ny = (yc / -zc) / t; const x = (nx + 1) / 2, y = (1 - ny) / 2;
    if (x < -0.05 || x > 1.05 || y < -0.05 || y > 1.05) continue;
    out.push({ id: it.id, x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)), r: (wft / 2 / -zc) / (t * aspect) / 2 });
  }
  return out;
}

const TYPE_COLOR = { tree: '#1f7a3a', shrub: '#7fbf3f', perennial: '#d455c0', grass: '#e0c040', groundcover: '#40a0d0' };
/** Layout guide image: black background, a colored disc per plant (color = plant type, size = mature spread). Returns a data URL. */
export function makeGuideImage({ width, height, layout, view }, createCanvas = defaultCanvas) {
  const c = createCanvas(width, height); const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, width, height);
  for (const l of layout || []) { const p = PLANTS.find(q => q.id === l.id); const r = Math.max(4, (l.r || .02) * width);
    x.fillStyle = TYPE_COLOR[p?.type] || '#ffffff'; x.beginPath();
    if (view === 'top') x.arc(l.x * width, l.y * height, r, 0, Math.PI * 2); else x.ellipse(l.x * width, l.y * height - r * .6, r, r * 1.2, 0, 0, Math.PI * 2); // perspective: blob sits on the ground point
    x.fill(); }
  return c.toDataURL('image/png');
}
function defaultCanvas(w, h) { if (typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined') throw new Error('pass createCanvas'); const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function loadImage(src) { return new Promise((ok, no) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = () => no(new Error('image_load_failed')); i.src = src; }); }
/** Mock fallback when no sample: warm/green-tint the photo on a canvas (browser only). */
export async function tintPhoto(dataURL, createCanvas = defaultCanvas) {
  const img = await loadImage(dataURL); const c = createCanvas(img.naturalWidth, img.naturalHeight); const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const g = x.createLinearGradient(0, c.height * .35, 0, c.height); g.addColorStop(0, 'rgba(60,140,60,0)'); g.addColorStop(1, 'rgba(60,140,60,.35)');
  x.globalCompositeOperation = 'overlay'; x.fillStyle = g; x.fillRect(0, 0, c.width, c.height); x.globalCompositeOperation = 'source-over'; return c.toDataURL('image/jpeg', .9);
}

export class RenderError extends Error { constructor(code, msg, extra = {}) { super(msg || code); this.code = code; Object.assign(this, extra); } }

export function createRenderer({ apiBase = '', mock = false, sampleUrl = null, fetch: f = (...a) => globalThis.fetch(...a), cacheSize = 20, timeoutMs = 90000, mockDelayMs = 600, createCanvas, isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false) } = {}) {
  const cache = new Map(); const inflight = new Map(); let calls = 0;
  const useMock = mock || !apiBase;
  async function generate({ image, design = {}, opts = {}, guide = null, reference = null, mask = null, provider, onProgress = () => {}, signal, force = false } = {}) {
    if (!image) throw new RenderError('missing_image', 'Add a photo first.');
    const key = `${photoHash(image)}:${designHash(design, { ...opts, g: guide ? photoHash(guide) : 0, ref: reference ? photoHash(reference) : 0, m: mask ? photoHash(mask) : 0 })}`;
    if (!force && cache.has(key)) { onProgress({ stage: 'cached', pct: 100 }); return { ...cache.get(key), cached: true }; }
    if (inflight.has(key)) return inflight.get(key);
    const job = (async () => {
      onProgress({ stage: 'prompt', pct: 5 }); const local = buildRenderPrompt(design, { ...opts, provider: useMock ? 'mock' : provider || 'xai', guide: !!guide, mask: !!mask, styleRef: !!reference });
      let res;
      if (useMock) { onProgress({ stage: 'mock', pct: 40 }); await new Promise(r => setTimeout(r, mockDelayMs));
        const out = sampleUrl ? sampleUrl : await tintPhoto(image, createCanvas);
        res = { [out.startsWith('data:') ? 'dataURL' : 'imageUrl']: out, provider: 'mock', prompt: local.prompt, warnings: local.warnings, costEstimateUSD: 0, createdAt: new Date().toISOString(), mock: true };
      } else {
        if (!isOnline()) throw new RenderError('offline', 'You are offline. Showing the to-scale 3D overlay instead.');
        onProgress({ stage: 'upload', pct: 15 }); calls++;
        const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null; const tm = ctl && setTimeout(() => ctl.abort(), timeoutMs); if (signal && ctl) signal.addEventListener('abort', () => ctl.abort());
        let r; try { r = await f(`${apiBase.replace(/\/$/, '')}/api/render`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl?.signal,
          body: JSON.stringify({ image, guide, reference, mask, provider, aspect: opts.aspect, params: { design, opts } }) }); }
        catch (e) { throw new RenderError(e?.name === 'AbortError' ? 'timeout' : 'network', e?.name === 'AbortError' ? 'The render took too long.' : 'Could not reach the render service.'); }
        finally { tm && clearTimeout(tm); }
        onProgress({ stage: 'rendering', pct: 80 }); let j = null; try { j = await r.json(); } catch {}
        if (!r.ok) throw new RenderError(j?.error || `http_${r.status}`, humanError(j?.error, r.status), { status: r.status, retryAfter: j?.retryAfter });
        res = j; if (res.imageUrl && res.imageUrl.startsWith('/')) res.imageUrl = apiBase.replace(/\/$/, '') + res.imageUrl;
      }
      res.label = LABEL; res.key = key; onProgress({ stage: 'done', pct: 100 });
      cache.set(key, res); if (cache.size > cacheSize) cache.delete(cache.keys().next().value); return res;
    })();
    inflight.set(key, job); try { return await job; } finally { inflight.delete(key); }
  }
  return { generate, cache, get mock() { return useMock; }, get networkCalls() { return calls; }, clear: () => cache.clear() };
}
export function humanError(code, status) {
  return ({ rate_limited: 'Too many renders. Wait a minute and try again.', daily_ip_limit: 'Daily render limit reached for this device.', daily_budget_exhausted: 'Renders are paused for today (budget reached).',
    image_too_large: 'Photo is too large (max 8 MB).', unsupported_image_type: 'Use a JPEG, PNG or WebP photo.', all_providers_failed: 'The AI render service failed.', origin_not_allowed: 'This site is not allowed to use the render service.' })[code] || `Render failed (${code || status}).`;
}

/** Overlay design -> render design: plants placed in the overlay become layout hints (image fractions). */
export function designFromOverlay(overlayApi, base = {}) {
  const st = overlayApi.st || {}; const items = overlayApi.items ? overlayApi.items() : [];
  // Prefer the overlay's own camera (overlay3d.js projectItems) so the math lives in one place; fallback kept for tests/standalone use.
  const layout = typeof overlayApi.projectItems === 'function' ? overlayApi.projectItems() : projectOverlayItems(st, items); const counts = {}; for (const it of items) counts[it.id] = (counts[it.id] || 0) + 1;
  return { ...base, plants: Object.keys(counts).length ? Object.entries(counts).map(([id, count]) => ({ id, count })) : base.plants, layout };
}

/**
 * Make the photoreal render the DEFAULT overlay output. 3D overlay stays as the 'to-scale' toggle and is the fallback.
 * opts: { renderer, getDesign:()=>({style,zone,region,hardscape,...}), viewHint, stage:HTMLElement, debounceMs=1500, pollMs=1000, guide:true|'composite'|false,
 *         onStatus(status), onResult(res), createCanvas, schedule:{setTimeout,clearTimeout,setInterval,clearInterval} }
 * Returns { refresh(force), setMode('render'|'3d'), mode, status, lastResult, destroy() }.
 */
export function attachToOverlay(overlayApi, opts = {}) {
  const { renderer, getDesign = () => ({}), debounceMs = 1500, pollMs = 1000, onStatus = () => {}, onResult = () => {}, stage = null, guide = true } = opts;
  const T = opts.schedule || globalThis; let mode = 'render', timer = null, poll = null, lastSig = '', seq = 0;
  const api = { mode, status: { state: 'idle' }, lastResult: null };
  const ui = stage ? buildStageUI(stage, m => setMode(m), { sampleUrl: opts.sampleUrl, onMeasure: on => overlayApi.setMeasure && overlayApi.setMeasure(on) }) : null;
  function status(s) { api.status = s; onStatus(s); ui && ui.status(s); }
  function setMode(m) { mode = api.mode = m; ui && ui.mode(m, api.lastResult); }
  function signature() { if (!overlayApi.hasPhoto || !overlayApi.hasPhoto()) return ''; const d = designFromOverlay(overlayApi, getDesign()); return `${overlayApi.st?.natW}x${overlayApi.st?.natH}:${overlayApi.st?.view}:${designHash(d, {})}`; }
  function schedule() { T.clearTimeout(timer); status({ state: 'pending', message: 'Design changed. Rendering soon…' }); timer = T.setTimeout(() => refresh(false), debounceMs); }
  async function refresh(force = false) {
    T.clearTimeout(timer); if (!overlayApi.hasPhoto || !overlayApi.hasPhoto()) { status({ state: 'idle', message: 'Upload a photo to get a photoreal render.' }); return null; }
    if (!(overlayApi.items ? overlayApi.items().length : 1)) { status({ state: 'idle', message: 'Add plants to the photo, then a photoreal render is made automatically.' }); return null; }
    const my = ++seq; const st = overlayApi.st || {}; const view = detectViewType(st, opts.viewHint);
    const cap = overlayApi.captureBeforeAfter(1600, .85); if (!cap) return null;
    const design = designFromOverlay(overlayApi, getDesign()); const aspect = nearestAspect(st.natW, st.natH);
    let g = null; try { if (guide === 'composite') g = cap.after; else if (guide && design.layout.length) { const k = Math.min(1, 1024 / Math.max(st.natW, st.natH)); g = makeGuideImage({ width: Math.round(st.natW * k), height: Math.round(st.natH * k), layout: design.layout, view }, opts.createCanvas); } } catch { g = null; }
    status({ state: 'rendering', message: 'Rendering photoreal concept…', pct: 5 });
    try {
      const res = await renderer.generate({ image: cap.before, design, guide: g, opts: { view, aspect }, force, onProgress: p => my === seq && status({ state: p.stage === 'cached' ? 'done' : 'rendering', message: p.stage === 'cached' ? 'Showing cached render.' : 'Rendering photoreal concept…', pct: p.pct }) });
      if (my !== seq) return res; api.lastResult = res; setMode('render'); ui && ui.show(res, cap.before);
      status({ state: 'done', message: `Rendered by ${res.provider}${res.cached ? ' (cached)' : ''}.`, provider: res.provider }); onResult(res); return res;
    } catch (e) { if (my !== seq) return null; setMode(e.code === 'no_service' ? 'render' : 'photo');
      status({ state: e.code === 'no_service' ? 'unavailable' : 'failed', code: e.code || 'error', message: e.code === 'no_service' ? 'Photoreal renders are not switched on yet.' : `${e.message || 'Render failed.'} Try again in a moment.` }); return null; }
  }
  if (pollMs) poll = T.setInterval(() => { const s = signature(); if (s && s !== lastSig) { lastSig = s; schedule(); } }, pollMs);
  return Object.assign(api, { refresh, setMode, schedule, destroy() { T.clearTimeout(timer); T.clearInterval(poll); ui && ui.remove(); } });
}

/** DOM layer over the overlay stage: AI render image + label, loading/unavailable placeholder, AI render / Your photo toggle, Measurements toggle. Never shows CG plants. */
const esc2 = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function buildStageUI(stage, onMode, o = {}) {
  const wrap = document.createElement('div'); wrap.className = 'yp-render-layer';
  wrap.innerHTML = `<img class="yp-render-img" alt="AI concept render" hidden><span class="yp-ai-label" hidden>${LABEL}</span>
   <div class="yp-ph" hidden></div>
   <div class="yp-render-bar"><button data-m="render" class="on">AI render</button><button data-m="photo">Your photo</button><button data-x="measure" aria-pressed="false">Measurements</button><span class="yp-render-status" role="status" aria-live="polite"></span></div>`;
  Object.assign(wrap.style, { position: 'absolute', inset: '0', pointerEvents: 'none' }); if (getComputedStyle(stage).position === 'static') stage.style.position = 'relative'; stage.appendChild(wrap);
  const img = wrap.querySelector('img'), lab = wrap.querySelector('.yp-ai-label'), bar = wrap.querySelector('.yp-render-bar'), st = wrap.querySelector('.yp-render-status');
  Object.assign(img.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'fill' });
  Object.assign(lab.style, { position: 'absolute', left: '8px', top: '8px', background: 'rgba(0,0,0,.65)', color: '#fff', font: '600 12px system-ui', padding: '3px 8px', borderRadius: '4px' });
  Object.assign(bar.style, { position: 'absolute', right: '8px', bottom: '8px', display: 'flex', gap: '6px', alignItems: 'center', pointerEvents: 'auto', font: '12px system-ui' });
  Object.assign(st.style, { background: 'rgba(255,255,255,.9)', padding: '3px 6px', borderRadius: '4px' });
  const ph = wrap.querySelector('.yp-ph'); let sample = false, cur = 'render', last = null;
  bar.addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) { sample = false; onMode(b.dataset.m); }
    const x = e.target.closest('[data-x=measure]'); if (x) { const on = x.getAttribute('aria-pressed') !== 'true'; x.setAttribute('aria-pressed', on); x.classList.toggle('on', on); o.onMeasure && o.onMeasure(on); } });
  ph.addEventListener('click', e => { if (e.target.closest('[data-sample]') && o.sampleUrl) { sample = true; img.src = o.sampleUrl; img.style.objectFit = 'cover'; img.hidden = false; lab.hidden = false; lab.textContent = 'SAMPLE render of another yard (not yours) · AI concept image'; ph.hidden = true; } });
  const placeholder = s => { if (cur !== 'render' || sample) { ph.hidden = true; return; }
    if (s.state === 'rendering' || s.state === 'pending') { ph.hidden = false; ph.innerHTML = `<div class="yp-spin"></div><b>Making your photoreal render…</b><span>${esc2(s.message || '')}</span>`; }
    else if (s.state === 'unavailable' || s.state === 'failed') { ph.hidden = false; ph.innerHTML = `<b>${s.state === 'unavailable' ? 'Photoreal render coming soon' : 'Render didn\'t finish'}</b><span>${s.state === 'unavailable' ? 'Your plant layout is saved on this photo. When AI renders are switched on, it turns into a realistic picture of your yard.' : esc2(s.message || '')}</span>${o.sampleUrl ? '<br><button type="button" data-sample>See a sample render</button>' : ''}`; }
    else ph.hidden = true; };
  return {
    show(res) { sample = false; img.style.objectFit = 'fill'; lab.textContent = LABEL; img.src = res.dataURL || res.imageUrl; },
    mode(m, res) { cur = m; const showImg = m === 'render' && (!!res || sample); img.hidden = !showImg; lab.hidden = !showImg; bar.querySelectorAll('[data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === m)); placeholder(last || {}); },
    status(s) { last = s; st.textContent = s.message || ''; placeholder(s); }, remove() { wrap.remove(); },
  };
}
