'use strict';
// Kart physics (pure simulation, shared with the Node tests).
// Arcade model: a heading plus a world-space velocity whose sideways part is bled away by tyre
// grip, so karts carve on asphalt and slide on ice. Hop-drifts charge blue, orange and purple
// mini-turbos; ramps and hill crests throw karts into the air; walls bounce, edges drop.

const KART_R = 1.05; // collision radius

class Kart {
  constructor(race, idx, o) {
    this.race = race;
    this.track = race.track;
    this.idx = idx;
    this.name = o.name || 'Racer ' + (idx + 1);
    this.bot = !!o.bot;
    this.slot = o.slot !== undefined ? o.slot : -1; // human player slot (0..3) or -1
    this.color = o.color || null;
    this.setConfig(o.config);
    // physics state
    this.x = 0; this.y = 0; this.z = 0;
    this.head = 0;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.vf = 0; // forward speed (signed), refreshed every step
    this.steer = 0;
    this.onGround = true;
    this.airT = 0;
    this.loc = null;
    this.path = null;
    this.surface = 'road';
    // drifting & boosting
    this.drift = 0; this.driftT = 0; this.driftLevel = 0;
    this.hopping = false;
    this.boostT = 0; this.boostKind = '';
    this.trick = false; this.trickT = 0;
    this.startCharge = null; this.stallT = 0;
    // status
    this.spinT = 0; this.spinTotal = 0;
    this.starT = 0;
    this.squishT = 0;
    this.falling = false; this.fallT = 0; this.rescueT = 0;
    this.lastSafe = null; this.safeT = 0;
    // items
    this.item = null; this.itemN = 0; this.roulette = 0; this.pending = null;
    this.key = false;
    this.coins = 0; this.coinsGot = 0;
    this.trailing = null;
    this.itemCooldown = 0;
    this.rubber = 0; // bots only: catch-up (+) or ease-off (-) fraction
    // race progress
    this.totalS = 0; this.lap = 0; this.lastMainS = 0;
    this.finished = false; this.finishTime = 0; this.place = idx + 1;
    this.lapTimes = []; this.lapStart = 0;
    this.wrongT = 0;
    this.routes = {};
    // controls (written by the player's input or the bot brain every step)
    this.ctl = { steer: 0, gas: false, brake: false, drift: false, item: false, back: false };
    this.prevCtl = { drift: false, item: false };
    // visual-only state, read by the renderer
    this.vis = { roll: 0, pitch: 0, squash: 0, spin: 0, wheel: 0, hopY: 0, sparks: 0, bump: 0, shake: 0 };
  }

  setConfig(cfg) {
    this.config = sanitizeKart(cfg);
    this.tune = kartTuning(this.config);
  }

  setPos(x, y, z, head) {
    this.x = x; this.y = y; this.z = z;
    this.head = head;
    this.vx = this.vz = this.vy = 0;
    this.vf = 0;
    this.onGround = true;
    this.loc = this.track.locate(x, z, y, null, {});
    this.path = this.loc ? this.loc.path : this.track.main;
    if (this.loc) {
      this.lastMainS = this.loc.mainS;
      this.lastSafe = { x, y, z, head };
    }
  }

  get speed() {
    return Math.hypot(this.vx, this.vz);
  }
  get controllable() {
    return this.spinT <= 0 && !this.falling && this.stallT <= 0 && this.squishT <= 0;
  }

  // Top speed right now, before boosts.
  baseSpeed() {
    const cc = this.race.cc;
    let v = CFG.topSpeed * cc.speed * this.tune.speed * (1 + Math.min(10, this.coins) * CFG.coinSpeedBonus);
    if (this.bot) v *= CFG.botSkill * cc.bots * (1 + this.rubber);
    return v;
  }

  update(dt) {
    const c = this.ctl;
    const v = this.vis;
    this.itemCooldown = Math.max(0, this.itemCooldown - dt);
    if (this.falling) {
      this.updateFall(dt);
      return;
    }
    if (this.boostT > 0) this.boostT -= dt;
    if (this.starT > 0) this.starT -= dt;
    if (this.stallT > 0) this.stallT -= dt;
    if (this.squishT > 0) this.squishT -= dt;
    if (this.spinT > 0) {
      this.spinT -= dt;
      v.spin += dt * 14 * Math.min(1, this.spinT * 2 + 0.3);
      if (this.spinT <= 0) v.spin = 0;
    }
    const ok = this.controllable && (this.race.state === 'race' || this.race.state === 'done');
    const steerIn = ok ? U.clamp(c.steer, -1, 1) : 0;
    const gas = ok && c.gas;
    const brake = ok && c.brake;
    this.steer = U.approach(this.steer, steerIn, CFG.steerResponse * dt);

    // ---- decompose velocity in the kart's frame ----
    const fx = Math.cos(this.head), fz = Math.sin(this.head);
    const rx = -fz, rz = fx;
    let vf = this.vx * fx + this.vz * fz;
    let vl = this.vx * rx + this.vz * rz;
    const loc = this.loc;
    const surf = (this.surface = this.onGround ? this.track.surface(loc) : 'air');
    const ice = surf === 'ice';

    // ---- target speed ----
    const base = this.baseSpeed();
    let max = base;
    const shielded = this.boostT > 0 || this.starT > 0;
    if (surf === 'offroad' && !shielded) max *= Math.min(1, CFG.offroadSpeed + this.tune.offroad);
    if (surf === 'mud' && !shielded) max *= 0.42;
    if (this.boostT > 0) max = base * CFG.boostSpeed;
    if (this.starT > 0) max = Math.max(max, base * CFG.starSpeed);
    this.maxNow = max;

    // ---- longitudinal ----
    if (this.onGround) {
      if (surf === 'boost' && this.race.state === 'race') this.giveBoost(CFG.padBoostTime, 'pad');
      const accel = CFG.accel * this.race.cc.accel * this.tune.accel;
      if (this.boostT > 0 && vf < max) vf = Math.min(max, vf + CFG.boostAccel * dt);
      else if (gas && !brake) {
        if (vf < 0) vf = Math.min(0, vf + CFG.brakeDecel * dt);
        else if (vf < max) vf = Math.min(max, vf + accel * (1 - 0.72 * (vf / max) ** 2) * dt);
        else vf = U.approach(vf, max, 26 * dt);
      } else if (brake) {
        if (vf > 0.5) vf -= CFG.brakeDecel * dt;
        else vf = U.approach(vf, -CFG.reverseSpeed, accel * 0.7 * dt);
      } else {
        vf = U.approach(vf, 0, CFG.coastDecel * dt);
        if (vf > max) vf = U.approach(vf, max, 26 * dt);
      }
    } else {
      vf *= 1 - 0.05 * dt;
    }

    // ---- steering / yaw ----
    const sp = Math.abs(vf);
    let turn = 0;
    if (this.drift) {
      const m = 1 + this.steer * this.drift * CFG.driftSteerRange;
      turn = this.drift * CFG.steerRate * CFG.driftTurn * 0.78 * m * this.tune.handling * Math.min(1, sp / 10);
    } else {
      const low = Math.min(1, sp / 7);
      const high = 1 - 0.2 * U.clamp((sp - base * 0.55) / (base * 0.6), 0, 1);
      turn = this.steer * CFG.steerRate * this.tune.handling * low * high * (vf < -0.3 ? -1 : 1);
    }
    if (!this.onGround) turn *= this.hopping ? 0.8 : CFG.airSteer;
    this.yawRate = turn;
    this.head += turn * dt;

    // ---- lateral grip ----
    let grip = CFG.grip * this.tune.grip * (ice ? CFG.iceGrip : 1);
    if (!this.onGround) grip *= 0.08;
    const slide = this.drift ? -this.drift * sp * CFG.driftSlide * 0.32 : 0;
    vl += (slide - vl) * (1 - Math.exp(-grip * dt));

    // ---- recompose in the new heading ----
    const nfx = Math.cos(this.head), nfz = Math.sin(this.head);
    this.vx = nfx * vf - nfz * vl;
    this.vz = nfz * vf + nfx * vl;
    this.vf = vf;

    // ---- drifting ----
    this.updateDrift(dt, ok, sp);

    // ---- integrate ----
    const px = this.x, pz = this.z, py = this.y;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.relocate();
    this.collideEdges(px, pz);
    this.updateVertical(dt, py, surf);

    // ---- visuals ----
    const sk = CFG.squashStretch;
    v.roll = U.lerp(v.roll, (-this.steer * 0.08 - this.drift * 0.16) * Math.min(1, sp / 15), 1 - Math.exp(-10 * dt));
    v.pitch = U.lerp(v.pitch, (gas && sp < base * 0.6 ? -0.05 : 0) + (brake && vf > 2 ? 0.06 : 0) + (this.onGround ? 0 : U.clamp(-this.vy * 0.012, -0.2, 0.2)), 1 - Math.exp(-8 * dt));
    v.squash = U.lerp(v.squash, 0, 1 - Math.exp(-9 * dt)) * (sk > 0 ? 1 : 0);
    v.wheel += vf * dt * 2.2;
    v.bump = Math.max(0, v.bump - dt * 3);
    v.shake = Math.max(0, v.shake - dt * 2.5);
  }

  updateDrift(dt, ok, sp) {
    const c = this.ctl, pc = this.prevCtl;
    const pressed = c.drift && !pc.drift;
    pc.drift = c.drift;
    if (!ok) {
      this.drift = 0;
      this.driftT = 0;
      this.driftLevel = 0;
      return;
    }
    if (pressed && this.onGround && !this.drift && this.race.state === 'race') {
      // hop! (drift direction is picked on landing)
      this.vy = CFG.hopVelocity;
      this.onGround = false;
      this.hopping = true;
      this.vis.squash = -0.25;
      this.race.emit('hop', this);
      // a hop off a ramp lip earns a trick boost on landing
      if (this.airT < 0.25 && this.lastLaunch && this.race.time - this.lastLaunch < 0.25) this.doTrick();
    }
    if (!this.onGround && pressed && !this.trick && this.lastLaunch && this.race.time - this.lastLaunch < 0.35) this.doTrick();
    if (this.drift) {
      if (!c.drift || sp < CFG.driftMinSpeed * 0.7) {
        this.endDrift(c.drift);
        return;
      }
      if (this.onGround && this.surface !== 'offroad' && this.surface !== 'mud') {
        const into = Math.max(0, this.steer * this.drift);
        this.driftT += dt * (0.9 + 0.6 * into) * this.tune.turbo;
      }
      const lvl = this.driftT >= CFG.driftCharge3 ? 3 : this.driftT >= CFG.driftCharge2 ? 2 : this.driftT >= CFG.driftCharge1 ? 1 : 0;
      if (lvl > this.driftLevel) this.race.emit('sparks', this, lvl);
      this.driftLevel = lvl;
    }
  }
  startDrift() {
    const c = this.ctl;
    if (!c.drift || this.drift || Math.abs(this.steer) < 0.2 || Math.abs(this.vf) < CFG.driftMinSpeed) return;
    this.drift = this.steer > 0 ? 1 : -1;
    this.driftT = 0;
    this.driftLevel = 0;
  }
  endDrift(held) {
    if (this.driftLevel > 0) {
      const t = [0, CFG.miniTurbo1, CFG.miniTurbo2, CFG.miniTurbo3][this.driftLevel] * this.tune.turbo;
      this.giveBoost(t, 'turbo' + this.driftLevel);
    }
    this.drift = 0;
    this.driftT = 0;
    this.driftLevel = 0;
  }
  doTrick() {
    this.trick = true;
    this.vis.spinTrick = 1;
    this.race.emit('trick', this);
  }

  giveBoost(t, kind) {
    if (t <= 0) return;
    // boost pads re-trigger every frame you sit on them: only announce fresh boosts
    const announce = this.boostT <= 0.05 || (kind !== 'pad' && kind !== this.boostKind);
    this.boostT = Math.max(this.boostT, t);
    this.boostKind = kind;
    if (announce) this.race.emit('boost', this, kind);
  }

  relocate() {
    const loc = this.track.locate(this.x, this.z, this.y, this.path, this.loc || (this.loc = {}));
    if (loc) {
      this.loc = loc;
      this.path = loc.path;
      this.lostT = 0;
    } else {
      // over the void, beyond every road: keep the last frame's road for reference
      this.lostT = (this.lostT || 0) + 1;
      if (this.loc) this.loc.excess = 99;
    }
  }

  // Walls bounce, drops let you fall.
  collideEdges(px, pz) {
    const loc = this.loc;
    if (!loc || loc.excess > 4) return;
    const lim = loc.hw + loc.sh - KART_R * 0.8;
    const ad = Math.abs(loc.d);
    if (ad <= lim) return;
    const side = loc.d > 0 ? 1 : -1;
    const p = loc.path;
    const flag = side > 0 ? p.wallR[loc.i] : p.wallL[loc.i];
    if (flag === 0) return; // a drop: no wall, gravity will take over
    if (this.y < loc.y - 1.2) return; // already below the deck
    // push back inside
    const push = ad - lim;
    this.x -= loc.nx * push * side;
    this.z -= loc.nz * push * side;
    const vn = (this.vx * loc.nx + this.vz * loc.nz) * side;
    if (vn > 0) {
      const k = 1 + CFG.wallBounce;
      this.vx -= loc.nx * side * vn * k;
      this.vz -= loc.nz * side * vn * k;
      const sp = this.speed || 1;
      const loss = 1 - CFG.wallSpeedLoss * U.clamp(vn / sp, 0, 1);
      this.vx *= loss;
      this.vz *= loss;
      if (vn > 4) {
        this.race.emit('wall', this, vn);
        this.vis.bump = Math.min(1, vn / 20);
        if (vn > 9 && this.drift) this.endDrift(false);
      }
    }
    this.relocate();
  }

  updateVertical(dt, py, surf) {
    const g = this.track.groundY(this.loc && this.loc.excess < 4 ? this.loc : null);
    if (this.onGround) {
      if (g === -Infinity) {
        this.onGround = false;
        this.airT = 0;
        return;
      }
      const yAir = this.y + this.vy * dt - 0.5 * CFG.gravity * dt * dt;
      if (g < yAir - 0.05) {
        // the ground fell away faster than gravity: launch!
        this.onGround = false;
        this.airT = 0;
        if (surf === 'ramp') {
          this.vy *= CFG.rampLaunch;
          this.lastLaunch = this.race.time;
          this.race.emit('launch', this);
        }
        this.y = yAir;
        this.vy -= CFG.gravity * dt;
        return;
      }
      this.vy = (g - this.y) / dt;
      if (this.vy > 30) this.vy = 30;
      this.y = g;
      this.trackSafe(dt);
      return;
    }
    // airborne
    this.airT += dt;
    this.vy -= CFG.gravity * dt;
    this.y += this.vy * dt;
    if (g !== -Infinity && this.y <= g) {
      if (this.y >= g - 0.9 || this.airT < 0.05) this.land(g);
    }
    const ref = this.loc ? this.loc.y : py;
    if (this.y < ref - 9 || this.lostT > 120) this.startFall();
  }

  land(g) {
    const impact = -this.vy;
    this.y = g;
    this.vy = 0;
    this.onGround = true;
    this.vis.squash = Math.min(0.35, 0.05 + impact * 0.018) * CFG.squashStretch;
    if (this.airT > 0.35) this.race.emit('land', this, impact);
    if (this.hopping) {
      this.hopping = false;
      this.startDrift();
    }
    if (this.trick) {
      this.trick = false;
      this.giveBoost(CFG.trickBoostTime, 'trick');
    }
    this.airT = 0;
  }

  // Remember where we last drove safely, for the cloud rescue.
  trackSafe(dt) {
    this.safeT += dt;
    const loc = this.loc;
    if (this.safeT < 0.25 || !loc || !loc.onRoad || loc.excess > -1) return;
    if (this.track.zoneAt(loc, 'gap') || this.track.zoneAt(loc, 'ramp')) return;
    this.safeT = 0;
    const p = loc.path;
    // keep rescues off the very edges and away from gate mouths
    const s = loc.s, d = U.clamp(loc.d, -loc.hw * 0.4, loc.hw * 0.4);
    const pt = p.point(s, d);
    this.lastSafe = { x: pt.x, y: pt.y, z: pt.z, head: pt.head, path: p, s };
  }

  startFall() {
    if (this.falling) return;
    this.falling = true;
    this.fallT = 0;
    this.drift = 0;
    this.boostT = 0;
    // fell into a jump's chasm? get set down on the far side instead of in front of it again
    const loc = this.loc;
    if (loc && loc.path) {
      for (const z of loc.path.zones) {
        if (z.kind !== 'gap' || loc.s < z.s0 - 24 || loc.s > z.s1 + 3) continue;
        const p = loc.path.point(z.s1 + 6, 0);
        this.lastSafe = { x: p.x, y: p.y, z: p.z, head: p.head, path: loc.path, s: z.s1 + 6 };
      }
    }
    this.race.emit('fall', this);
    // drop a third of your coins into the void
    this.loseCoins(Math.min(this.coins, 3));
  }
  updateFall(dt) {
    this.fallT += dt;
    if (this.fallT < 0.6) {
      this.vy -= CFG.gravity * dt;
      this.y += this.vy * dt;
      this.x += this.vx * dt * 0.5;
      this.z += this.vz * dt * 0.5;
      return;
    }
    if (this.fallT < CFG.respawnTime + 0.6) {
      // the rescue cloud carries you back
      const s = this.lastSafe;
      const k = U.clamp((this.fallT - 0.6) / CFG.respawnTime, 0, 1);
      if (!this.rescueFrom) this.rescueFrom = { x: this.x, y: Math.max(this.y, s.y - 6), z: this.z };
      const e = U.easeInOut(k);
      this.x = U.lerp(this.rescueFrom.x, s.x, e);
      this.z = U.lerp(this.rescueFrom.z, s.z, e);
      this.y = U.lerp(this.rescueFrom.y, s.y + 4, e) + Math.sin(k * Math.PI) * 3;
      this.head = s.head;
      return;
    }
    const s = this.lastSafe;
    this.falling = false;
    this.rescueFrom = null;
    this.setPos(s.x, s.y + 0.6, s.z, s.head);
    this.onGround = false;
    this.airT = 0.1;
    this.race.emit('respawn', this);
  }

  // ---------- damage ----------
  spinOut(t, cause) {
    if (this.starT > 0 || this.falling) return false;
    if (!this.bot && CFG.godMode) return false;
    if (this.spinT > 0.2) return false;
    this.spinT = t;
    this.spinTotal = t;
    this.drift = 0;
    this.driftT = 0;
    this.driftLevel = 0;
    this.boostT = 0;
    // shed speed fast
    this.vx *= 0.35;
    this.vz *= 0.35;
    this.loseCoins(Math.min(this.coins, cause === 'banana' ? 1 : 3));
    this.race.emit('hit', this, cause);
    return true;
  }
  squish(t) {
    if (this.starT > 0) return false;
    if (!this.bot && CFG.godMode) return false;
    if (this.squishT > 0) return false;
    this.squishT = t;
    this.vx *= 0.2;
    this.vz *= 0.2;
    this.loseCoins(Math.min(this.coins, 2));
    this.race.emit('squish', this);
    return true;
  }
  loseCoins(n) {
    if (n <= 0) return;
    this.coins -= n;
    this.race.emit('coinloss', this, n);
  }
  addCoins(n) {
    const before = this.coins;
    this.coins = Math.min(10, this.coins + n);
    this.coinsGot += n;
    this.race.emit('coin', this, n, before);
  }
}
