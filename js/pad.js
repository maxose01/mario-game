'use strict';
// The phone controller. Join a room, build and buy your kart, tap Ready, then race with
// drag (or tilt, or arrow-button) steering, a hold-to-drift button and an item button.
// It talks to the big screen through net.js; the big screen runs the actual race.

const P = {
  link: null,
  id: null,
  slot: 0,
  name: '',
  config: Object.assign({}, DEFAULT_KART),
  owned: freeParts(),
  bank: 0,
  settings: null,
  tracks: [],
  leader: false,
  ready: false,
  phase: 'join',
  kind: 'character',
  // controls
  steer: 0,
  dragSteer: 0,
  tiltSteer: 0,
  held: { left: false, right: false, drift: false, brake: false, gas: false },
  itemCount: 0,
  back: false,
  opts: { steer: 'drag', autoGas: true, haptics: 'full' },
};
const $ = (id) => document.getElementById(id);
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
const ordinal = (n) => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');

function boot() {
  Clay.init();
  P.id = Store.get('claykart.pad.id', null);
  if (!P.id) {
    P.id = Math.random().toString(36).slice(2, 12);
    Store.set('claykart.pad.id', P.id);
  }
  const opts = Store.get('claykart.pad.opts', {});
  Object.assign(P.opts, opts);
  // older controllers saved an on/off vibration switch
  if (typeof P.opts.buzz === 'boolean') {
    if (!opts.haptics) P.opts.haptics = P.opts.buzz ? 'full' : 'off';
    delete P.opts.buzz;
  }
  Buzz.init(P.opts.haptics);
  const saved = Store.get('claykart.pad.profile', {});
  P.name = saved.name || '';
  if (saved.config) P.config = sanitizeKart(saved.config);
  const q = new URLSearchParams(location.search);
  $('code').value = (q.get('room') || saved.room || '').toUpperCase().slice(0, 4);
  $('name').value = P.name;
  if ($('code').value) $('name').focus();
  $('joinForm').addEventListener('submit', (e) => {
    e.preventDefault();
    join();
  });
  $('code').addEventListener('input', () => ($('code').value = $('code').value.toUpperCase().replace(/[^A-Z]/g, '')));
  $('overlayBtn').addEventListener('click', () => location.reload());
  buildLobby();
  buildRace();
  buildResults();
  // auto-join straight from the QR code if we already know this phone's name
  if (q.get('room') && P.name) join();
}

function show(v) {
  P.phase = v;
  for (const id of ['join', 'lobby', 'race', 'results']) $('v-' + id).hidden = id !== v;
  document.body.dataset.phase = v;
}
function overlay(text, retry) {
  $('overlay').hidden = !text;
  $('overlayText').textContent = text || '';
  $('overlayBtn').hidden = !retry;
}

// ---------- connection ----------
function join() {
  const code = $('code').value.trim().toUpperCase();
  P.name = $('name').value.trim().slice(0, 12) || 'Racer';
  if (code.length !== 4) {
    $('joinErr').textContent = 'The room code has 4 letters (it is on the big screen).';
    return;
  }
  Store.set('claykart.pad.profile', { name: P.name, config: P.config, room: code });
  overlay('Connecting to the big screen…');
  const online = new URLSearchParams(location.search).get('online') === '1';
  if (P.link) P.link.close();
  P.link = new PadLink(code, { id: P.id, name: P.name, config: P.config }, {
    onOpen: () => {
      P.retries = 0;
      overlay(null);
      $('joinErr').textContent = '';
      if (P.phase === 'join') show('lobby');
      wakeLock();
    },
    onMessage: (m) => onMessage(m),
    onClose: (reason) => {
      // dropped mid-party: quietly try to get back in (the big screen keeps our seat)
      if (reason === 'lost' && P.phase !== 'join' && (P.retries = (P.retries || 0) + 1) <= 20) {
        overlay('Reconnecting to the big screen…');
        setTimeout(join, 1500);
        return;
      }
      const msg = {
        'no-room': 'No game with that room code. Check the code on the big screen.',
        full: 'This race is full (four racers).',
        lost: 'Lost the connection to the big screen.',
        'no-server': 'Could not reach the big screen. Are you on the same Wi-Fi?',
        'no-peerjs': 'Could not load the online connector.',
        network: 'Network trouble. Check your connection.',
      }[reason] || 'Disconnected.';
      if (P.phase === 'join') {
        overlay(null);
        $('joinErr').textContent = msg;
      } else overlay(msg, true);
    },
    onHost: (present) => {
      if (present) P.resync = true;
      overlay(present ? null : 'The big screen went away. Waiting for it to come back…');
    },
  }, online);
  P.link.connect();
}
function send(m) {
  if (P.link) P.link.send(m);
}

function onMessage(m) {
  if (!m || typeof m !== 'object') return;
  switch (m.t) {
    case 'welcome':
      P.slot = m.slot;
      P.name = m.name;
      if (P.resync) {
        // the big screen reloaded: it only knows our first hello, so remind it
        P.resync = false;
        send({ t: 'cfg', config: P.config });
        if (P.ready) send({ t: 'ready', v: true });
      } else P.config = sanitizeKart(m.config);
      document.documentElement.style.setProperty('--slot', m.color);
      markSlot();
      renderLobby();
      break;
    case 'state':
      P.slot = m.slot;
      P.name = m.name;
      P.leader = m.leader;
      P.ready = m.ready;
      P.config = sanitizeKart(m.config);
      P.owned = m.owned || P.owned;
      P.bank = m.bank;
      P.settings = m.settings;
      P.tracks = m.tracks || [];
      P.players = m.players || [];
      document.documentElement.style.setProperty('--slot', m.color);
      markSlot();
      Store.set('claykart.pad.profile', { name: P.name, config: P.config, room: m.code || $('code').value });
      // joined while a race is already running? wait in the garage for the next one
      if (m.phase === 'race' && m.racing !== false) show('race');
      else if (m.phase === 'results' && P.haveResults) show('results');
      else show('lobby');
      renderLobby();
      if (m.phase === 'race' && m.racing === false) $('meStatus').textContent = 'A race is on: you join the next one!';
      break;
    case 'go':
      P.haveResults = false;
      $('hLap').textContent = m.secs ? `Section 1/${m.secs}` : `Lap 1/${P.settings ? P.settings.laps : 3}`;
      show('race');
      goFullscreen();
      break;
    case 'hud':
      renderHud(m);
      break;
    case 'hx':
      // jolts: [[name, strength], ...]
      if (Array.isArray(m.e)) for (const [name, s] of m.e) Buzz.play(name, s);
      break;
    case 'hr':
      Buzz.rumble(m.a, m.f, m.j);
      break;
    case 'fx':
      if (m.k === 'finallap') banner('FINAL LAP!');
      if (m.k === 'section') banner(`Section ${m.n}` + (m.name ? '\n' + m.name : ''), 2);
      if (m.k === 'finalsection') banner('FINAL SECTION!' + (m.name ? '\n' + m.name : ''), 2.2);
      if (m.k === 'key') banner('🔑 Find the gate!');
      if (m.k === 'gate') banner('Secret route!');
      break;
    case 'bought':
      if (m.err) toast(m.err);
      break;
    case 'results':
      Buzz.stop();
      renderResults(m);
      show('results');
      break;
    case 'paused':
      if (m.v) Buzz.stop();
      banner(m.v ? 'Paused' : 'Go!');
      break;
    case 'full':
      overlay('This race is full (four racers). Ask someone to free a seat.', true);
      break;
    case 'kicked':
      overlay('You were removed from the race.', true);
      P.link.close();
      break;
    case 'pong':
      P.ping = performance.now() - m.c;
      break;
  }
}

// The player lights on the controller's rail: the one for your seat is lit.
function markSlot() {
  const leds = document.querySelectorAll('.joy-r .rail b');
  leds.forEach((b, i) => b.classList.toggle('on', i === P.slot));
}

// ---------- lobby / garage ----------
function buildLobby() {
  for (const k of CATALOG_KINDS) {
    const b = el('button', '', KIND_LABELS[k]);
    b.type = 'button';
    b.dataset.kind = k;
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => {
      P.kind = k;
      renderLobby();
    });
    $('tabs').appendChild(b);
  }
  $('readyBtn').addEventListener('click', () => {
    P.ready = !P.ready;
    send({ t: 'ready', v: P.ready });
    renderLobby();
    Buzz.play('ready');
  });
  const seg = (id, opts, act) => {
    for (const [label, v] of opts) {
      const b = el('button', '', label);
      b.type = 'button';
      b.dataset.v = String(v);
      b.addEventListener('click', () => send({ t: 'lead', act, v }));
      $(id).appendChild(b);
    }
  };
  seg('sLaps', [['1', 1], ['2', 2], ['3', 3], ['5', 5]], 'laps');
  seg('sCC', [['50', 50], ['100', 100], ['150', 150], ['200', 200]], 'cc');
  seg('sBots', [['On', true], ['Off', false]], 'bots');
  seg('sItems', [['On', true], ['Off', false]], 'items');
  $('leadStart').addEventListener('click', () => send({ t: 'lead', act: 'start' }));
}

function owns(kind, id) {
  return !!P.owned[partKey(kind, id)];
}

function renderLobby() {
  $('badge').textContent = 'P' + (P.slot + 1);
  $('meName').textContent = P.name;
  $('meStatus').textContent = P.ready ? 'Ready! Waiting for the race to start' : 'Pick your racer and kart, then tap Ready';
  $('bank').textContent = P.bank;
  for (const b of $('tabs').children) b.classList.toggle('on', b.dataset.kind === P.kind);
  const wrap = $('parts');
  wrap.innerHTML = '';
  for (const part of CATALOG[P.kind]) {
    const own = owns(P.kind, part.id);
    const on = P.config[P.kind] === part.id;
    const b = el('button', 'part' + (on ? ' on' : '') + (own ? '' : ' locked'));
    b.type = 'button';
    b.appendChild(Icons.canvas(64, 50, (g) => Icons.part(g, P.kind, part, 32, 25, 48, P.config)));
    b.appendChild(el('span', 'pn', part.name));
    b.appendChild(el('span', 'pp', own ? (on ? 'Selected' : 'Owned') : `🪙 ${part.price}`));
    b.addEventListener('click', () => pick(part));
    wrap.appendChild(b);
  }
  describe(findPart(P.kind, P.config[P.kind]));
  const rb = $('readyBtn');
  rb.textContent = P.ready ? '✓ Ready (tap to change)' : "I'm ready!";
  rb.classList.toggle('on', P.ready);
  // leader controls: every course with its difficulty, laps (or sections) and secret route
  $('leadCard').hidden = !P.leader || !P.settings;
  if (P.leader && P.settings) {
    const tr = $('tracks');
    tr.innerHTML = '';
    const laps = P.settings.laps;
    for (const t of P.tracks) {
      const b = el('button', t.id === P.settings.track ? 'on' : '');
      b.type = 'button';
      b.dataset.track = t.id;
      const head = el('span', 'tt');
      head.append(el('b', '', t.name), difficultyPips(t.difficulty));
      b.appendChild(head);
      const kind = t.sections ? `Point-to-point · ${t.sections} sections` : `${laps} lap${laps > 1 ? 's' : ''}`;
      const bits = [kind, t.found ? '🔑 secret route found' : '🔒 secret route hidden'];
      if (t.staff) bits.push('⏱ staff ' + t.staff);
      b.appendChild(el('small', '', bits.join(' · ')));
      b.addEventListener('click', () => send({ t: 'lead', act: 'track', v: t.id }));
      tr.appendChild(b);
    }
    const mark = (id, v) => {
      for (const b of $(id).children) b.classList.toggle('on', b.dataset.v === String(v));
    };
    mark('sLaps', P.settings.laps);
    mark('sCC', P.settings.cc);
    mark('sBots', P.settings.bots);
    mark('sItems', P.settings.items);
    // a point-to-point course is one run: no laps to pick
    const course = P.tracks.find((t) => t.id === P.settings.track);
    const p2p = !!(course && course.sections);
    for (const b of $('sLaps').children) b.disabled = p2p;
    $('lapsNote').hidden = !p2p;
    if (p2p) $('lapsNote').textContent = `${course.name} is one run from top to bottom in ${course.sections} sections.`;
  }
  const pl = $('players');
  pl.innerHTML = '';
  for (const q of P.players || []) {
    if (!q) continue;
    const s = el('span', '', `P${q.slot + 1} ${q.name}${q.ready || q.kind === 'local' ? ' ✓' : ''}`);
    s.style.setProperty('--c', SLOT_COLORS[q.slot]);
    pl.appendChild(s);
  }
}

// Four pips for a course's difficulty (1 easiest .. 4 hardest).
function difficultyPips(n) {
  n = U.clamp(n || 1, 1, 4);
  const wrap = el('i', 'pips d' + n);
  wrap.setAttribute('aria-label', `Difficulty ${n} of 4`);
  for (let i = 0; i < 4; i++) wrap.appendChild(el('b', i < n ? 'on' : ''));
  return wrap;
}

function describe(part) {
  $('blurb').textContent = (part.blurb || (part.special ? 'A shimmering special paint.' : 'A fresh coat of clay paint.')) + (owns(P.kind, part.id) ? '' : ` Costs ${part.price} coins from the party bank.`);
  const now = kartStats(P.config);
  const next = kartStats(Object.assign({}, P.config, { [P.kind]: part.id }));
  const dl = $('stats');
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
}

function pick(part) {
  if (!owns(P.kind, part.id)) {
    if (P.bank < part.price) {
      toast(`Needs ${part.price - P.bank} more coins. Win races to fill the bank!`);
      describe(part);
      return;
    }
    send({ t: 'buy', kind: P.kind, id: part.id });
    return;
  }
  P.config[P.kind] = part.id;
  send({ t: 'cfg', config: P.config });
  Store.set('claykart.pad.profile', { name: P.name, config: P.config, room: $('code').value });
  renderLobby();
}

let toastT = 0;
function toast(text) {
  const o = $('meStatus');
  o.textContent = text;
  clearTimeout(toastT);
  toastT = setTimeout(renderLobby, 2600);
}

// ---------- race controller ----------
function buildRace() {
  const steer = $('steer');
  let pid = null, x0 = 0;
  steer.addEventListener('pointerdown', (e) => {
    if (P.opts.steer !== 'drag') return;
    pid = e.pointerId;
    x0 = e.clientX;
    steer.setPointerCapture(pid);
  });
  steer.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid) return;
    const w = Math.max(80, steer.clientWidth * 0.28);
    const was = P.dragSteer;
    P.dragSteer = U.clamp((e.clientX - x0) / w, -1, 1);
    // the wheel clicks through the centre and knocks at full lock
    if (Math.abs(P.dragSteer) >= 1 && Math.abs(was) < 1) Buzz.click(12);
    else if ((was < 0 && P.dragSteer >= 0) || (was > 0 && P.dragSteer <= 0)) Buzz.click(5);
    // recentre the anchor when dragging past full lock, so reversing is instant
    if (Math.abs(e.clientX - x0) > w) x0 = e.clientX - Math.sign(e.clientX - x0) * w;
  });
  const end = (e) => {
    if (e.pointerId !== pid) return;
    pid = null;
    P.dragSteer = 0;
  };
  steer.addEventListener('pointerup', end);
  steer.addEventListener('pointercancel', end);

  for (const b of document.querySelectorAll('#v-race [data-b]')) {
    const act = b.dataset.b;
    let y0 = 0;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      b.classList.add('down');
      y0 = e.clientY;
      Buzz.click();
      if (act === 'item') {
        P.back = false;
        return;
      }
      if (act === 'back') {
        // Y: use the item, thrown backwards
        P.back = true;
        P.itemCount++;
        sendInput();
        return;
      }
      P.held[act] = true;
      sendInput();
    });
    b.addEventListener('pointermove', (e) => {
      if (act === 'item' && b.classList.contains('down')) P.back = e.clientY - y0 > 40;
    });
    const up = (e) => {
      if (!b.classList.contains('down')) return;
      b.classList.remove('down');
      if (act === 'item') {
        P.itemCount++;
        sendInput();
        P.back = false;
        return;
      }
      if (act === 'back') {
        P.back = false;
        sendInput();
        return;
      }
      P.held[act] = false;
      sendInput();
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
  }
  const seg = (id, opts, key) => {
    for (const [label, v] of opts) {
      const b = el('button', '', label);
      b.type = 'button';
      b.dataset.v = String(v);
      b.addEventListener('click', () => {
        if (key === 'steer' && v === 'tilt') return enableTilt();
        P.opts[key] = v;
        Store.set('claykart.pad.opts', P.opts);
        applyOpts();
        // feel the new strength straight away
        if (key === 'haptics') {
          Buzz.setLevel(v);
          Buzz.play('sample');
        }
      });
      $(id).appendChild(b);
    }
  };
  seg('optSteer', [['Drag', 'drag'], ['Tilt', 'tilt'], ['Buttons', 'buttons']], 'steer');
  seg('optGas', [['On', true], ['Off', false]], 'autoGas');
  seg('optBuzz', [['Off', 'off'], ['Light', 'light'], ['Strong', 'full']], 'haptics');
  $('menuBtn').addEventListener('click', () => {
    Buzz.click();
    $('sheet').hidden = false;
  });
  $('plusBtn').addEventListener('click', () => {
    Buzz.click();
    send({ t: 'pause' });
  });
  $('sheetClose').addEventListener('click', () => ($('sheet').hidden = true));
  $('fsBtn').addEventListener('click', goFullscreen);
  $('pauseBtn').addEventListener('click', () => {
    send({ t: 'pause' });
    $('sheet').hidden = true;
  });
  applyOpts();
  setInterval(() => {
    if (P.phase === 'race') sendInput();
  }, 50);
  setInterval(() => send({ t: 'ping', c: performance.now() }), 3000);
  requestAnimationFrame(animateWheel);
}

function applyOpts() {
  const o = P.opts;
  if (o.steer === 'tilt' && !P.tiltOk) o.steer = 'drag';
  $('arrows').hidden = o.steer !== 'buttons';
  $('wheel').hidden = o.steer === 'buttons';
  $('steerHint').textContent = o.steer === 'tilt' ? 'Tilt your phone like a steering wheel' : o.steer === 'drag' ? 'Drag left and right to steer' : '';
  // Y throws your item backwards, or is the gas pedal when auto-gas is off
  $('v-race').querySelector('.b-gas').hidden = o.autoGas;
  $('v-race').querySelector('.b-back').hidden = !o.autoGas;
  for (const [id, key] of [['optSteer', 'steer'], ['optGas', 'autoGas'], ['optBuzz', 'haptics']]) {
    for (const b of $(id).children) b.classList.toggle('on', b.dataset.v === String(o[key]));
  }
  const sup = Buzz.support;
  $('buzzNote').hidden = sup === 'full';
  $('buzzNote').textContent = sup === 'taps' ? 'iPhones have no vibration motor control for web pages: you feel single taps for the big moments (where iOS allows them), but no rumble.' : 'This browser cannot vibrate the phone.';
  const tiltBtn = $('optSteer').children[1];
  tiltBtn.disabled = !window.DeviceOrientationEvent || !window.isSecureContext;
  if (tiltBtn.disabled) tiltBtn.title = 'Tilt steering needs an https page (online mode)';
}

async function enableTilt() {
  try {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r !== 'granted') throw new Error('denied');
    }
    window.addEventListener('deviceorientation', (e) => {
      const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      // landscape: front-back tilt steers; portrait: side tilt steers
      let v = angle === 90 ? e.beta : angle === -90 || angle === 270 ? -e.beta : e.gamma;
      if (v === null || v === undefined) return;
      P.tiltOk = true;
      P.tiltSteer = U.clamp(v / 28, -1, 1);
    });
    P.tiltOk = true;
    P.opts.steer = 'tilt';
    Store.set('claykart.pad.opts', P.opts);
  } catch (e) {
    toast('Tilt steering is not available here');
  }
  applyOpts();
}

function currentSteer() {
  const o = P.opts;
  if (o.steer === 'buttons') return (P.held.right ? 1 : 0) - (P.held.left ? 1 : 0);
  if (o.steer === 'tilt') return Math.abs(P.tiltSteer) < 0.06 ? 0 : P.tiltSteer;
  return P.dragSteer;
}

let lastSent = '';
function sendInput() {
  const s = Math.round(currentSteer() * 100) / 100;
  const brake = P.held.brake;
  const msg = { t: 'in', s, g: P.opts.autoGas ? !brake : P.held.gas, b: brake, d: P.held.drift, i: P.itemCount, k: P.back, a: P.opts.autoGas };
  const key = JSON.stringify(msg);
  // resend at least every 250 ms so a dropped packet heals quickly
  const now = performance.now();
  if (key === lastSent && now - (sendInput.t || 0) < 250) return;
  lastSent = key;
  sendInput.t = now;
  send(msg);
}

function animateWheel() {
  requestAnimationFrame(animateWheel);
  if (P.phase !== 'race') return;
  const s = currentSteer();
  $('wheel').style.transform = `rotate(${s * 90}deg)`;
  if (Math.abs(s - (animateWheel.last || 0)) > 0.04) {
    animateWheel.last = s;
    sendInput();
  }
}

function renderHud(m) {
  if (P.phase !== 'race') show('race');
  $('hPlace').textContent = ordinal(m.place);
  $('hLap').textContent = m.secs ? `Section ${m.sec}/${m.secs}` : `Lap ${m.lap}/${m.laps}`;
  $('hCoins').textContent = m.coins;
  $('hKey').hidden = !m.key;
  const box = $('hItem');
  const key = (m.item || '') + (m.itemN || '');
  if (box.dataset.k !== key) {
    box.dataset.k = key;
    box.innerHTML = '';
    if (m.item === '?') box.appendChild(el('b', '', '?'));
    else if (m.item) box.appendChild(Icons.canvas(44, 44, (g) => Icons.item(g, m.item, 22, 22, 38)));
  }
  const drift = document.querySelector('.b-drift');
  drift.classList.toggle('lvl1', m.drift === 1);
  drift.classList.toggle('lvl2', m.drift === 2);
  drift.classList.toggle('lvl3', m.drift === 3);
  if (m.state === 'countdown' && m.count) banner(m.count + (P.opts.autoGas ? '\nHold Drift on 1 for a rocket start' : ''), 0.9);
  else if (m.wrong) banner('Wrong way!', 0.5);
  else if (m.finished && !P.finBanner) {
    P.finBanner = true;
    banner(ordinal(m.place) + '!', 3);
  }
  if (!m.finished) P.finBanner = false;
}

let bannerT = 0;
function banner(text, secs = 1.6) {
  const b = $('banner');
  b.textContent = text;
  b.hidden = false;
  clearTimeout(bannerT);
  bannerT = setTimeout(() => (b.hidden = true), secs * 1000);
}

// ---------- results ----------
function buildResults() {
  for (const b of document.querySelectorAll('[data-lead]')) b.addEventListener('click', () => send({ t: 'lead', act: b.dataset.lead }));
}
function renderResults(m) {
  P.haveResults = true;
  $('rPlace').textContent = m.place ? ordinal(m.place) : 'Finished';
  $('rEarned').textContent = `+${m.earned} coins · bank ${m.bank}`;
  $('rNote').hidden = !m.note;
  $('rNote').textContent = m.note || '';
  P.bank = m.bank;
  const ol = $('rList');
  ol.innerHTML = '';
  for (const r of m.rows) {
    const li = el('li', r.slot === P.slot ? 'me' : '', `${r.name}  ${r.time}`);
    ol.appendChild(li);
  }
  $('rLead').hidden = !P.leader;
  $('rWait').hidden = P.leader;
}

// ---------- phone niceties ----------
function goFullscreen() {
  const d = document.documentElement;
  try {
    if (!document.fullscreenElement && d.requestFullscreen) {
      d.requestFullscreen({ navigationUI: 'hide' }).then(() => {
        if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
      }).catch(() => {});
    }
  } catch (e) {
    /* optional */
  }
}
async function wakeLock() {
  try {
    if (navigator.wakeLock) await navigator.wakeLock.request('screen');
  } catch (e) {
    /* optional */
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') wakeLock();
});

window.addEventListener('DOMContentLoaded', boot);
