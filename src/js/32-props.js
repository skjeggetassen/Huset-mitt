/* Egenskapspanel for valgt rom, vegg, dør/vindu, trapp eller møbel – brukes både i plantegning og 3D. */
(function () {
  const G = HM.geo; const { esc, byId, fmtLen, fmtArea, fmtNum, parseLen, uid, num } = HM.util; const ui = HM.ui; const icon = HM.icon;

  const statusSel = (id, v) => ui.select(id, [['anslatt', 'Anslått'], ['materiale', 'Fra materialet'], ['bekreftet', 'Bekreftet']], v);
  const cmVal = mm => mm == null ? '' : fmtNum(mm / 10, mm % 10 ? 1 : 0);
  const lenInput = (id, mm, unit = 'cm', attrs = '') => `<input id="${id}" name="${id}" inputmode="decimal" value="${unit === 'cm' ? cmVal(mm) : unit === 'mm' ? Math.round(mm) : ''}" ${attrs}>`;

  function linkCounts(kind, id) {
    const s = HM.state;
    const docs = s.docs.filter(d => (d.elementRef && d.elementRef.id === id) || (kind === 'room' && d.roomId === id)).length;
    const projects = kind === 'room' ? s.projects.filter(p => (p.roomIds || []).includes(id)).length : 0;
    const photos = kind === 'room' ? s.media.filter(m => (m.roomIds || []).includes(id)).length : 0;
    return { docs, projects, photos };
  }

  HM.propsTitle = function () {
    const s = HM.sel; const plan = HM.plan();
    if (!s) { const f = byId(plan.floors, HM.activeFloorId()); return f ? f.name : 'Etasje'; }
    if (s.kind === 'room') { const r = byId(plan.rooms, s.id); return r ? r.name : 'Rom'; }
    if (s.kind === 'wall') return 'Vegg';
    if (s.kind === 'opening') { const o = byId(plan.openings, s.id); return o ? G.typeName(o.type) : 'Åpning'; }
    if (s.kind === 'stairs') return 'Trapp';
    if (s.kind === 'furniture') { const f = byId(plan.furniture, s.id); return f ? f.name : 'Møbel'; }
    return '';
  };

  /** Fyller el med skjema for valgt element og kobler opp hendelser. */
  HM.renderProps = function (el) {
    const s = HM.sel; const plan = HM.plan();
    let html = '';
    const obj = s && ({ room: plan.rooms, wall: plan.walls, opening: plan.openings, stairs: plan.stairs, furniture: plan.furniture }[s.kind] || []).find(x => x.id === s.id);
    if (s && !obj) { HM.sel = null; return HM.renderProps(el); }
    if (!s) html = floorPanel(plan);
    else if (s.kind === 'room') html = roomPanel(plan, obj);
    else if (s.kind === 'wall') html = wallPanel(plan, obj);
    else if (s.kind === 'opening') html = openingPanel(plan, obj);
    else if (s.kind === 'stairs') html = stairsPanel(obj);
    else if (s.kind === 'furniture') html = furniturePanel(obj);
    el.innerHTML = html;
    wire(el, plan, obj);
  };

  // ---------- Etasje ----------
  function floorPanel(plan) {
    const fid = HM.activeFloorId(); const f = byId(plan.floors, fid);
    const rooms = plan.rooms.filter(r => r.floorId === fid);
    const tot = rooms.reduce((a, r) => a + G.roomNet(plan, r).area, 0);
    const warns = G.validate(plan).filter(w => { const o = w.ref && (byId(plan.walls, w.ref.id) || byId(plan.rooms, w.ref.id) || (() => { const op = byId(plan.openings, w.ref.id); return op && byId(plan.walls, op.wallId); })()); return !o || o.floorId === fid; });
    const est = plan.walls.filter(w => w.floorId === fid && w.status !== 'bekreftet').length;
    const conf = plan.walls.filter(w => w.floorId === fid && w.status === 'bekreftet').length;
    return `
      ${est && !conf && plan.walls.length ? `<div class="notice warn">${icon('ruler')}<div><strong>Ingen mål er bekreftet ennå.</strong> Mål én vegg med tommestokk, trykk på veggen og skriv inn målet. Velg «Skaler hele etasjen» for å sette riktig skala. De andre målene forblir merket som anslått til du bekrefter dem.</div></div>` : ''}
      <div class="stat-row"><div class="stat"><div class="v">${rooms.length}</div><div class="k">Rom</div></div><div class="stat"><div class="v">${fmtArea(tot)}</div><div class="k">Netto gulvareal${est ? ' (≈)' : ''}</div></div></div>
      ${warns.length ? `<div class="warn-list"><div class="label">Kontroll av mål</div>${warns.slice(0, 12).map(w => `<button class="notice ${w.level === 'bad' ? 'bad' : w.level === 'warn' ? 'warn' : 'info'}" style="border:0;text-align:left;cursor:pointer" data-pick="${w.ref ? w.ref.kind + ':' + w.ref.id : ''}">${icon(w.level === 'info' ? 'info' : 'alert')}<span>${esc(w.text)}</span></button>`).join('')}${warns.length > 12 ? `<p class="small muted">… og ${warns.length - 12} til</p>` : ''}</div>` : (plan.walls.length ? `<div class="notice ok">${icon('check')}<div>Ingen målkonflikter funnet.</div></div>` : '')}
      ${rooms.length ? `<div><div class="label" style="margin-bottom:4px">Rom i ${esc(f.name)}</div><div class="list">${rooms.map(r => { const n = G.roomNet(plan, r); return `<div class="row click" data-pick="room:${r.id}"><div class="grow"><div class="title">${esc(r.name)}</div><div class="tiny muted">${n.isRect ? fmtLen(n.w) + ' × ' + fmtLen(n.l) : ''}</div></div><span class="num small">${fmtArea(n.area)}</span></div>`; }).join('')}</div></div>` : `<div class="empty"><strong>Ingen rom i ${esc(f.name)}</strong>Tegn et rom med rom-verktøyet, eller last opp bilder og la Claude foreslå.</div>`}
      <details><summary>Etasjeinnstillinger</summary><div class="form-grid" style="margin-top:10px">
        ${ui.field('Navn', ui.input('fl_name', f.name))}
        ${ui.field('Standard takhøyde (cm)', lenInput('fl_height', f.height))}
        ${ui.field('Nivå over 1. etasje (cm)', lenInput('fl_elev', f.elevation))}
      </div>
      <div class="btn-row" style="margin-top:10px">${plan.floors.length > 1 ? `<button class="btn sm danger" data-do="delfloor">${icon('trash')} Slett etasjen</button>` : ''}</div></details>
      <p class="disclaimer">Netto gulvareal er beregnet innvendig mellom veggene i tegningen. Det er ikke offisiell BRA, og automatisk genererte tegninger er ikke godkjente byggtegninger.</p>`;
  }

  // ---------- Rom ----------
  function roomPanel(plan, r) {
    const n = G.roomNet(plan, r); const c = G.roomCeiling(plan, r); const lc = linkCounts('room', r.id);
    const walls = plan.walls.filter(w => G.roomsOfWall(plan, w).includes(r));
    const allConf = walls.length && walls.every(w => w.status === 'bekreftet');
    return `
      <div class="btn-row">${ui.statusPill(allConf ? 'bekreftet' : r.status)} ${ui.flag(r.needsClarification)} ${r.source ? `<span class="pill">${r.source.importId ? 'Fra bildetolking' : ''}</span>` : ''}</div>
      <div class="stat-row">
        <div class="stat"><div class="v">${allConf ? '' : '≈ '}${fmtArea(n.area)}</div><div class="k">Gulvareal netto</div></div>
        ${n.isRect ? `<div class="stat"><div class="v" style="font-size:1rem">${fmtLen(n.w)} × ${fmtLen(n.l)}</div><div class="k">Innvendig</div></div>` : ''}
        <div class="stat"><div class="v" style="font-size:1rem">${fmtLen(c)}</div><div class="k">Takhøyde</div></div>
        <div class="stat"><div class="v" style="font-size:1rem">${fmtNum(n.area * c / 1e9, 1)} m³</div><div class="k">Volum</div></div>
      </div>
      ${r.source && r.source.evidence ? `<p class="small muted">Grunnlag fra bildetolking: ${esc(r.source.evidence)}</p>` : ''}
      <div class="form-grid">
        ${ui.field('Navn', ui.input('r_name', r.name), 'wide')}
        ${ui.field('Takhøyde (cm)', lenInput('r_ceiling', r.ceiling, 'cm', `placeholder="${cmVal(c)}"`))}
        ${ui.field('Status', statusSel('r_status', r.status))}
      </div>
      ${n.isRect ? `<div class="card" style="padding:12px;gap:8px;background:var(--surface-2);border:0">
        <div class="label">Sett innvendige mål</div>
        <div class="form-grid">${ui.field('Bredde (cm)', lenInput('r_w', n.w))}${ui.field('Lengde (cm)', lenInput('r_l', n.l))}</div>
        <button class="btn sm primary" data-do="roomdims">${icon('ruler')} Bruk og bekreft målene</button>
        <span class="tiny muted">Rom ved siden av flyttes med, slik at vinklene holdes rette.</span></div>` : ''}
      <div class="field"><span>Gulv</span>${ui.select('r_floor', Object.entries(G.FLOORS).map(([k, v]) => [k, v[0]]), r.floorFinish)}</div>
      <div class="field"><span>Veggfarge</span><div class="swatches">${G.WALL_COLORS.map(([nm, hex]) => `<button type="button" title="${esc(nm)}" aria-label="${esc(nm)}" aria-pressed="${(r.wallColor || '').toLowerCase() === hex.toLowerCase()}" data-color="${hex}" style="background:${hex}"></button>`).join('')}<input type="color" id="r_wallcolor" value="${r.wallColor || '#F2F0EA'}" aria-label="Egen farge" style="width:30px;height:30px;padding:0;border:0;background:none"></div></div>
      <label class="check"><input type="checkbox" id="r_flag" ${r.needsClarification ? 'checked' : ''}> Må avklares</label>
      ${ui.field('Notat', `<textarea id="r_notes" name="r_notes" placeholder="F.eks. skjevt gulv, mulig fukt – må sjekkes">${esc(r.notes || '')}</textarea>`)}
      <div class="btn-row">
        <button class="btn sm" data-act="go" data-to="rom" data-id="${r.id}">${icon('folder')} Romside</button>
        <span class="small muted">${lc.photos} bilder · ${lc.projects} prosjekter · ${lc.docs} dokumenter</span>
      </div>
      <div class="btn-row"><button class="btn sm" data-do="dupwalls">${icon('wall')} Lag manglende vegger</button><button class="btn sm danger" data-do="delete">${icon('trash')} Slett rommet</button></div>`;
  }

  // ---------- Vegg ----------
  function wallPanel(plan, w) {
    const L = G.wallLen(w); const inner = G.wallInner(w); const H = G.wallHeight(plan, w); const ops = G.openingsOf(plan, w.id); const lc = linkCounts('wall', w.id);
    return `
      <div class="btn-row">${ui.statusPill(w.status)} ${ui.flag(w.needsClarification)}</div>
      <div class="stat-row"><div class="stat"><div class="v" style="font-size:1.05rem">${fmtLen(inner, w.status !== 'bekreftet')}</div><div class="k">Innvendig lengde</div></div><div class="stat"><div class="v" style="font-size:1.05rem">${fmtLen(H)}</div><div class="k">Høyde${w.height ? '' : ' (fra rommet)'}</div></div></div>
      ${w.confirmed ? `<div class="notice ok">${icon('check')}<div>Bekreftet mål: <strong>${fmtLen(w.confirmed.inner)}</strong>. <button class="btn sm ghost" data-do="unconfirm">Fjern bekreftelse</button></div></div>` : ''}
      <div class="card" style="padding:12px;gap:8px;background:var(--surface-2);border:0">
        <div class="label">Skriv inn målt lengde</div>
        <div class="form-grid">${ui.field('Innvendig lengde (cm)', lenInput('w_len', null, 'cm', `placeholder="${cmVal(inner)}"`), '', 'Fra hjørne til hjørne, innvendig')}
        ${ui.field('Hvordan tilpasse', ui.select('w_mode', [['stretch', 'Strekk tegningen'], ['scale', 'Skaler hele etasjen etter dette målet'], ['corner', 'Flytt bare endepunktet']], 'stretch'))}</div>
        <button class="btn sm primary" data-do="confirmlen">${icon('check')} Bekreft mål</button>
        <span class="tiny muted">«Skaler hele etasjen» passer når alt er anslått fra bilder. De andre målene forblir merket som anslått.</span>
      </div>
      <div class="form-grid">
        ${ui.field('Tykkelse (mm)', lenInput('w_t', w.t, 'mm'))}
        ${ui.field('Høyde (cm)', lenInput('w_h', w.height, 'cm', `placeholder="auto: ${cmVal(H)}"`))}
        ${ui.field('Status', statusSel('w_status', w.status))}
      </div>
      <label class="check"><input type="checkbox" id="w_flag" ${w.needsClarification ? 'checked' : ''}> Må avklares (f.eks. om veggen er bærende)</label>
      ${ui.field('Notat', `<textarea id="w_note" name="w_note" placeholder="F.eks. «Bærende? Må avklares med fagperson»">${esc(w.note || '')}</textarea>`)}
      <p class="tiny muted">Appen avgjør ikke om en vegg er bærende, eller om et tiltak er lovlig eller teknisk forsvarlig. Merk slike forhold «Må avklares».</p>
      <div class="btn-row"><button class="btn sm" data-do="adddoor">${icon('door')} Dør her</button><button class="btn sm" data-do="addwindow">${icon('window')} Vindu her</button><button class="btn sm" data-do="addopening">${icon('opening')} Åpning</button></div>
      <div class="btn-row"><button class="btn sm" data-act="docsFor" data-kind="wall" data-id="${w.id}">${icon('book')} Dokumentasjon (${lc.docs})</button><button class="btn sm danger" data-do="delete">${icon('trash')} Slett veggen</button></div>
      <p class="tiny muted">${ops.length} åpning${ops.length === 1 ? '' : 'er'} · senterlinje ${fmtLen(L)}</p>`;
  }

  // ---------- Dør / vindu ----------
  function openingPanel(plan, o) {
    const w = byId(plan.walls, o.wallId); const L = G.wallLen(w); const lc = linkCounts('opening', o.id);
    const fromA = o.offset - o.width / 2 - (w.t || 0) / 2;
    return `
      <div class="btn-row">${ui.statusPill(o.status)} ${ui.flag(o.needsClarification)}</div>
      <div class="form-grid">
        ${ui.field('Type', ui.select('o_type', [['door', 'Dør'], ['window', 'Vindu'], ['opening', 'Åpning']], o.type))}
        ${ui.field('Bredde (cm)', lenInput('o_w', o.width))}
        ${ui.field('Høyde (cm)', lenInput('o_h', o.height))}
        ${o.type === 'window' ? ui.field('Brystning (cm)', lenInput('o_sill', o.sill), '', 'Fra gulv til underkant') : ''}
        ${ui.field('Avstand fra hjørnet (cm)', lenInput('o_from', fromA), '', 'Innvendig hjørne til kant')}
        ${ui.field('Status', statusSel('o_status', o.status))}
      </div>
      ${o.type === 'door' ? `<div class="btn-row"><button class="btn sm" data-do="hinge">${icon('flip')} Bytt hengselside</button><button class="btn sm" data-do="swing">${icon('rotate')} Bytt slagretning</button></div>` : ''}
      <label class="check"><input type="checkbox" id="o_flag" ${o.needsClarification ? 'checked' : ''}> Må avklares</label>
      ${ui.field('Notat / modell', `<textarea id="o_note" name="o_note" placeholder="F.eks. produsent, modell, karmmål">${esc(o.note || '')}</textarea>`)}
      <div class="btn-row"><button class="btn sm" data-act="docsFor" data-kind="opening" data-id="${o.id}">${icon('book')} Dokumentasjon (${lc.docs})</button><button class="btn sm danger" data-do="delete">${icon('trash')} Slett</button></div>
      <p class="tiny muted">Veggens lengde: ${fmtLen(G.wallInner(w))} innvendig.</p>`;
  }
  function stairsPanel(s) {
    return `<div class="form-grid">
      ${ui.field('Navn', ui.input('s_name', s.name || 'Trapp'), 'wide')}
      ${ui.field('Bredde (cm)', lenInput('s_w', s.w))}${ui.field('Lengde (cm)', lenInput('s_l', s.l))}
      ${ui.field('Antall trinn', ui.input('s_steps', s.steps || 15, 'inputmode="numeric"'))}${ui.field('Rotasjon (°)', ui.input('s_rot', s.rot || 0, 'inputmode="numeric"'))}
    </div><div class="btn-row"><button class="btn sm" data-do="rot90">${icon('rotate')} Roter 90°</button><button class="btn sm danger" data-do="delete">${icon('trash')} Slett</button></div>`;
  }
  function furniturePanel(f) {
    return `<div class="form-grid">
      ${ui.field('Navn', ui.input('f_name', f.name), 'wide')}
      ${ui.field('Bredde (cm)', lenInput('f_w', f.w))}${ui.field('Dybde (cm)', lenInput('f_d', f.d))}${ui.field('Høyde (cm)', lenInput('f_h', f.h))}
      ${ui.field('Over gulv (cm)', lenInput('f_elev', f.elev || 0))}${ui.field('Rotasjon (°)', ui.input('f_rot', f.rot || 0, 'inputmode="numeric"'))}
      ${ui.field('Farge', `<input type="color" id="f_color" name="f_color" value="${f.color || '#cccccc'}">`)}
    </div><div class="btn-row"><button class="btn sm" data-do="rot90">${icon('rotate')} Roter 90°</button><button class="btn sm" data-do="dup">${icon('copy')} Kopier</button><button class="btn sm danger" data-do="delete">${icon('trash')} Slett</button></div>
    <p class="tiny muted">Tips: dra i det runde håndtaket for å rotere.</p>`;
  }

  // ---------- Hendelser ----------
  function wire(el, plan, obj) {
    const s = HM.sel;
    const commit = fn => HM.commitPlan(pl => { const o = s ? ({ room: pl.rooms, wall: pl.walls, opening: pl.openings, stairs: pl.stairs, furniture: pl.furniture }[s.kind]).find(x => x.id === s.id) : null; return fn(pl, o); });
    const len = (id, unit = 'cm') => { const v = el.querySelector('#' + id); return v ? parseLen(v.value, unit) : null; };
    const on = (id, ev, fn) => { const x = el.querySelector('#' + id); if (x) x.addEventListener(ev, fn); };
    el.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => { const [k, id] = (b.dataset.pick || '').split(':'); if (k && id) HM.select(k, id, { zoom: true }); }));
    if (!s) {
      const fid = HM.activeFloorId();
      on('fl_name', 'change', e => HM.commitPlan(pl => { byId(pl.floors, fid).name = e.target.value.trim() || 'Etasje'; }));
      on('fl_height', 'change', () => { const v = len('fl_height'); if (v > 1000) HM.commitPlan(pl => { byId(pl.floors, fid).height = v; }); });
      on('fl_elev', 'change', () => { const v = len('fl_elev'); if (v != null) HM.commitPlan(pl => { byId(pl.floors, fid).elevation = v; }); });
      el.querySelector('[data-do="delfloor"]')?.addEventListener('click', async () => {
        const n = plan.rooms.filter(r => r.floorId === fid).length + plan.walls.filter(w => w.floorId === fid).length;
        if (n && !(await HM.confirm('Slette etasjen?', 'Alle rom og vegger i etasjen slettes fra denne versjonen. Du kan angre.', 'Slett etasjen'))) return;
        HM.commitPlan(pl => { const wids = pl.walls.filter(w => w.floorId === fid).map(w => w.id); pl.openings = pl.openings.filter(o => !wids.includes(o.wallId)); for (const k of ['walls', 'rooms', 'stairs', 'furniture']) pl[k] = pl[k].filter(x => x.floorId !== fid); pl.floors = pl.floors.filter(f => f.id !== fid); });
        HM.editorFloor = null; HM.emitPlanChanged({ floors: true });
      });
      return;
    }
    const doBtn = (name, fn) => el.querySelector(`[data-do="${name}"]`)?.addEventListener('click', fn);
    doBtn('delete', () => HM.deleteSelected());
    if (s.kind === 'room') {
      on('r_name', 'change', e => commit((pl, r) => { r.name = e.target.value.trim() || 'Rom'; }));
      on('r_ceiling', 'change', () => { const v = len('r_ceiling'); commit((pl, r) => { r.ceiling = v && v > 1000 ? v : null; }); });
      on('r_status', 'change', e => commit((pl, r) => { r.status = e.target.value; }));
      on('r_floor', 'change', e => commit((pl, r) => { r.floorFinish = e.target.value; }));
      on('r_flag', 'change', e => commit((pl, r) => { r.needsClarification = e.target.checked; }));
      on('r_notes', 'change', e => commit((pl, r) => { r.notes = e.target.value; }));
      on('r_wallcolor', 'change', e => commit((pl, r) => { r.wallColor = e.target.value; }));
      el.querySelectorAll('[data-color]').forEach(b => b.addEventListener('click', () => commit((pl, r) => { r.wallColor = b.dataset.color; })));
      doBtn('roomdims', () => {
        const tw = len('r_w'), tl = len('r_l'); if (!(tw > 300) || !(tl > 300)) { HM.toast('Skriv inn bredde og lengde, f.eks. 360 eller 3,6 m'); return; }
        commit((pl, r) => HM.setRoomInner(pl, r, tw, tl));
        HM.toast('Målene er satt og bekreftet');
      });
      doBtn('dupwalls', () => { const ok = commit((pl, r) => { G.addWallsForPolygon(pl, r.floorId, r.pts, { status: r.status }); }); HM.toast(ok ? 'Manglende vegger er lagt til' : 'Rommet har allerede vegger på alle sider'); });
    }
    if (s.kind === 'wall') {
      doBtn('confirmlen', () => {
        const v = len('w_len'); const mode = el.querySelector('#w_mode').value;
        if (!(v > 50)) { HM.toast('Skriv inn målt lengde, f.eks. 345 (cm) eller 3,45 m'); return; }
        commit((pl, w) => { G.setWallLength(pl, w, v + (w.t || 0), mode); w.status = 'bekreftet'; w.confirmed = { inner: Math.round(v), at: new Date().toISOString() }; });
        HM.toast(mode === 'scale' ? 'Etasjen er skalert. Andre mål er fortsatt anslått.' : 'Målet er bekreftet');
      });
      doBtn('unconfirm', () => commit((pl, w) => { w.confirmed = null; w.status = 'anslatt'; }));
      on('w_t', 'change', () => { const v = len('w_t', 'mm'); if (v >= 30 && v <= 1000) commit((pl, w) => { w.t = Math.round(v); }); });
      on('w_h', 'change', () => { const v = len('w_h'); commit((pl, w) => { w.height = v && v > 500 ? v : null; }); });
      on('w_status', 'change', e => commit((pl, w) => { w.status = e.target.value; if (e.target.value !== 'bekreftet') w.confirmed = null; else if (!w.confirmed) w.confirmed = { inner: Math.round(G.wallInner(w)) }; }));
      on('w_flag', 'change', e => commit((pl, w) => { w.needsClarification = e.target.checked; if (e.target.checked && !w.note) w.note = 'Bærende? Må avklares med fagperson.'; }));
      on('w_note', 'change', e => commit((pl, w) => { w.note = e.target.value; }));
      for (const t of ['door', 'window', 'opening']) doBtn('add' + t, () => {
        const w = obj; const L = G.wallLen(w); const def = { door: [900, 2100, 0], window: [1200, 1200, 900], opening: [900, 2100, 0] }[t];
        const width = Math.min(def[0], L - 60); if (width < 300) { HM.toast('Veggen er for kort'); return; }
        // finn ledig plass
        const ops = G.openingsOf(plan, w.id); let off = L / 2;
        for (const cand of [L / 2, L / 4, (3 * L) / 4, L / 3, (2 * L) / 3]) { if (ops.every(o => Math.abs(o.offset - cand) > (o.width + width) / 2 + 50)) { off = cand; break; } }
        const id = uid('op');
        HM.commitPlan(pl => pl.openings.push({ id, wallId: w.id, type: t, offset: Math.round(off), width, height: def[1], sill: def[2], hinge: 'a', swing: 1, status: 'anslatt', needsClarification: false, note: '' }));
        HM.select('opening', id);
      });
    }
    if (s.kind === 'opening') {
      on('o_type', 'change', e => commit((pl, o) => { o.type = e.target.value; if (o.type === 'window') { o.sill = o.sill || 900; o.height = Math.min(o.height, 1400); } else { o.sill = 0; o.height = Math.max(o.height, 2000); } }));
      on('o_w', 'change', () => { const v = len('o_w'); if (v >= 200) commit((pl, o) => { o.width = Math.round(v); }); });
      on('o_h', 'change', () => { const v = len('o_h'); if (v >= 200) commit((pl, o) => { o.height = Math.round(v); }); });
      on('o_sill', 'change', () => { const v = len('o_sill'); if (v != null) commit((pl, o) => { o.sill = Math.round(v); }); });
      on('o_from', 'change', () => { const v = len('o_from'); if (v != null) commit((pl, o) => { const w = byId(pl.walls, o.wallId); o.offset = Math.max(o.width / 2, Math.min(G.wallLen(w) - o.width / 2, v + o.width / 2 + (w.t || 0) / 2)); }); });
      on('o_status', 'change', e => commit((pl, o) => { o.status = e.target.value; }));
      on('o_flag', 'change', e => commit((pl, o) => { o.needsClarification = e.target.checked; }));
      on('o_note', 'change', e => commit((pl, o) => { o.note = e.target.value; }));
      doBtn('hinge', () => commit((pl, o) => { o.hinge = o.hinge === 'b' ? 'a' : 'b'; }));
      doBtn('swing', () => commit((pl, o) => { o.swing = o.swing === -1 ? 1 : -1; }));
    }
    if (s.kind === 'stairs') {
      on('s_name', 'change', e => commit((pl, o) => { o.name = e.target.value; }));
      on('s_w', 'change', () => { const v = len('s_w'); if (v > 300) commit((pl, o) => { o.w = v; }); });
      on('s_l', 'change', () => { const v = len('s_l'); if (v > 500) commit((pl, o) => { o.l = v; }); });
      on('s_steps', 'change', e => { const v = Math.round(num(e.target.value)); if (v > 1 && v < 40) commit((pl, o) => { o.steps = v; }); });
      on('s_rot', 'change', e => commit((pl, o) => { o.rot = ((num(e.target.value) % 360) + 360) % 360; }));
      doBtn('rot90', () => commit((pl, o) => { o.rot = ((o.rot || 0) + 90) % 360; }));
    }
    if (s.kind === 'furniture') {
      on('f_name', 'change', e => commit((pl, o) => { o.name = e.target.value; }));
      for (const k of ['w', 'd', 'h']) on('f_' + k, 'change', () => { const v = len('f_' + k); if (v > 20) commit((pl, o) => { o[k] = Math.round(v); }); });
      on('f_elev', 'change', () => { const v = len('f_elev'); if (v != null) commit((pl, o) => { o.elev = Math.round(v); }); });
      on('f_rot', 'change', e => commit((pl, o) => { o.rot = ((num(e.target.value) % 360) + 360) % 360; }));
      on('f_color', 'change', e => commit((pl, o) => { o.color = e.target.value; }));
      doBtn('rot90', () => commit((pl, o) => { o.rot = ((o.rot || 0) + 90) % 360; }));
      doBtn('dup', () => { const id = uid('mb'); HM.commitPlan(pl => { const o = byId(pl.furniture, s.id); pl.furniture.push(Object.assign({}, o, { id, x: o.x + 300, y: o.y + 300 })); }); HM.select('furniture', id); });
    }
  }

  /** Setter innvendig bredde/lengde på et rektangulært rom ved å strekke tegningen. */
  HM.setRoomInner = function (pl, r, tw, tl) {
    for (let pass = 0; pass < 2; pass++) {
      const n = G.roomNet(pl, r); if (!n.isRect) return false;
      const e = pass === 0 ? [n.inner[0], n.inner[1]] : [n.inner[1], n.inner[2]];
      const target = pass === 0 ? tw : tl; const cur = pass === 0 ? n.w : n.l;
      const dx = e[1].x - e[0].x, dy = e[1].y - e[0].y; const horiz = Math.abs(dx) > Math.abs(dy);
      const axis = horiz ? 'x' : 'y'; const max = Math.max(...r.pts.map(p => p[axis]));
      if (Math.abs(target - cur) > 0.5) G.stretch(pl, r.floorId, axis, max, target - cur, 1);
    }
    const n2 = G.roomNet(pl, r);
    // bekreft vegger som dekker nøyaktig en side av rommet
    r.pts.forEach((p, i) => { const q = r.pts[(i + 1) % r.pts.length]; const w = G.edgeWall(pl, r.floorId, p, q); if (w && Math.abs(G.wallLen(w) - G.dist(p, q)) < 5) { w.status = 'bekreftet'; w.confirmed = { inner: Math.round(G.wallInner(w)), at: new Date().toISOString() }; } });
    r.confirmed = { w: Math.round(n2.w), l: Math.round(n2.l) }; r.status = 'bekreftet';
    return true;
  };
})();
