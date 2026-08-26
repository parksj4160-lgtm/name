var DEFAULTS = {
  inventory: "i",
  harvest: "f",
  attack: " ",
  dash: "v",
  upgrade: "u",
  repair: "g",
  sell: "x",
  cancel: "escape",
  shard: "r",
  skillBlast: "t",
  skillChill: "y",
  skillBarrier: "b",
  skillRift: "c",
  startWave: "enter",
  pause: "p",
  help: "h",
  mute: "m"
};
var LABELS = {
  inventory: "인벤토리",
  harvest: "채집",
  attack: "공격",
  dash: "회피 돌진",
  upgrade: "업그레이드 모드",
  repair: "수리 모드",
  sell: "철거 모드",
  cancel: "취소",
  shard: "정수 스킬: 회복",
  skillBlast: "정수 스킬: 폭발",
  skillChill: "정수 스킬: 시간 왜곡",
  skillBarrier: "정수 스킬: 긴급 방벽",
  skillRift: "정수 스킬: 중력 균열",
  startWave: "웨이브 시작",
  pause: "일시정지",
  help: "도움말",
  mute: "음소거"
};
var STORE_KEY2 = "cd.keymap";
export var KeyMap = class {
  constructor(buildDefs = {}) {
    this.defaults = { ...DEFAULTS };
    this.labels = { ...LABELS };
    for (const [key, def] of Object.entries(buildDefs)) {
      this.defaults["build:" + key] = def.hotkey;
      this.labels["build:" + key] = def.name;
    }
    this.map = { ...this.defaults };
    this._load();
  }
  _load() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(STORE_KEY2) || "{}");
    } catch {
      saved = {};
    }
    for (const action of Object.keys(this.defaults)) {
      if (typeof saved[action] === "string") this.map[action] = saved[action];
    }
  }
  _save() {
    try {
      localStorage.setItem(STORE_KEY2, JSON.stringify(this.map));
    } catch {
    }
  }
  actions() {
    return Object.keys(this.defaults);
  }
  get(action) {
    return this.map[action] ?? this.defaults[action];
  }
  label(action) {
    return this.labels[action] || action;
  }
  // 이미 다른 액션이 쓰고 있는 키라면 그 액션 이름을 돌려준다
  keyInUse(key, exceptAction) {
    return this.actions().find((a) => a !== exceptAction && this.get(a) === key) || null;
  }
  set(action, key) {
    if (!(action in this.defaults)) return false;
    this.map[action] = key;
    this._save();
    return true;
  }
  reset(action) {
    if (action) this.map[action] = this.defaults[action];
    else this.map = { ...this.defaults };
    this._save();
  }
};
export function keyLabel(k2) {
  if (!k2) return "?";
  if (k2 === " ") return "Space";
  if (k2 === "escape") return "Esc";
  if (k2 === "enter") return "Enter";
  if (k2 === "arrowup") return "↑";
  if (k2 === "arrowdown") return "↓";
  if (k2 === "arrowleft") return "←";
  if (k2 === "arrowright") return "→";
  return k2.length === 1 ? k2.toUpperCase() : k2[0].toUpperCase() + k2.slice(1);
}
