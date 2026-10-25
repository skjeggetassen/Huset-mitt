/* Innstillinger, sikkerhetskopi og gjenoppretting, demomodus, «Mer»-meny. */
(function () {
  const { esc, byId, fmtNum } = HM.util; const icon = HM.icon; const ui = HM.ui;

  function b64(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); }); }
  function fromB64(s, type) { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type }); }

  HM.makeBackup = async function () {
    const blobs = {};
    for (const key of await HM.store.keys('blobs')) { const b = await HM.getBlob(key); if (b) blobs[key] = { type: b.type || 'application/octet-stream', data: await b64(b) }; }
    return { app: 'huset-mitt', format: 1, exportedAt: new Date().toISOString(), mode: HM.mode, state: HM.state, blobs };
  };
  HM.validateBackup = function (data) {
    if (!data || data.app !== 'huset-mitt' || !data.state || !Array.isArray(data.state.versions) || !data.state.versions.length) throw new Error('Filen er ikke en sikkerhetskopi fra Huset mitt.');
    return true;
  };
  HM.restoreBackup = async function (data) {
    HM.validateBackup(data);
    await HM.store.clear('blobs');
    for (const [k, v] of Object.entries(data.blobs || {})) await HM.store.put('blobs', k, fromB64(v.data, v.type));
    HM.blobUrlCache.forEach(u => URL.revokeObjectURL(u)); HM.blobUrlCache.clear();
    HM.state = HM.migrate(JSON.parse(JSON.stringify(data.state)));
    await HM.save(true);
    HM.undo.reset(); HM.sel = null; HM.editorFloor = null;
  };
  HM.backupSummary = d => { const s = d.state; return `${s.versions.reduce((a, v) => a + v.plan.rooms.length, 0)} rom i ${s.versions.length} versjon${s.versions.length > 1 ? 'er' : ''}, ${s.projects.length} prosjekter, ${s.receipts.length} kvitteringer, ${s.docs.length} dokumenter, ${Object.keys(d.blobs || {}).length} bilder og filer`; };

  HM.views.innstillinger = function (main) {
    const st = HM.state; const lp = st.settings.lowPower;
    main.innerHTML = `<div class="page">
      <div class="page-head"><div><h1>Innstillinger</h1></div></div>
      <div class="grid-2">
        <div class="card"><h2>Huset</h2><div class="form-grid">${ui.field('Navn', ui.input('s_hname', st.house.name), 'wide')}${ui.field('Adresse', ui.input('s_addr', st.house.address || ''), 'wide')}${ui.field('Byggeår', ui.input('s_built', st.house.built || '', 'inputmode="numeric"'))}</div><div><button class="btn sm primary" id="s_hsave">Lagre</button></div></div>
        <div class="card"><h2>Sikkerhetskopi</h2>
          <p class="small muted">Dataene dine lagres privat i denne nettleseren på denne enheten. Ta jevnlig sikkerhetskopi. Kopien inneholder husmodellen, alle versjoner, prosjekter, kvitteringer, dokumenter og alle bilder.</p>
          <div class="btn-row"><button class="btn primary" id="s_backup">${icon('download')} Last ned sikkerhetskopi</button><label class="btn">${icon('upload')} Gjenopprett fra fil<input type="file" id="s_restore" accept=".json,application/json" hidden></label></div>
          <div id="s_bstatus"></div>
          <div class="small muted" id="s_usage"></div>
        </div>
        <div class="card"><h2>Bildetolking med Claude</h2>${HM.ai.statusHtml()}
          <details><summary>Hva koster det, og trenger jeg en API-nøkkel?</summary><div class="small" style="display:flex;flex-direction:column;gap:6px;margin-top:6px">
            <p><strong>Når du åpner appen på claude.ai</strong> brukes din egen Claude-konto. Du trenger ingen API-nøkkel, og det kommer ingen egen regning. Hver tolking bruker litt av kvoten i abonnementet ditt. Du blir spurt om tillatelse første gang.</p>
            <p><strong>Hvis du åpner appen som egen fil</strong> (utenfor claude.ai) kan du legge inn en API-nøkkel fra console.anthropic.com. Da betaler du per bruk. Med modellen Claude Opus 5.5 ($4 per million tokens inn, $20 ut) koster én tolking av 3–4 bilder typisk rundt 0,05–0,15 dollar (omtrent 0,50–1,50 kr). En kvittering koster noen øre.</p>
            <p>Nøkkelen lagres bare i denne nettleseren og tas ikke med i sikkerhetskopien.</p></div></details>
          <div class="form-grid">${ui.field('Egen API-nøkkel (valgfritt)', `<input type="password" id="s_key" value="${esc(HM.ai.apiKey())}" placeholder="sk-ant-..." autocomplete="off">`, 'wide')}</div>
          <div class="btn-row"><button class="btn sm" id="s_keysave">Lagre nøkkel</button>${HM.ai.apiKey() ? '<button class="btn sm ghost" id="s_keydel">Fjern nøkkel</button>' : ''}</div>
        </div>
        <div class="card"><h2>3D-visning</h2><p class="small muted">Enkel visning gir raskere 3D på eldre mobiler og nettbrett.</p>
          <div class="seg">${[['auto', 'Automatisk'], ['on', 'Enkel visning'], ['off', 'Full kvalitet']].map(([k, l]) => `<button aria-pressed="${String(lp) === k}" data-lp="${k}">${l}</button>`).join('')}</div>
          <p class="tiny muted">Denne enheten: ${HM.isLowPower() ? 'enkel visning' : 'full kvalitet'}.</p></div>
        <div class="card"><h2>Demomodus</h2>
          <p class="small muted">Demomodus viser et eksempelhus med prosjekter, kvitteringer og vedlikehold, lagret helt separat fra dine egne data. Modellen i demoen er laget for hånd og er ikke generert fra bilder.</p>
          <div class="btn-row">${HM.mode === 'demo' ? `<button class="btn primary" data-act="exitDemo">Tilbake til mine data</button><button class="btn" id="s_demoreset">Tilbakestill demoen</button>` : `<button class="btn" data-act="enterDemo">Åpne demomodus</button>`}</div></div>
        <div class="card"><h2>Slett data</h2><p class="small muted">${HM.mode === 'demo' ? 'Sletter demodataene.' : 'Sletter alle dine data i denne nettleseren: husmodell, prosjekter, kvitteringer, dokumenter og bilder. Ta sikkerhetskopi først.'}</p><div><button class="btn danger" id="s_wipe">${icon('trash')} Slett alle ${HM.mode === 'demo' ? 'demodata' : 'mine data'}</button></div></div>
      </div>
      <div class="card"><h2>Om appen</h2><p class="small">Huset mitt samler en digital modell av huset, oppussingsplaner, økonomi og vedlikehold. Automatisk genererte tegninger og modeller er ikke godkjente byggtegninger. Appen avgjør ikke om vegger er bærende, eller om tiltak er lovlige eller teknisk forsvarlige. Slike forhold kan merkes «Må avklares» og bør avklares med fagfolk.</p></div>
    </div>`;
    const $ = s => main.querySelector(s);
    $('#s_hsave').onclick = () => { const v = HM.formValues(main); st.house.name = v.s_hname.trim() || 'Huset mitt'; st.house.address = v.s_addr; st.house.built = v.s_built; HM.save(); HM.toast('Lagret'); HM.render(); };
    $('#s_backup').onclick = async () => {
      const s = $('#s_bstatus'); s.innerHTML = `<div class="progress-line"></div>`;
      try { const data = await HM.makeBackup(); const blob = new Blob([JSON.stringify(data)], { type: 'application/json' }); const name = `huset-mitt-sikkerhetskopi-${HM.util.todayISO()}${HM.mode === 'demo' ? '-demo' : ''}.json`; const r = await HM.saveFile(name, blob); s.innerHTML = r ? `<div class="notice ok">${icon('check')}<div>Sikkerhetskopien er laget (${fmtNum(blob.size / 1e6, 1)} MB): ${esc(HM.backupSummary(data))}.</div></div>` : ''; st.settings.lastBackup = new Date().toISOString(); HM.save(); }
      catch (e) { s.innerHTML = `<div class="notice bad">${icon('alert')}<div>Kunne ikke lage sikkerhetskopi: ${esc(e.message)}</div></div>`; }
    };
    $('#s_restore').onchange = async () => {
      const f = $('#s_restore').files[0]; if (!f) return; const s = $('#s_bstatus');
      let data; try { data = JSON.parse(await f.text()); HM.validateBackup(data); } catch (e) { s.innerHTML = `<div class="notice bad">${icon('alert')}<div>${esc(e.message.startsWith('Filen') ? e.message : 'Filen kunne ikke leses som sikkerhetskopi.')}</div></div>`; return; }
      if (!(await HM.confirm('Gjenopprette fra sikkerhetskopi?', `Kopien fra ${new Date(data.exportedAt).toLocaleString('nb-NO')} inneholder ${esc(HM.backupSummary(data))}. Alt som ligger i ${HM.mode === 'demo' ? 'demomodus' : 'appen'} nå blir erstattet.`, 'Erstatt og gjenopprett'))) { $('#s_restore').value = ''; return; }
      try { await HM.restoreBackup(data); HM.toast('Gjenopprettet fra sikkerhetskopi'); HM.go('oversikt'); }
      catch (e) { s.innerHTML = `<div class="notice bad">${icon('alert')}<div>Gjenoppretting feilet: ${esc(e.message)}</div></div>`; }
    };
    $('#s_keysave').onclick = () => { HM.ai.setApiKey($('#s_key').value.trim()); HM.toast('Lagret'); HM.render(); };
    $('#s_keydel') && ($('#s_keydel').onclick = () => { HM.ai.setApiKey(''); HM.render(); });
    main.querySelectorAll('[data-lp]').forEach(b => b.onclick = () => { st.settings.lowPower = b.dataset.lp; HM.save(); HM.render(); });
    $('#s_demoreset') && ($('#s_demoreset').onclick = async () => { await HM.store.clear('kv'); await HM.store.clear('blobs'); await HM.loadMode('demo'); HM.toast('Demoen er tilbakestilt'); HM.go('oversikt'); });
    $('#s_wipe').onclick = async () => {
      if (!(await HM.confirm(HM.mode === 'demo' ? 'Slette demodata?' : 'Slette alle dine data?', HM.mode === 'demo' ? 'Demoen lages på nytt neste gang du åpner den.' : 'Dette kan ikke angres uten en sikkerhetskopi.', 'Slett alt'))) return;
      await HM.store.clear('kv'); await HM.store.clear('blobs'); HM.blobUrlCache.clear();
      if (HM.mode === 'demo') { await HM.loadMode('real'); } else { HM.state = HM.emptyState(); await HM.save(true); HM.undo.reset(); }
      HM.toast('Slettet'); HM.go('oversikt');
    };
    if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(e => { const el = $('#s_usage'); if (el) el.textContent = `Brukt lagringsplass: ${fmtNum((e.usage || 0) / 1e6, 1)} MB${st.settings.lastBackup ? ` · siste sikkerhetskopi ${new Date(st.settings.lastBackup).toLocaleDateString('nb-NO')}` : ' · ingen sikkerhetskopi tatt ennå'}.`; }).catch(() => {});
  };

  HM.actions.enterDemo = async () => { await HM.loadMode('demo'); HM.toast('Demomodus – eksempeldata'); HM.go('oversikt'); };
  HM.actions.exitDemo = async () => { await HM.loadMode('real'); HM.toast('Tilbake til dine data'); HM.go('oversikt'); };

  HM.views.mer = function (main) {
    const items = [['kalender', 'cal', 'Kalender', 'Arbeidsøkter, frister, avtaler'], ['lister', 'list', 'Lister og innkjøp', 'Handleliste, verktøy, huskelister'], ['dokumentasjon', 'book', 'Dokumentasjon', 'Farger, materialer, produkter, garantier'], ['vedlikehold', 'wrench', 'Vedlikehold', 'Plan med egne intervaller'], ['tidslinje', 'clock', 'Historikk', 'Tidslinje med før og etter'], ['versjoner', 'layers', 'Dagens hus og forslag', 'Versjoner og sammenligning'], ['importer', 'upload', 'Last opp bilder', 'Opprett eller utvid huset fra bilder'], ['innstillinger', 'gear', 'Innstillinger', 'Sikkerhetskopi, demomodus, bildetolking']];
    main.innerHTML = `<div class="page"><h1>Mer</h1><div class="card" style="padding:4px 16px"><div class="list">${items.map(([to, ic, t, s]) => `<div class="row click" data-act="go" data-to="${to}"><span style="width:24px;height:24px;color:var(--accent)">${icon(ic)}</span><div class="grow"><div class="title">${t}</div><div class="small muted">${s}</div></div><span style="width:18px;height:18px;color:var(--muted)">${icon('chevron')}</span></div>`).join('')}</div></div></div>`;
  };
})();
