'use strict';
// Edit Panel: every gameplay parameter in CFG gets a slider (or switch) generated from
// PARAM_SCHEMA. Changes apply on the very next frame and are remembered in localStorage.

const PARAMS_KEY = 'claykart.params.v1';

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
  rows: {},
  confirmReset: false,

  init() {
    this.el = $('editPanel');
    this.body = $('epSections');
    this.stats = $('epStats');
    this.build();
    $('editToggle').addEventListener('click', () => this.toggle());
    $('epClose').addEventListener('click', () => this.toggle(false));
    setInterval(() => this.refreshStats(), 250);
  },

  toggle(force) {
    this.open = force === undefined ? !this.open : force;
    this.el.hidden = !this.open;
    $('editToggle').setAttribute('aria-expanded', String(this.open));
    document.body.classList.toggle('panel-open', this.open);
    window.dispatchEvent(new Event('resize'));
  },

  build() {
    const presetWrap = $('epPresets');
    presetWrap.innerHTML = '';
    for (const name in PRESETS) {
      const b = el('button', 'chip', name);
      b.type = 'button';
      b.addEventListener('click', () => this.applyPreset(name));
      presetWrap.appendChild(b);
    }
    this.body.innerHTML = '';
    for (const group of PARAM_SCHEMA) {
      const det = el('details', 'ep-group');
      det.open = group.group === 'Kart handling' || group.group === 'Drift & boost';
      det.appendChild(el('summary', '', group.group));
      for (const p of group.items) det.appendChild(this.row(p));
      this.body.appendChild(det);
    }
    const act = $('epActions');
    act.innerHTML = '';
    const actions = [
      ['Give everyone a key', () => this.forHumans((k) => (k.key = true), 'Keys handed out')],
      ['Open every gate', () => this.openGates()],
      ['Star power', () => this.forHumans((k) => (k.starT = CFG.starTime), 'Star power!')],
      ['Max coins (10)', () => this.forHumans((k) => (k.coins = 10), 'Pockets full of coins')],
      ['Skip a lap', () => this.forHumans((k) => (k.totalS += App.race.track.length), 'Lap skipped')],
      ['Finish the race', () => this.finishRace()],
      ['Restart the race', () => (App.race ? App.leaderAction('restart') : this.flash('Start a race first'))],
      ['+100 garage coins', () => {
        Save.data.bank += 100;
        Save.persist();
        Party.changed();
        this.flash('Bank: ' + Save.data.bank + ' coins');
      }],
      ['Unlock every part', () => {
        for (const k of CATALOG_KINDS) for (const p of CATALOG[k]) Save.data.owned[partKey(k, p.id)] = true;
        Save.persist();
        Party.changed();
        this.flash('Every part unlocked');
      }],
      ['Bots: everyone a bot', () => this.forHumans((k) => App.race.setAutopilot(k, !k.auto), 'Autopilot toggled')],
    ];
    for (const [label, fn] of actions) {
      const b = el('button', '', label);
      b.type = 'button';
      b.addEventListener('click', () => {
        Sound.init();
        fn();
        b.blur();
      });
      act.appendChild(b);
    }
    const isel = $('epItemSel');
    isel.innerHTML = '';
    for (const k of ITEM_KINDS) {
      const o = el('option', '', ITEM_INFO[k].name);
      o.value = k;
      isel.appendChild(o);
    }
    $('epGive').addEventListener('click', () => {
      const kind = isel.value;
      this.forHumans((k) => {
        k.item = kind;
        k.itemN = kind === 'triple' ? 3 : 1;
        k.roulette = 0;
      }, ITEM_INFO[kind].name + ' given');
    });
    const wsel = $('epWarpSel');
    wsel.innerHTML = '';
    for (const t of TRACK_DEFS) {
      const o = el('option', '', t.name);
      o.value = t.id;
      wsel.appendChild(o);
    }
    $('epWarp').addEventListener('click', () => {
      Party.settings.track = wsel.value;
      Party.saveSettings();
      App.leaderAction('start');
    });
    const reset = $('epResetSave');
    reset.addEventListener('click', () => {
      if (!this.confirmReset) {
        this.confirmReset = true;
        reset.textContent = 'Click again to erase';
        reset.classList.add('danger');
        setTimeout(() => {
          this.confirmReset = false;
          reset.textContent = 'Reset garage & coins';
          reset.classList.remove('danger');
        }, 3000);
        return;
      }
      this.confirmReset = false;
      reset.textContent = 'Garage reset';
      Save.data = Save.fresh();
      Save.persist();
      for (const p of Party.list()) p.config = Save.ownedConfig(p.config);
      Party.changed();
      App.refreshShowroom();
    });
    $('epResetAll').addEventListener('click', () => this.applyPreset('Classic'));
    $('epExport').addEventListener('click', () => this.exportJSON());
    $('epImport').addEventListener('click', () => this.importJSON());
  },

  forHumans(fn, msg) {
    const r = App.race;
    if (!r || App.screen !== 'race') return this.flash('Start a race first');
    for (const k of r.karts) if (!k.bot) fn(k);
    if (msg) this.flash(msg);
  },
  openGates() {
    const r = App.race;
    if (!r) return this.flash('Start a race first');
    for (const g of r.items.gates) g.openT = 30;
    this.flash('Gates open for 30 seconds');
  },
  finishRace() {
    const r = App.race;
    if (!r || App.screen !== 'race') return this.flash('Start a race first');
    for (const k of r.order) if (!k.finished) r.finish(k);
    r.state = 'done';
  },

  row(p) {
    const wrap = el('div', 'ep-row');
    const id = 'cfg-' + p.key;
    if (p.type === 'bool') {
      wrap.classList.add('bool');
      const lab = el('label', '', p.label);
      lab.htmlFor = id;
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
      const lab = el('label', '', p.label);
      lab.htmlFor = id;
      if (p.hint) lab.appendChild(el('small', '', p.hint));
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
      const reset = el('button', 'ep-reset', '↺');
      reset.type = 'button';
      reset.title = 'Reset to ' + p.def;
      reset.setAttribute('aria-label', 'Reset ' + p.label);
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
      const ctrl = el('div', 'ep-ctrl');
      ctrl.append(range, num, reset);
      wrap.append(lab, ctrl);
      this.rows[p.key] = { p, wrap, set: (v) => (range.value = num.value = v) };
    }
    wrap.classList.toggle('changed', CFG[p.key] !== p.def);
    return wrap;
  },

  changed(p) {
    const r = this.rows[p.key];
    if (r) r.wrap.classList.toggle('changed', CFG[p.key] !== p.def);
    if (p.key === 'musicVolume' || p.key === 'sfxVolume') Sound.applyVolumes();
    if (p.key === 'renderScale' || p.key === 'autoRes') App.resize(true);
    if (p.key === 'splitStacked' && App.view) App.view.minimap = null;
    saveParams();
  },

  applyPreset(name) {
    const preset = PRESETS[name] || {};
    const keep = ['godMode', 'infiniteItems', 'showRacingLine', 'pauseWhileEditing', 'musicVolume', 'sfxVolume', 'engineVolume', 'renderScale', 'autoRes', 'splitStacked', 'timeScale'];
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
    const t = $('epToast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(this._toast);
    this._toast = setTimeout(() => (t.hidden = true), 1800);
  },

  exportJSON() {
    const out = {};
    for (const k in CFG_DEFAULTS) if (CFG[k] !== CFG_DEFAULTS[k]) out[k] = CFG[k];
    const txt = JSON.stringify(out, null, 1);
    const ta = $('epJson');
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
    let data;
    try {
      data = JSON.parse($('epJson').value);
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
    const lines = [];
    lines.push(['FPS', `${App.fps}  (${App.pxW}×${App.pxH} px)`]);
    lines.push(['Screen', App.screen + (App.paused ? ' (paused)' : '')]);
    lines.push(['Party', Party.link ? `${Party.link.mode || '…'} room ${Party.code || '…'}, ${Party.list().length} racer(s)` : `${Party.list().length} local racer(s)`]);
    const r = App.race;
    if (r && App.screen === 'race') {
      const k = r.karts.find((q) => !q.bot) || r.order[0];
      lines.push(['Course', `${r.track.def.name}, ${r.state}, ${fmtTime(r.raceTime)}`]);
      lines.push(['Speed', `${k.speed.toFixed(1)} / ${(k.maxNow || 0).toFixed(1)} u/s`]);
      lines.push(['Surface', k.surface + (k.onGround ? '' : ` (air ${k.airT.toFixed(2)}s)`)]);
      lines.push(['Drift', k.drift ? `${k.drift > 0 ? 'right' : 'left'}, ${k.driftT.toFixed(2)}s, level ${k.driftLevel}` : '—']);
      lines.push(['Boost', k.boostT > 0 ? `${k.boostKind} ${k.boostT.toFixed(2)}s` : '—']);
      lines.push(['Race', `place ${k.place}/${r.karts.length}, lap ${k.lap}/${r.laps}, ${((k.totalS / r.track.length) * 100).toFixed(0)}% of a lap`]);
      lines.push(['Road', k.loc ? `${k.loc.path.id} s=${k.loc.s.toFixed(0)} d=${k.loc.d.toFixed(1)}` : 'void']);
      lines.push(['Item / key', `${k.item || '—'}${k.itemN > 1 ? ' ×' + k.itemN : ''} / ${k.key ? 'yes' : 'no'}`]);
    }
    this.stats.innerHTML = '';
    for (const [a, b] of lines) this.stats.append(el('dt', '', a), el('dd', '', b));
  },
};
