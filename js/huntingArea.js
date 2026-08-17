// 사냥터: 혼자 편하게 레벨을 올리는 개인 공간(몬스터는 각자 클라이언트에서 관리).
const HUNT_POOL = {
  1: ['slime', 'slime', 'bat'],
  2: ['slime', 'bat', 'bat', 'brute'],
  3: ['bat', 'brute', 'brute'],
};

class HuntingAreaScene {
  constructor(gm, floor) {
    this.gm = gm;
    this.key = 'hunting';
    this.floor = floor;
    this.isCombat = true;
    this.worldWidth = 1900;
    this.spawnX = 270 + randInt(-25, 25);   // 출구 트리거를 밟은 채로 시작하지 않도록
    this.maxEnemies = 5;
    this.spawnTimer = 0;
    this.enemies = [];
    this.killCount = 0;
    for (let i = 0; i < 3; i++) this.spawnEnemy();
  }

  spawnEnemy() {
    const type = pick(HUNT_POOL[this.floor] || HUNT_POOL[1]);
    const lvl = randInt(Math.max(1, this.floor), this.floor + 2);
    const mul = ENEMY_TYPES[type] === ENEMY_TYPES.brute ? 1.4 : 1;
    this.enemies.push(new Enemy({
      x: randInt(520, this.worldWidth - 160),
      type,
      level: lvl,
      maxHp: Math.round((24 + lvl * 12) * mul),
      attack: Math.round((4 + lvl * 2) * mul),
      expReward: Math.round((12 + lvl * 6) * mul),
      goldReward: Math.round((8 + lvl * 4) * mul),
    }));
  }

  update(dt, gm) {
    gm.player.update(dt, this.worldWidth, () => this.playerAttack(gm));
    gm.camera.update(gm.player.x, this.worldWidth);

    const targets = [gm.player];
    this.enemies.forEach(e => e.update(dt, targets, (t, dmg) => {
      if (t === gm.player) gm.player.takeDamage(dmg);
    }));

    this.enemies = this.enemies.filter(e => {
      if (e.dead) {
        awardKill(gm, e);
        this.killCount++;
        return false;
      }
      return true;
    });

    this.spawnTimer -= dt;
    if (this.enemies.length < this.maxEnemies && this.spawnTimer <= 0) {
      this.spawnEnemy();
      this.spawnTimer = 1.4;
    }
  }

  playerAttack(gm) {
    const landed = resolveMeleeAttack(gm.player, this.enemies, (e, dmg, crit, dir) => {
      e.takeDamage(dmg, dir);
      showHitFeedback(e, dmg, crit);
    });
    if (!landed) FX.shake(2, 0.06);
  }

  getInteraction(player) {
    if (player.x < 165) {
      return { label: '사냥터 나가기', onSelect: () => this.gm.exitToVillage('hunting') };
    }
    return null;
  }

  getBoss() { return null; }

  render(ctx, gm) {
    drawHuntingBackdrop(ctx, gm.camera.x, this.floor, gm.time, this.worldWidth);
    // 출구 표시
    const exitX = gm.camera.toScreenX(120);
    if (exitX > -100 && exitX < LOGICAL_W) {
      ctx.save();
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath();
      ctx.moveTo(exitX + 20, GROUND_Y - 60); ctx.lineTo(exitX - 10, GROUND_Y - 40); ctx.lineTo(exitX + 20, GROUND_Y - 20);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      drawOutlinedText(ctx, '← 마을', exitX + 6, GROUND_Y - 78, { font: 'bold 14px sans-serif', fill: '#ffe9a8' });
    }
    this.enemies.forEach(e => {
      const sx = gm.camera.toScreenX(e.x);
      if (sx > -90 && sx < LOGICAL_W + 90) e.draw(ctx, sx);
    });
    gm.player.draw(ctx, gm.camera.toScreenX(gm.player.x));
  }
}
