'use strict';
// The in-level runtime: parses a level grid into entities, runs the simulation,
// resolves interactions, drives the camera and draws the scene, HUD and overlays.

const STOMP_SCORES = [100, 200, 400, 800, 1000, 2000, 4000, 8000];

// Pre-rendered block sprites (per render scale) so blocks with embossed glyphs stay cheap.
const BlockArt = {
  cache: new Map(),
  get(c, rs, on) {
    const k = c + rs + (on ? '+' : '');
    let cv = this.cache.get(k);
    if (cv) return cv;
    cv = Clay.makeCanvas(36 * rs, 36 * rs);
    const g = cv.getContext('2d');
    g.setTransform(rs, 0, 0, rs, 2 * rs, 2 * rs);
    g.lineJoin = 'round';
    Clay.still = true;
    this.paint(g, c, on);
    Clay.still = false;
    this.cache.set(k, cv);
    return cv;
  },
  paint(g, c, on) {
    const rivets = (col) => {
      for (const [x, y] of [[5, 5], [26, 5], [5, 25], [26, 25]]) Clay.blob(g, x, y, 1.6, 1.6, col, x + y, { flat: true });
    };
    switch (c) {
      case '?': case 'M': case 'W': case 'E': case '1':
        Clay.block(g, 0.5, 0.5, 31, 31, '#f5b83d');
        Clay.text(g, '?', 15.5, 15, 21, '#fff3c4', { depth: 2, dark: '#a8641a' });
        rivets('#c98a24');
        break;
      case 'U':
        Clay.block(g, 0.5, 0.5, 31, 31, '#b5825a');
        rivets('#8a5c3c');
        break;
      case 'B':
        Clay.block(g, 0.5, 0.5, 31, 31, '#d4734b');
        g.strokeStyle = U.rgba('#7a3320', 0.55);
        g.lineWidth = 1.8;
        g.beginPath();
        g.moveTo(3, 15.5);
        g.lineTo(28, 15.5);
        g.moveTo(16, 3);
        g.lineTo(16, 15);
        g.moveTo(9, 16);
        g.lineTo(9, 28);
        g.moveTo(23, 16);
        g.lineTo(23, 28);
        g.stroke();
        break;
      case 'I':
        Clay.block(g, 0.5, 0.5, 31, 31, '#9b7be0');
        Clay.text(g, 'i', 15.5, 15, 20, '#ffffff', { depth: 2, dark: '#4d3291' });
        break;
      case 'L':
        Clay.block(g, 0.5, 0.5, 31, 31, '#e8b934');
        g.fillStyle = '#5c3d0c';
        Clay.ellipsePath(g, 15.5, 12, 4, 4);
        g.fill();
        g.beginPath();
        g.moveTo(13, 14);
        g.lineTo(11, 23);
        g.lineTo(20, 23);
        g.lineTo(18, 14);
        g.fill();
        break;
      case 'O':
        if (on) {
          Clay.block(g, 0.5, 0.5, 31, 31, '#5aa9ff');
          Clay.text(g, '!', 15.5, 15, 20, '#ffffff', { depth: 2, dark: '#2459a8' });
        } else {
          g.strokeStyle = 'rgba(70,140,255,0.85)';
          g.lineWidth = 2.2;
          g.setLineDash([4, 4]);
          Clay.rrect(g, 2, 2, 28, 28, 7);
          g.stroke();
          g.setLineDash([]);
          g.fillStyle = 'rgba(90,169,255,0.12)';
          g.fill();
        }
        break;
    }
  },
};

class Level {
  constructor(game, id, opts) {
    this.game = game;
    this.id = id;
    this.spec = LEVEL_SPECS[id];
    const g = buildLevel(id);
    this.w = g.w;
    this.h = g.h;
    this.W = g.w * TILE;
    this.H = g.h * TILE;
    this.origRows = g.toStrings();
    this.grid = g.rows.map((r) => r.slice());
    this.theme = THEMES[this.spec.theme];
    this.switchOn = !!opts.switchOn;
    this.q = makeTileQuery(this.grid, this.w, this.h, () => this.switchOn);
    this.entities = [];
    this.platforms = [];
    this.particles = [];
    this.bumps = new Map();
    this.locks = [];
    this.infoMsgs = new Map();
    this.sunGot = (opts.sunCoins || []).slice();
    this.reserve = opts.reserve || null;
    this.state = 'play';
    this.stateT = 0;
    this.cam = { x: 0, y: 0 };
    this.camTargetY = 0;
    this.prevCamX = 0;
    this.look = 0;
    this.shakeT = 0;
    this.time = Math.round(CFG.timeLimit);
    this.timeFrames = 0;
    this.companion = null;
    this.transformAnim = null;
    this.message = null;
    this.banner = null;
    this.checkpointReached = !!opts.checkpoint;
    this.pauseSel = 0;
    this.parse(opts);
    this.terrain = new TerrainRenderer(this);
    this.backdrop = new Backdrop(this.theme, this.H, id.charCodeAt(0) + id.length * 7);
    this.snapCamera();
  }

  parse(opts) {
    const T = TILE;
    let sunIdx = 0, msgIdx = 0;
    // column-major so numbering follows the level's left-to-right progression
    for (let x = 0; x < this.w; x++) {
      for (let y = 0; y < this.h; y++) {
        const c = this.grid[y][x];
        let e = null, clear = true;
        switch (c) {
          case 'P': this.start = { x: x * T + 6, y: (y + 1) * T }; break;
          case 'o': e = new Coin(this, x, y); break;
          case '$': e = new SunCoin(this, x, y, sunIdx++); break;
          case 'K': e = new Key(this, x, y); break;
          case 'H': e = this.keyhole = new Keyhole(this, x, y); break;
          case 'G': e = this.goal = new Goal(this, x, y); break;
          case 'C': e = this.checkpointEnt = new Checkpoint(this, x, y, opts.checkpoint); break;
          case 'S': e = new Spring(this, x, y); break;
          case 'Y': e = this.companion = new Companion(this, x * T + 16, (y + 1) * T); break;
          case 'g': e = new Mudlet(this, x, y); break;
          case 'k': e = new Snail(this, x, y); break;
          case 's': e = new Thornbun(this, x, y); break;
          case 'f': e = new Flapper(this, x, y, false); break;
          case 'v': e = new Flapper(this, x, y, true); break;
          case '@': e = this.boss = new KingMudlet(this, x, y); break;
          case 'T': e = new BigSwitch(this, x, y); break;
          case 'm': e = new MovingPlatform(this, x, y, false); break;
          case 'n': e = new MovingPlatform(this, x, y, true); break;
          case 'Z': e = new Cannon(this, x, y); clear = false; break;
          case 'I': this.infoMsgs.set(y * this.w + x, msgIdx++); clear = false; break;
          default: clear = false;
        }
        if (clear) this.grid[y][x] = '.';
        if (e) this.addEntity(e);
      }
    }
    this.sunCount = sunIdx;
    while (this.sunGot.length < sunIdx) this.sunGot.push(false);
    this.sunStart = this.sunGot.slice();
    let sx = this.start.x, sy = this.start.y;
    if (opts.checkpoint && this.checkpointEnt) {
      sx = this.checkpointEnt.x + 4;
      sy = this.checkpointEnt.y + this.checkpointEnt.h;
    }
    this.player = new Player(this, sx, sy, { power: opts.power, starCape: opts.starCape });
    if (opts.companion) {
      const c = new Companion(this, this.player.cx, sy);
      this.addEntity(c);
      this.companion = c;
      this.player.mount(c);
    }
  }
  addEntity(e) {
    this.entities.push(e);
    if (e.isPlatform) this.platforms.push(e);
  }
  spawn(e) {
    e.active = true;
    this.addEntity(e);
    return e;
  }

  // ---------- tile helpers ----------
  setTile(tx, ty, c) {
    if (tx >= 0 && ty >= 0 && tx < this.w && ty < this.h) this.grid[ty][tx] = c;
  }
  platformAt(x, y) {
    for (const p of this.platforms) if (x >= p.x && x <= p.x + p.w && y >= p.y - 2 && y <= p.y + p.h + 2) return p;
    return null;
  }
  landOnPlatforms(b, prevBottom) {
    if (b.vy < 0) return;
    for (const p of this.platforms) {
      if (b === p || b.x + b.w <= p.x || b.x >= p.x + p.w) continue;
      if (prevBottom <= p.y + 1 + Math.max(0, p.dy) && b.y + b.h >= p.y) {
        b.y = p.y - b.h;
        b.vy = 0;
        b.onGround = true;
        b.platform = p;
        return;
      }
    }
  }
  findGrabbable(p) {
    const box = { x: p.x - 4, y: p.y, w: p.w + 8, h: p.h };
    for (const e of this.entities) if (!e.dead && e.grabbable && U.overlap(box, e)) return e;
    return null;
  }

  // ---------- block interactions ----------
  hitBlock(tx, ty, src) {
    const c = this.q.tile(tx, ty);
    const key = ty * this.w + tx;
    const T = TILE, cx = tx * T + 16, top = ty * T;
    const p = this.player;
    const bump = () => {
      this.bumps.set(key, 10);
      this.bumpAbove(tx, ty);
    };
    switch (c) {
      case '?':
        this.setTile(tx, ty, 'U');
        bump();
        this.spawn(new BlockCoin(this, cx, top - 24));
        this.addCoin(cx, top - 16, true);
        break;
      case 'M':
        this.setTile(tx, ty, 'U');
        bump();
        this.spawn(new PowerItem(this, cx, top, 'mushroom'));
        Sound.play('sprout');
        break;
      case 'W':
        this.setTile(tx, ty, 'U');
        bump();
        this.spawn(new Feather(this, cx, top - 10));
        Sound.play('sprout');
        break;
      case '1':
        this.setTile(tx, ty, 'U');
        bump();
        this.spawn(new PowerItem(this, cx, top, 'oneup'));
        Sound.play('sprout');
        break;
      case 'E':
        this.setTile(tx, ty, 'U');
        bump();
        if (this.companion && !this.companion.dead) this.spawn(new PowerItem(this, cx, top, 'oneup'));
        else this.spawn(new Egg(this, cx, top + 2));
        Sound.play('sprout');
        break;
      case 'B':
        if ((src === 'head' && p.power > 0) || src === 'shell' || src === 'spin') this.breakBlock(tx, ty);
        else {
          bump();
          Sound.play('bump');
        }
        break;
      case 'I':
        bump();
        this.showMessage(this.spec.messages[this.infoMsgs.get(key)] || '...');
        break;
      default:
        if (src === 'head') Sound.play('bump');
    }
  }
  bumpAbove(tx, ty) {
    const box = { x: tx * TILE, y: ty * TILE - 6, w: TILE, h: 8 };
    for (const e of this.entities) {
      if (e.dead || !U.overlap(box, e)) continue;
      if (e.enemy && !e.ko && !e.inert) e.bumped();
      else if (e instanceof Coin) e.touchPlayer(this.player);
      else if (e instanceof PowerItem && !e.emerge) {
        e.vy = -5;
        e.dir = e.cx < (tx + 0.5) * TILE ? -1 : 1;
      }
    }
  }
  breakBlock(tx, ty) {
    this.setTile(tx, ty, '.');
    const cx = tx * TILE + 16, cy = ty * TILE + 16;
    for (const [vx, vy] of [[-2.5, -7], [2.5, -7], [-1.8, -4], [1.8, -4]]) this.chunk(cx, cy, '#d4734b', vx, vy, 6);
    this.addScore(50, cx, cy - 10, true);
    Sound.play('break');
  }
  unlockFrom(tx, ty) {
    const seen = new Set();
    const queue = [[tx, ty, 0]];
    let any = false;
    while (queue.length) {
      const [x, y, d] = queue.shift();
      const k = y * this.w + x;
      if (seen.has(k) || this.q.tile(x, y) !== 'L') continue;
      seen.add(k);
      this.setTile(x, y, '.');
      this.locks.push({ tx: x, ty: y, t: d * 5, life: 18 });
      any = true;
      queue.push([x + 1, y, d + 1], [x - 1, y, d + 1], [x, y + 1, d + 1], [x, y - 1, d + 1]);
    }
    if (any) Sound.play('unlock');
  }

  // ---------- scoring & feedback ----------
  addCoin(x, y, fromBlock) {
    const s = this.game.save;
    s.coins++;
    s.score += 10;
    if (s.coins >= 100) {
      s.coins -= 100;
      this.oneUp(x, y - 20);
    }
    Sound.play('coin');
    if (!fromBlock) this.sparkle(x, y, 3);
  }
  addScore(n, x, y, quiet) {
    this.game.save.score += n;
    if (!quiet) this.text(x, y, String(n));
  }
  oneUp(x, y) {
    this.game.save.lives++;
    this.text(x, y, '1UP', '#7dff8a');
    Sound.play('oneup');
  }
  stompReward(p, x, y) {
    p.combo++;
    if (p.combo > STOMP_SCORES.length) this.oneUp(x, y);
    else this.addScore(STOMP_SCORES[p.combo - 1], x, y);
  }
  chainScore(shell, x, y) {
    shell.chain = (shell.chain || 0) + 1;
    if (shell.chain > STOMP_SCORES.length - 1) this.oneUp(x, y);
    else this.addScore(STOMP_SCORES[shell.chain], x, y);
  }
  collectSun(coin) {
    this.sunGot[coin.index] = true;
    this.addScore(1000, coin.cx, coin.y);
    this.sparkle(coin.cx, coin.cy, 10);
    Sound.play('key');
  }
  reachCheckpoint() {
    this.checkpointReached = true;
    Sound.play('checkpoint');
    const p = this.player;
    for (let i = 0; i < 12; i++) this.confetti(this.checkpointEnt.cx, this.checkpointEnt.y + 30);
    if (p.power === 0) {
      p.power = 1;
      this.transform('grow');
    }
  }

  // ---------- particles ----------
  particle(o) {
    if (this.particles.length > 320) return;
    this.particles.push(Object.assign({ vx: 0, vy: 0, g: 0, rot: 0, vr: 0, size: 4, life: 30, color: '#ffffff' }, o, { max: o.life || 30 }));
  }
  dust(x, y, n) {
    const k = Math.round(n * CFG.particles);
    for (let i = 0; i < k; i++) this.particle({ type: 'dust', x: x + U.rand(-6, 6), y: y - 3, vx: U.rand(-1, 1), vy: U.rand(-0.8, -0.2), size: U.rand(3, 6), life: 24, color: '#f2e2cf' });
  }
  puff(x, y, size) {
    const k = Math.max(1, Math.round(5 * size * CFG.particles));
    for (let i = 0; i < k; i++) this.particle({ type: 'puff', x: x + U.rand(-8, 8) * size, y: y + U.rand(-6, 6) * size, vx: U.rand(-1, 1), vy: U.rand(-1, 0.3), size: U.rand(5, 9) * size, life: 28 });
  }
  sparkle(x, y, n) {
    const k = Math.round(n * CFG.particles);
    for (let i = 0; i < k; i++) this.particle({ type: 'spark', x: x + U.rand(-12, 12), y: y + U.rand(-12, 12), vy: -0.4, size: U.rand(3, 6), life: 26, color: '#fff2a8' });
  }
  chunk(x, y, color, vx, vy, size = 4) {
    this.particle({ type: 'chunk', x, y, vx, vy, g: 0.4, vr: U.rand(-0.3, 0.3), size, life: 60, color });
  }
  confetti(x, y) {
    const cols = ['#ff6f91', '#ffd166', '#6ec6ff', '#7dff8a', '#c77dff'];
    this.particle({ type: 'confetti', x, y, vx: U.rand(-3, 3), vy: U.rand(-6, -2), g: 0.15, vr: U.rand(-0.3, 0.3), size: 4, life: 70, color: cols[(Math.random() * cols.length) | 0] });
  }
  text(x, y, str, color = '#fff8ec') {
    this.particle({ type: 'text', x, y, vy: -1.1, life: 50, text: str, color });
  }
  shake(n) {
    this.shakeT = Math.max(this.shakeT, n);
  }

  // ---------- events ----------
  showMessage(text) {
    this.message = { text, t: 0 };
    Sound.play('message');
  }
  transform(kind) {
    if (this.state !== 'play') return;
    this.state = 'freeze';
    const p = this.player;
    if (kind === 'grow') this.transformAnim = { from: 0, to: 1, t: 36 };
    else if (kind === 'shrink') this.transformAnim = { from: 1, to: 0, t: 36 };
    else {
      this.transformAnim = { from: 2, to: 2, t: 22 };
      this.puff(p.cx, p.cy, 1.3);
    }
  }
  dropReserve() {
    if (!this.reserve) return;
    const kind = this.reserve;
    this.reserve = null;
    const x = this.player.cx, y = this.cam.y - 10;
    if (kind === 'feather') this.spawn(new Feather(this, x, y, true));
    else this.spawn(new PowerItem(this, x, y, 'mushroom', true));
    Sound.play('select');
  }
  groundPound(p) {
    this.shake(18);
    Sound.play('pound');
    this.dust(p.cx, p.y + p.h, 10);
    for (const e of this.entities) {
      if (e.enemy && e.active && !e.ko && !e.inert && !e.boss && e.onGround && Math.abs(e.cx - p.cx) < VIEW_W / 2) e.knockOut(e.cx < p.cx ? -1 : 1);
    }
  }
  startBoss() {
    Sound.playSong('boss');
    this.bossActive = true;
    this.shake(20);
    this.banner = { text: 'KING MUDLET!', t: 0, life: 110, color: '#ff9a6b' };
  }
  goalReached(goal, frac) {
    if (this.state !== 'play') return;
    const p = this.player;
    this.state = 'clear';
    this.clearKind = 'goal';
    this.stateT = 0;
    p.dropCarried();
    p.auto = CFG.walkSpeed * 0.8;
    p.flight = 0;
    Sound.stopSong();
    Sound.play('clear');
    if (frac >= 0) {
      const bonus = Math.max(1, Math.round(frac * 50)) * 100;
      this.addScore(bonus, goal.cx, goal.tapeY);
      Sound.play('tape');
      for (let i = 0; i < 6; i++) this.chunk(goal.cx, goal.tapeY, '#ff9a3c', U.rand(-3, 3), U.rand(-5, -1), 5);
    }
    // enemies on screen turn into coins, like the end of a good clay montage
    for (const e of this.entities) {
      if (e.enemy && !e.dead && !e.boss && e.x > this.cam.x - 40 && e.x < this.cam.x + VIEW_W + 40) {
        e.dead = true;
        this.puff(e.cx, e.cy, 0.6);
        this.spawn(new BlockCoin(this, e.cx, e.y));
        this.addCoin(e.cx, e.y, true);
      }
    }
  }
  orbReached(orb) {
    if (this.state !== 'play') return;
    this.state = 'clear';
    this.clearKind = 'orb';
    this.stateT = 0;
    this.player.dropCarried();
    Sound.stopSong();
    Sound.play('clear');
    this.sparkle(orb.cx, orb.cy, 16);
  }
  pressSwitch() {
    this.switchOn = true;
    this.game.save.switchOn = true;
    this.state = 'switch';
    this.stateT = 0;
    this.shake(20);
    Sound.stopSong();
    Sound.play('switch');
    for (let i = 0; i < 30; i++) this.confetti(this.player.cx, this.player.y);
  }
  startKeyhole() {
    if (this.state !== 'play') return;
    this.state = 'keyhole';
    this.stateT = 0;
    Sound.stopSong();
    Sound.play('secret');
  }
  playerDied() {
    this.state = 'dying';
    this.stateT = 0;
    Sound.stopSong();
    Sound.bongos = false;
    Sound.play('death');
  }
  finish(exit) {
    if (this.finished) return;
    this.finished = true;
    const p = this.player;
    this.game.levelEnded({
      id: this.id,
      exit,
      sunGot: this.sunGot.slice(),
      power: p.power,
      companion: !!p.riding,
      reserve: this.reserve,
      checkpoint: exit === 'death' || exit === 'quit' ? this.checkpointReached : false,
    });
  }

  // ---------- update ----------
  update() {
    this.stateT++;
    if (this.shakeT > 0) this.shakeT--;
    if (this.banner && ++this.banner.t > this.banner.life) this.banner = null;
    if (this.message) {
      this.message.t++;
      if (this.message.t > 18 && (Input.pressed('jump') || Input.pressed('run') || Input.pressed('pause') || Input.pressed('spin'))) {
        this.message = null;
        Input.consume();
      }
      return;
    }
    switch (this.state) {
      case 'paused':
        return this.updatePause();
      case 'freeze':
        this.updateParticles();
        if (--this.transformAnim.t <= 0) {
          this.transformAnim = null;
          this.state = 'play';
        }
        return;
      case 'dying':
        this.player.deathUpdate();
        this.updateParticles();
        if (this.stateT > 170) this.finish('death');
        return;
      case 'keyhole':
        this.updateParticles();
        if (this.stateT > 240) this.finish('secret');
        return;
      case 'switch':
        this.updateParticles();
        if (this.stateT === 45) this.showMessage('You pressed the Cloud Switch! Every dotted block across the Clay Isles is solid now. Look for new routes in Gusty Glade and Thunderhead Keep.');
        if (this.stateT > 46) {
          this.state = 'clear';
          this.clearKind = 'switch';
          this.stateT = 60;
        }
        return;
      case 'clear':
        return this.updateClear();
      default:
        return this.updatePlay();
    }
  }
  updatePlay() {
    if (Input.pressed('pause')) {
      this.state = 'paused';
      this.pauseSel = 0;
      Sound.play('pause');
      return;
    }
    if (Input.pressed('reserve')) this.dropReserve();
    this.world(true);
    if (this.state !== 'play') return;
    if (++this.timeFrames >= 60) {
      this.timeFrames = 0;
      this.time--;
      if (this.time === 100) {
        Sound.tempoMul = 1.2;
        this.banner = { text: 'HURRY UP!', t: 0, life: 90, color: '#ffb3c7' };
        Sound.play('pause');
      }
      if (this.time <= 0) {
        this.time = 0;
        if (!CFG.godMode) this.player.die(false);
      }
    }
  }
  updateClear() {
    const p = this.player;
    if (this.clearKind === 'goal') {
      if (this.stateT > 110) p.auto = 0;
      p.update();
    }
    this.world(false);
    if (this.stateT === 40) {
      const t = this.clearKind === 'orb' ? 'KEEP CLEARED!' : this.clearKind === 'switch' ? 'SWITCH PRESSED!' : 'COURSE CLEAR!';
      this.banner = { text: t, t: 0, life: 9999, color: '#ffe27a' };
    }
    if (this.stateT > 90 && this.time > 0 && this.clearKind !== 'switch') {
      const n = Math.min(this.time, 4);
      this.time -= n;
      this.game.save.score += n * 50;
      if (this.stateT % 3 === 0) Sound.play('step');
    }
    if (this.stateT > 120 && (this.time <= 0 || this.clearKind === 'switch') && this.stateT > 230) this.finish('normal');
  }
  updatePause() {
    if (Input.pressed('up') || Input.pressed('down')) {
      this.pauseSel = 1 - this.pauseSel;
      Sound.play('select');
    }
    const resume = Input.pressed('pause') || (Input.pressed('jump') && this.pauseSel === 0);
    if (resume) {
      this.state = 'play';
      Sound.play('pause');
      Input.consume();
    } else if (Input.pressed('jump')) {
      Input.consume();
      this.finish('quit');
    }
  }
  world(withPlayer) {
    for (const pl of this.platforms) pl.move();
    const carry = (b) => {
      if (b.platform) {
        b.x += b.platform.dx;
        b.y += b.platform.dy;
        b.platform = null;
      }
    };
    carry(this.player);
    for (const e of this.entities) carry(e);
    this.updateActivation();
    if (withPlayer) this.player.update();
    const list = this.entities;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.dead && e.active && !e.caught) e.update();
    }
    if (withPlayer && !this.player.dead) this.interact();
    if (list.some((e) => e.dead)) {
      this.entities = list.filter((e) => !e.dead);
      this.platforms = this.platforms.filter((e) => !e.dead);
    }
    this.updateParticles();
    for (const [k, v] of this.bumps) {
      if (v <= 1) this.bumps.delete(k);
      else this.bumps.set(k, v - 1);
    }
    for (const l of this.locks) {
      if (l.t > 0) l.t--;
      else if (--l.life === 8) this.puff((l.tx + 0.5) * TILE, (l.ty + 0.5) * TILE, 0.6);
    }
    this.locks = this.locks.filter((l) => l.life > 0);
    this.updateCamera();
    this.backdrop.update(this.cam.x - this.prevCamX);
  }
  updateActivation() {
    const x0 = this.cam.x - 160, x1 = this.cam.x + VIEW_W + 160;
    for (const e of this.entities) {
      if (e.alwaysActive) e.active = true;
      else if (e.x + e.w > x0 && e.x < x1) e.active = true;
      else if (e.active && (e.x + e.w < x0 - VIEW_W || e.x > x1 + VIEW_W)) e.active = false;
    }
  }
  interact() {
    const p = this.player;
    // springs
    for (const s of this.entities) {
      if (s instanceof Spring && p.vy > 0 && U.overlap(p, s) && p.prevBottom <= s.y + 12) {
        p.y = s.y - p.h;
        p.springBounce();
        s.squashT = 14;
      }
    }
    // hop onto Dumpling
    const c = this.companion;
    if (c && !c.dead && !p.riding && c.mountable && !p.carrying && p.vy > 0 && U.overlap(p, c) && p.y + p.h < c.y + 22) p.mount(c);
    // the big switch
    if (p.platform instanceof BigSwitch && !p.platform.pressed) p.platform.press();
    if (this.state !== 'play') return;
    for (const e of this.entities) {
      if (e.dead || !e.active || e === p.carrying || e.caught) continue;
      if (e.enemy) {
        if (e.inert || !U.overlap(p, e)) continue;
        const stomp = p.vy > 0 && p.y + p.h - e.y < Math.min(e.h * 0.6, 18) + p.vy;
        if (stomp) this.stomp(p, e);
        else e.touchPlayer(p);
        if (p.dead || this.state !== 'play') return;
      } else if (e.item && !e.carriedBy && U.overlap(p, e)) {
        e.touchPlayer(p);
      }
    }
    if (p.capeSpin > 0) {
      const r = CFG.capeSpinReach;
      const box = { x: p.cx - r, y: p.y + p.h * 0.3, w: r * 2, h: p.h * 0.7 };
      for (const e of this.entities) {
        if (!e.enemy || e.dead || e.ko || e.inert || !e.active || p.spinHits.has(e) || !U.overlap(box, e)) continue;
        p.spinHits.add(e);
        e.hitBySpin(e.cx < p.cx ? -1 : 1);
      }
      for (const side of [-1, 1]) {
        const tx = Math.floor((p.cx + side * (p.w / 2 + 6)) / TILE);
        const ty = Math.floor((p.y + p.h - 10) / TILE);
        const key = 'b' + (ty * this.w + tx);
        if (!p.spinHits.has(key) && TILE_HITTABLE.has(this.q.tile(tx, ty))) {
          p.spinHits.add(key);
          this.hitBlock(tx, ty, 'spin');
        }
      }
    }
    if (this.keyhole && p.carrying instanceof Key && (U.overlap(p.carrying, this.keyhole) || U.overlap(p, this.keyhole))) this.startKeyhole();
  }
  stomp(p, e) {
    if (e.boss) {
      e.stomp(p);
      return;
    }
    if (e.spiky && !p.riding) {
      if (p.spinning) {
        p.bounce(0.85);
        this.puff(p.cx, p.y + p.h, 0.4);
        Sound.play('bump');
      } else e.touchPlayer(p);
      return;
    }
    const spin = p.spinning || !!p.riding;
    const x = e.cx, y = e.y;
    e.stomp(p, spin);
    this.stompReward(p, x, y);
    p.bounce(spin ? 0.8 : 1);
  }
  updateParticles() {
    for (const q of this.particles) {
      q.life--;
      q.x += q.vx;
      q.y += q.vy;
      q.vy += q.g;
      q.rot += q.vr;
    }
    this.particles = this.particles.filter((q) => q.life > 0);
  }
  snapCamera() {
    const p = this.player;
    this.cam.x = U.clamp(p.cx - VIEW_W / 2 + p.facing * CFG.camLookahead, 0, Math.max(0, this.W - VIEW_W));
    this.camTargetY = U.clamp(p.cy - VIEW_H * 0.56, -TILE * 2, Math.max(0, this.H - VIEW_H));
    this.cam.y = this.camTargetY;
    this.prevCamX = this.cam.x;
  }
  updateCamera() {
    const p = this.player;
    this.prevCamX = this.cam.x;
    if (p.dead) return;
    const target = this.state === 'play' ? p.facing * CFG.camLookahead : 0;
    this.look = U.approach(this.look, target, 2.5);
    let minX = 0;
    if (this.bossActive && this.boss) minX = this.boss.ax0 - TILE;
    const tx = U.clamp(p.cx + this.look - VIEW_W / 2, minX, Math.max(minX, this.W - VIEW_W));
    this.cam.x += (tx - this.cam.x) * CFG.camSmoothing;
    if (p.onGround || p.flight || p.riding || p.y < this.cam.y + 110 || p.y + p.h > this.cam.y + VIEW_H - 70) {
      this.camTargetY = p.cy - VIEW_H * 0.56;
    }
    const ty = U.clamp(this.camTargetY, -TILE * 2, Math.max(0, this.H - VIEW_H));
    const k = p.vy > 6 ? Math.max(CFG.camVertical, 0.2) : CFG.camVertical;
    this.cam.y += (ty - this.cam.y) * k;
  }

  // ---------- render ----------
  render(ctx, rs) {
    this.terrain.setScale(rs);
    this.backdrop.ensure(rs);
    let sx = 0, sy = 0;
    if (this.shakeT > 0 && CFG.screenShake > 0) {
      const m = CFG.screenShake * Math.min(6, this.shakeT * 0.5);
      sx = (Math.random() - 0.5) * m;
      sy = (Math.random() - 0.5) * m;
    }
    this.backdrop.drawBack(ctx, this.cam);
    const camX = Math.round((this.cam.x + sx) * rs) / rs;
    const camY = Math.round((this.cam.y + sy) * rs) / rs;
    ctx.save();
    ctx.translate(-camX, -camY);
    this.terrain.draw(ctx, camX);
    const layers = [[], [], [], [], [], [], [], []];
    const vx0 = camX - 96, vx1 = camX + VIEW_W + 96, vy0 = camY - 96, vy1 = camY + VIEW_H + 96;
    for (const e of this.entities) {
      if (e.x + e.w < vx0 || e.x > vx1 || e.y + e.h < vy0 || e.y > vy1) continue;
      layers[e.layer].push(e);
    }
    for (const e of layers[0]) e.draw(ctx);
    for (const e of layers[1]) e.draw(ctx);
    this.drawTiles(ctx, camX, camY, rs);
    for (let l = 2; l <= 5; l++) for (const e of layers[l]) e.draw(ctx);
    for (const e of layers[6]) e.draw(ctx);
    if (this.state !== 'keyhole' || this.stateT < 150) this.player.draw(ctx);
    for (const e of layers[0]) if (e.drawFront) e.drawFront(ctx);
    for (const e of layers[7]) e.draw(ctx);
    this.drawParticles(ctx);
    this.backdrop.drawSea(ctx, this.cam, Clay.time);
    if (CFG.showHitboxes) this.drawHitboxes(ctx);
    ctx.restore();
    this.backdrop.drawAmbient(ctx);
  }
  drawTiles(ctx, camX, camY, rs) {
    const T = TILE;
    const tx0 = Math.max(0, Math.floor(camX / T) - 1), tx1 = Math.min(this.w - 1, Math.floor((camX + VIEW_W) / T) + 1);
    const ty0 = Math.max(0, Math.floor(camY / T) - 1), ty1 = Math.min(this.h - 1, Math.floor((camY + VIEW_H) / T) + 1);
    for (let ty = ty0; ty <= ty1; ty++) {
      const row = this.grid[ty];
      for (let tx = tx0; tx <= tx1; tx++) {
        const c = row[tx];
        if (!TILE_DYNAMIC.has(c) || c === 'Z') continue;
        const b = this.bumps.get(ty * this.w + tx);
        const off = b ? -Math.sin((b / 10) * Math.PI) * 9 : 0;
        const j = Clay.jit(tx * 7 + ty * 3, 0.7);
        ctx.drawImage(BlockArt.get(c, rs, this.switchOn), tx * T - 2 + j, ty * T - 2 + off, 36, 36);
      }
    }
    for (const l of this.locks) {
      const k = l.t > 0 ? 1 : l.life / 18;
      const s = 36 * k;
      ctx.globalAlpha = Math.min(1, k * 1.5);
      ctx.drawImage(BlockArt.get('L', rs, false), (l.tx + 0.5) * T - s / 2, (l.ty + 0.5) * T - s / 2, s, s);
      ctx.globalAlpha = 1;
    }
  }
  drawParticles(ctx) {
    for (const q of this.particles) {
      const k = q.life / q.max;
      switch (q.type) {
        case 'dust':
          ctx.globalAlpha = k * 0.85;
          Clay.blob(ctx, q.x, q.y, q.size * (1.5 - k * 0.6), q.size * (1.2 - k * 0.4), q.color, 9, { flat: true });
          break;
        case 'puff':
          ctx.globalAlpha = Math.min(1, k * 1.4);
          Clay.blob(ctx, q.x, q.y, q.size * (1.3 - k * 0.4), q.size * (1.15 - k * 0.35), '#ffffff', 21, { sheen: 0.4 });
          break;
        case 'spark': {
          ctx.globalAlpha = k;
          const s = q.size * (0.5 + k * 0.5);
          ctx.fillStyle = q.color;
          Clay.ellipsePath(ctx, q.x, q.y, s, s * 0.22);
          ctx.fill();
          Clay.ellipsePath(ctx, q.x, q.y, s * 0.22, s);
          ctx.fill();
          break;
        }
        case 'chunk':
          ctx.save();
          ctx.translate(q.x, q.y);
          ctx.rotate(q.rot);
          Clay.blob(ctx, 0, 0, q.size, q.size * 0.8, q.color, 33);
          ctx.restore();
          break;
        case 'confetti':
          ctx.save();
          ctx.translate(q.x, q.y);
          ctx.rotate(q.rot);
          ctx.fillStyle = q.color;
          ctx.fillRect(-q.size / 2, -q.size / 3, q.size, q.size * 0.66);
          ctx.restore();
          break;
        case 'text':
          ctx.globalAlpha = Math.min(1, k * 2);
          Clay.label(ctx, q.text, q.x, q.y, 15, q.color, 'center');
          break;
      }
      ctx.globalAlpha = 1;
    }
  }
  drawHitboxes(ctx) {
    ctx.lineWidth = 1;
    const p = this.player;
    ctx.strokeStyle = '#00ff88';
    ctx.strokeRect(p.x, p.y, p.w, p.h);
    for (const e of this.entities) {
      ctx.strokeStyle = e.enemy ? '#ff3355' : e.isPlatform ? '#33aaff' : '#ffee33';
      ctx.strokeRect(e.x, e.y, e.w, e.h);
    }
    if (p.capeSpin > 0) {
      ctx.strokeStyle = '#ff00ff';
      const r = CFG.capeSpinReach;
      ctx.strokeRect(p.cx - r, p.y + p.h * 0.3, r * 2, p.h * 0.7);
    }
    if (this.companion && this.companion.tongueDir) {
      const t = this.companion.tip();
      ctx.strokeStyle = '#ff88cc';
      ctx.strokeRect(t.x, t.y, t.w, t.h);
    }
  }

  // ---------- HUD & overlays ----------
  drawHUD(ctx) {
    const s = this.game.save, p = this.player;
    Hud.panel(ctx, 14, 12, 210, 58);
    Hud.head(ctx, 40, 41, p.riding);
    Clay.label(ctx, '× ' + s.lives, 62, 33, 20);
    for (let i = 0; i < this.sunCount; i++) Hud.sun(ctx, 70 + i * 24, 56, this.sunGot[i]);
    if (this.spec.exits.includes('secret')) {
      const found = this.game.save.exits[this.id + ':secret'];
      Clay.label(ctx, found ? 'key ✓' : '', 168, 56, 13, '#ffe27a');
    }
    // P-meter
    Hud.panel(ctx, 236, 12, 196, 40);
    for (let i = 0; i < 6; i++) {
      const lit = p.p * 6 > i + 0.5 || p.pFull;
      Hud.chevron(ctx, 256 + i * 22, 32, lit ? (p.pFull && Math.floor(Clay.time * 10) % 2 ? '#fff6c2' : '#ffb347') : 'rgba(255,255,255,0.22)');
    }
    Clay.label(ctx, 'P', 398, 32, 22, p.pFull ? (Math.floor(Clay.time * 10) % 2 ? '#ffffff' : '#ff6f91') : 'rgba(255,255,255,0.35)', 'center');
    // reserve box
    Hud.reserveBox(ctx, VIEW_W / 2, 38, this.reserve);
    // coins / score / time
    Hud.panel(ctx, VIEW_W - 316, 12, 302, 58);
    drawCoin(ctx, VIEW_W - 290, 33, Clay.time * 3, 4, 0.9);
    Clay.label(ctx, '× ' + String(s.coins).padStart(2, '0'), VIEW_W - 274, 33, 20);
    Clay.label(ctx, String(s.score).padStart(7, '0'), VIEW_W - 30, 33, 20, '#fff8ec', 'right');
    Clay.label(ctx, 'TIME', VIEW_W - 290, 57, 13, '#ffe27a');
    Clay.label(ctx, String(Math.max(0, this.time)), VIEW_W - 248, 57, 17, this.time <= 100 ? '#ff9fb0' : '#fff8ec');
    Clay.label(ctx, this.spec.name, VIEW_W - 30, 57, 14, '#d9f2ff', 'right');
  }
  drawOverlays(ctx) {
    if (this.state === 'keyhole') {
      const kh = this.keyhole;
      const sx = kh.cx - this.cam.x, sy = kh.cy - this.cam.y;
      const t = Math.min(1, this.stateT / 150);
      const r = 760 * Math.pow(1 - t, 1.6);
      if (r > 1) {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(1 + t * 2, 1 + t * 2);
        drawKey(ctx, 0, -6, 1, 3);
        ctx.restore();
      }
      Clay.iris(ctx, sx, sy, r);
      if (this.stateT > 150) Clay.text(ctx, 'SECRET EXIT!', VIEW_W / 2, VIEW_H / 2, 54, '#ffe27a');
    }
    if (this.banner) {
      const b = this.banner;
      const k = Math.min(1, b.t / 14);
      ctx.save();
      ctx.translate(VIEW_W / 2, VIEW_H * 0.36);
      const s = U.easeOutBack(k);
      ctx.scale(s, s);
      Clay.text(ctx, b.text, 0, 0, 58, b.color);
      ctx.restore();
    }
    if (this.state === 'paused') {
      ctx.fillStyle = 'rgba(30,18,44,0.5)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      Clay.block(ctx, VIEW_W / 2 - 170, VIEW_H / 2 - 100, 340, 200, '#f6e7d2', { noPrint: true });
      Clay.text(ctx, 'PAUSED', VIEW_W / 2, VIEW_H / 2 - 52, 38, '#ff8fb1');
      const opts = ['Keep playing', 'Back to the map'];
      opts.forEach((o, i) => {
        const y = VIEW_H / 2 + 6 + i * 42;
        if (i === this.pauseSel) {
          ctx.fillStyle = 'rgba(255,143,177,0.3)';
          Clay.rrect(ctx, VIEW_W / 2 - 130, y - 17, 260, 34, 14);
          ctx.fill();
        }
        Clay.label(ctx, o, VIEW_W / 2, y, 22, i === this.pauseSel ? '#ffffff' : '#ead8ff', 'center');
      });
    }
    if (this.message) Hud.message(ctx, this.message.text, this.message.t);
  }
}

// HUD drawing helpers shared by the level and the map.
const Hud = {
  panel(ctx, x, y, w, h) {
    ctx.fillStyle = 'rgba(52,30,66,0.42)';
    Clay.rrect(ctx, x, y + 3, w, h, 16);
    ctx.fill();
    ctx.fillStyle = 'rgba(70,42,90,0.38)';
    Clay.rrect(ctx, x, y, w, h, 16);
    ctx.fill();
  },
  head(ctx, x, y, riding) {
    if (riding) Clay.blob(ctx, x + 10, y + 6, 8, 6, DINO.body, 7);
    Clay.blob(ctx, x, y, 11, 10.5, HERO.skin, 1);
    Clay.blob(ctx, x - 1, y - 6, 12, 6, HERO.cap, 2);
    Clay.blob(ctx, x + 8, y + 1, 4, 3.4, HERO.nose, 3);
    Clay.blob(ctx, x + 4, y - 2, 1.4, 2, '#2a1a22', 4, { flat: true });
  },
  sun(ctx, x, y, got) {
    if (got) Clay.blob(ctx, x, y, 8, 9, COL.sun, x, { wob: 0.04 });
    else {
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 2;
      Clay.ellipsePath(ctx, x, y, 7, 8);
      ctx.stroke();
    }
  },
  chevron(ctx, x, y, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - 6, y - 9);
    ctx.lineTo(x + 6, y);
    ctx.lineTo(x - 6, y + 9);
    ctx.lineTo(x - 1, y);
    ctx.closePath();
    ctx.fill();
  },
  reserveBox(ctx, cx, cy, item) {
    ctx.fillStyle = 'rgba(52,30,66,0.5)';
    Clay.rrect(ctx, cx - 26, cy - 24, 52, 50, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,248,236,0.85)';
    ctx.lineWidth = 3;
    Clay.rrect(ctx, cx - 24, cy - 26, 48, 48, 12);
    ctx.stroke();
    if (item === 'feather') drawFeather(ctx, cx, cy - 2, 0.3, 7);
    else if (item === 'mushroom') {
      Clay.blob(ctx, cx, cy + 6, 7, 6.5, COL.stem, 8);
      Clay.blob(ctx, cx, cy - 3, 12, 8.5, COL.cap, 9);
      Clay.blob(ctx, cx - 5, cy - 6, 2.8, 2.4, '#ffffff', 10, { flat: true });
    }
  },
  message(ctx, text, t) {
    const k = U.easeOutBack(Math.min(1, t / 12));
    ctx.save();
    ctx.fillStyle = `rgba(30,18,44,${0.35 * Math.min(1, t / 8)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.translate(VIEW_W / 2, VIEW_H / 2);
    ctx.scale(k, k);
    ctx.font = `600 21px ${FONT}`;
    const lines = Clay.wrapText(ctx, text, 520);
    const h = 70 + lines.length * 30;
    Clay.block(ctx, -300, -h / 2, 600, h, '#f6e7d2', { noPrint: true });
    ctx.strokeStyle = '#9b7be0';
    ctx.lineWidth = 3;
    Clay.rrect(ctx, -288, -h / 2 + 10, 576, h - 24, 14);
    ctx.stroke();
    ctx.fillStyle = '#3b2440';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, 0, -h / 2 + 40 + i * 30));
    if (t > 18 && Math.floor(t / 20) % 2 === 0) {
      ctx.font = `700 14px ${FONT}`;
      ctx.fillStyle = '#9b7be0';
      ctx.fillText('press jump to continue', 0, h / 2 - 22);
    }
    ctx.restore();
  },
};
