'use strict';
// Course: Sherbet Slopes. A pastel sherbet-ice mountain: a banked switchback climb with a
// hairpin, the summit plateau by the ice castle, the course's first glider leap over a crevasse,
// the Glacier Bend (with the Crystal Cave hidden route and its icicles), a ski-jump crevasse and
// a frozen lake where penguins slide about.
// See js/tracks.js for the placement conventions.
//
// The glider chasm (segments 8-10) is a shorter cousin of Mount Wobble's first chasm, tuned in
// the sim: a glider flies the same arc at any speed, arriving ~3.5 above the far deck at the end
// of the gap; keep its heights, lengths, zones and ring height together (tests/sim.js checks
// every chasm's landings and rings).
TRACK_DEFS.push({
  id: 'sherbet',
  name: 'Sherbet Slopes',
  blurb: 'Climb a frosted sherbet peak, glide over the crevasse and skid across a frozen lake full of penguins.',
  music: 'sherbet',
  staff: { 150: 98.3, 200: 86.1 },
  difficulty: 2,
  theme: 'snow',
  hw: 8, sh: 5, wallL: true, wallR: true,
  segments: [
    { s: 90, adj: true },                     // 0 village straight
    { r: 90, rad: 32, bank: 12 },             // 1
    { s: 50, y: 7, adj: true },               // 2 the climb
    { l: 60, rad: 30, y: 12, bank: 14 },      // 3 switchbacks
    { r: 150, rad: 24, y: 20, bank: 20 },     // 4 the hairpin
    { s: 40, y: 24 },                         // 5 summit plateau
    { l: 35, rad: 40, y: 24, wallR: false },  // 6 summit edge
    { r: 35, rad: 40, y: 24, wallR: false },  // 7
    { s: 40, y: 24, wallR: true },            // 8 glider ramp
    { s: 100, y: 16, wallL: false, wallR: false }, // 9 glide over the crevasse
    { s: 80, y: 9, wallL: true, wallR: true }, // 10 landing on the glacier
    { r: 160, rad: 48, y: 3, bank: 8 },       // 11 Glacier Bend (Crystal Cave cuts across)
    { s: 92, y: 0.5 },                        // 12 ski-jump straight
    { l: 60, rad: 36, y: 0 },                 // 13 frozen lake
    { s: 30, adj: true },                     // 14
    { r: 80, rad: 36, bank: 10 },             // 15 final corner
  ],
  branches: [{ id: 'cave', name: 'Crystal Cave', seg: 11, phi: 66, gate: 'auto', style: 'ice', hw: 5.5, sh: 1.8 }],
  rails: [{ seg: 6, t: 0.6, t1: 1, side: 1 }],
  zones: [
    { kind: 'boost', seg: 0, t: 0.55, len: 6, d: 4, w: 4 },
    { kind: 'ice', seg: 1, t: 0.25, len: 22, d: -3, w: 7 },
    { kind: 'boost', seg: 4, t: 0.55, len: 6, d: -3, w: 4 },
    // the glider chasm (see the note at the top)
    { kind: 'boost', seg: 8, t: 0.12, len: 7, d: 0, w: 26 },
    { kind: 'glide', seg: 8, t: 0.5, len: 10, d: 0, w: 30, h: 1.4 },
    { kind: 'gap', seg: 8, t: 0.75, len: 107, d: 0, w: 80 },
    { kind: 'boost', seg: 12, t: 0.34, len: 6, d: 0, w: 16 },
    { kind: 'ramp', seg: 12, t: 0.42, len: 8, d: 0, w: 40, h: 2.2 },
    { kind: 'gap', seg: 12, t: 0.42, ds: 9.5, len: 9, d: 0, w: 40 },
    { kind: 'ice', seg: 13, t: 0, t1: 1, d: 0, w: 40 },
    { kind: 'ice', path: 'cave', u: 0.2, u1: 0.8, d: 0, w: 20 },
    { kind: 'boost', path: 'cave', u: 0.48, len: 7, d: 0, w: 5 },
  ],
  rings: [{ seg: 9, t: 0.4, d: 0, h: 9, r: 4 }],
  boxes: [
    { seg: 1, t: 0.95, d: [-6, -2, 2, 6] },
    { seg: 5, t: 0.3, d: [-5, -1.6, 1.6, 5] },
    { seg: 10, t: 0.6, d: [-6, -2, 2, 6] },
    { seg: 12, t: 0.15, d: [-6, -2, 2, 6] },
    { seg: 14, t: 0.5, d: [-5, 0, 5] },
    { path: 'cave', u: 0.36, d: [-2.2, 2.2] },
  ],
  coins: [
    { seg: 0, t: 0.2, d: -3, n: 6, gap: 3 },
    { seg: 2, t: 0.3, d: 2, n: 5, gap: 3 },
    { seg: 4, t: 0.3, d: -3, n: 6, gap: 3 },
    { seg: 11, t: 0.35, d: 5, n: 6, gap: 3.2 },
    { seg: 13, t: 0.3, d: -4, n: 6, gap: 3, dd: 0.8 },
    { path: 'cave', u: 0.6, d: 0, n: 8, gap: 2.5 },
  ],
  keys: [{ seg: 13, t: 0.55, d: -4.6, h: 1.3 }],
  hazards: [
    { kind: 'snowman', seg: 3, t: 0.5, d: 4.5 },
    { kind: 'roller', seg: 2, t: 0.55, d: 0, range: 10, period: 4.8, r: 2, look: 'snowball' },
    { kind: 'snowman', seg: 5, t: 0.7, d: -4 },
    { kind: 'snowman', seg: 12, t: 0.15, d: -3 },
    { kind: 'snowman', seg: 12, t: 0.8, d: 3.5 },
    { kind: 'penguin', seg: 13, t: 0.3, d: -5.5, range: 7, lat: 1.5, period: 6.5 },
    { kind: 'penguin', seg: 13, t: 0.75, d: 5.5, range: 7, lat: 1.5, period: 7, phase: 0.5 },
    { kind: 'snowman', seg: 15, t: 0.4, d: -1 },
    { kind: 'icicle', path: 'cave', u: 0.3, d: 1.5, period: 3.2 },
    { kind: 'icicle', path: 'cave', u: 0.7, d: -1.5, period: 3.2, phase: 0.5 },
  ],
  landmarks: [
    { kind: 'gantry', seg: 0, t: 0 },
    { kind: 'igloo', seg: 0, t: 0.4, d: -24 },
    { kind: 'igloo', seg: 0, t: 0.75, d: 26 },
    { kind: 'rink', seg: 0, t: 0.55, d: -48 },
    { kind: 'scoops', seg: 2, t: 0.5, d: 34 },
    { kind: 'arch', seg: 3, t: 0.1, look: 'ice' },
    { kind: 'icecastle', seg: 5, t: 0.5, d: -40 },
    { kind: 'flag', seg: 5, t: 0.5, d: 12 },
    { kind: 'banner', seg: 8, t: 0.02, d: 0, text: 'GLIDE!' },
    { kind: 'cave', path: 'cave' },
    { kind: 'scoops', seg: 11, t: 0.5, d: 70 },
    { kind: 'lake', seg: 13, t: 0.5, d: 34, r: 14, color: '#bfe6ff' },
    { kind: 'bigsnowman', seg: 14, t: 0.5, d: 28 },
    { kind: 'scoops', seg: 15, t: 0.5, d: -40 },
  ],
});
