var STORE_KEY3 = "cd.meta";
var GEAR_ORDER = ["pickaxe", "sword", "bow"];
export var META_UPGRADES = {
  harvest: {
    name: "베테랑 채집꾼",
    icon: "⛏️",
    desc: "레벨마다 채집 속도 업그레이드를 한 단계 앞서서 시작한다",
    max: 3,
    cost: [6, 14, 24]
  },
  gear: {
    name: "여벌 장비",
    icon: "🧰",
    desc: "레벨마다 판 시작부터 도구를 하나씩 더 들고 시작한다 — Lv.1 곡괭이 · Lv.2 +칼 · Lv.3 +활 (제작대 없이 즉시 사용 가능)",
    max: 3,
    cost: [6, 14, 24]
  },
  vigor: {
    name: "다부진 몸",
    icon: "💪",
    desc: "레벨마다 최대 체력 +20으로 시작한다",
    max: 3,
    cost: [6, 14, 24]
  },
  lastStand: {
    name: "최후의 저항",
    icon: "🔥",
    desc: "이번 판 내 체력이 처음으로 0이 되는 순간, 대신 최대 체력의 15%로 버티고 3초간 무적이 된다 (판마다 한 번, 쓰러지지 않는다)",
    max: 1,
    cost: [40]
  }
};
export function loadMeta() {
  let d2;
  try {
    d2 = JSON.parse(localStorage.getItem(STORE_KEY3) || "{}");
  } catch {
    d2 = {};
  }
  return { currency: Number.isFinite(d2.currency) ? d2.currency : 0, levels: d2.levels && typeof d2.levels === "object" ? d2.levels : {} };
}
function saveMeta(m) {
  try {
    localStorage.setItem(STORE_KEY3, JSON.stringify(m));
  } catch {
  }
}
export function earnMetaCurrency(amount) {
  if (!amount || amount <= 0) return loadMeta().currency;
  const m = loadMeta();
  m.currency += amount;
  saveMeta(m);
  return m.currency;
}
export function buyMetaUpgrade(key) {
  const def = META_UPGRADES[key];
  if (!def) return { ok: false, reason: "알 수 없는 항목입니다" };
  const m = loadMeta();
  const lv = m.levels[key] || 0;
  if (lv >= def.max) return { ok: false, reason: "이미 최대 레벨입니다" };
  const cost = def.cost[lv];
  if (m.currency < cost) return { ok: false, reason: "결정 조각이 부족합니다" };
  m.currency -= cost;
  m.levels[key] = lv + 1;
  saveMeta(m);
  return { ok: true, level: lv + 1, currency: m.currency, name: def.name, icon: def.icon };
}
export function computeMetaPerks() {
  const lv = loadMeta().levels;
  const hLv = lv.harvest || 0;
  const gLv = lv.gear || 0;
  const vLv = lv.vigor || 0;
  return {
    harvestLv: 1 + hLv,
    tools: GEAR_ORDER.slice(0, gLv),
    hpBonus: vLv * 20,
    lastStand: (lv.lastStand || 0) >= 1
  };
}
