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
import { UI } from './ui.js';
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
  begin({ seed = 20260818, shared = true, difficulty = "normal", resumed = false, daily = false } = {}) {
    this.dispose();
    this.seed = seed;
    this.daily = daily;
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
    this.pools.team = { wood: this.difficultyPreset.startWood, stone: this.difficultyPreset.startStone, iron: 0, copper: 0, coal: 0, shard: 0, arrow: 0, meat: { rabbit: 0, deer: 0, boar: 0 } };
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
        craft: { wood: 0, stone: 0, iron: 0 },
        merchant: { wood: 0, stone: 0, iron: 0 }
      },
      time: 0,
      waveLog: [],
      newAchievements: [],
      bossKillsSeen: [],
      trapsTriggered: 0,
      elitesKilled: 0,
      treasuresCaught: 0,
      animalsHunted: 0,
      comboCount: 0,
      repairPostHealed: 0,
      mimicsKilled: 0,
      blocksCount: 0
    };
    this._waveMark = { time: 0, kills: 0 };
    this._bossActive = false;
    this._bossWaveDamaged = false;
    this.sm.resetNight();
    this.sm.resetWeather();
    this.world.weatherKind = null;
    this._seenVariants = /* @__PURE__ */ new Set();
    this._seenSynergy = false;
    this._seenRootSynergy = false;
    this._seenTrap = false;
    this._seenDash = false;
    this._seenBomb = false;
    this._seenBow = false;
    this._seenHealer = false;
    this._seenBlock = false;
    this.boonMult = { atk: 1, towerDmg: 1, skillCostDelta: 0, bounty: 1, crystalUpgradeCostDelta: 0, weaponUpgradeCostDelta: 0, weaponSpecCostDelta: 0, prepDelta: 0, venomChance: 0, desperationBonus: 0 };
    this.pendingBoon = null;
    this._queuedEndlessBoon = false;
    this._dropTimer = CFG.supplyDrop.firstDelay;
    this._dropIdSeq = 1;
    this._meteorTimer = CFG.meteor.firstDelay;
    this._rift = null;
    this._huntTimer = 0;
    this.feast = { kind: null, wavesLeft: 0 };
    this._spirit = null;
    this._meteorPending = null;
    this.world.clearMeteor();
    this.world.clearSpirit();
    this._treasureTimer = CFG.treasureEvent.firstDelay;
    this._treasureId = null;
    this._treasureLifeLeft = 0;
    this._merchant = null;
    this.tempBoon = { atk: 1, towerDmg: 1, atkWavesLeft: 0, towerWavesLeft: 0 };
    this._pingCd = 0;
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
    if (!this.pools.byId[id]) this.pools.byId[id] = { wood: this.difficultyPreset.startWood, stone: this.difficultyPreset.startStone, iron: 0, copper: 0, coal: 0, shard: 0, arrow: 0, meat: { rabbit: 0, deer: 0, boar: 0 } };
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
    this.buildMgr.takeAmmo = (kind) => this._takeAmmo(kind);
    this.buildMgr.onImpact = (b, st, pos) => {
      if (!this.isHost) return;
      const targets = st.splash ? this.enemyMgr.list.filter((e) => !e.dead && dist(e.x, e.z, pos.x, pos.z) <= st.splash) : this.enemyMgr.list.filter((e) => !e.dead && dist(e.x, e.z, pos.x, pos.z) <= 1.2);
      if (!targets.length) return;
      const now = performance.now() / 1e3;
      if (st.chain) {
        let candidates = this.enemyMgr.list.filter((e) => !e.dead);
        let last2 = pos;
        const hitChain = [];
        for (let i = 0; i < st.chain.count && candidates.length; i++) {
          const searchR = i === 0 ? 1.2 : st.chain.range;
          let best = null, bestD = Infinity;
          for (const e of candidates) {
            const d2 = dist(e.x, e.z, last2.x, last2.z);
            if (d2 <= searchR && d2 < bestD) {
              bestD = d2;
              best = e;
            }
          }
          if (!best) break;
          hitChain.push(best);
          candidates = candidates.filter((e) => e !== best);
          last2 = best;
        }
        if (!hitChain.length) return;
        hitChain.forEach((e, i) => {
          const wasRooted = now < e.rootUntil;
          let base = st.dmg * Math.pow(st.chain.falloff, i);
          if (wasRooted) {
            base *= 1 + CFG.synergy.rootSnare.dmgMult;
            if (!this._seenRootSynergy) {
              this._seenRootSynergy = true;
              this.ui?.toast("🕸️⚔️ 시너지 발동! 덫탑에 묶인 적을 다른 타워가 맞추면 추가 피해", "good");
            }
          }
          const from = i === 0 ? pos : hitChain[i - 1];
          this._hurtEnemy(e, Math.round(base * this.boonMult.towerDmg * this.tempBoon.towerDmg), "tower", from.x, from.z);
          if (i > 0) this.fx.burst(e.x, 1, e.z, 16769126, 8, 3);
        });
        if (hitChain.length > 1 && !this._seenChain) {
          this._seenChain = true;
          this.ui?.toast("🌩️ 번개탑! 명중한 적에서 가까운 다른 적으로 튀어 옮겨붙는다 — 뭉친 무리에 특히 강하다", "good");
        }
        this.sfx.towerHit(b.key);
        return;
      }
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
        this._hurtEnemy(e, Math.round(base * this.boonMult.towerDmg * this.tempBoon.towerDmg), b.key === "frost" ? "frost" : "tower", b.x, b.z);
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
      } else if (kind === "drain") {
        this.ui?.toast(`${nm}가 자원을 훔칠 준비를 한다 — 지금 화력을 몰아 끊어라!`, "warn");
        this.sfx.bossWaveStart();
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
    this.enemyMgr.onBurrowEmerge = (e) => {
      this.ui?.toast("🕳️ 굴착병이 지상으로 떠올랐다! 지금부터는 타워도 맞힐 수 있다", "warn");
    };
    this.buildMgr.onDetectBurrow = (e) => {
      if (this._seenDetect) return;
      this._seenDetect = true;
      this.ui?.toast("🗼 감시탑이 파묻힌 굴착병을 찾아냈다! 반경 안 타워가 조준할 수 있다", "good");
    };
    this.enemyMgr.onBossSummon = (e, n) => {
      const msg = e.st.summonVariant === "shield" ? `🛡️ 방패 두른 잡졸 ${n}마리가 튀어나왔다 — 등 뒤를 노려라` : `잡졸 ${n}마리가 튀어나왔다`;
      this.ui?.toast(msg, "bad");
      this.fx.burst(e.x, 1.6, e.z, 16733525, 18, 6);
    };
    this.enemyMgr.onBossDrain = (e) => {
      if (!this.isHost) return;
      const c2 = CFG.bossPattern;
      let wood = 0, stone = 0;
      if (this.shared) {
        wood = Math.min(this.pools.team.wood, c2.drainWood);
        stone = Math.min(this.pools.team.stone, c2.drainStone);
        this.pools.team.wood -= wood;
        this.pools.team.stone -= stone;
      } else {
        for (const p2 of this.players.values()) {
          const pool = this._poolOf(p2.id);
          const w2 = Math.min(pool.wood, c2.drainWood);
          const s2 = Math.min(pool.stone, c2.drainStone);
          pool.wood -= w2;
          pool.stone -= s2;
          wood += w2;
          stone += s2;
        }
      }
      const heal = Math.round(e.maxHp * c2.drainHealPct);
      e.hp = Math.min(e.maxHp, e.hp + heal);
      this.fx.float(`-${wood}🪵 -${stone}🪨`, e.x, e.st.scale * 1.6 + 0.6, e.z, "bad");
      this.fx.burst(e.x, 1.6, e.z, 16766720, 18, 6);
      this.ui?.toast(`🦂 갈취자가 목재 ${wood}·광물 ${stone}을 훔쳐 체력을 회복했다!`, "bad");
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
    this.enemyMgr.onRallyPulse = (e) => {
      this.fx.ring(e.x, e.z, 16751001, CFG.enemies.commander.rallyAura.radius);
      this.fx.burst(e.x, 1.4, e.z, 16751001, 10, 4);
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
      if (e.type === "bomber" && !this._seenBomber) {
        this._seenBomber = true;
        this.ui?.toast("🧨 폭탄병 등장! 죽는 순간 주변에 폭발 피해를 남긴다 — 코앞에서 마무리하면 같이 맞는다, 거리를 두고 처리하자", "warn");
      }
      if (e.type === "raccoon" && !this._seenRaccoon) {
        this._seenRaccoon = true;
        this.ui?.toast("🦝 도둑너구리 등장! 채집 노드로 달려가 자원을 훔친다 — 죽이면 훔친 만큼 그대로 돌려받는다", "warn");
      }
      if (e.type === "burrower" && !this._seenBurrower) {
        this._seenBurrower = true;
        this.ui?.toast("🕳️ 굴착병 등장! 땅속에서 벽도 타워도 무시하고 직진한다 — 흙먼지 자국을 쫓아가 직접 끊거나, 떠오르는 순간을 타워로 노려라", "warn");
      }
      if (e.type === "commander" && !this._seenCommander) {
        this._seenCommander = true;
        this.ui?.toast("🥁 지휘관 등장! 주기적으로 진군의 함성을 울려 주변 무리를 잠깐 크게 빠르게 만든다 — 먼저 잡아야 뒤따르는 무리가 느려진다", "warn");
      }
      if (e.type === "treasure") {
        this.ui?.toast(this._seenTreasure ? "🦀 보물게 등장! 서둘러라 — 놓치면 사라진다" : "🦀 보물게 등장! 공격은 안 하고 도망만 다닌다 — 놔두면 곧 사라지니 지금 잡아야 한다", "good");
        this._seenTreasure = true;
      }
      if (!e.variant || this._seenVariants.has(e.variant)) return;
      this._seenVariants.add(e.variant);
      const v = CFG.variants[e.variant];
      const HINTS = {
        shield: "정면 공격은 약해진다 — 등 뒤로 돌아가서 쳐라",
        split: "죽으면 약한 개체 2마리로 갈라진다",
        dash: "가끔 폭발적으로 빨라진다",
        regen: "잠시라도 안 때리면 체력이 도로 차오른다 — 끝까지 몰아쳐라",
        ward: "타워가 조준하지 못한다 — 직접 달려가서 근접이나 스킬로 처치해야 한다",
        thorn: "근접으로 때리면 준 피해의 일부를 그대로 돌려받는다 — 무기 강화가 잘 됐을수록 반사도 세진다",
        vampire: "크리스탈·건물·플레이어를 때릴 때마다 그 피해의 일부를 체력으로 되돌린다 — 놔두면 계속 회복하니 최우선으로 끊어야 한다"
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
      this._variantLeech(e, e.st.dmg);
      const rlv = this.world.crystal.reflectLv;
      if (this.isHost && rlv > 0) {
        const reflectDmg = Math.round(e.st.dmg * CFG.crystalUpgrade.reflect.pctPerLv * rlv);
        if (reflectDmg > 0) {
          this._hurtEnemy(e, reflectDmg, "crystal", 0, 0);
          if (!this._seenReflect) {
            this._seenReflect = true;
            this.ui?.toast("🪞 반사! 크리스탈을 직접 때린 적에게 받은 피해를 그대로 돌려준다", "good");
          }
        }
      }
      if (dead) this._lose();
    };
    this.enemyMgr.onBuildingHit = (e, b, mult = 1) => {
      const dmg = Math.round(e.st.dmg * mult);
      const destroyed = b.damage(dmg);
      this.fx.burst(b.x, 1.4, b.z, 12303291, 5, 3);
      this.sfx.buildingHit();
      this._variantLeech(e, dmg);
      if (destroyed) {
        this.fx.burst(b.x, 1.2, b.z, 8947848, 16, 6);
        this.buildMgr.remove(b.id);
      }
    };
    this.enemyMgr.onNodeSteal = (e, node) => {
      const y = CFG.harvest[node.type].yield;
      this.world.consumeNode(node);
      e._loot = e._loot || {};
      e._loot[node.type] = (e._loot[node.type] || 0) + y;
      const color = node.type === "tree" ? 5979428 : node.type === "gem" ? 14063103 : 9146266;
      this.fx.burst(node.x, 1, node.z, color, 10, 4);
      this.sfx.harvestDone(node.type);
    };
    this.enemyMgr.onPlayerHit = (e, p2) => {
      const dmg = p2.blocking ? Math.round(e.st.dmg * (1 - p2.blockStats.mitigation)) : e.st.dmg;
      if (p2.id === this.local.id) this._hurtLocal(dmg);
      else this.net.send("hurt", { to: p2.id, dmg });
      this._variantLeech(e, dmg);
      if (p2.blocking) {
        if (p2.id === this.local.id && !this._seenBlock) {
          this._seenBlock = true;
          this.ui?.toast("🛡️ 막기로 피해를 크게 줄였다 — 대신 거의 못 움직이고 공격도 못 한다", "good");
        }
        this.stats.blocksCount = (this.stats.blocksCount || 0) + 1;
        if (this.stats.blocksCount >= 10) this._unlockAchievement("blockMaster");
      }
    };
    this.wave.onWaveStart = (w2, total) => {
      this._clearWildlife();
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
      const wasBoss = this._bossActive;
      this._checkWaveAchievements(w2);
      if (this.isHost) this._decayTempBoon();
      if (won) this._win();
      else {
        const dueEndless = this.wave.endless && w2 % CFG.endlessBoon.every === 0;
        if (this.isHost && wasBoss) {
          this._offerBoon("boss");
          if (dueEndless) this._queuedEndlessBoon = true;
        } else if (this.isHost && dueEndless) this._offerBoon("endless");
        if (this.isHost) this._maybeSpawnMerchant(w2);
      }
    };
  }
  // 웨이브 클리어마다 확인하는 업적들 — 호스트에서만 정확히 판정한다
  _checkWaveAchievements(w2) {
    if (!this.isHost) return;
    if (this._bossActive && !this._bossWaveDamaged) this._unlockAchievement("flawlessBoss");
    this._bossActive = false;
    const buildings = [...this.buildMgr.buildings.values()];
    if (w2 >= 5 && !buildings.some((b) => b.key === "wall" || b.key === "gate")) this._unlockAchievement("noWall");
    if (w2 >= 3 && !buildings.some((b) => b.isTower || b.isSupport)) {
      this._unlockAchievement("noTower");
    }
  }
  // 엔드리스 축복(trigger 없음/"endless"): n웨이브마다 무작위 2개 중 하나를 고른다.
  // 보스 유물(trigger:"boss"): 보스를 처치했을 때(표준 캠페인 포함) 무작위 2개 중 하나를 고른다.
  // 둘 다 같은 카드 UI·pendingBoon 배관을 그대로 쓰고 trigger 로만 풀을 가른다.
  _offerBoon(trigger = "endless") {
    const keys = Object.keys(CFG.boons).filter((k2) => (CFG.boons[k2].trigger || "endless") === trigger);
    const a = keys[Math.floor(Math.random() * keys.length)];
    let b = keys[Math.floor(Math.random() * keys.length)];
    while (b === a && keys.length > 1) b = keys[Math.floor(Math.random() * keys.length)];
    this.pendingBoon = [a, b];
    this.pendingBoonTrigger = trigger;
    this.ui?.showBoonChoice(this.pendingBoon, trigger);
  }
  pickBoon(key) {
    if (!this.pendingBoon || !this.pendingBoon.includes(key)) return;
    const b = CFG.boons[key];
    if (b.kind === "mult") this.boonMult[b.key] *= b.value;
    else if (b.kind === "delta") this.boonMult[b.key] += b.value;
    else if (b.kind === "instant" && key === "aid") this.world.healCrystal(300);
    else if (b.kind === "instantPct") this.world.healCrystal(Math.round(this.world.crystal.maxHp * b.value));
    else if (b.kind === "maxHp") {
      this.world.crystal.maxHp += b.value;
      this.world.crystal.hp += b.value;
    } else if (b.kind === "trickle") this._shardTrickleStacks = (this._shardTrickleStacks || 0) + b.value;
    else if (b.kind === "prepDelta") {
      this.boonMult.prepDelta += b.value;
      this.wave.prepBonus = this.boonMult.prepDelta;
    } else if (b.kind === "venom") this.boonMult.venomChance = Math.min(0.6, this.boonMult.venomChance + b.value);
    else if (b.kind === "desperationBonus") this.boonMult.desperationBonus += b.value;
    if (b.trigger === "boss") {
      this.stats.relicsPicked = (this.stats.relicsPicked || 0) + 1;
      if (this.stats.relicsPicked >= 3) this._unlockAchievement("relicCollector");
    }
    this.pendingBoon = null;
    this.pendingBoonTrigger = null;
    this.ui?.hideBoonChoice();
    const label = b.trigger === "boss" ? "유물 선택" : "축복 선택";
    const msg = `${b.icon} ${label}: ${b.name} — ${b.desc}`;
    this.ui?.toast(msg, "good");
    this.sfx.upgrade();
    this.net.send("boonPicked", { text: msg });
    if (this._queuedEndlessBoon) {
      this._queuedEndlessBoon = false;
      this._offerBoon("endless");
    }
  }
  // 힘의 물약·포격 물약은 "다음 웨이브 한 판만" 지속된다 — 웨이브가 끝날 때마다(클리어 직후) 하나씩
  // 깎아서, 사 두고 안 쓴 채 몇 판을 넘겨도 계속 남아있는 일이 없게 한다. 0이 되면 배율도 원상복구.
  _decayTempBoon() {
    const t2 = this.tempBoon;
    if (t2.atkWavesLeft > 0 && --t2.atkWavesLeft <= 0) t2.atk = 1;
    if (t2.towerWavesLeft > 0 && --t2.towerWavesLeft <= 0) t2.towerDmg = 1;
    this._decayFeast();
  }
  // 떠돌이 상인: 웨이브 클리어 직후(호스트에서만) 확률적으로 등장해, 이번 준비 시간에만
  // 무작위 품목 2개를 판다. 다음 웨이브가 시작되면(_updateMerchant) 자동으로 사라진다.
  _maybeSpawnMerchant(clearedWave) {
    const c2 = CFG.merchant;
    if (clearedWave < c2.minWave || Math.random() >= c2.chance) {
      this._merchant = null;
      return;
    }
    const keys = Object.keys(c2.pool);
    const offers = [];
    for (let i = 0; i < c2.offerCount && keys.length; i++) {
      offers.push(keys.splice(Math.floor(Math.random() * keys.length), 1)[0]);
    }
    this._merchant = { offers, boughtBy: {} };
    this.ui?.toast("🧳 떠돌이 상인이 왔다! 이번 준비 시간에만 물건을 판다", "good");
  }
  requestBuyMerchant(key) {
    if (this.isHost) this.hostBuyMerchant(this.local.id, key);
    else this.net.send("buyMerchant", { key });
  }
  hostBuyMerchant(playerId, key) {
    const m = this._merchant;
    if (!m || !m.offers.includes(key)) return;
    const bought = m.boughtBy[playerId] || (m.boughtBy[playerId] = []);
    if (bought.includes(key)) return;
    const o = CFG.merchant.pool[key];
    const pool = this._poolOf(playerId);
    if (!canAfford(pool, o.cost)) {
      this._notify(playerId, "자원이 부족합니다", "bad");
      return;
    }
    payCost(pool, o.cost);
    this._trackSpend(o.cost, "merchant");
    bought.push(key);
    this._applyMerchantEffect(playerId, o);
    this._notify(playerId, `${o.icon} ${o.name} 구매! ${o.desc}`, "good");
    if (playerId === this.local.id) this.sfx.upgrade();
  }
  _applyMerchantEffect(playerId, o) {
    if (o.kind === "heal") {
      this.world.healCrystal(o.value);
    } else if (o.kind === "tempAtk") {
      this.tempBoon.atk = o.value;
      this.tempBoon.atkWavesLeft = 1;
    } else if (o.kind === "tempTower") {
      this.tempBoon.towerDmg = o.value;
      this.tempBoon.towerWavesLeft = 1;
    } else if (o.kind === "shard" || o.kind === "iron") {
      const pool = this._poolOf(playerId);
      pool[o.kind] = (pool[o.kind] || 0) + o.value;
    }
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
        if (e.dead || e.st.flies || e.st.wild) continue;
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
  // 보물게 — 전투 중(3웨이브부터) 가끔 튀어나와 도망만 다니는 몬스터. 웨이브 구성에 안 끼는
  // 독립 이벤트라 운석·보급품과 같은 패턴(호스트 전용 타이머)으로 처리한다. 최대 1마리만 떠 있고,
  // lifetime 안에 못 잡으면 보상 없이 그냥 사라진다 — 보물게 자체는 일반 몬스터처럼 스냅샷으로
  // 자동 동기화되므로(enemyMgr.snapshot 이 타입을 가리지 않는다) 별도 네트워크 코드가 필요 없다.
  // 사냥감 스폰 — 준비 시간에만. 웨이브가 시작되면 전부 흩어져 사라진다(_clearWildlife).
  // 크리스탈에서 멀리(minDist~maxDist) 내보내서, 사냥하려면 방어선을 실제로 비우고 나가야 하게 만든다.
  _updateHunt(dt2) {
    if (!this.isHost) return;
    if (this.wave.phase !== PHASE.PREP) return;
    const c2 = CFG.hunt;
    const alive = this.enemyMgr.list.filter((e) => !e.dead && e.st.wild).length;
    if (alive >= c2.maxAlive) return;
    this._huntTimer -= dt2;
    if (this._huntTimer > 0) return;
    this._huntTimer = c2.spawnGap;
    const total = Object.values(c2.weights).reduce((a2, b2) => a2 + b2, 0);
    let roll = Math.random() * total, type = "rabbit";
    for (const [k2, w2] of Object.entries(c2.weights)) {
      roll -= w2;
      if (roll <= 0) {
        type = k2;
        break;
      }
    }
    const ang = Math.random() * Math.PI * 2;
    const r = c2.minDist + Math.random() * (c2.maxDist - c2.minDist);
    const e = this.enemyMgr.spawn(type, 1, Math.cos(ang) * r, Math.sin(ang) * r);
    if (e && !this._seenHunt) {
      this._seenHunt = true;
      this.ui?.toast("🦌 야생 동물이 보인다! 준비 시간에만 나타난다 — 잡으면 생고기를 얻고, 화로에서 구워 먹으면 다음 웨이브 동안 강해진다", "good");
    }
  }
  // 웨이브가 시작되면 사냥감은 전부 도망친다 — 전투 중에 섞여 있으면 표적이 헷갈리고,
  // "준비 시간에만 사냥할 수 있다" 는 규칙도 흐려진다.
  _clearWildlife() {
    if (!this.isHost) return;
    for (const e of this.enemyMgr.list) {
      if (!e.dead && e.st.wild) {
        this.fx.burst(e.x, 1, e.z, e.tintColor, 6, 3);
        this.enemyMgr.kill(e);
      }
    }
  }
  requestCook(key) {
    if (this.isHost) this.hostCook(this.local.id, key);
    else this.net.send("cook", { key });
  }
  hostCook(playerId, key) {
    const r = CFG.cook[key];
    if (!r || !this.players.get(playerId)) return;
    if (!this.hasStation("furnace")) {
      this._notify(playerId, "화로가 있어야 구울 수 있습니다", "bad");
      return;
    }
    const pool = this._poolOf(playerId);
    const meat = pool.meat || (pool.meat = { rabbit: 0, deer: 0, boar: 0 });
    if ((meat[key] || 0) < 1) {
      this._notify(playerId, `${CFG.enemies[key].icon} ${CFG.enemies[key].name} 생고기가 없습니다`, "bad");
      return;
    }
    if ((pool.wood || 0) < r.wood) {
      this._notify(playerId, "목재가 부족합니다", "bad");
      return;
    }
    meat[key] -= 1;
    pool.wood -= r.wood;
    this._trackSpend({ wood: r.wood }, "craft");
    this.feast = { kind: r.kind, wavesLeft: 1 };
    if (r.kind === "vigor") this._applyVigor(playerId, r.value);
    this._notify(playerId, `${r.icon} ${r.name}을(를) 먹었다! ${r.desc}`, "good");
    if (playerId === this.local.id) this.sfx.upgrade();
  }
  // 사슴 스테이크: 최대 체력을 올리고 그만큼 즉시 회복시킨다(크리스탈 강화의 armor 와 같은 방식)
  _applyVigor(playerId, amount) {
    const p2 = this.players.get(playerId);
    if (!p2) return;
    p2.maxHp = CFG.player.hp + amount;
    p2.hp = Math.min(p2.maxHp, p2.hp + amount);
  }
  // 한 판이 끝나면 잔치 효과도 같이 끝난다(상인 물약과 같은 수명)
  _decayFeast() {
    if (this.feast.wavesLeft > 0 && --this.feast.wavesLeft <= 0) {
      const was = this.feast.kind;
      this.feast.kind = null;
      if (was === "vigor") {
        const p2 = this.local;
        p2.maxHp = CFG.player.hp;
        p2.hp = Math.min(p2.hp, p2.maxHp);
      }
      if (was) this.ui?.toast("배부름이 가셨다 — 잔치 효과가 끝났다", "warn");
    }
  }
  get feastSpeedMult() {
    return this.feast.kind === "speed" ? CFG.cook.rabbit.value : 1;
  }
  get feastMightMult() {
    return this.feast.kind === "might" ? CFG.cook.boar.value : 1;
  }
  _updateTreasure(dt2) {
    const c2 = CFG.treasureEvent;
    if (this._treasureId != null) {
      const e2 = this.enemyMgr.list.find((x2) => x2.id === this._treasureId);
      if (!e2) {
        this._treasureId = null;
        return;
      }
      this._treasureLifeLeft -= dt2;
      if (!this._treasureWarned && this._treasureLifeLeft <= 3) {
        this._treasureWarned = true;
        this.fx.ring(e2.x, e2.z, 16729139, 1.4);
        this.ui?.toast("🦀 보물게가 곧 도망친다! 3초 안에 못 잡으면 놓친다", "warn");
      }
      if (this._treasureLifeLeft <= 0) {
        this.fx.burst(e2.x, 1, e2.z, 16766720, 10, 4);
        this.enemyMgr.kill(e2);
        this._treasureId = null;
      }
      return;
    }
    if (this.wave.phase !== PHASE.COMBAT || this.wave.wave + 1 < c2.minWave) return;
    this._treasureTimer -= dt2;
    if (this._treasureTimer > 0) return;
    this._treasureTimer = c2.minGap + Math.random() * (c2.maxGap - c2.minGap);
    const spot = this._findDropSpot();
    if (!spot) return;
    const e = this.enemyMgr.spawn("treasure", this.wave.wave + 1, spot.x, spot.z);
    if (!e) return;
    this._treasureId = e.id;
    this._treasureLifeLeft = c2.lifetime;
    this._treasureWarned = false;
  }
  // 웨이브가 시작되면(전투 진입) 상인은 즉시 자리를 뜬다 — 준비 시간에만 파는 한정 품목이라는
  // 뜻이다. 호스트에서만 지운다(스냅샷의 mc 필드가 null이 되면 참가자 화면도 그대로 따라온다).
  _updateMerchant() {
    if (this._merchant && this.wave.phase !== PHASE.PREP) this._merchant = null;
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
  // 흡혈(vampire) 변종 전용 — 크리스탈·건물·플레이어 중 무엇을 때리든 그 피해의 일부를 체력으로
  // 되돌린다. 세 공격 경로(onCrystalHit/onBuildingHit/onPlayerHit) 모두 호스트에서만 실행되므로
  // (그 셋을 부르는 enemyMgr.simulate 자체가 `this.isHost` 아래에서만 도는 루프) 별도 동기화 없이
  // 회복된 체력이 그대로 스냅샷을 타고 참가자 화면에도 반영된다.
  _variantLeech(e, dmg) {
    if (e.variant !== "vampire" || e.dead || e.hp >= e.maxHp) return;
    const heal = Math.round(dmg * CFG.variants.vampire.healPct);
    if (heal <= 0) return;
    e.hp = Math.min(e.maxHp, e.hp + heal);
    e.refreshBar();
    this.fx.float(`+${heal}`, e.x, 1.6, e.z, "good");
  }
  // 협공 콤보: 서로 다른 플레이어가 같은 적을 짧은 시간 안에 연달아 때리면 두 번째 타격에 보너스가
  // 붙는다. 각자 흩어져서 몬스터를 나눠 잡는 대신 "같이 한 놈부터 잡는" 선택을 보상한다.
  _hurtEnemy(e, dmg, kind = "tower", fromX, fromZ, playerId) {
    // 멧돼지처럼 반격하는 야생 동물은 때린 사람을 기억해 잠시 쫓아온다 — 사냥이 공짜가 아니게 한다
    if (e.st.retaliates && kind === "player" && !e.dead) {
      e.aggroTarget = playerId || this.local.id;
      e.aggroUntil = performance.now() / 1e3 + (e.st.aggroTime || 5);
    }
    let combo = false;
    if (kind === "player" && playerId) {
      const now = performance.now() / 1e3;
      const cc2 = CFG.combo;
      if (e._comboBy && e._comboBy !== playerId && now - (e._comboAt || 0) < cc2.window) {
        dmg = Math.round(dmg * cc2.mult);
        combo = true;
      }
      e._comboBy = playerId;
      e._comboAt = now;
    }
    const { died, applied } = e.damage(dmg, fromX, fromZ);
    this.fx.float(combo ? `${Math.round(applied)} 협공!` : String(Math.round(applied)), e.x, 1.9, e.z, combo ? "combo" : kind === "player" ? "player" : "");
    if (combo) {
      this.fx.ring(e.x, e.z, 16751001, 1.6);
      this.sfx.shard();
      if (!this._seenCombo) {
        this._seenCombo = true;
        this.ui?.toast("🤝 협공! 다른 플레이어와 같은 적을 연달아 맞히면 피해가 늘어난다", "good");
      }
      this.stats.comboCount = (this.stats.comboCount || 0) + 1;
      if (this.stats.comboCount >= 10) this._unlockAchievement("duoStrike");
    }
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
        if (["boss", "frostlord", "warden", "looter"].every((t2) => this.stats.bossKillsSeen.includes(t2))) {
          this._unlockAchievement("fourKings");
        }
      } else {
        this.sfx.enemyDeath();
      }
      if (e.variant === "split") {
        this.enemyMgr.spawnSplit(e);
        this.fx.ring(e.x, e.z, 16755277, 2.4);
      }
      if (e.st.explode) this._bomberExplode(e);
      if (e.elite) {
        this.stats.elitesKilled = (this.stats.elitesKilled || 0) + 1;
        this.fx.ring(e.x, e.z, 16763904, 3);
        if (this.stats.elitesKilled >= 5) this._unlockAchievement("eliteHunter");
      }
      // 사냥감은 목재·광물이 아니라 생고기를 준다 — 화로에서 구워야 쓸모가 생긴다
      if (e.st.meat) {
        const pool = this.shared ? this.pools.team : this._poolOf(this.local.id);
        if (!pool.meat) pool.meat = { rabbit: 0, deer: 0, boar: 0 };
        pool.meat[e.st.meat] = (pool.meat[e.st.meat] || 0) + 1;
        this.ui?.toast(`${e.st.icon} ${e.st.name} 사냥! 생고기를 얻었다 — 화로에서 구워 먹어라`, "good");
        this.stats.animalsHunted = (this.stats.animalsHunted || 0) + 1;
        if (this.stats.animalsHunted >= 10) this._unlockAchievement("hunter");
      }
      const b = e.st.bounty;
      const nightMult = (this.wave.wave + 1) % CFG.wave.nightEvery === 0 ? CFG.wave.nightBountyMult : 1;
      const bw = Math.round(b.wood * this.boonMult.bounty * nightMult);
      const bs2 = Math.round(b.stone * this.boonMult.bounty * nightMult);
      const gotShard = e.st.shardChance && Math.random() < e.st.shardChance;
      if (this.shared) {
        this.pools.team.wood += bw;
        this.pools.team.stone += bs2;
        if (gotShard) this.pools.team.shard = (this.pools.team.shard || 0) + 1;
      } else {
        for (const p2 of this.players.values()) {
          const pool = this._poolOf(p2.id);
          pool.wood += bw;
          pool.stone += bs2;
          if (gotShard) pool.shard = (pool.shard || 0) + 1;
        }
      }
      if (e._loot) {
        const lw = e._loot.tree || 0, ls2 = e._loot.rock || 0, lg = e._loot.gem || 0;
        if (this.shared) {
          this.pools.team.wood += lw;
          this.pools.team.stone += ls2;
          if (lg) this.pools.team.shard = (this.pools.team.shard || 0) + lg;
        } else {
          for (const p2 of this.players.values()) {
            const pool = this._poolOf(p2.id);
            pool.wood += lw;
            pool.stone += ls2;
            if (lg) pool.shard = (pool.shard || 0) + lg;
          }
        }
        this.fx.burst(e.x, 1.2, e.z, 16759043, 14, 5);
        this.ui?.toast(`🦝 도둑너구리 처치! 훔쳐간 자원을 되찾았다 — 🪵+${lw} 🪨+${ls2}${lg ? ` 💠+${lg}` : ""}`, "good");
      }
      if (e.type === "treasure") {
        this._treasureId = null;
        this.fx.burst(e.x, 1.2, e.z, 16766720, 18, 6);
        this.ui?.toast(gotShard ? "🦀 보물게 처치! 목재·광물 두둑히 + 💠 정수 1" : "🦀 보물게 처치! 목재·광물을 두둑히 챙겼다", "good");
        this.stats.treasuresCaught = (this.stats.treasuresCaught || 0) + 1;
        if (this.stats.treasuresCaught >= 5) this._unlockAchievement("treasureHunter");
      if (this.stats.animalsHunted >= 10) this._unlockAchievement("hunter");
      }
      if (e.type === "mimic") {
        this.stats.mimicsKilled = (this.stats.mimicsKilled || 0) + 1;
        if (this.stats.mimicsKilled >= 3) this._unlockAchievement("mimicHunter");
      }
      this.enemyMgr.kill(e);
    }
  }
  // 폭탄병이 죽는 순간(원인 불문 — 타워든 근접이든 폭탄이든) 그 자리에서 터진다.
  // 크리스탈·건물·플레이어만 맞는다(다른 몬스터는 대상이 아니다 — 순수 위협이지 파밍 수단이 아니다)
  _bomberExplode(e) {
    const c2 = e.st.explode;
    const x = e.x, z = e.z;
    this.fx.burst(x, 1.2, z, 16733491, 20, 7);
    this.fx.ring(x, z, 16733491, c2.radius);
    this.sfx.buildingHit();
    if (dist(x, z, 0, 0) <= c2.radius) {
      const hpBefore = this.world.crystal.hp;
      const dead = this.world.damageCrystal(c2.dmg);
      this.fx.float(`-${c2.dmg}`, 0, 4.4, 0, "crystal");
      if (this.world.crystal.hp < hpBefore && this._bossActive) this._bossWaveDamaged = true;
      if (dead) this._lose();
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
    if (this.difficulty === "nightmare") this._unlockAchievement("nightmareConqueror");
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
    if (w2 % CFG.wave.nightEvery === 0) return `🌙 ${base} — 밤이라 시야가 좁지만, 처치 보상은 ${Math.round((CFG.wave.nightBountyMult - 1) * 100)}% 더 후하다`;
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
  requestSpecialize(id, spec) {
    if (this.isHost) this.hostSpecialize(this.local.id, id, spec);
    else this.net.send("specialize", { id, spec });
  }
  hostSpecialize(playerId, id, spec) {
    const b = this.buildMgr.buildings.get(id);
    if (!b || !b.canSpecialize) return;
    const sp2 = CFG.towerSpec[b.key]?.[spec];
    if (!sp2) return;
    const cost = CFG.towerSpec.cost;
    const pool = this._poolOf(playerId);
    if (!canAfford(pool, cost)) {
      this._notify(playerId, "자원이 부족합니다", "bad");
      return;
    }
    payCost(pool, cost);
    this._trackSpend(cost, "upgrade");
    this.buildMgr.specialize(id, spec);
    this._notify(playerId, `${sp2.icon} ${b.def.name} → ${sp2.name} 특화 완료!`, "good");
    if (playerId === this.local.id) this.sfx.upgrade();
  }
  // 무기 특화 — 타워 특화(hostSpecialize)와 정확히 같은 구조를 개인 무기 쪽으로 옮긴 것.
  // 건물과 달리 id가 없다 — 플레이어별로 무기 종류당 하나만 가질 수 있어 key만으로 충분하다.
  requestSpecializeWeapon(key, spec) {
    if (this.isHost) this.hostSpecializeWeapon(this.local.id, key, spec);
    else this.net.send("specializeWeapon", { key, spec });
  }
  hostSpecializeWeapon(playerId, key, spec) {
    const p2 = this.players.get(playerId);
    const sp2 = CFG.weaponSpec[key]?.[spec];
    if (!p2 || !sp2 || !p2.tools[key] || p2.weaponSpec[key] || (p2.weaponLv[key] || 0) < CFG.weaponUpgrade.maxLv) return;
    const cost = this._weaponSpecCost();
    const pool = this._poolOf(playerId);
    if (!canAfford(pool, cost)) {
      this._notify(playerId, "자원이 부족합니다", "bad");
      return;
    }
    payCost(pool, cost);
    this._trackSpend(cost, "upgrade");
    p2.weaponSpec[key] = spec;
    const def = CFG.craft[key];
    this._notify(playerId, `${sp2.icon} ${def.name} → ${sp2.name} 특화 완료!`, "good");
    if (playerId === this.local.id) this.sfx.upgrade();
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
    if (node.mimic) {
      node.mimic = false;
      if (this.wave.wave >= CFG.mimic.minWave) {
        this._ambushMimic(node, playerId);
        return;
      }
    }
    const cfg = CFG.harvest[node.type];
    const pool = this._poolOf(playerId);
    const amount = cfg.yield;
    if (node.type === "tree") pool.wood += amount;
    else if (node.type === "gem") pool.shard = (pool.shard || 0) + amount;
    else if (node.type === "copper") pool.copper = (pool.copper || 0) + amount;
    else if (node.type === "coal") pool.coal = (pool.coal || 0) + amount;
    else pool.stone += amount;
    this.world.consumeNode(node);
    this.stats.harvested += amount;
    this._notifyGain(playerId, node.type, amount, node);
    if (node.type === "gem" && pool.shard === amount) {
      this._notify(playerId, "💠 정수 획득! 인벤토리 스킬 탭에서 회복 외에 폭발·시간 왜곡·방벽도 쓸 수 있다", "good");
    }
  }
  // 미믹 노드였음이 드러났을 때: 자원 대신 그 자리에서 몬스터를 소환한다. 소환된 개체는 곧바로
  // 캐던 플레이어의 공격 사거리 안이라 다음 프레임 자동으로 교전이 시작된다(_nearestPlayer 로직
  // 재사용, 새 배관 불필요). event:true 라 웨이브 클리어 판정에는 안 잡힌다.
  _ambushMimic(node, playerId) {
    node.charges = 1;
    this.world.consumeNode(node);
    this.enemyMgr.spawn("mimic", this.wave.wave, node.x, node.z);
    this.fx.burst(node.x, 1, node.z, 8998662, 16, 6);
    if (playerId === this.local.id) this.sfx.crystalDanger();
    this._notify(playerId, "🎭 미믹이었다! 자원인 줄 알았던 게 몬스터로 변해 덮쳤다", "bad");
  }
  // aim 을 넘기면(대상을 직접 클릭한 경우) 원거리 무기가 마우스 위치가 아니라 그 지점을 겨눈다 —
  // 클릭한 적과 실제로 겨누는 곳이 어긋나지 않게 한다(특히 탭으로 조작하는 모바일)
  requestAttack(aim = null) {
    if (this.local.heldWeapon === "bomb") {
      this._requestThrow(aim);
      return;
    }
    if (this.local.heldWeapon === "bow") {
      this._requestShoot(aim);
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
  _requestThrow(aim = null) {
    const cfg = this.local.throwStats;
    if (!canAfford(this.myPool, cfg.cost)) {
      this._notify(this.local.id, "자원이 부족합니다", "bad");
      return;
    }
    const pointer = aim || this.sm.updatePointerWorld();
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
  // 활을 들었을 때의 공격 — 근접 대신 조준한 쪽으로 화살이 날아간다. 폭탄과 같은 배관을 쓰지만
  // 자원을 안 먹고 명중 지점에서 가장 가까운 한 마리만 맞힌다.
  _requestShoot(aim = null) {
    const cfg = this.local.shootStats;
    const pointer = aim || this.sm.updatePointerWorld();
    if (!pointer) return;
    if (!this.local.tryShoot()) return;
    const dx = pointer.x - this.local.x, dz = pointer.z - this.local.z;
    const len = Math.hypot(dx, dz) || 1;
    const clamped = Math.min(len, cfg.range);
    const tx = this.local.x + dx / len * clamped, tz = this.local.z + dz / len * clamped;
    this.local.rot = Math.atan2(dx, dz);
    this.sfx.meleeSwing();
    if (this.isHost) {
      this.hostShootArrow(this.local.id, this.local.x, this.local.z, tx, tz);
    } else {
      this.net.send("shootArrow", { x: this.local.x, z: this.local.z, tx, tz });
      const from = new THREE.Vector3(this.local.x, 1.4, this.local.z);
      const to2 = new THREE.Vector3(tx, 0.9, tz);
      this.projectiles.fire(from, to2, cfg.speed, 16772829, (pos) => this._arrowVFX(pos));
    }
    if (!this._seenBow) {
      this._seenBow = true;
      this.ui?.toast("🏹 활 사격! 손 대신 조준한 쪽으로 화살이 날아간다 — 자원은 안 들지만 한 발에 한 마리만 맞는다", "good");
    }
  }
  _arrowVFX(pos) {
    this.fx.burst(pos.x, pos.y, pos.z, 16772829, 5, 3);
  }
  hostShootArrow(playerId, fromX, fromZ, tx, tz) {
    const cfg = this.players.get(playerId)?.shootStats ?? CFG.craft.bow.shoot;
    const dmg = Math.round(cfg.dmg * this._desperationMult);
    const from = new THREE.Vector3(fromX, 1.4, fromZ);
    const to2 = new THREE.Vector3(tx, 0.9, tz);
    this.projectiles.fire(from, to2, cfg.speed, 16772829, (pos) => {
      this._arrowVFX(pos);
      let best = null, bestD = cfg.hitRadius;
      for (const e of this.enemyMgr.list) {
        if (e.dead) continue;
        const d2 = dist(e.x, e.z, pos.x, pos.z);
        if (d2 < bestD) {
          bestD = d2;
          best = e;
        }
      }
      if (best) this._hurtEnemy(best, dmg, "player", pos.x, pos.z, playerId);
    });
  }
  _bombVFX(pos, radius) {
    this.fx.burst(pos.x, pos.y, pos.z, 3355443, 16, 6);
    this.fx.ring(pos.x, pos.z, 3355443, radius);
    this.sfx.buildingHit();
  }
  hostThrowBomb(playerId, fromX, fromZ, tx, tz) {
    const cfg = this.players.get(playerId)?.throwStats ?? CFG.craft.bomb.throw;
    const pool = this._poolOf(playerId);
    if (!canAfford(pool, cfg.cost)) {
      this._notify(playerId, "자원이 부족합니다", "bad");
      return;
    }
    payCost(pool, cfg.cost);
    this._trackSpend(cfg.cost, "craft");
    const dmg = Math.round(cfg.dmg * this._desperationMult);
    const from = new THREE.Vector3(fromX, 1.1, fromZ);
    const to2 = new THREE.Vector3(tx, 0.4, tz);
    this.projectiles.fire(from, to2, cfg.speed, 3355443, (pos) => {
      this._bombVFX(pos, cfg.radius);
      const targets = this.enemyMgr.list.filter((e) => !e.dead && dist(e.x, e.z, pos.x, pos.z) <= cfg.radius);
      for (const e of targets) this._hurtEnemy(e, dmg, "player", pos.x, pos.z, playerId);
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
  // 미니맵 핑 — 협동 플레이에서 "여기 좀 봐줘"를 말이나 채팅 없이 전달하는 유일한 수단이라
  // 건설·공격처럼 호스트 검증이 필요 없다(자원도 안 쓰고 되돌릴 상태도 없다). 스팸을 막는
  // 쿨다운만 로컬에서 걸고, 신호 자체는 그대로 방송한다 — 찍은 사람도 자기 화면에서 똑같이 보여야
  // "제대로 찍혔는지" 확인이 되므로 로컬에도 바로 표시한다.
  requestPing(x2, z2) {
    if (this._pingCd > 0) return;
    this._pingCd = CFG.player.pingCooldown;
    this._showPing(x2, z2);
    this.net.send("ping", { x: x2, z: z2, name: this.local.name });
  }
  _showPing(x2, z2, name) {
    this.fx.pingMarker(x2, z2);
    this.sfx.upgrade();
    if (name) this.ui?.toast(`📍 ${name}: 여기 봐주세요!`, "warn");
  }
  // 크리스탈 체력이 위험 문턱 아래면 "필사의 반격" — 플레이어(근접·폭탄)의 대미지가 오른다.
  // 타워에는 적용하지 않는다: 위기에서 직접 뛰어들 이유를 만드는 게 목적이라 자동 화력은 제외.
  get _desperationMult() {
    const c2 = this.world.crystal;
    return c2.hp > 0 && c2.hp / c2.maxHp < CFG.crystal.desperation.threshold ? CFG.crystal.desperation.dmgMult + this.boonMult.desperationBonus : 1;
  }
  hostAttack(playerId, x2, z2, rot) {
    const a = this.players.get(playerId)?.attackStats ?? CFG.player.attack;
    const dmg = Math.round(a.dmg * this.boonMult.atk * this.tempBoon.atk * this.feastMightMult * this._desperationMult);
    let thornDmg = 0;
    for (const e of this.enemyMgr.list) {
      if (e.dead) continue;
      const d2 = dist(x2, z2, e.x, e.z);
      if (d2 > a.range + e.st.radius) continue;
      const ang = Math.atan2(e.x - x2, e.z - z2);
      let diff = Math.abs((ang - rot + Math.PI) % (Math.PI * 2) - Math.PI);
      if (diff > a.arc) continue;
      this._hurtEnemy(e, dmg, "player", x2, z2, playerId);
      if (!e.dead && this.boonMult.venomChance && Math.random() < this.boonMult.venomChance) {
        e.applyPoison(CFG.boons.venom.dps, CFG.boons.venom.duration, performance.now() / 1e3);
      }
      if (e.variant === "thorn") thornDmg += Math.round(dmg * CFG.variants.thorn.reflectPct);
      if (a.knockback && !e.dead) {
        const kd = Math.max(d2, 0.4);
        e.x += (e.x - x2) / kd * a.knockback;
        e.z += (e.z - z2) / kd * a.knockback;
        if (!this._seenKnockback) {
          this._seenKnockback = true;
          this.ui?.toast("🔗 채찍이 적을 뒤로 밀쳐냈다! 거리를 벌리거나 무리를 흩어놓을 때 유용하다", "good");
        }
      }
    }
    if (thornDmg > 0) this._reflectThorns(playerId, thornDmg, x2, z2);
  }
  // 가시 변종에게 근접으로 맞힌 만큼 되돌려 받는다 — onPlayerHit(몬스터가 플레이어를 때릴 때)과
  // 같은 로컬/원격 분기를 그대로 재사용해 새 네트워크 메시지가 필요 없었다
  _reflectThorns(playerId, dmg, x2, z2) {
    if (playerId === this.local.id) {
      this._hurtLocal(dmg);
    } else {
      this.net.send("hurt", { to: playerId, dmg });
    }
    this.fx.burst(x2, 1, z2, CFG.variants.thorn.tint, 8, 3);
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
  // 지금 손에 든 무기로 실제로 닿는 거리. 원거리 무기(활·폭탄가방)는 근접 사거리가 아니라
  // 자기 사거리를 쓴다 — 이게 없으면 사거리 9~16짜리 무기를 들고도 멀리 있는 적을 클릭했을 때
  // "더 가까이 가세요" 라고 거부당한다
  get attackReach() {
    if (this.local.heldWeapon === "bow") return this.local.shootStats.range;
    if (this.local.heldWeapon === "bomb") return this.local.throwStats.range;
    return this.local.attackStats.range;
  }
  clickWorld(pointer) {
    if (!pointer) {
      this.requestAttack();
      return;
    }
    const PICK = 2.2;
    const enemy = this._enemyNear(pointer.x, pointer.z, PICK);
    if (enemy) {
      const reach = this.attackReach + enemy.st.radius;
      if (dist(this.local.x, this.local.z, enemy.x, enemy.z) > reach) {
        this.ui?.toast(`${enemy.st.name}에게 더 가까이 가세요`, "warn");
        return;
      }
      this.local.rot = Math.atan2(enemy.x - this.local.x, enemy.z - this.local.z);
      this.requestAttack({ x: enemy.x, z: enemy.z });
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
  // 화살탑이 한 발 쏠 때마다 호출된다(호스트 전용 경로). 팀 자원 풀에서 화살을 한 발 꺼내고,
  // 없으면 false 를 돌려 그 타워는 이번 발사를 건너뛴다.
  _takeAmmo(kind) {
    const pool = this.shared ? this.pools.team : this._poolOf(this.local.id);
    if ((pool[kind] || 0) < 1) {
      // 보급이 끊긴 걸 모르면 "타워가 왜 안 쏘지?" 가 된다 — 한 번만 크게 알린다
      if (!this._ammoWarned) {
        this._ammoWarned = true;
        this.ui?.toast("🏹 화살이 떨어졌다! 화살탑이 멈춘다 — 제작대에서 화살을 만들어라 (목재·구리)", "bad");
      }
      return false;
    }
    pool[kind] -= 1;
    this._ammoWarned = false;
    return true;
  }
  requestFletch() {
    if (this.isHost) this.hostFletch(this.local.id);
    else this.net.send("fletch", {});
  }
  hostFletch(playerId) {
    if (!this.players.get(playerId)) return;
    if (!this.hasStation("workbench")) {
      this._notify(playerId, "제작대가 있어야 화살을 만들 수 있습니다", "bad");
      return;
    }
    const c2 = CFG.fletch;
    const pool = this._poolOf(playerId);
    if (!canAfford(pool, c2.cost)) {
      this._notify(playerId, "재료가 부족합니다 (목재·구리)", "bad");
      return;
    }
    payCost(pool, c2.cost);
    this._trackSpend(c2.cost, "craft");
    pool.arrow = (pool.arrow || 0) + c2.yield;
    this._notify(playerId, `🏹 화살 ${c2.yield}발을 만들었다`, "good");
    if (playerId === this.local.id) this.sfx.upgrade();
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
  // 무기 특화 비용 (숙련 축복이 깎아 준다) — 강화 비용(_weaponUpgradeCost)과 같은 구조
  _weaponSpecCost() {
    return { iron: Math.max(1, CFG.weaponSpec.cost.iron + this.boonMult.weaponSpecCostDelta) };
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
  // 정수 샘 축복: trickleInterval 초마다 스택 수만큼 정수를 저절로 채워준다(호스트만 계산,
  // 결과 자원 수치는 기존 pools 스냅샷에 이미 실려서 참가자에게 그대로 전파된다)
  _updateShardTrickle(dt2) {
    if (!this.isHost || !this._shardTrickleStacks) return;
    this._shardTrickleAcc = (this._shardTrickleAcc || 0) + dt2;
    const interval = CFG.endlessBoon.trickleInterval;
    if (this._shardTrickleAcc < interval) return;
    this._shardTrickleAcc -= interval;
    const amount = this._shardTrickleStacks;
    if (this.shared) {
      this.pools.team.shard = (this.pools.team.shard || 0) + amount;
    } else {
      for (const p2 of this.players.values()) {
        const pool = this._poolOf(p2.id);
        pool.shard = (pool.shard || 0) + amount;
      }
    }
    this.fx.float(`💧+${amount}`, 0, 4.5, 0, "good");
  }
  // 채집기(harvester)는 반경 안 나무·바위를 손으로 캐는 것과 똑같은 경로(consumeNode)로 천천히
  // 스스로 캔다 — 정수석(gem)은 제외한다. 여러 채집기가 같은 노드를 두고 경쟁할 수 있는데(각자
  // 독립적으로 가장 가까운 대상을 고르므로), 그 자체는 버그가 아니라 배치를 고민하게 만드는 요소다.
  _updateHarvesters(dt2) {
    if (!this.isHost) return;
    for (const b of this.buildMgr.buildings.values()) {
      if (!b.isHarvester) continue;
      const st = b.stats;
      let target = null, bestD = st.detectRadius;
      for (const n of this.world.nodes) {
        if (n.depleted || n.type === "gem" || n.mimic) continue;
        const d2 = dist(b.x, b.z, n.x, n.z);
        if (d2 < bestD) {
          bestD = d2;
          target = n;
        }
      }
      if (!target) continue;
      b._harvestCd = (b._harvestCd || 0) - dt2;
      if (b._harvestCd > 0) continue;
      b._harvestCd = st.interval;
      const cfg = CFG.harvest[target.type];
      const pool = this._poolOf(b.ownerId);
      const amount = cfg.yield;
      if (target.type === "tree") pool.wood += amount;
      else pool.stone += amount;
      this.world.consumeNode(target);
      this.stats.harvested += amount;
      this.fx.burst(target.x, 1, target.z, target.type === "tree" ? 5979428 : 9146266, 6, 3);
      if (!this._seenHarvester) {
        this._seenHarvester = true;
        this.ui?.toast("🧺 채집기가 스스로 자원을 모으기 시작했다! 손으로 캐는 것보다 느리지만 방치해도 알아서 채워진다", "good");
      }
    }
  }
  // 정비소: 반경 안 손상된 건물을 자원 없이 초당 healRate 만큼 서서히 고쳐준다 (자기 자신 제외)
  _updateRepairPosts(dt2) {
    if (!this.isHost) return;
    for (const b of this.buildMgr.buildings.values()) {
      if (!b.isRepairPost) continue;
      const st = b.stats;
      for (const o of this.buildMgr.buildings.values()) {
        if (o === b || o.hp >= o.maxHp) continue;
        if (dist(b.x, b.z, o.x, o.z) > st.healRadius) continue;
        const healed = Math.min(st.healRate * dt2, o.maxHp - o.hp);
        o.hp += healed;
        o.refreshBar();
        this.stats.repairPostHealed = (this.stats.repairPostHealed || 0) + healed;
        if (this.stats.repairPostHealed >= 500) this._unlockAchievement("medic");
        if (!this._seenRepairPost) {
          this._seenRepairPost = true;
          this.ui?.toast("🔧 정비소가 주변 손상된 건물을 스스로 고치기 시작했다! 수리하러 뛰어다니지 않아도 방어선이 버틴다", "good");
        }
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
  // 중력 균열 — 다른 스킬과 달리 조준한 지점에 설치된다. 폭탄 투척과 같은 방식으로 겨눈다.
  requestSkillRift(aim = null) {
    const s2 = CFG.skills.rift;
    const pointer = aim || this.sm.updatePointerWorld();
    if (!pointer) return;
    const dx = pointer.x - this.local.x, dz = pointer.z - this.local.z;
    const len = Math.hypot(dx, dz) || 1;
    const clamped = Math.min(len, s2.aimRange);
    const tx = this.local.x + dx / len * clamped, tz = this.local.z + dz / len * clamped;
    this.sfx.shard();
    if (this.isHost) this.hostSkillRift(this.local.id, tx, tz);
    else this.net.send("skillRift", { tx, tz });
  }
  hostSkillRift(playerId, tx, tz) {
    const s2 = CFG.skills.rift;
    const cost = this._skillCost(s2);
    const p2 = this.players.get(playerId);
    const pool = this._poolOf(playerId);
    if (!p2) return;
    if (this._rift) {
      this._notify(playerId, "이미 균열이 열려 있습니다", "bad");
      return;
    }
    if ((pool.shard || 0) < cost) {
      this._notify(playerId, "수정 정수가 부족합니다", "bad");
      return;
    }
    pool.shard -= cost;
    this._unlockAchievement("skillUser", playerId);
    this._rift = { x: tx, z: tz, timeLeft: s2.time };
    this.world.setRift(tx, tz, s2.time, s2.radius);
    this.fx.ring(tx, tz, 11239935, s2.radius);
    this._notify(playerId, `🌌 중력 균열! ${s2.time}초간 주변 적을 끌어모은다 — 범위 공격을 겹쳐라`, "good");
  }
  // 균열은 호스트에서만 계산하고, 위치·잔여시간만 스냅샷으로 내려보낸다(운석과 같은 패턴).
  // 피해는 0이라 "끌어당김"만 적용하면 되고, 보스는 자기 패턴이 있으므로 제외한다.
  _updateRift(dt2) {
    if (!this.isHost || !this._rift) return;
    const s2 = CFG.skills.rift;
    const r = this._rift;
    r.timeLeft -= dt2;
    if (r.timeLeft <= 0) {
      this._rift = null;
      this.world.clearRift();
      return;
    }
    this.world.setRift(r.x, r.z, r.timeLeft, s2.radius);
    for (const e of this.enemyMgr.list) {
      if (e.dead || e.st.boss) continue;
      const dx = r.x - e.x, dz = r.z - e.z;
      const d2 = Math.hypot(dx, dz);
      if (d2 > s2.radius || d2 < 0.15) continue;
      const step = Math.min(d2, s2.pull * dt2);
      e.x += dx / d2 * step;
      e.z += dz / d2 * step;
    }
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
  requestSkillSummon() {
    this.sfx.shard();
    if (this.isHost) this.hostSkillSummon(this.local.id);
    else this.net.send("skillSummon", {});
  }
  hostSkillSummon(playerId) {
    const s2 = CFG.skills.summon;
    const cost = this._skillCost(s2);
    const p2 = this.players.get(playerId);
    const pool = this._poolOf(playerId);
    if (!p2) return;
    if (this._spirit) {
      this._notify(playerId, "이미 정령이 있습니다", "bad");
      return;
    }
    if ((pool.shard || 0) < cost) {
      this._notify(playerId, "수정 정수가 부족합니다", "bad");
      return;
    }
    pool.shard -= cost;
    this._unlockAchievement("skillUser", playerId);
    this._spirit = { x: p2.x, z: p2.z, ownerId: playerId, timeLeft: s2.duration, cd: 0 };
    this.world.setSpirit(p2.x, p2.z, s2.duration);
    this.fx.ring(p2.x, p2.z, 9427711, 1.4);
    this.fx.burst(p2.x, 1.3, p2.z, 9427711, 16, 5);
    this._notify(playerId, `🧚 정령 소환! ${s2.duration}초간 근처 적을 알아서 공격한다`, "good");
  }
  // 정령은 호스트에서만 이동·공격을 계산하고, 위치·잔여시간만 스냅샷으로 내려보낸다(균열과 같은 패턴).
  // 결계 변종·파묻힌 굴착병은 타워의 _acquire 와 똑같이 걸러 — 정령도 "자동으로 조준하는" 계열이라
  // 직접 손으로 때려야 하는 적은 그대로 손으로 때려야 한다.
  _updateSpirit(dt2) {
    if (!this.isHost || !this._spirit) return;
    const s2 = CFG.skills.summon;
    const sp2 = this._spirit;
    sp2.timeLeft -= dt2;
    if (sp2.timeLeft <= 0) {
      this.fx.burst(sp2.x, 1.3, sp2.z, 9427711, 12, 4);
      this._spirit = null;
      this.world.clearSpirit();
      return;
    }
    let target = null, bestD = s2.range;
    for (const e of this.enemyMgr.list) {
      if (e.dead) continue;
      if (e.variant === "ward") continue;
      if (e.st.burrows && e.diving) continue;
      const d2 = dist(sp2.x, sp2.z, e.x, e.z);
      if (d2 < bestD) {
        bestD = d2;
        target = e;
      }
    }
    sp2.cd -= dt2;
    if (target && bestD <= s2.atkRange) {
      if (sp2.cd <= 0) {
        sp2.cd = 1 / s2.rate;
        this._hurtEnemy(target, s2.dmg, "player", sp2.x, sp2.z);
        this.fx.burst(target.x, 1, target.z, 9427711, 6, 3);
      }
    } else {
      const owner = this.players.get(sp2.ownerId);
      const tx = target ? target.x : owner ? owner.x : sp2.x;
      const tz = target ? target.z : owner ? owner.z : sp2.z;
      const dx = tx - sp2.x, dz = tz - sp2.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.3) {
        const step = Math.min(len, s2.speed * dt2);
        sp2.x += dx / len * step;
        sp2.z += dz / len * step;
      }
    }
    this.world.setSpirit(sp2.x, sp2.z, sp2.timeLeft);
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
    to2.weaponSpec[key] = from.weaponSpec[key] || null;
    from.weaponSpec[key] = null;
    const def = CFG.craft[key];
    const lvNote = to2.weaponLv[key] ? ` (강화 Lv.${to2.weaponLv[key]})` : "";
    const specNote = to2.weaponSpec[key] ? ` ${CFG.weaponSpec[key][to2.weaponSpec[key]].icon} ${CFG.weaponSpec[key][to2.weaponSpec[key]].name} 특화` : "";
    this._notify(toId, `${def.icon} ${def.name}을(를) 받았다${lvNote}${specNote} — 인벤토리 장비 탭에서 손에 쥘 수 있다`, "good");
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
    net.on("specialize", (d2, from) => {
      if (this.isHost) this.hostSpecialize(from, d2.id, d2.spec);
    });
    net.on("specializeWeapon", (d2, from) => {
      if (this.isHost) this.hostSpecializeWeapon(from, d2.key, d2.spec);
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
    net.on("buyMerchant", (d2, from) => {
      if (this.isHost) this.hostBuyMerchant(from, d2.key);
    });
    net.on("attack", (d2, from) => {
      if (this.isHost) this.hostAttack(from, d2.x, d2.z, d2.rot);
    });
    net.on("throwBomb", (d2, from) => {
      if (this.isHost) this.hostThrowBomb(from, d2.x, d2.z, d2.tx, d2.tz);
    });
    net.on("shootArrow", (d2, from) => {
      if (this.isHost) this.hostShootArrow(from, d2.x, d2.z, d2.tx, d2.tz);
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
    net.on("ping", (d2) => {
      this._showPing(d2.x, d2.z, d2.name);
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
    net.on("fletch", (d2, from) => {
      if (this.isHost) this.hostFletch(from);
    });
    net.on("cook", (d2, from) => {
      if (this.isHost) this.hostCook(from, d2.key);
    });
    net.on("skillRift", (d2, from) => {
      if (this.isHost) this.hostSkillRift(from, d2.tx, d2.tz);
    });
    net.on("skillBarrier", (d2, from) => {
      if (this.isHost) this.hostSkillBarrier(from);
    });
    net.on("skillSummon", (d2, from) => {
      if (this.isHost) this.hostSkillSummon(from);
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
      players[p2.id] = { hv: p2.harvestLv, tl: Object.keys(p2.tools).filter((k2) => p2.tools[k2]), eq: p2.equipped || null, wl: p2.weaponLv, ws: p2.weaponSpec };
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
      crf: this.world.crystal.reflectLv,
      rf: this._rift ? [Math.round(this._rift.x * 10) / 10, Math.round(this._rift.z * 10) / 10, Math.round(this._rift.timeLeft * 10) / 10] : null,
      sp: this._spirit ? [Math.round(this._spirit.x * 10) / 10, Math.round(this._spirit.z * 10) / 10, Math.round(this._spirit.timeLeft * 10) / 10] : null,
      mt: this._meteorPending ? [Math.round(this._meteorPending.x * 10) / 10, Math.round(this._meteorPending.z * 10) / 10, Math.round(this._meteorPending.timeLeft * 10) / 10] : null,
      mc: this._merchant ? { offers: this._merchant.offers, boughtBy: this._merchant.boughtBy } : null,
      tb: { atk: this.tempBoon.atk, towerDmg: this.tempBoon.towerDmg },
      // 엔드리스 축복(영구 배율·할인)은 호스트만 고르고 이 필드로만 전파된다 — 없으면 참가자
      // 화면의 강화·특화 비용 미리보기가 호스트가 이미 적용한 할인을 못 보고 "자원 부족"으로
      // 잘못 비활성화되고, 솔로 저장·재개 시에도 그동안 고른 축복이 전부 초기화된다.
      bm: this.boonMult,
      sr: this._shardTrickleStacks || 0,
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
        elitesKilled: this.stats.elitesKilled,
        treasuresCaught: this.stats.treasuresCaught,
        animalsHunted: this.stats.animalsHunted,
        comboCount: this.stats.comboCount,
        repairPostHealed: this.stats.repairPostHealed
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
      if (clearedWave >= 5 && !buildings.some((b) => b.key === "wall" || b.key === "gate")) this._unlockAchievement("noWall");
      if (clearedWave >= 3 && !buildings.some((b) => b.isTower || b.isSupport)) {
        this._unlockAchievement("noTower");
      }
    }
    const prevHp = this.world.crystal.hp;
    if (s2.cm) this.world.crystal.maxHp = s2.cm;
    if (s2.ca !== void 0) this.world.crystal.armorLv = s2.ca;
    if (s2.cr !== void 0) this.world.crystal.regenLv = s2.cr;
    if (s2.cx !== void 0) this.world.crystal.auraLv = s2.cx;
    if (s2.crf !== void 0) this.world.crystal.reflectLv = s2.crf;
    this.world.crystal.hp = s2.c;
    if (s2.c < prevHp) {
      this.ui?.shake();
      this.fx.burst(0, 3.2, 0, 6545663, 8, 4);
      this.sfx.crystalHit();
      if (wasBossCombat) this._pBossWaveDamaged = true;
    }
    if (s2.mt) this.world.setMeteor(s2.mt[0], s2.mt[1], s2.mt[2], CFG.meteor.radius);
    else this.world.clearMeteor();
    if (s2.rf) this.world.setRift(s2.rf[0], s2.rf[1], s2.rf[2], CFG.skills.rift.radius);
    else this.world.clearRift();
    if (s2.sp) this.world.setSpirit(s2.sp[0], s2.sp[1], s2.sp[2]);
    else this.world.clearSpirit();
    if (!this._merchant && s2.mc) this.ui?.toast("🧳 떠돌이 상인이 왔다! 이번 준비 시간에만 물건을 판다", "good");
    this._merchant = s2.mc ? { offers: s2.mc.offers, boughtBy: s2.mc.boughtBy || {} } : null;
    if (s2.tb) Object.assign(this.tempBoon, s2.tb);
    if (s2.bm) {
      Object.assign(this.boonMult, s2.bm);
      this.wave.prepBonus = this.boonMult.prepDelta || 0;
    }
    if (s2.sr) this._shardTrickleStacks = s2.sr;
    if (s2.r.team) this.pools.team = s2.r.team;
    if (s2.r.byId) this.pools.byId = s2.r.byId;
    for (const [id, pd2] of Object.entries(s2.p || {})) {
      const p2 = this.players.get(id);
      if (p2) {
        p2.harvestLv = pd2.hv;
        p2.tools = {};
        for (const k2 of pd2.tl || []) p2.tools[k2] = true;
        p2.weaponLv = pd2.wl || {};
        p2.weaponSpec = pd2.ws || {};
        if (p2 !== this.local) p2.equipped = pd2.eq || null;
      }
    }
    if (s2.st) {
      Object.assign(this.stats, s2.st);
      if (this.stats.trapsTriggered >= 3) this._unlockAchievement("trapMaster");
      if (this.stats.elitesKilled >= 5) this._unlockAchievement("eliteHunter");
      if (this.stats.treasuresCaught >= 5) this._unlockAchievement("treasureHunter");
      if (this.stats.comboCount >= 10) this._unlockAchievement("duoStrike");
      if (this.stats.mimicsKilled >= 3) this._unlockAchievement("mimicHunter");
      if (this.stats.blocksCount >= 10) this._unlockAchievement("blockMaster");
      if (this.stats.repairPostHealed >= 500) this._unlockAchievement("medic");
      if (this.stats.bossKillsSeen.includes("boss") && this.stats.bossKillsSeen.includes("frostlord")) {
        this._unlockAchievement("bothBosses");
      }
      if (["boss", "frostlord", "warden"].every((t2) => this.stats.bossKillsSeen.includes(t2))) {
        this._unlockAchievement("allBosses");
      }
      if (["boss", "frostlord", "warden", "looter"].every((t2) => this.stats.bossKillsSeen.includes(t2))) {
        this._unlockAchievement("fourKings");
      }
    }
    if (this.wave.phase === PHASE.LOST && !this.result) {
      this.result = "lose";
      this.ui?.showResult(false, this.stats, this.wave.wave);
    }
    if (this.wave.phase === PHASE.WON && !this.result) {
      this.result = "win";
      if (this.difficulty === "hard") this._unlockAchievement("ironWill");
      if (this.difficulty === "nightmare") this._unlockAchievement("nightmareConqueror");
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
    if (this._pingCd > 0) this._pingCd -= dt2;
    this._handleInput(dt2, over);
    if (!over) this.local.update(dt2, this.input, this.sm, this.grid, this.world, [...this.players.values()], this.feastSpeedMult);
    for (const p2 of this.players.values()) {
      if (p2 !== this.local && p2.update) p2.update(dt2);
    }
    if (this.isHost && !over) {
      if (!this.pendingBoon) this.wave.update(dt2);
      this.enemyMgr.simulate(dt2, now, [...this.players.values()], this.buildMgr);
      this._updateTraps();
      this._updateSupplyDrops(dt2);
      this._updateMeteor(dt2);
      this._updateTreasure(dt2);
      this._updateRift(dt2);
      this._updateHunt(dt2);
      this._updateSpirit(dt2);
      this._updateMerchant();
      this._updateCrystalUpgrades(dt2);
      this._updateHarvesters(dt2);
      this._updateRepairPosts(dt2);
      this._updateShardTrickle(dt2);
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
    if (inp.hit(km.get("skillRift"))) this.requestSkillRift();
    if (inp.hit(km.get("skillSummon"))) this.requestSkillSummon();
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
        const h2 = this.buildMgr.hover;
        if (h2?.canSpecialize) this.ui?.showSpecChoice(h2);
        else if (h2) this.requestUpgrade(h2.id);
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
    this.local.blocking = this.local.alive && inp.down(km.get("block")) && !this.buildMgr.mode;
    if (this.local.blocking) this.local.cancelHarvest();
    if (inp.hit(km.get("attack")) && !this.local.blocking) this.requestAttack();
    if (inp.hit(km.get("dash"))) this._tryDash();
    const holding = (inp.down(km.get("harvest")) || inp.down("e") || this.ui?.harvestHeld) && !this.local.blocking;
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
        reviveAssisted: l2.reviveAssisted,
        blocking: l2.blocking
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
      daily: !!this.daily,
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
    this.begin({ seed: save.seed, shared: save.shared, difficulty: save.difficulty, resumed: true, daily: !!save.daily });
    const s2 = save.snap;
    this.enemyMgr.applySnapshot(s2.e, s2.w.wave + 1);
    this.buildMgr.applySnapshot(s2.b);
    this.world.applyNodeSnapshot(s2.n);
    this.wave.applySnapshot(s2.w);
    if (s2.cm) this.world.crystal.maxHp = s2.cm;
    if (s2.ca !== void 0) this.world.crystal.armorLv = s2.ca;
    if (s2.cr !== void 0) this.world.crystal.regenLv = s2.cr;
    if (s2.cx !== void 0) this.world.crystal.auraLv = s2.cx;
    if (s2.crf !== void 0) this.world.crystal.reflectLv = s2.crf;
    if (s2.bm) {
      Object.assign(this.boonMult, s2.bm);
      this.wave.prepBonus = this.boonMult.prepDelta || 0;
    }
    if (s2.sr) this._shardTrickleStacks = s2.sr;
    this.world.crystal.hp = s2.c;
    if (s2.r.team) this.pools.team = s2.r.team;
    if (s2.r.byId) this.pools.byId = s2.r.byId;
    const savedPlayer = Object.values(s2.p || {})[0];
    if (savedPlayer) {
      this.local.harvestLv = savedPlayer.hv;
      this.local.tools = {};
      for (const k2 of savedPlayer.tl || []) this.local.tools[k2] = true;
      this.local.weaponLv = savedPlayer.wl || {};
      this.local.weaponSpec = savedPlayer.ws || {};
      this.local.equipped = savedPlayer.eq || null;
    }
    if (save.stats) this.stats = save.stats;
    if (!this.stats.newAchievements) this.stats.newAchievements = [];
    if (!this.stats.bossKillsSeen) this.stats.bossKillsSeen = [];
    if (!this.stats.trapsTriggered) this.stats.trapsTriggered = 0;
    if (this.stats.spentBy && !this.stats.spentBy.merchant) this.stats.spentBy.merchant = { wood: 0, stone: 0, iron: 0 };
    if (!this.stats.elitesKilled) this.stats.elitesKilled = 0;
    if (!this.stats.treasuresCaught) this.stats.treasuresCaught = 0;
    if (!this.stats.comboCount) this.stats.comboCount = 0;
    if (!this.stats.repairPostHealed) this.stats.repairPostHealed = 0;
    this.ui?.toast(`이어하기 — 웨이브 ${this.wave.displayWave}`, "good");
  }
  render() {
    this.sm.render();
  }
};
