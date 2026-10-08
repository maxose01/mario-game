'use strict';
// Course: see js/tracks.js for the placement conventions.
TRACK_DEFS.push({
  id: 'sherbet',
  name: 'Sherbet Slopes',
  blurb: 'Climb a frosted peak, ski-jump a crevasse and slide across a frozen lake.',
  music: 'sherbet',
  difficulty: 2,
  theme: 'snow',
  hw: 8, sh: 5, wallL: true, wallR: true,
  segments: [
    { s: 86 },                                // 0 village straight
    { r: 90, rad: 32 },                       // 1
    { s: 54, y: 6 },                          // 2 the climb
    { r: 60, rad: 36, y: 10 },                // 3
    { s: 34, y: 12.5 },                       // 4 summit
    { l: 70, rad: 28, y: 12.5, wallR: false }, // 5 summit edge
    { r: 160, rad: 60, y: 6 },                // 6 Glacier Bend (hidden route cuts across)
    { s: 92, y: 0.5 },                        // 7 ski jump straight
    { r: 70, rad: 42, y: 0 },                 // 8 frozen lake
    { l: 40, rad: 36 },                       // 9
    { r: 90, rad: 32 },                       // 10
  ],
  branches: [{ id: 'cave', name: 'Crystal Cave', seg: 6, phi: 74, gate: 'auto', style: 'ice', hw: 5.5, sh: 1.8 }],
  zones: [
    { kind: 'boost', seg: 0, t: 0.55, len: 6, d: 4, w: 4 },
    { kind: 'ice', seg: 1, t: 0.25, len: 22, d: -3, w: 7 },
    { kind: 'boost', seg: 7, t: 0.36, len: 5, d: 0, w: 6 },
    { kind: 'ramp', seg: 7, t: 0.42, len: 8, d: 0, w: 40, h: 2.2 },
    { kind: 'gap', seg: 7, t: 0.42, ds: 9.5, len: 9, d: 0, w: 40 },
    { kind: 'ice', seg: 8, t: 0, t1: 1, d: 0, w: 40 },
    { kind: 'ice', path: 'cave', u: 0.2, u1: 0.8, d: 0, w: 20 },
    { kind: 'boost', path: 'cave', u: 0.48, len: 7, d: 0, w: 5 },
  ],
  boxes: [
    { seg: 1, t: 0.95, d: [-6, -2, 2, 6] },
    { seg: 4, t: 0.3, d: [-5, -1.6, 1.6, 5] },
    { seg: 7, t: 0.2, d: [-6, -2, 2, 6] },
    { seg: 9, t: 0.5, d: [-5, 0, 5] },
    { path: 'cave', u: 0.36, d: [-2.2, 2.2] },
  ],
  coins: [
    { seg: 0, t: 0.2, d: -3, n: 6, gap: 3 },
    { seg: 2, t: 0.3, d: 2, n: 5, gap: 3 },
    { seg: 6, t: 0.35, d: 5, n: 6, gap: 3.2 },
    { seg: 8, t: 0.3, d: -4, n: 6, gap: 3, dd: 0.8 },
    { path: 'cave', u: 0.6, d: 0, n: 8, gap: 2.5 },
  ],
  keys: [{ seg: 8, t: 0.55, d: -4.6, h: 1.3 }],
  hazards: [
    { kind: 'snowman', seg: 7, t: 0.15, d: -3 },
    { kind: 'snowman', seg: 7, t: 0.8, d: 3.5 },
    { kind: 'snowman', seg: 10, t: 0.4, d: -1 },
    { kind: 'snowman', seg: 2, t: 0.6, d: 4 },
  ],
  landmarks: [
    { kind: 'gantry', seg: 0, t: 0 },
    { kind: 'igloo', seg: 0, t: 0.4, d: -24 },
    { kind: 'igloo', seg: 0, t: 0.75, d: 26 },
    { kind: 'icecastle', seg: 4, t: 0.5, d: -40 },
    { kind: 'cave', path: 'cave' },
    { kind: 'flag', seg: 4, t: 0.5, d: 12 },
    { kind: 'bigsnowman', seg: 9, t: 0.5, d: 28 },
  ],
});
