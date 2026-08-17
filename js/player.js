class Player {
  constructor({ name, x, y, id }) {
    this.id = id || 'local';
    this.name = name;
    this.x = x;
    this.y = y ?? GROUND_Y;
    this.vx = 0;
    this.vy = 0;
    this.width = 34;
    this.facing = 1;
    this.grounded = true;
    this.speed = 270;

    this.level = 1;
    this.exp = 0;
    this.expToNext = 100;

    this.maxHp = 100; this.hp = 100;
    this.maxMp = 50; this.mp = 50;
    this.gold = 80;

    this.baseAttack = 12;
    this.weapon = null;        // { name, atk, enhanceLevel }
    this.attackCd = 0;
    this.attackT = null;       // 공격 모션 경과 시간(초). null = 대기
    this.hitApplied = false;
    this.hitFlash = 0;
    this.knockVx = 0;
    this.animTime = 0;
    this.moving = false;
    this.invuln = 0;
  }

  get attack() {
    return this.baseAttack + (this.weapon ? this.weapon.atk : 0);
  }

  get attackProgress() {
    return this.attackT === null ? null : clamp(this.attackT / ATTACK_DURATION, 0, 1);
  }

  // 공격 모션 시작. 실제 타격은 update()의 히트 프레임에서 발생한다.
  startAttack() {
    if (this.attackCd > 0 || this.attackT !== null) return false;
    this.attackT = 0;
    this.hitApplied = false;
    this.attackCd = ATTACK_COOLDOWN;
    return true;
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
    if (leveledUp) FX.levelUp(this.x, this.y);
    return leveledUp;
  }

  takeDamage(n) {
    if (this.invuln > 0 || this.hp <= 0) return;
    this.hp = Math.max(0, this.hp - n);
    this.hitFlash = 0.22;
    this.invuln = 0.45;
    this.knockVx = -this.facing * 140;
    FX.damage(this.x, this.y - 74, n, { color: '#ff9aa6' });
    FX.shake(7, 0.2);
  }

  healHp() { const g = this.maxHp - this.hp; this.hp = this.maxHp; if (g > 0) FX.notice(this.x, this.y - 80, '+' + g + ' HP', '#8ef5a8'); }
  healMp() { const g = this.maxMp - this.mp; this.mp = this.maxMp; if (g > 0) FX.notice(this.x, this.y - 80, '+' + g + ' MP', '#9ad4ff'); }

  update(dt, worldWidth, onAttackHit) {
    let moveDir = 0;
    if (Input.left) moveDir -= 1;
    if (Input.right) moveDir += 1;
    if (moveDir !== 0) this.facing = moveDir;

    // 공격 중에는 이동 속도가 크게 줄어든다(모션이 눈에 보이도록)
    const speedMul = this.attackT !== null ? 0.32 : 1;
    this.vx = moveDir * this.speed * speedMul;
    this.x += this.vx * dt;

    if (this.knockVx !== 0) {
      this.x += this.knockVx * dt;
      this.knockVx *= Math.pow(0.002, dt);
      if (Math.abs(this.knockVx) < 5) this.knockVx = 0;
    }

    const half = this.width / 2;
    this.x = clamp(this.x, half, worldWidth - half);

    this.moving = moveDir !== 0;
    if (this.moving || !this.grounded) this.animTime += dt;
    else this.animTime += dt * 0.5;

    const wasGrounded = this.grounded;
    if (Input.consumeJump() && this.grounded) {
      this.vy = JUMP_FORCE;
      this.grounded = false;
      FX.dust(this.x, GROUND_Y, this.facing, 4);
    }
    this.vy += GRAVITY * dt;
    this.y += this.vy * dt;
    if (this.y >= GROUND_Y) {
      this.y = GROUND_Y;
      this.vy = 0;
      this.grounded = true;
      if (!wasGrounded) FX.dust(this.x, GROUND_Y, 0, 6);
    }

    // 공격 모션 진행 + 히트 프레임
    if (this.attackT !== null) {
      this.attackT += dt;
      if (!this.hitApplied && this.attackT >= ATTACK_HIT_AT) {
        this.hitApplied = true;
        FX.slash(this.x + this.facing * 26, this.y - 44, this.facing, {
          color: this.weapon ? '#ffe9a8' : '#e9f0ff',
          reach: MELEE_RANGE * 0.72,
        });
        if (onAttackHit) onAttackHit();
      }
      if (this.attackT >= ATTACK_DURATION) this.attackT = null;
    }

    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.invuln > 0) this.invuln -= dt;

    // 달릴 때 먼지
    if (this.moving && this.grounded && Math.random() < dt * 12) {
      FX.dust(this.x - this.facing * 8, GROUND_Y, this.facing, 1);
    }
  }

  draw(ctx, screenX, { isSelf = true } = {}) {
    drawCharacter(ctx, screenX, this.y, {
      facing: this.facing,
      animTime: this.animTime,
      moving: this.moving,
      grounded: this.grounded,
      attackT: this.attackProgress,
      palette: CHAR_PALETTES.hero,
      weapon: !!this.weapon,
      flash: this.hitFlash > 0,
    });
    drawNameplate(ctx, screenX, this.y, {
      name: this.name, level: this.level, color: '#ffffff',
      tag: isSelf ? '나' : null,
    });
  }

  toSnapshot() {
    return {
      id: this.id, name: this.name, x: Math.round(this.x), y: Math.round(this.y),
      f: this.facing, mv: this.moving, g: this.grounded,
      at: this.attackProgress === null ? -1 : this.attackProgress,
      lv: this.level, hp: this.hp, maxHp: this.maxHp, w: !!this.weapon,
    };
  }
}
