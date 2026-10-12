'use strict';
// The places of Fable Fair's dream lap (browser only; see js/courses/fablefair.js): rings of dancing
// elves, toadstool houses, trolls on the roadside, castles (on the ground or on floating islands),
// flower arches, fountains, strings of lanterns, the troll bridge, the Milky Way under the glider
// leap, and a scatter that fills a stretch of road with trees, toadstools, elves and trolls.
// The figures and buildings come from fablefair-realm.js (FableKit).
(() => {
  const at = GK.at.bind(GK);
  const PI = Math.PI;
  const { elf, troll, trollPeek, castle, windows, island, toadHouse } = FableKit;

  // ---- helpers
  // Put a figure (from FableKit.elf / troll: {geo, glows}) at a world position, facing heading h, scaled by s.
  function place(world, fig, x, y, z, h, s, o = {}) {
    const g = GK.at(fig.geo.clone(), x, y, z, 0, -h, 0, s);
    world.put(g, world.clayMat, { name: o.name || 'realm', far: !!o.far });
    const c = Math.cos(-h), sn = Math.sin(-h);
    for (const [gx, gy, gz, size, col, mode] of fig.glows) world.glow(x + s * (gx * c + gz * sn), y + s * gy, z + s * (-gx * sn + gz * c), size * Math.max(1, s * 0.8), col, mode === undefined ? 1 : mode);
  }
  // Where a landmark stands on the ground: its road spot moved d to the side (and ds along), on the land there.
  function spot(world, lm) {
    const w = world.track.where(lm), p = w.path;
    const q = p.point(w.s + (lm.ds || 0), lm.d || 0);
    const ground = lm.d ? world.heightAt(q.x, q.z) : q.y;
    return { x: q.x, z: q.z, y: ground === null ? q.yc + (lm.h || 0) : ground + (lm.h || 0), void: ground === null, road: p.point(w.s + (lm.ds || 0), 0), s: w.s };
  }
  // a little unlit material for lit windows and glowing bits
  function glowMat(world) {
    return world.matCache['realm-lit'] || (world.matCache['realm-lit'] = world.keep(new THREE.MeshBasicMaterial({ vertexColors: true, fog: true })));
  }

  // ---- the "Zzz" a sleeping troll snores: three letters that float up, swell and fade
  function snore(world, x, y, z, size) {
    const tex = world.matCache['realm-z'] || (world.matCache['realm-z'] = world.keep(world.canvasTex(64, 64, (g) => {
      g.font = '800 54px Fredoka, Nunito, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 8;
      g.strokeStyle = 'rgba(120,90,230,0.9)';
      g.strokeText('Z', 32, 34);
      g.fillStyle = '#ffffff';
      g.fillText('Z', 32, 34);
    })));
    const sprites = [];
    for (let k = 0; k < 3; k++) {
      const sp = new THREE.Sprite(world.keep(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: true })));
      world.scene.add(sp);
      sprites.push(sp);
    }
    world.anims.push((t) => {
      sprites.forEach((sp, k) => {
        const u = (t * 0.28 + k / 3) % 1;
        sp.position.set(x + u * size * 0.9, y + u * size * 2.4, z + Math.sin(u * 5 + k) * size * 0.18);
        sp.scale.setScalar(size * (0.5 + u * 0.9));
        sp.material.opacity = Math.min(1, u * 5) * (1 - u) * 1.1;
      });
    });
  }

  Object.assign(FableKit, { place, spot, glowMat });

  Object.assign(LANDMARKS, {
    // {seg, t, d, ds, v, s}: a ring of elves dancing hand in hand round a glowing toadstool, turning
    // slowly, with a piper on a stump and sparkles over their heads.
    elfring(lm, x, y, z) {
      const sp = spot(this, lm), s = lm.s || 1.3, n = 8, R = 3.1 * s;
      const P = [];
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU, e = elf((lm.v || 0) + k, 'ring');
        const g = GK.at(e.geo.clone(), Math.cos(a) * R, 0, Math.sin(a) * R, 0, PI - a, 0, s);
        P.push(g);
      }
      // the middle: a great glowing toadstool
      P.push(at(GK.cyl(0.55 * s, 0.8 * s, 2.6 * s, '#f4ecd8', { seed: 91, segs: 8, hsegs: 2 }), 0, 1.3 * s, 0));
      P.push(at(GK.blob(2.0 * s, 1.1 * s, 2.0 * s, '#ff9ad0', { seed: 92, ws: 10, hs: 7 }), 0, 2.9 * s, 0));
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * TAU;
        P.push(at(GK.blob(0.3 * s, 0.12 * s, 0.3 * s, '#fffbe0', { seed: 93 + k, ws: 6, hs: 4, lump: 0 }), Math.cos(a) * 1.1 * s, 3.5 * s, Math.sin(a) * 1.1 * s));
      }
      // a ring of little glowing mushrooms round the dance
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU + 0.2, r = R + 1.7 * s;
        P.push(at(GK.cyl(0.1 * s, 0.14 * s, 0.5 * s, '#f4ecd8', { seed: 100 + k, segs: 5, hsegs: 1, lump: 0 }), Math.cos(a) * r, 0.25 * s, Math.sin(a) * r));
        P.push(at(GK.blob(0.34 * s, 0.2 * s, 0.34 * s, ['#7a5ad8', '#3fc8b0', '#e0589a'][k % 3], { seed: 110 + k, ws: 6, hs: 4 }), Math.cos(a) * r, 0.55 * s, Math.sin(a) * r));
      }
      const ring = GK.merge(P);
      const mesh = new THREE.Mesh(this.keep(ring), this.clayMat);
      mesh.position.set(sp.x, sp.y, sp.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      const ph = lm.s || 0, dir = (lm.v || 0) % 2 ? -1 : 1;
      this.anims.push((t) => {
        mesh.rotation.y = t * 0.45 * dir;
        mesh.position.y = sp.y + Math.abs(Math.sin(t * 2.6 + ph)) * 0.12;
      });
      this.glow(sp.x, sp.y + 3.4 * s, sp.z, 9 * s, '#ffb0e0', 1);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        this.glow(sp.x + Math.cos(a) * R * 0.8, sp.y + 4.6 * s + (k % 3) * 0.8, sp.z + Math.sin(a) * R * 0.8, 2.4 * s, ['#fff0a8', '#bfe0ff', '#ffc8f0'][k % 3], 3);
      }
      // a piper on a stump outside the ring
      const a = lm.pa === undefined ? 0.6 : lm.pa, r = R + 3.4 * s, px = sp.x + Math.cos(a) * r, pz = sp.z + Math.sin(a) * r;
      const face = Math.atan2(sp.z - pz, sp.x - px);
      const stump = GK.at(GK.cyl(0.8 * s, 1.0 * s, 0.8 * s, '#8a6248', { seed: 120, segs: 8 }), px, sp.y + 0.4 * s, pz);
      this.put(stump, this.clayMat, { name: 'realm' });
      place(this, elf((lm.v || 0) + 3, 'pipe'), px, sp.y + 0.8 * s, pz, face, s);
    },

    // {seg, t, d, ds, v, s, face}: a toadstool house with an elf at the door, a lantern and a few flowers.
    elfhouse(lm, x, y, z) {
      const sp = spot(this, lm), s = lm.s || 1;
      const face = lm.face !== undefined ? (lm.face * PI) / 180 : FableKit.facing(this, lm, sp.x, sp.z);
      const m = this.flatFrame(sp.x, sp.y, sp.z, face);
      const P = [], L = [];
      toadHouse(P, L, 1.2 * s, lm.v || 0);
      // a little garden: flowers by the step and a lantern post
      for (let k = 0; k < 5; k++) {
        const a = -0.9 + k * 0.45;
        P.push(at(GK.cyl(0.04, 0.05, 0.6 * s, '#4f9a62', { seed: 130 + k, segs: 4, hsegs: 1, lump: 0 }), 2.2 * s, 0.3 * s, Math.sin(a) * 1.5 * s));
        P.push(at(GK.blob(0.22 * s, 0.14 * s, 0.22 * s, ['#ff8ac8', '#ffe27a', '#9ab0ff', '#ffffff'][k % 4], { seed: 140 + k, ws: 6, hs: 4, lump: 0 }), 2.2 * s, 0.65 * s, Math.sin(a) * 1.5 * s));
      }
      this.putAt(GK.merge(P), m, this.clayMat, { name: 'elfhouse' });
      this.putAt(windows(L), m, glowMat(this), { cast: false, receive: false });
      const v = new THREE.Vector3();
      this.glow(...v.set(1.9 * s, 1.9 * s, 0).applyMatrix4(m).toArray(), 5 * s, '#ffd98a', 2);
      // an elf by the door
      const e = elf((lm.v || 0) * 2 + 1, lm.pose || 'wave');
      const pos = new THREE.Vector3(3.4 * s, 0, 1.4 * s).applyMatrix4(m);
      place(this, e, pos.x, pos.y, pos.z, face + 0.5, s);
    },

    // {seg, t, d, ds, pose, v, s}: a troll by the road: 'sit', 'sleep', 'stand', 'wave' (with a lantern),
    // 'fish'. Sitting trolls have a boulder under them; a sleeping one snores.
    troll(lm, x, y, z) {
      const sp = spot(this, lm), s = lm.s || 1, pose = lm.pose || 'sit', v = lm.v || 0;
      const face = lm.face !== undefined ? (lm.face * PI) / 180 : FableKit.facing(this, lm, sp.x, sp.z);
      let base = 0;
      if (pose === 'sit' || pose === 'sleep') {
        const rock = DECOR_PIECES.mossrock.call(this, U.rng(v + 3), 40 + v);
        this.put(GK.at(rock, sp.x, sp.y, sp.z, 0, -face + 0.4, 0, 2.2 * s), this.clayMat, { name: 'realm' });
        base = 1.7 * s;
      }
      const t = troll(v, pose);
      place(this, t, sp.x, sp.y + base, sp.z, face, s);
      if (pose === 'sleep') snore(this, sp.x + Math.cos(face) * 1.2 * s, sp.y + base + 9 * s, sp.z + Math.sin(face) * 1.2 * s, 1.6 * s);
    },
    // {seg, t, d, ds, v, s}: a rock with a troll peeking over it
    trollpeek(lm, x, y, z) {
      const sp = spot(this, lm), s = lm.s || 1;
      const face = lm.face !== undefined ? (lm.face * PI) / 180 : FableKit.facing(this, lm, sp.x, sp.z);
      place(this, trollPeek(lm.v || 0), sp.x, sp.y, sp.z, face, s);
    },

    // {seg, t, d, ds, h, s, v, island}: a castle, on the ground or (island) on a floating island h above it
    castle(lm, x, y, z) {
      const sp = spot(this, lm), s = lm.s || 3, v = lm.v || 0;
      const face = lm.face !== undefined ? (lm.face * PI) / 180 : FableKit.facing(this, lm, sp.x, sp.z);
      const m = this.flatFrame(sp.x, sp.y, sp.z, face);
      const P = [], L = [];
      if (lm.island) {
        const ip = [];
        island(ip, s * 2.3, 200 + v * 7, '#7a68d4', '#4c3ca0');
        this.putAt(GK.merge(ip), m, this.clayMat, { far: true, name: 'island' });
      }
      castle(P, L, s, v);
      this.putAt(GK.merge(P), m, this.clayMat, { far: true, name: 'castle' });
      this.putAt(windows(L), m, glowMat(this), { far: true, cast: false, receive: false });
      const t = new THREE.Vector3();
      L.forEach(([wx, wy, wz], k) => {
        if (k % 3 === 0) this.glow(...t.set(wx * 1.05, wy, wz * 1.05).applyMatrix4(m).toArray(), s * 1.4, '#ffd98a', 2);
      });
    },

    // {seg, t, seg1, t1, pieces, every, off: [min, max], sides, scale: [min, max], seed, figs}: a stretch of
    // scenery. Every `every` units along the stretch, on each side, a piece of decor (a name from DECOR_PIECES)
    // stands between off[0] and off[1] units from the road's edge. figs: [{kind: 'elf'|'troll', pose, every}]
    // are people standing among them.
    scatter(lm, x, y, z) {
      const r = this.rangeOf(lm);
      if (!r) return;
      const p = this.track.main, rnd = U.rng((lm.seed || 1) * 7919 + Math.round(r.s0));
      const pieces = lm.pieces || ['dreamtree'], off = lm.off || [8, 30], scale = lm.scale || [0.9, 1.4], every = lm.every || 9;
      const sides = lm.sides === undefined ? [-1, 1] : lm.sides === 0 ? [-1, 1] : [lm.sides];
      const v = {};
      for (let s = r.s0; s <= r.s1; s += every * (0.65 + rnd() * 0.7)) {
        const i = p.indexAt(s);
        for (const side of sides) {
          if (rnd() < (lm.skip || 0.12)) continue;
          const kind = pieces[Math.floor(rnd() * pieces.length)];
          const d = side * (p.hw[i] + p.sh[i] + off[0] + rnd() * (off[1] - off[0]));
          this.gp(p, i, d, 0, v);
          const ground = this.heightAt(v.x, v.z);
          if (ground === null) continue;
          const g = this.decorVariant(kind, Math.floor(rnd() * 3), 'dream');
          if (!g) continue;
          this.stamp(g, v.x, ground, v.z, rnd() * TAU, scale[0] + rnd() * (scale[1] - scale[0]), this.clayMat, { name: 'decor' });
        }
      }
      // people among the scenery
      for (const f of lm.figs || []) {
        const fr = U.rng((f.seed || 3) * 4421 + Math.round(r.s0));
        for (let s = r.s0 + (f.start || 6); s <= r.s1; s += (f.every || 40) * (0.7 + fr() * 0.6)) {
          const i = p.indexAt(s), side = f.side || (fr() < 0.5 ? -1 : 1);
          const d = side * (p.hw[i] + p.sh[i] + (f.off ? f.off[0] + fr() * (f.off[1] - f.off[0]) : 4 + fr() * 6));
          this.gp(p, i, d, 0, v);
          const ground = this.heightAt(v.x, v.z);
          if (ground === null) continue;
          const road = p.point(s, 0), face = Math.atan2(road.z - v.z, road.x - v.x) + (fr() - 0.5) * 0.6;
          const sc = (f.scale || 1) * (0.9 + fr() * 0.3), variant = Math.floor(fr() * 6);
          const pose = f.poses ? f.poses[Math.floor(fr() * f.poses.length)] : f.pose || 'stand';
          const fig = f.kind === 'troll' ? troll(variant % 4, pose) : elf(variant, pose);
          place(this, fig, v.x, ground, v.z, face, sc);
        }
      }
    },
  });
})();
