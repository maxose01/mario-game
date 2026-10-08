'use strict';
// The sky over a course: lights, the sky dome with its sun and clouds, and distant scenery.
// Built by World3D (this.world) into its scene; follow(camera) keeps the dome centred.

class Sky3D {
  constructor(world) {
    this.world = world;
    this.theme = world.theme;
    this.def = world.def;
    this.scene = world.scene;
    this.buildLights();
    this.buildSky();
  }

  keep(o) {
    return this.world.keep(o);
  }

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
}
