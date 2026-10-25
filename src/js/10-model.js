/* Husmodell: geometri, romberegning, redigeringsoperasjoner og kontroll av mål. Alle mål i millimeter. */
(function () {
  const { uid, byId } = HM.util;
  const EPS = 2; // mm toleranse for «samme punkt»

  const dist = (p, q) => Math.hypot(q.x - p.x, q.y - p.y);
  const same = (p, q, tol = EPS) => Math.abs(p.x - q.x) <= tol && Math.abs(p.y - q.y) <= tol;
  const wallLen = w => dist(w.a, w.b);
  const wallDir = w => { const L = wallLen(w) || 1; return { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L }; };
  const wallNormal = w => { const d = wallDir(w); return { x: -d.y, y: d.x }; };
  const wallInner = w => Math.max(0, wallLen(w) - (w.t || 0));
  const ptAt = (w, off) => { const d = wallDir(w); return { x: w.a.x + d.x * off, y: w.a.y + d.y * off }; };
  function project(w, p) {
    const d = wallDir(w); const L = wallLen(w);
    const t = (p.x - w.a.x) * d.x + (p.y - w.a.y) * d.y;
    const tc = Math.max(0, Math.min(L, t));
    const q = { x: w.a.x + d.x * tc, y: w.a.y + d.y * tc };
    return { t, tc, dist: dist(p, q), q };
  }
  function segDist(p, a, b) { return project({ a, b }, p).dist; }
  function polyArea(pts) { let s = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; s += p.x * q.y - q.x * p.y; } return s / 2; }
  function centroid(pts) {
    const A = polyArea(pts); if (Math.abs(A) < 1) { const n = pts.length || 1; return { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n }; }
    let cx = 0, cy = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; const f = p.x * q.y - q.x * p.y; cx += (p.x + q.x) * f; cy += (p.y + q.y) * f; }
    return { x: cx / (6 * A), y: cy / (6 * A) };
  }
  function pointInPoly(p, pts) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if (((a.y > p.y) !== (b.y > p.y)) && (p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x)) c = !c; } return c; }
  function lineIntersect(p1, d1, p2, d2) {
    const den = d1.x * d2.y - d1.y * d2.x; if (Math.abs(den) < 1e-9) return null;
    const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / den; return { x: p1.x + d1.x * t, y: p1.y + d1.y * t };
  }
  /** Flytter hver kant innover med dists[i]. */
  function insetPolygon(pts, dists) {
    const n = pts.length; if (n < 3) return pts.slice();
    const sgn = polyArea(pts) >= 0 ? 1 : -1;
    const lines = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n]; const L = dist(p, q) || 1; const d = { x: (q.x - p.x) / L, y: (q.y - p.y) / L };
      const nrm = { x: -d.y * sgn, y: d.x * sgn };
      lines.push({ p: { x: p.x + nrm.x * dists[i], y: p.y + nrm.y * dists[i] }, d, nrm });
    }
    const out = [];
    for (let i = 0; i < n; i++) {
      const L1 = lines[(i - 1 + n) % n], L2 = lines[i];
      out.push(lineIntersect(L1.p, L1.d, L2.p, L2.d) || { x: pts[i].x + L2.nrm.x * dists[i], y: pts[i].y + L2.nrm.y * dists[i] });
    }
    return out;
  }
  const floorWalls = (plan, fid) => plan.walls.filter(w => w.floorId === fid);
  const collinear = (w, p, q, tol = 3) => segLineDist(p, w) <= tol && segLineDist(q, w) <= tol;
  function segLineDist(p, w) { const d = wallDir(w); return Math.abs((p.x - w.a.x) * d.y - (p.y - w.a.y) * d.x); }
  /** Veggen som ligger på kanten p–q (dekker midtpunktet). */
  function edgeWall(plan, fid, p, q) {
    const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    return floorWalls(plan, fid).find(w => collinear(w, p, q, 4) && project(w, m).dist < 4);
  }
  function wallAtPoint(plan, fid, p, tol = 6) {
    let best = null, bd = tol;
    for (const w of floorWalls(plan, fid)) { const pr = project(w, p); if (pr.dist <= bd && pr.t >= -1 && pr.t <= wallLen(w) + 1) { bd = pr.dist; best = w; } }
    return best;
  }
  /** Netto innvendig areal (kantene trekkes inn med halv veggtykkelse). */
  function roomNet(plan, room) {
    const pts = room.pts; const n = pts.length;
    const dists = pts.map((p, i) => { const w = edgeWall(plan, room.floorId, p, pts[(i + 1) % n]); return w ? (w.t || 0) / 2 : 0; });
    const inner = insetPolygon(pts, dists);
    const area = Math.abs(polyArea(inner));
    let per = 0; for (let i = 0; i < n; i++) per += dist(inner[i], inner[(i + 1) % n]);
    const res = { area, perimeter: per, inner, isRect: false };
    if (n === 4) {
      const e = [0, 1, 2, 3].map(i => ({ dx: inner[(i + 1) % 4].x - inner[i].x, dy: inner[(i + 1) % 4].y - inner[i].y }));
      const ortho = e.every((v, i) => { const u = e[(i + 1) % 4]; const L1 = Math.hypot(v.dx, v.dy), L2 = Math.hypot(u.dx, u.dy); return Math.abs((v.dx * u.dx + v.dy * u.dy) / (L1 * L2 || 1)) < 0.02; });
      if (ortho) { res.isRect = true; res.w = Math.hypot(e[0].dx, e[0].dy); res.l = Math.hypot(e[1].dx, e[1].dy); }
    }
    return res;
  }
  function roomCeiling(plan, room) { const f = byId(plan.floors, room.floorId); return room.ceiling || (f && f.height) || 2400; }
  function roomsOfWall(plan, w) {
    return plan.rooms.filter(r => r.floorId === w.floorId && r.pts.some((p, i) => { const q = r.pts[(i + 1) % r.pts.length]; return collinear(w, p, q, 4) && (project(w, { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }).dist < 4 || project({ a: p, b: q }, { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 }).dist < 4); }));
  }
  function wallHeight(plan, w) {
    if (w.height) return w.height;
    const rs = roomsOfWall(plan, w);
    if (rs.length) return Math.max(...rs.map(r => roomCeiling(plan, r)));
    const f = byId(plan.floors, w.floorId); return (f && f.height) || 2400;
  }
  const openingsOf = (plan, wid) => plan.openings.filter(o => o.wallId === wid);

  /** Deler av kanten p–q som ikke allerede dekkes av vegger. */
  function uncovered(plan, fid, p, q) {
    const L = dist(p, q); if (L < 1) return [];
    const ed = { a: p, b: q };
    let free = [[0, L]];
    for (const w of floorWalls(plan, fid)) {
      if (!collinear(ed, w.a, w.b, 4)) continue;
      let t1 = project(ed, w.a).t, t2 = project(ed, w.b).t; if (t1 > t2) [t1, t2] = [t2, t1];
      const next = [];
      for (const [s, e] of free) { if (t2 <= s + 1 || t1 >= e - 1) { next.push([s, e]); continue; } if (t1 > s) next.push([s, t1]); if (t2 < e) next.push([t2, e]); }
      free = next;
    }
    const d = { x: (q.x - p.x) / L, y: (q.y - p.y) / L };
    return free.filter(([s, e]) => e - s > 30).map(([s, e]) => ({ a: { x: p.x + d.x * s, y: p.y + d.y * s }, b: { x: p.x + d.x * e, y: p.y + d.y * e } }));
  }
  function newWall(fid, a, b, props = {}) {
    return Object.assign({ id: uid('w'), floorId: fid, a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, t: 100, height: null, status: 'anslatt', confirmed: null, needsClarification: false, note: '' }, props);
  }
  function addWallsForPolygon(plan, fid, pts, props = {}) {
    const made = [];
    for (let i = 0; i < pts.length; i++) {
      for (const seg of uncovered(plan, fid, pts[i], pts[(i + 1) % pts.length])) { const w = newWall(fid, seg.a, seg.b, props); plan.walls.push(w); made.push(w); }
    }
    return made;
  }
  function addRoom(plan, fid, pts, props = {}, wallProps = {}) {
    const room = Object.assign({ id: uid('rom'), floorId: fid, name: 'Rom', pts: pts.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) })), ceiling: null, status: 'anslatt', floorFinish: 'eik', wallColor: '#F2F0EA', needsClarification: false, notes: '' }, props);
    plan.rooms.push(room);
    const walls = addWallsForPolygon(plan, fid, room.pts, Object.assign({ status: room.status }, wallProps));
    return { room, walls };
  }
  /** Rektangulært rom ut fra innvendige mål. x,y = øvre venstre innvendige hjørne. */
  function rectFromInner(x, y, w, l, t = 100) { const h = t / 2; return [{ x: x - h, y: y - h }, { x: x + w + h, y: y - h }, { x: x + w + h, y: y + l + h }, { x: x - h, y: y + l + h }]; }

  /** Flytter alle punkt som ligger i «from» (vegg-ender, romhjørner) til «to». */
  function moveNode(plan, fid, from, to) {
    const f = { x: from.x, y: from.y };
    for (const w of floorWalls(plan, fid)) { for (const k of ['a', 'b']) if (same(w[k], f)) { w[k].x = to.x; w[k].y = to.y; } }
    for (const r of plan.rooms) if (r.floorId === fid) for (const p of r.pts) if (same(p, f)) { p.x = to.x; p.y = to.y; }
  }
  function openingCenters(plan, fid) {
    const m = new Map();
    for (const o of plan.openings) { const w = byId(plan.walls, o.wallId); if (w && w.floorId === fid) m.set(o.id, ptAt(w, o.offset)); }
    return m;
  }
  function refitOpenings(plan, fid, centers) {
    for (const o of plan.openings) {
      const w = byId(plan.walls, o.wallId); if (!w || w.floorId !== fid || !centers.has(o.id)) continue;
      const c = centers.get(o.id); const L = wallLen(w);
      o.offset = Math.max(o.width / 2, Math.min(L - o.width / 2, project(w, c).t));
    }
  }
  /** Strekker tegningen: alt på/bak terskelen langs aksen flyttes delta. sign=+1: punkt med verdi >= terskel. */
  function stretch(plan, fid, axis, threshold, delta, sign = 1) {
    const hit = v => (v - threshold) * sign >= -EPS;
    const centers = openingCenters(plan, fid);
    for (const [id, c] of centers) if (hit(c[axis])) c[axis] += delta * sign;
    for (const w of floorWalls(plan, fid)) for (const k of ['a', 'b']) if (hit(w[k][axis])) w[k][axis] += delta * sign;
    for (const r of plan.rooms) if (r.floorId === fid) for (const p of r.pts) if (hit(p[axis])) p[axis] += delta * sign;
    for (const o of [...plan.furniture, ...plan.stairs]) if (o.floorId === fid && hit(o[axis])) o[axis] += delta * sign;
    refitOpenings(plan, fid, centers);
  }
  function scaleFloor(plan, fid, k, origin) {
    const sc = p => { p.x = origin.x + (p.x - origin.x) * k; p.y = origin.y + (p.y - origin.y) * k; };
    const centers = openingCenters(plan, fid); centers.forEach(sc);
    for (const w of floorWalls(plan, fid)) { sc(w.a); sc(w.b); }
    for (const r of plan.rooms) if (r.floorId === fid) r.pts.forEach(sc);
    for (const o of [...plan.furniture, ...plan.stairs]) if (o.floorId === fid) sc(o);
    refitOpenings(plan, fid, centers);
  }
  /**
   * Setter veggens senterlinjelengde. mode: 'stretch' (strekk tegningen, beholder rette vinkler),
   * 'corner' (flytt bare sluttpunktet), 'scale' (skaler hele etasjen).
   */
  function setWallLength(plan, w, target, mode = 'stretch') {
    const L = wallLen(w); if (L < 1 || !(target > 0)) return;
    const delta = target - L; const d = wallDir(w);
    if (mode === 'scale') { scaleFloor(plan, w.floorId, target / L, { x: w.a.x, y: w.a.y }); return; }
    const horiz = Math.abs(d.x) > 0.999, vert = Math.abs(d.y) > 0.999;
    if (mode === 'stretch' && (horiz || vert)) {
      const axis = horiz ? 'x' : 'y'; const sign = d[axis] > 0 ? 1 : -1;
      stretch(plan, w.floorId, axis, w.b[axis], delta, sign);
      return;
    }
    moveNode(plan, w.floorId, w.b, { x: w.b.x + d.x * delta, y: w.b.y + d.y * delta });
  }
  function deleteWall(plan, id) { plan.walls = plan.walls.filter(w => w.id !== id); plan.openings = plan.openings.filter(o => o.wallId !== id); }
  function deleteRoom(plan, id, withWalls) {
    const r = byId(plan.rooms, id); if (!r) return;
    plan.rooms = plan.rooms.filter(x => x.id !== id);
    if (withWalls) {
      // fjern vegger som bare tilhørte dette rommet
      for (const w of plan.walls.slice()) {
        if (w.floorId !== r.floorId) continue;
        const onEdge = r.pts.some((p, i) => { const q = r.pts[(i + 1) % r.pts.length]; return collinear(w, p, q, 4) && project({ a: p, b: q }, { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 }).dist < 4; });
        if (onEdge && roomsOfWall(plan, w).length === 0) deleteWall(plan, w.id);
      }
    }
  }
  /** Retter opp nesten like koordinater (for rom fra bildetolking) slik at felles vegger faller sammen. */
  function snapClusters(rooms, tol = 130) {
    for (const axis of ['x', 'y']) {
      const vals = []; rooms.forEach(r => r.pts.forEach(p => vals.push(p)));
      vals.sort((a, b) => a[axis] - b[axis]);
      let group = [];
      const flush = () => { if (group.length > 1) { const m = Math.round(group.reduce((s, p) => s + p[axis], 0) / group.length); group.forEach(p => p[axis] = m); } group = []; };
      for (const p of vals) { if (group.length && p[axis] - group[0][axis] > tol) flush(); group.push(p); }
      flush();
    }
  }

  /** Fjerner eller kutter vegger som ligger oppå andre vegger. Åpninger flyttes til veggen som blir stående. */
  function mergeOverlaps(plan, fid) {
    let changed = false;
    const walls = floorWalls(plan, fid).sort((a, b) => (b.confirmed ? 1 : 0) - (a.confirmed ? 1 : 0) || wallLen(b) - wallLen(a));
    for (const w of walls) {
      if (!plan.walls.includes(w)) continue;
      const others = { walls: plan.walls.filter(x => x !== w) };
      const parts = uncovered(others, fid, w.a, w.b);
      if (parts.length === 1 && Math.abs(dist(parts[0].a, parts[0].b) - wallLen(w)) < 2) continue;
      changed = true;
      const ops = openingsOf(plan, w.id).map(o => ({ o, c: ptAt(w, o.offset) }));
      const keep = parts.map((p, i) => i === 0 ? Object.assign(w, { a: p.a, b: p.b }) : (() => { const nw = Object.assign(clone(w), { id: uid('w'), a: p.a, b: p.b }); plan.walls.push(nw); return nw; })());
      if (!parts.length) plan.walls = plan.walls.filter(x => x !== w);
      for (const { o, c } of ops) {
        const target = keep.find(k => project(k, c).dist < 3 && project(k, c).t > 0 && project(k, c).t < wallLen(k)) || plan.walls.find(k => k !== w && k.floorId === fid && project(k, c).dist < 6 && project(k, c).t > 0 && project(k, c).t < wallLen(k));
        if (target) { o.wallId = target.id; o.offset = project(target, c).t; } else plan.openings = plan.openings.filter(x => x !== o);
      }
    }
    return changed;
  }
  const clone = o => JSON.parse(JSON.stringify(o));

  // ---------- Kontroll av mål ----------
  function validate(plan) {
    const out = [];
    const warn = (level, text, ref) => out.push({ level, text, ref });
    for (const w of plan.walls) {
      const L = wallLen(w);
      if (L < 50) warn('bad', 'En vegg er kortere enn 5 cm. Slett den eller gi den riktig lengde.', { kind: 'wall', id: w.id });
      if (w.confirmed && w.confirmed.inner) {
        const now = wallInner(w); const diff = now - w.confirmed.inner;
        if (Math.abs(diff) > 10) warn('bad', `Bekreftet mål ${HM.util.fmtLen(w.confirmed.inner)} stemmer ikke med tegningen (${HM.util.fmtLen(now)}). En annen endring har forskjøvet veggen.`, { kind: 'wall', id: w.id });
      }
      const ops = openingsOf(plan, w.id).sort((a, b) => a.offset - b.offset);
      const H = wallHeight(plan, w);
      ops.forEach((o, i) => {
        if (o.offset - o.width / 2 < -5 || o.offset + o.width / 2 > L + 5) warn('bad', `${typeName(o.type)} (${HM.util.fmtLen(o.width)}) går utenfor veggen.`, { kind: 'opening', id: o.id });
        const top = (o.type === 'window' ? (o.sill || 0) : 0) + (o.height || 0);
        if (top > H + 5) warn('warn', `${typeName(o.type)} er høyere (${HM.util.fmtLen(top)}) enn takhøyden (${HM.util.fmtLen(H)}).`, { kind: 'opening', id: o.id });
        const nx = ops[i + 1]; if (nx && o.offset + o.width / 2 > nx.offset - nx.width / 2 + 5) warn('bad', `${typeName(o.type)} og ${typeName(nx.type).toLowerCase()} overlapper på samme vegg.`, { kind: 'opening', id: o.id });
      });
    }
    // overlappende vegger
    const fw = plan.walls;
    for (let i = 0; i < fw.length; i++) for (let j = i + 1; j < fw.length; j++) {
      const a = fw[i], b = fw[j]; if (a.floorId !== b.floorId) continue;
      if (!collinear(a, b.a, b.b, 3)) continue;
      let t1 = project(a, b.a).t, t2 = project(a, b.b).t; if (t1 > t2) [t1, t2] = [t2, t1];
      const ov = Math.min(wallLen(a), t2) - Math.max(0, t1);
      if (ov > 20) warn('warn', 'To vegger ligger oppå hverandre. Slett den ene.', { kind: 'wall', id: b.id });
    }
    // motstående bekreftede mål i rektangulære rom
    for (const r of plan.rooms) {
      const net = roomNet(plan, r);
      if (net.area < 0.5e6) warn('warn', `${r.name} er mindre enn 0,5 m². Sjekk målene.`, { kind: 'room', id: r.id });
      if (r.confirmed && net.isRect) {
        const okA = Math.abs(net.w - r.confirmed.w) <= 10 && Math.abs(net.l - r.confirmed.l) <= 10;
        const okB = Math.abs(net.w - r.confirmed.l) <= 10 && Math.abs(net.l - r.confirmed.w) <= 10;
        if (!okA && !okB) warn('bad', `${r.name}: bekreftede mål ${HM.util.fmtLen(r.confirmed.w)} × ${HM.util.fmtLen(r.confirmed.l)} stemmer ikke lenger med tegningen (${HM.util.fmtLen(net.w)} × ${HM.util.fmtLen(net.l)}).`, { kind: 'room', id: r.id });
      }
      const missing = r.pts.filter((p, i) => !edgeWall(plan, r.floorId, p, r.pts[(i + 1) % r.pts.length])).length;
      if (missing) warn('info', `${r.name} mangler vegg på ${missing === 1 ? 'én side' : missing + ' sider'}. Det er greit for åpne løsninger.`, { kind: 'room', id: r.id });
      if (r.pts.length === 4 && net.isRect) {
        const ws = r.pts.map((p, i) => edgeWall(plan, r.floorId, p, r.pts[(i + 1) % 4]));
        for (const [i, j] of [[0, 2], [1, 3]]) {
          const A = ws[i], B = ws[j];
          if (A && B && A.confirmed && B.confirmed && Math.abs(wallLen(A) - wallLen(B)) < 5 && Math.abs((A.confirmed.inner + A.t) - (B.confirmed.inner + B.t)) > 15)
            warn('bad', `Motstående vegger i ${r.name} har ulike bekreftede mål (${HM.util.fmtLen(A.confirmed.inner)} og ${HM.util.fmtLen(B.confirmed.inner)}). Rommet er kanskje ikke rektangulært, eller ett av målene er feil.`, { kind: 'room', id: r.id });
        }
      }
      const c = roomCeiling(plan, r);
      if (c < 1900 || c > 6000) warn('warn', `Takhøyden i ${r.name} (${HM.util.fmtLen(c)}) virker uvanlig.`, { kind: 'room', id: r.id });
    }
    return out;
  }
  const typeName = t => ({ door: 'Dør', window: 'Vindu', opening: 'Åpning' }[t] || 'Åpning');

  // Bibliotek: enkle møbler i vanlige mål (mm): b × d × h
  const FURNITURE = [
    { type: 'sofa3', name: 'Sofa, 3-seter', w: 2100, d: 900, h: 800, color: '#7C8C99', cat: 'Stue' },
    { type: 'sofa2', name: 'Sofa, 2-seter', w: 1600, d: 900, h: 800, color: '#7C8C99', cat: 'Stue' },
    { type: 'lenestol', name: 'Lenestol', w: 800, d: 850, h: 850, color: '#9A7D63', cat: 'Stue' },
    { type: 'salongbord', name: 'Salongbord', w: 1200, d: 600, h: 450, color: '#B08B62', cat: 'Stue' },
    { type: 'tvbenk', name: 'TV-benk', w: 1800, d: 400, h: 500, color: '#5E5A55', cat: 'Stue' },
    { type: 'bokhylle', name: 'Bokhylle', w: 800, d: 300, h: 2000, color: '#E9E4DA', cat: 'Stue' },
    { type: 'spisebord', name: 'Spisebord, 6 pers.', w: 1800, d: 900, h: 750, color: '#B08B62', cat: 'Kjøkken' },
    { type: 'spisebord4', name: 'Spisebord, 4 pers.', w: 1200, d: 800, h: 750, color: '#B08B62', cat: 'Kjøkken' },
    { type: 'stol', name: 'Stol', w: 450, d: 520, h: 900, color: '#3F3B37', cat: 'Kjøkken' },
    { type: 'benk60', name: 'Kjøkkenbenk, 60 cm modul', w: 600, d: 600, h: 900, color: '#F1EFEA', cat: 'Kjøkken' },
    { type: 'benk240', name: 'Kjøkkenbenk, 240 cm', w: 2400, d: 600, h: 900, color: '#F1EFEA', cat: 'Kjøkken' },
    { type: 'overskap', name: 'Overskap, 60 cm', w: 600, d: 350, h: 700, color: '#F1EFEA', cat: 'Kjøkken', elev: 1500 },
    { type: 'kjoleskap', name: 'Kjøleskap', w: 600, d: 650, h: 1850, color: '#DADDE0', cat: 'Kjøkken' },
    { type: 'komfyr', name: 'Komfyr', w: 600, d: 600, h: 900, color: '#2F3337', cat: 'Kjøkken' },
    { type: 'oy', name: 'Kjøkkenøy', w: 1800, d: 900, h: 900, color: '#F1EFEA', cat: 'Kjøkken' },
    { type: 'seng160', name: 'Dobbeltseng 160', w: 1600, d: 2000, h: 500, color: '#E6E1D8', cat: 'Soverom' },
    { type: 'seng180', name: 'Dobbeltseng 180', w: 1800, d: 2000, h: 500, color: '#E6E1D8', cat: 'Soverom' },
    { type: 'seng90', name: 'Enkeltseng 90', w: 900, d: 2000, h: 500, color: '#E6E1D8', cat: 'Soverom' },
    { type: 'nattbord', name: 'Nattbord', w: 450, d: 400, h: 500, color: '#B08B62', cat: 'Soverom' },
    { type: 'garderobe', name: 'Garderobeskap, 100 cm', w: 1000, d: 600, h: 2000, color: '#EDEAE3', cat: 'Soverom' },
    { type: 'skrivebord', name: 'Skrivebord', w: 1400, d: 700, h: 750, color: '#D9CBB5', cat: 'Kontor' },
    { type: 'toalett', name: 'Toalett', w: 400, d: 650, h: 800, color: '#FFFFFF', cat: 'Bad' },
    { type: 'servant', name: 'Servant med skap', w: 600, d: 460, h: 850, color: '#FFFFFF', cat: 'Bad' },
    { type: 'dusj', name: 'Dusjhjørne 90×90', w: 900, d: 900, h: 2000, color: '#CFE3EA', cat: 'Bad', glass: true },
    { type: 'badekar', name: 'Badekar', w: 1700, d: 750, h: 550, color: '#FFFFFF', cat: 'Bad' },
    { type: 'vaskemaskin', name: 'Vaskemaskin', w: 600, d: 600, h: 850, color: '#E3E5E7', cat: 'Bad' },
    { type: 'tork', name: 'Tørketrommel', w: 600, d: 600, h: 850, color: '#E3E5E7', cat: 'Bad' },
    { type: 'skohylle', name: 'Skohylle', w: 800, d: 300, h: 1000, color: '#EDEAE3', cat: 'Gang' },
  ];
  // Overflater for gulv (navn → farge) og forslag til veggfarger
  const FLOORS = { eik: ['Eik', '#C9A57A'], ask: ['Ask, lys', '#DCC7A3'], valnott: ['Valnøtt', '#7B5A41'], gran: ['Gran, lakkert', '#D9B67E'], flis_gra: ['Flis, grå', '#9EA3A3'], flis_lys: ['Flis, lys', '#E4E1DA'], flis_mork: ['Flis, mørk', '#4E5256'], vinyl: ['Vinyl', '#B9B2A6'], teppe: ['Teppe', '#8C8A87'], betong: ['Betong', '#A9A9A4'], skifer: ['Skifer', '#55595B'] };
  const WALL_COLORS = [['Hvit', '#F4F3EF'], ['Brukket hvit', '#EDE8DD'], ['Lys grå', '#D9DAD6'], ['Varm grå', '#BDB6AA'], ['Salvie', '#B7C2AE'], ['Duegrå blå', '#A9B7C2'], ['Støvet rosa', '#D9BDB4'], ['Oker', '#D8B26E'], ['Mørk grønn', '#3F5A4C'], ['Blekk', '#2E3A4B'], ['Terrakotta', '#B8715A'], ['Antrasitt', '#45484B']];

  HM.geo = { dist, same, wallLen, wallDir, wallNormal, wallInner, ptAt, project, segDist, polyArea, centroid, pointInPoly, insetPolygon, edgeWall, wallAtPoint, roomNet, roomCeiling, roomsOfWall, wallHeight, openingsOf, uncovered, newWall, addWallsForPolygon, addRoom, rectFromInner, moveNode, stretch, scaleFloor, setWallLength, deleteWall, deleteRoom, snapClusters, mergeOverlaps, validate, typeName, floorWalls, FURNITURE, FLOORS, WALL_COLORS };
})();
