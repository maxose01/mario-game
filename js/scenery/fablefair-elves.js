'use strict';
// The looks of Fable Fair's third lap, the Dream Skyway, as a night flight through an elf realm in
// the scenes of a dark ride (browser only; see js/courses/fablefair.js): a bay of floating castles
// (Lantern Castles), the Elf Wood, the Moonflower Garden, the star stairs and the star tunnel, the
// Moon and the Milky Way, and Troll Hollow. This file has the road surfaces and walls of those
// scenes; the elves, trolls, castles and the rest of the scenery follow in fablefair-realm.js.
// Everything is lumpy clay primitives (GK) or painted on a canvas: no files.
(() => {
  // draw something at y and again a tile above or below, so a road texture repeats without a seam
  const tile = (y, h, fn) => {
    fn(y);
    if (y < h) fn(y + 256);
    if (y > 256 - h) fn(y - 256);
  };
  const star = (g, x, y, r, pts = 5, inner = 0.45) => {
    g.beginPath();
    for (let q = 0; q < pts * 2; q++) {
      const a = (q / (pts * 2)) * TAU - Math.PI / 2, rr = q % 2 ? r * inner : r;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
  };

  // ------------------------------------------------------------------------ road surfaces
  Object.assign(ROAD_TEXTURES, {
    // Elf Wood: a dark mossy path of pale stepping stones, with petals, fireflies and a glow along both edges.
    elfpath(g, rnd, smear) {
      g.fillStyle = '#34304f';
      g.fillRect(0, 0, 128, 256);
      smear(g, 128, 256, 44, 0.07);
      // moss creeping in from both edges
      for (let k = 0; k < 120; k++) {
        const edge = rnd() < 0.6;
        const x = edge ? (rnd() < 0.5 ? rnd() * 22 : 106 + rnd() * 22) : rnd() * 128;
        const y = rnd() * 256, rx = 3 + rnd() * 8, ry = 2 + rnd() * 5;
        g.fillStyle = `rgba(${55 + Math.floor(rnd() * 30)},${105 + Math.floor(rnd() * 50)},${95 + Math.floor(rnd() * 40)},${0.2 + rnd() * 0.3})`;
        tile(y, 12, (yy) => {
          g.beginPath();
          g.ellipse(x, yy, rx, ry, rnd() * 3, 0, TAU);
          g.fill();
        });
      }
      // cobbles: rounded flat stones of every size, packed in loosely (wrapping at the top and bottom)
      const stones = ['#8d88b2', '#7f7aa6', '#9a96bc', '#86a0b0', '#a29cc4'];
      const placed = [];
      for (let tries = 0; tries < 5000 && placed.length < 300; tries++) {
        const rx = 4.5 + rnd() * 5, ry = rx * (0.7 + rnd() * 0.25), x = 8 + rnd() * 112, y = rnd() * 256;
        if (placed.some((o) => { const dy = Math.min(Math.abs(o.y - y), 256 - Math.abs(o.y - y)); return ((o.x - x) / (o.rx + rx + 1.6)) ** 2 + (dy / (o.ry + ry + 1.6)) ** 2 < 1; })) continue;
        placed.push({ x, y, rx, ry });
        const rot = (rnd() - 0.5) * 0.5, col = stones[Math.floor(rnd() * stones.length)];
        tile(y, 24, (yy) => {
          g.save();
          g.translate(x, yy);
          g.rotate(rot);
          g.fillStyle = col;
          g.beginPath();
          g.ellipse(0, 0, rx, ry, 0, 0, TAU);
          g.fill();
          g.fillStyle = 'rgba(215,255,240,0.22)';
          g.beginPath();
          g.ellipse(-rx * 0.15, -ry * 0.35, rx * 0.6, ry * 0.32, 0, 0, TAU);
          g.fill();
          g.strokeStyle = 'rgba(30,24,64,0.5)';
          g.lineWidth = 1.4;
          g.beginPath();
          g.ellipse(0, 0, rx, ry, 0, 0, TAU);
          g.stroke();
          g.restore();
        });
      }
      // fallen petals and the odd firefly
      for (let k = 0; k < 26; k++) {
        g.fillStyle = ['rgba(255,170,215,0.55)', 'rgba(210,190,255,0.55)', 'rgba(255,235,170,0.5)'][k % 3];
        const x = 10 + rnd() * 108, y = rnd() * 256;
        tile(y, 6, (yy) => {
          g.beginPath();
          g.ellipse(x, yy, 2.5, 1.4, rnd() * 3, 0, TAU);
          g.fill();
        });
      }
      g.fillStyle = 'rgba(255,245,170,0.9)';
      for (let k = 0; k < 9; k++) {
        const y = rnd() * 256, x = 12 + rnd() * 104;
        tile(y, 4, (yy) => {
          g.beginPath();
          g.arc(x, yy, 1.4, 0, TAU);
          g.fill();
        });
      }
      g.fillStyle = 'rgba(150,255,225,0.5)';
      g.fillRect(4, 0, 3, 256);
      g.fillRect(121, 0, 3, 256);
    },
    // Moonflower Garden: a lilac road strewn with petals and gold pollen, a braid of blossoms at each edge.
    petal(g, rnd, smear) {
      const grd = g.createLinearGradient(0, 0, 128, 0);
      grd.addColorStop(0, '#cdb4e6');
      grd.addColorStop(0.5, '#e2d2f3');
      grd.addColorStop(1, '#cdb4e6');
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 256);
      smear(g, 128, 256, 50, 0.05);
      // petals: little ellipses on their sides, in pinks, whites and lavenders
      const cols = ['#ffffff', '#ffd2ea', '#f6b4de', '#d9c4ff', '#fff0f8', '#c9a8f0'];
      for (let k = 0; k < 190; k++) {
        const x = 12 + rnd() * 104, y = rnd() * 256, a = rnd() * Math.PI, w = 3 + rnd() * 4;
        g.fillStyle = cols[Math.floor(rnd() * cols.length)];
        g.globalAlpha = 0.5 + rnd() * 0.45;
        tile(y, 8, (yy) => {
          g.beginPath();
          g.ellipse(x, yy, w, w * 0.5, a, 0, TAU);
          g.fill();
        });
      }
      g.globalAlpha = 1;
      // pollen
      g.fillStyle = 'rgba(255,214,110,0.85)';
      for (let k = 0; k < 40; k++) {
        const x = 10 + rnd() * 108, y = rnd() * 256;
        tile(y, 3, (yy) => {
          g.beginPath();
          g.arc(x, yy, 0.9 + rnd() * 0.8, 0, TAU);
          g.fill();
        });
      }
      // a braid of blossoms along each edge
      for (let y = 0; y < 256; y += 12) {
        for (const [x, k] of [[8, 0], [120, 1]]) {
          g.fillStyle = (y / 12 + k) % 2 ? '#a070d8' : '#f08cc4';
          g.beginPath();
          g.arc(x, y + 6, 5, 0, TAU);
          g.fill();
          g.fillStyle = '#fff3b0';
          g.beginPath();
          g.arc(x, y + 6, 1.6, 0, TAU);
          g.fill();
        }
      }
    },
    // The castle hall and Troll Hollow: big flagstones, cracked, with moss in the joints and a damp green glow.
    flagstone(g, rnd, smear) {
      g.fillStyle = '#4a4560';
      g.fillRect(0, 0, 128, 256);
      const cols = ['#8e88a8', '#7f7a9a', '#9a94b2', '#85809f'];
      const rows = [0, 64, 128, 190, 256];
      for (let r = 0; r < rows.length - 1; r++) {
        let x = r % 2 ? -26 : 0;
        while (x < 128) {
          const w = 38 + rnd() * 30;
          g.fillStyle = cols[Math.floor(rnd() * cols.length)];
          Clay.rrect(g, x + 1.5, rows[r] + 1.5, w - 3, rows[r + 1] - rows[r] - 3, 7);
          g.fill();
          g.fillStyle = 'rgba(255,255,255,0.12)';
          Clay.rrect(g, x + 5, rows[r] + 4, w * 0.5, 5, 2);
          g.fill();
          // a crack
          if (rnd() < 0.45) {
            g.strokeStyle = 'rgba(40,36,60,0.55)';
            g.lineWidth = 1.2;
            g.beginPath();
            g.moveTo(x + 8 + rnd() * (w - 16), rows[r] + 4);
            g.lineTo(x + 8 + rnd() * (w - 16), rows[r] + (rows[r + 1] - rows[r]) * (0.4 + rnd() * 0.5));
            g.stroke();
          }
          x += w;
        }
      }
      smear(g, 128, 256, 36, 0.05);
      // moss and a faint glow in the joints
      for (let k = 0; k < 70; k++) {
        const x = rnd() * 128, y = rnd() * 256;
        g.fillStyle = `rgba(${70 + Math.floor(rnd() * 30)},${150 + Math.floor(rnd() * 50)},${100 + Math.floor(rnd() * 40)},${0.16 + rnd() * 0.22})`;
        tile(y, 10, (yy) => {
          g.beginPath();
          g.ellipse(x, yy, 3 + rnd() * 7, 2 + rnd() * 4, rnd() * 3, 0, TAU);
          g.fill();
        });
      }
      g.fillStyle = 'rgba(190,175,255,0.35)';
      g.fillRect(4, 0, 3, 256);
      g.fillRect(121, 0, 3, 256);
    },
    // The star tunnel: a night-blue road with a lane of glowing dots, shining edges and a dusting of stars.
    starroad(g, rnd, smear) {
      const grd = g.createLinearGradient(0, 0, 128, 0);
      grd.addColorStop(0, '#1b1550');
      grd.addColorStop(0.5, '#2c2a78');
      grd.addColorStop(1, '#1b1550');
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 256);
      smear(g, 128, 256, 40, 0.06);
      // faint swirls of cosmic dust
      g.lineWidth = 2;
      for (let k = 0; k < 14; k++) {
        const x = rnd() * 128, y = rnd() * 256, r = 8 + rnd() * 16;
        g.strokeStyle = rnd() < 0.5 ? 'rgba(140,120,255,0.3)' : 'rgba(90,200,255,0.25)';
        tile(y, r + 4, (yy) => {
          g.beginPath();
          g.arc(x, yy, r, rnd() * 3, rnd() * 3 + 2.6);
          g.stroke();
        });
      }
      // stars, some bright
      for (let k = 0; k < 70; k++) {
        const x = 8 + rnd() * 112, y = rnd() * 256, r = 0.8 + rnd() * 2.2;
        g.fillStyle = rnd() < 0.2 ? 'rgba(255,225,150,0.95)' : 'rgba(225,235,255,0.85)';
        tile(y, 5, (yy) => (r > 2 ? star(g, x, yy, r * 1.6, 4, 0.35) : (g.beginPath(), g.arc(x, yy, r, 0, TAU), g.fill())));
      }
      // a dotted lane down the middle and glowing edge lines
      g.fillStyle = 'rgba(190,210,255,0.9)';
      for (let y = 4; y < 256; y += 16) {
        g.beginPath();
        g.arc(64, y, 2.2, 0, TAU);
        g.fill();
      }
      g.fillStyle = 'rgba(130,150,255,0.8)';
      g.fillRect(4, 0, 3, 256);
      g.fillRect(121, 0, 3, 256);
      g.fillStyle = 'rgba(190,210,255,0.55)';
      g.fillRect(5, 0, 1, 256);
      g.fillRect(122, 0, 1, 256);
    },
    // The star stairs: pale marble treads, each with a gold lip and a soft shadow under it, stardust in the grain.
    stairs(g, rnd, smear) {
      const grd = g.createLinearGradient(0, 0, 128, 0);
      grd.addColorStop(0, '#c4b8ee');
      grd.addColorStop(0.5, '#ddd2fa');
      grd.addColorStop(1, '#c4b8ee');
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 256);
      smear(g, 128, 256, 40, 0.05);
      for (let i = 0; i < 8; i++) {
        const y = i * 32, tg = g.createLinearGradient(0, y, 0, y + 32);
        tg.addColorStop(0, 'rgba(255,255,255,0.4)');
        tg.addColorStop(0.8, 'rgba(120,100,190,0.16)');
        tg.addColorStop(1, 'rgba(50,30,110,0.45)');
        g.fillStyle = tg;
        g.fillRect(0, y, 128, 32);
        g.fillStyle = '#ffd98a';
        g.fillRect(0, y + 1, 128, 2.5);
        g.fillStyle = 'rgba(255,255,255,0.75)';
        g.fillRect(0, y + 3.5, 128, 1);
      }
      for (let k = 0; k < 60; k++) {
        const x = 8 + rnd() * 112, y = rnd() * 256, r = 0.8 + rnd() * 1.6;
        g.fillStyle = rnd() < 0.4 ? 'rgba(255,225,150,0.9)' : 'rgba(255,255,255,0.85)';
        tile(y, 5, (yy) => (r > 1.8 ? star(g, x, yy, r * 1.6, 4, 0.35) : (g.beginPath(), g.arc(x, yy, r, 0, TAU), g.fill())));
      }
      g.fillStyle = 'rgba(255,214,120,0.9)';
      g.fillRect(4, 0, 3, 256);
      g.fillRect(121, 0, 3, 256);
    },
  });
  Object.assign(FLUSH_STYLES, { elfpath: true, petal: true, flagstone: true, starroad: true, stairs: true });
  Object.assign(SHOULDER_COL, { elfpath: '#3a3360', petal: '#b898dc', flagstone: '#6a6488', starroad: '#241c5a', stairs: '#b9aee4' });

  // ------------------------------------------------------------------------ walls
  Object.assign(WALL_LOOKS, {
    // the Elf Wood: a thick, glowing hedge of teal leaves
    glowhedge: { prof: [[-0.2, -0.3], [-0.3, 0.7], [0.1, 1.55], [0.9, 1.9], [1.7, 1.5], [2.1, 0.5], [2.25, -0.3]], col: '#3fb8a6', wob: true, depth: 2.25 },
    // the Moonflower Garden: a hedge in bloom, lilac and pink
    bloomhedge: { prof: [[-0.2, -0.3], [-0.3, 0.7], [0.1, 1.5], [0.9, 1.85], [1.7, 1.45], [2.1, 0.5], [2.25, -0.3]], col: '#b784e0', wob: true, depth: 2.25 },
    // Troll Hollow: rough, mossy boulders
    trollrock: { prof: [[-0.2, -0.6], [-0.25, 1.5], [0.5, 2.7], [1.5, 3.3], [2.6, 3.0], [3.4, -0.6]], col: '#8e8aae', wob: true, depth: 3.4 },
  });
})();
