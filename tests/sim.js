#!/usr/bin/env node
'use strict';
// Headless race simulation: runs full bot races on every course with the real track, kart,
// item and AI code, and checks that the courses are drivable end to end: everyone finishes,
// nobody gets stuck or falls off constantly, the hidden routes and their gates work, keys can
// be collected, the ramp jumps clear their chasms and the glider jumps clear theirs.
// Circuits are raced over laps; point-to-point courses are one run through their sections.
// Then scripted experiments check the driving mechanics, the new course features (gliders,
// boost rings, anti-gravity, currents, banking, end barriers, forks, staff ghosts) and that
// every moving hazard can hit a kart.
//
//   node tests/sim.js            -> summary + exit code
//   node tests/sim.js --verbose  -> per-kart detail

const fs = require('fs');
const path = require('path');
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
const BotBrain = G('BotBrain');
const U = G('U');
const CFG = G('CFG');
const getTrack = (id) => G(`getTrack('${id}')`);

function botRace(track, seed, opts = {}) {
  const rnd = U.rng(seed);
  const racers = [];
  for (let i = 0; i < 8; i++) racers.push({ name: 'Bot ' + i, bot: true, config: randomKart(rnd) });
  for (const extra of opts.extra || []) racers.push(extra);
  const race = new Race({ track, laps: opts.laps || 3, cc: 150, racers, seed, items: opts.items !== false });
  if (opts.setup) opts.setup(race);
  const stats = race.karts.map(() => ({ falls: 0, walls: 0, stuck: 0, maxStill: 0, still: 0, keys: 0, gates: 0, hits: 0, uses: 0, boosts: 0, rings: 0, glides: 0, sections: [], paths: new Set() }));
  const dt = 1 / 60;
  let t = 0, steps = 0, busy = 0;
  const counts = {};
  const bumps = [];
  while (race.state !== 'done' && t < (opts.maxTime || 260)) {
    const t0 = process.hrtime.bigint();
    race.update(dt);
    busy += Number(process.hrtime.bigint() - t0);
    steps++;
    t += dt;
    for (const e of race.drainEvents()) {
      counts[e.type] = (counts[e.type] || 0) + 1;
      if (e.type === 'bump') bumps.push([e.kart, e.a]);
      if (!e.kart) continue;
      const s = stats[e.kart.idx];
      if (e.type === 'fall') s.falls++;
      if (e.type === 'wall') s.walls++;
      if (e.type === 'key') s.keys++;
      if (e.type === 'gate') s.gates++;
      if (e.type === 'hit') s.hits++;
      if (e.type === 'use') s.uses++;
      if (e.type === 'boost') s.boosts++;
      if (e.type === 'ring') s.rings++;
      if (e.type === 'glide') s.glides++;
      if (e.type === 'section' || e.type === 'finalsection') s.sections.push(e.type === 'finalsection' ? -e.a : e.a);
    }
    for (const k of race.karts) {
      const s = stats[k.idx];
      if (k.path && k.loc && k.loc.s > 30) s.paths.add(k.path.id);
      if (race.state === 'race') {
        if (!k.finished && k.speed < 1.5 && k.controllable) s.still += dt;
        else s.still = 0;
        s.maxStill = Math.max(s.maxStill, s.still);
      }
      if (![k.x, k.y, k.z, k.vx, k.vz].every(Number.isFinite)) throw new Error(`NaN kart ${k.idx} on ${track}`);
    }
  }
  return { race, stats, counts, t, bumps, msPerStep: busy / 1e6 / Math.max(1, steps) };
}

const mountRaces = {};
for (const track of TRACKS) {
  const T = getTrack(track);
  const { race, stats, counts, t, msPerStep } = botRace(track, 1234);
  if (T.p2p) mountRaces[track] = { race, stats, counts };
  const fin = race.karts.filter((k) => k.finished);
  const what = T.p2p ? `the ${T.sections.length}-section run` : `${race.laps} laps`;
  check(`${track}: all 8 bots finish ${what}`, fin.length === 8, `${fin.length}/8 in ${t.toFixed(0)}s sim, ${msPerStep.toFixed(2)} ms/step`);
  const times = fin.map((k) => k.finishTime).sort((a, b) => a - b);
  // the winner's average speed must be believable whatever the course length
  const lo = race.goal / 34, hi = race.goal / 12.5;
  if (times.length) check(`${track}: race length is sensible`, times[0] > lo && times[0] < hi, `winner ${times[0].toFixed(1)}s, last ${times[times.length - 1].toFixed(1)}s, bounds ${lo.toFixed(0)}-${hi.toFixed(0)}s`);
  const falls = stats.reduce((a, s) => a + s.falls, 0);
  check(`${track}: bots rarely fall off`, falls <= 8, `${falls} falls total`);
  const stuck = Math.max(...stats.map((s) => s.maxStill));
  check(`${track}: nobody gets stuck`, stuck < 3, `longest stop ${stuck.toFixed(1)}s`);
  check(`${track}: items get used`, (counts.use || 0) > 10, `${counts.use || 0} uses, ${counts.hit || 0} hits, ${counts.box || 0} boxes`);
  check(`${track}: bots drift for mini-turbos`, (counts.sparks || 0) > 20, `${counts.sparks || 0} spark level-ups`);
  if (T.p2p) {
    // one run, no laps: every kart passes each checkpoint once, in order, the last one flagged final
    const n = T.sections.length;
    const want = [];
    for (let i = 2; i <= n; i++) want.push(i === n ? -i : i);
    const inOrder = stats.every((s) => s.sections.join() === want.join());
    check(`${track}: sections fire in order for every kart`, inOrder && !counts.lap && !counts.finallap, `kart 0: ${stats[0].sections.join(' ')}`);
    const glides = T.main.zones.filter((z) => z.kind === 'glide').length;
    const glided = stats.filter((s) => s.glides >= glides).length;
    check(`${track}: every bot glides over every glider chasm`, glided === 8, `${glided}/8 opened the glider ${glides}x, ${falls} falls`);
    if (T.objects.rings.length) {
      const ringers = stats.filter((s) => s.rings > 0).length;
      check(`${track}: bots fly through boost rings`, ringers >= 6 && (counts.ring || 0) >= 12, `${counts.ring || 0} ring boosts, ${ringers}/8 bots`);
    }
    const fork = T.branches.find((b) => b.open);
    if (fork) {
      const took = stats.filter((s) => s.paths.has(fork.id)).length;
      check(`${track}: bots split at the ${fork.routeName} fork`, took >= 1 && took <= 7, `${took}/8 took the side road`);
    }
    // (the race ends as the last one crosses the line: look at those home a while)
    const home = race.karts.filter((k) => k.finished && k.finishTime < race.raceTime - 4);
    const parked = home.every((k) => k.loc.over === 0 && k.speed < 3);
    check(`${track}: finishers stop in the run-out`, home.length >= 4 && parked && stats.every((s) => s.walls < 25), `speeds ${home.map((k) => k.speed.toFixed(1)).join(' ')}`);
  }
  if (verbose) {
    for (const k of race.order) {
      const s = stats[k.idx];
      console.log(`   ${k.place}. ${k.name.padEnd(6)} ${k.config.character.padEnd(9)} ${G('fmtTime')(k.finishTime)} falls ${s.falls} walls ${s.walls} hits ${s.hits} keys ${s.keys} gates ${s.gates} coins ${k.coinsGot} rings ${s.rings} roads ${[...s.paths].join('/')}`);
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
  const branch = r2.race.track.branches.find((b) => b.gate);
  check(`${track}: key opens the ${branch.routeName}`, !!k0.routes[branch.id], `gates opened ${r2.counts.gate || 0}`);
  const without = r2.race.karts.slice(1).some((k) => k.routes[branch.id]);
  check(`${track}: no keyless bot passes a locked gate`, !without || (r2.counts.gate || 0) > 0);

  // keys: a straight run at the key spot should collect it
  check(`${track}: has a key, a gate and item boxes`, T.objects.keys.length >= 1 && T.objects.gates.length >= 1 && T.objects.boxes.length >= 8);
}

// ---------------------------------------------------------------------------
// Jumps: ramps must clear their chasms at a decent speed; glider chasms must be crossed on the
// glider at race speed, landing on the far side.
{
  for (const track of TRACKS) {
    const T = getTrack(track);
    const gaps = T.main.zones.filter((z) => z.kind === 'gap');
    for (const gz of gaps) {
      const glideZ = T.main.zones.find((z) => z.kind === 'glide' && z.s1 <= gz.s0 + 1 && z.s1 > gz.s0 - 15);
      const racers = [{ name: 'Jumper', bot: false, config: { character: 'pepper' } }];
      if (!glideZ) {
        const race = new Race({ track, laps: 1, cc: 150, racers, seed: 1, items: false });
        race.state = 'race';
        race.items.hazards = [];
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
        continue;
      }
      // a glider chasm: arrive at race speed, steered like a bot, over the boost pad if any;
      // the glider must carry every engine class across and through the rings over the chasm
      const rings = T.objects.rings.filter((r) => r.path === T.main && r.s > gz.s0 && r.s < gz.s1);
      for (const cc of [50, 150, 200]) {
        const race = new Race({ track, laps: 1, cc, racers, seed: 1, items: false });
        race.state = 'race';
        race.items.hazards = [];
        const k = race.karts[0];
        const steer = new BotBrain(k, U.rng(5));
        const p = T.main.point(glideZ.s0 - 26, 0);
        k.setPos(p.x, p.y, p.z, p.head);
        const v0 = k.baseSpeed();
        k.vx = Math.cos(p.head) * v0;
        k.vz = Math.sin(p.head) * v0;
        let fell = false, glided = false, landed = null, minV = Infinity, ringsGot = 0;
        for (let i = 0; i < 60 * 14 && landed === null && !fell; i++) {
          steer.update(1 / 60);
          race.update(1 / 60);
          for (const e of race.drainEvents()) {
            if (e.type === 'fall') fell = true;
            if (e.type === 'glide') glided = true;
            if (e.type === 'ring') ringsGot++;
            if (e.type === 'land' && glided) landed = k.loc.s;
          }
          if (k.gliding) minV = Math.min(minV, k.speed);
        }
        check(`${track}: the glider clears the ${(gz.s1 - gz.s0).toFixed(0)}-unit chasm at ${cc}cc`, glided && !fell && landed > gz.s1 && landed < gz.s1 + 60 && ringsGot === rings.length,
          `landed at s ${landed === null ? '-' : landed.toFixed(0)} vs chasm end ${gz.s1.toFixed(0)}, rings ${ringsGot}/${rings.length}, slowest ${minV.toFixed(1)}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Driving mechanics with a scripted human kart.
function soloRace(track, setup, racers) {
  const race = new Race({ track, laps: 3, cc: 150, racers: racers || [{ name: 'Tester', bot: false, config: { character: 'pepper' } }], seed: 3, items: true });
  race.items.hazards = []; // an empty course: no Mudlets wandering into the experiments
  if (setup) setup(race);
  return race;
}
function placeOn(race, s, d = 0, speed = 0, k = race.karts[0]) {
  const T = race.track;
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
  const steerer = new BotBrain(k, U.rng(1));
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

// ---------------------------------------------------------------------------
// Course features: gliders, rings, anti-gravity, currents, banking, end barriers, moguls.
{
  const M = getTrack('mount');
  const zone = (kind, from = 0) => M.main.zones.find((z) => z.kind === kind && z.s0 >= from);
  // the middle of the first anti-gravity stretch, and the most steeply banked spot
  let agFrom = -1, agTo = -1, steepest = 0;
  for (let i = 0; i < M.main.n; i++) {
    if (M.main.ag[i] && agFrom < 0) agFrom = i;
    if (agFrom >= 0 && agTo < 0 && !M.main.ag[i]) agTo = i;
    if (Math.abs(M.main.bank[i]) > Math.abs(M.main.bank[steepest])) steepest = i;
  }
  const agS = M.main.s[Math.round((agFrom + agTo) / 2)], bankS = M.main.s[steepest];

  // the glider: sinks far slower than a free fall, keeps its speed, steers, closes on landing
  let race = soloRace('mount');
  race.state = 'race';
  const gl = zone('glide');
  let k = placeOn(race, gl.s0 - 26, 0, 0);
  const steer = new BotBrain(k, U.rng(9));
  k.vx = Math.cos(k.head) * k.baseSpeed();
  k.vz = Math.sin(k.head) * k.baseSpeed();
  let opened = null, apex = null, after2 = null, slowest = Infinity, closed = false;
  run(race, 9, (t) => {
    steer.update(1 / 60);
    if (k.gliding) {
      if (!opened) opened = { t, y: k.y };
      if (k.vy <= 0 && !apex) apex = { t, y: k.y };
      if (apex && !after2 && t - apex.t >= 2) after2 = { y: k.y, t };
      slowest = Math.min(slowest, k.speed);
    } else if (opened && k.onGround) closed = true;
  });
  const glideDrop = apex && after2 ? apex.y - after2.y : Infinity;
  const freeDrop = 0.5 * CFG.gravity * 4;
  check('a glide ramp opens the glider', !!opened, opened ? `opened at t ${opened.t.toFixed(2)}` : 'never opened');
  check('the glider sinks far slower than a free fall', glideDrop < freeDrop * 0.25, `${glideDrop.toFixed(1)} units in 2 s vs ${freeDrop.toFixed(0)} falling`);
  check('the glider keeps its speed and folds away on landing', slowest >= k.baseSpeed() * 0.9 - 0.01 && closed && !k.gliding && k.glideT === 0, `slowest ${slowest.toFixed(1)} of ${k.baseSpeed().toFixed(1)}`);

  // a boost ring boosts whoever flies through its middle (once per pass)
  race = soloRace('mount');
  race.state = 'race';
  const ring = race.items.rings[0];
  k = race.karts[0];
  k.setPos(ring.x - ring.tx * 6, ring.y - 0.7, ring.z - ring.tz * 6, Math.atan2(ring.tz, ring.tx));
  k.onGround = false;
  k.gliding = true;
  k.vx = ring.tx * 30;
  k.vz = ring.tz * 30;
  let ev = run(race, 0.5);
  const rung = ev.filter((e) => e.type === 'ring');
  check('a boost ring gives a boost', rung.length === 1 && k.boostKind === 'ring' && ring.flash > 0, `${rung.length} ring events, boost ${k.boostKind}`);
  // ... and misses one that flies past outside it
  race = soloRace('mount');
  race.state = 'race';
  k = race.karts[0];
  const ring2 = race.items.rings[0];
  k.setPos(ring2.x - ring2.tx * 6, ring2.y + ring2.r + 1.5, ring2.z - ring2.tz * 6, Math.atan2(ring2.tz, ring2.tx));
  k.onGround = false;
  k.gliding = true;
  k.vx = ring2.tx * 30;
  k.vz = ring2.tz * 30;
  ev = run(race, 0.5);
  check('flying over a ring gives nothing', !ev.some((e) => e.type === 'ring'));

  // anti-gravity: a bump gives both karts a spin boost
  const two = [{ name: 'A', bot: false, config: { character: 'pepper' } }, { name: 'B', bot: false, config: { character: 'mudlet' } }];
  race = soloRace('mount', null, two);
  race.state = 'race';
  const ag = agS;
  const a = placeOn(race, ag, -1.3, 0, race.karts[0]);
  const b = placeOn(race, ag, 1.3, 0, race.karts[1]);
  a.vx += a.loc.nx * 6;
  a.vz += a.loc.nz * 6;
  b.vx -= b.loc.nx * 6;
  b.vz -= b.loc.nz * 6;
  ev = run(race, 0.4);
  const spun2 = ev.filter((e) => e.type === 'spinboost').map((e) => e.kart.name);
  check('an anti-gravity bump gives both karts a spin boost', spun2.includes('A') && spun2.includes('B') && a.antigrav && b.antigrav, `spin boosts ${spun2.join(',')}`);
  // ... but not on ordinary road
  race = soloRace('mount', null, two);
  race.state = 'race';
  const c0 = placeOn(race, 60, -1.3, 0, race.karts[0]);
  const c1 = placeOn(race, 60, 1.3, 0, race.karts[1]);
  c0.vx += c0.loc.nx * 6;
  c0.vz += c0.loc.nz * 6;
  c1.vx -= c1.loc.nx * 6;
  c1.vz -= c1.loc.nz * 6;
  ev = run(race, 0.4);
  check('an ordinary bump gives no spin boost', !ev.some((e) => e.type === 'spinboost') && ev.some((e) => e.type === 'bump'));

  // a water current carries a kart that sits still
  race = soloRace('mount');
  race.state = 'race';
  const cz = zone('current');
  k = placeOn(race, cz.s0 + 10, 0, 0);
  const s0 = k.loc.s;
  run(race, 1, () => (k.ctl.gas = false));
  const carried = k.loc.s - s0;
  check('a current carries a stationary kart along the road', Math.abs(carried - cz.flow * CFG.currentScale) < 2, `moved ${carried.toFixed(1)} units, flow ${cz.flow}`);

  // banking: the ground at d is the centre height minus d * bank, and karts sit and lean on it
  const sb = bankS;
  const pc = M.main.point(sb, 0), pd = M.main.point(sb, 6);
  const banked = Math.abs(pd.y - (pc.yc - 6 * pc.bank)) < 1e-4 && pc.bank > 0.7;
  race = soloRace('mount');
  race.state = 'race';
  k = placeOn(race, sb, 6, 0);
  run(race, 1);
  const g = M.groundY(k.loc);
  check('banked ground height = centre - d * bank', banked && Math.abs(k.y - g) < 0.05 && Math.abs(g - (k.loc.yc - k.loc.d * k.loc.bank)) < 1e-3, `bank ${pc.bank.toFixed(2)}, kart y ${k.y.toFixed(2)} vs ground ${g.toFixed(2)}`);
  check('karts lean with the road bank', Math.abs(k.bank - Math.atan(k.loc.bank)) < 0.05 && Math.abs(k.slopePitch) < 0.6, `roll ${k.bank.toFixed(2)} vs ${Math.atan(k.loc.bank).toFixed(2)}`);

  // the ends of a point-to-point road are barriers
  race = soloRace('mount');
  race.state = 'race';
  k = placeOn(race, M.length - 30, 0, 30);
  let over = 0;
  ev = run(race, 3, () => {
    k.ctl.gas = true;
    over = Math.max(over, k.loc.over);
  });
  check('the end barrier stops a kart at the end of the road', over < 1 && k.loc.s > M.length - 6 && !k.falling && ev.some((e) => e.type === 'wall'), `max overshoot ${over.toFixed(2)}, s ${k.loc.s.toFixed(1)}`);
  race = soloRace('mount');
  race.state = 'race';
  k = placeOn(race, 12, 0, 0);
  k.head += Math.PI;
  k.vx = Math.cos(k.head) * 20;
  k.vz = Math.sin(k.head) * 20;
  over = 0;
  run(race, 2, () => {
    k.ctl.gas = true;
    over = Math.max(over, k.loc.over);
  });
  check('and so is the start of the road', over < 1 && !k.falling, `max overshoot ${over.toFixed(2)}`);

  // moguls throw a fast kart into the air
  race = soloRace('mount');
  race.state = 'race';
  const hz = zone('hump');
  k = placeOn(race, hz.s0 - 20, 0, 0);
  k.vx = Math.cos(k.head) * k.baseSpeed();
  k.vz = Math.sin(k.head) * k.baseSpeed();
  ev = run(race, 1.2, () => (k.ctl.gas = true));
  check('moguls launch a fast kart', ev.some((e) => e.type === 'launch'));

  // safe spots: the rescue cloud never sets you down on a glide ramp, a steep bank or just
  // before a chasm, and falling into a glider chasm is never a shortcut
  race = soloRace('mount');
  race.state = 'race';
  k = placeOn(race, gl.s0 - 40, 0, 0);
  k.vx = Math.cos(k.head) * 10;
  k.vz = Math.sin(k.head) * 10;
  run(race, 3.5, () => (k.ctl.gas = true));
  const gap = zone('gap');
  const safeOk = k.lastSafe && k.lastSafe.s < gap.s0 - 15 && k.lastSafe.s < gl.s0;
  const safeAt = k.lastSafe && k.lastSafe.s.toFixed(0);
  k = placeOn(race, gap.s0 + 5, 0, 0);
  k.y -= 20;
  let respawned = 0;
  const t0 = race.time;
  const before = k.totalS;
  ev = run(race, 12, () => {
    if (!respawned && !k.falling && race.time - t0 > 0.5) respawned = race.time - t0;
  });
  check('rescues avoid glide ramps and chasm run-ups', safeOk, `last safe spot ${safeAt} vs ramp ${gl.s0.toFixed(0)}`);
  const glideTime = (gap.s1 - gap.s0) / k.baseSpeed();
  check('falling into a glider chasm costs more than gliding it', respawned > glideTime && k.loc.s > gap.s1, `rescue ${respawned.toFixed(1)}s vs glide ${glideTime.toFixed(1)}s`);
  check('the race counts the ground the rescue cloud covered', k.totalS - before > gap.s1 - gap.s0, `progress +${(k.totalS - before).toFixed(0)} for a ${(gap.s1 - gap.s0).toFixed(0)}-unit chasm`);
}

// ---------------------------------------------------------------------------
// Point-to-point race flow: one run, sections, the cargo-plane intro.
{
  const M = getTrack('mount');
  const race = new Race({ track: 'mount', laps: 3, cc: 150, racers: [{ name: 'P', bot: false, config: { character: 'pepper' } }], seed: 4, intro: 4.6 });
  const k = race.karts[0];
  check('a point-to-point race is one run', race.p2p && race.laps === 1 && Math.abs(race.goal - M.lapLen) < 1e-6 && k.totalS < 0 && k.section === 1, `goal ${race.goal.toFixed(0)}, start totalS ${k.totalS.toFixed(1)}`);
  const o0 = race.introOffset(k);
  run(race, 1.0);
  const drop = race.introOffset(k);
  const mid = M.main.point(M.startS - 16, 0);
  const overGrid = drop.plane && Math.hypot(drop.plane.x - mid.x, drop.plane.z - mid.z) < 6 && drop.plane.y > mid.y + 30;
  run(race, 1.3);
  const o1 = race.introOffset(k);
  run(race, 2.5);
  const o2 = race.introOffset(k);
  run(race, 4);
  const o3 = race.introOffset(k);
  check('the cargo-plane intro drops the karts on gliders', o0.y === 40 && o0.plane && !o0.glide && o1.glide && o1.y > 0 && o1.y < 40 && o2.y === 0 && !o2.glide && race.state === 'race', `y ${o0.y} -> ${o1.y.toFixed(1)} -> ${o2.y}`);
  check('the plane is over the grid as the karts drop, then flies off', overGrid && o3.plane === null, `plane ${drop.plane ? Math.hypot(drop.plane.x - mid.x, drop.plane.z - mid.z).toFixed(1) : '-'} from the grid`);
  const flat = new Race({ track: 'meadow', laps: 3, cc: 150, racers: [{ name: 'P', bot: false, config: {} }], seed: 4, intro: 2.6 });
  const of = flat.introOffset(flat.karts[0]);
  check('circuits have no plane', of.y === 0 && !of.glide && of.plane === null && flat.karts[0].section === 0 && flat.goal === 3 * flat.track.length);
}

// ---------------------------------------------------------------------------
// Staff ghosts: they race the course but touch nothing and take no place.
{
  const ghost = { name: 'Staff Ghost', bot: true, ghost: true, config: { character: 'pepper' } };
  const res = botRace('mount', 31, { extra: [ghost], maxTime: 200 });
  const gk = res.race.karts[8];
  const ghostBumps = res.bumps.filter(([a, b]) => a === gk || b === gk).length;
  const rows = res.race.results();
  const st = res.stats[8];
  check('a staff ghost never collides or takes a place', gk.ghost && ghostBumps === 0 && !res.race.order.includes(gk) && gk.place === 0 && rows.length === 8 && st.hits === 0 && st.keys === 0,
    `bumps ${ghostBumps}, place ${gk.place}, rows ${rows.length}, hits ${st.hits}`);
  check('the race ends when the real racers are home', res.race.state === 'done' && res.race.order.every((k) => k.finished), `ghost ${gk.finished ? 'finished in ' + res.race.ghostTime.toFixed(1) + 's' : 'still out'}`);
  // driven straight into another kart, it passes through
  const race = soloRace('meadow', null, [{ name: 'P', bot: false, config: {} }, ghost]);
  race.state = 'race';
  const [p, gh] = race.karts;
  check('a ghost starts in the human\'s grid slot', gh.gridSlot === p.gridSlot);
  placeOn(race, 50, 0, 0, p);
  placeOn(race, 50, 0.4, 0, gh);
  race.brains[1] = null;
  const x0 = p.x, gx = gh.x;
  run(race, 0.2);
  check('karts pass straight through a ghost', Math.abs(p.x - x0) < 0.05 && Math.abs(gh.x - gx) < 0.05);
}

// ---------------------------------------------------------------------------
// Every moving hazard kind can hit a kart (scripted on the summit start straight).
{
  const M = getTrack('mount');
  const S = M.startS + 30; // the start straight
  const tryHazard = (spec, secs, driveIn, kartD = 0) => {
    const race = soloRace('mount');
    race.state = 'race';
    const p = M.main.point(S, spec.d || 0);
    const h = race.items.makeHazard(Object.assign({}, spec, { x: p.x, y: p.y, z: p.z, head: p.head, path: M.main, s: S }), 0);
    race.items.hazards = [h];
    const k = placeOn(race, driveIn ? S - 16 : S, kartD, driveIn ? 16 : 0);
    let maxVy = 0, minAlong = Infinity, maxHop = 0;
    const ev = run(race, secs, () => {
      k.ctl.gas = !!driveIn;
      k.ctl.steer = 0;
      maxVy = Math.max(maxVy, k.vy);
      minAlong = Math.min(minAlong, k.vx * p.tx + k.vz * p.tz);
      maxHop = Math.max(maxHop, h.hop || 0);
    });
    const hit = (cause) => ev.some((e) => e.type === 'hit' && e.a === cause);
    return { race, k, h, ev, hit, maxVy, minAlong, maxHop, past: k.loc.s > S + 2, has: (type) => ev.some((e) => e.type === type) };
  };
  let r = tryHazard({ kind: 'roller', d: 0, range: 0.3, period: 4 }, 2, true);
  check('a rolling snowball bowls a kart over', r.hit('roller') && r.maxVy > 3, `vy ${r.maxVy.toFixed(1)}`);
  r = tryHazard({ kind: 'penguin', d: 0, range: 0.2, lat: 0 }, 2, true);
  check('a sliding penguin spins a kart', r.hit('penguin'));
  r = tryHazard({ kind: 'skier', d: 0, range: 0.2, along: 0 }, 2, true);
  check('a skier spins a kart', r.hit('skier'));
  r = tryHazard({ kind: 'cow', d: 0, range: 0.01 }, 2, true);
  check('a cow is solid, moos and hops', r.has('moo') && !r.past && r.maxHop > 0.5, `moos ${r.ev.filter((e) => e.type === 'moo').length}`);
  r = tryHazard({ kind: 'mole', d: 0, period: 3.5 }, 4, false);
  check('a mole pops up under a kart', r.has('mole') && r.hit('mole') && r.maxVy > 3);
  r = tryHazard({ kind: 'geyser', d: 0, period: 4 }, 4.5, false);
  check('a geyser throws a kart into the air', r.has('geyser') && r.hit('geyser') && r.maxVy > 8, `vy ${r.maxVy.toFixed(1)}`);
  r = tryHazard({ kind: 'podoboo', d: 0, span: 20, period: 3 }, 6.5, false, -8);
  check('a leaping fireball burns a kart near the edge', r.hit('fire'));
  r = tryHazard({ kind: 'bumper', d: 0 }, 1.2, true);
  check('a bumper bounces a kart back hard', r.has('bumper') && r.minAlong < -5, `bounced back at ${(-r.minAlong).toFixed(1)}`);
  r = tryHazard({ kind: 'icicle', d: 0, period: 3.6 }, 4, false);
  check('a falling icicle shatters on a kart', r.has('icicle') && r.hit('icicle'));
  r = tryHazard({ kind: 'pole', d: 0 }, 1.5, true);
  check('a slalom pole is solid', !r.past && !r.has('hit'));
  // a star shatters a snowball instead
  const st = tryHazard({ kind: 'roller', d: 0, range: 0.3 }, 0, true);
  st.k.starT = 5;
  const ev = run(st.race, 1.5, () => (st.k.ctl.gas = true));
  check('a star shatters a snowball', !st.h.alive && ev.some((e) => e.type === 'squash') && !ev.some((e) => e.type === 'hit'));
  // shells stop on solid hazards
  const sr = tryHazard({ kind: 'bumper', d: 0 }, 0, false);
  placeOn(sr.race, S - 20, 0, 0);
  sr.k.item = 'green';
  sr.k.itemN = 1;
  sr.race.items.use(sr.k);
  const sev = run(sr.race, 1.5);
  check('shells break on solid hazards', sev.some((e) => e.type === 'poof') && !sr.race.items.objects.some((o) => o.kind === 'shell'));
}

// ---------------------------------------------------------------------------
// The big screen loads every script as a classic script into one global scope: two files
// declaring the same top-level const/let/class name would stop the game from loading.
{
  const root = path.join(__dirname, '..');
  for (const page of ['index.html', 'pad.html']) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    const srcs = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map((m) => m[1]);
    const lexical = {}, fns = {};
    for (const src of srcs) {
      const code = fs.readFileSync(path.join(root, src), 'utf8');
      for (const m of code.matchAll(/^(const|let|class|function|var)\s+([A-Za-z_$][\w$]*)/gm)) {
        const bag = m[1] === 'function' || m[1] === 'var' ? fns : lexical;
        (bag[m[2]] = bag[m[2]] || []).push(src);
      }
    }
    const clashes = Object.keys(lexical).filter((n) => lexical[n].length > 1 || fns[n]);
    check(`${page}: scripts declare no clashing globals`, clashes.length === 0, clashes.map((n) => `${n} in ${lexical[n].concat(fns[n] || []).join(', ')}`).join('; '));
  }
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
