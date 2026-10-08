'use strict';
// Course: see js/tracks.js for the placement conventions.
TRACK_DEFS.push({
  id: 'meadow',
  name: 'Puffball Circuit',
  blurb: 'Rolling clay meadows on a floating island. A gentle start, if you can dodge the Mudlets.',
  music: 'meadow',
  difficulty: 1,
  theme: 'meadow',
  hw: 8.5, sh: 5, wallL: true, wallR: true,
  segments: [
    { s: 92 },                                // 0 start straight
    { r: 100, rad: 30 },                      // 1 turn one
    { s: 52, y: 3.5, wallL: false, wallR: false }, // 2 cloud bridge
    { l: 45, rad: 34, y: 5 },                 // 3 the S
    { r: 45, rad: 34, y: 5 },                 // 4
    { s: 40, y: 5 },                          // 5 windmill hill
    { r: 150, rad: 70, y: 1 },                // 6 Pond Sweeper (hidden route cuts across)
    { s: 74, y: 0 },                          // 7 jump straight
    { l: 50, rad: 32, wallR: false },         // 8 island edge
    { r: 160, rad: 34 },                      // 9 final corner
  ],
  branches: [{ id: 'log', name: 'Hollow Log Shortcut', seg: 6, phi: 72, gate: 'auto', style: 'wood', hw: 5.5, sh: 2 }],
  zones: [
    { kind: 'boost', seg: 0, t: 0.62, len: 6, d: -4, w: 4 },
    { kind: 'boost', seg: 5, t: 0.45, len: 6, d: 3.5, w: 4 },
    { kind: 'ramp', seg: 7, t: 0.3, len: 7, d: 0, w: 9, h: 1.7 },
    { kind: 'boost', path: 'log', u: 0.55, len: 7, d: 0, w: 5 },
    { kind: 'mud', seg: 9, t: 0.35, len: 16, d: 9.5, w: 5 },
  ],
  boxes: [
    { seg: 1, t: 0.95, d: [-6, -2, 2, 6] },
    { seg: 5, t: 0.15, d: [-5.5, -1.8, 1.8, 5.5] },
    { seg: 7, t: 0.75, d: [-6, -2, 2, 6] },
    { path: 'log', u: 0.42, d: [-2.2, 2.2] },
  ],
  coins: [
    { seg: 0, t: 0.25, d: 3, n: 6, gap: 3 },
    { seg: 3, t: 0.4, d: -3, n: 5, gap: 3, dd: 1 },
    { seg: 6, t: 0.4, d: 6, n: 6, gap: 3.2 },
    { seg: 8, t: 0.2, d: 0, n: 5, gap: 3 },
    { path: 'log', u: 0.62, d: 0, n: 8, gap: 2.5 },
  ],
  keys: [{ seg: 7, t: 0.3, ds: 13.5, d: 0, h: 2.7 }],
  hazards: [
    { kind: 'walker', seg: 8, t: 0.45, d: 0, range: 7, speed: 2.4 },
    { kind: 'walker', seg: 9, t: 0.2, d: -2, range: 6, speed: 2 },
    { kind: 'walker', seg: 9, t: 0.6, d: 1, range: 7, speed: 2.6 },
  ],
  landmarks: [
    { kind: 'gantry', seg: 0, t: 0 },
    { kind: 'windmill', seg: 5, t: 0.5, d: -26 },
    { kind: 'windmill', seg: 0, t: 0.45, d: 34 },
    { kind: 'bigshroom', seg: 1, t: 0.5, d: 26 },
    { kind: 'bigshroom', seg: 9, t: 0.55, d: 30 },
    { kind: 'pond', seg: 6, t: 0.5, d: 74, r: 16 },
    { kind: 'log', path: 'log' },
    { kind: 'balloon', seg: 7, t: 0.6, d: -40, h: 22 },
  ],
});
