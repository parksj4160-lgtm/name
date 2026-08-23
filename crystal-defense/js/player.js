import * as THREE from '../vendor/three.module.js';
import { CFG, WEATHER, needsPickaxe } from './config.js';
import { clamp, dist } from './utils.js';

var GEO4 = {
  body: new THREE.CapsuleGeometry(0.38, 0.7, 4, 10),
  head: new THREE.SphereGeometry(0.3, 12, 10),
  arm: new THREE.CapsuleGeometry(0.12, 0.45, 3, 6),
  tool: new THREE.BoxGeometry(0.14, 0.9, 0.14),
  sword: new THREE.BoxGeometry(0.1, 1.05, 0.24),
  pickaxe: new THREE.BoxGeometry(0.5, 0.13, 0.13),
  bow: new THREE.TorusGeometry(0.38, 0.035, 6, 12, Math.PI * 1.15),
  spear: new THREE.CylinderGeometry(0.035, 0.1, 1.9, 6),
  hammer: new THREE.CylinderGeometry(0.09, 0.34, 1, 6),
  bomb: new THREE.SphereGeometry(0.22, 10, 8),
  ring: new THREE.RingGeometry(0.62, 0.76, 20)
};
var WEAPON_MAT = {
  default: new THREE.MeshStandardMaterial({ color: 12093775, roughness: 0.7 }),
  sword: new THREE.MeshStandardMaterial({ color: 14406878, roughness: 0.28, metalness: 0.85 }),
  bow: new THREE.MeshStandardMaterial({ color: 9068331, roughness: 0.6, metalness: 0.1 }),
  pickaxe: new THREE.MeshStandardMaterial({ color: 11119017, roughness: 0.45, metalness: 0.6 }),
  spear: new THREE.MeshStandardMaterial({ color: 13227747, roughness: 0.35, metalness: 0.75 }),
  hammer: new THREE.MeshStandardMaterial({ color: 7034692, roughness: 0.55, metalness: 0.4 }),
  bomb: new THREE.MeshStandardMaterial({ color: 2829103, roughness: 0.5, metalness: 0.2 })
};
var WEAPON_LOOK = {
  default: { geo: GEO4.tool, mat: WEAPON_MAT.default, ry: 0, rz: 0 },
  sword: { geo: GEO4.sword, mat: WEAPON_MAT.sword, ry: 0, rz: 0.15 },
  bow: { geo: GEO4.bow, mat: WEAPON_MAT.bow, ry: Math.PI / 2, rz: 0 },
  pickaxe: { geo: GEO4.pickaxe, mat: WEAPON_MAT.pickaxe, ry: 0, rz: 0.9 },
  spear: { geo: GEO4.spear, mat: WEAPON_MAT.spear, ry: 0, rz: 0.05 },
  hammer: { geo: GEO4.hammer, mat: WEAPON_MAT.hammer, ry: 0, rz: 0.85 },
  bomb: { geo: GEO4.bomb, mat: WEAPON_MAT.bomb, ry: 0, rz: 0 }
};
var PALETTE = [6280447, 10354539, 16757599, 16739286, 14065919, 7077840];
var Player = class {
  constructor(id, name, colorIdx = 0, isLocal = false) {
    this.id = id;
    this.name = name;
    this.isLocal = isLocal;
    this.color = PALETTE[colorIdx % PALETTE.length];
    this.x = 0;
    this.z = 6;
    this.rot = Math.PI;
    this.hp = CFG.player.hp;
    this.maxHp = CFG.player.hp;
    this.alive = true;
    this.downTimer = 0;
    this.res = { wood: 0, stone: 0 };
    this.shards = 0;
    this.tools = {};
    this.equipped = null;
    this.harvestLv = 1;
    this.harvesting = null;
    this.attackCd = 0;
    this.swing = 0;
    this.combatUntil = 0;
    this.invulnerable = false;
    this.reviveAssisted = false;
    this.mesh = this._makeMesh();
    this.mesh.position.set(this.x, 0, this.z);
  }
  _makeMesh() {
    const g2 = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: this.color, roughness: 0.6, metalness: 0.1, transparent: true });
    this.mat = mat;
    const body = new THREE.Mesh(GEO4.body, mat);
    body.position.y = 0.85;
    body.castShadow = true;
    const head = new THREE.Mesh(GEO4.head, new THREE.MeshStandardMaterial({ color: 15913904, roughness: 0.8 }));
    head.position.y = 1.55;
    head.castShadow = true;
    g2.add(body, head);
    const arm = new THREE.Mesh(GEO4.arm, mat);
    arm.position.set(0.42, 1.05, 0.1);
    g2.add(arm);
    this.arm = arm;
    const tool = new THREE.Mesh(GEO4.tool, WEAPON_MAT.default);
    tool.position.set(0.5, 1, 0.35);
    tool.rotation.x = -0.4;
    tool.castShadow = true;
    g2.add(tool);
    this.tool = tool;
    this._weaponKey = "default";
    const ring = new THREE.Mesh(GEO4.ring, new THREE.MeshBasicMaterial({
      color: this.color,
      transparent: true,
      opacity: this.isLocal ? 0.85 : 0.5,
      side: THREE.DoubleSide
    }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    g2.add(ring);
    this.ring = ring;
    return g2;
  }
  get harvestMult() {
    return CFG.harvest.upgrade[this.harvestLv - 1].mult;
  }
  // 곡괭이는 만들어 두는 것만으로는 부족하고, 손에 쥐고 있어야 정수석을 캘 수 있다
  get holdingPickaxe() {
    return this.heldWeapon === "pickaxe";
  }
  // 기본 공격치에 지금 손에 든 무기의 효과만 더한다 (여러 자루를 동시에 들 수는 없다)
  get attackStats() {
    const base = CFG.player.attack;
    const out = { dmg: base.dmg, range: base.range, arc: base.arc, cd: base.cd };
    const eff = CFG.craft[this.heldWeapon]?.effect;
    if (eff) for (const k2 of Object.keys(eff)) out[k2] += eff[k2];
    return out;
  }
  damage(amount) {
    if (!this.alive) return false;
    this.hp -= amount;
    this.combatUntil = performance.now() / 1e3 + 2;
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
    this.x = 0;
    this.z = CFG.world.coreRadius + 2;
    this.reviveAssisted = false;
  }
  cancelHarvest() {
    this.harvesting = null;
  }
  // 인벤토리에서 고른 무기를 손에 든다.
  // "none" 은 맨손을 직접 고른 것이고, 아무것도 고르지 않았으면 칼 > 활 순으로 자동
  get heldWeapon() {
    if (this.equipped === "none") return "default";
    if (this.equipped && this.tools[this.equipped]) return this.equipped;
    return this.tools.sword ? "sword" : this.tools.spear ? "spear" : this.tools.hammer ? "hammer" : this.tools.bow ? "bow" : "default";
  }
  _updateWeapon() {
    const key = WEAPON_LOOK[this.heldWeapon] ? this.heldWeapon : "default";
    if (key === this._weaponKey) return;
    this._weaponKey = key;
    const look = WEAPON_LOOK[key];
    this.tool.geometry = look.geo;
    this.tool.material = look.mat;
    this.tool.rotation.y = look.ry;
    this.tool.rotation.z = look.rz;
  }
  // 애니메이션 (모든 플레이어 공통)
  animate(dt2, moving) {
    this._updateWeapon();
    const t2 = performance.now() / 1e3;
    if (this.swing > 0) {
      this.swing -= dt2 * 3.4;
      const k2 = Math.max(0, this.swing);
      this.arm.rotation.x = -Math.sin(k2 * Math.PI) * 2.2;
      this.tool.rotation.x = -0.4 - Math.sin(k2 * Math.PI) * 2.4;
    } else if (this.harvesting) {
      this.arm.rotation.x = Math.sin(t2 * 12) * 0.9;
      this.tool.rotation.x = -0.4 + Math.sin(t2 * 12) * 1;
    } else {
      this.arm.rotation.x = moving ? Math.sin(t2 * 9) * 0.6 : Math.sin(t2 * 2) * 0.08;
      this.tool.rotation.x = -0.4;
    }
    const bob = moving ? Math.abs(Math.sin(t2 * 9)) * 0.09 : 0;
    this.mesh.position.y = bob;
    this.mesh.rotation.y = this.rot;
    this.ring.material.opacity = this.alive ? this.isLocal ? 0.85 : 0.45 : this.reviveAssisted ? 0.45 + Math.abs(Math.sin(t2 * 8)) * 0.35 : 0.15;
    this.mat.emissive?.setHex(this.combatUntil > t2 ? 6693410 : 0);
    this.mat.opacity = this.invulnerable ? 0.35 + Math.abs(Math.sin(t2 * 26)) * 0.35 : 1;
  }
};
export var LocalPlayer = class extends Player {
  constructor(id, name, colorIdx) {
    super(id, name, colorIdx, true);
    this.dashCd = 0;
    this.dashUntil = 0;
    this.dashDir = { x: 0, z: 1 };
  }
  // 회피 돌진 시작 — 쿨다운 중이거나 쓰러진 상태면 실패. 이동 입력이 있으면 그 방향으로, 없으면 바라보는 방향으로
  tryDash(input, sm2) {
    if (!this.alive || this.dashCd > 0) return false;
    const ax = input.axis();
    const basis = sm2.moveBasis();
    let dx = basis.rx * ax.x + basis.fx * ax.y;
    let dz = basis.rz * ax.x + basis.fz * ax.y;
    const len = Math.hypot(dx, dz);
    if (len > 0.01) {
      dx /= len;
      dz /= len;
    } else {
      dx = Math.sin(this.rot);
      dz = Math.cos(this.rot);
    }
    this.dashDir = { x: dx, z: dz };
    const dc2 = CFG.player.dash;
    this.dashUntil = performance.now() / 1e3 + dc2.duration;
    this.dashCd = dc2.cooldown;
    this.cancelHarvest();
    return true;
  }
  update(dt2, input, sm2, grid, world, others) {
    const now = performance.now() / 1e3;
    if (!this.alive) {
      const rc = CFG.player.revive;
      this.reviveAssisted = !!others && others.some((p2) => p2 !== this && p2.alive && dist(p2.x, p2.z, this.x, this.z) <= rc.radius);
      this.downTimer -= dt2 * (this.reviveAssisted ? rc.assistMult : 1);
      this.mesh.position.set(this.x, 0.2, this.z);
      if (this.downTimer <= 0) this.revive();
      return { moved: false };
    }
    this.dashCd -= dt2;
    this.invulnerable = now < this.dashUntil;
    if (now > this.combatUntil && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + CFG.player.regen * dt2);
    }
    let moving;
    if (this.invulnerable) {
      const dc2 = CFG.player.dash;
      this.x += this.dashDir.x * dc2.speed * dt2;
      this.z += this.dashDir.z * dc2.speed * dt2;
      this.rot = Math.atan2(this.dashDir.x, this.dashDir.z);
      this._collide(grid, world);
      moving = true;
    } else {
      const ax = input.axis();
      const basis = sm2.moveBasis();
      let mx = basis.rx * ax.x + basis.fx * ax.y;
      let mz = basis.rz * ax.x + basis.fz * ax.y;
      moving = Math.hypot(mx, mz) > 0.01;
      if (moving) {
        this.cancelHarvest();
        const sprint = input.down("shift");
        const weatherMult = world.weatherKind === "rain" ? WEATHER.rain.playerSpeedMult : 1;
        const spd = (sprint ? CFG.player.sprint : CFG.player.speed) * weatherMult;
        const len = Math.hypot(mx, mz);
        mx /= len;
        mz /= len;
        this.x += mx * spd * dt2;
        this.z += mz * spd * dt2;
        this.rot = Math.atan2(mx, mz);
        this._collide(grid, world);
      }
    }
    this.attackCd -= dt2;
    this.animate(dt2, moving);
    this.mesh.position.x = this.x;
    this.mesh.position.z = this.z;
    return { moved: moving };
  }
  _collide(grid, world) {
    const half = CFG.world.size / 2 - 1;
    this.x = clamp(this.x, -half, half);
    this.z = clamp(this.z, -half, half);
    const r = CFG.player.radius;
    const dc2 = Math.hypot(this.x, this.z);
    if (dc2 < CFG.world.coreRadius) {
      const k2 = CFG.world.coreRadius / (dc2 || 1e-3);
      this.x *= k2;
      this.z *= k2;
    }
    for (const n of world.nodes) {
      if (n.depleted) continue;
      const d2 = dist(this.x, this.z, n.x, n.z);
      const min = r + n.radius * 0.7;
      if (d2 < min && d2 > 1e-4) {
        const k2 = (min - d2) / d2;
        this.x += (this.x - n.x) * k2;
        this.z += (this.z - n.z) * k2;
      }
    }
    const g2 = grid.toGrid(this.x, this.z);
    for (let gz = g2.gz - 1; gz <= g2.gz + 1; gz++) {
      for (let gx = g2.gx - 1; gx <= g2.gx + 1; gx++) {
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
  // 특정 자원을 콕 집어 캐기 시작한다 (클릭/탭으로 고른 것). 성공하면 true.
  beginHarvest(node) {
    if (!this.alive || !node || node.depleted) return false;
    if (needsPickaxe(node.type) && !this.holdingPickaxe) return false;
    if (dist(this.x, this.z, node.x, node.z) > CFG.harvest.range) return false;
    this.harvesting = { node, t: 0, need: CFG.harvest[node.type].time * this.harvestMult };
    this.rot = Math.atan2(node.x - this.x, node.z - this.z);
    return true;
  }
  // holding 이 true 면 근처 자원을 자동으로 잡아 캔다 (F 키 유지용).
  // 이미 캐던 것이 있으면 holding 과 무관하게 계속 캔다 — 클릭으로 시작한 채집이 그대로 이어진다.
  tickHarvest(dt2, world, holding) {
    if (!this.alive) return null;
    if (!this.harvesting) {
      if (!holding) return null;
      const node = world.nearestNode(this.x, this.z, CFG.harvest.range);
      if (!node) return null;
      if (needsPickaxe(node.type) && !this.holdingPickaxe) return null;
      this.harvesting = { node, t: 0, need: CFG.harvest[node.type].time * this.harvestMult };
      this.rot = Math.atan2(node.x - this.x, node.z - this.z);
    }
    const h2 = this.harvesting;
    if (h2.node.depleted || dist(this.x, this.z, h2.node.x, h2.node.z) > CFG.harvest.range + 0.6) {
      this.harvesting = null;
      return null;
    }
    h2.t += dt2;
    if (h2.t >= h2.need) {
      const node = h2.node;
      this.harvesting = null;
      return node;
    }
    return null;
  }
  tryAttack() {
    if (!this.alive || this.attackCd > 0) return false;
    this.attackCd = this.attackStats.cd;
    this.swing = 1;
    this.cancelHarvest();
    return true;
  }
  // 폭탄가방을 들었을 때 공격 입력이 대신 이걸 부른다 — 같은 attackCd 를 공유하니 근접과 동시에 못 쓴다
  tryThrow() {
    if (!this.alive || this.attackCd > 0) return false;
    this.attackCd = CFG.craft.bomb.throw.cd;
    this.swing = 1;
    this.cancelHarvest();
    return true;
  }
};
export var RemotePlayer = class extends Player {
  constructor(id, name, colorIdx) {
    super(id, name, colorIdx, false);
    this.netTarget = { x: this.x, z: this.z, rot: this.rot };
  }
  applyNet(s2) {
    this.netTarget = { x: s2.x, z: s2.z, rot: s2.rot };
    this.hp = s2.hp;
    this.alive = s2.alive;
    this.invulnerable = !!s2.invulnerable;
    this.reviveAssisted = !!s2.reviveAssisted;
    this.harvesting = s2.harvesting ? { t: 0, need: 1 } : null;
    if (s2.held) {
      this.tools[s2.held] = true;
      this.equipped = s2.held;
    } else {
      this.equipped = null;
    }
    if (s2.swing) this.swing = 1;
    this.mesh.rotation.z = s2.alive ? 0 : Math.PI / 2;
  }
  update(dt2) {
    const k2 = 1 - Math.pow(8e-4, dt2);
    const moved = Math.hypot(this.netTarget.x - this.x, this.netTarget.z - this.z) > 0.05;
    this.x += (this.netTarget.x - this.x) * k2;
    this.z += (this.netTarget.z - this.z) * k2;
    let d2 = (this.netTarget.rot - this.rot + Math.PI) % (Math.PI * 2) - Math.PI;
    this.rot += d2 * Math.min(1, dt2 * 12);
    this.mesh.position.set(this.x, this.mesh.position.y, this.z);
    this.animate(dt2, moved);
  }
};
