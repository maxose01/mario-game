'use strict';
// Boot: sizing, the fixed-timestep loop, UI buttons and touch controls.

const Main = {
  fps: 0,
  game: null,

  boot() {
    Clay.init();
    loadParams();
    const canvas = document.getElementById('game');
    const game = (this.game = new Game(canvas));
    window.clayGame = game; // handy for debugging from the console
    Input.init();
    Input.onUiKey = (code) => {
      if (code === 'Tab' || code === 'Backquote') {
        EditPanel.toggle();
        return true;
      }
      if (code === 'KeyM') {
        Sound.init();
        this.setMuted(Sound.toggleMute());
        return true;
      }
      return false;
    };
    EditPanel.init(game);
    this.initButtons();
    this.initTouch();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    if (document.fonts && document.fonts.load) document.fonts.load(`700 20px ${FONT}`).catch(() => {});
    let last = performance.now();
    let acc = 0;
    let frames = 0, fpsT = last;
    const STEP = 1 / 60;
    const frame = (now) => {
      requestAnimationFrame(frame);
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.1) dt = 0.1;
      Clay.setTime(now / 1000);
      const paused = EditPanel.open && CFG.pauseWhileEditing;
      if (!paused) {
        acc += dt * CFG.timeScale;
        let steps = 0;
        while (acc >= STEP && steps < 5) {
          Input.update();
          game.update();
          acc -= STEP;
          steps++;
        }
        if (steps >= 5) acc = 0;
      }
      game.render();
      frames++;
      if (now - fpsT >= 1000) {
        this.fps = Math.round((frames * 1000) / (now - fpsT));
        frames = 0;
        fpsT = now;
      }
    };
    requestAnimationFrame(frame);
  },

  resize() {
    const stage = document.getElementById('stage');
    const canvas = document.getElementById('game');
    const availW = stage.clientWidth, availH = stage.clientHeight;
    const scale = Math.max(0.2, Math.min(availW / VIEW_W, availH / VIEW_H));
    canvas.style.width = Math.floor(VIEW_W * scale) + 'px';
    canvas.style.height = Math.floor(VIEW_H * scale) + 'px';
    const dpr = window.devicePixelRatio || 1;
    const rs = U.clamp(Math.round(scale * dpr * 4) / 4, 1, 2);
    const g = this.game;
    if (rs !== g.rs || canvas.width !== VIEW_W * rs) {
      g.rs = rs;
      canvas.width = VIEW_W * rs;
      canvas.height = VIEW_H * rs;
      g.vignette = null;
    }
  },

  setMuted(m) {
    const b = document.getElementById('muteBtn');
    b.textContent = m ? 'Sound off' : 'Sound on';
    b.setAttribute('aria-pressed', String(!m));
  },

  initButtons() {
    // Hand focus back to the game after any toolbar click so game keys never press buttons.
    document.getElementById('topbar').addEventListener('click', (e) => {
      if (e.target.closest('button')) setTimeout(() => document.getElementById('game').focus(), 0);
    });
    document.getElementById('muteBtn').addEventListener('click', (e) => {
      Sound.init();
      Sound.resume();
      this.setMuted(Sound.toggleMute());
      e.currentTarget.blur();
    });
    const fs = document.getElementById('fullBtn');
    fs.addEventListener('click', (e) => {
      e.currentTarget.blur();
      const el = document.getElementById('app');
      try {
        if (document.fullscreenElement) document.exitFullscreen();
        else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
      } catch (err) {
        /* fullscreen is optional */
      }
    });
  },

  initTouch() {
    const pad = document.getElementById('touch');
    const show = () => {
      pad.hidden = false;
      document.body.classList.add('touch');
      this.resize();
    };
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) show();
    window.addEventListener('touchstart', show, { once: true, passive: true });
    for (const btn of pad.querySelectorAll('[data-act]')) {
      const acts = btn.dataset.act.split(' ');
      const on = (e) => {
        e.preventDefault();
        Sound.init();
        Sound.resume();
        btn.setPointerCapture && btn.setPointerCapture(e.pointerId);
        btn.classList.add('down');
        for (const a of acts) Input.setTouch(a, true);
      };
      const off = (e) => {
        e.preventDefault();
        btn.classList.remove('down');
        const locked = document.getElementById('runLock').classList.contains('on');
        for (const a of acts) if (!(a === 'run' && locked)) Input.setTouch(a, false);
      };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('lostpointercapture', off);
    }
    // the run button can be latched on so thumbs stay free
    const lock = document.getElementById('runLock');
    lock.addEventListener('click', () => {
      const on = !lock.classList.contains('on');
      lock.classList.toggle('on', on);
      lock.setAttribute('aria-pressed', String(on));
      Input.setTouch('run', on);
    });
  },
};

window.addEventListener('DOMContentLoaded', () => Main.boot());
