'use strict';
// Enemies, items and level objects. Each one owns its behaviour and its claymation art.
// Draw layers (low to high): 0 platforms/goal back, 1 fixtures, 2 items, 3 enemies,
// 4 projectiles & carried things, 5 companion, 6 player, 7 front details.

const COL = {
  mud: '#b8693e', mudDark: '#5b3524', snail: '#cddc6c', shell: '#ec7d8c', thorn: '#7470d6', spike: '#ffb347',
  flap: '#5cc6ea', pellet: '#4b4458', gold: '#f7c331', sun: '#ffb627', cap: '#e8483f', capGreen: '#4fbf5a',
  stem: '#fff1d6', eye: '#fffaf0', ink: '#2a1a22', key: '#ffcc3d', stone: '#9b93b4', pink: '#ff86b6',
};

class Entity {
  constructor(level, x, y, w, h) {
    this.level = level;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
    this.dead = false;
    this.age = 0;
    this.layer = 2;
    this.active = false;
    this.alwaysActive = false;
    this.seed = (Math.random() * 1e6) | 0;
  }
  get cx() {
    return this.x + this.w / 2;
  }
  get cy() {
    return this.y + this.h / 2;
  }
  get bottom() {
    return this.y + this.h;
  }
  physics(grav = CFG.gravity, maxFall = CFG.maxFall) {
    this.vy = Math.min(this.vy + grav, maxFall);
    const prevBottom = this.y + this.h;
    const res = moveBody(this, this.level.q);
    this.level.landOnPlatforms(this, prevBottom);
    return res;
  }
  update() {}
  draw() {}
}

// ===========================================================================
// Enemies
class Enemy extends Entity {
  constructor(level, x, y, w, h) {
    super(level, x, y, w, h);
    this.enemy = true;
    this.dir = -1;
    this.spiky = false;
    this.edible = true;
    this.ledgeSmart = false;
    this.ko = false;
    this.inert = false;
    this.rot = 0;
    this.score = 100;
    this.layer = 3;
  }
  koUpdate() {
    this.vy += 0.45;
    this.x += this.vx;
    this.y += this.vy;
    this.rot += 0.2 * this.koDir;
    if (this.y > this.level.H + 80) this.dead = true;
  }
  walk(speed) {
    this.vx = this.dir * speed;
    const res = this.physics();
    if (res.left) this.dir = 1;
    else if (res.right) this.dir = -1;
    if (this.ledgeSmart && this.onGround) {
      const fx = this.dir > 0 ? this.x + this.w + 1 : this.x - 1;
      const fy = this.y + this.h + 4;
      const tx = Math.floor(fx / TILE), ty = Math.floor(fy / TILE);
      if (!this.level.q.solidAt(tx, ty) && !this.level.q.oneWayAt(tx, ty) && !this.level.platformAt(fx, fy)) {
        this.dir *= -1;
        this.x += this.dir * speed;
      }
    }
    if (this.y > this.level.H + 64) this.dead = true;
    return res;
  }
  knockOut(dir, silent, noScore) {
    if (this.ko || this.dead) return;
    this.ko = true;
    this.inert = true;
    this.koDir = dir || 1;
    this.vy = -6;
    this.vx = (dir || 1) * 1.6;
    this.alwaysActive = true;
    this.layer = 4;
    if (!noScore) this.level.addScore(this.score, this.cx, this.y);
    if (!silent) Sound.play('kick');
  }
  poof(noScore) {
    this.dead = true;
    this.level.puff(this.cx, this.cy, 1.3);
    if (!noScore) this.level.addScore(this.score, this.cx, this.y);
    Sound.play('stomp');
  }
  stomp(player, spin) {
    if (spin) this.poof(true);
    else this.squish();
  }
  squish() {
    this.knockOut(1);
  }
  hitBySpin(dir) {
    this.knockOut(dir);
  }
  hitByShell(dir) {
    this.knockOut(dir);
  }
  bumped() {
    this.knockOut(this.dir);
  }
  touchPlayer(p) {
    p.hurt(this);
  }
  beginDraw(ctx) {
    ctx.save();
    if (this.ko) {
      ctx.translate(this.cx, this.cy);
      ctx.rotate(this.rot);
      ctx.scale(1, -1);
      ctx.translate(-this.cx, -this.cy);
    }
  }
}

function drawEyes(ctx, cx, cy, dir, spread, rx, ry, seed, look = 1.2) {
  for (const s of [-1, 1]) {
    Clay.blob(ctx, cx + s * spread + dir * 1.2, cy, rx, ry, COL.eye, seed + 5 + s, { sheen: 0.4 });
    Clay.blob(ctx, cx + s * spread + dir * (1.2 + look), cy + ry * 0.18, rx * 0.5, ry * 0.55, COL.ink, seed + 7 + s, { flat: true });
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    Clay.ellipsePath(ctx, cx + s * spread + dir * (0.6 + look), cy - ry * 0.12, rx * 0.16, ry * 0.14);
    ctx.fill();
  }
}

class Mudlet extends Enemy {
  constructor(level, tx, ty) {
    super(level, tx * TILE + 3, ty * TILE + TILE - 24, 26, 24);
    this.squashT = 0;
  }
  update() {
    if (this.ko) return this.koUpdate();
    if (this.squashT > 0) {
      if (--this.squashT === 0) this.dead = true;
      return;
    }
    this.age++;
    this.walk(CFG.enemySpeed);
  }
  squish() {
    this.squashT = 30;
    this.inert = true;
    Sound.play('squish');
    this.level.dust(this.cx, this.y + this.h, 4);
  }
  draw(ctx) {
    const cx = this.cx, by = this.y + this.h, d = this.dir;
    if (this.squashT > 0) {
      Clay.blob(ctx, cx, by - 4, 16, 4.5, COL.mud, this.seed);
      ctx.strokeStyle = COL.ink;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (const s of [-1, 1]) {
        ctx.moveTo(cx + s * 5 - 2, by - 6);
        ctx.lineTo(cx + s * 5 + 2, by - 3);
        ctx.moveTo(cx + s * 5 + 2, by - 6);
        ctx.lineTo(cx + s * 5 - 2, by - 3);
      }
      ctx.stroke();
      return;
    }
    this.beginDraw(ctx);
    Clay.shadow(ctx, cx, by, 30, this.ko ? 0 : 1);
    const step = Math.sin(this.age * 0.3);
    Clay.blob(ctx, cx - 6 + step * 2.2, by - 3, 5.2, 3.4, COL.mudDark, this.seed + 1);
    Clay.blob(ctx, cx + 6 - step * 2.2, by - 3, 5.2, 3.4, COL.mudDark, this.seed + 2);
    const sq = 1 + Math.abs(step) * 0.05;
    Clay.blob(ctx, cx, by - 13, 13.5 * sq, 11.5 / sq, COL.mud, this.seed);
    Clay.blob(ctx, cx - 1 - d * 2, by - 24, 4, 3.4, U.shade(COL.mud, 0.08), this.seed + 3);
    drawEyes(ctx, cx, by - 15, d, 4.6, 3.3, 4.2, this.seed);
    ctx.strokeStyle = '#4a2418';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 8.5 + d * 1.5, by - 22);
    ctx.lineTo(cx - 2 + d * 1.5, by - 19.5);
    ctx.moveTo(cx + 8.5 + d * 1.5, by - 22);
    ctx.lineTo(cx + 2 + d * 1.5, by - 19.5);
    ctx.stroke();
    ctx.fillStyle = '#4a2418';
    Clay.ellipsePath(ctx, cx + d * 2, by - 8, 3.4, 1.8);
    ctx.fill();
    ctx.fillStyle = '#fffaf0';
    ctx.beginPath();
    ctx.moveTo(cx + d * 2 - 2.5, by - 9);
    ctx.lineTo(cx + d * 2 - 1.2, by - 6.5);
    ctx.lineTo(cx + d * 2, by - 9);
    ctx.fill();
    ctx.restore();
  }
}

class Snail extends Enemy {
  constructor(level, tx, ty) {
    super(level, tx * TILE + 3, ty * TILE + TILE - 28, 26, 28);
    this.state = 'walk';
    this.ledgeSmart = true;
    this.wake = 0;
    this.kickGrace = 0;
    this.spinRot = 0;
    this.score = 100;
  }
  setState(s) {
    const bottom = this.y + this.h;
    const cx = this.cx;
    this.state = s;
    if (s === 'walk') {
      this.w = 26;
      this.h = 28;
      this.alwaysActive = false;
    } else {
      this.w = 24;
      this.h = 22;
    }
    this.x = cx - this.w / 2;
    this.y = bottom - this.h;
    if (s === 'shell') {
      this.wake = CFG.shellWakeFrames;
      this.alwaysActive = true;
    }
    if (s === 'kicked') this.alwaysActive = true;
  }
  get grabbable() {
    return this.state === 'shell' && !this.ko;
  }
  update() {
    if (this.ko) return this.koUpdate();
    this.age++;
    if (this.kickGrace > 0) this.kickGrace--;
    switch (this.state) {
      case 'walk':
        this.walk(CFG.enemySpeed * 0.85);
        break;
      case 'shell':
        this.vx = U.approach(this.vx, 0, this.onGround ? 0.25 : 0.03);
        this.physics();
        if (--this.wake <= 0) this.setState('walk');
        if (this.y > this.level.H + 64) this.dead = true;
        break;
      case 'kicked': {
        this.vx = this.dir * CFG.shellSpeed;
        this.spinRot += this.dir * 0.35;
        const res = this.physics();
        if (res.left || res.right) {
          const tx = res.right ? Math.floor((this.x + this.w + 1) / TILE) : Math.floor((this.x - 1) / TILE);
          const ty = Math.floor((this.y + this.h / 2) / TILE);
          this.level.hitBlock(tx, ty, 'shell');
          this.dir = res.right ? -1 : 1;
          Sound.play('bump');
        }
        this.hitEnemies(false);
        if (this.y > this.level.H + 64) this.dead = true;
        break;
      }
      case 'carried':
        if (--this.wake <= 0) {
          this.level.player.dropCarried();
          this.setState('walk');
          this.vy = -3;
        } else this.hitEnemies(true);
        break;
    }
  }
  hitEnemies(held) {
    for (const e of this.level.entities) {
      if (e === this || !e.enemy || e.ko || e.dead || e.inert || !U.overlap(this, e)) continue;
      if (e.boss) {
        e.hitByShell(this.dir);
        this.knockOut(-this.dir);
        if (held) this.level.player.dropCarried();
        return;
      }
      if (e instanceof Snail && (e.state === 'kicked' || held)) {
        e.knockOut(this.dir);
        this.knockOut(-this.dir);
        if (held) this.level.player.dropCarried();
        return;
      }
      e.hitByShell(this.dir);
      this.level.chainScore(this, e.cx, e.y);
      if (held) {
        this.knockOut(-this.level.player.facing);
        this.level.player.dropCarried();
        return;
      }
    }
  }
  kick(dir) {
    this.dir = dir;
    this.setState('kicked');
    this.kickGrace = 14;
    this.chain = 0;
    Sound.play('kick');
    this.level.puff(this.cx - dir * 10, this.y + this.h - 4, 0.5);
  }
  stomp(player, spin) {
    if (spin) return this.poof(true);
    if (this.state === 'shell') this.kick(player.cx < this.cx ? 1 : -1);
    else {
      this.setState('shell');
      this.vx = 0;
      Sound.play('stomp');
    }
  }
  touchPlayer(p) {
    if (this.state === 'shell') {
      if (Input.down('run') && !p.carrying && !p.riding) p.grab(this);
      else this.kick(p.cx < this.cx ? 1 : -1);
      return;
    }
    if (this.state === 'kicked' && this.kickGrace > 0) return;
    if (this.state === 'carried') return;
    p.hurt(this);
  }
  drawShell(ctx, cx, cy, r, rot) {
    Clay.blob(ctx, cx, cy, r, r * 0.9, COL.shell, this.seed);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.strokeStyle = U.shade(COL.shell, -0.38);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 4; a += 0.3) {
      const rr = r * 0.78 * (1 - a / (Math.PI * 4.6));
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr * 0.9;
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }
  draw(ctx) {
    const cx = this.cx, by = this.y + this.h, d = this.dir;
    this.beginDraw(ctx);
    if (this.state === 'walk') {
      Clay.shadow(ctx, cx, by, 32, this.ko ? 0 : 1);
      const wig = Math.sin(this.age * 0.2);
      Clay.blob(ctx, cx - d * 2, by - 6, 14 + wig, 6.5, COL.snail, this.seed + 1);
      Clay.blob(ctx, cx + d * 10, by - 12, 6.5, 7.5, COL.snail, this.seed + 2);
      ctx.strokeStyle = U.shade(COL.snail, -0.3);
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(cx + d * 8, by - 17);
      ctx.lineTo(cx + d * 6, by - 25 + wig);
      ctx.moveTo(cx + d * 12, by - 17);
      ctx.lineTo(cx + d * 14, by - 25 - wig);
      ctx.stroke();
      for (const [ex, ey] of [[cx + d * 6, by - 26 + wig], [cx + d * 14, by - 26 - wig]]) {
        Clay.blob(ctx, ex, ey, 3, 3, COL.eye, this.seed + ex, { sheen: 0.3 });
        Clay.blob(ctx, ex + d, ey + 0.5, 1.4, 1.6, COL.ink, 3, { flat: true });
      }
      ctx.strokeStyle = U.shade(COL.snail, -0.45);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx + d * 12, by - 10, 2.5, 0.1, Math.PI - 0.1);
      ctx.stroke();
      this.drawShell(ctx, cx - d * 3, by - 16, 11.5, 0);
    } else {
      Clay.shadow(ctx, cx, by, 26, this.ko ? 0 : 1);
      let sx = 0;
      if (this.state === 'shell' && this.wake < 100) sx = Math.sin(this.age * 1.2) * 1.5;
      this.drawShell(ctx, cx + sx, by - 11, 12, this.state === 'kicked' ? this.spinRot : 0);
      if (this.state === 'shell' && this.wake < 100) {
        Clay.blob(ctx, cx + sx - 4, by - 4, 2.4, 2.4, COL.eye, 5, { sheen: 0.2 });
        Clay.blob(ctx, cx + sx + 4, by - 4, 2.4, 2.4, COL.eye, 6, { sheen: 0.2 });
      }
    }
    ctx.restore();
  }
}

class Thornbun extends Enemy {
  constructor(level, tx, ty) {
    super(level, tx * TILE + 3, ty * TILE + TILE - 24, 26, 24);
    this.spiky = true;
    this.ledgeSmart = true;
    this.score = 200;
  }
  update() {
    if (this.ko) return this.koUpdate();
    this.age++;
    this.walk(CFG.enemySpeed * 0.9);
  }
  stomp(player, spin) {
    this.poof(true);
  }
  draw(ctx) {
    const cx = this.cx, by = this.y + this.h, d = this.dir;
    this.beginDraw(ctx);
    Clay.shadow(ctx, cx, by, 30, this.ko ? 0 : 1);
    const step = Math.sin(this.age * 0.35);
    Clay.blob(ctx, cx - 6 + step * 2, by - 3, 4.5, 3, '#3b2f6b', this.seed + 1);
    Clay.blob(ctx, cx + 6 - step * 2, by - 3, 4.5, 3, '#3b2f6b', this.seed + 2);
    ctx.fillStyle = U.shade(COL.spike, -0.15);
    for (let k = 0; k < 7; k++) {
      const a = -Math.PI * 0.95 + (k / 6) * Math.PI * 0.9 + Math.sin(this.age * 0.1 + k) * 0.03;
      const bx = cx + Math.cos(a) * 9, byy = by - 12 + Math.sin(a) * 8;
      const tx = cx + Math.cos(a) * 19, ty = by - 12 + Math.sin(a) * 17;
      const px = Math.cos(a + Math.PI / 2) * 4, py = Math.sin(a + Math.PI / 2) * 4;
      ctx.beginPath();
      ctx.moveTo(bx + px, byy + py);
      ctx.lineTo(tx, ty);
      ctx.lineTo(bx - px, byy - py);
      ctx.closePath();
      ctx.fill();
      Clay.blob(ctx, tx - Math.cos(a), ty - Math.sin(a), 2, 2, '#fff2c2', k, { flat: true });
    }
    Clay.blob(ctx, cx, by - 11, 13, 10.5, COL.thorn, this.seed);
    Clay.blob(ctx, cx + d * 4, by - 8, 6, 4, U.shade(COL.thorn, 0.35), this.seed + 3, { sheen: 0.3 });
    drawEyes(ctx, cx + d * 2, by - 14, d, 4, 2.8, 3.4, this.seed, 0.9);
    Clay.blob(ctx, cx + d * 10, by - 10, 2.5, 2, COL.pink, this.seed + 9);
    ctx.restore();
  }
}

class Flapper extends Enemy {
  constructor(level, tx, ty, vertical) {
    super(level, tx * TILE + 2, ty * TILE + 4, 28, 24);
    this.x0 = this.x;
    this.y0 = this.y;
    this.vertical = vertical;
    this.t = U.hash(tx * 7 + ty) * 300;
    this.score = 200;
  }
  update() {
    if (this.ko) return this.koUpdate();
    this.age++;
    this.t += CFG.flapperSpeed;
    const range = 3 * TILE;
    const nx = this.vertical ? this.x0 + Math.sin(this.t * 0.03) * 8 : this.x0 + Math.sin(this.t * 0.018) * range;
    const ny = this.vertical ? this.y0 + Math.sin(this.t * 0.022) * range : this.y0 + Math.sin(this.t * 0.07) * 14;
    if (Math.abs(nx - this.x) > 0.05) this.dir = nx > this.x ? 1 : -1;
    this.vx = nx - this.x;
    this.vy = ny - this.y;
    this.x = nx;
    this.y = ny;
  }
  stomp(player, spin) {
    if (spin) return this.poof(true);
    Sound.play('stomp');
    this.knockOut(player.facing, true, true);
  }
  draw(ctx) {
    const cx = this.cx, cy = this.cy, d = this.dir;
    this.beginDraw(ctx);
    const flap = Math.sin(this.age * 0.45);
    Clay.blob(ctx, cx - d * 13, cy + 2, 5, 3, U.shade(COL.flap, -0.15), this.seed + 4);
    ctx.save();
    ctx.translate(cx - d * 3, cy - 4);
    ctx.rotate(-d * (0.5 + flap * 0.7));
    Clay.blob(ctx, -d * 8, -2, 10, 5, '#ffffff', this.seed + 1);
    ctx.restore();
    Clay.blob(ctx, cx, cy, 12, 11, COL.flap, this.seed);
    Clay.blob(ctx, cx + d * 2, cy + 4, 7, 5, U.shade(COL.flap, 0.45), this.seed + 2, { sheen: 0.3 });
    drawEyes(ctx, cx + d * 3, cy - 3, d, 3.4, 2.8, 3.4, this.seed, 0.8);
    ctx.fillStyle = '#ff9a3c';
    ctx.beginPath();
    ctx.moveTo(cx + d * 9, cy - 1);
    ctx.lineTo(cx + d * 16, cy + 1.5);
    ctx.lineTo(cx + d * 9, cy + 3.5);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.translate(cx + d * 2, cy - 5);
    ctx.rotate(d * (0.4 + flap * 0.8));
    Clay.blob(ctx, d * 9, -2, 10, 5, '#ffffff', this.seed + 3);
    ctx.restore();
    ctx.restore();
  }
}

class Pellet extends Enemy {
  constructor(level, x, y, dir) {
    super(level, x, y, 26, 18);
    this.dir = dir;
    this.edible = false;
    this.alwaysActive = true;
    this.layer = 4;
    this.score = 200;
  }
  update() {
    if (this.ko) return this.koUpdate();
    this.age++;
    this.x += this.dir * CFG.pelletSpeed;
    if (this.age % 7 === 0) this.level.puff(this.cx - this.dir * 14, this.cy, 0.25);
    const cam = this.level.cam;
    if (this.x < cam.x - 400 || this.x > cam.x + VIEW_W + 400) this.dead = true;
  }
  stomp(player, spin) {
    Sound.play('stomp');
    this.knockOut(player.facing, true, true);
  }
  draw(ctx) {
    const cx = this.cx, cy = this.cy, d = this.dir;
    this.beginDraw(ctx);
    Clay.blob(ctx, cx - d * 9, cy, 6, 8.5, U.shade(COL.pellet, -0.2), this.seed + 1);
    Clay.blob(ctx, cx + d * 1, cy, 13, 9, COL.pellet, this.seed);
    Clay.blob(ctx, cx + d * 5, cy - 2.5, 3.6, 3.6, COL.eye, this.seed + 2, { sheen: 0.3 });
    Clay.blob(ctx, cx + d * 6.2, cy - 2, 1.8, 2, COL.ink, 1, { flat: true });
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx + d * 2, cy - 7);
    ctx.lineTo(cx + d * 8, cy - 5.5);
    ctx.stroke();
    ctx.restore();
  }
}

class Cannon extends Entity {
  constructor(level, tx, ty) {
    super(level, tx * TILE, ty * TILE, TILE, TILE);
    this.timer = 50 + U.hash(tx * 3 + ty) * 60;
    this.aim = -1;
    this.recoil = 0;
    this.layer = 1;
  }
  update() {
    const p = this.level.player;
    const dx = p.cx - this.cx;
    this.aim = dx < 0 ? -1 : 1;
    if (this.recoil > 0) this.recoil--;
    if (Math.abs(dx) < 15 * TILE && Math.abs(dx) > 2.2 * TILE && Math.abs(p.cy - this.cy) < 7 * TILE) {
      if (--this.timer <= 0) {
        this.timer = CFG.cannonInterval;
        this.fire();
      }
    } else this.timer = Math.min(this.timer, 50);
  }
  fire() {
    const dir = this.aim;
    const px = dir > 0 ? this.x + TILE - 2 : this.x - 24;
    if (this.level.q.solidAt(Math.floor((px + 13) / TILE), Math.floor((this.y + 16) / TILE))) return;
    this.level.spawn(new Pellet(this.level, px, this.y + 7, dir));
    this.level.puff(this.cx + dir * 18, this.cy, 0.7);
    this.recoil = 10;
    Sound.play('boom');
  }
  draw(ctx) {
    const x = this.x, y = this.y, d = this.aim;
    Clay.block(ctx, x + 0.5, y + 0.5, TILE - 1, TILE - 1, '#6d6584');
    const r = this.recoil / 10;
    const bx = this.cx + d * (4 - r * 3), by = this.cy;
    Clay.blob(ctx, bx, by, 12, 11, '#3a3346', this.seed);
    Clay.blob(ctx, bx + d * 8, by, 4.5, 8, '#221d2b', this.seed + 1, { sheen: 0.2 });
    ctx.strokeStyle = '#d8b44a';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(bx + d * 2, by, 3, 10, 0, 0, TAU);
    ctx.stroke();
  }
}

class KingMudlet extends Enemy {
  constructor(level, tx, ty) {
    super(level, tx * TILE + 2, (ty + 2) * TILE - 60, 60, 60);
    this.boss = true;
    this.edible = false;
    this.hp = CFG.bossHP;
    this.maxHp = this.hp;
    this.state = 'wait';
    this.timer = 60;
    this.hurtT = 0;
    this.score = 5000;
    this.facing = -1;
    this.airT = 0;
    this.squash = 0;
    const b = level.spec.boss;
    this.ax0 = b.x0 * TILE;
    this.ax1 = (b.x1 + 1) * TILE;
  }
  update() {
    this.age++;
    if (this.hurtT > 0) this.hurtT--;
    this.squash *= 0.85;
    const p = this.level.player;
    if (this.state === 'dying') {
      this.timer--;
      if (this.timer % 6 === 0) this.level.puff(this.x + Math.random() * this.w, this.y + Math.random() * this.h, 0.8);
      if (this.timer <= 0) {
        this.dead = true;
        this.level.puff(this.cx, this.cy, 2.5);
        this.level.spawn(new GoalOrb(this.level, this.cx, this.cy));
      }
      return;
    }
    switch (this.state) {
      case 'wait':
        this.physics();
        if (p.x > this.ax0 + TILE && p.onGround) {
          this.state = 'idle';
          this.timer = 70;
          this.alwaysActive = true;
          this.level.startBoss();
        }
        break;
      case 'idle':
        this.vx = U.approach(this.vx, 0, 0.3);
        this.physics();
        this.facing = p.cx < this.cx ? -1 : 1;
        if (--this.timer <= 0) this.hop();
        break;
      case 'hop':
        this.physics();
        this.airT++;
        if (this.onGround && this.airT > 4) this.land();
        break;
    }
    if (this.x < this.ax0) {
      this.x = this.ax0;
      this.vx = Math.abs(this.vx);
    }
    if (this.x + this.w > this.ax1) {
      this.x = this.ax1 - this.w;
      this.vx = -Math.abs(this.vx);
    }
  }
  hop() {
    const p = this.level.player;
    const dir = p.cx < this.cx ? -1 : 1;
    const rage = this.maxHp - this.hp;
    this.facing = dir;
    this.vy = -CFG.bossHopPower * (0.75 + Math.random() * 0.4);
    this.vx = dir * (1.8 + rage * 0.7 + Math.random());
    this.state = 'hop';
    this.airT = 0;
    this.squash = -0.2;
  }
  land() {
    const rage = this.maxHp - this.hp;
    this.state = 'idle';
    this.timer = Math.max(18, 60 - rage * 14);
    this.squash = 0.3;
    this.level.shake(12);
    this.level.dust(this.cx, this.y + this.h, 10);
    Sound.play('pound');
    const p = this.level.player;
    if (p.onGround && Math.abs(p.cx - this.cx) < 7 * TILE && !p.riding) p.vy = -4.5;
    if (this.spawnNext) {
      this.spawnNext = false;
      const m = new Mudlet(this.level, Math.floor(this.cx / TILE) + (this.facing > 0 ? -2 : 2), Math.floor(this.y / TILE) - 1);
      m.dir = p.cx < m.cx ? -1 : 1;
      m.alwaysActive = true;
      this.level.spawn(m);
    }
  }
  damage() {
    if (this.hurtT > 0 || this.state === 'dying') return false;
    this.hp--;
    this.hurtT = 70;
    this.level.shake(10);
    Sound.play('bosshit');
    this.level.puff(this.cx, this.y, 1);
    if (this.hp <= 0) {
      this.state = 'dying';
      this.timer = 110;
      this.inert = true;
      this.level.addScore(this.score, this.cx, this.y);
      Sound.play('bossdie');
      Sound.stopSong();
    } else this.spawnNext = true;
    return true;
  }
  stomp(player) {
    this.damage();
    player.bounce(1.3);
  }
  hitByShell() {
    this.damage();
  }
  hitBySpin(dir) {
    this.vx = dir * 3;
  }
  knockOut() {}
  bumped() {}
  touchPlayer(p) {
    if (this.state !== 'dying') p.hurt(this);
  }
  draw(ctx) {
    if (this.hurtT > 0 && Math.floor(this.hurtT / 4) % 2 === 0) return;
    const cx = this.cx, by = this.y + this.h, d = this.facing;
    const sq = this.squash * CFG.squashStretch;
    const shrink = this.state === 'dying' ? Math.max(0.2, this.timer / 110) : 1;
    ctx.save();
    ctx.translate(cx, by);
    ctx.scale((1 + sq) * shrink, (1 - sq) * shrink);
    if (this.state === 'dying') ctx.rotate(Math.sin(this.age * 0.8) * 0.15);
    ctx.translate(-cx, -by);
    Clay.shadow(ctx, cx, by, 70);
    Clay.blob(ctx, cx - 16, by - 5, 11, 6.5, COL.mudDark, this.seed + 1);
    Clay.blob(ctx, cx + 16, by - 5, 11, 6.5, COL.mudDark, this.seed + 2);
    Clay.blob(ctx, cx, by - 30, 33, 28, COL.mud, this.seed);
    Clay.thumbprint(ctx, cx + 10, by - 18, 12, this.seed, 0.12);
    // crown
    const ky = by - 56;
    ctx.fillStyle = '#e8b52e';
    for (const k of [-1, 0, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + k * 10 - 7, ky + 4);
      ctx.lineTo(cx + k * 10, ky - 12 - (k === 0 ? 4 : 0));
      ctx.lineTo(cx + k * 10 + 7, ky + 4);
      ctx.closePath();
      ctx.fill();
      Clay.blob(ctx, cx + k * 10, ky - 13 - (k === 0 ? 4 : 0), 3, 3, '#ffe27a', k + 4);
    }
    Clay.blob(ctx, cx, ky + 4, 19, 6, '#f2c13d', this.seed + 3);
    Clay.blob(ctx, cx, ky + 4, 3, 3, '#e8483f', 11);
    Clay.blob(ctx, cx - 10, ky + 4, 2.4, 2.4, '#4a8cff', 12);
    Clay.blob(ctx, cx + 10, ky + 4, 2.4, 2.4, '#4fbf5a', 13);
    if (this.hurtT > 0 || this.state === 'dying') {
      ctx.strokeStyle = COL.ink;
      ctx.lineWidth = 3;
      for (const s of [-1, 1]) {
        const ex = cx + s * 11 + d * 3, ey = by - 34;
        ctx.beginPath();
        ctx.moveTo(ex - 4, ey - 4);
        ctx.lineTo(ex + 4, ey + 4);
        ctx.moveTo(ex + 4, ey - 4);
        ctx.lineTo(ex - 4, ey + 4);
        ctx.stroke();
      }
    } else {
      drawEyes(ctx, cx + d * 3, by - 34, d, 11, 7, 8.5, this.seed, 2);
      ctx.strokeStyle = '#4a2418';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 20 + d * 3, by - 48);
      ctx.lineTo(cx - 5 + d * 3, by - 43);
      ctx.moveTo(cx + 20 + d * 3, by - 48);
      ctx.lineTo(cx + 5 + d * 3, by - 43);
      ctx.stroke();
    }
    ctx.fillStyle = '#4a2418';
    Clay.ellipsePath(ctx, cx + d * 4, by - 16, 9, 4.5);
    ctx.fill();
    ctx.fillStyle = '#fffaf0';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + d * 4 + s * 5 - 2.5, by - 19);
      ctx.lineTo(cx + d * 4 + s * 5, by - 14);
      ctx.lineTo(cx + d * 4 + s * 5 + 2.5, by - 19);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ===========================================================================
// Items
class Item extends Entity {
  constructor(level, x, y, w, h) {
    super(level, x, y, w, h);
    this.item = true;
  }
  touchPlayer() {}
}

function drawCoin(ctx, cx, cy, t, seed, scale = 1) {
  const sx = Math.abs(Math.cos(t));
  const rx = 8.5 * scale * Math.max(0.2, sx), ry = 11 * scale;
  Clay.blob(ctx, cx, cy, rx, ry, COL.gold, seed, { wob: 0.03 });
  if (sx > 0.45) {
    ctx.strokeStyle = U.rgba('#b07b10', 0.75);
    ctx.lineWidth = 1.6;
    Clay.ellipsePath(ctx, cx - 0.5, cy - 0.5, rx * 0.55, ry * 0.6);
    ctx.stroke();
  }
}

class Coin extends Item {
  constructor(level, tx, ty) {
    super(level, tx * TILE + 6, ty * TILE + 4, 20, 24);
    this.phase = tx * 0.35;
  }
  touchPlayer() {
    this.dead = true;
    this.level.addCoin(this.cx, this.cy);
  }
  draw(ctx) {
    drawCoin(ctx, this.cx, this.cy, Clay.time * 3.2 + this.phase, this.seed);
  }
}

// The coin that pops out of a ? block.
class BlockCoin extends Entity {
  constructor(level, x, y) {
    super(level, x - 10, y, 20, 24);
    this.vy = -9;
    this.layer = 4;
  }
  update() {
    this.age++;
    this.y += this.vy;
    this.vy += 0.6;
    if (this.age > 26) {
      this.dead = true;
      this.level.sparkle(this.cx, this.cy, 4);
    }
  }
  draw(ctx) {
    drawCoin(ctx, this.cx, this.cy, this.age * 0.5, this.seed);
  }
}

class SunCoin extends Item {
  constructor(level, tx, ty, index) {
    super(level, tx * TILE + 2, ty * TILE - 4, 28, 36);
    this.index = index;
    this.ghost = !!level.sunGot[index];
  }
  touchPlayer() {
    this.dead = true;
    this.level.collectSun(this);
  }
  draw(ctx) {
    const cx = this.cx, cy = this.cy;
    const t = Clay.time * 1.6 + this.index;
    const sx = Math.abs(Math.cos(t));
    ctx.save();
    if (this.ghost) ctx.globalAlpha = 0.45;
    if (sx > 0.5) {
      ctx.fillStyle = U.rgba('#ffd36b', 0.9);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU + Clay.time;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a - 0.2) * 14 * sx, cy + Math.sin(a - 0.2) * 16);
        ctx.lineTo(cx + Math.cos(a) * 21 * sx, cy + Math.sin(a) * 22);
        ctx.lineTo(cx + Math.cos(a + 0.2) * 14 * sx, cy + Math.sin(a + 0.2) * 16);
        ctx.fill();
      }
    }
    Clay.blob(ctx, cx, cy, 14 * Math.max(0.2, sx), 17, COL.sun, this.seed, { wob: 0.04 });
    if (sx > 0.6) {
      ctx.fillStyle = '#7a3e10';
      Clay.ellipsePath(ctx, cx - 4 * sx, cy - 3, 1.6 * sx, 2.4);
      ctx.fill();
      Clay.ellipsePath(ctx, cx + 4 * sx, cy - 3, 1.6 * sx, 2.4);
      ctx.fill();
      ctx.strokeStyle = '#7a3e10';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 2, 5 * sx, 4, 0, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }
    ctx.restore();
  }
}

class PowerItem extends Item {
  // kind: 'mushroom' | 'oneup'
  constructor(level, x, y, kind, fromReserve) {
    super(level, x - 12, y, 24, 24);
    this.kind = kind;
    this.emerge = fromReserve ? 0 : 32;
    this.reserveFall = !!fromReserve;
    this.dir = level.player && level.player.cx > x ? -1 : 1;
    this.layer = this.emerge ? 1 : 2;
    this.alwaysActive = true;
  }
  update() {
    this.age++;
    if (this.emerge > 0) {
      this.y -= 1;
      if (--this.emerge === 0) this.layer = 2;
      return;
    }
    if (this.reserveFall) {
      this.y += 1.6;
      if (this.y > this.level.H) this.dead = true;
      return;
    }
    this.vx = this.dir * 1.7;
    const res = this.physics();
    if (res.left) this.dir = 1;
    else if (res.right) this.dir = -1;
    if (this.y > this.level.H + 40) this.dead = true;
  }
  touchPlayer(p) {
    if (this.emerge > 14) return;
    this.dead = true;
    if (this.kind === 'oneup') this.level.oneUp(this.cx, this.y);
    else p.powerUp('mushroom');
  }
  draw(ctx) {
    if (this.reserveFall && Math.floor(this.age / 5) % 2) return;
    const cx = this.cx, by = this.y + this.h;
    Clay.blob(ctx, cx, by - 7, 7.5, 7, COL.stem, this.seed + 1);
    ctx.fillStyle = COL.ink;
    Clay.ellipsePath(ctx, cx - 2.6, by - 7.5, 1.2, 2.2);
    ctx.fill();
    Clay.ellipsePath(ctx, cx + 2.6, by - 7.5, 1.2, 2.2);
    ctx.fill();
    const cap = this.kind === 'oneup' ? COL.capGreen : COL.cap;
    Clay.blob(ctx, cx, by - 16, 12.5, 9, cap, this.seed);
    Clay.blob(ctx, cx - 5.5, by - 19, 3, 2.6, '#ffffff', this.seed + 2, { flat: true });
    Clay.blob(ctx, cx + 5, by - 17, 2.6, 2.2, '#ffffff', this.seed + 3, { flat: true });
    Clay.blob(ctx, cx + 0.5, by - 23, 2.2, 1.6, '#ffffff', this.seed + 4, { flat: true });
  }
}

class Feather extends Item {
  constructor(level, x, y, fromReserve) {
    super(level, x - 13, y, 26, 22);
    this.phase = fromReserve ? 'float' : 'rise';
    this.vy = -5.5;
    this.baseX = this.x;
    this.t = 0;
    this.tilt = 0;
    this.layer = 2;
    this.alwaysActive = true;
  }
  update() {
    this.age++;
    if (this.phase === 'rise') {
      this.y += this.vy;
      this.vy += 0.17;
      if (this.vy >= 0) {
        this.phase = 'float';
        this.baseX = this.x;
      }
      return;
    }
    this.t++;
    this.x = this.baseX + Math.sin(this.t * 0.05) * 26;
    this.y += 0.75;
    this.tilt = Math.cos(this.t * 0.05) * 0.55;
    if (this.y > this.level.H + 30) this.dead = true;
  }
  touchPlayer(p) {
    if (this.phase === 'rise' && this.vy < -3) return;
    this.dead = true;
    p.powerUp('feather');
  }
  draw(ctx) {
    drawFeather(ctx, this.cx, this.cy, this.tilt, this.seed);
  }
}
function drawFeather(ctx, cx, cy, tilt, seed) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt - 0.35);
  Clay.blob(ctx, 0, 0, 13, 6.5, '#fff4dc', seed);
  Clay.blob(ctx, 7, -0.5, 6, 4.5, '#ffcf5a', seed + 1);
  ctx.strokeStyle = '#d9a441';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-15, 2);
  ctx.quadraticCurveTo(0, 0.5, 13, -1);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(180,140,90,0.45)';
  ctx.lineWidth = 1;
  for (let k = -8; k <= 8; k += 4) {
    ctx.beginPath();
    ctx.moveTo(k, 0.5);
    ctx.lineTo(k + 3, -5);
    ctx.moveTo(k, 0.5);
    ctx.lineTo(k + 3, 5);
    ctx.stroke();
  }
  ctx.restore();
}

class Key extends Item {
  constructor(level, tx, ty) {
    super(level, tx * TILE + 5, ty * TILE + TILE - 20, 22, 20);
    this.homeX = this.x;
    this.homeY = this.y;
    this.carriedBy = null;
    this.layer = 4;
    this.alwaysActive = true;
  }
  get grabbable() {
    return !this.carriedBy;
  }
  update() {
    this.age++;
    if (!this.carriedBy) {
      this.vx = U.approach(this.vx, 0, this.onGround ? 0.25 : 0.02);
      const res = this.physics();
      if (res.left || res.right) this.vx *= -0.4;
      if (this.y > this.level.H + 40) {
        // keys always come home, so a secret exit can't be lost for good
        this.x = this.homeX;
        this.y = this.homeY;
        this.vx = this.vy = 0;
        this.level.puff(this.cx, this.cy, 1);
        Sound.play('key');
      }
    }
    const hit = rectTouchesTile(this.level.q, this.x, this.y, this.w, this.h, 4, (c) => c === 'L');
    if (hit) this.level.unlockFrom(hit[0], hit[1]);
  }
  touchPlayer(p) {
    if (Input.down('run') && !p.carrying && !p.riding && !this.carriedBy) p.grab(this);
  }
  draw(ctx) {
    drawKey(ctx, this.cx, this.cy, this.carriedBy ? this.carriedBy.facing : 1, this.seed);
  }
}
function drawKey(ctx, cx, cy, d, seed) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(d, 1);
  ctx.fillStyle = U.shade(COL.key, -0.3);
  Clay.rrect(ctx, -3, -2.5, 15, 6, 2.5);
  ctx.fill();
  ctx.fillStyle = COL.key;
  Clay.rrect(ctx, -3, -3, 14, 4.5, 2);
  ctx.fill();
  Clay.blob(ctx, 8, 4, 2.4, 3.2, COL.key, seed + 1, { flat: true });
  Clay.blob(ctx, 4, 4, 2, 2.6, COL.key, seed + 2, { flat: true });
  Clay.blob(ctx, -6, -0.5, 7.5, 7.5, COL.key, seed);
  ctx.fillStyle = '#7a5410';
  Clay.ellipsePath(ctx, -6, -0.5, 2.8, 2.8);
  ctx.fill();
  ctx.restore();
}

class Keyhole extends Entity {
  constructor(level, tx, ty) {
    super(level, tx * TILE + 1, ty * TILE, 30, 2 * TILE);
    this.layer = 1;
  }
  draw(ctx) {
    const x = this.x, y = this.y;
    const near = this.level.player.carrying instanceof Key && Math.abs(this.level.player.cx - this.cx) < 160;
    if (near) {
      const a = 0.25 + 0.2 * Math.sin(Clay.time * 6);
      const g = ctx.createRadialGradient(this.cx, this.cy, 4, this.cx, this.cy, 46);
      g.addColorStop(0, `rgba(255,230,140,${a})`);
      g.addColorStop(1, 'rgba(255,230,140,0)');
      ctx.fillStyle = g;
      ctx.fillRect(this.cx - 50, this.cy - 50, 100, 100);
    }
    Clay.block(ctx, x, y + 2, this.w, this.h - 2, COL.stone);
    ctx.strokeStyle = '#e7bd45';
    ctx.lineWidth = 2.5;
    Clay.rrect(ctx, x + 5, y + 8, this.w - 10, this.h - 15, 7);
    ctx.stroke();
    ctx.fillStyle = '#1d1424';
    Clay.ellipsePath(ctx, this.cx - 0.5, y + 24, 6, 6);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(this.cx - 3.5, y + 26);
    ctx.lineTo(this.cx - 7, y + 48);
    ctx.lineTo(this.cx + 6, y + 48);
    ctx.lineTo(this.cx + 2.5, y + 26);
    ctx.fill();
  }
}

class Spring extends Entity {
  constructor(level, tx, ty) {
    super(level, tx * TILE + 2, ty * TILE + TILE - 22, 28, 22);
    this.squashT = 0;
    this.layer = 1;
  }
  update() {
    if (this.squashT > 0) this.squashT--;
  }
  draw(ctx) {
    const cx = this.cx, by = this.y + this.h;
    const sq = this.squashT > 0 ? Math.sin((this.squashT / 14) * Math.PI) * 0.45 : 0;
    Clay.shadow(ctx, cx, by, 34);
    Clay.blob(ctx, cx, by - 6, 7, 7 * (1 - sq), COL.stem, this.seed + 1);
    Clay.blob(ctx, cx, by - 14 + sq * 8, 15 * (1 + sq * 0.3), 8.5 * (1 - sq * 0.5), COL.pink, this.seed);
    Clay.blob(ctx, cx - 6, by - 17 + sq * 8, 2.6, 2, '#ffffff', this.seed + 2, { flat: true });
    Clay.blob(ctx, cx + 5, by - 15 + sq * 8, 2.2, 1.8, '#ffffff', this.seed + 3, { flat: true });
  }
}

class Checkpoint extends Entity {
  constructor(level, tx, ty, broken) {
    super(level, tx * TILE, (ty - 2) * TILE, TILE, 3 * TILE);
    this.broken = !!broken;
    this.layer = 1;
  }
  update() {
    if (this.broken || this.level.state !== 'play') return;
    if (U.overlap(this.level.player, this)) {
      this.broken = true;
      this.level.reachCheckpoint(this);
    }
  }
  draw(ctx) {
    const x = this.x, by = this.y + this.h;
    for (const px of [x + 2, x + TILE - 8]) {
      ctx.fillStyle = '#c99a6b';
      Clay.rrect(ctx, px, this.y + 10, 6, this.h - 10, 3);
      ctx.fill();
      Clay.blob(ctx, px + 3, this.y + 9, 5, 5, '#ffd166', this.seed + px);
    }
    if (!this.broken) {
      const yy = this.y + 30 + Math.sin(Clay.time * 3) * 2;
      ctx.strokeStyle = '#ff6f91';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + 6, yy);
      ctx.quadraticCurveTo(x + TILE / 2, yy + 5, x + TILE - 5, yy);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#ff6f91';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + 6, this.y + 30);
      ctx.lineTo(x + 8, this.y + 44);
      ctx.moveTo(x + TILE - 5, this.y + 30);
      ctx.lineTo(x + TILE - 7, this.y + 44);
      ctx.stroke();
    }
    Clay.shadow(ctx, x + TILE / 2, by, 40);
  }
}

class Goal extends Entity {
  constructor(level, tx, ty) {
    const bottom = (ty + 1) * TILE;
    super(level, tx * TILE, bottom - 6 * TILE, 3 * TILE, 6 * TILE);
    this.t = 0;
    this.tapeY = this.y + 30;
    this.tapeHit = false;
    this.layer = 0;
    this.alwaysActive = true;
  }
  update() {
    this.t++;
    this.tapeY = this.y + 26 + (0.5 - 0.5 * Math.cos(this.t * 0.035)) * (this.h - 56);
    const p = this.level.player;
    if (this.level.state !== 'play' || p.dead) return;
    const tape = { x: this.x + 10, y: this.tapeY - 5, w: this.w - 20, h: 10 };
    if (!this.tapeHit && U.overlap(p, tape)) {
      this.tapeHit = true;
      const frac = 1 - (this.tapeY - this.y) / this.h;
      this.level.goalReached(this, frac);
    } else if (p.cx > this.x + this.w * 0.5 && p.y + p.h > this.y) {
      this.level.goalReached(this, -1);
    }
  }
  drawPost(ctx, px) {
    const top = this.y, h = this.h;
    ctx.fillStyle = '#e2c9a6';
    Clay.rrect(ctx, px - 7, top + 6, 14, h - 6, 6);
    ctx.fill();
    ctx.fillStyle = '#fff1dc';
    Clay.rrect(ctx, px - 7, top + 6, 11, h - 8, 5);
    ctx.fill();
    ctx.save();
    Clay.rrect(ctx, px - 7, top + 6, 14, h - 6, 6);
    ctx.clip();
    ctx.strokeStyle = '#ff7fa8';
    ctx.lineWidth = 4;
    for (let yy = top - 10; yy < top + h; yy += 16) {
      ctx.beginPath();
      ctx.moveTo(px - 10, yy);
      ctx.lineTo(px + 10, yy + 12);
      ctx.stroke();
    }
    ctx.restore();
    Clay.blob(ctx, px, top + 4, 9, 9, '#ffd84a', this.seed + px);
  }
  draw(ctx) {
    this.drawPost(ctx, this.x + 6);
    if (!this.tapeHit) {
      const y = this.tapeY;
      ctx.fillStyle = U.shade('#ff9a3c', -0.3);
      Clay.rrect(ctx, this.x + 8, y - 5, this.w - 16, 11, 5);
      ctx.fill();
      ctx.fillStyle = '#ff9a3c';
      Clay.rrect(ctx, this.x + 8, y - 6, this.w - 18, 9, 4.5);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      Clay.rrect(ctx, this.x + 12, y - 4.5, this.w - 30, 3, 1.5);
      ctx.fill();
    }
  }
  drawFront(ctx) {
    this.drawPost(ctx, this.x + this.w - 6);
  }
}

class GoalOrb extends Item {
  constructor(level, x, y) {
    super(level, x - 16, y - 16, 32, 32);
    this.vy = -7;
    this.alwaysActive = true;
    this.layer = 4;
  }
  update() {
    this.age++;
    this.physics(0.25, 4);
  }
  touchPlayer() {
    if (this.age < 20 || this.dead) return;
    this.dead = true;
    this.level.orbReached(this);
  }
  draw(ctx) {
    const cx = this.cx, cy = this.cy + Math.sin(this.age * 0.08) * 2;
    const g = ctx.createRadialGradient(cx, cy, 6, cx, cy, 44);
    g.addColorStop(0, 'rgba(255,240,170,0.8)');
    g.addColorStop(1, 'rgba(255,240,170,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 46, cy - 46, 92, 92);
    Clay.blob(ctx, cx, cy, 16, 16, '#ffcf3f', this.seed);
    ctx.fillStyle = '#7a3e10';
    Clay.ellipsePath(ctx, cx - 5, cy - 3, 1.8, 2.8);
    ctx.fill();
    Clay.ellipsePath(ctx, cx + 5, cy - 3, 1.8, 2.8);
    ctx.fill();
    ctx.strokeStyle = '#7a3e10';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy + 2, 5.5, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }
}

class Egg extends Entity {
  constructor(level, x, y) {
    super(level, x - 13, y, 26, 30);
    this.rise = 32;
    this.layer = 1;
    this.alwaysActive = true;
  }
  update() {
    this.age++;
    if (this.rise > 0) {
      this.y -= 1;
      if (--this.rise === 0) this.layer = 2;
      return;
    }
    this.physics();
    if (this.age > 80) {
      this.dead = true;
      const c = new Companion(this.level, this.cx, this.y + this.h);
      this.level.spawn(c);
      this.level.companion = c;
      Sound.play('hatch');
      for (let i = 0; i < 6; i++) this.level.chunk(this.cx, this.cy, '#fffaf0', (Math.random() - 0.5) * 6, -3 - Math.random() * 3);
    }
  }
  draw(ctx) {
    const wob = this.age > 40 ? Math.sin(this.age * 0.9) * 0.12 * ((this.age - 40) / 40) : 0;
    ctx.save();
    ctx.translate(this.cx, this.y + this.h);
    ctx.rotate(wob);
    Clay.blob(ctx, 0, -15, 12.5, 15, '#fffaf0', this.seed);
    Clay.blob(ctx, -4, -19, 3.4, 3, '#5ec4a8', this.seed + 1, { flat: true });
    Clay.blob(ctx, 5, -11, 3, 2.6, '#5ec4a8', this.seed + 2, { flat: true });
    Clay.blob(ctx, 2, -25, 2.4, 2, '#5ec4a8', this.seed + 3, { flat: true });
    ctx.restore();
  }
}

class MovingPlatform extends Entity {
  constructor(level, tx, ty, vertical) {
    super(level, tx * TILE, ty * TILE, 3 * TILE, 14);
    this.x0 = this.x;
    this.y0 = this.y;
    this.vertical = vertical;
    this.t = 0;
    this.dx = 0;
    this.dy = 0;
    this.isPlatform = true;
    this.alwaysActive = true;
    this.layer = 0;
  }
  move() {
    this.t++;
    const ox = this.x, oy = this.y;
    if (this.vertical) this.y = this.y0 + Math.sin(this.t * 0.016) * 3 * TILE;
    else this.x = this.x0 + ((1 - Math.cos(this.t * 0.014)) / 2) * 4 * TILE;
    this.dx = this.x - ox;
    this.dy = this.y - oy;
  }
  draw(ctx) {
    const th = this.level.theme;
    Clay.cloud(ctx, this.x - 4, this.y - 6, this.w + 8, 28, th.cloud, th.cloudShade, 51, { outline: th.cloudRim });
    const cx = this.cx, cy = this.y + 9;
    ctx.strokeStyle = '#6a5a7a';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx - 8, cy, 3, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.moveTo(cx + 11, cy);
    ctx.arc(cx + 8, cy, 3, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,140,170,0.45)';
    Clay.ellipsePath(ctx, cx - 15, cy + 4, 4, 2.2);
    ctx.fill();
    Clay.ellipsePath(ctx, cx + 15, cy + 4, 4, 2.2);
    ctx.fill();
  }
}

class BigSwitch extends Entity {
  constructor(level, tx, ty) {
    super(level, tx * TILE - 16, ty * TILE + TILE - 30, 64, 30);
    this.isPlatform = true;
    this.dx = 0;
    this.dy = 0;
    this.pressed = false;
    this.layer = 1;
  }
  move() {
    this.dx = this.dy = 0;
  }
  press() {
    if (this.pressed) return;
    this.pressed = true;
    const bottom = this.y + this.h;
    this.h = 12;
    this.y = bottom - this.h;
    this.level.pressSwitch(this);
  }
  draw(ctx) {
    const by = this.y + this.h;
    Clay.block(ctx, this.x - 4, by - 12, this.w + 8, 12, '#b9b0cf', { noPrint: true });
    if (!this.pressed) {
      Clay.blob(ctx, this.cx, by - 17, 27, 15, '#4a8cff', this.seed);
      Clay.text(ctx, '!', this.cx, by - 19, 20, '#ffffff', { depth: 2 });
    } else {
      Clay.blob(ctx, this.cx, by - 12, 28, 5, '#4a8cff', this.seed);
    }
  }
}
