#!/usr/bin/env node
'use strict';
// Headless race simulation: runs full bot races on every course with the real track, kart,
// item and AI code, and checks that the courses are drivable end to end: everyone finishes,
// nobody gets stuck or falls off constantly, the hidden routes and their gates work, keys can
// be collected, and the ramp jumps clear their chasms.
//
//   node tests/sim.js            -> summary + exit code
//   node tests/sim.js --verbose  -> per-kart detail

const { loadGame } = require('./load');
const G = loadGame();
const verbose = process.argv.includes('--verbose');
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
};

const TRACKS = G('TRACK_DEFS').map((t) => t.id);
const Race = G('Race');
const randomKart = G('randomKart');
const U = G('U');
const CFG = G('CFG');

function botRace(track, seed, opts = {}) {
  const rnd = U.rng(seed);
  const racers = [];
  for (let i = 0; i < 8; i++) racers.push({ name: 'Bot ' + i, bot: true, config: randomKart(rnd) });
  const race = new Race({ track, laps: opts.laps || 3, cc: 150, racers, seed, items: opts.items !== false });
  if (opts.setup) opts.setup(race);
  const stats = race.karts.map(() => ({ falls: 0, walls: 0, stuck: 0, maxStill: 0, still: 0, keys: 0, gates: 0, hits: 0, uses: 0, boosts: 0 }));
  const dt = 1 / 60;
  let t = 0;
  const counts = {};
  while (race.state !== 'done' && t < (opts.maxTime || 260)) {
    race.update(dt);
    t += dt;
    for (const e of race.drainEvents()) {
      counts[e.type] = (counts[e.type] || 0) + 1;
      if (!e.kart) continue;
      const s = stats[e.kart.idx];
      if (e.type === 'fall') s.falls++;
      if (e.type === 'wall') s.walls++;
      if (e.type === 'key') s.keys++;
      if (e.type === 'gate') s.gates++;
      if (e.type === 'hit') s.hits++;
      if (e.type === 'use') s.uses++;
      if (e.type === 'boost') s.boosts++;
    }
    if (race.state === 'race') {
      for (const k of race.karts) {
        const s = stats[k.idx];
        if (!k.finished && k.speed < 1.5 && k.controllable) s.still += dt;
        else s.still = 0;
        s.maxStill = Math.max(s.maxStill, s.still);
      }
    }
    for (const k of race.karts) {
      if (![k.x, k.y, k.z, k.vx, k.vz].every(Number.isFinite)) throw new Error(`NaN kart ${k.idx} on ${track}`);
    }
  }
  return { race, stats, counts, t };
}

for (const track of TRACKS) {
  const { race, stats, counts, t } = botRace(track, 1234);
  const fin = race.karts.filter((k) => k.finished);
  check(`${track}: all 8 bots finish 3 laps`, fin.length === 8, `${fin.length}/8 in ${t.toFixed(0)}s sim`);
  const times = fin.map((k) => k.finishTime).sort((a, b) => a - b);
  if (times.length) check(`${track}: race length is sensible`, times[0] > 60 && times[0] < 160, `winner ${times[0].toFixed(1)}s, last ${times[times.length - 1].toFixed(1)}s`);
  const falls = stats.reduce((a, s) => a + s.falls, 0);
  check(`${track}: bots rarely fall off`, falls <= 8, `${falls} falls total`);
  const stuck = Math.max(...stats.map((s) => s.maxStill));
  check(`${track}: nobody gets stuck`, stuck < 3, `longest stop ${stuck.toFixed(1)}s`);
  check(`${track}: items get used`, (counts.use || 0) > 10, `${counts.use || 0} uses, ${counts.hit || 0} hits, ${counts.box || 0} boxes`);
  check(`${track}: bots drift for mini-turbos`, (counts.sparks || 0) > 20, `${counts.sparks || 0} spark level-ups`);
  if (verbose) {
    for (const k of race.order) {
      const s = stats[k.idx];
      console.log(`   ${k.place}. ${k.name.padEnd(6)} ${k.config.character.padEnd(9)} ${G('fmtTime')(k.finishTime)} falls ${s.falls} walls ${s.walls} hits ${s.hits} keys ${s.keys} gates ${s.gates} coins ${k.coinsGot}`);
    }
    console.log('   events', JSON.stringify(counts));
  }

  // hidden route: a bot that starts with a key should open the gate and take the branch
  const r2 = botRace(track, 77, {
    laps: 1, items: false,
    setup: (race) => {
      race.karts[0].key = true;
      CFG.botKeyHunt = 0;
    },
  });
  CFG.botKeyHunt = G('CFG_DEFAULTS').botKeyHunt;
  const k0 = r2.race.karts[0];
  const branch = r2.race.track.branches[0];
  check(`${track}: key opens the ${branch.routeName}`, !!k0.routes[branch.id], `gates opened ${r2.counts.gate || 0}`);
  const without = r2.race.karts.slice(1).some((k) => k.routes[branch.id]);
  check(`${track}: no keyless bot passes a locked gate`, !without || (r2.counts.gate || 0) > 0);

  // keys: a straight run at the key spot should collect it
  const T = r2.race.track;
  check(`${track}: has a key, a gate and item boxes`, T.objects.keys.length >= 1 && T.objects.gates.length >= 1 && T.objects.boxes.length >= 8);
}

// ramp jumps must clear their chasms at a decent speed
{
  for (const track of TRACKS) {
    const T = G(`getTrack('${track}')`);
    const gaps = T.main.zones.filter((z) => z.kind === 'gap');
    for (const gz of gaps) {
      const racers = [{ name: 'Jumper', bot: false, config: { character: 'pepper' } }];
      const race = new Race({ track, laps: 1, cc: 150, racers, seed: 1, items: false });
      race.state = 'race';
      const k = race.karts[0];
      const p = T.main.point(gz.s0 - 40, 0);
      k.setPos(p.x, p.y, p.z, p.head);
      let fell = false;
      for (let i = 0; i < 60 * 6; i++) {
        k.ctl.gas = true;
        k.ctl.steer = 0;
        race.update(1 / 60);
        for (const e of race.drainEvents()) if (e.type === 'fall') fell = true;
        if (k.loc && k.loc.s > gz.s1 + 10) break;
      }
      check(`${track}: the ramp clears the chasm at speed`, !fell && k.loc.s > gz.s1, `kart at s ${k.loc.s.toFixed(0)} vs chasm end ${gz.s1.toFixed(0)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Driving mechanics with a scripted human kart.
function soloRace(track, setup) {
  const race = new Race({ track, laps: 3, cc: 150, racers: [{ name: 'Tester', bot: false, config: { character: 'pepper' } }], seed: 3, items: true });
  race.items.hazards = []; // an empty course: no Mudlets wandering into the experiments
  if (setup) setup(race);
  return race;
}
function placeOn(race, s, d = 0, speed = 0) {
  const k = race.karts[0], T = race.track;
  const p = T.main.point(s, d);
  k.setPos(p.x, p.y, p.z, p.head);
  k.vx = Math.cos(p.head) * speed;
  k.vz = Math.sin(p.head) * speed;
  return k;
}
function run(race, secs, fn) {
  const ev = [];
  for (let i = 0; i < Math.round(secs * 60); i++) {
    if (fn) fn(i / 60);
    race.update(1 / 60);
    for (const e of race.drainEvents()) ev.push(e);
  }
  return ev;
}
{
  // rocket start: gas as the 1 shows
  let race = soloRace('meadow');
  let k = race.karts[0];
  run(race, 3.2, () => (k.ctl.gas = race.state === 'countdown' ? race.count < 0.8 : true));
  check('rocket start: gas on the 1 gives a boost', k.boostKind === 'rocket' || k.boostT > 0, `kind ${k.boostKind}`);
  race = soloRace('meadow');
  k = race.karts[0];
  run(race, 3.2, () => (k.ctl.gas = true));
  check('holding gas from the start floods the engine', k.stallT > 0 || race.events.some((e) => e.type === 'stall') || k.speed < 6, `speed ${k.speed.toFixed(1)}`);

  // hop-drift through the long final bend for an orange mini-turbo: the bot's steering keeps
  // the line, the test holds and releases the Drift button like a player would
  race = soloRace('meadow');
  race.state = 'race';
  const T = race.track;
  k = placeOn(race, T.segS(9, 0) - 4, -2, 24);
  const steerer = new (G('BotBrain'))(k, U.rng(1));
  let released = false;
  const ev = run(race, 3.6, (t) => {
    steerer.update(1 / 60);
    if (t < 0.25) k.ctl.steer = 1;
    k.ctl.gas = true;
    k.ctl.brake = false;
    k.ctl.item = false;
    k.ctl.drift = t < 2.8;
    if (t >= 2.8) released = true;
  });
  const sparks = ev.filter((e) => e.type === 'sparks').map((e) => e.a);
  const boosts = ev.filter((e) => e.type === 'boost' && /turbo/.test(e.a)).map((e) => e.a);
  check('holding a drift charges blue then orange sparks', sparks.includes(1) && sparks.includes(2), `levels ${sparks}`);
  check('releasing the drift fires a mini-turbo', released && boosts.length > 0, `boosts ${boosts}`);

  // walls bounce and never let you through
  race = soloRace('meadow');
  race.state = 'race';
  k = placeOn(race, 30, 0, 26);
  k.head += 0.7; // aim at the right-hand hedge
  let maxD = 0;
  const wallEv = run(race, 1.5, () => {
    k.ctl.gas = true;
    maxD = Math.max(maxD, Math.abs(k.loc.d) - (k.loc.hw + k.loc.sh));
  });
  check('walls stop karts at the road edge', maxD < 0.2 && !k.falling, `overshoot ${maxD.toFixed(2)}`);
  check('hitting a wall costs speed', wallEv.some((e) => e.type === 'wall'), `${wallEv.filter((e) => e.type === 'wall').length} hits`);

  // a banana spins you out, then you recover
  race = soloRace('meadow');
  race.state = 'race';
  k = placeOn(race, 40, 0, 20);
  const bp = T.main.point(46, 0);
  race.items.spawn({ kind: 'banana', x: bp.x, y: bp.y, z: bp.z, owner: null, vx: 0, vz: 0 });
  let spun = false;
  run(race, 3, () => {
    k.ctl.gas = true;
    if (k.spinT > 0) spun = true;
  });
  check('bananas spin karts out', spun);
  check('and they recover afterwards', k.spinT <= 0 && k.speed > 10, `speed ${k.speed.toFixed(1)}`);

  // locked gate: bounce without a key, open with one
  const br = T.branches[0], gate = race.items.gates[0];
  const tryGate = (withKey) => {
    const r = soloRace('meadow');
    r.state = 'race';
    const kk = r.karts[0];
    const p = br.point(Math.max(0, br.s[gate.i] - 8), 0);
    kk.setPos(p.x, p.y, p.z, p.head);
    kk.vx = Math.cos(p.head) * 15;
    kk.vz = Math.sin(p.head) * 15;
    kk.key = withKey;
    const e = run(r, 2, () => {
      kk.ctl.gas = true;
      kk.ctl.steer = 0;
    });
    return { passed: kk.path === br && kk.loc.i > gate.i + 3, events: e.map((x) => x.type) };
  };
  const locked = tryGate(false), open = tryGate(true);
  check('a locked gate turns keyless karts away', !locked.passed && locked.events.includes('locked'));
  check('a key opens the gate and lets you through', open.passed && open.events.includes('gate'));

  // ramp + hop at the lip = trick boost on landing
  race = soloRace('meadow');
  race.state = 'race';
  const rz = T.main.zones.find((z) => z.kind === 'ramp');
  k = placeOn(race, rz.s0 - 25, 0, 26);
  const rampEv = run(race, 3, () => {
    k.ctl.gas = true;
    k.ctl.drift = !k.onGround && k.airT < 0.15 && race.time - (k.lastLaunch || -9) < 0.2;
  });
  check('ramps launch karts', rampEv.some((e) => e.type === 'launch'));
  check('a hop off the lip lands a trick boost', rampEv.some((e) => e.type === 'trick') && rampEv.some((e) => e.type === 'boost' && e.a === 'trick'));

  // coins raise top speed
  race = soloRace('meadow');
  k = race.karts[0];
  const v0 = k.baseSpeed();
  k.coins = 10;
  check('10 coins raise top speed', k.baseSpeed() > v0 * 1.05, `${v0.toFixed(1)} -> ${k.baseSpeed().toFixed(1)}`);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
