'use strict';
// The party: up to four racers on one big screen. Each slot is either a phone (joined over the
// network with the room code / QR) or a local controller (keyboard, gamepad, touch).
// Also owns the save: the shared coin bank, garage unlocks, discovered routes and best times.

const SAVE_KEY = 'claykart.save.v1';

const Save = {
  data: null,
  fresh() {
    return { v: 1, bank: 60, owned: freeParts(), routes: {}, best: {}, wins: 0, races: 0, local: {} };
  },
  load() {
    const d = Store.get(SAVE_KEY, null);
    this.data = d && d.v === 1 ? Object.assign(this.fresh(), d) : this.fresh();
    this.data.owned = Object.assign(freeParts(), this.data.owned);
  },
  persist() {
    Store.set(SAVE_KEY, this.data);
  },
  owns(kind, id) {
    return !!this.data.owned[partKey(kind, id)];
  },
  // Pay from the shared bank; returns an error string or null.
  buy(kind, id) {
    const p = findPart(kind, id);
    if (!p) return 'Unknown part';
    if (this.owns(kind, id)) return null;
    if (this.data.bank < p.price) return `Needs ${p.price - this.data.bank} more coins`;
    this.data.bank -= p.price;
    this.data.owned[partKey(kind, id)] = true;
    this.persist();
    return null;
  },
  // Everything a config uses must be owned; swap anything locked for the default.
  ownedConfig(cfg) {
    cfg = sanitizeKart(cfg);
    for (const k of CATALOG_KINDS) if (!this.owns(k, cfg[k])) cfg[k] = DEFAULT_KART[k];
    return cfg;
  },
  routeFound(track, route) {
    const r = (this.data.routes[track] = this.data.routes[track] || {});
    if (r[route]) return false;
    r[route] = true;
    this.persist();
    return true;
  },
};

const NAME_POOL = ['Lumpy', 'Squish', 'Doodle', 'Pebble', 'Mochi', 'Noodle', 'Biscuit', 'Gumdrop'];

const Party = {
  link: null,
  code: '',
  joinUrl: '',
  status: { text: 'Starting…', ok: false },
  players: [null, null, null, null],
  byPid: new Map(),
  settings: { track: 'meadow', laps: 3, cc: 150, bots: true, items: true },
  listeners: new Set(),
  hudT: 0,

  init() {
    const s = Store.get('claykart.settings.v1', null);
    if (s) Object.assign(this.settings, s);
    if (!TRACK_DEFS.some((t) => t.id === this.settings.track)) this.settings.track = 'meadow';
  },
  saveSettings() {
    Store.set('claykart.settings.v1', this.settings);
  },
  changed() {
    for (const fn of this.listeners) fn();
    this.sendState();
  },

  // ---------- network ----------
  open() {
    if (this.link) return;
    this.link = new HostLink({
      onRoom: (code, url) => {
        this.code = code;
        this.joinUrl = url;
        this.changed();
      },
      onStatus: (text, ok) => {
        this.status = { text, ok };
        this.changed();
      },
      onJoin: (pid, hello) => this.phoneJoin(pid, hello),
      onMessage: (pid, m) => this.phoneMessage(pid, m),
      onLeave: (pid) => this.phoneLeave(pid),
    });
    this.link.start();
  },

  phoneJoin(pid, hello) {
    const id = String(hello.id || '').slice(0, 40);
    // a phone that dropped out gets its old slot back
    let p = id ? this.players.find((q) => q && q.kind === 'phone' && q.clientId === id) : null;
    if (!p) {
      const slot = this.players.findIndex((q) => !q);
      if (slot < 0) {
        this.link.send(pid, { t: 'full' });
        return;
      }
      p = this.players[slot] = {
        slot, kind: 'phone', clientId: id, name: cleanName(hello.name) || NAME_POOL[slot], ready: false,
        config: Save.ownedConfig(hello.config), ctl: blankCtl(), itemSeen: 0, autoGas: true,
      };
      Sound.play('join');
    }
    if (p.pid && p.pid !== pid) this.byPid.delete(p.pid);
    p.pid = pid;
    p.connected = true;
    this.byPid.set(pid, p);
    this.link.send(pid, { t: 'welcome', slot: p.slot, color: SLOT_COLORS[p.slot], name: p.name, config: p.config });
    App.onPartyChange('join', p);
    this.changed();
  },
  phoneLeave(pid) {
    const p = this.byPid.get(pid);
    this.byPid.delete(pid);
    if (!p) return;
    p.connected = false;
    p.ctl = blankCtl();
    // outside a race a vanished phone frees its seat; mid-race a bot takes the wheel
    if (App.screen !== 'race') this.players[p.slot] = null;
    App.onPartyChange('leave', p);
    this.changed();
  },
  phoneMessage(pid, m) {
    const p = this.byPid.get(pid);
    if (!p || !m || typeof m !== 'object') return;
    switch (m.t) {
      case 'in': {
        const c = p.ctl;
        c.steer = U.clamp(Number(m.s) || 0, -1, 1);
        c.gas = !!m.g;
        c.brake = !!m.b;
        c.drift = !!m.d;
        c.back = !!m.k;
        c.autoGas = m.a !== false;
        // item presses arrive as a counter so a quick tap is never lost
        const n = Number(m.i) || 0;
        if (n !== p.itemSeen) {
          c.itemQueued = true;
          // thrown backwards? (remembered with the press: the release may follow at once)
          c.itemBack = !!m.k;
          p.itemSeen = n;
        }
        p.lastInput = performance.now();
        break;
      }
      case 'cfg':
        p.config = Save.ownedConfig(m.config);
        App.onPartyChange('config', p);
        this.changed();
        break;
      case 'name':
        p.name = cleanName(m.name) || p.name;
        this.changed();
        break;
      case 'buy': {
        const err = Save.buy(m.kind, m.id);
        if (!err) {
          Sound.play('buy');
          p.config[m.kind] = m.id;
          p.config = Save.ownedConfig(p.config);
        }
        this.link.send(pid, { t: 'bought', kind: m.kind, id: m.id, err });
        App.onPartyChange('config', p);
        this.changed();
        break;
      }
      case 'ready':
        p.ready = !!m.v;
        if (p.ready) Sound.play('ready');
        this.changed();
        App.onPartyChange('ready', p);
        break;
      case 'lead':
        if (this.leader() !== p) return;
        App.leaderAction(m.act, m.v);
        break;
      case 'pause':
        App.togglePause(true);
        break;
      case 'ping':
        this.link.send(pid, { t: 'pong', c: m.c });
        break;
    }
  },

  // ---------- local racers ----------
  localJoin(src) {
    if (this.players.some((p) => p && p.kind === 'local' && p.src === src)) return null;
    const slot = this.players.findIndex((q) => !q);
    if (slot < 0) return null;
    const saved = Save.data.local[src] || {};
    const p = (this.players[slot] = {
      slot, kind: 'local', src, name: saved.name || (src.startsWith('pad') ? 'Pad ' + (Number(src.slice(3)) + 1) : SOURCE_LABELS[src] ? NAME_POOL[slot] : 'Player'),
      ready: true, connected: true, config: Save.ownedConfig(saved.config), ctl: blankCtl(), autoGas: src === 'touch',
    });
    Sound.play('join');
    this.changed();
    return p;
  },
  remove(slot) {
    const p = this.players[slot];
    if (!p) return;
    if (p.kind === 'phone' && this.link) {
      this.link.send(p.pid, { t: 'kicked' });
      this.link.kick(p.pid);
      this.byPid.delete(p.pid);
    }
    this.players[slot] = null;
    this.changed();
  },
  setLocalConfig(p, cfg) {
    p.config = Save.ownedConfig(cfg);
    if (p.kind === 'local') {
      Save.data.local[p.src] = { config: p.config, name: p.name };
      Save.persist();
    }
    this.changed();
  },

  list() {
    return this.players.filter(Boolean);
  },
  leader() {
    return this.players.find((p) => p && (p.kind === 'local' || p.connected)) || null;
  },
  allReady() {
    const l = this.list();
    return l.length > 0 && l.every((p) => p.ready || p.kind === 'local' || !p.connected);
  },

  // Fill controls for every human slot (called once per simulation step).
  readControls() {
    for (const p of this.list()) {
      if (p.kind === 'local') {
        Input.read(p.src, p.autoGas, p.ctl);
        p.ctl.autoGas = p.autoGas;
      } else if (p.ctl.itemQueued) {
        p.ctl.item = true;
        p.ctl.back = p.ctl.back || p.ctl.itemBack;
        p.ctl.itemQueued = false;
        p.ctl.itemBack = false;
      } else p.ctl.item = false;
    }
  },

  // ---------- messages to phones ----------
  sendState() {
    if (!this.link) return;
    const players = this.players.map((p) => p && { slot: p.slot, name: p.name, character: p.config.character, ready: p.ready, kind: p.kind, connected: p.connected !== false });
    const lead = this.leader();
    for (const p of this.list()) {
      if (p.kind !== 'phone' || !p.connected) continue;
      this.link.send(p.pid, {
        t: 'state', phase: App.phase(), racing: p.kartIdx !== undefined, slot: p.slot, color: SLOT_COLORS[p.slot], name: p.name, leader: lead === p, ready: p.ready,
        config: p.config, owned: Save.data.owned, bank: Save.data.bank, settings: this.settings, players, code: this.code,
        tracks: this.courseList(),
      });
    }
  },
  // The courses for the leader's picker: difficulty, laps or sections, secret route found,
  // and the staff time for the chosen engine class (if the course has one).
  courseList() {
    return TRACK_DEFS.map((t) => {
      const routes = Save.data.routes[t.id];
      const staff = t.staff && t.staff[this.settings.cc];
      return {
        id: t.id, name: t.name, found: !!(routes && Object.keys(routes).length), difficulty: t.difficulty || 1,
        sections: t.p2p ? (t.sections || []).length || 1 : 0, staff: staff > 0 ? fmtTime(staff) : '',
      };
    });
  },
  // Live race info for each phone's little screen (a few times a second).
  sendRaceHud(race, dt) {
    if (!this.link) return;
    this.hudT -= dt;
    if (this.hudT > 0) return;
    this.hudT = 0.15;
    // a point-to-point run counts sections instead of laps
    const secs = race.p2p && race.sections ? race.sections.length : 0;
    for (const p of this.list()) {
      if (p.kind !== 'phone' || !p.connected || p.kartIdx === undefined) continue;
      const k = race.karts[p.kartIdx];
      this.link.send(p.pid, {
        t: 'hud', place: k.place, n: race.order ? race.order.length : race.karts.length, lap: Math.max(1, Math.min(race.laps, k.lap)), laps: race.laps,
        secs, sec: secs ? U.clamp(k.section || 1, 1, secs) : 0,
        item: k.roulette > 0 ? '?' : k.item, itemN: k.itemN, coins: k.coins, key: k.key, finished: k.finished,
        state: race.state, count: race.state === 'countdown' ? Math.ceil(race.count) : 0, wrong: k.wrongT > 1.2, drift: k.driftLevel, boost: k.boostT > 0,
      });
    }
  },
  // Tell the right phone about the moments it shows a banner for (the haptics have their own
  // channel, below).
  raceEvent(e) {
    if (!this.link || !e.kart || e.kart.slot < 0) return;
    if (!['finallap', 'section', 'finalsection', 'key', 'gate'].includes(e.type)) return;
    const p = this.players[e.kart.slot];
    if (!p || p.kind !== 'phone' || !p.connected) return;
    const msg = { t: 'fx', k: e.type };
    if (e.type === 'section' || e.type === 'finalsection') {
      const sec = App.race && App.race.sections ? App.race.sections[e.a - 1] : null;
      msg.n = e.a;
      msg.name = sec ? sec.name : '';
    }
    this.link.send(p.pid, msg);
  },
  // What each phone's racer should feel this frame (see js/haptics.js): the jolts as they
  // happen, and the continuous rumble whenever it changes (at most 20 times a second), with a
  // keep-alive every 0.3 s so a phone that stops hearing from us goes quiet by itself.
  sendHaptics(race, dt, events, frozen) {
    if (!this.link) return;
    for (const p of this.list()) {
      if (p.kind !== 'phone' || !p.connected || p.kartIdx === undefined) continue;
      const k = race.karts[p.kartIdx];
      if (!k) continue;
      if (!p.haptics || p.haptics.k !== k) {
        p.haptics = new HapticTracker(k);
        p.hapSent = { a: 0, f: 0, j: 0, t: 0 };
      }
      const h = p.haptics, last = p.hapSent;
      h.update(race, events, dt, frozen);
      const shots = h.take();
      if (shots.length) this.link.send(p.pid, { t: 'hx', e: shots });
      const r = h.rumble;
      last.t += dt;
      const started = (r.a > 0) !== (last.a > 0);
      const changed = Math.abs(r.a - last.a) >= 0.04 || Math.abs(r.f - last.f) >= 2 || r.j !== last.j;
      if (started || (changed && last.t >= 0.05) || (r.a > 0 && last.t >= 0.3)) {
        this.link.send(p.pid, { t: 'hr', a: r.a, f: r.f, j: r.j });
        Object.assign(last, r);
        last.t = 0;
      }
    }
  },
  broadcast(msg) {
    if (this.link) this.link.broadcast(msg);
  },
};

function blankCtl() {
  return { steer: 0, gas: false, brake: false, drift: false, item: false, back: false, itemQueued: false, itemBack: false, autoGas: false };
}
function cleanName(n) {
  return String(n || '').replace(/[^\p{L}\p{N} _.\-!?']/gu, '').trim().slice(0, 12);
}
