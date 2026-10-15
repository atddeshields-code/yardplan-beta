// Local dev only: static files from /workspace/yardplan-contractor + marketplace Worker on /api/* with in-memory KV, seeded demo pros.
// No Stripe key is set, so billing endpoints return 503 billing_not_configured (by design). GET /dev/seed returns demo tokens (dev only).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { createHandler } from '../worker/src/index.js'; import { MemoryKV } from './memory-kv.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), port = +process.env.PORT || 8788;
const log = []; const hooks = { sendEmail: async m => (log.push({ ...m, at: new Date().toISOString() }), { queued: false, provider: 'dev-log' }), sendSms: async m => (log.push({ ...m, at: new Date().toISOString() }), { queued: false, provider: 'dev-log' }) };
const env = { MARKET: new MemoryKV(), ALLOWED_ORIGIN: `http://localhost:${port}`, ADMIN_TOKEN: process.env.ADMIN_TOKEN || 'dev-admin', DEV_RETURN_MAGIC: 'true', SITE_URL: `http://localhost:${port}`, STRIPE_WEBHOOK_SECRET: 'whsec_dev' };
const handler = createHandler({ hooks });
const call = async (m, p, b, t) => (await handler(new Request('http://x/api' + p, { method: m, headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': 'seed', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b && JSON.stringify(b) }), env)).json();
const seed = [];
for (const [name, zip, r, svc, v, lic, about, st = 'NV'] of [
  // Default demo area: Sacramento, CA 95814 (CSLB C-27). Reno/Carson NV pros below are the alternate area.
  ['Capitol River Landscapes', '95814', 20, ['planting', 'design', 'xeriscape', 'irrigation'], 'verified', ['C-27'], 'Turf-replacement and drip conversions around Sacramento.', 'CA'],
  ['Midtown Hardscape & Garden', '95816', 15, ['hardscape', 'pavers', 'planting'], 'verified', ['C-27'], 'Patios, DG paths and native plantings.', 'CA'],
  ['Valley Oak Yard Care', '95817', 25, ['planting', 'lawn-sod', 'maintenance'], 'pending', ['C-27'], 'Family owned.', 'CA'],
  ['Sierra Gardens Co.', '89501', 25, ['planting', 'design', 'xeriscape', 'irrigation'], 'verified', ['C-10'], 'Water-wise yards for the Truckee Meadows since 2009.'],
  ['Truckee Hardscapes', '89502', 30, ['hardscape', 'pavers', 'retaining-walls', 'planting'], 'verified', ['C-10'], 'Patios, walls and paths.'],
  ['Washoe Valley Landscaping', '89511', 20, ['planting', 'lawn-sod', 'maintenance'], 'pending', ['C-10'], 'Family owned.'],
  ['Carson Native Yards', '89701', 15, ['planting', 'xeriscape'], 'verified', ['C-10'], 'Native plants, low water.'],
  ['No-License Lawn Guys', '89501', 25, ['planting'], 'unverified', ['B-2'], 'Wrong license class: never matched, hidden from the public directory (admin/self only).']]) {
  const r1 = await call('POST', '/pros', { businessName: name, contactName: 'Owner', email: name.replace(/\W/g, '').toLowerCase() + '@example.com', phone: st === 'CA' ? '916-555-0100' : '775-555-0100', about,
    licenses: [{ state: st, number: String(80000 + seed.length * 137), classes: lic }], serviceZips: [zip], radiusMiles: r, services: svc, insuranceAttested: true });
  await call('POST', `/admin/pros/${r1.id}/verification`, { status: v }, env.ADMIN_TOKEN); await call('POST', `/admin/pros/${r1.id}/credits`, { deltaCents: 50000, reason: 'dev_seed' }, env.ADMIN_TOKEN);
  seed.push({ id: r1.id, businessName: name, proToken: r1.proToken, verification: v });
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
http.createServer(async (req, res) => {
  if (req.url === '/dev/seed') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ pros: seed, adminToken: env.ADMIN_TOKEN, outbox: log.slice(-50) })); }
  if (req.url.startsWith('/api/')) { const chunks = []; for await (const c of req) chunks.push(c);
    const r = await handler(new Request(`http://localhost:${port}${req.url}`, { method: req.method, headers: { ...req.headers, 'cf-connecting-ip': req.socket.remoteAddress + ':' + (req.headers['x-test-ip'] || '') }, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }), env);
    res.writeHead(r.status, Object.fromEntries(r.headers)); return res.end(Buffer.from(await r.arrayBuffer())); }
  const f = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(port, () => console.log(`marketplace dev server http://localhost:${port}/marketplace/demo.html (admin token: ${env.ADMIN_TOKEN})`));
