/* 3D-modell bygget direkte fra plantegningen (three.js). Oversikt med bane-kamera, førsteperson, måling og før/etter. */
(function () {
  const G = HM.geo; const { byId, fmtLen } = HM.util;
  const M = v => v / 1000; // mm → meter

  HM.isLowPower = function () {
    const s = HM.state && HM.state.settings && HM.state.settings.lowPower;
    if (s === true || s === 'on') return true; if (s === false || s === 'off') return false;
    const mem = navigator.deviceMemory || 8; const cores = navigator.hardwareConcurrency || 8;
    return mem <= 3 || cores <= 4 || /Android [4-8]\./.test(navigator.userAgent);
  };

  // ---------- Bygging av husmodellen ----------
  function buildHouse(plan, opts) {
    const THREE = window.THREE;
    const low = opts.low;
    const group = new THREE.Group(); group.name = 'hus';
    const matCache = new Map();
    const mat = (color, extra = {}) => {
      const key = color + JSON.stringify(extra);
      if (matCache.has(key)) return matCache.get(key);
      const m = low ? new THREE.MeshLambertMaterial(Object.assign({ color }, extra)) : new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85, metalness: 0 }, extra));
      matCache.set(key, m); return m;
    };
    const pick = [];
    const FACADE = '#D9D3C7', SLAB = '#BFC3BD', CEIL = '#FAFAF7';
    const floors = plan.floors.slice().sort((a, b) => a.elevation - b.elevation);
    const visibleFloors = opts.floorId && opts.floorId !== 'all' ? floors.filter(f => f.elevation <= (byId(plan.floors, opts.floorId) || floors[0]).elevation) : floors;
    for (const f of visibleFloors) {
      const fg = new THREE.Group(); fg.position.y = M(f.elevation); fg.userData.floorId = f.id; group.add(fg);
      const rooms = plan.rooms.filter(r => r.floorId === f.id);
      const walls = plan.walls.filter(w => w.floorId === f.id);
      // dekke under etasjen
      const b = HM.planBounds(plan, f.id);
      if (b) {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(M(b.w + 200), 0.12, M(b.h + 200)), mat(SLAB));
        slab.position.set(M(b.x0 + b.w / 2), -0.061, M(b.y0 + b.h / 2)); fg.add(slab);
      }
      // gulv og tak per rom
      for (const r of rooms) {
        const net = G.roomNet(plan, r);
        const shape = new THREE.Shape(net.inner.map(p => new THREE.Vector2(M(p.x), -M(p.y))));
        const geo = new THREE.ShapeGeometry(shape); geo.rotateX(-Math.PI / 2);
        const fin = G.FLOORS[r.floorFinish] || G.FLOORS.eik;
        const fl = new THREE.Mesh(geo, mat(fin[1])); fl.position.y = 0.002; fl.userData = { kind: 'room', id: r.id }; fg.add(fl); pick.push(fl);
        const ceil = new THREE.Mesh(geo, mat(r.ceilingColor || CEIL, { side: THREE.DoubleSide })); ceil.position.y = M(G.roomCeiling(plan, r)); ceil.userData = { kind: 'room', id: r.id, ceiling: true }; ceil.visible = !!opts.roof; ceil.name = 'tak'; fg.add(ceil);
      }
      // vegger med hull for dører og vinduer
      for (const w of walls) {
        const L = G.wallLen(w); if (L < 20) continue;
        const t = w.t || 100; const H = G.wallHeight(plan, w);
        const d = G.wallDir(w), n = { x: -d.y, y: d.x };
        const mid = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
        const sideColor = sgn => { const p = { x: mid.x + n.x * sgn * (t / 2 + 80), y: mid.y + n.y * sgn * (t / 2 + 80) }; const r = rooms.find(rr => G.pointInPoly(p, rr.pts)); return r ? (r.wallColor || '#F2F0EA') : FACADE; };
        const cPos = sideColor(1), cNeg = sideColor(-1);
        const top = mat('#E4E2DC');
        const mats = [top, top, top, top, mat(cPos), mat(cNeg)];
        const wg = new THREE.Group(); wg.position.set(M(w.a.x), 0, M(w.a.y)); wg.rotation.y = -Math.atan2(d.y, d.x); fg.add(wg);
        const ext = t / 2;
        const piece = (s0, s1, y0, y1) => {
          if (s1 - s0 < 2 || y1 - y0 < 2) return;
          const m = new THREE.Mesh(new THREE.BoxGeometry(M(s1 - s0), M(y1 - y0), M(t)), mats);
          m.position.set(M((s0 + s1) / 2), M((y0 + y1) / 2), 0); m.userData = { kind: 'wall', id: w.id }; wg.add(m); pick.push(m);
        };
        const ops = G.openingsOf(plan, w.id).slice().sort((a, b) => a.offset - b.offset);
        let cur = -ext;
        for (const o of ops) {
          const s0 = Math.max(cur, o.offset - o.width / 2), s1 = Math.min(L + ext, o.offset + o.width / 2);
          piece(cur, s0, 0, H);
          const sill = o.type === 'window' ? (o.sill || 0) : 0; const oh = Math.min(H, sill + (o.height || 2100));
          piece(s0, s1, oh, H); if (sill > 0) piece(s0, s1, 0, sill);
          // innhold i åpningen
          const ow = s1 - s0; const cx = (s0 + s1) / 2;
          if (o.type === 'window') {
            const glass = new THREE.Mesh(new THREE.BoxGeometry(M(ow), M(oh - sill), 0.012), mat('#9CC3D8', { transparent: true, opacity: 0.35 }));
            glass.position.set(M(cx), M((sill + oh) / 2), 0); glass.userData = { kind: 'opening', id: o.id }; wg.add(glass); pick.push(glass);
            const frameM = mat('#F5F5F2');
            for (const [fx, fy, fw, fh] of [[cx, sill + 25, ow, 50], [cx, oh - 25, ow, 50], [s0 + 25, (sill + oh) / 2, 50, oh - sill], [s1 - 25, (sill + oh) / 2, 50, oh - sill], [cx, (sill + oh) / 2, 40, oh - sill]]) {
              const fr = new THREE.Mesh(new THREE.BoxGeometry(M(fw), M(fh), M(Math.min(t, 90))), frameM); fr.position.set(M(fx), M(fy), 0); fr.userData = { kind: 'opening', id: o.id }; wg.add(fr); pick.push(fr);
            }
          } else if (o.type === 'door') {
            const leafW = ow - 20, leafT = 40;
            const hingeS = o.hinge === 'b' ? s1 - 10 : s0 + 10; const sw = o.swing === -1 ? -1 : 1;
            const pivot = new THREE.Group(); pivot.position.set(M(hingeS), 0, M(sw * t / 2)); wg.add(pivot);
            const leaf = new THREE.Mesh(new THREE.BoxGeometry(M(leafW), M(oh - 10), M(leafT)), mat('#EFEDE7'));
            const dir = o.hinge === 'b' ? -1 : 1;
            leaf.position.set(M(dir * leafW / 2), M((oh - 10) / 2), 0); leaf.userData = { kind: 'opening', id: o.id };
            pivot.rotation.y = -dir * sw * Math.PI / 2 * 0.92; pivot.add(leaf); pick.push(leaf);
          }
          cur = s1;
        }
        piece(cur, L + ext, 0, H);
      }
      // trapper
      for (const s of plan.stairs.filter(x => x.floorId === f.id)) {
        const sg = new THREE.Group(); sg.position.set(M(s.x), 0, M(s.y)); sg.rotation.y = -(s.rot || 0) * Math.PI / 180; fg.add(sg);
        const nS = s.steps || 15; const rise = (f.height || 2400) + 200; const stepH = rise / nS; const stepL = s.l / nS;
        for (let i = 0; i < nS; i++) {
          const st = new THREE.Mesh(new THREE.BoxGeometry(M(s.w), M(stepH * (i + 1)), M(stepL)), mat('#B99D7A'));
          st.position.set(0, M(stepH * (i + 1) / 2), M(s.l / 2 - stepL * (i + 0.5))); st.userData = { kind: 'stairs', id: s.id }; sg.add(st); pick.push(st);
        }
      }
      // møbler
      for (const it of plan.furniture.filter(x => x.floorId === f.id)) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(M(it.w), M(it.h), M(it.d)), it.glass ? mat(it.color || '#CFE3EA', { transparent: true, opacity: 0.35 }) : mat(it.color || '#cccccc'));
        m.position.set(M(it.x), M((it.elev || 0) + it.h / 2), M(it.y)); m.rotation.y = -(it.rot || 0) * Math.PI / 180; m.userData = { kind: 'furniture', id: it.id };
        fg.add(m); pick.push(m);
      }
    }
    group.userData.pick = pick; group.userData.mats = matCache;
    return group;
  }
  function disposeGroup(g) {
    if (!g) return;
    g.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    if (g.userData.mats) g.userData.mats.forEach(m => m.dispose());
  }
  function boundsOf(plan, floorId) {
    let b = null;
    for (const f of plan.floors) { if (floorId && floorId !== 'all' && f.id !== floorId) continue; const fb = HM.planBounds(plan, f.id); if (!fb) continue; b = b ? { x0: Math.min(b.x0, fb.x0), y0: Math.min(b.y0, fb.y0), x1: Math.max(b.x1, fb.x1), y1: Math.max(b.y1, fb.y1) } : { ...fb }; }
    if (!b) b = { x0: -2000, y0: -2000, x1: 4000, y1: 3000 };
    b.w = b.x1 - b.x0; b.h = b.y1 - b.y0; return b;
  }

  // ---------- Visning ----------
  HM.create3D = function (pane, cfg = {}) {
    const THREE = window.THREE;
    if (!THREE) { pane.innerHTML = '<div class="empty" style="margin:20px">3D-biblioteket kunne ikke lastes. Sjekk nettforbindelsen og last inn siden på nytt.</div>'; return null; }
    const low = HM.isLowPower();
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: !low, alpha: false, preserveDrawingBuffer: false }); }
    catch (e) { pane.innerHTML = '<div class="empty" style="margin:20px"><strong>3D er ikke tilgjengelig på denne enheten</strong>Nettleseren støtter ikke WebGL. Plantegningen fungerer som vanlig.</div>'; return null; }
    renderer.setPixelRatio(low ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0xDCE3E0);
    pane.appendChild(renderer.domElement);
    const canvas = renderer.domElement;
    const v3 = { mode: 'orbit', floorId: 'all', roof: false, compareId: null, split: 0.5, measuring: false, low, destroyed: false };
    const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 500);
    const mkScene = () => { const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0xB8B2A6, 0.85)); const dl = new THREE.DirectionalLight(0xffffff, 0.55); dl.position.set(8, 14, 6); sc.add(dl); const dl2 = new THREE.DirectionalLight(0xffffff, 0.2); dl2.position.set(-6, 8, -10); sc.add(dl2); const ground = new THREE.Mesh(new THREE.CircleGeometry(80, 48), new THREE.MeshLambertMaterial({ color: 0xC9D2C4 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.13; sc.add(ground); return sc; };
    const scene = mkScene(); let scene2 = null;
    let house = null, house2 = null;
    const orbit = { target: new THREE.Vector3(), theta: Math.PI * 0.25, phi: Math.PI * 0.3, r: 18 };
    const walk = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, floorEl: 0, eye: 1.6 };
    const keys = new Set(); const joy = { x: 0, y: 0, active: false };
    let W = 1, H = 1; let dirty = true; let selMesh = null; const selSaved = [];
    const measure = { pts: [], line: null, markers: [] };
    let labelEl = null;

    let userMoved = false;
    function resize() { const r = pane.getBoundingClientRect(); W = Math.max(10, r.width); H = Math.max(10, r.height); renderer.setSize(W, H, false); canvas.style.width = '100%'; canvas.style.height = '100%'; dirty = true; if (!userMoved && house && v3.mode === 'orbit') frame(true); }
    const ro = new ResizeObserver(resize); ro.observe(pane); resize();

    function rebuild() {
      const plan = cfg.planFor ? cfg.planFor() : HM.plan();
      if (house) { scene.remove(house); disposeGroup(house); }
      house = buildHouse(plan, { low, floorId: v3.floorId, roof: v3.roof || v3.mode === 'walk' }); scene.add(house);
      if (v3.compareId) {
        const vb = byId(HM.state.versions, v3.compareId);
        if (vb) { if (!scene2) scene2 = mkScene(); if (house2) { scene2.remove(house2); disposeGroup(house2); } house2 = buildHouse(vb.plan, { low, floorId: v3.floorId, roof: v3.roof || v3.mode === 'walk' }); scene2.add(house2); }
      }
      applySelection(); dirty = true;
    }
    function frame(reset) {
      const plan = HM.plan(); const b = boundsOf(plan, v3.floorId === 'all' ? null : v3.floorId);
      const f = v3.floorId !== 'all' ? byId(plan.floors, v3.floorId) : null;
      orbit.target.set(M(b.x0 + b.w / 2), M(f ? f.elevation : 0) + 1, M(b.y0 + b.h / 2));
      if (reset) {
        const size = M(Math.hypot(b.w, b.h)); const vf = 50 * Math.PI / 180; const hf = 2 * Math.atan(Math.tan(vf / 2) * (W / H));
        orbit.r = Math.max(6, (size / 2) / Math.tan(Math.min(vf, hf) / 2) * 1.15); orbit.theta = Math.PI * 0.22; orbit.phi = Math.PI * 0.28;
      }
      dirty = true;
    }
    function startWalk(roomId) {
      const plan = HM.plan(); const fid = v3.floorId !== 'all' ? v3.floorId : HM.activeFloorId();
      let r = roomId ? byId(plan.rooms, roomId) : null;
      if (!r && HM.sel && HM.sel.kind === 'room') r = byId(plan.rooms, HM.sel.id);
      if (!r) r = plan.rooms.find(x => x.floorId === fid) || plan.rooms[0];
      const f = byId(plan.floors, r ? r.floorId : fid) || plan.floors[0];
      const c = r ? G.centroid(G.roomNet(plan, r).inner) : { x: 0, y: 0 };
      walk.pos.set(M(c.x), M(f.elevation) + walk.eye, M(c.y)); walk.floorEl = M(f.elevation); walk.floorId = f.id; walk.yaw = 0; walk.pitch = 0;
      v3.mode = 'walk'; rebuild(); dirty = true; cfg.onMode && cfg.onMode('walk');
    }
    function setMode(m) { if (m === 'walk') return startWalk(); v3.mode = 'orbit'; rebuild(); frame(false); cfg.onMode && cfg.onMode('orbit'); }

    function updateCamera() {
      if (v3.mode === 'orbit') {
        camera.fov = 50;
        const { r, theta, phi, target } = orbit;
        camera.position.set(target.x + r * Math.sin(phi) * Math.sin(theta), target.y + r * Math.cos(phi), target.z + r * Math.sin(phi) * Math.cos(theta));
        camera.lookAt(target);
      } else {
        camera.fov = 70;
        camera.position.copy(walk.pos);
        const dir = new THREE.Vector3(Math.sin(walk.yaw) * Math.cos(walk.pitch), Math.sin(walk.pitch), -Math.cos(walk.yaw) * Math.cos(walk.pitch));
        camera.lookAt(walk.pos.clone().add(dir));
      }
      camera.aspect = (v3.compareId ? W : W) / H; camera.updateProjectionMatrix();
    }
    // kollisjon mot vegger (dører og åpninger er passerbare)
    function blocked(x, z) {
      const plan = HM.plan(); const p = { x: x * 1000, y: z * 1000 }; const rad = 220;
      for (const w of plan.walls) {
        if (w.floorId !== walk.floorId) continue;
        const pr = G.project(w, p); if (pr.dist > rad + (w.t || 100) / 2) continue;
        if (pr.t < -(w.t / 2) || pr.t > G.wallLen(w) + w.t / 2) continue;
        const open = G.openingsOf(plan, w.id).some(o => o.type !== 'window' && Math.abs(pr.t - o.offset) < o.width / 2 - 60);
        if (!open) return true;
      }
      return false;
    }
    let last = performance.now();
    function tick(now) {
      if (v3.destroyed) return;
      requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (v3.mode === 'walk') {
        let fw = 0, st = 0;
        if (keys.has('KeyW') || keys.has('ArrowUp')) fw += 1; if (keys.has('KeyS') || keys.has('ArrowDown')) fw -= 1;
        if (keys.has('KeyA')) st -= 1; if (keys.has('KeyD')) st += 1;
        if (keys.has('ArrowLeft')) { walk.yaw -= 1.8 * dt; dirty = true; } if (keys.has('ArrowRight')) { walk.yaw += 1.8 * dt; dirty = true; }
        if (joy.active) { fw += -joy.y; st += joy.x; }
        if (fw || st) {
          const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 2.6 : 1.4) * dt;
          const dx = (Math.sin(walk.yaw) * fw + Math.cos(walk.yaw) * st) * speed, dz = (-Math.cos(walk.yaw) * fw + Math.sin(walk.yaw) * st) * speed;
          if (!blocked(walk.pos.x + dx, walk.pos.z)) walk.pos.x += dx;
          if (!blocked(walk.pos.x, walk.pos.z + dz)) walk.pos.z += dz;
          dirty = true;
        }
      }
      if (!dirty) return;
      dirty = false; updateCamera();
      if (v3.compareId && scene2) {
        const sx = Math.round(W * v3.split);
        renderer.setScissorTest(true);
        renderer.setViewport(0, 0, W, H); renderer.setScissor(0, 0, sx, H); renderer.render(scene, camera);
        renderer.setScissor(sx, 0, W - sx, H); renderer.render(scene2, camera);
        renderer.setScissorTest(false);
      } else { renderer.setViewport(0, 0, W, H); renderer.render(scene, camera); }
      updateMeasureLabel();
    }
    requestAnimationFrame(tick);

    // ---------- Valg ----------
    function applySelection() {
      while (selSaved.length) { const [m, mt] = selSaved.pop(); m.material = mt; }
      if (!house || !HM.sel) return;
      const hl = mat => { const c = (Array.isArray(mat) ? mat : [mat]).map(x => { const k = x.clone(); if (k.emissive) { k.emissive.set(0x2C6A57); k.emissiveIntensity = 0.45; } else { k.color.offsetHSL(0, 0, -0.1); } return k; }); return Array.isArray(mat) ? c : c[0]; };
      house.traverse(o => { if (o.isMesh && o.userData && o.userData.id === HM.sel.id && !o.userData.ceiling) { selSaved.push([o, o.material]); o.material = hl(o.material); } });
      dirty = true;
    }
    const onSel = () => applySelection(); HM.selListeners.add(onSel);

    // ---------- Måling ----------
    function clearMeasure() { measure.pts = []; if (measure.line) { scene.remove(measure.line); measure.line.geometry.dispose(); measure.line = null; } measure.markers.forEach(m => scene.remove(m)); measure.markers = []; if (labelEl) labelEl.hidden = true; dirty = true; }
    function addMeasurePoint(p) {
      if (measure.pts.length >= 2) clearMeasure();
      measure.pts.push(p.clone());
      const mk = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), new THREE.MeshBasicMaterial({ color: 0xB23B3B })); mk.position.copy(p); scene.add(mk); measure.markers.push(mk);
      if (measure.pts.length === 2) {
        const g = new THREE.BufferGeometry().setFromPoints(measure.pts); measure.line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xB23B3B, depthTest: false })); measure.line.renderOrder = 10; scene.add(measure.line);
        if (!labelEl) { labelEl = document.createElement('div'); labelEl.className = 'hintbox'; labelEl.style.position = 'absolute'; labelEl.style.zIndex = 5; labelEl.style.transform = 'translate(-50%,-140%)'; labelEl.style.pointerEvents = 'none'; pane.appendChild(labelEl); }
        const a = measure.pts[0], b = measure.pts[1];
        const d = a.distanceTo(b) * 1000, dh = Math.hypot(b.x - a.x, b.z - a.z) * 1000, dv = Math.abs(b.y - a.y) * 1000;
        labelEl.innerHTML = `${fmtLen(d)}<br><span style="font-weight:500;opacity:.8">vannrett ${fmtLen(dh)} · loddrett ${fmtLen(dv)}</span>`; labelEl.hidden = false;
      }
      dirty = true;
    }
    function updateMeasureLabel() {
      if (!labelEl || labelEl.hidden || measure.pts.length < 2) return;
      const mid = measure.pts[0].clone().add(measure.pts[1]).multiplyScalar(0.5).project(camera);
      labelEl.style.left = ((mid.x + 1) / 2 * W) + 'px'; labelEl.style.top = ((1 - mid.y) / 2 * H) + 'px';
      labelEl.style.display = mid.z > 1 ? 'none' : '';
    }

    // ---------- Pekere ----------
    const raycaster = new THREE.Raycaster(); const ptrs = new Map(); let g2 = null; let down = null;
    function rayHit(sx, sy) {
      if (!house) return null;
      const ndc = new THREE.Vector2((sx / W) * 2 - 1, -(sy / H) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(house.userData.pick, false).filter(h => h.object.visible);
      return hits[0] || null;
    }
    const pos = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture(e.pointerId); const p = pos(e); ptrs.set(e.pointerId, p);
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; g2 = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, r: orbit.r, target: orbit.target.clone() }; down = null; return; }
      down = { p, last: p, t: performance.now(), btn: e.button, shift: e.shiftKey, moved: false };
    });
    canvas.addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId)) return; const p = pos(e); ptrs.set(e.pointerId, p);
      if (g2 && ptrs.size === 2) {
        const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        if (v3.mode === 'orbit') {
          orbit.r = Math.max(1.5, Math.min(120, g2.r * g2.d / d));
          const pan = (cx - g2.cx) * orbit.r / H, panY = (cy - g2.cy) * orbit.r / H;
          const right = new THREE.Vector3(Math.cos(orbit.theta), 0, -Math.sin(orbit.theta)); const fwd = new THREE.Vector3(Math.sin(orbit.theta), 0, Math.cos(orbit.theta));
          orbit.target.copy(g2.target).addScaledVector(right, -pan).addScaledVector(fwd, -panY);
        }
        dirty = true; return;
      }
      if (!down) return;
      const dx = p.x - down.last.x, dy = p.y - down.last.y; down.last = p;
      if (Math.hypot(p.x - down.p.x, p.y - down.p.y) > 5) { down.moved = true; userMoved = true; }
      if (!down.moved) return;
      if (v3.mode === 'orbit') {
        if (down.btn === 2 || down.shift) { const k = orbit.r / H; const right = new THREE.Vector3(Math.cos(orbit.theta), 0, -Math.sin(orbit.theta)); const fwd = new THREE.Vector3(Math.sin(orbit.theta), 0, Math.cos(orbit.theta)); orbit.target.addScaledVector(right, -dx * k).addScaledVector(fwd, -dy * k); }
        else { orbit.theta -= dx * 0.008; orbit.phi = Math.max(0.05, Math.min(Math.PI * 0.49, orbit.phi - dy * 0.006)); }
      } else { walk.yaw += dx * 0.005; walk.pitch = Math.max(-1.2, Math.min(1.2, walk.pitch - dy * 0.004)); }
      dirty = true;
    });
    const up = e => {
      ptrs.delete(e.pointerId); if (ptrs.size < 2) g2 = null;
      if (down && !down.moved && performance.now() - down.t < 500 && down.btn === 0) {
        const h = rayHit(down.p.x, down.p.y);
        if (v3.measuring) { if (h) addMeasurePoint(h.point); }
        else if (h && h.object.userData.kind) HM.select(h.object.userData.kind, h.object.userData.id, { source: '3d' });
        else HM.select(null, null, { source: '3d' });
      }
      down = null;
    };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); down = null; g2 = null; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => { e.preventDefault(); userMoved = true; if (v3.mode === 'orbit') { orbit.r = Math.max(1.5, Math.min(120, orbit.r * Math.exp(e.deltaY * 0.0012))); } else { walk.pitch = Math.max(-1.2, Math.min(1.2, walk.pitch - e.deltaY * 0.001)); } dirty = true; }, { passive: false });
    canvas.tabIndex = 0;
    const kd = e => { if (e.target.closest('input, textarea, select')) return; if (v3.mode === 'walk' && /^(Key[WASD]|Arrow|Shift)/.test(e.code)) { keys.add(e.code); e.preventDefault(); } };
    const ku = e => keys.delete(e.code);
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); window.addEventListener('blur', () => keys.clear());

    // styrespak på berøringsskjerm
    const joyEl = document.createElement('div'); joyEl.className = 'joy'; joyEl.innerHTML = '<i></i>'; joyEl.hidden = true; pane.appendChild(joyEl);
    const knob = joyEl.firstChild;
    joyEl.addEventListener('pointerdown', e => { joyEl.setPointerCapture(e.pointerId); joy.active = true; moveJoy(e); e.stopPropagation(); });
    joyEl.addEventListener('pointermove', e => { if (joy.active) moveJoy(e); });
    const endJoy = () => { joy.active = false; joy.x = joy.y = 0; knob.style.transform = ''; };
    joyEl.addEventListener('pointerup', endJoy); joyEl.addEventListener('pointercancel', endJoy);
    function moveJoy(e) { const r = joyEl.getBoundingClientRect(); let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2); const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } joy.x = x; joy.y = y; knob.style.transform = `translate(${x * 34}px, ${y * 34}px)`; dirty = true; }

    const onPlan = (o) => { if (o && o.live) { if (!v3._pending) { v3._pending = true; requestAnimationFrame(() => { v3._pending = false; rebuild(); }); } } else rebuild(); };
    HM.planListeners.add(onPlan);

    rebuild(); frame(true);

    Object.assign(v3, {
      canvas, rebuild, frame, setMode, startWalk, clearMeasure, houseGroup: () => house,
      setFloor(fid) { v3.floorId = fid; rebuild(); frame(false); },
      setRoof(on) { v3.roof = on; rebuild(); },
      setCompare(id) { v3.compareId = id || null; if (!id && house2) { scene2.remove(house2); disposeGroup(house2); house2 = null; } rebuild(); },
      setSplit(k) { v3.split = Math.max(0.05, Math.min(0.95, k)); dirty = true; },
      setMeasuring(on) { v3.measuring = on; if (!on) clearMeasure(); },
      showJoy(on) { joyEl.hidden = !on; },
      viewState() { return { orbit: { target: orbit.target.toArray(), theta: orbit.theta, phi: orbit.phi, r: orbit.r }, walk: { pos: walk.pos.toArray(), yaw: walk.yaw, pitch: walk.pitch }, mode: v3.mode }; },
      redraw() { dirty = true; },
      destroy() { v3.destroyed = true; ro.disconnect(); HM.planListeners.delete(onPlan); HM.selListeners.delete(onSel); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); disposeGroup(house); disposeGroup(house2); renderer.dispose(); canvas.remove(); joyEl.remove(); labelEl && labelEl.remove(); },
    });
    return v3;
  };
  HM.buildHouse3D = buildHouse;
})();
