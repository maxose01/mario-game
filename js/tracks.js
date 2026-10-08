'use strict';
// The three courses. Each is a turtle walk (see track.js) plus everything placed along it.
// Placements use {seg, t} = turtle segment index and fraction along it, d = metres right of
// the centre line (negative = left). Branch placements use {path, u} = fraction along the branch.
// Every course hides one key-locked route: grab the floating key, then drive into the gate.

const TRACK_DEFS = [
  // =========================================================================
  {
    id: 'meadow',
    name: 'Puffball Circuit',
    blurb: 'Rolling clay meadows on a floating island. A gentle start, if you can dodge the Mudlets.',
    music: 'meadow',
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
    branches: [{ id: 'log', name: 'Hollow Log Shortcut', seg: 6, phi: 72, gate: 'auto', hw: 5.5, sh: 2 }],
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
  },
  // =========================================================================
  {
    id: 'sherbet',
    name: 'Sherbet Slopes',
    blurb: 'Climb a frosted peak, ski-jump a crevasse and slide across a frozen lake.',
    music: 'sherbet',
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
    branches: [{ id: 'cave', name: 'Crystal Cave', seg: 6, phi: 74, gate: 'auto', hw: 5.5, sh: 1.8 }],
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
  },
  // =========================================================================
  {
    id: 'magma',
    name: 'Magma Keep',
    blurb: "King Mudlet's castle over a lava sea. Stompers, fire bars and a rainbow for the brave.",
    music: 'magma',
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
      { id: 'rainbow', name: 'Rainbow Bridge', seg: 7, phi: 70, gate: 'auto', hw: 5.5, sh: 1, wallL: false, wallR: false, lift: 2.5 },
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
  },
];

// Colours and moods per world. Shared by the 3D builder and the phone/garage previews.
const THEMES = {
  meadow: {
    sky: ['#ff9fbf', '#ffd3c2', '#c9e9ff'], fog: '#f7dbe2', sun: '#fff2bd',
    hemiSky: '#ffe9f3', hemiGround: '#6b4a7a', sunLight: '#fff1dc',
    road: '#c9b7a8', roadLine: '#fff6ea', curb: ['#ff6f91', '#fff6ea'], shoulder: '#8fd46f',
    grass: '#7fcf6a', grass2: '#62b956', dirt: '#cf9363', rock: '#a66f62', wall: '#5fb04c', wallTop: '#86d16e',
    voidKind: 'clouds', cloud: '#ffffff', cloudShade: '#e8cfe8',
    decor: ['tree', 'tree', 'flower', 'flower', 'bush', 'shroom', 'rock'], ambient: 'pollen',
  },
  snow: {
    sky: ['#7fb8ff', '#c5e2ff', '#f2f8ff'], fog: '#e3efff', sun: '#fffbe2',
    hemiSky: '#eef6ff', hemiGround: '#5a5a8a', sunLight: '#fff8ee',
    road: '#b9b3c9', roadLine: '#ffffff', curb: ['#4f9cf0', '#ffffff'], shoulder: '#f4f8ff',
    grass: '#f2f6ff', grass2: '#dfe9fb', dirt: '#c7d3ea', rock: '#8c8fae', wall: '#ffffff', wallTop: '#ffffff',
    voidKind: 'clouds', cloud: '#ffffff', cloudShade: '#c9d8f0',
    decor: ['pine', 'pine', 'pine', 'snowrock', 'snowbush'], ambient: 'snow',
  },
  lava: {
    sky: ['#2b2257', '#7b4686', '#f2967a'], fog: '#8a4a6e', sun: '#ffe9cf',
    hemiSky: '#ffd9c6', hemiGround: '#3a1a3a', sunLight: '#ffd2b0',
    road: '#8f84a3', roadLine: '#ffd166', curb: ['#ff8a3d', '#3b2a4a'], shoulder: '#6b5f86',
    grass: '#5b4a6e', grass2: '#4a3d5c', dirt: '#6b5168', rock: '#3d2f48', wall: '#9a8fb4', wallTop: '#b9addb',
    voidKind: 'lava', lava: '#ff7a2f', lavaHot: '#ffd166',
    decor: ['crystal', 'basalt', 'basalt', 'brazier'], ambient: 'embers',
  },
};
