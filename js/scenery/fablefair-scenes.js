'use strict';
// More places of Fable Fair's dream lap (browser only; see js/courses/fablefair.js): the castle gate hall
// and the star tunnel (tunnel looks), flower arches and the fountain of the Moonflower Garden, strings
// of paper lanterns, the troll bridge and the Milky Way under the glider leap. They are built from the
// figures and pieces of fablefair-realm.js and fablefair-places.js (FableKit).
(() => {
  const at = GK.at.bind(GK);
  const PI = Math.PI;
  const { elf, troll, star, windows, place, spot, glowMat } = FableKit;

  // a clay rod from (y0, z0) to (y1, z1) in the local frame (x along the road), for strings and chains
  function rod(P, y0, z0, y1, z1, r, col, x = 0) {
    const len = Math.hypot(y1 - y0, z1 - z0);
    P.push(at(GK.cyl(r, r, len, col, { segs: 4, hsegs: 1, lump: 0 }), x, (y0 + y1) / 2, (z0 + z1) / 2, Math.atan2(z1 - z0, y1 - y0), 0, 0));
  }
  // a round tower with a cone roof and a flag; its lit windows go to L
  function tower(P, L, x, z, h, r, roof, seed, wall = '#e4dcfa') {
    P.push(at(GK.cyl(r * 1.12, r * 1.2, 1.2, '#a49abd', { seed, segs: 12, lump: 0.04 }), x, 0.6, z));
    P.push(at(GK.cyl(r, r * 1.08, h, wall, { seed: seed + 1, segs: 12, hsegs: 4, lump: r * 0.03 }), x, h / 2 + 1, z));
    P.push(at(GK.torus(r * 1.05, r * 0.09, '#d4a24a', { ts: 14, rs: 4, seed: seed + 2, lump: 0 }), x, h + 0.6, z, PI / 2));
    // a corbelled gallery with merlons under the roof
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU;
      P.push(at(GK.box(r * 0.36, r * 0.4, r * 0.3, wall, { seed: seed + 3, r: 0.1, seg: 2, lump: 0 }), x + Math.cos(a) * r * 1.12, h + 1.15, z + Math.sin(a) * r * 1.12, 0, -a, 0));
    }
    P.push(at(GK.cone(r * 1.25, r * 2.5, roof, { seed: seed + 4, segs: 12, hsegs: 4, lump: r * 0.04 }), x, h + 1.2 + r * 1.25, z));
    P.push(at(GK.blob(r * 0.16, r * 0.16, r * 0.16, '#ffd166', { seed: seed + 5, ws: 5, hs: 4, lump: 0 }), x, h + 1.2 + r * 2.6, z));
    P.push(at(GK.cyl(0.05, 0.05, r * 1.6, '#8a7a6a', { seed: seed + 6, segs: 4, hsegs: 1, lump: 0 }), x, h + 1.2 + r * 3.4, z));
    P.push(at(GK.box(0.05, r * 0.5, r * 0.9, roof, { seed: seed + 7, r: 0.02, seg: 2, lump: 0 }), x, h + 1.2 + r * 3.7, z + r * 0.45));
    for (let w = 0; w < 3; w++) {
      for (const a of [PI * 0.5 + w * 0.15, -PI * 0.5 - w * 0.15]) L.push([x + Math.cos(a) * r * 1.0, 3.2 + w * (h / 3.4), z + Math.sin(a) * r * 1.0, r * 0.16, r * 0.34, a]);
    }
  }

  // ----------------------------------------------------------------------------- the gate hall
  // {kind: 'tunnel', look: 'gatehall', seg, t, seg1, t1}: the road runs under a castle gatehouse: a vaulted stone hall
  // lit by chandeliers and wall torches, hung with banners, with a round tower on each side of both portals.
  TUNNEL_LOOKS.gatehall = function (p, ids, tu) {
    const n = ids.length, R = tu.R, H = (i) => R(i) * 0.72 + 3.2;
    const mat = this.matCache['tube-gatehall'] || (this.matCache['tube-gatehall'] = this.keep(Clay3D.material({ vertexColors: true, wobble: 0.025, freq: 0.9, bump: false, emissive: '#6a58a8', emissiveIntensity: 0.5, rough: 0.8 })));
    for (let a = 0; a < n - 1; a += 60) {
      const part = ids.slice(a, Math.min(n, a + 61));
      this.put(this.tubeGeo(p, part, { R, H, thick: 1.8, lump: 0.35, inner: '#b3a8d6', outer: '#a094c8', ring: [6, 0.8] }), mat, { far: true, name: 'gatehall' });
    }
    const v = new THREE.Vector3();
    const glowAt = (m, x, y, z, size, col, mode) => this.glow(...v.set(x, y, z).applyMatrix4(m).toArray(), size, col, mode);
    const sm = p.s[ids[Math.floor(n / 2)]], M = this.frame(p, sm), L0 = p.s[ids[0]] - sm, L1 = p.s[ids[n - 1]] - sm;
    const Rm = R(ids[Math.floor(n / 2)]), Hm = H(ids[Math.floor(n / 2)]);
    const P = [];
    // chandeliers: a ring of candles on three chains
    for (let x = L0 + 9; x < L1 - 6; x += 11) {
      const y = Hm - 4.2;
      for (const a of [0, 2.1, 4.2]) rod(P, Hm - 0.6, Math.sin(a) * 1.3, y + 0.2, Math.sin(a) * 1.3, 0.05, '#c9a24a', x + Math.cos(a) * 1.3);
      P.push(at(GK.torus(1.45, 0.14, '#d4a24a', { ts: 14, rs: 4, seed: 11, lump: 0 }), x, y, 0, PI / 2));
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        P.push(at(GK.cyl(0.1, 0.1, 0.5, '#fff3d6', { segs: 5, hsegs: 1, lump: 0, seed: 12 + k }), x + Math.cos(a) * 1.45, y + 0.3, Math.sin(a) * 1.45));
        P.push(at(GK.blob(0.1, 0.17, 0.1, '#ffd36a', { seed: 20 + k, ws: 5, hs: 4, lump: 0 }), x + Math.cos(a) * 1.45, y + 0.68, Math.sin(a) * 1.45));
      }
      P.push(at(GK.blob(0.3, 0.45, 0.3, '#ffd98a', { seed: 30, ws: 6, hs: 5, lump: 0 }), x, y - 0.3, 0));
      glowAt(M, x, y + 0.3, 0, 8, '#ffbf66', 2);
    }
    // banners on both walls (teal, violet, rose, gold) with a gold star, torches between them. The vault is an
    // ellipse: a banner hangs flat against it, leaning in with the wall.
    const wallZ = (y) => Rm * Math.sqrt(Math.max(0.01, 1 - (y / Hm) ** 2));
    const lean = (y) => Math.atan((Rm * y) / (Hm * Hm * Math.sqrt(Math.max(0.01, 1 - (y / Hm) ** 2))));
    const cols = ['#2fa8a0', '#7a58d0', '#d8508c', '#e8a83a'];
    let kb = 0;
    for (let x = L0 + 6; x < L1 - 4; x += 8) {
      for (const sd of [-1, 1]) {
        const col = cols[(kb++) % cols.length], yb = 4.6, z = sd * (wallZ(yb) - 0.35), a = -sd * lean(yb);
        const rig = new THREE.Matrix4().makeRotationX(a).setPosition(x, yb, z); // the banner's own frame, hung on the wall
        const B = [];
        B.push(at(GK.cyl(0.06, 0.06, 2.8, '#c9a24a', { segs: 4, hsegs: 1, lump: 0, seed: 40 }), 0, 2.2, 0, 0, 0, PI / 2));
        B.push(at(GK.box(2.2, 4.2, 0.12, col, { seed: 41 + kb, r: 0.05, seg: 2, lump: 0.01 }), 0, 0, 0));
        const tip = GK.cone(1.1, 1.0, col, { segs: 4, hsegs: 1, seed: 42, lump: 0 });
        tip.scale(1, 1, 0.12);
        B.push(at(tip, 0, -2.6, 0, PI, PI / 4, 0));
        B.push(at(star(0.7, '#ffd166', 50 + kb), 0, 0.1, -sd * 0.12));
        P.push(GK.merge(B).applyMatrix4(rig));
        // a torch between the banners
        const ty = 3.2, tz = sd * (wallZ(ty) - 0.5);
        P.push(at(GK.cyl(0.07, 0.1, 0.7, '#6a4a30', { segs: 5, hsegs: 1, lump: 0, seed: 43 }), x + 4, ty, tz));
        P.push(at(GK.blob(0.22, 0.34, 0.22, '#ffb347', { seed: 44, ws: 5, hs: 4, lump: 0 }), x + 4, ty + 0.55, tz));
        glowAt(M, x + 4, ty + 0.6, tz - sd * 0.4, 5, '#ffa84a', 2);
      }
    }
    this.putAt(GK.merge(P), M, this.clayMat, { far: true, name: 'gatehall' });
    // the two portals: a stone arch with a keystone, flanked by two towers, one at each end
    const Q = [], W = [];
    for (const r of [0, n - 1]) {
      const i = ids[r], m = this.frame(p, p.s[i]), sd = r === 0 ? -1 : 1, Ri = R(i), Hi = H(i);
      const ring = GK.torus(Ri + 0.8, 1.2, '#cfc4f0', { arc: PI, ts: 30, rs: 8, seed: i, lump: 0.08 });
      const rp = ring.attributes.position, rc = ring.attributes.color;
      for (let q = 0; q < rp.count; q++) if (Math.floor((Math.atan2(rp.getY(q), rp.getX(q)) / PI) * 15) % 2) rc.setXYZ(q, rc.getX(q) * 0.86, rc.getY(q) * 0.86, rc.getZ(q) * 0.86);
      ring.scale(1, (Hi + 0.8) / (Ri + 0.8), 1);
      ring.rotateY(PI / 2);
      Q.push(ring.applyMatrix4(m));
      const key = new THREE.Matrix4().multiplyMatrices(m, new THREE.Matrix4().makeTranslation(0, Hi + 1.2, 0));
      Q.push(star(1.5, '#ffd166', 70 + r).rotateY(PI / 2).applyMatrix4(key));
      // a gatehouse wall above the arch with merlons, and the towers
      Q.push(at(GK.box(3.2, 3.4, (Ri + 4) * 2, '#d8cef4', { seed: 80, r: 0.4, seg: 2, lump: 0.02 }), sd * 1.4, Hi + 2.6, 0).applyMatrix4(m));
      for (let k = -5; k <= 5; k++) Q.push(at(GK.box(1.2, 1.3, 1.4, '#e4dcfa', { seed: 81, r: 0.15, seg: 2, lump: 0 }), sd * 1.4, Hi + 4.9, k * (Ri + 3) / 5).applyMatrix4(m));
      for (const side of [-1, 1]) {
        const lw = [];
        const tp = [];
        tower(tp, lw, sd * 1.2, side * (Ri + 3.6), Hi + 6, 3.0, side > 0 ? '#3f8fd8' : '#7a58d0', 90 + r * 7 + (side > 0 ? 3 : 0));
        for (const g of tp) Q.push(g.applyMatrix4(m));
        const wm = windows(lw);
        W.push(wm.applyMatrix4(m));
      }
      glowAt(m, sd * 2, Hi + 1.4, 0, 9, '#ffd98a', 1);
    }
    this.put(GK.merge(Q), this.clayMat, { far: true, name: 'gatehouse' });
    this.put(GK.merge(W), glowMat(this), { far: true, cast: false, receive: false });
    // two elf guards at the entrance
    const m0 = this.frame(p, p.s[ids[0]]), h0 = p.point(p.s[ids[0]], 0).head;
    [-1, 1].forEach((sd, k) => {
      const q = new THREE.Vector3(-1.5, 0, sd * (R(ids[0]) - 3)).applyMatrix4(m0);
      place(this, elf(k * 2 + 1, 'stand'), q.x, q.y, q.z, h0 - sd * PI / 2, 1.15);
    });
  };

  // ----------------------------------------------------------------------------- the star tunnel
  // {kind: 'tunnel', look: 'stars', seg, t, seg1, t1}: the road runs into the night itself: a dome of deep blue
  // sky painted with nebulae and stars, golden ribs, and stars hanging from the roof.
  const skyTexture = (world) => world.matCache['stars-sky'] || (world.matCache['stars-sky'] = world.keep(world.canvasTex(512, 256, (g, W, H) => {
    const rnd = U.rng(77);
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#2a2288');
    bg.addColorStop(0.5, '#0b0836');
    bg.addColorStop(1, '#2a2288');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // nebulae: soft clouds of teal, rose, violet and amber
    const neb = [['70,200,215', 0.3], ['225,95,205', 0.27], ['120,90,255', 0.34], ['255,170,110', 0.17]];
    for (let k = 0; k < 12; k++) {
      const [c, a] = neb[k % neb.length], x = rnd() * W, y = rnd() * H, r = 40 + rnd() * 70;
      for (const dx of [-W, 0, W]) {
        const gr = g.createRadialGradient(x + dx, y, 0, x + dx, y, r);
        gr.addColorStop(0, `rgba(${c},${a})`);
        gr.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = gr;
        g.fillRect(x + dx - r, y - r, r * 2, r * 2);
      }
    }
    const tint = ['#ffffff', '#cfe6ff', '#ffe9b0', '#ffc8f0'];
    for (let k = 0; k < 320; k++) {
      const x = rnd() * W, y = rnd() * H, r = 0.5 + rnd() * rnd() * 2.2;
      g.globalAlpha = 0.5 + rnd() * 0.5;
      g.fillStyle = tint[k % 4];
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
    // bigger sparkles: a halo and a thin cross
    for (let k = 0; k < 26; k++) {
      const x = rnd() * W, y = rnd() * H, r = 3 + rnd() * 4;
      for (const dx of [-W, 0, W]) {
        const gr = g.createRadialGradient(x + dx, y, 0, x + dx, y, r * 3);
        gr.addColorStop(0, 'rgba(255,255,255,0.9)');
        gr.addColorStop(0.25, 'rgba(255,240,200,0.4)');
        gr.addColorStop(1, 'rgba(255,240,200,0)');
        g.fillStyle = gr;
        g.fillRect(x + dx - r * 3, y - r * 3, r * 6, r * 6);
        g.strokeStyle = 'rgba(255,255,255,0.85)';
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(x + dx - r * 2.2, y);
        g.lineTo(x + dx + r * 2.2, y);
        g.moveTo(x + dx, y - r * 2.2);
        g.lineTo(x + dx, y + r * 2.2);
        g.stroke();
      }
    }
  })));

  TUNNEL_LOOKS.stars = function (p, ids, tu) {
    const n = ids.length, R = tu.R, H = (i) => R(i) * 0.72 + 2.6;
    const mat = this.matCache['tube-stars'] || (this.matCache['tube-stars'] = this.keep(Clay3D.material({ vertexColors: true, wobble: 0.03, freq: 0.9, bump: false, emissive: '#3b2f8e', emissiveIntensity: 0.55, rough: 0.7 })));
    for (let a = 0; a < n - 1; a += 60) {
      const part = ids.slice(a, Math.min(n, a + 61));
      this.put(this.tubeGeo(p, part, { R, H, thick: 2.2, lump: 1.2, mound: 2, inner: '#14104a', outer: '#5b4bb8', ring: [10, 0.8] }), mat, { far: true, name: 'startunnel' });
    }
    // the painted night sky on the inside, a hair in front of the shell
    const verts = [], cols = [], uvs = [], idx = [], v = {}, steps = 16;
    ids.forEach((i, r) => {
      for (let k = 0; k <= steps; k++) {
        const a = (k / steps) * PI;
        this.gp(p, i, Math.cos(a) * (R(i) - 0.12), Math.sin(a) * (H(i) - 0.12), v);
        verts.push(v.x, v.y, v.z);
        cols.push(1, 1, 1);
        uvs.push(p.s[i] / 78, k / steps);
      }
      if (r > 0) {
        const r0 = (r - 1) * (steps + 1), r1 = r * (steps + 1);
        for (let k = 0; k < steps; k++) idx.push(r0 + k, r0 + k + 1, r1 + k, r0 + k + 1, r1 + k + 1, r1 + k);
      }
    });
    const skyMat = this.matCache['stars-sky-mat'] || (this.matCache['stars-sky-mat'] = this.keep(new THREE.MeshBasicMaterial({ map: skyTexture(this), fog: true })));
    this.put(this.geo(verts, cols, idx, uvs), skyMat, { far: true, cast: false, receive: false, name: 'startunnel-sky' });

    const sm = p.s[ids[Math.floor(n / 2)]], M = this.frame(p, sm), L0 = p.s[ids[0]] - sm, L1 = p.s[ids[n - 1]] - sm;
    const Rm = R(ids[Math.floor(n / 2)]), Hm = H(ids[Math.floor(n / 2)]);
    const T = new THREE.Vector3();
    const glowAt = (x, y, z, size, col, mode) => this.glow(...T.set(x, y, z).applyMatrix4(M).toArray(), size, col, mode);
    const P = [], lit = [];
    // golden ribs every 14 units (unlit, so they shine)
    for (let x = L0 + 7; x < L1 - 3; x += 14) {
      const ring = GK.torus(Rm - 0.35, 0.34, '#ffd98a', { arc: PI, ts: 30, rs: 6, seed: Math.round(x), lump: 0.02 });
      ring.scale(1, (Hm - 0.35) / (Rm - 0.35), 1);
      ring.rotateY(PI / 2);
      ring.translate(x, 0, 0);
      lit.push(ring);
    }
    // stars hanging from the roof on silver threads, at every depth
    let k = 0;
    for (let x = L0 + 5; x < L1 - 2; x += 8, k++) {
      const z = (k % 2 ? 1 : -1) * (2.5 + ((k * 37) % 6)), y = Hm * 0.62 + ((k * 13) % 4) * 0.6;
      const top = Math.sqrt(Math.max(0, 1 - (z / Rm) ** 2)) * Hm - 0.3;
      rod(P, y + 0.9, z, top, z, 0.04, '#cfd8ff', x);
      const st = star(0.8 + (k % 3) * 0.2, k % 2 ? '#ffd166' : '#ff9ad0', 120 + k);
      st.rotateY(k * 0.7);
      lit.push(st.translate(x, y, z));
      glowAt(x, y, z, 5 + (k % 3), k % 2 ? '#ffe08a' : '#ffb0e0', 3);
    }
    // glittering dust all over the dome: little stars that twinkle
    const rnd = U.rng(13);
    for (let q = 0; q < 70; q++) {
      const x = L0 + 2 + rnd() * (L1 - L0 - 4), a = 0.1 + rnd() * (PI - 0.2);
      glowAt(x, Math.sin(a) * (Hm - 0.4), Math.cos(a) * (Rm - 0.4), 0.8 + rnd() * 1.4, ['#ffffff', '#cfe6ff', '#ffe9b0', '#ffc8f0', '#9fe8ff'][q % 5], 3);
    }
    if (P.length) this.putAt(GK.merge(P), M, this.clayMat, { far: true, name: 'startunnel' });
    this.putAt(GK.merge(lit), M, glowMat(this), { far: true, cast: false, receive: false });
    // the portals: a ring of gold beads and a great star on the keystone
    const Q = [];
    for (const r of [0, n - 1]) {
      const i = ids[r], m = this.frame(p, p.s[i]), Ri = R(i), Hi = H(i);
      const ring = GK.torus(Ri + 0.7, 0.9, '#ffd98a', { arc: PI, ts: 30, rs: 6, seed: i, lump: 0.05 });
      ring.scale(1, (Hi + 0.7) / (Ri + 0.7), 1);
      ring.rotateY(PI / 2);
      Q.push(ring.applyMatrix4(m));
      const key = new THREE.Matrix4().multiplyMatrices(m, new THREE.Matrix4().makeTranslation(0, Hi + 2.4, 0));
      Q.push(star(2.2, '#ffd166', 150 + r).rotateY(PI / 2).applyMatrix4(key));
      this.glow(...T.set(0, Hi + 2.4, 0).applyMatrix4(m).toArray(), 14, '#ffe08a', 1);
    }
    this.put(GK.merge(Q), glowMat(this), { far: true, cast: false, receive: false });
  };

  // ----------------------------------------------------------------------------- the garden
  const dropTexture = (world) => world.matCache['realm-drop'] || (world.matCache['realm-drop'] = world.keep(world.canvasTex(32, 32, (g) => {
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.4, 'rgba(190,235,255,0.8)');
    gr.addColorStop(1, 'rgba(150,210,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 32, 32);
  }, { clamp: true })));

  // a big flower: a ring of petals round a golden heart, facing +x (local frame)
  function flower(P, x, y, z, r, petal, heart, seed) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      P.push(at(GK.blob(r * 0.14, r * 0.55, r * 0.28, petal, { seed: seed + k, ws: 7, hs: 4, lump: 0.03 }), x, y + Math.sin(a) * r * 0.62, z + Math.cos(a) * r * 0.62, PI / 2 - a, 0, 0));
    }
    P.push(at(GK.blob(r * 0.26, r * 0.26, r * 0.26, heart, { seed: seed + 9, ws: 6, hs: 5, lump: 0 }), x - 0.15, y, z));
  }

  Object.assign(LANDMARKS, {
    // {seg, t, look: 'rose' | 'moon'}: an arch of giant flowers over the road: posts of green vines, an arch of
    // blossoms and a hanging lantern, all glowing a little.
    flowerarch(lm) {
      const w = this.track.where(lm), p = w.path, q = p.point(w.s, 0);
      const e = q.hw + q.sh + 1.6, H = 9.5, m = this.frame(p, w.s);
      const pal = lm.look === 'moon' ? [['#fff2b0', '#ffc94a'], ['#e0d4ff', '#ffe08a'], ['#ffffff', '#ffd166']] : [['#ff8ac8', '#ffe27a'], ['#fff0f8', '#ffb0d8'], ['#c9a8ff', '#fff0a8']];
      const P = [];
      const pts = FableKit.archPoints(e, H, 28);
      // the arch is a rope of leaves and little blooms with big flowers on it
      FableKit.beads(P, pts, 0.62, (k) => ['#58b87a', '#6fc88a', '#4aa86e'][k % 3], 400);
      pts.forEach(([z, y], k) => {
        const c = pal[k % 3];
        P.push(at(GK.blob(0.7, 0.7, 0.7, c[0], { seed: 440 + k, ws: 7, hs: 5, lump: 0.1 }), 0.45, y + 0.2, z));
      });
      // vines and bloom on the posts
      for (const z of [-e, e]) {
        P.push(at(GK.cyl(0.55, 0.8, 3.2, '#5a3f78', { seed: 410, segs: 7, lump: 0.1 }), 0, 1.6, z));
        for (let k = 0; k < 6; k++) P.push(at(GK.blob(0.55, 0.3, 0.3, '#58b87a', { seed: 411 + k, ws: 6, hs: 4 }), (k % 2 ? 0.5 : -0.5), 0.8 + k * 0.5, z + (k % 2 ? 0.3 : -0.3), 0, 0.5 * k, 0.6));
        for (let k = 0; k < 4; k++) flower(P, -0.6, 1.0 + k * 1.0, z + (k % 2 ? 0.9 : -0.9), 0.8, pal[k % 3][0], pal[k % 3][1], 470 + k * 10);
      }
      pts.forEach(([z, y], k) => {
        if (k % 2 === 0) flower(P, -0.3, y + 0.2, z, 1.6 + (k % 3) * 0.3, pal[k % 3][0], pal[k % 3][1], 420 + k * 10);
      });
      // a lantern from the crown
      P.push(at(GK.cyl(0.04, 0.04, 1.6, '#c9a24a', { segs: 4, hsegs: 1, lump: 0 }), 0, H - 0.6, 0));
      P.push(at(GK.blob(0.55, 0.75, 0.55, '#ffd98a', { seed: 430, ws: 8, hs: 6, lump: 0 }), 0, H - 1.9, 0));
      this.putAt(GK.merge(P), m, this.clayMat, { name: 'flowerarch' });
      const T = new THREE.Vector3();
      this.glow(...T.set(0, H - 1.9, 0).applyMatrix4(m).toArray(), 7, '#ffd98a', 2);
      pts.forEach(([z, y], k) => {
        if (k % 4 === 0) this.glow(...T.set(0.4, y + 0.3, z).applyMatrix4(m).toArray(), 3.2, pal[k % 3][0], 1);
      });
    },

    // {seg, t, d, ds, s}: the garden's fountain: a round pool of moonstone, three tiers and a spire with a golden star,
    // water that leaps in arcs and falls in drops.
    fountain(lm) {
      const sp = spot(this, lm), s = lm.s || 1.4;
      const P = [], lit = [];
      P.push(at(GK.cyl(4.6 * s, 4.9 * s, 0.8 * s, '#d8d0f4', { seed: 500, segs: 18, hsegs: 2, lump: 0.05 }), 0, 0.4 * s, 0));
      P.push(at(GK.torus(4.6 * s, 0.4 * s, '#efe8ff', { ts: 22, rs: 5, seed: 501, lump: 0.03 }), 0, 0.85 * s, 0, PI / 2));
      lit.push(at(GK.cyl(4.2 * s, 4.2 * s, 0.1, '#7fd8ff', { segs: 18, hsegs: 1, lump: 0 }), 0, 0.72 * s, 0));
      P.push(at(GK.cyl(0.9 * s, 1.3 * s, 2.2 * s, '#cfc4f0', { seed: 502, segs: 10, hsegs: 3, lump: 0.05 }), 0, 1.7 * s, 0));
      P.push(at(GK.cyl(2.6 * s, 1.5 * s, 0.7 * s, '#d8d0f4', { seed: 503, segs: 14, hsegs: 2, lump: 0.05 }), 0, 2.9 * s, 0));
      lit.push(at(GK.cyl(2.3 * s, 2.3 * s, 0.1, '#7fd8ff', { segs: 14, hsegs: 1, lump: 0 }), 0, 3.28 * s, 0));
      P.push(at(GK.cyl(0.5 * s, 0.8 * s, 2.0 * s, '#cfc4f0', { seed: 504, segs: 8, hsegs: 2, lump: 0.05 }), 0, 4.1 * s, 0));
      P.push(at(GK.cyl(1.5 * s, 0.9 * s, 0.5 * s, '#d8d0f4', { seed: 505, segs: 12, hsegs: 2, lump: 0.05 }), 0, 5.3 * s, 0));
      lit.push(at(GK.cyl(1.3 * s, 1.3 * s, 0.08, '#7fd8ff', { segs: 12, hsegs: 1, lump: 0 }), 0, 5.58 * s, 0));
      P.push(at(GK.cone(0.4 * s, 2.2 * s, '#bfb2ee', { seed: 506, segs: 8, hsegs: 2, lump: 0.03 }), 0, 6.6 * s, 0));
      const st = star(1.0 * s, '#ffd166', 507);
      lit.push(st.translate(0, 8.2 * s, 0));
      // little statues round the rim: stars on posts
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU;
        P.push(at(GK.cyl(0.18 * s, 0.24 * s, 1.2 * s, '#efe8ff', { seed: 510 + k, segs: 5, hsegs: 1, lump: 0 }), Math.cos(a) * 4.6 * s, 1.35 * s, Math.sin(a) * 4.6 * s));
        P.push(at(GK.blob(0.3 * s, 0.3 * s, 0.3 * s, '#ffe08a', { seed: 520 + k, ws: 6, hs: 4, lump: 0 }), Math.cos(a) * 4.6 * s, 2.15 * s, Math.sin(a) * 4.6 * s));
      }
      this.put(GK.merge(P).translate(sp.x, sp.y, sp.z), this.clayMat, { name: 'fountain' });
      this.put(GK.merge(lit).translate(sp.x, sp.y, sp.z), glowMat(this), { cast: false, receive: false });
      this.glow(sp.x, sp.y + 8.2 * s, sp.z, 12 * s, '#ffe08a', 1);
      this.glow(sp.x, sp.y + 3.6 * s, sp.z, 9 * s, '#8fe0ff', 1);
      // the water: four arcs of drops that rise and fall
      const tex = dropTexture(this), mat = this.keep(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
      const drops = [];
      for (let j = 0; j < 4; j++) {
        for (let k = 0; k < 7; k++) {
          const d = new THREE.Sprite(mat);
          this.scene.add(d);
          drops.push({ d, a: (j / 4) * TAU + 0.4, k });
        }
      }
      this.anims.push((t) => {
        for (const o of drops) {
          const u = (t * 0.6 + o.k / 7) % 1, rr = (1.1 + 3.1 * u) * s;
          o.d.position.set(sp.x + Math.cos(o.a) * rr, sp.y + (5.7 + 3.4 * 4 * u * (1 - u) - 6.4 * u * u) * s, sp.z + Math.sin(o.a) * rr);
          o.d.scale.setScalar(0.55 * s * (1 - 0.4 * u));
        }
      });
    },

    // {seg, t, seg1, t1, every, sag, start, cols}: strings of glowing paper lanterns hung across the road from tall posts
    lanterns(lm) {
      const r = this.rangeOf(lm);
      if (!r) return;
      const p = this.track.main, every = lm.every || 22, sag = lm.sag || 2.4;
      const cols = lm.cols || ['#ffb347', '#ff8ac8', '#ffe27a', '#7fe0d0', '#b89cff'];
      let n = 0;
      const T = new THREE.Vector3();
      for (let s = r.s0 + (lm.start === undefined ? 6 : lm.start); s <= r.s1; s += every, n++) {
        const i = p.indexAt(s), e = p.hw[i] + p.sh[i] + 1.5, m = this.frame(p, s), H = 8;
        const P = [], lit = [];
        for (const z of [-e, e]) {
          P.push(at(GK.cyl(0.16, 0.26, H, '#d8d0ff', { seed: 600, segs: 6, lump: 0.04 }), 0, H / 2, z));
          P.push(at(GK.blob(0.36, 0.36, 0.36, '#ffd166', { seed: 601, ws: 6, hs: 5, lump: 0 }), 0, H + 0.1, z));
        }
        const N = 8;
        let prev = null;
        for (let k = 0; k <= N; k++) {
          const u = k / N, z = -e + 2 * e * u, y = H - 0.15 - sag * Math.sin(PI * u);
          if (prev) rod(P, prev[0], prev[1], y, z, 0.035, '#bfb6e8');
          prev = [y, z];
          if (k > 0 && k < N) {
            const col = cols[(n + k) % cols.length];
            P.push(at(GK.cyl(0.03, 0.03, 0.5, '#bfb6e8', { segs: 3, hsegs: 1, lump: 0 }), 0, y - 0.25, z));
            lit.push(at(GK.blob(0.42, 0.55, 0.42, col, { seed: 610 + k, ws: 7, hs: 5, lump: 0.02 }), 0, y - 0.78, z));
            this.glow(...T.set(0, y - 0.78, z).applyMatrix4(m).toArray(), 3.6, col, 2);
          }
        }
        this.putAt(GK.merge(P), m, this.clayMat, { name: 'lanterns' });
        this.putAt(GK.merge(lit), m, glowMat(this), { cast: false, receive: false });
      }
    },

    // {seg, t, v}: a stone bridge over the road, with a troll sitting on top, dangling its feet, and a lantern
    trollbridge(lm) {
      const w = this.track.where(lm), p = w.path, q = p.point(w.s, 0);
      const e = q.hw + q.sh + 2, H = 10, m = this.frame(p, w.s), sd = 700 + (lm.v || 0);
      const P = [], T = new THREE.Vector3();
      const stone = ['#8a86a2', '#7a7690', '#9a96b0'];
      const pts = FableKit.archPoints(e, H, 22);
      pts.forEach(([z, y], k) => P.push(at(GK.blob(1.5, 1.3, 2.7, stone[k % 3], { seed: sd + k, lump: 0.18, ws: 8, hs: 6 }), 0, y, z, 0, 0, 0)));
      // the piers: stacks of boulders with moss
      for (const z of [-e, e]) {
        for (let k = 0; k < 4; k++) P.push(at(GK.blob(2.1 - k * 0.15, 1.3, 2.7 - k * 0.2, stone[k % 3], { seed: sd + 40 + k, lump: 0.2, ws: 8, hs: 6 }), (k % 2 ? 0.25 : -0.25), 0.9 + k * 1.5, z + (k % 2 ? 0.3 : -0.3)));
        P.push(at(GK.blob(2.0, 0.5, 2.5, '#58b87a', { seed: sd + 50, lump: 0.1 }), 0, 6.9, z));
      }
      // the deck over the arch, with moss, rails of boulders and ferns
      P.push(at(GK.box(7.5, 1.6, e * 2 + 3.5, '#a29eb8', { seed: sd + 60, r: 0.6, seg: 2, lump: 0.05 }), 0, H + 0.9, 0));
      P.push(at(GK.blob(3.4, 0.45, e + 1, '#58b87a', { seed: sd + 61, lump: 0.15, ws: 10, hs: 5 }), 0, H + 1.75, 0));
      for (const x of [-3.7, 3.7]) for (let k = -3; k <= 3; k++) P.push(at(GK.blob(0.9, 0.8, 1.0, stone[(k + 3) % 3], { seed: sd + 70 + k, lump: 0.2 }), x, H + 2.2, k * (e / 3.2)));
      for (let k = 0; k < 7; k++) P.push(at(GK.blob(0.9, 0.12, 0.25, '#58b87a', { seed: sd + 90 + k, ws: 5, hs: 3 }), -3.9 + (k % 2) * 7.8, H + 3.1 + (k % 3) * 0.1, (k - 3) * e / 3.6, 0, k, 0.5));
      // a lantern post and a plank sign
      P.push(at(GK.cyl(0.1, 0.14, 2.2, '#6a4a30', { segs: 5, seed: sd + 99 }), 3.2, H + 3.1, e * 0.55));
      P.push(at(GK.blob(0.3, 0.42, 0.3, '#ffb347', { seed: sd + 100, ws: 6, hs: 5, lump: 0 }), 3.2, H + 4.4, e * 0.55));
      this.putAt(GK.merge(P), m, this.clayMat, { far: true, name: 'trollbridge' });
      this.glow(...T.set(3.2, H + 4.4, e * 0.55).applyMatrix4(m).toArray(), 6, '#ffb347', 2);
      // the troll on the deck, over the road
      const tr = troll(lm.v || 0, 'sit'), c = T.set(0.4, H + 2.0, -e * 0.15).applyMatrix4(m);
      place(this, tr, c.x, c.y, c.z, q.head + PI, 1.1);
    },

    // {seg, t, seg1, t1, depth}: the Milky Way: a river of stars far below the glider leap, winding between the
    // clouds, with dust that twinkles all along it
    milkyway(lm) {
      const r = this.rangeOf(lm);
      if (!r) return;
      const p = this.track.main, depth = lm.depth || 34, rnd = U.rng(31);
      const T = {};
      const soft = ['#2a2078', '#14505f', '#5a2a6a', '#1c3a88', '#6a3a62'];
      let n = 0;
      for (let s = r.s0 - 60; s <= r.s1 + 60; s += 11, n++) {
        const i = p.indexAt(U.clamp(s, 0, p.length - 1));
        const swing = Math.sin(s / 46) * 22 + Math.sin(s / 19) * 5;
        this.gp(p, i, swing + (rnd() - 0.5) * 6, 0, T);
        const y = T.y - depth - 4 * Math.sin(s / 31) + (rnd() - 0.5) * 4;
        this.glow(T.x, y, T.z, 16 + rnd() * 12, soft[n % soft.length], 1);
        this.glow(T.x + (rnd() - 0.5) * 12, y + 2, T.z + (rnd() - 0.5) * 12, 7 + rnd() * 6, ['#5a46d0', '#2fb0c0', '#d060b0'][n % 3], 0);
        for (let q = 0; q < 12; q++) this.glow(T.x + (rnd() - 0.5) * 38, y + (rnd() - 0.5) * 10, T.z + (rnd() - 0.5) * 38, 0.8 + rnd() * 1.6, ['#ffffff', '#ffe9b0', '#cfe6ff', '#ffc8f0'][q % 4], 3);
      }
    },

    // {seg, t, seg1, t1, n, h, off}: will-o'-the-wisps: small lights that bob over the ground beside the road, and
    // a haze of glow among them
    wisps(lm) {
      const r = this.rangeOf(lm);
      if (!r) return;
      const p = this.track.main, rnd = U.rng(lm.seed || 41), n = lm.n || 14, off = lm.off || [3, 16], v = {};
      const mat = this.keep(new THREE.SpriteMaterial({ map: dropTexture(this), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
      const cols = ['#9fffd8', '#b8f0ff', '#ffe9a0', '#d8c0ff'], wisps = [];
      for (let k = 0; k < n; k++) {
        const s = r.s0 + (r.s1 - r.s0) * rnd(), i = p.indexAt(s), side = rnd() < 0.5 ? -1 : 1;
        this.gp(p, i, side * (p.hw[i] + p.sh[i] + off[0] + rnd() * (off[1] - off[0])), 0, v);
        const ground = this.heightAt(v.x, v.z);
        if (ground === null) continue;
        const sp = new THREE.Sprite(mat.clone());
        sp.material.color.set(cols[k % cols.length]);
        this.keep(sp.material);
        this.scene.add(sp);
        wisps.push({ sp, x: v.x, y: ground + 1.2 + rnd() * 2.6, z: v.z, ph: rnd() * 6.28, sz: 0.9 + rnd() * 0.9 });
      }
      this.anims.push((t) => {
        for (const w of wisps) {
          w.sp.position.set(w.x + Math.sin(t * 0.7 + w.ph) * 1.4, w.y + Math.sin(t * 1.3 + w.ph * 2) * 0.5, w.z + Math.cos(t * 0.6 + w.ph) * 1.4);
          w.sp.scale.setScalar(w.sz * (1.7 + 0.5 * Math.sin(t * 2.4 + w.ph)));
        }
      });
      for (let k = 0; k < (lm.haze === undefined ? 10 : lm.haze); k++) {
        const s = r.s0 + (r.s1 - r.s0) * rnd(), i = p.indexAt(s), side = rnd() < 0.5 ? -1 : 1;
        this.gp(p, i, side * (p.hw[i] + p.sh[i] + 2 + rnd() * 18), 0, v);
        const ground = this.heightAt(v.x, v.z);
        if (ground !== null) this.glow(v.x, ground + 1.5, v.z, 10 + rnd() * 8, ['#1c5a4a', '#2a2a78', '#3a5a6a'][k % 3], 1);
      }
    },
  });
})();
