export var Input = class {
  constructor(canvas2, sm2) {
    this.sm = sm2;
    this.keys = /* @__PURE__ */ new Set();
    this.mouse = { down: false, right: false, x: 0, y: 0 };
    this.pressed = /* @__PURE__ */ new Set();
    this.clicked = false;
    this.clickedByTouch = false;
    this.rightClicked = false;
    this.move = { x: 0, y: 0 };
    this._dragging = false;
    this._touchId = null;
    addEventListener("keydown", (e) => {
      if (e.repeat) return;
      const k2 = e.key.toLowerCase();
      this.keys.add(k2);
      this.pressed.add(k2);
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k2)) e.preventDefault();
    });
    addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener("blur", () => this.keys.clear());
    canvas2.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas2.addEventListener("pointerdown", (e) => {
      canvas2.setPointerCapture?.(e.pointerId);
      sm2.setPointer(e.clientX, e.clientY);
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      if (e.button === 2) {
        this.mouse.right = true;
        this._dragging = true;
      } else if (e.pointerType === "touch") {
        this._touchId = e.pointerId;
        this._touchStartX = e.clientX;
        this._touchStartY = e.clientY;
        this._touchMoved = false;
      } else {
        this.mouse.down = true;
        this.clicked = true;
      }
    });
    addEventListener("pointermove", (e) => {
      if (this._dragging) {
        sm2.rotate(e.clientX - this.mouse.x, e.clientY - this.mouse.y);
      } else if (this._touchId === e.pointerId) {
        if (!this._touchMoved && Math.hypot(e.clientX - this._touchStartX, e.clientY - this._touchStartY) > 10) {
          this._touchMoved = true;
        }
        if (this._touchMoved) sm2.rotate(e.clientX - this.mouse.x, e.clientY - this.mouse.y);
      }
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      sm2.setPointer(e.clientX, e.clientY);
    });
    addEventListener("pointerup", (e) => {
      if (e.button === 2) {
        this.mouse.right = false;
        this._dragging = false;
        this.rightClicked = true;
      } else if (this._touchId === e.pointerId) {
        if (!this._touchMoved) {
          this.mouse.down = true;
          this.clicked = true;
          this.clickedByTouch = true;
        }
        this._touchId = null;
      } else {
        this.mouse.down = false;
      }
    });
    addEventListener("wheel", (e) => {
      const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      sm2.zoom(e.deltaY * scale);
    }, { passive: true });
  }
  // 카메라 기준 이동 입력 (-1..1)
  axis() {
    const k2 = this.keys;
    let x2 = 0, y2 = 0;
    if (k2.has("a") || k2.has("arrowleft")) x2 -= 1;
    if (k2.has("d") || k2.has("arrowright")) x2 += 1;
    if (k2.has("w") || k2.has("arrowup")) y2 += 1;
    if (k2.has("s") || k2.has("arrowdown")) y2 -= 1;
    x2 += this.move.x;
    y2 += this.move.y;
    const len = Math.hypot(x2, y2);
    if (len > 1) {
      x2 /= len;
      y2 /= len;
    }
    return { x: x2, y: y2 };
  }
  down(k2) {
    return this.keys.has(k2);
  }
  hit(k2) {
    return this.pressed.has(k2);
  }
  endFrame() {
    this.pressed.clear();
    this.clicked = false;
    this.clickedByTouch = false;
    this.rightClicked = false;
  }
};
