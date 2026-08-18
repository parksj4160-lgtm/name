// 게임 밸런스 상수 모음.
// "자원은 항상 부족하게 느껴져야 한다"는 원칙에 맞춰 수치를 잡았다.
// 값을 바꾸면 호스트/클라이언트 양쪽이 같은 파일을 쓰므로 자동으로 동기화된다.

export const CFG = {
  world: {
    size: 100,          // 정사각 맵 한 변 (월드 단위)
    cell: 2,            // 건설 그리드 한 칸
    buildRadius: 22,    // 크리스탈 중심에서 건설 가능한 반경
    coreRadius: 3.2,    // 크리스탈 바로 옆(건설 금지)
  },

  crystal: {
    hp: 1000,
    radius: 2.2,
    hitRange: 3.6,      // 몬스터가 크리스탈을 때리기 시작하는 거리
  },

  player: {
    speed: 7.4,
    sprint: 10.6,
    radius: 0.55,
    hp: 100,
    regen: 4,           // 초당 회복 (전투 중 2초간 정지)
    downTime: 5,        // 쓰러진 뒤 크리스탈에서 부활하기까지
    attack: { dmg: 16, range: 2.8, arc: 1.5, cd: 0.42 },
  },

  harvest: {
    range: 3.2,
    tree: { time: 1.5, yield: 6, charges: 4, respawn: 22 },
    rock: { time: 2.1, yield: 5, charges: 3, respawn: 28 },
    // 채집 속도 업그레이드 (레벨당 시간 배율)
    upgrade: [
      { mult: 1.00, cost: null },
      { mult: 0.78, cost: { wood: 60, stone: 40 } },
      { mult: 0.60, cost: { wood: 140, stone: 110 } },
      { mult: 0.45, cost: { wood: 260, stone: 220 } },
    ],
  },

  // 건설물 정의. key 는 네트워크 메시지에도 그대로 쓰인다.
  builds: {
    wall: {
      name: '벽', icon: '🧱', hotkey: '1',
      cost: { wood: 12, stone: 4 },
      hp: 260, blocks: true,
      desc: '몬스터의 길을 막는다. 길이 완전히 막히면 몬스터가 벽을 부순다.',
      levels: [
        { hp: 260 },
        { hp: 520, cost: { wood: 20, stone: 20 } },
        { hp: 980, cost: { wood: 40, stone: 55 } },
      ],
    },
    arrow: {
      name: '화살탑', icon: '🏹', hotkey: '2',
      cost: { wood: 35, stone: 15 },
      hp: 180, blocks: true,
      desc: '가장 앞선 적을 빠르게 저격한다.',
      levels: [
        { hp: 180, dmg: 11, range: 13, rate: 1.15 },
        { hp: 280, dmg: 18, range: 14.5, rate: 1.35, cost: { wood: 40, stone: 30 } },
        { hp: 420, dmg: 29, range: 16, rate: 1.6, cost: { wood: 80, stone: 70 } },
      ],
    },
    frost: {
      name: '서리탑', icon: '❄️', hotkey: '3',
      cost: { wood: 25, stone: 45 },
      hp: 200, blocks: true,
      desc: '적중한 적을 느리게 만든다. 빠른 몬스터 대응용.',
      levels: [
        { hp: 200, dmg: 5, range: 10, rate: 0.9, slow: 0.45, slowTime: 1.6 },
        { hp: 320, dmg: 9, range: 11.5, rate: 1.0, slow: 0.55, slowTime: 2.0, cost: { wood: 30, stone: 55 } },
        { hp: 480, dmg: 14, range: 13, rate: 1.1, slow: 0.65, slowTime: 2.4, cost: { wood: 60, stone: 110 } },
      ],
    },
    cannon: {
      name: '대포탑', icon: '💣', hotkey: '4',
      cost: { wood: 55, stone: 70 },
      hp: 240, blocks: true,
      desc: '느리지만 범위 피해를 준다. 뭉친 적에게 강하다.',
      levels: [
        { hp: 240, dmg: 26, range: 15, rate: 0.55, splash: 3.2 },
        { hp: 380, dmg: 42, range: 16.5, rate: 0.62, splash: 3.6, cost: { wood: 60, stone: 80 } },
        { hp: 560, dmg: 66, range: 18, rate: 0.7, splash: 4.2, cost: { wood: 120, stone: 160 } },
      ],
    },
  },

  // 몬스터 종류 (일반형 / 빠른형 / 탱커형 / 보스)
  enemies: {
    grunt:  { name: '그런트', hp: 60,  speed: 3.0, dmg: 12, rate: 1.0, radius: 0.6, color: 0xc2543a, bounty: { wood: 2, stone: 1 }, scale: 1.0 },
    runner: { name: '러너',   hp: 34,  speed: 5.6, dmg: 7,  rate: 1.6, radius: 0.48, color: 0xd8c14a, bounty: { wood: 2, stone: 1 }, scale: 0.85 },
    brute:  { name: '브루트', hp: 210, speed: 1.9, dmg: 34, rate: 0.6, radius: 0.9, color: 0x7a5bd0, bounty: { wood: 5, stone: 4 }, scale: 1.5 },
    boss:   { name: '파괴자', hp: 900, speed: 2.1, dmg: 70, rate: 0.7, radius: 1.4, color: 0x2f2f3a, bounty: { wood: 30, stone: 30 }, scale: 2.3 },
  },

  wave: {
    goal: 10,           // 승리 조건: 10웨이브 생존
    prepTime: 60,       // 웨이브 사이 준비 시간(초). 0이 되면 자동 시작
    firstPrepTime: 75,  // 첫 웨이브는 조금 더 여유
    maxAlive: 120,      // 성능 상한
    spawnGap: 0.55,     // 스폰 간격(초)
    hpScale: 1.16,      // 웨이브당 체력 배율
    dmgScale: 1.09,
    reward: { wood: 20, stone: 15, perWave: { wood: 8, stone: 6 } },
    shardEvery: 3,      // n웨이브마다 수정 정수 1개 (크리스탈 25% 회복)
  },

  net: {
    snapshotHz: 12,     // 호스트 → 클라이언트 스냅샷 주기
    inputHz: 15,        // 클라이언트 → 호스트 위치 전송 주기
  },
};

// 웨이브 구성표: 웨이브 번호 → { type, count } 목록
export function waveComposition(w) {
  const list = [];
  list.push({ type: 'grunt', count: 4 + Math.floor(w * 1.6) });
  if (w >= 2) list.push({ type: 'runner', count: 2 + Math.floor(w * 1.1) });
  if (w >= 3) list.push({ type: 'brute', count: Math.floor((w - 1) / 2) + 1 });
  if (w % 5 === 0) list.push({ type: 'boss', count: Math.floor(w / 5) });
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
    speed: base.speed * (1 + Math.min(0.25, (wave - 1) * 0.02)),
  };
}

export function waveReward(w) {
  const r = CFG.wave.reward;
  return {
    wood: r.wood + r.perWave.wood * w,
    stone: r.stone + r.perWave.stone * w,
    shard: w % CFG.wave.shardEvery === 0 ? 1 : 0,
  };
}
