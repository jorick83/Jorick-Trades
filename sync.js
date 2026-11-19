(() => {
  'use strict';
  const cfg = window.JORICK_SYNC_CONFIG || {};
  const key = 'vpj-trades-v3';
  const sessionKey = 'jorick-sync-session-v1';
  const storedSession = () => {
    try { return JSON.parse(sessionStorage.getItem(sessionKey) || localStorage.getItem(sessionKey) || 'null'); }
    catch { return null; }
  };
  const clearSession = () => { sessionStorage.removeItem(sessionKey); localStorage.removeItem(sessionKey); };
  function persistSession(remember) {
    clearSession();
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem(sessionKey, JSON.stringify({ refresh, userId }));
  }
  const base = String(cfg.supabaseUrl || '').replace(/\/$/, '');
  const anon = String(cfg.supabaseAnonKey || '');
  const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(base) && anon.length > 20 && !anon.includes('YOUR-');
  const root = document.getElementById('sync-root');
  const status = document.getElementById('sync-status');
  let access = null, refresh = null, userId = null, booted = false, busy = false, timer = null;
  let lastSaved = null;
  const nativeSet = Storage.prototype.setItem;
  const nativeRemove = Storage.prototype.removeItem;
  const authHeaders = () => ({ apikey: anon, Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' });
  const say = (message, error = false) => { const target = booted ? document.getElementById('sync-bar-text') : status; target.textContent = message; target.style.color = error ? '#fca5a5' : '#93c5fd'; };
  const safeJSON = text => { try { const val = JSON.parse(text); return Array.isArray(val) ? val : null; } catch { return null; } };
  function launch() {
    if (booted) return;
    booted = true;
    root.hidden = true;
    document.getElementById('sync-bar').hidden = false;
    const s = document.createElement('script');
    s.type = 'module';
    s.src = './assets/index-B9Kc_f47.js';
    document.body.appendChild(s);
    refreshTradingDays();
    scheduleTradingDayRender();
  }
  async function request(path, options = {}) {
    const response = await fetch(base + path, { ...options, headers: { ...authHeaders(), ...(options.headers || {}) }, cache: 'no-store' });
    if (!response.ok) {
      let msg = `HTTP ${response.status}`;
      try { const data = await response.json(); msg = data.msg || data.message || data.error_description || msg; } catch {}
      throw new Error(msg);
    }
    if (response.status === 204) return null;
    return response.json();
  }
  async function login(email, password) {
    const res = await fetch(`${base}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const data = await res.json();
    if (!res.ok || !data.access_token) throw new Error(data.msg || data.error_description || data.message || 'Inloggningen misslyckades');
    access = data.access_token;
    refresh = data.refresh_token;
    userId = data.user.id;
  }
  async function refreshToken() {
    if (!refresh) throw new Error('Logga in igen.');
    const res = await fetch(`${base}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: refresh }) });
    const data = await res.json();
    if (!res.ok || !data.access_token) throw new Error('Sessionen har gått ut. Logga in igen.');
    access = data.access_token;
    refresh = data.refresh_token;
    persistSession(localStorage.getItem(sessionKey) !== null);
  }
  async function withRefresh(fn) {
    try { return await fn(); }
    catch (err) { if (!String(err.message).includes('401') && !String(err.message).toLowerCase().includes('jwt')) throw err; await refreshToken(); return fn(); }
  }
  async function loadRemote() {
    const rows = await withRefresh(() => request(`/rest/v1/journal_data?user_id=eq.${encodeURIComponent(userId)}&select=trades`, { method: 'GET' }));
    if (!Array.isArray(rows)) throw new Error('Felaktigt svar från databasen');
    if (!rows.length) return null;
    if (!Array.isArray(rows[0].trades)) throw new Error('Journalen i databasen har fel format');
    return rows[0].trades;
  }
  async function saveRemote(trades) {
    await withRefresh(() => request('/rest/v1/journal_data?on_conflict=user_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: userId, trades })
    }));
  }

  // Trading days are stored separately from individual trades.
  // A dated row counts as a trading day even when no trade was taken.
  let tradingDayStats = null;
  let tradingDayMessage = '';
  let tradingDayRenderPending = false;
  function renderTradingDays() {
    if (!booted) return;
    const app = document.getElementById('root');
    if (!app) return;
    const existing = document.getElementById('jorick-trading-days');
    const labels = Array.from(app.querySelectorAll('div,span,p,h2,h3,h4')).filter(
      el => el.children.length === 0 && /^(net p&l|win rate|profit factor)$/i.test((el.textContent || '').trim())
    );
    const net = labels.find(el => /^net p&l$/i.test(el.textContent.trim()));
    if (!net) { if (existing) existing.remove(); return; }
    let grid = net.parentElement;
    while (grid && grid !== app) {
      const t = grid.textContent || '';
      if (/WIN RATE/i.test(t) && /PROFIT FACTOR/i.test(t) && /NET P&L/i.test(t) && grid.children.length >= 3) break;
      grid = grid.parentElement;
    }
    if (!grid || grid === app) return;
    const section = existing || document.createElement('section');
    if (!existing) {
      section.id = 'jorick-trading-days';
      section.setAttribute('aria-label', 'Tradingdagar');
      section.style.cssText = 'margin:20px 0 24px;padding:18px 20px;border:1px solid #272b35;border-radius:14px;background:#090a0e;color:#e5e7eb;font-family:inherit';
      section.innerHTML = '<div style="font-size:13px;color:#a1a1aa;margin-bottom:14px">TRADINGDAGAR · HELA JOURNALEN</div><div id="jorick-day-values" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:14px"></div><div id="jorick-day-note" style="font-size:12px;color:#9ca3af;margin-top:12px"></div>';
    }
    if (section.previousElementSibling !== grid) grid.after(section);
    const values = section.querySelector('#jorick-day-values');
    const note = section.querySelector('#jorick-day-note');
    if (tradingDayStats) {
      const stats = [
        ['Tradingdagar', tradingDayStats.total],
        ['Dagar med trades', tradingDayStats.withTrades],
        ['Dagar utan trades', tradingDayStats.withoutTrades]
      ];
      const html = stats.map(([label, value]) => '<div><div style="font-size:12px;color:#9ca3af">' + label + '</div><div style="font-size:28px;font-weight:650;margin-top:4px">' + value + '</div></div>').join('');
      if (values.innerHTML !== html) values.innerHTML = html;
      note.textContent = 'Alla datum i Google Sheets räknas, även dagar utan affärer. Uppdateras från Supabase ungefär var femte minut.';
    } else {
      if (values.textContent !== 'Hämtar tradingdagar…') values.textContent = 'Hämtar tradingdagar…';
      note.textContent = tradingDayMessage;
    }
  }
  function scheduleTradingDayRender() {
    if (tradingDayRenderPending) return;
    tradingDayRenderPending = true;
    requestAnimationFrame(() => { tradingDayRenderPending = false; renderTradingDays(); });
  }
  async function refreshTradingDays() {
    if (!userId || !booted) return;
    try {
      const rows = await withRefresh(() => request('/rest/v1/trading_days?user_id=eq.' + encodeURIComponent(userId) + '&select=trade_date,has_trade&limit=10000'));
      if (!Array.isArray(rows)) throw new Error('Felaktigt svar');
      const days = new Map();
      for (const row of rows) {
        if (row.trade_date) days.set(row.trade_date, Boolean(row.has_trade));
      }
      const withTrades = Array.from(days.values()).filter(Boolean).length;
      tradingDayStats = { total: days.size, withTrades, withoutTrades: days.size - withTrades };
      tradingDayMessage = '';
    } catch (err) {
      tradingDayMessage = 'Kunde inte hämta tradingdagar: ' + err.message;
    }
    scheduleTradingDayRender();
  }
  const tradingDayObserver = new MutationObserver(scheduleTradingDayRender);
  tradingDayObserver.observe(document.getElementById('root'), { childList: true, subtree: true });
  setInterval(refreshTradingDays, 5 * 60 * 1000);

  let queued = null;
  async function flush() {
    if (busy || queued === null) return;
    busy = true;
    const data = queued;
    queued = null;
    say('Sparar journalen i molnet…');
    try {
      await saveRemote(data);
      lastSaved = JSON.stringify(data);
      say('Journalen synkroniserad ✓');
    } catch (e) {
      queued = queued === null ? data : queued;
      say('Kunde inte synkronisera: ' + e.message + '. Behåll sidan öppen och försök igen.', true);
    } finally { busy = false; if (queued !== null && JSON.stringify(queued) !== JSON.stringify(data)) schedule(); }
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(flush, 800); }
  function watchLocalStorage() {
    Storage.prototype.setItem = function (k, v) {
      nativeSet.call(this, k, v);
      if (this !== localStorage || k !== key || !userId) return;
      const parsed = safeJSON(v);
      if (!parsed) { say('Felaktigt journalformat – synkronisering avbruten.', true); return; }
      if (parsed.length === 0 && lastSaved && lastSaved !== '[]') {
        say('Tom journal skickas inte till molnet. Befintlig journal är skyddad.', true);
        return;
      }
      if (JSON.stringify(parsed) === lastSaved) return;
      queued = parsed;
      schedule();
    };
    Storage.prototype.removeItem = function (k) { nativeRemove.call(this, k); };
  }
  const form = document.getElementById('sync-login');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!configured) return;
    const btn = form.querySelector('button');
    btn.disabled = true;
    say('Loggar in…');
    try {
      await login(form.elements.email.value.trim(), form.elements.password.value);
      persistSession(form.elements.remember.checked);
      form.elements.password.value = '';
      say('Hämtar journalen…');
      const remote = await loadRemote();
      const local = safeJSON(localStorage.getItem(key));
      if (remote !== null) {
        nativeSet.call(localStorage, key, JSON.stringify(remote));
        lastSaved = JSON.stringify(remote);
      } else if (local && local.length > 0) {
        // First-time setup: explicit confirmation prevents accidental overwrite of cloud data.
        if (confirm(`Ingen journal finns i molnet ännu. Vill du spara dina ${local.length} lokala affärer där?`)) {
          await saveRemote(local);
          lastSaved = JSON.stringify(local);
        } else {
          nativeSet.call(localStorage, key, '[]');
          lastSaved = '[]';
        }
      } else {
        nativeSet.call(localStorage, key, '[]');
        lastSaved = '[]';
      }
      watchLocalStorage();
      launch();
      say('Journalen synkroniserad ✓');
    } catch (err) { say(err.message, true); access = null; userId = null; refresh = null; clearSession(); }
    finally { btn.disabled = false; }
  });
  const emailField = form.elements.email;
  const toggleEmail = document.getElementById('sync-toggle-email');
  toggleEmail.addEventListener('click', () => {
    const visible = emailField.type === 'password';
    emailField.type = visible ? 'text' : 'password';
    toggleEmail.textContent = visible ? 'Dölj' : 'Visa';
    toggleEmail.setAttribute('aria-label', visible ? 'Dölj e-postadress' : 'Visa e-postadress');
    toggleEmail.setAttribute('aria-pressed', String(visible));
  });
  document.getElementById('sync-retry').addEventListener('click', () => { if (queued !== null) flush(); else say('Inga väntande ändringar.'); });
  document.getElementById('sync-reload').addEventListener('click', async () => {
    if (queued !== null) return say('Spara väntande ändringar innan du hämtar.', true);
    if (!confirm('Hämta journalen från molnet? Sidan laddas om.')) return;
    try {
      const remote = await loadRemote();
      if (remote !== null) nativeSet.call(localStorage, key, JSON.stringify(remote));
      location.reload();
    } catch (e) { say(e.message, true); }
  });
  document.getElementById('sync-logout').addEventListener('click', () => { if (queued !== null) return say('Spara väntande ändringar innan du loggar ut.', true); clearSession(); access = null; refresh = null; userId = null; location.reload(); });
  async function restoreSession() {
    const saved = storedSession();
    if (!saved?.refresh || !saved?.userId) return;
    refresh = saved.refresh;
    userId = saved.userId;
    // Upgrade previous tab-only sessions to persistent sessions on this device.
    if (sessionStorage.getItem(sessionKey) && !localStorage.getItem(sessionKey)) persistSession(true);
    try {
      say('Återställer inloggningen…');
      await refreshToken();
      const remote = await loadRemote();
      if (remote !== null) {
        nativeSet.call(localStorage, key, JSON.stringify(remote));
        lastSaved = JSON.stringify(remote);
      } else {
        nativeSet.call(localStorage, key, '[]');
        lastSaved = '[]';
      }
      watchLocalStorage();
      launch();
      say('Journalen synkroniserad ✓');
    } catch (err) {
      clearSession(); access = null; refresh = null; userId = null;
      say('Logga in igen. ' + err.message, true);
    }
  }
  if (configured) restoreSession();
  if (!configured) say('Ange Supabase URL och publishable/anon key i sync-config.js.', true);
  else say('Logga in med din Supabase-användare.');
})();
