'use strict';
// 3D looks for Fable Fair (browser only; see js/courses/fablefair.js): the road surfaces, wall
// looks, lamp posts and decor of its three laps, which World3D finds in the ROAD_TEXTURES,
// WALL_LOOKS, THEME_WALLS, CURB_STYLES, SHOULDER_COL, LAMPS and DECOR_PIECES registries, and (below)
// the landmarks that LANDMARKS builds along the road.
//   Lap 1 (theme fairy):  mossy cobbles, hedges, mossy trees, glowing mushrooms, lanterns.
//   Lap 2 (theme mirage): rippled sand with tiled edges, sandstone, palms, dunes, brass lamps;
//                         the canyon's rock, the coaster's rails and the ghost ship's hull.
//   Lap 3 (theme dream):  pearl cloud road, puffy walls, moonflowers, crystal spires, star lamps.
// Everything is built from lumpy clay primitives (GK) or painted on a canvas: no files.
// Helpers shared by the Fable Fair scenery files (fablefair-*.js).
const FableKit = {
  // The angle from (x, z) toward the road at a landmark's spot (to turn buildings to face it).
  facing(world, lm, x, z) {
    const at = world.track.where(lm);
    const road = at.path.point(at.s, 0);
    return Math.atan2(road.z - z, road.x - x);
  },
  // chunky clay beads along a curve, a lumpy arch (pts: [[lateral, up], ...] in the local frame)
  beads(P, pts, r, col, seed, x = 0) {
    pts.forEach(([z, y], k) => P.push(GK.at(GK.blob(r, r, r, typeof col === 'function' ? col(k) : col, { seed: seed + k, ws: 7, hs: 5, lump: r * 0.25 }), x, y, z)));
  },
  // the points of a pointed (ogee-ish) arch of half-width e and rise H
  archPoints(e, H, n) {
    const pts = [];
    for (let k = 0; k <= n; k++) {
      const u = k / n; // 0 = right foot, 1 = left foot
      const z = e * Math.cos(u * Math.PI);
      const w = Math.abs(z) / e;
      pts.push([z, H * Math.pow(Math.max(0, 1 - Math.pow(w, 1.9)), 0.62)]);
    }
    return pts;
  },
  // an onion dome: a squashed bulb on a short neck with a finial
  onion(P, x, y, z, r, col, seed, gold = '#ffd166') {
    P.push(GK.at(GK.blob(r, r * 1.25, r, col, { seed, ws: 10, hs: 7, lump: r * 0.05 }), x, y + r * 1.0, z));
    P.push(GK.at(GK.cone(r * 0.42, r * 1.3, col, { segs: 8, hsegs: 2, seed: seed + 1, lump: 0 }), x, y + r * 2.5, z));
    P.push(GK.at(GK.blob(r * 0.22, r * 0.22, r * 0.22, gold, { seed: seed + 2, ws: 6, hs: 4, lump: 0 }), x, y + r * 3.25, z));
  },
  // Puffs of smoke that rise, swell and fade in a loop above (x, y, z).
  smoke(world, x, y, z, size = 1, col = '#eeeef6') {
    // soft unlit puffs (a lit clay puff turns dirty grey at dusk), each fading as it rises
    const geo = worldGeo('fable:puff', () => GK.blob(1, 0.8, 1, '#ffffff', { seed: 7, lump: 0.25 }));
    const puffs = [];
    for (let k = 0; k < 6; k++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, depthWrite: false, fog: true }));
      world.scene.add(m);
      world.keep(m.material);
      puffs.push(m);
    }
    world.anims.push((t) => {
      puffs.forEach((m, k) => {
        const u = (t * 0.22 + k / puffs.length) % 1;
        m.position.set(x + Math.sin(u * 5 + k) * 0.6 + u * 3, y + u * 9, z + Math.cos(u * 4 + k) * 0.5);
        m.scale.setScalar(size * (0.5 + u * 1.6) * Math.min(1, (1 - u) * 4));
        m.material.opacity = 0.75 * Math.min(1, u * 6) * (1 - u * 0.8);
      });
    });
  },
};

(() => {
  // ------------------------------------------------------------------------ road surfaces
  Object.assign(ROAD_TEXTURES, {
    // Lap 1: a mossy cobbled path.
    moss(g, rnd, smear) {
      g.fillStyle = '#5b5046';
      g.fillRect(0, 0, 128, 256);
      const stones = ['#9b8b79', '#8c7d6b', '#a89886', '#80715f', '#a49481', '#94846f'];
      for (let row = 0; row < 14; row++) {
        const y = row * 18 + (row % 2) * 2, off = row % 2 ? -10 : 0;
        for (let x = off; x < 128; x += 21 + Math.floor(rnd() * 6)) {
          g.fillStyle = stones[Math.floor(rnd() * stones.length)];
          Clay.rrect(g, x + 1.5, y + 1.5, 18 + rnd() * 4, 14, 6);
          g.fill();
          g.fillStyle = 'rgba(255,255,255,0.15)';
          Clay.rrect(g, x + 3.5, y + 2.5, 9, 4, 2);
          g.fill();
        }
      }
      // moss in the gaps and creeping in from both edges
      for (let k = 0; k < 90; k++) {
        const edge = rnd() < 0.55;
        const x = edge ? (rnd() < 0.5 ? rnd() * 20 : 108 + rnd() * 20) : rnd() * 128;
        g.fillStyle = `rgba(${70 + Math.floor(rnd() * 30)},${130 + Math.floor(rnd() * 45)},${64 + Math.floor(rnd() * 20)},${0.22 + rnd() * 0.3})`;
        g.beginPath();
        g.ellipse(x, rnd() * 256, 3 + rnd() * 7, 2 + rnd() * 4, rnd() * 3, 0, TAU);
        g.fill();
      }
      smear(g, 128, 256, 30, 0.04);
      g.fillStyle = 'rgba(255,236,190,0.5)';
      g.fillRect(4, 0, 3, 256);
      g.fillRect(121, 0, 3, 256);
    },
    // Lap 2: rippled sand between mosaic tiled edges.
    sand(g, rnd, smear) {
      g.fillStyle = '#e6c78e';
      g.fillRect(0, 0, 128, 256);
      smear(g, 128, 256, 40, 0.05);
      // wind ripples
      g.lineWidth = 1.5;
      for (let k = 0; k < 46; k++) {
        const y = rnd() * 256, x = 14 + rnd() * 70, w = 18 + rnd() * 36;
        g.strokeStyle = rnd() < 0.5 ? 'rgba(150,100,50,0.2)' : 'rgba(255,248,220,0.4)';
        g.beginPath();
        g.moveTo(x, y);
        g.bezierCurveTo(x + w * 0.3, y - 3, x + w * 0.7, y + 3, x + w, y);
        g.stroke();
      }
      // two soft wheel paths
      for (const cx of [38, 90]) {
        g.fillStyle = 'rgba(160,110,60,0.14)';
        g.fillRect(cx - 9, 0, 18, 256);
      }
      // mosaic tiles along both edges: turquoise, cream and gold
      const cols = ['#2d9cb8', '#fff3d6', '#2d9cb8', '#e8b64a'];
      for (let y = 0; y < 256; y += 16) {
        for (const [x0, k] of [[0, 0], [114, 1]]) {
          g.fillStyle = cols[(y / 16 + k) % cols.length];
          Clay.rrect(g, x0 + 1, y + 1, 12, 14, 3);
          g.fill();
        }
      }
      g.fillStyle = 'rgba(120,70,30,0.35)';
      g.fillRect(13, 0, 2, 256);
      g.fillRect(113, 0, 2, 256);
    },
    // Lap 2: a rollercoaster's wooden sleepers between two steel rails.
    track(g, rnd, smear) {
      g.fillStyle = '#4a2f26';
      g.fillRect(0, 0, 128, 256);
      for (let y = 0; y < 256; y += 32) {
        g.fillStyle = y % 64 ? '#a8643f' : '#b8714a';
        Clay.rrect(g, 2, y + 3, 124, 26, 5);
        g.fill();
        g.fillStyle = 'rgba(70,35,25,0.35)';
        for (let k = 0; k < 3; k++) g.fillRect(8 + rnd() * 100, y + 8 + k * 6, 14 + rnd() * 30, 1.5);
        g.fillStyle = 'rgba(60,35,25,0.6)';
        for (const x of [10, 118]) g.fillRect(x, y + 14, 3, 3);
      }
      // the rails: steel with a bright top edge, and a red guard stripe at each side
      for (const x of [22, 94]) {
        g.fillStyle = '#7d8696';
        g.fillRect(x, 0, 12, 256);
        g.fillStyle = '#d6dcea';
        g.fillRect(x + 2, 0, 3, 256);
        g.fillStyle = 'rgba(30,30,50,0.4)';
        g.fillRect(x + 10, 0, 2, 256);
      }
      g.fillStyle = '#c4443c';
      g.fillRect(0, 0, 5, 256);
      g.fillRect(123, 0, 5, 256);
    },
    // Lap 2: the ghost ship's weathered planks, damp and greenish, with the odd ghostly glint.
    deck(g, rnd, smear) {
      g.fillStyle = '#463f55';
      g.fillRect(0, 0, 128, 256);
      for (let y = 0; y < 256; y += 32) {
        g.fillStyle = y % 64 ? '#56506a' : '#4d4761';
        g.fillRect(0, y + 2, 128, 28);
        g.strokeStyle = 'rgba(20,16,30,0.35)';
        g.lineWidth = 1;
        for (let k = 0; k < 3; k++) {
          const yy = y + 8 + k * 7 + rnd() * 3;
          g.beginPath();
          g.moveTo(0, yy);
          g.bezierCurveTo(40, yy + rnd() * 4 - 2, 90, yy + rnd() * 4 - 2, 128, yy);
          g.stroke();
        }
        g.fillStyle = 'rgba(20,16,30,0.5)';
        g.fillRect(0, y, 128, 2);
      }
      // slime and ghost-light streaks
      for (let k = 0; k < 40; k++) {
        g.fillStyle = rnd() < 0.7 ? `rgba(90,200,170,${0.08 + rnd() * 0.12})` : `rgba(200,255,240,${0.1 + rnd() * 0.15})`;
        g.beginPath();
        g.ellipse(rnd() * 128, rnd() * 256, 4 + rnd() * 12, 1.5 + rnd() * 3, rnd() * 0.4, 0, TAU);
        g.fill();
      }
      smear(g, 128, 256, 24, 0.05);
    },
    // Lap 3: a pearly cloud road, soft swirls and the odd gold star.
    cloud(g, rnd, smear) {
      const grd = g.createLinearGradient(0, 0, 128, 0);
      grd.addColorStop(0, '#c4baf5');
      grd.addColorStop(0.5, '#dcd5ff');
      grd.addColorStop(1, '#c4baf5');
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 256);
      smear(g, 128, 256, 50, 0.05);
      g.lineWidth = 3;
      for (let k = 0; k < 22; k++) {
        const x = rnd() * 128, y = rnd() * 256, r = 6 + rnd() * 12;
        g.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.55)' : 'rgba(150,130,235,0.4)';
        g.beginPath();
        g.arc(x, y, r, rnd() * 3, rnd() * 3 + 3.2);
        g.stroke();
      }
      g.fillStyle = '#ffe08a';
      for (let k = 0; k < 14; k++) {
        const x = 12 + rnd() * 104, y = rnd() * 256, r = 1.5 + rnd() * 2.5;
        g.beginPath();
        for (let q = 0; q < 10; q++) {
          const a = (q / 10) * TAU, rr = q % 2 ? r * 0.45 : r;
          g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        g.closePath();
        g.fill();
      }
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.fillRect(5, 0, 3, 256);
      g.fillRect(120, 0, 3, 256);
    },
  });
  Object.assign(CURB_STYLES, { sand: true, cloud: true });
  Object.assign(FLUSH_STYLES, { deck: true, track: true });
  Object.assign(SHOULDER_COL, { moss: '#3a7a4c', sand: '#e8c984', track: '#8a6a50', deck: '#4a4258', cloud: '#a69ae8' });

  // ------------------------------------------------------------------------ walls
  Object.assign(WALL_LOOKS, {
    // Lap 2: sandstone blocks along the bazaar streets
    sandwall: { prof: [[-0.1, -0.3], [-0.1, 1.5], [0.1, 1.7], [0.8, 1.7], [1.0, -0.3]], blocks: true, depth: 1 },
    // the water-jet canyon: tall, rugged sandstone cliffs
    canyon: { prof: [[-0.2, -0.6], [-0.15, 2.0], [0.5, 3.4], [1.6, 4.4], [2.8, 4.8], [3.8, -0.6]], col: '#cf9560', wob: true, depth: 3.8 },
    // the rollercoaster's guard rail, painted red
    coaster: { prof: [[-0.1, 0.2], [-0.1, 1.1], [0.15, 1.28], [0.42, 1.28], [0.4, 0.2]], col: '#b8423a', depth: 0.45 },
    // the Flying Dutchman's hull: dark ghostly planks
    hull: { prof: [[-0.1, -0.7], [-0.1, 2.5], [0.4, 3.1], [1.2, 3.1], [1.3, -0.7]], col: '#4b3f58', blocks: true, depth: 1.3 },
    // the water chute down the plunge
    flume: { prof: [[-0.1, -0.6], [-0.1, 1.7], [0.3, 1.95], [1.0, 1.95], [1.1, -0.6]], col: '#6f93b8', depth: 1.1 },
  });
  Object.assign(THEME_WALLS, { fairy: 'hedge', mirage: 'sandwall', dream: 'snow' });

  // ------------------------------------------------------------------------ lamps
  Object.assign(LAMPS, {
    // a crooked wooden post with a candle lantern swinging from a hook
    fairy: {
      every: 34, glow: '#ffd98a', y: 4.3, size: 3.4, mode: 2,
      geo: () => {
        const P = [];
        P.push(GK.at(GK.cyl(0.16, 0.24, 4.8, '#5a3f2f', { segs: 6, seed: 3 }), 0, 2.4, 0, 0.05, 0, -0.07));
        P.push(GK.at(GK.cyl(0.1, 0.12, 1.1, '#5a3f2f', { segs: 5, seed: 4, lump: 0.02 }), 0.4, 4.85, 0, 0, 0, Math.PI / 2 - 0.15));
        P.push(GK.at(GK.box(0.62, 0.78, 0.62, '#ffe9a8', { seed: 5, r: 0.14 }), 0.95, 4.2, 0));
        P.push(GK.at(GK.cone(0.55, 0.45, '#3b2a4a', { segs: 5, seed: 6, lump: 0 }), 0.95, 4.78, 0));
        P.push(GK.at(GK.blob(0.22, 0.22, 0.22, '#e8b04a', { seed: 7, lump: 0 }), 0.95, 3.72, 0));
        P.push(GK.at(GK.blob(0.7, 0.3, 0.7, '#4f9a52', { seed: 8 }), 0, 0.15, 0)); // moss at the foot
        return GK.merge(P);
      },
    },
    // a brass post with an onion-dome lantern
    mirage: {
      every: 44, glow: '#ffcf70', y: 5.0, size: 3.0, mode: 0,
      geo: () => {
        const P = [];
        P.push(GK.at(GK.cyl(0.13, 0.22, 4.4, '#c99a3c', { segs: 8, seed: 3 }), 0, 2.2, 0));
        P.push(GK.at(GK.cyl(0.36, 0.44, 0.45, '#b4832f', { segs: 8, seed: 4 }), 0, 0.22, 0));
        P.push(GK.at(GK.blob(0.5, 0.62, 0.5, '#ffe3a0', { seed: 5, lump: 0.02 }), 0, 4.95, 0));
        P.push(GK.at(GK.blob(0.62, 0.34, 0.62, '#c99a3c', { seed: 6, lump: 0.02 }), 0, 4.45, 0));
        P.push(GK.at(GK.cone(0.46, 0.9, '#2d9cb8', { segs: 8, seed: 7, lump: 0 }), 0, 5.75, 0));
        P.push(GK.at(GK.blob(0.14, 0.14, 0.14, '#ffd166', { seed: 8, lump: 0 }), 0, 6.32, 0));
        return GK.merge(P);
      },
    },
    // a pearl post topped with a little glowing star
    dream: {
      every: 40, glow: '#cfd6ff', y: 5.4, size: 3.2, mode: 3,
      geo: () => {
        const P = [];
        P.push(GK.at(GK.cyl(0.14, 0.22, 4.8, '#e6e0ff', { segs: 7, seed: 3 }), 0, 2.4, 0));
        P.push(GK.at(GK.blob(0.5, 0.28, 0.5, '#cfc6ff', { seed: 4 }), 0, 0.2, 0));
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * TAU;
          P.push(GK.at(GK.cone(0.2, 0.62, '#ffe08a', { segs: 4, seed: 9 + k, lump: 0 }), Math.cos(a) * 0.42, 5.35 + Math.sin(a) * 0.42, 0, 0, 0, a - Math.PI / 2));
        }
        P.push(GK.at(GK.blob(0.36, 0.36, 0.2, '#fff3b0', { seed: 8, lump: 0 }), 0, 5.35, 0));
        return GK.merge(P);
      },
    },
  });

  // ------------------------------------------------------------------------ decor
  const at = GK.at.bind(GK);
  Object.assign(DECOR_PIECES, {
    // ---- Lap 1 ----
    // a big mossy tree with a dark canopy and a few glowing buds
    mosstree(rnd, seed) {
      const P = [];
      const h = 6.5 + rnd() * 2.5;
      P.push(at(GK.cyl(0.8, 1.35, h, '#6a4a3a', { seed, segs: 7 }), 0, h / 2, 0));
      P.push(at(GK.blob(1.1, 0.7, 1.1, '#4f9a52', { seed: seed + 1 }), 0.55, 1.3, 0.3)); // moss on the trunk
      P.push(at(GK.blob(0.8, 0.5, 0.8, '#5aa85a', { seed: seed + 2 }), -0.5, 3.4, 0.4));
      const leaf = ['#2f7a4c', '#256a40', '#2b7348'];
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU + rnd() * 0.5;
        P.push(at(GK.blob(2.7, 2.1, 2.7, leaf[k % 3], { seed: seed * 7 + k }), Math.cos(a) * 1.9, h + 0.3 + (k % 2) * 0.8, Math.sin(a) * 1.9));
      }
      P.push(at(GK.blob(3.0, 2.4, 3.0, '#3f9a5c', { seed: seed * 7 + 9 }), 0, h + 2.1, 0));
      for (let k = 0; k < 3; k++) {
        const a = rnd() * TAU;
        P.push(at(GK.blob(0.22, 0.22, 0.22, '#e4ff8a', { seed: seed + 20 + k, lump: 0, ws: 6, hs: 4 }), Math.cos(a) * 2.8, h - 0.1 + rnd(), Math.sin(a) * 2.8));
      }
      return GK.merge(P);
    },
    // a cluster of glowing toadstools in fairy-tale colours
    glowshroom(rnd, seed) {
      const P = [];
      const caps = ['#7a5ad8', '#3fc8b0', '#e0589a', '#ffb347'];
      const n = 2 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const x = (rnd() - 0.5) * 2.4, z = (rnd() - 0.5) * 2.4, s = 0.6 + rnd() * 0.9, cap = caps[Math.floor(rnd() * caps.length)];
        P.push(at(GK.cyl(0.22 * s, 0.32 * s, 1.5 * s, '#f4ecd8', { seed: seed + k, segs: 6 }), x, 0.7 * s, z));
        P.push(at(GK.blob(1.05 * s, 0.62 * s, 1.05 * s, cap, { seed: seed + k + 5 }), x, 1.6 * s, z));
        for (let d = 0; d < 4; d++) {
          const a = (d / 4) * TAU + k;
          P.push(at(GK.blob(0.18 * s, 0.1 * s, 0.18 * s, '#fff3c4', { seed: seed + d, lump: 0, ws: 5, hs: 4 }), x + Math.cos(a) * 0.62 * s, 1.98 * s, z + Math.sin(a) * 0.62 * s));
        }
      }
      return GK.merge(P);
    },
    // a fan of fern fronds
    fern(rnd, seed) {
      const P = [];
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * TAU + rnd() * 0.3;
        const f = GK.blob(1.6, 0.22, 0.42, k % 2 ? '#3f8f4f' : '#4a9d58', { seed: seed + k, ws: 7, hs: 4 });
        P.push(at(f, Math.cos(a) * 1.15, 0.65, Math.sin(a) * 1.15, 0, -a, 0.55));
      }
      return GK.merge(P);
    },
    // a cut stump with its rings showing and a cap of moss
    stump(rnd, seed) {
      const P = [];
      P.push(at(GK.cyl(1.0, 1.25, 1.3, '#7a5a42', { seed, segs: 8 }), 0, 0.65, 0));
      P.push(at(GK.cyl(0.92, 0.92, 0.12, '#c9a07a', { seed: seed + 1, segs: 8, lump: 0.02 }), 0, 1.3, 0));
      P.push(at(GK.cyl(0.5, 0.5, 0.14, '#b08a64', { seed: seed + 2, segs: 8, lump: 0.02 }), 0, 1.34, 0));
      P.push(at(GK.blob(0.7, 0.35, 0.6, '#4f9a52', { seed: seed + 3 }), -0.6, 1.2, 0.5));
      return GK.merge(P);
    },
    // ---- Lap 2 ----
    // a palm with a curved trunk and a crown of arching fronds
    palm(rnd, seed) {
      const P = [];
      const lean = (rnd() - 0.5) * 0.5;
      let x = 0, y = 0;
      for (let k = 0; k < 4; k++) {
        const seg = GK.cyl(0.34 - k * 0.03, 0.4 - k * 0.03, 1.9, k % 2 ? '#a07a52' : '#b48a5c', { seed: seed + k, segs: 6 });
        P.push(at(seg, x, y + 0.95, 0, 0, 0, lean * 0.4));
        x += Math.sin(lean * 0.4) * -1.9;
        y += Math.cos(lean * 0.4) * 1.9;
      }
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * TAU + rnd() * 0.2;
        const f = GK.blob(2.5, 0.18, 0.5, k % 2 ? '#4f9a45' : '#5fae4f', { seed: seed + 10 + k, ws: 7, hs: 4 });
        P.push(at(f, x + Math.cos(a) * 1.7, y + 0.1, Math.sin(a) * 1.7, 0, -a, -0.5));
      }
      for (let k = 0; k < 3; k++) P.push(at(GK.blob(0.26, 0.26, 0.26, '#6b4a3a', { seed: seed + 30 + k, lump: 0, ws: 5, hs: 4 }), x + (k - 1) * 0.3, y - 0.3, 0.3 * (k % 2 ? 1 : -1)));
      return GK.merge(P);
    },
    // a low, wide sand dune
    dune(rnd, seed) {
      const w = 5 + rnd() * 4;
      const P = [at(GK.blob(w, 1.3 + rnd() * 1.1, w * 0.55, '#ecc87c', { seed, lump: 0.25 }), 0, 0.2, 0)];
      P.push(at(GK.blob(w * 0.6, 0.9, w * 0.3, '#f3d792', { seed: seed + 1, lump: 0.2 }), w * 0.2, 0.9, -w * 0.12));
      return GK.merge(P);
    },
    // a saguaro with two arms and a pink flower on top
    cactus(rnd, seed) {
      const P = [];
      const h = 3 + rnd() * 1.4;
      P.push(at(GK.cyl(0.46, 0.55, h, '#5aa05a', { seed, segs: 7 }), 0, h / 2, 0));
      P.push(at(GK.blob(0.5, 0.4, 0.5, '#5aa05a', { seed: seed + 1 }), 0, h + 0.1, 0));
      for (const [s, hh] of [[-1, 0.55], [1, 0.7]]) {
        P.push(at(GK.cyl(0.26, 0.28, 1.0, '#5aa05a', { seed: seed + 2, segs: 6 }), s * 0.62, hh * h, 0, 0, 0, Math.PI / 2));
        P.push(at(GK.cyl(0.25, 0.26, 1.1, '#62ab62', { seed: seed + 3, segs: 6 }), s * 1.1, hh * h + 0.6, 0));
      }
      P.push(at(GK.blob(0.22, 0.16, 0.22, '#ff7fa8', { seed: seed + 9, lump: 0 }), 0, h + 0.5, 0));
      return GK.merge(P);
    },
    // a terracotta jar with a painted band
    clayjar(rnd, seed) {
      const P = [];
      P.push(at(GK.blob(0.75, 0.9, 0.75, '#c8683a', { seed }), 0, 0.9, 0));
      P.push(at(GK.cyl(0.32, 0.42, 0.6, '#c8683a', { seed: seed + 1, segs: 8 }), 0, 1.85, 0));
      P.push(at(GK.torus(0.36, 0.09, '#a8502c', { seed: seed + 2, lump: 0 }), 0, 2.15, 0, Math.PI / 2, 0, 0));
      P.push(at(GK.torus(0.74, 0.07, '#f0d9a0', { seed: seed + 3, lump: 0 }), 0, 0.95, 0, Math.PI / 2, 0, 0));
      for (const s of [-1, 1]) P.push(at(GK.torus(0.22, 0.06, '#a8502c', { seed: seed + 4, lump: 0 }), s * 0.5, 1.7, 0, 0, 0, 0));
      return GK.merge(P);
    },
    // a sandstone outcrop
    sandrock(rnd, seed) {
      const P = [at(GK.blob(1.6, 1.1, 1.3, '#b9855a', { seed }), 0, 0.5, 0)];
      P.push(at(GK.blob(1.0, 0.8, 0.9, '#c99668', { seed: seed + 1 }), 0.9, 0.4, 0.5));
      P.push(at(GK.blob(0.9, 0.3, 0.8, '#dfb888', { seed: seed + 2 }), -0.1, 1.45, 0));
      return GK.merge(P);
    },
    // ---- Lap 3 ----
    // a tall stem with a big glowing bloom
    moonflower(rnd, seed) {
      const P = [];
      const h = 2.6 + rnd() * 1.4;
      P.push(at(GK.cyl(0.1, 0.14, h, '#8a7ae0', { seed, segs: 5, lump: 0.02 }), 0, h / 2, 0));
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        P.push(at(GK.blob(0.62, 0.14, 0.26, k % 2 ? '#fff2b0' : '#ffe9a0', { seed: seed + k, ws: 7, hs: 4 }), Math.cos(a) * 0.55, h + 0.1, Math.sin(a) * 0.55, 0, -a, 0.18));
      }
      P.push(at(GK.blob(0.3, 0.2, 0.3, '#ffc94a', { seed: seed + 9, lump: 0 }), 0, h + 0.15, 0));
      P.push(at(GK.blob(0.5, 0.2, 0.3, '#7a6ad8', { seed: seed + 10 }), 0.3, 0.6, 0.2, 0, 0.6, 0.4));
      return GK.merge(P);
    },
    // a puff of cloud sitting on the ground
    cloudpuff(rnd, seed) {
      const P = [];
      const n = 3 + Math.floor(rnd() * 2);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU;
        P.push(at(GK.blob(1.9 + rnd(), 1.3 + rnd() * 0.5, 1.8 + rnd(), k % 2 ? '#f4efff' : '#e2daff', { seed: seed + k }), Math.cos(a) * 1.5, 0.9 + (k % 2) * 0.4, Math.sin(a) * 1.5));
      }
      P.push(at(GK.blob(2.3, 1.6, 2.2, '#f8f4ff', { seed: seed + 9 }), 0, 1.5, 0));
      return GK.merge(P);
    },
    // a pearl post with a golden star
    starpost(rnd, seed) {
      const P = [];
      const h = 4 + rnd() * 1.5;
      P.push(at(GK.cyl(0.13, 0.2, h, '#d8d0ff', { seed, segs: 6 }), 0, h / 2, 0));
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU;
        P.push(at(GK.cone(0.3, 0.9, '#ffd166', { segs: 4, seed: seed + k, lump: 0 }), Math.cos(a) * 0.62, h + 0.5 + Math.sin(a) * 0.62, 0, 0, 0, a - Math.PI / 2));
      }
      P.push(at(GK.blob(0.5, 0.5, 0.3, '#fff0a8', { seed: seed + 9, lump: 0 }), 0, h + 0.5, 0));
      return GK.merge(P);
    },
    // a cluster of tall crystals
    crystalspire(rnd, seed) {
      const P = [];
      const cols = ['#b8a8ff', '#ffb8e8', '#9fe8ff', '#d2c6ff'];
      for (let k = 0; k < 5; k++) {
        const h = 2.2 + rnd() * 4.5, a = rnd() * TAU, d = k ? 0.6 + rnd() * 0.9 : 0;
        P.push(at(GK.cone(0.5 + rnd() * 0.3, h, cols[k % cols.length], { segs: 5, seed: seed + k, lump: 0.04 }), Math.cos(a) * d, h / 2, Math.sin(a) * d, (rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3));
      }
      return GK.merge(P);
    },
  });

  Object.assign(LANDMARKS, {
    // {seg, t, text, sub, look: 'bazaar' | 'canyon' | 'coaster' | 'ship' | 'dream'}: a ride gate over the road:
    // two pillars with domes and a pointed arch of clay beads, the name of the ride on a sign.
    ridegate(lm, x, y, z, head, parts) {
      const w = this.track.where(lm), p = w.path;
      const q = p.point(w.s, 0);
      const e = q.hw + q.sh + 1.3, H = 8.5;
      const m = this.frame(p, w.s);
      const look = lm.look || 'bazaar';
      const L = {
        bazaar: { post: '#ecd29c', arch: '#2fb0b8', dome: '#2fb0b8', bg: '#2a7c8c', fg: '#fff3d0' },
        canyon: { post: '#cf9560', arch: '#d8a46a', dome: '#4aa8e8', bg: '#2f7fb8', fg: '#ffffff' },
        coaster: { post: '#c4443c', arch: '#fff0d6', dome: '#ffd166', bg: '#c4443c', fg: '#fff6e0' },
        ship: { post: '#4b3f58', arch: '#6a5a78', dome: '#5ed8a0', bg: '#2b2540', fg: '#9bffcb' },
        dream: { post: '#e6e0ff', arch: '#ffe08a', dome: '#b8a8ff', bg: '#3a2f7a', fg: '#ffe9a8' },
      }[look];
      const P = [];
      FableKit.beads(P, FableKit.archPoints(e, H, 26), 0.95, (k) => (k % 3 ? L.arch : L.post), 10);
      for (const zz of [-e, e]) {
        P.push(at(GK.cyl(1.5, 1.9, H - 1, L.post, { seed: zz > 0 ? 40 : 41, segs: 10, lump: 0.1 }), 0, (H - 1) / 2, zz));
        P.push(at(GK.torus(1.55, 0.3, '#c99a3c', { seed: 42, ts: 12, rs: 4, lump: 0 }), 0, H * 0.55, zz, Math.PI / 2, 0, 0));
        FableKit.onion(P, 0, H - 1.2, zz, 1.7, L.dome, zz > 0 ? 50 : 60);
      }
      // a crown on the arch's point
      P.push(at(GK.cone(0.7, 2.4, '#ffd166', { segs: 6, hsegs: 2, seed: 70, lump: 0 }), 0, H + 1.1, 0));
      this.putAt(GK.merge(P), m, this.clayMat, { name: 'ridegate' });
      const tex = this.signTexture('fable:gate:' + look + (lm.text || ''), 512, 160, L.bg, L.fg, [[lm.text || 'FABLE FAIR', lm.text && lm.text.length > 12 ? 52 : 64], ...(lm.sub ? [[lm.sub, 28]] : [])]);
      const sign = this.signGeo(Math.min(2 * e - 4, 16), 4);
      sign.translate(0, H * 0.62, 0);
      this.putAt(sign, m, this.signMat(tex), { cast: false });
      const v = new THREE.Vector3();
      for (const zz of [-e, e]) this.glow(...v.set(0.8, H * 0.55, zz).applyMatrix4(m).toArray(), 3.2, '#ffd98a', 0);
    },
  });
})();
