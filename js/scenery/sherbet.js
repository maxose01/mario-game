'use strict';
// 3D landmark builders used only by Sherbet Slopes (browser only; see LANDMARKS in world3d.js).
// Each builder is called with this = World3D as (spec, x, groundY, z, roadHeading, parts).

Object.assign(LANDMARKS, {
  // {seg, t, d}: a hill of giant sherbet scoops in wafer cones, sprinkles and all.
  scoops(lm, x, y, z, head, parts) {
    const rnd = U.rng(Math.round(x * 7 + z * 3));
    const flavours = ['#ffb3c7', '#b8f0c8', '#fff1a8', '#d9c2ff', '#ffc9a8'];
    const sprinkles = ['#ff6f91', '#58b4ff', '#ffd166', '#7ddc6f', '#ffffff'];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + rnd() * 0.8, r = k ? 9 + rnd() * 7 : 0;
      const cx = x + Math.cos(a) * r, cz = z + Math.sin(a) * r;
      const g = this.groundAt(cx, cz, y);
      const s = (k ? 0.65 : 1) * (0.9 + rnd() * 0.3);
      const P = [];
      // the wafer cone with its criss-cross pattern
      const cone = GK.cone(4.2 * s, 11 * s, '#e0a45e', { seed: k, segs: 14, lump: 0.05 });
      cone.rotateX(Math.PI);
      const col = cone.attributes.color, pos = cone.attributes.position;
      for (let v = 0; v < pos.count; v++) {
        const ang = Math.atan2(pos.getZ(v), pos.getX(v)), hh = pos.getY(v);
        if ((Math.floor(ang * 3 + hh * 0.9) + Math.floor(ang * 3 - hh * 0.9)) % 2) col.setXYZ(v, col.getX(v) * 0.82, col.getY(v) * 0.82, col.getZ(v) * 0.82);
      }
      P.push(GK.at(cone, 0, 5.5 * s, 0));
      const flav = flavours[Math.floor(rnd() * flavours.length)];
      P.push(GK.at(GK.blob(5 * s, 4.2 * s, 5 * s, flav, { seed: k + 10, lump: 0.6 }), 0, 12 * s, 0));
      // a drip and a ring of melt at the rim
      for (let q = 0; q < 6; q++) {
        const qa = (q / 6) * TAU + rnd();
        P.push(GK.at(GK.blob(1.3 * s, 0.9 * s, 1.3 * s, flav, { seed: k * 9 + q }), Math.cos(qa) * 4 * s, 10 * s, Math.sin(qa) * 4 * s));
      }
      P.push(GK.at(GK.blob(0.6 * s, 2 * s, 0.6 * s, flav, { seed: k + 20 }), 3.9 * s, 8.2 * s, 0.5 * s));
      for (let q = 0; q < 14; q++) {
        const qa = rnd() * TAU, qe = rnd() * 1.2;
        P.push(GK.at(GK.box(0.18, 0.6, 0.18, sprinkles[q % 5], { lump: 0, r: 0.08, seg: 1 }), Math.cos(qa) * Math.cos(qe) * 5 * s, 12 * s + Math.sin(qe) * 4.2 * s, Math.sin(qa) * Math.cos(qe) * 5 * s, rnd() * 3, 0, rnd() * 3));
      }
      if (!k) P.push(GK.at(GK.blob(1.4, 1.4, 1.4, '#e8483f', { seed: 30 }), 0, 16.6, 0));
      // planted in the snow: the bottom third of the cone is buried
      this.put(GK.at(GK.merge(P), cx, g - 3.6 * s, cz, 0, rnd() * TAU, 0), this.clayMat, { name: 'scoops', far: !k });
    }
  },

  // {seg, t, d}: a frozen rink with clay skaters gliding round in circles.
  rink(lm, x, y, z, head, parts) {
    const R = 13;
    const ice = new THREE.CircleGeometry(R, 32);
    ice.rotateX(-Math.PI / 2);
    GK.paint(ice, '#dff4ff', 0.03, 3);
    ice.translate(x, y + 0.25, z);
    this.put(ice, this.matCache['sherbet:ice'] || (this.matCache['sherbet:ice'] = this.keep(Clay3D.material({ vertexColors: true, rough: 0.2, wobble: 0, rim: 0.3, bump: false }))), { cast: false, name: 'rink' });
    const P = [];
    for (let k = 0; k < 22; k++) {
      const a = (k / 22) * TAU;
      P.push(GK.at(GK.blob(1.4, 0.8, 1.2, '#ffffff', { seed: k }), x + Math.cos(a) * (R + 0.6), y + 0.3, z + Math.sin(a) * (R + 0.6)));
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + 0.2;
      P.push(GK.at(GK.cyl(0.15, 0.18, 3.2, '#8c8fae', { segs: 6 }), x + Math.cos(a) * (R + 1.8), y + 1.6, z + Math.sin(a) * (R + 1.8)));
      this.glow(x + Math.cos(a) * (R + 1.8), y + 3.4, z + Math.sin(a) * (R + 1.8), 1.8, ['#ff8fb1', '#9fd8ff', '#fff1a8'][k % 3], 1);
    }
    for (const g of P) this.put(g, this.clayMat, { name: 'rink' });
    const outfits = [['#ff6f91', '#ffffff'], ['#58b4ff', '#ffd166'], ['#7ddc6f', '#ff8a3d'], ['#c77dff', '#ffffff']];
    const skaters = outfits.map(([body, hat], k) => {
      const g = this.keep(GK.merge([
        GK.at(GK.blob(0.55, 0.75, 0.45, body, { seed: 40 + k }), 0, 1.25, 0),
        GK.at(GK.blob(0.38, 0.38, 0.38, '#ffd9b8', { seed: 50 + k }), 0.08, 2.2, 0),
        GK.at(GK.blob(0.4, 0.3, 0.4, hat, { seed: 60 + k }), 0.08, 2.48, 0),
        GK.at(GK.blob(0.9, 0.12, 0.25, body, { seed: 70 + k }), 0, 1.5, 0),
        GK.at(GK.cyl(0.12, 0.12, 0.5, '#3b2a4a', { segs: 5, lump: 0 }), 0, 0.3, 0.2),
        GK.at(GK.cyl(0.12, 0.12, 0.5, '#3b2a4a', { segs: 5, lump: 0 }), 0, 0.3, -0.2),
        GK.at(GK.box(0.8, 0.08, 0.12, '#c9d4e8', { lump: 0, r: 0.03, seg: 1 }), 0, 0.04, 0.2),
        GK.at(GK.box(0.8, 0.08, 0.12, '#c9d4e8', { lump: 0, r: 0.03, seg: 1 }), 0, 0.04, -0.2),
      ]));
      const m = new THREE.Mesh(g, this.clayMat);
      m.castShadow = true;
      this.scene.add(m);
      return m;
    });
    this.anims.push((t) => {
      skaters.forEach((m, k) => {
        const rr = 4 + k * 2.2, w = (k % 2 ? -0.5 : 0.42) * (1 + k * 0.1);
        const a = t * w + k * 1.7;
        m.position.set(x + Math.cos(a) * rr, y + 0.3, z + Math.sin(a) * rr);
        m.rotation.set(0, -(a + (w > 0 ? Math.PI / 2 : -Math.PI / 2)), Math.sin(t * 3 + k) * 0.12 - Math.sign(w) * 0.2);
      });
    });
  },
});
