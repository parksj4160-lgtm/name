// HUD · 건설 바 · 미니맵 · 이름표 · 로비 · 결과 화면.
import { CFG } from './config.js';
import { PHASE } from './wave.js';
import { canAfford, costText, fmtTime, roomCode, clamp } from './utils.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game) {
    this.game = game;
    this.harvestHeld = false;
    this.nametags = new Map();
    this.el = {
      hud: $('hud'), lobby: $('lobby'), result: $('result'),
      wood: $('res-wood'), stone: $('res-stone'), shard: $('res-shard'),
      hupBtn: $('btn-hup'), hupLv: $('hup-lv'), hupCost: $('hup-cost'), poolMode: $('pool-mode'),
      crystalFill: $('crystal-fill'), crystalText: $('crystal-text'),
      waveLabel: $('wave-label'), waveState: $('wave-state'), waveBtn: $('btn-wave'),
      partyList: $('party-list'), netStatus: $('net-status'),
      hpFill: $('hp-fill'), hpText: $('hp-text'),
      harvestWrap: $('harvest-wrap'), harvestFill: $('harvest-fill'),
      prompt: $('prompt'), buildBar: $('build-bar'), buildHint: $('build-hint'),
      minimap: $('minimap'), toasts: $('toasts'), fxLayer: $('fx-layer'),
      help: $('help'), touch: $('touch'),
    };
    this.mm = this.el.minimap.getContext('2d');
    this._buildSlots();
    this._bindLobby();
    this._bindHud();
    this._bindTouch();
    this._toastTimers = [];
  }

  // ---------------------------------------------------------------- 건설 바
  _buildSlots() {
    const bar = this.el.buildBar;
    bar.innerHTML = '';
    this.slots = {};
    const add = (key, icon, name, sub, hotkey) => {
      const b = document.createElement('button');
      b.className = 'slot';
      b.innerHTML = `<span class="hk">${hotkey}</span><span class="em">${icon}</span>` +
        `<span class="nm">${name}</span><span class="cs">${sub}</span>`;
      b.onclick = () => { this.game.setBuildMode(key); };
      b.onmouseenter = () => { this.hoverKey = key; };
      b.onmouseleave = () => { this.hoverKey = null; };
      bar.appendChild(b);
      this.slots[key] = b;
    };
    for (const [key, def] of Object.entries(CFG.builds)) {
      add(key, def.icon, def.name, costText(def.cost), def.hotkey);
    }
    add('upgrade', '⬆️', '업그레이드', '건물 클릭', 'U');
    add('sell', '🔨', '철거', '50% 환급', 'X');
  }

  refreshBuildBar() {
    const g = this.game;
    const pool = g.myPool;
    for (const [key, el] of Object.entries(this.slots)) {
      const active = g.buildMgr?.mode === key;
      el.classList.toggle('active', active);
      const def = CFG.builds[key];
      el.classList.toggle('poor', !!def && !canAfford(pool, def.cost));
    }
    const mode = g.buildMgr?.mode;
    if (!mode) {
      this.el.buildHint.textContent = '';
    } else if (CFG.builds[mode]) {
      this.el.buildHint.textContent = `${CFG.builds[mode].name}: ${CFG.builds[mode].desc} — 좌클릭 배치 / 우클릭·Esc 취소`;
    } else if (mode === 'upgrade') {
      this.el.buildHint.textContent = '업그레이드할 건물을 클릭하세요 (벽은 내구도, 타워는 공격력·사거리 상승)';
    } else {
      this.el.buildHint.textContent = '철거할 건물을 클릭하세요 (투자 자원의 50% 환급)';
    }
  }

  // ---------------------------------------------------------------- 로비
  _bindLobby() {
    const g = this.game;
    const nameIn = $('in-name');
    nameIn.value = localStorage.getItem('cd.name') || '';

    const takeName = () => {
      const n = (nameIn.value || '플레이어').trim().slice(0, 10) || '플레이어';
      localStorage.setItem('cd.name', n);
      g.net.name = n;
      return n;
    };

    $('in-server').value = g.net.serverUrl;
    $('btn-server').onclick = () => {
      g.net.setServerUrl($('in-server').value.trim());
      this.toast('서버 주소를 저장했다. 방을 다시 만들면 적용된다.', 'good');
    };

    $('btn-single').onclick = () => {
      takeName();
      g.net.leave();
      this.el.lobby.classList.add('hidden');
      g.begin({ seed: (Math.random() * 1e9) | 0, shared: true });
    };

    $('btn-create').onclick = () => {
      takeName();
      const code = roomCode();
      g.net.connect(code);
      this.seed = (Math.random() * 1e9) | 0;
      this._showRoom(code);
    };

    $('btn-join').onclick = () => {
      takeName();
      const code = ($('in-code').value || '').trim().toUpperCase();
      if (code.length < 3) { this.toast('방 코드를 입력하세요', 'bad'); return; }
      g.net.connect(code);
      this.seed = null;
      this._showRoom(code);
    };

    $('btn-leave').onclick = () => {
      g.net.leave();
      $('room-box').classList.add('hidden');
      this.refreshLobby();
    };

    $('btn-start').onclick = () => {
      if (!g.net.isHost) { this.toast('방장만 시작할 수 있습니다', 'bad'); return; }
      const shared = $('chk-shared').checked;
      const seed = this.seed || ((Math.random() * 1e9) | 0);
      g.net.send('startGame', { seed, shared });
      this.el.lobby.classList.add('hidden');
      g.begin({ seed, shared });
      g._syncRosterIntoGame();
    };

    $('btn-again').onclick = () => {
      const g = this.game;
      if (g.net.online && !g.net.isHost) {
        this.toast('방장이 다시 시작하기를 기다리는 중…', 'warn');
        return;
      }
      this.el.result.classList.add('hidden');
      const seed = (Math.random() * 1e9) | 0;
      if (g.net.online) g.net.send('startGame', { seed, shared: g.shared });
      g.begin({ seed, shared: g.shared });
      g._syncRosterIntoGame();
    };
  }

  _showRoom(code) {
    $('room-box').classList.remove('hidden');
    $('room-code').textContent = code;
    this.refreshLobby();
  }

  refreshLobby() {
    const g = this.game;
    $('lobby-status').textContent = g.net.status;
    const list = $('lobby-list');
    if (!list) return;
    list.innerHTML = '';
    for (const p of g.net.roster()) {
      const li = document.createElement('li');
      li.innerHTML = `<span>${p.isHost ? '👑' : '🙂'}</span><span>${escapeHtml(p.name)}${p.isSelf ? ' (나)' : ''}</span>`;
      list.appendChild(li);
    }
    $('btn-start').disabled = !g.net.isHost;
    $('btn-start').textContent = g.net.isHost ? '게임 시작 (방장)' : '방장이 시작하기를 기다리는 중…';
  }

  // ---------------------------------------------------------------- HUD 바인딩
  _bindHud() {
    const g = this.game;
    this.el.waveBtn.onclick = () => g.requestStartWave();
    this.el.hupBtn.onclick = () => g.requestHarvestUpgrade();
    $('btn-help').onclick = () => this.el.help.classList.toggle('hidden');
    addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'h') this.el.help.classList.toggle('hidden');
    });
  }

  _bindTouch() {
    const isTouch = matchMedia('(pointer: coarse)').matches;
    if (!isTouch) return;
    this.el.touch.classList.remove('hidden');
    const stick = $('stick'), knob = stick.querySelector('i');
    let id = null, cx = 0, cy = 0;
    const R = 46;
    stick.addEventListener('pointerdown', (e) => {
      id = e.pointerId; const r = stick.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      stick.setPointerCapture(id);
    });
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const len = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, len / R);
      dx = (dx / len) * k; dy = (dy / len) * k;
      knob.style.transform = `translate(${dx * R}px, ${dy * R}px)`;
      this.game.input.move.x = dx;
      this.game.input.move.y = -dy;
    });
    const release = (e) => {
      if (e.pointerId !== id) return;
      id = null; knob.style.transform = '';
      this.game.input.move.x = 0; this.game.input.move.y = 0;
    };
    stick.addEventListener('pointerup', release);
    stick.addEventListener('pointercancel', release);

    const hb = $('tb-harvest');
    hb.addEventListener('pointerdown', () => { this.harvestHeld = true; });
    hb.addEventListener('pointerup', () => { this.harvestHeld = false; });
    hb.addEventListener('pointercancel', () => { this.harvestHeld = false; });
    $('tb-attack').addEventListener('pointerdown', () => this.game.requestAttack());
  }

  // ---------------------------------------------------------------- 라이프사이클
  onGameStart() {
    this.el.hud.classList.remove('hidden');
    this.el.lobby.classList.add('hidden');
    this.el.result.classList.add('hidden');
    this.refreshBuildBar();
    this.toast('크리스탈을 지켜라! F로 채집, 1~4로 건설', 'good');
  }

  showResult(win, stats, wave) {
    this.el.result.classList.remove('hidden');
    $('result-title').textContent = win ? '승리! 🎉' : '크리스탈 파괴… 💥';
    $('result-sub').textContent = win
      ? `${CFG.wave.goal}웨이브를 모두 막아냈다.`
      : `${wave}웨이브까지 버텼다.`;
    $('result-stats').innerHTML = `
      <li>처치한 몬스터 <b>${stats.kills}</b></li>
      <li>채집한 자원 <b>${stats.harvested}</b></li>
      <li>건설한 구조물 <b>${stats.built}</b></li>`;
  }

  toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    this.el.toasts.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity 0.4s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 400);
    }, 2400);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
  }

  shake() {
    const c = document.getElementById('scene');
    c.classList.remove('shake');
    void c.offsetWidth;
    c.classList.add('shake');
  }

  // ---------------------------------------------------------------- 매 프레임
  update(dt) {
    const g = this.game;
    if (!g.running) return;
    const pool = g.myPool;

    this.el.wood.textContent = Math.floor(pool.wood);
    this.el.stone.textContent = Math.floor(pool.stone);
    this.el.shard.textContent = Math.floor(pool.shard || 0);
    this.el.poolMode.textContent = g.shared ? '팀 공유 자원' : '개인 자원';

    const nextUp = CFG.harvest.upgrade[g.local.harvestLv];
    this.el.hupLv.textContent = `Lv.${g.local.harvestLv}`;
    this.el.hupCost.textContent = nextUp ? costText(nextUp.cost) : '최대';
    this.el.hupBtn.disabled = !nextUp || !canAfford(pool, nextUp.cost);

    // 크리스탈
    const c = g.world.crystal;
    const ratio = clamp(c.hp / c.maxHp, 0, 1);
    this.el.crystalFill.style.transform = `scaleX(${ratio})`;
    this.el.crystalText.textContent = `${Math.ceil(c.hp)} / ${c.maxHp}`;

    // 웨이브
    const w = g.wave;
    this.el.waveLabel.textContent = `웨이브 ${Math.min(CFG.wave.goal, w.wave + 1)} / ${CFG.wave.goal}`;
    if (w.phase === PHASE.PREP) {
      this.el.waveState.textContent = `준비 시간 ${fmtTime(w.prepLeft)}`;
      this.el.waveBtn.classList.remove('hidden');
    } else if (w.phase === PHASE.COMBAT) {
      this.el.waveState.textContent = `남은 몬스터 ${w.remaining}`;
      this.el.waveBtn.classList.add('hidden');
    } else {
      this.el.waveState.textContent = w.phase === PHASE.WON ? '방어 성공' : '패배';
      this.el.waveBtn.classList.add('hidden');
    }

    // 플레이어 상태
    const p = g.local;
    const hpR = clamp(p.hp / p.maxHp, 0, 1);
    this.el.hpFill.style.transform = `scaleX(${hpR})`;
    this.el.hpText.textContent = p.alive ? `${Math.ceil(p.hp)} / ${p.maxHp}` : `부활까지 ${Math.ceil(p.downTimer)}초`;

    if (p.harvesting) {
      this.el.harvestWrap.classList.remove('hidden');
      this.el.harvestFill.style.transform = `scaleX(${clamp(p.harvesting.t / p.harvesting.need, 0, 1)})`;
    } else {
      this.el.harvestWrap.classList.add('hidden');
    }

    // 상호작용 안내
    const near = g.world.nearestNode(p.x, p.z, CFG.harvest.range);
    if (near && !g.buildMgr.mode) {
      this.el.prompt.classList.remove('hidden');
      this.el.prompt.innerHTML = `${near.type === 'tree' ? '🌳 나무' : '🪨 바위'} — <kbd>F</kbd> 꾹 눌러 채집 (남은 ${near.charges})`;
    } else {
      this.el.prompt.classList.add('hidden');
    }

    this.el.netStatus.textContent = g.net.online ? (g.isHost ? '호스트' : '참가자') : '싱글';
    this._updateParty();
    this._updateNametags();
    this._drawMinimap();
    this.refreshBuildBar();
  }

  _updateParty() {
    const g = this.game;
    const list = this.el.partyList;
    const ids = [...g.players.keys()].join(',');
    if (this._partyIds !== ids || this._partyShared !== g.shared) {
      this._partyIds = ids;
      this._partyShared = g.shared;
      list.innerHTML = '';
      for (const p of g.players.values()) {
        const li = document.createElement('li');
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.background = '#' + p.color.toString(16).padStart(6, '0');
        const who = document.createElement('span');
        who.className = 'who';
        who.textContent = p.name + (p.isLocal ? ' (나)' : '');
        li.append(dot, who);
        if (!p.isLocal && !g.shared) {
          const give = document.createElement('button');
          give.className = 'give';
          give.textContent = '🪵10';
          give.onclick = () => g.requestGive(p.id, 10, 0);
          const give2 = document.createElement('button');
          give2.className = 'give';
          give2.textContent = '🪨10';
          give2.onclick = () => g.requestGive(p.id, 0, 10);
          li.append(give, give2);
        }
        list.appendChild(li);
      }
    }
  }

  _updateNametags() {
    const g = this.game;
    for (const p of g.players.values()) {
      let tag = this.nametags.get(p.id);
      if (!tag) {
        tag = document.createElement('div');
        tag.className = 'nametag';
        tag.textContent = p.name;
        this.el.fxLayer.appendChild(tag);
        this.nametags.set(p.id, tag);
      }
      const pos = g.sm.worldToScreenXYZ(p.x, 2.3, p.z);
      if (!pos.visible) { tag.style.display = 'none'; continue; }
      tag.style.display = '';
      tag.style.transform = `translate(-50%,-50%) translate(${pos.x}px, ${pos.y}px)`;
      tag.style.opacity = p.alive ? '1' : '0.45';
    }
    for (const [id, tag] of this.nametags) {
      if (!g.players.has(id)) { tag.remove(); this.nametags.delete(id); }
    }
  }

  _drawMinimap() {
    const g = this.game, ctx = this.mm;
    const size = this.el.minimap.width;
    const world = CFG.world.size;
    const s = size / world;
    const tx = (x) => size / 2 + x * s;
    const tz = (z) => size / 2 + z * s;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(20,30,45,0.85)';
    ctx.fillRect(0, 0, size, size);

    // 건설 구역
    ctx.strokeStyle = 'rgba(95,212,255,0.5)';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, CFG.world.buildRadius * s, 0, Math.PI * 2);
    ctx.stroke();

    // 자원
    for (const n of g.world.nodes) {
      if (n.depleted) continue;
      ctx.fillStyle = n.type === 'tree' ? '#3e8b47' : '#9aa3b5';
      ctx.fillRect(tx(n.x) - 1, tz(n.z) - 1, 2.5, 2.5);
    }
    // 건물
    for (const b of g.buildMgr.buildings.values()) {
      ctx.fillStyle = b.key === 'wall' ? '#c9cfda' : '#ffcc55';
      ctx.fillRect(tx(b.x) - 1.5, tz(b.z) - 1.5, 3, 3);
    }
    // 포탈
    for (const p of g.world.portals) {
      ctx.fillStyle = 'rgba(255,90,114,0.9)';
      ctx.beginPath(); ctx.arc(tx(p.x), tz(p.z), 3, 0, Math.PI * 2); ctx.fill();
    }
    // 몬스터
    ctx.fillStyle = '#ff6a7d';
    for (const e of g.enemyMgr.list) {
      if (e.dead) continue;
      ctx.beginPath(); ctx.arc(tx(e.x), tz(e.z), 1.8, 0, Math.PI * 2); ctx.fill();
    }
    // 크리스탈
    ctx.fillStyle = '#7fe6ff';
    ctx.beginPath(); ctx.arc(size / 2, size / 2, 4, 0, Math.PI * 2); ctx.fill();
    // 플레이어
    for (const p of g.players.values()) {
      ctx.fillStyle = '#' + p.color.toString(16).padStart(6, '0');
      ctx.beginPath(); ctx.arc(tx(p.x), tz(p.z), p.isLocal ? 3.2 : 2.6, 0, Math.PI * 2); ctx.fill();
      if (p.isLocal) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke(); }
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
