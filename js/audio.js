'use strict';
// Everything you hear is synthesized with WebAudio: no audio files.
// Sound effects are short oscillator/noise recipes; music is a tiny step sequencer
// playing original tunes, with a bongo layer that joins in while you ride Dumpling.

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
  map: {
    bpm: 104,
    lead: 'A4 . C5 . F5 - E5 . | D5 . C5 . A4 - - . | Bb4 . D5 . F5 - G5 . | A5 - - . . . . . | A5 . G5 . F5 . D5 . | C5 . D5 . F5 - . . | G5 . E5 . C5 . E5 . | F5 - - . . . . .',
    bass: 'F2 . C3 . F2 . C3 . | D2 . A2 . D2 . A2 . | Bb1 . F2 . Bb1 . F2 . | C2 . G2 . C2 . G2 . | F2 . C3 . D2 . A2 . | Bb1 . F2 . Bb1 . F2 . | C2 . G2 . C2 . E2 . | F2 . C3 . F2 . . .',
    drums: 'k...h...',
    lead2: 0.35,
  },
  meadow: {
    bpm: 132,
    lead: 'E5 . G5 . C6 - B5 A5 | G5 - E5 . C5 . D5 E5 | F5 . A5 . C6 - B5 A5 | G5 - - - . . . . | E5 . G5 . C6 - D6 E6 | D6 - C6 . A5 . G5 A5 | F5 . E5 . D5 . G5 . | C5 - - - . . . .',
    bass: 'C3 . G3 . C3 . G3 . | A2 . E3 . A2 . E3 . | F2 . C3 . F2 . C3 . | G2 . D3 . G2 . B2 . | C3 . G3 . C3 . G3 . | F2 . C3 . F2 . A2 . | D3 . A2 . G2 . B2 . | C3 . G2 . C3 . . .',
    drums: 'k.h.s.h.',
    lead2: 0.3,
  },
  glade: {
    bpm: 144,
    lead: 'D5 . G5 . B5 . A5 G5 | A5 - F#5 . D5 . . . | E5 . A5 . C6 . B5 A5 | B5 - G5 . D5 . . . | G5 A5 B5 . D6 . B5 . | C6 B5 A5 . F#5 . A5 . | G5 . B5 . A5 . F#5 . | G5 - - - . . . .',
    bass: 'G2 . D3 . G2 . D3 . | D3 . A2 . D3 . F#2 . | C3 . G2 . C3 . E3 . | G2 . D3 . G2 . B2 . | E3 . B2 . E3 . B2 . | C3 . G2 . D3 . A2 . | G2 . E3 . D3 . D2 . | G2 . D3 . G2 . . .',
    drums: 'k.hhs.h.',
    lead2: 0.25,
  },
  keep: {
    bpm: 120,
    lead: 'D5 . F5 . A5 . G5 F5 | E5 - C5 . A4 . . . | D5 . F5 . A5 . C6 A5 | Bb5 - A5 . G5 . . . | F5 . G5 . A5 . D6 . | C6 . Bb5 . A5 . G5 . | F5 . E5 . D5 . C#5 . | D5 - - - . . . .',
    bass: 'D2 . A2 . D2 . A2 . | C2 . G2 . A1 . E2 . | D2 . A2 . F2 . A2 . | G1 . D2 . G2 . . . | Bb1 . F2 . Bb1 . F2 . | C2 . G2 . C2 . E2 . | A1 . E2 . A1 . C#2 . | D2 . A1 . D2 . . .',
    drums: 'k..hk.s.',
    lead2: 0.2,
  },
  palace: {
    bpm: 150,
    lead: 'C6 E6 G6 E6 C6 E6 G6 E6 | D6 F6 A6 F6 D6 F6 A6 F6 | E6 G6 C7 G6 E6 G6 C7 G6 | D6 - G5 - C6 - - -',
    bass: 'C3 . C3 . G2 . G2 . | D3 . D3 . A2 . A2 . | E3 . E3 . C3 . C3 . | G2 . G2 . C3 . . .',
    drums: 'k.h.k.h.',
    lead2: 0.2,
  },
  boss: {
    bpm: 160,
    lead: 'A4 A4 C5 A4 E5 A4 D5 C5 | A4 A4 C5 A4 F5 E5 D5 C5 | G4 G4 B4 G4 D5 G4 C5 B4 | E5 - D5 - C5 - B4 -',
    bass: 'A1 . A2 . A1 . A2 . | F1 . F2 . F1 . F2 . | G1 . G2 . G1 . G2 . | E1 . E2 . E1 . G#1 .',
    drums: 'k.s.k.s.',
    lead2: 0.15,
  },
  ending: {
    bpm: 120,
    lead: 'C5 . E5 . G5 . C6 . | B5 . G5 . D5 . G5 . | A5 . F5 . C5 . F5 . | G5 - - - C6 - - -',
    bass: 'C3 . G2 . C3 . G2 . | G2 . D3 . G2 . D3 . | F2 . C3 . F2 . C3 . | G2 . G2 . C3 . . .',
    drums: 'k.h.s.h.',
    lead2: 0.35,
  },
  star: {
    bpm: 88,
    lead: 'E5 . B5 . G#5 . E6 . | D#6 . B5 . F#5 . . . | C#6 . A5 . E5 . A5 . | B5 - - - . . . .',
    bass: 'E3 . . . B2 . . . | B2 . . . F#2 . . . | A2 . . . E2 . . . | B2 . . . E3 . . .',
    drums: '........',
    lead2: 0.5,
    leadType: 'sine',
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
  jump: (s) => s.tone(280, 0.16, { type: 'square', slide: 620, vol: 0.09 }),
  spin: (s) => {
    s.tone(420, 0.22, { type: 'triangle', slide: 1100, vol: 0.12 });
    s.noise(0.2, { filter: 'bandpass', freq: 900, slide: 3000, vol: 0.12 });
  },
  coin: (s) => {
    s.tone(988, 0.08, { type: 'square', vol: 0.08 });
    s.tone(1319, 0.28, { type: 'square', vol: 0.08, delay: 0.07 });
  },
  stomp: (s) => {
    s.tone(240, 0.14, { type: 'square', slide: 70, vol: 0.14 });
    s.noise(0.08, { freq: 600, vol: 0.15 });
  },
  squish: (s) => {
    s.tone(180, 0.18, { type: 'sine', slide: 60, vol: 0.25 });
    s.noise(0.1, { freq: 400, vol: 0.18 });
  },
  bump: (s) => {
    s.tone(120, 0.09, { type: 'triangle', slide: 70, vol: 0.25 });
    s.noise(0.05, { freq: 500, vol: 0.12 });
  },
  break: (s) => {
    s.noise(0.3, { freq: 1500, slide: 200, vol: 0.3 });
    s.tone(160, 0.15, { type: 'square', slide: 50, vol: 0.1 });
  },
  sprout: (s) => s.arp(['G4', 'C5', 'E5', 'G5'], 0.05, { type: 'triangle', vol: 0.12, len: 0.12 }),
  powerup: (s) => s.arp(['C5', 'E5', 'G5', 'C6', 'E6', 'G6'], 0.055, { type: 'square', vol: 0.07, len: 0.1 }),
  feather: (s) => {
    s.noise(0.4, { filter: 'bandpass', freq: 500, slide: 4000, vol: 0.12 });
    s.arp(['E5', 'A5', 'C#6', 'E6'], 0.07, { type: 'triangle', vol: 0.12 });
  },
  shrink: (s) => s.arp(['G5', 'E5', 'C5', 'G4'], 0.06, { type: 'square', vol: 0.08, len: 0.1 }),
  oneup: (s) => s.arp(['E5', 'G5', 'E6', 'C6', 'D6', 'G6'], 0.08, { type: 'square', vol: 0.07, len: 0.12 }),
  kick: (s) => s.tone(700, 0.1, { type: 'square', slide: 200, vol: 0.1 }),
  tongue: (s) => s.tone(500, 0.1, { type: 'sine', slide: 1400, vol: 0.18 }),
  gulp: (s) => {
    s.tone(320, 0.18, { type: 'sine', slide: 110, vol: 0.25 });
    s.tone(200, 0.1, { type: 'sine', slide: 90, vol: 0.2, delay: 0.12 });
  },
  mount: (s) => {
    s.tone(660, 0.08, { type: 'triangle', vol: 0.18 });
    s.tone(990, 0.12, { type: 'triangle', vol: 0.18, delay: 0.08 });
  },
  hatch: (s) => {
    s.noise(0.12, { freq: 2500, vol: 0.15 });
    s.arp(['C5', 'G5', 'C6'], 0.08, { type: 'triangle', vol: 0.15 });
  },
  ouch: (s) => s.tone(520, 0.25, { type: 'square', slide: 160, vol: 0.12 }),
  key: (s) => s.arp(['A5', 'C#6', 'E6', 'A6'], 0.05, { type: 'triangle', vol: 0.12, len: 0.15 }),
  unlock: (s) => {
    s.noise(0.25, { freq: 3000, slide: 300, vol: 0.15 });
    s.arp(['E6', 'B5', 'G#5'], 0.05, { type: 'triangle', vol: 0.12 });
  },
  secret: (s) => s.arp(['C5', 'E5', 'G5', 'B5', 'D6', 'F#6', 'A6', 'C7'], 0.11, { type: 'triangle', vol: 0.14, len: 0.6 }),
  spring: (s) => s.tone(130, 0.35, { type: 'sine', slide: 700, vol: 0.3 }),
  cape: (s) => s.noise(0.22, { filter: 'bandpass', freq: 600, slide: 2600, vol: 0.16, q: 2 }),
  takeoff: (s) => {
    s.noise(0.5, { filter: 'bandpass', freq: 300, slide: 2500, vol: 0.14 });
    s.tone(300, 0.4, { type: 'triangle', slide: 900, vol: 0.08 });
  },
  boom: (s) => {
    s.noise(0.35, { freq: 500, slide: 80, vol: 0.35 });
    s.tone(90, 0.25, { type: 'sine', slide: 40, vol: 0.3 });
  },
  pound: (s) => {
    s.noise(0.45, { freq: 300, slide: 60, vol: 0.45 });
    s.tone(70, 0.4, { type: 'sine', slide: 35, vol: 0.4 });
  },
  death: (s) => s.arp(['B4', 'F5', '.', 'F5', 'F5', 'E5', 'D5', 'C5'], 0.14, { type: 'square', vol: 0.08, len: 0.2 }),
  clear: (s) => s.arp(['G4', 'C5', 'E5', 'G5', 'C6', 'E6', 'G6', '.', 'E6', '.', 'G6'], 0.1, { type: 'square', vol: 0.07, len: 0.18 }),
  tape: (s) => s.arp(['C6', 'E6', 'G6', 'C7'], 0.04, { type: 'triangle', vol: 0.12 }),
  checkpoint: (s) => s.arp(['G5', 'C6', 'E6'], 0.07, { type: 'triangle', vol: 0.14, len: 0.25 }),
  pause: (s) => {
    s.tone(880, 0.06, { type: 'square', vol: 0.06 });
    s.tone(660, 0.1, { type: 'square', vol: 0.06, delay: 0.07 });
  },
  message: (s) => s.tone(740, 0.08, { type: 'triangle', vol: 0.12 }),
  select: (s) => s.tone(990, 0.06, { type: 'triangle', vol: 0.12 }),
  step: (s) => s.tone(1200, 0.025, { type: 'triangle', vol: 0.05 }),
  pop: (s) => s.tone(500 + Math.random() * 400, 0.07, { type: 'sine', slide: 1400, vol: 0.18 }),
  thunder: (s) => s.noise(1.6, { freq: 220, slide: 50, vol: 0.3, attack: 0.05 }),
  bosshit: (s) => {
    s.tone(220, 0.3, { type: 'square', slide: 55, vol: 0.14 });
    s.noise(0.3, { freq: 900, slide: 100, vol: 0.25 });
  },
  bossdie: (s) => {
    s.noise(1.0, { freq: 800, slide: 40, vol: 0.4 });
    s.arp(['A5', 'E5', 'C5', 'A4', 'E4'], 0.1, { type: 'square', vol: 0.08 });
  },
  switch: (s) => {
    s.tone(90, 0.3, { type: 'square', slide: 45, vol: 0.2 });
    s.arp(['C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7'], 0.07, { type: 'triangle', vol: 0.12, delay: 0.25 });
  },
  gameover: (s) => s.arp(['C5', 'G4', 'E4', 'A4', 'B4', 'A4', 'G#4', 'A#4', 'G#4', 'G4'], 0.16, { type: 'triangle', vol: 0.14, len: 0.3 }),
};
