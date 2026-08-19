class UIManager {
  constructor() {
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Main Menu
    document.getElementById('btn-quick-game').addEventListener('click', () => {
      window.gameManager?.startGame('solo');
    });

    document.getElementById('btn-create-room').addEventListener('click', () => {
      this.showModal('menu-lobby');
      window.networkManager?.createRoom();
    });

    document.getElementById('btn-join-room').addEventListener('click', () => {
      const code = prompt('방 코드를 입력하세요:');
      if (code) {
        window.networkManager?.joinRoom(code);
      }
    });

    document.getElementById('btn-shop').addEventListener('click', () => {
      this.showModal('menu-shop');
      this.updateShopUI();
    });

    // Game Controls
    document.getElementById('btn-pause').addEventListener('click', () => {
      if (window.gameManager) {
        window.gameManager.togglePause();
      }
    });

    document.getElementById('btn-menu').addEventListener('click', () => {
      this.showModal('menu-pause');
    });

    document.getElementById('btn-resume').addEventListener('click', () => {
      window.gameManager?.togglePause();
      this.hideModal('menu-pause');
    });

    document.getElementById('btn-quit').addEventListener('click', () => {
      window.gameManager?.endGame();
      this.showModal('menu-main');
      this.hideModal('menu-pause');
    });

    document.getElementById('btn-restart').addEventListener('click', () => {
      window.gameManager?.startGame('solo');
      this.hideModal('menu-gameover');
    });

    document.getElementById('btn-back-menu').addEventListener('click', () => {
      this.showModal('menu-main');
      this.hideModal('menu-gameover');
    });

    document.getElementById('btn-start-game').addEventListener('click', () => {
      window.networkManager?.startGame();
    });

    document.getElementById('btn-leave-room').addEventListener('click', () => {
      window.networkManager?.leaveRoom();
      this.showModal('menu-main');
    });

    document.getElementById('btn-copy').addEventListener('click', function () {
      const code = document.getElementById('room-code').textContent;
      navigator.clipboard.writeText(code);
      this.textContent = '복사됨!';
      setTimeout(() => {
        this.textContent = '복사';
      }, 2000);
    });

    // Close buttons
    document.querySelectorAll('.btn-close').forEach(btn => {
      btn.addEventListener('click', function () {
        const modal = this.getAttribute('data-close');
        UIManager.hideModal(modal);
      });
    });

    // 키보드 ESC로 모달 닫기
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const activeModal = document.querySelector('.modal.active');
        if (activeModal && activeModal.id !== 'menu-main') {
          this.hideModal(activeModal.id);
        }
      }
    });
  }

  showModal(id) {
    document.getElementById(id)?.classList.add('active');
  }

  hideModal(id) {
    document.getElementById(id)?.classList.remove('active');
  }

  updateWaveInfo(wave, waveMax, crystalHp, crystalMax) {
    document.getElementById('wave-current').textContent = wave;
    document.getElementById('wave-max').textContent = waveMax;
    document.getElementById('crystal-hp').textContent = Math.ceil(crystalHp);
    document.getElementById('crystal-max').textContent = crystalMax;

    // 체력바 색상 변화
    const hpPercent = crystalHp / crystalMax;
    const hpElement = document.getElementById('crystal-hp');
    if (hpPercent < 0.3) {
      hpElement.style.color = '#ef4444';
    } else if (hpPercent < 0.6) {
      hpElement.style.color = '#f59e0b';
    } else {
      hpElement.style.color = 'inherit';
    }
  }

  updatePlayerStats(essence, level, highestWave) {
    document.getElementById('essence').textContent = essence;
    document.getElementById('level').textContent = level;
    document.getElementById('highest-wave').textContent = highestWave || '-';
  }

  showWaveCompleteUpgrades() {
    this.hideModal('menu-main');
    this.showModal('menu-wave-clear');

    const container = document.getElementById('wave-upgrades');
    container.innerHTML = '';

    // 4개 중 3개 랜덤 선택
    const shuffled = [...CONFIG.WAVE_UPGRADES].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 3);

    selected.forEach((upgrade) => {
      const btn = document.createElement('button');
      btn.className = 'upgrade-option';
      btn.innerHTML = `
        <div class="upgrade-name">${upgrade.name}</div>
        <div class="upgrade-effect">${upgrade.effect}</div>
      `;
      btn.addEventListener('click', () => {
        window.gameManager?.selectWaveUpgrade(upgrade);
        this.hideModal('menu-wave-clear');
      });
      container.appendChild(btn);
    });
  }

  showLevelUpChoices() {
    this.showModal('menu-levelup');

    const container = document.getElementById('levelup-upgrades');
    container.innerHTML = '';

    // 4개 중 3개 랜덤 선택
    const shuffled = [...CONFIG.LEVELUP_UPGRADES].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 3);

    selected.forEach((upgrade) => {
      const btn = document.createElement('button');
      btn.className = 'upgrade-option';
      btn.innerHTML = `
        <div class="upgrade-name">${upgrade.name}</div>
        <div class="upgrade-effect">${upgrade.effect}</div>
      `;
      btn.addEventListener('click', () => {
        window.gameManager?.selectLevelUpgrade(upgrade);
        this.hideModal('menu-levelup');
      });
      container.appendChild(btn);
    });
  }

  showGameOver(wave, kills, essence) {
    this.showModal('menu-gameover');
    document.getElementById('gameover-wave').textContent = wave;
    document.getElementById('gameover-kills').textContent = kills;
    document.getElementById('gameover-essence').textContent = essence;
  }

  updateShopUI() {
    const soulCount = localStorage.getItem('soul_fragments') || 0;
    document.getElementById('soul-count').textContent = soulCount;

    const container = document.getElementById('shop-items');
    container.innerHTML = '';

    CONFIG.SHOP_ITEMS.forEach((item) => {
      const div = document.createElement('div');
      div.className = 'shop-item';
      div.innerHTML = `
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-effect">${item.effect}</div>
        <div class="shop-item-price">💎 ${item.cost}</div>
      `;
      div.addEventListener('click', () => {
        if (parseInt(soulCount) >= item.cost) {
          this.purchaseItem(item);
        } else {
          alert('영혼조각이 부족합니다');
        }
      });
      container.appendChild(div);
    });

    document.getElementById('stat-highest').textContent = localStorage.getItem('highest_wave') || 0;
    document.getElementById('stat-kills').textContent = localStorage.getItem('total_kills') || 0;
  }

  purchaseItem(item) {
    const current = parseInt(localStorage.getItem('soul_fragments') || 0);
    if (current >= item.cost) {
      localStorage.setItem('soul_fragments', current - item.cost);

      // 영구 능력치 적용
      const stats = JSON.parse(localStorage.getItem('player_stats') || '{}');
      stats[item.type] = (stats[item.type] || 1) * item.value;
      localStorage.setItem('player_stats', JSON.stringify(stats));

      this.updateShopUI();
      alert(item.name + '을(를) 구입했습니다!');
    }
  }

  updateLobby(playerCount, players, roomCode) {
    document.getElementById('room-code').textContent = roomCode || '-';
    document.getElementById('player-count').textContent = `${playerCount}/4`;

    const container = document.getElementById('player-list');
    container.innerHTML = '';

    players.forEach((player) => {
      const div = document.createElement('div');
      div.className = 'player-item';
      div.innerHTML = `
        <div class="player-name">${player.name}</div>
        <div class="player-status ${player.ready ? 'ready' : ''}">${player.ready ? '준비됨' : '준비 중...'}</div>
      `;
      container.appendChild(div);
    });
  }

  static showModal(id) {
    document.getElementById(id)?.classList.add('active');
  }

  static hideModal(id) {
    document.getElementById(id)?.classList.remove('active');
  }
}

// 전역 UI 매니저
window.uiManager = new UIManager();
