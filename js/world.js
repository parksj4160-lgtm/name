// 광장(마을) 레이아웃: 사냥터 → 장비 상점 → (플레이어 시작 위치) → 포탈 → 회복 상점 → 던전 → 계단
const FACILITY_DEFS = [
  { type: 'hunting', x: 420, label: '사냥터', icon: '🌀' },
  { type: 'shop', x: 900, label: '장비 상점', icon: '🏪' },
  { type: 'portal', x: 1650, label: '포탈', icon: '🔮' },
  { type: 'heal', x: 2050, label: '회복 상점', icon: '➕' },
  { type: 'dungeon', x: 2500, label: '던전', icon: '🕳️' },
  { type: 'stairs', x: 3050, label: '계단', icon: '⬆️' },
];
const WORLD_WIDTH = 3400;
const PLAYER_SPAWN_X = 1280;
const MAX_PROTOTYPE_FLOOR = 3;
const NPC_NAME_POOL = ['민수', '지훈', '유진', '하은', '태양', '서연', '도윤'];

function buildFacilities() {
  return FACILITY_DEFS.map(f => ({ ...f }));
}

function buildNpcs(floor) {
  const count = randInt(2, 3);
  const names = [...NPC_NAME_POOL].sort(() => Math.random() - 0.5).slice(0, count);
  const zones = [[100, 340], [1150, 1550], [2900, 3300]];
  return names.map((name, i) => {
    const zone = zones[i % zones.length];
    const x = randInt(zone[0], zone[1]);
    return new Npc({
      name, x,
      level: randInt(Math.max(1, floor * 3 - 2), floor * 3 + 4),
      rangeMin: zone[0], rangeMax: zone[1],
    });
  });
}

function drawSky(ctx, camX) {
  const grad = ctx.createLinearGradient(0, 0, 0, LOGICAL_H);
  grad.addColorStop(0, '#8fd3ff');
  grad.addColorStop(1, '#eaf8ff');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (let i = 0; i < 6; i++) {
    const span = LOGICAL_W + 300;
    const bx = (((i * 420 - camX * 0.3) % span) + span) % span - 150;
    ctx.beginPath();
    ctx.ellipse(bx, 90 + (i % 3) * 40, 50, 22, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGround(ctx, fill = '#6fbf6f', line = '#4c934c') {
  ctx.fillStyle = fill;
  ctx.fillRect(0, GROUND_Y, LOGICAL_W, LOGICAL_H - GROUND_Y);
  ctx.strokeStyle = line;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y); ctx.lineTo(LOGICAL_W, GROUND_Y);
  ctx.stroke();
}

function drawFacility(ctx, screenX, f) {
  if (screenX < -120 || screenX > LOGICAL_W + 120) return;
  const w = 100, h = 90;
  const x = screenX - w / 2, y = GROUND_Y - h;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, 10); else ctx.rect(x, y, w, h);
  ctx.fill(); ctx.stroke();
  ctx.font = '34px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(f.icon, screenX, y + h / 2 + 12);
  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = '#222';
  ctx.fillText(f.label, screenX, y - 8);
  ctx.restore();
}

class VillageScene {
  constructor(gm, floor) {
    this.gm = gm;
    this.floor = floor;
    this.isCombat = false;
    this.worldWidth = WORLD_WIDTH;
    this.facilities = buildFacilities();
    this.npcs = buildNpcs(floor);
  }

  update(dt, gm) {
    gm.player.update(dt, this.worldWidth);
    this.npcs.forEach(n => n.update(dt));
    gm.camera.update(gm.player.x, this.worldWidth);
  }

  getInteraction(player) {
    const f = this.facilities.find(f => Math.abs(player.x - f.x) < INTERACT_RANGE);
    if (!f) return null;
    const locked = f.type === 'stairs' && this.gm.maxUnlockedFloor <= this.floor;
    const labels = {
      hunting: '[사냥터 입장]',
      shop: '[장비 상점]',
      portal: '[층 이동]',
      heal: '[회복 상점]',
      dungeon: '[던전 입장]',
      stairs: locked ? '[계단 - 잠김]' : '[위층으로 이동]',
    };
    return { label: labels[f.type], onSelect: () => this.gm.handleFacility(f.type, this.floor) };
  }

  render(ctx, gm) {
    drawSky(ctx, gm.camera.x);
    drawGround(ctx);
    this.facilities.forEach(f => drawFacility(ctx, gm.camera.toScreenX(f.x), f));
    this.npcs.forEach(n => {
      const sx = gm.camera.toScreenX(n.x);
      if (sx > -60 && sx < LOGICAL_W + 60) n.draw(ctx, sx);
    });
    gm.party.draw(ctx, gm.camera);
    gm.player.draw(ctx, gm.camera.toScreenX(gm.player.x));
  }
}
