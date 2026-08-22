import * as THREE from '../vendor/three.module.js';
import { CFG } from './config.js';
import { canAfford, dist } from './utils.js';

var GEO2 = {
  wall: new THREE.BoxGeometry(1.88, 2.3, 1.88),
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
  buffRing: new THREE.RingGeometry(1.05, 1.25, 24)
};
var MAT2 = {
  wall: [
    new THREE.MeshStandardMaterial({ color: 9080729, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 10465476, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 14207373, roughness: 0.6, metalness: 0.3 })
  ],
  base: new THREE.MeshStandardMaterial({ color: 7171962, roughness: 0.9 }),
  arrow: new THREE.MeshStandardMaterial({ color: 13148506, roughness: 0.6, metalness: 0.2 }),
  frost: new THREE.MeshStandardMaterial({ color: 7329023, emissive: 2787e3, emissiveIntensity: 0.7, roughness: 0.3 }),
  cannon: new THREE.MeshStandardMaterial({ color: 5001568, roughness: 0.5, metalness: 0.5 }),
  poison: new THREE.MeshStandardMaterial({ color: 3526479, emissive: 1871706, emissiveIntensity: 0.7, roughness: 0.4 }),
  support: new THREE.MeshStandardMaterial({ color: 14061311, emissive: 6959264, emissiveIntensity: 0.8, roughness: 0.35 }),
  workbenchTop: new THREE.MeshStandardMaterial({ color: 12159565, roughness: 0.8 }),
  workbenchLeg: new THREE.MeshStandardMaterial({ color: 5979940, roughness: 0.9 }),
  workbenchTool: new THREE.MeshStandardMaterial({ color: 10137781, roughness: 0.5, metalness: 0.4 }),
  ghostOk: new THREE.MeshStandardMaterial({ color: 5570463, transparent: true, opacity: 0.45, emissive: 2002770, emissiveIntensity: 0.6 }),
  ghostBad: new THREE.MeshStandardMaterial({ color: 16734826, transparent: true, opacity: 0.4, emissive: 9379372, emissiveIntensity: 0.6 }),
  barBg: new THREE.MeshBasicMaterial({ color: 1119519, transparent: true, opacity: 0.8, depthTest: false }),
  barFg: new THREE.MeshBasicMaterial({ color: 6745736, depthTest: false }),
  rangeRing: new THREE.MeshBasicMaterial({ color: 14061311, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
  buffRing: new THREE.MeshBasicMaterial({ color: 14061311, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
};
var RANGE_RING_GEO = new THREE.RingGeometry(0.96, 1, 40);
var PROJECTILE_COLOR = { arrow: 16769162, frost: 8382719, cannon: 16751178, poison: 3526479 };
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
    this.ownerId = ownerId;
    this.maxHp = def.levels[0].hp;
    this.hp = this.maxHp;
    this.cooldown = 0;
    this.mesh = buildMesh(key, 1);
    this.mesh.position.set(x2, 0, z2);
    this.mesh.userData.building = this;
    this._makeBar();
  }
  get stats() {
    return this.def.levels[this.level - 1];
  }
  get isSupport() {
    return this.key === "support";
  }
  get isWorkbench() {
    return this.key === "workbench";
  }
  get isTower() {
    return this.key !== "wall" && !this.isSupport && !this.isWorkbench;
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
    g2.add(bg, fg);
    g2.position.y = this.key === "wall" ? 2.7 : this.key === "workbench" ? 1.6 : 3.4;
    g2.visible = false;
    g2.renderOrder = 5;
    this.mesh.add(g2);
    this.bar = g2;
    this.barFg = fg;
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
  applyLevel(level) {
    this.level = level;
    const st = this.def.levels[level - 1];
    const ratio = this.hp / this.maxHp;
    this.maxHp = st.hp;
    this.hp = Math.min(this.maxHp, Math.max(1, Math.round(this.maxHp * ratio)));
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
    this._makeBar();
    this.turret = nm.userData.turret;
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
  }
};
function buildMesh(key, level) {
  const g2 = new THREE.Group();
  if (key === "wall") {
    const m2 = new THREE.Mesh(GEO2.wall, MAT2.wall[level - 1]);
    m2.position.y = 1.15;
    m2.castShadow = true;
    m2.receiveShadow = true;
    g2.add(m2);
    if (level >= 2) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(2, 0.28, 2), MAT2.wall[level - 1]);
      cap.position.y = 2.4;
      cap.castShadow = true;
      g2.add(cap);
    }
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
  const base = new THREE.Mesh(GEO2.base, MAT2.base);
  base.position.y = 0.35;
  base.castShadow = true;
  base.receiveShadow = true;
  const pillar = new THREE.Mesh(GEO2.pillar, MAT2.base);
  pillar.position.y = 1.5;
  pillar.castShadow = true;
  g2.add(base, pillar);
  const turret = new THREE.Group();
  turret.position.y = 2.6;
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
    this.onImpact = null;
    this.rangeRing = new THREE.Mesh(RANGE_RING_GEO, MAT2.rangeRing);
    this.rangeRing.rotation.x = -Math.PI / 2;
    this.rangeRing.position.y = 0.05;
    this.rangeRing.visible = false;
    this.root.add(this.rangeRing);
  }
  setMode(mode) {
    if (this.mode === mode) mode = null;
    this.mode = mode;
    this._syncGhost();
    this.sm.setBuildGridVisible(!!mode);
    this.sm.setBuildView(!!mode);
    return this.mode;
  }
  _syncGhost() {
    if (this.ghost) {
      this.root.remove(this.ghost);
      this.ghost = null;
    }
    if (!this.mode || !CFG.builds[this.mode]) return;
    const g2 = buildMesh(this.mode, 1);
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
  updateGhost(pointer, resources) {
    this.hover = null;
    if (!this.mode || !pointer) {
      if (this.ghost) this.ghost.visible = false;
      this.rangeRing.visible = false;
      return;
    }
    if (this.mode === "upgrade" || this.mode === "sell" || this.mode === "repair") {
      if (this.ghost) this.ghost.visible = false;
      const b = this.grid.atWorld(pointer.x, pointer.z);
      this.hover = b || null;
      if (b && b.isSupport) this._showRangeRing(b.x, b.z, b.stats.buffRadius);
      else if (b && b.isTower) this._showRangeRing(b.x, b.z, b.stats.range);
      else this.rangeRing.visible = false;
      return;
    }
    const g2 = this.grid.toGrid(pointer.x, pointer.z);
    const res = this.grid.canPlace(g2.gx, g2.gz, (x2, z2) => this.world.blocksBuild(x2, z2));
    const w2 = this.grid.toWorld(g2.gx, g2.gz);
    if (this.ghost) {
      this.ghost.visible = true;
      this.ghost.position.set(w2.x, 0, w2.z);
    }
    const lv1 = CFG.builds[this.mode].levels[0];
    const previewRadius = lv1.buffRadius ?? lv1.range;
    if (previewRadius) this._showRangeRing(w2.x, w2.z, previewRadius);
    else this.rangeRing.visible = false;
    let ok = res.ok;
    let why = res.why;
    if (ok && !canAfford(resources, CFG.builds[this.mode].cost)) {
      ok = false;
      why = "\uC790\uC6D0\uC774 \uBD80\uC871\uD569\uB2C8\uB2E4";
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
  // 실제 배치(권한 있는 쪽에서만 호출). 성공 시 Building 반환
  place(key, gx, gz, ownerId, id) {
    const res = this.grid.canPlace(gx, gz, (x2, z2) => this.world.blocksBuild(x2, z2));
    if (!res.ok) return null;
    const b = new Building(key, gx, gz, res.x, res.z, ownerId, id);
    if (id && id >= nextId) nextId = id + 1;
    this.root.add(b.mesh);
    this.buildings.set(b.id, b);
    this.grid.set(gx, gz, b);
    b.turret = b.mesh.userData.turret;
    this.fx.ring(res.x, res.z, 9109440, 2);
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
  // 현재 레벨까지 투입된 총 자원 (레벨 1 기본 비용 + 업그레이드 비용 누적)
  investedCost(b) {
    const total = { wood: 0, stone: 0 };
    for (let i = 0; i < b.level; i++) {
      const c2 = i === 0 ? b.def.cost : b.def.levels[i].cost;
      total.wood += c2?.wood || 0;
      total.stone += c2?.stone || 0;
    }
    return total;
  }
  refund(b) {
    const inv = this.investedCost(b);
    return { wood: Math.floor(inv.wood * 0.5), stone: Math.floor(inv.stone * 0.5) };
  }
  // 손상 비율에 비례한 수리 비용 (완전 파괴 상태를 100% 재건축하는 것보다 저렴하게)
  repairCost(b) {
    const ratio = 1 - b.hp / b.maxHp;
    if (ratio <= 1e-3) return null;
    const inv = this.investedCost(b);
    return { wood: Math.ceil(inv.wood * ratio * 0.4), stone: Math.ceil(inv.stone * ratio * 0.4) };
  }
  repair(b) {
    b.hp = b.maxHp;
    b.refreshBar();
  }
  // 호스트에서만: 타워 조준/사격
  updateTowers(dt2, enemies, now) {
    for (const b of this.buildings.values()) {
      if (!b.isTower) continue;
      const st = b.stats;
      b.cooldown -= dt2;
      const target = this._acquire(b, enemies, st.range);
      if (target && b.turret) {
        const ang = Math.atan2(target.x - b.x, target.z - b.z);
        b.turret.rotation.y = ang;
      }
      if (target && b.cooldown <= 0) {
        b.cooldown = 1 / st.rate;
        this.shoot(b, target);
      }
    }
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
  // 사거리 안에서 크리스탈에 가장 가까운(=가장 위협적인) 적
  _acquire(b, enemies, range) {
    let best = null, bestScore = Infinity;
    const r2 = range * range;
    for (const e of enemies) {
      if (e.dead) continue;
      const d2 = (e.x - b.x) ** 2 + (e.z - b.z) ** 2;
      if (d2 > r2) continue;
      const score = e.x * e.x + e.z * e.z;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }
  // 투사체 발사 연출 → 명중 시 onImpact (데미지 적용은 호스트에서만)
  shoot(b, target) {
    const st = b.stats;
    const mult = this.supportBuffMult(b);
    const effStats = mult !== 1 ? { ...st, dmg: Math.round(st.dmg * mult) } : st;
    const from = new THREE.Vector3(b.x, 2.9, b.z);
    const to2 = new THREE.Vector3(target.x, 0.8, target.z);
    const color = PROJECTILE_COLOR[b.key];
    const speed = b.key === "cannon" ? 26 : 42;
    this.projectiles.fire(from, to2, speed, color, (pos) => {
      this.fx.burst(pos.x, pos.y, pos.z, color, b.key === "cannon" ? 12 : 5, b.key === "cannon" ? 6 : 3);
      if (b.key === "cannon") this.fx.ring(pos.x, pos.z, color, st.splash);
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
    }
    this._buffTimer = (this._buffTimer || 0) - dt2;
    if (this._buffTimer <= 0) {
      this._buffTimer = 0.25;
      for (const b of this.buildings.values()) {
        if (b.isTower) b.showBuff(this.supportBuffMult(b));
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
  snapshot() {
    const out = [];
    for (const b of this.buildings.values()) {
      out.push([b.id, b.key, b.gx, b.gz, b.level, Math.round(b.hp), b.ownerId || ""]);
    }
    return out;
  }
  applySnapshot(list) {
    const seen = /* @__PURE__ */ new Set();
    for (const [id, key, gx, gz, level, hp, owner] of list) {
      seen.add(id);
      let b = this.buildings.get(id);
      if (!b) b = this.place(key, gx, gz, owner, id);
      if (!b) continue;
      if (b.level !== level) {
        b.applyLevel(level);
        this.root.add(b.mesh);
      }
      b.hp = hp;
      b.refreshBar();
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
