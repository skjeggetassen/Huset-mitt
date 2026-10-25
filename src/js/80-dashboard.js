/* Oversiktsside. */
(function () {
  const G = HM.geo; const { esc, byId, nok, num, fmtDate, fmtArea, todayISO, addDays, relDays } = HM.util; const icon = HM.icon; const ui = HM.ui;

  HM.views.oversikt = function (main) {
    const st = HM.state; const cur = HM.currentVersion(); const plan = cur.plan;
    const area = plan.rooms.reduce((a, r) => a + G.roomNet(plan, r).area, 0);
    const est = plan.walls.filter(w => w.status !== 'bekreftet').length;
    const today = todayISO();
    const upcoming = HM.calItems(addDays(today, -60), addDays(today, 14)).filter(i => !i.done && (i.late || i.date >= today)).slice(0, 7);
    const reminders = HM.dueReminders().slice(0, 5);
    const active = st.projects.filter(p => p.status === 'pagar' || p.status === 'planlagt').slice(0, 5);
    const t = HM.econ.totals(st);
    const missing = st.shopping.filter(i => !i.bought); const tools = st.tools.filter(x => x.status !== 'har');
    const maint = st.maintenance.filter(m => HM.util.daysBetween(today, HM.maintNext(m)) <= 60).sort((a, b) => HM.maintNext(a) < HM.maintNext(b) ? -1 : 1).slice(0, 5);
    const lastImport = st.imports.slice().reverse().find(r => r.result && (r.result.requests || []).length);
    const fl = plan.floors.slice().sort((a, b) => a.elevation - b.elevation);
    main.innerHTML = `<div class="page">
      ${HM.mode === 'demo' ? `<div class="notice warn">${icon('info')}<div><strong>Du ser på demomodus.</strong> Alt her er eksempeldata, ikke ditt hus. Dine egne data ligger urørt. <a href="#" data-act="exitDemo">Gå tilbake til mine data</a></div></div>` : ''}
      <div class="hero-house">
        <div class="card" style="padding:12px">
          ${plan.rooms.length ? `<canvas class="mini-plan" id="mini-plan" aria-label="Plantegning av ${esc(fl[0].name)}"></canvas>` : `<div class="mini-plan" style="display:grid;place-items:center;text-align:center;padding:20px"><div><h2>Start med ett rom</h2><p class="muted small" style="max-width:360px;margin:6px auto 12px">Last opp bilder eller en plantegning. Claude foreslår rom og mål, og du retter og bekrefter. Du kan utvide huset etter hvert.</p><div class="btn-row" style="justify-content:center"><button class="btn primary" data-act="go" data-to="importer">${icon('upload')} Last opp bilde</button><button class="btn" data-act="quickRoom">${icon('room')} Lag rom fra mål</button></div>${HM.mode !== 'demo' ? `<p class="small" style="margin-top:10px"><a href="#" data-act="enterDemo">Prøv demomodus med eksempelhus</a></p>` : ''}</div></div>`}
        </div>
        <div class="card">
          <div><div class="label">${esc(st.house.address || 'Dagens hus')}</div><h1>${esc(st.house.name)}</h1></div>
          <div class="stat-row"><div class="stat"><div class="v">${plan.rooms.length}</div><div class="k">Rom</div></div><div class="stat"><div class="v">${est && plan.walls.length ? '≈ ' : ''}${fmtArea(area)}</div><div class="k">Netto gulvareal</div></div><div class="stat"><div class="v">${st.versions.filter(v => v.kind === 'proposal').length}</div><div class="k">Forslag</div></div></div>
          ${est && plan.walls.length ? `<div class="notice warn">${icon('ruler')}<div>${est} av ${plan.walls.length} vegger har anslåtte mål. <a href="#" data-act="go" data-to="huset">Bekreft mål i plantegningen</a></div></div>` : ''}
          <div class="btn-row"><button class="btn" data-act="openHouse" data-mode="plan">${icon('plan')} Plantegning</button><button class="btn" data-act="openHouse" data-mode="3d">${icon('cube')} 3D</button>${plan.rooms.length ? `<button class="btn" data-act="openHouse" data-mode="walk">${icon('walk')} Gå rundt</button>` : ''}</div>
        </div>
      </div>
      <div class="quick">
        <button class="lead" data-act="go" data-to="importer">${icon('upload')}Last opp bilde</button>
        <button data-act="newProject">${icon('folder')}Nytt prosjekt</button>
        <button data-act="scanReceipt">${icon('camera')}Skann kvittering</button>
        <button data-act="newTask">${icon('check')}Ny oppgave</button>
      </div>
      ${reminders.length ? `<div class="notice info">${icon('clock')}<div><strong>Påminnelser</strong><ul style="margin:4px 0 0;padding-left:18px">${reminders.map(r => `<li>${esc(r.title)} – ${fmtDate(r.date)}${r.time ? ' kl. ' + r.time : ''} (${relDays(r.date)})</li>`).join('')}</ul></div></div>` : ''}
      ${lastImport && plan.walls.length && est ? `<div class="notice">${icon('camera')}<div><strong>Gjør modellen sikrere:</strong> ${esc(lastImport.result.requests[0].what)}${lastImport.result.requests.length > 1 ? ` <a href="#" data-act="go" data-to="importer">og ${lastImport.result.requests.length - 1} til</a>` : ''}</div></div>` : ''}
      <div class="grid">
        <div class="card"><div class="card-head"><h2>Neste oppgaver og avtaler</h2><a href="#" data-act="go" data-to="kalender" class="small">Kalender</a></div>
          ${upcoming.length ? `<div class="list">${upcoming.map(i => `<div class="row click" data-ci="${i.kind}:${i.id}:${i.date}:${i.projectId || ''}"><div style="width:62px;flex:none" class="small"><strong>${fmtDate(i.date, { day: 'numeric', month: 'short' })}</strong><div class="tiny muted">${i.time || relDays(i.date)}</div></div><div class="grow"><div class="title">${esc(i.title)}</div><div class="small muted">${i.kind === 'task' ? esc(i.sub) : i.kind === 'maint' ? 'Vedlikehold' : (HM.EVENT_TYPES.find(x => x[0] === i.type) || ['', ''])[1]}</div></div>${i.late ? '<span class="pill bad">Forsinket</span>' : ''}</div>`).join('')}</div>` : ui.empty('Ingenting de neste to ukene', 'Legg inn oppgaver i et prosjekt eller hendelser i kalenderen.')}</div>
        <div class="card"><div class="card-head"><h2>Aktive prosjekter</h2><a href="#" data-act="go" data-to="prosjekter" class="small">Alle</a></div>
          ${active.length ? `<div class="list">${active.map(HM.projectRow).join('')}</div>` : ui.empty('Ingen aktive prosjekter', '', `<button class="btn sm" data-act="newProject">${icon('plus')} Nytt prosjekt</button>`)}</div>
        <div class="card"><div class="card-head"><h2>Budsjett og kostnader</h2><a href="#" data-act="go" data-to="okonomi" class="small">Økonomi</a></div>
          <div class="stat-row"><div class="stat"><div class="v">${nok(t.budget)}</div><div class="k">Budsjett</div></div><div class="stat"><div class="v">${nok(t.paid)}</div><div class="k">Betalt</div></div><div class="stat"><div class="v">${nok(t.remaining)}</div><div class="k">Gjenstående</div></div><div class="stat ${t.budget && t.forecast > t.budget ? 'warn' : ''}"><div class="v">${nok(t.forecast)}</div><div class="k">Forventet sluttsum</div></div></div>
          ${HM.econBar({ budget: t.budget, paid: t.paid, remaining: t.remaining, forecast: t.forecast })}
          ${Math.abs(t.unallocated) > 0.5 ? `<p class="tiny muted">${nok(t.unallocated)} på kvitteringer er ikke fordelt til prosjekter.</p>` : ''}</div>
        <div class="card"><div class="card-head"><h2>Varer som mangler</h2><a href="#" data-act="go" data-to="lister" class="small">Lister</a></div>
          ${missing.length || tools.length ? `<div class="list">${missing.slice(0, 5).map(i => `<div class="row"><div class="grow"><div class="title">${esc(i.name)}</div><div class="small muted">${i.qty ? i.qty + ' ' + esc(i.unit || 'stk') : ''}${i.store ? ' · ' + esc(i.store) : ''}</div></div><span class="num small">${i.price ? '≈ ' + nok(num(i.qty || 1) * num(i.price)) : ''}</span></div>`).join('')}${tools.slice(0, 3).map(x => `<div class="row"><div class="grow"><div class="title">${esc(x.name)}</div></div><span class="pill ${x.status === 'lane' ? 'src' : 'est'}">${x.status === 'lane' ? 'Må låne' : 'Må kjøpe'}</span></div>`).join('')}</div>${missing.length > 5 ? `<p class="small muted">+ ${missing.length - 5} varer til</p>` : ''}` : ui.empty('Ingen varer mangler', '')}</div>
        <div class="card"><div class="card-head"><h2>Vedlikehold som nærmer seg</h2><a href="#" data-act="go" data-to="vedlikehold" class="small">Plan</a></div>
          ${maint.length ? `<div class="list">${maint.map(m => { const [c, l] = HM.maintStatus(m); return `<div class="row"><div class="grow"><div class="title">${esc(m.title)}</div><div class="small muted">${fmtDate(HM.maintNext(m))}</div></div><span class="pill ${c}">${l}</span></div>`; }).join('')}</div>` : ui.empty('Ingenting de neste 60 dagene', st.maintenance.length ? '' : 'Sett opp en vedlikeholdsplan.', st.maintenance.length ? '' : `<button class="btn sm" data-act="go" data-to="vedlikehold">${icon('wrench')} Vedlikeholdsplan</button>`)}</div>
      </div>
      <p class="disclaimer">Automatisk genererte tegninger og modeller er ikke godkjente byggtegninger. Appen avgjør ikke om vegger er bærende, eller om tiltak er lovlige eller teknisk forsvarlige.</p>
    </div>`;
    const c = main.querySelector('#mini-plan');
    if (c) requestAnimationFrame(() => {
      const r = c.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.max(200, r.width), H = Math.max(120, r.height); c.width = W * dpr; c.height = H * dpr;
      const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const fid = fl.find(f => plan.rooms.some(r => r.floorId === f.id)).id;
      const v = HM.fitView(plan, fid, W, H, 16); HM.drawPlan(ctx, plan, fid, v, W, H, { grid: false, flags: false, furniture: true, labels: W > 300 });
      c.style.cursor = 'pointer'; c.onclick = () => HM.actions.openHouse({ dataset: { mode: 'plan' } });
    });
    main.querySelectorAll('[data-ci]').forEach(b => b.onclick = () => { const [kind, id, date, pid] = b.dataset.ci.split(':'); HM.openCalItem(kind, id, date, pid); });
  };
  HM.actions.openHouse = el => {
    HM.state.activeVersionId = HM.currentVersion().id; HM.editorFloor = null;
    if (el.dataset.mode === 'walk') { HM.pendingWalk = (HM.plan().rooms[0] || {}).id; HM.go('huset', { mode: HM.houseMode === 'plan' ? '3d' : HM.houseMode }); return; }
    HM.go('huset', { mode: el.dataset.mode === '3d' && HM.houseMode === 'split' ? 'split' : el.dataset.mode });
  };
  HM.actions.quickRoom = () => HM.quickRoom();
})();
