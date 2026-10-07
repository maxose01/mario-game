// End-to-end smoke test: boots the game in headless Chromium and plays through every
// headline mechanic with real keyboard input (teleporting between set pieces to save time).
//
//   npm test            (runs reachability + this)
//   node tests/smoke.mjs [--shots dir]
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}

const here = path.dirname(fileURLToPath(import.meta.url));
const url = 'file://' + path.resolve(here, '..', 'index.html');
const shotsIdx = process.argv.indexOf('--shots');
const shots = shotsIdx > 0 ? process.argv[shotsIdx + 1] : null;

const results = [];
let diagnose = async () => '';
const check = async (name, ok, detail = '') => {
  results.push({ name, ok });
  if (!ok) detail = [detail, await diagnose()].filter(Boolean).join(' · ');
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

const G = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
async function until(fn, arg, timeout = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await G(fn, arg)) return true;
    await wait(50);
  }
  return false;
}
async function tap(key, ms = 80) {
  await page.keyboard.down(key);
  await wait(ms);
  await page.keyboard.up(key);
}
async function hold(keys, ms) {
  for (const k of keys) await page.keyboard.down(k);
  await wait(ms);
  for (const k of keys.slice().reverse()) await page.keyboard.up(k);
}
// Put the player's feet on top of tile row `ty + 1` at column tx.
async function tp(tx, ty, extra = {}) {
  await G(
    ([tx, ty, extra]) => {
      const L = window.clayGame.level, p = L.player;
      p.x = tx * 32 + 16 - p.w / 2;
      p.y = (ty + 1) * 32 - p.h;
      p.vx = 0;
      p.vy = 0;
      Object.assign(p, extra);
      L.snapCamera();
    },
    [tx, ty, extra],
  );
  await wait(120);
}
async function shot(name) {
  if (shots) await page.screenshot({ path: path.join(shots, name + '.png') });
}
async function startLevel(id, saveTweaks = {}) {
  await G(
    ([id, tw]) => {
      const g = window.clayGame;
      Object.assign(g.save, tw);
      g.startLevel(id);
    },
    [id, saveTweaks],
  );
  await wait(300);
}
diagnose = () =>
  G(() => {
    const g = window.clayGame, L = g.level;
    if (!L) return 'screen=' + g.state;
    const p = L.player;
    return `level=${L.id} state=${L.state}${L.message ? ' MESSAGE' : ''} p=(${p.x.toFixed(0)},${p.y.toFixed(0)}) v=(${p.vx.toFixed(2)},${p.vy.toFixed(2)}) power=${p.power} ground=${p.onGround} riding=${!!p.riding}`;
  });

await page.goto(url);
await G(() => localStorage.clear());
await page.reload();
await wait(800);

// ---- boot & title ----
await check('boots to the title screen', await G(() => window.clayGame.state === 'title'));
await shot('01-title');
await tap('KeyZ');
await check('new game opens the world map', await until(() => window.clayGame.state === 'map'));
await wait(900);
await shot('02-map');

// ---- map: walk to Puffball Meadow and enter ----
await hold(['ArrowRight'], 250);
await check('walks the map path to Puffball Meadow', await until(() => window.clayGame.map.node === 'l1' && !window.clayGame.map.walking));
await tap('KeyZ');
await check('enters level 1 from its map node', await until(() => window.clayGame.state === 'level' && window.clayGame.level.id === 'l1'));
await wait(700);

// ---- running and the P-meter ----
await G(() => (CFG.godMode = true)); // enemies can't interrupt the mechanic checks
await tp(66, 14);
await page.keyboard.down('KeyX');
await page.keyboard.down('ArrowRight');
const pFull = await until(() => window.clayGame.level.player.pFull, null, 3000);
await wait(400);
const speed = await G(() => window.clayGame.level.player.vx);
await page.keyboard.up('ArrowRight');
await page.keyboard.up('KeyX');
await check('holding run fills the P-meter', pFull, 'vx=' + speed.toFixed(2));
await check('a full P-meter reaches sprint speed', speed > 5);

// ---- blocks: coin block and mushroom ----
await tp(14, 14); // under the M block at (14,11)
const coins0 = await G(() => window.clayGame.save.coins);
await tap('KeyZ', 300);
await check(
  'head-bumping a mushroom block spawns a mushroom',
  await until(() => window.clayGame.level.player.power === 1 || window.clayGame.level.entities.some((e) => e.kind === 'mushroom')),
);
await until(() => window.clayGame.level.player.power === 1 || window.clayGame.level.entities.some((e) => e.kind === 'mushroom' && e.emerge === 0));
await G(() => {
  const L = window.clayGame.level;
  const m = L.entities.find((e) => e.kind === 'mushroom');
  if (!m) return; // already grabbed on the way up
  L.player.x = m.x;
  L.player.y = m.y + m.h - L.player.h;
});
await check('collecting the mushroom makes Pepper big', await until(() => window.clayGame.level.player.power === 1));
await wait(700);
await tp(12, 14); // under the ? block at (12,11)
await tap('KeyZ', 300);
await check('a coin block pays out a coin', await until((c0) => window.clayGame.save.coins > c0, coins0));

// ---- stomping ----
await G(() => {
  const L = window.clayGame.level;
  const e = L.entities.find((e) => e.constructor.name === 'Mudlet' && !e.dead);
  L.player.x = e.x + 3;
  L.player.y = e.y - L.player.h - 6;
  L.player.vy = 4;
  window.__stompTarget = e;
});
await check('stomping squashes a Mudlet', await until(() => window.__stompTarget.inert || window.__stompTarget.dead, null, 2000));

// ---- egg block, companion, riding and the tongue ----
await tp(36, 14);
await tap('KeyZ', 300);
await check('the egg block hatches Dumpling', await until(() => !!window.clayGame.level.companion, null, 4000));
await wait(300);
await G(() => {
  const L = window.clayGame.level, c = L.companion, p = L.player;
  p.x = c.cx - p.w / 2;
  p.y = c.y - p.h - 10;
  p.vy = 3;
});
await check('landing on Dumpling mounts it', await until(() => !!window.clayGame.level.player.riding));
await shot('03-riding');
// feed Dumpling a Mudlet
await G(() => {
  const L = window.clayGame.level, p = L.player;
  const e = L.entities.find((e) => e.constructor.name === 'Mudlet' && !e.dead && !e.inert);
  p.facing = 1;
  e.x = p.x + p.w + 30;
  e.y = p.y + p.h - e.h - 10;
  e.vx = 0;
  e.active = true;
  window.__food = e;
});
await tap('KeyX');
await check('the tongue grabs and swallows an enemy', await until(() => window.__food.dead, null, 2000));
await G(() => (window.clayGame.level.player.facing = 1));
await hold(['ArrowRight'], 60);
await tap('KeyC');
await check('spin button hops off Dumpling', await until(() => !window.clayGame.level.player.riding));
// send Dumpling home so Pepper doesn't land straight back in the saddle
await G(() => window.clayGame.level.companion && window.clayGame.level.companion.lost());
await wait(600);

// ---- feather, glide, takeoff ----
await tp(67, 14);
await tap('KeyZ', 250);
await check('the feather block releases a feather', await until(() => window.clayGame.level.entities.some((e) => e.constructor.name === 'Feather')));
await G(() => {
  const L = window.clayGame.level, f = L.entities.find((e) => e.constructor.name === 'Feather');
  f.phase = 'float';
  L.player.x = f.x;
  L.player.y = f.y;
});
await check('the feather gives Pepper a cape', await until(() => window.clayGame.level.player.power === 2));
await wait(500);
await tp(75, 5); // high above the runway
await page.keyboard.down('KeyZ');
await wait(700);
const glide = await G(() => ({ g: window.clayGame.level.player.gliding, vy: window.clayGame.level.player.vy }));
await page.keyboard.up('KeyZ');
await check('holding jump while falling glides with the cape', glide.g && glide.vy < 2, 'vy=' + glide.vy.toFixed(2));
await until(() => window.clayGame.level.player.onGround, null, 3000);
await tp(64, 14);
await page.keyboard.down('KeyX');
await page.keyboard.down('ArrowRight');
await until(() => window.clayGame.level.player.pFull, null, 3000);
await page.keyboard.down('KeyZ');
const tookOff = await until(() => window.clayGame.level.player.flight > 0, null, 1000);
await wait(600);
const y0 = await G(() => window.clayGame.level.player.y);
await shot('04-flying');
await page.keyboard.up('KeyZ');
await wait(400);
const soaring = await G(() => window.clayGame.level.player.flight === 2);
await page.keyboard.up('ArrowRight');
await page.keyboard.up('KeyX');
await check('a full P-meter plus jump takes off with the cape', tookOff && y0 < 14 * 32 - 60, 'y=' + Math.round(y0));
await check('releasing jump while holding run keeps soaring', soaring);
await until(() => window.clayGame.level.player.onGround, null, 5000);

// ---- cape spin ----
await G(() => {
  const L = window.clayGame.level, p = L.player;
  const e = L.entities.find((e) => e.constructor.name === 'Snail' && !e.dead && !e.ko);
  p.x = e.x - 22;
  p.y = e.y + e.h - p.h;
  p.vx = 0;
  e.vx = 0;
  e.active = true;
  window.__spinTarget = e;
});
await tap('KeyX');
await check('cape spin knocks out a nearby enemy', await until(() => window.__spinTarget.ko || window.__spinTarget.dead, null, 1500));

// ---- spring + key + keyhole (secret exit) ----
await tp(101, 13, { power: 2 });
await G(() => {
  const p = window.clayGame.level.player;
  p.y -= 40;
  p.vy = 3;
});
await page.keyboard.down('KeyZ');
const sprung = await until(() => window.clayGame.level.player.vy < -12, null, 1500);
await wait(900);
await page.keyboard.up('KeyZ');
await check('springs launch Pepper skyward', sprung);
await tp(111, 4);
await page.keyboard.down('KeyX');
await hold(['ArrowRight'], 250);
await check('holding run picks up the key', await until(() => (window.clayGame.level.player.carrying || {}).constructor?.name === 'Key', null, 1500));
await tp(134, 5, {});
await G(() => {
  const L = window.clayGame.level;
  L.player.positionCarried();
});
await hold(['ArrowRight'], 400);
await check('carrying the key into the keyhole opens the secret exit', await until(() => window.clayGame.level && window.clayGame.level.state === 'keyhole', null, 2500));
await page.keyboard.up('KeyX');
await shot('05-keyhole');
await check('the secret exit returns to the map', await until(() => window.clayGame.state === 'map', null, 8000));
await check('the secret exit is saved', await G(() => !!window.clayGame.save.exits['l1:secret']));
await wait(400);
await check('a new path to the switch palace is being revealed', await G(() => window.clayGame.map.reveal.some((r) => r.path.id === 'l1-palace') || !!window.clayGame.save.revealed['l1-palace']));
await until(() => window.clayGame.map.reveal.length === 0, null, 8000);
await shot('06-map-revealed');

// ---- palace switch ----
await startLevel('palace');
await tp(27, 11);
await hold(['ArrowRight'], 200);
await G(() => {
  const L = window.clayGame.level, p = L.player;
  const sw = L.entities.find((e) => e.constructor.name === 'BigSwitch');
  p.x = sw.cx - p.w / 2;
  p.y = sw.y - p.h - 30;
  p.vy = 2;
});
await check('stomping the big switch turns it on', await until(() => window.clayGame.save.switchOn, null, 3000));
for (let i = 0; i < 6 && !(await G(() => window.clayGame.state === 'map')); i++) {
  await tap('KeyZ');
  await wait(700);
}
await check('the palace sends you back to the map', await until(() => window.clayGame.state === 'map', null, 8000));

// ---- goal gate (normal exit) ----
await startLevel('l1');
await tp(194, 14);
await hold(['ArrowRight'], 1200);
await check('crossing the goal gate clears the course', await until(() => window.clayGame.level && ['clear'].includes(window.clayGame.level.state), null, 3000));
await shot('07-clear');
await check('course clear returns to the map', await until(() => window.clayGame.state === 'map', null, 12000));
await check('the normal exit unlocks the next path', await G(() => !!window.clayGame.save.exits['l1:normal']));
await until(() => window.clayGame.map.reveal.length === 0, null, 8000);

// ---- dying ----
await G(() => (CFG.godMode = false));
const lives0 = await G(() => window.clayGame.save.lives);
await startLevel('l1');
await tp(23, 18);
await check('falling into the clouds costs a life', await until((l0) => window.clayGame.state === 'map' && window.clayGame.save.lives === l0 - 1, lives0, 9000));

// ---- level 2 & 3 load and render ----
await G(() => (CFG.godMode = true));
await startLevel('l2', { switchOn: true });
await tp(130, 4);
await shot('08-l2-sky');
await check('Gusty Glade loads with switch blocks solid', await G(() => window.clayGame.level.q.solidAt(119, 11)));
await startLevel('l3', { switchOn: false });
await check('Thunderhead Keep loads with switch blocks as outlines', await G(() => !window.clayGame.level.q.solidAt(99, 9)));
// lock blocks crumble when a key touches them
await G(() => {
  const L = window.clayGame.level;
  const k = new Key(L, 0, 0);
  k.x = 123 * 32 + 8;
  k.y = 14 * 32;
  L.spawn(k);
});
await check('a key dissolves lock blocks', await until(() => window.clayGame.level.q.tile(124, 15) === '.', null, 2000));

// ---- boss ----
await G(() => (CFG.bossHP = 2));
await tp(212, 18);
await hold(['ArrowRight'], 300);
await check('the King Mudlet wakes when you enter the arena', await until(() => window.clayGame.level.bossActive, null, 3000));
await shot('09-boss');
for (let i = 0; i < 2; i++) {
  await until(() => window.clayGame.level.boss.hurtT === 0, null, 3000);
  await G(() => {
    const L = window.clayGame.level, b = L.boss, p = L.player;
    p.x = b.cx - p.w / 2;
    p.y = b.y - p.h - 8;
    p.vy = 4;
    p.invuln = 200;
  });
  await until((n) => window.clayGame.level.boss.hp <= n, 1 - i, 1500);
}
await check('stomping the King Mudlet defeats him', await until(() => window.clayGame.level.boss.state === 'dying' || window.clayGame.level.boss.dead, null, 3000));
await check('the boss leaves a goal orb', await until(() => window.clayGame.level.entities.some((e) => e.constructor.name === 'GoalOrb'), null, 5000));
await G(() => {
  const L = window.clayGame.level, o = L.entities.find((e) => e.constructor.name === 'GoalOrb');
  o.age = 99;
  L.player.x = o.x;
  L.player.y = o.y;
});
await check('touching the orb clears the keep', await until(() => window.clayGame.level && window.clayGame.level.state === 'clear', null, 3000));
await G(() => (CFG.bossHP = CFG_DEFAULTS.bossHP));

// ---- Edit Panel ----
await page.keyboard.press('Tab');
await check('Tab opens the Edit Panel', await G(() => !document.getElementById('editPanel').hidden));
await page.click('summary >> text=Jumping');
await page.fill('#cfg-gravity-n', '0.4');
await page.dispatchEvent('#cfg-gravity-n', 'change');
await check('editing a value updates the live config', await G(() => CFG.gravity === 0.4));
await page.locator('#cfg-gravity').fill('0.9');
await check('dragging a slider updates the live config', await G(() => CFG.gravity === 0.9));
await page.click('.chip >> text=Moon Clay');
await check('presets apply several settings at once', await G(() => CFG.gravity === PRESETS['Moon Clay'].gravity));
await shot('10-edit-panel');
await page.click('#epResetAll');
await check('reset restores defaults', await G(() => CFG.gravity === CFG_DEFAULTS.gravity));
await page.click('#epClose');

await check('no runtime errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nAll ${results.length} checks passed.`);
process.exit(failed ? 1 : 0);
