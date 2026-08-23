import { mulberry32 } from './utils.js';

export var CFG = {
  world: {
    size: 100,
    // 정사각 맵 한 변 (월드 단위)
    cell: 2,
    // 건설 그리드 한 칸
    buildRadius: 22,
    // 크리스탈 중심에서 건설 가능한 반경
    coreRadius: 3.2
    // 크리스탈 바로 옆(건설 금지)
  },
  // 지형 변주 — 시드마다 하나씩 뽑힌다. 포탈 수(=적이 들어오는 방향 수)와 자원 밀도만 바꿔서
  // 지형 지오메트리나 경로 탐색은 그대로 두면서도 체감이 크게 달라지게 한다.
  biomes: {
    canyon: { name: "협곡", icon: "🏔️", portalCount: 2, nodeMult: 0.65, desc: "적이 들어오는 길이 좁다 — 길막기가 잘 먹히지만 자원은 부족하다" },
    plains: { name: "개활지", icon: "🌾", portalCount: 6, nodeMult: 1.45, desc: "자원이 넉넉하다 — 대신 적이 사방에서 몰려온다" },
    normal: { name: "평지", icon: "🗺️", portalCount: 4, nodeMult: 1, desc: "표준 지형" }
  },
  crystal: {
    hp: 1e3,
    radius: 2.2,
    hitRange: 3.6
    // 몬스터가 크리스탈을 때리기 시작하는 거리
  },
  player: {
    speed: 7.4,
    sprint: 10.6,
    radius: 0.55,
    hp: 100,
    regen: 4,
    // 초당 회복 (전투 중 2초간 정지)
    downTime: 5,
    // 쓰러진 뒤 크리스탈에서 부활하기까지
    // 쓰러졌을 때 살아있는 아군이 이 반경 안에 있으면 부활 타이머가 assistMult배 빨리 줄어든다.
    // 혼자 플레이할 땐 아군이 있을 수 없으니 영향이 전혀 없다 — 순수 협동 전용 보너스
    revive: { radius: 2.2, assistMult: 3 },
    attack: { dmg: 16, range: 2.8, arc: 1.5, cd: 0.42 },
    // 회피 돌진 — 짧게 무적 상태로 튀어나간다. 보스 돌진이나 다구리를 피할 때, 결계 몹에게 순식간에
    // 붙을 때 쓴다. 쿨다운 중엔 다시 못 쓴다
    dash: { speed: 20, duration: 0.16, cooldown: 3 }
  },
  harvest: {
    range: 3.2,
    tree: { time: 1.5, yield: 6, charges: 4, respawn: 22 },
    rock: { time: 2.1, yield: 5, charges: 3, respawn: 28 },
    // 정수석: 아주 드물게 있는 채집물. 캐면 수정 정수(크리스탈 회복용)를 바로 얻는다.
    // 곡괭이가 필요하고, 캐는 데 오래 걸리며, 한 번 캐면 오래 리스폰되지 않는다.
    gem: { time: 3, yield: 1, charges: 1, respawn: 90 },
    // 채집 속도 업그레이드 (레벨당 시간 배율)
    upgrade: [
      { mult: 1, cost: null },
      { mult: 0.78, cost: { wood: 60, stone: 40 } },
      { mult: 0.6, cost: { wood: 140, stone: 110 } },
      { mult: 0.45, cost: { wood: 260, stone: 220 } }
    ]
  },
  // 건설물 정의. key 는 네트워크 메시지에도 그대로 쓰인다.
  builds: {
    wall: {
      name: "벽",
      icon: "🧱",
      hotkey: "1",
      cost: { wood: 12, stone: 4 },
      hp: 260,
      blocks: true,
      desc: "몬스터의 길을 막는다. 길이 완전히 막히면 몬스터가 벽을 부순다.",
      levels: [
        { hp: 260 },
        { hp: 520, cost: { wood: 20, stone: 20 } },
        { hp: 980, cost: { wood: 40, stone: 55, iron: 4 } }
      ]
    },
    arrow: {
      name: "화살탑",
      icon: "🏹",
      hotkey: "2",
      cost: { wood: 35, stone: 15 },
      hp: 180,
      blocks: true,
      desc: "가장 앞선 적을 빠르게 저격한다. 서리탑 근처에 두면 둔화된 적에게 추가 피해.",
      levels: [
        { hp: 180, dmg: 11, range: 13, rate: 1.15 },
        { hp: 280, dmg: 18, range: 14.5, rate: 1.35, cost: { wood: 40, stone: 30 } },
        { hp: 420, dmg: 29, range: 16, rate: 1.6, cost: { wood: 80, stone: 70, iron: 6 } }
      ]
    },
    frost: {
      name: "서리탑",
      icon: "❄️",
      hotkey: "3",
      cost: { wood: 25, stone: 45 },
      hp: 200,
      blocks: true,
      desc: "적중한 적을 느리게 만든다. 빠른 몬스터 대응용. 화살탑과 붙여 지으면 궁합이 좋다.",
      levels: [
        { hp: 200, dmg: 5, range: 10, rate: 0.9, slow: 0.45, slowTime: 1.6 },
        { hp: 320, dmg: 9, range: 11.5, rate: 1, slow: 0.55, slowTime: 2, cost: { wood: 30, stone: 55 } },
        { hp: 480, dmg: 14, range: 13, rate: 1.1, slow: 0.65, slowTime: 2.4, cost: { wood: 60, stone: 110, iron: 5 } }
      ]
    },
    cannon: {
      name: "대포탑",
      icon: "💣",
      hotkey: "4",
      cost: { wood: 55, stone: 70 },
      hp: 240,
      blocks: true,
      desc: "느리지만 범위 피해를 준다. 뭉친 적에게 강하다.",
      levels: [
        { hp: 240, dmg: 26, range: 15, rate: 0.55, splash: 3.2 },
        { hp: 380, dmg: 42, range: 16.5, rate: 0.62, splash: 3.6, cost: { wood: 60, stone: 80 } },
        { hp: 560, dmg: 66, range: 18, rate: 0.7, splash: 4.2, cost: { wood: 120, stone: 160, iron: 8 } }
      ]
    },
    poison: {
      name: "독탑",
      icon: "☠️",
      hotkey: "5",
      cost: { wood: 30, stone: 50 },
      hp: 190,
      blocks: true,
      desc: "적중한 적에게 지속 피해를 남긴다. 독탑끼리 가까이 모으면 서로 독 피해가 강해진다.",
      levels: [
        { hp: 190, dmg: 4, range: 11, rate: 0.8, poisonDps: 6, poisonTime: 3 },
        { hp: 300, dmg: 6, range: 12.5, rate: 0.9, poisonDps: 10, poisonTime: 3.5, cost: { wood: 40, stone: 70 } },
        { hp: 460, dmg: 9, range: 14, rate: 1, poisonDps: 16, poisonTime: 4, cost: { wood: 80, stone: 140, iron: 6 } }
      ]
    },
    support: {
      name: "보루",
      icon: "🔱",
      hotkey: "6",
      cost: { wood: 40, stone: 60 },
      hp: 150,
      blocks: true,
      desc: "스스로 공격하지 않지만, 주변 타워의 공격력을 높인다. 타워 밀집 지역에 세우면 좋다.",
      levels: [
        { hp: 150, buffRadius: 6, buffMult: 0.2 },
        { hp: 220, buffRadius: 7, buffMult: 0.3, cost: { wood: 50, stone: 90 } },
        { hp: 300, buffRadius: 8, buffMult: 0.42, cost: { wood: 90, stone: 160, iron: 5 } }
      ]
    },
    workbench: {
      name: "제작대",
      icon: "🪚",
      hotkey: "7",
      cost: { wood: 20 },
      hp: 80,
      blocks: true,
      station: "craft",
      desc: "다가가서 클릭하면 도구와 무기를 만든다. 팀에 하나만 있으면 된다.",
      levels: [
        { hp: 80 }
      ]
    },
    furnace: {
      name: "화로",
      icon: "🔥",
      hotkey: "8",
      cost: { wood: 15, stone: 30 },
      hp: 120,
      blocks: true,
      station: "smelt",
      desc: "다가가서 클릭하면 광물을 녹여 철을 얻는다. 무기 재료가 된다.",
      levels: [
        { hp: 120 }
      ]
    },
    // 벽·타워와 달리 길을 막지 않는다 — 적이 그 위를 그대로 지나가다가 걸려 한 번 터지고 사라진다.
    // 그래서 벽 뒤가 아니라 적이 실제로 걸어갈 통로 한복판에 숨겨 놓는 게 핵심이다.
    trap: {
      name: "함정",
      icon: "🪤",
      hotkey: "9",
      cost: { wood: 10, stone: 8 },
      hp: 30,
      blocks: false,
      desc: "길을 막지 않는다 — 적이 밟으면 큰 피해 + 둔화를 주고 사라지는 1회용 함정.",
      levels: [
        { hp: 30, dmg: 65, slow: 0.5, slowTime: 2, triggerRadius: 1.5, singleUse: true }
      ]
    }
  },
  // 시설에 다가가 클릭하면 열리는 작업창. range 는 상호작용 가능 거리.
  station: { range: 3.6 },
  // 화로 제련: 광물 -> 철
  smelt: { cost: { stone: 6 }, yield: 1 },
  // 제작대에서 만드는 것들. 각자 하나씩만 가질 수 있다.
  craft: {
    pickaxe: {
      name: "곡괭이",
      icon: "⛏️",
      cost: { wood: 15 },
      desc: "정수석을 캘 수 있게 된다."
    },
    sword: {
      name: "칼",
      icon: "🗡️",
      cost: { wood: 10, iron: 4 },
      effect: { dmg: 12 },
      desc: "근접 공격력 +12."
    },
    bow: {
      name: "활",
      icon: "🏹",
      cost: { wood: 20, iron: 3 },
      effect: { range: 2.4, arc: 0.5 },
      desc: "공격 사거리 +2.4 \xB7 범위도 넓어진다."
    },
    spear: {
      name: "창",
      icon: "🔱",
      cost: { wood: 18, iron: 6 },
      effect: { range: 3.5, arc: -1.05 },
      desc: "사거리 +3.5, 대신 좁고 긴 일직선으로만 — 줄지어 오는 적을 꿰뚫기 좋다."
    },
    hammer: {
      name: "망치",
      icon: "🔨",
      cost: { wood: 22, iron: 8 },
      effect: { dmg: 30, arc: 2, cd: 0.55 },
      desc: "공격력 +30, 사방을 강타하지만 느리다(공격 간격 +0.55초) — 여럿이 몰려올 때 강하다."
    },
    // 유일한 원거리 무기 — 다른 무기(칼·활·창·망치)는 전부 근접 판정을 강화할 뿐이지만
    // 이건 실제 투사체를 던진다. 정수(shard)가 아니라 목재·광물을 태우는 소모형이라
    // 자원 관리 선택이 생기고, 결계(ward) 변종처럼 타워가 못 맞추는 원거리 위협에도 대응할 수 있다
    bomb: {
      name: "폭탄가방",
      icon: "💣",
      cost: { wood: 15, stone: 10 },
      desc: "들면 공격이 근접 대신 조준한 곳에 폭탄을 던지는 것으로 바뀐다. 던질 때마다 목재\xB7광물을 태운다.",
      throw: { cost: { wood: 4, stone: 3 }, dmg: 70, radius: 3.2, cd: 1.1, speed: 13, range: 9 }
    }
  },
  // 몬스터 종류 (일반형 / 빠른형 / 탱커형 / 원거리형 / 건물추적형 / 보스)
  enemies: {
    grunt: { name: "그런트", icon: "👹", hp: 60, speed: 3, dmg: 12, rate: 1, radius: 0.6, color: 12735546, bounty: { wood: 2, stone: 1 }, scale: 1 },
    runner: { name: "러너", icon: "🏃", hp: 34, speed: 5.6, dmg: 7, rate: 1.6, radius: 0.48, color: 14205258, bounty: { wood: 2, stone: 1 }, scale: 0.85 },
    brute: { name: "브루트", icon: "🦏", hp: 210, speed: 1.9, dmg: 34, rate: 0.6, radius: 0.9, color: 8018896, bounty: { wood: 5, stone: 4 }, scale: 1.5 },
    // 벽에 막히지 않고 사거리 안에서 크리스탈을 저격한다 — 벽만 세우는 전략을 견제한다
    shooter: { name: "주술사", icon: "🧙", hp: 45, speed: 2.4, dmg: 9, rate: 0.5, radius: 0.5, color: 3526479, bounty: { wood: 3, stone: 2 }, scale: 0.95, ranged: true, atkRange: 11 },
    // 경로상의 벽을 무시하고 가장 가까운 타워로 직행해 부순다 — 타워를 뒤에 숨기는 전략을 견제한다
    raider: { name: "약탈자", icon: "🪓", hp: 80, speed: 2.6, dmg: 10, rate: 0.8, radius: 0.55, color: 11887901, bounty: { wood: 3, stone: 2 }, scale: 1.05, seeksBuildings: true, buildingDmgMult: 1.8 },
    boss: { name: "파괴자", icon: "💀", hp: 900, speed: 2.1, dmg: 70, rate: 0.7, radius: 1.4, color: 3092282, bounty: { wood: 30, stone: 30 }, scale: 2.3, boss: true },
    // 5의 배수 웨이브마다 파괴자와 번갈아 등장한다. 소환하는 잡졸이 전부 🛡️ 방패 변종이라(정면 피해 감소)
    // 뒤로 돌아가서 처리해야 하는 다른 압박을 준다 — 돌진/소환 패턴 자체는 파괴자와 동일하다.
    frostlord: { name: "서리 군주", icon: "🧊", hp: 1050, speed: 1.7, dmg: 55, rate: 0.65, radius: 1.5, color: 10479871, bounty: { wood: 32, stone: 38 }, scale: 2.4, boss: true, summonVariant: "shield" }
  },
  // 몬스터 변종 접두사 — 종류를 늘리는 대신 기존 몬스터에 가끔 붙는다. 웨이브가 오를수록 등장 확률이 오른다.
  // 색 틴트 + 머리 위 아이콘으로 항상 표시되어(색약 여부와 무관하게) 눈에 띈다.
  variants: {
    // 정면에서 맞으면 피해가 크게 줄어든다 — 등 뒤(비-정면 216˚)로 돌아가야 제대로 들어간다
    shield: { name: "방패", icon: "🛡️", tint: 5286310, mitigation: 0.6, frontArc: 2.5133 },
    // 죽으면 그 자리에서 약한 개체 2마리로 갈라진다 (분열체는 다시 갈라지지 않는다)
    split: { name: "분열", icon: "➗", tint: 16755277, childCount: 2, childHpMult: 0.4, childScaleMult: 0.62 },
    // 주기적으로 짧게 폭발적으로 가속한다
    dash: { name: "질주", icon: "💨", tint: 16773990, interval: 3.5, duration: 1.1, speedMult: 2.4 },
    // quietTime 동안 피해를 안 받으면 초당 maxHp 의 hpPerSec 만큼 회복한다 — 놔두면 도로 차오르니 집중 공격을 강요한다
    regen: { name: "재생", icon: "💚", tint: 3390720, hpPerSec: 0.07, quietTime: 3 },
    // 타워가 조준하지 못한다(자동 사격 대상에서 제외) — 함정·근접 공격·정수 스킬은 그대로 통한다.
    // 타워만 믿고 있으면 절대 안 죽으니 직접 달려가 처리해야 한다
    ward: { name: "결계", icon: "🌀", tint: 11800063 }
  },
  // 웨이브당 몬스터 1마리가 변종을 달 확률 (보스 제외, 분열체 제외)
  variantChance: { base: 0.05, perWave: 0.012, max: 0.32 },
  // 정예 몹 — 웨이브마다 최대 1마리, 골드빛으로 확 튀며 체력·공격력·보상이 크게 오른다.
  // 변종과는 배타적(같은 개체에 둘 다 붙지 않는다)이라 등장하면 그 웨이브의 확실한 "이번엔 저놈만 노려라" 타깃이 된다.
  elite: { chance: 0.16, minWave: 3, hpMult: 2.4, dmgMult: 1.6, scaleMult: 1.3, bountyMult: 3, tint: 16763904 },
  // 타워 시너지 — 특정 조합으로 인접 배치하면 서로 보너스를 준다. 배치 고민을 만드는 게 목적.
  synergy: {
    // 화살탑이 이 반경 안에 서리탑을 두면, 이미 둔화된 적을 맞출 때 추가 피해
    frostArrow: { radius: 7, dmgMult: 0.4 },
    // 독탑이 이 반경 안에 다른 독탑을 두면, 독 피해가 이웃 하나당 누적 증가(상한 있음)
    poisonStack: { radius: 7, dpsMultPerNeighbor: 0.35, max: 1 }
  },
  // 보급품 투하 — 전투 중(웨이브 2부터) 가끔 지도 위에 상자가 떨어진다. 한 번에 최대 1개만 떠 있고,
  // 안 챙기고 놔두면 사라진다. 방어를 잠깐 비우고 달려가서 주울지 말지가 매 순간의 선택이 된다.
  supplyDrop: { minWave: 2, firstDelay: 16, minGap: 30, maxGap: 50, lifetime: 20, pickupRadius: 1.8, reward: { wood: 14, stone: 9 }, shardChance: 0.4 },
  // 엔드리스 축복 — 10웨이브 승리 이후(엔드리스)에만 등장한다. 표준 캠페인 밸런스에는 영향이 없다.
  // n웨이브마다 무작위 2개 중 하나를 골라 영구 적용(응급 처치만 즉시 1회성). 전부 호스트가 계산하는
  // 값(근접 공격력·타워 공격력·스킬 비용·크리스탈 체력)에만 걸려 있어서 별도 동기화 없이 참가자에게도 그대로 반영된다.
  endlessBoon: { every: 3 },
  boons: {
    might: { name: "완력", icon: "💪", desc: "근접 공격력 +20%", kind: "mult", key: "atk", value: 1.2 },
    artillery: { name: "포격 강화", icon: "🗼", desc: "모든 타워 공격력 +15%", kind: "mult", key: "towerDmg", value: 1.15 },
    affinity: { name: "정수 친화", icon: "💠", desc: "정수 스킬(폭발\xB7시간 왜곡\xB7방벽) 비용 -1", kind: "delta", key: "skillCostDelta", value: -1 },
    aid: { name: "응급 처치", icon: "❤️", desc: "크리스탈 체력 300 즉시 회복", kind: "instant" },
    bond: { name: "수정 결속", icon: "💎", desc: "크리스탈 최대 체력 +150", kind: "maxHp", value: 150 },
    plunder: { name: "약탈", icon: "💰", desc: "몬스터 처치 보상(목재\xB7광물) +25%", kind: "mult", key: "bounty", value: 1.25 }
  },
  // 보스 전용 패턴. 예고 시간을 반드시 두어서 플레이어가 반응할 수 있게 한다.
  bossPattern: {
    // 체력이 이 비율 아래로 떨어질 때마다 한 번씩 잡졸을 부른다
    summonAt: [0.72, 0.46, 0.22],
    summonCount: 3,
    summonType: "grunt",
    summonCast: 1.1,
    // 크리스탈에서 이만큼 떨어져 있을 때, 쿨다운마다 돌진한다
    chargeMinDist: 9,
    chargeCd: 11,
    chargeCast: 1.2,
    chargeTime: 1.5,
    chargeSpeed: 4.2,
    // 돌진 중 스치는 건물에 주는 피해
    chargeBuildingDmg: 55
  },
  wave: {
    goal: 10,
    // 승리 조건: 10웨이브 생존
    prepTime: 60,
    // 웨이브 사이 준비 시간(초). 0이 되면 자동 시작
    firstPrepTime: 75,
    // 첫 웨이브는 조금 더 여유
    maxAlive: 120,
    // 성능 상한
    spawnGap: 0.55,
    // 스폰 간격(초)
    hpScale: 1.16,
    // 웨이브당 체력 배율
    dmgScale: 1.09,
    reward: { wood: 20, stone: 15, perWave: { wood: 8, stone: 6 } },
    shardEvery: 3,
    // n웨이브마다 수정 정수 1개 (크리스탈 25% 회복)
    nightEvery: 7
    // n웨이브마다 밤 웨이브 — 조명이 어두워지고 시야(안개)가 좁아진다. 엔드리스에서도 계속 반복된다.
  },
  // 정수(💠) 액티브 스킬. 회복과 경쟁하도록 비용을 잡는다 — 정수를 아껴 회복할지, 지금 싸움에 쓸지 고민하게 만드는 게 목적.
  skills: {
    heal: { name: "회복", icon: "💧", cost: 1, healPct: 0.25, desc: "크리스탈 체력 25% 회복" },
    blast: { name: "폭발", icon: "💥", cost: 2, radius: 6, dmg: 90, desc: "내 주변 적에게 즉시 폭발 피해" },
    chill: { name: "시간 왜곡", icon: "🌀", cost: 2, radius: 8, slow: 0.65, time: 4, desc: "내 주변 적을 크게 둔화시킨다" },
    barrier: { name: "긴급 방벽", icon: "🛡️", cost: 3, time: 5, desc: "잠시 크리스탈이 어떤 피해도 받지 않는다" }
  },
  net: {
    snapshotHz: 12,
    // 호스트 → 클라이언트 스냅샷 주기
    inputHz: 15
    // 클라이언트 → 호스트 위치 전송 주기
  }
};
export function waveComposition(w2) {
  const list = [];
  list.push({ type: "grunt", count: 4 + Math.floor(w2 * 1.6) });
  if (w2 >= 2) list.push({ type: "runner", count: 2 + Math.floor(w2 * 1.1) });
  if (w2 >= 3) list.push({ type: "brute", count: Math.floor((w2 - 1) / 2) + 1 });
  if (w2 >= 4) list.push({ type: "shooter", count: 1 + Math.floor((w2 - 2) / 2) });
  if (w2 >= 5) list.push({ type: "raider", count: 1 + Math.floor((w2 - 3) / 3) });
  if (w2 % 5 === 0) {
    const bossType = w2 / 5 % 2 === 0 ? "frostlord" : "boss";
    list.push({ type: bossType, count: Math.floor(w2 / 5) });
  }
  return list;
}
var BIOME_KEYS = ["canyon", "plains", "normal"];
export function biomeOf(seed) {
  const r = mulberry32(seed + 999331)();
  const idx = Math.floor(r * BIOME_KEYS.length);
  return BIOME_KEYS[Math.min(idx, BIOME_KEYS.length - 1)];
}
var VARIANT_KEYS = Object.keys(CFG.variants);
export function rollVariant(wave) {
  const c2 = CFG.variantChance;
  const chance = Math.min(c2.max, c2.base + c2.perWave * (wave - 1));
  if (Math.random() >= chance) return null;
  return VARIANT_KEYS[Math.floor(Math.random() * VARIANT_KEYS.length)];
}
export function rollElite(wave) {
  const c2 = CFG.elite;
  if (wave < c2.minWave) return false;
  return Math.random() < c2.chance;
}
export function enemyStats(type, wave) {
  const base = CFG.enemies[type];
  const hpMul = Math.pow(CFG.wave.hpScale, wave - 1) * (CFG.wave.difficultyHpMult || 1);
  const dmgMul = Math.pow(CFG.wave.dmgScale, wave - 1) * (CFG.wave.difficultyDmgMult || 1);
  return {
    ...base,
    type,
    maxHp: Math.round(base.hp * hpMul),
    dmg: Math.round(base.dmg * dmgMul),
    speed: base.speed * (1 + Math.min(0.25, (wave - 1) * 0.02))
  };
}
export var DIFFICULTIES = {
  normal: { key: "normal", label: "보통", desc: "맨손으로 시작 \xB7 나무부터 캔다", startWood: 0, startStone: 0, prepBonus: 0, hpMult: 1, dmgMult: 1 },
  easy: { key: "easy", label: "쉬움", desc: "준비 시간 +30초 \xB7 시작 자원은 똑같이 0", startWood: 0, startStone: 0, prepBonus: 30, hpMult: 1, dmgMult: 1 },
  hard: { key: "hard", label: "어려움", desc: "준비 시간 -15초 \xB7 몬스터 체력\xB7공격력 +15% \xB7 시작 자원 0", startWood: 0, startStone: 0, prepBonus: -15, hpMult: 1.15, dmgMult: 1.15 }
};
var BASE_PREP_TIME = CFG.wave.prepTime;
var BASE_FIRST_PREP_TIME = CFG.wave.firstPrepTime;
export function applyDifficulty(key) {
  const d2 = DIFFICULTIES[key] || DIFFICULTIES.normal;
  CFG.wave.prepTime = BASE_PREP_TIME + d2.prepBonus;
  CFG.wave.firstPrepTime = BASE_FIRST_PREP_TIME + d2.prepBonus;
  CFG.wave.difficultyHpMult = d2.hpMult;
  CFG.wave.difficultyDmgMult = d2.dmgMult;
  return d2;
}
export function waveReward(w2) {
  const r = CFG.wave.reward;
  return {
    wood: r.wood + r.perWave.wood * w2,
    stone: r.stone + r.perWave.stone * w2,
    shard: w2 % CFG.wave.shardEvery === 0 ? 1 : 0
  };
}
