'use strict';
// Small math, randomness, color and storage helpers shared by every module.

const U = {
  clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  },
  lerp(a, b, t) {
    return a + (b - a) * t;
  },
  approach(v, target, delta) {
    return v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);
  },
  sign(v) {
    return v > 0 ? 1 : v < 0 ? -1 : 0;
  },
  // Deterministic integer hash -> [0, 1).
  hash(n) {
    n = (n | 0) ^ 0x9e3779b9;
    n = Math.imul(n ^ (n >>> 16), 0x85ebca6b);
    n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
    n ^= n >>> 16;
    return (n >>> 0) / 4294967296;
  },
  hash2(x, y, s = 0) {
    return U.hash(Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177));
  },
  // Seeded PRNG (mulberry32).
  rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
  rand(a, b) {
    return a + Math.random() * (b - a);
  },
  overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  },
  easeOutBack(t) {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  },

  // ---- colors ----
  _rgbCache: new Map(),
  _shadeCache: new Map(),
  rgb(hex) {
    let c = U._rgbCache.get(hex);
    if (c) return c;
    let h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    U._rgbCache.set(hex, c);
    return c;
  },
  toHex(r, g, b) {
    const f = (v) => U.clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
    return '#' + f(r) + f(g) + f(b);
  },
  // amt < 0 darkens toward a warm shadow, amt > 0 lightens toward white.
  shade(hex, amt) {
    const key = hex + amt;
    let s = U._shadeCache.get(key);
    if (s) return s;
    const [r, g, b] = U.rgb(hex);
    if (amt < 0) {
      const k = 1 + amt;
      // shadows in clay skew slightly toward purple-brown rather than pure black
      s = U.toHex(r * k + 18 * -amt, g * k + 6 * -amt, b * k + 28 * -amt);
    } else {
      s = U.toHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
    }
    U._shadeCache.set(key, s);
    return s;
  },
  mix(a, b, t) {
    const A = U.rgb(a), B = U.rgb(b);
    return U.toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  },
  rgba(hex, a) {
    const [r, g, b] = U.rgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  },
};

// localStorage can throw (private mode, blocked storage) — never let it break the game.
const Store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* storage unavailable */
    }
  },
  del(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      /* storage unavailable */
    }
  },
};
