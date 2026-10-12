'use strict';
// Course: Fable Fair. A fairy-tale theme park in the clouds, raced as one continuous run in three
// laps, each lap its own world with its own look, song and obstacles (see sections: lapMode):
//   Lap 1 - Fairy-Tale Forest: a dusk-lit enchanted wood. A candy trail of boost pads by the
//           gingerbread house, a talking tree that drops acorns, a giant clog you drive through
//           and the sleeping castle behind its thorn hedges. The Rabbit Hole is the hidden route.
//   Lap 2 - Desert Mirage: bazaars and domes, then three rides: the water-jet canyon, the
//           rollercoaster road and the Flying Dutchman, a ghost ship ending in a plunge.
//   Lap 3 - Dream Skyway: a night-sky lap along lavender clouds: the climb, an anti-gravity
//           spiral around the moon, the glider leap over the Milky Way and the finish.
// See js/tracks.js for the placement conventions. The road is written with named segments (at.*)
// so every placement below refers to a place, not a number.
//
// The glider chasm of lap 3 (glideRamp .. landing) is Sherbet Slopes' tuned jump: a glider flies
// the same arc at any speed, so keep its heights, lengths, zones and ring height together
// (tests/sim.js checks the landing and the ring at 50, 150 and 200cc).
(() => {
  const road = [];
  const at = {};
  // The walk is written lap by lap. What a segment looks like (road style, wall look, carried
  // over the void or not) carries on from the last line that set it, so each stretch only says
  // what changes; a segment may still name its own.
  let style = 'moss', look = '', deck = false;
  const add = (name, seg) => {
    at[name] = road.length;
    road.push(Object.assign({ style }, look ? { look } : {}, deck ? { deck: true } : {}, seg));
  };

  // ---------------------------------------------------------------- lap 1: Fairy-Tale Forest
  add('start', { s: 100 });
  add('bend1', { r: 70, rad: 38, bank: 8 });
  add('glade', { s: 46 }); // gingerbread house and the candy trail
  add('esA', { l: 110, rad: 30, bank: 10, y: 2.5 });
  add('esB', { r: 110, rad: 30, bank: 10, y: 4 });
  add('treeGlade', { s: 56 }); // the talking tree
  add('bend2', { l: 70, rad: 40, bank: 8, y: 2 });
  add('clog', { s: 76 }); // the giant clog house
  add('hairpin', { r: 150, rad: 50, bank: 12, y: 0 }); // round the hill: the Rabbit Hole cuts through it
  add('chicane1', { s: 72 }); // thorn hedges, the castle on its hill
  add('bend3', { l: 70, rad: 34, bank: 8 });
  add('chicane2', { s: 66 }); // the briar gate
  add('bend4', { r: 40, rad: 40 });
  add('gateRun', { s: 56 });

  // ---------------------------------------------------------------- lap 2: Desert Mirage
  style = 'sand';
  add('bazaar', { s: 80, hw: 9.5 });
  add('palace', { r: 70, rad: 36, bank: 8 });
  add('mouth', { s: 36 }); // the canyon mouth
  // the water-jet canyon: a river between rock walls, jets alternating from the sides
  style = 'water';
  look = 'canyon';
  add('canyon1', { s: 56, y: -1, hw: 10, sh: 2 });
  add('canyon2', { l: 40, rad: 70, y: -2 });
  add('canyon3', { s: 56, y: -3 });
  add('canyon4', { r: 55, rad: 60, y: -4.5 });
  add('canyon5', { s: 56, y: -5.5 });
  add('canyon6', { l: 30, rad: 70, y: -6 });
  style = 'sand';
  look = '';
  add('oasis', { s: 44, y: -6, hw: 9.5, sh: 4 });
  add('souk', { r: 90, rad: 32, bank: 8 });
  // the rollercoaster road: a wooden track on trestles over the clouds, hills and dips
  style = 'track';
  look = 'coaster';
  deck = true;
  add('station', { s: 30 });
  add('hill1', { s: 34, y: 4 });
  add('dip1', { l: 50, rad: 36, y: -4, bank: 20 });
  add('hill2', { s: 36, y: 8 });
  add('dip2', { r: 70, rad: 34, y: -2, bank: 22 });
  add('hill3', { s: 36, y: 6 });
  add('dip3', { s: 32, y: -6 });
  style = 'sand';
  look = '';
  deck = false;
  add('exit', { s: 30 });
  // the Flying Dutchman: up the gangway, along the ghost ship's deck, over the bow and down
  add('harbor', { l: 70, rad: 40 });
  style = 'deck';
  look = 'hull';
  deck = true;
  add('gangway', { s: 90, y: 16 });
  add('shipDeck', { s: 60 });
  add('bowLip', { s: 12 });
  look = 'flume';
  add('plunge', { s: 46, y: -10 });
  style = 'water';
  look = 'canyon';
  deck = false;
  add('poolRun', { s: 100 });

  // ---------------------------------------------------------------- lap 3: Dream Skyway
  style = 'cloud';
  look = '';
  add('plaza', { s: 60, y: -10, hw: 9 });
  deck = true;
  add('climbBend', { r: 60, rad: 36, y: -4, bank: 10 });
  add('stairway', { s: 110, y: 22 });
  // the Stardust Spiral: anti-gravity road winding up around the moon
  add('spiralA', { l: 190, rad: 32, y: 40, bank: 50, antigrav: true, style: 'metal', hw: 9 });
  add('spiralB', { r: 100, rad: 36, y: 40, bank: 40, antigrav: true, style: 'metal' });
  // the glider leap over the Milky Way
  add('glideRamp', { s: 40, y: 40, hw: 8 });
  add('glide', { s: 100, y: 32, wallL: false, wallR: false });
  add('landing', { s: 80, y: 25, wallL: true, wallR: true });
  deck = false;
  add('afterBend', { r: 90, rad: 34, y: 22, bank: 10 });
  add('finishRun', { s: 150, y: 20 });

  TRACK_DEFS.push({
    id: 'fablefair',
    name: 'Fable Fair',
    blurb: 'A fairy-tale fair in the clouds in three laps: an enchanted forest, a desert of rides and a night-sky dream.',
    music: 'fable1',
    difficulty: 3,
    theme: 'fairy',
    p2p: true,
    lapMode: true,
    startAt: 46,
    runout: 60,
    y: 0,
    hw: 8, sh: 4, wallL: true, wallR: true,
    style: 'moss',
    sections: [
      { name: 'Fairy-Tale Forest', music: 'fable1', theme: 'fairy' },
      { name: 'Desert Mirage', music: 'fable2', theme: 'mirage', seg: at.bazaar, t: 0 },
      { name: 'Dream Skyway', music: 'fable3', theme: 'dream', seg: at.plaza, t: 0 },
    ],
    segments: road,
    branches: [{ id: 'burrow', name: 'Rabbit Hole', seg: at.hairpin, phi: 66, gate: 'auto', style: 'dirt', hw: 5.5, sh: 1.8 }],
    zones: [
      // the glider chasm (see the note at the top)
      { kind: 'boost', seg: at.glideRamp, t: 0.12, len: 7, d: 0, w: 26 },
      { kind: 'glide', seg: at.glideRamp, t: 0.5, len: 10, d: 0, w: 30, h: 1.4 },
      { kind: 'gap', seg: at.glideRamp, t: 0.75, len: 107, d: 0, w: 80 },
    ],
    // three rings on the glider's arc (it sinks the same way at any speed: heights from the sim)
    rings: [
      { seg: at.glide, t: 0.15, d: 0, h: 6.6, r: 4 },
      { seg: at.glide, t: 0.4, d: 0, h: 8.8, r: 4 },
      { seg: at.glide, t: 0.7, d: 0, h: 7, r: 4 },
    ],
    boxes: [
      { seg: at.start, t: 0.9, d: [-5.5, -1.8, 1.8, 5.5] },
      { seg: at.esB, t: 0.5, d: [-4.5, -1.5, 1.5, 4.5] },
      { seg: at.clog, t: 0.2, d: [-5.5, -1.8, 1.8, 5.5] },
      { seg: at.chicane2, t: 0.75, d: [-5.5, -1.8, 1.8, 5.5] },
      { seg: at.bazaar, t: 0.7, d: [-6, -2, 2, 6] },
      { seg: at.mouth, t: 0.5, d: [-6, -2, 2, 6] },
      { seg: at.oasis, t: 0.5, d: [-6, -2, 2, 6] },
      { seg: at.exit, t: 0.5, d: [-6, -2, 2, 6] },
      { seg: at.plaza, t: 0.5, d: [-6, -2, 2, 6] },
      { seg: at.stairway, t: 0.5, d: [-6, -2, 2, 6] },
      { seg: at.landing, t: 0.6, d: [-6, -2, 2, 6] },
      { path: 'burrow', u: 0.42, d: [-2.2, 2.2] },
    ],
    coins: [
      { seg: at.start, t: 0.3, d: 3, n: 6, gap: 3 },
      { seg: at.clog, t: 0.4, d: -3, n: 6, gap: 3 },
      { seg: at.bazaar, t: 0.3, d: 3, n: 6, gap: 3 },
      { seg: at.oasis, t: 0.3, d: -3, n: 5, gap: 3 },
      { seg: at.stairway, t: 0.3, d: 3, n: 6, gap: 3 },
      { seg: at.finishRun, t: 0.2, d: 0, n: 6, gap: 3 },
      { path: 'burrow', u: 0.62, d: 0, n: 8, gap: 2.5 },
    ],
    keys: [{ seg: at.treeGlade, t: 0.5, d: -4.8, h: 1.3 }],
    hazards: [],
    landmarks: [],
  });
})();
