// 몬스터: 일반형(그런트) / 빠른형(러너) / 탱커형(브루트) / 보스.
// 이동은 grid.js 의 플로우 필드를 따라가고, 앞을 막는 건물이 있으면 부순다.
import * as THREE from '../vendor/three.module.js';
import { CFG, enemyStats } from './config.js';
import { clamp, dist } from './utils.js';

const GEO = {
  body: new THREE.CapsuleGeometry(0.42, 0.6, 4, 8),
  eye: new THREE.SphereGeometry(0.11, 6, 5),
  horn: new THREE.ConeGeometry(0.18, 0.5, 5),
  bar: new THREE.PlaneGeometry(1.2, 0.14),
};
const MAT_BAR_BG = new THREE.MeshBasicMaterial({ color: 0x11151f, transparent: true, opacity: 0.75, depthTest: false });
const MAT_EYE = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });

let nextId = 1;
export function resetEnemyIds() { nextId = 1; }

export class Enemy {
  constructor(type, wave, x, z, id) {
    const st = enemyStats(type, wave);
    this.id = id || nextId++;
    this.type = type;
    this.st = st;
    this.maxHp = st.maxHp;
    this.hp = st.maxHp;
    this.x = x; this.z = z;
    this.vx = 0; this.vz = 0;
    this.dead = false;
    this.attackCd = 0;
    this.slowUntil = 0;
    this.slowFactor = 1;
    this.target = null;
    this.mesh = this._makeMesh();
    this.mesh.position.set(x, 0, z);
    this.mesh.userData.enemy = this;
    this._bob = Math.random() * 6;
  }

  _makeMesh() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: this.st.color, roughness: 0.75 });
    const body = new THREE.Mesh(GEO.body, mat);
    body.position.y = 0.75;
    body.castShadow = true;
    g.add(body);
    this.body = body;
    this.bodyMat = mat;

    const e1 = new THREE.Mesh(GEO.eye, MAT_EYE);
    e1.position.set(0.18, 1.05, 0.36);
    const e2 = e1.clone();
    e2.position.x = -0.18;
    g.add(e1, e2);

    if (this.type === 'brute' || this.type === 'boss') {
      const h1 = new THREE.Mesh(GEO.horn, mat);
      h1.position.set(0.3, 1.35, 0);
      h1.rotation.z = -0.4;
      const h2 = h1.clone();
      h2.position.x = -0.3; h2.rotation.z = 0.4;
      g.add(h1, h2);
    }

    const barG = new THREE.Group();
    const bg = new THREE.Mesh(GEO.bar, MAT_BAR_BG);
    const fg = new THREE.Mesh(GEO.bar, new THREE.MeshBasicMaterial({ color: 0xff6a6a, depthTest: false }));
    fg.position.z = 0.01;
    barG.add(bg, fg);
    barG.position.y = 1.9;
    barG.renderOrder = 5;
    barG.visible = false;
    g.add(barG);
    this.bar = barG; this.barFg = fg;

    g.scale.setScalar(this.st.scale);
    return g;
  }

  refreshBar() {
    const r = clamp(this.hp / this.maxHp, 0, 1);
    this.bar.visible = r < 0.999 && !this.dead;
    this.barFg.scale.x = Math.max(0.001, r);
    this.barFg.position.x = -(1 - r) * 0.6;
  }

  applySlow(factor, duration, now) {
    this.slowFactor = Math.min(this.slowFactor, 1 - factor);
    this.slowUntil = Math.max(this.slowUntil, now + duration);
    this.bodyMat.emissive?.setHex(0x2a6fa0);
    this.bodyMat.emissiveIntensity = 0.6;
  }

  damage(amount) {
    this.hp -= amount;
    this.refreshBar();
    this._flash = 0.12;
    this.bodyMat.color.setHex(0xffffff);
    if (this.hp <= 0) this.dead = true;
    return this.dead;
  }
}

export class EnemyManager {
  constructor(sm, grid, world, fx) {
    this.sm = sm;
    this.grid = grid;
    this.world = world;
    this.fx = fx;
    this.list = [];
    this.root = new THREE.Group();
    sm.scene.add(this.root);
    this.onCrystalHit = null;
    this.onBuildingHit = null;
    this.onPlayerHit = null;
    this.onKill = null;
  }

  get alive() { return this.list.filter(e => !e.dead).length; }

  spawn(type, wave, x, z, id) {
    if (this.list.length >= CFG.wave.maxAlive) return null;
    const e = new Enemy(type, wave, x, z, id);
    this.root.add(e.mesh);
    this.list.push(e);
    this.fx.ring(x, z, 0xff5a72, 2);
    return e;
  }

  byId(id) { return this.list.find(e => e.id === id); }

  clearAll() {
    for (const e of this.list) this.root.remove(e.mesh);
    this.list.length = 0;
    resetEnemyIds();
  }

  // --- 호스트 시뮬레이션 ---
  simulate(dt, now, players, buildMgr) {
    this.grid.ensureFlow();
    const list = this.list;

    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (e.dead) { this._removeAt(i); continue; }

      if (now > e.slowUntil) { e.slowFactor = 1; e.bodyMat.emissiveIntensity = 0; }
      const speed = e.st.speed * e.slowFactor;
      e.attackCd -= dt;

      const dc = Math.hypot(e.x, e.z);

      // 1) 크리스탈 사거리 안이면 크리스탈 공격
      if (dc <= CFG.crystal.hitRange + e.st.radius) {
        if (e.attackCd <= 0) {
          e.attackCd = 1 / e.st.rate;
          this.onCrystalHit?.(e);
        }
        this._face(e, 0, 0, dt);
        this._applyPosition(e, dt, now);
        continue;
      }

      // 2) 근처 플레이어가 있으면 공격 (파밍 중 리스크)
      const p = this._nearestPlayer(players, e.x, e.z, 1.4 + e.st.radius);
      if (p) {
        if (e.attackCd <= 0) {
          e.attackCd = 1 / e.st.rate;
          this.onPlayerHit?.(e, p);
        }
        this._face(e, p.x, p.z, dt);
        this._applyPosition(e, dt, now);
        continue;
      }

      // 3) 플로우 필드를 따라 크리스탈로 진격
      const step = this.grid.nextStep(e.x, e.z);
      let tx = 0, tz = 0;
      if (step) {
        tx = step.x; tz = step.z;
        // 다음 칸에 건물이 있으면 부순다
        if (step.building) {
          const d = dist(e.x, e.z, step.building.x, step.building.z);
          if (d < 1.9 + e.st.radius) {
            if (e.attackCd <= 0) {
              e.attackCd = 1 / e.st.rate;
              this.onBuildingHit?.(e, step.building);
            }
            this._face(e, step.building.x, step.building.z, dt);
            this._applyPosition(e, dt, now);
            continue;
          }
        }
      }

      const dx = tx - e.x, dz = tz - e.z;
      const len = Math.hypot(dx, dz) || 1;
      let mx = (dx / len) * speed, mz = (dz / len) * speed;

      // 서로 겹치지 않게 간단한 분리력
      const sep = this._separation(e);
      mx += sep.x * speed * 0.6;
      mz += sep.z * speed * 0.6;

      e.x += mx * dt;
      e.z += mz * dt;
      this._face(e, e.x + mx, e.z + mz, dt);
      this._applyPosition(e, dt, now);
    }
  }

  _separation(e) {
    let sx = 0, sz = 0;
    for (const o of this.list) {
      if (o === e || o.dead) continue;
      const dx = e.x - o.x, dz = e.z - o.z;
      const d2 = dx * dx + dz * dz;
      const min = (e.st.radius + o.st.radius) * 1.05;
      if (d2 > 0.0001 && d2 < min * min) {
        const d = Math.sqrt(d2);
        sx += (dx / d) * (1 - d / min);
        sz += (dz / d) * (1 - d / min);
      }
    }
    return { x: clamp(sx, -1, 1), z: clamp(sz, -1, 1) };
  }

  _nearestPlayer(players, x, z, range) {
    let best = null, bd = range * range;
    for (const p of players) {
      if (!p.alive) continue;
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  _face(e, tx, tz, dt) {
    const want = Math.atan2(tx - e.x, tz - e.z);
    const cur = e.mesh.rotation.y;
    let d = ((want - cur + Math.PI) % (Math.PI * 2)) - Math.PI;
    e.mesh.rotation.y = cur + d * Math.min(1, dt * 12);
  }

  _applyPosition(e, dt, now) {
    e.mesh.position.set(e.x, 0, e.z);
    e._bob += dt * (6 + e.st.speed);
    e.body.position.y = 0.75 + Math.abs(Math.sin(e._bob)) * 0.12;
    if (e._flash > 0) {
      e._flash -= dt;
      if (e._flash <= 0) e.bodyMat.color.setHex(e.st.color);
    }
  }

  _removeAt(i) {
    const e = this.list[i];
    this.root.remove(e.mesh);
    this.list.splice(i, 1);
  }

  kill(e) {
    if (e.dead) return;
    e.dead = true;
  }

  // 카메라를 향하도록 체력바 회전 (모든 클라이언트 공통)
  updateVisual(dt, camera) {
    for (const e of this.list) {
      if (e.bar.visible) e.bar.quaternion.copy(camera.quaternion);
    }
  }

  // --- 네트워크 ---
  snapshot() {
    const out = [];
    for (const e of this.list) {
      if (e.dead) continue;
      out.push([e.id, e.type, Math.round(e.x * 20) / 20, Math.round(e.z * 20) / 20,
        Math.round(e.hp), Math.round(e.mesh.rotation.y * 100) / 100]);
    }
    return out;
  }

  applySnapshot(list, wave) {
    const seen = new Set();
    for (const [id, type, x, z, hp, rot] of list) {
      seen.add(id);
      let e = this.byId(id);
      if (!e) {
        e = this.spawn(type, wave, x, z, id);
        if (!e) continue;
      }
      e.netTarget = { x, z, rot };
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
  interpolate(dt) {
    for (const e of this.list) {
      if (!e.netTarget) continue;
      const k = 1 - Math.pow(0.0005, dt);
      e.x += (e.netTarget.x - e.x) * k;
      e.z += (e.netTarget.z - e.z) * k;
      e.mesh.position.set(e.x, 0, e.z);
      e.mesh.rotation.y = e.netTarget.rot;
      e._bob += dt * 8;
      e.body.position.y = 0.75 + Math.abs(Math.sin(e._bob)) * 0.12;
      if (e._flash > 0) {
        e._flash -= dt;
        if (e._flash <= 0) e.bodyMat.color.setHex(e.st.color);
      }
    }
  }
}
