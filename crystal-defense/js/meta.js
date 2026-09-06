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
  },
  // 정수는 이번 세션에 채집으로는 한 톨도 못 버는 웨이브 클리어 전용 보상으로 바뀌었다 —
  // 판 안에서는 지켜야 할 희소성이지만, 여러 판에 걸쳐 쌓는 원정 준비 투자로 그 시작점을
  // 조금 앞당기는 것은 다른 세 head-start 항목(채집 속도·장비·체력)과 같은 층위다.
  // 값을 작게(최대 3) 잡아 "정수가 부족하면 캐러 간다"가 다시 성립하지 않게 했다.
  shardStart: {
    name: "정수 감각",
    icon: "🔮",
    desc: "레벨마다 판 시작 시 정수 +1로 시작한다 (최대 3)",
    max: 3,
    cost: [8, 18, 30]
  },
  // 기존 5개 원정 준비 항목 중 head-start 4개(채집 속도·장비·체력·정수 감각)는 전부
  // "판 시작 순간 플레이어 자신"을 건드렸을 뿐, 정작 웨이브 1이 뜨기 전 가장 먼저 필요한
  // 목재·광물(벽·첫 타워 재료) 자체는 여전히 맨손으로 캐러 나가야 했다 — 초반 방어선을
  // 세우기까지의 첫 왕복이 원정 준비를 아무리 채워도 똑같이 걸렸다. 물자 비축은 그 왕복을
  // 줄여준다. startShard 와 똑같이 `Math.max(기존값, 목표값)`로 적용해 이미 있는 자원을
  // 깎지 않는다(호스트가 시작 직후 판을 잠깐 멈췄다 재개해도 중복 지급되지 않는다).
  stockpile: {
    name: "물자 비축",
    icon: "📥",
    desc: "레벨마다 판 시작 시 목재·광물을 각각 +15로 시작한다 (최대 3)",
    max: 3,
    cost: [6, 14, 24]
  },
  // 물자 비축(wood·stone)이 벽·첫 타워까지 가는 첫 왕복을 줄여준다면, 이건 그 다음 병목이다 —
  // 철은 채집으로 못 얻고 반드시 화로에서 광물+석탄을 태워야 나오는데(물자 비축은 광물만
  // 채워주고 석탄·화로 대기시간은 그대로 남는다), 강철 단계 업그레이드(철6+구리10)는 그 병목을
  // 두 번 넘어야 닿는다. startShard와 똑같이 `Math.max`로 적용해 중복 지급되지 않는다.
  ironStart: {
    name: "장인의 밑천",
    icon: "🔩",
    desc: "레벨마다 판 시작 시 철을 +2로 시작한다 (최대 3, 최대 6개 — 강철 단계 업그레이드 한 번 분량)",
    max: 3,
    cost: [10, 20, 32]
  },
  // 이번 세션에 새로 생긴 방어구 슬롯(누비옷→사슬갑옷→판금갑옷)은 판 안에서 제작대를 짓고
  // 재료를 모아야 하는 세 번째 단계짜리 투자다 — 여벌 장비(무기)·물자 비축(재료)처럼 판 시작을
  // 앞당기는 head-start 축에 자연스럽게 어울리는 네 번째 슬롯이다. 최고 레벨(3)을 찍으면
  // 판금갑옷까지 제작대 없이 바로 입고 시작해, 재료 대신 자유 이동을 골라 초반부터 근접
  // 전투에 더 과감하게 뛰어들 수 있게 해준다.
  outfitStart: {
    name: "베테랑 방어구",
    icon: "🥋",
    desc: "레벨마다 판 시작 시 방어구를 한 단계 앞서서 착용한다 (제작대 없이 즉시 적용, 최대 3=판금갑옷)",
    max: 3,
    cost: [8, 18, 30]
  },
  // 기존 8개 원정 준비 항목 중 채집 속도(harvest)·정수 감각(shardStart)·물자 비축(stockpile)·
  // 장인의 밑천(ironStart)·베테랑 방어구(outfitStart)는 전부 "판 시작 시 자원·장비를 한 단계
  // 앞당긴다"는 head-start 축이었는데, 정작 무기 자체의 화력(강화 레벨, 최대 3단계)만은 그
  // 축에서 빠져 있었다 — 여벌 장비(gear)가 무기를 손에 쥐어 주긴 해도 강화는 0부터 시작이라
  // 매판 다시 철을 모아 올려야 했다. 숙련된 손놀림은 그 마지막 빈틈을 채운다 — 판 시작부터
  // 들고 있는 무기든, 나중에 제작대에서 새로 만드는 무기든 상관없이, **처음 손에 넣는 순간**
  // 강화 레벨을 이만큼 앞서서 시작한다(무기별로 각각 적용되고, 무기 강화 상한 자체는 그대로
  // 3이라 이 퍽만으로 상한을 넘지는 않는다).
  weaponProficiency: {
    name: "숙련된 손놀림",
    icon: "🗡️",
    desc: "레벨마다 무기를 처음 갖추는 순간 강화 단계를 한 단계 앞서서 시작한다 (판 시작부터 든 무기·제작대에서 새로 만든 무기 모두 적용, 무기별 최대 3단계는 그대로)",
    max: 3,
    cost: [10, 22, 36]
  }
};
export function loadMeta() {
  let d2;
  try {
    d2 = JSON.parse(localStorage.getItem(STORE_KEY3) || "{}");
  } catch {
    d2 = {};
  }
  const rawLevels = d2.levels && typeof d2.levels === "object" ? d2.levels : {};
  const levels = {};
  for (const key of Object.keys(rawLevels)) {
    const n = Number(rawLevels[key]);
    if (Number.isFinite(n)) levels[key] = n;
  }
  return { currency: Number.isFinite(d2.currency) ? d2.currency : 0, levels };
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
  const sLv = lv.stockpile || 0;
  const iLv = lv.ironStart || 0;
  const oLv = lv.outfitStart || 0;
  const wLv = lv.weaponProficiency || 0;
  return {
    harvestLv: 1 + hLv,
    tools: GEAR_ORDER.slice(0, gLv),
    hpBonus: vLv * 20,
    lastStand: (lv.lastStand || 0) >= 1,
    startShard: lv.shardStart || 0,
    startWood: sLv * 15,
    startStone: sLv * 15,
    startIron: iLv * 2,
    weaponProficiencyLv: wLv,
    outfitLv: oLv
  };
}
