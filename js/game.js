'use strict';
// Game shell: save data, the title/map/level/scene state machine, iris transitions
// and the stop-motion post effects (vignette + film grain).

const SAVE_KEY = 'clayisles.save.v1';

function newSave() {
  return {
    v: 1,
    lives: Math.round(CFG.startLives),
    coins: 0,
    score: 0,
    power: 0,
    companion: false,
    reserve: null,
    switchOn: false,
    exits: {},
    revealed: {},
    sunCoins: {},
    node: 'hut',
    starCape: false,
    cleared: false,
    checkpoint: null,
  };
}

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.rs = 1;
    const stored = Store.get(SAVE_KEY, null);
    this.hasSave = !!(stored && stored.v === 1);
    this.save = this.hasSave ? Object.assign(newSave(), stored) : newSave();
    this.state = 'title';
    this.scene = new TitleScene(this);
    this.map = null;
    this.level = null;
    this.trans = null;
    this.frame = 0;
    this.vignette = null;
    Sound.playSong('map');
  }
  persist() {
    Store.set(SAVE_KEY, this.save);
    this.hasSave = true;
  }

  // ---------- flow ----------
  newGame() {
    this.save = newSave();
    this.persist();
    this.map = new WorldMap(this);
    this.transition(VIEW_W / 2, VIEW_H / 2, () => this.toMap());
  }
  continueGame() {
    this.map = new WorldMap(this);
    this.transition(VIEW_W / 2, VIEW_H / 2, () => this.toMap());
  }
  toMap() {
    this.level = null;
    this.scene = null;
    if (!this.map) this.map = new WorldMap(this);
    else this.map.queueReveals();
    this.state = 'map';
    Sound.tempoMul = 1;
    Sound.bongos = false;
    Sound.playSong('map');
    this.irisCenter = { x: this.map.pos.x, y: this.map.pos.y - 20 };
  }
  enterLevel(id) {
    const from = this.map ? { x: this.map.pos.x, y: this.map.pos.y - 20 } : { x: VIEW_W / 2, y: VIEW_H / 2 };
    this.transition(from.x, from.y, () => this.startLevel(id));
  }
  startLevel(id) {
    const s = this.save;
    this.level = new Level(this, id, {
      power: s.power,
      companion: s.companion && CFG.keepCompanion,
      reserve: s.reserve,
      switchOn: s.switchOn,
      sunCoins: s.sunCoins[id] || [],
      checkpoint: s.checkpoint === id,
      starCape: s.starCape,
    });
    this.state = 'level';
    this.scene = null;
    Sound.tempoMul = 1;
    Sound.bongos = !!this.level.player.riding;
    Sound.playSong(LEVEL_SPECS[id].music);
    const p = this.level.player;
    this.irisCenter = { x: p.cx - this.level.cam.x, y: p.cy - this.level.cam.y };
  }
  levelEnded(r) {
    const s = this.save;
    const won = r.exit === 'normal' || r.exit === 'secret';
    if (won) {
      s.exits[r.id + ':' + r.exit] = true;
      const prev = s.sunCoins[r.id] || [];
      s.sunCoins[r.id] = r.sunGot.map((g, i) => g || !!prev[i]);
      s.power = r.power;
      s.companion = r.companion && CFG.keepCompanion;
      s.reserve = r.reserve;
      s.checkpoint = null;
    } else if (r.exit === 'death') {
      s.lives--;
      s.power = 0;
      s.companion = false;
      s.reserve = r.reserve;
      s.checkpoint = r.checkpoint ? r.id : null;
    } else {
      s.power = r.power;
      s.companion = r.companion && CFG.keepCompanion;
      s.reserve = r.reserve;
      s.checkpoint = r.checkpoint ? r.id : null;
    }
    this.persist();
    this.transition(VIEW_W / 2, VIEW_H / 2, () => {
      if (s.lives < 0) {
        this.level = null;
        this.state = 'scene';
        this.scene = new GameOverScene(this);
        return;
      }
      this.toMap();
    }, r.exit === 'secret');
  }
  showScene(kind) {
    this.transition(this.map.pos.x, this.map.pos.y - 20, () => {
      this.state = 'scene';
      this.scene = kind === 'ending' ? new EndingScene(this) : new StarScene(this);
      this.irisCenter = { x: VIEW_W / 2, y: VIEW_H / 2 };
    });
  }
  transition(cx, cy, mid, startClosed) {
    this.trans = { phase: startClosed ? 'hold' : 'out', t: 0, cx, cy, mid };
    this.irisCenter = null;
  }

  // ---------- loop ----------
  update() {
    this.frame++;
    if (this.trans) {
      const tr = this.trans;
      tr.t++;
      if (tr.phase === 'out' && tr.t >= 26) {
        tr.phase = 'hold';
        tr.t = 0;
      } else if (tr.phase === 'hold' && tr.t >= 8) {
        tr.mid();
        tr.phase = 'in';
        tr.t = 0;
      } else if (tr.phase === 'in' && tr.t >= 26) this.trans = null;
      if (tr.phase !== 'in') return;
    }
    if (this.state === 'level') this.level.update();
    else if (this.state === 'map') this.map.update();
    else if (this.scene) this.scene.update();
  }
  render() {
    const ctx = this.ctx, rs = this.rs;
    ctx.setTransform(rs, 0, 0, rs, 0, 0);
    ctx.imageSmoothingEnabled = true;
    if (this.state === 'level' && this.level) {
      this.level.render(ctx, rs);
      this.post(ctx);
      this.level.drawHUD(ctx);
      this.level.drawOverlays(ctx);
    } else if (this.state === 'map' && this.map) {
      this.map.render(ctx, rs);
      this.post(ctx);
    } else if (this.scene) {
      this.scene.render(ctx, rs);
      this.post(ctx);
    }
    if (this.trans) {
      const tr = this.trans;
      let r;
      if (tr.phase === 'out') r = 720 * (1 - U.easeInOut(tr.t / 26));
      else if (tr.phase === 'hold') r = 0;
      else r = 720 * U.easeInOut(tr.t / 26);
      const c = tr.phase === 'in' && this.irisCenter ? this.irisCenter : { x: tr.cx, y: tr.cy };
      Clay.iris(ctx, c.x, c.y, r);
    }
  }
  post(ctx) {
    if (CFG.vignette > 0) {
      if (!this.vignette || this.vignetteRs !== this.rs) {
        const c = Clay.makeCanvas(VIEW_W * this.rs, VIEW_H * this.rs);
        const g = c.getContext('2d');
        g.setTransform(this.rs, 0, 0, this.rs, 0, 0);
        const grd = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.68);
        grd.addColorStop(0, 'rgba(40,20,50,0)');
        grd.addColorStop(1, 'rgba(40,20,50,0.85)');
        g.fillStyle = grd;
        g.fillRect(0, 0, VIEW_W, VIEW_H);
        this.vignette = c;
        this.vignetteRs = this.rs;
      }
      ctx.globalAlpha = CFG.vignette;
      ctx.drawImage(this.vignette, 0, 0, VIEW_W, VIEW_H);
      ctx.globalAlpha = 1;
    }
    if (CFG.grain > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, CFG.grain * 6);
      const ox = U.hash(Clay.boil * 3) * 160, oy = U.hash(Clay.boil * 7 + 1) * 160;
      ctx.translate(-ox, -oy);
      ctx.fillStyle = Clay.grainPattern(ctx);
      ctx.fillRect(0, 0, VIEW_W + 160, VIEW_H + 160);
      ctx.restore();
    }
  }
}
Game.EXITS = ['l1:normal', 'l1:secret', 'l2:normal', 'l2:secret', 'l3:normal', 'l3:secret'];

// ===========================================================================
// Scenes
function sceneSky(g, top, mid, bot) {
  const sky = g.createLinearGradient(0, 0, 0, VIEW_H);
  sky.addColorStop(0, top);
  sky.addColorStop(0.55, mid);
  sky.addColorStop(1, bot);
  g.fillStyle = sky;
  g.fillRect(0, 0, VIEW_W, VIEW_H);
}

class TitleScene {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.sel = game.hasSave ? 0 : 1;
    this.bg = null;
    this.rs = 0;
  }
  options() {
    return this.game.hasSave ? ['Continue', 'New game'] : ['New game'];
  }
  update() {
    this.t++;
    const opts = this.options();
    if (opts.length > 1 && (Input.pressed('up') || Input.pressed('down'))) {
      this.sel = 1 - this.sel;
      Sound.play('select');
    }
    if (this.t > 20 && (Input.pressed('jump') || Input.pressed('pause'))) {
      Sound.play('select');
      const o = opts[Math.min(this.sel, opts.length - 1)];
      if (o === 'Continue') this.game.continueGame();
      else this.game.newGame();
    }
  }
  bake(rs) {
    const c = Clay.makeCanvas(VIEW_W * rs, VIEW_H * rs);
    const g = c.getContext('2d');
    g.setTransform(rs, 0, 0, rs, 0, 0);
    Clay.still = true;
    sceneSky(g, '#ff9fbf', '#ffd3c2', '#bfe5ff');
    const rnd = U.rng(3);
    for (let i = 0; i < 8; i++) Clay.cloud(g, rnd() * VIEW_W - 80, 60 + rnd() * 260, 160 + rnd() * 140, 50, '#fff6fa', '#ecd0e2', 40 + i);
    Clay.island(g, 180, 300, 150, 110, { grass: '#a9dca0', dirt: '#e2b49c', rock: '#c9a1b0', leaf: '#9fd492', trunk: '#a77b62' }, 8, { band: 16 });
    Clay.island(g, 800, 250, 120, 90, { grass: '#a9dca0', dirt: '#e2b49c', rock: '#c9a1b0', leaf: '#9fd492', trunk: '#a77b62' }, 9, { band: 14 });
    Clay.island(g, VIEW_W / 2, 420, 380, 150, { grass: '#7fcf6a', dirt: '#cf9363', rock: '#a66f62', leaf: '#62b956', trunk: '#8a5a3c' }, 10, { band: 26 });
    Clay.tree(g, VIEW_W / 2 - 140, 424, 40, { leaf: '#62b956', trunk: '#8a5a3c' }, 4);
    Clay.tree(g, VIEW_W / 2 + 150, 424, 34, { leaf: '#6cc25a', trunk: '#8a5a3c' }, 5);
    for (let i = 0; i < 14; i++) Clay.cloud(g, (i / 14) * VIEW_W - 50, 490 + rnd() * 20, 170, 60, '#ffffff', '#e6d8f0', 70 + i);
    Clay.applyGrain(g, 0, 0, VIEW_W, VIEW_H, 0.6);
    Clay.still = false;
    return c;
  }
  render(ctx, rs) {
    if (!this.bg || this.rs !== rs) {
      this.rs = rs;
      this.bg = this.bake(rs);
    }
    ctx.drawImage(this.bg, 0, 0, VIEW_W, VIEW_H);
    // logo: each letter bobs on its own stop-motion beat
    const word1 = 'SUPER', word2 = 'CLAY ISLES';
    const drawWord = (w, y, size, col, phase) => {
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
        Clay.text(ctx, ch, 0, 0, size, Array.isArray(col) ? col[i % col.length] : col);
        ctx.restore();
        x += cw + 4;
      }
    };
    drawWord(word1, 92, 44, '#fff3c4', 0);
    drawWord(word2, 158, 86, ['#ff7b8a', '#ffb347', '#ffd84a', '#7ddc6f', '#ffffff', '#6ec6ff', '#b48cff', '#ff8fb1', '#ffb347', '#7ddc6f'], 1);
    // hero and dino on the big island
    const bx = VIEW_W / 2 - 20, by = 420;
    const dino = {
      facing: 1, x: bx + 30, y: by - 32, w: 28, h: 32, state: 'idle', vx: 0, legT: 0, age: this.t, onGround: true, tongueDir: 0, mouth: null,
      get cx() { return this.x + 14; },
      mouthPos() { return { x: this.x + 31, y: this.y + 8 }; },
    };
    Companion.prototype.draw.call(dino, ctx);
    ctx.save();
    ctx.translate(bx - 10, by);
    Clay.shadow(ctx, 0, 0, 30);
    drawHero(ctx, 1, 2, 'idle', { age: this.t, walkPhase: 0, starCape: this.game.save.starCape, vx: 0, pitch: 0 });
    ctx.restore();
    // menu
    const opts = this.options();
    opts.forEach((o, i) => {
      const y = 262 + i * 40;
      const on = i === Math.min(this.sel, opts.length - 1);
      if (on) {
        ctx.fillStyle = 'rgba(70,42,90,0.45)';
        Clay.rrect(ctx, VIEW_W / 2 - 110, y - 17, 220, 34, 16);
        ctx.fill();
      }
      Clay.label(ctx, o, VIEW_W / 2, y, 24, on ? '#ffffff' : '#f3dff7', 'center');
    });
    if (Math.floor(this.t / 30) % 2 === 0) Clay.label(ctx, 'press Z or Space', VIEW_W / 2, 262 + opts.length * 40 + 4, 15, '#ffe9b8', 'center');
    Hud.panel(ctx, 40, VIEW_H - 62, VIEW_W - 80, 48);
    Clay.label(ctx, '←→ move   Z jump   X run / grab / cape spin / tongue   C spin jump   V reserve item   Enter pause   Tab Edit Panel   M mute', VIEW_W / 2, VIEW_H - 38, 13, '#fff8ec', 'center');
  }
}

class EndingScene {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.parts = [];
    const s = game.save;
    s.cleared = true;
    game.persist();
    Sound.playSong('ending');
  }
  update() {
    this.t++;
    if (this.t % 40 === 0) this.burst(100 + Math.random() * (VIEW_W - 200), 80 + Math.random() * 180);
    for (const p of this.parts) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.06;
      p.life--;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    if (this.t > 60 && (Input.pressed('jump') || Input.pressed('pause'))) {
      Sound.play('select');
      this.game.transition(VIEW_W / 2, VIEW_H / 2, () => this.game.toMap());
    }
  }
  burst(x, y) {
    const cols = ['#ff6f91', '#ffd166', '#6ec6ff', '#7dff8a', '#c77dff', '#ffffff'];
    const col = cols[(Math.random() * cols.length) | 0];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU;
      const sp = 2 + Math.random() * 2;
      this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 60 + Math.random() * 20, col, r: 3 + Math.random() * 2 });
    }
    Sound.play('pop');
  }
  render(ctx) {
    sceneSky(ctx, '#ff9f80', '#ffcf9e', '#ffe7c4');
    Clay.island(ctx, VIEW_W / 2, 380, 300, 150, MAP_PAL, 21, { band: 24 });
    for (const p of this.parts) {
      ctx.globalAlpha = Math.min(1, p.life / 30);
      Clay.blob(ctx, p.x, p.y, p.r, p.r, p.col, 5, { flat: true });
    }
    ctx.globalAlpha = 1;
    const bx = VIEW_W / 2;
    const dino = {
      facing: -1, x: bx + 40, y: 380 - 32 - Math.abs(Math.sin(this.t * 0.1)) * 8, w: 28, h: 32, state: 'idle', vx: 0, legT: 0, age: this.t, onGround: false, tongueDir: 0, mouth: null,
      get cx() { return this.x + 14; },
      mouthPos() { return { x: this.x - 3, y: this.y + 8 }; },
    };
    Companion.prototype.draw.call(dino, ctx);
    ctx.save();
    ctx.translate(bx - 20, 380 - Math.abs(Math.sin(this.t * 0.1 + 1)) * 10);
    drawHero(ctx, 1, Math.max(1, this.game.save.power), 'victory', { age: this.t, walkPhase: 0, starCape: this.game.save.starCape, vx: 0, pitch: 0 });
    ctx.restore();
    Clay.text(ctx, 'WORLD CLEAR!', VIEW_W / 2, 92, 66, '#ffe27a');
    const s = this.game.save;
    const exits = Game.EXITS.filter((e) => s.exits[e]).length;
    const suns = Object.values(s.sunCoins).reduce((n, arr) => n + arr.filter(Boolean).length, 0);
    Hud.panel(ctx, VIEW_W / 2 - 250, 150, 500, 112);
    Clay.label(ctx, `Exits found ${exits}/6   ·   Sun coins ${suns}/9   ·   Score ${s.score}`, VIEW_W / 2, 178, 18, '#fff8ec', 'center');
    const hint = exits < 6 ? 'Some paths are still hidden. Keys open keyholes, and the Cloud Switch changes everything.' : 'Every exit found! Have you visited the Starlight Lookout?';
    Clay.label(ctx, hint, VIEW_W / 2, 208, 14, '#ffe9b8', 'center');
    Clay.label(ctx, 'Sculpted, animated and scored in code. Thanks for playing!', VIEW_W / 2, 236, 14, '#d9f2ff', 'center');
    if (this.t > 60 && Math.floor(this.t / 30) % 2 === 0) Clay.label(ctx, 'press jump to return to the map', VIEW_W / 2, VIEW_H - 30, 15, '#fff8ec', 'center');
  }
}

class StarScene {
  constructor(game) {
    this.game = game;
    this.t = 0;
    const s = game.save;
    this.firstTime = !s.starCape;
    s.starCape = true;
    game.persist();
    Sound.playSong('star');
    this.stars = [];
    const rnd = U.rng(42);
    for (let i = 0; i < 120; i++) this.stars.push([rnd() * VIEW_W, rnd() * VIEW_H * 0.75, rnd() * 1.8 + 0.4, rnd() * 6]);
  }
  update() {
    this.t++;
    if (this.t > 60 && (Input.pressed('jump') || Input.pressed('pause'))) {
      Sound.play('select');
      this.game.transition(VIEW_W / 2, VIEW_H / 2, () => this.game.toMap());
    }
  }
  render(ctx) {
    sceneSky(ctx, '#140f33', '#3a2c6e', '#7a5aa8');
    for (const [x, y, r, ph] of this.stars) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(this.t * 0.05 + ph);
      ctx.fillStyle = '#fff6d6';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    Clay.island(ctx, VIEW_W / 2, 390, 260, 130, { grass: '#c9b8ff', dirt: '#9b86d6', rock: '#6f5aa8', leaf: '#b7a4ff', trunk: '#6f5aa8' }, 33, { band: 22, cloudColor: '#d9cdef', cloudShade: '#9b8dc1' });
    ctx.save();
    ctx.translate(VIEW_W / 2, 390);
    drawHero(ctx, 1, 2, 'glide', { age: this.t, walkPhase: 0, starCape: true, vx: 0, pitch: 0 });
    ctx.restore();
    Clay.text(ctx, 'Starlight Lookout', VIEW_W / 2, 96, 54, '#fff1a8');
    Hud.panel(ctx, VIEW_W / 2 - 280, 150, 560, 80);
    Clay.label(ctx, this.firstTime ? 'You found the hidden peak of the Clay Isles!' : 'The stars remember you.', VIEW_W / 2, 176, 19, '#fff8ec', 'center');
    Clay.label(ctx, 'Your cape now shimmers with stardust.', VIEW_W / 2, 204, 15, '#e6d9ff', 'center');
    if (this.t > 60 && Math.floor(this.t / 30) % 2 === 0) Clay.label(ctx, 'press jump to return to the map', VIEW_W / 2, VIEW_H - 30, 15, '#fff8ec', 'center');
  }
}

class GameOverScene {
  constructor(game) {
    this.game = game;
    this.t = 0;
    Sound.stopSong();
    Sound.play('gameover');
  }
  update() {
    this.t++;
    if (this.t > 90 && (Input.pressed('jump') || Input.pressed('pause'))) {
      const s = this.game.save;
      s.lives = Math.round(CFG.startLives);
      s.coins = 0;
      this.game.persist();
      this.game.transition(VIEW_W / 2, VIEW_H / 2, () => this.game.toMap());
    }
  }
  render(ctx) {
    sceneSky(ctx, '#2b1838', '#4a2a5c', '#6b3d6e');
    const k = U.easeOutBack(Math.min(1, this.t / 30));
    ctx.save();
    ctx.translate(VIEW_W / 2, VIEW_H / 2 - 30);
    ctx.scale(k, k);
    Clay.text(ctx, 'GAME OVER', 0, 0, 72, '#ff8fb1');
    ctx.restore();
    Clay.label(ctx, 'Your map progress is safe. Lives are refilled.', VIEW_W / 2, VIEW_H / 2 + 50, 17, '#f3dff7', 'center');
    if (this.t > 90 && Math.floor(this.t / 30) % 2 === 0) Clay.label(ctx, 'press jump', VIEW_W / 2, VIEW_H / 2 + 90, 15, '#fff8ec', 'center');
  }
}
