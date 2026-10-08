#!/usr/bin/env node
'use strict';
// Clay Kart party server. No dependencies: `node server.js`.
// - Serves the game files (the big screen at /, the phone controller at /pad.html).
// - Relays messages between one big screen ("host") and the phones in its room over a tiny
//   WebSocket implementation (RFC 6455 text frames, ping/pong, close).
// - /api/info tells the big screen which LAN addresses phones can use to reach this machine.
//
//   PORT=8080 node server.js

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = Number(process.env.PORT) || 8080;
const ROOT = __dirname;
const MAX_FRAME = 64 * 1024;
const MAX_PADS = 8;
const ROOM_GRACE_MS = 90 * 1000; // a big screen that reloads gets its room back
const CODE_CHARS = 'BCDFGHJKLMNPQRSTVWXZ';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  // private ranges first: those are what phones on the same Wi-Fi can reach
  const priv = (ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
  return out.sort((a, b) => priv(b) - priv(a));
}

// ---------------------------------------------------------------------------
// static files
const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://x');
  } catch (e) {
    res.writeHead(400).end();
    return;
  }
  if (url.pathname.endsWith('/js/served.js')) {
    res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' });
    res.end("'use strict';\nwindow.CLAYKART_SERVER = true;\n");
    return;
  }
  if (url.pathname === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ app: 'clay-kart', ips: lanAddresses(), port: PORT, rooms: rooms.size }));
    return;
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT + path.sep) || rel.split('/').some((p) => p.startsWith('.') && p.length > 1) || rel.includes('node_modules')) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
});

// ---------------------------------------------------------------------------
// minimal WebSocket connection
class WSConn {
  constructor(socket) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.frag = null;
    this.open = true;
    this.alive = true;
    this.onmessage = null;
    this.onclose = null;
    socket.setNoDelay(true);
    socket.on('data', (d) => this.onData(d));
    socket.on('close', () => this.closed());
    socket.on('error', () => this.closed());
  }
  onData(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    while (this.buf.length >= 2) {
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0, op = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) {
        if (this.buf.length < 4) return;
        len = this.buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (this.buf.length < 10) return;
        len = Number(this.buf.readBigUInt64BE(2));
        off = 10;
      }
      if (len > MAX_FRAME || !masked) return this.close(1009);
      if (this.buf.length < off + 4 + len) return;
      const mask = this.buf.subarray(off, off + 4);
      const data = Buffer.from(this.buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(off + 4 + len);
      if (op === 0x8) return this.close(1000);
      if (op === 0x9) {
        this.frame(0xa, data);
        continue;
      }
      if (op === 0xa) {
        this.alive = true;
        continue;
      }
      if (op === 0x1 || op === 0x0) {
        this.frag = this.frag ? Buffer.concat([this.frag, data]) : data;
        if (this.frag.length > MAX_FRAME) return this.close(1009);
        if (fin) {
          const text = this.frag.toString('utf8');
          this.frag = null;
          if (this.onmessage) this.onmessage(text);
        }
      }
    }
  }
  frame(op, payload) {
    if (!this.open) return;
    const len = payload.length;
    let head;
    if (len < 126) head = Buffer.from([0x80 | op, len]);
    else if (len < 65536) {
      head = Buffer.alloc(4);
      head[0] = 0x80 | op;
      head[1] = 126;
      head.writeUInt16BE(len, 2);
    } else {
      head = Buffer.alloc(10);
      head[0] = 0x80 | op;
      head[1] = 127;
      head.writeBigUInt64BE(BigInt(len), 2);
    }
    try {
      this.socket.write(Buffer.concat([head, payload]));
    } catch (e) {
      this.closed();
    }
  }
  send(obj) {
    this.frame(0x1, Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)));
  }
  close(code = 1000) {
    if (!this.open) return;
    const b = Buffer.alloc(2);
    b.writeUInt16BE(code, 0);
    this.frame(0x8, b);
    this.socket.end();
    this.closed();
  }
  closed() {
    if (!this.open) return;
    this.open = false;
    try {
      this.socket.destroy();
    } catch (e) {
      /* already gone */
    }
    if (this.onclose) this.onclose();
  }
}

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!req.url.startsWith('/ws') || !key || req.headers.upgrade.toLowerCase() !== 'websocket') {
    socket.destroy();
    return;
  }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${accept}`, '', ''].join('\r\n'));
  attach(new WSConn(socket));
});

// ---------------------------------------------------------------------------
// rooms: one host (the big screen) and up to MAX_PADS phones
const rooms = new Map();

function newCode() {
  for (let tries = 0; tries < 1000; tries++) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
  throw new Error('no free room codes');
}

function attach(conn) {
  conn.role = null;
  conn.onmessage = (text) => {
    let m;
    try {
      m = JSON.parse(text);
    } catch (e) {
      return;
    }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'host' && !conn.role) return hostJoin(conn, m);
    if (m.t === 'join' && !conn.role) return padJoin(conn, m);
    const room = conn.room;
    if (!room) return;
    if (conn.role === 'host') {
      if (m.t === 'to') {
        const pad = room.pads.get(m.pid);
        if (pad) pad.send({ t: 'm', d: m.d });
      } else if (m.t === 'all') {
        for (const pad of room.pads.values()) pad.send({ t: 'm', d: m.d });
      } else if (m.t === 'kick') {
        const pad = room.pads.get(m.pid);
        if (pad) pad.close(4001);
      }
    } else if (conn.role === 'pad' && m.t === 'm') {
      if (room.host) room.host.send({ t: 'm', pid: conn.pid, d: m.d });
    }
  };
  conn.onclose = () => {
    const room = conn.room;
    if (!room) return;
    if (conn.role === 'host' && room.host === conn) {
      room.host = null;
      room.hostGoneAt = Date.now();
      for (const pad of room.pads.values()) pad.send({ t: 'hostgone' });
    } else if (conn.role === 'pad') {
      room.pads.delete(conn.pid);
      if (room.host) room.host.send({ t: 'leave', pid: conn.pid });
    }
  };
}

function hostJoin(conn, m) {
  let code = typeof m.room === 'string' ? m.room.toUpperCase() : '';
  let room = rooms.get(code);
  if (room && room.host) room = null; // that code is in use by another screen
  if (!room) {
    code = newCode();
    room = { code, host: null, pads: new Map(), nextPid: 1, hostGoneAt: 0 };
    rooms.set(code, room);
  }
  room.host = conn;
  room.hostGoneAt = 0;
  conn.role = 'host';
  conn.room = room;
  conn.send({ t: 'room', code, ips: lanAddresses(), port: PORT });
  // phones that stayed connected through a reload say hello again
  for (const [pid, pad] of room.pads) {
    conn.send({ t: 'join', pid, d: pad.hello });
    pad.send({ t: 'hostback' });
  }
  log(`room ${code}: big screen connected`);
}

function padJoin(conn, m) {
  const code = typeof m.room === 'string' ? m.room.toUpperCase().trim() : '';
  const room = rooms.get(code);
  if (!room) return conn.send({ t: 'error', reason: 'no-room' }), conn.close(4004);
  if (room.pads.size >= MAX_PADS) return conn.send({ t: 'error', reason: 'full' }), conn.close(4003);
  conn.role = 'pad';
  conn.room = room;
  conn.pid = room.nextPid++;
  conn.hello = m.d || {};
  room.pads.set(conn.pid, conn);
  conn.send({ t: 'joined', pid: conn.pid, host: !!room.host });
  if (room.host) room.host.send({ t: 'join', pid: conn.pid, d: conn.hello });
  log(`room ${code}: phone ${conn.pid} joined (${room.pads.size} connected)`);
}

// keep-alive pings, and forget rooms whose screen never came back
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const conns = [room.host, ...room.pads.values()].filter(Boolean);
    for (const c of conns) {
      if (!c.alive) {
        c.close(1001);
        continue;
      }
      c.alive = false;
      c.frame(0x9, Buffer.alloc(0));
    }
    if (!room.host && room.hostGoneAt && now - room.hostGoneAt > ROOM_GRACE_MS) {
      for (const pad of room.pads.values()) pad.close(4000);
      rooms.delete(code);
      log(`room ${code}: closed`);
    }
  }
}, 15000).unref();

function log(msg) {
  if (!process.env.QUIET) console.log(`[clay-kart] ${msg}`);
}

server.listen(PORT, () => {
  const ips = lanAddresses();
  console.log('\n  Clay Kart is running.\n');
  console.log(`  Big screen:  http://localhost:${PORT}/`);
  for (const ip of ips.slice(0, 3)) console.log(`  On your Wi-Fi: http://${ip}:${PORT}/   (phones join from the QR code on screen)`);
  console.log('');
});

module.exports = { server, rooms };
