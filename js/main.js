window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  // 선명한 렌더링을 위해 devicePixelRatio 반영 (논리 좌표계는 1280x720 유지)
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = LOGICAL_W * dpr;
  canvas.height = LOGICAL_H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

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
  bindTapButton(document.getElementById('btn-attack'), () => Input.queueAttack());

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
