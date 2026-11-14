(() => {
  'use strict';
  const cfg = window.JORICK_SYNC_CONFIG || {};
  const key = 'vpj-trades-v3';
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
    } catch (err) { say(err.message, true); access = null; userId = null; }
    finally { btn.disabled = false; }
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
  document.getElementById('sync-logout').addEventListener('click', () => { if (queued !== null) return say('Spara väntande ändringar innan du loggar ut.', true); location.reload(); });
  if (!configured) say('Ange Supabase URL och publishable/anon key i sync-config.js.', true);
  else say('Logga in med din Supabase-användare.');
})();
