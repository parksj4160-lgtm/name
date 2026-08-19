class GameManager {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.player = null;
    this.enemies = [];
    this.effects = [];
    this.particles = [];
    this.waveManager = new WaveManager();
    this.crystalHp = CONFIG.CRYSTAL_START_HP;
    this.crystalMaxHp = CONFIG.CRYSTAL_START_HP;
    this.isPaused = false;
    this.isGameOver = false;
    this.gameMode = null;
    this.players = [];
    this.keys = {};
    this.animationFrameId = null;
    this.lastFrameTime = Date.now();
    this.totalEssence = 0;
    this.totalKills = 0;

    this.initCanvas();
    this.setupInputHandlers();
  }

  initCanvas() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = CONFIG.GAME_WIDTH;
    this.canvas.height = CONFIG.GAME_HEIGHT;
    this.ctx = this.canvas.getContext('2d');
    document.getElementById('game-container').appendChild(this.canvas);
  }

  setupInputHandlers() {
    document.addEventListener('keydown', (e) => {
      this.keys[e.key] = true;
      if (e.key === 'Escape') {
        this.togglePause();
      }
    });

    document.addEventListener('keyup', (e) => {
      this.keys[e.key] = false;
    });

    // 터치 조작 (모바일)
    this.setupTouchControls();
  }

  setupTouchControls() {
    // 모바일 조이스틱 구현 (선택사항)
    // 여기서는 간단하게 화면 터치로 이동하는 방식 사용
    this.canvas.addEventListener('touchmove', (e) => {
      if (!this.player) return;
      const touch = e.touches[0];
      this.player.x = touch.clientX;
      this.player.y = touch.clientY;
    });
  }

  startGame(mode, players = []) {
    this.gameMode = mode;
    this.players = players;
    this.isGameOver = false;
    this.isPaused = false;

    // 저장된 능력치 로드
    const savedStats = JSON.parse(localStorage.getItem('player_stats') || '{}');

    this.player = new Player(CONFIG.GAME_WIDTH / 2, CONFIG.GAME_HEIGHT / 2);

    // 영구 강화 능력치 적용
    if (savedStats.damage_boost) this.player.attackDamage *= savedStats.damage_boost;
    if (savedStats.speed_boost) this.player.speed *= savedStats.speed_boost;
    if (savedStats.hp_boost) this.player.maxHp += savedStats.hp_boost;
    if (savedStats.regen) this.player.regen = savedStats.regen;
    if (savedStats.essence_multiplier) this.player.essenceMultiplier = savedStats.essence_multiplier;

    this.enemies = [];
    this.effects = [];
    this.particles = [];
    this.crystalHp = CONFIG.CRYSTAL_START_HP;
    this.totalEssence = 0;
    this.totalKills = 0;

    window.uiManager.hideModal('menu-main');
    window.uiManager.hideModal('menu-lobby');

    this.startWave();
    this.gameLoop();
  }

  startWave() {
    if (!this.waveManager.startWave()) {
      this.endGame(true);
      return;
    }

    window.uiManager.updateWaveInfo(
      this.waveManager.currentWave,
      CONFIG.MAX_WAVES,
      this.crystalHp,
      this.crystalMaxHp,
    );
  }

  endWave() {
    window.uiManager.showWaveCompleteUpgrades();
  }

  selectWaveUpgrade(upgrade) {
    switch (upgrade.type) {
      case 'crystal_heal':
        this.crystalHp = Math.min(this.crystalMaxHp, this.crystalHp + upgrade.value);
        break;
      case 'crystal_max_hp':
        this.crystalMaxHp += upgrade.value;
        this.crystalHp = this.crystalMaxHp;
        break;
      case 'essence_bonus':
        this.player.essence += upgrade.value;
        break;
    }

    this.startWave();
  }

  selectLevelUpgrade(upgrade) {
    this.player.levelUp(upgrade);
  }

  gameLoop = () => {
    const now = Date.now();
    const dt = Math.min((now - this.lastFrameTime) / 1000, 0.016); // 최대 16ms
    this.lastFrameTime = now;

    if (!this.isPaused && !this.isGameOver) {
      this.update(dt);
    }

    this.draw();
    this.animationFrameId = requestAnimationFrame(this.gameLoop);
  };

  update(dt) {
    if (!this.player) return;

    // 플레이어 업데이트
    this.player.handleInput(this.keys);
    this.player.update(dt);

    // 웨이브 업데이트
    if (this.waveManager.isWaveActive) {
      const newEnemy = this.waveManager.update(dt);
      if (newEnemy) {
        this.enemies.push(newEnemy);
      }
    } else if (this.waveManager.getEnemiesRemaining() === 0 && this.enemies.length === 0) {
      if (this.waveManager.currentWave < CONFIG.MAX_WAVES) {
        this.endWave();
      } else {
        this.endGame(true);
      }
    }

    // 적 업데이트
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      enemy.update(dt, this.player);

      // 플레이어와의 충돌
      const dist = this.player.distanceTo(enemy);
      if (dist < this.player.size + enemy.size) {
        this.player.takeDamage(enemy.damage * dt);
        if (this.player.hp <= 0) {
          this.endGame(false);
          return;
        }
      }

      if (enemy.isDead) {
        this.enemies.splice(i, 1);
        this.player.kills++;
        this.totalKills++;
        this.player.addEssence(enemy.essence_reward);
        this.totalEssence += enemy.essence_reward;

        // 이펙트 생성
        this.effects.push(new Effect(enemy.x, enemy.y, 'essence', enemy.essence_reward));

        // 파티클 생성
        for (let j = 0; j < 5; j++) {
          const angle = (Math.PI * 2 * j) / 5;
          const vx = Math.cos(angle) * 150;
          const vy = Math.sin(angle) * 150;
          this.particles.push(new Particle(enemy.x, enemy.y, vx, vy, enemy.color, 4, 0.5));
        }

        // 레벨 업 체크
        if (this.player.kills % 10 === 0) {
          window.uiManager.showLevelUpChoices();
          this.isPaused = true;
        }
      }
    }

    // 플레이어 공격
    const target = this.player.tryAttack(this.enemies);
    if (target) {
      target.takeDamage(this.player.attackDamage);
    }

    // 수정으로 향하는 적 처리
    for (const enemy of this.enemies) {
      const dist = Math.sqrt(
        Math.pow(enemy.x - CONFIG.GAME_WIDTH / 2, 2) +
          Math.pow(enemy.y - CONFIG.GAME_HEIGHT / 2, 2),
      );

      if (dist < 50) {
        // 수정 도달
        this.crystalHp -= enemy.damage * dt;
        if (this.crystalHp <= 0) {
          this.endGame(false);
          return;
        }
      }
    }

    // 이펙트 업데이트
    for (let i = this.effects.length - 1; i >= 0; i--) {
      this.effects[i].update(dt);
      if (this.effects[i].isDone()) {
        this.effects.splice(i, 1);
      }
    }

    // 파티클 업데이트
    for (let i = this.particles.length - 1; i >= 0; i--) {
      this.particles[i].update(dt);
      if (this.particles[i].isDone()) {
        this.particles.splice(i, 1);
      }
    }

    // UI 업데이트
    window.uiManager.updateWaveInfo(
      this.waveManager.currentWave,
      CONFIG.MAX_WAVES,
      this.crystalHp,
      this.crystalMaxHp,
    );
    window.uiManager.updatePlayerStats(
      this.player.essence,
      this.player.level,
      this.waveManager.highestWave,
    );
  }

  draw() {
    // 배경
    this.ctx.fillStyle = '#0f172a';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 수정 (중앙)
    this.ctx.fillStyle = '#06b6d4';
    this.ctx.beginPath();
    this.ctx.arc(CONFIG.GAME_WIDTH / 2, CONFIG.GAME_HEIGHT / 2, 30, 0, Math.PI * 2);
    this.ctx.fill();

    // 수정 HP 표시
    const crystalBarWidth = 100;
    const crystalBarHeight = 8;
    this.ctx.fillStyle = '#333';
    this.ctx.fillRect(
      CONFIG.GAME_WIDTH / 2 - crystalBarWidth / 2,
      CONFIG.GAME_HEIGHT / 2 - 50,
      crystalBarWidth,
      crystalBarHeight,
    );
    this.ctx.fillStyle = '#ef4444';
    this.ctx.fillRect(
      CONFIG.GAME_WIDTH / 2 - crystalBarWidth / 2,
      CONFIG.GAME_HEIGHT / 2 - 50,
      (this.crystalHp / this.crystalMaxHp) * crystalBarWidth,
      crystalBarHeight,
    );

    // 플레이어
    if (this.player) {
      this.player.draw(this.ctx);
    }

    // 적
    for (const enemy of this.enemies) {
      enemy.draw(this.ctx);
    }

    // 이펙트
    for (const effect of this.effects) {
      effect.draw(this.ctx);
    }

    // 파티클
    for (const particle of this.particles) {
      particle.draw(this.ctx);
    }

    // 일시정지 표시
    if (this.isPaused && !this.isGameOver) {
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.fillStyle = '#fbbf24';
      this.ctx.font = '48px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('일시정지됨', this.canvas.width / 2, this.canvas.height / 2);
    }
  }

  togglePause() {
    if (this.isGameOver) return;
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      window.uiManager.showModal('menu-pause');
    } else {
      window.uiManager.hideModal('menu-pause');
    }
  }

  endGame(isVictory) {
    this.isGameOver = true;
    cancelAnimationFrame(this.animationFrameId);

    // 통계 저장
    localStorage.setItem('highest_wave', Math.max(
      parseInt(localStorage.getItem('highest_wave') || 0),
      this.waveManager.highestWave,
    ));
    localStorage.setItem('total_kills', (parseInt(localStorage.getItem('total_kills') || 0) + this.totalKills).toString());

    // 영혼조각 보상 (10 점수당 1 영혼조각)
    const soulReward = Math.floor(this.totalEssence / 10);
    localStorage.setItem('soul_fragments', (parseInt(localStorage.getItem('soul_fragments') || 0) + soulReward).toString());

    window.uiManager.showGameOver(
      this.waveManager.currentWave,
      this.totalKills,
      this.totalEssence,
    );
  }
}

window.gameManager = new GameManager();
