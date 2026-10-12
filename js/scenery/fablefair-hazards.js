'use strict';
// Hazard models for Fable Fair (browser only; how they behave lives in items.js): the thorn hedge
// of the sleeping castle, the water jets of the canyon and the talking tree with its acorns.
// They register themselves in HAZARD_FX (js/fx3d.js), so this file loads after fx3d.js.
(() => {
  const at = GK.at.bind(GK);

  // ---- thorn hedge: a clump of dark bramble with cream thorns and a few red roses (r = 1.6) ----
  const THORN_GEO = memo(() => {
    const P = [];
    P.push(at(GK.blob(1.9, 1.35, 1.9, '#2a6544', { seed: 811, lump: 0.28 }), 0, 1.15, 0));
    P.push(at(GK.blob(1.25, 1.0, 1.25, '#34774f', { seed: 812, lump: 0.2 }), 0.65, 2.0, 0.35));
    P.push(at(GK.blob(1.1, 0.9, 1.1, '#245c3b', { seed: 813, lump: 0.2 }), -0.7, 2.05, -0.3));
    P.push(at(GK.blob(0.9, 0.7, 0.9, '#3a8656', { seed: 814, lump: 0.15 }), 0.1, 2.65, -0.2));
    // cream thorns poking out all over
    fxSphereDirs(16).forEach((d, i) => {
      if (d.y < -0.15) return;
      const g = GK.at(GK.cone(0.17, 0.75, '#f0e4b8', { segs: 5, seed: 820 + i, lump: 0 }), 0, 0.375, 0);
      P.push(at(fxStick(g, d, 1.55), 0, 1.5, 0));
    });
    // a few roses, and a bramble cane arching over the top
    [[1.2, 1.7, 0.9], [-1.1, 1.5, 1.0], [0.3, 2.9, 0.6], [-0.9, 2.4, -1.1]].forEach(([x, y, z], i) => {
      P.push(at(GK.blob(0.36, 0.3, 0.36, '#e0405a', { seed: 830 + i, lump: 0.04, ws: 7, hs: 5 }), x, y, z));
      P.push(at(GK.blob(0.18, 0.16, 0.18, '#ff8aa0', { seed: 840 + i, lump: 0, ws: 5, hs: 4 }), x * 1.04, y + 0.1, z * 1.04));
    });
    P.push(at(GK.torus(1.15, 0.09, '#4a3a2a', { seed: 850, lump: 0.02, arc: Math.PI, ts: 14, rs: 5 }), 0, 1.7, 0, 0, 0.8, 0));
    return GK.merge(P);
  });

  // ---- water jet ------------------------------------------------------------------------------
  // the nozzle: a sandstone block set into the canyon wall, a turquoise collar and a brass spout
  // pointing along +z (across the road to the right)
  const JET_NOZZLE_GEO = memo(() =>
    GK.merge([
      at(GK.box(2.8, 2.3, 1.9, '#cf9560', { seed: 861, r: 0.4 }), 0, 1.15, -0.5),
      at(GK.cyl(0.78, 0.78, 0.45, '#2d9cb8', { segs: 12, seed: 862, lump: 0.02 }), 0, 1.2, 0.6, Math.PI / 2, 0, 0),
      at(GK.cyl(0.48, 0.6, 0.9, '#e8b64a', { segs: 12, seed: 863, lump: 0.02 }), 0, 1.2, 1.0, Math.PI / 2, 0, 0),
      at(GK.torus(0.52, 0.1, '#fff3d6', { seed: 864, lump: 0 }), 0, 1.2, 1.45, 0, 0, 0),
    ]),
  );
  // the foam on the water across the strip the jet shoves karts over (it flickers up in the warning)
  const FOAM_TEX = memo(() => {
    const c = Clay.makeCanvas(64, 128);
    const g = c.getContext('2d');
    g.clearRect(0, 0, 64, 128);
    const rnd = U.rng(77);
    for (let i = 0; i < 38; i++) {
      const x = rnd() * 64, y = rnd() * 128, w = 2 + rnd() * 7, h = 8 + rnd() * 26;
      g.fillStyle = `rgba(255,255,255,${0.35 + rnd() * 0.5})`;
      Clay.rrect(g, x, y, w, h, w / 2);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
  // the stream: a flat oval hose arching from the nozzle (z = 0, 1.2 up) across `reach` units to
  // the water, `width` wide along the road; uv.y runs along it so the streaks flow downstream
  function jetHose(reach, width) {
    return fxGeo(`jet:${Math.round(reach)}:${Math.round(width * 10)}`, () => {
      const N = 18, M = 10, pos = [], uv = [], idx = [];
      const curve = (t) => [reach * t, 1.2 + 3.1 * 4 * t * (1 - t) - 1.0 * t]; // [z, y]
      for (let i = 0; i <= N; i++) {
        const t = i / N, [cz, cy] = curve(t), [nz, ny] = curve(Math.min(1, t + 0.02));
        const tz = nz - cz, ty = ny - cy, l = Math.hypot(tz, ty) || 1;
        const ux = 0, vz = -ty / l, vy = tz / l; // the curve's normal in the (z, y) plane
        const thick = 0.8 + 1.1 * Math.sin(Math.PI * Math.min(1, t * 1.1)); // fattest in the middle
        for (let j = 0; j <= M; j++) {
          const a = (j / M) * Math.PI * 2;
          const x = Math.cos(a) * (width / 2) * (0.35 + 0.65 * t), r = Math.sin(a) * thick * 0.5;
          pos.push(x + ux, cy + vy * r, cz + vz * r);
          uv.push(j / M, t * (reach / 6));
        }
      }
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < M; j++) {
          const a = i * (M + 1) + j, b = a + M + 1;
          idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    });
  }

  // ---- the talking tree ---------------------------------------------------------------------------
  // trunk, roots, canopy and the face's fixed parts, built with the face toward +z
  const TALKTREE_GEO = memo(() => {
    const P = [];
    P.push(at(GK.cyl(1.7, 2.5, 9.5, '#7a5236', { seed: 871, segs: 10, hsegs: 6, lump: 0.22 }), 0, 4.75, 0));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + 0.4;
      P.push(at(GK.blob(1.2, 0.7, 0.8, '#6a4630', { seed: 872 + k }), Math.cos(a) * 2.2, 0.35, Math.sin(a) * 2.2, 0, -a, 0));
    }
    // the canopy: a big dark crown, with a lighter top
    const leaf = ['#2f7a4c', '#256a40', '#2b7348', '#3a8656'];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      P.push(at(GK.blob(3.7, 2.7, 3.7, leaf[k % 4], { seed: 880 + k }), Math.cos(a) * 3.3, 10.2 + (k % 2) * 1.2, Math.sin(a) * 3.3));
    }
    P.push(at(GK.blob(4.2, 3.0, 4.2, '#3f9a5c', { seed: 890 }), 0, 12.6, 0));
    // the face: a long nose knot, rosy cheeks and bushy brows
    P.push(at(GK.blob(0.5, 0.65, 0.55, '#8a6040', { seed: 891 }), 0, 4.1, 2.55));
    for (const s of [-1, 1]) {
      P.push(at(GK.blob(0.62, 0.42, 0.3, '#d98a6a', { seed: 892, lump: 0.03 }), s * 1.18, 3.7, 2.2));
      P.push(at(GK.blob(0.78, 0.26, 0.4, '#4a3322', { seed: 893 + s, lump: 0.05 }), s * 0.85, 5.3, 2.12, 0, 0, s * -0.22));
    }
    return GK.merge(P);
  });
  const EYE_GEO = memo(() => GK.merge([at(GK.blob(0.5, 0.58, 0.28, '#ffffff', { seed: 901, lump: 0 }), 0, 0, 0), at(GK.blob(0.24, 0.3, 0.15, '#2b1838', { seed: 902, lump: 0 }), 0, 0, 0.2)]));
  const MOUTH_GEO = memo(() => at(GK.blob(0.95, 0.6, 0.3, '#2a1418', { seed: 903, lump: 0.02 }), 0, 0, 0));
  const TONGUE_GEO = memo(() => at(GK.blob(0.5, 0.2, 0.2, '#e8607a', { seed: 904, lump: 0 }), 0, -0.25, 0.1));
  const ACORN_GEO = memo(() =>
    GK.merge([
      at(GK.blob(0.4, 0.5, 0.4, '#b27a3e', { seed: 911, lump: 0.03 }), 0, -0.45, 0),
      at(GK.blob(0.46, 0.22, 0.46, '#6b4a2a', { seed: 912, lump: 0.03 }), 0, -0.08, 0),
      at(GK.cyl(0.05, 0.07, 0.3, '#4a3322', { seed: 913, segs: 5, lump: 0 }), 0, 0.12, 0),
    ]),
  );
  const RING_GEO = memo(() => new THREE.RingGeometry(0.72, 1, 36).rotateX(-Math.PI / 2));
  const BUBBLE_TEX = memo(() => {
    const c = Clay.makeCanvas(160, 128);
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#4a3322';
    g.lineWidth = 7;
    Clay.rrect(g, 8, 8, 144, 84, 34);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(52, 90);
    g.lineTo(34, 122);
    g.lineTo(84, 92);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#ffffff';
    g.fillRect(48, 86, 38, 8);
    g.font = `700 62px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#e8483f';
    g.fillText('!!', 80, 52);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });

  Object.assign(HAZARD_FX, {
    thorn: {
      tilt: false,
      build(fx, h) {
        const m = new THREE.Mesh(THORN_GEO(), fx.mats.clay);
        m.scale.setScalar((h.r || 1.6) / 1.6);
        return m;
      },
      bits: () => ['#2a6544', '#e0405a', '#f0e4b8'],
    },

    // a water jet on a canyon wall: bubbles at the nozzle while it gurgles, then a stream across
    jet: {
      keep: true,
      build(fx, h, hm) {
        const reach = 2 * (h.path.hw[h.path.indexAt(h.s)] || 10) + 2;
        hm.reach = reach;
        const body = new THREE.Group();
        const face = new THREE.Group(); // turned so that it sprays away from its wall
        face.rotation.y = h.side > 0 ? Math.PI : 0;
        body.add(face);
        hm.nozzle = new THREE.Mesh(JET_NOZZLE_GEO(), fx.mats.clay);
        face.add(hm.nozzle);
        hm.arc = new THREE.Mesh(jetHose(reach, h.width), WATER_COLUMN_MAT());
        hm.arc.position.set(0, 0, 1.5);
        hm.arc.renderOrder = 1;
        hm.arc.visible = false;
        face.add(hm.arc);
        // the foam across the strip: the shove's reach, readable on the water
        const foam = new THREE.Mesh(new THREE.PlaneGeometry(h.width, reach, 1, 1).rotateX(-Math.PI / 2).translate(0, 0.28, reach / 2 + 1.2), new THREE.MeshBasicMaterial({ map: FOAM_TEX(), transparent: true, opacity: 0, depthWrite: false, fog: true }));
        foam.renderOrder = 1;
        face.add(foam);
        hm.foam = foam;
        hm.foamTex = foam.material.map;
        return body;
      },
      update(fx, hm, h, time, dt) {
        const p = U.clamp(h.power || 0, 0, 1);
        // the stream shoots out as the power comes up, thick and streaky, and falls away again
        hm.arc.visible = p > 0.02;
        hm.arc.scale.set(1, 0.4 + 0.6 * p, 0.12 + 0.88 * Math.min(1, p * 1.7));
        hm.arc.material.map.offset.y = -time * 2.6;
        // the foam strip flickers up through the gurgle and holds while it blasts
        const pulse = 0.5 + 0.5 * Math.sin(time * (8 + 22 * h.warnU) + h.id);
        hm.foam.material.opacity = h.warn ? (0.1 + 0.34 * h.warnU) * (0.55 + 0.45 * pulse) : p * 0.55;
        hm.foam.material.map.offset.y = -time * 1.4;
        // the nozzle shudders while it gurgles
        hm.nozzle.scale.setScalar(h.warn ? 1 + 0.05 * Math.sin(time * 40 + h.id) * h.warnU : 1);
        if (!hm.near) return;
        const amt = CFG.particles, ax = -h.side * h.nx, az = -h.side * h.nz; // the way it sprays
        const nx = h.x + ax * 1.7, nz = h.z + az * 1.7, ny = h.y + 1.3;
        if (h.warn && Math.random() < (0.35 + 0.5 * h.warnU) * amt) {
          fx.glow.spawn(nx + (Math.random() - 0.5) * 0.4, ny, nz + (Math.random() - 0.5) * 0.4, ax * (1 + Math.random() * 2), 1.5 + Math.random() * 2, az * (1 + Math.random() * 2), 0.1 + Math.random() * 0.08, Math.random() < 0.5 ? '#e4f7ff' : '#9fdcff', 0.5, 14, 1);
        }
        if (p > 0.25) {
          // spray where the stream lands, spread along the strip (the road's direction is (nz, -nx))
          for (let i = 0; i < 2; i++) {
            if (Math.random() > 0.8 * amt) continue;
            const along = (Math.random() - 0.5) * h.width, t = 0.55 + Math.random() * 0.45, out = hm.reach * t + 1.5;
            fx.glow.spawn(h.x + ax * out + h.nz * along, h.y + 0.3, h.z + az * out - h.nx * along, (Math.random() - 0.5) * 2 + ax * 2, 2 + Math.random() * 3, (Math.random() - 0.5) * 2 + az * 2, 0.1 + Math.random() * 0.1, Math.random() < 0.5 ? '#ffffff' : '#bfeaff', 0.6, 12, 1);
          }
        }
      },
    },

    // a talking tree beside the road: it chatters, then lets its acorns drop on the marked spots
    acorntree: {
      keep: true,
      tilt: false,
      build(fx, h, hm) {
        const rh = hm.roadHead, c = Math.cos(rh), s = Math.sin(rh);
        const toward = (h.d || 0) > 0 ? -1 : 1; // the road is toward -z when the tree stands on the right
        const gy = (fx.world.heightAt(h.x, h.z) ?? h.y) - h.y; // the ground under the tree
        const body = new THREE.Group();
        // trunk, face and canopy
        const trunk = new THREE.Group();
        trunk.position.y = gy;
        trunk.rotation.y = toward < 0 ? Math.PI : 0;
        trunk.add(new THREE.Mesh(TALKTREE_GEO(), fx.mats.clay));
        hm.eyes = [-1, 1].map((sd) => {
          const e = new THREE.Mesh(EYE_GEO(), fx.mats.clay);
          e.position.set(sd * 0.85, 4.75, 2.12);
          trunk.add(e);
          return e;
        });
        hm.mouth = new THREE.Mesh(MOUTH_GEO(), fx.mats.clay);
        hm.mouth.position.set(0, 3.1, 2.34);
        hm.tongue = new THREE.Mesh(TONGUE_GEO(), fx.mats.clay);
        hm.tongue.position.set(0, 3.1, 2.4);
        trunk.add(hm.mouth, hm.tongue);
        hm.trunk = trunk;
        body.add(trunk);
        // a bough over every spot, with a leafy tuft at its tip, an acorn on it and the mark
        // on the road where the acorn lands
        const parts = [];
        hm.spots = h.spots.map((sp, i) => {
          const dx = sp.x - h.x, dz = sp.z - h.z;
          const lx = dx * c + dz * s, lz = -dx * s + dz * c, ly = sp.y - h.y;
          const top = ly + (h.ceil - ICICLE_LEN) + 1.5, from = [0, gy + 8.2, 0], to = [lx * 0.92, top, lz * 0.92];
          const len = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
          const bough = GK.cyl(0.2, 0.55, len, '#6a4630', { seed: 920 + i, segs: 6, lump: 0.08 });
          bough.translate(0, len / 2, 0);
          const dir = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]).normalize();
          bough.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
          bough.translate(from[0], from[1], from[2]);
          parts.push(bough);
          for (let k = 0; k < 3; k++) parts.push(at(GK.blob(1.2, 0.8, 1.2, ['#2f7a4c', '#3a8656', '#256a40'][k], { seed: 930 + i * 3 + k }), to[0] + (k - 1) * 0.8, to[1] + 0.4 + (k % 2) * 0.3, to[2] + (k - 1) * 0.5));
          const acorn = new THREE.Mesh(ACORN_GEO(), fx.mats.clay);
          const ring = new THREE.Mesh(RING_GEO(), new THREE.MeshBasicMaterial({ color: 0xffa94a, transparent: true, opacity: 0, depthWrite: false, fog: true }));
          ring.position.set(lx, ly + 0.14, lz);
          ring.scale.setScalar(h.r);
          ring.renderOrder = 1;
          const shade = new THREE.Mesh(ICICLE_SHADE_GEO(), new THREE.MeshBasicMaterial({ map: KartModels.shadowTexture(), transparent: true, opacity: 0, depthWrite: false, fog: true }));
          shade.position.set(lx, ly + 0.1, lz);
          shade.renderOrder = 1;
          body.add(acorn, ring, shade);
          return { acorn, ring, shade, lx, lz, ly, top };
        });
        body.add(new THREE.Mesh(GK.merge(parts), fx.mats.clay));
        // the speech bubble over the road side of the face
        hm.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: BUBBLE_TEX(), transparent: true, depthWrite: false, fog: false }));
        hm.bubble.scale.set(3.4, 2.7, 1);
        hm.bubble.position.set(0, gy + 7.3, toward * 3.2);
        hm.bubble.visible = false;
        body.add(hm.bubble);
        hm.gy = gy;
        return body;
      },
      update(fx, hm, h, time) {
        const talk = h.talk;
        // mouth: opens and shuts as it talks (faster as the acorns get close), smiles shut at rest
        const flap = talk ? 0.25 + 0.75 * Math.abs(Math.sin(time * (9 + 7 * h.talkU))) : 0.12;
        hm.mouth.scale.set(1 + (talk ? 0.12 : 0), flap, 1);
        hm.tongue.visible = talk && flap > 0.5;
        // eyes: wide when it talks, blinking now and then
        const blink = Math.sin(time * 0.7 + h.id * 2) > 0.985 ? 0.15 : 1;
        for (const e of hm.eyes) e.scale.set(1, (talk ? 1.18 : 1) * blink, 1);
        // the whole tree sways a little and shakes while it chatters
        hm.trunk.rotation.z = Math.sin(time * 0.9 + h.id) * 0.012 + (talk ? Math.sin(time * 26) * 0.012 : 0);
        hm.bubble.visible = talk;
        if (talk) {
          hm.bubble.position.y = hm.gy + 7.3 + Math.sin(time * 7) * 0.18;
          const q = 1 + 0.08 * Math.sin(time * 14);
          hm.bubble.scale.set(3.4 * q, 2.7 * q, 1);
        }
        h.spots.forEach((sp, i) => {
          const m = hm.spots[i];
          const hang = sp.state !== 'gone' && sp.grow > 0.02;
          m.acorn.visible = hang;
          // it hangs from the tuft, trembles in the chatter, falls and (grow) comes back
          const shake = sp.state === 'warn' ? (U.hash(Math.floor(time * 30) + i * 7) - 0.5) * 0.14 : 0;
          m.acorn.position.set(m.lx + shake, (sp.drop || 0) + m.ly + 0.95, m.lz + shake);
          m.acorn.scale.setScalar(0.3 + 0.7 * U.clamp(sp.grow, 0, 1));
          // the mark on the road: it appears with the first words and stays until the acorn splats
          const marked = sp.state === 'warn' || sp.state === 'fall' || (talk && sp.state === 'hang');
          const pulse = 0.5 + 0.5 * Math.sin(time * 9 + i);
          m.ring.material.opacity = marked ? (sp.state === 'fall' ? 0.85 : 0.4 + 0.35 * pulse * (0.4 + 0.6 * h.talkU)) : 0;
          m.ring.visible = marked;
          const fall = sp.state === 'fall' ? 1 - U.clamp(sp.drop / Math.max(0.1, h.ceil - ICICLE_LEN), 0, 1) : 0;
          m.shade.material.opacity = marked ? (sp.state === 'fall' ? 0.35 + 0.55 * fall : 0.18) : 0;
          m.shade.scale.setScalar(h.r * (0.5 + 0.5 * (sp.state === 'fall' ? fall : 0.35)));
        });
        if (talk && hm.near && Math.random() < 0.25 * CFG.particles) {
          const a = Math.random() * TAU;
          fx.clay.spawn(h.x + Math.cos(a) * 3.5, h.y + hm.gy + 9.5 + Math.random() * 2, h.z + Math.sin(a) * 3.5, 0, -1.4, 0, 0.13 + Math.random() * 0.08, Math.random() < 0.5 ? '#4f9a52' : '#8ac05a', 1.8, 2, 0.4, 0);
        }
      },
      bits: () => ['#7a5236', '#4f9a52'],
    },
  });
})();

// ---- looks for hazards that exist already (js/fx3d.js), for the dream lap: a troll in its mound (mole, look
// 'troll'), a falling star (icicle, look 'star') and a bouncy toadstool (bumper, look 'toadstool')
(() => {
  const at = GK.at.bind(GK);
  const PI = Math.PI;

  // ---- a troll's mound (hit radius 2.2): a mossy hump with ferns, stones and glowing toadstools, a dark hole on top
  const TROLL_MOUND_GEO = memo(() => {
    const P = [GK.blob(3.2, 1.4, 3.2, '#55805e', { seed: 901, lump: 0.3, vary: 0.08, ws: 12, hs: 7 })];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + 0.2, r = 2.9 + (i % 2) * 0.3, sz = 0.45 + (i % 3) * 0.2;
      P.push(at(GK.blob(sz, sz * 0.7, sz * 0.9, i % 2 ? '#7a7690' : '#8a86a2', { seed: 910 + i, lump: 0.1 }), Math.cos(a) * r, sz * 0.3, Math.sin(a) * r));
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.7, r = 2.3;
      P.push(at(GK.blob(1.0, 0.1, 0.22, '#58b87a', { seed: 930 + i, ws: 6, hs: 4 }), Math.cos(a) * r, 0.95, Math.sin(a) * r, 0, -a, 0.5));
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.3, r = 2.6;
      P.push(at(GK.cyl(0.07, 0.1, 0.4, '#f4ecd8', { segs: 5, hsegs: 1, lump: 0, seed: 940 + i }), Math.cos(a) * r, 0.9, Math.sin(a) * r));
      P.push(at(GK.blob(0.3, 0.17, 0.3, ['#e0589a', '#7a5ad8', '#3fc8b0', '#ffb347'][i], { seed: 950 + i, ws: 6, hs: 4 }), Math.cos(a) * r, 1.2, Math.sin(a) * r));
    }
    P.push(at(GK.blob(1.75, 0.16, 1.75, '#241a30', { seed: 960, lump: 0.04, ws: 10, hs: 4 }), 0, 1.3, 0));
    return GK.merge(P);
  });

  const moleFx = HAZARD_FX.mole, bumperFx = HAZARD_FX.bumper;
  HAZARD_FX.mole = Object.assign({}, moleFx, {
    build(fx, h, hm) {
      if (h.look !== 'troll') return moleFx.build(fx, h, hm);
      hm.troll = true;
      const body = new THREE.Group();
      body.scale.setScalar((h.r || 2.2) / 2.2);
      hm.mound = new THREE.Mesh(TROLL_MOUND_GEO(), fx.mats.clay);
      body.add(hm.mound);
      const t = new THREE.Group();
      t.add(new THREE.Mesh(FableKit.trollBust(h.id % 4), fx.mats.clay));
      for (const side of [-1, 1]) {
        const eye = fx.glowSprite(0xffe36a, 1.7); // eyes that shine in the dark
        eye.position.set(2.0, 5.95, side * 0.55);
        t.add(eye);
      }
      body.add(t);
      hm.mole = t;
      return body;
    },
    update(fx, hm, h, time, dt) {
      if (!hm.troll) return moleFx.update(fx, hm, h, time, dt);
      const up = U.clamp(h.up || 0, 0, 1);
      hm.mole.visible = up > 0.01;
      // it heaves itself up out of the hole, roars at the karts coming (faces down the road) and sinks back
      hm.mole.position.y = -6.9 + 6.9 * U.easeOutBack(up);
      hm.mole.rotation.y = PI + Math.sin(time * 1.7 + h.id) * 0.3 * up;
      hm.mole.rotation.z = Math.sin(time * 9 + h.id) * 0.05 * up;
      // the earth heaves and cracks before it comes
      const j = h.warn ? 0.2 : 0;
      hm.mound.position.set((U.hash(Math.floor(time * 24) + h.id * 7) - 0.5) * j, 0, (U.hash(Math.floor(time * 24) + h.id * 7 + 99) - 0.5) * j);
      hm.mound.scale.set(1, h.warn ? 1 + Math.sin(time * 27) * 0.09 : 1, 1);
      if (h.warn && hm.near && Math.random() < 0.5 * CFG.particles) {
        const a = Math.random() * TAU;
        fx.clay.spawn(h.x + Math.cos(a) * 1.4, h.y + 1.2, h.z + Math.sin(a) * 1.4, Math.cos(a) * 2, 3 + Math.random() * 3, Math.sin(a) * 2, 0.16 + Math.random() * 0.12, Math.random() < 0.5 ? '#55805e' : '#8a86a2', 0.7, 14, 1, 0);
      }
    },
    bits: (h) => (h.look === 'troll' ? ['#7d9378', '#55805e', '#ffe36a'] : moleFx.bits(h)),
  });

  // ---- a falling star (icicle, look 'star'): hangs high in the night sky, trembles and flashes, drops and bursts
  const FALL_STAR_GEO = memo(() => FableKit.star(1.5, '#ffd166', 1000));
  const icicleFx = HAZARD_FX.icicle;
  HAZARD_FX.icicle = Object.assign({}, icicleFx, {
    build(fx, h, hm) {
      if (h.look !== 'star') return icicleFx.build(fx, h, hm);
      hm.starry = true;
      const body = new THREE.Group();
      hm.spike = new THREE.Group();
      hm.spin = new THREE.Mesh(FALL_STAR_GEO(), fx.mats.glowClay); // unlit: it shines in the dark
      hm.spike.add(hm.spin);
      hm.glow = fx.glowSprite(0xffe08a, 11);
      hm.spike.add(hm.glow);
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
      if (!hm.starry) return icicleFx.update(fx, hm, h, time, dt);
      const ceil = h.ceil !== undefined ? h.ceil : 9, hang = ceil - ICICLE_LEN;
      const st = h.state || 'hang';
      const gone = st === 'gone' || h.alive === false;
      const g = U.clamp(h.grow !== undefined ? h.grow : 1, 0, 1);
      const drop = h.drop !== undefined ? h.drop : hang;
      hm.spike.visible = !gone && g > 0.02;
      hm.spike.position.set(0, drop + 1.5, 0);
      hm.spike.scale.setScalar(0.35 + 0.65 * g);
      // it spins lazily, then faster as it trembles and plummets
      hm.spin.rotation.y = time * (st === 'fall' ? 7 : st === 'warn' ? 3.5 : 0.9) + h.id;
      hm.spin.rotation.z = st === 'fall' ? time * 4 : Math.sin(time * 0.8 + h.id) * 0.2;
      if (st === 'warn') {
        const q = Math.floor(time * 30);
        hm.spike.position.x = (U.hash(q + h.id * 13) - 0.5) * 0.35;
        hm.spike.position.z = (U.hash(q + h.id * 13 + 50) - 0.5) * 0.35;
      } else {
        hm.spike.position.x = 0;
        hm.spike.position.z = 0;
      }
      const gl = CFG.glow !== undefined ? CFG.glow : 1;
      const flash = st === 'warn' ? 0.5 + 0.45 * Math.sin(time * 26) : st === 'fall' ? 1 : 0.5 + 0.12 * Math.sin(time * 2.4 + h.id);
      hm.glow.material.opacity = gl * (gone ? 0 : flash);
      hm.glow.scale.setScalar(st === 'fall' ? 15 : 11 + (st === 'warn' ? 2.5 : 0));
      // a comet's tail while it falls
      if (st === 'fall' && dt > 0 && Math.random() < 0.9 * CFG.particles) {
        fx.glow.spawn(h.x + (Math.random() - 0.5) * 0.8, h.y + drop + 1.5 + Math.random() * 2, h.z + (Math.random() - 0.5) * 0.8, 0, 2, 0, 0.18 + Math.random() * 0.12, Math.random() < 0.5 ? '#fff3b0' : '#cdb8ff', 0.6, 0, 1);
      }
      const fall = st === 'fall' ? 1 - U.clamp(drop / hang, 0, 1) : 0;
      hm.shade.material.opacity = st === 'warn' ? 0.28 + 0.14 * Math.sin(time * 18) : st === 'fall' ? 0.35 + 0.55 * fall : st === 'hang' ? 0.12 : 0;
      hm.shade.scale.setScalar(0.8 + 0.9 * fall + (st === 'warn' ? 0.15 : 0));
    },
    bits: (h) => (h.look === 'star' ? ['#fff3b0', '#ffd166', '#cdb8ff'] : icicleFx.bits(h)),
  });

  // ---- a bouncy toadstool (r = 1.3, scaled): a cream stem and a big spotted cap that squashes when you hit it
  const CAPS = ['#e0589a', '#7a5ad8', '#3fa8e0', '#ff9b3d', '#3fc8b0'];
  const toadCap = (i) => {
    const P = [at(GK.blob(1.75, 0.95, 1.75, CAPS[i], { seed: 971 + i, lump: 0.1, ws: 12, hs: 7 }), 0, 1.75, 0)];
    P.push(at(GK.blob(1.6, 0.2, 1.6, U.shade(CAPS[i], -0.25), { seed: 975 + i, lump: 0.05, ws: 12, hs: 4 }), 0, 1.35, 0));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + i, e = 0.3 + 0.5 * U.hash2(k, i, 9);
      P.push(at(GK.blob(0.34, 0.12, 0.34, '#fff6e0', { seed: 980 + k, ws: 6, hs: 4, lump: 0 }), Math.cos(a) * 1.7 * e, 1.75 + 0.95 * (1 - e * e) * 0.93, Math.sin(a) * 1.7 * e));
    }
    return GK.merge(P);
  };
  const TOAD_CAPS = CAPS.map((_, i) => memo(() => toadCap(i)));
  const TOAD_STEM_GEO = memo(() => GK.merge([
    at(GK.cyl(0.62, 0.9, 1.4, '#f4ecd8', { seed: 991, segs: 10, hsegs: 2, lump: 0.06 }), 0, 0.7, 0),
    at(GK.blob(1.25, 0.28, 1.25, '#5ea87a', { seed: 992, lump: 0.1, ws: 10, hs: 4 }), 0, 0.12, 0),
  ]));
  HAZARD_FX.bumper = Object.assign({}, bumperFx, {
    build(fx, h, hm) {
      if (h.look !== 'toadstool') return bumperFx.build(fx, h, hm);
      hm.toad = true;
      const body = new THREE.Group();
      body.scale.setScalar((h.r || 1.3) / 1.3);
      hm.squash = new THREE.Group();
      body.add(hm.squash);
      hm.squash.add(new THREE.Mesh(TOAD_STEM_GEO(), fx.mats.clay));
      hm.squash.add(new THREE.Mesh(TOAD_CAPS[h.id % CAPS.length](), fx.mats.clay));
      hm.glow = fx.glowSprite(0xffb0e8, 6);
      hm.glow.position.y = 1.6;
      body.add(hm.glow);
      return body;
    },
    update(fx, hm, h, time) {
      if (!hm.toad) return bumperFx.update(fx, hm, h, time);
      const p = U.clamp(h.pulse || 0, 0, 1), wob = p * Math.cos((1 - p) * 14);
      hm.squash.scale.set(1 + 0.32 * wob, 1 - 0.2 * wob, 1 + 0.32 * wob);
      const g = CFG.glow !== undefined ? CFG.glow : 1;
      hm.glow.material.opacity = g * (0.35 + 0.5 * p + Math.sin(time * 3 + h.id) * 0.07);
      hm.glow.scale.setScalar(6 * (1 + 0.5 * p));
    },
  });
})();
