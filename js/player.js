'use strict';
// Pepper (the hero) and Dumpling (the rideable clay dino).

const HERO = {
  skin: '#f6c4a0', nose: '#efa47f', cap: '#e2483d', shirt: '#e2483d', overalls: '#3d6fd6',
  shoe: '#7a4a2b', hair: '#6b3d24', glove: '#fffaf0', cape: '#f4b63c', capeIn: '#d4801f',
};
const STAR_CAPE = { cape: '#b98cff', capeIn: '#6c4bd1' };

class Player extends Entity {
  constructor(level, x, bottom, opts) {
    super(level, x, bottom - 26, 20, 26);
    this.power = opts.power || 0;
    this.facing = 1;
    this.layer = 6;
    this.alwaysActive = true;
    this.p = 0;
    this.pFull = false;
    this.jumpBuf = 0;
    this.spinBuf = 0;
    this.coyote = 0;
    this.jumping = false;
    this.spinning = false;
    this.flight = 0; // 0 none, 1 takeoff, 2 soaring
    this.takeoffT = 0;
    this.pitch = 0;
    this.gliding = false;
    this.capeSpin = 0;
    this.spinHits = new Set();
    this.carrying = null;
    this.riding = null;
    this.invuln = 0;
    this.combo = 0;
    this.squash = 0;
    this.crouch = false;
    this.skidding = false;
    this.dead = false;
    this.deathT = 0;
    this.lastVy = 0;
    this.prevBottom = bottom;
    this.platform = null;
    this.walkPhase = 0;
    this.safe = { x, y: bottom };
    this.auto = 0; // auto-walk speed during the goal sequence
    this.starCape = !!opts.starCape;
    this.setSize();
  }

  // ---------- size ----------
  targetSize() {
    if (this.riding) return [24, this.power > 0 ? 56 : 46];
    if (this.power > 0) return [20, this.crouch ? 28 : 44];
    return [20, this.crouch ? 20 : 26];
  }
  setSize() {
    const [w, h] = this.targetSize();
    if (w === this.w && h === this.h) return;
    const bottom = this.y + this.h, cx = this.x + this.w / 2;
    this.w = w;
    this.h = h;
    this.x = cx - w / 2;
    this.y = bottom - h;
  }
  roomToStand() {
    const h = this.power > 0 ? 44 : 26;
    const top = this.y + this.h - h;
    return !rectTouchesTile(this.level.q, this.x + 1, top, this.w - 2, h - this.h, 0, (c, tx, ty) => this.level.q.solidAt(tx, ty));
  }

  // ---------- update ----------
  update() {
    const L = this.level;
    this.age++;
    if (this.invuln > 0) this.invuln--;
    this.squash *= 0.8;
    if (this.capeSpin > 0) this.capeSpin--;

    const auto = this.auto !== 0;
    const left = !auto && Input.down('left'), right = !auto && Input.down('right');
    const up = Input.down('up'), down = Input.down('down');
    const dir = auto ? 1 : (right ? 1 : 0) - (left ? 1 : 0);
    const runHeld = !auto && Input.down('run');
    const jumpHeld = !auto && (Input.down('jump') || Input.down('spin'));
    const riding = this.riding;
    const caped = this.power === 2 && !riding;

    // crouching
    let crouch = this.crouch;
    if (this.onGround) crouch = down && !riding && !auto;
    if (crouch === false && this.crouch && !this.roomToStand()) crouch = true;
    this.crouch = crouch;
    this.setSize();

    if (!auto && Input.pressed('jump')) this.jumpBuf = CFG.jumpBuffer + 1;
    else if (this.jumpBuf > 0) this.jumpBuf--;
    if (!auto && Input.pressed('spin')) this.spinBuf = CFG.jumpBuffer + 1;
    else if (this.spinBuf > 0) this.spinBuf--;
    if (this.onGround) this.coyote = CFG.coyoteFrames;
    else if (this.coyote > 0) this.coyote--;

    const speedMul = riding ? CFG.rideSpeedMult : 1;
    const maxSpeed = auto ? this.auto : (runHeld ? (this.pFull ? CFG.sprintSpeed : CFG.runSpeed) : CFG.walkSpeed) * speedMul;

    // ---- horizontal ----
    if (this.flight === 2) this.updateSoar(dir, runHeld);
    else {
      const md = this.crouch && this.onGround ? 0 : dir;
      if (this.onGround) {
        if (md !== 0) {
          const s = this.vx * md;
          if (s < 0) {
            this.vx += md * CFG.skidDecel;
            this.skidding = Math.abs(this.vx) > 1.2;
            if (this.skidding && this.age % 4 === 0) L.dust(this.cx - md * 6, this.y + this.h, 1);
          } else {
            this.skidding = false;
            if (s < maxSpeed) {
              this.vx += md * CFG.groundAccel;
              if (this.vx * md > maxSpeed) this.vx = md * maxSpeed;
            } else this.vx = U.approach(this.vx, md * maxSpeed, CFG.groundFriction * 0.5);
          }
          this.facing = md;
        } else {
          this.skidding = false;
          this.vx = U.approach(this.vx, 0, CFG.groundFriction * (this.crouch ? 0.45 : 1));
        }
      } else {
        this.skidding = false;
        if (md !== 0) {
          const s = this.vx * md;
          let nv = this.vx + md * CFG.airAccel;
          if (nv * md > maxSpeed) nv = md * Math.max(maxSpeed, s);
          this.vx = nv;
          this.facing = md;
        }
      }
    }

    // ---- P-meter ----
    if (this.onGround && this.flight === 0) {
      if (runHeld && dir !== 0 && !this.skidding && Math.abs(this.vx) >= CFG.runSpeed * speedMul - 0.15) this.p = Math.min(1, this.p + 1 / CFG.pMeterFrames);
      else this.p = Math.max(0, this.p - 1.5 / CFG.pMeterFrames);
    }
    if (this.flight) this.p = 1;
    this.pFull = this.p >= 1;

    // ---- jumping ----
    if ((this.jumpBuf > 0 || this.spinBuf > 0) && (this.onGround || this.coyote > 0) && this.flight === 0) {
      const spin = this.spinBuf > 0 && (this.jumpBuf === 0 || this.spinBuf >= this.jumpBuf);
      this.jumpBuf = this.spinBuf = 0;
      this.coyote = 0;
      if (spin && this.riding) this.dismount();
      else this.doJump(spin);
    } else if (CFG.infiniteFlight && caped && !this.onGround && this.flight === 0 && !this.carrying && Input.pressed('jump')) {
      this.startTakeoff();
    }

    // ---- vertical ----
    if (this.flight === 1) {
      if (jumpHeld && this.takeoffT > 0) {
        this.vy = U.approach(this.vy, -CFG.takeoffLift, 0.9);
        this.takeoffT--;
      } else {
        this.flight = runHeld || CFG.infiniteFlight ? 2 : 0;
        this.pitch = 0;
        this.jumping = false;
      }
    }
    this.gliding = false;
    if (this.flight === 0) {
      const g = this.jumping && this.vy < 0 && jumpHeld ? CFG.jumpGravity : CFG.gravity;
      if (!jumpHeld) this.jumping = false;
      this.vy = Math.min(this.vy + g, CFG.maxFall);
      if (caped && !this.onGround && jumpHeld && !this.spinning && !this.jumping && this.vy > CFG.glideFallSpeed) {
        this.vy = U.approach(this.vy, CFG.glideFallSpeed, 1.6);
        this.gliding = true;
      }
      if (this.capeSpin > 0 && !this.onGround) this.vy = Math.min(this.vy, 2.2);
    }

    // ---- action button: cape spin / tongue ----
    if (!auto && Input.pressed('run')) {
      if (riding) riding.tongueAction();
      else if (caped && !this.carrying && !L.findGrabbable(this)) this.startCapeSpin();
    }
    if (this.carrying && !runHeld) this.throwCarried(up, down);

    // ---- move ----
    this.prevBottom = this.y + this.h;
    this.lastVy = this.vy;
    const wasGround = this.onGround;
    const res = moveBody(this, L.q, { corner: 7 });
    L.landOnPlatforms(this, this.prevBottom);
    if (res.ceil) {
      let best = res.ceil[0], bd = 1e9;
      for (const t of res.ceil) {
        const d = Math.abs((t[0] + 0.5) * TILE - this.cx);
        if (d < bd) {
          bd = d;
          best = t;
        }
      }
      L.hitBlock(best[0], best[1], 'head');
      this.jumping = false;
      if (this.flight === 1) this.flight = 0;
    }
    if ((res.left || res.right) && this.flight === 2) this.vx = 0;
    if (this.onGround && !wasGround) this.land();
    if (this.onGround && !this.platform) this.safe = { x: this.x, y: this.y + this.h };

    if (this.y < -TILE * 3) {
      this.y = -TILE * 3;
      if (this.vy < 0) this.vy = 0;
    }
    if (this.y > L.H + 40) this.die(true);
    if (!this.dead && rectTouchesTile(L.q, this.x, this.y, this.w, this.h, 1, (c) => c === '^')) this.hurt();
    this.positionCarried();

    // animation clock
    if (this.onGround) this.walkPhase += Math.abs(this.vx) * 0.11;
  }

  updateSoar(dir, runHeld) {
    if (!runHeld && !CFG.infiniteFlight) {
      this.flight = 0;
      return;
    }
    const f = this.facing;
    if (dir === f) this.pitch = Math.min(1, this.pitch + 0.05);
    else if (dir === -f) this.pitch = Math.max(-1, this.pitch - 0.06);
    else this.pitch = U.approach(this.pitch, 0, 0.04);
    let speed = Math.abs(this.vx);
    if (this.pitch > 0.05) {
      this.vy = U.approach(this.vy, CFG.diveFallMax * this.pitch, 0.3);
      speed = Math.min(CFG.flightMaxSpeed, speed + CFG.diveAccel * this.pitch);
    } else if (this.pitch < -0.05) {
      if (speed > CFG.walkSpeed * 0.7) {
        this.vy = U.approach(this.vy, -speed * CFG.pullUpLift * -this.pitch, 0.45);
        speed = Math.max(0, speed - (0.05 + CFG.soarDrag * 3) * -this.pitch);
      } else this.vy = U.approach(this.vy, CFG.glideFallSpeed * 1.6, 0.25);
    } else {
      this.vy = U.approach(this.vy, CFG.glideFallSpeed, 0.15);
      speed = Math.max(CFG.walkSpeed, speed - CFG.soarDrag);
    }
    if (CFG.infiniteFlight && Input.pressed('jump')) this.vy = Math.min(this.vy, -5.5);
    this.vx = f * speed;
  }

  doJump(spin) {
    const frac = Math.min(1, Math.abs(this.vx) / CFG.sprintSpeed);
    let v = spin ? CFG.spinJumpVelocity : CFG.jumpVelocity + CFG.runJumpBonus * frac;
    if (this.riding) v += CFG.rideJumpBonus;
    this.vy = -v;
    this.onGround = false;
    this.jumping = true;
    this.spinning = spin && !this.riding;
    this.squash = -0.22;
    this.platform = null;
    if (this.power === 2 && !this.riding && !spin && !this.carrying && (this.pFull || CFG.infiniteFlight)) this.startTakeoff();
    else Sound.play(spin ? 'spin' : 'jump');
    this.level.dust(this.cx, this.y + this.h, 2);
  }
  startTakeoff() {
    this.flight = 1;
    this.takeoffT = CFG.takeoffFrames;
    this.vy = Math.min(this.vy, -CFG.takeoffLift * 0.8);
    this.jumping = true;
    this.spinning = false;
    Sound.play('takeoff');
  }
  startCapeSpin() {
    this.capeSpin = CFG.capeSpinFrames;
    this.spinHits.clear();
    Sound.play('cape');
  }
  land() {
    this.squash = Math.min(0.3, 0.06 + this.lastVy * 0.028);
    if (this.flight === 2 && this.pitch > 0.5 && this.lastVy > 4) this.level.groundPound(this);
    this.flight = 0;
    this.pitch = 0;
    this.spinning = false;
    this.gliding = false;
    this.combo = 0;
    if (this.lastVy > 3) this.level.dust(this.cx, this.y + this.h, 3);
  }
  bounce(mult = 1) {
    const held = Input.down('jump') || Input.down('spin');
    this.vy = -CFG.stompBounce * (held ? 1.3 : 1) * mult;
    this.jumping = held;
    this.onGround = false;
    this.flight = 0;
  }
  springBounce() {
    this.vy = -CFG.springVelocity;
    this.jumping = true;
    this.onGround = false;
    this.spinning = false;
    this.flight = 0;
    this.squash = -0.3;
    Sound.play('spring');
  }

  // ---------- damage ----------
  hurt() {
    if (this.invuln > 0 || CFG.godMode || this.dead || this.level.state !== 'play') return;
    if (this.riding) {
      this.ejectFromCompanion();
      return;
    }
    if (this.power > 0) {
      this.power = 0;
      this.invuln = CFG.invincibleFrames;
      this.flight = 0;
      this.level.transform('shrink');
      Sound.play('shrink');
      return;
    }
    this.die(false);
  }
  die(pit) {
    if (this.dead) return;
    if (CFG.godMode && pit) {
      this.x = this.safe.x;
      this.y = this.safe.y - this.h - 2;
      this.vx = this.vy = 0;
      this.flight = 0;
      this.level.puff(this.cx, this.cy, 1);
      return;
    }
    this.dropCarried();
    if (this.riding) {
      this.riding.lost();
      this.riding = null;
      Sound.bongos = false;
    }
    this.dead = true;
    this.deathT = 0;
    this.vx = this.vy = 0;
    this.level.playerDied(pit);
  }
  deathUpdate() {
    this.deathT++;
    if (this.deathT < 30) return;
    if (this.deathT === 30) this.vy = -10;
    this.vy += 0.45;
    this.y += this.vy;
  }

  // ---------- items ----------
  powerUp(kind) {
    const L = this.level;
    L.addScore(1000, this.cx, this.y);
    if (kind === 'mushroom') {
      if (this.power === 0) {
        this.power = 1;
        L.transform('grow');
      } else if (!L.reserve) L.reserve = 'mushroom';
      Sound.play('powerup');
    } else if (kind === 'feather') {
      if (this.power === 2) {
        if (!L.reserve || L.reserve === 'mushroom') L.reserve = 'feather';
      } else {
        if (this.power === 1 && !L.reserve) L.reserve = 'mushroom';
        this.power = 2;
        L.transform('cape');
      }
      Sound.play('feather');
    }
  }
  grab(item) {
    if (this.carrying || this.riding || this.dead) return;
    this.carrying = item;
    if (item instanceof Snail) item.setState('carried');
    else item.carriedBy = this;
    Sound.play('select');
  }
  positionCarried() {
    const it = this.carrying;
    if (!it) return;
    const reach = this.w / 2 + it.w / 2 - 5;
    it.x = this.cx + this.facing * reach - it.w / 2;
    it.y = this.power > 0 && !this.crouch ? this.y + 14 : this.y + this.h - it.h - 1;
    it.vx = this.vx;
    it.vy = 0;
    if (rectTouchesTile(this.level.q, it.x, it.y, it.w, it.h, 0, (c, tx, ty) => this.level.q.solidAt(tx, ty))) it.x = this.cx - it.w / 2;
  }
  throwCarried(up, down) {
    const it = this.carrying;
    this.carrying = null;
    if (it instanceof Snail) {
      if (up) {
        it.setState('shell');
        it.vy = -11;
        it.vx = this.vx * 0.4;
        Sound.play('kick');
      } else if (down) {
        it.setState('shell');
        it.vx = it.vy = 0;
      } else it.kick(this.facing);
    } else {
      it.carriedBy = null;
      if (up) {
        it.vy = -10;
        it.vx = this.vx * 0.4;
      } else if (down) it.vx = it.vy = 0;
      else {
        it.vx = this.facing * 4 + this.vx * 0.4;
        it.vy = -2.5;
      }
      Sound.play('kick');
    }
  }
  dropCarried() {
    const it = this.carrying;
    if (!it) return;
    this.carrying = null;
    if (!(it instanceof Snail)) it.carriedBy = null;
    else if (it.state === 'carried') it.setState('shell');
  }

  // ---------- companion ----------
  mount(c) {
    this.riding = c;
    c.state = 'ridden';
    c.rider = this;
    this.flight = 0;
    this.spinning = false;
    this.gliding = false;
    this.crouch = false;
    const bottom = c.y + c.h;
    this.setSize();
    this.y = bottom - this.h;
    this.vy = 0;
    this.squash = 0.2;
    Sound.play('mount');
    Sound.bongos = true;
  }
  dismount() {
    const c = this.riding;
    this.riding = null;
    c.release(this.facing);
    this.setSize();
    Sound.bongos = false;
    this.doJump(true);
    this.vy = -CFG.spinJumpVelocity * 1.05;
  }
  ejectFromCompanion() {
    const c = this.riding;
    this.riding = null;
    c.flee(this.facing);
    this.setSize();
    this.vy = -7;
    this.onGround = false;
    this.invuln = 60;
    Sound.play('ouch');
    Sound.bongos = false;
  }

  // ---------- drawing ----------
  draw(ctx) {
    if (this.dead) return this.drawDead(ctx);
    if (this.invuln > 0 && Math.floor(this.invuln / 3) % 2 === 0) ctx.globalAlpha = 0.35;
    const cx = this.cx, by = this.y + this.h;
    const sq = this.squash * CFG.squashStretch;
    if (this.onGround && !this.riding) Clay.shadow(ctx, cx, by, 28);
    ctx.save();
    ctx.translate(cx, by);
    ctx.scale(1 + sq * 0.8, 1 - sq);
    const pose = this.pose();
    let power = this.power;
    const tf = this.level.transformAnim;
    if (tf && tf.t > 0) power = Math.floor(tf.t / 4) % 2 ? tf.from : tf.to;
    if (this.riding) ctx.translate(-this.facing * 2, -24);
    drawHero(ctx, this.facing, power, pose, this);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  pose() {
    if (this.level.state === 'clear' && this.onGround && this.auto === 0) return 'victory';
    if (this.riding) return 'ride';
    if (this.capeSpin > 0) return 'capespin';
    if (this.spinning) return 'spin';
    if (this.flight === 2) return 'soar';
    if (this.flight === 1) return 'takeoff';
    if (this.crouch) return 'crouch';
    if (this.gliding) return 'glide';
    if (!this.onGround) return this.vy < 0 ? 'jump' : 'fall';
    if (this.skidding) return 'skid';
    if (Math.abs(this.vx) > 0.3) return this.pFull ? 'sprint' : 'walk';
    return 'idle';
  }
  drawDead(ctx) {
    const cx = this.cx, by = this.y + this.h;
    ctx.save();
    ctx.translate(cx, by);
    drawHero(ctx, 1, 0, 'dead', this);
    ctx.restore();
  }
}

// Draws the hero with feet at (0,0), facing f (+1 right, -1 left).
function drawHero(ctx, f, power, pose, p) {
  const big = power > 0;
  const t = p ? p.age : 0;
  const walk = p ? p.walkPhase : 0;
  const caped = power === 2;
  const capeCol = p && p.starCape ? STAR_CAPE : HERO;
  const B = Clay.blob.bind(Clay);
  const X = (dx) => dx * f;
  const s = 1000 + (big ? 50 : 0);

  if (pose === 'dead') {
    B(ctx, -6, -4, 5, 3.5, HERO.shoe, s + 1);
    B(ctx, 6, -4, 5, 3.5, HERO.shoe, s + 2);
    B(ctx, 0, -10, 8, 6.5, HERO.overalls, s + 3);
    B(ctx, -10, -24, 3.6, 3.6, HERO.glove, s + 4);
    B(ctx, 10, -24, 3.6, 3.6, HERO.glove, s + 5);
    B(ctx, 0, -19, 9.5, 9, HERO.skin, s + 6);
    B(ctx, 0, -25.5, 10, 5, HERO.cap, s + 7);
    B(ctx, 0, -17.5, 3.4, 3, HERO.nose, s + 8);
    ctx.strokeStyle = '#2a1a22';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (const sx of [-4, 4]) {
      ctx.moveTo(sx - 2, -23);
      ctx.lineTo(sx + 2, -19.5);
      ctx.moveTo(sx + 2, -23);
      ctx.lineTo(sx - 2, -19.5);
    }
    ctx.stroke();
    ctx.fillStyle = '#5a2030';
    Clay.ellipsePath(ctx, 0, -13.5, 2.4, 2);
    ctx.fill();
    return;
  }

  // body rotation for flight and spins
  ctx.save();
  let lean = 0;
  if (pose === 'skid') lean = -0.18;
  if (pose === 'sprint') lean = 0.12;
  if (pose === 'soar' && p) lean = 1.2 + p.pitch * 0.45;
  if (pose === 'takeoff') lean = 0.25;
  const h = big ? 44 : 26;
  if (lean) {
    ctx.translate(0, -h / 2);
    ctx.rotate(lean * f);
    ctx.translate(0, h / 2);
  }
  if (pose === 'spin' || pose === 'capespin') {
    const k = Math.floor(t / 3) % 4;
    if (k === 1 || k === 3) f = -f;
  }

  // ---- part placement ----
  const sc = big ? 1.12 : 1;
  const headY = big ? -36 : -18.5;
  const bodyY = big ? -11 : -8.5;
  let bob = 0;
  let fb = [-5, -3.5], ff = [5, -3.5]; // back foot, front foot
  let ab = [-8, big ? -24 : -11], af = [8, big ? -24 : -11]; // hands
  if (big) {
    fb = [-6, -4];
    ff = [6, -4];
  }
  if (pose === 'walk' || pose === 'sprint') {
    const sw = Math.sin(walk), cw = Math.cos(walk);
    ff = [ff[0] + sw * 4.5, ff[1] - Math.max(0, cw) * 2.5];
    fb = [fb[0] - sw * 4.5, fb[1] - Math.max(0, -cw) * 2.5];
    bob = -Math.abs(sw) * 1.4;
    if (pose === 'sprint') {
      af = [13, big ? -26 : -13];
      ab = [-13, big ? -24 : -11];
    } else {
      af = [8 - sw * 2.5, af[1]];
      ab = [-8 + sw * 2.5, ab[1]];
    }
  } else if (pose === 'jump' || pose === 'takeoff') {
    ff = [6, -9];
    fb = [-4, -2];
    af = [7, big ? -48 : -27];
    ab = [-9, big ? -26 : -12];
  } else if (pose === 'fall' || pose === 'glide') {
    ff = [7, -4];
    fb = [-7, -5];
    af = [12, big ? -30 : -16];
    ab = [-12, big ? -30 : -16];
  } else if (pose === 'skid') {
    ff = [9, -3];
    fb = [-2, -3];
    af = [2, big ? -30 : -15];
  } else if (pose === 'crouch') {
    bob = big ? 12 : 4;
  } else if (pose === 'ride') {
    ff = [7, -2];
    fb = [-3, -1];
    af = [9, big ? -20 : -10];
  } else if (pose === 'victory') {
    af = [5, big ? -52 : -30];
  } else if (pose === 'soar') {
    af = [6, big ? -50 : -29];
    ab = [-3, big ? -48 : -27];
    ff = [3, -2];
    fb = [-3, -1];
  }
  if (p && p.carrying) {
    af = [11, big ? -26 : -13];
    ab = [7, big ? -25 : -12];
  }
  const crouchK = pose === 'crouch' ? (big ? 0.62 : 0.78) : 1;

  // ---- cape (behind everything) ----
  if (caped) drawCape(ctx, f, big, pose, p, capeCol, headY * crouchK + 8 + bob);

  // back arm + foot
  B(ctx, X(ab[0]), ab[1] * crouchK + bob, 3.6 * sc, 3.4 * sc, U.shade(HERO.glove, -0.08), s + 10);
  B(ctx, X(fb[0]), fb[1], 5.5 * sc, 3.6 * sc, U.shade(HERO.shoe, -0.1), s + 11);
  // body
  if (big) {
    B(ctx, 0, (bodyY + bob) * crouchK, 8.5, 9 * crouchK, HERO.overalls, s + 12);
    B(ctx, 0, (-23 + bob) * crouchK, 9.5, 8.5 * crouchK, HERO.shirt, s + 13);
    ctx.fillStyle = U.shade(HERO.overalls, 0.05);
    Clay.rrect(ctx, X(2) - 2, (-27 + bob) * crouchK, 4, 9 * crouchK, 2);
    ctx.fill();
    Clay.rrect(ctx, X(-4) - 2, (-27 + bob) * crouchK, 4, 9 * crouchK, 2);
    ctx.fill();
    B(ctx, X(2), (-19 + bob) * crouchK, 1.6, 1.6, '#ffd84a', s + 14, { flat: true });
    B(ctx, X(-4), (-19 + bob) * crouchK, 1.6, 1.6, '#ffd84a', s + 15, { flat: true });
  } else {
    B(ctx, 0, (bodyY + bob) * crouchK, 7.5, 6.5 * crouchK, HERO.overalls, s + 12);
    B(ctx, 0, (-12.5 + bob) * crouchK, 6.5, 3.5, HERO.shirt, s + 13);
  }
  // front foot
  B(ctx, X(ff[0]), ff[1], 5.8 * sc, 3.7 * sc, HERO.shoe, s + 16);
  // head
  const hy = headY * crouchK + bob;
  const hr = big ? 10.5 : 9;
  B(ctx, X(-hr * 0.8), hy + 1.5, 3.5, 3.2, HERO.hair, s + 17);
  B(ctx, X(1), hy, hr, hr * 0.95, HERO.skin, s + 18);
  ctx.fillStyle = 'rgba(255,120,120,0.35)';
  Clay.ellipsePath(ctx, X(hr * 0.35), hy + hr * 0.38, hr * 0.22, hr * 0.13);
  ctx.fill();
  // eye
  const blink = (t % 180) < 6;
  if (blink) {
    ctx.strokeStyle = '#2a1a22';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(X(hr * 0.3), hy - hr * 0.2);
    ctx.lineTo(X(hr * 0.62), hy - hr * 0.2);
    ctx.stroke();
  } else {
    B(ctx, X(hr * 0.46), hy - hr * 0.22, hr * 0.22, hr * 0.32, '#fffaf0', s + 19, { sheen: 0.3 });
    B(ctx, X(hr * 0.55), hy - hr * 0.17, hr * 0.12, hr * 0.17, '#2a1a22', s + 20, { flat: true });
  }
  // nose
  B(ctx, X(hr * 0.92), hy + hr * 0.14, hr * 0.38, hr * 0.32, HERO.nose, s + 21);
  // cap
  B(ctx, X(hr * 0.75), hy - hr * 0.42, hr * 0.62, hr * 0.22, U.shade(HERO.cap, -0.12), s + 22);
  B(ctx, X(-0.5), hy - hr * 0.58, hr * 1.02, hr * 0.56, HERO.cap, s + 23);
  B(ctx, X(hr * 0.2), hy - hr * 0.7, hr * 0.26, hr * 0.24, '#fffaf0', s + 24, { flat: true });
  ctx.fillStyle = HERO.cap;
  ctx.font = `700 ${Math.round(hr * 0.36)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('P', X(hr * 0.2), hy - hr * 0.68);
  // front arm
  B(ctx, X(af[0]), af[1] * crouchK + bob, 3.8 * sc, 3.6 * sc, HERO.glove, s + 25);
  ctx.restore();
}

function drawCape(ctx, f, big, pose, p, col, shoulderY) {
  const t = p ? p.age : 0;
  const speed = p ? Math.min(6, Math.abs(p.vx)) : 0;
  const len = big ? 24 : 15;
  const sx = -f * 3;
  const sy = shoulderY;
  const flutter = Math.sin(t * 0.45) * 2;
  let tips;
  if (pose === 'glide') tips = [[-f * len * 0.9, sy - len * 0.55 + flutter], [-f * len * 0.25, sy - len * 0.85 - flutter]];
  else if (pose === 'soar' || pose === 'takeoff') tips = [[-f * len * 1.05, sy + 6 + flutter], [-f * len * 0.95, sy + 13 - flutter]];
  else if (pose === 'capespin') {
    const a = t * 0.9;
    tips = [[Math.cos(a) * len, sy + 6 + Math.sin(a) * 4], [Math.cos(a + 0.6) * len, sy + 12 + Math.sin(a) * 4]];
  } else if (pose === 'jump') tips = [[-f * (4 + speed * 2), sy + len * 0.9], [-f * (10 + speed * 2), sy + len * 0.8]];
  else {
    const back = 3 + speed * 2.6;
    tips = [[-f * back + flutter * (speed / 6), sy + len - speed * 1.4], [-f * (back + 7), sy + len - 2 - speed * 1.8 - flutter * 0.5]];
  }
  const path = (k) => {
    ctx.beginPath();
    ctx.moveTo(sx - f * 2 * k, sy - 3);
    ctx.quadraticCurveTo(sx - f * 4, (sy + tips[0][1]) / 2, tips[0][0], tips[0][1]);
    ctx.quadraticCurveTo((tips[0][0] + tips[1][0]) / 2, Math.max(tips[0][1], tips[1][1]) + 3, tips[1][0], tips[1][1]);
    ctx.quadraticCurveTo(sx - f * 9, (sy + tips[1][1]) / 2, sx + f * 3, sy - 2);
    ctx.closePath();
  };
  path(1);
  ctx.fillStyle = col.capeIn;
  ctx.fill();
  ctx.save();
  ctx.translate(f * 1, -1.5);
  path(0.6);
  ctx.fillStyle = col.cape;
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  Clay.ellipsePath(ctx, sx - f * 3, sy + 3, 2, 5, 0.3 * f);
  ctx.fill();
  if (col === STAR_CAPE) {
    ctx.fillStyle = '#fff6c2';
    for (let k = 0; k < 3; k++) {
      const u = (k + 1) / 4;
      Clay.ellipsePath(ctx, U.lerp(sx, tips[k % 2][0], u), U.lerp(sy, tips[k % 2][1], u), 1.4, 1.4);
      ctx.fill();
    }
  }
}

// ===========================================================================
const DINO = { body: '#5ec4a8', belly: '#ffe0b8', spot: '#8d6fd8', saddle: '#ff6b4a', shoe: '#ff9d3d', tongue: '#ff6f91' };

class Companion extends Entity {
  constructor(level, cx, bottom) {
    super(level, cx - 14, bottom - 32, 28, 32);
    this.state = 'idle';
    this.facing = 1;
    this.layer = 5;
    this.alwaysActive = true;
    this.tongue = 0;
    this.tongueDir = 0;
    this.prey = null;
    this.mouth = null;
    this.cool = 0;
    this.legT = 0;
    this.rider = null;
  }
  update() {
    this.age++;
    if (this.cool > 0) this.cool--;
    switch (this.state) {
      case 'ridden': {
        const p = this.rider;
        this.facing = p.facing;
        this.x = p.cx - this.w / 2;
        this.y = p.y + p.h - this.h;
        this.vx = p.vx;
        this.onGround = p.onGround;
        this.legT += Math.abs(p.vx) * 0.13;
        this.updateTongue();
        break;
      }
      case 'idle':
        this.vx = U.approach(this.vx, 0, 0.3);
        this.physics();
        if (this.y > this.level.H + 60) this.lost();
        break;
      case 'flee': {
        this.vx = this.facing * CFG.fleeSpeed;
        const res = this.physics();
        if (res.left || res.right) this.facing *= -1;
        this.legT += 0.45;
        if (this.onGround && Math.random() < 0.012) this.vy = -6;
        if (this.y > this.level.H + 60) this.lost();
        break;
      }
    }
  }
  get mountable() {
    return (this.state === 'idle' || this.state === 'flee') && this.cool === 0;
  }
  lost() {
    this.dead = true;
    if (this.level.companion === this) this.level.companion = null;
  }
  release(dir) {
    this.state = 'idle';
    this.rider = null;
    this.facing = dir;
    this.cool = 24;
    this.cancelTongue();
  }
  flee(dir) {
    this.state = 'flee';
    this.rider = null;
    this.facing = dir;
    this.cool = 30;
    this.cancelTongue();
  }
  cancelTongue() {
    if (this.prey) {
      this.prey.caught = false;
      this.prey = null;
    }
    this.tongue = 0;
    this.tongueDir = 0;
  }
  tongueAction() {
    if (this.tongueDir !== 0) return;
    if (this.mouth) {
      const m = this.mouthPos();
      const s = new Snail(this.level, 0, 0);
      s.x = m.x + this.facing * 6 - 12;
      s.y = m.y - 8;
      s.setState('shell');
      if (rectTouchesTile(this.level.q, s.x, s.y, s.w, s.h, 0, (c, tx, ty) => this.level.q.solidAt(tx, ty))) s.x = this.cx - s.w / 2;
      s.kick(this.facing);
      s.active = true;
      this.level.spawn(s);
      this.mouth = null;
      return;
    }
    this.tongueDir = 1;
    this.tongue = 0;
    Sound.play('tongue');
  }
  mouthPos() {
    return { x: this.cx + this.facing * 17, y: this.y + 8 };
  }
  tip() {
    const m = this.mouthPos();
    return { x: m.x + this.facing * this.tongue - 7, y: m.y - 7, w: 14, h: 14 };
  }
  updateTongue() {
    if (this.tongueDir === 0) return;
    const sp = CFG.tongueSpeed;
    if (this.tongueDir === 1) {
      this.tongue += sp;
      if (this.tongue >= CFG.tongueLength) {
        this.tongue = CFG.tongueLength;
        this.tongueDir = -1;
      } else this.checkTongue();
    } else {
      this.tongue -= sp * 1.25;
      if (this.prey) {
        const t = this.tip();
        this.prey.x = t.x + t.w / 2 - this.prey.w / 2;
        this.prey.y = t.y + t.h / 2 - this.prey.h / 2;
      }
      if (this.tongue <= 0) {
        this.tongue = 0;
        this.tongueDir = 0;
        if (this.prey) this.swallow();
      }
    }
  }
  checkTongue() {
    const t = this.tip();
    for (const e of this.level.entities) {
      if (e.dead || e === this || !e.active || !U.overlap(t, e)) continue;
      if (e.enemy && e.edible && !e.ko && !e.inert && !e.boss && !(e instanceof Snail && e.state === 'carried')) {
        this.prey = e;
        e.caught = true;
        this.tongueDir = -1;
        return;
      }
      if (e instanceof Coin || e instanceof PowerItem || e instanceof Feather || e instanceof SunCoin) {
        e.touchPlayer(this.rider);
        return;
      }
    }
  }
  swallow() {
    const e = this.prey;
    this.prey = null;
    e.dead = true;
    if (e instanceof Snail) {
      this.mouth = 'shell';
      Sound.play('gulp');
      return;
    }
    this.level.addScore(200, this.cx, this.y);
    Sound.play('gulp');
    this.level.sparkle(this.cx + this.facing * 12, this.y + 8, 3);
  }
  draw(ctx) {
    const f = this.facing, cx = this.cx, by = this.y + this.h;
    const ridden = this.state === 'ridden';
    const moving = ridden ? Math.abs(this.vx) > 0.3 : this.state === 'flee';
    const lt = this.legT;
    const s = 3000;
    if (this.onGround) Clay.shadow(ctx, cx, by, 34);
    const bob = moving ? -Math.abs(Math.sin(lt)) * 1.5 : Math.sin(this.age * 0.06) * 0.6;
    // tail
    Clay.blob(ctx, cx - f * 15, by - 13 + bob, 7, 4, DINO.body, s + 1);
    // back leg
    const sw = moving ? Math.sin(lt) * 4 : 0;
    Clay.blob(ctx, cx - f * 5 - sw, by - 4, 5.5, 4, U.shade(DINO.shoe, -0.12), s + 2);
    // body
    Clay.blob(ctx, cx - f * 2, by - 15 + bob, 14, 11, DINO.body, s + 3);
    Clay.blob(ctx, cx + f * 4, by - 12 + bob, 7.5, 7, DINO.belly, s + 4, { sheen: 0.4 });
    for (let k = 0; k < 3; k++) Clay.blob(ctx, cx - f * (10 - k * 5), by - 24 + bob + Math.abs(k - 1), 2.6, 2.2, DINO.spot, s + 5 + k, { flat: true });
    // saddle
    Clay.blob(ctx, cx - f * 3, by - 25 + bob, 8.5, 4, DINO.saddle, s + 9);
    // front leg
    Clay.blob(ctx, cx + f * 6 + sw, by - 4, 5.8, 4.2, DINO.shoe, s + 10);
    // neck + head
    Clay.blob(ctx, cx + f * 9, by - 22 + bob, 6, 8, DINO.body, s + 11);
    const hx = cx + f * 12, hy = by - 31 + bob;
    Clay.blob(ctx, hx, hy, 9.5, 8.5, DINO.body, s + 12);
    const open = this.tongueDir !== 0;
    const full = !!this.mouth;
    Clay.blob(ctx, hx + f * 8, hy + 3 + (open ? 2 : 0), full ? 9 : 7.5, full ? 7.5 : 6, DINO.body, s + 13);
    if (open) {
      ctx.fillStyle = '#5a1f33';
      Clay.ellipsePath(ctx, hx + f * 11, hy + 6, 4.5, 3);
      ctx.fill();
      const m = this.mouthPos();
      ctx.strokeStyle = DINO.tongue;
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(m.x, m.y + 2);
      ctx.lineTo(m.x + f * this.tongue, m.y + 1);
      ctx.stroke();
      Clay.blob(ctx, m.x + f * this.tongue, m.y + 1, 5.5, 5, DINO.tongue, s + 14);
    } else {
      ctx.strokeStyle = U.shade(DINO.body, -0.45);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(hx + f * 4, hy + 6);
      ctx.quadraticCurveTo(hx + f * 9, hy + 8, hx + f * 14, hy + 5);
      ctx.stroke();
    }
    ctx.fillStyle = U.shade(DINO.body, -0.45);
    Clay.ellipsePath(ctx, hx + f * 13, hy, 1.1, 1.4);
    ctx.fill();
    // eyes on top of the head
    const panic = this.state === 'flee';
    Clay.blob(ctx, hx + f * 1, hy - 7, 4, 5, '#fffaf0', s + 15, { sheen: 0.3 });
    Clay.blob(ctx, hx + f * 2.5, hy - 6.5, panic ? 1.2 : 1.8, panic ? 1.6 : 2.6, '#2a1a22', s + 16, { flat: true });
    ctx.fillStyle = 'rgba(255,120,140,0.4)';
    Clay.ellipsePath(ctx, hx + f * 4, hy + 2, 2.6, 1.6);
    ctx.fill();
    if (panic && this.age % 20 < 10) {
      Clay.blob(ctx, hx - f * 8, hy - 10, 2, 3, '#9fd8ff', s + 17, { flat: true });
    }
  }
}
