'use strict';
// Everything you hear is synthesized with WebAudio: no audio files.
// Sound effects are short oscillator/noise recipes, music is a tiny step sequencer playing
// original tunes (one per world), and each local racer gets a little engine hum.

const NOTE_INDEX = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
function noteFreq(n) {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(n);
  if (!m) return 0;
  const midi = 12 * (parseInt(m[2], 10) + 1) + NOTE_INDEX[m[1]];
  return 440 * Math.pow(2, (midi - 69) / 12);
}
function parseTrack(s) {
  return s.replace(/\|/g, ' ').split(/\s+/).filter(Boolean);
}

// Tunes: one token per eighth note. "-" holds the previous note, "." is a rest.
const SONGS = {
  title: {
    bpm: 128,
    lead: 'C5 . E5 . G5 . C6 - | B5 . G5 . E5 . D5 . | F5 . A5 . C6 . A5 . | G5 - - . E5 . G5 . | A5 . F5 . D5 . F5 . | E5 . C5 . G4 . C5 . | D5 . F5 . A5 . G5 . | C6 - - - . . . .',
    bass: 'C3 . G2 . C3 . G2 . | E2 . B2 . E2 . G2 . | F2 . C3 . F2 . C3 . | G2 . D3 . G2 . B2 . | D3 . A2 . D3 . A2 . | C3 . G2 . E2 . G2 . | G2 . D3 . G2 . B2 . | C3 . G2 . C3 . . .',
    drums: 'k.h.s.h.',
    lead2: 0.35,
  },
  lobby: {
    bpm: 108,
    lead: 'E5 . G5 . A5 . G5 . | E5 - D5 . C5 . . . | D5 . E5 . G5 . E5 . | D5 - - . . . . . | E5 . G5 . A5 . C6 . | B5 - G5 . E5 . . . | D5 . E5 . D5 . B4 . | C5 - - - . . . .',
    bass: 'C3 . . . G2 . . . | A2 . . . E2 . . . | F2 . . . C3 . . . | G2 . . . D3 . . . | C3 . . . G2 . . . | E2 . . . A2 . . . | F2 . . . G2 . . . | C3 . G2 . C3 . . .',
    drums: 'k...s...',
    lead2: 0.4,
  },
  meadow: {
    bpm: 150,
    lead: 'G5 . A5 B5 . D6 . B5 | C6 . A5 . G5 . E5 . | F5 . A5 . C6 . E6 . | D6 - - . . . B5 . | C6 . B5 A5 . G5 . E5 | F5 . E5 . D5 . G5 . | A5 . B5 . C6 . D6 . | G5 - - - . . . .',
    bass: 'G2 . D3 . G2 . D3 . | A2 . E3 . A2 . C3 . | F2 . C3 . F2 . A2 . | G2 . D3 . G2 . B2 . | C3 . G2 . C3 . E3 . | D3 . A2 . D3 . F#2 . | G2 . D3 . E3 . F#3 . | G2 . D3 . G2 . . .',
    drums: 'k.hsk.hs',
    lead2: 0.3,
  },
  sherbet: {
    bpm: 140,
    lead: 'E6 . B5 . G5 . E5 . | F#5 . G5 . A5 . B5 . | C6 . A5 . E5 . C5 . | D5 - - . . . . . | E5 . G5 . B5 . E6 . | D6 . C6 . B5 . A5 . | G5 . F#5 . E5 . D#5 . | E5 - - - . . . .',
    bass: 'E2 . B2 . E3 . B2 . | D2 . A2 . D3 . A2 . | C2 . G2 . C3 . G2 . | B1 . F#2 . B2 . F#2 . | E2 . B2 . E3 . B2 . | A2 . E3 . A2 . E3 . | B1 . F#2 . B2 . D#3 . | E2 . B2 . E2 . . .',
    drums: 'k.h.shh.',
    lead2: 0.5,
    leadType: 'sine',
  },
  magma: {
    bpm: 156,
    lead: 'D5 D5 F5 D5 A5 . G5 F5 | E5 E5 G5 E5 Bb5 . A5 G5 | F5 . A5 . D6 . C6 . | A5 - - . G5 . F5 . | D5 D5 F5 D5 A5 . G5 F5 | E5 . G5 . C6 . Bb5 . | A5 . G5 . F5 . E5 . | D5 - - - . . . .',
    bass: 'D2 . D3 . D2 . D3 . | C2 . C3 . C2 . C3 . | Bb1 . Bb2 . Bb1 . Bb2 . | A1 . A2 . A1 . C#3 . | D2 . D3 . D2 . D3 . | C2 . C3 . C2 . E2 . | F2 . E2 . D2 . C#2 . | D2 . A1 . D2 . . .',
    drums: 'k.sk.ks.',
    lead2: 0.2,
  },
  results: {
    bpm: 120,
    lead: 'C5 . E5 . G5 . C6 . | B5 . G5 . D5 . G5 . | A5 . F5 . C5 . F5 . | G5 - - - C6 - - -',
    bass: 'C3 . G2 . C3 . G2 . | G2 . D3 . G2 . D3 . | F2 . C3 . F2 . C3 . | G2 . G2 . C3 . . .',
    drums: 'k.h.s.h.',
    lead2: 0.35,
  },
  star: {
    bpm: 190,
    lead: 'C6 . C6 . C6 . D6 C6 | . C6 . D6 C6 . C6 . | B5 . B5 . B5 . C6 B5 | . B5 . C6 B5 . B5 .',
    bass: 'C3 G3 C3 G3 C3 G3 C3 G3 | C3 G3 C3 G3 C3 G3 C3 G3 | B2 G3 B2 G3 B2 G3 B2 G3 | B2 G3 B2 G3 B2 G3 B2 G3',
    drums: 'k.s.k.s.',
    lead2: 0.3,
  },
};
for (const k in SONGS) {
  SONGS[k].leadSteps = parseTrack(SONGS[k].lead);
  SONGS[k].bassSteps = parseTrack(SONGS[k].bass);
}

const Sound = {
  ctx: null,
  master: null,
  sfxGain: null,
  musicGain: null,
  noiseBuf: null,
  muted: false,
  song: null,
  songName: '',
  step: 0,
  nextTime: 0,
  timer: 0,
  tempoMul: 1,
  bongos: false,

  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
      this.timer = setInterval(() => this.schedule(), 25);
      if (this.pendingSong) this.playSong(this.pendingSong);
    } catch (e) {
      this.ctx = null;
    }
  },
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },
  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.muted ? 0 : 1;
    this.sfxGain.gain.value = CFG.sfxVolume * 0.55;
    this.musicGain.gain.value = CFG.musicVolume * 0.32;
  },
  toggleMute() {
    this.muted = !this.muted;
    this.applyVolumes();
    return this.muted;
  },

  // ---------- primitives ----------
  tone(freq, dur, o = {}) {
    const c = this.ctx;
    if (!c || !freq) return;
    const t = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur);
    const vol = (o.vol !== undefined ? o.vol : 0.15);
    const atk = o.attack || 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(o.dest || this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  },
  noise(dur, o = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + (o.delay || 0);
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = o.filter || 'lowpass';
    f.frequency.setValueAtTime(o.freq || 1200, t);
    if (o.slide) f.frequency.exponentialRampToValueAtTime(o.slide, t + dur);
    f.Q.value = o.q || 1;
    const g = c.createGain();
    const vol = o.vol !== undefined ? o.vol : 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(o.dest || this.sfxGain);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  },
  arp(notes, step, o = {}) {
    notes.forEach((n, i) => {
      if (n === '.') return;
      this.tone(noteFreq(n), (o.len || step * 1.6), Object.assign({}, o, { delay: (o.delay || 0) + i * step }));
    });
  },

  play(name) {
    if (!this.ctx || this.muted) return;
    const f = SFX[name];
    if (f) f(this);
  },

  // ---------- music ----------
  playSong(name) {
    if (!this.ctx) {
      this.pendingSong = name;
      return;
    }
    if (this.songName === name && this.song) return;
    this.songName = name;
    this.song = SONGS[name] || null;
    this.step = 0;
    this.tempoMul = 1;
    this.nextTime = this.ctx.currentTime + 0.08;
  },
  stopSong() {
    this.song = null;
    this.songName = '';
    this.pendingSong = null;
  },
  schedule() {
    const c = this.ctx;
    if (!c || !this.song) return;
    const s = this.song;
    const stepDur = 60 / s.bpm / 2 / this.tempoMul;
    while (this.nextTime < c.currentTime + 0.12) {
      this.scheduleStep(s, this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  },
  holdLength(steps, i) {
    let n = 1;
    while (steps[(i + n) % steps.length] === '-' && n < steps.length) n++;
    return n;
  },
  scheduleStep(s, step, t, dur) {
    const c = this.ctx;
    const dest = this.musicGain;
    const L = s.leadSteps, B = s.bassSteps;
    const li = step % L.length, bi = step % B.length;
    const ln = L[li], bn = B[bi];
    const voice = (freq, len, type, vol, when) => {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(vol, when + 0.008);
      g.gain.exponentialRampToValueAtTime(vol * 0.35, when + Math.min(len, 0.18));
      g.gain.exponentialRampToValueAtTime(0.0001, when + len);
      osc.connect(g);
      g.connect(dest);
      osc.start(when);
      osc.stop(when + len + 0.05);
    };
    if (ln && ln !== '-' && ln !== '.') {
      const f = noteFreq(ln);
      const len = dur * this.holdLength(L, li) * 0.95;
      voice(f, len, s.leadType || 'triangle', 0.5, t);
      if (s.lead2) voice(f * 2, len * 0.6, 'sine', 0.5 * s.lead2, t); // marimba-ish shimmer
    }
    if (bn && bn !== '-' && bn !== '.') {
      voice(noteFreq(bn), dur * this.holdLength(B, bi) * 0.9, 'triangle', 0.55, t);
    }
    const d = s.drums[step % s.drums.length];
    const drum = (freq, slide, len, vol) => {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(slide, t + len);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      osc.connect(g);
      g.connect(dest);
      osc.start(t);
      osc.stop(t + len + 0.02);
    };
    const hiss = (len, freq, vol) => {
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = c.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = freq;
      const g = c.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      src.connect(f);
      f.connect(g);
      g.connect(dest);
      src.start(t, Math.random() * 0.5);
      src.stop(t + len + 0.02);
    };
    if (d === 'k') drum(150, 45, 0.16, 0.9);
    else if (d === 's') hiss(0.12, 1800, 0.35);
    else if (d === 'h') hiss(0.04, 6000, 0.18);
    if (this.bongos) {
      const pat = 'h.lh.l.h';
      const b = pat[step % pat.length];
      if (b === 'h') drum(420, 300, 0.09, 0.5);
      else if (b === 'l') drum(290, 210, 0.11, 0.5);
    }
  },
};

const SFX = {
  select: (s) => s.tone(990, 0.06, { type: 'triangle', vol: 0.12 }),
  back: (s) => s.tone(520, 0.08, { type: 'triangle', vol: 0.1, slide: 380 }),
  count: (s) => s.tone(660, 0.22, { type: 'square', vol: 0.09 }),
  go: (s) => s.tone(1320, 0.5, { type: 'square', vol: 0.09 }),
  hop: (s) => s.tone(300, 0.1, { type: 'triangle', slide: 520, vol: 0.08 }),
  sparks1: (s) => s.tone(1400, 0.08, { type: 'triangle', vol: 0.05 }),
  sparks2: (s) => s.tone(1700, 0.08, { type: 'triangle', vol: 0.06 }),
  sparks3: (s) => s.tone(2100, 0.1, { type: 'triangle', vol: 0.07 }),
  boost: (s) => {
    s.noise(0.45, { filter: 'bandpass', freq: 400, slide: 2400, vol: 0.18, q: 1.5 });
    s.tone(220, 0.35, { type: 'sawtooth', slide: 660, vol: 0.05 });
  },
  box: (s) => {
    s.noise(0.12, { freq: 3000, vol: 0.12 });
    s.arp(['E6', 'G6', 'C7'], 0.04, { type: 'triangle', vol: 0.08, len: 0.08 });
  },
  roulette: (s) => s.tone(1200 + Math.random() * 400, 0.03, { type: 'square', vol: 0.03 }),
  itemget: (s) => s.arp(['C6', 'G6'], 0.06, { type: 'triangle', vol: 0.1, len: 0.12 }),
  throw: (s) => s.noise(0.15, { filter: 'bandpass', freq: 900, slide: 300, vol: 0.14 }),
  hit: (s) => {
    s.tone(420, 0.35, { type: 'square', slide: 90, vol: 0.12 });
    s.noise(0.3, { freq: 1200, slide: 200, vol: 0.2 });
  },
  slip: (s) => s.tone(900, 0.4, { type: 'sine', slide: 200, vol: 0.18 }),
  squish: (s) => {
    s.tone(160, 0.3, { type: 'sine', slide: 50, vol: 0.3 });
    s.noise(0.2, { freq: 400, vol: 0.2 });
  },
  coin: (s) => {
    s.tone(988, 0.07, { type: 'square', vol: 0.06 });
    s.tone(1319, 0.2, { type: 'square', vol: 0.06, delay: 0.06 });
  },
  coinloss: (s) => s.arp(['E6', 'C6', 'A5'], 0.05, { type: 'square', vol: 0.05, len: 0.08 }),
  key: (s) => s.arp(['A5', 'C#6', 'E6', 'A6'], 0.06, { type: 'triangle', vol: 0.13, len: 0.16 }),
  gate: (s) => {
    s.noise(0.3, { freq: 2500, slide: 300, vol: 0.15 });
    s.arp(['C5', 'E5', 'G5', 'B5', 'D6', 'F#6', 'A6', 'C7'], 0.08, { type: 'triangle', vol: 0.12, len: 0.4 });
  },
  locked: (s) => {
    s.tone(140, 0.2, { type: 'square', slide: 90, vol: 0.12 });
    s.tone(120, 0.2, { type: 'square', slide: 80, vol: 0.1, delay: 0.12 });
  },
  lap: (s) => s.arp(['G5', 'C6', 'E6'], 0.08, { type: 'triangle', vol: 0.13, len: 0.2 }),
  finallap: (s) => s.arp(['C6', 'C6', 'C6', 'G5', 'A5', 'B5', 'C6'], 0.09, { type: 'square', vol: 0.06, len: 0.14 }),
  finish: (s) => s.arp(['G4', 'C5', 'E5', 'G5', 'C6', 'E6', 'G6', '.', 'E6', '.', 'G6'], 0.09, { type: 'square', vol: 0.07, len: 0.18 }),
  bump: (s) => {
    s.tone(110, 0.12, { type: 'triangle', slide: 70, vol: 0.25 });
    s.noise(0.06, { freq: 600, vol: 0.12 });
  },
  wall: (s) => {
    s.tone(90, 0.15, { type: 'square', slide: 50, vol: 0.12 });
    s.noise(0.1, { freq: 500, vol: 0.18 });
  },
  land: (s) => s.noise(0.12, { freq: 400, slide: 120, vol: 0.18 }),
  fall: (s) => s.tone(900, 0.8, { type: 'sine', slide: 120, vol: 0.14 }),
  respawn: (s) => s.arp(['C5', 'E5', 'G5'], 0.06, { type: 'triangle', vol: 0.1 }),
  star: (s) => s.arp(['C6', 'E6', 'G6', 'C7'], 0.05, { type: 'triangle', vol: 0.1 }),
  blast: (s) => {
    s.noise(0.7, { freq: 900, slide: 60, vol: 0.4 });
    s.tone(80, 0.5, { type: 'sine', slide: 30, vol: 0.4 });
  },
  stomp: (s) => {
    s.noise(0.35, { freq: 260, slide: 60, vol: 0.32 });
    s.tone(60, 0.3, { type: 'sine', slide: 35, vol: 0.3 });
  },
  trick: (s) => s.arp(['G5', 'D6'], 0.05, { type: 'triangle', vol: 0.1 }),
  rocket: (s) => s.arp(['C6', 'G6', 'C7'], 0.04, { type: 'square', vol: 0.06 }),
  stall: (s) => s.noise(0.5, { freq: 300, vol: 0.2 }),
  buy: (s) => {
    s.arp(['E6', 'G6', 'C7'], 0.05, { type: 'square', vol: 0.06, len: 0.1 });
    s.noise(0.08, { freq: 5000, vol: 0.08, delay: 0.15 });
  },
  join: (s) => s.arp(['C5', 'G5', 'C6', 'E6'], 0.06, { type: 'triangle', vol: 0.12, len: 0.14 }),
  ready: (s) => s.arp(['E5', 'A5'], 0.07, { type: 'triangle', vol: 0.12, len: 0.12 }),
  pop: (s) => s.tone(500 + Math.random() * 400, 0.07, { type: 'sine', slide: 1400, vol: 0.18 }),
  poof: (s) => s.noise(0.15, { freq: 1500, slide: 400, vol: 0.12 }),
};

// Engine hum, one voice per local camera: a low sawtooth through a lowpass, pitched by speed.
const Engines = {
  voices: [],
  set(i, on, speed01, boost) {
    const c = Sound.ctx;
    if (!c) return;
    let v = this.voices[i];
    if (!v) {
      const osc = c.createOscillator(), osc2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      osc.type = 'sawtooth';
      osc2.type = 'square';
      f.type = 'lowpass';
      f.frequency.value = 600;
      g.gain.value = 0;
      osc.connect(f);
      osc2.connect(f);
      f.connect(g);
      g.connect(Sound.master);
      osc.start();
      osc2.start();
      v = this.voices[i] = { osc, osc2, f, g };
    }
    const t = c.currentTime;
    const base = 55 + speed01 * 95 + (boost ? 30 : 0) + i * 3;
    v.osc.frequency.setTargetAtTime(base, t, 0.05);
    v.osc2.frequency.setTargetAtTime(base * 0.5, t, 0.05);
    v.f.frequency.setTargetAtTime(380 + speed01 * 900 + (boost ? 600 : 0), t, 0.08);
    const vol = on && !Sound.muted ? (0.025 + speed01 * 0.035) * CFG.engineVolume * 2 : 0;
    v.g.gain.setTargetAtTime(vol, t, 0.08);
  },
  silence() {
    for (let i = 0; i < this.voices.length; i++) this.set(i, false, 0, false);
  },
};
