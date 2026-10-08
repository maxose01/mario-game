'use strict';
// 3D landmark builders used only by Puffball Circuit (browser only; see LANDMARKS in world3d.js).
// Each builder is called with this = World3D as (spec, x, groundY, z, roadHeading, parts).

Object.assign(LANDMARKS, {
  // {seg, t, d}: Moo Meadow's red barn with a gambrel roof, big doors, a silo and a weathervane
  // that swings in the breeze, behind a little fence.
  barn(lm, x, y, z, head, parts) {
    const at = this.track.where(lm), road = at.path.point(at.s, 0);
    const face = Math.atan2(road.z - z, road.x - x);
    const m = this.flatFrame(x, y, z, face);
    const P = [];
    const red = '#d9483f', white = '#fff6ea';
    P.push(GK.at(GK.box(12, 8, 14, red, { seed: 1, r: 0.5 }), 0, 4, 0));
    // gambrel roof: two steep lower slabs and two flatter upper ones
    for (const s of [-1, 1]) {
      P.push(GK.at(GK.box(13, 0.7, 5, '#7a3b34', { seed: 2 + s, r: 0.25 }), 0, 9.6, s * 5.2, (s * Math.PI) / 3.2, 0, 0));
      P.push(GK.at(GK.box(13, 0.7, 5, '#8a4a40', { seed: 4 + s, r: 0.25 }), 0, 12.2, s * 2, (s * Math.PI) / 9, 0, 0));
    }
    // doors with white cross bracing on the road side (+x), a hay loft window above
    P.push(GK.at(GK.box(0.4, 5.5, 6, '#b8362f', { seed: 8, r: 0.15 }), 6.1, 2.8, 0));
    for (const zz of [-1.5, 1.5]) {
      P.push(GK.at(GK.box(0.3, 6.2, 0.4, white, { seed: 9, lump: 0, r: 0.1 }), 6.35, 2.8, zz, (zz > 0 ? 1 : -1) * 0.75, 0, 0));
      P.push(GK.at(GK.box(0.3, 0.4, 3, white, { seed: 10, lump: 0, r: 0.1 }), 6.35, zz > 0 ? 5.4 : 0.3, zz));
    }
    P.push(GK.at(GK.box(0.3, 2, 2.4, '#3b2a4a', { seed: 11, lump: 0, r: 0.1 }), 6.15, 8.6, 0));
    P.push(GK.at(GK.box(0.4, 2.4, 2.8, '#ffe066', { seed: 12, lump: 0, r: 0.1 }), 6.2, 8.6, 0));
    // the silo beside it
    P.push(GK.at(GK.cyl(3, 3.2, 15, '#c9c2d6', { seed: 13, segs: 16 }), -2, 7.5, -10.5));
    P.push(GK.at(GK.blob(3.2, 2.4, 3.2, '#d9483f', { seed: 14 }), -2, 15, -10.5));
    for (let k = 1; k < 5; k++) P.push(GK.at(GK.torus(3.15, 0.12, '#9a8fb4', { seed: 15 + k }), -2, k * 3, -10.5, Math.PI / 2, 0, 0));
    // a fence along the front
    for (let k = -4; k <= 4; k++) P.push(GK.at(GK.cyl(0.18, 0.2, 1.8, white, { segs: 6, seed: 30 + k }), 10, 0.9, k * 2.5));
    for (const yy of [0.7, 1.4]) P.push(GK.at(GK.box(0.2, 0.25, 20.5, white, { seed: 40, lump: 0, r: 0.08 }), 10, yy, 0));
    this.putAt(GK.merge(P), m, this.clayMat, { name: 'barn' });
    // the weathervane rooster on the ridge
    const vane = new THREE.Group();
    vane.position.copy(new THREE.Vector3(0, 13.6, 0).applyMatrix4(m));
    const rooster = this.keep(GK.merge([
      GK.at(GK.cyl(0.07, 0.07, 2.2, '#3b2a4a', { segs: 4, lump: 0 }), 0, 1.1, 0),
      GK.at(GK.blob(0.7, 0.5, 0.25, '#3b2a4a', { seed: 50 }), 0, 2.5, 0),
      GK.at(GK.blob(0.3, 0.35, 0.2, '#3b2a4a', { seed: 51 }), 0.6, 3, 0),
      GK.at(GK.cone(0.35, 0.8, '#e8483f', { seed: 52, segs: 5 }), -0.7, 2.8, 0, 0, 0, 0.6),
    ]));
    const rm = new THREE.Mesh(rooster, this.clayMat);
    rm.castShadow = true;
    vane.add(rm);
    this.scene.add(vane);
    this.anims.push((t) => (vane.rotation.y = Math.sin(t * 0.37) * 1.2 + Math.sin(t * 1.3) * 0.15));
  },

  // {seg, t, d}: a stack of round hay bales.
  hay(lm, x, y, z, head, parts) {
    const at = this.track.where(lm), road = at.path.point(at.s, 0);
    const m = this.flatFrame(x, y, z, Math.atan2(road.z - z, road.x - x));
    const P = [];
    const bale = (bx, by, bz, seed) => {
      P.push(GK.at(GK.cyl(1.25, 1.25, 1.9, '#e8c35a', { seed, segs: 14, lump: 0.12 }), bx, by + 1.25, bz, Math.PI / 2, 0, 0));
      for (const e of [-0.97, 0.97]) P.push(GK.at(GK.cyl(1.05, 1.05, 0.05, '#c9a03c', { seed: seed + 1, segs: 14, lump: 0 }), bx, by + 1.25, bz + e, Math.PI / 2, 0, 0));
    };
    bale(0, 0, -1.2, 1);
    bale(0, 0, 1.2, 3);
    bale(0.4, 2.2, 0, 5);
    bale(-2.8, 0, 0.4, 7);
    this.putAt(GK.merge(P), m, this.clayMat, { name: 'hay' });
  },
});
