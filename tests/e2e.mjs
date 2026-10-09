// End-to-end party test: starts the real server, opens the big screen and two emulated phones in
// headless Chromium, and plays a party race with real phone input over the WebSocket relay, then
// starts the point-to-point mountain run and follows its sections on the phone.
//
//   npm run test:e2e
//   node tests/e2e.mjs [--shots dir]
import { createRequire } from 'module';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
let pw;
try {
  pw = require('playwright');
} catch (e) {
  pw = require('/opt/node22/lib/node_modules/playwright');
}
const { chromium, devices } = pw;

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const PORT = 8000 + Math.floor(Math.random() * 900);
const BASE = `http://localhost:${PORT}/`;
const shotsIdx = process.argv.indexOf('--shots');
const shots = shotsIdx > 0 ? process.argv[shotsIdx + 1] : null;

const results = [];
const check = (name, ok, detail = '') => {
  results.push(!!ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- server ----
const server = spawn(process.execPath, [path.join(root, 'server.js')], { env: { ...process.env, PORT: String(PORT), QUIET: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
let serverErr = '';
server.stderr.on('data', (d) => (serverErr += d));
for (let i = 0; i < 50; i++) {
  try {
    const r = await fetch(BASE + 'api/info');
    if (r.ok) break;
  } catch (e) {
    /* not up yet */
  }
  await wait(100);
}
const info = await (await fetch(BASE + 'api/info')).json();
check('server answers /api/info', info.app === 'clay-kart');
const blocked = await fetch(BASE + '.git/config');
check('server refuses dotfiles', blocked.status === 403 || blocked.status === 404);

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const watch = (page, tag) => {
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`);
  });
};
const shot = async (page, name) => {
  if (shots) await page.screenshot({ path: path.join(shots, name + '.png') });
};

try {
  // ---- big screen ----
  const hostCtx = await browser.newContext({ viewport: { width: 1024, height: 640 } });
  await hostCtx.addInitScript(() => {
    try {
      if (!sessionStorage.getItem('e2e')) {
        localStorage.clear();
        localStorage.setItem('claykart.params.v1', JSON.stringify({ renderScale: 0.5, autoRes: false, particles: 0.3 }));
        sessionStorage.setItem('e2e', '1');
      }
    } catch (e) {
      /* storage blocked */
    }
  });
  const host = await hostCtx.newPage();
  watch(host, 'screen');
  await host.goto(BASE);
  await host.waitForFunction(() => typeof App !== 'undefined' && App.screen === 'title' && App.demo, null, { timeout: 30000 });
  check('title screen with an attract-mode race', await host.evaluate(() => App.demo.karts.length === 8 && !!App.demoView));
  await shot(host, 'title');

  await host.click('text=Party Race');
  await host.waitForFunction(() => Party.code && Party.joinUrl, null, { timeout: 15000 });
  const code = await host.evaluate(() => Party.code);
  check('party room opened', /^[A-Z]{4}$/.test(code), code);
  check('QR code drawn', await host.evaluate(() => {
    const c = document.getElementById('qr');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 100) dark++;
    return dark > 500;
  }));
  const joinUrl = (await host.evaluate(() => Party.joinUrl)).replace(/\/\/[^/]+\//, `//localhost:${PORT}/`);
  check('join link points at the controller', joinUrl.includes('pad.html?room=' + code), joinUrl);

  // ---- phones ----
  const phones = [];
  for (const name of ['Ana', 'Bo']) {
    const ctx = await browser.newContext({ ...devices['Pixel 7'] });
    // record what the controller asks the vibration motor to do
    await ctx.addInitScript(() => {
      window.__vib = [];
      Object.defineProperty(Navigator.prototype, 'vibrate', { configurable: true, value: (p) => (window.__vib.push(p), true) });
    });
    const ph = await ctx.newPage();
    watch(ph, 'phone ' + name);
    await ph.goto(joinUrl);
    check(`${name}'s phone prefilled the room code`, (await ph.inputValue('#code')) === code);
    await ph.fill('#name', name);
    await ph.click('text=Join the race');
    await ph.waitForSelector('#v-lobby:not([hidden])', { timeout: 10000 });
    phones.push(ph);
  }
  await host.waitForFunction(() => Party.list().length === 2, null, { timeout: 5000 });
  const slots = await host.evaluate(() => Party.list().map((p) => `${p.slot}:${p.name}:${p.kind}`));
  check('both phones took a seat', slots.join() === '0:Ana:phone,1:Bo:phone', slots.join());
  check('first phone is the race leader', await phones[0].isVisible('#leadCard'));
  check('second phone is not the leader', !(await phones[1].isVisible('#leadCard')));

  // ---- the big screen reloads: same room, phones come straight back ----
  await host.reload();
  await host.waitForFunction(() => typeof App !== 'undefined' && Party.code, null, { timeout: 30000 });
  check('a reloaded big screen reopens the same room', (await host.evaluate(() => Party.code)) === code);
  await host.waitForFunction(() => Party.list().length === 2, null, { timeout: 10000 }).catch(() => {});
  check('phones rejoin a reloaded big screen', (await host.evaluate(() => Party.list().map((p) => p.name).join())) === 'Ana,Bo');
  await host.click('text=Party Race');
  await host.waitForFunction(() => App.screen === 'lobby', null, { timeout: 5000 });

  // ---- garage on the phone ----
  const [ana, bo] = phones;
  await bo.click('#tabs button[data-kind="character"]');
  await bo.click('#parts .part:has-text("Dumpling")');
  await bo.click('#tabs button[data-kind="paint"]');
  const bankBefore = await host.evaluate(() => Save.data.bank);
  await bo.click('#parts .part:has-text("Tangerine")');
  await host.waitForFunction(() => Save.owns('paint', 'tangerine'), null, { timeout: 5000 });
  await bo.click('#parts .part:has-text("Tangerine")');
  await host.waitForFunction(() => Party.players[1].config.paint === 'tangerine', null, { timeout: 5000 });
  const cfg = await host.evaluate(() => Party.players[1].config);
  check('phone changes the racer', cfg.character === 'dumpling', JSON.stringify(cfg));
  check('phone buys a paint from the shared bank', (await host.evaluate(() => Save.data.bank)) === bankBefore - 20, `bank ${bankBefore} -> ${await host.evaluate(() => Save.data.bank)}`);
  await bo.click('#parts .part:has-text("Gold Leaf")');
  await wait(400);
  check('cannot buy what the bank cannot afford', !(await host.evaluate(() => Save.owns('paint', 'gold'))));

  // ---- leader settings & ready ----
  await ana.click('#tracks button:has-text("Sherbet Slopes")');
  await ana.click('#sLaps button[data-v="1"]');
  await host.waitForFunction(() => Party.settings.track === 'sherbet' && Party.settings.laps === 1, null, { timeout: 5000 });
  check('leader phone picks the course and laps', true);
  for (const ph of phones) await ph.click('#readyBtn');
  await host.waitForFunction(() => Party.list().every((p) => p.ready), null, { timeout: 5000 });
  check('ready states reach the big screen', true);
  await wait(600);
  await shot(host, 'lobby');
  await shot(ana, 'phone-lobby');

  await ana.click('#leadStart');
  await host.waitForFunction(() => App.screen === 'race' && App.race, null, { timeout: 15000 });
  await ana.waitForSelector('#v-race:not([hidden])', { timeout: 10000 });
  check('leader phone starts the race', true);
  check('two-player split screen', await host.evaluate(() => App.view.views.length === 2 && App.race.karts.length === 8));
  check('race is on Sherbet Slopes, 1 lap', await host.evaluate(() => App.race.track.id === 'sherbet' && App.race.laps === 1));
  // run the intro and countdown with the phones' real (auto-gas) controls
  const stalls = await host.evaluate(() => {
    const r = App.race;
    let stalls = 0;
    while (r.state !== 'race') {
      Party.readControls();
      App.applyControls();
      r.update(1 / 60);
      for (const e of r.drainEvents()) if (e.type === 'stall' && !e.kart.bot) stalls++;
    }
    return stalls;
  });
  check('auto-gas phones do not flood the engine on the grid', stalls === 0, `${stalls} stalls`);

  // ---- phone input ----
  const steerBox = await ana.locator('#steer').boundingBox();
  const cx = steerBox.x + steerBox.width / 2, cy = steerBox.y + steerBox.height / 2;
  await ana.mouse.move(cx, cy);
  await ana.mouse.down();
  await ana.mouse.move(cx + 140, cy, { steps: 4 });
  await host.waitForFunction(() => Party.players[0].ctl.steer > 0.6, null, { timeout: 5000 }).catch(() => {});
  check('drag steering reaches the kart', (await host.evaluate(() => Party.players[0].ctl.steer)) > 0.6, `steer ${await host.evaluate(() => Party.players[0].ctl.steer)}`);
  await ana.mouse.up();
  await host.waitForFunction(() => Math.abs(Party.players[0].ctl.steer) < 0.05, null, { timeout: 5000 }).catch(() => {});
  check('letting go centres the wheel', Math.abs(await host.evaluate(() => Party.players[0].ctl.steer)) < 0.05);
  check('auto-gas is on for phones', await host.evaluate(() => Party.players[0].ctl.gas === true));
  const drift = ana.locator('.b-drift');
  const db = await drift.boundingBox();
  await ana.mouse.move(db.x + db.width / 2, db.y + db.height / 2);
  await ana.mouse.down();
  await host.waitForFunction(() => Party.players[0].ctl.drift, null, { timeout: 5000 }).catch(() => {});
  check('holding Drift reaches the kart', await host.evaluate(() => Party.players[0].ctl.drift));
  await ana.mouse.up();
  await host.evaluate(() => {
    const k = App.race.karts[Party.players[0].kartIdx];
    k.item = 'mushroom';
    k.itemN = 1;
  });
  await ana.click('.b-item');
  await host.waitForFunction(() => App.race.karts[Party.players[0].kartIdx].item === null, null, { timeout: 5000 }).catch(() => {});
  check('Item button fires the item', await host.evaluate(() => App.race.karts[Party.players[0].kartIdx].item === null));
  // Y throws the item backwards
  await host.evaluate(() => {
    const k = App.race.karts[Party.players[0].kartIdx];
    k.item = 'green';
    k.itemN = 1;
    k.itemCooldown = 0;
  });
  await ana.click('.b-back');
  await host.waitForFunction(() => App.race.karts[Party.players[0].kartIdx].item === null, null, { timeout: 5000 }).catch(() => {});
  const thrown = await host.evaluate(() => {
    const k = App.race.karts[Party.players[0].kartIdx];
    const o = App.race.items.objects.filter((q) => q.kind === 'shell' && q.owner === k).pop();
    return o ? o.vx * Math.cos(k.head) + o.vz * Math.sin(k.head) : null;
  });
  check('Y throws the item backwards', thrown !== null && thrown < 0, `shell speed along the kart ${thrown}`);

  // ---- haptics ----
  const vibs = () => ana.evaluate(() => window.__vib.splice(0));
  await vibs();
  await ana.click('.b-brake');
  check('a key press clicks the vibration motor', (await vibs()).some((p) => Array.isArray(p) && p.length === 1 && p[0] <= 10));
  await host.evaluate(() => App.race.emit('wall', App.race.karts[Party.players[0].kartIdx], 20));
  await ana.waitForFunction(() => window.__vib.some((p) => Array.isArray(p) && p[0] === 68), null, { timeout: 4000 }).catch(() => {});
  const wallBuzz = await vibs();
  check('a hard wall hit jolts the phone (68 ms, then a rebound)', wallBuzz.some((p) => Array.isArray(p) && p[0] === 68 && p.length === 3), JSON.stringify(wallBuzz.slice(-3)));
  // hold Brake at speed: the phone judders with a pulse train until the kart has slowed down
  const bb = await ana.locator('.b-brake').boundingBox();
  await ana.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await ana.mouse.down();
  await host.evaluate(() => {
    const k = App.race.karts[Party.players[0].kartIdx];
    k.vx = Math.cos(k.head) * 26;
    k.vz = Math.sin(k.head) * 26;
  });
  await ana.waitForFunction(() => window.__vib.some((p) => Array.isArray(p) && p.length >= 6), null, { timeout: 4000 }).catch(() => {});
  await ana.mouse.up();
  const judder = (await vibs()).find((p) => Array.isArray(p) && p.length >= 6);
  check('braking at speed judders the phone with a pulse train', !!judder, JSON.stringify(judder || []).slice(0, 80));
  // haptics off: the motor stays still
  await ana.evaluate(() => Buzz.setLevel('off'));
  await vibs();
  await host.evaluate(() => App.race.emit('wall', App.race.karts[Party.players[0].kartIdx], 20));
  await ana.waitForTimeout(500);
  const silent = (await vibs()).filter((p) => p !== 0 && !(Array.isArray(p) && p.length === 1 && p[0] === 0));
  check('with haptics off the phone stays still', silent.length === 0, JSON.stringify(silent));
  await ana.evaluate(() => Buzz.setLevel('full'));
  await host.waitForFunction(() => {
    const t = document.getElementById('hLap');
    return true;
  });
  await ana.waitForFunction(() => document.getElementById('hPlace').textContent !== '–', null, { timeout: 5000 });
  check('phone shows live position', /^\d(st|nd|rd|th)$/.test(await ana.textContent('#hPlace')), await ana.textContent('#hPlace'));
  await shot(host, 'split-screen');
  await shot(ana, 'phone-controller');

  // ---- drop out and come back ----
  await bo.reload();
  await host.waitForFunction(() => App.race.karts[Party.players[1].kartIdx].auto === true || Party.players[1].connected === false, null, { timeout: 8000 }).catch(() => {});
  await host.waitForFunction(() => Party.players[1] && Party.players[1].connected && !App.race.karts[Party.players[1].kartIdx].auto, null, { timeout: 15000 }).catch(() => {});
  check('a phone that reloads gets its kart back', await host.evaluate(() => Party.list().length === 2 && Party.players[1].name === 'Bo' && Party.players[1].connected && !App.race.karts[Party.players[1].kartIdx].auto));
  await bo.waitForSelector('#v-race:not([hidden])', { timeout: 10000 }).catch(() => {});
  check('rejoined phone goes straight back to the controller', await bo.isVisible('#v-race'));

  // ---- finish ----
  await host.evaluate(() => {
    const r = App.race;
    for (const k of r.karts) r.setAutopilot(k, true);
    let n = 0;
    while (r.state !== 'done' && n < 60 * 240) {
      r.update(1 / 60);
      n++;
    }
  });
  await host.waitForFunction(() => App.screen === 'results', null, { timeout: 40000 });
  const res = await host.evaluate(() => ({ rows: App.lastResults.length, bank: Save.data.bank, races: Save.data.races }));
  check('results with every racer', res.rows === 8, JSON.stringify(res));
  check('race coins go into the bank', res.bank > bankBefore - 20 && res.races === 1);
  await ana.waitForSelector('#v-results:not([hidden])', { timeout: 10000 });
  check('phones show their result', /\d(st|nd|rd|th)/.test(await ana.textContent('#rPlace')));
  check('leader phone gets the next-race buttons', await ana.isVisible('#rLead'));
  await wait(800);
  await shot(host, 'results');

  // ---- audio: every effect, song and engine voice plays without errors ----
  const audioErr = await host.evaluate(() => {
    try {
      Sound.init();
      for (const k in SFX) Sound.play(k);
      for (const k in SONGS) {
        Sound.playSong(k);
        Sound.schedule();
      }
      for (let i = 0; i < 4; i++) {
        Engines.set(i, true, 0.5, i % 2 === 0);
        Engines.wind(i, 1, 0.5);
      }
      Engines.plane(0.8, 1.1);
      Engines.silence();
      Sound.playSong('results');
      return Sound.ctx ? '' : 'no audio context';
    } catch (e) {
      return e.message;
    }
  });
  check('synthesized audio plays', audioErr === '', audioErr);

  // ---- Edit Panel ----
  await host.keyboard.press('Tab');
  check('Tab opens the Edit Panel', await host.isVisible('#editPanel'));
  await host.fill('#cfg-topSpeed-n', '33');
  await host.dispatchEvent('#cfg-topSpeed-n', 'change');
  check('sliders change parameters live', await host.evaluate(() => CFG.topSpeed === 33));
  await host.click('#epPresets button:has-text("Ice Rink")');
  check('presets apply', await host.evaluate(() => CFG.grip === PRESETS['Ice Rink'].grip && CFG.topSpeed === CFG_DEFAULTS.topSpeed));
  check('tweaks persist in the browser', await host.evaluate(() => JSON.parse(localStorage.getItem('claykart.params.v1')).grip === PRESETS['Ice Rink'].grip));
  await host.click('#epClose');

  // ---- race again from the leader phone, then back to the lobby ----
  await ana.click('[data-lead="again"]');
  await host.waitForFunction(() => App.screen === 'race', null, { timeout: 10000 });
  check('leader phone restarts from the results', true);
  await host.keyboard.press('Escape');
  await host.waitForSelector('#scr-pause:not([hidden])', { timeout: 5000 });
  check('Esc pauses the race', await host.evaluate(() => App.paused));
  await host.click('#pauseQuit');
  await host.waitForFunction(() => App.screen === 'lobby', null, { timeout: 5000 });
  check('quit returns to the lobby with everyone seated', await host.evaluate(() => Party.list().length === 2));

  // ---- the point-to-point mountain run ----
  const cards = await host.evaluate(() => [...document.querySelectorAll('#trackPick .track-b')].map((b) => ({ id: b.dataset.track, pips: b.querySelectorAll('.pips b.on').length, text: b.textContent })));
  check('lobby lists all four courses', cards.map((c) => c.id).join() === 'meadow,sherbet,magma,mount', cards.map((c) => c.id).join());
  check('course cards show difficulty, and laps or sections', cards.map((c) => c.pips).join() === '1,2,3,4' && /\d laps?/.test(cards[0].text) && /Point-to-point/.test(cards[3].text) && /3 sections/.test(cards[3].text), cards.map((c) => c.text).join(' | '));
  check('leader phone lists all four courses', (await ana.locator('#tracks button').count()) === 4);
  await ana.click('#tracks button:has-text("Mount Wobble")');
  await host.waitForFunction(() => Party.settings.track === 'mount', null, { timeout: 5000 });
  await ana.waitForFunction(() => [...document.querySelectorAll('#sLaps button')].every((b) => b.disabled), null, { timeout: 5000 }).catch(() => {});
  const lapsOff = (sel) => [...document.querySelectorAll(sel)].every((b) => b.disabled);
  check('laps are disabled for a point-to-point run (phone and big screen)', (await ana.evaluate(lapsOff, '#sLaps button')) && (await host.evaluate(lapsOff, '#optLaps button')));
  await ana.click('#leadStart');
  await host.waitForFunction(() => App.screen === 'race' && App.race && App.race.track.id === 'mount', null, { timeout: 30000 });
  check('one run in three sections, after the cargo-plane drop', await host.evaluate(() => App.race.p2p && App.race.laps === 1 && App.race.sections.length === 3 && App.race.opts.intro === 4.6));
  await host.evaluate(() => {
    const r = App.race;
    while (r.state !== 'race') {
      Party.readControls();
      App.applyControls();
      r.update(1 / 60);
    }
  });
  await ana.waitForFunction(() => document.getElementById('hLap').textContent === 'Section 1/3', null, { timeout: 30000 }).catch(() => {});
  check('phone HUD shows the section', (await ana.textContent('#hLap')) === 'Section 1/3', await ana.textContent('#hLap'));
  await host.evaluate(() => EditPanel.skip()); // on to the next checkpoint
  await ana.waitForFunction(() => document.getElementById('hLap').textContent === 'Section 2/3', null, { timeout: 30000 }).catch(() => {});
  check('phone HUD follows the sections', (await ana.textContent('#hLap')) === 'Section 2/3', await ana.textContent('#hLap'));
  check('the music follows the section', await host.evaluate(() => App.music === 'mount2'));
  await shot(ana, 'phone-sections');
  await host.keyboard.press('Escape');
  await host.waitForSelector('#scr-pause:not([hidden])', { timeout: 10000 });
  await host.click('#pauseQuit');
  await host.waitForFunction(() => App.screen === 'lobby', null, { timeout: 10000 });

  // ---- a solo garage purchase on the big screen ----
  await host.evaluate(() => {
    Save.data.bank = 500;
    Save.persist();
  });
  await host.click('#slots .slot:nth-child(1) .slot-acts button:has-text("Garage")');
  await host.waitForFunction(() => App.screen === 'garage', null, { timeout: 5000 });
  await host.click('#garageTabs .tab:has-text("Kart")');
  await host.click('#garageParts .part:has-text("Comet Sled")');
  check('big-screen garage buys and fits a kart body', await host.evaluate(() => Save.owns('body', 'rocket') && Party.players[0].config.body === 'rocket' && Save.data.bank === 320));
  await wait(500);
  await shot(host, 'garage');
  await ana.waitForFunction(() => document.querySelector('#bank').textContent === '320', null, { timeout: 5000 }).catch(() => {});
  check('phones see the new bank balance', (await ana.textContent('#bank')) === '320');
} catch (e) {
  check('test run completed without exceptions', false, e.message);
} finally {
  check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
  server.kill();
  if (serverErr) console.log('server stderr:', serverErr);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
