function clamp(v, min, max) { return Math.max(min, Math.min(v, max)); }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// 간단한 2D 스틱맨 캐릭터 드로잉 (플레이어 / NPC / 파티원 공용)
function drawStickFigure(ctx, x, groundY, facing, color, flash) {
  ctx.save();
  ctx.translate(x, groundY);
  const c = flash ? '#ff4444' : color;
  ctx.strokeStyle = c;
  ctx.fillStyle = c;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';

  // 머리
  ctx.beginPath();
  ctx.arc(0, -56, 10, 0, Math.PI * 2);
  ctx.fill();

  // 몸통 + 팔 + 다리
  ctx.beginPath();
  ctx.moveTo(0, -46); ctx.lineTo(0, -16);
  ctx.moveTo(-14, -38); ctx.lineTo(14, -38);
  ctx.moveTo(0, -16); ctx.lineTo(-10, 0);
  ctx.moveTo(0, -16); ctx.lineTo(10, 0);
  ctx.stroke();

  // 바라보는 방향 표시
  ctx.beginPath();
  ctx.moveTo(0, -38); ctx.lineTo(facing >= 0 ? 16 : -16, -34);
  ctx.stroke();
  ctx.restore();
}

// 캐릭터 머리 위 이름 + 레벨 태그
function drawNameTag(ctx, x, groundY, name, level, color) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = color || '#ffffff';
  ctx.fillText(name, x, groundY - 92);
  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#e4e8ff';
  ctx.fillText('Lv.' + level, x, groundY - 78);
  ctx.restore();
}
