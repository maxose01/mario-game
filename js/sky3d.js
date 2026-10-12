'use strict';
// The sky over a course: the light rig (a hemisphere, a warm sun that casts real-time shadows
// in a box following each view's kart, and a soft fill from the other side), the sky dome with
// its sun glow, layers of drifting clay clouds, and a ring of cheap distant backdrops per world:
// floating islands (meadow), pastel ice peaks (snow), volcano crags (lava), a snowy mountain
// range over a hazy valley (alpine).
// Built by World3D (this.world) into its scene. follow(camera) keeps the sky centred on the
// camera that is drawing, shadowFollow(x, y, z) aims the sun's shadow box before each view is
// drawn, update(time) drifts the clouds.
//
// The dome and the high streaky clouds follow the camera completely (they are "at infinity").
// The puffy clouds and the backdrops follow it across the map but keep their world height, so
// on a long descent the distant peaks rise around you and you drop through the cloud layer.
// None of it uses the scene fog: haze, light and the clay rim are baked into vertex colours
// (the camera always sits at the centre of the ring), a handful of draw calls in all.

// Per-world moods (the colours come from THEMES): where the sun is, the cool colour clay takes
// in the shade, the fill light, the sun's glow in the sky, an under-glow for lava skies, and
// which distant backdrop to build.
const SKY_MOODS = {
  meadow: { sun: [-0.45, 0.8, -0.35], shade: '#8270e0', fill: '#dccbff', glow: '#ffd2a1', backdrop: 'islands', rainbow: true },
  snow: { sun: [-0.42, 0.76, -0.45], shade: '#6d8ff0', fill: '#d3e4ff', glow: '#fff1cf', backdrop: 'icepeaks' },
  lava: { sun: [-0.52, 0.6, -0.5], shade: '#7a3496', fill: '#ff9f80', glow: '#ffb27a', under: '#ff5a1f', backdrop: 'crags', cloud: '#a77aa6', smoke: '#5e4262' },
  alpine: { sun: [-0.4, 0.72, -0.48], shade: '#5d84e0', fill: '#d4e5ff', glow: '#fff0c4', backdrop: 'range' },
  // Fable Fair's laps (the sun sits where lap 1's does, whichever lap you are in): trees: the
  // colours of the little treetops on the distant islands; sunI, hemiI, fillI: light strengths
  fairy: { sun: [-0.45, 0.8, -0.35], shade: '#4b3a9c', fill: '#9fb0ff', glow: '#ffae94', backdrop: 'islands', trees: ['#2f7a4c', '#3f9a5c', '#256a40', '#c78bff'], sunI: 1.5, hemiI: 0.95 },
  mirage: { sun: [-0.45, 0.8, -0.35], shade: '#b8708a', fill: '#ffe1b8', glow: '#ffe6a8', backdrop: 'islands', trees: ['#9fc65a', '#c9b45a', '#7fb04a', '#e8c070'], sunI: 2.1, hemiI: 0.8 },
  // (stars: a twinkling star dome with constellations, shooting stars and planets, which fades in as
  // the lap begins; backdrop elfland: floating islands with castles, toadstool villages and lit windows)
  dream: { sun: [-0.45, 0.8, -0.35], shade: '#2c2cc4', fill: '#8a8cff', glow: '#b6b8ff', backdrop: 'elfland', stars: true, trees: ['#b9a8ff', '#9a8aff', '#e8d8ff', '#ffe08a'], sunI: 1.15, hemiI: 1.05, cloud: '#c9c0ff' },
};

const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FRAG = `
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uLow;
uniform vec3 uHaze;
uniform vec3 uGlow;
uniform vec3 uUnder;
uniform vec3 uSunDir;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 col = mix(uLow, uMid, smoothstep(-0.02, 0.24, y));
  col = mix(col, uTop, smoothstep(0.2, 0.85, y));
  // a pale band of haze along the horizon, and only haze below it
  col = mix(col, uHaze, (1.0 - smoothstep(0.0, 0.14, abs(y))) * 0.5);
  col = mix(col, uHaze, 1.0 - smoothstep(-0.22, 0.0, y));
  // the sun: a wide warm wash and a tighter halo
  float s = max(0.0, dot(d, uSunDir));
  col += uGlow * (pow(s, 5.0) * 0.26 + pow(s, 42.0) * 0.55);
  // lava skies glow from below the horizon
  col += uUnder * (1.0 - smoothstep(-0.12, 0.32, y)) * 0.6;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  // a little dither so the long gradient doesn't band
  gl_FragColor.rgb += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
}`;

// The night sky's stars: points on the dome that twinkle (a phase per star), the bigger ones with a
// four-pointed flare, fading out toward the horizon haze. uAmt fades the whole sky in and out.
const STAR_VERT = `
attribute vec3 aCol;
attribute float aSize;
attribute float aPhase;
uniform float uTime;
uniform float uAmt;
uniform float uPx;
varying vec3 vCol;
varying float vAmp;
varying float vBig;
void main() {
  vec3 d = normalize(position);
  float tw = 0.62 + 0.38 * sin(uTime * (1.1 + aPhase * 1.6) + aPhase * 60.0);
  vAmp = tw * uAmt * smoothstep(-0.02, 0.2, d.y);
  vCol = aCol;
  vBig = step(2.7, aSize);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPx * (0.82 + 0.3 * tw);
}`;
const STAR_FRAG = `
varying vec3 vCol;
varying float vAmp;
varying float vBig;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float r = length(q) * 2.0;
  float core = 1.0 - smoothstep(0.0, 1.0, r);
  core *= core;
  float flare = vBig * 0.9 * (smoothstep(0.1, 0.0, abs(q.x)) * smoothstep(0.5, 0.0, abs(q.y)) + smoothstep(0.1, 0.0, abs(q.y)) * smoothstep(0.5, 0.0, abs(q.x)));
  float a = (core + flare) * vAmp;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol, min(1.0, a));
  #include <colorspace_fragment>
}`;

class Sky3D {
  constructor(world) {
    this.world = world;
    this.theme = world.theme;
    this.def = world.def;
    this.scene = world.scene;
    this.mood = SKY_MOODS[this.def.theme] || SKY_MOODS.meadow;
    this.layers = []; // drifting cloud layers: {obj, speed}
    // heights the backdrops and clouds are placed around (world units)
    const p = world.track.main;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < p.n; i++) {
      lo = Math.min(lo, p.y[i]);
      hi = Math.max(hi, p.y[i]);
    }
    this.lo = lo;
    this.hi = hi;
    this.floorY = world.valley ? world.valleyY : world.voidY !== undefined ? world.voidY : lo - 46;
    const th = this.theme;
    this.hazeCol = new THREE.Color(th.sky[2]).lerp(new THREE.Color(th.fog), 0.5);
    this.airCol = new THREE.Color(th.sky[1]).lerp(new THREE.Color(th.fog), 0.35); // distance tint
    this.buildLights();
    this.buildSky();
    this.buildClouds();
    this.buildBackdrop();
    if (world.multi) this.buildLapSets();
    this.buildNight();
  }

  keep(o) {
    return this.world.keep(o);
  }

  // ---------- one look per lap ----------
  // A course whose laps have themes of their own keeps one set of sky colours, light, fog, clouds
  // and distant backdrop per lap. The first lap's is the one built above; the others are built
  // here (the builders read this.theme / this.mood, so they are pointed at each lap in turn), and
  // applyLap(a, b, w) then dresses the scene for lap a blending into lap b before each view is drawn.
  buildLapSets() {
    const world = this.world, C = (hex) => new THREE.Color(hex);
    const base = { theme: this.theme, mood: this.mood, hazeCol: this.hazeCol, airCol: this.airCol, shadeCol: this.shadeCol, _amb: this._amb, _sun: this._sun };
    const cache = {};
    this.sets = world.themes.map((th, i) => {
      const key = world.themeKeys[i];
      if (cache[key]) return cache[key];
      const mood = SKY_MOODS[key] || SKY_MOODS.meadow;
      const set = (cache[key] = {
        key, th, mood,
        top: C(th.sky[0]), mid: C(th.sky[1]), low: C(th.sky[2]),
        haze: C(th.sky[2]).lerp(C(th.fog), 0.5), glow: C(mood.glow), under: C(mood.under || '#000000'), sun: C(th.sun),
        streak: C(mood.cloud || th.cloud || '#ffffff').lerp(C(th.sky[1]), 0.15),
        fog: C(th.fog), fogNear: th.fogNear || 90, fogFar: th.fogFar || 520,
        hemiSky: C(th.hemiSky), hemiGround: C(th.hemiGround), sunLight: C(th.sunLight), fill: C(mood.fill), shade: C(mood.shade),
        sunI: mood.sunI || 1.9, hemiI: mood.hemiI || 0.8, fillI: mood.fillI || 0.3,
        objs: [],
      });
      if (th === base.theme) {
        // the look built above: its puffy clouds and its backdrop
        set.objs = this.baseObjs.slice();
      } else {
        this.theme = th;
        this.mood = mood;
        this.hazeCol = set.haze.clone();
        this.airCol = C(th.sky[1]).lerp(C(th.fog), 0.35);
        this.shadeCol = C(mood.shade);
        this._amb = this._sun = null;
        const before = this.far.children.slice();
        this.buildClouds();
        this.buildBackdrop();
        set.objs = this.far.children.filter((o) => !before.includes(o));
      }
      return set;
    });
    Object.assign(this, base);
    for (const set of this.sets) for (const o of set.objs) o.visible = set === this.sets[0];
    this.lap = { a: -1, b: -1, w: -1 };
  }

  // Dress the scene for lap a blending into lap b (w 0..1).
  applyLap(a, b, w) {
    const A = this.sets[a], B = this.sets[b];
    const mix = (out, key) => out.copy(A[key]).lerp(B[key], w);
    if (this.night) this.setNight(U.lerp(A.mood.stars ? 1 : 0, B.mood.stars ? 1 : 0, w));
    // (the clay shade is one uniform that applyShade() resets every frame, so it is set every time)
    mix(Clay3D.uniforms.uShade.value, 'shade').multiplyScalar(0.4);
    const L = this.lap;
    if (L.a === a && L.b === b && Math.abs(L.w - w) < 0.002) return;
    L.a = a;
    L.b = b;
    L.w = w;
    const u = this.skyMat.uniforms, lights = this.lights, fog = this.scene.fog;
    mix(u.uTop.value, 'top');
    mix(u.uMid.value, 'mid');
    mix(u.uLow.value, 'low');
    mix(u.uHaze.value, 'haze');
    mix(u.uGlow.value, 'glow');
    mix(u.uUnder.value, 'under');
    mix(this.streakMat.color, 'streak');
    mix(this.sunSprite.material.color, 'sun');
    mix(lights.hemi.color, 'hemiSky');
    mix(lights.hemi.groundColor, 'hemiGround');
    mix(lights.sun.color, 'sunLight');
    mix(lights.fill.color, 'fill');
    lights.hemi.intensity = U.lerp(A.hemiI, B.hemiI, w);
    lights.sun.intensity = U.lerp(A.sunI, B.sunI, w);
    lights.fill.intensity = U.lerp(A.fillI, B.fillI, w);
    mix(fog.color, 'fog');
    fog.near = U.lerp(A.fogNear, B.fogNear, w);
    fog.far = U.lerp(A.fogFar, B.fogFar, w);
    // the distant clouds and backdrop of whichever lap is nearer
    const shown = this.sets[w < 0.5 ? a : b];
    for (const set of this.sets) for (const o of set.objs) o.visible = set === shown;
  }

  // ---------- lights ----------
  buildLights() {
    const th = this.theme, mood = this.mood;
    const hemi = new THREE.HemisphereLight(th.hemiSky, th.hemiGround, 0.8);
    this.scene.add(hemi);
    this.sunDir = new THREE.Vector3(mood.sun[0], mood.sun[1], mood.sun[2]).normalize();
    const sun = new THREE.DirectionalLight(th.sunLight, 1.9);
    sun.position.copy(this.sunDir);
    this.scene.add(sun, sun.target);
    // the shadow box (re-centred per view by shadowFollow, sized by setShadows)
    const sh = sun.shadow;
    sh.mapSize.set(2048, 2048);
    sh.bias = -0.0004;
    sh.normalBias = 0.06;
    Object.assign(sh.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 1, far: 380 });
    sh.camera.updateProjectionMatrix();
    sun.castShadow = !!CFG.shadows;
    this.keep(sun);
    // a soft fill from the opposite side keeps the shade side from going flat
    const fill = new THREE.DirectionalLight(mood.fill, 0.3);
    fill.position.set(-this.sunDir.x, 0.55, -this.sunDir.z).normalize();
    this.scene.add(fill);
    this.lights = { hemi, sun, fill };
    // the shadow box's light-space axes, for snapping it to whole texels
    const z = this.sunDir;
    this._ax = new THREE.Vector3(z.z, 0, -z.x).normalize();
    this._ay = new THREE.Vector3().crossVectors(z, this._ax).normalize();
    this.shadeCol = new THREE.Color(mood.shade);
  }

  // Real-time sun shadows on or off (CFG.shadows), with a smaller map and box for split screen
  // (the map is redrawn for every view). Changing the map size drops the old map; three makes a
  // new one on the next draw.
  setShadows(on, views = 1) {
    const sun = this.lights.sun;
    sun.castShadow = !!on;
    if (!on) return;
    const size = views <= 1 ? 2048 : views === 2 ? 1536 : 1024, half = views <= 1 ? 80 : views === 2 ? 72 : 62;
    const sh = sun.shadow;
    if (sh.mapSize.x !== size) {
      sh.mapSize.set(size, size);
      if (sh.map) {
        sh.map.dispose();
        sh.map = null;
      }
    }
    const c = sh.camera;
    if (c.right !== half) {
      c.left = c.bottom = -half;
      c.right = c.top = half;
      c.updateProjectionMatrix();
    }
  }

  // Centre the sun's shadow box on (x, y, z), snapped to whole shadow-map texels so the shadow
  // edges don't crawl while the kart moves. Called for each view right before it is drawn.
  shadowFollow(x, y, z) {
    const sun = this.lights.sun, c = sun.shadow.camera, d = this.sunDir;
    const texel = (c.right - c.left) / sun.shadow.mapSize.x;
    const ax = this._ax, ay = this._ay;
    const a = x * ax.x + z * ax.z, b = x * ay.x + y * ay.y + z * ay.z;
    const da = Math.round(a / texel) * texel - a, db = Math.round(b / texel) * texel - b;
    x += ax.x * da + ay.x * db;
    y += ay.y * db;
    z += ax.z * da + ay.z * db;
    sun.target.position.set(x, y, z);
    sun.position.set(x + d.x * 170, y + d.y * 170, z + d.z * 170);
    sun.target.updateMatrixWorld();
    sun.updateMatrixWorld();
  }

  // The cool tint clay takes in the shade (see clay3d.js); the showroom sets its own.
  applyShade(strength = 0.4) {
    Clay3D.uniforms.uShade.value.copy(this.shadeCol).multiplyScalar(strength);
  }

  // ---------- dome, sun, high clouds ----------
  buildSky() {
    const th = this.theme, mood = this.mood;
    const C = (hex) => new THREE.Color(hex);
    const mat = this.keep(
      new THREE.ShaderMaterial({
        uniforms: {
          uTop: { value: C(th.sky[0]) },
          uMid: { value: C(th.sky[1]) },
          uLow: { value: C(th.sky[2]) },
          uHaze: { value: this.hazeCol.clone() },
          uGlow: { value: C(mood.glow) },
          uUnder: { value: mood.under ? C(mood.under) : C('#000000') },
          uSunDir: { value: this.sunDir.clone() },
        },
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    const sky = new THREE.Mesh(this.keep(new THREE.SphereGeometry(640, 48, 24)), mat);
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    this.sky = sky;
    this.skyMat = mat;
    this.scene.add(sky);
    // sun (or moon) disc with a soft glow
    const sc = Clay.makeCanvas(128, 128);
    const sg = sc.getContext('2d');
    // (laps with their own themes paint the sun white and tint the sprite per lap instead)
    const sunPaint = this.world.multi ? '#ffffff' : th.sun;
    const grd = sg.createRadialGradient(64, 64, 8, 64, 64, 64);
    grd.addColorStop(0, sunPaint);
    grd.addColorStop(0.3, sunPaint);
    grd.addColorStop(0.36, U.rgba(sunPaint, 0.55));
    grd.addColorStop(1, U.rgba(sunPaint, 0));
    sg.fillStyle = grd;
    sg.fillRect(0, 0, 128, 128);
    const stex = this.keep(new THREE.CanvasTexture(sc));
    stex.colorSpace = THREE.SRGBColorSpace;
    const sun = new THREE.Sprite(this.keep(new THREE.SpriteMaterial({ map: stex, fog: false, depthWrite: false, transparent: true, color: this.world.multi ? th.sun : 0xffffff })));
    sun.scale.set(130, 130, 1);
    sun.renderOrder = -9;
    sun.position.copy(this.sunDir).multiplyScalar(560);
    this.sunSprite = sun;
    sky.add(sun);
    // high streaky clouds, drifting faster than the puffy ones
    const tex = this.keep(this.streakTexture());
    const tint = new THREE.Color(th.cloud || '#ffffff').lerp(C(th.sky[1]), 0.15);
    if (mood.under) tint.set('#ffc2a8');
    const rnd = U.rng(this.def.id.length * 17 + 3);
    const quads = [];
    for (let k = 0; k < 11; k++) {
      const a = (k / 11) * TAU + rnd() * 0.4;
      const el = 0.2 + rnd() * 0.42, r = 540;
      const g = new THREE.PlaneGeometry(220 + rnd() * 160, 46 + rnd() * 30);
      // face the centre, tilted back to lie along the dome
      g.rotateX(el * 0.85);
      g.rotateY(-a - Math.PI / 2);
      g.translate(Math.cos(a) * Math.cos(el) * r, Math.sin(el) * r, Math.sin(a) * Math.cos(el) * r);
      quads.push(g);
    }
    this.streakMat = this.keep(new THREE.MeshBasicMaterial({ map: tex, color: tint, transparent: true, opacity: mood.under ? 0.5 : 0.75, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    const streaks = new THREE.Mesh(this.keep(GK.merge(quads)), this.streakMat);
    streaks.renderOrder = -8;
    streaks.frustumCulled = false;
    sky.add(streaks);
    this.layers.push({ obj: streaks, speed: 0.006 });
    if (mood.rainbow) sky.add(this.rainbow());
  }

  // Soft horizontal wisps on a transparent canvas (white; tinted by the material).
  streakTexture() {
    const c = Clay.makeCanvas(256, 64);
    const g = c.getContext('2d');
    const rnd = U.rng(11);
    for (let k = 0; k < 16; k++) {
      const w = 50 + rnd() * 100, h = 4 + rnd() * 7;
      const x = w / 2 + 4 + rnd() * (248 - w), y = 14 + rnd() * 36;
      g.setTransform(1, 0, (rnd() - 0.5) * 0.4, h / w, x, y);
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, w / 2);
      grd.addColorStop(0, `rgba(255,255,255,${0.35 + rnd() * 0.3})`);
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(0, 0, w / 2, 0, TAU);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // A faint pastel rainbow arching up off the horizon, away from the sun.
  rainbow() {
    const r0 = 230, r1 = 264;
    const g = new THREE.RingGeometry(r0, r1, 72, 6, 0, Math.PI);
    const bands = ['#b48cff', '#58b4ff', '#7ddc6f', '#ffe066', '#ffb347', '#ff6f91'].map((h) => new THREE.Color(h));
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const f = U.clamp((Math.hypot(x, y) - r0) / (r1 - r0), 0, 1);
      const bi = Math.min(bands.length - 2, Math.floor(f * (bands.length - 1)));
      c.copy(bands[bi]).lerp(bands[bi + 1], f * (bands.length - 1) - bi);
      const ang = Math.atan2(y, x);
      const fade = Math.sin(f * Math.PI) * U.clamp(Math.min(ang, Math.PI - ang) / 0.5, 0, 1);
      col.set([c.r * fade, c.g * fade, c.b * fade], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(
      this.keep(g),
      this.keep(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide })),
    );
    const a = Math.atan2(-this.sunDir.z, -this.sunDir.x) + 0.7;
    m.position.set(Math.cos(a) * 560, -70, Math.sin(a) * 560);
    m.lookAt(0, -70, 0);
    m.renderOrder = -8;
    m.frustumCulled = false;
    return m;
  }

  // ---------- puffy clouds ----------
  // Two layers of clay clouds that drift round slowly: big flat banks low down (the cloud sea
  // under a floating course, valley mist on the mountain, smoke over lava) and puffy cumulus
  // higher up.
  buildClouds() {
    const th = this.theme, mood = this.mood;
    if (!this.far) {
      this.far = new THREE.Group(); // follows the camera across the map at world height
      this.scene.add(this.far);
    }
    const cloudCol = mood.cloud || th.cloud || '#ffffff';
    const lowCol = mood.smoke || th.cloudShade || cloudCol;
    const glow = new THREE.Color(th.sky[1]).lerp(new THREE.Color(cloudCol), 0.4);
    const mat = this.keep(Clay3D.material({ vertexColors: true, wobble: 2.5, freq: 0.035, fog: false, rim: 0.25, bump: false, emissive: glow, emissiveIntensity: 0.55 }));
    const lo = this.lo, hi = this.hi, span = hi - lo;
    let midY, lowY;
    if (this.world.valley) {
      // a cloud layer part way down the mountain (you start above it), valley mist far below
      midY = [lo + span * 0.45 + 30, lo + span * 0.45 + 120];
      lowY = [this.floorY + 22, this.floorY + 60];
    } else {
      midY = [hi + 45, hi + 150];
      lowY = this.def.theme === 'lava' ? [6, 34] : [this.floorY - 4, this.floorY + 16];
    }
    const seed = this.def.id.length * 31 + 7;
    const mid = this.cloudRing(24, 380, 560, midY, 30, 80, cloudCol, seed, false);
    const low = this.cloudRing(16, 440, 580, lowY, 70, 150, lowCol, seed + 50, true);
    for (const [geo, speed] of [[mid, 0.0045], [low, 0.0025]]) {
      const m = new THREE.Mesh(this.keep(geo), mat);
      m.frustumCulled = false;
      this.far.add(m);
      this.layers.push({ obj: m, speed });
    }
    if (!this.baseObjs) this.baseObjs = this.far.children.slice(); // (the first look's clouds, then its backdrop)
  }

  // n clusters of lumpy puffs in a ring (radius r0..r1, world height yr[0]..yr[1]).
  cloudRing(n, r0, r1, yr, w0, w1, col, seed, flat) {
    const rnd = U.rng(seed);
    const parts = [];
    GK.detail = 0.8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rnd() * 0.25;
      const r = r0 + rnd() * (r1 - r0);
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r, cy = yr[0] + rnd() * (yr[1] - yr[0]);
      const w = w0 + rnd() * (w1 - w0);
      const puffs = flat ? 6 : 5;
      for (let k = 0; k < puffs; k++) {
        const t = k / (puffs - 1) - 0.5;
        const s = 1 - Math.abs(t) * 0.9;
        const rx = w * (0.3 + rnd() * 0.16) * s, ry = w * (flat ? 0.12 : 0.24 + rnd() * 0.1) * (0.6 + s * 0.4);
        const blob = GK.blob(rx, ry, w * (flat ? 0.4 : 0.3), col, { seed: seed + i * 9 + k, lump: w * 0.06, ws: 9, hs: 6, vary: 0.04 });
        parts.push(GK.at(blob, cx - Math.sin(a) * t * w * 1.15, cy + (flat ? 0 : Math.sin((k / (puffs - 1)) * Math.PI) * w * 0.14), cz + Math.cos(a) * t * w * 1.15));
      }
    }
    GK.detail = 1;
    return GK.merge(parts);
  }

  // ---------- distant backdrops ----------
  buildBackdrop() {
    const parts = [];
    const kind = this.mood.backdrop;
    if (kind === 'range') this.alpineRange(parts);
    else if (kind === 'icepeaks') this.icePeaks(parts);
    else if (kind === 'crags') this.lavaCrags(parts);
    else if (kind === 'elfland') this.elfIslands(parts);
    else this.islands(parts);
    if (!parts.length) return;
    const mat = this.keep(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    const m = new THREE.Mesh(this.keep(GK.merge(parts)), mat);
    m.frustumCulled = false;
    this.far.add(m);
    this.backdrop = m;
    if (this.baseObjs && this.baseObjs.length === 2) this.baseObjs.push(m);
  }

  // Bake light, the clay rim and haze into a backdrop piece's vertex colours. The camera is at
  // the ring's centre, so faces turned sideways to it get the darker clay rim; air tints
  // everything toward the sky's colour (aerial perspective), and the haze thickens toward the
  // bottom (y0) and with distance. glow(x, y, z) -> [amount, THREE.Color] adds unlit light on
  // top (lava, crater fires).
  bake(geo, o = {}) {
    const pos = geo.attributes.position, nor = geo.attributes.normal, col = geo.attributes.color;
    const L = this.sunDir, hz = this.hazeCol;
    if (!this._amb) {
      // cool light in the shade, warm in the sun, like the clay material's
      this._amb = new THREE.Color(this.theme.hemiSky).lerp(this.shadeCol, 0.4);
      this._sun = new THREE.Color(this.theme.sunLight);
    }
    const A = this._amb, S = this._sun, Ac = this.airCol, air = o.air || 0;
    const amb = o.amb !== undefined ? o.amb : 0.6, dif = o.dif !== undefined ? o.dif : 0.55, rimK = o.rim !== undefined ? o.rim : 0.4;
    const y0 = o.y0 !== undefined ? o.y0 : this.floorY, y1 = o.y1 !== undefined ? o.y1 : y0 + 200;
    const hLo = o.hazeLo !== undefined ? o.hazeLo : 0.7, hHi = o.hazeHi !== undefined ? o.hazeHi : 0.25;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
      const lit = Math.max(0, nx * L.x + ny * L.y + nz * L.z) * dif;
      const rl = Math.hypot(x, z) || 1;
      const face = Math.abs((nx * x + nz * z) / rl);
      const rim = (1 - face) * (1 - ny * ny);
      const k = 1 - rimK * rim * rim;
      const t = U.clamp((y - y0) / (y1 - y0), 0, 1);
      const h = U.lerp(hLo, hHi, t * t * (3 - 2 * t)) + (o.hazeFar || 0) * U.clamp((rl - 420) / 220, 0, 1);
      let r = col.getX(i) * (A.r * amb + S.r * lit) * k, g = col.getY(i) * (A.g * amb + S.g * lit) * k, b = col.getZ(i) * (A.b * amb + S.b * lit) * k;
      if (air) {
        r += (Ac.r - r) * air;
        g += (Ac.g - g) * air;
        b += (Ac.b - b) * air;
      }
      r += (hz.r - r) * h;
      g += (hz.g - g) * h;
      b += (hz.b - b) * h;
      if (o.glow) {
        const gl = o.glow(x, y, z);
        if (gl && gl[0] > 0) {
          r += gl[1].r * gl[0];
          g += gl[1].g * gl[0];
          b += gl[1].b * gl[0];
        }
      }
      col.setXYZ(i, Math.min(1, r), Math.min(1, g), Math.min(1, b));
    }
    return geo;
  }

  // A ring of mountains all round the camera: rows of vertices from the base up to a jagged
  // ridge line of overlapping peaks; the base leans toward the camera so the faces catch the sun.
  // o: {r, depth, base, lo, hi, peaks, w: [min, max] half-width in radians, p: [min, max]
  // profile exponent (> 1 = sharp summit, flaring foot), seed, seg, rows,
  // color(y, t, a, h) -> THREE.Color}
  ridgeRing(o) {
    const rnd = U.rng(o.seed);
    const W = o.w || [0.22, 0.45], Pw = o.p || [1.2, 1.9];
    const peaks = [];
    for (let k = 0; k < o.peaks; k++) {
      peaks.push({ a: (k / o.peaks) * TAU + rnd() * 0.5, h: U.lerp(o.lo, o.hi, Math.pow(rnd(), 0.9)), w: U.lerp(W[0], W[1], rnd()), p: U.lerp(Pw[0], Pw[1], rnd()) });
    }
    const ridgeH = (a) => {
      let h = o.lo * 0.4;
      for (const pk of peaks) {
        let d = Math.abs(a - pk.a) % TAU;
        if (d > Math.PI) d = TAU - d;
        if (d < pk.w) h = Math.max(h, pk.h * Math.pow(1 - d / pk.w, pk.p));
      }
      // a craggy ridge line: sharp-crested noise, stronger on the high parts
      const n = 1 - Math.abs(noise3(a * 30, o.seed, 0.5) * 2 - 1);
      return h * (0.92 + n * 0.14) + (noise3(a * 9, o.seed, 2.5) - 0.5) * o.lo * 0.15;
    };
    const N = o.seg || 220, M = o.rows || 9;
    const pos = new Float32Array(N * (M + 1) * 3), col = new Float32Array(N * (M + 1) * 3);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      const H = ridgeH(a);
      for (let j = 0; j <= M; j++) {
        const t = j / M;
        const y = o.base + H * Math.pow(t, 0.9);
        const rr = o.r - o.depth * Math.pow(1 - t, 1.4) + (noise3(a * 13, t * 3.3, o.seed) - 0.5) * o.depth * 0.45 * (1 - t * 0.5);
        const v = (i * (M + 1) + j) * 3;
        pos[v] = Math.cos(a) * rr;
        pos[v + 1] = y;
        pos[v + 2] = Math.sin(a) * rr;
        const c = o.color(y, t, a, H);
        col[v] = c.r;
        col[v + 1] = c.g;
        col[v + 2] = c.b;
      }
    }
    const idx = [];
    for (let i = 0; i < N; i++) {
      const i1 = (i + 1) % N;
      for (let j = 0; j < M; j++) {
        const a = i * (M + 1) + j, b = i1 * (M + 1) + j;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // Alpine: a forested, rocky range with snowy summits close by, a taller, hazier range behind,
  // all rising out of the valley haze. From the summit you look across at the peaks; from the
  // valley they tower over you.
  alpineRange(parts) {
    const th = this.theme, base = this.floorY - 30, top = this.hi - this.floorY;
    const C = (h) => new THREE.Color(h);
    const snow = C('#ffffff'), snowShade = C('#e4ecfa'), rock = C('#535d78'), rock2 = C('#6b7491'), forest = C(th.forest || '#2f6b55'), forest2 = C(th.forest2 || '#3f8a6a'), meadow = C(th.valley || '#5d8f6e');
    const c = new THREE.Color();
    // snow above a ragged snow line (streaks of rock showing through), bare rock, then pine
    // forest down to the valley meadows
    const colorAt = (snowLine, treeLine) => (y, t, a) => {
      const n = noise3(a * 9, y * 0.02, 3.1);
      const sl = snowLine + (n - 0.5) * 80 + (noise3(a * 70, 0.5, 6) - 0.5) * 40;
      if (y > sl) return c.copy(snow).lerp(snowShade, noise3(a * 30, y * 0.05, 1) * 0.7);
      if (y > sl - 14) return c.copy(rock2).lerp(snow, (y - sl + 14) / 14);
      const tl = treeLine + (n - 0.5) * 40;
      if (y < tl) return c.copy(forest).lerp(forest2, noise3(a * 40, y * 0.08, 2)).lerp(meadow, U.clamp((base + 40 - y) / 40, 0, 1));
      return c.copy(rock).lerp(rock2, noise3(a * 22, y * 0.04, 5));
    };
    const near = this.ridgeRing({ r: 470, depth: 100, base, lo: Math.max(110, top * 0.4), hi: Math.max(240, top * 1.0 + 40), peaks: 14, seed: 5, w: [0.28, 0.55], p: [1.1, 1.7], color: colorAt(this.floorY + Math.max(140, top * 0.6), this.floorY + 90) });
    parts.push(this.bake(near, { y0: base + 20, y1: base + 220, hazeLo: 0.72, hazeHi: 0.05, air: 0.1 }));
    const far = this.ridgeRing({ r: 610, depth: 130, base: base - 10, lo: Math.max(180, top * 0.7), hi: Math.max(380, top * 1.35 + 60), peaks: 11, seed: 9, w: [0.32, 0.65], p: [1.1, 1.6], color: colorAt(this.floorY + Math.max(170, top * 0.7), this.floorY + 60) });
    parts.push(this.bake(far, { y0: base + 30, y1: base + 330, hazeLo: 0.85, hazeHi: 0.1, air: 0.3, rim: 0.3 }));
  }

  // Snow: pastel ice spires rising out of the cloud sea, a paler row behind.
  icePeaks(parts) {
    const base = this.floorY - 20, top = this.hi - this.floorY;
    const pal = ['#b9a2ff', '#8fcaff', '#ffb3dc', '#9fe8d8', '#c9b5ff', '#86b8ff'].map((h) => new THREE.Color(h));
    const white = new THREE.Color('#ffffff'), c = new THREE.Color();
    const colorAt = (y, t, a, H) => {
      const f = noise3(a * 2.2, 0.5, 7) * (pal.length - 1);
      const i = Math.min(pal.length - 2, Math.floor(f));
      c.copy(pal[i]).lerp(pal[i + 1], f - i);
      // white caps on the upper part of each spire, with icy streaks below
      const cap = 0.58 + (noise3(a * 18, 1.5, 3) - 0.5) * 0.25;
      if (t > cap) return c.lerp(white, U.clamp((t - cap) / 0.08, 0, 1) * 0.9);
      return c.lerp(white, noise3(a * 50, t * 6, 9) * 0.25);
    };
    const near = this.ridgeRing({ r: 480, depth: 80, base, lo: 60 + top * 0.3, hi: 170 + top * 0.9, peaks: 22, seed: 13, w: [0.06, 0.15], p: [0.9, 1.5], color: colorAt });
    parts.push(this.bake(near, { y0: base + 10, y1: base + 150, hazeLo: 0.6, hazeHi: 0.04, amb: 0.68, dif: 0.45 }));
    const far = this.ridgeRing({ r: 615, depth: 100, base: base - 10, lo: 120 + top * 0.5, hi: 280 + top * 1.2, peaks: 16, seed: 21, w: [0.08, 0.2], p: [1.1, 1.8], color: colorAt });
    parts.push(this.bake(far, { y0: base + 20, y1: base + 280, hazeLo: 0.8, hazeHi: 0.12, air: 0.18, amb: 0.7, dif: 0.4, rim: 0.3 }));
  }

  // Lava: jagged dark crags glowing red where they meet the lava sea, smoking volcanoes with
  // lava running down their flanks.
  lavaCrags(parts) {
    const th = this.theme, mood = this.mood, base = -16;
    const rock = new THREE.Color(th.rock), rock2 = new THREE.Color('#6b5480'), c = new THREE.Color();
    const hot = new THREE.Color(th.lava || '#ff7a2f'), hotter = new THREE.Color(th.lavaHot || '#ffd166');
    const colorAt = (y, t, a) => c.copy(rock).lerp(rock2, t * 0.7 + noise3(a * 30, t * 4, 4) * 0.3);
    const glowBase = (x, y) => [U.clamp(1 - (y - base - 6) / 34, 0, 1) * 0.55, hot];
    const near = this.ridgeRing({ r: 460, depth: 70, base, lo: 40, hi: 150, peaks: 24, seed: 31, w: [0.05, 0.13], p: [0.6, 1.1], color: colorAt });
    parts.push(this.bake(near, { y0: base, y1: base + 140, hazeLo: 0.35, hazeHi: 0.15, amb: 0.5, dif: 0.6, glow: glowBase }));
    const far = this.ridgeRing({ r: 600, depth: 90, base: base - 6, lo: 90, hi: 230, peaks: 16, seed: 37, w: [0.1, 0.24], p: [0.8, 1.3], color: colorAt });
    parts.push(this.bake(far, { y0: base, y1: base + 230, hazeLo: 0.6, hazeHi: 0.35, amb: 0.5, dif: 0.5, glow: glowBase }));
    // volcanoes
    const rnd = U.rng(41);
    const sunA = Math.atan2(this.sunDir.z, this.sunDir.x);
    for (let k = 0; k < 3; k++) {
      const a = sunA + Math.PI * (0.55 + k * 0.45) + rnd() * 0.3;
      const r = 540 + rnd() * 40, h = 190 + rnd() * 90, rb = h * 0.62, rt = h * 0.1;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const g = GK.cyl(rt, rb, h, th.rock, { segs: 30, hsegs: 10, lump: h * 0.03, seed: 50 + k, vary: 0.06 });
      GK.at(g, x, base + h / 2, z);
      const streaks = noise3(k * 7.1, 2, 2);
      parts.push(
        this.bake(g, {
          y0: base,
          y1: base + h,
          hazeLo: 0.45,
          hazeHi: 0.3,
          amb: 0.45,
          dif: 0.55,
          glow: (px, py, pz) => {
            const u = (py - base) / h;
            const ang = Math.atan2(pz - z, px - x);
            // lava streaks running down from the crater, fading toward the foot
            const s = Math.pow(Math.max(0, Math.sin(ang * 4 + streaks * 6 + Math.sin(u * 9) * 0.4)), 18) * U.clamp((u - 0.25) / 0.5, 0, 1);
            const crater = U.clamp((u - 0.9) / 0.1, 0, 1);
            const amt = Math.max(s * 0.9, crater);
            return [amt, crater > s ? hotter : hot];
          },
        }),
      );
      // a column of smoke over the crater
      for (let p = 0; p < 6; p++) {
        const s = 22 + p * 9;
        const blob = GK.blob(s, s * 0.7, s, mood.smoke || '#5e4262', { seed: 60 + k * 9 + p, lump: s * 0.12, ws: 9, hs: 6 });
        parts.push(this.bake(GK.at(blob, x - Math.cos(a) * p * 4 + p * p * 1.2, base + h + 18 + p * 26, z - Math.sin(a) * p * 4), { y0: base, y1: base + h + 200, hazeLo: 0.4, hazeHi: 0.3, amb: 0.75, dif: 0.3, rim: 0.2 }));
      }
    }
  }

  // Meadow: little floating islands with trees all round, hanging over the cloud sea.
  islands(parts) {
    const th = this.theme;
    const rnd = U.rng(this.def.id.length * 13 + 1);
    const y0 = this.floorY;
    const trees = this.mood.trees || ['#4fae55', '#62c060', '#7fcf6a', '#ff9fbf'];
    for (let i = 0; i < 15; i++) {
      const a = (i / 15) * TAU + rnd() * 0.3;
      const r = 400 + rnd() * 170, s = 13 + rnd() * 24;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, y = y0 + 45 + rnd() * 150;
      const seed = 100 + i * 7;
      const pieces = [
        GK.at(GK.blob(s, s * 0.26, s * 0.9, th.grass, { seed, lump: s * 0.05, vary: 0.06 }), x, y, z),
        GK.at(GK.cyl(s * 0.97, s * 0.84, s * 0.3, th.dirt, { seed: seed + 1, lump: s * 0.05, segs: 16 }), x, y - s * 0.16, z),
        GK.at(GK.cone(s * 0.86, s * (1.1 + rnd() * 0.7), th.rock, { seed: seed + 2, lump: s * 0.12, segs: 12 }), x, y - s * (0.85 + rnd() * 0.3), z, Math.PI),
      ];
      const nt = 1 + Math.floor(rnd() * 4);
      for (let k = 0; k < nt; k++) {
        const ta = rnd() * TAU, tr = rnd() * s * 0.6, ts = s * (0.16 + rnd() * 0.12);
        const tx = x + Math.cos(ta) * tr, tz = z + Math.sin(ta) * tr;
        pieces.push(GK.at(GK.cyl(ts * 0.18, ts * 0.24, ts * 1.2, '#8a5a3c', { seed: seed + 10 + k, segs: 6 }), tx, y + s * 0.18 + ts * 0.5, tz));
        pieces.push(GK.at(GK.blob(ts, ts * 0.9, ts, trees[Math.floor(rnd() * trees.length)], { seed: seed + 20 + k, ws: 9, hs: 7 }), tx, y + s * 0.18 + ts * 1.5, tz));
      }
      for (const p of pieces) parts.push(this.bake(p, { y0, y1: y0 + 220, hazeLo: 0.42, hazeHi: 0.18, hazeFar: 0.14 }));
    }
  }

  // Elf realm (Fable Fair's dream lap): floating islands all round, each with a castle, a village of
  // toadstool houses or a glowing tree. Their windows and lanterns are lit (added after the haze is
  // baked in, so they stay bright).
  elfIslands(parts) {
    const th = this.theme;
    const rnd = U.rng(this.def.id.length * 13 + 5);
    const y0 = this.floorY;
    const roofs = ['#6a4fd0', '#3f8fd8', '#c8508a', '#34b8a0', '#e8a83a'];
    const stone = ['#e0d8f8', '#cbbff0', '#ece4ff'];
    const lights = [];
    const win = (x, y, z, w, h, ang) => lights.push(GK.at(GK.box(w, h, w * 0.6, rnd() < 0.7 ? '#ffe6a0' : '#ffc870', { seed: 5, r: w * 0.2 }), x, y, z, 0, -ang, 0));
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU + rnd() * 0.25;
      const r = 380 + rnd() * 190, s = 15 + rnd() * 26;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, y = y0 + 40 + rnd() * 170;
      const seed = 300 + i * 11, top = y + s * 0.18, kind = i % 3;
      const pieces = [
        GK.at(GK.blob(s, s * 0.26, s * 0.9, th.grass, { seed, lump: s * 0.05, vary: 0.06 }), x, y, z),
        GK.at(GK.cyl(s * 0.97, s * 0.84, s * 0.3, th.dirt, { seed: seed + 1, lump: s * 0.05, segs: 16 }), x, y - s * 0.16, z),
        GK.at(GK.cone(s * 0.86, s * (1.1 + rnd() * 0.7), th.rock, { seed: seed + 2, lump: s * 0.12, segs: 12 }), x, y - s * (0.85 + rnd() * 0.3), z, Math.PI),
      ];
      if (kind === 0) {
        // a castle: a tall keep, four towers and a curtain wall
        const st = () => stone[Math.floor(rnd() * stone.length)], roof = () => roofs[Math.floor(rnd() * roofs.length)];
        pieces.push(GK.at(GK.cyl(s * 0.72, s * 0.74, s * 0.3, st(), { seed: seed + 3, segs: 14 }), x, top + s * 0.15, z));
        const kh = s * (1.3 + rnd() * 0.5);
        pieces.push(GK.at(GK.cyl(s * 0.3, s * 0.36, kh, st(), { seed: seed + 4, segs: 9 }), x, top + kh / 2, z));
        pieces.push(GK.at(GK.cone(s * 0.42, s * 0.85, roof(), { seed: seed + 5, segs: 9, lump: 0 }), x, top + kh + s * 0.4, z));
        for (let k = 0; k < 4; k++) {
          const ta = (k / 4) * TAU + rnd() * 0.4, tx = x + Math.cos(ta) * s * 0.58, tz = z + Math.sin(ta) * s * 0.58, th2 = s * (0.7 + rnd() * 0.5);
          pieces.push(GK.at(GK.cyl(s * 0.14, s * 0.17, th2, st(), { seed: seed + 10 + k, segs: 7 }), tx, top + th2 / 2, tz));
          pieces.push(GK.at(GK.cone(s * 0.21, s * 0.5, roof(), { seed: seed + 20 + k, segs: 7, lump: 0 }), tx, top + th2 + s * 0.22, tz));
          win(tx + Math.cos(ta) * s * 0.15, top + th2 * 0.6, tz + Math.sin(ta) * s * 0.15, s * 0.05, s * 0.1, ta);
        }
        for (let k = 0; k < 7; k++) {
          const wa = rnd() * TAU;
          win(x + Math.cos(wa) * s * 0.33, top + kh * (0.25 + rnd() * 0.6), z + Math.sin(wa) * s * 0.33, s * 0.06, s * 0.11, wa);
        }
      } else if (kind === 1) {
        // a village of toadstool houses
        const caps = ['#e0589a', '#7a5ad8', '#3f8fd8', '#ff9b3d', '#3fc8b0'];
        const n = 4 + Math.floor(rnd() * 3);
        for (let k = 0; k < n; k++) {
          const ha = (k / n) * TAU + rnd() * 0.5, hr = s * (0.2 + rnd() * 0.45), hx = x + Math.cos(ha) * hr, hz = z + Math.sin(ha) * hr, hs = s * (0.2 + rnd() * 0.16);
          pieces.push(GK.at(GK.cyl(hs * 0.5, hs * 0.62, hs * 1.1, '#f4ecd8', { seed: seed + 30 + k, segs: 7 }), hx, top + hs * 0.55, hz));
          pieces.push(GK.at(GK.blob(hs * 1.15, hs * 0.7, hs * 1.15, caps[k % caps.length], { seed: seed + 40 + k, ws: 8, hs: 6 }), hx, top + hs * 1.35, hz));
          win(hx + Math.cos(ha + 3.1) * hs * 0.5, top + hs * 0.6, hz + Math.sin(ha + 3.1) * hs * 0.5, hs * 0.22, hs * 0.3, ha + 3.1);
        }
      } else {
        // a great glowing tree with lanterns
        const th2 = s * 1.3;
        pieces.push(GK.at(GK.cyl(s * 0.1, s * 0.2, th2, '#6a4a3a', { seed: seed + 50, segs: 7 }), x, top + th2 / 2, z));
        const leaf = ['#6a5ad8', '#3fb8c8', '#9a6ae0'];
        for (let k = 0; k < 5; k++) {
          const la = (k / 5) * TAU;
          pieces.push(GK.at(GK.blob(s * 0.55, s * 0.4, s * 0.55, leaf[k % 3], { seed: seed + 60 + k, ws: 8, hs: 6 }), x + Math.cos(la) * s * 0.4, top + th2 + s * 0.1 + (k % 2) * s * 0.15, z + Math.sin(la) * s * 0.4));
        }
        pieces.push(GK.at(GK.blob(s * 0.7, s * 0.5, s * 0.7, leaf[0], { seed: seed + 70, ws: 8, hs: 6 }), x, top + th2 + s * 0.45, z));
        for (let k = 0; k < 9; k++) {
          const la = rnd() * TAU, lr = s * (0.3 + rnd() * 0.5);
          lights.push(GK.at(GK.blob(s * 0.05, s * 0.05, s * 0.05, '#ffe6a0', { seed: 8, ws: 5, hs: 4, lump: 0 }), x + Math.cos(la) * lr, top + th2 * (0.75 + rnd() * 0.45), z + Math.sin(la) * lr));
        }
      }
      for (const pc of pieces) parts.push(this.bake(pc, { y0, y1: y0 + 220, hazeLo: 0.42, hazeHi: 0.18, hazeFar: 0.14 }));
    }
    // a scatter of far lights: lanterns drifting between the islands
    for (let k = 0; k < 60; k++) {
      const a = rnd() * TAU, r = 330 + rnd() * 260, y = y0 + 30 + rnd() * 230;
      lights.push(GK.at(GK.blob(1.1, 1.1, 1.1, rnd() < 0.5 ? '#ffe6a0' : '#bfe4ff', { seed: 9, ws: 5, hs: 4, lump: 0 }), Math.cos(a) * r, y, Math.sin(a) * r));
    }
    for (const l of lights) parts.push(l);
  }

  // ---------- the night sky (stars, constellations, shooting stars, planets) ----------
  // Built when any lap's mood has stars. Everything hangs off the sky dome (so it follows the camera
  // like the sun does) and fades in and out with setNight(0..1) as the laps change.
  buildNight() {
    const world = this.world;
    const keys = world.multi ? world.themeKeys : [this.def.theme];
    if (!keys.some((k) => (SKY_MOODS[k] || {}).stars)) return;
    const C = (h) => new THREE.Color(h);
    const rnd = U.rng(97);
    const group = new THREE.Group();
    const dirOf = (az, el) => new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    // ---- the stars
    const pal = ['#ffffff', '#e4ecff', '#c4d6ff', '#fff3d2', '#ffdcec', '#d2fff4'].map(C);
    const N = 1500, NM = 320, NB = 64;
    const total = N + NM + NB;
    const pos = new Float32Array(total * 3), col = new Float32Array(total * 3), size = new Float32Array(total), phase = new Float32Array(total);
    const R = 598;
    const put = (i, d, sz, c) => {
      pos.set([d.x * R, d.y * R, d.z * R], i * 3);
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = sz;
      phase[i] = rnd();
    };
    const tmp = new THREE.Vector3();
    for (let i = 0; i < total; i++) {
      const y = -0.04 + 1.04 * rnd(), a = rnd() * TAU, r = Math.sqrt(Math.max(0, 1 - y * y));
      tmp.set(r * Math.cos(a), y, r * Math.sin(a));
      const big = i >= N + NM, mid = i >= N;
      put(i, tmp, big ? 5.2 + rnd() * 3.2 : mid ? 2.6 + rnd() * 1.8 : 1.6 + rnd() * 1.1, big ? C(rnd() < 0.5 ? '#fff0c0' : '#cfe0ff') : pal[Math.floor(rnd() * pal.length)]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    const mat = this.keep(
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uPx: { value: Math.min(2, window.devicePixelRatio || 1) } },
        vertexShader: STAR_VERT,
        fragmentShader: STAR_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    const stars = new THREE.Points(this.keep(geo), mat);
    stars.frustumCulled = false;
    stars.renderOrder = -7;
    group.add(stars);
    // ---- constellations: a few bright stars joined by faint lines (offsets in degrees around a centre)
    const shapes = [
      { az: 212, el: 36, pts: [[-9, -2], [-9, 3], [-4.5, 0.5], [0, 4.5], [4.5, 0.5], [9, 3], [9, -2]], links: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0]] }, // a crown
      { az: 158, el: 44, pts: [[0, 8], [0, 3], [0, -2], [0, -8], [-6, 3], [6, 3]], links: [[0, 1], [1, 2], [2, 3], [4, 1], [1, 5]] }, // a swan
      { az: 262, el: 30, pts: [[-12, 2], [-8, 3], [-4, 1], [0, 0], [1, -4], [6, -5], [8, -1]], links: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]] }, // a dipper
      { az: 322, el: 52, pts: [[0, 0], [3.5, 0], [1.7, 4.5], [0, -7], [3.5, -7]], links: [[0, 1], [1, 2], [2, 0], [0, 3], [3, 4], [4, 1]] }, // a lyre
      { az: 108, el: 40, pts: [[-7, 0], [-3, 3], [2, 2], [6, -1], [3, -5], [-2, -4]], links: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]] }, // a ring
    ];
    const lp = [], cpos = [], ccol = [], csize = [], cph = [];
    for (const sh of shapes) {
      const az = (sh.az * Math.PI) / 180, el = (sh.el * Math.PI) / 180;
      const dirs = sh.pts.map(([dx, dy]) => dirOf(az + ((dx * Math.PI) / 180) / Math.cos(el), el + (dy * Math.PI) / 180));
      dirs.forEach((d) => {
        cpos.push(d.x * R * 0.998, d.y * R * 0.998, d.z * R * 0.998);
        ccol.push(1, 0.96, 0.82);
        csize.push(5.4 + rnd() * 1.6);
        cph.push(rnd());
      });
      for (const [i, j] of sh.links) lp.push(dirs[i].x * R * 0.997, dirs[i].y * R * 0.997, dirs[i].z * R * 0.997, dirs[j].x * R * 0.997, dirs[j].y * R * 0.997, dirs[j].z * R * 0.997);
    }
    const cgeo = new THREE.BufferGeometry();
    cgeo.setAttribute('position', new THREE.Float32BufferAttribute(cpos, 3));
    cgeo.setAttribute('aCol', new THREE.Float32BufferAttribute(ccol, 3));
    cgeo.setAttribute('aSize', new THREE.Float32BufferAttribute(csize, 1));
    cgeo.setAttribute('aPhase', new THREE.Float32BufferAttribute(cph, 1));
    const cstars = new THREE.Points(this.keep(cgeo), mat);
    cstars.frustumCulled = false;
    cstars.renderOrder = -7;
    group.add(cstars);
    const lgeo = new THREE.BufferGeometry();
    lgeo.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    const lineMat = this.keep(new THREE.LineBasicMaterial({ color: 0x9fb4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    const lines = new THREE.LineSegments(this.keep(lgeo), lineMat);
    lines.frustumCulled = false;
    lines.renderOrder = -7;
    group.add(lines);
    // ---- planets: banded, ringed, cratered (unlit)
    const planets = new THREE.Group();
    const planet = (az, el, rad, base, bands, ring) => {
      const g = new THREE.SphereGeometry(1, 40, 24);
      const p = g.attributes.position, cs = new Float32Array(p.count * 3), L = new THREE.Vector3(-0.55, 0.5, 0.67).normalize();
      const c0 = C(base), c1 = C(bands[0]), c2 = C(bands[1]), c = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const n = noise3(x * 1.4 + 3, y * 5.5, z * 1.4 + 1);
        c.copy(c0).lerp(c1, U.clamp(Math.sin(y * 11 + n * 5) * 0.5 + 0.5, 0, 1)).lerp(c2, U.clamp((n - 0.5) * 2.2, 0, 1) * 0.6);
        const lit = U.clamp(0.28 + 0.9 * Math.max(0, x * L.x + y * L.y + z * L.z), 0, 1.15);
        const rim = Math.pow(1 - Math.abs(z), 3) * 0.25;
        cs[i * 3] = Math.min(1, c.r * lit + rim * 0.5);
        cs[i * 3 + 1] = Math.min(1, c.g * lit + rim * 0.55);
        cs[i * 3 + 2] = Math.min(1, c.b * lit + rim * 0.9);
      }
      g.setAttribute('color', new THREE.BufferAttribute(cs, 3));
      const ball = new THREE.Mesh(this.keep(g), this.keep(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));
      ball.scale.setScalar(rad);
      const d = dirOf((az * Math.PI) / 180, (el * Math.PI) / 180).multiplyScalar(R * 0.96);
      const holder = new THREE.Group();
      holder.position.copy(d);
      holder.add(ball);
      if (ring) {
        const rg = new THREE.RingGeometry(1.35, 2.25, 72, 4);
        const rp = rg.attributes.position, rc = new Float32Array(rp.count * 4);
        for (let i = 0; i < rp.count; i++) {
          const f = (Math.hypot(rp.getX(i), rp.getY(i)) - 1.35) / 0.9;
          const gap = f > 0.5 && f < 0.58 ? 0.1 : 1; // a dark gap between two bands
          const al = Math.sin(f * Math.PI) * 0.78 * gap * (0.6 + 0.4 * noise3(f * 14, 2, 5));
          const rcl = c.copy(C(ring)).lerp(C('#ffffff'), 0.25 * (1 - f));
          rc.set([rcl.r, rcl.g, rcl.b, al], i * 4);
        }
        rg.setAttribute('color', new THREE.BufferAttribute(rc, 4));
        const rm = new THREE.Mesh(this.keep(rg), this.keep(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false })));
        rm.scale.setScalar(rad);
        rm.rotation.set(Math.PI / 2 - 0.5, 0.15, 0.35);
        holder.add(rm);
      }
      holder.lookAt(0, 0, 0);
      planets.add(holder);
      return holder;
    };
    planet(214, 21, 54, '#9b7ae8', ['#6a4ad0', '#c8a8ff'], '#ffd7a0');
    planet(150, 34, 22, '#4fc8c0', ['#2a8fa8', '#bff4ea'], null);
    planet(264, 44, 12, '#ffd9a0', ['#e8b070', '#fff0cc'], null);
    planets.renderOrder = -7;
    group.add(planets);
    // ---- shooting stars
    const sc = Clay.makeCanvas(128, 16), sg = sc.getContext('2d');
    const gr = sg.createLinearGradient(0, 0, 128, 0);
    gr.addColorStop(0, 'rgba(180,200,255,0)');
    gr.addColorStop(0.7, 'rgba(235,240,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,1)');
    sg.fillStyle = gr;
    sg.beginPath();
    sg.moveTo(0, 8);
    sg.lineTo(120, 1);
    sg.arc(120, 8, 7, -Math.PI / 2, Math.PI / 2);
    sg.lineTo(0, 8);
    sg.fill();
    const stex = this.keep(new THREE.CanvasTexture(sc));
    stex.colorSpace = THREE.SRGBColorSpace;
    const shooters = [];
    for (let k = 0; k < 6; k++) {
      const mesh = new THREE.Mesh(this.keep(new THREE.PlaneGeometry(1, 1)), this.keep(new THREE.MeshBasicMaterial({ map: stex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, opacity: 0 })));
      mesh.frustumCulled = false;
      mesh.renderOrder = -6;
      mesh.visible = false;
      group.add(mesh);
      shooters.push({ id: k, mesh, period: 6.5 + k * 1.7, offset: k * 2.3, dur: 0.9 + (k % 3) * 0.15, k: -1 });
    }
    group.visible = false;
    this.sky.add(group);
    this.night = { group, mat, lineMat, planets, shooters, amt: 0 };
    this.setNight(world.multi ? 0 : 1);
  }

  // Fade the night sky in (1) or out (0).
  setNight(amt) {
    const n = this.night;
    if (!n || Math.abs(n.amt - amt) < 1e-4) return;
    n.amt = amt;
    n.group.visible = amt > 0.01;
    n.mat.uniforms.uAmt.value = amt;
    n.lineMat.opacity = 0.32 * amt;
    n.planets.visible = amt > 0.5;
  }

  // One shooting star: a bright head with a long tail crossing the dome now and then (a new path each time).
  shoot(sh, time, amt) {
    const c = (time + sh.offset) / sh.period, k = Math.floor(c), u = c - k, dur = sh.dur / sh.period;
    if (u > dur) {
      sh.mesh.visible = false;
      return;
    }
    if (sh.k !== k) {
      sh.k = k;
      const r = U.rng(k * 131 + sh.id * 17 + 5);
      sh.az = r() * TAU;
      sh.el = 0.3 + r() * 0.55;
      sh.dir = (r() < 0.5 ? -1 : 1) * (0.45 + r() * 0.5);
      sh.len = 70 + r() * 70;
      sh.drop = 0.25 + r() * 0.35;
    }
    const v = u / dur, R = 585;
    const at = (q, out) => {
      const az = sh.az + sh.dir * (q - 0.5) * 0.55, el = sh.el - sh.drop * (q - 0.5);
      return out.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).multiplyScalar(R);
    };
    const P = at(v, this._sa || (this._sa = new THREE.Vector3())), Q = at(Math.min(1, v + 0.03), this._sb || (this._sb = new THREE.Vector3()));
    const z = this._sz || (this._sz = new THREE.Vector3()), x = this._sx || (this._sx = new THREE.Vector3()), y = this._sy || (this._sy = new THREE.Vector3());
    z.copy(P).normalize().negate(); // the plane faces the centre
    x.copy(Q).sub(P).normalize();
    x.addScaledVector(z, -x.dot(z)).normalize();
    y.crossVectors(z, x);
    const m = this._sm || (this._sm = new THREE.Matrix4());
    m.makeBasis(x, y, z);
    sh.mesh.quaternion.setFromRotationMatrix(m);
    sh.mesh.position.copy(P).addScaledVector(x, -sh.len / 2);
    sh.mesh.scale.set(sh.len, 5.5, 1);
    sh.mesh.material.opacity = Math.sin(Math.PI * v) ** 0.5 * amt;
    sh.mesh.visible = true;
  }

  // ---------- per frame ----------
  // Keep the sky centred on whichever camera is drawing (clouds and backdrops keep their height).
  follow(camera) {
    const p = camera.position;
    this.sky.position.copy(p);
    this.far.position.set(p.x, 0, p.z);
  }

  // Drift the cloud layers; twinkle the stars and let shooting stars cross the sky.
  update(time) {
    for (const l of this.layers) l.obj.rotation.y = time * l.speed;
    const n = this.night;
    if (n && n.amt > 0.01) {
      n.mat.uniforms.uTime.value = time;
      for (const sh of n.shooters) this.shoot(sh, time, n.amt);
    }
  }
}
