'use strict';
// Clay karts and their drivers, built from lumpy primitives. A kart is a group of:
// paint (the body panels, tinted by the paint colour so Rainbow and Gold can shimmer),
// details (seat, engine, the driver's body), the driver's head (turns into corners and bobs on
// the stop-motion beat), four wheels and a soft contact shadow.
// Models face +X with the wheels resting on y = 0.

const WHEEL_SPECS = {
  standard: { r: 0.4, w: 0.34 },
  button: { r: 0.42, w: 0.22 },
  monster: { r: 0.56, w: 0.5 },
  slick: { r: 0.42, w: 0.18 },
};
const KART_GEO_CACHE = new Map();

const KartModels = {
  shadowTex: null,

  shadowTexture() {
    if (this.shadowTex) return this.shadowTex;
    const c = Clay.makeCanvas(64, 64);
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grd.addColorStop(0, 'rgba(40,20,50,0.55)');
    grd.addColorStop(0.55, 'rgba(40,20,50,0.25)');
    grd.addColorStop(1, 'rgba(40,20,50,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    this.shadowTex = new THREE.CanvasTexture(c);
    return this.shadowTex;
  },

  // Cached geometry sets per (body, wheels, character).
  geometry(cfg) {
    const key = cfg.body + '|' + cfg.wheels + '|' + cfg.character;
    let g = KART_GEO_CACHE.get(key);
    if (g) return g;
    const ws = WHEEL_SPECS[cfg.wheels] || WHEEL_SPECS.standard;
    const lift = ws.r - 0.4; // big wheels raise the whole kart
    const paint = [], detail = [];
    GK.detail = 0.8;
    buildBody(cfg.body, paint, detail, lift);
    const ch = findPart('character', cfg.character);
    const seat = BODY_SEAT[cfg.body] || { x: -0.35, y: 0.75 };
    const driverBody = [], head = [];
    buildDriver(ch, driverBody, head);
    for (const d of driverBody) GK.at(d, seat.x, seat.y + lift, 0);
    for (const h of head) GK.at(h, 0, 0, 0);
    g = {
      paint: GK.merge(paint),
      detail: GK.merge(detail.concat(driverBody)),
      head: GK.merge(head),
      headPos: new THREE.Vector3(seat.x + 0.05, seat.y + lift + 1.05, 0),
      wheel: buildWheel(cfg.wheels),
      wheelR: ws.r,
      wheelPos: BODY_WHEELS[cfg.body] || BODY_WHEELS.classic,
      lift,
    };
    GK.detail = 1;
    for (const k of ['paint', 'detail', 'head', 'wheel']) g[k].userData.shared = true;
    KART_GEO_CACHE.set(key, g);
    return g;
  },

  // A full kart group for a config. Returns { group, paintMat, ... } for animation.
  build(cfg, opts = {}) {
    cfg = sanitizeKart(cfg);
    const geo = this.geometry(cfg);
    const paint = findPart('paint', cfg.paint);
    const special = paint.special;
    const paintMat = Clay3D.material({ vertexColors: true, color: paint.color, wobble: 0.025, freq: 2.5, metal: special === 'gold' ? 0.55 : 0, rough: special === 'gold' ? 0.32 : 0.62 });
    const detailMat = Clay3D.material({ vertexColors: true, wobble: 0.03, freq: 2.5 });
    const group = new THREE.Group();
    const body = new THREE.Group(); // tilts and bounces
    group.add(body);
    const pm = new THREE.Mesh(geo.paint, paintMat);
    const dm = new THREE.Mesh(geo.detail, detailMat);
    const hm = new THREE.Mesh(geo.head, detailMat);
    hm.position.copy(geo.headPos);
    body.add(pm, dm, hm);
    const wheels = [];
    const wp = geo.wheelPos;
    for (const [x, z, front] of [[wp.fx, wp.z, true], [wp.fx, -wp.z, true], [wp.rx, wp.z, false], [wp.rx, -wp.z, false]]) {
      const holder = new THREE.Group();
      holder.position.set(x, geo.wheelR, z * (front ? 1 : 1.04));
      const w = new THREE.Mesh(geo.wheel, detailMat);
      if (z < 0) w.rotation.y = Math.PI; // hub faces outward on both sides
      holder.add(w);
      group.add(holder);
      wheels.push({ holder, mesh: w, front, side: z > 0 ? 1 : -1 });
    }
    let shadow = null;
    if (opts.shadow !== false) {
      shadow = new THREE.Mesh(SHADOW_GEO, new THREE.MeshBasicMaterial({ map: this.shadowTexture(), transparent: true, depthWrite: false, fog: true }));
      shadow.renderOrder = 1;
    }
    return { group, body, head: hm, wheels, paintMat, detailMat, shadow, special, cfg, geo };
  },
};
const SHADOW_GEO = new THREE.PlaneGeometry(3.4, 2.4).rotateX(-Math.PI / 2);
SHADOW_GEO.userData.shared = true;

// Where each body puts its seat and wheels.
const BODY_SEAT = {
  classic: { x: -0.35, y: 0.72 },
  bubble: { x: -0.25, y: 0.78 },
  teacup: { x: -0.05, y: 0.82 },
  mudtank: { x: -0.4, y: 0.9 },
  pipe: { x: -0.45, y: 0.62 },
  rocket: { x: -0.3, y: 0.72 },
};
const BODY_WHEELS = {
  classic: { fx: 0.95, rx: -0.85, z: 0.86 },
  bubble: { fx: 0.85, rx: -0.8, z: 0.9 },
  teacup: { fx: 0.8, rx: -0.75, z: 0.95 },
  mudtank: { fx: 1.05, rx: -0.95, z: 1.02 },
  pipe: { fx: 1.25, rx: -0.95, z: 0.84 },
  rocket: { fx: 1.0, rx: -0.9, z: 0.86 },
};

// Paint parts are vertex-coloured white-ish (the material tints them); details carry colour.
const W = '#ffffff', W2 = '#e9e9e9';
function buildBody(kind, P, D, lift) {
  const y = lift;
  const at = GK.at.bind(GK);
  const dark = '#3b2a3a', metal = '#c9c3d6', seatCol = '#4a3046';
  if (kind === 'bubble') {
    P.push(at(GK.blob(1.25, 0.55, 0.82, W, { seed: 11, lump: 0.06 }), 0.05, 0.62 + y, 0));
    P.push(at(GK.blob(0.5, 0.32, 0.6, W2, { seed: 12 }), 1.0, 0.55 + y, 0));
    D.push(at(GK.blob(0.5, 0.42, 0.55, '#bfe8ff', { seed: 13, lump: 0.02 }), 0.55, 1.0 + y, 0, 0, 0, -0.4));
    D.push(at(GK.box(0.6, 0.3, 0.9, seatCol, { seed: 14 }), -0.4, 0.88 + y, 0));
    D.push(at(GK.blob(0.22, 0.22, 0.22, '#ffd166', { seed: 15 }), 1.25, 0.66 + y, 0.45));
    D.push(at(GK.blob(0.22, 0.22, 0.22, '#ffd166', { seed: 16 }), 1.25, 0.66 + y, -0.45));
    for (const s of [-1, 1]) P.push(at(GK.blob(0.35, 0.12, 0.25, W2, { seed: 17 + s }), -1.0, 0.95 + y, s * 0.5, 0, 0, 0.4));
  } else if (kind === 'teacup') {
    // a saucer under a cup, with a handle on the side
    P.push(at(GK.cyl(1.25, 1.1, 0.16, W2, { seed: 21, segs: 20 }), 0, 0.42 + y, 0));
    P.push(at(GK.cyl(0.98, 0.7, 0.8, W, { seed: 22, segs: 20, open: false }), 0, 0.9 + y, 0));
    D.push(at(GK.cyl(0.86, 0.86, 0.06, '#8a5a3c', { seed: 23, segs: 18, lump: 0 }), 0, 1.25 + y, 0));
    P.push(at(GK.torus(0.32, 0.09, W2, { seed: 24 }), -0.1, 0.95 + y, -1.02, Math.PI / 2, 0, 0));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      D.push(at(GK.blob(0.13, 0.13, 0.05, '#ff86b6', { seed: 25 + k, lump: 0 }), Math.cos(a) * 0.86, 1.0 + y, Math.sin(a) * 0.86));
    }
    D.push(at(GK.cyl(0.05, 0.05, 0.6, metal, { segs: 6, lump: 0 }), 0.45, 1.2 + y, 0, 0, 0, -0.6));
  } else if (kind === 'mudtank') {
    P.push(at(GK.box(2.5, 0.7, 1.6, W, { seed: 31, r: 0.2 }), 0, 0.72 + y, 0));
    P.push(at(GK.box(0.6, 0.55, 1.75, W2, { seed: 32 }), 1.2, 0.62 + y, 0));
    D.push(at(GK.box(0.3, 0.3, 1.9, dark, { seed: 33 }), 1.45, 0.45 + y, 0));
    for (const s of [-1, 1]) D.push(at(GK.box(2.2, 0.32, 0.22, dark, { seed: 34 + s }), 0, 1.05 + y, s * 0.82));
    D.push(at(GK.box(0.7, 0.45, 1.1, seatCol, { seed: 36 }), -0.5, 1.15 + y, 0));
    D.push(at(GK.box(0.6, 0.6, 1.1, '#6b5f6e', { seed: 37 }), -1.15, 1.2 + y, 0));
    for (const s of [-1, 1]) D.push(at(GK.blob(0.18, 0.18, 0.18, '#ffd166', { seed: 38 + s }), 1.5, 0.85 + y, s * 0.55));
  } else if (kind === 'pipe') {
    P.push(at(GK.box(2.9, 0.42, 1.25, W, { seed: 41, r: 0.18 }), 0.1, 0.55 + y, 0));
    P.push(at(GK.blob(0.8, 0.25, 0.6, W2, { seed: 42 }), 1.45, 0.5 + y, 0));
    D.push(at(GK.box(0.6, 0.3, 0.85, seatCol, { seed: 43 }), -0.5, 0.85 + y, 0));
    D.push(at(GK.box(0.8, 0.45, 0.9, '#6b5f6e', { seed: 44 }), -1.2, 0.95 + y, 0));
    for (const s of [-1, 1]) {
      D.push(at(GK.cyl(0.16, 0.13, 1.4, metal, { seed: 45 + s, segs: 10 }), -1.45, 1.15 + y, s * 0.42, 0, 0, 1.0));
      D.push(at(GK.torus(0.15, 0.05, '#8a8396', { seed: 47 + s }), -2.0, 1.53 + y, s * 0.42, 0, Math.PI / 2, 0));
    }
    P.push(at(GK.box(0.3, 0.1, 1.5, W2, { seed: 49 }), 1.6, 0.4 + y, 0));
  } else if (kind === 'rocket') {
    P.push(at(GK.blob(1.2, 0.45, 0.72, W, { seed: 51 }), -0.1, 0.65 + y, 0));
    P.push(at(GK.cone(0.55, 1.4, W2, { seed: 52, segs: 14 }), 1.35, 0.62 + y, 0, 0, 0, -Math.PI / 2));
    P.push(at(GK.box(0.9, 0.9, 0.12, W2, { seed: 53 }), -1.1, 1.15 + y, 0, 0, 0, 0.3));
    for (const s of [-1, 1]) D.push(at(GK.box(2.6, 0.12, 0.14, metal, { seed: 54 + s }), 0.1, 0.18 + y, s * 0.55));
    D.push(at(GK.box(0.6, 0.3, 0.8, seatCol, { seed: 56 }), -0.4, 0.88 + y, 0));
    D.push(at(GK.cyl(0.3, 0.38, 0.4, '#6b5f6e', { seed: 57 }), -1.3, 0.65 + y, 0, 0, 0, Math.PI / 2));
    D.push(at(GK.blob(0.2, 0.2, 0.2, '#ffd166', { seed: 58 }), 2.0, 0.62 + y, 0));
  } else {
    // Clay Classic: a rounded tub with a nose, side pods and a little spoiler
    P.push(at(GK.box(2.3, 0.52, 1.35, W, { seed: 1, r: 0.24 }), 0, 0.6 + y, 0));
    P.push(at(GK.blob(0.7, 0.32, 0.7, W2, { seed: 2 }), 1.1, 0.58 + y, 0));
    for (const s of [-1, 1]) P.push(at(GK.blob(0.7, 0.24, 0.24, W2, { seed: 3 + s }), -0.1, 0.55 + y, s * 0.72));
    D.push(at(GK.box(0.55, 0.32, 0.9, seatCol, { seed: 6 }), -0.45, 0.92 + y, 0));
    D.push(at(GK.box(0.6, 0.5, 0.9, '#6b5f6e', { seed: 7 }), -1.05, 0.95 + y, 0));
    for (const s of [-1, 1]) D.push(at(GK.cyl(0.08, 0.08, 0.5, metal, { segs: 6, lump: 0 }), -1.25, 1.3 + y, s * 0.35));
    P.push(at(GK.box(0.4, 0.1, 1.5, W2, { seed: 8 }), -1.25, 1.58 + y, 0));
    for (const s of [-1, 1]) D.push(at(GK.blob(0.16, 0.16, 0.16, '#ffd166', { seed: 9 + s }), 1.5, 0.66 + y, s * 0.42));
  }
  // steering wheel in front of the seat
  const sx = { teacup: 0.45, mudtank: 0.2, pipe: 0.15 }[kind] || 0.25;
  D.push(at(GK.cyl(0.05, 0.05, 0.5, metal, { segs: 6, lump: 0 }), sx + 0.1, 1.0 + y, 0, 0, 0, 0.9));
  D.push(at(GK.torus(0.22, 0.05, '#3b2a3a', { seed: 99, lump: 0 }), sx - 0.08, 1.2 + y, 0, 0, Math.PI / 2, 0.5));
}

// Driver body (seated, hands on the wheel) and head, by racer.
function buildDriver(ch, B, H) {
  const c = ch.col;
  const at = GK.at.bind(GK);
  const id = ch.id;
  // seated torso + arms
  if (id === 'dumpling') {
    B.push(at(GK.blob(0.5, 0.5, 0.48, c.skin, { seed: 101 }), 0, 0.45, 0));
    B.push(at(GK.blob(0.36, 0.36, 0.34, c.main, { seed: 102 }), 0.18, 0.38, 0));
    for (const s of [-1, 1]) B.push(at(GK.blob(0.36, 0.13, 0.13, c.skin, { seed: 103 + s }), 0.42, 0.55, s * 0.32, 0, s * 0.3, 0));
    B.push(at(GK.blob(0.22, 0.2, 0.36, c.accent, { seed: 106 }), -0.3, 0.75, 0));
    // tail
    B.push(at(GK.cone(0.22, 0.8, c.skin, { seed: 107 }), -0.65, 0.3, 0, 0, 0, 1.8));
  } else if (id === 'shelly') {
    B.push(at(GK.blob(0.36, 0.42, 0.34, c.skin, { seed: 111 }), 0.05, 0.45, 0));
    // the shell sits behind, curling
    B.push(at(GK.blob(0.62, 0.62, 0.42, c.main, { seed: 112 }), -0.45, 0.75, 0));
    B.push(at(GK.torus(0.32, 0.1, U.shade(c.main, -0.2), { seed: 113 }), -0.47, 0.76, 0, 0, Math.PI / 2, 0));
    for (const s of [-1, 1]) B.push(at(GK.blob(0.32, 0.11, 0.11, c.skin, { seed: 114 + s }), 0.38, 0.5, s * 0.28, 0, s * 0.3, 0));
  } else if (id === 'flapper') {
    B.push(at(GK.blob(0.48, 0.5, 0.46, c.skin, { seed: 121 }), 0, 0.48, 0));
    B.push(at(GK.blob(0.3, 0.32, 0.3, c.main, { seed: 122 }), 0.2, 0.42, 0));
    for (const s of [-1, 1]) B.push(at(GK.blob(0.45, 0.1, 0.32, U.shade(c.skin, -0.1), { seed: 123 + s }), 0.1, 0.55, s * 0.48, 0.5 * s, 0, -0.4));
  } else if (id === 'mudlet') {
    B.push(at(GK.blob(0.62, 0.55, 0.58, c.skin, { seed: 131 }), 0, 0.5, 0));
    B.push(at(GK.box(0.2, 0.9, 1.1, c.second, { seed: 132 }), -0.45, 0.6, 0, 0, 0, 0.15));
    for (const s of [-1, 1]) B.push(at(GK.blob(0.4, 0.16, 0.16, c.skin, { seed: 133 + s }), 0.42, 0.55, s * 0.36, 0, s * 0.3, 0));
  } else if (id === 'sprout') {
    B.push(at(GK.blob(0.36, 0.4, 0.36, c.accent, { seed: 241 }), 0, 0.42, 0));
    B.push(at(GK.blob(0.22, 0.26, 0.24, c.skin, { seed: 242 }), 0.14, 0.4, 0));
    for (const s of [-1, 1]) B.push(at(GK.blob(0.32, 0.11, 0.11, c.skin, { seed: 243 + s }), 0.38, 0.55, s * 0.28, 0, s * 0.3, 0));
  } else if (id === 'puff') {
    B.push(at(GK.blob(0.5, 0.42, 0.5, c.skin, { seed: 251 }), 0, 0.4, 0));
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + 0.4;
      B.push(at(GK.blob(0.26, 0.22, 0.26, k % 2 ? c.hair : c.skin, { seed: 252 + k }), Math.cos(a) * 0.4, 0.3, Math.sin(a) * 0.4));
    }
    for (const s of [-1, 1]) B.push(at(GK.blob(0.3, 0.15, 0.15, c.skin, { seed: 257 + s }), 0.4, 0.55, s * 0.32, 0, s * 0.3, 0));
  } else if (id === 'thornbun') {
    B.push(at(GK.blob(0.44, 0.48, 0.42, c.skin, { seed: 141 }), 0, 0.45, 0));
    B.push(at(GK.blob(0.28, 0.32, 0.3, c.second, { seed: 142 }), 0.2, 0.42, 0));
    for (let k = 0; k < 4; k++) B.push(at(GK.cone(0.12, 0.35, c.main, { seed: 143 + k }), -0.35, 0.4 + k * 0.16, (k % 2 ? 1 : -1) * 0.18, 0, 0, 1.6));
    for (const s of [-1, 1]) B.push(at(GK.blob(0.34, 0.12, 0.12, c.skin, { seed: 147 + s }), 0.4, 0.55, s * 0.3, 0, s * 0.3, 0));
  } else {
    // Pepper: red shirt, blue overalls, white gloves
    B.push(at(GK.blob(0.42, 0.36, 0.42, c.second, { seed: 151 }), 0, 0.3, 0));
    B.push(at(GK.blob(0.4, 0.34, 0.4, c.main, { seed: 152 }), 0, 0.62, 0));
    for (const s of [-1, 1]) {
      B.push(at(GK.blob(0.34, 0.12, 0.12, c.main, { seed: 153 + s }), 0.32, 0.6, s * 0.3, 0, s * 0.35, -0.2));
      B.push(at(GK.blob(0.13, 0.13, 0.13, '#fffaf0', { seed: 155 + s }), 0.6, 0.62, s * 0.18));
    }
  }
  // ---- heads (centred on the neck pivot) ----
  const eye = (x, y, z, r = 0.11) => {
    H.push(at(GK.blob(r * 0.8, r, r * 0.6, '#fffaf0', { seed: 160 + z * 10, lump: 0 }), x, y, z));
    H.push(at(GK.blob(r * 0.4, r * 0.55, r * 0.3, '#2a1a22', { seed: 162 + z * 10, lump: 0 }), x + r * 0.45, y + 0.01, z));
  };
  if (id === 'dumpling') {
    H.push(GK.blob(0.42, 0.4, 0.4, c.skin, { seed: 171 }));
    H.push(at(GK.blob(0.36, 0.28, 0.32, c.skin, { seed: 172 }), 0.38, -0.08, 0));
    H.push(at(GK.blob(0.1, 0.06, 0.06, '#2a1a22', { seed: 173, lump: 0 }), 0.72, -0.02, 0.12));
    H.push(at(GK.blob(0.1, 0.06, 0.06, '#2a1a22', { seed: 174, lump: 0 }), 0.72, -0.02, -0.12));
    H.push(at(GK.blob(0.12, 0.1, 0.1, c.second, { seed: 175 }), -0.25, 0.3, 0.15));
    H.push(at(GK.blob(0.1, 0.08, 0.08, c.second, { seed: 176 }), -0.1, 0.38, -0.12));
    eye(0.2, 0.22, 0.17, 0.12);
    eye(0.2, 0.22, -0.17, 0.12);
  } else if (id === 'shelly') {
    H.push(GK.blob(0.32, 0.3, 0.3, c.skin, { seed: 181 }));
    for (const s of [-1, 1]) {
      H.push(at(GK.cyl(0.05, 0.06, 0.45, c.skin, { segs: 6, lump: 0 }), 0.12, 0.38, s * 0.13, s * 0.25, 0, -0.2));
      eye(0.2, 0.62, s * 0.18, 0.12);
    }
    H.push(at(GK.blob(0.12, 0.05, 0.16, '#b25a6a', { seed: 184, lump: 0 }), 0.28, -0.08, 0));
  } else if (id === 'flapper') {
    H.push(GK.blob(0.36, 0.36, 0.36, c.skin, { seed: 191 }));
    H.push(at(GK.cone(0.13, 0.35, c.second, { seed: 192 }), 0.42, -0.05, 0, 0, 0, -Math.PI / 2));
    H.push(at(GK.blob(0.16, 0.22, 0.08, c.hair, { seed: 193 }), -0.05, 0.42, 0, 0, 0, -0.4));
    eye(0.22, 0.1, 0.14);
    eye(0.22, 0.1, -0.14);
  } else if (id === 'mudlet') {
    H.push(GK.blob(0.48, 0.42, 0.46, c.skin, { seed: 201 }));
    H.push(at(GK.cyl(0.32, 0.36, 0.22, c.main, { seed: 202, segs: 12 }), -0.02, 0.46, 0));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU;
      H.push(at(GK.cone(0.09, 0.24, c.main, { seed: 203 + k, segs: 6 }), Math.cos(a) * 0.28, 0.66, Math.sin(a) * 0.28));
    }
    H.push(at(GK.blob(0.08, 0.08, 0.08, c.second, { seed: 209, lump: 0 }), 0.3, 0.5, 0));
    eye(0.36, 0.1, 0.16, 0.12);
    eye(0.36, 0.1, -0.16, 0.12);
    for (const s of [-1, 1]) H.push(at(GK.box(0.06, 0.06, 0.22, '#5b3524', { seed: 211 + s, lump: 0 }), 0.42, 0.26, s * 0.16, s * 0.4, 0, 0));
    H.push(at(GK.blob(0.06, 0.05, 0.2, '#5b3524', { seed: 214, lump: 0 }), 0.44, -0.18, 0));
  } else if (id === 'sprout') {
    H.push(GK.blob(0.3, 0.3, 0.3, c.skin, { seed: 261 }));
    H.push(at(GK.blob(0.52, 0.32, 0.52, c.main, { seed: 262 }), -0.02, 0.3, 0));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU;
      H.push(at(GK.blob(0.12, 0.08, 0.12, c.second, { seed: 263 + k, lump: 0 }), Math.cos(a) * 0.32, 0.5, Math.sin(a) * 0.32));
    }
    H.push(at(GK.blob(0.12, 0.1, 0.12, c.second, { seed: 269, lump: 0 }), 0, 0.62, 0));
    eye(0.22, 0.02, 0.11, 0.1);
    eye(0.22, 0.02, -0.11, 0.1);
  } else if (id === 'puff') {
    H.push(GK.blob(0.42, 0.36, 0.42, c.skin, { seed: 271 }));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI;
      H.push(at(GK.blob(0.2, 0.18, 0.2, c.hair, { seed: 272 + k }), -0.1 + Math.cos(a) * 0.05, 0.28 + Math.sin(a) * 0.08, (k - 2) * 0.16));
    }
    for (const s of [-1, 1]) H.push(at(GK.blob(0.08, 0.06, 0.04, c.main, { seed: 278 + s, lump: 0 }), 0.36, -0.08, s * 0.2));
    eye(0.32, 0.06, 0.12, 0.1);
    eye(0.32, 0.06, -0.12, 0.1);
  } else if (id === 'thornbun') {
    H.push(GK.blob(0.36, 0.34, 0.34, c.skin, { seed: 221 }));
    for (const s of [-1, 1]) {
      H.push(at(GK.blob(0.12, 0.42, 0.1, c.skin, { seed: 222 + s }), -0.08, 0.55, s * 0.17, s * 0.2, 0, -0.15));
      H.push(at(GK.blob(0.06, 0.3, 0.05, '#ff86b6', { seed: 224 + s, lump: 0 }), -0.04, 0.55, s * 0.17, s * 0.2, 0, -0.15));
    }
    H.push(at(GK.blob(0.07, 0.06, 0.06, '#ff86b6', { seed: 226, lump: 0 }), 0.36, -0.02, 0));
    eye(0.25, 0.1, 0.14);
    eye(0.25, 0.1, -0.14);
  } else {
    // Pepper
    H.push(GK.blob(0.38, 0.36, 0.38, c.skin, { seed: 231 }));
    H.push(at(GK.blob(0.16, 0.14, 0.3, c.hair, { seed: 232 }), -0.3, -0.05, 0));
    H.push(at(GK.blob(0.17, 0.14, 0.15, '#efa47f', { seed: 233 }), 0.4, -0.04, 0));
    H.push(at(GK.blob(0.06, 0.07, 0.22, c.hair, { seed: 234 }), 0.35, -0.16, 0));
    H.push(at(GK.blob(0.4, 0.2, 0.4, c.main, { seed: 235 }), -0.02, 0.24, 0));
    H.push(at(GK.blob(0.26, 0.06, 0.3, U.shade(c.main, -0.12), { seed: 236 }), 0.32, 0.17, 0));
    H.push(at(GK.blob(0.09, 0.09, 0.03, '#fffaf0', { seed: 237, lump: 0 }), 0.32, 0.3, 0));
    eye(0.25, 0.08, 0.14, 0.1);
    eye(0.25, 0.08, -0.14, 0.1);
  }
}

function buildWheel(kind) {
  const at = GK.at.bind(GK);
  const P = [];
  const ws = WHEEL_SPECS[kind] || WHEEL_SPECS.standard;
  if (kind === 'button') {
    P.push(at(GK.cyl(ws.r, ws.r, ws.w, '#ffd6a8', { segs: 18, seed: 301, lump: 0.02 }), 0, 0, 0, Math.PI / 2));
    for (const [a, b] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) P.push(at(GK.blob(0.06, 0.06, 0.04, '#6b3d24', { seed: 302, lump: 0 }), a * 0.12, b * 0.12, ws.w / 2));
    P.push(at(GK.torus(ws.r - 0.04, 0.05, '#e8b88a', { seed: 303, lump: 0 }), 0, 0, ws.w / 2));
  } else if (kind === 'monster') {
    P.push(at(GK.torus(ws.r - 0.18, 0.2, '#3b2a3a', { seed: 311, lump: 0.08, freq: 6 }), 0, 0, 0));
    P.push(at(GK.cyl(0.24, 0.24, ws.w * 0.8, '#ffd166', { segs: 10, seed: 312 }), 0, 0, 0, Math.PI / 2));
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU;
      P.push(at(GK.box(0.14, 0.12, ws.w * 0.95, '#2e2030', { seed: 313 + k, lump: 0 }), Math.cos(a) * (ws.r - 0.02), Math.sin(a) * (ws.r - 0.02), 0, 0, 0, a));
    }
  } else if (kind === 'slick') {
    P.push(at(GK.torus(ws.r - 0.07, 0.08, '#2e2030', { seed: 321 }), 0, 0, 0));
    P.push(at(GK.cyl(ws.r - 0.1, ws.r - 0.1, 0.1, '#ffcf40', { segs: 14, seed: 322 }), 0, 0, 0.02, Math.PI / 2));
  } else {
    P.push(at(GK.torus(ws.r - 0.13, 0.14, '#3b2a3a', { seed: 331 }), 0, 0, 0));
    P.push(at(GK.cyl(0.18, 0.18, 0.26, '#e9e9e9', { segs: 10, seed: 332 }), 0, 0, 0.02, Math.PI / 2));
  }
  return GK.merge(P);
}

// Pose a kart model from simulation state. m = KartModels.build() result.
function poseKart(m, k, time, dt) {
  const v = k.vis;
  const g = m.group;
  g.position.set(k.x, k.y, k.z);
  let yaw = -k.head;
  if (k.spinT > 0) yaw -= v.spin;
  if (v.spinTrick > 0) {
    v.spinTrick = Math.max(0, v.spinTrick - dt * 3);
  }
  g.rotation.set(0, yaw, 0);
  // follow the road slope on the ground
  const slope = k.onGround && k.loc ? k.loc.slope * Math.cos(k.head - Math.atan2(k.loc.tz, k.loc.tx)) : 0;
  m.body.rotation.set(v.roll + (k.vis.spinTrick > 0 ? Math.sin(v.spinTrick * Math.PI) * 0.6 : 0), 0, Math.atan(slope) + v.pitch, 'YXZ');
  // squash on landing, flatten when stomped
  const sq = k.squishT > 0 ? 0.45 : 1 + (v.squash || 0) * -1;
  m.body.scale.set(1 + (1 - sq) * 0.35, sq, 1 + (1 - sq) * 0.35);
  m.body.position.y = Math.sin(time * 18) * 0.015 * Math.min(1, Math.abs(k.vf) / 10) + (v.bump || 0) * 0.08;
  // head looks into turns, bobs on the stop-motion beat
  const boil = Math.floor(time * CFG.boilFps);
  m.head.rotation.set(0, -k.steer * 0.35 - (k.drift || 0) * 0.15, (U.hash(boil + k.idx * 31) - 0.5) * 0.05 * CFG.boilAmount);
  m.head.position.y = m.geo.headPos.y + (U.hash(boil * 3 + k.idx) - 0.5) * 0.03 * CFG.boilAmount;
  for (const w of m.wheels) {
    // wheels on the left are mirrored (hub outward), so they spin the other way round
    w.mesh.rotation.z = (-v.wheel / Math.max(0.3, m.geo.wheelR)) * w.side;
    w.holder.rotation.y = w.front ? -k.steer * 0.42 : 0;
  }
  // paint effects: rainbow cycles, star flashes
  if (m.special === 'rainbow') m.paintMat.color.setHSL((time * 0.25) % 1, 0.75, 0.6);
  if (k.starT > 0) {
    const c = m.paintMat.emissive.setHSL((time * 3) % 1, 1, 0.5);
    m.detailMat.emissive.copy(c).multiplyScalar(0.6);
  } else if (m.paintMat.emissive.r || m.paintMat.emissive.g || m.paintMat.emissive.b) {
    m.paintMat.emissive.setRGB(0, 0, 0);
    m.detailMat.emissive.setRGB(0, 0, 0);
  }
  if (m.shadow) {
    const gy = k.loc ? k.track.groundY(k.loc) : -Infinity;
    if (gy === -Infinity || k.falling) m.shadow.visible = false;
    else {
      m.shadow.visible = true;
      m.shadow.position.set(k.x, gy + 0.12, k.z);
      m.shadow.rotation.y = -k.head;
      const h = Math.max(0, k.y - gy);
      const s = 1 / (1 + h * 0.25);
      m.shadow.scale.set(s, 1, s);
      m.shadow.material.opacity = s;
    }
  }
}
