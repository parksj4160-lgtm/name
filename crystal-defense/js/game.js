import * as THREE from '../vendor/three.module.js';
import { ACHIEVEMENTS, unlock } from './achievements.js';
import { SoundManager } from './audio.js';
import { BESTIARY_INFO, loadBestiarySeen, markBestiarySeen } from './bestiary.js';
import { BuildManager } from './buildings.js';
import { BOSS_CYCLE, CFG, DIFFICULTIES, PING_KINDS, SPECIAL_WAVES, TARGET_PRIORITY_LABEL, WEATHER, applyDifficulty, bossEntriesOf, crystalMilestoneTier, needsPickaxe, portalSealCost, specialWaveKind, waveComposition, waveReward, weatherOf } from './config.js';
import { EnemyManager } from './enemy.js';
import { Fx, ProjectilePool } from './fx.js';
import { BuildGrid } from './grid.js';
import { Input } from './input.js';
import { KeyMap, keyLabel } from './keymap.js';
import { computeMetaPerks } from './meta.js';
import { Net } from './net.js';
import { LocalPlayer, RemotePlayer } from './player.js';
import { SceneManager } from './scene.js';
import { UI } from './ui.js';
import { COST_KEYS, RES_ICON, canAfford, costText, dateSeed, dist, mulberry32, payCost } from './utils.js';
import { PHASE, WaveDirector } from './wave.js';
import { World } from './world.js';

var SAVE_KEY = "cd.save";
var _nativeRandom = Math.random.bind(Math);
var BESTIARY_ANNOUNCED_ELSEWHERE = /* @__PURE__ */ new Set(["healer", "bomber", "raccoon", "burrower", "commander", "treasure", "wolf", "stagking", "golem", "boss", "frostlord", "warden", "looter", "colossus", "wraith", "galelord", "curselord", "grovelord", "magnetlord", "shadowlord", "weblord", "splitlord"]);
export var Game = class {
  constructor(canvas2, fxLayer2) {
    this.sm = new SceneManager(canvas2);
    this.input = new Input(canvas2, this.sm);
    this.fx = new Fx(this.sm, fxLayer2);
    this.projectiles = new ProjectilePool(this.sm);
    this.sfx = new SoundManager();
    this.km = new KeyMap(Object.fromEntries(Object.entries(CFG.builds).filter(([, def]) => !def.hidden)));
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
    Math.random = daily ? mulberry32(seed >>> 0 ^ 3735928559) : _nativeRandom;
    this.dispose();
    this.seed = seed;
    this.daily = daily;
    this.shared = shared;
    this.difficulty = DIFFICULTIES[difficulty] ? difficulty : "normal";
    this.difficultyPreset = applyDifficulty(this.difficulty);
    this.grid = new BuildGrid();
    this.world = new World(this.sm, seed);
    this.sm.setGroundTint(CFG.biomes[this.world.biome].groundColor);
    this.buildMgr = new BuildManager(this.sm, this.grid, this.world, this.fx, this.projectiles);
    this.enemyMgr = new EnemyManager(this.sm, this.grid, this.world, this.fx);
    this.wave = new WaveDirector(this.world, this.enemyMgr);
    this.local = new LocalPlayer(this.net.selfId, this.net.name, this._colorIndex(this.net.selfId));
    this.sm.scene.add(this.local.mesh);
    this.players.set(this.local.id, this.local);
    this.pools.team = { wood: this.difficultyPreset.startWood, stone: this.difficultyPreset.startStone, iron: 0, copper: 0, coal: 0, shard: 0, meat: { rabbit: 0, deer: 0, boar: 0 }, ammo: { ...CFG.ammo.start } };
    this.pools.byId = {};
    this._poolOf(this.local.id);
    this._wireCallbacks();
    this.stats = {
      harvested: 0,
      built: 0,
      kills: 0,
      shardEarned: 0,
      riskWavesCleared: 0,
      spentWood: 0,
      spentStone: 0,
      spentIron: 0,
      spentCopper: 0,
      spentCoal: 0,
      spentShard: 0,
      spentBy: {
        build: { wood: 0, stone: 0, iron: 0, copper: 0, coal: 0, shard: 0 },
        upgrade: { wood: 0, stone: 0, iron: 0, copper: 0, coal: 0, shard: 0 },
        repair: { wood: 0, stone: 0, iron: 0, copper: 0, coal: 0, shard: 0 },
        harvest: { wood: 0, stone: 0, iron: 0, copper: 0, coal: 0, shard: 0 },
        craft: { wood: 0, stone: 0, iron: 0, copper: 0, coal: 0, shard: 0 },
        merchant: { wood: 0, stone: 0, iron: 0, copper: 0, coal: 0, shard: 0 },
        portalSeal: { wood: 0, stone: 0, iron: 0, copper: 0, coal: 0, shard: 0 }
      },
      time: 0,
      waveLog: [],
      // 지금까지 결과 화면은 팀 전체 합계만 보여줬다 — 여럿이 같이 했을 때 "누가 얼마나
      // 기여했는지"는 전혀 안 보였다. 근접·활·폭탄가방 등 직접 조준한 공격(kind==="player",
      // 협공·치명타와 똑같이 playerId가 있을 때만)만 집계한다 — 타워는 팀 전체가 같이 지은
      // 공용 자산이라 특정 개인 소유가 아니고, 정수 스킬도 이미 여기 안 잡힌다(플레이어를
      // 직접 조준한 공격만 본다는 원칙을 지키기 위해 kind==="player"만 본다).
      dmgByPlayer: {},
      killsByPlayer: {},
      newAchievements: [],
      bossKillsSeen: [],
      weathersSeen: [],
      trapsTriggered: 0,
      elitesKilled: 0,
      berserkKilled: 0,
      treasuresCaught: 0,
      golemsDefeated: 0,
      animalsHunted: 0,
      comboCount: 0,
      critCount: 0,
      parryCount: 0,
      repairPostHealed: 0,
      campHealed: 0,
      mimicsKilled: 0,
      blocksCount: 0,
      dishesCooked: [],
      scoutsIntercepted: 0,
      earlyStarts: 0
    };
    this._waveMark = { time: 0, kills: 0 };
    this._bossActive = false;
    this._bossWaveDamaged = false;
    this._crewSeconds = 0;
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
    this._seenSniper = false;
    this._seenBomber = false;
    this._seenBurrower = false;
    this._seenChain = false;
    this._seenCombo = false;
    this._seenCommander = false;
    this._seenDetect = false;
    this._seenFoxGuard = false;
    this._seenFrostaxe = false;
    this._seenHarvester = false;
    this._seenOutpost = false;
    this._seenHunt = false;
    this._seenKnockback = false;
    this._seenRaccoon = false;
    this._seenReflect = false;
    this._seenRepairPost = false;
    this._seenSniperSynergy = false;
    this._seenTreasure = false;
    this._seenWolf = false;
    this._seenBear = false;
    this._seenAmmoEmpty = false;
    this._seenArmory = false;
    this._seenGaleBlink = false;
    this._seenDagger = false;
    this._seenGrace = false;
    this._seenCrit = false;
    this._seenParry = false;
    this._lastStandReady = false;
    this.boonMult = { atk: 1, towerDmg: 1, skillCostDelta: 0, bounty: 1, crystalUpgradeCostDelta: 0, weaponUpgradeCostDelta: 0, weaponSpecCostDelta: 0, prepDelta: 0, venomChance: 0, desperationBonus: 0, moveSpeedMult: 1, atkSpeedMult: 1, ammoSaveChance: 0, critChanceDelta: 0, downTimeMult: 1, rangeMult: 1, petDmgMult: 1, shardBonus: 0, harvestTimeMult: 1 };
    this.pendingBoon = null;
    this._queuedEndlessBoon = false;
    this._dropTimer = CFG.supplyDrop.firstDelay;
    this._shardDropTimer = CFG.shardDrop.firstDelay;
    this._dropIdSeq = 1;
    this._meteorTimer = CFG.meteor.firstDelay * (CFG.biomes[this.world.biome].hazardMult ?? 1);
    this._riftRaidTimer = CFG.riftRaid.firstDelay;
    this._stormWave = -1;
    this._stormTimer = 0;
    this._rift = null;
    this._huntTimer = 0;
    this.feast = { kind: null, wavesLeft: 0 };
    this._spirit = null;
    this._pet = null;
    this._meteorPending = null;
    this._crater = null;
    this._swampTimers = this.world.swampPits.map((_, i) => ({ phase: "dormant", timeLeft: CFG.swampPit.dormant * (0.3 + i * 0.3), tickTimer: 0 }));
    this._seenSwampPit = false;
    this._icePitTimers = this.world.icePits.map((_, i) => ({ phase: "dormant", timeLeft: CFG.icePit.dormant * (0.3 + i * 0.3), tickTimer: 0 }));
    this._seenIcePit = false;
    this.pickedBoons = {};
    this._riskArmed = false;
    this._riskWasActive = false;
    this.world.clearMeteor();
    this.world.clearCrater();
    this.world.clearSpirit();
    this.world.clearPet();
    this._treasureTimer = CFG.treasureEvent.firstDelay;
    this._treasureId = null;
    this._treasureLifeLeft = 0;
    this._scoutTimer = CFG.scoutEvent.firstDelay;
    this._scoutId = null;
    this._scoutLifeLeft = 0;
    this._nestTimer = CFG.nestEvent.firstDelay;
    this._merchant = null;
    this.tempBoon = { atk: 1, towerDmg: 1, speed: 1, harvest: 1, atkWavesLeft: 0, towerWavesLeft: 0, speedWavesLeft: 0, harvestWavesLeft: 0 };
    this._pingCd = 0;
    this.buildMode = null;
    this.paused = false;
    this.input.pressed.clear();
    this.input.keys.clear();
    this.running = true;
    this.result = null;
    if (!resumed) this._grantMetaPerks();
    this.sm.focus.set(this.local.x, 0, this.local.z);
    this.ui?.onGameStart(resumed);
  }
  // 🏕️ 원정 준비(로비의 영구 메타 업그레이드)를 판 시작 시 실제 플레이어 상태에 반영한다.
  // 호스트는 자기 자신의 플레이어 객체를 바로 고치면 그게 곧 다음 스냅샷의 근거가 되지만,
  // 참가자가 자기 로컬 상태만 고치면 호스트가 모르는 값이라 다음 스냅샷에 그대로 덮여 사라진다
  // — 그래서 참가자는 craft/upgrade 같은 다른 액션과 똑같이 호스트에게 요청만 보낸다.
  _grantMetaPerks() {
    const perks = computeMetaPerks();
    this._lastStandReady = !!perks.lastStand;
    if (perks.harvestLv <= 1 && perks.tools.length === 0 && perks.hpBonus <= 0 && !perks.startShard && !perks.startWood && !perks.startStone && !perks.startIron && !perks.outfitLv && !perks.weaponProficiencyLv) return;
    if (this.isHost) this._applyMetaPerks(this.local.id, perks);
    else this.net.send("metaPerks", perks);
  }
  _applyMetaPerks(playerId, perks) {
    const p2 = this.players.get(playerId);
    if (!p2) return;
    if (perks.harvestLv > p2.harvestLv) p2.harvestLv = perks.harvestLv;
    for (const k2 of perks.tools || []) p2.tools[k2] = true;
    if (perks.weaponProficiencyLv > p2.weaponProficiencyLv) p2.weaponProficiencyLv = perks.weaponProficiencyLv;
    if (p2.weaponProficiencyLv > 0) {
      for (const k2 of perks.tools || []) {
        if (CFG.weaponUpgrade.perLv[k2] && (p2.weaponLv[k2] || 0) < p2.weaponProficiencyLv) {
          p2.weaponLv[k2] = p2.weaponProficiencyLv;
          if (p2.weaponLv[k2] >= CFG.weaponUpgrade.maxLv) this._unlockAchievement("weaponMaster", playerId);
        }
      }
    }
    if (perks.hpBonus > 0) {
      p2.maxHp = CFG.player.hp + perks.hpBonus;
      p2.hp = p2.maxHp;
    }
    if (perks.startShard > 0) {
      const pool = this._poolOf(playerId);
      pool.shard = Math.max(pool.shard || 0, perks.startShard);
    }
    if (perks.startWood > 0 || perks.startStone > 0) {
      const pool = this._poolOf(playerId);
      if (perks.startWood > 0) pool.wood = Math.max(pool.wood || 0, perks.startWood);
      if (perks.startStone > 0) pool.stone = Math.max(pool.stone || 0, perks.startStone);
    }
    if (perks.startIron > 0) {
      const pool = this._poolOf(playerId);
      pool.iron = Math.max(pool.iron || 0, perks.startIron);
    }
    if (perks.outfitLv > p2.outfitLv) p2.outfitLv = perks.outfitLv;
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
    if (!this.pools.byId[id]) this.pools.byId[id] = { wood: this.difficultyPreset.startWood, stone: this.difficultyPreset.startStone, iron: 0, copper: 0, coal: 0, shard: 0, meat: { rabbit: 0, deer: 0, boar: 0 }, ammo: { ...CFG.ammo.start } };
    return this.pools.byId[id];
  }
  get myPool() {
    return this._poolOf(this.local.id);
  }
  // 구버전 저장(탄약 시스템 이전)에는 이 칸이 없다 — 읽는 쪽에서 조용히 만들어 준다.
  // 생고기(pool.meat)가 쓰는 것과 정확히 같은 지연 초기화 패턴이다.
  _ammoOf(pool) {
    if (!pool.ammo) pool.ammo = { ...CFG.ammo.start };
    return pool.ammo;
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
      const sniperSynergy = b.key === "sniper" && this.buildMgr.hasNearbyPoison(b);
      const mu2 = CFG.crystalUpgrade.materiel;
      const materielMult = this.world.crystal.materielLv > 0 && dist(b.x, b.z, 0, 0) <= mu2.radius ? 1 + mu2.dmgMultPerLv * this.world.crystal.materielLv : 1;
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
          if (sniperSynergy && now < e.poisonUntil) base *= 1 + CFG.synergy.sniperVenom.dmgMult;
          if (wasRooted) {
            base *= 1 + CFG.synergy.rootSnare.dmgMult;
            if (!this._seenRootSynergy) {
              this._seenRootSynergy = true;
              this.ui?.toast("🕸️⚔️ 시너지 발동! 묶인 적을 다른 타워가 맞추면 추가 피해", "good");
            }
          }
          const from = i === 0 ? pos : hitChain[i - 1];
          this._hurtEnemy(e, Math.round(base * this.boonMult.towerDmg * this.tempBoon.towerDmg * materielMult), "tower", from.x, from.z);
          if (i > 0) this.fx.burst(e.x, 1, e.z, 16769126, 8, 3);
        });
        if (hitChain.length > 1 && !this._seenChain) {
          this._seenChain = true;
          this.ui?.toast("🌩️ 연쇄 적중! 명중한 적에서 가까운 다른 적으로 튀어 옮겨붙는다 — 뭉친 무리에 특히 강하다", "good");
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
        if (sniperSynergy && now < e.poisonUntil) base *= 1 + CFG.synergy.sniperVenom.dmgMult;
        if (wasRooted) {
          base *= 1 + CFG.synergy.rootSnare.dmgMult;
          if (!this._seenRootSynergy) {
            this._seenRootSynergy = true;
            this.ui?.toast("🕸️⚔️ 시너지 발동! 묶인 적을 다른 타워가 맞추면 추가 피해", "good");
          }
        }
        this._hurtEnemy(e, Math.round(base * this.boonMult.towerDmg * this.tempBoon.towerDmg * materielMult), b.key === "frost" ? "frost" : "tower", b.x, b.z);
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
      } else if (kind === "siphon") {
        this.ui?.toast(`${nm}가 정수를 노린다 — 정수가 없으면 회복도 없다!`, "warn");
        this.sfx.bossWaveStart();
      } else if (kind === "fortify") {
        this.ui?.toast(`${nm}가 방벽을 두를 준비를 한다 — 발동하면 받는 피해가 크게 줄어든다!`, "warn");
        this.sfx.bossWaveStart();
      } else if (kind === "fortifyGo") {
        this.ui?.toast(`🗿 무쇠 방벽 발동! 잠시 받는 피해가 크게 줄었다 — 무리해서 쏟아붓지 말고 다음 국면을 준비하자`, "bad");
        this.fx.ring(e.x, e.z, 8945076, 5);
      } else if (kind === "blink") {
        this.ui?.toast(`${nm}가 바람이 되어 흩어지려 한다 — 어디로 튈지 모른다!`, "warn");
        this.sfx.bossWaveStart();
      } else if (kind === "blinkGo") {
        this.ui?.toast(`🌪️ ${nm}가 크리스탈 코앞으로 순간이동했다! 벽으로 만든 길을 그대로 건너뛰었다`, "bad");
        this.fx.ring(e.x, e.z, 10217727, CFG.bossPattern.blinkRadius);
      } else if (kind === "curse") {
        this.ui?.toast(`${nm}가 저주를 준비한다 — 방어선 어딘가의 타워 하나가 봉인될 것이다!`, "warn");
        this.sfx.bossWaveStart();
      } else if (kind === "pull") {
        this.ui?.toast(`${nm}가 인력을 모은다 — 근처에 있으면 끌려간다, 지금 거리를 벌리거나 회피할 준비를 하라!`, "warn");
        this.sfx.bossWaveStart();
      } else if (kind === "blind") {
        this.ui?.toast(`${nm}가 어둠을 모은다 — 곧 미니맵에서 몬스터가 안 보이게 된다!`, "warn");
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
      this.ui?.toast("🔱 탐지 범위가 파묻힌 굴착병을 찾아냈다! 반경 안 타워가 조준할 수 있다 (보루 Lv.2 이상)", "good");
    };
    this.buildMgr.onAmmoEmpty = (b) => {
      const a2 = CFG.ammo.types[b.ammoType];
      if (this._seenAmmoEmpty) return;
      this._seenAmmoEmpty = true;
      this.ui?.toast(`${a2.icon} ${b.def.name}의 ${a2.name}이(가) 떨어졌다! 피해가 크게 준다 — 가까이 가서 재장전(${keyLabel(this.km.get("reload"))})하거나 🏭 병기창을 지어 자동 보급하자`, "bad");
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
    this.enemyMgr.onBossSiphon = (e) => {
      if (!this.isHost) return;
      const c2 = CFG.bossPattern;
      let drained = 0, maxPossible = 0;
      if (this.shared) {
        const d2 = Math.min(this.pools.team.shard || 0, c2.siphonShard);
        this.pools.team.shard -= d2;
        drained = d2;
        maxPossible = c2.siphonShard;
      } else {
        for (const p2 of this.players.values()) {
          const pool = this._poolOf(p2.id);
          const d2 = Math.min(pool.shard || 0, c2.siphonShard);
          pool.shard -= d2;
          drained += d2;
          maxPossible += c2.siphonShard;
        }
      }
      const heal = Math.round(e.maxHp * c2.siphonHealPct * (maxPossible ? drained / maxPossible : 0));
      e.hp = Math.min(e.maxHp, e.hp + heal);
      this.fx.float(drained ? `-${drained}💠` : "무효!", e.x, e.st.scale * 1.6 + 0.6, e.z, drained ? "bad" : "good");
      this.fx.burst(e.x, 1.6, e.z, 9321645, 18, 6);
      this.ui?.toast(drained ? `🌘 정수 포식자가 정수 ${drained}개를 삼켜 체력을 회복했다!` : "🌘 정수 포식자가 정수를 노렸지만 훔칠 게 없었다 — 회복 실패!", drained ? "bad" : "good");
    };
    this.enemyMgr.onBossBlink = (e) => {
      if (!this.isHost) return;
      const c2 = CFG.bossPattern;
      for (const p2 of this.players.values()) {
        if (dist(p2.x, p2.z, e.x, e.z) <= c2.blinkRadius) {
          if (p2.id === this.local.id) this._hurtLocal(c2.blinkDmg);
          else this.net.send("hurt", { to: p2.id, dmg: c2.blinkDmg });
        }
      }
      if (!this._seenGaleBlink) {
        this._seenGaleBlink = true;
        this.ui?.toast("🌪️ 질풍 군주는 순간이동으로 벽 미로를 그대로 건너뛴다 — 크리스탈 바로 옆도 반드시 지켜라", "warn");
      }
    };
    this.enemyMgr.onBossCurse = (e) => {
      if (!this.isHost) return;
      const c2 = CFG.bossPattern;
      const towers = [...this.buildMgr.buildings.values()].filter((b) => b.isTower);
      if (!towers.length) {
        this.ui?.toast("🔮 저주의 군주가 저주를 걸려 했지만 봉인할 타워가 없다!", "good");
        this.fx.burst(e.x, 1.6, e.z, 10181046, 18, 6);
        return;
      }
      const target = towers[Math.floor(Math.random() * towers.length)];
      target.curseUntil = performance.now() / 1e3 + c2.curseTime;
      this.fx.burst(target.x, 1.4, target.z, 10181046, 18, 6);
      this.fx.ring(target.x, target.z, 10181046, 2);
      this.ui?.toast(`🔮 ${target.def.name}이(가) 저주에 걸렸다! ${c2.curseTime}초간 멈춘다 — 다른 타워로 그 자리를 메워야 한다`, "bad");
      if (!this._seenCurse) {
        this._seenCurse = true;
        this.ui?.toast("🔮 저주의 군주는 위치와 무관하게 방어선 어딘가의 타워 하나를 직접 봉인한다 — 화력을 몰아 지으면 그만큼 한 번에 잃는다", "warn");
      }
    };
    this.enemyMgr.onBossPull = (e) => {
      if (!this.isHost) return;
      const c2 = CFG.bossPattern;
      let pulled = 0;
      for (const p2 of this.players.values()) {
        if (!p2.alive || p2.invulnerable) continue;
        const d2 = dist(p2.x, p2.z, e.x, e.z);
        if (d2 > c2.pullRadius || d2 <= c2.pullMinDist) continue;
        const newDist = Math.max(c2.pullMinDist, d2 - c2.pullDist);
        const nx = e.x + (p2.x - e.x) / d2 * newDist;
        const nz = e.z + (p2.z - e.z) / d2 * newDist;
        this.fx.burst(p2.x, 1.2, p2.z, 12592851, 12, 5);
        if (p2.id === this.local.id) {
          this.local.x = nx;
          this.local.z = nz;
          this.local._collide(this.grid, this.world);
        } else {
          this.net.send("pull", { to: p2.id, x: nx, z: nz });
        }
        this.fx.burst(nx, 1.2, nz, 12592851, 8, 4);
        pulled++;
      }
      if (pulled) {
        this.ui?.toast(`🧲 자성 군주의 인력에 ${pulled}명이 끌려갔다! 근접 사거리 안이니 지금 위험하다`, "bad");
      } else {
        this.ui?.toast("🧲 자성 군주가 인력을 터뜨렸지만 아무도 반경 안에 없었다", "good");
      }
      if (!this._seenPull) {
        this._seenPull = true;
        this.ui?.toast("🧲 자성 군주의 인력은 미리 반경 밖으로 벌어져 있거나, 발동 직전에 회피 돌진(V)으로 무적 상태면 피할 수 있다", "warn");
      }
    };
    this.enemyMgr.onBossBlind = (e) => {
      if (!this.isHost) return;
      const c2 = CFG.bossPattern;
      const until = performance.now() / 1e3 + c2.blindDuration;
      let blinded = 0;
      for (const p2 of this.players.values()) {
        if (!p2.alive) continue;
        if (dist(p2.x, p2.z, e.x, e.z) > c2.blindRadius) continue;
        if (p2.id === this.local.id) this.local.blindUntil = until;
        else this.net.send("blind", { to: p2.id, dur: c2.blindDuration });
        blinded++;
      }
      this.fx.burst(e.x, 1.8, e.z, 3355443, 20, 7);
      if (blinded) {
        this.ui?.toast(`🌑 칠흑 군주의 어둠에 ${blinded}명이 휩싸였다! ${c2.blindDuration}초간 미니맵에서 몬스터가 안 보인다`, "bad");
      } else {
        this.ui?.toast("🌑 칠흑 군주가 어둠을 터뜨렸지만 아무도 반경 안에 없었다", "good");
      }
      if (!this._seenBlind) {
        this._seenBlind = true;
        this.ui?.toast("🌑 칠흑 군주는 피해도 이동 강제도 없다 — 대신 어디서 적이 오는지 잠깐 보이지 않게 된다", "warn");
      }
    };
    this.enemyMgr.onBossWeb = (e) => {
      if (!this.isHost) return;
      const c2 = CFG.bossPattern;
      const until = performance.now() / 1e3 + c2.webDuration;
      let webbed = 0;
      for (const p2 of this.players.values()) {
        if (!p2.alive || p2.invulnerable) continue;
        if (dist(p2.x, p2.z, e.x, e.z) > c2.webRadius) continue;
        if (p2.id === this.local.id) this.local.rootedUntil = until;
        else this.net.send("root", { to: p2.id, dur: c2.webDuration });
        webbed++;
      }
      this.fx.burst(e.x, 1.8, e.z, 11163118, 20, 7);
      if (webbed) {
        this.ui?.toast(`🕸️ 속박 군주의 거미줄에 ${webbed}명이 걸렸다! ${c2.webDuration}초간 움직일 수 없다(공격·채집은 그대로)`, "bad");
      } else {
        this.ui?.toast("🕸️ 속박 군주가 거미줄을 뿌렸지만 아무도 반경 안에 없었다", "good");
      }
      if (!this._seenWeb) {
        this._seenWeb = true;
        this.ui?.toast("🕸️ 속박 군주의 거미줄은 미리 반경 밖으로 벌어져 있거나, 발동 직전에 회피 돌진(V)으로 무적 상태면 피할 수 있다 — 걸려도 제자리에서 계속 싸울 수는 있다", "warn");
      }
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
      this.fx.ring(e.x, e.z, 3390720, e.st.healAura.radius);
    };
    this.enemyMgr.onRallyPulse = (e) => {
      this.fx.ring(e.x, e.z, 16751001, CFG.enemies.commander.rallyAura.radius);
      this.fx.burst(e.x, 1.4, e.z, 16751001, 10, 4);
    };
    this.enemyMgr.onBerserk = (e) => {
      this.fx.burst(e.x, 1.3, e.z, 16729156, 12, 5);
      this.fx.ring(e.x, e.z, 16729156, 2);
    };
    this.enemyMgr.onBossEnrage = (e) => {
      const nm = `${CFG.enemies[e.type]?.icon || "💀"} ${CFG.enemies[e.type]?.name || "보스"}`;
      this.ui?.toast(`🔥 ${nm}가 최후의 발악에 들어갔다! 더 빠르고 세지니 지금 몰아붙여 끝내라`, "bad");
      this.fx.burst(e.x, 1.5, e.z, 16729156, 20, 6);
      this.sfx.bossWaveStart();
    };
    this.enemyMgr.onSpawn = (e) => {
      if (markBestiarySeen(e.type)) {
        if (!BESTIARY_ANNOUNCED_ELSEWHERE.has(e.type)) {
          this.ui?.toast(`📖 도감에 새로 기록됨: ${CFG.enemies[e.type].icon} ${CFG.enemies[e.type].name}`, "good");
        }
        this._checkBestiaryComplete();
      }
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
      if (!e.variant) return;
      if (markBestiarySeen(e.variant)) this._checkBestiaryComplete();
      if (this._seenVariants.has(e.variant)) return;
      this._seenVariants.add(e.variant);
      const v = CFG.variants[e.variant];
      const HINTS = {
        shield: "정면 공격은 약해진다 — 등 뒤로 돌아가서 쳐라",
        split: "죽으면 약한 개체 2마리로 갈라진다",
        dash: "가끔 폭발적으로 빨라진다",
        regen: "잠시라도 안 때리면 체력이 도로 차오른다 — 끝까지 몰아쳐라",
        ward: "타워가 조준하지 못한다 — 직접 달려가서 근접이나 스킬로 처치해야 한다",
        thorn: "근접으로 때리면 준 피해의 일부를 그대로 돌려받는다 — 무기 강화가 잘 됐을수록 반사도 세진다",
        vampire: "크리스탈·건물·플레이어를 때릴 때마다 그 피해의 일부를 체력으로 되돌린다 — 놔두면 계속 회복하니 최우선으로 끊어야 한다",
        resist: "둔화·속박·중독을 전부 무시한다 — 서리탑·독탑·얼음도끼가 안 통하니 순수 대미지로 밀어붙여야 한다",
        berserk: "체력이 절반 밑으로 떨어지는 순간 갑자기 훨씬 빠르고 강해진다 — 절반만 깎아놓고 다른 놈부터 잡으러 가면 위험하다, 끝까지 몰아붙이거나 처음부터 피해라",
        armored: "타워 공격이 크게 약해진다 — 근접·활·폭탄가방·정수 스킬은 그대로 통하니 직접 뛰어들어야 한다",
        phantom: "직접 조준한 근접·활·폭탄가방 공격이 크게 약해진다 — 타워·정수 스킬에 맡겨야 한다"
      };
      const hint = HINTS[e.variant] || "";
      this.ui?.toast(`${v.icon} ${v.name} 변종 등장! ${hint}`, "warn");
    };
    this.buildMgr.onSynergy = (kind) => {
      if (kind === "sniperVenom") {
        if (this._seenSniperSynergy) return;
        this._seenSniperSynergy = true;
        this.ui?.toast("🎯☠️ 시너지 발동! 독탑 근처 저격탑이 중독된 적에게 추가 피해를 준다", "good");
        return;
      }
      if (kind === "cannonCluster") {
        if (this._seenCannonSynergy) return;
        this._seenCannonSynergy = true;
        this.ui?.toast("💣💣 시너지 발동! 가까이 모인 대포탑끼리 폭발 반경이 넓어진다", "good");
        return;
      }
      if (this._seenSynergy) return;
      this._seenSynergy = true;
      const msg = kind === "frostArrow" ? "🧊🏹 시너지 발동! 서리탑 근처 화살탑이 둔화된 적에게 추가 피해를 준다" : "☠️☠️ 시너지 발동! 가까이 모인 독탑끼리 독 피해가 강해진다";
      this.ui?.toast(msg, "good");
    };
    this.enemyMgr.onCrystalHit = (e) => {
      const hpBefore = this.world.crystal.hp;
      const dead = this.world.damageCrystal(e.st.dmg);
      const appliedDmg = hpBefore - this.world.crystal.hp;
      if (appliedDmg > 0 && this._bossActive) this._bossWaveDamaged = true;
      if (appliedDmg > 0) {
        this.fx.burst(0, 3.2, 0, 6545663, 10, 5);
        this.fx.float(`-${appliedDmg}`, 0, 4.4, 0, "crystal");
        this.ui?.shake();
        this.sfx.crystalHit();
      }
      this._variantLeech(e, appliedDmg);
      const rlv = this.world.crystal.reflectLv;
      if (this.isHost && rlv > 0) {
        const reflectDmg = Math.round(appliedDmg * CFG.crystalUpgrade.reflect.pctPerLv * rlv);
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
      if (b.key === "decoy" && !this._seenDecoyLure) {
        this._seenDecoyLure = true;
        this.ui?.toast("📯 미끼가 통했다! 몬스터가 크리스탈 대신 유인목을 물고 있다", "good");
      }
      if (b.key === "beacon" && !this._seenBeaconLure) {
        this._seenBeaconLure = true;
        this.ui?.toast("🏮 봉화대가 통했다! 비행 몬스터가 크리스탈 대신 봉화대를 노리고 있다", "good");
      }
      if (destroyed) {
        this.fx.burst(b.x, 1.2, b.z, 8947848, 16, 6);
        if (b.key === "outpost") {
          this.ui?.toast("🚩 전초기지가 파괴됐다! 그 주위 건설 구역이 사라집니다 (이미 지은 건물은 남습니다)", "bad");
          if (this.net.online) this.net.send("outpostLost", {});
        } else if (b.key === "decoy") {
          this.ui?.toast("📯 허수아비 유인목이 파괴됐다! 묶여 있던 몬스터가 다시 크리스탈로 향한다", "bad");
          if (this.net.online) this.net.send("decoyLost", {});
        } else if (b.key === "beacon") {
          this.ui?.toast("🏮 봉화대가 파괴됐다! 이끌리던 비행 몬스터가 다시 크리스탈로 향한다", "bad");
          if (this.net.online) this.net.send("beaconLost", {});
        }
        this.buildMgr.remove(b.id);
      }
    };
    this.enemyMgr.onNodeSteal = (e, node) => {
      const y = CFG.harvest[node.type].yield;
      this.world.consumeNode(node);
      e._loot = e._loot || {};
      e._loot[node.type] = (e._loot[node.type] || 0) + y;
      const color = node.type === "tree" ? 5979428 : 9146266;
      this.fx.burst(node.x, 1, node.z, color, 10, 4);
      this.sfx.harvestDone(node.type);
    };
    this.enemyMgr.onPlayerHit = (e, p2) => {
      const now = performance.now() / 1e3;
      const parried = p2.blocking && now - (p2._blockStartAt ?? -99) <= CFG.player.parryWindow;
      const base = parried ? 0 : p2.blocking ? e.st.dmg * (1 - p2.blockStats.mitigation) : e.st.dmg;
      const dmg = Math.round(base * this.feastArmorMult * (1 - p2.outfitStats.reduce));
      if (p2.id === this.local.id) this._hurtLocal(dmg);
      else this.net.send("hurt", { to: p2.id, dmg });
      this._variantLeech(e, dmg);
      if (this.feastGuardPct > 0 && !e.dead) {
        const reflectDmg = Math.round(dmg * this.feastGuardPct);
        if (reflectDmg > 0) {
          this._hurtEnemy(e, reflectDmg, "player", p2.x, p2.z);
          if (!this._seenFoxGuard) {
            this._seenFoxGuard = true;
            this.ui?.toast("🍲 여우 스튜 효과로 공격자에게 피해를 반사했다!", "good");
          }
        }
      }
      if (parried && !e.dead) {
        e.applySlow(CFG.player.parrySlow, CFG.player.parrySlowTime, now);
        this.fx.ring(p2.x, p2.z, 16766720, 2.2);
        this.sfx.shard();
        this.stats.parryCount = (this.stats.parryCount || 0) + 1;
        if (this.stats.parryCount >= 5) this._unlockAchievement("perfectParry");
        if (p2.id === this.local.id && !this._seenParry) {
          this._seenParry = true;
          this.ui?.toast("✨ 완벽한 방어! 맞기 직전에 막기를 누르면 피해를 전부 막고 적을 크게 둔화시킨다", "good");
        }
      }
      if (p2.blocking) {
        if (p2.id === this.local.id && !this._seenBlock && !parried) {
          this._seenBlock = true;
          this.ui?.toast("🛡️ 막기로 피해를 크게 줄였다 — 대신 거의 못 움직이고 공격도 못 한다", "good");
        }
        this.stats.blocksCount = (this.stats.blocksCount || 0) + 1;
        if (this.stats.blocksCount >= 10) this._unlockAchievement("blockMaster");
      }
    };
    this.wave.onWaveStart = (w2, total) => {
      this._clearWildlife();
      const rc = CFG.risk;
      this._riskWasActive = this._riskArmed;
      CFG.wave.riskHpMult = this._riskArmed ? rc.hpMult : 1;
      CFG.wave.riskDmgMult = this._riskArmed ? rc.dmgMult : 1;
      if (this._riskArmed) this.ui?.toast(`⚠️ 위험 계약 발동! 이번 웨이브 몬스터가 더 강하다 — 대신 보상도 커진다`, "warn");
      this._riskArmed = false;
      this.ui?.toast(this._waveStartLabel(w2, total), "warn");
      const wKind = weatherOf(w2);
      if (wKind && !this.stats.weathersSeen.includes(wKind)) {
        this.stats.weathersSeen.push(wKind);
        if (this.stats.weathersSeen.length >= Object.keys(WEATHER).length) this._unlockAchievement("weatherSage");
      }
      const bossEntries = bossEntriesOf(w2);
      this.fx.ring(0, 0, 16734834, 10);
      if (bossEntries.length) this.sfx.bossWaveStart();
      else this.sfx.waveStart();
      if (bossEntries.length >= 2 && !this._seenTwinBoss) {
        this._seenTwinBoss = true;
        this.ui?.toast(`⚠️⚠️ ${BOSS_CYCLE.length}종 보스를 한 바퀴 다 돌았다! 이제부터 보스 웨이브에 보스가 둘씩 나온다 — 보상은 평소 보스 웨이브와 같으니, 더 위험해진 만큼 방어선을 그만큼 더 단단히 준비해야 한다`, "warn");
      }
      if (this.isHost) {
        this._bossActive = bossEntries.length > 0;
        this._bossWaveDamaged = false;
      }
    };
    this.wave.onWaveClear = (w2, reward, won) => {
      if (this._riskWasActive) {
        const rc = CFG.risk;
        reward.wood = Math.round(reward.wood * rc.rewardMult);
        reward.stone = Math.round(reward.stone * rc.rewardMult);
        if (reward.shard) reward.shard = Math.round(reward.shard * rc.rewardMult);
        this._riskWasActive = false;
        this._unlockAchievement("gambler");
        this.stats.riskWavesCleared = (this.stats.riskWavesCleared || 0) + 1;
      }
      if (this.boonMult.shardBonus && reward.shard) reward.shard += this.boonMult.shardBonus;
      if (this.isHost) this._grantReward(reward);
      this.ui?.toast(won ? "마지막 웨이브 격퇴!" : `웨이브 ${w2} 클리어! 보상 🪵${reward.wood} 🪨${reward.stone}${reward.shard ? ` 💠${reward.shard}` : ""}`, "good");
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
    if (w2 >= 5 && !this.stats.everBuiltWall) this._unlockAchievement("noWall");
    if (w2 >= 3 && !this.stats.everBuiltTower) {
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
    if (this.net.online) this.net.send("boonOffer", { keys: this.pendingBoon, trigger });
  }
  pickBoon(key) {
    if (!this.pendingBoon || !this.pendingBoon.includes(key)) return;
    if (!this.isHost) {
      this.net.send("pickBoon", { key });
      this.pendingBoon = null;
      this.pendingBoonTrigger = null;
      this.ui?.hideBoonChoice();
      return;
    }
    const b = CFG.boons[key];
    if (b.kind === "mult") this.boonMult[b.key] *= b.value;
    else if (b.kind === "delta") this.boonMult[b.key] += b.value;
    else if (b.kind === "instant" && key === "aid") this.world.healCrystal(300);
    else if (b.kind === "instantPct") this.world.healCrystal(Math.round(this.world.crystal.maxHp * b.value));
    else if (b.kind === "maxHp") {
      this.world.crystal.maxHp += b.value;
      this.world.crystal.hp += b.value;
    } else if (b.kind === "trickle") this._shardTrickleStacks = (this._shardTrickleStacks || 0) + b.value;
    else if (b.kind === "risky") {
      this.boonMult[b.key] *= b.value;
      const c2 = this.world.crystal;
      c2.maxHp = Math.max(50, c2.maxHp - b.hpCost);
      c2.hp = Math.min(c2.hp, c2.maxHp);
    } else if (b.kind === "prepDelta") {
      this.boonMult.prepDelta += b.value;
      this.wave.prepBonus = this.boonMult.prepDelta;
    } else if (b.kind === "venom") this.boonMult.venomChance = Math.min(0.6, this.boonMult.venomChance + b.value);
    else if (b.kind === "desperationBonus") this.boonMult.desperationBonus += b.value;
    this.pickedBoons[key] = (this.pickedBoons[key] || 0) + 1;
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
    if (t2.speedWavesLeft > 0 && --t2.speedWavesLeft <= 0) t2.speed = 1;
    if (t2.harvestWavesLeft > 0 && --t2.harvestWavesLeft <= 0) t2.harvest = 1;
    this._decayFeast();
  }
  // 떠돌이 상인: 웨이브 클리어 직후(호스트에서만) 확률적으로 등장해, 이번 준비 시간에만
  // 무작위 품목 2개를 판다. 다음 웨이브가 시작되면(_updateMerchant) 자동으로 사라진다.
  // 🌙 다음 웨이브가 밤 웨이브면(7웨이브마다) 확률과 무관하게 반드시 등장하고, night:true로
  // 표시된 밤 전용 품목(moonBundle)이 한 자리를 차지한다 — 평소 무작위 풀에서는 그 품목을
  // 빼서 밤이 아닐 때 우연히 뜨는 일이 없게 한다.
  _maybeSpawnMerchant(clearedWave) {
    const c2 = CFG.merchant;
    const isNight = (clearedWave + 1) % CFG.wave.nightEvery === 0;
    if (!isNight && (clearedWave < c2.minWave || Math.random() >= c2.chance)) {
      this._merchant = null;
      return;
    }
    const nightKey = Object.keys(c2.pool).find((k2) => c2.pool[k2].night);
    const keys = Object.keys(c2.pool).filter((k2) => !c2.pool[k2].night);
    const offers = isNight && nightKey ? [nightKey] : [];
    for (let i = offers.length; i < c2.offerCount && keys.length; i++) {
      offers.push(keys.splice(Math.floor(Math.random() * keys.length), 1)[0]);
    }
    this._merchant = { offers, boughtBy: {} };
    if (isNight) {
      this.ui?.toast("🌙🧳 달빛 상인이 왔다! 밤에만 파는 특별한 물건이 있다", "good");
    } else {
      this.ui?.toast("🧳 떠돌이 상인이 왔다! 이번 준비 시간에만 물건을 판다", "good");
    }
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
    const customMsg = this._applyMerchantEffect(playerId, o);
    this._notify(playerId, customMsg || `${o.icon} ${o.name} 구매! ${o.desc}`, "good");
    if (playerId === this.local.id) this.sfx.upgrade();
  }
  _applyMerchantEffect(playerId, o) {
    if (o.kind === "heal") {
      this.world.healCrystal(o.value);
    } else if (o.kind === "tempAtk") {
      this.tempBoon.atk = Math.max(this.tempBoon.atk, o.value);
      this.tempBoon.atkWavesLeft = 1;
    } else if (o.kind === "tempTower") {
      this.tempBoon.towerDmg = Math.max(this.tempBoon.towerDmg, o.value);
      this.tempBoon.towerWavesLeft = 1;
    } else if (o.kind === "tempSpeed") {
      this.tempBoon.speed = Math.max(this.tempBoon.speed, o.value);
      this.tempBoon.speedWavesLeft = 1;
    } else if (o.kind === "tempHarvest") {
      this.tempBoon.harvest = Math.min(this.tempBoon.harvest, o.value);
      this.tempBoon.harvestWavesLeft = 1;
    } else if (o.kind === "shard" || o.kind === "iron") {
      const pool = this._poolOf(playerId);
      pool[o.kind] = (pool[o.kind] || 0) + o.value;
    } else if (o.kind === "repairAll") {
      for (const b of this.buildMgr.buildings.values()) {
        if (b.hp >= b.maxHp) continue;
        b.hp = b.maxHp;
        b.refreshBar();
      }
    } else if (o.kind === "mystery") {
      return this._applyMysteryBox(playerId);
    } else if (o.kind === "ammoBox") {
      const stock = this._ammoOf(this._poolOf(playerId));
      for (const type of Object.keys(o.value)) stock[type] = (stock[type] || 0) + o.value[type];
    }
  }
  // 다른 7개 품목과 달리 결과를 미리 알 수 없다 — 세 결과지 중 하나를 그 자리에서 굴려서
  // 적용하고, 실제로 무엇이 나왔는지는 반환하는 메시지로만 알려준다(구매 버튼의 desc는
  // 일부러 결과를 밝히지 않는다).
  _applyMysteryBox(playerId) {
    const r = Math.random();
    if (r < 0.4) {
      this.world.healCrystal(20);
      return "🎁 꽝... 그래도 크리스탈 체력을 20 회복했다";
    }
    if (r < 0.75) {
      const pool = this._poolOf(playerId);
      pool.wood = (pool.wood || 0) + 80;
      pool.stone = (pool.stone || 0) + 80;
      return "🎁 행운! 목재 80 · 광물 80을 두둑하게 챙겼다";
    }
    this.tempBoon.atk = Math.max(this.tempBoon.atk, 1.5);
    this.tempBoon.atkWavesLeft = 1;
    this.tempBoon.towerDmg = Math.max(this.tempBoon.towerDmg, 1.5);
    this.tempBoon.towerWavesLeft = 1;
    this._unlockAchievement("jackpot", playerId);
    return "🎁 대박!! 다음 웨이브 동안 근접·타워 공격력이 모두 +50%!";
  }
  // playerId 를 넘기면 그 사람의 개인 행동에 대한 업적이라는 뜻 — 호스트가 참가자 대신 처리하는
  // 액션(스킬 사용 등)에서 이걸 안 넘기면, 실제로는 참가자가 한 행동인데 호스트 자신의 브라우저에
  // 업적이 잘못 붙는 사고가 난다(호스트만 _unlockAchievement 를 실행하기 때문). 팀 단위 업적(보스
  // 처치, 웨이브 클리어 조건 등)은 그대로 playerId 없이 호출한다.
  // playerId 가 자기 자신이 아니면(호스트가 참가자를 대신 처리한 경우) 여기서 끝내지 않고
  // "unlockAch" 로 그 참가자에게 전달한다 — 원래는 조용히 return만 해서 아무도(호스트도
  // 참가자도) 실제로 업적을 못 받았다(weaponMaster·skillUser가 참가자 쪽에서는 절대 안 뜨는
  // 버그였다). _notify 와 정확히 같은 "본인이면 로컬 처리, 아니면 net.send" 배관을 재사용했다.
  // 도감 항목(몬스터·보스·변종·야생 동물)을 전부 기록했는지 확인한다. markBestiarySeen()이 새
  // 항목을 기록한 직후에만 호출되므로(중복 호출 없음), 마지막 한 칸을 채운 바로 그 순간 조용히
  // 켜진다.
  _checkBestiaryComplete() {
    const seen = loadBestiarySeen();
    if (Object.keys(seen).length >= Object.keys(BESTIARY_INFO).length) {
      this._unlockAchievement("bestiaryComplete");
    }
  }
  // 승리 시점에만 의미가 있다 — 기존 업적은 전부 "누가 제일 세게 때렸나"(dmgByPlayer 1등)만
  // 봤을 뿐, "다 같이 싸웠나"는 아무도 안 물었다. killsByPlayer(방금 추가한 결과 화면 개인별
  // 집계와 같은 데이터)를 재사용해 참가자 전원이 최소 한 마리씩은 직접 처치했는지만 확인한다 —
  // 한 명이 다 잡고 나머지는 채집만 해도 이기는 판이 많은데, 이건 그 반대(고르게 기여한 판)를
  // 알아본다.
  _checkTeamEffort() {
    if (this.players.size < 2) return;
    const kb = this.stats.killsByPlayer || {};
    if ([...this.players.keys()].every((id) => (kb[id] || 0) > 0)) {
      this._unlockAchievement("teamEffort");
    }
  }
  _unlockAchievement(key, playerId) {
    if (playerId !== void 0 && playerId !== this.local.id) {
      this.net.send("unlockAch", { to: playerId, key });
      return;
    }
    if (!unlock(key)) return;
    const a = ACHIEVEMENTS[key];
    this.stats.newAchievements.push(key);
    this.ui?.toast(`🏆 업적 달성! ${a.icon} ${a.name} — ${a.desc}`, "good");
    this.sfx.upgrade();
    if (this.net.online) this.net.send("achAnnounce", { name: this.local.name, icon: a.icon, title: a.name });
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
    const now = performance.now() / 1e3;
    if (st.blastRadius) {
      for (const e2 of this.enemyMgr.list) {
        if (e2.dead || e2.st.flies || e2.st.wild) continue;
        if (dist(b.x, b.z, e2.x, e2.z) <= st.blastRadius) {
          this._hurtEnemy(e2, st.dmg, "tower", b.x, b.z);
        }
      }
      this.fx.burst(b.x, 0.5, b.z, 16750899, 26, st.blastRadius);
      this.fx.ring(b.x, b.z, 16750899, st.blastRadius);
    } else {
      this._hurtEnemy(e, st.dmg, "tower", b.x, b.z);
      if (st.slow) e.applySlow(st.slow, st.slowTime, now);
      if (st.root) e.applyRoot(st.root, now);
      this.fx.burst(b.x, 0.5, b.z, 14238251, 16, 5);
      this.fx.ring(b.x, b.z, 14238251, 2.2);
    }
    this.sfx.buildingHit();
    this.buildMgr.remove(b.id);
    this.stats.trapsTriggered = (this.stats.trapsTriggered || 0) + 1;
    if (this.stats.trapsTriggered >= 3) this._unlockAchievement("trapMaster");
    if (b.key === "mire") {
      if (!this._seenMire) {
        this._seenMire = true;
        this.ui?.toast("🥾 수렁 함정 발동! 피해는 적지만 완전히 묶어 세웠다 — 묶인 적을 다른 공격으로 마무리하면 추가 피해가 붙는다", "good");
      }
    } else if (b.key === "blast") {
      if (!this._seenBlast) {
        this._seenBlast = true;
        this.ui?.toast("🧨 폭발 함정 발동! 반경 안 적 전부에게 피해를 주고 사라졌다 — 뭉쳐서 오는 무리에 강하다", "good");
      }
    } else if (!this._seenTrap) {
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
    const hazardMult = CFG.biomes[this.world.biome].hazardMult ?? 1;
    this._meteorTimer = (c2.minGap + Math.random() * (c2.maxGap - c2.minGap)) * hazardMult;
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
    if (this.world.biome === "volcano") {
      this._crater = { x, z, timeLeft: c2.craterDuration, tickTimer: 0 };
      this.world.setCrater(x, z, c2.craterDuration, c2.craterRadius);
    }
  }
  // 🌀 균열 습격: 전투 중(6웨이브부터) 가끔 방어선 안쪽 아무 데서나 예고 없이 적 몇 마리가
  // 바로 나타난다 — 운석과 달리 사전 경고 링이 없다(포탈 봉쇄로 아무리 방향을 관리해도 완전히
  // 안전한 판은 없다는 게 이 이벤트의 핵심이라, 미리 피할 수 있게 하면 그 긴장이 사라진다).
  // 웨이브 큐(waveComposition)와 무관하게 얹히는 보너스 개체라 aliveInWave가 그만큼 늘어
  // 웨이브 클리어 판정도 이 적들까지 처치해야 넘어간다(미믹과 같은 방식 — event 플래그가 없어
  // 정상적으로 카운트된다). 호스트 전용(다른 전투 이벤트와 동일) — 스폰된 개체 자체는 기존
  // enemyMgr 스냅샷으로 참가자 화면에도 그대로 나타나고, 순간적인 경고 이펙트만 별도 메시지로
  // 알린다(meteor처럼 지속되는 상태가 아니라 새 스냅샷 필드가 필요 없다).
  _updateRiftRaid(dt2) {
    const c2 = CFG.riftRaid;
    if (this.wave.phase !== PHASE.COMBAT || this.wave.wave + 1 < c2.minWave) return;
    this._riftRaidTimer -= dt2;
    if (this._riftRaidTimer > 0) return;
    this._riftRaidTimer = c2.minGap + Math.random() * (c2.maxGap - c2.minGap);
    const inner = CFG.world.coreRadius + 3, outer = CFG.world.buildRadius - 2;
    const a = Math.random() * Math.PI * 2, r = inner + Math.random() * (outer - inner);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const n = c2.countMin + Math.floor(Math.random() * (c2.countMax - c2.countMin + 1));
    let spawned = 0;
    for (let i = 0; i < n; i++) {
      const jitter = 1.6;
      if (this.enemyMgr.spawn(c2.type, this.wave.wave + 1, x + (Math.random() - 0.5) * jitter, z + (Math.random() - 0.5) * jitter)) spawned++;
    }
    if (spawned > 0) {
      this._announceRiftRaid(x, z, spawned);
      this.net.send("riftRaid", { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, n: spawned });
    }
  }
  _announceRiftRaid(x, z, n) {
    this.fx.ring(x, z, 12592851, 4);
    this.fx.burst(x, 1.2, z, 12592851, 18, 6);
    this.ui?.toast(`🌀 방어선 안쪽에서 균열이 열렸다! 낯선 방향에서 ${n}마리가 튀어나왔다`, "bad");
    this.sfx.crystalDanger();
  }
  // 화산지대 운석이 남긴 용암 웅덩이 — 지속시간 동안 그 자리에 있는 적·플레이어에게 0.5초마다
  // 피해를 준다. 경고가 없는 대신(이미 운석 경고로 한 번 예고됐다) 웅덩이 자체가 계속 이글거려서
  // 보인다. 몰려오는 적을 그 위로 유인하면 공짜 지속딜이 되지만, 무리해서 그 안에서 싸우면
  // 플레이어도 똑같이 깎인다 — 운석과 같은 "양날의 검" 성격을 충돌 이후까지 이어간다.
  _updateCraters(dt2) {
    if (!this._crater) return;
    const c2 = CFG.meteor;
    this._crater.timeLeft -= dt2;
    if (this._crater.timeLeft <= 0) {
      this._crater = null;
      this.world.clearCrater();
      return;
    }
    this.world.setCrater(this._crater.x, this._crater.z, this._crater.timeLeft, c2.craterRadius);
    this._crater.tickTimer -= dt2;
    if (this._crater.tickTimer > 0) return;
    this._crater.tickTimer = 0.5;
    const { x, z } = this._crater;
    const tickDmg = Math.round(c2.craterDps * 0.5);
    for (const e of this.enemyMgr.list) {
      if (e.dead) continue;
      if (dist(e.x, e.z, x, z) <= c2.craterRadius) this._hurtEnemy(e, tickDmg, "player", x, z);
    }
    for (const p2 of this.players.values()) {
      if (dist(p2.x, p2.z, x, z) <= c2.craterRadius) {
        if (p2.id === this.local.id) this._hurtLocal(tickDmg);
        else this.net.send("hurt", { to: p2.id, dmg: tickDmg });
      }
    }
    if (!this._seenCrater) {
      this._seenCrater = true;
      this.ui?.toast("🌋 운석이 용암 웅덩이를 남겼다! 잠깐 그 자리에 계속 피해를 준다 — 적을 끌어들이거나, 스스로는 피해라", "warn");
    }
  }
  // 늪지대(swamp) 전용 — 고정된 자리 3곳이 각자 dormant(조용함) → warn(예고) → active(독가스,
  // 0.5초마다 피해) → dormant 를 계속 순환한다. 운석과 달리 위치가 판마다 항상 같은 자리(시드
  // 결정론적)라 처음 데어본 다음부터는 플레이어가 외워서 피하거나, 반대로 몬스터를 그 위로
  // 유인하는 길막이로 쓸 수 있다. 전투 중에만 진행되고(준비 시간엔 멈춰서 안전하게 건설할 수
  // 있다) 호스트만 시간을 진행시키며, 결과(phase)만 스냅샷 `sw` 필드로 참가자에게 전파된다.
  _updateSwampPits(dt2) {
    if (!this._swampTimers.length) return;
    if (this.wave.phase !== PHASE.COMBAT) return;
    const c2 = CFG.swampPit;
    for (let i = 0; i < this._swampTimers.length; i++) {
      const t2 = this._swampTimers[i];
      t2.timeLeft -= dt2;
      if (t2.timeLeft <= 0) {
        if (t2.phase === "dormant") {
          t2.phase = "warn";
          t2.timeLeft = c2.warn;
        } else if (t2.phase === "warn") {
          t2.phase = "active";
          t2.timeLeft = c2.active;
          t2.tickTimer = 0;
          if (!this._seenSwampPit) {
            this._seenSwampPit = true;
            this.ui?.toast("🐊 독가스 분출! 이 구덩이는 늘 같은 자리에서 터진다 — 위치를 외워두면 다음부터는 피할 수 있다", "warn");
          }
        } else {
          t2.phase = "dormant";
          t2.timeLeft = c2.dormant;
        }
        this.world.setSwampPitPhase(i, t2.phase);
      }
      if (t2.phase !== "active") continue;
      t2.tickTimer -= dt2;
      if (t2.tickTimer > 0) continue;
      t2.tickTimer = 0.5;
      const tickDmg = Math.round(c2.dps * 0.5);
      const { x, z } = this.world.swampPits[i];
      for (const e of this.enemyMgr.list) {
        if (e.dead) continue;
        if (dist(e.x, e.z, x, z) <= c2.radius) this._hurtEnemy(e, tickDmg, "player", x, z);
      }
      for (const p2 of this.players.values()) {
        if (dist(p2.x, p2.z, x, z) <= c2.radius) {
          if (p2.id === this.local.id) this._hurtLocal(tickDmg);
          else this.net.send("hurt", { to: p2.id, dmg: tickDmg });
        }
      }
    }
  }
  // 얼음판(설원 전용) — 늪지대와 완전히 같은 위상 순환·배관을 재사용하지만, active일 때
  // 피해 대신 둔화를 준다. 플레이어 쪽 둔화는 player.js가 world.icePits를 매 프레임 직접
  // 봐서 처리하므로(weatherMult와 같은 자리) 여기서는 적에게만 슬로우를 짧게 반복 갱신한다 —
  // 서 있는 동안만 걸리고 나가면 자연히 slowUntil이 만료돼 풀린다(frost 타워와 같은 원리).
  // 비행 몬스터는 얼음 바닥을 밟지 않으므로 제외한다(늪지대 독가스와 달리 지면 효과라는 차이).
  _updateIcePits(dt2) {
    if (!this._icePitTimers.length) return;
    if (this.wave.phase !== PHASE.COMBAT) return;
    const c2 = CFG.icePit;
    const now = performance.now() / 1e3;
    for (let i = 0; i < this._icePitTimers.length; i++) {
      const t2 = this._icePitTimers[i];
      t2.timeLeft -= dt2;
      if (t2.timeLeft <= 0) {
        if (t2.phase === "dormant") {
          t2.phase = "warn";
          t2.timeLeft = c2.warn;
        } else if (t2.phase === "warn") {
          t2.phase = "active";
          t2.timeLeft = c2.active;
          if (!this._seenIcePit) {
            this._seenIcePit = true;
            this.ui?.toast("❄️ 얼음판 활성화! 이 위에 있으면 나도 적도 똑같이 느려진다 — 몰려오는 적을 유인해 타워로 정리할 수도 있다", "warn");
          }
        } else {
          t2.phase = "dormant";
          t2.timeLeft = c2.dormant;
        }
        this.world.setIcePitPhase(i, t2.phase);
      }
      if (t2.phase !== "active") continue;
      const { x, z } = this.world.icePits[i];
      for (const e of this.enemyMgr.list) {
        if (e.dead || e.st.flies) continue;
        if (dist(e.x, e.z, x, z) <= c2.radius) e.applySlow(c2.enemySlow, c2.enemySlowTime, now);
      }
    }
  }
  // 뇌우 날씨(WEATHER.storm) 전용 — 그 웨이브 전투 내내 무작위 간격으로 살아있는 적 하나를 직접
  // 내리친다. 텔레그래프가 없다(운석과 달리 플레이어에게 불리한 게 아니라 순전히 도와주는 효과라
  // 피할 필요가 없다). 결과는 적 hp 변화로만 나타나므로 별도 네트워크 메시지 없이 기존 enemyMgr
  // 스냅샷에 실려 참가자 화면에도 그대로 전파된다.
  _updateStorm(dt2) {
    if (this.wave.phase !== PHASE.COMBAT || weatherOf(this.wave.wave + 1) !== "storm") return;
    if (this._stormWave !== this.wave.wave + 1) {
      this._stormWave = this.wave.wave + 1;
      this._stormTimer = 3 + Math.random() * 3;
    }
    this._stormTimer -= dt2;
    if (this._stormTimer > 0) return;
    const c2 = WEATHER.storm;
    this._stormTimer = c2.strikeMinGap + Math.random() * (c2.strikeMaxGap - c2.strikeMinGap);
    const targets = this.enemyMgr.list.filter((e2) => !e2.dead && !e2.st.event);
    if (!targets.length) return;
    const e = targets[Math.floor(Math.random() * targets.length)];
    this.fx.burst(e.x, 2.4, e.z, 16777215, 16, 7);
    this.fx.ring(e.x, e.z, 11393254, 2.2);
    this.sfx.lightning();
    this._hurtEnemy(e, c2.dmg, "storm", e.x, e.z);
  }
  // 우박 날씨(WEATHER.hail) 전용 — 뇌우와 정반대로 무작위 "건물"을 때린다(적이 아니라).
  // 크리스탈은 buildMgr에 아예 없는 별개 객체라 자연히 대상에서 빠진다. 함정(1회용, 아직
  // 안 밟혔는데 날씨에 그냥 사라지면 억울하다)과 제작대·화로(부서지면 그 웨이브 안엔 못
  // 짓는데, 전투 중 갑자기 제작 자체가 막히는 건 "환경 마모"가 아니라 그냥 봉쇄라 뺐다) —
  // 그 외 벽·성문·모든 타워·보루·채집기·정비소·병기창은 전부 대상이다. 결과는 건물 hp
  // 변화로만 나타나므로(뇌우와 같은 이유) 별도 네트워크 메시지 없이 기존 buildMgr 스냅샷에
  // 실려 참가자 화면에도 그대로 전파된다.
  _updateHail(dt2) {
    if (this.wave.phase !== PHASE.COMBAT || weatherOf(this.wave.wave + 1) !== "hail") return;
    if (this._hailWave !== this.wave.wave + 1) {
      this._hailWave = this.wave.wave + 1;
      this._hailTimer = 3 + Math.random() * 3;
    }
    this._hailTimer -= dt2;
    if (this._hailTimer > 0) return;
    const c2 = WEATHER.hail;
    this._hailTimer = c2.strikeMinGap + Math.random() * (c2.strikeMaxGap - c2.strikeMinGap);
    const targets = [...this.buildMgr.buildings.values()].filter((b2) => b2.hp > 0 && !b2.isTrap && !b2.stationKind);
    if (!targets.length) return;
    const b = targets[Math.floor(Math.random() * targets.length)];
    this.fx.burst(b.x, 2.2, b.z, 11393254, 14, 6);
    this.fx.ring(b.x, b.z, 11393254, 1.8);
    this.sfx.buildingHit();
    if (!this._seenHail) {
      this._seenHail = true;
      this.ui?.toast("🧊 우박 날씨! 가끔 무작위 건물을 강타한다 — 정비소를 근처에 지으면 자동으로 상쇄된다", "warn");
    }
    if (b.damage(c2.dmg)) {
      this.fx.burst(b.x, 1.2, b.z, 8947848, 16, 6);
      this.buildMgr.remove(b.id);
    }
  }
  // 보급품 투하: 전투 중 한 번에 최대 1개, 주기적으로 등장한다 (호스트 전용 — 결과는 스냅샷으로 퍼진다)
  _updateSupplyDrops(dt2) {
    const c2 = CFG.supplyDrop;
    if (this.wave.phase !== PHASE.COMBAT || this.wave.wave + 1 < c2.minWave) return;
    const drop = this.world.drops.find((d2) => (d2.kind || "supply") === "supply");
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
    this.world.spawnDrop(id, spot.x, spot.z, "supply");
    this.ui?.toast("📦 보급품이 떨어졌다! 미니맵을 보고 달려가서 챙겨라 — 안 챙기면 곧 사라진다", "good");
  }
  // 정수 상자 — 보급품 투하와 완전히 같은 패턴(호스트 전용 타이머, 같은 world.drops 배열,
  // 같은 자동 픽업 루프)이지만 훨씬 드물고, 목재·광물 대신 정수 1개를 준다. minGap이 보급품의
  // 3배 이상이라 같은 판에서 둘 다 뜨더라도 흔치 않게 겹친다.
  _updateShardDrops(dt2) {
    const c2 = CFG.shardDrop;
    if (this.wave.phase !== PHASE.COMBAT || this.wave.wave + 1 < c2.minWave) return;
    const drop = this.world.drops.find((d2) => d2.kind === "shard");
    if (drop) {
      drop.age = (drop.age || 0) + dt2;
      if (drop.age >= c2.lifetime) this.world.removeDrop(drop.id);
      return;
    }
    this._shardDropTimer -= dt2;
    if (this._shardDropTimer > 0) return;
    this._shardDropTimer = c2.minGap + Math.random() * (c2.maxGap - c2.minGap);
    const spot = this._findDropSpot();
    if (!spot) return;
    const id = this._dropIdSeq++;
    this.world.spawnDrop(id, spot.x, spot.z, "shard");
    this.ui?.toast("💠 정수 상자가 떨어졌다! 미니맵을 보고 달려가서 챙겨라 — 안 챙기면 곧 사라진다", "good");
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
    const alive = this.enemyMgr.list.filter((e2) => !e2.dead && e2.st.wild).length;
    if (alive >= c2.maxAlive) return;
    this._huntTimer -= dt2;
    if (this._huntTimer > 0) return;
    this._huntTimer = c2.spawnGap;
    const weights = Object.fromEntries(Object.entries(c2.weights).filter(([k2]) => this.wave.wave >= (c2.minWave?.[k2] ?? 0)));
    const total = Object.values(weights).reduce((a2, b2) => a2 + b2, 0);
    let roll = Math.random() * total, type = "rabbit";
    for (const [k2, w2] of Object.entries(weights)) {
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
    if (e && type === "wolf" && !this._seenWolf) {
      this._seenWolf = true;
      this.ui?.toast("🐺 늑대 등장! 다른 사냥감과 달리 먼저 건드리지 않아도 가까이 가면 스스로 쫓아온다 — 무장 없이 방심하지 말 것", "warn");
    }
    if (e && type === "bear" && !this._seenBear) {
      this._seenBear = true;
      this.ui?.toast("🐻 곰 등장! 먼저 쫓아오지는 않지만 건드리면 셋 중 가장 아프게 반격한다 — 체력이 가장 높고 길들이기도 가장 어렵다", "warn");
    }
    if (e && type === "stagking" && !this._seenStagking) {
      this._seenStagking = true;
      this.ui?.toast("👑 전설의 사슴왕 등장! 사냥감 중 가장 희귀하다 — 여우처럼 빠르게 도망치다가도 맞히면 곰보다 세게 반격한다. 잡으면 특별한 요리 재료가 된다", "warn");
    }
    if (e && type === "hawk" && !this._seenHawk) {
      this._seenHawk = true;
      this.ui?.toast("🦅 매 등장! 사냥감 중 유일하게 하늘을 날며 가장 멀리서부터 도망친다 — 길들이면 유일한 원거리 동료가 되어 안전거리를 두고 적을 쏜다", "warn");
    }
  }
  // 돌 파수꾼 — hunt.weights 풀과 별개로 훨씬 드물게, 한 번에 하나만 등장한다(_updateHunt와
  // 달리 maxAlive 대신 살아있는 개체 유무 자체를 검사). PREP에서만, wild:true라 웨이브가
  // 시작되면 _clearWildlife가 다른 사냥감과 함께 자동으로 정리한다.
  _updateNest(dt2) {
    if (!this.isHost) return;
    if (this.wave.phase !== PHASE.PREP) return;
    const c2 = CFG.nestEvent;
    if (this.wave.wave < c2.minWave) return;
    if (this.enemyMgr.list.some((e2) => !e2.dead && e2.type === "golem")) return;
    this._nestTimer -= dt2;
    if (this._nestTimer > 0) return;
    this._nestTimer = c2.minGap + Math.random() * (c2.maxGap - c2.minGap);
    const ang = Math.random() * Math.PI * 2;
    const r = c2.minDist + Math.random() * (c2.maxDist - c2.minDist);
    const e = this.enemyMgr.spawn("golem", 1, Math.cos(ang) * r, Math.sin(ang) * r);
    if (e && !this._seenGolem) {
      this._seenGolem = true;
      this.ui?.toast("🪨 돌 파수꾼 등장! 움직이지 못하지만 다가가 때리면 사냥감 중 가장 세게 반격한다 — 쓰러뜨리면 쌓아둔 목재·광물을 통째로 얻는다", "warn");
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
    if (this.feast.kind && this.feast.kind !== r.kind && this.feast.wavesLeft > 0) {
      this._notify(playerId, `기존 요리 효과가 사라지고 ${r.name} 효과로 바뀝니다 (한 번에 하나만 유지된다)`, "warn");
    }
    this.feast = { kind: r.kind, wavesLeft: 1 };
    if (r.kind === "vigor") this._applyVigor(playerId, r.value);
    this._notify(playerId, `${r.icon} ${r.name}을(를) 먹었다! ${r.desc}`, "good");
    if (!this.stats.dishesCooked.includes(key)) {
      this.stats.dishesCooked.push(key);
      if (this.stats.dishesCooked.length >= Object.keys(CFG.cook).length) this._unlockAchievement("gourmet");
    }
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
  get feastGuardPct() {
    return this.feast.kind === "guard" ? CFG.cook.fox.value : 0;
  }
  get feastArmorMult() {
    return this.feast.kind === "armor" ? CFG.cook.wolf.value : 1;
  }
  // 곰 훈제육 전용 — player.js 의 기본 회복은 전투 중(마지막 피격 후 2초 안)엔 멈추므로,
  // 이 보너스는 별도로 game.js 메인 루프에서 전투 중 여부와 무관하게 매 프레임 더한다.
  get feastRegenPerSec() {
    return this.feast.kind === "regen" ? CFG.cook.bear.value : 0;
  }
  get feastCritDelta() {
    return this.feast.kind === "crit" ? CFG.cook.stagking.value : 0;
  }
  get feastRangeMult() {
    return this.feast.kind === "range" ? CFG.cook.hawk.value : 1;
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
  // 정찰병 — 보물게와 같은 "호스트 전용 타이머 + enemyMgr에 실제 개체로 스폰" 패턴이지만
  // 전투가 아니라 준비 시간에만 뜨고, 목적어가 반대다(잡아야 이득이 아니라 놓치면 손해).
  // 포탈까지 도달하면(_scoutTick이 미리 그쪽으로 이동시켜 둔다) 다음 웨이브에 페널티를 예약한다.
  _updateScout(dt2) {
    const c2 = CFG.scoutEvent;
    if (this._scoutId != null) {
      const e2 = this.enemyMgr.list.find((x2) => x2.id === this._scoutId);
      if (!e2) {
        this._scoutId = null;
        return;
      }
      const reachedPortal = this.world.portals.some((p2) => dist(e2.x, e2.z, p2.x, p2.z) <= c2.catchRadius);
      this._scoutLifeLeft -= dt2;
      if (reachedPortal || this._scoutLifeLeft <= 0) {
        this.fx.burst(e2.x, 1, e2.z, CFG.enemies.scout.color, 10, 4);
        this.enemyMgr.kill(e2);
        this._scoutId = null;
        this.wave._scoutPenalty = true;
        this.ui?.toast("🕵️ 정찰병을 놓쳤다! 다음 웨이브가 더 강해진다", "bad");
      }
      return;
    }
    if (this.wave.phase !== PHASE.PREP || this.wave.wave + 1 < c2.minWave) return;
    this._scoutTimer -= dt2;
    if (this._scoutTimer > 0) return;
    this._scoutTimer = c2.minGap + Math.random() * (c2.maxGap - c2.minGap);
    const a = Math.random() * Math.PI * 2;
    const r = c2.spawnRadius[0] + Math.random() * (c2.spawnRadius[1] - c2.spawnRadius[0]);
    const e = this.enemyMgr.spawn("scout", this.wave.wave + 1, Math.cos(a) * r, Math.sin(a) * r);
    if (!e) return;
    this._scoutId = e.id;
    this._scoutLifeLeft = c2.lifetime;
    this.ui?.toast("🕵️ 정찰병이 나타났다! 포탈에 닿기 전에 잡아야 다음 웨이브가 안 강해진다", "warn");
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
    const isShard = drop.kind === "shard";
    const c2 = isShard ? CFG.shardDrop : CFG.supplyDrop;
    const x2 = typeof px === "number" ? px : player.x;
    const z2 = typeof pz === "number" ? pz : player.z;
    if (dist(x2, z2, drop.x, drop.z) > c2.pickupRadius + 1) return;
    const pool = this._poolOf(playerId);
    this.world.removeDrop(dropId);
    if (isShard) {
      pool.shard = (pool.shard || 0) + c2.reward.shard;
      this.fx.burst(drop.x, 1, drop.z, 14063103, 16, 6);
      this.fx.ring(drop.x, drop.z, 14063103, 3);
      this.sfx.shard();
      this._notify(playerId, `💠 정수 상자 획득! 정수+${c2.reward.shard}`, "good");
    } else {
      pool.wood += c2.reward.wood;
      pool.stone += c2.reward.stone;
      this.fx.burst(drop.x, 1, drop.z, 16759043, 16, 6);
      this.fx.ring(drop.x, drop.z, 16759043, 3);
      this.sfx.shard();
      this._notify(playerId, `📦 보급품 획득! 🪵+${c2.reward.wood} 🪨+${c2.reward.stone}`, "good");
    }
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
    if (e.markedUntil > performance.now() / 1e3) {
      dmg = Math.round(dmg * e.markMult);
    }
    if (e.variant === "armored" && (kind === "tower" || kind === "frost")) {
      dmg = Math.max(1, Math.round(dmg * CFG.variants.armored.towerDmgMult));
    }
    if (e.variant === "phantom" && kind === "player" && playerId) {
      dmg = Math.max(1, Math.round(dmg * CFG.variants.phantom.playerDmgMult));
    }
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
    let crit = false;
    if (kind === "player" && playerId && Math.random() < CFG.crit.chance + this.boonMult.critChanceDelta + this.feastCritDelta) {
      dmg = Math.round(dmg * CFG.crit.mult);
      crit = true;
    }
    const { died, applied } = e.damage(dmg, fromX, fromZ);
    if (kind === "player" && playerId) {
      this.stats.dmgByPlayer[playerId] = (this.stats.dmgByPlayer[playerId] || 0) + applied;
    }
    const label = crit && combo ? `${Math.round(applied)} 크리티컬 협공!` : crit ? `${Math.round(applied)} 크리티컬!` : combo ? `${Math.round(applied)} 협공!` : String(Math.round(applied));
    this.fx.float(label, e.x, 1.9, e.z, crit ? "crit" : combo ? "combo" : kind === "player" ? "player" : "");
    if (crit) {
      this.fx.ring(e.x, e.z, 16724531, 1.4);
      this.sfx.shard();
      this.stats.critCount = (this.stats.critCount || 0) + 1;
      if (this.stats.critCount >= 20) this._unlockAchievement("criticalEye");
      if (!this._seenCrit) {
        this._seenCrit = true;
        this.ui?.toast("💥 치명타! 근접·활·폭탄가방 공격은 가끔 두 배 피해를 낸다 — 확률은 순전히 운이다", "good");
      }
    }
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
    if (kind === "player" && playerId && this.world.crystal.graceLv > 0) {
      const p2 = this.players.get(playerId);
      if (p2 && dist(p2.x, p2.z, 0, 0) <= CFG.crystalUpgrade.grace.radius) {
        const heal = Math.round(applied * CFG.crystalUpgrade.grace.lifestealPctPerLv * this.world.crystal.graceLv);
        if (heal > 0) {
          this._healPlayer(playerId, heal);
          this.fx.float(`+${heal}`, p2.x, 2, p2.z, "good");
          if (!this._seenGrace) {
            this._seenGrace = true;
            this._notify(playerId, "🙏 가호! 크리스탈 가까이서 직접 맞히면 피해의 일부가 체력으로 돌아온다", "good");
          }
        }
      }
    }
    if (died) {
      this.stats.kills++;
      if (kind === "player" && playerId) {
        this.stats.killsByPlayer[playerId] = (this.stats.killsByPlayer[playerId] || 0) + 1;
      }
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
        if (["boss", "frostlord", "warden", "looter", "colossus"].every((t2) => this.stats.bossKillsSeen.includes(t2))) {
          this._unlockAchievement("fiveGuardians");
        }
        if (["boss", "frostlord", "warden", "looter", "colossus", "wraith"].every((t2) => this.stats.bossKillsSeen.includes(t2))) {
          this._unlockAchievement("sixGuardians");
        }
        if (["boss", "frostlord", "warden", "looter", "colossus", "wraith", "galelord"].every((t2) => this.stats.bossKillsSeen.includes(t2))) {
          this._unlockAchievement("sevenStars");
        }
        if (["boss", "frostlord", "warden", "looter", "colossus", "wraith", "galelord", "curselord"].every((t2) => this.stats.bossKillsSeen.includes(t2))) {
          this._unlockAchievement("allEightBosses");
        }
        if (["boss", "frostlord", "warden", "looter", "colossus", "wraith", "galelord", "curselord", "grovelord"].every((t2) => this.stats.bossKillsSeen.includes(t2))) {
          this._unlockAchievement("allNineBosses");
        }
        if (["boss", "frostlord", "warden", "looter", "colossus", "wraith", "galelord", "curselord", "grovelord", "magnetlord"].every((t2) => this.stats.bossKillsSeen.includes(t2))) {
          this._unlockAchievement("allTenBosses");
        }
        if (["boss", "frostlord", "warden", "looter", "colossus", "wraith", "galelord", "curselord", "grovelord", "magnetlord", "shadowlord"].every((t2) => this.stats.bossKillsSeen.includes(t2))) {
          this._unlockAchievement("allElevenBosses");
        }
        if (["boss", "frostlord", "warden", "looter", "colossus", "wraith", "galelord", "curselord", "grovelord", "magnetlord", "shadowlord", "weblord"].every((t2) => this.stats.bossKillsSeen.includes(t2))) {
          this._unlockAchievement("allTwelveBosses");
        }
        if (["boss", "frostlord", "warden", "looter", "colossus", "wraith", "galelord", "curselord", "grovelord", "magnetlord", "shadowlord", "weblord", "splitlord"].every((t2) => this.stats.bossKillsSeen.includes(t2))) {
          this._unlockAchievement("allThirteenBosses");
        }
      } else {
        this.sfx.enemyDeath();
      }
      if (e.variant === "split") {
        this.enemyMgr.spawnSplit(e);
        this.fx.ring(e.x, e.z, 16755277, 2.4);
      }
      if (e.st.splitBoss) {
        this.enemyMgr.spawnSplitBoss(e);
        this.fx.ring(e.x, e.z, 16755277, 3.5);
        this.ui?.toast("👯 분열 군주가 쓰러진 자리에서 더 약한 두 마리로 갈라졌다! 진짜 끝은 아직이다", "bad");
      }
      if (e.st.explode) this._bomberExplode(e);
      if (e.elite) {
        this.stats.elitesKilled = (this.stats.elitesKilled || 0) + 1;
        this.fx.ring(e.x, e.z, 16763904, 3);
        if (this.stats.elitesKilled >= 5) this._unlockAchievement("eliteHunter");
      }
      if (e.variant === "berserk" && e._berserk) {
        this.stats.berserkKilled = (this.stats.berserkKilled || 0) + 1;
        if (this.stats.berserkKilled >= 5) this._unlockAchievement("berserkSlayer");
      }
      if (e.st.meat) {
        const pool = this.shared ? this.pools.team : this._poolOf(this.local.id);
        if (!pool.meat) pool.meat = { rabbit: 0, deer: 0, boar: 0 };
        pool.meat[e.st.meat] = (pool.meat[e.st.meat] || 0) + 1;
        this.ui?.toast(`${e.st.icon} ${e.st.name} 사냥! 생고기를 얻었다 — 화로에서 구워 먹어라`, "good");
        this.stats.animalsHunted = (this.stats.animalsHunted || 0) + 1;
        if (this.stats.animalsHunted >= 10) this._unlockAchievement("hunter");
        if (e.type === "stagking") this._unlockAchievement("legendaryHunter");
      }
      if (e.st.scout) {
        this._scoutId = null;
        this.stats.scoutsIntercepted = (this.stats.scoutsIntercepted || 0) + 1;
        this.ui?.toast("🕵️ 정찰병 처치! 다음 웨이브 페널티를 막았다", "good");
        if (this.stats.scoutsIntercepted >= 3) this._unlockAchievement("interceptor");
      }
      const b = e.st.bounty;
      const nightMult = (this.wave.wave + 1) % CFG.wave.nightEvery === 0 ? CFG.wave.nightBountyMult : 1;
      const bw = Math.round(b.wood * this.boonMult.bounty * nightMult);
      const bs2 = Math.round(b.stone * this.boonMult.bounty * nightMult);
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
        this.ui?.toast("🦀 보물게 처치! 목재·광물을 두둑히 챙겼다", "good");
        this.stats.treasuresCaught = (this.stats.treasuresCaught || 0) + 1;
        if (this.stats.treasuresCaught >= 5) this._unlockAchievement("treasureHunter");
        if (this.stats.animalsHunted >= 10) this._unlockAchievement("hunter");
      }
      if (e.type === "mimic") {
        this.stats.mimicsKilled = (this.stats.mimicsKilled || 0) + 1;
        if (this.stats.mimicsKilled >= 3) this._unlockAchievement("mimicHunter");
      }
      if (e.type === "golem") {
        this.fx.burst(e.x, 1.2, e.z, 9080729, 20, 6);
        this.ui?.toast(`🪨 돌 파수꾼 처치! 쌓아둔 자재를 통째로 얻었다 — 🪵+${bw} 🪨+${bs2}`, "good");
        this.stats.golemsDefeated = (this.stats.golemsDefeated || 0) + 1;
        if (this.stats.golemsDefeated >= 3) this._unlockAchievement("stoneBreaker");
      }
      this.enemyMgr.kill(e);
    }
    return { died, applied };
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
    if (this.local.invulnerable) return;
    if (this._lastStandReady && this.local.alive && this.local.hp - dmg <= 0) {
      this._lastStandReady = false;
      this.local.hp = Math.max(1, Math.round(this.local.maxHp * 0.15));
      this.local.lastStandUntil = performance.now() / 1e3 + 3;
      this.fx.float("최후의 저항!", this.local.x, 2.4, this.local.z, "good");
      this.ui?.shake();
      this.ui?.toast("🔥 최후의 저항 발동! 쓰러지기 직전 간신히 버텼다 — 3초간 무적", "good");
      this.sfx.shard();
      return;
    }
    const down = this.local.damage(dmg, this.boonMult.downTimeMult);
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
    this.stats.shardEarned = (this.stats.shardEarned || 0) + reward.shard;
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
    if (this.result) return;
    if (!this.daily) Math.random = _nativeRandom;
    this.wave.phase = PHASE.WON;
    this.result = "win";
    this.sfx.win();
    this.sfx.music.stop();
    if (this.difficulty === "hard") this._unlockAchievement("ironWill");
    if (this.difficulty === "nightmare") this._unlockAchievement("nightmareConqueror");
    if (this.difficulty === "hell") this._unlockAchievement("hellConqueror");
    if (this.world.biome === "volcano") this._unlockAchievement("volcanoMaster");
    if (this.world.biome === "swamp") this._unlockAchievement("swampSurvivor");
    if (this.world.biome === "tundra") this._unlockAchievement("frostWalker");
    this._checkTeamEffort();
    if (!this.net.online) Game.clearLocalSave();
    this.ui?.showResult(true, this.stats, this.wave.wave);
  }
  _lose() {
    if (this.result) return;
    Math.random = _nativeRandom;
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
    const bossEntries = bossEntriesOf(w2);
    let base;
    if (bossEntries.length >= 2) {
      const names = bossEntries.map((c2) => `${CFG.enemies[c2.type].icon} ${CFG.enemies[c2.type].name}`).join(" + ");
      base = `⚠️⚠️ 웨이브 ${w2} 시작! 보스 ${bossEntries.length}마리 동시 등장! ${names} — 몬스터 ${total}마리`;
    } else if (bossEntries.length === 1) base = `⚠️ 웨이브 ${w2} 시작! 보스 등장! ${CFG.enemies[bossEntries[0].type].icon} ${CFG.enemies[bossEntries[0].type].name} — 몬스터 ${total}마리`;
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
      const isBoss = bossEntriesOf(this.wave.wave + 1).length > 0;
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
    if (!def.station && !this.hasStation("workbench")) {
      this._notify(playerId, "제작대가 있어야 건설할 수 있습니다", "bad");
      return;
    }
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
    if (key === "wall" || key === "gate") this.stats.everBuiltWall = true;
    if (b.isTower || b.isSupport) this.stats.everBuiltTower = true;
    if (key === "decoy") this.stats.everBuiltDecoy = true;
    if (key === "sniper" && !this._seenSniper) {
      this._seenSniper = true;
      this._notify(playerId, "🎯 저격탑 건설! 사거리 안에서 남은 체력이 가장 많은 적을 저격합니다 — 다른 타워보다 사거리가 훨씬 깁니다", "good");
    }
    if (key === "outpost" && !this._seenOutpost) {
      this._seenOutpost = true;
      this._notify(playerId, "🚩 전초기지 건설! 깃발 주위가 새 건설 구역이 됐습니다 — 이제 저기에도 타워·벽을 지을 수 있습니다. 깃발이 부서지면 그 구역은 사라집니다", "good");
    }
    if (key === "decoy" && !this._seenDecoy) {
      this._seenDecoy = true;
      this._notify(playerId, "📯 허수아비 유인목 건설! 반경 안 일반 몬스터가 크리스탈 대신 이것부터 노리게 됩니다 — 원하는 곳으로 무리를 끌어오는 미끼입니다(보스·특수 행동 몬스터에게는 안 통합니다)", "good");
    }
    if (key === "beacon" && !this._seenBeacon) {
      this._seenBeacon = true;
      this._notify(playerId, "🏮 봉화대 건설! 반경 안 비행 몬스터(박쥐 등)가 크리스탈 대신 이것부터 노리게 됩니다 — 땅 위 몬스터에게는 안 통하는, 유인목의 하늘 버전입니다(보스는 면역)", "good");
    }
  }
  // COST_KEYS(utils.js)를 그대로 따라간다 — 새 재료가 추가돼도 여기 손댈 필요 없이
  // 결과 화면 "소모한 자원" 합계·항목별 내역에 자동으로 잡힌다(구리·석탄이 한 번 이미
  // 이 목록에서 빠져 있었던 적이 있다 — 철처럼 하드코딩된 필드 3개만 갱신했었기 때문).
  _trackSpend(cost, kind) {
    const by = this.stats.spentBy[kind];
    for (const k2 of COST_KEYS) {
      if (!cost[k2]) continue;
      const capKey = "spent" + k2[0].toUpperCase() + k2.slice(1);
      this.stats[capKey] = (this.stats[capKey] || 0) + cost[k2];
      if (by) by[k2] = (by[k2] || 0) + cost[k2];
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
    for (const k2 of COST_KEYS) if (back[k2]) pool[k2] = (pool[k2] || 0) + back[k2];
    this.fx.burst(b.x, 1.2, b.z, 12558682, 10, 4);
    this.buildMgr.remove(id);
  }
  // 철거(50% 손실) 후 재건축보다 싸게 자리를 옮기는 대안 — 레벨·특화·체력·탄약은
  // 그대로 두고 위치만 바꾼다. buildMgr.relocate가 canPlace 판정까지 함께 하므로 여기서는
  // 비용만 확인한다(hostBuild가 buildMgr.place에 배치 판정을 위임하는 것과 같은 구조).
  requestRelocate(id, gx, gz) {
    if (this.isHost) this.hostRelocate(this.local.id, id, gx, gz);
    else this.net.send("relocate", { id, gx, gz });
  }
  hostRelocate(playerId, id, gx, gz) {
    const b = this.buildMgr.buildings.get(id);
    if (!b) return;
    const cost = this.buildMgr.relocateCost(b);
    const pool = this._poolOf(playerId);
    if (!canAfford(pool, cost)) {
      this._notify(playerId, "자원이 부족합니다", "bad");
      return;
    }
    const moved = this.buildMgr.relocate(b, gx, gz);
    if (!moved) {
      this._notify(playerId, "그 자리로는 옮길 수 없습니다", "bad");
      return;
    }
    payCost(pool, cost);
    this._trackSpend(cost, "repair");
    this._notify(playerId, `${b.def.icon} ${b.def.name} 이동 완료`, "good");
    if (playerId === this.local.id) this.sfx.upgrade();
  }
  requestRepair(id) {
    if (this.isHost) this.hostRepair(this.local.id, id);
    else this.net.send("repair", { id });
  }
  // 우선순위 모드(O)에서 타워를 클릭하면 4가지(위협적인 순·가까운 순·체력 많은 순·체력 적은 순)를
  // 순서대로 돌린다 — sell/repair와 완전히 같은 host-authoritative 배관, 결과는 buildMgr.snapshot()의
  // 새 필드로 자동 동기화된다
  requestTargetPriority(id) {
    if (this.isHost) this.hostTargetPriority(this.local.id, id);
    else this.net.send("targetPriority", { id });
  }
  hostTargetPriority(playerId, id) {
    const mode = this.buildMgr.cycleTargetPriority(id);
    if (!mode) return;
    const b = this.buildMgr.buildings.get(id);
    this._notify(playerId, `${b.def.icon} ${b.def.name} 우선순위: ${TARGET_PRIORITY_LABEL[mode]}`, "good");
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
    else if (node.type === "copper") pool.copper = (pool.copper || 0) + amount;
    else if (node.type === "coal") pool.coal = (pool.coal || 0) + amount;
    else pool.stone += amount;
    this.world.consumeNode(node);
    this.stats.harvested += amount;
    if (this.stats.harvested >= 1e3) this._unlockAchievement("harvestKing");
    this._notifyGain(playerId, node.type, amount, node);
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
    if (!this.local.tryAttack(this.boonMult.atkSpeedMult)) return;
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
    if (!this.local.tryThrow(this.boonMult.atkSpeedMult)) return;
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
    if (!this.local.tryShoot(this.boonMult.atkSpeedMult)) return;
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
  // 탑승 가능한(공격 타워) 대상 중 플레이어와 가장 가까운 것 — CFG.crew.radius 밖이면 null.
  // 순수 로컬 판정(누가 어느 타워 옆에 있는지는 위치만 알면 계산되므로 서버 승인이 필요 없다) —
  // 회피 돌진과 같은 이유로 클라이언트가 직접 계산한다.
  _nearestCrewableTower(x2, z2) {
    let best = null, bd2 = CFG.crew.radius;
    for (const b of this.buildMgr.buildings.values()) {
      if (!b.isTower) continue;
      const d2 = dist(x2, z2, b.x, b.z);
      if (d2 <= bd2) {
        bd2 = d2;
        best = b;
      }
    }
    return best;
  }
  // 손으로 재장전할 수 있는(탄약이 덜 찬) 타워 중 가장 가까운 것 — hostReload 의 판정과
  // 완전히 같은 기준을 프롬프트 표시용으로도 재사용한다.
  _nearestReloadable(x2, z2) {
    let best = null, bd2 = CFG.ammo.reloadRange;
    for (const b of this.buildMgr.buildings.values()) {
      if (!b.ammoType || b.ammo >= b.magazine) continue;
      const d2 = dist(x2, z2, b.x, b.z);
      if (d2 < bd2) {
        bd2 = d2;
        best = b;
      }
    }
    return best;
  }
  // 길들일 수 있는 야생 동물(CFG.tame 에 정의된 종류) 중 가장 가까운 것 — 반경 3 밖이면 null.
  // hostTame 의 판정과 완전히 같은 기준을 프롬프트 표시용으로도 재사용한다(순수 로컬 판정,
  // crew와 같은 이유로 서버 승인 없이 클라이언트가 직접 계산해도 된다).
  _nearestTameable(x2, z2) {
    let best = null, bd2 = 3;
    for (const e of this.enemyMgr.list) {
      if (e.dead || !e.st.wild || !CFG.tame[e.type]) continue;
      const d2 = dist(x2, z2, e.x, e.z);
      if (d2 < bd2) {
        bd2 = d2;
        best = e;
      }
    }
    return best;
  }
  // 매 프레임 "지금 어느 타워가 탑승 중인가"를 다시 계산한다 — 탑승 상태(crewing)는 각
  // 플레이어 객체(로컬은 직접, 참가자는 pos 동기화로)에만 있고 건물 쪽엔 저장하지 않는다.
  // 그래서 스냅샷에 새 필드가 필요 없다 — 호스트·참가자 모두 이미 알고 있는 플레이어 상태에서
  // 그때그때 다시 계산할 뿐이라, 저장/이어하기·호스트 승계에서도 따로 복원할 게 없다.
  _syncCrewedTowers() {
    const crewedIds = /* @__PURE__ */ new Set();
    if (this.local.crewing) crewedIds.add(this.local.crewing);
    for (const p2 of this.players.values()) {
      if (p2.crewing) crewedIds.add(p2.crewing);
    }
    for (const b of this.buildMgr.buildings.values()) {
      b.crewedBy = crewedIds.has(b.id);
    }
  }
  // 미니맵 핑 — 협동 플레이에서 "여기 좀 봐줘"를 말이나 채팅 없이 전달하는 유일한 수단이라
  // 건설·공격처럼 호스트 검증이 필요 없다(자원도 안 쓰고 되돌릴 상태도 없다). 스팸을 막는
  // 쿨다운만 로컬에서 걸고, 신호 자체는 그대로 방송한다 — 찍은 사람도 자기 화면에서 똑같이 보여야
  // "제대로 찍혔는지" 확인이 되므로 로컬에도 바로 표시한다.
  requestPing(x2, z2, kind = "look") {
    if (this._pingCd > 0) return;
    this._pingCd = CFG.player.pingCooldown;
    this._showPing(x2, z2, null, kind);
    this.net.send("ping", { x: x2, z: z2, name: this.local.name, kind });
  }
  _showPing(x2, z2, name, kind = "look") {
    const pk = PING_KINDS[kind] || PING_KINDS.look;
    this.fx.pingMarker(x2, z2, pk.color, pk.css);
    this.sfx.upgrade();
    if (name) this.ui?.toast(`${pk.icon} ${name}: ${pk.text}`, kind === "help" ? "bad" : "warn");
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
    let lifestealHeal = 0;
    for (const e of this.enemyMgr.list) {
      if (e.dead) continue;
      const d2 = dist(x2, z2, e.x, e.z);
      if (d2 > a.range + e.st.radius) continue;
      const ang = Math.atan2(e.x - x2, e.z - z2);
      let diff = Math.abs((ang - rot + Math.PI) % (Math.PI * 2) - Math.PI);
      if (diff > a.arc) continue;
      const { applied } = this._hurtEnemy(e, dmg, "player", x2, z2, playerId);
      if (!e.dead && this.boonMult.venomChance && Math.random() < this.boonMult.venomChance) {
        e.applyPoison(CFG.boons.venom.dps, CFG.boons.venom.duration, performance.now() / 1e3);
      }
      if (a.slow && !e.dead) {
        e.applySlow(a.slow, a.slowTime, performance.now() / 1e3);
        if (!this._seenFrostaxe) {
          this._seenFrostaxe = true;
          this._notify(playerId, "❄️ 얼음도끼가 적을 둔화시켰다! 서리탑 없이도 직접 늦춰서 붙잡아 둘 수 있다", "good");
        }
      }
      if (a.mark && !e.dead) {
        const markUntil = performance.now() / 1e3 + a.markTime;
        e.markedUntil = markUntil;
        e.markMult = a.mark;
        if (a.markRadius) {
          for (const o of this.enemyMgr.list) {
            if (o === e || o.dead) continue;
            if (dist(o.x, o.z, e.x, e.z) > a.markRadius) continue;
            o.markedUntil = markUntil;
            o.markMult = a.mark;
          }
        }
        if (!this._seenMark) {
          this._seenMark = true;
          this._notify(playerId, "📌 낙인침이 적에게 표식을 남겼다! 표식이 걸린 동안은 타워를 포함한 모든 피해가 커진다", "good");
        }
      }
      if (e.variant === "thorn") thornDmg += Math.round(applied * CFG.variants.thorn.reflectPct);
      if (a.lifesteal) lifestealHeal += applied * a.lifesteal;
      if (a.knockback && !e.dead) {
        const kd = Math.max(d2, 0.4);
        e.x += (e.x - x2) / kd * a.knockback;
        e.z += (e.z - z2) / kd * a.knockback;
        if (!this._seenKnockback) {
          this._seenKnockback = true;
          this._notify(playerId, "🔗 채찍이 적을 뒤로 밀쳐냈다! 거리를 벌리거나 무리를 흩어놓을 때 유용하다", "good");
        }
      }
    }
    if (thornDmg > 0) this._reflectThorns(playerId, thornDmg, x2, z2);
    if (lifestealHeal > 0) {
      this._healPlayer(playerId, Math.round(lifestealHeal));
      if (!this._seenDagger) {
        this._seenDagger = true;
        this._notify(playerId, "🔪 단검이 입힌 피해의 일부를 체력으로 돌려줬다! 무리 속에서도 계속 때리며 버틸 수 있다", "good");
      }
    }
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
    if (this.isHost) this.hostStartWave();
    else this.net.send("startWave", {});
  }
  // 조기 시작 보너스 계산은 wave.startWave()가 prepLeft를 건드리기 전에 먼저 읽어야 한다 —
  // 자연 만료로 시작되는 경우(update()의 prepLeft<=0 분기)는 여기를 거치지 않으므로 애초에
  // 보너스가 붙지 않는다.
  hostStartWave() {
    const prepLeft = this.wave.prepLeft;
    const bonus = prepLeft > CFG.wave.earlyStartMinTime ? {
      wood: Math.round(prepLeft * CFG.wave.earlyStartWoodRate),
      stone: Math.round(prepLeft * CFG.wave.earlyStartStoneRate)
    } : null;
    if (!this.wave.startWave()) return;
    if (bonus) {
      this._grantReward({ wood: bonus.wood, stone: bonus.stone, shard: 0 });
      this.ui?.toast(`⏩ 조기 시작 보너스! 🪵${bonus.wood} 🪨${bonus.stone} (남은 준비 시간 ${Math.ceil(prepLeft)}초를 자원으로 환산)`, "good");
      this.stats.earlyStarts++;
      if (this.stats.earlyStarts >= 5) this._unlockAchievement("earlyBird");
    }
    this.net.send("waveStarted", { bonus });
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
  requestOutfitUpgrade() {
    if (this.isHost) this.hostOutfitUpgrade(this.local.id);
    else this.net.send("outfitUp", {});
  }
  hostOutfitUpgrade(playerId) {
    const p2 = this.players.get(playerId);
    if (!p2) return;
    const next = CFG.outfit.tiers[p2.outfitLv];
    if (!next) {
      this._notify(playerId, "방어구가 최고 단계입니다", "bad");
      return;
    }
    if (!this.hasStation("workbench")) {
      this._notify(playerId, "제작대가 있어야 만들 수 있습니다", "bad");
      return;
    }
    const pool = this._poolOf(playerId);
    if (!canAfford(pool, next.cost)) {
      this._notify(playerId, "자원이 부족합니다", "bad");
      return;
    }
    payCost(pool, next.cost);
    this._trackSpend(next.cost, "craft");
    p2.outfitLv += 1;
    this._notify(playerId, `${next.icon} ${next.name} 착용`, "good");
    if (p2.outfitLv >= CFG.outfit.maxLv) this._unlockAchievement("fullyArmored", playerId);
    if (playerId === this.local.id) this.sfx.upgrade();
    else this.net.send("outfitUpOk", { to: playerId, lv: p2.outfitLv });
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
      if (this.local.beginHarvest(node, this.world, this.boonMult.harvestTimeMult * this.tempBoon.harvest)) this.sfx.click();
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
    if (p2.weaponProficiencyLv > 0 && CFG.weaponUpgrade.perLv[key] && (p2.weaponLv[key] || 0) < p2.weaponProficiencyLv) {
      p2.weaponLv[key] = p2.weaponProficiencyLv;
      if (p2.weaponLv[key] >= CFG.weaponUpgrade.maxLv) this._unlockAchievement("weaponMaster", playerId);
    }
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
  // ---------------------------------------------------------------- 탄약
  requestCraftAmmo(type) {
    if (this.isHost) this.hostCraftAmmo(this.local.id, type);
    else this.net.send("craftAmmo", { type });
  }
  // 제련(hostSmelt)과 완전히 같은 구조 — 시설 확인 → 비용 확인 → 지불 → 재고 증가.
  // 종류마다 필요한 시설이 다른 게 유일한 차이다(화살은 제작대에서 깎고, 포탄·원소액은 화로에서 녹인다).
  hostCraftAmmo(playerId, type) {
    if (!this.players.get(playerId)) return;
    const a2 = CFG.ammo.types[type];
    if (!a2) return;
    const stationName = a2.station === "workbench" ? "제작대" : "화로";
    if (!this.hasStation(a2.station)) {
      this._notify(playerId, `${stationName}가 있어야 ${a2.name}을(를) 만들 수 있습니다`, "bad");
      return;
    }
    const pool = this._poolOf(playerId);
    if (!canAfford(pool, a2.cost)) {
      this._notify(playerId, `${a2.icon} ${a2.name} 재료가 부족합니다 (${costText(a2.cost)})`, "bad");
      return;
    }
    payCost(pool, a2.cost);
    this._trackSpend(a2.cost, "craft");
    const stock = this._ammoOf(pool);
    stock[type] = (stock[type] || 0) + a2.yield;
    this._notify(playerId, `${a2.icon} ${a2.name} ${a2.yield}발을 만들었다 (재고 ${stock[type]})`, "good");
    if (playerId === this.local.id) this.sfx.upgrade();
    else this.net.send("smeltOk", { to: playerId });
  }
  requestReload() {
    if (this.isHost) this.hostReload(this.local.id);
    else this.net.send("reload", {});
  }
  // 손으로 재장전 — 병기창이 없거나 그 반경 밖에 있는 타워를 위한 수동 수단.
  // 가장 가까운 "탄약이 덜 찬" 타워 하나만 채운다(이미 가득 찬 타워는 아예 후보에서 뺀다 —
  // 안 그러면 가득 찬 타워가 바로 옆에 있을 때 정작 빈 타워를 영영 못 채운다).
  hostReload(playerId) {
    const p2 = this.players.get(playerId);
    if (!p2) return;
    const target = this._nearestReloadable(p2.x, p2.z);
    if (!target) {
      this._notify(playerId, "근처에 탄약을 채울 타워가 없습니다", "bad");
      return;
    }
    const a2 = CFG.ammo.types[target.ammoType];
    const stock = this._ammoOf(this._poolOf(playerId));
    const have = stock[target.ammoType] || 0;
    if (have <= 0) {
      this._notify(playerId, `${a2.icon} ${a2.name} 재고가 없다 — ${a2.station === "workbench" ? "제작대" : "화로"}에서 먼저 만들어야 한다`, "bad");
      return;
    }
    const moved = Math.min(have, target.magazine - target.ammo);
    stock[target.ammoType] = have - moved;
    target.ammo += moved;
    target.refreshAmmoBar();
    this.fx.ring(target.x, target.z, a2.color, 2);
    this._notify(playerId, `${a2.icon} ${target.def.name} 재장전 ${target.ammo}/${target.magazine} (남은 재고 ${stock[target.ammoType]})`, "good");
    if (playerId === this.local.id) this.sfx.upgrade();
  }
  // 병기창 — 정비소(_updateRepairPosts)와 정확히 같은 호스트 전용 반경 순회. 차이는 채우는
  // 대상이 체력이 아니라 탄창이고, 공짜가 아니라 팀 탄약 재고에서 실제로 꺼내 쓴다는 것이다.
  _updateArmories(dt2) {
    if (!this.isHost) return;
    for (const b of this.buildMgr.buildings.values()) {
      if (b.key !== "armory") continue;
      const st = b.stats;
      const stock = this._ammoOf(this._poolOf(b.ownerId || this.local.id));
      b._supplyAccum = (b._supplyAccum || 0) + st.supplyRate * dt2;
      if (b._supplyAccum < 1) continue;
      let budget = b._supplyAccum;
      for (const o of this.buildMgr.buildings.values()) {
        if (budget < 1) break;
        if (!o.ammoType || o.ammo >= o.magazine) continue;
        if (dist(b.x, b.z, o.x, o.z) > st.supplyRadius) continue;
        const have = stock[o.ammoType] || 0;
        if (have <= 0) continue;
        const moved = Math.min(Math.floor(budget), have, o.magazine - o.ammo);
        if (moved <= 0) continue;
        stock[o.ammoType] = have - moved;
        o.ammo += moved;
        o.refreshAmmoBar();
        budget -= moved;
        if (!this._seenArmory) {
          this._seenArmory = true;
          this.ui?.toast("🏭 병기창이 주변 타워에 탄약을 보급하기 시작했다! 재고만 채워 두면 알아서 장전된다", "good");
        }
      }
      b._supplyAccum = Math.min(budget, 1);
    }
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
    const allMaxed = Object.keys(CFG.crystalUpgrade).filter((k2) => k2 !== "maxLv").every((k2) => c2[k2 + "Lv"] >= CFG.crystalUpgrade.maxLv);
    if (allMaxed) this._unlockAchievement("crystalAscendant", playerId);
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
    if (c2.judgeLv > 0) {
      c2._judgeTimer -= dt2;
      if (c2._judgeTimer <= 0) {
        c2._judgeTimer = u2.judge.tickTime;
        const targets = this.enemyMgr.list.filter((e) => !e.dead && !e.st.boss && e.hp / e.maxHp <= u2.judge.thresholdPct && dist(e.x, e.z, 0, 0) <= u2.judge.radius);
        for (const e of targets) this._hurtEnemy(e, e.hp, "player", 0, 0);
        if (targets.length) this.fx.ring(0, 0, 16763955, u2.judge.radius);
      }
    }
    if (c2.shockLv > 0) {
      c2._shockTimer -= dt2;
      if (c2._shockTimer <= 0) {
        c2._shockTimer = u2.shock.tickTime;
        const force = u2.shock.forcePerLv * c2.shockLv;
        const targets = this.enemyMgr.list.filter((e) => !e.dead && dist(e.x, e.z, 0, 0) <= u2.shock.radius);
        for (const e of targets) {
          const d2 = Math.max(dist(e.x, e.z, 0, 0), 0.4);
          e.x += e.x / d2 * force;
          e.z += e.z / d2 * force;
        }
        if (targets.length) {
          this.fx.ring(0, 0, 8956927, u2.shock.radius);
          this.sfx.buildingHit();
        }
      }
    }
    if (c2.resonanceLv > 0) {
      c2._resonanceTimer -= dt2;
      if (c2._resonanceTimer <= 0) {
        c2._resonanceTimer = u2.resonance.tickTime;
        const now = performance.now() / 1e3;
        const dmg = u2.resonance.dmgPerLv * c2.resonanceLv;
        const targets = this.enemyMgr.list.filter((e) => !e.dead && (now < e.slowUntil || now < e.rootUntil) && dist(e.x, e.z, 0, 0) <= u2.resonance.radius);
        for (const e of targets) this._hurtEnemy(e, dmg, "player", 0, 0);
        if (targets.length) this.fx.ring(0, 0, 11800063, u2.resonance.radius);
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
  // 스스로 캔다. 여러 채집기가 같은 노드를 두고 경쟁할 수 있는데(각자
  // 독립적으로 가장 가까운 대상을 고르므로), 그 자체는 버그가 아니라 배치를 고민하게 만드는 요소다.
  _updateHarvesters(dt2) {
    if (!this.isHost) return;
    for (const b of this.buildMgr.buildings.values()) {
      if (!b.isHarvester) continue;
      const st = b.stats;
      let target = null, bestD = st.detectRadius;
      for (const n of this.world.nodes) {
        if (n.depleted || n.mimic) continue;
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
      const resKey = target.type === "tree" ? "wood" : target.type === "rock" ? "stone" : target.type;
      pool[resKey] = (pool[resKey] || 0) + amount;
      this.world.consumeNode(target);
      this.stats.harvested += amount;
      if (this.stats.harvested >= 1e3) this._unlockAchievement("harvestKing");
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
  // ⛺ 치유소 — 정비소와 정확히 같은 호스트 전용 반경 순회를 쓰되, 대상이 건물이 아니라
  // 팀 플레이어들이다. 기본 회복(CFG.player.regen)은 최근에 안 맞았을 때만 도는데, 이건 방금
  // 맞았어도(전투 중이어도) 계속 적용된다 — 최전선 바로 뒤에 지어 두면 그 자리 자체가
  // 안전지대가 된다. 쓰러진(alive===false) 플레이어는 hp가 0으로 고정된 채 부활 타이머만
  // 도는 상태라 여기서 건드리면 안 된다(부활은 크리스탈 옆에서만 일어난다).
  _updateHealCamps(dt2) {
    if (!this.isHost) return;
    for (const b of this.buildMgr.buildings.values()) {
      if (!b.isHealCamp) continue;
      const st = b.stats;
      for (const p2 of this.players.values()) {
        if (!p2.alive || p2.hp >= p2.maxHp) continue;
        if (dist(b.x, b.z, p2.x, p2.z) > st.healRadius) continue;
        const healed = Math.min(st.healRate * dt2, p2.maxHp - p2.hp);
        if (healed <= 0) continue;
        this._healPlayer(p2.id, healed);
        this.stats.campHealed = (this.stats.campHealed || 0) + healed;
        if (this.stats.campHealed >= 500) this._unlockAchievement("haven");
        if (!this._seenHealCamp) {
          this._seenHealCamp = true;
          this.ui?.toast("⛺ 치유소가 반경 안 플레이어를 회복시키기 시작했다! 전투 중에도 계속 적용된다 — 최전선의 안전지대", "good");
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
  // 코어 폭주 — 다른 여섯 스킬과 달리 고정 비용이 없다. _skillCost 를 안 거치고 가진 정수
  // 전부(pool.shard)를 그대로 소모량이자 위력 배율로 쓴다 — 많이 모아 둘수록 세지지만, 다른
  // 스킬·크리스탈 강화·서리탑에 쓸 밑천도 같이 사라진다. blast 와 같은 "내 주변 원형 피해"
  // 판정을 그대로 재사용하되 반경·피해만 압도적으로 크다.
  requestSkillOverload() {
    this.sfx.shard();
    if (this.isHost) this.hostSkillOverload(this.local.id);
    else this.net.send("skillOverload", {});
  }
  hostSkillOverload(playerId) {
    const s2 = CFG.skills.overload;
    const p2 = this.players.get(playerId);
    const pool = this._poolOf(playerId);
    if (!p2) return;
    const spend = pool.shard || 0;
    if (spend < s2.minCost) {
      this._notify(playerId, `수정 정수가 부족합니다 (최소 ${s2.minCost} 필요)`, "bad");
      return;
    }
    pool.shard = 0;
    this._unlockAchievement("skillUser", playerId);
    const dmg = spend * s2.dmgPerShard;
    const targets = this.enemyMgr.list.filter((e) => !e.dead && dist(e.x, e.z, p2.x, p2.z) <= s2.radius);
    for (const e of targets) this._hurtEnemy(e, dmg, "player", p2.x, p2.z);
    this.fx.ring(p2.x, p2.z, 16729156, s2.radius);
    this.fx.burst(p2.x, 1.6, p2.z, 16729156, 32, 9);
    this.ui?.shake();
    this._notify(playerId, `🌋 코어 폭주! 정수 ${spend}개를 태워 적 ${targets.length}마리에게 ${dmg} 피해`, "good");
  }
  requestTame() {
    if (this.isHost) this.hostTame(this.local.id);
    else this.net.send("tame", {});
  }
  // 여우·늑대·곰·전설의 사슴왕·매만 길들일 수 있다(CFG.tame 에 정의된 다섯만, 전부 wild:true).
  // 초식동물(토끼·사슴·멧돼지) 생고기를 미끼로
  // 쓰며, 성공/실패 모두 미끼를 소모한다 — 도망 다니는 걸 잡아 쓰다듬는 흉내라 몇 번이고
  // 다시 시도할 수 있지만, 그때마다 실제 자원이 든다. 팀 전체 동료 1마리 제한은 정령 소환과
  // 같은 원칙 — 나눠서 여러 마리를 부리며 화력을 불리지 못하게 막는다.
  hostTame(playerId) {
    const p2 = this.players.get(playerId);
    if (!p2) return;
    if (this._pet) {
      this.hostFeedPet(playerId);
      return;
    }
    const target = this._nearestTameable(p2.x, p2.z);
    if (!target) {
      this._notify(playerId, "근처에 길들일 수 있는 여우·늑대·곰·전설의 사슴왕·매가 없습니다", "bad");
      return;
    }
    const pool = this._poolOf(playerId);
    const meat = pool.meat || (pool.meat = { rabbit: 0, deer: 0, boar: 0 });
    let need = CFG.tame.baitCost;
    const have = (meat.rabbit || 0) + (meat.deer || 0) + (meat.boar || 0);
    if (have < need) {
      this._notify(playerId, `초식동물 생고기가 ${need}개 필요합니다 (토끼·사슴·멧돼지)`, "bad");
      return;
    }
    for (const k2 of ["rabbit", "deer", "boar"]) {
      if (need <= 0) break;
      const take = Math.min(meat[k2] || 0, need);
      meat[k2] -= take;
      need -= take;
    }
    const tc2 = CFG.tame[target.type];
    if (Math.random() < tc2.chance) {
      this.enemyMgr.kill(target);
      this._pet = { type: target.type, x: target.x, z: target.z, rot: 0, lv: 0, ownerId: playerId, cd: 0 };
      this.world.setPet(target.x, target.z, target.type, 0);
      this._unlockAchievement("tamer", playerId);
      if (target.type === "stagking") this._unlockAchievement("legendaryTamer", playerId);
      this.fx.burst(target.x, 1, target.z, tc2.color, 14, 5);
      this._notify(playerId, `${tc2.icon} ${tc2.name}을(를) 길들였다! 이제부터 나를 따라다니며 적을 공격한다`, "good");
    } else {
      this.fx.ring(target.x, target.z, tc2.color, 1.6);
      this._notify(playerId, `${tc2.icon} ${tc2.name}이(가) 경계하며 물러났다 — 미끼는 소모됐다`, "warn");
    }
  }
  // 이미 동료가 있는 상태에서 Z를 누르면 새로 길들이는 대신 먹이를 줘서 키운다 — 같은 키를
  // 상황에 따라 다르게 쓰는 기존 패턴(F키의 채집/공격 겸용)과 같은 방식. 요리에 쓸 수도 있는
  // 생고기를 대신 여기 태우게 해서, 남는 고기를 어디에 쓸지 계속 저울질하게 만든다.
  hostFeedPet(playerId) {
    const pet = this._pet;
    if (!pet) return;
    const tc2 = CFG.tame[pet.type];
    if ((pet.lv || 0) >= CFG.tame.maxLevel) {
      this._notify(playerId, `${tc2.icon} ${tc2.name}은(는) 이미 최대로 성장했습니다`, "bad");
      return;
    }
    const pool = this._poolOf(playerId);
    const meat = pool.meat || (pool.meat = { rabbit: 0, deer: 0, boar: 0 });
    let need = CFG.tame.feedCost;
    const have = (meat.rabbit || 0) + (meat.deer || 0) + (meat.boar || 0);
    if (have < need) {
      this._notify(playerId, `${tc2.icon} 먹이를 주려면 생고기가 ${need}개 필요합니다`, "bad");
      return;
    }
    for (const k2 of ["rabbit", "deer", "boar"]) {
      if (need <= 0) break;
      const take = Math.min(meat[k2] || 0, need);
      meat[k2] -= take;
      need -= take;
    }
    pet.lv = (pet.lv || 0) + 1;
    this.world.setPet(pet.x, pet.z, pet.type, pet.rot, pet.lv);
    this.fx.burst(pet.x, 1, pet.z, tc2.color, 10 + pet.lv * 4, 4);
    if (pet.lv >= CFG.tame.maxLevel) {
      this._unlockAchievement("loyalCompanion", playerId);
      this._notify(playerId, `${tc2.icon} ${tc2.name}이(가) 최대 레벨(${pet.lv})까지 성장했다!`, "good");
    } else {
      this._notify(playerId, `${tc2.icon} ${tc2.name}에게 먹이를 줬다 — 레벨 ${pet.lv} (공격력·공격속도 상승)`, "good");
    }
  }
  // ⚠️ 위험 계약 — 준비 시간에 다음 웨이브 한 판만 몬스터를 더 세게(체력·공격력) 만드는 대신
  // 보상(자원·정수)도 그만큼 키운다. 포탈 봉쇄처럼 "이번 웨이브를 어떻게 맞을지" 미리 정하는
  // 선택이지만, 위치가 필요 없어(팀 전체에 적용되는 스위치) 근접 판정이 없다 — 아무 데서나
  // 토글할 수 있다. 웨이브가 시작되는 순간(onWaveStart) 소비되고 자동으로 꺼지므로 매 웨이브
  // 다시 결정해야 한다.
  requestRiskContract() {
    if (this.isHost) this.hostRiskContract(this.local.id);
    else this.net.send("riskContract", {});
  }
  hostRiskContract(playerId) {
    if (this.wave.phase !== PHASE.PREP) {
      this._notify(playerId, "전투 중에는 위험 계약을 걸 수 없습니다 — 준비 시간에만 가능합니다", "bad");
      return;
    }
    this._riskArmed = !this._riskArmed;
    const rc = CFG.risk;
    this._notify(playerId, this._riskArmed ? `⚠️ 위험 계약 체결 — 다음 웨이브 몬스터 체력 +${Math.round((rc.hpMult - 1) * 100)}%·공격력 +${Math.round((rc.dmgMult - 1) * 100)}%, 대신 보상 +${Math.round((rc.rewardMult - 1) * 100)}%` : "위험 계약을 취소했다", this._riskArmed ? "warn" : "good");
  }
  // 🪨 포탈 봉쇄 — 준비 시간에 열려 있는 포탈 옆에서 자원을 태워 그 포탈을 다음 전투 한 판 동안
  // 막는다. 적 총수는 waveComposition이 그대로 정하고 스폰 지점만 나머지 포탈로 몰리므로,
  // "이 방향은 확실히 막고 저 방향은 더 세게 받는다"는 배치 선택이 된다. tame과 같은 구조로
  // 근접 대상(가장 가까운 열린 포탈)을 찾아 판정한다.
  requestSealPortal() {
    if (this.isHost) this.hostSealPortal(this.local.id);
    else this.net.send("sealPortal", {});
  }
  hostSealPortal(playerId) {
    if (this.wave.phase !== PHASE.PREP) {
      this._notify(playerId, "전투 중에는 포탈을 봉쇄할 수 없습니다 — 준비 시간에만 가능합니다", "bad");
      return;
    }
    const p2 = this.players.get(playerId);
    if (!p2) return;
    const open = this.world.portals.filter((po2) => !po2.sealed);
    let target = null, bestD = CFG.portalSeal.radius;
    for (const po2 of open) {
      const d2 = dist(p2.x, p2.z, po2.x, po2.z);
      if (d2 < bestD) {
        bestD = d2;
        target = po2;
      }
    }
    if (!target) {
      this._notify(playerId, "근처에 봉쇄할 수 있는 열린 포탈이 없습니다", "bad");
      return;
    }
    if (open.length <= 1) {
      this._notify(playerId, "마지막 남은 포탈은 봉쇄할 수 없습니다 — 적이 나올 곳이 없어집니다", "bad");
      return;
    }
    const cost = portalSealCost(this.wave.wave + 1);
    const pool = this._poolOf(playerId);
    if (!canAfford(pool, cost)) {
      this._notify(playerId, `자원이 부족합니다 (${costText(cost)} 필요)`, "bad");
      return;
    }
    payCost(pool, cost);
    this._trackSpend(cost, "portalSeal");
    target.sealed = true;
    this.fx.ring(target.x, target.z, 4407619, 3.2);
    if (playerId === this.local.id) this.sfx.upgrade();
    this._notify(playerId, `🪨 포탈을 봉쇄했다 — 다음 웨이브 동안 이쪽에서는 적이 나오지 않는다 (나머지 포탈에 더 몰린다)`, "good");
  }
  requestReleasePet() {
    if (this.isHost) this.hostReleasePet(this.local.id);
    else this.net.send("releasePet", {});
  }
  // 여우·늑대 중 하나를 길들이고 나면 팀 전체 1마리 한도 때문에 다른 동물로 영영 못 바꾸는
  // 문제가 있었다 — 처음 마주친 동물이 하필 약한 쪽이어도 되돌릴 방법이 없었다. 놓아주면
  // 그 자리에서 사라지고(레벨도 함께 사라진다) 다시 빈 슬롯이 되어 새로 길들일 수 있다.
  // world.clearPet()과 스냅샷의 pt:null 처리는 먹이주기를 만들 때 이미 갖춰져 있었다.
  hostReleasePet(playerId) {
    const pet = this._pet;
    if (!pet) {
      this._notify(playerId, "놓아줄 동료가 없습니다", "bad");
      return;
    }
    const tc2 = CFG.tame[pet.type];
    this.fx.burst(pet.x, 1, pet.z, tc2.color, 10, 4);
    this._pet = null;
    this.world.clearPet();
    this._notify(playerId, `${tc2.icon} ${tc2.name}을(를) 놓아줬다 — 다른 동물을 다시 길들일 수 있다`, "warn");
  }
  // 정령과 같은 패턴(호스트 전용 이동·공격, 위치만 스냅샷)이지만 시간제한이 없다 — 죽지 않는 한
  // 영구히 남는다(현재 몬스터 AI는 크리스탈·건물·플레이어만 노려서 정령처럼 실전에서 맞을 일이 없다).
  _updatePet(dt2) {
    if (!this.isHost || !this._pet) return;
    const pt2 = this._pet;
    const type = pt2.type;
    const tc2 = CFG.tame[type];
    const lv = pt2.lv || 0;
    const petDmg = tc2.dmg * Math.pow(CFG.tame.lvDmgMult, lv) * this.boonMult.petDmgMult;
    const petRate = tc2.rate * Math.pow(CFG.tame.lvRateMult, lv);
    let target = null, bestD = tc2.range;
    for (const e of this.enemyMgr.list) {
      if (e.dead) continue;
      if (e.variant === "ward") continue;
      if (e.st.burrows && e.diving) continue;
      const d2 = dist(pt2.x, pt2.z, e.x, e.z);
      if (d2 < bestD) {
        bestD = d2;
        target = e;
      }
    }
    pt2.cd -= dt2;
    if (target && bestD <= tc2.atkRange) {
      pt2.rot = Math.atan2(target.x - pt2.x, target.z - pt2.z);
      if (pt2.cd <= 0) {
        pt2.cd = 1 / petRate;
        if (tc2.ranged) {
          const from = new THREE.Vector3(pt2.x, 2.4, pt2.z);
          const to2 = new THREE.Vector3(target.x, 0.9, target.z);
          const dmg = Math.round(petDmg);
          this.projectiles.fire(from, to2, 16, tc2.color, (pos) => {
            this.fx.burst(pos.x, pos.y, pos.z, tc2.color, 5, 2.5);
            if (!target.dead) this._hurtEnemy(target, dmg, "player", pt2.x, pt2.z);
          });
        } else {
          this._hurtEnemy(target, Math.round(petDmg), "player", pt2.x, pt2.z);
          this.fx.burst(target.x, 0.6, target.z, tc2.color, 5, 2.5);
        }
      }
    } else {
      const owner = this.players.get(pt2.ownerId);
      const tx = target ? target.x : owner ? owner.x : pt2.x;
      const tz = target ? target.z : owner ? owner.z : pt2.z;
      const dx = tx - pt2.x, dz = tz - pt2.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.6) {
        pt2.rot = Math.atan2(dx, dz);
        const step = Math.min(len, tc2.speed * dt2);
        pt2.x += dx / len * step;
        pt2.z += dz / len * step;
      }
    }
    if (lv >= CFG.tame.maxLevel) {
      const awk = CFG.tame.petAwaken;
      if (pt2.awakenCd === void 0) pt2.awakenCd = awk.interval;
      pt2.awakenCd -= dt2;
      if (pt2.awakenCd <= 0) {
        pt2.awakenCd = awk.interval;
        const cx = target ? target.x : pt2.x;
        const cz = target ? target.z : pt2.z;
        let hitAny = false;
        for (const e of this.enemyMgr.list) {
          if (e.dead || e.variant === "ward" || e.st.burrows && e.diving) continue;
          if (dist(cx, cz, e.x, e.z) > awk.radius) continue;
          this._hurtEnemy(e, Math.round(petDmg * awk.dmgMult), "player", pt2.x, pt2.z);
          hitAny = true;
        }
        this.fx.ring(cx, cz, tc2.color, awk.radius);
        this.fx.burst(cx, 1, cz, tc2.color, 16, 5);
        if (hitAny && !this._petAwakenNotified) {
          this._petAwakenNotified = true;
          this._notify(pt2.ownerId, `${tc2.icon} ${tc2.name}이(가) 포효로 주변 적을 한꺼번에 후려쳤다! (최대 레벨 전용 공격)`, "good");
        }
      }
    }
    this.world.setPet(pt2.x, pt2.z, type, pt2.rot, pt2.lv || 0);
  }
  // key 는 COST_KEYS(wood·stone·copper·coal·iron·shard) 아무거나 — 재료 종류가 구리·석탄·정수로
  // 늘어난 뒤에도 이 기능은 한동안 목재·광물 두 종류만 줄 수 있었다. 타워마다 요구하는 재료가
  // 갈린 지금은, 목재만 넘치는 사람이 구리가 급한 동료를 못 도와주는 진짜 빈틈이었다.
  requestGive(toId, key, amount) {
    this.sfx.click();
    if (this.isHost) this.hostGive(this.local.id, toId, key, amount);
    else this.net.send("give", { to: toId, key, amount });
  }
  hostGive(fromId, toId, key, amount) {
    if (this.shared) return;
    const from = this._poolOf(fromId), to2 = this._poolOf(toId);
    const amt = Math.max(0, Math.min(amount | 0, from[key] || 0));
    if (amt <= 0) return;
    from[key] = (from[key] || 0) - amt;
    to2[key] = (to2[key] || 0) + amt;
    this._notify(toId, `자원을 받았다 ${RES_ICON[key]}${amt}`, "good");
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
  // playerId 소유의 hp 는 그 클라이언트 자신만 권위를 가진다 — "pos" 동기화가 매 프레임 자기
  // hp를 그대로 실어 보내 덮어쓰므로, 호스트가 players.get(playerId).hp 를 직접 고쳐봐야 그
  // 참가자 화면에는 전혀 반영되지 않고(호스트 자신의 화면에서만 잠깐 보이다) 다음 pos 패킷이
  // 도착하는 순간 조용히 지워진다. _notify/_unlockAchievement 와 정확히 같은 "본인이면 로컬
  // 처리, 아니면 net.send" 배관으로 고친다 — 단검 흡혈을 만들며 실제 2탭 멀티플레이로 참가자가
  // 단검을 써도 체력이 전혀 안 느는 것을 발견해 추가했다.
  _healPlayer(playerId, amount) {
    if (playerId === this.local.id) {
      this.local.hp = Math.min(this.local.maxHp, this.local.hp + amount);
    } else {
      this.net.send("heal", { to: playerId, amount });
    }
  }
  _notify(playerId, text, kind) {
    if (playerId === this.local.id) {
      this.ui?.toast(text, kind);
      if (kind === "bad") this.sfx.denied();
    } else this.net.send("toast", { to: playerId, text, kind });
  }
  _notifyGain(playerId, type, amount, node) {
    const label = type === "tree" ? `+${amount} 🪵` : type === "copper" ? `+${amount} 🟠` : type === "coal" ? `+${amount} ⚫` : `+${amount} 🪨`;
    if (playerId === this.local.id) {
      this.fx.float(label, node.x, 2.2, node.z, "good");
    } else {
      this.net.send("gain", { to: playerId, label, x: node.x, z: node.z });
    }
    this.fx.burst(node.x, 1.4, node.z, type === "tree" ? 8046415 : type === "copper" ? 13136695 : type === "coal" ? 4342338 : 11581122, 6, 3);
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
      const wasAheadOfMe = p2.joinTs < net.joinTs || p2.joinTs === net.joinTs && p2.id < net.selfId;
      if (this.isHost && wasAheadOfMe) {
        this.ui?.toast("👑 호스트가 나가서 당신이 새 호스트가 됐다 — 웨이브 시작 등 방장 권한을 이어받았다", "warn");
      }
      this.ui?.refreshLobby();
      if (this.isHost && !this._pet && this.world.pet) {
        const wp = this.world.pet;
        this._pet = { type: wp.type, x: wp.x, z: wp.z, rot: wp.rot || 0, lv: wp.lv || 0, ownerId: this.local.id, cd: 0 };
      }
      if (this.isHost && !this._rift && this.world.rift) {
        const wr2 = this.world.rift;
        this._rift = { x: wr2.x, z: wr2.z, timeLeft: wr2.timeLeft };
      }
      if (this.isHost && !this._spirit && this.world.spirit) {
        const ws2 = this.world.spirit;
        this._spirit = { x: ws2.x, z: ws2.z, ownerId: this.local.id, timeLeft: ws2.timeLeft, cd: 0 };
      }
      if (this.isHost && !this._meteorPending && this.world.meteor) {
        const wm2 = this.world.meteor;
        this._meteorPending = { x: wm2.x, z: wm2.z, timeLeft: wm2.timeLeft };
      }
      if (this.isHost && !this._crater && this.world.crater) {
        const wc2 = this.world.crater;
        this._crater = { x: wc2.x, z: wc2.z, timeLeft: wc2.timeLeft, tickTimer: 0 };
      }
    });
    net.on("startGame", (d2) => {
      if (this.running && !this.result) return;
      this.begin({ seed: d2.seed, shared: d2.shared, difficulty: d2.difficulty, daily: !!d2.daily });
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
      const wasAlive = p2.alive;
      if (p2.applyNet) p2.applyNet(d2);
      if (wasAlive && !p2.alive) {
        this.ui?.toast(`🆘 ${p2.name}님이 쓰러졌다! 근처로 가면 더 빨리 되살아난다`, "bad");
        this.sfx.playerDown();
      } else if (!wasAlive && p2.alive) {
        this.ui?.toast(`✅ ${p2.name}님이 다시 일어났다`, "good");
      }
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
    net.on("relocate", (d2, from) => {
      if (this.isHost) this.hostRelocate(from, d2.id, d2.gx, d2.gz);
    });
    net.on("repair", (d2, from) => {
      if (this.isHost) this.hostRepair(from, d2.id);
    });
    net.on("targetPriority", (d2, from) => {
      if (this.isHost) this.hostTargetPriority(from, d2.id);
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
      if (this.isHost) this.hostStartWave();
    });
    net.on("continueEndless", (d2, from) => {
      if (this.isHost) this.hostContinueEndless(from);
    });
    net.on("boonOffer", (d2) => {
      if (this.isHost) return;
      this.pendingBoon = d2.keys;
      this.pendingBoonTrigger = d2.trigger;
      this.ui?.showBoonChoice(d2.keys, d2.trigger);
    });
    net.on("pickBoon", (d2) => {
      if (this.isHost) this.pickBoon(d2.key);
    });
    net.on("boonPicked", (d2) => {
      if (!this.isHost) {
        this.ui?.toast(d2.text, "good");
        this.pendingBoon = null;
        this.pendingBoonTrigger = null;
        this.ui?.hideBoonChoice();
      }
    });
    net.on("ping", (d2) => {
      this._showPing(d2.x, d2.z, d2.name, d2.kind);
    });
    net.on("hup", (d2, from) => {
      if (this.isHost) this.hostHarvestUpgrade(from);
    });
    net.on("outfitUp", (d2, from) => {
      if (this.isHost) this.hostOutfitUpgrade(from);
    });
    net.on("craft", (d2, from) => {
      if (this.isHost) this.hostCraft(from, d2.key);
    });
    net.on("metaPerks", (d2, from) => {
      if (this.isHost) this._applyMetaPerks(from, d2);
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
    net.on("skillOverload", (d2, from) => {
      if (this.isHost) this.hostSkillOverload(from);
    });
    net.on("tame", (d2, from) => {
      if (this.isHost) this.hostTame(from);
    });
    net.on("sealPortal", (d2, from) => {
      if (this.isHost) this.hostSealPortal(from);
    });
    net.on("riskContract", (d2, from) => {
      if (this.isHost) this.hostRiskContract(from);
    });
    net.on("riftRaid", (d2) => {
      this._announceRiftRaid(d2.x, d2.z, d2.n);
    });
    net.on("releasePet", (d2, from) => {
      if (this.isHost) this.hostReleasePet(from);
    });
    net.on("craftAmmo", (d2, from) => {
      if (this.isHost) this.hostCraftAmmo(from, d2.type);
    });
    net.on("reload", (d2, from) => {
      if (this.isHost) this.hostReload(from);
    });
    net.on("give", (d2, from) => {
      if (this.isHost) this.hostGive(from, d2.to, d2.key, d2.amount);
    });
    net.on("giveWeapon", (d2, from) => {
      if (this.isHost) this.hostGiveWeapon(from, d2.to, d2.key);
    });
    net.on("hurt", (d2) => {
      if (d2.to === net.selfId) this._hurtLocal(d2.dmg);
    });
    net.on("heal", (d2) => {
      if (d2.to === net.selfId) this.local.hp = Math.min(this.local.maxHp, this.local.hp + d2.amount);
    });
    net.on("pull", (d2) => {
      if (d2.to !== net.selfId) return;
      this.local.x = d2.x;
      this.local.z = d2.z;
      this.local._collide(this.grid, this.world);
      this.fx.burst(d2.x, 1.2, d2.z, 12592851, 8, 4);
    });
    net.on("blind", (d2) => {
      if (d2.to === net.selfId) this.local.blindUntil = performance.now() / 1e3 + d2.dur;
    });
    net.on("root", (d2) => {
      if (d2.to === net.selfId) this.local.rootedUntil = performance.now() / 1e3 + d2.dur;
    });
    net.on("unlockAch", (d2) => {
      if (d2.to === net.selfId) this._unlockAchievement(d2.key);
    });
    net.on("achAnnounce", (d2) => {
      this.ui?.toast(`🏆 ${d2.name}님이 업적을 달성했습니다: ${d2.icon} ${d2.title}`, "good");
    });
    net.on("outpostLost", () => {
      this.ui?.toast("🚩 전초기지가 파괴됐다! 그 주위 건설 구역이 사라집니다 (이미 지은 건물은 남습니다)", "bad");
    });
    net.on("decoyLost", () => {
      this.ui?.toast("📯 허수아비 유인목이 파괴됐다! 묶여 있던 몬스터가 다시 크리스탈로 향한다", "bad");
    });
    net.on("beaconLost", () => {
      this.ui?.toast("🏮 봉화대가 파괴됐다! 이끌리던 비행 몬스터가 다시 크리스탈로 향한다", "bad");
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
    net.on("outfitUpOk", (d2) => {
      if (d2.to === net.selfId) {
        this.local.outfitLv = d2.lv;
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
    net.on("waveStarted", (d2) => {
      if (!this.isHost) {
        const w2 = this.wave.wave + 1;
        const total = waveComposition(w2, this.players.size).reduce((s2, c2) => s2 + c2.count, 0);
        this.ui?.toast(this._waveStartLabel(w2, total), "warn");
        this.sfx.waveStart();
        if (d2?.bonus) this.ui?.toast(`⏩ 조기 시작 보너스! 🪵${d2.bonus.wood} 🪨${d2.bonus.stone}`, "good");
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
      players[p2.id] = { hv: p2.harvestLv, tl: Object.keys(p2.tools).filter((k2) => p2.tools[k2]), eq: p2.equipped || null, wl: p2.weaponLv, ws: p2.weaponSpec, mh: p2.maxHp, ol: p2.outfitLv, wp: p2.weaponProficiencyLv };
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
      cj: this.world.crystal.judgeLv,
      csk: this.world.crystal.shockLv,
      cg: this.world.crystal.graceLv,
      crn: this.world.crystal.resonanceLv,
      cml: this.world.crystal.materielLv,
      // 긴급 방벽(shieldUntil)도 호스트 로컬 performance.now() 기준 절대 시각이라 curseLeft와
      // 같은 이유로 그대로 보내면 참가자 쪽에서 의미가 없다 — 남은 시간만 상대값으로 실어 보낸다.
      // (이전까지는 이 필드 자체가 스냅샷에 없어서 참가자 화면에는 방벽 이펙트·HUD 카운트다운이
      // 아예 안 보였다 — 실제 피해 차단은 호스트 전용 damageCrystal()이 이미 정확히 처리해서
      // 경제·체력 동기화 자체는 안 어긋났지만, 참가자 입장에서는 "왜 크리스탈이 안 깎이지?" 하는
      // 시각적 공백이었다.)
      cs: this.world.crystal.shieldUntil > 0 ? Math.max(0, Math.round((this.world.crystal.shieldUntil - performance.now() / 1e3) * 10) / 10) : null,
      rf: this._rift ? [Math.round(this._rift.x * 10) / 10, Math.round(this._rift.z * 10) / 10, Math.round(this._rift.timeLeft * 10) / 10] : null,
      sp: this._spirit ? [Math.round(this._spirit.x * 10) / 10, Math.round(this._spirit.z * 10) / 10, Math.round(this._spirit.timeLeft * 10) / 10] : null,
      pt: this._pet ? [Math.round(this._pet.x * 10) / 10, Math.round(this._pet.z * 10) / 10, this._pet.type, Math.round(this._pet.rot * 100) / 100, this._pet.lv || 0] : null,
      // 🪨 봉쇄된 포탈 — 포탈은 world.portals가 시드로 결정론적으로 만드는 정적 배열이라 위치는
      // 다시 안 보내고, 봉쇄된 인덱스만 압축해서 보낸다. 참가자는 스폰을 직접 계산하지 않으니
      // (호스트 전용, wave.update가 isHost 분기 안에서만 돈다) 순수 표시(3D 포탈 외형)용이다.
      psl: this.world.portals.flatMap((po2, i) => po2.sealed ? [i] : []),
      // 다음 발생까지 남은 시간을 도는 순수 카운트다운 8종(보급품·정수 상자·운석·균열 습격·
      // 야생 동물·보물게·정찰병·돌 파수꾼) — 전부 begin()에서 한 번만 초기화되고 그 뒤로는
      // 게임이 끝날 때까지 계속 흘러간다(밤/우박처럼 웨이브마다 새로 리셋되는 타이머와 다르다).
      // 참가자는 이 값으로 자기 화면에 뭔가를 그리지는 않지만(스폰 자체가 호스트 전용), 참가자가
      // 나중에 호스트를 승계하면(peerLeave) 이 값이 없으면 전부 begin() 초기값으로 되돌아가
      // "방금 막 시작한 것"처럼 스케줄이 리셋된다 — 예를 들어 승계 직후 보급품이 16초, 정수
      // 상자가 50초 동안 안 뜨는 식으로, 실제로는 그럴 시점이 지났어도 다시 기다려야 했다.
      et: [this._dropTimer, this._shardDropTimer, this._meteorTimer, this._riftRaidTimer, this._huntTimer, this._treasureTimer, this._scoutTimer, this._nestTimer].map((v) => Math.round(v * 10) / 10),
      mt: this._meteorPending ? [Math.round(this._meteorPending.x * 10) / 10, Math.round(this._meteorPending.z * 10) / 10, Math.round(this._meteorPending.timeLeft * 10) / 10] : null,
      lc: this._crater ? [Math.round(this._crater.x * 10) / 10, Math.round(this._crater.z * 10) / 10, Math.round(this._crater.timeLeft * 10) / 10] : null,
      // 늪지대 독가스 구덩이 — 위치는 결정론적(월드 시드)이라 다시 안 보내고, 각 구덩이의 단계만
      // 한 글자로 압축해 보낸다(d=dormant, w=warn, a=active). 피해는 호스트만 계산하고 이 필드는
      // 참가자 화면의 링 색 표시(경고·독가스 이펙트)만 맞추는 용도다.
      //
      // swt(남은 시간)도 같이 보낸다 — _specialKind와 똑같은 이유다: 참가자의 _swampTimers는
      // begin()이 게임 시작 시 전부 dormant로 한 번 만든 뒤 이 스냅샷 없이는 그대로 방치되는데,
      // 참가자가 호스트를 승계하는 순간 _updateSwampPits가 그 방치된(위상만 맞고 남은 시간은 틀린)
      // 값을 그대로 쓰기 시작한다 — 예를 들어 실제로는 막 active로 들어간 구덩이인데 남은 시간이
      // begin() 때의 초기 dormant 오프셋으로 남아 있으면 위상은 active인데 몇 초 뒤 dormant를
      // 건너뛰고 곧장 warn으로 넘어가는 식으로 주기가 어긋난다.
      sw: this._swampTimers.length ? this._swampTimers.map((t2) => t2.phase[0]).join("") : null,
      swt: this._swampTimers.length ? this._swampTimers.map((t2) => Math.round(t2.timeLeft * 10) / 10) : null,
      // 얼음판(설원) — 늪지대 sw/swt와 완전히 같은 이유·같은 형식으로 위상·남은 시간을 보낸다.
      ip: this._icePitTimers.length ? this._icePitTimers.map((t2) => t2.phase[0]).join("") : null,
      ipt: this._icePitTimers.length ? this._icePitTimers.map((t2) => Math.round(t2.timeLeft * 10) / 10) : null,
      pb: Object.keys(this.pickedBoons).length ? this.pickedBoons : null,
      // ⚠️ 위험 계약 — 다음 웨이브에 한해 몬스터를 더 세게, 보상을 더 크게 거는 팀 단위 선택.
      // 호스트만 켜고 끄지만(portal seal 계열과 같은 host-authoritative 패턴), 참가자도 준비
      // 시간 UI에서 지금 걸려 있는지 봐야 하므로(안 실으면 참가자는 자기 화면에서 영원히 꺼진
      // 걸로 보인다) 그대로 실어 보낸다.
      rk: this._riskArmed,
      mc: this._merchant ? { offers: this._merchant.offers, boughtBy: this._merchant.boughtBy } : null,
      // atkWavesLeft/towerWavesLeft/speedWavesLeft는 참가자 동기화(_applySnapshot)엔 필요 없다
      // (참가자는 매 스냅샷 host가 이미 감쇠시킨 배율 값만 그대로 반영하면 되고, 스스로
      // _decayTempBoon()을 호출하지 않는다) — 하지만 solo 저장/이어하기(resumeLocal)는 이어서도
      // 자기 자신이 host로서 계속 _decayTempBoon()을 호출하므로, 배율만 복원하고 남은 웨이브 수를
      // 안 실으면 카운터가 0으로 리셋된 채라 그 물약 버프가 절대 안 풀리고 영구 지속되는 반대
      // 방향의 버그가 생긴다. 그래서 여기서 항상 실어 보낸다 — 참가자는 그냥 안 쓰고 무시한다.
      tb: {
        atk: this.tempBoon.atk,
        towerDmg: this.tempBoon.towerDmg,
        speed: this.tempBoon.speed,
        harvest: this.tempBoon.harvest,
        atkWavesLeft: this.tempBoon.atkWavesLeft,
        towerWavesLeft: this.tempBoon.towerWavesLeft,
        speedWavesLeft: this.tempBoon.speedWavesLeft,
        harvestWavesLeft: this.tempBoon.harvestWavesLeft
      },
      // 잔치 효과(요리)는 상인 물약(tb)과 똑같이 팀 전체가 함께 받는 "누가 먹었든 파티 전원에게
      // 적용" 설계인데, 이 필드가 그동안 스냅샷에 실리지 않았다 — 호스트 자신이 먹었을 때는
      // this.local이 곧 호스트라 우연히 정상 동작했지만, 참가자가 먹으면 호스트의 this.feast는
      // 정확히 갱신되는데(전투 피해 계산은 호스트 전용이라 문제없음) 참가자 자신의 클라이언트는
      // 그 사실을 전혀 몰라 자기 이동 속도(feastSpeedMult, this.local.update 에서 매 클라이언트가
      // 로컬로 계산)에 전혀 반영이 안 되는 조용한 버그였다. tb 와 동일하게 실어 보낸다.
      fs: { kind: this.feast.kind, wavesLeft: this.feast.wavesLeft },
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
        shardEarned: this.stats.shardEarned,
        riskWavesCleared: this.stats.riskWavesCleared,
        dmgByPlayer: this.stats.dmgByPlayer,
        killsByPlayer: this.stats.killsByPlayer,
        spentWood: this.stats.spentWood,
        spentStone: this.stats.spentStone,
        spentIron: this.stats.spentIron,
        spentCopper: this.stats.spentCopper,
        spentCoal: this.stats.spentCoal,
        spentShard: this.stats.spentShard,
        spentBy: this.stats.spentBy,
        waveLog: this.stats.waveLog,
        bossKillsSeen: this.stats.bossKillsSeen,
        weathersSeen: this.stats.weathersSeen,
        trapsTriggered: this.stats.trapsTriggered,
        elitesKilled: this.stats.elitesKilled,
        berserkKilled: this.stats.berserkKilled,
        treasuresCaught: this.stats.treasuresCaught,
        golemsDefeated: this.stats.golemsDefeated,
        animalsHunted: this.stats.animalsHunted,
        comboCount: this.stats.comboCount,
        critCount: this.stats.critCount,
        parryCount: this.stats.parryCount,
        repairPostHealed: this.stats.repairPostHealed,
        campHealed: this.stats.campHealed,
        mimicsKilled: this.stats.mimicsKilled,
        blocksCount: this.stats.blocksCount,
        relicsPicked: this.stats.relicsPicked,
        dishesCooked: this.stats.dishesCooked,
        scoutsIntercepted: this.stats.scoutsIntercepted,
        earlyStarts: this.stats.earlyStarts,
        everBuiltWall: this.stats.everBuiltWall,
        everBuiltTower: this.stats.everBuiltTower,
        everBuiltDecoy: this.stats.everBuiltDecoy
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
      const shardBonus = s2.bm?.shardBonus ?? this.boonMult.shardBonus;
      if (shardBonus && reward.shard) reward.shard += shardBonus;
      const wonNow = this.wave.phase === PHASE.WON;
      this.ui?.toast(wonNow ? "마지막 웨이브 격퇴!" : `웨이브 ${this.wave.wave} 클리어! 보상 🪵${reward.wood} 🪨${reward.stone}${reward.shard ? ` 💠${reward.shard}` : ""}`, "good");
      if (!wonNow) this.sfx.waveClear();
      const clearedWave = this.wave.wave;
      if (clearedWave % 5 === 0 && !this._pBossWaveDamaged) this._unlockAchievement("flawlessBoss");
      this._pBossWaveDamaged = false;
      if (clearedWave >= 5 && !s2.st?.everBuiltWall) this._unlockAchievement("noWall");
      if (clearedWave >= 3 && !s2.st?.everBuiltTower) {
        this._unlockAchievement("noTower");
      }
    }
    const prevHp = this.world.crystal.hp;
    if (s2.cm) this.world.crystal.maxHp = s2.cm;
    if (s2.ca !== void 0) this.world.crystal.armorLv = s2.ca;
    if (s2.cr !== void 0) this.world.crystal.regenLv = s2.cr;
    if (s2.cx !== void 0) this.world.crystal.auraLv = s2.cx;
    if (s2.crf !== void 0) this.world.crystal.reflectLv = s2.crf;
    if (s2.cj !== void 0) this.world.crystal.judgeLv = s2.cj;
    if (s2.csk !== void 0) this.world.crystal.shockLv = s2.csk;
    if (s2.cg !== void 0) this.world.crystal.graceLv = s2.cg;
    if (s2.crn !== void 0) this.world.crystal.resonanceLv = s2.crn;
    if (s2.cml !== void 0) this.world.crystal.materielLv = s2.cml;
    this.world.crystal.shieldUntil = s2.cs != null ? performance.now() / 1e3 + s2.cs : 0;
    this.world.crystal.hp = s2.c;
    if (s2.c < prevHp) {
      this.ui?.shake();
      this.fx.burst(0, 3.2, 0, 6545663, 8, 4);
      this.sfx.crystalHit();
      if (wasBossCombat) this._pBossWaveDamaged = true;
    }
    if (s2.mt) this.world.setMeteor(s2.mt[0], s2.mt[1], s2.mt[2], CFG.meteor.radius);
    else this.world.clearMeteor();
    if (s2.lc) this.world.setCrater(s2.lc[0], s2.lc[1], s2.lc[2], CFG.meteor.craterRadius);
    else this.world.clearCrater();
    if (s2.sw) {
      const codeToPhase = { d: "dormant", w: "warn", a: "active" };
      for (let i = 0; i < s2.sw.length; i++) {
        const phase = codeToPhase[s2.sw[i]] || "dormant";
        this.world.setSwampPitPhase(i, phase);
        const t2 = this._swampTimers[i];
        if (t2) {
          t2.phase = phase;
          t2.timeLeft = s2.swt?.[i] ?? CFG.swampPit[phase];
          t2.tickTimer = 0;
        }
      }
    }
    if (s2.ip) {
      const codeToPhase = { d: "dormant", w: "warn", a: "active" };
      for (let i = 0; i < s2.ip.length; i++) {
        const phase = codeToPhase[s2.ip[i]] || "dormant";
        this.world.setIcePitPhase(i, phase);
        const t2 = this._icePitTimers[i];
        if (t2) {
          t2.phase = phase;
          t2.timeLeft = s2.ipt?.[i] ?? CFG.icePit[phase];
        }
      }
    }
    if (s2.pb) this.pickedBoons = s2.pb;
    this._riskArmed = !!s2.rk;
    if (s2.rf) this.world.setRift(s2.rf[0], s2.rf[1], s2.rf[2], CFG.skills.rift.radius);
    else this.world.clearRift();
    if (s2.sp) this.world.setSpirit(s2.sp[0], s2.sp[1], s2.sp[2]);
    else this.world.clearSpirit();
    if (s2.pt) this.world.setPet(s2.pt[0], s2.pt[1], s2.pt[2], s2.pt[3], s2.pt[4] || 0);
    else this.world.clearPet();
    if (s2.psl) {
      const sealedSet = new Set(s2.psl);
      this.world.portals.forEach((po2, i) => po2.sealed = sealedSet.has(i));
    }
    if (s2.et) [this._dropTimer, this._shardDropTimer, this._meteorTimer, this._riftRaidTimer, this._huntTimer, this._treasureTimer, this._scoutTimer, this._nestTimer] = s2.et;
    if (!this._merchant && s2.mc) this.ui?.toast("🧳 떠돌이 상인이 왔다! 이번 준비 시간에만 물건을 판다", "good");
    this._merchant = s2.mc ? { offers: s2.mc.offers, boughtBy: s2.mc.boughtBy || {} } : null;
    if (s2.tb) Object.assign(this.tempBoon, s2.tb);
    if (s2.fs) Object.assign(this.feast, s2.fs);
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
        p2.outfitLv = pd2.ol || 0;
        p2.weaponProficiencyLv = pd2.wp || 0;
        p2.tools = {};
        for (const k2 of pd2.tl || []) p2.tools[k2] = true;
        p2.weaponLv = pd2.wl || {};
        p2.weaponSpec = pd2.ws || {};
        if (p2 !== this.local) p2.equipped = pd2.eq || null;
        if (pd2.mh !== void 0 && pd2.mh !== p2.maxHp) {
          const delta = pd2.mh - p2.maxHp;
          p2.maxHp = pd2.mh;
          p2.hp = delta > 0 ? Math.min(p2.maxHp, p2.hp + delta) : Math.min(p2.hp, p2.maxHp);
        }
      }
    }
    if (s2.st) {
      Object.assign(this.stats, s2.st);
      if (this.stats.trapsTriggered >= 3) this._unlockAchievement("trapMaster");
      if (this.stats.elitesKilled >= 5) this._unlockAchievement("eliteHunter");
      if (this.stats.berserkKilled >= 5) this._unlockAchievement("berserkSlayer");
      if (this.stats.treasuresCaught >= 5) this._unlockAchievement("treasureHunter");
      if (this.stats.animalsHunted >= 10) this._unlockAchievement("hunter");
      if (this.stats.golemsDefeated >= 3) this._unlockAchievement("stoneBreaker");
      if (this.stats.comboCount >= 10) this._unlockAchievement("duoStrike");
      if (this.stats.critCount >= 20) this._unlockAchievement("criticalEye");
      if (this.stats.mimicsKilled >= 3) this._unlockAchievement("mimicHunter");
      if (this.stats.blocksCount >= 10) this._unlockAchievement("blockMaster");
      if (this.stats.parryCount >= 5) this._unlockAchievement("perfectParry");
      if (this.stats.repairPostHealed >= 500) this._unlockAchievement("medic");
      if (this.stats.campHealed >= 500) this._unlockAchievement("haven");
      if (this.stats.harvested >= 1e3) this._unlockAchievement("harvestKing");
      if (this.stats.relicsPicked >= 3) this._unlockAchievement("relicCollector");
      if (this.stats.dishesCooked.length >= Object.keys(CFG.cook).length) this._unlockAchievement("gourmet");
      if (this.stats.scoutsIntercepted >= 3) this._unlockAchievement("interceptor");
      if (this.stats.earlyStarts >= 5) this._unlockAchievement("earlyBird");
      if (this.stats.weathersSeen.length >= Object.keys(WEATHER).length) this._unlockAchievement("weatherSage");
      if (this.stats.bossKillsSeen.includes("boss") && this.stats.bossKillsSeen.includes("frostlord")) {
        this._unlockAchievement("bothBosses");
      }
      if (["boss", "frostlord", "warden"].every((t2) => this.stats.bossKillsSeen.includes(t2))) {
        this._unlockAchievement("allBosses");
      }
      if (["boss", "frostlord", "warden", "looter"].every((t2) => this.stats.bossKillsSeen.includes(t2))) {
        this._unlockAchievement("fourKings");
      }
      if (["boss", "frostlord", "warden", "looter", "colossus"].every((t2) => this.stats.bossKillsSeen.includes(t2))) {
        this._unlockAchievement("fiveGuardians");
      }
      if (["boss", "frostlord", "warden", "looter", "colossus", "wraith"].every((t2) => this.stats.bossKillsSeen.includes(t2))) {
        this._unlockAchievement("sixGuardians");
      }
      if (["boss", "frostlord", "warden", "looter", "colossus", "wraith", "galelord"].every((t2) => this.stats.bossKillsSeen.includes(t2))) {
        this._unlockAchievement("sevenStars");
      }
      if (["boss", "frostlord", "warden", "looter", "colossus", "wraith", "galelord", "curselord"].every((t2) => this.stats.bossKillsSeen.includes(t2))) {
        this._unlockAchievement("allEightBosses");
      }
      if (["boss", "frostlord", "warden", "looter", "colossus", "wraith", "galelord", "curselord", "grovelord"].every((t2) => this.stats.bossKillsSeen.includes(t2))) {
        this._unlockAchievement("allNineBosses");
      }
      if (["boss", "frostlord", "warden", "looter", "colossus", "wraith", "galelord", "curselord", "grovelord", "magnetlord"].every((t2) => this.stats.bossKillsSeen.includes(t2))) {
        this._unlockAchievement("allTenBosses");
      }
      if (["boss", "frostlord", "warden", "looter", "colossus", "wraith", "galelord", "curselord", "grovelord", "magnetlord", "shadowlord"].every((t2) => this.stats.bossKillsSeen.includes(t2))) {
        this._unlockAchievement("allElevenBosses");
      }
      if (["boss", "frostlord", "warden", "looter", "colossus", "wraith", "galelord", "curselord", "grovelord", "magnetlord", "shadowlord", "weblord"].every((t2) => this.stats.bossKillsSeen.includes(t2))) {
        this._unlockAchievement("allTwelveBosses");
      }
      if (["boss", "frostlord", "warden", "looter", "colossus", "wraith", "galelord", "curselord", "grovelord", "magnetlord", "shadowlord", "weblord", "splitlord"].every((t2) => this.stats.bossKillsSeen.includes(t2))) {
        this._unlockAchievement("allThirteenBosses");
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
      if (this.difficulty === "hell") this._unlockAchievement("hellConqueror");
      if (this.world.biome === "volcano") this._unlockAchievement("volcanoMaster");
      if (this.world.biome === "swamp") this._unlockAchievement("swampSurvivor");
      if (this.world.biome === "tundra") this._unlockAchievement("frostWalker");
      this._checkTeamEffort();
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
    if (!over) this.local.update(dt2, this.input, this.sm, this.grid, this.world, [...this.players.values()], this.feastSpeedMult * this.boonMult.moveSpeedMult * this.tempBoon.speed);
    if (!over && this.local.alive && this.feastRegenPerSec > 0) {
      this.local.hp = Math.min(this.local.maxHp, this.local.hp + this.feastRegenPerSec * dt2);
    }
    for (const p2 of this.players.values()) {
      if (p2 !== this.local && p2.update) p2.update(dt2);
    }
    if (this.isHost && !over) {
      this.wave.partySize = this.players.size;
      if (!this.pendingBoon) this.wave.update(dt2);
      this.enemyMgr.simulate(dt2, now, [...this.players.values()], this.buildMgr);
      this._updateTraps();
      this._updateSupplyDrops(dt2);
      this._updateMeteor(dt2);
      this._updateRiftRaid(dt2);
      this._updateCraters(dt2);
      this._updateSwampPits(dt2);
      this._updateIcePits(dt2);
      this._updateStorm(dt2);
      this._updateHail(dt2);
      this._updateTreasure(dt2);
      this._updateScout(dt2);
      this._updateRift(dt2);
      this._updateHunt(dt2);
      this._updateNest(dt2);
      this._updateSpirit(dt2);
      this._updatePet(dt2);
      this._updateMerchant();
      this._updateCrystalUpgrades(dt2);
      this._updateHarvesters(dt2);
      this._updateRepairPosts(dt2);
      this._updateHealCamps(dt2);
      this._updateArmories(dt2);
      this._updateShardTrickle(dt2);
      this._updateShardDrops(dt2);
    } else {
      this.enemyMgr.interpolate(dt2);
    }
    if (!over) {
      for (const d2 of this.world.drops) {
        if (d2.requested) continue;
        const pickupRadius = d2.kind === "shard" ? CFG.shardDrop.pickupRadius : CFG.supplyDrop.pickupRadius;
        if (dist(this.local.x, this.local.z, d2.x, d2.z) <= pickupRadius) {
          d2.requested = true;
          this.requestSupplyPickup(d2.id);
        }
      }
    }
    const weatherKind = this.wave.phase === PHASE.COMBAT ? weatherOf(this.wave.wave + 1) : null;
    this.world.weatherKind = weatherKind;
    this.sm.setWeather(weatherKind);
    this.sm.updateWeather(dt2);
    const rangeMult = (weatherKind === "fog" ? WEATHER.fog.towerRangeMult : 1) * this.boonMult.rangeMult * this.feastRangeMult;
    if (!over) {
      this._syncCrewedTowers();
      this.buildMgr.updateTowers(dt2, this.enemyMgr.list, now, rangeMult, this.boonMult.ammoSaveChance, this.isHost);
    }
    this.sm.setNightMode(this.wave.phase === PHASE.COMBAT && (this.wave.wave + 1) % CFG.wave.nightEvery === 0);
    this.sm.updateNight(dt2);
    const milestoneTier = crystalMilestoneTier(this.wave.wave);
    if (milestoneTier !== this.world.crystalMilestone) {
      this.world.setCrystalMilestone(milestoneTier);
      if (milestoneTier > 0) this.ui?.toast(`💍 크리스탈이 ${milestoneTier}번째 고리를 얻었다 — ${this.wave.wave}웨이브를 버텨낸 증표다`, "good");
    }
    this._updateMusicPhase();
    this.world.update(dt2, now, this.isHost);
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
    if (inp.hit(km.get("move"))) this.setBuildMode("move");
    if (inp.hit(km.get("targetMode"))) this.setBuildMode("targetMode");
    if (inp.hit(km.get("cancel"))) this.setBuildMode(null);
    if (inp.hit(km.get("shard"))) this.requestShard();
    if (inp.hit(km.get("skillBlast"))) this.requestSkillBlast();
    if (inp.hit(km.get("skillChill"))) this.requestSkillChill();
    if (inp.hit(km.get("skillBarrier"))) this.requestSkillBarrier();
    if (inp.hit(km.get("skillRift"))) this.requestSkillRift();
    if (inp.hit(km.get("skillSummon"))) this.requestSkillSummon();
    if (inp.hit(km.get("skillOverload"))) this.requestSkillOverload();
    if (inp.hit(km.get("tame"))) this.requestTame();
    if (inp.hit(km.get("releasePet"))) this.requestReleasePet();
    if (inp.hit(km.get("sealPortal"))) this.requestSealPortal();
    if (inp.hit(km.get("reload"))) this.requestReload();
    if (inp.hit(km.get("startWave")) && this.wave.phase === PHASE.PREP) this.requestStartWave();
    const pointer = this.sm.updatePointerWorld();
    const ghostRangeMult = (this.world.weatherKind === "fog" ? WEATHER.fog.towerRangeMult : 1) * this.boonMult.rangeMult * this.feastRangeMult;
    this.buildMgr.updateGhost(pointer, this.myPool, ghostRangeMult);
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
      } else if (this.buildMgr.mode === "targetMode") {
        const h2 = this.buildMgr.hover;
        if (h2 && !h2.isTower) this.ui?.toast("공격 타워만 우선순위를 바꿀 수 있습니다", "bad");
        else if (h2) this.requestTargetPriority(h2.id);
      } else if (this.buildMgr.mode === "move") {
        if (!this.buildMgr.relocateSource) {
          const h2 = this.buildMgr.hover;
          if (h2) {
            this.buildMgr.pickRelocateSource(h2);
            this.ui?.toast(`${h2.def.icon} ${h2.def.name}을(를) 옮길 위치를 선택하세요`, "warn");
          }
        } else if (this.buildMgr.ghostValid && this.buildMgr.ghostCell) {
          const c2 = this.buildMgr.ghostCell;
          this.requestRelocate(this.buildMgr.relocateSource.id, c2.gx, c2.gz);
          this.buildMgr.cancelRelocate();
        } else if (this.buildMgr.ghostReason) {
          this.ui?.toast(this.buildMgr.ghostReason, "bad");
        }
      } else if (this.buildMgr.hover?.stationKind) {
        this.tryOpenStation(this.buildMgr.hover);
      } else {
        this.clickWorld(pointer);
      }
    }
    if (inp.rightClicked && this.buildMgr.mode) this.setBuildMode(null);
    const wasCrewingLocal = this.local.crewing;
    if (this.local.alive && inp.down(km.get("crew")) && !this.buildMgr.mode) {
      const tw = this._nearestCrewableTower(this.local.x, this.local.z);
      this.local.crewing = tw ? tw.id : null;
    } else {
      this.local.crewing = null;
    }
    if (this.local.crewing && !wasCrewingLocal) {
      this.local.cancelHarvest();
      this.ui?.toast("🎯 타워 탑승! 화력이 크게 오르지만 그동안 움직이지도 공격하지도 못한다 — 키를 떼면 해제된다", "good");
    } else if (!this.local.crewing && wasCrewingLocal) {
      this.ui?.toast("타워 탑승 해제", "warn");
    }
    if (this.local.crewing) {
      this._crewSeconds = (this._crewSeconds || 0) + dt2;
      if (this._crewSeconds >= 30) this._unlockAchievement("towerCrewer");
      if (this.stats.everBuiltDecoy) this._unlockAchievement("tactician");
    }
    const wasBlockingLocal = this.local.blocking;
    this.local.blocking = this.local.alive && inp.down(km.get("block")) && !this.buildMgr.mode && !this.local.crewing;
    if (this.local.blocking && !wasBlockingLocal) this.local._blockStartAt = performance.now() / 1e3;
    if (this.local.blocking) this.local.cancelHarvest();
    if (inp.hit(km.get("attack")) && !this.local.blocking && !this.local.crewing) this.requestAttack();
    if (inp.hit(km.get("dash")) && !this.local.crewing && !this.local.rooted) this._tryDash();
    const holding = (inp.down(km.get("harvest")) || inp.down("e") || this.ui?.harvestHeld) && !this.local.blocking && !this.local.crewing;
    const done = this.local.tickHarvest(dt2, this.world, holding && !this.buildMgr.mode, this.boonMult.harvestTimeMult * this.tempBoon.harvest);
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
        blocking: l2.blocking,
        crewing: l2.crewing,
        // 절대 시각(rootedUntil)을 그대로 보내면 안 된다 — performance.now() 는 클라이언트마다
        // 기준점이 다른 로컬 시계라, 크리스탈 shieldUntil(cs 필드)과 같은 이유로 "남은 시간"만
        // 상대값으로 실어 보낸다. 받는 쪽은 자기 시계 기준으로 다시 절대 시각을 만든다.
        rootLeft: l2.rooted ? Math.max(0, Math.round((l2.rootedUntil - performance.now() / 1e3) * 10) / 10) : 0
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
      const s2 = save.snap;
      if (!s2.w || typeof s2.w.wave !== "number" || !s2.e || !s2.b || !s2.n || !s2.r || typeof s2.c !== "number") {
        return null;
      }
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
    if (this.daily && save.seed !== dateSeed()) {
      this.daily = false;
      this.ui?.toast("자정이 지나 더 이상 오늘의 도전 기록에는 반영되지 않습니다 — 이어서 플레이는 계속됩니다", "warn");
    }
    const s2 = save.snap;
    this.enemyMgr.applySnapshot(s2.e, s2.w.wave + 1);
    this.buildMgr.applySnapshot(s2.b);
    this.world.applyNodeSnapshot(s2.n);
    this.world.restartDepletedRespawns();
    this.wave.applySnapshot(s2.w);
    if (s2.cm) this.world.crystal.maxHp = s2.cm;
    if (s2.ca !== void 0) this.world.crystal.armorLv = s2.ca;
    if (s2.cr !== void 0) this.world.crystal.regenLv = s2.cr;
    if (s2.cx !== void 0) this.world.crystal.auraLv = s2.cx;
    if (s2.crf !== void 0) this.world.crystal.reflectLv = s2.crf;
    if (s2.cj !== void 0) this.world.crystal.judgeLv = s2.cj;
    if (s2.csk !== void 0) this.world.crystal.shockLv = s2.csk;
    if (s2.cg !== void 0) this.world.crystal.graceLv = s2.cg;
    if (s2.crn !== void 0) this.world.crystal.resonanceLv = s2.crn;
    if (s2.cml !== void 0) this.world.crystal.materielLv = s2.cml;
    this.world.crystal.shieldUntil = s2.cs != null ? performance.now() / 1e3 + s2.cs : 0;
    if (s2.d) this.world.applyDropSnapshot(s2.d);
    if (s2.mt) {
      this.world.setMeteor(s2.mt[0], s2.mt[1], s2.mt[2], CFG.meteor.radius);
      this._meteorPending = { x: s2.mt[0], z: s2.mt[1], timeLeft: s2.mt[2] };
    }
    if (s2.lc) {
      this.world.setCrater(s2.lc[0], s2.lc[1], s2.lc[2], CFG.meteor.craterRadius);
      this._crater = { x: s2.lc[0], z: s2.lc[1], timeLeft: s2.lc[2], tickTimer: 0 };
    }
    if (s2.sw) {
      const codeToPhase = { d: "dormant", w: "warn", a: "active" };
      for (let i = 0; i < s2.sw.length; i++) {
        const phase = codeToPhase[s2.sw[i]] || "dormant";
        this.world.setSwampPitPhase(i, phase);
        const t2 = this._swampTimers[i];
        if (t2) {
          t2.phase = phase;
          t2.timeLeft = s2.swt?.[i] ?? CFG.swampPit[phase];
          t2.tickTimer = 0;
        }
      }
    }
    if (s2.ip) {
      const codeToPhase = { d: "dormant", w: "warn", a: "active" };
      for (let i = 0; i < s2.ip.length; i++) {
        const phase = codeToPhase[s2.ip[i]] || "dormant";
        this.world.setIcePitPhase(i, phase);
        const t2 = this._icePitTimers[i];
        if (t2) {
          t2.phase = phase;
          t2.timeLeft = s2.ipt?.[i] ?? CFG.icePit[phase];
        }
      }
    }
    if (s2.rf) {
      this.world.setRift(s2.rf[0], s2.rf[1], s2.rf[2], CFG.skills.rift.radius);
      this._rift = { x: s2.rf[0], z: s2.rf[1], timeLeft: s2.rf[2] };
    }
    if (s2.sp) {
      this.world.setSpirit(s2.sp[0], s2.sp[1], s2.sp[2]);
      this._spirit = { x: s2.sp[0], z: s2.sp[1], ownerId: this.local.id, timeLeft: s2.sp[2], cd: 0 };
    }
    if (s2.bm) {
      Object.assign(this.boonMult, s2.bm);
      this.wave.prepBonus = this.boonMult.prepDelta || 0;
    }
    if (s2.pb) this.pickedBoons = s2.pb;
    this._riskArmed = !!s2.rk;
    if (s2.sr) this._shardTrickleStacks = s2.sr;
    if (s2.tb) Object.assign(this.tempBoon, s2.tb);
    if (s2.et) [this._dropTimer, this._shardDropTimer, this._meteorTimer, this._riftRaidTimer, this._huntTimer, this._treasureTimer, this._scoutTimer, this._nestTimer] = s2.et;
    this._merchant = s2.mc ? { offers: s2.mc.offers, boughtBy: s2.mc.boughtBy || {} } : null;
    if (s2.fs) Object.assign(this.feast, s2.fs);
    if (s2.pt) {
      this._pet = { type: s2.pt[2], x: s2.pt[0], z: s2.pt[1], rot: s2.pt[3] || 0, lv: s2.pt[4] || 0, ownerId: this.local.id, cd: 0 };
      this.world.setPet(s2.pt[0], s2.pt[1], s2.pt[2], s2.pt[3], s2.pt[4] || 0);
    }
    if (s2.psl) {
      const sealedSet = new Set(s2.psl);
      this.world.portals.forEach((po2, i) => po2.sealed = sealedSet.has(i));
    }
    this.world.crystal.hp = s2.c;
    if (s2.r.team) this.pools.team = s2.r.team;
    if (s2.r.byId) this.pools.byId = s2.r.byId;
    const savedPlayer = Object.values(s2.p || {})[0];
    if (savedPlayer) {
      this.local.harvestLv = savedPlayer.hv;
      this.local.outfitLv = savedPlayer.ol || 0;
      this.local.weaponProficiencyLv = savedPlayer.wp || 0;
      this.local.tools = {};
      for (const k2 of savedPlayer.tl || []) this.local.tools[k2] = true;
      this.local.weaponLv = savedPlayer.wl || {};
      this.local.weaponSpec = savedPlayer.ws || {};
      this.local.equipped = savedPlayer.eq || null;
      if (savedPlayer.mh > this.local.maxHp) {
        this.local.maxHp = savedPlayer.mh;
        this.local.hp = this.local.maxHp;
      }
    }
    if (save.stats) this.stats = save.stats;
    if (!this.stats.newAchievements) this.stats.newAchievements = [];
    if (!this.stats.bossKillsSeen) this.stats.bossKillsSeen = [];
    if (!this.stats.weathersSeen) this.stats.weathersSeen = [];
    if (!this.stats.dishesCooked) this.stats.dishesCooked = [];
    if (!this.stats.trapsTriggered) this.stats.trapsTriggered = 0;
    if (this.stats.spentBy && !this.stats.spentBy.merchant) this.stats.spentBy.merchant = { wood: 0, stone: 0, iron: 0, copper: 0, coal: 0, shard: 0 };
    if (this.stats.spentBy && !this.stats.spentBy.portalSeal) this.stats.spentBy.portalSeal = { wood: 0, stone: 0, iron: 0, copper: 0, coal: 0, shard: 0 };
    if (!this.stats.elitesKilled) this.stats.elitesKilled = 0;
    if (!this.stats.berserkKilled) this.stats.berserkKilled = 0;
    if (!this.stats.treasuresCaught) this.stats.treasuresCaught = 0;
    if (!this.stats.golemsDefeated) this.stats.golemsDefeated = 0;
    if (!this.stats.comboCount) this.stats.comboCount = 0;
    if (!this.stats.critCount) this.stats.critCount = 0;
    if (!this.stats.repairPostHealed) this.stats.repairPostHealed = 0;
    if (!this.stats.campHealed) this.stats.campHealed = 0;
    if (!this.stats.scoutsIntercepted) this.stats.scoutsIntercepted = 0;
    if (!this.stats.earlyStarts) this.stats.earlyStarts = 0;
    this.ui?.toast(`이어하기 — 웨이브 ${this.wave.displayWave}`, "good");
  }
  render() {
    this.sm.render();
  }
};
