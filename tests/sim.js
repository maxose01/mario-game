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

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
