import * as THREE from '../vendor/three.module.js';
import { CFG } from './config.js';
import { COST_KEYS, canAfford, dist } from './utils.js';

var GEO2 = {
  // 벽은 정육면체 하나였다 — 가장 많이 짓는 건물인데 회색 판지 상자처럼 보였다. 기단 → 아래단 →
  // 위단(조금 좁게) → 갓돌로 쌓아 올리면 폴리곤 몇 개만 더 쓰고도 "석벽"으로 읽힌다.
  wallFoot: new THREE.BoxGeometry(2, 0.26, 2),
  wall: new THREE.BoxGeometry(1.9, 1, 1.9),
  wallUpper: new THREE.BoxGeometry(1.72, 0.85, 1.72),
  wallCap: new THREE.BoxGeometry(1.96, 0.2, 1.96),
  wallMerlon: new THREE.BoxGeometry(0.44, 0.34, 0.44),
  base: new THREE.CylinderGeometry(0.9, 1, 0.7, 8),
  pillar: new THREE.CylinderGeometry(0.42, 0.5, 1.9, 8),
  headArrow: new THREE.ConeGeometry(0.55, 1.1, 7),
  headFrost: new THREE.OctahedronGeometry(0.62, 0),
  headCannon: new THREE.BoxGeometry(0.9, 0.7, 1.5),
  headPoison: new THREE.OctahedronGeometry(0.58, 0),
  headSupport: new THREE.ConeGeometry(0.5, 0.9, 4),
  supportRing: new THREE.TorusGeometry(1, 0.05, 6, 20),
  barrel: new THREE.CylinderGeometry(0.22, 0.26, 1.4, 8),
  bar: new THREE.PlaneGeometry(1.5, 0.16),
  buffRing: new THREE.RingGeometry(1.05, 1.25, 24),
  trapBase: new THREE.CylinderGeometry(0.85, 0.85, 0.12, 8),
  trapSpike: new THREE.ConeGeometry(0.1, 0.38, 4),
  gatePost: new THREE.BoxGeometry(0.42, 2.3, 1.88),
  gateLintel: new THREE.BoxGeometry(1.88, 0.3, 1.88),
  watchPillar: new THREE.CylinderGeometry(0.3, 0.42, 3.2, 8),
  watchEye: new THREE.OctahedronGeometry(0.4, 0),
  watchRing: new THREE.TorusGeometry(0.58, 0.05, 6, 16),
  harvesterPost: new THREE.CylinderGeometry(0.12, 0.14, 1.5, 6),
  harvesterWheel: new THREE.TorusGeometry(0.55, 0.09, 8, 16),
  harvesterSpoke: new THREE.BoxGeometry(0.06, 1, 0.06),
  harvesterBasket: new THREE.CylinderGeometry(0.32, 0.24, 0.4, 8),
  repairCrossV: new THREE.BoxGeometry(0.24, 0.74, 0.24),
  repairCrossH: new THREE.BoxGeometry(0.74, 0.24, 0.24),
  sniperBarrel: new THREE.CylinderGeometry(0.13, 0.17, 2.3, 8),
  sniperScope: new THREE.CylinderGeometry(0.12, 0.12, 0.6, 10),
  armoryCrate: new THREE.BoxGeometry(0.62, 0.5, 0.62)
};
var MAT2 = {
  wall: [
    new THREE.MeshStandardMaterial({ color: 9080729, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 10465476, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 14207373, roughness: 0.6, metalness: 0.3 })
  ],
  // 기단·갓돌용 어두운 돌 — 본체와 명도를 갈라야 층이 쌓인 것으로 읽힌다
  wallDark: new THREE.MeshStandardMaterial({ color: 5723731, roughness: 0.95 }),
  base: new THREE.MeshStandardMaterial({ color: 7171962, roughness: 0.9 }),
  arrow: new THREE.MeshStandardMaterial({ color: 13148506, roughness: 0.6, metalness: 0.2 }),
  frost: new THREE.MeshStandardMaterial({ color: 7329023, emissive: 2787e3, emissiveIntensity: 0.7, roughness: 0.3 }),
  cannon: new THREE.MeshStandardMaterial({ color: 5001568, roughness: 0.5, metalness: 0.5 }),
  poison: new THREE.MeshStandardMaterial({ color: 3526479, emissive: 1871706, emissiveIntensity: 0.7, roughness: 0.4 }),
  support: new THREE.MeshStandardMaterial({ color: 14061311, emissive: 6959264, emissiveIntensity: 0.8, roughness: 0.35 }),
  snare: new THREE.MeshStandardMaterial({ color: 13215862, roughness: 0.8, metalness: 0.1 }),
  workbenchTop: new THREE.MeshStandardMaterial({ color: 12159565, roughness: 0.8 }),
  workbenchLeg: new THREE.MeshStandardMaterial({ color: 5979940, roughness: 0.9 }),
  workbenchTool: new THREE.MeshStandardMaterial({ color: 10137781, roughness: 0.5, metalness: 0.4 }),
  furnaceBody: new THREE.MeshStandardMaterial({ color: 5723991, roughness: 0.9 }),
  furnaceFire: new THREE.MeshStandardMaterial({ color: 16750899, emissive: 15693600, emissiveIntensity: 1.4, roughness: 0.4 }),
  trapBase: new THREE.MeshStandardMaterial({ color: 4863530, roughness: 0.85, metalness: 0.3 }),
  trapSpike: new THREE.MeshStandardMaterial({ color: 14238251, roughness: 0.4, metalness: 0.6 }),
  // 수렁 함정 — 기존 함정과 같은 형태(원판+가시)를 그대로 쓰되, 색만 늪 진흙과 뿌리(root
  // 상태이상 연출이 쓰는 것과 같은 계열의 색)로 갈아서 한눈에 다른 종류임을 구분한다.
  mireBase: new THREE.MeshStandardMaterial({ color: 4873530, roughness: 0.95, metalness: 0.05 }),
  mireSpike: new THREE.MeshStandardMaterial({ color: 13215862, roughness: 0.7, metalness: 0.1 }),
  // 폭발 함정 — 같은 원판+가시 형태를 재사용하되, 화로 불꽃(furnaceFire)과 같은 계열의
  // 발광 주황색으로 갈아서 "밟으면 범위 피해"라는 성격을 색으로도 드러낸다.
  blastBase: new THREE.MeshStandardMaterial({ color: 3226938, roughness: 0.8, metalness: 0.2 }),
  blastSpike: new THREE.MeshStandardMaterial({ color: 16750899, emissive: 12545792, emissiveIntensity: 1.1, roughness: 0.4 }),
  gateLintel: new THREE.MeshStandardMaterial({ color: 13211199, roughness: 0.6, metalness: 0.25 }),
  watchtower: new THREE.MeshStandardMaterial({ color: 16764245, emissive: 12886835, emissiveIntensity: 1, roughness: 0.3 }),
  harvesterPost: new THREE.MeshStandardMaterial({ color: 6971297, roughness: 0.9 }),
  harvesterWheel: new THREE.MeshStandardMaterial({ color: 10309763, roughness: 0.7, metalness: 0.15 }),
  harvesterBasket: new THREE.MeshStandardMaterial({ color: 12159565, roughness: 0.8 }),
  repairpost: new THREE.MeshStandardMaterial({ color: 6274976, emissive: 2790492, emissiveIntensity: 0.85, roughness: 0.35 }),
  campCanvas: new THREE.MeshStandardMaterial({ color: 13207101, roughness: 0.85 }),
  campGlow: new THREE.MeshStandardMaterial({ color: 16759111, emissive: 16746522, emissiveIntensity: 1.3, roughness: 0.3 }),
  sniper: new THREE.MeshStandardMaterial({ color: 3817291, roughness: 0.35, metalness: 0.75 }),
  sniperScope: new THREE.MeshStandardMaterial({ color: 16726843, emissive: 16720418, emissiveIntensity: 0.9, roughness: 0.3 }),
  armoryCrate: new THREE.MeshStandardMaterial({ color: 11760670, roughness: 0.75, metalness: 0.15 }),
  armoryBelt: new THREE.MeshStandardMaterial({ color: 12759680, emissive: 8859136, emissiveIntensity: 0.7, roughness: 0.4 }),
  ghostOk: new THREE.MeshStandardMaterial({ color: 5570463, transparent: true, opacity: 0.45, emissive: 2002770, emissiveIntensity: 0.6 }),
  ghostBad: new THREE.MeshStandardMaterial({ color: 16734826, transparent: true, opacity: 0.4, emissive: 9379372, emissiveIntensity: 0.6 }),
  barBg: new THREE.MeshBasicMaterial({ color: 1119519, transparent: true, opacity: 0.8, depthTest: false }),
  barFg: new THREE.MeshBasicMaterial({ color: 6745736, depthTest: false }),
  rangeRing: new THREE.MeshBasicMaterial({ color: 14061311, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
  outpostPole: new THREE.MeshStandardMaterial({ color: 9136964, roughness: 0.85 }),
  outpostFlag: new THREE.MeshStandardMaterial({ color: 15229002, roughness: 0.7, side: THREE.DoubleSide, emissive: 3804678, emissiveIntensity: 0.25 }),
  outpostBase: new THREE.MeshStandardMaterial({ color: 8028296, roughness: 0.95 }),
  outpostZone: new THREE.MeshBasicMaterial({ color: 15229002, transparent: true, opacity: 0.42, side: THREE.DoubleSide }),
  buffRing: new THREE.MeshBasicMaterial({ color: 14061311, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
  decoyPost: new THREE.MeshStandardMaterial({ color: 9136964, roughness: 0.9 }),
  decoyStraw: new THREE.MeshStandardMaterial({ color: 14267484, roughness: 1 }),
  decoyCloth: new THREE.MeshStandardMaterial({ color: 11552314, roughness: 0.8 }),
  decoyZone: new THREE.MeshBasicMaterial({ color: 16763989, transparent: true, opacity: 0.16, side: THREE.DoubleSide }),
  beaconStone: new THREE.MeshStandardMaterial({ color: 6710950, roughness: 0.95 }),
  beaconBasket: new THREE.MeshStandardMaterial({ color: 2565927, roughness: 0.6, metalness: 0.3 }),
  beaconFlame: new THREE.MeshStandardMaterial({ color: 16738816, emissive: 16729088, emissiveIntensity: 1.3, roughness: 0.4 }),
  beaconZone: new THREE.MeshBasicMaterial({ color: 16729088, transparent: true, opacity: 0.15, side: THREE.DoubleSide })
};
function barLayer(bg, fg) {
  bg.renderOrder = 5;
  fg.material.transparent = true;
  fg.renderOrder = 6;
}
var RANGE_RING_GEO = new THREE.RingGeometry(0.96, 1, 40);
var PROJECTILE_COLOR = { arrow: 16769162, frost: 8382719, cannon: 16751178, poison: 3526479, snare: 13215862, lightning: 16769126, sniper: 16726843 };
var PRIORITY_RING_COLOR = { nearest: 5024991, strongest: 16733525, weakest: 8443136 };
var nextId = 1;
function resetBuildingIds() {
  nextId = 1;
}
var Building = class {
  constructor(key, gx, gz, x2, z2, ownerId, id) {
    const def = CFG.builds[key];
    this.id = id || nextId++;
    this.key = key;
    this.def = def;
    this.gx = gx;
    this.gz = gz;
    this.x = x2;
    this.z = z2;
    this.level = 1;
    this.spec = null;
    this.ownerId = ownerId;
    this.targetPriority = def.targetMode === "highestHp" ? "strongest" : "threat";
    this.maxHp = def.levels[0].hp;
    this.hp = this.maxHp;
    this.cooldown = 0;
    this.ammo = this.magazine;
    this.mesh = buildMesh(key, 1);
    this.mesh.position.set(x2, 0, z2);
    this.mesh.userData.building = this;
    this._makeBar();
  }
  // 이 타워가 쓰는 탄약 종류 (안 쓰는 건물이면 null)
  get ammoType() {
    return CFG.ammo.towers[this.key] || null;
  }
  get magazine() {
    return this.ammoType ? this.def.levels[this.level - 1].mag || 0 : 0;
  }
  get ammoEmpty() {
    return !!this.ammoType && this.ammo <= 0;
  }
  // 특화를 고른 타워는 레벨 스탯에 배율·추가 속성을 얹은 값을 쓴다. 매 프레임 조준·사격에서
  // 읽히므로 레벨·특화가 바뀔 때만 다시 만들고 그 뒤로는 캐시를 돌려준다.
  get stats() {
    const base = this.def.levels[this.level - 1];
    if (!this.spec) return base;
    const sp2 = CFG.towerSpec[this.key]?.[this.spec];
    if (!sp2) return base;
    const ck = `${this.level}|${this.spec}`;
    if (this._specKey === ck) return this._specStats;
    const out = { ...base };
    for (const [k2, m] of Object.entries(sp2.mods || {})) {
      if (typeof out[k2] === "number") out[k2] = out[k2] * m;
    }
    for (const [k2, v] of Object.entries(sp2.add || {})) out[k2] = v;
    if (out.dmg) out.dmg = Math.round(out.dmg);
    if (out.slow) out.slow = Math.min(0.85, out.slow);
    this._specKey = ck;
    this._specStats = out;
    return out;
  }
  // 최대 레벨에 도달한 전투 타워, 그리고(공격은 안 해도) 보루도 — 나머지 모든 타워가 이미
  // 특화로 "같은 건물을 다르게" 쓸 수 있는데 보루만 빠져 있었다. isSupport엔 레거시 감시탑도
  // 섞여 있지만 CFG.towerSpec에 항목을 안 넣을 것이므로 실질적으로 보루에만 열린다.
  get canSpecialize() {
    return (this.isTower || this.isSupport) && !this.spec && this.level >= this.def.levels.length && !!CFG.towerSpec[this.key];
  }
  get specDef() {
    return this.spec ? CFG.towerSpec[this.key]?.[this.spec] || null : null;
  }
  get isSupport() {
    return this.key === "support" || this.key === "watchtower";
  }
  get isWorkbench() {
    return this.key === "workbench";
  }
  get isHarvester() {
    return this.key === "harvester";
  }
  get isRepairPost() {
    return this.key === "repairpost";
  }
  get isHealCamp() {
    return this.key === "camp";
  }
  get isArmory() {
    return this.key === "armory";
  }
  get isOutpost() {
    return this.key === "outpost";
  }
  get isDecoy() {
    return this.key === "decoy";
  }
  get isBeacon() {
    return this.key === "beacon";
  }
  // 다가가서 클릭하면 작업창이 열리는 시설이면 그 종류("craft"/"smelt")
  get stationKind() {
    return this.def.station || null;
  }
  get isTrap() {
    return this.key === "trap" || this.key === "mire" || this.key === "blast";
  }
  get isTower() {
    return this.key !== "wall" && this.key !== "gate" && !this.isTrap && !this.isSupport && !this.isHarvester && !this.isRepairPost && !this.isHealCamp && !this.isArmory && !this.isOutpost && !this.isDecoy && !this.isBeacon && !this.stationKind;
  }
  get nextCost() {
    const nxt = this.def.levels[this.level];
    return nxt ? nxt.cost : null;
  }
  _makeBar() {
    const g2 = new THREE.Group();
    const bg = new THREE.Mesh(GEO2.bar, MAT2.barBg);
    const fg = new THREE.Mesh(GEO2.bar, MAT2.barFg.clone());
    fg.position.z = 0.01;
    barLayer(bg, fg);
    g2.add(bg, fg);
    g2.position.y = this.key === "wall" || this.key === "gate" ? 2.7 : this.key === "workbench" ? 1.6 : this.isTrap ? 0.7 : this.key === "harvester" ? 1.9 : this.key === "outpost" ? 3.2 : this.isDecoy ? 2.5 : this.isBeacon ? 2.6 : 3.4;
    g2.visible = false;
    g2.renderOrder = 5;
    this.mesh.add(g2);
    this.bar = g2;
    this.barFg = fg;
    if (this.ammoType) {
      const a2 = new THREE.Group();
      const abg = new THREE.Mesh(GEO2.bar, MAT2.barBg);
      const afg = new THREE.Mesh(GEO2.bar, MAT2.barFg.clone());
      afg.position.z = 0.01;
      barLayer(abg, afg);
      a2.add(abg, afg);
      a2.scale.y = 0.55;
      a2.position.copy(g2.position);
      a2.position.y -= 0.26;
      a2.renderOrder = 5;
      this.mesh.add(a2);
      this.ammoBar = a2;
      this.ammoBarFg = afg;
      this.refreshAmmoBar();
    }
  }
  refreshAmmoBar() {
    if (!this.ammoBar) return;
    const max = this.magazine || 1;
    const r = Math.max(0, Math.min(1, this.ammo / max));
    this.ammoBar.visible = true;
    this.ammoBarFg.scale.x = Math.max(1e-3, r);
    this.ammoBarFg.position.x = -(1 - r) * 0.75;
    this.ammoBarFg.material.color.setHex(r <= 0 ? 16734826 : r < 0.25 ? 16763989 : CFG.ammo.types[this.ammoType].color);
  }
  // 보루 버프를 받는 동안 발치에 보라색 고리를 띄운다. 세기에 따라 밝기가 달라진다.
  showBuff(mult) {
    if (mult <= 1) {
      if (this.buffRing) this.buffRing.visible = false;
      return;
    }
    if (!this.buffRing) {
      const r = new THREE.Mesh(GEO2.buffRing, MAT2.buffRing.clone());
      r.rotation.x = -Math.PI / 2;
      r.position.y = 0.06;
      this.mesh.add(r);
      this.buffRing = r;
    }
    this.buffRing.visible = true;
    this.buffRing.material.opacity = 0.35 + Math.min(0.45, (mult - 1) * 0.7);
  }
  // 타워 시너지(서리+화살, 독+독) 표시 — 보루 버프 고리와 겹치지 않게 약간 위에, 색으로 종류를 구분한다
  showSynergy(active, colorHex) {
    if (!active) {
      if (this.synergyRing) this.synergyRing.visible = false;
      return;
    }
    if (!this.synergyRing) {
      const r = new THREE.Mesh(GEO2.buffRing, MAT2.buffRing.clone());
      r.rotation.x = -Math.PI / 2;
      r.position.y = 0.13;
      this.mesh.add(r);
      this.synergyRing = r;
    }
    this.synergyRing.visible = true;
    this.synergyRing.material.color.setHex(colorHex);
    this.synergyRing.material.opacity = 0.5;
  }
  // 특화 표시 — 보루 버프(y 0.06)·시너지(y 0.13) 고리와 높이를 달리해 셋이 같이 떠도 안 겹친다.
  // 고리 색이 곧 특화 종류라, 지어 놓은 방어선을 멀리서 봐도 어떤 갈래인지 바로 읽힌다.
  showSpecRing() {
    const sp2 = this.specDef;
    if (!sp2) return;
    if (!this.specRing) {
      const r = new THREE.Mesh(GEO2.buffRing, MAT2.buffRing.clone());
      r.rotation.x = -Math.PI / 2;
      r.position.y = 0.2;
      this.mesh.add(r);
      this.specRing = r;
    }
    this.specRing.visible = true;
    this.specRing.material.color.setHex(sp2.ring);
    this.specRing.material.opacity = 0.62;
  }
  // 탑승 중 표시 — 나머지 넷(0.06/0.13/0.2/0.27)보다 한 단 위(0.34)에, 탑승한 플레이어 몸에
  // 입히는 것과 같은 금빛으로 띄운다 — 몸과 타워가 같은 색으로 빛나야 "이 둘이 지금 연결돼
  // 있다"는 게 멀리서도 바로 읽힌다.
  showCrew(active) {
    if (!active) {
      if (this.crewRing) this.crewRing.visible = false;
      return;
    }
    if (!this.crewRing) {
      const r = new THREE.Mesh(GEO2.buffRing, MAT2.buffRing.clone());
      r.rotation.x = -Math.PI / 2;
      r.position.y = 0.34;
      this.mesh.add(r);
      this.crewRing = r;
    }
    this.crewRing.visible = true;
    this.crewRing.material.color.setHex(16763989);
    this.crewRing.material.opacity = 0.75;
  }
  // 우선순위 표시 — 나머지 셋(0.06/0.13/0.2)보다 한 단 위(0.27)에 띄운다. 대부분의 타워는
  // 기본값(threat, 저격탑만 strongest)을 그대로 쓰므로 고리가 안 뜨는 게 정상이다 — 실제로
  // 플레이어가 O로 손댄 타워만 눈에 띄어서, 방어선을 훑어보면 "내가 손댄 타워"가 바로 구분된다.
  refreshPriorityRing() {
    const isDefault = this.targetPriority === (this.def.targetMode === "highestHp" ? "strongest" : "threat");
    if (isDefault) {
      if (this.priorityRing) this.priorityRing.visible = false;
      return;
    }
    if (!this.priorityRing) {
      const r = new THREE.Mesh(GEO2.buffRing, MAT2.buffRing.clone());
      r.rotation.x = -Math.PI / 2;
      r.position.y = 0.27;
      this.mesh.add(r);
      this.priorityRing = r;
    }
    this.priorityRing.visible = true;
    this.priorityRing.material.color.setHex(PRIORITY_RING_COLOR[this.targetPriority]);
    this.priorityRing.material.opacity = 0.62;
  }
  applyLevel(level) {
    this.level = level;
    const st = this.def.levels[level - 1];
    const ratio = this.hp / this.maxHp;
    this.maxHp = st.hp;
    this.hp = Math.min(this.maxHp, Math.max(1, Math.round(this.maxHp * ratio)));
    this.ammo = this.magazine;
    const old = this.mesh;
    const pos = old.position.clone();
    const parent = old.parent;
    const nm = buildMesh(this.key, level);
    nm.position.copy(pos);
    nm.userData.building = this;
    if (parent) {
      parent.remove(old);
      parent.add(nm);
    }
    this.mesh = nm;
    this.buffRing = null;
    this.synergyRing = null;
    this.specRing = null;
    this._makeBar();
    this.turret = nm.userData.turret;
    if (this.spec) this.showSpecRing();
  }
  damage(amount) {
    this.hp -= amount;
    this.refreshBar();
    return this.hp <= 0;
  }
  refreshBar() {
    const r = Math.max(0, this.hp / this.maxHp);
    this.bar.visible = r < 0.999;
    this.barFg.scale.x = Math.max(1e-3, r);
    this.barFg.position.x = -(1 - r) * 0.75;
    this.barFg.material.color.setHex(r > 0.5 ? 6745736 : r > 0.25 ? 16763989 : 16734826);
  }
  faceBar(camera) {
    if (this.bar.visible) this.bar.quaternion.copy(camera.quaternion);
    if (this.ammoBar) this.ammoBar.quaternion.copy(camera.quaternion);
  }
};
function buildMesh(key, level) {
  const g2 = new THREE.Group();
  if (key === "wall") {
    const stone = MAT2.wall[level - 1];
    const foot = new THREE.Mesh(GEO2.wallFoot, MAT2.wallDark);
    foot.position.y = 0.13;
    foot.receiveShadow = true;
    const m2 = new THREE.Mesh(GEO2.wall, stone);
    m2.position.y = 0.76;
    m2.castShadow = true;
    m2.receiveShadow = true;
    const upper = new THREE.Mesh(GEO2.wallUpper, stone);
    upper.position.y = 1.69;
    upper.castShadow = true;
    upper.receiveShadow = true;
    const cap = new THREE.Mesh(GEO2.wallCap, MAT2.wallDark);
    cap.position.y = 2.21;
    cap.castShadow = true;
    g2.add(foot, m2, upper, cap);
    // 최종 단계에만 성가퀴를 올려, 다 올린 벽인지 멀리서도 실루엣으로 구분된다
    if (level >= 3) {
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const mer = new THREE.Mesh(GEO2.wallMerlon, stone);
        mer.position.set(dx * 0.68, 2.48, dz * 0.68);
        mer.castShadow = true;
        g2.add(mer);
      }
    }
    return g2;
  }
  if (key === "gate") {
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(GEO2.gatePost, MAT2.wall[level - 1]);
      post.position.set(side * 0.73, 1.15, 0);
      post.castShadow = true;
      post.receiveShadow = true;
      g2.add(post);
    }
    const lintel = new THREE.Mesh(GEO2.gateLintel, MAT2.gateLintel);
    lintel.position.y = 2.45;
    lintel.castShadow = true;
    g2.add(lintel);
    return g2;
  }
  if (key === "workbench") {
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.16, 1.1), MAT2.workbenchTop);
    top.position.y = 0.85;
    top.castShadow = true;
    top.receiveShadow = true;
    g2.add(top);
    const legGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.85, 6);
    for (const [lx, lz] of [[0.68, 0.42], [-0.68, 0.42], [0.68, -0.42], [-0.68, -0.42]]) {
      const leg = new THREE.Mesh(legGeo, MAT2.workbenchLeg);
      leg.position.set(lx, 0.42, lz);
      leg.castShadow = true;
      g2.add(leg);
    }
    const tool = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 4), MAT2.workbenchTool);
    tool.position.set(0.3, 1.1, 0);
    tool.rotation.set(0, Math.PI / 4, Math.PI * 0.15);
    tool.castShadow = true;
    g2.add(tool);
    return g2;
  }
  if (key === "furnace") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 1.4), MAT2.furnaceBody);
    body.position.y = 0.6;
    body.castShadow = true;
    body.receiveShadow = true;
    g2.add(body);
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.9, 8), MAT2.furnaceBody);
    chimney.position.set(0.38, 1.6, -0.38);
    chimney.castShadow = true;
    g2.add(chimney);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.5, 0.08), MAT2.furnaceFire);
    mouth.position.set(0, 0.5, 0.71);
    g2.add(mouth);
    return g2;
  }
  if (key === "harvester") {
    const post = new THREE.Mesh(GEO2.harvesterPost, MAT2.harvesterPost);
    post.position.y = 0.75;
    post.castShadow = true;
    g2.add(post);
    const wheel = new THREE.Mesh(GEO2.harvesterWheel, MAT2.harvesterWheel);
    wheel.position.set(0, 1.35, 0.35);
    wheel.castShadow = true;
    g2.add(wheel);
    for (let i = 0; i < 2; i++) {
      const spoke = new THREE.Mesh(GEO2.harvesterSpoke, MAT2.harvesterWheel);
      spoke.rotation.z = i * Math.PI / 2;
      wheel.add(spoke);
    }
    const basket = new THREE.Mesh(GEO2.harvesterBasket, MAT2.harvesterBasket);
    basket.position.set(0.4, 0.55, -0.3);
    basket.castShadow = true;
    basket.receiveShadow = true;
    g2.add(basket);
    g2.userData.wheel = wheel;
    return g2;
  }
  if (key === "outpost") {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3, 6), MAT2.outpostPole);
    pole.position.y = 1.5;
    pole.castShadow = true;
    g2.add(pole);
    const w2 = 0.7 + level * 0.18;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(w2, w2 * 0.6), MAT2.outpostFlag);
    flag.position.set(w2 / 2 + 0.08, 2.6, 0);
    flag.castShadow = true;
    g2.add(flag);
    const base2 = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.34, 7), MAT2.outpostBase);
    base2.position.y = 0.17;
    base2.castShadow = true;
    base2.receiveShadow = true;
    g2.add(base2);
    const r2 = CFG.builds.outpost.levels[level - 1].zoneRadius;
    const ring = new THREE.Mesh(new THREE.RingGeometry(r2 - 0.22, r2, 72), MAT2.outpostZone);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    g2.add(ring);
    return g2;
  }
  if (key === "decoy") {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2, 6), MAT2.decoyPost);
    post.position.y = 1;
    post.castShadow = true;
    g2.add(post);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 6), MAT2.decoyPost);
    arm.rotation.z = Math.PI / 2;
    arm.position.y = 1.55;
    arm.castShadow = true;
    g2.add(arm);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), MAT2.decoyStraw);
    head.position.y = 2.1;
    head.castShadow = true;
    g2.add(head);
    const cloth = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 6), MAT2.decoyCloth);
    cloth.position.y = 1.25;
    cloth.castShadow = true;
    g2.add(cloth);
    const r2 = CFG.builds.decoy.levels[level - 1].tauntRadius;
    const zone = new THREE.Mesh(new THREE.RingGeometry(r2 - 0.15, r2, 48), MAT2.decoyZone);
    zone.rotation.x = -Math.PI / 2;
    zone.position.y = 0.04;
    g2.add(zone);
    return g2;
  }
  if (key === "beacon") {
    const cairn = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.5, 8), MAT2.beaconStone);
    cairn.position.y = 0.25;
    cairn.castShadow = true;
    cairn.receiveShadow = true;
    g2.add(cairn);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 2.4, 6), MAT2.decoyPost);
    pole.position.y = 1.6;
    pole.castShadow = true;
    g2.add(pole);
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.4, 8, 1, true), MAT2.beaconBasket);
    basket.position.y = 2.85;
    basket.castShadow = true;
    g2.add(basket);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), MAT2.beaconFlame);
    flame.position.y = 2.95;
    g2.add(flame);
    const r3 = CFG.builds.beacon.levels[level - 1].tauntRadius;
    const zone2 = new THREE.Mesh(new THREE.RingGeometry(r3 - 0.15, r3, 48), MAT2.beaconZone);
    zone2.rotation.x = -Math.PI / 2;
    zone2.position.y = 0.04;
    g2.add(zone2);
    return g2;
  }
  if (key === "camp") {
    const canvas2 = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.1, 4), MAT2.campCanvas);
    canvas2.position.y = 0.55;
    canvas2.rotation.y = Math.PI / 4;
    canvas2.castShadow = true;
    canvas2.receiveShadow = true;
    g2.add(canvas2);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), MAT2.campGlow);
    glow.position.set(0, 0.28, 0.7);
    g2.add(glow);
    return g2;
  }
  if (key === "trap" || key === "mire" || key === "blast") {
    const baseMat = key === "mire" ? MAT2.mireBase : key === "blast" ? MAT2.blastBase : MAT2.trapBase;
    const spikeMat = key === "mire" ? MAT2.mireSpike : key === "blast" ? MAT2.blastSpike : MAT2.trapSpike;
    const plate = new THREE.Mesh(GEO2.trapBase, baseMat);
    plate.position.y = 0.06;
    plate.receiveShadow = true;
    g2.add(plate);
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * 2 * i / 5;
      const spike = new THREE.Mesh(GEO2.trapSpike, spikeMat);
      spike.position.set(Math.cos(a) * 0.42, 0.24, Math.sin(a) * 0.42);
      spike.castShadow = true;
      g2.add(spike);
    }
    return g2;
  }
  const base = new THREE.Mesh(GEO2.base, MAT2.base);
  base.position.y = 0.35;
  base.castShadow = true;
  base.receiveShadow = true;
  const isWatchtower = key === "watchtower";
  const pillar = new THREE.Mesh(isWatchtower ? GEO2.watchPillar : GEO2.pillar, MAT2.base);
  pillar.position.y = isWatchtower ? 2.3 : 1.5;
  pillar.castShadow = true;
  g2.add(base, pillar);
  const turret = new THREE.Group();
  turret.position.y = isWatchtower ? 4 : 2.6;
  if (key === "arrow") {
    const head = new THREE.Mesh(GEO2.headArrow, MAT2.arrow);
    head.rotation.x = Math.PI / 2;
    head.castShadow = true;
    turret.add(head);
  } else if (key === "frost") {
    const head = new THREE.Mesh(GEO2.headFrost, MAT2.frost);
    head.castShadow = true;
    turret.add(head);
    const ringG = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 6, 18), MAT2.frost);
    ringG.rotation.x = Math.PI / 2;
    turret.add(ringG);
  } else if (key === "poison") {
    const head = new THREE.Mesh(GEO2.headPoison, MAT2.poison);
    head.castShadow = true;
    turret.add(head);
    const ringG = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.05, 6, 16), MAT2.poison);
    ringG.rotation.x = Math.PI / 2;
    turret.add(ringG);
  } else if (key === "support") {
    const head = new THREE.Mesh(GEO2.headSupport, MAT2.support);
    head.castShadow = true;
    turret.add(head);
    const ringG = new THREE.Mesh(GEO2.supportRing, MAT2.support);
    ringG.rotation.x = Math.PI / 2;
    ringG.position.y = -0.3;
    turret.add(ringG);
  } else if (key === "snare") {
    const ringA = new THREE.Mesh(GEO2.supportRing, MAT2.snare);
    ringA.rotation.x = Math.PI / 2;
    const ringB = new THREE.Mesh(GEO2.supportRing, MAT2.snare);
    ringB.rotation.z = Math.PI / 2;
    turret.add(ringA, ringB);
  } else if (key === "watchtower") {
    const eye = new THREE.Mesh(GEO2.watchEye, MAT2.watchtower);
    eye.castShadow = true;
    turret.add(eye);
    const ringG = new THREE.Mesh(GEO2.watchRing, MAT2.watchtower);
    turret.add(ringG);
  } else if (key === "repairpost") {
    const crossV = new THREE.Mesh(GEO2.repairCrossV, MAT2.repairpost);
    crossV.castShadow = true;
    const crossH = new THREE.Mesh(GEO2.repairCrossH, MAT2.repairpost);
    crossH.castShadow = true;
    turret.add(crossV, crossH);
    const ringG = new THREE.Mesh(GEO2.supportRing, MAT2.repairpost);
    ringG.rotation.x = Math.PI / 2;
    ringG.position.y = -0.3;
    turret.add(ringG);
  } else if (key === "sniper") {
    const barrel = new THREE.Mesh(GEO2.sniperBarrel, MAT2.sniper);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 1.15;
    barrel.castShadow = true;
    const scope = new THREE.Mesh(GEO2.sniperScope, MAT2.sniperScope);
    scope.rotation.z = Math.PI / 2;
    scope.position.set(0, 0.3, 0.15);
    scope.castShadow = true;
    turret.add(barrel, scope);
  } else if (key === "armory") {
    const crateA = new THREE.Mesh(GEO2.armoryCrate, MAT2.armoryCrate);
    crateA.position.set(-0.3, -0.15, 0.05);
    crateA.rotation.y = 0.35;
    crateA.castShadow = true;
    const crateB = new THREE.Mesh(GEO2.armoryCrate, MAT2.armoryCrate);
    crateB.position.set(0.28, 0.05, -0.08);
    crateB.rotation.y = -0.25;
    crateB.castShadow = true;
    const crateC = new THREE.Mesh(GEO2.armoryCrate, MAT2.armoryCrate);
    crateC.position.set(0, 0.42, 0.02);
    crateC.rotation.y = 0.6;
    crateC.castShadow = true;
    const beltG = new THREE.Mesh(GEO2.supportRing, MAT2.armoryBelt);
    beltG.rotation.x = Math.PI / 2;
    beltG.position.y = -0.32;
    turret.add(crateA, crateB, crateC, beltG);
  } else {
    const head = new THREE.Mesh(GEO2.headCannon, MAT2.cannon);
    head.castShadow = true;
    const barrel = new THREE.Mesh(GEO2.barrel, MAT2.cannon);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.9;
    turret.add(head, barrel);
  }
  for (let i = 1; i < level; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.07, 6, 16), MAT2.arrow);
    r.rotation.x = Math.PI / 2;
    r.position.y = 0.6 + i * 0.2;
    g2.add(r);
  }
  g2.add(turret);
  g2.userData.turret = turret;
  return g2;
}
export var BuildManager = class {
  constructor(sm2, grid, world, fx, projectiles) {
    this.sm = sm2;
    this.grid = grid;
    this.world = world;
    grid.portals = world.portals;
    this.fx = fx;
    this.projectiles = projectiles;
    this.buildings = /* @__PURE__ */ new Map();
    this.root = new THREE.Group();
    sm2.scene.add(this.root);
    this.mode = null;
    this.ghost = null;
    this.ghostValid = false;
    this.ghostReason = "";
    this.ghostCell = null;
    this.hover = null;
    this.relocateSource = null;
    this.onImpact = null;
    this.onSynergy = null;
    this.rangeRing = new THREE.Mesh(RANGE_RING_GEO, MAT2.rangeRing);
    this.rangeRing.rotation.x = -Math.PI / 2;
    this.rangeRing.position.y = 0.05;
    this.rangeRing.visible = false;
    this.root.add(this.rangeRing);
  }
  setMode(mode) {
    if (this.mode === mode) mode = null;
    this.mode = mode;
    this.relocateSource = null;
    this._syncGhost();
    this.sm.setBuildGridVisible(!!mode);
    this.sm.setBuildView(!!mode);
    return this.mode;
  }
  // 이동(move) 모드 1단계에서 대상 건물을 고르면 호출된다 — mode 자체는 "move"로 그대로 두고
  // (실제 CFG.builds 키로 바꾸면 아래 updateGhost의 비용 판정이 신축 비용을 참조하게 돼 버린다)
  // relocateSource 만 채워서 2단계(고스트 배치 미리보기)로 넘어간다.
  pickRelocateSource(building) {
    this.relocateSource = building;
    this._syncGhost();
  }
  cancelRelocate() {
    this.relocateSource = null;
    this._syncGhost();
  }
  // 투입 비용의 25% — 철거 후 재건축(50% 손실)보다 싸게 자리를 옮기게 해 주되, 공짜는 아니다.
  relocateCost(b) {
    const inv = this.investedCost(b);
    const out = {};
    for (const k2 of COST_KEYS) if (inv[k2]) out[k2] = Math.ceil(inv[k2] * 0.25);
    return out;
  }
  // 살아있는 전초기지가 만들어 낸 추가 건설 구역. 깃발이 부서지면 목록에서 사라지므로
  // 그 구역도 함께 없어진다(이미 지은 건물은 남는다 — 판정은 "새로 짓는 순간"에만 걸린다).
  zones() {
    const out = [];
    for (const b of this.buildings.values()) {
      if (b.def.expandsZone) out.push({ x: b.x, z: b.z, r: b.stats.zoneRadius });
    }
    return out;
  }
  // place()와 정확히 같은 canPlace 판정을 새 위치에 적용한다 — 레벨·특화·체력·탄약은
  // 전혀 안 건드리고 위치(격자·좌표·메시)만 옮긴다.
  relocate(b, gx, gz) {
    const res = this.grid.canPlace(gx, gz, (x2, z2) => this.world.blocksBuild(x2, z2), b.key, this.zones());
    if (!res.ok) return null;
    this.grid.clear(b.gx, b.gz);
    b.gx = gx;
    b.gz = gz;
    b.x = res.x;
    b.z = res.z;
    b.mesh.position.set(res.x, 0, res.z);
    this.grid.set(gx, gz, b);
    this.grid.dirty = true;
    this.fx.ring(res.x, res.z, 9109440, 2);
    return b;
  }
  _syncGhost() {
    if (this.ghost) {
      this.root.remove(this.ghost);
      this.ghost = null;
    }
    const key = this.mode === "move" ? this.relocateSource?.key : this.mode;
    if (!key || !CFG.builds[key]) return;
    const g2 = buildMesh(key, 1);
    g2.traverse((o) => {
      if (o.isMesh) {
        o.material = MAT2.ghostOk;
        o.castShadow = false;
      }
    });
    this.root.add(g2);
    this.ghost = g2;
  }
  _setGhostMaterial(ok) {
    if (!this.ghost) return;
    const m2 = ok ? MAT2.ghostOk : MAT2.ghostBad;
    this.ghost.traverse((o) => {
      if (o.isMesh) o.material = m2;
    });
  }
  // 매 프레임: 포인터 위치에 고스트 배치 / 대상 건물 하이라이트
  updateGhost(pointer, resources, rangeMult = 1) {
    this.hover = null;
    if (!this.mode || !pointer) {
      if (this.ghost) this.ghost.visible = false;
      this.rangeRing.visible = false;
      if (!this.mode && pointer) {
        const b = this.grid.atWorld(pointer.x, pointer.z);
        if (b && b.stationKind) this.hover = b;
      }
      return;
    }
    if (this.mode === "upgrade" || this.mode === "sell" || this.mode === "repair" || this.mode === "targetMode" || this.mode === "move" && !this.relocateSource) {
      if (this.ghost) this.ghost.visible = false;
      const b = this.grid.atWorld(pointer.x, pointer.z);
      this.hover = b || null;
      if (b && b.isSupport) this._showRangeRing(b.x, b.z, b.stats.buffRadius ?? b.stats.detectRadius);
      else if (b && b.isHarvester) this._showRangeRing(b.x, b.z, b.stats.detectRadius);
      else if (b && b.isRepairPost) this._showRangeRing(b.x, b.z, b.stats.healRadius);
      else if (b && b.isHealCamp) this._showRangeRing(b.x, b.z, b.stats.healRadius);
      else if (b && b.isArmory) this._showRangeRing(b.x, b.z, b.stats.supplyRadius);
      else if (b && b.isOutpost) this._showRangeRing(b.x, b.z, b.stats.zoneRadius);
      else if (b && b.isTower) this._showRangeRing(b.x, b.z, b.stats.range * rangeMult);
      else this.rangeRing.visible = false;
      return;
    }
    const placeKey = this.mode === "move" ? this.relocateSource.key : this.mode;
    const g2 = this.grid.toGrid(pointer.x, pointer.z);
    const res = this.grid.canPlace(g2.gx, g2.gz, (x2, z2) => this.world.blocksBuild(x2, z2), placeKey, this.zones());
    const w2 = this.grid.toWorld(g2.gx, g2.gz);
    if (this.ghost) {
      this.ghost.visible = true;
      this.ghost.position.set(w2.x, 0, w2.z);
    }
    const lv1 = CFG.builds[placeKey].levels[0];
    const previewRadius = lv1.buffRadius ?? lv1.detectRadius ?? lv1.healRadius ?? lv1.zoneRadius ?? (lv1.range != null ? lv1.range * rangeMult : void 0);
    if (previewRadius) this._showRangeRing(w2.x, w2.z, previewRadius);
    else this.rangeRing.visible = false;
    let ok = res.ok;
    let why = res.why;
    const cost = this.mode === "move" ? this.relocateCost(this.relocateSource) : CFG.builds[this.mode].cost;
    if (ok && !canAfford(resources, cost)) {
      ok = false;
      why = "자원이 부족합니다";
    }
    this.ghostValid = ok;
    this.ghostReason = why;
    this.ghostCell = { gx: g2.gx, gz: g2.gz, x: w2.x, z: w2.z };
    this._setGhostMaterial(ok);
  }
  _showRangeRing(x2, z2, radius) {
    this.rangeRing.visible = true;
    this.rangeRing.position.set(x2, 0.05, z2);
    this.rangeRing.scale.setScalar(radius);
  }
  // 실제 배치. force 는 스냅샷 복제 전용 — 참가자는 호스트의 상태를 "그대로 옮겨 그릴" 뿐이라
  // 배치 규칙을 다시 심사하면 안 된다. 특히 전초기지 구역은 시간이 지나면 사라질 수 있어서
  // (깃발이 부서지면), 그 구역 안에 이미 지어진 건물이 담긴 스냅샷을 나중에 받은 참가자가
  // 심사를 다시 돌리면 그 건물들을 통째로 못 그리는 디싱크가 난다. 단, 격자가 이미 차 있으면
  // force 여도 건너뛴다(다른 건물의 격자 등록을 덮어써 상태가 깨지는 것을 막는다 —
  // 다음 스냅샷에서 정리된 뒤 정상적으로 들어온다).
  place(key, gx, gz, ownerId, id, force) {
    const res = this.grid.canPlace(gx, gz, (x2, z2) => this.world.blocksBuild(x2, z2), key, this.zones());
    if (!res.ok && !(force && !this.grid.at(gx, gz) && this.grid.inBounds(gx, gz))) return null;
    const w3 = res.ok ? res : this.grid.toWorld(gx, gz);
    const b = new Building(key, gx, gz, w3.x, w3.z, ownerId, id);
    if (id && id >= nextId) nextId = id + 1;
    this.root.add(b.mesh);
    this.buildings.set(b.id, b);
    this.grid.set(gx, gz, b);
    b.turret = b.mesh.userData.turret;
    this.fx.ring(w3.x, w3.z, 9109440, 2);
    return b;
  }
  remove(id) {
    const b = this.buildings.get(id);
    if (!b) return null;
    this.grid.clear(b.gx, b.gz);
    this.root.remove(b.mesh);
    this.buildings.delete(id);
    return b;
  }
  upgrade(id) {
    const b = this.buildings.get(id);
    if (!b) return null;
    if (b.level >= b.def.levels.length) return null;
    b.applyLevel(b.level + 1);
    this.root.add(b.mesh);
    this.grid.dirty = true;
    b.refreshBar();
    this.fx.ring(b.x, b.z, 16769162, 2.4);
    return b;
  }
  specialize(id, spec) {
    const b = this.buildings.get(id);
    if (!b || !b.canSpecialize) return null;
    if (!CFG.towerSpec[b.key]?.[spec]) return null;
    b.spec = spec;
    b.showSpecRing();
    this.fx.ring(b.x, b.z, CFG.towerSpec[b.key][spec].ring, 3);
    return b;
  }
  // 현재 레벨까지 투입된 총 자원 (레벨 1 기본 비용 + 업그레이드 비용 누적)
  // COST_KEYS(utils.js) 기준 — 구리·석탄처럼 나중에 추가된 재료도 여기서 자동으로 잡힌다
  // (예전엔 목재·광물·철 3개만 하드코딩해서, 구리·석탄이 든 타워를 철거/수리하면 그 재료만
  // 환급·차감 계산에서 조용히 빠지는 버그가 있었다).
  investedCost(b) {
    const total = {};
    for (let i = 0; i < b.level; i++) {
      const c2 = i === 0 ? b.def.cost : b.def.levels[i].cost;
      for (const k2 of COST_KEYS) total[k2] = (total[k2] || 0) + (c2?.[k2] || 0);
    }
    return total;
  }
  refund(b) {
    const inv = this.investedCost(b);
    if (b.spec) {
      const sc = CFG.towerSpec.cost;
      for (const k2 of COST_KEYS) inv[k2] = (inv[k2] || 0) + (sc[k2] || 0);
    }
    const out = {};
    for (const k2 of COST_KEYS) out[k2] = Math.floor((inv[k2] || 0) * 0.5);
    return out;
  }
  // 손상 비율에 비례한 수리 비용 (완전 파괴 상태를 100% 재건축하는 것보다 저렴하게)
  repairCost(b) {
    const ratio = 1 - b.hp / b.maxHp;
    if (ratio <= 1e-3) return null;
    const inv = this.investedCost(b);
    const cost = {};
    for (const k2 of COST_KEYS) if (inv[k2]) cost[k2] = Math.ceil(inv[k2] * ratio * 0.4);
    return cost;
  }
  repair(b) {
    b.hp = b.maxHp;
    b.refreshBar();
  }
  // 조준·발사 애니메이션(포탑 회전·투사체 시각 효과)은 매끄러운 화면을 위해 모든 클라이언트에서
  // 돈다. 하지만 탄약(b.ammo)은 snapshot()/applySnapshot()으로 동기화되는 호스트 권위 값이라,
  // 참가자가 자기 화면에서 똑같은 판정으로 로컬 탄약까지 깎아버리면 그 값이 다음 스냅샷이 오기
  // 전까지(최대 83ms) 실제 호스트 상태와 어긋난다 — 하필 탄창이 정확히 1발 남은 순간에 이 어긋남이
  // 참가자 화면에서만 "탄약 소진" 토스트를 먼저 띄우는 식으로 새어나갈 수 있다. isHost가 아니면
  // 조준·발사 연출은 그대로 두되 탄약 차감·소진 콜백만 건너뛴다 — 그 자리는 다음 스냅샷이 채운다.
  updateTowers(dt2, enemies, now, rangeMult = 1, ammoSaveChance = 0, isHost = true) {
    const silences = enemies.filter((e) => !e.dead && e.silenceUntil > now);
    for (const b of this.buildings.values()) {
      if (!b.isTower) continue;
      const st = b.stats;
      b.cooldown -= dt2;
      b.silenced = silences.some((e) => dist(b.x, b.z, e.x, e.z) <= CFG.bossPattern.silenceRadius);
      b.cursed = b.curseUntil > now;
      if (b.silenced || b.cursed) {
        if (b.turret) b.turret.rotation.y += dt2 * 0.4;
        continue;
      }
      const target = this._acquire(b, enemies, st.range * rangeMult * (b.crewedBy ? CFG.crew.rangeMult : 1));
      if (target && b.turret) {
        const ang = Math.atan2(target.x - b.x, target.z - b.z);
        b.turret.rotation.y = ang;
      }
      if (target && b.cooldown <= 0) {
        const empty = b.ammoEmpty;
        if (isHost && !empty && b.ammoType && !(ammoSaveChance > 0 && Math.random() < ammoSaveChance)) {
          b.ammo -= 1;
          if (b.ammo <= 0) this.onAmmoEmpty?.(b);
        }
        b.cooldown = 1 / (st.rate * (empty ? CFG.ammo.emptyRateMult : 1));
        this.shoot(b, target, empty);
      }
    }
  }
  // 화살탑 시너지: 사거리 안(정확히는 인접 반경)에 서리탑이 있으면 true
  hasNearbyFrost(b) {
    const r = CFG.synergy.frostArrow.radius;
    for (const o of this.buildings.values()) {
      if (o === b || o.key !== "frost") continue;
      if (dist(b.x, b.z, o.x, o.z) <= r) return true;
    }
    return false;
  }
  // 저격탑 시너지: hasNearbyFrost와 정확히 같은 구조 — 사거리 안(인접 반경)에 독탑이 있으면 true
  hasNearbyPoison(b) {
    const r = CFG.synergy.sniperVenom.radius;
    for (const o of this.buildings.values()) {
      if (o === b || o.key !== "poison") continue;
      if (dist(b.x, b.z, o.x, o.z) <= r) return true;
    }
    return false;
  }
  // 감시탑(watchtower) 시너지 — 반경 안이면 파묻힌 굴착병도 조준 가능하게 한다 (isSupport라 자기 자신은 제외 불필요)
  // 감시탑을 건설 메뉴에서 내리면서 탐지 역할은 보루(support)가 Lv2 부터 겸한다 —
  // 이미 지어 둔 감시탑도 그대로 계속 동작한다.
  hasNearbyDetector(b) {
    for (const o of this.buildings.values()) {
      if (o.dead) continue;
      if (o.key === "watchtower") {
        if (dist(b.x, b.z, o.x, o.z) <= o.stats.detectRadius) return true;
      } else if (o.key === "support" && o.level >= 2) {
        if (dist(b.x, b.z, o.x, o.z) <= o.stats.buffRadius) return true;
      }
    }
    return false;
  }
  // 독탑 시너지: 인접한 다른 독탑 하나당 독 피해가 누적 증가(상한 있음)
  poisonSynergyMult(b) {
    const s2 = CFG.synergy.poisonStack;
    let count = 0;
    for (const o of this.buildings.values()) {
      if (o === b || o.key !== "poison") continue;
      if (dist(b.x, b.z, o.x, o.z) <= s2.radius) count++;
    }
    return 1 + Math.min(s2.max, count * s2.dpsMultPerNeighbor);
  }
  // 대포탑 시너지: poisonSynergyMult와 정확히 같은 구조 — 인접한 다른 대포탑 하나당
  // 폭발 반경이 누적 증가(상한 있음)
  cannonSynergyMult(b) {
    const s2 = CFG.synergy.cannonCluster;
    let count = 0;
    for (const o of this.buildings.values()) {
      if (o === b || o.key !== "cannon") continue;
      if (dist(b.x, b.z, o.x, o.z) <= s2.radius) count++;
    }
    return 1 + Math.min(s2.max, count * s2.splashMultPerNeighbor);
  }
  // 범위 안 보루(support)들의 공격력 버프를 모두 더한다 (중첩 가능, 상한 100%)
  supportBuffMult(b) {
    let bonus = 0;
    for (const s2 of this.buildings.values()) {
      if (!s2.isSupport) continue;
      const st = s2.stats;
      if (dist(b.x, b.z, s2.x, s2.z) <= st.buffRadius) bonus += st.buffMult;
    }
    return 1 + Math.min(1, bonus);
  }
  // 사거리 안에서 우선순위 모드에 맞는 적을 고른다. 기본값은 크리스탈에 가장 가까운(=가장
  // 위협적인) 적("threat")이고, 저격탑만 기본이 "strongest"(남은 체력이 가장 많은 적)다.
  // 어느 타워든 우선순위 모드(O 키)로 이 기본값을 4가지 중 하나로 직접 바꿀 수 있다:
  // threat(위협적인 순) · nearest(타워에 가까운 순) · strongest(체력 많은 순, 저격탑 기본) ·
  // weakest(체력 적은 순, 마무리 사냥용).
  _acquire(b, enemies, range) {
    const mode = b.targetPriority || (b.def.targetMode === "highestHp" ? "strongest" : "threat");
    let best = null, bestScore = mode === "strongest" ? -Infinity : Infinity;
    const r2 = range * range;
    let detector = null;
    for (const e of enemies) {
      if (e.dead) continue;
      if (e.variant === "ward") continue;
      if (e.st.wild) continue;
      if (e.st.burrows && e.diving) {
        if (detector === null) detector = this.hasNearbyDetector(b);
        if (!detector) continue;
      }
      const d2 = (e.x - b.x) ** 2 + (e.z - b.z) ** 2;
      if (d2 > r2) continue;
      let score;
      if (mode === "strongest" || mode === "weakest") score = e.hp;
      else if (mode === "nearest") score = d2;
      else score = e.x * e.x + e.z * e.z;
      if (mode === "strongest" ? score > bestScore : score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    if (best && best.st.burrows && best.diving) this.onDetectBurrow?.(best);
    return best;
  }
  // 우선순위 모드(O)에서 타워를 클릭하면 호출된다 — 4가지를 순서대로 돌린다.
  cycleTargetPriority(id) {
    const b = this.buildings.get(id);
    if (!b || !b.isTower) return null;
    const order = ["threat", "nearest", "strongest", "weakest"];
    const cur = b.targetPriority || (b.def.targetMode === "highestHp" ? "strongest" : "threat");
    b.targetPriority = order[(order.indexOf(cur) + 1) % order.length];
    b.refreshPriorityRing();
    return b.targetPriority;
  }
  // 투사체 발사 연출 → 명중 시 onImpact (데미지 적용은 호스트에서만)
  shoot(b, target, empty = false) {
    const st = b.stats;
    const mult = this.supportBuffMult(b) * (b.crewedBy ? CFG.crew.dmgMult : 1);
    let effStats = mult !== 1 ? { ...st, dmg: Math.round(st.dmg * mult) } : st;
    if (b.key === "poison" && st.poisonDps) {
      const pm = this.poisonSynergyMult(b);
      if (pm !== 1) effStats = { ...effStats, poisonDps: Math.round(effStats.poisonDps * pm) };
    }
    if (b.key === "cannon" && st.splash) {
      const cm2 = this.cannonSynergyMult(b);
      if (cm2 !== 1) effStats = { ...effStats, splash: effStats.splash * cm2 };
    }
    if (empty) {
      const m = CFG.ammo.emptyDmgMult;
      effStats = { ...effStats };
      effStats.dmg = Math.max(1, Math.round(effStats.dmg * m));
      if (effStats.poisonDps) effStats.poisonDps = Math.max(1, Math.round(effStats.poisonDps * m));
      if (effStats.slowTime) effStats.slowTime = effStats.slowTime * m;
      if (effStats.root) effStats.root = effStats.root * m;
    }
    const from = new THREE.Vector3(b.x, 2.9, b.z);
    const to2 = new THREE.Vector3(target.x, 0.8, target.z);
    const color = PROJECTILE_COLOR[b.key];
    const speed = b.key === "cannon" ? 26 : b.key === "sniper" ? 65 : 42;
    this.projectiles.fire(from, to2, speed, color, (pos) => {
      this.fx.burst(pos.x, pos.y, pos.z, color, b.key === "cannon" ? 12 : 5, b.key === "cannon" ? 6 : 3);
      if (b.key === "cannon") this.fx.ring(pos.x, pos.z, color, effStats.splash);
      this.onImpact?.(b, effStats, pos);
    });
  }
  eachBuilding(fn) {
    this.buildings.forEach(fn);
  }
  update(dt2, camera) {
    for (const b of this.buildings.values()) {
      b.faceBar(camera);
      if (b.isSupport && b.turret) b.turret.rotation.y += dt2 * 0.6;
      if (b.isRepairPost && b.turret) b.turret.rotation.y += dt2 * 0.6;
      if (b.isHarvester) {
        const wheel = b.mesh.userData.wheel;
        if (wheel) wheel.rotation.x += dt2 * 1.4;
      }
    }
    this._buffTimer = (this._buffTimer || 0) - dt2;
    if (this._buffTimer <= 0) {
      this._buffTimer = 0.25;
      for (const b of this.buildings.values()) {
        if (b.ammoBar) b.refreshAmmoBar();
        if (b.isTower) {
          b.showBuff(this.supportBuffMult(b) * (b.crewedBy ? CFG.crew.dmgMult : 1));
          b.showCrew(!!b.crewedBy);
        }
        if (b.key === "arrow") {
          const active = this.hasNearbyFrost(b);
          b.showSynergy(active, 5891071);
          if (active && !b._synergyNotified) {
            b._synergyNotified = true;
            this.onSynergy?.("frostArrow");
          }
        } else if (b.key === "poison") {
          const pm = this.poisonSynergyMult(b);
          b.showSynergy(pm > 1, 9419324);
          if (pm > 1 && !b._synergyNotified) {
            b._synergyNotified = true;
            this.onSynergy?.("poisonStack");
          }
        } else if (b.key === "sniper") {
          const active = this.hasNearbyPoison(b);
          b.showSynergy(active, 9419324);
          if (active && !b._synergyNotified) {
            b._synergyNotified = true;
            this.onSynergy?.("sniperVenom");
          }
        } else if (b.key === "cannon") {
          const cm2 = this.cannonSynergyMult(b);
          b.showSynergy(cm2 > 1, 16750899);
          if (cm2 > 1 && !b._synergyNotified) {
            b._synergyNotified = true;
            this.onSynergy?.("cannonCluster");
          }
        }
      }
    }
    if (this.hover) {
      const s2 = 1 + Math.sin(performance.now() / 120) * 0.04;
      this.hover.mesh.scale.setScalar(s2);
      if (this._lastHover && this._lastHover !== this.hover) this._lastHover.mesh.scale.setScalar(1);
      this._lastHover = this.hover;
    } else if (this._lastHover) {
      this._lastHover.mesh.scale.setScalar(1);
      this._lastHover = null;
    }
  }
  // 저주(curseUntil)는 호스트 로컬 performance.now() 기준 절대 시각이라 그대로 네트워크로
  // 보내면 참가자의 performance.now()(서로 다른 기준점)와 비교했을 때 의미가 없다 —
  // wave.snapshot()의 prepLeft와 같은 원칙으로, "남은 시간"만 상대값으로 실어 보낸다.
  snapshot() {
    const now = performance.now() / 1e3;
    const out = [];
    for (const b of this.buildings.values()) {
      const curseLeft = Math.max(0, Math.round(((b.curseUntil || 0) - now) * 10) / 10);
      out.push([b.id, b.key, b.gx, b.gz, b.level, Math.round(b.hp), b.ownerId || "", b.spec || "", b.ammo, b.targetPriority, curseLeft]);
    }
    return out;
  }
  applySnapshot(list) {
    const seen = /* @__PURE__ */ new Set();
    for (const [id, key, gx, gz, level, hp, owner, spec, ammo, targetPriority, curseLeft] of list) {
      seen.add(id);
      let b = this.buildings.get(id);
      if (!b) b = this.place(key, gx, gz, owner, id, true);
      if (!b) continue;
      if (b.level !== level) {
        b.applyLevel(level);
        this.root.add(b.mesh);
      }
      if ((spec || null) !== b.spec) {
        b.spec = spec || null;
        if (b.spec) b.showSpecRing();
        else if (b.specRing) b.specRing.visible = false;
      }
      b.hp = hp;
      b.refreshBar();
      if (ammo !== void 0 && b.ammoType) {
        if (b.ammo > 0 && ammo <= 0) this.onAmmoEmpty?.(b);
        b.ammo = ammo;
        b.refreshAmmoBar();
      }
      if (targetPriority && targetPriority !== b.targetPriority) {
        b.targetPriority = targetPriority;
        b.refreshPriorityRing();
      }
      b.curseUntil = curseLeft > 0 ? performance.now() / 1e3 + curseLeft : 0;
    }
    for (const id of [...this.buildings.keys()]) {
      if (!seen.has(id)) this.remove(id);
    }
  }
  clearAll() {
    for (const id of [...this.buildings.keys()]) this.remove(id);
    resetBuildingIds();
  }
};
