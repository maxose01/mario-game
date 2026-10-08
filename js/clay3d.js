'use strict';
// Claymation in 3D.
// One shared material recipe makes everything look sculpted: soft rough lighting, a fingerprint
// and grain texture, a darkened clay rim (like the outlines in the side-scroller), and "boil":
// every vertex is nudged by smooth noise that re-rolls 12 times a second, so silhouettes wobble
// like hand-animated plasticine while motion itself stays smooth.
// Geometry helpers build lumpy, vertex-coloured primitives that merge into a few big meshes.

const Clay3D = {
  uniforms: { uBoil: { value: 0 }, uBoilAmt: { value: 1 }, uRim: { value: 0.38 } },
  tex: {},
  mats: {},

  init() {
    this.tex.grain = this.grainTexture(256);
  },

  update(time) {
    this.uniforms.uBoil.value = Math.floor(time * CFG.boilFps);
    this.uniforms.uBoilAmt.value = CFG.boilAmount;
    this.uniforms.uRim.value = CFG.rimDark;
  },

  // Grain, soft blotches and thumbprints around light grey, multiplied over the clay colour.
  grainTexture(size) {
    const c = Clay.makeCanvas(size, size);
    const g = c.getContext('2d');
    g.fillStyle = '#ececec';
    g.fillRect(0, 0, size, size);
    const rnd = U.rng(77);
    const wrap = (fn) => {
      for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) fn(ox, oy);
    };
    for (let k = 0; k < 40; k++) {
      const x = rnd() * size, y = rnd() * size, r = 8 + rnd() * 26;
      g.fillStyle = rnd() < 0.5 ? 'rgba(120,90,110,0.07)' : 'rgba(255,255,255,0.1)';
      wrap((ox, oy) => {
        g.beginPath();
        g.ellipse(x + ox, y + oy, r, r * 0.7, rnd() * 3, 0, TAU);
        g.fill();
      });
    }
    // thumbprints
    for (let k = 0; k < 9; k++) {
      const x = rnd() * size, y = rnd() * size, r = 10 + rnd() * 14, rot = rnd() * TAU;
      g.strokeStyle = 'rgba(80,50,70,0.12)';
      g.lineWidth = 1.2;
      wrap((ox, oy) => {
        for (let i = 0; i < 6; i++) {
          const rr = r * (0.25 + i * 0.15);
          g.beginPath();
          g.ellipse(x + ox, y + oy, rr, rr * 0.72, rot, 0.4 + i * 0.2, Math.PI * 1.6 + i * 0.1);
          g.stroke();
        }
      });
    }
    // speckle
    const img = g.getImageData(0, 0, size, size);
    const d = img.data;
    for (let i = 0; i < size * size; i++) {
      const r = rnd();
      const v = r < 0.08 ? -26 : r > 0.95 ? 18 : 0;
      d[i * 4] += v;
      d[i * 4 + 1] += v;
      d[i * 4 + 2] += v;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  },

  // The clay material. o: {color, vertexColors, map, wobble, freq, rough, emissive, flatRim, transparent, opacity, side}
  material(o = {}) {
    const m = new THREE.MeshStandardMaterial({
      color: o.color !== undefined ? o.color : 0xffffff,
      vertexColors: !!o.vertexColors,
      map: o.map !== undefined ? o.map : this.tex.grain,
      bumpMap: o.bump === false ? null : this.tex.grain,
      bumpScale: o.bumpScale !== undefined ? o.bumpScale : 0.6,
      roughness: o.rough !== undefined ? o.rough : 0.72,
      metalness: o.metal || 0,
      emissive: o.emissive !== undefined ? o.emissive : 0x000000,
      emissiveIntensity: o.emissiveIntensity !== undefined ? o.emissiveIntensity : 1,
      transparent: !!o.transparent,
      opacity: o.opacity !== undefined ? o.opacity : 1,
      side: o.side || THREE.FrontSide,
      depthWrite: o.depthWrite !== undefined ? o.depthWrite : true,
      fog: o.fog !== undefined ? o.fog : true,
    });
    if (o.map && o.repeat) o.map.repeat.set(o.repeat, o.repeat);
    this.patch(m, o.wobble !== undefined ? o.wobble : 0.05, o.freq !== undefined ? o.freq : 1.4, o.rim !== undefined ? o.rim : 1);
    return m;
  },

  patch(m, wobble, freq, rimK) {
    const U3 = this.uniforms;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uBoil = U3.uBoil;
      sh.uniforms.uBoilAmt = U3.uBoilAmt;
      sh.uniforms.uRim = U3.uRim;
      sh.uniforms.uWob = { value: wobble };
      sh.uniforms.uFreq = { value: freq };
      sh.uniforms.uRimK = { value: rimK };
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
uniform float uBoil; uniform float uBoilAmt; uniform float uWob; uniform float uFreq;
float clayH(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float clayN(vec3 p){
  vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(clayH(i), clayH(i+vec3(1,0,0)), f.x), mix(clayH(i+vec3(0,1,0)), clayH(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(clayH(i+vec3(0,0,1)), clayH(i+vec3(1,0,1)), f.x), mix(clayH(i+vec3(0,1,1)), clayH(i+vec3(1,1,1)), f.x), f.y), f.z);
}`,
        )
        .replace(
          '#include <begin_vertex>',
          `vec3 transformed = vec3( position );
#ifdef USE_INSTANCING
  vec3 clayP = (instanceMatrix * vec4(position, 1.0)).xyz;
#else
  vec3 clayP = position;
#endif
if (uWob > 0.0) {
  float n = clayN(clayP * uFreq + vec3(uBoil * 1.37, uBoil * 2.11, uBoil * 0.73)) - 0.5;
  transformed += objectNormal * n * uWob * uBoilAmt;
}`,
        );
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uRim; uniform float uRimK;')
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
{
  float clayRim = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
  diffuseColor.rgb *= 1.0 - uRim * uRimK * pow(clayRim, 2.4);
}`,
        );
    };
    m.customProgramCacheKey = () => 'clay' + (wobble > 0 ? 'w' : '') + rimK;
  },
};

// ---------------------------------------------------------------------------
// Geometry kit: lumpy primitives with vertex colours, plus transforms and merging.
const GK = {
  _c: null,
  color(hex) {
    return (this._c || (this._c = new THREE.Color())).set(hex);
  },

  // Fill the color attribute with one colour (slightly varied for a hand-mixed look).
  paint(geo, hex, vary = 0.05, seed = 1) {
    const n = geo.attributes.position.count;
    const col = new Float32Array(n * 3);
    const c = new THREE.Color(hex);
    const pos = geo.attributes.position;
    for (let i = 0; i < n; i++) {
      const v = vary ? (U.hash2(Math.round(pos.getX(i) * 7), Math.round(pos.getY(i) * 7 + pos.getZ(i) * 5), seed) - 0.5) * vary : 0;
      col[i * 3] = U.clamp(c.r + v, 0, 1);
      col[i * 3 + 1] = U.clamp(c.g + v, 0, 1);
      col[i * 3 + 2] = U.clamp(c.b + v, 0, 1);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  },

  // Push vertices in/out along their normals by smooth noise (sculpted lumps).
  lump(geo, amt, freq = 1.6, seed = 1) {
    if (!amt) return geo;
    const pos = geo.attributes.position, nor = geo.attributes.normal;
    const o = seed * 13.7;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const n = noise3(x * freq + o, y * freq + o * 0.5, z * freq - o) - 0.5;
      pos.setXYZ(i, x + nor.getX(i) * n * amt, y + nor.getY(i) * n * amt, z + nor.getZ(i) * n * amt);
    }
    geo.computeVertexNormals();
    return geo;
  },

  blob(rx, ry, rz, hex, o = {}) {
    const g = new THREE.SphereGeometry(1, o.ws || 16, o.hs || 12);
    g.scale(rx, ry, rz);
    this.lump(g, o.lump !== undefined ? o.lump : Math.min(rx, ry, rz) * 0.18, o.freq || 2.2 / Math.max(0.3, Math.min(rx, ry, rz)), o.seed || 1);
    return this.paint(g, hex, o.vary, o.seed);
  },
  box(w, h, d, hex, o = {}) {
    const r = o.r !== undefined ? o.r : Math.min(w, h, d) * 0.22;
    const seg = o.seg || 4;
    const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
    // round the corners: clamp to an inner box, then push out by r along the offset
    const pos = g.attributes.position;
    const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      const cx = U.clamp(v.x, -hx, hx), cy = U.clamp(v.y, -hy, hy), cz = U.clamp(v.z, -hz, hz);
      const dx = v.x - cx, dy = v.y - cy, dz = v.z - cz;
      const l = Math.hypot(dx, dy, dz) || 1;
      pos.setXYZ(i, cx + (dx / l) * r, cy + (dy / l) * r, cz + (dz / l) * r);
    }
    g.computeVertexNormals();
    this.lump(g, o.lump !== undefined ? o.lump : Math.min(w, h, d) * 0.06, o.freq || 1.5, o.seed || 1);
    return this.paint(g, hex, o.vary, o.seed);
  },
  cyl(rt, rb, h, hex, o = {}) {
    const g = new THREE.CylinderGeometry(rt, rb, h, o.segs || 14, o.hsegs || 3, !!o.open);
    this.lump(g, o.lump !== undefined ? o.lump : Math.min(rt, rb) * 0.12, o.freq || 2, o.seed || 1);
    return this.paint(g, hex, o.vary, o.seed);
  },
  cone(r, h, hex, o = {}) {
    const g = new THREE.ConeGeometry(r, h, o.segs || 12, o.hsegs || 3);
    this.lump(g, o.lump !== undefined ? o.lump : r * 0.1, o.freq || 2, o.seed || 1);
    return this.paint(g, hex, o.vary, o.seed);
  },
  torus(R, r, hex, o = {}) {
    const g = new THREE.TorusGeometry(R, r, o.rs || 10, o.ts || 20, o.arc || TAU);
    this.lump(g, o.lump !== undefined ? o.lump : r * 0.2, o.freq || 3, o.seed || 1);
    return this.paint(g, hex, o.vary, o.seed);
  },

  // Transform in place: position, Euler rotation (x, y, z), optional scale.
  at(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s) {
    if (s !== undefined) {
      if (typeof s === 'number') g.scale(s, s, s);
      else g.scale(s[0], s[1], s[2]);
    }
    if (rx) g.rotateX(rx);
    if (rz) g.rotateZ(rz);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    return g;
  },

  // Merge geometries (indexed or not) into one indexed geometry with position/normal/uv/color.
  merge(list) {
    list = list.filter(Boolean);
    let nv = 0, ni = 0;
    for (const g of list) {
      nv += g.attributes.position.count;
      ni += g.index ? g.index.count : g.attributes.position.count;
    }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3);
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let vo = 0, io = 0;
    for (const g of list) {
      const a = g.attributes;
      const n = a.position.count;
      pos.set(a.position.array.subarray(0, n * 3), vo * 3);
      if (a.normal) nor.set(a.normal.array.subarray(0, n * 3), vo * 3);
      if (a.uv) uv.set(a.uv.array.subarray(0, n * 2), vo * 2);
      if (a.color) col.set(a.color.array.subarray(0, n * 3), vo * 3);
      else col.fill(1, vo * 3, (vo + n) * 3);
      if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.array[i] + vo;
      else for (let i = 0; i < n; i++) idx[io++] = vo + i;
      vo += n;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    for (const g of list) g.dispose();
    return out;
  },
};

// Smooth 3D value noise in [0, 1) (CPU twin of the shader's clayN).
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let xf = x - xi, yf = y - yi, zf = z - zi;
  xf = xf * xf * (3 - 2 * xf);
  yf = yf * yf * (3 - 2 * yf);
  zf = zf * zf * (3 - 2 * zf);
  const h = (a, b, c) => U.hash(Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c, 1274126177));
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(h(xi, yi, zi), h(xi + 1, yi, zi), xf), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), xf), yf),
    l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), xf), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), xf), yf),
    zf,
  );
}
// Fractal noise for terrain.
function fbm2(x, z, oct = 3) {
  let a = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    a += amp * noise3(x * f, 0.5, z * f);
    f *= 2;
    amp *= 0.5;
  }
  return a / (1 - Math.pow(0.5, oct));
}
