'use strict';
// Course: see js/tracks.js for the placement conventions.
TRACK_DEFS.push({
  id: 'magma',
  name: 'Magma Keep',
  blurb: "King Mudlet's castle over a lava sea. Stompers, fire bars and a rainbow for the brave.",
  music: 'magma',
  difficulty: 3,
  theme: 'lava',
  hw: 7.5, sh: 3.5, wallL: true, wallR: true,
  segments: [
    { s: 80 },                                // 0 courtyard
    { r: 90, rad: 24 },                       // 1
    { s: 60 },                                // 2 stomper hall
    { l: 90, rad: 24 },                       // 3
    { s: 40, y: 4.5 },                        // 4 rampart ramp
    { r: 90, rad: 24, y: 4.5 },               // 5
    { s: 60, y: 4.5, wallL: false, wallR: false }, // 6 lava bridge
    { r: 150, rad: 54, y: 0, wallR: false },  // 7 Lava Lake bend (rainbow cuts across)
    { s: 50 },                                // 8 fire bar corridor
    { l: 60, rad: 30 },                       // 9
    { s: 60 },                                // 10 throne hall
    { r: 90, rad: 26 },                       // 11
    { s: 108 },                               // 12 the long run (lava pit jump)
    { r: 90, rad: 26 },                       // 13
  ],
  branches: [
    { id: 'rainbow', name: 'Rainbow Bridge', seg: 7, phi: 70, gate: 'auto', style: 'rainbow', hw: 5.5, sh: 1, wallL: false, wallR: false, lift: 2.5 },
  ],
  rails: [
    { path: 'rainbow', u: 0, u1: 0.24, side: 0 },
    { path: 'rainbow', u: 0.8, u1: 1, side: 0 },
    { seg: 7, t: 0, t1: 0.3, side: 1 },
    { seg: 7, t: 0.72, t1: 1, side: 1 },
  ],
  zones: [
    { kind: 'boost', seg: 0, t: 0.6, len: 6, d: 0, w: 4 },
    { kind: 'boost', seg: 6, t: 0.2, len: 6, d: -3, w: 4 },
    { kind: 'boost', seg: 12, t: 0.36, len: 5, d: 0, w: 5 },
    { kind: 'ramp', seg: 12, t: 0.45, len: 7, d: 0, w: 40, h: 1.6 },
    { kind: 'gap', seg: 12, t: 0.45, ds: 8.5, len: 8, d: 0, w: 40 },
    { kind: 'boost', path: 'rainbow', u: 0.3, len: 6, d: 0, w: 5 },
    { kind: 'boost', path: 'rainbow', u: 0.62, len: 6, d: 0, w: 5 },
  ],
  boxes: [
    { seg: 1, t: 0.9, d: [-5, -1.7, 1.7, 5] },
    { seg: 5, t: 0.9, d: [-5, -1.7, 1.7, 5] },
    { seg: 8, t: 0.1, d: [-5, -1.7, 1.7, 5] },
    { seg: 12, t: 0.15, d: [-5, -1.7, 1.7, 5] },
    { path: 'rainbow', u: 0.48, d: [-2, 2] },
  ],
  coins: [
    { seg: 0, t: 0.25, d: -3, n: 6, gap: 3 },
    { seg: 2, t: 0.1, d: 0, n: 4, gap: 3 },
    { seg: 7, t: 0.35, d: -4, n: 6, gap: 3.2 },
    { seg: 10, t: 0.3, d: 3, n: 5, gap: 3 },
    { seg: 12, t: 0.7, d: -2, n: 5, gap: 3 },
    { path: 'rainbow', u: 0.55, d: 0, n: 8, gap: 2.5 },
  ],
  keys: [{ seg: 6, t: 0.55, d: 5.8, h: 1.3 }],
  hazards: [
    { kind: 'stomper', seg: 2, t: 0.3, d: -3.5, phase: 0 },
    { kind: 'stomper', seg: 2, t: 0.55, d: 3, phase: 0.35 },
    { kind: 'stomper', seg: 2, t: 0.8, d: -1.5, phase: 0.7 },
    { kind: 'firebar', seg: 8, t: 0.35, d: 0, len: 6, speed: 1.6 },
    { kind: 'firebar', seg: 8, t: 0.8, d: 0, len: 6, speed: -1.9 },
    { kind: 'stomper', seg: 10, t: 0.5, d: 2.5, phase: 0.2 },
  ],
  landmarks: [
    { kind: 'gantry', seg: 0, t: 0 },
    { kind: 'keep', seg: 12, t: 0.5, d: 60 },
    { kind: 'tower', seg: 1, t: 0.5, d: -18 },
    { kind: 'tower', seg: 3, t: 0.5, d: 18 },
    { kind: 'tower', seg: 11, t: 0.5, d: -18 },
    { kind: 'tower', seg: 13, t: 0.5, d: -18 },
    { kind: 'volcano', seg: 7, t: 0.5, d: -130 },
    { kind: 'rainbow', path: 'rainbow' },
  ],
});
