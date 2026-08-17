// 몬스터. 종류별로 외형/모션이 다르고, 공격 전에 예비동작(windup)을 보여준다.
const ENEMY_TYPES = {
  // height = 몸 높이, barH = 이름표/체력바를 띄울 높이
  slime:  { name: '슬라임',   height: 42, barH: 48,  radius: 22, speed: 62,  windup: 0.34, color: '#4fd18b', dark: '#2f9f66' },
  bat:    { name: '박쥐',     height: 34, barH: 86,  radius: 18, speed: 96,  windup: 0.26, color: '#a06ce0', dark: '#6d3fae', flying: true },
  brute:  { name: '오크 전사', height: 74, barH: 96,  radius: 24, speed: 74,  windup: 0.42, color: '#d1614b', dark: '#96382a' },
  boss:   { name: '보스',     height: 112, barH: 142, radius: 38, speed: 52, windup: 0.55, color: '#8b3ce0', dark: '#5a1f9e' },
};

let _enemySeq = 0;

class Enemy {
  constructor({ id, x, type, level, maxHp, attack, expReward, goldReward, isBoss, name }) {
    const def = ENEMY_TYPES[type] || ENEMY_TYPES.slime;
    this.id = id || 'e' + (++_enemySeq);
    this.type = type || 'slime';
    this.def = def;
    this.x = x;
    this.baseY = GROUND_Y;
    this.level = level;
    this.maxHp = maxHp; this.hp = maxHp;
    this.attack = attack;
    this.expReward = expReward;
    this.goldReward = goldReward;
    this.isBoss = !!isBoss;
    this.name = name || def.name;
    this.speed = def.speed;
    this.facing = -1;
    this.animTime = randFloat(0, 5);
    this.attackCd = randFloat(0.3, 1.0);
    this.windupT = null;     // 예비동작 진행 시간
    this.swingT = null;      // 휘두르는 모션 진행 시간
    this.pendingTarget = null;
    this.knockVx = 0;
    this.dead = false;
    this.hitFlash = 0;
  }

  get aggroRange() { return this.isBoss ? 100000 : 420; }

  // targets: [{id, x, ...}], onHit(target, damage)
  update(dt, targets, onHit) {
    this.animTime += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.attackCd > 0) this.attackCd -= dt;

    // 넉백
    if (this.knockVx !== 0) {
      this.x += this.knockVx * dt;
      this.knockVx *= Math.pow(0.0025, dt);
      if (Math.abs(this.knockVx) < 4) this.knockVx = 0;
    }

    // 가장 가까운 대상 찾기
    let target = null, bestD = Infinity;
    for (const t of targets) {
      if (!t) continue;
      const d = Math.abs(t.x - this.x);
      if (d < bestD) { bestD = d; target = t; }
    }
    if (!target) return;

    this.facing = Math.sign(target.x - this.x) || this.facing;

    // 휘두르는 중 → 타격 판정
    if (this.swingT !== null) {
      this.swingT += dt;
      if (this.swingT >= 0.14 && this.pendingTarget) {
        const t = this.pendingTarget;
        this.pendingTarget = null;
        if (Math.abs(t.x - this.x) <= MELEE_RANGE + 24) {
          onHit(t, this.attack);
          FX.hit(this.x + this.facing * 34, this.baseY - this.def.height * 0.5, '#ff9a9a', 8);
        }
      }
      if (this.swingT >= 0.34) this.swingT = null;
      return;
    }

    // 예비동작 중
    if (this.windupT !== null) {
      this.windupT += dt;
      if (this.windupT >= this.def.windup) {
        this.windupT = null;
        this.swingT = 0;
        this.pendingTarget = target;
        this.attackCd = this.isBoss ? 1.5 : 1.25;
      }
      return;
    }

    // 접근 / 공격 개시
    if (bestD <= MELEE_RANGE && this.attackCd <= 0) {
      this.windupT = 0;
      return;
    }
    if (bestD < this.aggroRange && bestD > MELEE_RANGE * 0.72) {
      this.x += Math.sign(target.x - this.x) * this.speed * dt;
    }
  }

  takeDamage(n, fromDir = 1) {
    this.hp = Math.max(0, this.hp - n);
    this.hitFlash = 0.16;
    this.knockVx = fromDir * (this.isBoss ? 60 : 200);
    this.windupT = null; // 피격 시 예비동작 취소
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      const cy = this.baseY - this.def.height * 0.5;
      FX.hit(this.x, cy, this.def.color, this.isBoss ? 34 : 16);
      FX.ring(this.x, cy, { color: this.def.color, from: 6, to: this.isBoss ? 130 : 60, life: 0.45 });
    }
  }

  // 게스트(비호스트) 클라이언트에서 호스트 스냅샷을 반영
  applySnapshot(s) {
    this.netTargetX = s.x;
    if (this.netTargetX !== undefined && Math.abs(this.x - s.x) > 220) this.x = s.x; // 크게 벌어지면 즉시 보정
    if (s.hp < this.hp) this.hitFlash = 0.16;
    this.hp = s.hp;
    this.maxHp = s.maxHp;
    this.level = s.level;
    this.facing = s.f;
    this.windupT = s.w >= 0 ? s.w : null;
    this.swingT = s.sw >= 0 ? s.sw : null;
    if (this.hp <= 0) this.dead = true;
  }

  // 게스트에서의 프레임 갱신(위치 보간 + 애니메이션만)
  updateRemote(dt) {
    this.animTime += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.netTargetX !== undefined) this.x = lerp(this.x, this.netTargetX, Math.min(1, dt * 12));
    if (this.windupT !== null) this.windupT += dt;
    if (this.swingT !== null) this.swingT += dt;
  }

  toSnapshot() {
    return {
      id: this.id, t: this.type, x: Math.round(this.x), hp: this.hp, maxHp: this.maxHp,
      level: this.level, f: this.facing, isBoss: this.isBoss, name: this.name,
      w: this.windupT === null ? -1 : this.windupT,
      sw: this.swingT === null ? -1 : this.swingT,
    };
  }

  // ---------- 렌더링 ----------
  draw(ctx, screenX) {
    const d = this.def;
    const flash = this.hitFlash > 0;
    const wind = this.windupT !== null ? this.windupT / d.windup : 0;
    const swing = this.swingT !== null ? this.swingT / 0.34 : 0;
    const y = this.baseY;

    ctx.save();
    switch (this.type) {
      case 'slime': this._drawSlime(ctx, screenX, y, flash, wind, swing); break;
      case 'bat': this._drawBat(ctx, screenX, y, flash, wind, swing); break;
      case 'brute': this._drawBrute(ctx, screenX, y, flash, wind, swing); break;
      default: this._drawBoss(ctx, screenX, y, flash, wind, swing); break;
    }
    ctx.restore();

    const barH = d.barH || d.height + 20;

    // 예비동작 경고 표시
    if (this.windupT !== null) {
      ctx.save();
      ctx.globalAlpha = 0.4 + Math.sin(this.windupT * 30) * 0.3;
      drawOutlinedText(ctx, '!', screenX, y - barH - 12, {
        font: '900 26px sans-serif', fill: '#ff5f6d', stroke: 'rgba(0,0,0,0.7)', lineWidth: 4,
      });
      ctx.restore();
    }

    // 이름 + 체력바
    const barW = this.isBoss ? 96 : 46;
    const barY = y - barH;
    drawMiniBar(ctx, screenX - barW / 2, barY, barW, this.isBoss ? 8 : 6, this.hp / this.maxHp,
      this.isBoss ? '#c23bff' : '#ff6b6b');
    drawOutlinedText(ctx, `Lv.${this.level} ${this.name}`, screenX, barY - 5, {
      font: `bold ${this.isBoss ? 13 : 11}px "Trebuchet MS", sans-serif`,
      fill: this.isBoss ? '#e9c8ff' : '#ffd9d9', lineWidth: 3,
    });
  }

  _drawSlime(ctx, x, y, flash, wind, swing) {
    const d = this.def;
    const breathe = Math.sin(this.animTime * 4) * 0.06;
    let sx = 1 + breathe, sy = 1 - breathe;
    if (wind > 0) { sx = 1 + wind * 0.3; sy = 1 - wind * 0.28; }        // 웅크리기
    if (swing > 0) { sx = 1 - 0.2 * (1 - swing); sy = 1 + 0.25 * (1 - swing); } // 튀어오르기
    const r = d.radius;
    drawGroundShadow(ctx, x, y, r * sx, 0.22);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sx, sy);
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.9, 2, 0, -r * 0.4, r * 1.5);
    g.addColorStop(0, flash ? '#ffffff' : '#9ef5c4');
    g.addColorStop(1, flash ? '#ffdada' : d.color);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.quadraticCurveTo(-r * 1.05, -r * 1.5, 0, -r * 1.55);
    ctx.quadraticCurveTo(r * 1.05, -r * 1.5, r, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,60,40,0.35)'; ctx.lineWidth = 1.6; ctx.stroke();
    // 하이라이트
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 1.05, r * 0.22, r * 0.14, -0.5, 0, Math.PI * 2); ctx.fill();
    // 눈
    ctx.fillStyle = '#20303a';
    const eo = this.facing * r * 0.22;
    ctx.beginPath(); ctx.ellipse(eo - r * 0.3, -r * 0.75, 3, wind > 0.4 ? 1.4 : 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(eo + r * 0.3, -r * 0.75, 3, wind > 0.4 ? 1.4 : 4, 0, 0, Math.PI * 2); ctx.fill();
    // 입
    ctx.strokeStyle = '#20303a'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(eo, -r * 0.42, r * 0.22, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    ctx.restore();
  }

  _drawBat(ctx, x, y, flash, wind, swing) {
    const d = this.def;
    const hover = Math.sin(this.animTime * 3) * 8;
    const cy = y - d.height - 16 + hover + (swing > 0 ? 14 * (1 - swing) : 0) - wind * 10;
    const flap = Math.sin(this.animTime * 18) * 0.6;
    drawGroundShadow(ctx, x, y, 14, 0.14);
    ctx.save();
    ctx.translate(x, cy);
    ctx.scale(this.facing >= 0 ? 1 : -1, 1);
    // 날개
    ctx.fillStyle = flash ? '#ffdada' : d.dark;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.scale(side, 1);
      ctx.rotate(flap * side * 0.5);
      ctx.beginPath();
      ctx.moveTo(6, -2);
      ctx.quadraticCurveTo(28, -18 - flap * 10, 40, 2);
      ctx.quadraticCurveTo(28, 0, 22, 10);
      ctx.quadraticCurveTo(14, 2, 6, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // 몸통
    ctx.fillStyle = flash ? '#ffffff' : d.color;
    ctx.beginPath(); ctx.ellipse(0, 0, 12, 14, 0, 0, Math.PI * 2); ctx.fill();
    // 귀
    ctx.beginPath();
    ctx.moveTo(-6, -11); ctx.lineTo(-9, -22); ctx.lineTo(-1, -13); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(6, -11); ctx.lineTo(9, -22); ctx.lineTo(1, -13); ctx.closePath(); ctx.fill();
    // 눈
    ctx.fillStyle = '#fff36b';
    ctx.beginPath(); ctx.arc(-4, -2, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4, -2, 2.4, 0, Math.PI * 2); ctx.fill();
    // 송곳니
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(-3, 6); ctx.lineTo(-1, 11); ctx.lineTo(0, 6); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(3, 6); ctx.lineTo(1, 11); ctx.lineTo(2, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  _drawBrute(ctx, x, y, flash, wind, swing) {
    const d = this.def;
    const walk = Math.sin(this.animTime * 7) * 3;
    const lean = wind > 0 ? -wind * 0.2 : (swing > 0 ? 0.26 * (1 - swing) : 0);
    drawGroundShadow(ctx, x, y, 22, 0.24);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(this.facing >= 0 ? 1 : -1, 1);
    ctx.rotate(lean);
    const body = flash ? '#ffffff' : d.color;
    const dark = flash ? '#ffdada' : d.dark;
    // 다리
    ctx.strokeStyle = dark; ctx.lineWidth = 11; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-7, -30); ctx.lineTo(-9 - walk, -2);
    ctx.moveTo(7, -30); ctx.lineTo(9 + walk, -2);
    ctx.stroke();
    // 몸통
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-16, -30);
    ctx.quadraticCurveTo(-20, -56, -12, -58);
    ctx.lineTo(12, -58);
    ctx.quadraticCurveTo(20, -56, 16, -30);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(-16, -40, 32, 4);
    // 머리
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(2, -68, 13, 12, 0, 0, Math.PI * 2); ctx.fill();
    // 뿔
    ctx.fillStyle = '#f2e6cf';
    ctx.beginPath(); ctx.moveTo(-8, -76); ctx.lineTo(-14, -88); ctx.lineTo(-3, -79); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(10, -76); ctx.lineTo(16, -88); ctx.lineTo(5, -79); ctx.closePath(); ctx.fill();
    // 눈
    ctx.fillStyle = '#fff36b';
    ctx.beginPath(); ctx.ellipse(6, -69, 3, 2.4, 0, 0, Math.PI * 2); ctx.fill();
    // 곤봉 (예비동작에서 치켜듦)
    const clubA = wind > 0 ? lerp(0.4, -2.0, wind) : (swing > 0 ? lerp(1.7, 0.4, swing) : 0.4);
    ctx.save();
    ctx.translate(12, -50);
    ctx.rotate(clubA);
    ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -34); ctx.stroke();
    ctx.fillStyle = '#8d6039';
    ctx.beginPath(); ctx.ellipse(0, -42, 11, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5f4026';
    ctx.beginPath(); ctx.arc(-5, -46, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(6, -40, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  _drawBoss(ctx, x, y, flash, wind, swing) {
    const d = this.def;
    const breathe = Math.sin(this.animTime * 2.4) * 3;
    const lean = wind > 0 ? -wind * 0.16 : (swing > 0 ? 0.22 * (1 - swing) : 0);
    drawGroundShadow(ctx, x, y, 40, 0.32);
    // 보스 오라
    const g = ctx.createRadialGradient(x, y - 50, 10, x, y - 50, 120);
    g.addColorStop(0, 'rgba(180,90,255,0.22)');
    g.addColorStop(1, 'rgba(180,90,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y - 50, 120, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(this.facing >= 0 ? 1 : -1, 1);
    ctx.rotate(lean);
    const body = flash ? '#ffffff' : d.color;
    const dark = flash ? '#ffdada' : d.dark;
    // 망토
    ctx.fillStyle = '#2a1140';
    ctx.beginPath();
    ctx.moveTo(-14, -84);
    ctx.quadraticCurveTo(-46, -40, -34, -2);
    ctx.quadraticCurveTo(-4, -10, 16, -4);
    ctx.quadraticCurveTo(20, -46, 12, -84);
    ctx.closePath(); ctx.fill();
    // 다리
    ctx.strokeStyle = dark; ctx.lineWidth = 15; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-10, -44); ctx.lineTo(-14, -3);
    ctx.moveTo(10, -44); ctx.lineTo(14, -3);
    ctx.stroke();
    // 몸통(갑옷)
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-24, -44);
    ctx.quadraticCurveTo(-32, -84 + breathe, -18, -88 + breathe);
    ctx.lineTo(18, -88 + breathe);
    ctx.quadraticCurveTo(32, -84 + breathe, 24, -44);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(-24, -70, 48, 5);
    ctx.fillStyle = '#ffd15c';
    ctx.beginPath(); ctx.arc(0, -66, 6, 0, Math.PI * 2); ctx.fill();
    // 어깨 갑옷
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(-24, -84 + breathe, 13, 9, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(24, -84 + breathe, 13, 9, 0.3, 0, Math.PI * 2); ctx.fill();
    // 머리
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(2, -102 + breathe, 17, 16, 0, 0, Math.PI * 2); ctx.fill();
    // 투구 뿔
    ctx.fillStyle = '#e8e0f5';
    ctx.beginPath(); ctx.moveTo(-12, -112 + breathe); ctx.lineTo(-26, -132 + breathe); ctx.lineTo(-4, -116 + breathe); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(14, -112 + breathe); ctx.lineTo(28, -132 + breathe); ctx.lineTo(6, -116 + breathe); ctx.closePath(); ctx.fill();
    // 눈 (발광)
    ctx.fillStyle = '#ff4d6d';
    ctx.shadowColor = '#ff4d6d'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.ellipse(9, -103 + breathe, 4.5, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-4, -103 + breathe, 4, 2.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    // 대형 도끼
    const axeA = wind > 0 ? lerp(0.5, -2.2, wind) : (swing > 0 ? lerp(1.9, 0.5, swing) : 0.5);
    ctx.save();
    ctx.translate(20, -74);
    ctx.rotate(axeA);
    ctx.strokeStyle = '#4a3524'; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, -52); ctx.stroke();
    ctx.fillStyle = '#cfd6e4';
    ctx.beginPath();
    ctx.moveTo(-2, -40);
    ctx.quadraticCurveTo(-30, -50, -22, -70);
    ctx.quadraticCurveTo(-8, -60, -2, -58);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(2, -40);
    ctx.quadraticCurveTo(30, -50, 22, -70);
    ctx.quadraticCurveTo(8, -60, 2, -58);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();
  }
}
