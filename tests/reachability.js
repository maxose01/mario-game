#!/usr/bin/env node
'use strict';
// Level reachability check.
// Loads the game's real tile physics and level data, then explores every level by
// simulating jumps frame by frame (walk/run/sprint speeds, short and full jumps,
// mid-air steering, springs, moving platforms). No cape flight is assumed, so a pass
// means each route is completable on foot.
//
//   node tests/reachability.js            -> summary + exit code
//   node tests/reachability.js --dump l2  -> ASCII map of a level

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const sandbox = vm.createContext({ console, Math, JSON });
for (const f of ['config', 'util', 'physics', 'levels']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), sandbox, { filename: f + '.js' });
}
const G = (expr) => vm.runInContext(expr, sandbox);
const CFG = G('CFG');
const T = G('TILE');
const LEVEL_SPECS = G('LEVEL_SPECS');
const buildLevel = G('buildLevel');
const makeTileQuery = G('makeTileQuery');
const moveBody = G('moveBody');

const ENTITY_CHARS = new Set(['P', 'o', '$', 'K', 'H', 'G', 'C', 'S', 'Y', 'g', 'k', 's', 'f', 'v', '@', 'T', 'm', 'n']);

function prepare(id, { switchOn, openLocks }) {
  const g = buildLevel(id);
  const rows = g.rows.map((r) => r.slice());
  const marks = { coins: [], suns: [], key: null, keyhole: null, goal: null, start: null, springs: [], elevators: [], boss: null, sw: null };
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const c = rows[y][x];
      if (!ENTITY_CHARS.has(c)) continue;
      rows[y][x] = '.';
      if (c === 'P') marks.start = [x, y];
      else if (c === '$') marks.suns.push([x, y]);
      else if (c === 'K') marks.key = [x, y];
      else if (c === 'H') marks.keyhole = [x, y];
      else if (c === 'G') marks.goal = [x, y];
      else if (c === '@') marks.boss = [x, y];
      else if (c === 'T') marks.sw = [x, y];
      else if (c === 'S') marks.springs.push({ x: x * T + 2, y: y * T + T - 22, w: 28, h: 22 });
      else if (c === 'm') marks.platformsH = (marks.platformsH || []).concat([[x, y]]);
      else if (c === 'n') marks.elevators.push([x, y]);
    }
  }
  // Moving platforms become jump-through tiles across their travel (timing is the player's job).
  for (const [x, y] of marks.platformsH || []) for (let i = 0; i < 7; i++) if (rows[y][x + i] === '.') rows[y][x + i] = '=';
  for (const [x, y] of marks.elevators) for (const dy of [-3, 0, 3]) for (let i = 0; i < 3; i++) if (rows[y + dy] && rows[y + dy][x + i] === '.') rows[y + dy][x + i] = '=';
  if (openLocks) for (const r of rows) for (let i = 0; i < r.length; i++) if (r[i] === 'L') r[i] = '.';
  const q = makeTileQuery(rows, g.w, g.h, () => switchOn);
  return { id, rows, w: g.w, h: g.h, q, marks };
}

function standable(L, tx, ty, h) {
  const q = L.q;
  if (!(q.solidAt(tx, ty) || q.oneWayAt(tx, ty))) return false;
  if (L.rows[ty] && L.rows[ty][tx] === '^') return false;
  const need = Math.ceil(h / T);
  for (let k = 1; k <= need; k++) if (q.solidAt(tx, ty - k)) return false;
  return true;
}

function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Simulate one action from feet position (fx, fy). Returns landing info or null.
function simulate(L, fx, fy, act, h, touched, hits) {
  const b = { x: fx - 10, y: fy - h, w: 20, h, vx: act.dir * act.speed, vy: 0, onGround: true };
  let jumping = false;
  if (act.jump) {
    const frac = Math.min(1, Math.abs(b.vx) / CFG.sprintSpeed);
    b.vy = -(CFG.jumpVelocity + CFG.runJumpBonus * frac);
    jumping = true;
    b.onGround = false;
  }
  let airborne = act.jump;
  const H = L.h * T;
  for (let f = 0; f < 480; f++) {
    const dir = f < act.steer ? act.dir : act.dir2;
    const held = f < act.hold;
    if (dir) {
      const s = b.vx * dir;
      let nv = b.vx + dir * (b.onGround ? CFG.groundAccel : CFG.airAccel);
      if (nv * dir > act.speed) nv = dir * Math.max(act.speed, s);
      b.vx = nv;
    } else if (b.onGround) b.vx = 0;
    const g = jumping && b.vy < 0 && held ? CFG.jumpGravity : CFG.gravity;
    if (!held) jumping = false;
    b.vy = Math.min(b.vy + g, CFG.maxFall);
    const prevBottom = b.y + b.h;
    const res = moveBody(b, L.q, { corner: 7 });
    if (res.ceil && hits) for (const [tx, ty] of res.ceil) hits.add(tx + ',' + ty);
    for (const s of L.marks.springs) {
      if (b.vy >= 0 && overlap(b, s) && prevBottom <= s.y + 12) {
        b.y = s.y - b.h;
        b.vy = -CFG.springVelocity;
        jumping = true;
        b.onGround = false;
        airborne = true;
      }
    }
    if (touched) {
      const x0 = Math.floor(b.x / T), x1 = Math.floor((b.x + b.w - 0.01) / T);
      const y0 = Math.floor(b.y / T), y1 = Math.floor((b.y + b.h - 0.01) / T);
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) touched.add(tx + ',' + ty);
    }
    if (b.y > H + 40) return null;
    const tx0 = Math.floor((b.x - 1) / T), tx1 = Math.floor((b.x + b.w + 1) / T);
    const ty0 = Math.floor((b.y - 1) / T), ty1 = Math.floor((b.y + b.h + 1) / T);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (L.rows[ty] && L.rows[ty][tx] === '^') return null;
    if (!b.onGround) airborne = true;
    else if (airborne) {
      const fyl = b.y + b.h;
      const ty = Math.round(fyl / T);
      const cands = [Math.floor((b.x + b.w / 2) / T), Math.floor(b.x / T), Math.floor((b.x + b.w - 0.01) / T)];
      for (const tx of cands) if (standable(L, tx, ty, h)) return [tx, ty];
      return null;
    }
    if (!airborne && Math.abs(b.x + 10 - fx) > 2 * T) return null; // just walking: covered by walk edges
  }
  return null;
}

function actions() {
  const acts = [];
  const speeds = [
    { speed: CFG.walkSpeed, runway: 0 },
    { speed: CFG.runSpeed, runway: 3 },
    { speed: CFG.sprintSpeed, runway: 8 },
  ];
  for (const dir of [-1, 0, 1]) {
    for (const sp of dir === 0 ? [speeds[0]] : speeds) {
      for (const hold of [0, 6, 14, 999]) {
        acts.push({ dir, dir2: dir, steer: 999, speed: sp.speed, runway: sp.runway, hold, jump: true });
        if (dir !== 0) {
          acts.push({ dir, dir2: 0, steer: 18, speed: sp.speed, runway: sp.runway, hold, jump: true });
          acts.push({ dir, dir2: -dir, steer: 22, speed: sp.speed, runway: sp.runway, hold, jump: true });
        } else {
          for (const d2 of [-1, 1]) acts.push({ dir: 0, dir2: d2, steer: 16, speed: CFG.walkSpeed, runway: 0, hold, jump: true });
        }
      }
      if (dir !== 0) acts.push({ dir, dir2: dir, steer: 999, speed: sp.speed, runway: sp.runway, hold: 0, jump: false });
    }
  }
  return acts;
}

function runwayLength(L, tx, ty, dir, h) {
  let n = 0;
  for (let x = tx - dir; standable(L, x, ty, h) && n < 12; x -= dir) n++;
  return n;
}

function explore(L, startNodes, h) {
  const ACTS = actions();
  const seen = new Set();
  const queue = [];
  const touched = new Set();
  const hits = new Set();
  const push = (tx, ty) => {
    const k = tx + ',' + ty;
    if (seen.has(k)) return;
    seen.add(k);
    queue.push([tx, ty]);
  };
  for (const [tx, ty] of startNodes) push(tx, ty);
  while (queue.length) {
    const [tx, ty] = queue.shift();
    for (let yy = ty - Math.ceil(h / T); yy < ty; yy++) touched.add(tx + ',' + yy);
    // walking
    for (const d of [-1, 1]) if (standable(L, tx + d, ty, h)) push(tx + d, ty);
    // elevators connect their stops
    for (const [ex, ey] of L.marks.elevators) {
      if (tx >= ex && tx <= ex + 2 && [ey - 3, ey, ey + 3].includes(ty)) for (const dy of [-3, 0, 3]) if (standable(L, tx, ey + dy, h)) push(tx, ey + dy);
    }
    for (const act of ACTS) {
      if (act.runway && act.dir && runwayLength(L, tx, ty, act.dir, h) < act.runway) continue;
      const offsets = act.dir === 0 ? [T / 2] : [T / 2, act.dir > 0 ? T - 1 : 1];
      for (const off of offsets) {
        const r = simulate(L, tx * T + off, ty * T, act, h, touched, hits);
        if (r) push(r[0], r[1]);
      }
    }
  }
  return { seen, touched, hits };
}

function nodeAt(L, [x, y], h) {
  for (let ty = y + 1; ty < L.h; ty++) if (standable(L, x, ty, h)) return [x, ty];
  return null;
}

function check(id, scenario, h) {
  const L = prepare(id, scenario);
  const m = L.marks;
  const start = nodeAt(L, m.start, h);
  const r = explore(L, [start], h);
  const t = (c) => c && r.touched.has(c[0] + ',' + c[1]);
  const out = { id, h, switchOn: !!scenario.switchOn, nodes: r.seen.size };
  if (m.goal) out.goal = [...r.seen].some((k) => +k.split(',')[0] >= m.goal[0] + 2);
  if (m.boss) out.bossArena = [...r.seen].some((k) => +k.split(',')[0] >= LEVEL_SPECS[id].boss.x0 + 2);
  if (m.sw) out.switch = t(m.sw);
  out.suns = m.suns.map(t);
  if (m.key) {
    out.key = t(m.key);
    if (out.key) {
      // carry the key from where it rests to the keyhole (locks open when the key touches them)
      const L2 = prepare(id, Object.assign({}, scenario, { openLocks: true }));
      const kn = nodeAt(L2, m.key, h);
      const r2 = explore(L2, [kn], h);
      out.keyhole = r2.touched.has(m.keyhole[0] + ',' + m.keyhole[1]) || r2.touched.has(m.keyhole[0] + ',' + (m.keyhole[1] + 1));
    } else out.keyhole = false;
  }
  const blocks = [];
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) if ('?MWE1I'.includes(L.rows[y][x])) blocks.push([x, y]);
  out.unhittable = blocks.filter(([x, y]) => !r.hits.has(x + ',' + y)).map(([x, y]) => `${L.rows[y][x]}@${x},${y}`);
  return out;
}

function dump(id) {
  const g = buildLevel(id);
  const rows = g.toStrings();
  const ruler = (n) => Array.from({ length: g.w }, (_, i) => (i % 10 === 0 ? String((i / 10) % 10) : n === 0 ? ' ' : String(i % 10))).join('');
  console.log('    ' + ruler(0));
  console.log('    ' + ruler(1));
  rows.forEach((r, i) => console.log(String(i).padStart(3) + ' ' + r));
}

if (process.argv[2] === '--dump') {
  dump(process.argv[3] || 'l1');
  process.exit(0);
}

const expectations = [
  // [level, scenario, height, field, expected]
  ['l1', {}, 44, 'goal', true],
  ['l1', {}, 26, 'goal', true],
  ['l1', {}, 44, 'key', true],
  ['l1', {}, 44, 'keyhole', true],
  ['l2', {}, 44, 'goal', true],
  ['l2', {}, 26, 'goal', true],
  ['l2', {}, 44, 'key', false],
  ['l2', { switchOn: true }, 44, 'key', true],
  ['l2', { switchOn: true }, 44, 'keyhole', true],
  ['l2', { switchOn: true }, 44, 'goal', true],
  ['l3', {}, 44, 'bossArena', true],
  ['l3', {}, 26, 'bossArena', true],
  ['l3', {}, 44, 'key', false],
  ['l3', { switchOn: true }, 44, 'key', true],
  ['l3', { switchOn: true }, 44, 'keyhole', true],
  ['l3', { switchOn: true }, 44, 'bossArena', true],
  ['palace', {}, 44, 'switch', true],
];

let failed = 0;
const cache = new Map();
for (const [id, sc, h, field, want] of expectations) {
  const k = id + JSON.stringify(sc) + h;
  if (!cache.has(k)) cache.set(k, check(id, sc, h));
  const r = cache.get(k);
  const ok = r[field] === want;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id.padEnd(6)} ${sc.switchOn ? 'switch on ' : 'switch off'} ${h === 44 ? 'big  ' : 'small'}  ${field} = ${r[field]} (expected ${want})`);
}
console.log('');
for (const r of cache.values()) {
  console.log(`${r.id} ${r.switchOn ? '[switch on]' : '[switch off]'} ${r.h === 44 ? 'big' : 'small'}: ${r.nodes} standing spots, sun coins ${JSON.stringify(r.suns)}${r.unhittable.length ? ', unreachable blocks ' + r.unhittable.join(' ') : ''}`);
}
console.log(failed ? `\n${failed} expectation(s) failed` : '\nAll routes check out.');
process.exit(failed ? 1 : 0);
