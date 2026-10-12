'use strict';
// Race health monitor (big screen). Watches for the things that can stop someone from finishing
// a race and keeps a log of them:
//   input-stall   a phone the big screen hasn't heard from for 1.5 s (a link that silently
//                 stalled): its kart is handed to the autopilot until the phone is heard again
//   disconnect    a phone dropped out mid-race (and reconnect when it comes back)
//   stuck         a human kart wedged for 8 s (the rescue cloud lifts it out)
//   race-timeout  the race ended without everyone home (finish window or time cap)
//   nan           a kart's position went bad (it is put back on the road)
//   exception     a script error on the big screen; phone-error: one on a phone
//   phone-relink  a phone rebuilt a link that stopped answering
//   hitches       frames over 250 ms, counted per race (a struggling screen)
// Each race ends with a summary. Problems pop up on the big screen (a toast and, in developer
// mode, the ⚠ badge in the top bar, which opens the log in the Edit Panel), are kept in this
// browser (the last 400 entries) and, when the party server is running, appended to
// logs/health.jsonl next to server.js, which also prints them in its terminal.
// The log is only shown in developer mode (a switch in the Edit Panel, off by default): the
// badge, the Edit Panel's log and the note on the results screen all wait for it. Logging goes on
// either way, so the log is complete when it is switched on.
// It costs next to nothing: checks run four times a second over the human karts only, and
// storage and the network are touched only when something is logged.

const HEALTH_KEY = 'claykart.health.v1';
const HEALTH_MAX = 400;
const DEV_KEY = 'claykart.dev.v1';

const Monitor = {
  dev: false, // developer mode: the health log is only shown with it on
  entries: [],
  problems: 0, // warnings and errors since the big screen started
  race: null, // this race's tally
  checkT: 0,
  outbox: [],
  saveT: 0,
  sendT: 0,

  init() {
    const saved = Store.get(HEALTH_KEY, null);
    if (saved && Array.isArray(saved.entries)) this.entries = saved.entries.slice(-HEALTH_MAX);
    window.addEventListener('error', (e) => this.exception(e.message, e.error && e.error.stack, e.filename, e.lineno));
    window.addEventListener('unhandledrejection', (e) => {
      const r = e.reason || {};
      this.exception('Unhandled promise rejection: ' + (r.message || String(r)), r.stack);
    });
    $('healthBtn').addEventListener('click', () => {
      EditPanel.toggle(true);
      const card = $('epHealth');
      if (card) card.scrollIntoView({ block: 'start' });
    });
    $('epDev').addEventListener('change', () => this.setDev($('epDev').checked));
    this.dev = Store.get(DEV_KEY, false) === true;
    this.showDev();
  },

  // Developer mode on or off (remembered in this browser).
  setDev(on) {
    this.dev = !!on;
    Store.set(DEV_KEY, this.dev);
    this.showDev();
  },
  // Show or hide what depends on it: the switch itself, the Edit Panel's log and the ⚠ badge.
  showDev() {
    $('epDev').checked = this.dev;
    $('epHealth').hidden = !this.dev;
    this.badge();
    if (this.dev && EditPanel.open) EditPanel.renderHealth();
  },

  // Log something. level: 'info' | 'warn' | 'error'. notify: also tell the room (a toast).
  note(level, kind, msg, data, notify) {
    const r = this.race;
    const e = { at: new Date().toISOString(), level, kind, msg };
    if (r) {
      e.track = r.track;
      e.t = Math.round((App.race ? App.race.raceTime : 0) * 10) / 10;
    }
    if (data !== undefined) e.data = data;
    this.entries.push(e);
    if (this.entries.length > HEALTH_MAX) this.entries.splice(0, this.entries.length - HEALTH_MAX);
    if (level !== 'info') {
      this.problems++;
      if (r) r.problems.push(kind);
      this.outbox.push(e);
      this.badge();
      if (level === 'error') console.error('[health]', msg, data || '');
      else console.warn('[health]', msg, data || '');
    }
    if (notify && App.toast) App.toast(msg);
    this.schedule();
    if (EditPanel.open) EditPanel.renderHealth();
    return e;
  },

  // A script error on the big screen (the same one repeating is logged once, with a count).
  exception(message, stack, file, line) {
    const msg = String(message || 'Script error');
    const last = this.entries[this.entries.length - 1];
    if (last && last.kind === 'exception' && last.msg === msg) {
      last.count = (last.count || 1) + 1;
      this.schedule();
      return;
    }
    this.note('error', 'exception', msg, { stack: String(stack || '').slice(0, 1200), file, line, screen: App.screen }, true);
  },

  // A problem a phone reported about itself.
  fromPhone(p, m) {
    const level = m.level === 'error' ? 'error' : m.level === 'info' ? 'info' : 'warn';
    const kind = 'phone-' + String(m.kind || 'log').replace(/[^\w-]/g, '').slice(0, 24);
    // (kept small: the log shares the browser's storage with the wallets)
    let data = m.data && typeof m.data === 'object' ? m.data : undefined;
    if (data && JSON.stringify(data).length > 3000) data = { cut: true };
    this.note(level, kind, `P${p.slot + 1} ${p.name}'s phone: ${String(m.msg || '').slice(0, 300)}`, data, level === 'error');
  },

  // A small picture of a kart for the log, with its phone's link if a phone drives it.
  kartInfo(k) {
    const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : String(v));
    const info = {
      name: k.name, slot: k.slot, s: k.loc ? r1(k.loc.s) : null, d: k.loc ? r1(k.loc.d) : null, x: r1(k.x), y: r1(k.y), z: r1(k.z),
      speed: r1(k.speed), totalS: r1(k.totalS), onGround: k.onGround, falling: k.falling, auto: !!k.auto, spin: r1(k.spinT), finished: k.finished,
      ctl: { steer: r1(k.ctl.steer), gas: k.ctl.gas, brake: k.ctl.brake, drift: k.ctl.drift },
    };
    const p = !k.bot && k.slot >= 0 ? Party.players[k.slot] : null;
    if (p && p.kind === 'phone') info.phone = this.phoneInfo(p);
    return info;
  },
  // A phone's link: connected, seconds since its last input, round trip, and what its
  // controller last said it was doing (see padState in js/pad.js).
  phoneInfo(p) {
    return {
      slot: p.slot, name: p.name, connected: !!p.connected, inputAge: Math.round((p.inputAge || 0) * 10) / 10, rtt: p.rtt || 0,
      mode: Party.link ? Party.link.mode : undefined, pad: p.pad,
    };
  },
  // The controller state a phone sends with its pings, kept to known small fields.
  padState(st) {
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
    const str = (v) => (typeof v === 'string' ? v.slice(0, 40) : undefined);
    return { touch: num(st.touch), s: num(st.s), held: str(st.held), steer: str(st.steer), ui: str(st.ui), fs: !!st.fs, queue: num(st.queue) };
  },

  raceStart(race, humans) {
    this.race = {
      track: race.track.id, start: performance.now(), problems: [], hitches: 0, frames: 0, worstFrame: 0,
      silent: new Set(), worstGap: {},
    };
    this.checkT = 0;
    this.note('info', 'race-start', `Race on ${race.track.def.name} started: ${Party.names(humans)}`, {
      cc: race.ccName, laps: race.laps, racers: humans.map((p) => ({ slot: p.slot, name: p.name, kind: p.kind, src: p.src, mode: p.kind === 'phone' && Party.link ? Party.link.mode : undefined })),
    });
  },

  // Every frame of a race (cheap): counts hitches, and four times a second checks the humans.
  watch(race, dt, frozen) {
    const r = this.race;
    if (!r) return;
    r.frames++;
    if (this.frameDt > 0.25) r.hitches++;
    r.worstFrame = Math.max(r.worstFrame, this.frameDt || 0);
    this.checkT += dt;
    if (this.checkT < 0.25) return;
    this.checkT = 0;
    for (const k of race.karts) {
      // a kart whose numbers went bad would be lost for the rest of the race: put it back
      if (!Number.isFinite(k.x + k.y + k.z + k.vx + k.vz + k.vy + k.totalS)) this.rescueNaN(race, k);
    }
    if (frozen || (race.state !== 'race' && race.state !== 'countdown')) return;
    for (const p of Party.list()) {
      if (p.kind !== 'phone' || p.kartIdx === undefined) continue;
      const k = race.karts[p.kartIdx];
      if (!k || k.finished) continue;
      r.worstGap[p.slot] = Math.max(r.worstGap[p.slot] || 0, Math.round((p.inputAge || 0) * 10) / 10);
      const silent = p.connected && p.inputAge > 1.5;
      if (silent && !r.silent.has(p.slot)) {
        r.silent.add(p.slot);
        this.note('warn', 'input-stall', `P${p.slot + 1} ${p.name}: no signal from the phone, the autopilot is driving until it's back`, this.kartInfo(k), true);
      } else if (!silent && r.silent.has(p.slot) && p.connected) {
        r.silent.delete(p.slot);
        this.note('info', 'input-back', `P${p.slot + 1} ${p.name} is back in control`, undefined, true);
      }
    }
  },
  frame(rawDt) {
    this.frameDt = rawDt;
  },

  rescueNaN(race, k) {
    const s = k.lastSafe;
    this.note('error', 'nan', `${k.name}'s kart went off the map (bad numbers): put back on the road`, this.kartInfo(k), !k.bot);
    if (s && Number.isFinite(s.x + s.y + s.z + s.head)) k.setPos(s.x, s.y + 0.6, s.z, s.head);
    else {
      const g = race.track.gridSlot(k.gridSlot || 0);
      k.setPos(g.x, g.y + 0.6, g.z, g.head);
    }
    if (!Number.isFinite(k.totalS)) k.totalS = 0;
    k.falling = false;
    k.teleported = true;
  },

  // The race is over (how: 'quit' or 'restart' if it was abandoned on the way): a summary for the
  // log, with where everyone still out there was, and a line for the results if anything went
  // wrong. The summary of a race with problems, a time-out or an early end also goes to the
  // server's log file.
  raceEnd(race, how) {
    const r = this.race;
    if (!r) return '';
    this.race = null;
    const secs = (performance.now() - r.start) / 1000;
    const count = {};
    for (const k of r.problems) count[k] = (count[k] || 0) + 1;
    const n = r.problems.length;
    const left = race.humans.filter((k) => !k.finished);
    const end = how === 'quit' ? 'quit' : how === 'restart' ? 'restarted' : 'over';
    const e = this.note('info', how ? 'race-' + how : 'race-end', `Race on ${race.track.def.name} ${end} after ${secs.toFixed(0)} s${n ? `: ${n} problem${n > 1 ? 's' : ''} logged` : ''}`, {
      track: r.track, raceTime: Math.round(race.raceTime * 10) / 10, timedOut: !!race.timedOut, problems: count,
      fps: r.frames ? Math.round(r.frames / Math.max(1, secs)) : 0, hitches: r.hitches, worstFrameMs: Math.round(r.worstFrame * 1000),
      worstInputGap: r.worstGap, finished: race.humans.map((k) => ({ name: k.name, finished: k.finished })),
      left: how || race.timedOut ? left.map((k) => this.kartInfo(k)) : undefined,
    });
    if (n || how || race.timedOut) {
      this.outbox.push(e);
      this.schedule();
    }
    if (r.hitches > Math.max(10, secs / 6)) this.note('warn', 'hitches', `The big screen stuttered ${r.hitches} times this race (frames over 250 ms): try a lower render scale in the Edit Panel`, { hitches: r.hitches, worstFrameMs: Math.round(r.worstFrame * 1000) });
    return n && this.dev ? `⚠ ${n} problem${n > 1 ? 's' : ''} this race went into the health log (the ⚠ badge, top right)` : '';
  },

  badge() {
    const b = $('healthBtn');
    b.hidden = !this.dev || this.problems === 0;
    b.textContent = `⚠ ${this.problems}`;
    b.title = `${this.problems} problem${this.problems > 1 ? 's' : ''} logged: open the health log`;
  },

  // Save to this browser (at most every 3 s) and send problems to the party server's log file.
  schedule() {
    if (!this.saveT) {
      this.saveT = setTimeout(() => {
        this.saveT = 0;
        Store.set(HEALTH_KEY, { entries: this.entries });
      }, 3000);
    }
    if (this.outbox.length && !this.sendT && window.CLAYKART_SERVER) {
      this.sendT = setTimeout(() => {
        this.sendT = 0;
        const batch = this.outbox.splice(0, 50);
        if (!batch.length) return;
        try {
          fetch('api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(batch), keepalive: true }).catch(() => {});
        } catch (e) {
          /* the log file is a bonus */
        }
        if (this.outbox.length) this.schedule();
      }, 1500);
    }
  },

  // The whole log as a file (Edit Panel).
  download() {
    const blob = new Blob([JSON.stringify({ app: 'clay-kart', saved: new Date().toISOString(), userAgent: navigator.userAgent, entries: this.entries }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `clay-kart-health-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  },
  clear() {
    this.entries = [];
    this.problems = 0;
    this.badge();
    Store.set(HEALTH_KEY, { entries: [] });
  },
};
