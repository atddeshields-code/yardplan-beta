// mp-client.js — tiny fetch wrapper for the marketplace Worker (browser + Node).
export function createMarketClient(base = '', { fetchImpl = (...a) => globalThis.fetch(...a) } = {}) {
  const b = base.replace(/\/+$/, '');
  async function call(method, path, body, token) {
    const r = await fetchImpl(b + '/api' + path, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(data.error || 'http_' + r.status); e.status = r.status; e.data = data; throw e; } return data;
  }
  const e = encodeURIComponent;
  return { call,
    config: () => call('GET', '/config'),
    // pros
    signup: profile => call('POST', '/pros', profile), login: email => call('POST', '/pros/login', { email }), verifyLogin: token => call('POST', '/pros/login/verify', { token }),
    directory: ({ zip, service } = {}) => call('GET', '/pros?' + new URLSearchParams({ ...(zip ? { zip } : {}), ...(service ? { service } : {}) })),
    pro: id => call('GET', '/pros/' + e(id)), me: t => call('GET', '/pro/me', undefined, t), updateMe: (t, patch) => call('PUT', '/pro/me', patch, t), ledger: t => call('GET', '/pro/ledger', undefined, t),
    inbox: t => call('GET', '/pro/leads', undefined, t), lead: (t, id) => call('GET', '/pro/leads/' + e(id), undefined, t),
    accept: (t, id) => call('POST', `/pro/leads/${e(id)}/accept`, {}, t), decline: (t, id, reason) => call('POST', `/pro/leads/${e(id)}/decline`, { reason }, t),
    quote: (t, id, q) => call('POST', `/pro/leads/${e(id)}/quote`, q, t), report: (t, id, reason, note) => call('POST', `/pro/leads/${e(id)}/report`, { reason, note }, t),
    proMessages: (t, id) => call('GET', `/pro/leads/${e(id)}/messages`, undefined, t), proSend: (t, id, text) => call('POST', `/pro/leads/${e(id)}/messages`, { text }, t),
    replyReview: (t, leadId, text) => call('POST', `/pro/reviews/${e(leadId)}/reply`, { text }, t),
    checkout: (t, o) => call('POST', '/billing/checkout', o, t),
    // homeowner
    requestQuotes: req => call('POST', '/leads', req), leadStatus: (h, id) => call('GET', '/leads/' + e(id), undefined, h),
    consent: (h, id, c) => call('POST', `/leads/${e(id)}/consent`, c, h), rematch: (h, id) => call('POST', `/leads/${e(id)}/rematch`, {}, h),
    optOut: (h, id, channel) => call('POST', `/leads/${e(id)}/optout`, { channel }, h), hire: (h, id, proId) => call('POST', `/leads/${e(id)}/hire`, { proId }, h),
    review: (h, id, r) => call('POST', `/leads/${e(id)}/reviews`, r, h),
    messages: (h, id, proId) => call('GET', `/leads/${e(id)}/messages?proId=${e(proId)}`, undefined, h), send: (h, id, proId, text) => call('POST', `/leads/${e(id)}/messages`, { proId, text }, h),
    // admin
    admin: { pros: (t, verification) => call('GET', '/admin/pros' + (verification ? '?verification=' + e(verification) : ''), undefined, t), leads: t => call('GET', '/admin/leads', undefined, t),
      verify: (t, id, status, note, evidence) => call('POST', `/admin/pros/${e(id)}/verification`, { status, note, evidence }, t),
      licenseCheck: (t, id, state, ok, note, evidence) => call('POST', `/admin/pros/${e(id)}/license-check`, { state, ok, note, evidence }, t),
      credits: (t, id, deltaCents, reason) => call('POST', `/admin/pros/${e(id)}/credits`, { deltaCents, reason }, t),
      setStatus: (t, id, status) => call('POST', `/admin/pros/${e(id)}/status`, { status }, t),
      refund: (t, leadId, proId, reason) => call('POST', `/admin/leads/${e(leadId)}/refund`, { proId, reason }, t),
      removeReview: (t, proId, leadId, reason) => call('POST', `/admin/reviews/${e(proId)}/${e(leadId)}/remove`, { reason }, t), log: t => call('GET', '/admin/log', undefined, t) } };
}
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = (cents, { whole = false } = {}) => '$' + (cents / 100).toLocaleString('en-US', whole ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
