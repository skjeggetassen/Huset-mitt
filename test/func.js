// Funksjonstest: plan→3D, økonomisummer, sikkerhetskopi/gjenoppretting, mobilvisning
const { open } = require('./smoke');
const path = require('path');
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FEIL ') + m); if (!c) fails++; };
(async () => {
  const { browser, page, errors } = await open();
  await page.evaluate(() => HM.actions.enterDemo()); await page.waitForTimeout(600);
  // (a) plan → 3D
  await page.evaluate(() => { HM.houseMode = 'split'; HM.go('huset', { mode: 'split' }); }); await page.waitForTimeout(2500);
  const a = await page.evaluate(() => {
    const v3 = HM.houseWs().st.v3; const THREE = window.THREE;
    const box = () => { const b = new THREE.Box3().setFromObject(v3.houseGroup()); return { x: b.max.x - b.min.x, z: b.max.z - b.min.z }; };
    const g0 = v3.houseGroup(); const b0 = box();
    const pl = HM.plan(); const stue = pl.rooms.find(r => /Stue/.test(r.name));
    const area0 = HM.geo.roomNet(pl, stue).area;
    HM.commitPlan(p => HM.setRoomInner(p, p.rooms.find(r => r.id === stue.id), 8000, 6000));
    const pl2 = HM.plan(); const st2 = pl2.rooms.find(r => r.id === stue.id);
    const area1 = HM.geo.roomNet(pl2, st2).area;
    const g1 = v3.houseGroup(); const b1 = box();
    HM.undo.undo && HM.undo.undo();
    const area2 = HM.geo.roomNet(HM.plan(), HM.plan().rooms.find(r => r.id === stue.id)).area;
    return { rebuilt: g0 !== g1, b0, b1, area0, area1, area2, undoFn: !!HM.undo.undo };
  });
  console.log(JSON.stringify(a));
  ok(a.rebuilt, '3D-modellen bygges på nytt ved planendring');
  ok(a.b1.x > a.b0.x + 0.5 || a.b1.z > a.b0.z + 0.5, `3D-størrelsen endres (${a.b0.x.toFixed(2)}×${a.b0.z.toFixed(2)} → ${a.b1.x.toFixed(2)}×${a.b1.z.toFixed(2)} m)`);
  ok(Math.abs(a.area1 / 1e6 - 48) < 0.01, `Netto areal stue blir 48 m² (${(a.area1 / 1e6).toFixed(2)})`);
  ok(Math.abs(a.area2 - a.area0) < 1, 'Angre gir tilbake opprinnelig areal');
  // (b) økonomi
  const e = await page.evaluate(() => {
    const s = HM.state; const P = n => s.projects.find(p => p.name.startsWith(n));
    return { male: HM.econ.project(s, P('Male stua')), kj: HM.econ.project(s, P('Nytt kjøkken')), t: HM.econ.totals(s) };
  });
  console.log(JSON.stringify(e));
  ok(Math.abs(e.male.paid - 2974) < 0.01, `Male stua betalt = 2974 (${e.male.paid})`);
  ok(Math.abs(e.kj.paid - 203) < 0.01, `Nytt kjøkken betalt = 203 (${e.kj.paid})`);
  ok(Math.abs(e.t.unallocated - 459) < 0.01, `Ufordelt = 459 (${e.t.unallocated})`);
  ok(Math.abs(e.kj.remaining - (8740 + 98000 + 15000)) < 0.01, `Nytt kjøkken gjenstår = 121740 (${e.kj.remaining})`);
  ok(Math.abs(e.kj.forecast - (e.kj.paid + e.kj.remaining)) < 0.01, 'Forventet sluttsum = betalt + gjenstår');
  // (c) sikkerhetskopi → slett → gjenopprett, med bilde
  const c = await page.evaluate(async () => {
    const cv = document.createElement('canvas'); cv.width = 40; cv.height = 30; cv.getContext('2d').fillRect(0, 0, 20, 20);
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    const m = await HM.addMedia(new File([blob], 'test.png', { type: 'image/png' }));
    HM.state.receipts[0].note = 'MERKE-123'; await HM.save(true);
    const data = JSON.parse(JSON.stringify(await HM.makeBackup()));
    const before = JSON.stringify(HM.state); const nb = (await HM.store.keys('blobs')).length;
    await HM.store.clear('blobs'); HM.state = HM.emptyState ? HM.emptyState() : {}; await HM.save(true);
    await HM.restoreBackup(data);
    const after = JSON.stringify(HM.state); const na = (await HM.store.keys('blobs')).length;
    const back = await HM.getBlob(m.blobId || m.id || Object.keys(data.blobs)[0]);
    // last på nytt fra lagring for å bekrefte persistens
    await HM.loadMode('demo');
    return { same: before === after, nb, na, blobSize: back ? back.size : 0, mark: HM.state.receipts[0].note };
  });
  console.log(JSON.stringify(c));
  ok(c.same, 'Tilstanden er identisk etter gjenoppretting');
  ok(c.nb > 0 && c.nb === c.na, `Bilder gjenopprettet (${c.na}/${c.nb})`);
  ok(c.blobSize > 0, 'Bildefilen kan leses etter gjenoppretting');
  ok(c.mark === 'MERKE-123', 'Data overlever omlasting fra lagring');
  await browser.close();
  // (d) mobil
  const mob = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await mob.page.evaluate(() => HM.actions.enterDemo()); await mob.page.waitForTimeout(600);
  for (const [r, f] of [['oversikt', 'm-oversikt'], ['huset', 'm-huset'], ['okonomi', 'm-okonomi']]) {
    await mob.page.evaluate(r => HM.go(r), r); await mob.page.waitForTimeout(r === 'huset' ? 2000 : 500);
    const ov = await mob.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    ok(!ov, `Ingen horisontal rulling på mobil: ${r}`);
    await mob.page.screenshot({ path: path.join(__dirname, 'shots', f + '.png') });
  }
  await mob.browser.close();
  const errs = errors.concat(mob.errors);
  ok(!errs.length, 'Ingen konsollfeil' + (errs.length ? '\n' + errs.join('\n') : ''));
  console.log(fails ? `${fails} feil` : 'Alle tester bestått');
  process.exit(fails ? 1 : 0);
})();
