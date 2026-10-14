// mock.js: in-browser marketplace backend for when no backend URL is configured (window.YARDPLAN_MARKET_URL unset).
// Runs the real Worker handler (worker/src/index.js) against an in-memory KV seeded with demo pros. Nothing leaves the browser:
// no email, SMS or payments. Data resets on reload. Demo pros are fictional.
import { createHandler } from './worker/src/index.js';
import { MemoryKV } from './tools/memory-kv.js';
const ADMIN = 'mock-admin';
export const DEMO_PROS = [
  ['Capitol Gardens Co.', '95814', 25, ['planting', 'design', 'xeriscape', 'irrigation'], 'verified', 'CA', ['C-27'], 'Water-wise yards across Sacramento since 2011.'],
  ['River City Hardscapes', '95818', 30, ['hardscape', 'pavers', 'retaining-walls', 'planting'], 'verified', 'CA', ['C-27'], 'Patios, walls and paths.'],
  ['Midtown Native Yards', '95816', 20, ['planting', 'xeriscape', 'design'], 'pending', 'CA', ['C-27'], 'California natives, low water.'],
  ['Bay Area Landscape Studio', '94102', 25, ['design', 'planting', 'lighting'], 'verified', 'CA', ['C-27'], 'Small urban yards.'],
  ['Sierra Gardens Co.', '89501', 25, ['planting', 'design', 'xeriscape', 'irrigation'], 'verified', 'NV', ['C-10'], 'Water-wise yards for the Truckee Meadows.'],
];
export async function createMockMarket() {
  const env = { MARKET: new MemoryKV(), ALLOWED_ORIGIN: location.origin, ADMIN_TOKEN: ADMIN, DEV_RETURN_MAGIC: 'true', SITE_URL: location.origin, STRIPE_WEBHOOK_SECRET: 'whsec_mock' };
  const handler = createHandler({});
  const fetchImpl = async (url, init = {}) => { const u = new URL(url, 'http://mock'); return handler(new Request('http://mock' + u.pathname + u.search, { ...init, headers: { ...(init.headers || {}), 'CF-Connecting-IP': 'browser' } }), env); };
  const call = async (m, p, b, t) => (await fetchImpl('/api' + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b && JSON.stringify(b) })).json();
  const pros = [];
  for (const [i, [name, zip, r, svc, v, st, cls, about]] of DEMO_PROS.entries()) {
    const p = await call('POST', '/pros', { businessName: name, contactName: 'Owner', email: name.replace(/\W/g, '').toLowerCase() + '@example.com', phone: '555-0100', about,
      licenses: [{ state: st, number: String(900000 + i * 137), classes: cls, expires: '2028-12-31' }], serviceZips: [zip], radiusMiles: r, services: svc, insuranceAttested: true });
    if (!p.id) { console.warn('mock seed failed', name, p); continue; }
    await call('POST', `/admin/pros/${p.id}/verification`, { status: v }, ADMIN); await call('POST', `/admin/pros/${p.id}/credits`, { deltaCents: 50000, reason: 'demo_seed' }, ADMIN);
    pros.push({ id: p.id, businessName: name, proToken: p.proToken, verification: v });
  }
  return { fetchImpl, pros };
}
