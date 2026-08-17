// 던전: 3웨이브 + 보스. 같은 방에 접속한 실제 플레이어들과 함께 진행한다.
// 몬스터 처리 권한은 호스트(가장 먼저 접속한 사람) 한 명이 갖고, 나머지는 스냅샷을 받는다.
const DUNGEON_POOL = {
  1: ['slime', 'slime', 'bat'],
  2: ['slime', 'bat', 'brute'],
  3: ['bat', 'brute', 'brute'],
};

class DungeonScene {
  constructor(gm, floor) {
    this.gm = gm;
    this.key = 'dungeon';
    this.floor = floor;
    this.isCombat = true;
    this.worldWidth = 2600;
    this.spawnX = 280 + randInt(-25, 25);   // 출구 트리거를 밟은 채로 시작하지 않도록
    this.enemies = [];
    this.waves = [3, 4, 4];
    this.waveIndex = 0;
    this.bossSpawned = false;
    this.bossPending = false;
    this.cleared = false;
    this.nextSpawnTimer = 1.2;
    this.netTimer = 0;
  }

  // 이 클라이언트가 몬스터를 시뮬레이션할 권한을 갖는가
  get authoritative() { return Net.isHost; }

  get waveLabel() {
    if (this.cleared) return '클리어!';
    if (this.bossSpawned) return '보스전';
    return `웨이브 ${Math.min(this.waveIndex + 1, this.waves.length)}/${this.waves.length}`;
  }

  spawnWave() {
    const count = this.waves[this.waveIndex] || 0;
    const pool = DUNGEON_POOL[this.floor] || DUNGEON_POOL[1];
    for (let i = 0; i < count; i++) {
      const type = pool[i % pool.length];
      const lvl = this.floor * 2 + this.waveIndex;
      const mul = type === 'brute' ? 1.5 : 1;
      this.enemies.push(new Enemy({
        id: Net.selfId + '-' + Math.random().toString(36).slice(2, 7),
        x: 780 + this.waveIndex * 380 + i * 110,
        type,
        level: lvl,
        maxHp: Math.round((40 + lvl * 22) * mul),
        attack: Math.round((5 + lvl * 3) * mul),
        expReward: Math.round((20 + lvl * 8) * mul),
        goldReward: Math.round((12 + lvl * 6) * mul),
      }));
    }
  }

  spawnBoss() {
    this.bossSpawned = true;
    const lvl = this.floor * 3 + 3;
    this.enemies.push(new Enemy({
      id: Net.selfId + '-boss',
      x: this.worldWidth - 260,
      type: 'boss',
      level: lvl,
      maxHp: 280 + this.floor * 150,
      attack: 14 + this.floor * 6,
      expReward: 150 + this.floor * 60,
      goldReward: 120 + this.floor * 60,
      isBoss: true,
      name: this.floor + '층 수호자',
    }));
    FX.shake(12, 0.4);
  }

  update(dt, gm) {
    gm.player.update(dt, this.worldWidth, () => this.playerAttack(gm));
    gm.party.update(dt);
    gm.camera.update(gm.player.x, this.worldWidth);

    if (this.authoritative) this._hostUpdate(dt, gm);
    else this.enemies.forEach(e => e.updateRemote(dt));

    if (Net.online && this.authoritative) {
      this.netTimer -= dt;
      if (this.netTimer <= 0) {
        this.netTimer = 0.06;
        Net.send('dstate', this.toSnapshot());
      }
    }
  }

  _hostUpdate(dt, gm) {
    if (this.nextSpawnTimer > 0) {
      this.nextSpawnTimer -= dt;
      if (this.nextSpawnTimer <= 0) {
        if (this.waveIndex < this.waves.length) this.spawnWave();
        else if (this.bossPending && !this.bossSpawned) { this.spawnBoss(); this.bossPending = false; }
      }
    }

    const targets = gm.party.targets('dungeon', this.floor);
    this.enemies.forEach(e => e.update(dt, targets, (t, dmg) => {
      if (t === gm.player) gm.player.takeDamage(dmg);
      else Net.send('ehit', { to: t.id, dmg });   // 해당 플레이어 클라이언트가 직접 적용
    }));

    const dying = this.enemies.filter(e => e.dead);
    if (dying.length) {
      dying.forEach(e => {
        awardKill(gm, e);
        Net.send('dkill', { id: e.id, exp: e.expReward, gold: e.goldReward, x: e.x, y: e.baseY });
      });
      this.enemies = this.enemies.filter(e => !e.dead);
    }

    if (!this.bossSpawned && !this.bossPending && this.enemies.length === 0 && this.nextSpawnTimer <= 0) {
      this.waveIndex++;
      if (this.waveIndex < this.waves.length) this.nextSpawnTimer = 1.6;
      else { this.nextSpawnTimer = 2.0; this.bossPending = true; }
    }

    if (this.bossSpawned && this.enemies.length === 0 && !this.cleared) {
      this.cleared = true;
      Net.send('dclear', { floor: this.floor });
      gm.completeDungeon(this.floor);
    }
  }

  playerAttack(gm) {
    const landed = resolveMeleeAttack(gm.player, this.enemies, (e, dmg, crit, dir) => {
      showHitFeedback(e, dmg, crit);
      if (this.authoritative) {
        e.takeDamage(dmg, dir);
      } else {
        e.hitFlash = 0.16;                     // 즉각 반응은 로컬에서, 실제 체력은 호스트가 계산
        Net.send('dhit', { id: e.id, dmg, dir });
      }
    });
    if (!landed) FX.shake(2, 0.06);
  }

  // 호스트가 게스트의 공격을 수신
  onNetHit(d) {
    if (!this.authoritative) return;
    const e = this.enemies.find(e => e.id === d.id);
    if (e) e.takeDamage(d.dmg, d.dir || 1);
  }

  toSnapshot() {
    return {
      floor: this.floor,
      wave: this.waveIndex,
      boss: this.bossSpawned,
      cleared: this.cleared,
      e: this.enemies.map(e => e.toSnapshot()),
    };
  }

  // 게스트가 호스트 스냅샷을 반영
  applySnapshot(s) {
    if (this.authoritative || !s || s.floor !== this.floor) return;
    this.waveIndex = s.wave;
    this.bossSpawned = s.boss;
    const seen = new Set();
    s.e.forEach(es => {
      seen.add(es.id);
      let e = this.enemies.find(x => x.id === es.id);
      if (!e) {
        e = new Enemy({
          id: es.id, x: es.x, type: es.t, level: es.level, maxHp: es.maxHp,
          attack: 0, expReward: 0, goldReward: 0, isBoss: es.isBoss, name: es.name,
        });
        this.enemies.push(e);
      }
      e.applySnapshot(es);
    });
    this.enemies = this.enemies.filter(e => seen.has(e.id));
  }

  getInteraction(player) {
    if (player.x < 175 && !this.cleared) {
      return { label: '던전 나가기', onSelect: () => this.gm.exitToVillage('dungeon') };
    }
    return null;
  }

  getBoss() { return this.enemies.find(e => e.isBoss); }

  render(ctx, gm) {
    drawDungeonBackdrop(ctx, gm.camera.x, this.floor, gm.time, this.worldWidth);

    // 출구
    const exitX = gm.camera.toScreenX(120);
    if (exitX > -120 && exitX < LOGICAL_W) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,220,150,0.16)';
      ctx.fillRect(exitX - 60, GROUND_Y - 130, 90, 130);
      ctx.restore();
      drawOutlinedText(ctx, '← 나가기', exitX - 14, GROUND_Y - 142, { font: 'bold 14px sans-serif', fill: '#ffe9a8' });
    }

    this.enemies.forEach(e => {
      const sx = gm.camera.toScreenX(e.x);
      if (sx > -110 && sx < LOGICAL_W + 110) e.draw(ctx, sx);
    });
    gm.party.draw(ctx, gm.camera, 'dungeon', this.floor);
    gm.player.draw(ctx, gm.camera.toScreenX(gm.player.x));
  }
}
