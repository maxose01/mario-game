'use strict';
// 3D landmark builders used only by Magma Keep (browser only; see LANDMARKS in world3d.js).
// Each builder is called with this = World3D as (spec, x, groundY, z, roadHeading, parts).

Object.assign(LANDMARKS, {
  // {seg, t, d}: the great spire the Tower Twist winds around: a tall stone tower with
  // battlements, glowing windows, King Mudlet's banners, a red cone roof with a gold crown and a
  // ring of lava around its foot.
  spire(lm, x, y, z, head, parts) {
    const stone = '#8a7fa6', dark = '#6b5f86';
    const H = 34, R = 9;
    const P = [];
    P.push(GK.at(GK.cyl(R, R + 1.4, H, stone, { seed: 1, segs: 18, hsegs: 6, lump: 0.5 }), x, y + H / 2, z));
    for (let k = 1; k < 6; k++) P.push(GK.at(GK.torus(R + 0.3 + (1 - k / 6) * 1.2, 0.35, dark, { seed: 2 + k, ts: 26 }), x, y + (k / 6) * H, z, Math.PI / 2, 0, 0));
    // battlements
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * TAU;
      P.push(GK.at(GK.box(2.2, 2.2, 1.6, stone, { seed: 10 + k, r: 0.3 }), x + Math.cos(a) * (R + 0.6), y + H + 1, z + Math.sin(a) * (R + 0.6), 0, -a, 0));
    }
    // the roof and the crown
    P.push(GK.at(GK.cone(R + 1.5, 16, '#e2483d', { seed: 30, segs: 18 }), x, y + H + 10, z));
    P.push(GK.at(GK.cyl(2.4, 2.8, 2, '#ffcc3d', { seed: 31, segs: 12 }), x, y + H + 18.6, z));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU;
      P.push(GK.at(GK.cone(0.8, 2.2, '#ffcc3d', { seed: 32 + k, segs: 6 }), x + Math.cos(a) * 2, y + H + 20.6, z + Math.sin(a) * 2));
    }
    // windows (glowing) and banners all the way round
    const v = new THREE.Vector3();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + 0.3;
      for (const hh of [10, 22]) {
        P.push(GK.at(GK.box(0.6, 2.6, 1.6, '#ffb347', { seed: 40 + k, lump: 0, r: 0.2 }), x + Math.cos(a) * (R + 0.9), y + hh, z + Math.sin(a) * (R + 0.9), 0, -a, 0));
        this.glow(x + Math.cos(a) * (R + 1.4), y + hh, z + Math.sin(a) * (R + 1.4), 3, '#ffb347', 2);
      }
      const b = a + Math.PI / 6;
      P.push(GK.at(GK.box(0.3, 9, 3.4, '#7a3fb0', { seed: 50 + k, r: 0.15, lump: 0.15 }), x + Math.cos(b) * (R + 0.8), y + H - 6, z + Math.sin(b) * (R + 0.8), 0, -b, 0));
      P.push(GK.at(GK.blob(1, 1, 0.4, '#ffcc3d', { seed: 60 + k }), x + Math.cos(b) * (R + 1.1), y + H - 5, z + Math.sin(b) * (R + 1.1), 0, -b, 0));
    }
    for (const g of P) this.put(g, this.clayMat, { far: true, name: 'spire' });
    // a ring of lava at its foot
    const moat = new THREE.RingGeometry(R + 1.6, R + 5.5, 40, 1);
    moat.rotateX(-Math.PI / 2);
    moat.translate(x, y + 0.2, z);
    this.scene.add(new THREE.Mesh(moat, this.lavaMaterial()));
    this.keep(moat);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      this.glow(x + Math.cos(a) * (R + 3.5), y + 1, z + Math.sin(a) * (R + 3.5), 5, '#ff8a3d', 3);
    }
    v.set(x, y + H + 19, z);
    this.glow(v.x, v.y, v.z, 7, '#ffe066', 1);
  },

  // {seg, t, d}: lava pouring off a craggy cliff into the lava sea, facing the road.
  lavafall(lm, x, y, z, head, parts) {
    const w = lm.w || 12, h = lm.h || 26;
    const at = this.track.where(lm), road = at.path.point(at.s, 0);
    const face = Math.atan2(road.z - z, road.x - x);
    const m = this.flatFrame(x, y, z, face);
    const sheet = new THREE.PlaneGeometry(w, h, 6, 8);
    sheet.rotateY(-Math.PI / 2);
    const pos = sheet.attributes.position, uv = sheet.attributes.uv;
    for (let v = 0; v < pos.count; v++) {
      const t = 0.5 - pos.getY(v) / h;
      pos.setX(v, 0.3 + t * t * 2.6 + Math.sin(pos.getZ(v) * 0.6) * 0.3);
      uv.setY(v, t * (h / 10));
    }
    sheet.translate(0, h / 2, 0);
    sheet.applyMatrix4(m);
    this.scene.add(new THREE.Mesh(sheet, this.waterMaterial({ flow: 0.9, fall: true, across: w / 10, color: '#ffb347', deep: '#ff5a1f', foam: '#ffe066', opacity: 1, wave: 0, side: THREE.DoubleSide })));
    this.keep(sheet);
    const P = [];
    const rows = Math.max(2, Math.round(h / 7));
    for (let r = 0; r < rows; r++) {
      const yy = ((r + 0.5) / rows) * h;
      for (let c = -2; c <= 2; c++) {
        const side = Math.abs(c) === 2;
        P.push(GK.at(GK.blob(3.4, h / rows / 1.5 + 1.4, side ? 3.4 : w * 0.22 + 1, '#3d2f48', { seed: r * 5 + c + 20, lump: 1 }), side ? 1.4 : -5.4, yy, c * (w * 0.22 + 1.8)));
      }
    }
    P.push(GK.at(GK.blob(5, 2.4, w * 0.8, '#5b4a6e', { seed: 4, lump: 1 }), -4.5, h + 0.8, 0));
    this.putAt(GK.merge(P), m, this.clayMat, { far: true, name: 'lavafall' });
    const v = new THREE.Vector3();
    for (let k = -1; k <= 1; k++) {
      v.set(1.5, 2, k * w * 0.3).applyMatrix4(m);
      this.glow(v.x, v.y, v.z, 7, '#ff8a3d', 3);
      v.set(0.6, h * 0.5, k * w * 0.3).applyMatrix4(m);
      this.glow(v.x, v.y, v.z, 5, '#ffb347', 1);
    }
  },

  // {seg, t, d}: a giant clay statue of King Mudlet on a plinth, breathing fire now and then.
  statue(lm, x, y, z, head, parts) {
    const at = this.track.where(lm), road = at.path.point(at.s, 0);
    const face = Math.atan2(road.z - z, road.x - x);
    const m = this.flatFrame(x, y, z, face);
    const P = [];
    P.push(GK.at(GK.box(12, 4, 12, '#6b5f86', { seed: 1, r: 0.6 }), 0, 2, 0));
    P.push(GK.at(GK.box(13, 1, 13, '#8a7fa6', { seed: 2, r: 0.4 }), 0, 4.4, 0));
    // the round body, a brown clay blob with arms, feet and a cape
    P.push(GK.at(GK.blob(5, 5.4, 4.6, '#8a5a3c', { seed: 3 }), 0, 10.4, 0));
    P.push(GK.at(GK.blob(4.8, 5.4, 1.2, '#7a3fb0', { seed: 4 }), -3.4, 10.4, 0));
    for (const s of [-1, 1]) {
      P.push(GK.at(GK.blob(1.6, 1.2, 1.8, '#6b4a3a', { seed: 5 + s }), 0.6, 5.6, s * 2.6));
      P.push(GK.at(GK.blob(1.2, 2.6, 1.2, '#8a5a3c', { seed: 7 + s }), 1, 10, s * 5.2, s * 0.4, 0, 0));
    }
    // face: eyes, angry brows, a big open mouth on the road side (+x)
    for (const s of [-1, 1]) {
      P.push(GK.at(GK.blob(0.5, 1.1, 0.8, '#ffffff', { seed: 10 + s, lump: 0 }), 4.4, 12.6, s * 1.6));
      P.push(GK.at(GK.blob(0.3, 0.6, 0.45, '#2b1838', { seed: 12 + s, lump: 0 }), 4.85, 12.4, s * 1.5));
      P.push(GK.at(GK.box(0.6, 0.5, 2.2, '#2b1838', { seed: 14 + s, r: 0.15, lump: 0 }), 4.6, 14, s * 1.6, s * 0.35, 0, 0));
    }
    P.push(GK.at(GK.blob(0.6, 1.2, 2.2, '#3b1a2a', { seed: 16, lump: 0 }), 4.7, 9.8, 0));
    // the crown
    P.push(GK.at(GK.cyl(2.6, 3, 1.8, '#ffcc3d', { seed: 17, segs: 12 }), 0, 16.2, 0));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU;
      P.push(GK.at(GK.cone(0.8, 2, '#ffcc3d', { seed: 18 + k, segs: 6 }), Math.cos(a) * 2.2, 18, Math.sin(a) * 2.2));
    }
    this.putAt(GK.merge(P), m, this.clayMat, { far: true, name: 'statue' });
    // fire breath: clay puffs fly out of the mouth every few seconds, with a glow
    const mouth = new THREE.Vector3(5.4, 9.8, 0).applyMatrix4(m);
    const dir = new THREE.Vector3(Math.cos(face), -0.25, Math.sin(face)).normalize();
    const geo = worldGeo('magma:flame', () => GK.blob(1, 0.9, 1, '#ff8a3d', { seed: 3, lump: 0.3 }));
    const hot = worldGeo('magma:flamehot', () => GK.blob(0.7, 0.6, 0.7, '#ffe066', { seed: 4, lump: 0.2 }));
    const flames = [];
    for (let k = 0; k < 8; k++) {
      const f = new THREE.Mesh(k % 2 ? hot : geo, this.clayMat);
      f.visible = false;
      this.scene.add(f);
      flames.push(f);
    }
    this.anims.push((t) => {
      const cyc = t % 6;
      flames.forEach((f, k) => {
        const u = (cyc - k * 0.08) / 1.4;
        f.visible = u > 0 && u < 1;
        if (!f.visible) return;
        const d = u * 16;
        f.position.set(mouth.x + dir.x * d, mouth.y + dir.y * d + Math.sin(u * 9 + k) * 0.6, mouth.z + dir.z * d);
        f.scale.setScalar((0.6 + u * 2.4) * (1 - u * 0.5));
      });
    });
    this.glow(mouth.x + dir.x * 4, mouth.y, mouth.z + dir.z * 4, 6, '#ff8a3d', 2);
  },
});
