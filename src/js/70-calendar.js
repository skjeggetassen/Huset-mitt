/* Kalender med måned-, uke- og listevisning. Hendelser, oppgaver fra prosjekter og vedlikehold. Påminnelser vises i appen. */
(function () {
  const { esc, byId, uid, fmtDate, fmtDay, todayISO, addDays, addMonths, daysBetween, parseISO, isoOf, relDays } = HM.util; const icon = HM.icon; const ui = HM.ui;
  const TYPES = [['arbeidsokt', 'Arbeidsøkt'], ['frist', 'Frist'], ['leveranse', 'Leveranse'], ['avtale', 'Avtale med håndverker'], ['vedlikehold', 'Vedlikehold'], ['annet', 'Annet']];
  const REMIND = [['', 'Ingen påminnelse'], ['60', '1 time før'], ['1440', '1 dag før'], ['4320', '3 dager før'], ['10080', '1 uke før']];
  const REPEAT = [['none', 'Gjentas ikke'], ['weekly', 'Hver uke'], ['monthly', 'Hver måned'], ['quarterly', 'Hver 3. måned'], ['halfyear', 'Hvert halvår'], ['yearly', 'Hvert år']];
  const typeName = t => (TYPES.find(x => x[0] === t) || TYPES[5])[1];
  HM.EVENT_TYPES = TYPES;

  function occurrences(ev, from, to) {
    const out = []; if (!ev.date) return out;
    const r = ev.repeat || 'none';
    if (r === 'none') { if (ev.date >= from && ev.date <= to) out.push(ev.date); return out; }
    let d = ev.date; let n = 0;
    const step = x => r === 'weekly' ? addDays(x, 7) : r === 'monthly' ? addMonths(ev.date, ++n) : r === 'quarterly' ? addMonths(ev.date, (++n) * 3) : r === 'halfyear' ? addMonths(ev.date, (++n) * 6) : addMonths(ev.date, (++n) * 12);
    let guard = 0;
    while (d <= to && guard++ < 800) { if (d >= from && (!ev.until || d <= ev.until)) out.push(d); d = step(d); }
    return out;
  }
  /** Alle elementer i perioden, sortert. */
  HM.calItems = function (from, to) {
    const st = HM.state; const items = []; const today = todayISO();
    for (const ev of st.events) for (const d of occurrences(ev, from, to)) {
      const done = ev.repeat && ev.repeat !== 'none' ? (ev.doneDates || []).includes(d) : !!ev.done;
      items.push({ key: ev.id + '@' + d, kind: 'event', id: ev.id, title: ev.title, date: d, time: ev.time || '', type: ev.type, done, late: !done && d < today && ['frist', 'leveranse', 'arbeidsokt', 'vedlikehold'].includes(ev.type), projectId: ev.projectId, ev });
    }
    for (const p of st.projects) for (const t of p.tasks) {
      const d = t.end || t.start; if (!d) continue;
      const show = t.start && t.start >= from && t.start <= to ? t.start : (d >= from && d <= to ? d : null);
      if (!show) continue;
      items.push({ key: t.id, kind: 'task', id: t.id, projectId: p.id, title: t.title, date: show, end: t.end, type: 'oppgave', done: t.done, late: HM.taskLate(t), sub: p.name });
    }
    for (const m of st.maintenance) { const d = HM.maintNext(m); if (d && d >= from && d <= to) items.push({ key: m.id, kind: 'maint', id: m.id, title: m.title, date: d, type: 'vedlikehold', done: false, late: d < today }); }
    return items.sort((a, b) => (a.date + (a.time || '99')) < (b.date + (b.time || '99')) ? -1 : 1);
  };
  /** Påminnelser som er aktive nå. */
  HM.dueReminders = function () {
    const now = new Date(); const today = todayISO(); const out = [];
    for (const ev of HM.state.events) {
      if (!ev.remind) continue;
      for (const d of occurrences(ev, addDays(today, -1), addDays(today, 8))) {
        const done = ev.repeat && ev.repeat !== 'none' ? (ev.doneDates || []).includes(d) : ev.done; if (done) continue;
        const at = new Date(d + 'T' + (ev.time || '08:00')); const from = new Date(at.getTime() - Number(ev.remind) * 60000);
        if (now >= from && now <= new Date(at.getTime() + 12 * 3600000)) out.push({ title: ev.title, date: d, time: ev.time, kind: 'event', id: ev.id });
      }
    }
    for (const p of HM.state.projects) for (const t of p.tasks) {
      if (t.done || t.remindDays == null || !(t.start || t.end)) continue; const d = t.start || t.end;
      const n = daysBetween(today, d); if (n >= 0 && n <= t.remindDays) out.push({ title: t.title, date: d, kind: 'task', id: t.id, projectId: p.id });
    }
    for (const m of HM.state.maintenance) { const d = HM.maintNext(m); if (!d) continue; const n = daysBetween(today, d); if (n <= (m.remindDays ?? 14) && n >= -60) out.push({ title: m.title, date: d, kind: 'maint', id: m.id }); }
    return out.sort((a, b) => a.date < b.date ? -1 : 1);
  };

  const cal = { view: (() => { try { return localStorage.getItem('hm-cal-view') || 'month'; } catch (e) { return 'month'; } })(), anchor: todayISO() };
  HM.views.kalender = function (main) {
    const today = todayISO();
    let from, to, title;
    const a = parseISO(cal.anchor);
    if (cal.view === 'month') { const f = new Date(a.getFullYear(), a.getMonth(), 1); const l = new Date(a.getFullYear(), a.getMonth() + 1, 0); const fs = new Date(f); fs.setDate(f.getDate() - ((f.getDay() + 6) % 7)); const le = new Date(l); le.setDate(l.getDate() + (6 - (l.getDay() + 6) % 7)); from = isoOf(fs); to = isoOf(le); title = f.toLocaleDateString('nb-NO', { month: 'long', year: 'numeric' }); }
    else if (cal.view === 'week') { const s = new Date(a); s.setDate(a.getDate() - ((a.getDay() + 6) % 7)); from = isoOf(s); to = addDays(from, 6); title = `Uke ${weekNo(s)} · ${fmtDate(from, { day: 'numeric', month: 'short' })} – ${fmtDate(to, { day: 'numeric', month: 'short' })}`; }
    else { from = addDays(today, -365); to = addDays(today, 90); title = 'Kommende og forsinket'; }
    const items = HM.calItems(from, to);
    const chip = it => `<button class="ev t-${it.type} ${it.late ? 'late' : ''} ${it.done ? 'done' : ''}" data-ci="${it.kind}:${it.id}:${it.date}:${it.projectId || ''}" title="${esc(it.title)}">${it.time ? it.time + ' ' : ''}${esc(it.title)}</button>`;
    let body = '';
    if (cal.view === 'month') {
      const days = []; for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
      const m = a.getMonth();
      body = `<div class="cal">${['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'].map(d => `<div class="cal-h">${d}</div>`).join('')}${days.map(d => { const its = items.filter(i => i.date === d); return `<div class="${parseISO(d).getMonth() !== m ? 'out' : ''} ${d === today ? 'today' : ''}" data-day="${d}"><span class="dnum">${parseISO(d).getDate()}</span>${its.slice(0, 4).map(chip).join('')}${its.length > 4 ? `<span class="tiny muted">+${its.length - 4}</span>` : ''}</div>`; }).join('')}</div>`;
    } else if (cal.view === 'week') {
      const days = []; for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
      body = `<div class="week">${days.map(d => { const its = items.filter(i => i.date === d); return `<div class="${d === today ? 'today' : ''}" data-day="${d}"><div class="small" style="font-weight:700">${fmtDay(d)}</div>${its.map(chip).join('') || '<span class="tiny muted">–</span>'}</div>`; }).join('')}</div>`;
    } else {
      const late = items.filter(i => i.late && !i.done); const up = items.filter(i => i.date >= today && !i.done);
      const row = it => `<div class="row click" data-ci="${it.kind}:${it.id}:${it.date}:${it.projectId || ''}"><div style="width:74px;flex:none" class="small"><strong>${fmtDate(it.date, { day: 'numeric', month: 'short' })}</strong><div class="tiny muted">${it.time || relDays(it.date)}</div></div><div class="grow"><div class="title">${esc(it.title)}</div><div class="small muted">${it.kind === 'task' ? 'Oppgave · ' + esc(it.sub) : typeName(it.type)}</div></div>${it.late ? '<span class="pill bad">Forsinket</span>' : ''}</div>`;
      body = `${late.length ? `<div class="card"><h2 style="color:var(--bad)">Forsinket (${late.length})</h2><div class="list">${late.map(row).join('')}</div></div>` : ''}<div class="card"><h2>Kommende</h2>${up.length ? `<div class="list">${up.map(row).join('')}</div>` : ui.empty('Ingenting planlagt', 'Legg inn arbeidsøkter, frister, leveranser og avtaler.')}</div>`;
    }
    main.innerHTML = `<div class="page">
      <div class="page-head"><div><h1>Kalender</h1><p class="muted">Arbeidsøkter, frister, leveranser, avtaler og vedlikehold. Påminnelser vises her i appen.</p></div><div class="btn-row"><button class="btn" data-act="newTask">${icon('check')} Ny oppgave</button><button class="btn primary" data-act="newEvent">${icon('plus')} Ny hendelse</button></div></div>
      <div class="card-head"><div class="seg">${[['month', 'Måned'], ['week', 'Uke'], ['list', 'Liste']].map(([k, l]) => `<button aria-pressed="${cal.view === k}" data-calview="${k}">${l}</button>`).join('')}</div>
        ${cal.view !== 'list' ? `<div class="btn-row"><button class="btn icon" data-calnav="-1" aria-label="Forrige">${icon('back')}</button><strong style="min-width:150px;text-align:center;text-transform:capitalize">${title}</strong><button class="btn icon" data-calnav="1" aria-label="Neste">${icon('chevron')}</button><button class="btn sm ghost" data-calnav="0">I dag</button></div>` : ''}</div>
      ${body}
      <div class="legend" style="align-self:flex-start"><span><i style="background:var(--accent-soft)"></i>Arbeidsøkt</span><span><i style="background:var(--src-soft)"></i>Oppgave/frist</span><span><i style="background:var(--ok-soft)"></i>Avtale</span><span><i style="background:var(--est-soft)"></i>Vedlikehold</span><span><i style="background:var(--bad-soft)"></i>Forsinket</span></div>
    </div>`;
    main.querySelectorAll('[data-calview]').forEach(b => b.onclick = () => { cal.view = b.dataset.calview; try { localStorage.setItem('hm-cal-view', cal.view); } catch (e) {} HM.render(); });
    main.querySelectorAll('[data-calnav]').forEach(b => b.onclick = () => { const n = +b.dataset.calnav; cal.anchor = n === 0 ? todayISO() : cal.view === 'month' ? addMonths(cal.anchor, n) : addDays(cal.anchor, 7 * n); HM.render(); });
    main.querySelectorAll('[data-ci]').forEach(b => b.onclick = e => { e.stopPropagation(); const [kind, id, date, pid] = b.dataset.ci.split(':'); openItem(kind, id, date, pid); });
    main.querySelectorAll('[data-day]').forEach(d => d.addEventListener('click', e => { if (e.target.closest('[data-ci]')) return; HM.actions.newEvent(null, d.dataset.day); }));
  };
  function weekNo(d) { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y) / 86400000 + 1) / 7); }
  function openItem(kind, id, date, pid) {
    if (kind === 'task') { HM.actions.editTask({ dataset: { p: pid, t: id } }); return; }
    if (kind === 'maint') { HM.go('vedlikehold'); return; }
    const ev = byId(HM.state.events, id); if (ev) eventModal(ev, false, date);
  }
  HM.openCalItem = openItem;

  function eventModal(ev, isNew, occDate) {
    const projs = HM.state.projects;
    const rec = ev.repeat && ev.repeat !== 'none';
    const occDone = rec ? (ev.doneDates || []).includes(occDate) : ev.done;
    HM.modal({
      title: isNew ? 'Ny hendelse' : ev.title,
      body: `<div class="form-grid">
        ${ui.field('Tittel', ui.input('e_title', ev.title, 'placeholder="F.eks. Elektriker kommer"'), 'wide')}
        ${ui.field('Type', ui.select('e_type', TYPES, ev.type))}
        ${ui.field('Dato', `<input type="date" name="e_date" value="${ev.date || ''}">`)}
        ${ui.field('Klokkeslett', `<input type="time" name="e_time" value="${ev.time || ''}">`)}
        ${ui.field('Til', `<input type="time" name="e_end" value="${ev.endTime || ''}">`)}
        ${ui.field('Gjentas', ui.select('e_repeat', REPEAT, ev.repeat || 'none'))}
        ${ui.field('Påminnelse', ui.select('e_remind', REMIND, ev.remind || ''))}
        ${ui.field('Prosjekt', ui.select('e_project', [['', 'Ingen'], ...projs.map(p => [p.id, p.name])], ev.projectId || ''), 'wide')}
        ${ui.field('Kontakt / sted', ui.input('e_contact', ev.contact || '', 'placeholder="F.eks. navn og telefonnummer"'), 'wide')}
        ${ui.field('Notat', `<textarea name="e_notes">${esc(ev.notes || '')}</textarea>`, 'wide')}
      </div>
      ${!isNew ? `<label class="check"><input type="checkbox" id="e_done" ${occDone ? 'checked' : ''}> ${rec ? `Fullført ${fmtDate(occDate)}` : 'Fullført'}</label>` : ''}`,
      foot: `${isNew ? '' : `<button class="btn danger" id="e_del">${icon('trash')} Slett</button>`}<button class="btn" data-close>Avbryt</button><button class="btn primary" id="e_ok">Lagre</button>`,
      onMount: m => {
        m.$('#e_ok').onclick = () => {
          const v = HM.formValues(m.el);
          if (!v.e_title.trim() || !v.e_date) { HM.toast('Fyll inn tittel og dato'); return; }
          Object.assign(ev, { title: v.e_title.trim(), type: v.e_type, date: v.e_date, time: v.e_time, endTime: v.e_end, repeat: v.e_repeat, remind: v.e_remind ? Number(v.e_remind) : null, projectId: v.e_project || null, contact: v.e_contact, notes: v.e_notes });
          if (!isNew) { const dn = m.$('#e_done').checked; if (ev.repeat && ev.repeat !== 'none') { ev.doneDates = (ev.doneDates || []).filter(d => d !== occDate); if (dn) ev.doneDates.push(occDate); } else ev.done = dn; }
          if (isNew) HM.state.events.push(ev);
          HM.save(); m.close(); HM.render();
        };
        m.$('#e_del') && (m.$('#e_del').onclick = async () => { if (!(await HM.confirm('Slette hendelsen?', esc(ev.title) + (rec ? ' (alle gjentakelser)' : ''), 'Slett'))) return; HM.state.events = HM.state.events.filter(x => x.id !== ev.id); HM.save(); HM.render(); });
      },
    });
  }
  HM.actions.newEvent = (el, date) => eventModal({ id: uid('ev'), title: '', type: 'arbeidsokt', date: typeof date === 'string' ? date : todayISO(), time: '', repeat: 'none', remind: null, projectId: el && el.dataset && el.dataset.project || null, done: false, doneDates: [] }, true);
  HM.eventModal = eventModal;
})();
