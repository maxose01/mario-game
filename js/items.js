'use strict';
// Items, pickups and hazards (pure simulation).
// Item boxes roll a random item weighted by race position (catch-up luck); shells, bananas and
// clay bombs live as world objects; Mudlet walkers, stompers, fire bars and snowmen are hazards;
// floating keys open the gates of the hidden routes.

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
    this.hazards = O.hazards.map((h, i) => this.makeHazard(h, i));
    this.objects = [];
    this.nextId = 1;
  }

  makeHazard(h, i) {
    const o = Object.assign({ id: i, t: 0, alive: true, deadT: 0 }, h);
    const p = h.path.point(h.s, 0);
    o.nx = p.nx;
    o.nz = p.nz;
    o.baseX = h.x;
    o.baseZ = h.z;
    if (h.kind === 'stomper') {
      o.r = 2.2;
      o.h = 6;
    }
    if (h.kind === 'snowman') o.r = 1.5;
    if (h.kind === 'walker') o.r = 1.1;
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
    this.updateHazards(dt);
    for (const o of this.objects) this.updateObject(o, dt);
    this.objects = this.objects.filter((o) => !o.dead);
    // kart interactions
    for (const k of race.karts) {
      if (k.falling) continue;
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
        k.pending = rollItem(k.place, this.race.karts.length, this.race.rnd);
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
      if (kind === 'red' && !back) o.target = this.race.karts.find((q) => q.place === k.place - 1 && !q.finished) || null;
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
      if (g === -Infinity || loc.excess > 0.6) {
        // off the edge: tumble away
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
      if (!h.alive || !h.r || h.kind === 'walker') continue;
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
    const t = this.race.time;
    for (const h of this.hazards) {
      h.t += dt;
      if (!h.alive) {
        h.deadT -= dt;
        if (h.deadT <= 0) h.alive = true;
      }
      if (h.kind === 'walker') {
        const off = Math.sin((t * h.speed) / h.range + h.id * 1.7) * h.range;
        h.x = h.baseX + h.nx * off;
        h.z = h.baseZ + h.nz * off;
        h.face = Math.cos((t * h.speed) / h.range + h.id * 1.7) > 0 ? 1 : -1;
      } else if (h.kind === 'stomper') {
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
      } else if (h.kind === 'firebar') {
        h.angle = t * h.speed + h.id;
      }
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
        if (along > -0.6 && along < h.len + 0.6 && Math.abs(perp) < 1.5 && Math.abs(k.y - h.y) < 2.5) k.spinOut(CFG.spinOutTime, 'fire');
        continue;
      }
      const dx = k.x - h.x, dz = k.z - h.z;
      const d = Math.hypot(dx, dz);
      const R = (h.r || 1) + KART_R * 0.85;
      if (d > R) continue;
      if (h.kind === 'walker') {
        if (k.starT > 0) {
          h.alive = false;
          h.deadT = 6;
          this.race.emit('squash', k, h);
        } else k.spinOut(CFG.bananaSpinTime, 'walker');
        continue;
      }
      if (h.kind === 'stomper') {
        if (h.slamming && h.lift < 2.5) {
          k.squish(1.3);
          continue;
        }
        if (h.lift > 1.8) continue; // drive underneath while it is up
      }
      if (h.kind === 'snowman' && k.starT > 0) {
        h.alive = false;
        h.deadT = 8;
        this.race.emit('squash', k, h);
        continue;
      }
      // solid: push out and bounce
      const nx = dx / (d || 1), nz = dz / (d || 1);
      k.x = h.x + nx * R;
      k.z = h.z + nz * R;
      const vn = k.vx * nx + k.vz * nz;
      if (vn < 0) {
        k.vx -= nx * vn * 1.6;
        k.vz -= nz * vn * 1.6;
        k.vx *= 0.7;
        k.vz *= 0.7;
        if (vn < -5) this.race.emit('wall', k, -vn);
      }
    }
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
