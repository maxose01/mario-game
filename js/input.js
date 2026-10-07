'use strict';
// Unified input: keyboard, gamepad and on-screen touch buttons all feed the same actions.
// Presses are latched between game updates so a quick tap is never lost, even in slow motion.

const KEY_BINDINGS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  jump: ['KeyZ', 'Space', 'KeyK'],
  run: ['KeyX', 'ShiftLeft', 'ShiftRight', 'KeyJ'],
  spin: ['KeyC', 'KeyL'],
  reserve: ['KeyV', 'KeyI'],
  pause: ['Enter', 'KeyP', 'Escape'],
};
const ACTIONS = Object.keys(KEY_BINDINGS);

const Input = {
  keys: new Set(),
  latched: new Set(),
  touch: {},
  cur: {},
  prev: {},
  codeToAction: {},
  onUiKey: null, // (code, event) => handled?

  init() {
    for (const a of ACTIONS) for (const code of KEY_BINDINGS[a]) this.codeToAction[code] = a;
    window.addEventListener('keydown', (e) => {
      if (this.isTyping(e)) return;
      if (this.onUiKey && this.onUiKey(e.code, e)) {
        e.preventDefault();
        return;
      }
      const a = this.codeToAction[e.code];
      if (a) {
        e.preventDefault();
        if (!this.keys.has(e.code)) this.latched.add(a);
        this.keys.add(e.code);
      }
      Sound.init();
      Sound.resume();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      // stop Space from "clicking" whatever button last had focus
      if (this.codeToAction[e.code] && !this.isTyping(e)) e.preventDefault();
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.touch = {};
    });
    window.addEventListener('pointerdown', () => {
      Sound.init();
      Sound.resume();
    });
  },

  isTyping(e) {
    const t = e.target;
    if (!t || !t.tagName) return false;
    const tag = t.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
  },

  setTouch(action, on) {
    if (on && !this.touch[action]) this.latched.add(action);
    this.touch[action] = on;
  },

  pollPad() {
    const out = {};
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const b = (i) => p.buttons[i] && p.buttons[i].pressed;
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      if (b(14) || ax < -0.4) out.left = true;
      if (b(15) || ax > 0.4) out.right = true;
      if (b(12) || ay < -0.5) out.up = true;
      if (b(13) || ay > 0.5) out.down = true;
      if (b(0)) out.jump = true;
      if (b(1)) out.spin = true;
      if (b(2) || b(3) || b(6) || b(7)) out.run = true;
      if (b(8)) out.reserve = true;
      if (b(9)) out.pause = true;
    }
    return out;
  },

  // Called once at the start of every fixed game update.
  update() {
    const pad = this.pollPad();
    const next = {};
    for (const a of ACTIONS) {
      let on = !!pad[a] || !!this.touch[a];
      if (!on) for (const code of KEY_BINDINGS[a]) if (this.keys.has(code)) on = true;
      next[a] = on;
    }
    this.prev = this.cur;
    this.cur = next;
    this.pressedNow = {};
    for (const a of ACTIONS) {
      if ((next[a] && !this.prev[a]) || this.latched.has(a)) this.pressedNow[a] = true;
    }
    this.latched.clear();
  },
  down(a) {
    return !!this.cur[a];
  },
  pressed(a) {
    return !!(this.pressedNow && this.pressedNow[a]);
  },
  released(a) {
    return !this.cur[a] && !!this.prev[a];
  },
  // Menu helper: confirm with jump, run or pause.
  confirm() {
    return this.pressed('jump') || this.pressed('pause');
  },
  consume() {
    this.pressedNow = {};
  },
};
