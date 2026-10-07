'use strict';
// Claymation rendering toolkit.
// Every shape is a lumpy "blob" whose outline jitters a little on each stop-motion frame
// (the "boil" of hand-animated clay), shaded with a dark rim, a lit face, a soft sheen
// and a tiny specular dot, then dusted with grain and thumbprints.

const FONT = '"Fredoka", "Baloo 2", "Trebuchet MS", "Arial Rounded MT Bold", system-ui, sans-serif';
const TAU = Math.PI * 2;

const Clay = {
  boil: 0, // current stop-motion frame index
  time: 0, // seconds since boot
  still: false, // true while baking static art: shapes keep their lumps but stop boiling
  _n: 12,
  _cos: null,
  _sin: null,
  _px: null,
  _py: null,
  grainCanvas: null,
  shadowCanvas: null,
  _patterns: new WeakMap(),

  init() {
    const n = this._n;
    this._cos = new Float32Array(n);
    this._sin = new Float32Array(n);
    this._px = new Float32Array(n);
    this._py = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this._cos[i] = Math.cos((i / n) * TAU);
      this._sin[i] = Math.sin((i / n) * TAU);
    }
    this.grainCanvas = this.makeGrain(160);
    this.filmCanvas = this.makeFilmGrain(192);
    this.shadowCanvas = this.makeShadow();
  },

  setTime(t) {
    this.time = t;
    this.boil = Math.floor(t * CFG.boilFps);
  },

  makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  },

  // Small per-frame positional jitter for a part, in pixels.
  jit(seed, amt = 0.5) {
    if (this.still) return 0;
    return (U.hash(seed * 31 + this.boil * 7) - 0.5) * amt * CFG.boilAmount;
  },

  // ---------- paths ----------
  blobPath(ctx, cx, cy, rx, ry, seed, wob) {
    const n = this._n, px = this._px, py = this._py;
    const b = this.still ? 0 : this.boil;
    const amp = wob === undefined ? 0.075 * CFG.boilAmount : wob;
    for (let i = 0; i < n; i++) {
      const r = 1 + (U.hash(seed * 7919 + i * 131 + b * 977) - 0.5) * amp;
      px[i] = cx + this._cos[i] * rx * r;
      py[i] = cy + this._sin[i] * ry * r;
    }
    ctx.beginPath();
    ctx.moveTo((px[n - 1] + px[0]) / 2, (py[n - 1] + py[0]) / 2);
    for (let i = 0; i < n; i++) {
      const j = i + 1 === n ? 0 : i + 1;
      ctx.quadraticCurveTo(px[i], py[i], (px[i] + px[j]) / 2, (py[i] + py[j]) / 2);
    }
    ctx.closePath();
  },
  ellipsePath(ctx, cx, cy, rx, ry, rot = 0) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU);
  },
  rrect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  },

  // ---------- shaded primitives ----------
  // A shaded lump of clay. opts: {flat, sheen (0..1), wob}
  blob(ctx, cx, cy, rx, ry, color, seed = 1, opts) {
    const wob = opts && opts.wob;
    ctx.fillStyle = U.shade(color, -0.3);
    this.blobPath(ctx, cx, cy, rx + 0.7, ry + 0.7, seed, wob);
    ctx.fill();
    ctx.fillStyle = color;
    this.blobPath(ctx, cx - rx * 0.06, cy - ry * 0.1, rx * 0.9, ry * 0.86, seed, wob);
    ctx.fill();
    if (opts && opts.flat) return;
    if (rx > 2.2 && ry > 2.2) {
      const sheen = opts && opts.sheen !== undefined ? opts.sheen : 1;
      ctx.fillStyle = `rgba(255,255,255,${0.24 * sheen})`;
      this.ellipsePath(ctx, cx - rx * 0.3, cy - ry * 0.42, rx * 0.38, ry * 0.2, -0.45);
      ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.6 * sheen})`;
      this.ellipsePath(ctx, cx - rx * 0.42, cy - ry * 0.5, Math.max(0.8, rx * 0.1), Math.max(0.6, ry * 0.065), -0.45);
      ctx.fill();
    }
  },

  // Rounded clay cube (blocks, plaques).
  block(ctx, x, y, w, h, color, opts) {
    const r = Math.min(w, h) * 0.24;
    ctx.fillStyle = U.shade(color, -0.34);
    this.rrect(ctx, x, y, w, h, r);
    ctx.fill();
    ctx.fillStyle = color;
    this.rrect(ctx, x + 1, y + 0.5, w - 3.5, h - 4.5, r * 0.9);
    ctx.fill();
    ctx.fillStyle = U.shade(color, 0.2);
    this.rrect(ctx, x + 3.5, y + 2.5, w - 11, Math.max(3, h * 0.26), r * 0.6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    this.ellipsePath(ctx, x + 6, y + 5, 2, 1.3, -0.4);
    ctx.fill();
    if (!opts || !opts.noPrint) this.thumbprint(ctx, x + w * 0.65, y + h * 0.62, Math.min(w, h) * 0.22, (x * 7 + y * 13) | 0, 0.07);
  },

  // Concentric partial ellipses, like a fingerprint pressed into soft clay.
  thumbprint(ctx, x, y, r, seed, alpha = 0.08) {
    ctx.save();
    ctx.strokeStyle = `rgba(50,25,40,${alpha})`;
    ctx.lineWidth = 0.9;
    const rot = U.hash(seed) * TAU;
    for (let k = 0; k < 5; k++) {
      const rr = r * (0.3 + k * 0.17);
      ctx.beginPath();
      ctx.ellipse(x, y, rr, rr * 0.72, rot, 0.4 + k * 0.2, Math.PI * 1.55 + k * 0.1);
      ctx.stroke();
    }
    ctx.restore();
  },

  // Soft contact shadow under characters.
  shadow(ctx, cx, y, w, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.shadowCanvas, cx - w / 2, y - w * 0.12, w, w * 0.24);
    ctx.globalAlpha = 1;
  },

  // ---------- textures ----------
  makeGrain(size) {
    const c = this.makeCanvas(size, size);
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const d = img.data;
    const rnd = U.rng(1234);
    for (let i = 0; i < size * size; i++) {
      const r = rnd();
      let v = 0, a = 0;
      if (r < 0.1) {
        v = 40;
        a = 28 + rnd() * 40;
      } else if (r > 0.93) {
        v = 255;
        a = 18 + rnd() * 30;
      }
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
      d[i * 4 + 3] = a;
    }
    g.putImageData(img, 0, 0);
    // Soft blotches, wrapped so the pattern tiles seamlessly.
    for (let k = 0; k < 22; k++) {
      const x = rnd() * size, y = rnd() * size, rr = 6 + rnd() * 18;
      g.fillStyle = rnd() < 0.55 ? 'rgba(70,35,40,0.06)' : 'rgba(255,255,255,0.06)';
      for (const ox of [-size, 0, size]) {
        for (const oy of [-size, 0, size]) {
          g.beginPath();
          g.ellipse(x + ox, y + oy, rr, rr * 0.7, rnd() * 3, 0, TAU);
          g.fill();
        }
      }
    }
    return c;
  },
  // Fine, blotch-free noise for the full-screen film grain.
  makeFilmGrain(size) {
    const c = this.makeCanvas(size, size);
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const d = img.data;
    const rnd = U.rng(98765);
    for (let i = 0; i < size * size; i++) {
      const v = rnd() < 0.5 ? 0 : 255;
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
      d[i * 4 + 3] = rnd() * 34;
    }
    g.putImageData(img, 0, 0);
    return c;
  },
  makeShadow() {
    const c = this.makeCanvas(64, 16);
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 8, 1, 32, 8, 32);
    grd.addColorStop(0, 'rgba(40,20,50,0.38)');
    grd.addColorStop(0.6, 'rgba(40,20,50,0.16)');
    grd.addColorStop(1, 'rgba(40,20,50,0)');
    g.setTransform(1, 0, 0, 0.25, 0, 6);
    g.fillStyle = grd;
    g.fillRect(0, -24, 64, 64);
    return c;
  },
  grainPattern(ctx, film) {
    let p = this._patterns.get(ctx);
    if (!p) {
      p = { clay: ctx.createPattern(this.grainCanvas, 'repeat'), film: ctx.createPattern(this.filmCanvas, 'repeat') };
      this._patterns.set(ctx, p);
    }
    return film ? p.film : p.clay;
  },
  // Dusts grain onto everything already drawn inside the rect.
  applyGrain(ctx, x, y, w, h, alpha = 1) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.grainPattern(ctx);
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  },

  // ---------- text ----------
  // Chunky extruded clay lettering.
  text(ctx, str, x, y, size, color, o = {}) {
    ctx.save();
    ctx.font = `${o.weight || 700} ${size}px ${FONT}`;
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = o.baseline || 'middle';
    ctx.lineJoin = 'round';
    const depth = o.depth !== undefined ? o.depth : Math.max(2, Math.round(size * 0.09));
    const dark = o.dark || U.shade(color, -0.5);
    ctx.fillStyle = dark;
    ctx.strokeStyle = dark;
    ctx.lineWidth = Math.max(2, size * 0.16);
    for (let d = depth; d >= 1; d--) {
      ctx.strokeText(str, x + d * 0.35, y + d);
      ctx.fillText(str, x + d * 0.35, y + d);
    }
    ctx.strokeText(str, x, y);
    const grad = ctx.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5);
    grad.addColorStop(0, U.shade(color, 0.4));
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, U.shade(color, -0.12));
    ctx.fillStyle = grad;
    ctx.fillText(str, x, y);
    ctx.restore();
  },
  // Small outlined label for HUD and captions.
  label(ctx, str, x, y, size, color = '#fff8ec', align = 'left', outline = '#3b2440') {
    ctx.save();
    ctx.font = `700 ${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = outline;
    ctx.lineWidth = Math.max(2.5, size * 0.22);
    ctx.strokeText(str, x, y + 1);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.restore();
  },
  wrapText(ctx, str, maxW) {
    const words = str.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) {
        lines.push(line);
        line = w;
      } else line = t;
    }
    if (line) lines.push(line);
    return lines;
  },

  // ---------- scenery ----------
  // A row of clay cloud puffs filling (x, y, w, h).
  // opts.outline: a color for a soft rim that lifts gameplay clouds off the backdrop.
  cloud(ctx, x, y, w, h, base, shadeCol, seed, opts) {
    const rnd = U.rng(seed);
    const n = Math.max(2, Math.round(w / (h * 0.9)));
    const puffs = [];
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const r = h * (0.42 + rnd() * 0.2);
      puffs.push([x + t * w, y + h * 0.55 - Math.sin(t * Math.PI) * h * 0.1, r, seed * 13 + i]);
    }
    if (opts && opts.outline) {
      ctx.fillStyle = opts.outline;
      for (const [px, py, r, s] of puffs) {
        this.blobPath(ctx, px + 1, py + h * 0.1, r + 2.2, r * 0.88 + 2.2, s, 0.09);
        ctx.fill();
      }
      this.rrect(ctx, x - 2.2, y + h * 0.42 - 2.2, w + 4.4, h * 0.58 + 4.4, h * 0.3);
      ctx.fill();
    }
    ctx.fillStyle = shadeCol;
    for (const [px, py, r, s] of puffs) {
      this.blobPath(ctx, px + 1, py + h * 0.1, r, r * 0.88, s, 0.09);
      ctx.fill();
    }
    this.rrect(ctx, x, y + h * 0.42, w, h * 0.58, h * 0.28);
    ctx.fill();
    ctx.fillStyle = base;
    for (const [px, py, r, s] of puffs) {
      this.blobPath(ctx, px - 1, py - 1.5, r * 0.9, r * 0.8, s, 0.09);
      ctx.fill();
    }
    this.rrect(ctx, x + 2, y + h * 0.4, w - 4, h * 0.42, h * 0.2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (const [px, py, r] of puffs) {
      this.ellipsePath(ctx, px - r * 0.35, py - r * 0.45, r * 0.32, r * 0.16, -0.3);
      ctx.fill();
    }
  },

  // A floating island seen from the side: grassy cap, dirt band, tapering rocky root,
  // and cloud puffs hugging its base. Used by the world map and the background layers.
  island(ctx, cx, top, w, h, pal, seed, opts = {}) {
    const rnd = U.rng(seed);
    const x0 = cx - w / 2, x1 = cx + w / 2;
    const band = Math.min(h * 0.3, opts.band || 26);
    // root
    const pts = [];
    const steps = 7;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const yy = top + band * 0.6 + (h - band * 0.6) * Math.pow(t, 1.25);
      const half = (w / 2) * (1 - Math.pow(t, 0.8)) * (0.92 + rnd() * 0.12);
      pts.push([yy, half]);
    }
    const tipX = cx + (rnd() - 0.5) * w * 0.12;
    const rootPath = () => {
      ctx.beginPath();
      ctx.moveTo(x0 + 4, top + band * 0.5);
      for (let i = 1; i <= steps; i++) {
        const [yy, half] = pts[i];
        const lx = U.lerp(cx, tipX, i / steps) - half;
        ctx.lineTo(lx + (rnd() - 0.5) * 3, yy);
      }
      for (let i = steps; i >= 1; i--) {
        const [yy, half] = pts[i];
        const rx = U.lerp(cx, tipX, i / steps) + half;
        ctx.lineTo(rx + (rnd() - 0.5) * 3, yy);
      }
      ctx.lineTo(x1 - 4, top + band * 0.5);
      ctx.closePath();
    };
    ctx.save();
    ctx.lineJoin = 'round';
    rootPath();
    ctx.fillStyle = U.shade(pal.rock, -0.25);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = pal.rock;
    ctx.translate(-3, -2);
    rootPath();
    ctx.fill();
    ctx.restore();
    // strata
    ctx.save();
    rootPath();
    ctx.clip();
    ctx.strokeStyle = U.rgba(U.shade(pal.rock, -0.35), 0.35);
    ctx.lineWidth = 2;
    for (let yy = top + band + 10; yy < top + h; yy += 12 + rnd() * 8) {
      ctx.beginPath();
      ctx.moveTo(x0, yy);
      for (let xx = x0; xx <= x1; xx += 16) ctx.lineTo(xx, yy + (rnd() - 0.5) * 4);
      ctx.stroke();
    }
    ctx.restore();
    // dirt band
    ctx.fillStyle = U.shade(pal.dirt, -0.25);
    this.rrect(ctx, x0, top, w, band, band * 0.5);
    ctx.fill();
    ctx.fillStyle = pal.dirt;
    this.rrect(ctx, x0 + 1, top - 1, w - 3, band - 3, band * 0.45);
    ctx.fill();
    // grass cap with drips
    const capH = Math.max(7, band * 0.45);
    ctx.fillStyle = U.shade(pal.grass, -0.22);
    ctx.beginPath();
    ctx.moveTo(x0 - 2, top + 3);
    for (let xx = x0; xx <= x1; xx += 10) ctx.quadraticCurveTo(xx + 5, top - 4 - rnd() * 2, xx + 10, top - 1);
    let xx = x1 + 2;
    ctx.lineTo(xx, top + capH * 0.7);
    while (xx > x0) {
      const step = 8 + rnd() * 9;
      const drip = rnd() < 0.22 ? capH * (0.5 + rnd() * 0.6) : 0;
      ctx.quadraticCurveTo(xx - step / 2, top + capH + drip, xx - step, top + capH * (0.65 + rnd() * 0.2));
      xx -= step;
    }
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.translate(0, -2.2);
    ctx.fillStyle = pal.grass;
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = U.rgba(U.shade(pal.grass, 0.35), 0.8);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0 + 6, top - 1);
    ctx.lineTo(x1 - 8, top - 1);
    ctx.stroke();
    // base clouds
    if (!opts.noClouds) {
      const cs = opts.cloudShade || '#d8d0ee';
      const cb = opts.cloudColor || '#ffffff';
      const cw = Math.min(70, w * 0.35);
      this.cloud(ctx, x0 - cw * 0.35, top + band * 0.4, cw, cw * 0.42, cb, cs, seed + 1);
      this.cloud(ctx, x1 - cw * 0.65, top + band * 0.55, cw, cw * 0.42, cb, cs, seed + 2);
    }
    ctx.restore();
  },

  // Clay tree: trunk plus lumpy canopy.
  tree(ctx, x, groundY, size, pal, seed) {
    const rnd = U.rng(seed);
    ctx.fillStyle = U.shade(pal.trunk || '#8a5a3c', -0.25);
    this.rrect(ctx, x - size * 0.12, groundY - size * 0.9, size * 0.24, size * 0.95, size * 0.1);
    ctx.fill();
    ctx.fillStyle = pal.trunk || '#8a5a3c';
    this.rrect(ctx, x - size * 0.12, groundY - size * 0.9, size * 0.17, size * 0.9, size * 0.08);
    ctx.fill();
    const leaf = pal.leaf || pal.grass;
    const blobs = 3 + Math.floor(rnd() * 2);
    for (let i = 0; i < blobs; i++) {
      const a = (i / blobs) * Math.PI - Math.PI;
      const bx = x + Math.cos(a) * size * 0.32 + (rnd() - 0.5) * 4;
      const by = groundY - size * 1.05 + Math.sin(a) * size * 0.25;
      this.blob(ctx, bx, by, size * (0.34 + rnd() * 0.1), size * (0.3 + rnd() * 0.08), U.shade(leaf, (rnd() - 0.5) * 0.12), seed * 5 + i);
    }
    this.blob(ctx, x, groundY - size * 1.2, size * 0.4, size * 0.34, U.shade(leaf, 0.06), seed * 5 + 9);
  },

  // Wobbly iris for screen transitions; r is the hole radius.
  iris(ctx, cx, cy, r, color = '#2b1838') {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.rect(-10, -10, VIEW_W + 20, VIEW_H + 20);
    if (r > 0.5) {
      const n = 24;
      for (let i = 0; i <= n; i++) {
        const a = -(i / n) * TAU;
        const rr = r * (1 + (U.hash(i * 17 + this.boil * 3) - 0.5) * 0.06);
        const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    }
    ctx.fill('evenodd');
    ctx.restore();
  },
};
