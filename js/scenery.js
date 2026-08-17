// 배경/건물 렌더링. 층마다 시간대가 달라지고, 원경은 패럴랙스로 천천히 흐른다.

const FLOOR_THEMES = {
  1: {
    name: '햇살 광장',
    skyTop: '#4fc0f0', skyMid: '#9fe0f8', skyBot: '#e8f8ff',
    sun: 'rgba(255,246,201,0.95)', sunGlow: 'rgba(255,240,170,0.35)',
    hillFar: '#8ea8cb', hillMid: '#6fb277',
    ground: '#57a75c', groundTop: '#68bd6a', groundDark: '#3d7f42',
    tree: '#3f9159', treeDark: '#2e6b43', trunk: '#6b4426',
    cloud: 'rgba(255,255,255,0.9)', haze: 'rgba(255,255,255,0.0)',
  },
  2: {
    name: '노을 광장',
    skyTop: '#4a4b8f', skyMid: '#e9748a', skyBot: '#ffd39b',
    sun: 'rgba(255,214,150,0.95)', sunGlow: 'rgba(255,150,110,0.35)',
    hillFar: '#6d5b90', hillMid: '#8a6f6a',
    ground: '#7a6a52', groundTop: '#8d7a5c', groundDark: '#564a39',
    tree: '#6a5a52', treeDark: '#4c4038', trunk: '#4a3324',
    cloud: 'rgba(255,205,180,0.65)', haze: 'rgba(255,150,110,0.08)',
  },
  3: {
    name: '별빛 광장',
    skyTop: '#0d1030', skyMid: '#252a5c', skyBot: '#4b4f86',
    sun: 'rgba(232,240,255,0.95)', sunGlow: 'rgba(170,190,255,0.28)',
    hillFar: '#2b2f5c', hillMid: '#33406b',
    ground: '#3b4a63', groundTop: '#475873', groundDark: '#2a3547',
    tree: '#2c4257', treeDark: '#1f303f', trunk: '#33261d',
    cloud: 'rgba(180,190,235,0.35)', haze: 'rgba(120,140,255,0.07)',
  },
};

function themeFor(floor) { return FLOOR_THEMES[floor] || FLOOR_THEMES[1]; }

// 결정론적 난수(맵 장식을 매 프레임 같은 위치에 그리기 위함)
function hashRand(i, seed = 1) {
  const s = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function drawSkyLayer(ctx, th) {
  const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  g.addColorStop(0, th.skyTop);
  g.addColorStop(0.55, th.skyMid);
  g.addColorStop(1, th.skyBot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
}

function drawStars(ctx, camX, time) {
  for (let i = 0; i < 60; i++) {
    const bx = ((hashRand(i, 3) * 2600 - camX * 0.12) % 2600 + 2600) % 2600 - 100;
    const by = 30 + hashRand(i, 7) * 300;
    const tw = 0.55 + Math.sin(time * 2 + i) * 0.45;
    ctx.globalAlpha = tw;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bx, by, 2, 2);
  }
  ctx.globalAlpha = 1;
}

function drawSun(ctx, th, floor, camX) {
  const cx = LOGICAL_W - 190 - camX * 0.04;
  const cy = floor === 2 ? 250 : 130;
  const r = floor === 3 ? 34 : 54;
  const glow = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 4);
  glow.addColorStop(0, th.sunGlow);
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(cx, cy, r * 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = th.sun;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  if (floor === 3) {
    ctx.fillStyle = 'rgba(30,34,70,0.9)';
    ctx.beginPath(); ctx.arc(cx + 14, cy - 8, r * 0.92, 0, Math.PI * 2); ctx.fill();
  }
}

function drawClouds(ctx, th, camX, time) {
  ctx.fillStyle = th.cloud;
  for (let i = 0; i < 7; i++) {
    const span = 1900;
    const bx = (((i * 300 + hashRand(i, 11) * 160) - camX * 0.18 - time * 6) % span + span) % span - 200;
    const by = 60 + hashRand(i, 13) * 150;
    const s = 0.75 + hashRand(i, 17) * 0.6;
    ctx.beginPath();
    ctx.ellipse(bx, by, 52 * s, 20 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(bx + 36 * s, by + 6 * s, 38 * s, 15 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(bx - 34 * s, by + 8 * s, 32 * s, 13 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMountains(ctx, th, camX) {
  // 원경 산맥 (패럴랙스 0.22)
  ctx.fillStyle = th.hillFar;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  const off = -camX * 0.22;
  for (let i = -1; i < 9; i++) {
    const bx = off + i * 260;
    const h = 150 + hashRand(i, 23) * 130;
    ctx.lineTo(bx, GROUND_Y);
    ctx.lineTo(bx + 130, GROUND_Y - h);
    ctx.lineTo(bx + 260, GROUND_Y);
  }
  ctx.lineTo(LOGICAL_W, GROUND_Y);
  ctx.closePath();
  ctx.fill();

  // 중경 언덕 (패럴랙스 0.42)
  ctx.fillStyle = th.hillMid;
  const off2 = -camX * 0.42;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  for (let i = -1; i < 12; i++) {
    const bx = off2 + i * 210;
    const h = 70 + hashRand(i, 31) * 60;
    ctx.lineTo(bx, GROUND_Y);
    ctx.quadraticCurveTo(bx + 105, GROUND_Y - h, bx + 210, GROUND_Y);
  }
  ctx.lineTo(LOGICAL_W, GROUND_Y);
  ctx.closePath();
  ctx.fill();
}

function drawTree(ctx, x, baseY, s, th) {
  ctx.save();
  ctx.translate(x, baseY);
  ctx.fillStyle = th.trunk;
  ctx.fillRect(-4 * s, -34 * s, 8 * s, 34 * s);
  ctx.fillStyle = th.treeDark;
  ctx.beginPath(); ctx.ellipse(0, -46 * s, 30 * s, 26 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = th.tree;
  ctx.beginPath(); ctx.ellipse(-6 * s, -50 * s, 24 * s, 20 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(12 * s, -44 * s, 17 * s, 14 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawTreeLine(ctx, th, camX, worldWidth) {
  const off = -camX * 0.72;
  for (let i = 0; i < Math.ceil(worldWidth / 170) + 4; i++) {
    const wx = i * 170 + hashRand(i, 41) * 70;
    const bx = off + wx * 0.72;
    if (bx < -80 || bx > LOGICAL_W + 80) continue;
    drawTree(ctx, bx, GROUND_Y + 4, 0.7 + hashRand(i, 43) * 0.35, th);
  }
}

function drawGroundBand(ctx, th, camX) {
  const h = LOGICAL_H - GROUND_Y;
  const g = ctx.createLinearGradient(0, GROUND_Y, 0, LOGICAL_H);
  g.addColorStop(0, th.groundTop);
  g.addColorStop(0.35, th.ground);
  g.addColorStop(1, th.groundDark);
  ctx.fillStyle = g;
  ctx.fillRect(0, GROUND_Y, LOGICAL_W, h);

  // 지면 상단 하이라이트
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(0, GROUND_Y, LOGICAL_W, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, GROUND_Y + 3, LOGICAL_W, 2);

  // 길 (가운데 흙길)
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.fillRect(0, GROUND_Y + 34, LOGICAL_W, 2);

  // 풀 / 자갈 디테일 (월드 고정 위치)
  const startI = Math.floor(camX / 46) - 2;
  for (let i = startI; i < startI + 34; i++) {
    const wx = i * 46 + hashRand(i, 53) * 30;
    const sx = wx - camX;
    if (sx < -20 || sx > LOGICAL_W + 20) continue;
    const kind = hashRand(i, 59);
    if (kind < 0.62) {
      ctx.strokeStyle = th.groundDark;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      const y = GROUND_Y + 8 + hashRand(i, 61) * 90;
      ctx.beginPath();
      ctx.moveTo(sx, y); ctx.lineTo(sx - 3, y - 7);
      ctx.moveTo(sx, y); ctx.lineTo(sx + 1, y - 9);
      ctx.moveTo(sx, y); ctx.lineTo(sx + 4, y - 6);
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      const y = GROUND_Y + 20 + hashRand(i, 67) * 100;
      ctx.beginPath();
      ctx.ellipse(sx, y, 5 + hashRand(i, 71) * 5, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// 광장 전체 배경
function drawVillageBackdrop(ctx, camX, floor, time, worldWidth) {
  const th = themeFor(floor);
  drawSkyLayer(ctx, th);
  if (floor === 3) drawStars(ctx, camX, time);
  drawSun(ctx, th, floor, camX);
  drawClouds(ctx, th, camX, time);
  drawMountains(ctx, th, camX);
  drawTreeLine(ctx, th, camX, worldWidth);
  drawGroundBand(ctx, th, camX);
  if (th.haze !== 'rgba(255,255,255,0.0)') {
    ctx.fillStyle = th.haze;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  }
}

// ---------------- 건물 ----------------

function signBoard(ctx, x, y, label, icon) {
  ctx.save();
  const w = Math.max(92, label.length * 15 + 34);
  fillRoundRect(ctx, x - w / 2, y - 26, w, 26, 8, 'rgba(26,20,14,0.88)');
  roundRectPath(ctx, x - w / 2, y - 26, w, 26, 8);
  ctx.strokeStyle = 'rgba(255,214,130,0.75)'; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.textAlign = 'left';
  ctx.font = '15px sans-serif';
  ctx.fillText(icon, x - w / 2 + 10, y - 7);
  ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
  ctx.fillStyle = '#ffe9b8';
  ctx.fillText(label, x - w / 2 + 30, y - 8);
  ctx.restore();
}

function drawShopBuilding(ctx, x, time) {
  const w = 168, h = 128;
  const bx = x - w / 2, by = GROUND_Y - h;
  ctx.save();
  drawGroundShadow(ctx, x, GROUND_Y + 2, w * 0.42, 0.2);
  // 벽
  fillRoundRect(ctx, bx, by + 30, w, h - 30, 6, '#d8b98d');
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.fillRect(bx, by + 30, 10, h - 30);
  // 지붕
  ctx.beginPath();
  ctx.moveTo(bx - 14, by + 34);
  ctx.lineTo(x, by - 6);
  ctx.lineTo(bx + w + 14, by + 34);
  ctx.closePath();
  ctx.fillStyle = '#b8474d'; ctx.fill();
  ctx.strokeStyle = 'rgba(60,20,25,0.5)'; ctx.lineWidth = 2; ctx.stroke();
  // 천막(줄무늬)
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#f2f2f2' : '#e05a5a';
    ctx.fillRect(bx + 6 + i * 26, by + 34, 26, 16);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(bx + 6, by + 48, w - 12, 3);
  // 창문 + 문
  fillRoundRect(ctx, bx + 20, by + 62, 40, 34, 4, '#ffe9a8');
  ctx.strokeStyle = '#8a6b42'; ctx.lineWidth = 2;
  ctx.strokeRect(bx + 20, by + 62, 40, 34);
  fillRoundRect(ctx, bx + 96, by + 60, 46, h - 90 + 30, 4, '#7a4f2c');
  ctx.fillStyle = '#ffd977';
  ctx.beginPath(); ctx.arc(bx + 104, by + 84, 3, 0, Math.PI * 2); ctx.fill();
  // 진열 상자 & 검
  ctx.fillStyle = '#a8763f';
  ctx.fillRect(bx - 4, GROUND_Y - 26, 28, 26);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.5;
  ctx.strokeRect(bx - 4, GROUND_Y - 26, 28, 26);
  const bob = Math.sin(time * 2) * 2;
  drawSword(ctx, bx + 10, GROUND_Y - 30 + bob, Math.PI, {});
  signBoard(ctx, x, by - 8, '장비 상점', '⚔️');
  ctx.restore();
}

function drawHealBuilding(ctx, x, time) {
  const w = 150, h = 118;
  const bx = x - w / 2, by = GROUND_Y - h;
  drawGroundShadow(ctx, x, GROUND_Y + 2, w * 0.42, 0.2);
  fillRoundRect(ctx, bx, by + 26, w, h - 26, 6, '#f2f4f8');
  ctx.fillStyle = 'rgba(0,0,0,0.07)';
  ctx.fillRect(bx, by + 26, 9, h - 26);
  // 둥근 지붕
  ctx.beginPath();
  ctx.moveTo(bx - 8, by + 30);
  ctx.quadraticCurveTo(x, by - 24, bx + w + 8, by + 30);
  ctx.closePath();
  ctx.fillStyle = '#5bc0be'; ctx.fill();
  ctx.strokeStyle = 'rgba(20,70,70,0.4)'; ctx.lineWidth = 2; ctx.stroke();
  // 십자 간판 (맥동)
  const pulse = 0.75 + Math.sin(time * 3) * 0.25;
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.fillStyle = '#ff6b6b';
  ctx.fillRect(x - 6, by + 40, 12, 34);
  ctx.fillRect(x - 17, by + 51, 34, 12);
  ctx.restore();
  // 문/창문
  fillRoundRect(ctx, x - 24, by + 80, 48, 38, 5, '#cfe6ff');
  ctx.strokeStyle = '#9bb6cf'; ctx.lineWidth = 2;
  ctx.strokeRect(x - 24, by + 80, 48, 38);
  // 포션
  ctx.fillStyle = '#ff6b8b';
  ctx.beginPath(); ctx.ellipse(bx + 14, GROUND_Y - 11, 9, 11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#cfd6e4';
  ctx.fillRect(bx + 11, GROUND_Y - 26, 6, 8);
  signBoard(ctx, x, by - 26, '회복 상점', '➕');
}

function drawPortalBuilding(ctx, x, time) {
  const h = 150;
  const by = GROUND_Y - h;
  drawGroundShadow(ctx, x, GROUND_Y + 2, 62, 0.24);
  // 돌 아치
  ctx.save();
  ctx.strokeStyle = '#8d93b8'; ctx.lineWidth = 20; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 52, GROUND_Y);
  ctx.lineTo(x - 52, by + 54);
  ctx.arc(x, by + 54, 52, Math.PI, 0);
  ctx.lineTo(x + 52, GROUND_Y);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x - 58, GROUND_Y); ctx.lineTo(x - 58, by + 54);
  ctx.stroke();
  ctx.restore();
  // 소용돌이 게이트
  const swirl = time * 1.6;
  ctx.save();
  ctx.translate(x, by + 74);
  const g = ctx.createRadialGradient(0, 0, 6, 0, 0, 56);
  g.addColorStop(0, 'rgba(226,200,255,0.95)');
  g.addColorStop(0.5, 'rgba(150,90,240,0.8)');
  g.addColorStop(1, 'rgba(80,30,160,0.15)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, 44, 66, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    const a = swirl + i * 2.1;
    ctx.ellipse(0, 0, 16 + i * 12, 26 + i * 18, a, 0, Math.PI * 1.5);
    ctx.stroke();
  }
  ctx.restore();
  // 떠오르는 마력 입자
  for (let i = 0; i < 8; i++) {
    const p = (time * 0.4 + i / 8) % 1;
    ctx.globalAlpha = (1 - p) * 0.8;
    ctx.fillStyle = '#e6d0ff';
    ctx.beginPath();
    ctx.arc(x + Math.sin(i * 2 + time) * 30, GROUND_Y - p * 150, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  signBoard(ctx, x, by - 6, '포탈', '🔮');
}

function drawTorch(ctx, x, y, time, seed = 0) {
  ctx.save();
  ctx.strokeStyle = '#6b4a2c'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 22); ctx.stroke();
  const f = 1 + Math.sin(time * 9 + seed) * 0.16;
  const g = ctx.createRadialGradient(x, y - 6, 2, x, y - 6, 46 * f);
  g.addColorStop(0, 'rgba(255,220,150,0.55)');
  g.addColorStop(1, 'rgba(255,150,50,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y - 6, 46 * f, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff9838';
  ctx.beginPath();
  ctx.moveTo(x, y - 22 * f);
  ctx.quadraticCurveTo(x + 8, y - 6, x, y + 2);
  ctx.quadraticCurveTo(x - 8, y - 6, x, y - 22 * f);
  ctx.fill();
  ctx.fillStyle = '#ffe27a';
  ctx.beginPath();
  ctx.moveTo(x, y - 13 * f);
  ctx.quadraticCurveTo(x + 4, y - 4, x, y);
  ctx.quadraticCurveTo(x - 4, y - 4, x, y - 13 * f);
  ctx.fill();
  ctx.restore();
}

function drawDungeonGate(ctx, x, time) {
  drawGroundShadow(ctx, x, GROUND_Y + 2, 82, 0.28);
  // 바위 언덕
  ctx.fillStyle = '#5d5470';
  ctx.beginPath();
  ctx.moveTo(x - 110, GROUND_Y);
  ctx.quadraticCurveTo(x - 80, GROUND_Y - 150, x, GROUND_Y - 168);
  ctx.quadraticCurveTo(x + 84, GROUND_Y - 150, x + 110, GROUND_Y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.09)';
  ctx.beginPath();
  ctx.moveTo(x - 110, GROUND_Y);
  ctx.quadraticCurveTo(x - 80, GROUND_Y - 150, x, GROUND_Y - 168);
  ctx.quadraticCurveTo(x - 30, GROUND_Y - 120, x - 40, GROUND_Y);
  ctx.closePath();
  ctx.fill();
  // 입구
  ctx.fillStyle = '#140f22';
  ctx.beginPath();
  ctx.moveTo(x - 46, GROUND_Y);
  ctx.lineTo(x - 46, GROUND_Y - 62);
  ctx.arc(x, GROUND_Y - 62, 46, Math.PI, 0);
  ctx.lineTo(x + 46, GROUND_Y);
  ctx.closePath();
  ctx.fill();
  // 입구 안쪽 붉은 기운
  const g = ctx.createRadialGradient(x, GROUND_Y - 30, 4, x, GROUND_Y - 30, 60);
  g.addColorStop(0, 'rgba(200,60,90,0.5)');
  g.addColorStop(1, 'rgba(200,60,90,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, GROUND_Y - 30, 60, 0, Math.PI * 2); ctx.fill();
  drawTorch(ctx, x - 62, GROUND_Y - 76, time, 0);
  drawTorch(ctx, x + 62, GROUND_Y - 76, time, 2);
  signBoard(ctx, x, GROUND_Y - 180, '던전', '🕳️');
}

function drawHuntingGate(ctx, x, time) {
  drawGroundShadow(ctx, x, GROUND_Y + 2, 70, 0.2);
  // 뒤쪽 숲
  ctx.fillStyle = '#2f6b45';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.ellipse(x - 70 + i * 36, GROUND_Y - 96 - (i % 2) * 18, 34, 30, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // 나무 문틀
  ctx.fillStyle = '#7a5230';
  ctx.fillRect(x - 62, GROUND_Y - 128, 14, 128);
  ctx.fillRect(x + 48, GROUND_Y - 128, 14, 128);
  ctx.fillStyle = '#8d6039';
  ctx.fillRect(x - 74, GROUND_Y - 140, 148, 18);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(x - 74, GROUND_Y - 124, 148, 4);
  // 깃발
  const wave = Math.sin(time * 3) * 5;
  ctx.fillStyle = '#4ec07a';
  ctx.beginPath();
  ctx.moveTo(x - 48, GROUND_Y - 120);
  ctx.quadraticCurveTo(x - 20 + wave, GROUND_Y - 108, x - 48, GROUND_Y - 92);
  ctx.closePath(); ctx.fill();
  signBoard(ctx, x, GROUND_Y - 146, '사냥터', '🌿');
}

function drawStairs(ctx, x, locked, time) {
  drawGroundShadow(ctx, x, GROUND_Y + 2, 74, 0.22);
  // 돌계단
  for (let i = 0; i < 6; i++) {
    const w = 116 - i * 8;
    const y = GROUND_Y - 20 - i * 20;
    fillRoundRect(ctx, x - w / 2 + i * 4, y, w, 20, 3, i % 2 ? '#9aa0bb' : '#8a90ab');
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(x - w / 2 + i * 4, y, w, 3);
  }
  // 난간
  ctx.strokeStyle = '#6f7592'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 58, GROUND_Y - 22); ctx.lineTo(x - 26, GROUND_Y - 148);
  ctx.stroke();
  if (locked) {
    ctx.save();
    ctx.globalAlpha = 0.35 + Math.sin(time * 2.5) * 0.12;
    ctx.fillStyle = '#ff5f6d';
    ctx.fillRect(x - 60, GROUND_Y - 150, 120, 150);
    ctx.restore();
    signBoard(ctx, x, GROUND_Y - 158, '계단 · 잠김', '🔒');
  } else {
    ctx.save();
    ctx.globalAlpha = 0.3 + Math.sin(time * 3) * 0.15;
    const g = ctx.createLinearGradient(0, GROUND_Y - 170, 0, GROUND_Y);
    g.addColorStop(0, 'rgba(255,236,160,0.8)');
    g.addColorStop(1, 'rgba(255,236,160,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 56, GROUND_Y - 170, 112, 170);
    ctx.restore();
    signBoard(ctx, x, GROUND_Y - 158, '위층으로', '⬆️');
  }
}

function drawFacility(ctx, screenX, f, time, gm) {
  if (screenX < -220 || screenX > LOGICAL_W + 220) return;
  switch (f.type) {
    case 'shop': drawShopBuilding(ctx, screenX, time); break;
    case 'heal': drawHealBuilding(ctx, screenX, time); break;
    case 'portal': drawPortalBuilding(ctx, screenX, time); break;
    case 'dungeon': drawDungeonGate(ctx, screenX, time); break;
    case 'hunting': drawHuntingGate(ctx, screenX, time); break;
    case 'stairs': drawStairs(ctx, screenX, gm.maxUnlockedFloor <= gm.currentFloor, time); break;
  }
}

// ---------------- 사냥터 배경 ----------------
function drawHuntingBackdrop(ctx, camX, floor, time, worldWidth) {
  const th = themeFor(floor);
  drawSkyLayer(ctx, th);
  if (floor === 3) drawStars(ctx, camX, time);
  drawClouds(ctx, th, camX, time);
  drawMountains(ctx, th, camX);
  // 빽빽한 숲
  const off = -camX * 0.72;
  for (let i = 0; i < Math.ceil(worldWidth / 96) + 4; i++) {
    const bx = off + i * 96 * 0.72 + hashRand(i, 83) * 40;
    if (bx < -80 || bx > LOGICAL_W + 80) continue;
    drawTree(ctx, bx, GROUND_Y + 6, 0.85 + hashRand(i, 89) * 0.5, th);
  }
  drawGroundBand(ctx, th, camX);
  ctx.fillStyle = 'rgba(20,40,20,0.12)';
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
}

// ---------------- 던전 배경 ----------------
function drawDungeonBackdrop(ctx, camX, floor, time, worldWidth) {
  const g = ctx.createLinearGradient(0, 0, 0, LOGICAL_H);
  g.addColorStop(0, '#150e26');
  g.addColorStop(0.6, '#2a1c40');
  g.addColorStop(1, '#3a2850');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

  // 벽돌 벽 (패럴랙스 0.5)
  const bw = 84, bh = 42;
  const scroll = -camX * 0.5;
  const baseCol = Math.floor(scroll / bw);
  const off = scroll - baseCol * bw;
  for (let row = 0; row * bh < GROUND_Y; row++) {
    const stagger = row % 2 ? bw / 2 : 0;
    for (let col = -1; col < LOGICAL_W / bw + 2; col++) {
      const worldCol = baseCol + col;              // 월드 기준 인덱스 → 스크롤해도 무늬가 흔들리지 않음
      const shade = 0.05 + hashRand(row * 31 + worldCol, 97) * 0.09;
      fillRoundRect(ctx, off + col * bw + stagger + 2, row * bh + 2, bw - 4, bh - 4, 3, `rgba(255,255,255,${shade})`);
    }
  }

  // 기둥
  const poff = -camX * 0.78;
  for (let i = 0; i < Math.ceil(worldWidth / 420) + 3; i++) {
    const x = poff + i * 420 * 0.78;
    if (x < -100 || x > LOGICAL_W + 100) continue;
    ctx.fillStyle = '#241a38';
    ctx.fillRect(x - 26, 0, 52, GROUND_Y);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x - 26, 0, 10, GROUND_Y);
    ctx.fillStyle = '#31254a';
    ctx.fillRect(x - 36, GROUND_Y - 26, 72, 26);
    ctx.fillRect(x - 36, 0, 72, 22);
  }

  // 횃불
  const toff = -camX;
  for (let i = 0; i < Math.ceil(worldWidth / 300) + 2; i++) {
    const x = toff + i * 300 + 140;
    if (x < -80 || x > LOGICAL_W + 80) continue;
    drawTorch(ctx, x, GROUND_Y - 190, time, i * 1.7);
  }

  // 바닥
  const fg = ctx.createLinearGradient(0, GROUND_Y, 0, LOGICAL_H);
  fg.addColorStop(0, '#59446b');
  fg.addColorStop(1, '#2c2036');
  ctx.fillStyle = fg;
  ctx.fillRect(0, GROUND_Y, LOGICAL_W, LOGICAL_H - GROUND_Y);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(0, GROUND_Y, LOGICAL_W, 3);
  // 바닥 타일 라인
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 2;
  for (let i = -1; i < 14; i++) {
    const x = (-camX % 96) + i * 96;
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y); ctx.lineTo(x - 26, LOGICAL_H);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y + 54); ctx.lineTo(LOGICAL_W, GROUND_Y + 54);
  ctx.stroke();

  // 안개
  ctx.fillStyle = 'rgba(120,80,190,0.09)';
  ctx.fillRect(0, GROUND_Y - 90, LOGICAL_W, 90);
}
