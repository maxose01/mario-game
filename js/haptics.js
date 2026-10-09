'use strict';
// Haptics for the racers' phones (pure simulation reading, shared with the Node tests).
// Every frame the big screen works out what each human racer should feel:
//   shots   one-shot jolts with a strength 0..1: a wall hit (by impact speed), a kart bump, a
//           landing (by how hard), a mogul or ramp base under the wheels, a spin-out, mini-turbo
//           sparks, a boost, a stomper slamming down next to you, the countdown ...
//   rumble  one continuous feel, the strongest of what is going on: kerbs and off-road, wooden
//           planks, cobbles, dirt, snow and water under the tyres (pulse rate follows the speed),
//           brake judder, drift scrub, the boost roar, a star's beat, the wobble of a spin-out and
//           the engine revving on the grid (rough when it floods, smooth in the rocket-start
//           window). Glassy ice, smooth tarmac, anti-gravity hover and the air are quiet.
// The rumble is {a, f, j}: amplitude 0..1, pulse rate in Hz and irregularity 0..1. The phone
// turns both into vibration patterns it can play (js/pad.js).

// Hits that knock you into a slide rather than a crash.
const HAPTIC_SLIPS = { banana: 1, penguin: 1, skier: 1 };
// How each kind of boost feels as it kicks in: [shot, strength]. Rings, rocket starts and
// anti-gravity spins have shots of their own.
const HAPTIC_BOOSTS = { pad: ['boost', 0.6], mushroom: ['boost', 0.9], trick: ['boost', 0.5], turbo1: ['turbo', 0.35], turbo2: ['turbo', 0.6], turbo3: ['turbo', 0.9] };
// Shocks felt from nearby (events without a kart): how far they reach.
const HAPTIC_NEAR = { stomp: 18, blast: 30, geyser: 14, icicle: 12, mole: 8 };
// Road styles that rumble under the tyres: [base amplitude, extra at full speed, pulse rate in Hz
// (0 = one pulse per plank at the kart's speed), irregularity].
const HAPTIC_ROADS = { wood: [0.2, 0.25, 0, 0.1], stone: [0.1, 0.15, 16, 0.35], dirt: [0.18, 0.22, 11, 0.5], snow: [0.06, 0.1, 14, 0.4] };

class HapticTracker {
  constructor(kart) {
    this.k = kart;
    this.shots = []; // [[name, strength], ...] since the last take()
    this.rumble = { a: 0, f: 0, j: 0 };
    this.prevVy = null; // vertical speed last frame while on the ground
    this.joltT = 0;
  }

  shot(name, s = 1) {
    this.shots.push([name, Math.round(U.clamp(s, 0, 1) * 100) / 100]);
  }
  take() {
    const s = this.shots;
    this.shots = [];
    return s;
  }

  // One frame: this frame's race events and its length. frozen = paused (nothing to feel).
  update(race, events, dt, frozen) {
    const k = this.k;
    if (frozen) {
      this.setRumble(0);
      return;
    }
    for (const e of events) this.event(race, e);
    this.feelRoad(race, dt);
    this.rumbleNow(race);
    // done racing: only the finish itself, then quiet
    if (k.finished && race.raceTime - k.finishTime > 1.5) this.setRumble(0);
  }

  event(race, e) {
    const k = this.k, mine = e.kart === k;
    if (k.finished && e.type !== 'finish') return;
    switch (e.type) {
      case 'count':
        return this.shot('count', 0.6);
      case 'go':
        return this.shot('go');
      case 'bump':
        // kart against kart: both feel it, by the closing speed
        if (mine || e.a === k) this.shot('bump', e.b / 12);
        return;
    }
    if (!mine) {
      // a shock nearby: a stomper slamming down, a bomb going off, a geyser, a falling icicle
      const reach = HAPTIC_NEAR[e.type], o = e.a;
      if (reach && o && o.x !== undefined) {
        const dist = Math.hypot(o.x - k.x, o.z - k.z);
        const s = 1 - dist / reach;
        if (s > 0.15 && Math.abs((o.y !== undefined ? o.y : k.y) - k.y) < 12) this.shot(e.type === 'blast' ? 'blast' : 'thud', s);
      }
      return;
    }
    switch (e.type) {
      case 'wall':
        return this.shot('wall', (e.a - 4) / 16);
      case 'hit':
        return this.shot(HAPTIC_SLIPS[e.a] ? 'slip' : 'crash');
      case 'squish':
      case 'fall':
      case 'glide':
      case 'trick':
      case 'rocket':
      case 'stall':
      case 'key':
      case 'gate':
      case 'ring':
      case 'star':
      case 'lap':
      case 'finallap':
      case 'section':
      case 'finalsection':
        return this.shot(e.type);
      case 'respawn':
        return this.shot('respawn', 0.5);
      case 'land':
        return this.shot('land', (e.a - 3) / 18);
      case 'launch':
        return this.shot('launch', 0.5);
      case 'boost': {
        const b = HAPTIC_BOOSTS[e.a];
        if (b) this.shot(b[0], b[1]);
        return;
      }
      case 'spinboost':
        return this.shot('spin', 0.6);
      case 'sparks':
        return this.shot('sparks', e.a / 3);
      case 'box':
        return this.shot('box', 0.4);
      case 'itemget':
        return this.shot('itemget', 0.5);
      case 'use':
        return this.shot('throw', 0.4);
      case 'coin':
        return this.shot('coin', 0.2);
      case 'coinloss':
        return this.shot('coinloss', 0.6);
      case 'locked':
        return this.shot('locked', 0.7);
      case 'bumper':
        return this.shot('bumper', 0.9);
      case 'squash':
        return this.shot('squash', 0.6);
      case 'finish':
        return this.shot('finish', e.a === 1 ? 1 : 0.5);
    }
  }

  // Jolts from the ground itself: the wheels slamming into the base of a mogul or a ramp, or a
  // dip. The kart follows the ground, so a sudden upward kick in its vertical speed is a bump.
  feelRoad(race, dt) {
    const k = this.k;
    this.joltT = Math.max(0, this.joltT - dt);
    if (!k.onGround || k.falling || dt <= 0) {
      this.prevVy = null;
      return;
    }
    if (this.prevVy !== null && race.state === 'race') {
      const kick = (k.vy - this.prevVy) / dt;
      if (kick > 45 && this.joltT <= 0) {
        this.shot('jolt', (kick - 45) / 180);
        this.joltT = 0.12;
      }
    }
    this.prevVy = k.vy;
  }

  setRumble(a, f = 0, j = 0) {
    const r = this.rumble;
    r.a = a > 0 ? Math.round(U.clamp(a, 0, 1) * 100) / 100 : 0;
    r.f = r.a > 0 ? Math.round(U.clamp(f, 2, 40)) : 0;
    r.j = r.a > 0 ? Math.round(U.clamp(j, 0, 1) * 10) / 10 : 0;
  }

  // The continuous feel: the strongest of everything going on right now.
  rumbleNow(race) {
    const k = this.k;
    if (race.state === 'countdown') {
      if (!k.ctl.gas) return this.setRumble(0);
      // revving on the grid: rough once it floods (too early), smooth in the rocket-start window
      if (k.gasAt !== null && k.gasAt > 1.7) return this.setRumble(0.35, 9, 0.7);
      return race.count <= 1.15 ? this.setRumble(0.45, 28, 0.05) : this.setRumble(0.25, 22, 0.2);
    }
    if ((race.state !== 'race' && race.state !== 'done') || k.falling || k.squishT > 0) return this.setRumble(0);
    if (k.spinT > 0) return this.setRumble(0.15 + 0.4 * (k.spinT / (k.spinTotal || 1)), 7, 0.2);
    let a = 0, f = 0, j = 0;
    const take = (a2, f2, j2) => {
      if (a2 > a) {
        a = a2;
        f = f2;
        j = j2;
      }
    };
    if (k.starT > 0) take(0.32, 6, 0);
    if (!k.onGround) return this.setRumble(a, f, j);
    const base = k.baseSpeed() || 1, v = Math.abs(k.vf), s01 = U.clamp(v / base, 0, 1.2);
    if (k.boostT > 0) take(0.2 + 0.15 * Math.min(1, k.boostT), 30, 0.15);
    if (k.ctl.brake && k.vf > 1.5) take(0.18 + 0.5 * U.clamp(k.vf / base, 0, 1), 17, 0.1);
    if (k.drift) take(0.1 + 0.06 * k.driftLevel, 22, 0.3);
    if (v > 2) {
      const loc = k.loc;
      const surf = k.surface;
      if (this.onKerb(loc)) take(0.3 + 0.3 * s01, U.clamp(v / 2.2, 4, 24), 0);
      else if (surf === 'offroad') take(0.3 + 0.45 * s01, 8 + 8 * s01, 0.6);
      else if (surf === 'mud') take(0.5 + 0.2 * s01, 6, 0.5);
      else if (surf === 'shallow' || (loc && loc.path && (loc.path.style[loc.i] === 'water' || race.track.zoneAt(loc, 'current')))) take(0.16 + 0.2 * s01, 10, 0.4);
      else if (surf !== 'ice' && loc && loc.path && !k.antigrav) {
        const r = HAPTIC_ROADS[loc.path.style[loc.i]];
        if (r) take(r[0] + r[1] * s01, r[2] || U.clamp(v / 1.4, 4, 22), r[3]);
      }
    }
    this.setRumble(a, f, j);
  }

  // On the red-and-white kerb at the edge of the main road? (Kerbs line ordinary road, and snowy
  // or cobbled road in corners: the same rule the 3D builder uses to lay them.)
  onKerb(loc) {
    if (!loc || !loc.path || loc.path.branch) return false;
    const p = loc.path, i = loc.i, ad = Math.abs(loc.d);
    if (ad <= loc.hw || ad > loc.hw + 0.85 || p.ag[i]) return false;
    const style = p.style[i];
    if (style === 'road') return true;
    if (style !== 'snow' && style !== 'stone') return false;
    for (let k = -6; k <= 6; k++) if (Math.abs(p.curv[p.wrap(i + k)]) > 1 / 70) return true;
    return false;
  }
}
