class Entity {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.vx = 0;
    this.vy = 0;
    this.hp = 100;
    this.maxHp = 100;
    this.size = 20;
    this.color = '#fff';
    this.isDead = false;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  draw(ctx) {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();

    // HP Bar
    if (this.hp < this.maxHp) {
      const barWidth = this.size * 2;
      const barHeight = 4;
      ctx.fillStyle = '#333';
      ctx.fillRect(this.x - barWidth / 2, this.y - this.size - 10, barWidth, barHeight);
      ctx.fillStyle = '#10b981';
      ctx.fillRect(this.x - barWidth / 2, this.y - this.size - 10, (this.hp / this.maxHp) * barWidth, barHeight);
    }
  }

  takeDamage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.isDead = true;
    }
  }

  distanceTo(other) {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

class Player extends Entity {
  constructor(x, y) {
    super(x, y, 'player');
    this.hp = CONFIG.PLAYER.MAX_HP;
    this.maxHp = CONFIG.PLAYER.MAX_HP;
    this.size = CONFIG.PLAYER.SIZE;
    this.color = '#06b6d4';
    this.speed = CONFIG.PLAYER.MOVE_SPEED;
    this.attackRange = CONFIG.PLAYER.ATTACK_RANGE;
    this.attackDamage = CONFIG.PLAYER.ATTACK_DAMAGE;
    this.attackCooldown = 0;
    this.essence = 0;
    this.level = 1;
    this.kills = 0;
    this.regen = 0;
    this.essenceMultiplier = 1;
  }

  handleInput(keys) {
    this.vx = 0;
    this.vy = 0;

    if (keys['ArrowUp'] || keys['w'] || keys['W']) this.vy = -this.speed;
    if (keys['ArrowDown'] || keys['s'] || keys['S']) this.vy = this.speed;
    if (keys['ArrowLeft'] || keys['a'] || keys['A']) this.vx = -this.speed;
    if (keys['ArrowRight'] || keys['d'] || keys['D']) this.vx = this.speed;

    // 대각선 이동 정규화
    if (this.vx !== 0 && this.vy !== 0) {
      const len = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      this.vx = (this.vx / len) * this.speed;
      this.vy = (this.vy / len) * this.speed;
    }
  }

  update(dt, boundaries) {
    super.update(dt);

    // 경계 확인
    this.x = Math.max(this.size, Math.min(CONFIG.GAME_WIDTH - this.size, this.x));
    this.y = Math.max(this.size, Math.min(CONFIG.GAME_HEIGHT - this.size, this.y));

    // 자동 회복
    if (this.regen > 0) {
      this.hp = Math.min(this.maxHp, this.hp + this.regen * dt);
    }

    // 공격 쿨다운
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
  }

  tryAttack(enemies) {
    if (this.attackCooldown > 0) return null;

    let closest = null;
    let closestDist = this.attackRange;

    for (const enemy of enemies) {
      const dist = this.distanceTo(enemy);
      if (dist < closestDist) {
        closest = enemy;
        closestDist = dist;
      }
    }

    if (closest) {
      this.attackCooldown = CONFIG.PLAYER.ATTACK_COOLDOWN;
      return closest;
    }
    return null;
  }

  addEssence(amount) {
    const final = Math.floor(amount * this.essenceMultiplier);
    this.essence += final;
  }

  levelUp(upgrade) {
    this.level++;

    switch (upgrade.type) {
      case 'heal_full':
        this.hp = this.maxHp;
        break;
      case 'max_hp':
        this.maxHp += upgrade.value;
        this.hp = this.maxHp;
        break;
      case 'damage':
        this.attackDamage += upgrade.value;
        break;
      case 'speed':
        this.speed += upgrade.value;
        break;
      case 'attack_range':
        this.attackRange += upgrade.value;
        break;
      case 'attack_speed':
        this.attackCooldown *= upgrade.value;
        break;
    }
  }
}

class Enemy extends Entity {
  constructor(x, y, type) {
    const config = CONFIG.ENEMIES[type];
    super(x, y, type);
    this.hp = config.hp;
    this.maxHp = config.hp;
    this.damage = config.damage;
    this.speed = config.speed;
    this.essence_reward = config.essence_reward;
    this.size = config.size;
    this.color = this.getColor();
    this.targetX = CONFIG.GAME_WIDTH / 2;
    this.targetY = CONFIG.GAME_HEIGHT / 2;
  }

  getColor() {
    const colors = {
      GRUNT: '#ef4444',
      RUNNER: '#f59e0b',
      TANK: '#8b5cf6',
      BOSS: '#fbbf24',
    };
    return colors[this.type];
  }

  update(dt, player) {
    // 플레이어를 향해 움직임
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0) {
      this.vx = (dx / dist) * this.speed;
      this.vy = (dy / dist) * this.speed;
    }

    super.update(dt);
  }

  draw(ctx) {
    super.draw(ctx);

    // 눈
    const eyeSize = this.size * 0.3;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(this.x - this.size * 0.4, this.y - this.size * 0.2, eyeSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(this.x + this.size * 0.4, this.y - this.size * 0.2, eyeSize, 0, Math.PI * 2);
    ctx.fill();
  }
}

class Effect {
  constructor(x, y, type, value) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.value = value;
    this.age = 0;
    this.maxAge = 1;
    this.size = 10;
    this.alpha = 1;
  }

  update(dt) {
    this.age += dt;
    this.y -= 50 * dt;
    this.alpha = 1 - (this.age / this.maxAge);
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = this.type === 'essence' ? '#fbbf24' : '#10b981';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('+' + this.value, this.x, this.y);
    ctx.restore();
  }

  isDone() {
    return this.age >= this.maxAge;
  }
}

class Particle {
  constructor(x, y, vx, vy, color, size, lifetime) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.size = size;
    this.lifetime = lifetime;
    this.age = 0;
  }

  update(dt) {
    this.age += dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += 200 * dt; // gravity
  }

  draw(ctx) {
    const alpha = 1 - (this.age / this.lifetime);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  isDone() {
    return this.age >= this.lifetime;
  }
}
