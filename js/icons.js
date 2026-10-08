'use strict';
// 2D clay icons drawn with the side-scroller's Clay toolkit: items, racer portraits, kart
// bodies, wheels, paint swatches, keys and coins. Used by the HUD (canvas) and by the garage
// and phone controller (as little canvases in the page).

const Icons = {
  // Draw into a fresh canvas element (crisp on high-DPI screens).
  canvas(w, h, draw, still = true) {
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const c = Clay.makeCanvas(w * dpr, h * dpr);
    c.style.width = w + 'px';
    c.style.height = h + 'px';
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const was = Clay.still;
    Clay.still = still;
    draw(g, w, h);
    Clay.still = was;
    return c;
  },

  item(g, kind, x, y, s) {
    const B = (cx, cy, rx, ry, col, seed, o) => Clay.blob(g, x + cx * s, y + cy * s, rx * s, ry * s, col, seed, o);
    switch (kind) {
      case 'mushroom':
      case 'triple': {
        const one = (ox, oy, k) => {
          B(ox, oy + 0.18, 0.2, 0.2, '#fff1d6', 3 + k);
          B(ox, oy - 0.08, 0.36, 0.25, '#e8483f', 4 + k);
          B(ox - 0.14, oy - 0.14, 0.08, 0.07, '#ffffff', 5 + k, { flat: true });
          B(ox + 0.14, oy - 0.1, 0.07, 0.06, '#ffffff', 6 + k, { flat: true });
          B(ox - 0.07, oy + 0.15, 0.03, 0.05, '#2a1a22', 7 + k, { flat: true });
          B(ox + 0.07, oy + 0.15, 0.03, 0.05, '#2a1a22', 8 + k, { flat: true });
        };
        if (kind === 'triple') {
          g.save();
          g.translate(x, y);
          g.scale(0.62, 0.62);
          g.translate(-x, -y);
          one(-0.42, 0.22, 0);
          one(0.42, 0.22, 10);
          one(0, -0.3, 20);
          g.restore();
        } else one(0, 0, 0);
        break;
      }
      case 'banana':
        for (let k = 0; k < 5; k++) {
          const a = (k / 4 - 0.5) * 1.6;
          B(Math.sin(a) * 0.3, 0.12 - Math.cos(a) * 0.22 + 0.1, 0.13, 0.12, '#ffe066', 30 + k);
        }
        B(-0.33, -0.18, 0.05, 0.05, '#6b4a24', 36, { flat: true });
        break;
      case 'green':
      case 'red': {
        const col = kind === 'green' ? '#4fbf5a' : '#e8483f';
        B(0, 0.16, 0.38, 0.12, '#fff1d6', 40);
        B(0, -0.02, 0.36, 0.28, col, 41);
        for (let k = -1; k <= 1; k++) B(k * 0.16, -0.08 + Math.abs(k) * 0.06, 0.06, 0.05, '#fff6ea', 42 + k, { flat: true });
        g.strokeStyle = '#fff6ea';
        g.lineWidth = s * 0.06;
        g.beginPath();
        g.ellipse(x, y + 0.12 * s, 0.36 * s, 0.08 * s, 0, 0, Math.PI);
        g.stroke();
        break;
      }
      case 'bomb':
        B(0, 0.06, 0.32, 0.32, '#3b2a4a', 50);
        g.strokeStyle = '#8a8396';
        g.lineWidth = s * 0.06;
        g.beginPath();
        g.moveTo(x, y - 0.26 * s);
        g.quadraticCurveTo(x + 0.1 * s, y - 0.4 * s, x + 0.18 * s, y - 0.38 * s);
        g.stroke();
        B(0.2, -0.4, 0.07, 0.07, '#ffb347', 51);
        B(-0.1, 0.02, 0.05, 0.08, '#ffffff', 52, { flat: true });
        B(0.1, 0.02, 0.05, 0.08, '#ffffff', 53, { flat: true });
        break;
      case 'star': {
        g.save();
        g.translate(x, y);
        g.beginPath();
        for (let k = 0; k < 10; k++) {
          const r = (k % 2 ? 0.17 : 0.4) * s;
          const a = -Math.PI / 2 + (k * Math.PI) / 5;
          g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        g.closePath();
        g.fillStyle = '#c98a16';
        g.save();
        g.translate(0, 0.03 * s);
        g.fill();
        g.restore();
        g.fillStyle = '#ffd84a';
        g.fill();
        g.fillStyle = '#2a1a22';
        g.fillRect(-0.08 * s, -0.04 * s, 0.04 * s, 0.09 * s);
        g.fillRect(0.04 * s, -0.04 * s, 0.04 * s, 0.09 * s);
        g.restore();
        break;
      }
      case 'coin':
        this.coin(g, x - 0.12 * s, y + 0.06 * s, s * 0.7);
        this.coin(g, x + 0.12 * s, y - 0.06 * s, s * 0.7);
        break;
    }
  },

  coin(g, x, y, s) {
    Clay.blob(g, x, y, 0.3 * s, 0.36 * s, '#f7c331', 61, { wob: 0.03 });
    g.fillStyle = '#ffe680';
    Clay.rrect(g, x - 0.05 * s, y - 0.18 * s, 0.1 * s, 0.36 * s, 0.05 * s);
    g.fill();
  },

  key(g, x, y, s, col = '#ffcc3d') {
    g.save();
    g.translate(x, y);
    g.rotate(-0.6);
    g.strokeStyle = U.shade(col, -0.35);
    g.lineWidth = s * 0.14;
    g.beginPath();
    g.arc(0, -0.2 * s, 0.17 * s, 0, TAU);
    g.stroke();
    g.strokeStyle = col;
    g.lineWidth = s * 0.1;
    g.stroke();
    g.fillStyle = col;
    Clay.rrect(g, -0.05 * s, -0.05 * s, 0.1 * s, 0.48 * s, 0.04 * s);
    g.fill();
    g.fillRect(0, 0.26 * s, 0.14 * s, 0.07 * s);
    g.fillRect(0, 0.14 * s, 0.1 * s, 0.06 * s);
    g.restore();
  },

  // Racer portrait (a clay head), facing right.
  head(g, id, x, y, s) {
    const ch = findPart('character', id) || CHARACTERS[0];
    const c = ch.col;
    const B = (cx, cy, rx, ry, col, seed, o) => Clay.blob(g, x + cx * s, y + cy * s, rx * s, ry * s, col, seed, o);
    const eye = (cx, cy, r = 0.1) => {
      B(cx, cy, r * 0.75, r, '#fffaf0', 90 + cx * 10, { sheen: 0.3 });
      B(cx + r * 0.3, cy + r * 0.1, r * 0.38, r * 0.55, '#2a1a22', 92 + cx * 10, { flat: true });
    };
    if (id === 'dumpling') {
      B(0, 0, 0.36, 0.34, c.skin, 1);
      B(0.26, 0.08, 0.24, 0.18, c.skin, 2);
      B(-0.16, -0.22, 0.08, 0.07, c.second, 3, { flat: true });
      B(0.02, -0.3, 0.06, 0.05, c.second, 4, { flat: true });
      eye(0.08, -0.1, 0.12);
      B(0.42, 0.06, 0.03, 0.03, '#2a1a22', 5, { flat: true });
    } else if (id === 'shelly') {
      B(-0.22, 0.08, 0.3, 0.3, c.main, 11);
      g.strokeStyle = U.shade(c.main, -0.25);
      g.lineWidth = s * 0.05;
      g.beginPath();
      g.arc(x - 0.22 * s, y + 0.08 * s, 0.15 * s, 0, Math.PI * 1.6);
      g.stroke();
      B(0.14, 0.12, 0.24, 0.22, c.skin, 12);
      g.strokeStyle = c.skin;
      g.lineWidth = s * 0.06;
      g.beginPath();
      g.moveTo(x + 0.12 * s, y - 0.02 * s);
      g.lineTo(x + 0.06 * s, y - 0.3 * s);
      g.moveTo(x + 0.24 * s, y - 0.02 * s);
      g.lineTo(x + 0.3 * s, y - 0.3 * s);
      g.stroke();
      eye(0.06, -0.34, 0.09);
      eye(0.3, -0.34, 0.09);
    } else if (id === 'flapper') {
      B(0, 0, 0.34, 0.34, c.skin, 21);
      B(-0.04, -0.34, 0.08, 0.12, c.hair, 22);
      B(0.36, 0.06, 0.14, 0.08, c.second, 23);
      eye(0.12, -0.06, 0.11);
      B(-0.24, 0.12, 0.14, 0.1, U.shade(c.skin, -0.1), 24);
    } else if (id === 'mudlet') {
      B(0, 0.04, 0.38, 0.34, c.skin, 31);
      g.fillStyle = c.main;
      g.beginPath();
      g.moveTo(x - 0.26 * s, y - 0.2 * s);
      for (let k = 0; k <= 4; k++) g.lineTo(x + (-0.26 + k * 0.13) * s, y - (k % 2 ? 0.28 : 0.46) * s);
      g.lineTo(x + 0.26 * s, y - 0.2 * s);
      g.closePath();
      g.fill();
      B(0, -0.32, 0.04, 0.04, c.second, 32, { flat: true });
      eye(0.1, -0.02, 0.1);
      eye(0.26, -0.02, 0.09);
      g.strokeStyle = c.accent;
      g.lineWidth = s * 0.05;
      g.beginPath();
      g.moveTo(x + 0.02 * s, y - 0.18 * s);
      g.lineTo(x + 0.18 * s, y - 0.12 * s);
      g.stroke();
    } else if (id === 'sprout') {
      B(0.02, 0.12, 0.27, 0.25, c.skin, 61);
      B(0, -0.16, 0.42, 0.24, c.main, 62);
      B(-0.2, -0.22, 0.08, 0.07, c.second, 63, { flat: true });
      B(0.12, -0.28, 0.08, 0.07, c.second, 64, { flat: true });
      B(0.3, -0.12, 0.06, 0.05, c.second, 65, { flat: true });
      eye(0.06, 0.1, 0.09);
      eye(0.22, 0.1, 0.08);
    } else if (id === 'puff') {
      for (const [x, y, r] of [[-0.24, -0.08, 0.18], [0.0, -0.22, 0.2], [0.22, -0.1, 0.18], [-0.28, 0.14, 0.16], [0.28, 0.14, 0.16]]) B(x, y, r, r * 0.9, c.hair, 70 + x * 10);
      B(0, 0.06, 0.36, 0.3, c.skin, 71);
      B(-0.16, 0.16, 0.07, 0.05, c.main, 72, { flat: true });
      B(0.24, 0.16, 0.07, 0.05, c.main, 73, { flat: true });
      eye(0.0, 0.02, 0.09);
      eye(0.16, 0.02, 0.09);
    } else if (id === 'thornbun') {
      B(-0.08, -0.36, 0.08, 0.24, c.skin, 41);
      B(0.1, -0.38, 0.08, 0.24, c.skin, 42);
      B(0, 0.04, 0.33, 0.31, c.skin, 43);
      for (let k = 0; k < 3; k++) B(-0.3, -0.12 + k * 0.14, 0.09, 0.05, c.main, 44 + k);
      eye(0.1, -0.04, 0.1);
      B(0.32, 0.08, 0.05, 0.04, '#ff86b6', 47, { flat: true });
    } else {
      B(-0.24, 0.02, 0.12, 0.14, c.hair, 51);
      B(0.02, 0.04, 0.33, 0.32, c.skin, 52);
      B(0.32, 0.1, 0.14, 0.12, '#efa47f', 53);
      B(0, -0.2, 0.36, 0.18, c.main, 54);
      B(0.3, -0.13, 0.2, 0.06, U.shade(c.main, -0.12), 55);
      B(0.05, -0.27, 0.07, 0.06, '#fffaf0', 56, { flat: true });
      eye(0.14, -0.02, 0.09);
      B(0.26, 0.24, 0.1, 0.04, c.hair, 57, { flat: true });
    }
  },

  // Kart body seen from the side (paint colour applied).
  body(g, id, x, y, s, paint = '#e2483d') {
    const B = (cx, cy, rx, ry, col, seed, o) => Clay.blob(g, x + cx * s, y + cy * s, rx * s, ry * s, col, seed, o);
    const wheel = (cx) => B(cx, 0.22, 0.13, 0.13, '#3b2a3a', 70 + cx * 10);
    if (id === 'bubble') {
      B(0, 0, 0.42, 0.22, paint, 1);
      B(0.12, -0.18, 0.16, 0.13, '#bfe8ff', 2);
    } else if (id === 'teacup') {
      B(0, 0.14, 0.44, 0.06, U.shade(paint, 0.2), 3);
      B(0, -0.04, 0.3, 0.2, paint, 4);
      g.strokeStyle = paint;
      g.lineWidth = s * 0.06;
      g.beginPath();
      g.arc(x - 0.34 * s, y - 0.04 * s, 0.1 * s, 0, TAU);
      g.stroke();
    } else if (id === 'mudtank') {
      g.fillStyle = U.shade(paint, -0.3);
      Clay.rrect(g, x - 0.46 * s, y - 0.2 * s, 0.92 * s, 0.34 * s, 0.08 * s);
      g.fill();
      g.fillStyle = paint;
      Clay.rrect(g, x - 0.44 * s, y - 0.22 * s, 0.86 * s, 0.28 * s, 0.07 * s);
      g.fill();
      g.fillStyle = '#3b2a3a';
      g.fillRect(x + 0.36 * s, y - 0.02 * s, 0.12 * s, 0.1 * s);
    } else if (id === 'pipe') {
      B(0.04, 0.02, 0.5, 0.13, paint, 5);
      g.strokeStyle = '#c9c3d6';
      g.lineWidth = s * 0.07;
      g.beginPath();
      g.moveTo(x - 0.3 * s, y - 0.05 * s);
      g.lineTo(x - 0.52 * s, y - 0.28 * s);
      g.stroke();
    } else if (id === 'rocket') {
      B(-0.06, 0, 0.36, 0.16, paint, 6);
      g.fillStyle = U.shade(paint, 0.15);
      g.beginPath();
      g.moveTo(x + 0.26 * s, y - 0.12 * s);
      g.lineTo(x + 0.55 * s, y + 0.02 * s);
      g.lineTo(x + 0.26 * s, y + 0.14 * s);
      g.fill();
      g.beginPath();
      g.moveTo(x - 0.3 * s, y - 0.08 * s);
      g.lineTo(x - 0.44 * s, y - 0.36 * s);
      g.lineTo(x - 0.2 * s, y - 0.1 * s);
      g.fill();
    } else {
      B(0, 0, 0.44, 0.16, paint, 7);
      B(0.32, 0.02, 0.16, 0.11, U.shade(paint, 0.12), 8);
      g.fillStyle = U.shade(paint, -0.2);
      g.fillRect(x - 0.44 * s, y - 0.3 * s, 0.06 * s, 0.18 * s);
      Clay.rrect(g, x - 0.52 * s, y - 0.34 * s, 0.24 * s, 0.06 * s, 0.02 * s);
      g.fill();
    }
    wheel(-0.3);
    wheel(0.3);
  },

  wheel(g, id, x, y, s) {
    const B = (cx, cy, rx, ry, col, seed, o) => Clay.blob(g, x + cx * s, y + cy * s, rx * s, ry * s, col, seed, o);
    if (id === 'button') {
      B(0, 0, 0.36, 0.36, '#ffd6a8', 1);
      for (const [a, b] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) B(a * 0.1, b * 0.1, 0.05, 0.05, '#6b3d24', 2 + a + b * 3, { flat: true });
    } else if (id === 'monster') {
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * TAU;
        B(Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0.08, 0.08, '#2e2030', 10 + k, { flat: true });
      }
      B(0, 0, 0.38, 0.38, '#3b2a3a', 3);
      B(0, 0, 0.16, 0.16, '#ffd166', 4);
    } else if (id === 'slick') {
      B(0, 0, 0.36, 0.36, '#2e2030', 5);
      B(0, 0, 0.26, 0.26, '#ffcf40', 6);
    } else {
      B(0, 0, 0.36, 0.36, '#3b2a3a', 7);
      B(0, 0, 0.14, 0.14, '#e9e9e9', 8);
    }
  },

  paint(g, p, x, y, s, time = 0) {
    let col = p.color;
    if (p.special === 'rainbow') {
      const grd = g.createLinearGradient(x - s * 0.4, y, x + s * 0.4, y);
      ['#ff6f91', '#ffb347', '#ffe066', '#7ddc6f', '#58b4ff', '#b48cff'].forEach((c, i) => grd.addColorStop(i / 5, c));
      Clay.blob(g, x, y, s * 0.36, s * 0.32, '#b48cff', 3);
      g.fillStyle = grd;
      Clay.blobPath(g, x - s * 0.02, y - s * 0.03, s * 0.32, s * 0.27, 3);
      g.fill();
      return;
    }
    Clay.blob(g, x, y, s * 0.36, s * 0.32, col, 3);
    if (p.special === 'gold') {
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.beginPath();
      g.ellipse(x + s * 0.1, y - s * 0.1, s * 0.08, s * 0.04, -0.6, 0, TAU);
      g.fill();
    }
  },

  // Any catalogue part as an icon.
  part(g, kind, part, x, y, s, cfg) {
    if (kind === 'character') this.head(g, part.id, x, y, s);
    else if (kind === 'body') this.body(g, part.id, x, y, s, findPart('paint', (cfg && cfg.paint) || 'cherry').color);
    else if (kind === 'wheels') this.wheel(g, part.id, x, y, s);
    else if (kind === 'paint') this.paint(g, part, x, y, s);
  },
};
