'use strict';
// Everything that moves in the 3D race besides the scenery: karts (with their gliders, hover
// wheels and wind ribbons), the cargo plane of a plane-drop start, clay particles (drift
// sparks, boost flames, dust, snow spray, splashes, confetti), item boxes and coins
// (instanced), floating keys, boost rings, shells / bananas / clay bombs, the hazards, rescue
// clouds, the player markers and the weather that drifts around every camera.
//
// Hazards are drawn from their live state (see makeHazard in items.js): each kind in HAZARD_FX
// builds its clay model once and poses it every frame. A hazard sits in the road's own frame
// (x along the road, y the road's normal, z to its right), so it stands flush on banked and
// anti-gravity road. Unknown kinds are skipped.

class ParticlePool {
  // opts.spin: each particle tumbles about its own random axis (confetti)
  constructor(scene, max, mat, geo, opts = {}) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(geo || new THREE.IcosahedronGeometry(1, 1), mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    const F = (n) => new Float32Array(max * n);
    this.p = F(3);
    this.v = F(3);
    this.life = F(1);
    this.maxLife = F(1);
    this.size = F(1);
    this.grav = F(1);
    this.drag = F(1);
    this.grow = F(1);
    this.col = F(3);
    this.spin = !!opts.spin;
    if (this.spin) {
      this.ax = F(3);
      this.ang = F(1);
      this.angV = F(1);
    }
    this.n = 0;
    this._m = new THREE.Matrix4();
    this._c = new THREE.Color();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._a = new THREE.Vector3();
  }
  spawn(x, y, z, vx, vy, vz, size, color, life, grav = 0, drag = 1, grow = 0) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.p.set([x, y, z], i * 3);
    this.v.set([vx, vy, vz], i * 3);
    this.life[i] = this.maxLife[i] = life;
    this.size[i] = size;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.grow[i] = grow;
    const c = this._c.set(color);
    this.col.set([c.r, c.g, c.b], i * 3);
    if (this.spin) {
      const a = Math.random() * TAU, u = Math.random() * 2 - 1, r = Math.sqrt(1 - u * u);
      this.ax.set([Math.cos(a) * r, u, Math.sin(a) * r], i * 3);
      this.ang[i] = Math.random() * TAU;
      this.angV[i] = (Math.random() - 0.5) * 18;
    }
  }
  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap with the last live particle
        const j = --this.n;
        if (i !== j) {
          for (const arr of [this.p, this.v, this.col]) arr.copyWithin(i * 3, j * 3, j * 3 + 3);
          for (const arr of [this.life, this.maxLife, this.size, this.grav, this.drag, this.grow]) arr[i] = arr[j];
          if (this.spin) {
            this.ax.copyWithin(i * 3, j * 3, j * 3 + 3);
            this.ang[i] = this.ang[j];
            this.angV[i] = this.angV[j];
          }
        }
        continue;
      }
      const k = Math.exp(-this.drag[i] * dt);
      this.v[i * 3] *= k;
      this.v[i * 3 + 1] = this.v[i * 3 + 1] * k - this.grav[i] * dt;
      this.v[i * 3 + 2] *= k;
      this.p[i * 3] += this.v[i * 3] * dt;
      this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt;
      this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      if (this.spin) this.ang[i] += this.angV[i] * dt;
      i++;
    }
    const m = this._m, s = this._s;
    for (let j = 0; j < this.n; j++) {
      const t = this.life[j] / this.maxLife[j];
      const sz = this.size[j] * (this.grow[j] ? 1 + (1 - t) * this.grow[j] : Math.sqrt(t));
      s.set(sz, sz, sz);
      this._v.set(this.p[j * 3], this.p[j * 3 + 1], this.p[j * 3 + 2]);
      if (this.spin) this._q.setFromAxisAngle(this._a.set(this.ax[j * 3], this.ax[j * 3 + 1], this.ax[j * 3 + 2]), this.ang[j]);
      m.compose(this._v, this._q, s);
      this.mesh.setMatrixAt(j, m);
      this._c.setRGB(this.col[j * 3], this.col[j * 3 + 1], this.col[j * 3 + 2]);
      this.mesh.setColorAt(j, this._c);
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  clear() {
    this.n = 0;
    this.mesh.count = 0;
  }
}

const SPARK_COLS = ['#ffffff', '#58b4ff', '#ff9a3c', '#c77dff'];
const FX_RAINBOW = ['#ff6f91', '#ffb347', '#ffe066', '#7ddc6f', '#58b4ff', '#b48cff'];
const TRAIL_N = 28; // points per glider wind ribbon
const TRAIL_LIFE = 0.45; // seconds of flight a ribbon trails behind a wingtip

class RaceFX {
  constructor(world, race) {
    this.world = world;
    this.race = race;
    const scene = (this.scene = world.scene);
    this.clay = new ParticlePool(scene, 1200, Clay3D.material({ vertexColors: false, wobble: 0, rim: 0.6, bump: false }));
    this.glow = new ParticlePool(scene, 900, new THREE.MeshBasicMaterial({ fog: true }), new THREE.IcosahedronGeometry(1, 0));
    this.paper = new ParticlePool(scene, 480, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: true }), CONFETTI_GEO(), { spin: true });
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this.up = new THREE.Vector3(0, 1, 0);
    this.mats = this.materials();
    // cargo-plane start: karts ride in the plane, then drop out on their gliders
    this.planeDrop = !!(race.track.def.planeDrop && race.introOffset);
    this.models = race.karts.map((k) => this.kartModel(k));
    this.buildBoxes();
    this.buildCoins();
    this.buildKeys();
    this.buildHazards();
    this.buildRings();
    this.plane = this.planeDrop ? this.buildPlane() : null;
    this.objMeshes = new Map();
    this.ambient = this.buildAmbient();
    this.confettiT = 0;
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
    });
    for (const m of this.models) if (m.marker) m.marker.material.map.dispose();
  }

  // Materials shared by the hazards and rings of this race.
  materials() {
    const basic = (color) => new THREE.MeshBasicMaterial({ color, fog: true });
    return {
      clay: this.world.clayMat,
      ice: Clay3D.material({ vertexColors: true, transparent: true, opacity: 0.86, rough: 0.2, metal: 0.05, emissive: '#3f8fd0', emissiveIntensity: 0.4, wobble: 0.015, freq: 2, bump: false }),
      glowClay: new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }),
      fire: basic(0xff8a3d),
      hot: basic(0xffe066),
      lava: basic(0xff7a2f),
    };
  }

  // An additive glow sprite (fades with CFG.glow).
  glowSprite(color, size) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    s.scale.set(size, size, 1);
    s.renderOrder = 2;
    return s;
  }

  // ---------- karts ----------
  kartModel(k) {
    const m = KartModels.racing(KartModels.build(k.config));
    // a staff ghost is see-through and casts nothing; everyone else casts real shadows
    if (k.ghost) KartModels.ghostify(m);
    else KartModels.castShadows(m);
    this.scene.add(m.group);
    if (m.shadow) this.scene.add(m.shadow);
    // floating key when carrying one
    m.keyMesh = new THREE.Mesh(KEY_GEO(), this.keyMat || (this.keyMat = Clay3D.material({ vertexColors: true, wobble: 0.02, metal: 0.4, rough: 0.35, emissive: 0x6b4a00, emissiveIntensity: 0.4 })));
    m.keyMesh.scale.setScalar(0.6);
    m.keyMesh.visible = false;
    this.scene.add(m.keyMesh);
    // rescue cloud
    m.cloud = new THREE.Mesh(RESCUE_GEO(), this.world.clayMat);
    m.cloud.visible = false;
    this.scene.add(m.cloud);
    // name marker over human karts (hidden from their own camera via layers)
    if (k.slot >= 0) {
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTexture(k.slot, k.name), depthTest: false, transparent: true }));
      spr.scale.set(2.6, 1.3, 1);
      spr.layers.set(1 + k.slot);
      spr.renderOrder = 5;
      this.scene.add(spr);
      m.marker = spr;
    }
    return m;
  }

  // Still in the cargo plane? Karts wait in its hold, and after the drop each one appears as
  // the open ramp passes over it.
  aboard(k, io) {
    if (!io || !io.plane || !(io.y > 0)) return false;
    if (io.y >= 40) return true;
    if (io.y < 26) return false;
    const p = io.plane;
    return (k.x - p.x) * Math.cos(p.head) + (k.z - p.z) * Math.sin(p.head) > -17;
  }

  // ---------- glider wind ribbons ----------
  makeTrail() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 6), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 8), 4).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < TRAIL_N - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    if (!this.trailMat) this.trailMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true });
    const mesh = new THREE.Mesh(geo, this.trailMat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    this.scene.add(mesh);
    return { mesh, pts: [], free: [] };
  }
  // A ribbon off each wingtip through the last TRAIL_LIFE seconds of its path, tapering and
  // fading toward the tail. It is tilted up toward the middle so the chase camera sees it.
  updateTrails(m, k, time, on) {
    if (!m.trails) {
      if (!on) return;
      m.trails = [this.makeTrail(), this.makeTrail()];
    }
    let ux = 0, uy = 1, uz = 0, sx = 0, sy = 0, sz = 1;
    if (on) {
      m.glider.updateWorldMatrix(true, false);
      const e = m.glider.matrixWorld.elements;
      const ul = Math.hypot(e[4], e[5], e[6]) || 1, sl = Math.hypot(e[8], e[9], e[10]) || 1;
      ux = e[4] / ul; uy = e[5] / ul; uz = e[6] / ul;
      sx = e[8] / sl; sy = e[9] / sl; sz = e[10] / sl;
    }
    m.trails.forEach((tr, s) => {
      const pts = tr.pts;
      const last = pts[pts.length - 1];
      if (on && (!last || time > last.t + 0.004)) {
        const v = this._v.copy(m.tips[s]).applyMatrix4(m.glider.matrixWorld);
        const side = s ? 1 : -1;
        let wx = ux + sx * side, wy = uy + sy * side, wz = uz + sz * side;
        const wl = Math.hypot(wx, wy, wz) || 1;
        const p = tr.free.pop() || {};
        p.x = v.x; p.y = v.y; p.z = v.z;
        p.wx = wx / wl; p.wy = wy / wl; p.wz = wz / wl;
        p.t = time;
        pts.push(p);
      }
      while (pts.length && (time - pts[0].t > TRAIL_LIFE || pts.length > TRAIL_N)) tr.free.push(pts.shift());
      const n = pts.length;
      tr.mesh.visible = n > 1;
      if (n < 2) return;
      const pos = tr.mesh.geometry.attributes.position, col = tr.mesh.geometry.attributes.color;
      for (let j = 0; j < n; j++) {
        const p = pts[n - 1 - j]; // newest first, at the wingtip
        const a = U.clamp(1 - (time - p.t) / TRAIL_LIFE, 0, 1);
        const w = 0.11 * (0.25 + 0.75 * a);
        pos.setXYZ(j * 2, p.x + p.wx * w, p.y + p.wy * w, p.z + p.wz * w);
        pos.setXYZ(j * 2 + 1, p.x - p.wx * w, p.y - p.wy * w, p.z - p.wz * w);
        const al = a * a * 0.8 * Math.min(1, j / 2);
        col.setXYZW(j * 2, 1, 1, 1, al);
        col.setXYZW(j * 2 + 1, 1, 1, 1, al);
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
      tr.mesh.geometry.setDrawRange(0, (n - 1) * 6);
    });
  }

  // ---------- the cargo plane (plane-drop courses) ----------
  buildPlane() {
    const group = new THREE.Group();
    const mat = Clay3D.material({ vertexColors: true, wobble: 0.04, freq: 0.6 });
    const hull = new THREE.Mesh(PLANE_GEO(), mat);
    hull.castShadow = hull.receiveShadow = true;
    group.add(hull);
    const props = [];
    const discMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, fog: true });
    for (const z of PLANE_ENGINES) {
      const pr = new THREE.Mesh(PROP_GEO(), mat);
      pr.position.set(7.2, 2.4, z);
      pr.userData.phase = z;
      pr.castShadow = true;
      group.add(pr);
      props.push(pr);
      const disc = new THREE.Mesh(PROP_DISC_GEO(), discMat);
      disc.position.copy(pr.position);
      group.add(disc);
    }
    group.visible = false;
    this.scene.add(group);
    return { group, props };
  }
  updatePlane(time, dt) {
    const P = this.plane;
    const io = this.race.introOffset(this.race.karts[0]);
    const p = io && io.plane;
    P.group.visible = !!p;
    if (!p) return;
    // flies along the start straight, belly just over the karts waiting in its hold
    P.group.position.set(p.x, p.y + 1.6 + Math.sin(time * 1.3) * 0.25, p.z);
    P.group.rotation.set(Math.sin(time * 0.8) * 0.05, -p.head, Math.sin(time * 0.6) * 0.02, 'YXZ');
    for (const pr of P.props) pr.rotation.x = time * 26 + pr.userData.phase;
    // vapour puffs from the engines hang in the air behind it
    if (dt > 0 && Math.random() < 0.7 * CFG.particles) {
      P.group.updateMatrixWorld(true);
      for (const z of PLANE_ENGINES) {
        const v = this._v.set(1.4, 2.4, z).applyMatrix4(P.group.matrixWorld);
        this.clay.spawn(v.x, v.y, v.z, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.6, 0.55 + Math.random() * 0.4, Math.random() < 0.5 ? '#ffffff' : '#eef0fa', 1.6, -0.2, 0.6, 2.2);
      }
    }
  }

  // ---------- item boxes ----------
  buildBoxes() {
    const boxes = this.race.items.boxes;
    if (!boxes.length) return;
    const geo = GK.box(1.5, 1.5, 1.5, '#ffffff', { r: 0.32, seg: 3, lump: 0.03 });
    const mat = Clay3D.material({ map: questionTexture(), transparent: true, opacity: 0.88, rough: 0.3, emissive: 0x332244, wobble: 0.04, freq: 1.5, bump: false, rim: 0.5 });
    const mesh = new THREE.InstancedMesh(geo, mat, boxes.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, new THREE.Color());
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.boxMesh = mesh;
    this.boxScale = boxes.map(() => 1);
  }
  updateBoxes(dt, time) {
    if (!this.boxMesh) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    this.race.items.boxes.forEach((b, i) => {
      const target = b.active ? 1 : 0;
      this.boxScale[i] = U.approach(this.boxScale[i], target, dt * (b.active ? 2.5 : 8));
      const sc = this.boxScale[i] < 0.02 ? 0.0001 : U.easeOutBack(Math.min(1, this.boxScale[i]));
      e.set(b.spin * 0.7, b.spin, b.spin * 0.4);
      q.setFromEuler(e);
      p.set(b.x, b.y + 1.25 + Math.sin(time * 2 + i) * 0.15, b.z);
      s.set(sc, sc, sc);
      m.compose(p, q, s);
      this.boxMesh.setMatrixAt(i, m);
      c.setHSL((time * 0.2 + i * 0.13) % 1, 0.8, 0.72);
      this.boxMesh.setColorAt(i, c);
    });
    this.boxMesh.instanceMatrix.needsUpdate = true;
    this.boxMesh.instanceColor.needsUpdate = true;
  }

  // ---------- coins ----------
  buildCoins() {
    const coins = this.race.items.coins;
    if (!coins.length) return;
    const geo = GK.merge([
      GK.at(GK.cyl(0.55, 0.55, 0.16, '#ffcf40', { segs: 18, lump: 0.01 }), 0, 0, 0, Math.PI / 2),
      GK.at(GK.box(0.12, 0.5, 0.2, '#ffe680', { lump: 0, r: 0.05 }), 0, 0, 0),
    ]);
    const mat = Clay3D.material({ vertexColors: true, metal: 0.35, rough: 0.35, emissive: 0x5a3c00, emissiveIntensity: 0.6, wobble: 0.02 });
    this.coinMesh = new THREE.InstancedMesh(geo, mat, coins.length);
    this.coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.coinMesh.frustumCulled = false;
    this.scene.add(this.coinMesh);
  }
  updateCoins(time) {
    if (!this.coinMesh) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    this.race.items.coins.forEach((c, i) => {
      q.setFromAxisAngle(up, time * 3 + i * 0.5);
      p.set(c.x, c.y + 0.8 + Math.sin(time * 3 + i) * 0.08, c.z);
      const sc = c.active ? 1 : 0.0001;
      s.set(sc, sc, sc);
      m.compose(p, q, s);
      this.coinMesh.setMatrixAt(i, m);
    });
    this.coinMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- keys ----------
  buildKeys() {
    this.keyMeshes = this.race.items.keys.map(() => {
      const m = new THREE.Mesh(KEY_GEO(), this.keyMat || (this.keyMat = Clay3D.material({ vertexColors: true, wobble: 0.02, metal: 0.4, rough: 0.35, emissive: 0x6b4a00, emissiveIntensity: 0.4 })));
      this.scene.add(m);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffe066, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.scale.set(4, 4, 1);
      m.add(halo);
      return m;
    });
  }

  // ---------- hazards ----------
  // One clay model per hazard (kinds without a model are skipped). Safe to call again after
  // hazards are added to the race (the old meshes are removed first).
  buildHazards() {
    if (this.hazardMeshes) for (const hm of this.hazardMeshes) this.scene.remove(hm.mesh);
    this.hazardMeshes = [];
    for (const h of this.race.items.hazards) {
      const def = HAZARD_FX[h.kind];
      if (!def) continue;
      const mesh = new THREE.Group();
      const hm = { mesh, h, def, body: null, alive: h.alive !== false, pop: 1, roadHead: h.head || 0, near: true };
      this.placeHazard(hm);
      hm.body = def.build(this, h, hm);
      if (hm.body) mesh.add(hm.body);
      // clay parts cast and catch the sun's shadows; glowing and see-through parts don't
      mesh.traverse((o) => {
        if (o.isMesh && o.material && o.material.isMeshStandardMaterial && !o.material.transparent) o.castShadow = o.receiveShadow = true;
      });
      this.scene.add(mesh);
      this.hazardMeshes.push(hm);
    }
  }
  // Put a hazard's group where the hazard is, in the road's frame there (yaw only for kinds
  // that hang or fly; free-flying kinds place their parts themselves).
  placeHazard(hm) {
    const h = hm.h, def = hm.def;
    if (def.place === false) return;
    const loc = this.race.track.locate(h.x, h.z, h.y, h.path || null, this._hl || (this._hl = {}));
    const ok = loc && loc.excess < 2;
    hm.roadHead = ok ? Math.atan2(loc.tz, loc.tx) : h.head || 0;
    hm.mesh.position.set(h.x, def.snap && ok ? loc.y : h.y, h.z);
    if (def.tilt === false || !ok) hm.mesh.quaternion.setFromAxisAngle(this.up, -hm.roadHead);
    else roadFrameQuat(loc, loc.slope || 0, hm.roadHead, hm.mesh.quaternion);
    if (ok && !hm.frameQ) hm.frameQ = roadFrameQuat(loc, loc.slope || 0, hm.roadHead, new THREE.Quaternion());
  }
  updateHazards(time, dt) {
    const karts = this.race.karts;
    for (const hm of this.hazardMeshes) {
      const h = hm.h, def = hm.def;
      // particles only for hazards somebody is near
      let best = Infinity;
      for (const k of karts) best = Math.min(best, (k.x - h.x) ** 2 + (k.z - h.z) ** 2);
      hm.near = best < 160 * 160;
      const alive = h.alive !== false;
      if (alive && !hm.alive) hm.pop = 0; // back after a knock-out: it pops up again
      hm.alive = alive;
      if (def.moves) this.placeHazard(hm);
      hm.mesh.visible = alive || !!def.keep;
      if (def.update) def.update(this, hm, h, time, dt);
      if (!def.keep) {
        hm.pop = Math.min(1, hm.pop + dt * 2.8);
        hm.mesh.scale.setScalar(hm.pop < 1 ? Math.max(0.01, U.easeOutBack(hm.pop)) : 1);
      }
    }
  }
  // Height of a roof over (x, z) more than minUp above y (a cave's ceiling), or null.
  roofAbove(x, y, z, minUp) {
    if (!this.roofs) {
      this.roofs = [];
      for (const o of this.world.scene.children) if (o.isMesh && !o.isInstancedMesh && (o.name === 'tunnel' || o.name === 'scenery')) this.roofs.push(o);
    }
    if (!this.roofs.length) return null;
    const rc = this.ray || (this.ray = new THREE.Raycaster());
    rc.set(this._w.set(x, y + minUp, z), this.up);
    rc.near = 0;
    rc.far = 45;
    const hit = rc.intersectObjects(this.roofs, false)[0];
    return hit ? hit.point.y : null;
  }

  // ---------- boost rings ----------
  buildRings() {
    const rings = (this.race.items && this.race.items.rings) || [];
    this.shocks = [];
    this.ringMeshes = rings.map((r) => {
      const group = new THREE.Group();
      group.position.set(r.x, r.y, r.z);
      group.rotation.y = -(r.head || 0);
      const R = r.r || 3.2;
      const unit = new THREE.Group(); // a ring of radius 1, facing along the road (+x)
      unit.scale.setScalar(R);
      group.add(unit);
      const mat = Clay3D.material({ vertexColors: true, emissive: '#ff9a3c', emissiveIntensity: 0.55, rough: 0.35, metal: 0.15, wobble: 0.004, freq: 3, bump: false });
      const torus = new THREE.Mesh(RING_GEO(), mat);
      torus.castShadow = true;
      unit.add(torus);
      const bulbs = new THREE.Mesh(RING_BULB_GEO(), this.bulbMat || (this.bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff3b0, fog: true })));
      unit.add(bulbs);
      const halo = new THREE.Mesh(RING_HALO_GEO(), this.ringHaloMaterial());
      halo.renderOrder = 2;
      unit.add(halo);
      this.scene.add(group);
      return { r, group, unit, mat, bulbs, halo, R };
    });
  }
  ringHaloMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), { uColor: { value: new THREE.Color('#ffc04d') }, uI: { value: 1 }, uTime: { value: 0 } }),
      vertexShader: RING_HALO_VERT,
      fragmentShader: RING_HALO_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: true,
    });
  }
  updateRings(time, dt) {
    const amt = CFG.particles, glow = CFG.glow !== undefined ? CFG.glow : 1;
    for (const rm of this.ringMeshes) {
      const f = U.clamp(rm.r.flash || 0, 0, 1);
      // flies through: the ring swells, burns white-hot and its chaser lights race round
      rm.unit.scale.setScalar(rm.R * (1 + 0.16 * f * f + Math.sin(time * 2.2 + rm.r.id) * 0.012));
      rm.mat.emissiveIntensity = 0.55 + 1.3 * f;
      rm.bulbs.rotation.x = time * (1.4 + f * 6) + rm.r.id;
      const u = rm.halo.material.uniforms;
      u.uTime.value = time;
      u.uI.value = (0.75 + 1.4 * f + Math.sin(time * 3 + rm.r.id) * 0.08) * glow;
      u.uColor.value.setRGB(1, 0.75 + 0.25 * f, 0.3 + 0.6 * f);
      // a few sparkles twinkle round the rim
      if (dt > 0 && Math.random() < 0.3 * amt) {
        const a = Math.random() * TAU, n = this.ringRim(rm, a, 1.05);
        this.glow.spawn(n.x, n.y, n.z, 0, 0.4, 0, 0.09 + Math.random() * 0.06, Math.random() < 0.5 ? '#fff3b0' : '#ffd166', 0.5, 0, 1);
      }
    }
    for (const s of this.shocks) {
      if (!s.mesh.visible) continue;
      s.t += dt;
      const u = s.t / 0.45;
      if (u >= 1) {
        s.mesh.visible = false;
        continue;
      }
      s.mesh.scale.setScalar(s.R * (1 + 0.9 * U.easeInOut(u)));
      s.mesh.material.opacity = 0.9 * (1 - u);
    }
  }
  // A point on a ring's rim at angle a (in its plane), radius fraction k.
  ringRim(rm, a, k) {
    const r = rm.r, R = rm.R * k, head = r.head || 0;
    const nx = -Math.sin(head), nz = Math.cos(head);
    return this._v.set(r.x + nx * Math.sin(a) * R, r.y + Math.cos(a) * R, r.z + nz * Math.sin(a) * R);
  }
  // Someone flew through: a burst of gold round the rim and a shock ring blowing outward.
  ringBurst(ring) {
    const rm = this.ringMeshes.find((q) => q.r === ring || q.r.id === ring.id);
    if (!rm) return;
    const n = Math.round(30 * CFG.particles);
    const head = ring.head || 0, tx = Math.cos(head), tz = Math.sin(head);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.random() * 0.2;
      const p = this.ringRim(rm, a, 1);
      const ox = p.x - ring.x, oy = p.y - ring.y, oz = p.z - ring.z;
      const sp = 3 + Math.random() * 3;
      this.glow.spawn(p.x, p.y, p.z, (ox / rm.R) * sp + tx * 4, (oy / rm.R) * sp, (oz / rm.R) * sp + tz * 4, 0.12 + Math.random() * 0.1, i % 3 ? '#ffd166' : '#ffffff', 0.55, 2, 2);
    }
    let s = this.shocks.find((q) => !q.mesh.visible);
    if (!s && this.shocks.length < 4) {
      const mesh = new THREE.Mesh(RING_GEO(), new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
      this.scene.add(mesh);
      s = { mesh };
      this.shocks.push(s);
    }
    if (!s) return;
    s.t = 0;
    s.R = rm.R;
    s.mesh.visible = true;
    s.mesh.position.copy(rm.group.position);
    s.mesh.rotation.copy(rm.group.rotation);
  }

  // ---------- shells, bananas, bombs ----------
  updateObjects(time) {
    const seen = new Set();
    for (const o of this.race.items.objects) {
      if (o.dead) continue;
      seen.add(o.id);
      let m = this.objMeshes.get(o.id);
      if (!m) {
        m = this.objectMesh(o);
        this.objMeshes.set(o.id, m);
        this.scene.add(m);
      }
      m.position.set(o.x, o.y, o.z);
      if (o.kind === 'shell') {
        m.rotation.y = time * 12;
        m.position.y += 0.05;
      } else if (o.kind === 'bomb') {
        const k = Math.max(0, o.fuse) / CFG.bombFuse;
        const flash = k < 0.4 && Math.floor(time * (k < 0.2 ? 16 : 8)) % 2;
        m.children[0].material.emissive.setHex(flash ? 0xff3030 : 0x000000);
        const s = 1 + (k < 0.4 ? Math.sin(time * 30) * 0.06 : 0);
        m.scale.setScalar(s);
      } else if (o.kind === 'blast') {
        const t = o.age / 0.7;
        m.scale.setScalar(1 + t * CFG.bombRadius);
        m.children[0].material.opacity = Math.max(0, 0.85 * (1 - t));
      }
    }
    for (const [id, m] of this.objMeshes) {
      if (seen.has(id)) continue;
      this.scene.remove(m);
      this.objMeshes.delete(id);
    }
  }
  objectMesh(o) {
    const g = new THREE.Group();
    if (o.kind === 'banana') g.add(new THREE.Mesh(BANANA_GEO(), this.world.clayMat));
    else if (o.kind === 'shell') g.add(new THREE.Mesh(o.color === 'red' ? RED_SHELL_GEO() : GREEN_SHELL_GEO(), this.world.clayMat));
    else if (o.kind === 'bomb') g.add(new THREE.Mesh(BOMB_GEO(), Clay3D.material({ vertexColors: true, wobble: 0.04 })));
    else if (o.kind === 'blast') {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.85, depthWrite: false });
      g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), mat));
    }
    if (o.kind !== 'blast') g.traverse((c) => c.isMesh && (c.castShadow = true));
    return g;
  }

  // ---------- ambient weather ----------
  // Snow, pollen or embers in a box that wraps around whichever camera is drawing (in the
  // vertex shader), so the weather is everywhere on a big course at no CPU cost.
  buildAmbient() {
    const kind = this.world.theme.ambient;
    const L = AMBIENT_LOOKS[kind] || AMBIENT_LOOKS.pollen;
    const n = L.n;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    const rnd = U.rng(9);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = rnd() * L.box[0];
      pos[i * 3 + 1] = rnd() * L.box[1];
      pos[i * 3 + 2] = rnd() * L.box[2];
      seed[i] = rnd();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
        uTime: { value: 0 },
        uBox: { value: new THREE.Vector3().fromArray(L.box) },
        uDrift: { value: new THREE.Vector3().fromArray(L.drift) },
        uSway: { value: L.sway },
        uSize: { value: L.size },
        uScale: { value: 360 },
        uColor: { value: new THREE.Color(L.color) },
        uOpacity: { value: L.opacity },
      }),
      vertexShader: AMBIENT_VERT,
      fragmentShader: AMBIENT_FRAG,
      transparent: true,
      depthWrite: false,
      blending: L.add ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: true,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 3;
    // point sizes follow the height of the view being drawn
    const vp = new THREE.Vector4();
    pts.onBeforeRender = (renderer) => {
      if (renderer.getCurrentViewport) mat.uniforms.uScale.value = renderer.getCurrentViewport(vp).w * 0.5;
    };
    this.scene.add(pts);
    return { pts, mat, kind, n };
  }
  updateAmbient(time) {
    const a = this.ambient;
    a.mat.uniforms.uTime.value = time;
    a.pts.geometry.setDrawRange(0, Math.round(a.n * U.clamp(CFG.particles, 0, 1)));
  }

  // ---------- per frame ----------
  update(dt, time, events) {
    const race = this.race;
    for (const e of events) this.onEvent(e);
    const amt = CFG.particles;
    if (this.plane) this.updatePlane(time, dt);
    race.karts.forEach((k, i) => {
      const m = this.models[i];
      const io = this.planeDrop ? race.introOffset(k) : null;
      poseKart(m, k, time, dt, io);
      const lift = io ? io.y || 0 : 0;
      const hidden = this.aboard(k, io);
      m.group.visible = !hidden;
      if (hidden && m.shadow) m.shadow.visible = false;
      this.updateTrails(m, k, time, !hidden && !!m.glider && m.glideOpen > 0.6);
      if (hidden) {
        m.keyMesh.visible = m.cloud.visible = false;
        if (m.marker) m.marker.visible = false;
        return;
      }
      this.kartParticles(m, k, time, amt);
      // key carried
      m.keyMesh.visible = k.key && !k.falling;
      if (k.key) {
        m.keyMesh.position.set(k.x, k.y + 3.1 + Math.sin(time * 4) * 0.15, k.z);
        m.keyMesh.rotation.y = time * 2.5;
      }
      // rescue cloud
      const rescuing = k.falling && k.fallT > 0.45;
      m.cloud.visible = rescuing;
      if (rescuing) {
        m.cloud.position.set(k.x, k.y + 2.2, k.z);
        m.cloud.rotation.y = -k.head + Math.PI / 2;
      }
      if (m.marker) {
        m.marker.position.set(k.x, k.y + lift + 3.4 + (k.key ? 1.2 : 0) + (m.glideOpen > 0.3 ? 1.6 : 0), k.z);
        m.marker.visible = !k.falling;
      }
    });
    this.updateBoxes(dt, time);
    this.updateCoins(time);
    this.race.items.keys.forEach((key, i) => {
      const m = this.keyMeshes[i];
      m.visible = key.active;
      m.position.set(key.x, key.y + Math.sin(time * 2.5) * 0.25, key.z);
      m.rotation.y = time * 1.8;
    });
    this.updateHazards(time, dt);
    this.updateRings(time, dt);
    this.updateObjects(time);
    this.updateConfetti(dt);
    this.updateAmbient(time);
    this.clay.update(dt);
    this.glow.update(dt);
    this.paper.update(dt);
  }

  // Sparks, flames, dust, snow spray, splashes and hover motes off one kart.
  kartParticles(m, k, time, amt) {
    const fx = Math.cos(k.head), fz = Math.sin(k.head), rx = -fz, rz = fx;
    const rear = (side) => [k.x - fx * 1.1 + rx * 0.8 * side, k.y + 0.25, k.z - fz * 1.1 + rz * 0.8 * side];
    // drift sparks
    if (k.drift && k.onGround && Math.random() < amt) {
      const col = SPARK_COLS[k.driftLevel];
      for (const side of [-1, 1]) {
        const [x, y, z] = rear(side);
        if (k.driftLevel > 0) this.glow.spawn(x, y, z, (Math.random() - 0.5) * 4 - fx * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 4 - fz * 3, 0.12 + k.driftLevel * 0.04, col, 0.3, 14, 2);
        else if (Math.random() < 0.4) this.clay.spawn(x, y, z, -fx * 2, 1, -fz * 2, 0.25, '#e8dde8', 0.5, -1, 2, 1.5);
      }
    }
    // boost flames (cyan for an anti-gravity spin boost, gold through a ring)
    if (k.boostT > 0 && Math.random() < amt) {
      const x = k.x - fx * 1.6, z = k.z - fz * 1.6;
      const cols = k.boostKind === 'spin' ? ['#8ff6ff', '#58b4ff'] : k.boostKind === 'ring' ? ['#ffe066', '#fff6d6'] : ['#ffb347', '#ffe066'];
      this.glow.spawn(x, k.y + 0.8, z, -fx * 6 + (Math.random() - 0.5) * 2, 1 + Math.random(), -fz * 6 + (Math.random() - 0.5) * 2, 0.35, cols[Math.random() < 0.5 ? 0 : 1], 0.25, -2, 3);
    }
    if (k.starT > 0 && Math.random() < amt) this.glow.spawn(k.x + (Math.random() - 0.5) * 2, k.y + Math.random() * 2, k.z + (Math.random() - 0.5) * 2, 0, 1, 0, 0.18, new THREE.Color().setHSL(Math.random(), 1, 0.65).getHex(), 0.5, 0, 1);
    if (k.ghost || !k.onGround || k.falling) return;
    const sp = Math.abs(k.vf);
    const loc = k.loc;
    // dust off-road
    if (sp > 8 && (k.surface === 'offroad' || k.surface === 'mud') && Math.random() < 0.35 * amt) {
      const [x, y, z] = rear(Math.random() < 0.5 ? -1 : 1);
      this.clay.spawn(x, y, z, -fx * 2 + (Math.random() - 0.5) * 2, 1.5, -fz * 2 + (Math.random() - 0.5) * 2, 0.35, k.surface === 'mud' ? '#7a4b30' : this.world.theme.shoulder, 0.6, 3, 2, 1);
    }
    const style = loc && loc.path && loc.path.style ? loc.path.style[loc.i] : '';
    // splashes through water streams and shallows
    const wet = k.surface === 'shallow' || style === 'water' || (loc && loc.path && this.race.track.zoneAt(loc, 'current'));
    if (wet && sp > 4 && Math.random() < 0.7 * amt) {
      for (const side of [-1, 1]) {
        const [x, y, z] = rear(side);
        const out = 2.5 + Math.random() * 2.5;
        this.glow.spawn(x, y, z, rx * side * out - fx * 2, 2.5 + Math.random() * 3, rz * side * out - fz * 2, 0.1 + Math.random() * 0.08, Math.random() < 0.5 ? '#e4f7ff' : '#9fdcff', 0.5, 16, 1);
      }
      if (Math.random() < 0.35) {
        const [x, y, z] = rear(Math.random() < 0.5 ? -1 : 1);
        this.clay.spawn(x, y, z, -fx * 1.5, 1.2, -fz * 1.5, 0.3, '#ffffff', 0.45, 1, 2, 1.6);
      }
    } else if (style === 'snow' && sp > 9 && k.surface !== 'offroad') {
      // snow spray behind the wheels (rooster tails while drifting)
      const rate = (k.drift ? 0.75 : 0.32) * Math.min(1, (sp - 9) / 12) * amt;
      for (const side of [-1, 1]) {
        if (Math.random() > rate) continue;
        const [x, y, z] = rear(side);
        const kick = k.drift ? -k.drift * 2.5 : 0;
        this.clay.spawn(x, y, z, -fx * 3 + rx * (side * 0.8 + kick) + (Math.random() - 0.5), 1.4 + Math.random() * 1.8, -fz * 3 + rz * (side * 0.8 + kick) + (Math.random() - 0.5), 0.2 + Math.random() * 0.16, Math.random() < 0.6 ? '#ffffff' : '#e3edf9', 0.55, 5, 2.2, 1.3);
      }
    }
    // anti-gravity: cyan motes drift off the hover pads
    if ((k.agBlend || 0) > 0.6 && sp > 6 && Math.random() < 0.3 * amt) {
      const [x, y, z] = rear(Math.random() < 0.5 ? -1 : 1);
      this.glow.spawn(x, y - 0.1, z, -fx * 2, 0.3, -fz * 2, 0.08, Math.random() < 0.5 ? '#8ff6ff' : '#ffffff', 0.35, 0, 2);
    }
  }

  // Confetti over the line when a human finishes a point-to-point run.
  startConfetti() {
    const T = this.race.track;
    const p = T.main.point(T.finishS, 0);
    this.confettiT = 5;
    this.confettiAt = { x: p.x, y: p.yc, z: p.z, tx: p.tx, tz: p.tz, nx: p.nx, nz: p.nz, w: p.hw + 3 };
    // two cannons at the sides of the line
    const c = this.confettiAt;
    for (const side of [-1, 1]) {
      const n = Math.round(60 * CFG.particles);
      for (let i = 0; i < n; i++) {
        const sp = 9 + Math.random() * 7;
        this.paper.spawn(c.x + c.nx * c.w * side, c.y + 1.5, c.z + c.nz * c.w * side, -c.nx * side * sp * 0.45 + (Math.random() - 0.5) * 4, sp, -c.nz * side * sp * 0.45 + (Math.random() - 0.5) * 4, 1, FX_RAINBOW[i % FX_RAINBOW.length], 3.5 + Math.random(), 4, 1.4, 0.0001);
      }
    }
  }
  updateConfetti(dt) {
    if (this.confettiT <= 0) return;
    this.confettiT -= dt;
    const c = this.confettiAt;
    const n = Math.min(12, Math.round(70 * dt * CFG.particles + Math.random()));
    for (let i = 0; i < n; i++) {
      const a = (Math.random() - 0.5) * 16, d = (Math.random() * 2 - 1) * c.w;
      this.paper.spawn(c.x + c.tx * a + c.nx * d, c.y + 11 + Math.random() * 4, c.z + c.tz * a + c.nz * d, (Math.random() - 0.5) * 2, -1, (Math.random() - 0.5) * 2, 1, FX_RAINBOW[(Math.random() * FX_RAINBOW.length) | 0], 4.5, 1.6, 1.8, 0.0001);
    }
  }

  burst(pool, x, y, z, n, cols, speed, size, life, grav = 9) {
    n = Math.round(n * CFG.particles);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, u = Math.random() * 2 - 1;
      const r = Math.sqrt(1 - u * u);
      const sp = speed * (0.5 + Math.random() * 0.6);
      pool.spawn(x, y, z, Math.cos(a) * r * sp, Math.abs(u) * sp + speed * 0.3, Math.sin(a) * r * sp, size * (0.6 + Math.random() * 0.6), cols[i % cols.length], life * (0.7 + Math.random() * 0.5), grav, 1.5);
    }
  }
  // A flat ring of sparks round a kart, swirling outward (anti-gravity spin boost).
  swirl(k, cols, n) {
    n = Math.round(n * CFG.particles);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, c = Math.cos(a), s = Math.sin(a);
      const sp = 5 + Math.random() * 3;
      this.glow.spawn(k.x + c * 1.3, k.y + 0.4 + Math.random() * 0.5, k.z + s * 1.3, (c - s * 1.4) * sp, 0.8 + Math.random(), (s + c * 1.4) * sp, 0.1 + Math.random() * 0.07, cols[i % cols.length], 0.45, 0, 3);
    }
  }

  onEvent(e) {
    const k = e.kart;
    const rainbow = FX_RAINBOW;
    switch (e.type) {
      case 'box':
        this.burst(this.glow, e.a.x, e.a.y + 1.2, e.a.z, 18, rainbow, 7, 0.22, 0.6);
        break;
      case 'coin':
        if (k) this.burst(this.glow, k.x, k.y + 1, k.z, 8, ['#ffe066', '#fff3b0'], 4, 0.15, 0.4);
        break;
      case 'coinloss':
        if (k) this.burst(this.clay, k.x, k.y + 1, k.z, e.a * 3, ['#ffcf40'], 6, 0.3, 0.8, 18);
        break;
      case 'hit':
      case 'squish':
        if (k) this.burst(this.glow, k.x, k.y + 1.2, k.z, 16, ['#ffe066', '#ffffff', '#ff8fb1'], 6, 0.2, 0.6);
        break;
      case 'land':
        if (!k) break;
        if (k.loc && k.loc.path && k.loc.path.style && k.loc.path.style[k.loc.i] === 'water') this.burst(this.glow, k.x, k.y + 0.2, k.z, 18, ['#e4f7ff', '#9fdcff', '#ffffff'], 6, 0.14, 0.7, 14);
        else this.burst(this.clay, k.x, k.y + 0.2, k.z, 10, [this.world.theme.shoulder, '#e8dde8'], 4, 0.4, 0.6, 4);
        break;
      case 'launch':
        // a puff of snow off a mogul's crest (or a ramp's lip)
        if (k && this.world.theme.ambient === 'snow') this.burst(this.clay, k.x, k.y + 0.2, k.z, 6, ['#ffffff', '#e3edf9'], 3, 0.3, 0.5, 4);
        break;
      case 'blast':
        this.burst(this.glow, e.a.x, e.a.y + 1, e.a.z, 40, ['#ff8a3d', '#ffe066', '#ff5d3d'], 14, 0.5, 0.8, 6);
        this.burst(this.clay, e.a.x, e.a.y + 1, e.a.z, 24, ['#6b5168', '#8a7a8e'], 6, 0.9, 1.4, -2);
        break;
      case 'poof':
        this.burst(this.clay, e.a.x, e.a.y + 0.6, e.a.z, 10, ['#e8dde8', '#ffffff'], 4, 0.35, 0.5, 2);
        break;
      case 'key':
        if (k) this.burst(this.glow, k.x, k.y + 2, k.z, 30, ['#ffe066', '#fff3b0', '#ffffff'], 7, 0.2, 0.9, 4);
        break;
      case 'gate':
        this.burst(this.glow, e.a.x, e.a.y + 3, e.a.z, 50, rainbow, 10, 0.25, 1.4, 6);
        break;
      case 'boost':
        if (k && (e.a === 'turbo3' || e.a === 'rocket' || e.a === 'trick')) this.burst(this.glow, k.x, k.y + 0.8, k.z, 12, [SPARK_COLS[3], '#ffffff'], 6, 0.2, 0.4);
        break;
      case 'finish':
        if (k && !k.bot) {
          this.burst(this.glow, k.x, k.y + 2, k.z, 70, rainbow, 12, 0.25, 1.8, 8);
          if (this.race.p2p) this.startConfetti();
        }
        break;
      case 'squash':
        // a star bowls a hazard over: bits of whatever it was made of
        if (e.b || e.a) {
          const h = e.b && e.b.kind ? e.b : e.a && e.a.kind ? e.a : null;
          if (!h) break;
          const def = HAZARD_FX[h.kind];
          const cols = def && def.bits ? def.bits(h) : ['#b8693e', '#ffffff'];
          this.burst(this.clay, h.x, h.y + 1, h.z, 22, cols, 7, 0.4, 0.9, 14);
          this.burst(this.glow, h.x, h.y + 1.5, h.z, 10, ['#ffe066', '#ffffff'], 6, 0.16, 0.5);
        }
        break;
      case 'stomp':
        this.burst(this.clay, e.a.x, e.a.y + 0.3, e.a.z, 14, ['#9a8fb4', '#6b5f86'], 6, 0.5, 0.7, 10);
        break;
      case 'ring':
        if (e.a) this.ringBurst(e.a);
        if (k) this.burst(this.glow, k.x, k.y + 1, k.z, 10, ['#ffe066', '#ffffff'], 5, 0.14, 0.4, 2);
        break;
      case 'spinboost':
        if (k) {
          const m = this.models[k.idx];
          if (m) m.sbT = 1;
          this.swirl(k, ['#8ff6ff', '#58b4ff', '#ffffff', '#6fb8ff'], 28);
        }
        break;
      case 'glide':
        if (k) this.burst(this.clay, k.x, k.y + 1.5, k.z, 10, ['#ffffff', '#eef0fa'], 4, 0.35, 0.5, -1);
        break;
      case 'bumper':
        if (k && e.a) {
          const h = e.a;
          const x = (k.x + h.x) / 2, z = (k.z + h.z) / 2;
          this.burst(this.glow, x, k.y + 1, z, 22, ['#6ff2ff', '#ff6f91', '#ffffff'], 8, 0.16, 0.45, 2);
        }
        break;
      case 'moo':
        if (e.b || e.a) {
          const h = e.b && e.b.kind === 'cow' ? e.b : e.a && e.a.kind === 'cow' ? e.a : null;
          if (h) this.burst(this.glow, h.x, h.y + 2.8, h.z, 8, ['#ffffff', '#ff8fb1'], 3, 0.14, 0.7, -1);
          const hm = h && this.hazardMeshes.find((q) => q.h === h);
          if (hm) hm.moo = 1;
        }
        break;
      case 'mole':
        if (e.a) this.burst(this.clay, e.a.x, e.a.y + 0.6, e.a.z, 16, ['#9a6644', '#7a4b30', '#c9a07a'], 6, 0.28, 0.7, 14);
        break;
      case 'geyser':
        if (e.a) {
          const lava = e.a.look === 'lava';
          this.burst(lava ? this.glow : this.clay, e.a.x, e.a.y + 0.6, e.a.z, 26, lava ? ['#ffe066', '#ff8a3d', '#ff5d3d'] : ['#ffffff', '#d6f3ff', '#9fdcff'], 9, lava ? 0.22 : 0.32, 0.9, 12);
        }
        break;
      case 'icicle':
        if (e.a) {
          this.burst(this.clay, e.a.x, e.a.y + 0.4, e.a.z, 22, ['#dff3ff', '#ffffff', '#9fd8ff'], 8, 0.3, 0.8, 16);
          this.burst(this.glow, e.a.x, e.a.y + 0.6, e.a.z, 10, ['#ffffff', '#bfeaff'], 5, 0.12, 0.4, 6);
        }
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Hazards. Each kind: build(fx, h, hm) -> its body (Object3D in the hazard's group), and
// optionally update(fx, hm, h, time, dt) to pose it from the hazard's state, bits(h) for the
// colours it shatters into, and flags: moves (re-placed every frame), keep (stays visible
// while knocked out: mounds, vents, ceilings), tilt: false (hangs or stands upright instead of
// following the road's tilt), place: false (positions its own parts in world space),
// snap (sits on the road's surface rather than at the hazard's y).
const HAZARD_FX = {
  // ---- the classics ----
  walker: {
    moves: true,
    snap: true,
    build(fx) {
      return new THREE.Mesh(WALKER_GEO(), fx.mats.clay);
    },
    update(fx, hm, h, time) {
      const step = Math.floor(time * CFG.boilFps);
      hm.body.rotation.set(0, h.face > 0 ? -Math.PI / 2 : Math.PI / 2, step % 2 ? 0.12 : -0.12);
      hm.body.position.y = Math.abs(Math.sin(time * 8)) * 0.15;
    },
    bits: () => ['#b8693e', '#5b3524', '#ffffff'],
  },
  stomper: {
    build(fx) {
      // its face looks back down the road, at the karts coming towards it
      const b = new THREE.Mesh(STOMPER_GEO(), fx.mats.clay);
      b.rotation.y = Math.PI;
      return b;
    },
    update(fx, hm, h, time) {
      hm.body.position.y = (h.lift || 0) + 0.05;
      hm.body.position.x = h.warn ? (U.hash(Math.floor(time * 30)) - 0.5) * 0.15 : 0;
    },
  },
  firebar: {
    build(fx, h, hm) {
      const body = new THREE.Group();
      body.add(new THREE.Mesh(FIREBAR_POST_GEO(), fx.mats.clay));
      hm.balls = [];
      const n = Math.round((h.len || 6) / 1.1);
      for (let k = 1; k <= n; k++) {
        const f = new THREE.Mesh(FIREBALL_GEO(), k % 2 ? fx.mats.fire : fx.mats.hot);
        f.position.set(k * 1.1, 0, 0);
        body.add(f);
        hm.balls.push(f);
      }
      body.position.y = 1.2;
      return body;
    },
    update(fx, hm, h, time) {
      hm.body.rotation.y = hm.roadHead - (h.angle || 0);
      hm.balls.forEach((b, i) => b.scale.setScalar(1 + Math.sin(time * 19 + i * 1.7) * 0.12));
    },
  },
  snowman: {
    build(fx) {
      const b = new THREE.Mesh(SNOWMAN_GEO(), fx.mats.clay);
      b.rotation.y = Math.PI;
      return b;
    },
    bits: () => ['#ffffff', '#e3edf9', '#ff8a3d'],
  },

  // ---- a snowball (or boulder) rolling to and fro across the road ----
  roller: {
    moves: true,
    build(fx, h, hm) {
      const r = h.r || 2.2;
      const th = fx.world.theme;
      hm.snow = (h.look || (th.ambient === 'snow' ? 'snowball' : 'boulder')) === 'snowball';
      const lava = !hm.snow && fx.race.track.def.theme === 'lava';
      const body = new THREE.Group(); // at the ball's centre
      body.position.y = r;
      const ball = new THREE.Mesh(hm.snow ? SNOWBALL_GEO() : lava ? MAGMA_ROCK_GEO() : BOULDER_GEO(), fx.mats.clay);
      ball.scale.setScalar(r);
      if (lava) ball.add(new THREE.Mesh(MAGMA_GLOW_GEO(), fx.mats.fire));
      body.add(ball);
      hm.ball = ball;
      hm.lava = lava;
      return body;
    },
    update(fx, hm, h, time, dt) {
      const r = h.r || 2.2;
      // rolls about the road's tangent (x in the road frame) by roll = offset / radius
      hm.ball.rotation.x = h.roll || 0;
      const sp = Math.hypot(h.vx || 0, h.vz || 0);
      hm.body.position.y = r + Math.abs(Math.sin((h.roll || 0) * 1.7)) * 0.07 * Math.min(1, sp / 4);
      // snow (or grit) thrown up behind it
      if (hm.near && sp > 2.5 && Math.random() < Math.min(1, sp / 10) * 0.8 * CFG.particles) {
        const dx = h.dirX !== undefined ? h.dirX : 0, dz = h.dirZ !== undefined ? h.dirZ : 0;
        const cols = hm.snow ? ['#ffffff', '#e8f0fb'] : hm.lava ? ['#5a4466', '#ff8a3d'] : ['#b8a99a', '#8c7f8e'];
        const x = h.x - dx * r * 0.7 + (Math.random() - 0.5) * r, z = h.z - dz * r * 0.7 + (Math.random() - 0.5) * r;
        fx.clay.spawn(x, h.y + 0.3, z, -dx * 2.5 + (Math.random() - 0.5) * 2, 2 + Math.random() * 2.5, -dz * 2.5 + (Math.random() - 0.5) * 2, 0.3 + Math.random() * 0.35, cols[Math.random() < 0.7 ? 0 : 1], 0.8, 7, 1.8, 1.4);
      }
    },
    bits: (h) => (h.look === 'boulder' ? ['#9a8f9e', '#7c7a8e', '#c9c3d6'] : ['#ffffff', '#e3edf9', '#cfe0f5']),
  },

  // ---- a penguin: waddles up the road, then belly-slides back down it ----
  penguin: {
    moves: true,
    build(fx, h, hm) {
      const body = new THREE.Group(); // turns to face where it is going
      const pose = new THREE.Group(); // pivots about the belly for the slide
      pose.position.y = 0.9;
      body.add(pose);
      pose.add(new THREE.Mesh(PENGUIN_GEO(), fx.mats.clay));
      hm.flips = [-1, 1].map((s) => {
        const f = new THREE.Mesh(PENGUIN_FLIPPER_GEO(), fx.mats.clay);
        f.position.set(-0.04, 0.3, s * 0.58);
        f.userData.side = s;
        pose.add(f);
        return f;
      });
      hm.feet = [-1, 1].map((s) => {
        const f = new THREE.Mesh(PENGUIN_FOOT_GEO(), fx.mats.clay);
        f.position.set(0.18, -0.86, s * 0.24);
        pose.add(f);
        return f;
      });
      hm.pose = pose;
      hm.slide = 0;
      return body;
    },
    update(fx, hm, h, time, dt) {
      hm.body.rotation.y = hm.roadHead - (h.yaw !== undefined ? h.yaw : hm.roadHead);
      const s = (hm.slide = U.approach(hm.slide, h.slide ? 1 : 0, dt * 5));
      const sp = Math.hypot(h.vx || 0, h.vz || 0);
      const w = (hm.ph = (hm.ph || 0) + dt * (7 + sp * 0.9));
      const walk = (1 - s) * Math.min(1, sp / 1.5 + 0.3);
      hm.pose.rotation.set(Math.sin(w) * 0.17 * walk, 0, -1.42 * s, 'YXZ');
      hm.pose.position.y = 0.9 - 0.22 * s + Math.abs(Math.sin(w)) * 0.08 * walk;
      // flippers flap as it waddles and spread wide as it slides
      const spread = (1 - s) * (0.2 + 0.3 * Math.max(0, Math.sin(w * 2))) + s * 1.2;
      for (const f of hm.flips) f.rotation.x = -f.userData.side * spread;
      hm.feet.forEach((f, i) => (f.position.y = -0.86 + Math.max(0, Math.sin(w + i * Math.PI)) * 0.14 * walk));
      // a belly slide throws up a spray of snow
      if (hm.near && s > 0.6 && sp > 3 && Math.random() < 0.7 * CFG.particles) {
        const yaw = h.yaw || 0, bx = -Math.cos(yaw), bz = -Math.sin(yaw);
        fx.clay.spawn(h.x + bx * 0.8 + (Math.random() - 0.5) * 0.6, h.y + 0.2, h.z + bz * 0.8 + (Math.random() - 0.5) * 0.6, bx * 2 + (Math.random() - 0.5) * 2, 1.5 + Math.random() * 1.5, bz * 2 + (Math.random() - 0.5) * 2, 0.22 + Math.random() * 0.15, '#ffffff', 0.5, 5, 2, 1.3);
      }
    },
    bits: () => ['#2f3350', '#fffaf0', '#ffb347'],
  },

  // ---- a fluffy clay critter on skis, carving across the slope ----
  skier: {
    moves: true,
    build(fx, h, hm) {
      const L = SKIER_LOOKS[(h.id || 0) % SKIER_LOOKS.length];
      const lean = new THREE.Group(); // leans toward the road's right with h.lean
      const yaw = new THREE.Group();
      lean.add(yaw);
      yaw.add(new THREE.Mesh(skisGeo(L), fx.mats.clay));
      const crouch = new THREE.Group();
      yaw.add(crouch);
      crouch.add(new THREE.Mesh(skierGeo(L), fx.mats.clay));
      hm.poles = [-1, 1].map((s) => {
        const p = new THREE.Mesh(SKI_POLE_GEO(), fx.mats.clay);
        p.position.set(0.34, 0.95, s * 0.66);
        crouch.add(p);
        return p;
      });
      hm.yaw = yaw;
      hm.crouch = crouch;
      hm.lean = 0;
      return lean;
    },
    update(fx, hm, h, time, dt) {
      hm.lean = U.lerp(hm.lean, U.clamp(h.lean || 0, -1, 1), 1 - Math.exp(-10 * dt));
      const lean = hm.lean;
      hm.body.rotation.x = lean * 0.45;
      hm.yaw.rotation.y = hm.roadHead - (h.yaw !== undefined ? h.yaw : hm.roadHead);
      hm.crouch.position.y = Math.sin(time * 4.5 + h.id) * 0.05 - Math.abs(lean) * 0.12;
      hm.crouch.rotation.z = -0.1 - Math.abs(lean) * 0.1;
      hm.poles.forEach((p, i) => (p.rotation.z = 0.5 + Math.sin(time * 4.5 + h.id + i * Math.PI) * 0.18));
      // carving throws snow off the skis to the outside of the turn
      if (hm.near && Math.abs(lean) > 0.35 && Math.random() < Math.abs(lean) * 0.8 * CFG.particles) {
        const yaw = h.yaw || 0, bx = -Math.cos(yaw), bz = -Math.sin(yaw);
        const nx = h.nx !== undefined ? h.nx : 0, nz = h.nz !== undefined ? h.nz : 0;
        const out = -Math.sign(lean) * (2 + Math.random() * 2);
        fx.clay.spawn(h.x + bx * 1, h.y + 0.15, h.z + bz * 1, nx * out + bx, 1.6 + Math.random() * 1.6, nz * out + bz, 0.2 + Math.random() * 0.14, '#ffffff', 0.5, 6, 2, 1.2);
      }
    },
    bits: (h) => {
      const L = SKIER_LOOKS[(h.id || 0) % SKIER_LOOKS.length];
      return [L.fur, L.suit, L.hat, '#ffffff'];
    },
  },

  // ---- a cow ambling about on the road; bump it and it hops (and moos) ----
  cow: {
    moves: true,
    build(fx, h, hm) {
      const body = new THREE.Group();
      const hop = new THREE.Group();
      body.add(hop);
      hop.add(new THREE.Mesh(COW_GEO(), fx.mats.clay));
      const head = new THREE.Mesh(COW_HEAD_GEO(), fx.mats.clay);
      head.position.set(1.3, 2.05, 0);
      hop.add(head);
      hm.legs = [];
      for (const [x, z] of [[0.8, 0.46], [0.8, -0.46], [-0.85, 0.46], [-0.85, -0.46]]) {
        const leg = new THREE.Mesh(COW_LEG_GEO(), fx.mats.clay);
        leg.position.set(x, 1.17, z);
        leg.userData.ph = (x > 0) === (z > 0) ? 0 : Math.PI; // diagonal pairs step together
        hop.add(leg);
        hm.legs.push(leg);
      }
      const tail = new THREE.Mesh(COW_TAIL_GEO(), fx.mats.clay);
      tail.position.set(-1.32, 2.15, 0);
      hop.add(tail);
      hm.hop = hop;
      hm.head = head;
      hm.tail = tail;
      hm.moo = 0;
      return body;
    },
    update(fx, hm, h, time, dt) {
      hm.body.rotation.y = hm.roadHead - (h.yaw !== undefined ? h.yaw : hm.roadHead);
      const sp = Math.hypot(h.vx || 0, h.vz || 0);
      const ph = (hm.ph = (hm.ph || 0) + dt * (2 + sp * 2.4));
      const amp = Math.min(1, sp / 1.2) * 0.42;
      // bumped: it jumps up, legs splayed
      const hop = U.clamp(h.hop || 0, 0, 1), u = 1 - hop;
      hm.hop.position.y = hop > 0 ? 4 * u * (1 - u) * 1.3 : 0;
      for (const leg of hm.legs) leg.rotation.set(hop > 0 ? Math.sign(leg.position.z) * 0.35 * hop : 0, 0, Math.sin(ph + leg.userData.ph) * amp + (hop > 0 ? -Math.sign(leg.position.x) * 0.4 * hop : 0));
      hm.moo = Math.max(0, (hm.moo || 0) - dt * 1.4);
      hm.head.rotation.set(Math.sin(time * 0.9 + h.id) * 0.12, Math.sin(time * 0.6 + h.id * 2) * 0.25, Math.sin(ph * 2) * 0.05 + hm.moo * 0.45);
      hm.tail.rotation.x = Math.sin(time * 2.4 + h.id) * 0.45;
    },
    bits: () => ['#fffaf0', '#3b2a3a', '#ffb3c1'],
  },

  // ---- a mole in a dirt mound: the dirt shakes, then it pops up ----
  mole: {
    keep: true,
    build(fx, h, hm) {
      const body = new THREE.Group();
      hm.mound = new THREE.Mesh(MOUND_GEO(), fx.mats.clay);
      body.add(hm.mound);
      const mole = new THREE.Group();
      mole.add(new THREE.Mesh(MOLE_GEO(), fx.mats.clay));
      hm.paws = new THREE.Mesh(MOLE_PAWS_GEO(), fx.mats.clay);
      mole.add(hm.paws);
      body.add(mole);
      hm.mole = mole;
      return body;
    },
    update(fx, hm, h, time, dt) {
      const up = U.clamp(h.up || 0, 0, 1);
      hm.mole.visible = up > 0.01;
      // pops out with a bounce, looks about, waves its claws (faces down the road)
      hm.mole.position.y = -1.55 + 1.6 * U.easeOutBack(up);
      hm.mole.rotation.y = Math.PI + Math.sin(time * 2.6 + h.id) * 0.55 * up;
      hm.paws.rotation.z = Math.sin(time * 11 + h.id) * 0.22 * up;
      const j = h.warn ? 0.14 : 0;
      hm.mound.position.set((U.hash(Math.floor(time * 24) + h.id * 7) - 0.5) * j, 0, (U.hash(Math.floor(time * 24) + h.id * 7 + 99) - 0.5) * j);
      hm.mound.scale.set(1, h.warn ? 1 + Math.sin(time * 31) * 0.07 : 1, 1);
      if (h.warn && hm.near && Math.random() < 0.35 * CFG.particles) {
        const a = Math.random() * TAU;
        fx.clay.spawn(h.x + Math.cos(a) * 0.8, h.y + 0.6, h.z + Math.sin(a) * 0.8, Math.cos(a) * 1.5, 2.5 + Math.random() * 2, Math.sin(a) * 1.5, 0.14 + Math.random() * 0.1, Math.random() < 0.6 ? '#9a6644' : '#7a4b30', 0.6, 14, 1, 0);
      }
    },
    bits: () => ['#7a6070', '#ffd166', '#9a6644'],
  },

  // ---- a geyser: bubbles, then blasts a column of water (or lava) into the air ----
  geyser: {
    keep: true,
    build(fx, h, hm) {
      const lava = (h.look || (fx.race.track.def.theme === 'lava' ? 'lava' : 'water')) === 'lava';
      hm.lava = lava;
      const R = h.r || 2;
      const body = new THREE.Group();
      const vent = new THREE.Mesh(lava ? VENT_LAVA_GEO() : fx.world.theme.ambient === 'snow' ? VENT_SNOW_GEO() : VENT_GEO(), fx.mats.clay);
      vent.scale.set(R / 2, 1, R / 2);
      body.add(vent);
      let poolMat = lava ? fx.mats.lava : null;
      if (!poolMat) {
        try {
          poolMat = fx.world.waterMaterial({ world: true, scale: 3, color: '#8fe0f8', deep: '#3a8fd0', opacity: 1, wave: 0, flow: [0.2, 0.3] });
        } catch (e) {
          poolMat = new THREE.MeshBasicMaterial({ color: 0x7fd3f0, fog: true });
        }
      }
      const pool = new THREE.Mesh(VENT_POOL_GEO(), poolMat);
      pool.scale.set(R / 2, 1, R / 2);
      body.add(pool);
      hm.bulge = new THREE.Mesh(VENT_BULGE_GEO(), lava ? fx.mats.hot : fx.mats.clay);
      hm.bulge.scale.set(R / 2, 0.3, R / 2);
      body.add(hm.bulge);
      hm.col = new THREE.Mesh(COLUMN_GEO(), lava ? LAVA_COLUMN_MAT() : WATER_COLUMN_MAT());
      hm.col.visible = false;
      hm.col.renderOrder = 1;
      body.add(hm.col);
      hm.crown = new THREE.Mesh(CROWN_GEO(), lava ? fx.mats.hot : fx.mats.clay);
      hm.crown.visible = false;
      body.add(hm.crown);
      if (lava) {
        hm.glow = fx.glowSprite(0xff8a3d, R * 3);
        hm.glow.position.y = 1;
        body.add(hm.glow);
      }
      return body;
    },
    update(fx, hm, h, time, dt) {
      const R = h.r || 2, H = h.height || 7;
      const p = U.clamp(h.power || 0, 0, 1);
      // bubbling: little spurts before it blows
      const spurt = h.warn ? 0.05 + 0.06 * Math.max(0, Math.sin(time * 17 + h.id)) : 0;
      const shown = Math.max(p, spurt);
      const wob = 1 + Math.sin(time * 23 + h.id) * 0.05;
      hm.col.material.map.offset.y = -time * 1.7; // gushing upward
      hm.col.visible = shown > 0.004;
      hm.col.scale.set((R / 2) * wob * (0.7 + 0.3 * Math.min(1, shown * 3)), Math.max(0.01, H * shown), (R / 2) * wob * (0.7 + 0.3 * Math.min(1, shown * 3)));
      hm.crown.visible = shown > 0.02;
      hm.crown.position.y = H * shown;
      hm.crown.scale.setScalar((R / 2) * (0.35 + 0.75 * Math.min(1, shown * 2)) * (1 + Math.sin(time * 13) * 0.08));
      hm.crown.rotation.y = time * 2.2;
      hm.bulge.scale.y = h.warn ? 0.35 + 0.35 * Math.abs(Math.sin(time * 12 + h.id)) : 0.15;
      if (hm.glow) {
        const g = (CFG.glow !== undefined ? CFG.glow : 1) * (0.45 + 0.55 * Math.max(p, h.warn ? 0.4 : 0));
        hm.glow.material.opacity = g;
        hm.glow.position.y = 1 + H * p * 0.5;
        hm.glow.scale.setScalar(R * 3 * (1 + p));
      }
      if (!hm.near) return;
      const amt = CFG.particles;
      // spray raining down off the top of the column
      if (p > 0.3 && Math.random() < 0.9 * amt) {
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * TAU, sp = 2 + Math.random() * 3;
          const top = h.y + H * p;
          if (hm.lava) fx.glow.spawn(h.x, top, h.z, Math.cos(a) * sp, 2 + Math.random() * 3, Math.sin(a) * sp, 0.14 + Math.random() * 0.1, Math.random() < 0.5 ? '#ffe066' : '#ff8a3d', 0.9, 14, 0.5);
          else fx.clay.spawn(h.x, top, h.z, Math.cos(a) * sp, 2 + Math.random() * 3, Math.sin(a) * sp, 0.2 + Math.random() * 0.15, Math.random() < 0.6 ? '#ffffff' : '#cfeeff', 1, 14, 0.5);
        }
      }
      // bubbles in the vent before it blows
      if (h.warn && Math.random() < 0.5 * amt) {
        const a = Math.random() * TAU, d = Math.random() * R * 0.4;
        (hm.lava ? fx.glow : fx.clay).spawn(h.x + Math.cos(a) * d, h.y + 0.3, h.z + Math.sin(a) * d, 0, 1.5 + Math.random(), 0, 0.12 + Math.random() * 0.1, hm.lava ? '#ffb347' : '#e4f7ff', 0.4, 0, 1);
      }
    },
    bits: (h) => (h.look === 'lava' ? ['#3d2f48', '#ff8a3d'] : ['#8c8fae', '#ffffff']),
  },

  // ---- a fireball leaping out of the lava, over the road and back in ----
  podoboo: {
    keep: true,
    place: false,
    build(fx, h, hm) {
      const body = new THREE.Group(); // parts live in world space
      const ball = new THREE.Group();
      ball.add(new THREE.Mesh(PODOBOO_GEO(), fx.mats.glowClay));
      hm.flames = new THREE.Mesh(PODOBOO_FLAME_GEO(), fx.mats.glowClay);
      ball.add(hm.flames);
      ball.scale.setScalar((h.r || 0.9) / 0.9);
      ball.visible = false;
      body.add(ball);
      hm.ball = ball;
      hm.glow = fx.glowSprite(0xff9a3c, 5.5);
      hm.glow.visible = false;
      body.add(hm.glow);
      // where the next leap comes from: the lava glows and bubbles there first
      hm.spot = fx.glowSprite(0xff7a2f, 4);
      hm.spot.visible = false;
      body.add(hm.spot);
      hm.was = false;
      return body;
    },
    update(fx, hm, h, time, dt) {
      const act = !!h.active && h.alive !== false;
      const amt = CFG.particles;
      if (act !== hm.was && hm.near) {
        // a splash of lava where it leaves and where it dives back in
        const x = act ? h.x : hm.px, y = act ? h.y : hm.py, z = act ? h.z : hm.pz;
        if (x !== undefined) fx.burst(fx.glow, x, y, z, 14, ['#ffe066', '#ff8a3d', '#ff5d3d'], 6, 0.2, 0.6, 14);
      }
      hm.was = act;
      hm.ball.visible = hm.glow.visible = act;
      if (act) {
        // face along the leap
        if (dt > 0 && hm.px !== undefined) {
          const vx = (h.x - hm.px) / dt, vy = (h.y - hm.py) / dt, vz = (h.z - hm.pz) / dt;
          if (vx * vx + vz * vz + vy * vy > 0.01) hm.ball.rotation.set(0, -Math.atan2(vz, vx), Math.atan2(vy, Math.hypot(vx, vz)), 'YZX');
        }
        hm.ball.position.set(h.x, h.y, h.z);
        hm.flames.scale.set(1 + Math.sin(time * 23) * 0.15, 1 + Math.sin(time * 17 + 1) * 0.12, 1 + Math.sin(time * 19 + 2) * 0.12);
        hm.glow.position.set(h.x, h.y, h.z);
        hm.glow.material.opacity = (CFG.glow !== undefined ? CFG.glow : 1) * (0.8 + Math.sin(time * 15) * 0.15);
        if (hm.near && Math.random() < amt) fx.glow.spawn(h.x + (Math.random() - 0.5) * 0.6, h.y + (Math.random() - 0.5) * 0.6, h.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, 0.25 + Math.random() * 0.2, Math.random() < 0.5 ? '#ffb347' : '#ffe066', 0.35, -1, 2);
      }
      hm.px = h.x;
      hm.py = h.y;
      hm.pz = h.z;
      // the lava bubbles at the next leap's start for the last part of the wait
      const period = h.period || 3, c = (h.t || 0) / period + (h.phase || 0), u = c - Math.floor(c);
      const warn = !act && h.alive !== false && u > 0.75 && h.path;
      hm.spot.visible = !!warn;
      if (warn) {
        const dir = (Math.floor(c) + 1) % 2 === 0 ? 1 : -1;
        const span = h.span || 20;
        const p = h.path.point(h.s, (h.d || 0) - (dir * span) / 2, fx._hp || (fx._hp = {}));
        const k = (u - 0.75) / 0.25;
        hm.spot.position.set(p.x, p.y - 1.2, p.z);
        hm.spot.material.opacity = (CFG.glow !== undefined ? CFG.glow : 1) * (0.3 + 0.6 * k) * (0.8 + Math.sin(time * 20) * 0.2);
        if (hm.near && Math.random() < 0.4 * amt) fx.glow.spawn(p.x + (Math.random() - 0.5) * 1.5, p.y - 1.4, p.z + (Math.random() - 0.5) * 1.5, 0, 2 + Math.random() * 2, 0, 0.12 + Math.random() * 0.1, Math.random() < 0.5 ? '#ffb347' : '#ff7a2f', 0.4, 6, 1);
      }
    },
    bits: () => ['#ff8a3d', '#ffe066'],
  },

  // ---- an anti-gravity bumper: spins, glows and pulses when it bounces you off ----
  bumper: {
    build(fx, h, hm) {
      const body = new THREE.Group();
      body.scale.setScalar((h.r || 1.3) / 1.3);
      const squash = new THREE.Group(); // squashes on a hit
      body.add(squash);
      squash.add(new THREE.Mesh(BUMPER_GEO(), fx.mats.clay));
      hm.studs = new THREE.Mesh(BUMPER_STUDS_GEO(), fx.mats.clay);
      squash.add(hm.studs);
      hm.bandMat = new THREE.MeshBasicMaterial({ color: 0x6ff2ff, fog: true });
      squash.add(new THREE.Mesh(BUMPER_BAND_GEO(), hm.bandMat));
      hm.glow = fx.glowSprite(0x6ff2ff, 5.2);
      hm.glow.position.y = 1;
      body.add(hm.glow);
      hm.squash = squash;
      return body;
    },
    update(fx, hm, h, time) {
      const p = U.clamp(h.pulse || 0, 0, 1);
      hm.studs.rotation.y = h.spin || 0;
      // a wobbly squash and a white-hot flash on every hit
      const wob = p * Math.cos((1 - p) * 14);
      hm.squash.scale.set(1 + 0.3 * wob, 1 - 0.16 * wob, 1 + 0.3 * wob);
      hm.bandMat.color.setRGB(0.44 + 0.56 * p, 0.95 + 0.05 * p, 1);
      const g = CFG.glow !== undefined ? CFG.glow : 1;
      hm.glow.material.opacity = g * (0.55 + 0.45 * p + Math.sin(time * 5 + h.id) * 0.08);
      hm.glow.scale.setScalar(5.2 * (1 + 0.6 * p));
    },
  },

  // ---- an icicle: hangs from the cave roof, shivers, falls and shatters, grows back ----
  icicle: {
    keep: true,
    tilt: false,
    build(fx, h, hm) {
      const ceil = h.ceil !== undefined ? h.ceil : 9;
      const body = new THREE.Group();
      // the ice it grows from, reaching up to the roof (found by looking straight up)
      const roof = fx.roofAbove(h.x, h.y, h.z, ceil - 1.5);
      const top = roof !== null ? roof - h.y + 0.6 : ceil + 1.2;
      const root = new THREE.Mesh(ICICLE_ROOT_GEO(), fx.mats.ice);
      root.position.y = ceil - 0.15;
      root.scale.set(1, Math.max(0.6, top - ceil), 1);
      body.add(root);
      hm.spike = new THREE.Group();
      hm.spike.add(new THREE.Mesh(ICICLE_GEO(), fx.mats.ice));
      body.add(hm.spike);
      // its shadow on the road, darker and bigger as it comes down
      const flat = new THREE.Group();
      if (hm.frameQ) flat.quaternion.copy(hm.mesh.quaternion).invert().multiply(hm.frameQ);
      hm.shade = new THREE.Mesh(ICICLE_SHADE_GEO(), new THREE.MeshBasicMaterial({ map: KartModels.shadowTexture(), transparent: true, opacity: 0, depthWrite: false, fog: true }));
      hm.shade.position.y = 0.1;
      hm.shade.renderOrder = 1;
      flat.add(hm.shade);
      body.add(flat);
      return body;
    },
    update(fx, hm, h, time, dt) {
      const LEN = typeof ICICLE_LEN !== 'undefined' ? ICICLE_LEN : 2.6;
      const ceil = h.ceil !== undefined ? h.ceil : 9, hang = ceil - LEN;
      const st = h.state || 'hang';
      const gone = st === 'gone' || h.alive === false;
      const g = U.clamp(h.grow !== undefined ? h.grow : 1, 0, 1);
      const drop = h.drop !== undefined ? h.drop : hang;
      hm.spike.visible = !gone && g > 0.02;
      hm.spike.position.set(0, drop, 0);
      hm.spike.scale.set(0.45 + 0.55 * g, Math.max(0.02, g), 0.45 + 0.55 * g);
      // it shivers before it falls
      if (st === 'warn') {
        const q = Math.floor(time * 32);
        hm.spike.position.x = (U.hash(q + h.id * 13) - 0.5) * 0.16;
        hm.spike.position.z = (U.hash(q + h.id * 13 + 50) - 0.5) * 0.16;
        hm.spike.rotation.z = (U.hash(q + h.id * 13 + 90) - 0.5) * 0.06;
        if (hm.near && Math.random() < 0.3 * CFG.particles) fx.clay.spawn(h.x + (Math.random() - 0.5) * 0.6, h.y + ceil - 0.3, h.z + (Math.random() - 0.5) * 0.6, 0, -1, 0, 0.08 + Math.random() * 0.06, '#ffffff', 1.2, 14, 0.3, 0);
      } else hm.spike.rotation.z = 0;
      const fall = st === 'fall' ? 1 - U.clamp(drop / hang, 0, 1) : 0;
      const a = st === 'warn' ? 0.28 + 0.14 * Math.sin(time * 18) : st === 'fall' ? 0.35 + 0.55 * fall : st === 'hang' ? 0.12 : 0;
      hm.shade.material.opacity = a;
      hm.shade.scale.setScalar(0.8 + 0.9 * fall + (st === 'warn' ? 0.15 : 0));
    },
    bits: () => ['#dff3ff', '#ffffff'],
  },

  // ---- a slalom pole with a flag; karts that brush past set it wobbling ----
  pole: {
    build(fx, h, hm) {
      const col = h.color || (h.id % 2 ? '#3f7fd6' : '#e8483f');
      const body = new THREE.Group();
      body.add(new THREE.Mesh(fx.world.theme.ambient === 'snow' ? POLE_BASE_SNOW_GEO() : POLE_BASE_GEO(), fx.mats.clay));
      const stick = new THREE.Group(); // bends from its foot
      body.add(stick);
      stick.add(new THREE.Mesh(poleGeo(col), fx.mats.clay));
      hm.flag = new THREE.Mesh(poleFlagGeo(col), fx.mats.clay);
      hm.flag.position.y = 3.15;
      stick.add(hm.flag);
      hm.stick = stick;
      hm.wobT = 9;
      return body;
    },
    update(fx, hm, h, time, dt) {
      const R = (h.r || 0.35) + 1.7;
      for (const k of fx.race.karts) {
        if (k.ghost || k.falling || hm.wobT < 0.25) continue;
        const dx = k.x - h.x, dz = k.z - h.z;
        if (dx * dx + dz * dz > R * R || Math.abs(k.y - h.y) > 3) continue;
        // pushed away from the kart, in the road frame (x along, z across)
        const c = Math.cos(hm.roadHead), s = Math.sin(hm.roadHead), l = Math.hypot(dx, dz) || 1;
        hm.wobX = (-(dx * c + dz * s) / l) * 0.5;
        hm.wobZ = (-(-dx * s + dz * c) / l) * 0.5;
        hm.wobT = 0;
      }
      hm.wobT += dt;
      const w = Math.exp(-hm.wobT * 3.5) * Math.cos(hm.wobT * 15);
      hm.stick.rotation.set((hm.wobZ || 0) * w, 0, -(hm.wobX || 0) * w);
      hm.flag.rotation.y = Math.sin(time * 4.5 + h.id) * 0.32 + Math.sin(time * 11 + h.id) * 0.06;
    },
  },
};

// ---------------------------------------------------------------------------
// Small textures and shared geometries (built once, lazily).
function memo(fn) {
  let v = null;
  return () => {
    if (!v) {
      v = fn();
      if (v.userData) v.userData.shared = true;
    }
    return v;
  };
}
// Keyed variant (e.g. one pole geometry per flag colour).
const FX_GEO = {};
function fxGeo(key, make) {
  let g = FX_GEO[key];
  if (!g) {
    g = FX_GEO[key] = make();
    g.userData.shared = true;
  }
  return g;
}
// n directions spread evenly over a sphere (a Fibonacci spiral), deterministic.
function fxSphereDirs(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), a = i * 2.39996;
    out.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  return out;
}
// Stand a part on a sphere: its +y along dir, at radius r.
function fxStick(geo, dir, r) {
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  return geo.translate(dir.x * r, dir.y * r, dir.z * r);
}

const glowTexture = memo(() => {
  const c = Clay.makeCanvas(64, 64);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
});
const questionTexture = memo(() => {
  const c = Clay.makeCanvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 10;
  Clay.rrect(g, 6, 6, 116, 116, 26);
  g.stroke();
  g.font = `700 92px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 10;
  g.strokeStyle = '#6b4a9a';
  g.strokeText('?', 64, 70);
  g.fillStyle = '#ffffff';
  g.fillText('?', 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
});
function markerTexture(slot, name) {
  const c = Clay.makeCanvas(128, 64);
  const g = c.getContext('2d');
  const col = SLOT_COLORS[slot];
  g.fillStyle = col;
  Clay.rrect(g, 14, 4, 100, 40, 18);
  g.fill();
  g.beginPath();
  g.moveTo(52, 44);
  g.lineTo(64, 60);
  g.lineTo(76, 44);
  g.fill();
  g.font = `700 26px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 5;
  g.strokeStyle = '#2b1838';
  g.strokeText('P' + (slot + 1), 64, 25);
  g.fillStyle = '#ffffff';
  g.fillText('P' + (slot + 1), 64, 25);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// Vertical streaks for a geyser's column (scrolled upward as it gushes).
function streakTexture(base, light, dark) {
  const c = Clay.makeCanvas(64, 128);
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 64, 128);
  const rnd = U.rng(31);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * 64, w = 2 + rnd() * 6, y = rnd() * 128, h = 30 + rnd() * 70;
    g.fillStyle = rnd() < 0.65 ? light : dark;
    for (const oy of [-128, 0, 128]) {
      Clay.rrect(g, x, y + oy, w, h, w / 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const WATER_COLUMN_MAT = memo(() => new THREE.MeshBasicMaterial({ map: streakTexture('#bfeaff', 'rgba(255,255,255,0.95)', 'rgba(110,190,240,0.6)'), transparent: true, opacity: 0.88, depthWrite: false, side: THREE.DoubleSide, fog: true }));
const LAVA_COLUMN_MAT = memo(() => new THREE.MeshBasicMaterial({ map: streakTexture('#ff8a3d', 'rgba(255,230,120,0.95)', 'rgba(200,60,40,0.7)'), side: THREE.DoubleSide, fog: true }));

const KEY_GEO = memo(() =>
  GK.merge([
    GK.at(GK.torus(0.45, 0.16, '#ffcc3d', { seed: 1 }), 0, 0.9, 0),
    GK.at(GK.box(0.2, 1.3, 0.2, '#ffcc3d', { seed: 2, r: 0.08 }), 0, -0.05, 0),
    GK.at(GK.box(0.4, 0.18, 0.18, '#ffcc3d', { seed: 3, r: 0.06 }), 0.2, -0.45, 0),
    GK.at(GK.box(0.3, 0.18, 0.18, '#ffcc3d', { seed: 4, r: 0.06 }), 0.15, -0.15, 0),
    GK.at(GK.blob(0.14, 0.14, 0.14, '#fff3b0', { seed: 5, lump: 0 }), 0, 0.9, 0.18),
  ]),
);
const BANANA_GEO = memo(() => {
  const P = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 4 - 0.5) * 1.5;
    P.push(GK.at(GK.blob(0.32, 0.3, 0.3, '#ffe066', { seed: k + 10 }), Math.sin(a) * 0.7, 0.35 + (1 - Math.cos(a)) * 0.7, 0));
  }
  P.push(GK.at(GK.blob(0.12, 0.12, 0.12, '#6b4a24', { seed: 20, lump: 0 }), -0.75, 1.0, 0));
  return GK.merge(P);
});
function shellGeo(col) {
  return GK.merge([
    GK.at(GK.blob(0.85, 0.6, 0.85, col, { seed: 31 }), 0, 0.55, 0),
    GK.at(GK.torus(0.78, 0.16, '#fff6ea', { seed: 32 }), 0, 0.3, 0, Math.PI / 2),
    GK.at(GK.blob(0.7, 0.2, 0.7, '#fff1d6', { seed: 33 }), 0, 0.15, 0),
    ...[0, 1, 2, 3, 4].map((k) => GK.at(GK.blob(0.18, 0.12, 0.18, '#fff6ea', { seed: 34 + k, lump: 0 }), Math.cos(k * 1.26) * 0.45, 0.95, Math.sin(k * 1.26) * 0.45)),
  ]);
}
const GREEN_SHELL_GEO = memo(() => shellGeo('#4fbf5a'));
const RED_SHELL_GEO = memo(() => shellGeo('#e8483f'));
const BOMB_GEO = memo(() =>
  GK.merge([
    GK.at(GK.blob(0.85, 0.85, 0.85, '#3b2a4a', { seed: 41 }), 0, 0.85, 0),
    GK.at(GK.cyl(0.12, 0.12, 0.5, '#8a8396', { segs: 6, lump: 0 }), 0, 1.75, 0),
    GK.at(GK.blob(0.18, 0.18, 0.18, '#ffb347', { seed: 42 }), 0, 2.05, 0),
    GK.at(GK.blob(0.14, 0.22, 0.1, '#ffffff', { seed: 43, lump: 0 }), 0.72, 1.05, 0.25),
    GK.at(GK.blob(0.14, 0.22, 0.1, '#ffffff', { seed: 44, lump: 0 }), 0.72, 1.05, -0.25),
    GK.at(GK.box(0.35, 0.3, 0.12, '#ffcc3d', { seed: 45, lump: 0 }), -0.85, 0.85, 0),
  ]),
);
const WALKER_GEO = memo(() => {
  const c = '#b8693e';
  return GK.merge([
    GK.at(GK.blob(1.1, 1.0, 1.1, c, { seed: 51 }), 0, 1.15, 0),
    GK.at(GK.blob(0.45, 0.25, 0.6, '#5b3524', { seed: 52 }), 0.45, 0.2, 0),
    GK.at(GK.blob(0.45, 0.25, 0.6, '#5b3524', { seed: 53 }), -0.45, 0.2, 0),
    GK.at(GK.blob(0.25, 0.32, 0.12, '#fffaf0', { seed: 54, lump: 0 }), 0.35, 1.45, 0.95),
    GK.at(GK.blob(0.25, 0.32, 0.12, '#fffaf0', { seed: 55, lump: 0 }), -0.35, 1.45, 0.95),
    GK.at(GK.blob(0.12, 0.16, 0.08, '#2a1a22', { seed: 56, lump: 0 }), 0.32, 1.42, 1.04),
    GK.at(GK.blob(0.12, 0.16, 0.08, '#2a1a22', { seed: 57, lump: 0 }), -0.32, 1.42, 1.04),
    GK.at(GK.box(0.5, 0.1, 0.12, '#5b3524', { seed: 58, lump: 0 }), 0.35, 1.82, 0.95, 0, 0, -0.35),
    GK.at(GK.box(0.5, 0.1, 0.12, '#5b3524', { seed: 59, lump: 0 }), -0.35, 1.82, 0.95, 0, 0, 0.35),
  ]);
});
const STOMPER_GEO = memo(() => {
  const s = '#9b93b4';
  const P = [GK.box(3.8, 3.8, 3.8, s, { seed: 61, r: 0.5, lump: 0.25 })];
  for (const z of [-0.8, 0.8]) {
    P.push(GK.at(GK.blob(0.15, 0.5, 0.42, '#fffaf0', { seed: 62, lump: 0 }), 1.92, 2.3, z));
    P.push(GK.at(GK.blob(0.1, 0.24, 0.2, '#2a1a22', { seed: 63, lump: 0 }), 1.98, 2.25, z * 0.9));
    P.push(GK.at(GK.box(0.15, 0.2, 0.9, '#4a3d5c', { seed: 64, lump: 0 }), 1.95, 2.95, z, z > 0 ? 0.4 : -0.4, 0, 0));
  }
  for (let k = -2; k <= 2; k++) P.push(GK.at(GK.cone(0.16, 0.4, '#fffaf0', { seed: 65 + k, segs: 5, lump: 0 }), 1.95, 1.2, k * 0.35, 0, 0, Math.PI));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    P.push(GK.at(GK.cone(0.35, 0.9, '#6b5f86', { seed: 70 + k, segs: 6 }), Math.cos(a) * 1.4, -0.2, Math.sin(a) * 1.4, Math.PI));
  }
  return GK.at(GK.merge(P), 0, 2.1, 0);
});
const SNOWMAN_GEO = memo(() =>
  GK.merge([
    GK.at(GK.blob(1.3, 1.2, 1.3, '#ffffff', { seed: 81 }), 0, 1.1, 0),
    GK.at(GK.blob(0.95, 0.9, 0.95, '#ffffff', { seed: 82 }), 0, 2.75, 0),
    GK.at(GK.blob(0.7, 0.65, 0.7, '#ffffff', { seed: 83 }), 0, 3.95, 0),
    GK.at(GK.cone(0.15, 0.7, '#ff8a3d', { seed: 84 }), 0.95, 3.95, 0, 0, 0, -Math.PI / 2),
    GK.at(GK.blob(0.1, 0.12, 0.1, '#2a1a22', { seed: 85, lump: 0 }), 0.6, 4.2, 0.25),
    GK.at(GK.blob(0.1, 0.12, 0.1, '#2a1a22', { seed: 86, lump: 0 }), 0.6, 4.2, -0.25),
    GK.at(GK.cyl(0.5, 0.55, 0.7, '#3b2a4a', { seed: 87 }), 0, 4.75, 0),
    GK.at(GK.cyl(0.8, 0.8, 0.12, '#3b2a4a', { seed: 88 }), 0, 4.45, 0),
    GK.at(GK.torus(0.8, 0.18, '#e2483d', { seed: 89 }), 0, 3.35, 0, Math.PI / 2),
  ]),
);
const RESCUE_GEO = memo(() =>
  GK.merge([
    GK.at(GK.blob(1.6, 0.7, 1.3, '#ffffff', { seed: 91 }), 0, 0, 0),
    GK.at(GK.blob(1.0, 0.6, 0.9, '#f4ecff', { seed: 92 }), 1.0, 0.15, 0.3),
    GK.at(GK.blob(1.0, 0.6, 0.9, '#f4ecff', { seed: 93 }), -1.0, 0.1, -0.2),
    // the little rescuer with goggles and a fishing rod
    GK.at(GK.blob(0.55, 0.55, 0.55, '#ffd166', { seed: 94 }), 0, 0.85, 0),
    GK.at(GK.torus(0.25, 0.08, '#3b2a4a', { seed: 95, lump: 0 }), 0.42, 1.0, 0.18, 0, Math.PI / 2, 0),
    GK.at(GK.torus(0.25, 0.08, '#3b2a4a', { seed: 96, lump: 0 }), 0.42, 1.0, -0.18, 0, Math.PI / 2, 0),
    GK.at(GK.cyl(0.05, 0.05, 2.6, '#8a5a3c', { segs: 5, lump: 0 }), 0.9, 1.3, 0, 0, 0, -0.9),
    GK.at(GK.cyl(0.02, 0.02, 1.8, '#3b2440', { segs: 4, lump: 0 }), 1.9, 0.9, 0),
  ]),
);
const FIREBAR_POST_GEO = memo(() => GK.box(1.4, 1.4, 1.4, '#6b5f86', { seed: 4 }));
const FIREBALL_GEO = memo(() => new THREE.IcosahedronGeometry(0.55, 1));
const CONFETTI_GEO = memo(() => new THREE.PlaneGeometry(0.34, 0.2));

// ---- roller: a snowball (or a boulder) of radius 1, scaled to the hazard's r ----
const SNOWBALL_GEO = memo(() => {
  const P = [GK.blob(1, 1, 1, '#f6faff', { seed: 401, lump: 0.08, freq: 2.4, ws: 20, hs: 15, vary: 0.04 })];
  // packed-on snow clumps, pebbles and a twig it picked up on the way down
  fxSphereDirs(16).forEach((d, i) => {
    if (i % 4 === 1) P.push(fxStick(GK.blob(0.1, 0.07, 0.1, '#6b6478', { seed: 410 + i, lump: 0 }), d, 0.98));
    else P.push(fxStick(GK.blob(0.3, 0.16, 0.3, i % 2 ? '#ffffff' : '#e6eef9', { seed: 420 + i }), d, 0.93));
  });
  const twig = new THREE.Vector3(0.5, 0.6, 0.62).normalize();
  P.push(fxStick(GK.at(GK.cyl(0.035, 0.05, 0.9, '#7a5238', { segs: 5, lump: 0 }), 0, 0.45, 0), twig, 0.9));
  P.push(fxStick(GK.at(GK.cyl(0.025, 0.03, 0.35, '#7a5238', { segs: 4, lump: 0 }), 0.1, 0.25, 0, 0, 0, -0.7), twig, 1.15));
  return GK.merge(P);
});
const BOULDER_GEO = memo(() => {
  const P = [GK.blob(1, 0.95, 1, '#9a8f9e', { seed: 431, lump: 0.22, freq: 1.4, ws: 16, hs: 12, vary: 0.08 })];
  fxSphereDirs(12).forEach((d, i) => {
    if (i % 3 === 0 && d.y > -0.2) P.push(fxStick(GK.blob(0.34, 0.08, 0.28, '#7fb069', { seed: 440 + i }), d, 0.96));
    else if (i % 2) P.push(fxStick(GK.blob(0.36, 0.1, 0.3, '#b3a9b6', { seed: 450 + i }), d, 0.92));
  });
  return GK.merge(P);
});
const MAGMA_ROCK_GEO = memo(() => GK.blob(1, 0.95, 1, '#4a3a52', { seed: 461, lump: 0.24, freq: 1.4, ws: 16, hs: 12, vary: 0.08 }));
// glowing cracks and hot spots, half sunk into a magma boulder
const MAGMA_GLOW_GEO = memo(() => {
  const P = [];
  fxSphereDirs(10).forEach((d, i) => P.push(fxStick(GK.blob(0.34 - (i % 3) * 0.06, 0.05, 0.08 + (i % 2) * 0.05, '#ff8a3d', { seed: 470 + i, lump: 0 }), d, 0.97)));
  return GK.merge(P);
});

// ---- penguin (pose space: the belly's centre at the origin, feet at y = -0.9) ----
const PENGUIN_GEO = memo(() => {
  const ink = '#2f3350', cream = '#fffaf0', beak = '#ffb347';
  const P = [
    GK.blob(0.66, 0.8, 0.62, ink, { seed: 451 }),
    GK.at(GK.blob(0.46, 0.64, 0.5, cream, { seed: 452 }), 0.26, -0.1, 0),
    GK.at(GK.blob(0.5, 0.46, 0.5, ink, { seed: 453 }), 0.04, 0.72, 0),
    GK.at(GK.blob(0.34, 0.3, 0.4, cream, { seed: 454 }), 0.27, 0.68, 0),
    GK.at(GK.cone(0.13, 0.42, beak, { seed: 455 }), 0.68, 0.64, 0, 0, 0, -Math.PI / 2),
    // a red scarf with a tail flapping behind
    GK.at(GK.torus(0.44, 0.1, '#e8483f', { seed: 459 }), 0.03, 0.36, 0, Math.PI / 2),
    GK.at(GK.box(0.14, 0.44, 0.2, '#e8483f', { seed: 460 }), -0.44, 0.12, 0.22, 0, 0, 0.35),
    GK.at(GK.cone(0.18, 0.32, ink, { seed: 461 }), -0.62, -0.62, 0, 0, 0, Math.PI / 2 + 0.4),
  ];
  for (const s of [-1, 1]) {
    P.push(GK.at(GK.blob(0.1, 0.13, 0.07, '#ffffff', { seed: 456, lump: 0 }), 0.53, 0.82, s * 0.15));
    P.push(GK.at(GK.blob(0.05, 0.08, 0.04, '#1e1426', { seed: 457, lump: 0 }), 0.6, 0.82, s * 0.15));
    P.push(GK.at(GK.blob(0.08, 0.05, 0.05, '#ff9fb4', { seed: 458, lump: 0 }), 0.52, 0.6, s * 0.27));
  }
  return GK.merge(P);
});
const PENGUIN_FLIPPER_GEO = memo(() => GK.at(GK.blob(0.13, 0.42, 0.24, '#2f3350', { seed: 462 }), 0, -0.34, 0));
const PENGUIN_FOOT_GEO = memo(() => GK.at(GK.blob(0.26, 0.07, 0.15, '#ffb347', { seed: 463, lump: 0.02 }), 0.1, 0, 0));

// ---- skier: a fluffy puffball critter in a bobble hat and goggles ----
const SKIER_LOOKS = [
  { fur: '#fff6ea', suit: '#ff6f91', hat: '#58b4ff', pom: '#ffffff', ski: '#ffd166' },
  { fur: '#ffd6a8', suit: '#58b4ff', hat: '#ffd166', pom: '#ff6f91', ski: '#e8483f' },
  { fur: '#d9c8f0', suit: '#7ddc6f', hat: '#e8483f', pom: '#fff6ea', ski: '#58b4ff' },
];
function skierGeo(L) {
  return fxGeo('skier' + L.fur, () => {
    const at = GK.at.bind(GK);
    const P = [];
    for (const s of [-1, 1]) {
      P.push(at(GK.blob(0.24, 0.15, 0.16, '#3b2a4a', { seed: 481 }), 0.06, 0.2, s * 0.22));
      P.push(at(GK.cyl(0.13, 0.15, 0.62, L.suit, { segs: 8, seed: 482 }), 0.02, 0.52, s * 0.21, 0, 0, -0.3));
      P.push(at(GK.cyl(0.08, 0.1, 0.55, L.suit, { segs: 7, seed: 483 }), 0.18, 1.05, s * 0.58, s * -0.5, 0, -0.9));
      P.push(at(GK.blob(0.14, 0.13, 0.13, L.hat, { seed: 484 }), 0.36, 0.95, s * 0.68));
      // goggles over two big eyes
      P.push(at(GK.blob(0.15, 0.13, 0.1, '#8fe6ff', { seed: 485, lump: 0 }), 0.56, 1.44, s * 0.17));
      P.push(at(GK.blob(0.05, 0.05, 0.03, '#ffffff', { seed: 486, lump: 0 }), 0.66, 1.49, s * 0.13));
    }
    P.push(at(GK.blob(0.62, 0.6, 0.6, L.fur, { seed: 487, lump: 0.12, freq: 4.5, vary: 0.08 }), -0.04, 1.3, 0));
    for (const d of fxSphereDirs(9)) if (d.y < 0.5) P.push(GK.at(fxStick(GK.blob(0.16, 0.12, 0.16, L.fur, { seed: 488 }), d, 0.56), -0.04, 1.3, 0));
    P.push(at(GK.blob(0.52, 0.34, 0.56, L.suit, { seed: 489 }), -0.04, 0.95, 0));
    P.push(at(GK.torus(0.6, 0.055, '#3b2a4a', { seed: 490, lump: 0 }), -0.02, 1.44, 0, Math.PI / 2, 0, 0.18));
    P.push(at(GK.blob(0.08, 0.06, 0.07, '#ff86b6', { seed: 491, lump: 0 }), 0.6, 1.24, 0));
    // bobble hat and scarf
    P.push(at(GK.blob(0.5, 0.38, 0.52, L.hat, { seed: 492 }), -0.06, 1.72, 0));
    P.push(at(GK.torus(0.48, 0.09, '#ffffff', { seed: 493 }), -0.06, 1.62, 0, Math.PI / 2));
    P.push(at(GK.blob(0.18, 0.18, 0.18, L.pom, { seed: 494, lump: 0.05 }), -0.12, 2.12, 0));
    P.push(at(GK.torus(0.46, 0.1, L.hat, { seed: 495 }), -0.04, 1.02, 0, Math.PI / 2));
    P.push(at(GK.box(0.12, 0.5, 0.2, L.hat, { seed: 496 }), -0.5, 0.86, -0.2, 0, 0, 0.6));
    return GK.merge(P);
  });
}
function skisGeo(L) {
  return fxGeo('skis' + L.ski, () => {
    const P = [];
    for (const s of [-1, 1]) {
      P.push(GK.at(GK.box(2.3, 0.07, 0.25, L.ski, { seed: 497, r: 0.03, lump: 0 }), -0.1, 0.05, s * 0.22));
      P.push(GK.at(GK.box(0.4, 0.07, 0.25, L.ski, { seed: 498, r: 0.03, lump: 0 }), 1.18, 0.15, s * 0.22, 0, 0, 0.55));
      P.push(GK.at(GK.box(0.36, 0.1, 0.28, '#3b2a4a', { seed: 499, r: 0.04, lump: 0 }), 0.05, 0.12, s * 0.22));
    }
    return GK.merge(P);
  });
}
// a ski pole held in a mitt: the grip at the origin, hanging down and back
const SKI_POLE_GEO = memo(() =>
  GK.merge([
    GK.at(GK.cyl(0.03, 0.03, 1.25, '#c9c3d6', { segs: 5, lump: 0 }), 0, -0.6, 0),
    GK.at(GK.torus(0.12, 0.025, '#3b2a4a', { seed: 500, lump: 0 }), 0, -1.12, 0, Math.PI / 2),
  ]),
);

// ---- cow ----
// Black patches on a white clay hide, from smooth noise.
function cowPatches(geo, seed) {
  const pos = geo.attributes.position, col = geo.attributes.color;
  const dark = new THREE.Color('#3b2a3a');
  for (let i = 0; i < pos.count; i++) {
    const n = noise3(pos.getX(i) * 1.15 + seed, pos.getY(i) * 1.3, pos.getZ(i) * 1.15 - seed);
    if (n > 0.6) col.setXYZ(i, dark.r, dark.g, dark.b);
  }
  return geo;
}
const COW_GEO = memo(() =>
  GK.merge([
    GK.at(cowPatches(GK.blob(1.32, 0.78, 0.8, '#fffaf0', { seed: 501, lump: 0.08 }), 3.1), 0, 1.75, 0),
    GK.at(GK.blob(0.32, 0.22, 0.3, '#ffb3c1', { seed: 502 }), -0.45, 1.02, 0),
    ...[[-0.3, 0.12], [-0.3, -0.12], [-0.58, 0.12], [-0.58, -0.12]].map(([x, z]) => GK.at(GK.cone(0.05, 0.16, '#ff9fb4', { seed: 503, segs: 5, lump: 0 }), x, 0.82, z, Math.PI)),
  ]),
);
// the head hinges at the neck (origin) and looks along +x
const COW_HEAD_GEO = memo(() => {
  const at = GK.at.bind(GK);
  const P = [
    at(cowPatches(GK.blob(0.5, 0.46, 0.44, '#fffaf0', { seed: 511 }), 7.7), 0.35, 0.1, 0),
    at(GK.blob(0.34, 0.28, 0.4, '#ffb3c1', { seed: 512 }), 0.78, -0.12, 0),
    at(GK.blob(0.16, 0.1, 0.2, '#8a5a3c', { seed: 513 }), 0.3, 0.52, 0),
    at(GK.torus(0.4, 0.06, '#e8483f', { seed: 514, lump: 0 }), 0, -0.15, 0, 0, Math.PI / 2, 0),
    at(GK.blob(0.15, 0.17, 0.15, '#ffd166', { seed: 515, lump: 0 }), 0.06, -0.58, 0),
  ];
  for (const s of [-1, 1]) {
    P.push(at(GK.blob(0.04, 0.05, 0.03, '#3b2a3a', { seed: 516, lump: 0 }), 1.1, -0.06, s * 0.13));
    P.push(at(GK.blob(0.09, 0.11, 0.06, '#ffffff', { seed: 517, lump: 0 }), 0.66, 0.24, s * 0.25));
    P.push(at(GK.blob(0.05, 0.07, 0.04, '#1e1426', { seed: 518, lump: 0 }), 0.72, 0.24, s * 0.26));
    P.push(at(GK.cone(0.09, 0.42, '#fff1d6', { seed: 519 }), 0.24, 0.52, s * 0.3, s * 0.65, 0, 0));
    P.push(at(GK.blob(0.1, 0.07, 0.3, '#fffaf0', { seed: 520 }), 0.18, 0.3, s * 0.52, s * -0.4, 0, 0));
    P.push(at(GK.blob(0.06, 0.05, 0.18, '#ffb3c1', { seed: 521, lump: 0 }), 0.22, 0.3, s * 0.55, s * -0.4, 0, 0));
  }
  return GK.merge(P);
});
// a leg hangs from its hip (origin) down to a dark hoof on the ground
const COW_LEG_GEO = memo(() =>
  GK.merge([
    GK.at(GK.cyl(0.2, 0.17, 1.05, '#fffaf0', { segs: 8, seed: 522 }), 0, -0.52, 0),
    GK.at(GK.cyl(0.19, 0.2, 0.18, '#3b2a3a', { segs: 8, seed: 523, lump: 0 }), 0, -1.08, 0),
  ]),
);
const COW_TAIL_GEO = memo(() =>
  GK.merge([
    GK.at(GK.cyl(0.04, 0.05, 0.9, '#fffaf0', { segs: 5, lump: 0 }), -0.12, -0.42, 0, 0, 0, -0.25),
    GK.at(GK.blob(0.11, 0.18, 0.11, '#3b2a3a', { seed: 524 }), -0.24, -0.92, 0),
  ]),
);

// ---- mole ----
const MOUND_GEO = memo(() => {
  const P = [GK.blob(1.45, 0.62, 1.45, '#9a6644', { seed: 531, lump: 0.14, vary: 0.08 })];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + 0.3;
    P.push(GK.at(GK.blob(0.26, 0.18, 0.24, i % 2 ? '#7a4b30' : '#b07a52', { seed: 532 + i }), Math.cos(a) * 1.4, 0.08, Math.sin(a) * 1.4));
  }
  P.push(GK.at(GK.blob(0.62, 0.1, 0.62, '#2a1a22', { seed: 545, lump: 0.03 }), 0, 0.56, 0));
  return GK.merge(P);
});
// the mole stands on its origin and looks along +x
const MOLE_GEO = memo(() => {
  const at = GK.at.bind(GK);
  const P = [
    at(GK.blob(0.58, 0.72, 0.56, '#7a6070', { seed: 551 }), 0, 0.72, 0),
    at(GK.blob(0.38, 0.5, 0.42, '#b89aa8', { seed: 552 }), 0.24, 0.62, 0),
    at(GK.blob(0.3, 0.2, 0.26, '#ffc2cf', { seed: 553 }), 0.52, 0.92, 0),
    at(GK.blob(0.12, 0.11, 0.12, '#ff6f91', { seed: 554, lump: 0 }), 0.8, 0.95, 0),
    at(GK.box(0.08, 0.13, 0.16, '#ffffff', { seed: 555, lump: 0, r: 0.03 }), 0.62, 0.74, 0),
    // a miner's helmet with a lamp
    at(GK.blob(0.5, 0.3, 0.5, '#ffd166', { seed: 556 }), -0.02, 1.38, 0),
    at(GK.torus(0.5, 0.06, '#ffd166', { seed: 557, lump: 0 }), -0.02, 1.3, 0, Math.PI / 2),
    at(GK.cyl(0.12, 0.12, 0.16, '#c9c3d6', { segs: 8, lump: 0 }), 0.42, 1.46, 0, 0, 0, -Math.PI / 2),
    at(GK.blob(0.1, 0.1, 0.1, '#fff3a8', { seed: 558, lump: 0 }), 0.52, 1.46, 0),
  ];
  for (const s of [-1, 1]) {
    P.push(at(GK.blob(0.055, 0.06, 0.04, '#1e1426', { seed: 559, lump: 0 }), 0.44, 1.12, s * 0.18));
    P.push(at(GK.blob(0.02, 0.02, 0.02, '#ffffff', { seed: 560, lump: 0 }), 0.48, 1.14, s * 0.17));
  }
  return GK.merge(P);
});
const MOLE_PAWS_GEO = memo(() => {
  const P = [];
  for (const s of [-1, 1]) {
    P.push(GK.at(GK.blob(0.16, 0.2, 0.12, '#ffc2cf', { seed: 561 }), 0.44, 0.66, s * 0.38));
    for (let c = -1; c <= 1; c++) P.push(GK.at(GK.cone(0.035, 0.14, '#ffffff', { seed: 562, segs: 4, lump: 0 }), 0.48, 0.86, s * 0.38 + c * 0.06));
  }
  return GK.merge(P);
});

// ---- geyser vent (for r = 2; scaled) and its column ----
function ventGeo(rock, cap, seed) {
  const P = [GK.at(GK.blob(1.35, 0.16, 1.35, '#2a2438', { seed, lump: 0.04 }), 0, 0.02, 0)];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + U.hash(seed + i) * 0.4, r = 1.5 + U.hash(seed + i * 7) * 0.25;
    const s = 0.4 + U.hash(seed + i * 3) * 0.25;
    P.push(GK.at(GK.blob(s, s * 0.75, s, rock, { seed: seed + i }), Math.cos(a) * r, s * 0.35, Math.sin(a) * r));
    if (cap) P.push(GK.at(GK.blob(s * 0.8, s * 0.25, s * 0.8, cap, { seed: seed + 20 + i }), Math.cos(a) * r, s * 0.82, Math.sin(a) * r));
  }
  return GK.merge(P);
}
const VENT_GEO = memo(() => ventGeo('#a69aa8', null, 571));
const VENT_SNOW_GEO = memo(() => ventGeo('#8c8fae', '#ffffff', 591));
const VENT_LAVA_GEO = memo(() => ventGeo('#3d2f48', '#ff8a3d', 611));
const VENT_POOL_GEO = memo(() => new THREE.CircleGeometry(1.25, 24).rotateX(-Math.PI / 2).translate(0, 0.14, 0));
const VENT_BULGE_GEO = memo(() => GK.blob(0.8, 1, 0.8, '#e8f8ff', { seed: 631, lump: 0.05 }));
// an open tube of height 1 standing on its base, flaring toward the top
const COLUMN_GEO = memo(() => new THREE.CylinderGeometry(0.85, 0.62, 1, 18, 6, true).translate(0, 0.5, 0));
const CROWN_GEO = memo(() => {
  const P = [GK.blob(0.9, 0.5, 0.9, '#ffffff', { seed: 641, lump: 0.12 })];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    P.push(GK.at(GK.blob(0.42, 0.36, 0.42, i % 2 ? '#ffffff' : '#e4f7ff', { seed: 642 + i }), Math.cos(a) * 0.75, 0.05 + (i % 3) * 0.12, Math.sin(a) * 0.75));
  }
  return GK.merge(P);
});

// ---- podoboo: an angry little fireball (unlit, vertex coloured) ----
const PODOBOO_GEO = memo(() => {
  const P = [
    GK.blob(0.9, 0.88, 0.9, '#ff7a2f', { seed: 651, lump: 0.1 }),
    GK.at(GK.blob(0.6, 0.6, 0.66, '#ffd166', { seed: 652 }), 0.38, 0.02, 0),
  ];
  for (const s of [-1, 1]) {
    P.push(GK.at(GK.blob(0.18, 0.24, 0.12, '#ffffff', { seed: 653, lump: 0 }), 0.82, 0.22, s * 0.26));
    P.push(GK.at(GK.blob(0.09, 0.13, 0.07, '#3b1a1a', { seed: 654, lump: 0 }), 0.92, 0.2, s * 0.24));
    P.push(GK.at(GK.box(0.06, 0.08, 0.3, '#3b1a1a', { seed: 655, lump: 0, r: 0.02 }), 0.86, 0.48, s * 0.25, s * 0.45, 0, 0));
  }
  return GK.merge(P);
});
// flames streaming back off it (along -x)
const PODOBOO_FLAME_GEO = memo(() => {
  const P = [];
  [[0, 0, 1.5, 0.5, '#ff8a3d'], [0.32, 0.25, 1.1, 0.32, '#ffb347'], [-0.3, 0.22, 1.0, 0.3, '#ff8a3d'], [0.1, -0.32, 1.0, 0.3, '#ffb347'], [0, 0, 1.0, 0.3, '#ffe066']].forEach(([y, z, len, r, col], i) => {
    P.push(GK.at(GK.cone(r, len, col, { seed: 656 + i, segs: 7 }), -0.75 - len / 2, y, z, 0, 0, Math.PI / 2));
  });
  return GK.merge(P);
});

// ---- bumper (for r = 1.3; scaled) ----
const BUMPER_GEO = memo(() => {
  const at = GK.at.bind(GK);
  const P = [
    at(GK.cyl(1.38, 1.5, 0.36, '#46506a', { segs: 22, seed: 661 }), 0, 0.18, 0),
    at(GK.cyl(1.02, 1.1, 1.3, '#eef4ff', { segs: 22, seed: 662 }), 0, 1.0, 0),
    at(GK.blob(1.12, 0.5, 1.12, '#ff6f91', { seed: 663 }), 0, 1.66, 0),
    at(GK.torus(1.02, 0.1, '#ffffff', { seed: 664, lump: 0 }), 0, 1.6, 0, Math.PI / 2),
    at(GK.blob(0.3, 0.22, 0.3, '#ffe066', { seed: 665 }), 0, 2.12, 0),
  ];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    P.push(at(GK.blob(0.08, 0.06, 0.08, '#c9c3d6', { seed: 666, lump: 0 }), Math.cos(a) * 1.3, 0.38, Math.sin(a) * 1.3));
  }
  return GK.merge(P);
});
const BUMPER_STUDS_GEO = memo(() => {
  const P = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    for (const y of [0.62, 1.38]) P.push(GK.at(GK.blob(0.15, 0.17, 0.15, (i + (y > 1 ? 1 : 0)) % 2 ? '#ff6f91' : '#ffd166', { seed: 667 + i, lump: 0 }), Math.cos(a) * 1.08, y, Math.sin(a) * 1.08));
  }
  return GK.merge(P);
});
const BUMPER_BAND_GEO = memo(() => GK.at(GK.torus(1.12, 0.13, '#ffffff', { seed: 668, lump: 0, ts: 32 }), 0, 1.0, 0, Math.PI / 2));

// ---- icicle: tip at y = 0, 2.6 long; the root it grows from has height 1 (scaled) ----
const ICICLE_GEO = memo(() =>
  GK.merge([
    GK.at(GK.cone(0.5, 2.6, '#e3f5ff', { seed: 681, segs: 9, lump: 0.05 }), 0, 1.3, 0, Math.PI),
    GK.at(GK.cone(0.16, 0.7, '#ffffff', { seed: 682, segs: 6, lump: 0 }), 0.3, 2.25, 0.18, Math.PI),
    GK.at(GK.cone(0.13, 0.5, '#cfeaff', { seed: 683, segs: 6, lump: 0 }), -0.28, 2.35, -0.2, Math.PI),
  ]),
);
const ICICLE_ROOT_GEO = memo(() => GK.at(GK.cyl(1.0, 0.5, 1, '#cfe9ff', { segs: 9, hsegs: 3, seed: 684, lump: 0.06 }), 0, 0.5, 0));
const ICICLE_SHADE_GEO = memo(() => new THREE.PlaneGeometry(3.2, 3.2).rotateX(-Math.PI / 2));

// ---- slalom pole: white and coloured bands, a flag near the top ----
function poleGeo(col) {
  return fxGeo('pole' + col, () => {
    const g = GK.at(GK.cyl(0.1, 0.12, 3.3, '#ffffff', { segs: 8, hsegs: 12, seed: 691, lump: 0 }), 0, 1.65, 0);
    const pos = g.attributes.position, c = g.attributes.color, k = new THREE.Color(col);
    for (let i = 0; i < pos.count; i++) if (Math.floor(pos.getY(i) / 0.55) % 2) c.setXYZ(i, k.r, k.g, k.b);
    return GK.merge([g, GK.at(GK.blob(0.15, 0.15, 0.15, col, { seed: 692, lump: 0 }), 0, 3.34, 0)]);
  });
}
// a flag hanging from the pole (origin) out to its side, with a white diamond
function poleFlagGeo(col) {
  return fxGeo('flag' + col, () =>
    GK.merge([
      GK.at(GK.box(0.05, 0.7, 0.95, col, { seed: 693, r: 0.02, lump: 0.01 }), 0, -0.36, 0.52),
      GK.at(GK.box(0.07, 0.3, 0.3, '#ffffff', { seed: 694, r: 0.02, lump: 0 }), 0, -0.36, 0.52, Math.PI / 4),
    ]),
  );
}
const POLE_BASE_GEO = memo(() => GK.blob(0.42, 0.14, 0.42, '#6b6478', { seed: 695 }));
const POLE_BASE_SNOW_GEO = memo(() => GK.blob(0.55, 0.2, 0.55, '#ffffff', { seed: 696 }));

// ---- boost ring (radius 1, scaled; facing along +x) ----
const RING_GEO = memo(() => {
  const g = GK.torus(1, 0.085, '#ffd166', { seed: 701, ts: 56, rs: 10, lump: 0.006 });
  const pos = g.attributes.position, c = g.attributes.color, orange = new THREE.Color('#ff9a3c');
  // stripes round the rim
  for (let i = 0; i < pos.count; i++) if (Math.floor(((Math.atan2(pos.getY(i), pos.getX(i)) / TAU + 1) * 20) % 2)) c.setXYZ(i, orange.r, orange.g, orange.b);
  return g.rotateY(Math.PI / 2);
});
// chaser bulbs on both faces of the rim
const RING_BULB_GEO = memo(() => {
  const P = [];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU;
    for (const z of [-0.085, 0.085]) P.push(GK.at(GK.blob(0.04, 0.04, 0.03, '#ffffff', { seed: 702, lump: 0 }), Math.cos(a) * 1.0, Math.sin(a) * 1.0, z));
  }
  return GK.merge(P).rotateY(Math.PI / 2);
});
const RING_HALO_GEO = memo(() => new THREE.RingGeometry(0.4, 1.6, 64, 1).rotateY(Math.PI / 2));
const RING_HALO_VERT = `
varying vec2 vP;
varying float vFogDepth;
void main() {
  vP = position.yz;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const RING_HALO_FRAG = `
uniform vec3 uColor;
uniform float uI;
uniform float uTime;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
varying vec2 vP;
varying float vFogDepth;
void main() {
  float d = length(vP);
  float rim = exp(-pow((d - 1.0) / 0.2, 2.0));
  // a faint shimmering film across the hole, rippling outward
  float film = smoothstep(1.0, 0.55, d) * (0.07 + 0.05 * sin(d * 16.0 - uTime * 5.0));
  float a = (rim * 0.8 + film) * uI;
#ifdef USE_FOG
  a *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
#endif
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

// ---- weather around each camera ----
const AMBIENT_LOOKS = {
  snow: { n: 1400, box: [110, 56, 110], drift: [0.7, -3.2, 0.35], sway: 1.3, size: 0.3, color: '#ffffff', opacity: 0.92 },
  pollen: { n: 520, box: [100, 40, 100], drift: [0.35, 0.22, 0.2], sway: 1.6, size: 0.2, color: '#fff3b0', opacity: 0.85, add: true },
  embers: { n: 620, box: [100, 50, 100], drift: [0.2, 2.2, 0.1], sway: 0.9, size: 0.22, color: '#ffa54a', opacity: 0.95, add: true },
};
const AMBIENT_VERT = `
uniform float uTime;
uniform vec3 uBox;
uniform vec3 uDrift;
uniform float uSway;
uniform float uSize;
uniform float uScale;
attribute float aSeed;
varying float vA;
varying float vFogDepth;
void main() {
  vec3 p = position + uDrift * uTime;
  p.x += sin(uTime * 0.9 + aSeed * 6.3) * uSway;
  p.z += cos(uTime * 0.7 + aSeed * 4.1) * uSway;
  // wrap into the box centred on the camera drawing this view
  vec3 rel = mod(p - cameraPosition + 0.5 * uBox, uBox) - 0.5 * uBox;
  vec3 e = abs(rel) / (0.5 * uBox);
  vA = 1.0 - smoothstep(0.7, 1.0, max(max(e.x, e.y), e.z));
  vec4 mv = viewMatrix * vec4(cameraPosition + rel, 1.0);
  vFogDepth = -mv.z;
  gl_PointSize = uSize * (0.7 + 0.6 * fract(aSeed * 13.7)) * uScale / max(0.6, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const AMBIENT_FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
varying float vA;
varying float vFogDepth;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.3, 1.0, r)) * vA * uOpacity;
  vec3 col = uColor;
#ifdef USE_FOG
  float f = smoothstep(fogNear, fogFar, vFogDepth);
  col = mix(col, fogColor, f);
  a *= 1.0 - f * 0.8;
#endif
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

// ---- the cargo plane (plane space: x forward, the fuselage's centre at the origin) ----
const PLANE_ENGINES = [-14, -7, 7, 14];
const PLANE_GEO = memo(() => {
  const at = GK.at.bind(GK);
  const body = '#fff1d6', stripe = '#ff6f91', belly = '#c9b7e8', wing = '#f7f3ff', metal = '#b9addb';
  // fuselage: a fat clay tube with a round nose, its tail sweeping up over the open ramp
  const tube = at(GK.cyl(3.4, 3.4, 18, body, { segs: 22, hsegs: 8, seed: 801, lump: 0.1 }), 1, 0, 0, 0, 0, -Math.PI / 2);
  const nose = at(GK.blob(5.2, 3.4, 3.4, body, { seed: 802, lump: 0.1, ws: 22, hs: 16 }), 10, 0, 0);
  const tail = at(GK.cyl(1.2, 3.4, 12, body, { segs: 22, hsegs: 10, seed: 803, lump: 0.1 }), -14, 0, 0, 0, 0, Math.PI / 2);
  const tp = tail.attributes.position;
  for (let i = 0; i < tp.count; i++) tp.setY(i, tp.getY(i) + Math.max(0, -8 - tp.getX(i)) * 0.22);
  tail.computeVertexNormals();
  const cap = at(GK.blob(1.3, 1.25, 1.3, body, { seed: 804 }), -20, 2.64, 0);
  // a pink stripe down each side and a lilac belly
  for (const g of [tube, nose, tail, cap]) {
    const pos = g.attributes.position, c = g.attributes.color, s = new THREE.Color(stripe), b = new THREE.Color(belly);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) - Math.max(0, -8 - pos.getX(i)) * 0.22;
      if (y > -0.9 && y < -0.1 && pos.getX(i) > -18) c.setXYZ(i, s.r, s.g, s.b);
      else if (y < -2.7) c.setXYZ(i, b.r, b.g, b.b);
    }
  }
  const P = [tube, nose, tail, cap];
  // windscreen and portholes
  P.push(at(GK.box(1.3, 0.75, 4.2, '#3b4a6b', { seed: 805, r: 0.3 }), 12.1, 1.9, 0, 0, 0, -0.5));
  for (const x of [-5, -2, 1, 4, 7]) {
    for (const s of [-1, 1]) {
      P.push(at(GK.blob(0.42, 0.42, 0.14, '#ffffff', { seed: 806, lump: 0 }), x, 0.95, s * 3.36));
      P.push(at(GK.blob(0.3, 0.3, 0.12, '#7fb8ff', { seed: 807, lump: 0 }), x, 0.95, s * 3.42));
    }
  }
  // a high wing with four engines, nav lights at the tips
  P.push(at(GK.box(5.4, 0.62, 46, wing, { seed: 808, r: 0.28 }), 1.8, 3.4, 0));
  for (const s of [-1, 1]) {
    P.push(at(GK.box(5.5, 0.66, 2.6, stripe, { seed: 809, r: 0.2 }), 1.8, 3.4, s * 18.5));
    P.push(at(GK.blob(0.5, 0.4, 0.5, s < 0 ? '#e8483f' : '#7ddc6f', { seed: 810, lump: 0 }), 1.8, 3.4, s * 23.1));
  }
  for (const z of PLANE_ENGINES) {
    P.push(at(GK.cyl(1.0, 0.85, 4.6, metal, { segs: 14, seed: 811 }), 4.2, 2.4, z, 0, 0, -Math.PI / 2));
    P.push(at(GK.torus(0.95, 0.16, '#8a8396', { seed: 812, lump: 0 }), 6.45, 2.4, z, 0, Math.PI / 2, 0));
    P.push(at(GK.cone(0.42, 0.9, '#ffd166', { seed: 813, segs: 10 }), 7.6, 2.4, z, 0, 0, -Math.PI / 2));
  }
  // T-tail with a pink badge on the fin
  P.push(at(GK.box(5, 6.2, 0.55, body, { seed: 814, r: 0.4 }), -17.6, 6.2, 0, 0, 0, 0.35));
  for (const s of [-1, 1]) P.push(at(GK.blob(1.25, 1.25, 0.12, stripe, { seed: 815, lump: 0.02 }), -17.4, 6.3, s * 0.3));
  P.push(at(GK.box(3.6, 0.45, 15, wing, { seed: 816, r: 0.2 }), -19.6, 9.2, 0));
  // the hold gapes open under the tail and the ramp hangs down behind it
  P.push(at(GK.box(7.5, 0.5, 4.2, '#241a30', { seed: 817, r: 0.2, lump: 0 }), -12.5, -1.55, 0, 0, 0, -0.385));
  P.push(at(GK.box(6.2, 0.36, 4.6, '#d9cbb8', { seed: 818, r: 0.12 }), -18.7, -1.7, 0, 0, 0, 0.52));
  P.push(at(GK.box(0.5, 0.38, 4.6, '#ffd166', { seed: 819, r: 0.1, lump: 0 }), -21.3, -3.17, 0, 0, 0, 0.52));
  return GK.merge(P);
});
// three blades round a hub, spinning about x
const PROP_GEO = memo(() => {
  const P = [GK.at(GK.blob(0.36, 0.36, 0.36, '#ffd166', { seed: 820, lump: 0 }), 0.15, 0, 0)];
  for (let k = 0; k < 3; k++) P.push(GK.box(0.16, 2.5, 0.48, '#3b2a4a', { seed: 821 + k, r: 0.08, lump: 0 }).translate(0, 1.3, 0).rotateX((k / 3) * TAU));
  return GK.merge(P);
});
const PROP_DISC_GEO = memo(() => new THREE.CircleGeometry(2.6, 28).rotateY(Math.PI / 2));
