// 맵: 크리스탈 · 자원 노드(나무/돌) · 스폰 포탈 · 장식물.
// 맵은 시드 기반으로 생성되므로 같은 방의 모든 플레이어가 동일한 배치를 본다.
import * as THREE from '../vendor/three.module.js';
import { CFG } from './config.js';
import { mulberry32, dist } from './utils.js';

const GEO = {
  trunk: new THREE.CylinderGeometry(0.26, 0.34, 2.2, 6),
  leaf: new THREE.ConeGeometry(1.5, 3.2, 7),
  rock: new THREE.IcosahedronGeometry(1.0, 0),
  stump: new THREE.CylinderGeometry(0.34, 0.4, 0.5, 6),
  crystal: new THREE.OctahedronGeometry(2.0, 0),
  pedestal: new THREE.CylinderGeometry(3.0, 3.6, 1.1, 8),
  portal: new THREE.TorusGeometry(2.2, 0.28, 8, 24),
};

const MAT = {
  trunk: new THREE.MeshStandardMaterial({ color: 0x5b3d24, roughness: 0.95 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x3e8b47, roughness: 0.9 }),
  leafDry: new THREE.MeshStandardMaterial({ color: 0x6f7d35, roughness: 0.9 }),
  rock: new THREE.MeshStandardMaterial({ color: 0x8b8f9a, roughness: 0.85, metalness: 0.06 }),
  ore: new THREE.MeshStandardMaterial({ color: 0x6f7a92, roughness: 0.6, metalness: 0.35 }),
  pedestal: new THREE.MeshStandardMaterial({ color: 0x3a4560, roughness: 0.7 }),
  crystal: new THREE.MeshStandardMaterial({
    color: 0x7fe6ff, emissive: 0x2aa6cc, emissiveIntensity: 1.4,
    roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92,
  }),
  portal: new THREE.MeshStandardMaterial({ color: 0xff5a72, emissive: 0xff2b4a, emissiveIntensity: 1.1, roughness: 0.4 }),
};

export class World {
  constructor(sceneMgr, seed = 1) {
    this.sm = sceneMgr;
    this.root = new THREE.Group();
    sceneMgr.scene.add(this.root);
    this.scene = this.root;          // 월드 오브젝트는 모두 root 아래로
    this.seed = seed;
    this.nodes = [];        // 자원 노드
    this.portals = [];      // 몬스터 스폰 지점
    this.crystal = { hp: CFG.crystal.hp, maxHp: CFG.crystal.hp };
    this._build();
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
    const g = new THREE.Group();
    const ped = new THREE.Mesh(GEO.pedestal, MAT.pedestal);
    ped.position.y = 0.55; ped.castShadow = true; ped.receiveShadow = true;
    g.add(ped);

    const core = new THREE.Mesh(GEO.crystal, MAT.crystal.clone());
    core.position.y = 3.4; core.castShadow = true;
    g.add(core);
    this.crystalMesh = core;

    const halo = new THREE.Mesh(
      new THREE.RingGeometry(3.8, 4.4, 48),
      new THREE.MeshBasicMaterial({ color: 0x63e0ff, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
    );
    halo.rotation.x = -Math.PI / 2; halo.position.y = 0.06;
    g.add(halo);
    this.crystalHalo = halo;

    this.scene.add(g);
    this.crystalGroup = g;
  }

  _buildPortals() {
    const r = CFG.world.size * 0.44;
    const angles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
    for (const a of angles) {
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const m = new THREE.Mesh(GEO.portal, MAT.portal);
      m.position.set(x, 2.2, z);
      m.rotation.y = -a;
      this.scene.add(m);
      this.portals.push({ x, z, mesh: m });
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
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (this.nodes.some(n => dist(n.x, n.z, x, z) < 3.0)) continue;
        if (this.portals.some(p => dist(p.x, p.z, x, z) < 6)) continue;
        this.nodes.push(this._makeNode(id++, type, x, z, rng));
        made++;
      }
    };
    place('tree', 46);
    place('rock', 30);
  }

  _makeNode(id, type, x, z, rng) {
    const cfg = CFG.harvest[type];
    let body, stump;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rng() * Math.PI * 2;

    if (type === 'tree') {
      const trunk = new THREE.Mesh(GEO.trunk, MAT.trunk);
      trunk.position.y = 1.1; trunk.castShadow = true;
      const leaf = new THREE.Mesh(GEO.leaf, rng() > 0.75 ? MAT.leafDry : MAT.leaf);
      leaf.position.y = 3.4; leaf.castShadow = true;
      const s = 0.85 + rng() * 0.4;
      leaf.scale.setScalar(s);
      g.add(trunk, leaf);
      body = leaf;
      stump = new THREE.Mesh(GEO.stump, MAT.trunk);
      stump.position.y = 0.25; stump.visible = false;
      g.add(stump);
    } else {
      const rockG = new THREE.Group();
      const n = 2 + Math.floor(rng() * 2);
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(GEO.rock, rng() > 0.6 ? MAT.ore : MAT.rock);
        m.position.set((rng() - 0.5) * 1.6, 0.4 + rng() * 0.4, (rng() - 0.5) * 1.6);
        m.scale.setScalar(0.5 + rng() * 0.6);
        m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
        m.castShadow = true; m.receiveShadow = true;
        rockG.add(m);
      }
      g.add(rockG);
      body = rockG;
      stump = new THREE.Mesh(GEO.rock, MAT.rock);
      stump.scale.setScalar(0.28); stump.position.y = 0.15; stump.visible = false;
      g.add(stump);
    }

    this.scene.add(g);
    return {
      id, type, x, z,
      charges: cfg.charges, maxCharges: cfg.charges,
      respawnAt: 0, depleted: false,
      group: g, body, stump,
      radius: type === 'tree' ? 1.0 : 1.3,
    };
  }

  _buildScenery() {
    // 맵 가장자리 장식 (플레이 영역 밖, 충돌 없음)
    const rng = mulberry32(this.seed * 7 + 13);
    const half = CFG.world.size * 0.5;
    for (let i = 0; i < 90; i++) {
      const a = rng() * Math.PI * 2;
      const r = half * (0.5 + rng() * 0.52);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x) > half - 2 || Math.abs(z) > half - 2) continue;
      if (Math.hypot(x, z) < CFG.world.size * 0.42) continue;
      const m = new THREE.Mesh(rng() > 0.5 ? GEO.leaf : GEO.rock, rng() > 0.5 ? MAT.leaf : MAT.rock);
      m.position.set(x, rng() > 0.5 ? 2.2 : 0.5, z);
      m.scale.setScalar(0.6 + rng() * 0.7);
      m.castShadow = true;
      this.scene.add(m);
    }
  }

  // --- 자원 노드 ---
  nodeById(id) { return this.nodes.find(n => n.id === id); }

  nearestNode(x, z, range) {
    let best = null, bd = range * range;
    for (const n of this.nodes) {
      if (n.depleted) continue;
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  consumeNode(node) {
    node.charges -= 1;
    if (node.charges <= 0) {
      node.depleted = true;
      node.respawnAt = performance.now() / 1000 + CFG.harvest[node.type].respawn;
    }
    this._refreshNodeVisual(node);
  }

  updateNodes(now) {
    for (const n of this.nodes) {
      if (n.depleted && now >= n.respawnAt) {
        n.depleted = false;
        n.charges = n.maxCharges;
        this._refreshNodeVisual(n);
        // 되살아날 때 살짝 튀어오르는 연출
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
      const t = n.charges / n.maxCharges;
      n.body.scale.setScalar(n.type === 'tree' ? (0.6 + t * 0.4) : (0.7 + t * 0.3));
    }
  }

  // 네트워크 동기화용 노드 상태
  nodeSnapshot() {
    return this.nodes.map(n => (n.depleted ? -1 : n.charges));
  }
  applyNodeSnapshot(arr) {
    if (!arr) return;
    for (let i = 0; i < this.nodes.length && i < arr.length; i++) {
      const n = this.nodes[i];
      const v = arr[i];
      const dep = v < 0;
      if (n.depleted !== dep || n.charges !== v) {
        n.depleted = dep;
        n.charges = dep ? 0 : v;
        this._refreshNodeVisual(n);
      }
    }
  }

  // 건설 시 자원 노드와 겹치는지
  blocksBuild(x, z) {
    for (const n of this.nodes) {
      if (n.depleted) continue;
      if (dist(n.x, n.z, x, z) < n.radius + 0.9) return true;
    }
    return false;
  }

  damageCrystal(amount) {
    this.crystal.hp = Math.max(0, this.crystal.hp - amount);
    this._pulse = 0.35;
    return this.crystal.hp <= 0;
  }
  healCrystal(amount) {
    this.crystal.hp = Math.min(this.crystal.maxHp, this.crystal.hp + amount);
  }

  update(dt, now) {
    this.crystalMesh.rotation.y += dt * 0.5;
    this.crystalMesh.position.y = 3.4 + Math.sin(now * 1.6) * 0.18;
    const ratio = this.crystal.hp / this.crystal.maxHp;
    this.crystalMesh.material.emissiveIntensity = 0.6 + ratio * 1.2;
    this.crystalMesh.material.color.setHSL(0.52 * ratio + 0.0, 0.9, 0.55 + 0.1 * ratio);
    this.sm.crystalLight.intensity = 1.2 + ratio * 1.6;

    if (this._pulse > 0) {
      this._pulse -= dt;
      const s = 1 + Math.max(0, this._pulse) * 0.6;
      this.crystalMesh.scale.setScalar(s);
      this.crystalHalo.material.opacity = 0.4 + Math.max(0, this._pulse);
    } else {
      this.crystalMesh.scale.setScalar(1);
      this.crystalHalo.material.opacity = 0.35 + Math.sin(now * 2) * 0.08;
    }

    for (const p of this.portals) {
      p.mesh.rotation.z += dt * 1.2;
      p.mesh.material.emissiveIntensity = 0.9 + Math.sin(now * 3 + p.x) * 0.35;
    }
    this.updateNodes(now);
  }
}
