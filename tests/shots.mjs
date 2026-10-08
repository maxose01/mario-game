// Screenshot harness: boots the party server and headless Chromium, starts a race on a course
// and photographs the chase camera at chosen spots along the road. For eyeballing scenery,
// hazards and effects without driving there by hand.
//
//   node tests/shots.mjs --track mount --at 100,600,1200 --out /tmp/shots
//   node tests/shots.mjs --track meadow --at log:0.5 --gas --wait 2000
//   node tests/shots.mjs --track mount --intro --out /tmp/shots     (frames of the intro)
//   node tests/shots.mjs --title --lobby --out /tmp/shots            (menus)
//
// Options: --track id, --at list of s values on the main road or path:u on a branch,
//   --d lateral offset, --speed initial speed, --gas (hold the gas), --wait ms per spot,
//   --players 1..4 (split screen), --bots 0 to race alone, --w/--h viewport, --perf (draw calls
//   and triangles per shot), --intro, --title, --lobby, --eval "js" (run in the page after the
//   race starts), --out dir (default ./shots).
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
let pw;
try {
  pw = require('playwright');
} catch (e) {
  pw = require('/opt/node22/lib/node_modules/playwright');
}
const { chromium } = pw;

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const track = opt('track', null);
const at = String(opt('at', '')).split(',').filter(Boolean);
const out = path.resolve(opt('out', 'shots'));
const W = Number(opt('w', 1280)), H = Number(opt('h', 720));
const waitMs = Number(opt('wait', 1000));
const players = Number(opt('players', 1));
const bots = opt('bots', '1') !== '0';
const lateral = Number(opt('d', 0));
const speed = Number(opt('speed', 0));
fs.mkdirSync(out, { recursive: true });

const PORT = 8000 + Math.floor(Math.random() * 900);
const BASE = `http://localhost:${PORT}/`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, [path.join(root, 'server.js')], { env: { ...process.env, PORT: String(PORT), QUIET: '1' }, stdio: 'ignore' });
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(BASE + 'api/info')).ok) break;
  } catch (e) {
    /* not up yet */
  }
  await wait(100);
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await ctx.addInitScript(() => {
    try {
      localStorage.clear();
      localStorage.setItem('claykart.params.v1', JSON.stringify({ autoRes: false }));
    } catch (e) {
      /* storage blocked */
    }
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(BASE);
  await page.waitForFunction(() => typeof App !== 'undefined' && App.screen === 'title', null, { timeout: 20000 });
  const snap = async (name) => {
    const file = path.join(out, name + '.png');
    await page.screenshot({ path: file });
    let perf = '';
    if (opt('perf', false)) {
      const info = await page.evaluate(() => {
        const r = App.renderer.info.render;
        return { calls: r.calls, tris: r.triangles, geos: App.renderer.info.memory.geometries, tex: App.renderer.info.memory.textures };
      });
      perf = `  calls ${info.calls} tris ${info.tris} geometries ${info.geos} textures ${info.tex}`;
    }
    console.log('shot', file + perf);
  };
  if (opt('title', false)) {
    await wait(2500);
    await snap('title');
  }
  if (opt('lobby', false)) {
    await page.evaluate(() => App.menu('lobby'));
    await wait(1500);
    await snap('lobby');
    await page.evaluate(() => App.go('title'));
  }
  if (track) {
    const t0 = Date.now();
    await page.evaluate(
      ({ track, players, bots }) => {
        App.menu('quick');
        for (let i = 1; i < players; i++) Party.localJoin(i === 1 ? 'kb2' : 'touch');
        Party.settings.track = track;
        Party.settings.bots = bots;
        App.startRace();
      },
      { track, players, bots },
    );
    console.log(`race started on ${track} in ${Date.now() - t0} ms (includes building the 3D world)`);
    if (opt('intro', false)) {
      for (let i = 0; i < 6; i++) {
        await snap(`${track}-intro-${i}`);
        await wait(700);
      }
    }
    await page.evaluate(() => {
      const r = App.race;
      r.introT = 0;
      r.state = 'race';
      r.count = 0;
    });
    if (opt('eval', false)) console.log('eval:', await page.evaluate(opt('eval')));
    if (opt('gas', false)) await page.keyboard.down('ArrowUp');
    for (const spot of at.length ? at : ['start']) {
      await page.evaluate(
        ({ spot, lateral, speed }) => {
          const r = App.race, T = r.track, k = r.karts[0];
          let p;
          if (spot === 'start') p = T.main.point(T.startS - 7, 0);
          else if (spot.includes(':')) {
            const [id, u] = spot.split(':');
            const path = T.byId[id];
            p = path.point(path.length * Number(u), lateral);
          } else p = T.main.point(Number(spot), lateral);
          k.setPos(p.x, p.y + 0.05, p.z, p.head);
          k.vx = Math.cos(p.head) * speed;
          k.vz = Math.sin(p.head) * speed;
          for (const v of App.view.views) App.view.snapCam(v);
        },
        { spot, lateral, speed },
      );
      await wait(waitMs);
      await snap(`${track}-${spot.replace(':', '-')}`);
    }
  }
} finally {
  await browser.close();
  server.kill();
}
if (errors.length) {
  console.log('PAGE ERRORS:\n  ' + errors.slice(0, 20).join('\n  '));
  process.exitCode = 1;
}
