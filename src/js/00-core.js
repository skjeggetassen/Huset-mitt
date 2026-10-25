/* Huset mitt – kjerne: hjelpefunksjoner, formatering, lagring, tilstand, navigasjon */
'use strict';
const HM = window.HM = { actions: {}, views: {} };

// ---------- Hjelpefunksjoner ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const clone = o => JSON.parse(JSON.stringify(o));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, step = 1) => Math.round(v / step) * step;
const byId = (arr, id) => (arr || []).find(x => x.id === id);
const num = v => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : 0; };
HM.util = { $, $$, esc, uid, clone, clamp, round, byId, num };

// ---------- Norsk formatering ----------
const NB = 'nb-NO';
const fmtNum = (n, d = 0) => new Intl.NumberFormat(NB, { minimumFractionDigits: d, maximumFractionDigits: d }).format(n || 0);
const nok = (n, d = 0) => new Intl.NumberFormat(NB, { style: 'currency', currency: 'NOK', minimumFractionDigits: d, maximumFractionDigits: d }).format(n || 0).replace(/ /g, ' ');
const todayISO = () => { const d = new Date(); return isoOf(d); };
const isoOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseISO = s => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return isoOf(d); };
const addMonths = (iso, n) => { const d = parseISO(iso); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(day, last)); return isoOf(d); };
const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
const fmtDate = (iso, opts) => iso ? parseISO(iso).toLocaleDateString(NB, opts || { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const fmtDateShort = iso => iso ? parseISO(iso).toLocaleDateString(NB, { day: 'numeric', month: 'short' }) : '';
const fmtDay = iso => iso ? parseISO(iso).toLocaleDateString(NB, { weekday: 'short', day: 'numeric', month: 'short' }) : '';
const relDays = iso => { if (!iso) return ''; const n = daysBetween(todayISO(), iso); if (n === 0) return 'i dag'; if (n === 1) return 'i morgen'; if (n === -1) return 'i går'; return n > 0 ? `om ${n} dager` : `${-n} dager siden`; };
// lengder lagres i millimeter
const fmtLen = (mm, approx) => { if (mm == null || !isFinite(mm)) return '–'; const s = Math.abs(mm) >= 1000 ? fmtNum(mm / 1000, 2) + ' m' : fmtNum(mm / 10, mm % 10 ? 1 : 0) + ' cm'; return (approx ? '≈ ' : '') + s; };
const fmtMM = mm => fmtNum(Math.round(mm)) + ' mm';
const fmtArea = mm2 => fmtNum(mm2 / 1e6, 1) + ' m²';
/** Tolker «3,45 m», «345 cm», «3450 mm». Tall uten enhet tolkes i defUnit. Returnerer mm eller null. */
function parseLen(str, defUnit = 'mm') {
  if (str == null) return null;
  const s = String(str).trim().toLowerCase().replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  const m = s.match(/^(-?\d*\.?\d+)(mm|cm|m)?$/);
  if (!m) return null;
  const v = parseFloat(m[1]); const u = m[2] || defUnit;
  return u === 'm' ? v * 1000 : u === 'cm' ? v * 10 : v;
}
Object.assign(HM.util, { fmtNum, nok, todayISO, isoOf, parseISO, addDays, addMonths, daysBetween, fmtDate, fmtDateShort, fmtDay, relDays, fmtLen, fmtMM, fmtArea, parseLen });

// ---------- Ikoner ----------
const ICONS = {
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  plan: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 12h7v9M14 3v7h7"/>',
  cube: '<path d="M12 3 3 7.5v9L12 21l9-4.5v-9z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
  folder: '<path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M16 12.5h2M3 9h18"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 4.5 4.5L19 7"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2"/>',
  book: '<path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z"/><path d="M20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z"/>',
  wrench: '<path d="M14.5 6.5a4 4 0 0 0 5 5L12 19l-3 1 1-3 7.5-7.5"/><path d="M14.5 6.5 17 4l3 3-2.5 2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  cursor: '<path d="M5 3l14 7-6 2-2 6z"/>',
  wall: '<path d="M4 18 20 6"/><circle cx="4" cy="18" r="2"/><circle cx="20" cy="6" r="2"/>',
  room: '<rect x="4" y="5" width="16" height="14" rx="1"/><path d="M4 5l3 3M20 5l-3 3"/>',
  door: '<path d="M5 20h14"/><path d="M7 20V5h7v15"/><path d="M14 5a10 10 0 0 1 5 9"/>',
  window: '<rect x="4" y="5" width="16" height="14" rx="1"/><path d="M12 5v14M4 12h16"/>',
  opening: '<path d="M3 12h5M16 12h5"/><path d="M8 8v8M16 8v8" stroke-dasharray="2 2"/>',
  stairs: '<path d="M4 20h4v-4h4v-4h4V8h4"/>',
  sofa: '<path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3"/><path d="M3 11h18v6H3zM5 17v2M19 17v2"/>',
  ruler: '<path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  flip: '<path d="M12 3v18"/><path d="M8 7 4 12l4 5M16 7l4 5-4 5"/>',
  rotate: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  walk: '<circle cx="13" cy="4.5" r="1.8"/><path d="m9 21 2-6 3 3v3M8 12l2-4 4 1 2 3 3 1M11 15l-1-4"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  roof: '<path d="M3 12 12 5l9 7"/><path d="M6 10v9h12v-9"/>',
  compare: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M12 4v16"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>',
  flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.6 0l3-3a4 4 0 0 0-5.6-5.6l-1 1"/><path d="M14 10a4 4 0 0 0-5.6 0l-3 3a4 4 0 0 0 5.6 5.6l1-1"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  cart: '<path d="M3 4h2l2.5 11h11L21 7H6.2"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
  hammer: '<path d="M14 6 4 16l3 3 10-10"/><path d="m13 5 3-2 5 5-2 3z"/>',
  floor: '<path d="M3 17h18M3 12h18M3 7h18"/>',
};
const icon = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
HM.icon = icon;

// ---------- Lagring (IndexedDB) ----------
const Store = {
  db: null, name: 'huset-mitt', available: true, mem: { kv: new Map(), blobs: new Map() },
  open(name) {
    this.name = name;
    return new Promise(resolve => {
      let req;
      try { req = indexedDB.open(name, 1); } catch (e) { this.available = false; return resolve(false); }
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv'); if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs'); };
      req.onsuccess = () => { this.db = req.result; this.available = true; resolve(true); };
      req.onerror = () => { this.available = false; resolve(false); };
      req.onblocked = () => { this.available = false; resolve(false); };
    });
  },
  close() { try { this.db && this.db.close(); } catch (e) {} this.db = null; },
  _tx(store, mode, fn) {
    if (!this.db) { return Promise.resolve(fn(null)); }
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, mode); const os = tx.objectStore(store); let out;
      const r = fn(os); if (r && 'onsuccess' in r) r.onsuccess = () => { out = r.result; };
      tx.oncomplete = () => resolve(out); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
  },
  get(store, key) { if (!this.db) return Promise.resolve(this.mem[store].get(key)); return this._tx(store, 'readonly', os => os.get(key)); },
  put(store, key, val) { if (!this.db) { this.mem[store].set(key, val); return Promise.resolve(); } return this._tx(store, 'readwrite', os => os.put(val, key)); },
  del(store, key) { if (!this.db) { this.mem[store].delete(key); return Promise.resolve(); } return this._tx(store, 'readwrite', os => os.delete(key)); },
  keys(store) { if (!this.db) return Promise.resolve([...this.mem[store].keys()]); return this._tx(store, 'readonly', os => os.getAllKeys()); },
  clear(store) { if (!this.db) { this.mem[store].clear(); return Promise.resolve(); } return this._tx(store, 'readwrite', os => os.clear()); },
};
HM.store = Store;

// ---------- Tilstand ----------
const SCHEMA = 1;
function emptyPlan() {
  return { floors: [{ id: uid('fl'), name: '1. etasje', elevation: 0, height: 2400 }], walls: [], openings: [], rooms: [], stairs: [], furniture: [] };
}
function emptyState() {
  const v = { id: uid('ver'), name: 'Dagens hus', kind: 'current', createdAt: new Date().toISOString(), basedOn: null, description: 'Slik huset er i dag.', plan: emptyPlan() };
  return {
    schema: SCHEMA, createdAt: new Date().toISOString(),
    house: { name: 'Huset mitt', address: '', built: '' },
    activeVersionId: v.id, versions: [v],
    projects: [], receipts: [], events: [], shopping: [], tools: [], checklists: [], docs: [], maintenance: [], media: [], imports: [],
    settings: { lowPower: 'auto', theme: 'system' },
  };
}
HM.emptyPlan = emptyPlan; HM.emptyState = emptyState;

HM.state = null;
HM.mode = 'real'; // 'real' | 'demo'
let saveTimer = null;
HM.save = function (now) {
  clearTimeout(saveTimer);
  const doSave = () => Store.put('kv', 'state', JSON.parse(JSON.stringify(HM.state))).then(() => { HM.lastSaved = Date.now(); }).catch(e => { console.error(e); HM.toast('Kunne ikke lagre. Ta en sikkerhetskopi.'); });
  if (now) return doSave();
  saveTimer = setTimeout(doSave, 250);
  return Promise.resolve();
};
/** Endre apptilstand og lagre. fn får state. */
HM.update = function (fn, opts = {}) {
  fn(HM.state);
  HM.save();
  if (opts.render !== false) HM.render();
};
HM.version = () => byId(HM.state.versions, HM.state.activeVersionId) || HM.state.versions[0];
HM.currentVersion = () => HM.state.versions.find(v => v.kind === 'current') || HM.state.versions[0];
HM.plan = () => HM.version().plan;

function migrate(s) {
  const e = emptyState();
  for (const k of Object.keys(e)) if (s[k] === undefined) s[k] = e[k];
  s.settings = Object.assign({}, e.settings, s.settings || {});
  for (const v of s.versions) { const p = v.plan; for (const k of ['floors', 'walls', 'openings', 'rooms', 'stairs', 'furniture']) if (!p[k]) p[k] = []; if (!p.floors.length) p.floors.push(emptyPlan().floors[0]); }
  s.schema = SCHEMA;
  return s;
}
HM.migrate = migrate;

HM.loadMode = async function (mode) {
  HM.mode = mode;
  try { localStorage.setItem('hm-mode', mode); } catch (e) {}
  Store.close();
  await Store.open(mode === 'demo' ? 'huset-mitt-demo' : 'huset-mitt');
  let s = null;
  try { s = await Store.get('kv', 'state'); } catch (e) { console.error(e); }
  if (!s) {
    s = mode === 'demo' ? HM.createDemoState() : emptyState();
    HM.state = s; await HM.save(true);
    if (mode === 'demo' && HM.seedDemoMedia) await HM.seedDemoMedia();
  }
  HM.state = migrate(s);
  HM.undo.reset();
};

// ---------- Blobs / medier ----------
HM.blobUrlCache = new Map();
HM.putBlob = async (blob, id = uid('blob')) => { await Store.put('blobs', id, blob); return id; };
HM.getBlob = id => Store.get('blobs', id);
HM.blobUrl = async id => {
  if (!id) return '';
  if (HM.blobUrlCache.has(id)) return HM.blobUrlCache.get(id);
  const b = await HM.getBlob(id); if (!b) return '';
  const u = URL.createObjectURL(b); HM.blobUrlCache.set(id, u); return u;
};
/** Fyller <img data-blob="id"> og lenker <a data-blob-href="id"> etter render. */
HM.hydrateBlobs = function (root = document) {
  $$('img[data-blob]', root).forEach(async img => { const u = await HM.blobUrl(img.dataset.blob); if (u) img.src = u; });
  $$('[data-blob-href]', root).forEach(async a => { const u = await HM.blobUrl(a.dataset.blobHref); if (u) a.href = u; });
};
/** Legger inn en fil som medie. Bilder skaleres ned for å spare plass. */
HM.addMedia = async function (file, meta = {}) {
  let blob = file, w = null, h = null;
  if (file.type && file.type.startsWith('image/') && file.type !== 'image/svg+xml') {
    try { const r = await HM.downscale(file, 2200, 0.86); blob = r.blob; w = r.w; h = r.h; } catch (e) { console.warn('kunne ikke skalere', e); }
  }
  const blobId = await HM.putBlob(blob);
  const m = Object.assign({ id: uid('med'), blobId, name: file.name || 'fil', type: blob.type || file.type || 'application/octet-stream', size: blob.size, w, h, createdAt: new Date().toISOString(), kind: 'foto', roomIds: [], projectId: null, tags: [] }, meta);
  HM.state.media.push(m);
  HM.save();
  return m;
};
HM.removeMedia = async function (id) {
  const m = byId(HM.state.media, id); if (!m) return;
  HM.state.media = HM.state.media.filter(x => x.id !== id);
  await Store.del('blobs', m.blobId);
  HM.save();
};
HM.downscale = function (file, maxDim, quality = 0.85, type = 'image/jpeg') {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight;
      const s = Math.min(1, maxDim / Math.max(w, h));
      if (s === 1 && file.type === type && file.size < 1.5e6) { URL.revokeObjectURL(url); return resolve({ blob: file, w, h }); }
      w = Math.round(w * s); h = Math.round(h * s);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
      c.toBlob(b => { URL.revokeObjectURL(url); b ? resolve({ blob: b, w, h }) : reject(new Error('toBlob')); }, type, quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bildet kunne ikke leses')); };
    img.src = url;
  });
};
HM.sha256 = async blob => { try { const buf = await blob.arrayBuffer(); const h = await crypto.subtle.digest('SHA-256', buf); return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join(''); } catch (e) { return null; } };

// ---------- Filnedlasting ----------
HM.saveFile = async function (filename, blob) {
  try {
    if (window.claude && window.claude.use) {
      const dl = await Promise.race([window.claude.use('downloads'), new Promise(r => setTimeout(() => r(null), 3000))]);
      if (dl) { const r = await dl.save({ filename, data: blob }); return r; }
    }
  } catch (e) {
    if (e && (e.code === 'declined' || e.code === 'cancelled')) { HM.toast('Nedlasting avbrutt'); return null; }
    console.warn('downloads', e);
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  return { ok: true };
};

// ---------- UI: toast, modal, bekreftelse ----------
HM.toast = function (msg, ms = 2600) {
  let w = $('.toast-wrap'); if (!w) { w = document.createElement('div'); w.className = 'toast-wrap'; document.body.appendChild(w); }
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; w.appendChild(t);
  setTimeout(() => t.remove(), ms);
};
HM.modal = function ({ title, body, foot = '', onMount, wide, onClose }) {
  const ov = document.createElement('div'); ov.className = 'overlay';
  ov.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}" ${wide ? 'style="max-width:880px"' : ''}>
    <div class="sheet-head"><h2>${esc(title)}</h2><button class="btn icon ghost" data-close aria-label="Lukk">${icon('x')}</button></div>
    <div class="sheet-body">${body}</div>${foot ? `<div class="sheet-foot">${foot}</div>` : ''}</div>`;
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(ov);
  HM.hydrateBlobs(ov);
  const api = { el: ov, close, $: s => ov.querySelector(s), $$: s => Array.from(ov.querySelectorAll(s)) };
  onMount && onMount(api);
  const first = ov.querySelector('input:not([type=hidden]):not([type=checkbox]), select, textarea'); if (first && !('ontouchstart' in window)) first.focus();
  return api;
};
HM.confirm = function (title, text, okLabel = 'Bekreft', danger = true) {
  return new Promise(resolve => {
    let done = false;
    const m = HM.modal({
      title, body: `<p>${text}</p>`,
      foot: `<button class="btn" data-close>Avbryt</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(okLabel)}</button>`,
      onMount: api => api.$('[data-ok]').onclick = () => { done = true; api.close(); resolve(true); },
      onClose: () => { if (!done) resolve(false); },
    });
  });
};

// ---------- Angre / gjør om (plantegning, per versjon) ----------
HM.undo = {
  stacks: {},
  reset() { this.stacks = {}; },
  _s() { const id = HM.state.activeVersionId; return this.stacks[id] || (this.stacks[id] = { u: [], r: [] }); },
  push(snapshot) { const s = this._s(); s.u.push(snapshot); if (s.u.length > 120) s.u.shift(); s.r = []; },
  canUndo() { return this._s().u.length > 0; },
  canRedo() { return this._s().r.length > 0; },
  undo() { const s = this._s(); if (!s.u.length) return false; s.r.push(JSON.stringify(HM.plan())); HM.version().plan = JSON.parse(s.u.pop()); return true; },
  redo() { const s = this._s(); if (!s.r.length) return false; s.u.push(JSON.stringify(HM.plan())); HM.version().plan = JSON.parse(s.r.pop()); return true; },
};
/** Endring i plantegningen: lagrer angrepunkt, utfører, lagrer, varsler visningene. */
HM.commitPlan = function (fn, opts = {}) {
  const before = JSON.stringify(HM.plan());
  const r = fn(HM.plan());
  if (r === false) return false;
  if (JSON.stringify(HM.plan()) === before) return false;
  HM.undo.push(before);
  HM.version().updatedAt = new Date().toISOString();
  HM.save();
  HM.emitPlanChanged(opts);
  return true;
};
HM.planListeners = new Set();
HM.emitPlanChanged = function (opts = {}) { HM.planListeners.forEach(fn => { try { fn(opts); } catch (e) { console.error(e); } }); };

// ---------- Navigasjon ----------
HM.route = { name: 'oversikt', params: {} };
HM.go = function (name, params = {}) {
  if (HM.leaveRoute) { try { HM.leaveRoute(); } catch (e) {} HM.leaveRoute = null; }
  HM.route = { name, params };
  HM.render();
  const main = $('main'); if (main) main.scrollTop = 0;
};
HM.render = function () {
  const r = HM.route; const view = HM.views[r.name] || HM.views.oversikt;
  const main = $('main'); if (!main) return;
  if (HM.leaveRoute && HM.route.name !== HM._renderedRoute) { try { HM.leaveRoute(); } catch (e) {} HM.leaveRoute = null; }
  HM._renderedRoute = r.name;
  HM.renderShell();
  view(main, r.params);
  HM.hydrateBlobs(main);
};

// Hendelsesdelegering: data-act="navn" data-*
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = HM.actions[el.dataset.act]; if (!fn) return;
  e.preventDefault(); fn(el, e);
});
HM.actions.go = el => HM.go(el.dataset.to, el.dataset.id ? { id: el.dataset.id, tab: el.dataset.tab } : (el.dataset.tab ? { tab: el.dataset.tab } : {}));

// ---------- Små byggeklosser ----------
HM.ui = {
  statusPill(st) {
    const map = { bekreftet: ['ok', 'Bekreftet'], materiale: ['src', 'Fra materialet'], anslatt: ['est', 'Anslått'] };
    const [c, l] = map[st] || map.anslatt; return `<span class="pill ${c}">${l}</span>`;
  },
  flag(on) { return on ? `<span class="pill bad">${icon('flag')} Må avklares</span>` : ''; },
  field(label, inner, cls = '', hint = '') { return `<label class="field ${cls}"><span>${esc(label)}</span>${inner}${hint ? `<span class="hint">${hint}</span>` : ''}</label>`; },
  input(id, val, attrs = '') { return `<input id="${id}" name="${id}" value="${esc(val ?? '')}" ${attrs}>`; },
  select(id, options, val, attrs = '') { return `<select id="${id}" name="${id}" ${attrs}>${options.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(val ?? '') ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`; },
  empty(title, text, btn = '') { return `<div class="empty"><strong>${esc(title)}</strong>${text}${btn ? `<div style="margin-top:10px">${btn}</div>` : ''}</div>`; },
};
/** Leser skjemaverdier fra container: {id: value}. */
HM.formValues = function (root) {
  const o = {};
  root.querySelectorAll('input[name], select[name], textarea[name]').forEach(el => {
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
    else if (el.multiple) o[el.name] = Array.from(el.selectedOptions).map(x => x.value);
    else o[el.name] = el.value;
  });
  return o;
};

// ---------- Biblioteker lastes ved behov ----------
HM.LIBS = {
  three: ['https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'],
  jspdf: ['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'],
  pdf: ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'],
};
const libCache = {};
HM.loadScript = src => libCache[src] || (libCache[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = false; s.onload = res; s.onerror = () => { delete libCache[src]; rej(new Error('Kunne ikke laste ' + src.split('/').pop())); }; document.head.appendChild(s); }));
HM.loadLib = async name => { for (const src of HM.LIBS[name]) await HM.loadScript(src); };
