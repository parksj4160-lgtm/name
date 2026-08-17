class UI {
  constructor(gm) {
    this.gm = gm;
    this.$ = (id) => document.getElementById(id);

    this.hudName = this.$('hud-name');
    this.hudLevel = this.$('hud-level');
    this.hudWeapon = this.$('hud-weapon');
    this.hudHp = this.$('hud-hp'); this.hudHpBar = this.$('hud-hp-bar');
    this.hudMp = this.$('hud-mp'); this.hudMpBar = this.$('hud-mp-bar');
    this.hudExp = this.$('hud-exp'); this.hudExpBar = this.$('hud-exp-bar');
    this.hudGold = this.$('hud-gold');
    this.hudFloor = this.$('hud-floor');
    this.hudPlace = this.$('hud-place');
    this.hudNet = this.$('hud-net'); this.hudNetText = this.$('hud-net-text');

    this.leftPanel = this.$('left-panel');
    this.prompt = this.$('interact-prompt');
    this.promptLabel = this.prompt.querySelector('.prompt-label');
    this.toastWrap = this.$('toast-wrap');
    this.bossBar = this.$('boss-bar');
    this.bossBarFill = this.$('boss-bar-fill');
    this.bossBarLabel = this.$('boss-bar-label');

    this._lastPrompt = null;
    this._bind();
  }

  _bind() {
    bindTapButton(this.prompt, () => Input.queueAction());

    document.querySelectorAll('.modal-close').forEach(btn => {
      bindTapButton(btn, () => this.closeModal(btn.dataset.target));
    });

    bindTapButton(this.$('btn-menu-shop'), () => this.openShop());
    bindTapButton(this.$('btn-menu-party'), () => this.openPartyLobby());
    bindTapButton(this.$('btn-settings'), () => this.openSettings());

    bindTapButton(this.$('btn-room-create'), () => this.gm.createRoom());
    bindTapButton(this.$('btn-room-join'), () => {
      const code = this.$('room-code-input').value.trim().toUpperCase();
      if (code.length < 3) { this.toast('방 코드를 입력하세요.', 'bad'); return; }
      this.gm.joinRoom(code);
    });
    bindTapButton(this.$('btn-room-leave'), () => this.gm.leaveRoom());
    bindTapButton(this.$('btn-dungeon-enter'), () => {
      this.closeModal('modal-party');
      this.gm.enterDungeon();
    });

    bindTapButton(this.$('btn-clear-confirm'), () => {
      this.closeModal('modal-clear');
      this.gm.returnFromDungeonClear();
    });

    bindTapButton(this.$('btn-settings-save'), () => {
      const name = this.$('set-name').value.trim() || '모험가';
      const server = this.$('set-server').value.trim();
      this.gm.applySettings(name, server);
      this.closeModal('modal-settings');
      this.toast('설정을 저장했습니다.', 'good');
    });

    ['btn-menu-bag', 'btn-menu-character', 'btn-menu-skill', 'btn-achievements', 'btn-dex']
      .forEach(id => bindTapButton(this.$(id), () => this.toast('아직 준비 중인 기능입니다.')));
  }

  // ---------------- HUD ----------------
  refreshAll() {
    this.updateHud(this.gm.player);
    this.updatePlace();
  }

  updateHud(p) {
    this.hudName.textContent = p.name;
    this.hudLevel.textContent = p.level;
    this.hudWeapon.textContent = p.weapon ? p.weapon.name : '맨손';
    this.hudHp.textContent = `${p.hp} / ${p.maxHp}`;
    this.hudMp.textContent = `${p.mp} / ${p.maxMp}`;
    this.hudGold.textContent = p.gold;
    this.hudHpBar.style.width = Math.round((p.hp / p.maxHp) * 100) + '%';
    this.hudMpBar.style.width = Math.round((p.mp / p.maxMp) * 100) + '%';
    const expPct = Math.min(100, Math.round((p.exp / p.expToNext) * 100));
    this.hudExpBar.style.width = expPct + '%';
    this.hudExp.textContent = `EXP ${expPct}%`;
  }

  updatePlace() {
    const gm = this.gm;
    this.hudFloor.textContent = gm.currentFloor + 'F';
    const key = gm.scene ? gm.scene.key : 'village';
    if (key === 'village') this.hudPlace.textContent = themeFor(gm.currentFloor).name;
    else if (key === 'hunting') this.hudPlace.textContent = '사냥터';
    else this.hudPlace.textContent = '던전';
  }

  updateNetChip() {
    const online = Net.online;
    this.hudNet.classList.toggle('online', online);
    this.hudNetText.textContent = online
      ? `${Net.roomCode} · ${Net.roster().length}인`
      : '솔로';
  }

  updateGoalPanel(goals) {
    const items = [
      ['사냥터에서 몬스터 사냥', goals.visitHunting],
      ['장비 상점에서 무기 구매', goals.equipWeapon],
      ['회복 상점 이용하기', goals.heal],
      ['던전 클리어하기', goals.dungeon],
    ];
    const done = items.filter(i => i[1]).length;
    this.leftPanel.innerHTML = `
      <div class="panel-title"><span>🚩 오늘의 목표</span><span class="count">${done}/${items.length}</span></div>
      <ul>${items.map(i => `
        <li class="${i[1] ? 'done' : ''}"><span>${i[1] ? '✅' : '▫️'}</span><span class="goal-text">${i[0]}</span></li>
      `).join('')}</ul>`;
    this.bossBar.classList.add('hidden');
  }

  updateDungeonPanel(scene, party) {
    const p = this.gm.player;
    const mates = party.inPlace('dungeon', scene.floor);
    const rows = [
      `<div class="member-row"><span class="member-dot me"></span><span class="lv">Lv.${p.level}</span><span>${p.name}</span>
        <span class="hpmini"><i style="width:${Math.round(p.hp / p.maxHp * 100)}%"></i></span></div>`,
      ...mates.map(m => `<div class="member-row"><span class="member-dot"></span><span class="lv">Lv.${m.level}</span><span>${m.name}</span>
        <span class="hpmini"><i style="width:${Math.round(Math.max(0, m.hp) / m.maxHp * 100)}%"></i></span></div>`),
    ];
    const empty = PARTY_MAX - rows.length;
    for (let i = 0; i < empty; i++) rows.push('<div class="empty-slot">· 빈 자리</div>');

    this.leftPanel.innerHTML = `
      <div class="panel-title"><span>🛡️ 파티</span><span class="count">${1 + mates.length}/${PARTY_MAX}</span></div>
      ${rows.join('')}
      <div class="wave-chip">${scene.waveLabel}</div>`;

    const boss = scene.getBoss ? scene.getBoss() : null;
    if (boss) {
      this.bossBar.classList.remove('hidden');
      this.bossBarFill.style.width = Math.round((boss.hp / boss.maxHp) * 100) + '%';
      this.bossBarLabel.textContent = `${boss.name}  Lv.${boss.level}   ${boss.hp} / ${boss.maxHp}`;
    } else {
      this.bossBar.classList.add('hidden');
    }
  }

  // ---------------- 프롬프트 / 토스트 ----------------
  showPrompt(label) {
    if (this._lastPrompt !== label) {
      this.promptLabel.textContent = label;
      this._lastPrompt = label;
    }
    this.prompt.classList.remove('hidden');
  }
  hidePrompt() {
    this.prompt.classList.add('hidden');
    this._lastPrompt = null;
  }

  toast(msg, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    this.toastWrap.appendChild(el);
    setTimeout(() => { el.classList.add('fade'); }, 1900);
    setTimeout(() => { el.remove(); }, 2250);
    while (this.toastWrap.children.length > 3) this.toastWrap.firstChild.remove();
  }
  showToast(msg) { this.toast(msg); }

  // ---------------- 모달 ----------------
  openModal(id) { this.$(id).classList.remove('hidden'); }
  closeModal(id) { this.$(id).classList.add('hidden'); }
  isOpen(id) { return !this.$(id).classList.contains('hidden'); }

  openShop() { this.populateShop(this.gm); this.openModal('modal-shop'); }

  populateShop(gm) {
    const p = gm.player;
    const box = this.$('shop-body');
    if (!p.weapon) {
      const afford = p.gold >= 100;
      box.innerHTML = `
        <div class="item-card">
          <div class="item-icon">🗡️</div>
          <div class="item-name">철검</div>
          <div class="item-desc">가장 기본적이지만 믿음직한 검.<br>공격력이 크게 올라갑니다.</div>
          <div class="stat-line"><span>공격력</span><b>+10</b></div>
          <div class="stat-line"><span>현재 총 공격력</span><b>${p.attack}</b></div>
          <div class="item-price">💰 100 G</div>
          <button id="btn-shop-buy" class="btn gold block" ${afford ? '' : 'disabled'}>
            ${afford ? '구매하기' : '골드가 부족합니다'}
          </button>
        </div>`;
      bindTapButton(this.$('btn-shop-buy'), () => gm.buyWeapon());
    } else {
      const w = p.weapon;
      const cost = 50 * (w.enhanceLevel + 1);
      const afford = p.gold >= cost;
      box.innerHTML = `
        <div class="item-card">
          <div class="item-icon">🗡️</div>
          <div class="item-name">철검 ${w.enhanceLevel ? `<span class="plus">+${w.enhanceLevel}</span>` : ''}</div>
          <div class="item-desc">강화할수록 공격력이 5씩 올라갑니다.</div>
          <div class="stat-line"><span>무기 공격력</span><b>+${w.atk}</b></div>
          <div class="stat-line"><span>강화 후</span><b>+${w.atk + 5}</b></div>
          <div class="stat-line"><span>현재 총 공격력</span><b>${p.attack}</b></div>
          <div class="item-price">💰 ${cost} G</div>
          <button id="btn-shop-enhance" class="btn gold block" ${afford ? '' : 'disabled'}>
            ${afford ? `+${w.enhanceLevel + 1} 강화하기` : '골드가 부족합니다'}
          </button>
        </div>`;
      bindTapButton(this.$('btn-shop-enhance'), () => gm.enhanceWeapon());
    }
  }

  openHeal() { this.populateHeal(); this.openModal('modal-heal'); }

  populateHeal() {
    const p = this.gm.player;
    this.$('heal-body').innerHTML = `
      <div class="heal-row">
        <span class="hr-ico">❤️</span>
        <span class="hr-meta"><span class="hr-name">체력 회복</span><span class="hr-val">${p.hp} / ${p.maxHp}</span></span>
        <button id="btn-heal-hp" class="btn primary" ${p.hp >= p.maxHp ? 'disabled' : ''}>회복</button>
      </div>
      <div class="heal-row">
        <span class="hr-ico">💧</span>
        <span class="hr-meta"><span class="hr-name">마나 회복</span><span class="hr-val">${p.mp} / ${p.maxMp}</span></span>
        <button id="btn-heal-mp" class="btn primary" ${p.mp >= p.maxMp ? 'disabled' : ''}>회복</button>
      </div>
      <p class="hint">마을 회복소는 <b>무료</b>입니다. 던전에 들어가기 전에 꼭 채우고 가세요.</p>`;
    bindTapButton(this.$('btn-heal-hp'), () => this.gm.healHp());
    bindTapButton(this.$('btn-heal-mp'), () => this.gm.healMp());
  }

  openPortal() {
    const box = this.$('portal-body');
    let html = '';
    for (let f = 1; f <= MAX_PROTOTYPE_FLOOR; f++) {
      const locked = f > this.gm.maxUnlockedFloor;
      const current = f === this.gm.currentFloor;
      const cls = current ? 'current' : (locked ? 'locked' : '');
      html += `
        <div class="floor-row ${cls}">
          <div class="floor-badge">${f}F</div>
          <div class="floor-meta">
            <div class="floor-name">${themeFor(f).name}</div>
            <div class="floor-sub">${locked ? '아래 층 던전을 클리어해야 열립니다' :
              (current ? '현재 머무는 층' : '권장 레벨 ' + (f * 3) + ' 이상')}</div>
          </div>
          <button class="btn ${current ? 'ghost' : 'primary'}" ${locked || current ? 'disabled' : ''} data-floor="${f}">
            ${locked ? '🔒' : (current ? '현재' : '이동')}
          </button>
        </div>`;
    }
    box.innerHTML = html;
    box.querySelectorAll('button[data-floor]').forEach(btn => {
      bindTapButton(btn, () => this.gm.travelToFloor(Number(btn.dataset.floor)));
    });
    this.openModal('modal-portal');
  }

  // ---------------- 파티 로비 ----------------
  openPartyLobby() {
    this.renderPartyLobby();
    this.openModal('modal-party');
  }

  renderPartyLobby() {
    const online = Net.online;
    this.$('room-dot').classList.toggle('on', online);
    this.$('room-state-text').textContent = Net.status;
    this.$('btn-room-leave').classList.toggle('hidden', !online);
    this.$('btn-room-create').classList.toggle('hidden', online);

    const roster = online ? Net.roster() : [{ id: Net.selfId, name: Net.name, level: this.gm.player.level, isSelf: true, isHost: true }];
    const slots = [];
    roster.slice(0, PARTY_MAX).forEach(r => {
      slots.push(`
        <div class="slot ${r.isSelf ? 'me' : ''}">
          <div class="slot-avatar">${r.isSelf ? '🧝' : '🧑'}</div>
          <div class="slot-meta">
            <div class="slot-name">${r.name}
              ${r.isSelf ? '<span class="tag">나</span>' : ''}
              ${r.isHost ? '<span class="tag host">호스트</span>' : ''}
            </div>
            <div class="slot-sub">Lv.${r.level}</div>
          </div>
        </div>`);
    });
    for (let i = slots.length; i < PARTY_MAX; i++) {
      slots.push(`
        <div class="slot empty">
          <div class="slot-avatar">＋</div>
          <div class="slot-meta">
            <div class="slot-name" style="color:#6d7597">빈 자리</div>
            <div class="slot-sub">${online ? '다른 플레이어가 들어오면 채워집니다' : '방을 만들어야 초대할 수 있습니다'}</div>
          </div>
        </div>`);
    }
    this.$('party-slots').innerHTML = slots.join('');

    this.$('party-hint').innerHTML = online
      ? `방 코드 <b>${Net.roomCode}</b> 를 알려주면 같이 들어올 수 있습니다.<br>
         파티원은 <b>실제로 접속한 사람만</b> 표시됩니다. 혼자서도 입장할 수 있어요.`
      : `파티는 <b>실제 플레이어</b>로만 구성됩니다. AI 동료는 없습니다.<br>
         <b>방 만들기</b> → 나온 코드를 상대가 <b>참여</b>에 입력하면 함께 플레이합니다.<br>
         지금 바로 혼자 입장해도 됩니다.`;
  }

  // ---------------- 클리어 / 설정 ----------------
  showDungeonClear(floor, unlockedNext, partySize) {
    this.$('clear-body').innerHTML = `
      <p><b>${floor}층 수호자</b>를 쓰러뜨렸습니다!</p>
      <p class="reward">파티 ${partySize}인 · ${floor}층 던전 완주</p>
      ${unlockedNext ? `<div class="unlock">🎉 ${floor + 1}층이 열렸습니다</div>` : ''}`;
    this.openModal('modal-clear');
  }

  openSettings() {
    this.$('set-name').value = Net.name;
    this.$('set-server').value = Net.serverUrl;
    this.openModal('modal-settings');
  }
}
