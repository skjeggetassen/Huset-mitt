/* Handleliste, verktøyliste og huskelister per rom og prosjekt. */
(function () {
  const { esc, byId, uid, nok, num, todayISO } = HM.util; const icon = HM.icon; const ui = HM.ui;
  const TOOL_ST = [['har', 'Har'], ['kjop', 'Må kjøpe'], ['lane', 'Må låne']];

  HM.shoppingListHtml = function (items, opts = {}) {
    if (!items.length) return ui.empty('Ingen varer', 'Legg til det som må kjøpes, med antall, mål, butikk og anslått pris.');
    const missing = items.filter(i => !i.bought); const unreg = items.filter(i => i.bought && !i.receiptId);
    return `<div class="list">${items.slice().sort((a, b) => a.bought - b.bought).map(i => `<div class="row">
        <input type="checkbox" data-shop="${i.id}" ${i.bought ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--accent);flex:none" aria-label="Kjøpt">
        ${i.mediaId ? `<div class="thumb" style="width:40px;flex:none"><img data-blob="${(byId(HM.state.media, i.mediaId) || {}).blobId}" alt=""></div>` : ''}
        <div class="grow click" data-act="editShop" data-id="${i.id}" style="cursor:pointer"><div class="title" style="${i.bought ? 'text-decoration:line-through;opacity:.6' : ''}">${esc(i.name)}</div>
        <div class="small muted">${[i.qty ? `${i.qty} ${esc(i.unit || 'stk')}` : '', esc(i.dims || ''), esc(i.store || ''), !opts.project && i.projectId ? esc((byId(HM.state.projects, i.projectId) || {}).name || '') : ''].filter(Boolean).join(' · ')}${i.link ? ` · <a href="${esc(i.link)}" target="_blank" rel="noopener">lenke</a>` : ''}${i.bought && !i.receiptId ? ' · <span style="color:var(--est);font-weight:600">ikke registrert som utgift</span>' : ''}${i.receiptId ? ' · registrert' : ''}</div></div>
        <span class="num small">${i.price ? '≈ ' + nok(num(i.qty || 1) * num(i.price)) : ''}</span></div>`).join('')}</div>
      <div class="small" style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><span>${missing.length} mangler · anslått ${nok(missing.reduce((s, i) => s + num(i.qty || 1) * num(i.price), 0))}</span>${unreg.length ? `<button class="btn sm primary" data-act="shopToReceipt" data-ids="${unreg.map(i => i.id).join(',')}">${icon('receipt')} Registrer ${unreg.length} kjøpt${unreg.length > 1 ? 'e' : ''} som utgift</button>` : ''}</div>`;
  };
  HM.toolListHtml = function (items) {
    if (!items.length) return ui.empty('Ingen verktøy', 'Før opp verktøy du trenger, og om du har det, må kjøpe eller låne.');
    return `<div class="list">${items.map(t => `<div class="row"><div class="grow click" data-act="editTool" data-id="${t.id}" style="cursor:pointer"><div class="title">${esc(t.name)}</div><div class="small muted">${t.projectId ? esc((byId(HM.state.projects, t.projectId) || {}).name || '') : ''}${t.note ? ' · ' + esc(t.note) : ''}</div></div>
      <div class="seg">${TOOL_ST.map(([k, l]) => `<button aria-pressed="${t.status === k}" data-toolst="${t.id}:${k}">${l}</button>`).join('')}</div></div>`).join('')}</div>`;
  };
  HM.checklistHtml = function (c) {
    const done = c.items.filter(i => i.done).length;
    return `<div class="card" style="padding:12px;gap:6px;background:var(--surface-2);border:0" data-cl="${c.id}">
      <div class="card-head"><strong>${esc(c.title)}</strong><span class="small muted">${done}/${c.items.length}${c.roomId ? ' · ' + esc(HM.roomName(c.roomId)) : ''}${c.projectId ? ' · ' + esc((byId(HM.state.projects, c.projectId) || {}).name || '') : ''}</span></div>
      ${c.items.map(i => `<label class="check"><input type="checkbox" data-cli="${c.id}:${i.id}" ${i.done ? 'checked' : ''}> <span style="${i.done ? 'text-decoration:line-through;opacity:.6' : ''}">${esc(i.text)}</span></label>`).join('')}
      <div class="btn-row"><input class="input" data-cladd="${c.id}" placeholder="Nytt punkt" style="flex:1;min-height:34px"><button class="btn sm ghost" data-cldel="${c.id}" aria-label="Slett listen">${icon('trash')}</button></div></div>`;
  };
  HM.wireChecklists = function (root) {
    root.querySelectorAll('[data-cli]').forEach(c => c.onchange = () => { const [cid, iid] = c.dataset.cli.split(':'); const l = byId(HM.state.checklists, cid); const it = l && byId(l.items, iid); if (it) { it.done = c.checked; HM.save(); HM.render(); } });
    root.querySelectorAll('[data-cladd]').forEach(inp => inp.onkeydown = e => { if (e.key !== 'Enter') return; const v = inp.value.trim(); if (!v) return; const l = byId(HM.state.checklists, inp.dataset.cladd); l.items.push({ id: uid('ci'), text: v, done: false }); HM.save(); HM.render(); setTimeout(() => { const n = document.querySelector(`[data-cladd="${l.id}"]`); n && n.focus(); }, 0); });
    root.querySelectorAll('[data-cldel]').forEach(b => b.onclick = async () => { if (!(await HM.confirm('Slette huskelisten?', '', 'Slett'))) return; HM.state.checklists = HM.state.checklists.filter(x => x.id !== b.dataset.cldel); HM.save(); HM.render(); });
  };
  HM.wireLists = function (root) {
    root.querySelectorAll('[data-shop]').forEach(c => c.onchange = () => { const i = byId(HM.state.shopping, c.dataset.shop); i.bought = c.checked; i.boughtAt = c.checked ? todayISO() : null; HM.save(); HM.render(); });
    root.querySelectorAll('[data-toolst]').forEach(b => b.onclick = () => { const [id, s] = b.dataset.toolst.split(':'); const t = byId(HM.state.tools, id); t.status = s; HM.save(); HM.render(); });
  };

  const lists = { tab: 'handle', filter: 'mangler' };
  HM.views.lister = function (main, params) {
    if (params.tab) lists.tab = params.tab;
    const st = HM.state;
    let body = '';
    if (lists.tab === 'handle') {
      const items = st.shopping.filter(i => lists.filter === 'alle' ? true : lists.filter === 'kjopt' ? i.bought : !i.bought);
      body = `<div class="card"><div class="card-head"><div class="seg">${[['mangler', 'Mangler'], ['kjopt', 'Kjøpt'], ['alle', 'Alle']].map(([k, l]) => `<button aria-pressed="${lists.filter === k}" data-lf="${k}">${l}</button>`).join('')}</div><button class="btn sm primary" data-act="newShop">${icon('plus')} Vare</button></div>${HM.shoppingListHtml(lists.filter === 'kjopt' ? items : items)}</div>`;
    } else if (lists.tab === 'verktoy') {
      body = `<div class="card"><div class="card-head"><h2>Verktøy</h2><button class="btn sm primary" data-act="newTool">${icon('plus')} Verktøy</button></div>${TOOL_ST.map(([k, l]) => { const its = st.tools.filter(t => t.status === k); return its.length ? `<div><div class="label">${l} (${its.length})</div>${HM.toolListHtml(its)}</div>` : ''; }).join('') || HM.toolListHtml([])}</div>`;
    } else {
      body = `<div class="card-head"><h2>Huskelister</h2><button class="btn sm primary" data-act="newChecklist">${icon('plus')} Ny huskeliste</button></div>${st.checklists.length ? `<div class="grid">${st.checklists.map(c => HM.checklistHtml(c)).join('')}</div>` : ui.empty('Ingen huskelister', 'Lag huskelister per rom eller prosjekt.')}`;
    }
    main.innerHTML = `<div class="page"><div class="page-head"><div><h1>Lister og innkjøp</h1><p class="muted">Felles handleliste, verktøy og huskelister for rom og prosjekter.</p></div></div>
      <div class="tabs">${[['handle', `Handleliste (${st.shopping.filter(i => !i.bought).length})`], ['verktoy', 'Verktøy'], ['huske', 'Huskelister']].map(([k, l]) => `<button aria-selected="${lists.tab === k}" data-lt="${k}">${l}</button>`).join('')}</div>${body}</div>`;
    main.querySelectorAll('[data-lt]').forEach(b => b.onclick = () => { lists.tab = b.dataset.lt; HM.render(); });
    main.querySelectorAll('[data-lf]').forEach(b => b.onclick = () => { lists.filter = b.dataset.lf; HM.render(); });
    HM.wireLists(main); HM.wireChecklists(main);
  };

  function shopModal(i, isNew) {
    const projs = HM.state.projects;
    HM.modal({
      title: isNew ? 'Ny vare' : 'Vare',
      body: `<div class="form-grid">
        ${ui.field('Vare', ui.input('s_name', i.name, 'placeholder="F.eks. Gulvlist eik"'), 'wide')}
        ${ui.field('Antall', ui.input('s_qty', i.qty ?? 1, 'inputmode="decimal"'))}
        ${ui.field('Enhet', ui.select('s_unit', ['stk', 'pk', 'm', 'm²', 'l', 'kg', 'rull', 'boks'], i.unit || 'stk'))}
        ${ui.field('Mål', ui.input('s_dims', i.dims || '', 'placeholder="F.eks. 12 × 58 mm, 2,4 m"'))}
        ${ui.field('Butikk', ui.input('s_store', i.store || ''))}
        ${ui.field('Anslått pris per enhet (kr)', ui.input('s_price', i.price || '', 'inputmode="decimal"'))}
        ${ui.field('Prosjekt', ui.select('s_proj', [['', 'Ingen'], ...projs.map(p => [p.id, p.name])], i.projectId || ''))}
        ${ui.field('Produktlenke', ui.input('s_link', i.link || '', 'type="url" placeholder="https://"'), 'wide')}
      </div><label class="field"><span>Bilde (valgfritt)</span><input type="file" id="s_img" accept="image/*"></label>
      ${!isNew ? `<label class="check"><input type="checkbox" name="s_bought" ${i.bought ? 'checked' : ''}> Kjøpt</label>` : ''}`,
      foot: `${isNew ? '' : `<button class="btn danger" id="s_del">${icon('trash')}</button>`}<button class="btn" data-close>Avbryt</button><button class="btn primary" id="s_ok">Lagre</button>`,
      onMount: m => {
        m.$('#s_ok').onclick = async () => {
          const v = HM.formValues(m.el); if (!v.s_name.trim()) { HM.toast('Skriv inn varenavn'); return; }
          Object.assign(i, { name: v.s_name.trim(), qty: num(v.s_qty) || 1, unit: v.s_unit, dims: v.s_dims, store: v.s_store, price: num(v.s_price), projectId: v.s_proj || null, link: v.s_link.trim() });
          if (!isNew) i.bought = !!v.s_bought;
          const f = m.$('#s_img').files[0]; if (f) { const md = await HM.addMedia(f, { kind: 'produkt', projectId: i.projectId }); i.mediaId = md.id; }
          if (isNew) HM.state.shopping.push(i); HM.save(); m.close(); HM.render();
        };
        m.$('#s_del') && (m.$('#s_del').onclick = () => { HM.state.shopping = HM.state.shopping.filter(x => x.id !== i.id); HM.save(); m.close(); HM.render(); });
      },
    });
  }
  HM.actions.newShop = el => shopModal({ id: uid('hv'), name: '', qty: 1, unit: 'stk', projectId: el && el.dataset.project || null, bought: false }, true);
  HM.actions.editShop = el => { const i = byId(HM.state.shopping, el.dataset.id); if (i) shopModal(i, false); };
  HM.actions.shopToReceipt = el => {
    const items = el.dataset.ids.split(',').map(id => byId(HM.state.shopping, id)).filter(Boolean);
    const lines = items.map(i => ({ text: i.name + (i.dims ? ' ' + i.dims : ''), qty: num(i.qty || 1), amount: Math.round(num(i.qty || 1) * num(i.price) * 100) / 100, projectId: i.projectId }));
    const total = lines.reduce((s, l) => s + l.amount, 0);
    const sums = {}; lines.forEach(l => { if (l.projectId) sums[l.projectId] = (sums[l.projectId] || 0) + l.amount; });
    const stores = [...new Set(items.map(i => i.store).filter(Boolean))];
    const rec = HM.newReceiptObj({ store: stores.length === 1 ? stores[0] : '', lines, total: Math.round(total * 100) / 100, allocations: Object.entries(sums).map(([projectId, amount]) => ({ projectId, amount })), uncertain: ['total'], notes: 'Laget fra handlelisten. Beløpet er anslått – rett det til det du faktisk betalte.' });
    HM.openReceipt(rec, true, { onSaved: r => items.forEach(i => { i.receiptId = r.id; i.bought = true; }) });
  };

  function toolModal(t, isNew) {
    HM.modal({
      title: isNew ? 'Nytt verktøy' : 'Verktøy',
      body: `<div class="form-grid">${ui.field('Verktøy', ui.input('tl_name', t.name, 'placeholder="F.eks. Gjæringssag"'), 'wide')}${ui.field('Status', ui.select('tl_st', TOOL_ST, t.status))}${ui.field('Prosjekt', ui.select('tl_proj', [['', 'Ingen'], ...HM.state.projects.map(p => [p.id, p.name])], t.projectId || ''))}${ui.field('Notat', ui.input('tl_note', t.note || '', 'placeholder="F.eks. lånes av nabo"'), 'wide')}</div>`,
      foot: `${isNew ? '' : `<button class="btn danger" id="tl_del">${icon('trash')}</button>`}<button class="btn" data-close>Avbryt</button><button class="btn primary" id="tl_ok">Lagre</button>`,
      onMount: m => {
        m.$('#tl_ok').onclick = () => { const v = HM.formValues(m.el); if (!v.tl_name.trim()) { HM.toast('Skriv inn navn'); return; } Object.assign(t, { name: v.tl_name.trim(), status: v.tl_st, projectId: v.tl_proj || null, note: v.tl_note }); if (isNew) HM.state.tools.push(t); HM.save(); m.close(); HM.render(); };
        m.$('#tl_del') && (m.$('#tl_del').onclick = () => { HM.state.tools = HM.state.tools.filter(x => x.id !== t.id); HM.save(); m.close(); HM.render(); });
      },
    });
  }
  HM.actions.newTool = el => toolModal({ id: uid('vt'), name: '', status: 'kjop', projectId: el && el.dataset.project || null }, true);
  HM.actions.editTool = el => { const t = byId(HM.state.tools, el.dataset.id); if (t) toolModal(t, false); };
  HM.actions.newChecklist = el => {
    HM.modal({
      title: 'Ny huskeliste',
      body: `<div class="form-grid">${ui.field('Navn', ui.input('c_title', '', 'placeholder="F.eks. Før maling"'), 'wide')}${ui.field('Rom', ui.select('c_room', [['', 'Ingen'], ...HM.allRooms().map(r => [r.id, r.name])], el && el.dataset.room || ''))}${ui.field('Prosjekt', ui.select('c_proj', [['', 'Ingen'], ...HM.state.projects.map(p => [p.id, p.name])], el && el.dataset.project || ''))}${ui.field('Punkter (ett per linje)', `<textarea name="c_items" placeholder="Dekke til gulv&#10;Sparkle hull&#10;Kjøpe tape"></textarea>`, 'wide')}</div>`,
      foot: `<button class="btn" data-close>Avbryt</button><button class="btn primary" id="c_ok">Lag liste</button>`,
      onMount: m => m.$('#c_ok').onclick = () => { const v = HM.formValues(m.el); if (!v.c_title.trim()) { HM.toast('Gi listen et navn'); return; } HM.state.checklists.push({ id: uid('hl'), title: v.c_title.trim(), roomId: v.c_room || null, projectId: v.c_proj || null, items: v.c_items.split('\n').map(s => s.trim()).filter(Boolean).map(text => ({ id: uid('ci'), text, done: false })) }); HM.save(); m.close(); HM.render(); },
    });
  };
})();
