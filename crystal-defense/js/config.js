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
      name: "\uBCBD",
      icon: "\u{1F9F1}",
      hotkey: "1",
      cost: { wood: 12, stone: 4 },
      hp: 260,
      blocks: true,
      desc: "\uBAAC\uC2A4\uD130\uC758 \uAE38\uC744 \uB9C9\uB294\uB2E4. \uAE38\uC774 \uC644\uC804\uD788 \uB9C9\uD788\uBA74 \uBAAC\uC2A4\uD130\uAC00 \uBCBD\uC744 \uBD80\uC21C\uB2E4.",
      levels: [
        { hp: 260 },
        { hp: 520, cost: { wood: 20, stone: 20 } },
        { hp: 980, cost: { wood: 40, stone: 55 } }
      ]
    },
    arrow: {
      name: "\uD654\uC0B4\uD0D1",
      icon: "\u{1F3F9}",
      hotkey: "2",
      cost: { wood: 35, stone: 15 },
      hp: 180,
      blocks: true,
      desc: "\uAC00\uC7A5 \uC55E\uC120 \uC801\uC744 \uBE60\uB974\uAC8C \uC800\uACA9\uD55C\uB2E4.",
      levels: [
        { hp: 180, dmg: 11, range: 13, rate: 1.15 },
        { hp: 280, dmg: 18, range: 14.5, rate: 1.35, cost: { wood: 40, stone: 30 } },
        { hp: 420, dmg: 29, range: 16, rate: 1.6, cost: { wood: 80, stone: 70 } }
      ]
    },
    frost: {
      name: "\uC11C\uB9AC\uD0D1",
      icon: "\u2744\uFE0F",
      hotkey: "3",
      cost: { wood: 25, stone: 45 },
      hp: 200,
      blocks: true,
      desc: "\uC801\uC911\uD55C \uC801\uC744 \uB290\uB9AC\uAC8C \uB9CC\uB4E0\uB2E4. \uBE60\uB978 \uBAAC\uC2A4\uD130 \uB300\uC751\uC6A9.",
      levels: [
        { hp: 200, dmg: 5, range: 10, rate: 0.9, slow: 0.45, slowTime: 1.6 },
        { hp: 320, dmg: 9, range: 11.5, rate: 1, slow: 0.55, slowTime: 2, cost: { wood: 30, stone: 55 } },
        { hp: 480, dmg: 14, range: 13, rate: 1.1, slow: 0.65, slowTime: 2.4, cost: { wood: 60, stone: 110 } }
      ]
    },
    cannon: {
      name: "\uB300\uD3EC\uD0D1",
      icon: "\u{1F4A3}",
      hotkey: "4",
      cost: { wood: 55, stone: 70 },
      hp: 240,
      blocks: true,
      desc: "\uB290\uB9AC\uC9C0\uB9CC \uBC94\uC704 \uD53C\uD574\uB97C \uC900\uB2E4. \uBB49\uCE5C \uC801\uC5D0\uAC8C \uAC15\uD558\uB2E4.",
      levels: [
        { hp: 240, dmg: 26, range: 15, rate: 0.55, splash: 3.2 },
        { hp: 380, dmg: 42, range: 16.5, rate: 0.62, splash: 3.6, cost: { wood: 60, stone: 80 } },
        { hp: 560, dmg: 66, range: 18, rate: 0.7, splash: 4.2, cost: { wood: 120, stone: 160 } }
      ]
    },
    poison: {
      name: "\uB3C5\uD0D1",
      icon: "\u2620\uFE0F",
      hotkey: "5",
      cost: { wood: 30, stone: 50 },
      hp: 190,
      blocks: true,
      desc: "\uC801\uC911\uD55C \uC801\uC5D0\uAC8C \uC9C0\uC18D \uD53C\uD574\uB97C \uB0A8\uAE34\uB2E4. \uC5EC\uB7EC \uB9C8\uB9AC\uB97C \uB3D9\uC2DC\uC5D0 \uAC09\uC544\uBA39\uAE30 \uC88B\uB2E4.",
      levels: [
        { hp: 190, dmg: 4, range: 11, rate: 0.8, poisonDps: 6, poisonTime: 3 },
        { hp: 300, dmg: 6, range: 12.5, rate: 0.9, poisonDps: 10, poisonTime: 3.5, cost: { wood: 40, stone: 70 } },
        { hp: 460, dmg: 9, range: 14, rate: 1, poisonDps: 16, poisonTime: 4, cost: { wood: 80, stone: 140 } }
      ]
    },
    support: {
      name: "\uBCF4\uB8E8",
      icon: "\u{1F531}",
      hotkey: "6",
      cost: { wood: 40, stone: 60 },
      hp: 150,
      blocks: true,
      desc: "\uC2A4\uC2A4\uB85C \uACF5\uACA9\uD558\uC9C0 \uC54A\uC9C0\uB9CC, \uC8FC\uBCC0 \uD0C0\uC6CC\uC758 \uACF5\uACA9\uB825\uC744 \uB192\uC778\uB2E4. \uD0C0\uC6CC \uBC00\uC9D1 \uC9C0\uC5ED\uC5D0 \uC138\uC6B0\uBA74 \uC88B\uB2E4.",
      levels: [
        { hp: 150, buffRadius: 6, buffMult: 0.2 },
        { hp: 220, buffRadius: 7, buffMult: 0.3, cost: { wood: 50, stone: 90 } },
        { hp: 300, buffRadius: 8, buffMult: 0.42, cost: { wood: 90, stone: 160 } }
      ]
    },
    workbench: {
      name: "\uC81C\uC791\uB300",
      icon: "\u{1FA9A}",
      hotkey: "7",
      cost: { wood: 20 },
      hp: 80,
      blocks: true,
      desc: "\uB098\uBB34\uB85C \uC9D3\uB294 \uC791\uC5C5\uB300. \uD300\uC5D0 \uD558\uB098\uB9CC \uC788\uC73C\uBA74 \uACE1\uAD2D\uC774\uB97C \uC81C\uC791\uD560 \uC218 \uC788\uB2E4.",
      levels: [
        { hp: 80 }
      ]
    }
  },
  // 제작대에서 만드는 도구. 곡괭이가 있어야 정수석을 캘 수 있다.
  craft: {
    pickaxe: { name: "\uACE1\uAD2D\uC774", cost: { wood: 15 } }
  },
  // 몬스터 종류 (일반형 / 빠른형 / 탱커형 / 원거리형 / 건물추적형 / 보스)
  enemies: {
    grunt: { name: "\uADF8\uB7F0\uD2B8", icon: "\u{1F479}", hp: 60, speed: 3, dmg: 12, rate: 1, radius: 0.6, color: 12735546, bounty: { wood: 2, stone: 1 }, scale: 1 },
    runner: { name: "\uB7EC\uB108", icon: "\u{1F3C3}", hp: 34, speed: 5.6, dmg: 7, rate: 1.6, radius: 0.48, color: 14205258, bounty: { wood: 2, stone: 1 }, scale: 0.85 },
    brute: { name: "\uBE0C\uB8E8\uD2B8", icon: "\u{1F98F}", hp: 210, speed: 1.9, dmg: 34, rate: 0.6, radius: 0.9, color: 8018896, bounty: { wood: 5, stone: 4 }, scale: 1.5 },
    // 벽에 막히지 않고 사거리 안에서 크리스탈을 저격한다 — 벽만 세우는 전략을 견제한다
    shooter: { name: "\uC8FC\uC220\uC0AC", icon: "\u{1F9D9}", hp: 45, speed: 2.4, dmg: 9, rate: 0.5, radius: 0.5, color: 3526479, bounty: { wood: 3, stone: 2 }, scale: 0.95, ranged: true, atkRange: 11 },
    // 경로상의 벽을 무시하고 가장 가까운 타워로 직행해 부순다 — 타워를 뒤에 숨기는 전략을 견제한다
    raider: { name: "\uC57D\uD0C8\uC790", icon: "\u{1FA93}", hp: 80, speed: 2.6, dmg: 10, rate: 0.8, radius: 0.55, color: 11887901, bounty: { wood: 3, stone: 2 }, scale: 1.05, seeksBuildings: true, buildingDmgMult: 1.8 },
    boss: { name: "\uD30C\uAD34\uC790", icon: "\u{1F480}", hp: 900, speed: 2.1, dmg: 70, rate: 0.7, radius: 1.4, color: 3092282, bounty: { wood: 30, stone: 30 }, scale: 2.3 }
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
