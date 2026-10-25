/* Tegning av plantegning på canvas. Brukes av editoren, forhåndsvisning og eksport. */
(function () {
  const G = HM.geo; const { fmtLen, fmtArea, byId } = HM.util;

  HM.cssColors = function (fixedLight) {
    const light = { bg: '#FBFBF8', grid: '#E6E9E3', gridMajor: '#CED5CD', wall: '#22302A', room: '#EEF3EE', ok: '#2E7A4C', src: '#2F64A0', est: '#A86A12', bad: '#B23B3B', ink: '#18231F', muted: '#5B6862', accent: '#2C6A57', surface: '#FFFFFF' };
    if (fixedLight) return light;
    const cs = getComputedStyle(document.documentElement); const g = n => cs.getPropertyValue(n).trim();
    return { bg: g('--plan-bg') || light.bg, grid: g('--plan-grid') || light.grid, gridMajor: g('--plan-grid-major') || light.gridMajor, wall: g('--wall') || light.wall, room: g('--room-fill') || light.room, ok: g('--ok') || light.ok, src: g('--src') || light.src, est: g('--est') || light.est, bad: g('--bad') || light.bad, ink: g('--ink') || light.ink, muted: g('--muted') || light.muted, accent: g('--accent') || light.accent, surface: g('--surface') || light.surface };
  };
  const statusColor = (C, st) => st === 'bekreftet' ? C.wall : st === 'materiale' ? C.src : C.est;

  /** Grenser for en etasje (mm). */
  HM.planBounds = function (plan, fid) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = p => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); };
    plan.walls.filter(w => w.floorId === fid).forEach(w => { add(w.a); add(w.b); });
    plan.rooms.filter(r => r.floorId === fid).forEach(r => r.pts.forEach(add));
    [...plan.furniture, ...plan.stairs].filter(o => o.floorId === fid).forEach(o => { add({ x: o.x - 500, y: o.y - 500 }); add({ x: o.x + 500, y: o.y + 500 }); });
    if (!isFinite(x0)) return null;
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  };
  HM.fitView = function (plan, fid, W, H, pad = 50) {
    const b = HM.planBounds(plan, fid) || { x0: -1000, y0: -1000, w: 6000, h: 4000 };
    const s = Math.min((W - pad * 2) / Math.max(b.w, 2000), (H - pad * 2) / Math.max(b.h, 2000));
    return { s, ox: W / 2 - (b.x0 + b.w / 2) * s, oy: H / 2 - (b.y0 + (b.h || 0) / 2) * s };
  };

  function rectPoly(ctx, v, cx, cy, w, d, rot) {
    const a = rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, y]) => [v.ox + (cx + x * c - y * s) * v.s, v.oy + (cy + x * s + y * c) * v.s]);
    ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
    return pts;
  }

  /**
   * Tegner én etasje. opts: { sel, hover, labels(true), grid(true), ghostFloorId, colors, flags(true), furniture(true) }
   */
  HM.drawPlan = function (ctx, plan, fid, v, W, H, opts = {}) {
    const C = opts.colors || HM.cssColors();
    const X = x => v.ox + x * v.s, Y = y => v.oy + y * v.s;
    ctx.save();
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    // rutenett
    if (opts.grid !== false) {
      const drawGrid = (step, color) => {
        if (step * v.s < 7) return;
        ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath();
        const x0 = Math.floor(-v.ox / v.s / step) * step, x1 = (W - v.ox) / v.s, y0 = Math.floor(-v.oy / v.s / step) * step, y1 = (H - v.oy) / v.s;
        for (let x = x0; x <= x1; x += step) { const px = Math.round(X(x)) + .5; ctx.moveTo(px, 0); ctx.lineTo(px, H); }
        for (let y = y0; y <= y1; y += step) { const py = Math.round(Y(y)) + .5; ctx.moveTo(0, py); ctx.lineTo(W, py); }
        ctx.stroke();
      };
      drawGrid(100, C.grid); drawGrid(1000, C.gridMajor);
    }
    // spøkelse av etasjen under
    if (opts.ghostFloorId) {
      ctx.strokeStyle = C.gridMajor; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.beginPath();
      plan.walls.filter(w => w.floorId === opts.ghostFloorId).forEach(w => { ctx.moveTo(X(w.a.x), Y(w.a.y)); ctx.lineTo(X(w.b.x), Y(w.b.y)); });
      ctx.stroke(); ctx.setLineDash([]);
    }
    const rooms = plan.rooms.filter(r => r.floorId === fid);
    const walls = plan.walls.filter(w => w.floorId === fid);
    // rom
    for (const r of rooms) {
      const net = G.roomNet(plan, r);
      ctx.beginPath(); net.inner.forEach((p, i) => i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))); ctx.closePath();
      const fin = G.FLOORS[r.floorFinish];
      ctx.fillStyle = C.room; ctx.fill();
      if (fin && opts.finishTint !== false) { ctx.globalAlpha = 0.16; ctx.fillStyle = fin[1]; ctx.fill(); ctx.globalAlpha = 1; }
      if (opts.sel && opts.sel.kind === 'room' && opts.sel.id === r.id) { ctx.fillStyle = C.accent; ctx.globalAlpha = 0.14; ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.stroke(); }
    }
    // trapper
    for (const st of plan.stairs.filter(s => s.floorId === fid)) {
      ctx.fillStyle = C.surface; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2;
      rectPoly(ctx, v, st.x, st.y, st.w, st.l, st.rot || 0); ctx.fill(); ctx.stroke();
      const n = st.steps || 14; const a = (st.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      ctx.beginPath();
      for (let i = 1; i < n; i++) { const yy = -st.l / 2 + st.l * i / n; const p1 = [-st.w / 2, yy], p2 = [st.w / 2, yy]; ctx.moveTo(X(st.x + p1[0] * c - p1[1] * s), Y(st.y + p1[0] * s + p1[1] * c)); ctx.lineTo(X(st.x + p2[0] * c - p2[1] * s), Y(st.y + p2[0] * s + p2[1] * c)); }
      // pil
      const t0 = [0, st.l / 2 - 150], t1 = [0, -st.l / 2 + 200];
      ctx.moveTo(X(st.x + t0[0] * c - t0[1] * s), Y(st.y + t0[0] * s + t0[1] * c)); ctx.lineTo(X(st.x + t1[0] * c - t1[1] * s), Y(st.y + t1[0] * s + t1[1] * c));
      ctx.stroke();
      if (opts.sel && opts.sel.kind === 'stairs' && opts.sel.id === st.id) { ctx.strokeStyle = C.accent; ctx.lineWidth = 2.5; rectPoly(ctx, v, st.x, st.y, st.w, st.l, st.rot || 0); ctx.stroke(); }
    }
    // møbler
    if (opts.furniture !== false) for (const f of plan.furniture.filter(x => x.floorId === fid)) {
      rectPoly(ctx, v, f.x, f.y, f.w, f.d, f.rot || 0);
      ctx.fillStyle = f.color || '#ccc'; ctx.globalAlpha = 0.55; ctx.fill(); ctx.globalAlpha = 1;
      const isSel = opts.sel && opts.sel.kind === 'furniture' && opts.sel.id === f.id;
      ctx.strokeStyle = isSel ? C.accent : C.muted; ctx.lineWidth = isSel ? 2.5 : 1; ctx.stroke();
      if (opts.labels !== false && f.w * v.s > 46 && f.d * v.s > 16) {
        ctx.save(); ctx.translate(X(f.x), Y(f.y)); let a = (f.rot || 0) * Math.PI / 180; if (Math.cos(a) < -0.01) a += Math.PI; ctx.rotate(a);
        ctx.fillStyle = C.ink; ctx.font = `500 ${Math.max(9, Math.min(12, f.d * v.s / 3))}px "Hanken Grotesk", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const label = f.name.length > 18 && f.w * v.s < 120 ? f.name.split(',')[0] : f.name; ctx.fillText(label, 0, 0, f.w * v.s - 6); ctx.restore();
      }
    }
    // vegger
    for (const w of walls) {
      const L = G.wallLen(w); if (L < 1) continue;
      const d = G.wallDir(w), n = { x: -d.y, y: d.x }, h = (w.t || 100) / 2;
      const corners = [{ x: w.a.x + n.x * h, y: w.a.y + n.y * h }, { x: w.b.x + n.x * h, y: w.b.y + n.y * h }, { x: w.b.x - n.x * h, y: w.b.y - n.y * h }, { x: w.a.x - n.x * h, y: w.a.y - n.y * h }];
      // forleng litt i hver ende slik at hjørner lukkes
      const ext = h; corners[0].x -= d.x * ext; corners[0].y -= d.y * ext; corners[3].x -= d.x * ext; corners[3].y -= d.y * ext; corners[1].x += d.x * ext; corners[1].y += d.y * ext; corners[2].x += d.x * ext; corners[2].y += d.y * ext;
      ctx.beginPath(); corners.forEach((p, i) => i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))); ctx.closePath();
      const col = statusColor(C, w.status);
      if (w.status === 'anslatt') { ctx.fillStyle = col; ctx.globalAlpha = 0.45; ctx.fill(); ctx.globalAlpha = 1; ctx.setLineDash([5, 3]); ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]); }
      else { ctx.fillStyle = col; ctx.fill(); }
    }
    // åpninger
    for (const o of plan.openings) {
      const w = byId(walls, o.wallId); if (!w) continue;
      const d = G.wallDir(w), n = { x: -d.y, y: d.x }, h = (w.t || 100) / 2 + 2;
      const c = G.ptAt(w, o.offset); const hw = o.width / 2;
      const p1 = { x: c.x - d.x * hw, y: c.y - d.y * hw }, p2 = { x: c.x + d.x * hw, y: c.y + d.y * hw };
      ctx.beginPath(); [[p1, h], [p2, h], [p2, -h], [p1, -h]].forEach(([p, k], i) => { const x = X(p.x + n.x * k), y = Y(p.y + n.y * k); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath();
      ctx.fillStyle = C.bg; ctx.fill();
      const isSel = opts.sel && opts.sel.kind === 'opening' && opts.sel.id === o.id;
      ctx.strokeStyle = isSel ? C.accent : (o.status === 'anslatt' ? C.est : o.status === 'materiale' ? C.src : C.ink); ctx.lineWidth = isSel ? 2.5 : 1.4;
      if (o.type === 'window') {
        const k = (w.t || 100) / 2;
        ctx.beginPath();
        for (const kk of [k, -k, k * 0.25, -k * 0.25]) { ctx.moveTo(X(p1.x + n.x * kk), Y(p1.y + n.y * kk)); ctx.lineTo(X(p2.x + n.x * kk), Y(p2.y + n.y * kk)); }
        ctx.moveTo(X(p1.x + n.x * k), Y(p1.y + n.y * k)); ctx.lineTo(X(p1.x - n.x * k), Y(p1.y - n.y * k));
        ctx.moveTo(X(p2.x + n.x * k), Y(p2.y + n.y * k)); ctx.lineTo(X(p2.x - n.x * k), Y(p2.y - n.y * k));
        ctx.stroke();
      } else if (o.type === 'door') {
        const hinge = o.hinge === 'b' ? p2 : p1, free = o.hinge === 'b' ? p1 : p2;
        const sw = o.swing === -1 ? -1 : 1; const k = (w.t || 100) / 2 * sw;
        const hp = { x: hinge.x + n.x * k, y: hinge.y + n.y * k };
        const leafEnd = { x: hp.x + n.x * o.width * sw, y: hp.y + n.y * o.width * sw };
        ctx.beginPath(); ctx.moveTo(X(hp.x), Y(hp.y)); ctx.lineTo(X(leafEnd.x), Y(leafEnd.y)); ctx.stroke();
        const a0 = Math.atan2(leafEnd.y - hp.y, leafEnd.x - hp.x); const fp = { x: free.x + n.x * k, y: free.y + n.y * k }; const a1 = Math.atan2(fp.y - hp.y, fp.x - hp.x);
        let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        ctx.beginPath(); ctx.setLineDash([3, 3]); ctx.arc(X(hp.x), Y(hp.y), o.width * v.s, a0, a0 + da, da < 0); ctx.stroke(); ctx.setLineDash([]);
      } else {
        ctx.setLineDash([4, 3]); const k = (w.t || 100) / 2; ctx.beginPath();
        ctx.moveTo(X(p1.x + n.x * k), Y(p1.y + n.y * k)); ctx.lineTo(X(p1.x - n.x * k), Y(p1.y - n.y * k));
        ctx.moveTo(X(p2.x + n.x * k), Y(p2.y + n.y * k)); ctx.lineTo(X(p2.x - n.x * k), Y(p2.y - n.y * k)); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    // valgt vegg
    if (opts.sel && opts.sel.kind === 'wall') {
      const w = byId(walls, opts.sel.id);
      if (w) { ctx.strokeStyle = C.accent; ctx.lineWidth = Math.max(3, (w.t || 100) * v.s + 4); ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.moveTo(X(w.a.x), Y(w.a.y)); ctx.lineTo(X(w.b.x), Y(w.b.y)); ctx.stroke(); ctx.globalAlpha = 1; }
    }
    // mål på vegger
    if (opts.labels !== false) {
      ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const w of walls) {
        const L = G.wallLen(w); if (L * v.s < 48) continue;
        const d = G.wallDir(w); let nx = -d.y, ny = d.x;
        // legg målet på utsiden av huset om mulig: velg siden som ikke er inne i et rom
        const mid = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
        const off = (w.t || 100) / 2 + 13 / v.s;
        const test = { x: mid.x + nx * (w.t + 60), y: mid.y + ny * (w.t + 60) };
        if (rooms.some(r => G.pointInPoly(test, r.pts))) { const test2 = { x: mid.x - nx * (w.t + 60), y: mid.y - ny * (w.t + 60) }; if (!rooms.some(r => G.pointInPoly(test2, r.pts))) { nx = -nx; ny = -ny; } }
        const px = X(mid.x + nx * off), py = Y(mid.y + ny * off);
        let ang = Math.atan2(d.y, d.x); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
        const txt = fmtLen(G.wallInner(w), w.status !== 'bekreftet');
        ctx.save(); ctx.translate(px, py); ctx.rotate(ang);
        const tw = ctx.measureText(txt).width + 8;
        ctx.fillStyle = C.bg; ctx.globalAlpha = 0.85; ctx.fillRect(-tw / 2, -8, tw, 16); ctx.globalAlpha = 1;
        ctx.fillStyle = w.status === 'bekreftet' ? C.ok : w.status === 'materiale' ? C.src : C.est;
        ctx.fillText(txt, 0, 0); ctx.restore();
      }
      // romnavn og areal
      for (const r of rooms) {
        const net = G.roomNet(plan, r); const c = G.centroid(net.inner);
        const approx = !walls.filter(w => G.roomsOfWall(plan, w).includes(r)).every(w => w.status === 'bekreftet');
        const fs = Math.max(11, Math.min(15, Math.sqrt(net.area) * v.s / 9));
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = C.ink; ctx.font = `650 ${fs}px "Familjen Grotesk", "Hanken Grotesk", system-ui, sans-serif`;
        ctx.fillText(r.name || 'Rom', X(c.x), Y(c.y) - fs * 0.6);
        ctx.fillStyle = C.muted; ctx.font = `500 ${fs * 0.82}px "IBM Plex Mono", ui-monospace, monospace`;
        ctx.fillText((approx ? '≈ ' : '') + fmtArea(net.area), X(c.x), Y(c.y) + fs * 0.6);
      }
    }
    // «Må avklares»-flagg
    if (opts.flags !== false) {
      const flag = (x, y) => { ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fillStyle = C.bad; ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '700 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', x, y + 0.5); };
      walls.filter(w => w.needsClarification).forEach(w => flag(X((w.a.x + w.b.x) / 2), Y((w.a.y + w.b.y) / 2)));
      plan.openings.filter(o => o.needsClarification).forEach(o => { const w = byId(walls, o.wallId); if (w) { const p = G.ptAt(w, o.offset); flag(X(p.x), Y(p.y)); } });
      rooms.filter(r => r.needsClarification).forEach(r => { const c = G.centroid(r.pts); flag(X(c.x) + 40, Y(c.y) - 26); });
    }
    ctx.restore();
  };

  /** Lager et bilde av en etasje (for eksport og forsiden). */
  HM.renderPlanImage = function (plan, fid, W, H, opts = {}) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const v = HM.fitView(plan, fid, W, H, opts.pad || Math.min(W, H) * 0.08);
    HM.drawPlan(ctx, plan, fid, v, W, H, Object.assign({ colors: HM.cssColors(opts.light !== false), grid: opts.grid ?? false }, opts));
    return { canvas: c, view: v };
  };
})();
