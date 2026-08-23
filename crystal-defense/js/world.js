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
  meteorRing: new THREE.RingGeometry(0.92, 1, 48)
};
var MAT = {
  trunk: new THREE.MeshStandardMaterial({ color: 5979428, roughness: 0.95 }),
  leaf: new THREE.MeshStandardMaterial({ color: 4098887, roughness: 0.9 }),
  leafDry: new THREE.MeshStandardMaterial({ color: 7306549, roughness: 0.9 }),
  rock: new THREE.MeshStandardMaterial({ color: 9146266, roughness: 0.85, metalness: 0.06 }),
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
  meteorWarn: new THREE.MeshBasicMaterial({ color: 16729139, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })
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
    this.crystal = { hp: CFG.crystal.hp, maxHp: CFG.crystal.hp, shieldUntil: 0, armorLv: 0, regenLv: 0, auraLv: 0, _regenAccum: 0, _auraTimer: 0 };
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
    this.scene.add(g2);
    this.crystalGroup = g2;
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
      this.portals.push({ x: x2, z: z2, mesh: m2 });
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
    place("gem", Math.max(3, Math.round(5 * mult)));
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
    } else if (type === "gem") {
      const cluster = new THREE.Group();
      const n = 2 + Math.floor(rng() * 2);
      for (let i = 0; i < n; i++) {
        const m2 = new THREE.Mesh(GEO.gem, MAT.gem);
        m2.position.set((rng() - 0.5) * 0.7, 0.35 + rng() * 0.35, (rng() - 0.5) * 0.7);
        m2.scale.setScalar(0.6 + rng() * 0.7);
        m2.rotation.set(rng() * 3, rng() * 3, rng() * 3);
        m2.castShadow = true;
        cluster.add(m2);
      }
      g2.add(cluster);
      body = cluster;
      stump = new THREE.Mesh(GEO.gemStump, MAT.gemStump);
      stump.position.y = 0.08;
      stump.visible = false;
      g2.add(stump);
    } else {
      const rockG = new THREE.Group();
      const n = 2 + Math.floor(rng() * 2);
      for (let i = 0; i < n; i++) {
        const m2 = new THREE.Mesh(GEO.rock, rng() > 0.6 ? MAT.ore : MAT.rock);
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
      radius: type === "tree" ? 1 : type === "gem" ? 0.8 : 1.3
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
  updateNodes(now) {
    for (const n of this.nodes) {
      if (n.depleted && now >= n.respawnAt) {
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
        n.depleted = dep;
        n.charges = dep ? 0 : v2;
        this._refreshNodeVisual(n);
      }
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
  // --- 보급품 투하 ---
  spawnDrop(id, x2, z2) {
    const g2 = new THREE.Group();
    g2.position.set(x2, 0.12, z2);
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
    this.scene.add(g2);
    const drop = { id, x: x2, z: z2, group: g2, requested: false };
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
    return this.drops.map((d2) => [d2.id, Math.round(d2.x * 10) / 10, Math.round(d2.z * 10) / 10]);
  }
  applyDropSnapshot(list) {
    const seen = /* @__PURE__ */ new Set();
    for (const [id, x2, z2] of list) {
      seen.add(id);
      if (!this.drops.some((d2) => d2.id === id)) this.spawnDrop(id, x2, z2);
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
  update(dt2, now) {
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
    const shieldLeft = this.crystal.shieldUntil - now;
    if (shieldLeft > 0) {
      this.crystalShield.visible = true;
      this.crystalShield.material.opacity = 0.16 + Math.sin(now * 6) * 0.06 + Math.min(0.15, shieldLeft * 0.3);
      this.crystalShield.rotation.y += dt2 * 0.7;
    } else if (this.crystalShield.visible) {
      this.crystalShield.visible = false;
    }
    for (const p2 of this.portals) {
      p2.mesh.rotation.z += dt2 * 1.2;
      p2.mesh.material.emissiveIntensity = 0.9 + Math.sin(now * 3 + p2.x) * 0.35;
    }
    this.updateNodes(now);
    this.updateDrops(dt2, now);
    this.updateMeteorVisual(now);
  }
};
