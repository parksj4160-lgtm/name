class UI {
  constructor(gm) {
    this.gm = gm;
    this.$ = (id) => document.getElementById(id);

    this.topHp = this.$('top-hp');
    this.topHpBar = this.$('top-hp-bar');
    this.topMp = this.$('top-mp');
    this.topMpBar = this.$('top-mp-bar');
    this.topGold = this.$('top-gold');
    this.topLevel = this.$('top-level');
    this.topExpBar = this.$('top-exp-bar');

    this.leftPanel = this.$('left-panel');
    this.prompt = this.$('interact-prompt');
    this.toast = this.$('toast');
    this.bossBar = this.$('boss-bar');
    this.bossBarFill = this.$('boss-bar-fill');
    this.bossBarLabel = this.$('boss-bar-label');

    this._bindStaticButtons();
  }

  _bindStaticButtons() {
    bindTapButton(this.$('btn-heal-hp'), () => this.gm.healHp());
    bindTapButton(this.$('btn-heal-mp'), () => this.gm.healMp());
    bindTapButton(this.$('btn-help-request'), () => this.gm.requestHelp());

    bindTapButton(this.$('btn-dungeon-enter'), () => {
      const chosen = Array.from(document.querySelectorAll('.party-cand:checked')).map(cb => {
        const [name, lvl] = cb.value.split('|');
        return new PartyMember({ name, level: Number(lvl), x: this.gm.player.x - 60, color: '#5fd17a' });
      });
      this.closeModal('modal-party');
      this.gm.enterDungeon(chosen);
    });

    bindTapButton(this.$('btn-clear-confirm'), () => {
      this.closeModal('modal-clear');
      this.gm.returnFromDungeonClear();
    });

    document.querySelectorAll('.modal-close').forEach(btn => {
      bindTapButton(btn, () => this.closeModal(btn.dataset.target));
    });

    bindTapButton(this.$('btn-menu-shop'), () => this.openShop());
    ['btn-menu-bag', 'btn-menu-character', 'btn-menu-skill', 'btn-menu-menu',
      'btn-settings', 'btn-achievements', 'btn-dex'].forEach(id => {
      bindTapButton(this.$(id), () => this.showToast('프로토타입에는 아직 준비되지 않은 기능입니다.'));
    });
  }

  refreshAll() {
    this.updateTopBar(this.gm.player);
    this.updateGoalPanel(this.gm.goals);
  }

  updateTopBar(p) {
    this.topHp.textContent = `${p.hp}/${p.maxHp}`;
    this.topMp.textContent = `${p.mp}/${p.maxMp}`;
    this.topGold.textContent = p.gold;
    this.topLevel.textContent = 'Lv.' + p.level;
    this.topExpBar.style.width = Math.min(100, Math.round((p.exp / p.expToNext) * 100)) + '%';
    this.topHpBar.style.width = Math.round((p.hp / p.maxHp) * 100) + '%';
    this.topMpBar.style.width = Math.round((p.mp / p.maxMp) * 100) + '%';
  }

  updateGoalPanel(goals) {
    const items = [
      ['사냥터 방문', goals.visitHunting],
      ['장비 착용하기', goals.equipWeapon],
      ['회복 상점 이용하기', goals.heal],
    ];
    const done = items.filter(i => i[1]).length;
    this.leftPanel.innerHTML = `
      <div class="panel-title">🚩 오늘의 목표 (${done}/${items.length})</div>
      <ul>${items.map(i => `<li class="${i[1] ? 'done' : ''}">${i[1] ? '✅' : '▫️'} ${i[0]}</li>`).join('')}</ul>`;
    this.bossBar.classList.add('hidden');
  }

  updateDungeonPanel(scene, party) {
    const members = [this.gm.player, ...party.members];
    this.leftPanel.innerHTML = `
      <div class="panel-title">🛡️ 파티 (${members.length}/4)</div>
      <ul>${members.map(m => `<li>${m.name} · Lv.${m.level}</li>`).join('')}</ul>`;
    const boss = scene.getBoss ? scene.getBoss() : null;
    if (boss) {
      this.bossBar.classList.remove('hidden');
      this.bossBarFill.style.width = Math.round((boss.hp / boss.maxHp) * 100) + '%';
      this.bossBarLabel.textContent = `${boss.name} Lv.${boss.level}  ${boss.hp}/${boss.maxHp}`;
    } else {
      this.bossBar.classList.add('hidden');
    }
  }

  showPrompt(label) {
    this.prompt.textContent = label + '  (E 또는 ⚔)';
    this.prompt.classList.remove('hidden');
    this.prompt.onclick = () => Input.queueAction();
  }
  hidePrompt() { this.prompt.classList.add('hidden'); }

  showToast(msg) {
    this.toast.textContent = msg;
    this.toast.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toast.classList.add('hidden'), 2200);
  }

  openModal(id) { this.$(id).classList.remove('hidden'); }
  closeModal(id) { this.$(id).classList.add('hidden'); }

  openShop() { this.populateShop(this.gm); this.openModal('modal-shop'); }

  populateShop(gm) {
    const p = gm.player;
    const box = this.$('shop-body');
    if (!p.weapon) {
      box.innerHTML = `
        <div class="item-card">
          <div class="item-name">철검</div>
          <div class="item-desc">공격력 +10</div>
          <div class="item-price">100 GOLD</div>
          <button id="btn-shop-buy" class="action-btn">구매</button>
        </div>`;
      bindTapButton(this.$('btn-shop-buy'), () => gm.buyWeapon());
    } else {
      const cost = 50 * (p.weapon.enhanceLevel + 1);
      box.innerHTML = `
        <div class="item-card">
          <div class="item-name">${p.weapon.name}</div>
          <div class="item-desc">무기 공격력 +${p.weapon.atk} (총 공격력 ${p.attack})</div>
          <div class="item-price">${cost} GOLD</div>
          <button id="btn-shop-enhance" class="action-btn">강화</button>
        </div>`;
      bindTapButton(this.$('btn-shop-enhance'), () => gm.enhanceWeapon());
    }
  }

  openHeal() { this.openModal('modal-heal'); }

  openPortal() {
    const box = this.$('portal-body');
    let html = '';
    for (let f = 1; f <= MAX_PROTOTYPE_FLOOR; f++) {
      const locked = f > this.gm.maxUnlockedFloor;
      const current = f === this.gm.currentFloor;
      html += `<div class="floor-row ${current ? 'current' : ''}">
        <span>${f}층 ${current ? '(현재 위치)' : ''}</span>
        <button class="action-btn" ${locked || current ? 'disabled' : ''} data-floor="${f}">${locked ? '🔒 잠김' : '이동'}</button>
      </div>`;
    }
    box.innerHTML = html;
    box.querySelectorAll('button[data-floor]').forEach(btn => {
      bindTapButton(btn, () => this.gm.travelToFloor(Number(btn.dataset.floor)));
    });
    this.openModal('modal-portal');
  }

  openPartySetup() {
    const box = this.$('party-body');
    const p = this.gm.player;
    const candidates = [
      ['파티원1', p.level],
      ['파티원2', Math.max(1, p.level - 1)],
      ['파티원3', p.level + 1],
    ];
    box.innerHTML = `
      <div class="party-hint">본인 포함 최대 4인까지 함께 던전에 입장할 수 있습니다.</div>
      ${candidates.map(([name, lvl]) => `
        <label class="party-cand-row">
          <input type="checkbox" class="party-cand" value="${name}|${lvl}"> ${name} · Lv.${lvl}
        </label>`).join('')}`;
    this.openModal('modal-party');
  }

  showDungeonClear(floor, unlockedNext) {
    this.$('clear-body').innerHTML = `
      <p>${floor}층 던전 클리어!</p>
      <p>${unlockedNext ? (floor + 1) + '층이 해금되었습니다.' : '수고하셨습니다.'}</p>`;
    this.openModal('modal-clear');
  }
}
