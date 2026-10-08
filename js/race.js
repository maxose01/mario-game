'use strict';
// Race runtime (pure simulation): the grid, the 3-2-1 countdown with rocket starts, laps and
// positions, kart-to-kart bumps, bots (with rubber-banding), items and the finish.
// Everything that happens is pushed onto an event queue that the screen, the speakers and the
// phones each read from.

class Race {
  // o: { track, laps, cc, racers: [{name, config, bot, slot, color}], items, demo, seed, intro }
  constructor(o) {
    this.opts = o;
    this.track = getTrack(o.track);
    this.laps = o.laps || 3;
    this.ccName = o.cc || 150;
    this.cc = CC_CLASSES[this.ccName] || CC_CLASSES[150];
    this.itemsOn = o.items !== false;
    this.demo = !!o.demo;
    this.rnd = U.rng(o.seed !== undefined ? o.seed : (Math.random() * 1e9) | 0);
    this.time = 0;
    this.raceTime = 0;
    this.state = o.intro ? 'intro' : 'countdown';
    this.introT = o.intro || 0;
    this.count = 3;
    this.doneT = 0;
    this.events = [];
    this.karts = o.racers.map((r, i) => new Kart(this, i, r));
    this.brains = this.karts.map((k) => (k.bot ? new BotBrain(k, this.rnd) : null));
    // humans line up at the back of the grid, like a Grand Prix
    const order = this.karts.slice().sort((a, b) => (a.bot === b.bot ? a.idx - b.idx : a.bot ? -1 : 1));
    order.forEach((k, slot) => {
      const g = this.track.gridSlot(slot);
      k.setPos(g.x, g.y + 0.05, g.z, g.head);
      k.gridSlot = slot;
      const L = this.track.length;
      k.totalS = k.lastMainS > L / 2 ? k.lastMainS - L : k.lastMainS;
      k.gasAt = null;
    });
    this.items = new ItemSystem(this);
    this.rank();
  }

  emit(type, kart, a, b) {
    this.events.push({ type, kart, a, b, t: this.time });
    if (this.events.length > 400) this.events.splice(0, 100);
  }
  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  get humans() {
    return this.karts.filter((k) => !k.bot);
  }

  setAutopilot(k, on) {
    k.auto = on;
    if (on && !this.brains[k.idx]) this.brains[k.idx] = new BotBrain(k, this.rnd);
  }

  update(dt) {
    this.time += dt;
    if (this.state === 'intro') {
      this.introT -= dt;
      if (this.introT <= 0) this.state = 'countdown';
    } else if (this.state === 'countdown') {
      const before = Math.ceil(this.count);
      this.count -= dt;
      const now = Math.ceil(this.count);
      if (now !== before && now > 0) this.emit('count', null, now);
      if (this.count <= 0) this.go();
    } else if (this.state === 'race' || this.state === 'done') {
      this.raceTime += dt;
    }
    // drivers
    for (const k of this.karts) {
      const b = this.brains[k.idx];
      if (b && (k.bot || k.auto)) b.update(dt);
      if (this.state === 'countdown') this.watchStart(k);
    }
    for (const k of this.karts) {
      k.prevX = k.x;
      k.prevZ = k.z;
      const press = k.ctl.item && !k.prevCtl.item;
      k.prevCtl.item = k.ctl.item;
      if (press && this.state === 'race') this.items.use(k);
      k.update(dt);
    }
    this.collideKarts();
    this.items.update(dt);
    this.progress(dt);
    this.rank();
    this.rubberBand();
    if (this.state === 'race') this.checkDone(dt);
  }

  // Rocket start: hit the gas as the "1" shows. Too early and the engine floods.
  watchStart(k) {
    if (k.ctl.gas) {
      if (k.gasAt === null) k.gasAt = this.count;
    } else k.gasAt = null;
  }
  go() {
    this.state = 'race';
    this.count = 0;
    this.emit('go');
    for (const k of this.karts) {
      if (k.gasAt === null) continue;
      if (k.gasAt > 0.25 && k.gasAt <= 1.15) {
        k.giveBoost(CFG.startBoostTime, 'rocket');
        this.emit('rocket', k);
      } else if (k.gasAt > 1.7) {
        k.stallT = 0.8;
        this.emit('stall', k);
      }
    }
  }

  collideKarts() {
    const ks = this.karts;
    const R2 = KART_R * 2;
    for (let i = 0; i < ks.length; i++) {
      const a = ks[i];
      if (a.falling) continue;
      for (let j = i + 1; j < ks.length; j++) {
        const b = ks[j];
        if (b.falling) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const dd = dx * dx + dz * dz;
        if (dd >= R2 * R2 || Math.abs(a.y - b.y) > 1.6) continue;
        const d = Math.sqrt(dd) || 0.01;
        const nx = dx / d, nz = dz / d;
        // stars bowl everyone over
        if (a.starT > 0 && b.starT <= 0) {
          b.spinOut(CFG.spinOutTime, 'star');
          continue;
        }
        if (b.starT > 0 && a.starT <= 0) {
          a.spinOut(CFG.spinOutTime, 'star');
          continue;
        }
        const ma = a.tune.mass, mb = b.tune.mass;
        const over = R2 - d;
        a.x -= nx * over * (mb / (ma + mb));
        a.z -= nz * over * (mb / (ma + mb));
        b.x += nx * over * (ma / (ma + mb));
        b.z += nz * over * (ma / (ma + mb));
        const vrel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (vrel < 0) {
          const J = (-(1.3) * vrel) / (1 / ma + 1 / mb);
          a.vx -= (J / ma) * nx;
          a.vz -= (J / ma) * nz;
          b.vx += (J / mb) * nx;
          b.vz += (J / mb) * nz;
        }
        // a sideways shove, heavier karts shove harder
        const shove = CFG.bumpForce * 0.06;
        a.vx -= nx * shove * (mb / ma);
        a.vz -= nz * shove * (mb / ma);
        b.vx += nx * shove * (ma / mb);
        b.vz += nz * shove * (ma / mb);
        if (vrel < -2.5) {
          this.emit('bump', a, b, -vrel);
          a.vis.bump = b.vis.bump = Math.min(1, -vrel / 12);
        }
        // spiky racers prick whoever rams them
        if (a.config.character === 'thornbun' && vrel < -6 && b.starT <= 0) b.spinOut(0.5, 'thorns');
        if (b.config.character === 'thornbun' && vrel < -6 && a.starT <= 0) a.spinOut(0.5, 'thorns');
      }
    }
  }

  progress(dt) {
    const L = this.track.length;
    for (const k of this.karts) {
      if (!k.loc || k.falling || k.loc.excess > 3) continue;
      let d = k.loc.mainS - k.lastMainS;
      if (d > L / 2) d -= L;
      if (d < -L / 2) d += L;
      k.lastMainS = k.loc.mainS;
      if (Math.abs(d) > 60) continue; // a rescue teleport, not driving
      k.totalS += d;
      // wrong way?
      const p = k.loc.path;
      const along = k.vx * p.tx[k.loc.i] + k.vz * p.tz[k.loc.i];
      k.wrongT = along < -3 && !k.finished ? k.wrongT + dt : Math.max(0, k.wrongT - dt * 3);
      if (this.state !== 'race' || k.finished) continue;
      const lap = U.clamp(Math.floor(k.totalS / L) + 1, 1, this.laps);
      if (lap > k.lap && k.lap > 0) {
        k.lapTimes.push(this.raceTime - k.lapStart);
        k.lapStart = this.raceTime;
        this.emit(lap === this.laps ? 'finallap' : 'lap', k, lap);
      }
      k.lap = Math.max(k.lap, lap);
      if (k.totalS >= this.laps * L && !this.demo) this.finish(k);
    }
  }

  finish(k) {
    k.finished = true;
    k.finishTime = this.raceTime;
    k.lapTimes.push(this.raceTime - k.lapStart);
    this.rank();
    this.emit('finish', k, k.place);
    if (!k.bot) this.setAutopilot(k, true);
  }

  rank() {
    const L = this.track.length;
    const sorted = this.karts.slice().sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished) return a.finishTime - b.finishTime;
      return b.totalS - a.totalS;
    });
    sorted.forEach((k, i) => {
      const p = i + 1;
      if (k.place !== p && this.state === 'race' && !k.bot && p < k.place) this.emit('overtake', k, p);
      k.place = p;
    });
    this.order = sorted;
    this.leaderS = sorted[0] ? sorted[0].totalS : 0;
    this.lapLen = L;
  }

  rubberBand() {
    const humans = this.karts.filter((k) => !k.bot && !k.finished);
    if (!humans.length) {
      for (const k of this.karts) k.rubber = 0;
      return;
    }
    const best = Math.max(...humans.map((h) => h.totalS));
    for (const k of this.karts) {
      if (!k.bot) continue;
      const diff = best - k.totalS;
      let r = U.clamp(diff / 110, -1, 1) * CFG.rubberBand;
      if (r < 0) r *= 0.7;
      k.rubber = r;
    }
  }

  checkDone(dt) {
    const humans = this.humans;
    if (!humans.length) {
      // no humans: a bots-only race ends when everyone is home
      if (!this.demo && this.karts.every((k) => k.finished)) this.state = 'done';
      return;
    }
    if (humans.every((k) => k.finished)) {
      this.doneT += dt;
      if (this.doneT > 2.5) {
        this.state = 'done';
        this.emit('done');
      }
    }
  }

  // Final standings; karts still on track get an estimated time from their pace.
  results() {
    const L = this.track.length;
    return this.order.map((k) => {
      let time = k.finishTime;
      if (!k.finished) {
        const left = Math.max(0, this.laps * L - k.totalS);
        const pace = Math.max(8, k.totalS / Math.max(1, this.raceTime));
        time = this.raceTime + left / pace;
      }
      return {
        idx: k.idx, name: k.name, bot: k.bot, slot: k.slot, place: k.place, time, finished: k.finished,
        coins: k.coinsGot, config: k.config, routes: Object.keys(k.routes), bestLap: k.lapTimes.length ? Math.min(...k.lapTimes) : 0,
      };
    });
  }
}

// Coins added to the garage bank for a finish: everything picked up plus a placing bonus.
function placeBonus(place, count) {
  const table = [15, 11, 8, 6, 4, 3, 2, 1];
  const i = Math.round(((place - 1) / Math.max(1, count - 1)) * 7);
  return table[U.clamp(i, 0, 7)];
}

function fmtTime(t) {
  if (!isFinite(t) || t <= 0) return '--:--.--';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}
