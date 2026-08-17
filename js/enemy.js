class Enemy {
  constructor({ x, level, maxHp, attack, expReward, goldReward, isBoss, name }) {
    this.x = x;
    this.y = GROUND_Y;
    this.level = level;
    this.maxHp = maxHp; this.hp = maxHp;
    this.attack = attack;
    this.expReward = expReward;
    this.goldReward = goldReward;
    this.isBoss = !!isBoss;
    this.name = name || (this.isBoss ? '보스' : '몬스터');
    this.speed = this.isBoss ? 40 : 60;
    this.attackCd = 0;
    this.dead = false;
    this.hitFlash = 0;
  }

  update(dt, player) {
    const d = player.x - this.x;
    const absD = Math.abs(d);
    const aggroRange = this.isBoss ? 999999 : 380;
    if (absD < aggroRange && absD > MELEE_RANGE * 0.6) {
      this.x += Math.sign(d) * this.speed * dt;
    }
    if (this.attackCd > 0) this.attackCd -= dt;
    if (absD <= MELEE_RANGE && this.attackCd <= 0) {
      player.takeDamage(this.attack);
      this.attackCd = 1.0;
    }
    if (this.hitFlash > 0) this.hitFlash -= dt;
  }

  takeDamage(n) {
    this.hp = Math.max(0, this.hp - n);
    this.hitFlash = 0.15;
    if (this.hp <= 0) this.dead = true;
  }

  draw(ctx, screenX) {
    const r = this.isBoss ? 26 : 16;
    ctx.save();
    ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : (this.isBoss ? '#7a2ee6' : '#d1495b');
    ctx.beginPath();
    ctx.arc(screenX, GROUND_Y - r, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(screenX - r * 0.35, GROUND_Y - r - 2, r * 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(screenX + r * 0.35, GROUND_Y - r - 2, r * 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    const barW = this.isBoss ? 74 : 40;
    const barX = screenX - barW / 2;
    const barY = GROUND_Y - r * 2 - 16;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(barX, barY, barW, 6);
    ctx.fillStyle = this.isBoss ? '#c23bff' : '#ff5959';
    ctx.fillRect(barX, barY, barW * (this.hp / this.maxHp), 6);
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '11px sans-serif';
    ctx.fillStyle = this.isBoss ? '#e0b3ff' : '#ffd0d0';
    ctx.fillText((this.isBoss ? this.name + ' ' : '') + 'Lv.' + this.level, screenX, barY - 4);
    ctx.restore();
  }
}
