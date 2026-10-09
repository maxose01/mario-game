'use strict';
// The phone's haptics engine. The big screen streams what this racer should feel (js/haptics.js):
// one-shot jolts with a strength (Buzz.play) and one continuous rumble (Buzz.rumble: amplitude
// 0..1, pulse rate in Hz, irregularity 0..1). Key presses and the steering wheel click locally.
//
// A phone's vibration motor has no volume knob, only on and off, so strength becomes pulse
// length, and a rumble becomes a train of pulses whose duty cycle is its amplitude. The train is
// re-issued every 100 ms for the next 260 ms, in step with the clock so it doesn't stutter, and
// a jolt interrupts it and lets it pick up again when the jolt is over (a bigger jolt is never
// cut short by a smaller one). Android phones play all of this through navigator.vibrate.
// iPhones have no vibration API: Safari's switch control taps the Taptic Engine once each time
// it flips, so an iPhone gets a tap for key presses and a tap or three for the bigger jolts,
// where iOS allows it (it may only allow taps straight from a touch).

// name: [priority, pattern(strength)] with patterns as [on, off, on, ...] in milliseconds.
const BUZZ_FX = {
  wall: [3, (s) => [18 + 50 * s, 25, 8 + 20 * s]],
  bump: [2, (s) => [12 + 30 * s]],
  jolt: [2, (s) => [10 + 35 * s]],
  crash: [4, () => [90, 30, 50, 40, 35, 50, 25]],
  slip: [4, () => [25, 35, 25, 35, 25, 35, 25]],
  squish: [4, () => [180]],
  fall: [4, () => [40, 40, 70, 60, 140]],
  respawn: [2, (s) => [15, 60, 15]],
  land: [3, (s) => (s > 0.6 ? [20 + 70 * s, 30, 25] : [15 + 70 * s])],
  launch: [1, () => [12]],
  glide: [2, () => [12, 30, 18, 30, 30]],
  trick: [1, () => [10, 25, 10]],
  boost: [2, (s) => [25 + 40 * s]],
  turbo: [2, (s) => (s > 0.8 ? [30, 15, 45] : [15 + 30 * s])],
  ring: [2, () => [12, 20, 20, 20, 35]],
  spin: [2, () => [20, 20, 20]],
  rocket: [3, () => [60, 20, 90]],
  stall: [3, () => [20, 60, 20, 60, 20]],
  sparks: [1, (s) => (s < 0.5 ? [8] : s < 0.9 ? [8, 40, 8] : [10, 30, 10, 30, 16])],
  box: [1, () => [10, 30, 10]],
  itemget: [1, () => [18]],
  throw: [1, () => [14]],
  coin: [0, () => [7]],
  coinloss: [2, () => [30, 30, 30]],
  key: [2, () => [20, 40, 20, 40, 60]],
  gate: [2, () => [40, 30, 80]],
  locked: [3, () => [50, 30, 20]],
  bumper: [3, () => [45, 20, 30]],
  squash: [2, () => [30]],
  star: [2, () => [15, 30, 15, 30, 15, 30, 60]],
  thud: [2, (s) => [20 + 60 * s]],
  blast: [3, (s) => [40 + 120 * s, 30, 20 + 40 * s]],
  count: [2, () => [40]],
  go: [3, () => [120]],
  lap: [2, () => [40, 30, 40]],
  finallap: [3, () => [60, 40, 60, 40, 60]],
  section: [2, () => [40, 40, 40, 40, 120]],
  finalsection: [3, () => [60, 40, 60, 40, 60, 40, 160]],
  finish: [4, (s) => (s >= 1 ? [100, 50, 100, 50, 300] : [100, 50, 200])],
  ready: [2, () => [20, 40, 20]],
  sample: [2, () => [30, 60, 15, 40, 15]],
};

const BUZZ_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const Buzz = {
  level: 'full', // 'off' | 'light' | 'full'
  vib: typeof navigator.vibrate === 'function',
  ios: false,
  until: 0, // a jolt is playing until then (performance.now() ms)
  prio: 0,
  rum: { a: 0, f: 0, j: 0, at: 0 },
  running: false, // a rumble train is playing
  sw: null, // the hidden iOS switch

  init(level) {
    this.ios = !this.vib && BUZZ_IOS;
    this.setLevel(level);
    setInterval(() => this.pump(), 100);
  },
  // What this phone can do: 'full' (vibration patterns), 'taps' (an iPhone) or 'none'.
  get support() {
    return this.vib ? 'full' : this.ios ? 'taps' : 'none';
  },
  setLevel(level) {
    this.level = level === 'off' || level === 'light' ? level : 'full';
    if (this.level === 'off') this.stop();
  },

  // A crisp tick for a key press or a wheel detent, straight from the touch.
  click(ms = 8) {
    if (this.level === 'off') return;
    if (this.vib) {
      // never cut a jolt short for a tick
      const now = performance.now();
      if (now < this.until) return;
      const len = this.level === 'light' ? Math.max(4, Math.round(ms * 0.6)) : ms;
      this.vibrate([len]);
      this.until = now + len;
      this.prio = 0;
      this.running = false;
      this.resumeAfter(len);
    } else if (this.ios) this.tap();
  },

  // A one-shot jolt from the big screen (or the phone itself).
  play(name, s = 1) {
    if (this.level === 'off') return;
    const fx = BUZZ_FX[name];
    if (!fx) return;
    const [prio, make] = fx;
    const now = performance.now();
    if (now < this.until && prio < this.prio) return; // a bigger jolt is still playing
    if (this.level === 'light' && prio < 1) return;
    let pat = make(U.clamp(Number(s) || 0, 0, 1)).map((v) => Math.max(4, Math.round(v)));
    if (this.level === 'light') pat = pat.map((v, i) => (i % 2 ? v : Math.max(4, Math.round(v * 0.55))));
    const total = pat.reduce((a, b) => a + b, 0);
    this.until = now + total;
    this.prio = prio;
    if (this.vib) {
      this.vibrate(pat);
      this.running = false;
      this.resumeAfter(total);
    } else if (this.ios && prio >= 2) {
      // one tap per pulse (at most three), at the pulses' starts
      let t = 0;
      for (let i = 0, n = 0; i < pat.length && n < 3; i += 2, n++) {
        if (t === 0) this.tap();
        else setTimeout(() => this.tap(), t);
        t += pat[i] + (pat[i + 1] || 0);
      }
    }
  },

  // The continuous rumble from the big screen. It fades out by itself if the updates stop.
  rumble(a, f, j) {
    const r = this.rum;
    r.a = U.clamp(Number(a) || 0, 0, 1);
    r.f = U.clamp(Number(f) || 10, 2, 40);
    r.j = U.clamp(Number(j) || 0, 0, 1);
    r.at = performance.now();
    this.pump();
  },

  // pick the rumble up again the moment a jolt or a click is over
  resumeAfter(ms) {
    clearTimeout(this.resumeT);
    this.resumeT = setTimeout(() => this.pump(), ms + 2);
  },

  stop() {
    this.rum.a = 0;
    this.until = 0;
    if (this.vib && this.running) this.vibrate(0);
    this.running = false;
  },

  pump() {
    if (!this.vib) return;
    const now = performance.now(), r = this.rum;
    if (now - r.at > 700) r.a = 0; // the big screen went quiet
    if (now < this.until) return; // a jolt is playing
    const a = this.level === 'light' ? r.a * 0.6 : r.a;
    if (this.level === 'off' || a < 0.05 || document.hidden) {
      if (this.running) this.vibrate(0);
      this.running = false;
      return;
    }
    this.vibrate(this.train(a, r.f, r.j, 260));
    this.running = true;
  },

  // A pulse train for the next `ms`: pulses of period 1/f whose duty cycle grows with the
  // amplitude, jittered when the texture is irregular (gravel, mud), in step with the clock.
  train(a, f, j, ms) {
    const T = 1000 / f;
    const on = U.clamp(T * (0.12 + 0.7 * a), 5, T);
    if (on >= T - 3) return [ms];
    const out = [];
    let t = 0;
    const phase = performance.now() % T;
    if (phase > 1) {
      out.push(0, Math.round(T - phase));
      t = T - phase;
    }
    while (t < ms) {
      const o = Math.max(5, Math.round(on * (j ? 1 + (Math.random() * 2 - 1) * j * 0.5 : 1)));
      const off = Math.max(4, Math.round(T * (j ? 1 + (Math.random() * 2 - 1) * j * 0.4 : 1) - o));
      out.push(o, off);
      t += o + off;
    }
    return out;
  },

  vibrate(p) {
    try {
      navigator.vibrate(p);
    } catch (e) {
      /* not allowed yet (no tap on the page so far) */
    }
  },
  // iPhone: flip a hidden switch control, which taps the Taptic Engine.
  tap() {
    try {
      if (!this.sw) {
        const label = document.createElement('label');
        label.setAttribute('aria-hidden', 'true');
        label.style.display = 'none';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.setAttribute('switch', '');
        input.tabIndex = -1;
        label.appendChild(input);
        document.body.appendChild(label);
        this.sw = label;
      }
      this.sw.click();
    } catch (e) {
      /* no taps here */
    }
  },
};
