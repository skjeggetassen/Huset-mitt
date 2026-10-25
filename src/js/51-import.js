/* Opprett huset fra bilder: last opp, la Claude tolke, gå gjennom forslaget og legg det inn i modellen. */
(function () {
  const G = HM.geo; const { esc, byId, uid, fmtLen, fmtArea, fmtDate } = HM.util; const icon = HM.icon; const ui = HM.ui;
  const KINDS = [['innvendig', 'Bilde innvendig'], ['utvendig', 'Bilde utvendig'], ['plantegning', 'Plantegning'], ['skisse', 'Håndtegnet skisse']];
  const SRC = { lest: ['src', 'Lest i materialet'], skalert: ['est', 'Skalert fra kjent mål'], anslatt: ['est', 'Anslått'], ukjent: ['bad', 'Ukjent'] };
  const imp = { items: [], known: '', note: '', running: false, result: null, error: null, ctl: null, mediaIds: [], importId: null, streamLen: 0 };
  HM.importState = imp;

  HM.views.importer = function (main) {
    const st = HM.state; const plan = HM.plan();
    const maxN = HM.ai.source() ? HM.ai.maxImages() : 0;
    const imgCount = imp.items.reduce((a, it) => a + (it.pages || 1), 0);
    main.innerHTML = `<div class="page">
      <div class="page-head"><div><div class="label">Steg 1 av hovedflyten</div><h1>Opprett huset fra bilder</h1><p class="muted">Last opp bilder av rom, en plantegning eller en skisse med mål. Claude foreslår rom, vegger, dører og vinduer, og viser hva som er lest, anslått eller ukjent.</p></div></div>
      ${HM.ai.statusHtml()}
      ${imp.result ? reviewHtml(imp.result) : `
      <div class="card">
        <label class="drop" id="drop">${icon('upload')}<div><strong>Velg bilder eller PDF</strong><div class="small muted">Flere bilder av samme rom fra ulike vinkler gir bedre resultat</div></div>
          <input type="file" id="imp-files" accept="image/*,application/pdf" multiple hidden><span class="btn primary">${icon('camera')} Ta bilde eller velg filer</span></label>
        ${imp.items.length ? `<div class="list">${imp.items.map((it, i) => `<div class="row" style="flex-wrap:wrap">
            <div class="thumb" style="width:64px;flex:none">${it.url ? `<img src="${it.url}" alt="">` : `<div class="thumb file">PDF<br>${it.pages || '?'} s.</div>`}</div>
            <div class="grow" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px">
              <label class="field"><span>Hva viser bildet?</span>${ui.select('k' + i, KINDS, it.kind, `data-i="${i}" data-f="kind"`)}</label>
              <label class="field"><span>Hvilket rom? (valgfritt)</span><input value="${esc(it.room || '')}" data-i="${i}" data-f="room" placeholder="F.eks. kjøkken"></label>
            </div>
            <button class="btn icon ghost" data-rm="${i}" aria-label="Fjern">${icon('trash')}</button></div>`).join('')}</div>` : ''}
        <div class="form-grid">
          ${ui.field('Ett kjent mål (anbefalt)', `<input id="imp-known" value="${esc(imp.known)}" placeholder="F.eks. «Døra inn til stua er 90 cm bred»">`, 'wide', 'Brukes til å sette skala. Andre mål blir fortsatt merket som anslått.')}
          ${ui.field('Beskrivelse (valgfritt)', `<input id="imp-note" value="${esc(imp.note)}" placeholder="F.eks. «Enebolig fra 1978, dette er 1. etasje»">`, 'wide')}
          ${ui.field('Legg inn i', ui.select('imp-floor', plan.floors.map(f => [f.id, `${HM.version().name} – ${f.name}`]), HM.activeFloorId()), 'wide')}
        </div>
        ${maxN && imgCount > maxN ? `<div class="notice warn">${icon('alert')}<div>Claude kan se på ${maxN} bilder om gangen her. Fjern noen, eller del opp i flere runder (ett rom om gangen fungerer godt).</div></div>` : ''}
        ${imp.error ? `<div class="notice bad">${icon('alert')}<div>${esc(imp.error)}</div></div>` : ''}
        ${imp.running ? `<div class="ai-box"><strong>Claude ser på materialet …</strong><div class="progress-line"></div><span class="small muted">Dette tar vanligvis 20 sekunder til 2 minutter. ${imp.streamLen ? 'Svaret skrives nå.' : ''}</span><div><button class="btn sm" id="imp-stop">Stopp</button></div></div>` : `
        <div class="btn-row"><button class="btn primary" id="imp-run" ${!imp.items.length || !HM.ai.source() || (maxN && imgCount > maxN) ? 'disabled' : ''}>${icon('sparkle')} Tolk materialet</button><button class="btn" id="imp-manual">${icon('room')} Tegn rommet selv</button></div>`}
        <p class="tiny muted">Bildene lagres privat i nettleseren på denne enheten og sendes til Claude bare når du trykker «Tolk materialet». Ta sikkerhetskopi under Innstillinger.</p>
      </div>`}
      ${historyHtml()}
    </div>`;
    wire(main);
  };

  function historyHtml() {
    const list = HM.state.imports.slice().reverse();
    if (!list.length) return '';
    return `<div class="card"><h2>Tidligere tolkinger</h2><div class="list">${list.map(r => `<div class="row"><div class="grow"><div class="title">${fmtDate(r.createdAt.slice(0, 10))} · ${(r.result && r.result.rooms || []).length} rom foreslått · ${(r.appliedRoomIds || []).length} lagt inn</div><div class="small muted">${esc((r.result && r.result.summary) || '')}</div>
      ${r.result && r.result.requests && r.result.requests.length ? `<details style="margin-top:4px"><summary class="small">Ekstra bilder og mål som ble etterspurt</summary><ul class="small">${r.result.requests.map(q => `<li>${esc(q.what)}${q.why ? ` <span class="muted">– ${esc(q.why)}</span>` : ''}</li>`).join('')}</ul></details>` : ''}</div></div>`).join('')}</div></div>`;
  }

  function reviewHtml(r) {
    const rooms = r.rooms || [];
    return `<div class="card">
      <div class="card-head"><h2>Forslag fra Claude</h2><button class="btn sm ghost" id="imp-discard">${icon('x')} Forkast</button></div>
      <p>${esc(r.summary || '')}</p>
      <div class="notice info">${icon('info')}<div>Ingenting er lagt inn ennå. Velg hvilke rom du vil ta med. Mål merket <span class="pill src">Lest i materialet</span> står i materialet. <span class="pill est">Anslått</span> og <span class="pill est">Skalert</span> er beregnet og må kontrolleres. Ingen mål regnes som bekreftet før du har målt dem selv.</div></div>
      ${rooms.length ? `<div class="list">${rooms.map((rm, i) => { const s = SRC[rm.dimension_source] || SRC.ukjent; const ops = (r.openings || []).filter(o => o.room === rm.name); return `<div class="row" style="align-items:flex-start">
        <input type="checkbox" class="rm-pick" data-i="${i}" ${rm.partial && !rm.width_mm ? '' : 'checked'} style="width:20px;height:20px;margin-top:6px;accent-color:var(--accent)" aria-label="Ta med ${esc(rm.name)}">
        <div class="grow" style="display:flex;flex-direction:column;gap:4px">
          <div class="btn-row"><input class="input rm-name" data-i="${i}" value="${esc(rm.name)}" style="max-width:220px;font-weight:600"><span class="pill ${s[0]}">${s[1]}</span>${rm.partial ? '<span class="pill bad">Delvis synlig</span>' : ''}${typeof rm.confidence === 'number' ? `<span class="pill">Sikkerhet ${Math.round(rm.confidence * 100)} %</span>` : ''}</div>
          <div class="small">${rm.width_mm && rm.length_mm ? `${rm.dimension_source === 'lest' ? '' : '≈ '}${fmtLen(rm.width_mm)} × ${fmtLen(rm.length_mm)} (${rm.dimension_source === 'lest' ? '' : '≈ '}${fmtArea(rm.width_mm * rm.length_mm)})` : 'Størrelse ukjent – legges inn som 3 × 3 m og må måles'}${rm.ceiling_height_mm ? ` · takhøyde ${rm.ceiling_source === 'lest' ? '' : '≈ '}${fmtLen(rm.ceiling_height_mm)}` : ''} · ${rm.floor || ''}</div>
          ${ops.length ? `<div class="small muted">${ops.map(o => `${G.typeName(o.type)} ${o.width_mm ? fmtLen(o.width_mm, o.source !== 'lest') : ''}${o.leads_to && o.leads_to !== 'ukjent' ? ' til ' + esc(o.leads_to) : ''}`).join(' · ')}</div>` : ''}
          ${rm.evidence ? `<div class="tiny muted">${esc(rm.evidence)}</div>` : ''}
        </div></div>`; }).join('')}</div>` : `<div class="empty"><strong>Claude fant ingen rom å foreslå</strong>Prøv med flere bilder eller en plantegning.</div>`}
      ${(r.observations || []).length ? `<div><div class="label">Observasjoner</div><ul class="small">${r.observations.map(o => `<li>${esc(o)}</li>`).join('')}</ul></div>` : ''}
      ${(r.uncertain || []).length ? `<div><div class="label">Usikkert</div><ul class="small">${r.uncertain.map(o => `<li>${esc(o)}</li>`).join('')}</ul></div>` : ''}
      ${(r.requests || []).length ? `<div class="notice warn">${icon('camera')}<div><strong>Dette vil gjøre modellen sikrere:</strong><ul style="margin:4px 0 0;padding-left:18px">${r.requests.map(q => `<li>${esc(q.what)}${q.why ? ` <span class="muted">– ${esc(q.why)}</span>` : ''}</li>`).join('')}</ul></div></div>` : ''}
      <div class="btn-row"><button class="btn primary" id="imp-apply" ${rooms.length ? '' : 'disabled'}>${icon('check')} Legg valgte rom inn i modellen</button><button class="btn" id="imp-more">${icon('upload')} Last opp flere bilder</button></div>
      <p class="disclaimer">Claude vurderer ikke om vegger er bærende, eller om tiltak er lovlige. Automatisk genererte tegninger er ikke godkjente byggtegninger.</p>
    </div>`;
  }

  function wire(main) {
    const $ = s => main.querySelector(s);
    const fi = $('#imp-files');
    if (fi) {
      fi.onchange = () => addFiles(fi.files);
      const drop = $('#drop');
      drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); addFiles(e.dataTransfer.files); });
    }
    main.querySelectorAll('[data-f]').forEach(el => el.addEventListener('change', () => { imp.items[+el.dataset.i][el.dataset.f] = el.value; }));
    main.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { const it = imp.items.splice(+b.dataset.rm, 1)[0]; if (it && it.url) URL.revokeObjectURL(it.url); HM.render(); });
    $('#imp-known') && ($('#imp-known').oninput = e => imp.known = e.target.value);
    $('#imp-note') && ($('#imp-note').oninput = e => imp.note = e.target.value);
    $('#imp-run') && ($('#imp-run').onclick = run);
    $('#imp-stop') && ($('#imp-stop').onclick = () => imp.ctl && imp.ctl.abort());
    $('#imp-manual') && ($('#imp-manual').onclick = () => HM.quickRoom());
    $('#imp-discard') && ($('#imp-discard').onclick = () => { imp.result = null; HM.render(); });
    $('#imp-more') && ($('#imp-more').onclick = () => { imp.result = null; imp.items = []; HM.render(); });
    $('#imp-apply') && ($('#imp-apply').onclick = () => {
      const picks = [...main.querySelectorAll('.rm-pick')].filter(c => c.checked).map(c => +c.dataset.i);
      main.querySelectorAll('.rm-name').forEach(inp => { const r = imp.result.rooms[+inp.dataset.i]; const old = r.name; r.name = inp.value.trim() || old; (imp.result.openings || []).forEach(o => { if (o.room === old) o.room = r.name; }); });
      if (!picks.length) { HM.toast('Velg minst ett rom'); return; }
      const floorSel = imp.floorId || HM.activeFloorId();
      const ids = applyResult(imp.result, picks, floorSel);
      const rec = byId(HM.state.imports, imp.importId); if (rec) rec.appliedRoomIds = ids;
      HM.save();
      imp.result = null; imp.items = [];
      HM.toast(`${ids.length} rom lagt inn. Kontroller og mål dem i plantegningen.`, 4000);
      HM.go('huset', { mode: HM.houseMode === '3d' ? 'split' : HM.houseMode });
      setTimeout(() => ids[0] && HM.select('room', ids[0], { zoom: true }), 150);
    });
    $('#imp-floor') && ($('#imp-floor').onchange = e => { imp.floorId = e.target.value; });
    if ($('#imp-floor')) imp.floorId = $('#imp-floor').value;
  }

  async function addFiles(files) {
    for (const f of files) {
      const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
      if (!isPdf && !(f.type || '').startsWith('image/')) { HM.toast(`${f.name}: bare bilder og PDF støttes`); continue; }
      const it = { file: f, kind: isPdf ? 'plantegning' : 'innvendig', room: '', url: isPdf ? null : URL.createObjectURL(f), pdf: isPdf, pages: 1 };
      if (isPdf) { try { it.pageImgs = await HM.ai.pdfToImages(f, 3); it.pages = it.pageImgs.length; } catch (e) { HM.toast('Kunne ikke lese PDF-en: ' + e.message); continue; } }
      imp.items.push(it);
    }
    HM.render();
  }

  async function run() {
    imp.error = null; imp.running = true; imp.streamLen = 0; HM.render();
    try {
      // lagre materialet privat først
      const mediaIds = []; const sendItems = []; const images = [];
      for (const it of imp.items) {
        if (!it.mediaId) { const m = await HM.addMedia(it.file, { kind: it.kind, note: it.room || '' }); it.mediaId = m.id; }
        mediaIds.push(it.mediaId);
        if (it.pdf) it.pageImgs.forEach((p, k) => { images.push(p); sendItems.push({ kind: it.kind, room: it.room, name: p.name, mediaId: it.mediaId }); });
        else { images.push(it.file); sendItems.push({ kind: it.kind, room: it.room, name: it.file.name, mediaId: it.mediaId }); }
      }
      const plan = HM.plan();
      const prompt = HM.ai.housePrompt(sendItems, { known: imp.known.trim(), note: imp.note.trim(), existingRooms: plan.rooms.map(r => r.name) });
      imp.ctl = new AbortController();
      const res = await HM.ai.askJson(prompt, images, { signal: imp.ctl.signal, tier: 'complex', onText: ({ text }) => { if (!imp.streamLen) { imp.streamLen = text.length; HM.route.name === 'importer' && HM.render(); } } });
      if (!res || typeof res !== 'object' || !Array.isArray(res.rooms)) throw Object.assign(new Error('Uventet svar'), { code: 'invalid_json' });
      res._items = sendItems;
      const rec = { id: uid('imp'), createdAt: new Date().toISOString(), mediaIds, known: imp.known.trim(), note: imp.note.trim(), result: res, appliedRoomIds: [] };
      HM.state.imports.push(rec); HM.save();
      imp.importId = rec.id; imp.result = res;
    } catch (e) {
      console.error(e);
      imp.error = HM.ai.errorText(e);
    } finally {
      imp.running = false; imp.ctl = null;
      if (HM.route.name === 'importer') HM.render();
    }
  }

  /** Gjør AI-forslaget om til rom og vegger. Returnerer id-ene til nye rom. */
  function applyResult(r, picks, floorId) {
    const T = 100;
    const ids = [];
    HM.commitPlan(pl => {
      const target = byId(pl.floors, floorId) || pl.floors[0];
      const aiFloors = [...new Set(picks.map(i => r.rooms[i].floor || ''))];
      const floorMap = {};
      aiFloors.forEach((name, k) => {
        if (k === 0 || aiFloors.length === 1) { floorMap[name] = target.id; return; }
        let f = pl.floors.find(x => x.name.toLowerCase() === String(name).toLowerCase());
        if (!f) { const top = pl.floors.slice().sort((a, b) => b.elevation - a.elevation)[0]; f = { id: uid('fl'), name: name || 'Etasje', elevation: top.elevation + (top.height || 2400) + 250, height: 2400 }; pl.floors.push(f); }
        floorMap[name] = f.id;
      });
      for (const fid of new Set(Object.values(floorMap))) {
        const group = picks.map(i => ({ i, rm: r.rooms[i] })).filter(x => floorMap[x.rm.floor || ''] === fid);
        const b = HM.planBounds(pl, fid);
        const placed = group.filter(x => isFinite(x.rm.x_mm) && x.rm.x_mm !== null && isFinite(x.rm.y_mm) && x.rm.y_mm !== null);
        const loose = group.filter(x => !placed.includes(x));
        const minX = placed.length ? Math.min(...placed.map(x => x.rm.x_mm)) : 0, minY = placed.length ? Math.min(...placed.map(x => x.rm.y_mm)) : 0;
        let ox = b ? b.x1 + 1500 : 0, oy = b ? b.y0 + T / 2 : 0;
        const polys = [];
        for (const x of placed) { const w = x.rm.width_mm || 3000, l = x.rm.length_mm || 3000; polys.push({ x, pts: G.rectFromInner(ox + x.rm.x_mm - minX, oy + x.rm.y_mm - minY, w, l, T) }); }
        let lx = ox + (placed.length ? Math.max(...placed.map(x => x.rm.x_mm - minX + (x.rm.width_mm || 3000))) + 1500 : 0);
        for (const x of loose) { const w = x.rm.width_mm || 3000, l = x.rm.length_mm || 3000; polys.push({ x, pts: G.rectFromInner(lx, oy, w, l, T) }); lx += w + 1500; }
        G.snapClusters(polys.map(p => ({ pts: p.pts })));
        for (const { x, pts } of polys) {
          const rm = x.rm; const st = rm.dimension_source === 'lest' ? 'materiale' : 'anslatt';
          const props = {
            name: rm.name || 'Rom', status: st,
            ceiling: rm.ceiling_height_mm && ['lest', 'skalert', 'anslatt'].includes(rm.ceiling_source) ? Math.round(rm.ceiling_height_mm) : null,
            floorFinish: G.FLOORS[rm.floor_finish] ? rm.floor_finish : 'eik',
            wallColor: /^#[0-9a-f]{6}$/i.test(rm.wall_color_hex || '') ? rm.wall_color_hex : '#F2F0EA',
            notes: rm.partial ? 'Rommet var bare delvis synlig i materialet.' : '',
            source: { importId: imp.importId, dims: rm.dimension_source || 'ukjent', confidence: rm.confidence ?? null, evidence: rm.evidence || '', partial: !!rm.partial, unknownSize: !(rm.width_mm && rm.length_mm) },
          };
          if (props.source.unknownSize) props.notes = (props.notes + ' Størrelsen var ukjent. Mål rommet.').trim();
          const { room } = G.addRoom(pl, fid, pts, props, { t: T, status: st });
          ids.push(room.id);
          // åpninger
          const ix = Math.min(pts[0].x, pts[2].x) + T / 2, iy = Math.min(pts[0].y, pts[2].y) + T / 2; const iw = Math.abs(pts[1].x - pts[0].x) - T, il = Math.abs(pts[2].y - pts[1].y) - T;
          for (const o of (r.openings || []).filter(o => o.room === rm.name)) {
            const side = ['top', 'right', 'bottom', 'left'].includes(o.side) ? o.side : 'bottom';
            const width = Math.max(400, Math.min(o.width_mm || (o.type === 'window' ? 1200 : 900), (side === 'top' || side === 'bottom' ? iw : il) - 100));
            const along = isFinite(o.offset_mm) && o.offset_mm !== null ? o.offset_mm : (side === 'top' || side === 'bottom' ? iw : il) / 2;
            const p = side === 'top' ? { x: ix + along, y: iy - T / 2 } : side === 'bottom' ? { x: ix + along, y: iy + il + T / 2 } : side === 'left' ? { x: ix - T / 2, y: iy + along } : { x: ix + iw + T / 2, y: iy + along };
            const w = G.wallAtPoint(pl, fid, p, 10); if (!w) continue;
            const L = G.wallLen(w); const off = Math.max(width / 2 + 20, Math.min(L - width / 2 - 20, G.project(w, p).t));
            pl.openings.push({ id: uid('op'), wallId: w.id, type: ['door', 'window', 'opening'].includes(o.type) ? o.type : 'opening', offset: Math.round(off), width: Math.round(width), height: Math.round(o.height_mm || (o.type === 'window' ? 1200 : 2100)), sill: Math.round(o.type === 'window' ? (o.sill_mm || 900) : 0), hinge: 'a', swing: 1, status: o.source === 'lest' ? 'materiale' : 'anslatt', needsClarification: false, note: o.side === 'unknown' || !o.side ? 'Plassering på veggen er ukjent.' : (o.leads_to && o.leads_to !== 'ukjent' ? 'Fører til ' + o.leads_to : '') });
          }
          // knytt bilder til rommet
          (rm.from_images || []).forEach(n => { const it = (r._items || [])[n - 1]; if (it && it.mediaId) { const m = byId(HM.state.media, it.mediaId); if (m && !m.roomIds.includes(room.id)) m.roomIds.push(room.id); } });
        }
      }
    });
    return ids;
  }
  HM.applyImportResult = applyResult;
})();
