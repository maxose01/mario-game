'use strict';
// Local controls on the big screen: one or two keyboard racers, any number of gamepads and an
// on-screen touch pad, all turned into the same {steer, gas, brake, drift, item, back} controls.
// Phones send the same shape over the network (see party.js). Menus use arrow keys / d-pad /
// TV remote with Enter, so the whole game works from a sofa.

const KEYSETS = {
  // solo: everything at once
  kb: {
    left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], gas: ['ArrowUp', 'KeyW'], brake: ['ArrowDown', 'KeyS'],
    drift: ['Space', 'ShiftLeft', 'ShiftRight', 'KeyZ'], item: ['KeyX', 'KeyE', 'KeyQ', 'ControlLeft'], back: ['KeyC', 'KeyR'],
  },
  kb1: { left: ['KeyA'], right: ['KeyD'], gas: ['KeyW'], brake: ['KeyS'], drift: ['ShiftLeft', 'Space'], item: ['KeyQ', 'KeyE'], back: ['KeyR'] },
  kb2: { left: ['ArrowLeft'], right: ['ArrowRight'], gas: ['ArrowUp'], brake: ['ArrowDown'], drift: ['ShiftRight', 'Slash'], item: ['Period', 'Numpad0'], back: ['Comma'] },
};
const SOURCE_LABELS = { kb: 'Keyboard', kb1: 'Keyboard (WASD)', kb2: 'Keyboard (arrows)', touch: 'Touch' };

const Input = {
  keys: new Set(),
  latch: new Set(), // "source:action" presses not yet read
  touch: { steer: 0, gas: true, brake: false, drift: false, item: false, back: false },
  padPrev: {},
  onUiKey: null,
  onNav: null, // (dir | 'ok' | 'back') for menus

  // Some TV browsers leave KeyboardEvent.code empty; fall back to key / keyCode.
  codeOf(e) {
    if (e.code) return e.code;
    const byKey = { ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', Enter: 'Enter', ' ': 'Space', Escape: 'Escape', Backspace: 'Backspace' };
    if (byKey[e.key]) return byKey[e.key];
    const byCode = { 37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown', 13: 'Enter', 32: 'Space', 27: 'Escape', 461: 'Escape', 10009: 'Escape', 8: 'Backspace' };
    return byCode[e.keyCode] || e.key || '';
  },

  init() {
    window.addEventListener('keydown', (e) => {
      if (this.isTyping(e)) return;
      const code = this.codeOf(e);
      if (this.onUiKey && this.onUiKey(code, e)) {
        e.preventDefault();
        return;
      }
      if (!this.keys.has(code)) {
        for (const src in KEYSETS) for (const a in KEYSETS[src]) if (KEYSETS[src][a].includes(code)) this.latch.add(src + ':' + a);
        this.navKey(e, code);
      }
      this.keys.add(code);
      if (this.isGameKey(code) && !this.inMenu()) e.preventDefault();
      Sound.init();
      Sound.resume();
    });
    window.addEventListener('keyup', (e) => {
      const code = this.codeOf(e);
      this.keys.delete(code);
      if (this.isGameKey(code) && !this.isTyping(e) && !this.inMenu()) e.preventDefault();
    });
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('pointerdown', () => {
      Sound.init();
      Sound.resume();
    });
  },
  isTyping(e) {
    const t = e.target;
    if (!t || !t.tagName) return false;
    return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
  },
  isGameKey(code) {
    for (const src in KEYSETS) for (const a in KEYSETS[src]) if (KEYSETS[src][a].includes(code)) return true;
    return false;
  },
  inMenu() {
    return document.body.classList.contains('menu-open');
  },
  navKey(e, code) {
    if (!this.onNav) return;
    const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'ok', NumpadEnter: 'ok', Escape: 'back', Backspace: 'back', BrowserBack: 'back', GoBack: 'back' };
    const d = map[code] || (e.key === 'GoBack' ? 'back' : null);
    if (d && this.onNav(d, e)) e.preventDefault();
  },

  down(src, a) {
    const set = KEYSETS[src];
    return !!set && set[a].some((c) => this.keys.has(c));
  },
  took(src, a) {
    const k = src + ':' + a;
    if (this.latch.has(k)) {
      this.latch.delete(k);
      return true;
    }
    return false;
  },

  // Controls for one local source: 'kb' | 'kb1' | 'kb2' | 'pad<N>' | 'touch'.
  read(src, autoGas, out = {}) {
    if (src === 'touch') {
      Object.assign(out, this.touch);
      out.item = this.touch.item;
      this.touch.item = false;
      return out;
    }
    if (src.startsWith('pad')) return this.readPad(Number(src.slice(3)), autoGas, out);
    const L = this.down(src, 'left'), R = this.down(src, 'right');
    out.steer = (R ? 1 : 0) - (L ? 1 : 0);
    out.brake = this.down(src, 'brake');
    out.gas = autoGas ? !out.brake : this.down(src, 'gas');
    out.drift = this.down(src, 'drift');
    out.item = this.took(src, 'item') || this.down(src, 'item');
    out.back = this.down(src, 'back');
    return out;
  },

  pads() {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    return Array.from(list || []).filter(Boolean);
  },
  readPad(index, autoGas, out) {
    const p = this.pads().find((g) => g.index === index);
    out.steer = 0;
    out.gas = out.brake = out.drift = out.item = out.back = false;
    if (!p) return out;
    const b = (i) => !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.4));
    let ax = p.axes[0] || 0;
    if (Math.abs(ax) < 0.15) ax = 0;
    out.steer = U.clamp(ax * 1.15 + (b(15) ? 1 : 0) - (b(14) ? 1 : 0), -1, 1);
    out.brake = b(1) || b(6);
    out.gas = autoGas ? !out.brake : b(0) || b(7);
    out.drift = b(5) || b(4);
    out.item = b(2);
    out.back = b(3);
    return out;
  },

  // Edge-triggered gamepad buttons, for menus and "press A to join".
  padPresses() {
    const out = [];
    for (const p of this.pads()) {
      const prev = this.padPrev[p.index] || {};
      const now = {};
      const add = (name, on) => {
        now[name] = on;
        if (on && !prev[name]) out.push({ pad: p.index, btn: name });
      };
      add('a', !!(p.buttons[0] && p.buttons[0].pressed));
      add('b', !!(p.buttons[1] && p.buttons[1].pressed));
      add('start', !!(p.buttons[9] && p.buttons[9].pressed));
      add('up', !!(p.buttons[12] && p.buttons[12].pressed) || (p.axes[1] || 0) < -0.6);
      add('down', !!(p.buttons[13] && p.buttons[13].pressed) || (p.axes[1] || 0) > 0.6);
      add('left', !!(p.buttons[14] && p.buttons[14].pressed) || (p.axes[0] || 0) < -0.6);
      add('right', !!(p.buttons[15] && p.buttons[15].pressed) || (p.axes[0] || 0) > 0.6);
      this.padPrev[p.index] = now;
    }
    return out;
  },
};

// Spatial focus movement for DOM menus (TV remotes and gamepads).
const Nav = {
  move(dir, root) {
    const items = Array.from(root.querySelectorAll('button:not([disabled]), [data-nav]:not([disabled]), select, input[type=range]')).filter((el) => el.offsetParent !== null);
    if (!items.length) return false;
    const cur = document.activeElement && items.includes(document.activeElement) ? document.activeElement : null;
    if (!cur) {
      (root.querySelector('[data-autofocus]') || items[0]).focus();
      return true;
    }
    const a = cur.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bd = Infinity;
    for (const el of items) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect();
      const bx = b.left + b.width / 2, by = b.top + b.height / 2;
      const dx = bx - ax, dy = by - ay;
      const ok = dir === 'left' ? dx < -4 : dir === 'right' ? dx > 4 : dir === 'up' ? dy < -4 : dy > 4;
      if (!ok) continue;
      const along = dir === 'left' || dir === 'right' ? Math.abs(dx) : Math.abs(dy);
      const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      const d = along + across * 2.2;
      if (d < bd) {
        bd = d;
        best = el;
      }
    }
    if (best) {
      best.focus();
      if (best.scrollIntoView) best.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      return true;
    }
    return false;
  },
};
