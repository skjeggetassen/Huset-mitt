/* Oppussingsprosjekter: oppgaver med avhengigheter, økonomi, tilbud, filer. */
(function () {
  const { esc, byId, uid, nok, fmtDate, fmtDateShort, todayISO, addDays, daysBetween, num, relDays } = HM.util; const icon = HM.icon; const ui = HM.ui;
  const STATUS = [['ide', 'Idé'], ['planlagt', 'Planlagt'], ['pagar', 'Pågår'], ['ferdig', 'Ferdig'], ['utsatt', 'Utsatt']];
  const STATUS_CLS = { ide: '', planlagt: 'src', pagar: 'acc', ferdig: 'ok', utsatt: 'est' };
  const PRIO = [['hoy', 'Høy'], ['middels', 'Middels'], ['lav', 'Lav']];
  HM.PROJECT_STATUS = STATUS;
  const statusPill = s => `<span class="pill ${STATUS_CLS[s] || ''}">${(STATUS.find(x => x[0] === s) || STATUS[0])[1]}</span>`;
  HM.projectStatusPill = statusPill;

  // ---------- Økonomi (rene funksjoner, testes separat) ----------
  const econ = HM.econ = {
    sign: r => r.kind === 'retur' ? -1 : 1,
    paid(state, pid) { let s = 0; for (const r of state.receipts) for (const a of r.allocations || []) if (a.projectId === pid) s += econ.sign(r) * num(a.amount); return s; },
    planned(state, pid) { return state.shopping.filter(i => i.projectId === pid && !i.bought).reduce((s, i) => s + num(i.qty || 1) * num(i.price), 0); },
    openQuotes(p) { return (p.quotes || []).filter(q => q.accepted && !q.paid).reduce((s, q) => s + num(q.amount), 0); },
    pendingQuotes(p) { return (p.quotes || []).filter(q => !q.accepted).reduce((s, q) => s + num(q.amount), 0); },
    project(state, p) {
      const paid = econ.paid(state, p.id), planned = econ.planned(state, p.id), quotes = econ.openQuotes(p), extra = num(p.extraRemaining);
      const remaining = p.status === 'ferdig' ? 0 : planned + quotes + extra;
      const forecast = paid + remaining; const budget = num(p.budget);
      return { budget, paid, planned, quotes, extra, remaining, forecast, deviation: budget - forecast, pendingQuotes: econ.pendingQuotes(p) };
    },
    totals(state) {
      const t = { budget: 0, paid: 0, remaining: 0, forecast: 0 };
      for (const p of state.projects) { const e = econ.project(state, p); t.budget += e.budget; t.paid += e.paid; t.remaining += e.remaining; t.forecast += e.forecast; }
      t.unallocated = econ.unallocatedTotal(state);
      t.allSpent = state.receipts.reduce((s, r) => s + econ.sign(r) * num(r.total), 0);
      return t;
    },
    allocated: r => (r.allocations || []).reduce((s, a) => s + num(a.amount), 0),
    unallocated: r => Math.round((num(r.total) - econ.allocated(r)) * 100) / 100,
    unallocatedTotal(state) { return state.receipts.reduce((s, r) => s + econ.sign(r) * econ.unallocated(r), 0); },
  };

  // ---------- Avhengigheter ----------
  /** Etterfølgere som må flyttes når en oppgave slutter senere. Endrer ikke data. */
  HM.taskShifts = function (project, changedId, newStart, newEnd) {
    const tasks = project.tasks.map(t => ({ ...t }));
    const ch = tasks.find(t => t.id === changedId); if (!ch) return [];
    ch.start = newStart; ch.end = newEnd;
    const shifts = new Map(); const queue = [ch];
    while (queue.length) {
      const pred = queue.shift(); if (!pred.end) continue;
      for (const s of tasks.filter(t => (t.dependsOn || []).includes(pred.id))) {
        if (!s.start) continue;
        if (s.start <= pred.end) {
          const delta = daysBetween(s.start, pred.end) + 1;
          if (!shifts.has(s.id)) shifts.set(s.id, { id: s.id, title: s.title, oldStart: s.start, oldEnd: s.end });
          s.start = addDays(s.start, delta); if (s.end) s.end = addDays(s.end, delta);
          const rec = shifts.get(s.id); rec.newStart = s.start; rec.newEnd = s.end;
          queue.push(s);
        }
      }
    }
    return [...shifts.values()];
  };
  HM.taskConflicts = function (project, t) {
    return (t.dependsOn || []).map(id => byId(project.tasks, id)).filter(p => p && p.end && t.start && t.start <= p.end && !p.done);
  };
  HM.taskLate = t => !t.done && t.end && t.end < todayISO();

  // ---------- Liste ----------
  HM.projectRow = function (p) {
    const e = econ.project(HM.state, p); const done = p.tasks.filter(t => t.done).length;
    const late = p.tasks.filter(HM.taskLate).length;
    return `<div class="row click" data-act="go" data-to="prosjekt" data-id="${p.id}"><div class="grow"><div class="title">${esc(p.name)}</div><div class="small muted">${p.tasks.length ? `${done}/${p.tasks.length} oppgaver · ` : ''}${e.budget ? `${nok(e.forecast)} av ${nok(e.budget)}` : (e.paid ? nok(e.paid) + ' betalt' : '')}${late ? ` · <span style="color:var(--bad);font-weight:600">${late} forsinket</span>` : ''}</div></div>${statusPill(p.status)}</div>`;
  };
  function econBar(e) {
    const max = Math.max(e.budget, e.forecast, 1);
    const paidW = Math.min(e.paid, max) / max * 100, remW = Math.max(0, Math.min(e.remaining, max - e.paid)) / max * 100;
    return `<div class="bar" title="Betalt og forventet gjenstående mot budsjett"><i class="paid" style="width:${paidW}%"></i><i class="rem" style="width:${remW}%"></i></div>${e.budget && e.forecast > e.budget ? `<div class="tiny" style="color:var(--bad);font-weight:600">Forventet ${nok(e.forecast - e.budget)} over budsjett</div>` : ''}`;
  }
  HM.econBar = econBar;

  HM.views.prosjekter = function (main, params) {
    const st = HM.state; const filter = params.filter || 'aktive';
    const list = st.projects.filter(p => filter === 'alle' ? true : filter === 'aktive' ? ['ide', 'planlagt', 'pagar'].includes(p.status) : p.status === filter)
      .sort((a, b) => ({ pagar: 0, planlagt: 1, ide: 2, utsatt: 3, ferdig: 4 }[a.status] - { pagar: 0, planlagt: 1, ide: 2, utsatt: 3, ferdig: 4 }[b.status]) || ({ hoy: 0, middels: 1, lav: 2 }[a.priority] - { hoy: 0, middels: 1, lav: 2 }[b.priority]));
    main.innerHTML = `<div class="page">
      <div class="page-head"><div><h1>Oppussingsprosjekter</h1><p class="muted">Knytt prosjekter til rom og forslag, og hold styr på oppgaver, datoer og kostnader.</p></div><button class="btn primary" data-act="newProject">${icon('plus')} Nytt prosjekt</button></div>
      <div class="seg">${[['aktive', 'Aktive'], ['alle', 'Alle'], ...STATUS].map(([k, l]) => `<button aria-pressed="${filter === k}" data-act="projFilter" data-f="${k}">${l}</button>`).join('')}</div>
      ${list.length ? `<div class="grid">${list.map(p => {
        const e = econ.project(st, p); const done = p.tasks.filter(t => t.done).length; const late = p.tasks.filter(HM.taskLate).length;
        return `<div class="card" style="cursor:pointer" data-act="go" data-to="prosjekt" data-id="${p.id}">
          <div class="card-head"><h3>${esc(p.name)}</h3><div class="btn-row">${p.needsClarification ? '<span class="pill bad">Må avklares</span>' : ''}${statusPill(p.status)}</div></div>
          <div class="small muted">${(p.roomIds || []).map(HM.roomName).map(esc).join(', ') || esc(p.area || 'Ingen rom valgt')}${p.start ? ` · ${fmtDateShort(p.start)}–${fmtDateShort(p.end)}` : ''} · prioritet ${(PRIO.find(x => x[0] === p.priority) || PRIO[1])[1].toLowerCase()}</div>
          ${p.tasks.length ? `<div class="small">${done} av ${p.tasks.length} oppgaver ferdig${late ? ` · <span style="color:var(--bad);font-weight:600">${late} forsinket</span>` : ''}</div>` : ''}
          <div class="small" style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><span>Betalt <strong>${nok(e.paid)}</strong></span><span>Forventet <strong>${nok(e.forecast)}</strong></span><span class="muted">Budsjett ${e.budget ? nok(e.budget) : '–'}</span></div>
          ${econBar(e)}
        </div>`;
      }).join('')}</div>` : ui.empty(st.projects.length ? 'Ingen prosjekter i dette utvalget' : 'Ingen prosjekter ennå', 'Lag et prosjekt, for eksempel «Male stua» eller «Nytt kjøkken».', `<button class="btn primary" data-act="newProject">${icon('plus')} Nytt prosjekt</button>`)}
    </div>`;
  };
  HM.actions.projFilter = el => HM.go('prosjekter', { filter: el.dataset.f });

  // ---------- Skjema ----------
  function projectForm(p) {
    const rooms = HM.allRooms(); const vers = HM.state.versions.filter(v => v.kind !== 'historikk');
    return `<div class="form-grid">
      ${ui.field('Navn', ui.input('p_name', p.name, 'placeholder="F.eks. Male stua"'), 'wide')}
      ${ui.field('Beskrivelse', `<textarea id="p_desc" name="p_desc">${esc(p.description || '')}</textarea>`, 'wide')}
      ${ui.field('Status', ui.select('p_status', STATUS, p.status))}
      ${ui.field('Prioritet', ui.select('p_prio', PRIO, p.priority))}
      ${ui.field('Planlagt start', `<input type="date" id="p_start" name="p_start" value="${p.start || ''}">`)}
      ${ui.field('Planlagt slutt', `<input type="date" id="p_end" name="p_end" value="${p.end || ''}">`)}
      ${ui.field('Budsjett (kr)', ui.input('p_budget', p.budget || '', 'inputmode="decimal"'))}
      ${ui.field('Ansvarlig / håndverker', ui.input('p_resp', p.responsible || '', 'placeholder="Valgfritt"'))}
      ${ui.field('Område (hvis ikke et rom)', ui.input('p_area', p.area || '', 'placeholder="F.eks. tak, hage, fasade"'), 'wide')}
      ${ui.field('Forslag i modellen', ui.select('p_version', [['', 'Ingen'], ...vers.map(v => [v.id, v.name])], p.versionId || ''), 'wide', 'Koble prosjektet til et forslag, f.eks. «Nytt kjøkken»')}
    </div>
    <div class="field"><span>Rom</span>${rooms.length ? `<div class="btn-row">${rooms.map(r => `<label class="check pill" style="padding:6px 10px;font-size:.85rem"><input type="checkbox" name="p_room_${r.id}" ${(p.roomIds || []).includes(r.id) ? 'checked' : ''}> ${esc(r.name)}</label>`).join('')}</div>` : '<span class="small muted">Ingen rom i dagens hus ennå.</span>'}</div>
    <label class="check"><input type="checkbox" id="p_flag" name="p_flag" ${p.needsClarification ? 'checked' : ''}> Må avklares (f.eks. bæring, søknadsplikt eller teknisk løsning)</label>
    ${ui.field('Hva må avklares?', ui.input('p_flagnote', p.clarificationNote || '', 'placeholder="F.eks. Er veggen bærende? Søknadsplikt?"'))}`;
  }
  function readProject(m, p) {
    const v = HM.formValues(m.el);
    p.name = v.p_name.trim() || 'Prosjekt'; p.description = v.p_desc; p.status = v.p_status; p.priority = v.p_prio; p.start = v.p_start || null; p.end = v.p_end || null;
    p.budget = num(v.p_budget) || 0; p.responsible = v.p_resp; p.area = v.p_area; p.versionId = v.p_version || null; p.needsClarification = !!v.p_flag; p.clarificationNote = v.p_flagnote;
    p.roomIds = Object.keys(v).filter(k => k.startsWith('p_room_') && v[k]).map(k => k.slice(7));
  }
  HM.newProjectObj = (o = {}) => Object.assign({ id: uid('prj'), name: '', description: '', roomIds: [], area: '', status: 'planlagt', priority: 'middels', start: null, end: null, budget: 0, extraRemaining: 0, tasks: [], quotes: [], responsible: '', versionId: null, needsClarification: false, clarificationNote: '', createdAt: new Date().toISOString() }, o);
  HM.actions.newProject = el => {
    const p = HM.newProjectObj({ roomIds: el && el.dataset.room ? [el.dataset.room] : [] });
    HM.modal({
      title: 'Nytt prosjekt', body: projectForm(p),
      foot: `<button class="btn" data-close>Avbryt</button><button class="btn primary" id="p_ok">Opprett</button>`,
      onMount: m => m.$('#p_ok').onclick = () => { readProject(m, p); if (!m.$('#p_name').value.trim()) { HM.toast('Gi prosjektet et navn'); return; } HM.state.projects.push(p); HM.save(); m.close(); HM.go('prosjekt', { id: p.id }); },
    });
  };
  HM.actions.editProject = el => {
    const p = byId(HM.state.projects, el.dataset.id); if (!p) return;
    HM.modal({
      title: 'Endre prosjekt', body: projectForm(p),
      foot: `<button class="btn danger" id="p_del">${icon('trash')} Slett</button><button class="btn" data-close>Avbryt</button><button class="btn primary" id="p_ok">Lagre</button>`,
      onMount: m => {
        m.$('#p_ok').onclick = () => { readProject(m, p); HM.save(); m.close(); HM.render(); };
        m.$('#p_del').onclick = async () => {
          if (!(await HM.confirm('Slette prosjektet?', `«${esc(p.name)}» med oppgaver og tilbud slettes. Kvitteringer beholdes, men fordelingen til prosjektet fjernes.`, 'Slett prosjektet'))) return;
          HM.state.projects = HM.state.projects.filter(x => x.id !== p.id);
          HM.state.receipts.forEach(r => r.allocations = (r.allocations || []).filter(a => a.projectId !== p.id));
          HM.state.shopping.forEach(i => { if (i.projectId === p.id) i.projectId = null; }); HM.state.tools.forEach(i => { if (i.projectId === p.id) i.projectId = null; });
          HM.state.events.forEach(e => { if (e.projectId === p.id) e.projectId = null; });
          HM.save(); m.close(); HM.go('prosjekter');
        };
      },
    });
  };

  // ---------- Prosjektside ----------
  HM.views.prosjekt = function (main, params) {
    const st = HM.state; const p = byId(st.projects, params.id);
    if (!p) { main.innerHTML = `<div class="page">${ui.empty('Prosjektet finnes ikke', '', `<button class="btn" data-act="go" data-to="prosjekter">Til prosjekter</button>`)}</div>`; return; }
    const tab = params.tab || 'oversikt'; const e = econ.project(st, p);
    const ver = p.versionId && byId(st.versions, p.versionId);
    const tabs = [['oversikt', 'Oversikt'], ['oppgaver', `Oppgaver (${p.tasks.length})`], ['okonomi', 'Økonomi'], ['innkjop', 'Innkjøp og verktøy'], ['filer', 'Bilder og filer']];
    main.innerHTML = `<div class="page">
      <div><button class="btn sm ghost" data-act="go" data-to="prosjekter">${icon('back')} Prosjekter</button></div>
      <div class="page-head"><div><div class="btn-row">${statusPill(p.status)}${p.needsClarification ? `<span class="pill bad">${icon('flag')} Må avklares</span>` : ''}<span class="pill">Prioritet ${(PRIO.find(x => x[0] === p.priority) || PRIO[1])[1].toLowerCase()}</span></div><h1 style="margin-top:6px">${esc(p.name)}</h1>
        <p class="muted small">${(p.roomIds || []).map(id => `<a href="#" data-act="go" data-to="rom" data-id="${id}">${esc(HM.roomName(id))}</a>`).join(', ') || esc(p.area || '')}${p.start ? ` · ${fmtDate(p.start)} – ${fmtDate(p.end)}` : ''}${p.responsible ? ` · ${esc(p.responsible)}` : ''}</p></div>
        <div class="btn-row"><button class="btn" data-act="editProject" data-id="${p.id}">${icon('edit')} Endre</button><button class="btn primary" data-act="scanReceipt" data-project="${p.id}">${icon('camera')} Skann kvittering</button></div></div>
      <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${tab === k}" data-act="go" data-to="prosjekt" data-id="${p.id}" data-tab="${k}">${l}</button>`).join('')}</div>
      <div id="ptab">${({ oversikt: tabOverview, oppgaver: tabTasks, okonomi: tabEcon, innkjop: tabShop, filer: tabFiles })[tab](p, e, ver)}</div>
    </div>`;
    wireProject(main, p, tab);
  };

  function tabOverview(p, e, ver) {
    const next = p.tasks.filter(t => !t.done).sort((a, b) => (a.start || a.end || '9') < (b.start || b.end || '9') ? -1 : 1).slice(0, 5);
    return `<div class="grid-2">
      <div class="card"><h2>Om prosjektet</h2>${p.description ? `<p style="white-space:pre-wrap">${esc(p.description)}</p>` : '<p class="muted">Ingen beskrivelse.</p>'}
        ${p.needsClarification ? `<div class="notice bad">${icon('flag')}<div><strong>Må avklares:</strong> ${esc(p.clarificationNote || 'Ikke beskrevet')}. Appen vurderer ikke bæring, lovlighet eller teknisk forsvarlighet.</div></div>` : ''}
        ${ver ? `<div class="notice info">${icon('layers')}<div>Koblet til forslaget <strong>${esc(ver.name)}</strong>. ${esc(HM.versionDiff(HM.currentVersion().plan, ver.plan))}<div class="btn-row" style="margin-top:6px"><button class="btn sm" data-act="openVersion" data-id="${ver.id}" data-mode="plan">${icon('plan')} Åpne forslaget</button>${ver.kind !== 'current' ? `<button class="btn sm" data-act="compareVersion" data-id="${ver.id}">${icon('compare')} Før/etter i 3D</button>` : ''}</div></div></div>` : `<div class="btn-row"><button class="btn sm" data-act="projNewVersion" data-id="${p.id}">${icon('copy')} Lag forslag i modellen for prosjektet</button></div>`}
      </div>
      <div class="card"><h2>Økonomi</h2>${econStats(e)}${econBar(e)}</div>
      <div class="card"><div class="card-head"><h2>Neste oppgaver</h2><button class="btn sm" data-act="newTask" data-project="${p.id}">${icon('plus')} Ny oppgave</button></div>
        ${next.length ? `<div class="list">${next.map(t => taskRow(p, t)).join('')}</div>` : ui.empty('Ingen åpne oppgaver', 'Legg til oppgaver med datoer og avhengigheter.')}</div>
    </div>`;
  }
  function econStats(e) {
    return `<div class="stat-row">
      <div class="stat"><div class="v">${e.budget ? nok(e.budget) : '–'}</div><div class="k">Budsjett</div></div>
      <div class="stat"><div class="v">${nok(e.paid)}</div><div class="k">Betalt</div></div>
      <div class="stat"><div class="v">${nok(e.remaining)}</div><div class="k">Forventet gjenstående</div></div>
      <div class="stat ${e.budget && e.forecast > e.budget ? 'warn' : ''}"><div class="v">${nok(e.forecast)}</div><div class="k">Forventet sluttsum</div></div>
    </div>`;
  }
  HM.econStats = econStats;

  function taskRow(p, t) {
    const conflicts = HM.taskConflicts(p, t); const late = HM.taskLate(t);
    const deps = (t.dependsOn || []).map(id => byId(p.tasks, id)).filter(Boolean);
    const cl = t.checklist || [];
    return `<div class="row"><input type="checkbox" class="t-done" data-p="${p.id}" data-t="${t.id}" ${t.done ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--accent);flex:none" aria-label="Fullført">
      <div class="grow click" data-act="editTask" data-p="${p.id}" data-t="${t.id}" style="cursor:pointer"><div class="title" style="${t.done ? 'text-decoration:line-through;opacity:.6' : ''}">${esc(t.title)}</div>
      <div class="small muted">${t.start || t.end ? `${t.start ? fmtDateShort(t.start) : ''}${t.end && t.end !== t.start ? '–' + fmtDateShort(t.end) : ''}` : 'Ingen dato'}${t.assignee ? ' · ' + esc(t.assignee) : ''}${deps.length ? ' · etter ' + deps.map(d => '«' + esc(d.title) + '»').join(', ') : ''}${cl.length ? ` · sjekkliste ${cl.filter(c => c.done).length}/${cl.length}` : ''}</div>
      ${conflicts.length ? `<div class="tiny" style="color:var(--bad);font-weight:600">Starter før ${conflicts.map(c => '«' + esc(c.title) + '»').join(', ')} er ferdig</div>` : ''}</div>
      ${late ? '<span class="pill bad">Forsinket</span>' : ''}${t.needsClarification ? '<span class="pill bad">Må avklares</span>' : ''}</div>`;
  }
  HM.taskRow = taskRow;
  function tabTasks(p) {
    const sorted = p.tasks.slice().sort((a, b) => (a.done - b.done) || ((a.start || a.end || '9999') < (b.start || b.end || '9999') ? -1 : 1));
    return `<div class="card"><div class="card-head"><h2>Oppgaver</h2><button class="btn sm primary" data-act="newTask" data-project="${p.id}">${icon('plus')} Ny oppgave</button></div>
      ${sorted.length ? `<div class="list">${sorted.map(t => taskRow(p, t)).join('')}</div>` : ui.empty('Ingen oppgaver', 'Del prosjektet opp i oppgaver. En oppgave kan avhenge av en annen, for eksempel at maling må være ferdig før gulvlister monteres.')}
      ${sorted.length ? timeline(p) : ''}</div>`;
  }
  function timeline(p) {
    const ts = p.tasks.filter(t => t.start && t.end); if (!ts.length) return '';
    const min = ts.reduce((a, t) => t.start < a ? t.start : a, ts[0].start), max = ts.reduce((a, t) => t.end > a ? t.end : a, ts[0].end);
    const span = Math.max(1, daysBetween(min, max) + 1); const today = todayISO(); const tpos = daysBetween(min, today) / span * 100;
    return `<details open><summary>Tidslinje</summary><div style="display:flex;flex-direction:column;gap:5px;margin-top:8px;position:relative">
      ${tpos >= 0 && tpos <= 100 ? `<div style="position:absolute;top:0;bottom:0;left:calc(38% + ${tpos * 0.62}%);border-left:2px dashed var(--bad);opacity:.6" title="I dag"></div>` : ''}
      ${ts.sort((a, b) => a.start < b.start ? -1 : 1).map(t => { const l = daysBetween(min, t.start) / span * 100, w = Math.max(1.5, (daysBetween(t.start, t.end) + 1) / span * 100); return `<div style="display:grid;grid-template-columns:38% 1fr;gap:6px;align-items:center"><span class="small" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.title)}</span><div style="position:relative;height:14px;background:var(--surface-2);border-radius:4px"><i style="position:absolute;left:${l}%;width:${w}%;top:0;bottom:0;border-radius:4px;background:${t.done ? 'var(--ok)' : HM.taskLate(t) ? 'var(--bad)' : 'var(--accent)'};opacity:${t.done ? .5 : .85}"></i></div></div>`; }).join('')}
      <div class="tiny muted" style="display:flex;justify-content:space-between;margin-left:38%"><span>${fmtDateShort(min)}</span><span>${fmtDateShort(max)}</span></div></div></details>`;
  }
  function tabEcon(p, e) {
    const st = HM.state;
    const recs = st.receipts.filter(r => (r.allocations || []).some(a => a.projectId === p.id)).sort((a, b) => (b.date || '') < (a.date || '') ? -1 : 1);
    return `<div class="grid-2">
      <div class="card"><h2>Oversikt</h2>${econStats(e)}${econBar(e)}
        <div class="kv small"><dt>Planlagte innkjøp (handleliste)</dt><dd>${nok(e.planned)}</dd><dt>Aksepterte tilbud, ikke betalt</dt><dd>${nok(e.quotes)}</dd>
          <dt>Andre forventede kostnader</dt><dd><input class="input" id="pe_extra" value="${p.extraRemaining || ''}" inputmode="decimal" placeholder="0" style="max-width:130px;min-height:30px;padding:4px 8px"></dd>
          ${e.pendingQuotes ? `<dt>Tilbud til vurdering (ikke regnet med)</dt><dd>${nok(e.pendingQuotes)}</dd>` : ''}</div>
        <p class="tiny muted">Betalt er summen av kvitteringer fordelt til prosjektet (returer trekkes fra). Tilbud og planlagte innkjøp regnes aldri som betalt.</p>
        ${p.status === 'ferdig' ? '<p class="tiny muted">Prosjektet er ferdig, så forventet gjenstående er satt til 0.</p>' : ''}</div>
      <div class="card"><div class="card-head"><h2>Tilbud</h2><button class="btn sm" data-act="newQuote" data-p="${p.id}">${icon('plus')} Nytt tilbud</button></div>
        ${(p.quotes || []).length ? `<div class="list">${p.quotes.map(q => `<div class="row click" data-act="editQuote" data-p="${p.id}" data-q="${q.id}"><div class="grow"><div class="title">${esc(q.supplier || 'Tilbud')}</div><div class="small muted">${q.date ? fmtDate(q.date) : ''}${q.note ? ' · ' + esc(q.note) : ''}</div></div><span class="num">${nok(q.amount)}</span>${q.paid ? '<span class="pill ok">Betalt</span>' : q.accepted ? '<span class="pill acc">Akseptert</span>' : '<span class="pill">Til vurdering</span>'}</div>`).join('')}</div>` : ui.empty('Ingen tilbud', 'Legg inn tilbud fra håndverkere. Aksepterte tilbud regnes som forventet kostnad.')}</div>
      <div class="card" style="grid-column:1/-1"><div class="card-head"><h2>Kvitteringer</h2><button class="btn sm primary" data-act="scanReceipt" data-project="${p.id}">${icon('camera')} Skann kvittering</button></div>
        ${recs.length ? `<div class="list">${recs.map(r => HM.receiptRow(r, p.id)).join('')}</div>` : ui.empty('Ingen kvitteringer', 'Ta bilde av en kvittering, så foreslår Claude butikk, dato, beløp og prosjekt.')}</div>
    </div>`;
  }
  function tabShop(p) {
    return `<div class="grid-2"><div class="card"><div class="card-head"><h2>Handleliste</h2><button class="btn sm" data-act="newShop" data-project="${p.id}">${icon('plus')} Vare</button></div>${HM.shoppingListHtml(HM.state.shopping.filter(i => i.projectId === p.id), { project: p.id })}</div>
      <div class="card"><div class="card-head"><h2>Verktøy</h2><button class="btn sm" data-act="newTool" data-project="${p.id}">${icon('plus')} Verktøy</button></div>${HM.toolListHtml(HM.state.tools.filter(i => i.projectId === p.id))}</div>
      <div class="card"><div class="card-head"><h2>Huskelister</h2><button class="btn sm" data-act="newChecklist" data-project="${p.id}">${icon('plus')} Huskeliste</button></div>${HM.state.checklists.filter(c => c.projectId === p.id).map(c => HM.checklistHtml(c)).join('') || ui.empty('Ingen huskelister', '')}</div></div>`;
  }
  function tabFiles(p) {
    const media = HM.state.media.filter(m => m.projectId === p.id);
    const before = media.filter(m => (m.tags || []).includes('før')), after = media.filter(m => (m.tags || []).includes('etter'));
    return `<div class="card"><div class="card-head"><h2>Bilder, dokumenter, tilbud og kvitteringer</h2>
      <div class="btn-row"><select class="input" id="pf_tag" style="width:auto"><option value="">Type …</option><option value="før">Før-bilde</option><option value="etter">Etter-bilde</option><option value="underveis">Underveis</option><option value="skjult">Skjult installasjon</option><option value="tilbud">Tilbud</option><option value="dokument">Dokument</option></select>
      <label class="btn sm primary">${icon('upload')} Last opp<input type="file" id="pf_file" multiple hidden></label></div></div>
      ${before.length && after.length ? `<div><div class="label">Før og etter</div><div class="grid-2" style="margin-top:6px"><div class="thumb" style="aspect-ratio:4/3"><img data-blob="${before[0].blobId}" alt="Før"><span class="cap">Før</span></div><div class="thumb" style="aspect-ratio:4/3"><img data-blob="${after[after.length - 1].blobId}" alt="Etter"><span class="cap">Etter</span></div></div></div>` : ''}
      ${media.length ? `<div class="thumbs">${media.map(m => mediaThumb(m)).join('')}</div>` : ui.empty('Ingen filer', 'Last opp bilder, tilbud, bruksanvisninger eller andre dokumenter.')}</div>`;
  }
  function mediaThumb(m) {
    const isImg = (m.type || '').startsWith('image/');
    return `<div class="thumb ${isImg ? '' : 'file'}">${isImg ? `<a href="#" data-blob-href="${m.blobId}" target="_blank" rel="noopener"><img data-blob="${m.blobId}" alt="${esc(m.name)}"></a>` : `<a href="#" data-blob-href="${m.blobId}" target="_blank" rel="noopener" download="${esc(m.name)}">${icon('book')}<br>${esc(m.name)}</a>`}<span class="cap">${esc((m.tags || []).join(', ') || m.kind || '')}</span><button class="x" data-rmmedia="${m.id}" aria-label="Slett">×</button></div>`;
  }
  HM.mediaThumb = mediaThumb;

  function wireProject(main, p, tab) {
    main.querySelectorAll('.t-done').forEach(c => c.addEventListener('change', () => { const t = byId(p.tasks, c.dataset.t); t.done = c.checked; t.doneAt = c.checked ? todayISO() : null; HM.save(); HM.render(); }));
    const ex = main.querySelector('#pe_extra'); if (ex) ex.addEventListener('change', () => { p.extraRemaining = num(ex.value); HM.save(); HM.render(); });
    const pf = main.querySelector('#pf_file'); if (pf) pf.onchange = async () => { const tag = main.querySelector('#pf_tag').value; for (const f of pf.files) await HM.addMedia(f, { kind: (f.type || '').startsWith('image/') ? 'foto' : 'dokument', projectId: p.id, roomIds: (p.roomIds || []).slice(), tags: tag ? [tag] : [] }); HM.toast('Lagret'); HM.render(); };
    main.querySelectorAll('[data-rmmedia]').forEach(b => b.onclick = async e => { e.preventDefault(); if (await HM.confirm('Slette filen?', 'Filen slettes fra appen.', 'Slett')) { await HM.removeMedia(b.dataset.rmmedia); HM.render(); } });
    HM.wireLists && HM.wireLists(main);
    HM.wireChecklists && HM.wireChecklists(main);
  }
  HM.actions.projNewVersion = el => {
    const p = byId(HM.state.projects, el.dataset.id); const from = HM.currentVersion();
    const v = { id: uid('ver'), name: p.name, kind: 'proposal', createdAt: new Date().toISOString(), basedOn: from.id, description: 'Forslag for prosjektet ' + p.name, plan: HM.util.clone(from.plan) };
    HM.state.versions.push(v); p.versionId = v.id; HM.state.activeVersionId = v.id; HM.save();
    HM.toast('Forslaget er laget. Endringer her påvirker ikke dagens hus.'); HM.go('huset', { mode: HM.houseMode });
  };

  // ---------- Oppgaver ----------
  function taskForm(p, t) {
    const others = p.tasks.filter(x => x.id !== t.id);
    return `<div class="form-grid">
      ${ui.field('Oppgave', ui.input('t_title', t.title, 'placeholder="F.eks. Male vegger"'), 'wide')}
      ${ui.field('Start', `<input type="date" id="t_start" name="t_start" value="${t.start || ''}">`)}
      ${ui.field('Frist / slutt', `<input type="date" id="t_end" name="t_end" value="${t.end || ''}">`)}
      ${ui.field('Ansvarlig', ui.input('t_assignee', t.assignee || '', 'placeholder="Valgfritt"'))}
      ${ui.field('Påminnelse', ui.select('t_remind', [['', 'Ingen'], ['0', 'Samme dag'], ['1', '1 dag før'], ['3', '3 dager før'], ['7', '1 uke før']], t.remindDays ?? ''))}
    </div>
    ${others.length ? `<div class="field"><span>Må vente på (avhengigheter)</span><div class="btn-row">${others.map(o => `<label class="check pill" style="padding:6px 10px;font-size:.85rem"><input type="checkbox" name="t_dep_${o.id}" ${(t.dependsOn || []).includes(o.id) ? 'checked' : ''}> ${esc(o.title)}</label>`).join('')}</div></div>` : ''}
    <div class="field"><span>Sjekkliste</span><div id="t_cl" class="list">${(t.checklist || []).map((c, i) => `<div class="row" style="padding:4px 0"><input type="checkbox" data-cli="${i}" ${c.done ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--accent)"><input class="input" data-clt="${i}" value="${esc(c.text)}" style="min-height:32px;padding:4px 8px"><button class="btn icon ghost sm" data-clx="${i}" aria-label="Fjern">${icon('x')}</button></div>`).join('')}</div>
      <div class="btn-row"><input class="input" id="t_clnew" placeholder="Nytt punkt" style="flex:1"><button class="btn sm" id="t_cladd">${icon('plus')}</button></div></div>
    <label class="check"><input type="checkbox" name="t_flag" ${t.needsClarification ? 'checked' : ''}> Må avklares</label>
    ${ui.field('Notat', `<textarea name="t_note">${esc(t.note || '')}</textarea>`)}`;
  }
  function openTask(p, t, isNew) {
    const work = JSON.parse(JSON.stringify(t)); work.checklist = work.checklist || [];
    const m = HM.modal({
      title: isNew ? 'Ny oppgave' : 'Oppgave', body: taskForm(p, work),
      foot: `${isNew ? '' : `<button class="btn danger" id="t_del">${icon('trash')} Slett</button>`}<button class="btn" data-close>Avbryt</button><button class="btn primary" id="t_ok">Lagre</button>`,
      onMount: m => {
        const syncCl = () => { m.$$('[data-clt]').forEach(i => work.checklist[+i.dataset.clt].text = i.value); m.$$('[data-cli]').forEach(i => work.checklist[+i.dataset.cli].done = i.checked); };
        const rerenderCl = () => { syncCl(); const vals = HM.formValues(m.el); m.$('.sheet-body').innerHTML = taskForm(p, Object.assign(work, readTask(vals, work))); bindCl(); };
        const bindCl = () => {
          m.$('#t_cladd').onclick = () => { const v = m.$('#t_clnew').value.trim(); if (!v) return; syncCl(); work.checklist.push({ id: uid('cl'), text: v, done: false }); rerenderCl(); m.$('#t_clnew').focus(); };
          m.$('#t_clnew').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); m.$('#t_cladd').click(); } };
          m.$$('[data-clx]').forEach(b => b.onclick = () => { syncCl(); work.checklist.splice(+b.dataset.clx, 1); rerenderCl(); });
        };
        bindCl();
        m.$('#t_ok').onclick = () => {
          syncCl(); const vals = HM.formValues(m.el); const upd = readTask(vals, work);
          if (!upd.title) { HM.toast('Skriv inn en oppgave'); return; }
          if (upd.start && upd.end && upd.end < upd.start) { HM.toast('Slutt kan ikke være før start'); return; }
          // sirkulære avhengigheter
          if (circular(p, work.id, upd.dependsOn)) { HM.toast('Avhengighetene går i ring. Fjern en av dem.'); return; }
          const shifts = isNew ? [] : HM.taskShifts(p, work.id, upd.start, upd.end);
          const save = (applyShifts) => {
            const target = isNew ? work : byId(p.tasks, work.id);
            Object.assign(target, upd, { checklist: work.checklist });
            if (isNew) p.tasks.push(target);
            if (applyShifts) for (const s of shifts) { const x = byId(p.tasks, s.id); x.start = s.newStart; x.end = s.newEnd; }
            HM.save(); m.close(); HM.render();
          };
          if (shifts.length) {
            m.$('.sheet-foot').innerHTML = `<div class="notice warn" style="width:100%">${icon('alert')}<div><strong>Endringen påvirker ${shifts.length} oppgave${shifts.length > 1 ? 'r' : ''}:</strong><ul style="margin:4px 0 0;padding-left:18px">${shifts.map(s => `<li>${esc(s.title)}: ${fmtDateShort(s.oldStart)} → ${fmtDateShort(s.newStart)}</li>`).join('')}</ul></div></div>
              <button class="btn" id="t_keep">Behold de andre datoene</button><button class="btn primary" id="t_shift">Flytt berørte oppgaver</button>`;
            m.$('#t_keep').onclick = () => save(false); m.$('#t_shift').onclick = () => save(true);
            return;
          }
          save(false);
        };
        m.$('#t_del') && (m.$('#t_del').onclick = async () => { if (!(await HM.confirm('Slette oppgaven?', esc(work.title), 'Slett'))) return; p.tasks = p.tasks.filter(x => x.id !== work.id); p.tasks.forEach(x => x.dependsOn = (x.dependsOn || []).filter(d => d !== work.id)); HM.save(); HM.render(); });
      },
    });
  }
  function readTask(v, t) {
    return { title: (v.t_title || '').trim(), start: v.t_start || null, end: v.t_end || v.t_start || null, assignee: v.t_assignee || '', remindDays: v.t_remind === '' ? null : Number(v.t_remind), dependsOn: Object.keys(v).filter(k => k.startsWith('t_dep_') && v[k]).map(k => k.slice(6)), needsClarification: !!v.t_flag, note: v.t_note || '' };
  }
  function circular(p, id, deps) {
    const seen = new Set(); const stack = [...deps];
    while (stack.length) { const d = stack.pop(); if (d === id) return true; if (seen.has(d)) continue; seen.add(d); const t = byId(p.tasks, d); if (t) stack.push(...(t.dependsOn || [])); }
    return false;
  }
  HM.newTaskObj = (o = {}) => Object.assign({ id: uid('tsk'), title: '', start: null, end: null, done: false, doneAt: null, dependsOn: [], assignee: '', checklist: [], needsClarification: false, note: '', remindDays: null }, o);
  HM.actions.newTask = el => {
    const pid = el && el.dataset.project;
    if (!pid) {
      const ps = HM.state.projects.filter(p => p.status !== 'ferdig');
      if (!ps.length) { HM.modal({ title: 'Ny oppgave', body: `<p>Oppgaver hører til et prosjekt. Lag et prosjekt først, eller legg inn en avtale eller frist direkte i kalenderen.</p>`, foot: `<button class="btn" data-act="newEvent">${icon('cal')} Ny kalenderhendelse</button><button class="btn primary" data-act="newProject">${icon('plus')} Nytt prosjekt</button>`, onMount: m => m.$$('[data-act]').forEach(b => b.addEventListener('click', () => m.close())) }); return; }
      HM.modal({
        title: 'Ny oppgave – velg prosjekt', body: `<div class="list">${ps.map(p => `<div class="row click" data-pp="${p.id}"><div class="grow"><div class="title">${esc(p.name)}</div></div>${statusPill(p.status)}</div>`).join('')}</div>`,
        onMount: m => m.$$('[data-pp]').forEach(r => r.onclick = () => { m.close(); openTask(byId(HM.state.projects, r.dataset.pp), HM.newTaskObj({ start: todayISO(), end: todayISO() }), true); }),
      });
      return;
    }
    openTask(byId(HM.state.projects, pid), HM.newTaskObj(), true);
  };
  HM.actions.editTask = el => { const p = byId(HM.state.projects, el.dataset.p); const t = p && byId(p.tasks, el.dataset.t); if (t) openTask(p, t, false); };

  // ---------- Tilbud ----------
  function quoteModal(p, q, isNew) {
    HM.modal({
      title: isNew ? 'Nytt tilbud' : 'Tilbud',
      body: `<div class="form-grid">${ui.field('Leverandør / håndverker', ui.input('q_sup', q.supplier || ''), 'wide')}${ui.field('Beløp inkl. mva (kr)', ui.input('q_amt', q.amount || '', 'inputmode="decimal"'))}${ui.field('Dato', `<input type="date" name="q_date" value="${q.date || todayISO()}">`)}${ui.field('Notat', ui.input('q_note', q.note || ''), 'wide')}</div>
        <label class="check"><input type="checkbox" name="q_acc" ${q.accepted ? 'checked' : ''}> Akseptert (regnes som forventet kostnad)</label>
        <label class="check"><input type="checkbox" name="q_paid" ${q.paid ? 'checked' : ''}> Betalt (registrer selve betalingen som kvittering/faktura)</label>
        <label class="field"><span>Vedlegg (valgfritt)</span><input type="file" id="q_file"></label>`,
      foot: `${isNew ? '' : `<button class="btn danger" id="q_del">${icon('trash')}</button>`}<button class="btn" data-close>Avbryt</button><button class="btn primary" id="q_ok">Lagre</button>`,
      onMount: m => {
        m.$('#q_ok').onclick = async () => {
          const v = HM.formValues(m.el); Object.assign(q, { supplier: v.q_sup, amount: num(v.q_amt), date: v.q_date, note: v.q_note, accepted: !!v.q_acc, paid: !!v.q_paid });
          const f = m.$('#q_file').files[0]; if (f) { const md = await HM.addMedia(f, { kind: 'tilbud', projectId: p.id, tags: ['tilbud'] }); q.mediaId = md.id; }
          if (isNew) p.quotes.push(q); HM.save(); m.close(); HM.render();
        };
        m.$('#q_del') && (m.$('#q_del').onclick = () => { p.quotes = p.quotes.filter(x => x.id !== q.id); HM.save(); m.close(); HM.render(); });
      },
    });
  }
  HM.actions.newQuote = el => { const p = byId(HM.state.projects, el.dataset.p); p.quotes = p.quotes || []; quoteModal(p, { id: uid('q') }, true); };
  HM.actions.editQuote = el => { const p = byId(HM.state.projects, el.dataset.p); const q = byId(p.quotes, el.dataset.q); if (q) quoteModal(p, q, false); };
})();
