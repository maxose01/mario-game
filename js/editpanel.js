'use strict';
// Edit Panel: every gameplay parameter in CFG gets a slider (or switch) generated from
// PARAM_SCHEMA. Changes apply on the very next frame and are remembered in localStorage.

const PARAMS_KEY = 'clayisles.params.v1';

function loadParams() {
  const saved = Store.get(PARAMS_KEY, null);
  if (!saved || typeof saved !== 'object') return;
  for (const k in saved) if (k in CFG_DEFAULTS && typeof saved[k] === typeof CFG_DEFAULTS[k]) CFG[k] = saved[k];
}
function saveParams() {
  const out = {};
  for (const k in CFG_DEFAULTS) if (CFG[k] !== CFG_DEFAULTS[k]) out[k] = CFG[k];
  Store.set(PARAMS_KEY, out);
}

const EditPanel = {
  open: false,
  game: null,
  rows: {},
  confirmReset: false,

  init(game) {
    this.game = game;
    this.el = document.getElementById('editPanel');
    this.body = document.getElementById('epSections');
    this.stats = document.getElementById('epStats');
    this.build();
    document.getElementById('editToggle').addEventListener('click', () => this.toggle());
    document.getElementById('epClose').addEventListener('click', () => this.toggle(false));
    setInterval(() => this.refreshStats(), 200);
  },

  toggle(force) {
    this.open = force === undefined ? !this.open : force;
    this.el.hidden = !this.open;
    document.getElementById('editToggle').setAttribute('aria-expanded', String(this.open));
    document.body.classList.toggle('panel-open', this.open);
    window.dispatchEvent(new Event('resize'));
    if (!this.open) document.getElementById('game').focus();
  },

  build() {
    const sec = this.body;
    sec.innerHTML = '';
    // presets
    const presetWrap = document.getElementById('epPresets');
    presetWrap.innerHTML = '';
    for (const name in PRESETS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = name;
      b.addEventListener('click', () => this.applyPreset(name));
      presetWrap.appendChild(b);
    }
    // parameter groups
    for (const group of PARAM_SCHEMA) {
      const det = document.createElement('details');
      det.className = 'ep-group';
      det.open = group.group === 'Running' || group.group === 'Cape';
      const sum = document.createElement('summary');
      sum.textContent = group.group;
      det.appendChild(sum);
      for (const p of group.items) det.appendChild(this.row(p));
      sec.appendChild(det);
    }
    // actions
    const act = document.getElementById('epActions');
    act.innerHTML = '';
    const actions = [
      ['Give cape', () => this.givePower(2)],
      ['Give mushroom', () => this.givePower(1)],
      ['Summon Dumpling', () => this.summon()],
      ['Drop a key here', () => this.dropKey()],
      ['Toggle Cloud Switch', () => this.toggleSwitch()],
      ['Unlock every path', () => this.unlockAll()],
      ['+5 lives', () => {
        this.game.save.lives += 5;
        this.game.persist();
      }],
    ];
    for (const [label, fn] of actions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', () => {
        Sound.init();
        fn();
        b.blur();
      });
      act.appendChild(b);
    }
    document.getElementById('epWarp').addEventListener('click', () => {
      const id = document.getElementById('epWarpSel').value;
      this.warp(id);
    });
    const reset = document.getElementById('epResetSave');
    reset.addEventListener('click', () => {
      if (!this.confirmReset) {
        this.confirmReset = true;
        reset.textContent = 'Click again to erase progress';
        reset.classList.add('danger');
        setTimeout(() => {
          this.confirmReset = false;
          reset.textContent = 'Reset saved progress';
          reset.classList.remove('danger');
        }, 3000);
        return;
      }
      this.confirmReset = false;
      reset.textContent = 'Progress erased';
      this.game.save = newSave();
      this.game.persist();
      this.game.map = null;
      this.game.level = null;
      this.game.state = 'scene';
      this.game.scene = new TitleScene(this.game);
      Sound.playSong('map');
    });
    document.getElementById('epResetAll').addEventListener('click', () => this.applyPreset('Classic'));
    document.getElementById('epExport').addEventListener('click', () => this.exportJSON());
    document.getElementById('epImport').addEventListener('click', () => this.importJSON());
  },

  row(p) {
    const wrap = document.createElement('div');
    wrap.className = 'ep-row';
    const id = 'cfg-' + p.key;
    if (p.type === 'bool') {
      wrap.classList.add('bool');
      const lab = document.createElement('label');
      lab.htmlFor = id;
      lab.textContent = p.label;
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = id;
      cb.checked = !!CFG[p.key];
      cb.addEventListener('change', () => {
        CFG[p.key] = cb.checked;
        this.changed(p);
      });
      wrap.append(lab, cb);
      this.rows[p.key] = { p, wrap, set: (v) => (cb.checked = !!v) };
    } else {
      const lab = document.createElement('label');
      lab.htmlFor = id;
      lab.textContent = p.label;
      if (p.hint) {
        const s = document.createElement('small');
        s.textContent = p.hint;
        lab.appendChild(s);
      }
      const range = document.createElement('input');
      range.type = 'range';
      range.id = id;
      range.min = p.min;
      range.max = p.max;
      range.step = p.step;
      range.value = CFG[p.key];
      const num = document.createElement('input');
      num.type = 'number';
      num.id = id + '-n';
      num.min = p.min;
      num.max = p.max;
      num.step = p.step;
      num.value = CFG[p.key];
      num.setAttribute('aria-label', p.label + ' value');
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'ep-reset';
      reset.title = 'Reset to ' + p.def;
      reset.setAttribute('aria-label', 'Reset ' + p.label);
      reset.textContent = '↺';
      const apply = (v) => {
        v = parseFloat(v);
        if (!isFinite(v)) return;
        CFG[p.key] = v;
        range.value = v;
        num.value = v;
        this.changed(p);
      };
      range.addEventListener('input', () => apply(range.value));
      num.addEventListener('change', () => apply(num.value));
      reset.addEventListener('click', () => apply(p.def));
      const ctrl = document.createElement('div');
      ctrl.className = 'ep-ctrl';
      ctrl.append(range, num, reset);
      wrap.append(lab, ctrl);
      this.rows[p.key] = {
        p,
        wrap,
        set: (v) => {
          range.value = v;
          num.value = v;
        },
      };
    }
    wrap.classList.toggle('changed', CFG[p.key] !== p.def);
    return wrap;
  },

  changed(p) {
    const r = this.rows[p.key];
    if (r) r.wrap.classList.toggle('changed', CFG[p.key] !== p.def);
    if (p.key === 'musicVolume' || p.key === 'sfxVolume') Sound.applyVolumes();
    if (p.key === 'boilAmount' || p.key === 'boilFps') BlockArt.cache.clear();
    saveParams();
  },

  applyPreset(name) {
    const preset = PRESETS[name] || {};
    // presets only touch gameplay feel; keep debug and audio settings
    const keep = ['godMode', 'infiniteFlight', 'showHitboxes', 'pauseWhileEditing', 'musicVolume', 'sfxVolume'];
    for (const k in CFG_DEFAULTS) {
      if (keep.includes(k)) continue;
      CFG[k] = k in preset ? preset[k] : CFG_DEFAULTS[k];
    }
    for (const k in this.rows) {
      this.rows[k].set(CFG[k]);
      this.rows[k].wrap.classList.toggle('changed', CFG[k] !== CFG_DEFAULTS[k]);
    }
    Sound.applyVolumes();
    saveParams();
    this.flash('Preset applied: ' + name);
  },

  flash(msg) {
    const el = document.getElementById('epToast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(this._toast);
    this._toast = setTimeout(() => (el.hidden = true), 1800);
  },

  // ---------- cheats ----------
  givePower(power) {
    const g = this.game;
    g.save.power = Math.max(g.save.power, power);
    if (g.state === 'level' && g.level && !g.level.player.dead) {
      const p = g.level.player;
      if (p.power < power) {
        p.power = power;
        if (g.level.state === 'play') g.level.transform(power === 2 ? 'cape' : 'grow');
        Sound.play(power === 2 ? 'feather' : 'powerup');
      }
    }
    g.persist();
    this.flash(power === 2 ? 'Cape on!' : 'Mushroom power!');
  },
  summon() {
    const g = this.game;
    if (g.state === 'level' && g.level) {
      const L = g.level, p = L.player;
      if (L.companion && !L.companion.dead) {
        this.flash('Dumpling is already here');
        return;
      }
      const c = new Companion(L, p.cx + p.facing * 40, p.y + p.h);
      L.spawn(c);
      L.companion = c;
      L.puff(c.cx, c.cy, 1);
      Sound.play('hatch');
    } else {
      g.save.companion = true;
      g.persist();
    }
    this.flash('Dumpling is here!');
  },
  dropKey() {
    const g = this.game;
    if (g.state !== 'level' || !g.level) return this.flash('Enter a level first');
    const L = g.level, p = L.player;
    const k = new Key(L, 0, 0);
    k.x = k.homeX = p.cx - k.w / 2;
    k.y = k.homeY = p.y - 30;
    L.spawn(k);
    Sound.play('key');
    this.flash('A key fell from the sky');
  },
  toggleSwitch() {
    const g = this.game;
    g.save.switchOn = !g.save.switchOn;
    if (g.level) g.level.switchOn = g.save.switchOn;
    g.persist();
    this.flash(g.save.switchOn ? 'Switch blocks are solid' : 'Switch blocks are outlines');
  },
  unlockAll() {
    const g = this.game;
    for (const e of Game.EXITS) g.save.exits[e] = true;
    g.save.exits['palace:normal'] = true;
    g.save.switchOn = true;
    g.persist();
    if (g.map) g.map.queueReveals();
    this.flash('Every path is open');
  },
  warp(id) {
    const g = this.game;
    if (g.trans) return;
    if (!g.map) g.map = new WorldMap(g);
    const node = Object.keys(MAP_NODES).find((k) => MAP_NODES[k].level === id);
    if (node) {
      g.map.node = node;
      g.save.node = node;
      g.map.pos = { x: MAP_NODES[node].x, y: MAP_NODES[node].y };
      g.map.walking = null;
    }
    g.save.checkpoint = null;
    g.transition(VIEW_W / 2, VIEW_H / 2, () => g.startLevel(id));
  },

  // ---------- import / export ----------
  exportJSON() {
    const out = {};
    for (const k in CFG_DEFAULTS) if (CFG[k] !== CFG_DEFAULTS[k]) out[k] = CFG[k];
    const txt = JSON.stringify(out, null, 1);
    const ta = document.getElementById('epJson');
    ta.value = txt;
    ta.select();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(
        () => this.flash('Copied tweaks to the clipboard'),
        () => this.flash('Tweaks are in the box below; copy them from there'),
      );
    } else this.flash('Tweaks are in the box below; copy them from there');
  },
  importJSON() {
    const ta = document.getElementById('epJson');
    let data;
    try {
      data = JSON.parse(ta.value);
    } catch (e) {
      this.flash('That text is not valid JSON');
      return;
    }
    let n = 0;
    for (const k in data) {
      if (!(k in CFG_DEFAULTS) || typeof data[k] !== typeof CFG_DEFAULTS[k]) continue;
      CFG[k] = data[k];
      if (this.rows[k]) {
        this.rows[k].set(data[k]);
        this.rows[k].wrap.classList.toggle('changed', CFG[k] !== CFG_DEFAULTS[k]);
      }
      n++;
    }
    Sound.applyVolumes();
    saveParams();
    this.flash(`Applied ${n} setting${n === 1 ? '' : 's'}`);
  },

  refreshStats() {
    if (!this.open) return;
    const g = this.game;
    const lines = [];
    lines.push(['FPS', String(Main.fps)]);
    lines.push(['Screen', g.state === 'level' ? 'level: ' + g.level.spec.name : g.state]);
    if (g.state === 'level' && g.level) {
      const p = g.level.player;
      const flight = ['—', 'takeoff', 'soaring'][p.flight];
      lines.push(['Speed', `${p.vx.toFixed(2)}, ${p.vy.toFixed(2)}`]);
      lines.push(['P-meter', Math.round(p.p * 100) + '%' + (p.pFull ? ' FULL' : '')]);
      lines.push(['Power', ['small', 'big', 'cape'][p.power] + (p.riding ? ' + riding' : '')]);
      lines.push(['Flight', p.gliding ? 'gliding' : flight + (p.flight === 2 ? ` (pitch ${p.pitch.toFixed(2)})` : '')]);
      lines.push(['Tile', `${Math.floor(p.cx / TILE)}, ${Math.floor((p.y + p.h - 1) / TILE)}`]);
    }
    this.stats.innerHTML = '';
    for (const [k, v] of lines) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      this.stats.append(dt, dd);
    }
  },
};
