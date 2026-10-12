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
  // round the hill: the Rabbit Hole cuts through it. (Flat, not banked: a branch runs level with the
  // road's centre line, so on a banked turn its mouth would stand above the low edge of the road
  // and a kart driving in from there would be thrown up the step.)
  add('hairpin', { r: 150, rad: 50, y: 0 });
  add('chicane1', { s: 72 }); // thorn hedges, the castle on its hill
  add('bend3', { l: 70, rad: 34, bank: 8 });
  add('chicane2', { s: 66 }); // the briar gate
  add('bend4', { r: 40, rad: 40 });
  add('gateRun', { s: 56 });

  // ---------------------------------------------------------------- lap 2: Desert Mirage
  style = 'sand';
  add('bazaar', { s: 80, hw: 9.5 });
  add('palace', { r: 70, rad: 36, bank: 8 });
  add('mouth', { s: 36, hw: 10, sh: 2 }); // the canyon mouth: the road narrows to the river's width
  // the water-jet canyon: a river between rock walls, jets alternating from the sides
  style = 'water';
  look = 'canyon';
  add('canyon1', { s: 56, y: -1 });
  add('canyon2', { l: 40, rad: 70, y: -2 });
  add('canyon3', { s: 56, y: -3 });
  add('canyon4', { r: 55, rad: 60, y: -4.5 });
  add('canyon5', { s: 56, y: -5.5 });
  add('canyon6', { l: 30, rad: 70, y: -6 });
  style = 'sand';
  look = '';
  add('oasis', { s: 44, y: -6, hw: 9.5, sh: 4 });
  add('souk', { r: 90, rad: 32, bank: 8 });
  // the rollercoaster road: a wooden track on trestles over the clouds. Each hill rises gently and
  // the dip behind it falls away quicker than gravity holds a kart down (a dip's curvature times the
  // speed squared beats gravity above ~16-20 units/s), so every crest throws a racer into the air
  style = 'track';
  look = 'coaster';
  deck = true;
  add('station', { s: 30, hw: 8, sh: 3 });
  add('hill1', { s: 30, y: 2 });
  add('dip1', { l: 40, rad: 26, y: -3, bank: 14 });
  add('hill2', { s: 32, y: 4 });
  add('dip2', { r: 50, rad: 30, y: -2, bank: 16 });
  add('hill3', { s: 30, y: 3 });
  add('dip3', { s: 24, y: -4 });
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
  style = 'water';
  add('plunge', { s: 46, y: -10 }); // a water chute
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
    staff: { 150: 92.6, 200: 79.7 },
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
      // the candy trail by the gingerbread house: a slalom of sweet pads, each a short, small boost
      // (they run on into one another if you follow the trail)
      { kind: 'boost', look: 'candy', power: 0.5, seg: at.glade, t: 0.1, len: 5, d: 4, w: 4 },
      { kind: 'boost', look: 'candy', power: 0.5, seg: at.glade, t: 0.45, len: 5, d: 0, w: 4 },
      { kind: 'boost', look: 'candy', power: 0.5, seg: at.glade, t: 0.8, len: 5, d: -4, w: 4 },
      { kind: 'boost', look: 'candy', power: 0.5, seg: at.esA, t: 0.12, len: 5, d: 0, w: 4 },
      { kind: 'boost', look: 'candy', power: 0.5, seg: at.esA, t: 0.4, len: 5, d: 4, w: 4 },
      // Lap 2: pads in the bazaar, before the coaster and on the way to the ship; the pool the
      // Dutchman's plunge ends in slows a kart to a wade and throws up a big splash (look: 'splash')
      { kind: 'boost', seg: at.bazaar, t: 0.4, len: 6, d: -3.5, w: 4 },
      { kind: 'boost', seg: at.souk, t: 0.5, len: 6, d: 0, w: 5 },
      { kind: 'boost', seg: at.exit, t: 0.5, len: 6, d: 3, w: 4 },
      { kind: 'shallow', look: 'splash', seg: at.poolRun, t: 0.02, len: 22, d: 0, w: 40 },
      // the coaster: a small hump over every crest (so each hill throws a fast kart up and the dip behind it
      // falls away under it) and little bumps in the dips
      { kind: 'hump', seg: at.hill1, t: 0.87, len: 7, d: 0, w: 30, h: 0.8 },
      { kind: 'hump', seg: at.hill2, t: 0.88, len: 7, d: 0, w: 30, h: 0.8 },
      { kind: 'hump', seg: at.hill3, t: 0.87, len: 7, d: 0, w: 30, h: 0.8 },
      { kind: 'hump', seg: at.dip1, t: 0.35, len: 6, d: 0, w: 30, h: 0.4 },
      { kind: 'hump', seg: at.dip2, t: 0.4, len: 6, d: 0, w: 30, h: 0.4 },
      { kind: 'hump', seg: at.dip3, t: 0.4, len: 6, d: 0, w: 30, h: 0.4 },
      // the Dutchman's bow: a swell at the lip throws a kart off the deck into the drop
      { kind: 'hump', seg: at.bowLip, t: 0.45, len: 8, d: 0, w: 30, h: 1.0 },
      // a pad on the way out of the pool
      { kind: 'boost', seg: at.poolRun, t: 0.72, len: 6, d: 0, w: 6 },
      // Lap 3: pads up the stairway and round the spiral, and one after the landing
      { kind: 'boost', seg: at.stairway, t: 0.3, len: 6, d: 0, w: 5 },
      { kind: 'boost', seg: at.stairway, t: 0.7, len: 6, d: 3.5, w: 4 },
      { kind: 'boost', seg: at.spiralA, t: 0.5, len: 8, d: 3.5, w: 4 },
      { kind: 'boost', seg: at.spiralB, t: 0.5, len: 8, d: -3.5, w: 4 },
      { kind: 'boost', seg: at.landing, t: 0.5, len: 6, d: 0, w: 6 },
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
      { seg: at.souk, t: 0.25, d: [-6, -2, 2, 6] },
      { seg: at.exit, t: 0.5, d: [-6, -2, 2, 6] },
      { seg: at.harbor, t: 0.5, d: [-6, -2, 2, 6] },
      { seg: at.poolRun, t: 0.5, d: [-6, -2, 2, 6] },
      { seg: at.plaza, t: 0.5, d: [-6, -2, 2, 6] },
      { seg: at.stairway, t: 0.5, d: [-6, -2, 2, 6] },
      { seg: at.spiralB, t: 0.6, d: [-5, -1.7, 1.7, 5] },
      { seg: at.landing, t: 0.6, d: [-6, -2, 2, 6] },
      { seg: at.finishRun, t: 0.1, d: [-6, -2, 2, 6] },
      { path: 'burrow', u: 0.42, d: [-2.2, 2.2] },
    ],
    coins: [
      { seg: at.start, t: 0.3, d: 3, n: 6, gap: 3 },
      { seg: at.clog, t: 0.4, d: -3, n: 6, gap: 3 },
      { seg: at.bazaar, t: 0.3, d: 3, n: 6, gap: 3 },
      { seg: at.oasis, t: 0.3, d: -3, n: 5, gap: 3 },
      // up the coaster's hills: the coins on a crest are caught in the air
      { seg: at.hill1, t: 0.15, d: 0, n: 7, gap: 3.5 },
      { seg: at.hill2, t: 0.15, d: -3, n: 7, gap: 3.5 },
      { seg: at.hill3, t: 0.15, d: 3, n: 7, gap: 3.5 },
      { seg: at.canyon3, t: 0.1, d: 0, n: 10, gap: 5 },
      { seg: at.stairway, t: 0.3, d: 3, n: 6, gap: 3 },
      { seg: at.spiralA, t: 0.15, d: 0, n: 12, gap: 6 },
      { seg: at.spiralB, t: 0.2, d: 0, n: 8, gap: 6 },
      { seg: at.finishRun, t: 0.2, d: 0, n: 6, gap: 3 },
      { path: 'burrow', u: 0.62, d: 0, n: 8, gap: 2.5 },
    ],
    keys: [{ seg: at.treeGlade, t: 0.5, d: -4.8, h: 1.3 }],
    hazards: [
      // Lap 2: the canyon's water jets, left and right wall in turn, all on one 3.2 s beat; every
      // jet gurgles a full second before it blasts, and each fires a little later than the last
      // (the beat travels down the canyon about as fast as a kart does, so a good line rides it)
      ...[
        [at.canyon1, 0.35, -1], [at.canyon1, 0.85, 1], [at.canyon2, 0.5, -1],
        [at.canyon3, 0.2, 1], [at.canyon3, 0.55, -1], [at.canyon3, 0.9, 1], [at.canyon4, 0.5, -1],
        [at.canyon5, 0.2, 1], [at.canyon5, 0.55, -1], [at.canyon5, 0.9, 1], [at.canyon6, 0.5, -1],
      ].map(([seg, t, side], k) => ({ kind: 'jet', seg, t, d: side * 11.6, period: 3.2, phase: (k * 0.37) % 1 })),
      // Lap 3: star bumpers on the spiral (on anti-gravity road a bump throws a spin boost) and
      // little moons rolling across the way home
      { kind: 'bumper', seg: at.spiralA, t: 0.2, d: -5 },
      { kind: 'bumper', seg: at.spiralA, t: 0.45, d: 5 },
      { kind: 'bumper', seg: at.spiralA, t: 0.7, d: -5 },
      { kind: 'bumper', seg: at.spiralB, t: 0.4, d: 5 },
      { kind: 'roller', seg: at.afterBend, t: 0.5, d: 0, range: 12, period: 4.4, r: 2.2, look: 'moon' },
      { kind: 'roller', seg: at.finishRun, t: 0.3, d: 0, range: 12, period: 4, r: 2.2, phase: 0.5, look: 'moon' },
      { kind: 'roller', seg: at.finishRun, t: 0.65, d: 0, range: 12, period: 4.6, r: 2.2, phase: 0.2, look: 'moon' },
      // Lap 1: the talking tree drops its acorns on two marked spots by the key
      { kind: 'acorntree', seg: at.treeGlade, t: 0.35, d: 16.5, spots: [{ ds: 3, d: -2.5 }, { ds: 11, d: 3.5 }], period: 5, ceil: 8 },
      // the sleeping castle's briars have crept onto the road: each row blocks one half of it
      { kind: 'thorn', seg: at.chicane1, t: 0.25, d: 2.2 },
      { kind: 'thorn', seg: at.chicane1, t: 0.25, d: 4.8 },
      { kind: 'thorn', seg: at.chicane1, t: 0.25, d: 7.4 },
      { kind: 'thorn', seg: at.chicane1, t: 0.65, d: -2.2 },
      { kind: 'thorn', seg: at.chicane1, t: 0.65, d: -4.8 },
      { kind: 'thorn', seg: at.chicane1, t: 0.65, d: -7.4 },
      { kind: 'thorn', seg: at.chicane2, t: 0.28, d: -2.2 },
      { kind: 'thorn', seg: at.chicane2, t: 0.28, d: -4.8 },
      { kind: 'thorn', seg: at.chicane2, t: 0.28, d: -7.4 },
      { kind: 'thorn', seg: at.chicane2, t: 0.72, d: 2.2 },
      { kind: 'thorn', seg: at.chicane2, t: 0.72, d: 4.8 },
      { kind: 'thorn', seg: at.chicane2, t: 0.72, d: 7.4 },
    ],
    landmarks: [
      { kind: 'gantry', seg: at.start, t: 0 },
      { kind: 'banner', seg: at.start, t: 0.5, d: 0, text: 'FABLE FAIR', color: '#7a5ad0' },
      // Lap 1
      { kind: 'bigshroom', seg: at.bend1, t: 0.5, d: 24 },
      { kind: 'gingerbread', seg: at.glade, t: 0.5, d: -28 },
      { kind: 'bigshroom', seg: at.esB, t: 0.3, d: -26 },
      { kind: 'tunnel', look: 'clog', seg: at.clog, t: 0.04, seg1: at.clog, t1: 0.96 },
      { kind: 'sleepcastle', seg: at.hairpin, t: 0, ds: -30, d: 50, far: true },
      { kind: 'briararch', seg: at.chicane2, t: 0.08 },
      { kind: 'burrow', path: 'burrow', u: 0.5 },
      { kind: 'bigshroom', seg: at.bend4, t: 0.5, d: 26 },
      // Lap 2: the bazaar, the palace in the right turn, the ride gates
      { kind: 'ridegate', seg: at.bazaar, t: 0.3, look: 'bazaar', text: 'DESERT MIRAGE', sub: 'BAZAAR OF A THOUSAND RIDES' },
      { kind: 'stall', seg: at.bazaar, t: 0.3, d: -19 },
      { kind: 'stall', seg: at.bazaar, t: 0.5, d: 19 },
      { kind: 'stall', seg: at.bazaar, t: 0.68, d: -19 },
      { kind: 'stall', seg: at.bazaar, t: 0.86, d: 19 },
      { kind: 'temple', seg: at.bazaar, t: 0.55, d: -48, far: true },
      { kind: 'carpets', seg: at.bazaar, t: 0.5, d: 0, h: 24, r: 34, n: 3, far: true },
      { kind: 'palace', seg: at.palace, t: 0.5, d: 54, far: true },
      { kind: 'ridegate', seg: at.mouth, t: 0.85, look: 'canyon', text: 'SPLASH CANYON', sub: 'MIND THE JETS' },
      { kind: 'waterfall', seg: at.mouth, t: 0.3, d: -36, w: 14, h: 26, rock: '#cf9560', cap: '#e8c880' },
      { kind: 'rockarch', seg: at.canyon3, t: 0.5 },
      { kind: 'rockarch', seg: at.canyon5, t: 0.5 },
      { kind: 'pond', seg: at.oasis, t: 0.5, d: -24, r: 11 },
      { kind: 'stall', seg: at.souk, t: 0.3, d: -20 },
      { kind: 'stall', seg: at.souk, t: 0.7, d: 20 },
      { kind: 'ridegate', seg: at.station, t: 0.3, look: 'coaster', text: 'DUNE DASHER', sub: 'HANDS UP!' },
      { kind: 'coaster', seg: at.station, t: 0, seg1: at.dip3, t1: 1 },
      { kind: 'ridegate', seg: at.harbor, t: 0.75, look: 'ship', text: 'FLYING DUTCHMAN', sub: 'HOLD ON TO YOUR HAT' },
      { kind: 'bridge', seg: at.gangway, t: 0, seg1: at.shipDeck, t1: 0, look: 'wood' },
      { kind: 'ghostship', seg: at.shipDeck, t: 0, seg1: at.bowLip, t1: 1 },
      { kind: 'splashpool', seg: at.poolRun, t: 0.02 },
      // Lap 3: the gate, the clouds the road stands on, the sleeping Moon in the middle of the spiral
      { kind: 'ridegate', seg: at.plaza, t: 0.8, look: 'dream', text: 'DREAM SKYWAY', sub: 'SLEEP TIGHT, RACE LIGHT' },
      { kind: 'balloon', seg: at.plaza, t: 0.5, d: -34, h: 26 },
      { kind: 'cloudpiers', seg: at.climbBend, t: 0, seg1: at.stairway, t1: 1 },
      { kind: 'moon', seg: at.spiralA, t: 0.5, d: -32, h: 0, r: 16, face: { seg: at.stairway, t: 0.5 }, far: true },
      { kind: 'ridegate', seg: at.glideRamp, t: 0, look: 'dream', text: 'MILKY WAY LEAP', sub: 'GLIDE!' },
      { kind: 'cloudpiers', seg: at.landing, t: 0, seg1: at.landing, t1: 1 },
      { kind: 'balloon', seg: at.afterBend, t: 0.5, d: 36, h: 22 },
      { kind: 'grandstand', seg: at.finishRun, t: 0.55, d: 1, len: 26 },
    ],
  });
})();
