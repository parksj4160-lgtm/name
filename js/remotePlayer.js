// 실제로 접속한 다른 플레이어. 네트워크 스냅샷을 받아 보간해서 그린다.
// (AI 더미가 아니라, 같은 방에 들어온 사람만 여기 생성된다)
class RemotePlayer {
  constructor(s) {
    this.id = s.id;
    this.name = s.name || '플레이어';
    this.x = s.x || 0;
    this.y = s.y || GROUND_Y;
    this.targetX = this.x;
    this.targetY = this.y;
    this.facing = s.f || 1;
    this.moving = false;
    this.grounded = true;
    this.level = s.lv || 1;
    this.hp = s.hp ?? 100;
    this.maxHp = s.maxHp ?? 100;
    this.weapon = !!s.w;
    this.animTime = randFloat(0, 3);
    this.attackT = null;
    this.slashDone = false;
    this.hitFlash = 0;
    this.lastSeen = performance.now();
    this.scene = s.scene || 'village';
    this.floor = s.floor || 1;
  }

  applySnapshot(s) {
    this.lastSeen = performance.now();
    if (s.name) this.name = s.name;
    this.targetX = s.x;
    this.targetY = s.y;
    this.facing = s.f;
    this.moving = !!s.mv;
    this.grounded = s.g !== false;
    this.level = s.lv;
    if (s.hp < this.hp) this.hitFlash = 0.2;
    this.hp = s.hp;
    this.maxHp = s.maxHp;
    this.weapon = !!s.w;
    if (s.scene) this.scene = s.scene;
    if (s.floor) this.floor = s.floor;
    // 원격 플레이어의 공격 모션 시작 감지
    if (s.at >= 0 && this.attackT === null) {
      this.attackT = s.at * ATTACK_DURATION;
      this.slashDone = false;
    }
  }

  update(dt) {
    // 위치 보간 (튀지 않게)
    this.x = lerp(this.x, this.targetX, Math.min(1, dt * 14));
    this.y = lerp(this.y, this.targetY, Math.min(1, dt * 16));
    this.animTime += this.moving ? dt : dt * 0.5;
    if (this.hitFlash > 0) this.hitFlash -= dt;

    if (this.attackT !== null) {
      this.attackT += dt;
      if (!this.slashDone && this.attackT >= ATTACK_HIT_AT) {
        this.slashDone = true;
        FX.slash(this.x + this.facing * 26, this.y - 44, this.facing, {
          color: this.weapon ? '#ffe9a8' : '#e9f0ff',
          reach: MELEE_RANGE * 0.72,
        });
      }
      if (this.attackT >= ATTACK_DURATION) this.attackT = null;
    }
  }

  get attackProgress() {
    return this.attackT === null ? null : clamp(this.attackT / ATTACK_DURATION, 0, 1);
  }

  draw(ctx, screenX) {
    const down = this.hp <= 0;
    ctx.save();
    if (down) ctx.globalAlpha = 0.45;
    drawCharacter(ctx, screenX, this.y, {
      facing: this.facing,
      animTime: this.animTime,
      moving: this.moving && !down,
      grounded: this.grounded,
      attackT: down ? null : this.attackProgress,
      palette: CHAR_PALETTES.ally,
      weapon: this.weapon,
      flash: this.hitFlash > 0,
    });
    ctx.restore();
    drawNameplate(ctx, screenX, this.y, {
      name: this.name, level: this.level, color: '#c6f7d6',
      tag: down ? '다운' : 'PLAYER',
      hp: this.hp, maxHp: this.maxHp,
    });
  }
}
