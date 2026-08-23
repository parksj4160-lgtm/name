import { SoundManager } from './audio.js';
import { BuildManager } from './buildings.js';
import { CFG, DIFFICULTIES, applyDifficulty, waveComposition } from './config.js';
import { EnemyManager } from './enemy.js';
import { Fx, ProjectilePool } from './fx.js';
import { BuildGrid } from './grid.js';
import { Input } from './input.js';
import { KeyMap } from './keymap.js';
import { Net } from './net.js';
import { LocalPlayer, RemotePlayer } from './player.js';
import { SceneManager } from './scene.js';
import { canAfford, dist, payCost } from './utils.js';
import { PHASE, WaveDirector } from './wave.js';
import { World } from './world.js';

var SAVE_KEY = "cd.save";
export var Game = class {
  constructor(canvas2, fxLayer2) {
    this.sm = new SceneManager(canvas2);
    this.input = new Input(canvas2, this.sm);
    this.fx = new Fx(this.sm, fxLayer2);
    this.projectiles = new ProjectilePool(this.sm);
    this.sfx = new SoundManager();
    this.km = new KeyMap(CFG.builds);
    this.net = new Net();
    this.ui = null;
    this.running = false;
    this.shared = true;
    this.pools = { team: { wood: 0, stone: 0, iron: 0, shard: 0 }, byId: {} };
    this.players = /* @__PURE__ */ new Map();
    this.stats = { harvested: 0, built: 0, kills: 0 };
    this._accum = { snap: 0, pos: 0, save: 0 };
    this._bindNet();
  }
  // ---------------------------------------------------------------- 시작/정리
  begin({ seed = 20260818, shared = true, difficulty = "normal", resumed = false } = {}) {
    this.dispose();
    this.seed = seed;
    this.shared = shared;
    this.difficulty = DIFFICULTIES[difficulty] ? difficulty : "normal";
    this.difficultyPreset = applyDifficulty(this.difficulty);
    this.grid = new BuildGrid();
    this.world = new World(this.sm, seed);
    this.buildMgr = new BuildManager(this.sm, this.grid, this.world, this.fx, this.projectiles);
    this.enemyMgr = new EnemyManager(this.sm, this.grid, this.world, this.fx);
    this.wave = new WaveDirector(this.world, this.enemyMgr);
    this.local = new LocalPlayer(this.net.selfId, this.net.name, this._colorIndex(this.net.selfId));
    this.sm.scene.add(this.local.mesh);
    this.players.set(this.local.id, this.local);
    this.pools.team = { wood: this.difficultyPreset.startWood, stone: this.difficultyPreset.startStone, iron: 0, shard: 0 };
    this.pools.byId = {};
    this._poolOf(this.local.id);
    this._wireCallbacks();
    this.stats = {
      harvested: 0,
      built: 0,
      kills: 0,
      spentWood: 0,
      spentStone: 0,
      spentIron: 0,
      spentBy: {
        build: { wood: 0, stone: 0, iron: 0 },
        upgrade: { wood: 0, stone: 0, iron: 0 },
        repair: { wood: 0, stone: 0, iron: 0 },
        harvest: { wood: 0, stone: 0, iron: 0 },
        craft: { wood: 0, stone: 0, iron: 0 }
      },
      time: 0,
      waveLog: []
    };
    this._waveMark = { time: 0, kills: 0 };
    this.buildMode = null;
    this.paused = false;
    this.running = true;
    this.result = null;
    this.sm.focus.set(this.local.x, 0, this.local.z);
    this.ui?.onGameStart(resumed);
  }
  dispose() {
    if (!this.grid) return;
    this.buildMgr?.clearAll();
    this.enemyMgr?.clearAll();
    for (const p2 of this.players.values()) this.sm.scene.remove(p2.mesh);
    this.players.clear();
    this.world?.dispose();
    if (this.buildMgr) this.sm.scene.remove(this.buildMgr.root);
    if (this.enemyMgr) this.sm.scene.remove(this.enemyMgr.root);
    this.grid = null;
    this.running = false;
  }
  get isHost() {
    return this.net.isHost;
  }
  get phase() {
    return this.wave?.phase;
  }
  _colorIndex(id) {
    let h2 = 0;
    for (let i = 0; i < id.length; i++) h2 = h2 * 31 + id.charCodeAt(i) | 0;
    return Math.abs(h2);
  }
  _poolOf(id) {
    if (this.shared) return this.pools.team;
    if (!this.pools.byId[id]) this.pools.byId[id] = { wood: this.difficultyPreset.startWood, stone: this.difficultyPreset.startStone, iron: 0, shard: 0 };
    return this.pools.byId[id];
  }
  get myPool() {
    return this._poolOf(this.local.id);
  }
  _harvestLvOf(id) {
    const p2 = this.players.get(id);
    return p2 ? p2.harvestLv : 1;
  }
  // ---------------------------------------------------------------- 콜백 연결
  _wireCallbacks() {
    this.buildMgr.onImpact = (b, st, pos) => {
      if (!this.isHost) return;
      const targets = st.splash ? this.enemyMgr.list.filter((e) => !e.dead && dist(e.x, e.z, pos.x, pos.z) <= st.splash) : this.enemyMgr.list.filter((e) => !e.dead && dist(e.x, e.z, pos.x, pos.z) <= 1.2);
      if (!targets.length) return;
      for (const e of targets) {
        if (st.slow) e.applySlow(st.slow, st.slowTime, performance.now() / 1e3);
        if (st.poisonDps) e.applyPoison(st.poisonDps, st.poisonTime, performance.now() / 1e3);
        this._hurtEnemy(e, st.dmg, b.key === "frost" ? "frost" : "tower", b.x, b.z);
      }
      this.sfx.towerHit(b.key);
    };
    // ---- 보스 패턴 연출 + 결과 처리 (호스트에서만 돈다)
    this.enemyMgr.onBossTelegraph = (e, kind) => {
      if (kind === "summon") {
        this.ui?.toast("💀 파괴자가 무언가를 부른다!", "warn");
        this.sfx.bossWaveStart();
      } else if (kind === "charge") {
        this.ui?.toast("💀 파괴자가 돌진 자세를 잡는다 — 길을 비켜라!", "warn");
        this.sfx.bossWaveStart();
      } else if (kind === "netCast") {
        this.ui?.toast("💀 파괴자가 무언가를 준비한다 — 조심!", "warn");
        this.sfx.bossWaveStart();
      } else {
        this.ui?.shake();
      }
    };
    this.enemyMgr.onBossSummon = (e, n) => {
      this.ui?.toast(`잡졸 ${n}마리가 튀어나왔다`, "bad");
      this.fx.burst(e.x, 1.6, e.z, 16733525, 18, 6);
    };
    // 돌진 중 스치는 건물을 부순다 — 벽으로 둘러싸도 보스는 밀고 들어온다
    this.enemyMgr.onBossCharge = (e) => {
      const reach = e.st.radius + 1.4;
      let hit = null;
      for (const b of this.buildMgr.buildings.values()) {
        if (dist(b.x, b.z, e.x, e.z) <= reach) {
          hit = b;
          break;
        }
      }
      if (!hit || hit === e._lastCrushed) return;
      e._lastCrushed = hit;
      const destroyed = hit.damage(CFG.bossPattern.chargeBuildingDmg);
      this.fx.burst(hit.x, 1.4, hit.z, 12303291, 10, 5);
      this.sfx.buildingHit();
      this.ui?.shake();
      if (destroyed) {
        this.fx.burst(hit.x, 1.2, hit.z, 8947848, 16, 6);
        this.buildMgr.remove(hit.id);
      }
    };
    this.enemyMgr.onPoisonTick = (e, dmg) => {
      this._hurtEnemy(e, dmg, "poison");
    };
    this.enemyMgr.onCrystalHit = (e) => {
      const dead = this.world.damageCrystal(e.st.dmg);
      this.fx.burst(0, 3.2, 0, 6545663, 10, 5);
      this.fx.float(`-${e.st.dmg}`, 0, 4.4, 0, "crystal");
      this.ui?.shake();
      this.sfx.crystalHit();
      if (dead) this._lose();
    };
    this.enemyMgr.onBuildingHit = (e, b, mult = 1) => {
      const destroyed = b.damage(Math.round(e.st.dmg * mult));
      this.fx.burst(b.x, 1.4, b.z, 12303291, 5, 3);
      this.sfx.buildingHit();
      if (destroyed) {
        this.fx.burst(b.x, 1.2, b.z, 8947848, 16, 6);
        this.buildMgr.remove(b.id);
      }
    };
    this.enemyMgr.onPlayerHit = (e, p2) => {
      if (p2.id === this.local.id) this._hurtLocal(e.st.dmg);
      else this.net.send("hurt", { to: p2.id, dmg: e.st.dmg });
    };
    this.wave.onWaveStart = (w2, total) => {
      const hasBoss = waveComposition(w2).some((c2) => c2.type === "boss");
      this.ui?.toast(hasBoss ? `⚠️ 웨이브 ${w2} 시작! 보스 등장! 몬스터 ${total}마리` : `웨이브 ${w2} 시작! 몬스터 ${total}마리`, "warn");
      this.fx.ring(0, 0, 16734834, 10);
      if (hasBoss) this.sfx.bossWaveStart();
      else this.sfx.waveStart();
    };
    this.wave.onWaveClear = (w2, reward, won) => {
      if (this.isHost) this._grantReward(reward);
      this.ui?.toast(won ? "마지막 웨이브 격퇴!" : `웨이브 ${w2} 클리어! 보상 🪵${reward.wood} 🪨${reward.stone}${reward.shard ? " 💠1" : ""}`, "good");
      this.stats.waveLog.push({
        wave: w2,
        time: this.stats.time - this._waveMark.time,
        kills: this.stats.kills - this._waveMark.kills
      });
      this._waveMark = { time: this.stats.time, kills: this.stats.kills };
      if (!won) this.sfx.waveClear();
      if (won) this._win();
    };
  }
  _hurtEnemy(e, dmg, kind = "tower", fromX, fromZ) {
    const died = e.damage(dmg, fromX, fromZ);
    this.fx.float(String(Math.round(dmg)), e.x, 1.9, e.z, kind === "player" ? "player" : "");
    if (kind === "player") this.sfx.meleeHit();
    if (died) {
      this.stats.kills++;
      this.fx.burst(e.x, 1, e.z, e.st.color, 12, 5);
      if (e.type === "boss") {
        this.fx.burst(e.x, 1.4, e.z, 16777215, 20, 8);
        this.fx.ring(e.x, e.z, 16734834, 6);
        this.ui?.shake();
        this.sfx.bossDeath();
      } else {
        this.sfx.enemyDeath();
      }
      const b = e.st.bounty;
      if (this.shared) {
        this.pools.team.wood += b.wood;
        this.pools.team.stone += b.stone;
      } else {
        for (const p2 of this.players.values()) {
          const pool = this._poolOf(p2.id);
          pool.wood += b.wood;
          pool.stone += b.stone;
        }
      }
      this.enemyMgr.kill(e);
    }
  }
  _hurtLocal(dmg) {
    const down = this.local.damage(dmg);
    this.fx.float(`-${dmg}`, this.local.x, 2.2, this.local.z, "hurt");
    this.ui?.shake();
    if (down) {
      this.ui?.toast("쓰러졌다! 잠시 후 크리스탈에서 부활한다", "bad");
      this.sfx.playerDown();
    } else {
      this.sfx.playerHurt();
    }
  }
  _grantReward(reward) {
    if (this.shared) {
      this.pools.team.wood += reward.wood;
      this.pools.team.stone += reward.stone;
      this.pools.team.shard += reward.shard;
    } else {
      for (const p2 of this.players.values()) {
        const pool = this._poolOf(p2.id);
        pool.wood += reward.wood;
        pool.stone += reward.stone;
        pool.shard += reward.shard;
      }
    }
  }
  _win() {
    this.wave.phase = PHASE.WON;
    this.result = "win";
    this.sfx.win();
    if (!this.net.online) Game.clearLocalSave();
    this.ui?.showResult(true, this.stats, this.wave.wave);
  }
  _lose() {
    this.wave.lose();
    this.result = "lose";
    this.sfx.lose();
    if (!this.net.online) Game.clearLocalSave();
    this.ui?.showResult(false, this.stats, this.wave.wave);
  }
  // ---------------------------------------------------------------- 행동 (요청 → 호스트 처리)
  requestBuild(key, gx, gz) {
    this.sfx.build();
    if (this.isHost) this.hostBuild(this.local.id, key, gx, gz);
    else this.net.send("build", { key, gx, gz });
  }
  hostBuild(playerId, key, gx, gz) {
    const def = CFG.builds[key];
    if (!def) return;
    const pool = this._poolOf(playerId);
    if (!canAfford(pool, def.cost)) {
      this._notify(playerId, "자원이 부족합니다", "bad");
      return;
    }
    const b = this.buildMgr.place(key, gx, gz, playerId);
    if (!b) {
      this._notify(playerId, "그 자리에는 건설할 수 없습니다", "bad");
      return;
    }
    payCost(pool, def.cost);
    this._trackSpend(def.cost, "build");
    this.stats.built++;
  }
  _trackSpend(cost, kind) {
    this.stats.spentWood += cost.wood || 0;
    this.stats.spentStone += cost.stone || 0;
    this.stats.spentIron += cost.iron || 0;
    const by = this.stats.spentBy[kind];
    if (by) {
      by.wood += cost.wood || 0;
      by.stone += cost.stone || 0;
      by.iron += cost.iron || 0;
    }
  }
  requestUpgrade(id) {
    this.sfx.upgrade();
    if (this.isHost) this.hostUpgrade(this.local.id, id);
    else this.net.send("upgrade", { id });
  }
  hostUpgrade(playerId, id) {
    const b = this.buildMgr.buildings.get(id);
    if (!b) return;
    const cost = b.nextCost;
    if (!cost) {
      this._notify(playerId, "이미 최대 레벨입니다", "bad");
      return;
    }
    const pool = this._poolOf(playerId);
    if (!canAfford(pool, cost)) {
      this._notify(playerId, "자원이 부족합니다", "bad");
      return;
    }
    payCost(pool, cost);
    this._trackSpend(cost, "upgrade");
    this.buildMgr.upgrade(id);
  }
  requestSell(id) {
    this.sfx.sell();
    if (this.isHost) this.hostSell(this.local.id, id);
    else this.net.send("sell", { id });
  }
  hostSell(playerId, id) {
    const b = this.buildMgr.buildings.get(id);
    if (!b) return;
    const back = this.buildMgr.refund(b);
    const pool = this._poolOf(playerId);
    pool.wood += back.wood;
    pool.stone += back.stone;
    pool.iron = (pool.iron || 0) + back.iron;
    this.fx.burst(b.x, 1.2, b.z, 12558682, 10, 4);
    this.buildMgr.remove(id);
  }
  requestRepair(id) {
    if (this.isHost) this.hostRepair(this.local.id, id);
    else this.net.send("repair", { id });
  }
  hostRepair(playerId, id) {
    const b = this.buildMgr.buildings.get(id);
    if (!b) return;
    const cost = this.buildMgr.repairCost(b);
    if (!cost) {
      this._notify(playerId, "이미 온전한 건물입니다", "bad");
      return;
    }
    const pool = this._poolOf(playerId);
    if (!canAfford(pool, cost)) {
      this._notify(playerId, "자원이 부족합니다", "bad");
      return;
    }
    payCost(pool, cost);
    this._trackSpend(cost, "repair");
    this.buildMgr.repair(b);
    this.fx.ring(b.x, b.z, 6745736, 2);
    if (playerId === this.local.id) this.sfx.upgrade();
  }
  requestHarvest(nodeId) {
    if (this.isHost) this.hostHarvest(this.local.id, nodeId, this.local.x, this.local.z);
    else this.net.send("harvest", { id: nodeId, x: this.local.x, z: this.local.z });
  }
  // 위치는 요청에 실려온 값으로 검증한다 (스냅샷 사이의 지연 때문에 서버 쪽 좌표는 낡을 수 있다)
  hostHarvest(playerId, nodeId, px, pz) {
    const node = this.world.nodeById(nodeId);
    if (!node || node.depleted) return;
    const player = this.players.get(playerId);
    if (!player) return;
    const x2 = typeof px === "number" ? px : player.x;
    const z2 = typeof pz === "number" ? pz : player.z;
    if (dist(x2, z2, node.x, node.z) > CFG.harvest.range + 1.5) return;
    const cfg = CFG.harvest[node.type];
    const pool = this._poolOf(playerId);
    const amount = cfg.yield;
    if (node.type === "tree") pool.wood += amount;
    else if (node.type === "gem") pool.shard = (pool.shard || 0) + amount;
    else pool.stone += amount;
    this.world.consumeNode(node);
    this.stats.harvested += amount;
    this._notifyGain(playerId, node.type, amount, node);
  }
  requestAttack() {
    if (!this.local.tryAttack()) return;
    this.sfx.meleeSwing();
    this.fx.burst(
      this.local.x + Math.sin(this.local.rot) * 1.4,
      1.1,
      this.local.z + Math.cos(this.local.rot) * 1.4,
      16777215,
      4,
      2.5
    );
    if (this.isHost) this.hostAttack(this.local.id, this.local.x, this.local.z, this.local.rot);
    else this.net.send("attack", { x: this.local.x, z: this.local.z, rot: this.local.rot });
  }
  hostAttack(playerId, x2, z2, rot) {
    const a = this.players.get(playerId)?.attackStats ?? CFG.player.attack;
    for (const e of this.enemyMgr.list) {
      if (e.dead) continue;
      const d2 = dist(x2, z2, e.x, e.z);
      if (d2 > a.range + e.st.radius) continue;
      const ang = Math.atan2(e.x - x2, e.z - z2);
      let diff = Math.abs((ang - rot + Math.PI) % (Math.PI * 2) - Math.PI);
      if (diff > a.arc) continue;
      this._hurtEnemy(e, a.dmg, "player", x2, z2);
    }
  }
  requestStartWave() {
    if (this.isHost) {
      if (this.wave.startWave()) this.net.send("waveStarted", {});
    } else this.net.send("startWave", {});
  }
  requestHarvestUpgrade() {
    if (this.isHost) this.hostHarvestUpgrade(this.local.id);
    else this.net.send("hup", {});
  }
  hostHarvestUpgrade(playerId) {
    const p2 = this.players.get(playerId);
    if (!p2) return;
    const next = CFG.harvest.upgrade[p2.harvestLv];
    if (!next) {
      this._notify(playerId, "채집 속도가 최대입니다", "bad");
      return;
    }
    const pool = this._poolOf(playerId);
    if (!canAfford(pool, next.cost)) {
      this._notify(playerId, "자원이 부족합니다", "bad");
      return;
    }
    payCost(pool, next.cost);
    this._trackSpend(next.cost, "harvest");
    p2.harvestLv += 1;
    this._notify(playerId, `채집 속도 Lv.${p2.harvestLv}`, "good");
    if (playerId === this.local.id) this.sfx.upgrade();
    else this.net.send("hupOk", { to: playerId, lv: p2.harvestLv });
  }
  // 화면을 클릭했을 때 — 가리킨 것이 몬스터면 때리고, 자원이면 캔다. 아무것도 없으면 그냥 휘두른다.
  // 채집 버튼 없이 대상을 직접 눌러 상호작용하는 게 기본 조작이다.
  clickWorld(pointer) {
    if (!pointer) {
      this.requestAttack();
      return;
    }
    const PICK = 2.2;
    const enemy = this._enemyNear(pointer.x, pointer.z, PICK);
    if (enemy) {
      const reach = this.local.attackStats.range + enemy.st.radius;
      if (dist(this.local.x, this.local.z, enemy.x, enemy.z) > reach) {
        this.ui?.toast(`${enemy.st.name}에게 더 가까이 가세요`, "warn");
        return;
      }
      this.local.rot = Math.atan2(enemy.x - this.local.x, enemy.z - this.local.z);
      this.requestAttack();
      return;
    }
    const node = this.world.nodeNear(pointer.x, pointer.z, PICK);
    if (node) {
      if (dist(this.local.x, this.local.z, node.x, node.z) > CFG.harvest.range) {
        this.ui?.toast("더 가까이 가야 캘 수 있습니다", "warn");
        return;
      }
      if (node.type === "gem" && !this.local.holdingPickaxe) {
        this.ui?.toast(this.local.tools.pickaxe ? "곡괭이를 손에 쥐어야 캘 수 있습니다 (인벤토리 → 장비)" : "곡괭이가 있어야 캘 수 있습니다 (제작대에서 제작)", "bad");
        return;
      }
      if (this.local.beginHarvest(node)) this.sfx.click();
      return;
    }
    this.requestAttack();
  }
  _enemyNear(x2, z2, r) {
    let best = null, bd = r * r;
    for (const e of this.enemyMgr.list) {
      if (e.dead) continue;
      const d2 = (e.x - x2) ** 2 + (e.z - z2) ** 2;
      if (d2 < bd) {
        bd = d2;
        best = e;
      }
    }
    return best;
  }
  // 제작대·화로를 클릭하면 인벤토리의 제작 탭이 열린다 (인벤토리에서 바로 열어도 된다)
  tryOpenStation(b) {
    this.sfx.click();
    this.ui?.openInventory("craft");
  }
  // 팀에 해당 시설이 세워져 있는지
  hasStation(key) {
    return [...this.buildMgr.buildings.values()].some((b) => b.key === key && !b.dead);
  }
  // 인벤토리에서 무기를 손에 든다. 순전히 내 캐릭터 상태라 호스트 승인이 필요 없다.
  // key 가 null 이면 맨손을 직접 고른 것 — 칼이 있어도 도로 들지 않는다.
  requestEquip(key) {
    const p2 = this.local;
    if (key && !p2.tools[key]) {
      this.ui?.toast("아직 만들지 않은 무기입니다", "bad");
      return;
    }
    p2.equipped = key || "none";
    this.sfx.click();
    const held = CFG.craft[p2.heldWeapon];
    this.ui?.toast(held ? `${held.name}을(를) 들었다` : "맨손이 되었다", "good");
  }
  requestCraft(key) {
    if (this.isHost) this.hostCraft(this.local.id, key);
    else this.net.send("craft", { key });
  }
  hostCraft(playerId, key) {
    const recipe = CFG.craft[key];
    const p2 = this.players.get(playerId);
    if (!recipe || !p2) return;
    if (p2.tools[key]) {
      this._notify(playerId, `이미 ${recipe.name}이(가) 있습니다`, "bad");
      return;
    }
    if (!this.hasStation("workbench")) {
      this._notify(playerId, "제작대가 있어야 만들 수 있습니다", "bad");
      return;
    }
    const pool = this._poolOf(playerId);
    if (!canAfford(pool, recipe.cost)) {
      this._notify(playerId, "자원이 부족합니다", "bad");
      return;
    }
    payCost(pool, recipe.cost);
    this._trackSpend(recipe.cost, "craft");
    p2.tools[key] = true;
    this._notify(playerId, `${recipe.name} 완성! ${recipe.desc}`, "good");
    if (playerId === this.local.id) this.sfx.upgrade();
    else this.net.send("craftOk", { to: playerId, key });
  }
  requestSmelt() {
    if (this.isHost) this.hostSmelt(this.local.id);
    else this.net.send("smelt", {});
  }
  hostSmelt(playerId) {
    if (!this.players.get(playerId)) return;
    if (!this.hasStation("furnace")) {
      this._notify(playerId, "화로가 있어야 제련할 수 있습니다", "bad");
      return;
    }
    const pool = this._poolOf(playerId);
    const cost = CFG.smelt.cost;
    if (!canAfford(pool, cost)) {
      this._notify(playerId, "광물이 부족합니다", "bad");
      return;
    }
    payCost(pool, cost);
    this._trackSpend(cost, "craft");
    pool.iron = (pool.iron || 0) + CFG.smelt.yield;
    this._notify(playerId, `철 ${CFG.smelt.yield}개를 얻었다`, "good");
    if (playerId === this.local.id) this.sfx.upgrade();
    else this.net.send("smeltOk", { to: playerId });
  }
  requestShard() {
    this.sfx.shard();
    if (this.isHost) this.hostShard(this.local.id);
    else this.net.send("shard", {});
  }
  hostShard(playerId) {
    const pool = this._poolOf(playerId);
    if ((pool.shard || 0) <= 0) {
      this._notify(playerId, "수정 정수가 없습니다", "bad");
      return;
    }
    if (this.world.crystal.hp >= this.world.crystal.maxHp) {
      this._notify(playerId, "크리스탈이 이미 온전합니다", "bad");
      return;
    }
    pool.shard -= 1;
    this.world.healCrystal(this.world.crystal.maxHp * 0.25);
    this.fx.ring(0, 0, 9109440, 8);
    this.fx.float("+25%", 0, 5, 0, "good");
  }
  requestGive(toId, wood, stone) {
    this.sfx.click();
    if (this.isHost) this.hostGive(this.local.id, toId, wood, stone);
    else this.net.send("give", { to: toId, wood, stone });
  }
  hostGive(fromId, toId, wood, stone) {
    if (this.shared) return;
    const from = this._poolOf(fromId), to2 = this._poolOf(toId);
    wood = Math.max(0, Math.min(wood | 0, from.wood));
    stone = Math.max(0, Math.min(stone | 0, from.stone));
    from.wood -= wood;
    from.stone -= stone;
    to2.wood += wood;
    to2.stone += stone;
    this._notify(toId, `자원을 받았다 🪵${wood} 🪨${stone}`, "good");
  }
  _notify(playerId, text, kind) {
    if (playerId === this.local.id) {
      this.ui?.toast(text, kind);
      if (kind === "bad") this.sfx.denied();
    } else this.net.send("toast", { to: playerId, text, kind });
  }
  _notifyGain(playerId, type, amount, node) {
    const label = type === "tree" ? `+${amount} 🪵` : type === "gem" ? `+${amount} 💠` : `+${amount} 🪨`;
    if (playerId === this.local.id) {
      this.fx.float(label, node.x, 2.2, node.z, "good");
      if (type === "gem") this.sfx.shard();
    } else {
      this.net.send("gain", { to: playerId, label, x: node.x, z: node.z });
    }
    this.fx.burst(node.x, 1.4, node.z, type === "tree" ? 8046415 : type === "gem" ? 14061311 : 11581122, 6, 3);
  }
  // ---------------------------------------------------------------- 네트워크
  _bindNet() {
    const net = this.net;
    net.on("peerJoin", (p2) => {
      if (!this.running) {
        this.ui?.refreshLobby();
        return;
      }
      const rp2 = new RemotePlayer(p2.id, p2.name, this._colorIndex(p2.id));
      this.sm.scene.add(rp2.mesh);
      this.players.set(p2.id, rp2);
      this._poolOf(p2.id);
      this.ui?.toast(`${p2.name} 님이 합류했다`, "good");
      this.ui?.refreshLobby();
    });
    net.on("peerLeave", (p2) => {
      const rp2 = this.players.get(p2.id);
      if (rp2) {
        this.sm.scene.remove(rp2.mesh);
        this.players.delete(p2.id);
      }
      this.ui?.toast(`${p2.name} 님이 나갔다`, "bad");
      this.ui?.refreshLobby();
    });
    net.on("startGame", (d2) => {
      if (this.running && !this.result) return;
      this.begin({ seed: d2.seed, shared: d2.shared, difficulty: d2.difficulty });
      this._syncRosterIntoGame();
    });
    net.on("pos", (d2, from) => {
      let p2 = this.players.get(from);
      if (!p2) {
        p2 = new RemotePlayer(from, net.peers.get(from)?.name || "플레이어", this._colorIndex(from));
        this.sm.scene.add(p2.mesh);
        this.players.set(from, p2);
        this._poolOf(from);
      }
      if (p2.applyNet) p2.applyNet(d2);
    });
    net.on("build", (d2, from) => {
      if (this.isHost) this.hostBuild(from, d2.key, d2.gx, d2.gz);
    });
    net.on("upgrade", (d2, from) => {
      if (this.isHost) this.hostUpgrade(from, d2.id);
    });
    net.on("sell", (d2, from) => {
      if (this.isHost) this.hostSell(from, d2.id);
    });
    net.on("repair", (d2, from) => {
      if (this.isHost) this.hostRepair(from, d2.id);
    });
    net.on("harvest", (d2, from) => {
      if (this.isHost) this.hostHarvest(from, d2.id, d2.x, d2.z);
    });
    net.on("attack", (d2, from) => {
      if (this.isHost) this.hostAttack(from, d2.x, d2.z, d2.rot);
    });
    net.on("startWave", (d2, from) => {
      if (this.isHost && this.wave?.startWave()) this.net.send("waveStarted", {});
    });
    net.on("hup", (d2, from) => {
      if (this.isHost) this.hostHarvestUpgrade(from);
    });
    net.on("craft", (d2, from) => {
      if (this.isHost) this.hostCraft(from, d2.key);
    });
    net.on("smelt", (d2, from) => {
      if (this.isHost) this.hostSmelt(from);
    });
    net.on("shard", (d2, from) => {
      if (this.isHost) this.hostShard(from);
    });
    net.on("give", (d2, from) => {
      if (this.isHost) this.hostGive(from, d2.to, d2.wood, d2.stone);
    });
    net.on("hurt", (d2) => {
      if (d2.to === net.selfId) this._hurtLocal(d2.dmg);
    });
    net.on("toast", (d2) => {
      if (d2.to !== net.selfId) return;
      this.ui?.toast(d2.text, d2.kind);
      if (d2.kind === "bad") this.sfx.denied();
    });
    net.on("gain", (d2) => {
      if (d2.to === net.selfId) this.fx.float(d2.label, d2.x, 2.2, d2.z, "good");
    });
    net.on("hupOk", (d2) => {
      if (d2.to === net.selfId) {
        this.local.harvestLv = d2.lv;
        this.sfx.upgrade();
      }
    });
    net.on("craftOk", (d2) => {
      if (d2.to === net.selfId) {
        this.local.tools[d2.key] = true;
        this.sfx.upgrade();
      }
    });
    net.on("smeltOk", (d2) => {
      if (d2.to === net.selfId) this.sfx.upgrade();
    });
    net.on("waveStarted", () => {
      if (!this.isHost) {
        this.ui?.toast("웨이브 시작!", "warn");
        this.sfx.waveStart();
      }
    });
    net.on("snap", (d2, from) => {
      if (this.isHost || !this.running) return;
      this._applySnapshot(d2);
    });
  }
  _syncRosterIntoGame() {
    for (const r of this.net.roster()) {
      if (r.id === this.local.id) continue;
      if (this.players.has(r.id)) continue;
      const rp2 = new RemotePlayer(r.id, r.name, this._colorIndex(r.id));
      this.sm.scene.add(rp2.mesh);
      this.players.set(r.id, rp2);
      this._poolOf(r.id);
    }
  }
  _snapshot() {
    const players = {};
    for (const p2 of this.players.values()) {
      players[p2.id] = { hv: p2.harvestLv, tl: Object.keys(p2.tools).filter((k2) => p2.tools[k2]), eq: p2.equipped || null };
    }
    return {
      e: this.enemyMgr.snapshot(),
      b: this.buildMgr.snapshot(),
      n: this.world.nodeSnapshot(),
      w: this.wave.snapshot(),
      c: Math.round(this.world.crystal.hp),
      r: this.shared ? { team: this.pools.team } : { byId: this.pools.byId },
      p: players,
      sh: this.shared
    };
  }
  _applySnapshot(s2) {
    this.shared = s2.sh;
    this.enemyMgr.applySnapshot(s2.e, s2.w.wave + 1);
    this.buildMgr.applySnapshot(s2.b);
    this.world.applyNodeSnapshot(s2.n);
    this.wave.applySnapshot(s2.w);
    const prevHp = this.world.crystal.hp;
    this.world.crystal.hp = s2.c;
    if (s2.c < prevHp) {
      this.ui?.shake();
      this.fx.burst(0, 3.2, 0, 6545663, 8, 4);
      this.sfx.crystalHit();
    }
    if (s2.r.team) this.pools.team = s2.r.team;
    if (s2.r.byId) this.pools.byId = s2.r.byId;
    for (const [id, pd2] of Object.entries(s2.p || {})) {
      const p2 = this.players.get(id);
      if (p2) {
        p2.harvestLv = pd2.hv;
        p2.tools = {};
        for (const k2 of pd2.tl || []) p2.tools[k2] = true;
        if (p2 !== this.local) p2.equipped = pd2.eq || null;
      }
    }
    if (this.wave.phase === PHASE.LOST && !this.result) {
      this.result = "lose";
      this.ui?.showResult(false, this.stats, this.wave.wave);
    }
    if (this.wave.phase === PHASE.WON && !this.result) {
      this.result = "win";
      this.ui?.showResult(true, this.stats, this.wave.wave);
    }
  }
  // ---------------------------------------------------------------- 루프
  update(dt2) {
    this.net.update(dt2);
    if (!this.running) return;
    const now = performance.now() / 1e3;
    const over = this.wave.phase === PHASE.WON || this.wave.phase === PHASE.LOST;
    if (!over && this.input.hit(this.km.get("pause"))) this.togglePause();
    if (this.paused) {
      this.input.endFrame();
      this.ui?.update(dt2);
      return;
    }
    if (!over) this.stats.time += dt2;
    this._handleInput(dt2, over);
    if (!over) this.local.update(dt2, this.input, this.sm, this.grid, this.world);
    for (const p2 of this.players.values()) {
      if (p2 !== this.local && p2.update) p2.update(dt2);
    }
    if (this.isHost && !over) {
      this.wave.update(dt2);
      this.enemyMgr.simulate(dt2, now, [...this.players.values()], this.buildMgr);
    } else {
      this.enemyMgr.interpolate(dt2);
    }
    if (!over) this.buildMgr.updateTowers(dt2, this.enemyMgr.list, now);
    this.world.update(dt2, now);
    this.projectiles.update(dt2);
    this.fx.update(dt2);
    this.buildMgr.update(dt2, this.sm.camera);
    this.enemyMgr.updateVisual(dt2, this.sm.camera);
    this.sm.follow(this.local.mesh.position, dt2);
    this._netTick(dt2);
    this._autosaveTick(dt2, over);
    this.ui?.update(dt2);
    this.input.endFrame();
  }
  _handleInput(dt2, over) {
    const inp = this.input;
    if (over) return;
    const km = this.km;
    for (const key of Object.keys(CFG.builds)) {
      if (inp.hit(km.get("build:" + key))) this.setBuildMode(key);
    }
    if (inp.hit(km.get("upgrade"))) this.setBuildMode("upgrade");
    if (inp.hit(km.get("repair"))) this.setBuildMode("repair");
    if (inp.hit(km.get("sell"))) this.setBuildMode("sell");
    if (inp.hit(km.get("cancel"))) this.setBuildMode(null);
    if (inp.hit(km.get("shard"))) this.requestShard();
    if (inp.hit(km.get("startWave")) && this.wave.phase === PHASE.PREP) this.requestStartWave();
    const pointer = this.sm.updatePointerWorld();
    this.buildMgr.updateGhost(pointer, this.myPool);
    if (inp.clicked) {
      if (this.buildMgr.mode && CFG.builds[this.buildMgr.mode]) {
        if (this.buildMgr.ghostValid && this.buildMgr.ghostCell) {
          const c2 = this.buildMgr.ghostCell;
          const cellKey = `${c2.gx},${c2.gz}`;
          if (inp.clickedByTouch && this._tapCell !== cellKey) {
            this._tapCell = cellKey;
            this.ui?.toast("한 번 더 눌러 짓기", "warn");
          } else {
            this._tapCell = null;
            this.requestBuild(this.buildMgr.mode, c2.gx, c2.gz);
          }
        } else if (this.buildMgr.ghostReason) {
          this._tapCell = null;
          this.ui?.toast(this.buildMgr.ghostReason, "bad");
        }
      } else if (this.buildMgr.mode === "upgrade") {
        if (this.buildMgr.hover) this.requestUpgrade(this.buildMgr.hover.id);
      } else if (this.buildMgr.mode === "repair") {
        if (this.buildMgr.hover) this.requestRepair(this.buildMgr.hover.id);
      } else if (this.buildMgr.mode === "sell") {
        if (this.buildMgr.hover) this.requestSell(this.buildMgr.hover.id);
      } else if (this.buildMgr.hover?.stationKind) {
        this.tryOpenStation(this.buildMgr.hover);
      } else {
        this.clickWorld(pointer);
      }
    }
    if (inp.rightClicked && this.buildMgr.mode) this.setBuildMode(null);
    if (inp.hit(km.get("attack"))) this.requestAttack();
    const holding = inp.down(km.get("harvest")) || inp.down("e") || this.ui?.harvestHeld;
    const done = this.local.tickHarvest(dt2, this.world, holding && !this.buildMgr.mode);
    if (done) {
      this.requestHarvest(done.id);
      this.sfx.harvestDone(done.type);
    }
  }
  togglePause() {
    if (this.net.online) {
      this.ui?.toast("멀티플레이에서는 일시정지할 수 없습니다", "bad");
      return;
    }
    this.paused = !this.paused;
    this.sfx.click();
    this.ui?.onPauseChange(this.paused);
  }
  setBuildMode(mode) {
    // 벽·타워는 제작대가 있어야 짓는다 (제작대·화로 자체는 맨손으로 세운다)
    const def = CFG.builds[mode];
    if (def && !def.station && !this.hasStation("workbench")) {
      this.ui?.toast(`${def.name}은(는) 제작대를 지어야 만들 수 있습니다`, "bad");
      return this.buildMode;
    }
    this.buildMode = this.buildMgr.setMode(mode);
    this._tapCell = null;
    this.ui?.refreshBuildBar();
    return this.buildMode;
  }
  _netTick(dt2) {
    if (!this.net.online) return;
    this._accum.pos += dt2;
    if (this._accum.pos >= 1 / CFG.net.inputHz) {
      this._accum.pos = 0;
      const l2 = this.local;
      this.net.send("pos", {
        x: Math.round(l2.x * 20) / 20,
        z: Math.round(l2.z * 20) / 20,
        rot: Math.round(l2.rot * 100) / 100,
        hp: Math.round(l2.hp),
        alive: l2.alive,
        harvesting: !!l2.harvesting,
        held: l2.heldWeapon === "default" ? null : l2.heldWeapon,
        swing: l2.swing > 0.7
      });
    }
    if (this.isHost) {
      this._accum.snap += dt2;
      if (this._accum.snap >= 1 / CFG.net.snapshotHz) {
        this._accum.snap = 0;
        this.net.send("snap", this._snapshot());
      }
    }
  }
  // ---------------------------------------------------------------- 저장/이어하기 (싱글 플레이 전용)
  _autosaveTick(dt2, over) {
    if (this.net.online || over) return;
    this._accum.save += dt2;
    if (this._accum.save < 4) return;
    this._accum.save = 0;
    this.saveLocal();
  }
  saveLocal() {
    if (this.net.online || !this.running || !this.wave) return;
    if (this.wave.phase === PHASE.WON || this.wave.phase === PHASE.LOST) return;
    const save = {
      v: 1,
      ts: Date.now(),
      seed: this.seed,
      shared: this.shared,
      difficulty: this.difficulty || "normal",
      snap: this._snapshot(),
      stats: this.stats
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch {
    }
  }
  static loadLocal() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const save = JSON.parse(raw);
      if (!save || save.v !== 1 || !save.snap) return null;
      return save;
    } catch {
      return null;
    }
  }
  static clearLocalSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
    }
  }
  resumeLocal(save) {
    this.begin({ seed: save.seed, shared: save.shared, difficulty: save.difficulty, resumed: true });
    const s2 = save.snap;
    this.enemyMgr.applySnapshot(s2.e, s2.w.wave + 1);
    this.buildMgr.applySnapshot(s2.b);
    this.world.applyNodeSnapshot(s2.n);
    this.wave.applySnapshot(s2.w);
    this.world.crystal.hp = s2.c;
    if (s2.r.team) this.pools.team = s2.r.team;
    if (s2.r.byId) this.pools.byId = s2.r.byId;
    const savedPlayer = Object.values(s2.p || {})[0];
    if (savedPlayer) {
      this.local.harvestLv = savedPlayer.hv;
      this.local.tools = {};
      for (const k2 of savedPlayer.tl || []) this.local.tools[k2] = true;
      this.local.equipped = savedPlayer.eq || null;
    }
    if (save.stats) this.stats = save.stats;
    this.ui?.toast(`이어하기 — 웨이브 ${this.wave.displayWave}`, "good");
  }
  render() {
    this.sm.render();
  }
};
