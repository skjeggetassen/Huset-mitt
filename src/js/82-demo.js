/* Demomodus: et håndlaget eksempelhus. Lagres separat og er tydelig merket som eksempeldata. */
(function () {
  const G = HM.geo; const { uid, todayISO, addDays, addMonths } = HM.util;

  HM.createDemoState = function () {
    const s = HM.emptyState();
    s.house = { name: 'Demohuset', address: 'Eksempelveien 1 (demo)', built: '1978' };
    const v = s.versions[0]; const pl = v.plan; const fid = pl.floors[0].id;
    pl.floors[0].height = 2400;
    const T = 100;
    const room = (name, x, y, w, l, props = {}) => G.addRoom(pl, fid, G.rectFromInner(x, y, w, l, T), Object.assign({ name, status: 'bekreftet' }, props), { t: T, status: 'bekreftet' }).room;
    const stue = room('Stue', 0, 0, 5200, 4200, { floorFinish: 'eik', wallColor: '#EDE8DD' });
    const kjokken = room('Kjøkken', 5300, 0, 3400, 4200, { floorFinish: 'vinyl', wallColor: '#F4F3EF' });
    const gang = room('Gang', 0, 4300, 2000, 3200, { floorFinish: 'flis_gra', wallColor: '#D9DAD6' });
    const bad = room('Bad', 2100, 4300, 2200, 3200, { floorFinish: 'flis_lys', wallColor: '#F4F3EF', status: 'anslatt', ceiling: 2300 });
    const sov = room('Soverom', 4400, 4300, 4300, 3200, { floorFinish: 'eik', wallColor: '#B7C2AE' });
    // bekreftede mål på vegger rundt rom med status bekreftet, anslåtte rundt badet
    for (const w of pl.walls) {
      const rs = G.roomsOfWall(pl, w);
      if (rs.includes(bad)) { w.status = 'anslatt'; w.confirmed = null; }
      else { w.confirmed = { inner: Math.round(G.wallInner(w)) }; }
    }
    // ytterveggene litt tykkere er ikke modellert i demoen; én vegg er merket «Må avklares»
    const between = G.wallAtPoint(pl, fid, { x: 5250, y: 2000 }, 10);
    const op = (p, type, width, extra = {}) => { const w = G.wallAtPoint(pl, fid, p, 10); if (!w) return null; const o = Object.assign({ id: uid('op'), wallId: w.id, type, offset: Math.round(G.project(w, p).t), width, height: type === 'window' ? 1300 : 2100, sill: type === 'window' ? 800 : 0, hinge: 'a', swing: 1, status: 'bekreftet', needsClarification: false, note: '' }, extra); pl.openings.push(o); return o; };
    op({ x: 1600, y: -50 }, 'window', 1400); op({ x: 3800, y: -50 }, 'window', 1400);
    op({ x: 7000, y: -50 }, 'window', 1200); op({ x: 8750, y: 2000 }, 'window', 1000);
    op({ x: 6500, y: 7550 }, 'window', 1400); op({ x: 3200, y: 7550 }, 'window', 600, { height: 600, sill: 1500, status: 'anslatt' });
    op({ x: 1000, y: 7550 }, 'door', 1000, { swing: -1, note: 'Ytterdør' });
    op({ x: 1000, y: 4250 }, 'door', 900, { swing: 1 });
    op({ x: 2050, y: 5200 }, 'door', 800, { hinge: 'b', swing: -1, status: 'anslatt' });
    op({ x: 4800, y: 4250 }, 'door', 800, { swing: -1, hinge: 'b' });
    op({ x: 5250, y: 2000 }, 'opening', 1200);
    if (between) { between.needsClarification = true; between.note = 'Bærende? Må avklares med fagperson før åpningen utvides.'; }
    // møbler
    const f = (type, x, y, rot = 0) => { const it = G.FURNITURE.find(z => z.type === type); pl.furniture.push({ id: uid('mb'), floorId: fid, type, name: it.name, x, y, w: it.w, d: it.d, h: it.h, rot, color: it.color, elev: it.elev || 0, glass: !!it.glass }); };
    f('sofa3', 2400, 3500, 180); f('salongbord', 2400, 2500); f('tvbenk', 2400, 300); f('lenestol', 4500, 2400, 270);
    f('benk240', 7000, 300); f('kjoleskap', 8300, 1200, 270); f('spisebord4', 7000, 2900);
    f('seng160', 6800, 6300, 0); f('nattbord', 5750, 5600); f('nattbord', 7850, 5600); f('garderobe', 4950, 6900, 0);
    f('toalett', 3900, 4700, 270); f('servant', 3900, 5600, 270); f('dusj', 2600, 7000); f('skohylle', 300, 5800, 90);
    v.updatedAt = new Date().toISOString();

    // forslag: nytt kjøkken
    const v2 = { id: uid('ver'), name: 'Nytt kjøkken', kind: 'proposal', createdAt: new Date().toISOString(), basedOn: v.id, description: 'Åpne mer mot stua, ny kjøkkenøy og lyse fliser.', plan: JSON.parse(JSON.stringify(pl)) };
    const p2 = v2.plan; const k2 = p2.rooms.find(r => r.name === 'Kjøkken');
    k2.floorFinish = 'flis_lys'; k2.wallColor = '#A9B7C2';
    const o2 = p2.openings.find(o => o.type === 'opening'); o2.width = 2600; o2.status = 'anslatt';
    p2.furniture = p2.furniture.filter(x => !(x.type === 'spisebord4'));
    p2.furniture.push({ id: uid('mb'), floorId: fid, type: 'oy', name: 'Kjøkkenøy', x: 7000, y: 2400, w: 1800, d: 900, h: 900, rot: 0, color: '#3F5A4C', elev: 0 });
    p2.furniture.push({ id: uid('mb'), floorId: fid, type: 'komfyr', name: 'Komfyr', x: 6100, y: 300, w: 600, d: 600, h: 900, rot: 0, color: '#2F3337', elev: 0 });
    s.versions.push(v2);

    // prosjekter
    const t = todayISO(); const d = n => addDays(t, n);
    const task = (title, start, end, o = {}) => HM.newTaskObj(Object.assign({ title, start, end }, o));
    const kRive = task('Rive gammelt kjøkken', d(14), d(16));
    const kEl = task('Elektriker legger nye kurser', d(17), d(18), { assignee: 'Eksempel Elektro (demo)', dependsOn: [kRive.id] });
    const kMal = task('Sparkle og male vegger', d(19), d(21), { dependsOn: [kEl.id] });
    const kFlis = task('Legge flis på gulv', d(22), d(25), { dependsOn: [kMal.id] });
    const kMont = task('Montere kjøkken', d(26), d(29), { dependsOn: [kFlis.id], checklist: [{ id: uid('cl'), text: 'Sjekke at alle deler er levert', done: false }, { id: uid('cl'), text: 'Avtale med rørlegger', done: false }] });
    const pK = HM.newProjectObj({ name: 'Nytt kjøkken', description: 'Bytte kjøkkeninnredning, nytt gulv og åpne mer mot stua. Om veggen er bærende må avklares med fagperson.', roomIds: [kjokken.id], status: 'planlagt', priority: 'hoy', start: d(14), end: d(29), budget: 180000, versionId: v2.id, needsClarification: true, clarificationNote: 'Er veggen mellom stue og kjøkken bærende?', tasks: [kRive, kEl, kMal, kFlis, kMont], quotes: [{ id: uid('q'), supplier: 'Kjøkkenleverandøren (demo)', amount: 98000, date: d(-10), accepted: true, paid: false, note: 'Innredning og benkeplate' }, { id: uid('q'), supplier: 'Rørlegger (demo)', amount: 14500, date: d(-6), accepted: false, paid: false }], extraRemaining: 15000 });
    const sTil = task('Dekke til og sparkle', d(-6), d(-5), { done: true, doneAt: d(-5) });
    const sMal = task('Male vegger to strøk', d(-4), d(-1), { dependsOn: [sTil.id] });
    const sList = task('Montere gulvlister', d(1), d(1), { dependsOn: [sMal.id] });
    const pS = HM.newProjectObj({ name: 'Male stua', description: 'Ny farge på veggene og nye gulvlister.', roomIds: [stue.id], status: 'pagar', priority: 'middels', start: d(-6), end: d(1), budget: 9000, tasks: [sTil, sMal, sList] });
    const pT = HM.newProjectObj({ name: 'Nye takrenner', description: 'Bytte takrenner og nedløp på nordsiden.', area: 'Tak', status: 'ide', priority: 'lav', budget: 25000 });
    s.projects.push(pK, pS, pT);

    // kvitteringer (eksempler)
    s.receipts.push(
      HM.newReceiptObj({ store: 'Fargehandelen (demo)', date: d(-7), total: 2140, category: 'Maling og overflate', lines: [{ text: 'Interiørmaling 2,7 l', qty: 2, amount: 1780 }, { text: 'Malerrull og brett', qty: 1, amount: 360 }], allocations: [{ projectId: pS.id, amount: 2140 }], source: 'manuell' }),
      HM.newReceiptObj({ store: 'Byggvarehuset (demo)', date: d(-6), total: 1286, category: 'Materialer', lines: [{ text: 'Sparkel', qty: 1, amount: 189 }, { text: 'Gulvlist eik 2,4 m', qty: 6, amount: 894 }, { text: 'Tape', qty: 2, amount: 203 }], allocations: [{ projectId: pS.id, amount: 1083 }, { projectId: pK.id, amount: 203 }], source: 'manuell' }),
      HM.newReceiptObj({ store: 'Byggvarehuset (demo)', date: d(-3), total: 249, kind: 'retur', category: 'Materialer', lines: [{ text: 'Retur: gulvlist eik 2,4 m', qty: 1, amount: 249 }], allocations: [{ projectId: pS.id, amount: 249 }], source: 'manuell' }),
      HM.newReceiptObj({ store: 'Jernvarebutikken (demo)', date: d(-2), total: 459, category: 'Verktøy', lines: [{ text: 'Gjæringskasse', qty: 1, amount: 459 }], allocations: [], source: 'manuell' }),
    );
    // lister
    s.shopping.push(
      { id: uid('hv'), name: 'Fliselim', qty: 4, unit: 'pk', dims: '15 kg', store: 'Byggvarehuset (demo)', price: 389, projectId: pK.id, bought: false },
      { id: uid('hv'), name: 'Gulvfliser lys grå', qty: 16, unit: 'm²', dims: '60 × 60 cm', store: 'Flisbutikken (demo)', price: 449, projectId: pK.id, bought: false },
      { id: uid('hv'), name: 'Spiker til gulvlist', qty: 1, unit: 'pk', store: 'Jernvarebutikken (demo)', price: 79, projectId: pS.id, bought: false },
    );
    s.tools.push({ id: uid('vt'), name: 'Gjæringssag', status: 'lane', projectId: pS.id, note: 'Lånes av nabo' }, { id: uid('vt'), name: 'Flisekutter', status: 'kjop', projectId: pK.id }, { id: uid('vt'), name: 'Drill', status: 'har' });
    s.checklists.push({ id: uid('hl'), title: 'Før maling', roomId: stue.id, projectId: pS.id, items: [{ id: uid('ci'), text: 'Flytte møbler', done: true }, { id: uid('ci'), text: 'Vaske vegger', done: true }, { id: uid('ci'), text: 'Teipe lister', done: false }] });
    // kalender
    s.events.push(
      { id: uid('ev'), title: 'Befaring kjøkken', type: 'avtale', date: d(3), time: '16:00', repeat: 'none', remind: 1440, projectId: pK.id, contact: 'Kjøkkenleverandøren (demo)', done: false, doneDates: [] },
      { id: uid('ev'), title: 'Levering av kjøkken', type: 'leveranse', date: d(24), time: '08:00', repeat: 'none', remind: 4320, projectId: pK.id, done: false, doneDates: [] },
      { id: uid('ev'), title: 'Male rekkverk', type: 'arbeidsokt', date: d(6), time: '10:00', repeat: 'none', remind: null, projectId: null, done: false, doneDates: [] },
    );
    // vedlikehold
    s.maintenance.push(
      { id: uid('vh'), title: 'Rense takrenner og nedløp', intervalMonths: 12, lastDone: addMonths(t, -11), remindDays: 30, area: 'Tak', log: [{ id: uid('lg'), date: addMonths(t, -11), cost: 0, products: '', note: 'Gjort selv' }] },
      { id: uid('vh'), title: 'Bytte ventilasjonsfilter', intervalMonths: 6, lastDone: addMonths(t, -7), remindDays: 14, area: '', log: [{ id: uid('lg'), date: addMonths(t, -7), cost: 690, products: 'Filter F7, 2 stk', note: '' }] },
      { id: uid('vh'), title: 'Teste røykvarslere', intervalMonths: 3, lastDone: addMonths(t, -1), remindDays: 7, log: [] },
      { id: uid('vh'), title: 'Male fasaden', intervalMonths: 96, lastDone: addMonths(t, -70), remindDays: 180, area: 'Fasade', log: [{ id: uid('lg'), date: addMonths(t, -70), cost: 32000, products: 'Utendørs maling, 30 l', note: 'Malt av malerfirma' }] },
    );
    // dokumentasjon
    const winOp = pl.openings.find(o => o.type === 'window');
    s.docs.push(
      { id: uid('dok'), title: 'Veggfarge stue', category: 'Maling', roomId: stue.id, brand: 'Eksempelmerke (demo)', colorCode: 'NCS S 0804-Y30R', paintType: 'Interiørmaling, vegg', gloss: 'Glans 5', date: d(-2), notes: 'To strøk.', mediaIds: [], createdAt: new Date().toISOString() },
      { id: uid('dok'), title: 'Eikeparkett', category: 'Gulv', roomId: stue.id, product: 'Eik 3-stav, matt lakk', brand: 'Eksempel (demo)', dims: '14 mm', date: '2015-05-10', mediaIds: [], createdAt: new Date().toISOString() },
      { id: uid('dok'), title: 'Stuevindu', category: 'Vindu', roomId: stue.id, elementRef: { kind: 'opening', id: winOp.id }, brand: 'Eksempel (demo)', model: 'Topphengslet', dims: '140 × 130 cm', date: '2009-08-01', mediaIds: [], createdAt: new Date().toISOString() },
      { id: uid('dok'), title: 'Elektriker', category: 'Kontakt', contactName: 'Ola Eksempel', company: 'Eksempel Elektro (demo)', role: 'Elektriker', phone: '000 00 000', email: 'demo@eksempel.no', mediaIds: [], createdAt: new Date().toISOString() },
    );
    return s;
  };
})();
