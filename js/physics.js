'use strict';
// Tile classification and axis-separated AABB movement against the tile grid.
// Pure logic (no DOM) so the level reachability test can run it in Node.

const TILE_SOLID = new Set(['#', 'X', '?', 'M', 'W', 'E', '1', 'B', 'U', 'I', 'L', 'Z', '^']);
const TILE_ONEWAY = new Set(['=']);
const TILE_HITTABLE = new Set(['?', 'M', 'W', 'E', '1', 'B', 'I']);
const TILE_STATIC = new Set(['#', '=', '^', 'X']); // baked into terrain chunks
const TILE_DYNAMIC = new Set(['?', 'M', 'W', 'E', '1', 'B', 'U', 'I', 'L', 'O', 'Z']); // drawn every frame

// Grid wrapper used by both the runtime Level and the test harness.
// `rows` is an array of arrays of single-char strings.
function makeTileQuery(rows, w, h, switchOn) {
  return {
    w,
    h,
    tile(tx, ty) {
      if (ty < 0 || ty >= h || tx < 0 || tx >= w) return '.';
      return rows[ty][tx];
    },
    solidAt(tx, ty) {
      if (tx < 0 || tx >= w) return true; // level edges are walls
      if (ty < 0 || ty >= h) return false; // open sky above, bottomless clouds below
      const c = rows[ty][tx];
      return TILE_SOLID.has(c) || (c === 'O' && switchOn());
    },
    oneWayAt(tx, ty) {
      if (tx < 0 || tx >= w || ty < 0 || ty >= h) return false;
      return TILE_ONEWAY.has(rows[ty][tx]);
    },
  };
}

// Moves `body` ({x,y,w,h,vx,vy,onGround}) by its velocity, resolving tile collisions.
// opts.corner: pixels of ceiling-corner forgiveness (nudges the body around block edges).
// Returns {left, right, ceil: [[tx,ty],...], landed}.
function moveBody(body, q, opts) {
  const T = TILE;
  const res = { left: false, right: false, ceil: null, landed: false };

  // ---- horizontal ----
  if (body.vx !== 0) {
    body.x += body.vx;
    const y0 = Math.floor(body.y / T);
    const y1 = Math.floor((body.y + body.h - 0.01) / T);
    if (body.vx > 0) {
      const tx = Math.floor((body.x + body.w - 0.01) / T);
      for (let ty = y0; ty <= y1; ty++) {
        if (q.solidAt(tx, ty)) {
          body.x = tx * T - body.w;
          res.right = true;
          break;
        }
      }
    } else {
      const tx = Math.floor(body.x / T);
      for (let ty = y0; ty <= y1; ty++) {
        if (q.solidAt(tx, ty)) {
          body.x = (tx + 1) * T;
          res.left = true;
          break;
        }
      }
    }
  }

  // ---- vertical ----
  const prevBottom = body.y + body.h;
  body.y += body.vy;
  body.onGround = false;
  let x0 = Math.floor(body.x / T);
  let x1 = Math.floor((body.x + body.w - 0.01) / T);
  if (body.vy >= 0) {
    const ty = Math.floor((body.y + body.h - 0.01) / T);
    for (let tx = x0; tx <= x1; tx++) {
      if (q.solidAt(tx, ty) || (q.oneWayAt(tx, ty) && prevBottom <= ty * T + 0.5)) {
        body.y = ty * T - body.h;
        body.vy = 0;
        body.onGround = true;
        res.landed = true;
        break;
      }
    }
  } else {
    const ty = Math.floor(body.y / T);
    let hits = null;
    for (let tx = x0; tx <= x1; tx++) {
      if (q.solidAt(tx, ty)) (hits || (hits = [])).push([tx, ty]);
    }
    if (hits && opts && opts.corner && hits.length === 1) {
      // Corner correction: if we only clip the edge of one block, slide around it.
      const [hx] = hits[0];
      const c = opts.corner;
      if (hx === x0 && (hx + 1) * T - body.x <= c && !q.solidAt(hx + 1, ty)) {
        body.x = (hx + 1) * T;
        hits = null;
      } else if (hx === x1 && body.x + body.w - hx * T <= c && !q.solidAt(hx - 1, ty)) {
        body.x = hx * T - body.w;
        hits = null;
      }
    }
    if (hits) {
      body.y = (ty + 1) * T;
      body.vy = 0;
      res.ceil = hits;
    }
  }
  return res;
}

// True if any tile overlapping the rect (optionally grown by `pad`) matches `pred(char)`.
function rectTouchesTile(q, x, y, w, h, pad, pred) {
  const T = TILE;
  const x0 = Math.floor((x - pad) / T), x1 = Math.floor((x + w + pad - 0.01) / T);
  const y0 = Math.floor((y - pad) / T), y1 = Math.floor((y + h + pad - 0.01) / T);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (pred(q.tile(tx, ty), tx, ty)) return [tx, ty];
    }
  }
  return null;
}
