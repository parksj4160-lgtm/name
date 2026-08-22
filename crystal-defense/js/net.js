import { shortId } from './utils.js';

export var Net = class {
  constructor() {
    this.selfId = shortId();
    this.name = "\uD50C\uB808\uC774\uC5B4";
    this.roomCode = null;
    this.mode = "off";
    this.joinTs = 0;
    this.peers = /* @__PURE__ */ new Map();
    this._handlers = {};
    this._chan = null;
    this._ws = null;
    this._hbTimer = 0;
    this.status = "\uC624\uD504\uB77C\uC778 (\uC2F1\uAE00 \uD50C\uB808\uC774)";
    addEventListener("beforeunload", () => this.leave());
  }
  get serverUrl() {
    return localStorage.getItem("cd.server") || "";
  }
  setServerUrl(url) {
    if (url) localStorage.setItem("cd.server", url);
    else localStorage.removeItem("cd.server");
  }
  get online() {
    return this.mode !== "off";
  }
  // 접속 순서가 가장 빠른 사람이 호스트. 호스트가 나가면 자동 승계된다.
  get isHost() {
    if (!this.online) return true;
    for (const p2 of this.peers.values()) {
      if (p2.joinTs < this.joinTs) return false;
      if (p2.joinTs === this.joinTs && p2.id < this.selfId) return false;
    }
    return true;
  }
  get hostId() {
    const r = this.roster();
    return r.length ? r[0].id : this.selfId;
  }
  roster() {
    const list = [{ id: this.selfId, name: this.name, joinTs: this.joinTs, isSelf: true }];
    for (const p2 of this.peers.values()) {
      list.push({ id: p2.id, name: p2.name, joinTs: p2.joinTs, isSelf: false });
    }
    list.sort((a, b) => a.joinTs - b.joinTs || a.id.localeCompare(b.id));
    if (list.length) list[0].isHost = true;
    return list;
  }
  on(type, fn) {
    (this._handlers[type] = this._handlers[type] || []).push(fn);
  }
  _emit(type, data, from) {
    (this._handlers[type] || []).forEach((fn) => fn(data, from));
  }
  connect(code) {
    this.leave();
    this.roomCode = String(code || "").toUpperCase();
    this.joinTs = Date.now();
    this.peers.clear();
    const url = this.serverUrl;
    if (url) {
      try {
        const sep = url.includes("?") ? "&" : "?";
        this._ws = new WebSocket(`${url}${sep}room=CD-${encodeURIComponent(this.roomCode)}&id=${this.selfId}`);
        this._ws.onmessage = (ev) => {
          try {
            this._receive(JSON.parse(ev.data));
          } catch (_) {
          }
        };
        this._ws.onopen = () => {
          this.mode = "ws";
          this.status = `\uC628\uB77C\uC778 \xB7 \uBC29 ${this.roomCode}`;
          this._post({ type: "join" });
        };
        this._ws.onclose = () => {
          if (this.mode === "ws") {
            this.mode = "off";
            this.status = "\uC11C\uBC84 \uC5F0\uACB0 \uB04A\uAE40";
          }
        };
        this._ws.onerror = () => {
          this.status = "\uC11C\uBC84 \uC5F0\uACB0 \uC2E4\uD328 \u2014 \uAC19\uC740 \uBE0C\uB77C\uC6B0\uC800 \uD0ED\uB07C\uB9AC\uB9CC \uC5F0\uACB0\uB429\uB2C8\uB2E4";
        };
        this.mode = "ws";
      } catch (_) {
        this._ws = null;
      }
    }
    if (!this._ws && typeof BroadcastChannel !== "undefined") {
      this._chan = new BroadcastChannel("crystal-defense-" + this.roomCode);
      this._chan.onmessage = (ev) => this._receive(ev.data);
      this.mode = "local";
      this.status = `\uAC19\uC740 \uBE0C\uB77C\uC6B0\uC800 \xB7 \uBC29 ${this.roomCode}`;
      this._post({ type: "join" });
    }
    if (this.mode === "off") this.status = "\uC774 \uBE0C\uB77C\uC6B0\uC800\uB294 \uBA40\uD2F0\uD50C\uB808\uC774\uB97C \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4";
    return this.mode !== "off";
  }
  leave() {
    if (this.online) this._post({ type: "left" });
    if (this._chan) {
      this._chan.close();
      this._chan = null;
    }
    if (this._ws) {
      try {
        this._ws.close();
      } catch (_) {
      }
      this._ws = null;
    }
    this.mode = "off";
    this.roomCode = null;
    this.peers.clear();
    this.status = "\uC624\uD504\uB77C\uC778 (\uC2F1\uAE00 \uD50C\uB808\uC774)";
  }
  _post(msg) {
    if (!this.roomCode) return;
    msg.from = this.selfId;
    msg.room = this.roomCode;
    if (msg.type === "join" || msg.type === "here" || msg.type === "hb") {
      msg.name = this.name;
      msg.joinTs = this.joinTs;
    }
    if (this._ws && this._ws.readyState === 1) this._ws.send(JSON.stringify(msg));
    else if (this._chan) this._chan.postMessage(msg);
  }
  send(type, data) {
    this._post({ type, data });
  }
  _touch(id, info) {
    let p2 = this.peers.get(id);
    if (!p2) {
      p2 = { id, name: info.name || "\uD50C\uB808\uC774\uC5B4", joinTs: info.joinTs || Date.now(), lastSeen: performance.now() };
      this.peers.set(id, p2);
      this._emit("peerJoin", p2, id);
    }
    p2.lastSeen = performance.now();
    if (info.name) p2.name = info.name;
    if (info.joinTs) p2.joinTs = info.joinTs;
    return p2;
  }
  _receive(msg) {
    if (!msg || msg.from === this.selfId) return;
    if (msg.room && this.roomCode && msg.room !== this.roomCode) return;
    switch (msg.type) {
      case "join":
        this._touch(msg.from, { name: msg.name, joinTs: msg.joinTs });
        this._post({ type: "here" });
        break;
      case "here":
      case "hb":
        this._touch(msg.from, { name: msg.name, joinTs: msg.joinTs });
        break;
      case "left": {
        const p2 = this.peers.get(msg.from);
        this.peers.delete(msg.from);
        if (p2) this._emit("peerLeave", p2, msg.from);
        break;
      }
      default:
        this._touch(msg.from, {});
        this._emit(msg.type, msg.data, msg.from);
    }
  }
  update(dt2) {
    if (!this.online) return;
    this._hbTimer -= dt2;
    if (this._hbTimer <= 0) {
      this._hbTimer = 1.2;
      this._post({ type: "hb" });
    }
    const now = performance.now();
    for (const [id, p2] of [...this.peers]) {
      if (now - p2.lastSeen > 6e3) {
        this.peers.delete(id);
        this._emit("peerLeave", p2, id);
      }
    }
  }
};
