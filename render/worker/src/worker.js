// Yardplan photoreal render: POST /api/render -> AI-edited concept image of the user's yard photo. NOT DEPLOYED.
// Mirrors backend/ (prices worker): single default export, json() helper, CORS allow-list, KV per-IP rate limit, best-effort daily budget,
// secrets only via `wrangler secret put`. Bindings: RENDER_KV (KV, required), IMAGES (R2, optional).
import { ADAPTERS, ProviderError, isCommercialOK } from './adapters.js';
import { buildRenderPrompt } from '../../prompt.js';

export const LIMITS = { maxImageBytes: 8 * 1024 * 1024, maxBodyBytes: 12 * 1024 * 1024, types: ['image/jpeg', 'image/png', 'image/webp'], perMinute: 4, perIpDay: 30, promptMax: 4000 };
const DAY = 86400;
export const today = () => new Date().toISOString().slice(0, 10);
const json = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', ...h } });

export function corsFor(req, env) {
  const origin = req.headers.get('Origin') || ''; const allow = String(env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  const ok = allow.includes(origin);
  return { ok, origin, headers: { ...(ok ? { 'Access-Control-Allow-Origin': origin } : {}), 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' } };
}
/** Parse and size/type-check a data URL. Returns {type, bytes} or throws a string error code. */
export function checkDataURL(s, field = 'image') {
  const m = /^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(s || ''); if (!m) throw `invalid_${field}`;
  if (!LIMITS.types.includes(m[1])) throw `unsupported_${field}_type`;
  const b64 = m[2].replace(/\s/g, ''); const bytes = Math.floor(b64.length * 3 / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
  if (bytes > LIMITS.maxImageBytes) throw `${field}_too_large`; if (bytes < 100) throw `${field}_too_small`;
  return { type: m[1], bytes };
}
async function r2ToDataURL(env, key) {
  if (!env.IMAGES || !/^[\w\-/.]{1,200}$/.test(key) || key.includes('..')) throw 'invalid_image_key';
  const o = await env.IMAGES.get(key); if (!o) throw 'image_not_found';
  const type = o.httpMetadata?.contentType || 'image/jpeg'; if (!LIMITS.types.includes(type)) throw 'unsupported_image_type';
  const buf = new Uint8Array(await o.arrayBuffer()); if (buf.length > LIMITS.maxImageBytes) throw 'image_too_large';
  let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:${type};base64,${btoa(bin)}`;
}
export async function rateLimit(kv, ip, now = Date.now()) {
  const min = new Date(now).toISOString().slice(0, 16), rk = `rl:${ip}:${min}`, dk = `rd:${ip}:${today()}`;
  const [n, d] = (await Promise.all([kv.get(rk), kv.get(dk)])).map(x => +x || 0);
  if (n >= LIMITS.perMinute) return { ok: false, retryAfter: 60, reason: 'rate_limited' };
  if (d >= LIMITS.perIpDay) return { ok: false, retryAfter: 3600, reason: 'daily_ip_limit' };
  await Promise.all([kv.put(rk, String(n + 1), { expirationTtl: 120 }), kv.put(dk, String(d + 1), { expirationTtl: 2 * DAY })]);
  return { ok: true };
}
/** Best-effort daily USD budget (KV is eventually consistent; use a Durable Object for exact limits). Reserve before calling the provider. */
export async function reserve(kv, env, usd) {
  const k = 'budget:' + today(); const spent = +(await kv.get(k)) || 0; const cap = +(env.DAILY_BUDGET_USD ?? 2);
  if (spent + usd > cap + 1e-9) return false; await kv.put(k, (spent + usd).toFixed(4), { expirationTtl: 2 * DAY }); return true;
}
export async function refund(kv, usd) { const k = 'budget:' + today(); const spent = +(await kv.get(k)) || 0; await kv.put(k, Math.max(0, spent - usd).toFixed(4), { expirationTtl: 2 * DAY }); }

// PROVIDERS: ordered list; the alias "free" expands to FREE_PROVIDERS (default "hf-space,cf-img2img").
// Default (paid): PROVIDERS="xai,fal-kontext". Free adapters (a.free) are OFF unless ALLOW_FREE==="true" (explicit opt-in);
// non-commercial adapters are additionally skipped unless ALLOW_NONCOMMERCIAL==="true".
export function chain(env, requested) {
  const expand = list => list.flatMap(id => (id === 'free' ? String(env.FREE_PROVIDERS || 'hf-space,cf-img2img').split(',') : [id])).map(s => s.trim()).filter(Boolean);
  const allowed = id => ADAPTERS[id] && (!ADAPTERS[id].free || env.ALLOW_FREE === 'true') && (env.ALLOW_NONCOMMERCIAL === 'true' || isCommercialOK(ADAPTERS[id], env));
  if (requested) { if (requested === 'mock') return env.ALLOW_MOCK === 'true' ? ['mock'] : []; return expand([requested]).filter(allowed); }
  return [...new Set(expand(String(env.PROVIDERS || 'xai,fal-kontext').split(',')))].filter(allowed);
}
/** Per-provider daily cap for free adapters (protects the shared anonymous/free quota). */
export async function freeQuota(kv, env, id) { const k = `free:${id}:${today()}`; const n = +(await kv.get(k)) || 0; if (n >= +(env.FREE_DAILY_CAP ?? 50)) return false; await kv.put(k, String(n + 1), { expirationTtl: 2 * DAY }); return true; }

export async function handleRender(req, env, ctx, f = fetch) {
  const kv = env.RENDER_KV; const ip = req.headers.get('CF-Connecting-IP') || '0';
  if (+(req.headers.get('content-length') || 0) > LIMITS.maxBodyBytes) return [413, { error: 'body_too_large' }];
  let body; try { body = await req.json(); } catch { return [400, { error: 'invalid_body' }]; }
  if (!body || typeof body !== 'object') return [400, { error: 'invalid_body' }];
  let image = body.image, guide = body.guide || null, reference = body.reference || null, mask = body.mask || null;
  try {
    if (typeof image !== 'string') throw 'missing_image';
    if (!image.startsWith('data:')) image = await r2ToDataURL(env, image);
    checkDataURL(image); if (guide) checkDataURL(guide, 'guide'); if (reference) checkDataURL(reference, 'reference'); if (mask) checkDataURL(mask, 'mask');
  } catch (e) { return [typeof e === 'string' ? (e === 'image_not_found' ? 404 : 400) : 500, { error: typeof e === 'string' ? e : 'image_read_failed' }]; }
  const providers = chain(env, body.provider); if (!providers.length) return [400, { error: 'invalid_provider' }];
  let built;
  if (typeof body.prompt === 'string' && body.prompt.trim()) { if (body.prompt.length > LIMITS.promptMax) return [400, { error: 'prompt_too_long' }]; built = { prompt: body.prompt.trim(), negative: '', warnings: [] }; }
  else if (body.params && typeof body.params === 'object') built = null; else return [400, { error: 'missing_params_or_prompt' }];
  const rl = await rateLimit(kv, ip); if (!rl.ok) return [429, { error: rl.reason, retryAfter: rl.retryAfter }, { 'Retry-After': String(rl.retryAfter) }];
  const errors = [];
  for (const id of providers) {
    const a = ADAPTERS[id]; const p = built || buildRenderPrompt(body.params.design || body.params, { ...(body.params.opts || {}), provider: id, guide: !!(guide && a.supports.ref), styleRef: !!(reference && a.supports.ref), mask: !!(mask && a.supports.mask) });
    const refs = a.supports.ref ? [guide, reference].filter(Boolean) : []; const cost = a.costUSD({ inputs: 1 + refs.length });
    if (a.free && !(await freeQuota(kv, env, id))) { errors.push({ provider: id, error: 'free_quota_exhausted' }); continue; }
    if (cost > 0 && !(await reserve(kv, env, cost))) { errors.push({ provider: id, error: 'daily_budget_exhausted' }); continue; }
    try {
      const out = await a.run({ image, guide: a.supports.ref ? guide : null, refs, mask: a.supports.mask ? mask : null, prompt: p.prompt, negative: p.negative, aspect: body.aspect, env, fetch: f });
      const res = { provider: id, free: !!a.free, prompt: p.prompt, warnings: p.warnings || [], costEstimateUSD: cost, createdAt: new Date().toISOString(), ...(out.echoed ? { mock: true } : {}) };
      if (env.IMAGES && out.dataURL && env.STORE_RESULTS === 'true') { const key = `renders/${today()}/${crypto.randomUUID()}.jpg`; const b = Uint8Array.from(atob(out.dataURL.split(',')[1]), c => c.charCodeAt(0));
        await env.IMAGES.put(key, b, { httpMetadata: { contentType: 'image/jpeg' } }); res.imageUrl = `/api/render/img/${key}`; res.r2Key = key; }
      else if (out.url) res.imageUrl = out.url; else res.dataURL = out.dataURL;
      return [200, res];
    } catch (e) { if (cost > 0) await refund(kv, cost); errors.push({ provider: id, error: String(e.message || e), status: e.status }); if (e instanceof ProviderError && !e.retryable) break; }
  }
  const budget = errors.length && errors.every(e => /budget_exhausted|quota_exhausted/.test(e.error));
  return [budget ? 503 : 502, { error: budget ? 'daily_budget_exhausted' : 'all_providers_failed', errors }];
}

export default {
  async fetch(req, env, ctx, f = fetch) {
    const c = corsFor(req, env); const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: c.ok ? 204 : 403, headers: c.headers });
    if (req.headers.get('Origin') && !c.ok) return json({ error: 'origin_not_allowed' }, 403, c.headers);
    if (req.method === 'GET' && url.pathname.startsWith('/api/render/img/') && env.IMAGES) {
      const o = await env.IMAGES.get(url.pathname.slice('/api/render/img/'.length)); if (!o) return json({ error: 'not_found' }, 404, c.headers);
      return new Response(o.body, { headers: { 'Content-Type': o.httpMetadata?.contentType || 'image/jpeg', 'Cache-Control': 'private, max-age=86400', ...c.headers } });
    }
    if (url.pathname !== '/api/render') return json({ error: 'not_found' }, 404, c.headers);
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, c.headers);
    const [s, o, h = {}] = await handleRender(req, env, ctx, f);
    return json(o, s, { ...c.headers, ...h, 'Cache-Control': 'no-store' });
  },
};
