'use strict';
// The garage catalogue: racers, kart bodies, wheels and paint, with their stats and prices.
// Shared by the big screen (store, physics, 3D models) and the phone (configurator UI).

// Stats run 0..6. Racers set the base; bodies and wheels nudge it.
const STAT_KEYS = ['speed', 'accel', 'weight', 'handling', 'traction', 'turbo'];
const STAT_LABELS = { speed: 'Speed', accel: 'Acceleration', weight: 'Weight', handling: 'Handling', traction: 'Traction', turbo: 'Mini-turbo' };

const CHARACTERS = [
  {
    id: 'pepper', name: 'Pepper', price: 0, size: 'Medium',
    blurb: 'The red-capped hero of the Clay Isles. Good at everything.',
    stats: { speed: 3, accel: 3, weight: 3, handling: 3, traction: 3, turbo: 3 },
    col: { skin: '#f6c4a0', main: '#e2483d', second: '#3d6fd6', accent: '#7a4a2b', hair: '#6b3d24' },
  },
  {
    id: 'dumpling', name: 'Dumpling', price: 0, size: 'Heavy',
    blurb: 'A rideable clay dino who prefers to do the driving himself.',
    stats: { speed: 3.5, accel: 2.5, weight: 4, handling: 2.75, traction: 3.25, turbo: 2.5 },
    col: { skin: '#5ec4a8', main: '#ffe0b8', second: '#8d6fd8', accent: '#ff6b4a', hair: '#ff9d3d' },
  },
  {
    id: 'shelly', name: 'Shelly', price: 0, size: 'Light',
    blurb: 'Snails are slow. Shelly is not a normal snail.',
    stats: { speed: 2.5, accel: 4, weight: 2, handling: 3.75, traction: 3, turbo: 3.75 },
    col: { skin: '#cddc6c', main: '#ec7d8c', second: '#ffd166', accent: '#b25a6a', hair: '#9fb04a' },
  },
  {
    id: 'thornbun', name: 'Thornbun', price: 60, size: 'Medium',
    blurb: 'A prickly bunny. Bump into it at your own risk.',
    stats: { speed: 2.75, accel: 3.5, weight: 2.75, handling: 3.5, traction: 2.75, turbo: 3.75 },
    col: { skin: '#7470d6', main: '#ffb347', second: '#fff1d6', accent: '#4a4699', hair: '#ffb347' },
  },
  {
    id: 'flapper', name: 'Flapper', price: 80, size: 'Light',
    blurb: 'Would rather be flying, but kart wheels are almost as good.',
    stats: { speed: 2.25, accel: 4.25, weight: 1.5, handling: 4.25, traction: 3.25, turbo: 3.25 },
    col: { skin: '#5cc6ea', main: '#fffaf0', second: '#ffb347', accent: '#2f8bb0', hair: '#ff86b6' },
  },
  {
    id: 'mudlet', name: 'King Mudlet', price: 150, size: 'Heavy',
    blurb: 'The boss of Thunderhead Keep. Heavy crown, heavier foot.',
    stats: { speed: 4.25, accel: 1.75, weight: 5, handling: 2, traction: 3, turbo: 2.25 },
    col: { skin: '#b8693e', main: '#ffcc3d', second: '#e2483d', accent: '#5b3524', hair: '#ffcc3d' },
  },
];

const BODIES = [
  { id: 'classic', name: 'Clay Classic', price: 0, blurb: 'A rounded tub with a proud little spoiler.', mod: {} },
  { id: 'bubble', name: 'Bubble Buggy', price: 0, blurb: 'Light and bouncy. Gets going in a blink.', mod: { speed: -0.25, accel: 0.5, handling: 0.25, weight: -0.25 } },
  { id: 'teacup', name: 'Teacup Racer', price: 60, blurb: 'Spins on a saucer. Corners like a dream.', mod: { speed: -0.5, accel: 0.5, handling: 0.75, weight: -0.5, turbo: 0.25 } },
  { id: 'mudtank', name: 'Mud Tank', price: 90, blurb: 'Heavy as a hill. Nobody pushes it around.', mod: { speed: 0.5, accel: -0.5, weight: 1, handling: -0.25, traction: 0.25 } },
  { id: 'pipe', name: 'Pipe Dream', price: 120, blurb: 'Long, low and loud. Twin exhaust pipes.', mod: { speed: 0.75, accel: -0.25, handling: -0.5, turbo: -0.25 } },
  { id: 'rocket', name: 'Comet Sled', price: 180, blurb: 'A pointy sled with a fin. Drift sparks love it.', mod: { speed: 0.5, accel: -0.25, handling: -0.25, turbo: 0.75, weight: -0.25 } },
];

const WHEELS = [
  { id: 'standard', name: 'Clay Rollers', price: 0, blurb: 'Round, reliable, slightly lumpy.', mod: {} },
  { id: 'button', name: 'Button Wheels', price: 40, blurb: 'Sewing buttons. Quick off the line.', mod: { speed: -0.25, accel: 0.5, handling: 0.25, traction: -0.25 } },
  { id: 'monster', name: 'Monster Lumps', price: 70, blurb: 'Huge knobbly tyres that laugh at grass.', mod: { speed: -0.25, accel: -0.25, weight: 0.5, traction: 1 } },
  { id: 'slick', name: 'Slick Rings', price: 90, blurb: 'Thin and fast. Slippery when it counts.', mod: { speed: 0.5, accel: -0.25, handling: 0.25, traction: -0.75 } },
];

const PAINTS = [
  { id: 'cherry', name: 'Cherry', price: 0, color: '#e2483d' },
  { id: 'sky', name: 'Sky', price: 0, color: '#4f9cf0' },
  { id: 'mint', name: 'Mint', price: 0, color: '#4fc79a' },
  { id: 'sunflower', name: 'Sunflower', price: 0, color: '#f7c331' },
  { id: 'tangerine', name: 'Tangerine', price: 20, color: '#ff8a3d' },
  { id: 'grape', name: 'Grape', price: 20, color: '#8d6fd8' },
  { id: 'bubblegum', name: 'Bubblegum', price: 20, color: '#ff86b6' },
  { id: 'cocoa', name: 'Cocoa', price: 25, color: '#8a5a3c' },
  { id: 'midnight', name: 'Midnight', price: 30, color: '#3f3270' },
  { id: 'gold', name: 'Gold Leaf', price: 150, color: '#ffcf40', special: 'gold' },
  { id: 'rainbow', name: 'Rainbow', price: 250, color: '#ff6f91', special: 'rainbow' },
];

const CATALOG = { character: CHARACTERS, body: BODIES, wheels: WHEELS, paint: PAINTS };
const CATALOG_KINDS = ['character', 'body', 'wheels', 'paint'];
const KIND_LABELS = { character: 'Racer', body: 'Kart', wheels: 'Wheels', paint: 'Paint' };

const DEFAULT_KART = { character: 'pepper', body: 'classic', wheels: 'standard', paint: 'cherry' };

function findPart(kind, id) {
  const list = CATALOG[kind];
  if (!list) return null;
  return list.find((p) => p.id === id) || null;
}

// Fill in anything missing or unknown so a config from a phone or an old save is always valid.
function sanitizeKart(cfg) {
  const out = {};
  for (const k of CATALOG_KINDS) out[k] = cfg && findPart(k, cfg[k]) ? cfg[k] : DEFAULT_KART[k];
  return out;
}

function partKey(kind, id) {
  return kind + ':' + id;
}

// Everything that costs nothing is always owned.
function freeParts() {
  const out = {};
  for (const k of CATALOG_KINDS) for (const p of CATALOG[k]) if (!p.price) out[partKey(k, p.id)] = true;
  return out;
}

function kartStats(cfg) {
  cfg = sanitizeKart(cfg);
  const ch = findPart('character', cfg.character);
  const out = {};
  for (const s of STAT_KEYS) out[s] = ch.stats[s];
  for (const kind of ['body', 'wheels']) {
    const m = findPart(kind, cfg[kind]).mod;
    for (const s in m) out[s] += m[s];
  }
  for (const s of STAT_KEYS) out[s] = Math.max(0.5, Math.min(6, out[s]));
  return out;
}

// Stats -> physics multipliers used by the kart simulation.
function kartTuning(cfg) {
  const st = kartStats(cfg);
  return {
    speed: 0.93 + st.speed * 0.022,
    accel: 0.72 + st.accel * 0.1,
    mass: 0.6 + st.weight * 0.14,
    handling: 0.84 + st.handling * 0.055,
    grip: 0.82 + st.traction * 0.07,
    offroad: st.traction * 0.035,
    turbo: 0.8 + st.turbo * 0.08,
    stats: st,
  };
}

// A random but stylish config for a bot.
function randomKart(rnd, avoid) {
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  let ch = pick(CHARACTERS);
  for (let i = 0; i < 6 && avoid && avoid.includes(ch.id); i++) ch = pick(CHARACTERS);
  return { character: ch.id, body: pick(BODIES).id, wheels: pick(WHEELS).id, paint: pick(PAINTS.filter((p) => !p.special)).id };
}

const ITEM_INFO = {
  mushroom: { name: 'Mushroom', hint: 'A burst of speed' },
  triple: { name: 'Triple Mushroom', hint: 'Three bursts of speed' },
  banana: { name: 'Banana', hint: 'Drop it behind you (or throw it ahead)' },
  green: { name: 'Green Shell', hint: 'Fires straight and bounces off walls' },
  red: { name: 'Red Shell', hint: 'Homes in on the racer ahead' },
  bomb: { name: 'Clay Bomb', hint: 'Lob it ahead; it bursts after a moment' },
  star: { name: 'Star', hint: 'Invincible and extra fast' },
  coin: { name: 'Coin Pouch', hint: 'Two coins: a little more top speed' },
};
