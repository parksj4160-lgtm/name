// 키보드 / 마우스 / 터치 입력.
export class Input {
  constructor(canvas, sm) {
    this.sm = sm;
    this.keys = new Set();
    this.mouse = { down: false, right: false, x: 0, y: 0 };
    this.pressed = new Set();      // 이번 프레임에 눌린 키
    this.clicked = false;          // 이번 프레임 좌클릭
    this.rightClicked = false;
    this.move = { x: 0, y: 0 };    // 모바일 조이스틱 (-1..1)
    this._dragging = false;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      this.pressed.add(k);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture?.(e.pointerId);
      sm.setPointer(e.clientX, e.clientY);
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      if (e.button === 2) { this.mouse.right = true; this._dragging = true; }
      else { this.mouse.down = true; this.clicked = true; }
    });
    addEventListener('pointermove', (e) => {
      if (this._dragging) sm.rotate(e.clientX - this.mouse.x, e.clientY - this.mouse.y);
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      sm.setPointer(e.clientX, e.clientY);
    });
    addEventListener('pointerup', (e) => {
      if (e.button === 2) { this.mouse.right = false; this._dragging = false; this.rightClicked = true; }
      else this.mouse.down = false;
    });
    addEventListener('wheel', (e) => sm.zoom(e.deltaY), { passive: true });
  }

  // 카메라 기준 이동 입력 (-1..1)
  axis() {
    const k = this.keys;
    let x = 0, y = 0;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('w') || k.has('arrowup')) y += 1;
    if (k.has('s') || k.has('arrowdown')) y -= 1;
    x += this.move.x; y += this.move.y;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  down(k) { return this.keys.has(k); }
  hit(k) { return this.pressed.has(k); }
  endFrame() { this.pressed.clear(); this.clicked = false; this.rightClicked = false; }
}
