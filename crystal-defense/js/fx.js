import * as THREE from '../vendor/three.module.js';

var SPARK_GEO = new THREE.SphereGeometry(0.12, 6, 5);
export var Fx = class {
  constructor(sm2, layerEl) {
    this.sm = sm2;
    this.layer = layerEl;
    this.sparks = [];
    this.floats = [];
    this.rings = [];
    this._pool = [];
  }
  _spark(color) {
    let m2 = this._pool.pop();
    if (!m2) {
      m2 = new THREE.Mesh(SPARK_GEO, new THREE.MeshBasicMaterial({ color }));
      this.sm.scene.add(m2);
    }
    m2.material.color.setHex(color);
    m2.visible = true;
    return m2;
  }
  burst(x2, y2, z2, color = 16763989, count = 8, power = 4) {
    for (let i = 0; i < count; i++) {
      const m2 = this._spark(color);
      m2.position.set(x2, y2, z2);
      m2.scale.setScalar(0.6 + Math.random() * 0.8);
      this.sparks.push({
        mesh: m2,
        life: 0.45 + Math.random() * 0.3,
        t: 0,
        vx: (Math.random() - 0.5) * power,
        vy: Math.random() * power * 0.9 + 1,
        vz: (Math.random() - 0.5) * power
      });
    }
  }
  ring(x2, z2, color = 6545663, radius = 3) {
    const m2 = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.2, radius * 0.26, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    );
    m2.rotation.x = -Math.PI / 2;
    m2.position.set(x2, 0.2, z2);
    this.sm.scene.add(m2);
    this.rings.push({ mesh: m2, t: 0, life: 0.5, radius });
  }
  // 3D 좌표 위에 뜨는 데미지/획득 텍스트
  float(text, x2, y2, z2, cls = "") {
    const el2 = document.createElement("div");
    el2.className = `float ${cls}`;
    el2.textContent = text;
    this.layer.appendChild(el2);
    this.floats.push({ el: el2, x: x2, y: y2, z: z2, t: 0, life: 1 });
  }
  update(dt2) {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s2 = this.sparks[i];
      s2.t += dt2;
      if (s2.t >= s2.life) {
        s2.mesh.visible = false;
        this._pool.push(s2.mesh);
        this.sparks.splice(i, 1);
        continue;
      }
      s2.vy -= 14 * dt2;
      s2.mesh.position.x += s2.vx * dt2;
      s2.mesh.position.y += s2.vy * dt2;
      s2.mesh.position.z += s2.vz * dt2;
      if (s2.mesh.position.y < 0.05) {
        s2.mesh.position.y = 0.05;
        s2.vy *= -0.3;
        s2.vx *= 0.6;
        s2.vz *= 0.6;
      }
      s2.mesh.scale.setScalar(Math.max(0.05, 1 - s2.t / s2.life));
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt2;
      const k2 = r.t / r.life;
      if (k2 >= 1) {
        this.sm.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        this.rings.splice(i, 1);
        continue;
      }
      r.mesh.scale.setScalar(0.4 + k2 * r.radius * 1.2);
      r.mesh.material.opacity = 0.9 * (1 - k2);
    }
    const v2 = new THREE.Vector3();
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += dt2;
      if (f.t >= f.life) {
        f.el.remove();
        this.floats.splice(i, 1);
        continue;
      }
      v2.set(f.x, f.y + f.t * 1.6, f.z);
      const p2 = this.sm.worldToScreen(v2);
      if (!p2.visible) {
        f.el.style.display = "none";
        continue;
      }
      f.el.style.display = "";
      f.el.style.transform = `translate(-50%,-50%) translate(${p2.x}px, ${p2.y}px)`;
      f.el.style.opacity = String(1 - Math.pow(f.t / f.life, 2));
    }
  }
};
export var ProjectilePool = class {
  constructor(sm2) {
    this.sm = sm2;
    this.items = [];
    this.pool = [];
    this.geo = new THREE.SphereGeometry(0.22, 8, 6);
  }
  fire(from, to2, speed, color, onHit) {
    let m2 = this.pool.pop();
    if (!m2) {
      m2 = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color }));
      this.sm.scene.add(m2);
    }
    m2.material.color.setHex(color);
    m2.visible = true;
    m2.position.copy(from);
    this.items.push({
      mesh: m2,
      from: from.clone(),
      to: to2.clone(),
      t: 0,
      dur: Math.max(0.06, from.distanceTo(to2) / speed),
      onHit
    });
  }
  update(dt2) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p2 = this.items[i];
      p2.t += dt2;
      const k2 = Math.min(1, p2.t / p2.dur);
      p2.mesh.position.lerpVectors(p2.from, p2.to, k2);
      p2.mesh.position.y += Math.sin(k2 * Math.PI) * 1.1;
      if (k2 >= 1) {
        p2.onHit?.(p2.mesh.position);
        p2.mesh.visible = false;
        this.pool.push(p2.mesh);
        this.items.splice(i, 1);
      }
    }
  }
};
