'use strict';
// The race on screen: one chase camera per human (split screen for 2-4 players), cinematic
// cameras when nobody is driving (the title screen's attract mode), and a HUD drawn in clay
// on a 2D canvas over the 3D view: item slot, coins and laps, position, minimap, standings,
// the countdown and banners.

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
    this.minimap = null;
    this.vignette = null;
    this.time = 0;
    this.shotT = 0;
    this.shot = 0;
    for (const v of this.views) this.snapCam(v);
    if (this.spectator) this.snapCam(this.spectator);
  }

  dispose() {
    this.fx.dispose();
    this.world.dispose();
  }

  makeCam(idx, slot) {
    const cam = new THREE.PerspectiveCamera(CFG.camFov, 16 / 9, 0.3, 700);
    cam.layers.enable(0);
    for (let s = 0; s < MAX_PLAYERS; s++) if (s !== slot) cam.layers.enable(1 + s);
    return { cam, idx, slot, yaw: 0, pos: new THREE.Vector3(), look: new THREE.Vector3(), shake: 0, fov: CFG.camFov, rect: null, lastLap: 0 };
  }
  kartOf(v) {
    return this.race.karts[v.idx];
  }
  snapCam(v) {
    const k = this.kartOf(v);
    v.yaw = k.head;
    v.pos.set(k.x - Math.cos(k.head) * CFG.camDist, k.y + CFG.camHeight, k.z - Math.sin(k.head) * CFG.camDist);
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
    this.fx.update(dt, this.time, events);
    for (const v of this.views) this.updateCam(v, dt);
    if (this.spectator) this.updateSpectator(this.spectator, dt);
    for (const [k, b] of this.banners) {
      b.t += dt;
      if (b.t > b.life) this.banners.delete(k);
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
    v.yaw += d * (back ? 1 : 1 - Math.exp(-CFG.camYawLag * dt));
    const boosting = k.boostT > 0 || k.starT > 0;
    const dist = CFG.camDist + (boosting ? 0.7 : 0) + (k.finished ? 2 : 0);
    const want = new THREE.Vector3(k.x - Math.cos(v.yaw) * dist, k.y + CFG.camHeight + (k.finished ? 1 : 0), k.z - Math.sin(v.yaw) * dist);
    if (k.falling) want.set(v.pos.x, Math.max(v.pos.y, k.y + 4), v.pos.z);
    v.pos.lerp(want, back ? 1 : 1 - Math.exp(-CFG.camLag * dt));
    // keep the camera above the ground it hovers over
    const l = race.track.locate(v.pos.x, v.pos.z, v.pos.y, k.path, {});
    if (l && l.excess < 0) {
      const gy = race.track.groundY(l);
      if (gy !== -Infinity && v.pos.y < gy + 1.2) v.pos.y = gy + 1.2;
    }
    v.look.set(k.x + Math.cos(v.yaw) * CFG.camLook, k.y + 1.1, k.z + Math.sin(v.yaw) * CFG.camLook);
    const fovT = CFG.camFov + (boosting ? CFG.camBoostFov : 0) + Math.min(1, Math.abs(k.vf) / 30) * 4;
    v.fov = U.lerp(v.fov, fovT, 1 - Math.exp(-5 * dt));
    v.shake = Math.max(0, v.shake - dt * 2.2);
    const sh = v.shake * v.shake * CFG.camShake;
    v.cam.position.set(v.pos.x + (Math.random() - 0.5) * sh, v.pos.y + (Math.random() - 0.5) * sh, v.pos.z + (Math.random() - 0.5) * sh);
    v.cam.lookAt(v.look);
    v.cam.fov = v.fov;
  }

  introCam(v, dt) {
    const race = this.race;
    const t = U.clamp(1 - race.introT / (race.opts.intro || 1), 0, 1);
    const T = race.track;
    // sweep down the start straight towards the grid
    const p = T.main.point(60 - t * 70, 0);
    const k = this.kartOf(v);
    const e = U.easeInOut(t);
    v.cam.position.set(U.lerp(p.x, k.x - Math.cos(k.head) * CFG.camDist, e), U.lerp(p.y + 16, k.y + CFG.camHeight, e), U.lerp(p.z, k.z - Math.sin(k.head) * CFG.camDist, e));
    v.cam.lookAt(k.x, k.y + 1, k.z);
    v.pos.copy(v.cam.position);
    v.yaw = k.head;
    v.cam.fov = CFG.camFov;
  }

  // Attract mode: cut between chase, side-tracking, overhead and trackside shots of the pack.
  updateSpectator(v, dt) {
    const race = this.race;
    this.shotT += dt;
    if (this.shotT > 6.5) {
      this.shotT = 0;
      this.shot = (this.shot + 1) % 4;
      this.shotKart = race.order[Math.floor(Math.random() * Math.min(4, race.order.length))];
      v.trackside = null;
    }
    const k = this.shotKart || race.order[0] || race.karts[0];
    const c = v.cam;
    const fx = Math.cos(k.head), fz = Math.sin(k.head);
    let want, look = new THREE.Vector3(k.x, k.y + 1, k.z);
    if (this.shot === 0) want = new THREE.Vector3(k.x - fx * 7, k.y + 3, k.z - fz * 7);
    else if (this.shot === 1) want = new THREE.Vector3(k.x - fz * 7 + fx * 2, k.y + 1.6, k.z + fx * 7 + fz * 2);
    else if (this.shot === 2) want = new THREE.Vector3(k.x - fx * 18, k.y + 22, k.z - fz * 18);
    else {
      if (!v.trackside) {
        const p = k.loc ? k.loc.path.point(k.loc.s + 45, (k.loc.hw + 3) * (Math.random() < 0.5 ? -1 : 1)) : { x: k.x + 20, y: k.y, z: k.z };
        v.trackside = new THREE.Vector3(p.x, p.y + 2.5, p.z);
      }
      want = v.trackside;
    }
    v.pos.lerp(want, this.shot === 3 ? 1 : 1 - Math.exp(-4 * dt));
    c.position.copy(v.pos);
    c.lookAt(look);
    c.fov = this.shot === 3 ? 45 : 60;
  }

  onEvent(e) {
    const k = e.kart;
    const vi = k ? this.views.findIndex((v) => v.idx === k.idx) : -1;
    const v = vi >= 0 ? this.views[vi] : null;
    const say = (text, color, life = 1.6, size = 52) => {
      if (vi >= 0) this.banners.set(vi, { text, color, t: 0, life, size });
    };
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
      case 'lap':
        say(`LAP ${e.a}`, '#fff3c4');
        break;
      case 'finallap':
        say('FINAL LAP!', '#ff8fb1', 2);
        break;
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
      v.cam.updateProjectionMatrix();
      this.world.follow(v.cam);
      this.world.cullFor(v.cam, 300 * Math.max(0.6, CFG.fog > 0 ? 1 / Math.sqrt(CFG.fog) : 2));
      renderer.render(this.world.scene, v.cam);
    }
    renderer.setScissorTest(false);
  }

  // HUD in logical units (VIEW_W x VIEW_H); px -> logical factor fx/fy.
  drawHUD(ctx, W, H) {
    const sx = VIEW_W / W, sy = VIEW_H / H;
    const race = this.race;
    const n = this.views.length;
    this.views.forEach((v, i) => {
      const r = { x: v.rect.x * sx, y: v.rect.y * sy, w: v.rect.w * sx, h: v.rect.h * sy };
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.clip();
      ctx.translate(r.x, r.y);
      const k = n === 1 ? 1 : n === 2 ? (CFG.splitStacked ? 0.72 : 0.74) : 0.6;
      ctx.scale(k, k);
      this.drawViewHUD(ctx, v, i, r.w / k, r.h / k, n);
      ctx.restore();
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
      this.drawMinimap(ctx, VIEW_W / 2, VIEW_H / 2, n === 2 ? 120 : 130, true);
    }
    if (!n && this.opts.showMinimap) this.drawMinimap(ctx, 90, VIEW_H - 100, 140);
    if (race.state === 'countdown' || (race.state === 'race' && race.raceTime < 0.8)) this.drawCountdown(ctx);
  }

  drawViewHUD(ctx, v, i, w, h, n) {
    const race = this.race, k = this.kartOf(v);
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
    // coins & lap
    const cx0 = X(20, 230);
    Hud.panel(ctx, cx0, h - 66, 230, 48);
    Icons.coin(ctx, cx0 + 26, h - 42, 40);
    Clay.label(ctx, '× ' + k.coins, cx0 + 46, h - 42, 24, k.coins >= 10 ? '#ffe066' : '#fff8ec');
    Clay.label(ctx, 'LAP', cx0 + 112, h - 42, 15, '#ffe27a');
    Clay.label(ctx, `${Math.min(race.laps, Math.max(1, k.lap))}/${race.laps}`, cx0 + 148, h - 42, 24);
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
      this.drawMinimap(ctx, 96, h / 2 + 20, 150);
    }
    // wrong way
    if (k.wrongT > 1.2 && !k.finished) {
      ctx.save();
      ctx.translate(w / 2, h * 0.32);
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.time * 8);
      Clay.text(ctx, 'WRONG WAY!', 0, 0, 48, '#ff8fb1');
      ctx.restore();
    }
    // banner
    const b = this.banners.get(i);
    if (b) {
      const t = Math.min(1, b.t / 0.25);
      ctx.save();
      ctx.translate(w / 2, h * 0.3);
      const s = U.easeOutBack(t) * (b.t > b.life - 0.3 ? Math.max(0, (b.life - b.t) / 0.3) : 1);
      ctx.scale(s, s);
      Clay.text(ctx, b.text, 0, 0, b.size, b.color);
      ctx.restore();
    }
    if (k.falling && k.fallT > 0.5) Clay.label(ctx, 'Rescue cloud on its way…', w / 2, h * 0.62, 20, '#fff8ec', 'center');
    if (k.stallT > 0) Clay.label(ctx, 'Engine flooded!', w / 2, h * 0.62, 20, '#ffd6a8', 'center');
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

  standings(ctx, x, y, me) {
    const order = this.race.order;
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

  // Track outline baked once; dots for racers, keys and gates.
  drawMinimap(ctx, cx, cy, size, framed) {
    const T = this.race.track, b = T.bounds;
    const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) - 60;
    const sc = size / span;
    const mx = (b.minX + b.maxX) / 2, mz = (b.minZ + b.maxZ) / 2;
    const P = (x, z) => [cx + (x - mx) * sc, cy + (z - mz) * sc];
    if (!this.minimap || this.minimap.size !== size) {
      const c = Clay.makeCanvas(size * 2 + 40, size * 2 + 40);
      const g = c.getContext('2d');
      g.translate(size + 20 - cx, size + 20 - cy);
      g.scale(1, 1);
      g.lineJoin = g.lineCap = 'round';
      for (const [w, col] of [[9, 'rgba(43,24,56,0.75)'], [5, '#fff6ea']]) {
        for (const p of T.paths) {
          g.lineWidth = p.branch ? w - 2 : w;
          g.strokeStyle = p.branch && col === '#fff6ea' ? '#d7c3f0' : col;
          if (p.branch) g.setLineDash(col === '#fff6ea' ? [4, 4] : []);
          g.beginPath();
          for (let i = 0; i <= p.n; i += 2) {
            if (!p.closed && i >= p.n) break;
            const ii = p.wrap(i);
            const [x, y] = P(p.x[ii], p.z[ii]);
            if (i === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
          if (p.closed) g.closePath();
          g.stroke();
          g.setLineDash([]);
        }
      }
      // start line
      const [sx0, sy0] = P(T.main.x[0], T.main.z[0]);
      g.fillStyle = '#ff6f91';
      g.fillRect(sx0 - 4, sy0 - 4, 8, 8);
      this.minimap = { c, size, ox: cx - size - 20, oy: cy - size - 20 };
    }
    const mm = this.minimap;
    ctx.drawImage(mm.c, cx - size - 20, cy - size - 20);
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
    const ks = this.race.karts.slice().sort((a, b) => (a.slot >= 0) - (b.slot >= 0));
    for (const k of ks) {
      const [x, y] = P(k.x, k.z);
      if (k.slot >= 0) {
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
