'use strict';
// The race on screen: one chase camera per human (split screen for 2-4 players), cinematic
// cameras when nobody is driving (the title screen's attract mode) and for the intro (a sweep
// down the start straight, or the cargo-plane drop on a point-to-point run), and a HUD drawn in
// clay on a 2D canvas over the 3D view: item slot, coins and laps (or sections), position,
// minimap, standings, the countdown, banners and boost speed lines.
// The chase camera rolls with the road's banking (more on anti-gravity road), pulls back and
// widens while gliding, and kicks its field of view on boosts. Each view re-aims the sun's
// shadow box at its own kart right before it is drawn.

const Hud = {
  panel(ctx, x, y, w, h, r = 16) {
    ctx.fillStyle = 'rgba(52,30,66,0.42)';
    Clay.rrect(ctx, x, y + 3, w, h, r);
    ctx.fill();
    ctx.fillStyle = 'rgba(70,42,90,0.4)';
    Clay.rrect(ctx, x, y, w, h, r);
    ctx.fill();
  },
};

const PLACE_COLS = ['#ffd84a', '#dfe6f2', '#f0a35e'];
function ordinal(n) {
  return n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
}
// Speed-line tints per boost kind (anything else is a warm white).
const BOOST_COLS = { spin: '#8ff6ff', ring: '#ffd166', star: '#ffe066', rocket: '#9fd4ff' };

class RaceView {
  // humans: [{slot, idx (kart index)}] in slot order; empty = spectator / attract mode
  constructor(race, humans, opts = {}) {
    this.race = race;
    this.humans = humans;
    this.opts = opts;
    this.world = new World3D(race.track);
    this.fx = new RaceFX(this.world, race);
    this.views = humans.map((h) => Object.assign(this.makeCam(h.idx, h.slot), { touch: !!h.touch }));
    if (!this.views.length || opts.spectator) this.spectator = this.makeCam(0, -1);
    else if (this.views.length === 3) this.spectator = this.makeCam(0, -1);
    this.banners = new Map(); // per view index
    this.flash = 0;
    this.minimap = null; // baked map (reset to null to rebake, e.g. after a resize)
    this.vignette = null;
    this.time = 0;
    this.shotT = 0;
    this.shot = 0;
    this.sectionIntro = false;
    for (const v of this.views) this.snapCam(v);
    if (this.spectator) this.snapCam(this.spectator);
  }

  dispose() {
    this.fx.dispose();
    this.world.dispose();
  }

  makeCam(idx, slot) {
    const cam = new THREE.PerspectiveCamera(CFG.camFov, 16 / 9, 0.3, 1100);
    cam.layers.enable(0);
    for (let s = 0; s < MAX_PLAYERS; s++) if (s !== slot) cam.layers.enable(1 + s);
    return {
      cam, idx, slot, yaw: 0, pos: new THREE.Vector3(), look: new THREE.Vector3(), focus: new THREE.Vector3(),
      shake: 0, fov: CFG.camFov, rect: null, lastLap: 0,
      roll: 0, glide: 0, ag: 0, kick: 0, boost: 0, boostCol: '#fff2d6', flash: 0,
    };
  }
  kartOf(v) {
    return this.race.karts[v.idx];
  }
  snapCam(v) {
    const k = this.kartOf(v);
    v.yaw = k.head;
    v.roll = 0;
    v.glide = k.gliding ? 1 : 0;
    v.pos.set(k.x - Math.cos(k.head) * CFG.camDist, k.y + CFG.camHeight, k.z - Math.sin(k.head) * CFG.camDist);
    v.focus.set(k.x, k.y, k.z);
  }

  // ---------- layout ----------
  layout(w, h) {
    const n = this.views.length;
    const R = (x, y, ww, hh) => ({ x, y, w: ww, h: hh });
    let rects;
    if (n <= 1) rects = [R(0, 0, w, h)];
    else if (n === 2) rects = CFG.splitStacked ? [R(0, 0, w, h / 2), R(0, h / 2, w, h / 2)] : [R(0, 0, w / 2, h), R(w / 2, 0, w / 2, h)];
    else rects = [R(0, 0, w / 2, h / 2), R(w / 2, 0, w / 2, h / 2), R(0, h / 2, w / 2, h / 2), R(w / 2, h / 2, w / 2, h / 2)];
    this.views.forEach((v, i) => (v.rect = rects[i]));
    if (this.spectator) this.spectator.rect = n === 3 ? rects[3] : rects[0];
    return rects;
  }

  // ---------- per frame ----------
  update(dt, events) {
    this.time += dt;
    const race = this.race;
    for (const e of events) this.onEvent(e);
    Clay3D.update(this.time);
    this.world.update(this.time, race);
    const sky = this.world.sky3d;
    if (sky && sky.update) sky.update(this.time);
    this.fx.update(dt, this.time, events);
    for (const v of this.views) this.updateCam(v, dt);
    if (this.spectator) this.updateSpectator(this.spectator, dt);
    for (const [k, b] of this.banners) {
      b.t += dt;
      if (b.t > b.life) this.banners.delete(k);
    }
    // a point-to-point run names its first section once the GO! has cleared
    const secs = race.sections;
    if (race.p2p && secs && secs.length && !this.sectionIntro && race.state === 'race' && race.raceTime > 1.3) {
      this.sectionIntro = true;
      this.views.forEach((v, vi) => this.banner(vi, 'SECTION 1', '#fff3c4', 2.2, 54, secs[0].name.toUpperCase()));
    }
  }

  updateCam(v, dt) {
    const k = this.kartOf(v), race = this.race;
    if (race.state === 'intro') return this.introCam(v, dt);
    const back = k.ctl.back && !k.finished;
    let target = k.head - (k.drift || 0) * 0.22;
    if (back) target += Math.PI;
    if (k.finished && race.state !== 'race') target += Math.sin(this.time * 0.3) * 0.6 + 0.9; // victory lap swing
    let d = target - v.yaw;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    // gliding: a higher, further, calmer camera; anti-gravity: hugs the kart and leans harder
    const gl = (v.glide = U.approach(v.glide, k.gliding ? 1 : 0, dt * (k.gliding ? 1.5 : 2.2)));
    const agT = k.agBlend !== undefined ? k.agBlend : k.antigrav ? 1 : 0;
    const ag = (v.ag = U.approach(v.ag, agT, dt * 3));
    v.yaw += d * (back ? 1 : 1 - Math.exp(-CFG.camYawLag * (1 - gl * 0.45) * dt));
    const boosting = k.boostT > 0 || k.starT > 0;
    const dist = CFG.camDist + (boosting ? 0.7 : 0) + (k.finished ? 2 : 0) + gl * 2.8 - ag * 0.4;
    const height = CFG.camHeight + (k.finished ? 1 : 0) + gl * 1.9;
    // roll with the road's banking and sit "above" the kart in that rolled frame
    const roll = CFG.camRoll !== undefined ? CFG.camRoll : 1;
    const rollT = (back ? -1 : 1) * (k.bank || 0) * (0.5 + ag * 0.25) * (1 - gl) * roll;
    v.roll = U.lerp(v.roll, rollT, 1 - Math.exp(-6 * dt));
    const fx = Math.cos(v.yaw), fz = Math.sin(v.yaw);
    const su = Math.sin(v.roll), cu = Math.cos(v.roll);
    const want = new THREE.Vector3(k.x - fx * dist - fz * su * height, k.y + height * cu, k.z - fz * dist + fx * su * height);
    if (k.falling) want.set(v.pos.x, Math.max(v.pos.y, k.y + 4), v.pos.z);
    v.pos.lerp(want, back ? 1 : 1 - Math.exp(-CFG.camLag * dt));
    // keep the camera above the ground it hovers over
    const l = race.track.locate(v.pos.x, v.pos.z, v.pos.y, k.path, {});
    if (l && l.excess < 0) {
      const gy = race.track.groundY(l);
      if (gy !== -Infinity && v.pos.y < gy + 1.2) v.pos.y = gy + 1.2;
    }
    // look ahead along the road (further and lower while gliding, down the slope on descents)
    const ahead = CFG.camLook + gl * 4;
    const slope = Math.tan(U.clamp(k.slopePitch || 0, -0.6, 0.6)) * ahead * 0.6 * (1 - gl);
    v.look.set(k.x + fx * ahead, k.y + 1.1 - gl * 1.6 + slope, k.z + fz * ahead);
    v.kick = Math.max(0, v.kick - dt * 2.4);
    v.flash = Math.max(0, v.flash - dt * 2.5);
    const fovT = CFG.camFov + (boosting ? CFG.camBoostFov : 0) + Math.min(1, Math.abs(k.vf) / 30) * 4 + gl * 8 + ag * 3;
    v.fov = U.lerp(v.fov, fovT, 1 - Math.exp(-5 * dt));
    v.shake = Math.max(0, v.shake - dt * 2.2);
    const sh = v.shake * v.shake * CFG.camShake;
    v.cam.position.set(v.pos.x + (Math.random() - 0.5) * sh, v.pos.y + (Math.random() - 0.5) * sh, v.pos.z + (Math.random() - 0.5) * sh);
    v.cam.up.set(-fz * su, cu, fx * su);
    v.cam.lookAt(v.look);
    v.cam.fov = v.fov + v.kick * v.kick * 7;
    // speed lines while boosting
    v.boost = U.approach(v.boost, boosting && !k.finished ? 1 : 0, dt * (boosting ? 5 : 2.5));
    if (boosting) v.boostCol = BOOST_COLS[k.starT > 0 ? 'star' : k.boostKind] || '#fff2d6';
    // the sun's shadow box covers the road ahead of the kart
    v.focus.set(k.x + fx * 26, k.y, k.z + fz * 26);
  }

  introCam(v, dt) {
    const race = this.race, T = race.track, k = this.kartOf(v), c = v.cam;
    const intro = race.opts.intro || 1;
    const u = U.clamp(1 - race.introT / intro, 0, 1);
    const io = T.def.planeDrop && race.introOffset ? race.introOffset(k) : null;
    c.up.set(0, 1, 0);
    v.roll = 0;
    v.glide = 0;
    if (!io) {
      // sweep down the start straight towards the grid
      const p = T.main.point((T.startS || 0) + 60 - u * 70, 0);
      const e = U.easeInOut(u);
      c.position.set(U.lerp(p.x, k.x - Math.cos(k.head) * CFG.camDist, e), U.lerp(p.y + 16, k.y + CFG.camHeight, e), U.lerp(p.z, k.z - Math.sin(k.head) * CFG.camDist, e));
      v.look.set(k.x, k.y + 1, k.z);
      c.fov = CFG.camFov;
    } else {
      // cargo-plane drop: from the road just past the start line, look back up at the plane
      // coming in low over the grid and everyone tumbling out on their gliders, then crane up
      // over the gantry, ride down above your own kart and settle in behind it just as the
      // countdown starts
      const s0 = T.startS, main = T.main;
      if (!v.introSpot) {
        // a clear spot on the road (not inside an item box)
        const boxes = (race.items && race.items.boxes) || [];
        const hw = main.hw[main.indexAt(s0)];
        let best = null;
        for (const ds of [30, 24, 36, 18, 42]) {
          for (const f of [0.3, 0, -0.3, 0.6, -0.6]) {
            const q = main.point(s0 + ds, hw * f);
            if (!boxes.some((b) => Math.hypot(b.x - q.x, b.z - q.z) < 6)) {
              best = q;
              break;
            }
          }
          if (best) break;
        }
        v.introSpot = best || main.point(s0 + 30, hw * 0.3);
      }
      const spot = v.introSpot;
      const grid = main.point(s0 - 16, 0);
      const plane = io.plane || { x: grid.x, y: grid.yc + 42, z: grid.z };
      const ky = k.y + (io.y || 0);
      const fx = Math.cos(k.head), fz = Math.sin(k.head);
      const drop = U.clamp((u - 0.22) / 0.2, 0, 1) * 0.6;
      const aPos = new THREE.Vector3(spot.x, spot.y + 1.6, spot.z);
      const aLook = new THREE.Vector3(U.lerp(plane.x, k.x, drop), U.lerp(plane.y - 2, ky, drop), U.lerp(plane.z, k.z, drop));
      const e = U.easeInOut(U.clamp((u - 0.3) / 0.7, 0, 1));
      const D = U.lerp(15, CFG.camDist, e), H = U.lerp(7, CFG.camHeight, e);
      const bPos = new THREE.Vector3(k.x - fx * D, ky + H, k.z - fz * D);
      const bLook = new THREE.Vector3(k.x + fx * CFG.camLook * e, ky + 1.1 * e, k.z + fz * CFG.camLook * e);
      const w = U.easeInOut(U.clamp((u - 0.2) / 0.28, 0, 1));
      c.position.copy(aPos).lerp(bPos, w);
      c.position.y += Math.sin(w * Math.PI) * 14;
      v.look.copy(aLook).lerp(bLook, w);
      c.fov = U.lerp(56, CFG.camFov, w);
    }
    c.lookAt(v.look);
    v.pos.copy(c.position);
    v.yaw = k.head;
    v.fov = c.fov;
    v.focus.copy(v.look);
  }

  // Attract mode: cut between chase, side-tracking, overhead, trackside and high crane shots of
  // the pack.
  updateSpectator(v, dt) {
    const race = this.race;
    this.shotT += dt;
    if (this.shotT > 6.5) {
      this.shotT = 0;
      this.shot = (this.shot + 1) % 5;
      const order = race.order.filter((k) => !k.ghost);
      this.shotKart = order[Math.floor(Math.random() * Math.min(4, order.length))];
      v.trackside = null;
    }
    const k = this.shotKart || race.order[0] || race.karts[0];
    const c = v.cam;
    const fx = Math.cos(k.head), fz = Math.sin(k.head);
    let want, look = new THREE.Vector3(k.x, k.y + 1, k.z), cut = false;
    if (this.shot === 0) want = new THREE.Vector3(k.x - fx * (k.gliding ? 11 : 7), k.y + (k.gliding ? 5 : 3), k.z - fz * (k.gliding ? 11 : 7));
    else if (this.shot === 1) want = new THREE.Vector3(k.x - fz * 7 + fx * 2, k.y + 1.6, k.z + fx * 7 + fz * 2);
    else if (this.shot === 2) want = new THREE.Vector3(k.x - fx * 18, k.y + 22, k.z - fz * 18);
    else if (this.shot === 3) {
      if (!v.trackside) {
        const p = k.loc ? k.loc.path.point(k.loc.s + 45, (k.loc.hw + 3) * (Math.random() < 0.5 ? -1 : 1)) : { x: k.x + 20, y: k.y, z: k.z };
        v.trackside = new THREE.Vector3(p.x, p.y + 2.5, p.z);
      }
      want = v.trackside;
      cut = true;
    } else {
      // a crane high over the road ahead, looking back down at the pack (and the view)
      if (!v.trackside) {
        const p = k.loc ? k.loc.path.point(k.loc.s + 70, (k.loc.hw + 10) * (Math.random() < 0.5 ? -1 : 1)) : { x: k.x + 30, y: k.y, z: k.z };
        v.trackside = new THREE.Vector3(p.x, p.y + 34, p.z);
      }
      want = v.trackside;
      cut = true;
    }
    v.pos.lerp(want, cut ? 1 : 1 - Math.exp(-4 * dt));
    c.position.copy(v.pos);
    c.up.set(0, 1, 0);
    c.lookAt(look);
    c.fov = this.shot === 3 ? 45 : this.shot === 4 ? 52 : 60;
    v.focus.copy(look);
  }

  banner(vi, text, color, life = 1.6, size = 52, sub) {
    if (vi >= 0) this.banners.set(vi, { text, color, t: 0, life, size, sub });
  }

  onEvent(e) {
    const k = e.kart;
    const vi = k ? this.views.findIndex((v) => v.idx === k.idx) : -1;
    const v = vi >= 0 ? this.views[vi] : null;
    const say = (text, color, life, size, sub) => this.banner(vi, text, color, life, size, sub);
    switch (e.type) {
      case 'hit':
      case 'squish':
        if (v) v.shake = 1;
        break;
      case 'wall':
        if (v && e.a > 9) v.shake = Math.max(v.shake, Math.min(0.7, e.a / 25));
        break;
      case 'land':
        if (v && e.a > 10) v.shake = Math.max(v.shake, 0.35);
        break;
      case 'blast':
        for (const vv of this.views) {
          const kk = this.kartOf(vv);
          if (Math.hypot(kk.x - e.a.x, kk.z - e.a.z) < 25) vv.shake = Math.max(vv.shake, 0.8);
        }
        break;
      case 'ring':
        if (v) v.kick = 1;
        break;
      case 'spinboost':
        if (v) v.kick = Math.max(v.kick, 0.75);
        break;
      case 'glide':
        if (v) v.kick = Math.max(v.kick, 0.6);
        break;
      case 'lap':
        say(`LAP ${e.a}`, '#fff3c4');
        break;
      case 'finallap':
        say('FINAL LAP!', '#ff8fb1', 2);
        break;
      case 'section':
      case 'finalsection': {
        const sec = this.race.sections && this.race.sections[e.a - 1];
        const name = sec && sec.name ? sec.name.toUpperCase() : '';
        if (e.type === 'finalsection') say('FINAL SECTION!', '#ff8fb1', 2.6, 50, name);
        else say(`SECTION ${e.a}`, '#fff3c4', 2.4, 54, name);
        if (v) v.flash = 1; // a soft white flash through the checkpoint arch
        break;
      }
      case 'finish':
        if (k && !k.bot) say(k.place === 1 ? 'YOU WIN!' : ordinal(k.place) + '!', PLACE_COLS[k.place - 1] || '#fff3c4', 99, 66);
        break;
      case 'key':
        say('KEY! Find the locked gate', '#ffe066', 2.2, 34);
        break;
      case 'gate':
        say(e.a.name.toUpperCase() + '!', '#b48cff', 2.4, 40);
        break;
      case 'locked':
        say('Locked! You need a key', '#ffd6a8', 1.6, 32);
        break;
      case 'rocket':
        say('ROCKET START!', '#58b4ff', 1.2, 40);
        break;
      case 'stall':
        say('Too early!', '#ffd6a8', 1, 34);
        break;
      case 'trick':
        say('TRICK!', '#ffe066', 0.7, 34);
        break;
    }
  }

  // ---------- drawing ----------
  render(renderer) {
    const size = renderer.getSize(new THREE.Vector2());
    const W = size.x, H = size.y;
    this.layout(W, H);
    const n = this.views.length;
    // real-time sun shadows (Edit Panel: Real-time shadows): soft PCF, one map re-aimed per view
    const sky = this.world.sky3d;
    const shadows = !!CFG.shadows && !!(sky && sky.setShadows);
    const sm = renderer.shadowMap;
    if (sm.enabled !== shadows) sm.enabled = shadows;
    if (sm.type !== THREE.PCFSoftShadowMap) sm.type = THREE.PCFSoftShadowMap;
    if (sky && sky.setShadows) sky.setShadows(shadows, n);
    if (sky && sky.applyShade) sky.applyShade();
    // draw distances: scenery by the Edit Panel's draw distance (a little less with 3-4 views),
    // the far plane past the haze and the distant backdrops
    const fog = this.world.scene.fog;
    const far = U.clamp((fog ? fog.far : 520) + 160, 1100, 2400);
    const scenery = 300 * Math.max(0.6, CFG.fog > 0 ? 1 / Math.sqrt(CFG.fog) : 2) * (n >= 3 ? 0.8 : 1);
    renderer.setScissorTest(true);
    const list = this.views.slice();
    if (this.spectator) list.push(this.spectator);
    for (const v of list) {
      const r = v.rect;
      if (!r) continue;
      if (v === this.spectator && this.views.length && this.views.length !== 3) continue;
      // WebGL viewports start bottom-left
      const y = H - r.y - r.h;
      renderer.setViewport(r.x, y, r.w, r.h);
      renderer.setScissor(r.x, y, r.w, r.h);
      v.cam.aspect = r.w / r.h;
      v.cam.far = far;
      v.cam.updateProjectionMatrix();
      this.world.follow(v.cam);
      this.world.cullFor(v.cam, scenery);
      if (shadows) sky.shadowFollow(v.focus.x, v.focus.y, v.focus.z);
      renderer.render(this.world.scene, v.cam);
    }
    renderer.setScissorTest(false);
  }

  // HUD in logical units (VIEW_W x VIEW_H); px -> logical factor fx/fy.
  drawHUD(ctx, W, H) {
    const sx = VIEW_W / W, sy = VIEW_H / H;
    const race = this.race;
    const n = this.views.length;
    const intro = race.state === 'intro';
    this.views.forEach((v, i) => {
      const r = { x: v.rect.x * sx, y: v.rect.y * sy, w: v.rect.w * sx, h: v.rect.h * sy };
      if (!intro) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(r.x, r.y, r.w, r.h);
        ctx.clip();
        ctx.translate(r.x, r.y);
        const k = n === 1 ? 1 : n === 2 ? (CFG.splitStacked ? 0.72 : 0.74) : 0.6;
        ctx.scale(k, k);
        this.drawViewHUD(ctx, v, i, r.w / k, r.h / k, n);
        ctx.restore();
      }
      if (n > 1) {
        ctx.strokeStyle = SLOT_COLORS[v.slot];
        ctx.lineWidth = 4;
        Clay.rrect(ctx, r.x + 2, r.y + 2, r.w - 4, r.h - 4, 8);
        ctx.stroke();
      }
    });
    if (n > 1) {
      // dividers
      ctx.fillStyle = '#2b1838';
      if (n === 2 && !CFG.splitStacked) ctx.fillRect(VIEW_W / 2 - 3, 0, 6, VIEW_H);
      else if (n === 2) ctx.fillRect(0, VIEW_H / 2 - 3, VIEW_W, 6);
      else {
        ctx.fillRect(VIEW_W / 2 - 3, 0, 6, VIEW_H);
        ctx.fillRect(0, VIEW_H / 2 - 3, VIEW_W, 6);
      }
      if (!intro) {
        if (n >= 3) this.drawMinimap(ctx, VIEW_W / 2, VIEW_H / 2, 130, 130);
        else if (CFG.splitStacked) this.drawMinimap(ctx, VIEW_W / 2, VIEW_H / 2, 230, 110);
        else this.drawMinimap(ctx, VIEW_W / 2, VIEW_H / 2, 120, race.track.p2p ? 230 : 150);
      }
    }
    if (!n && this.opts.showMinimap) this.drawMinimap(ctx, 90, VIEW_H - 100, 140, 140);
    if (intro && n) this.drawTitleCard(ctx);
    if (race.state === 'countdown' || (race.state === 'race' && race.raceTime < 0.8)) this.drawCountdown(ctx);
  }

  drawViewHUD(ctx, v, i, w, h, n) {
    const race = this.race, k = this.kartOf(v);
    if (v.flash > 0) {
      ctx.fillStyle = `rgba(255,252,240,${0.35 * v.flash * v.flash})`;
      ctx.fillRect(0, 0, w, h);
    }
    this.speedLines(ctx, v, w, h);
    // with 3-4 views the shared minimap sits in the middle of the screen, so each quadrant
    // keeps its HUD on its outer edges: right-hand views are mirrored, top views put the
    // position at the top
    const right = n >= 3 && v.rect.x > 1, top = n >= 3 && v.rect.y < 1;
    const X = (x, wd = 0) => (right ? w - x - wd : x);
    // item slot
    this.itemSlot(ctx, X(24, 80), 18, k);
    if (k.key) {
      Hud.panel(ctx, X(112, 54), 26, 54, 54, 14);
      Icons.key(ctx, X(139), 50, 44);
    }
    // coins and laps, or the section of a point-to-point run with a progress bar
    const secs = race.p2p && race.sections && race.sections.length ? race.sections : null;
    const pw = secs ? 262 : 230;
    const cx0 = X(20, pw);
    Hud.panel(ctx, cx0, h - 66, pw, 48);
    Icons.coin(ctx, cx0 + 26, h - 42, 40);
    Clay.label(ctx, '× ' + k.coins, cx0 + 46, h - 42, 24, k.coins >= 10 ? '#ffe066' : '#fff8ec');
    if (secs) this.sectionMeter(ctx, cx0 + 106, h - 66, pw - 120, k, secs);
    else {
      Clay.label(ctx, 'LAP', cx0 + 112, h - 42, 15, '#ffe27a');
      Clay.label(ctx, `${Math.min(race.laps, Math.max(1, k.lap))}/${race.laps}`, cx0 + 148, h - 42, 24);
    }
    // position
    const pl = k.place;
    ctx.save();
    // touch racers have their buttons in the bottom-right corner: put the position beside them
    ctx.translate(right ? 92 : v.touch ? w - 300 : w - 92, top ? 70 : h - 64);
    const pop = k._placeT !== undefined && this.time - k._placeT < 0.3 ? 1 + (0.3 - (this.time - k._placeT)) : 1;
    ctx.scale(pop, pop);
    Clay.text(ctx, String(pl), -14, 0, 74, PLACE_COLS[pl - 1] || '#ffffff');
    Clay.text(ctx, ordinal(pl).slice(-2), 30, 14, 30, PLACE_COLS[pl - 1] || '#ffffff');
    ctx.restore();
    if (k._lastPlace !== pl) {
      k._lastPlace = pl;
      k._placeT = this.time;
    }
    // player tag in split screen
    if (n > 1) {
      Hud.panel(ctx, w / 2 - 80, 14, 160, 34, 14);
      Clay.label(ctx, `P${v.slot + 1} ${k.name}`.slice(0, 16), w / 2, 31, 18, SLOT_COLORS[v.slot], 'center');
    } else {
      // timer and standings
      Hud.panel(ctx, w - 176, 16, 160, 44);
      Clay.label(ctx, fmtTime(race.raceTime), w - 96, 38, 24, '#fff8ec', 'center');
      this.standings(ctx, w - 58, 82, k);
      if (race.track.p2p) this.drawMinimap(ctx, 96, h / 2 + 22, 150, 290);
      else this.drawMinimap(ctx, 96, h / 2 + 20, 150, 190);
    }
    // wrong way
    if (k.wrongT > 1.2 && !k.finished) {
      ctx.save();
      ctx.translate(w / 2, h * 0.32);
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.time * 8);
      Clay.text(ctx, 'WRONG WAY!', 0, 0, 48, '#ff8fb1');
      ctx.restore();
    }
    // banner (with an optional caption ribbon, e.g. the section's name)
    const b = this.banners.get(i);
    if (b) {
      const t = Math.min(1, b.t / 0.25);
      ctx.save();
      ctx.translate(w / 2, h * 0.3);
      const s = U.easeOutBack(t) * (b.t > b.life - 0.3 ? Math.max(0, (b.life - b.t) / 0.3) : 1);
      ctx.scale(s, s);
      Clay.text(ctx, b.text, 0, 0, b.size, b.color);
      if (b.sub) {
        ctx.font = `700 26px ${FONT}`;
        const sw = ctx.measureText(b.sub).width + 48;
        const sy = b.size * 0.62;
        Hud.panel(ctx, -sw / 2, sy, sw, 40, 18);
        Clay.label(ctx, b.sub, 0, sy + 20, 26, '#fff8ec', 'center');
      }
      ctx.restore();
    }
    if (k.falling && k.fallT > 0.5) Clay.label(ctx, 'Rescue cloud on its way…', w / 2, h * 0.62, 20, '#fff8ec', 'center');
    if (k.stallT > 0) Clay.label(ctx, 'Engine flooded!', w / 2, h * 0.62, 20, '#ffd6a8', 'center');
  }

  // "SECTION 2/3" with a bar of the whole run below it: ticks at the checkpoints and a pale
  // marker for the staff ghost.
  sectionMeter(ctx, x, y, w, k, secs) {
    const race = this.race, T = race.track;
    const N = secs.length, sec = U.clamp(k.section || 1, 1, N);
    Clay.label(ctx, 'SECTION', x, y + 17, 14, '#ffe27a');
    Clay.label(ctx, `${sec}/${N}`, x + 74, y + 18, 22);
    const goal = race.goal || T.lapLen || 1;
    const by = y + 34, bw = w;
    const at = (s) => x + U.clamp(s / goal, 0, 1) * bw;
    ctx.fillStyle = 'rgba(43,24,56,0.75)';
    Clay.rrect(ctx, x - 2, by - 2, bw + 4, 10, 5);
    ctx.fill();
    const prog = U.clamp((k.totalS || 0) / goal, 0, 1);
    if (prog > 0) {
      ctx.fillStyle = '#7ddc6f';
      Clay.rrect(ctx, x, by, Math.max(6, prog * bw), 6, 3);
      ctx.fill();
    }
    ctx.fillStyle = '#ffe27a';
    for (let j = 1; j < N; j++) ctx.fillRect(at(secs[j].s - T.startS) - 1, by - 3, 2, 12);
    for (const g of race.karts) {
      if (!g.ghost) continue;
      ctx.fillStyle = 'rgba(235,245,255,0.6)';
      ctx.beginPath();
      ctx.arc(at(g.totalS || 0), by + 3, 4, 0, TAU);
      ctx.fill();
    }
  }

  // Boost speed lines: thin streaks rushing out from the middle of the view, re-drawn on the
  // stop-motion beat, with a soft glow round the edges in the boost's colour (CFG.glow).
  speedLines(ctx, v, w, h) {
    const a = v.boost * (CFG.speedLines !== undefined ? CFG.speedLines : 1);
    if (!(a > 0.02)) return;
    const cx = w / 2, cy = h * 0.46, R = Math.hypot(w, h) * 0.55;
    const col = U.rgb(v.boostCol);
    ctx.save();
    for (let i = 0; i < 30; i++) {
      const seed = Clay.boil * 131 + i * 17 + v.slot * 7;
      if (U.hash(seed + 3) > 0.25 + a * 0.5) continue;
      const ang = (i / 30) * TAU + U.hash(seed) * 0.2;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const r0 = R * (0.5 + U.hash(seed + 1) * 0.28), r1 = R * 1.02;
      const wd = (1.2 + U.hash(seed + 2) * 2.6) * (0.6 + a * 0.4);
      ctx.fillStyle = `rgba(${Math.round(255 * 0.7 + col[0] * 0.3)},${Math.round(255 * 0.7 + col[1] * 0.3)},${Math.round(255 * 0.7 + col[2] * 0.3)},${0.28 * a})`;
      ctx.beginPath();
      ctx.moveTo(cx + ca * r0, cy + sa * r0);
      ctx.lineTo(cx + ca * r1 - sa * wd * 3, cy + sa * r1 + ca * wd * 3);
      ctx.lineTo(cx + ca * r1 + sa * wd * 3, cy + sa * r1 - ca * wd * 3);
      ctx.closePath();
      ctx.fill();
    }
    const g = CFG.glow !== undefined ? CFG.glow : 1;
    if (g > 0.01) {
      const grd = ctx.createRadialGradient(cx, cy, R * 0.45, cx, cy, R);
      grd.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},0)`);
      grd.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},${Math.min(0.4, 0.16 * a * g)})`);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }

  itemSlot(ctx, x, y, k) {
    ctx.fillStyle = 'rgba(52,30,66,0.5)';
    Clay.rrect(ctx, x, y + 4, 80, 76, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,248,236,0.9)';
    ctx.lineWidth = 4;
    Clay.rrect(ctx, x + 2, y, 76, 76, 18);
    ctx.stroke();
    let kind = k.item;
    if (k.roulette > 0) kind = ITEM_KINDS[Math.floor(this.time * 14) % ITEM_KINDS.length];
    if (kind) {
      ctx.save();
      if (k.roulette > 0) ctx.globalAlpha = 0.85;
      Icons.item(ctx, kind, x + 40, y + 38, 62);
      ctx.restore();
      if (k.item === 'triple' && k.itemN < 3 && !k.roulette) Clay.label(ctx, '×' + k.itemN, x + 66, y + 64, 16, '#fff8ec', 'center');
    }
  }

  // Standings down the right-hand side (staff ghosts never take a place).
  standings(ctx, x, y, me) {
    const order = this.race.order.filter((k) => !k.ghost);
    const rowH = 30;
    Hud.panel(ctx, x - 40, y - 18, 80, order.length * rowH + 10, 14);
    order.forEach((k, i) => {
      const yy = y + i * rowH;
      if (k === me) {
        ctx.fillStyle = 'rgba(255,248,236,0.25)';
        Clay.rrect(ctx, x - 37, yy - 14, 74, 28, 10);
        ctx.fill();
      }
      Clay.label(ctx, String(i + 1), x - 26, yy, 15, i < 3 ? PLACE_COLS[i] : '#fff8ec', 'center');
      Icons.head(ctx, k.config.character, x + 8, yy, 26);
      if (k.slot >= 0) {
        ctx.fillStyle = SLOT_COLORS[k.slot];
        ctx.beginPath();
        ctx.arc(x + 30, yy - 8, 5, 0, TAU);
        ctx.fill();
      }
    });
  }

  drawCountdown(ctx) {
    const race = this.race;
    let text, col;
    if (race.state === 'countdown') {
      const n = Math.ceil(race.count);
      if (n > 3) return;
      text = String(n);
      col = ['#7ddc6f', '#ffd166', '#ff6f91'][n - 1];
    } else {
      text = 'GO!';
      col = '#7ddc6f';
    }
    const frac = race.state === 'countdown' ? 1 - (race.count - Math.floor(race.count)) : race.raceTime / 0.8;
    const s = race.state === 'countdown' ? U.easeOutBack(Math.min(1, frac * 3)) : 1 + frac * 0.4;
    ctx.save();
    ctx.globalAlpha = race.state === 'countdown' ? 1 : Math.max(0, 1 - frac);
    ctx.translate(VIEW_W / 2, VIEW_H * 0.42);
    ctx.scale(s, s);
    Clay.text(ctx, text, 0, 0, 110, col);
    ctx.restore();
  }

  // The course's name card while the intro plays (slides in from the left, like a broadcast
  // caption): name, laps or sections, engine class and difficulty pips.
  drawTitleCard(ctx) {
    const race = this.race, def = race.track.def;
    const intro = race.opts.intro || 1;
    const since = intro - race.introT;
    const slide = (1 - U.easeOutBack(U.clamp(since / 0.5, 0, 1))) * 460 + (1 - U.clamp(race.introT / 0.35, 0, 1)) * 460;
    const name = (def.name || '').toUpperCase();
    const secs = race.p2p && race.sections ? race.sections.length : 0;
    const sub = (secs ? `POINT-TO-POINT · ${secs} SECTIONS` : `${race.laps} LAPS`) + ` · ${race.ccName || 150}cc`;
    ctx.save();
    ctx.translate(-slide, 0);
    ctx.font = `700 46px ${FONT}`;
    const nw = ctx.measureText(name).width;
    ctx.font = `700 19px ${FONT}`;
    const w = Math.max(nw, ctx.measureText(sub).width) + 70;
    const x = 34, y = VIEW_H - 150;
    Hud.panel(ctx, x - 20, y - 36, w, 116, 24);
    Clay.text(ctx, name, x, y, 46, '#fff3c4', { align: 'left' });
    Clay.label(ctx, sub, x + 2, y + 44, 19, '#ffd6e8');
    const diff = def.difficulty || 1;
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i < diff ? ['#7ddc6f', '#ffd166', '#ff9f43', '#ff6f91'][diff - 1] : 'rgba(255,248,236,0.25)';
      ctx.beginPath();
      ctx.arc(x + 8 + i * 22, y + 70, 7, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------- minimap ----------
  // How the map sits in a w x h box: circuits keep their orientation; a point-to-point run turns
  // so its long axis fills the box, reading from the start (top or left) to the finish.
  mapLayout(w, h) {
    const T = this.race.track, p = T.main;
    let rot = 0;
    if (T.p2p) {
      let mx = 0, mz = 0, m = 0;
      for (let i = 0; i < p.n; i += 4, m++) {
        mx += p.x[i];
        mz += p.z[i];
      }
      mx /= m;
      mz /= m;
      let sxx = 0, szz = 0, sxz = 0;
      for (let i = 0; i < p.n; i += 4) {
        const dx = p.x[i] - mx, dz = p.z[i] - mz;
        sxx += dx * dx;
        szz += dz * dz;
        sxz += dx * dz;
      }
      const axis = 0.5 * Math.atan2(2 * sxz, sxx - szz);
      const tall = h >= w;
      rot = (tall ? Math.PI / 2 : 0) - axis;
      const a = p.point(T.startS), b = p.point(T.finishS);
      const c = Math.cos(rot), s = Math.sin(rot);
      const along = (q) => (tall ? q.x * s + q.z * c : q.x * c - q.z * s);
      if (along(a) > along(b)) rot += Math.PI;
    }
    const c = Math.cos(rot), s = Math.sin(rot);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const q of T.paths) {
      for (let i = 0; i < q.n; i += 2) {
        const u = q.x[i] * c - q.z[i] * s, v = q.x[i] * s + q.z[i] * c;
        u0 = Math.min(u0, u);
        u1 = Math.max(u1, u);
        v0 = Math.min(v0, v);
        v1 = Math.max(v1, v);
      }
    }
    const sc = Math.min(w / Math.max(1, u1 - u0), h / Math.max(1, v1 - v0));
    return { c, s, sc, mu: (u0 + u1) / 2, mv: (v0 + v1) / 2 };
  }

  // Bake the roads (outline, anti-gravity stretches in cyan, side roads dashed), numbered
  // section ticks, the start line and the finish flag, at twice the HUD resolution.
  bakeMinimap(w, h) {
    const T = this.race.track, L = this.mapLayout(w, h);
    const S = 2;
    const c = Clay.makeCanvas((w + 40) * S, (h + 40) * S);
    const g = c.getContext('2d');
    g.scale(S, S);
    g.translate(w / 2 + 20, h / 2 + 20);
    const P = (x, z) => [(x * L.c - z * L.s - L.mu) * L.sc, (x * L.s + z * L.c - L.mv) * L.sc];
    const dir = (tx, tz) => [tx * L.c - tz * L.s, tx * L.s + tz * L.c];
    g.lineJoin = g.lineCap = 'round';
    const trace = (p, from, to) => {
      g.beginPath();
      let first = true;
      for (let i = from; i <= to; i += 2) {
        if (!p.closed && i >= p.n) break;
        const ii = p.wrap(i);
        const [x, y] = P(p.x[ii], p.z[ii]);
        if (first) g.moveTo(x, y);
        else g.lineTo(x, y);
        first = false;
      }
      if (p.closed && from === 0 && to >= p.n) g.closePath();
      g.stroke();
    };
    for (const [wd, col] of [[9, 'rgba(43,24,56,0.75)'], [5, '#fff6ea']]) {
      for (const p of T.paths) {
        g.lineWidth = p.branch ? wd - 2 : wd;
        g.strokeStyle = p.branch && col === '#fff6ea' ? (p.open ? '#e9dcff' : '#d7c3f0') : col;
        if (p.branch && !p.open) g.setLineDash(col === '#fff6ea' ? [4, 4] : []);
        trace(p, 0, p.n);
        g.setLineDash([]);
      }
    }
    // anti-gravity stretches
    g.strokeStyle = '#6fe8ff';
    g.lineWidth = 3;
    for (const p of T.paths) {
      for (let i = 0; i < p.n; i++) {
        if (!p.ag[i]) continue;
        let j = i;
        while (j + 1 < p.n && p.ag[j + 1]) j++;
        trace(p, i, j);
        i = j;
      }
    }
    // a little bar across the road at main-road s
    const across = (s, len, cols, wd) => {
      const pt = T.main.point(s, 0);
      const [x, y] = P(pt.x, pt.z);
      const [dx, dy] = dir(pt.tx, pt.tz);
      for (const [lw, col] of cols) {
        g.strokeStyle = col;
        g.lineWidth = lw + wd;
        g.beginPath();
        g.moveTo(x - dy * len, y + dx * len);
        g.lineTo(x + dy * len, y - dx * len);
        g.stroke();
      }
      return { x, y, nx: -dy, ny: dx };
    };
    const checker = (s) => {
      const q = across(s, 7, [[4, '#2b1838']], 2);
      for (let k = -2; k < 2; k++) {
        g.fillStyle = k % 2 ? '#2b1838' : '#ffffff';
        g.beginPath();
        g.arc(q.x + q.nx * (k + 0.5) * 3, q.y + q.ny * (k + 0.5) * 3, 1.6, 0, TAU);
        g.fill();
      }
      return q;
    };
    for (let i = 1; i < T.sections.length; i++) {
      const q = across(T.sections[i].s, 8, [[4, '#2b1838'], [1.5, '#ffe27a']], 0);
      Clay.label(g, String(i + 1), q.x + q.nx * 15, q.y + q.ny * 15, 11, '#ffe27a', 'center');
    }
    checker(T.startS || 0);
    if (T.p2p) {
      // the finish: a chequered flag on a pole
      const q = checker(T.finishS);
      g.strokeStyle = '#2b1838';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(q.x, q.y);
      g.lineTo(q.x, q.y - 16);
      g.stroke();
      for (let a = 0; a < 3; a++) {
        for (let b = 0; b < 2; b++) {
          g.fillStyle = (a + b) % 2 ? '#2b1838' : '#ffffff';
          g.fillRect(q.x + 1 + a * 3.4, q.y - 16 + b * 3.4, 3.4, 3.4);
        }
      }
    }
    return { c, key: w + 'x' + h, L };
  }

  // The baked map plus dots for racers (the staff ghost translucent), keys and gates.
  drawMinimap(ctx, cx, cy, w, h = w) {
    const key = w + 'x' + h;
    if (!this.minimap || this.minimap.key !== key) this.minimap = this.bakeMinimap(w, h);
    const mm = this.minimap, L = mm.L;
    const P = (x, z) => [cx + (x * L.c - z * L.s - L.mu) * L.sc, cy + (x * L.s + z * L.c - L.mv) * L.sc];
    ctx.drawImage(mm.c, cx - w / 2 - 20, cy - h / 2 - 20, w + 40, h + 40);
    const it = this.race.items;
    for (const key of it.keys) {
      if (!key.active) continue;
      const [x, y] = P(key.x, key.z);
      Icons.key(ctx, x, y, 16);
    }
    for (const g of it.gates) {
      const [x, y] = P(g.x, g.z);
      ctx.fillStyle = g.openT > 0 ? '#7ddc6f' : '#8a5a3c';
      ctx.fillRect(x - 4, y - 4, 8, 8);
    }
    const rank = (k) => (k.ghost ? 0 : k.slot >= 0 ? 2 : 1);
    const ks = this.race.karts.slice().sort((a, b) => rank(a) - rank(b));
    for (const k of ks) {
      const [x, y] = P(k.x, k.z);
      if (k.ghost) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = '#2b1838';
        ctx.beginPath();
        ctx.arc(x, y, 5.5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#e8f4ff';
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, TAU);
        ctx.fill();
        ctx.restore();
      } else if (k.slot >= 0) {
        ctx.fillStyle = '#2b1838';
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, TAU);
        ctx.fill();
        ctx.fillStyle = SLOT_COLORS[k.slot];
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, TAU);
        ctx.fill();
      } else {
        const ch = findPart('character', k.config.character);
        ctx.fillStyle = '#2b1838';
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = ch.col.skin;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, TAU);
        ctx.fill();
      }
    }
  }
}

// Film grain and vignette over a rect (logical units), like the side-scroller's post pass.
const Post = {
  vig: null,
  draw(ctx, rects) {
    if (CFG.vignette > 0) {
      if (!this.vig) {
        const c = Clay.makeCanvas(480, 270);
        const g = c.getContext('2d');
        const grd = g.createRadialGradient(240, 135, 270 * 0.38, 240, 135, 480 * 0.62);
        grd.addColorStop(0, 'rgba(40,20,50,0)');
        grd.addColorStop(1, 'rgba(40,20,50,0.85)');
        g.fillStyle = grd;
        g.fillRect(0, 0, 480, 270);
        this.vig = c;
      }
      ctx.globalAlpha = CFG.vignette;
      for (const r of rects) ctx.drawImage(this.vig, r.x, r.y, r.w, r.h);
      ctx.globalAlpha = 1;
    }
    if (CFG.grain > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, CFG.grain * 5);
      const ox = U.hash(Clay.boil * 3) * 192, oy = U.hash(Clay.boil * 7 + 1) * 192;
      ctx.translate(-ox, -oy);
      ctx.fillStyle = Clay.grainPattern(ctx, true);
      ctx.fillRect(0, 0, VIEW_W + 192, VIEW_H + 192);
      ctx.restore();
    }
  },
};
