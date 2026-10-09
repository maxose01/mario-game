'use strict';
// Menu screens (DOM over the 3D view): title, party lobby, garage & store, how to play,
// results and pause. They are plain buttons, so mouse, touch, keyboard, gamepad d-pads and
// TV remotes (arrow keys + Enter) all work.

const $ = (id) => document.getElementById(id);
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const Screens = {
  current: null,
  garage: { slot: 0, kind: 'character', hover: null },

  init() {
    document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => App.menu(b.dataset.go)));
    this.initLobby();
    this.initGarage();
    $('resNext').addEventListener('click', () => App.leaderAction('next'));
    $('resAgain').addEventListener('click', () => App.leaderAction('again'));
    $('resLobby').addEventListener('click', () => App.leaderAction('lobby'));
    $('pauseResume').addEventListener('click', () => App.togglePause(false));
    $('pauseRestart').addEventListener('click', () => App.leaderAction('restart'));
    $('pauseQuit').addEventListener('click', () => App.leaderAction('lobby'));
    $('titleFoot').textContent = 'Tab: Edit Panel   ·   M: sound   ·   F: fullscreen';
    // a little parade of clay racers and items on the how-to card
    const strip = $('howtoStrip');
    for (const c of CHARACTERS) strip.appendChild(Icons.canvas(46, 46, (g) => Icons.head(g, c.id, 23, 25, 42)));
    for (const it of ITEM_KINDS) strip.appendChild(Icons.canvas(46, 46, (g) => Icons.item(g, it, 23, 23, 40)));
    strip.appendChild(Icons.canvas(46, 46, (g) => Icons.key(g, 23, 21, 40)));
  },

  show(name) {
    this.current = name;
    document.querySelectorAll('#ui .screen').forEach((s) => (s.hidden = s.id !== 'scr-' + name));
    document.body.classList.toggle('menu-open', !!name);
    const scr = name && $('scr-' + name);
    if (scr) {
      const f = scr.querySelector('[data-autofocus]') || scr.querySelector('button');
      if (f) setTimeout(() => f.focus({ preventScroll: true }), 30);
    }
    if (name === 'lobby') this.renderLobby();
    if (name === 'garage') this.renderGarage();
  },

  // ---------- lobby ----------
  initLobby() {
    const seg = (id, opts, key) => {
      const wrap = $(id);
      for (const [label, val] of opts) {
        const b = el('button', 'seg-b', label);
        b.type = 'button';
        b.addEventListener('click', () => App.leaderAction(key, val));
        b.dataset.val = String(val);
        wrap.appendChild(b);
      }
    };
    seg('optLaps', [['1', 1], ['2', 2], ['3', 3], ['5', 5]], 'laps');
    seg('optCC', [['50cc', 50], ['100cc', 100], ['150cc', 150], ['200cc', 200]], 'cc');
    seg('optBots', [['On', true], ['Off', false]], 'bots');
    seg('optItems', [['On', true], ['Off', false]], 'items');
    // compact course cards: map, name, difficulty and kind of race, secret route, staff time
    const tp = $('trackPick');
    for (const t of TRACK_DEFS) {
      const b = el('button', 'track-b');
      b.type = 'button';
      b.dataset.track = t.id;
      b.appendChild(trackThumb(t.id, 96, 58));
      b.appendChild(el('span', 'tn', t.name));
      const kind = el('span', 'tk');
      kind.append(difficultyPips(t.difficulty), el('span', 'tkl'));
      b.appendChild(kind);
      b.appendChild(el('span', 'tf'));
      b.addEventListener('click', () => App.leaderAction('track', t.id));
      tp.appendChild(b);
    }
    $('startRace').addEventListener('click', () => App.leaderAction('start'));
    $('addKb').addEventListener('click', () => App.addKeyboard());
    $('addTouch').addEventListener('click', () => {
      Party.localJoin('touch');
      App.refreshShowroom();
    });
    Party.listeners.add(() => {
      if (this.current === 'lobby') this.renderLobby();
      if (this.current === 'garage') this.renderGarage();
      if (this.current === 'results') this.renderResultsGate();
    });
  },

  renderLobby() {
    const s = Party.settings;
    const solo = App.solo;
    $('scr-lobby').classList.toggle('solo', solo);
    // join card
    $('roomCode').textContent = Party.code || '····';
    $('joinUrl').textContent = Party.joinUrl || (window.CLAYKART_EMBED ? 'Phone joining is off in this preview' : 'Starting the party…');
    $('netStatus').textContent = Party.status.text;
    $('netStatus').classList.toggle('ok', Party.status.ok);
    if (Party.joinUrl && this.qrFor !== Party.joinUrl) {
      this.qrFor = Party.joinUrl;
      drawQR($('qr'), Party.joinUrl);
    }
    // settings
    for (const b of $('trackPick').children) {
      const t = TRACK_DEFS.find((d) => d.id === b.dataset.track);
      b.classList.toggle('on', t.id === s.track);
      b.setAttribute('aria-pressed', String(t.id === s.track));
      const secs = courseSections(t);
      const laps = `${s.laps} lap${s.laps > 1 ? 's' : ''}`;
      b.querySelector('.tkl').textContent = secs ? 'Point-to-point' : laps;
      // sections · secret route · staff time (only the secret-route label gives way if it's tight)
      const routes = Save.data.routes[t.id];
      const staff = t.staff && t.staff[s.cc];
      const tf = b.querySelector('.tf');
      tf.textContent = '';
      if (secs) tf.appendChild(el('span', '', `${secs} sections`));
      tf.appendChild(el('span', 'sr', routes && Object.keys(routes).length ? '🔑 secret found' : '🔒 secret route'));
      if (staff > 0) tf.appendChild(el('span', '', '⏱ ' + fmtTime(staff)));
      b.title = `${t.name}: ${secs ? `point-to-point, ${secs} sections` : laps}, difficulty ${t.difficulty || 1} of 4` + (staff > 0 ? `, staff time ${fmtTime(staff)} at ${s.cc}cc` : '');
    }
    const mark = (id, v) => {
      for (const b of $(id).children) {
        const on = b.dataset.val === String(v);
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      }
    };
    mark('optLaps', s.laps);
    mark('optCC', s.cc);
    mark('optBots', s.bots);
    mark('optItems', s.items);
    // a point-to-point run is one trip down the mountain: no laps to choose
    const course = TRACK_DEFS.find((t) => t.id === s.track);
    const p2p = !!(course && course.p2p);
    for (const b of $('optLaps').children) b.disabled = p2p;
    $('lapsNote').hidden = !p2p;
    if (p2p) $('lapsNote').textContent = `${course.name} is one run in ${courseSections(course)} sections`;
    // the lobby list: in a party (anyone on a phone) every racer shows whether they are ready,
    // and the strip above the cards counts them up
    const party = Party.list().some((q) => q.kind === 'phone');
    const isReady = (q) => q.kind !== 'phone' || q.ready;
    const seated = Party.list();
    $('readyBar').hidden = !party;
    if (party) {
      const ready = seated.filter(isReady).length, waitingFor = Party.waiting();
      $('readyBar').classList.toggle('all', ready === seated.length);
      $('readyCount').textContent = `${ready} of ${seated.length} ready`;
      $('readyWho').textContent = waitingFor.length ? `Waiting for ${Party.names(waitingFor)}` : "Everyone's ready: start the race!";
      const pips = $('readyPips');
      pips.innerHTML = '';
      for (const q of seated) {
        const i = el('i', isReady(q) ? 'on' : '', isReady(q) ? '✓' : '');
        i.style.setProperty('--sc', SLOT_COLORS[q.slot]);
        i.title = `P${q.slot + 1} ${q.name}: ${isReady(q) ? 'ready' : 'not ready'}`;
        pips.appendChild(i);
      }
    }
    // slots
    const wrap = $('slots');
    wrap.innerHTML = '';
    Party.players.forEach((p, slot) => {
      const card = el('div', 'slot' + (p ? ' filled' : ''));
      card.style.setProperty('--sc', SLOT_COLORS[slot]);
      const head = el('div', 'slot-head', 'P' + (slot + 1));
      card.appendChild(head);
      if (!p) {
        card.appendChild(el('p', 'slot-empty', solo ? 'Free seat' : 'Scan the QR code, or press A on a gamepad'));
      } else {
        const row = el('div', 'slot-row');
        row.appendChild(Icons.canvas(44, 44, (g) => Icons.head(g, p.config.character, 22, 24, 40)));
        const info = el('div', 'slot-info');
        info.appendChild(el('b', '', p.name));
        const dev = p.kind === 'phone' ? (p.connected ? '📱 Phone' : '📱 Reconnecting…') : SOURCE_LABELS[p.src] || (p.src.startsWith('pad') ? '🎮 Gamepad ' + (Number(p.src.slice(3)) + 1) : p.src);
        info.appendChild(el('small', '', dev));
        row.appendChild(info);
        card.appendChild(row);
        let st;
        if (party) {
          // a racer on this screen is always ready; a phone only once it has tapped Ready
          const ok = isReady(p);
          st = el('div', 'slot-state pill' + (ok ? ' ready' : ''), ok ? '✓ Ready' : p.connected === false ? 'Reconnecting' : 'Not ready');
          card.classList.add(ok ? 'is-ready' : 'not-ready');
        } else st = el('div', 'slot-state ready', findPart('character', p.config.character).name);
        card.appendChild(st);
        const acts = el('div', 'slot-acts');
        const gb = el('button', '', 'Garage');
        gb.type = 'button';
        gb.addEventListener('click', () => {
          this.garage.slot = slot;
          App.menu('garage');
        });
        const rb = el('button', 'x', '✕');
        rb.type = 'button';
        rb.title = 'Remove ' + p.name;
        rb.setAttribute('aria-label', 'Remove ' + p.name);
        rb.addEventListener('click', () => {
          Party.remove(slot);
          App.refreshShowroom();
        });
        acts.append(gb, rb);
        card.appendChild(acts);
      }
      wrap.appendChild(card);
    });
    const n = Party.list().length;
    // everyone has to be ready before the race can start
    const start = $('startRace');
    const waiting = Party.waiting();
    start.disabled = n === 0 || waiting.length > 0;
    const field = s.bots ? ' + bots' : App.staffGhostOn() ? ' vs the Staff Ghost' : '';
    $('startHint').textContent = n === 0 ? 'Add a racer to start' : waiting.length ? `Waiting for ${Party.names(waiting)} to tap Ready` : `${n} racer${n > 1 ? 's' : ''}${field} on ${course.name}`;
    $('addTouch').hidden = !matchMedia('(pointer: coarse)').matches || Party.list().some((p) => p.src === 'touch');
  },

  // ---------- garage ----------
  initGarage() {
    const tabs = $('garageTabs');
    for (const k of CATALOG_KINDS) {
      const b = el('button', 'tab', KIND_LABELS[k]);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.dataset.kind = k;
      b.addEventListener('click', () => {
        this.garage.kind = k;
        this.renderGarage();
      });
      tabs.appendChild(b);
    }
    $('garageDone').addEventListener('click', () => App.menu('back'));
  },

  garagePlayer() {
    let p = Party.players[this.garage.slot];
    if (!p) {
      p = Party.list()[0];
      if (p) this.garage.slot = p.slot;
    }
    return p;
  },

  // The wallet of whoever is in the garage (with nobody seated: the keyboard's).
  garageWallet() {
    const p = this.garagePlayer();
    return p ? Save.wallet(p) : Save.wallet('local:kb');
  },

  renderGarage() {
    const G = this.garage;
    const p = this.garagePlayer();
    const w = this.garageWallet();
    $('bank').textContent = w.coins;
    // who is being configured
    const who = $('garageWho');
    who.innerHTML = '';
    for (const q of Party.list()) {
      const b = el('button', 'who-b' + (q === p ? ' on' : ''), `P${q.slot + 1} ${q.name}`);
      b.type = 'button';
      b.style.setProperty('--sc', SLOT_COLORS[q.slot]);
      b.addEventListener('click', () => {
        G.slot = q.slot;
        this.renderGarage();
        App.refreshShowroom();
      });
      who.appendChild(b);
    }
    for (const b of $('garageTabs').children) {
      b.classList.toggle('on', b.dataset.kind === G.kind);
      b.setAttribute('aria-selected', String(b.dataset.kind === G.kind));
    }
    const cfg = p ? p.config : Save.ownedConfig(Save.data.local.kb && Save.data.local.kb.config, w);
    const parts = $('garageParts');
    parts.innerHTML = '';
    for (const part of CATALOG[G.kind]) {
      const owned = Save.owns(w, G.kind, part.id);
      const on = cfg[G.kind] === part.id;
      const b = el('button', 'part' + (on ? ' on' : '') + (owned ? '' : ' locked'));
      b.type = 'button';
      b.appendChild(Icons.canvas(64, 52, (g) => Icons.part(g, G.kind, part, 32, 26, 50, cfg)));
      b.appendChild(el('span', 'pn', part.name));
      b.appendChild(el('span', 'pp', owned ? (on ? 'Selected' : 'Owned') : `🪙 ${part.price}`));
      b.addEventListener('focus', () => this.describe(part, cfg));
      b.addEventListener('mouseenter', () => this.describe(part, cfg));
      b.addEventListener('click', () => this.pick(part));
      parts.appendChild(b);
    }
    this.describe(findPart(G.kind, cfg[G.kind]), cfg);
    $('garageName').textContent = p ? `${p.name}'s kart` : 'Your kart';
  },

  describe(part, cfg) {
    const G = this.garage;
    const owned = Save.owns(this.garageWallet(), G.kind, part.id);
    $('partBlurb').textContent = (part.blurb || (part.special ? 'A shimmering special paint.' : 'A fresh coat of clay paint.')) + (owned ? '' : `  Costs ${part.price} coins.`);
    const now = kartStats(cfg);
    const next = kartStats(Object.assign({}, cfg, { [G.kind]: part.id }));
    const dl = $('statBars');
    dl.innerHTML = '';
    for (const s of STAT_KEYS) {
      dl.appendChild(el('dt', '', STAT_LABELS[s]));
      const dd = el('dd');
      const bar = el('div', 'bar');
      const a = el('i', 'now');
      a.style.width = (now[s] / 6) * 100 + '%';
      const b = el('i', next[s] > now[s] ? 'up' : 'down');
      b.style.left = (Math.min(now[s], next[s]) / 6) * 100 + '%';
      b.style.width = (Math.abs(next[s] - now[s]) / 6) * 100 + '%';
      bar.append(a, b);
      dd.appendChild(bar);
      dl.appendChild(dd);
    }
  },

  pick(part) {
    const G = this.garage;
    const p = this.garagePlayer();
    const w = this.garageWallet();
    if (!Save.owns(w, G.kind, part.id)) {
      const err = Save.buy(w, G.kind, part.id);
      if (err) {
        Sound.play('locked');
        App.toast(err);
        return;
      }
      Sound.play('buy');
      App.toast(`Bought ${part.name}!`);
    } else Sound.play('select');
    if (p) {
      const cfg = Object.assign({}, p.config, { [G.kind]: part.id });
      Party.setLocalConfig(p, cfg);
      if (p.kind === 'phone' && Party.link) Party.link.send(p.pid, { t: 'welcome', slot: p.slot, color: SLOT_COLORS[p.slot], name: p.name, config: p.config });
    } else {
      Save.data.local.kb = { config: Object.assign({}, Save.ownedConfig(Save.data.local.kb && Save.data.local.kb.config, w), { [G.kind]: part.id }) };
      Save.persist();
    }
    this.renderGarage();
    App.refreshShowroom();
    // keep focus on the same card after the re-render
    const idx = CATALOG[G.kind].indexOf(part);
    const btn = $('garageParts').children[idx];
    if (btn) btn.focus({ preventScroll: true });
  },

  // ---------- results ----------
  // secs: the number of sections of a point-to-point run (0 on a circuit), which swaps the best
  // lap for the time taken over each section.
  renderResults(rows, news, secs = 0) {
    const t = $('resultsTable');
    t.innerHTML = '';
    t.classList.toggle('p2p', secs > 0);
    const head = el('tr');
    for (const h of ['', 'Racer', 'Time', secs ? 'Sections' : 'Best lap', 'Coins']) head.appendChild(el('th', '', h));
    t.appendChild(head);
    for (const r of rows) {
      const tr = el('tr', r.slot >= 0 ? 'human' : '');
      if (r.slot >= 0) tr.style.setProperty('--sc', SLOT_COLORS[r.slot]);
      tr.appendChild(el('td', 'pos', ordinal(r.place)));
      const who = el('td', 'who');
      who.appendChild(Icons.canvas(30, 30, (g) => Icons.head(g, r.config.character, 15, 16, 28)));
      who.appendChild(el('span', '', r.slot >= 0 ? `P${r.slot + 1} ${r.name}` : r.name));
      tr.appendChild(who);
      tr.appendChild(el('td', '', (r.finished ? '' : '~') + fmtTime(r.time)));
      if (secs) tr.appendChild(el('td', 'splits', sectionTimes(r, secs).map(fmtSplit).join(' · ')));
      else tr.appendChild(el('td', '', r.bestLap ? fmtTime(r.bestLap) : '—'));
      tr.appendChild(el('td', '', r.slot >= 0 ? `+${r.earned}` : String(r.coins)));
      t.appendChild(tr);
    }
    const n = $('resultsNews');
    n.hidden = !news.length;
    n.textContent = news.join('  ·  ');
    $('resultsTitle').textContent = rows.some((r) => r.slot >= 0 && r.place === 1) ? 'Victory!' : 'Results';
    this.renderResultsGate();
  },
  // The next race waits for everyone to be ready (a phone that joined during the race, or one
  // that un-readied to change its kart).
  renderResultsGate() {
    const waiting = Party.waiting();
    $('resNext').disabled = $('resAgain').disabled = waiting.length > 0;
    $('resultsWait').hidden = !waiting.length;
    $('resultsWait').textContent = waiting.length ? `Waiting for ${Party.names(waiting)} to tap Ready` : '';
  },
};

// Number of sections of a point-to-point course (0 for a circuit).
function courseSections(def) {
  return def && def.p2p ? (def.sections || []).length || 1 : 0;
}

// Four pips for a course's difficulty (1 easiest .. 4 hardest), coloured by how hard it is.
function difficultyPips(n) {
  n = U.clamp(n || 1, 1, 4);
  const wrap = el('i', 'pips d' + n);
  wrap.setAttribute('aria-label', `Difficulty ${n} of 4`);
  for (let i = 0; i < 4; i++) wrap.appendChild(el('b', i < n ? 'on' : ''));
  return wrap;
}

// Time spent on each section of a point-to-point run, from a results row: the splits are the
// race times at the start of sections 2..n. null where the racer never got that far.
function sectionTimes(r, n) {
  const marks = [0].concat(r.splits || []);
  const out = [];
  for (let i = 0; i < n; i++) {
    const end = i + 1 < marks.length ? marks[i + 1] : i + 1 === marks.length && r.finished ? r.time : null;
    out.push(marks[i] !== undefined && end !== null ? end - marks[i] : null);
  }
  return out;
}
// Short times for the results table: 27.4, or 1:02.3 from a minute up.
function fmtSplit(t) {
  if (t === null || !isFinite(t) || t <= 0) return '—';
  if (t < 60) return t.toFixed(1);
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}

// Mini course map for the track picker.
function trackThumb(id, w, h) {
  return Icons.canvas(w, h, (g) => {
    const T = getTrack(id);
    const b = T.bounds;
    const sc = Math.min((w - 10) / (b.maxX - b.minX - 80), (h - 10) / (b.maxZ - b.minZ - 80));
    const mx = (b.minX + b.maxX) / 2, mz = (b.minZ + b.maxZ) / 2;
    g.lineJoin = g.lineCap = 'round';
    for (const [lw, col] of [[6, '#2b1838'], [3, '#fff6ea']]) {
      for (const p of T.paths) {
        g.strokeStyle = p.branch && col !== '#2b1838' ? '#c9b3ee' : col;
        g.lineWidth = p.branch ? lw - 1.5 : lw;
        g.setLineDash(p.branch && col !== '#2b1838' ? [3, 3] : []);
        g.beginPath();
        for (let i = 0; i < p.n; i += 3) {
          const x = w / 2 + (p.x[i] - mx) * sc, y = h / 2 + (p.z[i] - mz) * sc;
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        if (p.closed) g.closePath();
        g.stroke();
      }
    }
    g.setLineDash([]);
    // the start line (pink), and on a point-to-point run the finish too (chequered)
    const dot = (s, fill, r) => {
      const i = T.main.indexAt(s);
      g.fillStyle = fill;
      g.beginPath();
      g.arc(w / 2 + (T.main.x[i] - mx) * sc, h / 2 + (T.main.z[i] - mz) * sc, r, 0, TAU);
      g.fill();
    };
    if (T.p2p) {
      dot(T.finishS, '#2b1838', 4);
      dot(T.finishS, '#fff6ea', 2.6);
    }
    dot(T.startS || 0, '#ff6f91', 3);
  });
}

function drawQR(canvas, text) {
  const g = canvas.getContext('2d');
  const W = canvas.width;
  g.fillStyle = '#fff6ea';
  g.fillRect(0, 0, W, W);
  if (typeof qrcode !== 'function') return;
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  const cell = Math.floor((W - 16) / n);
  const off = Math.floor((W - cell * n) / 2);
  g.fillStyle = '#2b1838';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) g.fillRect(off + c * cell, off + r * cell, cell, cell);
}
