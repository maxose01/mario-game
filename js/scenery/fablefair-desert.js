'use strict';
// 3D landmarks of Fable Fair's second lap, the Desert Mirage (browser only; see
// js/courses/fablefair.js): ride gates with their signs, market stalls, a palace and a temple,
// flying carpets, the coaster's trestle and lights, the Flying Dutchman (a ghost ship under the
// road: hull, masts, tattered sails, lanterns and mist) and the splash pool at the foot of its
// plunge. Lumpy clay primitives, no files.
(() => {
  const at = GK.at.bind(GK);
  const PI = Math.PI;

  const { beads, archPoints, onion } = FableKit; // shared with the other laps' scenery (js/scenery/fablefair.js)
  // a minaret: a tall slim tower with a balcony and a little onion dome
  function minaret(P, x, z, h, seed, col = '#f1dcae', dome = '#2fb0b8') {
    P.push(at(GK.cyl(0.9, 1.25, h, col, { seed, segs: 10, lump: 0.1 }), x, h / 2, z));
    P.push(at(GK.cyl(1.6, 1.6, 0.4, '#d8b878', { seed: seed + 1, segs: 10, hsegs: 1, lump: 0.03 }), x, h * 0.8, z));
    P.push(at(GK.torus(1.55, 0.18, '#c99a3c', { seed: seed + 2, ts: 12, rs: 4, lump: 0 }), x, h * 0.8 + 0.5, z, PI / 2, 0, 0));
    P.push(at(GK.cyl(0.7, 0.9, h * 0.14, col, { seed: seed + 3, segs: 8, hsegs: 1, lump: 0.05 }), x, h + h * 0.07, z));
    onion(P, x, h + h * 0.14 - 0.4, z, 1.15, dome, seed + 4);
  }

  Object.assign(LANDMARKS, {
    // {seg, t, d, look}: a market stall with a striped canopy, a counter heaped with goods,
    // hanging lamps and a shopkeeper in a turban, facing the road.
    stall(lm, x, y, z, head, parts) {
      const m = this.flatFrame(x, y, z, FableKit.facing(this, lm, x, z));
      const rnd = U.rng(Math.round(x * 7 + z * 3));
      const stripes = [['#e8483f', '#fff3d0'], ['#2d9cb8', '#fff3d0'], ['#e8a23f', '#fff3d0'], ['#7a5ad0', '#fff3d0']][Math.floor(rnd() * 4)];
      const P = [];
      for (const [px, pz] of [[-2, -3.2], [-2, 3.2], [2, -3.2], [2, 3.2]]) P.push(at(GK.cyl(0.14, 0.18, 4.4, '#7a5236', { segs: 5, hsegs: 1, seed: px + pz * 3 + 20, lump: 0.02 }), px, 2.2, pz));
      // the canopy: stripes sloping down toward the road (+x), a scalloped front edge
      for (let k = -3; k <= 3; k++) {
        P.push(at(GK.box(5.2, 0.28, 0.95, k % 2 ? stripes[1] : stripes[0], { seed: 30 + k, r: 0.08, seg: 2, lump: 0.03 }), 0, 4.55, k * 0.93, 0, 0, -0.16));
        P.push(at(GK.blob(0.5, 0.5, 0.5, k % 2 ? stripes[1] : stripes[0], { seed: 40 + k, ws: 6, hs: 4, lump: 0.02 }), 2.5, 3.85, k * 0.93));
      }
      // the counter and what is on it
      P.push(at(GK.box(1.6, 1.3, 6.4, '#a8744a', { seed: 50, r: 0.2, seg: 2 }), 1.6, 0.65, 0));
      const goods = ['#ff9f43', '#e8483f', '#4fbf5a', '#ffd166', '#c77dff'];
      for (let k = 0; k < 7; k++) P.push(at(GK.blob(0.38, 0.34, 0.38, goods[k % goods.length], { seed: 60 + k, ws: 6, hs: 4, lump: 0.03 }), 1.2 + (k % 2) * 0.5, 1.5 + (k % 3) * 0.08, -2.4 + k * 0.8));
      for (const [gz, col] of [[-2.7, '#c8683a'], [2.7, '#d8a24a']]) {
        P.push(at(GK.blob(0.6, 0.7, 0.6, col, { seed: 70 + gz, ws: 8, hs: 6, lump: 0.03 }), 0.6, 0.7, gz));
        P.push(at(GK.cyl(0.22, 0.3, 0.45, col, { segs: 6, hsegs: 1, seed: 71, lump: 0 }), 0.6, 1.5, gz));
      }
      // rolled rugs leaning at the back
      ['#c4443c', '#2d9cb8', '#e8a23f', '#7a5ad0'].forEach((c, k) => P.push(at(GK.cyl(0.32, 0.32, 2.2, c, { segs: 7, hsegs: 1, seed: 80 + k, lump: 0.02 }), -1.5, 1.1, -2.1 + k * 1.4, 0, 0, 0.12)));
      // the shopkeeper
      P.push(at(GK.blob(0.62, 0.85, 0.5, '#e6d6b6', { seed: 90, ws: 8, hs: 6, lump: 0.02 }), -0.2, 1.3, 1.0));
      P.push(at(GK.blob(0.4, 0.4, 0.4, '#e8b890', { seed: 91, ws: 8, hs: 6, lump: 0.02 }), -0.2, 2.45, 1.0));
      P.push(at(GK.blob(0.5, 0.3, 0.5, '#e8483f', { seed: 92, ws: 8, hs: 5, lump: 0.02 }), -0.2, 2.85, 1.0));
      // hanging lamps along the front edge
      const v = new THREE.Vector3();
      for (const lz of [-2.2, 2.2]) {
        P.push(at(GK.cyl(0.03, 0.03, 0.7, '#3b2a1c', { segs: 3, hsegs: 1, lump: 0 }), 2.3, 3.5, lz));
        P.push(at(GK.blob(0.3, 0.38, 0.3, '#ffe9a8', { seed: 100 + lz, ws: 7, hs: 5, lump: 0.02 }), 2.3, 3.0, lz));
        this.glow(...v.set(2.3, 3.0, lz).applyMatrix4(m).toArray(), 3.4, '#ffcf70', 2);
      }
      this.putAt(GK.merge(P), m, this.clayMat, { name: 'stall' });
    },

    // {seg, t, d, far}: the palace: a hall under a great turquoise onion dome, four minarets, side
    // wings with small domes, a pointed-arch portico and golden finials, facing the road.
    palace(lm, x, y, z, head, parts) {
      const m = this.flatFrame(x, y, z, FableKit.facing(this, lm, x, z));
      const P = [];
      const sand = '#ecd29c', sand2 = '#e0c288', teal = '#2fb0b8', gold = '#ffd166';
      P.push(at(GK.blob(30, 3, 28, '#e8c880', { seed: 3, ws: 14, hs: 5, lump: 0.8 }), 0, -1.2, 0)); // the terrace
      // main hall and the drum under the dome
      P.push(at(GK.box(20, 11, 15, sand, { seed: 4, r: 0.6, seg: 4 }), 0, 5.5, 0));
      P.push(at(GK.box(21, 1.0, 16, sand2, { seed: 5, r: 0.3, seg: 3 }), 0, 11.2, 0));
      P.push(at(GK.cyl(6.4, 6.9, 4, sand, { seed: 6, segs: 16, lump: 0.1 }), 0, 13.2, 0));
      P.push(at(GK.torus(6.6, 0.4, gold, { seed: 7, ts: 18, rs: 4, lump: 0 }), 0, 15.3, 0, PI / 2, 0, 0));
      P.push(at(GK.blob(6.6, 8.2, 6.6, teal, { seed: 8, ws: 14, hs: 9, lump: 0.25 }), 0, 19.2, 0));
      P.push(at(GK.cone(1.5, 5.5, teal, { segs: 10, hsegs: 3, seed: 9, lump: 0 }), 0, 27.4, 0));
      P.push(at(GK.blob(0.6, 0.6, 0.6, gold, { seed: 10, ws: 7, hs: 5, lump: 0 }), 0, 30.4, 0));
      P.push(at(GK.torus(0.85, 0.18, gold, { arc: PI * 1.5, seed: 11, ts: 10, rs: 4, lump: 0 }), 0, 31.7, 0, 0, PI / 2, 0)); // a crescent
      // wings with their own domes, and four minarets
      for (const sd of [-1, 1]) {
        P.push(at(GK.box(9, 8, 12, sand, { seed: 12 + sd, r: 0.5, seg: 3 }), 0, 4, sd * 14.5));
        P.push(at(GK.cyl(3.6, 3.9, 2, sand2, { seed: 14 + sd, segs: 12, lump: 0.08 }), 0, 9, sd * 14.5));
        P.push(at(GK.blob(3.7, 4.4, 3.7, '#4aa8e8', { seed: 16 + sd, ws: 12, hs: 8, lump: 0.15 }), 0, 12, sd * 14.5));
        P.push(at(GK.cone(0.8, 2.6, '#4aa8e8', { segs: 8, hsegs: 2, seed: 18 + sd, lump: 0 }), 0, 17.2, sd * 14.5));
        minaret(P, 9.5, sd * 10, 22, 20 + sd, sand, teal);
        minaret(P, -9.5, sd * 10, 19, 24 + sd, sand, '#4aa8e8');
      }
      // the portico on the road side: a deep pointed arch with a dark doorway and steps
      P.push(at(GK.box(5, 8, 9, sand2, { seed: 30, r: 0.5, seg: 3 }), 10.5, 4, 0));
      P.push(at(GK.box(0.6, 5.2, 3.8, '#2b1838', { seed: 31, r: 0.2, seg: 2, lump: 0 }), 13.1, 2.6, 0));
      P.push(at(GK.blob(0.5, 1.9, 1.9, '#2b1838', { seed: 32, ws: 8, hs: 6, lump: 0 }), 13.1, 5.2, 0));
      beads(P, archPoints(3.2, 6.6, 14).map(([zz, yy]) => [zz, yy + 0.4]), 0.45, gold, 40, 13.3);
      for (let k = 0; k < 4; k++) P.push(at(GK.box(2.2, 0.5, 9.5 + k * 0.4, '#f6e8c4', { seed: 34 + k, r: 0.15, seg: 2 }), 13.6 + k * 0.9, 1.4 - k * 0.4, 0));
      // arched windows (dark teal) on the hall's road side, lit from within
      const v = new THREE.Vector3();
      for (const wz of [-7, -4, 4, 7]) {
        P.push(at(GK.box(0.4, 3.2, 1.5, '#1f5a68', { seed: 50 + wz, r: 0.15, seg: 2, lump: 0 }), 10.2, 7.4, wz));
        P.push(at(GK.blob(0.35, 0.8, 0.75, '#1f5a68', { seed: 56 + wz, ws: 6, hs: 5, lump: 0 }), 10.2, 9.1, wz));
        this.glow(...v.set(10.9, 7.6, wz).applyMatrix4(m).toArray(), 3.2, '#ffd98a', 0);
      }
      // palms and a pool of the same turquoise in front
      for (const [px, pz] of [[15, -9], [15, 9], [-15, -17], [-15, 17]]) P.push(at(GK.cyl(0.35, 0.5, 5, '#a07a52', { seed: px + pz, segs: 6, lump: 0.05 }), px, 2.5, pz));
      this.putAt(GK.merge(P), m, this.clayMat, { far: true, name: 'palace' });
      // the dome's finial catches the light
      this.glow(...v.set(0, 31.5, 0).applyMatrix4(m).toArray(), 7, '#ffe9a0', 1);
    },

    // {seg, t, d, far}: a small domed temple with one minaret
    temple(lm, x, y, z, head, parts) {
      const m = this.flatFrame(x, y, z, FableKit.facing(this, lm, x, z));
      const P = [];
      const stone = '#f1dcae', dome = '#e8a23f';
      P.push(at(GK.blob(14, 1.6, 14, '#e8c880', { seed: 3, ws: 12, hs: 5, lump: 0.4 }), 0, -0.5, 0));
      P.push(at(GK.cyl(5.2, 5.6, 6.5, stone, { seed: 4, segs: 12, lump: 0.1 }), 0, 3.2, 0));
      P.push(at(GK.torus(5.3, 0.3, '#c99a3c', { seed: 5, ts: 14, rs: 4, lump: 0 }), 0, 6.5, 0, PI / 2, 0, 0));
      P.push(at(GK.blob(5.4, 5.8, 5.4, dome, { seed: 6, ws: 12, hs: 8, lump: 0.18 }), 0, 9.6, 0));
      P.push(at(GK.cone(1.1, 3.4, dome, { segs: 8, hsegs: 2, seed: 7, lump: 0 }), 0, 15.2, 0));
      P.push(at(GK.blob(0.45, 0.45, 0.45, '#ffd166', { seed: 8, ws: 6, hs: 4, lump: 0 }), 0, 17.2, 0));
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU + 0.3;
        P.push(at(GK.cyl(0.4, 0.5, 5.4, '#e8d4a0', { seed: 10 + k, segs: 6, lump: 0.04 }), Math.cos(a) * 5.4, 2.7, Math.sin(a) * 5.4));
      }
      P.push(at(GK.box(0.5, 3.8, 2.6, '#2b1838', { seed: 20, r: 0.15, seg: 2, lump: 0 }), 5.4, 1.9, 0));
      minaret(P, -7.5, 5, 15, 30, stone, '#2fb0b8');
      this.putAt(GK.merge(P), m, this.clayMat, { far: true, name: 'temple' });
      this.glow(...new THREE.Vector3(5.8, 2.4, 0).applyMatrix4(m).toArray(), 3.4, '#ffcf70', 2);
    },

    // {seg, t, d, h, r, n}: n flying carpets circling a point r units wide, h above the ground, each
    // with a rider in a turban, bobbing and banking as they go
    carpets(lm, x, y, z, head, parts) {
      const n = lm.n || 3, R = lm.r || 40, H = lm.h || 22;
      const cols = [['#c4443c', '#ffd166'], ['#2d9cb8', '#fff3d0'], ['#7a5ad0', '#ffcf70'], ['#e8a23f', '#c4443c']];
      for (let k = 0; k < n; k++) {
        const [base, trim] = cols[k % cols.length];
        const P = [
          GK.box(4.6, 0.18, 2.8, base, { seed: 300 + k, r: 0.06, seg: 3, lump: 0.02 }),
          GK.box(4.8, 0.2, 0.3, trim, { seed: 310 + k, r: 0.05, seg: 1, lump: 0 }).translate(0, 0.02, 1.3),
          GK.box(4.8, 0.2, 0.3, trim, { seed: 320 + k, r: 0.05, seg: 1, lump: 0 }).translate(0, 0.02, -1.3),
          GK.box(0.3, 0.2, 2.8, trim, { seed: 330 + k, r: 0.05, seg: 1, lump: 0 }).translate(2.3, 0.02, 0),
          GK.box(0.3, 0.2, 2.8, trim, { seed: 340 + k, r: 0.05, seg: 1, lump: 0 }).translate(-2.3, 0.02, 0),
          GK.blob(0.9, 0.42, 0.9, trim, { seed: 350 + k, ws: 7, hs: 5, lump: 0.03 }).translate(0, 0.32, 0),
          GK.blob(0.38, 0.5, 0.3, '#e6d6b6', { seed: 360 + k, ws: 7, hs: 5, lump: 0.02 }).translate(-0.2, 0.95, 0),
          GK.blob(0.28, 0.28, 0.28, '#e8b890', { seed: 370 + k, ws: 7, hs: 5, lump: 0.02 }).translate(-0.2, 1.55, 0),
          GK.blob(0.34, 0.2, 0.34, '#fff0d6', { seed: 380 + k, ws: 7, hs: 4, lump: 0.02 }).translate(-0.2, 1.85, 0),
        ];
        // the tassels trail behind
        for (let t = -1; t <= 1; t++) P.push(GK.cone(0.12, 0.7, trim, { segs: 4, hsegs: 1, seed: 390 + t, lump: 0 }).rotateZ(PI / 2).translate(-2.9, 0, t * 0.9));
        const mesh = new THREE.Mesh(GK.merge(P), this.clayMat);
        mesh.castShadow = true;
        this.scene.add(mesh);
        const ph = (k / n) * TAU, dir = k % 2 ? -1 : 1, rr = R * (0.8 + 0.25 * (k % 3) / 2), hh = H + (k % 2) * 5;
        this.anims.push((t) => {
          const a = ph + dir * t * (0.22 - 0.02 * k);
          mesh.position.set(x + Math.cos(a) * rr, y + hh + Math.sin(t * 1.3 + k * 2) * 0.8, z + Math.sin(a) * rr);
          mesh.rotation.set(Math.sin(t * 0.9 + k) * 0.06, -a - (dir * PI) / 2, Math.cos(t * 1.1 + k) * 0.08 - 0.05 * dir);
        });
      }
    },

    // {seg, t}: a natural arch of sandstone over the canyon, high above the road
    rockarch(lm, x, y, z, head, parts) {
      const w = this.track.where(lm), p = w.path;
      const q = p.point(w.s, 0);
      const e = q.hw + q.sh + 2.5;
      const m = this.frame(p, w.s);
      const P = [];
      const pts = archPoints(e + 1.5, 15, 16);
      beads(P, pts, 2.3, (k) => ['#c98e58', '#cf9560', '#b9824f'][k % 3], 500);
      for (const sd of [-1, 1]) {
        for (let k = 0; k < 3; k++) P.push(at(GK.blob(3.4 - k * 0.4, 3.2, 3.4 - k * 0.4, k % 2 ? '#c98e58' : '#b9824f', { seed: 530 + k + sd * 5, lump: 1.0 }), 0, 2.5 + k * 3.5, sd * (e + 1.5 + k * 0.4)));
      }
      this.putAt(GK.merge(P), m, this.clayMat, { far: true, name: 'rockarch' });
    },

    // {seg, t, seg1, t1}: the coaster's trestle under a stretch of road over the void: a bent of
    // posts, a cross beam and X braces every 6 units, red and cream guard lights along the rails
    coaster(lm, x, y, z, head, parts) {
      const r = this.rangeOf(lm);
      if (!r) return;
      const p = this.track.main;
      const ids = [];
      for (let s = r.s0; s <= r.s1; s += p.step) ids.push(p.indexAt(s));
      const v = {}, w = {}, P = [], lights = [];
      const wood = '#b8714a', dark = '#7a4a30';
      const bulbs = ['#ff5d4d', '#ffd24a', '#5fe0d0', '#ffffff'];
      for (let k = 0; k < ids.length; k += 6) {
        const i = ids[k];
        const lat = p.hw[i] - 0.6;
        const post = [];
        for (const side of [-1, 1]) {
          this.gp(p, i, side * lat, -0.9, v);
          const ground = this.heightAt(v.x, v.z);
          const bottom = ground === null ? this.voidY + 4 : ground - 0.5;
          const h = v.y - bottom;
          if (h < 1) continue;
          post.push([side, v.x, v.y, v.z, h, bottom]);
          P.push(at(GK.box(0.7, h, 0.7, wood, { seed: i + side, r: 0.2, seg: 2, lump: 0.04 }), v.x, bottom + h / 2, v.z));
        }
        if (post.length === 2) {
          // the cross beam between the two posts, and an X brace between them
          const [a, b] = post;
          const dx = b[1] - a[1], dz = b[3] - a[3], len = Math.hypot(dx, dz), yaw = -Math.atan2(dz, dx);
          const beam = GK.box(len, 0.55, 0.55, dark, { seed: i, r: 0.15, seg: 2, lump: 0.03 });
          beam.rotateY(yaw);
          beam.translate((a[1] + b[1]) / 2, a[2] - 0.5, (a[3] + b[3]) / 2);
          P.push(beam);
          if (Math.min(a[4], b[4]) > 5) {
            const drop = Math.min(a[4], b[4], 7), diag = Math.hypot(len, drop), tilt = Math.atan2(len, drop);
            for (const sg of [-1, 1]) {
              const bar = GK.box(0.28, diag, 0.28, dark, { seed: i + 3, r: 0.08, seg: 1, lump: 0 });
              bar.rotateZ(sg * tilt);
              bar.rotateY(yaw);
              bar.translate((a[1] + b[1]) / 2, a[2] - 0.5 - drop / 2, (a[3] + b[3]) / 2);
              P.push(bar);
            }
          }
        }
        // a post's lights: a bulb on top of each guard rail every 6 units
        for (const side of [-1, 1]) {
          this.gp(p, i, side * (p.hw[i] + p.sh[i] - 0.1), 1.45, w);
          lights.push([w.x, w.y, w.z, bulbs[(k / 6 + (side > 0 ? 2 : 0)) % bulbs.length]]);
        }
      }
      // longitudinal braces between neighbouring bents on each side
      for (const side of [-1, 1]) {
        let prev = null;
        for (let k = 0; k < ids.length; k += 6) {
          const i = ids[k];
          this.gp(p, i, side * (p.hw[i] - 0.6), -1.9, v);
          if (prev) {
            const dx = v.x - prev.x, dz = v.z - prev.z, dy = v.y - prev.y, len = Math.hypot(dx, dy, dz);
            const bar = GK.box(len, 0.32, 0.32, dark, { seed: i, r: 0.1, seg: 1, lump: 0 });
            bar.rotateZ(Math.atan2(dy, Math.hypot(dx, dz)));
            bar.rotateY(-Math.atan2(dz, dx));
            bar.translate((v.x + prev.x) / 2, (v.y + prev.y) / 2, (v.z + prev.z) / 2);
            P.push(bar);
          }
          prev = { x: v.x, y: v.y, z: v.z };
        }
      }
      for (const [bx, by, bz, col] of lights) {
        P.push(at(GK.blob(0.22, 0.22, 0.22, col, { seed: 7, ws: 6, hs: 4, lump: 0 }), bx, by, bz));
        this.glow(bx, by + 0.15, bz, 1.9, col, 1);
      }
      if (P.length) this.put(GK.merge(P), this.clayMat, { far: true, name: 'coaster' });
    },

    // {seg, t, seg1, t1}: the Flying Dutchman: a ghost ship's hull under the road (the deck is the
    // road), a lantern post at the gangway and the bow, three masts with tattered sails and a skull
    // flag, rigging, green flames and mist. The road must be straight and level on its deck.
    ghostship(lm, x, y, z, head, parts) {
      const r = this.rangeOf(lm);
      if (!r) return;
      const p = this.track.main;
      const sm = (r.s0 + r.s1) / 2, L = r.s1 - r.s0;
      const M = this.frame(p, sm);
      const q = p.point(sm, 0);
      const W = q.hw + q.sh + 1.4;
      const deckY = 0; // the frame sits on the deck (level and straight over the range)
      const X = (u) => (u - 0.5) * L; // local x along the ship from u 0 (stern) to 1 (bow)
      const P = [];
      const hullA = '#3c3350', hullB = '#2f2842', slime = '#5ed8a0';
      // ---- the hull: a loft of half-ellipses below the deck, narrowing at both ends, the bow rising
      const verts = [], cols = [], idx = [];
      const rings = 22, steps = 12;
      for (let ring = 0; ring <= rings; ring++) {
        const u = ring / rings;
        const bow = sstep(0.62, 1, u), stern = 1 - sstep(0, 0.14, u);
        const half = W * (1 - 0.88 * Math.pow(bow, 1.6) - 0.25 * stern);
        const depth = 10.5 * (1 - 0.35 * bow - 0.25 * stern);
        for (let k = 0; k <= steps; k++) {
          const a = (k / steps) * PI;
          verts.push(X(u), deckY - 0.6 - Math.sin(a) * depth, Math.cos(a) * half);
          const plank = Math.floor((Math.sin(a) * depth) / 1.1) % 2 ? 0.88 : 1;
          const c = new THREE.Color(Math.floor(u * 40) % 3 === 0 ? hullB : hullA);
          const sl = U.hash2(ring, k, 3) < 0.18 ? 0.5 : 0;
          const cs = new THREE.Color(slime);
          cols.push(U.lerp(c.r * plank, cs.r, sl), U.lerp(c.g * plank, cs.g, sl), U.lerp(c.b * plank, cs.b, sl));
        }
        if (ring > 0) {
          const r0 = (ring - 1) * (steps + 1), r1 = ring * (steps + 1);
          for (let k = 0; k < steps; k++) idx.push(r0 + k, r0 + k + 1, r1 + k, r0 + k + 1, r1 + k + 1, r1 + k);
        }
      }
      // (the loft's outer face looks down and out; flip it so it faces away from the ship)
      for (let i = 0; i < idx.length; i += 3) {
        const t = idx[i + 1];
        idx[i + 1] = idx[i + 2];
        idx[i + 2] = t;
      }
      const hull = this.geo(verts, cols, idx);
      this.putAt(hull, M, this.sheetMat, { far: true, name: 'ghostship' });
      // ---- masts, yards and tattered sails (outside the guard rails, so the road stays clear)
      const sail = '#a9b6ae', rag = '#8d9a92';
      [[0.3, -1, 38], [0.55, 1, 44], [0.8, -1, 34]].forEach(([u, sd, h], q2) => {
        const mx = X(u), mz = sd * (W + 0.8);
        P.push(at(GK.cyl(0.7, 1.0, h, '#4a3a4e', { seed: 600 + q2, segs: 8, lump: 0.06 }), mx, deckY + h / 2, mz));
        for (const [fy, len] of [[0.52, 18], [0.8, 13]]) {
          const yy = deckY + h * fy;
          P.push(at(GK.cyl(0.32, 0.38, len, '#4a3a4e', { seed: 610 + q2, segs: 6, hsegs: 1, lump: 0.04 }), mx, yy, mz, PI / 2, 0, 0));
          // a ragged sail hanging from the yard, with holes
          P.push(at(GK.box(0.3, h * 0.26, len * 0.86, sail, { seed: 620 + q2, r: 0.1, seg: 3, lump: 0.35 }), mx + 0.2, yy - h * 0.14, mz));
          for (let t = -3; t <= 3; t++) P.push(at(GK.cone(0.5, 1.6 + (t % 2 ? 1.1 : 0), rag, { segs: 3, hsegs: 1, seed: 640 + t + q2, lump: 0.1 }), mx + 0.2, yy - h * 0.27 - 0.6, mz + t * len * 0.13, 0, 0, PI));
          P.push(at(GK.blob(0.35, 1.5, 1.7, '#1f1a2a', { seed: 660 + q2, ws: 7, hs: 5, lump: 0.3 }), mx + 0.45, yy - h * 0.12, mz + (q2 - 1) * 2));
        }
        // a crow's nest and green fire on top, ropes to the rail
        P.push(at(GK.cyl(1.5, 1.2, 1.2, '#4a3a4e', { seed: 670 + q2, segs: 8, hsegs: 1, lump: 0.05 }), mx, deckY + h * 0.9, mz));
        P.push(at(GK.blob(0.55, 0.8, 0.55, '#7dffb0', { seed: 680 + q2, ws: 7, hs: 5, lump: 0.1 }), mx, deckY + h + 0.4, mz));
        for (const dx of [-9, -4, 4, 9]) {
          const tx = mx + dx, ty = deckY + 1.6, tz = sd * (W - 0.4);
          const top = [mx, deckY + h * 0.92, mz];
          const len = Math.hypot(tx - top[0], ty - top[1], tz - top[2]);
          const rope = GK.cyl(0.07, 0.07, len, '#2a2230', { segs: 3, hsegs: 1, lump: 0 });
          rope.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(tx - top[0], ty - top[1], tz - top[2]).normalize()));
          rope.translate((tx + top[0]) / 2, (ty + top[1]) / 2, (tz + top[2]) / 2);
          P.push(rope);
        }
        if (q2 === 1) {
          // the skull flag on the middle mast
          P.push(at(GK.box(0.12, 3.2, 5, '#17121f', { seed: 690, r: 0.05, seg: 2, lump: 0.1 }), mx + 0.3, deckY + h + 1.8, mz - 2.7));
          P.push(at(GK.blob(0.14, 0.85, 0.85, '#f4efe6', { seed: 691, ws: 8, hs: 6, lump: 0.05 }), mx + 0.42, deckY + h + 2.1, mz - 2.7));
          for (const dz2 of [-0.3, 0.3]) P.push(at(GK.blob(0.1, 0.22, 0.22, '#17121f', { seed: 692, ws: 6, hs: 4, lump: 0 }), mx + 0.52, deckY + h + 2.25, mz - 2.7 + dz2));
        }
      });
      // ---- lantern posts with green fire along both rails, and the bow's posts and bowsprit
      const v = new THREE.Vector3();
      for (let k = 0; k <= 8; k++) {
        const ux = 0.08 + k * 0.105;
        for (const sd of [-1, 1]) {
          const lx = X(ux), lz = sd * (W - 0.3);
          P.push(at(GK.cyl(0.14, 0.2, 3.4, '#3b3048', { seed: 700 + k, segs: 5, hsegs: 1, lump: 0.03 }), lx, deckY + 1.7, lz));
          P.push(at(GK.blob(0.4, 0.55, 0.4, '#9bffcb', { seed: 710 + k, ws: 7, hs: 5, lump: 0.05 }), lx, deckY + 3.7, lz));
          this.glow(...v.set(lx, deckY + 3.9, lz).applyMatrix4(M).toArray(), 3.6, '#6dffb5', 3);
        }
      }
      for (const sd of [-1, 1]) {
        P.push(at(GK.blob(0.8, 1.1, 0.8, '#f1ece0', { seed: 720 + sd, ws: 8, hs: 6, lump: 0.05 }), X(0.97), deckY + 5.6, sd * (W - 0.3))); // a skull on each bow post
        P.push(at(GK.cyl(0.25, 0.3, 5.2, '#3b3048', { seed: 722 + sd, segs: 5, hsegs: 1, lump: 0.03 }), X(0.97), deckY + 2.6, sd * (W - 0.3)));
      }
      // the bowsprit, a long spar reaching out over the drop
      const bs = GK.cyl(0.4, 0.7, 30, '#4a3a4e', { seed: 730, segs: 6, hsegs: 2, lump: 0.05 });
      bs.rotateZ(-PI / 2 + 0.34);
      bs.translate(X(1) + 9, deckY + 8, W + 1.2);
      P.push(bs);
      P.push(at(GK.blob(0.9, 0.9, 0.9, '#7dffb0', { seed: 731, ws: 7, hs: 5, lump: 0.1 }), X(1) + 23.5, deckY + 13.4, W + 1.2));
      this.glow(...v.set(X(1) + 23.5, deckY + 13.6, W + 1.2).applyMatrix4(M).toArray(), 6, '#6dffb5', 1);
      // barrels and crates stacked behind the stern posts, an anchor by the gangway
      for (const [bx, bz, k] of [[X(0.04), -W + 0.5, 0], [X(0.07), -W + 1.2, 1], [X(0.05), W - 0.6, 2]]) {
        P.push(at(GK.cyl(0.8, 0.8, 1.3, '#6a4a38', { seed: 740 + k, segs: 8, hsegs: 2, lump: 0.05 }), bx, deckY + 0.65, bz));
        P.push(at(GK.torus(0.82, 0.08, '#3b3048', { seed: 745 + k, ts: 10, rs: 3, lump: 0 }), bx, deckY + 0.7, bz, PI / 2, 0, 0));
      }
      this.putAt(GK.merge(P), M, this.clayMat, { far: true, name: 'ghostship' });
      // ---- green mist drifting round the ship
      for (let k = 0; k < 14; k++) {
        const ux = U.hash2(k, 5, 2), sd = k % 2 ? 1 : -1;
        this.glow(...v.set(X(ux), deckY + 2 + U.hash2(k, 6, 2) * 9, sd * (W + 4 + U.hash2(k, 7, 2) * 8)).applyMatrix4(M).toArray(), 11, k % 3 ? '#4fe0a0' : '#9ad8ff', 3);
      }
    },

    // {seg, t}: the pool at the foot of the plunge: a ring of foam and plumes of spray that
    // swell, climb and fade, over and over, with a mist above it
    splashpool(lm, x, y, z, head, parts) {
      const w = this.track.where(lm), p = w.path;
      const q = p.point(w.s, 0);
      const m = this.flatFrame(q.x, q.y, q.z, q.head);
      const geo = worldGeo('fable:plume', () => GK.blob(1, 1, 1, '#ffffff', { seed: 9, ws: 8, hs: 6, lump: 0.25 }));
      const plumes = [];
      for (let k = 0; k < 16; k++) {
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: k % 3 ? '#eaf8ff' : '#bfe6ff', transparent: true, opacity: 0.7, depthWrite: false, fog: true }));
        this.scene.add(mesh);
        this.keep(mesh.material);
        // up the two sides of the pool, so the way ahead stays clear
        plumes.push({ mesh, ph: k / 16, lz: (k % 2 ? 1 : -1) * (6 + U.hash2(k, 1, 4) * 5), lx: (U.hash2(k, 2, 4) - 0.2) * 8 });
      }
      const v = new THREE.Vector3();
      this.anims.push((t) => {
        for (const pl of plumes) {
          const u = (t * 0.33 + pl.ph) % 1;
          v.set(pl.lx + u * 3, 0.5 + u * 7.5, pl.lz).applyMatrix4(m);
          pl.mesh.position.copy(v);
          pl.mesh.scale.setScalar(1.0 + u * 2.8);
          pl.mesh.material.opacity = 0.55 * Math.min(1, u * 5) * (1 - u);
        }
      });
      for (let k = 0; k < 6; k++) this.glow(...v.set(1 + (k % 3) * 2, 2 + (k % 2) * 2, (k % 2 ? 1 : -1) * (7 + (k >> 1) * 1.5)).applyMatrix4(m).toArray(), 8, '#d8f2ff', 3);
    },
  });
})();
