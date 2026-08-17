// 키보드(PC) + 버튼(모바일)을 하나의 상태로 통합하는 입력 매니저
const Input = {
  left: false,
  right: false,
  _jumpQueued: false,
  _actionQueued: false,
  setLeft(v) { this.left = v; },
  setRight(v) { this.right = v; },
  queueJump() { this._jumpQueued = true; },
  queueAction() { this._actionQueued = true; },
  consumeJump() {
    if (this._jumpQueued) { this._jumpQueued = false; return true; }
    return false;
  },
  consumeAction() {
    if (this._actionQueued) { this._actionQueued = false; return true; }
    return false;
  },
};

window.addEventListener('keydown', (e) => {
  switch (e.code) {
    case 'ArrowLeft': case 'KeyA': Input.setLeft(true); break;
    case 'ArrowRight': case 'KeyD': Input.setRight(true); break;
    case 'ArrowUp': case 'Space': case 'KeyW':
      if (!e.repeat) Input.queueJump();
      e.preventDefault();
      break;
    case 'KeyE': case 'KeyF':
      if (!e.repeat) Input.queueAction();
      break;
  }
});
window.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'ArrowLeft': case 'KeyA': Input.setLeft(false); break;
    case 'ArrowRight': case 'KeyD': Input.setRight(false); break;
  }
});

// 누르고 있는 동안 유지되는 버튼(이동용)
function bindHoldButton(el, onDown, onUp) {
  if (!el) return;
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); onDown(); });
  el.addEventListener('pointerup', (e) => { e.preventDefault(); onUp(); });
  el.addEventListener('pointerleave', (e) => { onUp(); });
  el.addEventListener('pointercancel', (e) => { onUp(); });
}
// 한번 누르면 한번만 반응하는 버튼(점프/공격/상호작용/UI용)
function bindTapButton(el, onTap) {
  if (!el) return;
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); onTap(); });
}
