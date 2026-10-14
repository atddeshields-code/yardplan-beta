// Phase 2 prototype: walk-around (6-12 photos or video frames) and 360° panorama renders. Mock-first; pure helpers are Node-testable.
export const MIN_FRAMES = 6, MAX_FRAMES = 12;

/** Evenly spaced indices: choose n (clamped 6..12) of total frames, always including first and last. */
export function pickFrames(total, n = 8) { n = Math.max(Math.min(n, MAX_FRAMES, total), Math.min(MIN_FRAMES, total)); if (total <= 0) return [];
  if (n === 1) return [0]; return [...new Set(Array.from({ length: n }, (_, i) => Math.round(i * (total - 1) / (n - 1))))]; }
/** Validate a photo set. */
export function validateSet(files) { const n = files.length; if (n < MIN_FRAMES) return `Add at least ${MIN_FRAMES} photos (you have ${n}).`; if (n > MAX_FRAMES) return `Use at most ${MAX_FRAMES} photos.`; return null; }
export const isEquirect = (w, h) => !!w && !!h && Math.abs(w / h - 2) < 0.02;

/** Viewer state for continuous position pos (in frames). Returns neighbors a,b and crossfade t. loop = full orbit. */
export function viewState(pos, n, loop = false) { if (n <= 1) return { a: 0, b: 0, t: 0 };
  if (loop) { const p = ((pos % n) + n) % n; const a = Math.floor(p); return { a, b: (a + 1) % n, t: p - a }; }
  const p = Math.min(Math.max(pos, 0), n - 1); const a = Math.min(Math.floor(p), n - 2); return { a, b: a + 1, t: p - a }; }

/**
 * Render frames with a shared seed and the first render as style reference (consistency).
 * renderer: createRenderer() instance. frames: [dataURL]. Providers that accept reference images: xAI Grok Imagine edit (up to 5 inputs),
 * Gemini image, OpenAI gpt-image edits (multiple images), Flux Kontext [max]/multi on fal (multi-image endpoints) — single-image Kontext [pro] does not.
 */
export async function renderSequence(renderer, frames, design, { view = 'ground', equirect = false, seed = 1234, onProgress = () => {}, aspect } = {}) {
  const out = []; let ref = null;
  for (let i = 0; i < frames.length; i++) {
    onProgress({ i, n: frames.length, stage: 'rendering' });
    const res = await renderer.generate({ image: frames[i], design, reference: ref, opts: { view, equirect, seed, aspect: equirect ? '2:1' : aspect, frame: i } });
    if (i === 0) ref = res.dataURL || res.imageUrl; out.push(res);
  }
  onProgress({ i: frames.length, n: frames.length, stage: 'done' }); return out;
}

/** Mean abs RGB difference between the first and last pixel columns (seam visibility for equirect). data: RGBA array. */
export function seamDelta(data, w, h) { let s = 0; for (let y = 0; y < h; y++) { const l = (y * w) * 4, r = (y * w + w - 1) * 4; for (let c = 0; c < 3; c++) s += Math.abs(data[l + c] - data[r + c]); } return s / (h * 3); }
/** Blend a band of `band` px on both edges toward their shared average so the 360° wrap is seamless. Mutates and returns data. */
export function blendSeam(data, w, h, band = 16) {
  band = Math.min(band, Math.floor(w / 2));
  for (let y = 0; y < h; y++) for (let k = 0; k < band; k++) { const wgt = 1 - k / band; const L = (y * w + k) * 4, R = (y * w + (w - 1 - k)) * 4;
    for (let c = 0; c < 3; c++) { const m = (data[L + c] + data[R + c]) / 2; data[L + c] = Math.round(data[L + c] + (m - data[L + c]) * wgt); data[R + c] = Math.round(data[R + c] + (m - data[R + c]) * wgt); } }
  return data;
}

/** Browser: extract `count` frames from a <video> via canvas (long side capped). Server alternative: see README (ffmpeg). */
export async function extractVideoFrames(video, count = 8, maxPx = 1600, createCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h })) {
  if (!video.duration || !isFinite(video.duration)) await new Promise((ok, no) => { video.onloadedmetadata = ok; video.onerror = () => no(new Error('video_load_failed')); });
  const k = Math.min(1, maxPx / Math.max(video.videoWidth, video.videoHeight)); const c = createCanvas(Math.round(video.videoWidth * k), Math.round(video.videoHeight * k)); const x = c.getContext('2d');
  const out = []; for (const i of pickFrames(count * 4, count)) { const t = (i / (count * 4 - 1)) * (video.duration - 0.05);
    await new Promise(ok => { video.onseeked = ok; video.currentTime = t; }); x.drawImage(video, 0, 0, c.width, c.height); out.push(c.toDataURL('image/jpeg', .85)); }
  return out;
}

/** Swipe/drag viewer with crossfade between neighboring views. */
export function createWalkViewer(el, urls, { loop = false } = {}) {
  el.innerHTML = ''; el.style.position = 'relative'; el.style.touchAction = 'none'; el.style.cursor = 'grab';
  const imgs = urls.map(u => { const i = new Image(); i.src = u; Object.assign(i.style, { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0, transition: 'none' }); el.appendChild(i); return i; });
  let pos = 0; const draw = () => { const s = viewState(pos, urls.length, loop); imgs.forEach((im, k) => im.style.opacity = k === s.a ? 1 - s.t : k === s.b ? s.t : 0); el.dataset.pos = pos.toFixed(2); };
  let x0 = null, p0 = 0; el.onpointerdown = e => { x0 = e.clientX; p0 = pos; el.setPointerCapture(e.pointerId); };
  el.onpointermove = e => { if (x0 == null) return; pos = p0 - (e.clientX - x0) / el.clientWidth * 3; if (!loop) pos = Math.max(0, Math.min(urls.length - 1, pos)); draw(); };
  el.onpointerup = () => { x0 = null; }; draw();
  return { set(p) { pos = p; draw(); }, get pos() { return pos; } };
}

/** three.js sphere viewer for an equirectangular image. */
export function createPanoViewer(el, url, THREE) {
  const W = el.clientWidth, H = el.clientHeight || 400; const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setSize(W, H); el.appendChild(r.domElement);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(75, W / H, .1, 100); const tex = new THREE.TextureLoader().load(url, () => draw()); tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.SphereGeometry(10, 64, 32); geo.scale(-1, 1, 1); scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex })));
  let lon = 0, lat = 0, x0 = null; const draw = () => { const phi = (90 - lat) * Math.PI / 180, th = lon * Math.PI / 180; cam.lookAt(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)); r.render(scene, cam); };
  el.onpointerdown = e => { x0 = [e.clientX, e.clientY, lon, lat]; }; el.onpointerup = () => x0 = null;
  el.onpointermove = e => { if (!x0) return; lon = x0[2] - (e.clientX - x0[0]) * .2; lat = Math.max(-85, Math.min(85, x0[3] + (e.clientY - x0[1]) * .2)); draw(); };
  return { draw, look(lo, la) { lon = lo; lat = la; draw(); }, renderer: r };
}
