/* Appskall og oppstart. */
(function () {
  const { esc } = HM.util; const icon = HM.icon;
  const NAV = [
    ['oversikt', 'home', 'Oversikt'], ['huset', 'plan', 'Huset'], ['prosjekter', 'folder', 'Prosjekter'], ['okonomi', 'wallet', 'Økonomi'],
    ['kalender', 'cal', 'Kalender', 'extra'], ['lister', 'list', 'Lister', 'extra'], ['dokumentasjon', 'book', 'Dokumentasjon', 'extra'], ['vedlikehold', 'wrench', 'Vedlikehold', 'extra'], ['tidslinje', 'clock', 'Historikk', 'extra'],
    ['sep'], ['versjoner', 'layers', 'Forslag', 'extra'], ['importer', 'upload', 'Last opp bilder', 'extra'], ['innstillinger', 'gear', 'Innstillinger', 'extra'],
    ['mer', 'more', 'Mer', 'more'],
  ];
  const GROUP = { prosjekt: 'prosjekter', rom: 'huset', kvittering: 'okonomi' };
  const MORE = ['kalender', 'lister', 'dokumentasjon', 'vedlikehold', 'tidslinje', 'versjoner', 'importer', 'innstillinger', 'mer'];

  HM.renderShell = function () {
    const app = document.querySelector('.app'); if (!app) return;
    const r = GROUP[HM.route.name] || HM.route.name;
    const top = app.querySelector('.topbar');
    top.innerHTML = `<div class="brand"><svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="8" fill="var(--accent)"/><path d="M8 15.5 16 9l8 6.5V24H8z" fill="none" stroke="var(--accent-ink)" stroke-width="2" stroke-linejoin="round"/><path d="M13.5 24v-5h5v5" fill="none" stroke="var(--accent-ink)" stroke-width="2"/></svg>
      <div style="min-width:0"><div class="brand-name">${esc(HM.state.house.name)}</div><div class="brand-sub">Huset mitt</div></div></div>
      ${HM.mode === 'demo' ? `<button class="demo-badge" data-act="exitDemo" title="Gå tilbake til dine data" style="cursor:pointer">DEMO</button>` : ''}
      <button class="btn sm primary" data-act="go" data-to="importer" title="Last opp bilde">${icon('upload')}<span class="hide-xs">Last opp bilde</span></button>`;
    const nav = app.querySelector('.nav');
    nav.innerHTML = NAV.map(n => n[0] === 'sep' ? '<span class="nav-sep"></span>' : `<button data-act="go" data-to="${n[0]}" class="${n[3] === 'extra' ? 'nav-extra' : n[3] === 'more' ? 'nav-more' : ''}" ${(r === n[0] || (n[0] === 'mer' && MORE.includes(r) && window.innerWidth < 900)) ? 'aria-current="page"' : ''}>${icon(n[1])}<span>${n[2]}</span></button>`).join('');
    document.body.classList.toggle('in-house', HM.route.name === 'huset');
  };

  async function boot() {
    const st = document.createElement('style'); st.textContent = '@media (max-width:520px){.hide-xs{display:none}} body.in-house main{overflow:hidden}'; document.head.appendChild(st);
    let mode = 'real'; try { mode = localStorage.getItem('hm-mode') === 'demo' ? 'demo' : 'real'; } catch (e) {}
    await HM.loadMode(mode);
    if (!HM.store.available) setTimeout(() => HM.toast('Lagring er ikke tilgjengelig i denne visningen. Endringer forsvinner når du lukker siden.', 6000), 500);
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {}
    if (window.pdfjsLib && window.pdfjsWorker) { /* pdf.js bruker innebygd arbeider */ }
    const hash = (location.hash || '').replace('#', '');
    HM.route = { name: HM.views[hash] && !['prosjekt', 'rom'].includes(hash) ? hash : 'oversikt', params: {} };
    HM.render();
    HM.ai.init();
    const rem = HM.dueReminders(); if (rem.length) setTimeout(() => HM.toast(`${rem.length} påminnelse${rem.length > 1 ? 'r' : ''}: ${rem[0].title}${rem.length > 1 ? ' …' : ''}`, 5000), 800);
    window.addEventListener('resize', () => { if (HM.route.name !== 'huset') HM.renderShell(); });
  }
  HM.boot = boot;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
