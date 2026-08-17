// 멀티플레이 계층.
//  - 기본 전송: BroadcastChannel → 같은 브라우저의 다른 탭/창끼리 실제로 연결된다.
//  - 서버 주소를 지정하면 WebSocket 릴레이로 다른 기기(친구 PC/휴대폰)와도 연결된다.
// 파티원은 오직 이 계층을 통해 "실제로 접속한 사람"만 채워진다. AI 더미는 만들지 않는다.
const Net = {
  selfId: null,
  name: '플레이어',
  level: 1,
  roomCode: null,
  mode: 'off',          // 'off' | 'local' | 'ws'
  joinTs: 0,
  peers: new Map(),     // id -> { id, name, level, joinTs, lastSeen }
  _handlers: {},
  _chan: null,
  _ws: null,
  _hbTimer: 0,
  _status: '오프라인 (솔로 플레이)',

  init(name) {
    this.selfId = shortId();
    this.name = name;
    window.addEventListener('beforeunload', () => this.leave());
  },

  get serverUrl() {
    return localStorage.getItem('rpg.server') || '';
  },
  setServerUrl(url) {
    if (url) localStorage.setItem('rpg.server', url);
    else localStorage.removeItem('rpg.server');
  },

  get online() { return this.mode !== 'off'; },
  get status() { return this._status; },

  // 접속 순서가 가장 빠른 사람이 호스트(적 처리 권한). 호스트가 나가면 자동 승계된다.
  get isHost() {
    if (!this.online) return true;
    for (const p of this.peers.values()) {
      if (p.joinTs < this.joinTs) return false;
      if (p.joinTs === this.joinTs && p.id < this.selfId) return false;
    }
    return true;
  },

  roster() {
    const list = [{
      id: this.selfId, name: this.name, level: this.level,
      joinTs: this.joinTs, isSelf: true,
    }];
    for (const p of this.peers.values()) {
      list.push({ id: p.id, name: p.name, level: p.level, joinTs: p.joinTs, isSelf: false });
    }
    list.sort((a, b) => a.joinTs - b.joinTs || a.id.localeCompare(b.id));
    const hostId = list.length ? list[0].id : null;
    list.forEach(p => { p.isHost = p.id === hostId; });
    return list;
  },

  on(type, fn) {
    (this._handlers[type] = this._handlers[type] || []).push(fn);
  },

  _emit(type, data, from) {
    (this._handlers[type] || []).forEach(fn => fn(data, from));
  },

  // ---------- 접속 ----------
  connect(code) {
    this.leave();
    this.roomCode = String(code || '').toUpperCase();
    this.joinTs = Date.now();
    this.peers.clear();

    const url = this.serverUrl;
    if (url) {
      try {
        const sep = url.includes('?') ? '&' : '?';
        this._ws = new WebSocket(`${url}${sep}room=${encodeURIComponent(this.roomCode)}&id=${this.selfId}`);
        this._ws.onmessage = (ev) => {
          try { this._receive(JSON.parse(ev.data)); } catch (_) { /* 무시 */ }
        };
        this._ws.onopen = () => {
          this.mode = 'ws';
          this._status = `온라인 · 방 ${this.roomCode}`;
          this._post({ type: 'join' });
        };
        this._ws.onclose = () => {
          if (this.mode === 'ws') { this.mode = 'off'; this._status = '서버 연결 끊김'; }
        };
        this._ws.onerror = () => { this._status = '서버 연결 실패 - 같은 브라우저 탭끼리만 연결됩니다'; };
        this.mode = 'ws';
      } catch (_) {
        this._ws = null;
      }
    }

    if (!this._ws && typeof BroadcastChannel !== 'undefined') {
      this._chan = new BroadcastChannel('rpg-room-' + this.roomCode);
      this._chan.onmessage = (ev) => this._receive(ev.data);
      this.mode = 'local';
      this._status = `같은 브라우저 방 ${this.roomCode}`;
      this._post({ type: 'join' });
    }

    if (this.mode === 'off') this._status = '이 브라우저는 멀티플레이를 지원하지 않습니다';
    return this.mode !== 'off';
  },

  leave() {
    if (this.online) this._post({ type: 'left' });
    if (this._chan) { this._chan.close(); this._chan = null; }
    if (this._ws) { try { this._ws.close(); } catch (_) {} this._ws = null; }
    this.mode = 'off';
    this.roomCode = null;
    this.peers.clear();
    this._status = '오프라인 (솔로 플레이)';
  },

  _post(msg) {
    if (!this.roomCode) return;
    msg.from = this.selfId;
    msg.room = this.roomCode;
    if (this._ws && this._ws.readyState === 1) this._ws.send(JSON.stringify(msg));
    else if (this._chan) this._chan.postMessage(msg);
  },

  send(type, data) {
    this._post({ type, data });
  },

  _touch(id, info) {
    let p = this.peers.get(id);
    if (!p) {
      p = { id, name: info.name || '플레이어', level: info.level || 1, joinTs: info.joinTs || Date.now(), lastSeen: performance.now() };
      this.peers.set(id, p);
      this._emit('peerJoin', p, id);
    }
    p.lastSeen = performance.now();
    if (info.name) p.name = info.name;
    if (info.level) p.level = info.level;
    if (info.joinTs) p.joinTs = info.joinTs;
    return p;
  },

  _receive(msg) {
    if (!msg || msg.from === this.selfId) return;
    if (msg.room && this.roomCode && msg.room !== this.roomCode) return;

    switch (msg.type) {
      case 'join':
        this._touch(msg.from, { name: msg.name, level: msg.level, joinTs: msg.joinTs });
        // 새로 들어온 사람에게 내 존재를 알린다
        this._post({ type: 'here', name: this.name, level: this.level, joinTs: this.joinTs });
        break;
      case 'here':
      case 'hb':
        this._touch(msg.from, { name: msg.name, level: msg.level, joinTs: msg.joinTs });
        break;
      case 'left': {
        const p = this.peers.get(msg.from);
        this.peers.delete(msg.from);
        if (p) this._emit('peerLeave', p, msg.from);
        break;
      }
      default:
        this._touch(msg.from, {});
        this._emit(msg.type, msg.data, msg.from);
    }
  },

  update(dt, player) {
    if (!this.online) return;
    if (player) this.level = player.level;

    this._hbTimer -= dt;
    if (this._hbTimer <= 0) {
      this._hbTimer = 1.2;
      this._post({ type: 'hb', name: this.name, level: this.level, joinTs: this.joinTs });
    }

    const now = performance.now();
    for (const [id, p] of [...this.peers]) {
      if (now - p.lastSeen > 5000) {
        this.peers.delete(id);
        this._emit('peerLeave', p, id);
      }
    }
  },
};

// join / here 메시지에 내 정보가 실려가도록 보강
const _origPost = Net._post.bind(Net);
Net._post = function (msg) {
  if (msg.type === 'join' || msg.type === 'here' || msg.type === 'hb') {
    msg.name = this.name;
    msg.level = this.level;
    msg.joinTs = this.joinTs;
  }
  _origPost(msg);
};
