/* Versjoner (dagens hus og forslag) og romside. */
(function () {
  const G = HM.geo; const { esc, byId, uid, fmtLen, fmtArea, fmtDate, clone } = HM.util; const icon = HM.icon; const ui = HM.ui;

  function stats(plan) {
    const area = plan.rooms.reduce((a, r) => a + G.roomNet(plan, r).area, 0);
    return { rooms: plan.rooms.length, area, doors: plan.openings.filter(o => o.type === 'door').length, windows: plan.openings.filter(o => o.type === 'window').length, walls: plan.walls.length, floors: plan.floors.length };
  }
  function diffText(a, b) {
    const sa = stats(a), sb = stats(b); const out = [];
    const d = (k, label) => { const x = sb[k] - sa[k]; if (x) out.push(`${x > 0 ? '+' : ''}${x} ${label}`); };
    d('rooms', 'rom'); d('doors', 'dører'); d('windows', 'vinduer'); d('walls', 'vegger'); d('floors', 'etasjer');
    const da = sb.area - sa.area; if (Math.abs(da) > 0.05e6) out.push(`${da > 0 ? '+' : ''}${fmtArea(da)} gulvareal`);
    // endrede rom (samme id, ulik størrelse/overflate)
    const changed = b.rooms.filter(r => { const o = byId(a.rooms, r.id); if (!o) return false; return JSON.stringify(o.pts) !== JSON.stringify(r.pts) || o.floorFinish !== r.floorFinish || o.wallColor !== r.wallColor || o.ceiling !== r.ceiling; });
    if (changed.length) out.push(`endret: ${changed.map(r => r.name).join(', ')}`);
    const movedOps = b.openings.filter(o => { const x = byId(a.openings, o.id); return x && (x.offset !== o.offset || x.width !== o.width || x.wallId !== o.wallId || x.type !== o.type); }).length;
    if (movedOps) out.push(`${movedOps} dør/vindu flyttet eller endret`);
    return out.length ? out.join(' · ') : 'Ingen endringer i plantegningen ennå';
  }
  HM.versionDiff = diffText;

  HM.views.versjoner = function (main) {
    const st = HM.state; const cur = HM.currentVersion();
    main.innerHTML = `<div class="page">
      <div class="page-head"><div><h1>Dagens hus og forslag</h1><p class="muted">Dagens hus bevares. Lag separate forslag, endre dem og sammenlign før og etter fra samme kameravinkel.</p></div>
      <button class="btn primary" data-act="newVersion" data-from="${cur.id}">${icon('copy')} Nytt forslag fra dagens hus</button></div>
      <div class="grid">${st.versions.slice().sort((a, b) => (a.kind === 'current' ? -1 : b.kind === 'current' ? 1 : (a.kind === 'historikk') - (b.kind === 'historikk'))).map(v => {
        const s = stats(v.plan); const projs = st.projects.filter(p => p.versionId === v.id);
        return `<div class="card">
          <div class="card-head"><div style="min-width:0"><div class="label">${v.kind === 'current' ? 'Dagens hus' : v.kind === 'historikk' ? 'Historikk' : 'Forslag'}</div><h3>${esc(v.name)}</h3></div>${v.id === st.activeVersionId ? '<span class="pill acc">Åpen nå</span>' : ''}</div>
          ${v.description ? `<p class="small muted">${esc(v.description)}</p>` : ''}
          <div class="small">${s.rooms} rom · ${fmtArea(s.area)} · ${s.doors} dører · ${s.windows} vinduer</div>
          ${v.kind !== 'current' ? `<div class="small muted">Mot dagens hus: ${esc(diffText(cur.plan, v.plan))}</div>` : ''}
          ${projs.length ? `<div class="small">Prosjekter: ${projs.map(p => `<a href="#" data-act="go" data-to="prosjekt" data-id="${p.id}">${esc(p.name)}</a>`).join(', ')}</div>` : ''}
          <div class="tiny muted">${v.basedOn ? `Kopiert fra ${esc((byId(st.versions, v.basedOn) || {}).name || 'slettet versjon')} · ` : ''}Opprettet ${fmtDate(v.createdAt.slice(0, 10))}</div>
          <div class="btn-row">
            <button class="btn sm" data-act="openVersion" data-id="${v.id}" data-mode="plan">${icon('plan')} Plan</button>
            <button class="btn sm" data-act="openVersion" data-id="${v.id}" data-mode="3d">${icon('cube')} 3D</button>
            ${v.kind !== 'current' ? `<button class="btn sm" data-act="compareVersion" data-id="${v.id}">${icon('compare')} Før/etter</button>` : ''}
            <button class="btn sm ghost" data-act="newVersion" data-from="${v.id}">${icon('copy')} Kopier</button>
            <button class="btn sm ghost" data-act="editVersion" data-id="${v.id}">${icon('edit')} Endre</button>
          </div></div>`;
      }).join('')}</div>
      <p class="disclaimer">Planlagte endringer i et forslag overskriver aldri dagens hus. Koble et forslag til et oppussingsprosjekt for å planlegge oppgaver, kostnader og datoer.</p>
    </div>`;
  };
  HM.actions.openVersion = el => { HM.state.activeVersionId = el.dataset.id; HM.editorFloor = null; HM.select(null, null); HM.save(); HM.go('huset', { mode: el.dataset.mode }); };
  HM.actions.compareVersion = el => { HM.state.activeVersionId = HM.currentVersion().id; HM.pendingCompare = el.dataset.id; HM.save(); HM.go('huset', { mode: '3d' }); };
  HM.actions.newVersion = el => {
    const from = byId(HM.state.versions, el.dataset.from) || HM.currentVersion();
    HM.modal({
      title: 'Nytt forslag',
      body: `<div class="form-grid">${ui.field('Navn', ui.input('nv_name', '', 'placeholder="F.eks. Nytt kjøkken"'), 'wide')}${ui.field('Beskrivelse', `<textarea id="nv_desc" name="nv_desc" placeholder="Hva vil du prøve ut?"></textarea>`, 'wide')}</div>
        <p class="small muted">Forslaget blir en kopi av «${esc(from.name)}». Endringer i forslaget påvirker ikke originalen.</p>
        <div class="btn-row">${['Nytt kjøkken', 'Flytte dør', 'Nye vinduer', 'Nytt tak og takrenner', 'Terrasse', 'Nye farger og gulv'].map(s => `<button class="btn sm ghost" data-sug="${s}">${s}</button>`).join('')}</div>`,
      foot: `<button class="btn" data-close>Avbryt</button><button class="btn primary" id="nv_ok">Lag forslag</button>`,
      onMount: m => {
        m.$$('[data-sug]').forEach(b => b.onclick = () => { m.$('#nv_name').value = b.dataset.sug; });
        m.$('#nv_ok').onclick = () => {
          const name = m.$('#nv_name').value.trim(); if (!name) { HM.toast('Gi forslaget et navn'); return; }
          const v = { id: uid('ver'), name, kind: 'proposal', createdAt: new Date().toISOString(), basedOn: from.id, description: m.$('#nv_desc').value.trim(), plan: clone(from.plan) };
          HM.state.versions.push(v); HM.state.activeVersionId = v.id; HM.save(); m.close();
          HM.toast('Forslaget er laget. Du redigerer nå forslaget.');
          HM.go('huset', { mode: HM.houseMode });
        };
      },
    });
  };
  HM.actions.editVersion = el => {
    const v = byId(HM.state.versions, el.dataset.id); if (!v) return;
    HM.modal({
      title: 'Endre versjon',
      body: `<div class="form-grid">${ui.field('Navn', ui.input('ev_name', v.name), 'wide')}${ui.field('Beskrivelse', `<textarea id="ev_desc" name="ev_desc">${esc(v.description || '')}</textarea>`, 'wide')}</div>
        ${v.kind === 'proposal' ? `<div class="notice info">${icon('info')}<div>Når arbeidet er gjennomført, kan du gjøre forslaget til dagens hus. Det gamle «Dagens hus» tas vare på som historikk.</div></div>` : ''}`,
      foot: `${v.kind !== 'current' ? `<button class="btn danger" id="ev_del">${icon('trash')} Slett</button>` : ''}${v.kind === 'proposal' ? `<button class="btn" id="ev_cur">Gjør til dagens hus</button>` : ''}<button class="btn primary" id="ev_ok">Lagre</button>`,
      onMount: m => {
        m.$('#ev_ok').onclick = () => { v.name = m.$('#ev_name').value.trim() || v.name; v.description = m.$('#ev_desc').value.trim(); HM.save(); m.close(); HM.render(); };
        m.$('#ev_del') && (m.$('#ev_del').onclick = async () => {
          if (!(await HM.confirm('Slette versjonen?', `«${esc(v.name)}» slettes for godt. Prosjekter som er koblet til den beholdes.`, 'Slett'))) return;
          HM.state.versions = HM.state.versions.filter(x => x.id !== v.id);
          HM.state.projects.forEach(p => { if (p.versionId === v.id) p.versionId = null; });
          if (HM.state.activeVersionId === v.id) HM.state.activeVersionId = HM.currentVersion().id;
          HM.save(); m.close(); HM.render();
        });
        m.$('#ev_cur') && (m.$('#ev_cur').onclick = async () => {
          if (!(await HM.confirm('Gjøre forslaget til dagens hus?', `«${esc(v.name)}» blir dagens hus. Nåværende «Dagens hus» lagres som historikk med dagens dato.`, 'Gjør til dagens hus', false))) return;
          const old = HM.currentVersion(); old.kind = 'historikk'; old.name = `${old.name} (før ${new Date().toLocaleDateString('nb-NO')})`;
          v.kind = 'current'; HM.state.activeVersionId = v.id; HM.save(); m.close(); HM.render();
        });
      },
    });
  };

  // ---------- Romside ----------
  function findRoom(id) { for (const v of HM.state.versions) { const r = byId(v.plan.rooms, id); if (r) return { r, v }; } return null; }
  HM.findRoom = findRoom;
  HM.roomName = id => { const f = findRoom(id); return f ? f.r.name : 'Slettet rom'; };
  HM.allRooms = () => { const v = HM.currentVersion(); return v.plan.rooms.map(r => ({ id: r.id, name: r.name, floor: (byId(v.plan.floors, r.floorId) || {}).name })); };

  HM.views.rom = function (main, params) {
    const f = findRoom(params.id);
    if (!f) { main.innerHTML = `<div class="page">${ui.empty('Rommet finnes ikke lenger', 'Det kan være slettet fra plantegningen.', `<button class="btn" data-act="go" data-to="huset">Til huset</button>`)}</div>`; return; }
    const { r, v } = f; const plan = v.plan; const st = HM.state;
    const net = G.roomNet(plan, r); const floor = byId(plan.floors, r.floorId);
    const photos = st.media.filter(m => (m.roomIds || []).includes(r.id));
    const projects = st.projects.filter(p => (p.roomIds || []).includes(r.id));
    const wallIds = plan.walls.filter(w => G.roomsOfWall(plan, w).includes(r)).map(w => w.id);
    const elemIds = new Set([...wallIds, ...plan.openings.filter(o => wallIds.includes(o.wallId)).map(o => o.id)]);
    const docs = st.docs.filter(d => d.roomId === r.id || (d.elementRef && elemIds.has(d.elementRef.id)));
    const maint = st.maintenance.filter(m => m.roomId === r.id);
    const lists = st.checklists.filter(c => c.roomId === r.id);
    main.innerHTML = `<div class="page">
      <div class="page-head"><div><div class="label">${esc(floor ? floor.name : '')} · ${esc(v.name)}</div><h1>${esc(r.name)}</h1></div>
        <div class="btn-row"><button class="btn" data-act="showInPlan" data-id="${r.id}" data-ver="${v.id}">${icon('plan')} Vis i plantegning</button><button class="btn" data-act="walkRoom" data-id="${r.id}" data-ver="${v.id}">${icon('walk')} Gå inn i rommet</button></div></div>
      <div class="stat-row">
        <div class="stat"><div class="v">${r.status === 'bekreftet' ? '' : '≈ '}${fmtArea(net.area)}</div><div class="k">Gulvareal netto</div></div>
        ${net.isRect ? `<div class="stat"><div class="v">${fmtLen(net.w)} × ${fmtLen(net.l)}</div><div class="k">Innvendige mål</div></div>` : ''}
        <div class="stat"><div class="v">${fmtLen(G.roomCeiling(plan, r))}</div><div class="k">Takhøyde</div></div>
        <div class="stat"><div class="v">${esc((G.FLOORS[r.floorFinish] || ['–'])[0])}</div><div class="k">Gulv</div></div>
      </div>
      ${r.needsClarification || r.notes ? `<div class="notice ${r.needsClarification ? 'bad' : ''}">${icon(r.needsClarification ? 'flag' : 'info')}<div>${r.needsClarification ? '<strong>Må avklares.</strong> ' : ''}${esc(r.notes || '')}</div></div>` : ''}
      <div class="grid-2">
        <div class="card"><div class="card-head"><h2>Bilder</h2><label class="btn sm">${icon('camera')} Legg til<input type="file" accept="image/*" multiple hidden id="room-photo"></label></div>
          ${photos.length ? `<div class="thumbs">${photos.map(m => `<a class="thumb" href="#" data-blob-href="${m.blobId}" target="_blank" rel="noopener"><img data-blob="${m.blobId}" alt="${esc(m.name)}"><span class="cap">${esc((m.tags || []).join(', ') || m.kind)}</span></a>`).join('')}</div>` : ui.empty('Ingen bilder', 'Legg til bilder av rommet. Bilder av skjulte installasjoner før vegger lukkes er spesielt nyttige.')}
        </div>
        <div class="card"><div class="card-head"><h2>Prosjekter</h2><button class="btn sm" data-act="newProject" data-room="${r.id}">${icon('plus')} Nytt prosjekt</button></div>
          ${projects.length ? `<div class="list">${projects.map(p => HM.projectRow(p)).join('')}</div>` : ui.empty('Ingen prosjekter', 'Knytt et oppussingsprosjekt til rommet.')}
        </div>
        <div class="card"><div class="card-head"><h2>Dokumentasjon</h2><button class="btn sm" data-act="newDoc" data-room="${r.id}">${icon('plus')} Ny</button></div>
          ${docs.length ? `<div class="list">${docs.map(d => HM.docRow(d)).join('')}</div>` : ui.empty('Ingen dokumentasjon', 'F.eks. fargekode, gulvtype, produktark eller garanti.')}
        </div>
        <div class="card"><div class="card-head"><h2>Vedlikehold og huskelister</h2><button class="btn sm" data-act="newChecklist" data-room="${r.id}">${icon('plus')} Huskeliste</button></div>
          ${maint.map(m => `<div class="row"><div class="grow"><div class="title">${esc(m.title)}</div><div class="small muted">Neste: ${fmtDate(HM.maintNext(m))}</div></div></div>`).join('')}
          ${lists.map(c => HM.checklistHtml(c)).join('')}
          ${!maint.length && !lists.length ? ui.empty('Ingenting her ennå', 'Legg til en huskeliste for rommet.') : ''}
        </div>
      </div>
    </div>`;
    const inp = main.querySelector('#room-photo');
    inp.onchange = async () => { for (const file of inp.files) await HM.addMedia(file, { kind: 'foto', roomIds: [r.id] }); HM.toast('Bildet er lagret'); HM.render(); };
    HM.wireChecklists && HM.wireChecklists(main);
  };
  HM.actions.showInPlan = el => { HM.state.activeVersionId = el.dataset.ver; const f = findRoom(el.dataset.id); if (f) HM.editorFloor = f.r.floorId; HM.save(); HM.go('huset', { mode: HM.houseMode === '3d' ? 'plan' : HM.houseMode }); setTimeout(() => HM.select('room', el.dataset.id, { zoom: true }), 100); };
  HM.actions.walkRoom = el => { HM.state.activeVersionId = el.dataset.ver; HM.save(); HM.pendingWalk = el.dataset.id; HM.go('huset', { mode: HM.houseMode === 'plan' ? '3d' : HM.houseMode }); };
})();
