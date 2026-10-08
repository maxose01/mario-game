'use strict';
// Links between the big screen and the phones. Two interchangeable transports:
//  - "local": the bundled Node server (server.js) relays WebSocket messages on your Wi-Fi.
//  - "online": peer-to-peer WebRTC data channels, introduced by the public PeerJS broker, for
//    when the game is opened from a static web host with no server of its own.
// Both give the same API: the host gets join/message/leave per phone id, a phone gets messages.

const NET_PREFIX = 'claykart-';
const CODE_CHARS = 'BCDFGHJKLMNPQRSTVWXZ';

const Net = {
  // Is the page served by our own party server?
  async serverInfo() {
    if (!/^https?:$/.test(location.protocol)) return null;
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 2500);
      const r = await fetch('api/info', { cache: 'no-store', signal: ctl.signal });
      clearTimeout(timer);
      if (!r.ok) return null;
      const j = await r.json();
      return j && j.app === 'clay-kart' ? j : null;
    } catch (e) {
      return null;
    }
  },
  wsUrl() {
    const base = location.href.replace(/[^/]*([?#].*)?$/, '');
    return base.replace(/^http/, 'ws') + 'ws';
  },
  randomCode() {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return c;
  },
  loadPeerJS() {
    if (window.Peer) return Promise.resolve();
    return new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = 'vendor/peerjs.min.js';
      s.onload = ok;
      s.onerror = () => fail(new Error('Could not load PeerJS'));
      document.head.appendChild(s);
    });
  },
};

// ---------------------------------------------------------------------------
// Big screen side.
// h: { onRoom(code, info), onJoin(pid, hello), onMessage(pid, msg), onLeave(pid), onStatus(text, ok) }
class HostLink {
  constructor(h) {
    this.h = h;
    this.mode = null;
    this.code = null;
    this.pads = new Map(); // pid -> conn (online mode)
    this.closedByUs = false;
  }

  async start() {
    const info = await Net.serverInfo();
    if (info) return this.startLocal(info);
    return this.startOnline();
  }

  // ---- local server ----
  startLocal(info) {
    this.mode = 'local';
    this.info = info;
    const open = () => {
      const ws = (this.ws = new WebSocket(Net.wsUrl()));
      ws.onopen = () => ws.send(JSON.stringify({ t: 'host', room: this.code }));
      ws.onmessage = (ev) => {
        let m;
        try {
          m = JSON.parse(ev.data);
        } catch (e) {
          return;
        }
        if (m.t === 'room') {
          this.code = m.code;
          this.info = Object.assign({}, this.info, { ips: m.ips, port: m.port });
          this.h.onRoom(m.code, this.joinUrl());
          this.h.onStatus('Phones on your Wi-Fi can join', true);
        } else if (m.t === 'join') this.h.onJoin(m.pid, m.d || {});
        else if (m.t === 'm') this.h.onMessage(m.pid, m.d);
        else if (m.t === 'leave') this.h.onLeave(m.pid);
      };
      ws.onclose = () => {
        if (this.closedByUs) return;
        this.h.onStatus('Lost the party server, reconnecting…', false);
        setTimeout(open, 1500);
      };
    };
    open();
  }

  // ---- online (WebRTC via PeerJS) ----
  async startOnline() {
    this.mode = 'online';
    this.h.onStatus('Opening an online room…', false);
    try {
      await Net.loadPeerJS();
    } catch (e) {
      this.h.onStatus('Phone play needs the party server (npm start) or an internet connection.', false);
      return;
    }
    const tryOpen = (attempt) => {
      const code = Net.randomCode();
      const peer = new window.Peer(NET_PREFIX + code, { debug: 0 });
      peer.on('open', () => {
        this.peer = peer;
        this.code = code;
        this.h.onRoom(code, this.joinUrl());
        this.h.onStatus('Online room ready: phones can join from anywhere', true);
      });
      peer.on('error', (err) => {
        if (err.type === 'unavailable-id' && attempt < 5) {
          peer.destroy();
          tryOpen(attempt + 1);
        } else if (!this.peer) this.h.onStatus('Could not open an online room (' + err.type + '). Run `npm start` to play on your Wi-Fi.', false);
      });
      peer.on('disconnected', () => {
        if (!this.closedByUs) peer.reconnect();
      });
      peer.on('connection', (conn) => {
        const pid = (this.nextPid = (this.nextPid || 0) + 1);
        let hello = false;
        conn.on('data', (d) => {
          if (!hello) {
            hello = true;
            this.pads.set(pid, conn);
            this.h.onJoin(pid, (d && d.hello) || {});
            return;
          }
          this.h.onMessage(pid, d);
        });
        conn.on('close', () => {
          if (this.pads.delete(pid)) this.h.onLeave(pid);
        });
        conn.on('error', () => {
          if (this.pads.delete(pid)) this.h.onLeave(pid);
        });
      });
    };
    tryOpen(0);
  }

  joinUrl() {
    if (this.mode === 'local') {
      const host = /^(localhost|127\.|\[::1\])/.test(location.hostname) && this.info.ips && this.info.ips.length ? this.info.ips[0] + ':' + this.info.port : location.host;
      const path = location.pathname.replace(/[^/]*$/, '');
      return `${location.protocol}//${host}${path}pad.html?room=${this.code}`;
    }
    const base = location.href.replace(/[^/]*([?#].*)?$/, '');
    return `${base}pad.html?room=${this.code}&online=1`;
  }

  send(pid, msg) {
    if (this.mode === 'local') {
      if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ t: 'to', pid, d: msg }));
    } else {
      const c = this.pads.get(pid);
      if (c && c.open) c.send(msg);
    }
  }
  broadcast(msg) {
    if (this.mode === 'local') {
      if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ t: 'all', d: msg }));
    } else for (const c of this.pads.values()) if (c.open) c.send(msg);
  }
  kick(pid) {
    if (this.mode === 'local') {
      if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ t: 'kick', pid }));
    } else {
      const c = this.pads.get(pid);
      if (c) c.close();
    }
  }
  close() {
    this.closedByUs = true;
    if (this.ws) this.ws.close();
    if (this.peer) this.peer.destroy();
  }
}

// ---------------------------------------------------------------------------
// Phone side.
// h: { onOpen(), onMessage(msg), onClose(reason), onHost(present) }
class PadLink {
  constructor(code, hello, h, online) {
    this.code = code.toUpperCase();
    this.hello = hello;
    this.h = h;
    this.online = online;
    this.open = false;
    this.closedByUs = false;
  }
  async connect() {
    if (!this.online) {
      const info = await Net.serverInfo();
      if (info) return this.connectLocal();
    }
    return this.connectOnline();
  }
  connectLocal() {
    this.mode = 'local';
    const ws = (this.ws = new WebSocket(Net.wsUrl()));
    ws.onopen = () => ws.send(JSON.stringify({ t: 'join', room: this.code, d: this.hello }));
    ws.onmessage = (ev) => {
      let m;
      try {
        m = JSON.parse(ev.data);
      } catch (e) {
        return;
      }
      if (m.t === 'joined') {
        this.open = true;
        this.h.onOpen();
        if (!m.host) this.h.onHost(false);
      } else if (m.t === 'm') this.h.onMessage(m.d);
      else if (m.t === 'error') this.h.onClose(m.reason);
      else if (m.t === 'hostgone') this.h.onHost(false);
      else if (m.t === 'hostback') this.h.onHost(true);
    };
    ws.onclose = () => {
      const was = this.open;
      this.open = false;
      if (!this.closedByUs) this.h.onClose(was ? 'lost' : 'no-server');
    };
  }
  async connectOnline() {
    this.mode = 'online';
    try {
      await Net.loadPeerJS();
    } catch (e) {
      this.h.onClose('no-peerjs');
      return;
    }
    const peer = (this.peer = new window.Peer({ debug: 0 }));
    peer.on('open', () => {
      const conn = (this.conn = peer.connect(NET_PREFIX + this.code, { serialization: 'json', reliable: true }));
      conn.on('open', () => {
        conn.send({ hello: this.hello });
        this.open = true;
        this.h.onOpen();
      });
      conn.on('data', (d) => this.h.onMessage(d));
      conn.on('close', () => {
        this.open = false;
        if (!this.closedByUs) this.h.onClose('lost');
      });
    });
    peer.on('error', (err) => {
      if (!this.closedByUs) this.h.onClose(err.type === 'peer-unavailable' ? 'no-room' : 'network');
    });
  }
  send(msg) {
    if (!this.open) return;
    if (this.mode === 'local') {
      if (this.ws.readyState === 1) this.ws.send(JSON.stringify({ t: 'm', d: msg }));
    } else if (this.conn && this.conn.open) this.conn.send(msg);
  }
  close() {
    this.closedByUs = true;
    if (this.ws) this.ws.close();
    if (this.peer) this.peer.destroy();
  }
}
