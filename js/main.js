window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('gameCanvas');
  canvas.width = LOGICAL_W;
  canvas.height = LOGICAL_H;
  const ctx = canvas.getContext('2d');

  const container = document.getElementById('game-container');
  function resize() {
    const scale = Math.min(window.innerWidth / LOGICAL_W, window.innerHeight / LOGICAL_H);
    container.style.transform = `scale(${scale})`;
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  resize();

  bindHoldButton(document.getElementById('btn-left'), () => Input.setLeft(true), () => Input.setLeft(false));
  bindHoldButton(document.getElementById('btn-right'), () => Input.setRight(true), () => Input.setRight(false));
  bindTapButton(document.getElementById('btn-jump'), () => Input.queueJump());
  bindTapButton(document.getElementById('btn-attack'), () => Input.queueAction());

  const gm = new GameManager();
  window.__gm = gm; // 디버그/테스트용 훅

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    gm.update(dt);
    gm.render(ctx);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
});
