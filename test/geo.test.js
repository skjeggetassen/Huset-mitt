// Kjører kjerne + modell i Node med minimal DOM-stubb
global.window = global; global.document = { addEventListener(){}, querySelector(){return null}, querySelectorAll(){return []} };
require('../src/js/00-core.js'); require('../src/js/10-model.js');
const G = HM.geo, assert = require('assert');
const plan = HM.emptyPlan(); const fid = plan.floors[0].id;
// Rom A 4000x3000 innvendig, rom B ved siden av (vegg 100)
const A = G.addRoom(plan, fid, G.rectFromInner(0,0,4000,3000), {name:'Stue'});
const B = G.addRoom(plan, fid, G.rectFromInner(4100,0,3000,3000), {name:'Kjøkken'});
console.log('walls', plan.walls.length);
assert.strictEqual(plan.walls.length, 7, 'delt vegg skal ikke dobles');
const netA = G.roomNet(plan, A.room); console.log('A', netA.area/1e6, netA.w, netA.l);
assert(Math.abs(netA.area - 12e6) < 1e3);
// sett bredde på stue til 4500 innvendig via nordvegg (strekk)
const north = plan.walls.find(w => Math.abs(w.a.y + 50) < 1 && w.a.x < 0 && w.b.x > 0);
const north2 = G.edgeWall(plan, fid, A.room.pts[0], A.room.pts[1]);
console.log('north', north2.a, north2.b);
G.setWallLength(plan, north2, 4500 + north2.t, 'stretch');
const netA2 = G.roomNet(plan, A.room); const netB2 = G.roomNet(plan, B.room);
console.log('A2', netA2.area/1e6, 'B2', netB2.area/1e6);
assert(Math.abs(netA2.area - 13.5e6) < 1e3); assert(Math.abs(netB2.area - 9e6) < 1e3);
// bekreftet mål og konflikt
north2.confirmed = { inner: 4500 };
console.log(G.validate(plan).map(w=>w.text));
G.setWallLength(plan, G.edgeWall(plan, fid, A.room.pts[1], A.room.pts[2]), 3200, 'scale');
const v = G.validate(plan); console.log(v.map(w=>w.level+': '+w.text));
assert(v.some(w => w.level==='bad'));
console.log('OK');
