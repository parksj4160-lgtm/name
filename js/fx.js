// 전투 연출 전담 모듈: 파티클 / 데미지 숫자 / 슬래시 궤적 / 링 / 화면 흔들림
// 좌표는 모두 월드 좌표로 저장하고, 그릴 때 카메라로 화면 좌표로 변환한다.
const FX = {
  parts: [],
  texts: [],
  slashes: [],
  rings: [],
  _shakeTime: 0,
  _shakeDur: 0,
  _shakeMag: 0,

  reset() {
    this.parts.length = 0;
    this.texts.length = 0;
    this.slashes.length = 0;
    this.rings.length = 0;
    this._shakeTime = 0;
  },

  // 데미지 숫자
  damage(x, y, amount, { color = '#fff6d5', crit = false, size = 20 } = {}) {
    this.texts.push({
      x: x + randFloat(-8, 8), y, vy: -78, vx: randFloat(-22, 22),
      text: String(Math.round(amount)), life: 0.85, max: 0.85,
      color, size: crit ? size * 1.45 : size, crit,
    });
  },

  // 회복/획득 등 상태 텍스트
  notice(x, y, text, color = '#8ef5a8') {
    this.texts.push({
      x, y, vy: -52, vx: 0, text, life: 1.1, max: 1.1, color, size: 16, crit: false,
    });
  },

  // 타격 스파크
  hit(x, y, color = '#ffe9a8', count = 10) {
    for (let i = 0; i < count; i++) {
      const a = randFloat(0, Math.PI * 2);
      const sp = randFloat(90, 260);
      this.parts.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        life: randFloat(0.2, 0.42), max: 0.42, size: randFloat(2, 4.5),
        color, gravity: 620, kind: 'spark',
      });
    }
  },

  // 착지/이동 먼지
  dust(x, y, dir = 0, count = 5) {
    for (let i = 0; i < count; i++) {
      this.parts.push({
        x: x + randFloat(-6, 6), y, vx: randFloat(-40, 40) - dir * 40, vy: randFloat(-70, -20),
        life: randFloat(0.25, 0.5), max: 0.5, size: randFloat(3, 6),
        color: 'rgba(235,232,220,0.85)', gravity: 200, kind: 'dust',
      });
    }
  },

  // 무기 스윙 궤적 (공격 모션과 함께 호출)
  slash(x, y, facing, { color = '#ffffff', reach = 74, arc = 1.55, tilt = -0.25 } = {}) {
    this.slashes.push({
      x, y, facing, color, reach, arc, tilt, life: 0.22, max: 0.22,
    });
  },

  // 레벨업/클리어용 확산 링
  ring(x, y, { color = '#ffe27a', from = 8, to = 90, life = 0.5, width = 5 } = {}) {
    this.rings.push({ x, y, color, from, to, life, max: life, width });
  },

  levelUp(x, y) {
    this.ring(x, y - 40, { color: '#ffe27a', from: 10, to: 110, life: 0.65, width: 6 });
    this.ring(x, y - 40, { color: '#fff9e0', from: 4, to: 70, life: 0.45, width: 3 });
    for (let i = 0; i < 22; i++) {
      const a = randFloat(-Math.PI, 0);
      const sp = randFloat(120, 300);
      this.parts.push({
        x, y: y - 30, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: randFloat(0.5, 0.9), max: 0.9, size: randFloat(2.5, 5),
        color: '#ffe27a', gravity: 380, kind: 'spark',
      });
    }
  },

  shake(mag = 6, dur = 0.22) {
    this._shakeMag = Math.max(this._shakeMag, mag);
    this._shakeDur = dur;
    this._shakeTime = dur;
  },

  shakeOffset() {
    if (this._shakeTime <= 0) return { x: 0, y: 0 };
    const k = this._shakeTime / this._shakeDur;
    const m = this._shakeMag * k;
    return { x: randFloat(-m, m), y: randFloat(-m, m) * 0.6 };
  },

  update(dt) {
    if (this._shakeTime > 0) this._shakeTime -= dt;

    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) { this.texts.splice(i, 1); continue; }
      t.vy += 60 * dt;
      t.x += t.vx * dt;
      t.y += t.vy * dt;
    }
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i];
      s.life -= dt;
      if (s.life <= 0) this.slashes.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) this.rings.splice(i, 1);
    }
  },

  draw(ctx, camera) {
    const sx = (wx) => camera.toScreenX(wx);

    // 슬래시 궤적
    this.slashes.forEach(s => {
      const k = s.life / s.max;         // 1 → 0
      const prog = 1 - k;               // 0 → 1
      const x = sx(s.x);
      ctx.save();
      ctx.translate(x, s.y);
      ctx.scale(s.facing, 1);
      ctx.rotate(s.tilt + prog * s.arc * 0.35);
      ctx.globalAlpha = k * 0.95;
      const grad = ctx.createLinearGradient(0, -s.reach, 0, s.reach);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, s.color);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 9 * k + 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const a0 = -s.arc / 2 + prog * 0.5;
      ctx.arc(0, 0, s.reach * (0.75 + prog * 0.3), a0, a0 + s.arc);
      ctx.stroke();
      ctx.restore();
    });

    // 파티클
    this.parts.forEach(p => {
      const k = Math.max(0, p.life / p.max);
      ctx.save();
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color;
      if (p.kind === 'dust') {
        ctx.beginPath();
        ctx.ellipse(sx(p.x), p.y, p.size * (1.6 - k), p.size * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(sx(p.x), p.y, p.size * k + 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });

    // 확산 링
    this.rings.forEach(r => {
      const prog = 1 - r.life / r.max;
      ctx.save();
      ctx.globalAlpha = (1 - prog) * 0.9;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - prog) + 1;
      ctx.beginPath();
      ctx.ellipse(sx(r.x), r.y, lerp(r.from, r.to, prog), lerp(r.from, r.to, prog) * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });

    // 데미지 숫자
    this.texts.forEach(t => {
      const k = Math.max(0, t.life / t.max);
      const pop = t.crit ? 1 + (1 - k) * 0.15 : 1;
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 1.6);
      drawOutlinedText(ctx, t.text, sx(t.x), t.y, {
        font: `900 ${Math.round(t.size * pop)}px "Trebuchet MS", sans-serif`,
        fill: t.color, stroke: 'rgba(20,10,0,0.8)', lineWidth: 4,
      });
      ctx.restore();
    });
  },
};
