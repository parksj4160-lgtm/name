import * as THREE from '../vendor/three.module.js';
import { CFG, enemyStats } from './config.js';
import { clamp, dist } from './utils.js';

var GEO3 = {
  body: new THREE.CapsuleGeometry(0.42, 0.6, 4, 8),
  eye: new THREE.SphereGeometry(0.11, 6, 5),
  horn: new THREE.ConeGeometry(0.18, 0.5, 5),
  bar: new THREE.PlaneGeometry(1.2, 0.14)
};
var MAT_BAR_BG = new THREE.MeshBasicMaterial({ color: 1119519, transparent: true, opacity: 0.75, depthTest: false });
var MAT_EYE = new THREE.MeshBasicMaterial({ color: 16774064 });
var INSTANCED_TYPES = /* @__PURE__ */ new Set(["grunt", "runner", "shooter", "raider"]);
var HIDE_SCALE = 1e-4;
var _flashColor = new THREE.Color(16777215);
var _slowColor = new THREE.Color(2781088);
var _poisonColor = new THREE.Color(3064149);
var _tmpColor = new THREE.Color();
var _tmpVec = new THREE.Vector3();
var _tmpQuat = new THREE.Quaternion();
var _tmpMat = new THREE.Matrix4();
var nextId2 = 1;
function resetEnemyIds() {
  nextId2 = 1;
}
var Enemy = class {
  constructor(type, wave, x2, z2, id) {
    const st = enemyStats(type, wave);
    this.id = id || nextId2++;
    this.type = type;
    this.st = st;
    this.instanced = INSTANCED_TYPES.has(type);
    this.bodyIdx = -1;
    this.maxHp = st.maxHp;
    this.hp = st.maxHp;
    this.x = x2;
    this.z = z2;
    this.vx = 0;
    this.vz = 0;
    this.dead = false;
    this.attackCd = 0;
    this.slowUntil = 0;
    this.slowFactor = 1;
    this.poisonDps = 0;
    this.poisonUntil = 0;
    this.poisonTickCd = 0;
    this.target = null;
    this.mesh = this._makeMesh();
    this.mesh.position.set(x2, 0, z2);
    this.mesh.userData.enemy = this;
    this._bob = Math.random() * 6;
    this._kox = 0;
    this._koz = 0;
    this._punch = 0;
  }
  _makeMesh() {
    const g2 = new THREE.Group();
    if (this.instanced) {
    } else {
      const mat = new THREE.MeshStandardMaterial({ color: this.st.color, roughness: 0.75 });
      const body = new THREE.Mesh(GEO3.body, mat);
      body.position.y = 0.75;
      body.castShadow = true;
      g2.add(body);
      this.body = body;
      this.bodyMat = mat;
    }
    const e1 = new THREE.Mesh(GEO3.eye, MAT_EYE);
    e1.position.set(0.18, 1.05, 0.36);
    const e2 = e1.clone();
    e2.position.x = -0.18;
    g2.add(e1, e2);
    if (this.type === "brute" || this.type === "boss") {
      const h1 = new THREE.Mesh(GEO3.horn, this.bodyMat);
      h1.position.set(0.3, 1.35, 0);
      h1.rotation.z = -0.4;
      const h2 = h1.clone();
      h2.position.x = -0.3;
      h2.rotation.z = 0.4;
      g2.add(h1, h2);
    }
    const barG = new THREE.Group();
    const bg = new THREE.Mesh(GEO3.bar, MAT_BAR_BG);
    const fg = new THREE.Mesh(GEO3.bar, new THREE.MeshBasicMaterial({ color: 16738922, depthTest: false }));
    fg.position.z = 0.01;
    barG.add(bg, fg);
    barG.position.y = 1.9;
    barG.renderOrder = 5;
    barG.visible = false;
    g2.add(barG);
    this.bar = barG;
    this.barFg = fg;
    g2.scale.setScalar(this.st.scale);
    return g2;
  }
  refreshBar() {
    const r = clamp(this.hp / this.maxHp, 0, 1);
    this.bar.visible = r < 0.999 && !this.dead;
    this.barFg.scale.x = Math.max(1e-3, r);
    this.barFg.position.x = -(1 - r) * 0.6;
  }
  applySlow(factor, duration, now) {
    this.slowFactor = Math.min(this.slowFactor, 1 - factor);
    this.slowUntil = Math.max(this.slowUntil, now + duration);
    if (this.bodyMat) {
      this.bodyMat.emissive?.setHex(2781088);
      this.bodyMat.emissiveIntensity = 0.6;
    }
  }
  applyPoison(dps, duration, now) {
    this.poisonDps = Math.max(this.poisonDps, dps);
    this.poisonUntil = Math.max(this.poisonUntil, now + duration);
  }
  // 피격 시 히트 플래시 + 타격 방향 반대쪽으로 살짝 넉백 + 펀치 스케일 튐
  damage(amount, fromX, fromZ) {
    this.hp -= amount;
    this.refreshBar();
    this._flash = 0.12;
    this._punch = 1;
    if (this.bodyMat) this.bodyMat.color.setHex(16777215);
    if (typeof fromX === "number") {
      const dx = this.x - fromX, dz = this.z - fromZ;
      const len = Math.hypot(dx, dz) || 1;
      const kb = Math.min(0.4, 0.06 + amount * 4e-3) / this.st.scale;
      this._kox = clamp(this._kox + dx / len * kb, -0.5, 0.5);
      this._koz = clamp(this._koz + dz / len * kb, -0.5, 0.5);
    }
    if (this.hp <= 0) this.dead = true;
    return this.dead;
  }
};
export var EnemyManager = class {
  constructor(sm2, grid, world, fx) {
    this.sm = sm2;
    this.grid = grid;
    this.world = world;
    this.fx = fx;
    this.list = [];
    this.root = new THREE.Group();
    sm2.scene.add(this.root);
    this.onCrystalHit = null;
    this.onBuildingHit = null;
    this.onPlayerHit = null;
    this.onKill = null;
    this.onPoisonTick = null;
    const cap = CFG.wave.maxAlive;
    this.bodyInst = new THREE.InstancedMesh(
      GEO3.body,
      new THREE.MeshStandardMaterial({ roughness: 0.75 }),
      cap
    );
    this.bodyInst.castShadow = false;
    this._freeBodyIdx = [];
    for (let i = cap - 1; i >= 0; i--) {
      this._freeBodyIdx.push(i);
      _tmpMat.compose(_tmpVec.set(0, -50, 0), _tmpQuat.identity(), _tmpVec.set(HIDE_SCALE, HIDE_SCALE, HIDE_SCALE));
      this.bodyInst.setMatrixAt(i, _tmpMat);
      this.bodyInst.setColorAt(i, _tmpColor.set(0));
    }
    this.root.add(this.bodyInst);
  }
  get alive() {
    return this.list.filter((e) => !e.dead).length;
  }
  spawn(type, wave, x2, z2, id) {
    if (this.list.length >= CFG.wave.maxAlive) return null;
    const e = new Enemy(type, wave, x2, z2, id);
    if (e.instanced) {
      e.bodyIdx = this._freeBodyIdx.length ? this._freeBodyIdx.pop() : -1;
    }
    this.root.add(e.mesh);
    this.list.push(e);
    this.fx.ring(x2, z2, 16734834, 2);
    return e;
  }
  byId(id) {
    return this.list.find((e) => e.id === id);
  }
  clearAll() {
    for (const e of this.list) this.root.remove(e.mesh);
    this.list.length = 0;
    resetEnemyIds();
    const cap = this.bodyInst.count;
    this._freeBodyIdx.length = 0;
    for (let i = cap - 1; i >= 0; i--) {
      this._freeBodyIdx.push(i);
      this._hideBodyInst(i);
    }
  }
  _hideBodyInst(idx) {
    _tmpMat.compose(_tmpVec.set(0, -50, 0), _tmpQuat.identity(), _tmpVec.set(HIDE_SCALE, HIDE_SCALE, HIDE_SCALE));
    this.bodyInst.setMatrixAt(idx, _tmpMat);
    this.bodyInst.instanceMatrix.needsUpdate = true;
  }
  // --- 호스트 시뮬레이션 ---
  simulate(dt2, now, players, buildMgr) {
    this.grid.ensureFlow();
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (e.dead) {
        this._removeAt(i);
        continue;
      }
      if (now > e.slowUntil) {
        e.slowFactor = 1;
        if (e.bodyMat) e.bodyMat.emissiveIntensity = 0;
      }
      if (now < e.poisonUntil) {
        if (e.bodyMat) {
          e.bodyMat.emissive?.setHex(3064149);
          e.bodyMat.emissiveIntensity = 0.55;
        }
        e.poisonTickCd -= dt2;
        if (e.poisonTickCd <= 0) {
          e.poisonTickCd = 0.5;
          this.onPoisonTick?.(e, e.poisonDps * 0.5);
        }
      } else if (e.poisonDps) {
        e.poisonDps = 0;
      }
      const speed = e.st.speed * e.slowFactor;
      e.attackCd -= dt2;
      const dc2 = Math.hypot(e.x, e.z);
      const atkRange = e.st.ranged ? e.st.atkRange : CFG.crystal.hitRange;
      if (dc2 <= atkRange + e.st.radius) {
        if (e.attackCd <= 0) {
          e.attackCd = 1 / e.st.rate;
          this.onCrystalHit?.(e);
          if (e.st.ranged) this.fx.ring(e.x, e.z, 9408511, 1.6);
        }
        this._face(e, 0, 0, dt2);
        this._applyPosition(e, dt2, now);
        continue;
      }
      const p2 = this._nearestPlayer(players, e.x, e.z, 1.4 + e.st.radius);
      if (p2) {
        if (e.attackCd <= 0) {
          e.attackCd = 1 / e.st.rate;
          this.onPlayerHit?.(e, p2);
        }
        this._face(e, p2.x, p2.z, dt2);
        this._applyPosition(e, dt2, now);
        continue;
      }
      if (e.st.seeksBuildings) {
        const target = this._nearestBuilding(buildMgr, e.x, e.z);
        if (target) {
          const d2 = dist(e.x, e.z, target.x, target.z);
          if (d2 < 1.9 + e.st.radius) {
            if (e.attackCd <= 0) {
              e.attackCd = 1 / e.st.rate;
              this.onBuildingHit?.(e, target, e.st.buildingDmgMult || 1);
            }
            this._face(e, target.x, target.z, dt2);
            this._applyPosition(e, dt2, now);
            continue;
          }
          const dx2 = target.x - e.x, dz2 = target.z - e.z;
          const len2 = Math.hypot(dx2, dz2) || 1;
          let mx2 = dx2 / len2 * speed, mz2 = dz2 / len2 * speed;
          const sep2 = this._separation(e);
          mx2 += sep2.x * speed * 0.6;
          mz2 += sep2.z * speed * 0.6;
          e.x += mx2 * dt2;
          e.z += mz2 * dt2;
          this._face(e, e.x + mx2, e.z + mz2, dt2);
          this._applyPosition(e, dt2, now);
          continue;
        }
      }
      const step = this.grid.nextStep(e.x, e.z);
      let tx = 0, tz = 0;
      if (step) {
        tx = step.x;
        tz = step.z;
        if (step.building) {
          const d2 = dist(e.x, e.z, step.building.x, step.building.z);
          if (d2 < 1.9 + e.st.radius) {
            if (e.attackCd <= 0) {
              e.attackCd = 1 / e.st.rate;
              this.onBuildingHit?.(e, step.building);
            }
            this._face(e, step.building.x, step.building.z, dt2);
            this._applyPosition(e, dt2, now);
            continue;
          }
        }
      }
      const dx = tx - e.x, dz = tz - e.z;
      const len = Math.hypot(dx, dz) || 1;
      let mx = dx / len * speed, mz = dz / len * speed;
      const sep = this._separation(e);
      mx += sep.x * speed * 0.6;
      mz += sep.z * speed * 0.6;
      e.x += mx * dt2;
      e.z += mz * dt2;
      this._face(e, e.x + mx, e.z + mz, dt2);
      this._applyPosition(e, dt2, now);
    }
  }
  _separation(e) {
    let sx = 0, sz = 0;
    for (const o of this.list) {
      if (o === e || o.dead) continue;
      const dx = e.x - o.x, dz = e.z - o.z;
      const d2 = dx * dx + dz * dz;
      const min = (e.st.radius + o.st.radius) * 1.05;
      if (d2 > 1e-4 && d2 < min * min) {
        const d3 = Math.sqrt(d2);
        sx += dx / d3 * (1 - d3 / min);
        sz += dz / d3 * (1 - d3 / min);
      }
    }
    return { x: clamp(sx, -1, 1), z: clamp(sz, -1, 1) };
  }
  _nearestPlayer(players, x2, z2, range) {
    let best = null, bd2 = range * range;
    for (const p2 of players) {
      if (!p2.alive) continue;
      const d2 = (p2.x - x2) ** 2 + (p2.z - z2) ** 2;
      if (d2 < bd2) {
        bd2 = d2;
        best = p2;
      }
    }
    return best;
  }
  _nearestBuilding(buildMgr, x2, z2) {
    let best = null, bd2 = Infinity;
    for (const b of buildMgr.buildings.values()) {
      const d2 = (b.x - x2) ** 2 + (b.z - z2) ** 2;
      if (d2 < bd2) {
        bd2 = d2;
        best = b;
      }
    }
    return best;
  }
  _face(e, tx, tz, dt2) {
    const want = Math.atan2(tx - e.x, tz - e.z);
    const cur = e.mesh.rotation.y;
    let d2 = (want - cur + Math.PI) % (Math.PI * 2) - Math.PI;
    e.mesh.rotation.y = cur + d2 * Math.min(1, dt2 * 12);
  }
  _applyPosition(e, dt2, now) {
    this._settle(e, dt2);
    e.mesh.position.set(e.x + e._kox, 0, e.z + e._koz);
    e._bob += dt2 * (6 + e.st.speed);
    if (e.instanced) this._writeInstance(e, now);
    else e.body.position.y = 0.75 + Math.abs(Math.sin(e._bob)) * 0.12;
  }
  // 히트 플래시 · 넉백 오프셋 · 펀치 스케일을 서서히 원상 복귀시킨다
  _settle(e, dt2) {
    if (e._flash > 0) {
      e._flash -= dt2;
      if (e._flash <= 0 && e.bodyMat) e.bodyMat.color.setHex(e.st.color);
    }
    const decay = Math.pow(6e-4, dt2);
    e._kox *= decay;
    e._koz *= decay;
    e._punch *= Math.pow(2e-3, dt2);
    if (!e.instanced) e.body.scale.setScalar(1 + e._punch * 0.22);
  }
  // 공유 InstancedMesh 몸통 한 칸에 위치·회전·스케일·색을 써 넣는다 (그런트/러너/주술사/약탈자 전용).
  // now 가 주어지면(호스트) 슬로우·중독 틴트도 반영하고, 없으면(클라이언트 보간) 히트 플래시만 반영한다
  // — 기존에도 슬로우/중독 연출은 호스트 화면에서만 보이던 동작이라 그 동작을 그대로 유지한다.
  _writeInstance(e, now) {
    const bobY = 0.75 + Math.abs(Math.sin(e._bob)) * 0.12;
    const s2 = 1 + e._punch * 0.22;
    e.mesh.updateMatrixWorld(true);
    _tmpMat.makeScale(s2, s2, s2);
    _tmpMat.setPosition(0, bobY, 0);
    _tmpMat.premultiply(e.mesh.matrixWorld);
    this.bodyInst.setMatrixAt(e.bodyIdx, _tmpMat);
    this.bodyInst.instanceMatrix.needsUpdate = true;
    let color;
    if (e._flash > 0) color = _flashColor;
    else if (now !== void 0 && now < e.poisonUntil) color = _tmpColor.set(e.st.color).lerp(_poisonColor, 0.6);
    else if (now !== void 0 && now < e.slowUntil) color = _tmpColor.set(e.st.color).lerp(_slowColor, 0.6);
    else color = _tmpColor.set(e.st.color);
    this.bodyInst.setColorAt(e.bodyIdx, color);
    this.bodyInst.instanceColor.needsUpdate = true;
  }
  _removeAt(i) {
    const e = this.list[i];
    this.root.remove(e.mesh);
    if (e.instanced && e.bodyIdx >= 0) {
      this._hideBodyInst(e.bodyIdx);
      this._freeBodyIdx.push(e.bodyIdx);
      e.bodyIdx = -1;
    }
    this.list.splice(i, 1);
  }
  kill(e) {
    if (e.dead) return;
    e.dead = true;
  }
  // 카메라를 향하도록 체력바 회전 (모든 클라이언트 공통)
  updateVisual(dt2, camera) {
    for (const e of this.list) {
      if (e.bar.visible) e.bar.quaternion.copy(camera.quaternion);
    }
  }
  // --- 네트워크 ---
  snapshot() {
    const out = [];
    for (const e of this.list) {
      if (e.dead) continue;
      out.push([
        e.id,
        e.type,
        Math.round(e.x * 20) / 20,
        Math.round(e.z * 20) / 20,
        Math.round(e.hp),
        Math.round(e.mesh.rotation.y * 100) / 100
      ]);
    }
    return out;
  }
  applySnapshot(list, wave) {
    const seen = /* @__PURE__ */ new Set();
    for (const [id, type, x2, z2, hp, rot] of list) {
      seen.add(id);
      let e = this.byId(id);
      if (!e) {
        e = this.spawn(type, wave, x2, z2, id);
        if (!e) continue;
      }
      e.netTarget = { x: x2, z: z2, rot };
      e.hp = hp;
      e.refreshBar();
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (!seen.has(e.id)) {
        this.fx.burst(e.x, 1, e.z, e.st.color, 8, 4);
        this._removeAt(i);
      }
    }
  }
  // 클라이언트: 스냅샷 사이를 보간
  interpolate(dt2) {
    for (const e of this.list) {
      if (!e.netTarget) continue;
      const k2 = 1 - Math.pow(5e-4, dt2);
      e.x += (e.netTarget.x - e.x) * k2;
      e.z += (e.netTarget.z - e.z) * k2;
      this._settle(e, dt2);
      e.mesh.position.set(e.x + e._kox, 0, e.z + e._koz);
      e.mesh.rotation.y = e.netTarget.rot;
      e._bob += dt2 * 8;
      if (e.instanced) this._writeInstance(e);
      else e.body.position.y = 0.75 + Math.abs(Math.sin(e._bob)) * 0.12;
    }
  }
};
