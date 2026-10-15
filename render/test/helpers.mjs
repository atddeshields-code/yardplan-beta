export class KV { constructor() { this.m = new Map(); } async get(k, t) { const v = this.m.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; } async put(k, v) { this.m.set(k, String(v)); } }
export const PNG = 'data:image/png;base64,' + 'A'.repeat(400);
// Fake canvas that records draw calls (for guide-image tests in Node)
export function fakeCanvas(log = []) { return (w, h) => ({ width: w, height: h, getContext: () => new Proxy({}, { get: (_, k) => k === 'canvas' ? null : (...a) => log.push([k, ...a]), set: (_, k, v) => (log.push(['set', k, v]), true) }), toDataURL: t => `data:${t || 'image/png'};base64,FAKE${w}x${h}` }); }
// Manual scheduler for debounce tests
export function clock() { let t = 0, id = 0; const q = new Map();
  return { now: () => t, setTimeout: (f, ms) => (q.set(++id, { f, at: t + ms }), id), clearTimeout: i => q.delete(i), setInterval: () => 0, clearInterval: () => {},
    async tick(ms) { t += ms; for (const [i, j] of [...q]) if (j.at <= t) { q.delete(i); await j.f(); } } }; }
