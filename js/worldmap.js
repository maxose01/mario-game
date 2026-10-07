'use strict';
// The overworld: five floating clay islands linked by pebble paths, cloud stepping stones
// and one rainbow. Paths appear (pebble by pebble) when you find the exit that unlocks them.

const MAP_NODES = {
  hut: { x: 92, y: 398, kind: 'hut', name: "Pepper's Clay Hut" },
  l1: { x: 236, y: 384, kind: 'level', level: 'l1', name: 'Puffball Meadow' },
  palace: { x: 252, y: 156, kind: 'palace', level: 'palace', name: 'Cloud Switch Palace' },
  l2: { x: 452, y: 396, kind: 'level', level: 'l2', name: 'Gusty Glade' },
  l3: { x: 664, y: 326, kind: 'castle', level: 'l3', name: 'Thunderhead Keep' },
  summit: { x: 866, y: 194, kind: 'summit', name: 'Sunny Summit' },
  star: { x: 560, y: 92, kind: 'star', name: 'Starlight Lookout' },
};

function arcPoints(a, c, b, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]]);
  }
  return pts;
}

const MAP_PATHS = [
  { id: 'hut-l1', a: 'hut', b: 'l1', req: null, pts: [[92, 398], [160, 406], [236, 384]] },
  { id: 'l1-l2', a: 'l1', b: 'l2', req: 'l1:normal', pts: [[236, 384], [300, 410], [380, 414], [452, 396]] },
  { id: 'l1-palace', a: 'l1', b: 'palace', req: 'l1:secret', pts: [[236, 384], [212, 330], [222, 272], [242, 214], [252, 156]] },
  { id: 'l2-l3', a: 'l2', b: 'l3', req: 'l2:normal', pts: [[452, 396], [522, 386], [592, 354], [664, 326]] },
  { id: 'l2-summit', a: 'l2', b: 'summit', req: 'l2:secret', rainbow: true, pts: arcPoints([452, 396], [650, -10], [866, 194], 28) },
  { id: 'l3-summit', a: 'l3', b: 'summit', req: 'l3:normal', pts: [[664, 326], [742, 302], [804, 252], [866, 194]] },
  { id: 'l3-star', a: 'l3', b: 'star', req: 'l3:secret', pts: [[664, 326], [642, 250], [606, 168], [560, 92]] },
];

const MAP_ISLANDS = [
  { cx: 290, cy: 394, rx: 272, ry: 72, depth: 120, seed: 11 },
  { cx: 252, cy: 162, rx: 82, ry: 32, depth: 70, seed: 12 },
  { cx: 692, cy: 332, rx: 112, ry: 46, depth: 95, seed: 13 },
  { cx: 868, cy: 200, rx: 80, ry: 32, depth: 80, seed: 14 },
];
const STAR_ISLE = { cx: 560, cy: 98, rx: 58, ry: 22, depth: 55, seed: 15 };
const MAP_PAL = { grass: '#86d16e', dirt: '#cf9363', rock: '#a66f62', leaf: '#62b956', trunk: '#8a5a3c' };

// Resample a polyline at a fixed spacing.
function resample(pts, step) {
  const out = [pts[0].slice()];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const len = Math.hypot(bx - ax, by - ay);
    let d = step - carry;
    while (d <= len) {
      const t = d / len;
      out.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
      d += step;
    }
    carry = len - (d - step);
  }
  const last = pts[pts.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > 2) out.push(last.slice());
  return out;
}
for (const p of MAP_PATHS) {
  p.walk = resample(p.pts, 3);
  p.pebbles = resample(p.pts, 15).slice(1, -1);
}

function onIsland(x, y) {
  for (const i of MAP_ISLANDS) if (((x - i.cx) / i.rx) ** 2 + ((y - i.cy) / i.ry) ** 2 < 0.92) return true;
  return false;
}

function drawPlateau(g, isl, pal) {
  const { cx, cy, rx, ry, depth, seed } = isl;
  const rnd = U.rng(seed);
  // tapering rocky root
  const pts = [[cx - rx * 0.92, cy + ry * 0.3]];
  const n = 7;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    pts.push([cx - rx * 0.92 * Math.pow(1 - t, 0.8) - rnd() * 8, cy + ry * 0.4 + depth * t]);
  }
  pts.push([cx + (rnd() - 0.5) * rx * 0.2, cy + ry + depth]);
  for (let i = n - 1; i >= 1; i--) {
    const t = i / n;
    pts.push([cx + rx * 0.92 * Math.pow(1 - t, 0.8) + rnd() * 8, cy + ry * 0.4 + depth * t]);
  }
  pts.push([cx + rx * 0.92, cy + ry * 0.3]);
  const root = new Path2D();
  smoothPoly(root, pts, true);
  g.fillStyle = U.shade(pal.rock, -0.3);
  g.fill(root);
  g.save();
  g.clip(root);
  g.translate(-4, -3);
  g.fillStyle = pal.rock;
  g.fill(root);
  g.translate(4, 3);
  g.strokeStyle = U.rgba(U.shade(pal.rock, -0.35), 0.4);
  g.lineWidth = 3;
  for (let yy = cy + ry; yy < cy + ry + depth; yy += 14 + rnd() * 8) {
    g.beginPath();
    g.moveTo(cx - rx, yy);
    for (let xx = cx - rx; xx <= cx + rx; xx += 20) g.lineTo(xx, yy + (rnd() - 0.5) * 6);
    g.stroke();
  }
  g.restore();
  // cliff band
  Clay.blob(g, cx, cy + 16, rx, ry, pal.dirt, seed * 3, { wob: 0.03, sheen: 0.3 });
  g.save();
  Clay.blobPath(g, cx, cy + 16, rx, ry, seed * 3, 0.03);
  g.clip();
  g.strokeStyle = U.rgba(U.shade(pal.dirt, -0.3), 0.35);
  g.lineWidth = 3;
  for (let k = 0; k < 3; k++) {
    g.beginPath();
    g.ellipse(cx, cy + 4 + k * 8, rx * 0.98, ry * 0.98, 0, 0.1, Math.PI - 0.1);
    g.stroke();
  }
  g.restore();
  // grass top with drips
  g.fillStyle = U.shade(pal.grass, -0.3);
  Clay.blobPath(g, cx, cy + 3, rx * 1.01, ry * 1.02, seed * 5, 0.04);
  g.fill();
  for (let k = 0; k < rx / 14; k++) {
    const a = 0.15 * Math.PI + rnd() * 0.7 * Math.PI;
    Clay.blob(g, cx + Math.cos(a) * rx * 0.97, cy + Math.sin(a) * ry + 4, 4 + rnd() * 3, 6 + rnd() * 6, U.shade(pal.grass, -0.25), k + seed, { flat: true });
  }
  Clay.blob(g, cx, cy, rx * 0.99, ry, pal.grass, seed * 5, { wob: 0.04, sheen: 0.5 });
  g.fillStyle = U.rgba(U.shade(pal.grass, 0.25), 0.5);
  Clay.ellipsePath(g, cx - rx * 0.15, cy - ry * 0.25, rx * 0.6, ry * 0.4);
  g.fill();
  // base clouds
  Clay.cloud(g, cx - rx - 26, cy + ry * 0.5, 90, 36, '#ffffff', '#ddd2f2', seed + 40);
  Clay.cloud(g, cx + rx - 60, cy + ry * 0.6, 90, 36, '#ffffff', '#ddd2f2', seed + 41);
}

class WorldMap {
  constructor(game) {
    this.game = game;
    this.node = MAP_NODES[game.save.node] ? game.save.node : 'hut';
    const n = MAP_NODES[this.node];
    this.pos = { x: n.x, y: n.y };
    this.walking = null;
    this.reveal = [];
    this.scale = 0;
    this.t = 0;
    this.facing = 1;
    this.queueReveals();
  }
  get save() {
    return this.game.save;
  }
  unlocked(p) {
    return !p.req || !!this.save.exits[p.req];
  }
  visible(p) {
    return this.unlocked(p) && (!p.req || this.save.revealed[p.id]) && !this.reveal.some((r) => r.path === p);
  }
  queueReveals() {
    for (const p of MAP_PATHS) {
      if (p.req && this.unlocked(p) && !this.save.revealed[p.id] && !this.reveal.some((r) => r.path === p)) this.reveal.push({ path: p, t: 0 });
    }
  }
  pathsFrom(node) {
    return MAP_PATHS.filter((p) => (p.a === node || p.b === node) && this.visible(p));
  }
  update() {
    this.t++;
    if (this.reveal.length) {
      const r = this.reveal[0];
      r.t++;
      const shown = Math.floor(r.t / 3);
      if (r.t % 3 === 0 && shown <= r.path.pebbles.length) Sound.play('pop');
      if (shown > r.path.pebbles.length + 12) {
        this.save.revealed[r.path.id] = true;
        this.reveal.shift();
        this.game.persist();
      }
      return;
    }
    if (this.walking) {
      const w = this.walking;
      w.i += 2.6;
      const pts = w.path.walk;
      const idx = Math.min(pts.length - 1, Math.floor(w.i));
      const pt = w.reverse ? pts[pts.length - 1 - idx] : pts[idx];
      if (Math.abs(pt[0] - this.pos.x) > 0.2) this.facing = pt[0] > this.pos.x ? 1 : -1;
      this.pos.x = pt[0];
      this.pos.y = pt[1];
      if (Math.floor(w.i) % 14 === 0) Sound.play('step');
      if (idx >= pts.length - 1) {
        this.node = w.to;
        this.save.node = w.to;
        this.walking = null;
        this.game.persist();
      }
      return;
    }
    let dx = 0, dy = 0;
    if (Input.down('left')) dx -= 1;
    if (Input.down('right')) dx += 1;
    if (Input.down('up')) dy -= 1;
    if (Input.down('down')) dy += 1;
    if (dx || dy) {
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
      let best = null, bestDot = 0.35;
      for (const p of this.pathsFrom(this.node)) {
        const rev = p.b === this.node;
        const pts = p.walk;
        const a = rev ? pts[pts.length - 1] : pts[0];
        const b = rev ? pts[Math.max(0, pts.length - 12)] : pts[Math.min(pts.length - 1, 11)];
        const vx = b[0] - a[0], vy = b[1] - a[1];
        const vl = Math.hypot(vx, vy) || 1;
        const dot = (vx / vl) * dx + (vy / vl) * dy;
        if (dot > bestDot) {
          bestDot = dot;
          best = { path: p, reverse: rev, to: rev ? p.a : p.b, i: 0 };
        }
      }
      if (best) this.walking = best;
    } else if (Input.pressed('jump') || Input.pressed('pause')) {
      this.activate();
    }
  }
  activate() {
    const n = MAP_NODES[this.node];
    if (n.level) {
      Sound.play('select');
      this.game.enterLevel(n.level);
    } else if (n.kind === 'summit') this.game.showScene('ending');
    else if (n.kind === 'star') this.game.showScene('star');
    else Sound.play('bump');
  }

  // ---------- drawing ----------
  bake(rs) {
    const c = Clay.makeCanvas(VIEW_W * rs, VIEW_H * rs);
    const g = c.getContext('2d');
    g.setTransform(rs, 0, 0, rs, 0, 0);
    g.lineJoin = 'round';
    Clay.still = true;
    const sky = g.createLinearGradient(0, 0, 0, VIEW_H);
    sky.addColorStop(0, '#8fc9ff');
    sky.addColorStop(0.5, '#ffd6e6');
    sky.addColorStop(1, '#ffe9d1');
    g.fillStyle = sky;
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    const rnd = U.rng(77);
    for (let i = 0; i < 9; i++) Clay.cloud(g, rnd() * VIEW_W - 60, 30 + rnd() * 160, 150 + rnd() * 120, 46, '#fff7fb', '#ead6ec', 300 + i);
    // a sea of clouds far below
    for (let i = 0; i < 16; i++) Clay.cloud(g, (i / 16) * VIEW_W - 40, 470 + rnd() * 30, 170, 60, '#ffffff', '#e2d6f0', 500 + i);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 515, VIEW_W, 30);
    for (const isl of MAP_ISLANDS) drawPlateau(g, isl, MAP_PAL);
    // scenery
    const trees = [[40, 370, 30], [150, 352, 26], [330, 346, 32], [520, 360, 26], [380, 444, 24], [60, 430, 22], [742, 350, 24], [905, 196, 20], [300, 150, 18]];
    for (const [x, y, s] of trees) Clay.tree(g, x, y, s, MAP_PAL, x + y);
    for (const [x, y] of [[180, 440], [330, 390], [500, 430], [120, 360], [620, 350], [830, 210]]) {
      Clay.blob(g, x, y, 12, 8, '#62b956', x);
      Clay.blob(g, x + 9, y + 2, 8, 6, '#6fc760', x + 1);
    }
    for (let k = 0; k < 40; k++) {
      const a = rnd() * TAU, r = Math.sqrt(rnd());
      const x = 290 + Math.cos(a) * 250 * r, y = 394 + Math.sin(a) * 60 * r;
      Clay.blob(g, x, y, 2.4, 2.4, ['#ff6f91', '#ffd166', '#ffffff', '#c77dff'][k % 4], k, { flat: true });
    }
    this.drawCastle(g, 716, 286);
    Clay.applyGrain(g, 0, 0, VIEW_W, VIEW_H, 0.6);
    Clay.still = false;
    return c;
  }
  drawCastle(g, x, y) {
    const stone = '#a79cc2';
    Clay.block(g, x - 46, y - 30, 92, 54, stone);
    for (const k of [-1, 1]) {
      Clay.block(g, x + k * 40 - 15, y - 62, 30, 80, U.shade(stone, -0.05));
      g.fillStyle = '#7c4a9e';
      g.beginPath();
      g.moveTo(x + k * 40 - 19, y - 60);
      g.lineTo(x + k * 40, y - 92);
      g.lineTo(x + k * 40 + 19, y - 60);
      g.closePath();
      g.fill();
    }
    Clay.block(g, x - 16, y - 80, 32, 60, U.shade(stone, 0.05));
    g.fillStyle = '#5d3480';
    g.beginPath();
    g.moveTo(x - 21, y - 78);
    g.lineTo(x, y - 116);
    g.lineTo(x + 21, y - 78);
    g.closePath();
    g.fill();
    g.fillStyle = '#3b2440';
    Clay.rrect(g, x - 9, y - 2, 18, 26, 9);
    g.fill();
    g.fillStyle = 'rgba(255,220,140,0.85)';
    for (const [wx, wy] of [[x - 40, y - 40], [x + 40, y - 40], [x, y - 58]]) {
      Clay.rrect(g, wx - 4, wy - 6, 8, 12, 4);
      g.fill();
    }
  }
  render(ctx, rs) {
    if (this.scale !== rs || !this.bg) {
      this.scale = rs;
      this.bg = this.bake(rs);
    }
    ctx.drawImage(this.bg, 0, 0, VIEW_W, VIEW_H);
    const save = this.save;
    // drifting foreground wisps
    const t = this.t;
    // star isle: a faint mystery until its path is found
    const starOpen = this.unlocked(MAP_PATHS[6]);
    ctx.globalAlpha = starOpen ? 1 : 0.28 + Math.sin(t * 0.03) * 0.06;
    Clay.still = true;
    drawPlateau(ctx, STAR_ISLE, { grass: '#c9b8ff', dirt: '#9b86d6', rock: '#6f5aa8' });
    Clay.still = false;
    ctx.globalAlpha = 1;
    // paths
    for (const p of MAP_PATHS) {
      if (this.visible(p)) this.drawPath(ctx, p, p.pebbles.length);
    }
    if (this.reveal.length) {
      const r = this.reveal[0];
      this.drawPath(ctx, r.path, Math.min(r.path.pebbles.length, Math.floor(r.t / 3)), true);
    }
    // nodes
    for (const id in MAP_NODES) this.drawNode(ctx, id, MAP_NODES[id]);
    // hills with blinking eyes
    for (const [x, y] of [[380, 352], [130, 410]]) {
      const blink = (t + x) % 200 < 8;
      for (const s of [-5, 5]) {
        if (blink) {
          ctx.fillStyle = '#2a1a22';
          ctx.fillRect(x + s - 2.5, y, 5, 1.5);
        } else {
          Clay.blob(ctx, x + s, y, 2.4, 3.4, '#ffffff', x + s, { sheen: 0 });
          Clay.blob(ctx, x + s + 0.6, y + 0.6, 1.2, 1.8, '#2a1a22', 3, { flat: true });
        }
      }
    }
    // the hero
    this.drawHero(ctx);
    // drifting cloud wisps in front
    for (let i = 0; i < 3; i++) {
      const x = ((t * (0.15 + i * 0.07) + i * 380) % (VIEW_W + 300)) - 150;
      ctx.globalAlpha = 0.55;
      Clay.cloud(ctx, x, 250 + i * 90, 140, 34, '#ffffff', '#efe6f7', 900 + i);
      ctx.globalAlpha = 1;
    }
    this.drawHud(ctx);
  }
  drawPath(ctx, p, count, revealing) {
    const peb = p.pebbles;
    for (let i = 0; i < count; i++) {
      const [x, y] = peb[i];
      const pop = revealing && i > count - 4 ? U.easeOutBack(Math.min(1, (count - i) / 3)) : 1;
      if (p.rainbow) {
        const cols = ['#ff6f6f', '#ffb347', '#ffe066', '#7ddc6f', '#6ec6ff', '#b48cff'];
        for (let k = 0; k < cols.length; k++) Clay.blob(ctx, x, y - 10 + k * 3.6, 6.5 * pop, 2.6 * pop, cols[k], i * 7 + k, { flat: true, wob: 0.02 });
      } else if (onIsland(x, y)) {
        Clay.blob(ctx, x, y, 4.6 * pop, 3.3 * pop, '#f3dcc0', i + p.id.length, { wob: 0.05 });
      } else {
        Clay.cloud(ctx, x - 9 * pop, y - 5 * pop, 18 * pop, 11 * pop, '#ffffff', '#ddd2f2', i + 3);
      }
    }
  }
  drawNode(ctx, id, n) {
    const save = this.save;
    const t = this.t;
    if (n.kind === 'star' && !this.unlocked(MAP_PATHS[6])) return;
    if (n.kind === 'hut') {
      Clay.block(ctx, n.x - 18, n.y - 30, 36, 26, '#fbe7c6');
      ctx.fillStyle = '#e2483d';
      ctx.beginPath();
      ctx.moveTo(n.x - 24, n.y - 28);
      ctx.lineTo(n.x, n.y - 50);
      ctx.lineTo(n.x + 24, n.y - 28);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#7a4a2b';
      Clay.rrect(ctx, n.x - 5, n.y - 18, 10, 14, 4);
      ctx.fill();
      ctx.fillStyle = '#9b8a80';
      ctx.fillRect(n.x + 9, n.y - 52, 7, 14);
      for (let k = 0; k < 3; k++) {
        const ph = (t * 0.02 + k / 3) % 1;
        ctx.globalAlpha = 1 - ph;
        Clay.blob(ctx, n.x + 12 + ph * 10, n.y - 56 - ph * 26, 3 + ph * 5, 3 + ph * 4, '#ffffff', k, { flat: true });
        ctx.globalAlpha = 1;
      }
      return;
    }
    if (n.kind === 'palace') {
      const on = save.switchOn;
      Clay.block(ctx, n.x - 26, n.y - 12, 52, 14, '#e6dcc8', { noPrint: true });
      for (const k of [-16, 0, 16]) {
        ctx.fillStyle = '#f6efe0';
        Clay.rrect(ctx, n.x + k - 4, n.y - 34, 8, 22, 3);
        ctx.fill();
      }
      Clay.blob(ctx, n.x, on ? n.y - 36 : n.y - 42, 24, on ? 7 : 13, '#4a8cff', 31);
      Clay.text(ctx, '!', n.x, on ? n.y - 37 : n.y - 44, on ? 12 : 18, '#ffffff', { depth: 1 });
      if (on) {
        ctx.fillStyle = `rgba(110,198,255,${0.25 + 0.15 * Math.sin(t * 0.08)})`;
        Clay.ellipsePath(ctx, n.x, n.y - 30, 40, 26);
        ctx.fill();
      }
      this.disc(ctx, n.x, n.y + 6, '#6ec6ff');
      return;
    }
    if (n.kind === 'summit') {
      ctx.strokeStyle = '#8a5a3c';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(n.x + 18, n.y + 2);
      ctx.lineTo(n.x + 18, n.y - 56);
      ctx.stroke();
      const wave = Math.sin(t * 0.12) * 4;
      ctx.fillStyle = save.cleared ? '#ffd23f' : '#ff6f91';
      ctx.beginPath();
      ctx.moveTo(n.x + 20, n.y - 56);
      ctx.quadraticCurveTo(n.x + 34, n.y - 52 + wave, n.x + 48, n.y - 50);
      ctx.quadraticCurveTo(n.x + 34, n.y - 42 - wave, n.x + 20, n.y - 38);
      ctx.closePath();
      ctx.fill();
      Clay.blob(ctx, n.x + 18, n.y - 58, 4, 4, '#ffd84a', 5);
      this.disc(ctx, n.x, n.y, '#ffe27a');
      return;
    }
    if (n.kind === 'star') {
      const glow = 0.5 + 0.3 * Math.sin(t * 0.06);
      const g = ctx.createRadialGradient(n.x, n.y, 4, n.x, n.y, 40);
      g.addColorStop(0, `rgba(255,240,170,${glow})`);
      g.addColorStop(1, 'rgba(255,240,170,0)');
      ctx.fillStyle = g;
      ctx.fillRect(n.x - 40, n.y - 40, 80, 80);
      ctx.fillStyle = '#ffd84a';
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k / 10) * TAU;
        const r = k % 2 ? 7 : 16;
        ctx.lineTo(n.x + Math.cos(a) * r, n.y + Math.sin(a) * r * 0.8);
      }
      ctx.closePath();
      ctx.fill();
      return;
    }
    // level nodes
    const spec = LEVEL_SPECS[n.level];
    const hasSecret = spec.exits.includes('secret');
    this.disc(ctx, n.x, n.y, hasSecret ? '#ff6b5e' : '#ffd23f');
    const normal = save.exits[n.level + ':normal'], secret = save.exits[n.level + ':secret'];
    if (normal) {
      ctx.strokeStyle = '#7a5236';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(n.x - 12, n.y - 2);
      ctx.lineTo(n.x - 12, n.y - 24);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(n.x - 11, n.y - 24);
      ctx.lineTo(n.x + 1, n.y - 20);
      ctx.lineTo(n.x - 11, n.y - 15);
      ctx.fill();
    }
    if (secret) drawKey(ctx, n.x + 14, n.y - 14, 1, 9);
  }
  disc(ctx, x, y, color) {
    Clay.blob(ctx, x, y + 3, 15, 8, U.shade(color, -0.4), 1, { flat: true, wob: 0.03 });
    Clay.blob(ctx, x, y, 14, 7.5, color, 2, { wob: 0.03 });
  }
  drawHero(ctx) {
    const save = this.save;
    const x = this.pos.x, y = this.pos.y;
    const walking = !!this.walking;
    const hop = walking ? -Math.abs(Math.sin(this.t * 0.25)) * 4 : Math.sin(this.t * 0.08) * 1;
    Clay.shadow(ctx, x, y + 2, 26);
    const stub = {
      age: this.t,
      walkPhase: this.t * 0.25,
      starCape: save.starCape,
      vx: walking ? 2 : 0,
      pitch: 0,
      carrying: null,
    };
    if (save.companion) {
      const dino = {
        facing: this.facing, x: x - 14, y: y - 32 + hop, w: 28, h: 32, state: walking ? 'flee' : 'idle',
        vx: walking ? 2 : 0, legT: this.t * 0.4, age: this.t, onGround: false, tongueDir: 0, mouth: null,
        get cx() { return this.x + 14; },
        mouthPos() { return { x: this.x + 14 + this.facing * 17, y: this.y + 8 }; },
      };
      dino.state = walking ? 'ridden' : 'idle';
      Companion.prototype.draw.call(dino, ctx);
      ctx.save();
      ctx.translate(x - this.facing * 2, y - 24 + hop);
      drawHero(ctx, this.facing, save.power, 'ride', stub);
      ctx.restore();
    } else {
      ctx.save();
      ctx.translate(x, y + hop);
      drawHero(ctx, this.facing, save.power, walking ? 'walk' : 'idle', stub);
      ctx.restore();
    }
  }
  drawHud(ctx) {
    const save = this.save;
    Hud.panel(ctx, 14, 12, 230, 46);
    Hud.head(ctx, 40, 35, save.companion);
    Clay.label(ctx, '× ' + save.lives, 62, 35, 20);
    drawCoin(ctx, 140, 35, Clay.time * 3, 4, 0.85);
    Clay.label(ctx, '× ' + String(save.coins).padStart(2, '0'), 154, 35, 20);
    const found = Game.EXITS.filter((e) => save.exits[e]).length;
    Hud.panel(ctx, VIEW_W - 236, 12, 222, 46);
    Clay.label(ctx, 'Exits found ' + found + '/' + Game.EXITS.length, VIEW_W - 26, 35, 18, '#fff8ec', 'right');
    // node info plaque
    const n = MAP_NODES[this.node];
    if (this.walking) return;
    Hud.panel(ctx, VIEW_W / 2 - 230, VIEW_H - 74, 460, 60);
    Clay.label(ctx, n.name, VIEW_W / 2, VIEW_H - 56, 21, '#fff8ec', 'center');
    let sub = '';
    if (n.level && n.kind !== 'palace') {
      const spec = LEVEL_SPECS[n.level];
      const marks = spec.exits.map((e) => (save.exits[n.level + ':' + e] ? '●' : '○')).join(' ');
      const suns = (save.sunCoins[n.level] || []).filter(Boolean).length;
      sub = 'exits ' + marks + '    sun coins ' + suns + '/3    jump to enter';
    } else if (n.kind === 'palace') sub = save.switchOn ? 'The switch is pressed. Jump to visit again.' : 'Jump to enter';
    else if (n.kind === 'hut') sub = 'Home sweet clay home. Arrow keys walk the paths.';
    else if (n.kind === 'summit') sub = 'Jump to celebrate';
    else if (n.kind === 'star') sub = 'Jump to gaze at the stars';
    Clay.label(ctx, sub, VIEW_W / 2, VIEW_H - 31, 14, '#ffe9b8', 'center');
  }
}
