'use strict';
// Course: Magma Keep. King Mudlet's castle over a lava sea: the courtyard, the stomper hall
// inside the keep, a rampart ramp with rolling boulders, the lava bridge where fireballs leap
// across, the Lava Lake bend (the Rainbow Bridge hidden route cuts across), the fire-bar
// corridor, the Tower Twist (an anti-gravity spiral up and around the great spire) and the long
// run over the lava pit past the geysers.
// See js/tracks.js for the placement conventions.
TRACK_DEFS.push({
  id: 'magma',
  name: 'Magma Keep',
  blurb: "King Mudlet's castle over a lava sea: stompers, fire bars, leaping fireballs and an anti-gravity twist around the great spire.",
  music: 'magma',
  staff: { 150: 119.0, 200: 101.1 },
  difficulty: 3,
  theme: 'lava',
  hw: 7.5, sh: 3.5, wallL: true, wallR: true,
  segments: [
    { s: 90 },                                // 0 courtyard
    { r: 90, rad: 24, bank: 10 },             // 1
    { s: 60, adj: true },                     // 2 stomper hall
    { l: 90, rad: 24 },                       // 3
    { s: 50, y: 6 },                          // 4 rampart ramp
    { r: 90, rad: 24, y: 6, bank: 12 },       // 5
    { s: 85, y: 6, wallL: false, wallR: false, hw: 6.5 }, // 6 lava bridge
    { r: 150, rad: 54, y: 0, wallR: false, hw: 7.5 }, // 7 Lava Lake bend (rainbow cuts across)
    { s: 65 },                                // 8 fire bar corridor
    { l: 60, rad: 30 },                       // 9
    { s: 40, adj: true },                     // 10 throne hall
    { r: 180, rad: 28, y: 14, bank: 50, antigrav: true, style: 'metal' }, // 11 the Tower Twist
    { s: 40, y: 16, antigrav: true, style: 'metal' }, // 12 spire bridge
    { l: 90, rad: 32, y: 6, bank: 28 },       // 13 back down
    { s: 110, y: 0 },                         // 14 the long run (lava pit jump)
    { r: 90, rad: 26, bank: 10 },             // 15
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
    { kind: 'boost', seg: 6, t: 0.15, len: 6, d: -2.5, w: 3.5 },
    { kind: 'boost', seg: 12, t: 0.4, len: 6, d: 0, w: 6 },
    { kind: 'boost', seg: 14, t: 0.36, len: 5, d: 0, w: 8 },
    { kind: 'ramp', seg: 14, t: 0.45, len: 7, d: 0, w: 40, h: 1.6 },
    { kind: 'gap', seg: 14, t: 0.45, ds: 8.5, len: 8, d: 0, w: 40 },
    { kind: 'boost', path: 'rainbow', u: 0.3, len: 6, d: 0, w: 5 },
    { kind: 'boost', path: 'rainbow', u: 0.62, len: 6, d: 0, w: 5 },
  ],
  boxes: [
    { seg: 1, t: 0.9, d: [-5, -1.7, 1.7, 5] },
    { seg: 5, t: 0.9, d: [-4.5, -1.5, 1.5, 4.5] },
    { seg: 8, t: 0.1, d: [-5, -1.7, 1.7, 5] },
    { seg: 10, t: 0.5, d: [-5, -1.7, 1.7, 5] },
    { seg: 14, t: 0.12, d: [-5, -1.7, 1.7, 5] },
    { path: 'rainbow', u: 0.48, d: [-2, 2] },
  ],
  coins: [
    { seg: 0, t: 0.25, d: -3, n: 6, gap: 3 },
    { seg: 2, t: 0.1, d: 0, n: 4, gap: 3 },
    { seg: 7, t: 0.35, d: -4, n: 6, gap: 3.2 },
    { seg: 11, t: 0.3, d: -3, n: 8, gap: 3 },
    { seg: 13, t: 0.4, d: 2, n: 6, gap: 3 },
    { seg: 14, t: 0.7, d: -2, n: 5, gap: 3 },
    { path: 'rainbow', u: 0.55, d: 0, n: 8, gap: 2.5 },
  ],
  keys: [{ seg: 6, t: 0.55, d: 4.8, h: 1.3 }],
  hazards: [
    { kind: 'stomper', seg: 2, t: 0.3, d: -3.5, phase: 0 },
    { kind: 'stomper', seg: 2, t: 0.55, d: 3, phase: 0.35 },
    { kind: 'stomper', seg: 2, t: 0.8, d: -1.5, phase: 0.7 },
    { kind: 'roller', seg: 4, t: 0.5, d: 0, range: 9, period: 4.6, r: 2, look: 'boulder' },
    { kind: 'podoboo', seg: 6, t: 0.3, d: 0, period: 3.2 },
    { kind: 'podoboo', seg: 6, t: 0.72, d: 0, period: 3.2, phase: 0.5 },
    { kind: 'firebar', seg: 8, t: 0.3, d: -2.5, len: 5, speed: 1.3 },
    { kind: 'firebar', seg: 8, t: 0.75, d: 2.5, len: 5, speed: -1.5 },
    { kind: 'stomper', seg: 10, t: 0.75, d: 2.5, phase: 0.2 },
    { kind: 'bumper', seg: 11, t: 0.3, d: -3.5 },
    { kind: 'bumper', seg: 11, t: 0.62, d: 3.5 },
    { kind: 'geyser', seg: 14, t: 0.18, d: -4, period: 3.6, look: 'lava' },
    { kind: 'geyser', seg: 14, t: 0.3, d: 4, period: 3.6, phase: 0.5, look: 'lava' },
  ],
  landmarks: [
    { kind: 'gantry', seg: 0, t: 0 },
    { kind: 'tunnel', seg: 2, t: 0, seg1: 3, t1: 0, look: 'castle' },
    { kind: 'keep', seg: 14, t: 0.5, d: 60 },
    { kind: 'tower', seg: 1, t: 0.5, d: -18 },
    { kind: 'tower', seg: 3, t: 0.5, d: 18 },
    { kind: 'tower', seg: 15, t: 0.5, d: -18 },
    { kind: 'volcano', seg: 7, t: 0.5, d: -130 },
    { kind: 'rainbow', path: 'rainbow' },
    { kind: 'lavafall', seg: 6, t: 0.5, d: -22 },
    { kind: 'arch', seg: 10, t: 0.1, look: 'stone' },
    { kind: 'spire', seg: 11, t: 0.5, d: 28 },
    { kind: 'statue', seg: 14, t: 0.75, d: -20 },
    { kind: 'banner', seg: 0, t: 0.8, d: 0, text: 'MAGMA KEEP' },
  ],
});
