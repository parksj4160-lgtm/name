import { CFG, waveComposition } from './config.js';
import { keyLabel } from './keymap.js';
import { canAfford, clamp, costText, fmtTime, roomCode } from './utils.js';
import { PHASE } from './wave.js';

var $2 = (id) => document.getElementById(id);
var TUTORIAL_STEPS = [
  "\u{1F333} \uADFC\uCC98 \uB098\uBB34\uC5D0 \uB2E4\uAC00\uAC00 <kbd>F</kbd> \uB97C \uAFB9 \uB20C\uB7EC \uCC44\uC9D1\uD558\uC138\uC694 (\uBC14\uC704\uB294 \uC81C\uC791\uB300\uC5D0\uC11C \uACE1\uAD2D\uC774\uB97C \uB9CC\uB4E4\uC5B4\uC57C \uCE98 \uC218 \uC788\uC5B4\uC694)",
  "<kbd>1</kbd>~<kbd>7</kbd> \uB85C \uD06C\uB9AC\uC2A4\uD0C8 \uC8FC\uBCC0\uC5D0 \uBCBD\xB7\uD0C0\uC6CC\uB97C \uC9C0\uC73C\uC138\uC694",
  "\uC900\uBE44\uAC00 \uB418\uBA74 <kbd>Enter</kbd> \uB85C \uCCAB \uC6E8\uC774\uBE0C\uB97C \uC2DC\uC791\uD558\uC138\uC694!"
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
      pickaxeBtn: $2("btn-pickaxe"),
      pickaxeStatus: $2("pickaxe-status"),
      pickaxeCost: $2("pickaxe-cost"),
      crystalFill: $2("crystal-fill"),
      crystalText: $2("crystal-text"),
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
      buildBar: $2("build-bar"),
      buildHint: $2("build-hint"),
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
    this._buildSlots();
    this._bindLobby();
    this._bindHud();
    this._bindTouch();
    this._toastTimers = [];
  }
  // ---------------------------------------------------------------- 건설 바
  _buildSlots() {
    const bar = this.el.buildBar;
    bar.innerHTML = "";
    this.slots = {};
    const km = this.game.km;
    const add = (key, icon, name, sub, action) => {
      const b = document.createElement("button");
      b.className = "slot";
      b.innerHTML = `<span class="hk">${keyLabel(km.get(action))}</span><span class="em">${icon}</span><span class="nm">${name}</span><span class="cs">${sub}</span>`;
      b.onclick = () => {
        this.game.sfx.click();
        this.game.setBuildMode(key);
      };
      b.onmouseenter = () => {
        this.hoverKey = key;
      };
      b.onmouseleave = () => {
        this.hoverKey = null;
      };
      bar.appendChild(b);
      this.slots[key] = b;
      this.slots[key]._action = action;
    };
    for (const [key, def] of Object.entries(CFG.builds)) {
      add(key, def.icon, def.name, costText(def.cost), "build:" + key);
    }
    add("upgrade", "\u2B06\uFE0F", "\uC5C5\uADF8\uB808\uC774\uB4DC", "\uAC74\uBB3C \uD074\uB9AD", "upgrade");
    add("repair", "\u{1F527}", "\uC218\uB9AC", "\uC190\uC0C1 \uBE44\uB840", "repair");
    add("sell", "\u{1F528}", "\uCCA0\uAC70", "50% \uD658\uAE09", "sell");
    this.repairBadge = document.createElement("span");
    this.repairBadge.className = "badge hidden";
    this.slots.repair.appendChild(this.repairBadge);
  }
  // 키를 재지정한 뒤 건설 바의 단축키 표시를 갱신한다
  _refreshSlotHotkeys() {
    const km = this.game.km;
    for (const el2 of Object.values(this.slots)) {
      const hk = el2.querySelector(".hk");
      if (hk && el2._action) hk.textContent = keyLabel(km.get(el2._action));
    }
  }
  refreshBuildBar() {
    const g2 = this.game;
    const pool = g2.myPool;
    for (const [key, el2] of Object.entries(this.slots)) {
      const active = g2.buildMgr?.mode === key;
      el2.classList.toggle("active", active);
      const def = CFG.builds[key];
      el2.classList.toggle("poor", !!def && !canAfford(pool, def.cost));
    }
    const damaged = [...g2.buildMgr?.buildings.values() || []].filter((b) => b.hp < b.maxHp).length;
    this.repairBadge.textContent = String(damaged);
    this.repairBadge.classList.toggle("hidden", damaged === 0);
    const mode = g2.buildMgr?.mode;
    if (this.hoverKey && CFG.builds[this.hoverKey]) {
      this.el.buildHint.innerHTML = this._buildSpec(this.hoverKey);
      return;
    }
    if (!mode) {
      this.el.buildHint.textContent = "";
    } else if (CFG.builds[mode]) {
      this.el.buildHint.textContent = `${CFG.builds[mode].name}: ${CFG.builds[mode].desc} \u2014 \uC88C\uD074\uB9AD \uBC30\uCE58 / \uC6B0\uD074\uB9AD\xB7Esc \uCDE8\uC18C`;
    } else {
      const hovered = g2.buildMgr?.hover;
      const detail = hovered ? this._hoverDetail(mode, hovered) : null;
      if (detail) {
        this.el.buildHint.innerHTML = detail;
      } else if (mode === "upgrade") {
        this.el.buildHint.textContent = "\uC5C5\uADF8\uB808\uC774\uB4DC\uD560 \uAC74\uBB3C\uC744 \uD074\uB9AD\uD558\uC138\uC694 (\uBCBD\uC740 \uB0B4\uAD6C\uB3C4, \uD0C0\uC6CC\uB294 \uACF5\uACA9\uB825\xB7\uC0AC\uAC70\uB9AC \uC0C1\uC2B9)";
      } else if (mode === "repair") {
        this.el.buildHint.textContent = "\uC218\uB9AC\uD560 \uAC74\uBB3C\uC744 \uD074\uB9AD\uD558\uC138\uC694 (\uC190\uC0C1\uB41C \uBE44\uC728\uB9CC\uD07C \uC790\uC6D0 \uC18C\uBAA8, \uC644\uC804 \uD30C\uAD34 \uC7AC\uAC74\uCD95\uBCF4\uB2E4 \uC800\uB834)";
      } else {
        this.el.buildHint.textContent = "\uCCA0\uAC70\uD560 \uAC74\uBB3C\uC744 \uD074\uB9AD\uD558\uC138\uC694 (\uD22C\uC790 \uC790\uC6D0\uC758 50% \uD658\uAE09)";
      }
    }
  }
  // 건설 바에서 가리킨 건물의 Lv.1 성능을 한 줄로 만든다
  _buildSpec(key) {
    const def = CFG.builds[key];
    const st = def.levels[0];
    const parts = [`\uB0B4\uAD6C\uB3C4 <b>${st.hp}</b>`];
    if (st.dmg) parts.push(`\uACF5\uACA9\uB825 <b>${st.dmg}</b>`);
    if (st.range) parts.push(`\uC0AC\uAC70\uB9AC <b>${st.range}</b>`);
    if (st.rate) parts.push(`\uCD08\uB2F9 <b>${st.rate}</b>\uBC1C`);
    if (st.splash) parts.push(`\uBC94\uC704 <b>${st.splash}</b>`);
    if (st.slow) parts.push(`\uB454\uD654 <b>${Math.round(st.slow * 100)}%</b>`);
    if (st.poisonDps) parts.push(`\uB3C5 <b>${st.poisonDps}</b>/\uCD08`);
    if (st.buffMult) parts.push(`\uC8FC\uBCC0 \uD0C0\uC6CC \uACF5\uACA9\uB825 <b>+${Math.round(st.buffMult * 100)}%</b> (\uBC94\uC704 ${st.buffRadius})`);
    const ok = canAfford(this.game.myPool, def.cost);
    return `${def.icon} ${def.name} \u2014 ${parts.join(" \xB7 ")} \xB7 \uBE44\uC6A9 <b class="${ok ? "" : "lack"}">${costText(def.cost)}</b>`;
  }
  // 업그레이드/수리/철거 모드에서 가리킨 건물의 수치를 한 줄로 만든다
  _hoverDetail(mode, b) {
    const g2 = this.game;
    const name = `${b.def.icon} ${b.def.name} <b>Lv.${b.level}</b>`;
    if (mode === "sell") {
      const back = g2.buildMgr.refund(b);
      return `${name} \uCCA0\uAC70 \u2014 \uD658\uAE09 <b>${costText(back) || "-"}</b>`;
    }
    if (mode === "repair") {
      const cost = g2.buildMgr.repairCost(b);
      const hp = `\uCCB4\uB825 <b>${Math.ceil(b.hp)}/${b.maxHp}</b>`;
      if (!cost) return `${name} \u2014 ${hp} \xB7 \uC190\uC0C1 \uC5C6\uC74C`;
      const ok2 = canAfford(g2.myPool, cost);
      return `${name} \u2014 ${hp} \xB7 \uC218\uB9AC \uBE44\uC6A9 <b class="${ok2 ? "" : "lack"}">${costText(cost)}</b>`;
    }
    const next = b.def.levels[b.level];
    if (!next) return `${name} \u2014 \uC774\uBBF8 \uCD5C\uB300 \uB808\uBCA8`;
    const cur = b.stats;
    const parts = [];
    const diff = (label, a, c2, unit = "") => {
      if (a === void 0 || c2 === void 0 || a === c2) return;
      parts.push(`${label} ${a}${unit}\u2192<b>${c2}${unit}</b>`);
    };
    diff("\uB0B4\uAD6C\uB3C4", cur.hp, next.hp);
    diff("\uACF5\uACA9\uB825", cur.dmg, next.dmg);
    diff("\uC0AC\uAC70\uB9AC", cur.range, next.range);
    diff("\uC5F0\uC0AC", cur.rate, next.rate);
    diff("\uB454\uD654", cur.slow, next.slow);
    diff("\uBC94\uC704", cur.splash, next.splash);
    diff("\uB3C5 \uD53C\uD574", cur.poisonDps, next.poisonDps);
    diff("\uBC84\uD504", cur.buffMult, next.buffMult);
    diff("\uBC84\uD504 \uBC94\uC704", cur.buffRadius, next.buffRadius);
    const ok = canAfford(g2.myPool, next.cost);
    return `${name} \u2192 <b>Lv.${b.level + 1}</b> \xB7 ${parts.join(" \xB7 ")} \xB7 \uBE44\uC6A9 <b class="${ok ? "" : "lack"}">${costText(next.cost)}</b>`;
  }
  // ---------------------------------------------------------------- 로비
  _bindLobby() {
    const g2 = this.game;
    const nameIn = $2("in-name");
    nameIn.value = localStorage.getItem("cd.name") || "";
    const takeName = () => {
      const n = (nameIn.value || "\uD50C\uB808\uC774\uC5B4").trim().slice(0, 10) || "\uD50C\uB808\uC774\uC5B4";
      localStorage.setItem("cd.name", n);
      g2.net.name = n;
      return n;
    };
    $2("in-server").value = g2.net.serverUrl;
    $2("btn-server").onclick = () => {
      g2.net.setServerUrl($2("in-server").value.trim());
      this.toast("\uC11C\uBC84 \uC8FC\uC18C\uB97C \uC800\uC7A5\uD588\uB2E4. \uBC29\uC744 \uB2E4\uC2DC \uB9CC\uB4E4\uBA74 \uC801\uC6A9\uB41C\uB2E4.", "good");
    };
    $2("btn-single").onclick = () => {
      takeName();
      g2.net.leave();
      this.el.lobby.classList.add("hidden");
      g2.begin({ seed: Math.random() * 1e9 | 0, shared: true });
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
        this.toast("\uBC29 \uCF54\uB4DC\uB97C \uC785\uB825\uD558\uC138\uC694", "bad");
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
        this.toast("\uBC29\uC7A5\uB9CC \uC2DC\uC791\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4", "bad");
        return;
      }
      const shared = $2("chk-shared").checked;
      const seed = this.seed || Math.random() * 1e9 | 0;
      g2.net.send("startGame", { seed, shared });
      this.el.lobby.classList.add("hidden");
      g2.begin({ seed, shared });
      g2._syncRosterIntoGame();
    };
    $2("btn-again").onclick = () => {
      const g22 = this.game;
      if (g22.net.online && !g22.net.isHost) {
        this.toast("\uBC29\uC7A5\uC774 \uB2E4\uC2DC \uC2DC\uC791\uD558\uAE30\uB97C \uAE30\uB2E4\uB9AC\uB294 \uC911\u2026", "warn");
        return;
      }
      this.el.result.classList.add("hidden");
      const seed = Math.random() * 1e9 | 0;
      if (g22.net.online) g22.net.send("startGame", { seed, shared: g22.shared });
      g22.begin({ seed, shared: g22.shared });
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
      li2.innerHTML = `<span>${p2.isHost ? "\u{1F451}" : "\u{1F642}"}</span><span>${escapeHtml(p2.name)}${p2.isSelf ? " (\uB098)" : ""}</span>`;
      list.appendChild(li2);
    }
    $2("btn-start").disabled = !g2.net.isHost;
    $2("btn-start").textContent = g2.net.isHost ? "\uAC8C\uC784 \uC2DC\uC791 (\uBC29\uC7A5)" : "\uBC29\uC7A5\uC774 \uC2DC\uC791\uD558\uAE30\uB97C \uAE30\uB2E4\uB9AC\uB294 \uC911\u2026";
  }
  // ---------------------------------------------------------------- HUD 바인딩
  _bindHud() {
    const g2 = this.game;
    this.el.waveBtn.onclick = () => g2.requestStartWave();
    this.el.hupBtn.onclick = () => g2.requestHarvestUpgrade();
    this.el.pickaxeBtn.onclick = () => g2.requestPickaxe();
    $2("btn-help").onclick = () => this.el.help.classList.toggle("hidden");
    $2("tutorial-skip").onclick = () => this._endTutorial();
    addEventListener("keydown", (e) => {
      if (e.target.closest("input")) return;
      if (this._listeningFor) return;
      const k2 = e.key.toLowerCase();
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
      this._refreshSlotHotkeys();
      this.toast("\uD0A4\uB97C \uAE30\uBCF8\uAC12\uC73C\uB85C \uB418\uB3CC\uB838\uB2E4", "good");
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
    el2.textContent = "\uC785\uB825\u2026";
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
        this.toast("\uC774\uB3D9 \uD0A4\uB098 \uBCF4\uC870 \uD0A4\uB294 \uC7AC\uC9C0\uC815\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4", "bad");
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
        this.toast(`${km.label(conflict)} \uD0A4\uC640 \uC11C\uB85C \uBC14\uB00C\uC5C8\uB2E4`, "warn");
      } else {
        this.toast(`${km.label(action)} \u2192 ${keyLabel(k2)}`, "good");
      }
      finish();
      this._refreshRebindLabels();
      this._refreshSlotHotkeys();
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
    this.el.mute.textContent = muted ? "\u{1F507}" : "\u{1F50A}";
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
  onGameStart() {
    this.el.hud.classList.remove("hidden");
    this.el.lobby.classList.add("hidden");
    this.el.result.classList.add("hidden");
    this.el.pauseOverlay.classList.add("hidden");
    this.refreshBuildBar();
    this.toast("\uD06C\uB9AC\uC2A4\uD0C8\uC744 \uC9C0\uCF1C\uB77C! F\uB85C \uCC44\uC9D1, 1~7\uB85C \uAC74\uC124", "good");
    if (localStorage.getItem("cd.tutorialDone")) {
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
    $2("result-title").textContent = win ? "\uC2B9\uB9AC! \u{1F389}" : "\uD06C\uB9AC\uC2A4\uD0C8 \uD30C\uAD34\u2026 \u{1F4A5}";
    $2("result-sub").textContent = win ? `${CFG.wave.goal}\uC6E8\uC774\uBE0C\uB97C \uBAA8\uB450 \uB9C9\uC544\uB0C8\uB2E4.` : `${wave}\uC6E8\uC774\uBE0C\uAE4C\uC9C0 \uBC84\uD17C\uB2E4.`;
    $2("result-stats").innerHTML = `
  <li>\uC0DD\uC874 \uC2DC\uAC04 <b>${fmtTime(stats.time)}</b></li>
  <li>\uCC98\uCE58\uD55C \uBAAC\uC2A4\uD130 <b>${stats.kills}</b></li>
  <li>\uCC44\uC9D1\uD55C \uC790\uC6D0 <b>${stats.harvested}</b></li>
  <li>\uC18C\uBAA8\uD55C \uC790\uC6D0 <b>\u{1FAB5}${stats.spentWood} \u{1FAA8}${stats.spentStone}</b>${this._spendBreakdown(stats)}</li>
  <li>\uAC74\uC124\uD55C \uAD6C\uC870\uBB3C <b>${stats.built}</b></li>`;
    const log = $2("result-wavelog");
    if (stats.waveLog && stats.waveLog.length) {
      log.innerHTML = stats.waveLog.map(
        (w2) => `<li><span>\uC6E8\uC774\uBE0C ${w2.wave}</span><span>${fmtTime(w2.time)} \xB7 \uCC98\uCE58 <b>${w2.kills}</b></span></li>`
      ).join("");
      log.classList.remove("hidden");
    } else {
      log.classList.add("hidden");
    }
    const rec = this._recordStats(win, stats, win ? CFG.wave.goal : wave);
    $2("result-record").innerHTML = `
  <li class="${rec.isNewBest ? "new-best" : ""}">\u{1F3C6} \uC5ED\uB300 \uCD5C\uACE0 \uC6E8\uC774\uBE0C <b>${rec.bestWave}</b>${rec.isNewBest ? " \u2014 \uC2E0\uAE30\uB85D!" : ""}</li>
  <li>\u2694\uFE0F \uB204\uC801 \uCC98\uCE58 <b>${rec.totalKills}</b></li>
  <li>\u{1F3AE} \uD50C\uB808\uC774 \uD69F\uC218 <b>${rec.plays}</b> (\uC2B9\uB9AC ${rec.wins}\uD68C)</li>`;
  }
  // 자원을 어디에 썼는지 항목별로 쪼개 보여준다 (쓴 곳만)
  _spendBreakdown(stats) {
    const LABELS2 = { build: "\uAC74\uC124", upgrade: "\uC5C5\uADF8\uB808\uC774\uB4DC", repair: "\uC218\uB9AC", harvest: "\uCC44\uC9D1\uC18D\uB3C4", craft: "\uC81C\uC791" };
    const by = stats.spentBy || {};
    const rows = Object.entries(LABELS2).map(([key, label]) => [label, by[key] || { wood: 0, stone: 0 }]).filter(([, c2]) => c2.wood || c2.stone).map(([label, c2]) => {
      const parts = [];
      if (c2.wood) parts.push(`\u{1FAB5}${c2.wood}`);
      if (c2.stone) parts.push(`\u{1FAA8}${c2.stone}`);
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
    this.el.poolMode.textContent = g2.shared ? "\uD300 \uACF5\uC720 \uC790\uC6D0" : "\uAC1C\uC778 \uC790\uC6D0";
    const nextUp = CFG.harvest.upgrade[g2.local.harvestLv];
    this.el.hupLv.textContent = `Lv.${g2.local.harvestLv}`;
    this.el.hupCost.textContent = nextUp ? costText(nextUp.cost) : "\uCD5C\uB300";
    this.el.hupBtn.disabled = !nextUp || !canAfford(pool, nextUp.cost);
    const pkCost = CFG.craft.pickaxe.cost;
    this.el.pickaxeStatus.textContent = g2.local.hasPickaxe ? "\uBCF4\uC720" : "\uD544\uC694";
    this.el.pickaxeCost.textContent = g2.local.hasPickaxe ? "" : costText(pkCost);
    this.el.pickaxeBtn.disabled = g2.local.hasPickaxe || !canAfford(pool, pkCost);
    const c2 = g2.world.crystal;
    const ratio = clamp(c2.hp / c2.maxHp, 0, 1);
    this.el.crystalFill.style.transform = `scaleX(${ratio})`;
    this.el.crystalText.textContent = `${Math.ceil(c2.hp)} / ${c2.maxHp}`;
    const w2 = g2.wave;
    this.el.waveLabel.textContent = `\uC6E8\uC774\uBE0C ${Math.min(CFG.wave.goal, w2.wave + 1)} / ${CFG.wave.goal}`;
    if (w2.phase === PHASE.PREP) {
      this.el.waveState.textContent = `\uC900\uBE44 \uC2DC\uAC04 ${fmtTime(w2.prepLeft)}`;
      this.el.waveBtn.classList.remove("hidden");
      this._showWavePreview(Math.min(CFG.wave.goal, w2.wave + 1));
    } else if (w2.phase === PHASE.COMBAT) {
      this.el.waveState.textContent = `\uB0A8\uC740 \uBAAC\uC2A4\uD130 ${w2.remaining}`;
      this.el.waveBtn.classList.add("hidden");
      this.el.wavePreview.classList.add("hidden");
    } else {
      this.el.waveState.textContent = w2.phase === PHASE.WON ? "\uBC29\uC5B4 \uC131\uACF5" : "\uD328\uBC30";
      this.el.waveBtn.classList.add("hidden");
      this.el.wavePreview.classList.add("hidden");
    }
    const p2 = g2.local;
    const hpR = clamp(p2.hp / p2.maxHp, 0, 1);
    this.el.hpFill.style.transform = `scaleX(${hpR})`;
    this.el.hpText.textContent = p2.alive ? `${Math.ceil(p2.hp)} / ${p2.maxHp}` : `\uBD80\uD65C\uAE4C\uC9C0 ${Math.ceil(p2.downTimer)}\uCD08`;
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
        this.el.prompt.innerHTML = `\u{1F4A0} \uC815\uC218\uC11D \u2014 \uACE1\uAD2D\uC774\uAC00 \uC788\uC5B4\uC57C \uCE98 \uC218 \uC788\uC2B5\uB2C8\uB2E4 (\uC81C\uC791\uB300\uC5D0\uC11C \uC81C\uC791)`;
      } else {
        const label = near.type === "tree" ? "\u{1F333} \uB098\uBB34" : near.type === "gem" ? "\u{1F4A0} \uC815\uC218\uC11D" : "\u{1FAA8} \uBC14\uC704";
        this.el.prompt.innerHTML = `${label} \u2014 <kbd>F</kbd> \uAFB9 \uB20C\uB7EC \uCC44\uC9D1 (\uB0A8\uC740 ${near.charges})`;
      }
    } else {
      this.el.prompt.classList.add("hidden");
    }
    this.el.netStatus.textContent = g2.net.online ? g2.isHost ? "\uD638\uC2A4\uD2B8" : "\uCC38\uAC00\uC790" : "\uC2F1\uAE00";
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
      const text = (isNotable ? CFG.enemies[e.type].icon : "") + (slowed ? "\u2744\uFE0F" : "") + (poisoned ? "\u2620\uFE0F" : "");
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
        who.textContent = p2.name + (p2.isLocal ? " (\uB098)" : "");
        li2.append(dot, who);
        if (!p2.isLocal && !g2.shared) {
          const give = document.createElement("button");
          give.className = "give";
          give.textContent = "\u{1FAB5}10";
          give.onclick = () => g2.requestGive(p2.id, 10, 0);
          const give2 = document.createElement("button");
          give2.className = "give";
          give2.textContent = "\u{1FAA8}10";
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
