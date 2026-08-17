// 던전 동료 (더미 AI). 나중에 실제 온라인 멀티플레이로 교체하기 쉽도록
// Player와 분리된 독립 클래스로 설계.
class PartyMember {
  constructor({ name, level, x, color, isHelper }) {
    this.name = name;
    this.level = level;
    this.x = x;
    this.y = GROUND_Y;
    this.facing = 1;
    this.attack = 8 + level * 4;
    this.speed = 220;
    this.attackCd = 0;
    this.color = color || '#5fd17a';
    this.isHelper = !!isHelper;
    this.hitFlash = 0;
  }

  update(dt, player, enemies, slotOffset) {
    const targetX = player.x - slotOffset;
    const d = targetX - this.x;
    if (Math.abs(d) > 6) {
      this.facing = Math.sign(d);
      this.x += Math.sign(d) * this.speed * dt;
    }
    if (this.attackCd > 0) this.attackCd -= dt;
    const target = enemies.find(e => !e.dead && Math.abs(e.x - this.x) < 110);
    if (target && this.attackCd <= 0) {
      target.takeDamage(this.attack);
      this.attackCd = 1.1;
      this.facing = Math.sign(target.x - this.x) || this.facing;
    }
    if (this.hitFlash > 0) this.hitFlash -= dt;
  }

  draw(ctx, screenX) {
    drawStickFigure(ctx, screenX, this.y, this.facing, this.color, this.hitFlash > 0);
    drawNameTag(ctx, screenX, this.y, this.name, this.level, '#bdf7c9');
  }
}

// 파티 전체 관리 (본인 포함 최대 4인 = 본인 + 동료 3명)
class Party {
  constructor(player) {
    this.player = player;
    this.members = [];
  }
  get size() { return 1 + this.members.length; }
  canAdd() { return this.members.length < 3; }
  addMember(m) { if (this.canAdd()) this.members.push(m); }
  clear() { this.members = []; }
  update(dt, enemies) {
    this.members.forEach((m, i) => m.update(dt, this.player, enemies, 70 * (i + 1)));
  }
  draw(ctx, camera) {
    this.members.forEach(m => {
      const sx = camera.toScreenX(m.x);
      if (sx > -60 && sx < LOGICAL_W + 60) m.draw(ctx, sx);
    });
  }
}
