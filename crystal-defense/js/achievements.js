export var ACHIEVEMENTS = {
  firstWin: { name: "첫 승리", icon: "🏆", desc: "10웨이브를 처음으로 막아냈다" },
  noWall: { name: "노 월", icon: "🚫", desc: "벽을 하나도 짓지 않고 5웨이브를 막아냈다" },
  noTower: { name: "맨몸 방어", icon: "✊", desc: "타워를 하나도 짓지 않고 3웨이브를 막아냈다" },
  flawlessBoss: { name: "완벽한 처치", icon: "💯", desc: "보스 웨이브 동안 크리스탈이 피해를 전혀 입지 않았다" },
  endlessRunner: { name: "엔드리스 도전자", icon: "♾️", desc: "엔드리스 모드에 처음 발을 들였다" },
  skillUser: { name: "정수의 힘", icon: "💠", desc: "정수 액티브 스킬(폭발·시간 왜곡·방벽)을 처음 사용했다" },
  veteran: { name: "백전노장", icon: "🎖️", desc: "10판을 플레이했다" },
  bothBosses: { name: "쌍둥이 처치", icon: "⚔️", desc: "한 판에서 파괴자와 서리 군주를 둘 다 처치했다" },
  allBosses: { name: "삼위일체", icon: "👑", desc: "한 판에서 파괴자·서리 군주·침묵의 군주를 전부 처치했다" },
  trapMaster: { name: "덫사냥꾼", icon: "🪤", desc: "한 판에서 함정을 3번 이상 발동시켰다" },
  ironWill: { name: "강철 의지", icon: "🔩", desc: "어려움 난이도로 10웨이브를 막아냈다" },
  eliteHunter: { name: "정예 사냥꾼", icon: "⭐", desc: "정예 몬스터를 5마리 처치했다" },
  weaponMaster: { name: "장인의 손길", icon: "🛠️", desc: "무기 하나를 최대 레벨까지 강화했다" },
  treasureHunter: { name: "보물 사냥꾼", icon: "🦀", desc: "보물게를 5마리 잡았다" },
  nightmareConqueror: { name: "악몽 정복", icon: "😱", desc: "악몽 난이도로 10웨이브를 막아냈다" },
  fourKings: { name: "사천왕", icon: "🐉", desc: "한 판에서 네 보스(파괴자·서리 군주·침묵의 군주·갈취자)를 전부 처치했다" },
  fiveGuardians: { name: "오방신장", icon: "🌟", desc: "한 판에서 다섯 보스(파괴자·서리 군주·침묵의 군주·갈취자·강철 수호자)를 전부 처치했다" },
  duoStrike: { name: "호흡 척척", icon: "🤝", desc: "협공 콤보를 10번 발동시켰다" },
  mimicHunter: { name: "정체 발각", icon: "🎭", desc: "위장한 미믹을 3마리 처치했다" },
  blockMaster: { name: "인내의 방패", icon: "🛡️", desc: "막기로 몬스터의 근접 공격을 10회 흘려냈다" },
  relicCollector: { name: "유물 수집가", icon: "🏺", desc: "보스를 처치하고 유물을 3개 모았다" },
  medic: { name: "정비병", icon: "🔧", desc: "정비소로 손상된 건물을 누적 500 이상 고쳤다" },
  hunter: { name: "사냥꾼", icon: "🍖", desc: "야생 동물을 10마리 사냥했다" },
  gourmet: { name: "미식가", icon: "🍽️", desc: "다섯 가지 사냥감 요리를 전부 만들어봤다" },
  tamer: { name: "조련사", icon: "🐾", desc: "여우나 늑대를 길들여 동료로 삼았다" },
  interceptor: { name: "차단자", icon: "🕵️", desc: "정찰병을 포탈에 닿기 전에 3번 처치했다" },
  loyalCompanion: { name: "충직한 동료", icon: "🦴", desc: "길들인 동료에게 먹이를 줘서 최대 레벨까지 키웠다" }
};
var STORE_KEY = "cd.achievements";
export function loadUnlocked() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
  } catch {
    return {};
  }
}
export function unlock(key) {
  if (!ACHIEVEMENTS[key]) return false;
  const u2 = loadUnlocked();
  if (u2[key]) return false;
  u2[key] = true;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(u2));
  } catch {
  }
  return true;
}
