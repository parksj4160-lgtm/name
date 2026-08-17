class GameManager {
  constructor() {
    Net.init(localStorage.getItem('rpg.name') || '모험가');

    this.player = new Player({ name: Net.name, x: PLAYER_SPAWN_X, id: Net.selfId });
    this.camera = new Camera();
    this.party = new Party(this.player);

    this.time = 0;
    this.currentFloor = 1;
    this.maxUnlockedFloor = 1;
    this.dungeonCleared = {};
    this.goals = { visitHunting: false, equipWeapon: false, heal: false, dungeon: false };

    this._netTimer = 0;
    this._lobbyTimer = 0;
    this._deathTimer = 0;

    this.ui = new UI(this);
    this.scene = new VillageScene(this, this.currentFloor);

    this._registerNet();
    this.ui.refreshAll();
    this.ui.updateNetChip();
    this.ui.toast('E: 상호작용 · J/⚔: 공격 · Space: 점프');
  }

  // ---------------- 네트워크 ----------------
  _registerNet() {
    Net.on('ps', (s, from) => this.party.applyPlayerSnapshot(from, s));

    Net.on('dstate', (s) => {
      if (this.scene.key === 'dungeon') this.scene.applySnapshot(s);
    });
    Net.on('dhit', (d) => {
      if (this.scene.key === 'dungeon') this.scene.onNetHit(d);
    });
    Net.on('dkill', (d) => {
      // 호스트가 처리한 사망 보상을 게스트도 함께 받는다(공유 보상)
      if (this.scene.key !== 'dungeon' || Net.isHost) return;
      const leveled = this.player.gainExp(d.exp);
      this.player.gold += d.gold;
      FX.notice(d.x, d.y - 100, `+${d.exp} EXP  +${d.gold} G`, '#ffe27a');
      this.onEnemyKilled(leveled);
    });
    Net.on('ehit', (d) => {
      if (d && d.to === Net.selfId) this.player.takeDamage(d.dmg);
    });
    Net.on('dclear', (d) => {
      if (this.scene.key === 'dungeon' && !this.scene.cleared) {
        this.scene.cleared = true;
        this.completeDungeon(d.floor);
      }
    });

    Net.on('peerJoin', (p) => {
      this.ui.toast(`${p.name} 님이 방에 참여했습니다.`, 'good');
      this.ui.updateNetChip();
    });
    Net.on('peerLeave', (p) => {
      this.party.remove(p.id);
      this.ui.toast(`${p.name} 님이 나갔습니다.`);
      this.ui.updateNetChip();
    });
  }

  createRoom() {
    const code = roomCode();
    if (Net.connect(code)) {
      this.ui.toast(`방 ${code} 을 만들었습니다. 코드를 공유하세요!`, 'good');
    } else {
      this.ui.toast('이 브라우저에서는 멀티플레이를 쓸 수 없습니다.', 'bad');
    }
    this.ui.renderPartyLobby();
    this.ui.updateNetChip();
  }

  joinRoom(code) {
    if (Net.connect(code)) this.ui.toast(`방 ${code} 에 참여했습니다.`, 'good');
    else this.ui.toast('접속에 실패했습니다.', 'bad');
    this.ui.renderPartyLobby();
    this.ui.updateNetChip();
  }

  leaveRoom() {
    Net.leave();
    this.party.clear();
    this.ui.toast('방에서 나왔습니다.');
    this.ui.renderPartyLobby();
    this.ui.updateNetChip();
  }

  applySettings(name, server) {
    localStorage.setItem('rpg.name', name);
    Net.name = name;
    this.player.name = name;
    const prevRoom = Net.roomCode;
    const changed = server !== Net.serverUrl;
    Net.setServerUrl(server);
    if (changed && prevRoom) { Net.leave(); Net.connect(prevRoom); }
    this.ui.refreshAll();
    this.ui.updateNetChip();
  }

  // ---------------- 시설 / 씬 전환 ----------------
  handleFacility(type, floor) {
    switch (type) {
      case 'hunting': this.enterHuntingArea(); break;
      case 'shop': this.ui.openShop(); break;
      case 'portal': this.ui.openPortal(); break;
      case 'heal': this.ui.openHeal(); break;
      case 'dungeon': this.ui.openPartyLobby(); break;
      case 'stairs': this.tryClimbStairs(floor); break;
    }
  }

  enterHuntingArea() {
    this.goals.visitHunting = true;
    this.scene = new HuntingAreaScene(this, this.currentFloor);
    this.player.x = this.scene.spawnX;
    FX.reset();
    this.ui.refreshAll();
  }

  enterDungeon() {
    this.scene = new DungeonScene(this, this.currentFloor);
    this.player.x = this.scene.spawnX;
    FX.reset();
    this.ui.refreshAll();
    this.ui.toast(`${this.currentFloor}층 던전에 입장했습니다.`, 'good');
  }

  exitToVillage(from) {
    this.scene = new VillageScene(this, this.currentFloor);
    const fac = this.scene.facilities.find(f => f.type === from);
    this.player.x = fac ? fac.x : PLAYER_SPAWN_X;
    FX.reset();
    this.ui.refreshAll();
  }

  completeDungeon(floor) {
    this.dungeonCleared[floor] = true;
    this.goals.dungeon = true;
    const unlocked = Math.min(floor + 1, MAX_PROTOTYPE_FLOOR);
    const newFloorUnlocked = unlocked > this.maxUnlockedFloor;
    this.maxUnlockedFloor = Math.max(this.maxUnlockedFloor, unlocked);
    FX.shake(10, 0.4);
    this.ui.showDungeonClear(floor, newFloorUnlocked && floor < MAX_PROTOTYPE_FLOOR, this.party.size);
  }

  returnFromDungeonClear() {
    this.exitToVillage('dungeon');
  }

  tryClimbStairs(floor) {
    if (this.maxUnlockedFloor > floor) this.travelToFloor(floor + 1);
    else this.ui.toast('이 층의 던전을 클리어해야 올라갈 수 있습니다.', 'bad');
  }

  travelToFloor(floor) {
    this.currentFloor = floor;
    this.scene = new VillageScene(this, floor);
    this.player.x = PLAYER_SPAWN_X;
    FX.reset();
    this.ui.closeModal('modal-portal');
    this.ui.refreshAll();
    this.ui.toast(`${floor}층 · ${themeFor(floor).name} 도착`, 'good');
  }

  // ---------------- 상점 / 회복 ----------------
  buyWeapon() {
    const p = this.player;
    if (p.weapon) return;
    if (p.gold < 100) { this.ui.toast('골드가 부족합니다.', 'bad'); return; }
    p.gold -= 100;
    p.weapon = { name: '철검', atk: 10, enhanceLevel: 0 };
    this.goals.equipWeapon = true;
    FX.notice(p.x, p.y - 90, '철검 획득!', '#ffe27a');
    this.ui.toast('철검을 구매했습니다!', 'good');
    this.ui.refreshAll();
    this.ui.populateShop(this);
  }

  enhanceWeapon() {
    const p = this.player;
    const w = p.weapon;
    if (!w) return;
    const cost = 50 * (w.enhanceLevel + 1);
    if (p.gold < cost) { this.ui.toast('골드가 부족합니다.', 'bad'); return; }
    p.gold -= cost;
    w.enhanceLevel++;
    w.atk += 5;
    w.name = '철검 +' + w.enhanceLevel;
    FX.levelUp(p.x, p.y);
    this.ui.toast(`강화 성공! ${w.name}`, 'good');
    this.ui.refreshAll();
    this.ui.populateShop(this);
  }

  healHp() { this.player.healHp(); this.goals.heal = true; this.ui.refreshAll(); this.ui.populateHeal(); }
  healMp() { this.player.healMp(); this.goals.heal = true; this.ui.refreshAll(); this.ui.populateHeal(); }

  onEnemyKilled(leveled) {
    this.ui.updateHud(this.player);
    if (leveled) this.ui.toast(`레벨 업! Lv.${this.player.level}`, 'good');
  }

  // ---------------- 루프 ----------------
  update(dt) {
    this.time += dt;
    FX.update(dt);
    Net.update(dt, this.player);

    this.scene.update(dt, this);

    const interaction = this.scene.getInteraction(this.player);
    if (interaction) this.ui.showPrompt(interaction.label);
    else this.ui.hidePrompt();

    if (Input.consumeInteract()) {
      if (interaction) interaction.onSelect();
      else this.player.startAttack();
    }
    if (Input.consumeAttack()) this.player.startAttack();

    // 내 상태를 같은 방 플레이어들에게 전송
    if (Net.online) {
      this._netTimer -= dt;
      if (this._netTimer <= 0) {
        this._netTimer = 0.06;
        const s = this.player.toSnapshot();
        s.scene = this.scene.key;
        s.floor = this.currentFloor;
        Net.send('ps', s);
      }
    }

    // 사망 처리
    if (this.player.hp <= 0 && this._deathTimer === 0) {
      this._deathTimer = 1.4;
      this.ui.toast('쓰러졌습니다… 마을로 돌아갑니다.', 'bad');
    }
    if (this._deathTimer > 0) {
      this._deathTimer -= dt;
      if (this._deathTimer <= 0) {
        this._deathTimer = 0;
        this.player.hp = Math.max(1, Math.round(this.player.maxHp * 0.5));
        this.exitToVillage('heal');
      }
    }

    // HUD
    this.ui.updateHud(this.player);
    this.ui.updatePlace();
    if (this.scene.key === 'dungeon') this.ui.updateDungeonPanel(this.scene, this.party);
    else this.ui.updateGoalPanel(this.goals);

    // 파티 로비가 열려 있으면 주기적으로 갱신 (사람이 들어오는 걸 바로 보여주기)
    this._lobbyTimer -= dt;
    if (this._lobbyTimer <= 0) {
      this._lobbyTimer = 0.4;
      if (this.ui.isOpen('modal-party')) this.ui.renderPartyLobby();
      this.ui.updateNetChip();
    }
  }

  render(ctx) {
    const sh = FX.shakeOffset();
    ctx.save();
    ctx.translate(sh.x, sh.y);
    this.scene.render(ctx, this);
    FX.draw(ctx, this.camera);
    ctx.restore();
  }
}
