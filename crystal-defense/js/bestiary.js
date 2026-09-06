var STORE_KEY4 = "cd.bestiary";
export var BESTIARY_CATS = {
  enemy: "몬스터",
  boss: "보스",
  variant: "변종",
  wild: "야생 동물"
};
export var BESTIARY_INFO = {
  // ── 일반 몬스터 ──
  grunt: { cat: "enemy", desc: "가장 흔한 표준형 — 특별한 능력은 없다." },
  runner: { cat: "enemy", desc: "빠르지만 체력이 낮다. 물량으로 밀어붙인다." },
  brute: { cat: "enemy", desc: "느리지만 체력이 높고 한 방이 아프다." },
  shooter: { cat: "enemy", desc: "벽에 막히지 않고 사거리 안에서 크리스탈을 직접 저격한다." },
  raider: { cat: "enemy", desc: "벽을 무시하고 가장 가까운 타워로 직행해 부순다." },
  raccoon: { cat: "enemy", desc: "채집 노드로 달려가 자원을 훔친다 — 죽이면 훔친 만큼 그대로 돌려받는다." },
  flyer: { cat: "enemy", desc: "벽과 함정을 무시하고 크리스탈로 직선 비행한다 — 체력은 낮다." },
  healer: { cat: "enemy", desc: "주기적으로 주변 아군을 회복시킨다 — 먼저 끊지 않으면 무리 전체가 안 죽는다." },
  bomber: { cat: "enemy", desc: "죽는 순간 주변에 폭발 피해를 남긴다 — 근접으로 마무리하면 같이 맞는다." },
  burrower: { cat: "enemy", desc: "땅속에서 벽과 타워를 무시하고 크리스탈로 직진한다." },
  commander: { cat: "enemy", desc: "주기적으로 진군의 함성을 울려 주변 무리를 잠깐 빠르게 만든다." },
  mimic: { cat: "enemy", desc: "나무·바위로 위장하고 있다가 캐는 순간 튀어나온다." },
  scout: { cat: "enemy", desc: "준비 시간에 나타나 포탈로 도망친다 — 놓치면 다음 웨이브가 강해진다." },
  // ── 보스 (등장 순서) ──
  boss: { cat: "boss", desc: "첫 번째 보스. 체력이 깎일 때마다 방패 변종 잡졸을 소환한다." },
  frostlord: { cat: "boss", desc: "두 번째 보스. 소환하는 잡졸이 전부 방패 변종이다." },
  warden: { cat: "boss", desc: "세 번째 보스. 발밑에 침묵 장판을 깔아 반경 안 타워를 전부 멈춘다." },
  looter: { cat: "boss", desc: "네 번째 보스. 팀 자원을 훔쳐 그 절반만큼 체력을 회복한다." },
  colossus: { cat: "boss", desc: "다섯 번째 보스. 체력 문턱마다 자기 몸에 방벽을 둘러 받는 피해를 크게 줄인다." },
  wraith: { cat: "boss", desc: "여섯 번째 보스. 팀 정수를 훔친 만큼 체력을 회복한다 — 정수가 없으면 회복도 없다." },
  galelord: { cat: "boss", desc: "일곱 번째 보스. 체력 문턱마다 크리스탈 코앞으로 순간이동한다." },
  curselord: { cat: "boss", desc: "여덟 번째 보스. 위치와 무관하게 방어선 어딘가의 타워 하나를 무작위로 저주해 잠시 멈춘다." },
  grovelord: { cat: "boss", desc: "아홉 번째 보스. 체력이 깎일 때마다 잡졸을 소환하고, 상시로 주변 아군 전체를 서서히 회복시킨다." },
  magnetlord: { cat: "boss", desc: "열 번째 보스. 체력이 깎일 때마다 인력을 터뜨려 반경 안 플레이어 전원을 자기 쪽으로 끌어당긴다." },
  shadowlord: { cat: "boss", desc: "열한 번째 보스. 체력이 깎일 때마다 어둠을 터뜨려 반경 안 플레이어의 미니맵에서 잠시 몬스터가 안 보이게 만든다." },
  // ── 변종 (몬스터에 붙는 접두사) ──
  shield: { cat: "variant", desc: "정면 피해가 크게 줄어든다 — 등 뒤로 돌아가서 쳐야 한다." },
  split: { cat: "variant", desc: "죽으면 그 자리에서 약한 개체 2마리로 갈라진다." },
  dash: { cat: "variant", desc: "주기적으로 짧게 폭발적으로 가속한다." },
  regen: { cat: "variant", desc: "잠시라도 안 맞으면 체력이 도로 차오른다 — 끝까지 몰아쳐야 한다." },
  ward: { cat: "variant", desc: "타워가 조준하지 못한다 — 직접 달려가서 처치해야 한다." },
  thorn: { cat: "variant", desc: "근접으로 때리면 그 피해 일부를 반사로 되돌려 받는다." },
  vampire: { cat: "variant", desc: "무엇을 때리든 그 피해 일부를 자기 체력으로 되돌린다." },
  resist: { cat: "variant", desc: "둔화·속박·중독을 전부 무시한다 — 순수 대미지로 밀어붙여야 한다." },
  berserk: { cat: "variant", desc: "체력이 절반 밑으로 떨어지는 순간 갑자기 빨라지고 강해진다." },
  armored: { cat: "variant", desc: "타워 공격이 크게 약해진다 — 근접·활·정수 스킬로 직접 잡아야 한다." },
  phantom: { cat: "variant", desc: "직접 조준한 근접·활·폭탄가방 공격이 크게 약해진다 — 타워·정수 스킬로 잡아야 한다." },
  // ── 야생 동물 (준비 시간에만 등장) ──
  rabbit: { cat: "wild", desc: "가장 흔한 사냥감 — 도망만 친다." },
  deer: { cat: "wild", desc: "토끼보다 체력이 높은 사냥감 — 역시 도망만 친다." },
  boar: { cat: "wild", desc: "도망치지 않는다 — 때리면 오히려 달려들어 반격한다." },
  fox: { cat: "wild", desc: "가장 빠르고 도망 반경도 가장 길어서 잡기 어렵다 — 대신 체력은 낮다. 길들일 수 있다." },
  wolf: { cat: "wild", desc: "먼저 건드리지 않아도 가까이 가면 스스로 쫓아온다 — 무장 없이 방심하면 위험하다. 길들일 수 있다." },
  bear: { cat: "wild", desc: "가장 늦게(6웨이브부터) 나타나는 맹수 — 반격이 늑대보다도 아프다. 길들일 수 있다." },
  stagking: { cat: "wild", desc: "가장 희귀한 사냥감(9웨이브부터) — 여우처럼 도망치다가도 맞히면 곰보다 세게 반격한다." },
  treasure: { cat: "wild", desc: "전투 중 독립적으로 나타나는 보물게 — 공격은 안 하고 도망만 다닌다. 놓치면 사라진다." },
  golem: { cat: "wild", desc: "가장 드물게 나타나는 만남 — 움직이지 못하지만 건드리면 가장 세게 반격한다. 쓰러뜨리면 목재·광물을 두둑이 얻는다." }
};
export function loadBestiarySeen() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY4) || "{}");
  } catch {
    return {};
  }
}
export function markBestiarySeen(key) {
  if (!BESTIARY_INFO[key]) return false;
  const seen = loadBestiarySeen();
  if (seen[key]) return false;
  seen[key] = true;
  try {
    localStorage.setItem(STORE_KEY4, JSON.stringify(seen));
  } catch {
  }
  return true;
}
