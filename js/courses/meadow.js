'use strict';
// Course: Puffball Circuit. The gentle opener: rolling clay meadows on a floating island, a
// bridge over the clouds, windmill hill, the pond sweeper with the Hollow Log hidden route, a
// jump, and Moo Meadow farm where cows wander by the road and moles pop out of the dirt.
// See js/tracks.js for the placement conventions.
TRACK_DEFS.push({
  id: 'meadow',
  name: 'Puffball Circuit',
  blurb: 'Rolling clay meadows on a floating island: a gentle start, if you can dodge the Mudlets, cows and moles.',
  music: 'meadow',
  staff: { 150: 86.6, 200: 71.6 },
  difficulty: 1,
  theme: 'meadow',
  hw: 8.5, sh: 5, wallL: true, wallR: true,
  segments: [
    { s: 92, adj: true },                     // 0 start straight
    { r: 100, rad: 30, bank: 10 },            // 1 turn one
    { s: 52, y: 3.5, wallL: false, wallR: false, adj: true }, // 2 cloud bridge
    { l: 45, rad: 34, y: 5 },                 // 3 the S
    { r: 45, rad: 34, y: 5 },                 // 4
    { s: 40, y: 5, adj: true },               // 5 windmill hill
    { r: 150, rad: 70, y: 1, bank: 7 },       // 6 Pond Sweeper (hidden route cuts across)
    { s: 74, y: 0 },                          // 7 jump straight
    { l: 50, rad: 32, wallR: false },         // 8 island edge
    { r: 70, rad: 34, bank: 10 },             // 9 into the farm
    { s: 60, hw: 10, adj: true },             // 10 Moo Meadow farm
    { r: 90, rad: 34, bank: 12, hw: 8.5 },    // 11 final corner
  ],
  branches: [{ id: 'log', name: 'Hollow Log Shortcut', seg: 6, phi: 72, gate: 'auto', style: 'wood', hw: 5.5, sh: 2 }],
  rails: [{ seg: 2, t: 0, t1: 1, side: 0 }],
  zones: [
    { kind: 'boost', seg: 0, t: 0.62, len: 6, d: -4, w: 4 },
    { kind: 'boost', seg: 5, t: 0.45, len: 6, d: 3.5, w: 4 },
    { kind: 'ramp', seg: 7, t: 0.3, len: 7, d: 0, w: 9, h: 1.7 },
    { kind: 'boost', path: 'log', u: 0.55, len: 7, d: 0, w: 5 },
    { kind: 'mud', seg: 10, t: 0.3, len: 30, d: 0, w: 4 },
    { kind: 'boost', seg: 10, t: 0.8, len: 6, d: -6, w: 4 },
    { kind: 'mud', seg: 11, t: 0.35, len: 16, d: 9.5, w: 5 },
  ],
  boxes: [
    { seg: 1, t: 0.95, d: [-6, -2, 2, 6] },
    { seg: 5, t: 0.15, d: [-5.5, -1.8, 1.8, 5.5] },
    { seg: 7, t: 0.75, d: [-6, -2, 2, 6] },
    { seg: 10, t: 0.1, d: [-7, -2.3, 2.3, 7] },
    { path: 'log', u: 0.42, d: [-2.2, 2.2] },
  ],
  coins: [
    { seg: 0, t: 0.25, d: 3, n: 6, gap: 3 },
    { seg: 3, t: 0.4, d: -3, n: 5, gap: 3, dd: 1 },
    { seg: 6, t: 0.4, d: 6, n: 6, gap: 3.2 },
    { seg: 8, t: 0.2, d: 0, n: 5, gap: 3 },
    { seg: 10, t: 0.35, d: 6, n: 6, gap: 3 },
    { path: 'log', u: 0.62, d: 0, n: 8, gap: 2.5 },
  ],
  keys: [{ seg: 7, t: 0.3, ds: 13.5, d: 0, h: 2.7 }],
  hazards: [
    { kind: 'walker', seg: 8, t: 0.45, d: 0, range: 7, speed: 2.4 },
    { kind: 'cow', seg: 10, t: 0.25, d: -6.5, range: 2.5, period: 9 },
    { kind: 'mole', seg: 10, t: 0.42, d: 2, period: 3.6 },
    { kind: 'mole', seg: 10, t: 0.58, d: -2, period: 3.6, phase: 0.5 },
    { kind: 'cow', seg: 10, t: 0.72, d: 6.5, range: 2.5, period: 10, phase: 0.4 },
    { kind: 'walker', seg: 11, t: 0.2, d: -2, range: 6, speed: 2 },
    { kind: 'walker', seg: 11, t: 0.6, d: 1, range: 7, speed: 2.6 },
  ],
  landmarks: [
    { kind: 'gantry', seg: 0, t: 0 },
    { kind: 'windmill', seg: 5, t: 0.5, d: -26 },
    { kind: 'windmill', seg: 0, t: 0.45, d: 34 },
    { kind: 'bigshroom', seg: 1, t: 0.5, d: 26 },
    { kind: 'bridge', seg: 2, t: 0, seg1: 3, t1: 0, look: 'wood' },
    { kind: 'arch', seg: 5, t: 0.2, look: 'flowers' },
    { kind: 'pond', seg: 6, t: 0.5, d: 74, r: 16 },
    { kind: 'log', path: 'log' },
    { kind: 'balloon', seg: 7, t: 0.6, d: -40, h: 22 },
    { kind: 'balloon', seg: 3, t: 0.5, d: 46, h: 30 },
    { kind: 'barn', seg: 10, t: 0.5, d: -26 },
    { kind: 'hay', seg: 10, t: 0.2, d: 15 },
    { kind: 'hay', seg: 10, t: 0.85, d: -16 },
    { kind: 'banner', seg: 10, t: 0.05, d: 0, text: 'MOO MEADOW' },
    { kind: 'bigshroom', seg: 11, t: 0.55, d: 30 },
  ],
});
