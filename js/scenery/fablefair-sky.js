'use strict';
// 3D landmarks of Fable Fair's third lap, the Dream Skyway (browser only; see
// js/courses/fablefair.js): the sleeping moon the anti-gravity spiral winds around, and the
// columns of cloud the road stands on. Lumpy clay primitives, no files.
(() => {
  const at = GK.at.bind(GK);
  const PI = Math.PI;

  Object.assign(LANDMARKS, {
    // {seg, t, d, h, r, face: {seg, t}}: the Moon, asleep in a nightcap: a glowing, cratered ball with
    // closed eyes, a smile and rosy cheeks, d units to the side of the road (the middle of the
    // spiral), h above it. Its face turns toward the road spot named by face.
    moon(lm, x, y, z, head, parts) {
      const w = this.track.where(lm), p = w.path;
      const c = p.point(w.s, lm.d || 0), cy = p.point(w.s, 0).yc + (lm.h || 0);
      const R = lm.r || 20;
      const fw = lm.face ? this.track.where(lm.face) : w;
      const fp = fw.path.point(fw.s, 0);
      const face = Math.atan2(fp.z - c.z, fp.x - c.x);
      // the ball: cream, with darker pocks and a faint warm rim, unlit (the moon is the light)
      const geo = new THREE.SphereGeometry(R, 32, 22);
      const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
      const cream = new THREE.Color('#fff3c8'), shade = new THREE.Color('#eed9a0'), crater = new THREE.Color('#e4c887');
      const tmp = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i) / R, py = pos.getY(i) / R, pz = pos.getZ(i) / R;
        const n = noise3(px * 3.2 + 7, py * 3.2, pz * 3.2);
        const n2 = noise3(px * 7.5, py * 7.5 + 3, pz * 7.5);
        tmp.copy(cream).lerp(shade, U.clamp((n - 0.35) * 2.2, 0, 1));
        if (n2 > 0.72) tmp.lerp(crater, 0.75);
        col[i * 3] = tmp.r;
        col[i * 3 + 1] = tmp.g;
        col[i * 3 + 2] = tmp.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const ball = new THREE.Mesh(geo, this.keep(new THREE.MeshBasicMaterial({ vertexColors: true, fog: true })));
      ball.position.set(c.x, cy, c.z);
      this.scene.add(ball);
      this.keep(geo);
      this.anims.push((t) => {
        ball.rotation.y = Math.sin(t * 0.05) * 0.05;
      });
      // the face and the cap, in a flat frame at the ball's centre looking along +x
      const m = this.flatFrame(c.x, cy, c.z, face);
      const P = [];
      const dark = '#6a4fa8', rose = '#ff9fbf';
      for (const sd of [-1, 1]) {
        // a closed, sleeping eye: an arc of dark clay, and a rosy cheek
        const eye = GK.torus(R * 0.16, R * 0.022, dark, { arc: PI, ts: 14, rs: 5, seed: 20 + sd, lump: 0 });
        eye.rotateZ(PI); // the arc curves down: a happily shut eye
        eye.rotateY(-PI / 2);
        eye.translate(R * 0.9, R * 0.18, sd * R * 0.3);
        P.push(eye);
        P.push(at(GK.blob(R * 0.06, R * 0.11, R * 0.13, rose, { seed: 30 + sd, ws: 8, hs: 6, lump: 0.02 }), R * 0.92, -R * 0.08, sd * R * 0.46));
      }
      const smile = GK.torus(R * 0.15, R * 0.025, dark, { arc: PI * 0.8, ts: 14, rs: 5, seed: 40, lump: 0 });
      smile.rotateZ(PI + PI * 0.1);
      smile.rotateY(-PI / 2);
      smile.translate(R * 0.93, -R * 0.2, 0);
      P.push(smile);
      P.push(at(GK.blob(R * 0.05, R * 0.06, R * 0.04, '#e0b878', { seed: 41, ws: 6, hs: 5, lump: 0.02 }), R * 0.98, 0.02 * R, 0)); // a button nose
      // a floppy nightcap, striped, with a pom-pom, tipping over the back of its head
      const tilt = 1.0, ax = [-Math.sin(tilt), Math.cos(tilt)], B = [-R * 0.05, R * 0.8, R * 0.1];
      const cap = GK.cone(R * 0.62, R * 1.4, '#6a4fd0', { segs: 14, hsegs: 6, seed: 50, lump: R * 0.03 });
      cap.rotateZ(tilt);
      cap.translate(B[0] + ax[0] * R * 0.7, B[1] + ax[1] * R * 0.7, B[2]);
      P.push(cap);
      const ring = (rad, tube, col, seed, f) => {
        const g = GK.torus(rad, tube, col, { ts: 22, rs: 5, seed, lump: R * 0.01 });
        g.rotateX(PI / 2);
        g.rotateZ(tilt);
        g.translate(B[0] + ax[0] * R * 1.4 * f, B[1] + ax[1] * R * 1.4 * f, B[2]);
        P.push(g);
      };
      ring(R * 0.62, R * 0.09, '#ffffff', 51, 0);
      for (let k = 0; k < 3; k++) ring(R * 0.62 * (1 - (0.3 + 0.22 * k)), R * 0.035, '#ffe08a', 60 + k, 0.3 + 0.22 * k);
      P.push(at(GK.blob(R * 0.2, R * 0.2, R * 0.2, '#fff3d0', { seed: 52, ws: 8, hs: 6, lump: 0.05 }), B[0] + ax[0] * R * 1.4 - R * 0.08, B[1] + ax[1] * R * 1.4 - R * 0.05, B[2]));
      // (unlit like the ball, or the face would sit in the night's shade)
      const basic = this.matCache['moon-face'] || (this.matCache['moon-face'] = this.keep(new THREE.MeshBasicMaterial({ vertexColors: true, fog: true })));
      this.putAt(GK.merge(P), m, basic, { far: true, cast: false, receive: false, name: 'moon' });
      // a soft golden halo, breathing slowly, and a few sleepy sparkles
      this.glow(c.x, cy, c.z, R * 5.2, '#fff0b8', 1);
      this.glow(c.x, cy, c.z, R * 3.2, '#ffe9a0', 3);
    },

    // {seg, t, seg1, t1}: columns of cloud under a road over the void: every 16 units a stack of
    // soft puffs shrinking down into the sea of cloud
    cloudpiers(lm, x, y, z, head, parts) {
      const r = this.rangeOf(lm);
      if (!r) return;
      const p = this.track.main;
      const P = [];
      const v = {};
      for (let s = r.s0; s <= r.s1; s += 16) {
        const i = p.indexAt(s);
        const side = Math.floor(s / 16) % 2 ? 1 : -1;
        this.gp(p, i, side * (p.hw[i] * 0.55), -1.2, v);
        const ground = this.heightAt(v.x, v.z);
        const bottom = ground === null ? this.voidY + 4 : ground - 0.5;
        const h = v.y - bottom;
        if (h < 3) continue;
        const n = Math.max(3, Math.min(8, Math.round(h / 3.2)));
        for (let k = 0; k < n; k++) {
          const u = k / (n - 1), rr = 3.4 - u * 1.7 + (k % 2) * 0.4;
          P.push(at(GK.blob(rr, rr * 0.8, rr, k % 2 ? '#f4efff' : '#dcd4ff', { seed: Math.round(s) + k, ws: 9, hs: 6, lump: 0.35 }), v.x + (k % 2 ? 0.8 : -0.8), v.y - 1 - u * (h - 2), v.z + (k % 3 - 1) * 0.6));
        }
      }
      if (P.length) this.put(GK.merge(P), this.clayMat, { far: true, name: 'cloudpiers' });
    },
  });
})();
