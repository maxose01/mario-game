'use strict';
// Builds a course in 3D clay: the land around the roads (a floating island, a castle over a lava
// sea, or a whole mountainside falling away to a forested valley), road ribbons in every road
// style with curbs, glowing anti-gravity rails and shoulders, hedges / snowbanks / castle walls,
// boost pads, ramps, ice and water, start and finish lines, checkpoint arches, key gates,
// trackside life (chevron boards, grandstands with a cheering crowd, banners, lamps) and
// scenery. Lights and the sky come from sky3d.js.
// Physics never reads any of this: it only uses the track samples, so what you see is built
// to match them. Banking: the ground d units right of the centre line is at y - d * bank, and
// everything that sits on a road is built in that tilted frame (see gp() and frame()).
//
// Big courses: the land comes from a distance transform over the road samples (no per-cell
// search) and is split into tiles; small scenery is merged per material into CHUNK-sized cells
// (or instanced), so the frustum and the draw distance cull whole cells.
//
// Helpers for course scenery builders (js/scenery/*.js, called with this = World3D):
//   put(geo, mat, {cast, receive, far})  queue a geometry (merged per material and cell)
//   frame(path, s, d, h)                 Matrix4 of the banked road frame (x along, y up, z right)
//   groundAt(x, z, fallback)             terrain height (heightAt: null over the void)
//   edgeAt(x, z)                         distance beyond the nearest road's shoulders
//   clearOfRoads(x, z, pad)              nothing drivable within pad units
//   glow(x, y, z, size, color, mode)     additive glow sprite (mode 0 steady, 1 pulse, 2 flicker, 3 shimmer)
//   waterMaterial(opts), lavaMaterial()  animated materials; anims.push((time) => ...) for motion

const CHUNK = 150; // scenery cell size in units
const TERRAIN_TILE = 40; // terrain tile size in grid cells

// Invented clay sponsors for banners and boards.
const BRANDS = [
  ['SQUISH CO.', '#ff6f91', '#fff6ea'],
  ['KNEADSPEED', '#58b4ff', '#ffffff'],
  ['GLOOP COLA', '#e8483f', '#ffe066'],
  ['LUMPY TYRES', '#3b2a4a', '#ffd166'],
  ['PUTTY OIL', '#ffd166', '#3b2a4a'],
  ['SMOOSH!', '#4fbf5a', '#ffffff'],
  ['DOUGH-GO', '#9b6bff', '#ffffff'],
  ['BLOBBO', '#ff9f43', '#ffffff'],
];

// Shoulder colours per road style (null = the theme's).
const SHOULDER_COL = { wood: 'dirt', rainbow: '#fff3c4', metal: '#46506a', water: '#a9bccd', ice: '#e3f1ff', stone: '#b8b0c4', snow: '#fbfdff' };

// Wall looks: profile = [outward offset from the road edge, height] around the cross-section.
const WALL_LOOKS = {
  hedge: { prof: [[-0.2, -0.3], [-0.25, 0.6], [0.1, 1.2], [0.8, 1.45], [1.5, 1.2], [1.9, 0.5], [2, -0.3]], wob: true, depth: 2 },
  snow: { prof: [[-0.2, -0.3], [-0.1, 0.6], [0.5, 1.1], [1.3, 1.2], [2.1, 0.7], [2.5, -0.3]], wob: true, depth: 2.5 },
  ice: { prof: [[-0.2, -0.3], [-0.1, 0.7], [0.5, 1.2], [1.3, 1.25], [2.1, 0.7], [2.5, -0.3]], col: '#cfe7ff', wob: true, depth: 2.5 },
  castle: { prof: [[-0.1, -0.3], [-0.1, 1.7], [1.0, 1.7], [1.0, -0.3]], blocks: true, depth: 1 },
  parapet: { prof: [[-0.1, -0.3], [-0.1, 1.15], [0.1, 1.3], [0.85, 1.3], [1.0, -0.3]], col: '#b9b0c8', blocks: true, depth: 1 },
  channel: { prof: [[-0.1, -0.4], [-0.1, 1.0], [0.15, 1.2], [0.8, 1.2], [0.9, -0.4]], col: '#c6cdd9', depth: 0.9 },
  tech: { prof: [[-0.12, -0.3], [-0.12, 0.85], [0.05, 1.05], [0.45, 1.05], [0.55, -0.3]], col: '#46506a', depth: 0.6 },
  rail: { prof: [[-0.1, 0.45], [-0.12, 0.75], [0.14, 0.75], [0.12, 0.45]], col: '#ffffff', depth: 0.2 },
  logs: { col: '#8a5a3c', depth: 0.5 },
};

// Geometry built once per session and cloned (decor variants, spectators, lamps).
const WORLD_GEO = {};
function worldGeo(key, make) {
  let g = WORLD_GEO[key];
  if (!g) {
    g = WORLD_GEO[key] = make();
    g.userData.shared = true;
  }
  return g;
}
function sstep(a, b, x) {
  const t = U.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
function ridged(x, z) {
  const a = 1 - Math.abs(noise3(x, 3.7, z) * 2 - 1);
  const b = 1 - Math.abs(noise3(x * 2.1 + 5, 1.3, z * 2.1) * 2 - 1);
  return a * a * 0.7 + b * b * 0.3;
}

const GLSL_NOISE = `
float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`;
const GLSL_FOG = `
#ifdef USE_FOG
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(fogNear, fogFar, vFogDepth));
#endif`;
const WATER_VERT = `
uniform float uTime;
uniform float uWave;
varying vec2 vUv;
varying vec3 vWorld;
varying float vFogDepth;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  wp.y += (sin(wp.x * 0.37 + uTime * 1.6) + sin(wp.z * 0.31 - uTime * 1.25)) * uWave;
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const WATER_FRAG = `
uniform float uTime;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform vec2 uFlow;
uniform float uScale;
uniform float uWorld;
uniform float uAcross;
uniform float uEdge;
uniform float uOuter;
uniform float uFall;
uniform float uOpacity;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
varying vec2 vUv;
varying vec3 vWorld;
varying float vFogDepth;
${GLSL_NOISE}
void main() {
  vec2 q = (uWorld > 0.5 ? vWorld.xz * 0.1 : vec2(vUv.x * uAcross, vUv.y)) * uScale;
  vec2 f = q - uFlow * uTime;
  float n1 = wNoise(f * 1.3 + vec2(0.0, uTime * 0.21));
  float n2 = wNoise(f * 2.9 + vec2(uTime * 0.17, 0.0));
  float rip = n1 * 0.62 + n2 * 0.38;
  vec3 col = mix(uDeep, uShallow, smoothstep(0.3, 0.8, rip));
  col += vec3(0.09, 0.12, 0.14) * smoothstep(0.62, 0.78, rip);
  float streak = smoothstep(0.58, 0.84, wNoise(vec2(f.x * 5.0, f.y * (0.7 - uFall * 0.5))));
  float foam = streak * (0.3 + uFall * 0.6);
  float e = uOuter > 0.5 ? 1.0 - vUv.x : min(vUv.x, 1.0 - vUv.x);
  if (uEdge > 0.0) foam = max(foam, smoothstep(uEdge, 0.0, e + (n2 - 0.5) * uEdge * 0.8));
  float glint = smoothstep(0.9, 0.97, wNoise(f * 6.0 + uTime * 0.5)) * 0.35;
  col = mix(col, uFoam, clamp(foam, 0.0, 1.0)) + glint;
  gl_FragColor = vec4(col, uOpacity);
  ${GLSL_FOG}
  #include <colorspace_fragment>
}`;
const LAVA_FRAG = `
uniform float uTime;
uniform vec3 uHot;
uniform vec3 uLava;
uniform vec3 uCrust;
uniform float uScale;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
varying vec2 vUv;
varying vec3 vWorld;
varying float vFogDepth;
${GLSL_NOISE}
void main() {
  vec2 p = vWorld.xz * 0.05 * uScale;
  vec2 w = vec2(wNoise(p * 0.6 + vec2(uTime * 0.03, 0.0)), wNoise(p * 0.6 + vec2(4.7, -uTime * 0.025)));
  float n = wNoise(p + w * 1.8 + vec2(0.0, uTime * 0.05)) * 0.65 + wNoise(p * 2.6 - w + uTime * 0.04) * 0.35;
  float crust = smoothstep(0.5, 0.66, n);
  float crack = 1.0 - smoothstep(0.0, 0.06, abs(n - 0.5));
  vec3 col = mix(uLava, uHot, smoothstep(0.42, 0.18, n));
  col = mix(col, uCrust, crust * 0.85);
  col += uHot * crack * 0.55;
  col *= 0.93 + 0.07 * sin(uTime * 1.7 + n * 9.0);
  gl_FragColor = vec4(col, 1.0);
  ${GLSL_FOG}
  #include <colorspace_fragment>
}`;
const GLOW_VERT = `
attribute vec3 gPos;
attribute vec4 gCol;
attribute vec2 gSize;
uniform float uTime;
uniform float uGlow;
varying vec2 vUv;
varying vec3 vCol;
varying float vA;
varying float vFogDepth;
void main() {
  vUv = position.xy;
  float m = gCol.a, ph = gSize.y, k = 1.0;
  if (m > 0.5 && m < 1.5) k = 0.72 + 0.28 * sin(uTime * 4.5 + ph);
  else if (m > 1.5 && m < 2.5) k = 0.82 + 0.1 * sin(uTime * 13.0 + ph) + 0.08 * sin(uTime * 21.0 + ph * 1.7);
  else if (m > 2.5) k = 0.65 + 0.35 * sin(uTime * 2.4 + ph);
  vec4 mv = modelViewMatrix * vec4(gPos, 1.0);
  mv.xy += position.xy * gSize.x * (0.88 + 0.12 * k);
  vA = k * uGlow;
  vCol = gCol.rgb;
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const GLOW_FRAG = `
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
varying vec2 vUv;
varying vec3 vCol;
varying float vA;
varying float vFogDepth;
void main() {
  float r = length(vUv);
  float a = pow(max(0.0, 1.0 - r), 2.0) * vA;
#ifdef USE_FOG
  a *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
#endif
  gl_FragColor = vec4(vCol, a);
  #include <colorspace_fragment>
}`;
const FLAT_GLOW_VERT = `
varying vec2 vUv;
varying float vFogDepth;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const FLAT_GLOW_FRAG = `
uniform vec3 uColor;
uniform float uGlow;
uniform float uShape;
uniform float uTime;
uniform float uPulse;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
varying vec2 vUv;
varying float vFogDepth;
void main() {
  float a = smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x);
  if (uShape < 0.5) a *= smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
  a = a * a * uGlow * (1.0 - uPulse * 0.4 + uPulse * 0.4 * sin(uTime * 5.0 - vUv.y * 4.0));
#ifdef USE_FOG
  a *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
#endif
  gl_FragColor = vec4(uColor, a * 0.6);
  #include <colorspace_fragment>
}`;

class World3D {
  constructor(track) {
    this.track = track;
    this.def = track.def;
    this.theme = THEMES[this.def.theme];
    this.scene = new THREE.Scene();
    this.anims = [];
    this.disposables = [];
    this.chunks = []; // {mesh, c, r, far} culled by distance in cullFor
    this.bins = new Map(); // material + cell -> geometries waiting to be merged
    this.glows = []; // glow sprites waiting to be built
    this.uTime = { value: 0 }; // shared by the water, lava and glow shaders
    this.uGlow = { value: 1 };
    this.texCache = {};
    this.matCache = {};
    const th = this.theme;
    this.valley = th.voidKind === 'valley';
    this.clayMat = this.keep(Clay3D.material({ vertexColors: true, wobble: 0.045, freq: 1.3 }));
    this.stillMat = this.keep(Clay3D.material({ vertexColors: true, wobble: 0, rim: 0.7 }));
    this.landMat = this.keep(Clay3D.material({ vertexColors: true, wobble: 0, rim: this.valley ? 0.25 : 0.7, bump: false }));
    this.tubeMat = this.keep(Clay3D.material({ vertexColors: true, wobble: 0.03, freq: 0.9 }));
    this.sheetMat = this.keep(Clay3D.material({ vertexColors: true, wobble: 0, side: THREE.DoubleSide }));
    this.neonMat = this.keep(new THREE.MeshBasicMaterial({ color: '#8ff6ff', fog: true }));
    this.scene.fog = new THREE.Fog(th.fog, 90, 520);
    this.prepare();
    this.buildTerrain();
    // lights, sky dome, sun, clouds and distant scenery (js/sky3d.js)
    this.sky3d = new Sky3D(this);
    this.lights = this.sky3d.lights;
    this.sunDir = this.sky3d.sunDir;
    this.buildRoads();
    this.buildWalls();
    this.buildZones();
    this.buildLines();
    this.buildVoid();
    this.buildDecor();
    this.buildTrackside();
    this.buildLandmarks();
    this.buildGates();
    this.flush();
    this.buildGlows();
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

  // Keep the sky centred on whichever camera is drawing.
  follow(camera) {
    this.sky3d.follow(camera);
  }

  dispose() {
    disposeScene(this.scene);
    for (const d of this.disposables) if (d && d.dispose) d.dispose();
  }

  // ---------- chunked building ----------
  // Queue a geometry: at the end everything is merged into one mesh per material per CHUNK
  // cell. o: {cast (default true), receive (default true), far: cull with the terrain (fog
  // distance) instead of the scenery draw distance, name}
  put(geo, mat, o = {}) {
    if (!geo) return;
    mat = mat || this.clayMat;
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    const c = geo.boundingSphere.center;
    const cast = o.cast !== false, receive = o.receive !== false, far = !!o.far;
    const key = mat.uuid + (cast ? 'c' : '') + (receive ? 'r' : '') + (far ? 'f' : '') + Math.floor(c.x / CHUNK) + ',' + Math.floor(c.z / CHUNK);
    let b = this.bins.get(key);
    if (!b) this.bins.set(key, (b = { mat, cast, receive, far, list: [], name: o.name || 'scenery' }));
    b.list.push(geo);
  }
  // Clone a shared geometry into the bins at a pose (rotation about y, uniform or [x,y,z] scale).
  stamp(geo, x, y, z, ry, s, mat, o) {
    this.put(GK.at(geo.clone(), x, y, z, 0, ry || 0, 0, s), mat, o);
  }
  putAt(geo, m, mat, o) {
    geo.applyMatrix4(m);
    this.put(geo, mat, o);
  }
  flush() {
    for (const b of this.bins.values()) {
      const geo = GK.merge(b.list);
      const m = this.add(geo, b.mat, b.name);
      m.castShadow = b.cast;
      m.receiveShadow = b.receive;
      this.cullable(m, b.far);
    }
    this.bins.clear();
  }
  // Register a mesh for distance culling.
  cullable(mesh, far) {
    const g = mesh.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    mesh.updateMatrixWorld();
    const c = g.boundingSphere.center.clone().applyMatrix4(mesh.matrixWorld);
    this.chunks.push({ mesh, c, r: g.boundingSphere.radius, far });
  }

  // Hide cells deep in the haze (they would be fogged out anyway). Scenery goes at the draw
  // distance (CFG.drawDist x maxDist), forests a little later, land and roads only past the fog.
  cullFor(camera, maxDist) {
    const p = camera.position;
    const dd = maxDist * (CFG.drawDist || 1);
    const far = Math.max(dd, this.scene.fog.far + 80);
    const mid = Math.max(dd, this.scene.fog.far * 0.85);
    const glow = CFG.glow === undefined || CFG.glow > 0.01;
    for (const ch of this.chunks) {
      const d = Math.hypot(ch.c.x - p.x, ch.c.z - p.z) - ch.r;
      ch.mesh.visible = d < (ch.far ? far : ch.mid ? mid : dd) && (glow || !ch.glow);
    }
  }

  // ---------- road frames ----------
  // Ground point d units right of sample i (banked), lifted h along the banked normal.
  gp(p, i, d, h, out) {
    const b = p.bank[i], k = (h || 0) / Math.sqrt(1 + b * b);
    out = out || {};
    out.x = p.x[i] + p.nx[i] * (d + b * k);
    out.y = p.y[i] - d * b + k;
    out.z = p.z[i] + p.nz[i] * (d + b * k);
    return out;
  }
  // The banked road frame at s on a path, d units right and h up: x along the road, y the banked
  // normal, z the banked right-hand side.
  frame(p, s, d = 0, h = 0) {
    const pt = p.point(s, 0, {});
    const b = pt.bank, l = Math.sqrt(1 + b * b);
    const X = new THREE.Vector3(pt.tx, 0, pt.tz);
    const Y = new THREE.Vector3((pt.nx * b) / l, 1 / l, (pt.nz * b) / l);
    const Z = new THREE.Vector3(pt.nx / l, -b / l, pt.nz / l);
    const m = new THREE.Matrix4().makeBasis(X, Y, Z);
    const o = new THREE.Vector3(pt.x, pt.yc, pt.z).addScaledVector(Z, d * l).addScaledVector(Y, h);
    m.setPosition(o);
    return m;
  }
  // A flat frame (no bank) on the ground at (x, y, z), x axis along heading head.
  flatFrame(x, y, z, head) {
    const m = new THREE.Matrix4().makeRotationY(-head);
    m.setPosition(x, y, z);
    return m;
  }

  // ---------- per-path render info ----------
  prepare() {
    const T = this.track;
    this.pinfo = T.paths.map((p) => {
      const gap = new Uint8Array(p.n), corner = new Uint8Array(p.n), lift = new Float32Array(p.n), tunnel = new Uint8Array(p.n);
      for (const z of p.zones) {
        if (z.kind !== 'gap') continue;
        for (let i = 0; i < p.n; i++) if (p.s[i] > z.s0 && p.s[i] < z.s1) gap[i] = 1;
      }
      // corners: somewhere within 6 samples the road bends tighter than a 70-unit radius
      for (let i = 0; i < p.n; i++) {
        let c = 0;
        for (let k = -6; k <= 6; k++) c = Math.max(c, Math.abs(p.curv[p.wrap(i + k)]));
        corner[i] = c > 1 / 70 ? 1 : 0;
      }
      return { gap, corner, lift, tunnel };
    });
    // tunnels in the rock or ice lift the land around them into a mountain over the cave
    this.tunnels = [];
    for (const lm of this.def.landmarks || []) {
      if (lm.kind !== 'tunnel' || lm.path) continue;
      const r = this.rangeOf(lm);
      if (!r) continue;
      const p = T.main, look = lm.look || 'rock';
      const ids = [];
      for (let s = r.s0; s <= r.s1; s += p.step) ids.push(p.indexAt(s));
      const R = (i) => p.hw[i] + p.sh[i] + this.wallDepth(p, i) + 0.4;
      this.tunnels.push({ lm, ids, look, R });
      for (const i of ids) this.pinfo[0].tunnel[i] = 1;
      if (look === 'ice' || look === 'rock') for (const i of ids) this.pinfo[0].lift[i] = R(i) * 0.75 + 8;
    }
  }
  inTunnel(p, i) {
    return p === this.track.main && this.pinfo[0].tunnel[i] === 1;
  }
  // s range on the main road of a {seg, t, seg1, t1 | len} spec.
  rangeOf(lm) {
    const T = this.track;
    if (lm.seg === undefined || !T.marks[lm.seg]) return null;
    const s0 = T.segS(lm.seg, lm.t || 0) + (lm.ds || 0);
    const s1 = lm.seg1 !== undefined && T.marks[lm.seg1] ? T.segS(lm.seg1, lm.t1 || 0) : s0 + (lm.len || 60);
    return s1 > s0 ? { s0, s1 } : null;
  }

  // ---------- terrain ----------
  // Every land vertex learns its nearest road sample from a two-pass distance transform (no
  // per-vertex search), then blends that road's edge height into a smooth field of nearby road
  // heights. Floating islands fall away into the void beside drop edges; on a mountain (the
  // 'valley' void kind) the land keeps going: rocky cliffs under drop edges and crevasses, peaks
  // between the bends, and slopes down to a forested valley floor.
  buildTerrain() {
    const T = this.track, th = this.theme, b = T.bounds, paths = T.paths;
    const valley = this.valley, lava = th.voidKind === 'lava';
    let minY = Infinity, maxY = -Infinity, ng = 0;
    const off = [];
    for (const p of paths) {
      off.push(ng);
      ng += p.n;
      for (let i = 0; i < p.n; i++) {
        minY = Math.min(minY, p.y[i]);
        maxY = Math.max(maxY, p.y[i]);
      }
    }
    // every road sample, flattened
    const SX = new Float32Array(ng), SZ = new Float32Array(ng), SP = new Uint8Array(ng), SI = new Int32Array(ng);
    for (const p of paths) {
      for (let i = 0; i < p.n; i++) {
        const g = off[p.index] + i;
        SX[g] = p.x[i];
        SZ[g] = p.z[i];
        SP[g] = p.index;
        SI[g] = i;
      }
    }
    const VOID = lava ? -4.5 : minY - 46;
    const valleyY = minY - 8;
    this.voidY = valley ? valleyY : VOID;
    this.valleyY = valleyY;
    const R = { SX, SZ, SP, SI, off, ng, VOID, valleyY, span: Math.max(30, maxY - valleyY), drops: null };
    // on a mountain: the drop edges (and crevasses under gaps) with their heights
    if (valley) {
      const dx = [], dz = [], dy = [];
      for (const p of paths) {
        const gap = this.pinfo[p.index].gap;
        for (let i = 0; i < p.n; i++) {
          const e = p.hw[i] + p.sh[i];
          if (gap[i]) {
            for (const d of [-e, 0, e]) {
              dx.push(p.x[i] + p.nx[i] * d);
              dz.push(p.z[i] + p.nz[i] * d);
              dy.push(p.y[i] - d * p.bank[i] - (d ? 0 : 28));
            }
            continue;
          }
          for (const side of [-1, 1]) {
            if ((side < 0 ? p.wallL[i] : p.wallR[i]) !== 0 || p.style[i] === 'rainbow') continue;
            dx.push(p.x[i] + p.nx[i] * side * e);
            dz.push(p.z[i] + p.nz[i] * side * e);
            dy.push(p.y[i] - side * e * p.bank[i]);
          }
        }
      }
      if (dx.length) R.drops = { X: Float32Array.from(dx), Z: Float32Array.from(dz), Y: Float32Array.from(dy) };
    }
    // the grids: an island gets one; a mountain gets a fine grid around the roads and a coarse
    // one out toward the horizon, meeting on an exact seam (the fine grid's border is straight
    // between the coarse vertices, which it shares)
    const OC = 16;
    let fine, outer = null;
    if (valley) {
      const m = 110;
      const fx0 = Math.floor((b.minX - m) / OC) * OC, fx1 = Math.ceil((b.maxX + m) / OC) * OC;
      const fz0 = Math.floor((b.minZ - m) / OC) * OC, fz1 = Math.ceil((b.maxZ + m) / OC) * OC;
      const guess = Math.max(3, Math.sqrt(((fx1 - fx0) * (fz1 - fz0)) / 120000));
      const n = Math.max(1, Math.floor(OC / guess));
      const cell = OC / n;
      fine = { x0: fx0, z0: fz0, cell, nx: Math.round((fx1 - fx0) / cell) + 1, nz: Math.round((fz1 - fz0) / cell) + 1, step: n };
      const M = Math.ceil(560 / OC) * OC;
      outer = { x0: fx0 - M, z0: fz0 - M, cell: OC, nx: Math.round((fx1 - fx0 + 2 * M) / OC) + 1, nz: Math.round((fz1 - fz0 + 2 * M) / OC) + 1, hole: [fx0, fz0, fx1, fz1], fade: true };
    } else {
      const margin = 80;
      const W = b.maxX - b.minX + margin * 2, D = b.maxZ - b.minZ + margin * 2;
      const cell = Math.max(3, Math.sqrt((W * D) / 120000));
      fine = { x0: b.minX - margin, z0: b.minZ - margin, cell, nx: Math.ceil(W / cell) + 1, nz: Math.ceil(D / cell) + 1 };
    }
    // a smooth field of nearby road heights on a coarse grid over everything
    const top = outer || fine;
    R.base = this.baseField(R, top.x0, top.z0, (top.nx - 1) * top.cell, (top.nz - 1) * top.cell, valley ? 24 : 12, valley ? 170 : 45);
    this.terrainField(fine, R);
    this.terrain = fine;
    if (outer) this.terrainField(outer, R);
    this.terrainOuter = outer;
    // lakes and ponds sit in bowls; a gorge {seg, t, d, r, y | depth} is a dry hollow with a flat
    // floor at height y (or depth below the ground), e.g. the drop below a dam
    this.lakes = [];
    for (const lm of this.def.landmarks || []) {
      if (lm.kind !== 'lake' && lm.kind !== 'pond' && lm.kind !== 'gorge') continue;
      let w;
      try {
        w = T.where(lm);
      } catch (e) {
        continue;
      }
      const pt = w.path.point(w.s, lm.d || 0);
      const r = lm.r || 14;
      const gorge = lm.kind === 'gorge';
      const ground = this.heightAt(pt.x, pt.z) ?? pt.y;
      const y = gorge ? (lm.y !== undefined ? lm.y : ground - (lm.depth || 10)) + 2 : ground + (lm.y || 0);
      if (!gorge) this.lakes.push({ lm, x: pt.x, z: pt.z, r, y });
      const { x0, z0, cell, nx, nz, H, K } = fine;
      const reach = r * 1.25;
      for (let j = Math.max(0, Math.floor((pt.z - reach - z0) / cell)); j <= Math.min(nz - 1, Math.ceil((pt.z + reach - z0) / cell)); j++) {
        for (let i = Math.max(0, Math.floor((pt.x - reach - x0) / cell)); i <= Math.min(nx - 1, Math.ceil((pt.x + reach - x0) / cell)); i++) {
          const k = j * nx + i;
          if (K[k] !== 0) continue;
          const q = Math.hypot(x0 + i * cell - pt.x, z0 + j * cell - pt.z) / r;
          if (q < 1) H[k] = Math.min(H[k], y - 0.4 - 1.6 * (1 - q * q));
          else if (q < 1.25) H[k] = Math.min(H[k], U.lerp(y - 0.3, H[k], (q - 1) / 0.25));
        }
      }
    }
    if (outer) {
      // the seam: the fine border runs straight between the shared coarse vertices
      const { nx, nz, H, step } = fine;
      const fix = (k0, dk, count) => {
        for (let a = 0; a + step < count; a += step) {
          const ha = H[k0 + a * dk], hb = H[k0 + (a + step) * dk];
          for (let q = 1; q < step; q++) H[k0 + (a + q) * dk] = U.lerp(ha, hb, q / step);
        }
      };
      fix(0, 1, nx);
      fix((nz - 1) * nx, 1, nx);
      fix(0, nx, nz);
      fix(nx - 1, nx, nz);
      const [hx0, hz0] = outer.hole;
      for (let j = 0; j < outer.nz; j++) {
        for (let i = 0; i < outer.nx; i++) {
          const x = outer.x0 + i * OC, z = outer.z0 + j * OC;
          const fi = Math.round((x - hx0) / fine.cell), fj = Math.round((z - hz0) / fine.cell);
          if (fi < 0 || fj < 0 || fi >= nx || fj >= nz) continue;
          if (fi !== 0 && fj !== 0 && fi !== nx - 1 && fj !== nz - 1) continue;
          outer.H[j * outer.nx + i] = H[fj * nx + fi];
        }
      }
      // and the far edge settles onto the valley floor plane
      for (let j = 0; j < outer.nz; j++) {
        for (let i = 0; i < outer.nx; i++) {
          const bd = Math.min(i, j, outer.nx - 1 - i, outer.nz - 1 - j) * OC;
          if (bd < 120) outer.H[j * outer.nx + i] = U.lerp(valleyY - 0.5, outer.H[j * outer.nx + i], sstep(0, 120, bd));
        }
      }
    }
    for (const g of outer ? [fine, outer] : [fine]) this.terrainMesh(g, R, g === fine);
  }

  // Inverse-distance blend of road centre heights on a coarse grid (NaN far from every road).
  baseField(R, x0, z0, W, D, CB, RB) {
    const { SX, SZ, SP, SI, ng } = R, paths = this.track.paths;
    const cnx = Math.ceil(W / CB) + 2, cnz = Math.ceil(D / CB) + 2;
    const B = new Float32Array(cnx * cnz);
    const BK = 32, bnx = Math.ceil(W / BK) + 1, bnz = Math.ceil(D / BK) + 1;
    const buckets = new Array(bnx * bnz);
    for (let g = 0; g < ng; g += 2) {
      const bi = Math.floor((SX[g] - x0) / BK), bj = Math.floor((SZ[g] - z0) / BK);
      if (bi < 0 || bj < 0 || bi >= bnx || bj >= bnz) continue;
      (buckets[bj * bnx + bi] || (buckets[bj * bnx + bi] = [])).push(g);
    }
    const R2 = RB * RB, br = Math.ceil(RB / BK);
    for (let cj = 0; cj < cnz; cj++) {
      for (let ci = 0; ci < cnx; ci++) {
        const x = x0 + ci * CB, z = z0 + cj * CB;
        const bi0 = Math.floor((x - x0) / BK), bj0 = Math.floor((z - z0) / BK);
        let wy = 0, ws = 0;
        for (let bj = Math.max(0, bj0 - br); bj <= Math.min(bnz - 1, bj0 + br); bj++) {
          for (let bi = Math.max(0, bi0 - br); bi <= Math.min(bnx - 1, bi0 + br); bi++) {
            const list = buckets[bj * bnx + bi];
            if (!list) continue;
            for (const g of list) {
              const dd = (SX[g] - x) ** 2 + (SZ[g] - z) ** 2;
              if (dd >= R2) continue;
              const f = 1 - dd / R2;
              const w = (f * f) / (dd + 100);
              wy += paths[SP[g]].y[SI[g]] * w;
              ws += w;
            }
          }
        }
        B[cj * cnx + ci] = ws > 0 ? wy / ws : NaN;
      }
    }
    return (x, z) => {
      const fx = (x - x0) / CB, fz = (z - z0) / CB;
      const i = U.clamp(Math.floor(fx), 0, cnx - 2), j = U.clamp(Math.floor(fz), 0, cnz - 2);
      const u = fx - i, v = fz - j, k = j * cnx + i;
      const a = B[k], b2 = B[k + 1], c = B[k + cnx], d = B[k + cnx + 1];
      if (a !== a || b2 !== b2 || c !== c || d !== d) {
        // near the edge of the field: average whatever corners have data
        let s = 0, n = 0;
        for (const q of [a, b2, c, d]) if (q === q) (s += q), n++;
        return n ? s / n : NaN;
      }
      return (a * (1 - u) + b2 * u) * (1 - v) + (c * (1 - u) + d * u) * v;
    };
  }

  // Heights for one terrain grid g = {x0, z0, cell, nx, nz}: fills g.H (height), g.K (0 land,
  // 1 void, 2 under a road) and g.E (distance beyond the nearest road's shoulders).
  terrainField(g, R) {
    const T = this.track, th = this.theme, paths = T.paths;
    const valley = this.valley, lava = th.voidKind === 'lava';
    const { x0, z0, cell, nx, nz } = g, N = nx * nz;
    const { SX, SZ, SP, SI, off, VOID, valleyY, span } = R;
    // 1. road footprints: which road (the lowest, where two cross) covers each vertex
    const FP = new Int32Array(N).fill(-1), FY = new Float32Array(N), FD = new Float32Array(N);
    for (const p of paths) {
      for (let i = 0; i < p.n; i++) {
        const e = p.hw[i] + p.sh[i] + 0.6, reach = e + 1;
        if (p.x[i] + reach < x0 || p.z[i] + reach < z0 || p.x[i] - reach > x0 + (nx - 1) * cell || p.z[i] - reach > z0 + (nz - 1) * cell) continue;
        const tx = p.tx[i], tz = p.tz[i], qx = p.nx[i], qz = p.nz[i];
        const alongMax = p.step * 0.5 * (1 + Math.abs(p.curv[i]) * e) + 0.05;
        const ci0 = Math.max(0, Math.floor((p.x[i] - reach - x0) / cell)), ci1 = Math.min(nx - 1, Math.ceil((p.x[i] + reach - x0) / cell));
        const cj0 = Math.max(0, Math.floor((p.z[i] - reach - z0) / cell)), cj1 = Math.min(nz - 1, Math.ceil((p.z[i] + reach - z0) / cell));
        const gi = off[p.index] + i;
        for (let j = cj0; j <= cj1; j++) {
          const dz = z0 + j * cell - p.z[i];
          for (let ii = ci0; ii <= ci1; ii++) {
            const dx = x0 + ii * cell - p.x[i];
            const al = dx * tx + dz * tz;
            if (al > alongMax || al < -alongMax) continue;
            const d = dx * qx + dz * qz;
            const ad = d < 0 ? -d : d;
            if (ad > e) continue;
            const y = p.y[i] - d * p.bank[i];
            const k = j * nx + ii;
            if (FP[k] < 0 || y < FY[k] - 4 || (y < FY[k] + 4 && ad < FD[k])) {
              FP[k] = gi;
              FY[k] = y;
              FD[k] = ad;
            }
          }
        }
      }
    }
    // 2. nearest road sample for every vertex
    const SEED = Int32Array.from(FP), DS = new Float32Array(N);
    for (let gi = 0; gi < SX.length; gi++) {
      const ii = Math.round((SX[gi] - x0) / cell), jj = Math.round((SZ[gi] - z0) / cell);
      if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
      const k = jj * nx + ii;
      if (SEED[k] < 0) SEED[k] = gi;
    }
    featureTransform(SEED, DS, nx, nz, x0, z0, cell, SX, SZ);
    // 3. on a mountain: the nearest drop edge
    const dr = R.drops;
    let DSEED = null, DDS = null;
    if (dr) {
      DSEED = new Int32Array(N).fill(-1);
      DDS = new Float32Array(N);
      for (let s = 0; s < dr.X.length; s++) {
        const ii = Math.round((dr.X[s] - x0) / cell), jj = Math.round((dr.Z[s] - z0) / cell);
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const k = jj * nx + ii;
        if (DSEED[k] < 0 || dr.Y[s] < dr.Y[DSEED[k]]) DSEED[k] = s;
      }
      featureTransform(DSEED, DDS, nx, nz, x0, z0, cell, dr.X, dr.Z);
    }
    // the cliff below a drop edge: a rocky lip, then a steep slope
    const cliffAt = (k, x, z) => {
      const dist = Math.sqrt(DDS[k]);
      return dr.Y[DSEED[k]] - (2.2 + dist * 0.9 + dist * dist * 0.004) + (noise3(x * 0.15, 2, z * 0.15) - 0.5) * 3;
    };
    // 4. heights
    const H = new Float32Array(N), K = new Uint8Array(N), E = new Float32Array(N);
    const inLoop = !valley && T.main.closed ? polyMask(loopPoly(T.main), nx, nz, x0, z0, cell) : null;
    const hillAmp = th === THEMES.snow ? 16 : lava ? 3 : 7;
    for (let j = 0; j < nz; j++) {
      const z = z0 + j * cell;
      for (let i = 0; i < nx; i++) {
        const x = x0 + i * cell, k = j * nx + i;
        const gi = FP[k] >= 0 ? FP[k] : SEED[k];
        if (gi < 0) {
          H[k] = valley ? valleyY : VOID;
          K[k] = valley ? 0 : 1;
          E[k] = 999;
          continue;
        }
        const p = paths[SP[gi]], si = SI[gi], info = this.pinfo[p.index];
        const dx = x - p.x[si], dz = z - p.z[si];
        const d = dx * p.nx[si] + dz * p.nz[si], al = dx * p.tx[si] + dz * p.tz[si];
        const e = p.hw[si] + p.sh[si];
        const beyond = !p.closed && ((si === 0 && al < -0.5) || (si === p.n - 1 && al > 0.5));
        const ex = Math.max(0, Math.abs(d) - e), ea = beyond ? Math.abs(al) - 0.5 : 0;
        const edge = FP[k] >= 0 ? Math.abs(d) - e : Math.hypot(ex, ea);
        E[k] = edge;
        const gap = info.gap[si];
        if (FP[k] >= 0) {
          // under a road
          const bothDrop = p.wallL[si] === 0 && p.wallR[si] === 0;
          if (!valley && (gap || bothDrop)) {
            H[k] = VOID;
            K[k] = 1;
          } else if (valley && gap && DSEED && DSEED[k] >= 0) {
            // a crevasse under the glide
            H[k] = Math.min(FY[k] - 0.7, cliffAt(k, x, z));
            K[k] = 0;
          } else {
            H[k] = FY[k] - 0.7 - 0.3 * Math.abs(p.bank[si]);
            K[k] = 2;
          }
          continue;
        }
        let flag = beyond ? 1 : d > 0 ? p.wallR[si] : p.wallL[si];
        if (flag === 2) flag = 1;
        const sideY = p.y[si] - Math.sign(d) * e * p.bank[si];
        let base = R.base(x, z);
        if (valley) {
          if (base !== base) base = valleyY;
          let h = sideY - 0.4 + (base - sideY + 0.4) * sstep(1.5, 50, edge);
          // away from the course the mountain falls toward the valley, ever steeper
          const far = Math.max(0, edge - 25);
          h -= far * 0.32 + far * far * 0.0016;
          // craggy peaks between and beside the bends, tallest high up the mountain
          const alt = U.clamp((base - valleyY) / span, 0, 1);
          h += ridged(x * 0.0065, z * 0.0065) * (12 + 110 * alt) * sstep(35, 140, edge) * (1 - sstep(300, 520, edge));
          h += (fbm2(x * 0.03, z * 0.03) - 0.5) * 9 * sstep(4, 30, edge);
          // drop edges: rocky cliffs, where that edge is the nearest road
          if (DSEED && DSEED[k] >= 0) {
            const w = 1 - sstep(3, 30, Math.sqrt(DDS[k]) - edge);
            if (w > 0) h = U.lerp(h, Math.min(h, cliffAt(k, x, z)), w);
          }
          // ...but never below a walled road's edge right beside it
          if (flag === 1 && edge < 10) h = U.lerp(sideY - 0.4, h, sstep(3, 10, edge));
          // a mountain over caves (measured from the road's centre: the spiral banks steeply)
          if (info.lift[si] > 0) h = Math.max(h, U.lerp(sideY, p.y[si] + info.lift[si], sstep(4, 14, edge)) - 40 * sstep(20, 40, edge));
          const floor = valleyY + (fbm2(x * 0.012, z * 0.012) - 0.5) * 6;
          H[k] = Math.max(h, floor);
          K[k] = 0;
          continue;
        }
        // floating island: the void beside drop edges and beyond the rim
        const rim = (inLoop && inLoop[k] ? 999 : 30) + fbm2(x * 0.02 + 3, z * 0.02) * 26;
        if ((flag === 0 && edge < 26 + fbm2(x * 0.05, z * 0.05) * 10) || edge > rim) {
          H[k] = VOID;
          K[k] = 1;
          continue;
        }
        if (base !== base) base = sideY;
        const hill = fbm2(x * 0.018, z * 0.018) * hillAmp * U.clamp((edge - 3) / 40, 0, 1);
        const lump = (noise3(x * 0.2, 1.3, z * 0.2) - 0.5) * 0.8;
        H[k] = sideY - 0.45 + (base - sideY) * sstep(2, 30, edge) + Math.max(0, hill) + lump * U.clamp(edge / 6, 0, 1);
        K[k] = 0;
      }
    }
    Object.assign(g, { H, K, E, valleyY });
  }

  // Normals, colours and tiled meshes for a terrain grid (the outer grid skips its hole).
  terrainMesh(g, R, fine) {
    const th = this.theme, valley = this.valley, lava = th.voidKind === 'lava';
    const { x0, z0, cell, nx, nz, H, K, E } = g, N = nx * nz;
    const valleyY = R.valleyY;
    // void vertices beside land: a cliff lip just below the edge (lava shores dip into the lava)
    const HV = Float32Array.from(H);
    if (!valley) {
      for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
          const k = j * nx + i;
          if (K[k] !== 1) continue;
          let near = 0, sum = 0;
          if (i > 0 && K[k - 1] !== 1) (near++, (sum += H[k - 1]));
          if (i < nx - 1 && K[k + 1] !== 1) (near++, (sum += H[k + 1]));
          if (j > 0 && K[k - nx] !== 1) (near++, (sum += H[k - nx]));
          if (j < nz - 1 && K[k + nx] !== 1) (near++, (sum += H[k + nx]));
          if (near && !lava) HV[k] = sum / near - 9 - noise3((x0 + i * cell) * 0.3, 0, (z0 + j * cell) * 0.3) * 6;
        }
      }
    }
    // normals from the height grid
    const NY = new Float32Array(N), NRM = new Float32Array(N * 3);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const hl = HV[i > 0 ? k - 1 : k], hr = HV[i < nx - 1 ? k + 1 : k];
        const hd = HV[j > 0 ? k - nx : k], hu = HV[j < nz - 1 ? k + nx : k];
        const ax = hl - hr, az = hd - hu, ay = 2 * cell;
        const l = Math.hypot(ax, ay, az);
        NRM[k * 3] = ax / l;
        NRM[k * 3 + 1] = ay / l;
        NRM[k * 3 + 2] = az / l;
        NY[k] = ay / l;
      }
    }
    g.NY = NY;
    // colours
    const COL = new Float32Array(N * 3);
    const cGrass = new THREE.Color(th.grass), cGrass2 = new THREE.Color(th.grass2), cDirt = new THREE.Color(th.dirt), cRock = new THREE.Color(th.rock);
    const cValley = new THREE.Color(th.valley || th.grass2), cForest = new THREE.Color(th.forest2 || th.grass2), cWhite = new THREE.Color('#ffffff');
    const c = new THREE.Color();
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const x = x0 + i * cell, z = z0 + j * cell;
        const n = noise3(x * 0.07, 3, z * 0.07);
        const steep = 1 - NY[k];
        if (K[k] === 1) c.copy(cRock).multiplyScalar(lava ? 0.55 : 0.82);
        else if (K[k] === 2) c.copy(valley ? cRock : cDirt).multiplyScalar(0.8);
        else if (valley) {
          c.copy(cGrass).lerp(cGrass2, U.clamp((n - 0.35) * 2.5, 0, 1));
          const green = 1 - sstep(valleyY + 5, valleyY + 30, H[k] + (noise3(x * 0.03, 8, z * 0.03) - 0.5) * 18);
          if (green > 0) c.lerp(cValley, green).lerp(cForest, green * U.clamp((n - 0.5) * 2, 0, 1) * 0.6);
          if (E[k] < 2.5) c.lerp(cDirt, 0.3);
          // cliffs and outcrops read as rock, flat ledges keep their snow
          const outcrop = U.clamp((noise3(x * 0.045, 11, z * 0.045) - 0.6) * 4, 0, 1) * sstep(6, 20, E[k]) * sstep(0.12, 0.3, steep);
          const rockiness = Math.max(sstep(0.32, 0.52, steep), outcrop * 0.85);
          if (rockiness > 0) {
            // layered rock bands on cliffs
            const band = 0.86 + 0.14 * Math.sin(H[k] * 0.55 + noise3(x * 0.02, 5, z * 0.02) * 6);
            c.lerp(cRock, rockiness).multiplyScalar(U.lerp(1, band, rockiness));
          }
        } else {
          c.copy(cGrass).lerp(cGrass2, U.clamp((n - 0.35) * 2.5, 0, 1));
          if (E[k] < 2.5) c.lerp(cDirt, 0.35);
          if (th === THEMES.snow && H[k] > 18) c.lerp(cWhite, 0.5);
          if (steep > 0.35) c.lerp(cRock, U.clamp((steep - 0.35) * 2, 0, 1));
        }
        COL[k * 3] = c.r;
        COL[k * 3 + 1] = c.g;
        COL[k * 3 + 2] = c.b;
      }
    }
    // tiles, so the frustum culls the land too
    const hole = g.hole;
    const inHole = (x, z) => hole && x >= hole[0] - 0.01 && x <= hole[2] + 0.01 && z >= hole[1] - 0.01 && z <= hole[3] + 0.01;
    for (let tj = 0; tj < nz - 1; tj += TERRAIN_TILE) {
      for (let ti = 0; ti < nx - 1; ti += TERRAIN_TILE) {
        const i1 = Math.min(nx - 1, ti + TERRAIN_TILE), j1 = Math.min(nz - 1, tj + TERRAIN_TILE);
        const w = i1 - ti + 1, h = j1 - tj + 1;
        const pos = new Float32Array(w * h * 3), nor = new Float32Array(w * h * 3), col = new Float32Array(w * h * 3), uv = new Float32Array(w * h * 2);
        for (let j = tj; j <= j1; j++) {
          for (let i = ti; i <= i1; i++) {
            const k = j * nx + i, v = (j - tj) * w + (i - ti);
            const x = x0 + i * cell, z = z0 + j * cell;
            // border and seam vertices stay put so neighbouring grids meet exactly
            const edgeV = i === 0 || j === 0 || i === nx - 1 || j === nz - 1 || inHole(x, z);
            const jit = edgeV ? 0 : K[k] === 1 ? 2.2 : fine ? 0.6 : 2;
            pos[v * 3] = x + (U.hash2(i, j, 7) - 0.5) * jit;
            pos[v * 3 + 1] = HV[k];
            pos[v * 3 + 2] = z + (U.hash2(i, j, 9) - 0.5) * jit;
            nor.set(NRM.subarray(k * 3, k * 3 + 3), v * 3);
            col.set(COL.subarray(k * 3, k * 3 + 3), v * 3);
            uv[v * 2] = x / 9;
            uv[v * 2 + 1] = z / 9;
          }
        }
        const idx = [];
        for (let j = tj; j < j1; j++) {
          for (let i = ti; i < i1; i++) {
            const k = j * nx + i;
            if (K[k] === 1 && K[k + 1] === 1 && K[k + nx] === 1 && K[k + nx + 1] === 1) continue;
            if (hole && inHole(x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell)) continue;
            const a = (j - tj) * w + (i - ti), b2 = a + 1, c2 = a + w, d = c2 + 1;
            idx.push(a, c2, b2, b2, c2, d);
          }
        }
        if (!idx.length) continue;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        geo.setIndex(idx);
        geo.computeBoundingSphere();
        const m = this.add(geo, this.landMat, 'terrain');
        m.receiveShadow = true;
        this.cullable(m, true);
      }
    }
  }

  // Terrain height (bilinear), or null over the void / outside the land.
  heightAt(x, z) {
    for (const t of [this.terrain, this.terrainOuter]) {
      if (!t || !t.H) continue;
      const fx = (x - t.x0) / t.cell, fz = (z - t.z0) / t.cell;
      const i = Math.floor(fx), j = Math.floor(fz);
      if (i < 0 || j < 0 || i >= t.nx - 1 || j >= t.nz - 1) continue;
      const k = j * t.nx + i, u = fx - i, v = fz - j;
      const kn = (v < 0.5 ? k : k + t.nx) + (u < 0.5 ? 0 : 1);
      if (t.K[kn] === 1) return null;
      const H = t.H;
      return (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + t.nx] * (1 - u) + H[k + t.nx + 1] * u) * v;
    }
    return null;
  }
  // 0 land, 1 void, 2 under a road.
  landKind(x, z) {
    const t = this.terrain;
    if (!t || !t.K) return 1;
    const i = Math.round((x - t.x0) / t.cell), j = Math.round((z - t.z0) / t.cell);
    if (i < 0 || j < 0 || i >= t.nx || j >= t.nz) return this.valley ? 0 : 1;
    return t.K[j * t.nx + i];
  }
  groundAt(x, z, fallback) {
    const h = this.heightAt(x, z);
    return h === null ? (fallback !== undefined ? fallback : this.voidY) : h;
  }
  // Distance from (x, z) to the nearest road edge (beyond the shoulders), from the terrain grid.
  edgeAt(x, z) {
    const t = this.terrain;
    const i = Math.round((x - t.x0) / t.cell), j = Math.round((z - t.z0) / t.cell);
    if (i < 0 || j < 0 || i >= t.nx || j >= t.nz) return 999;
    return t.E[j * t.nx + i];
  }

  // ---------- materials ----------
  // Animated clay water for ponds, lakes, rivers, reservoirs, water roads and waterfalls
  // (vertical sheets). o: {color, deep, foam, opacity, flow: pattern units/s along v (or
  // [x, z] in world mode), world: pattern from world xz (lakes) instead of uv (channels: u
  // across, v along), scale, across: pattern repeats across a channel, edge: foam width at the
  // banks (uv.x), outer: foam only toward uv.x = 1 (discs), fall: waterfall streaks, wave}
  waterMaterial(o = {}) {
    const flow = Array.isArray(o.flow) ? o.flow : [0, o.flow || 0];
    const mat = new THREE.ShaderMaterial({
      uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
        uTime: this.uTime,
        uShallow: { value: new THREE.Color(o.color || '#7fd3f0') },
        uDeep: { value: new THREE.Color(o.deep || '#3a8fd0') },
        uFoam: { value: new THREE.Color(o.foam || '#ffffff') },
        uFlow: { value: new THREE.Vector2(flow[0], flow[1]) },
        uScale: { value: o.scale || 1 },
        uWorld: { value: o.world ? 1 : 0 },
        uAcross: { value: o.across || 1 },
        uEdge: { value: o.edge || 0 },
        uOuter: { value: o.outer ? 1 : 0 },
        uFall: { value: o.fall ? 1 : 0 },
        uOpacity: { value: o.opacity !== undefined ? o.opacity : 0.9 },
        uWave: { value: o.wave !== undefined ? o.wave : 0.05 },
      }),
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      transparent: o.opacity !== undefined && o.opacity < 1,
      side: o.side || THREE.FrontSide,
      depthWrite: o.opacity === undefined || o.opacity >= 1,
      fog: true,
    });
    return this.keep(mat);
  }
  // Flowing, glowing lava (world-space pattern). o: {scale, hot, lava, crust}
  lavaMaterial(o = {}) {
    const key = 'lava' + (o.scale || 1), custom = o.hot || o.lava || o.crust;
    if (this.matCache[key] && !custom) return this.matCache[key];
    const th = this.theme;
    const mat = new THREE.ShaderMaterial({
      uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
        uTime: this.uTime,
        uWave: { value: 0 },
        uHot: { value: new THREE.Color(o.hot || th.lavaHot || '#ffd166') },
        uLava: { value: new THREE.Color(o.lava || th.lava || '#ff7a2f') },
        uCrust: { value: new THREE.Color(o.crust || '#5a2234') },
        uScale: { value: o.scale || 1 },
      }),
      vertexShader: WATER_VERT,
      fragmentShader: LAVA_FRAG,
      fog: true,
    });
    if (!custom) this.matCache[key] = mat;
    return this.keep(mat);
  }
  // Soft additive glow for flat ribbons (boost pads, anti-gravity strips). shape 0: soft
  // rectangle over uv 0..1, 1: a band across u only.
  flatGlowMaterial(color, shape, pulse) {
    const key = 'fg' + color + shape + (pulse ? 'p' : '');
    if (this.matCache[key]) return this.matCache[key];
    const mat = new THREE.ShaderMaterial({
      uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
        uColor: { value: new THREE.Color(color) },
        uGlow: this.uGlow,
        uTime: this.uTime,
        uShape: { value: shape },
        uPulse: { value: pulse ? 1 : 0 },
      }),
      vertexShader: FLAT_GLOW_VERT,
      fragmentShader: FLAT_GLOW_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    });
    return (this.matCache[key] = this.keep(mat));
  }
  // An additive glow sprite (built in bulk by buildGlows). mode: 0 steady, 1 pulse, 2 flicker, 3 shimmer.
  glow(x, y, z, size, color, mode = 0) {
    this.glows.push({ x, y, z, size, color, mode });
  }
  buildGlows() {
    if (!this.glows.length) return;
    const cells = new Map();
    for (const g of this.glows) {
      const key = Math.floor(g.x / CHUNK) + ',' + Math.floor(g.z / CHUNK);
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(g);
    }
    const mat = this.keep(
      new THREE.ShaderMaterial({
        uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), { uTime: this.uTime, uGlow: this.uGlow }),
        vertexShader: GLOW_VERT,
        fragmentShader: GLOW_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: true,
      }),
    );
    const c = new THREE.Color();
    this.glowMeshes = [];
    for (const list of cells.values()) {
      const geo = new THREE.InstancedBufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
      geo.setIndex([0, 1, 2, 0, 2, 3]);
      const P = new Float32Array(list.length * 3), C = new Float32Array(list.length * 4), S = new Float32Array(list.length * 2);
      let mx = 0, my = 0, mz = 0;
      list.forEach((g, i) => {
        P.set([g.x, g.y, g.z], i * 3);
        c.set(g.color);
        C.set([c.r, c.g, c.b, g.mode], i * 4);
        S.set([g.size, (g.x * 0.37 + g.z * 0.71) % TAU], i * 2);
        mx += g.x;
        my += g.y;
        mz += g.z;
      });
      geo.setAttribute('gPos', new THREE.InstancedBufferAttribute(P, 3));
      geo.setAttribute('gCol', new THREE.InstancedBufferAttribute(C, 4));
      geo.setAttribute('gSize', new THREE.InstancedBufferAttribute(S, 2));
      geo.instanceCount = list.length;
      const ctr = new THREE.Vector3(mx / list.length, my / list.length, mz / list.length);
      let r = 0;
      for (const g of list) r = Math.max(r, Math.hypot(g.x - ctr.x, g.y - ctr.y, g.z - ctr.z) + g.size);
      geo.boundingSphere = new THREE.Sphere(ctr, r);
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = 2;
      m.matrixAutoUpdate = false;
      this.scene.add(m);
      this.keep(geo);
      this.glowMeshes.push(m);
      this.chunks.push({ mesh: m, c: ctr, r, far: false, glow: true });
    }
    this.glows = [];
  }

  // ---------- road textures ----------
  canvasTex(w, h, draw, o = {}) {
    const c = Clay.makeCanvas(w, h);
    draw(c.getContext('2d'), w, h);
    const t = this.keep(new THREE.CanvasTexture(c));
    t.wrapS = t.wrapT = o.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }
  roadTexture(style) {
    if (this.texCache[style]) return this.texCache[style];
    const th = this.theme;
    const rnd = U.rng(style.length * 37 + 11);
    const smear = (g, w, h, n, a) => {
      for (let k = 0; k < n; k++) {
        g.fillStyle = rnd() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 1.2})`;
        g.beginPath();
        g.ellipse(rnd() * w, rnd() * h, 6 + rnd() * 14, 3 + rnd() * 6, rnd() * 3, 0, TAU);
        g.fill();
      }
    };
    let t;
    if (style === 'rainbow') {
      t = this.canvasTex(128, 256, (g) => {
        const cols = ['#ff6f91', '#ffb347', '#ffe066', '#7ddc6f', '#58b4ff', '#b48cff'];
        cols.forEach((col, i) => {
          g.fillStyle = col;
          g.fillRect((i * 128) / cols.length, 0, 128 / cols.length + 1, 256);
        });
        g.fillStyle = 'rgba(255,255,255,0.35)';
        for (let y = 0; y < 256; y += 32) g.fillRect(0, y, 128, 3);
      });
    } else if (style === 'wood') {
      t = this.canvasTex(128, 256, (g) => {
        g.fillStyle = '#b07a4f';
        g.fillRect(0, 0, 128, 256);
        for (let y = 0; y < 256; y += 32) {
          g.fillStyle = y % 64 ? '#a46f45' : '#bb8659';
          g.fillRect(0, y + 2, 128, 28);
          g.strokeStyle = 'rgba(90,50,30,0.25)';
          g.lineWidth = 1;
          for (let k = 0; k < 3; k++) {
            g.beginPath();
            const yy = y + 7 + k * 7 + rnd() * 3;
            g.moveTo(0, yy);
            g.bezierCurveTo(40, yy + rnd() * 4 - 2, 90, yy + rnd() * 4 - 2, 128, yy);
            g.stroke();
          }
          g.fillStyle = 'rgba(70,40,30,0.4)';
          g.fillRect(0, y, 128, 2);
          g.fillStyle = 'rgba(70,40,30,0.5)';
          for (const x of [10, 118]) g.fillRect(x, y + 13, 3, 3);
        }
      });
    } else if (style === 'ice') {
      t = this.canvasTex(128, 256, (g) => {
        const grd = g.createLinearGradient(0, 0, 128, 0);
        grd.addColorStop(0, '#bfe0ff');
        grd.addColorStop(0.5, '#d9eeff');
        grd.addColorStop(1, '#bfe0ff');
        g.fillStyle = grd;
        g.fillRect(0, 0, 128, 256);
        smear(g, 128, 256, 24, 0.05);
        g.strokeStyle = 'rgba(255,255,255,0.8)';
        g.lineWidth = 1.5;
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
      });
    } else if (style === 'snow') {
      t = this.canvasTex(128, 256, (g) => {
        g.fillStyle = '#dfe6f2';
        g.fillRect(0, 0, 128, 256);
        smear(g, 128, 256, 50, 0.05);
        // two packed tyre ruts with tread marks
        for (const cx of [36, 92]) {
          const grd = g.createLinearGradient(cx - 14, 0, cx + 14, 0);
          grd.addColorStop(0, 'rgba(160,178,210,0)');
          grd.addColorStop(0.5, 'rgba(150,168,204,0.55)');
          grd.addColorStop(1, 'rgba(160,178,210,0)');
          g.fillStyle = grd;
          g.fillRect(cx - 14, 0, 28, 256);
          g.fillStyle = 'rgba(120,140,180,0.22)';
          for (let y = 0; y < 256; y += 10) for (const ox of [-7, 3]) g.fillRect(cx + ox, y, 4, 5);
        }
        g.fillStyle = 'rgba(255,255,255,0.9)';
        for (let k = 0; k < 60; k++) g.fillRect(rnd() * 128, rnd() * 256, 1.5, 1.5);
        g.fillStyle = th.roadLine;
        g.globalAlpha = 0.55;
        g.fillRect(4, 0, 3, 256);
        g.fillRect(121, 0, 3, 256);
        g.globalAlpha = 1;
      });
    } else if (style === 'stone') {
      t = this.canvasTex(128, 256, (g) => {
        g.fillStyle = '#6f6680';
        g.fillRect(0, 0, 128, 256);
        const cols = ['#b8afc6', '#a99fb8', '#c6bdd2', '#9f96ad', '#b3a8c0'];
        for (let row = 0; row < 16; row++) {
          const y = row * 16, offx = row % 2 ? 0 : -10;
          for (let x = offx; x < 128; x += 20 + Math.floor(rnd() * 4)) {
            g.fillStyle = cols[Math.floor(rnd() * cols.length)];
            Clay.rrect(g, x + 1.5, y + 1.5, 17, 13, 5);
            g.fill();
            g.fillStyle = 'rgba(255,255,255,0.18)';
            Clay.rrect(g, x + 3, y + 2.5, 10, 4, 2);
            g.fill();
          }
        }
      });
    } else if (style === 'dirt') {
      t = this.canvasTex(128, 256, (g) => {
        g.fillStyle = this.def.theme === 'meadow' ? th.dirt : '#a77d5c';
        g.fillRect(0, 0, 128, 256);
        smear(g, 128, 256, 60, 0.06);
        for (const cx of [38, 90]) {
          g.fillStyle = 'rgba(80,50,30,0.16)';
          g.fillRect(cx - 9, 0, 18, 256);
        }
        for (let k = 0; k < 80; k++) {
          g.fillStyle = rnd() < 0.5 ? 'rgba(70,45,30,0.4)' : 'rgba(255,240,220,0.35)';
          g.beginPath();
          g.ellipse(rnd() * 128, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 1.5, 0, 0, TAU);
          g.fill();
        }
      });
    } else if (style === 'metal') {
      t = this.canvasTex(128, 256, (g) => {
        g.fillStyle = '#3b4660';
        g.fillRect(0, 0, 128, 256);
        for (let y = 0; y < 256; y += 64) {
          g.fillStyle = y % 128 ? '#36405a' : '#404c68';
          g.fillRect(14, y + 2, 100, 60);
          g.fillStyle = 'rgba(20,24,40,0.6)';
          g.fillRect(0, y, 128, 2);
          g.fillStyle = 'rgba(200,220,255,0.25)';
          for (const x of [20, 108]) for (const yy of [8, 56]) g.fillRect(x, y + yy, 3, 3);
        }
        g.fillStyle = 'rgba(20,24,40,0.5)';
        g.fillRect(63, 0, 2, 256);
        g.fillStyle = '#2a3348';
        g.fillRect(0, 0, 14, 256);
        g.fillRect(114, 0, 14, 256);
      });
      // the glowing parts: edge strips and chevrons, scrolled forward in update()
      this.metalGlowTex = this.canvasTex(128, 256, (g) => {
        g.fillStyle = '#000000';
        g.fillRect(0, 0, 128, 256);
        g.fillStyle = '#ffffff';
        g.fillRect(4, 0, 6, 256);
        g.fillRect(118, 0, 6, 256);
        g.fillStyle = '#9ff8ff';
        for (const y0 of [40, 168]) {
          g.beginPath();
          g.moveTo(40, y0 + 36);
          g.lineTo(64, y0);
          g.lineTo(88, y0 + 36);
          g.lineTo(78, y0 + 36);
          g.lineTo(64, y0 + 16);
          g.lineTo(50, y0 + 36);
          g.closePath();
          g.fill();
        }
      });
    } else {
      t = this.canvasTex(128, 256, (g) => {
        g.fillStyle = th.road;
        g.fillRect(0, 0, 128, 256);
        smear(g, 128, 256, 46, 0.05);
        // faint tyre polish
        g.fillStyle = 'rgba(40,20,50,0.05)';
        for (const cx of [34, 94]) g.fillRect(cx - 8, 0, 16, 256);
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
      });
    }
    return (this.texCache[style] = t);
  }
  roadMat(style) {
    const key = 'road-' + style;
    if (this.matCache[key]) return this.matCache[key];
    let m;
    if (style === 'water') {
      m = this.waterMaterial({ color: '#7fdaf5', deep: '#2f86c6', flow: 2, across: 1.4, scale: 3, edge: 0.14, wave: 0.03, opacity: 1 });
    } else {
      const tex = this.roadTexture(style);
      const rough = style === 'ice' ? 0.35 : style === 'metal' ? 0.5 : style === 'snow' ? 0.9 : 0.8;
      m = this.keep(Clay3D.material({ map: tex, wobble: 0, rim: 0.25, bumpScale: 0.3, rough, metal: style === 'metal' ? 0.25 : 0 }));
      if (style === 'metal') {
        m.emissive = new THREE.Color('#5ff0ff');
        m.emissiveMap = this.metalGlowTex;
        m.emissiveIntensity = 1.1;
      } else if (style === 'rainbow') {
        m.emissive = new THREE.Color('#ffffff');
        m.emissiveMap = tex;
        m.emissiveIntensity = 0.25;
      }
    }
    return (this.matCache[key] = m);
  }

  // ---------- roads ----------
  // Consecutive sample runs of a path split where key(i) changes, at gaps and every maxLen
  // samples. Each run includes the next run's first sample so neighbouring runs meet.
  runs(p, key, maxLen = 120) {
    const out = [];
    const gap = this.pinfo[p.index].gap;
    const total = p.closed ? p.n : p.n - 1;
    let cur = null;
    for (let i = 0; i < total; i++) {
      const j = p.wrap(i + 1);
      if (gap[i] || gap[j]) {
        cur = null;
        continue;
      }
      const kk = key(i);
      if (!cur || cur.key !== kk || cur.ids.length > maxLen) {
        cur = { key: kk, ids: [i] };
        out.push(cur);
      }
      cur.ids.push(j);
    }
    return out;
  }

  // A ribbon over sample indices ids between lateral offsets dA(i)..dB(i), following the banked
  // surface and lifted along its normal. o: {across, uAcross (u = 0..1 across), crown, vScale, color}
  ribbon(p, ids, dA, dB, lift, o = {}) {
    const across = o.across || 2;
    const n = ids.length, m = across + 1;
    const pos = new Float32Array(n * m * 3), uvs = new Float32Array(n * m * 2), cols = new Float32Array(n * m * 3);
    const col = o.color ? new THREE.Color(o.color) : null;
    const s0 = p.s[ids[0]], v = {};
    const idx = [];
    for (let r = 0; r < n; r++) {
      const i = ids[r];
      const a = dA(i), b = dB(i), s = s0 + r * p.step;
      for (let k = 0; k < m; k++) {
        const t = k / across, d = a + (b - a) * t;
        this.gp(p, i, d, lift + (o.crown ? (1 - (2 * t - 1) ** 2) * o.crown : 0), v);
        const q = (r * m + k) * 3;
        pos[q] = v.x;
        pos[q + 1] = v.y;
        pos[q + 2] = v.z;
        uvs[(r * m + k) * 2] = o.uAcross ? t : d / 4;
        uvs[(r * m + k) * 2 + 1] = s / (o.vScale || 12);
        if (col) {
          const w = (U.hash2(i, k, 3) - 0.5) * 0.06;
          cols[q] = col.r + w;
          cols[q + 1] = col.g + w;
          cols[q + 2] = col.b + w;
        } else cols[q] = cols[q + 1] = cols[q + 2] = 1;
      }
      if (r > 0) {
        const r0 = (r - 1) * m, r1 = r * m;
        // counter-clockwise seen from above when dA < dB (left to right)
        for (let k = 0; k < across; k++) idx.push(r0 + k, r0 + k + 1, r1 + k, r0 + k + 1, r1 + k + 1, r1 + k);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // A strip over the road from s0 to s1 (any s, interpolated) between lateral offsets a..b
  // (numbers or (pt) => d), on the banked surface, lifted along the normal by lift plus
  // o.rise(u along, t across). uv: u across 0..1, v = (s - s0) / (s1 - s0) with o.vNorm, else s / vScale.
  strip(p, s0, s1, a, b, lift, o = {}) {
    const across = o.across || 1, m = across + 1;
    const rows = Math.max(1, Math.ceil((s1 - s0) / (o.step || 1)));
    const pos = [], uvs = [], cols = [], idx = [];
    const col = o.color ? new THREE.Color(o.color) : null;
    const pt = {};
    for (let r = 0; r <= rows; r++) {
      const u = r / rows, s = s0 + (s1 - s0) * u;
      p.point(s, 0, pt);
      const A = typeof a === 'function' ? a(pt) : a, B = typeof b === 'function' ? b(pt) : b;
      const bk = pt.bank, l = Math.sqrt(1 + bk * bk);
      for (let k = 0; k < m; k++) {
        const t = k / across, d = A + (B - A) * t;
        // ride on the road's crown (see buildRoads)
        const roadCrown = 0.04 * Math.max(0, 1 - (d / pt.hw) ** 2);
        const h = (lift + roadCrown + (o.rise ? o.rise(u, t) : 0) + (o.crown ? (1 - (2 * t - 1) ** 2) * o.crown : 0)) / l;
        pos.push(pt.x + pt.nx * (d + bk * h), pt.yc - d * bk + h, pt.z + pt.nz * (d + bk * h));
        uvs.push(t, o.vNorm ? u : s / (o.vScale || 12));
        if (col) cols.push(col.r, col.g, col.b);
        else cols.push(1, 1, 1);
      }
      if (r > 0) {
        const r0 = (r - 1) * m, r1 = r * m;
        for (let k = 0; k < across; k++) idx.push(r0 + k, r0 + k + 1, r1 + k, r0 + k + 1, r1 + k + 1, r1 + k);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  buildRoads() {
    const T = this.track, th = this.theme;
    // big screen-filling surfaces skip the bump map (cheaper fragments, the grain colour stays)
    const shoulderMat = this.keep(Clay3D.material({ vertexColors: true, wobble: 0, rim: 0.3, bump: false }));
    for (const p of T.paths) {
      const main = !p.branch;
      for (const run of this.runs(p, (i) => p.style[i])) {
        const style = run.key, ids = run.ids;
        const vScale = style === 'rainbow' ? 6 : 12;
        this.put(this.ribbon(p, ids, (i) => -p.hw[i], (i) => p.hw[i], main ? 0.07 : 0.05, { across: 4, uAcross: true, crown: style === 'water' ? 0 : 0.04, vScale }), this.roadMat(style), { cast: false, far: true, name: 'road' });
        // shoulders
        let shCol = SHOULDER_COL[style] || th.shoulder;
        if (shCol === 'dirt') shCol = th.dirt;
        if (style === 'stone' && this.def.theme === 'lava') shCol = th.shoulder;
        for (const side of [-1, 1]) {
          const inner = (i) => side * (p.hw[i] + (main ? 0.8 : 0)), outer = (i) => side * (p.hw[i] + p.sh[i]);
          const g = this.ribbon(p, ids, side < 0 ? outer : inner, side < 0 ? inner : outer, main ? 0.03 : 0.015, { across: 2, color: shCol, vScale: 8 });
          this.put(g, shoulderMat, { cast: false, far: true, name: 'shoulder' });
        }
        if (style === 'rainbow') this.rainbowUnderside(p, ids);
      }
      // curbs on the main road, glowing rails wherever the road is anti-gravity
      const info = this.pinfo[p.index];
      const edge = (i) => (p.ag[i] ? 'ag' : main && (p.style[i] === 'road' || ((p.style[i] === 'snow' || p.style[i] === 'stone') && info.corner[i])) ? 'curb' : '');
      let prevAg = !!p.ag[p.wrap(-1)] && p.closed;
      for (const run of this.runs(p, edge)) {
        if (run.key === 'curb') for (const side of [-1, 1]) this.put(this.curbGeo(p, run.ids, side), this.stillMat, { cast: false, far: true, name: 'curbs' });
        if (run.key === 'ag') {
          for (const side of [-1, 1]) this.agRail(p, run.ids, side);
          if (!prevAg) this.agPanel(p, p.s[run.ids[0]]);
        }
        prevAg = run.key === 'ag';
      }
    }
  }

  // Red-and-white (or theme) clay curbs along a run of the road edge.
  curbGeo(p, ids, side) {
    const th = this.theme;
    const ca = new THREE.Color(th.curb[0]), cb = new THREE.Color(th.curb[1]);
    const verts = [], cols = [], idx = [];
    const v = {};
    ids.forEach((i, r) => {
      const d0 = side * p.hw[i], d1 = side * (p.hw[i] + 0.85);
      const stripe = Math.floor(p.s[i] / 2.2) % 2 ? ca : cb;
      for (const [d, h] of [[d0, 0.05], [(d0 + d1) / 2, 0.16], [d1, 0.05]]) {
        this.gp(p, i, d, h, v);
        verts.push(v.x, v.y, v.z);
        cols.push(stripe.r, stripe.g, stripe.b);
      }
      if (r > 0) {
        const r0 = (r - 1) * 3, r1 = r * 3;
        for (let k = 0; k < 2; k++) {
          if (side > 0) idx.push(r0 + k, r0 + k + 1, r1 + k, r0 + k + 1, r1 + k + 1, r1 + k);
          else idx.push(r0 + k, r1 + k, r0 + k + 1, r0 + k + 1, r1 + k, r1 + k + 1);
        }
      }
    });
    return this.geo(verts, cols, idx);
  }
  // Build an indexed geometry from flat arrays (uv zeroed unless given).
  geo(verts, cols, idx, uvs) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs || new Array((verts.length / 3) * 2).fill(0), 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // Anti-gravity: a raised neon rail on the road edge, a soft cyan glow spilling over the road
  // and sparkles along it.
  agRail(p, ids, side) {
    const verts = [], idx = [];
    const v = {};
    ids.forEach((i, r) => {
      const e = p.hw[i];
      for (const [d, h] of [[e - 0.45, 0.04], [e - 0.4, 0.22], [e + 0.3, 0.22], [e + 0.35, 0.04]]) {
        this.gp(p, i, side * d, h, v);
        verts.push(v.x, v.y, v.z);
      }
      if (r > 0) {
        const r0 = (r - 1) * 4, r1 = r * 4;
        for (let k = 0; k < 3; k++) {
          if (side > 0) idx.push(r0 + k, r0 + k + 1, r1 + k, r0 + k + 1, r1 + k + 1, r1 + k);
          else idx.push(r0 + k, r1 + k, r0 + k + 1, r0 + k + 1, r1 + k, r1 + k + 1);
        }
      }
    });
    this.put(this.geo(verts, new Array(verts.length).fill(1), idx), this.neonMat, { cast: false, receive: false, far: true, name: 'ag-rail' });
    const lo = (i) => side * (p.hw[i] - 1.8), hi = (i) => side * (p.hw[i] + 1.2);
    this.put(this.ribbon(p, ids, side < 0 ? hi : lo, side < 0 ? lo : hi, 0.12, { across: 1, uAcross: true }), this.flatGlowMaterial('#4fe8ff', 1, false), { cast: false, receive: false, name: 'ag-glow' });
    for (let r = 2; r < ids.length; r += 7) {
      const i = ids[r];
      this.gp(p, i, side * (p.hw[i] - 0.05), 0.55, v);
      this.glow(v.x, v.y, v.z, 1.5, '#6ff2ff', 3);
    }
  }
  // The glowing strip across the road where anti-gravity begins.
  agPanel(p, s) {
    const a = (pt) => -pt.hw, b = (pt) => pt.hw;
    this.put(this.strip(p, s, s + 0.9, a, b, 0.13, { across: 6 }), this.neonMat, { cast: false, receive: false, name: 'ag-panel' });
    this.put(this.strip(p, s - 2.5, s + 3.4, a, b, 0.15, { across: 1, vNorm: true }), this.flatGlowMaterial('#4fe8ff', 0, true), { cast: false, receive: false, name: 'ag-panel-glow' });
  }

  rainbowUnderside(p, ids) {
    this.put(this.ribbon(p, ids, (i) => p.hw[i] + p.sh[i], (i) => -p.hw[i] - p.sh[i], -0.5, { across: 2, color: '#b48cff' }), this.stillMat, { cast: false, name: 'rainbow-under' });
    const bandMat = this.matCache.band || (this.matCache.band = this.keep(new THREE.MeshBasicMaterial({ color: '#ffe8a8', side: THREE.DoubleSide, fog: true })));
    for (const side of [-1, 1]) {
      const verts = [], idx = [];
      const v = {};
      ids.forEach((i, r) => {
        const d = side * (p.hw[i] + p.sh[i]);
        this.gp(p, i, d, 0, v);
        verts.push(v.x, v.y, v.z, v.x, v.y - 0.6, v.z);
        if (r > 0) idx.push((r - 1) * 2, (r - 1) * 2 + 1, r * 2, (r - 1) * 2 + 1, r * 2 + 1, r * 2);
      });
      this.put(this.geo(verts, new Array(verts.length).fill(1), idx), bandMat, { cast: false, receive: false, name: 'rainbow-band' });
    }
  }

  // ---------- walls & skirts ----------
  // Which wall a road sample gets: from its road style first, else the world's.
  wallStyle(p, i) {
    const st = p.style[i], theme = this.def.theme;
    if (p.ag[i] || st === 'metal') return 'tech';
    if (st === 'water') return 'channel';
    if (st === 'rainbow') return 'rail';
    if (st === 'stone') return theme === 'lava' ? 'castle' : 'parapet';
    if (st === 'ice') return theme === 'lava' ? 'castle' : 'ice';
    if (st === 'dirt' && (theme === 'alpine' || theme === 'snow')) return 'logs';
    return { meadow: 'hedge', snow: 'snow', lava: 'castle', alpine: 'snow' }[theme] || 'snow';
  }
  wallDepth(p, i) {
    return WALL_LOOKS[this.wallStyle(p, i)].depth;
  }

  buildWalls() {
    const T = this.track, th = this.theme;
    for (const p of T.paths) {
      for (const side of [-1, 1]) {
        const flags = side > 0 ? p.wallR : p.wallL;
        const runs = this.runs(p, (i) => flags[i] + ':' + (flags[i] === 1 ? this.wallStyle(p, i) : p.style[i] === 'rainbow' ? 'rainbow' : ''));
        runs.forEach((run, n) => {
          const [flag, style] = run.key.split(':');
          if (flag === '1') {
            const look = WALL_LOOKS[style];
            const col = look.col || th.wall;
            if (style === 'logs') this.logFence(p, run.ids, side);
            else {
              this.put(this.extrude(p, run.ids, side, look.prof, col, style), look.wob ? this.clayMat : this.stillMat, { far: true, name: 'walls' });
              if (style === 'castle') this.crenellate(p, run.ids, side);
              if (style === 'rail') this.railPosts(p, run.ids, side);
              if (style === 'tech') this.techTop(p, run.ids, side);
              if (style === 'snow' && this.def.theme === 'alpine' && !p.branch) this.safetyNets(p, run.ids, side);
            }
            // round off wall ends that stop at a drop or a gap
            const prev = runs[n - 1] || (p.closed && runs[runs.length - 1]), next = runs[n + 1] || (p.closed && runs[0]);
            const contiguous = (a, b) => a && b && p.wrap(a.ids[a.ids.length - 1]) === p.wrap(b.ids[0]);
            if (!(prev && prev.key.startsWith('1') && contiguous(prev, run))) this.wallCap(p, run.ids[0], side, col, look);
            if (!(next && next.key.startsWith('1') && contiguous(run, next))) this.wallCap(p, run.ids[run.ids.length - 1], side, col, look);
          } else if (flag === '0' && style !== 'rainbow') {
            if (this.valley) this.put(this.extrude(p, run.ids, side, [[0, 0.02], [0.35, -1.6], [0.1, -4.5]], th.rock, 'lip'), this.stillMat, { far: true, name: 'lip' });
            else this.put(this.extrude(p, run.ids, side, [[0, 0.02], [0.4, -2.5], [-0.6, -7.5], [-2.5, -10]], th.rock, 'skirt'), this.stillMat, { far: true, name: 'skirts' });
          }
        });
      }
      // a rock face where the road stops at a chasm
      for (const z of p.zones) {
        if (z.kind !== 'gap') continue;
        if (z.s0 > 1) this.chasmFace(p, z.s0 - 0.6, -1);
        if (z.s1 < p.length - 1) this.chasmFace(p, z.s1 + 0.6, 1);
      }
    }
  }

  extrude(p, ids, side, prof, color, style) {
    const verts = [], cols = [], uvs = [], idx = [];
    const base = new THREE.Color(color), stripe = new THREE.Color('#ff6f91');
    const m = prof.length;
    const v = {};
    const rough = style === 'skirt' || style === 'lip';
    ids.forEach((i, r) => {
      const e = p.hw[i] + p.sh[i];
      for (let k = 0; k < m; k++) {
        const [off, h] = prof[k];
        const wob = rough ? (noise3(p.x[i] * 0.3, k, p.z[i] * 0.3) - 0.5) * 1.6 : (noise3(p.x[i] * 0.5, k * 3, p.z[i] * 0.5) - 0.5) * 0.25;
        const d = side * (e + off + wob);
        if (rough) {
          // skirts hang straight down below the banked edge
          this.gp(p, i, d, 0, v);
          v.y += h + wob;
        } else this.gp(p, i, d, h + wob * 0.6, v);
        verts.push(v.x, v.y, v.z);
        let w = (U.hash2(i, k, 9) - 0.5) * 0.08;
        if (style === 'rail') {
          const c = Math.floor(p.s[i] / 1.5) % 2 ? stripe : base;
          cols.push(c.r, c.g, c.b);
        } else {
          if (WALL_LOOKS[style] && WALL_LOOKS[style].blocks && Math.floor(p.s[i] / 2.4 + (k > 1 ? 0.5 : 0)) % 2) w -= 0.06;
          if (rough) w -= (k / m) * 0.25;
          if (style === 'channel' && k < 2) w -= 0.12;
          cols.push(base.r + w, base.g + w, base.b + w);
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
    return this.geo(verts, cols, idx, uvs);
  }

  // A shared piece placed on the road edge, rolled with the bank.
  edgePiece(geo, p, i, d, h, ry = 0) {
    const v = this.gp(p, i, d, h);
    return GK.at(geo, v.x, v.y, v.z, Math.atan(p.bank[i]), -p.head[i] + ry, 0);
  }
  crenellate(p, ids, side) {
    const th = this.theme, list = [];
    for (let r = 0; r < ids.length; r += 4) {
      const i = ids[r];
      list.push(this.edgePiece(GK.box(1.3, 0.7, 0.9, th.wallTop, { seed: i, lump: 0.05, seg: 2, r: 0.14 }), p, i, side * (p.hw[i] + p.sh[i] + 0.45), 1.95));
    }
    this.put(GK.merge(list), this.clayMat, { far: true });
  }
  railPosts(p, ids, side) {
    const list = [];
    for (let r = 0; r < ids.length; r += 4) {
      const i = ids[r];
      list.push(this.edgePiece(GK.cyl(0.12, 0.14, 1.4, '#fff3c4', { segs: 8, lump: 0.01 }), p, i, side * (p.hw[i] + p.sh[i]), 0.1));
    }
    this.put(GK.merge(list), this.stillMat);
  }
  // Anti-gravity barriers carry a neon strip along the top and little lights.
  techTop(p, ids, side) {
    const verts = [], idx = [];
    const v = {};
    ids.forEach((i, r) => {
      const e = p.hw[i] + p.sh[i];
      for (const [d, h] of [[-0.02, 1.0], [-0.02, 1.16], [0.3, 1.16]]) {
        this.gp(p, i, side * (e + d), h, v);
        verts.push(v.x, v.y, v.z);
      }
      if (r > 0) {
        const r0 = (r - 1) * 3, r1 = r * 3;
        for (let k = 0; k < 2; k++) {
          if (side > 0) idx.push(r0 + k, r0 + k + 1, r1 + k, r0 + k + 1, r1 + k + 1, r1 + k);
          else idx.push(r0 + k, r1 + k, r0 + k + 1, r0 + k + 1, r1 + k, r1 + k + 1);
        }
      }
      if (r % 9 === 4) {
        this.gp(p, i, side * (e + 0.1), 1.35, v);
        this.glow(v.x, v.y, v.z, 1.3, '#6ff2ff', 3);
      }
    });
    this.put(this.geo(verts, new Array(verts.length).fill(1), idx), this.neonMat, { cast: false, receive: false, far: true });
  }
  // Orange safety nets on the snowbanks of a ski course: around corners and all along the final
  // section of a point-to-point run.
  safetyNets(p, ids, side) {
    const T = this.track, info = this.pinfo[p.index];
    const want = (i) => info.corner[i] || (T.p2p && T.sections.length > 1 && T.sectionAt(p.s[i]) === T.sections.length);
    let mat = this.matCache.net;
    if (!mat) {
      mat = this.matCache.net = this.keep(Clay3D.material({ map: this.netTexture(), wobble: 0, rim: 0.1, bump: false, side: THREE.DoubleSide }));
      mat.alphaTest = 0.4;
    }
    for (let a = 0; a < ids.length; ) {
      if (!want(ids[a])) {
        a++;
        continue;
      }
      let b = a;
      while (b + 1 < ids.length && want(ids[b + 1])) b++;
      if (b - a >= 8) {
        const sub = ids.slice(a, b + 1);
        this.put(this.extrude(p, sub, side, [[0.45, 1.0], [0.45, 2.5]], '#ffffff', 'net'), mat, { cast: false, far: true, name: 'nets' });
        const list = [];
        for (let r = 0; r < sub.length; r += 4) list.push(this.edgePiece(GK.cyl(0.07, 0.08, 2.0, '#3b2a4a', { segs: 5, lump: 0 }), p, sub[r], side * (p.hw[sub[r]] + p.sh[sub[r]] + 0.45), 1.6));
        this.put(GK.merge(list), this.stillMat);
      }
      a = b + 1;
    }
  }
  netTexture() {
    if (this.texCache.net) return this.texCache.net;
    const t = this.canvasTex(64, 64, (g) => {
      g.clearRect(0, 0, 64, 64);
      g.strokeStyle = '#ff7a2f';
      g.lineWidth = 3;
      for (let k = -64; k < 128; k += 12) {
        g.beginPath();
        g.moveTo(k, 0);
        g.lineTo(k + 64, 64);
        g.moveTo(k + 64, 0);
        g.lineTo(k, 64);
        g.stroke();
      }
      g.fillStyle = '#ff7a2f';
      g.fillRect(0, 0, 64, 5);
      g.fillRect(0, 59, 64, 5);
    });
    t.wrapT = THREE.ClampToEdgeWrapping;
    return (this.texCache.net = t);
  }
  // Rustic fence: two log rails on stout posts with snowy caps.
  logFence(p, ids, side) {
    const col = WALL_LOOKS.logs.col;
    const ring = [];
    for (let k = 0; k <= 6; k++) {
      const a = (k / 6) * TAU;
      ring.push([Math.cos(a) * 0.17, Math.sin(a) * 0.17]);
    }
    for (const h of [0.45, 0.95]) this.put(this.extrude(p, ids, side, ring.map(([o, y]) => [0.15 + o, h + y]), col, 'log'), this.stillMat, { far: true });
    const list = [];
    const snow = this.def.theme === 'alpine' || this.def.theme === 'snow';
    for (let r = 0; r < ids.length; r += 4) {
      const i = ids[r], d = side * (p.hw[i] + p.sh[i] + 0.15);
      list.push(this.edgePiece(GK.cyl(0.24, 0.28, 1.6, '#7a4b30', { segs: 7, seed: i }), p, i, d, 0.55));
      if (snow) list.push(this.edgePiece(GK.blob(0.34, 0.16, 0.34, '#ffffff', { seed: i + 1, ws: 7, hs: 5 }), p, i, d, 1.4));
    }
    this.put(GK.merge(list), this.clayMat);
  }
  wallCap(p, i, side, col, look) {
    if (!look.prof) return;
    const top = Math.max(...look.prof.map((q) => q[1]));
    const d = side * (p.hw[i] + p.sh[i] + look.depth * 0.45);
    const g = look.wob ? GK.blob(look.depth * 0.6, top * 0.75 + 0.2, look.depth * 0.6, col, { seed: i }) : GK.box(look.depth + 0.3, top + 0.5, look.depth + 0.3, col, { seed: i, r: 0.2 });
    this.put(this.edgePiece(g, p, i, d, look.wob ? top * 0.35 : (top + 0.5) / 2 - 0.3), look.wob ? this.clayMat : this.stillMat);
  }
  // Vertical face across the road where it breaks off at a chasm.
  chasmFace(p, s, dir) {
    const pt = p.point(s, 0, {});
    const e = pt.hw + pt.sh, depth = this.valley ? 7 : 10;
    const verts = [], cols = [], idx = [];
    const c = new THREE.Color(this.theme.rock);
    const n = 8;
    for (let k = 0; k <= n; k++) {
      const d = -e + (2 * e * k) / n;
      const y = pt.yc - d * pt.bank;
      const wob = (noise3(pt.x * 0.3 + k, 1, pt.z * 0.3) - 0.5) * 1.5;
      verts.push(pt.x + pt.nx * d, y + 0.02, pt.z + pt.nz * d, pt.x + pt.nx * d + pt.tx * dir * wob, y - depth + wob * 2, pt.z + pt.nz * d + pt.tz * dir * wob);
      cols.push(c.r, c.g, c.b, c.r * 0.8, c.g * 0.8, c.b * 0.8);
      if (k > 0) {
        const a = (k - 1) * 2;
        // the face looks into the chasm
        if (dir < 0) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    this.put(this.geo(verts, cols, idx), this.stillMat, { far: true });
  }

  // ---------- boost pads, ice, mud, ramps, water ----------
  buildZones() {
    const T = this.track;
    this.padTex = this.chevronTexture();
    const padMat = this.keep(new THREE.MeshStandardMaterial({ map: this.padTex, emissive: 0xff9a3c, emissiveIntensity: 0.6, emissiveMap: this.padTex, roughness: 0.5, transparent: true }));
    const iceMat = this.keep(Clay3D.material({ color: 0xd9f0ff, rough: 0.25, wobble: 0, transparent: true, opacity: 0.78, rim: 0.2 }));
    const mudMat = this.keep(Clay3D.material({ color: 0x7a4b30, rough: 0.9, wobble: 0.04, rim: 0.4 }));
    for (const p of T.paths) {
      for (const z of p.zones) {
        if (z.kind === 'gap') continue;
        const a = (pt) => Math.max(z.d0, -pt.hw - pt.sh), b = (pt) => Math.min(z.d1, pt.hw + pt.sh);
        const s0 = z.s0, s1 = z.s1;
        if (z.kind === 'boost') {
          const g = this.strip(p, s0, s1, a, b, 0.1, { vScale: 3 });
          // v runs along the pad: re-base so chevrons point forward
          const uv = g.attributes.uv;
          for (let v = 0; v < uv.count; v++) uv.setY(v, -uv.getY(v));
          this.put(g, padMat, { cast: false, name: 'boost' });
          this.put(this.strip(p, s0 - 1.5, s1 + 1.5, (pt) => a(pt) - 1.2, (pt) => b(pt) + 1.2, 0.16, { vNorm: true }), this.flatGlowMaterial('#ff9a3c', 0, true), { cast: false, receive: false });
          const c = p.point((s0 + s1) / 2, (z.d0 + z.d1) / 2);
          this.glow(c.x, c.y + 0.7, c.z, Math.min(4, (z.d1 - z.d0) * 0.45 + 1.2), '#ffb35c', 1);
        } else if (z.kind === 'ice') {
          this.put(this.strip(p, s0, s1, a, b, 0.09, { across: 4, vScale: 6 }), iceMat, { cast: false, name: 'ice' });
        } else if (z.kind === 'mud') {
          this.put(this.strip(p, s0, s1, a, b, 0.1, { across: 3, crown: 0.12 }), mudMat, { cast: false, name: 'mud' });
        } else if (z.kind === 'ramp' || z.kind === 'glide' || z.kind === 'hump') {
          this.rampGeo(p, z);
        } else if (z.kind === 'shallow') {
          this.put(this.strip(p, s0, s1, a, b, 0.12, { across: 2 }), this.waterMaterial({ world: true, scale: 2.5, opacity: 0.75, wave: 0.02, color: '#9fe3f7', flow: [0, 0.4] }), { cast: false, receive: false, name: 'shallow' });
        } else if (z.kind === 'current') {
          // on a plain road, the stream is a sheet of flowing water (water roads flow already)
          const mid = p.indexAt((s0 + s1) / 2);
          if (p.style[mid] === 'water') continue;
          const w = (b({ hw: p.hw[mid], sh: p.sh[mid] }) - a({ hw: p.hw[mid], sh: p.sh[mid] })) / 12;
          this.put(this.strip(p, s0, s1, a, b, 0.11, { across: 2 }), this.waterMaterial({ flow: z.flow / 12, across: w, edge: 0.1, opacity: 0.62, wave: 0.02 }), { cast: false, receive: false, name: 'current' });
        } else if (z.kind === 'antigrav') {
          for (const d of [z.d0, z.d1]) {
            const dd = (pt) => U.clamp(d, -pt.hw, pt.hw);
            this.put(this.strip(p, s0, s1, (pt) => dd(pt) - 0.25, (pt) => dd(pt) + 0.25, 0.14, {}), this.neonMat, { cast: false, receive: false });
          }
        }
      }
    }
  }

  // Ramps (blue and white), glider ramps (with a glowing lip) and snowy moguls, banking-aware.
  rampGeo(p, z) {
    const kind = z.kind;
    const rise = kind === 'hump' ? (u) => z.h * Math.sin(Math.PI * u) : (u) => z.h * u;
    const cols = kind === 'glide' ? ['#3fd0ff', '#ffffff'] : kind === 'hump' ? [this.theme.shoulder, U.shade(this.theme.shoulder, -0.06)] : ['#58b4ff', '#fff6ea'];
    const cA = new THREE.Color(cols[0]), cB = new THREE.Color(cols[1]);
    const verts = [], cl = [], idx = [];
    const rows = Math.max(2, Math.ceil((z.s1 - z.s0) / 0.5));
    const pt = {};
    for (let r = 0; r <= rows; r++) {
      const u = r / rows, s = z.s0 + (z.s1 - z.s0) * u;
      p.point(s, 0, pt);
      const h = rise(u) + 0.08;
      const a = Math.max(z.d0, -pt.hw - pt.sh), b = Math.min(z.d1, pt.hw + pt.sh);
      const bk = pt.bank, l = Math.sqrt(1 + bk * bk);
      const stripe = kind === 'hump' ? (u > 0.5 ? cB : cA) : Math.floor(s / 1.4) % 2 ? cA : cB;
      // top-left, top-right, bottom-right, bottom-left
      for (const [d, y] of [[a, h], [b, h], [b, 0], [a, 0]]) {
        const k = y / l;
        verts.push(pt.x + pt.nx * (d + bk * k), pt.yc - d * bk + k, pt.z + pt.nz * (d + bk * k));
        cl.push(stripe.r, stripe.g, stripe.b);
      }
      if (r > 0) {
        const r0 = (r - 1) * 4, r1 = r * 4;
        idx.push(r0, r0 + 1, r1, r0 + 1, r1 + 1, r1); // top
        idx.push(r0 + 1, r0 + 2, r1 + 1, r0 + 2, r1 + 2, r1 + 1); // right side
        idx.push(r0 + 3, r0, r1 + 3, r0, r1, r1 + 3); // left side
      }
    }
    if (kind !== 'hump') {
      const r = rows * 4;
      idx.push(r, r + 1, r + 3, r + 1, r + 2, r + 3); // lip face
    }
    this.put(this.geo(verts, cl, idx), kind === 'hump' ? this.clayMat : this.stillMat, { far: true, name: 'ramps' });
    if (kind === 'glide') {
      // a neon lip and sparkles: this ramp opens the glider
      const s = z.s1 - 0.35;
      const a = (q) => Math.max(z.d0, -q.hw - q.sh), b = (q) => Math.min(z.d1, q.hw + q.sh);
      this.put(this.strip(p, s - 0.35, s + 0.35, a, b, z.h + 0.12, { across: 4 }), this.neonMat, { cast: false, receive: false });
      for (const f of [0.1, 0.5, 0.9]) {
        const q = p.point(s, 0);
        const d = U.lerp(a(q), b(q), f);
        const g = p.point(s, d);
        this.glow(g.x, g.y + z.h + 0.6, g.z, 2.6, '#6ff2ff', 1);
      }
    }
  }

  chevronTexture() {
    return this.canvasTex(64, 64, (g) => {
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
    });
  }
  checkerTexture() {
    if (this.texCache.checker) return this.texCache.checker;
    return (this.texCache.checker = this.canvasTex(128, 32, (g) => {
      for (let y = 0; y < 2; y++) {
        for (let x = 0; x < 8; x++) {
          g.fillStyle = (x + y) % 2 ? '#2b1838' : '#fff6ea';
          g.fillRect(x * 16, y * 16, 16, 16);
        }
      }
    }));
  }
  // A painted sign: clay lettering on a coloured board. lines: [text, size] pairs.
  signTexture(key, w, h, bg, fg, lines, o = {}) {
    if (this.texCache[key]) return this.texCache[key];
    return (this.texCache[key] = this.canvasTex(
      w,
      h,
      (g) => {
        g.fillStyle = bg;
        g.fillRect(0, 0, w, h);
        if (o.checker) {
          const q = h / 6;
          for (let x = 0; x < w / q; x++) {
            for (const y of [0, h - q]) {
              g.fillStyle = (x + (y ? 1 : 0)) % 2 ? '#2b1838' : '#fff6ea';
              g.fillRect(x * q, y, q, q);
            }
          }
        }
        g.strokeStyle = 'rgba(255,255,255,0.35)';
        g.lineWidth = Math.max(3, h * 0.04);
        Clay.rrect(g, g.lineWidth, g.lineWidth, w - g.lineWidth * 2, h - g.lineWidth * 2, h * 0.12);
        g.stroke();
        const total = lines.reduce((a, l) => a + l[1], 0);
        let y = h / 2 - total / 2;
        for (const [text, size] of lines) {
          y += size / 2;
          g.font = `700 ${size}px ${FONT}`;
          let sz = size;
          while (g.measureText(text).width > w * 0.9 && sz > 8) {
            sz -= 2;
            g.font = `700 ${sz}px ${FONT}`;
          }
          Clay.text(g, text, w / 2, y, sz, fg, { dark: U.shade(bg, -0.55) });
          y += size / 2;
        }
      },
      { clamp: true },
    ));
  }
  // A double-sided sign plane (w x h) centred at the origin of a local frame, facing -x (toward
  // racers driving along +x) and +x.
  signGeo(w, h, both = true) {
    const parts = [];
    const front = new THREE.PlaneGeometry(w, h);
    front.rotateY(-Math.PI / 2);
    parts.push(front);
    if (both) {
      const back = new THREE.PlaneGeometry(w, h);
      back.rotateY(Math.PI / 2);
      back.translate(0.02, 0, 0);
      parts.push(back);
    }
    for (const g of parts) GK.paint(g, '#ffffff', 0);
    return GK.merge(parts);
  }
  signMat(tex) {
    const key = 'sign' + tex.uuid;
    return this.matCache[key] || (this.matCache[key] = this.keep(Clay3D.material({ map: tex, wobble: 0, rim: 0.15, bump: false, rough: 0.6 })));
  }

  // ---------- start, finish, checkpoints, road ends ----------
  buildLines() {
    const T = this.track, p = T.main;
    const lineMat = this.keep(Clay3D.material({ map: this.checkerTexture(), wobble: 0, rim: 0.2 }));
    const line = (s) => this.put(this.strip(p, s - 1.25, s + 1.25, (pt) => -pt.hw, (pt) => pt.hw, 0.1, { vNorm: true }), lineMat, { cast: false, name: 'line' });
    line(T.startS);
    this.gridMarks();
    if (!T.p2p) return;
    line(T.finishS);
    this.finishArch(p, T.finishS);
    T.sections.forEach((sec, n) => {
      if (n > 0) this.checkpointArch(p, sec.s, n + 1, sec.name);
    });
    this.endCap(p, 0.6, -1);
    this.endCap(p, p.length - 0.6, 1);
  }
  // White grid boxes in front of each starting slot.
  gridMarks() {
    const T = this.track, p = T.main;
    for (let k = 0; k < 8; k++) {
      const g = T.gridSlot(k);
      const d = (k % 2 ? 1 : -1) * Math.min(3.6, p.hw[p.indexAt(T.startS)] * 0.45);
      const m = this.frame(p, g.s + 1.7, d, 0.12);
      const col = p.style[p.indexAt(g.s)] === 'road' ? '#fff6ea' : this.theme.roadLine;
      const parts = [GK.box(0.28, 0.05, 2.4, col, { seed: k, lump: 0, r: 0.02, seg: 1 })];
      for (const z of [-1.1, 1.1]) parts.push(GK.at(GK.box(1.3, 0.05, 0.24, col, { seed: k + 9, lump: 0, r: 0.02, seg: 1 }), -0.55, 0, z));
      this.putAt(GK.merge(parts), m, this.stillMat, { cast: false });
    }
  }
  // An inflatable clay arch over the road: round pillars, a striped half-ring and a banner.
  arch(p, s, o) {
    const pt = p.point(s, 0, {});
    const e = pt.hw + pt.sh + 0.9;
    const m = this.frame(p, s);
    const parts = [];
    const H = o.pillar || 5;
    for (const z of [-e, e]) {
      parts.push(GK.at(GK.cyl(1.1, 1.3, H, o.cols[0], { seed: z > 0 ? 3 : 4, segs: 12 }), 0, H / 2 - 0.4, z));
      parts.push(GK.at(GK.cyl(1.45, 1.6, 0.8, o.cols[1], { seed: 7, segs: 12 }), 0, 0, z));
    }
    const ring = GK.torus(e, 1.25, o.cols[0], { arc: Math.PI, ts: 28, rs: 10, seed: 5 });
    // candy stripes around the ring
    const pos = ring.attributes.position, col = ring.attributes.color;
    const cb = new THREE.Color(o.cols[1]);
    for (let v = 0; v < pos.count; v++) {
      const a = Math.atan2(pos.getY(v), pos.getX(v));
      if (Math.floor((a / Math.PI) * 14) % 2) col.setXYZ(v, cb.r, cb.g, cb.b);
    }
    ring.rotateY(Math.PI / 2);
    ring.translate(0, H - 0.4, 0);
    parts.push(ring);
    this.putAt(GK.merge(parts), m, this.clayMat, { name: 'arch' });
    if (o.tex) {
      const bw = Math.min(e * 1.5, 18), bh = bw / 4;
      const y = H - 0.4 + e * 0.62;
      const frameG = GK.box(0.5, bh + 0.5, bw + 0.5, o.cols[1], { seed: 11, lump: 0.04, r: 0.2 });
      frameG.translate(0, y, 0);
      this.putAt(frameG, m.clone(), this.clayMat);
      // both faces clear the frame
      const sign = this.signGeo(bw, bh);
      const sp = sign.attributes.position;
      for (let v = 0; v < sp.count; v++) sp.setX(v, sp.getX(v) < 0.01 ? -0.28 : 0.28);
      sign.translate(0, y, 0);
      this.putAt(sign, m.clone(), this.signMat(o.tex), { cast: false });
    }
    // lights along the ring
    const mw = new THREE.Vector3();
    for (let k = 1; k < 8; k++) {
      const a = (k / 8) * Math.PI;
      mw.set(0, H - 0.4 + Math.sin(a) * e, Math.cos(a) * e).applyMatrix4(m);
      this.glow(mw.x, mw.y, mw.z, 1.6, o.glow || '#fff2bd', 2);
    }
  }
  finishArch(p, s) {
    const tex = this.signTexture('finish', 512, 128, '#ff6f91', '#fff6ea', [['FINISH', 70]], { checker: true });
    this.arch(p, s, { cols: ['#2b1838', '#fff6ea'], tex, pillar: 6 });
  }
  checkpointArch(p, s, n, name) {
    const palette = [['#58b4ff', '#ffffff'], ['#ffb347', '#ffffff'], ['#7ddc6f', '#ffffff'], ['#c77dff', '#ffffff']][(n - 2) % 4];
    const tex = this.signTexture('section' + n, 512, 128, palette[0], '#ffffff', [['SECTION ' + n, 46], [String(name || '').toUpperCase(), 34]]);
    this.arch(p, s, { cols: palette, tex, pillar: 5, glow: palette[0] });
  }
  // The end of a point-to-point road: a striped barrier with a snow / hay bank behind it.
  endCap(p, s, dir) {
    const pt = p.point(s, 0, {});
    const e = pt.hw + pt.sh + 1.5;
    const m = this.frame(p, s);
    const th = this.theme;
    const parts = [];
    const bank = this.def.theme === 'alpine' || this.def.theme === 'snow' ? '#ffffff' : this.def.theme === 'lava' ? '#3d2f48' : '#d8b26a';
    for (let z = -e; z <= e + 0.01; z += 2.2) {
      parts.push(GK.at(GK.box(0.35, 1.2, 2.1, Math.round((z + e) / 2.2) % 2 ? th.curb[0] : th.curb[1], { seed: Math.round(z * 3), r: 0.12 }), 0, 0.75, z));
      parts.push(GK.at(GK.blob(1.6, 1.2 + U.hash2(z * 7, 3) * 0.8, 1.4, bank, { seed: Math.round(z * 5) + 40 }), dir * 2.2, 0.6, z + 0.7));
    }
    for (const z of [-e - 0.4, e + 0.4]) parts.push(GK.at(GK.cyl(0.18, 0.2, 2.2, '#8c8fae', { segs: 6 }), 0, 1.1, z));
    this.putAt(GK.merge(parts), m, this.clayMat, { far: true, name: 'endcap' });
  }

  // ---------- below the world ----------
  buildVoid() {
    const th = this.theme, b = this.track.bounds;
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    if (th.voidKind === 'lava') {
      const geo = new THREE.PlaneGeometry(2400, 2400, 1, 1);
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, this.lavaMaterial());
      m.position.set(cx, -2.6, cz);
      this.scene.add(m);
      this.keep(geo);
      // hot glows over the lava along the drop edges
      for (const p of this.track.paths) {
        for (let i = 0; i < p.n; i += 11) {
          for (const side of [-1, 1]) {
            if ((side < 0 ? p.wallL[i] : p.wallR[i]) !== 0 || p.style[i] === 'rainbow') continue;
            const d = side * (p.hw[i] + p.sh[i] + 7 + U.hash2(i, side, 5) * 6);
            const x = p.x[i] + p.nx[i] * d, z = p.z[i] + p.nz[i] * d;
            if (this.landKind(x, z) !== 1) continue;
            this.glow(x, -1.2, z, 11 + U.hash2(i, side, 6) * 6, '#ff7a2f', 2);
          }
        }
      }
    } else if (th.voidKind === 'valley') {
      // the valley floor runs out to the horizon
      const geo = new THREE.PlaneGeometry(6000, 6000, 1, 1);
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, this.keep(Clay3D.material({ color: th.valley, wobble: 0, rim: 0, bump: false, rough: 1 })));
      m.position.set(cx, this.valleyY - 0.4, cz);
      m.receiveShadow = true;
      this.scene.add(m);
      this.keep(geo);
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
      const cm = this.keep(Clay3D.material({ vertexColors: true, wobble: 0.8, freq: 0.08, rim: 0.5 }));
      for (const g of parts) this.put(g, cm, { cast: false, receive: false, far: true, name: 'cloudsea' });
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
  // Decor pieces are built once per theme in a few variants and cloned around the land; forests
  // on a mountain are instanced.
  buildDecor() {
    const th = this.theme, t = this.terrain;
    const rnd = U.rng(this.def.id.charCodeAt(0) * 101);
    const valley = this.valley;
    const landArea = t.nx * t.nz * t.cell * t.cell;
    const count = valley ? Math.min(900, Math.round(landArea / 3000)) : this.def.theme === 'lava' ? 180 : this.def.theme === 'snow' ? 300 : 380;
    let placed = 0;
    for (let tries = 0; tries < count * 8 && placed < count; tries++) {
      const i = 1 + Math.floor(rnd() * (t.nx - 2)), j = 1 + Math.floor(rnd() * (t.nz - 2));
      const k = j * t.nx + i;
      if (t.K[k] !== 0 || t.E[k] < 3.5) continue;
      if (valley ? t.E[k] > 130 || t.NY[k] < 0.72 : t.K[k - 1] || t.K[k + 1] || t.K[k - t.nx] || t.K[k + t.nx]) continue;
      if (this.nearLake(t.x0 + i * t.cell, t.z0 + j * t.cell, 2)) continue;
      const kind = th.decor[Math.floor(rnd() * th.decor.length)];
      const x = t.x0 + (i + rnd() - 0.5) * t.cell, z = t.z0 + (j + rnd() - 0.5) * t.cell;
      const h = this.heightAt(x, z);
      if (h === null) continue;
      const g = this.decorVariant(kind, Math.floor(rnd() * 3));
      if (!g) continue;
      this.stamp(g, x, h, z, rnd() * TAU, 0.8 + rnd() * 0.7, this.clayMat, { name: 'decor' });
      placed++;
    }
    if (valley) this.buildForests(rnd);
  }
  nearLake(x, z, pad) {
    for (const l of this.lakes) if (Math.hypot(x - l.x, z - l.z) < l.r + pad) return true;
    return false;
  }
  decorVariant(kind, v) {
    const key = 'decor:' + this.def.theme + ':' + kind + ':' + v;
    if (WORLD_GEO[key] === false) return null;
    if (WORLD_GEO[key]) return WORLD_GEO[key];
    GK.detail = 0.5;
    const g = this.decorPiece(kind, U.rng(kind.length * 31 + v * 7 + 1), v * 13 + 1);
    GK.detail = 1;
    if (g) g.userData.shared = true;
    WORLD_GEO[key] = g || false;
    return g;
  }

  // Pine forests down the mountainside and across the valley floor (instanced, a few shapes).
  buildForests(rnd) {
    const t = this.terrain, th = this.theme;
    // one low-poly snowy pine, tinted per instance
    // open-bottomed cones keep it to ~80 triangles a tree
    const pine = worldGeo('forestpine:' + (th.forest || ''), () => {
      const leaf = U.mix(th.forest || '#2f6b55', th.forest2 || '#3f8a6a', 0.5);
      const cone = (r, h, col, seed) => {
        const g = new THREE.ConeGeometry(r, h, 7, 1, true);
        GK.lump(g, r * 0.12, 2, seed);
        return GK.paint(g, col, 0.05, seed);
      };
      const trunk = new THREE.CylinderGeometry(0.35, 0.45, 1.8, 5, 1, true);
      const P = [GK.at(GK.paint(trunk, '#6b4a3a'), 0, 0.9, 0)];
      for (let k = 0; k < 3; k++) {
        const r = 2.3 - k * 0.6, h = 2.6;
        P.push(GK.at(cone(r, h, leaf, 5 + k), 0, 2.3 + k * 1.5, 0));
        if (k) P.push(GK.at(cone(r * 0.7, h * 0.4, '#f4f8ff', 14 + k), 0, 2.3 + k * 1.5 + h * 0.33, 0));
      }
      return GK.merge(P);
    });
    const list = [];
    const span = Math.max(30, this.terrainTop() - t.valleyY);
    // forest clumps on gentle ground, thinning out high up; the coarse outer grid gets bigger,
    // sparser trees (seen from afar)
    const scatter = (g, target, big) => {
      const hole = g.hole;
      for (let tries = 0, n = 0; tries < target * 6 && n < target; tries++) {
        const i = 1 + Math.floor(rnd() * (g.nx - 2)), j = 1 + Math.floor(rnd() * (g.nz - 2));
        const k = j * g.nx + i;
        if (g.K[k] !== 0 || g.E[k] < 9 || g.NY[k] < 0.74) continue;
        const x = g.x0 + (i + rnd() - 0.5) * g.cell, z = g.z0 + (j + rnd() - 0.5) * g.cell;
        if (hole && x > hole[0] && x < hole[2] && z > hole[1] && z < hole[3]) continue;
        const alt = U.clamp((g.H[k] - t.valleyY) / span, 0, 1);
        const dense = fbm2(x * 0.011, z * 0.011);
        if (rnd() > (dense - 0.32) * 2.6 * (1 - alt * 0.75)) continue;
        if (this.nearLake(x, z, 3)) continue;
        const h = this.heightAt(x, z);
        if (h === null) continue;
        list.push([x, h - 0.2, z, (0.8 + rnd() * 0.9) * (big ? 1.5 : 1), rnd() * TAU, big ? 1 : 0]);
        n++;
      }
    };
    scatter(t, Math.min(1800, Math.round((t.nx * t.nz * t.cell * t.cell) / 1100)), false);
    if (this.terrainOuter) scatter(this.terrainOuter, 700, true);
    this.instanced(pine, list, 'forest', [[1, 1, 1], [0.82, 0.96, 0.9], [1.08, 1.04, 0.92], [0.9, 0.9, 1.02]]);
  }
  terrainTop() {
    let m = -Infinity;
    for (const p of this.track.paths) for (let i = 0; i < p.n; i += 4) m = Math.max(m, p.y[i]);
    return m;
  }
  // Instanced copies of one shared geometry: list of [x, y, z, scale, rotY, far], one
  // InstancedMesh per 2 x 2 cells (4 x 4 for far ones), tinted from tints.
  instanced(geo, list, name, tints) {
    const cells = new Map();
    for (const it of list) {
      const size = CHUNK * (it[5] ? 4 : 2);
      const key = it[5] + ':' + Math.floor(it[0] / size) + ',' + Math.floor(it[2] / size);
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(it);
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const c = new THREE.Color();
    for (const items of cells.values()) {
      const mesh = new THREE.InstancedMesh(geo, this.clayMat, items.length);
      items.forEach((it, n) => {
        q.setFromAxisAngle(up, it[4]);
        sv.setScalar(it[3]);
        pv.set(it[0], it[1], it[2]);
        mesh.setMatrixAt(n, m4.compose(pv, q, sv));
        if (tints) mesh.setColorAt(n, c.setRGB(...tints[Math.floor(U.hash2(it[0] * 3, it[2] * 3, 7) * tints.length)]));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = name;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.scene.add(mesh);
      this.chunks.push({ mesh, c: mesh.boundingSphere.center.clone(), r: mesh.boundingSphere.radius, far: false, mid: true });
    }
  }

  decorPiece(kind, rnd, seed) {
    const th = this.theme;
    const s = 1;
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
      const leaf = this.def.theme === 'alpine' ? [th.forest, th.forest2, '#3f8a6a'][Math.floor(rnd() * 3)] : '#3f8a6a';
      P.push(GK.at(GK.cyl(0.3 * s, 0.4 * s, 1.6 * s, '#6b4a3a', { seed }), 0, 0.8 * s, 0));
      for (let k = 0; k < 3; k++) {
        const r = (1.9 - k * 0.5) * s, h = 2.2 * s;
        P.push(GK.at(GK.cone(r, h, leaf, { seed: seed + k }), 0, 2 * s + k * 1.3 * s, 0));
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

  // ---------- trackside life ----------
  buildTrackside() {
    const T = this.track;
    this.standSpots = [];
    this.buildStands();
    this.buildChevrons();
    this.buildBanners(T.startS, -45, 75);
    if (T.p2p) this.buildBanners(T.finishS, -60, 40);
    this.buildBunting(T.startS);
    if (T.p2p) this.buildBunting(T.finishS);
    this.buildLamps();
  }
  // Is (x, z) clear of every road by at least pad units (beyond the shoulders)?
  clearOfRoads(x, z, pad) {
    const l = this.track.locate(x, z, null, null, {});
    return !l || l.excess > pad;
  }
  roomFor(x, z) {
    const t = this.terrain;
    const i = Math.round((x - t.x0) / t.cell), j = Math.round((z - t.z0) / t.cell);
    if (i < 0 || j < 0 || i >= t.nx || j >= t.nz) return false;
    return t.K[j * t.nx + i] === 0;
  }

  // Grandstands full of clay fans beside the start (and the finish of a point-to-point run).
  buildStands() {
    const T = this.track, p = T.main;
    const spots = [T.startS + (T.p2p ? 22 : 30)];
    if (T.p2p) spots.push(T.finishS + 4);
    for (const s of spots) {
      let best = null;
      for (const side of [1, -1]) {
        const score = this.standScore(p, s, side, 30);
        if (score > 0.8 && (!best || score > best.score)) best = { side, score };
      }
      if (best) this.stand(p, s, best.side, 30);
    }
  }
  standScore(p, s, side, len) {
    let ok = 0, n = 0;
    const i = p.indexAt(s);
    const flag = side > 0 ? p.wallR[i] : p.wallL[i];
    if (flag === 0) return 0;
    const y0 = p.point(s, side * (p.hw[i] + p.sh[i])).y;
    for (let a = -len / 2; a <= len / 2; a += 5) {
      const q = p.point(s + a, 0);
      for (const off of [5, 10, 15]) {
        const d = side * (q.hw + q.sh + 3 + off);
        const x = q.x + q.nx * d, z = q.z + q.nz * d;
        n++;
        if (!this.roomFor(x, z) || !this.clearOfRoads(x, z, off + 1.5)) continue;
        const h = this.heightAt(x, z);
        if (h !== null && Math.abs(h - y0) < 6) ok++;
      }
    }
    return ok / n;
  }
  stand(p, s, side, len) {
    const i = p.indexAt(s);
    const e = p.hw[i] + p.sh[i] + WALL_LOOKS[this.wallStyle(p, i)].depth + 1.2;
    const q = p.point(s, side * e);
    // the stand faces the road: local x along it (flipped on the left so the frame stays
    // right-handed), z away from the road
    const head = side > 0 ? q.head : q.head + Math.PI;
    let y = q.y;
    for (let a = -len / 2; a <= len / 2; a += 5) {
      for (const off of [2, 8, 13]) {
        const g = this.heightAt(q.x + q.tx * a + q.nx * side * off, q.z + q.tz * a + q.nz * side * off);
        if (g !== null) y = Math.max(y, g);
      }
    }
    const m = this.flatFrame(q.x, y, q.z, head);
    // with head + PI the local z axis points to -n: outward on the left
    const parts = [];
    const th = this.theme;
    const struct = this.def.theme === 'lava' ? '#8a7fa6' : this.def.theme === 'meadow' ? '#fff1d6' : '#e8eef8';
    const accent = th.curb[0];
    const tiers = 4;
    for (let k = 0; k < tiers; k++) {
      const h = 0.9 + k * 0.9;
      parts.push(GK.at(GK.box(len, h + 3, 2.05, k % 2 ? struct : U.shade(struct, -0.06), { seed: k + 1, lump: 0.05, r: 0.15 }), 0, h / 2 - 1.5, 1.2 + k * 2 + 1));
    }
    parts.push(GK.at(GK.box(len + 0.6, 8.5, 0.7, U.shade(struct, -0.1), { seed: 9, lump: 0.05 }), 0, 2.75, 1.2 + tiers * 2 + 0.4));
    // roof on posts, with stripes
    for (let x = -len / 2; x <= len / 2 + 0.01; x += len / 4) parts.push(GK.at(GK.cyl(0.22, 0.26, 7.4, '#8c8fae', { segs: 6 }), x, 3.2, 1.0));
    for (let k = 0; k < 8; k++) {
      parts.push(GK.at(GK.box((len + 2) / 8, 0.35, 10, k % 2 ? accent : '#fff6ea', { seed: 20 + k, lump: 0.03, r: 0.1 }), -len / 2 - 1 + ((k + 0.5) * (len + 2)) / 8, 7.0, 5.0, -0.12, 0, 0));
    }
    // a sponsor board on the front
    this.putAt(GK.merge(parts), m, this.clayMat, { far: true, name: 'stand' });
    const brand = BRANDS[Math.floor(U.hash2(Math.round(s), side, 4) * BRANDS.length)];
    const tex = this.brandTexture(brand);
    const sign = this.signGeo(6, 1.5, false);
    sign.rotateY(-Math.PI / 2); // face -z (the road)
    sign.translate(0, 0.2, 1.05);
    this.putAt(sign, m.clone(), this.signMat(tex), { cast: false });
    // the crowd: three groups that bob out of step
    const groups = [[], [], []];
    let seat = 0;
    for (let k = 0; k < tiers; k++) {
      const h = 0.9 + k * 0.9, z = 1.2 + k * 2 + 1.1;
      for (let x = -len / 2 + 0.8; x <= len / 2 - 0.8; x += 1.4) {
        const v = Math.floor(U.hash2(seat, k, 77) * 8);
        groups[seat % 3].push(GK.at(this.fanGeo(v).clone(), x + (U.hash2(seat, 1, 7) - 0.5) * 0.3, h, z));
        seat++;
      }
    }
    groups.forEach((list, n) => {
      const g = GK.merge(list);
      g.applyMatrix4(m);
      const mesh = new THREE.Mesh(g, this.clayMat);
      mesh.name = 'crowd';
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.keep(g);
      this.cullable(mesh, false);
      const ph = n * 2.1;
      this.anims.push((t) => {
        const tt = Math.floor(t * 12) / 12;
        mesh.position.y = Math.abs(Math.sin(tt * 5.5 + ph)) * 0.32;
      });
    });
    // waving flags on the roof
    const v = new THREE.Vector3();
    for (let k = 0; k < 5; k++) {
      v.set(-len / 2 + ((k + 0.5) * len) / 5, 7.2, 1.0).applyMatrix4(m);
      this.flagAt(v.x, v.y, v.z, ['#ff6f91', '#58b4ff', '#ffd166', '#7ddc6f', '#c77dff'][k], head, k);
    }
    this.standSpots.push({ s, side });
  }
  fanGeo(v) {
    return worldGeo('fan:' + v, () => {
      const rnd = U.rng(v * 17 + 3);
      const shirt = ['#ff6f91', '#58b4ff', '#ffd166', '#7ddc6f', '#c77dff', '#ff9f43', '#ffffff', '#4fbf5a'][v];
      const skin = ['#ffd9b8', '#e8b48a', '#c98d64', '#8a5a3c', '#f2c6a0', '#ffe0c8', '#b97a52', '#ffd0b0'][Math.floor(rnd() * 8)];
      // a crowd is many: keep each fan to ~150 triangles
      const P = [GK.at(GK.blob(0.42, 0.5, 0.36, shirt, { seed: v + 1, ws: 7, hs: 5 }), 0, 0.5, 0)];
      P.push(GK.at(GK.blob(0.34, 0.33, 0.32, skin, { seed: v + 2, ws: 7, hs: 5 }), 0, 1.15, 0));
      // fans face -z (the road)
      for (const x of [-0.12, 0.12]) P.push(GK.at(GK.blob(0.06, 0.08, 0.06, '#2b1838', { seed: 3, ws: 4, hs: 3, lump: 0 }), x, 1.2, -0.28));
      if (v % 2) {
        // arms up, cheering
        for (const x of [-0.36, 0.36]) P.push(GK.at(GK.cyl(0.09, 0.1, 0.7, shirt, { segs: 4, hsegs: 1, lump: 0 }), x, 1.05, 0, 0, 0, x > 0 ? -0.5 : 0.5));
      }
      if (v % 3 === 0) P.push(GK.at(GK.cyl(0.36, 0.38, 0.22, ['#e8483f', '#ffd166', '#58b4ff'][(v / 3) % 3], { segs: 7, hsegs: 1, lump: 0 }), 0, 1.42, 0));
      return GK.merge(P);
    });
  }
  // A pennant on a pole that flaps (its own small mesh).
  flagAt(x, y, z, col, head, seed) {
    const pole = GK.at(GK.cyl(0.07, 0.08, 2.4, '#8c8fae', { segs: 5, lump: 0 }), x, y + 1.2, z);
    this.put(pole, this.stillMat);
    const g = GK.box(0.9, 0.6, 0.05, col, { seed, lump: 0.02, r: 0.02, seg: 2 });
    g.translate(0.5, 0, 0);
    const m = new THREE.Mesh(g, this.clayMat);
    m.name = 'flag';
    m.position.set(x, y + 2.05, z);
    m.castShadow = true;
    this.scene.add(m);
    this.keep(g);
    this.cullable(m, false);
    const base = -head + Math.PI / 2;
    this.anims.push((t) => {
      m.rotation.y = base + Math.sin(t * 3.1 + seed * 1.7) * 0.45;
    });
  }
  brandTexture(brand) {
    return this.signTexture('brand' + brand[0], 256, 64, brand[1], brand[2], [[brand[0], 34]]);
  }

  // Arrow boards on the outside of sharp corners, facing the racers coming in.
  buildChevrons() {
    const T = this.track, th = this.theme;
    const tex = this.texCache.chev || (this.texCache.chev = this.canvasTex(
      128,
      80,
      (g) => {
        g.fillStyle = th.curb[0];
        g.fillRect(0, 0, 128, 80);
        g.fillStyle = '#ffffff';
        for (const x0 of [14, 54]) {
          g.beginPath();
          g.moveTo(x0, 10);
          g.lineTo(x0 + 26, 10);
          g.lineTo(x0 + 56, 40);
          g.lineTo(x0 + 26, 70);
          g.lineTo(x0, 70);
          g.lineTo(x0 + 30, 40);
          g.closePath();
          g.fill();
        }
        g.strokeStyle = 'rgba(43,24,56,0.5)';
        g.lineWidth = 4;
        g.strokeRect(2, 2, 124, 76);
      },
      { clamp: true },
    ));
    const mat = this.signMat(tex);
    for (const p of T.paths) {
      if (p.branch && !p.open) continue;
      const info = this.pinfo[p.index];
      const sharp = (i) => Math.abs(p.curv[i]) > 1 / 46 && !info.gap[i];
      const n = p.n;
      let i = 0;
      // start scanning on a straight sample so a corner across the loop's seam stays whole
      let start = 0;
      if (p.closed) while (start < n && sharp(start)) start++;
      for (let c = 0; c < n; ) {
        const a = p.wrap(start + c);
        if (!sharp(a)) {
          c++;
          continue;
        }
        let len = 0;
        while (c + len < n && sharp(p.wrap(start + c + len))) len++;
        if (len >= 12) {
          const mid = p.wrap(start + c + Math.floor(len / 2));
          const dir = Math.sign(p.curv[mid]), side = -dir;
          for (let k = 3; k < len - 1; k += 7) {
            i = p.wrap(start + c + k);
            const flag = side > 0 ? p.wallR[i] : p.wallL[i];
            if (flag !== 1 || p.ag[i] || this.inTunnel(p, i)) continue;
            const e = p.hw[i] + p.sh[i] + WALL_LOOKS[this.wallStyle(p, i)].depth + 0.9;
            const v = this.gp(p, i, side * e, 0);
            const x = v.x, z = v.z;
            if (!this.clearOfRoads(x, z, 0.5)) continue;
            const gy = Math.max(v.y, this.groundAt(x, z, v.y));
            const yaw = p.head[i] + side * 0.35;
            const m = this.flatFrame(x, gy, z, yaw);
            const parts = [GK.at(GK.box(0.22, 1.9, 2.75, '#3b2a4a', { seed: i, lump: 0.02, r: 0.08, seg: 2 }), 0.12, 2.35, 0)];
            for (const zz of [-0.9, 0.9]) parts.push(GK.at(GK.cyl(0.1, 0.12, 2.4, '#8c8fae', { segs: 5, lump: 0 }), 0.15, 1.2, zz));
            this.putAt(GK.merge(parts), m, this.stillMat, { name: 'chevron' });
            const sign = this.signGeo(2.6, 1.65, false);
            if (dir < 0) {
              const uv = sign.attributes.uv;
              for (let u = 0; u < uv.count; u++) uv.setX(u, 1 - uv.getX(u));
            }
            sign.translate(-0.01, 2.35, 0);
            this.putAt(sign, m, mat, { cast: false });
          }
        }
        c += len;
      }
    }
  }

  // Sponsor boards on the walls around the start / finish.
  buildBanners(s0, from, to) {
    const T = this.track, p = T.main;
    let n = Math.floor(Math.abs(s0) * 7);
    for (let a = from; a <= to; a += 17) {
      const s = s0 + a;
      if (!p.closed && (s < 4 || s > p.length - 4)) continue;
      const i = p.indexAt(s);
      if (this.pinfo[0].gap[i] || p.ag[i]) continue;
      for (const side of [-1, 1]) {
        if ((side > 0 ? p.wallR[i] : p.wallL[i]) !== 1) continue;
        if (this.standSpots.some((sp) => sp.side === side && Math.abs(T.aheadS(sp.s, s)) < 20)) continue;
        const look = WALL_LOOKS[this.wallStyle(p, i)];
        if (!look.prof) continue;
        const top = Math.max(...look.prof.map((q) => q[1]));
        const e = p.hw[i] + p.sh[i] + look.depth * 0.5;
        const v = this.gp(p, i, side * e, top);
        const head = side > 0 ? p.head[i] : p.head[i] + Math.PI;
        const m = this.flatFrame(v.x, v.y, v.z, head);
        const brand = BRANDS[n++ % BRANDS.length];
        const fr = [GK.at(GK.box(5.6, 1.5, 0.25, '#3b2a4a', { seed: n, lump: 0.02, r: 0.08, seg: 2 }), 0, 0.95, 0.08)];
        for (const x of [-2.2, 2.2]) fr.push(GK.at(GK.cyl(0.08, 0.1, 0.9, '#8c8fae', { segs: 5, lump: 0 }), x, 0.2, 0.08));
        this.putAt(GK.merge(fr), m, this.stillMat, { name: 'banner' });
        const sign = this.signGeo(5.3, 1.3, false);
        sign.rotateY(-Math.PI / 2);
        sign.translate(0, 0.95, -0.06);
        this.putAt(sign, m, this.signMat(this.brandTexture(brand)), { cast: false });
      }
    }
  }

  // Strings of clay pennants on posts along the walls.
  buildBunting(s0) {
    const T = this.track, p = T.main;
    const cols = ['#ff6f91', '#ffd166', '#58b4ff', '#7ddc6f', '#c77dff'];
    const flagGeo = cols.map((c, k) => worldGeo('pennant:' + k, () => GK.at(GK.cone(0.32, 0.65, c, { segs: 3, lump: 0, seed: k }), 0, 0, 0, Math.PI, 0, 0)));
    for (const side of [-1, 1]) {
      let prev = null;
      for (let a = -40; a <= 40; a += 12) {
        const s = s0 + a;
        if (!p.closed && (s < 2 || s > p.length - 2)) {
          prev = null;
          continue;
        }
        const i = p.indexAt(s);
        if ((side > 0 ? p.wallR[i] : p.wallL[i]) !== 1 || this.pinfo[0].gap[i]) {
          prev = null;
          continue;
        }
        const v = this.gp(p, i, side * (p.hw[i] + p.sh[i] + 0.5), 0);
        const top = { x: v.x, y: v.y + 4.2, z: v.z };
        this.put(GK.at(GK.cyl(0.09, 0.11, 4.4, '#fff6ea', { segs: 5, lump: 0 }), v.x, v.y + 2.1, v.z), this.stillMat);
        if (prev) {
          const n = 12;
          for (let k = 1; k < n; k++) {
            const t = k / n;
            const x = U.lerp(prev.x, top.x, t), z = U.lerp(prev.z, top.z, t);
            const y = U.lerp(prev.y, top.y, t) - Math.sin(Math.PI * t) * 0.9;
            this.stamp(flagGeo[k % cols.length], x, y - 0.3, z, -Math.atan2(top.z - prev.z, top.x - prev.x), 1, this.clayMat, { cast: false });
          }
        }
        prev = top;
      }
    }
  }

  // Lamp posts, lanterns or torches along the walls, by theme.
  buildLamps() {
    const T = this.track, th = this.def.theme;
    const lamp = worldGeo('lamp:' + th, () => {
      const P = [];
      if (th === 'lava') {
        P.push(GK.at(GK.cyl(0.3, 0.42, 0.7, '#3d2f48', { segs: 8 }), 0, 0.35, 0));
        P.push(GK.at(GK.cyl(0.6, 0.32, 0.45, '#6b5f86', { segs: 8 }), 0, 0.9, 0));
        P.push(GK.at(GK.blob(0.45, 0.65, 0.45, '#ff8a3d', { seed: 2 }), 0, 1.35, 0));
        P.push(GK.at(GK.blob(0.25, 0.4, 0.25, '#ffd166', { seed: 3 }), 0, 1.5, 0));
      } else {
        const post = th === 'meadow' ? '#fff1d6' : th === 'snow' ? '#58b4ff' : '#6b4a3a';
        P.push(GK.at(GK.cyl(0.14, 0.2, 5, post, { segs: 7 }), 0, 2.5, 0));
        P.push(GK.at(GK.cyl(0.3, 0.4, 0.4, post, { segs: 7 }), 0, 0.2, 0));
        if (th === 'meadow') {
          P.push(GK.at(GK.blob(0.55, 0.55, 0.55, '#fff6c8', { seed: 4, lump: 0 }), 0, 5.4, 0));
          P.push(GK.at(GK.cone(0.6, 0.35, '#ff6f91', { seed: 5, lump: 0 }), 0, 5.95, 0));
        } else {
          P.push(GK.at(GK.box(0.7, 0.85, 0.7, '#ffe9a8', { seed: 6, r: 0.12 }), 0, 5.3, 0));
          P.push(GK.at(GK.cone(0.65, 0.5, '#2b1838', { seed: 7, segs: 4, lump: 0 }), 0, 5.95, 0, 0, Math.PI / 4, 0));
          if (th !== 'meadow') P.push(GK.at(GK.blob(0.5, 0.18, 0.5, '#ffffff', { seed: 8 }), 0, 6.15, 0));
        }
      }
      return GK.merge(P);
    });
    const glowCol = th === 'lava' ? '#ff9a3c' : th === 'snow' ? '#fff3c8' : '#ffe6a3';
    for (const p of T.paths) {
      if (p.branch) continue;
      const info = this.pinfo[p.index];
      let side = 1;
      const every = th === 'lava' ? 26 : 40;
      for (let s = T.startS + 60; s < (T.p2p ? T.finishS - 20 : p.length - 20); s += every) {
        side = -side;
        const i = p.indexAt(s);
        if (info.gap[i] || p.ag[i]) continue;
        if ((side > 0 ? p.wallR[i] : p.wallL[i]) !== 1) continue;
        const ws = this.wallStyle(p, i);
        if (ws === 'tech' || ws === 'channel' || ws === 'rail') continue;
        if (this.inTunnel(p, i)) continue;
        const look = WALL_LOOKS[ws];
        let v;
        if (th === 'lava' && look.prof) v = this.gp(p, i, side * (p.hw[i] + p.sh[i] + 0.45), 1.7);
        else {
          v = this.gp(p, i, side * (p.hw[i] + p.sh[i] + look.depth + 0.6), 0);
          if (!this.clearOfRoads(v.x, v.z, 0.5)) continue;
          v.y = Math.max(v.y, this.groundAt(v.x, v.z, v.y)) - 0.1;
        }
        this.stamp(lamp, v.x, v.y, v.z, 0, 1, this.clayMat, { name: 'lamp' });
        this.glow(v.x, v.y + (th === 'lava' ? 1.5 : 5.35), v.z, th === 'lava' ? 3.2 : 2.6, glowCol, th === 'lava' ? 2 : 0);
      }
    }
  }

  // ---------- landmarks ----------
  buildLandmarks() {
    const T = this.track;
    for (const lm of this.def.landmarks || []) {
      if (lm.path && (lm.kind === 'log' || lm.kind === 'cave' || lm.kind === 'rainbow')) {
        this.pathLandmark(lm);
        continue;
      }
      const make = LANDMARKS[lm.kind];
      if (!make) continue;
      let w;
      try {
        w = T.where(lm);
      } catch (e) {
        continue;
      }
      const pt = w.path.point(w.s, lm.d || 0);
      const ground = lm.d ? this.heightAt(pt.x, pt.z) : pt.y;
      const y = ground === null ? pt.y : ground;
      const parts = [];
      make.call(this, lm, pt.x, y, pt.z, pt.head, parts);
      for (const g of parts) this.put(g, this.clayMat, { far: !!lm.far || lm.kind === 'volcano' || lm.kind === 'keep', name: 'landmark' });
    }
    for (const tu of this.tunnels) this.tunnel(tu);
  }

  // A tube around the road over samples ids: an arch from the right edge up over the top to
  // the left edge in the banked frame, with an inner and a lumpy outer skin and rings at the
  // ends. o: {R(i), H(i), thick, wide, mound, inner, outer, lump, ring: [every, shade]}
  tubeGeo(p, ids, o) {
    const prof = [];
    const steps = o.steps || 12;
    for (let k = 0; k <= steps; k++) {
      const a = (k / steps) * Math.PI;
      prof.push([Math.cos(a), Math.sin(a)]);
    }
    const verts = [], cols = [], idx = [];
    const h = prof.length, m = h * 2;
    const cIn = new THREE.Color(o.inner), cOut = new THREE.Color(o.outer);
    const v = {};
    ids.forEach((i, r) => {
      const R = o.R(i), Hh = o.H(i);
      for (let k = 0; k < h; k++) {
        const [ca, sa] = prof[k];
        this.gp(p, i, ca * R, sa * Hh, v);
        verts.push(v.x, v.y, v.z);
        const w = (U.hash2(i, k, 5) - 0.5) * 0.06;
        cols.push(cIn.r + w, cIn.g + w, cIn.b + w);
      }
      // on the inside of a tight bend the skin may not reach past the bend's centre
      const inner = Math.abs(p.curv[i]) > 1e-4 ? 0.9 / Math.abs(p.curv[i]) : Infinity;
      for (let k = 0; k < h; k++) {
        const [ca, sa] = prof[k];
        const wob = (noise3(p.x[i] * 0.2, k * 0.7, p.z[i] * 0.2) - 0.5) * (o.lump || 0.6);
        // o.wide spreads the outer skin into a broad mound (a hill over a cave)
        const t = o.thick + wob + (o.mound ? sa * sa * o.mound : 0);
        let lat = ca * (R + t + (o.wide || 0));
        if (lat * p.curv[i] > 0 && Math.abs(lat) > inner) lat = Math.sign(lat) * Math.max(inner, Math.abs(ca) * (R + 0.5));
        this.gp(p, i, lat, sa * (Hh + t), v);
        verts.push(v.x, v.y, v.z);
        const ring = o.ring && i % o.ring[0] === 0 ? o.ring[1] : 1;
        const w = (U.hash2(i, k, 6) - 0.5) * 0.08;
        const snow = o.cap ? sstep(0.55, 0.85, sa + (noise3(p.x[i] * 0.1, k, p.z[i] * 0.1) - 0.5) * 0.4) : 0;
        cols.push(U.lerp(cOut.r * ring, 1, snow) + w, U.lerp(cOut.g * ring, 1, snow) + w, U.lerp(cOut.b * ring, 1, snow) + w);
      }
      if (r > 0) {
        const r0 = (r - 1) * m, r1 = r * m;
        for (let k = 0; k < h - 1; k++) {
          idx.push(r0 + k, r0 + k + 1, r1 + k, r0 + k + 1, r1 + k + 1, r1 + k); // inner
          idx.push(r0 + h + k, r1 + h + k, r0 + h + k + 1, r0 + h + k + 1, r1 + h + k, r1 + h + k + 1); // outer
        }
      }
    });
    // close both ends (the portal rims), facing out of the tube
    for (const r of [0, ids.length - 1]) {
      const b0 = r * m;
      for (let k = 0; k < h - 1; k++) {
        if (r === 0) idx.push(b0 + k, b0 + h + k, b0 + k + 1, b0 + k + 1, b0 + h + k, b0 + h + k + 1);
        else idx.push(b0 + k, b0 + k + 1, b0 + h + k, b0 + k + 1, b0 + h + k + 1, b0 + h + k);
      }
    }
    return this.geo(verts, cols, idx);
  }

  // Generic main-road tunnel: 'ice' (an ice cave with icicles and glowing crystals), 'rock',
  // 'wood' (a snow shed of posts and planks) or 'castle' (a stone vault with torches).
  tunnel(tu) {
    const p = this.track.main, ids = tu.ids, look = tu.look;
    if (ids.length < 3) return;
    const R = tu.R, H = (i) => R(i) * 0.75 + 2.5;
    if (look === 'wood') return this.snowShed(p, ids, R, H);
    const L = {
      ice: { inner: '#c4e6ff', outer: '#9fcdf2', thick: 2.2, lump: 2.4, mound: 4, wide: 9, cap: true },
      rock: { inner: '#8a8096', outer: '#8c8296', thick: 2.4, lump: 2.6, mound: 4, wide: 10, cap: true },
      castle: { inner: '#9a8fb4', outer: '#8a7fa6', thick: 1.4, lump: 0.3, ring: [6, 0.82] },
    }[look] || { inner: '#8a8096', outer: '#9c93a8', thick: 2, lump: 1.5 };
    // caves glow a little from inside (ice light, lanterns), so they never go black
    const key = 'tube-' + look;
    const glowCol = look === 'ice' ? '#4f9be0' : '#5a4038';
    const mat = this.matCache[key] || (this.matCache[key] = this.keep(Clay3D.material({ vertexColors: true, wobble: 0.03, freq: 0.9, bump: false, emissive: glowCol, emissiveIntensity: look === 'ice' ? 0.55 : 0.6, rough: look === 'ice' ? 0.4 : 0.8 })));
    // in pieces so each can be culled
    for (let a = 0; a < ids.length - 1; a += 60) {
      const part = ids.slice(a, Math.min(ids.length, a + 61));
      this.put(this.tubeGeo(p, part, Object.assign({ R, H }, L)), mat, { far: true, name: 'tunnel' });
    }
    const v = {};
    const parts = [], ice = [];
    for (let r = 2; r < ids.length - 2; r += 5) {
      const i = ids[r];
      const Rr = R(i), Hh = H(i);
      if (look === 'ice') {
        // icicles from the roof, crystals along the walls (in the glowing ice material)
        const a = 0.35 + U.hash2(i, 1, 2) * 2.4;
        this.gp(p, i, Math.cos(a) * Rr * 0.97, Math.sin(a) * Hh * 0.97, v);
        ice.push(GK.at(GK.cone(0.45, 1.8 + U.hash2(i, 2, 2) * 1.6, '#eef8ff', { seed: i, segs: 6 }), v.x, v.y - 0.8, v.z, Math.PI));
        if (r % 10 === 2) {
          for (const side of [-1, 1]) {
            this.gp(p, i, side * (Rr - 0.6), 0.8, v);
            ice.push(this.edgePiece(GK.cone(0.6, 2.6, '#8fe0ff', { seed: i + side, segs: 5 }), p, i, side * (Rr - 0.6), 1.6, 0));
            this.glow(v.x, v.y + 1.4, v.z, 3.2, '#7fe6ff', 3);
          }
        }
      } else if (r % 15 === 2) {
        for (const side of [-1, 1]) {
          this.gp(p, i, side * (Rr - 0.3), 3.2, v);
          parts.push(GK.at(GK.blob(0.35, 0.5, 0.35, '#ff8a3d', { seed: i + side }), v.x, v.y, v.z));
          this.glow(v.x, v.y + 0.3, v.z, 3, '#ffb35c', 2);
        }
      }
    }
    // chunky portal rims
    for (const r of [0, ids.length - 1]) {
      const i = ids[r];
      if (look === 'castle') {
        // a brick arch with a golden keystone
        const m = this.frame(p, p.s[i]);
        const ring = GK.torus(R(i) + 0.7, 1.15, '#b9addb', { arc: Math.PI, ts: 28, rs: 8, seed: i, lump: 0.1 });
        const rp = ring.attributes.position, rc = ring.attributes.color;
        for (let q = 0; q < rp.count; q++) if (Math.floor((Math.atan2(rp.getY(q), rp.getX(q)) / Math.PI) * 13) % 2) rc.setXYZ(q, rc.getX(q) * 0.85, rc.getY(q) * 0.85, rc.getZ(q) * 0.85);
        ring.scale(1, (H(i) + 0.7) / (R(i) + 0.7), 1);
        ring.rotateY(Math.PI / 2);
        parts.push(ring.applyMatrix4(m), GK.box(1.8, 2.2, 1.9, '#ffd166', { seed: i, r: 0.3 }).translate(0, H(i) + 0.8, 0).applyMatrix4(m));
        continue;
      }
      for (let k = 0; k <= 8; k++) {
        const a = (k / 8) * Math.PI;
        this.gp(p, i, Math.cos(a) * (R(i) + 1.2), Math.sin(a) * (H(i) + 1.2), v);
        if (look === 'ice') {
          // clusters of crystals growing out of the cave mouth
          if (U.hash2(i, k, 8) < 0.45) continue;
          for (const [dr, tilt, len] of [[0, 0, 1], [0.7, 0.5, 0.6]]) {
            this.gp(p, i, Math.cos(a + tilt * 0.15) * (R(i) + 0.5 + dr), Math.sin(a + tilt * 0.15) * (H(i) + 0.5 + dr), v);
            const g = GK.cone(0.6 * len + 0.25, (1.8 + U.hash2(i, k, 4) * 1.6) * len, k % 2 ? '#d6f0ff' : '#a6dcff', { seed: i + k, segs: 5 });
            ice.push(GK.at(g, v.x, v.y, v.z, Math.PI / 2 - a + tilt, -p.head[i], 0));
          }
          continue;
        }
        const g = look === 'castle' ? GK.box(1.6, 1.4, 1.6, k === 4 ? '#ffd166' : '#b9addb', { seed: i + k }) : GK.blob(1.9, 1.7, 1.9, '#8c8296', { seed: i + k * 3 });
        parts.push(GK.at(g, v.x, v.y, v.z));
      }
    }
    if (parts.length) this.put(GK.merge(parts), this.clayMat, { far: true });
    if (ice.length) this.put(GK.merge(ice), mat, { far: true });
  }
  snowShed(p, ids, R, H) {
    const parts = [];
    const v = {}, w = {};
    for (let r = 0; r < ids.length; r += 5) {
      const i = ids[r];
      for (const side of [-1, 1]) {
        this.gp(p, i, side * R(i), 0, v);
        const h = H(i) * 0.7;
        parts.push(this.edgePiece(GK.cyl(0.35, 0.42, h, '#7a4b30', { segs: 7, seed: i + side }), p, i, side * R(i), h / 2));
      }
    }
    // a gable roof of planks with snow on top
    const roof = [[-1.15, 0.62], [0, 0.9], [1.15, 0.62]];
    const verts = [], cols = [], idx = [];
    const cw = new THREE.Color('#9a6a44'), cs = new THREE.Color('#ffffff');
    ids.forEach((i, r) => {
      for (const [f, hf] of roof) {
        this.gp(p, i, f * R(i), hf * H(i), w);
        verts.push(w.x, w.y, w.z);
        const c = Math.floor(p.s[i] / 1.2) % 2 ? cw : cw.clone().multiplyScalar(0.9);
        cols.push(c.r, c.g, c.b);
      }
      for (const [f, hf] of roof) {
        this.gp(p, i, f * R(i), hf * H(i) + 0.45, w);
        verts.push(w.x, w.y, w.z);
        cols.push(cs.r, cs.g, cs.b);
      }
      if (r > 0) {
        const r0 = (r - 1) * 6, r1 = r * 6;
        for (let k = 0; k < 2; k++) {
          idx.push(r0 + k, r1 + k, r0 + k + 1, r0 + k + 1, r1 + k, r1 + k + 1); // underside
          idx.push(r0 + 3 + k, r0 + 4 + k, r1 + 3 + k, r0 + 4 + k, r1 + 4 + k, r1 + 3 + k); // snow
        }
      }
    });
    this.put(this.geo(verts, cols, idx), this.sheetMat, { far: true });
    this.put(GK.merge(parts), this.clayMat, { far: true });
  }

  // Enclosures over a branch (hollow log, ice cave) and the rainbow's sparkles.
  pathLandmark(lm) {
    const p = this.track.byId[lm.path];
    if (!p) return;
    const gate = p.gate ? p.gate.i : 0;
    const v = {};
    const parts = [];
    if (lm.kind === 'log' || lm.kind === 'cave') {
      const log = lm.kind === 'log';
      const ids = [];
      for (let i = gate + 18; i <= p.n - 22; i++) ids.push(i);
      if (ids.length < 3) return;
      const R = (i) => p.hw[i] + p.sh[i] + 0.6, Hh = (i) => R(i) * (log ? 0.9 : 0.85);
      this.put(this.tubeGeo(p, ids, { R, H: Hh, thick: 0.9, inner: log ? '#c99a6a' : '#e8f6ff', outer: log ? '#8a5a3c' : '#bfe3ff', lump: 0.6, ring: log ? [7, 0.8] : null }), this.tubeMat, { far: true, name: lm.kind });
      for (const i of ids) {
        if (!log && i % 5 === 0) {
          const Rr = R(i) + 0.8;
          this.gp(p, i, Rr * 0.4, Hh(i) + 0.8, v);
          parts.push(GK.at(GK.cone(0.5, 1.6, '#e8f6ff', { seed: i }), v.x, v.y, v.z, Math.PI));
          this.gp(p, i, Rr, Hh(i) * 0.9, v);
          parts.push(GK.at(GK.cone(0.9, 2.6, '#9fd0ff', { seed: i + 1, segs: 5 }), v.x, v.y, v.z, 0, 0, 0.5));
        } else if (log && i % 9 === 0) {
          this.gp(p, i, 0, Hh(i) + 1.3, v);
          parts.push(GK.at(GK.blob(0.9, 0.5, 0.9, '#62b956', { seed: i }), v.x, v.y, v.z));
          parts.push(GK.at(GK.blob(0.35, 0.3, 0.35, '#e8483f', { seed: i + 2 }), v.x + 0.7, v.y + 0.4, v.z));
        }
      }
    } else if (lm.kind === 'rainbow') {
      // sparkle stars bobbing beside the rainbow
      for (let i = gate + 10; i < p.n - 10; i += 12) {
        for (const side of [-1, 1]) {
          this.gp(p, i, side * (p.hw[i] + p.sh[i] + 3), 1.5, v);
          parts.push(GK.at(GK.blob(0.6, 0.6, 0.6, '#fff3a8', { seed: i * side }), v.x, v.y, v.z));
          this.glow(v.x, v.y, v.z, 2.2, '#fff3a8', 3);
        }
      }
    }
    if (parts.length) this.put(GK.merge(parts), this.clayMat);
  }

  // ---------- key gates ----------
  buildGates() {
    this.gates = [];
    const T = this.track;
    for (const g of T.objects.gates) {
      const grp = new THREE.Group();
      const parts = [];
      const half = g.half;
      const pillarCol = this.def.theme === 'lava' ? '#9a8fb4' : this.def.theme === 'snow' || this.def.theme === 'alpine' ? '#dff0ff' : '#c9a1b0';
      for (const side of [-1, 1]) {
        parts.push(GK.at(GK.box(1.6, 6.5, 1.6, pillarCol, { seed: side + 5 }), 0, 3.0, side * (half + 0.6)));
        parts.push(GK.at(GK.blob(1.1, 1.1, 1.1, '#ffcc3d', { seed: side + 8 }), 0, 6.6, side * (half + 0.6)));
      }
      parts.push(GK.at(GK.box(1.4, 1.2, half * 2 + 2.6, pillarCol, { seed: 12 }), 0, 6.1, 0));
      const frame = new THREE.Mesh(GK.merge(parts), this.clayMat);
      frame.castShadow = frame.receiveShadow = true;
      grp.add(frame);
      // the door itself, with a big keyhole
      const doorParts = [GK.box(0.6, 5.4, half * 2, '#8a5a3c', { seed: 3, lump: 0.08 })];
      for (let k = -2; k <= 2; k++) doorParts.push(GK.at(GK.box(0.7, 5.2, 0.25, '#6b3d24', { seed: 20 + k, lump: 0.02 }), 0, 0, k * (half * 0.38)));
      doorParts.push(GK.at(GK.blob(0.3, 1.2, 1.2, '#ffcc3d', { seed: 30 }), -0.35, 0.7, 0));
      doorParts.push(GK.at(GK.blob(0.3, 0.42, 0.42, '#2b1838', { seed: 31, lump: 0 }), -0.6, 0.95, 0));
      doorParts.push(GK.at(GK.box(0.3, 0.8, 0.32, '#2b1838', { seed: 32, lump: 0 }), -0.6, 0.35, 0));
      // the keyhole faces the approaching racer (-x local)
      const door = new THREE.Mesh(GK.merge(doorParts), this.clayMat);
      door.position.y = 2.7;
      door.castShadow = true;
      grp.add(door);
      grp.position.set(g.x, g.y, g.z);
      grp.rotation.set(Math.atan(g.path.bank[g.i] || 0), -g.head, 0, 'YXZ');
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
    this.uTime.value = time;
    const g = CFG.glow !== undefined ? CFG.glow : 1;
    this.uGlow.value = g;
    for (const a of this.anims) a(time);
    if (this.padTex) this.padTex.offset.y = -time * 1.8;
    if (this.metalGlowTex) this.metalGlowTex.offset.y = -time * 0.9;
    if (race && this.gates) {
      race.items.gates.forEach((gt, i) => {
        const v = this.gates[i];
        if (v) v.door.position.y = 2.7 - gt.anim * 5.6;
      });
    }
  }
}

// Two-pass nearest-seed propagation over a grid (8 neighbours): an approximate Euclidean
// feature transform. seed[k] >= 0 is an index into the seed positions SX/SZ; on return every
// reachable vertex holds its nearest seed and dist its squared distance.
function featureTransform(seed, dist, nx, nz, x0, z0, cell, SX, SZ) {
  for (let j = 0, k = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++, k++) {
      const s = seed[k];
      if (s >= 0) {
        const dx = x0 + i * cell - SX[s], dz = z0 + j * cell - SZ[s];
        dist[k] = dx * dx + dz * dz;
      } else dist[k] = 1e30;
    }
  }
  const relax = (k, kn, x, z) => {
    const s = seed[kn];
    if (s < 0) return;
    const dx = x - SX[s], dz = z - SZ[s], dd = dx * dx + dz * dz;
    if (dd < dist[k]) {
      dist[k] = dd;
      seed[k] = s;
    }
  };
  for (let j = 0; j < nz; j++) {
    const z = z0 + j * cell;
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i, x = x0 + i * cell;
      if (i > 0) relax(k, k - 1, x, z);
      if (j > 0) {
        relax(k, k - nx, x, z);
        if (i > 0) relax(k, k - nx - 1, x, z);
        if (i < nx - 1) relax(k, k - nx + 1, x, z);
      }
    }
    for (let i = nx - 2; i >= 0; i--) relax(j * nx + i, j * nx + i + 1, x0 + i * cell, z);
  }
  for (let j = nz - 1; j >= 0; j--) {
    const z = z0 + j * cell;
    for (let i = nx - 1; i >= 0; i--) {
      const k = j * nx + i, x = x0 + i * cell;
      if (i < nx - 1) relax(k, k + 1, x, z);
      if (j < nz - 1) {
        relax(k, k + nx, x, z);
        if (i > 0) relax(k, k + nx - 1, x, z);
        if (i < nx - 1) relax(k, k + nx + 1, x, z);
      }
    }
    for (let i = 1; i < nx; i++) relax(j * nx + i, j * nx + i - 1, x0 + i * cell, z);
  }
}
function loopPoly(p) {
  const poly = [];
  for (let i = 0; i < p.n; i += 3) poly.push([p.x[i], p.z[i]]);
  return poly;
}
// Inside-the-polygon mask for the grid (even-odd scanlines).
function polyMask(poly, nx, nz, x0, z0, cell) {
  const mask = new Uint8Array(nx * nz);
  const xs = [];
  for (let j = 0; j < nz; j++) {
    const z = z0 + j * cell;
    xs.length = 0;
    for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
      const za = poly[a][1], zb = poly[b][1];
      if (za > z !== zb > z) xs.push(poly[a][0] + ((z - za) / (zb - za)) * (poly[b][0] - poly[a][0]));
    }
    xs.sort((p, q) => p - q);
    for (let c = 0; c + 1 < xs.length; c += 2) {
      const i0 = Math.max(0, Math.ceil((xs[c] - x0) / cell)), i1 = Math.min(nx - 1, Math.floor((xs[c + 1] - x0) / cell));
      for (let i = i0; i <= i1; i++) mask[j * nx + i] = 1;
    }
  }
  return mask;
}
// Landmark builders: called with this = World3D, (spec, x, groundY, z, roadHeading, parts).
// Push geometry onto parts (merged and culled per cell); things that move get their own mesh
// and an entry in this.anims. Course-specific builders live in js/scenery/*.js.
const LANDMARKS = {
  gantry(lm, x, y, z, head, parts) {
    // always over the start line, standing on the banked road edges
    const T = this.track, p = T.main, s = T.startS;
    const pt = p.point(s, 0);
    const e = pt.hw + pt.sh + 0.6;
    const L = p.point(s, -e), R = p.point(s, e);
    const top = Math.max(L.y, R.y) + 7.8;
    for (const q of [L, R]) {
      const h = top + 1.3 - q.y;
      parts.push(GK.at(GK.cyl(0.6, 0.75, h, '#fff6ea', { seed: q === L ? 3 : 4 }), q.x, q.y + h / 2, q.z));
      parts.push(GK.at(GK.blob(1, 1, 1, '#ff6f91', { seed: q === L ? 9 : 10 }), q.x, top + 1.3, q.z));
    }
    const mx = (L.x + R.x) / 2, mz = (L.z + R.z) / 2;
    parts.push(GK.at(GK.box(1.0, 2.2, e * 2, '#ff6f91', { seed: 4, lump: 0.08 }), mx, top, mz, 0, -pt.head, 0));
    // checker blocks on the banner
    for (let k = -4; k <= 4; k++) {
      const d = (k / 4.5) * e;
      const cx = pt.x + pt.nx * d, cz = pt.z + pt.nz * d;
      parts.push(GK.at(GK.box(1.1, 0.7, 0.9, k % 2 ? '#2b1838' : '#fff6ea', { seed: k + 20, lump: 0.02 }), cx, top + 0.7, cz, 0, -pt.head, 0));
      parts.push(GK.at(GK.box(1.1, 0.7, 0.9, k % 2 ? '#fff6ea' : '#2b1838', { seed: k + 40, lump: 0.02 }), cx, top - 0.7, cz, 0, -pt.head, 0));
    }
    // three big start lamps on top
    for (let k = -1; k <= 1; k++) {
      const d = k * 2.4;
      const cx = pt.x + pt.nx * d - pt.tx * 0.2, cz = pt.z + pt.nz * d - pt.tz * 0.2;
      parts.push(GK.at(GK.box(1.6, 1.6, 1.6, '#2b1838', { seed: k + 60, r: 0.3 }), cx, top + 2.0, cz, 0, -pt.head, 0));
      parts.push(GK.at(GK.blob(0.6, 0.6, 0.6, k === 1 ? '#7ddc6f' : '#ff6f61', { seed: k + 70, lump: 0 }), cx - pt.tx * 0.75, top + 2.0, cz - pt.tz * 0.75));
      this.glow(cx - pt.tx * 1.1, top + 2.0, cz - pt.tz * 1.1, 2.2, k === 1 ? '#a8ff9c' : '#ff9a8a', 0);
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
    m.castShadow = true;
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
  // A lake in a bowl in the land (carved by buildTerrain), with shore stones and reeds.
  lake(lm, x, y, z, head, parts) {
    const L = this.lakes.find((l) => l.lm === lm);
    const r = L ? L.r : lm.r || 14, wy = L ? L.y : y;
    if (L) (x = L.x), (z = L.z);
    const n = 40, verts = [x, wy, z], uvs = [0, 0], idx = [];
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * TAU;
      const rr = r * (1 + (noise3(Math.cos(a) * 1.5 + x * 0.01, 4, Math.sin(a) * 1.5) - 0.5) * 0.18);
      verts.push(x + Math.cos(a) * rr, wy, z + Math.sin(a) * rr);
      uvs.push(1, k / n);
      if (k > 0) idx.push(0, k + 1, k);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    const water = new THREE.Mesh(geo, this.waterMaterial({ world: true, outer: true, edge: 0.12, color: lm.color || '#7fd3f0', flow: [0.05, 0.08], wave: 0.06 }));
    water.position.y = 0.15;
    this.scene.add(water);
    this.keep(geo);
    const shore = this.def.theme === 'meadow' ? '#62b956' : '#8c8fae';
    for (let k = 0; k < 14; k++) {
      const a = k * 0.45 + U.hash2(k, 3, 1);
      const rr = r * (1.02 + U.hash2(k, 4, 1) * 0.12);
      const gx = x + Math.cos(a) * rr, gz = z + Math.sin(a) * rr;
      parts.push(GK.at(GK.blob(1.1 + U.hash2(k, 5, 1), 0.6, 1.0, k % 3 ? '#a59cb5' : shore, { seed: 50 + k }), gx, this.groundAt(gx, gz, wy) + 0.2, gz));
    }
  },
  pond(lm, x, y, z, head, parts) {
    LANDMARKS.lake.call(this, lm, x, y, z, head, parts);
    const L = this.lakes.find((l) => l.lm === lm);
    const wy = L ? L.y : y, cx = L ? L.x : x, cz = L ? L.z : z;
    for (let k = 0; k < 6; k++) {
      const a = k * 1.3, r = (lm.r || 14) * (0.3 + (k % 3) * 0.2);
      parts.push(GK.at(GK.blob(1.4, 0.15, 1.4, '#62b956', { seed: 50 + k }), cx + Math.cos(a) * r, wy + 0.25, cz + Math.sin(a) * r));
    }
  },
  balloon(lm, x, y, z, head, parts) {
    const P = [];
    P.push(GK.blob(5, 6, 5, '#ff8fb1', { seed: 61 }));
    P.push(GK.at(GK.blob(5.05, 1.2, 5.05, '#ffd166', { seed: 62 }), 0, 0.5, 0));
    P.push(GK.at(GK.box(2, 1.4, 2, '#8a5a3c', { seed: 63 }), 0, -8, 0));
    for (const [a, b] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) P.push(GK.at(GK.cyl(0.06, 0.06, 4, '#3b2440', { segs: 4, lump: 0 }), a * 0.8, -5.6, b * 0.8));
    const m = new THREE.Mesh(GK.merge(P), this.clayMat);
    m.castShadow = true;
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
    // lit windows
    for (const [dx, dz] of [[-15, 0], [15, 0], [0, -13], [0, 13]]) this.glow(x + dx * 1.02, y + 12, z + dz * 1.02, 3, '#ffcf7a', 2);
  },
  tower(lm, x, y, z, head, parts) {
    parts.push(GK.at(GK.cyl(3, 3.6, 16, '#8a7fa6', { seed: Math.round(x) }), x, y + 8, z));
    parts.push(GK.at(GK.cone(4, 6, '#e2483d', { seed: Math.round(z) }), x, y + 19, z));
    parts.push(GK.at(GK.blob(0.9, 1.3, 0.9, '#ffd166', { seed: 3 }), x, y + 23, z));
    this.glow(x, y + 23.3, z, 4, '#ffd166', 2);
  },
  volcano(lm, x, y, z, head, parts) {
    parts.push(GK.at(GK.cone(70, 80, '#3d2f48', { seed: 5, segs: 18, lump: 6 }), x, -2 + 40, z));
    const crater = new THREE.Mesh(this.keep(new THREE.CylinderGeometry(12, 14, 6, 18)), this.lavaMaterial({ scale: 3 }));
    crater.position.set(x, 76, z);
    this.scene.add(crater);
    this.glow(x, 84, z, 46, '#ff7a2f', 2);
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

  // ----- generic kinds for course designers -----
  // {seg, t, seg1, t1, look: 'ice' | 'rock' | 'wood' | 'castle'}: built by tunnel() (it also
  // shapes the land), so nothing to do here.
  tunnel() {},
  // {seg, t, seg1, t1, look: 'wood' | 'stone' | 'ice'}: piers and a deck under a stretch of road
  // (usually one with drop edges), and railings where the edges are walls.
  bridge(lm, x, y, z, head, parts) {
    const r = this.rangeOf(lm);
    if (!r) return;
    const p = this.track.main, look = lm.look || 'wood';
    const col = { wood: ['#8a5a3c', '#6b4a3a'], stone: ['#b9b0c8', '#9a8fb4'], ice: ['#cfe8ff', '#a9d6ff'] }[look] || ['#8a5a3c', '#6b4a3a'];
    const ids = [];
    for (let s = r.s0; s <= r.s1; s += p.step) ids.push(p.indexAt(s));
    // deck underside
    this.put(this.ribbon(p, ids, (i) => p.hw[i] + p.sh[i] + 0.3, (i) => -p.hw[i] - p.sh[i] - 0.3, -1.1, { across: 2, color: col[1] }), this.stillMat, { far: true });
    for (const side of [-1, 1]) this.put(this.extrude(p, ids, side, [[0.3, 0.02], [0.35, -1.15]], col[0], 'beam'), this.stillMat, { far: true });
    const v = {};
    for (let k = 0; k < ids.length; k += look === 'stone' ? 16 : 10) {
      const i = ids[k];
      for (const side of [-1, 1]) {
        const d = side * (p.hw[i] + p.sh[i] - 0.6);
        this.gp(p, i, d, -1.1, v);
        const ground = this.heightAt(v.x, v.z);
        const bottom = ground === null ? this.voidY + 4 : ground - 0.5;
        const h = v.y - bottom;
        if (h < 1) continue;
        const pier = look === 'stone' ? GK.box(2.4, h, 2.4, col[0], { seed: i + side, lump: 0.1 }) : GK.cyl(look === 'ice' ? 0.9 : 0.55, look === 'ice' ? 1.3 : 0.65, h, col[0], { seed: i + side, segs: 8 });
        parts.push(GK.at(pier, v.x, bottom + h / 2, v.z));
        if (look === 'wood' && h > 4 && k + 10 < ids.length) {
          // cross bracing to the next pier
          const j = ids[k + 10];
          const w = this.gp(p, j, side * (p.hw[j] + p.sh[j] - 0.6), -1.1);
          const len = Math.hypot(w.x - v.x, w.z - v.z), drop = Math.min(h, 6);
          const brace = GK.cyl(0.18, 0.18, Math.hypot(len, drop), col[1], { segs: 5, lump: 0 });
          const a = Math.atan2(len, drop);
          brace.rotateZ(-a);
          brace.rotateY(-Math.atan2(w.z - v.z, w.x - v.x));
          brace.translate((v.x + w.x) / 2, v.y - drop / 2, (v.z + w.z) / 2);
          parts.push(brace);
        }
      }
    }
  },
  // {seg, t, d}: a grandstand full of fans beside the road at d (sign picks the side).
  grandstand(lm, x, y, z, head, parts) {
    const w = this.track.where(lm);
    if (w.path !== this.track.main) return;
    this.stand(w.path, w.s, (lm.d || 1) >= 0 ? 1 : -1, lm.len || 30);
  },
  // {seg, t, d, text}: a sponsor banner. Over the road (|d| < half width) it hangs from two
  // poles; beside it, it is a billboard facing the road.
  banner(lm, x, y, z, head, parts) {
    const T = this.track, w = T.where(lm), p = w.path;
    const brand = lm.text ? [lm.text, lm.color || '#ff6f91', '#ffffff'] : BRANDS[Math.floor(U.hash2(Math.round(w.s), 3, 9) * BRANDS.length)];
    const tex = this.brandTexture(brand);
    const q = p.point(w.s, 0);
    if (Math.abs(lm.d || 0) < q.hw) {
      const e = q.hw + q.sh + 0.8;
      const L = p.point(w.s, -e), R = p.point(w.s, e);
      const top = Math.max(L.y, R.y) + 6.5;
      for (const g of [L, R]) parts.push(GK.at(GK.cyl(0.25, 0.3, top - g.y + 0.6, '#fff6ea', { segs: 7 }), g.x, (top + g.y + 0.6) / 2, g.z));
      const m = this.flatFrame(q.x, top, q.z, q.head);
      const bw = Math.min(e * 1.6, 16);
      this.putAt(GK.box(0.4, bw / 4 + 0.4, bw + 0.4, brand[1], { seed: 3, lump: 0.03 }), m, this.clayMat);
      const sign = this.signGeo(bw, bw / 4);
      const pos = sign.attributes.position;
      for (let v = 0; v < pos.count; v++) pos.setX(v, pos.getX(v) < 0.01 ? -0.23 : 0.23);
      this.putAt(sign, m, this.signMat(tex), { cast: false });
    } else {
      const side = lm.d > 0 ? 1 : -1;
      const hd = side > 0 ? q.head : q.head + Math.PI;
      const m = this.flatFrame(x, y, z, hd);
      const fr = [GK.at(GK.box(9.4, 2.7, 0.35, '#3b2a4a', { seed: 5, lump: 0.02 }), 0, 4, 0.1)];
      for (const px of [-3.5, 3.5]) fr.push(GK.at(GK.cyl(0.18, 0.22, 4, '#8c8fae', { segs: 6 }), px, 1.6, 0.2));
      this.putAt(GK.merge(fr), m, this.stillMat);
      const sign = this.signGeo(9, 2.25, false);
      sign.rotateY(-Math.PI / 2);
      sign.translate(0, 4, -0.1);
      this.putAt(sign, m, this.signMat(tex), { cast: false });
    }
  },
  // {seg, t, look: 'balloon' | 'stone' | 'ice' | 'wood' | 'flowers'}: a decorative arch.
  arch(lm, x, y, z, head, parts) {
    const T = this.track, w = T.where(lm), p = w.path;
    const look = lm.look || 'balloon';
    if (look === 'balloon') return this.arch(p, w.s, { cols: lm.colors || ['#ff6f91', '#fff6ea'], pillar: 4 });
    const q = p.point(w.s, 0);
    const e = q.hw + q.sh + 1.4;
    const m = this.frame(p, w.s);
    const L = {
      stone: { col: '#b9b0c8', acc: '#ffd166', r: 1.3 },
      ice: { col: '#bfe3ff', acc: '#8fd0ff', r: 1.1 },
      wood: { col: '#8a5a3c', acc: '#fff6ea', r: 0.9 },
      flowers: { col: '#5fb04c', acc: '#ff6f91', r: 1.4 },
    }[look] || { col: '#b9b0c8', acc: '#ffd166', r: 1.3 };
    const H = 3.5, P = [];
    const ring = GK.torus(e, L.r, L.col, { arc: Math.PI, ts: 32, rs: 8, seed: 3, lump: look === 'flowers' ? 0.5 : 0.18 });
    if (look === 'stone' || look === 'wood') {
      // blocks / planks in two shades
      const pos = ring.attributes.position, col = ring.attributes.color;
      for (let v = 0; v < pos.count; v++) {
        if (Math.floor((Math.atan2(pos.getY(v), pos.getX(v)) / Math.PI) * 11) % 2) col.setXYZ(v, col.getX(v) * 0.86, col.getY(v) * 0.86, col.getZ(v) * 0.86);
      }
    }
    ring.rotateY(Math.PI / 2);
    ring.translate(0, H, 0);
    P.push(ring);
    for (const zz of [-e, e]) {
      if (look === 'wood') P.push(GK.at(GK.cyl(0.8, 0.95, H + 0.8, L.col, { seed: zz > 0 ? 50 : 51, segs: 9 }), 0, H / 2 - 0.2, zz));
      else if (look === 'flowers') for (let k = 0; k < 3; k++) P.push(GK.at(GK.blob(1.6, 1.3, 1.6, L.col, { seed: k + (zz > 0 ? 60 : 70) }), 0, k * 1.3, zz));
      else P.push(GK.at(GK.box(2.6, H + 0.8, 2.6, L.col, { seed: zz > 0 ? 50 : 51, r: 0.35 }), 0, H / 2 - 0.2, zz));
    }
    if (look === 'stone') P.push(GK.at(GK.box(2.2, 2.4, 2.0, L.acc, { seed: 9, r: 0.3 }), 0, H + e, 0));
    for (let k = 1; k < 16; k++) {
      const a = (k / 16) * Math.PI;
      const ry = H + Math.sin(a) * e, rz = Math.cos(a) * e;
      if (look === 'flowers' && k % 2) {
        P.push(GK.at(GK.blob(0.5, 0.4, 0.5, k % 4 === 1 ? L.acc : '#ffd166', { seed: k + 20 }), -L.r * 0.8, ry, rz));
        P.push(GK.at(GK.blob(0.5, 0.4, 0.5, k % 4 === 3 ? L.acc : '#c77dff', { seed: k + 30 }), L.r * 0.8, ry, rz));
      } else if (look === 'ice' && k % 2) {
        P.push(GK.at(GK.cone(0.35, 1.4 + U.hash2(k, 2, 3) * 1.2, '#e8f6ff', { seed: k + 40, segs: 5 }), 0, ry - L.r - 0.5, rz, Math.PI));
      } else if (look === 'wood' && k % 5 === 0) {
        const v = new THREE.Vector3(0, ry - 1.6, rz).applyMatrix4(m);
        P.push(GK.at(GK.box(0.6, 0.8, 0.6, '#ffe9a8', { seed: k, r: 0.15 }), 0, ry - 1.6, rz));
        this.glow(v.x, v.y, v.z, 2.2, '#ffe6a3', 0);
      }
    }
    this.putAt(GK.merge(P), m, this.clayMat, { name: 'arch' });
  },
  // {seg, t, d, w, h}: a waterfall pouring from a cliff into a foaming pool, facing the road.
  waterfall(lm, x, y, z, head, parts) {
    const w = lm.w || 14, h = lm.h || 24;
    const T = this.track, at = T.where(lm);
    const road = at.path.point(at.s, 0);
    const face = Math.atan2(road.z - z, road.x - x); // toward the road
    const m = this.flatFrame(x, y, z, face);
    // the sheet of water: local x toward the road, falls along -y; uv v runs down the fall
    const sheet = new THREE.PlaneGeometry(w, h, 6, 8);
    sheet.rotateY(-Math.PI / 2);
    const pos = sheet.attributes.position, uv = sheet.attributes.uv;
    for (let v = 0; v < pos.count; v++) {
      const t = 0.5 - pos.getY(v) / h; // 0 top .. 1 bottom
      pos.setX(v, 0.2 + t * t * 2.2 + Math.sin(pos.getZ(v) * 0.7) * 0.25);
      uv.setY(v, t * (h / 10));
    }
    sheet.translate(0, h / 2 + 0.2, 0);
    sheet.applyMatrix4(m);
    const fall = new THREE.Mesh(sheet, this.waterMaterial({ flow: 1.6, fall: true, across: w / 10, color: '#a8e6fb', deep: '#5ab4e4', opacity: 0.92, wave: 0, side: THREE.DoubleSide }));
    this.scene.add(fall);
    this.keep(sheet);
    // the cliff behind and rocks around
    const rock = this.def.theme === 'lava' ? '#5b4a6e' : '#8c8296', cap = this.def.theme === 'meadow' ? '#62b956' : '#ffffff';
    const P = [];
    const rows = Math.max(2, Math.round(h / 7));
    for (let r = 0; r < rows; r++) {
      const yy = ((r + 0.5) / rows) * h;
      for (let c = -2; c <= 2; c++) {
        const side = Math.abs(c) === 2;
        P.push(GK.at(GK.blob(3.2, h / rows / 1.6 + 1.2, side ? 3.2 : w * 0.2 + 1, rock, { seed: r * 5 + c + 20, lump: 0.9 }), side ? 1.2 : -5.2 + U.hash2(r, c, 1) * 0.6, yy, c * (w * 0.22 + 1.6)));
      }
    }
    P.push(GK.at(GK.blob(4.5, 2, w * 0.7, cap, { seed: 4 }), -4.2, h + 0.6, 0));
    for (let k = 0; k < 8; k++) P.push(GK.at(GK.blob(1.6 + U.hash2(k, 1, 3) * 1.4, 1.2, 1.6, '#9c93a8', { seed: 10 + k }), 3 + (k % 3) * 2.2, 0.3, ((k / 7) * 2 - 1) * (w * 0.7)));
    this.putAt(GK.merge(P), m, this.clayMat, { far: true });
    // the pool and its mist
    const pool = new THREE.CircleGeometry(w * 0.75, 24);
    pool.rotateX(-Math.PI / 2);
    const puv = pool.attributes.uv, ppos = pool.attributes.position;
    for (let v = 0; v < puv.count; v++) puv.setX(v, Math.hypot(ppos.getX(v), ppos.getZ(v)) / (w * 0.75));
    pool.translate(4, 0.35, 0);
    pool.applyMatrix4(m);
    this.scene.add(new THREE.Mesh(pool, this.waterMaterial({ world: true, outer: true, edge: 0.25, flow: [0.2, 0.1], wave: 0.05 })));
    this.keep(pool);
    const v = new THREE.Vector3();
    for (let k = -1; k <= 1; k++) {
      v.set(0.5, 1.2, k * w * 0.3).applyMatrix4(m);
      this.glow(v.x, v.y, v.z, 4.5, '#ffffff', 3);
    }
  },
  // {seg, t, d, r, n}: a clump of n pines within r units.
  pines(lm, x, y, z, head, parts) {
    const rnd = U.rng(Math.round(x * 13 + z * 7));
    const n = lm.n || 14, r = lm.r || 18;
    for (let k = 0; k < n; k++) {
      const a = rnd() * TAU, rr = Math.sqrt(rnd()) * r;
      const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
      if (!this.clearOfRoads(px, pz, 2.5) || this.landKind(px, pz) === 1) continue;
      this.stamp(this.decorVariant('pine', k % 3), px, this.groundAt(px, pz, y), pz, rnd() * TAU, 1 + rnd() * 0.9, this.clayMat);
    }
  },
};
