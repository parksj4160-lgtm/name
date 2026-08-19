const CONFIG = {
  // Game Constants
  GAME_WIDTH: window.innerWidth,
  GAME_HEIGHT: window.innerHeight,
  MAX_WAVES: 20,
  CRYSTAL_START_HP: 10000,
  SPAWN_DISTANCE: 300,

  // Player
  PLAYER: {
    MOVE_SPEED: 150,
    SIZE: 20,
    ATTACK_RANGE: 80,
    ATTACK_DAMAGE: 10,
    ATTACK_COOLDOWN: 0.5,
    MAX_HP: 100,
  },

  // Enemy Types
  ENEMIES: {
    GRUNT: {
      name: '잡졸',
      hp: 20,
      damage: 5,
      speed: 80,
      essence_reward: 10,
      size: 15,
      spawn_rate: 0.6,
    },
    RUNNER: {
      name: '주자',
      hp: 15,
      damage: 8,
      speed: 120,
      essence_reward: 15,
      size: 12,
      spawn_rate: 0.2,
    },
    TANK: {
      name: '보병',
      hp: 50,
      damage: 10,
      speed: 60,
      essence_reward: 25,
      size: 25,
      spawn_rate: 0.15,
    },
    BOSS: {
      name: '보스',
      hp: 200,
      damage: 20,
      speed: 100,
      essence_reward: 100,
      size: 40,
      spawn_rate: 0.05,
    },
  },

  // Wave Scaling
  WAVE: {
    SPAWN_MULTIPLIER: 1.2,
    HP_MULTIPLIER: 1.15,
    DAMAGE_MULTIPLIER: 1.1,
    SPEED_MULTIPLIER: 1.05,
    PREP_TIME: 60,
  },

  // Shop Items
  SHOP_ITEMS: [
    {
      id: 'max_hp_boost',
      name: '최대 체력 +20',
      effect: '최대 체력이 20 증가합니다',
      cost: 30,
      type: 'hp_boost',
      value: 20,
    },
    {
      id: 'damage_boost',
      name: '공격력 +5',
      effect: '공격 데미지가 5 증가합니다',
      cost: 40,
      type: 'damage_boost',
      value: 5,
    },
    {
      id: 'speed_boost',
      name: '이동 속도 +30',
      effect: '이동 속도가 30 증가합니다',
      cost: 35,
      type: 'speed_boost',
      value: 30,
    },
    {
      id: 'regen',
      name: '회복 +1/s',
      effect: '초당 1의 체력을 회복합니다',
      cost: 50,
      type: 'regen',
      value: 1,
    },
    {
      id: 'essence_multiplier',
      name: '정수 수집 +50%',
      effect: '받는 정수가 50% 증가합니다',
      cost: 60,
      type: 'essence_multiplier',
      value: 1.5,
    },
  ],

  // Level Up Upgrades
  LEVELUP_UPGRADES: [
    {
      name: '체력 회복',
      effect: '현재 체력을 100% 회복합니다',
      type: 'heal_full',
    },
    {
      name: '체력 최대치 +50',
      effect: '최대 체력이 50 증가합니다',
      type: 'max_hp',
      value: 50,
    },
    {
      name: '공격력 +10',
      effect: '공격 데미지가 10 증가합니다',
      type: 'damage',
      value: 10,
    },
    {
      name: '이동 속도 +50',
      effect: '이동 속도가 50 증가합니다',
      type: 'speed',
      value: 50,
    },
    {
      name: '공격 범위 +20',
      effect: '공격 범위가 20 증가합니다',
      type: 'attack_range',
      value: 20,
    },
    {
      name: '공격 속도 +20%',
      effect: '공격 사이 시간이 20% 감소합니다',
      type: 'attack_speed',
      value: 0.8,
    },
  ],

  // Wave Upgrades (선택할 때마다 다름)
  WAVE_UPGRADES: [
    {
      name: '수정 회복 +500',
      effect: '수정의 체력이 500 회복됩니다',
      type: 'crystal_heal',
      value: 500,
    },
    {
      name: '수정 최대치 +1000',
      effect: '수정의 최대 체력이 1000 증가합니다',
      type: 'crystal_max_hp',
      value: 1000,
    },
    {
      name: '정수 보너스 +100',
      effect: '이번 파동에서 받는 정수가 100 증가합니다',
      type: 'essence_bonus',
      value: 100,
    },
    {
      name: '방어막',
      effect: '다음 3초간 받는 데미지가 50% 감소합니다',
      type: 'shield',
      duration: 3,
      reduction: 0.5,
    },
  ],
};

Object.freeze(CONFIG);
