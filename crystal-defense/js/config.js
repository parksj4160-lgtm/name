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
  // 비행 몬스터(flyer)가 떠서 이동하는 높이 — 벽·함정을 눈으로도 넘어가는 게 보이게 한다
  flyHeight: 3.2,
  crystal: {
    hp: 1e3,
    radius: 2.2,
    hitRange: 3.6,
    // 몬스터가 크리스탈을 때리기 시작하는 거리
    // 크리스탈 체력이 이 비율 아래로 떨어지면 "필사의 반격" — 플레이어의 근접·폭탄 대미지가 오른다.
    // 기존에 있던 위험 경고(화면 가장자리 붉은 맥동 + 토스트)와 같은 문턱값을 그대로 실제 버프로 잇는다.
    // 타워 대미지에는 적용하지 않는다 — 크리스탈이 위태로울수록 직접 뛰어들 이유를 만드는 게 목적.
    desperation: { threshold: 0.3, dmgMult: 1.3 }
  },
  // 크리스탈 강화 — 정수(💠)로 크리스탈 자체를 영구히 키운다. 세 갈래 모두 레벨당 비용이 오르고
  // 최대 레벨이 있어 무한 스노우볼은 안 된다. 지킬 대상이 강해지면 후반에 방어선을 좁혀 버티는
  // 선택지가 생긴다는 게 목적.
  crystalUpgrade: {
    maxLv: 5,
    armor: { name: "강화", icon: "💪", desc: "최대 체력 +150 (즉시 그만큼 회복도 됨)", hpPerLv: 150, baseCost: 2, costStep: 1 },
    regen: { name: "재생", icon: "💚", desc: "매초 최대 체력의 0.6% 만큼 자동 회복", pctPerLv: 6e-3, baseCost: 2, costStep: 1 },
    aura: { name: "오라", icon: "⚡", desc: "주변 적에게 1초마다 피해를 준다", radius: 6.5, dmgPerLv: 12, tickTime: 1, baseCost: 3, costStep: 1 },
    // 몬스터의 공격 판정(onCrystalHit)으로 크리스탈이 맞을 때만 발동 — 근접이든 주술사의 원거리
    // 저격이든 "누가 때렸는지"가 있으면 다 걸리지만, 운석·폭탄병 폭발처럼 특정 공격자 없이
    // 들어오는 광역 피해에는 걸리지 않는다. 오라(주변 전체에 상시 피해)와 달리 "크리스탈이 실제로
    // 맞아야" 발동해서, 방어선이 뚫려 크리스탈이 두들겨 맞는 위기 상황일수록 존재감이 커진다 —
    // 오라가 평시의 화력이라면 반사는 위기의 보험에 가깝다.
    reflect: { name: "반사", icon: "🪞", desc: "크리스탈을 직접 공격한 적에게 받은 피해의 일부를 그대로 돌려준다", pctPerLv: 0.08, baseCost: 3, costStep: 1 }
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
    dash: { speed: 20, duration: 0.16, cooldown: 3 },
    // 미니맵 핑 — 협동 플레이에서 위치를 알리는 신호. 자원도 안 쓰고 되돌릴 상태도 없어서
    // 쿨다운은 순전히 도배 방지용이다
    pingCooldown: 2.5
  },
  harvest: {
    range: 3.2,
    tree: { time: 1.5, yield: 6, charges: 4, respawn: 22 },
    // 바위·정수석은 맨손으로 못 캔다 — 곡괭이를 손에 쥐고 있어야 한다.
    // (나무는 맨손으로 캘 수 있어야 첫 곡괭이를 만들 수 있으므로 조건이 없다)
    rock: { time: 2.1, yield: 5, charges: 3, respawn: 28, needsPickaxe: true },
    // 정수석: 아주 드물게 있는 채집물. 캐면 수정 정수(크리스탈 회복용)를 바로 얻는다.
    // 곡괭이가 필요하고, 캐는 데 오래 걸리며, 한 번 캐면 오래 리스폰되지 않는다.
    gem: { time: 3, yield: 1, charges: 1, respawn: 90, needsPickaxe: true },
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
    },
    // 피해는 거의 없지만 맞은 적을 잠깐 완전히 묶어 둔다(둔화가 아니라 이동 속도 0).
    // 🦇 박쥐처럼 벽·함정을 무시하는 적도 사거리 안에만 들어오면 그대로 묶인다 —
    // 다른 타워들의 화력이 명중할 시간을 벌어 주는 용도.
    snare: {
      name: "덫탑",
      icon: "🕸️",
      hotkey: "0",
      cost: { wood: 45, stone: 20 },
      hp: 170,
      blocks: true,
      desc: "적을 묶어 완전히 멈춘다(짧은 시간, 피해는 미미). 비행 몬스터에게도 통한다. 묶인 적을 다른 타워가 맞추면 추가 피해.",
      levels: [
        { hp: 170, dmg: 4, range: 9, rate: 0.5, root: 1.4 },
        { hp: 260, dmg: 6, range: 10.5, rate: 0.6, root: 1.8, cost: { wood: 60, stone: 40 } },
        { hp: 380, dmg: 9, range: 12, rate: 0.7, root: 2.2, cost: { wood: 110, stone: 90, iron: 5 } }
      ]
    },
    // 다른 타워는 전부 한 놈만 맞추거나(단일 표적) 한 자리를 지정해서 넓게 맞춘다(대포 splash).
    // 번개탑은 그 중간 — 명중한 적에서 가까운 다른 적으로 튀어 옮겨붙는다(순차적으로, 튈수록 약해짐).
    // 뭉쳐서 오는 잡몹 무리엔 대포탑만큼 강하면서, 흩어진 적에게는 화살탑처럼 한 놈에 집중된다 —
    // "지금 뭉쳐 오나 흩어져 오나"에 따라 대포탑과 다른 선택지가 되는 게 목적.
    lightning: {
      name: "번개탑",
      icon: "🌩️",
      hotkey: "c",
      cost: { wood: 45, stone: 35 },
      hp: 170,
      blocks: true,
      desc: "명중한 적에서 가까운 다른 적으로 튀어 옮겨붙는다(튈수록 피해 감소). 뭉쳐 오는 잡몹 무리에 강하다.",
      levels: [
        { hp: 170, dmg: 9, range: 11, rate: 0.85, chain: { count: 3, range: 4.5, falloff: 0.6 } },
        { hp: 260, dmg: 14, range: 12.5, rate: 0.95, chain: { count: 4, range: 5, falloff: 0.65 }, cost: { wood: 55, stone: 65 } },
        { hp: 400, dmg: 21, range: 14, rate: 1.05, chain: { count: 5, range: 5.5, falloff: 0.7 }, cost: { wood: 100, stone: 130, iron: 6 } }
      ]
    }
  },
  // 시설에 다가가 클릭하면 열리는 작업창. range 는 상호작용 가능 거리.
  station: { range: 3.6 },
  // 화로 제련: 광물 -> 철
  smelt: { cost: { stone: 6 }, yield: 1 },
  // 무기 강화 — 화로에서 철을 태워 이미 만든 무기(곡괭이 제외)의 위력을 영구히 올린다.
  // 크리스탈 강화(정수)와 대칭되는 후반 자원 배출구: 정수는 크리스탈에, 철은 무기에 쓰게 된다.
  // 레벨당 비용이 오르고 최대 레벨이 있어 크리스탈 강화처럼 무한 스노우볼은 아니다.
  weaponUpgrade: {
    maxLv: 3,
    baseCost: 5,
    costStep: 4,
    // 무기별 레벨당 보너스. bow·spear는 원래 대미지 보너스가 없어(사거리·범위만 준다) 강화가
    // 그 자리를 채워준다. bomb 은 근접 판정이 아니라 투척 대미지(craft.bomb.throw.dmg)에 붙는다.
    perLv: {
      sword: { dmg: 8 },
      bow: { dmg: 10 },
      spear: { dmg: 8 },
      hammer: { dmg: 12 },
      bomb: { dmg: 20 },
      whip: { dmg: 6 }
    }
  },
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
    // 실제로 화살을 쏘는 원거리 무기. 폭탄가방과 달리 자원을 안 먹는 대신 한 발에 한 마리만 맞고
    // 피해도 훨씬 낮다 — 폭탄은 "비싸고 강한 광역 한 방", 활은 "공짜지만 얌전한 점사"로 갈린다.
    bow: {
      name: "활",
      icon: "🏹",
      cost: { wood: 20, iron: 3 },
      desc: "들면 공격이 근접 대신 조준한 곳으로 화살을 쏘는 것으로 바뀐다. 자원은 안 들지만 한 발에 한 마리만 맞는다.",
      shoot: { dmg: 26, cd: 0.8, speed: 34, range: 16, hitRadius: 2.2 }
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
    // 다른 근접 무기(칼·창·망치)는 전부 "더 세게 때리는" 쪽이지만, 이건 대미지 대신 맞은 적을
    // 뒤로 밀쳐낸다 — 첫 근접 전용 제어기다. 크리스탈로 달려드는 무리를 잠깐 물러서게 하거나,
    // 근접 위협을 밀어내고 그 틈에 타워·정수 스킬로 정리하는 용도.
    whip: {
      name: "채찍",
      icon: "🔗",
      cost: { wood: 25, iron: 5 },
      effect: { range: 1.5, arc: 0.35, knockback: 3.2 },
      desc: "사거리가 조금 늘고, 맞은 적을 뒤로 밀쳐낸다 — 대미지보다 거리 조절에 특화."
    },
    // 유일한 원거리 무기 — 다른 무기(칼·활·창·망치)는 전부 근접 판정을 강화할 뿐이지만
    // 이건 실제 투사체를 던진다. 정수(shard)가 아니라 목재·광물을 태우는 소모형이라
    // 자원 관리 선택이 생기고, 결계(ward) 변종처럼 타워가 못 맞추는 원거리 위협에도 대응할 수 있다
    bomb: {
      name: "폭탄가방",
      icon: "💣",
      cost: { wood: 15, stone: 10 },
      desc: "들면 공격이 근접 대신 조준한 곳에 폭탄을 던지는 것으로 바뀐다. 던질 때마다 목재·광물을 태운다.",
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
    // 벽·함정을 전부 무시하고 크리스탈로 직선 비행한다 — 길찾기 자체를 안 쓰므로 벽 중심 방어에 구멍을 낸다.
    // 대신 체력이 아주 낮아 타워 몇 대만 스치면 죽는다: "타워가 있어야 하는 이유"를 만드는 게 목적
    flyer: { name: "박쥐", icon: "🦇", hp: 26, speed: 4.6, dmg: 9, rate: 1.1, radius: 0.42, color: 8048895, bounty: { wood: 2, stone: 2 }, scale: 0.8, flies: true },
    // 직접 공격은 약하지만(dmg 낮음), 주기적으로 주변 다친 아군을 회복시킨다 — 방치하면 같이
    // 나온 잡졸들이 안 죽고 계속 버텨서, "다른 놈들보다 이놈부터" 라는 우선순위 판단을 강요한다.
    // 무리 중 하나가 사라지면 눈에 띄게 편해지는 걸 체감하도록 설계.
    healer: { name: "치유사", icon: "💉", hp: 85, speed: 2.3, dmg: 6, rate: 0.5, radius: 0.55, color: 4172995, bounty: { wood: 3, stone: 3 }, scale: 1, healAura: { radius: 5, pct: 0.05, interval: 1.5 } },
    boss: { name: "파괴자", icon: "💀", hp: 900, speed: 2.1, dmg: 70, rate: 0.7, radius: 1.4, color: 3092282, bounty: { wood: 30, stone: 30 }, scale: 2.3, boss: true },
    // 5의 배수 웨이브마다 파괴자와 번갈아 등장한다. 소환하는 잡졸이 전부 🛡️ 방패 변종이라(정면 피해 감소)
    // 뒤로 돌아가서 처리해야 하는 다른 압박을 준다 — 돌진/소환 패턴 자체는 파괴자와 동일하다.
    frostlord: { name: "서리 군주", icon: "🧊", hp: 1050, speed: 1.7, dmg: 55, rate: 0.65, radius: 1.5, color: 10479871, bounty: { wood: 32, stone: 38 }, scale: 2.4, boss: true, summonVariant: "shield" },
    // 세 번째 보스(15웨이브 주기로 파괴자·서리 군주와 순환). 소환 대신 자기 발밑에 침묵 장판을 깐다 —
    // 장판 반경 안의 타워는 조준·사격이 전부 멈춘다(`buildings.js`의 `updateTowers` 참고). 돌진 패턴은 공유.
    warden: { name: "침묵의 군주", icon: "🔇", hp: 1100, speed: 1.8, dmg: 50, rate: 0.65, radius: 1.5, color: 8011711, bounty: { wood: 34, stone: 34 }, scale: 2.35, boss: true, silenceBoss: true },
    // 네 번째 보스(20웨이브 주기로 나머지 셋과 순환). 소환·침묵 대신 자기 체력 문턱마다 팀 자원을
    // 직접 훔쳐(그 절반만큼 자기 체력을 회복) — 다른 보스들의 압박이 전부 "크리스탈·건물·타워"를
    // 향했다면 이쪽은 파밍한 자원 자체를 노린다. 놔두면 회복까지 겹쳐 싸움이 길어지므로, 캐스팅
    // 중(그 사이엔 무방비로 서 있다) 화력을 몰아 최대한 못 훔치게 끊는 것이 유일한 대응이다.
    looter: { name: "갈취자", icon: "🦂", hp: 1200, speed: 1.75, dmg: 52, rate: 0.65, radius: 1.5, color: 16766720, bounty: { wood: 36, stone: 36 }, scale: 2.4, boss: true, drainBoss: true },
    // 체력이 낮아 금방 죽지만, 죽는 순간(어떻게 죽었든) 그 자리에서 폭발해 주변 크리스탈·건물·플레이어에게
    // 피해를 준다 — 근접으로 마지막 일격을 넣으면 그 폭발을 그대로 맞는다. "닥치고 근접"이 항상 안전하지
    // 않게 만드는 가시(thorn) 변종과 목적은 비슷하지만, 이쪽은 변종이 아니라 종류 자체라 항상 그렇다.
    bomber: { name: "폭탄병", icon: "🧨", hp: 42, speed: 2.7, dmg: 8, rate: 1, radius: 0.55, color: 16733491, bounty: { wood: 2, stone: 2 }, scale: 1, explode: { radius: 3.2, dmg: 55, buildingDmgMult: 0.5, playerDmg: 42 } },
    // 웨이브 구성에 안 끼고 전투 중 독립적으로(운석·보급품처럼) 튀어나온다. 공격을 아예 안 하고
    // 가장 가까운 플레이어에게서 도망만 친다(체력이 낮아 잡기는 쉽지만 안 쫓아가면 금방 사라진다) —
    // "지금 하던 걸 멈추고 쫓아갈지" 순간 판단을 만드는 게 목적. 못 잡으면 보상 없이 그냥 사라진다.
    // event: 웨이브 구성에 안 끼는 독립 이벤트 몬스터라는 표시 — 웨이브 클리어 판정과 "남은 몬스터"
    // 표시에서 제외한다. 이게 없으면 적을 다 잡아도 도망 다니는 보물게 한 마리 때문에 웨이브가
    // 게 사라질 때까지(최대 13초) 안 끝나고, HUD에는 잡을 수 없는 "남은 몬스터 1" 이 계속 떠 있다.
    treasure: { name: "보물게", icon: "🦀", hp: 16, speed: 5.4, dmg: 0, rate: 0, radius: 0.4, color: 16766720, bounty: { wood: 16, stone: 12 }, scale: 0.85, flees: true, event: true, shardChance: 0.5 }
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
    ward: { name: "결계", icon: "🌀", tint: 11800063 },
    // 근접 공격(칼·창·망치 등)으로 때리면 준 피해의 일부를 그대로 되돌려 받는다. 타워·함정·
    // 폭탄·정수 스킬처럼 거리를 둔 공격에는 안 걸린다 — 무기 강화나 필사의 반격으로 근접 대미지가
    // 오른 만큼 반사 피해도 커지므로, "닥치고 근접"만으로는 항상 안전하지 않게 만드는 게 목적
    thorn: { name: "가시", icon: "🌵", tint: 9127187, reflectPct: 0.4 }
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
    poisonStack: { radius: 7, dpsMultPerNeighbor: 0.35, max: 1 },
    // 덫탑에 묶여(root) 있는 적을 다른 타워가 맞추면 추가 피해 — 덫탑 자신은 제외(묶는 역할에 집중).
    // frostArrow 처럼 인접 배치가 필요 없다 — 묶인 상태 자체가 트리거라 어떤 타워 조합이든 이득을 본다
    rootSnare: { dmgMult: 0.35 }
  },
  // 타워 특화 — 최대 레벨에 도달한 전투 타워는 딱 한 번, 두 갈래 중 하나를 골라 성격을 바꾼다.
  // 되돌릴 수 없다(철거하고 새로 지어야 한다). 업그레이드가 "같은 타워를 더 세게"였다면 이건
  // "같은 타워를 다르게" — 같은 화살탑이라도 저격형이냐 연사형이냐에 따라 방어선 구성이 달라진다.
  // mods 는 해당 레벨 스탯에 곱하고, add 는 없던 속성을 새로 붙인다(splash 를 붙이면 기존 범위
  // 피해 배관을 그대로 타서 상태이상까지 광역이 된다 — 새 로직 없이 성격이 크게 바뀐다).
  towerSpec: {
    cost: { wood: 50, stone: 80, iron: 4 },
    arrow: {
      sniper: { name: "저격", icon: "🔭", ring: 16764006, desc: "사거리와 한 방이 크게 늘지만 발사가 느려진다 — 단단한 적·보스에 강하다", mods: { dmg: 2.1, range: 1.35, rate: 0.5 } },
      rapid: { name: "연사", icon: "⚡", ring: 5891071, desc: "사거리와 한 방을 내주고 발사 속도를 크게 올린다 — 몰려오는 잡졸에 강하다", mods: { dmg: 0.62, range: 0.85, rate: 2 } }
    },
    frost: {
      deepfreeze: { name: "혹한", icon: "🥶", ring: 5891071, desc: "둔화가 더 깊고 훨씬 오래 간다 — 한 놈을 확실히 묶어 둔다", mods: { slow: 1.25, slowTime: 1.6 } },
      shatter: { name: "서리파편", icon: "💠", ring: 11800063, desc: "명중 지점 주변까지 함께 얼린다 — 무리 전체를 한꺼번에 늦춘다", mods: { dmg: 1.2, slowTime: 0.75 }, add: { splash: 2.8 } }
    },
    cannon: {
      barrage: { name: "융단폭격", icon: "🎇", ring: 16752640, desc: "폭발 범위가 크게 넓어진다(한 방은 약해진다) — 뭉친 무리를 통째로 쓸어담는다", mods: { dmg: 0.7, splash: 1.5, rate: 1.15 } },
      breaker: { name: "철갑탄", icon: "🛡️", ring: 12105912, desc: "범위를 좁히는 대신 한 방이 훨씬 무거워진다 — 브루트·보스를 부순다", mods: { dmg: 1.75, splash: 0.55 } }
    },
    poison: {
      virulent: { name: "맹독", icon: "☣️", ring: 9419324, desc: "독이 훨씬 빠르게 갉아먹는다(대신 짧다) — 단단한 한 놈을 녹인다", mods: { poisonDps: 1.9, poisonTime: 0.6 } },
      plague: { name: "역병", icon: "🦠", ring: 4172995, desc: "주변까지 독을 퍼뜨리고 훨씬 오래 간다 — 무리 전체를 서서히 죽인다", mods: { poisonDps: 0.8, poisonTime: 1.5 }, add: { splash: 3.2 } }
    },
    snare: {
      bind: { name: "속박", icon: "⛓️", ring: 16764006, desc: "묶는 시간이 크게 늘어난다 — 위험한 한 놈을 오래 세워 둔다", mods: { root: 1.55, rate: 0.85 } },
      net: { name: "그물", icon: "🕸️", ring: 11800063, desc: "주변 적까지 함께 묶는다(묶는 시간은 짧다) — 무리를 통째로 세운다", mods: { root: 0.7 }, add: { splash: 3.6 } }
    },
    // chain 은 숫자가 아니라 객체라 mods 로는 못 건드린다(stats getter가 숫자 필드만 곱한다) — add로
    // 통째로 새 chain 객체를 얹어서(기존 값을 완전히 대체) 갈래마다 완전히 다른 체인 모양을 만든다.
    // focus는 count:1로 사실상 체인을 끄는 셈이라 새 로직 없이 자연스럽게 단일 표적 타워가 된다.
    lightning: {
      spread: { name: "확산", icon: "🌐", ring: 6739199, desc: "튀는 대상 수와 사거리가 늘어난다(한 방은 약해진다) — 흩어진 잡몹 무리를 한 번에 쓸어담는다", mods: { dmg: 0.6, rate: 1.15 }, add: { chain: { count: 7, range: 6.5, falloff: 0.75 } } },
      focus: { name: "집속", icon: "🎯", ring: 16752640, desc: "튐을 포기하고 한 놈에게 모든 전력을 쏟는다 — 보스·브루트를 순식간에 녹인다", mods: { dmg: 2.5, range: 1.25 }, add: { chain: { count: 1, range: 0, falloff: 1 } } }
    }
  },
  // 무기 특화 — 타워 특화와 정확히 같은 개념을 무기 쪽으로 옮긴 것. 무기 강화가 최대
  // 레벨(Lv.3)에 도달하면 두 갈래 중 하나를 골라 성격을 바꾼다(되돌릴 수 없다). mods 는 곱하고
  // add 는 통째로 덮어쓴다. 대부분은 player.js 의 attackStats(근접 판정)가 강화 보너스까지 다
  // 계산한 값 위에 적용되지만, 활·폭탄가방은 근접 판정과 다른 별도 배관(각각 shootStats·
  // throwStats)을 타므로 그 배관의 기본값 위에 똑같은 방식으로 적용된다.
  weaponSpec: {
    cost: { iron: 12 },
    sword: {
      quickblade: { name: "쾌속검", icon: "⚡", desc: "대미지를 낮추는 대신 훨씬 빠르게 휘두른다 — 약한 잡몹을 순식간에 정리한다", mods: { dmg: 0.6, cd: 0.5 } },
      greatsword: { name: "대검", icon: "🗡️", desc: "느려지는 대신 한 방이 훨씬 무겁다 — 단단한 한 놈을 확실히 끊는다", mods: { dmg: 2, cd: 1.6 } }
    },
    // 활은 근접 판정이 아니라 별도의 조준 사격 배관(craft.bow.shoot)을 타므로, 다른 무기처럼
    // arc(판정각)를 건드리는 대신 그 배관의 진짜 변수인 사거리·발사 간격을 갈래마다 반대로 튼다.
    bow: {
      longbow: { name: "장궁", icon: "🎯", desc: "사거리와 대미지가 크게 늘지만 발사가 느려진다 — 멀리서 한 발 한 발 정조준", mods: { dmg: 1.5, cd: 1.3, range: 1.4 } },
      rapid: { name: "속사", icon: "💨", desc: "사거리와 대미지를 내주고 발사 속도를 크게 올린다 — 가까이서 쏟아붓는다", mods: { cd: 0.5, dmg: 0.7, range: 0.75 } }
    },
    spear: {
      lance: { name: "긴 창", icon: "🔱", desc: "사거리가 극단적으로 늘고 판정은 더 좁아진다 — 줄지어 오는 적을 꿰뚫는 데 특화", mods: { dmg: 1.5, arc: 0.6 }, add: { range: 9 } },
      whirl: { name: "회전창", icon: "🌀", desc: "찌르기 대신 사방을 휩쓴다 — 사거리를 내주고 무리를 한꺼번에 벤다", mods: { dmg: 0.7 }, add: { arc: 3.2, range: 3.5 } }
    },
    hammer: {
      crush: { name: "강타", icon: "💥", desc: "훨씬 느려지지만 한 방이 압도적이다 — 단단한 적·보스를 부순다", mods: { dmg: 1.8, cd: 1.35 } },
      flurry: { name: "연속타격", icon: "🌪️", desc: "한 방을 내주고 훨씬 빠르게 휘두른다 — 사방을 두들기면서도 속도를 잃지 않는다", mods: { dmg: 0.6, cd: 0.45 } }
    },
    whip: {
      longwhip: { name: "긴 채찍", icon: "🪢", desc: "사거리와 밀쳐내는 힘이 더 세진다 — 더 멀리서, 더 강하게 밀어낸다", mods: { range: 1.3, knockback: 1.6 } },
      snapwhip: { name: "연속채찍", icon: "🔁", desc: "밀쳐내는 힘을 내주고 훨씬 빠르게 휘두른다 — 계속 두들겨 묶어 두듯 밀어낸다", mods: { cd: 0.6, knockback: 0.5 } }
    },
    // 폭탄가방도 활처럼 근접 판정이 아니라 별도 투척 배관(craft.bomb.throw)을 타므로
    // player.js 의 throwStats 가 이 mods 를 그 배관 위에 얹는다.
    bomb: {
      cluster: { name: "확산탄", icon: "💥", desc: "범위가 크게 넓어지지만 한 방은 약해진다 — 뭉친 무리를 통째로 쓸어담는다", mods: { radius: 1.6, dmg: 0.65 } },
      heavy: { name: "고폭탄", icon: "☢️", desc: "범위를 내주는 대신 한 방이 훨씬 무겁다(던지는 간격도 길어진다) — 단단한 한 놈을 확실히 끊는다", mods: { dmg: 1.8, radius: 0.6, cd: 1.3 } }
    }
  },
  // 보급품 투하 — 전투 중(웨이브 2부터) 가끔 지도 위에 상자가 떨어진다. 한 번에 최대 1개만 떠 있고,
  // 안 챙기고 놔두면 사라진다. 방어를 잠깐 비우고 달려가서 주울지 말지가 매 순간의 선택이 된다.
  supplyDrop: { minWave: 2, firstDelay: 16, minGap: 30, maxGap: 50, lifetime: 20, pickupRadius: 1.8, reward: { wood: 14, stone: 9 }, shardChance: 0.4 },
  // 운석 낙하 — 전투 중(4웨이브부터) 가끔 무작위 지점에 경고가 뜨고, 잠깐 뒤 그 자리에 큰 범위
  // 피해가 떨어진다. 몬스터를 그 자리로 끌어들이면 한 방에 정리하는 이득이 있지만, 내 건물이나
  // 내 캐릭터가 그 자리에 있으면 그대로 맞는다 — 순수 이득이던 보급품 투하와 반대로 양날의 검이다.
  // 건물·자원 노드를 피하지 않는다 — 그래서 위험하다.
  meteor: { minWave: 4, firstDelay: 22, minGap: 40, maxGap: 65, telegraphTime: 2.5, radius: 5, dmg: 150, buildingDmgMult: 0.5, playerDmg: 35 },
  // 보물게 — 전투 중(3웨이브부터) 가끔 튀어나와 도망만 다니는 몬스터. 웨이브 구성에 안 끼는 독립
  // 이벤트라 운석·보급품과 같은 패턴(호스트 전용 타이머)으로 처리한다. lifetime 안에 못 잡으면
  // 보상 없이 사라진다 — 보급품처럼 순수 이득이 아니라, 잡으려면 지금 하던 걸 멈추고 쫓아가야 한다.
  treasureEvent: { minWave: 3, firstDelay: 20, minGap: 35, maxGap: 55, lifetime: 13 },
  // 떠돌이 상인 — 웨이브를 클리어하고 준비 시간에 들어갈 때(2웨이브부터) 확률적으로 나타나,
  // 그 준비 시간 동안만 무작위 2개 품목을 판다. 축복(엔드리스 전용, 정수로 구매, 영구 적용)과
  // 달리 표준 캠페인부터 목재·광물로 살 수 있고, 물약 종류는 해당 웨이브 한 번만 지속되는
  // 일회성 효과라 "지금 자원을 아껴 쌓을지, 당장의 이득으로 바꿀지"라는 준비 시간의 선택지를 넓힌다.
  // 품목은 플레이어별로 각자 한 번씩 살 수 있다(공유 자원 모드에서도 동일 — 팀 전체가 아니라
  // 인당 1회). 웨이브가 시작되면(전투 진입) 즉시 사라진다.
  merchant: {
    minWave: 2,
    chance: 0.65,
    offerCount: 2,
    pool: {
      heal: { name: "치유 물약", icon: "🧪", desc: "크리스탈 체력을 즉시 300 회복한다", cost: { wood: 40, stone: 30 }, kind: "heal", value: 300 },
      atkTonic: { name: "힘의 물약", icon: "💪", desc: "다음 웨이브 동안 근접 공격력 +40%", cost: { wood: 35, stone: 20 }, kind: "tempAtk", value: 1.4 },
      towerTonic: { name: "포격 물약", icon: "🗼", desc: "다음 웨이브 동안 모든 타워 공격력 +25%", cost: { wood: 30, stone: 35 }, kind: "tempTower", value: 1.25 },
      shardTrade: { name: "정수 감정", icon: "💠", desc: "목재·광물을 정수 1개로 바꾼다", cost: { wood: 50, stone: 50 }, kind: "shard", value: 1 },
      ironTrade: { name: "철 주괴 거래", icon: "⚙️", desc: "목재·광물을 철 3개로 바꾼다", cost: { wood: 60, stone: 40 }, kind: "iron", value: 3 }
    }
  },
  // 엔드리스 축복 — 10웨이브 승리 이후(엔드리스)에만 등장한다. 표준 캠페인 밸런스에는 영향이 없다.
  // n웨이브마다 무작위 2개 중 하나를 골라 영구 적용(응급 처치만 즉시 1회성). 전부 호스트가 계산하는
  // 값(근접 공격력·타워 공격력·스킬 비용·크리스탈 체력)에만 걸려 있어서 별도 동기화 없이 참가자에게도 그대로 반영된다.
  endlessBoon: { every: 3 },
  boons: {
    might: { name: "완력", icon: "💪", desc: "근접 공격력 +20%", kind: "mult", key: "atk", value: 1.2 },
    artillery: { name: "포격 강화", icon: "🗼", desc: "모든 타워 공격력 +15%", kind: "mult", key: "towerDmg", value: 1.15 },
    affinity: { name: "정수 친화", icon: "💠", desc: "정수 스킬(폭발·시간 왜곡·방벽) 비용 -1", kind: "delta", key: "skillCostDelta", value: -1 },
    aid: { name: "응급 처치", icon: "❤️", desc: "크리스탈 체력 300 즉시 회복", kind: "instant" },
    bond: { name: "수정 결속", icon: "💎", desc: "크리스탈 최대 체력 +150", kind: "maxHp", value: 150 },
    plunder: { name: "약탈", icon: "💰", desc: "몬스터 처치 보상(목재·광물) +25%", kind: "mult", key: "bounty", value: 1.25 },
    // 이번 세션에 추가된 크리스탈 강화(정수로 체력·재생·오라를 사는 시스템)와 맞물리는 축복.
    // affinity(정수 스킬 비용 -1)와 정확히 같은 구조를 크리스탈 강화 쪽에 그대로 옮겨온 것.
    growth: { name: "성장 가속", icon: "🌱", desc: "크리스탈 강화 비용 -1 (최소 1)", kind: "delta", key: "crystalUpgradeCostDelta", value: -1 },
    // growth 와 같은 구조를 이번 세션에 추가된 무기 강화 쪽으로도 옮긴 것. 철 비용이 정수보다
    // 단위가 커서(레벨당 5~13) -1로는 체감이 약해 -3으로 잡았다.
    forging: { name: "제련술", icon: "⚒️", desc: "무기 강화 비용 -3 (최소 1)", kind: "delta", key: "weaponUpgradeCostDelta", value: -3 },
    // forging 과 같은 구조를 무기 강화가 아니라 무기 특화(weaponSpec) 비용 쪽으로 옮긴 것 —
    // 무기 특화는 철 12개 고정이라 강화(레벨당 5~13)보다 단가가 커서 -4로 잡았다.
    mastery: { name: "숙련", icon: "🎓", desc: "무기 특화 비용 -4 (최소 1)", kind: "delta", key: "weaponSpecCostDelta", value: -4 }
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
    chargeBuildingDmg: 55,
    // 침묵의 군주 전용 — summonAt 임계값마다 소환 대신 침묵 장판을 깐다(summon과 배타적)
    silenceCast: 1.1,
    silenceRadius: 8,
    silenceTime: 4,
    // 갈취자 전용 — summonAt 임계값마다 소환 대신 팀 자원을 훔친다(summon·silence와 배타적).
    // 훔친 자원의 절반만큼 자기 최대 체력 비율로 회복한다 — 방치할수록 싸움이 길어진다.
    drainCast: 1.1,
    drainWood: 40,
    drainStone: 40,
    drainHealPct: 0.06
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
    nightEvery: 7,
    // n웨이브마다 밤 웨이브 — 조명이 어두워지고 시야(안개)가 좁아진다. 엔드리스에서도 계속 반복된다.
    // 지금까진 순전히 시각 효과라 "귀찮지만 아무 의미 없는 웨이브"였다 — 야간 처치 보상을 올려서
    // 어두워 위험을 감수한 만큼 실제로 보상이 따라오게 한다(타워 사거리 등 전투 수치는 안 건드린다 —
    // 그건 이미 안개 날씨(WEATHER.fog)가 맡고 있어서 밤과 겹치면 이중 페널티가 된다).
    nightBountyMult: 1.3
  },
  // 정수(💠) 액티브 스킬. 회복과 경쟁하도록 비용을 잡는다 — 정수를 아껴 회복할지, 지금 싸움에 쓸지 고민하게 만드는 게 목적.
  skills: {
    heal: { name: "회복", icon: "💧", cost: 1, healPct: 0.25, desc: "크리스탈 체력 25% 회복" },
    blast: { name: "폭발", icon: "💥", cost: 2, radius: 6, dmg: 90, desc: "내 주변 적에게 즉시 폭발 피해" },
    chill: { name: "시간 왜곡", icon: "🌀", cost: 2, radius: 8, slow: 0.65, time: 4, desc: "내 주변 적을 크게 둔화시킨다" },
    barrier: { name: "긴급 방벽", icon: "🛡️", cost: 3, time: 5, desc: "잠시 크리스탈이 어떤 피해도 받지 않는다" },
    // 나머지 넷과 성격이 다른 유일한 "설치형" 스킬 — 내 발밑이 아니라 **조준한 지점**에 잠깐 열려서
    // 주변 적을 중심으로 끌어당긴다. 그 자체로는 피해가 0이라 단독으로는 아무것도 못 죽이지만,
    // 흩어져 오는 무리를 한 덩어리로 뭉쳐 놓기 때문에 대포탑\xB7융단폭격\xB7폭탄\xB7운석처럼 범위 피해를
    // 주는 수단과 짝지으면 판이 갈린다. 보스는 자기 패턴이 있으므로 면역(끌려다니면 패턴이 망가진다).
    rift: { name: "중력 균열", icon: "🌌", cost: 3, radius: 7, pull: 5.5, time: 3.5, aimRange: 14, desc: "조준한 곳에 균열을 열어 주변 적을 끌어모은다 (피해 없음 · 보스 면역)" }
  },
  net: {
    snapshotHz: 12,
    // 호스트 → 클라이언트 스냅샷 주기
    inputHz: 15
    // 클라이언트 → 호스트 위치 전송 주기
  }
};
export function needsPickaxe(nodeType) {
  return !!CFG.harvest[nodeType]?.needsPickaxe;
}
function _standardTotal(w2) {
  let n = 4 + Math.floor(w2 * 1.6);
  n += 2 + Math.floor(w2 * 1.1);
  if (w2 >= 3) n += Math.floor((w2 - 1) / 2) + 1;
  if (w2 >= 4) n += 1 + Math.floor((w2 - 2) / 2);
  if (w2 >= 5) n += 1 + Math.floor((w2 - 3) / 3);
  if (w2 >= 6) n += 1 + Math.floor((w2 - 4) / 2);
  if (w2 >= 7) n += 1 + Math.floor((w2 - 5) / 3);
  if (w2 >= 8) n += 1 + Math.floor((w2 - 6) / 3);
  return n;
}
export var SPECIAL_WAVES = {
  rush: { name: "러시", icon: "🏃", desc: "러너가 대량으로 몰려온다 — 물량으로 밀어붙인다" },
  siege: { name: "공성", icon: "🏰", desc: "느리지만 단단한 근접·투척 부대 — 건물이 표적이다" },
  elite: { name: "정예전", icon: "⭐", desc: "수는 적지만 전부 강화된 정예다" },
  // 이번 웨이브의 몬스터는(정예로 뽑히지 않는 한) 전부 결계(ward)를 두르고 나온다 — 타워가
  // 아예 조준을 못 하니 트랩·근접·정수 스킬로 직접 정리해야 한다. 평소엔 가끔 섞여 나오는
  // 변종 하나를 "이번 웨이브 전체의 규칙"으로 확대한 것 — 방어선을 잠깐 내려놓고 뛰어들게 만든다.
  ward: { name: "결계", icon: "🌀", desc: "몬스터 전부가 결계에 씌워 타워가 조준하지 못한다 — 트랩·근접·정수 스킬로 직접 정리해야 한다" },
  // 평소엔 무리에 한둘만 섞여 나오는 치유사(healer)를 이번 웨이브 전체의 핵심으로 확대한 것 —
  // rush가 물량, siege가 건물 파괴, elite가 강한 개체, ward가 조준 불가라는 축이었다면 healers는
  // "안 죽이면 끝나지 않는다"는 축이다. 치유사를 먼저 솎아내지 않으면 나머지 그런트가 계속
  // 회복되어 웨이브가 실질적으로 안 끝난다 — 타워가 알아서 잡아 주길 기다리지 말고 직접
  // 우선순위를 정해 뛰어들어야 한다.
  healers: { name: "치유단", icon: "💉", desc: "치유사가 잔뜩 섞여 나와 서로를 회복시킨다 — 먼저 솎아내지 않으면 무리 전체가 안 죽는다" }
};
var SPECIAL_KEYS = Object.keys(SPECIAL_WAVES);
export function specialWaveKind(w2) {
  if (w2 < 3 || w2 % 5 === 0 || w2 % 3 !== 0) return null;
  const occurrence = Math.floor(w2 / 3) - Math.floor(w2 / 15);
  return SPECIAL_KEYS[(occurrence - 1) % SPECIAL_KEYS.length];
}
var BOSS_CYCLE = ["boss", "frostlord", "warden", "looter"];
function _specialComposition(w2, kind) {
  const total = _standardTotal(w2);
  if (kind === "rush") {
    return [{ type: "runner", count: Math.max(6, Math.round(total * 1.15)) }];
  }
  if (kind === "siege") {
    const otherType = w2 >= 5 ? "raider" : "grunt";
    return [
      { type: "brute", count: Math.max(2, Math.round(total * 0.55)) },
      { type: otherType, count: Math.max(2, Math.round(total * 0.4)) }
    ];
  }
  if (kind === "healers") {
    return [
      { type: "grunt", count: Math.max(3, Math.round(total * 0.34)) },
      { type: "healer", count: Math.max(2, Math.round(total * 0.22)) }
    ];
  }
  return [{ type: "grunt", count: Math.max(3, Math.round(total * 0.32)) }];
}
export function waveComposition(w2) {
  const special = specialWaveKind(w2);
  const list = special ? _specialComposition(w2, special) : (() => {
    const l2 = [];
    l2.push({ type: "grunt", count: 4 + Math.floor(w2 * 1.6) });
    if (w2 >= 2) l2.push({ type: "runner", count: 2 + Math.floor(w2 * 1.1) });
    if (w2 >= 3) l2.push({ type: "brute", count: Math.floor((w2 - 1) / 2) + 1 });
    if (w2 >= 4) l2.push({ type: "shooter", count: 1 + Math.floor((w2 - 2) / 2) });
    if (w2 >= 5) l2.push({ type: "raider", count: 1 + Math.floor((w2 - 3) / 3) });
    if (w2 >= 6) l2.push({ type: "flyer", count: 1 + Math.floor((w2 - 4) / 2) });
    if (w2 >= 7) l2.push({ type: "healer", count: 1 + Math.floor((w2 - 5) / 3) });
    if (w2 >= 8) l2.push({ type: "bomber", count: 1 + Math.floor((w2 - 6) / 3) });
    return l2;
  })();
  if (w2 % 5 === 0) {
    const bossType = BOSS_CYCLE[(w2 / 5 - 1) % BOSS_CYCLE.length];
    list.push({ type: bossType, count: Math.floor(w2 / 5) });
  }
  return list;
}
export var WEATHER = {
  rain: { name: "비", icon: "🌧️", desc: "땅이 젖어 이동이 둔해진다", playerSpeedMult: 0.88 },
  fog: { name: "안개", icon: "🌫️", desc: "시야가 줄고 타워 사거리가 짧아진다", towerRangeMult: 0.85 }
};
export function weatherOf(w2) {
  if (w2 < 2 || w2 % CFG.wave.nightEvery === 0) return null;
  const r = mulberry32(w2 * 7919 + 13)();
  if (r < 0.16) return "rain";
  if (r < 0.3) return "fog";
  return null;
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
  normal: { key: "normal", label: "보통", desc: "맨손으로 시작 · 나무부터 캔다", startWood: 0, startStone: 0, prepBonus: 0, hpMult: 1, dmgMult: 1 },
  easy: { key: "easy", label: "쉬움", desc: "준비 시간 +30초 · 시작 자원은 똑같이 0", startWood: 0, startStone: 0, prepBonus: 30, hpMult: 1, dmgMult: 1 },
  hard: { key: "hard", label: "어려움", desc: "준비 시간 -15초 · 몬스터 체력·공격력 +15% · 시작 자원 0", startWood: 0, startStone: 0, prepBonus: -15, hpMult: 1.15, dmgMult: 1.15 },
  // "어려움"보다 한 단계 더 — 파고들어 볼 사람들을 위한 선택지. 기존 두 축(준비 시간, 몬스터
  // 체력·공격력)을 그대로 더 세게 미는 것뿐이라 새 로직이 필요 없다(둘 다 CFG.wave에 이미
  // 걸려 있는 배율이라 여기 숫자만 바꾸면 웨이브 구성 전체에 자동으로 반영된다).
  nightmare: { key: "nightmare", label: "악몽", desc: "준비 시간 -25초 · 몬스터 체력·공격력 +30% · 시작 자원 0", startWood: 0, startStone: 0, prepBonus: -25, hpMult: 1.3, dmgMult: 1.3 }
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
