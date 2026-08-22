import { CFG, DIFFICULTIES, waveComposition } from './config.js';
import { Game } from './game.js';
import { keyLabel } from './keymap.js';
import { canAfford, clamp, costText, dist, fmtTime, roomCode } from './utils.js';
import { PHASE } from './wave.js';

var $2 = (id) => document.getElementById(id);
var TUTORIAL_STEPS = [
  "🌳 근처 나무에 다가가 <kbd>F</kbd> 를 꾹 눌러 채집하세요 (바위는 제작대에서 곡괭이를 만들어야 캘 수 있어요)",
  "🎒 <kbd>I</kbd> 로 인벤토리를 열어 벽\xB7타워를 골라 크리스탈 주변에 지으세요",
  "준비가 되면 <kbd>Enter</kbd> 로 첫 웨이브를 시작하세요!"
];
export var UI = class {
  constructor(game2) {
    this.game = game2;
    this.harvestHeld = false;
    this.nametags = /* @__PURE__ */ new Map();
    this.enemyTags = /* @__PURE__ */ new Map();
    this.el = {
      hud: $2("hud"),
      lobby: $2("lobby"),
      result: $2("result"),
      wood: $2("res-wood"),
      stone: $2("res-stone"),
      shard: $2("res-shard"),
      hupBtn: $2("btn-hup"),
      hupLv: $2("hup-lv"),
      hupCost: $2("hup-cost"),
      poolMode: $2("pool-mode"),
      iron: $2("res-iron"),
      toolRow: $2("tool-row"),
      crystalFill: $2("crystal-fill"),
      crystalText: $2("crystal-text"),
      crystalWarning: $2("crystal-warning"),
      waveLabel: $2("wave-label"),
      waveState: $2("wave-state"),
      waveBtn: $2("btn-wave"),
      partyList: $2("party-list"),
      netStatus: $2("net-status"),
      hpFill: $2("hp-fill"),
      hpText: $2("hp-text"),
      harvestWrap: $2("harvest-wrap"),
      harvestFill: $2("harvest-fill"),
      prompt: $2("prompt"),
      buildHint: $2("build-hint"),
      invBtn: $2("btn-inv"),
      invBadge: $2("inv-badge"),
      inv: $2("inventory"),
      invTabs: $2("inv-tabs"),
      invDesc: $2("inv-desc"),
      invList: $2("inv-list"),
      minimap: $2("minimap"),
      toasts: $2("toasts"),
      fxLayer: $2("fx-layer"),
      help: $2("help"),
      touch: $2("touch"),
      mute: $2("btn-mute"),
      pauseOverlay: $2("pause-overlay"),
      wavePreview: $2("wave-preview"),
      tutorial: $2("tutorial"),
      tutorialText: $2("tutorial-text")
    };
    this.mm = this.el.minimap.getContext("2d");
    this._bindLobby();
    this._bindHud();
    this._bindTouch();
    this._toastTimers = [];
  }
  // ------------------------------------------------------------- 인벤토리
  // 건설 · 제작 · 장비를 한 창에서 고른다. 예전 하단 단축키 바를 대체한다.
  openInventory(tab) {
    if (tab) this._invTab = tab;
    if (!this._invTab) this._invTab = "build";
    this.el.inv.classList.remove("hidden");
    this._invRendered = null;
    this.refreshInventory();
  }
  closeInventory() {
    this.el.inv.classList.add("hidden");
  }
  toggleInventory() {
    if (this.inventoryOpen) this.closeInventory();
    else this.openInventory();
  }
  get inventoryOpen() {
    return !this.el.inv.classList.contains("hidden");
  }
  // 탭별 항목 목록. 각 항목은 {key, icon, name, desc, cost, state, action}
  _invRows() {
    const g2 = this.game;
    const tab = this._invTab;
    if (tab === "build") {
      const rows = Object.entries(CFG.builds).map(([key, def]) => ({
        key,
        icon: def.icon,
        name: def.name,
        desc: def.desc,
        cost: def.cost,
        hotkey: g2.km.get("build:" + key),
        state: g2.buildMgr?.mode === key ? "active" : canAfford(g2.myPool, def.cost) ? "" : "poor",
        action: () => {
          g2.setBuildMode(key);
          this.closeInventory();
        }
      }));
      for (const [key, icon, name, desc] of [
        ["upgrade", "⬆️", "업그레이드", "건물을 클릭해 레벨을 올린다"],
        ["repair", "🔧", "수리", "손상된 만큼만 자원을 쓴다"],
        ["sell", "🔨", "철거", "투자한 자원의 50%를 돌려받는다"]
      ]) {
        rows.push({
          key,
          icon,
          name,
          desc,
          cost: null,
          hotkey: g2.km.get(key),
          state: g2.buildMgr?.mode === key ? "active" : "",
          action: () => {
            g2.setBuildMode(key);
            this.closeInventory();
          }
        });
      }
      return rows;
    }
    if (tab === "craft") {
      const rows = Object.entries(CFG.craft).map(([key, r]) => ({
        key,
        icon: r.icon,
        name: r.name,
        desc: r.desc,
        cost: r.cost,
        state: g2.local.tools[key] ? "owned" : !g2.hasStation("workbench") ? "locked" : canAfford(g2.myPool, r.cost) ? "" : "poor",
        note: g2.local.tools[key] ? "보유 중" : !g2.hasStation("workbench") ? "제작대 필요" : null,
        action: () => g2.requestCraft(key)
      }));
      rows.push({
        key: "smelt",
        icon: "⚙️",
        name: `철 ${CFG.smelt.yield}개 제련`,
        desc: "광물을 녹인다. 칼\xB7활과 3레벨 업그레이드의 재료.",
        cost: CFG.smelt.cost,
        state: !g2.hasStation("furnace") ? "locked" : canAfford(g2.myPool, CFG.smelt.cost) ? "" : "poor",
        note: !g2.hasStation("furnace") ? "화로 필요" : null,
        action: () => g2.requestSmelt()
      });
      return rows;
    }
    // 장비 — 만든 무기를 손에 든다
    const held = g2.local.heldWeapon;
    const rows = [{
      key: "none",
      icon: "✋",
      name: "맨손",
      desc: "무기를 내려놓는다",
      cost: null,
      state: held === "default" ? "active" : "",
      action: () => g2.requestEquip(null)
    }];
    for (const [key, r] of Object.entries(CFG.craft)) {
      if (!r.effect) continue;
      const owned = !!g2.local.tools[key];
      rows.push({
        key,
        icon: r.icon,
        name: r.name,
        desc: r.desc,
        cost: null,
        state: !owned ? "locked" : held === key ? "active" : "",
        note: !owned ? "제작 필요" : held === key ? "손에 든 무기" : null,
        action: () => g2.requestEquip(key)
      });
    }
    return rows;
  }
  refreshInventory() {
    if (!this.inventoryOpen) return;
    const rows = this._invRows();
    const DESC = {
      build: "지을 것을 고르면 배치 모드가 된다. 좌클릭으로 놓고, 우클릭\xB7Esc 로 취소한다.",
      craft: "제작대를 지으면 도구와 무기를, 화로를 지으면 철을 만들 수 있다.",
      gear: "손에 들 무기를 고른다. 든 무기의 효과만 적용된다."
    };
    this.el.invDesc.textContent = DESC[this._invTab];
    for (const t2 of this.el.invTabs.querySelectorAll(".inv-tab")) {
      t2.classList.toggle("on", t2.dataset.tab === this._invTab);
    }
    // 탭이 바뀔 때만 다시 그리고, 그 외에는 상태만 갱신한다
    if (this._invRendered !== this._invTab) {
      this.el.invList.innerHTML = "";
      this._invEls = {};
      for (const r of rows) {
        const btn = document.createElement("button");
        btn.className = "inv-item";
        btn.innerHTML = `<span class="ii-icon">${r.icon}</span>
<span class="ii-body"><b>${r.name}</b><span class="ii-desc">${r.desc || ""}</span></span>
<span class="ii-right"></span>`;
        btn.onclick = () => {
          r.action();
          this.refreshInventory();
        };
        this.el.invList.appendChild(btn);
        this._invEls[r.key] = btn;
      }
      this._invRendered = this._invTab;
    }
    for (const r of rows) {
      const btn = this._invEls[r.key];
      if (!btn) continue;
      const right = r.note || (r.cost ? costText(r.cost) : r.hotkey ? keyLabel(r.hotkey) : "");
      btn.querySelector(".ii-right").textContent = right;
      btn.className = "inv-item" + (r.state ? " " + r.state : "");
      btn.disabled = r.state === "owned" || r.state === "locked" || r.state === "poor";
    }
  }
  // 하단 안내문 + 인벤토리 버튼 배지 (예전 건설 바가 하던 일)
  refreshBuildBar() {
    const g2 = this.game;
    const damaged = [...g2.buildMgr?.buildings.values() || []].filter((b) => b.hp < b.maxHp).length;
    this.el.invBadge.textContent = String(damaged);
    this.el.invBadge.classList.toggle("hidden", damaged === 0);
    this.refreshInventory();
    const mode = g2.buildMgr?.mode;
    if (!mode) {
      this.el.buildHint.textContent = "";
      return;
    }
    if (CFG.builds[mode]) {
      this.el.buildHint.innerHTML = `${this._buildSpec(mode)} — 좌클릭 배치 / 우클릭\xB7Esc 취소`;
      return;
    }
    const hovered = g2.buildMgr?.hover;
    const detail = hovered ? this._hoverDetail(mode, hovered) : null;
    if (detail) {
      this.el.buildHint.innerHTML = detail;
    } else if (mode === "upgrade") {
      this.el.buildHint.textContent = "업그레이드할 건물을 클릭하세요 (벽은 내구도, 타워는 공격력\xB7사거리 상승)";
    } else if (mode === "repair") {
      this.el.buildHint.textContent = "수리할 건물을 클릭하세요 (손상된 비율만큼 자원 소모, 완전 파괴 재건축보다 저렴)";
    } else {
      this.el.buildHint.textContent = "철거할 건물을 클릭하세요 (투자 자원의 50% 환급)";
    }
  }
  // 건설 바에서 가리킨 건물의 Lv.1 성능을 한 줄로 만든다
  _buildSpec(key) {
    const def = CFG.builds[key];
    const st = def.levels[0];
    const parts = [`내구도 <b>${st.hp}</b>`];
    if (st.dmg) parts.push(`공격력 <b>${st.dmg}</b>`);
    if (st.range) parts.push(`사거리 <b>${st.range}</b>`);
    if (st.rate) parts.push(`초당 <b>${st.rate}</b>발`);
    if (st.splash) parts.push(`범위 <b>${st.splash}</b>`);
    if (st.slow) parts.push(`둔화 <b>${Math.round(st.slow * 100)}%</b>`);
    if (st.poisonDps) parts.push(`독 <b>${st.poisonDps}</b>/초`);
    if (st.buffMult) parts.push(`주변 타워 공격력 <b>+${Math.round(st.buffMult * 100)}%</b> (범위 ${st.buffRadius})`);
    const ok = canAfford(this.game.myPool, def.cost);
    return `${def.icon} ${def.name} — ${parts.join(" \xB7 ")} \xB7 비용 <b class="${ok ? "" : "lack"}">${costText(def.cost)}</b>`;
  }
  // 업그레이드/수리/철거 모드에서 가리킨 건물의 수치를 한 줄로 만든다
  _hoverDetail(mode, b) {
    const g2 = this.game;
    const name = `${b.def.icon} ${b.def.name} <b>Lv.${b.level}</b>`;
    if (mode === "sell") {
      const back = g2.buildMgr.refund(b);
      return `${name} 철거 — 환급 <b>${costText(back) || "-"}</b>`;
    }
    if (mode === "repair") {
      const cost = g2.buildMgr.repairCost(b);
      const hp = `체력 <b>${Math.ceil(b.hp)}/${b.maxHp}</b>`;
      if (!cost) return `${name} — ${hp} \xB7 손상 없음`;
      const ok2 = canAfford(g2.myPool, cost);
      return `${name} — ${hp} \xB7 수리 비용 <b class="${ok2 ? "" : "lack"}">${costText(cost)}</b>`;
    }
    const next = b.def.levels[b.level];
    if (!next) return `${name} — 이미 최대 레벨`;
    const cur = b.stats;
    const parts = [];
    const diff = (label, a, c2, unit = "") => {
      if (a === void 0 || c2 === void 0 || a === c2) return;
      parts.push(`${label} ${a}${unit}→<b>${c2}${unit}</b>`);
    };
    diff("내구도", cur.hp, next.hp);
    diff("공격력", cur.dmg, next.dmg);
    diff("사거리", cur.range, next.range);
    diff("연사", cur.rate, next.rate);
    diff("둔화", cur.slow, next.slow);
    diff("범위", cur.splash, next.splash);
    diff("독 피해", cur.poisonDps, next.poisonDps);
    diff("버프", cur.buffMult, next.buffMult);
    diff("버프 범위", cur.buffRadius, next.buffRadius);
    const ok = canAfford(g2.myPool, next.cost);
    return `${name} → <b>Lv.${b.level + 1}</b> \xB7 ${parts.join(" \xB7 ")} \xB7 비용 <b class="${ok ? "" : "lack"}">${costText(next.cost)}</b>`;
  }
  // ---------------------------------------------------------------- 로비
  _bindLobby() {
    const g2 = this.game;
    const nameIn = $2("in-name");
    nameIn.value = localStorage.getItem("cd.name") || "";
    const takeName = () => {
      const n = (nameIn.value || "플레이어").trim().slice(0, 10) || "플레이어";
      localStorage.setItem("cd.name", n);
      g2.net.name = n;
      return n;
    };
    this.selectedDifficulty = localStorage.getItem("cd.difficulty") || "normal";
    if (!DIFFICULTIES[this.selectedDifficulty]) this.selectedDifficulty = "normal";
    const diffOpts = Array.from(document.querySelectorAll("#diff-seg .diff-opt"));
    const paintDiff = () => {
      for (const btn of diffOpts) btn.classList.toggle("active", btn.dataset.diff === this.selectedDifficulty);
      $2("diff-desc").textContent = DIFFICULTIES[this.selectedDifficulty].desc;
    };
    for (const btn of diffOpts) {
      btn.onclick = () => {
        this.selectedDifficulty = btn.dataset.diff;
        localStorage.setItem("cd.difficulty", this.selectedDifficulty);
        paintDiff();
      };
    }
    paintDiff();
    const refreshResumeRow = () => {
      const save = Game.loadLocal();
      $2("resume-row").classList.toggle("hidden", !save);
      if (save) $2("btn-resume").textContent = `이어하기 (웨이브 ${save.snap.w.wave + 1})`;
    };
    refreshResumeRow();
    $2("btn-resume").onclick = () => {
      const save = Game.loadLocal();
      if (!save) {
        refreshResumeRow();
        return;
      }
      takeName();
      g2.net.leave();
      this.el.lobby.classList.add("hidden");
      g2.resumeLocal(save);
    };
    $2("btn-resume-discard").onclick = () => {
      Game.clearLocalSave();
      refreshResumeRow();
    };
    $2("in-server").value = g2.net.serverUrl;
    $2("btn-server").onclick = () => {
      g2.net.setServerUrl($2("in-server").value.trim());
      this.toast("서버 주소를 저장했다. 방을 다시 만들면 적용된다.", "good");
    };
    $2("btn-single").onclick = () => {
      takeName();
      g2.net.leave();
      Game.clearLocalSave();
      this.el.lobby.classList.add("hidden");
      g2.begin({ seed: Math.random() * 1e9 | 0, shared: true, difficulty: this.selectedDifficulty });
    };
    $2("btn-create").onclick = () => {
      takeName();
      const code = roomCode();
      g2.net.connect(code);
      this.seed = Math.random() * 1e9 | 0;
      this._showRoom(code);
    };
    $2("btn-join").onclick = () => {
      takeName();
      const code = ($2("in-code").value || "").trim().toUpperCase();
      if (code.length < 3) {
        this.toast("방 코드를 입력하세요", "bad");
        return;
      }
      g2.net.connect(code);
      this.seed = null;
      this._showRoom(code);
    };
    $2("btn-leave").onclick = () => {
      g2.net.leave();
      $2("room-box").classList.add("hidden");
      this.refreshLobby();
    };
    $2("btn-start").onclick = () => {
      if (!g2.net.isHost) {
        this.toast("방장만 시작할 수 있습니다", "bad");
        return;
      }
      const shared = $2("chk-shared").checked;
      const seed = this.seed || Math.random() * 1e9 | 0;
      const difficulty = this.selectedDifficulty;
      g2.net.send("startGame", { seed, shared, difficulty });
      this.el.lobby.classList.add("hidden");
      g2.begin({ seed, shared, difficulty });
      g2._syncRosterIntoGame();
    };
    $2("btn-again").onclick = () => {
      const g22 = this.game;
      if (g22.net.online && !g22.net.isHost) {
        this.toast("방장이 다시 시작하기를 기다리는 중…", "warn");
        return;
      }
      this.el.result.classList.add("hidden");
      const seed = Math.random() * 1e9 | 0;
      const difficulty = g22.difficulty || "normal";
      if (g22.net.online) g22.net.send("startGame", { seed, shared: g22.shared, difficulty });
      g22.begin({ seed, shared: g22.shared, difficulty });
      g22._syncRosterIntoGame();
    };
  }
  _showRoom(code) {
    $2("room-box").classList.remove("hidden");
    $2("room-code").textContent = code;
    this.refreshLobby();
  }
  refreshLobby() {
    const g2 = this.game;
    $2("lobby-status").textContent = g2.net.status;
    const list = $2("lobby-list");
    if (!list) return;
    list.innerHTML = "";
    for (const p2 of g2.net.roster()) {
      const li2 = document.createElement("li");
      li2.innerHTML = `<span>${p2.isHost ? "👑" : "🙂"}</span><span>${escapeHtml(p2.name)}${p2.isSelf ? " (나)" : ""}</span>`;
      list.appendChild(li2);
    }
    $2("btn-start").disabled = !g2.net.isHost;
    $2("btn-start").textContent = g2.net.isHost ? "게임 시작 (방장)" : "방장이 시작하기를 기다리는 중…";
  }
  // ---------------------------------------------------------------- HUD 바인딩
  _bindHud() {
    const g2 = this.game;
    this.el.waveBtn.onclick = () => g2.requestStartWave();
    this.el.hupBtn.onclick = () => g2.requestHarvestUpgrade();
    this.el.invBtn.onclick = () => {
      g2.sfx.click();
      this.toggleInventory();
    };
    $2("inv-close").onclick = () => this.closeInventory();
    for (const t2 of this.el.invTabs.querySelectorAll(".inv-tab")) {
      t2.onclick = () => {
        g2.sfx.click();
        this.openInventory(t2.dataset.tab);
      };
    }
    $2("btn-help").onclick = () => this.el.help.classList.toggle("hidden");
    $2("tutorial-skip").onclick = () => this._endTutorial();
    addEventListener("keydown", (e) => {
      if (e.target.closest("input")) return;
      if (this._listeningFor) return;
      const k2 = e.key.toLowerCase();
      if (k2 === "escape" && this.inventoryOpen) {
        this.closeInventory();
        return;
      }
      if (k2 === g2.km.get("inventory")) {
        g2.sfx.click();
        this.toggleInventory();
        return;
      }
      if (k2 === g2.km.get("help")) this.el.help.classList.toggle("hidden");
      if (k2 === g2.km.get("mute")) this._toggleMute();
    });
    this._syncMuteBtn();
    this.el.mute.onclick = () => this._toggleMute();
    this._bindVolume();
    this._bindKeyRebind();
  }
  // ---------------------------------------------------------------- 키 재지정
  _bindKeyRebind() {
    this._listeningFor = null;
    this._refreshRebindLabels();
    for (const el2 of document.querySelectorAll("kbd.rebind")) {
      el2.addEventListener("click", () => this._beginRebind(el2));
    }
    $2("keybind-reset").onclick = () => {
      this.game.km.reset();
      this._refreshRebindLabels();
      this._invRendered = null;
      this.refreshInventory();
      this.toast("키를 기본값으로 되돌렸다", "good");
    };
    const cbBox = $2("chk-colorblind");
    this.colorblind = localStorage.getItem("cd.colorblind") === "1";
    cbBox.checked = this.colorblind;
    cbBox.onchange = () => {
      this.colorblind = cbBox.checked;
      localStorage.setItem("cd.colorblind", this.colorblind ? "1" : "0");
    };
  }
  _refreshRebindLabels() {
    const km = this.game.km;
    for (const el2 of document.querySelectorAll("kbd.rebind")) {
      if (el2 !== this._listeningEl) el2.textContent = keyLabel(km.get(el2.dataset.action));
    }
  }
  _beginRebind(el2) {
    if (this._listeningFor) return;
    const action = el2.dataset.action;
    this._listeningFor = action;
    this._listeningEl = el2;
    el2.classList.add("listening");
    el2.textContent = "입력…";
    const finish = () => {
      el2.classList.remove("listening");
      this._listeningFor = null;
      this._listeningEl = null;
      removeEventListener("keydown", onKey, true);
    };
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const k2 = e.key.toLowerCase();
      this.game.input.keys.delete(k2);
      this.game.input.pressed.delete(k2);
      if (k2 === "escape") {
        finish();
        this._refreshRebindLabels();
        return;
      }
      if (["shift", "control", "alt", "meta"].includes(k2) || RESERVED_KEYS.has(k2)) {
        this.toast("이동 키나 보조 키는 재지정할 수 없습니다", "bad");
        finish();
        this._refreshRebindLabels();
        return;
      }
      const km = this.game.km;
      const prevKey = km.get(action);
      const conflict = km.keyInUse(k2, action);
      km.set(action, k2);
      if (conflict) {
        km.set(conflict, prevKey);
        this.toast(`${km.label(conflict)} 키와 서로 바뀌었다`, "warn");
      } else {
        this.toast(`${km.label(action)} → ${keyLabel(k2)}`, "good");
      }
      finish();
      this._refreshRebindLabels();
      this._invRendered = null;
      this.refreshInventory();
    };
    addEventListener("keydown", onKey, true);
  }
  _toggleMute() {
    const muted = this.game.sfx.toggleMute();
    this._syncMuteBtn();
    this._syncVolume?.();
    if (!muted) this.game.sfx.click();
  }
  _syncMuteBtn() {
    const muted = this.game.sfx.muted;
    this.el.mute.textContent = muted ? "🔇" : "🔊";
    this.el.mute.classList.toggle("off", muted);
  }
  // 음량 슬라이더. 끌면 음소거는 자동으로 풀린다 (소리를 키우려는 의도이므로)
  _bindVolume() {
    const sfx = this.game.sfx;
    const slider = $2("in-volume"), pct = $2("vol-pct");
    if (!slider) return;
    const sync = () => {
      slider.value = String(Math.round(sfx.volume * 100));
      pct.textContent = `${Math.round(sfx.volume * 100)}%`;
    };
    sync();
    slider.oninput = () => {
      sfx.setVolume(slider.valueAsNumber / 100);
      if (sfx.muted && sfx.volume > 0) {
        sfx.toggleMute();
        this._syncMuteBtn();
      }
      pct.textContent = `${slider.value}%`;
    };
    slider.onchange = () => sfx.click();
    this._syncVolume = sync;
  }
  _bindTouch() {
    const isTouch = matchMedia("(pointer: coarse)").matches;
    if (!isTouch) return;
    this.el.touch.classList.remove("hidden");
    const stick = $2("stick"), knob = stick.querySelector("i");
    let id = null, cx = 0, cy = 0;
    const R = 46;
    stick.addEventListener("pointerdown", (e) => {
      id = e.pointerId;
      const r = stick.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      stick.setPointerCapture(id);
    });
    stick.addEventListener("pointermove", (e) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const len = Math.hypot(dx, dy) || 1;
      const k2 = Math.min(1, len / R);
      dx = dx / len * k2;
      dy = dy / len * k2;
      knob.style.transform = `translate(${dx * R}px, ${dy * R}px)`;
      this.game.input.move.x = dx;
      this.game.input.move.y = -dy;
    });
    const release = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      knob.style.transform = "";
      this.game.input.move.x = 0;
      this.game.input.move.y = 0;
    };
    stick.addEventListener("pointerup", release);
    stick.addEventListener("pointercancel", release);
    const hb = $2("tb-harvest");
    hb.addEventListener("pointerdown", () => {
      this.harvestHeld = true;
    });
    hb.addEventListener("pointerup", () => {
      this.harvestHeld = false;
    });
    hb.addEventListener("pointercancel", () => {
      this.harvestHeld = false;
    });
    $2("tb-attack").addEventListener("pointerdown", () => this.game.requestAttack());
  }
  // ---------------------------------------------------------------- 라이프사이클
  onGameStart(resumed = false) {
    this.el.hud.classList.remove("hidden");
    this.el.lobby.classList.add("hidden");
    this.el.result.classList.add("hidden");
    this.el.pauseOverlay.classList.add("hidden");
    this._invTab = "build";
    this._invRendered = null;
    this._crystalWarned = false;
    this.el.crystalWarning.classList.add("hidden");
    this.closeInventory();
    this.refreshBuildBar();
    if (!resumed) this.toast("크리스탈을 지켜라! F로 채집, I로 인벤토리", "good");
    if (resumed || localStorage.getItem("cd.tutorialDone")) {
      this.el.tutorial.classList.add("hidden");
      this._tutStep = -1;
    } else {
      this._tutStep = 0;
      this._showTutorialStep();
    }
  }
  _showTutorialStep() {
    this.el.tutorialText.innerHTML = TUTORIAL_STEPS[this._tutStep];
    this.el.tutorial.classList.remove("hidden");
  }
  _endTutorial() {
    this._tutStep = -1;
    this.el.tutorial.classList.add("hidden");
    localStorage.setItem("cd.tutorialDone", "1");
  }
  _refreshTools() {
    const t2 = this.game.local.tools;
    const owned = Object.keys(CFG.craft).filter((k2) => t2[k2]);
    this.el.toolRow.innerHTML = owned.length ? owned.map((k2) => `<span class="tool" title="${CFG.craft[k2].name}">${CFG.craft[k2].icon}</span>`).join("") : `<span class="dim">제작대를 짓고 인벤토리에서 제작</span>`;
  }
  // 채집 → 건설 → 웨이브 시작 진행에 맞춰 튜토리얼 단계를 넘긴다
  _updateTutorial() {
    if (this._tutStep < 0) return;
    const g2 = this.game;
    if (this._tutStep === 0 && g2.stats.harvested > 0) {
      this._tutStep = 1;
      this._showTutorialStep();
    } else if (this._tutStep === 1 && g2.stats.built > 0) {
      this._tutStep = 2;
      this._showTutorialStep();
    } else if (this._tutStep === 2 && g2.wave.phase !== PHASE.PREP) {
      this._endTutorial();
    }
  }
  showResult(win, stats, wave) {
    this.el.result.classList.remove("hidden");
    $2("result-title").textContent = win ? "승리! 🎉" : "크리스탈 파괴… 💥";
    $2("result-sub").textContent = win ? `${CFG.wave.goal}웨이브를 모두 막아냈다.` : `${wave}웨이브까지 버텼다.`;
    $2("result-stats").innerHTML = `
<li>생존 시간 <b>${fmtTime(stats.time)}</b></li>
<li>처치한 몬스터 <b>${stats.kills}</b></li>
<li>채집한 자원 <b>${stats.harvested}</b></li>
<li>소모한 자원 <b>🪵${stats.spentWood} 🪨${stats.spentStone}${stats.spentIron ? ` ⚙️${stats.spentIron}` : ""}</b>${this._spendBreakdown(stats)}</li>
<li>건설한 구조물 <b>${stats.built}</b></li>`;
    const log = $2("result-wavelog");
    if (stats.waveLog && stats.waveLog.length) {
      log.innerHTML = stats.waveLog.map(
        (w2) => `<li><span>웨이브 ${w2.wave}</span><span>${fmtTime(w2.time)} \xB7 처치 <b>${w2.kills}</b></span></li>`
      ).join("");
      log.classList.remove("hidden");
    } else {
      log.classList.add("hidden");
    }
    const rec = this._recordStats(win, stats, win ? CFG.wave.goal : wave);
    $2("result-record").innerHTML = `
<li class="${rec.isNewBest ? "new-best" : ""}">🏆 역대 최고 웨이브 <b>${rec.bestWave}</b>${rec.isNewBest ? " — 신기록!" : ""}</li>
<li>⚔️ 누적 처치 <b>${rec.totalKills}</b></li>
<li>🎮 플레이 횟수 <b>${rec.plays}</b> (승리 ${rec.wins}회)</li>`;
  }
  // 자원을 어디에 썼는지 항목별로 쪼개 보여준다 (쓴 곳만)
  _spendBreakdown(stats) {
    const LABELS2 = { build: "건설", upgrade: "업그레이드", repair: "수리", harvest: "채집속도", craft: "제작" };
    const by = stats.spentBy || {};
    const rows = Object.entries(LABELS2).map(([key, label]) => [label, by[key] || { wood: 0, stone: 0, iron: 0 }]).filter(([, c2]) => c2.wood || c2.stone || c2.iron).map(([label, c2]) => {
      const parts = [];
      if (c2.wood) parts.push(`🪵${c2.wood}`);
      if (c2.stone) parts.push(`🪨${c2.stone}`);
      if (c2.iron) parts.push(`⚙️${c2.iron}`);
      return `<span>${label} ${parts.join(" ")}</span>`;
    });
    return rows.length ? `<div class="breakdown">${rows.join("")}</div>` : "";
  }
  // 최고 기록을 localStorage에 누적하고, 갱신된 기록을 돌려준다
  _recordStats(win, stats, finalWave) {
    let rec;
    try {
      rec = JSON.parse(localStorage.getItem("cd.record") || "{}");
    } catch {
      rec = {};
    }
    const isNewBest = !rec.bestWave || finalWave > rec.bestWave;
    rec.bestWave = Math.max(rec.bestWave || 0, finalWave);
    rec.totalKills = (rec.totalKills || 0) + stats.kills;
    rec.plays = (rec.plays || 0) + 1;
    rec.wins = (rec.wins || 0) + (win ? 1 : 0);
    localStorage.setItem("cd.record", JSON.stringify(rec));
    return { ...rec, isNewBest };
  }
  toast(text, kind = "") {
    const el2 = document.createElement("div");
    el2.className = `toast ${kind}`;
    el2.textContent = text;
    this.el.toasts.appendChild(el2);
    setTimeout(() => {
      el2.style.transition = "opacity 0.4s";
      el2.style.opacity = "0";
      setTimeout(() => el2.remove(), 400);
    }, 2400);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
  }
  onPauseChange(paused) {
    this.el.pauseOverlay.classList.toggle("hidden", !paused);
  }
  shake() {
    const c2 = document.getElementById("scene");
    c2.classList.remove("shake");
    void c2.offsetWidth;
    c2.classList.add("shake");
  }
  // ---------------------------------------------------------------- 매 프레임
  update(dt2) {
    const g2 = this.game;
    if (!g2.running) return;
    const pool = g2.myPool;
    this.el.wood.textContent = Math.floor(pool.wood);
    this.el.stone.textContent = Math.floor(pool.stone);
    this.el.shard.textContent = Math.floor(pool.shard || 0);
    this.el.poolMode.textContent = g2.shared ? "팀 공유 자원" : "개인 자원";
    const nextUp = CFG.harvest.upgrade[g2.local.harvestLv];
    this.el.hupLv.textContent = `Lv.${g2.local.harvestLv}`;
    this.el.hupCost.textContent = nextUp ? costText(nextUp.cost) : "최대";
    this.el.hupBtn.disabled = !nextUp || !canAfford(pool, nextUp.cost);
    this.el.iron.textContent = Math.floor(pool.iron || 0);
    this._refreshTools();
    const c2 = g2.world.crystal;
    const ratio = clamp(c2.hp / c2.maxHp, 0, 1);
    this.el.crystalFill.style.transform = `scaleX(${ratio})`;
    this.el.crystalText.textContent = `${Math.ceil(c2.hp)} / ${c2.maxHp}`;
    const danger = ratio < 0.3 && ratio > 0;
    this.el.crystalWarning.classList.toggle("hidden", !danger);
    if (danger && !this._crystalWarned) {
      this._crystalWarned = true;
      this.toast("💎 크리스탈이 위험하다! 수정 정수(R)로 회복하거나 방어선을 지켜라", "bad");
      g2.sfx.crystalDanger();
    } else if (!danger) {
      this._crystalWarned = false;
    }
    const w2 = g2.wave;
    this.el.waveLabel.textContent = `웨이브 ${Math.min(CFG.wave.goal, w2.wave + 1)} / ${CFG.wave.goal}`;
    if (w2.phase === PHASE.PREP) {
      this.el.waveState.textContent = `준비 시간 ${fmtTime(w2.prepLeft)}`;
      this.el.waveBtn.classList.remove("hidden");
      this._showWavePreview(Math.min(CFG.wave.goal, w2.wave + 1));
    } else if (w2.phase === PHASE.COMBAT) {
      this.el.waveState.textContent = `남은 몬스터 ${w2.remaining}`;
      this.el.waveBtn.classList.add("hidden");
      this.el.wavePreview.classList.add("hidden");
    } else {
      this.el.waveState.textContent = w2.phase === PHASE.WON ? "방어 성공" : "패배";
      this.el.waveBtn.classList.add("hidden");
      this.el.wavePreview.classList.add("hidden");
    }
    const p2 = g2.local;
    const hpR = clamp(p2.hp / p2.maxHp, 0, 1);
    this.el.hpFill.style.transform = `scaleX(${hpR})`;
    this.el.hpText.textContent = p2.alive ? `${Math.ceil(p2.hp)} / ${p2.maxHp}` : `부활까지 ${Math.ceil(p2.downTimer)}초`;
    if (p2.harvesting) {
      this.el.harvestWrap.classList.remove("hidden");
      this.el.harvestFill.style.transform = `scaleX(${clamp(p2.harvesting.t / p2.harvesting.need, 0, 1)})`;
    } else {
      this.el.harvestWrap.classList.add("hidden");
    }
    const near = g2.world.nearestNode(p2.x, p2.z, CFG.harvest.range);
    if (near && !g2.buildMgr.mode) {
      this.el.prompt.classList.remove("hidden");
      if (near.type === "gem" && !p2.hasPickaxe) {
        this.el.prompt.innerHTML = `💠 정수석 — 곡괭이가 있어야 캘 수 있습니다 (제작대에서 제작)`;
      } else {
        const label = near.type === "tree" ? "🌳 나무" : near.type === "gem" ? "💠 정수석" : "🪨 바위";
        this.el.prompt.innerHTML = `${label} — <kbd>F</kbd> 꾹 눌러 채집 (남은 ${near.charges})`;
      }
    } else {
      this.el.prompt.classList.add("hidden");
    }
    this.el.netStatus.textContent = g2.net.online ? g2.isHost ? "호스트" : "참가자" : "싱글";
    this._updateTutorial();
    this._updateParty();
    this._updateNametags();
    this._updateEnemyTags();
    this._drawMinimap();
    this.refreshBuildBar();
  }
  // 보스·원거리형처럼 색만으로 구분하기 어려운 몬스터 위에 종류 아이콘을, 슬로우·중독 상태에는
  // 상태 아이콘을 띄운다 (색약 접근성 + 일반 플레이어의 순간 판단을 모두 돕는다).
  // 잡몹까지 상시 아이콘을 달면 웨이브 중 화면이 번잡해지므로 상태 이상이 있을 때만 표시한다.
  _updateEnemyTags() {
    const g2 = this.game;
    const now = performance.now() / 1e3;
    const seen = /* @__PURE__ */ new Set();
    const hunting = g2.wave.phase === PHASE.COMBAT && g2.wave.remaining <= 3;
    for (const e of g2.enemyMgr.list) {
      if (e.dead) continue;
      const isNotable = hunting || this.colorblind || e.type === "boss" || e.type === "shooter" || e.type === "raider";
      const slowed = now < e.slowUntil;
      const poisoned = now < e.poisonUntil;
      if (!isNotable && !slowed && !poisoned) continue;
      const text = (isNotable ? CFG.enemies[e.type].icon : "") + (slowed ? "❄️" : "") + (poisoned ? "☠️" : "");
      seen.add(e.id);
      let tag = this.enemyTags.get(e.id);
      if (!tag) {
        tag = document.createElement("div");
        tag.className = "enemy-tag";
        this.el.fxLayer.appendChild(tag);
        this.enemyTags.set(e.id, tag);
      }
      if (tag.textContent !== text) tag.textContent = text;
      const pos = g2.sm.worldToScreenXYZ(e.x, 2.4 * e.st.scale, e.z);
      const onScreen = pos.visible && pos.x >= 0 && pos.x <= innerWidth && pos.y >= 0 && pos.y <= innerHeight;
      if (!onScreen && !hunting) {
        tag.style.display = "none";
        continue;
      }
      tag.style.display = "";
      tag.classList.toggle("offscreen", !onScreen);
      const at = onScreen ? pos : this._edgePoint(pos);
      tag.style.transform = `translate(-50%,-50%) translate(${at.x}px, ${at.y}px)`;
    }
    for (const [id, tag] of this.enemyTags) {
      if (!seen.has(id)) {
        tag.remove();
        this.enemyTags.delete(id);
      }
    }
  }
  // 화면 밖 좌표를 화면 가장자리로 끌어당긴다. 카메라 뒤쪽이면 방향을 뒤집는다.
  // 위아래는 웨이브 패널·건설 바에 가리지 않도록 안쪽으로 더 들여놓는다.
  _edgePoint(pos) {
    const cx = innerWidth / 2, cy = innerHeight / 2;
    const inset = { top: 120, bottom: 130, side: 40 };
    let dx = pos.x - cx, dy = pos.y - cy;
    if (!pos.visible) {
      dx = -dx;
      dy = -dy;
    }
    if (!dx && !dy) return { x: cx, y: cy };
    const limX = cx - inset.side;
    const limY = cy - (dy < 0 ? inset.top : inset.bottom);
    const s2 = Math.min(limX / Math.abs(dx || 1e-6), limY / Math.abs(dy || 1e-6));
    return { x: cx + dx * s2, y: cy + dy * s2 };
  }
  // 준비 시간에 다음 웨이브 구성을 미리 보여준다 (보스 등장 웨이브는 강조 표시)
  _showWavePreview(wave) {
    if (this._previewWave === wave) return;
    this._previewWave = wave;
    const comp = waveComposition(wave);
    const hasBoss = comp.some((c2) => c2.type === "boss");
    this.el.wavePreview.innerHTML = comp.map(
      (c2) => `<span class="${c2.type === "boss" ? "boss" : ""}">${CFG.enemies[c2.type].icon}<b>${c2.count}</b></span>`
    ).join("");
    this.el.wavePreview.classList.toggle("boss-wave", hasBoss);
    this.el.wavePreview.classList.remove("hidden");
  }
  _updateParty() {
    const g2 = this.game;
    const list = this.el.partyList;
    const ids = [...g2.players.keys()].join(",");
    if (this._partyIds !== ids || this._partyShared !== g2.shared) {
      this._partyIds = ids;
      this._partyShared = g2.shared;
      list.innerHTML = "";
      for (const p2 of g2.players.values()) {
        const li2 = document.createElement("li");
        const dot = document.createElement("span");
        dot.className = "dot";
        dot.style.background = "#" + p2.color.toString(16).padStart(6, "0");
        const who = document.createElement("span");
        who.className = "who";
        who.textContent = p2.name + (p2.isLocal ? " (나)" : "");
        li2.append(dot, who);
        if (!p2.isLocal && !g2.shared) {
          const give = document.createElement("button");
          give.className = "give";
          give.textContent = "🪵10";
          give.onclick = () => g2.requestGive(p2.id, 10, 0);
          const give2 = document.createElement("button");
          give2.className = "give";
          give2.textContent = "🪨10";
          give2.onclick = () => g2.requestGive(p2.id, 0, 10);
          li2.append(give, give2);
        }
        list.appendChild(li2);
      }
    }
  }
  _updateNametags() {
    const g2 = this.game;
    for (const p2 of g2.players.values()) {
      let tag = this.nametags.get(p2.id);
      if (!tag) {
        tag = document.createElement("div");
        tag.className = "nametag";
        tag.textContent = p2.name;
        this.el.fxLayer.appendChild(tag);
        this.nametags.set(p2.id, tag);
      }
      const pos = g2.sm.worldToScreenXYZ(p2.x, 2.3, p2.z);
      if (!pos.visible) {
        tag.style.display = "none";
        continue;
      }
      tag.style.display = "";
      tag.style.transform = `translate(-50%,-50%) translate(${pos.x}px, ${pos.y}px)`;
      tag.style.opacity = p2.alive ? "1" : "0.45";
    }
    for (const [id, tag] of this.nametags) {
      if (!g2.players.has(id)) {
        tag.remove();
        this.nametags.delete(id);
      }
    }
  }
  _drawMinimap() {
    const g2 = this.game, ctx = this.mm;
    const size = this.el.minimap.width;
    const world = CFG.world.size;
    const s2 = size / world;
    const tx = (x2) => size / 2 + x2 * s2;
    const tz = (z2) => size / 2 + z2 * s2;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "rgba(20,30,45,0.85)";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "rgba(95,212,255,0.5)";
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, CFG.world.buildRadius * s2, 0, Math.PI * 2);
    ctx.stroke();
    for (const n of g2.world.nodes) {
      if (n.depleted) continue;
      ctx.fillStyle = n.type === "tree" ? "#3e8b47" : n.type === "gem" ? "#d68eff" : "#9aa3b5";
      ctx.fillRect(tx(n.x) - 1, tz(n.z) - 1, 2.5, 2.5);
    }
    const pulse = 0.4 + Math.sin(performance.now() / 200) * 0.35;
    for (const b of g2.buildMgr.buildings.values()) {
      ctx.fillStyle = b.key === "wall" ? "#c9cfda" : "#ffcc55";
      ctx.fillRect(tx(b.x) - 1.5, tz(b.z) - 1.5, 3, 3);
      if (b.hp / b.maxHp < 0.5) {
        ctx.strokeStyle = `rgba(255,90,106,${pulse})`;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(tx(b.x) - 3.2, tz(b.z) - 3.2, 6.4, 6.4);
      }
    }
    ctx.strokeStyle = "rgba(190,120,255,0.95)";
    ctx.lineWidth = 1.4;
    for (const p2 of g2.world.portals) {
      ctx.beginPath();
      ctx.arc(tx(p2.x), tz(p2.z), 3.4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "#ff6a7d";
    for (const e of g2.enemyMgr.list) {
      if (e.dead) continue;
      const ex = tx(e.x), ez = tz(e.z), r = 2.2;
      ctx.beginPath();
      ctx.moveTo(ex, ez - r);
      ctx.lineTo(ex + r * 0.87, ez + r * 0.5);
      ctx.lineTo(ex - r * 0.87, ez + r * 0.5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "#7fe6ff";
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    for (const p2 of g2.players.values()) {
      ctx.fillStyle = "#" + p2.color.toString(16).padStart(6, "0");
      ctx.beginPath();
      ctx.arc(tx(p2.x), tz(p2.z), p2.isLocal ? 3.2 : 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = p2.isLocal ? 1.4 : 1;
      ctx.stroke();
    }
  }
};
function escapeHtml(s2) {
  return String(s2).replace(/[&<>"']/g, (c2) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c2]);
}
