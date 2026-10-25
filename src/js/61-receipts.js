/* Kvitteringer og økonomi: skann med Claude, kontroller, fordel på prosjekter, duplikater, returer. */
(function () {
  const { esc, byId, uid, nok, fmtDate, todayISO, num, daysBetween } = HM.util; const icon = HM.icon; const ui = HM.ui; const econ = HM.econ;
  const CATS = ['Materialer', 'Maling og overflate', 'Verktøy', 'Håndverker', 'Inventar og hvitevarer', 'Leie og transport', 'Vedlikehold', 'Annet'];
  HM.RECEIPT_CATS = CATS;
  const normStore = s => String(s || '').toLowerCase().replace(/[^a-zæøå0-9]/g, '').slice(0, 6);

  HM.findDuplicates = function (rec, receipts) {
    const out = [];
    for (const r of receipts) {
      if (r.id === rec.id) continue;
      if (rec.hash && r.hash && rec.hash === r.hash) { out.push({ r, strong: true, why: 'Samme bilde er registrert før' }); continue; }
      if (Math.abs(num(r.total) - num(rec.total)) < 1 && num(rec.total) > 0 && r.kind === rec.kind) {
        const near = rec.date && r.date ? Math.abs(daysBetween(r.date, rec.date)) <= 3 : true;
        const sameStore = !rec.store || !r.store || normStore(r.store) === normStore(rec.store);
        if (near && sameStore) out.push({ r, strong: false, why: `Samme beløp${r.store ? ' hos ' + r.store : ''}${r.date ? ' ' + fmtDate(r.date) : ''}` });
      }
    }
    return out;
  };

  HM.receiptRow = function (r, pid) {
    const sign = econ.sign(r); const un = econ.unallocated(r);
    const share = pid ? (r.allocations || []).filter(a => a.projectId === pid).reduce((s, a) => s + num(a.amount), 0) : null;
    return `<div class="row click" data-act="editReceipt" data-id="${r.id}">
      ${r.mediaIds && r.mediaIds[0] ? `<div class="thumb" style="width:44px;flex:none"><img data-blob="${(byId(HM.state.media, r.mediaIds[0]) || {}).blobId}" alt=""></div>` : `<div class="thumb file" style="width:44px;flex:none">${icon('receipt')}</div>`}
      <div class="grow"><div class="title">${esc(r.store || 'Ukjent butikk')}${r.kind === 'retur' ? ' <span class="pill est">Retur/refusjon</span>' : ''}</div>
      <div class="small muted">${r.date ? fmtDate(r.date) : 'Uten dato'} · ${esc(r.category || '')}${(r.uncertain || []).length ? ' · <span style="color:var(--est);font-weight:600">usikre felt</span>' : ''}${!pid && un > 0.5 ? ` · <span style="color:var(--est);font-weight:600">${nok(un)} ikke fordelt</span>` : ''}${pid && share !== num(r.total) ? ` · ${nok(share)} av ${nok(r.total)} til prosjektet` : ''}</div></div>
      <span class="num" style="font-weight:700;${sign < 0 ? 'color:var(--ok)' : ''}">${sign < 0 ? '−' : ''}${nok(pid ? share : r.total, 2)}</span></div>`;
  };

  // ---------- Økonomiside ----------
  HM.views.okonomi = function (main, params) {
    const st = HM.state; const t = econ.totals(st); const filter = params.filter || 'alle';
    const recs = st.receipts.filter(r => filter === 'ufordelt' ? econ.unallocated(r) > 0.5 : filter === 'usikre' ? (r.uncertain || []).length : true).sort((a, b) => (b.date || '') < (a.date || '') ? -1 : 1);
    const cats = {}; st.receipts.forEach(r => { cats[r.category || 'Annet'] = (cats[r.category || 'Annet'] || 0) + econ.sign(r) * num(r.total); });
    const catMax = Math.max(1, ...Object.values(cats).map(Math.abs));
    main.innerHTML = `<div class="page">
      <div class="page-head"><div><h1>Økonomi</h1><p class="muted">Budsjett, betalt, forventet gjenstående og forventet sluttsum, hver for seg.</p></div><div class="btn-row"><button class="btn" data-act="newReceiptManual">${icon('edit')} Registrer manuelt</button><button class="btn primary" data-act="scanReceipt">${icon('camera')} Skann kvittering</button></div></div>
      <div class="stat-row">
        <div class="stat"><div class="v">${nok(t.budget)}</div><div class="k">Budsjett, alle prosjekter</div></div>
        <div class="stat"><div class="v">${nok(t.paid)}</div><div class="k">Betalt (fordelt til prosjekter)</div></div>
        <div class="stat"><div class="v">${nok(t.remaining)}</div><div class="k">Forventet gjenstående</div></div>
        <div class="stat ${t.budget && t.forecast > t.budget ? 'warn' : ''}"><div class="v">${nok(t.forecast)}</div><div class="k">Forventet sluttsum</div></div>
      </div>
      ${Math.abs(t.unallocated) > 0.5 ? `<div class="notice warn">${icon('alert')}<div>${nok(t.unallocated)} på kvitteringer er ikke fordelt til noe prosjekt og er ikke med i tallene over. <a href="#" data-act="go" data-to="okonomi" data-tab="ufordelt">Vis</a></div></div>` : ''}
      <div class="card"><h2>Prosjekter</h2>${st.projects.length ? `<div class="scroll-x"><table class="t"><thead><tr><th>Prosjekt</th><th class="r">Budsjett</th><th class="r">Betalt</th><th class="r">Gjenstående</th><th class="r">Sluttsum</th><th class="r">Avvik</th></tr></thead><tbody>
        ${st.projects.map(p => { const e = econ.project(st, p); return `<tr><td><a href="#" data-act="go" data-to="prosjekt" data-id="${p.id}" data-tab="okonomi">${esc(p.name)}</a> ${HM.projectStatusPill(p.status)}</td><td class="r">${e.budget ? nok(e.budget) : '–'}</td><td class="r">${nok(e.paid)}</td><td class="r">${nok(e.remaining)}</td><td class="r"><strong>${nok(e.forecast)}</strong></td><td class="r" style="color:${e.budget ? (e.deviation < 0 ? 'var(--bad)' : 'var(--ok)') : 'inherit'}">${e.budget ? (e.deviation < 0 ? '−' : '+') + nok(Math.abs(e.deviation)) : '–'}</td></tr>`; }).join('')}
        <tr><td><strong>Sum</strong></td><td class="r"><strong>${nok(t.budget)}</strong></td><td class="r"><strong>${nok(t.paid)}</strong></td><td class="r"><strong>${nok(t.remaining)}</strong></td><td class="r"><strong>${nok(t.forecast)}</strong></td><td></td></tr></tbody></table></div>` : ui.empty('Ingen prosjekter', 'Lag et prosjekt for å følge budsjett og kostnader.')}
        <p class="tiny muted">Betalt = kvitteringer fordelt til prosjektet, minus returer. Gjenstående = planlagte innkjøp + aksepterte, ubetalte tilbud + egne anslag. Tilbud og planlagte innkjøp regnes aldri som betalt.</p></div>
      <div class="grid-2">
        <div class="card"><div class="card-head"><h2>Kvitteringer</h2><div class="seg">${[['alle', 'Alle'], ['ufordelt', 'Ikke fordelt'], ['usikre', 'Usikre']].map(([k, l]) => `<button aria-pressed="${filter === k}" data-act="go" data-to="okonomi" data-tab="${k}">${l}</button>`).join('')}</div></div>
          ${recs.length ? `<div class="list">${recs.map(r => HM.receiptRow(r)).join('')}</div>` : ui.empty('Ingen kvitteringer her', 'Skann en kvittering for å registrere en utgift.', `<button class="btn primary" data-act="scanReceipt">${icon('camera')} Skann kvittering</button>`)}</div>
        <div class="card"><h2>Per kategori</h2>${Object.keys(cats).length ? Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 10px;align-items:center"><span class="small">${esc(k)}</span><span class="num small">${nok(v)}</span><div class="bar" style="grid-column:1/-1"><i style="width:${Math.abs(v) / catMax * 100}%"></i></div></div>`).join('') : '<p class="muted small">Ingen utgifter registrert.</p>'}
          <p class="tiny muted">Alle registrerte kvitteringer: ${nok(t.allSpent)}.</p></div>
      </div>
    </div>`;
  };
  // økonomi-siden bruker tab-parameteren som filter
  const origOk = HM.views.okonomi; HM.views.okonomi = (main, params) => origOk(main, { filter: params.tab || params.filter });

  // ---------- Skann / registrer ----------
  HM.newReceiptObj = (o = {}) => Object.assign({ id: uid('kv'), mediaIds: [], hash: null, store: '', date: todayISO(), total: 0, kind: 'kjop', category: 'Materialer', lines: [], allocations: [], uncertain: [], notes: '', source: 'manuell', createdAt: new Date().toISOString() }, o);
  HM.actions.scanReceipt = el => {
    const pid = el && el.dataset.project;
    const m = HM.modal({
      title: 'Skann kvittering',
      body: `${HM.ai.statusHtml()}<label class="drop" id="rc-drop">${icon('camera')}<div><strong>Ta bilde av kvitteringen</strong><div class="small muted">eller velg et bilde eller en PDF</div></div><input type="file" id="rc-file" accept="image/*,application/pdf" hidden><span class="btn primary">${icon('camera')} Velg bilde</span></label><div id="rc-status"></div>`,
      foot: `<button class="btn" id="rc-manual">${icon('edit')} Fyll inn selv</button>`,
      onMount: mm => {
        mm.$('#rc-manual').onclick = () => { mm.close(); openReceipt(HM.newReceiptObj({ allocations: pid ? [{ projectId: pid, amount: 0 }] : [] }), true, { pid }); };
        mm.$('#rc-file').onchange = async () => {
          const f = mm.$('#rc-file').files[0]; if (!f) return;
          const status = mm.$('#rc-status');
          let img = f; let media;
          try {
            if (f.type === 'application/pdf') { const pages = await HM.ai.pdfToImages(f, 1); img = pages[0]; }
            media = await HM.addMedia(f, { kind: 'kvittering', projectId: pid || null, tags: ['kvittering'] });
          } catch (e) { status.innerHTML = `<div class="notice bad">${icon('alert')}<div>${esc(e.message)}</div></div>`; return; }
          const hash = await HM.sha256(f);
          const rec = HM.newReceiptObj({ mediaIds: [media.id], hash, allocations: pid ? [{ projectId: pid, amount: 0 }] : [] });
          if (!HM.ai.source()) { mm.close(); HM.toast('Bildetolking er ikke tilgjengelig. Fyll inn selv.'); openReceipt(rec, true, { pid }); return; }
          const ctl = new AbortController();
          status.innerHTML = `<div class="ai-box"><strong>Claude leser kvitteringen …</strong><div class="progress-line"></div><div><button class="btn sm" id="rc-stop">Stopp</button></div></div>`;
          mm.$('#rc-stop').onclick = () => ctl.abort();
          try {
            const projects = HM.state.projects.filter(p => p.status !== 'ferdig').map(p => ({ id: p.id, name: p.name, rooms: (p.roomIds || []).map(HM.roomName) }));
            const res = await HM.ai.askJson(HM.ai.receiptPrompt(projects, CATS), [img], { signal: ctl.signal, tier: 'default' });
            Object.assign(rec, {
              store: res.store || '', date: /^\d{4}-\d{2}-\d{2}$/.test(res.date || '') ? res.date : todayISO(), total: Math.abs(num(res.total)),
              kind: res.is_return ? 'retur' : 'kjop', category: CATS.includes(res.category) ? res.category : 'Annet',
              lines: (res.lines || []).filter(l => l && l.text).map(l => ({ text: String(l.text), qty: num(l.qty) || 1, amount: num(l.amount), projectId: null })),
              uncertain: Array.isArray(res.uncertain_fields) ? res.uncertain_fields : [], notes: res.notes || '', source: 'ai',
            });
            if (!res.date) rec.uncertain.push('date');
            const sugg = res.project_id && byId(HM.state.projects, res.project_id) ? res.project_id : null;
            if (pid) rec.allocations = [{ projectId: pid, amount: rec.total }];
            else if (sugg) { rec.allocations = [{ projectId: sugg, amount: rec.total }]; rec.suggestedProject = sugg; if (!rec.uncertain.includes('project_id')) rec.uncertain.push('project_id'); }
            mm.close(); openReceipt(rec, true, { pid });
          } catch (e) {
            status.innerHTML = `<div class="notice bad">${icon('alert')}<div>${esc(HM.ai.errorText(e))}</div></div><button class="btn" id="rc-man2">Fyll inn selv</button>`;
            mm.$('#rc-man2').onclick = () => { mm.close(); openReceipt(rec, true, { pid }); };
          }
        };
      },
    });
  };
  HM.actions.newReceiptManual = () => openReceipt(HM.newReceiptObj(), true, {});
  HM.actions.editReceipt = el => { const r = byId(HM.state.receipts, el.dataset.id); if (r) openReceipt(JSON.parse(JSON.stringify(r)), false, {}); };
  HM.openReceipt = (rec, isNew, opts) => openReceipt(rec, isNew, opts || {});

  function openReceipt(rec, isNew, opts) {
    const projects = HM.state.projects;
    const unc = f => (rec.uncertain || []).includes(f) ? 'uncertain' : '';
    const uh = f => (rec.uncertain || []).includes(f) ? 'Usikker – sjekk' : '';
    const media = (rec.mediaIds || []).map(id => byId(HM.state.media, id)).filter(Boolean);
    const body = () => `
      ${rec.source === 'ai' ? `<div class="notice info">${icon('sparkle')}<div>Forslag fra Claude. Kontroller feltene før du lagrer. Gule felt er usikre.${rec.notes ? ' ' + esc(rec.notes) : ''}</div></div>` : ''}
      <div id="rc-dup"></div>
      <div style="display:grid;grid-template-columns:${media.length ? 'minmax(0,1fr) minmax(0,1.6fr)' : '1fr'};gap:14px" class="rc-grid">
        ${media.length ? `<div><a href="#" data-blob-href="${media[0].blobId}" target="_blank" rel="noopener"><img data-blob="${media[0].blobId}" alt="Kvittering" style="width:100%;border-radius:8px;border:1px solid var(--line)"></a></div>` : ''}
        <div style="display:flex;flex-direction:column;gap:10px;min-width:0">
          <div class="form-grid">
            ${ui.field('Butikk', ui.input('rc_store', rec.store), unc('store'), uh('store'))}
            ${ui.field('Kjøpsdato', `<input type="date" id="rc_date" name="rc_date" value="${rec.date || ''}">`, unc('date'), uh('date'))}
            ${ui.field('Totalbeløp (kr)', ui.input('rc_total', rec.total || '', 'inputmode="decimal"'), unc('total'), uh('total'))}
            ${ui.field('Type', ui.select('rc_kind', [['kjop', 'Kjøp'], ['retur', 'Retur / refusjon']], rec.kind))}
            ${ui.field('Kategori', ui.select('rc_cat', CATS, rec.category), unc('category'), uh('category'))}
          </div>
          <div class="field ${unc('project_id')}"><span>Fordeling på prosjekter</span>${rec.suggestedProject ? '<span class="hint">Prosjektet er foreslått av Claude – sjekk</span>' : ''}
            <div id="rc-alloc" style="display:flex;flex-direction:column;gap:6px">${(rec.allocations || []).map((a, i) => `<div class="split-alloc"><select class="input" data-ap="${i}">${[['', 'Velg prosjekt …'], ...projects.map(p => [p.id, p.name])].map(([v, l]) => `<option value="${v}" ${v === a.projectId ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select><input class="input" data-aa="${i}" value="${a.amount || ''}" inputmode="decimal" placeholder="kr"><button class="btn icon ghost sm" data-ax="${i}" aria-label="Fjern">${icon('x')}</button></div>`).join('')}</div>
            <div class="btn-row"><button class="btn sm" id="rc-addalloc">${icon('plus')} Legg til prosjekt</button><button class="btn sm ghost" id="rc-rest">Fordel resten</button>${rec.lines.some(l => l.projectId) ? '<button class="btn sm ghost" id="rc-fromlines">Fra varelinjer</button>' : ''}</div>
            <span class="hint" id="rc-un"></span></div>
        </div>
      </div>
      <details ${rec.lines.length ? 'open' : ''}><summary>Varelinjer (${rec.lines.length})</summary>
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px" class="${unc('lines')}">${rec.lines.map((l, i) => `<div style="display:grid;grid-template-columns:minmax(0,1fr) 54px 96px minmax(0,130px) auto;gap:6px;align-items:center"><input class="input" data-lt="${i}" value="${esc(l.text)}"><input class="input" data-lq="${i}" value="${l.qty ?? 1}" inputmode="decimal" aria-label="Antall"><input class="input" data-la="${i}" value="${l.amount ?? ''}" inputmode="decimal" aria-label="Beløp"><select class="input" data-lp="${i}" aria-label="Prosjekt"><option value="">Prosjekt …</option>${projects.map(p => `<option value="${p.id}" ${p.id === l.projectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select><button class="btn icon ghost sm" data-lx="${i}" aria-label="Fjern">${icon('x')}</button></div>`).join('')}
          <div><button class="btn sm" id="rc-addline">${icon('plus')} Varelinje</button></div>${(rec.uncertain || []).includes('lines') ? '<span class="hint" style="color:var(--est);font-weight:600">Varelinjene er usikre – sjekk</span>' : ''}</div></details>
      ${ui.field('Notat', `<textarea id="rc_notes" name="rc_notes">${esc(rec.source === 'ai' ? (rec.userNotes || '') : (rec.notes || ''))}</textarea>`)}
      <label class="field"><span>Legg til bilde eller PDF</span><input type="file" id="rc-more" accept="image/*,application/pdf"></label>`;
    const m = HM.modal({
      title: isNew ? 'Kontroller kvitteringen' : 'Kvittering', wide: true, body: body(),
      foot: `${isNew ? '' : `<button class="btn danger" id="rc-del">${icon('trash')} Slett</button>`}<button class="btn" data-close>Avbryt</button><button class="btn primary" id="rc-save">Lagre</button>`,
      onMount: mm => bind(mm),
    });
    const style = document.createElement('style'); style.textContent = '@media (max-width:640px){.rc-grid{grid-template-columns:1fr!important}}'; m.el.appendChild(style);
    function sync(mm) {
      const v = HM.formValues(mm.el);
      rec.store = v.rc_store.trim(); rec.date = v.rc_date || null; rec.total = Math.abs(num(v.rc_total)); rec.kind = v.rc_kind; rec.category = v.rc_cat;
      if (rec.source === 'ai') rec.userNotes = v.rc_notes; else rec.notes = v.rc_notes;
      mm.$$('[data-ap]').forEach(s => rec.allocations[+s.dataset.ap].projectId = s.value);
      mm.$$('[data-aa]').forEach(s => rec.allocations[+s.dataset.aa].amount = num(s.value));
      mm.$$('[data-lt]').forEach(s => rec.lines[+s.dataset.lt].text = s.value);
      mm.$$('[data-lq]').forEach(s => rec.lines[+s.dataset.lq].qty = num(s.value));
      mm.$$('[data-la]').forEach(s => rec.lines[+s.dataset.la].amount = num(s.value));
      mm.$$('[data-lp]').forEach(s => rec.lines[+s.dataset.lp].projectId = s.value || null);
    }
    function redraw(mm) { sync(mm); mm.$('.sheet-body').innerHTML = body(); HM.hydrateBlobs(mm.el); bind(mm); }
    function bind(mm) {
      const upd = () => {
        sync(mm);
        const un = econ.unallocated(rec); const el = mm.$('#rc-un');
        el.textContent = rec.total ? (Math.abs(un) < 0.01 ? 'Hele beløpet er fordelt.' : un > 0 ? `${nok(un, 2)} er ikke fordelt til noe prosjekt.` : `Fordelingen er ${nok(-un, 2)} høyere enn totalbeløpet.`) : '';
        el.style.color = un < -0.01 ? 'var(--bad)' : '';
        const dups = HM.findDuplicates(rec, HM.state.receipts);
        mm.$('#rc-dup').innerHTML = dups.length ? `<div class="notice ${dups.some(d => d.strong) ? 'bad' : 'warn'}">${icon('copy')}<div><strong>Mulig duplikat.</strong> ${dups.map(d => esc(d.why)).join('; ')}. Sjekk at kvitteringen ikke er registrert fra før.</div></div>` : '';
      };
      mm.el.querySelectorAll('input, select, textarea').forEach(i => i.addEventListener('input', upd));
      upd();
      // fjern usikker-markering når feltet endres
      const clear = (id, f) => { const x = mm.$('#' + id); x && x.addEventListener('change', () => { rec.uncertain = (rec.uncertain || []).filter(u => u !== f); x.closest('.field')?.classList.remove('uncertain'); const h = x.closest('.field')?.querySelector('.hint'); if (h) h.textContent = ''; }); };
      clear('rc_store', 'store'); clear('rc_date', 'date'); clear('rc_total', 'total'); clear('rc_cat', 'category');
      mm.$$('[data-ap]').forEach(s => s.addEventListener('change', () => { rec.uncertain = (rec.uncertain || []).filter(u => u !== 'project_id'); rec.suggestedProject = null; }));
      mm.$('#rc-addalloc').onclick = () => { sync(mm); rec.allocations.push({ projectId: '', amount: Math.max(0, econ.unallocated(rec)) }); redraw(mm); };
      mm.$('#rc-rest').onclick = () => { sync(mm); const un = econ.unallocated(rec); if (un <= 0) return; const last = rec.allocations[rec.allocations.length - 1]; if (last) last.amount = num(last.amount) + un; else rec.allocations.push({ projectId: '', amount: un }); redraw(mm); };
      mm.$('#rc-fromlines') && (mm.$('#rc-fromlines').onclick = () => { sync(mm); const sums = {}; rec.lines.forEach(l => { if (l.projectId) sums[l.projectId] = (sums[l.projectId] || 0) + num(l.amount); }); rec.allocations = Object.entries(sums).map(([projectId, amount]) => ({ projectId, amount: Math.round(amount * 100) / 100 })); redraw(mm); });
      mm.$$('[data-ax]').forEach(b => b.onclick = () => { sync(mm); rec.allocations.splice(+b.dataset.ax, 1); redraw(mm); });
      mm.$('#rc-addline').onclick = () => { sync(mm); rec.lines.push({ text: '', qty: 1, amount: 0, projectId: null }); redraw(mm); };
      mm.$$('[data-lx]').forEach(b => b.onclick = () => { sync(mm); rec.lines.splice(+b.dataset.lx, 1); redraw(mm); });
      mm.$('#rc-more').onchange = async () => { const f = mm.$('#rc-more').files[0]; if (!f) return; sync(mm); const md = await HM.addMedia(f, { kind: 'kvittering', tags: ['kvittering'] }); rec.mediaIds.push(md.id); if (!rec.hash) rec.hash = await HM.sha256(f); HM.toast('Vedlegg lagt til'); };
      mm.$('#rc-save').onclick = () => {
        sync(mm);
        if (!(rec.total > 0)) { HM.toast('Skriv inn totalbeløpet'); return; }
        rec.allocations = rec.allocations.filter(a => a.projectId && num(a.amount) > 0);
        if (econ.unallocated(rec) < -0.01) { HM.toast('Fordelingen er høyere enn totalbeløpet. Rett beløpene.'); return; }
        if (rec.source === 'ai' && rec.userNotes) rec.notes = (rec.notes ? rec.notes + '\n' : '') + rec.userNotes;
        delete rec.userNotes; delete rec.suggestedProject;
        const i = HM.state.receipts.findIndex(x => x.id === rec.id);
        if (i >= 0) HM.state.receipts[i] = rec; else HM.state.receipts.push(rec);
        // knytt bildet til prosjektet
        (rec.mediaIds || []).forEach(id => { const md = byId(HM.state.media, id); if (md && !md.projectId && rec.allocations[0]) md.projectId = rec.allocations[0].projectId; });
        if (opts.onSaved) opts.onSaved(rec);
        HM.save(); mm.close(); HM.toast('Kvitteringen er lagret'); HM.render();
      };
      mm.$('#rc-del') && (mm.$('#rc-del').onclick = async () => { if (!(await HM.confirm('Slette kvitteringen?', 'Utgiften fjernes fra prosjektene.', 'Slett'))) return; HM.state.receipts = HM.state.receipts.filter(x => x.id !== rec.id); HM.save(); mm.close(); HM.render(); });
    }
  }
})();
