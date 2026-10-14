// Provider adapters. Each: { id, costUSD(opts), supports:{mask,ref}, async run({image, guide, mask, prompt, negative, aspect, env, fetch}) -> {url?|dataURL?} }
// Keys come ONLY from Worker secrets (env.XAI_API_KEY, env.FAL_KEY). Request shapes follow the providers' docs as of 2026-10-13; [UNVERIFIED] where noted.
export class ProviderError extends Error { constructor(provider, status, msg, retryable = true) { super(`${provider}: ${msg}`); this.provider = provider; this.status = status; this.retryable = retryable; } }
async function readJSON(r, id) { const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = null; }
  if (!r.ok) throw new ProviderError(id, r.status, (j && (j.error?.message || j.error || j.detail)) || t.slice(0, 200), r.status >= 500 || r.status === 429);
  if (!j) throw new ProviderError(id, r.status, 'non-JSON response'); return j; }

// Primary: xAI Grok Imagine Image 2.0, POST https://api.x.ai/v1/images/edits (docs.x.ai/developers/model-capabilities/imagine)
// Price (docs.x.ai/developers/pricing, read 2026-10-13): output $0.04 (1K low) .. $0.08 (2K medium) + $0.01 per input image.
const XAI_OUT = { '1k:low': 0.04, '1k:medium': 0.06, '2k:low': 0.06, '2k:medium': 0.08 };
export const xai = {
  id: 'xai', commercialOK: true, supports: { mask: false, ref: true },
  costUSD: ({ resolution = '1k', quality = 'low', inputs = 1 } = {}) => +((XAI_OUT[`${resolution}:${quality}`] ?? 0.08) + 0.01 * inputs).toFixed(3),
  async run({ image, guide, refs, prompt, env, fetch, resolution = '1k', quality = 'low' }) {
    const extra = refs || (guide ? [guide] : []);
    if (!env.XAI_API_KEY) throw new ProviderError('xai', 0, 'XAI_API_KEY secret not set', true);
    const body = { model: env.XAI_MODEL || 'grok-imagine-image-2.0', prompt, response_format: 'b64_json', aspect_ratio: 'auto', resolution, quality }; // aspect/resolution/quality param names [UNVERIFIED on direct API; fal documents auto aspect]
    if (extra.length) body.images = [image, ...extra].slice(0, 5).map(url => ({ type: 'image_url', url })); else body.image = { type: 'image_url', url: image }; // multi-image field name [UNVERIFIED]
    const r = await fetch('https://api.x.ai/v1/images/edits', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.XAI_API_KEY}` }, body: JSON.stringify(body) });
    const j = await readJSON(r, 'xai'); const d = j.data && j.data[0]; if (!d) throw new ProviderError('xai', r.status, 'no image in response');
    return d.b64_json ? { dataURL: `data:image/jpeg;base64,${d.b64_json}` } : { url: d.url };
  },
};

// Fallback: FLUX.1 Kontext [pro] on fal.ai, sync endpoint https://fal.run/fal-ai/flux-pro/kontext ($0.04/image, fal.ai/models/fal-ai/flux-pro/kontext, read 2026-10-13)
export const falKontext = {
  id: 'fal-kontext', supports: { mask: false, ref: false },
  costUSD: () => 0.04,
  async run({ image, prompt, env, fetch, aspect }) {
    if (!env.FAL_KEY) throw new ProviderError('fal-kontext', 0, 'FAL_KEY secret not set', true);
    const body = { prompt, image_url: image, output_format: 'jpeg', num_images: 1, safety_tolerance: '2', ...(aspect ? { aspect_ratio: aspect } : {}) };
    const r = await fetch(env.FAL_URL || 'https://fal.run/fal-ai/flux-pro/kontext', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Key ${env.FAL_KEY}` }, body: JSON.stringify(body) });
    const j = await readJSON(r, 'fal-kontext'); const u = j.images && j.images[0] && j.images[0].url; if (!u) throw new ProviderError('fal-kontext', r.status, 'no image in response');
    return u.startsWith('data:') ? { dataURL: u } : { url: u };
  },
};

// Mock: no network, no cost. Returns env.MOCK_IMAGE_URL or echoes the input so the UI flow can be exercised end to end.
export const mock = { id: 'mock', supports: { mask: true, ref: true }, costUSD: () => 0, async run({ image, env }) { return env.MOCK_IMAGE_URL ? { url: env.MOCK_IMAGE_URL } : { dataURL: image, echoed: true }; } };


// ---------------- FREE adapters ($0 per call; quota-limited; see free/free-research.md) ----------------
const b64ToBytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
const bytesToB64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const splitDataURL = d => { const m = /^data:([^;]+);base64,(.*)$/s.exec(d); return { type: m[1], b64: m[2] }; };

// Cloudflare Workers AI SD 1.5 img2img via the AI binding (no key; Workers AI free allocation, model lists $0.00/step while beta [verify]).
// Low quality vs. instruction editors, but commercial-OK (CreativeML OpenRAIL-M) and no third party beyond Cloudflare.
export const cfImg2img = {
  id: 'cf-img2img', free: true, commercialOK: true, supports: { mask: true, ref: false }, costUSD: () => 0,
  async run({ image, mask, prompt, negative, env }) {
    if (!env.AI) throw new ProviderError('cf-img2img', 0, 'AI binding not configured', true);
    const { b64 } = splitDataURL(image); const model = mask ? '@cf/runwayml/stable-diffusion-v1-5-inpainting' : '@cf/runwayml/stable-diffusion-v1-5-img2img';
    const input = { prompt, negative_prompt: negative || undefined, image_b64: b64, strength: +(env.CF_STRENGTH || 0.6), num_steps: 20, guidance: 7.5 };
    if (mask) input.mask = [...b64ToBytes(splitDataURL(mask).b64)];
    let out; try { out = await env.AI.run(model, input); } catch (e) { throw new ProviderError('cf-img2img', 502, String(e.message || e), true); }
    const buf = out instanceof Uint8Array ? out : new Uint8Array(await new Response(out).arrayBuffer());
    if (!buf.length) throw new ProviderError('cf-img2img', 502, 'empty image');
    return { dataURL: `data:image/png;base64,${bytesToB64(buf)}` };
  },
};

// Hugging Face Gradio Space (Gradio 4/5 HTTP API: upload -> /call/<api> -> SSE result). Works anonymously on public Spaces
// (ZeroGPU quota: ~2 GPU-min/day unauthenticated, 5 with a free account token [HF docs]). KINDS map the Space's /infer signature.
// FLUX.1 Kontext [dev] is NON-COMMERCIAL for production use (outputs may be used commercially, the *model* may not be used in a
// production/revenue product) => commercialOK=false; the Worker refuses it unless ALLOW_NONCOMMERCIAL === 'true'.
export const SPACE_KINDS = {
  kontext: { space: 'black-forest-labs/FLUX.1-Kontext-Dev', api: 'infer', commercialOK: false, data: (img, prompt) => [img, prompt, 42, true, 2.5, 28] },
  qwen2509: { space: 'Qwen/Qwen-Image-Edit-2509', api: 'infer', commercialOK: true, data: (img, prompt, w, h) => [[{ image: img, caption: null }], prompt, 42, true, 4, 40, h || 1024, w || 768, false] },
  qwen: { space: 'Qwen/Qwen-Image-Edit', api: 'infer', commercialOK: true, data: (img, prompt) => [img, prompt, 42, true, 4, 50, false] },
};
export const hfSpace = {
  id: 'hf-space', free: true, supports: { mask: false, ref: false }, costUSD: () => 0,
  commercialFor: env => (SPACE_KINDS[env.HF_SPACE_KIND || 'kontext'] || {}).commercialOK === true,
  async run({ image, prompt, env, fetch }) {
    const kind = SPACE_KINDS[env.HF_SPACE_KIND || 'kontext']; if (!kind) throw new ProviderError('hf-space', 0, 'unknown HF_SPACE_KIND', false);
    const base = (env.HF_SPACE_URL || `https://${kind.space.toLowerCase().replace(/[/.]/g, '-')}.hf.space`).replace(/\/$/, '');
    const auth = env.HF_TOKEN ? { Authorization: `Bearer ${env.HF_TOKEN}` } : {};
    const { type, b64 } = splitDataURL(image); const fd = new FormData(); fd.append('files', new Blob([b64ToBytes(b64)], { type }), 'yard.' + (type.split('/')[1] || 'jpg'));
    const up = await fetch(`${base}/gradio_api/upload`, { method: 'POST', headers: auth, body: fd }); const paths = await readJSON(up, 'hf-space');
    const img = { path: paths[0], meta: { _type: 'gradio.FileData' } };
    const start = await fetch(`${base}/gradio_api/call/${kind.api}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth }, body: JSON.stringify({ data: kind.data(img, prompt) }) });
    const { event_id } = await readJSON(start, 'hf-space'); if (!event_id) throw new ProviderError('hf-space', 502, 'no event id');
    const res = await fetch(`${base}/gradio_api/call/${kind.api}/${event_id}`, { headers: auth }); const text = await res.text();
    const ev = parseSSE(text); const err = ev.find(e => e.event === 'error'); if (err) throw new ProviderError('hf-space', 429, `space error: ${String(err.data).slice(0, 200)}`, true); // quota exceeded, queue full, etc.
    const done = ev.find(e => e.event === 'complete'); if (!done) throw new ProviderError('hf-space', 502, 'no complete event');
    let out = JSON.parse(done.data)[0]; if (Array.isArray(out)) out = out[0]; if (out && out.image) out = out.image;
    const url = out && (out.url || (out.path && `${base}/gradio_api/file=${out.path}`)); if (!url) throw new ProviderError('hf-space', 502, 'no image in result');
    const imgRes = await fetch(url, { headers: auth }); if (!imgRes.ok) throw new ProviderError('hf-space', imgRes.status, 'result download failed');
    const ct = imgRes.headers.get('content-type') || 'image/webp'; return { dataURL: `data:${ct};base64,${bytesToB64(new Uint8Array(await imgRes.arrayBuffer()))}` }; // re-host: Space file URLs expire
  },
};
export function parseSSE(text) { return text.split(/\n\n+/).map(b => { const ev = /^event:\s*(.*)$/m.exec(b); const d = [...b.matchAll(/^data:\s?(.*)$/gm)].map(m => m[1]).join('\n'); return ev ? { event: ev[1].trim(), data: d } : null; }).filter(Boolean); }

// Pollinations OpenAI-compatible edits. Keyless access no longer serves `kontext` (tested 2026-10-13: "only available on enter.pollinations.ai"),
// so this needs POLLINATIONS_KEY (free account tier). Commercial terms unclear => commercialOK=false until reviewed.
export const pollinations = {
  id: 'pollinations', free: true, commercialOK: false, supports: { mask: false, ref: true }, costUSD: () => 0,
  async run({ image, prompt, env, fetch }) {
    if (!env.POLLINATIONS_KEY) throw new ProviderError('pollinations', 0, 'POLLINATIONS_KEY secret not set', true);
    const r = await fetch('https://gen.pollinations.ai/v1/images/edits', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.POLLINATIONS_KEY}` }, body: JSON.stringify({ model: env.POLLINATIONS_MODEL || 'kontext', prompt, image, response_format: 'b64_json' }) });
    const j = await readJSON(r, 'pollinations'); const d = j.data && j.data[0]; if (!d || !d.b64_json) throw new ProviderError('pollinations', 502, 'no image'); return { dataURL: `data:image/png;base64,${d.b64_json}` };
  },
};

export const ADAPTERS = { xai, 'fal-kontext': falKontext, 'cf-img2img': cfImg2img, 'hf-space': hfSpace, pollinations, mock };
export const isCommercialOK = (a, env) => (a.commercialFor ? a.commercialFor(env) : a.commercialOK !== false);
