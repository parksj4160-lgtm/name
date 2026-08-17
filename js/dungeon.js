function drawDungeonBg(ctx) {
  const grad = ctx.createLinearGradient(0, 0, 0, LOGICAL_H);
  grad.addColorStop(0, '#2b1f45');
  grad.addColorStop(1, '#4a3466');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
}

class DungeonScene {
  constructor(gm, floor, companions) {
    this.gm = gm;
    this.floor = floor;
    this.isCombat = true;
    this.worldWidth = 2400;
    this.spawnX = 120;
    this.enemies = [];
    this.waves = [3, 3, 3];
    this.waveIndex = 0;
    this.bossSpawned = false;
    this.bossPending = false;
    this.cleared = false;
    this.nextSpawnTimer = 0.6;

    gm.party.clear();
    (companions || []).forEach(c => gm.party.addMember(c));
  }

  spawnWave() {
    const count = this.waves[this.waveIndex] || 0;
    for (let i = 0; i < count; i++) {
      const lvl = this.floor + this.waveIndex;
      this.enemies.push(new Enemy({
        x: 700 + this.waveIndex * 400 + i * 90,
        level: lvl,
        maxHp: 40 + lvl * 22,
        attack: 5 + lvl * 3,
        expReward: 20 + lvl * 8,
        goldReward: 12 + lvl * 6,
      }));
    }
  }

  spawnBoss() {
    this.bossSpawned = true;
    const lvl = this.floor * 3 + 3;
    this.enemies.push(new Enemy({
      x: this.worldWidth - 220,
      level: lvl,
      maxHp: 260 + this.floor * 140,
      attack: 14 + this.floor * 6,
      expReward: 150 + this.floor * 60,
      goldReward: 120 + this.floor * 60,
      isBoss: true,
      name: this.floor + '층 보스',
    }));
  }

  update(dt, gm) {
    gm.player.update(dt, this.worldWidth);
    gm.camera.update(gm.player.x, this.worldWidth);

    if (this.nextSpawnTimer > 0) {
      this.nextSpawnTimer -= dt;
      if (this.nextSpawnTimer <= 0) {
        if (this.waveIndex < this.waves.length) {
          this.spawnWave();
        } else if (this.bossPending && !this.bossSpawned) {
          this.spawnBoss();
          this.bossPending = false;
        }
      }
    }

    this.enemies.forEach(e => e.update(dt, gm.player));
    gm.party.update(dt, this.enemies);

    const stillAlive = this.enemies.filter(e => !e.dead);
    if (stillAlive.length !== this.enemies.length) {
      this.enemies.forEach(e => {
        if (e.dead && !e._rewarded) {
          e._rewarded = true;
          const leveled = gm.player.gainExp(e.expReward);
          gm.player.gold += e.goldReward;
          gm.onEnemyKilled(leveled);
        }
      });
      this.enemies = stillAlive;
    }

    if (!this.bossSpawned && !this.bossPending && this.enemies.length === 0 && this.nextSpawnTimer <= 0) {
      this.waveIndex++;
      if (this.waveIndex < this.waves.length) {
        this.nextSpawnTimer = 1.2;
      } else {
        this.nextSpawnTimer = 1.5;
        this.bossPending = true;
      }
    }

    if (this.bossSpawned && this.enemies.length === 0 && !this.cleared) {
      this.cleared = true;
      gm.completeDungeon(this.floor);
    }
  }

  playerAttack(player) {
    if (player.attackCd > 0) return;
    player.attackCd = 0.4;
    const hit = this.enemies.find(e => !e.dead && Math.abs(e.x - player.x) < MELEE_RANGE);
    if (hit) hit.takeDamage(player.attack);
  }

  getInteraction(player) {
    if (player.x < 150 && !this.cleared) {
      return { label: '[던전 나가기]', onSelect: () => this.gm.exitToVillage('dungeon') };
    }
    return null;
  }

  getBoss() { return this.enemies.find(e => e.isBoss); }

  render(ctx, gm) {
    drawDungeonBg(ctx);
    drawGround(ctx, '#5b4636', '#3a2a1f');
    ctx.save();
    ctx.font = 'bold 22px sans-serif';
    ctx.fillStyle = '#e6d3ff';
    ctx.textAlign = 'left';
    const waveLabel = this.bossSpawned ? '보스전!' : `웨이브 ${Math.min(this.waveIndex + 1, this.waves.length)}/${this.waves.length}`;
    ctx.fillText('🕳️ 던전 - ' + this.floor + '층 (' + waveLabel + ')', 20, 40);
    ctx.restore();
    this.enemies.forEach(e => {
      const sx = gm.camera.toScreenX(e.x);
      if (sx > -60 && sx < LOGICAL_W + 60) e.draw(ctx, sx);
    });
    gm.party.draw(ctx, gm.camera);
    gm.player.draw(ctx, gm.camera.toScreenX(gm.player.x));
  }
}
