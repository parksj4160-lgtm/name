// 광장에 서 있는 더미 플레이어(온라인 멀티플레이는 추후 이 클래스를 교체해서 연결)
class Npc {
  constructor({ name, level, x, rangeMin, rangeMax }) {
    this.name = name;
    this.level = level;
    this.x = x;
    this.y = GROUND_Y;
    this.rangeMin = rangeMin;
    this.rangeMax = rangeMax;
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.speed = 28;
    this.pauseTimer = randInt(1, 3);
  }

  update(dt) {
    this.pauseTimer -= dt;
    if (this.pauseTimer <= 0) {
      this.x += this.dir * this.speed * dt;
      if (this.x < this.rangeMin || this.x > this.rangeMax) {
        this.dir *= -1;
        this.pauseTimer = randInt(1, 3);
      } else if (Math.random() < 0.004) {
        this.dir *= -1;
        this.pauseTimer = randInt(1, 2);
      }
    }
  }

  draw(ctx, screenX) {
    drawStickFigure(ctx, screenX, this.y, this.dir, '#8c8c99', false);
    drawNameTag(ctx, screenX, this.y, this.name, this.level, '#c9c9d6');
  }
}
