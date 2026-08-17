class GameManager {
  constructor() {
    this.player = new Player({ name: '승주', x: PLAYER_SPAWN_X });
    this.camera = new Camera();
    this.party = new Party(this.player);

    this.currentFloor = 1;
    this.maxUnlockedFloor = 1;
    this.dungeonCleared = {};
    this.goals = { visitHunting: false, equipWeapon: false, heal: false };

    this.ui = new UI(this);
    this.scene = new VillageScene(this, this.currentFloor);
    this.ui.refreshAll();
  }

  handleFacility(type, floor) {
    switch (type) {
      case 'hunting': this.enterHuntingArea(); break;
      case 'shop': this.ui.openShop(); break;
      case 'portal': this.ui.openPortal(); break;
      case 'heal': this.ui.openHeal(); break;
      case 'dungeon': this.ui.openPartySetup(); break;
      case 'stairs': this.tryClimbStairs(floor); break;
    }
  }

  enterHuntingArea() {
    this.goals.visitHunting = true;
    this.scene = new HuntingAreaScene(this, this.currentFloor);
    this.player.x = this.scene.spawnX;
    this.ui.refreshAll();
  }

  exitToVillage(from) {
    this.scene = new VillageScene(this, this.currentFloor);
    const fac = this.scene.facilities.find(f => f.type === from);
    this.player.x = fac ? fac.x : PLAYER_SPAWN_X;
    this.party.clear();
  }

  enterDungeon(companions) {
    this.scene = new DungeonScene(this, this.currentFloor, companions);
    this.player.x = this.scene.spawnX;
  }

  completeDungeon(floor) {
    this.dungeonCleared[floor] = true;
    const unlocked = Math.min(floor + 1, MAX_PROTOTYPE_FLOOR);
    const newFloorUnlocked = unlocked > this.maxUnlockedFloor;
    this.maxUnlockedFloor = Math.max(this.maxUnlockedFloor, unlocked);
    this.ui.showDungeonClear(floor, newFloorUnlocked && floor < MAX_PROTOTYPE_FLOOR);
  }

  returnFromDungeonClear() {
    this.scene = new VillageScene(this, this.currentFloor);
    const fac = this.scene.facilities.find(f => f.type === 'dungeon');
    this.player.x = fac ? fac.x : PLAYER_SPAWN_X;
    this.party.clear();
  }

  tryClimbStairs(floor) {
    if (this.maxUnlockedFloor > floor) {
      this.travelToFloor(floor + 1);
    } else {
      this.ui.showToast('던전을 클리어해야 다음 층으로 이동할 수 있습니다.');
    }
  }

  travelToFloor(floor) {
    this.currentFloor = floor;
    this.scene = new VillageScene(this, floor);
    this.player.x = PLAYER_SPAWN_X;
    this.ui.closeModal('modal-portal');
    this.ui.refreshAll();
  }

  buyWeapon() {
    if (this.player.weapon) return;
    if (this.player.gold < 100) { this.ui.showToast('골드가 부족합니다.'); return; }
    this.player.gold -= 100;
    this.player.weapon = { name: '철검', atk: 10, enhanceLevel: 0 };
    this.goals.equipWeapon = true;
    this.ui.refreshAll();
    this.ui.populateShop(this);
  }

  enhanceWeapon() {
    const w = this.player.weapon;
    if (!w) return;
    const cost = 50 * (w.enhanceLevel + 1);
    if (this.player.gold < cost) { this.ui.showToast('골드가 부족합니다.'); return; }
    this.player.gold -= cost;
    w.enhanceLevel++;
    w.atk += 5;
    w.name = '철검 +' + w.enhanceLevel;
    this.ui.refreshAll();
    this.ui.populateShop(this);
  }

  healHp() { this.player.healHp(); this.goals.heal = true; this.ui.refreshAll(); }
  healMp() { this.player.healMp(); this.goals.heal = true; this.ui.refreshAll(); }

  onEnemyKilled(leveled) {
    this.ui.refreshAll();
    if (leveled) this.ui.showToast('레벨 업! Lv.' + this.player.level);
  }

  requestHelp() {
    if (!(this.scene instanceof DungeonScene)) return;
    if (!this.party.canAdd()) { this.ui.showToast('파티 인원이 가득 찼습니다.'); return; }
    if (this.currentFloor >= MAX_PROTOTYPE_FLOOR) { this.ui.showToast('상위 층이 없습니다.'); return; }
    const helperLevel = (this.currentFloor + 1) * 4;
    this.party.addMember(new PartyMember({
      name: (this.currentFloor + 1) + '층 지원자',
      level: helperLevel,
      x: this.player.x - 90,
      color: '#f0b429',
      isHelper: true,
    }));
    this.ui.showToast('상위 층 플레이어가 파티에 합류했습니다!');
  }

  update(dt) {
    this.scene.update(dt, this);

    const interaction = this.scene.getInteraction(this.player);
    if (interaction) {
      this.ui.showPrompt(interaction.label);
      if (Input.consumeAction()) interaction.onSelect();
    } else {
      this.ui.hidePrompt();
      if (Input.consumeAction() && this.scene.isCombat) {
        this.scene.playerAttack(this.player);
      }
    }

    this.ui.updateTopBar(this.player);
    const inDungeon = this.scene instanceof DungeonScene;
    document.body.classList.toggle('in-dungeon', inDungeon);
    if (inDungeon) {
      this.ui.updateDungeonPanel(this.scene, this.party);
    } else {
      this.ui.updateGoalPanel(this.goals);
    }
  }

  render(ctx) {
    this.scene.render(ctx, this);
  }
}
