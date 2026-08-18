// 플레이어(로컬/원격) 캐릭터: 이동 · 충돌 · 채집 채널링 · 근접 공격.
import * as THREE from '../vendor/three.module.js';
import { CFG } from './config.js';
import { clamp, dist } from './utils.js';

const GEO = {
  body: new THREE.CapsuleGeometry(0.38, 0.7, 4, 10),
  head: new THREE.SphereGeometry(0.3, 12, 10),
  arm: new THREE.CapsuleGeometry(0.12, 0.45, 3, 6),
  tool: new THREE.BoxGeometry(0.14, 0.9, 0.14),
  ring: new THREE.RingGeometry(0.62, 0.76, 20),
};

const PALETTE = [0x5fd4ff, 0x9dff6b, 0xffb35f, 0xff6bd6, 0xd6a0ff, 0x6bffd0];

export class Player {
  constructor(id, name, colorIdx = 0, isLocal = false) {
    this.id = id;
    this.name = name;
    this.isLocal = isLocal;
    this.color = PALETTE[colorIdx % PALETTE.length];
    this.x = 0; this.z = 6;
    this.rot = Math.PI;
    this.hp = CFG.player.hp;
    this.maxHp = CFG.player.hp;
    this.alive = true;
    this.downTimer = 0;
    this.res = { wood: 40, stone: 20 };   // 개인 자원 (공유 모드에선 팀 풀 사용)
    this.shards = 0;
    this.harvestLv = 1;
    this.harvesting = null;               // { node, t, need }
    this.attackCd = 0;
    this.swing = 0;
    this.combatUntil = 0;
    this.mesh = this._makeMesh();
    this.mesh.position.set(this.x, 0, this.z);
  }

  _makeMesh() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: this.color, roughness: 0.6, metalness: 0.1 });
    this.mat = mat;
    const body = new THREE.Mesh(GEO.body, mat);
    body.position.y = 0.85; body.castShadow = true;
    const head = new THREE.Mesh(GEO.head, new THREE.MeshStandardMaterial({ color: 0xf2d3b0, roughness: 0.8 }));
    head.position.y = 1.55; head.castShadow = true;
    g.add(body, head);

    const arm = new THREE.Mesh(GEO.arm, mat);
    arm.position.set(0.42, 1.05, 0.1);
    g.add(arm);
    this.arm = arm;

    const tool = new THREE.Mesh(GEO.tool, new THREE.MeshStandardMaterial({ color: 0xb8894f, roughness: 0.7 }));
    tool.position.set(0.5, 1.0, 0.35);
    tool.rotation.x = -0.4;
    tool.castShadow = true;
    g.add(tool);
    this.tool = tool;

    const ring = new THREE.Mesh(GEO.ring, new THREE.MeshBasicMaterial({
      color: this.color, transparent: true, opacity: this.isLocal ? 0.85 : 0.5, side: THREE.DoubleSide,
    }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    g.add(ring);
    this.ring = ring;
    return g;
  }

  get harvestMult() { return CFG.harvest.upgrade[this.harvestLv - 1].mult; }

  damage(amount) {
    if (!this.alive) return false;
    this.hp -= amount;
    this.combatUntil = performance.now() / 1000 + 2;
    this.cancelHarvest();
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.downTimer = CFG.player.downTime;
      this.mesh.rotation.z = Math.PI / 2;
      return true;
    }
    return false;
  }

  revive() {
    this.alive = true;
    this.hp = this.maxHp;
    this.mesh.rotation.z = 0;
    this.x = 0; this.z = CFG.world.coreRadius + 2;
  }

  cancelHarvest() { this.harvesting = null; }

  // 애니메이션 (모든 플레이어 공통)
  animate(dt, moving) {
    const t = performance.now() / 1000;
    if (this.swing > 0) {
      this.swing -= dt * 3.4;
      const k = Math.max(0, this.swing);
      this.arm.rotation.x = -Math.sin(k * Math.PI) * 2.2;
      this.tool.rotation.x = -0.4 - Math.sin(k * Math.PI) * 2.4;
    } else if (this.harvesting) {
      this.arm.rotation.x = Math.sin(t * 12) * 0.9;
      this.tool.rotation.x = -0.4 + Math.sin(t * 12) * 1.0;
    } else {
      this.arm.rotation.x = moving ? Math.sin(t * 9) * 0.6 : Math.sin(t * 2) * 0.08;
      this.tool.rotation.x = -0.4;
    }
    const bob = moving ? Math.abs(Math.sin(t * 9)) * 0.09 : 0;
    this.mesh.position.y = bob;
    this.mesh.rotation.y = this.rot;
    this.ring.material.opacity = this.alive ? (this.isLocal ? 0.85 : 0.45) : 0.15;
    this.mat.emissive?.setHex(this.combatUntil > t ? 0x662222 : 0x000000);
  }
}

// 로컬 조작 + 물리
export class LocalPlayer extends Player {
  constructor(id, name, colorIdx) {
    super(id, name, colorIdx, true);
  }

  update(dt, input, sm, grid, world) {
    const now = performance.now() / 1000;

    if (!this.alive) {
      this.downTimer -= dt;
      this.mesh.position.set(this.x, 0.2, this.z);
      if (this.downTimer <= 0) this.revive();
      return { moved: false };
    }

    // HP 자연 회복 (최근 피격 후 2초 동안은 정지)
    if (now > this.combatUntil && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + CFG.player.regen * dt);
    }

    const ax = input.axis();
    const basis = sm.moveBasis();
    let mx = basis.rx * ax.x + basis.fx * ax.y;
    let mz = basis.rz * ax.x + basis.fz * ax.y;
    const moving = Math.hypot(mx, mz) > 0.01;

    if (moving) {
      this.cancelHarvest();
      const sprint = input.down('shift');
      const spd = sprint ? CFG.player.sprint : CFG.player.speed;
      const len = Math.hypot(mx, mz);
      mx /= len; mz /= len;
      this.x += mx * spd * dt;
      this.z += mz * spd * dt;
      this.rot = Math.atan2(mx, mz);
      this._collide(grid, world);
    }

    this.attackCd -= dt;
    this.animate(dt, moving);
    this.mesh.position.x = this.x;
    this.mesh.position.z = this.z;
    return { moved: moving };
  }

  _collide(grid, world) {
    const half = CFG.world.size / 2 - 1;
    this.x = clamp(this.x, -half, half);
    this.z = clamp(this.z, -half, half);

    const r = CFG.player.radius;

    // 크리스탈 받침대
    const dc = Math.hypot(this.x, this.z);
    if (dc < CFG.world.coreRadius) {
      const k = CFG.world.coreRadius / (dc || 0.001);
      this.x *= k; this.z *= k;
    }

    // 자원 노드
    for (const n of world.nodes) {
      if (n.depleted) continue;
      const d = dist(this.x, this.z, n.x, n.z);
      const min = r + n.radius * 0.7;
      if (d < min && d > 0.0001) {
        const k = (min - d) / d;
        this.x += (this.x - n.x) * k;
        this.z += (this.z - n.z) * k;
      }
    }

    // 건물 (AABB 밀어내기)
    const g = grid.toGrid(this.x, this.z);
    for (let gz = g.gz - 1; gz <= g.gz + 1; gz++) {
      for (let gx = g.gx - 1; gx <= g.gx + 1; gx++) {
        const b = grid.at(gx, gz);
        if (!b) continue;
        const halfCell = grid.cell / 2;
        const dx = this.x - b.x, dz = this.z - b.z;
        const ox = halfCell + r - Math.abs(dx);
        const oz = halfCell + r - Math.abs(dz);
        if (ox > 0 && oz > 0) {
          if (ox < oz) this.x += Math.sign(dx || 1) * ox;
          else this.z += Math.sign(dz || 1) * oz;
        }
      }
    }
  }

  // 채집 시도/진행. 완료 시 노드를 돌려준다.
  tickHarvest(dt, world, holding) {
    if (!this.alive) return null;
    if (!holding) { this.harvesting = null; return null; }

    if (!this.harvesting) {
      const node = world.nearestNode(this.x, this.z, CFG.harvest.range);
      if (!node) return null;
      this.harvesting = { node, t: 0, need: CFG.harvest[node.type].time * this.harvestMult };
      this.rot = Math.atan2(node.x - this.x, node.z - this.z);
    }

    const h = this.harvesting;
    if (h.node.depleted || dist(this.x, this.z, h.node.x, h.node.z) > CFG.harvest.range + 0.6) {
      this.harvesting = null;
      return null;
    }
    h.t += dt;
    if (h.t >= h.need) {
      const node = h.node;
      this.harvesting = null;
      return node;
    }
    return null;
  }

  tryAttack() {
    if (!this.alive || this.attackCd > 0) return false;
    this.attackCd = CFG.player.attack.cd;
    this.swing = 1;
    this.cancelHarvest();
    return true;
  }
}

// 원격 플레이어: 스냅샷 사이 보간
export class RemotePlayer extends Player {
  constructor(id, name, colorIdx) {
    super(id, name, colorIdx, false);
    this.netTarget = { x: this.x, z: this.z, rot: this.rot };
  }
  applyNet(s) {
    this.netTarget = { x: s.x, z: s.z, rot: s.rot };
    this.hp = s.hp;
    this.alive = s.alive;
    this.harvesting = s.harvesting ? { t: 0, need: 1 } : null;
    if (s.swing) this.swing = 1;
    this.mesh.rotation.z = s.alive ? 0 : Math.PI / 2;
  }
  update(dt) {
    const k = 1 - Math.pow(0.0008, dt);
    const moved = Math.hypot(this.netTarget.x - this.x, this.netTarget.z - this.z) > 0.05;
    this.x += (this.netTarget.x - this.x) * k;
    this.z += (this.netTarget.z - this.z) * k;
    let d = ((this.netTarget.rot - this.rot + Math.PI) % (Math.PI * 2)) - Math.PI;
    this.rot += d * Math.min(1, dt * 12);
    this.mesh.position.set(this.x, this.mesh.position.y, this.z);
    this.animate(dt, moved);
  }
}
