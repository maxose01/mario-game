'use strict';
// 3D landmark builders used only by Mount Wobble (browser only; see LANDMARKS in world3d.js).
// Each builder is called with this = World3D as (spec, x, groundY, z, roadHeading, parts).

// The angle from (x, z) toward the road at a landmark's spot (to turn buildings to face it).
function mountFacing(world, lm, x, z) {
  const at = world.track.where(lm);
  const road = at.path.point(at.s, 0);
  return Math.atan2(road.z - z, road.x - x);
}

// Chimney smoke: clay puffs that rise, swell and fade out in a loop above (x, y, z).
function mountSmoke(world, x, y, z, size = 1) {
  const geo = worldGeo('mount:puff', () => GK.blob(1, 0.8, 1, '#eeeef6', { seed: 7, lump: 0.25 }));
  const puffs = [];
  for (let k = 0; k < 5; k++) {
    const m = new THREE.Mesh(geo, world.clayMat);
    world.scene.add(m);
    puffs.push(m);
  }
  world.anims.push((t) => {
    puffs.forEach((m, k) => {
      const u = (t * 0.22 + k / puffs.length) % 1;
      m.position.set(x + Math.sin(u * 5 + k) * 0.6 + u * 3, y + u * 9, z + Math.cos(u * 4 + k) * 0.5);
      m.scale.setScalar(size * (0.5 + u * 1.6) * Math.min(1, (1 - u) * 4));
    });
  });
}

// A little clay figure (skier, lift rider): body, head and a bobble hat.
function mountFigure(col, hat, seed) {
  return GK.merge([
    GK.at(GK.blob(0.5, 0.65, 0.42, col, { seed }), 0, 0.65, 0),
    GK.at(GK.blob(0.36, 0.36, 0.36, '#ffd9b8', { seed: seed + 1 }), 0, 1.5, 0),
    GK.at(GK.blob(0.38, 0.26, 0.38, hat, { seed: seed + 2 }), 0, 1.75, 0),
    GK.at(GK.blob(0.14, 0.14, 0.14, '#ffffff', { seed: seed + 3, lump: 0 }), 0, 2.05, 0),
  ]);
}

Object.assign(LANDMARKS, {
  // {seg, t, d}: the summit marker: a rocky crown with a weather station, a spinning anemometer,
  // a windsock and the course sign.
  summit(lm, x, y, z, head, parts) {
    const face = mountFacing(this, lm, x, z);
    const m = this.flatFrame(x, y, z, face);
    const P = [];
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU;
      P.push(GK.at(GK.blob(3 + U.hash2(k, 1, 4) * 2, 2 + U.hash2(k, 2, 4) * 2, 3, k % 2 ? '#8c8296' : '#a59cb5', { seed: 20 + k, lump: 0.8 }), Math.cos(a) * 5, 0.5, Math.sin(a) * 5));
    }
    P.push(GK.at(GK.blob(5, 1.4, 5, '#ffffff', { seed: 30 }), 0, 2.4, 0));
    // the station: a hut with a dome and a mast
    P.push(GK.at(GK.box(5, 3.2, 4, '#e8483f', { seed: 31, r: 0.4 }), 0, 4.4, 0));
    P.push(GK.at(GK.box(5.6, 0.7, 4.6, '#ffffff', { seed: 32, r: 0.3 }), 0, 6.3, 0));
    P.push(GK.at(GK.blob(1.7, 1.6, 1.7, '#e8eef8', { seed: 33 }), -1.2, 7.2, 0));
    P.push(GK.at(GK.box(0.3, 1.2, 1.4, '#ffd98a', { seed: 34, lump: 0, r: 0.1 }), 2.55, 4.6, 0));
    P.push(GK.at(GK.cyl(0.14, 0.18, 7, '#8c8fae', { segs: 6 }), 1.6, 9.6, 1.2));
    P.push(GK.at(GK.cyl(0.12, 0.12, 4, '#8c8fae', { segs: 6 }), -2.4, 8.4, -1.4));
    this.putAt(GK.merge(P), m, this.clayMat, { name: 'summit' });
    // course sign on two posts, facing the road
    const tex = this.signTexture('mount:summit', 512, 192, '#3f7fd6', '#ffffff', [['MOUNT WOBBLE', 70], ['SUMMIT · 340 M', 40]]);
    const sign = this.signGeo(7, 2.6);
    sign.translate(3.4, 3.4, 4.6);
    this.putAt(sign, m, this.signMat(tex), { cast: false });
    for (const zz of [3.1, 6.1]) this.putAt(GK.at(GK.cyl(0.14, 0.16, 3.4, '#6b4a3a', { segs: 6 }), 3.4, 1.7, zz), m.clone(), this.clayMat);
    this.glow(...new THREE.Vector3(2.7, 4.6, 0).applyMatrix4(m).toArray(), 3, '#ffd98a', 0);
    // the anemometer cups spin and the windsock swings
    const cups = new THREE.Group();
    const arm = GK.box(2.4, 0.1, 0.1, '#8c8fae', { lump: 0, r: 0.03, seg: 1 });
    const cup = GK.blob(0.25, 0.25, 0.25, '#ff6f91', { seed: 3, lump: 0 });
    const g = GK.merge([arm, GK.at(arm.clone(), 0, 0, 0, 0, Math.PI / 2, 0), GK.at(cup.clone(), 1.2, 0, 0), GK.at(cup.clone(), -1.2, 0, 0), GK.at(cup.clone(), 0, 0, 1.2), GK.at(cup, 0, 0, -1.2)]);
    const spin = new THREE.Mesh(g, this.clayMat);
    cups.add(spin);
    cups.position.copy(new THREE.Vector3(1.6, 13.1, 1.2).applyMatrix4(m));
    this.scene.add(cups);
    this.keep(g);
    const sock = new THREE.Mesh(this.keep(GK.merge([GK.at(GK.cone(0.55, 2.6, '#ff8a3d', { seed: 5, segs: 8 }), 0, -1.3, 0, 0, 0, Math.PI / 2), GK.at(GK.cyl(0.42, 0.5, 0.5, '#ffffff', { segs: 8 }), -1.6, 0, 0, 0, 0, Math.PI / 2)])), this.clayMat);
    const pivot = new THREE.Group();
    pivot.position.copy(new THREE.Vector3(-2.4, 10.2, -1.4).applyMatrix4(m));
    pivot.add(sock);
    sock.position.x = 1.5;
    this.scene.add(pivot);
    this.anims.push((t) => {
      spin.rotation.y = t * 7;
      pivot.rotation.y = -face + Math.sin(t * 0.7) * 0.5;
      sock.rotation.z = -0.25 + Math.sin(t * 2.3) * 0.12;
    });
  },

  // {seg, t, seg1, t1, side}: the dam. The road runs along its crest; on the downstream side
  // (the lower ground, or side: 1 right / -1 left) a tall buttressed face drops to the gorge with
  // three spillway waterfalls, and intake towers stand in the reservoir on the other side.
  dam(lm, x, y, z, head, parts) {
    const r = this.rangeOf(lm);
    if (!r) return;
    const p = this.track.main;
    const ids = [];
    for (let s = r.s0; s <= r.s1; s += p.step) ids.push(p.indexAt(s));
    const v = {};
    const mid = ids[ids.length >> 1];
    let side = lm.side;
    if (!side) {
      const probe = (sd) => {
        this.gp(p, mid, sd * (p.hw[mid] + p.sh[mid] + 14), 0, v);
        const g = this.heightAt(v.x, v.z);
        return g === null ? -1e9 : g;
      };
      side = probe(1) < probe(-1) ? 1 : -1;
    }
    const edge = (i) => p.hw[i] + p.sh[i] + 1.6; // just outside the parapet
    // the face: a strip from the crest down to the ground, leaning out (batter)
    const verts = [], cols = [], idx = [], uvs = [];
    const top = new THREE.Color('#d9d2e4'), low = new THREE.Color('#a79fb8');
    const bottoms = [];
    ids.forEach((i, row) => {
      this.gp(p, i, side * edge(i), 0.4, v);
      const tx = v.x, ty = v.y, tz = v.z;
      const gr = this.heightAt(tx + p.nx[i] * side * 10, tz + p.nz[i] * side * 10);
      const by = Math.min(ty - 6, gr === null ? ty - 60 : gr - 2);
      const h = ty - by, out = h * 0.22;
      const bx = tx + p.nx[i] * side * out, bz = tz + p.nz[i] * side * out;
      bottoms.push({ x: bx, y: by, z: bz, h });
      const bands = 6;
      for (let k = 0; k <= bands; k++) {
        const u = k / bands;
        verts.push(tx + (bx - tx) * u, ty + (by - ty) * u, tz + (bz - tz) * u);
        const c = top.clone().lerp(low, u * 0.8);
        const joint = (row % 12 === 0 ? 0.88 : 1) * (k % 2 ? 0.97 : 1);
        cols.push(c.r * joint, c.g * joint, c.b * joint);
        uvs.push(p.s[i] / 6, (u * h) / 6);
      }
      if (row > 0) {
        const r0 = (row - 1) * (bands + 1), r1 = row * (bands + 1);
        for (let k = 0; k < bands; k++) {
          if (side > 0) idx.push(r0 + k, r1 + k, r0 + k + 1, r0 + k + 1, r1 + k, r1 + k + 1);
          else idx.push(r0 + k, r0 + k + 1, r1 + k, r0 + k + 1, r1 + k + 1, r1 + k);
        }
      }
    });
    const face = new THREE.BufferGeometry();
    face.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    face.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    face.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    face.setIndex(idx);
    face.computeVertexNormals();
    const faceMat = this.matCache['mount:damface'] || (this.matCache['mount:damface'] = this.keep(Clay3D.material({ vertexColors: true, wobble: 0, rim: 0.5, side: THREE.DoubleSide })));
    this.put(face, faceMat, { far: true, name: 'dam' });
    // buttresses down the face, and the gate houses with their waterfalls
    const P = [];
    const gates = [0.25, 0.5, 0.75].map((u) => Math.round(u * (ids.length - 1)));
    for (let row = 6; row < ids.length - 4; row += 20) {
      if (gates.some((g) => Math.abs(g - row) < 6)) continue;
      const i = ids[row], b = bottoms[row];
      this.gp(p, i, side * edge(i), 0.4, v);
      const h = b.h, depth = h * 0.3 + 2;
      const m = this.flatFrame((v.x + b.x) / 2, 0, (v.z + b.z) / 2, p.head[i]);
      const g = GK.box(3.2, h, depth, '#c4bccf', { seed: row, lump: 0.25, r: 0.6 });
      g.translate(0, (v.y + b.y) / 2, (side * depth) / 4);
      g.applyMatrix4(m);
      P.push(g);
    }
    for (const row of gates) {
      const i = ids[row], b = bottoms[row];
      this.gp(p, i, side * edge(i), 0.4, v);
      const m = this.flatFrame(v.x, v.y, v.z, p.head[i]);
      // gate house on the crest and the outlet the water pours from
      const house = [GK.at(GK.box(5, 3, 3, '#9a8fb4', { seed: row + 3, r: 0.4 }), 0, 1.5, side * 1.2)];
      house.push(GK.at(GK.box(5.6, 0.6, 3.6, '#e8483f', { seed: row + 4, r: 0.25 }), 0, 3.2, side * 1.2));
      house.push(GK.at(GK.torus(0.8, 0.16, '#ffd166', { seed: row + 5 }), 0, 1.8, side * 2.8, Math.PI / 2, 0, 0));
      const hg = GK.merge(house);
      hg.applyMatrix4(m);
      P.push(hg);
      // the waterfall sheet hugs the face from the outlet to the gorge
      const w = 6, sheetV = [], sheetUV = [], sheetI = [];
      const rows = 10;
      for (let k = 0; k <= rows; k++) {
        const u = k / rows;
        const cx = v.x + (b.x - v.x) * u + p.nx[i] * side * (0.6 + u * u * 2.5), cy = v.y - 0.6 + (b.y - v.y + 0.6) * u, cz = v.z + (b.z - v.z) * u + p.nz[i] * side * (0.6 + u * u * 2.5);
        for (const e of [-1, 1]) {
          sheetV.push(cx + p.tx[i] * e * (w / 2) * (1 + u * 0.3), cy, cz + p.tz[i] * e * (w / 2) * (1 + u * 0.3));
          sheetUV.push(e < 0 ? 0 : w / 10, (u * b.h) / 10);
        }
        if (k > 0) sheetI.push((k - 1) * 2, (k - 1) * 2 + 1, k * 2, (k - 1) * 2 + 1, k * 2 + 1, k * 2);
      }
      const sheet = new THREE.BufferGeometry();
      sheet.setAttribute('position', new THREE.Float32BufferAttribute(sheetV, 3));
      sheet.setAttribute('uv', new THREE.Float32BufferAttribute(sheetUV, 2));
      sheet.setIndex(sheetI);
      sheet.computeVertexNormals();
      this.scene.add(new THREE.Mesh(sheet, this.waterMaterial({ flow: 1.8, fall: true, across: w / 10, color: '#bfeeff', deep: '#5ab4e4', opacity: 0.9, wave: 0, side: THREE.DoubleSide })));
      this.keep(sheet);
      for (const e of [-1, 0, 1]) this.glow(b.x + p.tx[i] * e * 3, b.y + 1.5, b.z + p.tz[i] * e * 3, 6, '#ffffff', 3);
      P.push(GK.at(GK.blob(5, 1.2, 5, '#e8f6ff', { seed: row + 9, lump: 0.6 }), b.x, b.y + 0.3, b.z));
    }
    // intake towers standing in the reservoir
    for (const u of [0.3, 0.72]) {
      const i = ids[Math.round(u * (ids.length - 1))];
      this.gp(p, i, -side * (edge(i) + 10), 0, v);
      const gr = this.heightAt(v.x, v.z);
      const base = gr === null ? p.y[i] - 12 : Math.min(gr, p.y[i] - 3);
      const h = p.y[i] + 7 - base;
      P.push(GK.at(GK.cyl(2.6, 3, h, '#c4bccf', { seed: i, segs: 14 }), v.x, base + h / 2, v.z));
      P.push(GK.at(GK.blob(3.2, 1.8, 3.2, '#e8483f', { seed: i + 1 }), v.x, base + h + 0.4, v.z));
      P.push(GK.at(GK.box(1, 1.4, 0.4, '#ffd98a', { seed: i + 2, lump: 0, r: 0.1 }), v.x, base + h - 2.2, v.z + 2.6));
      this.glow(v.x, base + h - 2.2, v.z + 2.9, 2.6, '#ffd98a', 0);
    }
    for (const g of P) this.put(g, this.clayMat, { far: true, name: 'dam' });
  },

  // {seg, t, d}: a ski lodge: a log chalet with a snowy roof, glowing windows, a deck, a ski
  // rack and chimney smoke.
  lodge(lm, x, y, z, head, parts) {
    const face = mountFacing(this, lm, x, z);
    const m = this.flatFrame(x, y, z, face);
    const P = [];
    const log = '#9a6a45', dark = '#7a4f33';
    for (let k = 0; k < 6; k++) {
      P.push(GK.at(GK.cyl(0.55, 0.55, 14, k % 2 ? log : dark, { segs: 8, seed: k, lump: 0.08 }), 0, 0.6 + k * 1.05, -5, Math.PI / 2, 0, 0));
      P.push(GK.at(GK.cyl(0.55, 0.55, 14, k % 2 ? dark : log, { segs: 8, seed: k + 9, lump: 0.08 }), 0, 0.6 + k * 1.05, 5, Math.PI / 2, 0, 0));
    }
    P.push(GK.at(GK.box(11, 6.4, 9.6, '#b27a50', { seed: 3, r: 0.4 }), 0, 3.2, 0));
    // the A-frame roof under thick snow
    for (const s of [-1, 1]) {
      P.push(GK.at(GK.box(12.5, 0.8, 7.4, '#6b3d24', { seed: 4 + s, r: 0.3 }), 0, 8.4, s * 3.1, (s * Math.PI) / 5.2, 0, 0));
      P.push(GK.at(GK.box(12.8, 0.9, 7.2, '#ffffff', { seed: 6 + s, r: 0.45, lump: 0.25 }), 0, 9.0, s * 3.4, (s * Math.PI) / 5.2, 0, 0));
    }
    P.push(GK.at(GK.box(1.6, 4, 1.6, '#8c8296', { seed: 8, r: 0.3 }), -3.5, 11, -2.6));
    // windows and the door on the road side (+x)
    for (const zz of [-3, 3]) P.push(GK.at(GK.box(0.3, 1.8, 2, '#ffd98a', { seed: 9, lump: 0, r: 0.1 }), 5.6, 3.6, zz));
    P.push(GK.at(GK.box(0.3, 3, 1.8, '#5a3524', { seed: 10, lump: 0, r: 0.1 }), 5.6, 1.6, 0));
    P.push(GK.at(GK.box(3.4, 0.4, 13, '#8a5a3c', { seed: 11, r: 0.12 }), 7.2, 0.4, 0));
    for (let k = -5; k <= 5; k += 2) P.push(GK.at(GK.box(0.12, 2.2, 0.35, ['#e8483f', '#58b4ff', '#ffd166', '#7ddc6f'][(k + 5) % 4], { seed: 12 + k, lump: 0, r: 0.05 }), 8.6, 1.4, k * 0.9, 0, 0, -0.18));
    this.putAt(GK.merge(P), m, this.clayMat, { name: 'lodge' });
    const tex = this.signTexture('mount:lodge', 512, 160, '#6b3d24', '#ffe9a8', [['WOBBLE LODGE', 72]]);
    const sign = this.signGeo(7.5, 2.3);
    sign.translate(6.4, 7.6, 0);
    this.putAt(sign, m, this.signMat(tex), { cast: false });
    for (const zz of [-3, 3]) this.glow(...new THREE.Vector3(6, 3.6, zz).applyMatrix4(m).toArray(), 3.2, '#ffd98a', 0);
    mountSmoke(this, ...new THREE.Vector3(-3.5, 13.4, -2.6).applyMatrix4(m).toArray(), 1.1);
  },

  // {seg, t, seg1, t1, d}: a chairlift up the slope d units beside the road: pylons, cables,
  // stations at both ends with spinning bullwheels, and chairs (some with riders) going round.
  skilift(lm, x, y, z, head, parts) {
    const r = this.rangeOf(lm);
    if (!r) return;
    const p = this.track.main, d = lm.d || 30;
    // pylons every ~46 units, standing on the snow
    const tops = [];
    const n = Math.max(2, Math.round((r.s1 - r.s0) / 46));
    for (let k = 0; k <= n; k++) {
      const s = r.s0 + ((r.s1 - r.s0) * k) / n;
      const q = p.point(s, d);
      const g = this.groundAt(q.x, q.z, q.y);
      tops.push({ x: q.x, y: g + 10, z: q.z, g });
    }
    const P = [];
    tops.forEach((t, k) => {
      const nb = tops[Math.min(tops.length - 1, k + 1)], pb = tops[Math.max(0, k - 1)];
      const dir = Math.atan2(nb.z - pb.z, nb.x - pb.x);
      const m = this.flatFrame(t.x, t.g, t.z, dir);
      const end = k === 0 || k === tops.length - 1;
      const parts2 = [GK.at(GK.cyl(0.45, 0.65, 10, '#58b4ff', { segs: 8, seed: k }), 0, 5, 0)];
      parts2.push(GK.at(GK.box(0.6, 0.6, 5.4, '#3b6fb8', { seed: k + 1, r: 0.2 }), 0, 10, 0));
      for (const zz of [-2.4, 2.4]) parts2.push(GK.at(GK.torus(0.45, 0.14, '#3b2a4a', { seed: k + 2 }), 0, 10.4, zz));
      if (end) {
        // a station: a hut and a big bullwheel
        parts2.push(GK.at(GK.box(6, 4, 7, '#e8483f', { seed: k + 5, r: 0.4 }), k === 0 ? -3 : 3, 2, 0));
        parts2.push(GK.at(GK.box(6.6, 0.8, 7.6, '#ffffff', { seed: k + 6, r: 0.3, lump: 0.2 }), k === 0 ? -3 : 3, 4.4, 0));
      }
      this.putAt(GK.merge(parts2), m, this.clayMat, { name: 'skilift' });
      if (end) {
        const wheel = new THREE.Mesh(this.keep(GK.torus(2.4, 0.22, '#3b2a4a', { seed: k + 7 })), this.clayMat);
        wheel.rotation.x = Math.PI / 2;
        const holder = new THREE.Group();
        holder.position.set(t.x, t.y + 0.2, t.z);
        holder.add(wheel);
        this.scene.add(holder);
        this.anims.push((tm) => (wheel.rotation.z = tm * (k === 0 ? 0.9 : -0.9)));
      }
    });
    // the two cables (up on one side, down on the other) through the sheaves
    const lines = [-2.4, 2.4].map((off) =>
      tops.map((t, k) => {
        const nb = tops[Math.min(tops.length - 1, k + 1)], pb = tops[Math.max(0, k - 1)];
        const a = Math.atan2(nb.z - pb.z, nb.x - pb.x);
        return new THREE.Vector3(t.x - Math.sin(a) * off, t.y + 0.3, t.z + Math.cos(a) * off);
      }),
    );
    for (const L of lines) {
      for (let k = 0; k + 1 < L.length; k++) {
        const a = L[k], b = L[k + 1], len = a.distanceTo(b);
        const c = GK.cyl(0.06, 0.06, len, '#3b2a4a', { segs: 4, lump: 0 });
        c.rotateZ(Math.PI / 2);
        c.rotateZ(Math.asin((b.y - a.y) / len));
        c.rotateY(-Math.atan2(b.z - a.z, b.x - a.x));
        c.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        P.push(c);
      }
    }
    for (const g of P) this.put(g, this.stillMat, { cast: false, name: 'skilift' });
    // chairs travel up one cable and back down the other
    const loop = lines[0].concat(lines[1].slice().reverse());
    const cum = [0];
    for (let k = 1; k < loop.length; k++) cum.push(cum[k - 1] + loop[k].distanceTo(loop[k - 1]));
    const total = cum[cum.length - 1] + loop[0].distanceTo(loop[loop.length - 1]);
    const chairGeo = worldGeo('mount:chair', () =>
      GK.merge([
        GK.at(GK.cyl(0.06, 0.06, 3, '#3b2a4a', { segs: 4, lump: 0 }), 0, -1.5, 0),
        GK.at(GK.box(1.2, 0.25, 2.4, '#ffd166', { seed: 2, r: 0.1 }), 0, -3, 0),
        GK.at(GK.box(0.25, 1.2, 2.4, '#ffd166', { seed: 3, r: 0.1 }), -0.55, -2.4, 0),
      ]),
    );
    const riderGeo = [worldGeo('mount:rider1', () => mountFigure('#ff6f91', '#58b4ff', 11)), worldGeo('mount:rider2', () => mountFigure('#7ddc6f', '#ff8a3d', 21))];
    const chairs = [];
    const count = Math.max(6, Math.round(total / 18));
    for (let k = 0; k < count; k++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(chairGeo, this.clayMat));
      if (k % 3 !== 2) {
        const rider = new THREE.Mesh(riderGeo[k % 2], this.clayMat);
        rider.position.set(0.1, -2.9, k % 2 ? 0.55 : -0.55);
        rider.scale.setScalar(0.8);
        g.add(rider);
      }
      g.traverse((o) => (o.castShadow = true));
      this.scene.add(g);
      chairs.push(g);
    }
    const at = (u, out) => {
      u = ((u % total) + total) % total;
      let k = 1;
      while (k < cum.length && cum[k] < u) k++;
      const a = loop[k - 1], b = k < loop.length ? loop[k] : loop[0];
      const segLen = (k < cum.length ? cum[k] : total) - cum[k - 1] || 1;
      out.copy(a).lerp(b, (u - cum[k - 1]) / segLen);
      return Math.atan2(b.z - a.z, b.x - a.x);
    };
    const tmp = new THREE.Vector3();
    this.anims.push((t) => {
      chairs.forEach((c, k) => {
        const dir = at(t * 3.2 + (k / count) * total, tmp);
        c.position.copy(tmp);
        c.rotation.set(Math.sin(t * 1.6 + k) * 0.06, -dir, 0);
      });
    });
  },

  // {seg, t, d}: the log cabin at the finish: log walls, a snowy roof with icicles, a stone
  // chimney with smoke, glowing windows, a porch with lanterns, fairy lights and firewood.
  cabin(lm, x, y, z, head, parts) {
    const face = mountFacing(this, lm, x, z);
    const m = this.flatFrame(x, y, z, face);
    const P = [];
    const logs = ['#9a6a45', '#86583a'];
    for (let k = 0; k < 7; k++) {
      for (const zz of [-5, 5]) P.push(GK.at(GK.cyl(0.6, 0.6, 13, logs[(k + (zz > 0 ? 1 : 0)) % 2], { segs: 8, seed: k * 3 + (zz > 0 ? 1 : 0), lump: 0.1 }), 0, 0.6 + k * 1.1, zz, Math.PI / 2, 0, 0));
      for (const xx of [-6, 6]) P.push(GK.at(GK.cyl(0.6, 0.6, 11, logs[(k + 1) % 2], { segs: 8, seed: k * 5 + 40, lump: 0.1 }), xx, 0.6 + k * 1.1, 0, Math.PI / 2, Math.PI / 2, 0));
    }
    P.push(GK.at(GK.box(11.4, 7.4, 9.4, '#7a4f33', { seed: 50, r: 0.3 }), 0, 3.7, 0));
    for (const s of [-1, 1]) {
      P.push(GK.at(GK.box(14.5, 0.8, 8, '#5a3524', { seed: 51 + s, r: 0.3 }), 0, 9.6, s * 3.4, (s * Math.PI) / 5.5, 0, 0));
      P.push(GK.at(GK.box(14.8, 1.1, 7.8, '#ffffff', { seed: 53 + s, r: 0.5, lump: 0.3 }), 0, 10.3, s * 3.7, (s * Math.PI) / 5.5, 0, 0));
    }
    for (let k = -6; k <= 6; k += 1.5) P.push(GK.at(GK.cone(0.22, 0.9 + U.hash2(k * 2, 1, 7) * 0.8, '#e8f6ff', { seed: 60 + k * 2, segs: 5 }), 7, 6.9, k, Math.PI));
    P.push(GK.at(GK.box(2, 7, 2, '#8c8296', { seed: 61, r: 0.4, lump: 0.3 }), -4, 9.5, 2.6));
    // the road side (+x): door, windows, porch, lanterns, firewood
    P.push(GK.at(GK.box(0.3, 3.4, 2, '#4a2a1a', { seed: 62, lump: 0, r: 0.1 }), 6.7, 1.8, 0));
    for (const zz of [-3.3, 3.3]) {
      P.push(GK.at(GK.box(0.3, 2, 2.2, '#ffd98a', { seed: 63, lump: 0, r: 0.1 }), 6.7, 4, zz));
      P.push(GK.at(GK.box(0.4, 0.3, 2.6, '#ffffff', { seed: 64, lump: 0.1, r: 0.1 }), 6.8, 3, zz));
    }
    P.push(GK.at(GK.box(4, 0.5, 13, '#8a5a3c', { seed: 65, r: 0.15 }), 8.6, 0.25, 0));
    for (const zz of [-6, 6]) P.push(GK.at(GK.cyl(0.25, 0.3, 4.6, '#6b4a3a', { segs: 6, seed: 66 }), 10.2, 2.3, zz));
    P.push(GK.at(GK.box(2.6, 0.4, 13.4, '#5a3524', { seed: 67, r: 0.15 }), 9.4, 4.7, 0, 0, 0, -0.2));
    for (let k = 0; k < 9; k++) P.push(GK.at(GK.cyl(0.32, 0.32, 1.6, k % 2 ? '#b27a50' : '#c99a6a', { segs: 7, seed: 70 + k, lump: 0.05 }), -8 + (k % 3) * 0.7, 0.35 + Math.floor(k / 3) * 0.62, -2 + (k % 3) * 0.2, Math.PI / 2, 0, 0));
    this.putAt(GK.merge(P), m, this.clayMat, { name: 'cabin' });
    const tex = this.signTexture('mount:cabin', 512, 160, '#5a3524', '#ffe9a8', [['WOBBLE CABIN', 70]]);
    const sign = this.signGeo(8, 2.5);
    sign.translate(7.2, 7.1, 0);
    this.putAt(sign, m, this.signMat(tex), { cast: false });
    const v = new THREE.Vector3();
    for (const zz of [-3.3, 3.3]) this.glow(...v.set(7.2, 4, zz).applyMatrix4(m).toArray(), 3.4, '#ffd98a', 0);
    for (const zz of [-6, 6]) this.glow(...v.set(10.2, 4.8, zz).applyMatrix4(m).toArray(), 2.4, '#ffcf7a', 2);
    const fairy = ['#ff6f91', '#ffd166', '#7ddc6f', '#58b4ff'];
    for (let k = 0; k <= 12; k++) this.glow(...v.set(7.4, 6.4 + Math.sin((k / 12) * Math.PI * 3) * 0.3, -6.5 + k * (13 / 12)).applyMatrix4(m).toArray(), 0.9, fairy[k % 4], 1);
    mountSmoke(this, ...v.set(-4, 13.4, 2.6).applyMatrix4(m).toArray(), 1.2);
  },
});
