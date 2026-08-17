// 광장(마을) 레이아웃: 사냥터 → 장비 상점 → (시작 위치) → 포탈 → 회복 상점 → 던전 → 계단
const FACILITY_DEFS = [
  { type: 'hunting', x: 430, label: '사냥터' },
  { type: 'shop', x: 920, label: '장비 상점' },
  { type: 'portal', x: 1680, label: '포탈' },
  { type: 'heal', x: 2080, label: '회복 상점' },
  { type: 'dungeon', x: 2540, label: '던전' },
  { type: 'stairs', x: 3080, label: '계단' },
];
const WORLD_WIDTH = 3420;
const PLAYER_SPAWN_X = 1290;

function buildFacilities() {
  return FACILITY_DEFS.map(f => ({ ...f }));
}

function buildNpcs(floor) {
  const zones = [[140, 360], [1150, 1560], [2820, 3260]];
  const defs = [...NPC_DEFS].sort(() => Math.random() - 0.5).slice(0, 3);
  return defs.map((def, i) => {
    const zone = zones[i % zones.length];
    return new Npc({
      name: def.name,
      lines: def.lines,
      x: randInt(zone[0], zone[1]),
      level: randInt(Math.max(1, floor * 3 - 2), floor * 3 + 4),
      rangeMin: zone[0], rangeMax: zone[1],
    });
  });
}

// 광장 소품: 분수 + 가로등
function drawPlazaProps(ctx, camX, time) {
  // 분수 (시작 지점)
  const fx = PLAYER_SPAWN_X + 150 - camX;
  if (fx > -140 && fx < LOGICAL_W + 140) {
    drawGroundShadow(ctx, fx, GROUND_Y + 2, 56, 0.2);
    fillRoundRect(ctx, fx - 52, GROUND_Y - 26, 104, 26, 8, '#b9bdd0');
    fillRoundRect(ctx, fx - 46, GROUND_Y - 22, 92, 14, 6, '#6fc7ef');
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(fx - 44, GROUND_Y - 22, 88, 3);
    fillRoundRect(ctx, fx - 9, GROUND_Y - 62, 18, 40, 5, '#c9cdde');
    ctx.fillStyle = '#a9aec4';
    ctx.beginPath(); ctx.ellipse(fx, GROUND_Y - 64, 20, 7, 0, 0, Math.PI * 2); ctx.fill();
    // 물줄기
    ctx.strokeStyle = 'rgba(160,220,255,0.85)';
    ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const a = (i / 4) * Math.PI - Math.PI;
      const sp = 26 + Math.sin(time * 4 + i) * 3;
      ctx.beginPath();
      ctx.moveTo(fx, GROUND_Y - 68);
      ctx.quadraticCurveTo(fx + Math.cos(a) * sp, GROUND_Y - 92, fx + Math.cos(a) * sp * 1.7, GROUND_Y - 26);
      ctx.stroke();
    }
  }

  // 가로등
  [700, 1900, 2900].forEach((wx, i) => {
    const x = wx - camX;
    if (x < -60 || x > LOGICAL_W + 60) return;
    ctx.save();
    ctx.strokeStyle = '#4d5470'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, GROUND_Y); ctx.lineTo(x, GROUND_Y - 116); ctx.stroke();
    const glow = 0.55 + Math.sin(time * 2 + i) * 0.12;
    const g = ctx.createRadialGradient(x, GROUND_Y - 126, 3, x, GROUND_Y - 126, 54);
    g.addColorStop(0, `rgba(255,232,160,${glow})`);
    g.addColorStop(1, 'rgba(255,232,160,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, GROUND_Y - 126, 54, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath(); ctx.arc(x, GROUND_Y - 126, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4d5470';
    ctx.beginPath(); ctx.moveTo(x - 11, GROUND_Y - 118); ctx.lineTo(x + 11, GROUND_Y - 118); ctx.lineTo(x, GROUND_Y - 138); ctx.closePath(); ctx.fill();
    ctx.restore();
  });
}

class VillageScene {
  constructor(gm, floor) {
    this.gm = gm;
    this.key = 'village';
    this.floor = floor;
    this.isCombat = false;
    this.worldWidth = WORLD_WIDTH;
    this.facilities = buildFacilities();
    this.npcs = buildNpcs(floor);
  }

  update(dt, gm) {
    gm.player.update(dt, this.worldWidth, null); // 광장에서는 허공에 휘두르는 모션만
    this.npcs.forEach(n => n.update(dt));
    gm.party.update(dt);
    gm.camera.update(gm.player.x, this.worldWidth);
  }

  getInteraction(player) {
    const f = this.facilities.find(f => Math.abs(player.x - f.x) < INTERACT_RANGE);
    if (!f) return null;
    const locked = f.type === 'stairs' && this.gm.maxUnlockedFloor <= this.floor;
    const labels = {
      hunting: '사냥터 입장',
      shop: '장비 상점',
      portal: '층 이동',
      heal: '회복 상점',
      dungeon: '던전 입장',
      stairs: locked ? '계단 (잠김)' : '위층으로 이동',
    };
    return { label: labels[f.type], onSelect: () => this.gm.handleFacility(f.type, this.floor) };
  }

  render(ctx, gm) {
    const camX = gm.camera.x;
    drawVillageBackdrop(ctx, camX, this.floor, gm.time, this.worldWidth);
    drawPlazaProps(ctx, camX, gm.time);
    this.facilities.forEach(f => drawFacility(ctx, gm.camera.toScreenX(f.x), f, gm.time, gm));
    this.npcs.forEach(n => {
      const sx = gm.camera.toScreenX(n.x);
      if (sx > -80 && sx < LOGICAL_W + 80) n.draw(ctx, sx);
    });
    gm.party.draw(ctx, gm.camera, 'village', this.floor);
    gm.player.draw(ctx, gm.camera.toScreenX(gm.player.x));
  }
}
