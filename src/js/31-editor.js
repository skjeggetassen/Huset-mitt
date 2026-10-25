/* Interaktiv plantegningseditor: tegne, flytte, målsette. Mus, berøring og tastatur. */
(function () {
  const G = HM.geo; const { byId, uid, fmtLen, clamp } = HM.util;

  // Felles utvalg mellom 2D, 3D og egenskapspanelet
  HM.sel = null;
  HM.selListeners = new Set();
  HM.select = function (kind, id, opts = {}) {
    HM.sel = kind ? { kind, id } : null;
    HM.selListeners.forEach(fn => { try { fn(HM.sel, opts); } catch (e) { console.error(e); } });
  };
  HM.editorFloor = null;
  HM.activeFloorId = function () {
    const plan = HM.plan();
    if (!HM.editorFloor || !byId(plan.floors, HM.editorFloor)) HM.editorFloor = plan.floors[0].id;
    return HM.editorFloor;
  };

  HM.createEditor = function (pane) {
    const canvas = document.createElement('canvas'); pane.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = 1;
    let view = null;
    const ed = { tool: 'select', ortho: true, measure: null, chain: null, preview: null, destroyed: false };
    const pointers = new Map(); let gesture = null; let drag = null; let hoverSnap = null;

    function resize() {
      const r = pane.getBoundingClientRect(); dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(50, r.width); H = Math.max(50, r.height);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      if (!view) view = HM.fitView(HM.plan(), HM.activeFloorId(), W, H, 60);
      draw();
    }
    const ro = new ResizeObserver(resize); ro.observe(pane);
    const toMM = (sx, sy) => ({ x: (sx - view.ox) / view.s, y: (sy - view.oy) / view.s });
    const evPos = e => { const r = canvas.getBoundingClientRect(); return { sx: e.clientX - r.left, sy: e.clientY - r.top }; };

    function nodes(excl) {
      const plan = HM.plan(), fid = HM.activeFloorId(); const out = [];
      plan.walls.forEach(w => { if (w.floorId === fid && !(excl && excl(w))) { out.push(w.a, w.b); } });
      plan.rooms.forEach(r => { if (r.floorId === fid && !(excl && excl(r))) out.push(...r.pts); });
      return out;
    }
    function snap(p, from, opt = {}) {
      const tol = 12 / view.s;
      if (!opt.noNode) {
        let best = null, bd = tol;
        for (const n of nodes(opt.excl)) { const d = Math.hypot(n.x - p.x, n.y - p.y); if (d < bd) { bd = d; best = n; } }
        if (best) return { x: best.x, y: best.y, node: true };
      }
      let q = { x: Math.round(p.x / 50) * 50, y: Math.round(p.y / 50) * 50 };
      if (from && ed.ortho) { if (Math.abs(q.x - from.x) > Math.abs(q.y - from.y)) q.y = from.y; else q.x = from.x; }
      // fest til linjen gjennom eksisterende punkter (justering)
      if (!opt.noAlign) for (const n of nodes(opt.excl)) { if (Math.abs(n.x - p.x) < tol && !(from && ed.ortho && q.x === from.x)) q.x = n.x; if (Math.abs(n.y - p.y) < tol && !(from && ed.ortho && q.y === from.y)) q.y = n.y; }
      return q;
    }

    // ---------- Treff ----------
    function hit(p) {
      const plan = HM.plan(), fid = HM.activeFloorId(); const tol = 9 / view.s;
      const walls = plan.walls.filter(w => w.floorId === fid);
      // håndtak på valgt element
      if (HM.sel) {
        if (HM.sel.kind === 'wall') { const w = byId(walls, HM.sel.id); if (w) for (const k of ['a', 'b']) if (Math.hypot(w[k].x - p.x, w[k].y - p.y) < tol * 1.6) return { kind: 'node', pt: { x: w[k].x, y: w[k].y } }; }
        if (HM.sel.kind === 'room') { const r = byId(plan.rooms, HM.sel.id); if (r) for (const q of r.pts) if (Math.hypot(q.x - p.x, q.y - p.y) < tol * 1.6) return { kind: 'node', pt: { x: q.x, y: q.y } }; }
        if (HM.sel.kind === 'furniture' || HM.sel.kind === 'stairs') { const f = byId(HM.sel.kind === 'furniture' ? plan.furniture : plan.stairs, HM.sel.id); if (f) { const hp = rotHandle(f); if (Math.hypot(hp.x - p.x, hp.y - p.y) < tol * 1.8) return { kind: 'rotate', obj: f }; } }
      }
      for (const o of plan.openings) { const w = byId(walls, o.wallId); if (!w) continue; const pr = G.project(w, p); if (pr.dist < (w.t / 2 + tol) && Math.abs(pr.t - o.offset) < o.width / 2) return { kind: 'opening', id: o.id }; }
      for (const f of plan.furniture.slice().reverse()) if (f.floorId === fid && inRot(p, f, f.w, f.d)) return { kind: 'furniture', id: f.id };
      for (const s of plan.stairs) if (s.floorId === fid && inRot(p, s, s.w, s.l)) return { kind: 'stairs', id: s.id };
      let bw = null, bd = Infinity; for (const w of walls) { const pr = G.project(w, p); if (pr.t > -w.t / 2 && pr.t < G.wallLen(w) + w.t / 2 && pr.dist < w.t / 2 + tol && pr.dist < bd) { bd = pr.dist; bw = w; } }
      if (bw) return { kind: 'wall', id: bw.id };
      const rooms = plan.rooms.filter(r => r.floorId === fid);
      for (const r of rooms.slice().reverse()) if (G.pointInPoly(p, r.pts)) return { kind: 'room', id: r.id };
      return null;
    }
    function inRot(p, o, w, d) { const a = -(o.rot || 0) * Math.PI / 180; const dx = p.x - o.x, dy = p.y - o.y; const x = dx * Math.cos(a) - dy * Math.sin(a), y = dx * Math.sin(a) + dy * Math.cos(a); return Math.abs(x) <= w / 2 && Math.abs(y) <= d / 2; }
    function rotHandle(f) { const a = (f.rot || 0) * Math.PI / 180; const len = (f.d || f.l) / 2 + 28 / view.s; return { x: f.x + Math.sin(a) * len, y: f.y - Math.cos(a) * len }; }

    // ---------- Tegning ----------
    let raf = 0;
    function draw() { if (raf || ed.destroyed) return; raf = requestAnimationFrame(() => { raf = 0; paint(); }); }
    function paint() {
      if (!view) return;
      const plan = HM.plan(), fid = HM.activeFloorId();
      const C = HM.cssColors();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const fl = byId(plan.floors, fid); const below = plan.floors.filter(f => f.elevation < fl.elevation).sort((a, b) => b.elevation - a.elevation)[0];
      HM.drawPlan(ctx, plan, fid, view, W, H, { sel: HM.sel, colors: C, ghostFloorId: below && below.id });
      const X = x => view.ox + x * view.s, Y = y => view.oy + y * view.s;
      // håndtak
      const handle = (p, col = C.accent) => { ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 7, 0, Math.PI * 2); ctx.fillStyle = C.surface; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = col; ctx.stroke(); };
      if (HM.sel) {
        if (HM.sel.kind === 'wall') { const w = byId(plan.walls, HM.sel.id); if (w) { handle(w.a); handle(w.b); } }
        if (HM.sel.kind === 'room') { const r = byId(plan.rooms, HM.sel.id); if (r) r.pts.forEach(p => handle(p)); }
        if (HM.sel.kind === 'furniture' || HM.sel.kind === 'stairs') { const f = byId(HM.sel.kind === 'furniture' ? plan.furniture : plan.stairs, HM.sel.id); if (f) { const hp = rotHandle(f); ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(X(f.x), Y(f.y)); ctx.lineTo(X(hp.x), Y(hp.y)); ctx.stroke(); handle(hp); } }
      }
      // forhåndsvisning av verktøy
      ctx.font = '600 12px "IBM Plex Mono", ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const lenTag = (a, b, txt) => { const mx = (X(a.x) + X(b.x)) / 2, my = (Y(a.y) + Y(b.y)) / 2 - 14; const tw = ctx.measureText(txt).width + 10; ctx.fillStyle = C.ink; ctx.fillRect(mx - tw / 2, my - 10, tw, 20); ctx.fillStyle = C.bg; ctx.fillText(txt, mx, my); };
      if (ed.chain && ed.preview) {
        ctx.strokeStyle = C.accent; ctx.lineWidth = Math.max(2, 100 * view.s); ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(X(ed.chain.x), Y(ed.chain.y)); ctx.lineTo(X(ed.preview.x), Y(ed.preview.y)); ctx.stroke(); ctx.globalAlpha = 1;
        lenTag(ed.chain, ed.preview, fmtLen(Math.hypot(ed.preview.x - ed.chain.x, ed.preview.y - ed.chain.y) - 100) + ' innv.');
      }
      if (ed.roomDraft) {
        const { a, b } = ed.roomDraft; ctx.strokeStyle = C.accent; ctx.setLineDash([6, 4]); ctx.lineWidth = 2; ctx.strokeRect(X(Math.min(a.x, b.x)), Y(Math.min(a.y, b.y)), Math.abs(b.x - a.x) * view.s, Math.abs(b.y - a.y) * view.s); ctx.setLineDash([]);
        lenTag({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }, { x: Math.max(a.x, b.x), y: Math.min(a.y, b.y) }, `${fmtLen(Math.abs(b.x - a.x) - 100)} × ${fmtLen(Math.abs(b.y - a.y) - 100)}`);
      }
      if (ed.measure) {
        const { a, b } = ed.measure; if (b) {
          ctx.strokeStyle = C.bad; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(a.x), Y(a.y)); ctx.lineTo(X(b.x), Y(b.y)); ctx.stroke();
          [a, b].forEach(p => { ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 4, 0, 7); ctx.fillStyle = C.bad; ctx.fill(); });
          lenTag(a, b, fmtLen(Math.hypot(b.x - a.x, b.y - a.y)));
        } else { ctx.beginPath(); ctx.arc(X(a.x), Y(a.y), 4, 0, 7); ctx.fillStyle = C.bad; ctx.fill(); }
      }
      if (hoverSnap && ed.tool !== 'select') { ctx.beginPath(); ctx.arc(X(hoverSnap.x), Y(hoverSnap.y), hoverSnap.node ? 7 : 4, 0, 7); ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.stroke(); }
      // målestokk
      const target = 120 / view.s; const steps = [100, 200, 500, 1000, 2000, 5000, 10000]; const sv = steps.find(s => s >= target) || 10000;
      const bx = W - 20 - sv * view.s, by = H - 18;
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx, by - 5); ctx.lineTo(bx, by); ctx.lineTo(bx + sv * view.s, by); ctx.lineTo(bx + sv * view.s, by - 5); ctx.stroke();
      ctx.fillStyle = C.ink; ctx.font = '500 11px "IBM Plex Mono", monospace'; ctx.fillText(fmtLen(sv), bx + sv * view.s / 2, by - 10);
    }

    // ---------- Levende endring (dra) ----------
    function beginLive() { drag.before = JSON.stringify(HM.plan()); }
    function endLive() {
      if (!drag || !drag.before) return;
      if (drag.after) drag.after();
      const now = JSON.stringify(HM.plan());
      if (now !== drag.before) { HM.undo.push(drag.before); HM.save(); HM.emitPlanChanged({ source: 'editor' }); }
    }
    function cancelLive() { if (drag && drag.before) { HM.version().plan = JSON.parse(drag.before); HM.emitPlanChanged({ live: true }); } drag = null; }

    // ---------- Pekerhendelser ----------
    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture(e.pointerId);
      const pos = evPos(e); pointers.set(e.pointerId, pos);
      if (pointers.size === 2) {
        if (drag && drag.before) cancelLive(); drag = null; ed.roomDraft = null;
        const [p1, p2] = [...pointers.values()];
        gesture = { d: Math.hypot(p2.sx - p1.sx, p2.sy - p1.sy), cx: (p1.sx + p2.sx) / 2, cy: (p1.sy + p2.sy) / 2, view: { ...view } };
        return;
      }
      if (pointers.size > 2) return;
      const p = toMM(pos.sx, pos.sy);
      const plan = HM.plan(), fid = HM.activeFloorId();
      const panStart = () => { drag = { kind: 'pan', start: pos, view: { ...view }, moved: false }; };
      if (e.button === 1 || e.button === 2) { panStart(); return; }
      if (ed.tool === 'select') {
        const h = hit(p);
        if (!h) { panStart(); drag.deselect = true; return; }
        if (h.kind === 'node') { drag = { kind: 'node', from: h.pt, cur: { ...h.pt }, start: pos }; beginLive(); return; }
        if (h.kind === 'rotate') { drag = { kind: 'rotate', obj: h.obj, start: pos }; beginLive(); return; }
        HM.select(h.kind, h.id, { source: 'editor' });
        if (h.kind === 'opening') { drag = { kind: 'opening', id: h.id, start: pos }; beginLive(); }
        else if (h.kind === 'furniture' || h.kind === 'stairs') { const o = byId(h.kind === 'furniture' ? plan.furniture : plan.stairs, h.id); drag = { kind: 'obj', obj: o, ox: o.x, oy: o.y, start: pos, p0: p }; beginLive(); }
        else if (h.kind === 'wall') { const w = byId(plan.walls, h.id); drag = { kind: 'wall', w, a: { ...w.a }, b: { ...w.b }, ca: { ...w.a }, cb: { ...w.b }, start: pos, p0: p }; beginLive(); }
        else if (h.kind === 'room') { startRoomDrag(byId(plan.rooms, h.id), p, pos); }
        return;
      }
      if (ed.tool === 'wall') {
        const q = snap(p, ed.chain);
        if (!ed.chain) { ed.chain = q; }
        else if (Math.hypot(q.x - ed.chain.x, q.y - ed.chain.y) > 50) {
          const start = ed.chain; const closes = !!q.node;
          HM.commitPlan(pl => { const w = G.newWall(fid, start, q); pl.walls.push(w); G.mergeOverlaps(pl, fid); });
          ed.chain = closes ? null : { x: q.x, y: q.y };
          if (closes) { ed.preview = null; HM.toast('Veggen er koblet til. Trykk for å starte en ny.'); }
        }
        draw(); return;
      }
      if (ed.tool === 'room') { const q = snap(p); drag = { kind: 'roomDraft' }; ed.roomDraft = { a: q, b: q }; draw(); return; }
      if (ed.tool === 'door' || ed.tool === 'window' || ed.tool === 'opening') { placeOpening(ed.tool, p); return; }
      if (ed.tool === 'stairs') { const q = snap(p, null, { noNode: true }); const id = uid('tr'); HM.commitPlan(pl => pl.stairs.push({ id, floorId: fid, x: q.x, y: q.y, w: 1000, l: 3000, rot: 0, steps: 15, name: 'Trapp' })); HM.select('stairs', id); setTool('select'); return; }
      if (ed.tool === 'measure') { const q = snap(p, null, { noAlign: true }); if (!ed.measure || ed.measure.b) ed.measure = { a: q }; else ed.measure.b = q; draw(); return; }
      if (ed.tool === 'furniture' && ed.placeItem) { const it = ed.placeItem; const q = snap(p, null, { noNode: true }); const id = uid('mb'); HM.commitPlan(pl => pl.furniture.push({ id, floorId: fid, type: it.type, name: it.name, x: q.x, y: q.y, w: it.w, d: it.d, h: it.h, rot: 0, color: it.color, elev: it.elev || 0, glass: !!it.glass })); HM.select('furniture', id); ed.placeItem = null; setTool('select'); return; }
    });
    function startRoomDrag(r, p, pos) {
      const plan = HM.plan();
      const own = plan.walls.filter(w => w.floorId === r.floorId && G.roomsOfWall(plan, w).length === 1 && G.roomsOfWall(plan, w)[0] === r);
      const shared = plan.walls.filter(w => w.floorId === r.floorId && G.roomsOfWall(plan, w).length > 1 && G.roomsOfWall(plan, w).includes(r));
      if (shared.length) { drag = { kind: 'pan', start: pos, view: { ...view }, moved: false }; HM.toast('Rommet deler vegg med andre rom. Dra i hjørner eller vegger for å endre det.'); return; }
      const furn = plan.furniture.filter(f => f.floorId === r.floorId && G.pointInPoly(f, r.pts));
      const st = plan.stairs.filter(f => f.floorId === r.floorId && G.pointInPoly(f, r.pts));
      // nærmeste hjørne brukes til å feste rommet inntil andre rom
      let anchor = r.pts[0], bd = Infinity; r.pts.forEach(q => { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; anchor = q; } });
      drag = { kind: 'room', r, p0: p, start: pos, anchor0: { ...anchor }, orig: { pts: r.pts.map(q => ({ ...q })), walls: own.map(w => ({ w, a: { ...w.a }, b: { ...w.b } })), objs: [...furn, ...st].map(o => ({ o, x: o.x, y: o.y })) }, excl: x => x === r || own.includes(x) };
      beginLive();
      drag.after = () => { const pl = HM.plan(); G.mergeOverlaps(pl, r.floorId); };
    }
    function placeOpening(type, p) {
      const plan = HM.plan(), fid = HM.activeFloorId();
      let best = null, bd = 400; for (const w of plan.walls.filter(w => w.floorId === fid)) { const pr = G.project(w, p); if (pr.t >= 0 && pr.t <= G.wallLen(w) && pr.dist < bd) { bd = pr.dist; best = w; } }
      if (!best) { HM.toast('Trykk på en vegg for å sette inn ' + (type === 'door' ? 'dør' : type === 'window' ? 'vindu' : 'åpning')); return; }
      const def = { door: { width: 900, height: 2100, sill: 0 }, window: { width: 1200, height: 1200, sill: 900 }, opening: { width: 900, height: 2100, sill: 0 } }[type];
      const L = G.wallLen(best); const width = Math.min(def.width, L - 40);
      if (width < 300) { HM.toast('Veggen er for kort'); return; }
      const off = clamp(Math.round(G.project(best, p).t / 10) * 10, width / 2 + 10, L - width / 2 - 10);
      const id = uid('op');
      HM.commitPlan(pl => pl.openings.push({ id, wallId: best.id, type, offset: off, width, height: def.height, sill: def.sill, hinge: 'a', swing: 1, status: 'anslatt', needsClarification: false, note: '' }));
      HM.select('opening', id); setTool('select');
    }
    canvas.addEventListener('pointermove', e => {
      const pos = evPos(e);
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, pos);
      if (gesture && pointers.size === 2) {
        const [p1, p2] = [...pointers.values()]; const d = Math.hypot(p2.sx - p1.sx, p2.sy - p1.sy); const cx = (p1.sx + p2.sx) / 2, cy = (p1.sy + p2.sy) / 2;
        const k = d / gesture.d; const v0 = gesture.view; const s = clamp(v0.s * k, 0.005, 2);
        const mx = (gesture.cx - v0.ox) / v0.s, my = (gesture.cy - v0.oy) / v0.s;
        view = { s, ox: cx - mx * s, oy: cy - my * s }; draw(); return;
      }
      const p = toMM(pos.sx, pos.sy);
      if (!drag) {
        if (ed.tool !== 'select') { hoverSnap = snap(p, ed.tool === 'wall' ? ed.chain : null, { noAlign: ed.tool === 'measure' }); if (ed.tool === 'wall' && ed.chain) ed.preview = hoverSnap; draw(); }
        else { const h = hit(p); canvas.style.cursor = h ? (h.kind === 'node' ? 'crosshair' : 'move') : 'grab'; }
        return;
      }
      const moved = Math.hypot(pos.sx - drag.start?.sx, pos.sy - drag.start?.sy) > 4; if (moved) drag.moved = true;
      const plan = HM.plan(), fid = HM.activeFloorId();
      if (drag.kind === 'pan') { if (drag.moved) { view = { ...drag.view, ox: drag.view.ox + pos.sx - drag.start.sx, oy: drag.view.oy + pos.sy - drag.start.sy }; canvas.style.cursor = 'grabbing'; draw(); } return; }
      if (!drag.moved) return;
      if (drag.kind === 'node') { const q = snap(p, null, { excl: x => false }); const isSelf = Math.abs(q.x - drag.cur.x) < 0.5 && Math.abs(q.y - drag.cur.y) < 0.5; if (!isSelf) { G.moveNode(plan, fid, drag.cur, q); drag.cur = { x: q.x, y: q.y }; } }
      else if (drag.kind === 'opening') { const o = byId(plan.openings, drag.id); const w = byId(plan.walls, o.wallId); const L = G.wallLen(w); o.offset = clamp(Math.round(G.project(w, p).t / 10) * 10, o.width / 2, L - o.width / 2); }
      else if (drag.kind === 'obj') { drag.obj.x = Math.round((drag.ox + p.x - drag.p0.x) / 10) * 10; drag.obj.y = Math.round((drag.oy + p.y - drag.p0.y) / 10) * 10; }
      else if (drag.kind === 'rotate') { const o = drag.obj; let a = Math.atan2(p.x - o.x, -(p.y - o.y)) * 180 / Math.PI; a = Math.round(a / 15) * 15; o.rot = ((a % 360) + 360) % 360; }
      else if (drag.kind === 'wall') {
        let dx = p.x - drag.p0.x, dy = p.y - drag.p0.y; const n = G.wallNormal({ a: drag.a, b: drag.b });
        // flytt vinkelrett på veggen (holder vinklene rette)
        const k = dx * n.x + dy * n.y; dx = Math.round(n.x * k / 10) * 10; dy = Math.round(n.y * k / 10) * 10;
        const na = { x: drag.a.x + dx, y: drag.a.y + dy }, nb = { x: drag.b.x + dx, y: drag.b.y + dy };
        G.moveNode(plan, fid, drag.ca, na); G.moveNode(plan, fid, drag.cb, nb); drag.ca = na; drag.cb = nb;
      }
      else if (drag.kind === 'room') {
        const target = { x: drag.anchor0.x + p.x - drag.p0.x, y: drag.anchor0.y + p.y - drag.p0.y };
        const q = snap(target, null, { excl: drag.excl });
        const dx = q.x - drag.anchor0.x, dy = q.y - drag.anchor0.y;
        drag.r.pts.forEach((pt, i) => { pt.x = drag.orig.pts[i].x + dx; pt.y = drag.orig.pts[i].y + dy; });
        drag.orig.walls.forEach(({ w, a, b }) => { w.a = { x: a.x + dx, y: a.y + dy }; w.b = { x: b.x + dx, y: b.y + dy }; });
        drag.orig.objs.forEach(({ o, x, y }) => { o.x = x + dx; o.y = y + dy; });
      }
      else if (drag.kind === 'roomDraft') { ed.roomDraft.b = snap(p); }
      draw(); HM.emitPlanChanged({ live: true, source: 'editor' });
    });
    const up = e => {
      pointers.delete(e.pointerId);
      if (gesture) { if (pointers.size < 2) gesture = null; drag = null; return; }
      if (!drag) return;
      const d = drag;
      if (d.kind === 'pan') { canvas.style.cursor = 'grab'; if (!d.moved && d.deselect) HM.select(null, null, { source: 'editor' }); drag = null; return; }
      if (d.kind === 'roomDraft') {
        const { a, b } = ed.roomDraft; ed.roomDraft = null; drag = null;
        if (Math.abs(b.x - a.x) > 600 && Math.abs(b.y - a.y) > 600) {
          const fid = HM.activeFloorId(); let rid;
          const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y), x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
          HM.commitPlan(pl => { const r = G.addRoom(pl, fid, [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], { name: 'Rom ' + (pl.rooms.filter(r => r.floorId === fid).length + 1) }); rid = r.room.id; });
          HM.select('room', rid); setTool('select');
        } else { HM.toast('Dra for å tegne et rom (minst 60 × 60 cm)'); draw(); }
        return;
      }
      if (d.moved) endLive(); else if (d.kind === 'node') { /* klikk på håndtak */ }
      drag = null; draw();
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); if (drag && drag.before) cancelLive(); drag = null; gesture = null; ed.roomDraft = null; draw(); });
    canvas.addEventListener('dblclick', () => { if (ed.tool === 'wall') { ed.chain = null; ed.preview = null; draw(); } });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => {
      e.preventDefault(); const pos = evPos(e); const k = Math.exp(-e.deltaY * 0.0015);
      const s = clamp(view.s * k, 0.005, 2); const mx = (pos.sx - view.ox) / view.s, my = (pos.sy - view.oy) / view.s;
      view = { s, ox: pos.sx - mx * s, oy: pos.sy - my * s }; draw();
    }, { passive: false });

    function setTool(t, extra) {
      ed.tool = t; ed.chain = null; ed.preview = null; ed.roomDraft = null; hoverSnap = null;
      if (t !== 'measure') ed.measure = null;
      if (extra) Object.assign(ed, extra);
      canvas.style.cursor = t === 'select' ? 'default' : 'crosshair';
      ed.onTool && ed.onTool(t);
      draw();
    }
    function fit() { view = HM.fitView(HM.plan(), HM.activeFloorId(), W, H, 60); draw(); }
    function zoomTo(kind, id) {
      const plan = HM.plan(); let pts = [];
      if (kind === 'room') { const r = byId(plan.rooms, id); if (r) pts = r.pts; }
      if (kind === 'wall') { const w = byId(plan.walls, id); if (w) pts = [w.a, w.b]; }
      if (!pts.length) return;
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y); const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      view = { ...view, ox: W / 2 - cx * view.s, oy: H / 2 - cy * view.s }; draw();
    }
    function finishChain() { ed.chain = null; ed.preview = null; draw(); }
    function onKey(e) {
      if (e.target.closest('input, textarea, select')) return;
      if (e.key === 'Escape') { if (ed.chain) finishChain(); else if (ed.tool !== 'select') setTool('select'); else HM.select(null, null); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && HM.sel) { e.preventDefault(); HM.deleteSelected(); }
      if ((e.key === 'r' || e.key === 'R') && HM.sel && (HM.sel.kind === 'furniture' || HM.sel.kind === 'stairs')) { const coll = HM.sel.kind === 'furniture' ? 'furniture' : 'stairs'; HM.commitPlan(pl => { const o = byId(pl[coll], HM.sel.id); o.rot = ((o.rot || 0) + 90) % 360; }); }
    }
    document.addEventListener('keydown', onKey);
    const onSel = () => draw(); HM.selListeners.add(onSel);
    const onPlan = () => draw(); HM.planListeners.add(onPlan);

    Object.assign(ed, {
      canvas, draw, fit, setTool, zoomTo, finishChain, get view() { return view; },
      destroy() { ed.destroyed = true; ro.disconnect(); document.removeEventListener('keydown', onKey); HM.selListeners.delete(onSel); HM.planListeners.delete(onPlan); canvas.remove(); },
    });
    return ed;
  };

  HM.deleteSelected = function () {
    const s = HM.sel; if (!s) return;
    HM.commitPlan(pl => {
      if (s.kind === 'wall') G.deleteWall(pl, s.id);
      else if (s.kind === 'opening') pl.openings = pl.openings.filter(o => o.id !== s.id);
      else if (s.kind === 'room') G.deleteRoom(pl, s.id, true);
      else if (s.kind === 'furniture') pl.furniture = pl.furniture.filter(o => o.id !== s.id);
      else if (s.kind === 'stairs') pl.stairs = pl.stairs.filter(o => o.id !== s.id);
    });
    HM.select(null, null);
  };
})();
