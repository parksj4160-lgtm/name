class Player {
  constructor({ name, x, y }) {
    this.name = name;
    this.x = x;
    this.y = y ?? GROUND_Y;
    this.vx = 0;
    this.vy = 0;
    this.width = 34;
    this.facing = 1;
    this.grounded = true;
    this.speed = 260;

    this.level = 1;
    this.exp = 0;
    this.expToNext = 100;

    this.maxHp = 100; this.hp = 100;
    this.maxMp = 50; this.mp = 50;
    this.gold = 80;

    this.baseAttack = 12;
    this.weapon = null; // { name, atk, enhanceLevel }
    this.attackCd = 0;
    this.hitFlash = 0;
  }

  get attack() {
    return this.baseAttack + (this.weapon ? this.weapon.atk : 0);
  }

  gainExp(n) {
    this.exp += n;
    let leveledUp = false;
    while (this.exp >= this.expToNext) {
      this.exp -= this.expToNext;
      this.level++;
      this.expToNext = Math.round(this.expToNext * 1.25);
      this.maxHp += 20; this.maxMp += 10; this.baseAttack += 2;
      this.hp = this.maxHp; this.mp = this.maxMp;
      leveledUp = true;
    }
    return leveledUp;
  }

  takeDamage(n) {
    this.hp = Math.max(0, this.hp - n);
    this.hitFlash = 0.2;
  }
  healHp() { this.hp = this.maxHp; }
  healMp() { this.mp = this.maxMp; }

  update(dt, worldWidth) {
    let moveDir = 0;
    if (Input.left) moveDir -= 1;
    if (Input.right) moveDir += 1;
    if (moveDir !== 0) this.facing = moveDir;

    this.vx = moveDir * this.speed;
    this.x += this.vx * dt;
    const half = this.width / 2;
    this.x = clamp(this.x, half, worldWidth - half);

    if (Input.consumeJump() && this.grounded) {
      this.vy = JUMP_FORCE;
      this.grounded = false;
    }
    this.vy += GRAVITY * dt;
    this.y += this.vy * dt;
    if (this.y >= GROUND_Y) {
      this.y = GROUND_Y;
      this.vy = 0;
      this.grounded = true;
    }

    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
  }

  draw(ctx, screenX) {
    drawStickFigure(ctx, screenX, this.y, this.facing, '#3d8bfd', this.hitFlash > 0);
    drawNameTag(ctx, screenX, this.y, this.name, this.level, '#ffd54a');
  }
}
