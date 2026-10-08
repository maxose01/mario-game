'use strict';
// The big-screen app: boots the renderer, runs the fixed-timestep loop, moves between the
// title (an attract-mode race), lobby, garage, race and results, routes race events to the
// speakers and the phones, and keeps the resolution comfortable on slow TVs.

const App = {
  screen: null,
  history: [],
  solo: false,
  race: null,
  view: null,
  demo: null,
  demoView: null,
  showroom: null,
  paused: false,
  fps: 0,
  pxW: 0,
  pxH: 0,
  autoScale: 1,
  lastResults: null,

  boot() {
    Clay.init();
    Clay3D.init();
    loadParams();
    Save.load();
    Party.init();
    this.gl = $('gl');
    this.hud = $('hud');
    this.hctx = this.hud.getContext('2d');
    this.frameEl = $('frame');
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.gl, antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      $('ui').innerHTML = '<div class="card fatal"><h2>WebGL is not available</h2><p>Clay Kart needs a browser with WebGL. Try a recent Chrome, Edge, Firefox or Safari.</p></div>';
      return;
    }
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor('#2b1838');
    window.clayKart = this; // handy from the console
    Input.init();
    Input.onUiKey = (code) => this.uiKey(code);
    Input.onNav = (dir, e) => this.nav(dir, e);
    Screens.init();
    EditPanel.init();
    this.initButtons();
    this.initTouch();
    this.resize(true);
    window.addEventListener('resize', () => this.resize());
    if (document.fonts && document.fonts.load) document.fonts.load(`700 20px ${FONT}`).catch(() => {});
    this.go('title');
    // reloaded mid-party? reopen the same room straight away so the phones reconnect
    try {
      if (sessionStorage.getItem('claykart.room')) Party.open();
    } catch (e) {
      /* storage unavailable */
    }
    let last = performance.now(), acc = 0, frames = 0, fpsT = last, slowT = 0, fastT = 0;
    const loop = (now) => {
      requestAnimationFrame(loop);
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.1) dt = 0.1;
      Clay.setTime(now / 1000);
      acc = this.tick(dt, acc);
      this.draw(dt);
      frames++;
      if (now - fpsT >= 1000) {
        this.fps = Math.round((frames * 1000) / (now - fpsT));
        frames = 0;
        fpsT = now;
      }
      // dynamic resolution for slow screens
      if (CFG.autoRes && document.visibilityState === 'visible') {
        if (dt > 0.024) slowT += dt;
        else slowT = Math.max(0, slowT - dt * 0.5);
        if (dt < 0.0135) fastT += dt;
        else fastT = 0;
        if (slowT > 2 && this.autoScale > 0.5) {
          this.autoScale = Math.max(0.5, this.autoScale * 0.85);
          slowT = 0;
          this.resize(true);
        } else if (fastT > 5 && this.autoScale < 1) {
          this.autoScale = Math.min(1, this.autoScale * 1.1);
          fastT = 0;
          this.resize(true);
        }
      }
    };
    requestAnimationFrame(loop);
  },

  // ---------- screens ----------
  phase() {
    return this.screen === 'race' ? 'race' : this.screen === 'results' ? 'results' : this.screen === 'garage' ? 'garage' : 'lobby';
  },

  go(name) {
    if (this.screen && this.screen !== name && this.screen !== 'race') this.history.push(this.screen);
    this.screen = name;
    if (name !== 'title') this.stopDemo();
    if (name === 'title') {
      this.endRace();
      this.startDemo();
      Sound.playSong('title');
    } else if (name === 'lobby' || name === 'garage' || name === 'howto') {
      if (name !== 'howto') this.endRace();
      Sound.playSong('lobby');
    }
    Screens.show(name === 'race' ? null : name);
    this.refreshShowroom();
    this.showTouch();
    Party.sendState();
  },

  menu(target) {
    Sound.init();
    Sound.play('select');
    if (target === 'lobby') {
      this.solo = false;
      Party.open();
      this.go('lobby');
    } else if (target === 'quick') {
      this.solo = true;
      if (!Party.list().length) Party.localJoin(matchMedia('(pointer: coarse)').matches ? 'touch' : 'kb');
      this.go('lobby');
    } else if (target === 'back') {
      let prev = this.history.pop();
      while (prev === this.screen && this.history.length) prev = this.history.pop();
      this.go(prev && prev !== 'race' ? prev : 'title');
    } else this.go(target);
  },

  addKeyboard() {
    const kbs = Party.list().filter((p) => p.kind === 'local' && p.src.startsWith('kb'));
    if (kbs.length >= 2) return this.toast('Two keyboard racers is the limit');
    if (kbs.length === 1) {
      // split the keyboard: first player WASD, second the arrow keys
      kbs[0].src = 'kb1';
      Party.localJoin('kb2');
      this.toast('Keyboard split: WASD + Shift/Q, and arrows + / and .');
    } else Party.localJoin('kb');
    this.refreshShowroom();
  },

  // Settings and flow, from the big screen or the party leader's phone.
  leaderAction(act, v) {
    const s = Party.settings;
    Sound.init();
    switch (act) {
      case 'track':
        if (TRACK_DEFS.some((t) => t.id === v)) s.track = v;
        break;
      case 'laps':
        s.laps = U.clamp(Math.round(Number(v)) || 3, 1, 9);
        break;
      case 'cc':
        if (CC_CLASSES[v]) s.cc = Number(v);
        break;
      case 'bots':
        s.bots = !!v;
        break;
      case 'items':
        s.items = !!v;
        break;
      case 'start':
      case 'again':
      case 'restart':
        this.paused = false;
        return this.startRace();
      case 'next': {
        const i = TRACK_DEFS.findIndex((t) => t.id === s.track);
        s.track = TRACK_DEFS[(i + 1) % TRACK_DEFS.length].id;
        Party.saveSettings();
        return this.startRace();
      }
      case 'lobby':
        this.paused = false;
        return this.go('lobby');
      case 'resume':
        return this.togglePause(false);
      case 'pause':
        return this.togglePause(true);
      default:
        return;
    }
    Sound.play('select');
    Party.saveSettings();
    Party.changed();
  },

  onPartyChange(kind, p) {
    if (this.screen === 'lobby' || this.screen === 'garage') this.refreshShowroom();
    if (this.screen === 'race' && this.race && p.kartIdx !== undefined) {
      const k = this.race.karts[p.kartIdx];
      if (kind === 'leave' && !k.finished) this.race.setAutopilot(k, true);
      if (kind === 'join' && !k.finished) this.race.setAutopilot(k, false);
    }
  },

  // ---------- 3D backdrops ----------
  startDemo() {
    if (this.demo) return;
    const rnd = U.rng((Math.random() * 1e9) | 0);
    const track = TRACK_DEFS[Math.floor(rnd() * TRACK_DEFS.length)].id;
    const racers = [];
    for (let i = 0; i < 8; i++) {
      const cfg = randomKart(rnd);
      racers.push({ name: findPart('character', cfg.character).name, bot: true, config: cfg });
    }
    this.demo = new Race({ track, laps: 99, cc: 150, racers, demo: true, items: true });
    this.demo.state = 'race';
    this.demoView = new RaceView(this.demo, [], { spectator: true });
  },
  stopDemo() {
    if (!this.demo) return;
    this.demoView.dispose();
    this.demo = this.demoView = null;
  },

  refreshShowroom() {
    const scr = this.screen;
    if (scr !== 'lobby' && scr !== 'garage' && scr !== 'results' && scr !== 'howto') return;
    if (!this.showroom) this.showroom = new Showroom();
    if (scr === 'lobby' || scr === 'howto') {
      this.showroom.setLayout('row', Party.players.map((p) => p && { config: p.config, color: SLOT_COLORS[p.slot], label: p.name, slot: p.slot }));
    } else if (scr === 'garage') {
      const p = Screens.garagePlayer();
      const cfg = p ? p.config : Save.ownedConfig(Save.data.local.kb && Save.data.local.kb.config);
      this.showroom.setLayout('single', [{ config: cfg, color: p ? SLOT_COLORS[p.slot] : '#8a6a9a' }]);
    } else if (scr === 'results' && this.lastResults) {
      this.showroom.setLayout('podium', this.lastResults.slice(0, 3).map((r) => ({ config: r.config, color: r.slot >= 0 ? SLOT_COLORS[r.slot] : null, label: r.name, slot: r.slot })));
    }
  },

  // ---------- racing ----------
  startRace() {
    const humans = Party.list();
    if (!humans.length) {
      this.toast('Add a racer first');
      return;
    }
    this.endRace();
    this.stopDemo();
    const s = Party.settings;
    const racers = [];
    const rnd = U.rng((Math.random() * 1e9) | 0);
    for (const p of humans) {
      p.kartIdx = racers.length;
      racers.push({ name: p.name, config: p.config, bot: false, slot: p.slot, color: SLOT_COLORS[p.slot] });
    }
    const total = s.bots ? 8 : humans.length;
    const used = humans.map((p) => p.config.character);
    while (racers.length < total) {
      const cfg = randomKart(rnd, used);
      used.push(cfg.character);
      racers.push({ name: findPart('character', cfg.character).name, config: cfg, bot: true });
    }
    this.race = new Race({ track: s.track, laps: s.laps, cc: s.cc, racers, items: s.items, intro: 2.6 });
    this.view = new RaceView(this.race, humans.map((p) => ({ slot: p.slot, idx: p.kartIdx, touch: p.src === 'touch' })));
    this.raceDoneT = 0;
    this.paused = false;
    this.screen = 'race';
    Screens.show(null);
    this.showTouch();
    Sound.tempoMul = 1;
    Sound.playSong(this.race.track.def.music);
    Party.sendState();
    Party.broadcast({ t: 'go', track: this.race.track.def.name });
    $('gl').focus && $('gl').focus();
  },

  endRace() {
    if (this.view) this.view.dispose();
    this.view = null;
    this.race = null;
    Engines.silence();
    for (const p of Party.list()) delete p.kartIdx;
  },

  togglePause(on) {
    if (this.screen !== 'race') return;
    this.paused = on === undefined ? !this.paused : on;
    Screens.show(this.paused ? 'pause' : null);
    Sound.play('select');
    if (this.paused) Engines.silence();
    Party.broadcast({ t: 'paused', v: this.paused });
  },

  applyControls() {
    const race = this.race;
    for (const p of Party.list()) {
      if (p.kartIdx === undefined) continue;
      const k = race.karts[p.kartIdx];
      if (!k || k.finished) continue;
      const away = p.kind === 'phone' && !p.connected;
      if (away !== !!k.auto) race.setAutopilot(k, away);
      if (k.auto) continue;
      const c = p.ctl;
      k.ctl.steer = c.steer;
      k.ctl.gas = c.gas;
      k.ctl.brake = c.brake;
      k.ctl.drift = c.drift;
      // with auto-gas the engine would always flood on the grid: Drift revs it instead,
      // so holding Drift as the "1" appears gives the rocket start
      if (race.state === 'countdown' && c.autoGas) {
        k.ctl.gas = c.drift;
        k.ctl.drift = false;
      }
      k.ctl.item = c.item;
      k.ctl.back = c.back;
    }
  },

  tick(dt, acc) {
    const frozen = this.paused || (EditPanel.open && CFG.pauseWhileEditing);
    const scr = this.screen;
    this.handlePads();
    if (scr === 'race' && this.race) {
      const events = [];
      if (!frozen) {
        acc += dt * CFG.timeScale;
        let n = 0;
        while (acc >= STEP && n < 5) {
          Party.readControls();
          this.applyControls();
          this.race.update(STEP);
          for (const e of this.race.drainEvents()) events.push(e);
          acc -= STEP;
          n++;
        }
        if (n >= 5) acc = 0;
      }
      this.raceEvents(events);
      this.view.update(frozen ? 0 : dt * CFG.timeScale, events);
      Party.sendRaceHud(this.race, dt);
      this.engineSounds(frozen);
      if (this.race.state === 'done') {
        this.raceDoneT += dt;
        if (this.raceDoneT > 1.2) this.showResults();
      }
    } else if (this.demo) {
      if (!frozen) {
        acc += dt;
        let n = 0;
        while (acc >= STEP && n < 3) {
          this.demo.update(STEP);
          acc -= STEP;
          n++;
        }
        if (n >= 3) acc = 0;
      }
      this.demoView.update(dt, this.demo.drainEvents());
    } else if (this.showroom) {
      this.showroom.update(dt);
      acc = 0;
    }
    return acc;
  },

  engineSounds(frozen) {
    const race = this.race;
    this.view.views.forEach((v, i) => {
      const k = race.karts[v.idx];
      const on = !frozen && race.state !== 'intro' && !k.falling;
      Engines.set(i, on, U.clamp(Math.abs(k.vf) / (CFG.topSpeed * 1.25), 0, 1), k.boostT > 0);
    });
  },

  // Sounds, haptics and save-worthy moments from the race.
  raceEvents(events) {
    const race = this.race;
    let music = race.track.def.music;
    for (const e of events) {
      Party.raceEvent(e);
      const k = e.kart;
      const mine = k && !k.bot;
      switch (e.type) {
        case 'count':
          Sound.play('count');
          break;
        case 'go':
          Sound.play('go');
          break;
        case 'hop':
          if (mine) Sound.play('hop');
          break;
        case 'sparks':
          if (mine) Sound.play('sparks' + e.a);
          break;
        case 'boost':
          if (mine) Sound.play('boost');
          break;
        case 'box':
          if (mine) Sound.play('box');
          break;
        case 'itemget':
          if (mine) Sound.play('itemget');
          break;
        case 'use':
          if (mine && ['banana', 'green', 'red', 'bomb'].includes(e.a)) Sound.play('throw');
          break;
        case 'hit':
          if (mine) Sound.play(e.a === 'banana' ? 'slip' : 'hit');
          break;
        case 'squish':
          if (mine) Sound.play('squish');
          break;
        case 'coin':
          if (mine) Sound.play('coin');
          break;
        case 'coinloss':
          if (mine) Sound.play('coinloss');
          break;
        case 'key':
          if (mine) Sound.play('key');
          break;
        case 'gate':
          Sound.play('gate');
          if (mine && Save.routeFound(race.track.id, e.a.path.id)) {
            Save.data.bank += 15;
            Save.persist();
            this.newRoutes = (this.newRoutes || []).concat(e.a.name);
          }
          break;
        case 'locked':
          if (mine) Sound.play('locked');
          break;
        case 'lap':
          if (mine) Sound.play('lap');
          break;
        case 'finallap':
          if (mine) {
            Sound.play('finallap');
            Sound.tempoMul = 1.12;
          }
          break;
        case 'finish':
          if (mine) Sound.play('finish');
          break;
        case 'bump':
          if (mine || (e.a && !e.a.bot)) Sound.play('bump');
          break;
        case 'wall':
          if (mine && e.a > 8) Sound.play('wall');
          break;
        case 'land':
          if (mine) Sound.play('land');
          break;
        case 'fall':
          if (mine) Sound.play('fall');
          break;
        case 'respawn':
          if (mine) Sound.play('respawn');
          break;
        case 'star':
          if (mine) Sound.play('star');
          break;
        case 'blast':
          Sound.play('blast');
          break;
        case 'stomp':
          if (race.humans.some((h) => Math.hypot(h.x - e.a.x, h.z - e.a.z) < 45)) Sound.play('stomp');
          break;
        case 'trick':
          if (mine) Sound.play('trick');
          break;
        case 'rocket':
          if (mine) Sound.play('rocket');
          break;
        case 'stall':
          if (mine) Sound.play('stall');
          break;
      }
    }
    if (race.humans.some((h) => h.starT > 0)) music = 'star';
    if (Sound.songName !== music) Sound.playSong(music);
  },

  showResults() {
    const race = this.race;
    if (!race || this.screen !== 'race') return;
    const rows = race.results();
    const n = rows.length;
    const news = (this.newRoutes || []).map((r) => `Secret route found: ${r}! +15 coins`);
    this.newRoutes = [];
    let earned = 0;
    for (const r of rows) {
      if (r.slot < 0) continue;
      r.earned = r.coins + placeBonus(r.place, n);
      earned += r.earned;
      const best = Save.data.best[race.track.id];
      if (r.finished && (!best || r.time < best)) {
        Save.data.best[race.track.id] = r.time;
        news.push(`New course record: ${fmtTime(r.time)}`);
      }
      if (r.place === 1) Save.data.wins++;
    }
    Save.data.bank += earned;
    Save.data.races++;
    Save.persist();
    news.unshift(`+${earned} coins to the garage bank (now ${Save.data.bank})`);
    this.lastResults = rows;
    this.endRace();
    this.screen = 'results';
    Screens.show('results');
    Screens.renderResults(rows, news);
    this.refreshShowroom();
    this.showTouch();
    Sound.tempoMul = 1;
    Sound.playSong('results');
    Party.sendState();
    for (const p of Party.list()) {
      if (p.kind !== 'phone' || !p.connected) continue;
      const mine = rows.find((r) => r.slot === p.slot);
      Party.link.send(p.pid, { t: 'results', place: mine ? mine.place : 0, n, earned: mine ? mine.earned : 0, bank: Save.data.bank, rows: rows.slice(0, 8).map((r) => ({ place: r.place, name: r.name, slot: r.slot, time: fmtTime(r.time) })) });
    }
  },

  // ---------- drawing ----------
  draw(dt) {
    const R = this.renderer;
    const ctx = this.hctx;
    ctx.setTransform(this.hudScale, 0, 0, this.hudScale, 0, 0);
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    R.setScissorTest(false);
    const size = R.getSize(new THREE.Vector2());
    if (this.screen === 'race' && this.view) {
      this.view.render(R);
      const rects = this.view.views.map((v) => ({ x: (v.rect.x / size.x) * VIEW_W, y: (v.rect.y / size.y) * VIEW_H, w: (v.rect.w / size.x) * VIEW_W, h: (v.rect.h / size.y) * VIEW_H }));
      Post.draw(ctx, rects.length ? rects : [{ x: 0, y: 0, w: VIEW_W, h: VIEW_H }]);
      this.view.drawHUD(ctx, size.x, size.y);
    } else if (this.demoView) {
      this.demoView.render(R);
      Post.draw(ctx, [{ x: 0, y: 0, w: VIEW_W, h: VIEW_H }]);
      if (this.screen === 'title') this.drawLogo(ctx);
    } else if (this.showroom) {
      this.showroom.render(R);
      Post.draw(ctx, [{ x: 0, y: 0, w: VIEW_W, h: VIEW_H }]);
      if (this.screen === 'lobby') this.drawNameTags(ctx);
    }
    if (this.toastMsg) {
      this.toastMsg.t -= dt;
      const t = this.toastMsg;
      if (t.t <= 0) this.toastMsg = null;
      else {
        ctx.globalAlpha = Math.min(1, t.t * 3);
        ctx.font = `700 17px ${FONT}`;
        const w = ctx.measureText(t.text).width + 40;
        Hud.panel(ctx, VIEW_W / 2 - w / 2, 16, w, 38, 14);
        Clay.label(ctx, t.text, VIEW_W / 2, 35, 17, '#fff8ec', 'center');
        ctx.globalAlpha = 1;
      }
    }
  },

  drawLogo(ctx) {
    const drawWord = (w, y, size, cols, phase) => {
      ctx.font = `700 ${size}px ${FONT}`;
      const total = ctx.measureText(w).width + (w.length - 1) * 4;
      let x = VIEW_W / 2 - total / 2;
      for (let i = 0; i < w.length; i++) {
        const ch = w[i];
        const cw = ctx.measureText(ch).width;
        const bob = Math.sin(Clay.boil * 0.9 + i * 0.8 + phase) * 3;
        const rot = (U.hash(i * 13 + Clay.boil) - 0.5) * 0.06;
        ctx.save();
        ctx.translate(x + cw / 2, y + bob);
        ctx.rotate(rot);
        if (ch !== ' ') Clay.text(ctx, ch, 0, 0, size, cols[i % cols.length]);
        ctx.restore();
        x += cw + 4;
      }
    };
    drawWord('CLAY KART', 86, 92, ['#ff7b8a', '#ffb347', '#ffd84a', '#7ddc6f', '#ffffff', '#6ec6ff', '#b48cff', '#ff8fb1', '#ffb347'], 1);
    drawWord('PARTY GRAND PRIX', 146, 30, ['#fff3c4'], 0);
  },

  drawNameTags(ctx) {
    const sr = this.showroom;
    const cam = sr.camera;
    const v = new THREE.Vector3();
    sr.slots.forEach((s, i) => {
      const p = Party.players[i];
      v.set(s.root.position.x, 3.1, s.root.position.z).project(cam);
      const x = (v.x * 0.5 + 0.5) * VIEW_W, y = (-v.y * 0.5 + 0.5) * VIEW_H;
      if (!p) {
        Clay.label(ctx, `P${i + 1}`, x, y + 30, 16, 'rgba(255,248,236,0.55)', 'center');
        return;
      }
      ctx.font = `700 17px ${FONT}`;
      const w = Math.max(70, ctx.measureText(p.name).width + 34);
      ctx.fillStyle = SLOT_COLORS[i];
      Clay.rrect(ctx, x - w / 2, y - 16, w, 30, 14);
      ctx.fill();
      Clay.label(ctx, `P${i + 1} ${p.name}`, x, y - 1, 16, '#ffffff', 'center', '#2b1838');
      if (p.kind === 'phone' && p.ready) Clay.label(ctx, '✓ ready', x, y + 26, 14, '#b7f5a8', 'center');
    });
  },

  toast(text) {
    this.toastMsg = { text, t: 2.6 };
  },

  // ---------- sizing ----------
  resize(force) {
    const stage = $('stage');
    const aw = stage.clientWidth, ah = stage.clientHeight;
    const scale = Math.max(0.1, Math.min(aw / VIEW_W, ah / VIEW_H));
    const w = Math.floor(VIEW_W * scale), h = Math.floor(VIEW_H * scale);
    if (!force && w === this.cssW && h === this.cssH) return;
    this.cssW = w;
    this.cssH = h;
    const f = this.frameEl;
    f.style.width = w + 'px';
    f.style.height = h + 'px';
    f.style.setProperty('--fw', w + 'px');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pr = U.clamp(dpr * CFG.renderScale * this.autoScale, 0.3, 3);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.gl.style.width = this.hud.style.width = w + 'px';
    this.gl.style.height = this.hud.style.height = h + 'px';
    this.pxW = Math.round(w * pr);
    this.pxH = Math.round(h * pr);
    const hr = Math.min(2, dpr);
    this.hud.width = Math.round(w * hr);
    this.hud.height = Math.round(h * hr);
    this.hudScale = (w * hr) / VIEW_W;
    if (this.view) this.view.minimap = null;
    if (this.demoView) this.demoView.minimap = null;
  },

  // ---------- input plumbing ----------
  uiKey(code) {
    if (code === 'Tab' || code === 'Backquote') {
      EditPanel.toggle();
      return true;
    }
    if (code === 'KeyM') {
      Sound.init();
      this.setMuted(Sound.toggleMute());
      return true;
    }
    if (code === 'KeyF' && this.screen !== 'race') {
      this.fullscreen();
      return true;
    }
    if ((code === 'Escape' || code === 'KeyP') && this.screen === 'race') {
      this.togglePause();
      return true;
    }
    return false;
  },
  nav(dir, e) {
    if (this.screen === 'race' && !this.paused) return false;
    const scr = Screens.current && $('scr-' + Screens.current);
    if (!scr) return false;
    if (dir === 'back') {
      if (this.paused) this.togglePause(false);
      else if (this.screen !== 'title') this.menu('back');
      return true;
    }
    if (dir === 'ok') return false; // the focused button handles Enter itself
    if (e && e.target && e.target.type === 'range') return false;
    return Nav.move(dir, scr);
  },
  handlePads() {
    const presses = Input.padPresses();
    if (!presses.length) return;
    for (const pr of presses) {
      const src = 'pad' + pr.pad;
      const joined = Party.list().some((p) => p.src === src);
      if (this.screen === 'race') {
        if (pr.btn === 'start') this.togglePause();
        if (!this.paused) continue;
      }
      if (this.screen === 'lobby' && !joined && (pr.btn === 'a' || pr.btn === 'start')) {
        Party.localJoin(src);
        this.refreshShowroom();
        continue;
      }
      const scr = Screens.current && $('scr-' + Screens.current);
      if (!scr) continue;
      if (['up', 'down', 'left', 'right'].includes(pr.btn)) Nav.move(pr.btn, scr);
      else if (pr.btn === 'a' && document.activeElement && document.activeElement.click) document.activeElement.click();
      else if (pr.btn === 'b') this.nav('back');
    }
  },

  setMuted(m) {
    const b = $('muteBtn');
    b.textContent = m ? 'Sound off' : 'Sound on';
    b.setAttribute('aria-pressed', String(!m));
  },
  fullscreen() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    } catch (e) {
      /* optional */
    }
  },
  initButtons() {
    $('muteBtn').addEventListener('click', (e) => {
      Sound.init();
      Sound.resume();
      this.setMuted(Sound.toggleMute());
      e.currentTarget.blur();
    });
    $('fullBtn').addEventListener('click', (e) => {
      e.currentTarget.blur();
      this.fullscreen();
    });
  },

  // On-screen controls for a touch racer playing on the big screen itself (tablet / phone).
  initTouch() {
    const pad = $('tSteer');
    let id = null, x0 = 0;
    const knob = pad.querySelector('.t-knob');
    pad.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      x0 = e.clientX;
      pad.setPointerCapture(id);
      Sound.init();
      Sound.resume();
    });
    pad.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      const w = pad.clientWidth * 0.32;
      Input.touch.steer = U.clamp((e.clientX - x0) / w, -1, 1);
      knob.style.transform = `translateX(${Input.touch.steer * 40}%)`;
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      Input.touch.steer = 0;
      knob.style.transform = '';
    };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
    for (const b of document.querySelectorAll('#touch [data-t]')) {
      const act = b.dataset.t;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        b.classList.add('down');
        if (act === 'pause') return this.togglePause(true);
        if (act === 'item') Input.touch.item = true;
        else Input.touch[act] = true;
        if (act === 'brake') Input.touch.gas = false;
      });
      const up = () => {
        b.classList.remove('down');
        if (act === 'drift') Input.touch.drift = false;
        if (act === 'brake') {
          Input.touch.brake = false;
          Input.touch.gas = true;
        }
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', up);
    }
  },
  showTouch() {
    const on = this.screen === 'race' && Party.list().some((p) => p.src === 'touch');
    $('touch').hidden = !on;
  },
};

window.addEventListener('DOMContentLoaded', () => App.boot());
