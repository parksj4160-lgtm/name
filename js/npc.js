// 광장의 마을 주민 NPC (분위기용). 파티원과는 무관하며 이름표에 NPC로 표시된다.
const NPC_DEFS = [
  { name: '경비병 로한', lines: ['던전은 위험해. 조심하게.', '오늘도 순찰 중이다.'] },
  { name: '상인 미나', lines: ['좋은 검 들여왔어요!', '강화는 신중하게…'] },
  { name: '약초상 하루', lines: ['체력은 미리 채워두세요.', '포션 향이 좋죠?'] },
  { name: '꼬마 단이', lines: ['형아 강해요?', '보스 봤어요?'] },
  { name: '음유시인 셀', lines: ['위층 이야기 들려드릴까요?', '♪ 라라라 ♪'] },
];

class Npc {
  constructor({ name, level, x, rangeMin, rangeMax, lines }) {
    this.name = name;
    this.level = level;
    this.x = x;
    this.y = GROUND_Y;
    this.rangeMin = rangeMin;
    this.rangeMax = rangeMax;
    this.facing = Math.random() < 0.5 ? -1 : 1;
    this.speed = 34;
    this.moving = false;
    this.animTime = randFloat(0, 4);
    this.pauseTimer = randFloat(0.8, 3);
    this.lines = lines || ['좋은 하루예요.'];
    this.bubble = null;
    this.bubbleTimer = randFloat(3, 9);
  }

  update(dt) {
    this.animTime += dt;
    this.pauseTimer -= dt;
    if (this.pauseTimer > 0) {
      this.moving = false;
    } else {
      this.moving = true;
      this.x += this.facing * this.speed * dt;
      if (this.x < this.rangeMin || this.x > this.rangeMax) {
        this.facing *= -1;
        this.pauseTimer = randFloat(1, 3);
      } else if (Math.random() < 0.006) {
        this.facing *= -1;
        this.pauseTimer = randFloat(0.8, 2.4);
      }
    }

    this.bubbleTimer -= dt;
    if (this.bubbleTimer <= 0) {
      if (this.bubble) { this.bubble = null; this.bubbleTimer = randFloat(6, 14); }
      else { this.bubble = pick(this.lines); this.bubbleTimer = randFloat(2.5, 4); }
    }
  }

  draw(ctx, screenX) {
    drawCharacter(ctx, screenX, this.y, {
      facing: this.facing,
      animTime: this.animTime,
      moving: this.moving,
      grounded: true,
      attackT: null,
      palette: CHAR_PALETTES.npc,
      weapon: false,
      flash: false,
      scale: 0.94,
    });
    drawNameplate(ctx, screenX, this.y, {
      name: this.name, level: this.level, color: '#dfe3f2', tag: 'NPC', dim: true,
    });
    if (this.bubble) this._drawBubble(ctx, screenX, this.bubble);
  }

  _drawBubble(ctx, x, text) {
    ctx.save();
    ctx.font = '12px "Trebuchet MS", sans-serif';
    const w = ctx.measureText(text).width + 20;
    const y = this.y - 122;
    fillRoundRect(ctx, x - w / 2, y - 24, w, 24, 10, 'rgba(255,255,255,0.94)');
    ctx.beginPath();
    ctx.moveTo(x - 5, y);
    ctx.lineTo(x, y + 7);
    ctx.lineTo(x + 5, y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.fill();
    ctx.fillStyle = '#2b2f45';
    ctx.textAlign = 'center';
    ctx.fillText(text, x, y - 8);
    ctx.restore();
  }
}
