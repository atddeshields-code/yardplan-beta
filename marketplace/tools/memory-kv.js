// In-memory KV namespace mock (get/put/delete/list with prefix + cursor). Ignores TTLs except when expirationTtl given (lazy expiry).
export class MemoryKV {
  constructor() { this.m = new Map(); }
  async get(k, t) { const e = this.m.get(k); if (!e) return null; if (e.exp && Date.now() > e.exp) { this.m.delete(k); return null; } return t === 'json' ? JSON.parse(e.v) : e.v; }
  async put(k, v, o = {}) { this.m.set(k, { v: String(v), exp: o.expirationTtl ? Date.now() + o.expirationTtl * 1000 : null }); }
  async delete(k) { this.m.delete(k); }
  async list({ prefix = '', cursor, limit = 1000 } = {}) { const keys = [...this.m.keys()].filter(k => k.startsWith(prefix)).sort(); const start = cursor ? +cursor : 0;
    const page = keys.slice(start, start + limit).map(name => ({ name })); const done = start + limit >= keys.length; return { keys: page, list_complete: done, cursor: done ? undefined : String(start + limit) }; }
}
