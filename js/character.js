// 캐릭터 렌더러: 걷기 / 점프 / 공격 스윙 모션을 가진 2D 휴머노이드.
// 모든 캐릭터(플레이어, 원격 플레이어, 마을 주민)가 이 함수를 공유한다.

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInOutSine(t) { return -(Math.cos(Math.PI * t) - 1) / 2; }

// 공격 진행도(0~1)에 따른 무기 팔 각도. 0 = 아래로 내린 상태, 음수 = 뒤로 치켜듦
function swordArmAngle(t) {
  const NEUTRAL = 0.32, UP = -2.35, DOWN = 1.6, FOLLOW = 2.0;
  if (t < 0.30) return lerp(NEUTRAL, UP, easeOutCubic(t / 0.30));        // 치켜들기
  if (t < 0.48) return lerp(UP, DOWN, easeOutCubic((t - 0.30) / 0.18));  // 내려베기(가장 빠름)
  if (t < 0.62) return lerp(DOWN, FOLLOW, (t - 0.48) / 0.14);            // 여운
  return lerp(FOLLOW, NEUTRAL, easeOutCubic((t - 0.62) / 0.38));         // 복귀
}

// 2관절 팔다리. angle 0 = 아래 방향, + 방향이 캐릭터 정면(오른쪽)
function drawLimb(ctx, x0, y0, a1, l1, a2, l2, color, w) {
  const kx = x0 + Math.sin(a1) * l1;
  const ky = y0 + Math.cos(a1) * l1;
  const ex = kx + Math.sin(a1 + a2) * l2;
  const ey = ky + Math.cos(a1 + a2) * l2;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0); ctx.lineTo(kx, ky); ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.restore();
  return { kx, ky, ex, ey };
}

function drawSword(ctx, hx, hy, angle, { blade = '#e9f0ff', edge = '#9fb4d8', grip = '#7a4a2b', guard = '#ffd977', glow = 0 } = {}) {
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(-angle + Math.PI); // 팔 각도 기준에서 칼끝이 손 바깥을 향하도록
  if (glow > 0) {
    ctx.save();
    ctx.globalAlpha = glow * 0.5;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, -46); ctx.stroke();
    ctx.restore();
  }
  // 손잡이
  ctx.strokeStyle = grip; ctx.lineWidth = 4.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, -4); ctx.stroke();
  // 가드
  ctx.strokeStyle = guard; ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(-6, -5); ctx.lineTo(6, -5); ctx.stroke();
  // 검신
  ctx.beginPath();
  ctx.moveTo(-3.2, -6);
  ctx.lineTo(3.2, -6);
  ctx.lineTo(2.2, -38);
  ctx.lineTo(0, -47);
  ctx.lineTo(-2.2, -38);
  ctx.closePath();
  ctx.fillStyle = blade; ctx.fill();
  ctx.strokeStyle = edge; ctx.lineWidth = 1.2; ctx.stroke();
  // 검신 하이라이트
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-0.6, -10); ctx.lineTo(-0.6, -40); ctx.stroke();
  ctx.restore();
}

/**
 * @param o {facing, animTime, moving, grounded, attackT(0~1|null), palette, weapon, flash, scale, crown}
 */
function drawCharacter(ctx, x, groundY, o) {
  const p = o.palette || CHAR_PALETTES.hero;
  const facing = o.facing >= 0 ? 1 : -1;
  const scale = o.scale || 1;
  const t = o.attackT;
  const attacking = t !== null && t !== undefined;
  const walking = !!o.moving && !!o.grounded;
  const phase = (o.animTime || 0) * 9.5;

  drawGroundShadow(ctx, x, groundY, 17 * scale, walking ? 0.18 : 0.24);

  ctx.save();
  ctx.translate(x, groundY);
  ctx.scale(facing * scale, scale);

  const outline = 'rgba(22,20,40,0.55)';
  const skin = o.flash ? '#ffffff' : p.skin;
  const tunic = o.flash ? '#ffdddd' : p.tunic;
  const tunicDark = o.flash ? '#ffc9c9' : p.tunicDark;

  // 상체 기울기 / 위아래 흔들림
  let lean = 0, bob = 0;
  if (attacking) {
    if (t < 0.3) lean = lerp(0, -0.14, t / 0.3);
    else if (t < 0.5) lean = lerp(-0.14, 0.2, (t - 0.3) / 0.2);
    else lean = lerp(0.2, 0, easeOutCubic((t - 0.5) / 0.5));
  }
  if (walking) bob = Math.abs(Math.sin(phase)) * -2.2;
  else if (o.grounded) bob = Math.sin((o.animTime || 0) * 2.2) * 0.9;

  const hipY = -36 + bob;
  const shoulderY = -60 + bob;

  // ---- 다리 ----
  let backLegA = 0, frontLegA = 0, backKnee = 0.22, frontKnee = 0.22;
  if (!o.grounded) {
    backLegA = -0.5; backKnee = 0.9;
    frontLegA = 0.45; frontKnee = 0.25;
  } else if (walking) {
    const s = Math.sin(phase);
    frontLegA = s * 0.55;
    backLegA = -s * 0.55;
    frontKnee = 0.2 + Math.max(0, -s) * 0.55;
    backKnee = 0.2 + Math.max(0, s) * 0.55;
  } else if (attacking) {
    frontLegA = 0.3 * Math.min(1, t / 0.4); backLegA = -0.22; backKnee = 0.35;
  }

  const legLen = 19, shinLen = 18;
  drawLimb(ctx, -3, hipY, backLegA, legLen, backKnee, shinLen, p.pants, 8);   // 뒷다리
  // 발
  ctx.save(); ctx.fillStyle = '#22243a';
  ctx.restore();

  // ---- 망토 (있는 경우) ----
  if (p.cape) {
    const sway = walking ? Math.sin(phase) * 0.18 : Math.sin((o.animTime || 0) * 1.8) * 0.06;
    ctx.save();
    ctx.translate(0, shoulderY + 2);
    ctx.rotate(-0.1 - lean * 0.6 + sway);
    ctx.fillStyle = p.cape;
    ctx.beginPath();
    ctx.moveTo(-7, 0);
    ctx.quadraticCurveTo(-20, 16, -14, 34);
    ctx.quadraticCurveTo(-4, 30, 5, 33);
    ctx.quadraticCurveTo(8, 14, 6, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = outline; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.restore();
  }

  // ---- 뒷팔 ----
  const backArmA = attacking
    ? lerp(0.1, -0.5, Math.min(1, t / 0.4))
    : (walking ? -Math.sin(phase) * 0.6 : (o.grounded ? 0.12 : -0.6));
  drawLimb(ctx, -4, shoulderY + 4, backArmA, 15, 0.3, 14, tunicDark, 7);

  // ---- 몸통 ----
  ctx.save();
  ctx.translate(0, hipY);
  ctx.rotate(lean);
  const th = hipY - shoulderY; // 음수
  ctx.beginPath();
  ctx.moveTo(-9, 2);
  ctx.lineTo(-11, th - 2);
  ctx.quadraticCurveTo(0, th - 7, 11, th - 2);
  ctx.lineTo(9, 2);
  ctx.closePath();
  const bodyGrad = ctx.createLinearGradient(-11, 0, 11, 0);
  bodyGrad.addColorStop(0, tunicDark);
  bodyGrad.addColorStop(0.45, tunic);
  bodyGrad.addColorStop(1, tunic);
  ctx.fillStyle = bodyGrad; ctx.fill();
  ctx.strokeStyle = outline; ctx.lineWidth = 1.5; ctx.stroke();
  // 벨트
  ctx.fillStyle = '#4a3524';
  ctx.fillRect(-9.5, -3, 19, 5);
  ctx.fillStyle = p.trim || '#ffe9a8';
  ctx.fillRect(-2.5, -3, 5, 5);
  // 가슴 장식
  ctx.strokeStyle = p.trim || '#ffe9a8'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, th + 2); ctx.lineTo(0, -4); ctx.stroke();
  ctx.restore();

  // ---- 앞다리 ----
  drawLimb(ctx, 3, hipY, frontLegA, legLen, frontKnee, shinLen, p.pants, 8.5);

  // ---- 머리 ----
  const headCY = shoulderY - 15;
  ctx.save();
  ctx.translate(0, headCY);
  ctx.rotate(lean * 0.5);
  // 목
  ctx.strokeStyle = skin; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(0, 13); ctx.stroke();
  // 얼굴
  ctx.beginPath();
  ctx.ellipse(0.5, 0, 11, 11.8, 0, 0, Math.PI * 2);
  ctx.fillStyle = skin; ctx.fill();
  ctx.strokeStyle = outline; ctx.lineWidth = 1.4; ctx.stroke();
  // 머리카락
  ctx.beginPath();
  ctx.moveTo(-11, -1);
  ctx.quadraticCurveTo(-12, -14, 1, -13.5);
  ctx.quadraticCurveTo(13, -13, 11.5, -2);
  ctx.quadraticCurveTo(6, -8, -2, -7);
  ctx.quadraticCurveTo(-7, -6.5, -11, -1);
  ctx.closePath();
  ctx.fillStyle = o.flash ? '#ffcaca' : p.hair; ctx.fill();
  // 눈
  ctx.fillStyle = '#2a2438';
  ctx.beginPath(); ctx.ellipse(4.5, 1.5, 1.7, 2.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-1.5, 1.5, 1.5, 2.1, 0, 0, Math.PI * 2); ctx.fill();
  // 볼 홍조
  ctx.fillStyle = 'rgba(255,140,140,0.35)';
  ctx.beginPath(); ctx.ellipse(6, 5.5, 2.6, 1.6, 0, 0, Math.PI * 2); ctx.fill();
  if (o.crown) {
    ctx.fillStyle = '#ffd15c';
    ctx.beginPath();
    ctx.moveTo(-8, -12); ctx.lineTo(-8, -19); ctx.lineTo(-4, -15);
    ctx.lineTo(0, -21); ctx.lineTo(4, -15); ctx.lineTo(8, -19); ctx.lineTo(8, -12);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  // ---- 앞팔 + 무기 ----
  let frontArmA;
  if (attacking) frontArmA = swordArmAngle(t);
  else if (walking) frontArmA = Math.sin(phase) * 0.6;
  else if (!o.grounded) frontArmA = -0.9;
  else frontArmA = 0.18 + Math.sin((o.animTime || 0) * 2.2) * 0.05;

  const elbowBend = attacking ? lerp(0.55, 0.05, Math.min(1, Math.max(0, (t - 0.28) / 0.2))) : 0.28;
  const arm = drawLimb(ctx, 4, shoulderY + 4, frontArmA, 15, elbowBend, 14, skin, 7);
  if (o.weapon) {
    const glow = attacking && t > 0.28 && t < 0.55 ? 1 : 0;
    drawSword(ctx, arm.ex, arm.ey, frontArmA + elbowBend, { glow });
  }

  ctx.restore();
}

// 캐릭터 위 이름표. tag: '나' / 'PLAYER' 등
function drawNameplate(ctx, x, groundY, {
  name, level, color = '#ffffff', tag = null, hp = null, maxHp = null, dim = false,
}) {
  const topY = groundY - 96;
  ctx.save();
  ctx.globalAlpha = dim ? 0.75 : 1;

  ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
  const nameW = ctx.measureText(name).width;
  const lvText = 'Lv.' + level;
  ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
  const lvW = ctx.measureText(lvText).width;
  const tagW = tag ? 30 : 0;
  const totalW = nameW + lvW + tagW + 26;
  const bx = x - totalW / 2;

  fillRoundRect(ctx, bx, topY - 12, totalW, 19, 9.5, 'rgba(12,14,28,0.62)');
  let cx = bx + 8;

  ctx.textAlign = 'left';
  ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
  ctx.fillStyle = '#ffd977';
  ctx.fillText(lvText, cx, topY + 2);
  cx += lvW + 6;

  ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
  ctx.fillStyle = color;
  ctx.fillText(name, cx, topY + 2.5);
  cx += nameW + 6;

  if (tag) {
    fillRoundRect(ctx, cx, topY - 8, tagW - 4, 12, 6, 'rgba(255,217,119,0.9)');
    ctx.font = 'bold 9px "Trebuchet MS", sans-serif';
    ctx.fillStyle = '#2b1f00';
    ctx.textAlign = 'center';
    ctx.fillText(tag, cx + (tagW - 4) / 2, topY + 1);
  }

  if (hp !== null && maxHp) {
    drawMiniBar(ctx, x - 26, topY + 9, 52, 5, hp / maxHp, '#5fe08a');
  }
  ctx.restore();
}
