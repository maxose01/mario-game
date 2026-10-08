'use strict';
// Course: Mount Wobble. A point-to-point descent from the summit to a log cabin in the valley,
// in three sections: Summit Drop (cargo-plane drop, ice cave with an anti-gravity spiral, a glider
// leap over the crevasse), Wobble Dam & Pine Woods (anti-gravity water streams down the
// spillway, a fork through the forest) and the Ski Run (moguls, slalom, a giant ski jump with
// boost rings and a glide down to the cabin). See js/tracks.js for the placement conventions.
// DRAFT layout: exercises every course feature; tuned by the course designer.
TRACK_DEFS.push({
  id: 'mount',
  name: 'Mount Wobble',
  blurb: 'Drop from a cargo plane onto the summit and race all the way down to the cabin: ice cave, dam, pine woods and a giant ski jump.',
  difficulty: 4,
  music: 'mount1',
  theme: 'alpine',
  p2p: true,
  planeDrop: true,
  startAt: 40,
  runout: 55,
  y: 300,
  hw: 8.5, sh: 4, wallL: true, wallR: true,
  style: 'snow',
  sections: [
    { name: 'Summit Drop', music: 'mount1' },
    { name: 'Wobble Dam', music: 'mount2', seg: 9, t: 0 },
    { name: 'Ski Run', music: 'mount3', seg: 18, t: 0 },
  ],
  segments: [
    // ---- section 1: Summit Drop ----
    { s: 110 },                                                  // 0 ice shelf start
    { r: 70, rad: 50, y: 292, bank: 12 },                        // 1
    { s: 70, y: 282 },                                           // 2 snowball gully
    { l: 110, rad: 38, y: 272, bank: 16 },                       // 3
    { s: 50, y: 266, style: 'ice' },                             // 4 into the ice cave
    { r: 200, rad: 30, y: 248, bank: 55, antigrav: true, style: 'metal', hw: 9 }, // 5 anti-gravity spiral
    { s: 50, y: 244, style: 'ice', hw: 8.5 },                    // 6 cave exit
    { s: 40, y: 244 },                                           // 7 glider ramp
    { s: 150, y: 227, wallL: false, wallR: false },              // 8 glide over the crevasse
    // ---- section 2: Wobble Dam & Pine Woods ----
    { s: 80, y: 220, wallL: true, wallR: true },                 // 9 landing by the reservoir
    { l: 150, rad: 50, y: 202 },                                 // 10 (hidden route cuts across)
    { s: 120, y: 200, style: 'stone' },                          // 11 across the dam
    { r: 100, rad: 36, y: 190, bank: 38, antigrav: true, style: 'water' }, // 12 spillway stream
    { l: 120, rad: 36, y: 178, bank: 38, antigrav: true, style: 'water' }, // 13
    { s: 70, y: 170, style: 'water' },                           // 14 stream run-out
    { r: 60, rad: 60, y: 160 },                                  // 15 into the woods
    { s: 160, y: 136 },                                          // 16 pine woods (fork)
    { l: 70, rad: 50, y: 126 },                                  // 17
    // ---- section 3: Ski Run ----
    { s: 80, y: 114, hw: 14, sh: 5 },                            // 18 the slope opens up
    { r: 50, rad: 80, y: 98, hw: 16 },                           // 19 slalom
    { l: 60, rad: 80, y: 80, hw: 16 },                           // 20
    { s: 90, y: 64, hw: 12 },                                    // 21 moguls
    { s: 30, y: 62, hw: 11 },                                    // 22 the big ski jump
    { s: 170, y: 41, wallL: false, wallR: false },               // 23 glide with boost rings
    { s: 80, y: 34, wallL: true, wallR: true },                  // 24 landing
    { r: 60, rad: 40, y: 24, hw: 9 },                            // 25
    { s: 130, y: 16 },                                           // 26 cabin finish straight
  ],
  branches: [
    { id: 'icefall', name: 'Frozen Falls', seg: 10, phi: 60, gate: 'auto', style: 'ice', hw: 5.5, sh: 1.8 },
    { id: 'woods', name: 'Woodcutter Trail', from: [16, 0.08], to: [16, 0.92], pts: [[0, 0], [0.22, -15], [0.5, -24], [0.78, -15], [1, 0]], style: 'dirt', hw: 6, sh: 2.5 },
  ],
  zones: [
    { kind: 'boost', seg: 0, t: 0.75, len: 6, d: -4, w: 4 },
    { kind: 'ice', seg: 4, t: 0, t1: 1, d: 0, w: 30 },
    { kind: 'ice', seg: 6, t: 0, t1: 0.7, d: 0, w: 30 },
    { kind: 'boost', seg: 6, t: 0.8, len: 6, d: 0, w: 5 },
    // glider chasms: a glider flies the same arc at any speed, so the far side (seg 8 / 23 end
    // heights) sits just under where that arc arrives and the rings sit on it; the full-width
    // pad launches everyone boosted (tests/sim.js checks landings and rings)
    { kind: 'boost', seg: 7, t: 0.12, len: 7, d: 0, w: 26 },
    { kind: 'glide', seg: 7, t: 0.5, len: 10, d: 0, w: 30, h: 1.4 },
    { kind: 'gap', seg: 7, t: 0.75, len: 155, d: 0, w: 80 },
    { kind: 'boost', seg: 11, t: 0.5, len: 6, d: 3.5, w: 4 },
    { kind: 'current', seg: 12, t: 0, t1: 1, d: 0, w: 40, flow: 9 },
    { kind: 'current', seg: 13, t: 0, t1: 1, d: 0, w: 40, flow: 9 },
    { kind: 'current', seg: 14, t: 0, t1: 0.8, d: 0, w: 40, flow: 7 },
    { kind: 'shallow', seg: 14, t: 0, t1: 0.8, d: -6, w: 5 },
    { kind: 'hump', seg: 21, t: 0.15, len: 8, d: 0, w: 30, h: 1.1 },
    { kind: 'hump', seg: 21, t: 0.35, len: 8, d: 0, w: 30, h: 1.3 },
    { kind: 'hump', seg: 21, t: 0.55, len: 8, d: 0, w: 30, h: 1.1 },
    { kind: 'boost', seg: 22, t: 0.1, len: 6, d: 0, w: 32 },
    { kind: 'glide', seg: 22, t: 0.4, len: 10, d: 0, w: 30, h: 2 },
    { kind: 'gap', seg: 22, t: 0.75, len: 168, d: 0, w: 80 },
    { kind: 'boost', path: 'woods', u: 0.5, len: 6, d: 0, w: 5 },
    { kind: 'ice', path: 'icefall', u: 0.2, u1: 0.8, d: 0, w: 20 },
    { kind: 'boost', path: 'icefall', u: 0.5, len: 6, d: 0, w: 5 },
  ],
  rings: [
    { seg: 23, t: 0.2, d: 0, h: 8.4, r: 4 },
    { seg: 23, t: 0.45, d: 0, h: 7.9, r: 4 },
    { seg: 23, t: 0.7, d: 0, h: 7.8, r: 4 },
    { seg: 8, t: 0.4, d: 0, h: 9, r: 4 },
  ],
  boxes: [
    { seg: 0, t: 0.62, d: [-6, -2, 2, 6] },
    { seg: 2, t: 0.6, d: [-5.5, -1.8, 1.8, 5.5] },
    { seg: 9, t: 0.8, d: [-6, -2, 2, 6] },
    { seg: 15, t: 0.4, d: [-6, -2, 2, 6] },
    { seg: 18, t: 0.5, d: [-10, -5, 0, 5, 10] },
    { seg: 24, t: 0.6, d: [-6, -2, 2, 6] },
    { path: 'icefall', u: 0.4, d: [-2.2, 2.2] },
  ],
  coins: [
    { seg: 1, t: 0.3, d: 3, n: 6, gap: 3 },
    { seg: 5, t: 0.3, d: -3, n: 8, gap: 3 },
    { seg: 11, t: 0.2, d: -3, n: 6, gap: 3 },
    { seg: 16, t: 0.3, d: 3, n: 6, gap: 3 },
    { seg: 21, t: 0.1, d: 0, n: 8, gap: 3 },
    { path: 'icefall', u: 0.6, d: 0, n: 8, gap: 2.5 },
    { path: 'woods', u: 0.3, d: 0, n: 8, gap: 3 },
  ],
  keys: [{ seg: 9, t: 0.5, d: 4, h: 1.3 }],
  hazards: [
    { kind: 'roller', seg: 2, t: 0.5, d: 0, range: 14, period: 4.2, r: 2.2, look: 'snowball' },
    { kind: 'icicle', seg: 4, t: 0.5, d: -3, period: 3.4, phase: 0 },
    { kind: 'icicle', seg: 6, t: 0.3, d: 3, period: 3.4, phase: 0.5 },
    { kind: 'bumper', seg: 5, t: 0.35, d: -4 },
    { kind: 'bumper', seg: 5, t: 0.65, d: 4 },
    { kind: 'penguin', seg: 11, t: 0.3, d: -3, range: 18, period: 5 },
    { kind: 'geyser', seg: 14, t: 0.5, d: 4, period: 4, look: 'water' },
    { kind: 'roller', seg: 16, t: 0.6, d: 0, range: 13, period: 3.6, r: 2.4, look: 'snowball' },
    { kind: 'skier', seg: 19, t: 0.4, d: 0, range: 14, period: 5.5 },
    { kind: 'skier', seg: 20, t: 0.5, d: 0, range: 14, period: 4.8 },
    { kind: 'pole', seg: 19, t: 0.2, d: -6 },
    { kind: 'pole', seg: 19, t: 0.7, d: 6 },
    { kind: 'pole', seg: 20, t: 0.3, d: -6 },
    { kind: 'pole', seg: 20, t: 0.8, d: 6 },
  ],
  landmarks: [
    { kind: 'gantry', seg: 0, t: 0 },
    { kind: 'tunnel', seg: 4, t: 0.2, seg1: 6, t1: 0.7, look: 'ice' },
    { kind: 'dam', seg: 11, t: 0.5, d: 30 },
    { kind: 'skilift', seg: 19, t: 0.5, d: 30 },
    { kind: 'cabin', seg: 26, t: 0.6, d: 22 },
  ],
});
