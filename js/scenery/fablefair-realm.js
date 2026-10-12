'use strict';
// The people and buildings of Fable Fair's dream lap (browser only; see js/courses/fablefair.js and
// fablefair-elves.js): elves (standing, dancing, piping, waving, carrying lanterns), trolls (sitting,
// sleeping, peeking over a rock, waving, fishing), castles with lit windows, floating islands,
// toadstool houses, and the decor pieces of the lap (dream trees, giant toadstools, bluebells...).
// They are shared through FableKit; the landmarks that place them are in fablefair-places.js.
// Lumpy clay primitives (GK), no files. Figures face +x and stand on y = 0.
(() => {
  const at = GK.at.bind(GK);
  const PI = Math.PI;
  const V3 = THREE.Vector3;

  // a cylinder from point a to point b (radius r0 at a, r1 at b)
  function limb(P, a, b, r0, r1, col, seed, o = {}) {
    const d = new V3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length() || 1e-3;
    const g = GK.cyl(r1, r0, L, col, Object.assign({ seed, segs: 6, hsegs: 1, lump: Math.min(r0, r1) * 0.1 }, o));
    const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.divideScalar(L));
    g.applyMatrix4(new THREE.Matrix4().compose(new V3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new V3(1, 1, 1)));
    P.push(g);
  }
  const blob = (P, rx, ry, rz, col, x, y, z, seed, o = {}) => P.push(at(GK.blob(rx, ry, rz, col, Object.assign({ seed, ws: 7, hs: 5 }, o)), x, y, z));
  // shared local geometries, built once per session
  function shared(key, make) {
    return worldGeo(key, () => {
      GK.detail = 0.7;
      const g = make();
      GK.detail = 1;
      return g;
    });
  }

  const TUNIC = ['#3fb89a', '#8a5ad8', '#e0589a', '#4f8fe0', '#e8a83a', '#58c878'];
  const HAT = ['#7a4ad0', '#e8483f', '#2f9a8a', '#d8508a', '#3f78d8', '#e0a030'];
  const HAIR = ['#ffe08a', '#c8603a', '#f2f2ff', '#4fd0c0', '#8a5a3a', '#ff9ac8'];
  const SKIN = ['#f6d3b8', '#f0c4a0', '#e8b894', '#fbe0cc'];

  // ---------------------------------------------------------------------------------- elves
  // pose: 'stand' | 'dance' | 'pipe' | 'wave' | 'lantern' | 'ring' (holding hands to both sides).
  // Returns {geo, glows: [[x, y, z, size, colour]]} in the elf's own frame (about 3 units tall).
  function elf(v, pose) {
    const key = 'fable:elf:' + pose + ':' + v;
    const glows = [];
    const geo = shared(key, () => {
      const tun = TUNIC[v % TUNIC.length], hat = HAT[(v * 5 + 2) % HAT.length], hair = HAIR[(v * 3 + 1) % HAIR.length], skin = SKIN[v % SKIN.length];
      const P = [], sd = v * 17 + 3;
      // boots with curled toes, legs
      for (const z of [-0.24, 0.24]) {
        blob(P, 0.34, 0.17, 0.2, '#6b4a3a', 0.1, 0.17, z, sd + 1);
        P.push(at(GK.cone(0.08, 0.38, '#6b4a3a', { segs: 5, hsegs: 1, seed: sd + 2, lump: 0 }), 0.46, 0.3, z, 0, 0, -1.0));
        limb(P, [0, 0.95, z * 0.8], [0.04, 0.28, z], 0.12, 0.1, tun, sd + 3);
      }
      // a belted tunic
      P.push(at(GK.cone(0.64, 1.25, tun, { segs: 9, hsegs: 2, seed: sd + 4, lump: 0.03 }), 0, 1.5, 0));
      P.push(at(GK.torus(0.42, 0.075, '#d4a24a', { ts: 12, rs: 4, seed: sd + 5, lump: 0 }), 0, 1.22, 0, PI / 2));
      P.push(at(GK.blob(0.14, 0.14, 0.08, '#ffd166', { seed: sd + 6, ws: 5, hs: 4, lump: 0 }), 0.42, 1.22, 0));
      // arms by pose: shoulder to hand
      const sh = (z) => [0, 1.82, z * 0.42];
      let hands;
      switch (pose) {
        case 'dance': hands = [[0.25, 2.55, -0.85], [0.25, 2.55, 0.85]]; break;
        case 'wave': hands = [[0.15, 1.05, -0.78], [0.35, 2.55, 0.72]]; break;
        case 'ring': hands = [[0, 1.55, -0.95], [0, 1.55, 0.95]]; break;
        case 'pipe': hands = [[0.48, 2.0, -0.28], [0.48, 2.0, 0.28]]; break;
        case 'lantern': hands = [[0.15, 1.05, -0.78], [0.6, 1.35, 0.55]]; break;
        default: hands = [[0.12, 1.05, -0.78], [0.12, 1.05, 0.78]];
      }
      [-1, 1].forEach((side, k) => {
        limb(P, sh(side), hands[k], 0.12, 0.09, tun, sd + 8 + k);
        blob(P, 0.11, 0.1, 0.11, skin, hands[k][0], hands[k][1], hands[k][2], sd + 12 + k, { ws: 6, hs: 4, lump: 0 });
      });
      if (pose === 'pipe') limb(P, [0.5, 2.0, -0.62], [0.5, 2.0, 0.55], 0.045, 0.045, '#e8e0ff', sd + 20, { segs: 5 }); // a little flute
      if (pose === 'lantern') {
        limb(P, [0.6, 1.35, 0.55], [0.6, 2.7, 0.55], 0.04, 0.04, '#6b4a3a', sd + 21, { segs: 5 });
        P.push(at(GK.box(0.34, 0.42, 0.34, '#ffe9a0', { seed: sd + 22, r: 0.08, seg: 2, lump: 0 }), 0.6, 2.62, 0.55));
        P.push(at(GK.cone(0.26, 0.2, '#3b2a4a', { segs: 4, hsegs: 1, seed: sd + 23, lump: 0 }), 0.6, 2.9, 0.55));
        glows.push([0.6, 2.62, 0.55, 3.2, '#ffd98a']);
      }
      // head: pointed ears, cheeks, eyes, a smile, hair, a floppy pointed hat with a bell
      blob(P, 0.43, 0.45, 0.4, skin, 0.02, 2.12, 0, sd + 30, { ws: 9, hs: 7 });
      for (const side of [-1, 1]) {
        P.push(at(GK.cone(0.09, 0.52, skin, { segs: 5, hsegs: 1, seed: sd + 31, lump: 0 }), -0.04, 2.15, side * 0.44, side * 1.15, 0, 0.5));
        blob(P, 0.05, 0.06, 0.05, '#2b1838', 0.38, 2.2, side * 0.16, sd + 32, { ws: 5, hs: 4, lump: 0 });
        blob(P, 0.07, 0.05, 0.07, '#ff9fb4', 0.34, 2.04, side * 0.25, sd + 33, { ws: 5, hs: 4, lump: 0 });
      }
      blob(P, 0.06, 0.06, 0.06, skin, 0.43, 2.1, 0, sd + 34, { ws: 5, hs: 4, lump: 0 });
      blob(P, 0.04, 0.025, 0.1, '#b0483c', 0.4, 1.96, 0, sd + 35, { ws: 5, hs: 3, lump: 0 });
      blob(P, 0.46, 0.3, 0.44, hair, -0.1, 2.3, 0, sd + 36, { ws: 8, hs: 5 });
      P.push(at(GK.torus(0.45, 0.075, hat, { ts: 12, rs: 4, seed: sd + 37, lump: 0 }), -0.04, 2.5, 0, PI / 2));
      P.push(at(GK.cone(0.5, 1.1, hat, { segs: 9, hsegs: 3, seed: sd + 38, lump: 0.03 }), -0.2, 3.0, 0, 0, 0, 0.35));
      P.push(at(GK.cone(0.22, 0.55, hat, { segs: 6, hsegs: 2, seed: sd + 39, lump: 0 }), -0.78, 3.42, 0, 0, 0, 1.0));
      blob(P, 0.1, 0.1, 0.1, '#ffd166', -1.0, 3.62, 0, sd + 40, { ws: 5, hs: 4, lump: 0 });
      // some are fairy-folk, with wings
      if (v % 3 === 2) {
        for (const side of [-1, 1]) {
          P.push(at(GK.blob(0.1, 0.62, 0.34, '#d8f4ff', { seed: sd + 41, ws: 6, hs: 5, lump: 0.02 }), -0.32, 1.95, side * 0.5, side * 0.35, 0, 0.3));
          P.push(at(GK.blob(0.08, 0.34, 0.22, '#f4d8ff', { seed: sd + 42, ws: 6, hs: 4, lump: 0.02 }), -0.3, 1.45, side * 0.42, side * 0.45, 0, 0.1));
        }
      }
      const g = GK.merge(P);
      if (pose === 'dance') g.rotateZ(0.1);
      g.userData.glows = glows;
      return g;
    });
    return { geo, glows: geo.userData.glows };
  }

  // ---------------------------------------------------------------------------------- trolls
  const TROLL_SKIN = ['#9ab890', '#a9a2c4', '#c4a98c', '#86aed2'];
  const MOSS = ['#4f9a52', '#5fae5a', '#3f8a4c'];
  // pose: 'stand' | 'sit' | 'sleep' | 'wave' | 'fish' | 'peek'. About 7 units tall standing (a sitting
  // troll about 5). Returns {geo, glows}.
  function troll(v, pose) {
    const key = 'fable:troll:' + pose + ':' + v;
    const glows = [];
    const geo = shared(key, () => {
      const skin = TROLL_SKIN[v % TROLL_SKIN.length], dark = U.shade(skin, -0.16), light = U.shade(skin, 0.12), sd = v * 29 + 11;
      const P = [];
      const sit = pose === 'sit' || pose === 'sleep' || pose === 'fish';
      const hipY = sit ? 1.6 : 2.7;
      // legs and feet
      for (const z of [-1.0, 1.0]) {
        if (sit) {
          limb(P, [0, hipY, z * 0.95], [1.9, hipY + 0.2, z], 0.95, 0.75, skin, sd + 1);
          limb(P, [1.9, hipY + 0.2, z], [2.4, 0.7, z], 0.75, 0.65, skin, sd + 2);
          blob(P, 0.95, 0.4, 0.7, dark, 2.75, 0.4, z, sd + 3, { ws: 8, hs: 5 });
        } else {
          limb(P, [0, hipY, z * 0.9], [0.1, 0.7, z], 0.95, 0.72, skin, sd + 1);
          blob(P, 1.15, 0.45, 0.75, dark, 0.45, 0.4, z, sd + 3, { ws: 8, hs: 5 });
        }
      }
      // a ragged fur skirt, a big belly, a broad chest
      P.push(at(GK.cyl(1.55, 2.0, 1.2, '#7a5a3a', { seed: sd + 4, segs: 10, hsegs: 2, lump: 0.2 }), 0.1, hipY + 0.5, 0));
      const lean = pose === 'sleep' ? -0.35 : 0;
      const body = [];
      blob(body, 1.95, 1.9, 1.75, skin, 0.3, hipY + 2.3, 0, sd + 5, { ws: 9, hs: 7 });
      blob(body, 1.85, 1.5, 2.15, skin, 0.05, hipY + 3.8, 0, sd + 6, { ws: 9, hs: 7 });
      blob(body, 1.0, 0.8, 1.0, light, 0.95, hipY + 2.0, 0, sd + 7, { ws: 7, hs: 5 });
      for (let k = 0; k < 4; k++) blob(body, 0.18, 0.18, 0.18, dark, 0.2 + k * 0.3, hipY + 4.2 + (k % 2) * 0.5, (k % 2 ? 1 : -1) * 1.1, sd + 8 + k, { ws: 5, hs: 4, lump: 0 }); // warts
      // moss and a mushroom on the shoulders
      blob(body, 0.9, 0.35, 0.8, MOSS[0], -0.2, hipY + 5.15, -1.1, sd + 12);
      blob(body, 0.7, 0.3, 0.65, MOSS[1], -0.3, hipY + 5.0, 1.3, sd + 13);
      body.push(at(GK.cyl(0.14, 0.18, 0.9, '#f4ecd8', { segs: 5, hsegs: 1, seed: sd + 14, lump: 0 }), -0.3, hipY + 5.6, 1.3));
      body.push(at(GK.blob(0.6, 0.32, 0.6, '#d8508a', { seed: sd + 15, ws: 7, hs: 5 }), -0.3, hipY + 6.1, 1.3));
      // arms
      const shoulder = (z) => [0, hipY + 4.6, z * 1.85];
      let hands;
      switch (pose) {
        case 'wave': hands = [[1.4, hipY + 1.8, -2.4], [1.2, hipY + 7.2, 2.6]]; break;
        case 'sleep': hands = [[1.3, hipY + 2.6, -0.8], [1.3, hipY + 2.6, 0.8]]; break;
        case 'fish': hands = [[2.3, hipY + 2.6, -1.0], [2.8, hipY + 3.0, 0.9]]; break;
        case 'sit': hands = [[2.1, hipY + 1.4, -1.9], [2.2, hipY + 2.3, 2.0]]; break;
        default: hands = [[1.0, hipY + 2.0, -2.5], [1.6, hipY + 2.1, 2.6]];
      }
      [-1, 1].forEach((side, k) => {
        limb(body, shoulder(side), hands[k], 0.85, 0.65, skin, sd + 20 + k);
        blob(body, 0.72, 0.65, 0.66, light, hands[k][0], hands[k][1], hands[k][2], sd + 22 + k, { ws: 7, hs: 5 });
      });
      // head: a heavy brow, yellow eyes, a big nose, tusks and ears
      const hy = hipY + 6.7;
      blob(body, 1.3, 1.2, 1.25, skin, 0.65, hy, 0, sd + 30, { ws: 9, hs: 7 });
      blob(body, 0.95, 0.3, 1.2, dark, 1.35, hy + 0.55, 0, sd + 31, { ws: 7, hs: 4 });
      const asleep = pose === 'sleep';
      for (const side of [-1, 1]) {
        if (asleep) body.push(at(GK.torus(0.2, 0.05, '#2b1838', { arc: PI, ts: 8, rs: 4, seed: sd + 32, lump: 0 }), 1.62, hy + 0.2, side * 0.5, 0, PI / 2, PI)); // a shut eye
        else {
          blob(body, 0.2, 0.22, 0.2, '#ffe36a', 1.62, hy + 0.12, side * 0.5, sd + 32, { ws: 6, hs: 5, lump: 0 });
          blob(body, 0.1, 0.11, 0.1, '#2b1838', 1.8, hy + 0.1, side * 0.5, sd + 33, { ws: 5, hs: 4, lump: 0 });
          glows.push([1.9, hy + 0.12, side * 0.5, 1.3, '#ffe36a', 0]); // eyes that shine in the dark
        }
        body.push(at(GK.cone(0.15, 0.55, '#fff6e0', { segs: 5, hsegs: 1, seed: sd + 34, lump: 0 }), 1.5, hy - 0.62, side * 0.42, 0, 0, -0.15));
        body.push(at(GK.blob(0.25, 0.95, 0.6, skin, { seed: sd + 35, ws: 6, hs: 5 }), 0.4, hy + 0.1, side * 1.38, side * 0.4, 0, 0));
      }
      blob(body, 0.55, 0.5, 0.5, U.shade('#d8a0a0', 0), 1.85, hy - 0.2, 0, sd + 36, { ws: 7, hs: 5 });
      blob(body, 0.2, 0.2, 0.58, '#3b2030', 1.62, hy - 0.58, 0, sd + 37, { ws: 6, hs: 4, lump: 0 }); // the mouth
      for (let k = 0; k < 3; k++) blob(body, 0.55, 0.38, 0.5, MOSS[k % 3], 0.35 + (k - 1) * 0.35, hy + 1.2 + (k % 2) * 0.1, (k - 1) * 0.55, sd + 38 + k); // tufts of moss for hair
      const bg = GK.merge(body);
      if (lean) bg.rotateZ(lean);
      P.push(bg);
      // props
      if (pose === 'stand' || pose === 'wave' || pose === 'sit') {
        // a club leaning on the ground, a lantern hanging from its tip
        const hz = pose === 'wave' ? -2.4 : -2.5;
        limb(P, [hands[0][0], 0.4, hz], [hands[0][0] + 0.2, hipY + 4.2, hz], 0.55, 0.95, '#7a5236', sd + 45, { segs: 7, lump: 0.06 });
        for (let k = 0; k < 5; k++) blob(P, 0.22, 0.2, 0.22, '#6a4630', hands[0][0] + 0.2 + Math.cos(k * 1.7) * 0.8, hipY + 3.6 + (k % 3) * 0.5, hz + Math.sin(k * 1.7) * 0.8, sd + 46 + k, { ws: 5, hs: 4, lump: 0 });
      }
      if (pose === 'wave') {
        limb(P, [hands[0][0], hipY + 4.2, -2.4], [hands[0][0] + 1.4, hipY + 4.2, -2.4], 0.06, 0.06, '#6b4a3a', sd + 60, { segs: 4 });
        P.push(at(GK.box(0.6, 0.75, 0.6, '#ffe9a0', { seed: sd + 61, r: 0.14, seg: 2, lump: 0 }), hands[0][0] + 1.4, hipY + 3.8, -2.4));
        glows.push([hands[0][0] + 1.4, hipY + 3.8, -2.4, 5, '#ffd98a']);
      }
      if (pose === 'fish') {
        // a fishing rod over the edge, with a line and a glowing little fish
        limb(P, [hands[1][0], hands[1][1], 0.9], [hands[1][0] + 4.6, hands[1][1] + 3.2, 0.9], 0.1, 0.05, '#7a5236', sd + 62, { segs: 5 });
        limb(P, [hands[1][0] + 4.6, hands[1][1] + 3.2, 0.9], [hands[1][0] + 4.6, hands[1][1] - 3.4, 0.9], 0.025, 0.025, '#fff6e0', sd + 63, { segs: 3 });
        blob(P, 0.5, 0.25, 0.18, '#7fe8ff', hands[1][0] + 4.6, hands[1][1] - 3.6, 0.9, sd + 64, { ws: 6, hs: 4, lump: 0 });
        glows.push([hands[1][0] + 4.6, hands[1][1] - 3.6, 0.9, 3.2, '#7fe8ff']);
      }
      const out = GK.merge(P);
      out.userData.glows = glows;
      return out;
    });
    return { geo, glows: geo.userData.glows };
  }

  // the upper half of a troll, arms up and roaring, for the one that pops out of a mound (origin at its waist)
  function trollBust(v) {
    return shared('fable:trollbust:' + v, () => {
      const skin = TROLL_SKIN[v % TROLL_SKIN.length], dark = U.shade(skin, -0.16), light = U.shade(skin, 0.12), sd = v * 37 + 9, P = [];
      blob(P, 2.3, 1.9, 2.1, skin, 0.1, 1.2, 0, sd + 1, { ws: 9, hs: 7 });
      blob(P, 2.15, 1.55, 2.5, skin, 0, 3.0, 0, sd + 2, { ws: 9, hs: 7 });
      blob(P, 1.1, 0.9, 1.1, light, 0.95, 1.0, 0, sd + 3, { ws: 7, hs: 5 });
      blob(P, 0.95, 0.35, 0.85, MOSS[0], -0.2, 4.2, -1.3, sd + 4);
      blob(P, 0.75, 0.3, 0.7, MOSS[1], -0.3, 4.05, 1.5, sd + 5);
      for (const side of [-1, 1]) {
        limb(P, [0, 3.6, side * 2.1], [0.7, 6.9, side * 3.1], 0.95, 0.7, skin, sd + 6 + side);
        blob(P, 0.95, 0.9, 0.9, light, 0.8, 7.2, side * 3.2, sd + 8 + side, { ws: 7, hs: 5 });
        for (let f = 0; f < 3; f++) blob(P, 0.28, 0.4, 0.28, dark, 1.1, 7.9, side * 3.2 + (f - 1) * 0.5, sd + 10 + f, { ws: 5, hs: 4, lump: 0 }); // knuckles
      }
      // the head, mouth wide open
      blob(P, 1.5, 1.35, 1.4, skin, 0.75, 5.6, 0, sd + 20, { ws: 9, hs: 7 });
      blob(P, 1.05, 0.34, 1.35, dark, 1.5, 6.25, 0, sd + 21, { ws: 7, hs: 4 });
      for (const side of [-1, 1]) {
        blob(P, 0.24, 0.26, 0.24, '#ffe36a', 1.75, 5.95, side * 0.55, sd + 22, { ws: 6, hs: 5, lump: 0 });
        blob(P, 0.11, 0.12, 0.11, '#2b1838', 1.95, 5.93, side * 0.55, sd + 23, { ws: 5, hs: 4, lump: 0 });
        P.push(at(GK.cone(0.17, 0.7, '#fff6e0', { segs: 5, hsegs: 1, seed: sd + 24, lump: 0 }), 1.7, 4.65, side * 0.5, 0, 0, -0.1));
        P.push(at(GK.blob(0.28, 1.1, 0.65, skin, { seed: sd + 25, ws: 6, hs: 5 }), 0.5, 5.9, side * 1.55, side * 0.4, 0, 0));
      }
      blob(P, 0.62, 0.55, 0.55, '#d8a0a0', 2.0, 5.5, 0, sd + 26, { ws: 7, hs: 5 });
      blob(P, 0.3, 0.45, 0.8, '#3b2030', 1.8, 4.85, 0, sd + 27, { ws: 6, hs: 5, lump: 0 }); // the open mouth
      for (let k = 0; k < 4; k++) P.push(at(GK.cone(0.1, 0.32, '#fff6e0', { segs: 4, hsegs: 1, seed: sd + 28 + k, lump: 0 }), 1.95, 5.05, (k - 1.5) * 0.3, PI));
      for (let k = 0; k < 3; k++) blob(P, 0.6, 0.4, 0.55, MOSS[k % 3], 0.5 + (k - 1) * 0.35, 6.9, (k - 1) * 0.55, sd + 32 + k);
      return GK.merge(P);
    });
  }

  // a troll's head and hands over the top of a rock (peeking); returns {geo, glows}
  function trollPeek(v) {
    const geo = shared('fable:trollpeek:' + v, () => {
      const skin = TROLL_SKIN[v % TROLL_SKIN.length], dark = U.shade(skin, -0.16), light = U.shade(skin, 0.12), sd = v * 31 + 5, P = [];
      // the rock it hides behind
      blob(P, 3.4, 2.6, 4.2, '#7a7690', -0.3, 1.2, 0, sd + 1, { ws: 9, hs: 6, lump: 0.5 });
      blob(P, 2.2, 1.6, 2.6, '#8a86a2', 0.4, 2.6, 1.0, sd + 2, { ws: 8, hs: 6, lump: 0.4 });
      // the head rises behind it: eyes over the edge, ears, a tuft of moss; big hands grip the rock
      blob(P, 1.4, 1.5, 1.35, skin, -1.6, 3.5, -0.6, sd + 3, { ws: 9, hs: 7 });
      blob(P, 1.0, 0.3, 1.3, dark, -0.6, 4.2, -0.6, sd + 4, { ws: 7, hs: 4 });
      for (const side of [-1, 1]) {
        blob(P, 0.24, 0.26, 0.24, '#ffe36a', -0.3, 3.9, -0.6 + side * 0.55, sd + 5, { ws: 6, hs: 5, lump: 0 });
        blob(P, 0.12, 0.13, 0.12, '#2b1838', -0.1, 3.88, -0.6 + side * 0.55, sd + 6, { ws: 5, hs: 4, lump: 0 });
        P.push(at(GK.blob(0.28, 1.0, 0.6, skin, { seed: sd + 7, ws: 6, hs: 5 }), -1.8, 3.9, -0.6 + side * 1.5, side * 0.4, 0, 0));
      }
      blob(P, 0.65, 0.55, 0.55, '#d8a0a0', -0.1, 3.25, -0.6, sd + 8, { ws: 7, hs: 5 });
      for (let k = 0; k < 3; k++) blob(P, 0.6, 0.4, 0.55, MOSS[k % 3], -1.9 + k * 0.25, 5.0, -0.6 + (k - 1) * 0.6, sd + 9 + k);
      for (const [z, h] of [[-2.2, 2.9], [1.4, 3.0]]) for (let f = 0; f < 4; f++) limb(P, [0.4 - f * 0.05, h + 0.2, z + f * 0.34], [0.1, h - 0.2 + (f % 2) * 0.1, z + f * 0.34], 0.2, 0.17, light, sd + 12 + f, { segs: 5 }); // fingers
      return GK.merge(P);
    });
    return { geo, glows: [] };
  }

  // ---------------------------------------------------------------------------------- castles
  const WALLS = ['#e4dcfa', '#d4c8f2', '#efe6ff', '#cfd8f4'];
  const ROOFS = ['#6a4fd0', '#3f8fd8', '#c8508a', '#34b8a0', '#e8a83a'];
  // A castle of keep radius about s: a curtain wall with battlements, a tall keep, towers with cone
  // roofs, flags and a gate; the lit windows are collected in L ([x, y, z, w, h, facing], local frame).
  // Faces +x. v picks the palette and the number of towers.
  function castle(P, L, s, v, o = {}) {
    const sd = v * 41 + 7, rnd = U.rng(sd);
    const wall = WALLS[v % WALLS.length], roofA = ROOFS[v % ROOFS.length], roofB = ROOFS[(v + 2) % ROOFS.length], roofC = ROOFS[(v + 3) % ROOFS.length];
    const roof = (k) => [roofA, roofB, roofC][k % 3];
    // foundation and curtain wall
    P.push(at(GK.cyl(s * 1.55, s * 1.7, s * 0.9, '#a49abd', { seed: sd + 1, segs: 16, hsegs: 2, lump: s * 0.05 }), 0, s * 0.45, 0));
    P.push(at(GK.cyl(s * 1.42, s * 1.48, s * 1.0, wall, { seed: sd + 2, segs: 16, hsegs: 2, lump: s * 0.03 }), 0, s * 1.4, 0));
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU;
      P.push(at(GK.box(s * 0.3, s * 0.26, s * 0.22, wall, { seed: sd + 3, r: s * 0.04, seg: 2, lump: 0 }), Math.cos(a) * s * 1.42, s * 2.03, Math.sin(a) * s * 1.42, 0, -a, 0));
    }
    // the keep and its roof
    const kh = s * (3.6 + rnd() * 1.2);
    P.push(at(GK.cyl(s * 0.78, s * 0.92, kh, wall, { seed: sd + 4, segs: 11, hsegs: 4, lump: s * 0.03 }), 0, s * 1.9 + kh / 2, 0));
    P.push(at(GK.torus(s * 0.86, s * 0.07, '#d4a24a', { ts: 14, rs: 4, seed: sd + 5, lump: 0 }), 0, s * 1.9 + kh, 0, PI / 2));
    P.push(at(GK.cone(s * 1.1, s * 2.4, roofA, { seed: sd + 6, segs: 11, hsegs: 4, lump: s * 0.04 }), 0, s * 1.9 + kh + s * 1.2, 0));
    P.push(at(GK.blob(s * 0.17, s * 0.17, s * 0.17, '#ffd166', { seed: sd + 7, ws: 6, hs: 4, lump: 0 }), 0, s * 1.9 + kh + s * 2.55, 0));
    P.push(at(GK.cyl(s * 0.03, s * 0.03, s * 1.3, '#8a7a6a', { seed: sd + 8, segs: 4, hsegs: 1, lump: 0 }), 0, s * 1.9 + kh + s * 3.1, 0));
    P.push(at(GK.box(s * 0.7, s * 0.4, s * 0.04, roofB, { seed: sd + 9, r: s * 0.015, seg: 2, lump: 0 }), s * 0.36, s * 1.9 + kh + s * 3.5, 0));
    // towers
    const nt = 4 + (v % 3);
    for (let k = 0; k < nt; k++) {
      const a = (k / nt) * TAU + 0.4, tx = Math.cos(a) * s * 1.3, tz = Math.sin(a) * s * 1.3, th = s * (2.2 + rnd() * 1.6) + s * 1.5;
      P.push(at(GK.cyl(s * 0.36, s * 0.42, th, wall, { seed: sd + 20 + k, segs: 9, hsegs: 3, lump: s * 0.02 }), tx, s * 0.9 + th / 2, tz));
      P.push(at(GK.torus(s * 0.4, s * 0.05, '#d4a24a', { ts: 12, rs: 4, seed: sd + 30 + k, lump: 0 }), tx, s * 0.9 + th, tz, PI / 2));
      P.push(at(GK.cone(s * 0.52, s * 1.35, roof(k + 1), { seed: sd + 40 + k, segs: 9, hsegs: 3, lump: s * 0.03 }), tx, s * 0.9 + th + s * 0.65, tz));
      P.push(at(GK.blob(s * 0.09, s * 0.09, s * 0.09, '#ffd166', { seed: sd + 50 + k, ws: 5, hs: 4, lump: 0 }), tx, s * 0.9 + th + s * 1.4, tz));
      for (let w = 0; w < 2; w++) L.push([tx + Math.cos(a + (w ? 0.25 : -0.25)) * s * 0.36, s * 0.9 + th * (0.55 + w * 0.22), tz + Math.sin(a + (w ? 0.25 : -0.25)) * s * 0.36, s * 0.1, s * 0.2, a + (w ? 0.25 : -0.25)]);
    }
    // windows on the keep, the gate in the wall
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * TAU + rnd() * 0.3;
      L.push([Math.cos(a) * s * 0.84, s * (2.6 + rnd() * 2.8), Math.sin(a) * s * 0.84, s * 0.12, s * 0.24, a]);
    }
    P.push(at(GK.box(s * 0.2, s * 0.7, s * 0.55, '#2b2038', { seed: sd + 60, r: s * 0.07, seg: 2, lump: 0 }), s * 1.45, s * 1.35, 0));
    P.push(at(GK.torus(s * 0.28, s * 0.06, '#a49abd', { arc: PI, ts: 8, rs: 4, seed: sd + 61, lump: 0 }), s * 1.45, s * 1.65, 0, 0, PI / 2, 0));
    L.push([s * 1.48, s * 1.3, 0, s * 0.3, s * 0.5, 0]);
  }
  // the lit windows, merged into one unlit geometry (local frame, faces +x)
  function windows(L, col = ['#ffe6a0', '#ffc870']) {
    const P = [];
    L.forEach(([x, y, z, w, h, a], k) => P.push(at(GK.box(w, h, w * 0.5, col[k % col.length], { seed: 5 + k, r: w * 0.25, seg: 2, lump: 0 }), x, y, z, 0, -a, 0)));
    return GK.merge(P);
  }

  // A rocky floating island under a point: a hanging cone of rock with roots and a mossy cap.
  function island(P, r, seed, grass = '#7a68d4', rock = '#4c3ca0') {
    P.push(at(GK.blob(r, r * 0.22, r * 0.9, grass, { seed, lump: r * 0.05, ws: 11, hs: 6 }), 0, 0, 0));
    P.push(at(GK.cyl(r * 0.97, r * 0.82, r * 0.3, '#9284d0', { seed: seed + 1, segs: 14, lump: r * 0.05 }), 0, -r * 0.16, 0));
    P.push(at(GK.cone(r * 0.84, r * 1.25, rock, { seed: seed + 2, segs: 11, hsegs: 4, lump: r * 0.12 }), 0, -r * 0.95, 0, PI));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + seed;
      P.push(at(GK.cone(r * 0.05, r * (0.4 + (k % 3) * 0.15), '#5a8a5a', { seed: seed + 5 + k, segs: 4, hsegs: 1, lump: 0 }), Math.cos(a) * r * 0.55, -r * 0.4, Math.sin(a) * r * 0.55, PI));
    }
  }

  // A toadstool house: a cream stem with a round door and windows, a spotted cap for a roof.
  // Returns lit parts through L.
  function toadHouse(P, L, s, v) {
    const caps = ['#e0589a', '#7a5ad8', '#3f8fd8', '#ff9b3d', '#3fc8b0', '#d8503a'], sd = v * 23 + 5;
    const cap = caps[v % caps.length];
    P.push(at(GK.cyl(s * 0.95, s * 1.15, s * 2.3, '#f4ecd8', { seed: sd, segs: 9, hsegs: 3, lump: s * 0.05 }), 0, s * 1.15, 0));
    P.push(at(GK.blob(s * 2.6, s * 1.35, s * 2.6, cap, { seed: sd + 1, ws: 11, hs: 7 }), 0, s * 2.75, 0));
    P.push(at(GK.blob(s * 2.5, s * 0.25, s * 2.5, U.shade(cap, -0.2), { seed: sd + 2, ws: 11, hs: 4, lump: s * 0.05 }), 0, s * 2.2, 0)); // the gills under the cap
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU + v, e = 0.35 + 0.5 * U.hash2(k, v, 3);
      P.push(at(GK.blob(s * 0.34, s * 0.12, s * 0.34, '#fff6e6', { seed: sd + 3 + k, ws: 6, hs: 4, lump: 0 }), Math.cos(a) * s * 2.3 * e, s * (3.4 - 0.9 * e * e), Math.sin(a) * s * 2.3 * e));
    }
    // the door (facing +x) and windows
    P.push(at(GK.box(s * 0.18, s * 1.0, s * 0.7, '#7a4a2a', { seed: sd + 20, r: s * 0.08, seg: 2, lump: 0 }), s * 1.02, s * 0.62, 0));
    P.push(at(GK.torus(s * 0.35, s * 0.07, '#7a4a2a', { arc: PI, ts: 8, rs: 4, seed: sd + 21, lump: 0 }), s * 1.04, s * 1.1, 0, 0, PI / 2, 0));
    blob(P, s * 0.07, s * 0.07, s * 0.07, '#ffd166', s * 1.12, s * 0.62, s * 0.2, sd + 22, { ws: 5, hs: 4, lump: 0 });
    P.push(at(GK.box(s * 0.5, s * 0.1, s * 0.9, '#c8b8a0', { seed: sd + 23, r: s * 0.04, seg: 2, lump: 0 }), s * 1.3, s * 0.06, 0)); // a step
    for (const z of [-1, 1]) L.push([s * 0.99, s * 1.55, z * s * 0.62, s * 0.3, s * 0.38, 0]);
    L.push([s * 0.99, s * 0.78, 0, s * 0.01, s * 0.01, 0]);
    // a tiny chimney with a curl of... nothing: a little flag instead
    P.push(at(GK.cyl(s * 0.03, s * 0.03, s * 1.1, '#8a7a6a', { seed: sd + 24, segs: 4, hsegs: 1, lump: 0 }), -s * 0.5, s * 4.0, s * 0.4));
    P.push(at(GK.box(s * 0.5, s * 0.3, s * 0.03, HAT[v % HAT.length], { seed: sd + 25, r: s * 0.01, seg: 2, lump: 0 }), -s * 0.25, s * 4.4, s * 0.4));
  }

  // a chunky five-pointed star standing in the x-y plane, one point up, R from the middle to the tips
  function star(R, col, seed, core = '#fff3b0') {
    const P = [at(GK.blob(R * 0.52, R * 0.52, R * 0.3, core, { seed, lump: 0.02, ws: 8, hs: 6 }), 0, 0, 0)];
    for (let k = 0; k < 5; k++) {
      const a = Math.PI / 2 + (k / 5) * TAU;
      const cone = GK.cone(R * 0.3, R * 0.72, col, { segs: 5, seed: seed + 1 + k, lump: 0.02 });
      cone.scale(1, 1, 0.6);
      P.push(at(cone, Math.cos(a) * R * 0.66, Math.sin(a) * R * 0.66, 0, 0, 0, a - Math.PI / 2));
    }
    return GK.merge(P);
  }

  Object.assign(FableKit, { elf, troll, trollPeek, trollBust, castle, windows, island, toadHouse, limb, shared, star });

  // ---------------------------------------------------------------------------------- decor
  const at2 = at;
  Object.assign(DECOR_PIECES, {
    // a twisted tree with a glowing, layered canopy and lanterns hanging from its boughs (Elf Wood)
    dreamtree(rnd, seed) {
      const P = [];
      const h = 6 + rnd() * 3, lean = (rnd() - 0.5) * 0.5;
      limb(P, [0, 0, 0], [Math.sin(lean) * 1.5, h, 0.4], 1.25, 0.65, '#6a4a5a', seed, { segs: 7 });
      P.push(at2(GK.blob(1.6, 0.7, 1.5, '#5a3f50', { seed: seed + 1 }), 0, 0.3, 0)); // roots
      const cols = ['#6a5ad8', '#3fb8c8', '#9a6ae0', '#58c8a8'];
      const cx = Math.sin(lean) * 1.5;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU + rnd() * 0.5;
        P.push(at2(GK.blob(2.5, 1.7, 2.5, cols[k % cols.length], { seed: seed * 7 + k }), cx + Math.cos(a) * 2.2, h + 0.2 + (k % 3) * 0.8, 0.4 + Math.sin(a) * 2.2));
      }
      P.push(at2(GK.blob(3.1, 2.2, 3.1, '#7a6ae8', { seed: seed * 7 + 9 }), cx, h + 2.1, 0.4));
      for (let k = 0; k < 4; k++) {
        const a = rnd() * TAU, r = 1.6 + rnd() * 2.2;
        P.push(at2(GK.cyl(0.02, 0.02, 1.0, '#8a7a9a', { segs: 3, hsegs: 1, lump: 0, seed: seed + 20 + k }), cx + Math.cos(a) * r, h - 0.4, 0.4 + Math.sin(a) * r));
        P.push(at2(GK.blob(0.26, 0.3, 0.26, '#ffe9a0', { seed: seed + 30 + k, ws: 5, hs: 4, lump: 0 }), cx + Math.cos(a) * r, h - 1.1, 0.4 + Math.sin(a) * r));
      }
      return GK.merge(P);
    },
    // a giant toadstool with a big cool-coloured cap, glowing spots and a pale underside
    dreamshroom(rnd, seed) {
      const P = [];
      const caps = ['#7a5ad8', '#3f8fd8', '#d8508a', '#3fc8b0'];
      const cap = caps[Math.floor(rnd() * caps.length)], h = 3.4 + rnd() * 3, r = 2.2 + rnd() * 1.6;
      limb(P, [0, 0, 0], [rnd() * 0.5 - 0.25, h, 0], 0.7, 0.45, '#f4ecd8', seed, { segs: 7 });
      P.push(at2(GK.blob(r, r * 0.6, r, cap, { seed: seed + 1, ws: 10, hs: 7 }), 0, h + 0.2, 0));
      P.push(at2(GK.blob(r * 0.95, r * 0.15, r * 0.95, '#ffe6f6', { seed: seed + 2, ws: 10, hs: 4, lump: 0.05 }), 0, h - 0.1, 0));
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU + rnd(), e = 0.3 + 0.55 * rnd();
        P.push(at2(GK.blob(r * 0.17, r * 0.07, r * 0.17, '#fff6c8', { seed: seed + 3 + k, ws: 6, hs: 4, lump: 0 }), Math.cos(a) * r * e, h + 0.2 + r * 0.6 * (1 - e * e) * 0.95, Math.sin(a) * r * e));
      }
      for (let k = 0; k < 2; k++) {
        const a = rnd() * TAU, s = 0.5 + rnd() * 0.5;
        P.push(at2(GK.cyl(0.14 * s, 0.2 * s, 0.9 * s, '#f4ecd8', { segs: 5, hsegs: 1, lump: 0, seed: seed + 12 + k }), Math.cos(a) * (r + 0.6), 0.45 * s, Math.sin(a) * (r + 0.6)));
        P.push(at2(GK.blob(0.5 * s, 0.3 * s, 0.5 * s, caps[(k + 1) % caps.length], { seed: seed + 14 + k, ws: 7, hs: 5 }), Math.cos(a) * (r + 0.6), 1.0 * s, Math.sin(a) * (r + 0.6)));
      }
      return GK.merge(P);
    },
    // a clump of tall stems with drooping bells in glowing blues and violets
    bluebell(rnd, seed) {
      const P = [];
      const cols = ['#7a8aff', '#a47aff', '#58b4ff', '#c58aff'];
      const n = 2 + Math.floor(rnd() * 2);
      for (let k = 0; k < n; k++) {
        const x = (rnd() - 0.5) * 2.2, z = (rnd() - 0.5) * 2.2, h = 2.6 + rnd() * 2.6, bend = (rnd() - 0.5) * 1.4;
        limb(P, [x, 0, z], [x + bend, h, z], 0.1, 0.06, '#5ea87a', seed + k, { segs: 4 });
        for (let b = 0; b < 3; b++) {
          const y = h - 0.15 - b * 0.55, sx = x + bend * (y / h) + (b % 2 ? 0.5 : -0.5);
          P.push(at2(GK.cone(0.38 - b * 0.04, 0.7, cols[(k + b) % cols.length], { segs: 5, hsegs: 1, seed: seed + 20 + k * 4 + b, lump: 0.02 }), sx, y - 0.2, z, 0, 0, PI));
        }
        P.push(at2(GK.blob(0.7, 0.14, 0.2, '#4f9a62', { seed: seed + 60 + k, ws: 5, hs: 3 }), x + 0.4, 0.3, z, 0, rnd() * 3, 0.4));
      }
      return GK.merge(P);
    },
    // a stone lantern on a post: a small glowing house for a light
    lanternstone(rnd, seed) {
      const P = [];
      P.push(at2(GK.cyl(0.4, 0.55, 0.5, '#a49abd', { segs: 7, seed }), 0, 0.25, 0));
      P.push(at2(GK.cyl(0.18, 0.22, 1.4, '#b8aed0', { segs: 6, seed: seed + 1 }), 0, 1.15, 0));
      P.push(at2(GK.box(0.9, 0.8, 0.9, '#ffe9a8', { seed: seed + 2, r: 0.2, seg: 2, lump: 0 }), 0, 2.2, 0));
      P.push(at2(GK.cone(0.85, 0.7, '#6a4fd0', { segs: 4, hsegs: 1, seed: seed + 3, lump: 0 }), 0, 2.95, 0, 0, PI / 4, 0));
      P.push(at2(GK.blob(0.12, 0.12, 0.12, '#ffd166', { seed: seed + 4, ws: 5, hs: 4, lump: 0 }), 0, 3.4, 0));
      return GK.merge(P);
    },
    // a mossy boulder with a flat top and ferns
    mossrock(rnd, seed) {
      const P = [];
      const w = 2 + rnd() * 2;
      P.push(at2(GK.blob(w, w * 0.6, w * 0.85, '#7a7690', { seed, lump: 0.5, ws: 9, hs: 6 }), 0, w * 0.35, 0));
      P.push(at2(GK.blob(w * 0.6, w * 0.4, w * 0.5, '#8a86a2', { seed: seed + 1, lump: 0.4 }), w * 0.5, w * 0.3, w * 0.35));
      P.push(at2(GK.blob(w * 0.8, w * 0.18, w * 0.7, '#4f9a62', { seed: seed + 2, ws: 7, hs: 4 }), -w * 0.1, w * 0.88, 0));
      for (let k = 0; k < 4; k++) {
        const a = k * 1.6 + rnd();
        P.push(at2(GK.blob(0.9, 0.12, 0.25, '#58b87a', { seed: seed + 3 + k, ws: 6, hs: 4 }), Math.cos(a) * w * 0.4, w * 0.95, Math.sin(a) * w * 0.4, 0, -a, 0.5));
      }
      return GK.merge(P);
    },
    // reeds with glowing cattails, for the marsh
    reeds(rnd, seed) {
      const P = [];
      for (let k = 0; k < 8; k++) {
        const x = (rnd() - 0.5) * 2.2, z = (rnd() - 0.5) * 2.2, h = 2.2 + rnd() * 1.8, bend = (rnd() - 0.5) * 0.9;
        limb(P, [x, 0, z], [x + bend, h, z], 0.07, 0.04, '#5aa88a', seed + k, { segs: 4 });
        if (k % 2) P.push(at2(GK.cyl(0.13, 0.13, 0.55, '#c0e8a0', { segs: 5, hsegs: 1, lump: 0, seed: seed + 10 + k }), x + bend, h + 0.1, z));
      }
      return GK.merge(P);
    },
  });
})();
