'use strict';
// Course: Mount Wobble. A point-to-point descent from the summit to a log cabin in the valley,
// in three sections:
//   Summit Drop  - the cargo-plane drop onto an ice shelf, banked sweepers, a snowball gully, a
//                  hairpin over the valley, a cliff ledge, then the ice cave with an anti-gravity
//                  spiral (bumpers, falling icicles) and a glider leap over the crevasse.
//   Wobble Dam   - the reservoir, across the top of the dam, an anti-gravity water chute that
//                  doubles back down along the foot of the dam and its waterfalls, a fork through the pine woods (the Woodcutter Trail) and a log
//                  bridge over the gorge.
//   Ski Run      - an open slope with slalom gates, skiers and the ski lift, then the bobsleigh
//                  run (a narrow ice channel of steeply banked curves past cheering grandstands),
//                  moguls and a giant anti-gravity ski jump: glide through the boost rings down
//                  to the cabin.
// See js/tracks.js for the placement conventions.
//
// The two glider chasms (segments 12-14 and 43-45) were tuned with the sim: a glider flies the
// same arc at any speed, so keep each chasm's relative heights, lengths, zones and ring heights
// together (tests/sim.js checks landings and rings at 50, 150 and 200cc).
TRACK_DEFS.push({
  id: 'mount',
  name: 'Mount Wobble',
  blurb: 'Drop from a cargo plane onto the summit and race all the way down: ice cave, dam, pine woods, a bobsleigh run and a giant ski jump.',
  staff: { 150: 139.7, 200: 119.0 },
  difficulty: 4,
  music: 'mount1',
  theme: 'alpine',
  p2p: true,
  planeDrop: true,
  startAt: 40,
  runout: 55,
  y: 340,
  hw: 8.5, sh: 4, wallL: true, wallR: true,
  style: 'snow',
  sections: [
    { name: 'Summit Drop', music: 'mount1' },
    { name: 'Wobble Dam', music: 'mount2', seg: 14, t: 0 },
    { name: 'Ski Run', music: 'mount3', seg: 27, t: 0 },
  ],
  segments: [
    // ---- section 1: Summit Drop ----
    { s: 120, hw: 9.5 },                                         // 0 the ice shelf
    { r: 60, rad: 60, y: 334, bank: 10 },                        // 1
    { s: 60, y: 328, hw: 8.5 },                                  // 2
    { l: 90, rad: 45, y: 318, bank: 14 },                        // 3
    { s: 80, y: 308 },                                           // 4 snowball gully
    { r: 160, rad: 42, y: 292, bank: 22 },                       // 5 summit hairpin
    { s: 60, y: 286, wallL: false },                             // 6 cliff ledge
    { l: 70, rad: 50, y: 278, wallL: false },                    // 7
    { s: 50, y: 272, style: 'ice', wallL: true },                // 8 into the ice cave
    { r: 200, rad: 30, y: 256, bank: 55, antigrav: true, style: 'metal', hw: 9 }, // 9 anti-gravity spiral
    { l: 100, rad: 36, y: 250, bank: 40, antigrav: true, style: 'metal' },        // 10
    { s: 50, y: 248, style: 'ice', hw: 8.5 },                    // 11 cave exit
    { s: 40, y: 248 },                                           // 12 glider ramp
    { s: 150, y: 231, wallL: false, wallR: false },              // 13 glide over the crevasse
    // ---- section 2: Wobble Dam & Pine Woods ----
    { s: 80, y: 224, wallL: true, wallR: true },                 // 14 landing by the reservoir
    { l: 150, rad: 50, y: 206 },                                 // 15 (Frozen Falls cuts across)
    { s: 150, y: 204, style: 'stone' },                          // 16 across the dam
    { r: 180, rad: 42, y: 188, bank: 38, antigrav: true, style: 'water' }, // 17 spillway chute: down and back
    { r: 35, rad: 90, y: 182, bank: 22, antigrav: true, style: 'water' },  // 18 along the foot of the dam
    { l: 35, rad: 90, y: 177, bank: 22, antigrav: true, style: 'water' },  // 19
    { l: 110, rad: 36, y: 168, bank: 38, antigrav: true, style: 'water' }, // 20 and away
    { s: 70, y: 162, style: 'water' },                           // 21 chute run-out
    { l: 70, rad: 60, y: 154 },                                  // 22 into the woods
    { s: 280, y: 132 },                                          // 23 pine woods (the fork)
    { r: 80, rad: 55, y: 124 },                                  // 24
    { s: 110, y: 120, wallL: false, wallR: false, style: 'wood', hw: 7.5 }, // 25 log bridge
    { l: 80, rad: 55, y: 114, hw: 8.5, wallL: true, wallR: true }, // 26
    // ---- section 3: Ski Run ----
    { s: 80, y: 104, hw: 14, sh: 5 },                            // 27 the slope opens up
    { r: 60, rad: 90, y: 92, hw: 16 },                           // 28 slalom
    { l: 70, rad: 90, y: 78 },                                   // 29
    { r: 50, rad: 90, y: 70 },                                   // 30
    { l: 40, rad: 100, y: 66 },                                  // 31 last slalom bend
    // the bobsleigh run: a narrow ice channel, steeply banked into every curve
    { s: 60, y: 62, hw: 7.5, sh: 2.5, style: 'ice' },            // 32 the start house
    { r: 75, rad: 44, y: 57, bank: 32, style: 'ice' },           // 33
    { s: 60, y: 51, style: 'ice' },                              // 34
    { l: 165, rad: 36, y: 42, bank: 45, style: 'ice' },          // 35 the Horseshoe
    { s: 60, y: 36, style: 'ice' },                              // 36
    { r: 120, rad: 38, y: 30, bank: 40, style: 'ice' },          // 37
    { s: 30, y: 28, style: 'ice' },                              // 38
    { l: 70, rad: 46, y: 25, bank: 32, style: 'ice' },           // 39
    { r: 40, rad: 70, y: 23, bank: 20, style: 'ice' },           // 40
    { s: 70, y: 21, hw: 12, sh: 5 },                             // 41 out through the finish arch
    { s: 110, y: 19, hw: 12 },                                   // 42 moguls
    { s: 30, y: 17, hw: 11, antigrav: true, style: 'metal' },    // 43 the big anti-gravity ski jump
    { s: 170, y: -4, wallL: false, wallR: false },               // 44 glide with boost rings
    { s: 80, y: -11, wallL: true, wallR: true },                 // 45 landing
    { r: 60, rad: 40, y: -17, hw: 9 },                           // 46
    { l: 50, rad: 60, y: -23 },                                  // 47 by the frozen pond
    { s: 170, y: -29 },                                          // 48 cabin finish straight
  ],
  branches: [
    { id: 'icefall', name: 'Frozen Falls', seg: 15, phi: 60, gate: 'auto', style: 'ice', hw: 5.5, sh: 1.8 },
    {
      id: 'woods', name: 'Woodcutter Trail', from: [22, 0.06], to: [22, 0.94],
      pts: [[0, 0], [0.14, 18], [0.3, 40], [0.5, 50], [0.7, 40], [0.86, 18], [1, 0]], style: 'dirt', hw: 6, sh: 2.5,
    },
  ],
  rails: [
    { seg: 6, t: 0, t1: 0.5, side: -1 },
    { seg: 25, t: 0, t1: 1, side: 0 },
  ],
  zones: [
    { kind: 'boost', seg: 0, t: 0.75, len: 6, d: -4, w: 4 },
    { kind: 'boost', seg: 4, t: 0.12, len: 6, d: 4, w: 4 },
    { kind: 'ice', seg: 8, t: 0, t1: 1, d: 0, w: 30 },
    { kind: 'ice', seg: 11, t: 0, t1: 0.7, d: 0, w: 30 },
    { kind: 'boost', seg: 11, t: 0.8, len: 6, d: 0, w: 5 },
    // first glider chasm (see the note at the top)
    { kind: 'boost', seg: 12, t: 0.12, len: 7, d: 0, w: 26 },
    { kind: 'glide', seg: 12, t: 0.5, len: 10, d: 0, w: 30, h: 1.4 },
    { kind: 'gap', seg: 12, t: 0.75, len: 155, d: 0, w: 80 },
    { kind: 'boost', seg: 16, t: 0.5, len: 6, d: 3.5, w: 4 },
    { kind: 'current', seg: 17, t: 0, t1: 1, d: 0, w: 40, flow: 9 },
    { kind: 'current', seg: 18, t: 0, t1: 1, d: 0, w: 40, flow: 9 },
    { kind: 'current', seg: 19, t: 0, t1: 1, d: 0, w: 40, flow: 9 },
    { kind: 'current', seg: 20, t: 0, t1: 1, d: 0, w: 40, flow: 9 },
    { kind: 'current', seg: 21, t: 0, t1: 0.8, d: 0, w: 40, flow: 7 },
    { kind: 'shallow', seg: 21, t: 0, t1: 0.8, d: -6, w: 5 },
    { kind: 'boost', seg: 24, t: 0.5, len: 6, d: -3.5, w: 4 },
    { kind: 'boost', seg: 29, t: 0.5, len: 6, d: 0, w: 5 },
    { kind: 'hump', seg: 27, t: 0.55, len: 8, d: -6, w: 12, h: 1 },
    // the bobsleigh run: a push-off pad in the start house, glassy ice on the straights
    { kind: 'boost', seg: 32, t: 0.55, len: 6, d: 0, w: 6 },
    { kind: 'ice', seg: 34, t: 0, t1: 1, d: 0, w: 30 },
    { kind: 'ice', seg: 36, t: 0, t1: 1, d: 0, w: 30 },
    { kind: 'boost', seg: 36, t: 0.5, len: 6, d: 2.5, w: 4 },
    { kind: 'ice', seg: 38, t: 0, t1: 1, d: 0, w: 30 },
    { kind: 'hump', seg: 42, t: 0.15, len: 8, d: 0, w: 30, h: 1.1 },
    { kind: 'hump', seg: 42, t: 0.35, len: 8, d: 0, w: 30, h: 1.3 },
    { kind: 'hump', seg: 42, t: 0.55, len: 8, d: 0, w: 30, h: 1.1 },
    // second glider chasm: the giant ski jump (see the note at the top)
    { kind: 'boost', seg: 43, t: 0.1, len: 6, d: 0, w: 32 },
    { kind: 'glide', seg: 43, t: 0.4, len: 10, d: 0, w: 30, h: 2 },
    { kind: 'gap', seg: 43, t: 0.75, len: 168, d: 0, w: 80 },
    { kind: 'boost', seg: 48, t: 0.25, len: 6, d: 3.5, w: 4 },
    { kind: 'boost', path: 'woods', u: 0.3, len: 6, d: 0, w: 5 },
    { kind: 'boost', path: 'woods', u: 0.66, len: 6, d: 0, w: 5 },
    { kind: 'ice', path: 'icefall', u: 0.2, u1: 0.8, d: 0, w: 20 },
    { kind: 'boost', path: 'icefall', u: 0.5, len: 6, d: 0, w: 5 },
  ],
  rings: [
    { seg: 13, t: 0.4, d: 0, h: 9, r: 4 },
    { seg: 44, t: 0.2, d: 0, h: 8.4, r: 4 },
    { seg: 44, t: 0.45, d: 0, h: 7.9, r: 4 },
    { seg: 44, t: 0.7, d: 0, h: 7.8, r: 4 },
  ],
  boxes: [
    { seg: 0, t: 0.62, d: [-6.5, -2.2, 2.2, 6.5] },
    { seg: 4, t: 0.02, d: [-5.5, -1.8, 1.8, 5.5] },
    { seg: 8, t: 0.15, d: [-5.5, -1.8, 1.8, 5.5] },
    { seg: 14, t: 0.75, d: [-6, -2, 2, 6] },
    { seg: 16, t: 0.08, d: [-6, -2, 2, 6] },
    { seg: 22, t: 0.35, d: [-6, -2, 2, 6] },
    { seg: 27, t: 0.35, d: [-10, -5, 0, 5, 10] },
    { seg: 34, t: 0.5, d: [-4.5, -1.5, 1.5, 4.5] },
    { seg: 45, t: 0.6, d: [-6, -2, 2, 6] },
    { path: 'icefall', u: 0.4, d: [-2.2, 2.2] },
    { path: 'woods', u: 0.5, d: [-2.2, 2.2] },
  ],
  coins: [
    { seg: 1, t: 0.3, d: 3, n: 6, gap: 3 },
    { seg: 5, t: 0.35, d: -3, n: 7, gap: 3, dd: 0.3 },
    { seg: 9, t: 0.3, d: -3, n: 8, gap: 3 },
    { seg: 16, t: 0.2, d: -3, n: 6, gap: 3 },
    { seg: 18, t: 0.3, d: 2, n: 6, gap: 3 },
    { seg: 23, t: 0.3, d: -3, n: 6, gap: 3 },
    { seg: 28, t: 0.2, d: 6, n: 6, gap: 3 },
    // high on the Horseshoe's banking, the fast line
    { seg: 35, t: 0.3, d: 3.5, n: 8, gap: 3 },
    { seg: 37, t: 0.35, d: -3, n: 6, gap: 3 },
    { seg: 42, t: 0.1, d: 0, n: 8, gap: 3 },
    { seg: 46, t: 0.3, d: -2, n: 6, gap: 3 },
    { path: 'icefall', u: 0.6, d: 0, n: 8, gap: 2.5 },
    { path: 'woods', u: 0.12, d: 0, n: 8, gap: 3 },
  ],
  keys: [{ seg: 14, t: 0.5, d: 4, h: 1.3 }],
  hazards: [
    // Summit Drop
    { kind: 'penguin', seg: 3, t: 0.55, d: 3, range: 9, period: 6 },
    { kind: 'roller', seg: 4, t: 0.35, d: 0, range: 13, period: 4.2, r: 2.2, look: 'snowball' },
    { kind: 'roller', seg: 4, t: 0.8, d: 0, range: 13, period: 3.7, phase: 0.5, r: 2.2, look: 'snowball' },
    { kind: 'icicle', seg: 8, t: 0.5, d: -3, period: 3.4, phase: 0 },
    { kind: 'bumper', seg: 9, t: 0.25, d: -4 },
    { kind: 'bumper', seg: 9, t: 0.5, d: 4 },
    { kind: 'bumper', seg: 9, t: 0.75, d: -3 },
    { kind: 'bumper', seg: 10, t: 0.5, d: 3 },
    { kind: 'icicle', seg: 11, t: 0.3, d: 3, period: 3.4, phase: 0.5 },
    { kind: 'icicle', seg: 11, t: 0.62, d: -2.5, period: 3.1, phase: 0.2 },
    // Wobble Dam & Pine Woods
    { kind: 'penguin', seg: 16, t: 0.3, d: -3, range: 18, period: 5 },
    { kind: 'penguin', seg: 16, t: 0.72, d: 3, range: 15, period: 6, phase: 0.5 },
    { kind: 'geyser', seg: 21, t: 0.3, d: 4, period: 4, look: 'water' },
    { kind: 'geyser', seg: 21, t: 0.72, d: -3, period: 4, phase: 0.5, look: 'water' },
    { kind: 'roller', seg: 23, t: 0.3, d: 0, range: 13, period: 3.6, r: 2.4, look: 'snowball' },
    { kind: 'roller', seg: 23, t: 0.58, d: 0, range: 13, period: 4.4, phase: 0.3, r: 2.4, look: 'snowball' },
    { kind: 'roller', seg: 23, t: 0.84, d: 0, range: 13, period: 3.9, phase: 0.6, r: 2.4, look: 'snowball' },
    { kind: 'mole', path: 'woods', u: 0.42, d: -1.5, period: 3.2 },
    { kind: 'mole', path: 'woods', u: 0.56, d: 1.5, period: 3.2, phase: 0.5 },
    // Ski Run
    { kind: 'skier', seg: 27, t: 0.75, d: 0, range: 12, period: 5 },
    { kind: 'skier', seg: 28, t: 0.5, d: 0, range: 14, period: 5.5 },
    { kind: 'skier', seg: 29, t: 0.45, d: 0, range: 14, period: 4.8, phase: 0.4 },
    { kind: 'skier', seg: 30, t: 0.55, d: 0, range: 14, period: 5.2, phase: 0.7 },
    { kind: 'pole', seg: 28, t: 0.15, d: -6 },
    { kind: 'pole', seg: 28, t: 0.4, d: 6 },
    { kind: 'pole', seg: 28, t: 0.7, d: -6 },
    { kind: 'pole', seg: 29, t: 0.1, d: 6 },
    { kind: 'pole', seg: 29, t: 0.35, d: -6 },
    { kind: 'pole', seg: 29, t: 0.65, d: 6 },
    { kind: 'pole', seg: 29, t: 0.9, d: -6 },
    { kind: 'pole', seg: 30, t: 0.3, d: 6 },
    { kind: 'pole', seg: 30, t: 0.75, d: -6 },
    // the bobsleigh run: icicles off the start house roof, a penguin tobogganing out of the
    // channel past the finish arch
    { kind: 'icicle', seg: 32, t: 0.4, d: 2.5, period: 3.3, phase: 0.3 },
    { kind: 'penguin', seg: 41, t: 0.3, d: 0, range: 8, period: 5 },
  ],
  landmarks: [
    { kind: 'gantry', seg: 0, t: 0 },
    { kind: 'summit', seg: 0, t: 0.15, d: -22 },
    { kind: 'banner', seg: 1, t: 0.6, d: 0 },
    { kind: 'pines', seg: 2, t: 0.5, d: 30, r: 16, n: 12 },
    { kind: 'pines', seg: 5, t: 0.5, d: -40, r: 20, n: 16 },
    { kind: 'tunnel', seg: 8, t: 0.2, seg1: 11, t1: 0.7, look: 'ice' },
    { kind: 'arch', seg: 14, t: 0.05, look: 'ice' },
    { kind: 'lake', seg: 16, t: 0.45, d: -46, r: 36 },
    { kind: 'dam', seg: 16, t: 0, seg1: 16, t1: 1, side: 1 },
    // the canyon at the foot of the dam, between its face and the chute below
    { kind: 'gorge', seg: 16, t: 0.05, d: 31.0, r: 13, y: 174 },
    { kind: 'gorge', seg: 16, t: 0.15, d: 30.1, r: 13, y: 174 },
    { kind: 'gorge', seg: 16, t: 0.25, d: 29.6, r: 13, y: 174 },
    { kind: 'gorge', seg: 16, t: 0.35, d: 29.5, r: 13, y: 174 },
    { kind: 'gorge', seg: 16, t: 0.45, d: 30.0, r: 13, y: 174 },
    { kind: 'gorge', seg: 16, t: 0.55, d: 30.9, r: 13, y: 174 },
    { kind: 'gorge', seg: 16, t: 0.65, d: 32.1, r: 13, y: 174 },
    { kind: 'gorge', seg: 16, t: 0.75, d: 33.6, r: 13, y: 174 },
    { kind: 'gorge', seg: 16, t: 0.85, d: 34.8, r: 13, y: 174 },
    { kind: 'arch', seg: 22, t: 0.85, look: 'wood' },
    { kind: 'pines', seg: 23, t: 0.3, d: -24, r: 18, n: 18 },
    { kind: 'pines', seg: 23, t: 0.7, d: -26, r: 18, n: 18 },
    { kind: 'pines', path: 'woods', u: 0.5, d: 16, r: 14, n: 12 },
    { kind: 'bridge', seg: 25, t: 0, seg1: 26, t1: 0, look: 'wood' },
    { kind: 'lodge', seg: 27, t: 0.25, d: -34 },
    { kind: 'skilift', seg: 27, t: 0.1, seg1: 31, t1: 0.8, d: 30 },
    // the bobsleigh run
    { kind: 'banner', seg: 31, t: 0.85, d: 0, text: 'BOB RUN' },
    { kind: 'tunnel', seg: 32, t: 0.2, seg1: 32, t1: 0.8, look: 'wood' },
    { kind: 'grandstand', seg: 35, t: 0.45, d: 1, len: 26 },
    { kind: 'grandstand', seg: 37, t: 0.5, d: -1, len: 24 },
    { kind: 'flag', seg: 33, t: 0.5, d: -14 },
    { kind: 'flag', seg: 36, t: 0.5, d: 14 },
    { kind: 'flag', seg: 39, t: 0.5, d: 15 },
    { kind: 'pines', seg: 34, t: 0.5, d: -30, r: 16, n: 12 },
    { kind: 'pines', seg: 38, t: 0.5, d: 30, r: 16, n: 10 },
    { kind: 'arch', seg: 41, t: 0.3, look: 'ice' },
    { kind: 'banner', seg: 42, t: 0.05, d: 0, text: 'SKI JUMP' },
    { kind: 'bigsnowman', seg: 46, t: 0.5, d: 26 },
    { kind: 'lake', seg: 47, t: 0.5, d: -30, r: 18 },
    { kind: 'cabin', seg: 48, t: 0.72, d: 22 },
  ],
});
