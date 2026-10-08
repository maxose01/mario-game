'use strict';
// Bot drivers (pure simulation). Each bot picks a road (the main road, a side road at a fork,
// or a hidden route when it carries a key), aims at a point ahead on its own lane, takes the
// inside of corners, hop-drifts long bends for mini-turbos, dodges hazards (leading the moving
// ones), flies its glider down the middle and through boost rings, and uses items with a little
// cunning. After the finish of a point-to-point run it rolls to a stop in the run-out.

class BotBrain {
  constructor(kart, rnd) {
    this.k = kart;
    this.rnd = rnd;
    this.bias = (rnd() - 0.5) * 0.9; // preferred lane, fraction of half-width
    this.laneT = 0;
    this.itemT = 1 + rnd() * 3;
    this.wantKey = false;
    this.keyLap = -1;
    this.dodge = 0;
    this.dodgeT = 0;
    this.route = null; // branch path being followed
    this.forks = {}; // open branch id -> {lap, take}: the route picked at each fork
    this.target = { x: 0, z: 0 };
    this.stuckT = 0;
    this.reverseT = 0;
    this.startSkill = rnd();
  }

  update(dt) {
    const k = this.k, race = k.race, T = k.track, c = k.ctl;
    c.item = false;
    c.back = false;
    if (race.state === 'countdown') {
      // most bots nail the rocket start
      c.gas = this.startSkill < 0.65 ? race.count < 0.75 : race.count < 0.2;
      c.steer = 0;
      return;
    }
    if (!k.loc) {
      c.gas = true;
      c.steer = 0;
      return;
    }
    if (race.p2p && (k.finished || k.totalS >= race.goal)) {
      this.runOut();
      return;
    }
    this.laneT -= dt;
    this.driftWait = (this.driftWait || 0) - dt;
    if (this.laneT <= 0) {
      this.laneT = 2 + this.rnd() * 4;
      this.bias = U.clamp(this.bias + (this.rnd() - 0.5) * 0.5, -0.55, 0.55);
    }
    this.chooseRoute();
    if (this.unstick(dt)) return;
    if (this.escapePocket(dt)) return;
    const path = this.route || T.main;
    // where am I along the path I want to follow?
    let s, d, hw;
    if (k.path === path) {
      s = k.loc.s;
      d = k.loc.d;
      hw = k.loc.hw;
    } else {
      const q = nearestOnPath(T, path, k.x, k.z);
      s = q.s;
      d = q.d;
      hw = q.hw;
    }
    if (k.gliding) {
      this.glide(path, s);
      return;
    }
    const sp = Math.max(0, k.vf);
    const look = 7 + sp * 0.42;
    // curvature ahead decides lane (inside line) and drifting
    const cAhead = curvatureAhead(path, s + 4, 26);
    const cFar = curvatureAhead(path, s + 14, 30);
    let lane = this.bias * 0.6 - U.clamp(cFar * 34, -0.65, 0.65);
    if (this.wantKey && this.keyTarget) lane = U.clamp(this.keyTarget.d / hw, -0.95, 0.95);
    // dodge items and hazards ahead
    this.dodgeT -= dt;
    if (this.dodgeT <= 0) {
      this.dodge = this.findDodge(path, s, lane * hw);
      this.dodgeT = 0.15;
    }
    lane = U.clamp(lane + this.dodge, -0.85, 0.85);
    const tp = path.point(Math.min(path.closed ? s + look : path.length, s + look), lane * hw);
    let tx = tp.x, tz = tp.z;
    if (path.branch && s + look > path.length) {
      // running off the end of a branch: aim down the main road after it
      const ms = T.mainS(path, path.length) + (s + look - path.length);
      const mp = T.main.point(ms, lane * T.main.hw[T.main.indexAt(ms)]);
      tx = mp.x;
      tz = mp.z;
    }
    this.target.x = tx;
    this.target.z = tz;
    const want = Math.atan2(tz - k.z, tx - k.x);
    let err = want - k.head;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    const gain = 2.6 * CFG.botCornering;
    let steer = U.clamp(err * gain, -1, 1);
    // the yaw rate this bend needs, plus a correction toward the aim point
    const yawWant = cAhead * sp + err * 2.2 * CFG.botCornering;


    // drifting: hop into long bends, steer the slide to hold the line, release on the exit
    const bend = Math.abs(cFar) > 1 / 75 && Math.sign(cAhead) === Math.sign(cFar);
    if (CFG.botDrift && !k.drift && !k.hopping && bend && sp > k.maxNow * 0.6 && Math.abs(err) < 0.5 && k.onGround && this.driftWait <= 0) {
      c.drift = true;
      steer = Math.sign(cFar);
    } else if (k.drift) {
      // drift yaw = base * (1 + steer*drift*range): solve for the steer that gives yawWant
      const base = CFG.steerRate * CFG.driftTurn * 0.78 * k.tune.handling * Math.min(1, sp / 10);
      const m = yawWant / (k.drift * base || 1);
      steer = k.drift * U.clamp((m - 1) / (CFG.driftSteerRange || 1), -1, 1);
      const sameWay = Math.sign(cAhead) === k.drift && Math.abs(cAhead) > 1 / 160;
      const tooTight = m < 1 - CFG.driftSteerRange - 0.35;
      c.drift = sameWay && !tooTight;
      if (k.driftLevel >= 2 && Math.abs(cFar) < 1 / 110) c.drift = false;
      if (!c.drift) this.driftWait = 0.6;
    } else if (k.hopping) {
      c.drift = true;
      steer = Math.sign(cFar) || steer;
    } else c.drift = false;
    c.steer = steer;
    this.lastSteer = steer;
    c.gas = true;
    c.brake = false;
    // ease off for very sharp turns at speed
    if (!k.drift && Math.abs(err) > 0.9 && sp > 12) c.gas = false;
    this.thinkItems(dt, path, s);
  }

  // Gliding: fly down the middle of the road far ahead, or straight through the next boost
  // ring (aiming a little past its centre so the glider crosses it square on).
  glide(path, s) {
    const k = this.k, c = k.ctl;
    const sp = Math.max(0, k.vf);
    const ring = this.ringAhead(path, s);
    let tx, tz;
    if (ring) {
      tx = ring.x + ring.tx * 10;
      tz = ring.z + ring.tz * 10;
    } else {
      const tp = path.point(Math.min(path.closed ? s + 60 : path.length, s + 14 + sp * 0.8), 0);
      tx = tp.x;
      tz = tp.z;
    }
    this.target.x = tx;
    this.target.z = tz;
    let err = Math.atan2(tz - k.z, tx - k.x) - k.head;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    c.steer = U.clamp(err * 3, -1, 1);
    this.lastSteer = c.steer;
    c.gas = true;
    c.brake = false;
    c.drift = false;
    this.stuckT = 0;
  }
  // The nearest boost ring ahead on this path that is still worth steering for.
  ringAhead(path, s) {
    let best = null, bestA = Infinity;
    for (const r of this.k.race.items.rings) {
      if (r.path !== path) continue;
      const a = path.closed ? (((r.s - s) % path.length) + path.length) % path.length : r.s - s;
      if (a < 4 || a > 90 || a >= bestA) continue;
      best = r;
      bestA = a;
    }
    return best;
  }

  // Past the finish of a point-to-point run: ease off, then brake to a stop in a lane picked
  // by finishing place, so the field parks side by side instead of piling into the barrier.
  runOut() {
    const k = this.k, c = k.ctl, T = k.track, race = k.race;
    const path = T.main;
    const q = k.path === path ? k.loc : nearestOnPath(T, path, k.x, k.z);
    const place = Math.max(1, k.place);
    const lane = (((place - 1) % 4) - 1.5) * 0.4;
    const tp = path.point(Math.min(path.length, q.s + 12), lane * q.hw);
    let err = Math.atan2(tp.z - k.z, tp.x - k.x) - k.head;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    c.steer = U.clamp(err * 2.6, -1, 1);
    const past = k.totalS - race.goal;
    c.gas = false;
    // the first four park further down the run-out than the rest
    c.brake = k.vf > 1.5 && past > (place <= 4 ? 14 : 2);
    c.drift = false;
    c.item = false;
    this.stuckT = 0;
  }

  // Pinned against a wall or a door? Back up for a moment with the wheel turned; if that
  // gets nowhere either (reversing into something), drive forward on the opposite lock.
  unstick(dt) {
    const k = this.k, c = k.ctl;
    if (Math.abs(k.vf) < 1.6 && k.race.time > 4 && k.controllable && k.onGround) this.stuckT += dt;
    else this.stuckT = Math.max(0, this.stuckT - dt * 2);
    if (this.stuckT > 0.9) {
      this.unstickFwd = this.reverseT > 0 ? !this.unstickFwd : false;
      this.reverseT = 0.8 + this.rnd() * 0.4;
      this.reverseSteer = this.lastSteer > 0 ? -1 : 1;
      if (this.unstickFwd) this.reverseSteer = -this.reverseSteer;
      this.stuckT = 0;
    }
    if (this.reverseT <= 0) {
      this.unstickFwd = false;
      return false;
    }
    this.reverseT -= dt;
    c.gas = !!this.unstickFwd;
    c.brake = !this.unstickFwd;
    c.steer = this.reverseSteer;
    c.drift = false;
    c.item = false;
    return true;
  }

  // Wandered into a hidden route's mouth without a key and the door is shut: turn around on
  // the branch and drive back out the way we came.
  escapePocket(dt) {
    const k = this.k, c = k.ctl;
    const br = k.path;
    if (this.route || !br || !br.branch || k.key) return false;
    const gate = k.race.items.gates.find((g) => g.path === br);
    if (!gate || gate.openT > 0.3 || k.loc.i > gate.i + 2) return false;
    const p = br.point(Math.max(0, k.loc.s - 12), 0);
    const want = Math.atan2(p.z - k.z, p.x - k.x);
    let err = want - k.head;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    c.drift = false;
    c.item = false;
    if (Math.abs(err) > 2.2 && k.vf < 3) {
      // facing the door: reverse while turning
      c.gas = false;
      c.brake = true;
      c.steer = -Math.sign(err);
    } else {
      c.gas = true;
      c.brake = false;
      c.steer = U.clamp(err * 2.5, -1, 1);
    }
    this.lastSteer = c.steer;
    return true;
  }

  // Which way at a fork? One roll per fork (per lap on a circuit): about half take each road.
  forkTake(br) {
    const f = this.forks[br.id];
    if (f && f.lap === this.k.lap) return f.take;
    const take = this.rnd() < 0.5;
    this.forks[br.id] = { lap: this.k.lap, take };
    return take;
  }

  // Take a side road at a fork if that is the pick, and a hidden route when carrying a key (or
  // when its gate stands open).
  chooseRoute() {
    const k = this.k, T = k.track, items = k.race.items;
    // already on a branch? follow it if we are through its gate (slipped in behind someone, or
    // rescued onto it), or well into a side road (or meant to take it)
    if (!this.route && k.path && k.path.branch) {
      const br = k.path;
      if (br.open) {
        if (k.loc.s > 14 || this.forkTake(br)) this.route = br;
      } else {
        const g = items.gates.find((q) => q.path === br);
        if (!g || k.loc.i >= g.i) this.route = br;
      }
    }
    if (this.route) {
      const br = this.route;
      if (!br.open) {
        const gate = items.gates.find((g) => g.path === br);
        const beforeGate = k.path !== br || (gate && k.loc.i < gate.i);
        // no key and the door has shut in front of us: forget it
        if (!k.key && beforeGate && (!gate || gate.openT <= 0.2)) {
          this.route = null;
          return;
        }
      }
      if (k.path === br) return;
      const b = br.branch;
      const ahead = T.aheadS(k.loc.mainS, b.fromS), rel = T.aheadS(b.fromS, k.loc.mainS);
      if ((ahead >= 0 && ahead < 80) || (rel >= 0 && rel < 25)) return; // approaching, or in the mouth
      this.route = null; // done with it (or missed the mouth)
      return;
    }
    this.keyTarget = null;
    this.wantKey = false;
    for (const br of T.branches) {
      const b = br.branch;
      const ahead = T.aheadS(k.loc.mainS, b.fromS);
      if (ahead < 0 || ahead > 70) continue;
      if (br.open) {
        if (k.path === T.main && this.forkTake(br)) {
          this.route = br;
          return;
        }
        continue;
      }
      const gate = items.gates.find((g) => g.path === br);
      const open = gate && gate.openT > 1.8 && ahead < 18;
      if ((k.key || open) && k.path === T.main) {
        this.route = br;
        return;
      }
    }
    // go key hunting now and then
    if (!k.key && !k.ghost && items.keys.length) {
      if (this.keyLap !== k.lap) {
        this.keyLap = k.lap;
        this.huntRoll = this.rnd() < CFG.botKeyHunt;
      }
      if (!this.huntRoll) return;
      for (const key of items.keys) {
        if (!key.active) continue;
        const kl = T.locate(key.x, key.z, key.y, T.main, {});
        if (!kl || kl.path !== T.main) continue;
        const ahead = T.aheadS(k.loc.mainS, kl.mainS);
        if (ahead < 45 && ahead > 2) {
          this.wantKey = true;
          this.keyTarget = { d: kl.d };
        }
      }
    }
  }

  // Lateral nudge (fraction of half-width) to steer around trouble on the planned line.
  // Wandering hazards are dodged where they will be when we get there.
  findDodge(path, s, d) {
    const k = this.k, items = k.race.items;
    let push = 0;
    // something r wide at lateral qd, ahead units up the road: steer away from it
    const nudge = (ahead, qd, r, gain = 0.16, keepSide = false) => {
      if (ahead < 2 || ahead > 26) return;
      const gap = qd - d;
      if (Math.abs(gap) > r + 2.2) return;
      // dead ahead: stick to the side we were already swerving to, don't dither
      const away = keepSide && this.dodgeSide && Math.abs(gap) < 0.8 ? this.dodgeSide : gap > 0 ? -1 : 1;
      push += away * (r + 2.4 - Math.abs(gap)) * gain * (1 - ahead / 30);
    };
    const consider = (x, z, r) => {
      const q = nearestOnPath(k.track, path, x, z, k.path === path ? k.loc.i : -1);
      let ahead = q.s - s;
      if (path.closed) ahead = ((ahead % path.length) + path.length) % path.length;
      nudge(ahead, q.d, r);
    };
    for (const o of items.objects) if (o.kind === 'banana' || (o.kind === 'shell' && o.owner !== k)) consider(o.x, o.z, 1.2);
    const sp = Math.max(8, k.vf);
    const pose = this._pose || (this._pose = {});
    for (const h of items.hazards) {
      if (!h.alive || h.kind === 'firebar') continue;
      const dd = (h.x - k.x) ** 2 + (h.z - k.z) ** 2;
      if (dd > 56 * 56) continue; // far out of reach of the 26-unit look-ahead
      switch (h.kind) {
        case 'walker':
        case 'stomper':
        case 'snowman':
          consider(h.x, h.z, (h.r || 1.2) + (h.kind === 'walker' ? h.range * 0.15 : 0));
          break;
        case 'roller':
        case 'penguin':
        case 'skier':
        case 'cow': {
          if (h.path !== path) {
            consider(h.x, h.z, h.r + 0.4);
            break;
          }
          // step through the next second or so: where are we both when our paths cross?
          let meetA = -1, meetD = 0;
          for (let tau = 0.1; sp * tau <= 26; tau += 0.1) {
            const q = items.hazardPose(h, h.t + tau * CFG.hazardSpeed, pose);
            let gapS = h.s + q.a - (s + sp * tau);
            if (path.closed) gapS = ((((gapS + path.length / 2) % path.length) + path.length) % path.length) - path.length / 2;
            if (Math.abs(gapS) > h.r + 2) continue;
            if (meetA < 0 || Math.abs(q.d - d) < Math.abs(meetD - d)) {
              meetA = sp * tau;
              meetD = q.d;
            }
          }
          if (meetA >= 0) nudge(meetA, meetD, h.r + 0.8, 0.22, true);
          break;
        }
        case 'podoboo':
          // a fireball is only low enough to hit near the ends of its leap: keep to the middle
          for (const side of [-1, 1]) {
            const e = h.path.point(h.s, h.d + side * h.span * 0.42, this._pt || (this._pt = {}));
            consider(e.x, e.z, 1.6);
          }
          break;
        case 'mole':
        case 'geyser':
          consider(h.x, h.z, h.r + 0.3);
          break;
        case 'icicle':
          if (h.state !== 'gone' && h.state !== 'grow') consider(h.x, h.z, 1.8);
          break;
        default:
          consider(h.x, h.z, (h.r || 1) + 0.5); // bumpers, poles
      }
    }
    if (Math.abs(push) > 0.05) this.dodgeSide = Math.sign(push);
    return U.clamp(push, -0.9, 0.9);
  }

  thinkItems(dt, path, s) {
    const k = this.k, race = k.race;
    if (!k.item) return;
    this.itemT -= dt * CFG.botItemRate;
    const it = k.item;
    let use = false;
    const ahead = race.order[k.place - 2];
    const behind = race.order[k.place];
    const dist = (q) => (q ? Math.hypot(q.x - k.x, q.z - k.z) : Infinity);
    if (it === 'star' || it === 'coin') use = this.itemT < 2.5;
    else if (it === 'mushroom' || it === 'triple') {
      const straight = Math.abs(curvatureAhead(path, s + 5, 30)) < 1 / 70;
      use = (straight && this.itemT < 2) || k.surface === 'offroad';
    } else if (it === 'banana') {
      use = (dist(behind) < 14 && this.itemT < 2) || this.itemT < -6;
    } else if (it === 'green') {
      if (ahead && dist(ahead) < 28) {
        const a = Math.atan2(ahead.z - k.z, ahead.x - k.x) - k.head;
        const aa = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
        use = aa < 0.18 && this.rnd() < CFG.botAggression * 0.2;
      }
      if (behind && dist(behind) < 10 && this.itemT < 0) {
        k.ctl.back = true;
        use = true;
      }
      use = use || this.itemT < -9;
    } else if (it === 'red') use = this.itemT < 1 && (k.place > 1 || this.itemT < -6) && this.rnd() < 0.05 + CFG.botAggression * 0.1;
    else if (it === 'bomb') {
      // never lob a bomb onto a glide ramp we are about to take off from
      const ramp = path.zones.some((z) => z.kind === 'glide' && z.s0 - s > -2 && z.s0 - s < 70);
      use = !ramp && ((ahead && dist(ahead) < 24 && this.itemT < 1.5) || this.itemT < -7);
    }
    if (use) {
      k.ctl.item = true;
      this.itemT = 1.5 + this.rnd() * 4;
    }
  }
}

// Signed curvature averaged over len units ahead of s (+ = bending right).
function curvatureAhead(path, s, len) {
  let sum = 0, n = 0;
  for (let u = 0; u <= len; u += 3) {
    const ss = path.closed ? s + u : Math.min(path.length, s + u);
    sum += path.curv[path.indexAt(ss)];
    n++;
  }
  return sum / n;
}

// Nearest point on a specific path (bots use this to follow a road they are not on yet).
function nearestOnPath(T, path, x, z, hintI = -1) {
  let best = -1, bd = Infinity;
  const step = path.n > 300 ? 3 : 1;
  const lo = hintI >= 0 ? hintI - 40 : 0, hi = hintI >= 0 ? hintI + 40 : path.n;
  for (let j = lo; j < hi; j += step) {
    const i = path.wrap(j);
    const dd = (x - path.x[i]) ** 2 + (z - path.z[i]) ** 2;
    if (dd < bd) {
      bd = dd;
      best = i;
    }
  }
  return T.project(path, best, x, z, {});
}
