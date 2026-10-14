// pro-inbox.js — pro lead inbox: list + detail with accept / decline / quote / report / messages.
import { esc, money } from './mp-client.js';
const ST = { offered: 'New', viewed: 'New', accepted: 'Accepted', quoted: 'Quoted', declined: 'Declined', expired: 'Expired', hired: 'Hired', refunded: 'Refunded' };
/** renderProInbox(el, { client, token }) */
export async function renderProInbox(el, { client, token }) {
  el.innerHTML = `<div class="mp stack"><div class="row" id="ibHead"></div><div class="row" style="align-items:flex-start;gap:var(--space-4)"><div id="ibList" class="stack" style="flex:1 1 260px;min-width:240px"></div><div id="ibDetail" style="flex:2 1 360px;min-width:280px"></div></div></div>`;
  const list = el.querySelector('#ibList'), det = el.querySelector('#ibDetail'), head = el.querySelector('#ibHead'); let current = null;
  async function load() {
    const { leads, creditsCents } = await client.inbox(token);
    head.innerHTML = `<h2>Leads</h2><span class="badge">Credits ${money(creditsCents)}</span>`;
    list.innerHTML = leads.map(l => `<button class="card lead" data-lead="${esc(l.id)}" aria-current="${l.id === current}"><span class="status">${ST[l.status] || l.status}</span>
      <b>${esc(l.services.join(', '))} · ${esc(l.zip)}</b><span class="foot">${l.distanceMiles} mi · ${esc(l.tier)} · ${l.summary.plants} plants · lead ${money(l.priceCents)}</span></button>`).join('') || '<p class="muted">No leads yet. New requests in your area show up here.</p>';
  }
  async function show(id, msg = '') {
    current = id; const l = await client.lead(token, id); await load();
    const open = ['offered', 'viewed'].includes(l.status), un = ['accepted', 'quoted', 'hired'].includes(l.status);
    const msgs = un ? (await client.proMessages(token, id)).messages : [];
    det.innerHTML = `<div class="card pad stack"><div class="row"><h2>${esc(l.services.join(', '))} near ${esc(l.zip)}</h2><span class="status">${ST[l.status] || l.status}</span></div>
      <div>${money(l.estimateUsd * 100)} <span class="badge">${esc(l.estimateLabel)}</span></div>
      <div class="foot">${l.summary.plants} plants · ${l.summary.lines} takeoff lines · ${l.summary.hasPhoto ? 'photo' : 'no photo'} · ${l.summary.hasRender ? 'render' : 'no render'} · ${l.distanceMiles} mi away</div>
      ${open ? `<p>Accept to see the homeowner's contact info and full design. Lead fee: <b>${money(l.priceCents)}</b> (charged on accept, auto-refunded for bad contact info, duplicates, out-of-area, or no reply in 72h). Expires ${esc(new Date(l.expiresAt).toLocaleString())}.</p>
        <div class="row"><button class="btn btn--primary" data-a="accept">Accept lead</button><button class="btn btn--secondary" data-a="decline">Decline</button></div>` : ''}
      ${un ? `<div class="card card--on-surface pad"><b>${esc(l.contact.name)}</b><div>${esc(l.contact.email)} ${l.contact.phone ? '· ' + esc(l.contact.phone) : ''}</div><div class="foot">${esc(l.contact.address || '')} ${l.smsConsent ? '· OK to text' : '· No text consent: call or email only'}${l.optOuts.length ? ' · Opted out: ' + esc(l.optOuts.map(o => o.channel).join(', ')) : ''}</div></div>
        ${l.render ? `<img src="${esc(l.render)}" alt="Design render" style="max-width:100%;border-radius:var(--radius-md)">` : ''}
        <table class="tbl"><tr><th>Plant</th><th>Qty</th></tr>${(l.package?.plants || []).map(p => `<tr><td>${esc(p.name || p.id)}</td><td>${p.count}</td></tr>`).join('')}</table>
        <form class="stack" data-f="quote"><b>${l.quote ? 'Update quote' : 'Send a quote'}</b><input class="input" name="amount" inputmode="decimal" placeholder="Amount (USD)" value="${l.quote ? l.quote.amountCents / 100 : ''}">
          <textarea class="input" name="message" placeholder="Message to the homeowner">${esc(l.quote?.message || '')}</textarea><input class="input" name="url" placeholder="Proposal link (optional, e.g. from Yardplan proposals)" value="${esc(l.quote?.proposalUrl || '')}">
          <button class="btn btn--primary">${l.quote ? 'Update quote' : 'Send quote'}</button></form>
        <div class="stack"><b>Messages</b>${msgs.map(m => `<div class="foot"><b>${m.from === 'pro' ? 'You' : 'Homeowner'}:</b> ${esc(m.text)}</div>`).join('') || '<span class="foot">No messages yet.</span>'}
          <form class="input-row" data-f="msg"><input class="input" name="text" placeholder="Write a message"><button class="btn btn--secondary">Send</button></form></div>
        ${!l.refund ? `<details><summary class="foot">Problem with this lead?</summary><div class="row">${['bad_contact', 'duplicate', 'out_of_area', 'no_response_72h'].map(r => `<button class="btn btn--sm btn--ghost" data-r="${r}">${r.replace(/_/g, ' ')}</button>`).join('')}</div></details>` : `<p class="foot">Refunded ${money(l.refund.cents)} (${esc(l.refund.reason)})</p>`}` : ''}
      ${msg ? `<p class="foot" role="status">${esc(msg)}</p>` : ''}</div>`;
    det.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => { try { await client[b.dataset.a](token, id); show(id, b.dataset.a === 'accept' ? 'Lead accepted.' : 'Lead declined.'); } catch (e) { show(id, e.status === 402 ? `Not enough credits (need ${money(e.data.needCents)}).` : 'Error: ' + e.message); } });
    det.querySelector('[data-f="quote"]')?.addEventListener('submit', async e => { e.preventDefault(); const f = new FormData(e.target);
      try { await client.quote(token, id, { amountCents: Math.round(+f.get('amount') * 100), message: f.get('message'), proposalUrl: f.get('url') || undefined }); show(id, 'Quote sent.'); } catch (er) { show(id, 'Quote error: ' + er.message); } });
    det.querySelector('[data-f="msg"]')?.addEventListener('submit', async e => { e.preventDefault(); const t = new FormData(e.target).get('text'); if (t) { await client.proSend(token, id, t); show(id); } });
    det.querySelectorAll('[data-r]').forEach(b => b.onclick = async () => { try { const r = await client.report(token, id, b.dataset.r); show(id, 'Refunded: ' + r.note); } catch (e) { show(id, 'Not refunded: ' + (e.data?.reason || e.message)); } });
  }
  list.addEventListener('click', e => { const id = e.target.closest('[data-lead]')?.dataset.lead; if (id) show(id); });
  await load(); return { reload: load, show };
}
