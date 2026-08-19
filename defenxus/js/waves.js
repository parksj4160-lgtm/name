class WaveManager {
  constructor() {
    this.currentWave = 0;
    this.isWaveActive = false;
    this.wavePrepTime = CONFIG.WAVE.PREP_TIME;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.spawnInterval = 2;
    this.highestWave = 0;
  }

  startWave() {
    if (this.currentWave >= CONFIG.MAX_WAVES) {
      return false;
    }

    this.currentWave++;
    this.isWaveActive = true;
    this.generateSpawnQueue();
    this.spawnTimer = 0;
    return true;
  }

  generateSpawnQueue() {
    this.spawnQueue = [];
    const baseSpawns = {
      GRUNT: 5,
      RUNNER: 2,
      TANK: 1,
      BOSS: 0,
    };

    const waveMultiplier = Math.pow(CONFIG.WAVE.SPAWN_MULTIPLIER, this.currentWave - 1);

    for (const [type, count] of Object.entries(baseSpawns)) {
      const finalCount = Math.floor(count * waveMultiplier);
      for (let i = 0; i < finalCount; i++) {
        this.spawnQueue.push(type);
      }
    }

    // 10, 15, 20 파동에 보스 추가
    if (this.currentWave === 10 || this.currentWave === 15 || this.currentWave === 20) {
      this.spawnQueue.push('BOSS');
    }

    // 순서 섞기
    for (let i = this.spawnQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.spawnQueue[i], this.spawnQueue[j]] = [this.spawnQueue[j], this.spawnQueue[i]];
    }
  }

  update(dt) {
    if (!this.isWaveActive) return null;

    this.spawnTimer += dt;

    let newEnemy = null;

    if (this.spawnTimer >= this.spawnInterval && this.spawnQueue.length > 0) {
      const type = this.spawnQueue.shift();
      newEnemy = this.spawnEnemy(type);
      this.spawnTimer = 0;
    }

    // 모든 적이 소환되었고 0마리 남음
    if (this.spawnQueue.length === 0 && this.isWaveActive) {
      this.isWaveActive = false;
      this.highestWave = Math.max(this.highestWave, this.currentWave);
    }

    return newEnemy;
  }

  spawnEnemy(type) {
    const angle = Math.random() * Math.PI * 2;
    const distance = CONFIG.SPAWN_DISTANCE;
    const centerX = CONFIG.GAME_WIDTH / 2;
    const centerY = CONFIG.GAME_HEIGHT / 2;

    const x = centerX + Math.cos(angle) * distance;
    const y = centerY + Math.sin(angle) * distance;

    const enemy = new Enemy(x, y, type);

    // 웨이브에 따라 난이도 조정
    const scaling = Math.pow(CONFIG.WAVE.HP_MULTIPLIER, this.currentWave - 1);
    enemy.hp *= scaling;
    enemy.maxHp *= scaling;

    const dmgScaling = Math.pow(CONFIG.WAVE.DAMAGE_MULTIPLIER, this.currentWave - 1);
    enemy.damage *= dmgScaling;

    const speedScaling = Math.pow(CONFIG.WAVE.SPEED_MULTIPLIER, this.currentWave - 1);
    enemy.speed *= speedScaling;

    return enemy;
  }

  getEnemiesRemaining() {
    return this.spawnQueue.length;
  }

  isComplete() {
    return this.currentWave >= CONFIG.MAX_WAVES && !this.isWaveActive;
  }
}
