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
    attack: { dmg: 16, range: 2.8, arc: 1.5, cd: 0.42 }
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
        { hp: 980, cost: { wood: 40, stone: 55 } }
      ]
    },
    arrow: {
      name: "화살탑",
      icon: "🏹",
      hotkey: "2",
      cost: { wood: 35, stone: 15 },
      hp: 180,
      blocks: true,
      desc: "가장 앞선 적을 빠르게 저격한다.",
      levels: [
        { hp: 180, dmg: 11, range: 13, rate: 1.15 },
        { hp: 280, dmg: 18, range: 14.5, rate: 1.35, cost: { wood: 40, stone: 30 } },
        { hp: 420, dmg: 29, range: 16, rate: 1.6, cost: { wood: 80, stone: 70 } }
      ]
    },
    frost: {
      name: "서리탑",
      icon: "❄️",
      hotkey: "3",
      cost: { wood: 25, stone: 45 },
      hp: 200,
      blocks: true,
      desc: "적중한 적을 느리게 만든다. 빠른 몬스터 대응용.",
      levels: [
        { hp: 200, dmg: 5, range: 10, rate: 0.9, slow: 0.45, slowTime: 1.6 },
        { hp: 320, dmg: 9, range: 11.5, rate: 1, slow: 0.55, slowTime: 2, cost: { wood: 30, stone: 55 } },
        { hp: 480, dmg: 14, range: 13, rate: 1.1, slow: 0.65, slowTime: 2.4, cost: { wood: 60, stone: 110 } }
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
        { hp: 560, dmg: 66, range: 18, rate: 0.7, splash: 4.2, cost: { wood: 120, stone: 160 } }
      ]
    },
    poison: {
      name: "독탑",
      icon: "☠️",
      hotkey: "5",
      cost: { wood: 30, stone: 50 },
      hp: 190,
      blocks: true,
      desc: "적중한 적에게 지속 피해를 남긴다. 여러 마리를 동시에 갉아먹기 좋다.",
      levels: [
        { hp: 190, dmg: 4, range: 11, rate: 0.8, poisonDps: 6, poisonTime: 3 },
        { hp: 300, dmg: 6, range: 12.5, rate: 0.9, poisonDps: 10, poisonTime: 3.5, cost: { wood: 40, stone: 70 } },
        { hp: 460, dmg: 9, range: 14, rate: 1, poisonDps: 16, poisonTime: 4, cost: { wood: 80, stone: 140 } }
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
        { hp: 300, buffRadius: 8, buffMult: 0.42, cost: { wood: 90, stone: 160 } }
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
      desc: "공격 사거리 +2.4 · 범위도 넓어진다."
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
    boss: { name: "파괴자", icon: "💀", hp: 900, speed: 2.1, dmg: 70, rate: 0.7, radius: 1.4, color: 3092282, bounty: { wood: 30, stone: 30 }, scale: 2.3 }
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
    shardEvery: 3
    // n웨이브마다 수정 정수 1개 (크리스탈 25% 회복)
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
  if (w2 % 5 === 0) list.push({ type: "boss", count: Math.floor(w2 / 5) });
  return list;
}
export function enemyStats(type, wave) {
  const base = CFG.enemies[type];
  const hpMul = Math.pow(CFG.wave.hpScale, wave - 1);
  const dmgMul = Math.pow(CFG.wave.dmgScale, wave - 1);
  return {
    ...base,
    type,
    maxHp: Math.round(base.hp * hpMul),
    dmg: Math.round(base.dmg * dmgMul),
    speed: base.speed * (1 + Math.min(0.25, (wave - 1) * 0.02))
  };
}
export function waveReward(w2) {
  const r = CFG.wave.reward;
  return {
    wood: r.wood + r.perWave.wood * w2,
    stone: r.stone + r.perWave.stone * w2,
    shard: w2 % CFG.wave.shardEvery === 0 ? 1 : 0
  };
}
