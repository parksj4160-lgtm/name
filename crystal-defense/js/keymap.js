var DEFAULTS = {
  harvest: "f",
  attack: " ",
  upgrade: "u",
  repair: "g",
  sell: "x",
  cancel: "escape",
  shard: "r",
  startWave: "enter",
  pause: "p",
  help: "h",
  mute: "m"
};
var LABELS = {
  harvest: "\uCC44\uC9D1",
  attack: "\uACF5\uACA9",
  upgrade: "\uC5C5\uADF8\uB808\uC774\uB4DC \uBAA8\uB4DC",
  repair: "\uC218\uB9AC \uBAA8\uB4DC",
  sell: "\uCCA0\uAC70 \uBAA8\uB4DC",
  cancel: "\uCDE8\uC18C",
  shard: "\uC218\uC815 \uC815\uC218 \uC0AC\uC6A9",
  startWave: "\uC6E8\uC774\uBE0C \uC2DC\uC791",
  pause: "\uC77C\uC2DC\uC815\uC9C0",
  help: "\uB3C4\uC6C0\uB9D0",
  mute: "\uC74C\uC18C\uAC70"
};
var STORE_KEY = "cd.keymap";
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
      saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    } catch {
      saved = {};
    }
    for (const action of Object.keys(this.defaults)) {
      if (typeof saved[action] === "string") this.map[action] = saved[action];
    }
  }
  _save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.map));
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
  if (k2 === "arrowup") return "\u2191";
  if (k2 === "arrowdown") return "\u2193";
  if (k2 === "arrowleft") return "\u2190";
  if (k2 === "arrowright") return "\u2192";
  return k2.length === 1 ? k2.toUpperCase() : k2[0].toUpperCase() + k2.slice(1);
}
