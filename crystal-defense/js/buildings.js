// 건설물: 벽 / 화살탑 / 서리탑 / 대포탑.
// 배치 미리보기(고스트), 충돌 체크, 업그레이드, 철거, 타워 사격을 담당한다.
import * as THREE from '../vendor/three.module.js';
import { CFG } from './config.js';
import { canAfford, payCost, dist } from './utils.js';

const GEO = {
  wall: new THREE.BoxGeometry(1.88, 2.3, 1.88),
  base: new THREE.CylinderGeometry(0.9, 1.0, 0.7, 8),
  pillar: new THREE.CylinderGeometry(0.42, 0.5, 1.9, 8),
  headArrow: new THREE.ConeGeometry(0.55, 1.1, 7),
  headFrost: new THREE.OctahedronGeometry(0.62, 0),
  headCannon: new THREE.BoxGeometry(0.9, 0.7, 1.5),
  barrel: new THREE.CylinderGeometry(0.22, 0.26, 1.4, 8),
  bar: new THREE.PlaneGeometry(1.5, 0.16),
};


const MAT = {
  wall: [
    new THREE.MeshStandardMaterial({ color: 0x8a8f99, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0x9fb0c4, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0xd8c98d, roughness: 0.6, metalness: 0.3 }),
  ],
  base: new THREE.MeshStandardMaterial({ color: 0x6d6f7a, roughness: 0.9 }),
  arrow: new THREE.MeshStandardMaterial({ color: 0xc8a15a, roughness: 0.6, metalness: 0.2 }),
  frost: new THREE.MeshStandardMaterial({ color: 0x6fd4ff, emissive: 0x2a86b8, emissiveIntensity: 0.7, roughness: 0.3 }),
  cannon: new THREE.MeshStandardMaterial({ color: 0x4c5160, roughness: 0.5, metalness: 0.5 }),
  ghostOk: new THREE.MeshStandardMaterial({ color: 0x54ff9f, transparent: true, opacity: 0.45, emissive: 0x1e8f52, emissiveIntensity: 0.6 }),
  ghostBad: new THREE.MeshStandardMaterial({ color: 0xff5a6a, transparent: true, opacity: 0.4, emissive: 0x8f1e2c, emissiveIntensity: 0.6 }),
  barBg: new THREE.MeshBasicMaterial({ color: 0x11151f, transparent: true, opacity: 0.8, depthTest: false }),
  barFg: new THREE.MeshBasicMaterial({ color: 0x66ee88, depthTest: false }),
};

export const PROJECTILE_COLOR = { arrow: 0xffe08a, frost: 0x7fe8ff, cannon: 0xff9a4a };

let nextId = 1;
export function resetBuildingIds() { nextId = 1; }

export class Building {
  constructor(key, gx, gz, x, z, ownerId, id) {
    const def = CFG.builds[key];
    this.id = id || nextId++;
    this.key = key;
    this.def = def;
    this.gx = gx; this.gz = gz;
    this.x = x; this.z = z;
    this.level = 1;
    this.ownerId = ownerId;
    this.maxHp = def.levels[0].hp;
    this.hp = this.maxHp;
    this.cooldown = 0;
    this.mesh = buildMesh(key, 1);
    this.mesh.position.set(x, 0, z);
    this.mesh.userData.building = this;
    this._makeBar();
  }

  get stats() { return this.def.levels[this.level - 1]; }
  get isTower() { return this.key !== 'wall'; }
  get nextCost() {
    const nxt = this.def.levels[this.level];
    return nxt ? nxt.cost : null;
  }

  _makeBar() {
    const g = new THREE.Group();
    const bg = new THREE.Mesh(GEO.bar, MAT.barBg);
    const fg = new THREE.Mesh(GEO.bar, MAT.barFg.clone());
    fg.position.z = 0.01;
    g.add(bg, fg);
    g.position.y = this.key === 'wall' ? 2.7 : 3.4;
    g.visible = false;
    g.renderOrder = 5;
    this.mesh.add(g);
    this.bar = g; this.barFg = fg;
  }

  applyLevel(level) {
    this.level = level;
    const st = this.def.levels[level - 1];
    const ratio = this.hp / this.maxHp;
    this.maxHp = st.hp;
    this.hp = Math.min(this.maxHp, Math.max(1, Math.round(this.maxHp * ratio)));
    // 레벨업 시 외형 갱신
    const old = this.mesh;
    const pos = old.position.clone();
    const parent = old.parent;
    const nm = buildMesh(this.key, level);
    nm.position.copy(pos);
    nm.userData.building = this;
    if (parent) { parent.remove(old); parent.add(nm); }
    this.mesh = nm;
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
    this.barFg.scale.x = Math.max(0.001, r);
    this.barFg.position.x = -(1 - r) * 0.75;
    this.barFg.material.color.setHex(r > 0.5 ? 0x66ee88 : r > 0.25 ? 0xffcc55 : 0xff5a6a);
  }

  faceBar(camera) {
    if (this.bar.visible) this.bar.quaternion.copy(camera.quaternion);
  }
}

function buildMesh(key, level) {
  const g = new THREE.Group();
  if (key === 'wall') {
    const m = new THREE.Mesh(GEO.wall, MAT.wall[level - 1]);
    m.position.y = 1.15;
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
    if (level >= 2) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.28, 2.0), MAT.wall[level - 1]);
      cap.position.y = 2.4; cap.castShadow = true;
      g.add(cap);
    }
    return g;
  }

  const base = new THREE.Mesh(GEO.base, MAT.base);
  base.position.y = 0.35; base.castShadow = true; base.receiveShadow = true;
  const pillar = new THREE.Mesh(GEO.pillar, MAT.base);
  pillar.position.y = 1.5; pillar.castShadow = true;
  g.add(base, pillar);

  const turret = new THREE.Group();
  turret.position.y = 2.6;
  if (key === 'arrow') {
    const head = new THREE.Mesh(GEO.headArrow, MAT.arrow);
    head.rotation.x = Math.PI / 2;
    head.castShadow = true;
    turret.add(head);
  } else if (key === 'frost') {
    const head = new THREE.Mesh(GEO.headFrost, MAT.frost);
    head.castShadow = true;
    turret.add(head);
    const ringG = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 6, 18), MAT.frost);
    ringG.rotation.x = Math.PI / 2;
    turret.add(ringG);
  } else {
    const head = new THREE.Mesh(GEO.headCannon, MAT.cannon);
    head.castShadow = true;
    const barrel = new THREE.Mesh(GEO.barrel, MAT.cannon);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.9;
    turret.add(head, barrel);
  }
  // 레벨 표시: 작은 링이 쌓인다
  for (let i = 1; i < level; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.07, 6, 16), MAT.arrow);
    r.rotation.x = Math.PI / 2;
    r.position.y = 0.6 + i * 0.2;
    g.add(r);
  }
  g.add(turret);
  g.userData.turret = turret;
  return g;
}

export class BuildManager {
  constructor(sm, grid, world, fx, projectiles) {
    this.sm = sm;
    this.grid = grid;
    this.world = world;
    this.fx = fx;
    this.projectiles = projectiles;
    this.buildings = new Map();      // id -> Building
    this.root = new THREE.Group();
    sm.scene.add(this.root);

    this.mode = null;                // null | 'wall' | 'arrow' | ... | 'upgrade' | 'sell'
    this.ghost = null;
    this.ghostValid = false;
    this.ghostReason = '';
    this.ghostCell = null;
    this.hover = null;               // 업그레이드/철거 모드에서 가리키는 건물
    this.onImpact = null;            // 투사체 명중 콜백 (데미지는 호스트에서만 적용)
  }

  setMode(mode) {
    if (this.mode === mode) mode = null;
    this.mode = mode;
    this._syncGhost();
    this.sm.setBuildGridVisible(!!mode);
    return this.mode;
  }

  _syncGhost() {
    if (this.ghost) { this.root.remove(this.ghost); this.ghost = null; }
    if (!this.mode || !CFG.builds[this.mode]) return;
    const g = buildMesh(this.mode, 1);
    g.traverse(o => { if (o.isMesh) { o.material = MAT.ghostOk; o.castShadow = false; } });
    this.root.add(g);
    this.ghost = g;
  }

  _setGhostMaterial(ok) {
    if (!this.ghost) return;
    const m = ok ? MAT.ghostOk : MAT.ghostBad;
    this.ghost.traverse(o => { if (o.isMesh) o.material = m; });
  }

  // 매 프레임: 포인터 위치에 고스트 배치 / 대상 건물 하이라이트
  updateGhost(pointer, resources) {
    this.hover = null;
    if (!this.mode || !pointer) { if (this.ghost) this.ghost.visible = false; return; }

    if (this.mode === 'upgrade' || this.mode === 'sell') {
      if (this.ghost) this.ghost.visible = false;
      const b = this.grid.atWorld(pointer.x, pointer.z);
      this.hover = b || null;
      return;
    }

    const g = this.grid.toGrid(pointer.x, pointer.z);
    const res = this.grid.canPlace(g.gx, g.gz, (x, z) => this.world.blocksBuild(x, z));
    const w = this.grid.toWorld(g.gx, g.gz);
    if (this.ghost) {
      this.ghost.visible = true;
      this.ghost.position.set(w.x, 0, w.z);
    }
    let ok = res.ok;
    let why = res.why;
    if (ok && !canAfford(resources, CFG.builds[this.mode].cost)) { ok = false; why = '자원이 부족합니다'; }
    this.ghostValid = ok;
    this.ghostReason = why;
    this.ghostCell = { gx: g.gx, gz: g.gz, x: w.x, z: w.z };
    this._setGhostMaterial(ok);
  }

  // 실제 배치(권한 있는 쪽에서만 호출). 성공 시 Building 반환
  place(key, gx, gz, ownerId, id) {
    const res = this.grid.canPlace(gx, gz, (x, z) => this.world.blocksBuild(x, z));
    if (!res.ok) return null;
    const b = new Building(key, gx, gz, res.x, res.z, ownerId, id);
    if (id && id >= nextId) nextId = id + 1;
    this.root.add(b.mesh);
    this.buildings.set(b.id, b);
    this.grid.set(gx, gz, b);
    b.turret = b.mesh.userData.turret;
    this.fx.ring(res.x, res.z, 0x8affc0, 2);
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
    this.grid.dirty = true;       // 벽 체력이 변하면 경로 비용도 변한다
    b.refreshBar();
    this.fx.ring(b.x, b.z, 0xffe08a, 2.4);
    return b;
  }

  refund(b) {
    const total = { wood: 0, stone: 0 };
    for (let i = 0; i < b.level; i++) {
      const c = i === 0 ? b.def.cost : b.def.levels[i].cost;
      total.wood += (c?.wood || 0) * 0.5;
      total.stone += (c?.stone || 0) * 0.5;
    }
    return { wood: Math.floor(total.wood), stone: Math.floor(total.stone) };
  }

  // 호스트에서만: 타워 조준/사격
  updateTowers(dt, enemies, now) {
    for (const b of this.buildings.values()) {
      if (!b.isTower) continue;
      const st = b.stats;
      b.cooldown -= dt;
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

  // 사거리 안에서 크리스탈에 가장 가까운(=가장 위협적인) 적
  _acquire(b, enemies, range) {
    let best = null, bestScore = Infinity;
    const r2 = range * range;
    for (const e of enemies) {
      if (e.dead) continue;
      const d2 = (e.x - b.x) ** 2 + (e.z - b.z) ** 2;
      if (d2 > r2) continue;
      const score = e.x * e.x + e.z * e.z;   // 중앙에 가까울수록 우선
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  // 투사체 발사 연출 → 명중 시 onImpact (데미지 적용은 호스트에서만)
  shoot(b, target) {
    const st = b.stats;
    const from = new THREE.Vector3(b.x, 2.9, b.z);
    const to = new THREE.Vector3(target.x, 0.8, target.z);
    const color = PROJECTILE_COLOR[b.key];
    const speed = b.key === 'cannon' ? 26 : 42;
    this.projectiles.fire(from, to, speed, color, (pos) => {
      this.fx.burst(pos.x, pos.y, pos.z, color, b.key === 'cannon' ? 12 : 5, b.key === 'cannon' ? 6 : 3);
      if (b.key === 'cannon') this.fx.ring(pos.x, pos.z, color, st.splash);
      this.onImpact?.(b, st, pos);
    });
  }

  eachBuilding(fn) { this.buildings.forEach(fn); }

  update(dt, camera) {
    for (const b of this.buildings.values()) b.faceBar(camera);
    if (this.hover) {
      const s = 1 + Math.sin(performance.now() / 120) * 0.04;
      this.hover.mesh.scale.setScalar(s);
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
      out.push([b.id, b.key, b.gx, b.gz, b.level, Math.round(b.hp), b.ownerId || '']);
    }
    return out;
  }

  applySnapshot(list) {
    const seen = new Set();
    for (const [id, key, gx, gz, level, hp, owner] of list) {
      seen.add(id);
      let b = this.buildings.get(id);
      if (!b) b = this.place(key, gx, gz, owner, id);
      if (!b) continue;
      if (b.level !== level) { b.applyLevel(level); this.root.add(b.mesh); }
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
}
