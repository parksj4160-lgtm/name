class HuntingAreaScene {
  constructor(gm, floor) {
    this.gm = gm;
    this.floor = floor;
    this.isCombat = true;
    this.worldWidth = 1700;
    this.spawnX = 120;
    this.maxEnemies = 5;
    this.spawnTimer = 0;
    this.enemies = [];
    for (let i = 0; i < 3; i++) this.spawnEnemy();
  }

  spawnEnemy() {
    const lvl = randInt(Math.max(1, this.floor), this.floor + 2);
    this.enemies.push(new Enemy({
      x: randInt(500, this.worldWidth - 150),
      level: lvl,
      maxHp: 30 + lvl * 18,
      attack: 4 + lvl * 2,
      expReward: 12 + lvl * 6,
      goldReward: 8 + lvl * 4,
    }));
  }

  update(dt, gm) {
    gm.player.update(dt, this.worldWidth);
    gm.camera.update(gm.player.x, this.worldWidth);
    this.enemies.forEach(e => e.update(dt, gm.player));
    gm.party.update(dt, this.enemies);

    const before = this.enemies.length;
    this.enemies = this.enemies.filter(e => {
      if (e.dead) {
        const leveled = gm.player.gainExp(e.expReward);
        gm.player.gold += e.goldReward;
        gm.onEnemyKilled(leveled);
        return false;
      }
      return true;
    });

    this.spawnTimer -= dt;
    if (this.enemies.length < this.maxEnemies && this.spawnTimer <= 0) {
      this.spawnEnemy();
      this.spawnTimer = 1.2;
    }
  }

  playerAttack(player) {
    if (player.attackCd > 0) return;
    player.attackCd = 0.4;
    const inRange = this.enemies.filter(e => !e.dead && Math.abs(e.x - player.x) < MELEE_RANGE);
    const facing = inRange.find(e => Math.sign(e.x - player.x || 1) === player.facing);
    const hit = facing || inRange[0];
    if (hit) hit.takeDamage(player.attack);
  }

  getInteraction(player) {
    if (player.x < 150) {
      return { label: '[사냥터 나가기]', onSelect: () => this.gm.exitToVillage('hunting') };
    }
    return null;
  }

  render(ctx, gm) {
    drawSky(ctx, gm.camera.x);
    drawGround(ctx);
    ctx.save();
    ctx.font = 'bold 22px sans-serif';
    ctx.fillStyle = '#2c6e2c';
    ctx.textAlign = 'left';
    ctx.fillText('🌀 사냥터 - ' + this.floor + '층', 20, 40);
    ctx.restore();
    this.enemies.forEach(e => {
      const sx = gm.camera.toScreenX(e.x);
      if (sx > -40 && sx < LOGICAL_W + 40) e.draw(ctx, sx);
    });
    gm.party.draw(ctx, gm.camera);
    gm.player.draw(ctx, gm.camera.toScreenX(gm.player.x));
  }
}
