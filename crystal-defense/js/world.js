import * as THREE from '../vendor/three.module.js';
import { CFG, biomeOf } from './config.js';
import { dist, mulberry32 } from './utils.js';

var GEO = {
  trunk: new THREE.CylinderGeometry(0.26, 0.34, 2.2, 6),
  leaf: new THREE.ConeGeometry(1.5, 3.2, 7),
  rock: new THREE.IcosahedronGeometry(1, 0),
  stump: new THREE.CylinderGeometry(0.34, 0.4, 0.5, 6),
  crystal: new THREE.OctahedronGeometry(2, 0),
  pedestal: new THREE.CylinderGeometry(3, 3.6, 1.1, 8),
  portal: new THREE.TorusGeometry(2.2, 0.28, 8, 24),
  gem: new THREE.OctahedronGeometry(0.4, 0),
  gemStump: new THREE.CylinderGeometry(0.3, 0.36, 0.16, 6),
  crate: new THREE.BoxGeometry(0.95, 0.85, 0.95),
  dropRing: new THREE.RingGeometry(1.05, 1.3, 28),
  dropBeam: new THREE.CylinderGeometry(0.07, 0.07, 6, 6),
  meteorRing: new THREE.RingGeometry(0.92, 1, 48),
  riftRing: new THREE.RingGeometry(0.86, 1, 48),
  riftCore: new THREE.CircleGeometry(1, 32),
  spiritCore: new THREE.IcosahedronGeometry(0.42, 1),
  spiritRing: new THREE.RingGeometry(0.5, 0.64, 24),
  petBody: new THREE.SphereGeometry(0.34, 10, 8),
  petSnout: new THREE.ConeGeometry(0.13, 0.32, 6),
  petEar: new THREE.ConeGeometry(0.09, 0.2, 5),
  petTail: new THREE.ConeGeometry(0.08, 0.4, 5),
  petRing: new THREE.RingGeometry(0.42, 0.54, 24)
};
var MAT = {
  trunk: new THREE.MeshStandardMaterial({ color: 5979428, roughness: 0.95 }),
  leaf: new THREE.MeshStandardMaterial({ color: 4098887, roughness: 0.9 }),
  leafDry: new THREE.MeshStandardMaterial({ color: 7306549, roughness: 0.9 }),
  rock: new THREE.MeshStandardMaterial({ color: 9146266, roughness: 0.85, metalness: 0.06 }),
  copperOre: new THREE.MeshStandardMaterial({ color: 13136695, roughness: 0.5, metalness: 0.55 }),
  coalOre: new THREE.MeshStandardMaterial({ color: 2895163, roughness: 0.95, metalness: 0.02 }),
  ore: new THREE.MeshStandardMaterial({ color: 7305874, roughness: 0.6, metalness: 0.35 }),
  pedestal: new THREE.MeshStandardMaterial({ color: 3818848, roughness: 0.7 }),
  crystal: new THREE.MeshStandardMaterial({
    color: 8382207,
    emissive: 2795212,
    emissiveIntensity: 1.4,
    roughness: 0.15,
    metalness: 0.1,
    transparent: true,
    opacity: 0.92
  }),
  portal: new THREE.MeshStandardMaterial({ color: 16734834, emissive: 16722762, emissiveIntensity: 1.1, roughness: 0.4 }),
  portalSealed: new THREE.MeshStandardMaterial({ color: 4407619, emissive: 0, emissiveIntensity: 0, roughness: 0.95, metalness: 0.05 }),
  gem: new THREE.MeshStandardMaterial({
    color: 14063103,
    emissive: 6959840,
    emissiveIntensity: 1.1,
    roughness: 0.2,
    metalness: 0.2,
    transparent: true,
    opacity: 0.9
  }),
  gemStump: new THREE.MeshStandardMaterial({ color: 5915496, roughness: 0.8 }),
  crate: new THREE.MeshStandardMaterial({ color: 9127211, roughness: 0.85 }),
  dropGlow: new THREE.MeshBasicMaterial({ color: 16759043, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
  meteorWarn: new THREE.MeshBasicMaterial({ color: 16729139, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }),
  // 화산지대에서 운석이 남기는 용암 웅덩이 — 경고 링(주황)보다 더 붉고 진하게 타는 색으로 구분한다
  lavaCrater: new THREE.MeshBasicMaterial({ color: 15013889, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
  // 늪지대 독가스 구덩이 — 색만으로도 단계가 읽히게 phase마다 material.color를 직접 바꿔 쓴다
  // (dormant: 탁한 청록, warn: 노란 초록, active: 밝은 독성 초록)
  swampPit: new THREE.MeshBasicMaterial({ color: 3163600, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  // 설원 얼음판 — 늪지대와 같은 3단계 색 전환이지만 독성 초록 대신 얼음 계열
  // (dormant: 옅은 얼음빛 청백, warn: 밝은 흰색 깜빡임, active: 진한 얼음 파랑)
  icePit: new THREE.MeshBasicMaterial({ color: 11393254, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
  riftRing: new THREE.MeshBasicMaterial({ color: 11239935, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }),
  riftCore: new THREE.MeshBasicMaterial({ color: 4530126, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }),
  spiritCore: new THREE.MeshStandardMaterial({ color: 9430015, emissive: 6736127, emissiveIntensity: 1.6, roughness: 0.2, transparent: true, opacity: 0.92 }),
  spiritRing: new THREE.MeshBasicMaterial({ color: 9430015, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }),
  petBody: new THREE.MeshStandardMaterial({ color: 6247214, roughness: 0.75 }),
  petRing: new THREE.MeshBasicMaterial({ color: 6247214, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
};
export var World = class {
  constructor(sceneMgr, seed = 1) {
    this.sm = sceneMgr;
    this.root = new THREE.Group();
    sceneMgr.scene.add(this.root);
    this.scene = this.root;
    this.seed = seed;
    this.nodes = [];
    this.portals = [];
    this.drops = [];
    this.biome = biomeOf(seed);
    this.crystal = { hp: CFG.crystal.hp, maxHp: CFG.crystal.hp, shieldUntil: 0, armorLv: 0, regenLv: 0, auraLv: 0, reflectLv: 0, judgeLv: 0, shockLv: 0, graceLv: 0, resonanceLv: 0, materielLv: 0, _regenAccum: 0, _auraTimer: 0, _judgeTimer: 0, _shockTimer: 0, _resonanceTimer: 0 };
    this.meteor = null;
    this._build();
    this._buildMeteorRing();
  }
  dispose() {
    this.sm.scene.remove(this.root);
  }
  _build() {
    this._buildCrystal();
    this._buildPortals();
    this._buildNodes();
    this._buildScenery();
    this.swampPits = [];
    if (this.biome === "swamp") this._buildSwampPits();
    this.icePits = [];
    if (this.biome === "tundra") this._buildIcePits();
  }
  // 늪지대 전용 — 독가스 구덩이를 시드에서 결정론적으로 고정된 자리에 배치한다(운석처럼 매번
  // 무작위 위치가 아니라 판마다 항상 같은 자리라, 두 번째부터는 플레이어가 외워서 피할 수 있다).
  // 자원 노드 배치(_buildNodes)와 완전히 별개인 시드로 굴려서, 이 기능이 나무·바위 개수/위치를
  // 하나도 바꾸지 않는다(기존 저장 호환에 영향 없음).
  _buildSwampPits() {
    const cfg = CFG.swampPit;
    const rng = mulberry32(this.seed * 17 + 29);
    const inner = CFG.world.coreRadius + 4, outer = CFG.world.buildRadius - 2.5;
    let tries = 0;
    while (this.swampPits.length < cfg.count && tries < cfg.count * 80) {
      tries++;
      const a = rng() * Math.PI * 2;
      const r = inner + rng() * (outer - inner);
      const x2 = Math.cos(a) * r, z2 = Math.sin(a) * r;
      if (this.swampPits.some((s2) => dist(s2.x, s2.z, x2, z2) < cfg.minGap)) continue;
      if (this.portals.some((p2) => dist(p2.x, p2.z, x2, z2) < 6)) continue;
      if (this.nodes.some((n) => dist(n.x, n.z, x2, z2) < 2.6)) continue;
      const ring = new THREE.Mesh(GEO.meteorRing, MAT.swampPit.clone());
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x2, 0.05, z2);
      ring.scale.setScalar(cfg.radius);
      this.scene.add(ring);
      this.swampPits.push({ x: x2, z: z2, ring, phase: "dormant" });
    }
  }
  // 구덩이 단계 자체의 진행(dormant→warn→active→dormant...)과 시간 누적은 game.js가 호스트에서만
  // 계산하고(운석·용암 웅덩이와 완전히 같은 원칙 — 참가자 화면이 각자 dt로 따로 진행시키면 배경
  // 탭 스로틀링(문서에 기록된 2fps 함정)으로 호스트·참가자의 단계가 어긋난다), 그 결과만 스냅샷의
  // `sw` 필드로 참가자에게 전파돼 이 setter로 반영된다. 여기서는 현재 phase를 색·투명도로만
  // 그린다 — 시간 계산은 전혀 하지 않는다.
  setSwampPitPhase(i, phase) {
    const s2 = this.swampPits[i];
    if (s2) s2.phase = phase;
  }
  updateSwampPitVisual(now) {
    for (const s2 of this.swampPits) {
      const m2 = s2.ring.material;
      if (s2.phase === "warn") {
        m2.color.setHex(11987456);
        m2.opacity = 0.35 + Math.abs(Math.sin(now * 9)) * 0.4;
      } else if (s2.phase === "active") {
        m2.color.setHex(3407462);
        m2.opacity = 0.55 + Math.abs(Math.sin(now * 4)) * 0.3;
      } else {
        m2.color.setHex(3163600);
        m2.opacity = 0.16 + Math.sin(now * 0.8 + s2.x) * 0.06;
      }
    }
  }
  // 설원 전용 — 위 늪지대 배치와 완전히 같은 시드 파생 방식(자원·포탈과 겹치지 않게),
  // 별도 오프셋(*23+41)을 써서 같은 시드라도 늪지대와 다른 자리가 나오게 한다.
  _buildIcePits() {
    const cfg = CFG.icePit;
    const rng = mulberry32(this.seed * 23 + 41);
    const inner = CFG.world.coreRadius + 4, outer = CFG.world.buildRadius - 2.5;
    let tries = 0;
    while (this.icePits.length < cfg.count && tries < cfg.count * 80) {
      tries++;
      const a = rng() * Math.PI * 2;
      const r = inner + rng() * (outer - inner);
      const x2 = Math.cos(a) * r, z2 = Math.sin(a) * r;
      if (this.icePits.some((s2) => dist(s2.x, s2.z, x2, z2) < cfg.minGap)) continue;
      if (this.portals.some((p2) => dist(p2.x, p2.z, x2, z2) < 6)) continue;
      if (this.nodes.some((n) => dist(n.x, n.z, x2, z2) < 2.6)) continue;
      const ring = new THREE.Mesh(GEO.meteorRing, MAT.icePit.clone());
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x2, 0.05, z2);
      ring.scale.setScalar(cfg.radius);
      this.scene.add(ring);
      this.icePits.push({ x: x2, z: z2, ring, phase: "dormant" });
    }
  }
  setIcePitPhase(i, phase) {
    const s2 = this.icePits[i];
    if (s2) s2.phase = phase;
  }
  updateIcePitVisual(now) {
    for (const s2 of this.icePits) {
      const m2 = s2.ring.material;
      if (s2.phase === "warn") {
        m2.color.setHex(16777215);
        m2.opacity = 0.4 + Math.abs(Math.sin(now * 9)) * 0.4;
      } else if (s2.phase === "active") {
        m2.color.setHex(6737151);
        m2.opacity = 0.55 + Math.abs(Math.sin(now * 3)) * 0.25;
      } else {
        m2.color.setHex(11393254);
        m2.opacity = 0.18 + Math.sin(now * 0.8 + s2.x) * 0.06;
      }
    }
  }
  _buildCrystal() {
    const g2 = new THREE.Group();
    const ped = new THREE.Mesh(GEO.pedestal, MAT.pedestal);
    ped.position.y = 0.55;
    ped.castShadow = true;
    ped.receiveShadow = true;
    g2.add(ped);
    const core = new THREE.Mesh(GEO.crystal, MAT.crystal.clone());
    core.position.y = 3.4;
    core.castShadow = true;
    g2.add(core);
    this.crystalMesh = core;
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(3.8, 4.4, 48),
      new THREE.MeshBasicMaterial({ color: 6545663, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.06;
    g2.add(halo);
    this.crystalHalo = halo;
    const shield = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 24, 16),
      new THREE.MeshBasicMaterial({ color: 16766720, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
    );
    shield.position.y = 3.4;
    shield.visible = false;
    g2.add(shield);
    this.crystalShield = shield;
    const milestoneColors = [13675850, 14212848, 16766058];
    const milestoneTilts = [0.35, -0.35, 0.9];
    this.crystalMilestoneRings = milestoneColors.map((color, i) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(2.7 + i * 0.35, 0.055, 8, 40),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide })
      );
      ring.position.y = 3.4;
      ring.rotation.x = Math.PI / 2 + milestoneTilts[i];
      ring.rotation.y = i * 1.1;
      ring.visible = false;
      g2.add(ring);
      return ring;
    });
    this.crystalMilestone = 0;
    this.scene.add(g2);
    this.crystalGroup = g2;
  }
  // 웨이브 수만으로 계산되는 값이라 호스트·참가자·저장 이어하기 전부 새 네트워크 필드 없이
  // 각자 똑같은 tier를 얻는다 — game.js가 매 프레임 여기로 현재 tier를 넘겨준다.
  setCrystalMilestone(tier) {
    if (tier === this.crystalMilestone) return;
    this.crystalMilestone = tier;
    this.crystalMilestoneRings.forEach((ring, i) => {
      ring.visible = i < tier;
      if (!ring.visible) ring.material.opacity = 0;
    });
  }
  _buildPortals() {
    const r = CFG.world.size * 0.44;
    const biomeCfg = CFG.biomes[this.biome];
    const n = biomeCfg.portalCount;
    let angles;
    if (this.biome === "canyon") {
      const spread = Math.PI * 0.3;
      const base = Math.PI * 0.25;
      angles = [base - spread / 2, base + spread / 2];
    } else {
      angles = [];
      for (let i = 0; i < n; i++) angles.push(Math.PI * 2 * i / n + Math.PI / 4);
    }
    for (const a of angles) {
      const x2 = Math.cos(a) * r, z2 = Math.sin(a) * r;
      const m2 = new THREE.Mesh(GEO.portal, MAT.portal);
      m2.position.set(x2, 2.2, z2);
      m2.rotation.y = -a;
      this.scene.add(m2);
      this.portals.push({ x: x2, z: z2, mesh: m2, sealed: false });
    }
  }
  _buildNodes() {
    const rng = mulberry32(this.seed);
    const inner = CFG.world.buildRadius + 3;
    const outer = CFG.world.size * 0.42;
    let id = 0;
    const place = (type, count) => {
      let tries = 0;
      let made = 0;
      while (made < count && tries < count * 40) {
        tries++;
        const a = rng() * Math.PI * 2;
        const r = inner + rng() * (outer - inner);
        const x2 = Math.cos(a) * r, z2 = Math.sin(a) * r;
        if (this.nodes.some((n) => dist(n.x, n.z, x2, z2) < 3)) continue;
        if (this.portals.some((p2) => dist(p2.x, p2.z, x2, z2) < 6)) continue;
        this.nodes.push(this._makeNode(id++, type, x2, z2, rng));
        made++;
      }
    };
    const mult = CFG.biomes[this.biome].nodeMult;
    place("tree", Math.round(46 * mult));
    place("rock", Math.round(30 * mult));
    place("copper", Math.max(4, Math.round(9 * mult)));
    place("coal", Math.max(4, Math.round(8 * mult)));
  }
  _makeNode(id, type, x2, z2, rng) {
    const cfg = CFG.harvest[type];
    let body, stump;
    const g2 = new THREE.Group();
    g2.position.set(x2, 0, z2);
    g2.rotation.y = rng() * Math.PI * 2;
    if (type === "tree") {
      const trunk = new THREE.Mesh(GEO.trunk, MAT.trunk);
      trunk.position.y = 1.1;
      trunk.castShadow = true;
      const leaf = new THREE.Mesh(GEO.leaf, rng() > 0.75 ? MAT.leafDry : MAT.leaf);
      leaf.position.y = 3.4;
      leaf.castShadow = true;
      const s2 = 0.85 + rng() * 0.4;
      leaf.scale.setScalar(s2);
      g2.add(trunk, leaf);
      body = leaf;
      stump = new THREE.Mesh(GEO.stump, MAT.trunk);
      stump.position.y = 0.25;
      stump.visible = false;
      g2.add(stump);
    } else {
      const rockG = new THREE.Group();
      const n = 2 + Math.floor(rng() * 2);
      for (let i = 0; i < n; i++) {
        const oreMat = type === "copper" ? MAT.copperOre : type === "coal" ? MAT.coalOre : MAT.ore;
        const m2 = new THREE.Mesh(GEO.rock, rng() > (type === "rock" ? 0.6 : 0.25) ? oreMat : MAT.rock);
        m2.position.set((rng() - 0.5) * 1.6, 0.4 + rng() * 0.4, (rng() - 0.5) * 1.6);
        m2.scale.setScalar(0.5 + rng() * 0.6);
        m2.rotation.set(rng() * 3, rng() * 3, rng() * 3);
        m2.castShadow = true;
        m2.receiveShadow = true;
        rockG.add(m2);
      }
      g2.add(rockG);
      body = rockG;
      stump = new THREE.Mesh(GEO.rock, MAT.rock);
      stump.scale.setScalar(0.28);
      stump.position.y = 0.15;
      stump.visible = false;
      g2.add(stump);
    }
    this.scene.add(g2);
    const mimic = rng() < CFG.mimic.chance;
    return {
      id,
      type,
      x: x2,
      z: z2,
      charges: cfg.charges,
      maxCharges: cfg.charges,
      respawnAt: 0,
      depleted: false,
      group: g2,
      body,
      stump,
      radius: type === "tree" ? 1 : 1.3,
      mimic
    };
  }
  _buildScenery() {
    const rng = mulberry32(this.seed * 7 + 13);
    const half = CFG.world.size * 0.5;
    for (let i = 0; i < 90; i++) {
      const a = rng() * Math.PI * 2;
      const r = half * (0.5 + rng() * 0.52);
      const x2 = Math.cos(a) * r, z2 = Math.sin(a) * r;
      if (Math.abs(x2) > half - 2 || Math.abs(z2) > half - 2) continue;
      if (Math.hypot(x2, z2) < CFG.world.size * 0.42) continue;
      const m2 = new THREE.Mesh(rng() > 0.5 ? GEO.leaf : GEO.rock, rng() > 0.5 ? MAT.leaf : MAT.rock);
      m2.position.set(x2, rng() > 0.5 ? 2.2 : 0.5, z2);
      m2.scale.setScalar(0.6 + rng() * 0.7);
      m2.castShadow = true;
      this.scene.add(m2);
    }
  }
  // --- 자원 노드 ---
  nodeById(id) {
    return this.nodes.find((n) => n.id === id);
  }
  nearestNode(x2, z2, range) {
    let best = null, bd2 = range * range;
    for (const n of this.nodes) {
      if (n.depleted) continue;
      const d2 = (n.x - x2) ** 2 + (n.z - z2) ** 2;
      if (d2 < bd2) {
        bd2 = d2;
        best = n;
      }
    }
    return best;
  }
  consumeNode(node) {
    node.charges -= 1;
    if (node.charges <= 0) {
      node.depleted = true;
      node.respawnAt = performance.now() / 1e3 + CFG.harvest[node.type].respawn;
    }
    this._refreshNodeVisual(node);
  }
  // respawnAt은 호스트가 consumeNode()에서만 채우는 값이라(호스트 로컬 performance.now() 기준),
  // 참가자 쪽 값은 항상 초기값 0으로 남아 있다 — 참가자도 이 시간 기준 자동 복원 로직을 그대로
  // 돌리면 "0 >= respawnAt(0)"이 항상 참이라 depleted가 세팅되는 바로 다음 프레임에 즉시 다시
  // false로 풀려버린다(깜빡이며 계속 되살아나는 것처럼 보임). 그래서 실제 시간 기준 복원 판정은
  // 호스트에서만 돌리고, 참가자는 순전히 스냅샷의 depleted 값(applyNodeSnapshot)만 믿는다 —
  // 자라나는 애니메이션(scale 0.2→1)은 그쪽에서 상태 전환을 감지했을 때 별도로 틔운다.
  updateNodes(now, isHost = true) {
    for (const n of this.nodes) {
      if (isHost && n.depleted && now >= n.respawnAt) {
        n.depleted = false;
        n.charges = n.maxCharges;
        this._refreshNodeVisual(n);
        n.group.scale.setScalar(0.2);
      }
      const targetScale = n.depleted ? 1 : 1;
      if (n.group.scale.x < targetScale) {
        n.group.scale.setScalar(Math.min(1, n.group.scale.x + 0.06));
      }
    }
  }
  _refreshNodeVisual(n) {
    n.body.visible = !n.depleted;
    n.stump.visible = n.depleted;
    if (!n.depleted) {
      const t2 = n.charges / n.maxCharges;
      n.body.scale.setScalar(n.type === "tree" ? 0.6 + t2 * 0.4 : 0.7 + t2 * 0.3);
    }
  }
  // 네트워크 동기화용 노드 상태
  nodeSnapshot() {
    return this.nodes.map((n) => n.depleted ? -1 : n.charges);
  }
  applyNodeSnapshot(arr) {
    if (!arr) return;
    for (let i = 0; i < this.nodes.length && i < arr.length; i++) {
      const n = this.nodes[i];
      const v2 = arr[i];
      const dep = v2 < 0;
      if (n.depleted !== dep || n.charges !== v2) {
        if (n.depleted && !dep) n.group.scale.setScalar(0.2);
        n.depleted = dep;
        n.charges = dep ? 0 : v2;
        this._refreshNodeVisual(n);
      }
    }
  }
  // 솔로 저장/이어하기 전용 — nodeSnapshot()은 depleted 여부·charges만 담고(참가자 쪽 12Hz
  // 스냅샷 크기를 계속 작게 유지하려는 설계) respawnAt(정확히 언제 다시 캘 수 있는지)은 안 싣는다.
  // 그래서 이어하기 직후 depleted:true로 복원된 노드도 respawnAt은 이 인스턴스의 기본값 0에
  // 머물러 있어, 다음 update() 한 틱만 지나면 "지금 시각이 0보다 크다"는 이유로 즉시 다시
  // 채집 가능 상태로 풀려버린다(원래 20~40초 걸리는 재생을 새로고침 한 번으로 건너뛰는 셈).
  // resumeLocal이 이 메서드로 depleted 노드의 타이머를 다시 정상적으로 되돌려 놓는다.
  restartDepletedRespawns() {
    const now = performance.now() / 1e3;
    for (const n of this.nodes) {
      if (n.depleted) n.respawnAt = now + CFG.harvest[n.type].respawn;
    }
  }
  // --- 운석 낙하 경고 ---
  // 낙하 시점의 실제 피해는 game.js 가 계산한다(호스트 전용). World 는 경고 위치·잔여시간을
  // 들고 순수하게 그려주기만 한다 — 참가자 화면도 스냅샷으로 받은 같은 값을 넣으면 똑같이 보인다.
  _buildMeteorRing() {
    const ring = new THREE.Mesh(GEO.meteorRing, MAT.meteorWarn);
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    this.scene.add(ring);
    this.meteorRing = ring;
    const cr2 = new THREE.Mesh(GEO.meteorRing, MAT.lavaCrater);
    cr2.rotation.x = -Math.PI / 2;
    cr2.visible = false;
    this.scene.add(cr2);
    this.craterRing = cr2;
    const rr2 = new THREE.Mesh(GEO.riftRing, MAT.riftRing.clone());
    rr2.rotation.x = -Math.PI / 2;
    rr2.visible = false;
    this.scene.add(rr2);
    this.riftRing = rr2;
    const rc = new THREE.Mesh(GEO.riftCore, MAT.riftCore.clone());
    rc.rotation.x = -Math.PI / 2;
    rc.visible = false;
    this.scene.add(rc);
    this.riftCore = rc;
    const sc = new THREE.Mesh(GEO.spiritCore, MAT.spiritCore.clone());
    sc.visible = false;
    this.scene.add(sc);
    this.spiritCore = sc;
    const sr2 = new THREE.Mesh(GEO.spiritRing, MAT.spiritRing.clone());
    sr2.rotation.x = -Math.PI / 2;
    sr2.visible = false;
    this.scene.add(sr2);
    this.spiritRing = sr2;
    const petBodyMat = MAT.petBody.clone();
    const petGroup = new THREE.Group();
    const petBody = new THREE.Mesh(GEO.petBody, petBodyMat);
    petBody.castShadow = true;
    petGroup.add(petBody);
    const petSnout = new THREE.Mesh(GEO.petSnout, petBodyMat);
    petSnout.rotation.x = Math.PI / 2;
    petSnout.position.set(0, -0.02, 0.34);
    petGroup.add(petSnout);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(GEO.petEar, petBodyMat);
      ear.position.set(0.17 * side, 0.32, 0.05);
      ear.rotation.z = 0.25 * side;
      petGroup.add(ear);
    }
    const petTail = new THREE.Mesh(GEO.petTail, petBodyMat);
    petTail.rotation.x = -Math.PI / 2.6;
    petTail.position.set(0, 0.08, -0.42);
    petGroup.add(petTail);
    petGroup.visible = false;
    this.scene.add(petGroup);
    this.petGroup = petGroup;
    this.petBodyMat = petBodyMat;
    const pr2 = new THREE.Mesh(GEO.petRing, MAT.petRing.clone());
    pr2.rotation.x = -Math.PI / 2;
    pr2.visible = false;
    this.scene.add(pr2);
    this.petRing = pr2;
  }
  setRift(x2, z2, timeLeft, radius) {
    this.rift = { x: x2, z: z2, timeLeft, radius };
  }
  clearRift() {
    this.rift = null;
    if (this.riftRing) this.riftRing.visible = false;
    if (this.riftCore) this.riftCore.visible = false;
  }
  updateRiftVisual(now) {
    if (!this.rift) {
      if (this.riftRing) this.riftRing.visible = false;
      if (this.riftCore) this.riftCore.visible = false;
      return;
    }
    const { x: x2, z: z2, radius } = this.rift;
    this.riftRing.visible = true;
    this.riftRing.position.set(x2, 0.07, z2);
    this.riftRing.scale.setScalar(radius);
    this.riftRing.rotation.z = now * 1.6;
    this.riftRing.material.opacity = 0.55 + Math.abs(Math.sin(now * 4)) * 0.35;
    this.riftCore.visible = true;
    this.riftCore.position.set(x2, 0.06, z2);
    this.riftCore.scale.setScalar(radius * (0.35 + (1 - now * 1.2 % 1) * 0.5));
    this.riftCore.material.opacity = 0.18 + now * 1.2 % 1 * 0.3;
  }
  setSpirit(x2, z2, timeLeft) {
    this.spirit = { x: x2, z: z2, timeLeft };
  }
  clearSpirit() {
    this.spirit = null;
    if (this.spiritCore) this.spiritCore.visible = false;
    if (this.spiritRing) this.spiritRing.visible = false;
  }
  updateSpiritVisual(now) {
    if (!this.spirit) {
      if (this.spiritCore) this.spiritCore.visible = false;
      if (this.spiritRing) this.spiritRing.visible = false;
      return;
    }
    const { x: x2, z: z2 } = this.spirit;
    this.spiritCore.visible = true;
    this.spiritCore.position.set(x2, 1.3 + Math.sin(now * 3) * 0.15, z2);
    this.spiritCore.rotation.y = now * 1.8;
    this.spiritCore.rotation.x = now * 1.1;
    this.spiritRing.visible = true;
    this.spiritRing.position.set(x2, 0.06, z2);
    this.spiritRing.material.opacity = 0.35 + Math.abs(Math.sin(now * 4)) * 0.25;
  }
  // 정령과 달리 시간제한이 없어 timeLeft 인자가 없다 — type(여우/늑대)에 따라 색·크기만 다시 칠한다.
  // lv(먹이주기 레벨)가 오르면 몸집이 조금씩 커져서, 강해졌다는 게 스탯 창을 안 열어봐도 눈으로 보인다.
  setPet(x2, z2, type, rot, lv) {
    lv = lv || 0;
    if (this.pet?.type !== type || this.pet?.lv !== lv) {
      const tc2 = CFG.tame[type];
      this.petBodyMat.color.setHex(tc2.color);
      const base = type === "wolf" ? 1.15 : type === "stagking" ? 1.05 : type === "hawk" ? 0.7 : 0.85;
      this.petGroup.scale.setScalar(base * (1 + lv * 0.12));
      this.petRing.material.color.setHex(tc2.color);
    }
    this.pet = { x: x2, z: z2, type, rot, lv };
  }
  clearPet() {
    this.pet = null;
    if (this.petGroup) this.petGroup.visible = false;
    if (this.petRing) this.petRing.visible = false;
  }
  updatePetVisual(now) {
    if (!this.pet) {
      if (this.petGroup) this.petGroup.visible = false;
      if (this.petRing) this.petRing.visible = false;
      return;
    }
    const { x: x2, z: z2, rot, type } = this.pet;
    this.petGroup.visible = true;
    const baseY = type === "hawk" ? 2.6 : 0.36;
    this.petGroup.position.set(x2, baseY + Math.abs(Math.sin(now * 5)) * 0.08, z2);
    if (rot !== void 0) this.petGroup.rotation.y = rot;
    this.petRing.visible = true;
    this.petRing.position.set(x2, 0.05, z2);
    this.petRing.material.opacity = 0.35 + Math.abs(Math.sin(now * 3)) * 0.25;
  }
  setMeteor(x2, z2, timeLeft, radius) {
    this.meteor = { x: x2, z: z2, timeLeft, radius };
  }
  clearMeteor() {
    this.meteor = null;
    if (this.meteorRing) this.meteorRing.visible = false;
  }
  updateMeteorVisual(now) {
    if (!this.meteor) {
      if (this.meteorRing) this.meteorRing.visible = false;
      return;
    }
    const r = this.meteorRing;
    r.visible = true;
    r.position.set(this.meteor.x, 0.06, this.meteor.z);
    r.scale.setScalar(this.meteor.radius);
    r.material.opacity = 0.3 + Math.abs(Math.sin(now * 7)) * 0.45;
  }
  // --- 용암 웅덩이(화산지대 운석 낙하 후) ---
  // 경고 링과 같은 방식으로 위치·잔여시간만 들고, 실제 지속 피해는 game.js가 호스트에서 계산한다.
  setCrater(x2, z2, timeLeft, radius) {
    this.crater = { x: x2, z: z2, timeLeft, radius };
  }
  clearCrater() {
    this.crater = null;
    if (this.craterRing) this.craterRing.visible = false;
  }
  updateCraterVisual(now) {
    if (!this.crater) {
      if (this.craterRing) this.craterRing.visible = false;
      return;
    }
    const r = this.craterRing;
    r.visible = true;
    r.position.set(this.crater.x, 0.055, this.crater.z);
    r.scale.setScalar(this.crater.radius);
    r.material.opacity = 0.35 + Math.abs(Math.sin(now * 2.4)) * 0.3;
  }
  // --- 보급품 투하 ---
  // kind: "supply"(목재·광물, 나무 상자) | "shard"(정수, 빛나는 보석 — GEO.gem/MAT.gem은
  // 정수석 채집 노드가 있던 시절 쓰던 자산인데 그 노드가 없어진 뒤로 완전히 안 쓰이고
  // 있었다. 그 자산을 그대로 재사용해 "정수처럼 보이는" 드롭을 새로 안 만들고 살렸다.
  spawnDrop(id, x2, z2, kind = "supply") {
    const g2 = new THREE.Group();
    g2.position.set(x2, 0.12, z2);
    if (kind === "shard") {
      const gem = new THREE.Mesh(GEO.gem, MAT.gem);
      gem.position.y = 0.55;
      gem.castShadow = true;
      g2.add(gem);
      const ring = new THREE.Mesh(GEO.dropRing, MAT.gem);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -0.07;
      g2.add(ring);
      const beam = new THREE.Mesh(GEO.dropBeam, MAT.gem);
      beam.position.y = 3.4;
      g2.add(beam);
    } else {
      const crate = new THREE.Mesh(GEO.crate, MAT.crate);
      crate.position.y = 0.45;
      crate.castShadow = true;
      g2.add(crate);
      const ring = new THREE.Mesh(GEO.dropRing, MAT.dropGlow);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -0.07;
      g2.add(ring);
      const beam = new THREE.Mesh(GEO.dropBeam, MAT.dropGlow);
      beam.position.y = 3.4;
      g2.add(beam);
    }
    this.scene.add(g2);
    const drop = { id, x: x2, z: z2, group: g2, requested: false, kind };
    this.drops.push(drop);
    return drop;
  }
  removeDrop(id) {
    const i = this.drops.findIndex((d2) => d2.id === id);
    if (i < 0) return;
    this.scene.remove(this.drops[i].group);
    this.drops.splice(i, 1);
  }
  dropSnapshot() {
    return this.drops.map((d2) => [d2.id, Math.round(d2.x * 10) / 10, Math.round(d2.z * 10) / 10, d2.kind]);
  }
  applyDropSnapshot(list) {
    const seen = /* @__PURE__ */ new Set();
    for (const [id, x2, z2, kind] of list) {
      seen.add(id);
      if (!this.drops.some((d2) => d2.id === id)) this.spawnDrop(id, x2, z2, kind || "supply");
    }
    for (let i = this.drops.length - 1; i >= 0; i--) {
      if (!seen.has(this.drops[i].id)) this.removeDrop(this.drops[i].id);
    }
  }
  updateDrops(dt2, now) {
    if (!this.drops.length) return;
    MAT.dropGlow.opacity = 0.4 + Math.sin(now * 4) * 0.15;
    for (const d2 of this.drops) {
      d2.group.position.y = 0.12 + Math.sin(now * 2.2 + d2.id) * 0.1;
      d2.group.rotation.y += dt2 * 1.1;
    }
  }
  // 건설 시 자원 노드와 겹치는지
  blocksBuild(x2, z2) {
    for (const n of this.nodes) {
      if (n.depleted) continue;
      if (dist(n.x, n.z, x2, z2) < n.radius + 0.9) return true;
    }
    return false;
  }
  damageCrystal(amount) {
    if (performance.now() / 1e3 < this.crystal.shieldUntil) return false;
    this.crystal.hp = Math.max(0, this.crystal.hp - amount);
    this._pulse = 0.35;
    return this.crystal.hp <= 0;
  }
  healCrystal(amount) {
    this.crystal.hp = Math.min(this.crystal.maxHp, this.crystal.hp + amount);
  }
  // 긴급 방벽 스킬: duration초 동안 크리스탈이 어떤 피해도 받지 않는다
  activateShield(duration) {
    this.crystal.shieldUntil = performance.now() / 1e3 + duration;
  }
  update(dt2, now, isHost = true) {
    this.crystalMesh.rotation.y += dt2 * 0.5;
    this.crystalMesh.position.y = 3.4 + Math.sin(now * 1.6) * 0.18;
    const ratio = this.crystal.hp / this.crystal.maxHp;
    this.crystalMesh.material.emissiveIntensity = 0.6 + ratio * 1.2;
    this.crystalMesh.material.color.setHSL(0.52 * ratio + 0, 0.9, 0.55 + 0.1 * ratio);
    this.sm.crystalLight.intensity = (1.2 + ratio * 1.6) * this.sm.crystalNightMult;
    if (this._pulse > 0) {
      this._pulse -= dt2;
      const s2 = 1 + Math.max(0, this._pulse) * 0.6;
      this.crystalMesh.scale.setScalar(s2);
      this.crystalHalo.material.opacity = 0.4 + Math.max(0, this._pulse);
    } else {
      this.crystalMesh.scale.setScalar(1);
      this.crystalHalo.material.opacity = 0.35 + Math.sin(now * 2) * 0.08;
    }
    for (let i = 0; i < this.crystalMilestoneRings.length; i++) {
      const ring = this.crystalMilestoneRings[i];
      if (!ring.visible) continue;
      ring.rotation.z += dt2 * (0.25 + i * 0.12);
      ring.material.opacity = Math.min(0.85, ring.material.opacity + dt2 * 0.8);
    }
    const shieldLeft = this.crystal.shieldUntil - now;
    if (shieldLeft > 0) {
      this.crystalShield.visible = true;
      this.crystalShield.material.opacity = 0.16 + Math.sin(now * 6) * 0.06 + Math.min(0.15, shieldLeft * 0.3);
      this.crystalShield.rotation.y += dt2 * 0.7;
    } else if (this.crystalShield.visible) {
      this.crystalShield.visible = false;
    }
    for (const p2 of this.portals) {
      if (p2.sealed) {
        p2.mesh.material = MAT.portalSealed;
        continue;
      }
      p2.mesh.material = MAT.portal;
      p2.mesh.rotation.z += dt2 * 1.2;
      p2.mesh.material.emissiveIntensity = 0.9 + Math.sin(now * 3 + p2.x) * 0.35;
    }
    this.updateNodes(now, isHost);
    this.updateDrops(dt2, now);
    this.updateMeteorVisual(now);
    this.updateCraterVisual(now);
    this.updateSwampPitVisual(now);
    this.updateIcePitVisual(now);
    this.updateRiftVisual(now);
    this.updateSpiritVisual(now);
    this.updatePetVisual(now);
  }
};
