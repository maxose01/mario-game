'use strict';
// Items, pickups and hazards (pure simulation).
// Item boxes roll a random item weighted by race position (catch-up luck); shells, bananas and
// clay bombs live as world objects; boost rings hang over jumps and glides; Mudlet walkers,
// stompers, fire bars, snowmen and a menagerie of moving obstacles are hazards; floating keys
// open the gates of the hidden routes. Staff ghosts touch none of it (rings aside).

const ITEM_KINDS = ['mushroom', 'triple', 'banana', 'green', 'red', 'bomb', 'star', 'coin'];
// Weights per position bucket (front of the pack .. back).
const ITEM_TABLE = [
  //mush trip ban grn red bomb star coin
  [3, 0, 32, 28, 3, 2, 0, 32],
  [12, 3, 22, 24, 16, 10, 0, 13],
  [16, 8, 12, 18, 24, 14, 2, 6],
  [18, 16, 6, 12, 26, 12, 7, 3],
  [16, 24, 2, 8, 24, 10, 14, 2],
  [12, 32, 0, 4, 20, 8, 24, 0],
];

// Hazards that block karts and stop shells.
const SOLID_HAZARDS = { snowman: 1, stomper: 1, cow: 1, bumper: 1, pole: 1, roller: 1 };
// How tall each hazard stands: a kart flying higher than this over it sails clear.
const HAZARD_TALL = { penguin: 1.6, skier: 2.2, cow: 2.6, mole: 1.6, bumper: 2.2, pole: 3.5 };
const ICICLE_LEN = 2.6; // length of a full-grown icicle

function rollItem(place, count, rnd) {
  const frac = count > 1 ? (place - 1) / (count - 1) : 0;
  const row = U.clamp(frac * (ITEM_TABLE.length - 1) * CFG.itemLuck, 0, ITEM_TABLE.length - 1);
  const r0 = Math.floor(row), r1 = Math.min(ITEM_TABLE.length - 1, r0 + 1), t = row - r0;
  const w = ITEM_TABLE[r0].map((a, i) => a + (ITEM_TABLE[r1][i] - a) * t);
  const total = w.reduce((a, b) => a + b, 0);
  let x = rnd() * total;
  for (let i = 0; i < w.length; i++) {
    x -= w[i];
    if (x <= 0) return ITEM_KINDS[i];
  }
  return 'mushroom';
}

class ItemSystem {
  constructor(race) {
    this.race = race;
    const T = (this.track = race.track);
    const O = T.objects;
    this.boxes = O.boxes.map((b) => ({ x: b.x, y: b.y, z: b.z, active: true, t: 0, spin: Math.random() * 6 }));
    this.coins = O.coins.map((c) => ({ x: c.x, y: c.y, z: c.z, active: true, t: 0 }));
    this.keys = O.keys.map((k) => ({ x: k.x, y: k.y, z: k.z, hover: k.hover, active: true, t: 0 }));
    this.gates = O.gates.map((g) => Object.assign({ openT: 0, anim: 0 }, g));
    // boost rings: flash lights up when someone flies through; hitAt = race.time per kart index
    this.rings = O.rings.map((r, i) => Object.assign({ id: i, flash: 0, hitAt: [] }, r));
    this.hazards = O.hazards.map((h, i) => this.makeHazard(h, i));
    this.objects = [];
    this.nextId = 1;
    this._pt = {};
    this._pose = {};
  }

  // A hazard's live state. Every kind keeps kind, id, x, y, z (current position on the ground),
  // alive, deadT, head/nx/nz (road frame at its base) and t (its own clock, scaled by
  // CFG.hazardSpeed); the moving kinds add what the renderer needs.
  //
  // Course fields per kind [defaults], then the live state the renderer reads:
  //   walker   range, speed                                  face (1 / -1)
  //   stomper  phase                                         lift, warn, slamming
  //   firebar  len, speed                                    angle
  //   snowman  -                                             -
  //   roller   range [hw+4] half lateral travel, period [4], r [2.2], phase, look ['snowball' on
  //            snowy themes, else 'boulder']                 r, roll, dirX, dirZ
  //   penguin  range [12] half travel along the road, lat [2], period [5], phase
  //                                                          yaw, slide (belly slide)
  //   skier    range [hw] half lateral travel, along [4], period [5], phase
  //                                                          yaw, lean (-1..1, + = toward the right)
  //   cow      range [3], period [9], phase                  yaw, hop (1 -> 0 after a bump)
  //   mole     period [3.5], phase, upFrac [0.35]            up (0..1), warn
  //   geyser   period [4], phase, height [7], r [2], look ['lava' on lava, else 'water']
  //                                                          power (0..1), warn, height
  //   podoboo  span [2*hw+8] lateral leap, height [7], period [3], phase
  //                                                          active; x, y, z = the fireball
  //   bumper   r [1.3]                                       spin, pulse (1 on a hit, decays)
  //   icicle   period [3.6], phase, ceil [9] (ceiling height)
  //                                                          state (hang, warn, fall, gone,
  //                                                          grow), drop (tip height), grow
  //   pole     r [0.35], color                               -
  // All take d (lateral offset of the base). Phases are fractions of a period.
  makeHazard(h, i) {
    const o = Object.assign({ id: i, alive: true, deadT: 0 }, h);
    o.t = 0; // its own clock (the course spec's t was the placement along the segment)
    const p = h.path.point(h.s, 0);
    o.nx = p.nx;
    o.nz = p.nz;
    o.baseX = h.x;
    o.baseZ = h.z;
    o.baseY = h.y;
    o.d = h.d || 0;
    o.vx = o.vz = 0;
    const hw = p.hw;
    const def = (key, v) => {
      if (o[key] === undefined) o[key] = v;
    };
    const theme = this.track.def.theme;
    switch (h.kind) {
      case 'stomper':
        def('phase', 0);
        o.r = 2.2;
        o.h = 6;
        break;
      case 'snowman':
        o.r = 1.5;
        break;
      case 'walker':
        o.r = 1.1;
        break;
      case 'roller':
        def('range', hw + 4);
        def('period', 4);
        def('r', 2.2);
        def('phase', 0);
        def('look', theme === 'snow' || theme === 'alpine' ? 'snowball' : 'boulder');
        o.roll = 0;
        o.dirX = o.nx;
        o.dirZ = o.nz;
        break;
      case 'penguin':
        def('range', 12);
        def('lat', 2);
        def('period', 5);
        def('phase', 0);
        o.r = 1.1;
        o.yaw = p.head;
        o.slide = false;
        break;
      case 'skier':
        def('range', hw);
        def('along', 4);
        def('period', 5);
        def('phase', 0);
        o.r = 1.1;
        o.yaw = p.head;
        o.lean = 0;
        break;
      case 'cow':
        def('range', 3);
        def('period', 9);
        def('phase', 0);
        o.r = 1.6;
        o.yaw = p.head + Math.PI / 2;
        o.hop = 0;
        o.mooT = 0;
        break;
      case 'mole':
        def('period', 3.5);
        def('phase', 0);
        def('upFrac', 0.35);
        o.r = 1.2;
        o.up = 0;
        o.warn = false;
        break;
      case 'geyser':
        def('period', 4);
        def('phase', 0);
        def('height', 7);
        def('r', 2);
        def('look', theme === 'lava' ? 'lava' : 'water');
        o.power = 0;
        o.warn = false;
        break;
      case 'podoboo':
        def('span', 2 * hw + 8);
        def('height', 7);
        def('period', 3);
        def('phase', 0);
        o.r = 0.9;
        o.active = false;
        break;
      case 'bumper':
        def('r', 1.3);
        o.spin = 0;
        o.pulse = 0;
        break;
      case 'icicle':
        def('period', 3.6);
        def('phase', 0);
        def('ceil', 9);
        o.r = 2.2; // shatter radius
        o.state = 'hang';
        o.grow = 1;
        o.drop = o.ceil - ICICLE_LEN;
        break;
      case 'pole':
        def('r', 0.35);
        break;
    }
    return o;
  }

  // ---------- per step ----------
  update(dt) {
    const race = this.race;
    for (const b of this.boxes) {
      b.spin += dt * 1.6;
      if (!b.active && (b.t -= dt) <= 0) b.active = true;
    }
    for (const c of this.coins) if (!c.active && (c.t -= dt) <= 0) c.active = true;
    for (const k of this.keys) if (!k.active && (k.t -= dt) <= 0) k.active = true;
    for (const g of this.gates) {
      if (g.openT > 0) g.openT -= dt;
      g.anim = U.approach(g.anim, g.openT > 0 ? 1 : 0, dt * 2.5);
    }
    for (const r of this.rings) r.flash = Math.max(0, r.flash - dt * 1.8);
    this.updateHazards(dt);
    for (const o of this.objects) this.updateObject(o, dt);
    this.objects = this.objects.filter((o) => !o.dead);
    // kart interactions
    for (const k of race.karts) {
      if (k.falling) continue;
      if (this.rings.length) this.ringCheck(k);
      if (k.ghost) continue;
      this.pickups(k);
      this.hazardHits(k);
      this.objectHits(k);
      this.gateCheck(k);
      this.updateRoulette(k, dt);
    }
  }

  // ---------- pickups ----------
  pickups(k) {
    const kx = k.x, ky = k.y + 0.7, kz = k.z;
    for (const b of this.boxes) {
      if (!b.active) continue;
      const dx = b.x - kx, dz = b.z - kz;
      if (dx * dx + dz * dz > 3.6 || Math.abs(b.y + 1.1 - ky) > 2.2) continue;
      b.active = false;
      b.t = CFG.itemBoxRespawn;
      this.race.emit('box', k, b);
      if (!k.item && k.roulette <= 0 && this.race.itemsOn) {
        k.roulette = Math.max(0.05, CFG.rouletteTime);
        k.pending = rollItem(k.place, this.race.order.length, this.race.rnd);
      }
    }
    for (const c of this.coins) {
      if (!c.active) continue;
      const dx = c.x - kx, dz = c.z - kz;
      if (dx * dx + dz * dz > 2.9 || Math.abs(c.y + 0.8 - ky) > 2) continue;
      c.active = false;
      c.t = 12;
      k.addCoins(1);
    }
    for (const key of this.keys) {
      if (!key.active || k.key) continue;
      const dx = key.x - kx, dy = key.y - ky, dz = key.z - kz;
      if (dx * dx + dz * dz + dy * dy > 6.5) continue;
      key.active = false;
      key.t = CFG.keyRespawn;
      k.key = true;
      this.race.emit('key', k);
    }
  }
  updateRoulette(k, dt) {
    if (k.roulette <= 0) return;
    k.roulette -= dt;
    if (k.roulette <= 0) {
      k.roulette = 0;
      k.item = k.pending;
      k.itemN = k.item === 'triple' ? 3 : 1;
      k.pending = null;
      this.race.emit('itemget', k, k.item);
    }
  }

  // Boost rings: fly through the middle (crossing the ring's plane within its radius) for a
  // boost. Each ring boosts a kart once per pass.
  ringCheck(k) {
    if (k.prevX === undefined || this.race.state !== 'race') return;
    const ax = k.prevX, ay = k.prevY + 0.7, az = k.prevZ;
    const bx = k.x, by = k.y + 0.7, bz = k.z;
    for (const r of this.rings) {
      const da = (ax - r.x) * r.tx + (az - r.z) * r.tz;
      const db = (bx - r.x) * r.tx + (bz - r.z) * r.tz;
      if ((da > 0) === (db > 0)) continue; // did not cross its plane this step
      const f = da / (da - db || 1e-6);
      const cx = ax + (bx - ax) * f, cy = ay + (by - ay) * f, cz = az + (bz - az) * f;
      const lat = (cx - r.x) * -r.tz + (cz - r.z) * r.tx;
      const up = cy - r.y;
      if (lat * lat + up * up > r.r * r.r) continue;
      const last = r.hitAt[k.idx];
      if (last !== undefined && this.race.time - last < 1) continue;
      r.hitAt[k.idx] = this.race.time;
      r.flash = 1;
      k.giveBoost(CFG.ringBoostTime, 'ring');
      this.race.emit('ring', k, r);
    }
  }

  // ---------- using items ----------
  use(k) {
    if (!k.item || k.falling || k.spinT > 0 || k.itemCooldown > 0) return false;
    const kind = k.item;
    const fx = Math.cos(k.head), fz = Math.sin(k.head);
    const back = !!k.ctl.back;
    k.itemCooldown = 0.25;
    if (kind === 'mushroom' || kind === 'triple') {
      k.giveBoost(CFG.mushroomTime, 'mushroom');
    } else if (kind === 'star') {
      k.starT = CFG.starTime;
      this.race.emit('star', k);
    } else if (kind === 'coin') {
      k.addCoins(2);
    } else if (kind === 'banana') {
      this.spawn({ kind: 'banana', x: k.x - fx * 2.6, y: k.y, z: k.z - fz * 2.6, owner: k, vx: 0, vz: 0 });
    } else if (kind === 'green' || kind === 'red') {
      const dir = back ? -1 : 1;
      const sp = CFG.shellSpeed + Math.max(0, k.vf) * 0.4 * dir;
      const o = this.spawn({
        kind: 'shell', color: kind, x: k.x + fx * 2.4 * dir, y: k.y, z: k.z + fz * 2.4 * dir,
        vx: fx * sp * dir, vz: fz * sp * dir, owner: k, life: CFG.shellLife, bounces: CFG.shellBounces,
      });
      if (kind === 'red' && !back) o.target = this.race.order.find((q) => q.place === k.place - 1 && !q.finished) || null;
    } else if (kind === 'bomb') {
      const dir = back ? -1 : 1;
      const sp = Math.max(0, k.vf) * dir + 16 * dir;
      this.spawn({ kind: 'bomb', x: k.x + fx * 2 * dir, y: k.y + 1.4, z: k.z + fz * 2 * dir, vx: fx * sp, vz: fz * sp, vy: back ? 4 : 8, owner: k, fuse: CFG.bombFuse });
    }
    this.race.emit('use', k, kind);
    if (!(k.bot === false && CFG.infiniteItems)) {
      k.itemN--;
      if (k.itemN <= 0) {
        k.item = null;
        k.itemN = 0;
      }
    }
    return true;
  }

  spawn(o) {
    o.id = this.nextId++;
    o.age = 0;
    o.dead = false;
    o.vy = o.vy || 0;
    o.loc = this.track.locate(o.x, o.z, o.y, o.owner && o.owner.path, {});
    o.onGround = o.kind !== 'bomb';
    if (o.kind === 'banana' && o.loc) {
      const g = this.track.groundY(o.loc);
      if (g === -Infinity) o.dead = true;
      else o.y = g;
    }
    this.objects.push(o);
    if (this.objects.length > 60) this.objects.shift().dead = true;
    return o;
  }

  updateObject(o, dt) {
    o.age += dt;
    if (o.kind === 'banana') return;
    if (o.kind === 'blast') {
      if (o.age > 0.7) o.dead = true;
      return;
    }
    if (o.kind === 'shell') this.updateShell(o, dt);
    else if (o.kind === 'bomb') this.updateBomb(o, dt);
  }

  updateShell(o, dt) {
    o.life -= dt;
    if (o.life <= 0) return this.kill(o);
    // homing red shells: aim along the track until close, then straight at the target
    if (o.target && !o.target.finished) {
      const T = o.target;
      let tx = T.x, tz = T.z;
      const dist = Math.hypot(T.x - o.x, T.z - o.z);
      if (dist > 22 && o.loc) {
        const p = o.loc.path.point(o.loc.s + 14, U.clamp(o.loc.d * 0.6, -o.loc.hw * 0.5, o.loc.hw * 0.5));
        tx = p.x;
        tz = p.z;
      }
      const want = Math.atan2(tz - o.z, tx - o.x);
      const cur = Math.atan2(o.vz, o.vx);
      let d = want - cur;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const turn = U.clamp(d, -CFG.redShellTurn * dt, CFG.redShellTurn * dt);
      const sp = Math.hypot(o.vx, o.vz);
      o.vx = Math.cos(cur + turn) * sp;
      o.vz = Math.sin(cur + turn) * sp;
    }
    const steps = 2;
    for (let i = 0; i < steps; i++) {
      o.x += (o.vx * dt) / steps;
      o.z += (o.vz * dt) / steps;
      const loc = this.track.locate(o.x, o.z, o.y, o.loc && o.loc.path, o.loc || (o.loc = {}));
      if (!loc) return this.kill(o);
      const g = this.track.groundY(loc);
      if (g === -Infinity || loc.excess > 0.6 || (loc.over > 0.5 && loc.path === this.track.main)) {
        // off the edge (or off either end of a point-to-point road): tumble away
        return this.kill(o, 'fall');
      }
      o.y = g;
      const lim = loc.hw + loc.sh - 0.5;
      if (Math.abs(loc.d) > lim) {
        const side = loc.d > 0 ? 1 : -1;
        const flag = side > 0 ? loc.path.wallR[loc.i] : loc.path.wallL[loc.i];
        if (flag === 0) continue;
        if (o.color === 'green' && o.bounces-- <= 0) return this.kill(o);
        const vn = (o.vx * loc.nx + o.vz * loc.nz) * side;
        if (vn > 0) {
          o.vx -= 2 * vn * loc.nx * side;
          o.vz -= 2 * vn * loc.nz * side;
        }
        o.x -= loc.nx * (Math.abs(loc.d) - lim) * side;
        o.z -= loc.nz * (Math.abs(loc.d) - lim) * side;
        this.race.emit('shellbounce', null, o);
      }
    }
    // gates and solid hazards stop shells too
    for (const g of this.gates) if (g.openT <= 0 && segHit(o.x - o.vx * dt, o.z - o.vz * dt, o.x, o.z, g)) return this.kill(o);
    for (const h of this.hazards) {
      if (!h.alive || !SOLID_HAZARDS[h.kind]) continue;
      if ((h.x - o.x) ** 2 + (h.z - o.z) ** 2 < (h.r + 0.5) ** 2) return this.kill(o);
    }
  }

  updateBomb(o, dt) {
    if (!o.onGround) {
      o.vy -= CFG.gravity * 0.8 * dt;
      o.x += o.vx * dt;
      o.z += o.vz * dt;
      o.y += o.vy * dt;
      const loc = this.track.locate(o.x, o.z, o.y, o.loc && o.loc.path, o.loc || (o.loc = {}));
      const g = loc ? this.track.groundY(loc) : -Infinity;
      if (g !== -Infinity && o.y <= g && o.y > g - 1) {
        o.y = g;
        o.onGround = true;
        o.vx *= 0.3;
        o.vz *= 0.3;
      } else if (o.y < (loc ? loc.y : o.y) - 12) return this.kill(o);
    } else {
      o.vx *= 1 - 3 * dt;
      o.vz *= 1 - 3 * dt;
      o.x += o.vx * dt;
      o.z += o.vz * dt;
    }
    o.fuse -= dt;
    if (o.fuse <= 0) this.explode(o);
  }

  explode(o) {
    o.dead = true;
    this.objects.push({ kind: 'blast', x: o.x, y: o.y, z: o.z, age: 0, dead: false, id: this.nextId++ });
    this.race.emit('blast', null, o);
    const R = CFG.bombRadius;
    for (const k of this.race.karts) {
      if (k.ghost) continue;
      const d = Math.hypot(k.x - o.x, k.z - o.z);
      if (d < R && Math.abs(k.y - o.y) < R) {
        if (k.spinOut(CFG.spinOutTime * 1.2, 'bomb')) {
          k.vy = 9;
          k.onGround = false;
        }
      }
    }
    // a blast clears nearby bananas and shells
    for (const q of this.objects) {
      if (q !== o && !q.dead && q.kind !== 'blast' && Math.hypot(q.x - o.x, q.z - o.z) < R) this.kill(q);
    }
  }

  kill(o, how) {
    if (o.dead) return;
    o.dead = true;
    if (o.kind === 'bomb') return this.explode(o);
    this.race.emit('poof', null, o, how);
  }

  objectHits(k) {
    for (const o of this.objects) {
      if (o.dead || o.kind === 'blast') continue;
      if (o.owner === k && o.age < 0.45) continue;
      const r = o.kind === 'bomb' ? 1.3 : 1.25;
      const dx = o.x - k.x, dz = o.z - k.z;
      if (dx * dx + dz * dz > (KART_R + r) ** 2 || Math.abs(o.y - k.y) > 1.8) continue;
      if (o.kind === 'bomb') {
        this.explode(o);
        continue;
      }
      this.kill(o, 'hit');
      if (k.starT > 0) continue;
      if (o.kind === 'banana') k.spinOut(CFG.bananaSpinTime, 'banana');
      else if (o.kind === 'shell') {
        if (k.spinOut(CFG.spinOutTime, 'shell')) {
          k.vy = 5;
          k.onGround = false;
        }
      }
    }
    // shells and bananas cancel each other out
    const objs = this.objects;
    for (let i = 0; i < objs.length; i++) {
      const a = objs[i];
      if (a.dead || a.kind !== 'shell') continue;
      for (let j = 0; j < objs.length; j++) {
        const b = objs[j];
        if (i === j || b.dead || (b.kind !== 'shell' && b.kind !== 'banana')) continue;
        if ((a.x - b.x) ** 2 + (a.z - b.z) ** 2 < 2.4) {
          this.kill(a);
          this.kill(b);
        }
      }
    }
  }

  // ---------- hazards ----------
  updateHazards(dt) {
    const hs = CFG.hazardSpeed;
    for (const h of this.hazards) {
      h.t += dt * hs;
      const t = h.t;
      if (!h.alive) {
        h.deadT -= dt;
        if (h.deadT <= 0) h.alive = true;
      }
      const px = h.x, pz = h.z;
      switch (h.kind) {
        case 'walker': {
          const off = Math.sin((t * h.speed) / h.range + h.id * 1.7) * h.range;
          h.x = h.baseX + h.nx * off;
          h.z = h.baseZ + h.nz * off;
          h.face = Math.cos((t * h.speed) / h.range + h.id * 1.7) > 0 ? 1 : -1;
          break;
        }
        case 'stomper': {
          // rise slowly, hang, slam down, rest
          const P = CFG.stomperPeriod;
          const ph = (((t / P + h.phase) % 1) + 1) % 1;
          let lift;
          if (ph < 0.45) lift = 6 * Math.min(1, ph / 0.3);
          else if (ph < 0.62) lift = 6;
          else if (ph < 0.68) lift = 6 * (1 - (ph - 0.62) / 0.06);
          else lift = 0;
          const was = h.lift;
          h.lift = lift;
          h.slamming = ph >= 0.62 && ph < 0.69;
          if (was > 0.3 && lift <= 0.3) this.race.emit('stomp', null, h);
          h.warn = ph > 0.5 && ph < 0.62;
          break;
        }
        case 'firebar':
          h.angle = t * h.speed + h.id;
          break;
        case 'roller':
          this.moveRoller(h, t);
          break;
        case 'penguin':
          this.movePenguin(h, t, dt);
          break;
        case 'skier':
          this.moveSkier(h, t, dt);
          break;
        case 'cow':
          this.moveCow(h, t, dt);
          break;
        case 'mole':
          this.cycleMole(h, t);
          break;
        case 'geyser':
          this.cycleGeyser(h, t);
          break;
        case 'podoboo':
          this.leapPodoboo(h, t);
          break;
        case 'bumper':
          h.spin += dt * hs * 1.6;
          h.pulse = Math.max(0, h.pulse - dt * 2.5);
          break;
        case 'icicle':
          this.cycleIcicle(h, t);
          break;
      }
      // how fast it is moving (world units per second)
      h.vx = (h.x - px) / dt;
      h.vz = (h.z - pz) / dt;
    }
  }

  // Set a moving hazard on the road at s along its path (plus `along`) and lateral offset d.
  placeHazard(h, along, d) {
    const p = h.path.point(h.s + along, d, this._pt);
    h.x = p.x;
    h.y = p.y;
    h.z = p.z;
    return p;
  }
  // Ease a hazard's yaw toward the way it is moving (karts' heading convention: atan2(dz, dx)).
  faceMotion(h, dx, dz, rate, dt) {
    if (dx * dx + dz * dz < 1e-8) return;
    let e = Math.atan2(dz, dx) - h.yaw;
    while (e > Math.PI) e -= Math.PI * 2;
    while (e < -Math.PI) e += Math.PI * 2;
    h.yaw += U.clamp(e, -rate * dt, rate * dt);
  }

  // Where a wandering hazard (roller, penguin, skier, cow) is at time t on its own clock, in
  // its path's coordinates: a = units along the road from its base, d = lateral offset. Pure,
  // so bots can ask where it will be by the time they get there.
  hazardPose(h, t, out) {
    const w = Math.PI * 2 * (t / h.period + h.phase);
    out.a = 0;
    out.d = h.d;
    switch (h.kind) {
      case 'roller':
        // to and fro across the road, like a ball in a half-pipe
        out.d = h.d + h.range * Math.sin(w);
        break;
      case 'penguin': {
        // a fast belly slide down the road, then a waddle back up for another go
        const u = (((t / h.period + h.phase) % 1) + 1) % 1;
        out.a = u < 0.4 ? h.range * (2 * U.easeInOut(u / 0.4) - 1) : h.range * (1 - 2 * ((u - 0.4) / 0.6));
        out.d = h.d + h.lat * Math.sin(Math.PI * 4 * u);
        break;
      }
      case 'skier':
        // carving turns across the slope: down the fall line in the middle, up at the edges
        out.a = h.along * Math.cos(2 * w);
        out.d = h.d + h.range * Math.sin(w);
        break;
      case 'cow':
        out.a = h.range * 0.4 * Math.sin(w * 0.5);
        out.d = h.d + h.range * Math.sin(w);
        break;
    }
    return out;
  }

  // A big snowball (or boulder) rolling to and fro across the road.
  // roll = signed angle rolled (offset from the middle / radius), dir = the way it is rolling.
  moveRoller(h, t) {
    const q = this.hazardPose(h, t, this._pose);
    this.placeHazard(h, q.a, q.d);
    const s = Math.cos(Math.PI * 2 * (t / h.period + h.phase)) >= 0 ? 1 : -1;
    h.dirX = h.nx * s;
    h.dirZ = h.nz * s;
    h.roll = (q.d - h.d) / h.r;
  }
  // A penguin: slide = on its belly (the fast run down the road).
  movePenguin(h, t, dt) {
    const q = this.hazardPose(h, t, this._pose);
    h.slide = (((t / h.period + h.phase) % 1) + 1) % 1 < 0.4;
    const px = h.x, pz = h.z;
    this.placeHazard(h, q.a, q.d);
    this.faceMotion(h, h.x - px, h.z - pz, 9, dt);
  }
  // A skier. lean (-1..1): + = leaning toward the road's right.
  moveSkier(h, t, dt) {
    const q = this.hazardPose(h, t, this._pose);
    const px = h.x, pz = h.z;
    this.placeHazard(h, q.a, q.d);
    this.faceMotion(h, h.x - px, h.z - pz, 12, dt);
    h.lean = -Math.sin(Math.PI * 2 * (t / h.period + h.phase));
  }
  // A cow ambling about on the road. Bumping it makes it hop (hop decays 1 -> 0).
  moveCow(h, t, dt) {
    const q = this.hazardPose(h, t, this._pose);
    const px = h.x, pz = h.z;
    this.placeHazard(h, q.a, q.d);
    this.faceMotion(h, h.x - px, h.z - pz, 2.5, dt);
    h.hop = Math.max(0, h.hop - dt * 1.6);
    h.mooT = Math.max(0, h.mooT - dt);
  }
  // A mole in a dirt mound: the dirt shakes (warn), then it pops up (up 0..1) and ducks again.
  cycleMole(h, t) {
    const u = (((t / h.period + h.phase) % 1) + 1) % 1;
    const upAt = 1 - h.upFrac;
    let up = 0;
    if (u >= upAt) {
      const v = (u - upAt) / h.upFrac;
      up = v < 0.15 ? v / 0.15 : v > 0.75 ? (1 - v) / 0.25 : 1;
    }
    if (!h.alive) up = 0;
    h.warn = h.alive && u >= upAt - 0.16 && u < upAt;
    if (h.up <= 0 && up > 0) this.race.emit('mole', null, h);
    h.up = up;
  }
  // A geyser bubbles (warn), erupts into a column (power 0..1 of height) and dies down.
  cycleGeyser(h, t) {
    const u = (((t / h.period + h.phase) % 1) + 1) % 1;
    const e0 = 0.62, e1 = 0.92;
    let power = 0;
    if (u >= e0 && u < e1) {
      const v = (u - e0) / (e1 - e0);
      power = v < 0.12 ? v / 0.12 : v > 0.7 ? (1 - v) / 0.3 : 1;
    }
    if (!h.alive) power = 0;
    h.warn = h.alive && u >= 0.44 && u < e0;
    if (h.power <= 0 && power > 0) this.race.emit('geyser', null, h);
    h.power = power;
  }
  // A fireball leaping out of the lava on one side of the road, over it, and into the lava on
  // the other side; every other leap goes the other way. x, y, z = the fireball itself.
  leapPodoboo(h, t) {
    const c = t / h.period + h.phase;
    const u = c - Math.floor(c);
    const live = 0.55;
    if (u >= live || !h.alive) {
      h.active = false;
      return;
    }
    const v = u / live;
    const dir = Math.floor(c) % 2 === 0 ? 1 : -1;
    const p = this.placeHazard(h, 0, h.d + dir * h.span * (v - 0.5));
    h.y = p.y - 2 + (h.height + 2) * 4 * v * (1 - v);
    h.active = true;
  }
  // An icicle on the ceiling: hangs, shakes (warn), falls, shatters (gone) and grows back.
  // drop = height of its tip above the road; it hits whoever is under it as it shatters.
  cycleIcicle(h, t) {
    const c = t / h.period + h.phase;
    const u = c - Math.floor(c);
    const hang = h.ceil - ICICLE_LEN;
    let state, drop, grow = 1;
    if (u < 0.42) {
      state = 'hang';
      drop = hang;
    } else if (u < 0.6) {
      state = 'warn';
      drop = hang;
    } else if (u < 0.8) {
      const ft = (u - 0.6) * h.period / Math.max(0.05, CFG.hazardSpeed);
      drop = Math.max(0, hang - 0.5 * 42 * ft * ft);
      state = drop > 0 ? 'fall' : 'gone';
      if (drop <= 0) grow = 0;
    } else {
      grow = (u - 0.8) / 0.2;
      state = 'grow';
      drop = h.ceil - ICICLE_LEN * grow;
    }
    if (!h.alive) {
      state = 'gone';
      grow = 0;
      drop = 0;
    }
    // it shatters as it leaves the falling state (normally on reaching the road)
    if (h.state === 'fall' && state !== 'fall') this.icicleImpact(h);
    h.state = state;
    h.drop = drop;
    h.grow = grow;
  }
  icicleImpact(h) {
    this.race.emit('icicle', null, h);
    for (const k of this.race.karts) {
      if (k.ghost || k.falling) continue;
      if ((k.x - h.x) ** 2 + (k.z - h.z) ** 2 > h.r * h.r || Math.abs(k.y - h.y) > 3) continue;
      k.spinOut(CFG.spinOutTime, 'icicle');
    }
  }

  hazardHits(k) {
    for (const h of this.hazards) {
      if (!h.alive) continue;
      if (h.kind === 'firebar') {
        const ca = Math.cos(h.angle), sa = Math.sin(h.angle);
        // project the kart onto the bar
        const dx = k.x - h.x, dz = k.z - h.z;
        const along = dx * ca + dz * sa;
        const perp = -dx * sa + dz * ca;
        // after a burn the kart gets a moment to drive clear (near the pivot the bar would
        // otherwise catch it again on every turn)
        if (k.fireSafeT > this.race.time) continue;
        if (along > -0.6 && along < h.len + 0.6 && Math.abs(perp) < 1.5 && Math.abs(k.y - h.y) < 2.5) {
          if (k.spinOut(CFG.spinOutTime, 'fire')) k.fireSafeT = this.race.time + CFG.spinOutTime + 1.2;
        }
        continue;
      }
      if (h.kind === 'podoboo') {
        if (h.active && (k.x - h.x) ** 2 + (k.z - h.z) ** 2 < 1.6 * 1.6 && Math.abs(h.y - (k.y + 0.6)) < 2) k.spinOut(CFG.spinOutTime, 'fire');
        continue;
      }
      if (h.kind === 'icicle') continue; // only hurts as it shatters (see cycleIcicle)
      const dx = k.x - h.x, dz = k.z - h.z;
      const d = Math.hypot(dx, dz);
      const R = (h.r || 1) + KART_R * 0.85;
      if (d > R) continue;
      // sailing high over it (a jump or a glider)
      const tall = h.kind === 'roller' ? 2 * h.r : HAZARD_TALL[h.kind] || 3.2;
      if (h.kind !== 'stomper' && h.kind !== 'geyser' && k.y > h.y + tall) continue;
      switch (h.kind) {
        case 'walker':
          if (k.starT > 0) this.knockOut(h, k, 6);
          else k.spinOut(CFG.bananaSpinTime, 'walker');
          continue;
        case 'stomper':
          if (h.slamming && h.lift < 2.5) {
            k.squish(1.3);
            continue;
          }
          if (h.lift > 1.8) continue; // drive underneath while it is up
          break;
        case 'snowman':
          if (k.starT > 0) {
            this.knockOut(h, k, 8);
            continue;
          }
          break;
        case 'penguin':
        case 'skier':
          if (k.starT > 0) this.knockOut(h, k, 6);
          else k.spinOut(CFG.bananaSpinTime, h.kind);
          continue;
        case 'roller':
          // a star shatters it; otherwise it bowls you over and pops you up
          if (k.starT > 0) {
            this.knockOut(h, k, 6);
            continue;
          }
          if (k.spinOut(CFG.spinOutTime * 1.1, 'roller')) this.popUp(k, 4);
          break;
        case 'mole':
          if (h.up <= 0.5) continue; // just a dirt mound
          if (k.starT > 0) this.knockOut(h, k, 5);
          else if (k.spinOut(CFG.spinOutTime, 'mole')) this.popUp(k, 4);
          continue;
        case 'geyser':
          if (h.power > 0.3 && k.y < h.y + h.height * h.power && k.spinOut(CFG.spinOutTime, 'geyser')) this.popUp(k, 10);
          continue;
        case 'cow':
          if (k.starT > 0) {
            this.knockOut(h, k, 8);
            continue;
          }
          break;
      }
      // solid: push out and bounce (bumpers bounce you hard)
      const nx = dx / (d || 1), nz = dz / (d || 1);
      k.x = h.x + nx * R;
      k.z = h.z + nz * R;
      const vn = k.vx * nx + k.vz * nz;
      if (h.kind === 'bumper') {
        if (vn < 0) {
          k.vx -= nx * vn * 2.2;
          k.vz -= nz * vn * 2.2;
        }
        // always leave with some speed, so nothing sticks to a bumper
        const out = k.vx * nx + k.vz * nz;
        if (out < 7) {
          k.vx += nx * (7 - out);
          k.vz += nz * (7 - out);
        }
        if (vn < -1 || h.pulse < 0.5) {
          h.pulse = 1;
          this.race.emit('bumper', k, h);
          k.vis.bump = 1;
          if (k.antigrav) k.spinBoost();
        }
        continue;
      }
      if (vn < 0) {
        k.vx -= nx * vn * 1.6;
        k.vz -= nz * vn * 1.6;
        k.vx *= 0.7;
        k.vz *= 0.7;
        if (vn < -5) this.race.emit('wall', k, -vn);
        if (h.kind === 'cow' && vn < -2 && h.mooT <= 0) {
          h.hop = 1;
          h.mooT = 0.8;
          this.race.emit('moo', k, h);
        }
      }
    }
  }
  // A star kart squashes (or shatters, or knocks out) a hazard for a few seconds.
  knockOut(h, k, secs) {
    h.alive = false;
    h.deadT = secs;
    this.race.emit('squash', k, h);
  }
  popUp(k, vy) {
    k.vy = vy;
    k.onGround = false;
  }

  // ---------- key gates ----------
  gateCheck(k) {
    const px = k.prevX, pz = k.prevZ;
    if (px === undefined) return;
    for (const g of this.gates) {
      if (!segHit(px, pz, k.x, k.z, g, KART_R * 0.7)) continue;
      if (g.openT > 0) continue;
      if (k.key) {
        k.key = false;
        g.openT = CFG.gateOpenTime;
        k.routes[g.path.id] = true;
        this.race.emit('gate', k, g);
        continue;
      }
      // locked: bounce back off the door
      k.x = px;
      k.z = pz;
      const nx = Math.cos(g.head), nz = Math.sin(g.head);
      const vn = k.vx * nx + k.vz * nz;
      k.vx -= nx * vn * 1.7;
      k.vz -= nz * vn * 1.7;
      k.vx *= 0.6;
      k.vz *= 0.6;
      k.relocate();
      if (Math.abs(vn) > 3) this.race.emit('locked', k, g);
    }
  }
}

// Does the move (ax,az)->(bx,bz) cross gate g's door line, or press into its thickness?
// Moving away from the door is always allowed, so nothing can get stuck in it.
function segHit(ax, az, bx, bz, g, pad = 0) {
  const nx = Math.cos(g.head), nz = Math.sin(g.head); // door normal = road direction
  const da = (ax - g.x) * nx + (az - g.z) * nz;
  const db = (bx - g.x) * nx + (bz - g.z) * nz;
  const crosses = (da > 0) !== (db > 0);
  if (!crosses && !(Math.abs(db) < pad && Math.abs(db) < Math.abs(da))) return false;
  // lateral position along the door at the crossing
  const t = Math.abs(da - db) < 1e-6 ? 0.5 : U.clamp(da / (da - db), 0, 1);
  const cx = ax + (bx - ax) * t, cz = az + (bz - az) * t;
  const lat = (cx - g.x) * -nz + (cz - g.z) * nx;
  return Math.abs(lat) <= g.half;
}
