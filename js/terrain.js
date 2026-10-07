'use strict';
// Floating-cloud-island terrain and backdrops.
// Ground tiles are contour-traced into organic clay shapes with rounded corners, iced with
// drippy grass caps, hung with tapering rocky roots and nested in cloud puffs. Static art is
// baked once into canvas chunks (lazily, at the current render scale) so frames stay cheap.

const THEMES = {
  dawn: {
    sky: ['#ffb1c6', '#ffd9c6', '#c9e9ff'],
    sun: { x: 0.74, y: 0.2, r: 48, color: '#fff2bd', glow: 'rgba(255,234,190,0.55)' },
    far: '#ffeef4', farShade: '#f2c9da',
    distant: { grass: '#bfe0b0', dirt: '#e8c1aa', rock: '#d6b0bd' },
    distantFade: '#f7d6e3',
    mid: '#fff7fb', midShade: '#ecd0e6',
    grass: '#7fcf6a', dirt: '#cf9363', rock: '#a66f62', stone: '#b9adc0',
    cloud: '#ffffff', cloudShade: '#ddd2f2', thorn: '#7d4a8a',
    flowers: ['#ff6f91', '#ffd166', '#c77dff', '#ffffff', '#ff9f6b'], leaf: '#6cc25a', trunk: '#8a5a3c',
    sea: '#fff5fa', seaShade: '#edd2e5',
    ambient: 'pollen',
  },
  noon: {
    sky: ['#5fb3ff', '#a3d6ff', '#e7f8ff'],
    sun: { x: 0.18, y: 0.16, r: 40, color: '#fffbe2', glow: 'rgba(255,252,220,0.5)' },
    far: '#ffffff', farShade: '#cfe6fb',
    distant: { grass: '#a9dca0', dirt: '#d9b89c', rock: '#b4a3a8' },
    distantFade: '#cfe9ff',
    mid: '#ffffff', midShade: '#c9e0f5',
    grass: '#5ec24e', dirt: '#c27c4b', rock: '#8f6750', stone: '#b6b2bf',
    cloud: '#ffffff', cloudShade: '#c8dcf2', thorn: '#6a3f86',
    flowers: ['#ff5d73', '#ffe066', '#ffffff', '#6ec6ff', '#ff9f43'], leaf: '#4fb646', trunk: '#875636',
    sea: '#ffffff', seaShade: '#cfe2f5',
    ambient: 'leaves',
    windmills: true,
  },
  dusk: {
    sky: ['#2b2257', '#7b4686', '#f2967a'],
    sun: { x: 0.8, y: 0.17, r: 30, color: '#ffe9cf', glow: 'rgba(255,220,200,0.35)', moon: true },
    far: '#c9b6e6', farShade: '#8e78b8',
    distant: { grass: '#7d9fa2', dirt: '#8d7b98', rock: '#6b5f86' },
    distantFade: '#9a7aa8',
    mid: '#d9cdef', midShade: '#9b8cc2',
    grass: '#6db39a', dirt: '#917a98', rock: '#665676', stone: '#8f8ba8',
    cloud: '#f1e9ff', cloudShade: '#a99dcc', thorn: '#4b2a5c',
    flowers: ['#ffb3c7', '#ffe9a8', '#b9f2ff', '#f0c3ff'], leaf: '#5b9d8a', trunk: '#5e4560',
    sea: '#d8cdee', seaShade: '#9b8dc1',
    ambient: 'rain',
    lightning: true,
    castles: true,
  },
  palace: {
    sky: ['#ffe9a8', '#ffe1ec', '#ffd2e3'],
    sun: { x: 0.5, y: 0.18, r: 60, color: '#fff7d6', glow: 'rgba(255,245,200,0.6)' },
    far: '#fff8ff', farShade: '#f2d2e6',
    distant: { grass: '#c5e6ff', dirt: '#f0d7a6', rock: '#e2c69a' },
    distantFade: '#ffe6ef',
    mid: '#ffffff', midShade: '#f0d6ea',
    grass: '#8fd0ff', dirt: '#e4c07a', rock: '#c7a066', stone: '#f0e2c4',
    cloud: '#ffffff', cloudShade: '#ead6f2', thorn: '#7d4a8a',
    flowers: ['#ff8fb1', '#ffffff', '#ffe066'], leaf: '#7cc8f0', trunk: '#b58a52',
    sea: '#fffaff', seaShade: '#f0d6ea',
    ambient: 'sparkle',
  },
};

// Midpoint-quadratic smoothing through a polyline of [x,y] points.
function smoothPoly(path, pts, closed) {
  const n = pts.length;
  if (n < 3) return;
  if (closed) {
    path.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      path.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    }
    path.closePath();
  } else {
    path.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < n - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      path.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    }
    path.lineTo(pts[n - 1][0], pts[n - 1][1]);
  }
}

// ---------------------------------------------------------------------------
// Geometry: contour loops, grass runs, undersides and decorations.
function buildTerrainGeom(level) {
  const { w, h } = level;
  const T = TILE;
  const grid = level.grid;
  const orig = level.origRows;
  const PAD = 2;
  const solid = (x, y) => {
    if (x < -PAD || x > w - 1 + PAD || y < 0 || y > h - 1 + PAD) return false;
    return grid[Math.min(y, h - 1)][U.clamp(x, 0, w - 1)] === '#';
  };

  // --- contour tracing (solid stays on the right-hand side of every edge) ---
  const edges = new Map();
  const key = (x, y) => x * 4096 + y;
  const addEdge = (ax, ay, bx, by) => {
    const k = key(ax, ay);
    let list = edges.get(k);
    if (!list) edges.set(k, (list = []));
    list.push({ ax, ay, bx, by, used: false });
  };
  for (let y = 0; y <= h - 1 + PAD; y++) {
    for (let x = -PAD; x <= w - 1 + PAD; x++) {
      if (!solid(x, y)) continue;
      if (!solid(x, y - 1)) addEdge(x, y, x + 1, y);
      if (!solid(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1);
      if (!solid(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1);
      if (!solid(x - 1, y)) addEdge(x, y + 1, x, y);
    }
  }
  const loops = [];
  for (const list of edges.values()) {
    for (const e0 of list) {
      if (e0.used) continue;
      const loop = [];
      let e = e0;
      while (e && !e.used) {
        e.used = true;
        loop.push([e.ax, e.ay]);
        const next = edges.get(key(e.bx, e.by));
        e = next ? next.find((n) => !n.used) : null;
      }
      // drop collinear vertices
      const simp = [];
      for (let i = 0; i < loop.length; i++) {
        const p = loop[(i - 1 + loop.length) % loop.length], c = loop[i], n = loop[(i + 1) % loop.length];
        const d1x = c[0] - p[0], d1y = c[1] - p[1], d2x = n[0] - c[0], d2y = n[1] - c[1];
        if (d1x * d2y - d1y * d2x !== 0) simp.push(c);
      }
      if (simp.length >= 3) loops.push(simp);
    }
  }

  // --- rounded, slightly hand-made outline ---
  const groundPath = new Path2D();
  const R = 12;
  for (const loop of loops) {
    const pts = loop.map(([x, y]) => [x * T, y * T]);
    const n = pts.length;
    const corners = [];
    for (let i = 0; i < n; i++) {
      const p = pts[(i - 1 + n) % n], c = pts[i], q = pts[(i + 1) % n];
      const lp = Math.hypot(p[0] - c[0], p[1] - c[1]), lq = Math.hypot(q[0] - c[0], q[1] - c[1]);
      const r = Math.min(R, lp / 2, lq / 2);
      corners.push({
        a: [c[0] + ((p[0] - c[0]) / lp) * r, c[1] + ((p[1] - c[1]) / lp) * r],
        c,
        b: [c[0] + ((q[0] - c[0]) / lq) * r, c[1] + ((q[1] - c[1]) / lq) * r],
      });
    }
    groundPath.moveTo(corners[0].b[0], corners[0].b[1]);
    for (let i = 1; i <= n; i++) {
      const prev = corners[i - 1], cur = corners[i % n];
      // wobbly straight segment from prev.b to cur.a
      const sx = prev.b[0], sy = prev.b[1], ex = cur.a[0], ey = cur.a[1];
      const len = Math.hypot(ex - sx, ey - sy);
      const segs = Math.floor(len / 14);
      const nx = -(ey - sy) / (len || 1), ny = (ex - sx) / (len || 1);
      for (let k = 1; k < segs; k++) {
        const t = k / segs;
        const off = (U.hash2(Math.round(sx + (ex - sx) * t), Math.round(sy + (ey - sy) * t), 7) - 0.5) * 2.4;
        groundPath.lineTo(sx + (ex - sx) * t + nx * off, sy + (ey - sy) * t + ny * off);
      }
      groundPath.lineTo(ex, ey);
      groundPath.quadraticCurveTo(cur.c[0], cur.c[1], cur.b[0], cur.b[1]);
    }
    groundPath.closePath();
  }

  const isG = (x, y) => x >= 0 && y >= 0 && x < w && y < h && grid[y][x] === '#';
  const blocksBelow = (c) => c === '#' || c === 'X';

  // --- grass runs (top-exposed) ---
  const grassRuns = [];
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      if (isG(x, y) && !isG(x, y - 1)) {
        const x0 = x;
        while (x < w && isG(x, y) && !isG(x, y - 1)) x++;
        const x1 = x - 1;
        grassRuns.push({ x0, x1, y, openL: x0 > 0 && !isG(x0 - 1, y), openR: x1 < w - 1 && !isG(x1 + 1, y) });
      } else x++;
    }
  }

  // --- undersides (bottom-exposed runs that hang over open sky) ---
  const undersides = [];
  for (let y = 0; y < h - 1; y++) {
    let x = 0;
    while (x < w) {
      if (isG(x, y) && !isG(x, y + 1)) {
        const x0 = x;
        while (x < w && isG(x, y) && !isG(x, y + 1)) x++;
        const x1 = x - 1;
        const cx = (x0 + x1) >> 1;
        let free = 0;
        for (let yy = y + 1; yy < h && !blocksBelow(grid[yy][cx]); yy++) free++;
        undersides.push({ x0, x1, y, free, openL: !isG(x0 - 1, y), openR: !isG(x1 + 1, y) });
      } else x++;
    }
  }

  // --- decorations, seeded so they never change between visits ---
  const decor = [];
  const blockedAbove = new Set(['G', 'H', 'C', 'T', 'S', 'Z', 'X', '^', '=', 'L', 'O', '?', 'M', 'W', 'E', '1', 'B', 'I', 'K', '@']);
  const free = (x, y) => y >= 0 && x >= 0 && x < w && !blockedAbove.has(orig[y][x]) && grid[y][x] !== '#';
  let lastTree = -99;
  for (const run of grassRuns) {
    const rnd = U.rng(run.x0 * 7919 + run.y * 104729);
    const len = run.x1 - run.x0 + 1;
    for (let x = run.x0; x <= run.x1; x++) {
      if (!free(x, run.y - 1)) continue;
      const gx = x * T, gy = run.y * T;
      const r = rnd();
      const inner = x > run.x0 && x < run.x1;
      if (r < 0.07 && len >= 5 && inner && x - lastTree > 4 && free(x, run.y - 2) && free(x, run.y - 3) && free(x - 1, run.y - 2) && free(x + 1, run.y - 2)) {
        decor.push({ type: 'tree', x: gx + 16, y: gy, size: 40 + rnd() * 14, seed: x * 31 + run.y });
        lastTree = x;
      } else if (r < 0.17 && len >= 3) {
        decor.push({ type: 'bush', x: gx + 8 + rnd() * 16, y: gy, size: 13 + rnd() * 7, seed: x * 17 + run.y });
      } else if (r < 0.34) {
        decor.push({ type: 'flower', x: gx + 6 + rnd() * 20, y: gy, size: 5 + rnd() * 3, color: (rnd() * 1000) | 0, seed: x * 13 + run.y });
      } else if (r < 0.5) {
        decor.push({ type: 'tuft', x: gx + 4 + rnd() * 24, y: gy, size: 7 + rnd() * 4, seed: x * 11 + run.y });
      } else if (r < 0.54) {
        decor.push({ type: 'shroom', x: gx + 8 + rnd() * 16, y: gy, size: 5 + rnd() * 3, seed: x * 7 + run.y });
      } else if (r < 0.6) {
        decor.push({ type: 'pebble', x: gx + 6 + rnd() * 20, y: gy, size: 3 + rnd() * 3, seed: x * 5 + run.y });
      }
    }
  }
  // a signpost next to the start
  if (level.start) {
    const sx = Math.floor(level.start.x / T) + 2, sy = Math.floor((level.start.y + 40) / T);
    for (let yy = sy; yy < h; yy++) {
      if (isG(sx, yy)) {
        decor.push({ type: 'sign', x: sx * T + 16, y: yy * T, size: 1, seed: 5 });
        break;
      }
    }
  }
  return { groundPath, grassRuns, undersides, decor };
}

// ---------------------------------------------------------------------------
class TerrainRenderer {
  constructor(level) {
    this.level = level;
    this.theme = level.theme;
    this.geom = buildTerrainGeom(level);
    this.chunkW = 512;
    this.scale = 0;
    this.chunks = new Map();
    this.order = [];
  }
  setScale(s) {
    if (s !== this.scale) {
      this.scale = s;
      this.chunks.clear();
      this.order = [];
    }
  }
  draw(ctx, camX) {
    const cw = this.chunkW;
    const first = Math.max(0, Math.floor(camX / cw));
    const last = Math.min(Math.floor((this.level.W - 1) / cw), Math.floor((camX + VIEW_W) / cw));
    for (let i = first; i <= last; i++) {
      ctx.drawImage(this.getChunk(i), i * cw, 0, cw, this.level.H);
    }
    // bake one chunk ahead so scrolling never hitches on a fresh bake
    const ahead = last + 1;
    if (ahead * cw < this.level.W && !this.chunks.has(ahead) && !this._bakedThisFrame) this.getChunk(ahead);
    this._bakedThisFrame = false;
  }
  getChunk(i) {
    let c = this.chunks.get(i);
    if (c) return c;
    c = this.bake(i);
    this._bakedThisFrame = true;
    this.chunks.set(i, c);
    this.order.push(i);
    while (this.order.length > 8) {
      const old = this.order.shift();
      this.chunks.delete(old);
    }
    return c;
  }
  bake(i) {
    const s = this.scale || 1;
    const cw = this.chunkW, H = this.level.H;
    const c = Clay.makeCanvas(cw * s, H * s);
    const ctx = c.getContext('2d');
    ctx.setTransform(s, 0, 0, s, -i * cw * s, 0);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const x0 = i * cw - 128, x1 = (i + 1) * cw + 128;
    Clay.still = true;
    const g = this.geom;
    for (const d of g.decor) if (d.type === 'tree' && d.x > x0 && d.x < x1) Clay.tree(ctx, d.x, d.y + 6, d.size, this.theme, d.seed);
    for (const u of g.undersides) if ((u.x1 + 1) * TILE > x0 && u.x0 * TILE < x1) this.drawUnderside(ctx, u);
    this.drawGround(ctx, x0, x1);
    for (const r of g.grassRuns) if ((r.x1 + 1) * TILE > x0 && r.x0 * TILE < x1) this.drawGrass(ctx, r);
    this.drawTiles(ctx, x0, x1);
    for (const d of g.decor) if (d.type !== 'tree' && d.x > x0 && d.x < x1) this.drawDecor(ctx, d);
    for (const u of g.undersides) if ((u.x1 + 1) * TILE > x0 - 64 && u.x0 * TILE < x1 + 64) this.drawBaseClouds(ctx, u);
    Clay.applyGrain(ctx, i * cw, 0, cw, H, 0.85);
    Clay.still = false;
    return c;
  }

  drawGround(ctx, x0, x1) {
    const th = this.theme, p = this.geom.groundPath;
    ctx.fillStyle = U.shade(th.dirt, -0.34);
    ctx.fill(p, 'evenodd');
    ctx.save();
    ctx.clip(p, 'evenodd');
    ctx.translate(-2, -3);
    ctx.fillStyle = th.dirt;
    ctx.fill(p, 'evenodd');
    ctx.translate(2, 3);
    // soft inner shadow on undersides and walls
    ctx.translate(0, -8);
    ctx.strokeStyle = U.rgba(U.shade(th.dirt, -0.45), 0.32);
    ctx.lineWidth = 16;
    ctx.stroke(p);
    ctx.translate(0, 8);
    // earthy strata
    ctx.strokeStyle = U.rgba(U.shade(th.dirt, -0.28), 0.3);
    ctx.lineWidth = 3;
    for (let yy = 22; yy < this.level.H + 40; yy += 27) {
      ctx.beginPath();
      ctx.moveTo(x0, yy);
      for (let xx = x0; xx <= x1; xx += 24) ctx.lineTo(xx, yy + (U.hash2(xx, yy, 3) - 0.5) * 6);
      ctx.stroke();
    }
    // embedded pebbles and thumbprints
    const T = TILE;
    const grid = this.level.grid;
    for (let ty = 0; ty < this.level.h; ty++) {
      for (let tx = Math.max(0, Math.floor(x0 / T)); tx <= Math.min(this.level.w - 1, Math.floor(x1 / T)); tx++) {
        if (grid[ty][tx] !== '#') continue;
        const hsh = U.hash2(tx, ty, 11);
        if (hsh < 0.42) {
          const px = tx * T + 6 + U.hash2(tx, ty, 12) * 20, py = ty * T + 10 + U.hash2(tx, ty, 13) * 18;
          const r = 2.5 + U.hash2(tx, ty, 14) * 3.5;
          Clay.blob(ctx, px, py, r * 1.3, r, U.shade(th.rock, (U.hash2(tx, ty, 15) - 0.5) * 0.3), tx * 97 + ty);
        } else if (hsh > 0.9) {
          Clay.thumbprint(ctx, tx * T + 16, ty * T + 18, 11, tx * 7 + ty, 0.1);
        }
      }
    }
    ctx.restore();
    ctx.strokeStyle = U.shade(th.dirt, -0.5);
    ctx.lineWidth = 2;
    ctx.stroke(p);
  }

  drawGrass(ctx, run) {
    const T = TILE, th = this.theme;
    const left = run.x0 * T - (run.openL ? 5 : 0), right = (run.x1 + 1) * T + (run.openR ? 5 : 0), y = run.y * T;
    const rnd = U.rng(run.x0 * 977 + run.y * 131);
    const path = new Path2D();
    path.moveTo(left, y + 8);
    path.quadraticCurveTo(left - 1, y - 2, left + 6, y - 3);
    let x = left + 6;
    while (x < right - 6) {
      const nx = Math.min(right - 6, x + 10 + rnd() * 8);
      path.quadraticCurveTo((x + nx) / 2, y - 5 - rnd() * 2.5, nx, y - 3 + rnd());
      x = nx;
    }
    path.quadraticCurveTo(right + 1, y - 2, right, y + 8);
    x = right;
    while (x > left) {
      const nx = Math.max(left, x - 8 - rnd() * 10);
      const drip = rnd() < 0.26;
      const d = drip ? 17 + rnd() * 9 : 9 + rnd() * 4;
      path.quadraticCurveTo((x + nx) / 2, y + d, nx, y + 8 + rnd() * 3);
      x = nx;
    }
    path.closePath();
    ctx.fillStyle = U.shade(th.grass, -0.32);
    ctx.fill(path);
    ctx.save();
    ctx.translate(-0.5, -2.6);
    ctx.fillStyle = th.grass;
    ctx.fill(path);
    ctx.restore();
    ctx.strokeStyle = U.rgba(U.shade(th.grass, 0.5), 0.75);
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(left + 8, y - 3);
    for (let xx = left + 8; xx < right - 10; xx += 12) ctx.lineTo(xx + 12, y - 3 + (rnd() - 0.5) * 1.5);
    ctx.stroke();
    // little blades
    ctx.strokeStyle = U.shade(th.grass, -0.18);
    ctx.lineWidth = 1.6;
    for (let xx = left + 6; xx < right - 6; xx += 7 + rnd() * 9) {
      if (rnd() < 0.5) continue;
      const hh = 3 + rnd() * 4;
      ctx.beginPath();
      ctx.moveTo(xx, y - 2);
      ctx.quadraticCurveTo(xx + 1, y - 2 - hh, xx + 3, y - 3 - hh);
      ctx.stroke();
    }
  }

  drawUnderside(ctx, u) {
    const T = TILE, th = this.theme;
    const xa = u.x0 * T + (u.openL ? 3 : 0), xb = (u.x1 + 1) * T - (u.openR ? 3 : 0), yb = (u.y + 1) * T;
    const wpx = xb - xa;
    const depth = Math.min(u.free * T - 10, wpx * 0.7 + 18, 6 * T);
    if (depth < 14) return;
    const rnd = U.rng(u.x0 * 733 + u.y * 37);
    const mid = (xa + xb) / 2;
    const tipX = mid + (rnd() - 0.5) * wpx * 0.25;
    const pts = [[xa, yb - 12]];
    const n = 6;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const half = (wpx / 2) * Math.pow(1 - t, 0.9);
      pts.push([U.lerp(mid, tipX, t) - half - rnd() * 5, yb - 6 + depth * t]);
    }
    pts.push([tipX, yb + depth]);
    for (let i = n - 1; i >= 1; i--) {
      const t = i / n;
      const half = (wpx / 2) * Math.pow(1 - t, 0.9);
      pts.push([U.lerp(mid, tipX, t) + half + rnd() * 5, yb - 6 + depth * t]);
    }
    pts.push([xb, yb - 12]);
    const path = new Path2D();
    smoothPoly(path, pts, true);
    ctx.fillStyle = U.shade(th.rock, -0.32);
    ctx.fill(path);
    ctx.save();
    ctx.clip(path);
    ctx.translate(-3, -3);
    ctx.fillStyle = th.rock;
    ctx.fill(path);
    ctx.translate(3, 3);
    ctx.strokeStyle = U.rgba(U.shade(th.rock, -0.35), 0.4);
    ctx.lineWidth = 2.5;
    for (let yy = yb + 8; yy < yb + depth; yy += 11 + rnd() * 7) {
      ctx.beginPath();
      ctx.moveTo(xa - 10, yy);
      for (let xx = xa; xx <= xb + 10; xx += 14) ctx.lineTo(xx, yy + (rnd() - 0.5) * 5);
      ctx.stroke();
    }
    for (let k = 0; k < wpx / 40; k++) {
      Clay.blob(ctx, xa + rnd() * wpx, yb + rnd() * depth * 0.6, 3 + rnd() * 3, 2.5 + rnd() * 2, U.shade(th.rock, 0.15), k + u.x0);
    }
    ctx.restore();
    ctx.strokeStyle = U.shade(th.rock, -0.5);
    ctx.lineWidth = 2;
    ctx.stroke(path);
    // dangling roots
    ctx.strokeStyle = U.shade(th.trunk || '#7a5236', -0.1);
    ctx.lineWidth = 2;
    const roots = 1 + Math.floor(wpx / 70);
    for (let k = 0; k < roots; k++) {
      const rx = xa + 12 + rnd() * (wpx - 24);
      const t = Math.abs(rx - mid) / (wpx / 2);
      const ry = yb - 6 + depth * (1 - t) * 0.85;
      const len = 10 + rnd() * 18;
      ctx.beginPath();
      ctx.moveTo(rx, ry - 4);
      ctx.quadraticCurveTo(rx + (rnd() - 0.5) * 12, ry + len * 0.6, rx + (rnd() - 0.5) * 8, ry + len);
      ctx.stroke();
    }
    // a pebble floating beneath bigger islands
    if (wpx > 120 && u.free > 3) {
      Clay.blob(ctx, tipX + (rnd() - 0.5) * 30, yb + depth + 14 + rnd() * 10, 5 + rnd() * 3, 4 + rnd() * 2, th.rock, u.x0 * 3);
    }
  }

  drawBaseClouds(ctx, u) {
    const T = TILE, th = this.theme;
    const yb = (u.y + 1) * T;
    const rnd = U.rng(u.x1 * 911 + u.y * 3);
    if (u.openL) {
      const cw = 42 + rnd() * 26;
      Clay.cloud(ctx, u.x0 * T - cw * 0.55, yb - 20, cw, cw * 0.45, th.cloud, th.cloudShade, u.x0 * 5 + u.y);
    }
    if (u.openR) {
      const cw = 42 + rnd() * 26;
      Clay.cloud(ctx, (u.x1 + 1) * T - cw * 0.45, yb - 18, cw, cw * 0.45, th.cloud, th.cloudShade, u.x1 * 5 + u.y);
    }
  }

  drawTiles(ctx, x0, x1) {
    const T = TILE, th = this.theme, grid = this.level.grid;
    const tx0 = Math.max(0, Math.floor(x0 / T)), tx1 = Math.min(this.level.w - 1, Math.floor(x1 / T));
    for (let ty = 0; ty < this.level.h; ty++) {
      let tx = tx0;
      while (tx <= tx1) {
        const c = grid[ty][tx];
        if (c === '=') {
          const s = tx;
          while (tx <= tx1 + 4 && tx < this.level.w && grid[ty][tx] === '=') tx++;
          // re-find the true start so a run split across chunks renders identically
          let rs = s;
          while (rs > 0 && grid[ty][rs - 1] === '=') rs--;
          let re = tx - 1;
          while (re < this.level.w - 1 && grid[ty][re + 1] === '=') re++;
          Clay.cloud(ctx, rs * T - 4, ty * T - 4, (re - rs + 1) * T + 8, 28, th.cloud, th.cloudShade, rs * 31 + ty);
          tx = re + 1;
          continue;
        }
        if (c === 'X') this.drawStone(ctx, tx, ty);
        else if (c === '^') this.drawThorn(ctx, tx, ty);
        tx++;
      }
    }
  }
  drawStone(ctx, tx, ty) {
    const T = TILE, th = this.theme;
    const v = (U.hash2(tx, ty, 21) - 0.5) * 0.12;
    Clay.block(ctx, tx * T + 0.5, ty * T + 0.5, T - 1, T - 1, U.shade(th.stone, v));
    ctx.strokeStyle = U.rgba(U.shade(th.stone, -0.5), 0.45);
    ctx.lineWidth = 1.4;
    if (U.hash2(tx, ty, 22) < 0.5) {
      ctx.beginPath();
      const cx = tx * T + 8 + U.hash2(tx, ty, 23) * 14;
      ctx.moveTo(cx, ty * T + 6);
      ctx.lineTo(cx + 4, ty * T + 13);
      ctx.lineTo(cx + 1, ty * T + 19);
      ctx.stroke();
    }
  }
  drawThorn(ctx, tx, ty) {
    const T = TILE, th = this.theme;
    const cx = tx * T + 16, cy = ty * T + 22;
    const rnd = U.rng(tx * 3 + ty * 7);
    ctx.fillStyle = U.shade(th.thorn, -0.2);
    for (let k = 0; k < 7; k++) {
      const a = -Math.PI + (k / 6) * Math.PI + (rnd() - 0.5) * 0.3;
      const len = 15 + rnd() * 5;
      const bx = cx + Math.cos(a) * 8, by = cy + Math.sin(a) * 6;
      const px = Math.cos(a + Math.PI / 2) * 4, py = Math.sin(a + Math.PI / 2) * 4;
      ctx.beginPath();
      ctx.moveTo(bx + px, by + py);
      ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      ctx.lineTo(bx - px, by - py);
      ctx.closePath();
      ctx.fill();
      Clay.blob(ctx, cx + Math.cos(a) * (len - 1), cy + Math.sin(a) * (len - 1), 1.6, 1.6, '#f2e6ff', k, { flat: true });
    }
    Clay.blob(ctx, cx, cy, 13, 9, th.thorn, tx * 13 + ty);
    Clay.blob(ctx, cx - 6, cy + 2, 6, 5, U.shade(th.thorn, 0.1), tx * 5 + ty);
  }

  drawDecor(ctx, d) {
    const th = this.theme;
    const rnd = U.rng(d.seed);
    switch (d.type) {
      case 'bush': {
        const s = d.size;
        Clay.blob(ctx, d.x - s * 0.7, d.y - s * 0.45, s * 0.75, s * 0.6, U.shade(th.leaf, -0.06), d.seed);
        Clay.blob(ctx, d.x + s * 0.7, d.y - s * 0.4, s * 0.7, s * 0.55, U.shade(th.leaf, -0.04), d.seed + 1);
        Clay.blob(ctx, d.x, d.y - s * 0.75, s * 0.9, s * 0.7, U.shade(th.leaf, 0.06), d.seed + 2);
        if (rnd() < 0.5) {
          for (let k = 0; k < 3; k++) Clay.blob(ctx, d.x + (rnd() - 0.5) * s * 1.6, d.y - s * (0.5 + rnd() * 0.6), 2, 2, th.flowers[k % th.flowers.length], k);
        }
        break;
      }
      case 'flower': {
        const col = th.flowers[d.color % th.flowers.length];
        const hgt = 8 + rnd() * 8;
        ctx.strokeStyle = U.shade(th.leaf, -0.25);
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y - 1);
        ctx.quadraticCurveTo(d.x + (rnd() - 0.5) * 6, d.y - hgt * 0.5, d.x, d.y - hgt);
        ctx.stroke();
        Clay.blob(ctx, d.x + 3, d.y - hgt * 0.45, 2.6, 1.4, th.leaf, d.seed, { flat: true });
        const s = d.size * 0.55;
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * TAU;
          Clay.blob(ctx, d.x + Math.cos(a) * s, d.y - hgt + Math.sin(a) * s, s * 0.75, s * 0.75, col, d.seed + k, { flat: true });
        }
        Clay.blob(ctx, d.x, d.y - hgt, s * 0.6, s * 0.6, '#ffd84a', d.seed + 9);
        break;
      }
      case 'tuft': {
        ctx.strokeStyle = U.shade(th.grass, -0.15);
        ctx.lineWidth = 2;
        for (let k = -1; k <= 1; k++) {
          ctx.beginPath();
          ctx.moveTo(d.x + k * 2, d.y - 1);
          ctx.quadraticCurveTo(d.x + k * 3, d.y - d.size * 0.6, d.x + k * 5, d.y - d.size);
          ctx.stroke();
        }
        break;
      }
      case 'shroom': {
        const s = d.size;
        Clay.blob(ctx, d.x, d.y - s * 0.6, s * 0.35, s * 0.7, '#fff1dc', d.seed);
        Clay.blob(ctx, d.x, d.y - s * 1.2, s, s * 0.6, '#e8564a', d.seed + 1);
        Clay.blob(ctx, d.x - s * 0.35, d.y - s * 1.35, s * 0.18, s * 0.14, '#ffffff', d.seed + 2, { flat: true });
        Clay.blob(ctx, d.x + s * 0.4, d.y - s * 1.2, s * 0.14, s * 0.12, '#ffffff', d.seed + 3, { flat: true });
        break;
      }
      case 'pebble':
        Clay.blob(ctx, d.x, d.y - d.size * 0.4, d.size * 1.3, d.size, U.shade(th.stone, -0.05), d.seed);
        break;
      case 'sign': {
        const x = d.x, y = d.y;
        ctx.fillStyle = '#7a5236';
        Clay.rrect(ctx, x - 2.5, y - 34, 5, 34, 2);
        ctx.fill();
        Clay.block(ctx, x - 17, y - 42, 34, 18, '#c8915c', { noPrint: true });
        ctx.fillStyle = '#5a3a2a';
        ctx.beginPath();
        ctx.moveTo(x - 8, y - 35);
        ctx.lineTo(x + 3, y - 35);
        ctx.lineTo(x + 3, y - 39);
        ctx.lineTo(x + 10, y - 33);
        ctx.lineTo(x + 3, y - 27);
        ctx.lineTo(x + 3, y - 31);
        ctx.lineTo(x - 8, y - 31);
        ctx.closePath();
        ctx.fill();
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Parallax sky, distant islands, clouds, the cloud sea and ambient weather.
class Backdrop {
  constructor(theme, levelH, seed) {
    this.theme = theme;
    this.levelH = levelH;
    this.seed = seed || 1;
    this.scale = 0;
    this.layerW = 1440;
    this.ambient = [];
    this.flash = 0;
    this.bolt = null;
    for (let i = 0; i < 46; i++) this.ambient.push(this.newAmbient(true));
  }
  ensure(scale) {
    const s = Math.min(scale, 1.5);
    if (s === this.scale) return;
    this.scale = s;
    this.build();
  }
  build() {
    const th = this.theme, s = this.scale, LW = this.layerW;
    const mk = (w, h) => {
      const c = Clay.makeCanvas(w * s, h * s);
      const g = c.getContext('2d');
      g.setTransform(s, 0, 0, s, 0, 0);
      g.lineJoin = 'round';
      return [c, g];
    };
    Clay.still = true;
    // sky
    {
      const [c, g] = mk(VIEW_W, VIEW_H);
      const grd = g.createLinearGradient(0, 0, 0, VIEW_H);
      grd.addColorStop(0, th.sky[0]);
      grd.addColorStop(0.55, th.sky[1]);
      grd.addColorStop(1, th.sky[2]);
      g.fillStyle = grd;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
      const sun = th.sun;
      const sx = sun.x * VIEW_W, sy = sun.y * VIEW_H;
      const glow = g.createRadialGradient(sx, sy, sun.r * 0.5, sx, sy, sun.r * 4);
      glow.addColorStop(0, sun.glow);
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
      Clay.blob(g, sx, sy, sun.r, sun.r, sun.color, 77, { sheen: 0.6, wob: 0.04 });
      if (sun.moon) {
        Clay.blob(g, sx - sun.r * 0.3, sy + sun.r * 0.2, sun.r * 0.18, sun.r * 0.16, U.shade(sun.color, -0.12), 3, { flat: true });
        Clay.blob(g, sx + sun.r * 0.35, sy - sun.r * 0.25, sun.r * 0.12, sun.r * 0.1, U.shade(sun.color, -0.12), 4, { flat: true });
        g.fillStyle = 'rgba(255,255,255,0.8)';
        const rnd = U.rng(9);
        for (let i = 0; i < 60; i++) {
          g.beginPath();
          g.arc(rnd() * VIEW_W, rnd() * VIEW_H * 0.55, rnd() * 1.4 + 0.3, 0, TAU);
          g.fill();
        }
      } else {
        // smiling sun face, very claymation
        g.fillStyle = U.shade(sun.color, -0.55);
        g.beginPath();
        g.ellipse(sx - sun.r * 0.3, sy - sun.r * 0.1, sun.r * 0.07, sun.r * 0.12, 0, 0, TAU);
        g.ellipse(sx + sun.r * 0.3, sy - sun.r * 0.1, sun.r * 0.07, sun.r * 0.12, 0, 0, TAU);
        g.fill();
        g.strokeStyle = U.shade(sun.color, -0.55);
        g.lineWidth = 2.5;
        g.lineCap = 'round';
        g.beginPath();
        g.arc(sx, sy + sun.r * 0.12, sun.r * 0.3, 0.2 * Math.PI, 0.8 * Math.PI);
        g.stroke();
        g.fillStyle = 'rgba(255,140,140,0.35)';
        g.beginPath();
        g.ellipse(sx - sun.r * 0.5, sy + sun.r * 0.15, sun.r * 0.13, sun.r * 0.08, 0, 0, TAU);
        g.ellipse(sx + sun.r * 0.5, sy + sun.r * 0.15, sun.r * 0.13, sun.r * 0.08, 0, 0, TAU);
        g.fill();
      }
      this.sky = c;
    }
    const rnd = U.rng(this.seed * 101);
    // far clouds
    {
      const [c, g] = mk(LW, VIEW_H);
      g.globalAlpha = 0.85;
      for (let i = 0; i < 9; i++) {
        const w = 160 + rnd() * 220;
        const x = (i / 9) * LW + rnd() * 60;
        const y = 70 + rnd() * 200;
        for (const ox of [0, -LW, LW]) Clay.cloud(g, x + ox, y, w, w * 0.32, th.far, th.farShade, 400 + i);
      }
      this.farLayer = c;
    }
    // distant floating islands
    {
      const [c, g] = mk(LW, VIEW_H);
      const pal = {
        grass: U.mix(th.distant.grass, th.distantFade, 0.25),
        dirt: U.mix(th.distant.dirt, th.distantFade, 0.25),
        rock: U.mix(th.distant.rock, th.distantFade, 0.3),
        leaf: U.mix(th.distant.grass, th.distantFade, 0.1),
        trunk: U.mix('#8a5a3c', th.distantFade, 0.4),
      };
      const n = 6;
      for (let i = 0; i < n; i++) {
        const w = 70 + rnd() * 110;
        const x = ((i + 0.5) / n) * LW + (rnd() - 0.5) * 80;
        const y = 170 + rnd() * 170;
        const hgt = w * (0.55 + rnd() * 0.25);
        const treeSize = 16 + rnd() * 6;
        const draw = (ox) => {
          Clay.island(g, x + ox, y, w, hgt, pal, 900 + i, { band: 12, cloudColor: th.far, cloudShade: th.farShade });
          if (th.castles && i % 2 === 0) this.drawCastle(g, x + ox, y, w * 0.5, pal);
          else if (th.windmills && i % 2 === 1) this.drawWindmill(g, x + ox + w * 0.15, y, pal);
          else Clay.tree(g, x + ox - w * 0.2, y + 2, treeSize, pal, i * 7);
        };
        draw(0);
        if (x + w > LW - 40) draw(-LW);
        if (x - w < 40) draw(LW);
      }
      this.islandLayer = c;
    }
    // mid clouds near the horizon
    {
      const [c, g] = mk(LW, VIEW_H);
      for (let i = 0; i < 8; i++) {
        const w = 200 + rnd() * 160;
        const x = (i / 8) * LW + rnd() * 80;
        const y = 330 + rnd() * 110;
        for (const ox of [0, -LW, LW]) Clay.cloud(g, x + ox, y, w, w * 0.3, th.mid, th.midShade, 700 + i);
      }
      this.midLayer = c;
    }
    // cloud sea strip
    {
      const H = 190;
      const [c, g] = mk(LW, H);
      for (let row = 0; row < 3; row++) {
        for (let i = 0; i < 14; i++) {
          const w = 130 + rnd() * 90;
          const x = (i / 14) * LW + (rnd() - 0.5) * 40;
          const y = 8 + row * 45 + rnd() * 12;
          for (const ox of [0, -LW, LW]) Clay.cloud(g, x + ox, y, w, 60, row === 0 ? th.sea : U.shade(th.sea, -0.03 * row), th.seaShade, 1200 + row * 50 + i);
        }
      }
      g.fillStyle = th.sea;
      g.fillRect(0, 110, LW, H - 110);
      this.seaLayer = c;
      this.seaH = H;
    }
    Clay.still = false;
  }
  drawCastle(g, x, y, w, pal) {
    const col = U.shade(pal.rock, 0.08);
    g.fillStyle = U.shade(col, -0.2);
    Clay.rrect(g, x - w / 2, y - w * 0.55, w, w * 0.6, 4);
    g.fill();
    for (const k of [-0.5, 0, 0.5]) {
      g.fillStyle = U.shade(col, -0.1);
      Clay.rrect(g, x + k * w * 0.8 - 7, y - w * 0.95 - (k === 0 ? 12 : 0), 14, w * 0.5, 3);
      g.fill();
      g.fillStyle = U.shade(col, -0.3);
      g.beginPath();
      g.moveTo(x + k * w * 0.8 - 10, y - w * 0.95 - (k === 0 ? 12 : 0));
      g.lineTo(x + k * w * 0.8, y - w * 1.25 - (k === 0 ? 12 : 0));
      g.lineTo(x + k * w * 0.8 + 10, y - w * 0.95 - (k === 0 ? 12 : 0));
      g.fill();
    }
    g.fillStyle = 'rgba(255,220,140,0.7)';
    g.fillRect(x - 3, y - w * 0.4, 6, 8);
  }
  drawWindmill(g, x, y, pal) {
    g.fillStyle = U.shade(pal.dirt, 0.2);
    g.beginPath();
    g.moveTo(x - 8, y);
    g.lineTo(x - 5, y - 34);
    g.lineTo(x + 5, y - 34);
    g.lineTo(x + 8, y);
    g.fill();
    g.strokeStyle = U.shade(pal.rock, 0.3);
    g.lineWidth = 3;
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + 0.3;
      g.beginPath();
      g.moveTo(x, y - 34);
      g.lineTo(x + Math.cos(a) * 20, y - 34 + Math.sin(a) * 20);
      g.stroke();
    }
  }

  // Screen-space background; cam is the level camera.
  drawBack(ctx, cam) {
    ctx.drawImage(this.sky, 0, 0, VIEW_W, VIEW_H);
    const P = CFG.parallax;
    const baseY = Math.max(0, this.levelH - VIEW_H);
    const dy = (f) => (baseY - cam.y) * f * P;
    const layer = (img, f, fy) => {
      const LW = this.layerW;
      let x = -((cam.x * f * P) % LW);
      if (x > 0) x -= LW;
      const y = dy(fy);
      for (; x < VIEW_W; x += LW) ctx.drawImage(img, x, y, LW, VIEW_H);
    };
    layer(this.farLayer, 0.05, 0.03);
    layer(this.islandLayer, 0.16, 0.1);
    layer(this.midLayer, 0.34, 0.22);
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,250,255,${this.flash * 0.45})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      if (this.bolt) this.drawBolt(ctx);
    }
  }
  drawBolt(ctx) {
    ctx.save();
    ctx.strokeStyle = `rgba(255,255,230,${this.flash})`;
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    this.bolt.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.restore();
  }
  // World-space cloud sea along the bottom of the level (drawn over the action).
  drawSea(ctx, cam, time) {
    const LW = this.layerW;
    const y = this.levelH - 92;
    if (y > cam.y + VIEW_H) return;
    let x = cam.x - ((cam.x + time * 9) % LW);
    for (; x < cam.x + VIEW_W; x += LW) ctx.drawImage(this.seaLayer, x, y, LW, this.seaH);
  }

  newAmbient(init) {
    const kind = this.theme.ambient;
    const p = { x: Math.random() * VIEW_W, y: init ? Math.random() * VIEW_H : -10, kind, t: Math.random() * 100 };
    if (kind === 'rain') {
      p.vy = 9 + Math.random() * 4;
      p.vx = -2.2;
      p.len = 10 + Math.random() * 8;
    } else if (kind === 'leaves') {
      p.x = init ? p.x : VIEW_W + 10;
      p.y = Math.random() * VIEW_H;
      p.vx = -1.5 - Math.random() * 2;
      p.vy = 0.3 + Math.random() * 0.4;
      p.size = 3 + Math.random() * 2;
    } else if (kind === 'sparkle') {
      p.vy = -0.2 - Math.random() * 0.3;
      p.vx = 0;
      p.size = 1 + Math.random() * 2;
      p.y = init ? p.y : VIEW_H + 10;
    } else {
      p.vy = -0.15 - Math.random() * 0.25;
      p.vx = 0.15;
      p.size = 1 + Math.random() * 1.6;
      p.y = init ? p.y : VIEW_H + 10;
    }
    return p;
  }
  update(camDX) {
    for (let i = 0; i < this.ambient.length; i++) {
      const p = this.ambient[i];
      p.t += 1;
      p.x += p.vx - camDX * 0.6 + (p.kind === 'pollen' || p.kind === 'sparkle' ? Math.sin(p.t * 0.03) * 0.3 : 0);
      p.y += p.vy + (p.kind === 'leaves' ? Math.sin(p.t * 0.05) * 0.6 : 0);
      if (p.y > VIEW_H + 20 || p.y < -20 || p.x < -30 || p.x > VIEW_W + 30) this.ambient[i] = this.newAmbient(false);
    }
    if (this.theme.lightning) {
      if (this.flash > 0) this.flash = Math.max(0, this.flash - 0.04);
      else if (Math.random() < 0.0022) {
        this.flash = 1;
        let x = 100 + Math.random() * (VIEW_W - 200), y = 0;
        this.bolt = [[x, y]];
        while (y < VIEW_H * 0.55) {
          y += 20 + Math.random() * 30;
          x += (Math.random() - 0.5) * 50;
          this.bolt.push([x, y]);
        }
        Sound.play('thunder');
      }
    }
  }
  drawAmbient(ctx) {
    const amt = CFG.particles;
    if (amt <= 0) return;
    const n = Math.min(this.ambient.length, Math.round(this.ambient.length * Math.min(1, amt)));
    ctx.save();
    for (let i = 0; i < n; i++) {
      const p = this.ambient[i];
      if (p.kind === 'rain') {
        ctx.strokeStyle = 'rgba(220,210,255,0.45)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.vx * 1.5, p.y + p.len);
        ctx.stroke();
      } else if (p.kind === 'leaves') {
        ctx.fillStyle = i % 3 ? 'rgba(110,190,80,0.8)' : 'rgba(250,200,90,0.8)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.size, p.size * 0.55, p.t * 0.08, 0, TAU);
        ctx.fill();
      } else {
        const a = 0.35 + 0.35 * Math.sin(p.t * 0.07);
        ctx.fillStyle = p.kind === 'sparkle' ? `rgba(255,240,170,${a})` : `rgba(255,250,230,${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
