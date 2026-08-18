// 이펙트: 데미지 숫자(HTML), 파티클, 투사체, 링 이펙트.
import * as THREE from '../vendor/three.module.js';

const SPARK_GEO = new THREE.SphereGeometry(0.12, 6, 5);

export class Fx {
  constructor(sm, layerEl) {
    this.sm = sm;
    this.layer = layerEl;
    this.sparks = [];
    this.floats = [];
    this.rings = [];
    this._pool = [];
  }

  _spark(color) {
    let m = this._pool.pop();
    if (!m) {
      m = new THREE.Mesh(SPARK_GEO, new THREE.MeshBasicMaterial({ color }));
      this.sm.scene.add(m);
    }
    m.material.color.setHex(color);
    m.visible = true;
    return m;
  }

  burst(x, y, z, color = 0xffcc55, count = 8, power = 4) {
    for (let i = 0; i < count; i++) {
      const m = this._spark(color);
      m.position.set(x, y, z);
      m.scale.setScalar(0.6 + Math.random() * 0.8);
      this.sparks.push({
        mesh: m, life: 0.45 + Math.random() * 0.3, t: 0,
        vx: (Math.random() - 0.5) * power,
        vy: Math.random() * power * 0.9 + 1,
        vz: (Math.random() - 0.5) * power,
      });
    }
  }

  ring(x, z, color = 0x63e0ff, radius = 3) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.2, radius * 0.26, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.2, z);
    this.sm.scene.add(m);
    this.rings.push({ mesh: m, t: 0, life: 0.5, radius });
  }

  // 3D 좌표 위에 뜨는 데미지/획득 텍스트
  float(text, x, y, z, cls = '') {
    const el = document.createElement('div');
    el.className = `float ${cls}`;
    el.textContent = text;
    this.layer.appendChild(el);
    this.floats.push({ el, x, y, z, t: 0, life: 1.0 });
  }

  update(dt) {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.t += dt;
      if (s.t >= s.life) {
        s.mesh.visible = false;
        this._pool.push(s.mesh);
        this.sparks.splice(i, 1);
        continue;
      }
      s.vy -= 14 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      if (s.mesh.position.y < 0.05) { s.mesh.position.y = 0.05; s.vy *= -0.3; s.vx *= 0.6; s.vz *= 0.6; }
      s.mesh.scale.setScalar(Math.max(0.05, 1 - s.t / s.life));
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const k = r.t / r.life;
      if (k >= 1) { this.sm.scene.remove(r.mesh); r.mesh.geometry.dispose(); this.rings.splice(i, 1); continue; }
      r.mesh.scale.setScalar(0.4 + k * r.radius * 1.2);
      r.mesh.material.opacity = 0.9 * (1 - k);
    }

    const v = new THREE.Vector3();
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += dt;
      if (f.t >= f.life) { f.el.remove(); this.floats.splice(i, 1); continue; }
      v.set(f.x, f.y + f.t * 1.6, f.z);
      const p = this.sm.worldToScreen(v);
      if (!p.visible) { f.el.style.display = 'none'; continue; }
      f.el.style.display = '';
      f.el.style.transform = `translate(-50%,-50%) translate(${p.x}px, ${p.y}px)`;
      f.el.style.opacity = String(1 - Math.pow(f.t / f.life, 2));
    }
  }
}

// 타워 투사체 (직선 비행 후 명중 콜백)
export class ProjectilePool {
  constructor(sm) {
    this.sm = sm;
    this.items = [];
    this.pool = [];
    this.geo = new THREE.SphereGeometry(0.22, 8, 6);
  }
  fire(from, to, speed, color, onHit) {
    let m = this.pool.pop();
    if (!m) {
      m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color }));
      this.sm.scene.add(m);
    }
    m.material.color.setHex(color);
    m.visible = true;
    m.position.copy(from);
    this.items.push({
      mesh: m, from: from.clone(), to: to.clone(), t: 0,
      dur: Math.max(0.06, from.distanceTo(to) / speed), onHit,
    });
  }
  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      p.mesh.position.lerpVectors(p.from, p.to, k);
      p.mesh.position.y += Math.sin(k * Math.PI) * 1.1;   // 살짝 포물선
      if (k >= 1) {
        p.onHit?.(p.mesh.position);
        p.mesh.visible = false;
        this.pool.push(p.mesh);
        this.items.splice(i, 1);
      }
    }
  }
}
