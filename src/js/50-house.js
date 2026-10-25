/* Arbeidsflate for huset: plantegning og 3D side om side, verktøy, etasjer, versjoner og eksport. */
(function () {
  const G = HM.geo; const { esc, byId, uid, fmtLen, fmtArea } = HM.util; const icon = HM.icon;
  let ws = null; // aktiv arbeidsflate
  HM.houseWs = () => ws;

  HM.houseMode = (() => { try { return localStorage.getItem('hm-house-mode') || (window.innerWidth >= 1100 ? 'split' : 'plan'); } catch (e) { return 'plan'; } })();

  HM.views.huset = function (main, params) {
    if (params && params.mode) HM.houseMode = params.mode;
    if (params && params.versionId && byId(HM.state.versions, params.versionId)) HM.state.activeVersionId = params.versionId;
    const plan = HM.plan(); const ver = HM.version();
    const fid = HM.activeFloorId();
    const mode = HM.houseMode;
    main.innerHTML = `<div class="house">
      <div class="house-bar">
        <select id="hb-version" aria-label="Versjon">${HM.state.versions.map(v => `<option value="${v.id}" ${v.id === ver.id ? 'selected' : ''}>${v.kind === 'current' ? '● ' : '◇ '}${esc(v.name)}</option>`).join('')}</select>
        <select id="hb-floor" aria-label="Etasje">${plan.floors.slice().sort((a, b) => a.elevation - b.elevation).map(f => `<option value="${f.id}" ${f.id === fid ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}<option value="__new">+ Ny etasje …</option></select>
        <div class="seg" role="group" aria-label="Visning">
          <button aria-pressed="${mode === 'plan'}" data-mode="plan">${icon('plan')}<span class="hide-s"> Plan</span></button>
          <button aria-pressed="${mode === '3d'}" data-mode="3d">${icon('cube')}<span class="hide-s"> 3D</span></button>
          <button aria-pressed="${mode === 'split'}" data-mode="split" title="Begge">${icon('compare')}</button>
        </div>
        <span class="sp"></span>
        <button class="btn icon ghost" id="hb-undo" title="Angre (Ctrl+Z)" aria-label="Angre">${icon('undo')}</button>
        <button class="btn icon ghost" id="hb-redo" title="Gjør om (Ctrl+Shift+Z)" aria-label="Gjør om">${icon('redo')}</button>
        <button class="btn icon ghost" id="hb-props" title="Etasje og kontroll av mål" aria-label="Etasje og kontroll">${icon('layers')}</button>
        <button class="btn icon ghost" id="hb-more" title="Mer" aria-label="Mer">${icon('more')}</button>
      </div>
      ${ver.kind !== 'current' ? `<div class="notice info" style="border-radius:0">${icon('info')}<div>Du redigerer forslaget <strong>${esc(ver.name)}</strong>. Dagens hus endres ikke.</div></div>` : ''}
      <div class="house-body ${mode === 'split' ? 'split' : ''}" id="hb-body">
        <div class="pane plan-pane" id="pane-plan" ${mode === '3d' ? 'hidden' : ''}></div>
        <div class="pane view3d-pane" id="pane-3d" ${mode === 'plan' ? 'hidden' : ''}></div>
        <div class="props" id="props" hidden><div class="props-head"><h3 id="props-title"></h3><button class="btn icon ghost sm" id="props-close" aria-label="Lukk">${icon('x')}</button></div><div class="props-body" id="props-body"></div></div>
      </div>
    </div>`;
    const style = document.getElementById('hm-hide-s') || Object.assign(document.createElement('style'), { id: 'hm-hide-s', textContent: '@media (max-width:520px){.hide-s{display:none}}' });
    document.head.appendChild(style);
    mount(main);
  };

  function mount(main) {
    if (ws) ws.destroy();
    const plan = HM.plan();
    const st = { editor: null, v3: null, propsOpen: window.innerWidth >= 900 };
    const paneP = $('#pane-plan'), pane3 = $('#pane-3d'), props = $('#props');
    function $(s) { return main.querySelector(s); }

    // ---------- Plantegning ----------
    if (!paneP.hidden) {
      st.editor = HM.createEditor(paneP);
      const tools = [['select', 'cursor', 'Velg og flytt'], ['room', 'room', 'Tegn rom (dra)'], ['wall', 'wall', 'Tegn vegg (trykk punkt for punkt)'], ['door', 'door', 'Sett inn dør (trykk på vegg)'], ['window', 'window', 'Sett inn vindu (trykk på vegg)'], ['opening', 'opening', 'Sett inn åpning (trykk på vegg)'], ['stairs', 'stairs', 'Trapp'], ['furniture', 'sofa', 'Møbler og innredning'], ['measure', 'ruler', 'Mål avstand']];
      const tb = document.createElement('div'); tb.className = 'toolbar'; tb.setAttribute('role', 'toolbar');
      tb.innerHTML = tools.map(([t, ic, l]) => `<button data-tool="${t}" title="${l}" aria-label="${l}" aria-pressed="${t === 'select'}">${icon(ic)}</button>`).join('') + `<hr><button data-tool="fit" title="Tilpass visning" aria-label="Tilpass visning">${icon('fit')}</button>`;
      paneP.appendChild(tb);
      const hint = document.createElement('div'); hint.className = 'float-bl';
      hint.innerHTML = `<div class="hintbox" id="ed-hint" hidden></div><div class="legend"><span><i style="background:var(--wall)"></i>Bekreftet</span><span><i style="background:var(--src)"></i>Fra materialet</span><span><i style="background:var(--est);opacity:.6"></i>Anslått</span><span><i style="background:var(--bad);height:9px;width:9px;border-radius:50%"></i>Må avklares</span></div>`;
      paneP.appendChild(hint);
      const tr = document.createElement('div'); tr.className = 'float-tr'; tr.id = 'ed-tr'; paneP.appendChild(tr);
      const hints = { select: '', room: 'Dra over tegneflaten for å tegne et rom. Mål kan rettes etterpå.', wall: 'Trykk startpunkt, deretter hvert hjørne. Trykk på et eksisterende punkt for å koble til.', door: 'Trykk på en vegg for å sette inn en dør.', window: 'Trykk på en vegg for å sette inn et vindu.', opening: 'Trykk på en vegg for å sette inn en åpning.', stairs: 'Trykk der trappen skal stå.', furniture: 'Trykk der møbelet skal stå.', measure: 'Trykk to punkter for å måle avstanden.' };
      st.editor.onTool = t => {
        tb.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
        const h = $('#ed-hint'); h.textContent = hints[t] || ''; h.hidden = !hints[t];
        tr.innerHTML = t === 'wall' ? `<button class="btn sm primary" id="ed-done">${icon('check')} Ferdig</button>` : '';
        $('#ed-done') && ($('#ed-done').onclick = () => { st.editor.finishChain(); st.editor.setTool('select'); });
      };
      tb.addEventListener('click', e => {
        const b = e.target.closest('[data-tool]'); if (!b) return;
        const t = b.dataset.tool;
        if (t === 'fit') return st.editor.fit();
        if (t === 'furniture') return openLibrary(item => st.editor.setTool('furniture', { placeItem: item }));
        st.editor.setTool(t);
      });
      if (!plan.walls.length && !plan.rooms.length) {
        const emp = document.createElement('div'); emp.className = 'float-tr'; emp.style.top = '60px';
        emp.innerHTML = `<div class="card" style="max-width:330px;box-shadow:var(--shadow)"><h3>Start med ett rom</h3><p class="small muted">Last opp bilder eller en plantegning og la Claude foreslå rommene, eller tegn rommet selv.</p><div class="btn-row"><button class="btn primary sm" data-act="go" data-to="importer">${icon('upload')} Last opp</button><button class="btn sm" id="ed-quick">${icon('room')} Lag rom fra mål</button></div></div>`;
        paneP.appendChild(emp);
        emp.querySelector('#ed-quick').onclick = () => quickRoom();
      }
    }
    // ---------- 3D ----------
    if (!pane3.hidden && !window.THREE) {
      pane3.innerHTML = '<div class="empty" style="margin:20px">Laster 3D …</div>';
      HM.loadLib('three').then(() => { if (ws && ws.st === st) { pane3.innerHTML = ''; start3D(); } }).catch(() => { pane3.innerHTML = '<div class="empty" style="margin:20px"><strong>3D kunne ikke lastes</strong>Sjekk nettforbindelsen og prøv igjen. Plantegningen fungerer som vanlig.</div>'; });
    } else if (!pane3.hidden) start3D();
    function start3D() {
      st.v3 = HM.create3D(pane3, { onMode: m => update3dBar() });
      if (st.v3) {
        const bar = document.createElement('div'); bar.className = 'float-tr'; bar.id = 'v3-bar'; pane3.appendChild(bar);
        const info = document.createElement('div'); info.className = 'info3d'; info.id = 'v3-info'; pane3.appendChild(info);
        const bl = document.createElement('div'); bl.className = 'float-bl'; bl.id = 'v3-bl'; bl.style.bottom = '146px'; pane3.appendChild(bl);
        if (HM.pendingCompare && byId(HM.state.versions, HM.pendingCompare)) { st.v3.setCompare(HM.pendingCompare); setTimeout(setupCompare, 0); }
        if (HM.pendingWalk) { st.v3.startWalk(HM.pendingWalk); st.v3.showJoy(matchMedia('(pointer: coarse)').matches); }
        HM.pendingCompare = null; HM.pendingWalk = null;
        update3dBar();
      }
    }
    
    function update3dBar() {
      const v = st.v3; if (!v) return; const bar = $('#v3-bar'); if (!bar) return;
      const plan = HM.plan();
      const others = HM.state.versions.filter(x => x.id !== HM.state.activeVersionId);
      bar.innerHTML = `
        ${v.mode === 'walk' ? `<button class="btn sm primary" data-v3="orbit">${icon('cube')} Oversikt</button>` : `<button class="btn sm primary" data-v3="walk">${icon('walk')} Gå rundt</button>`}
        <select class="btn sm" data-v3sel="floor" aria-label="Etasjer i 3D"><option value="all">Alle etasjer</option>${plan.floors.slice().sort((a, b) => a.elevation - b.elevation).map(f => `<option value="${f.id}" ${v.floorId === f.id ? 'selected' : ''}>Til og med ${esc(f.name)}</option>`).join('')}</select>
        ${v.mode === 'orbit' ? `<button class="btn sm ${v.roof ? 'primary' : ''}" data-v3="roof" aria-pressed="${v.roof}">${icon('roof')} Tak</button>` : ''}
        <button class="btn sm ${v.measuring ? 'primary' : ''}" data-v3="measure" aria-pressed="${v.measuring}">${icon('ruler')} Mål</button>
        ${others.length ? `<select class="btn sm" data-v3sel="compare" aria-label="Sammenlign med"><option value="">Sammenlign …</option>${others.map(o => `<option value="${o.id}" ${v.compareId === o.id ? 'selected' : ''}>Mot ${esc(o.name)}</option>`).join('')}</select>` : ''}`;
      bar.querySelectorAll('[data-v3]').forEach(b => b.onclick = () => {
        const a = b.dataset.v3;
        if (a === 'walk') { v.startWalk(); v.showJoy(matchMedia('(pointer: coarse)').matches); }
        if (a === 'orbit') { v.setMode('orbit'); v.showJoy(false); }
        if (a === 'roof') v.setRoof(!v.roof);
        if (a === 'measure') v.setMeasuring(!v.measuring);
        update3dBar();
      });
      bar.querySelector('[data-v3sel="floor"]').onchange = e => v.setFloor(e.target.value);
      const cmp = bar.querySelector('[data-v3sel="compare"]'); if (cmp) cmp.onchange = e => { v.setCompare(e.target.value); setupCompare(); };
      const bl = $('#v3-bl'); bl.innerHTML = v.mode === 'walk' ? `<div class="hintbox">${matchMedia('(pointer: coarse)').matches ? 'Bruk spaken for å gå. Dra på skjermen for å se rundt.' : 'Gå med W A S D eller piltaster, dra med musen for å se rundt. Shift = raskere.'}</div>` : (v.measuring ? `<div class="hintbox">Trykk på to punkter i modellen for å måle.</div>` : '');
      bl.innerHTML += `<p class="disclaimer" style="background:color-mix(in srgb, var(--surface) 80%, transparent);padding:3px 8px;border-radius:6px">Visualisering, ikke godkjent byggtegning.</p>`;
    }
    function setupCompare() {
      pane3.querySelectorAll('.compare-handle, .compare-label').forEach(x => x.remove());
      const v = st.v3; if (!v || !v.compareId) return;
      const vb = byId(HM.state.versions, v.compareId);
      const h = document.createElement('div'); h.className = 'compare-handle'; pane3.appendChild(h);
      const la = document.createElement('div'); la.className = 'compare-label'; la.style.left = '12px'; la.textContent = HM.version().name; pane3.appendChild(la);
      const lb = document.createElement('div'); lb.className = 'compare-label'; lb.style.right = '12px'; lb.textContent = vb ? vb.name : ''; pane3.appendChild(lb);
      const place = () => { h.style.left = (v.split * 100) + '%'; };
      place();
      h.addEventListener('pointerdown', e => { h.setPointerCapture(e.pointerId); h._d = true; });
      h.addEventListener('pointermove', e => { if (!h._d) return; const r = pane3.getBoundingClientRect(); v.setSplit((e.clientX - r.left) / r.width); place(); });
      h.addEventListener('pointerup', () => { h._d = false; });
    }

    // ---------- Egenskapspanel ----------
    function refreshProps() {
      const show = !!HM.sel || st.propsOpen;
      props.hidden = !show; $('#hb-body').classList.toggle('with-props', show);
      if (!show) return;
      $('#props-title').textContent = HM.propsTitle();
      const body = $('#props-body');
      const active = document.activeElement; const activeId = active && body.contains(active) ? active.id : null;
      const scroll = body.scrollTop;
      HM.renderProps(body);
      body.scrollTop = scroll;
      if (activeId) { const el = body.querySelector('#' + activeId); if (el && el.tagName !== 'BUTTON') el.focus(); }
      HM.hydrateBlobs(body);
    }
    function refresh3dInfo() {
      const info = $('#v3-info'); if (!info) return;
      if (!HM.sel || !paneP.hidden) { info.innerHTML = ''; return; }
      info.innerHTML = '';
    }
    $('#props-close').onclick = () => { if (HM.sel) HM.select(null, null); st.propsOpen = false; refreshProps(); };
    $('#hb-props').onclick = () => { if (HM.sel) HM.select(null, null); st.propsOpen = !st.propsOpen || !!HM.sel; refreshProps(); };

    const onSel = (sel, opts) => {
      refreshProps(); refresh3dInfo();
      if (sel && opts && (opts.zoom || opts.source === '3d') && st.editor) {
        // bytt etasje om nødvendig
        const plan = HM.plan(); const o = byId(plan.rooms, sel.id) || byId(plan.walls, sel.id) || byId(plan.furniture, sel.id) || byId(plan.stairs, sel.id) || (byId(plan.openings, sel.id) && byId(plan.walls, byId(plan.openings, sel.id).wallId));
        if (o && o.floorId && o.floorId !== HM.activeFloorId()) { HM.editorFloor = o.floorId; $('#hb-floor').value = o.floorId; }
        if (opts.zoom) st.editor.zoomTo(sel.kind, sel.id); else st.editor.draw();
      }
    };
    const onPlan = (o) => {
      updateUndo();
      if (o && o.live) return;
      if (o && o.floors) { HM.render(); return; }
      refreshProps();
    };
    HM.selListeners.add(onSel); HM.planListeners.add(onPlan);
    function updateUndo() { $('#hb-undo').disabled = !HM.undo.canUndo(); $('#hb-redo').disabled = !HM.undo.canRedo(); }
    updateUndo(); refreshProps();

    const doUndo = () => { if (HM.undo.undo()) { HM.save(); HM.emitPlanChanged({}); if (HM.sel && !findSel()) HM.select(null, null); } };
    const doRedo = () => { if (HM.undo.redo()) { HM.save(); HM.emitPlanChanged({}); if (HM.sel && !findSel()) HM.select(null, null); } };
    const findSel = () => { const p = HM.plan(); const s = HM.sel; return s && (p[{ room: 'rooms', wall: 'walls', opening: 'openings', stairs: 'stairs', furniture: 'furniture' }[s.kind]] || []).some(x => x.id === s.id); };
    $('#hb-undo').onclick = doUndo; $('#hb-redo').onclick = doRedo;
    const onKey = e => {
      if (e.target.closest('input, textarea, select')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); }
    };
    document.addEventListener('keydown', onKey);

    main.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { HM.houseMode = b.dataset.mode; try { localStorage.setItem('hm-house-mode', HM.houseMode); } catch (e) {} HM.render(); });
    $('#hb-version').onchange = e => { HM.state.activeVersionId = e.target.value; HM.select(null, null); HM.editorFloor = null; HM.save(); HM.render(); };
    $('#hb-floor').onchange = e => {
      if (e.target.value === '__new') { newFloor(); return; }
      HM.editorFloor = e.target.value; HM.select(null, null);
      if (st.editor) st.editor.fit();
      if (st.v3 && st.v3.floorId !== 'all') st.v3.setFloor(e.target.value);
      refreshProps();
    };
    $('#hb-more').onclick = () => moreMenu(st);

    ws = {
      st,
      destroy() { HM.selListeners.delete(onSel); HM.planListeners.delete(onPlan); document.removeEventListener('keydown', onKey); st.editor && st.editor.destroy(); st.v3 && st.v3.destroy(); ws = null; },
    };
    HM.leaveRoute = () => { ws && ws.destroy(); };
    HM.workspace = ws;
  }

  function newFloor() {
    const plan = HM.plan(); const top = plan.floors.slice().sort((a, b) => b.elevation - a.elevation)[0];
    const n = plan.floors.length;
    const names = ['Kjeller', '1. etasje', '2. etasje', 'Loft'];
    HM.modal({
      title: 'Ny etasje',
      body: `<div class="form-grid">
        ${HM.ui.field('Navn', HM.ui.input('nf_name', n === 1 ? '2. etasje' : (n + 1) + '. etasje'), 'wide')}
        ${HM.ui.field('Plassering', HM.ui.select('nf_pos', [['over', 'Over ' + top.name], ['under', 'Under laveste etasje (kjeller)']], 'over'))}
        ${HM.ui.field('Takhøyde (cm)', HM.ui.input('nf_h', '240', 'inputmode="decimal"'))}
      </div><label class="check"><input type="checkbox" id="nf_copy" checked> Kopier yttervegger fra etasjen under som utgangspunkt (merkes som anslått)</label>`,
      foot: `<button class="btn" data-close>Avbryt</button><button class="btn primary" id="nf_ok">Opprett</button>`,
      onMount: m => m.$('#nf_ok').onclick = () => {
        const v = HM.formValues(m.el); const h = HM.util.parseLen(v.nf_h, 'cm') || 2400;
        const id = uid('fl');
        HM.commitPlan(pl => {
          const fl = pl.floors.slice().sort((a, b) => a.elevation - b.elevation);
          const over = v.nf_pos === 'over';
          const ref = over ? fl[fl.length - 1] : fl[0];
          const slab = 250;
          const elevation = over ? ref.elevation + (ref.height || 2400) + slab : ref.elevation - h - slab;
          pl.floors.push({ id, name: v.nf_name || 'Etasje', elevation, height: h });
          if (m.$('#nf_copy').checked) {
            const walls = pl.walls.filter(w => w.floorId === ref.id && G.roomsOfWall(pl, w).length <= 1 && isExterior(pl, w));
            walls.forEach(w => pl.walls.push(Object.assign(JSON.parse(JSON.stringify(w)), { id: uid('w'), floorId: id, status: 'anslatt', confirmed: null, height: null, needsClarification: false, note: '' })));
          }
        });
        HM.editorFloor = id; m.close(); HM.render();
      },
    });
  }
  function isExterior(pl, w) {
    const d = G.wallDir(w), n = { x: -d.y, y: d.x }; const mid = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 }; const k = (w.t || 100) / 2 + 80;
    const rooms = pl.rooms.filter(r => r.floorId === w.floorId);
    const a = rooms.some(r => G.pointInPoly({ x: mid.x + n.x * k, y: mid.y + n.y * k }, r.pts)), b = rooms.some(r => G.pointInPoly({ x: mid.x - n.x * k, y: mid.y - n.y * k }, r.pts));
    return a !== b;
  }

  function quickRoom() {
    HM.modal({
      title: 'Lag rom fra mål',
      body: `<p class="small muted">Skriv inn innvendige mål. Målene du skriver inn her regnes som bekreftet.</p><div class="form-grid">
        ${HM.ui.field('Navn', HM.ui.input('qr_name', 'Stue'), 'wide')}
        ${HM.ui.field('Bredde', HM.ui.input('qr_w', '', 'placeholder="f.eks. 4,2 m" inputmode="decimal"'))}
        ${HM.ui.field('Lengde', HM.ui.input('qr_l', '', 'placeholder="f.eks. 360 cm" inputmode="decimal"'))}
        ${HM.ui.field('Takhøyde', HM.ui.input('qr_h', '240 cm', 'inputmode="decimal"'))}
        ${HM.ui.field('Veggtykkelse (mm)', HM.ui.input('qr_t', '100', 'inputmode="numeric"'))}
      </div><p class="tiny muted">Tall uten enhet over 20 leses som centimeter, ellers som meter.</p>`,
      foot: `<button class="btn" data-close>Avbryt</button><button class="btn primary" id="qr_ok">Lag rom</button>`,
      onMount: m => m.$('#qr_ok').onclick = () => {
        const v = HM.formValues(m.el);
        const smart = s => { const n = HM.util.num(s); if (/[a-z]/i.test(s)) return HM.util.parseLen(s, 'cm'); return n > 20 ? n * 10 : n * 1000; };
        const w = smart(v.qr_w), l = smart(v.qr_l), h = smart(v.qr_h), t = HM.util.num(v.qr_t) || 100;
        if (!(w > 500 && l > 500)) { HM.toast('Skriv inn bredde og lengde'); return; }
        HM.addRoomFromInner({ name: v.qr_name || 'Rom', w, l, ceiling: h > 1500 ? h : null, t, status: 'bekreftet' });
        m.close(); HM.go('huset', { mode: HM.houseMode });
      },
    });
  }
  HM.quickRoom = quickRoom;
  /** Legger til et rektangulært rom til høyre for eksisterende rom i aktiv etasje. */
  HM.addRoomFromInner = function ({ name, w, l, ceiling, t = 100, status = 'anslatt', floorId, props = {} }) {
    let rid;
    HM.commitPlan(pl => {
      const fid = floorId || HM.activeFloorId();
      const b = HM.planBounds(pl, fid);
      const x = b ? b.x1 + 1500 : 0, y = b ? b.y0 + t / 2 : 0;
      const r = G.addRoom(pl, fid, G.rectFromInner(x, y, w, l, t), Object.assign({ name, ceiling, status }, props), { t, status, confirmed: null });
      if (status === 'bekreftet') { r.walls.forEach(wl => wl.confirmed = { inner: Math.round(G.wallInner(wl)) }); r.room.confirmed = { w, l }; }
      rid = r.room.id;
    });
    HM.select('room', rid);
    return rid;
  };

  function openLibrary(onPick) {
    const cats = [...new Set(G.FURNITURE.map(f => f.cat))];
    HM.modal({
      title: 'Møbler og innredning',
      body: `<p class="small muted">Vanlige mål. Du kan endre målene etter at møbelet er plassert.</p>${cats.map(c => `<div><div class="label" style="margin-bottom:4px">${c}</div><div class="list">${G.FURNITURE.filter(f => f.cat === c).map(f => `<div class="row click" data-type="${f.type}"><span class="dot" style="background:${f.color};border:1px solid var(--line);width:16px;height:16px;border-radius:4px"></span><div class="grow"><div class="title">${esc(f.name)}</div></div><span class="mono small muted">${f.w / 10}×${f.d / 10}×${f.h / 10} cm</span></div>`).join('')}</div></div>`).join('')}`,
      onMount: m => m.$$('[data-type]').forEach(r => r.onclick = () => { const it = G.FURNITURE.find(f => f.type === r.dataset.type); m.close(); onPick(it); HM.toast('Trykk der ' + it.name.toLowerCase() + ' skal stå'); }),
    });
  }

  function moreMenu(st) {
    const ver = HM.version();
    HM.modal({
      title: 'Plantegning og modell',
      body: `<div class="list">
        <div class="row click" data-m="png">${icon('image')}<div class="grow"><div class="title">Eksporter plantegning som bilde (PNG)</div><div class="small muted">Aktiv etasje, med mål og målestokk</div></div></div>
        <div class="row click" data-m="pdf">${icon('download')}<div class="grow"><div class="title">Eksporter plantegning som PDF</div><div class="small muted">A4 liggende, alle etasjer</div></div></div>
        <div class="row click" data-m="versions">${icon('layers')}<div class="grow"><div class="title">Versjoner og forslag</div><div class="small muted">Kopier dagens hus til et nytt forslag</div></div></div>
        <div class="row click" data-m="quick">${icon('room')}<div class="grow"><div class="title">Lag rom fra mål</div></div></div>
        <div class="row click" data-m="import">${icon('upload')}<div class="grow"><div class="title">Last opp bilder eller plantegning</div></div></div>
        <div class="row click" data-m="merge">${icon('wall')}<div class="grow"><div class="title">Rydd overlappende vegger</div><div class="small muted">Slår sammen vegger som ligger oppå hverandre</div></div></div>
      </div><p class="disclaimer">Automatisk genererte tegninger og modeller er ikke godkjente byggtegninger. Bruk dem til visualisering og planlegging.</p>`,
      onMount: m => m.$$('[data-m]').forEach(r => r.onclick = async () => {
        const a = r.dataset.m; m.close();
        if (a === 'png') exportPNG();
        if (a === 'pdf') exportPDF();
        if (a === 'versions') HM.go('versjoner');
        if (a === 'quick') quickRoom();
        if (a === 'import') HM.go('importer');
        if (a === 'merge') { const ok = HM.commitPlan(pl => { let c = false; pl.floors.forEach(f => { c = G.mergeOverlaps(pl, f.id) || c; }); return c; }); HM.toast(ok ? 'Overlappende vegger er ryddet' : 'Fant ingen overlappende vegger'); }
      }),
    });
  }

  function planSheet(plan, fid, W, H, title) {
    const { canvas } = HM.renderPlanImage(plan, fid, W, H - 120, { pad: 90, grid: false });
    const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.drawImage(canvas, 0, 70);
    ctx.fillStyle = '#18231F'; ctx.font = '700 30px "Familjen Grotesk", sans-serif'; ctx.textAlign = 'left'; ctx.fillText(title, 40, 50);
    const rooms = plan.rooms.filter(r => r.floorId === fid); const tot = rooms.reduce((a, r) => a + G.roomNet(plan, r).area, 0);
    ctx.font = '500 16px "Hanken Grotesk", sans-serif'; ctx.fillStyle = '#5B6862';
    ctx.textAlign = 'right'; ctx.fillText(`${rooms.length} rom · netto ${fmtArea(tot)} · ${new Date().toLocaleDateString('nb-NO')}`, W - 40, 50);
    ctx.textAlign = 'left'; ctx.font = '500 14px "Hanken Grotesk", sans-serif';
    ctx.fillText('Mål med ≈ og stiplede vegger er anslått. Ikke godkjent byggtegning – kun for visualisering og planlegging.', 40, H - 22);
    return c;
  }
  async function exportPNG() {
    const plan = HM.plan(); const fid = HM.activeFloorId(); const f = byId(plan.floors, fid);
    const c = planSheet(plan, fid, 2400, 1700, `${HM.state.house.name} – ${f.name} (${HM.version().name})`);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    await HM.saveFile(`plantegning-${slug(f.name)}.png`, blob);
  }
  async function exportPDF() {
    try { await HM.loadLib('jspdf'); } catch (e) { HM.toast('PDF-biblioteket kunne ikke lastes. Sjekk nettforbindelsen.'); return; }
    const J = window.jspdf && window.jspdf.jsPDF; if (!J) { HM.toast('PDF-biblioteket kunne ikke lastes'); return; }
    const plan = HM.plan(); const doc = new J({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const floors = plan.floors.slice().sort((a, b) => a.elevation - b.elevation);
    floors.forEach((f, i) => {
      if (i) doc.addPage();
      const c = planSheet(plan, f.id, 2400, 1700, `${HM.state.house.name} – ${f.name} (${HM.version().name})`);
      doc.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', 8, 8, 281, 199);
    });
    const blob = doc.output('blob');
    await HM.saveFile(`plantegning-${slug(HM.state.house.name)}.pdf`, blob);
  }
  const slug = s => String(s).toLowerCase().replace(/[æ]/g, 'ae').replace(/[ø]/g, 'o').replace(/[å]/g, 'a').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  HM.slug = slug;
  HM.exportPlanPNG = exportPNG; HM.exportPlanPDF = exportPDF;
})();
