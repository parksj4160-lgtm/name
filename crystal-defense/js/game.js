import * as THREE from '../vendor/three.module.js';
import { ACHIEVEMENTS, unlock } from './achievements.js';
import { SoundManager } from './audio.js';
import { BuildManager } from './buildings.js';
import { CFG, DIFFICULTIES, SPECIAL_WAVES, WEATHER, applyDifficulty, needsPickaxe, specialWaveKind, waveComposition, waveReward, weatherOf } from './config.js';
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
      waveLog: [],
      newAchievements: [],
      bossKillsSeen: [],
      trapsTriggered: 0,
      elitesKilled: 0
    };
    this._waveMark = { time: 0, kills: 0 };
    this._bossActive = false;
    this._bossWaveDamaged = false;
    this.sm.resetNight();
    this.sm.resetWeather();
    this.world.weatherKind = null;
    this._seenVariant = false;
    this._seenSynergy = false;
    this._seenRootSynergy = false;
    this._seenTrap = false;
    this._seenDash = false;
    this._seenBomb = false;
    this.boonMult = { atk: 1, towerDmg: 1, skillCostDelta: 0, bounty: 1, crystalUpgradeCostDelta: 0, weaponUpgradeCostDelta: 0 };
    this.pendingBoon = null;
    this._dropTimer = CFG.supplyDrop.firstDelay;
    this._dropIdSeq = 1;
    this._meteorTimer = CFG.meteor.firstDelay;
    this._meteorPending = null;
    this.world.clearMeteor();
    this.buildMode = null;
    this.paused = false;
    this.running = true;
    this.result = null;
    this.sm.focus.set(this.local.x, 0, this.local.z);
    this.ui?.onGameStart(resumed);
  }
  dispose() {
    if (!this.grid) return;
    this.sfx.music.stop();
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
      const now = performance.now() / 1e3;
      const frostSynergy = b.key === "arrow" && this.buildMgr.hasNearbyFrost(b);
      for (const e of targets) {
        const wasRooted = b.key !== "snare" && now < e.rootUntil;
        if (st.slow) e.applySlow(st.slow, st.slowTime, now);
        if (st.poisonDps) e.applyPoison(st.poisonDps, st.poisonTime, now);
        if (st.root) e.applyRoot(st.root, now);
        let base = st.dmg;
        if (frostSynergy && now < e.slowUntil) base *= 1 + CFG.synergy.frostArrow.dmgMult;
        if (wasRooted) {
          base *= 1 + CFG.synergy.rootSnare.dmgMult;
          if (!this._seenRootSynergy) {
            this._seenRootSynergy = true;
            this.ui?.toast("🕸️⚔️ 시너지 발동! 덫탑에 묶인 적을 다른 타워가 맞추면 추가 피해", "good");
          }
        }
        this._hurtEnemy(e, Math.round(base * this.boonMult.towerDmg), b.key === "frost" ? "frost" : "tower", b.x, b.z);
      }
      this.sfx.towerHit(b.key);
    };
    this.enemyMgr.onBossTelegraph = (e, kind) => {
      const nm = `${CFG.enemies[e.type]?.icon || "💀"} ${CFG.enemies[e.type]?.name || "보스"}`;
      if (kind === "summon") {
        this.ui?.toast(`${nm}가 무언가를 부른다!`, "warn");
        this.sfx.bossWaveStart();
      } else if (kind === "silence") {
        this.ui?.toast(`${nm}가 발밑에 침묵 장판을 준비한다 — 타워가 멈출 것이다!`, "warn");
        this.sfx.bossWaveStart();
      } else if (kind === "silenceGo") {
        this.ui?.toast(`🔇 침묵 장판 발동! 반경 안의 타워가 멈췄다 — 직접 막아라`, "bad");
        this.fx.ring(e.x, e.z, 8011711, CFG.bossPattern.silenceRadius);
      } else if (kind === "charge") {
        this.ui?.toast(`${nm}가 돌진 자세를 잡는다 — 길을 비켜라!`, "warn");
        this.sfx.bossWaveStart();
      } else if (kind === "netCast") {
        this.ui?.toast(`${nm}가 무언가를 준비한다 — 조심!`, "warn");
        this.sfx.bossWaveStart();
      } else {
        this.ui?.shake();
      }
    };
    this.enemyMgr.onBossSummon = (e, n) => {
      const msg = e.st.summonVariant === "shield" ? `🛡️ 방패 두른 잡졸 ${n}마리가 튀어나왔다 — 등 뒤를 노려라` : `잡졸 ${n}마리가 튀어나왔다`;
      this.ui?.toast(msg, "bad");
      this.fx.burst(e.x, 1.6, e.z, 16733525, 18, 6);
    };
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
    this.enemyMgr.onHealPulse = (e) => {
      this.fx.ring(e.x, e.z, 3390720, CFG.enemies.healer.healAura.radius);
    };
    this.enemyMgr.onSpawn = (e) => {
      if (e.elite) {
        if (specialWaveKind(this.wave.wave + 1) !== "elite") {
          this.ui?.toast(`⭐ 정예 ${CFG.enemies[e.type].name} 등장! 체력·공격력이 훨씬 세지만 처치 보상은 3배다`, "warn");
        }
        return;
      }
      if (e.type === "healer" && !this._seenHealer) {
        this._seenHealer = true;
        this.ui?.toast("💉 치유사 등장! 주기적으로 주변 아군을 회복시킨다 — 놔두면 무리 전체가 안 죽는다, 먼저 노려라", "warn");
      }
      if (!e.variant || this._seenVariant) return;
      this._seenVariant = true;
      const v = CFG.variants[e.variant];
      const HINTS = {
        shield: "정면 공격은 약해진다 — 등 뒤로 돌아가서 쳐라",
        split: "죽으면 약한 개체 2마리로 갈라진다",
        dash: "가끔 폭발적으로 빨라진다",
        regen: "잠시라도 안 때리면 체력이 도로 차오른다 — 끝까지 몰아쳐라",
        ward: "타워가 조준하지 못한다 — 직접 달려가서 근접이나 스킬로 처치해야 한다"
      };
      const hint = HINTS[e.variant] || "";
      this.ui?.toast(`${v.icon} ${v.name} 변종 등장! ${hint}`, "warn");
    };
    this.buildMgr.onSynergy = (kind) => {
      if (this._seenSynergy) return;
      this._seenSynergy = true;
      const msg = kind === "frostArrow" ? "🧊🏹 시너지 발동! 서리탑 근처 화살탑이 둔화된 적에게 추가 피해를 준다" : "☠️☠️ 시너지 발동! 가까이 모인 독탑끼리 독 피해가 강해진다";
      this.ui?.toast(msg, "good");
    };
    this.enemyMgr.onCrystalHit = (e) => {
      const hpBefore = this.world.crystal.hp;
      const dead = this.world.damageCrystal(e.st.dmg);
      if (this.world.crystal.hp < hpBefore && this._bossActive) this._bossWaveDamaged = true;
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
      this.ui?.toast(this._waveStartLabel(w2, total), "warn");
      const bossEntry = waveComposition(w2).find((c2) => CFG.enemies[c2.type]?.boss);
      this.fx.ring(0, 0, 16734834, 10);
      if (bossEntry) this.sfx.bossWaveStart();
      else this.sfx.waveStart();
      if (this.isHost) {
        this._bossActive = !!bossEntry;
        this._bossWaveDamaged = false;
      }
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
      this._checkWaveAchievements(w2);
      if (won) this._win();
      else if (this.isHost && this.wave.endless && w2 % CFG.endlessBoon.every === 0) this._offerBoon();
    };
  }
  // 웨이브 클리어마다 확인하는 업적들 — 호스트에서만 정확히 판정한다
  _checkWaveAchievements(w2) {
    if (!this.isHost) return;
    if (this._bossActive && !this._bossWaveDamaged) this._unlockAchievement("flawlessBoss");
    this._bossActive = false;
    const buildings = [...this.buildMgr.buildings.values()];
    if (w2 >= 5 && !buildings.some((b) => b.key === "wall")) this._unlockAchievement("noWall");
    if (w2 >= 3 && !buildings.some((b) => ["arrow", "frost", "cannon", "poison", "support"].includes(b.key))) {
      this._unlockAchievement("noTower");
    }
  }
  // 엔드리스 축복: n웨이브마다 무작위 2개 중 하나를 고른다. 표준 캠페인(엔드리스 이전)에는 절대 뜨지 않는다.
  _offerBoon() {
    const keys = Object.keys(CFG.boons);
    const a = keys[Math.floor(Math.random() * keys.length)];
    let b = keys[Math.floor(Math.random() * keys.length)];
    while (b === a && keys.length > 1) b = keys[Math.floor(Math.random() * keys.length)];
    this.pendingBoon = [a, b];
    this.ui?.showBoonChoice(this.pendingBoon);
  }
  pickBoon(key) {
    if (!this.pendingBoon || !this.pendingBoon.includes(key)) return;
    const b = CFG.boons[key];
    if (b.kind === "mult") this.boonMult[b.key] *= b.value;
    else if (b.kind === "delta") this.boonMult[b.key] += b.value;
    else if (b.kind === "instant" && key === "aid") this.world.healCrystal(300);
    else if (b.kind === "maxHp") {
      this.world.crystal.maxHp += b.value;
      this.world.crystal.hp += b.value;
    }
    this.pendingBoon = null;
    this.ui?.hideBoonChoice();
    const msg = `${b.icon} 축복 선택: ${b.name} — ${b.desc}`;
    this.ui?.toast(msg, "good");
    this.sfx.upgrade();
    this.net.send("boonPicked", { text: msg });
  }
  // playerId 를 넘기면 그 사람의 개인 행동에 대한 업적이라는 뜻 — 호스트가 참가자 대신 처리하는
  // 액션(스킬 사용 등)에서 이걸 안 넘기면, 실제로는 참가자가 한 행동인데 호스트 자신의 브라우저에
  // 업적이 잘못 붙는 사고가 난다(호스트만 _unlockAchievement 를 실행하기 때문). 팀 단위 업적(보스
  // 처치, 웨이브 클리어 조건 등)은 그대로 playerId 없이 호출한다.
  _unlockAchievement(key, playerId) {
    if (playerId !== void 0 && playerId !== this.local.id) return;
    if (!unlock(key)) return;
    const a = ACHIEVEMENTS[key];
    this.stats.newAchievements.push(key);
    this.ui?.toast(`🏆 업적 달성! ${a.icon} ${a.name} — ${a.desc}`, "good");
    this.sfx.upgrade();
  }
  // 함정: 길을 막지 않고 적이 밟기를 기다린다 (호스트에서만 판정 — 결과는 스냅샷으로 퍼진다)
  _updateTraps() {
    for (const b of [...this.buildMgr.buildings.values()]) {
      if (!b.isTrap) continue;
      const st = b.stats;
      for (const e of this.enemyMgr.list) {
        if (e.dead || e.st.flies) continue;
        if (dist(b.x, b.z, e.x, e.z) <= st.triggerRadius) {
          this._triggerTrap(b, e, st);
          break;
        }
      }
    }
  }
  _triggerTrap(b, e, st) {
    this._hurtEnemy(e, st.dmg, "tower", b.x, b.z);
    if (st.slow) e.applySlow(st.slow, st.slowTime, performance.now() / 1e3);
    this.fx.burst(b.x, 0.5, b.z, 14238251, 16, 5);
    this.fx.ring(b.x, b.z, 14238251, 2.2);
    this.sfx.buildingHit();
    this.buildMgr.remove(b.id);
    this.stats.trapsTriggered = (this.stats.trapsTriggered || 0) + 1;
    if (this.stats.trapsTriggered >= 3) this._unlockAchievement("trapMaster");
    if (!this._seenTrap) {
      this._seenTrap = true;
      this.ui?.toast("🪤 함정 발동! 큰 피해를 주고 사라졌다 — 다시 설치해야 한다", "good");
    }
  }
  // 운석 낙하: 전투 중(4웨이브부터) 가끔 경고 후 큰 범위 피해가 떨어진다 (호스트 전용 — 위치·잔여
  // 시간은 스냅샷으로 퍼지고, 참가자 화면은 world.setMeteor() 로 같은 경고 링을 그린다)
  _updateMeteor(dt2) {
    const c2 = CFG.meteor;
    if (this.wave.phase !== PHASE.COMBAT || this.wave.wave + 1 < c2.minWave) return;
    if (this._meteorPending) {
      this._meteorPending.timeLeft -= dt2;
      this.world.setMeteor(this._meteorPending.x, this._meteorPending.z, this._meteorPending.timeLeft, c2.radius);
      if (this._meteorPending.timeLeft <= 0) this._impactMeteor();
      return;
    }
    this._meteorTimer -= dt2;
    if (this._meteorTimer > 0) return;
    this._meteorTimer = c2.minGap + Math.random() * (c2.maxGap - c2.minGap);
    const inner = CFG.world.coreRadius + 3, outer = CFG.world.buildRadius - 2;
    const a = Math.random() * Math.PI * 2, r = inner + Math.random() * (outer - inner);
    this._meteorPending = { x: Math.cos(a) * r, z: Math.sin(a) * r, timeLeft: c2.telegraphTime };
    this.world.setMeteor(this._meteorPending.x, this._meteorPending.z, c2.telegraphTime, c2.radius);
    this.ui?.toast("☄️ 낙하 경고! 표시된 자리에서 벗어나라 — 몬스터를 끌어들이면 한 방에 정리할 수도 있다", "warn");
  }
  _impactMeteor() {
    const c2 = CFG.meteor;
    const { x, z } = this._meteorPending;
    this._meteorPending = null;
    this.world.clearMeteor();
    this.fx.burst(x, 1.5, z, 16729139, 26, 8);
    this.fx.ring(x, z, 16729139, c2.radius);
    this.ui?.shake();
    this.sfx.bossDeath();
    for (const e of this.enemyMgr.list) {
      if (e.dead) continue;
      if (dist(e.x, e.z, x, z) <= c2.radius) this._hurtEnemy(e, c2.dmg, "player", x, z);
    }
    for (const b of [...this.buildMgr.buildings.values()]) {
      if (dist(b.x, b.z, x, z) <= c2.radius) {
        const destroyed = b.damage(Math.round(c2.dmg * c2.buildingDmgMult));
        if (destroyed) this.buildMgr.remove(b.id);
      }
    }
    for (const p2 of this.players.values()) {
      if (dist(p2.x, p2.z, x, z) <= c2.radius) {
        if (p2.id === this.local.id) this._hurtLocal(c2.playerDmg);
        else this.net.send("hurt", { to: p2.id, dmg: c2.playerDmg });
      }
    }
  }
  // 보급품 투하: 전투 중 한 번에 최대 1개, 주기적으로 등장한다 (호스트 전용 — 결과는 스냅샷으로 퍼진다)
  _updateSupplyDrops(dt2) {
    const c2 = CFG.supplyDrop;
    if (this.wave.phase !== PHASE.COMBAT || this.wave.wave + 1 < c2.minWave) return;
    const drop = this.world.drops[0];
    if (drop) {
      drop.age = (drop.age || 0) + dt2;
      if (drop.age >= c2.lifetime) this.world.removeDrop(drop.id);
      return;
    }
    this._dropTimer -= dt2;
    if (this._dropTimer > 0) return;
    this._dropTimer = c2.minGap + Math.random() * (c2.maxGap - c2.minGap);
    const spot = this._findDropSpot();
    if (!spot) return;
    const id = this._dropIdSeq++;
    this.world.spawnDrop(id, spot.x, spot.z);
    this.ui?.toast("📦 보급품이 떨어졌다! 미니맵을 보고 달려가서 챙겨라 — 안 챙기면 곧 사라진다", "good");
  }
  _findDropSpot() {
    const inner = CFG.world.coreRadius + 5;
    const outer = CFG.world.buildRadius - 1;
    for (let tries = 0; tries < 24; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = inner + Math.random() * (outer - inner);
      const x2 = Math.cos(a) * r, z2 = Math.sin(a) * r;
      if (this.grid.atWorld(x2, z2)) continue;
      if (this.world.nearestNode(x2, z2, 1.6)) continue;
      return { x: x2, z: z2 };
    }
    return null;
  }
  // 위치는 요청에 실려온 값으로 검증한다 (harvest 와 동일한 패턴)
  requestSupplyPickup(dropId) {
    if (this.isHost) this.hostSupplyPickup(this.local.id, dropId, this.local.x, this.local.z);
    else this.net.send("supplyPickup", { id: dropId, x: this.local.x, z: this.local.z });
  }
  hostSupplyPickup(playerId, dropId, px, pz) {
    const drop = this.world.drops.find((d2) => d2.id === dropId);
    if (!drop) return;
    const player = this.players.get(playerId);
    if (!player) return;
    const x2 = typeof px === "number" ? px : player.x;
    const z2 = typeof pz === "number" ? pz : player.z;
    if (dist(x2, z2, drop.x, drop.z) > CFG.supplyDrop.pickupRadius + 1) return;
    const c2 = CFG.supplyDrop;
    const pool = this._poolOf(playerId);
    pool.wood += c2.reward.wood;
    pool.stone += c2.reward.stone;
    let gotShard = false;
    if (Math.random() < c2.shardChance) {
      pool.shard = (pool.shard || 0) + 1;
      gotShard = true;
    }
    this.world.removeDrop(dropId);
    this.fx.burst(drop.x, 1, drop.z, 16759043, 16, 6);
    this.fx.ring(drop.x, drop.z, 16759043, 3);
    this.sfx.shard();
    this._notify(playerId, `📦 보급품 획득! 🪵+${c2.reward.wood} 🪨+${c2.reward.stone}${gotShard ? " 💠+1" : ""}`, "good");
  }
  _hurtEnemy(e, dmg, kind = "tower", fromX, fromZ) {
    const { died, applied } = e.damage(dmg, fromX, fromZ);
    this.fx.float(String(Math.round(applied)), e.x, 1.9, e.z, kind === "player" ? "player" : "");
    if (kind === "player") this.sfx.meleeHit();
    if (died) {
      this.stats.kills++;
      this.fx.burst(e.x, 1, e.z, e.tintColor, 12, 5);
      if (e.st.boss) {
        this.fx.burst(e.x, 1.4, e.z, 16777215, 20, 8);
        this.fx.ring(e.x, e.z, 16734834, 6);
        this.ui?.shake();
        this.sfx.bossDeath();
        if (!this.stats.bossKillsSeen.includes(e.type)) this.stats.bossKillsSeen.push(e.type);
        if (this.stats.bossKillsSeen.includes("boss") && this.stats.bossKillsSeen.includes("frostlord")) {
          this._unlockAchievement("bothBosses");
        }
        if (["boss", "frostlord", "warden"].every((t2) => this.stats.bossKillsSeen.includes(t2))) {
          this._unlockAchievement("allBosses");
        }
      } else {
        this.sfx.enemyDeath();
      }
      if (e.variant === "split") {
        this.enemyMgr.spawnSplit(e);
        this.fx.ring(e.x, e.z, 16755277, 2.4);
      }
      if (e.elite) {
        this.stats.elitesKilled = (this.stats.elitesKilled || 0) + 1;
        this.fx.ring(e.x, e.z, 16763904, 3);
        if (this.stats.elitesKilled >= 5) this._unlockAchievement("eliteHunter");
      }
      const b = e.st.bounty;
      const bw = Math.round(b.wood * this.boonMult.bounty);
      const bs2 = Math.round(b.stone * this.boonMult.bounty);
      if (this.shared) {
        this.pools.team.wood += bw;
        this.pools.team.stone += bs2;
      } else {
        for (const p2 of this.players.values()) {
          const pool = this._poolOf(p2.id);
          pool.wood += bw;
          pool.stone += bs2;
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
      this.ui?.toast("쓰러졌다! 잠시 후 크리스탈에서 부활한다 — 아군이 가까이 오면 훨씬 빨리 부활한다", "bad");
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
    this.sfx.music.stop();
    if (this.difficulty === "hard") this._unlockAchievement("ironWill");
    if (!this.net.online) Game.clearLocalSave();
    this.ui?.showResult(true, this.stats, this.wave.wave);
  }
  _lose() {
    this.wave.lose();
    this.result = "lose";
    this.sfx.lose();
    this.sfx.music.stop();
    if (!this.net.online) Game.clearLocalSave();
    this.ui?.showResult(false, this.stats, this.wave.wave);
  }
  // 웨이브 시작 토스트 문구. 웨이브 번호만으로 계산되는 순수 함수들(waveComposition·
  // specialWaveKind)만 쓰기 때문에 호스트든 참가자든 같은 값을 넣으면 항상 같은 문구가 나온다 —
  // 참가자 화면(net.on("waveStarted"))에서도 별도 동기화 없이 그대로 재사용한다.
  _waveStartLabel(w2, total) {
    const bossEntry = waveComposition(w2).find((c2) => CFG.enemies[c2.type]?.boss);
    let base;
    if (bossEntry) base = `⚠️ 웨이브 ${w2} 시작! 보스 등장! ${CFG.enemies[bossEntry.type].icon} ${CFG.enemies[bossEntry.type].name} — 몬스터 ${total}마리`;
    else {
      const kind = specialWaveKind(w2);
      base = kind ? `${SPECIAL_WAVES[kind].icon} 웨이브 ${w2} 시작! ${SPECIAL_WAVES[kind].name} 웨이브 — ${SPECIAL_WAVES[kind].desc} (몬스터 ${total}마리)` : `웨이브 ${w2} 시작! 몬스터 ${total}마리`;
    }
    if (w2 % CFG.wave.nightEvery === 0) return `🌙 ${base} — 밤이라 시야가 좁다`;
    const weatherKind = weatherOf(w2);
    if (weatherKind) return `${WEATHER[weatherKind].icon} ${base} — ${WEATHER[weatherKind].desc}`;
    return base;
  }
  // 웨이브 단계마다 배경음악 페이즈를 맞춘다. wave.phase 는 호스트·참가자 모두
  // 스냅샷으로 동기화되는 값이라 이 로직만으로 양쪽 화면이 독립적으로 올바르게 전환된다.
  _updateMusicPhase() {
    const ph2 = this.wave.phase;
    if (ph2 === PHASE.PREP) {
      this.sfx.music.start("prep");
      return;
    }
    if (ph2 === PHASE.COMBAT) {
      const isBoss = waveComposition(this.wave.wave + 1).some((c2) => CFG.enemies[c2.type]?.boss);
      this.sfx.music.start(isBoss ? "boss" : "combat");
      return;
    }
    this.sfx.music.stop();
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
    if (node.type === "gem" && pool.shard === amount) {
      this._notify(playerId, "💠 정수 획득! 인벤토리 스킬 탭에서 회복 외에 폭발·시간 왜곡·방벽도 쓸 수 있다", "good");
    }
  }
  requestAttack() {
    if (this.local.heldWeapon === "bomb") {
      this._requestThrow();
      return;
    }
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
  // 폭탄가방을 들었을 때의 공격 — 근접 대신 조준한 지점(포인터가 가리키는 바닥)에 던진다.
  // 사거리를 넘는 곳을 가리키면 사거리 끝까지만 날아간다
  _requestThrow() {
    const cfg = CFG.craft.bomb.throw;
    if (!canAfford(this.myPool, cfg.cost)) {
      this._notify(this.local.id, "자원이 부족합니다", "bad");
      return;
    }
    const pointer = this.sm.updatePointerWorld();
    if (!pointer) return;
    if (!this.local.tryThrow()) return;
    const dx = pointer.x - this.local.x, dz = pointer.z - this.local.z;
    const len = Math.hypot(dx, dz) || 1;
    const clamped = Math.min(len, cfg.range);
    const tx = this.local.x + dx / len * clamped, tz = this.local.z + dz / len * clamped;
    this.sfx.meleeSwing();
    if (this.isHost) {
      this.hostThrowBomb(this.local.id, this.local.x, this.local.z, tx, tz);
    } else {
      this.net.send("throwBomb", { x: this.local.x, z: this.local.z, tx, tz });
      const from = new THREE.Vector3(this.local.x, 1.1, this.local.z);
      const to2 = new THREE.Vector3(tx, 0.4, tz);
      this.projectiles.fire(from, to2, cfg.speed, 3355443, (pos) => this._bombVFX(pos, cfg.radius));
    }
    if (!this._seenBomb) {
      this._seenBomb = true;
      this.ui?.toast("💣 폭탄 투척! 손 대신 조준한 곳에 던진다 — 타워가 못 맞추는 결계 몹이나 멀리서 몰려온 무리를 노려라", "good");
    }
  }
  _bombVFX(pos, radius) {
    this.fx.burst(pos.x, pos.y, pos.z, 3355443, 16, 6);
    this.fx.ring(pos.x, pos.z, 3355443, radius);
    this.sfx.buildingHit();
  }
  hostThrowBomb(playerId, fromX, fromZ, tx, tz) {
    const cfg = CFG.craft.bomb.throw;
    const pool = this._poolOf(playerId);
    if (!canAfford(pool, cfg.cost)) {
      this._notify(playerId, "자원이 부족합니다", "bad");
      return;
    }
    payCost(pool, cfg.cost);
    this._trackSpend(cfg.cost, "craft");
    const dmg = Math.round((cfg.dmg + (CFG.weaponUpgrade.perLv.bomb?.dmg || 0) * this._weaponLvOf("bomb", playerId)) * this._desperationMult);
    const from = new THREE.Vector3(fromX, 1.1, fromZ);
    const to2 = new THREE.Vector3(tx, 0.4, tz);
    this.projectiles.fire(from, to2, cfg.speed, 3355443, (pos) => {
      this._bombVFX(pos, cfg.radius);
      const targets = this.enemyMgr.list.filter((e) => !e.dead && dist(e.x, e.z, pos.x, pos.z) <= cfg.radius);
      for (const e of targets) this._hurtEnemy(e, dmg, "player", pos.x, pos.z);
    });
  }
  // 회피 돌진: 순수 로컬 동작(이동의 연장) — 서버 승인이 필요 없다. 무적 여부는 "pos" 동기화에
  // 실려서 호스트의 몬스터 명중 판정(_nearestPlayer)에도 그대로 반영된다
  _tryDash() {
    if (!this.local.tryDash(this.input, this.sm)) {
      if (this.local.dashCd > 0) this._notify(this.local.id, "회피 돌진 재사용 대기 중", "bad");
      return;
    }
    this.fx.ring(this.local.x, this.local.z, 8965375, 2.2);
    this.fx.burst(this.local.x, 1, this.local.z, 8965375, 10, 4);
    this.sfx.meleeSwing();
    if (!this._seenDash) {
      this._seenDash = true;
      this.ui?.toast("💨 회피 돌진! 잠깐 무적으로 튀어나간다 — 보스 돌진이나 다구리를 피하거나, 결계 몹에게 순식간에 붙을 때 써라", "good");
    }
  }
  // 크리스탈 체력이 위험 문턱 아래면 "필사의 반격" — 플레이어(근접·폭탄)의 대미지가 오른다.
  // 타워에는 적용하지 않는다: 위기에서 직접 뛰어들 이유를 만드는 게 목적이라 자동 화력은 제외.
  get _desperationMult() {
    const c2 = this.world.crystal;
    return c2.hp > 0 && c2.hp / c2.maxHp < CFG.crystal.desperation.threshold ? CFG.crystal.desperation.dmgMult : 1;
  }
  hostAttack(playerId, x2, z2, rot) {
    const a = this.players.get(playerId)?.attackStats ?? CFG.player.attack;
    const dmg = Math.round(a.dmg * this.boonMult.atk * this._desperationMult);
    for (const e of this.enemyMgr.list) {
      if (e.dead) continue;
      const d2 = dist(x2, z2, e.x, e.z);
      if (d2 > a.range + e.st.radius) continue;
      const ang = Math.atan2(e.x - x2, e.z - z2);
      let diff = Math.abs((ang - rot + Math.PI) % (Math.PI * 2) - Math.PI);
      if (diff > a.arc) continue;
      this._hurtEnemy(e, dmg, "player", x2, z2);
    }
  }
  requestStartWave() {
    if (this.isHost) {
      if (this.wave.startWave()) this.net.send("waveStarted", {});
    } else this.net.send("startWave", {});
  }
  requestContinueEndless() {
    if (this.isHost) this.hostContinueEndless(this.local.id);
    else this.net.send("continueEndless", {});
  }
  hostContinueEndless(playerId) {
    if (!this.wave.continueEndless()) return;
    this.result = null;
    this.ui?.hideResult();
    this.ui?.toast(`⚔️ 엔드리스 모드! ${this.wave.wave + 1}웨이브부터 끝없이 이어진다`, "good");
    this._unlockAchievement("endlessRunner");
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
    const node = this.world.nearestNode(pointer.x, pointer.z, PICK);
    if (node) {
      if (dist(this.local.x, this.local.z, node.x, node.z) > CFG.harvest.range) {
        this.ui?.toast("더 가까이 가야 캘 수 있습니다", "warn");
        return;
      }
      if (needsPickaxe(node.type) && !this.local.holdingPickaxe) {
        this.ui?.toast(this.local.tools.pickaxe ? "곡괭이를 손에 쥐어야 캘 수 있습니다 (좌상단 도구 아이콘)" : "곡괭이가 있어야 캘 수 있습니다 (제작대에서 제작)", "bad");
        return;
      }
      if (this.local.beginHarvest(node)) this.sfx.click();
      return;
    }
    this.requestAttack();
  }
  _enemyNear(x2, z2, r) {
    let best = null, bd2 = r * r;
    for (const e of this.enemyMgr.list) {
      if (e.dead) continue;
      const d2 = (e.x - x2) ** 2 + (e.z - z2) ** 2;
      if (d2 < bd2) {
        bd2 = d2;
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
  // 무기 강화 다음 레벨의 철 비용
  _weaponUpgradeCost(key) {
    const lv = this._weaponLvOf(key);
    return { iron: Math.max(1, CFG.weaponUpgrade.baseCost + CFG.weaponUpgrade.costStep * lv + this.boonMult.weaponUpgradeCostDelta) };
  }
  _weaponLvOf(key, playerId = this.local.id) {
    return this.players.get(playerId)?.weaponLv[key] || 0;
  }
  requestUpgradeWeapon(key) {
    if (this.isHost) this.hostUpgradeWeapon(this.local.id, key);
    else this.net.send("upgradeWeapon", { key });
  }
  hostUpgradeWeapon(playerId, key) {
    const bonus = CFG.weaponUpgrade.perLv[key];
    const p2 = this.players.get(playerId);
    if (!bonus || !p2) return;
    if (!p2.tools[key]) {
      this._notify(playerId, "먼저 제작해야 강화할 수 있습니다", "bad");
      return;
    }
    if (!this.hasStation("furnace")) {
      this._notify(playerId, "화로가 있어야 강화할 수 있습니다", "bad");
      return;
    }
    const lv = this._weaponLvOf(key, playerId);
    if (lv >= CFG.weaponUpgrade.maxLv) {
      this._notify(playerId, "이미 최대 레벨입니다", "bad");
      return;
    }
    const cost = this._weaponUpgradeCost(key);
    const pool = this._poolOf(playerId);
    if (!canAfford(pool, cost)) {
      this._notify(playerId, "철이 부족합니다", "bad");
      return;
    }
    payCost(pool, cost);
    this._trackSpend(cost, "craft");
    p2.weaponLv[key] = lv + 1;
    if (lv + 1 >= CFG.weaponUpgrade.maxLv) this._unlockAchievement("weaponMaster", playerId);
    const def = CFG.craft[key];
    this._notify(playerId, `${def.icon} ${def.name} 강화 Lv.${lv + 1}!`, "good");
    if (playerId === this.local.id) {
      this.fx.float(`${def.icon} Lv.${lv + 1}`, this.local.x, 2.2, this.local.z, "good");
      this.sfx.upgrade();
    } else {
      this.net.send("upgradeWeaponOk", { to: playerId, key, lv: lv + 1 });
    }
  }
  requestShard() {
    this.sfx.shard();
    if (this.isHost) this.hostShard(this.local.id);
    else this.net.send("shard", {});
  }
  hostShard(playerId) {
    const s2 = CFG.skills.heal;
    const pool = this._poolOf(playerId);
    if ((pool.shard || 0) < s2.cost) {
      this._notify(playerId, "수정 정수가 없습니다", "bad");
      return;
    }
    if (this.world.crystal.hp >= this.world.crystal.maxHp) {
      this._notify(playerId, "크리스탈이 이미 온전합니다", "bad");
      return;
    }
    pool.shard -= s2.cost;
    this.world.healCrystal(this.world.crystal.maxHp * s2.healPct);
    this.fx.ring(0, 0, 9109440, 8);
    this.fx.float(`+${Math.round(s2.healPct * 100)}%`, 0, 5, 0, "good");
  }
  // 크리스탈 강화 트랙(armor/regen/aura) 다음 레벨의 정수 비용
  _crystalUpgradeCost(kind) {
    const def = CFG.crystalUpgrade[kind];
    const lv = this.world.crystal[kind + "Lv"] || 0;
    return { shard: Math.max(1, def.baseCost + def.costStep * lv + this.boonMult.crystalUpgradeCostDelta) };
  }
  requestCrystalUpgrade(kind) {
    this.sfx.shard();
    if (this.isHost) this.hostCrystalUpgrade(this.local.id, kind);
    else this.net.send("crystalUpgrade", { kind });
  }
  hostCrystalUpgrade(playerId, kind) {
    const def = CFG.crystalUpgrade[kind];
    if (!def) return;
    const c2 = this.world.crystal;
    const lvKey = kind + "Lv";
    if (c2[lvKey] >= CFG.crystalUpgrade.maxLv) {
      this._notify(playerId, "이미 최대 레벨입니다", "bad");
      return;
    }
    const cost = this._crystalUpgradeCost(kind);
    const pool = this._poolOf(playerId);
    if (!canAfford(pool, cost)) {
      this._notify(playerId, "수정 정수가 부족합니다", "bad");
      return;
    }
    payCost(pool, cost);
    c2[lvKey]++;
    if (kind === "armor") {
      c2.maxHp += def.hpPerLv;
      c2.hp += def.hpPerLv;
    }
    this.fx.ring(0, 0, 16763904, 6.5);
    this.fx.float(`${def.icon} ${def.name} Lv.${c2[lvKey]}`, 0, 5, 0, "good");
  }
  // 재생·오라 강화 효과를 매 프레임 적용한다 (호스트만 계산, hp 변화는 스냅샷으로 참가자에게 전파됨)
  _updateCrystalUpgrades(dt2) {
    if (!this.isHost) return;
    const c2 = this.world.crystal;
    const u2 = CFG.crystalUpgrade;
    if (c2.regenLv > 0 && c2.hp < c2.maxHp) {
      this.world.healCrystal(c2.maxHp * u2.regen.pctPerLv * c2.regenLv * dt2);
    }
    if (c2.auraLv > 0) {
      c2._auraTimer -= dt2;
      if (c2._auraTimer <= 0) {
        c2._auraTimer = u2.aura.tickTime;
        const dmg = u2.aura.dmgPerLv * c2.auraLv;
        const targets = this.enemyMgr.list.filter((e) => !e.dead && dist(e.x, e.z, 0, 0) <= u2.aura.radius);
        for (const e of targets) this._hurtEnemy(e, dmg, "player", 0, 0);
        if (targets.length) this.fx.ring(0, 0, 6739199, u2.aura.radius);
      }
    }
  }
  requestSkillBlast() {
    this.sfx.shard();
    if (this.isHost) this.hostSkillBlast(this.local.id);
    else this.net.send("skillBlast", {});
  }
  // 엔드리스 축복 "정수 친화"가 폭발·시간 왜곡·방벽 비용을 낮춘다 (회복은 제외, 최소 1)
  _skillCost(s2) {
    return Math.max(1, s2.cost + this.boonMult.skillCostDelta);
  }
  hostSkillBlast(playerId) {
    const s2 = CFG.skills.blast;
    const cost = this._skillCost(s2);
    const p2 = this.players.get(playerId);
    const pool = this._poolOf(playerId);
    if (!p2) return;
    if ((pool.shard || 0) < cost) {
      this._notify(playerId, "수정 정수가 부족합니다", "bad");
      return;
    }
    pool.shard -= cost;
    this._unlockAchievement("skillUser", playerId);
    const targets = this.enemyMgr.list.filter((e) => !e.dead && dist(e.x, e.z, p2.x, p2.z) <= s2.radius);
    for (const e of targets) this._hurtEnemy(e, s2.dmg, "player", p2.x, p2.z);
    this.fx.ring(p2.x, p2.z, 16751178, s2.radius);
    this.fx.burst(p2.x, 1.4, p2.z, 16751178, 20, 6);
    this.ui?.shake();
    this._notify(playerId, `💥 폭발! 적 ${targets.length}마리 타격`, "good");
  }
  requestSkillChill() {
    this.sfx.shard();
    if (this.isHost) this.hostSkillChill(this.local.id);
    else this.net.send("skillChill", {});
  }
  hostSkillChill(playerId) {
    const s2 = CFG.skills.chill;
    const cost = this._skillCost(s2);
    const p2 = this.players.get(playerId);
    const pool = this._poolOf(playerId);
    if (!p2) return;
    if ((pool.shard || 0) < cost) {
      this._notify(playerId, "수정 정수가 부족합니다", "bad");
      return;
    }
    pool.shard -= cost;
    this._unlockAchievement("skillUser", playerId);
    const now = performance.now() / 1e3;
    const targets = this.enemyMgr.list.filter((e) => !e.dead && dist(e.x, e.z, p2.x, p2.z) <= s2.radius);
    for (const e of targets) e.applySlow(s2.slow, s2.time, now);
    this.fx.ring(p2.x, p2.z, 8382719, s2.radius);
    this.fx.burst(p2.x, 1.4, p2.z, 8382719, 16, 4);
    this._notify(playerId, `🌀 시간 왜곡! 적 ${targets.length}마리 둔화`, "good");
  }
  requestSkillBarrier() {
    this.sfx.shard();
    if (this.isHost) this.hostSkillBarrier(this.local.id);
    else this.net.send("skillBarrier", {});
  }
  hostSkillBarrier(playerId) {
    const s2 = CFG.skills.barrier;
    const cost = this._skillCost(s2);
    const pool = this._poolOf(playerId);
    if ((pool.shard || 0) < cost) {
      this._notify(playerId, "수정 정수가 부족합니다", "bad");
      return;
    }
    pool.shard -= cost;
    this._unlockAchievement("skillUser", playerId);
    this.world.activateShield(s2.time);
    this.fx.ring(0, 0, 16766720, 5);
    this.fx.burst(0, 3.4, 0, 16766720, 20, 6);
    this._notify(playerId, `🛡️ 긴급 방벽! ${s2.time}초간 크리스탈이 무적`, "good");
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
  // 협동 전용 — 만든 도구(칼·활·창·망치·폭탄가방)를 파티원에게 그대로 넘긴다.
  // 자원과 달리 shared 여부와 무관하게 항상 개인 소유라 언제든 넘길 수 있다.
  requestGiveWeapon(toId, key) {
    this.sfx.click();
    if (this.isHost) this.hostGiveWeapon(this.local.id, toId, key);
    else this.net.send("giveWeapon", { to: toId, key });
  }
  hostGiveWeapon(fromId, toId, key) {
    const from = this.players.get(fromId), to2 = this.players.get(toId);
    if (!from || !to2 || !CFG.craft[key]) return;
    if (!from.tools[key]) {
      this._notify(fromId, "그 도구를 갖고 있지 않습니다", "bad");
      return;
    }
    if (to2.tools[key]) {
      this._notify(fromId, `${to2.name}은(는) 이미 갖고 있습니다`, "bad");
      return;
    }
    from.tools[key] = false;
    if (from.equipped === key) from.equipped = null;
    to2.tools[key] = true;
    to2.weaponLv[key] = from.weaponLv[key] || 0;
    from.weaponLv[key] = 0;
    const def = CFG.craft[key];
    const lvNote = to2.weaponLv[key] ? ` (강화 Lv.${to2.weaponLv[key]})` : "";
    this._notify(toId, `${def.icon} ${def.name}을(를) 받았다${lvNote} — 인벤토리 장비 탭에서 손에 쥘 수 있다`, "good");
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
    net.on("supplyPickup", (d2, from) => {
      if (this.isHost) this.hostSupplyPickup(from, d2.id, d2.x, d2.z);
    });
    net.on("attack", (d2, from) => {
      if (this.isHost) this.hostAttack(from, d2.x, d2.z, d2.rot);
    });
    net.on("throwBomb", (d2, from) => {
      if (this.isHost) this.hostThrowBomb(from, d2.x, d2.z, d2.tx, d2.tz);
    });
    net.on("startWave", (d2, from) => {
      if (this.isHost && this.wave?.startWave()) this.net.send("waveStarted", {});
    });
    net.on("continueEndless", (d2, from) => {
      if (this.isHost) this.hostContinueEndless(from);
    });
    net.on("boonPicked", (d2) => {
      if (!this.isHost) this.ui?.toast(d2.text, "good");
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
    net.on("upgradeWeapon", (d2, from) => {
      if (this.isHost) this.hostUpgradeWeapon(from, d2.key);
    });
    net.on("shard", (d2, from) => {
      if (this.isHost) this.hostShard(from);
    });
    net.on("crystalUpgrade", (d2, from) => {
      if (this.isHost) this.hostCrystalUpgrade(from, d2.kind);
    });
    net.on("skillBlast", (d2, from) => {
      if (this.isHost) this.hostSkillBlast(from);
    });
    net.on("skillChill", (d2, from) => {
      if (this.isHost) this.hostSkillChill(from);
    });
    net.on("skillBarrier", (d2, from) => {
      if (this.isHost) this.hostSkillBarrier(from);
    });
    net.on("give", (d2, from) => {
      if (this.isHost) this.hostGive(from, d2.to, d2.wood, d2.stone);
    });
    net.on("giveWeapon", (d2, from) => {
      if (this.isHost) this.hostGiveWeapon(from, d2.to, d2.key);
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
    net.on("upgradeWeaponOk", (d2) => {
      if (d2.to === net.selfId) {
        this.local.weaponLv[d2.key] = d2.lv;
        this.sfx.upgrade();
      }
    });
    net.on("waveStarted", () => {
      if (!this.isHost) {
        const w2 = this.wave.wave + 1;
        const total = waveComposition(w2).reduce((s2, c2) => s2 + c2.count, 0);
        this.ui?.toast(this._waveStartLabel(w2, total), "warn");
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
      players[p2.id] = { hv: p2.harvestLv, tl: Object.keys(p2.tools).filter((k2) => p2.tools[k2]), eq: p2.equipped || null, wl: p2.weaponLv };
    }
    return {
      e: this.enemyMgr.snapshot(),
      b: this.buildMgr.snapshot(),
      n: this.world.nodeSnapshot(),
      d: this.world.dropSnapshot(),
      w: this.wave.snapshot(),
      c: Math.round(this.world.crystal.hp),
      cm: Math.round(this.world.crystal.maxHp),
      ca: this.world.crystal.armorLv,
      cr: this.world.crystal.regenLv,
      cx: this.world.crystal.auraLv,
      mt: this._meteorPending ? [Math.round(this._meteorPending.x * 10) / 10, Math.round(this._meteorPending.z * 10) / 10, Math.round(this._meteorPending.timeLeft * 10) / 10] : null,
      r: this.shared ? { team: this.pools.team } : { byId: this.pools.byId },
      p: players,
      sh: this.shared,
      // 결과 화면(처치·채집·소모·건설 수)과 팀 단위 업적 판정에 쓰는 통계.
      // 참가자의 this.stats 는 자기 자신이 직접 처리한 것만 쌓이므로(대부분의 집계가 호스트
      // 전용 코드 경로에서만 늘어난다) 이게 없으면 참가자는 결과 화면에서 전부 0을 본다.
      // time·newAchievements 는 클라이언트 각자의 것이라 여기 안 실어서 참가자 쪽 값을 덮지 않는다.
      st: {
        harvested: this.stats.harvested,
        built: this.stats.built,
        kills: this.stats.kills,
        spentWood: this.stats.spentWood,
        spentStone: this.stats.spentStone,
        spentIron: this.stats.spentIron,
        spentBy: this.stats.spentBy,
        waveLog: this.stats.waveLog,
        bossKillsSeen: this.stats.bossKillsSeen,
        trapsTriggered: this.stats.trapsTriggered,
        elitesKilled: this.stats.elitesKilled
      }
    };
  }
  _applySnapshot(s2) {
    this.shared = s2.sh;
    const prevWave = this.wave.wave;
    const wasBossCombat = this.wave.phase === PHASE.COMBAT && (this.wave.wave + 1) % 5 === 0;
    this.enemyMgr.applySnapshot(s2.e, s2.w.wave + 1);
    this.buildMgr.applySnapshot(s2.b);
    this.world.applyNodeSnapshot(s2.n);
    if (s2.d) this.world.applyDropSnapshot(s2.d);
    this.wave.applySnapshot(s2.w);
    if (this.wave.wave === prevWave + 1 && this.wave.phase !== PHASE.LOST) {
      const reward = waveReward(this.wave.wave);
      const wonNow = this.wave.phase === PHASE.WON;
      this.ui?.toast(wonNow ? "마지막 웨이브 격퇴!" : `웨이브 ${this.wave.wave} 클리어! 보상 🪵${reward.wood} 🪨${reward.stone}${reward.shard ? " 💠1" : ""}`, "good");
      if (!wonNow) this.sfx.waveClear();
      const clearedWave = this.wave.wave;
      const buildings = [...this.buildMgr.buildings.values()];
      if (clearedWave % 5 === 0 && !this._pBossWaveDamaged) this._unlockAchievement("flawlessBoss");
      this._pBossWaveDamaged = false;
      if (clearedWave >= 5 && !buildings.some((b) => b.key === "wall")) this._unlockAchievement("noWall");
      if (clearedWave >= 3 && !buildings.some((b) => ["arrow", "frost", "cannon", "poison", "support"].includes(b.key))) {
        this._unlockAchievement("noTower");
      }
    }
    const prevHp = this.world.crystal.hp;
    if (s2.cm) this.world.crystal.maxHp = s2.cm;
    if (s2.ca !== void 0) this.world.crystal.armorLv = s2.ca;
    if (s2.cr !== void 0) this.world.crystal.regenLv = s2.cr;
    if (s2.cx !== void 0) this.world.crystal.auraLv = s2.cx;
    this.world.crystal.hp = s2.c;
    if (s2.c < prevHp) {
      this.ui?.shake();
      this.fx.burst(0, 3.2, 0, 6545663, 8, 4);
      this.sfx.crystalHit();
      if (wasBossCombat) this._pBossWaveDamaged = true;
    }
    if (s2.mt) this.world.setMeteor(s2.mt[0], s2.mt[1], s2.mt[2], CFG.meteor.radius);
    else this.world.clearMeteor();
    if (s2.r.team) this.pools.team = s2.r.team;
    if (s2.r.byId) this.pools.byId = s2.r.byId;
    for (const [id, pd2] of Object.entries(s2.p || {})) {
      const p2 = this.players.get(id);
      if (p2) {
        p2.harvestLv = pd2.hv;
        p2.tools = {};
        for (const k2 of pd2.tl || []) p2.tools[k2] = true;
        p2.weaponLv = pd2.wl || {};
        if (p2 !== this.local) p2.equipped = pd2.eq || null;
      }
    }
    if (s2.st) {
      Object.assign(this.stats, s2.st);
      if (this.stats.trapsTriggered >= 3) this._unlockAchievement("trapMaster");
      if (this.stats.elitesKilled >= 5) this._unlockAchievement("eliteHunter");
      if (this.stats.bossKillsSeen.includes("boss") && this.stats.bossKillsSeen.includes("frostlord")) {
        this._unlockAchievement("bothBosses");
      }
      if (["boss", "frostlord", "warden"].every((t2) => this.stats.bossKillsSeen.includes(t2))) {
        this._unlockAchievement("allBosses");
      }
    }
    if (this.wave.phase === PHASE.LOST && !this.result) {
      this.result = "lose";
      this.ui?.showResult(false, this.stats, this.wave.wave);
    }
    if (this.wave.phase === PHASE.WON && !this.result) {
      this.result = "win";
      if (this.difficulty === "hard") this._unlockAchievement("ironWill");
      this.ui?.showResult(true, this.stats, this.wave.wave);
    }
    if ((this.wave.phase === PHASE.PREP || this.wave.phase === PHASE.COMBAT) && this.result === "win") {
      this.result = null;
      this.ui?.hideResult();
      this._unlockAchievement("endlessRunner");
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
    if (!over) this.local.update(dt2, this.input, this.sm, this.grid, this.world, [...this.players.values()]);
    for (const p2 of this.players.values()) {
      if (p2 !== this.local && p2.update) p2.update(dt2);
    }
    if (this.isHost && !over) {
      if (!this.pendingBoon) this.wave.update(dt2);
      this.enemyMgr.simulate(dt2, now, [...this.players.values()], this.buildMgr);
      this._updateTraps();
      this._updateSupplyDrops(dt2);
      this._updateMeteor(dt2);
      this._updateCrystalUpgrades(dt2);
    } else {
      this.enemyMgr.interpolate(dt2);
    }
    if (!over) {
      for (const d2 of this.world.drops) {
        if (d2.requested) continue;
        if (dist(this.local.x, this.local.z, d2.x, d2.z) <= CFG.supplyDrop.pickupRadius) {
          d2.requested = true;
          this.requestSupplyPickup(d2.id);
        }
      }
    }
    const weatherKind = this.wave.phase === PHASE.COMBAT ? weatherOf(this.wave.wave + 1) : null;
    this.world.weatherKind = weatherKind;
    this.sm.setWeather(weatherKind);
    this.sm.updateWeather(dt2);
    const rangeMult = weatherKind === "fog" ? WEATHER.fog.towerRangeMult : 1;
    if (!over) this.buildMgr.updateTowers(dt2, this.enemyMgr.list, now, rangeMult);
    this.sm.setNightMode(this.wave.phase === PHASE.COMBAT && (this.wave.wave + 1) % CFG.wave.nightEvery === 0);
    this.sm.updateNight(dt2);
    this._updateMusicPhase();
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
    if (inp.hit(km.get("skillBlast"))) this.requestSkillBlast();
    if (inp.hit(km.get("skillChill"))) this.requestSkillChill();
    if (inp.hit(km.get("skillBarrier"))) this.requestSkillBarrier();
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
    if (inp.hit(km.get("dash"))) this._tryDash();
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
        heldLv: l2.heldWeaponLv,
        swing: l2.swing > 0.7,
        invulnerable: l2.invulnerable,
        reviveAssisted: l2.reviveAssisted
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
    if (s2.cm) this.world.crystal.maxHp = s2.cm;
    if (s2.ca !== void 0) this.world.crystal.armorLv = s2.ca;
    if (s2.cr !== void 0) this.world.crystal.regenLv = s2.cr;
    if (s2.cx !== void 0) this.world.crystal.auraLv = s2.cx;
    this.world.crystal.hp = s2.c;
    if (s2.r.team) this.pools.team = s2.r.team;
    if (s2.r.byId) this.pools.byId = s2.r.byId;
    const savedPlayer = Object.values(s2.p || {})[0];
    if (savedPlayer) {
      this.local.harvestLv = savedPlayer.hv;
      this.local.tools = {};
      for (const k2 of savedPlayer.tl || []) this.local.tools[k2] = true;
      this.local.weaponLv = savedPlayer.wl || {};
      this.local.equipped = savedPlayer.eq || null;
    }
    if (save.stats) this.stats = save.stats;
    if (!this.stats.newAchievements) this.stats.newAchievements = [];
    if (!this.stats.bossKillsSeen) this.stats.bossKillsSeen = [];
    if (!this.stats.trapsTriggered) this.stats.trapsTriggered = 0;
    if (!this.stats.elitesKilled) this.stats.elitesKilled = 0;
    this.ui?.toast(`이어하기 — 웨이브 ${this.wave.displayWave}`, "good");
  }
  render() {
    this.sm.render();
  }
};
