'use strict';
// Everything that moves in the 3D race besides the scenery: karts, clay particles (drift
// sparks, boost flames, dust, confetti), item boxes and coins (instanced), floating keys,
// shells / bananas / clay bombs, the hazards, rescue clouds and the player markers.

class ParticlePool {
  constructor(scene, max, mat, geo) {
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
    this.n = 0;
    this._m = new THREE.Matrix4();
    this._c = new THREE.Color();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._v = new THREE.Vector3();
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
      i++;
    }
    const m = this._m, s = this._s;
    for (let j = 0; j < this.n; j++) {
      const t = this.life[j] / this.maxLife[j];
      const sz = this.size[j] * (this.grow[j] ? 1 + (1 - t) * this.grow[j] : Math.sqrt(t));
      s.set(sz, sz, sz);
      this._v.set(this.p[j * 3], this.p[j * 3 + 1], this.p[j * 3 + 2]);
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

class RaceFX {
  constructor(world, race) {
    this.world = world;
    this.race = race;
    const scene = (this.scene = world.scene);
    this.clay = new ParticlePool(scene, 900, Clay3D.material({ vertexColors: false, wobble: 0, rim: 0.6, bump: false }));
    this.glow = new ParticlePool(scene, 700, new THREE.MeshBasicMaterial({ fog: true }), new THREE.IcosahedronGeometry(1, 0));
    this.models = race.karts.map((k) => this.kartModel(k));
    this.buildBoxes();
    this.buildCoins();
    this.buildKeys();
    this.buildHazards();
    this.objMeshes = new Map();
    this.ambient = this.buildAmbient();
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
    });
  }

  // ---------- karts ----------
  kartModel(k) {
    const m = KartModels.build(k.config);
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
  buildHazards() {
    this.hazardMeshes = this.race.items.hazards.map((h) => {
      const mesh = new THREE.Group();
      let body;
      if (h.kind === 'walker') body = new THREE.Mesh(WALKER_GEO(), this.world.clayMat);
      else if (h.kind === 'stomper') body = new THREE.Mesh(STOMPER_GEO(), this.world.clayMat);
      else if (h.kind === 'snowman') body = new THREE.Mesh(SNOWMAN_GEO(), this.world.clayMat);
      else if (h.kind === 'firebar') {
        body = new THREE.Group();
        body.add(new THREE.Mesh(GK.box(1.4, 1.4, 1.4, '#6b5f86', { seed: 4 }), this.world.clayMat));
        const fireMat = new THREE.MeshBasicMaterial({ color: 0xff8a3d, fog: true });
        const hot = new THREE.MeshBasicMaterial({ color: 0xffe066, fog: true });
        const n = Math.round(h.len / 1.1);
        for (let k = 1; k <= n; k++) {
          const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), k % 2 ? fireMat : hot);
          f.position.set(k * 1.1, 0, 0);
          body.add(f);
        }
        body.position.y = 1.2;
      }
      mesh.add(body);
      mesh.position.set(h.x, h.y, h.z);
      mesh.rotation.y = -h.head;
      this.scene.add(mesh);
      return { mesh, body, h };
    });
  }
  updateHazards(time) {
    for (const hm of this.hazardMeshes) {
      const h = hm.h;
      hm.mesh.visible = h.alive;
      if (h.kind === 'walker') {
        hm.mesh.position.set(h.x, h.y, h.z);
        const step = Math.floor(time * CFG.boilFps);
        hm.body.rotation.z = (step % 2 ? 0.12 : -0.12);
        hm.body.rotation.y = h.face > 0 ? -Math.PI / 2 : Math.PI / 2;
        hm.body.position.y = Math.abs(Math.sin(time * 8)) * 0.15;
      } else if (h.kind === 'stomper') {
        hm.body.position.y = (h.lift || 0) + 0.05;
        const shake = h.warn ? (U.hash(Math.floor(time * 30)) - 0.5) * 0.15 : 0;
        hm.body.position.x = shake;
      } else if (h.kind === 'firebar') {
        hm.body.rotation.y = -(h.angle || 0) - hm.mesh.rotation.y;
      }
    }
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
    return g;
  }

  // ---------- ambient weather ----------
  buildAmbient() {
    const kind = this.world.theme.ambient;
    const n = kind === 'snow' ? 1600 : 700;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const b = this.race.track.bounds;
    const rnd = U.rng(9);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = b.minX + rnd() * (b.maxX - b.minX);
      pos[i * 3 + 1] = rnd() * 40;
      pos[i * 3 + 2] = b.minZ + rnd() * (b.maxZ - b.minZ);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const col = kind === 'snow' ? 0xffffff : kind === 'embers' ? 0xffa54a : 0xfff3b0;
    const mat = new THREE.PointsMaterial({ color: col, size: kind === 'snow' ? 0.35 : 0.22, map: glowTexture(), transparent: true, depthWrite: false, opacity: 0.9 });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    return { pts, kind, n, base: pos.slice(), h: 40 };
  }
  updateAmbient(time) {
    const a = this.ambient;
    const pos = a.pts.geometry.attributes.position;
    const fall = a.kind === 'snow' ? 3 : a.kind === 'embers' ? -2 : 0.4;
    for (let i = 0; i < a.n; i++) {
      const by = a.base[i * 3 + 1];
      let y = (by - time * fall) % a.h;
      if (y < 0) y += a.h;
      pos.array[i * 3] = a.base[i * 3] + Math.sin(time * 0.6 + i) * 1.2;
      pos.array[i * 3 + 1] = y - 4;
      pos.array[i * 3 + 2] = a.base[i * 3 + 2] + Math.cos(time * 0.5 + i * 1.3) * 1.2;
    }
    pos.needsUpdate = true;
  }

  // ---------- per frame ----------
  update(dt, time, events) {
    const race = this.race;
    for (const e of events) this.onEvent(e);
    const amt = CFG.particles;
    race.karts.forEach((k, i) => {
      const m = this.models[i];
      poseKart(m, k, time, dt);
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
      // boost flames
      if (k.boostT > 0 && Math.random() < amt) {
        const x = k.x - fx * 1.6, z = k.z - fz * 1.6;
        this.glow.spawn(x, k.y + 0.8, z, -fx * 6 + (Math.random() - 0.5) * 2, 1 + Math.random(), -fz * 6 + (Math.random() - 0.5) * 2, 0.35, Math.random() < 0.5 ? '#ffb347' : '#ffe066', 0.25, -2, 3);
      }
      // dust off-road
      const sp = Math.abs(k.vf);
      if (k.onGround && sp > 8 && (k.surface === 'offroad' || k.surface === 'mud') && Math.random() < 0.35 * amt) {
        const [x, y, z] = rear(Math.random() < 0.5 ? -1 : 1);
        this.clay.spawn(x, y, z, -fx * 2 + (Math.random() - 0.5) * 2, 1.5, -fz * 2 + (Math.random() - 0.5) * 2, 0.35, k.surface === 'mud' ? '#7a4b30' : this.world.theme.shoulder, 0.6, 3, 2, 1);
      }
      if (k.starT > 0 && Math.random() < amt) this.glow.spawn(k.x + (Math.random() - 0.5) * 2, k.y + Math.random() * 2, k.z + (Math.random() - 0.5) * 2, 0, 1, 0, 0.18, new THREE.Color().setHSL(Math.random(), 1, 0.65).getHex(), 0.5, 0, 1);
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
        m.marker.position.set(k.x, k.y + 3.4 + (k.key ? 1.2 : 0), k.z);
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
    this.updateHazards(time);
    this.updateObjects(time);
    this.updateAmbient(time);
    this.clay.update(dt);
    this.glow.update(dt);
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

  onEvent(e) {
    const k = e.kart;
    const rainbow = ['#ff6f91', '#ffb347', '#ffe066', '#7ddc6f', '#58b4ff', '#b48cff'];
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
        if (k) this.burst(this.clay, k.x, k.y + 0.2, k.z, 10, [this.world.theme.shoulder, '#e8dde8'], 4, 0.4, 0.6, 4);
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
        if (k && !k.bot) this.burst(this.glow, k.x, k.y + 2, k.z, 70, rainbow, 12, 0.25, 1.8, 8);
        break;
      case 'squash':
        if (e.a) this.burst(this.clay, e.a.x, e.a.y + 1, e.a.z, 18, ['#b8693e', '#ffffff'], 7, 0.4, 0.9, 14);
        break;
      case 'stomp':
        this.burst(this.clay, e.a.x, e.a.y + 0.3, e.a.z, 14, ['#9a8fb4', '#6b5f86'], 6, 0.5, 0.7, 10);
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Small textures and shared geometries (built once, lazily).
function memo(fn) {
  let v = null;
  return () => v || (v = fn());
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
