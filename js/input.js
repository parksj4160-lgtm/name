// 키보드(PC) + 버튼(모바일)을 하나의 상태로 통합하는 입력 매니저
const Input = {
  left: false,
  right: false,
  _jump: false,
  _attack: false,
  _interact: false,

  setLeft(v) { this.left = v; },
  setRight(v) { this.right = v; },
  queueJump() { this._jump = true; },
  queueAttack() { this._attack = true; },
  queueInteract() { this._interact = true; },

  consumeJump() { const v = this._jump; this._jump = false; return v; },
  consumeAttack() { const v = this._attack; this._attack = false; return v; },
  consumeInteract() { const v = this._interact; this._interact = false; return v; },

  clear() { this.left = this.right = false; this._jump = this._attack = this._interact = false; },
};

window.addEventListener('keydown', (e) => {
  if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return; // 입력창에서는 무시
  switch (e.code) {
    case 'ArrowLeft': case 'KeyA': Input.setLeft(true); break;
    case 'ArrowRight': case 'KeyD': Input.setRight(true); break;
    case 'ArrowUp': case 'Space': case 'KeyW':
      if (!e.repeat) Input.queueJump();
      e.preventDefault();
      break;
    case 'KeyE': case 'KeyF':          // 상호작용(없으면 공격)
      if (!e.repeat) Input.queueInteract();
      break;
    case 'KeyJ': case 'KeyZ': case 'KeyK':  // 공격 전용
      if (!e.repeat) Input.queueAttack();
      break;
  }
});
window.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'ArrowLeft': case 'KeyA': Input.setLeft(false); break;
    case 'ArrowRight': case 'KeyD': Input.setRight(false); break;
  }
});
window.addEventListener('blur', () => Input.clear());

// 누르고 있는 동안 유지되는 버튼(이동용)
function bindHoldButton(el, onDown, onUp) {
  if (!el) return;
  const down = (e) => { e.preventDefault(); el.classList.add('pressed'); onDown(); };
  const up = () => { el.classList.remove('pressed'); onUp(); };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointerleave', up);
  el.addEventListener('pointercancel', up);
}

// 한번 누르면 한번만 반응하는 버튼(점프/공격/UI용)
function bindTapButton(el, onTap) {
  if (!el) return;
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); onTap(); });
}
