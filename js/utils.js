function clamp(v, min, max) { return Math.max(min, Math.min(v, max)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randFloat(min, max) { return Math.random() * (max - min) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// roundRect 미지원 브라우저 대비 폴리필성 헬퍼
function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function fillRoundRect(ctx, x, y, w, h, r, fill) {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

// 캐릭터/오브젝트 발밑 타원 그림자
function drawGroundShadow(ctx, x, y, rx, alpha = 0.22) {
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, rx * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// 외곽선이 들어간 읽기 쉬운 텍스트
function drawOutlinedText(ctx, text, x, y, {
  font = 'bold 13px sans-serif', fill = '#fff', stroke = 'rgba(0,0,0,0.75)',
  lineWidth = 3, align = 'center',
} = {}) {
  ctx.save();
  ctx.font = font;
  ctx.textAlign = align;
  ctx.lineJoin = 'round';
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// 체력바 (몬스터/아군 공용)
function drawMiniBar(ctx, x, y, w, h, ratio, fill, bg = 'rgba(0,0,0,0.55)') {
  ctx.save();
  fillRoundRect(ctx, x, y, w, h, h / 2, bg);
  const inner = Math.max(0, Math.min(1, ratio)) * (w - 2);
  if (inner > 0) fillRoundRect(ctx, x + 1, y + 1, inner, h - 2, (h - 2) / 2, fill);
  ctx.restore();
}

function withAlpha(ctx, alpha, fn) {
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha;
  fn();
  ctx.globalAlpha = prev;
}

function shortId() {
  return Math.random().toString(36).slice(2, 8);
}

function roomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
