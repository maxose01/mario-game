'use strict';
// Everything you hear is synthesized with WebAudio: no audio files.
// Sound effects are short oscillator/noise recipes, music is a tiny step sequencer playing
// original tunes (one per world, and one per section of a point-to-point run), and each local
// racer gets a little engine hum, plus wind while gliding and the cargo plane's drone.

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
// Song fields: bpm, lead, bass, drums (8 steps per bar: k kick, s snare, h hat, o open hat,
// t / T low / high tom), lead2 (octave shimmer), leadType, and optionally
//   leadVol, leadVib  lead volume and vibrato depth (fraction of the pitch) on held notes
//   arp               a third line (counter-melody, chord stabs or droplets) with arpType
//                     (an oscillator type, or 'drop' for a water-droplet bloop), arpVol and
//                     arpLen (fraction of the step: < 1 for staccato)
//   fill              drum pattern for the last bar of the loop
//   crash             a crash cymbal on the first beat of every loop
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
  // Mount Wobble, one song per section. Summit Drop: a brisk, airy horn call in D over an
  // oom-pah bounce (accordion stabs on the off-beats), with a lydian lift before the turnaround.
  mount1: {
    bpm: 152,
    lead: 'A5 . D6 . F#6 . E6 D6 | B5 . D6 . G6 - F#6 E6 | F#6 . A5 . D6 . E6 F#6 | E6 - - . C#6 . A5 . | B5 . D6 F#6 . E6 D6 . | G5 . B5 D6 . C#6 B5 . | G#5 . B5 . E6 - D6 C#6 | A5 - - . . . E5 G5',
    bass: 'D3 . A2 . D3 . A2 . | G2 . D3 . G2 . D3 . | A2 . D3 . F#2 . A2 . | A2 . E3 . A2 . C#3 . | B2 . F#2 . B2 . F#2 . | G2 . D3 . G2 . B2 . | E2 . B2 . E2 . G#2 . | A2 . E2 . A2 . C#3 .',
    arp: '. F#4 . A4 . F#4 . A4 | . B4 . D5 . B4 . D5 | . F#4 . A4 . F#4 . A4 | . C#5 . E5 . C#5 . E5 | . D5 . F#5 . D5 . F#5 | . B4 . D5 . B4 . D5 | . G#4 . B4 . G#4 . B4 | . C#5 . E5 . C#5 . G5',
    drums: 'k.shk.sh',
    fill: 'k.ssTTtt',
    crash: true,
    lead2: 0.4,
    leadVib: 0.006,
    arpType: 'square',
    arpVol: 0.09,
    arpLen: 0.45,
  },
  // Wobble Dam: a driving G minor run down the spillway, octave-jumping bass, a wobbly square
  // lead and water droplets plinking on the off-beats.
  mount2: {
    bpm: 164,
    lead: 'G5 . D5 G5 . A5 Bb5 . | A5 . F5 . C6 . A5 . | G5 . Eb5 G5 . Bb5 C6 . | D6 - - . C6 . A5 . | Bb5 . G5 Bb5 . C6 D6 . | C6 . A5 C6 . F6 D6 . | Eb6 . D6 C6 . Bb5 G5 . | F#5 - - . A5 . D6 .',
    bass: 'G2 G2 G3 G2 G2 G2 G3 G2 | F2 F2 F3 F2 F2 F2 F3 F2 | Eb2 Eb2 Eb3 Eb2 Eb2 Eb2 Eb3 Eb2 | D2 D2 D3 D2 D2 D2 D3 D2 | G2 G2 G3 G2 G2 G2 Bb2 G2 | F2 F2 F3 F2 F2 F2 A2 F2 | Eb2 Eb2 Eb3 Eb2 Eb2 Eb2 G2 Eb2 | D2 D2 D3 D2 C3 A2 F#2 D2',
    arp: '. . D6 . . G6 . . | . . C6 . . F6 . . | . . Bb5 . . Eb6 . . | . . A5 . . D6 . F#6 | . . D6 . . G6 . Bb6 | . . C6 . . F6 . A6 | . . Bb5 . . Eb6 . G6 | . . A5 . D6 . F#6 A6',
    drums: 'kkshk.sh',
    fill: 'kks.ssss',
    crash: true,
    lead2: 0.15,
    leadType: 'square',
    leadVol: 0.3,
    leadVib: 0.012,
    arpType: 'drop',
    arpVol: 0.3,
  },
  // Ski Run: the finale. A dotted fanfare in B-flat over a marching bass and a warm horn pad,
  // climbing through C7 to the last turnaround.
  mount3: {
    bpm: 172,
    lead: 'F5 . . Bb5 D6 . F6 - | G6 . Eb6 . Bb5 . Eb6 . | C6 . . A5 C6 . F6 - | D6 - - - . F5 G5 A5 | Bb5 . . G5 Bb5 . D6 - | Eb6 . D6 C6 Bb5 . G5 . | C6 . . E6 G6 . E6 - | F6 - - . Eb6 . C6 A5',
    bass: 'Bb2 . F2 . Bb2 . F2 . | Eb2 . Bb2 . Eb2 . G2 . | F2 . C3 . F2 . A2 . | Bb2 . F2 . Bb2 C3 D3 . | G2 . D3 . G2 . D3 . | Eb2 . Bb2 . Eb2 . Bb2 . | C3 . G2 . C3 . E2 . | F2 . C3 . F2 G2 A2 .',
    arp: 'D4 - - - F4 - - - | G4 - - - Bb4 - - - | A4 - - - C5 - - - | Bb4 - - - F4 - - - | D4 - - - G4 - - - | G4 - - - Eb4 - - - | E4 - - - G4 - - - | A4 - - - Eb4 - - -',
    drums: 'k.shkksh',
    fill: 's.ssTTtt',
    crash: true,
    lead2: 0.15,
    leadType: 'square',
    leadVol: 0.3,
    arpType: 'triangle',
    arpVol: 0.32,
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
  if (SONGS[k].arp) SONGS[k].arpSteps = parseTrack(SONGS[k].arp);
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
  queued: null, // song waiting for the next bar line (see playSong)
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
    src.loop = true; // the buffer is a second long; long washes simply loop it
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
  // A struck bell: a sine with two inharmonic partials that die away faster than it does.
  bell(freq, dur, vol, delay = 0) {
    this.tone(freq, dur, { type: 'sine', vol, delay });
    this.tone(freq * 2.76, dur * 0.55, { type: 'sine', vol: vol * 0.4, delay });
    this.tone(freq * 5.4, dur * 0.3, { type: 'sine', vol: vol * 0.18, delay });
  },
  // A pitch-bending cartoon voice (moos, boings, zings): the pitch follows o.pitch =
  // [[seconds, Hz], ...], with optional vibrato (o.vib Hz, o.depth -> o.depthEnd Hz) and a filter
  // whose cutoff follows o.cutoff = [[seconds, Hz], ...]. Holds at o.vol, then fades over
  // o.release seconds.
  bend(dur, o) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator();
    osc.type = o.type || 'sine';
    const ramp = (param, pts) => {
      param.setValueAtTime(pts[0][1], t);
      for (let i = 1; i < pts.length; i++) param.linearRampToValueAtTime(pts[i][1], t + pts[i][0]);
    };
    ramp(osc.frequency, o.pitch);
    if (o.vib) {
      const lfo = c.createOscillator(), depth = c.createGain();
      lfo.frequency.value = o.vib;
      depth.gain.setValueAtTime(o.depth || 0, t);
      if (o.depthEnd !== undefined) depth.gain.linearRampToValueAtTime(o.depthEnd, t + dur);
      lfo.connect(depth);
      depth.connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    let out = osc;
    if (o.cutoff) {
      const f = c.createBiquadFilter();
      f.type = o.filter || 'lowpass';
      f.Q.value = o.q || 1;
      ramp(f.frequency, o.cutoff);
      osc.connect(f);
      out = f;
    }
    const g = c.createGain();
    const vol = o.vol !== undefined ? o.vol : 0.15;
    const atk = o.attack || 0.01;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + atk);
    g.gain.setValueAtTime(vol, t + Math.max(atk, dur - (o.release || dur * 0.5)));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    out.connect(g);
    g.connect(o.dest || this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  },

  play(name, a) {
    if (!this.ctx || this.muted) return;
    const f = SFX[name];
    if (f) f(this, a);
  },

  // ---------- music ----------
  // Switch songs. With onBar (a new section of a point-to-point run) the new song waits for
  // the next bar line of the current one and takes over on the beat, instead of mid-phrase.
  playSong(name, onBar) {
    if (!this.ctx) {
      this.pendingSong = name;
      return;
    }
    if (this.songName === name && this.song) {
      this.queued = null;
      return;
    }
    if (onBar && this.song) {
      this.queued = name;
      return;
    }
    this.queued = null;
    this.songName = name;
    this.song = SONGS[name] || null;
    this.step = 0;
    this.tempoMul = 1;
    this.nextTime = this.ctx.currentTime + 0.08;
  },
  stopSong() {
    this.song = null;
    this.songName = '';
    this.queued = null;
    this.pendingSong = null;
  },
  schedule() {
    const c = this.ctx;
    if (!c || !this.song) return;
    // a throttled timer (hidden tab) must not fire a burst of late notes when it wakes up
    if (this.nextTime < c.currentTime - 0.2) this.nextTime = c.currentTime + 0.02;
    while (this.nextTime < c.currentTime + 0.12) {
      if (this.queued && this.step % 8 === 0) {
        // on the bar line: hand over to the queued song without missing a beat
        this.song = SONGS[this.queued] || this.song;
        this.songName = this.queued;
        this.queued = null;
        this.step = 0;
        this.tempoMul = 1;
      }
      const s = this.song;
      const stepDur = 60 / s.bpm / 2 / this.tempoMul;
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
    const L = s.leadSteps, B = s.bassSteps, A = s.arpSteps;
    const li = step % L.length, bi = step % B.length;
    const ln = L[li], bn = B[bi];
    const voice = (freq, len, type, vol, when, vib) => {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      if (vib && len > 0.3) {
        // a gentle vibrato that creeps in on held notes
        const lfo = c.createOscillator(), depth = c.createGain();
        lfo.frequency.value = 5.5;
        depth.gain.setValueAtTime(0, when);
        depth.gain.linearRampToValueAtTime(freq * vib, when + Math.min(0.3, len * 0.5));
        lfo.connect(depth);
        depth.connect(osc.frequency);
        lfo.start(when);
        lfo.stop(when + len + 0.05);
      }
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(vol, when + 0.008);
      g.gain.exponentialRampToValueAtTime(vol * 0.35, when + Math.min(len, 0.18));
      g.gain.exponentialRampToValueAtTime(0.0001, when + len);
      osc.connect(g);
      g.connect(dest);
      osc.start(when);
      osc.stop(when + len + 0.05);
    };
    // a water droplet: a sine that bloops up into its note and is gone
    const droplet = (freq, vol, when) => {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * 0.55, when);
      osc.frequency.exponentialRampToValueAtTime(freq, when + 0.04);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(vol, when + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
      osc.connect(g);
      g.connect(dest);
      osc.start(when);
      osc.stop(when + 0.25);
    };
    if (ln && ln !== '-' && ln !== '.') {
      const f = noteFreq(ln);
      const len = dur * this.holdLength(L, li) * 0.95;
      const vol = s.leadVol !== undefined ? s.leadVol : 0.5;
      voice(f, len, s.leadType || 'triangle', vol, t, s.leadVib);
      if (s.lead2) voice(f * 2, len * 0.6, 'sine', 0.5 * s.lead2, t); // marimba-ish shimmer
    }
    if (bn && bn !== '-' && bn !== '.') {
      voice(noteFreq(bn), dur * this.holdLength(B, bi) * 0.9, 'triangle', 0.55, t);
    }
    if (A) {
      const ai = step % A.length, an = A[ai];
      if (an && an !== '-' && an !== '.') {
        const vol = s.arpVol !== undefined ? s.arpVol : 0.25;
        if (s.arpType === 'drop') droplet(noteFreq(an), vol, t);
        else voice(noteFreq(an), dur * this.holdLength(A, ai) * (s.arpLen || 0.9), s.arpType || 'triangle', vol, t);
      }
    }
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
      src.loop = len > 0.4;
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
    // drums: the fill pattern takes the last bar of the loop, a crash marks the top of it
    const bars = Math.max(1, Math.floor(L.length / 8));
    const pat = s.fill && Math.floor(li / 8) === bars - 1 ? s.fill : s.drums;
    const d = pat[step % pat.length];
    if (s.crash && li === 0) hiss(1.3, 3200, 0.3);
    if (d === 'k') drum(150, 45, 0.16, 0.9);
    else if (d === 's') hiss(0.12, 1800, 0.35);
    else if (d === 'h') hiss(0.04, 6000, 0.18);
    else if (d === 'o') hiss(0.16, 5000, 0.2);
    else if (d === 't') drum(170, 95, 0.2, 0.75);
    else if (d === 'T') drum(250, 150, 0.16, 0.7);
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
  // ---- course features ----
  // the glider unfurls: a rush of air, two flaps of canvas and a little "whee"
  glide: (s) => {
    s.noise(0.75, { filter: 'bandpass', freq: 380, slide: 1700, q: 0.8, vol: 0.2, attack: 0.12 });
    s.noise(0.06, { filter: 'lowpass', freq: 1300, vol: 0.16 });
    s.noise(0.06, { filter: 'lowpass', freq: 1100, vol: 0.12, delay: 0.09 });
    s.tone(440, 0.45, { type: 'sine', slide: 880, vol: 0.05, attack: 0.08, delay: 0.05 });
  },
  // through a boost ring: a bright chime and a rush; rings flown in a row climb the scale
  ring: (s, n = 0) => {
    const steps = [0, 2, 4, 7, 9, 12, 14, 16];
    const f = noteFreq('C6') * Math.pow(2, steps[U.clamp(n | 0, 0, steps.length - 1)] / 12);
    s.bell(f, 0.9, 0.1);
    s.bell(f * 1.5, 0.7, 0.07, 0.07);
    s.noise(0.4, { filter: 'bandpass', freq: 900, slide: 4200, q: 1.2, vol: 0.12 });
  },
  // a checkpoint arch: a brassy sting that lands on a held major chord
  section: (s) => {
    s.arp(['G5', 'C6', 'E6'], 0.07, { type: 'square', vol: 0.06, len: 0.12 });
    for (const n of ['C6', 'E6', 'G6']) s.tone(noteFreq(n), 0.6, { type: 'square', vol: 0.045, delay: 0.21, attack: 0.02 });
    s.tone(noteFreq('C4'), 0.6, { type: 'triangle', vol: 0.12, delay: 0.21 });
  },
  // into the last section: a snare roll, then the sting a step higher and longer
  finalsection: (s) => {
    for (let i = 0; i < 6; i++) s.noise(0.07, { filter: 'highpass', freq: 1800, vol: 0.08 + i * 0.012, delay: i * 0.045 });
    s.arp(['A5', 'D6', 'F#6'], 0.07, { type: 'square', vol: 0.06, len: 0.12, delay: 0.27 });
    for (const n of ['D6', 'F#6', 'A6']) s.tone(noteFreq(n), 0.9, { type: 'square', vol: 0.045, delay: 0.48, attack: 0.02 });
    s.tone(noteFreq('D4'), 0.9, { type: 'triangle', vol: 0.12, delay: 0.48 });
  },
  // an anti-gravity spin boost: a whirling zing
  spinboost: (s) => {
    s.bend(0.32, { type: 'sawtooth', pitch: [[0, 520], [0.12, 1500], [0.32, 2300]], vib: 28, depth: 160, depthEnd: 20, cutoff: [[0, 2500], [0.32, 6000]], vol: 0.05, release: 0.2 });
    s.tone(1250, 0.3, { type: 'triangle', slide: 3100, vol: 0.06, delay: 0.04 });
    s.noise(0.3, { filter: 'bandpass', freq: 2000, slide: 5200, q: 3, vol: 0.08 });
  },
  // a geyser erupting: a gush of water (or a deep roar of lava)
  geyser: (s, look) => {
    const lava = look === 'lava';
    s.noise(1.1, { filter: 'bandpass', freq: lava ? 200 : 650, slide: lava ? 800 : 2600, q: 0.7, vol: lava ? 0.14 : 0.22, attack: 0.12 });
    s.noise(0.9, { filter: 'lowpass', freq: lava ? 150 : 420, vol: lava ? 0.12 : 0.2, attack: 0.04 });
    if (lava) s.tone(70, 0.9, { type: 'sine', slide: 42, vol: 0.1 });
    else for (let i = 0; i < 4; i++) s.tone(420 + Math.random() * 520, 0.08, { type: 'sine', slide: 1300, vol: 0.05, delay: 0.25 + i * 0.13 });
  },
  // an icicle shattering on the road: a sharp crack and a spray of glassy tinkles
  icicle: (s) => {
    s.noise(0.08, { filter: 'highpass', freq: 3000, vol: 0.26 });
    s.noise(0.45, { filter: 'bandpass', freq: 2600, slide: 900, q: 1.2, vol: 0.14, delay: 0.02 });
    for (let i = 0; i < 6; i++) s.bell(2300 + Math.random() * 2800, 0.25, 0.028, 0.03 + i * 0.045);
  },
  // a clay cow: a nasal "mmm-OOO" that sags at the end
  moo: (s) => {
    s.bend(1.05, { type: 'sawtooth', pitch: [[0, 118], [0.25, 150], [0.7, 140], [1.05, 96]], vib: 5, depth: 3, cutoff: [[0, 260], [0.3, 950], [1.05, 420]], q: 5, vol: 0.055, attack: 0.09, release: 0.4 });
    s.bend(1.05, { type: 'square', pitch: [[0, 59], [0.25, 75], [0.7, 70], [1.05, 48]], cutoff: [[0, 200], [0.3, 500], [1.05, 260]], vol: 0.02, attack: 0.09, release: 0.4 });
  },
  // a mole popping out of its mound: a rattle of dirt and a cork pop
  mole: (s) => {
    s.noise(0.16, { filter: 'lowpass', freq: 700, vol: 0.16 });
    s.tone(260, 0.12, { type: 'sine', slide: 920, vol: 0.22, delay: 0.03 });
    s.tone(1450, 0.05, { type: 'triangle', vol: 0.05, delay: 0.03 });
  },
  // an anti-gravity bumper: boing!
  bumper: (s) => {
    s.bend(0.55, { type: 'sine', pitch: [[0, 150], [0.05, 340], [0.55, 300]], vib: 19, depth: 70, depthEnd: 4, vol: 0.1, attack: 0.004, release: 0.45 });
    s.tone(1800, 0.12, { type: 'triangle', slide: 900, vol: 0.05 });
  },
  // a star bowls a hazard over
  bonk: (s) => {
    s.tone(880, 0.14, { type: 'square', slide: 220, vol: 0.08 });
    s.noise(0.12, { freq: 1500, vol: 0.12 });
    s.arp(['C6', 'G6'], 0.05, { type: 'triangle', vol: 0.08, delay: 0.08 });
  },
  // into water: a splash with a few bubbles
  splash: (s) => {
    s.noise(0.45, { filter: 'bandpass', freq: 1500, slide: 450, q: 0.8, vol: 0.22 });
    s.noise(0.18, { filter: 'highpass', freq: 3500, vol: 0.12 });
    for (let i = 0; i < 3; i++) s.tone(480 + Math.random() * 600, 0.07, { type: 'sine', slide: 1500, vol: 0.06, delay: 0.08 + i * 0.07 });
  },
  // off a mogul or a ramp lip (they come often, so barely there)
  launch: (s) => s.tone(240, 0.1, { type: 'triangle', slide: 430, vol: 0.035 }),
};

// Continuous voices: an engine hum per local camera (a low sawtooth through a lowpass, pitched
// by speed), a rush of wind per camera while gliding, and the cargo plane's droning propellers.
const Engines = {
  voices: [],
  winds: [],
  drone: null,
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
  // Wind past a glider: band-passed noise that brightens with speed (amount 0..1).
  wind(i, amount, speed01) {
    const c = Sound.ctx;
    if (!c) return;
    let w = this.winds[i];
    if (!w) {
      if (!(amount > 0)) return;
      const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      src.buffer = Sound.noiseBuf;
      src.loop = true;
      f.type = 'bandpass';
      f.frequency.value = 600;
      f.Q.value = 0.6;
      g.gain.value = 0;
      src.connect(f);
      f.connect(g);
      g.connect(Sound.sfxGain);
      src.start();
      w = this.winds[i] = { src, f, g };
    }
    const t = c.currentTime;
    w.f.frequency.setTargetAtTime(450 + speed01 * 900 + Math.sin(t * 1.7 + i) * 140, t, 0.2);
    w.g.gain.setTargetAtTime(amount > 0 ? amount * 0.3 : 0, t, amount > 0 ? 0.25 : 0.35);
  },
  // The cargo plane: two detuned sawtooth engines chopped by the propellers. vol 0..1, rate =
  // pitch factor (Doppler). vol 0 fades it out and lets it go.
  plane(vol, rate = 1) {
    const c = Sound.ctx;
    if (!c) return;
    let v = this.drone;
    if (!v) {
      if (!(vol > 0)) return;
      const a = c.createOscillator(), b = c.createOscillator(), lfo = c.createOscillator();
      const chopDepth = c.createGain(), chop = c.createGain(), f = c.createBiquadFilter(), g = c.createGain();
      a.type = b.type = 'sawtooth';
      a.frequency.value = 55;
      b.frequency.value = 83;
      lfo.frequency.value = 15;
      chop.gain.value = 0.6;
      chopDepth.gain.value = 0.4;
      lfo.connect(chopDepth);
      chopDepth.connect(chop.gain);
      f.type = 'lowpass';
      f.frequency.value = 650;
      f.Q.value = 0.9;
      g.gain.value = 0;
      a.connect(f);
      b.connect(f);
      f.connect(chop);
      chop.connect(g);
      g.connect(Sound.sfxGain);
      a.start();
      b.start();
      lfo.start();
      v = this.drone = { a, b, lfo, f, g };
    }
    const t = c.currentTime;
    if (!(vol > 0)) {
      v.g.gain.setTargetAtTime(0, t, 0.15);
      for (const o of [v.a, v.b, v.lfo]) o.stop(t + 0.8);
      this.drone = null;
      return;
    }
    v.a.frequency.setTargetAtTime(55 * rate, t, 0.1);
    v.b.frequency.setTargetAtTime(83 * rate, t, 0.1);
    v.lfo.frequency.setTargetAtTime(15 * rate, t, 0.1);
    v.f.frequency.setTargetAtTime(450 + vol * 500, t, 0.1);
    v.g.gain.setTargetAtTime(vol * 0.55, t, 0.12);
  },
  silence() {
    for (let i = 0; i < this.voices.length; i++) this.set(i, false, 0, false);
    for (let i = 0; i < this.winds.length; i++) this.wind(i, 0, 0);
    this.plane(0);
  },
};
