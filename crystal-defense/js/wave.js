import { CFG, waveComposition, waveReward } from './config.js';
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
  }
  get displayWave() {
    return Math.min(CFG.wave.goal, this.wave + 1);
  }
  get remaining() {
    return this.queue.length + this.enemies.alive;
  }
  startWave() {
    if (this.phase !== PHASE.PREP) return false;
    const w2 = this.wave + 1;
    this.phase = PHASE.COMBAT;
    this.queue = [];
    for (const { type, count } of waveComposition(w2)) {
      for (let i = 0; i < count; i++) this.queue.push(type);
    }
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
    this.totalThisWave = this.queue.length;
    this.spawnedThisWave = 0;
    this.spawnTimer = 0.4;
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
        const portal = pick(this.world.portals);
        const jitter = 3;
        const spawned = this.enemies.spawn(
          type,
          this.wave + 1,
          portal.x + (Math.random() - 0.5) * jitter,
          portal.z + (Math.random() - 0.5) * jitter
        );
        if (spawned) this.spawnedThisWave++;
        else {
          this.queue.unshift(type);
          this.spawnTimer = 1;
        }
      }
    } else if (this.enemies.alive === 0) {
      this._clear();
    }
  }
  _clear() {
    this.wave += 1;
    const reward = waveReward(this.wave);
    if (this.wave >= CFG.wave.goal) {
      this.phase = PHASE.WON;
      this.onWaveClear?.(this.wave, reward, true);
      return;
    }
    this.phase = PHASE.PREP;
    this.prepLeft = CFG.wave.prepTime;
    this.onWaveClear?.(this.wave, reward, false);
  }
  lose() {
    this.phase = PHASE.LOST;
  }
  // 남은 스폰 대기열은 종류별 개수로 압축해서 보낸다.
  // (호스트가 나가서 승계가 일어나도 새 호스트가 웨이브를 이어서 스폰할 수 있다)
  snapshot() {
    const q = {};
    for (const t2 of this.queue) q[t2] = (q[t2] || 0) + 1;
    return {
      wave: this.wave,
      phase: this.phase,
      prepLeft: Math.round(this.prepLeft * 10) / 10,
      q,
      total: this.totalThisWave
    };
  }
  applySnapshot(s2) {
    if (!s2) return;
    this.wave = s2.wave;
    this.phase = s2.phase;
    this.prepLeft = s2.prepLeft;
    this.totalThisWave = s2.total;
    this.queue = [];
    for (const [type, n] of Object.entries(s2.q || {})) {
      for (let i = 0; i < n; i++) this.queue.push(type);
    }
  }
};
