'use strict';
// 3D landmarks of Fable Fair's first lap, the Fairy-Tale Forest (browser only; see
// js/courses/fablefair.js): the gingerbread house by the candy trail, the giant clog you drive
// through, the sleeping castle in the middle of the hairpin with its briar gate over the road, and
// the Rabbit Hole under the castle's hill. All lumpy clay primitives, no files.
(() => {
  const at = GK.at.bind(GK);
  const PI = Math.PI;
  const GUMDROPS = ['#e8483f', '#4fbf5a', '#ffd166', '#9b6bff', '#ff9f43', '#3fb8d8'];

  // a candy cane standing h tall at (x, z), its hook curling toward +x
  function candyCane(P, x, z, h, seed, y0 = 0) {
    P.push(at(GK.cyl(0.2, 0.22, h, '#fff6ea', { segs: 6, hsegs: 1, seed, lump: 0.02 }), x, y0 + h / 2, z));
    for (let j = 0; j < Math.floor(h / 0.9); j++) P.push(at(GK.cyl(0.225, 0.235, 0.4, '#e8283f', { segs: 6, hsegs: 1, seed: seed + j, lump: 0.01 }), x, y0 + 0.35 + j * 0.9, z));
    P.push(at(GK.torus(0.55, 0.2, '#e8283f', { arc: PI, ts: 8, rs: 5, seed, lump: 0.02 }), x + 0.55, y0 + h, z));
  }
  // a lollipop on a stick, its candy disc facing +x
  function lollipop(P, x, z, h, col, seed) {
    P.push(at(GK.cyl(0.08, 0.1, h, '#fff6ea', { segs: 5, hsegs: 1, seed, lump: 0.01 }), x, h / 2, z));
    P.push(at(GK.cyl(0.95, 0.95, 0.22, col, { segs: 10, hsegs: 1, seed, lump: 0.02 }), x, h + 0.5, z, 0, 0, PI / 2));
    P.push(at(GK.torus(0.62, 0.1, '#fff6ea', { ts: 12, rs: 4, seed, lump: 0 }), x + 0.12, h + 0.5, z, 0, PI / 2, 0));
    P.push(at(GK.torus(0.28, 0.09, '#fff6ea', { ts: 10, rs: 4, seed, lump: 0 }), x + 0.12, h + 0.5, z, 0, PI / 2, 0));
  }
  // a little gingerbread man standing at (x, z) looking toward +x
  function gingerMan(P, x, z, seed) {
    const c = '#b8662c';
    const b = (rx, ry, rz, px, py, pz, col, s, rot) => P.push(at(GK.blob(rx, ry, rz, col, { seed: seed + s, ws: 7, hs: 5, lump: 0.02 }), x + px, py, z + pz, 0, 0, rot || 0));
    b(0.3, 0.75, 0.3, 0, 0.75, -0.32, c, 1);
    b(0.3, 0.75, 0.3, 0, 0.75, 0.32, c, 2);
    b(0.5, 0.78, 0.55, 0, 1.95, 0, c, 3);
    b(0.55, 0.5, 0.55, 0, 3.0, 0, c, 4);
    b(0.22, 0.7, 0.22, 0, 2.3, -0.95, c, 5, 0.7);
    b(0.22, 0.7, 0.22, 0, 2.3, 0.95, c, 6, -0.7);
    // icing: eyes, a smile and three buttons
    for (const sz of [-0.2, 0.2]) b(0.07, 0.07, 0.07, 0.5, 3.12, sz, '#fff6ea', 7);
    for (const sz of [-0.2, 0, 0.2]) b(0.06, 0.05, 0.06, 0.5, 2.82 - Math.abs(sz) * 0.3, sz, '#fff6ea', 8);
    for (let k = 0; k < 3; k++) b(0.09, 0.09, 0.09, 0.47, 2.3 - k * 0.38, 0, GUMDROPS[k + 1], 9 + k);
  }

  Object.assign(LANDMARKS, {
    // {seg, t, d}: the gingerbread house by the candy trail: a leaning gingerbread cottage with
    // icing trim, a frosted roof of gumdrop shingles, candy canes at its corners, lollipops and a
    // wafer fence round its garden, a chocolate door and warm windows.
    gingerbread(lm, x, y, z, head, parts) {
      const m = this.flatFrame(x, y, z, FableKit.facing(this, lm, x, z));
      const P = [];
      const wall = '#c4803f', trim = '#fff6ea';
      P.push(at(GK.box(9, 5.2, 8, wall, { seed: 3, r: 0.6, lump: 0.12 }), 0, 2.6, 0, 0, 0, 0.012));
      P.push(at(GK.box(9.5, 0.5, 8.5, trim, { seed: 4, r: 0.22, lump: 0.1, seg: 3 }), 0, 5.15, 0));
      P.push(at(GK.box(9.3, 0.45, 8.3, trim, { seed: 5, r: 0.2, lump: 0.1, seg: 3 }), 0, 0.2, 0));
      // the frosted roof: a pyramid of pink icing under gumdrop shingles
      const roof = GK.cone(7.2, 5.6, '#f08cb4', { segs: 4, hsegs: 4, seed: 6, lump: 0.3 });
      roof.rotateY(PI / 4);
      roof.scale(1.08, 1, 0.97);
      P.push(at(roof, 0, 5.2 + 2.8, 0));
      const ax = 5.5, az = 4.94;
      let g = 0;
      for (let row = 0; row < 3; row++) {
        const f = 0.14 + row * 0.24, n = 3 - row;
        for (const [fx, fz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          for (let c = 0; c < n; c++) {
            const v = n === 1 ? 0 : (c / (n - 1)) * 1.4 - 0.7;
            const px = fx ? fx * ax * (1 - f) : v * ax * (1 - f), pz = fx ? v * az * (1 - f) : fz * az * (1 - f);
            P.push(at(GK.blob(0.66, 0.44, 0.66, GUMDROPS[g++ % GUMDROPS.length], { seed: g + 10, ws: 7, hs: 5, lump: 0.04 }), px + fx * 0.28, 5.2 + 5.6 * f + 0.3, pz + fz * 0.28));
          }
        }
      }
      // icing dripping off the roof's edge
      for (let k = -3; k <= 3; k++) {
        const drip = (px, pz, i) => P.push(at(GK.blob(0.3, 0.45 + (i % 3) * 0.2, 0.3, trim, { seed: 40 + i, ws: 5, hs: 4, lump: 0.02 }), px, 4.85 - (i % 3) * 0.1, pz));
        drip(k * 1.5, 4.85, k + 3);
        drip(k * 1.5, -4.85, k + 11);
        if (Math.abs(k) < 3) {
          drip(5.4, k * 1.55, k + 19);
          drip(-5.4, k * 1.55, k + 27);
        }
      }
      // the chimney, with a frosting cap
      P.push(at(GK.box(1.5, 3, 1.5, '#a24a3a', { seed: 7, r: 0.3, seg: 2 }), -2, 9.2, 1.6));
      P.push(at(GK.box(1.9, 0.45, 1.9, trim, { seed: 8, r: 0.2, seg: 2 }), -2, 10.8, 1.6));
      // a chocolate-bar door in an icing frame, a gumdrop knob and a sugar-cube step
      P.push(at(GK.box(0.4, 3.1, 2.1, '#5a3524', { seed: 9, r: 0.12, seg: 2, lump: 0.02 }), 4.55, 1.65, 0));
      for (const dy of [1.0, 2.35]) for (const dz of [-0.5, 0.5]) P.push(at(GK.box(0.2, 1.0, 0.72, '#7a4a30', { seed: 10, r: 0.1, seg: 2, lump: 0 }), 4.78, dy, dz));
      P.push(at(GK.box(0.3, 0.32, 2.9, trim, { seed: 12, r: 0.12, seg: 2, lump: 0.04 }), 4.6, 3.35, 0));
      for (const sz of [-1.4, 1.4]) P.push(at(GK.box(0.3, 3.1, 0.3, trim, { seed: 13, r: 0.12, seg: 2, lump: 0.04 }), 4.6, 1.65, sz));
      P.push(at(GK.blob(0.22, 0.22, 0.22, '#ffd166', { seed: 14, ws: 6, hs: 4, lump: 0 }), 4.85, 1.5, 0.72));
      P.push(at(GK.box(1.8, 0.5, 3, '#ffffff', { seed: 11, r: 0.2, seg: 2 }), 5.5, 0.25, 0));
      // windows with icing frames and crossed bars, on the road side and the sides
      const windows = [[4.5, 3.4, -2.9, 0], [4.5, 3.4, 2.9, 0], [0, 3.4, 4, 1], [0, 3.4, -4, 1]];
      for (const [wx, wy, wz, side] of windows) {
        const sx = side ? 1.3 : 0.3, sz = side ? 0.3 : 1.3;
        P.push(at(GK.box(side ? 1.8 : 0.34, 1.9, side ? 0.34 : 1.8, trim, { seed: 15, r: 0.1, seg: 2, lump: 0.03 }), wx, wy, wz));
        P.push(at(GK.box(sx, 1.5, sz, '#ffd98a', { seed: 16, r: 0.08, seg: 2, lump: 0 }), wx + (side ? 0 : 0.12), wy, wz + (side ? Math.sign(wz) * 0.12 : 0)));
        P.push(at(GK.box(side ? 1.3 : 0.38, 0.12, side ? 0.38 : 1.3, trim, { seed: 17, r: 0.04, seg: 1, lump: 0 }), wx + (side ? 0 : 0.12), wy, wz + (side ? Math.sign(wz) * 0.12 : 0)));
        P.push(at(GK.box(side ? 0.12 : 0.38, 1.5, side ? 0.38 : 0.12, trim, { seed: 18, r: 0.04, seg: 1, lump: 0 }), wx + (side ? 0 : 0.12), wy, wz + (side ? Math.sign(wz) * 0.12 : 0)));
      }
      // candy canes at the corners, lollipops and big gumdrops round the garden
      [[-4.9, -4.4], [-4.9, 4.4], [4.9, -4.4], [4.9, 4.4]].forEach(([cx, cz], k) => candyCane(P, cx, cz, 4.4, 60 + k * 7));
      [[-3, 6.6, '#ff5f9e', 3.4], [1.5, 7.2, '#4fd6b8', 4.0], [3.2, -7.0, '#ffd24a', 3.2], [-2.2, -7.4, '#9b6bff', 3.8], [-7.2, 1, '#ff9f43', 3.5], [8.2, -5.4, '#ff5f9e', 3.0]].forEach(([lx, lz, col, h], k) => lollipop(P, lx, lz, h, col, 80 + k * 5));
      [[-4.4, 5.8], [4.9, 6.2], [-4.6, -5.8], [-6.2, -2], [-6, 3], [6.2, -6.2]].forEach(([bx, bz], k) => {
        P.push(at(GK.blob(1.1 + (k % 3) * 0.2, 0.95, 1.1 + (k % 3) * 0.2, GUMDROPS[(k + 2) % GUMDROPS.length], { seed: 90 + k, lump: 0.06 }), bx, 0.7, bz));
        P.push(at(GK.blob(0.5, 0.15, 0.5, '#ffffff', { seed: 100 + k, ws: 6, hs: 4, lump: 0 }), bx - 0.1, 1.5 + (k % 3) * 0.1, bz));
      });
      // a wafer fence across the front garden, with a gap for the path
      for (let k = -6; k <= 6; k++) {
        const pz = k * 1.2;
        if (Math.abs(pz) < 1.9) continue;
        P.push(at(GK.box(0.18, 1.4, 0.6, '#ecc78a', { seed: 110 + k, r: 0.06, seg: 2, lump: 0.02 }), 8.2, 0.7, pz));
        P.push(at(GK.cone(0.34, 0.5, '#ecc78a', { segs: 4, hsegs: 1, seed: 130 + k, lump: 0 }), 8.2, 1.65, pz));
      }
      for (const ry of [0.45, 1.0]) for (const sg of [-1, 1]) P.push(at(GK.box(0.14, 0.14, 5.4, '#d9ad6c', { seed: 150, r: 0.05, seg: 1, lump: 0 }), 8.1, ry, sg * 4.7));
      // cookie stepping stones through the gap
      for (let k = 0; k < 4; k++) P.push(at(GK.cyl(0.85, 0.85, 0.16, '#d9a15a', { segs: 9, hsegs: 1, seed: 160 + k, lump: 0.03 }), 7 + k * 1.9, 0.08, Math.sin(k * 1.9) * 0.7));
      gingerMan(P, 7.4, -2.9, 170);
      gingerMan(P, 7.4, 2.9, 190);
      // the sign
      const tex = this.signTexture('fable:crumb', 512, 160, '#7a4a2a', '#fff3d0', [['CRUMB COTTAGE', 62]]);
      const sign = this.signGeo(5.4, 1.65);
      sign.translate(9.2, 2.5, 7.2);
      this.putAt(sign, m, this.signMat(tex), { cast: false });
      for (const zz of [4.8, 9.6]) P.push(at(GK.cyl(0.13, 0.16, 3, '#6b4a3a', { segs: 5, hsegs: 1, seed: 200 }), 9.2, 1.5, zz));
      this.putAt(GK.merge(P), m, this.clayMat, { name: 'gingerbread' });
      // warm light in the windows
      const v = new THREE.Vector3();
      for (const [wx, wy, wz] of [[5.2, 3.4, -2.9], [5.2, 3.4, 2.9]]) this.glow(...v.set(wx, wy, wz).applyMatrix4(m).toArray(), 3.4, '#ffd98a', 2);
      FableKit.smoke(this, ...v.set(-2, 11.4, 1.6).applyMatrix4(m).toArray(), 1, '#fff0f6');
    },

    // {seg, t, ds, d}: the Sleeping Castle on its hill, wrapped in briars. Everything in it is
    // asleep: the flags hang limp, the windows are dark but for one, and a Z drifts up from the
    // tallest tower. Its gate faces the road the spec points at.
    sleepcastle(lm, x, y, z, head, parts) {
      const m = this.flatFrame(x, y, z, FableKit.facing(this, lm, x, z));
      const P = [];
      const stone = ['#c4badb', '#b5aad0', '#cdc3e0'];
      const leaf = ['#27492f', '#335f3d', '#2b5238'];
      const roofs = ['#d85c8c', '#7a5ad0', '#3fa8a0', '#d85c8c', '#7a5ad0', '#e0953f'];
      const rnd = U.rng(Math.round(x * 3 + z * 5));
      // the hill, with boulders round its foot
      P.push(at(GK.blob(27, 8.5, 27, '#3f8a52', { seed: 11, lump: 1.6, ws: 16, hs: 8 }), 0, -2.4, 0));
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * TAU + 0.3;
        P.push(at(GK.blob(3 + rnd() * 2, 1.8, 2.6, k % 2 ? '#8a7fa6' : '#9d93b8', { seed: 20 + k, lump: 0.5, ws: 8, hs: 5 }), Math.cos(a) * 23, 0.4, Math.sin(a) * 23));
      }
      const Y0 = 5.0, RW = 13.6;
      // the curtain wall: twelve straight stretches between corner posts, the gate in the one facing +x
      const V = [];
      for (let k = 0; k < 12; k++) {
        const a = ((k + 0.5) * PI) / 6;
        V.push([Math.cos(a) * RW, Math.sin(a) * RW]);
      }
      for (let k = 0; k < 12; k++) {
        const A = V[k], B = V[(k + 1) % 12];
        const mx = (A[0] + B[0]) / 2, mz = (A[1] + B[1]) / 2;
        const len = Math.hypot(B[0] - A[0], B[1] - A[1]), ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
        if (k === 11) {
          // the gatehouse: a tall block with a dark arched gate and a torch either side
          P.push(at(GK.box(len + 0.4, 8.5, 3.4, stone[0], { seed: 30, r: 0.5, seg: 3 }), mx, Y0 + 4.25, mz, 0, -ang, 0));
          P.push(at(GK.box(2.9, 4.6, 3.8, '#2b1838', { seed: 31, r: 0.3, seg: 2, lump: 0.02 }), mx + 0.2, Y0 + 2.3, mz, 0, -ang, 0));
          P.push(at(GK.blob(1.45, 1.3, 1.9, '#2b1838', { seed: 32, ws: 8, hs: 5, lump: 0 }), mx + 0.2, Y0 + 4.6, mz, 0, -ang, 0));
          for (const sd of [-1, 1]) P.push(at(GK.box(0.35, 0.7, 0.35, '#ffd98a', { seed: 33, r: 0.1, seg: 1, lump: 0 }), mx + 1.9, Y0 + 3.4, mz + sd * 2.4));
          continue;
        }
        P.push(at(GK.box(len + 0.4, 5.6, 1.9, stone[k % 3], { seed: 40 + k, r: 0.4, seg: 3 }), mx, Y0 + 2.8, mz, 0, -ang, 0));
        for (const o of [-2.3, 2.3]) P.push(at(GK.box(1.5, 1.2, 2.1, stone[(k + 1) % 3], { seed: 60 + k, r: 0.25, seg: 2 }), mx + Math.cos(ang) * o, Y0 + 6.1, mz + Math.sin(ang) * o, 0, -ang, 0));
      }
      // six towers on the corner posts, each with a candy-coloured roof and a limp flag
      [[0, 14], [11, 14], [2, 11.5], [9, 12.5], [4, 15], [7, 12]].forEach(([k, h], q) => {
        const [tx, tz] = V[k];
        P.push(at(GK.cyl(2.5, 2.9, h, stone[q % 3], { seed: 70 + q, segs: 10, lump: 0.2 }), tx, Y0 + h / 2, tz));
        P.push(at(GK.torus(2.8, 0.35, '#e8dff5', { seed: 80 + q, ts: 14, rs: 4, lump: 0.05 }), tx, Y0 + h - 0.4, tz, PI / 2, 0, 0));
        P.push(at(GK.cone(3.9, 7 + (q % 3), roofs[q], { seed: 90 + q, segs: 10, lump: 0.25 }), tx, Y0 + h + 3.4 + (q % 3) * 0.5, tz));
        // flag pole and a flag that hangs straight down
        P.push(at(GK.cyl(0.07, 0.07, 2.4, '#8a7fa6', { segs: 4, hsegs: 1, lump: 0 }), tx, Y0 + h + 7.6 + (q % 3) + 0.2, tz));
        P.push(at(GK.box(0.08, 1.3, 0.95, '#ffd166', { seed: 100 + q, r: 0.03, seg: 1, lump: 0.02 }), tx + 0.05, Y0 + h + 7.6 + (q % 3) - 0.7, tz + 0.5));
        // a dark window facing out
        const wa = Math.atan2(tz, tx);
        P.push(at(GK.box(0.5, 1.7, 1.0, '#3b2a5a', { seed: 110 + q, r: 0.15, seg: 2, lump: 0 }), tx + Math.cos(wa) * 2.45, Y0 + h * 0.62, tz + Math.sin(wa) * 2.45, 0, -wa, 0));
      });
      // the keep and the tall spire behind it
      P.push(at(GK.cyl(6.6, 7.3, 17, stone[1], { seed: 120, segs: 14, lump: 0.35 }), 0, Y0 + 8.5, 0));
      P.push(at(GK.torus(7.1, 0.5, '#e8dff5', { seed: 121, ts: 18, rs: 4, lump: 0.05 }), 0, Y0 + 16.5, 0, PI / 2, 0, 0));
      P.push(at(GK.cone(8.4, 12, '#7a5ad0', { seed: 122, segs: 14, lump: 0.35 }), 0, Y0 + 17 + 5.8, 0));
      P.push(at(GK.cyl(2.3, 2.7, 27, stone[2], { seed: 123, segs: 10, lump: 0.25 }), -4.5, Y0 + 13.5, 1.5));
      P.push(at(GK.cone(3.5, 10, '#d85c8c', { seed: 124, segs: 10, lump: 0.3 }), -4.5, Y0 + 27 + 4.6, 1.5));
      P.push(at(GK.blob(0.5, 0.5, 0.5, '#ffd166', { seed: 125, ws: 6, hs: 4, lump: 0 }), -4.5, Y0 + 27 + 9.8, 1.5));
      // the keep's windows on the road side: dark ones and one lit by somebody's dream
      [[3.8, 8.5, -2.6], [3.8, 8.5, 2.6], [5.4, 13, 0], [5.9, 4.5, 0]].forEach(([wx, wy, wz], q) => {
        const lit = q === 2;
        P.push(at(GK.box(0.7, 2.2, 1.3, lit ? '#ffd98a' : '#3b2a5a', { seed: 130 + q, r: 0.2, seg: 2, lump: 0 }), wx + 2.1, Y0 + wy, wz));
      });
      // the briars: thick dark knots at every tower's foot and along the walls, climbing the gate side
      const knots = [];
      for (let k = 0; k < 12; k++) {
        const [vx, vz] = V[k];
        for (let j = 0; j < 3; j++) knots.push([vx * (1 + j * 0.03) + (rnd() - 0.5) * 2, 0.4 + j * 1.9 + rnd(), vz * (1 + j * 0.03) + (rnd() - 0.5) * 2, 1.5 + rnd() * 0.9]);
      }
      for (let k = 0; k < 8; k++) knots.push([5.5 + rnd() * 2, 0.5 + k * 1.9, (rnd() - 0.5) * 7, 1.8 + rnd()]);
      knots.forEach(([kx, ky, kz, r], q) => {
        P.push(at(GK.blob(r, r * 0.85, r, leaf[q % 3], { seed: 140 + q, ws: 8, hs: 5, lump: r * 0.45 }), kx, Y0 + ky, kz));
        if (q % 2 === 0) {
          // thorns stick out of the knot
          const a = rnd() * TAU;
          P.push(at(GK.cone(0.2, 1.1, '#d8c7a0', { segs: 4, hsegs: 1, seed: 160 + q, lump: 0 }), kx + Math.cos(a) * r, Y0 + ky + 0.3, kz + Math.sin(a) * r, 0, 0, -Math.cos(a) * 1.3));
        }
        if (q % 3 === 0) P.push(at(GK.blob(0.5, 0.42, 0.5, q % 2 ? '#ff4f7a' : '#ff7fa8', { seed: 200 + q, ws: 6, hs: 4, lump: 0.05 }), kx + (rnd() - 0.5) * r, Y0 + ky + r * 0.6, kz + (rnd() - 0.5) * r));
      });
      this.putAt(GK.merge(P), m, this.clayMat, { far: true, name: 'sleepcastle' });
      // the gate's torches and the lit window glow, the rest of the windows breathe a faint violet
      const v = new THREE.Vector3();
      for (const sd of [-1, 1]) this.glow(...v.set(RW * 0.97 + 1.9, Y0 + 3.4, sd * 2.4).applyMatrix4(m).toArray(), 3.4, '#ffb866', 2);
      this.glow(...v.set(5.9 + 2.1, Y0 + 13, 0).applyMatrix4(m).toArray(), 5, '#ffd98a', 1);
      this.glow(...v.set(0, Y0 + 27 + 8, 1.5).applyMatrix4(m).toArray(), 8, '#b8a0ff', 1);
      // a Z that drifts up from the spire, over and over
      const zz = this.canvasTex(128, 128, (g) => {
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineJoin = 'round';
        g.lineWidth = 9;
        g.strokeStyle = '#5a3f9a';
        g.fillStyle = '#f2ecff';
        [[44, 92, 54], [78, 56, 42], [96, 26, 32]].forEach(([zx, zy, sz], k) => {
          g.font = `bold ${sz}px sans-serif`;
          g.strokeText(k ? 'z' : 'Z', zx, zy);
          g.fillText(k ? 'z' : 'Z', zx, zy);
        });
      }, { clamp: true });
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: zz, transparent: true, depthWrite: false, fog: true }));
      v.set(-4.5, Y0 + 27 + 12, 1.5).applyMatrix4(m);
      const base = v.clone();
      spr.scale.set(7, 7, 1);
      this.scene.add(spr);
      this.anims.push((t) => {
        const u = (t * 0.16) % 1;
        spr.position.set(base.x + u * 3, base.y + u * 4, base.z + Math.sin(u * 9) * 0.8);
        spr.material.opacity = Math.min(1, u * 5) * Math.min(1, (1 - u) * 3);
      });
    },

    // {seg, t}: a gate of briars over the road, the sleeping castle's outer defence
    briararch(lm, x, y, z, head, parts) {
      const w = this.track.where(lm), p = w.path;
      const q = p.point(w.s, 0);
      const e = q.hw + q.sh + 1.2, H = 4.4;
      const m = this.frame(p, w.s);
      const P = [];
      const leaf = ['#27492f', '#335f3d'];
      const ring = GK.torus(e, 1.3, leaf[0], { arc: PI, ts: 30, rs: 7, seed: 5, lump: 0.8 });
      ring.rotateY(PI / 2);
      ring.translate(0, H, 0);
      P.push(ring);
      const ring2 = GK.torus(e - 0.2, 0.7, leaf[1], { arc: PI, ts: 26, rs: 5, seed: 9, lump: 0.5 });
      ring2.rotateY(PI / 2);
      ring2.translate(0.7, H + 0.1, 0);
      P.push(ring2);
      for (const zz of [-e, e]) {
        for (let k = 0; k < 4; k++) P.push(at(GK.blob(1.9 - k * 0.2, 1.4, 1.9 - k * 0.2, leaf[k % 2], { seed: 20 + k + (zz > 0 ? 5 : 0), lump: 0.7, ws: 9, hs: 6 }), 0.2 * (k % 2), k * 1.2, zz));
      }
      // thorns and roses all along the arch
      for (let k = 1; k < 26; k++) {
        const a = (k / 26) * PI, ry = H + Math.sin(a) * e, rz = Math.cos(a) * e;
        if (k % 2) P.push(at(GK.cone(0.22, 1.1, '#d8c7a0', { segs: 4, hsegs: 1, seed: 40 + k, lump: 0 }), (k % 4 === 1 ? -1 : 1) * 0.7, ry + Math.sin(a) * 1.6, rz + Math.cos(a) * 1.6, PI / 2 - a, 0, 0));
        if (k % 5 === 2) {
          P.push(at(GK.blob(0.62, 0.5, 0.62, k % 2 ? '#ff4f7a' : '#ff7fa8', { seed: 70 + k, ws: 7, hs: 5, lump: 0.06 }), 1.1, ry + Math.sin(a) * 1.0, rz + Math.cos(a) * 1.0));
          P.push(at(GK.blob(0.2, 0.2, 0.2, '#ffd166', { seed: 80 + k, ws: 5, hs: 4, lump: 0 }), 1.5, ry + Math.sin(a) * 1.15, rz + Math.cos(a) * 1.15));
        }
        // vines hanging from the arch
        if (k % 6 === 3) P.push(at(GK.cone(0.3, 2.2 + (k % 3) * 0.6, leaf[0], { segs: 5, hsegs: 2, seed: 90 + k, lump: 0.1 }), 0, ry - 1.9, rz, PI, 0, 0));
      }
      this.putAt(GK.merge(P), m, this.clayMat, { name: 'briararch' });
    },

    // {path: 'burrow', u}: the Rabbit Hole, a tunnel of earth and roots under the castle's hill
    burrow(lm, x, y, z, head, parts) {
      const p = this.track.byId[lm.path];
      if (!p) return;
      const gate = p.gate ? p.gate.i : 0;
      const ids = [];
      for (let i = gate + 18; i <= p.n - 22; i++) ids.push(i);
      if (ids.length < 3) return;
      const R = (i) => p.hw[i] + p.sh[i] + 0.6, Hh = (i) => R(i) * 0.85;
      this.put(this.tubeGeo(p, ids, { R, H: Hh, thick: 1.1, inner: '#7a5238', outer: '#4f9a52', lump: 0.9, ring: [7, 0.85] }), this.tubeMat, { far: true, name: 'burrow' });
      const P = [];
      const v = {};
      for (const i of ids) {
        const h = U.hash2(i, 3, 17);
        // roots hang from the ceiling, glowing mushrooms and a carrot or two stand by the walls
        if (i % 3 === 0) {
          this.gp(p, i, (U.hash2(i, 1, 3) - 0.5) * R(i) * 1.3, Hh(i) * 0.9, v);
          P.push(at(GK.cone(0.18, 1.4 + h * 1.4, '#5c3d28', { segs: 5, hsegs: 2, seed: i, lump: 0.08 }), v.x, v.y - 0.4, v.z, PI, 0, 0));
        }
        if (i % 9 === 4) {
          const side = h < 0.5 ? -1 : 1;
          this.gp(p, i, side * (R(i) - 0.9), 0.1, v);
          P.push(at(GK.cyl(0.18, 0.26, 0.8, '#f4ecd8', { segs: 5, hsegs: 1, seed: i }), v.x, v.y + 0.4, v.z));
          P.push(at(GK.blob(0.7, 0.4, 0.7, side < 0 ? '#e0589a' : '#3fc8b0', { seed: i + 1, ws: 8, hs: 5 }), v.x, v.y + 0.95, v.z));
          this.glow(v.x, v.y + 1.0, v.z, 3, side < 0 ? '#ff9ad0' : '#8affea', 1);
        }
        if (i % 17 === 8) {
          this.gp(p, i, (h - 0.5) * R(i) * 1.1, 0.2, v);
          P.push(at(GK.cone(0.4, 1.7, '#ff8a2a', { segs: 6, hsegs: 2, seed: i + 5, lump: 0.05 }), v.x, v.y + 0.9, v.z, 0, 0, 3.0));
          P.push(at(GK.cone(0.22, 0.9, '#4fbf5a', { segs: 5, hsegs: 1, seed: i + 6, lump: 0.05 }), v.x + 0.05, v.y + 2.1, v.z));
        }
      }
      // a root arch round each end of the tunnel, and a carrot patch at the mouth
      for (const [i, out] of [[ids[0], -1], [ids[ids.length - 1], 1]]) {
        const frame = this.frame(p, p.s[i]);
        const arch = GK.torus(R(i) + 0.4, 0.8, '#5c3d28', { arc: PI, ts: 20, rs: 6, seed: i, lump: 0.35 });
        arch.scale(1, (Hh(i) + 0.4) / (R(i) + 0.4), 1);
        arch.rotateY(PI / 2);
        arch.translate(out * 0.6, 0, 0);
        P.push(arch.applyMatrix4(frame));
        // (growing on the verge, off the road, each leaning a little the way it was pulled)
        for (let k = 0; k < 6; k++) {
          const side = k % 2 ? 1 : -1;
          const c = new THREE.Vector3(out * (1.2 + (k >> 1) * 1.3), 0, side * (R(i) + 1.8 + (k % 3) * 0.7)).applyMatrix4(frame);
          const lean = 0.25 * (U.hash2(k, i, 4) - 0.5) * 2;
          P.push(at(GK.cone(0.4, 1.5, '#ff8a2a', { segs: 6, hsegs: 2, seed: i + 30 + k, lump: 0.05 }), c.x, c.y + 0.7, c.z, lean, 0, PI + lean));
          P.push(at(GK.cone(0.24, 0.9, '#4fbf5a', { segs: 5, hsegs: 1, seed: i + 40 + k, lump: 0.05 }), c.x, c.y + 1.9, c.z));
        }
      }
      this.put(GK.merge(P), this.clayMat, { far: true, name: 'burrow' });
    },
  });

  // ------------------------------------------------------------------ the giant clog
  // {kind: 'tunnel', look: 'clog', seg, t, seg1, t1}: the road runs through a giant wooden clog on a
  // straight stretch: in at the pointed toe, under a vaulted ceiling of ribs and lanterns, out at the
  // heel. Tulips grow in its foot-hole, a chimney smokes, and its round windows are always lit.
  TUNNEL_LOOKS.clog = function (p, ids) {
    const n = ids.length;
    const s0 = p.s[ids[0]], s1 = p.s[ids[n - 1]], L = s1 - s0, sm = (s0 + s1) / 2;
    const M = this.frame(p, sm); // local x along the road, y up, z to the right (the road is straight and level here)
    const Rin = (i) => p.hw[i] + p.sh[i] + 0.7;
    // the inner vault swells a little over the ball of the foot; the wall is a thin lip at the toe
    // and grows up toward the ankle, so the clog stands low and pointed in front and tall behind
    const Hin = (u) => 8.6 + 1.8 * sstep(0.02, 0.25, u) - 0.4 * sstep(0.6, 1, u);
    const Tw = (u) => 0.5 + 3.2 * sstep(0, 0.3, u) - 0.3 * sstep(0.7, 1, u);
    const Th = (u) => 0.4 + 1.5 * sstep(0, 0.2, u) + 2.6 * sstep(0.2, 0.6, u) - 1.0 * sstep(0.85, 1, u);
    const surf = (u, lat) => {
      const W = Rin(ids[Math.round(u * (n - 1))]) + Tw(u);
      return (Hin(u) + Th(u)) * Math.sqrt(Math.max(0, 1 - (lat / W) ** 2));
    };
    // ---- the shell: an inner and an outer skin lofted along the road, closed at both ends
    const steps = 16, mIn = steps + 1, mOut = steps + 3, m = mIn + mOut;
    const verts = [], cols = [], idx = [];
    const wood = new THREE.Color('#d99a52'), inWood = new THREE.Color('#b57b42');
    ids.forEach((i, r) => {
      const u = r / (n - 1), x = p.s[i] - sm;
      const R = Rin(i), Hi = Hin(u);
      for (let k = 0; k <= steps; k++) {
        const a = (k / steps) * PI;
        verts.push(x, Math.sin(a) * Hi, Math.cos(a) * R);
        const rib = r % 6 === 0 ? 0.82 : 1, w = (U.hash2(i, k, 5) - 0.5) * 0.06;
        cols.push(inWood.r * rib + w, inWood.g * rib + w, inWood.b * rib + w);
      }
      const W = R + Tw(u), Ho = Hi + Th(u);
      for (let k = -1; k <= steps + 1; k++) {
        const a = (Math.min(steps, Math.max(0, k)) / steps) * PI;
        const wob = k < 0 || k > steps ? 0 : (noise3(p.x[i] * 0.2, k * 0.7, p.z[i] * 0.2) - 0.5) * 0.7;
        verts.push(x, k < 0 || k > steps ? -2.6 : Math.sin(a) * (Ho + wob), Math.cos(a) * (W + wob));
        // oak planks
        const plank = Math.floor(x / 2.2) % 2 ? 0.93 : 1;
        const w = (U.hash2(i, k, 6) - 0.5) * 0.07;
        cols.push(wood.r * plank + w, wood.g * plank + w, wood.b * plank + w);
      }
      if (r > 0) {
        const r0 = (r - 1) * m, r1 = r * m;
        for (let k = 0; k < mIn - 1; k++) idx.push(r0 + k, r0 + k + 1, r1 + k, r0 + k + 1, r1 + k + 1, r1 + k); // inner skin
        for (let k = 0; k < mOut - 1; k++) idx.push(r0 + mIn + k, r1 + mIn + k, r0 + mIn + k + 1, r0 + mIn + k + 1, r1 + mIn + k, r1 + mIn + k + 1); // outer skin
      }
    });
    for (const r of [0, n - 1]) {
      const b0 = r * m;
      for (let k = 0; k < mIn - 1; k++) {
        const o = b0 + mIn + 1 + k;
        if (r === 0) idx.push(b0 + k, o, b0 + k + 1, b0 + k + 1, o, o + 1);
        else idx.push(b0 + k, b0 + k + 1, o, b0 + k + 1, o + 1, o);
      }
    }
    const geo = this.geo(verts, cols, idx);
    const mat = this.matCache['tube-clog'] || (this.matCache['tube-clog'] = this.keep(Clay3D.material({ vertexColors: true, wobble: 0.03, freq: 0.9, bump: false, emissive: '#7a4a22', emissiveIntensity: 0.55, rough: 0.8 })));
    this.putAt(geo, M, mat, { far: true, name: 'clog' });

    // ---- what is on and in it (local frame, merged and moved into place at the end)
    const P = [];
    const X = (u) => -L / 2 + u * L;
    const toWorld = new THREE.Vector3();
    const glow = (lx, ly, lz, size, c, mode) => {
      toWorld.set(lx, ly, lz).applyMatrix4(M);
      this.glow(toWorld.x, toWorld.y, toWorld.z, size, c, mode);
    };
    // the toe: a horn that curls up and back from the vamp, with a golden bell at its tip
    const ctl = [[6, 11, 1.9], [3.6, 11.8, 1.8], [1.4, 13.3, 1.6], [-0.4, 15.2, 1.4], [-1.4, 17.3, 1.2], [-1.4, 19.3, 0.95], [-0.6, 20.9, 0.72], [0.4, 21.8, 0.5]];
    for (let c = 0; c < ctl.length - 1; c++) {
      for (let f = 0; f < 3; f++) {
        const t = f / 3, A = ctl[c], B = ctl[c + 1];
        P.push(at(GK.blob(U.lerp(A[2], B[2], t), U.lerp(A[2], B[2], t), U.lerp(A[2], B[2], t), '#d99a52', { seed: 300 + c * 3 + f, ws: 8, hs: 6, lump: 0.12 }), X(0) + U.lerp(A[0], B[0], t), U.lerp(A[1], B[1], t), 0));
      }
    }
    P.push(at(GK.blob(0.5, 0.5, 0.5, '#ffd166', { seed: 340, ws: 7, hs: 5, lump: 0 }), X(0) + 1.1, 21.3, 0));
    glow(X(0) + 1.1, 21.3, 0, 3, '#ffd98a', 1);
    // the foot-hole: an oval of planter boards on the crown, full of earth and tulips
    const pu0 = 0.42, pu1 = 0.74, pc = (pu0 + pu1) / 2, pa = ((pu1 - pu0) / 2) * L, pb = 4.3;
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * TAU, ux = pc + (Math.cos(a) * pa) / L, lz = Math.sin(a) * pb;
      P.push(at(GK.blob(1.3, 0.85, 0.85, k % 2 ? '#7a4a2a' : '#8a5530', { seed: 350 + k, ws: 8, hs: 5, lump: 0.08 }), X(ux), surf(ux, lz) + 0.1, lz, 0, -Math.atan2(Math.cos(a) * pb, -Math.sin(a) * pa) + PI / 2 * 0));
    }
    P.push(at(GK.blob(pa * 0.95, 0.6, pb * 0.85, '#4a3a28', { seed: 380, ws: 12, hs: 5, lump: 0.1 }), X(pc), surf(pc, 0) + 0.15, 0));
    const tulip = ['#e8283f', '#ffd24a', '#ff7fb0', '#fff0e6', '#9b6bff'];
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU + (k % 3) * 0.4, rr = 0.25 + 0.6 * U.hash2(k, 4, 9);
      const ux = pc + (Math.cos(a) * rr * pa) / L, lz = Math.sin(a) * rr * pb, base = surf(ux, lz) + 0.4;
      P.push(at(GK.cyl(0.06, 0.07, 1.1, '#3f8f4f', { segs: 4, hsegs: 1, seed: 390 + k, lump: 0 }), X(ux), base + 0.55, lz));
      P.push(at(GK.blob(0.3, 0.42, 0.3, tulip[k % tulip.length], { seed: 400 + k, ws: 7, hs: 5, lump: 0.03 }), X(ux), base + 1.3, lz));
      P.push(at(GK.blob(0.55, 0.1, 0.16, '#4f9f56', { seed: 420 + k, ws: 6, hs: 4, lump: 0 }), X(ux) + 0.3, base + 0.5, lz, 0, a, 0.5));
    }
    // a chimney near the heel, with smoke
    const cu = 0.82, cl = -5.2;
    P.push(at(GK.box(1.9, 4.6, 1.9, '#b8493a', { seed: 440, r: 0.3, seg: 2 }), X(cu), surf(cu, cl) + 1.6, cl));
    P.push(at(GK.box(2.4, 0.5, 2.4, '#fff0d6', { seed: 441, r: 0.2, seg: 2 }), X(cu), surf(cu, cl) + 4.1, cl));
    toWorld.set(X(cu), surf(cu, cl) + 4.8, cl).applyMatrix4(M);
    FableKit.smoke(this, toWorld.x, toWorld.y, toWorld.z, 1.5, '#ece8f4');
    // a dormer window on the right shoulder
    const du = 0.27, dl = 7.2, dy = surf(du, dl);
    P.push(at(GK.box(3.4, 2.8, 3.2, '#d99a52', { seed: 450, r: 0.4, seg: 2 }), X(du), dy + 0.9, dl));
    const dr = GK.cone(3.1, 2.2, '#a24a3a', { segs: 4, hsegs: 2, seed: 451, lump: 0.1 });
    dr.rotateY(PI / 4);
    P.push(at(dr, X(du), dy + 3.3, dl));
    P.push(at(GK.box(1.5, 1.4, 0.3, '#ffe9a8', { seed: 452, r: 0.1, seg: 2, lump: 0 }), X(du), dy + 1.0, dl + 1.7));
    glow(X(du), dy + 1.0, dl + 2.4, 3.6, '#ffd98a', 2);
    // a band of red and cream paint tiles along both flanks, hugging the skin
    for (let q = 2; q < n - 2; q += 2) {
      const i = ids[q], u = q / (n - 1), a = 0.05 * PI, ca = Math.cos(a), sa = Math.sin(a);
      const W = Rin(i) + Tw(u), Ho = Hin(u) + Th(u);
      const nl = ca / W, nu = sa / Ho, nn = Math.hypot(nl, nu);
      for (const sd of [-1, 1]) {
        const tile = GK.box(1.9, 0.5, 1.0, (q / 2) % 2 ? '#d8483a' : '#fff0d6', { seed: 600 + q, r: 0.12, seg: 2, lump: 0.02 });
        tile.rotateX(Math.atan2((sd * nl) / nn, nu / nn));
        tile.translate(p.s[i] - sm, sa * Ho, sd * ca * W);
        P.push(tile);
      }
    }
    // round windows along both flanks: a rim and a lit pane outside, a lit pane inside
    const portholes = (ux) => {
      const i = ids[Math.round(ux * (n - 1))];
      const W = Rin(i) + Tw(ux), Ho = Hin(ux) + Th(ux), Hi = Hin(ux), Ri = Rin(i);
      for (const sd of [-1, 1]) {
        const a = 0.17 * PI, ca = Math.cos(a), sa = Math.sin(a);
        // the outward normal of the ellipse (in lateral, up)
        const nl = ca / W, nu = sa / Ho, nn = Math.hypot(nl, nu), th = Math.atan2(sd * nl / nn, nu / nn);
        const out = new THREE.Vector3(X(ux), sa * Ho, sd * ca * W);
        const rim = GK.torus(1.2, 0.3, '#6b3d1e', { ts: 12, rs: 5, seed: 460, lump: 0.03 });
        rim.rotateX(PI / 2);
        const pane = GK.cyl(1.0, 1.0, 0.3, '#ffe9a8', { segs: 10, hsegs: 1, lump: 0 });
        for (const g of [rim, pane]) {
          g.rotateX(th);
          g.translate(out.x, out.y, out.z);
          P.push(g);
        }
        glow(out.x, out.y, out.z + sd * 1.2, 3.4, '#ffd98a', 0);
        // inside: a bright round pane on the vault, and its light
        const inn = new THREE.Vector3(X(ux), sa * Hi, sd * ca * Ri);
        const ith = Math.atan2(-sd * (ca / Ri) / Math.hypot(ca / Ri, sa / Hi), -(sa / Hi) / Math.hypot(ca / Ri, sa / Hi));
        const ipane = GK.cyl(1.05, 1.05, 0.25, '#fff2c0', { segs: 10, hsegs: 1, lump: 0 });
        ipane.rotateX(ith);
        ipane.translate(inn.x, inn.y, inn.z);
        P.push(ipane);
        glow(inn.x, inn.y - 0.2, inn.z - sd * 1.0, 4, '#ffd98a', 0);
      }
    };
    [0.3, 0.52, 0.76].forEach(portholes);
    // inside: arched ribs, hanging lanterns, hay along the foot of the walls
    for (let r = 3; r < n - 2; r += 6) {
      const u = r / (n - 1), R = Rin(ids[r]) - 0.2, H = Hin(u) - 0.1;
      const rib = GK.torus(R, 0.32, '#8a5028', { arc: PI, ts: 18, rs: 5, seed: 500 + r, lump: 0.05 });
      rib.scale(1, H / R, 1);
      rib.rotateY(PI / 2);
      rib.translate(p.s[ids[r]] - sm, 0, 0);
      P.push(rib);
    }
    [0.1, 0.3, 0.5, 0.7, 0.9].forEach((u, q) => {
      const sd = q % 2 ? 1 : -1, lz = sd * 5.5, ly = Hin(u) * Math.sqrt(1 - (lz / Rin(ids[Math.round(u * (n - 1))])) ** 2) - 0.3;
      P.push(at(GK.cyl(0.05, 0.05, 1.3, '#3b2a1c', { segs: 4, hsegs: 1, lump: 0 }), X(u), ly - 0.5, lz));
      P.push(at(GK.box(0.85, 1.05, 0.85, '#ffe9a8', { seed: 520 + q, r: 0.2, seg: 2, lump: 0 }), X(u), ly - 1.6, lz));
      P.push(at(GK.cone(0.7, 0.6, '#3b2a4a', { segs: 5, hsegs: 1, seed: 530 + q, lump: 0 }), X(u), ly - 0.9, lz));
      glow(X(u), ly - 1.6, lz, 5.4, '#ffd98a', 2);
    });
    for (let r = 4; r < n - 3; r += 8) {
      for (const sd of [-1, 1]) P.push(at(GK.blob(1.4, 0.7, 1.1, '#e8c25a', { seed: 550 + r + sd, ws: 8, hs: 5, lump: 0.3 }), p.s[ids[r]] - sm + sd * 0.8, 0.3, sd * (Rin(ids[r]) - 1.1)));
    }
    this.putAt(GK.merge(P), M, this.clayMat, { far: true, name: 'clog' });
  };
})();
