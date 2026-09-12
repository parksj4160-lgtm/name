import { CFG, rollElite, rollVariant, specialWaveKind, waveComposition, waveReward } from './config.js';
import { pick } from './utils.js';

export var PHASE = { PREP: "prep", COMBAT: "combat", WON: "won", LOST: "lost" };
export var WaveDirector = class {
  constructor(world, enemies) {
    this.world = world;
    this.enemies = enemies;
    this.reset();
    this.onWaveStart = null;
    this.onWaveClear = null;
  }
  reset() {
    this.wave = 0;
    this.phase = PHASE.PREP;
    this.prepLeft = CFG.wave.firstPrepTime;
    this.queue = [];
    this.spawnTimer = 0;
    this.spawnedThisWave = 0;
    this.totalThisWave = 0;
    this.endless = false;
    this._specialKind = null;
    this._siegePortal = null;
    this.prepBonus = 0;
    this._scoutPenalty = false;
    this._thisWavePenalty = false;
    this.partySize = 1;
  }
  get displayWave() {
    return Math.min(CFG.wave.goal, this.wave + 1);
  }
  get remaining() {
    return this.queue.length + this.enemies.aliveInWave;
  }
  // 🪨 봉쇄된 포탈은 스폰 후보에서 빠진다 — 전부 봉쇄되는 일은 hostSealPortal이 마지막 하나는
  // 못 막게 미리 막아 두므로 정상 플레이에서는 없지만, 방어적으로 전부 막혔으면 그냥 전체를 쓴다.
  _openPortals() {
    const open = this.world.portals.filter((p2) => !p2.sealed);
    return open.length ? open : this.world.portals;
  }
  startWave() {
    if (this.phase !== PHASE.PREP) return false;
    const w2 = this.wave + 1;
    this.phase = PHASE.COMBAT;
    this.queue = [];
    for (const { type, count } of waveComposition(w2, this.partySize)) {
      for (let i = 0; i < count; i++) this.queue.push(type);
    }
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
    this.totalThisWave = this.queue.length;
    this.spawnedThisWave = 0;
    this.spawnTimer = 0.4;
    this._eliteSpawnedThisWave = false;
    this._specialKind = specialWaveKind(w2);
    this._siegePortal = this._specialKind === "siege" ? pick(this._openPortals()) : null;
    this._thisWavePenalty = this._scoutPenalty;
    this._scoutPenalty = false;
    this.onWaveStart?.(w2, this.totalThisWave);
    return true;
  }
  update(dt2) {
    if (this.phase === PHASE.PREP) {
      this.prepLeft -= dt2;
      if (this.prepLeft <= 0) this.startWave();
      return;
    }
    if (this.phase !== PHASE.COMBAT) return;
    if (this.queue.length) {
      this.spawnTimer -= dt2;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = CFG.wave.spawnGap * (this.queue.length > 20 ? 0.6 : 1);
        const type = this.queue.shift();
        const portal = this._siegePortal || pick(this._openPortals());
        const jitter = this._siegePortal ? 1.6 : 3;
        const isBossType = !!CFG.enemies[type]?.boss;
        let variant = null, statMult = void 0;
        const forceElite = !isBossType && this._specialKind === "elite";
        if (!isBossType && (forceElite || !this._eliteSpawnedThisWave && rollElite(this.wave + 1))) {
          this._eliteSpawnedThisWave = true;
          const ec = CFG.elite;
          statMult = { hp: ec.hpMult, scale: ec.scaleMult, dmg: ec.dmgMult, bounty: ec.bountyMult, elite: true };
        } else if (!isBossType) {
          variant = this._specialKind === "ward" ? "ward" : this._specialKind === "frenzy" ? "vampire" : this._specialKind === "bulwark" ? "shield" : this._specialKind === "immune" ? "resist" : this._specialKind === "armorlegion" ? "armored" : this._specialKind === "phantomlegion" ? "phantom" : this._specialKind === "splitlegion" ? "split" : this._specialKind === "thornlegion" ? "thorn" : this._specialKind === "regenlegion" ? "regen" : this._specialKind === "berserklegion" ? "berserk" : this._specialKind === "dashlegion" ? "dash" : rollVariant(this.wave + 1);
        }
        if (this._thisWavePenalty && !isBossType) {
          const sc = CFG.scoutEvent;
          statMult = statMult ? { ...statMult, hp: (statMult.hp ?? 1) * sc.penaltyHpMult, dmg: (statMult.dmg ?? 1) * sc.penaltyDmgMult } : { hp: sc.penaltyHpMult, dmg: sc.penaltyDmgMult };
        }
        const spawned = this.enemies.spawn(
          type,
          this.wave + 1,
          portal.x + (Math.random() - 0.5) * jitter,
          portal.z + (Math.random() - 0.5) * jitter,
          void 0,
          variant,
          statMult
        );
        if (spawned) this.spawnedThisWave++;
        else {
          if (statMult?.elite && !forceElite) this._eliteSpawnedThisWave = false;
          this.queue.unshift(type);
          this.spawnTimer = 1;
        }
      }
    } else if (this.enemies.aliveInWave === 0) {
      this._clear();
    }
  }
  _clear() {
    this.wave += 1;
    const reward = waveReward(this.wave);
    for (const p2 of this.world.portals) p2.sealed = false;
    if (this.wave >= CFG.wave.goal && !this.endless) {
      this.phase = PHASE.WON;
      this.onWaveClear?.(this.wave, reward, true);
      return;
    }
    this.phase = PHASE.PREP;
    this.prepLeft = CFG.wave.prepTime + this.prepBonus;
    this.onWaveClear?.(this.wave, reward, false);
  }
  // 승리 화면의 "계속하기": 목표 웨이브에서 멈추지 않고 그대로 이어간다
  continueEndless() {
    if (this.phase !== PHASE.WON) return false;
    this.endless = true;
    this.phase = PHASE.PREP;
    this.prepLeft = CFG.wave.prepTime + this.prepBonus;
    return true;
  }
  lose() {
    this.phase = PHASE.LOST;
  }
  // 남은 스폰 대기열은 종류별 개수로 압축해서 보낸다.
  // (호스트가 나가서 승계가 일어나도 새 호스트가 웨이브를 이어서 스폰할 수 있다)
  //
  // _specialKind(결계·면역·중장갑 군단 같은 특수 웨이브의 강제 변종)·_siegePortal(공성 웨이브
  // 전용 고정 포탈)·_eliteSpawnedThisWave(웨이브당 정예 1마리 제한)·_thisWavePenalty(정찰병
  // 놓친 패널티)는 전부 startWave()에서 한 번 정해진 뒤 스폰 큐가 소진될 때까지(전투 내내) 남아
  // 있어야 하는 상태인데, 이 스냅샷에 안 실려 있었다 — 그래서 전투 도중 저장했다가 이어하기(또는
  // 멀티플레이 호스트 승계)를 하면 새 WaveDirector가 reset()으로 이 필드들을 전부 초기값(null·
  // false)으로 되돌린 채 나머지 큐를 스폰한다: 특수 웨이브의 강제 변종이 그 순간부터 뚝 끊기고
  // (남은 몬스터가 평소 확률로만 변종을 달고), 공성 웨이브는 고정 포탈 대신 무작위 포탈에서
  // 쏟아지고, 정예 제한·정찰병 패널티도 리셋된다 — 전부 콘솔 에러 없이 조용히 웨이브의 정체성만
  // 깨지는 버그였다. special은 wave 번호만으로 결정되는 순수 함수라 굳이 값을 안 실어도
  // applySnapshot에서 다시 계산하면 되지만(이전 세이브 파일과의 하위 호환도 이 재계산이 처리한다),
  // 나머지 셋은 그 순간의 스폰 이력에 달려 있어 값을 그대로 실어야 한다.
  snapshot() {
    const q = {};
    for (const t2 of this.queue) q[t2] = (q[t2] || 0) + 1;
    return {
      wave: this.wave,
      phase: this.phase,
      prepLeft: Math.round(this.prepLeft * 10) / 10,
      q,
      total: this.totalThisWave,
      endless: this.endless,
      special: this._specialKind,
      siegePortal: this._siegePortal ? this.world.portals.indexOf(this._siegePortal) : -1,
      eliteSpawned: !!this._eliteSpawnedThisWave,
      wavePenalty: !!this._thisWavePenalty,
      // wavePenalty(_thisWavePenalty)는 이미 전투로 "확정"된 페널티다. _scoutPenalty는 그 전
      // 단계 — 준비 시간 중 정찰병을 놓쳐서 "다음 웨이브가 시작되면" 페널티로 확정될 예정인
      // 상태다. startWave()가 그 확정을 하기 전까지는 이 필드로만 존재하는데 스냅샷에 안 실려
      // 있었다 — 정찰병을 놓친 직후(아직 다음 웨이브가 시작되지 않은 준비 시간 중)에 저장하고
      // 이어하거나 호스트가 승계되면, 새 WaveDirector가 reset()으로 이 값을 false로 되돌린 채
      // 다음 startWave()를 맞아 "다음 웨이브가 더 강해진다"던 경고가 조용히 무효화됐다.
      scoutPending: !!this._scoutPenalty
    };
  }
  applySnapshot(s2) {
    if (!s2) return;
    this.wave = s2.wave;
    this.phase = s2.phase;
    this.prepLeft = s2.prepLeft;
    this.totalThisWave = s2.total;
    this.endless = !!s2.endless;
    this.queue = [];
    for (const [type, n] of Object.entries(s2.q || {})) {
      for (let i = 0; i < n; i++) this.queue.push(type);
    }
    this._specialKind = s2.special !== void 0 ? s2.special : specialWaveKind(this.wave + 1);
    this._siegePortal = s2.siegePortal !== void 0 ? this.world.portals[s2.siegePortal] || null : this._specialKind === "siege" ? pick(this.world.portals) : null;
    this._eliteSpawnedThisWave = !!s2.eliteSpawned;
    this._thisWavePenalty = !!s2.wavePenalty;
    this._scoutPenalty = !!s2.scoutPending;
  }
};
