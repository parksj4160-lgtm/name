// 웨이브 디렉터: 준비 시간 → 스폰 → 클리어 보상 → 다음 준비.
// "웨이브 시작" 버튼으로 준비 시간을 건너뛸 수 있고, 시간이 다 되면 자동으로 시작된다.
import { CFG, waveComposition, waveReward } from './config.js';
import { pick } from './utils.js';

export const PHASE = { PREP: 'prep', COMBAT: 'combat', WON: 'won', LOST: 'lost' };

export class WaveDirector {
  constructor(world, enemies) {
    this.world = world;
    this.enemies = enemies;
    this.reset();
    this.onWaveStart = null;
    this.onWaveClear = null;
  }

  reset() {
    this.wave = 0;                 // 완료한 웨이브 수
    this.phase = PHASE.PREP;
    this.prepLeft = CFG.wave.firstPrepTime;
    this.queue = [];               // 남은 스폰 목록
    this.spawnTimer = 0;
    this.spawnedThisWave = 0;
    this.totalThisWave = 0;
  }

  get displayWave() { return Math.min(CFG.wave.goal, this.wave + 1); }
  get remaining() { return this.queue.length + this.enemies.alive; }

  startWave() {
    if (this.phase !== PHASE.PREP) return false;
    const w = this.wave + 1;
    this.phase = PHASE.COMBAT;
    this.queue = [];
    for (const { type, count } of waveComposition(w)) {
      for (let i = 0; i < count; i++) this.queue.push(type);
    }
    // 순서를 섞어서 몰려오게
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
    this.totalThisWave = this.queue.length;
    this.spawnedThisWave = 0;
    this.spawnTimer = 0.4;
    this.onWaveStart?.(w, this.totalThisWave);
    return true;
  }

  update(dt) {
    if (this.phase === PHASE.PREP) {
      this.prepLeft -= dt;
      if (this.prepLeft <= 0) this.startWave();
      return;
    }
    if (this.phase !== PHASE.COMBAT) return;

    if (this.queue.length) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = CFG.wave.spawnGap * (this.queue.length > 20 ? 0.6 : 1);
        const type = this.queue.shift();
        const portal = pick(this.world.portals);
        const jitter = 3;
        const spawned = this.enemies.spawn(
          type, this.wave + 1,
          portal.x + (Math.random() - 0.5) * jitter,
          portal.z + (Math.random() - 0.5) * jitter
        );
        // 동시 등장 상한(성능 보호)에 걸리면 버리지 않고 잠시 뒤 다시 시도한다
        if (spawned) this.spawnedThisWave++;
        else { this.queue.unshift(type); this.spawnTimer = 1.0; }
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

  lose() { this.phase = PHASE.LOST; }

  // 남은 스폰 대기열은 종류별 개수로 압축해서 보낸다.
  // (호스트가 나가서 승계가 일어나도 새 호스트가 웨이브를 이어서 스폰할 수 있다)
  snapshot() {
    const q = {};
    for (const t of this.queue) q[t] = (q[t] || 0) + 1;
    return {
      wave: this.wave, phase: this.phase,
      prepLeft: Math.round(this.prepLeft * 10) / 10,
      q, total: this.totalThisWave,
    };
  }
  applySnapshot(s) {
    if (!s) return;
    this.wave = s.wave;
    this.phase = s.phase;
    this.prepLeft = s.prepLeft;
    this.totalThisWave = s.total;
    this.queue = [];
    for (const [type, n] of Object.entries(s.q || {})) {
      for (let i = 0; i < n; i++) this.queue.push(type);
    }
  }
}
