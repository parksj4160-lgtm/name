// 논리 해상도(가로 고정) - 실제 화면 크기에 맞춰 CSS에서 letterbox 스케일링됨
const LOGICAL_W = 1280;
const LOGICAL_H = 720;
const GROUND_Y = 566;

const INTERACT_RANGE = 120;
const MELEE_RANGE = 104;

const GRAVITY = 2300;
const JUMP_FORCE = -730;

// 공격 모션 타이밍 (초)
const ATTACK_DURATION = 0.36;   // 전체 모션 길이
const ATTACK_HIT_AT = 0.14;     // 실제 타격 판정이 들어가는 시점
const ATTACK_COOLDOWN = 0.42;

const PARTY_MAX = 4;            // 본인 포함 최대 인원
const MAX_PROTOTYPE_FLOOR = 3;

// 색 팔레트 (디자인 톤을 한 곳에서 관리)
const PAL = {
  heroSkin: '#f7d0ae',
  heroHair: '#3a2b46',
  heroTunic: '#3f7fe0',
  heroTunicDark: '#2b5cae',
  heroPants: '#2d3350',
  heroCape: '#ffcf5c',
  heroTrim: '#ffe9a8',

  allySkin: '#f4c9a4',
  allyHair: '#2f3b2c',
  allyTunic: '#4bc07a',
  allyTunicDark: '#2f8f57',
  allyPants: '#28402f',
  allyCape: '#bff5d2',
  allyTrim: '#dffce9',

  npcSkin: '#e8c6a6',
  npcHair: '#4a4550',
  npcTunic: '#9aa0b8',
  npcTunicDark: '#767c96',
  npcPants: '#4c5168',
  npcCape: null,
  npcTrim: '#c7cbdc',
};

// 캐릭터 팔레트 프리셋
const CHAR_PALETTES = {
  hero: {
    skin: PAL.heroSkin, hair: PAL.heroHair, tunic: PAL.heroTunic,
    tunicDark: PAL.heroTunicDark, pants: PAL.heroPants, cape: PAL.heroCape, trim: PAL.heroTrim,
  },
  ally: {
    skin: PAL.allySkin, hair: PAL.allyHair, tunic: PAL.allyTunic,
    tunicDark: PAL.allyTunicDark, pants: PAL.allyPants, cape: PAL.allyCape, trim: PAL.allyTrim,
  },
  npc: {
    skin: PAL.npcSkin, hair: PAL.npcHair, tunic: PAL.npcTunic,
    tunicDark: PAL.npcTunicDark, pants: PAL.npcPants, cape: null, trim: PAL.npcTrim,
  },
};
