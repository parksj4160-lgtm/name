export var ACHIEVEMENTS = {
  firstWin: { name: "첫 승리", icon: "🏆", desc: "10웨이브를 처음으로 막아냈다" },
  noWall: { name: "노 월", icon: "🚫", desc: "벽을 하나도 짓지 않고 5웨이브를 막아냈다" },
  noTower: { name: "맨몸 방어", icon: "✊", desc: "타워를 하나도 짓지 않고 3웨이브를 막아냈다" },
  flawlessBoss: { name: "완벽한 처치", icon: "💯", desc: "보스 웨이브 동안 크리스탈이 피해를 전혀 입지 않았다" },
  endlessRunner: { name: "엔드리스 도전자", icon: "♾️", desc: "엔드리스 모드에 처음 발을 들였다" },
  skillUser: { name: "정수의 힘", icon: "💠", desc: "정수 액티브 스킬을 처음 사용했다 (회복 제외)" },
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
  sixGuardians: { name: "육망성", icon: "🔯", desc: "한 판에서 여섯 보스(파괴자·서리 군주·침묵의 군주·갈취자·강철 수호자·정수 포식자)를 전부 처치했다 — 엔드리스로 30웨이브 이상 버텨야 한다" },
  sevenStars: { name: "북두칠성", icon: "🌠", desc: "한 판에서 일곱 보스(파괴자·서리 군주·침묵의 군주·갈취자·강철 수호자·정수 포식자·질풍 군주)를 전부 처치했다 — 엔드리스로 35웨이브 이상 버텨야 한다" },
  duoStrike: { name: "호흡 척척", icon: "🤝", desc: "협공 콤보를 10번 발동시켰다" },
  mimicHunter: { name: "정체 발각", icon: "🎭", desc: "위장한 미믹을 3마리 처치했다" },
  blockMaster: { name: "인내의 방패", icon: "🛡️", desc: "막기로 몬스터의 근접 공격을 10회 흘려냈다" },
  relicCollector: { name: "유물 수집가", icon: "🏺", desc: "보스를 처치하고 유물을 3개 모았다" },
  medic: { name: "정비병", icon: "🔧", desc: "정비소로 손상된 건물을 누적 500 이상 고쳤다" },
  hunter: { name: "사냥꾼", icon: "🍖", desc: "야생 동물을 10마리 사냥했다" },
  legendaryHunter: { name: "전설의 사냥꾼", icon: "👑", desc: "전설의 사슴왕을 처치했다" },
  gourmet: { name: "미식가", icon: "🍽️", desc: "모든 사냥감 요리를 전부 만들어봤다" },
  tamer: { name: "조련사", icon: "🐾", desc: "여우·늑대·곰·전설의 사슴왕·매 중 하나를 길들여 동료로 삼았다" },
  legendaryTamer: { name: "전설의 조련사", icon: "🦌", desc: "가장 희귀한 전설의 사슴왕을 길들여 동료로 삼았다" },
  interceptor: { name: "차단자", icon: "🕵️", desc: "정찰병을 포탈에 닿기 전에 3번 처치했다" },
  loyalCompanion: { name: "충직한 동료", icon: "🦴", desc: "길들인 동료에게 먹이를 줘서 최대 레벨까지 키웠다" },
  berserkSlayer: { name: "분노 조절사", icon: "💢", desc: "광폭 상태로 각성한 몬스터를 5마리 처치했다" },
  volcanoMaster: { name: "용암 정복자", icon: "🌋", desc: "화산지대에서 10웨이브를 막아냈다" },
  swampSurvivor: { name: "늪지 생환자", icon: "🐊", desc: "늪지대에서 10웨이브를 막아냈다" },
  frostWalker: { name: "설원 보행자", icon: "❄️", desc: "설원에서 10웨이브를 막아냈다" },
  criticalEye: { name: "치명적인 손놀림", icon: "💥", desc: "치명타를 20번 터뜨렸다" },
  perfectParry: { name: "완벽한 순간", icon: "✨", desc: "맞기 직전에 막기를 눌러 완벽한 방어를 5번 성공시켰다" },
  earlyBird: { name: "속전속결", icon: "⏩", desc: "준비 시간이 5초 넘게 남았을 때 웨이브를 조기 시작한 것을 5번 해냈다" },
  bestiaryComplete: { name: "도감 완성", icon: "📚", desc: "몬스터·보스·변종·야생 동물을 도감에 전부 기록했다" },
  allEightBosses: { name: "팔괘", icon: "☯️", desc: "한 판에서 여덟 보스(파괴자·서리 군주·침묵의 군주·갈취자·강철 수호자·정수 포식자·질풍 군주·저주의 군주)를 전부 처치했다 — 엔드리스로 40웨이브 이상 버텨야 한다" },
  allNineBosses: { name: "구주", icon: "🧭", desc: "한 판에서 아홉 보스(파괴자·서리 군주·침묵의 군주·갈취자·강철 수호자·정수 포식자·질풍 군주·저주의 군주·치유의 군주)를 전부 처치했다 — 엔드리스로 45웨이브 이상 버텨야 한다" },
  stoneBreaker: { name: "채석의 명수", icon: "🪨", desc: "돌 파수꾼을 3마리 처치했다" },
  fullyArmored: { name: "완전 무장", icon: "🛡️", desc: "판금갑옷까지 방어구를 최고 단계로 갖춰 입었다" },
  allTenBosses: { name: "십장생", icon: "🐢", desc: "한 판에서 열 보스(파괴자·서리 군주·침묵의 군주·갈취자·강철 수호자·정수 포식자·질풍 군주·저주의 군주·치유의 군주·자성 군주)를 전부 처치했다 — 엔드리스로 50웨이브 이상 버텨야 한다" },
  allElevenBosses: { name: "만신전", icon: "🏛️", desc: "한 판에서 열한 보스(파괴자·서리 군주·침묵의 군주·갈취자·강철 수호자·정수 포식자·질풍 군주·저주의 군주·치유의 군주·자성 군주·칠흑 군주)를 전부 처치했다 — 엔드리스로 55웨이브 이상 버텨야 한다" },
  allTwelveBosses: { name: "십이신장", icon: "⛩️", desc: "한 판에서 열두 보스(파괴자·서리 군주·침묵의 군주·갈취자·강철 수호자·정수 포식자·질풍 군주·저주의 군주·치유의 군주·자성 군주·칠흑 군주·속박 군주)를 전부 처치했다 — 엔드리스로 60웨이브 이상 버텨야 한다" },
  hellConqueror: { name: "지옥 정복", icon: "👹", desc: "지옥 난이도로 10웨이브를 막아냈다" },
  teamEffort: { name: "전원 참전", icon: "👥", desc: "2인 이상 멀티플레이에서 승리했고, 참가자 전원이 직접 적어도 한 마리씩 처치했다" },
  harvestKing: { name: "채집왕", icon: "🌾", desc: "한 판에서 자원(목재·광물·구리·석탄)을 1000개 이상 채집했다" },
  // 무기 하나를 최대까지 올리면 "장인의 손길", 방어구를 최고 단계까지 입으면 "완전 무장"이
  // 뜨는데, 정작 크리스탈 강화 8개 트랙 전부를 최대(5레벨)까지 올리는 것을 알아보는 업적은
  // 없었다 — 트랙 하나만 5레벨 찍는 거야 오래 버티면 자연스럽지만, 여덟 개를 동시에 전부
  // 채우려면 정수를 특정 트랙에 몰아 쓰지 않고 엔드리스로 아주 오래 버텨야 한다(정수는 웨이브
  // 클리어 전용 보상이라 더더욱). 무기·방어구 마스터리와 짝을 이루는 크리스탈 쪽 최종 업적.
  crystalAscendant: { name: "완전한 결정", icon: "💎", desc: "한 판에서 크리스탈 강화 트랙을 전부 최대 레벨까지 올렸다" },
  // 정비소로 건물을 고치면 "정비병"이 뜨는데, 치유소로 플레이어를 고치는 쪽은 짝이 없었다 —
  // 치유소를 만들면서 바로 채운 업적.
  haven: { name: "안식처", icon: "⛺", desc: "치유소로 플레이어를 누적 500 이상 회복시켰다" },
  // 생물군계(화산지대·늪지대·설원)·난이도(어려움~지옥)·타밍·장비 전부 최소 하나씩은 전용
  // 업적이 있는데, 5종 날씨(비·안개·뇌우·우박·맑음) 쪽만 하나도 없었다. bossKillsSeen과
  // 완전히 같은 "본 것만 모으면 되는" 패턴(stats.weathersSeen)이라 새 배관이 필요 없었다.
  weatherSage: { name: "천기누설", icon: "🌈", desc: "한 판에서 5종 날씨(비·안개·뇌우·우박·맑음)를 전부 겪었다" },
  // 크리스탈 강화 9트랙 완주는 "완전한 결정", 무기 강화는 "장인의 손길", 방어구는 "완전 무장"이
  // 각자 짝이 있는데, 정작 판을 넘나드는 영구 성장 축인 원정 준비(9개 퍽)만 완주 업적이 없었다.
  // 로비에서 조건이 다 채워지는 순간 바로 확인할 수 있어야 하므로(판 안이 아니라 로비 화면
  // 자체가 조건 판정 지점) firstWin·veteran과 같은 "로비/결과 화면 전용" 계열로 분류한다.
  expeditionMaster: { name: "만반의 준비", icon: "🎒", desc: "원정 준비 9개 퍽을 전부 최대 레벨까지 채웠다" },
  // 상인 물약 9종을 전수 점검하니 나머지 8개는 전부 결과를 사기 전에 정확히 알 수 있는데
  // 미스터리 상자만 유일한 도박 품목이다(꽝 40%·행운 35%·대박 25%) — 그런데 정작 상인
  // 시스템 전체를 통틀어 업적이 하나도 없었다. `_applyMysteryBox`가 대박을 뽑는 그 자리에서
  // 바로 `_unlockAchievement`를 부르면 되는, 다른 일회성 업적(flawlessBoss 등)과 같은 패턴이라
  // 새 스탯 카운터가 필요 없었다.
  jackpot: { name: "대박", icon: "🎰", desc: "떠돌이 상인의 미스터리 상자에서 대박을 뽑았다" },
  // 새로 추가한 "타워 탑승"(백틱을 눌러 근처 타워에 탑승, 화력은 오르지만 그동안 못 움직이고
  // 못 싸운다)에도 다른 새 메커닉들과 같은 짝이 있어야 한다. 완벽한 방어처럼 순간의 판정이
  // 아니라 "버틴 시간"이 핵심이라 parryCount와 같은 누적 카운터 패턴을 그대로 쓰되, 여러
  // 클라이언트가 각자 자기 탑승 시간만 추적하도록 게임 공유 `stats`(스냅샷으로 동기화돼
  // 참가자 값을 덮어쓴다)가 아니라 클라이언트별 인스턴스 필드에 둬서 멀티플레이에서도 실제로
  // 탑승한 그 사람에게만 정확히 걸리게 했다.
  towerCrewer: { name: "포탑과 한몸", icon: "🎯", desc: "타워에 탑승한 채로 누적 30초를 버텼다" },
  // 허수아비 유인목과 타워 탑승은 같은 세션에 함께 들어온 두 신규 메커닉인데도 서로 아무
  // 접점이 없었다 — 하나는 "적의 시선을 돌린다", 하나는 "화력을 몰아준다"로 방향이 반대라
  // 실제로는 잘 어울리는 조합(유인목으로 무리를 한곳에 묶어 두고 탑승한 타워로 그 자리를
  // 집중 사격)인데 그 사실을 알아차릴 계기가 없었다. 팀 스탯(`everBuiltDecoy`, everBuiltWall·
  // everBuiltTower와 완전히 같은 host-only 플래그 패턴)과 로컬 탑승 상태(`local.crewing`)를
  // 동시에 만족하는 순간 잠기게 해서, 두 낯선 기능을 한 판 안에서 실제로 같이 써 봤을 때만
  // 뜬다 — towerCrewer처럼 playerId 없이 불러 그 순간 실제로 탑승 중인 사람에게만 걸린다.
  tactician: { name: "미끼와 화력", icon: "🪢", desc: "허수아비 유인목을 지어 둔 채로 타워에 탑승했다" },
  // 열두 보스(allTwelveBosses)에 이어 열세 번째(분열 군주)까지 더한 마지막 문턱 — 분열 군주는
  // 체력이 다 떨어져도 갈라진 자식 둘을 마저 잡아야 진짜 처치로 집계되므로(bossKillsSeen은
  // 원본이 죽는 순간 이미 기록되지만, 그 전에 자식들에게 다시 밀릴 수 있어 실제로는 세 번의
  // 교전을 다 버텨야 한다), 이 achievement는 지금까지 목록 중 가장 늦게 열린다.
  allThirteenBosses: { name: "보스도감 완성", icon: "📖", desc: "한 판에서 열세 보스(파괴자·서리 군주·침묵의 군주·갈취자·강철 수호자·정수 포식자·질풍 군주·저주의 군주·치유의 군주·자성 군주·칠흑 군주·속박 군주·분열 군주)를 전부 처치했다 — 엔드리스로 65웨이브 이상 버텨야 한다" },
  // ⚠️ 위험 계약을 걸고 웨이브를 클리어하면 그 자리에서(onWaveClear) 열린다 — 위험을 "감수"하는
  // 게 아니라 "실제로 버텨낸" 순간에만 주는 보상이라, 계약만 걸고 지는 판은 카운트되지 않는다.
  gambler: { name: "도박사", icon: "🎲", desc: "⚠️ 위험 계약을 걸고 그 웨이브를 클리어했다" }
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
