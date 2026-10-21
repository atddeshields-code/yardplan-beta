// v16: first-launch role chooser ("Are you a homeowner or a contractor?"). Classic script after app.js (uses go, setMode).
// Role lives in localStorage 'yardplan.role' ('homeowner' | 'contractor'; older 'home' | 'pro' still read). Deep links: ?as=contractor|homeowner, #/jobs[/id], #/design,
// plus the part-1 forms ?role= / ?mode= / #pro / #contractor / #home / #homeowner. Esc picks Homeowner.
// Older saved state (yardplan.mode, saved plans, a design) counts as a choice, so returning users never see the chooser.
(function () {
  const K = 'yardplan.role', ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { lsSet(k, v); } catch (e) {} } };
  const store = r => r === 'pro' ? 'contractor' : 'homeowner', norm = v => ({ pro: 'pro', contractor: 'pro', home: 'home', homeowner: 'home' })[String(v || '').toLowerCase()] || '';
  const q = new URLSearchParams(location.search), hs = location.hash.slice(1), link = norm(q.get('as') || q.get('role') || q.get('mode') || (/^\/(jobs|leads)/.test(hs) ? 'pro' : /^\/design/.test(hs) ? 'home' : hs));
  let role = norm(ls.get(K));
  if (link) role = link;
  if (!role) { const m = ls.get('yardplan.mode'), plans = ls.get('yardplan.plans.v1');
    if (m === 'pro') role = 'pro'; else if ((plans && plans !== '[]') || ls.get('yardplan.design.v3') || ls.get('yardplan.seen')) role = 'home'; }
  if (role) ls.set(K, store(role));
  // keep the role in step with mode switches (Exit Pro, menus)
  const _setMode = setMode; setMode = function (m) { _setMode(m); if (!document.body.dataset.chooser) ls.set(K, store(m === 'pro' ? 'pro' : 'home')); document.documentElement.dataset.role = store(m === 'pro' ? 'pro' : 'home'); };
  const el = document.getElementById('chooser');
  function show() { document.body.dataset.chooser = '1'; el.hidden = false; requestAnimationFrame(() => { const h = el.querySelector('h1'); h.tabIndex = -1; h.focus({ preventScroll: true }); }); }
  function hide() { delete document.body.dataset.chooser; el.hidden = true; document.documentElement.dataset.role = store(role || 'home'); }
  function choose(r, switched) { r = norm(r) || 'home'; role = r; hide(); ls.set(K, store(r)); if (switched) setTimeout(() => window.toast?.(`Switched to ${r === 'pro' ? 'Contractor' : 'Homeowner'}. Switch back anytime in the menu.`), 50); if (r === 'pro') go('pro'); else { setMode('home'); go('home'); window.flowApi?.step?.(1); } }
  el.addEventListener('click', e => { const b = e.target.closest('[data-role]'); if (b) choose(b.dataset.role); });
  // "Switch to homeowner" (Pro → More) and "Switch to contractor" (homeowner step 1 link + ••• menu)
  const pe = document.getElementById('proEntry'); if (pe) pe.onclick = () => { document.getElementById('proMenuSheet')?.close(); choose('home', true); };
  const p1 = document.getElementById('proEntry1'); if (p1) { p1.textContent = 'Switch to contractor'; p1.onclick = () => choose('pro', true); }
  document.addEventListener('click', e => { if (e.target.closest('[data-menu=pro]')) { ls.set(K, 'contractor'); setTimeout(() => window.toast?.('Switched to Contractor. Switch back anytime in the menu.'), 50); } }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !el.hidden) { e.preventDefault(); choose('home'); } });
  window.chooserApi = { show, choose, role: () => norm(ls.get(K)) };
  if (!role) show();
  else document.addEventListener('DOMContentLoaded', () => { if (role === 'pro') go('pro'); else if (document.body.dataset.mode === 'pro') { setMode('home'); go('home'); } });
})();
