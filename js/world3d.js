'use strict';
// Builds a course in 3D clay: a floating island (or a castle over a lava sea) shaped around the
// roads, road ribbons with curbs and shoulders, hedges / snowbanks / castle walls, rocky skirts
// under every drop, boost pads, ramps and ice, key gates, scenery and the sky.
// Physics never reads any of this: it only uses the track samples, so what you see is built
// to match them.

const ROAD_STYLE = { log: 'wood', cave: 'ice', rainbow: 'rainbow' };

class World3D {
  constructor(track) {
    this.track = track;
    this.def = track.def;
    this.theme = THEMES[this.def.theme];
    this.scene = new THREE.Scene();
    this.anims = [];
    this.disposables = [];
    const th = this.theme;
    this.clayMat = this.keep(Clay3D.material({ vertexColors: true, wobble: 0.045, freq: 1.3 }));
    this.stillMat = this.keep(Clay3D.material({ vertexColors: true, wobble: 0, rim: 0.7 }));
    this.scene.fog = new THREE.Fog(th.fog, 90, 520);
    this.buildLights();
    this.buildSky();
    this.terrainH = null;
    this.buildTerrain();
    this.buildRoads();
    this.buildWalls();
    this.buildZones();
    this.buildVoid();
    this.buildDecor();
    this.buildLandmarks();
    this.buildGates();
  }

  keep(o) {
    this.disposables.push(o);
    return o;
  }
  add(geo, mat, name) {
    const m = new THREE.Mesh(geo, mat || this.stillMat);
    m.name = name || '';
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    this.scene.add(m);
    this.keep(geo);
    return m;
  }

  dispose() {
    disposeScene(this.scene);
    for (const d of this.disposables) if (d && d.dispose) d.dispose();
  }

  // ---------- light & sky ----------
  buildLights() {
    const th = this.theme;
    const hemi = new THREE.HemisphereLight(th.hemiSky, th.hemiGround, 1.05);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(th.sunLight, 1.55);
    sun.position.set(-0.45, 0.8, -0.35).normalize();
    this.scene.add(sun);
    this.sunDir = sun.position.clone();
    this.lights = { hemi, sun };
  }

  buildSky() {
    const th = this.theme;
    const g = new THREE.SphereGeometry(640, 32, 18);
    const cols = new Float32Array(g.attributes.position.count * 3);
    const c0 = new THREE.Color(th.sky[0]), c1 = new THREE.Color(th.sky[1]), c2 = new THREE.Color(th.sky[2]);
    const c = new THREE.Color();
    for (let i = 0; i < g.attributes.position.count; i++) {
      const y = g.attributes.position.getY(i) / 640;
      if (y > 0.15) c.copy(c1).lerp(c0, Math.min(1, (y - 0.15) / 0.6));
      else c.copy(c2).lerp(c1, U.clamp((y + 0.1) / 0.25, 0, 1));
      cols.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const sky = new THREE.Mesh(g, this.keep(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
    sky.renderOrder = -10;
    this.sky = sky;
    this.scene.add(sky);
    // sun (or moon) disc with a soft glow
    const sc = Clay.makeCanvas(128, 128);
    const sg = sc.getContext('2d');
    const grd = sg.createRadialGradient(64, 64, 8, 64, 64, 64);
    grd.addColorStop(0, th.sun);
    grd.addColorStop(0.32, th.sun);
    grd.addColorStop(0.36, U.rgba(th.sun, 0.55));
    grd.addColorStop(1, U.rgba(th.sun, 0));
    sg.fillStyle = grd;
    sg.fillRect(0, 0, 128, 128);
    const stex = this.keep(new THREE.CanvasTexture(sc));
    stex.colorSpace = THREE.SRGBColorSpace;
    const sun = new THREE.Sprite(this.keep(new THREE.SpriteMaterial({ map: stex, fog: false, depthWrite: false, transparent: true })));
    sun.scale.set(180, 180, 1);
    sun.renderOrder = -9;
    this.sunSprite = sun;
    sky.add(sun);
    sun.scale.set(130, 130, 1);
    sun.position.copy(this.sunDir).multiplyScalar(560);
    // distant clay clouds in a ring
    const rnd = U.rng(this.def.id.length * 31 + 7);
    const parts = [];
    const cloudCol = th.voidKind === 'lava' ? '#b48aa8' : th.cloud;
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU + rnd() * 0.2;
      const r = 420 + rnd() * 160;
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r, cy = 30 + rnd() * 150;
      const w = 30 + rnd() * 50;
      for (let k = 0; k < 5; k++) {
        const t = k / 4 - 0.5;
        parts.push(GK.at(GK.blob(w * (0.32 + rnd() * 0.18), w * (0.22 + rnd() * 0.1), w * 0.3, cloudCol, { seed: i * 9 + k, lump: 3, ws: 9, hs: 6 }), cx - Math.sin(a) * t * w * 1.1, cy + Math.sin((k / 4) * Math.PI) * w * 0.12, cz + Math.cos(a) * t * w * 1.1));
      }
    }
    // sky clouds glow a little with the sky's colour so they never go grey in shadow
    const glow = new THREE.Color(th.sky[1]).lerp(new THREE.Color(cloudCol), 0.4);
    const cm = this.keep(Clay3D.material({ vertexColors: true, wobble: 0, fog: false, rim: 0.25, bump: false, emissive: glow, emissiveIntensity: 0.55 }));
    const clouds = new THREE.Mesh(GK.merge(parts), cm);
    this.keep(clouds.geometry);
    sky.add(clouds);
  }

  // Keep the sky centred on whichever camera is drawing.
  follow(camera) {
    this.sky.position.copy(camera.position);
  }

  // ---------- terrain ----------
  buildTerrain() {
    const T = this.track, th = this.theme, b = T.bounds;
    const lava = th.voidKind === 'lava';
    const margin = 80;
    const x0 = b.minX - margin, z0 = b.minZ - margin;
    const cell = 3;
    const nx = Math.ceil((b.maxX + margin - x0) / cell) + 1, nz = Math.ceil((b.maxZ + margin - z0) / cell) + 1;
    // coarse sample cloud for "how far is the nearest road"
    const pts = [];
    for (const p of T.paths) {
      for (let i = 0; i < p.n; i += 2) pts.push({ x: p.x[i], z: p.z[i], y: p.y[i], e: p.hw[i] + p.sh[i], p, i });
    }
    const loop = [];
    for (let i = 0; i < T.main.n; i += 3) loop.push([T.main.x[i], T.main.z[i]]);
    const minY = Math.min(...Array.from(T.main.y));
    const VOID = lava ? -4.5 : minY - 46;
    this.voidY = VOID;
    const H = new Float32Array(nx * nz), K = new Uint8Array(nx * nz); // K: 0 land, 1 void, 2 under road
    const EDGE = new Float32Array(nx * nz);
    const hillAmp = th === THEMES.snow ? 16 : lava ? 3 : 7;
    const loc = {};
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = x0 + i * cell, z = z0 + j * cell, k = j * nx + i;
        const l = T.locate(x, z, null, null, loc);
        if (l && l.excess <= 0.3) {
          const p = l.path;
          const bothDrop = p.wallL[l.i] === 0 && p.wallR[l.i] === 0;
          const gap = T.zoneAt(l, 'gap');
          if (bothDrop || gap) {
            H[k] = VOID;
            K[k] = 1;
          } else {
            H[k] = l.y - 0.7;
            K[k] = 2;
          }
          EDGE[k] = l.excess;
          continue;
        }
        // nearest road (coarse) and a smooth blend of nearby road heights
        let dmin = Infinity, best = null;
        for (const q of pts) {
          const dd = (q.x - x) ** 2 + (q.z - z) ** 2;
          if (dd < dmin) {
            dmin = dd;
            best = q;
          }
        }
        dmin = Math.sqrt(dmin);
        let wy = 0, ws = 0;
        const lim = (dmin + 18) ** 2;
        for (const q of pts) {
          const dd = (q.x - x) ** 2 + (q.z - z) ** 2;
          if (dd > lim) continue;
          const w = 1 / (dd + 20);
          wy += q.y * w;
          ws += w;
        }
        const yNear = wy / ws;
        const edge = dmin - best.e;
        EDGE[k] = edge;
        // which side of that road are we on, and is it a drop?
        const p = best.p, si = best.i;
        const side = (x - p.x[si]) * p.nx[si] + (z - p.z[si]) * p.nz[si] > 0 ? 1 : -1;
        const flag = side > 0 ? p.wallR[si] : p.wallL[si];
        const inLoop = pointInPoly(x, z, loop);
        const rim = (inLoop ? 999 : 30) + fbm2(x * 0.02 + 3, z * 0.02) * 26;
        let isVoid = false;
        if (flag === 0 && edge < 26 + fbm2(x * 0.05, z * 0.05) * 10) isVoid = true;
        if (edge > rim) isVoid = true;
        if (isVoid) {
          H[k] = VOID;
          K[k] = 1;
          continue;
        }
        const hill = fbm2(x * 0.018, z * 0.018) * hillAmp * U.clamp((edge - 3) / 40, 0, 1);
        const lump = (noise3(x * 0.2, 1.3, z * 0.2) - 0.5) * 0.8;
        H[k] = yNear - 0.45 + Math.max(0, hill) + lump * U.clamp(edge / 6, 0, 1);
        K[k] = 0;
      }
    }
    // shape the void edges into cliffs: void cells next to land drop a little less (lip),
    // and lava shores slope into the lava
    this.terrain = { x0, z0, cell, nx, nz, H, K };
    const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2);
    const cGrass = new THREE.Color(th.grass), cGrass2 = new THREE.Color(th.grass2), cDirt = new THREE.Color(th.dirt), cRock = new THREE.Color(th.rock);
    const c = new THREE.Color();
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const x = x0 + i * cell, z = z0 + j * cell;
        let h = H[k];
        if (K[k] === 1) {
          // void vertex beside land: a cliff lip just below the edge
          let nearLand = 0, sum = 0;
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const ii = i + di, jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
            const kk = jj * nx + ii;
            if (K[kk] !== 1) {
              nearLand++;
              sum += H[kk];
            }
          }
          if (nearLand && !lava) h = sum / nearLand - 9 - noise3(x * 0.3, 0, z * 0.3) * 6;
          else if (nearLand && lava) h = VOID;
        }
        pos[k * 3] = x + (noise3(x * 0.4, 7, z * 0.4) - 0.5) * (K[k] === 1 ? 2.2 : 0.6);
        pos[k * 3 + 1] = h;
        pos[k * 3 + 2] = z + (noise3(x * 0.4, 9, z * 0.4) - 0.5) * (K[k] === 1 ? 2.2 : 0.6);
        uv[k * 2] = x / 9;
        uv[k * 2 + 1] = z / 9;
        // colour
        if (K[k] === 1) c.copy(cRock).multiplyScalar(lava ? 0.55 : 0.82);
        else if (K[k] === 2) c.copy(cDirt).multiplyScalar(0.8);
        else {
          const n = noise3(x * 0.07, 3, z * 0.07);
          c.copy(cGrass).lerp(cGrass2, U.clamp((n - 0.35) * 2.5, 0, 1));
          if (EDGE[k] < 2.5) c.lerp(cDirt, 0.35);
          // tree shade blobs get added later by decor; rocky high ground
          if (th === THEMES.snow && H[k] > 18) c.lerp(new THREE.Color('#ffffff'), 0.5);
        }
        col[k * 3] = c.r;
        col[k * 3 + 1] = c.g;
        col[k * 3 + 2] = c.b;
      }
    }
    const idx = [];
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b2 = a + 1, c2 = a + nx, d = c2 + 1;
        if (K[a] === 1 && K[b2] === 1 && K[c2] === 1 && K[d] === 1) continue;
        idx.push(a, c2, b2, b2, c2, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // steep faces read as rock
    const nor = geo.attributes.normal;
    for (let k = 0; k < nx * nz; k++) {
      const steep = 1 - nor.getY(k);
      if (steep > 0.35 && K[k] !== 2) {
        const t = U.clamp((steep - 0.35) * 2, 0, 1);
        col[k * 3] = U.lerp(col[k * 3], cRock.r, t);
        col[k * 3 + 1] = U.lerp(col[k * 3 + 1], cRock.g, t);
        col[k * 3 + 2] = U.lerp(col[k * 3 + 2], cRock.b, t);
      }
    }
    this.terrainMesh = this.add(geo, this.stillMat, 'terrain');
  }

  heightAt(x, z) {
    const t = this.terrain;
    const i = Math.round((x - t.x0) / t.cell), j = Math.round((z - t.z0) / t.cell);
    if (i < 0 || j < 0 || i >= t.nx || j >= t.nz) return null;
    const k = j * t.nx + i;
    return t.K[k] === 1 ? null : t.H[k];
  }
  landKind(x, z) {
    const t = this.terrain;
    const i = Math.round((x - t.x0) / t.cell), j = Math.round((z - t.z0) / t.cell);
    if (i < 0 || j < 0 || i >= t.nx || j >= t.nz) return 1;
    return t.K[j * t.nx + i];
  }

  // ---------- roads ----------
  roadTexture(style) {
    const th = this.theme;
    const c = Clay.makeCanvas(128, 256);
    const g = c.getContext('2d');
    if (style === 'rainbow') {
      const cols = ['#ff6f91', '#ffb347', '#ffe066', '#7ddc6f', '#58b4ff', '#b48cff'];
      cols.forEach((col, i) => {
        g.fillStyle = col;
        g.fillRect((i * 128) / cols.length, 0, 128 / cols.length + 1, 256);
      });
      g.fillStyle = 'rgba(255,255,255,0.35)';
      for (let y = 0; y < 256; y += 32) g.fillRect(0, y, 128, 3);
    } else if (style === 'wood') {
      g.fillStyle = '#b07a4f';
      g.fillRect(0, 0, 128, 256);
      for (let y = 0; y < 256; y += 32) {
        g.fillStyle = y % 64 ? '#a46f45' : '#bb8659';
        g.fillRect(0, y + 2, 128, 28);
        g.fillStyle = 'rgba(70,40,30,0.4)';
        g.fillRect(0, y, 128, 2);
        g.fillStyle = 'rgba(70,40,30,0.5)';
        for (const x of [10, 118]) g.fillRect(x, y + 13, 3, 3);
      }
    } else if (style === 'ice') {
      g.fillStyle = '#cfe8ff';
      g.fillRect(0, 0, 128, 256);
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = 1.5;
      const rnd = U.rng(5);
      for (let k = 0; k < 14; k++) {
        g.beginPath();
        let x = rnd() * 128, y = rnd() * 256;
        g.moveTo(x, y);
        for (let s = 0; s < 4; s++) {
          x += (rnd() - 0.5) * 40;
          y += (rnd() - 0.5) * 40;
          g.lineTo(x, y);
        }
        g.stroke();
      }
    } else {
      g.fillStyle = th.road;
      g.fillRect(0, 0, 128, 256);
      // soft clay smears
      const rnd = U.rng(11);
      for (let k = 0; k < 40; k++) {
        g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)';
        g.beginPath();
        g.ellipse(rnd() * 128, rnd() * 256, 6 + rnd() * 14, 3 + rnd() * 6, rnd() * 3, 0, TAU);
        g.fill();
      }
      g.fillStyle = th.roadLine;
      g.globalAlpha = 0.9;
      Clay.rrect(g, 60, 20, 8, 88, 4);
      g.fill();
      Clay.rrect(g, 60, 148, 8, 88, 4);
      g.fill();
      g.globalAlpha = 0.6;
      g.fillRect(5, 0, 4, 256);
      g.fillRect(119, 0, 4, 256);
      g.globalAlpha = 1;
    }
    const t = this.keep(new THREE.CanvasTexture(c));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }

  // A ribbon along a path between lateral offsets dA..dB (functions of sample index), lifted by lift.
  ribbon(p, dA, dB, lift, o = {}) {
    const verts = [], uvs = [], cols = [], idx = [];
    const across = o.across || 2;
    const T = this.track;
    const col = o.color ? new THREE.Color(o.color) : null;
    let row = 0;
    const tmpLoc = { path: p, onRoad: true, excess: -1 };
    const end = p.closed ? p.n : p.n - 1;
    let prevOk = false;
    for (let i = 0; i <= end; i++) {
      const ii = p.wrap(i);
      const s = i * p.step;
      tmpLoc.s = s;
      tmpLoc.d = 0;
      const skip = o.skipGaps && p.zones.some((z) => z.kind === 'gap' && s > z.s0 && s < z.s1);
      if (o.only && !o.only(ii)) {
        prevOk = false;
        continue;
      }
      if (skip) {
        prevOk = false;
        continue;
      }
      const a = dA(ii), b = dB(ii);
      for (let k = 0; k <= across; k++) {
        const t = k / across;
        const d = a + (b - a) * t;
        verts.push(p.x[ii] + p.nx[ii] * d, p.y[ii] + lift + (o.crown ? (1 - (2 * t - 1) ** 2) * o.crown : 0), p.z[ii] + p.nz[ii] * d);
        uvs.push(o.uAcross ? t : d / 4, s / (o.vScale || 12));
        if (col) {
          const v = (U.hash2(i, k, 3) - 0.5) * 0.06;
          cols.push(col.r + v, col.g + v, col.b + v);
        } else cols.push(1, 1, 1);
      }
      if (prevOk) {
        // counter-clockwise seen from above when dA < dB (left to right)
        const r0 = (row - 1) * (across + 1), r1 = row * (across + 1);
        for (let k = 0; k < across; k++) idx.push(r0 + k, r0 + k + 1, r1 + k, r0 + k + 1, r1 + k + 1, r1 + k);
      }
      prevOk = true;
      row++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  buildRoads() {
    const T = this.track, th = this.theme;
    const shoulderMat = this.keep(Clay3D.material({ vertexColors: true, wobble: 0, rim: 0.3 }));
    for (const p of T.paths) {
      const style = p.branch ? ROAD_STYLE[p.id] || 'road' : 'road';
      const tex = this.roadTexture(style);
      const mat = this.keep(Clay3D.material({ map: tex, wobble: 0, rim: 0.25, bumpScale: 0.3, rough: style === 'ice' ? 0.35 : 0.8 }));
      const main = !p.branch;
      const lift = main ? 0.07 : 0.05;
      this.add(this.ribbon(p, (i) => -p.hw[i], (i) => p.hw[i], lift, { across: 4, uAcross: true, skipGaps: true, crown: 0.04, vScale: style === 'rainbow' ? 6 : 12 }), mat, 'road-' + p.id);
      // shoulders
      const shCol = style === 'rainbow' ? '#fff3c4' : style === 'wood' ? th.dirt : th.shoulder;
      for (const side of [-1, 1]) {
        const inner = (i) => side * (p.hw[i] + (main ? 0.8 : 0)), outer = (i) => side * (p.hw[i] + p.sh[i]);
        const g = this.ribbon(p, side < 0 ? outer : inner, side < 0 ? inner : outer, main ? 0.03 : 0.015, { across: 2, skipGaps: true, color: shCol, vScale: 8 });
        this.add(g, shoulderMat, 'shoulder');
      }
      if (main) this.buildCurbs(p);
      if (style === 'rainbow') this.buildRainbowUnderside(p);
    }
  }

  // Red-and-white (or theme) clay curbs along the main road's edges.
  buildCurbs(p) {
    const th = this.theme;
    const parts = [];
    const ca = new THREE.Color(th.curb[0]), cb = new THREE.Color(th.curb[1]);
    for (const side of [-1, 1]) {
      const verts = [], cols = [], idx = [];
      let row = 0, prev = false;
      for (let i = 0; i <= p.n; i++) {
        const ii = p.wrap(i);
        const s = i * p.step;
        if (p.zones.some((z) => z.kind === 'gap' && s > z.s0 && s < z.s1)) {
          prev = false;
          continue;
        }
        const d0 = side * p.hw[ii], d1 = side * (p.hw[ii] + 0.85);
        const stripe = Math.floor(s / 2.2) % 2 ? ca : cb;
        for (const [d, h] of [[d0, 0.05], [(d0 + d1) / 2, 0.16], [d1, 0.05]]) {
          verts.push(p.x[ii] + p.nx[ii] * d, p.y[ii] + h, p.z[ii] + p.nz[ii] * d);
          cols.push(stripe.r, stripe.g, stripe.b);
        }
        if (prev) {
          const r0 = (row - 1) * 3, r1 = row * 3;
          for (let k = 0; k < 2; k++) {
            if (side > 0) idx.push(r0 + k, r0 + k + 1, r1 + k, r0 + k + 1, r1 + k + 1, r1 + k);
            else idx.push(r0 + k, r1 + k, r0 + k + 1, r0 + k + 1, r1 + k, r1 + k + 1);
          }
        }
        prev = true;
        row++;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((verts.length / 3) * 2).fill(0), 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      parts.push(g);
    }
    this.add(GK.merge(parts), this.stillMat, 'curbs');
  }

  buildRainbowUnderside(p) {
    const g = this.ribbon(p, (i) => p.hw[i] + p.sh[i], (i) => -p.hw[i] - p.sh[i], -0.5, { across: 2, color: '#b48cff' });
    this.add(g, this.stillMat, 'rainbow-under');
    // glowing side bands
    for (const side of [-1, 1]) {
      const e = (i) => side * (p.hw[i] + p.sh[i]);
      const band = this.ribbon(p, e, e, 0, { across: 1, color: '#fff3c4' });
      // turn the zero-width ribbon into a vertical band
      const pos = band.attributes.position;
      for (let v = 0; v < pos.count; v++) if (v % 2) pos.setY(v, pos.getY(v) - 0.6);
      band.computeVertexNormals();
      const m = this.add(band, this.keep(new THREE.MeshBasicMaterial({ color: '#ffe8a8', side: THREE.DoubleSide })), 'rainbow-band');
      m.material.fog = true;
    }
  }

  // ---------- walls & skirts ----------
  wallProfile(style) {
    // [outward offset from the edge, height]
    if (style === 'hedge') return [[-0.2, -0.3], [-0.25, 0.6], [0.1, 1.2], [0.8, 1.45], [1.5, 1.2], [1.9, 0.5], [2, -0.3]];
    if (style === 'snow') return [[-0.2, -0.3], [-0.1, 0.6], [0.5, 1.1], [1.3, 1.2], [2.1, 0.7], [2.5, -0.3]];
    if (style === 'castle') return [[-0.1, -0.3], [-0.1, 1.7], [1.0, 1.7], [1.0, -0.3]];
    if (style === 'rail') return [[-0.1, 0.45], [-0.12, 0.75], [0.14, 0.75], [0.12, 0.45]];
    return [[0, 0], [0, 1], [1, 1], [1, 0]];
  }

  buildWalls() {
    const T = this.track, th = this.theme;
    const parts = [], skirts = [], posts = [];
    const themeStyle = this.def.theme === 'meadow' ? 'hedge' : this.def.theme === 'snow' ? 'snow' : 'castle';
    for (const p of T.paths) {
      const rainbow = ROAD_STYLE[p.id] === 'rainbow';
      for (const side of [-1, 1]) {
        const flags = side > 0 ? p.wallR : p.wallL;
        const style = rainbow ? 'rail' : themeStyle;
        const wallCol = rainbow ? '#ffffff' : th.wall;
        // runs of identical flags; each run reaches one sample into the next so they meet
        const n = p.n;
        const flush = (from, to, flag) => {
          if (to - from < 1) return;
          if (flag === 1) parts.push(this.extrude(p, from, to, side, this.wallProfile(style), wallCol, style));
          if (flag === 1 && style === 'castle') this.crenellate(p, from, to, side, parts);
          if (flag === 1 && style === 'rail') this.railPosts(p, from, to, side, posts);
          if (flag === 0 && !rainbow) skirts.push(this.extrude(p, from, to, side, [[0, 0.02], [0.4, -2.5], [-0.6, -7.5], [-2.5, -10]], th.rock, 'skirt'));
        };
        for (let i = 0; i < n; ) {
          const f = flags[i];
          let j = i;
          while (j + 1 < n && flags[j + 1] === f) j++;
          flush(i, p.closed || j + 1 < n ? j + 1 : j, f);
          i = j + 1;
        }
      }
    }
    if (parts.length) this.add(GK.merge(parts), this.clayMat, 'walls');
    if (posts.length) this.add(GK.merge(posts), this.stillMat, 'rail-posts');
    if (skirts.length) this.add(GK.merge(skirts), this.stillMat, 'skirts');
  }

  extrude(p, from, to, side, prof, color, style) {
    const ids = [];
    for (let i = from; i <= to; i++) ids.push(p.wrap(i));
    return this.extrudeIdx(p, ids, side, prof, color, style);
  }
  extrudeIdx(p, ids, side, prof, color, style) {
    const verts = [], cols = [], uvs = [], idx = [];
    const base = new THREE.Color(color);
    const m = prof.length;
    ids.forEach((i, r) => {
      const e = p.hw[i] + p.sh[i];
      for (let k = 0; k < m; k++) {
        const [off, h] = prof[k];
        const wob = style === 'skirt' ? (noise3(p.x[i] * 0.3, k, p.z[i] * 0.3) - 0.5) * 1.6 : (noise3(p.x[i] * 0.5, k * 3, p.z[i] * 0.5) - 0.5) * 0.25;
        const d = side * (e + off + wob);
        verts.push(p.x[i] + p.nx[i] * d, p.y[i] + h + (style === 'skirt' ? wob : wob * 0.6), p.z[i] + p.nz[i] * d);
        let v = (U.hash2(i, k, 9) - 0.5) * 0.08;
        if (style === 'rail') {
          const stripe = Math.floor(p.s[i] / 1.5) % 2;
          const c = stripe ? new THREE.Color('#ff6f91') : base;
          cols.push(c.r, c.g, c.b);
        } else {
          if (style === 'castle' && Math.floor(p.s[i] / 2.4 + (k > 1 ? 0.5 : 0)) % 2) v -= 0.06;
          if (style === 'skirt') v -= (k / m) * 0.25;
          cols.push(base.r + v, base.g + v, base.b + v);
        }
        uvs.push(p.s[i] / 4, k / (m - 1));
      }
      if (r > 0) {
        const r0 = (r - 1) * m, r1 = r * m;
        for (let k = 0; k < m - 1; k++) {
          if (side > 0) idx.push(r0 + k, r0 + k + 1, r1 + k, r0 + k + 1, r1 + k + 1, r1 + k);
          else idx.push(r0 + k, r1 + k, r0 + k + 1, r0 + k + 1, r1 + k, r1 + k + 1);
        }
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  crenellate(p, from, to, side, out) {
    const th = this.theme;
    for (let i = from; i <= to; i += 4) {
      const ii = p.wrap(i);
      const d = side * (p.hw[ii] + p.sh[ii] + 0.45);
      out.push(GK.at(GK.box(1.3, 0.7, 0.9, th.wallTop, { seed: i, lump: 0.05, seg: 2, r: 0.14 }), p.x[ii] + p.nx[ii] * d, p.y[ii] + 1.95, p.z[ii] + p.nz[ii] * d, 0, -p.head[ii], 0));
    }
  }
  railPosts(p, from, to, side, out) {
    for (let i = from; i <= to; i += 4) {
      const ii = p.wrap(i);
      const d = side * (p.hw[ii] + p.sh[ii]);
      out.push(GK.at(GK.cyl(0.12, 0.14, 1.4, '#fff3c4', { segs: 8, lump: 0.01 }), p.x[ii] + p.nx[ii] * d, p.y[ii] + 0.1, p.z[ii] + p.nz[ii] * d));
    }
  }

  // ---------- boost pads, ice, mud, ramps, start line ----------
  buildZones() {
    const T = this.track;
    const padTex = this.chevronTexture();
    this.padTex = padTex;
    const padMat = this.keep(new THREE.MeshStandardMaterial({ map: padTex, emissive: 0xff9a3c, emissiveIntensity: 0.55, emissiveMap: padTex, roughness: 0.5, transparent: true }));
    const iceMat = this.keep(Clay3D.material({ color: 0xd9f0ff, rough: 0.25, wobble: 0, transparent: true, opacity: 0.78, rim: 0.2 }));
    const mudMat = this.keep(Clay3D.material({ color: 0x7a4b30, rough: 0.9, wobble: 0.04, rim: 0.4 }));
    const ramps = [];
    for (const p of T.paths) {
      for (const z of p.zones) {
        if (z.kind === 'gap') continue;
        const i0 = p.indexAt(z.s0), i1 = p.indexAt(z.s1);
        const only = (i) => {
          const s = p.s[i];
          return s >= z.s0 - 0.01 && s <= z.s1 + 0.01;
        };
        const dA = (i) => Math.max(z.d0, -p.hw[i] - p.sh[i]), dB = (i) => Math.min(z.d1, p.hw[i] + p.sh[i]);
        if (z.kind === 'boost') {
          const g = this.ribbon(p, dA, dB, 0.1, { across: 1, uAcross: true, only, vScale: 3 });
          // v runs along the pad: re-base so chevrons point forward
          const uv = g.attributes.uv;
          for (let v = 0; v < uv.count; v++) uv.setY(v, -uv.getY(v));
          this.add(g, padMat, 'boost');
        } else if (z.kind === 'ice') {
          this.add(this.ribbon(p, dA, dB, 0.09, { across: 4, only, vScale: 6 }), iceMat, 'ice');
        } else if (z.kind === 'mud') {
          this.add(this.ribbon(p, dA, dB, 0.1, { across: 3, only, crown: 0.12 }), mudMat, 'mud');
        } else if (z.kind === 'ramp') {
          ramps.push(this.rampGeo(p, z, i0, i1));
        }
      }
    }
    if (ramps.length) this.add(GK.merge(ramps), this.stillMat, 'ramps');
    // start / finish checker
    const p = T.main;
    const chk = this.checkerTexture();
    const lineMat = this.keep(Clay3D.material({ map: chk, wobble: 0, rim: 0.2 }));
    this.add(this.ribbon(p, (i) => -p.hw[i], (i) => p.hw[i], 0.1, { across: 1, uAcross: true, only: (i) => p.s[i] <= 2.5 }), lineMat, 'startline');
  }

  rampGeo(p, z, i0, i1) {
    const parts = [];
    const cA = new THREE.Color('#58b4ff'), cB = new THREE.Color('#fff6ea');
    const verts = [], cols = [], idx = [];
    const ids = [];
    for (let i = i0; i <= i1; i++) ids.push(p.wrap(i));
    ids.forEach((i, r) => {
      const t = (p.s[i] - z.s0) / (z.s1 - z.s0);
      const h = z.h * U.clamp(t, 0, 1) + 0.08;
      const a = Math.max(z.d0, -p.hw[i] - p.sh[i]), b = Math.min(z.d1, p.hw[i] + p.sh[i]);
      const stripe = Math.floor(p.s[i] / 1.4) % 2 ? cA : cB;
      // top-left, top-right, bottom-right, bottom-left
      for (const [d, y] of [[a, h], [b, h], [b, 0], [a, 0]]) {
        verts.push(p.x[i] + p.nx[i] * d, p.y[i] + y, p.z[i] + p.nz[i] * d);
        cols.push(stripe.r, stripe.g, stripe.b);
      }
      if (r > 0) {
        const r0 = (r - 1) * 4, r1 = r * 4;
        idx.push(r0, r0 + 1, r1, r0 + 1, r1 + 1, r1); // top
        idx.push(r0 + 1, r0 + 2, r1 + 1, r0 + 2, r1 + 2, r1 + 1); // right side
        idx.push(r0 + 3, r0, r1 + 3, r0, r1, r1 + 3); // left side
      }
    });
    // lip face
    const r = (ids.length - 1) * 4;
    idx.push(r, r + 1, r + 3, r + 1, r + 2, r + 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((verts.length / 3) * 2).fill(0), 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    parts.push(g);
    return GK.merge(parts);
  }

  chevronTexture() {
    const c = Clay.makeCanvas(64, 64);
    const g = c.getContext('2d');
    g.fillStyle = '#ff8a3d';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#ffe066';
    g.beginPath();
    g.moveTo(8, 50);
    g.lineTo(32, 18);
    g.lineTo(56, 50);
    g.lineTo(44, 50);
    g.lineTo(32, 34);
    g.lineTo(20, 50);
    g.closePath();
    g.fill();
    const t = this.keep(new THREE.CanvasTexture(c));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  checkerTexture() {
    const c = Clay.makeCanvas(128, 32);
    const g = c.getContext('2d');
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 8; x++) {
        g.fillStyle = (x + y) % 2 ? '#2b1838' : '#fff6ea';
        g.fillRect(x * 16, y * 16, 16, 16);
      }
    }
    const t = this.keep(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // ---------- below the world ----------
  buildVoid() {
    const th = this.theme, b = this.track.bounds;
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    if (th.voidKind === 'lava') {
      const c = Clay.makeCanvas(128, 128);
      const g = c.getContext('2d');
      g.fillStyle = th.lava;
      g.fillRect(0, 0, 128, 128);
      const rnd = U.rng(3);
      for (let k = 0; k < 30; k++) {
        g.fillStyle = rnd() < 0.5 ? th.lavaHot : '#e2482d';
        g.beginPath();
        g.ellipse(rnd() * 128, rnd() * 128, 4 + rnd() * 12, 2 + rnd() * 6, rnd() * 3, 0, TAU);
        g.fill();
      }
      const t = this.keep(new THREE.CanvasTexture(c));
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(60, 60);
      t.colorSpace = THREE.SRGBColorSpace;
      const mat = this.keep(new THREE.MeshBasicMaterial({ map: t, fog: true }));
      const geo = new THREE.PlaneGeometry(2400, 2400, 1, 1);
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(cx, -2.6, cz);
      this.scene.add(m);
      this.keep(geo);
      this.lavaTex = t;
      this.anims.push((time) => {
        t.offset.set(Math.sin(time * 0.05) * 0.2, time * 0.012);
      });
    } else {
      // a sea of clay clouds far below
      const rnd = U.rng(42);
      const parts = [];
      const y0 = this.voidY + 6;
      GK.detail = 0.7;
      for (let k = 0; k < 110; k++) {
        const a = rnd() * TAU, r = Math.sqrt(rnd()) * 480;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        const s = 18 + rnd() * 30;
        parts.push(GK.at(GK.blob(s, s * 0.32, s * 0.8, rnd() < 0.5 ? th.cloud : th.cloudShade, { seed: k, lump: 3, ws: 10, hs: 7 }), x, y0 + rnd() * 6, z));
      }
      GK.detail = 1;
      this.addChunked(parts, this.keep(Clay3D.material({ vertexColors: true, wobble: 0.8, freq: 0.08, rim: 0.5 })), 'cloudsea');
      // a flat floor so nothing shows through the gaps
      const geo = new THREE.PlaneGeometry(3000, 3000);
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, this.keep(new THREE.MeshBasicMaterial({ color: th.cloudShade, fog: true })));
      m.position.set(cx, y0 - 4, cz);
      this.scene.add(m);
      this.keep(geo);
    }
  }

  // ---------- scenery ----------
  buildDecor() {
    const T = this.track, th = this.theme, t = this.terrain;
    const rnd = U.rng(this.def.id.charCodeAt(0) * 101);
    const parts = [];
    const count = this.def.theme === 'lava' ? 180 : this.def.theme === 'snow' ? 300 : 380;
    GK.detail = 0.5;
    const loc = {};
    let placed = 0;
    for (let tries = 0; tries < count * 6 && placed < count; tries++) {
      const x = t.x0 + rnd() * (t.nx - 1) * t.cell, z = t.z0 + rnd() * (t.nz - 1) * t.cell;
      if (this.landKind(x, z) !== 0) continue;
      const h = this.heightAt(x, z);
      if (h === null) continue;
      const l = T.locate(x, z, null, null, loc);
      if (l && l.excess < 3.5) continue;
      // keep the outer edges of the island from getting cluttered
      const ok = [[3, 0], [-3, 0], [0, 3], [0, -3]].every(([dx, dz]) => this.landKind(x + dx, z + dz) === 0);
      if (!ok) continue;
      const kind = th.decor[Math.floor(rnd() * th.decor.length)];
      const g = this.decorPiece(kind, rnd, placed);
      if (!g) continue;
      parts.push(GK.at(g, x, h, z, 0, rnd() * TAU, 0));
      placed++;
    }
    GK.detail = 1;
    this.addChunked(parts, this.clayMat, 'decor');
  }

  // Merge pieces into one mesh per 70-unit cell, so cells behind the camera are culled.
  addChunked(parts, mat, name) {
    const cells = new Map();
    for (const g of parts) {
      g.computeBoundingSphere();
      const c = g.boundingSphere.center;
      const key = Math.floor(c.x / 70) + ',' + Math.floor(c.z / 70);
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(g);
    }
    this.chunks = this.chunks || [];
    for (const list of cells.values()) {
      const m = this.add(GK.merge(list), mat, name);
      m.geometry.computeBoundingSphere();
      this.chunks.push({ mesh: m, c: m.geometry.boundingSphere.center, r: m.geometry.boundingSphere.radius });
    }
  }

  // Hide scenery chunks deep in the haze (they would be fogged out anyway).
  cullFor(camera, maxDist) {
    if (!this.chunks) return;
    const p = camera.position;
    for (const ch of this.chunks) {
      const d = Math.hypot(ch.c.x - p.x, ch.c.z - p.z) - ch.r;
      ch.mesh.visible = d < maxDist;
    }
  }

  decorPiece(kind, rnd, seed) {
    const th = this.theme;
    const s = 0.8 + rnd() * 0.7;
    const P = [];
    if (kind === 'tree') {
      P.push(GK.at(GK.cyl(0.35 * s, 0.5 * s, 3 * s, '#8a5a3c', { seed }), 0, 1.4 * s, 0));
      const leaf = rnd() < 0.5 ? th.grass2 : U.shade(th.grass, -0.05);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU;
        P.push(GK.at(GK.blob(1.4 * s, 1.2 * s, 1.4 * s, leaf, { seed: seed * 7 + k }), Math.cos(a) * 0.9 * s, 3.6 * s + (k % 2) * 0.5 * s, Math.sin(a) * 0.9 * s));
      }
      P.push(GK.at(GK.blob(1.5 * s, 1.3 * s, 1.5 * s, U.shade(leaf, 0.08), { seed: seed * 7 + 9 }), 0, 4.6 * s, 0));
    } else if (kind === 'flower') {
      const col = ['#ff6f91', '#ffd166', '#c77dff', '#ffffff', '#ff9f6b'][Math.floor(rnd() * 5)];
      for (let k = 0; k < 3; k++) {
        const ox = (rnd() - 0.5) * 2, oz = (rnd() - 0.5) * 2;
        P.push(GK.at(GK.cyl(0.06, 0.06, 0.8, '#4f9a45', { segs: 5, lump: 0 }), ox, 0.4, oz));
        P.push(GK.at(GK.blob(0.35, 0.22, 0.35, col, { seed: seed + k, ws: 8, hs: 6 }), ox, 0.85, oz));
        P.push(GK.at(GK.blob(0.13, 0.1, 0.13, '#ffe066', { seed: seed + k + 5, ws: 6, hs: 5, lump: 0 }), ox, 0.95, oz));
      }
    } else if (kind === 'bush') {
      for (let k = 0; k < 3; k++) P.push(GK.at(GK.blob(1.1 * s, 0.8 * s, 1 * s, th.grass2, { seed: seed * 3 + k }), (k - 1) * 0.9 * s, 0.5 * s, (rnd() - 0.5) * 0.6));
    } else if (kind === 'shroom') {
      const cap = rnd() < 0.6 ? '#e8483f' : '#4fbf5a';
      P.push(GK.at(GK.cyl(0.35 * s, 0.45 * s, 1.2 * s, '#fff1d6', { seed }), 0, 0.55 * s, 0));
      P.push(GK.at(GK.blob(1.1 * s, 0.7 * s, 1.1 * s, cap, { seed: seed + 1 }), 0, 1.35 * s, 0));
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU + 0.4;
        P.push(GK.at(GK.blob(0.22 * s, 0.12 * s, 0.22 * s, '#ffffff', { seed: seed + k + 3, ws: 6, hs: 5, lump: 0 }), Math.cos(a) * 0.65 * s, 1.75 * s, Math.sin(a) * 0.65 * s));
      }
    } else if (kind === 'rock') {
      P.push(GK.at(GK.blob(1.2 * s, 0.8 * s, 1 * s, '#b9adc0', { seed }), 0, 0.3, 0));
    } else if (kind === 'pine') {
      P.push(GK.at(GK.cyl(0.3 * s, 0.4 * s, 1.6 * s, '#6b4a3a', { seed }), 0, 0.8 * s, 0));
      for (let k = 0; k < 3; k++) {
        const r = (1.9 - k * 0.5) * s, h = 2.2 * s;
        P.push(GK.at(GK.cone(r, h, '#3f8a6a', { seed: seed + k }), 0, 2 * s + k * 1.3 * s, 0));
        P.push(GK.at(GK.cone(r * 0.75, h * 0.45, '#ffffff', { seed: seed + k + 9 }), 0, 2 * s + k * 1.3 * s + h * 0.32, 0));
      }
    } else if (kind === 'snowrock') {
      P.push(GK.at(GK.blob(1.4 * s, 0.9 * s, 1.1 * s, '#8c8fae', { seed }), 0, 0.3, 0));
      P.push(GK.at(GK.blob(1.2 * s, 0.4 * s, 0.9 * s, '#ffffff', { seed: seed + 1 }), 0, 0.95 * s, 0));
    } else if (kind === 'snowbush') {
      for (let k = 0; k < 3; k++) P.push(GK.at(GK.blob(0.9 * s, 0.7 * s, 0.9 * s, '#f4f8ff', { seed: seed * 3 + k }), (k - 1) * 0.8 * s, 0.4 * s, 0));
    } else if (kind === 'crystal') {
      const col = rnd() < 0.5 ? '#c77dff' : '#ff8fb1';
      for (let k = 0; k < 3; k++) {
        const g = GK.cone(0.5 * s, 2.6 * s * (1 - k * 0.2), col, { segs: 5, seed: seed + k, lump: 0.05 });
        P.push(GK.at(g, (k - 1) * 0.5, 1.1 * s, (rnd() - 0.5) * 0.6, (rnd() - 0.5) * 0.5, 0, (k - 1) * 0.35));
      }
    } else if (kind === 'basalt') {
      for (let k = 0; k < 4; k++) {
        const h = (1 + rnd() * 2.5) * s;
        P.push(GK.at(GK.cyl(0.6 * s, 0.65 * s, h, '#3d2f48', { segs: 6, seed: seed + k, lump: 0.05 }), (k % 2) * 1.1 * s - 0.5, h / 2 - 0.2, Math.floor(k / 2) * 1.0 * s - 0.5));
      }
    } else if (kind === 'brazier') {
      P.push(GK.at(GK.cyl(0.25, 0.35, 1.6, '#3d2f48', { seed }), 0, 0.8, 0));
      P.push(GK.at(GK.cyl(0.8, 0.4, 0.5, '#6b5f86', { seed: seed + 1 }), 0, 1.75, 0));
      P.push(GK.at(GK.blob(0.6, 0.8, 0.6, '#ff8a3d', { seed: seed + 2 }), 0, 2.3, 0));
      P.push(GK.at(GK.blob(0.35, 0.5, 0.35, '#ffd166', { seed: seed + 3 }), 0, 2.5, 0));
    }
    return P.length ? GK.merge(P) : null;
  }

  // ---------- landmarks ----------
  buildLandmarks() {
    const T = this.track;
    const parts = [];
    for (const lm of this.def.landmarks || []) {
      if (lm.path) {
        this.pathLandmark(lm, parts);
        continue;
      }
      const w = T.where(lm);
      const pt = w.path.point(w.s, lm.d || 0);
      const ground = lm.d ? this.heightAt(pt.x, pt.z) : pt.y;
      const y = ground === null ? pt.y : ground;
      const make = LANDMARKS[lm.kind];
      if (!make) continue;
      make.call(this, lm, pt.x, y, pt.z, pt.head, parts);
    }
    this.addChunked(parts, this.clayMat, 'landmarks');
  }

  pathLandmark(lm, parts) {
    const p = this.track.byId[lm.path];
    if (!p) return;
    const gate = p.gate ? p.gate.i : 0;
    if (lm.kind === 'log' || lm.kind === 'cave') {
      // a hollow log (or an ice cave) arching over the middle of the route
      const col = lm.kind === 'log' ? '#8a5a3c' : '#bfe3ff';
      const inner = lm.kind === 'log' ? '#c99a6a' : '#e8f6ff';
      const i0 = gate + 18, i1 = p.n - 22;
      const prof = [];
      for (let k = 0; k <= 10; k++) {
        const a = (k / 10) * Math.PI;
        prof.push([Math.cos(a), Math.sin(a)]);
      }
      const verts = [], cols = [], idx = [];
      const m = prof.length * 2;
      const cIn = new THREE.Color(inner), cOut = new THREE.Color(col);
      let r = 0;
      for (let i = i0; i <= i1; i++) {
        const R = p.hw[i] + p.sh[i] + 0.6, Hh = lm.kind === 'log' ? R * 0.9 : R * 0.85;
        const wob = (noise3(p.x[i] * 0.2, 1, p.z[i] * 0.2) - 0.5) * 0.6;
        for (const [ca, sa] of prof) {
          verts.push(p.x[i] + p.nx[i] * ca * R, p.y[i] + sa * Hh, p.z[i] + p.nz[i] * ca * R);
          cols.push(cIn.r, cIn.g, cIn.b);
        }
        for (const [ca, sa] of prof) {
          verts.push(p.x[i] + p.nx[i] * ca * (R + 0.9 + wob), p.y[i] + sa * (Hh + 0.9 + wob), p.z[i] + p.nz[i] * ca * (R + 0.9 + wob));
          const ring = lm.kind === 'log' && i % 7 === 0 ? 0.8 : 1;
          cols.push(cOut.r * ring, cOut.g * ring, cOut.b * ring);
        }
        if (r > 0) {
          const r0 = (r - 1) * m, r1 = r * m, h = prof.length;
          for (let k = 0; k < h - 1; k++) {
            idx.push(r0 + k, r0 + k + 1, r1 + k, r0 + k + 1, r1 + k + 1, r1 + k); // inner
            idx.push(r0 + h + k, r1 + h + k, r0 + h + k + 1, r0 + h + k + 1, r1 + h + k, r1 + h + k + 1); // outer
          }
        }
        r++;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((verts.length / 3) * 2).fill(0), 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      parts.push(g);
      if (lm.kind === 'cave') {
        // icicles and crystals on the roof
        for (let i = i0; i <= i1; i += 5) {
          const R = p.hw[i] + p.sh[i] + 1.4;
          parts.push(GK.at(GK.cone(0.5, 1.6, '#e8f6ff', { seed: i }), p.x[i] + p.nx[i] * R * 0.4, p.y[i] + R * 0.85 + 0.8, p.z[i] + p.nz[i] * R * 0.4, Math.PI));
          parts.push(GK.at(GK.cone(0.9, 2.6, '#9fd0ff', { seed: i + 1, segs: 5 }), p.x[i] + p.nx[i] * R, p.y[i] + R * 0.9, p.z[i] + p.nz[i] * R, 0, 0, 0.5));
        }
      } else {
        for (let i = i0; i <= i1; i += 9) {
          const R = p.hw[i] + p.sh[i] + 1.3;
          parts.push(GK.at(GK.blob(0.9, 0.5, 0.9, '#62b956', { seed: i }), p.x[i], p.y[i] + R * 0.95, p.z[i]));
          parts.push(GK.at(GK.blob(0.35, 0.3, 0.35, '#e8483f', { seed: i + 2 }), p.x[i] + 0.7, p.y[i] + R * 0.95 + 0.4, p.z[i]));
        }
      }
    } else if (lm.kind === 'rainbow') {
      // sparkle stars bobbing beside the rainbow
      for (let i = gate + 10; i < p.n - 10; i += 12) {
        for (const side of [-1, 1]) {
          const d = side * (p.hw[i] + p.sh[i] + 3);
          parts.push(GK.at(GK.blob(0.6, 0.6, 0.6, '#fff3a8', { seed: i * side }), p.x[i] + p.nx[i] * d, p.y[i] + 1.5, p.z[i] + p.nz[i] * d));
        }
      }
    }
  }

  // ---------- key gates ----------
  buildGates() {
    this.gates = [];
    const T = this.track;
    for (const g of T.objects.gates) {
      const grp = new THREE.Group();
      const parts = [];
      const half = g.half;
      const pillarCol = this.def.theme === 'lava' ? '#9a8fb4' : this.def.theme === 'snow' ? '#dff0ff' : '#c9a1b0';
      for (const side of [-1, 1]) {
        parts.push(GK.at(GK.box(1.6, 6.5, 1.6, pillarCol, { seed: side + 5 }), 0, 3.0, side * (half + 0.6)));
        parts.push(GK.at(GK.blob(1.1, 1.1, 1.1, '#ffcc3d', { seed: side + 8 }), 0, 6.6, side * (half + 0.6)));
      }
      parts.push(GK.at(GK.box(1.4, 1.2, half * 2 + 2.6, pillarCol, { seed: 12 }), 0, 6.1, 0));
      const frame = new THREE.Mesh(GK.merge(parts), this.clayMat);
      grp.add(frame);
      // the door itself, with a big keyhole
      const doorParts = [GK.box(0.6, 5.4, half * 2, '#8a5a3c', { seed: 3, lump: 0.08 })];
      for (let k = -2; k <= 2; k++) doorParts.push(GK.at(GK.box(0.7, 5.2, 0.25, '#6b3d24', { seed: 20 + k, lump: 0.02 }), 0, 0, k * (half * 0.38)));
      doorParts.push(GK.at(GK.blob(0.3, 1.2, 1.2, '#ffcc3d', { seed: 30 }), -0.35, 0.7, 0));
      doorParts.push(GK.at(GK.blob(0.3, 0.42, 0.42, '#2b1838', { seed: 31, lump: 0 }), -0.6, 0.95, 0));
      doorParts.push(GK.at(GK.box(0.3, 0.8, 0.32, '#2b1838', { seed: 32, lump: 0 }), -0.6, 0.35, 0));
      // the keyhole faces the approaching racer (-x local); mirror for the back
      const door = new THREE.Mesh(GK.merge(doorParts), this.clayMat);
      door.position.y = 2.7;
      grp.add(door);
      grp.position.set(g.x, g.y, g.z);
      grp.rotation.y = -g.head;
      this.scene.add(grp);
      this.gates.push({ grp, door, gate: g });
    }
  }

  update(time, race) {
    // the Edit Panel's Haze slider
    const f = this.scene.fog;
    if (CFG.fog > 0.01) {
      f.near = 90 / CFG.fog;
      f.far = 520 / Math.sqrt(CFG.fog);
    } else {
      f.near = 5000;
      f.far = 6000;
    }
    for (const a of this.anims) a(time);
    if (this.padTex) this.padTex.offset.y = -time * 1.8;
    if (race && this.gates) {
      race.items.gates.forEach((g, i) => {
        const v = this.gates[i];
        if (v) v.door.position.y = 2.7 - g.anim * 5.6;
      });
    }
  }
}

function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// Landmark builders: called with this = World3D, (spec, x, groundY, z, roadHeading, parts).
const LANDMARKS = {
  gantry(lm, x, y, z, head, parts) {
    const p = this.track.main;
    const hw = p.hw[0] + p.sh[0] + 0.6;
    const nx = p.nx[0], nz = p.nz[0];
    for (const side of [-1, 1]) {
      parts.push(GK.at(GK.cyl(0.6, 0.75, 9, '#fff6ea', { seed: side + 3 }), x + nx * hw * side, y + 4.3, z + nz * hw * side));
      parts.push(GK.at(GK.blob(1, 1, 1, '#ff6f91', { seed: side + 9 }), x + nx * hw * side, y + 9.1, z + nz * hw * side));
    }
    const banner = GK.box(1.0, 2.2, hw * 2, '#ff6f91', { seed: 4, lump: 0.08 });
    parts.push(GK.at(banner, x, y + 7.8, z, 0, -head, 0));
    // checker blocks on the banner
    for (let k = -4; k <= 4; k++) {
      const d = (k / 4.5) * hw;
      parts.push(GK.at(GK.box(1.1, 0.7, 0.9, k % 2 ? '#2b1838' : '#fff6ea', { seed: k + 20, lump: 0.02 }), x + nx * d, y + 8.5, z + nz * d, 0, -head, 0));
      parts.push(GK.at(GK.box(1.1, 0.7, 0.9, k % 2 ? '#fff6ea' : '#2b1838', { seed: k + 40, lump: 0.02 }), x + nx * d, y + 7.1, z + nz * d, 0, -head, 0));
    }
  },
  windmill(lm, x, y, z, head, parts) {
    parts.push(GK.at(GK.cyl(2.2, 3.4, 12, '#fff1d6', { seed: 7 }), x, y + 6, z));
    parts.push(GK.at(GK.cone(3.2, 3.5, '#e2483d', { seed: 8 }), x, y + 13.6, z));
    parts.push(GK.at(GK.box(1.2, 2, 0.4, '#8a5a3c', { seed: 9 }), x + 2.8, y + 1.2, z, 0, 0, 0));
    // blades spin: their own mesh
    const blades = [];
    for (let k = 0; k < 4; k++) {
      blades.push(GK.at(GK.box(0.5, 6.5, 1.5, '#ffffff', { seed: 30 + k, lump: 0.05 }), 0, 3.4, 0.8, 0, 0, 0));
      blades[blades.length - 1].rotateX((k * Math.PI) / 2);
    }
    blades.push(GK.blob(0.8, 0.8, 0.8, '#ffd166', { seed: 40 }));
    const m = new THREE.Mesh(GK.merge(blades), this.clayMat);
    const hub = new THREE.Group();
    hub.position.set(x, y + 10, z);
    hub.add(m);
    m.position.x = 2.5;
    this.scene.add(hub);
    this.anims.push((t) => {
      m.rotation.x = t * 0.9;
    });
  },
  bigshroom(lm, x, y, z, head, parts) {
    parts.push(GK.at(GK.cyl(1.8, 2.4, 7, '#fff1d6', { seed: 3 }), x, y + 3.4, z));
    parts.push(GK.at(GK.blob(6.5, 3.4, 6.5, '#e8483f', { seed: 4 }), x, y + 8, z));
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU;
      parts.push(GK.at(GK.blob(1.2, 0.6, 1.2, '#ffffff', { seed: 5 + k }), x + Math.cos(a) * 3.8, y + 10, z + Math.sin(a) * 3.8));
    }
    parts.push(GK.at(GK.blob(0.5, 0.8, 0.4, '#2b1838', { seed: 20 }), x + 1.9, y + 4.5, z + 0.8));
    parts.push(GK.at(GK.blob(0.5, 0.8, 0.4, '#2b1838', { seed: 21 }), x + 1.9, y + 4.5, z - 0.8));
  },
  pond(lm, x, y, z, head, parts) {
    const geo = new THREE.CircleGeometry(lm.r || 14, 28);
    geo.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(geo, this.keep(Clay3D.material({ color: 0x7fc8f8, rough: 0.2, wobble: 0.15, freq: 0.3, transparent: true, opacity: 0.85 })));
    water.position.set(x, y + 0.6, z);
    this.scene.add(water);
    this.keep(geo);
    for (let k = 0; k < 6; k++) {
      const a = k * 1.3, r = (lm.r || 14) * (0.3 + (k % 3) * 0.2);
      parts.push(GK.at(GK.blob(1.4, 0.15, 1.4, '#62b956', { seed: 50 + k }), x + Math.cos(a) * r, y + 0.75, z + Math.sin(a) * r));
    }
  },
  balloon(lm, x, y, z, head, parts) {
    const P = [];
    P.push(GK.blob(5, 6, 5, '#ff8fb1', { seed: 61 }));
    P.push(GK.at(GK.blob(5.05, 1.2, 5.05, '#ffd166', { seed: 62 }), 0, 0.5, 0));
    P.push(GK.at(GK.box(2, 1.4, 2, '#8a5a3c', { seed: 63 }), 0, -8, 0));
    for (const [a, b] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) P.push(GK.at(GK.cyl(0.06, 0.06, 4, '#3b2440', { segs: 4, lump: 0 }), a * 0.8, -5.6, b * 0.8));
    const m = new THREE.Mesh(GK.merge(P), this.clayMat);
    m.position.set(x, y + (lm.h || 20), z);
    this.scene.add(m);
    const by = m.position.y;
    this.anims.push((t) => {
      m.position.y = by + Math.sin(t * 0.5) * 1.2;
      m.rotation.y = t * 0.1;
    });
  },
  igloo(lm, x, y, z, head, parts) {
    parts.push(GK.at(GK.blob(5, 4, 5, '#f4f8ff', { seed: 71, lump: 0.3 }), x, y, z));
    parts.push(GK.at(GK.box(2.6, 2.6, 3, '#e3efff', { seed: 72 }), x + 4.5, y + 1, z, 0, 0, 0));
    parts.push(GK.at(GK.box(1.6, 1.8, 0.6, '#5a5a8a', { seed: 73, lump: 0 }), x + 5.9, y + 0.9, z, 0, Math.PI / 2, 0));
  },
  icecastle(lm, x, y, z, head, parts) {
    for (const [dx, dz, h] of [[0, 0, 22], [-9, 6, 15], [9, -6, 17], [-7, -8, 12], [8, 8, 13]]) {
      parts.push(GK.at(GK.cyl(2.6, 3.2, h, '#cfe8ff', { seed: 80 + h }), x + dx, y + h / 2, z + dz));
      parts.push(GK.at(GK.cone(3.4, 6, '#8fc6ff', { seed: 90 + h }), x + dx, y + h + 3, z + dz));
    }
    parts.push(GK.at(GK.box(18, 9, 14, '#e3f2ff', { seed: 99 }), x, y + 4.5, z));
  },
  flag(lm, x, y, z, head, parts) {
    parts.push(GK.at(GK.cyl(0.18, 0.2, 7, '#8c8fae', { segs: 6 }), x, y + 3.5, z));
    parts.push(GK.at(GK.box(0.2, 1.6, 2.6, '#ff6f91', { seed: 3 }), x, y + 6.2, z + 1.3));
  },
  bigsnowman(lm, x, y, z, head, parts) {
    parts.push(GK.at(GK.blob(4, 3.6, 4, '#ffffff', { seed: 1 }), x, y + 3, z));
    parts.push(GK.at(GK.blob(3, 2.8, 3, '#ffffff', { seed: 2 }), x, y + 8, z));
    parts.push(GK.at(GK.blob(2.2, 2, 2.2, '#ffffff', { seed: 3 }), x, y + 12, z));
    parts.push(GK.at(GK.cone(0.5, 2.6, '#ff8a3d', { seed: 4 }), x - 2.8, y + 12, z, 0, 0, Math.PI / 2));
    parts.push(GK.at(GK.cyl(1.6, 1.6, 2.4, '#3b2a4a', { seed: 5 }), x, y + 14.6, z));
    parts.push(GK.at(GK.cyl(2.4, 2.4, 0.3, '#3b2a4a', { seed: 6 }), x, y + 13.5, z));
    for (const dz of [-0.8, 0.8]) parts.push(GK.at(GK.blob(0.3, 0.35, 0.3, '#2b1838', { seed: 7, lump: 0 }), x - 1.9, y + 12.8, z + dz));
  },
  keep(lm, x, y, z, head, parts) {
    const stone = '#9a8fb4', roof = '#e2483d';
    parts.push(GK.at(GK.box(30, 18, 26, stone, { seed: 1, lump: 0.4 }), x, y + 9, z));
    for (const [dx, dz] of [[-15, -13], [15, -13], [-15, 13], [15, 13]]) {
      parts.push(GK.at(GK.cyl(4, 4.6, 26, '#8a7fa6', { seed: dx + dz }), x + dx, y + 13, z + dz));
      parts.push(GK.at(GK.cone(5.4, 8, roof, { seed: dx * 2 + dz }), x + dx, y + 30, z + dz));
    }
    parts.push(GK.at(GK.cyl(6, 7, 34, '#8a7fa6', { seed: 77 }), x, y + 17, z));
    parts.push(GK.at(GK.cone(8, 12, roof, { seed: 78 }), x, y + 40, z));
    // a giant King Mudlet crown on the top
    parts.push(GK.at(GK.cyl(3, 3.4, 2, '#ffcc3d', { seed: 79 }), x, y + 47, z));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU;
      parts.push(GK.at(GK.cone(0.9, 2.4, '#ffcc3d', { seed: 80 + k }), x + Math.cos(a) * 2.6, y + 49, z + Math.sin(a) * 2.6));
    }
  },
  tower(lm, x, y, z, head, parts) {
    parts.push(GK.at(GK.cyl(3, 3.6, 16, '#8a7fa6', { seed: Math.round(x) }), x, y + 8, z));
    parts.push(GK.at(GK.cone(4, 6, '#e2483d', { seed: Math.round(z) }), x, y + 19, z));
    parts.push(GK.at(GK.blob(0.9, 1.3, 0.9, '#ffd166', { seed: 3 }), x, y + 23, z));
  },
  volcano(lm, x, y, z, head, parts) {
    parts.push(GK.at(GK.cone(70, 80, '#3d2f48', { seed: 5, segs: 18, lump: 6 }), x, -2 + 40, z));
    parts.push(GK.at(GK.cyl(12, 14, 6, '#ff7a2f', { seed: 6 }), x, 76, z));
    const smoke = [];
    for (let k = 0; k < 6; k++) smoke.push(GK.at(GK.blob(10 + k * 2, 7 + k, 10 + k * 2, '#6b5168', { seed: 10 + k }), (k % 2) * 8 - 4, k * 11, (k % 3) * 5 - 5));
    const m = new THREE.Mesh(GK.merge(smoke), this.clayMat);
    m.position.set(x, 88, z);
    this.scene.add(m);
    this.anims.push((t) => {
      m.position.y = 88 + (t * 2) % 8;
      m.rotation.y = t * 0.05;
    });
  },
};
