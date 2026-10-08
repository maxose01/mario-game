'use strict';
// Track geometry and queries (pure: no rendering, shared with the Node tests).
// A track is drawn like a turtle walk (straights and arcs), auto-closed into a smooth loop (or
// left open for a point-to-point run) and resampled every unit. Hidden routes are branches drawn
// relative to the main road. Physics then asks: which road am I on, how far along and
// off-centre, what surface, how high is the ground.
//
// Banking: each sample has a bank slope (tan of the bank angle, + = right side low), so the
// ground at d units right of the centre line is at y - d * bank. point() and project() return
// that banked height in .y (and the centre height in .yc), so physics needs no special cases.

const TRACK_STEP = 1; // units between samples

class TrackPath {
  // pts: dense polyline [{x, y, z, hw, sh, wallL, wallR, bank, ag, style}]
  constructor(id, pts, closed) {
    this.id = id;
    this.closed = closed;
    this.index = 0;
    this.resample(pts);
    this.computeFrames();
    this.zones = [];
  }

  resample(pts) {
    const src = closed(pts, this.closed);
    const cum = [0];
    for (let i = 1; i < src.length; i++) {
      const a = src[i - 1], b = src[i];
      cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
    }
    const L = cum[cum.length - 1];
    const n = this.closed ? Math.max(8, Math.round(L / TRACK_STEP)) : Math.max(2, Math.round(L / TRACK_STEP) + 1);
    const step = this.closed ? L / n : L / (n - 1);
    this.n = n;
    this.step = step;
    this.length = L;
    const A = (T) => new T(n);
    this.x = A(Float32Array); this.y = A(Float32Array); this.z = A(Float32Array);
    this.hw = A(Float32Array); this.sh = A(Float32Array);
    this.s = A(Float32Array);
    this.wallL = A(Uint8Array); this.wallR = A(Uint8Array); // 1 wall, 0 drop, 2 open (joins another road)
    this.bank = A(Float32Array); // tan(bank angle), + = right side low
    this.ag = A(Uint8Array); // 1 = anti-gravity
    this.style = new Array(n); // road style name per sample (rendering only)
    let j = 0;
    for (let i = 0; i < n; i++) {
      const target = i * step;
      while (j < cum.length - 2 && cum[j + 1] < target) j++;
      const seg = cum[j + 1] - cum[j] || 1;
      const t = Math.min(1, Math.max(0, (target - cum[j]) / seg));
      const a = src[j], b = src[j + 1];
      this.x[i] = a.x + (b.x - a.x) * t;
      this.y[i] = a.y + (b.y - a.y) * t;
      this.z[i] = a.z + (b.z - a.z) * t;
      this.hw[i] = a.hw + (b.hw - a.hw) * t;
      this.sh[i] = a.sh + (b.sh - a.sh) * t;
      this.bank[i] = (a.bank || 0) + ((b.bank || 0) - (a.bank || 0)) * t;
      const c = t < 0.5 ? a : b;
      this.wallL[i] = c.wallL ? 1 : 0;
      this.wallR[i] = c.wallR ? 1 : 0;
      this.ag[i] = c.ag ? 1 : 0;
      this.style[i] = c.style || 'road';
      this.s[i] = target;
    }
  }

  // Ease the bank profile with a box filter (twice) so transitions between segments are smooth
  // and a run of banked arcs stays banked.
  smoothBank(radius) {
    const r = Math.max(1, Math.round(radius / this.step));
    for (let pass = 0; pass < 2; pass++) {
      const src = Float32Array.from(this.bank);
      for (let i = 0; i < this.n; i++) {
        let sum = 0;
        for (let k = -r; k <= r; k++) sum += src[this.wrap(i + k)];
        this.bank[i] = sum / (2 * r + 1);
      }
    }
  }

  computeFrames() {
    const n = this.n;
    this.tx = new Float32Array(n); this.tz = new Float32Array(n);
    this.nx = new Float32Array(n); this.nz = new Float32Array(n);
    this.curv = new Float32Array(n); this.slope = new Float32Array(n);
    this.head = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = this.wrap(i - 1), b = this.wrap(i + 1);
      let dx = this.x[b] - this.x[a], dz = this.z[b] - this.z[a];
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      this.tx[i] = dx; this.tz[i] = dz;
      this.nx[i] = -dz; this.nz[i] = dx; // right-hand side of the direction of travel
      this.head[i] = Math.atan2(dz, dx);
      this.slope[i] = (this.y[b] - this.y[a]) / (l || 1);
    }
    for (let i = 0; i < n; i++) {
      const a = this.wrap(i - 2), b = this.wrap(i + 2);
      let dh = this.head[b] - this.head[a];
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      this.curv[i] = dh / (4 * this.step); // + turns right
    }
  }

  wrap(i) {
    if (this.closed) return ((i % this.n) + this.n) % this.n;
    return i < 0 ? 0 : i >= this.n ? this.n - 1 : i;
  }
  indexAt(s) {
    if (this.closed) s = ((s % this.length) + this.length) % this.length;
    return this.wrap(Math.round(s / this.step));
  }
  // World position of a point s along and d to the right of the centre line.
  point(s, d = 0, out = {}) {
    if (this.closed) s = ((s % this.length) + this.length) % this.length;
    else s = Math.max(0, Math.min(this.length, s));
    const f = s / this.step;
    const i0 = this.wrap(Math.floor(f)), i1 = this.wrap(Math.floor(f) + 1);
    const t = this.closed || i1 !== i0 ? f - Math.floor(f) : 0;
    const L = (arr) => arr[i0] + (arr[i1] - arr[i0]) * t;
    let nx = L(this.nx), nz = L(this.nz);
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl;
    nz /= nl;
    out.x = L(this.x) + nx * d;
    out.z = L(this.z) + nz * d;
    out.yc = L(this.y);
    out.bank = L(this.bank);
    out.y = out.yc - d * out.bank;
    out.hw = L(this.hw);
    out.sh = L(this.sh);
    out.tx = nz; // n = (-tz, tx)
    out.tz = -nx;
    out.nx = nx;
    out.nz = nz;
    out.head = Math.atan2(out.tz, out.tx);
    out.i = t < 0.5 ? i0 : i1;
    return out;
  }
}

function closed(pts, isClosed) {
  if (!isClosed) return pts;
  const a = pts[0], b = pts[pts.length - 1];
  if (Math.hypot(a.x - b.x, a.z - b.z) < 1e-3) return pts;
  return pts.concat([Object.assign({}, a)]);
}

// ---------------------------------------------------------------------------
// Turtle builder: segments are {s: len} straights or {r|l: degrees, rad} arcs, with optional
// end elevation y, end half-width hw, shoulder sh, and wall flags for the segment.
// Bank slope for a segment: degrees -> tan, tilted into an arc's turn (or by sign on straights).
function segBank(seg) {
  const deg = seg.bank || 0;
  if (!deg) return 0;
  const turnSign = seg.r ? 1 : seg.l ? -1 : 0;
  const dir = turnSign ? turnSign * Math.sign(deg) : Math.sign(deg);
  return dir * Math.tan((Math.min(75, Math.abs(deg)) * Math.PI) / 180);
}

function walkTurtle(def, lengths) {
  const pts = [];
  let x = 0, z = 0, h = def.heading || 0, y = def.y || 0;
  let hw = def.hw, sh = def.sh;
  const marks = [];
  let s = 0;
  const seg0 = def.segments[0] || {};
  pts.push({ x, z, y, hw, sh, wallL: def.wallL, wallR: def.wallR, bank: segBank(seg0), ag: seg0.antigrav ? 1 : 0, style: seg0.style || def.style || 'road' });
  def.segments.forEach((seg, k) => {
    const len = seg.s !== undefined ? lengths[k] : seg.rad * ((seg.r || seg.l) * Math.PI) / 180;
    const turn = seg.r ? (seg.r * Math.PI) / 180 : seg.l ? (-seg.l * Math.PI) / 180 : 0;
    const steps = Math.max(1, Math.ceil(len / 0.5));
    const y0 = y, y1 = seg.y !== undefined ? seg.y : y;
    const hw0 = hw, hw1 = seg.hw !== undefined ? seg.hw : hw;
    const sh0 = sh, sh1 = seg.sh !== undefined ? seg.sh : sh;
    const wallL = seg.wallL !== undefined ? seg.wallL : def.wallL;
    const wallR = seg.wallR !== undefined ? seg.wallR : def.wallR;
    const bank = segBank(seg), ag = seg.antigrav ? 1 : 0, style = seg.style || def.style || 'road';
    marks.push({ s, len });
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const ds = len / steps;
      // midpoint rule keeps arcs exact enough at half-unit steps
      const hm = h + (turn / steps) * 0.5;
      x += Math.cos(hm) * ds;
      z += Math.sin(hm) * ds;
      h += turn / steps;
      const e = t * t * (3 - 2 * t);
      pts.push({ x, z, y: y0 + (y1 - y0) * e, hw: hw0 + (hw1 - hw0) * e, sh: sh0 + (sh1 - sh0) * e, wallL, wallR, bank, ag, style });
    }
    s += len;
    y = y1;
    hw = hw1;
    sh = sh1;
  });
  return { pts, x, z, h, marks, total: s };
}

// Build the closed main loop. The straights (all of them, or only those marked adj) share the
// stretching needed to close the gap between the end of the walk and the start: the smallest
// total change in the least-squares sense, never shrinking a straight below 10 units.
function buildMainLoop(def) {
  const lengths = def.segments.map((g) => (g.s !== undefined ? g.s : 0));
  let w = walkTurtle(def, lengths);
  const turn = def.segments.reduce((a, g) => a + (g.r || 0) - (g.l || 0), 0);
  if (Math.abs(Math.abs(turn) - 360) > 1e-6) throw new Error(`${def.id}: turns add up to ${turn}°, not 360°`);
  const anyAdj = def.segments.some((q) => q.adj);
  const fixed = new Set();
  for (let pass = 0; pass < 8; pass++) {
    const ex = w.x, ez = w.z;
    if (Math.hypot(ex, ez) < 1e-4) break;
    const cand = [];
    let h = def.heading || 0;
    def.segments.forEach((g, k) => {
      if (g.s !== undefined && (g.adj || !anyAdj) && !fixed.has(k)) cand.push({ k, dx: Math.cos(h), dz: Math.sin(h) });
      if (g.r) h += (g.r * Math.PI) / 180;
      if (g.l) h -= (g.l * Math.PI) / 180;
    });
    // minimise sum(delta^2) subject to sum(delta_k * dir_k) = -E
    let a = 0, b = 0, c = 0;
    for (const q of cand) {
      a += q.dx * q.dx;
      b += q.dx * q.dz;
      c += q.dz * q.dz;
    }
    const det = a * c - b * b;
    if (cand.length < 2 || Math.abs(det) < 1e-3) throw new Error(`${def.id}: cannot close the loop (gap ${ex.toFixed(1)}, ${ez.toFixed(1)})`);
    const lx = (c * -ex - b * -ez) / det, lz = (a * -ez - b * -ex) / det;
    let clipped = false;
    for (const q of cand) {
      const next = lengths[q.k] + q.dx * lx + q.dz * lz;
      if (next < 10) {
        lengths[q.k] = 10;
        fixed.add(q.k);
        clipped = true;
      }
    }
    if (!clipped) for (const q of cand) lengths[q.k] += q.dx * lx + q.dz * lz;
    w = walkTurtle(def, lengths);
  }
  if (Math.hypot(w.x, w.z) > 0.05) throw new Error(`${def.id}: loop does not close (gap ${w.x.toFixed(2)}, ${w.z.toFixed(2)})`);
  const yErr = w.pts[w.pts.length - 1].y - w.pts[0].y;
  if (Math.abs(yErr) > 1e-3) throw new Error(`${def.id}: loop ends at height ${yErr}`);
  w.pts.pop(); // last point duplicates the first
  return { pts: w.pts, marks: w.marks, lengths };
}

// Centripetal-ish Catmull-Rom through control points -> dense points.
function catmull(ctrl, perSeg) {
  const out = [];
  const P = (i) => ctrl[Math.max(0, Math.min(ctrl.length - 1, i))];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const len = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    const steps = Math.max(2, Math.ceil(len / perSeg));
    for (let k = i === 0 ? 0 : 1; k <= steps; k++) {
      const t = k / steps, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      const o = {};
      for (const key of ['x', 'y', 'z', 'hw', 'sh', 'bank']) o[key] = f(p0[key] || 0, p1[key] || 0, p2[key] || 0, p3[key] || 0);
      const c = t < 0.5 ? p1 : p2;
      o.wallL = c.wallL;
      o.wallR = c.wallR;
      o.ag = c.ag;
      o.style = c.style;
      out.push(o);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
class Track {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.p2p = !!def.p2p;
    if (this.p2p) {
      // point-to-point: the walk itself is the road, from the top to the finish
      const w = walkTurtle(def, def.segments.map((g) => (g.s !== undefined ? g.s : 0)));
      this.marks = w.marks;
      this.main = new TrackPath('main', w.pts, false);
    } else {
      const loop = buildMainLoop(def);
      // The start line sits a little way down the first straight, so the grid behind it is on
      // the straight too (not in the last corner). Rotate the loop to begin there.
      const startAt = def.startAt !== undefined ? def.startAt : Math.min(44, loop.marks[0].len * 0.45);
      let acc = 0, j = 0;
      for (; j < loop.pts.length - 1 && acc < startAt; j++) acc += Math.hypot(loop.pts[j + 1].x - loop.pts[j].x, loop.pts[j + 1].z - loop.pts[j].z);
      const pts = loop.pts.slice(j).concat(loop.pts.slice(0, j));
      this.marks = loop.marks.map((m) => ({ s: m.s - acc, len: m.len }));
      this.main = new TrackPath('main', pts, true);
    }
    this.main.index = 0;
    this.main.smoothBank(def.bankBlend !== undefined ? def.bankBlend : 12);
    this.paths = [this.main];
    this.byId = { main: this.main };
    this.length = this.main.length;
    // Where the race starts and ends along the main road. A circuit's start line is also its
    // finish line (s = 0); a point-to-point run starts startAt units in and finishes runout
    // units before the end of the road. lapLen is the distance raced per lap (the whole run).
    this.startS = this.p2p ? (def.startAt !== undefined ? def.startAt : 40) : 0;
    this.finishS = this.p2p ? this.length - (def.runout !== undefined ? def.runout : 50) : this.length;
    this.lapLen = this.finishS - this.startS;
    this.sections = this.p2p
      ? (def.sections || [{ name: def.name }]).map((sec, i) => ({
          name: sec.name || `Section ${i + 1}`,
          music: sec.music || def.music,
          s: i === 0 ? this.startS : this.segS(sec.seg, sec.t || 0) + (sec.ds || 0),
        }))
      : [];
    this.branches = [];
    for (const b of def.branches || []) this.addBranch(b);
    this.buildGrid();
    this.openJunctions();
    this.applyRails();
    this.placeGates();
    this.buildZones();
    this.objects = this.resolveObjects();
    this._tmp = {};
  }

  // Distance from main-road position a forward to b (wrapping on a circuit; can be negative on
  // a point-to-point run, meaning b is behind).
  aheadS(a, b) {
    const L = this.length;
    return this.main.closed ? (((b - a) % L) + L) % L : b - a;
  }
  // Signed progress from main-road position a to b: the short way round on a circuit (so a
  // step back across the start line is a small negative number), plain b - a on a run.
  deltaS(a, b) {
    let d = b - a;
    if (this.main.closed) {
      const L = this.length;
      if (d > L / 2) d -= L;
      if (d < -L / 2) d += L;
    }
    return d;
  }
  // 1-based section index at a main-road s (0 on circuits).
  sectionAt(mainS) {
    let n = 0;
    for (const sec of this.sections) if (mainS >= sec.s) n++;
    return Math.max(this.sections.length ? 1 : 0, n);
  }
  // Is the located point on anti-gravity road?
  isAntigrav(loc) {
    return !!(loc && loc.path && (loc.path.ag[loc.i] || this.zoneAt(loc, 'antigrav')));
  }

  // s along the main loop for a {seg, t} reference (t in 0..1 of that turtle segment).
  segS(seg, t = 0) {
    const m = this.marks[seg];
    if (!m) throw new Error(`${this.id}: no segment ${seg}`);
    return m.s + m.len * t;
  }
  // Resolve a placement spec into a path and an s along it.
  where(spec) {
    if (spec.path && spec.path !== 'main') {
      const p = this.byId[spec.path];
      if (!p) throw new Error(`${this.id}: unknown path ${spec.path}`);
      return { path: p, s: (spec.u || 0) * p.length };
    }
    return { path: this.main, s: this.segS(spec.seg, spec.t) + (spec.ds || 0) };
  }

  // A shortcut across one big arc of the loop: a flatter arc (sweeping phi degrees instead of the
  // segment's full angle) joining the same two ends, so it peels away gently and rejoins gently.
  arcShortcut(b) {
    const seg = this.def.segments[b.seg];
    const theta = ((seg.r || seg.l) * Math.PI) / 180, r = seg.rad, phi = (b.phi * Math.PI) / 180;
    const side = seg.r ? 1 : -1;
    const Rb = (r * Math.sin(theta / 2)) / Math.sin(phi / 2);
    const c = r * Math.cos(theta / 2) - Rb * Math.cos(phi / 2);
    const pts = [];
    const n = 16;
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      const al = theta * (u - 0.5);
      const t = c * Math.cos(al) + Math.sqrt(Math.max(0, Rb * Rb - c * c * Math.sin(al) ** 2));
      pts.push([u, side * (r - t), (b.lift || 0) * Math.sin(Math.PI * u)]);
    }
    return pts;
  }

  addBranch(b) {
    const main = this.main;
    if (b.seg !== undefined) {
      b = Object.assign({ from: [b.seg, 0], to: [b.seg, 1] }, b);
      b.pts = this.arcShortcut(b);
    }
    const L = main.length;
    const fromS = (((this.segS(b.from[0], b.from[1])) % L) + L) % L;
    const toS = (((this.segS(b.to[0], b.to[1])) % L) + L) % L;
    const span = (((toS - fromS) % main.length) + main.length) % main.length;
    const hw = b.hw || 6, sh = b.sh !== undefined ? b.sh : 2;
    const style = b.style || 'road', ag = b.antigrav ? 1 : 0;
    // control points (u along the main span, d lateral, dy elevation offset, optional bank in
    // degrees, + = right side low); heights follow the main road's centre line
    const ctrl = b.pts.map(([u, d, dy, bankDeg]) => {
      const p = main.point(fromS + span * u, d);
      const bank = bankDeg ? Math.tan((Math.max(-75, Math.min(75, bankDeg)) * Math.PI) / 180) : 0;
      return { x: p.x, y: p.yc + (dy || 0), z: p.z, hw, sh, bank, ag, style, wallL: b.wallL !== undefined ? b.wallL : true, wallR: b.wallR !== undefined ? b.wallR : true };
    });
    // phantom points along the main tangent so the branch leaves and rejoins smoothly
    const a0 = main.point(fromS - 12, b.pts[0][1]), a1 = main.point(toS + 12, b.pts[b.pts.length - 1][1]);
    const dense = catmull([{ ...ctrl[0], x: a0.x, z: a0.z }, ...ctrl, { ...ctrl[ctrl.length - 1], x: a1.x, z: a1.z }], 0.5);
    // drop the phantom lead-in/out
    const trimmed = trimTo(dense, ctrl[0], ctrl[ctrl.length - 1]);
    const path = new TrackPath(b.id, trimmed, false);
    path.index = this.paths.length;
    path.branch = { fromS, toS, span, def: b };
    this.paths.push(path);
    this.byId[b.id] = path;
    this.branches.push(path);
    path.gateSpec = b.gate;
    // no gate: an open alternative route (a fork in the road) anyone may take
    path.open = b.gate === undefined || b.gate === null;
    path.routeName = b.name || (path.open ? 'Side road' : 'Hidden route');
  }

  // Guard rails: turn drop edges into walls over a stretch, e.g. around the mouth of a
  // wall-less shortcut. {seg, t, t1, side} on the main loop or {path, u, u1, side} on a branch;
  // side -1 left, 1 right, 0 both.
  applyRails() {
    for (const r of this.def.rails || []) {
      const w = this.where(r);
      const s1 = r.t1 !== undefined ? this.segS(r.seg, r.t1) : r.u1 !== undefined ? r.u1 * w.path.length : w.s + (r.len || 10);
      const p = w.path;
      for (let s = w.s; s <= s1; s += p.step * 0.5) {
        const i = p.indexAt(s);
        if (r.side <= 0 && p.wallL[i] === 0) p.wallL[i] = 1;
        if (r.side >= 0 && p.wallR[i] === 0) p.wallR[i] = 1;
      }
    }
  }

  // Lock each branch just past its mouth (where it stops touching the main road), so the
  // only way in is through the gate.
  placeGates() {
    for (const p of this.branches) {
      const g = p.gateSpec;
      if (g === undefined || g === null) continue;
      let i = -1;
      if (g === 'auto') {
        let run = 0;
        for (let k = 0; k < p.n / 2; k++) {
          if (p.wallL[k] !== 2 && p.wallR[k] !== 2) {
            if (++run >= 3) {
              i = k + 3;
              break;
            }
          } else run = 0;
        }
        if (i < 0) throw new Error(`${this.id}: branch ${p.id} never leaves the main road`);
      } else i = p.indexAt(p.length * g);
      p.gate = { i, s: p.s[i], name: p.routeName };
    }
  }

  // Map an s on any path to s along the main loop (branches map linearly onto their span).
  mainS(path, s) {
    if (!path.branch) return s;
    const b = path.branch;
    const u = Math.max(0, Math.min(1, s / path.length));
    return (b.fromS + b.span * u) % this.main.length;
  }

  // ---------- spatial grid ----------
  buildGrid() {
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const p of this.paths) {
      for (let i = 0; i < p.n; i++) {
        minX = Math.min(minX, p.x[i]); maxX = Math.max(maxX, p.x[i]);
        minZ = Math.min(minZ, p.z[i]); maxZ = Math.max(maxZ, p.z[i]);
      }
    }
    const pad = 40;
    this.bounds = { minX: minX - pad, minZ: minZ - pad, maxX: maxX + pad, maxZ: maxZ + pad };
    const C = (this.cell = 8);
    this.gw = Math.ceil((this.bounds.maxX - this.bounds.minX) / C);
    this.gh = Math.ceil((this.bounds.maxZ - this.bounds.minZ) / C);
    this.grid = new Array(this.gw * this.gh);
    for (const p of this.paths) {
      for (let i = 0; i < p.n; i++) {
        const R = p.hw[i] + p.sh[i] + 7;
        const cx0 = Math.floor((p.x[i] - R - this.bounds.minX) / C), cx1 = Math.floor((p.x[i] + R - this.bounds.minX) / C);
        const cz0 = Math.floor((p.z[i] - R - this.bounds.minZ) / C), cz1 = Math.floor((p.z[i] + R - this.bounds.minZ) / C);
        for (let cz = cz0; cz <= cz1; cz++) {
          for (let cx = cx0; cx <= cx1; cx++) {
            if (cx < 0 || cz < 0 || cx >= this.gw || cz >= this.gh) continue;
            const k = cz * this.gw + cx;
            (this.grid[k] || (this.grid[k] = [])).push((p.index << 16) | i);
          }
        }
      }
    }
  }

  // Where is (x, z) relative to the roads? Returns null over the void.
  // hint: the path the asker was on last frame (keeps junctions from flickering).
  locate(x, z, y, hint, out) {
    const C = this.cell, b = this.bounds;
    const cx = Math.floor((x - b.minX) / C), cz = Math.floor((z - b.minZ) / C);
    if (cx < 0 || cz < 0 || cx >= this.gw || cz >= this.gh) return null;
    const list = this.grid[cz * this.gw + cx];
    if (!list) return null;
    const bestD = this._bd || (this._bd = []), bestI = this._bi || (this._bi = []);
    for (let k = 0; k < this.paths.length; k++) {
      bestD[k] = Infinity;
      bestI[k] = -1;
    }
    for (let k = 0; k < list.length; k++) {
      const e = list[k];
      const pi = e >> 16, i = e & 0xffff;
      const p = this.paths[pi];
      const dx = x - p.x[i], dz = z - p.z[i];
      let dd = dx * dx + dz * dz;
      if (y !== undefined && y !== null) {
        // compare against the (banked) road height at this lateral offset
        const dl = dx * p.nx[i] + dz * p.nz[i];
        const dy = Math.abs(y - (p.y[i] - dl * p.bank[i])) - 5;
        if (dy > 0) dd += dy * dy * 4;
      }
      if (dd < bestD[pi]) {
        bestD[pi] = dd;
        bestI[pi] = i;
      }
    }
    let pick = null;
    for (let pi = 0; pi < this.paths.length; pi++) {
      if (bestI[pi] < 0) continue;
      const c = this.project(this.paths[pi], bestI[pi], x, z, this._tmp);
      const onRoad = Math.abs(c.d) <= c.hw;
      const excess = Math.abs(c.d) - (c.hw + c.sh);
      let score = onRoad ? -100 + Math.abs(c.d) / c.hw : excess;
      if (hint && hint === this.paths[pi]) score -= 0.6;
      if (!pick || score < pick.score) {
        pick = out || {};
        Object.assign(pick, c);
        pick.score = score;
        pick.path = this.paths[pi];
      }
    }
    if (!pick) return null;
    pick.excess = Math.abs(pick.d) - (pick.hw + pick.sh);
    pick.onRoad = Math.abs(pick.d) <= pick.hw;
    pick.mainS = this.mainS(pick.path, pick.s);
    return pick;
  }

  // Project (x, z) onto path p near sample i.
  project(p, i, x, z, out) {
    for (let it = 0; it < 6; it++) {
      const along = (x - p.x[i]) * p.tx[i] + (z - p.z[i]) * p.tz[i];
      if (along > p.step * 0.5 && (p.closed || i < p.n - 1)) i = p.wrap(i + 1);
      else if (along < -p.step * 0.5 && (p.closed || i > 0)) i = p.wrap(i - 1);
      else break;
    }
    const along = (x - p.x[i]) * p.tx[i] + (z - p.z[i]) * p.tz[i];
    const d = (x - p.x[i]) * p.nx[i] + (z - p.z[i]) * p.nz[i];
    const j = along >= 0 ? p.wrap(i + 1) : p.wrap(i - 1);
    const f = Math.min(1, Math.abs(along) / p.step);
    out.i = i;
    out.d = d;
    let s = p.s[i] + along;
    // how far beyond either end of an open path (0 when alongside it)
    out.over = 0;
    if (!p.closed) {
      if (s > p.length) out.over = s - p.length;
      else if (s < 0) out.over = -s;
    }
    if (p.closed) s = ((s % p.length) + p.length) % p.length;
    else s = Math.max(0, Math.min(p.length, s));
    out.s = s;
    out.yc = p.y[i] + (p.y[j] - p.y[i]) * f;
    out.bank = p.bank[i] + (p.bank[j] - p.bank[i]) * f;
    out.y = out.yc - d * out.bank;
    out.hw = p.hw[i] + (p.hw[j] - p.hw[i]) * f;
    out.sh = p.sh[i] + (p.sh[j] - p.sh[i]) * f;
    out.tx = p.tx[i];
    out.tz = p.tz[i];
    out.nx = p.nx[i];
    out.nz = p.nz[i];
    out.slope = p.slope[i];
    return out;
  }

  // Where one road's edge runs into another road, that edge is open (no wall, no drop).
  openJunctions() {
    const tmp = {};
    for (const p of this.paths) {
      for (let i = 0; i < p.n; i++) {
        for (const side of [-1, 1]) {
          const R = p.hw[i] + p.sh[i] + 0.4;
          const ex = p.x[i] + p.nx[i] * R * side, ez = p.z[i] + p.nz[i] * R * side;
          if (this.insideOther(p, ex, ez, p.y[i] - R * side * p.bank[i], tmp)) {
            if (side < 0) p.wallL[i] = 2;
            else p.wallR[i] = 2;
          }
        }
      }
    }
  }
  insideOther(p, x, z, y, tmp) {
    const C = this.cell, b = this.bounds;
    const cx = Math.floor((x - b.minX) / C), cz = Math.floor((z - b.minZ) / C);
    const list = cx >= 0 && cz >= 0 && cx < this.gw && cz < this.gh ? this.grid[cz * this.gw + cx] : null;
    if (!list) return false;
    for (const q of this.paths) {
      if (q === p) continue;
      let best = -1, bd = Infinity;
      for (const e of list) {
        if (e >> 16 !== q.index) continue;
        const i = e & 0xffff;
        const dd = (x - q.x[i]) ** 2 + (z - q.z[i]) ** 2;
        if (dd < bd) {
          bd = dd;
          best = i;
        }
      }
      if (best < 0) continue;
      const c = this.project(q, best, x, z, tmp);
      if (Math.abs(c.y - y) < 3 && Math.abs(c.d) < c.hw + c.sh - 0.6) return true;
    }
    return false;
  }

  // ---------- zones: boost pads, ramps, ice, mud, gaps ----------
  buildZones() {
    // {kind, seg, t, t1 | len, d, w, h} on the main loop, or {kind, path, u, u1 | len, ...} on a branch
    for (const z of this.def.zones || []) {
      const w = this.where(z);
      let s0 = w.s;
      let s1 = w.s + (z.len || 6);
      if (z.t1 !== undefined) s1 = this.segS(z.seg, z.t1);
      if (z.u1 !== undefined) s1 = z.u1 * w.path.length;
      const half = (z.w !== undefined ? z.w : 200) / 2;
      const add = (a, b) => w.path.zones.push({ kind: z.kind, path: w.path, s0: a, s1: b, d0: (z.d || 0) - half, d1: (z.d || 0) + half, h: z.h || 0, flow: z.flow || 0 });
      if (w.path.closed) {
        // keep zones inside 0..L, splitting any that cross the start line
        const L = w.path.length;
        const shift = Math.floor(s0 / L) * L;
        s0 -= shift;
        s1 -= shift;
        if (s1 > L) {
          add(s0, L);
          add(0, s1 - L);
          continue;
        }
      }
      add(s0, s1);
    }
  }
  zoneAt(loc, kind) {
    const zs = loc.path.zones;
    for (let k = 0; k < zs.length; k++) {
      const z = zs[k];
      if (kind && z.kind !== kind) continue;
      if (loc.s >= z.s0 && loc.s <= z.s1 && loc.d >= z.d0 && loc.d <= z.d1) return z;
    }
    return null;
  }
  // Ground height under a located point (ramps and moguls lift it, gaps remove it).
  // -Infinity = no ground.
  groundY(loc) {
    if (!loc || loc.excess > 0.25) return -Infinity;
    let y = loc.y;
    const zs = loc.path.zones;
    for (let k = 0; k < zs.length; k++) {
      const z = zs[k];
      if (loc.s < z.s0 || loc.s > z.s1 || loc.d < z.d0 || loc.d > z.d1) continue;
      if (z.kind === 'gap') return -Infinity;
      const u = (loc.s - z.s0) / (z.s1 - z.s0 || 1);
      if (z.kind === 'ramp' || z.kind === 'glide') y += z.h * u;
      else if (z.kind === 'hump') y += z.h * Math.sin(Math.PI * u);
    }
    return y;
  }
  // Extra ground slope (rise per unit along the road) that ramps and moguls add under a located
  // point, on top of the road's own slope. Used to pitch karts up a ramp.
  zoneSlope(loc) {
    if (!loc || !loc.path) return 0;
    let m = 0;
    const zs = loc.path.zones;
    for (let k = 0; k < zs.length; k++) {
      const z = zs[k];
      if (loc.s < z.s0 || loc.s > z.s1 || loc.d < z.d0 || loc.d > z.d1) continue;
      const len = z.s1 - z.s0 || 1;
      if (z.kind === 'ramp' || z.kind === 'glide') m += z.h / len;
      else if (z.kind === 'hump') m += ((z.h * Math.PI) / len) * Math.cos((Math.PI * (loc.s - z.s0)) / len);
    }
    return m;
  }
  // Does a chasm (gap zone) start within `within` units ahead of s on this path (or is s in one)?
  gapAhead(path, s, within) {
    for (const z of path.zones) if (z.kind === 'gap' && s <= z.s1 && s >= z.s0 - within) return z;
    return null;
  }
  // What the tyres are on: road, offroad, boost, ice, mud, shallow, ramp (also moguls), glide,
  // or void. Zones that are not surfaces (current, antigrav, gap) are looked up separately.
  surface(loc) {
    if (!loc) return 'void';
    const zs = loc.path.zones;
    for (let k = 0; k < zs.length; k++) {
      const z = zs[k];
      if (loc.s < z.s0 || loc.s > z.s1 || loc.d < z.d0 || loc.d > z.d1) continue;
      if (!SURFACE_ZONES[z.kind]) continue;
      if (z.kind === 'ramp' || z.kind === 'hump') return loc.onRoad ? 'ramp' : 'offroad';
      if (z.kind === 'glide') return loc.onRoad ? 'glide' : 'offroad';
      return z.kind;
    }
    return loc.onRoad ? 'road' : 'offroad';
  }

  // ---------- placed objects ----------
  resolveObjects() {
    const out = { boxes: [], coins: [], keys: [], hazards: [], gates: [], rings: [] };
    const d = this.def;
    for (const r of d.rings || []) {
      // a ring hangs h above the road at that spot, facing along the road
      const w = this.where(r);
      const p = w.path.point(w.s, r.d || 0);
      out.rings.push({ x: p.x, y: p.y + (r.h !== undefined ? r.h : 4), z: p.z, head: p.head, tx: p.tx, tz: p.tz, r: r.r || 3.2, path: w.path, s: w.s });
    }
    for (const row of d.boxes || []) {
      const w = this.where(row);
      for (const off of row.d) {
        const p = w.path.point(w.s, off);
        out.boxes.push({ x: p.x, y: p.y, z: p.z, path: w.path, s: w.s });
      }
    }
    for (const line of d.coins || []) {
      const w = this.where(line);
      const n = line.n || 5;
      for (let k = 0; k < n; k++) {
        const s = w.s + k * (line.gap || 3);
        const off = (line.d || 0) + (line.dd || 0) * k;
        const p = w.path.point(s, off);
        out.coins.push({ x: p.x, y: p.y + (line.h || 0), z: p.z });
      }
    }
    for (const k of d.keys || []) {
      const w = this.where(k);
      const p = w.path.point(w.s, k.d || 0);
      out.keys.push({ x: p.x, y: p.y + (k.h || 1.2), z: p.z, hover: k.h || 1.2 });
    }
    for (const h of d.hazards || []) {
      const w = this.where(h);
      const p = w.path.point(w.s, h.d || 0);
      out.hazards.push(Object.assign({}, h, { x: p.x, y: p.y, z: p.z, head: p.head, path: w.path, s: w.s }));
    }
    for (const p of this.branches) {
      if (!p.gate) continue;
      const i = p.gate.i;
      const half = p.hw[i] + p.sh[i] + 0.5;
      const cx = p.x[i], cz = p.z[i];
      out.gates.push({
        path: p, i, x: cx, y: p.y[i], z: cz, head: p.head[i], half,
        ax: cx - p.nx[i] * half, az: cz - p.nz[i] * half, bx: cx + p.nx[i] * half, bz: cz + p.nz[i] * half,
        name: p.gate.name,
      });
    }
    return out;
  }

  // Grid start positions: two columns, staggered, behind the line.
  gridSlot(k) {
    const row = Math.floor(k / 2), col = k % 2;
    const s = this.startS - 7 - row * 5.2 - col * 2.4;
    const hw = this.main.hw[this.main.indexAt(this.startS)];
    const p = this.main.point(s, (col ? 1 : -1) * Math.min(3.6, hw * 0.45));
    return { x: p.x, y: p.y, z: p.z, head: p.head, s };
  }
}

// Zone kinds that are driving surfaces (the rest are looked up with zoneAt).
const SURFACE_ZONES = { boost: 1, ice: 1, mud: 1, shallow: 1, ramp: 1, glide: 1, hump: 1 };

function trimTo(dense, a, b) {
  let i0 = 0, i1 = dense.length - 1, d0 = Infinity, d1 = Infinity;
  for (let i = 0; i < dense.length; i++) {
    const da = (dense[i].x - a.x) ** 2 + (dense[i].z - a.z) ** 2;
    const db = (dense[i].x - b.x) ** 2 + (dense[i].z - b.z) ** 2;
    if (da < d0) {
      d0 = da;
      i0 = i;
    }
    if (db < d1) {
      d1 = db;
      i1 = i;
    }
  }
  return dense.slice(i0, i1 + 1);
}

const TRACK_CACHE = {};
function getTrack(id) {
  if (!TRACK_CACHE[id]) TRACK_CACHE[id] = new Track(TRACK_DEFS.find((t) => t.id === id));
  return TRACK_CACHE[id];
}
