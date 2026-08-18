// 게임 매니저: 씬 · 상태 · 입력 처리 · 호스트 권위 시뮬레이션 · 네트워크 동기화.
//
// 멀티플레이 구조
//   - 방에 가장 먼저 들어온 사람이 "호스트"이며 몬스터/웨이브/자원/건설을 계산한다.
//   - 다른 플레이어는 행동을 요청(build/harvest/attack...)하고 스냅샷을 받아 그린다.
//   - 각자의 캐릭터 위치와 체력만은 본인 클라이언트가 소유하고 브로드캐스트한다.
import * as THREE from '../vendor/three.module.js';
import { CFG, waveReward } from './config.js';
import { SceneManager } from './scene.js';
import { Input } from './input.js';
import { Fx, ProjectilePool } from './fx.js';
import { BuildGrid } from './grid.js';
import { World } from './world.js';
import { BuildManager } from './buildings.js';
import { EnemyManager } from './enemy.js';
import { WaveDirector, PHASE } from './wave.js';
import { LocalPlayer, RemotePlayer } from './player.js';
import { Net } from './net.js';
import { canAfford, payCost, dist, clamp } from './utils.js';

export class Game {
  constructor(canvas, fxLayer) {
    this.sm = new SceneManager(canvas);
    this.input = new Input(canvas, this.sm);
    this.fx = new Fx(this.sm, fxLayer);
    this.projectiles = new ProjectilePool(this.sm);
    this.net = new Net();
    this.ui = null;                 // main.js 에서 주입
    this.running = false;
    this.shared = true;             // 팀 공유 자원 여부
    this.pools = { team: { wood: 60, stone: 30, shard: 0 }, byId: {} };
    this.players = new Map();
    this.stats = { harvested: 0, built: 0, kills: 0 };
    this._accum = { snap: 0, pos: 0 };
    this._bindNet();
  }

  // ---------------------------------------------------------------- 시작/정리
  begin({ seed = 20260818, shared = true } = {}) {
    this.dispose();
    this.seed = seed;
    this.shared = shared;

    this.grid = new BuildGrid();
    this.world = new World(this.sm, seed);
    this.buildMgr = new BuildManager(this.sm, this.grid, this.world, this.fx, this.projectiles);
    this.enemyMgr = new EnemyManager(this.sm, this.grid, this.world, this.fx);
    this.wave = new WaveDirector(this.world, this.enemyMgr);

    this.local = new LocalPlayer(this.net.selfId, this.net.name, this._colorIndex(this.net.selfId));
    this.sm.scene.add(this.local.mesh);
    this.players.set(this.local.id, this.local);
    this.pools.team = { wood: 60, stone: 30, shard: 0 };
    this.pools.byId = {};
    this._poolOf(this.local.id);

    this._wireCallbacks();
    this.stats = { harvested: 0, built: 0, kills: 0 };
    this.buildMode = null;
    this.running = true;
    this.result = null;
    this.sm.focus.set(this.local.x, 0, this.local.z);
    this.ui?.onGameStart();
  }

  dispose() {
    if (!this.grid) return;
    this.buildMgr?.clearAll();
    this.enemyMgr?.clearAll();
    for (const p of this.players.values()) this.sm.scene.remove(p.mesh);
    this.players.clear();
    this.world?.dispose();
    if (this.buildMgr) this.sm.scene.remove(this.buildMgr.root);
    if (this.enemyMgr) this.sm.scene.remove(this.enemyMgr.root);
    this.grid = null;
    this.running = false;
  }

  get isHost() { return this.net.isHost; }
  get phase() { return this.wave?.phase; }

  _colorIndex(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  _poolOf(id) {
    if (this.shared) return this.pools.team;
    if (!this.pools.byId[id]) this.pools.byId[id] = { wood: 60, stone: 30, shard: 0 };
    return this.pools.byId[id];
  }
  get myPool() { return this._poolOf(this.local.id); }

  _harvestLvOf(id) {
    const p = this.players.get(id);
    return p ? p.harvestLv : 1;
  }

  // ---------------------------------------------------------------- 콜백 연결
  _wireCallbacks() {
    // 타워 명중 → 데미지 (호스트만 실제 적용)
    this.buildMgr.onImpact = (b, st, pos) => {
      if (!this.isHost) return;
      const targets = st.splash
        ? this.enemyMgr.list.filter(e => !e.dead && dist(e.x, e.z, pos.x, pos.z) <= st.splash)
        : this.enemyMgr.list.filter(e => !e.dead && dist(e.x, e.z, pos.x, pos.z) <= 1.2);
      if (!targets.length) return;
      for (const e of targets) {
        if (st.slow) e.applySlow(st.slow, st.slowTime, performance.now() / 1000);
        this._hurtEnemy(e, st.dmg, b.key === 'frost' ? 'frost' : 'tower');
      }
    };

    this.enemyMgr.onCrystalHit = (e) => {
      const dead = this.world.damageCrystal(e.st.dmg);
      this.fx.burst(0, 3.2, 0, 0x63e0ff, 10, 5);
      this.fx.float(`-${e.st.dmg}`, 0, 4.4, 0, 'crystal');
      this.ui?.shake();
      if (dead) this._lose();
    };

    this.enemyMgr.onBuildingHit = (e, b) => {
      const destroyed = b.damage(e.st.dmg);
      this.fx.burst(b.x, 1.4, b.z, 0xbbbbbb, 5, 3);
      if (destroyed) {
        this.fx.burst(b.x, 1.2, b.z, 0x888888, 16, 6);
        this.buildMgr.remove(b.id);
      }
    };

    this.enemyMgr.onPlayerHit = (e, p) => {
      if (p.id === this.local.id) this._hurtLocal(e.st.dmg);
      else this.net.send('hurt', { to: p.id, dmg: e.st.dmg });
    };

    this.wave.onWaveStart = (w, total) => {
      this.ui?.toast(`웨이브 ${w} 시작! 몬스터 ${total}마리`, 'warn');
      this.fx.ring(0, 0, 0xff5a72, 10);
    };

    this.wave.onWaveClear = (w, reward, won) => {
      if (this.isHost) this._grantReward(reward);
      this.ui?.toast(won ? '마지막 웨이브 격퇴!' : `웨이브 ${w} 클리어! 보상 🪵${reward.wood} 🪨${reward.stone}${reward.shard ? ' 💠1' : ''}`, 'good');
      if (won) this._win();
    };
  }

  _hurtEnemy(e, dmg, kind = 'tower') {
    const died = e.damage(dmg);
    this.fx.float(String(Math.round(dmg)), e.x, 1.9, e.z, kind === 'player' ? 'player' : '');
    if (died) {
      this.stats.kills++;
      this.fx.burst(e.x, 1, e.z, e.st.color, 12, 5);
      const b = e.st.bounty;
      if (this.shared) {
        this.pools.team.wood += b.wood; this.pools.team.stone += b.stone;
      } else {
        for (const p of this.players.values()) {
          const pool = this._poolOf(p.id);
          pool.wood += b.wood; pool.stone += b.stone;
        }
      }
      this.enemyMgr.kill(e);
    }
  }

  _hurtLocal(dmg) {
    const down = this.local.damage(dmg);
    this.fx.float(`-${dmg}`, this.local.x, 2.2, this.local.z, 'hurt');
    this.ui?.shake();
    if (down) this.ui?.toast('쓰러졌다! 잠시 후 크리스탈에서 부활한다', 'bad');
  }

  _grantReward(reward) {
    if (this.shared) {
      this.pools.team.wood += reward.wood;
      this.pools.team.stone += reward.stone;
      this.pools.team.shard += reward.shard;
    } else {
      for (const p of this.players.values()) {
        const pool = this._poolOf(p.id);
        pool.wood += reward.wood;
        pool.stone += reward.stone;
        pool.shard += reward.shard;
      }
    }
  }

  _win() {
    this.wave.phase = PHASE.WON;
    this.result = 'win';
    this.ui?.showResult(true, this.stats, this.wave.wave);
  }
  _lose() {
    this.wave.lose();
    this.result = 'lose';
    this.ui?.showResult(false, this.stats, this.wave.wave);
  }

  // ---------------------------------------------------------------- 행동 (요청 → 호스트 처리)
  requestBuild(key, gx, gz) {
    if (this.isHost) this.hostBuild(this.local.id, key, gx, gz);
    else this.net.send('build', { key, gx, gz });
  }
  hostBuild(playerId, key, gx, gz) {
    const def = CFG.builds[key];
    if (!def) return;
    const pool = this._poolOf(playerId);
    if (!canAfford(pool, def.cost)) { this._notify(playerId, '자원이 부족합니다', 'bad'); return; }
    const b = this.buildMgr.place(key, gx, gz, playerId);
    if (!b) { this._notify(playerId, '그 자리에는 건설할 수 없습니다', 'bad'); return; }
    payCost(pool, def.cost);
    this.stats.built++;
  }

  requestUpgrade(id) {
    if (this.isHost) this.hostUpgrade(this.local.id, id);
    else this.net.send('upgrade', { id });
  }
  hostUpgrade(playerId, id) {
    const b = this.buildMgr.buildings.get(id);
    if (!b) return;
    const cost = b.nextCost;
    if (!cost) { this._notify(playerId, '이미 최대 레벨입니다', 'bad'); return; }
    const pool = this._poolOf(playerId);
    if (!canAfford(pool, cost)) { this._notify(playerId, '자원이 부족합니다', 'bad'); return; }
    payCost(pool, cost);
    this.buildMgr.upgrade(id);
  }

  requestSell(id) {
    if (this.isHost) this.hostSell(this.local.id, id);
    else this.net.send('sell', { id });
  }
  hostSell(playerId, id) {
    const b = this.buildMgr.buildings.get(id);
    if (!b) return;
    const back = this.buildMgr.refund(b);
    const pool = this._poolOf(playerId);
    pool.wood += back.wood; pool.stone += back.stone;
    this.fx.burst(b.x, 1.2, b.z, 0xbfa15a, 10, 4);
    this.buildMgr.remove(id);
  }

  requestHarvest(nodeId) {
    if (this.isHost) this.hostHarvest(this.local.id, nodeId, this.local.x, this.local.z);
    else this.net.send('harvest', { id: nodeId, x: this.local.x, z: this.local.z });
  }
  // 위치는 요청에 실려온 값으로 검증한다 (스냅샷 사이의 지연 때문에 서버 쪽 좌표는 낡을 수 있다)
  hostHarvest(playerId, nodeId, px, pz) {
    const node = this.world.nodeById(nodeId);
    if (!node || node.depleted) return;
    const player = this.players.get(playerId);
    if (!player) return;
    const x = typeof px === 'number' ? px : player.x;
    const z = typeof pz === 'number' ? pz : player.z;
    if (dist(x, z, node.x, node.z) > CFG.harvest.range + 1.5) return;
    const cfg = CFG.harvest[node.type];
    const pool = this._poolOf(playerId);
    const amount = cfg.yield;
    if (node.type === 'tree') pool.wood += amount; else pool.stone += amount;
    this.world.consumeNode(node);
    this.stats.harvested += amount;
    this._notifyGain(playerId, node.type, amount, node);
  }

  requestAttack() {
    if (!this.local.tryAttack()) return;
    this.fx.burst(
      this.local.x + Math.sin(this.local.rot) * 1.4, 1.1,
      this.local.z + Math.cos(this.local.rot) * 1.4, 0xffffff, 4, 2.5
    );
    if (this.isHost) this.hostAttack(this.local.id, this.local.x, this.local.z, this.local.rot);
    else this.net.send('attack', { x: this.local.x, z: this.local.z, rot: this.local.rot });
  }
  hostAttack(playerId, x, z, rot) {
    const a = CFG.player.attack;
    for (const e of this.enemyMgr.list) {
      if (e.dead) continue;
      const d = dist(x, z, e.x, e.z);
      if (d > a.range + e.st.radius) continue;
      const ang = Math.atan2(e.x - x, e.z - z);
      let diff = Math.abs(((ang - rot + Math.PI) % (Math.PI * 2)) - Math.PI);
      if (diff > a.arc) continue;
      this._hurtEnemy(e, a.dmg, 'player');
    }
  }

  requestStartWave() {
    if (this.isHost) {
      if (this.wave.startWave()) this.net.send('waveStarted', {});
    } else this.net.send('startWave', {});
  }

  requestHarvestUpgrade() {
    if (this.isHost) this.hostHarvestUpgrade(this.local.id);
    else this.net.send('hup', {});
  }
  hostHarvestUpgrade(playerId) {
    const p = this.players.get(playerId);
    if (!p) return;
    const next = CFG.harvest.upgrade[p.harvestLv];
    if (!next) { this._notify(playerId, '채집 속도가 최대입니다', 'bad'); return; }
    const pool = this._poolOf(playerId);
    if (!canAfford(pool, next.cost)) { this._notify(playerId, '자원이 부족합니다', 'bad'); return; }
    payCost(pool, next.cost);
    p.harvestLv += 1;
    this._notify(playerId, `채집 속도 Lv.${p.harvestLv}`, 'good');
    if (playerId !== this.local.id) this.net.send('hupOk', { to: playerId, lv: p.harvestLv });
  }

  requestShard() {
    if (this.isHost) this.hostShard(this.local.id);
    else this.net.send('shard', {});
  }
  hostShard(playerId) {
    const pool = this._poolOf(playerId);
    if ((pool.shard || 0) <= 0) { this._notify(playerId, '수정 정수가 없습니다', 'bad'); return; }
    if (this.world.crystal.hp >= this.world.crystal.maxHp) { this._notify(playerId, '크리스탈이 이미 온전합니다', 'bad'); return; }
    pool.shard -= 1;
    this.world.healCrystal(this.world.crystal.maxHp * 0.25);
    this.fx.ring(0, 0, 0x8affc0, 8);
    this.fx.float('+25%', 0, 5, 0, 'good');
  }

  requestGive(toId, wood, stone) {
    if (this.isHost) this.hostGive(this.local.id, toId, wood, stone);
    else this.net.send('give', { to: toId, wood, stone });
  }
  hostGive(fromId, toId, wood, stone) {
    if (this.shared) return;
    const from = this._poolOf(fromId), to = this._poolOf(toId);
    wood = Math.max(0, Math.min(wood | 0, from.wood));
    stone = Math.max(0, Math.min(stone | 0, from.stone));
    from.wood -= wood; from.stone -= stone;
    to.wood += wood; to.stone += stone;
    this._notify(toId, `자원을 받았다 🪵${wood} 🪨${stone}`, 'good');
  }

  _notify(playerId, text, kind) {
    if (playerId === this.local.id) this.ui?.toast(text, kind);
    else this.net.send('toast', { to: playerId, text, kind });
  }
  _notifyGain(playerId, type, amount, node) {
    const label = type === 'tree' ? `+${amount} 🪵` : `+${amount} 🪨`;
    if (playerId === this.local.id) {
      this.fx.float(label, node.x, 2.2, node.z, 'good');
    } else {
      this.net.send('gain', { to: playerId, label, x: node.x, z: node.z });
    }
    this.fx.burst(node.x, 1.4, node.z, type === 'tree' ? 0x7ac74f : 0xb0b6c2, 6, 3);
  }

  // ---------------------------------------------------------------- 네트워크
  _bindNet() {
    const net = this.net;

    net.on('peerJoin', (p) => {
      if (!this.running) { this.ui?.refreshLobby(); return; }
      const rp = new RemotePlayer(p.id, p.name, this._colorIndex(p.id));
      this.sm.scene.add(rp.mesh);
      this.players.set(p.id, rp);
      this._poolOf(p.id);
      this.ui?.toast(`${p.name} 님이 합류했다`, 'good');
      this.ui?.refreshLobby();
    });

    net.on('peerLeave', (p) => {
      const rp = this.players.get(p.id);
      if (rp) { this.sm.scene.remove(rp.mesh); this.players.delete(p.id); }
      this.ui?.toast(`${p.name} 님이 나갔다`, 'bad');
      this.ui?.refreshLobby();
    });

    // 로비: 호스트가 게임 시작을 알린다
    net.on('startGame', (d) => {
      if (this.running && !this.result) return;   // 게임 종료 후에는 방장이 재시작할 수 있다
      this.begin({ seed: d.seed, shared: d.shared });
      this._syncRosterIntoGame();
    });

    // 각 클라이언트가 자기 캐릭터 상태를 브로드캐스트
    net.on('pos', (d, from) => {
      let p = this.players.get(from);
      if (!p) {
        p = new RemotePlayer(from, net.peers.get(from)?.name || '플레이어', this._colorIndex(from));
        this.sm.scene.add(p.mesh);
        this.players.set(from, p);
        this._poolOf(from);
      }
      if (p.applyNet) p.applyNet(d);
    });

    // 호스트가 처리하는 요청들
    net.on('build', (d, from) => { if (this.isHost) this.hostBuild(from, d.key, d.gx, d.gz); });
    net.on('upgrade', (d, from) => { if (this.isHost) this.hostUpgrade(from, d.id); });
    net.on('sell', (d, from) => { if (this.isHost) this.hostSell(from, d.id); });
    net.on('harvest', (d, from) => { if (this.isHost) this.hostHarvest(from, d.id, d.x, d.z); });
    net.on('attack', (d, from) => { if (this.isHost) this.hostAttack(from, d.x, d.z, d.rot); });
    net.on('startWave', (d, from) => { if (this.isHost && this.wave?.startWave()) this.net.send('waveStarted', {}); });
    net.on('hup', (d, from) => { if (this.isHost) this.hostHarvestUpgrade(from); });
    net.on('shard', (d, from) => { if (this.isHost) this.hostShard(from); });
    net.on('give', (d, from) => { if (this.isHost) this.hostGive(from, d.to, d.wood, d.stone); });

    // 호스트 → 특정 클라이언트
    net.on('hurt', (d) => { if (d.to === net.selfId) this._hurtLocal(d.dmg); });
    net.on('toast', (d) => { if (d.to === net.selfId) this.ui?.toast(d.text, d.kind); });
    net.on('gain', (d) => { if (d.to === net.selfId) this.fx.float(d.label, d.x, 2.2, d.z, 'good'); });
    net.on('hupOk', (d) => { if (d.to === net.selfId) this.local.harvestLv = d.lv; });
    net.on('waveStarted', () => { if (!this.isHost) this.ui?.toast('웨이브 시작!', 'warn'); });

    // 호스트 → 전체 스냅샷
    net.on('snap', (d, from) => {
      if (this.isHost || !this.running) return;
      this._applySnapshot(d);
    });
  }

  _syncRosterIntoGame() {
    for (const r of this.net.roster()) {
      if (r.id === this.local.id) continue;
      if (this.players.has(r.id)) continue;
      const rp = new RemotePlayer(r.id, r.name, this._colorIndex(r.id));
      this.sm.scene.add(rp.mesh);
      this.players.set(r.id, rp);
      this._poolOf(r.id);
    }
  }

  _snapshot() {
    const players = {};
    for (const p of this.players.values()) {
      players[p.id] = { hv: p.harvestLv };
    }
    return {
      e: this.enemyMgr.snapshot(),
      b: this.buildMgr.snapshot(),
      n: this.world.nodeSnapshot(),
      w: this.wave.snapshot(),
      c: Math.round(this.world.crystal.hp),
      r: this.shared ? { team: this.pools.team } : { byId: this.pools.byId },
      p: players,
      sh: this.shared,
    };
  }

  _applySnapshot(s) {
    this.shared = s.sh;
    this.enemyMgr.applySnapshot(s.e, s.w.wave + 1);
    this.buildMgr.applySnapshot(s.b);
    this.world.applyNodeSnapshot(s.n);
    this.wave.applySnapshot(s.w);
    const prevHp = this.world.crystal.hp;
    this.world.crystal.hp = s.c;
    if (s.c < prevHp) { this.ui?.shake(); this.fx.burst(0, 3.2, 0, 0x63e0ff, 8, 4); }
    if (s.r.team) this.pools.team = s.r.team;
    if (s.r.byId) this.pools.byId = s.r.byId;
    for (const [id, pd] of Object.entries(s.p || {})) {
      const p = this.players.get(id);
      if (p) p.harvestLv = pd.hv;
    }
    if (this.wave.phase === PHASE.LOST && !this.result) { this.result = 'lose'; this.ui?.showResult(false, this.stats, this.wave.wave); }
    if (this.wave.phase === PHASE.WON && !this.result) { this.result = 'win'; this.ui?.showResult(true, this.stats, this.wave.wave); }
  }

  // ---------------------------------------------------------------- 루프
  update(dt) {
    this.net.update(dt);
    if (!this.running) return;
    const now = performance.now() / 1000;
    const over = this.wave.phase === PHASE.WON || this.wave.phase === PHASE.LOST;

    this._handleInput(dt, over);

    // 로컬 캐릭터
    if (!over) this.local.update(dt, this.input, this.sm, this.grid, this.world);
    for (const p of this.players.values()) {
      if (p !== this.local && p.update) p.update(dt);
    }

    // 호스트 시뮬레이션
    if (this.isHost && !over) {
      this.wave.update(dt);
      this.enemyMgr.simulate(dt, now, [...this.players.values()], this.buildMgr);
    } else {
      this.enemyMgr.interpolate(dt);
    }

    // 타워는 모두가 그리고, 데미지는 호스트에서만 적용된다
    if (!over) this.buildMgr.updateTowers(dt, this.enemyMgr.list, now);

    this.world.update(dt, now);
    this.projectiles.update(dt);
    this.fx.update(dt);
    this.buildMgr.update(dt, this.sm.camera);
    this.enemyMgr.updateVisual(dt, this.sm.camera);
    this.sm.follow(this.local.mesh.position, dt);

    this._netTick(dt);
    this.ui?.update(dt);
    this.input.endFrame();
  }

  _handleInput(dt, over) {
    const inp = this.input;
    if (over) return;

    // 건설 단축키
    for (const [key, def] of Object.entries(CFG.builds)) {
      if (inp.hit(def.hotkey)) this.setBuildMode(key);
    }
    if (inp.hit('u')) this.setBuildMode('upgrade');
    if (inp.hit('x')) this.setBuildMode('sell');
    if (inp.hit('escape')) this.setBuildMode(null);
    if (inp.hit('r')) this.requestShard();
    if (inp.hit('enter') && this.wave.phase === PHASE.PREP) this.requestStartWave();

    const pointer = this.sm.updatePointerWorld();
    this.buildMgr.updateGhost(pointer, this.myPool);

    // 좌클릭: 배치 / 업그레이드 / 철거, 건설 모드가 아니면 공격
    if (inp.clicked) {
      if (this.buildMgr.mode && CFG.builds[this.buildMgr.mode]) {
        if (this.buildMgr.ghostValid && this.buildMgr.ghostCell) {
          const c = this.buildMgr.ghostCell;
          this.requestBuild(this.buildMgr.mode, c.gx, c.gz);
        } else if (this.buildMgr.ghostReason) {
          this.ui?.toast(this.buildMgr.ghostReason, 'bad');
        }
      } else if (this.buildMgr.mode === 'upgrade') {
        if (this.buildMgr.hover) this.requestUpgrade(this.buildMgr.hover.id);
      } else if (this.buildMgr.mode === 'sell') {
        if (this.buildMgr.hover) this.requestSell(this.buildMgr.hover.id);
      } else {
        this.requestAttack();
      }
    }
    if (inp.rightClicked && this.buildMgr.mode) this.setBuildMode(null);
    if (inp.hit(' ')) this.requestAttack();

    // 채집 (F 키를 누르고 있는 동안)
    const holding = inp.down('f') || inp.down('e') || this.ui?.harvestHeld;
    const done = this.local.tickHarvest(dt, this.world, holding && !this.buildMgr.mode);
    if (done) this.requestHarvest(done.id);
  }

  setBuildMode(mode) {
    this.buildMode = this.buildMgr.setMode(mode);
    this.ui?.refreshBuildBar();
    return this.buildMode;
  }

  _netTick(dt) {
    if (!this.net.online) return;
    this._accum.pos += dt;
    if (this._accum.pos >= 1 / CFG.net.inputHz) {
      this._accum.pos = 0;
      const l = this.local;
      this.net.send('pos', {
        x: Math.round(l.x * 20) / 20, z: Math.round(l.z * 20) / 20,
        rot: Math.round(l.rot * 100) / 100,
        hp: Math.round(l.hp), alive: l.alive,
        harvesting: !!l.harvesting, swing: l.swing > 0.7,
      });
    }
    if (this.isHost) {
      this._accum.snap += dt;
      if (this._accum.snap >= 1 / CFG.net.snapshotHz) {
        this._accum.snap = 0;
        this.net.send('snap', this._snapshot());
      }
    }
  }

  render() { this.sm.render(); }
}

export { PHASE };
