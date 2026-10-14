// share.js — browser/Node client for the proposals Worker. fetchImpl defaults to globalThis.fetch.
export function createShareClient(apiBase, { fetchImpl = globalThis.fetch.bind(globalThis) } = {}) {
  const base = apiBase.replace(/\/+$/, '');
  async function call(method, path, { body, token } = {}) {
    const r = await fetchImpl(base + '/api/proposals' + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(data.error || 'http_' + r.status); e.status = r.status; e.data = data; throw e; }
    return data;
  }
  const P = id => '/' + encodeURIComponent(id);
  return {
    /** create(snapshot, {send}) -> {id, adminToken, status, snapshotHash} — store adminToken privately (contractor only) */
    create: (snapshot, { send = false, retentionDays } = {}) => call('POST', '', { body: { snapshot, send, ...(retentionDays != null ? { retentionDays } : {}) } }),
    get: (id, token) => call('GET', P(id), { token }),                 // client view (no token) or admin view (token)
    status: id => call('GET', P(id) + '/status'),
    events: (id, token) => call('GET', P(id) + '/events', { token }),
    signaturePng: (id, token) => call('GET', P(id) + '/signature', { token }),
    update: (id, token, snapshot) => call('PUT', P(id), { token, body: { snapshot } }),
    send: (id, token) => call('POST', P(id) + '/send', { token }),
    sign: (id, { name, signaturePng, consent, snapshotHash }) => call('POST', P(id) + '/sign', { body: { name, signaturePng, consent, snapshotHash } }),
    decline: (id, reason) => call('POST', P(id) + '/decline', { body: { reason } }),
    void: (id, token, reason) => call('POST', P(id) + '/void', { token, body: { reason } }),
    createChangeOrder: (id, token, snapshot, { send = true } = {}) => call('POST', P(id) + '/changeorders', { token, body: { snapshot, send } }),
  };
}
/** shareUrl(signPageUrl, id, apiBase?) -> link to send the client */
export const shareUrl = (signPage, id, api) => `${signPage}?id=${encodeURIComponent(id)}${api ? '&api=' + encodeURIComponent(api) : ''}`;
/** makeSnapshot({bid, takeoff, business, client, project, phasing?, terms?}) — JSON-only, no images (keeps it < 1 MB) */
export function makeSnapshot({ bid, takeoff, business = {}, client = {}, project = {}, phasing = null, terms = null, tier = null, changeOrder = null }) {
  const { logo, ...biz } = business;
  return JSON.parse(JSON.stringify({ schema: 'yardplan.proposal.v1', business: biz, client, project, tier, terms,
    plants: takeoff ? takeoff.plants : [], bid: bid ? { lines: bid.lines, totals: bid.totals, tiers: bid.tiers ? bid.tiers.map(t => ({ id: t.id, name: t.name, totals: t.totals })) : null } : null,
    phasing, changeOrder }));
}
