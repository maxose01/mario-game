'use strict';
// A clay photo studio for the menus: karts on turntables in the lobby, one big turntable in
// the garage, and a podium with confetti for the results. A warm key light casts soft
// real-time shadows (CFG.shadows) onto the floor and turntables; a lilac rim light picks the
// karts out of the backdrop.

class Showroom {
  constructor() {
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color('#3b2440');
    scene.fog = new THREE.Fog('#3b2440', 40, 120);
    scene.add(new THREE.HemisphereLight('#ffe9f3', '#5a3a6a', 1.1));
    const key = (this.key = new THREE.DirectionalLight('#fff1dc', 1.6));
    key.position.set(-6, 10, 8);
    // a small shadow box round the turntables and the podium
    const sh = key.shadow;
    sh.mapSize.set(1024, 1024);
    sh.bias = -0.0005;
    sh.normalBias = 0.03;
    Object.assign(sh.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 40 });
    sh.camera.updateProjectionMatrix();
    scene.add(key);
    const rim = new THREE.DirectionalLight('#b48cff', 0.8);
    rim.position.set(6, 4, -10);
    scene.add(rim);
    this.shade = new THREE.Color('#9a6ad8').multiplyScalar(0.5); // clay's tint in the shade
    this.mat = Clay3D.material({ vertexColors: true, wobble: 0.04, freq: 1.2 });
    // backdrop: a curved clay cyclorama with clouds pressed into it
    const parts = [];
    const cyc = new THREE.CylinderGeometry(40, 40, 30, 48, 6, true, Math.PI * 0.25, Math.PI * 1.5);
    cyc.scale(-1, 1, 1);
    GK.paint(cyc, '#6b4a7a', 0.06, 3);
    // vertical gradient on the backdrop
    const col = cyc.attributes.color, pos = cyc.attributes.position;
    const lo = new THREE.Color('#4f3260'), hi = new THREE.Color('#ff9fbf');
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = U.clamp((pos.getY(i) + 15) / 30, 0, 1);
      c.copy(lo).lerp(hi, Math.pow(t, 1.4));
      col.setXYZ(i, c.r, c.g, c.b);
    }
    parts.push(GK.at(cyc, 0, 13, 0));
    const rnd = U.rng(5);
    for (let k = 0; k < 12; k++) {
      const a = Math.PI * 0.35 + rnd() * Math.PI * 1.3;
      const r = 37;
      parts.push(GK.at(GK.blob(4 + rnd() * 3, 1.6 + rnd(), 1.2, '#fff6fa', { seed: k, lump: 0.6 }), Math.sin(a) * r, 8 + rnd() * 14, Math.cos(a) * r));
    }
    // floor
    const floor = GK.cyl(38, 38, 1, '#c9a1b0', { segs: 48, lump: 0.1, seed: 9 });
    parts.push(GK.at(floor, 0, -0.5, 0));
    this.add(GK.merge(parts), Clay3D.material({ vertexColors: true, wobble: 0, rim: 0.5, side: THREE.DoubleSide })).receiveShadow = true;
    this.camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.3, 300);
    this.slots = [];
    this.time = 0;
    this.mode = 'row';
    this.parts = new ParticlePool(scene, 300, new THREE.MeshBasicMaterial(), new THREE.IcosahedronGeometry(1, 0));
    this.confetti = false;
  }

  add(geo, mat) {
    const m = new THREE.Mesh(geo, mat);
    this.scene.add(m);
    return m;
  }

  dispose() {
    disposeScene(this.scene);
    this.key.dispose(); // its shadow map
  }

  clearSlots() {
    for (const s of this.slots) this.scene.remove(s.root);
    this.slots = [];
  }

  // list: [{config, color, label}] (null entries leave an empty turntable in 'row' mode)
  setLayout(mode, list) {
    this.mode = mode;
    this.clearSlots();
    const n = list.length;
    list.forEach((it, i) => {
      const root = new THREE.Group();
      let x = 0, y = 0, z = 0, s = 1;
      if (mode === 'row') {
        // four small turntables in the open band between the lobby's two cards
        x = (i - (n - 1) / 2) * 3.6;
        z = 0;
        s = 0.8;
      } else if (mode === 'podium') {
        const spots = [[0, 2.4, 0], [-5.2, 1.5, 0.6], [5.2, 0.8, 0.6]];
        if (i < 3) [x, y, z] = spots[i];
        else {
          x = (i - 3 - (n - 4) / 2) * 4;
          z = -6;
        }
      }
      // turntable / podium block
      let base;
      if (mode === 'podium' && i < 3) {
        base = GK.merge([
          GK.at(GK.box(4.6, y + 0.2, 4.2, ['#ffd84a', '#dfe6f2', '#f0a35e'][i], { seed: 40 + i, r: 0.3 }), 0, (y + 0.2) / 2 - 0.2, 0),
        ]);
      } else {
        const r = mode === 'row' ? 1.65 : 2.5;
        base = GK.at(GK.cyl(r, r + 0.15, 0.4, it && it.color ? it.color : '#8a6a9a', { segs: 28, seed: 30 + i }), 0, 0, 0);
      }
      const bm = new THREE.Mesh(base, this.mat);
      bm.receiveShadow = true;
      bm.castShadow = mode === 'podium';
      root.add(bm);
      root.position.set(x, 0, z);
      let kart = null;
      if (it) {
        kart = KartModels.build(it.config, { shadow: false });
        kart.group.position.y = mode === 'podium' && i < 3 ? y : 0.2;
        kart.group.scale.setScalar(s);
        kart.group.traverse((o) => {
          if (o.isMesh) o.castShadow = o.receiveShadow = true;
        });
        root.add(kart.group);
      } else {
        const q = new THREE.Mesh(GK.blob(0.7, 0.9, 0.7, '#8a6a9a', { seed: 77 + i }), this.mat);
        q.position.y = 1.2;
        q.castShadow = true;
        root.add(q);
      }
      this.scene.add(root);
      this.slots.push({ root, kart, item: it, spin: i * 0.7 + (mode === 'podium' ? -0.6 : 0) });
    });
    this.confetti = mode === 'podium';
    this.frame();
  }

  frame() {
    const c = this.camera;
    if (this.mode === 'single') {
      c.position.set(4.2, 3.2, 8.6);
      c.lookAt(1.9, 0.9, 0);
    } else if (this.mode === 'podium') {
      // the results card sits on the right, so look a little to its left
      c.position.set(4.5, 6.2, 17);
      c.lookAt(4.0, 2.0, 0);
    } else {
      // the karts sit in the gap between the join card and the race settings
      c.position.set(0, 7, 19.5);
      c.lookAt(0, -0.4, 0);
    }
  }

  update(dt) {
    this.time += dt;
    Clay3D.update(this.time);
    for (const s of this.slots) {
      if (this.mode === 'podium') s.root.rotation.y = Math.sin(this.time * 0.5 + s.spin) * 0.25 - 0.5;
      else s.root.rotation.y = this.time * (this.mode === 'single' ? 0.45 : 0.35) + s.spin;
      if (s.kart) {
        const boil = Math.floor(this.time * CFG.boilFps);
        s.kart.head.rotation.y = Math.sin(this.time * 0.8 + s.spin) * 0.3;
        s.kart.head.rotation.z = (U.hash(boil + s.spin * 10) - 0.5) * 0.05;
        s.kart.body.position.y = Math.abs(Math.sin(this.time * 2 + s.spin)) * 0.04;
        if (s.kart.special === 'rainbow') s.kart.paintMat.color.setHSL((this.time * 0.25) % 1, 0.75, 0.6);
      }
    }
    if (this.confetti && Math.random() < 0.6 * CFG.particles) {
      const cols = ['#ff6f91', '#ffd166', '#58b4ff', '#7ddc6f', '#c77dff', '#ffffff'];
      this.parts.spawn((Math.random() - 0.5) * 24, 16, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 2, -2, 0, 0.18, cols[(Math.random() * cols.length) | 0], 6, 0.6, 0.4);
    }
    this.parts.update(dt);
  }

  render(renderer) {
    const size = renderer.getSize(new THREE.Vector2());
    const shadows = !!CFG.shadows;
    if (renderer.shadowMap.enabled !== shadows) renderer.shadowMap.enabled = shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.key.castShadow = shadows;
    Clay3D.uniforms.uShade.value.copy(this.shade);
    renderer.setViewport(0, 0, size.x, size.y);
    this.camera.aspect = size.x / size.y;
    this.camera.updateProjectionMatrix();
    renderer.render(this.scene, this.camera);
  }
}
