/* Husets dokumentasjon (søkbart arkiv), vedlikeholdsplan og tidslinje. */
(function () {
  const { esc, byId, uid, nok, num, fmtDate, todayISO, addMonths, daysBetween, relDays } = HM.util; const icon = HM.icon; const ui = HM.ui; const G = HM.geo;
  const CATS = ['Maling', 'Gulv', 'Panel og kledning', 'Taktekking', 'Vindu', 'Dør', 'Produkt', 'Bruksanvisning', 'Garanti', 'Faktura', 'Skjult installasjon', 'Kontakt', 'Annet'];
  const FIELDS = {
    Maling: ['brand', 'colorCode', 'paintType', 'gloss', 'date'],
    Gulv: ['product', 'brand', 'dims', 'date', 'supplier'], 'Panel og kledning': ['product', 'brand', 'dims', 'date', 'supplier'], Taktekking: ['product', 'brand', 'date', 'supplier', 'warrantyUntil'],
    Vindu: ['brand', 'model', 'dims', 'serial', 'date', 'warrantyUntil'], Dør: ['brand', 'model', 'dims', 'serial', 'date', 'warrantyUntil'],
    Produkt: ['product', 'brand', 'model', 'serial', 'date', 'warrantyUntil', 'supplier'],
    Bruksanvisning: ['product', 'brand', 'model'], Garanti: ['product', 'brand', 'serial', 'date', 'warrantyUntil', 'supplier'], Faktura: ['product', 'supplier', 'date'],
    'Skjult installasjon': ['product', 'date'], Kontakt: ['contactName', 'company', 'role', 'phone', 'email'], Annet: ['product', 'brand', 'date'],
  };
  const LABELS = { product: 'Produkt / materiale', brand: 'Produsent / merke', model: 'Modell', serial: 'Serienummer', colorCode: 'Fargekode', paintType: 'Malingstype', gloss: 'Glans', date: 'Dato (malt / montert / kjøpt)', dims: 'Mål', warrantyUntil: 'Garanti til', supplier: 'Leverandør / butikk', contactName: 'Navn', company: 'Firma', role: 'Fag (f.eks. elektriker)', phone: 'Telefon', email: 'E-post' };
  HM.DOC_CATS = CATS;

  function elementLabel(ref) {
    if (!ref) return '';
    for (const v of HM.state.versions) {
      const p = v.plan;
      if (ref.kind === 'wall') { const w = byId(p.walls, ref.id); if (w) { const rs = G.roomsOfWall(p, w).map(r => r.name); return 'Vegg' + (rs.length ? ' i ' + rs.join(' / ') : ''); } }
      if (ref.kind === 'opening') { const o = byId(p.openings, ref.id); if (o) { const w = byId(p.walls, o.wallId); const rs = w ? G.roomsOfWall(p, w).map(r => r.name) : []; return G.typeName(o.type) + (rs.length ? ' i ' + rs.join(' / ') : '') + ` (${HM.util.fmtLen(o.width)})`; } }
    }
    return 'Element som ikke finnes lenger';
  }
  HM.docRow = d => `<div class="row click" data-act="editDoc" data-id="${d.id}"><div class="grow"><div class="title">${esc(d.title)}</div><div class="small muted">${esc(d.category)}${d.colorCode ? ' · ' + esc(d.colorCode) : ''}${d.product ? ' · ' + esc(d.product) : ''}${d.date ? ' · ' + fmtDate(d.date) : ''}${d.roomId ? ' · ' + esc(HM.roomName(d.roomId)) : ''}${d.elementRef ? ' · ' + esc(elementLabel(d.elementRef)) : ''}</div></div>${(d.mediaIds || []).length ? `<span class="pill">${d.mediaIds.length} fil${d.mediaIds.length > 1 ? 'er' : ''}</span>` : ''}${d.warrantyUntil && d.warrantyUntil >= todayISO() ? '<span class="pill ok">Garanti</span>' : ''}</div>`;

  const dq = { q: '', cat: '' };
  HM.views.dokumentasjon = function (main, params) {
    const st = HM.state; const el = params.elementId ? { kind: params.elementKind, id: params.elementId } : null;
    const q = dq.q.trim().toLowerCase();
    const list = st.docs.filter(d => {
      if (el && !(d.elementRef && d.elementRef.id === el.id)) return false;
      if (dq.cat && d.category !== dq.cat) return false;
      if (!q) return true;
      const hay = [d.title, d.category, d.notes, d.roomId ? HM.roomName(d.roomId) : '', ...Object.keys(LABELS).map(k => d[k])].join(' ').toLowerCase();
      return q.split(/\s+/).every(w => hay.includes(w));
    }).sort((a, b) => (b.date || b.createdAt || '') < (a.date || a.createdAt || '') ? -1 : 1);
    main.innerHTML = `<div class="page">
      <div class="page-head"><div><h1>Husets dokumentasjon</h1><p class="muted">Fargekoder, materialer, produkter, garantier, bruksanvisninger, skjulte installasjoner og kontakter.</p></div><button class="btn primary" data-act="newDoc" ${el ? `data-ekind="${el.kind}" data-eid="${el.id}"` : ''}>${icon('plus')} Ny</button></div>
      ${el ? `<div class="notice info">${icon('info')}<div>Viser dokumentasjon for <strong>${esc(elementLabel(el))}</strong>. <a href="#" data-act="go" data-to="dokumentasjon">Vis alt</a></div></div>` : ''}
      <div class="card" style="gap:10px"><div style="position:relative"><input class="input" id="dq" placeholder="Søk, f.eks. «NCS S 0502» eller «oppvaskmaskin»" value="${esc(dq.q)}" style="padding-left:36px"><span style="position:absolute;left:10px;top:9px;color:var(--muted);width:18px;height:18px">${icon('search')}</span></div>
        <div class="btn-row"><button class="btn sm ${!dq.cat ? 'primary' : 'ghost'}" data-dcat="">Alle</button>${CATS.filter(c => st.docs.some(d => d.category === c)).map(c => `<button class="btn sm ${dq.cat === c ? 'primary' : 'ghost'}" data-dcat="${c}">${c}</button>`).join('')}</div>
        <div id="dlist">${list.length ? `<div class="list">${list.map(HM.docRow).join('')}</div>` : ui.empty(st.docs.length ? 'Ingen treff' : 'Arkivet er tomt', 'Lagre fargekoder, produktark, garantier og bilder av skjulte installasjoner før vegger og gulv lukkes. Du kan også trykke på et rom, en dør eller et vindu i modellen og legge til dokumentasjon der.')}</div></div>
    </div>`;
    const inp = main.querySelector('#dq');
    inp.oninput = () => { dq.q = inp.value; const pos = inp.selectionStart; HM.render(); const n = document.querySelector('#dq'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };
    main.querySelectorAll('[data-dcat]').forEach(b => b.onclick = () => { dq.cat = b.dataset.dcat; HM.render(); });
  };
  HM.actions.docsFor = el => HM.go('dokumentasjon', { elementKind: el.dataset.kind, elementId: el.dataset.id });

  function docModal(d, isNew) {
    let cat = d.category;
    const rooms = HM.allRooms();
    const fieldsHtml = () => (FIELDS[cat] || FIELDS.Annet).map(k => ui.field(LABELS[k], k === 'date' || k === 'warrantyUntil' ? `<input type="date" name="d_${k}" value="${d[k] || ''}">` : ui.input('d_' + k, d[k] || '', k === 'email' ? 'type="email"' : k === 'phone' ? 'type="tel"' : ''))).join('');
    const media = () => (d.mediaIds || []).map(id => byId(HM.state.media, id)).filter(Boolean);
    HM.modal({
      title: isNew ? 'Ny dokumentasjon' : d.title,
      body: `<div class="form-grid">
        ${ui.field('Tittel', ui.input('d_title', d.title, 'placeholder="F.eks. Veggfarge stue"'), 'wide')}
        ${ui.field('Kategori', ui.select('d_cat', CATS, cat))}
        ${ui.field('Rom', ui.select('d_room', [['', 'Ingen / hele huset'], ...rooms.map(r => [r.id, r.name])], d.roomId || ''))}
      </div>
      ${d.elementRef ? `<div class="notice info">${icon('link')}<div>Knyttet til ${esc(elementLabel(d.elementRef))}. <button class="btn sm ghost" id="d_unlink">Fjern kobling</button></div></div>` : ''}
      <div class="form-grid" id="d_fields">${fieldsHtml()}</div>
      ${ui.field('Notat', `<textarea name="d_notes" placeholder="F.eks. hvor installasjonen ligger, avstand fra hjørne">${esc(d.notes || '')}</textarea>`)}
      <div class="field"><span>Bilder og filer</span><div class="thumbs" id="d_media">${media().map(m => HM.mediaThumb(m)).join('')}</div><input type="file" id="d_file" multiple></div>`,
      foot: `${isNew ? '' : `<button class="btn danger" id="d_del">${icon('trash')} Slett</button>`}<button class="btn" data-close>Avbryt</button><button class="btn primary" id="d_ok">Lagre</button>`,
      onMount: m => {
        m.$('select[name="d_cat"]').onchange = e => { const v = HM.formValues(m.el); Object.keys(LABELS).forEach(k => { if (v['d_' + k] !== undefined) d[k] = v['d_' + k]; }); cat = e.target.value; m.$('#d_fields').innerHTML = fieldsHtml(); };
        m.$('#d_unlink') && (m.$('#d_unlink').onclick = () => { d.elementRef = null; m.$('#d_unlink').closest('.notice').remove(); });
        m.$('#d_file').onchange = async () => { for (const f of m.$('#d_file').files) { const md = await HM.addMedia(f, { kind: cat === 'Skjult installasjon' ? 'skjult' : 'dokument', roomIds: d.roomId ? [d.roomId] : [], tags: cat === 'Skjult installasjon' ? ['skjult'] : [] }); d.mediaIds = d.mediaIds || []; d.mediaIds.push(md.id); } m.$('#d_media').innerHTML = media().map(x => HM.mediaThumb(x)).join(''); HM.hydrateBlobs(m.el); m.$('#d_file').value = ''; };
        m.$('#d_media').addEventListener('click', e => { const b = e.target.closest('[data-rmmedia]'); if (!b) return; e.preventDefault(); d.mediaIds = d.mediaIds.filter(x => x !== b.dataset.rmmedia); b.closest('.thumb').remove(); });
        m.$('#d_ok').onclick = () => {
          const v = HM.formValues(m.el); if (!v.d_title.trim()) { HM.toast('Gi dokumentasjonen en tittel'); return; }
          d.title = v.d_title.trim(); d.category = v.d_cat; d.roomId = v.d_room || null; d.notes = v.d_notes;
          Object.keys(LABELS).forEach(k => { if (v['d_' + k] !== undefined) d[k] = v['d_' + k]; });
          if (isNew) HM.state.docs.push(d); HM.save(); m.close(); HM.render();
        };
        m.$('#d_del') && (m.$('#d_del').onclick = async () => { if (!(await HM.confirm('Slette dokumentasjonen?', esc(d.title), 'Slett'))) return; HM.state.docs = HM.state.docs.filter(x => x.id !== d.id); HM.save(); HM.render(); });
      },
    });
  }
  HM.actions.newDoc = el => {
    const ds = (el && el.dataset) || {};
    const ref = ds.eid ? { kind: ds.ekind, id: ds.eid } : null;
    let cat = 'Maling'; if (ref && ref.kind === 'opening') { const o = byId(HM.plan().openings, ref.id); cat = o && o.type === 'window' ? 'Vindu' : 'Dør'; }
    docModal({ id: uid('dok'), title: '', category: cat, roomId: ds.room || null, elementRef: ref, mediaIds: [], createdAt: new Date().toISOString() }, true);
  };
  HM.actions.editDoc = el => { const d = byId(HM.state.docs, el.dataset.id); if (d) docModal(d, false); };

  // ---------- Vedlikehold ----------
  HM.maintNext = m => m.lastDone ? addMonths(m.lastDone, m.intervalMonths || 12) : (m.firstDue || todayISO());
  const TEMPLATES = [['Rense takrenner og nedløp', 12], ['Bytte ventilasjonsfilter', 6], ['Teste røykvarslere', 3], ['Bytte batteri i røykvarslere', 12], ['Rense sluk', 3], ['Sjekke taket for skader', 12], ['Male fasaden', 96], ['Olje terrassen', 24], ['Sjekke brannslukker', 12], ['Rense ventiler', 12], ['Sjekke fuktsikring på bad', 24]];
  function mStatus(m) { const n = daysBetween(todayISO(), HM.maintNext(m)); return n < 0 ? ['bad', `Forfalt (${-n} d)`] : n <= (m.remindDays ?? 14) ? ['est', relDays(HM.maintNext(m))] : ['ok', 'OK']; }
  HM.maintStatus = mStatus;
  HM.views.vedlikehold = function (main) {
    const st = HM.state; const list = st.maintenance.slice().sort((a, b) => HM.maintNext(a) < HM.maintNext(b) ? -1 : 1);
    main.innerHTML = `<div class="page">
      <div class="page-head"><div><h1>Vedlikehold</h1><p class="muted">Egne intervaller for takrenner, maling, filter, røykvarslere og annet. Registrer hva som ble gjort, hva det kostet og hvilke produkter som ble brukt.</p></div><button class="btn primary" data-act="newMaint">${icon('plus')} Ny oppgave</button></div>
      ${list.length ? `<div class="card"><div class="list">${list.map(m => { const [c, l] = mStatus(m); return `<div class="row"><div class="grow click" data-act="editMaint" data-id="${m.id}" style="cursor:pointer"><div class="title">${esc(m.title)}</div><div class="small muted">Hver ${m.intervalMonths} mnd · neste ${fmtDate(HM.maintNext(m))}${m.lastDone ? ' · sist ' + fmtDate(m.lastDone) : ''}${m.roomId ? ' · ' + esc(HM.roomName(m.roomId)) : m.area ? ' · ' + esc(m.area) : ''}</div></div><span class="pill ${c}">${l}</span><button class="btn sm" data-act="doneMaint" data-id="${m.id}">${icon('check')} Utført</button></div>`; }).join('')}</div></div>` : ''}
      ${!list.length ? `<div class="card"><h2>Kom i gang</h2><p class="small muted">Velg vanlige vedlikeholdsoppgaver. Du kan endre intervallene etterpå.</p><div class="btn-row">${TEMPLATES.map(([t, i]) => `<button class="btn sm" data-tpl="${esc(t)}|${i}">${icon('plus')} ${esc(t)} <span class="muted">(${i} mnd)</span></button>`).join('')}</div></div>` : `<details><summary>Legg til vanlige oppgaver</summary><div class="btn-row" style="margin-top:8px">${TEMPLATES.filter(([t]) => !st.maintenance.some(m => m.title === t)).map(([t, i]) => `<button class="btn sm" data-tpl="${esc(t)}|${i}">${icon('plus')} ${esc(t)}</button>`).join('')}</div></details>`}
    </div>`;
    main.querySelectorAll('[data-tpl]').forEach(b => b.onclick = () => { const [t, i] = b.dataset.tpl.split('|'); st.maintenance.push({ id: uid('vh'), title: t, intervalMonths: +i, lastDone: null, firstDue: todayISO(), roomId: null, area: '', notes: '', remindDays: 14, log: [] }); HM.save(); HM.render(); });
  };
  function maintModal(m, isNew) {
    HM.modal({
      title: isNew ? 'Ny vedlikeholdsoppgave' : m.title,
      body: `<div class="form-grid">${ui.field('Oppgave', ui.input('m_title', m.title), 'wide')}${ui.field('Intervall (måneder)', ui.input('m_int', m.intervalMonths || 12, 'inputmode="numeric"'))}${ui.field('Sist utført', `<input type="date" name="m_last" value="${m.lastDone || ''}">`)}${!m.lastDone ? ui.field('Første gang', `<input type="date" name="m_first" value="${m.firstDue || todayISO()}">`) : ''}${ui.field('Varsle dager før', ui.input('m_remind', m.remindDays ?? 14, 'inputmode="numeric"'))}${ui.field('Rom', ui.select('m_room', [['', 'Ingen'], ...HM.allRooms().map(r => [r.id, r.name])], m.roomId || ''))}${ui.field('Område', ui.input('m_area', m.area || '', 'placeholder="F.eks. tak, fasade"'))}${ui.field('Notat', `<textarea name="m_notes">${esc(m.notes || '')}</textarea>`, 'wide')}</div>
        ${(m.log || []).length ? `<div><div class="label">Historikk</div><div class="list">${m.log.slice().reverse().map(l => `<div class="row"><div class="grow"><div class="title">${fmtDate(l.date)}</div><div class="small muted">${[l.cost ? nok(l.cost) : '', esc(l.products || ''), esc(l.note || '')].filter(Boolean).join(' · ')}</div></div>${(l.mediaIds || []).length ? `<span class="pill">${l.mediaIds.length} bilde${l.mediaIds.length > 1 ? 'r' : ''}</span>` : ''}</div>`).join('')}</div></div>` : ''}`,
      foot: `${isNew ? '' : `<button class="btn danger" id="m_del">${icon('trash')}</button>`}<button class="btn" data-close>Avbryt</button><button class="btn primary" id="m_ok">Lagre</button>`,
      onMount: md => {
        md.$('#m_ok').onclick = () => { const v = HM.formValues(md.el); if (!v.m_title.trim()) { HM.toast('Skriv inn oppgaven'); return; } Object.assign(m, { title: v.m_title.trim(), intervalMonths: Math.max(1, Math.round(num(v.m_int)) || 12), lastDone: v.m_last || null, firstDue: v.m_first || m.firstDue || todayISO(), remindDays: Math.round(num(v.m_remind)), roomId: v.m_room || null, area: v.m_area, notes: v.m_notes }); if (isNew) HM.state.maintenance.push(m); HM.save(); md.close(); HM.render(); };
        md.$('#m_del') && (md.$('#m_del').onclick = async () => { if (!(await HM.confirm('Slette oppgaven?', 'Historikken slettes også.', 'Slett'))) return; HM.state.maintenance = HM.state.maintenance.filter(x => x.id !== m.id); HM.save(); HM.render(); });
      },
    });
  }
  HM.actions.newMaint = () => maintModal({ id: uid('vh'), title: '', intervalMonths: 12, lastDone: null, firstDue: todayISO(), remindDays: 14, log: [] }, true);
  HM.actions.editMaint = el => { const m = byId(HM.state.maintenance, el.dataset.id); if (m) maintModal(m, false); };
  HM.actions.doneMaint = el => {
    const m = byId(HM.state.maintenance, el.dataset.id); if (!m) return;
    HM.modal({
      title: 'Registrer utført: ' + m.title,
      body: `<div class="form-grid">${ui.field('Dato', `<input type="date" name="l_date" value="${todayISO()}">`)}${ui.field('Kostnad (kr)', ui.input('l_cost', '', 'inputmode="decimal"'))}${ui.field('Produkter brukt', ui.input('l_prod', '', 'placeholder="F.eks. filter F7, 2 stk"'), 'wide')}${ui.field('Notat', `<textarea name="l_note"></textarea>`, 'wide')}</div><label class="field"><span>Bilder (før/etter)</span><input type="file" id="l_files" accept="image/*" multiple></label>`,
      foot: `<button class="btn" data-close>Avbryt</button><button class="btn primary" id="l_ok">Lagre</button>`,
      onMount: md => md.$('#l_ok').onclick = async () => {
        const v = HM.formValues(md.el); const ids = [];
        for (const f of md.$('#l_files').files) { const x = await HM.addMedia(f, { kind: 'vedlikehold', roomIds: m.roomId ? [m.roomId] : [] }); ids.push(x.id); }
        m.log = m.log || []; m.log.push({ id: uid('lg'), date: v.l_date || todayISO(), cost: num(v.l_cost), products: v.l_prod, note: v.l_note, mediaIds: ids });
        if (!m.lastDone || (v.l_date || todayISO()) > m.lastDone) m.lastDone = v.l_date || todayISO();
        HM.save(); md.close(); HM.toast('Registrert. Neste gang: ' + fmtDate(HM.maintNext(m))); HM.render();
      },
    });
  };

  // ---------- Tidslinje ----------
  HM.views.tidslinje = function (main) {
    const st = HM.state; const items = [];
    for (const p of st.projects) {
      const media = st.media.filter(x => x.projectId === p.id);
      const before = media.find(x => (x.tags || []).includes('før')), after = media.slice().reverse().find(x => (x.tags || []).includes('etter'));
      const doneDate = p.status === 'ferdig' ? (p.tasks.map(t => t.doneAt).filter(Boolean).sort().pop() || p.end) : null;
      const cost = HM.econ.paid(st, p.id);
      if (doneDate) items.push({ date: doneDate, kind: 'p', title: `${p.name} ferdig`, sub: `${cost ? 'Kostnad ' + nok(cost) : ''}${(p.roomIds || []).length ? ' · ' + p.roomIds.map(HM.roomName).join(', ') : ''}`, before, after, id: p.id });
      else if (p.start && p.start <= todayISO()) items.push({ date: p.start, kind: 'p', title: `${p.name} startet`, sub: HM.PROJECT_STATUS.find(s => s[0] === p.status)[1], before, after, id: p.id });
    }
    for (const m of st.maintenance) for (const l of m.log || []) items.push({ date: l.date, kind: 'm', title: m.title, sub: [l.cost ? nok(l.cost) : '', l.products, l.note].filter(Boolean).join(' · '), media: l.mediaIds });
    for (const d of st.docs) if (d.date && ['Maling', 'Gulv', 'Panel og kledning', 'Taktekking', 'Vindu', 'Dør', 'Produkt', 'Skjult installasjon'].includes(d.category)) items.push({ date: d.date, kind: 'd', title: d.title, sub: [d.category, d.colorCode, d.product].filter(Boolean).join(' · '), docId: d.id });
    items.sort((a, b) => a.date < b.date ? 1 : -1);
    const img = id => { const m = byId(st.media, id); return m ? `<div class="thumb" style="width:120px;aspect-ratio:4/3"><img data-blob="${m.blobId}" alt=""></div>` : ''; };
    main.innerHTML = `<div class="page"><div class="page-head"><div><h1>Husets historikk</h1><p class="muted">Tidslinje over oppussing og vedlikehold, med før- og etterbilder.</p></div></div>
      ${items.length ? `<div class="timeline">${items.map(it => `<div class="tl-item ${it.kind === 'm' ? 'm' : ''}"><div class="small muted">${fmtDate(it.date)}</div><div class="title" style="font-weight:650">${it.id ? `<a href="#" data-act="go" data-to="prosjekt" data-id="${it.id}">${esc(it.title)}</a>` : it.docId ? `<a href="#" data-act="editDoc" data-id="${it.docId}">${esc(it.title)}</a>` : esc(it.title)}</div>${it.sub ? `<div class="small">${esc(it.sub)}</div>` : ''}
        ${it.before || it.after ? `<div class="btn-row">${it.before ? `<div><div class="tiny muted">Før</div>${img(it.before.id)}</div>` : ''}${it.after ? `<div><div class="tiny muted">Etter</div>${img(it.after.id)}</div>` : ''}</div>` : ''}
        ${(it.media || []).length ? `<div class="btn-row">${it.media.map(img).join('')}</div>` : ''}</div>`).join('')}</div>` : ui.empty('Ingen historikk ennå', 'Ferdige prosjekter, utført vedlikehold og datert dokumentasjon dukker opp her.')}</div>`;
  };
})();
