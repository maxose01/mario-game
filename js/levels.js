'use strict';
// Level data. Levels are authored with a tiny builder DSL that stamps characters into a grid.
// Pure data + logic (no DOM) so tests/reachability.js can load it in Node.
//
// Static tiles (baked into the clay terrain):
//   #  ground            =  cloud (jump-through)    ^  thorn bramble (hurts)    X  stone block
// Dynamic tiles (drawn every frame):
//   ?  coin block        M  mushroom block          W  feather (cape) block     E  egg block (companion)
//   1  1-up block        B  clay brick              I  info block               L  lock block (opened by a key)
//   O  switch block (solid only after the Cloud Switch Palace)                  Z  pellet cannon
// Entities:
//   P  player start      o  coin       $  sun coin     K  key      H  keyhole (secret exit)
//   G  goal gate         C  midway checkpoint           S  spring   Y  companion (waiting)
//   g  Mudlet            k  Shellbo (snail)  s  Thornbun (spiky)   f  Flapper   v  Flapper (vertical)
//   m  moving cloud (horizontal)  n  moving cloud (vertical)  @  King Mudlet (boss)  T  big switch

class LevelGrid {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.rows = [];
    for (let y = 0; y < h; y++) this.rows.push(new Array(w).fill('.'));
  }
  put(x, y, c) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.rows[y][x] = c;
  }
  get(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.rows[y][x] : '.';
  }
  fill(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.put(x + i, y + j, c);
  }
  // Ground that runs down to the bottom of the level.
  ground(x, w, top) {
    this.fill(x, top, w, this.h - top, '#');
  }
  // A floating island `depth` tiles thick; the clay renderer hangs a rocky root beneath it.
  island(x, top, w, depth) {
    this.fill(x, top, w, depth, '#');
  }
  cloud(x, y, w) {
    this.fill(x, y, w, 1, '=');
  }
  // Stamp a string horizontally; spaces leave existing tiles untouched.
  row(x, y, s) {
    for (let i = 0; i < s.length; i++) if (s[i] !== ' ') this.put(x + i, y, s[i]);
  }
  coins(x, y, n, step = 1) {
    for (let i = 0; i < n; i++) this.put(x + i * step, y, 'o');
  }
  // Coin arc over n columns, peaking 2 rows above y.
  coinArc(x, y, n) {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const lift = Math.round(Math.sin(t * Math.PI) * 2);
      this.put(x + i, y - lift, 'o');
    }
  }
  toStrings() {
    return this.rows.map((r) => r.join(''));
  }
}

const LEVEL_SPECS = {
  l1: {
    id: 'l1',
    name: 'Puffball Meadow',
    theme: 'dawn',
    music: 'meadow',
    w: 212,
    h: 20,
    exits: ['normal', 'secret'],
    messages: [
      'Welcome to the Clay Isles! Use the arrow keys to move and Z or Space to jump. Hold X to run.',
      'This egg block holds Dumpling, a clay dino. Hatch it, then land on its back to ride. X flicks the tongue, C hops off.',
      'Feathers give you a cape. Hold jump while falling to glide. Run until the P-meter fills, then jump to fly.',
      'Springs launch you higher if you hold jump. Somewhere up in the sky floats a key. Carry it to a keyhole to open a secret exit!',
    ],
    build(g) {
      // A: hut meadow
      g.ground(0, 22, 15);
      g.put(3, 14, 'P');
      g.put(7, 11, 'I');
      g.row(11, 11, 'B?BMB');
      g.coins(12, 7, 3);
      g.put(18, 14, 'g');
      // B: egg meadow
      g.ground(25, 19, 15);
      g.cloud(28, 11, 4);
      g.coins(28, 10, 4);
      g.put(33, 11, 'I');
      g.put(36, 11, 'E');
      g.put(31, 14, 'g');
      g.put(41, 14, 'g');
      g.cloud(45, 13, 2);
      // C: first floating island
      g.island(48, 13, 12, 3);
      g.cloud(50, 9, 3);
      g.put(51, 7, '$');
      g.coinArc(54, 11, 4);
      g.put(57, 12, 'k');
      // D: the runway, with the feather and the spring to the sky road
      g.ground(62, 45, 15);
      g.put(64, 11, 'I');
      g.put(67, 11, 'W');
      g.put(71, 14, 'g');
      g.put(80, 14, 'C');
      g.coins(83, 12, 5);
      g.put(86, 14, 'g');
      g.put(91, 14, 'g');
      g.put(95, 14, 'k');
      g.put(97, 11, 'I');
      g.put(101, 14, 'S');
      // Sky road (secret): key at 112, keyhole at 135
      g.cloud(98, 5, 5);
      g.coins(99, 4, 3);
      g.cloud(105, 6, 3);
      g.cloud(110, 5, 4);
      g.put(112, 4, 'K');
      g.cloud(117, 6, 3);
      g.cloud(122, 5, 3);
      g.put(123, 2, '$');
      g.cloud(127, 6, 3);
      g.island(132, 6, 6, 2);
      g.put(135, 4, 'H');
      // E: lower islands
      g.island(110, 14, 8, 3);
      g.put(114, 10, 'f');
      g.put(116, 13, 'g');
      g.island(121, 13, 6, 3);
      g.row(122, 9, '?1?');
      g.cloud(128, 12, 2);
      g.ground(131, 20, 15);
      g.put(136, 14, 'k');
      g.row(138, 11, 'B?B');
      g.put(142, 14, 'g');
      g.put(146, 14, 'g');
      // F: last hops to the goal
      g.island(154, 13, 5, 3);
      g.put(160, 11, '$');
      g.ground(163, 49, 15);
      g.put(170, 14, 'g');
      g.row(172, 11, '?B?B?');
      g.coinArc(172, 8, 5);
      g.put(178, 14, 'k');
      g.put(184, 14, 'g');
      g.put(188, 14, 'g');
      g.put(198, 14, 'G');
    },
  },

  l2: {
    id: 'l2',
    name: 'Gusty Glade',
    theme: 'noon',
    music: 'glade',
    w: 236,
    h: 22,
    exits: ['normal', 'secret'],
    messages: [
      'Thornbuns are prickly! Spin jump with C to bounce off them safely, or kick a shell into them.',
      'Dumpling can gobble Thornbuns whole. Bop this egg block if you need a ride.',
      'Those dotted outlines are switch blocks. Pressing the Cloud Switch makes them solid.',
    ],
    build(g) {
      g.ground(0, 18, 17);
      g.put(2, 16, 'P');
      g.put(5, 13, 'I');
      g.row(9, 13, '?B?B?');
      g.coinArc(9, 10, 5);
      g.put(15, 16, 's');
      g.put(19, 15, 'm');
      g.ground(26, 14, 17);
      g.cloud(29, 12, 4);
      g.coins(29, 11, 4);
      g.put(31, 16, 'k');
      g.put(37, 16, 'g');
      // rising stepping stones
      g.island(42, 15, 5, 3);
      g.island(49, 13, 5, 3);
      g.island(56, 11, 6, 3);
      g.put(58, 7, 'W');
      g.put(58, 3, '$');
      g.put(61, 8, 'f');
      g.island(64, 13, 4, 3);
      // thornbun meadow
      g.ground(70, 26, 17);
      g.put(72, 13, 'I');
      g.put(74, 13, 'E');
      g.put(78, 16, 's');
      g.row(80, 12, 'B?BB?B');
      g.put(86, 9, '$');
      g.put(83, 16, 's');
      g.put(88, 16, 'C');
      g.put(92, 16, 'k');
      // elevator crossing
      g.put(97, 14, 'n');
      g.cloud(102, 12, 3);
      g.put(106, 13, 'n');
      g.island(112, 13, 6, 3);
      g.put(114, 9, 'I');
      // switch-block stairway to the sky (secret)
      g.row(119, 11, 'OO');
      g.row(122, 9, 'OO');
      g.row(125, 7, 'OO');
      g.island(128, 6, 7, 2);
      g.put(131, 5, 'K');
      g.row(135, 6, 'OOOOOOOOOOOOOO');
      g.island(149, 6, 6, 2);
      g.put(152, 4, 'H');
      // main road below
      g.ground(121, 30, 17);
      g.put(126, 16, 's');
      g.put(133, 12, 'f');
      g.row(139, 13, '?M?');
      g.put(138, 16, 'k');
      g.put(145, 16, 's');
      g.put(152, 15, 'm');
      g.ground(158, 18, 17);
      g.put(162, 16, 'g');
      g.put(166, 16, 's');
      g.put(171, 16, 'k');
      // windy gap with two rafts
      g.put(177, 14, 'm');
      g.put(185, 12, 'm');
      g.put(188, 8, '$');
      g.ground(193, 43, 17);
      g.row(198, 13, 'B1B');
      g.put(202, 16, 'g');
      g.put(207, 16, 's');
      g.put(212, 16, 'g');
      g.put(222, 16, 'G');
    },
  },

  l3: {
    id: 'l3',
    name: 'Thunderhead Keep',
    theme: 'dusk',
    music: 'keep',
    w: 246,
    h: 24,
    exits: ['normal', 'secret'],
    boss: { x0: 208, x1: 245 },
    messages: [
      'Thunderhead Keep. Cannons spit clay pellets, and the King Mudlet waits at the top. Stomp him three times!',
      'Lock blocks crumble when a key touches them.',
    ],
    build(g) {
      g.ground(0, 21, 19);
      g.put(2, 18, 'P');
      g.put(6, 15, 'I');
      g.row(10, 15, 'BMB');
      g.put(16, 18, 'g');
      g.ground(24, 17, 19);
      g.row(29, 18, '^^');
      g.put(33, 18, 'k');
      g.put(38, 18, 'Z');
      g.put(41, 16, 'n');
      g.island(46, 16, 15, 3);
      g.row(48, 12, 'B?B');
      g.put(49, 9, '$');
      g.put(52, 15, 's');
      g.put(57, 15, 's');
      g.put(55, 11, 'f');
      // runway to the tower
      g.ground(65, 33, 19);
      g.put(77, 15, 'W');
      g.put(74, 18, 'k');
      g.put(80, 18, 'C');
      g.put(85, 18, 'g');
      g.fill(94, 11, 4, 8, 'X');
      g.cloud(90, 16, 3);
      g.cloud(91, 13, 2);
      // switch stairs to the key ledge (secret)
      g.row(99, 9, 'OO');
      g.row(102, 7, 'OO');
      g.row(105, 5, 'OO');
      g.island(108, 4, 5, 2);
      g.put(110, 3, 'K');
      g.put(112, 2, '$');
      // courtyard with the locked keyhole room
      g.ground(98, 38, 19);
      g.put(103, 18, 'g');
      g.put(108, 18, 's');
      g.put(115, 18, 'Z');
      g.put(118, 14, 'I');
      g.put(121, 18, 'X');
      g.fill(122, 17, 1, 2, 'X');
      g.row(124, 15, 'LLLLLLL');
      g.fill(124, 16, 1, 3, 'L');
      g.fill(130, 16, 1, 3, 'L');
      g.put(127, 17, 'H');
      g.put(133, 18, 'k');
      // raft crossing over the abyss
      g.put(137, 17, 'm');
      g.put(146, 15, 'm');
      g.put(147, 11, 'o');
      g.put(148, 10, 'o');
      g.put(149, 11, 'o');
      g.fill(155, 14, 3, 10, 'X');
      g.put(157, 13, 'Z');
      g.put(160, 15, 'n');
      g.put(165, 16, 'm');
      // final approach and the boss arena
      g.ground(172, 74, 19);
      g.put(178, 18, 's');
      g.put(184, 18, 'k');
      g.row(190, 15, 'M1W');
      g.put(196, 18, 'g');
      g.put(199, 17, 'X');
      g.put(199, 18, 'X');
      g.fill(203, 17, 1, 2, 'X');
      g.fill(204, 15, 1, 4, 'X');
      g.fill(206, 13, 2, 6, 'X');
      g.put(232, 17, '@');
    },
  },

  palace: {
    id: 'palace',
    name: 'Cloud Switch Palace',
    theme: 'palace',
    music: 'palace',
    w: 40,
    h: 16,
    exits: ['normal'],
    messages: ['The Cloud Switch Palace! Stomp the big switch and every dotted block in the isles turns solid.'],
    build(g) {
      g.ground(0, 40, 13);
      g.put(2, 12, 'P');
      g.put(6, 9, 'I');
      g.coinArc(10, 9, 7);
      g.row(18, 9, 'OOOO');
      g.coins(18, 8, 4);
      g.put(29, 12, 'T');
      g.fill(36, 6, 4, 7, 'X');
    },
  },
};

function buildLevel(id) {
  const spec = LEVEL_SPECS[id];
  const g = new LevelGrid(spec.w, spec.h);
  spec.build(g);
  return g;
}
