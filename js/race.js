'use strict';
// Race runtime (pure simulation): the grid, the 3-2-1 countdown with rocket starts, laps (or the
// sections of a point-to-point run) and positions, kart-to-kart bumps, bots (with
// rubber-banding), items and the finish. A staff ghost may drive along without touching anyone.
// Everything that happens is pushed onto an event queue that the screen, the speakers and the
// phones each read from.

class Race {
  // o: { track, laps, cc, racers: [{name, config, bot, ghost, slot, color}], items, demo, seed, intro }
  constructor(o) {
    this.opts = o;
    this.track = getTrack(o.track);
    const T = this.track;
    // a point-to-point course is one run from the start to the finish, split into sections
    this.p2p = T.p2p;
    this.laps = this.p2p ? 1 : o.laps || 3;
    this.goal = this.p2p ? T.lapLen : this.laps * T.lapLen; // distance to race
    this.sections = T.sections;
    this.ccName = o.cc || 150;
    this.cc = CC_CLASSES[this.ccName] || CC_CLASSES[150];
    this.itemsOn = o.items !== false;
    this.demo = !!o.demo;
    this.rnd = U.rng(o.seed !== undefined ? o.seed : (Math.random() * 1e9) | 0);
    this.time = 0;
    this.raceTime = 0;
    this.state = o.intro ? 'intro' : 'countdown';
    this.introT = o.intro || 0;
    this.introEnd = o.intro ? -1 : 0; // race.time when the intro ended
    this.count = 3;
    this.doneT = 0;
    this.ghostTime = 0;
    this.events = [];
    this.karts = o.racers.map((r, i) => new Kart(this, i, r));
    this.brains = this.karts.map((k) => (k.bot ? new BotBrain(k, this.rnd) : null));
    // humans line up at the back of the grid, like a Grand Prix; a staff ghost starts in the
    // same slot as the first human (it passes straight through everyone)
    const order = this.karts.filter((k) => !k.ghost).sort((a, b) => (a.bot === b.bot ? a.idx - b.idx : a.bot ? -1 : 1));
    const human = order.find((k) => !k.bot);
    order.forEach((k, slot) => this.toGrid(k, slot));
    let spare = order.length;
    for (const k of this.karts) {
      if (!k.ghost) continue;
      this.toGrid(k, human ? human.gridSlot : spare++);
      this.brains[k.idx].startSkill = 0; // and nails the rocket start
    }
    this.items = new ItemSystem(this);
    this.rank();
  }

  toGrid(k, slot) {
    const T = this.track;
    const g = T.gridSlot(slot);
    k.setPos(g.x, g.y + 0.05, g.z, g.head);
    k.gridSlot = slot;
    // progress starts at the start line: negative on the grid behind it
    if (this.p2p) k.totalS = k.lastMainS - T.startS;
    else k.totalS = k.lastMainS > T.length / 2 ? k.lastMainS - T.length : k.lastMainS;
    k.section = this.p2p ? T.sectionAt(T.startS + k.totalS) : 0;
    k.gasAt = null;
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

  // Cargo-plane intro (planeDrop courses), visual only: how high above its grid slot to draw
  // kart k, whether its glider is open, and where the plane is ({x, y, z, head} or null).
  // The plane flies along the start straight 42 above the line; the karts ride in it, drop out
  // on their gliders as it passes over the middle of the grid (u = 0.22) and settle onto their
  // slots before the countdown. The plane flies on and is gone a few seconds into the countdown.
  introOffset(k) {
    const T = this.track;
    if (!T.def.planeDrop) return { y: 0, glide: false, plane: null };
    const intro = this.opts.intro || 0;
    const u = intro > 0 ? U.clamp(1 - this.introT / intro, 0, 1) : 1;
    let y = 0, glide = false;
    if (u <= 0.22) y = 40;
    else if (u < 0.84) {
      y = 40 * (1 - U.easeInOut((u - 0.22) / 0.62));
      glide = true;
    }
    let plane = null;
    if (intro > 0) {
      const after = this.introEnd >= 0 ? this.time - this.introEnd : 0;
      const up = u + after / intro;
      if (up < 1.8) {
        const p = T.main.point(T.startS, 0);
        // over the grid's middle (16 behind the line) at u = 0.22, 220 past the line at u = 1
        const ds = -16 + ((220 + 16) / 0.78) * (up - 0.22);
        plane = { x: p.x + p.tx * ds, y: p.yc + 42, z: p.z + p.tz * ds, head: p.head };
      }
    }
    return { y, glide, plane };
  }

  update(dt) {
    this.time += dt;
    if (this.state === 'intro') {
      this.introT -= dt;
      if (this.introT <= 0) {
        this.state = 'countdown';
        this.introEnd = this.time;
      }
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
      k.prevY = k.y;
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
      if (a.falling || a.ghost) continue;
      for (let j = i + 1; j < ks.length; j++) {
        const b = ks[j];
        if (b.falling || b.ghost) continue;
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
        // on anti-gravity road a bump sends both karts spinning off with a boost
        if ((a.antigrav || b.antigrav) && vrel < -1) {
          a.spinBoost();
          b.spinBoost();
        }
        // spiky racers prick whoever rams them
        if (a.config.character === 'thornbun' && vrel < -6 && b.starT <= 0) b.spinOut(0.5, 'thorns');
        if (b.config.character === 'thornbun' && vrel < -6 && a.starT <= 0) a.spinOut(0.5, 'thorns');
      }
    }
  }

  progress(dt) {
    const T = this.track;
    for (const k of this.karts) {
      k.progT = (k.progT || 0) + dt; // time since progress was last measured
      if (!k.loc || k.falling || k.loc.excess > 3) continue;
      const d = T.deltaS(k.lastMainS, k.loc.mainS);
      k.lastMainS = k.loc.mainS;
      const carried = k.teleported;
      k.teleported = false;
      // a big jump is only real if the kart could have covered it since we last looked (a
      // glider sailing over a hairpin, a rescue); otherwise it is a flicker between roads
      const reach = (k.speed + 12) * k.progT + 20;
      k.progT = 0;
      if (Math.abs(d) > 60 && !carried && Math.abs(d) > reach) continue;
      k.totalS += d;
      // wrong way?
      const p = k.loc.path;
      const along = k.vx * p.tx[k.loc.i] + k.vz * p.tz[k.loc.i];
      k.wrongT = along < -3 && !k.finished ? k.wrongT + dt : Math.max(0, k.wrongT - dt * 3);
      if (this.state !== 'race' || k.finished) continue;
      const lap = U.clamp(Math.floor(k.totalS / T.lapLen) + 1, 1, this.laps);
      if (lap > k.lap && k.lap > 0) {
        k.lapTimes.push(this.raceTime - k.lapStart);
        k.lapStart = this.raceTime;
        if (!k.ghost) this.emit(lap === this.laps ? 'finallap' : 'lap', k, lap);
      }
      k.lap = Math.max(k.lap, lap);
      if (this.p2p) {
        // sections only ever count up (a rescue just behind a checkpoint doesn't undo it)
        const sec = T.sectionAt(T.startS + k.totalS);
        if (sec > k.section) {
          k.section = sec;
          k.splits.push(this.raceTime);
          if (!k.ghost) this.emit(sec === this.sections.length ? 'finalsection' : 'section', k, sec);
        }
      }
      if (k.totalS >= this.goal && !this.demo) this.finish(k);
    }
  }

  finish(k) {
    k.finished = true;
    k.finishTime = this.raceTime;
    k.lapTimes.push(this.raceTime - k.lapStart);
    if (k.ghost) {
      this.ghostTime = this.raceTime;
      return;
    }
    this.rank();
    this.emit('finish', k, k.place);
    if (!k.bot) this.setAutopilot(k, true);
  }

  // Places for everyone but staff ghosts (they keep place 0 and stay out of race.order).
  rank() {
    const sorted = this.karts.filter((k) => !k.ghost).sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished) return a.finishTime - b.finishTime;
      return b.totalS - a.totalS;
    });
    sorted.forEach((k, i) => {
      const p = i + 1;
      if (k.place !== p && this.state === 'race' && !k.bot && p < k.place) this.emit('overtake', k, p);
      k.place = p;
    });
    for (const k of this.karts) if (k.ghost) k.place = 0;
    this.order = sorted;
    this.leaderS = sorted[0] ? sorted[0].totalS : 0;
    this.lapLen = this.track.lapLen;
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
      if (k.ghost) {
        k.rubber = 0;
        continue;
      }
      const diff = best - k.totalS;
      let r = U.clamp(diff / 110, -1, 1) * CFG.rubberBand;
      if (r < 0) r *= 0.7;
      k.rubber = r;
    }
  }

  checkDone(dt) {
    const humans = this.humans;
    if (!humans.length) {
      // no humans: a bots-only race ends when everyone is home (staff ghosts don't count)
      if (!this.demo && this.order.every((k) => k.finished)) this.state = 'done';
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

  // Final standings (staff ghosts left out); karts still on track get an estimated time from
  // their pace. splits: race time at the start of each later section (point-to-point).
  results() {
    return this.order.map((k) => {
      let time = k.finishTime;
      if (!k.finished) {
        const left = Math.max(0, this.goal - k.totalS);
        const pace = Math.max(8, k.totalS / Math.max(1, this.raceTime));
        time = this.raceTime + left / pace;
      }
      return {
        idx: k.idx, name: k.name, bot: k.bot, slot: k.slot, place: k.place, time, finished: k.finished,
        coins: k.coinsGot, config: k.config, routes: Object.keys(k.routes), bestLap: k.lapTimes.length ? Math.min(...k.lapTimes) : 0,
        splits: k.splits.slice(),
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
