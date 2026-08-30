import * as THREE from '../vendor/three.module.js';
import { CFG, enemyStats } from './config.js';
import { clamp, dist } from './utils.js';

var _variantTintColor = new THREE.Color();
function tintedColor(baseColor, variant) {
  if (!variant) return baseColor;
  const v = CFG.variants[variant];
  _variantTintColor.set(baseColor).lerp(new THREE.Color(v.tint), 0.55);
  return _variantTintColor.getHex();
}
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
var _regenColor = new THREE.Color(3390720);
var _rootColor = new THREE.Color(13215862);
var _eliteTintColor = new THREE.Color();
function eliteColor(baseColor) {
  const v = CFG.elite;
  _eliteTintColor.set(baseColor).lerp(new THREE.Color(v.tint), 0.7);
  return _eliteTintColor.getHex();
}
var _tmpColor = new THREE.Color();
var _tmpVec = new THREE.Vector3();
var _tmpQuat = new THREE.Quaternion();
var _tmpMat = new THREE.Matrix4();
var nextId2 = 1;
function resetEnemyIds() {
  nextId2 = 1;
}
var Enemy = class {
  // variant: null 또는 "shield"/"split"/"dash"/"regen". statMult: 분열 자식을 줄이거나(hp/scale<1) 정예를
  // 키우는(hp/scale/dmg/bounty>1, elite:true) 용도로 같이 쓰는 스탯 배율.
  constructor(type, wave, x2, z2, id, variant, statMult) {
    const st = enemyStats(type, wave);
    if (statMult) {
      st.maxHp = Math.max(1, Math.round(st.maxHp * (statMult.hp ?? 1)));
      st.scale *= statMult.scale ?? 1;
      st.radius *= statMult.scale ?? 1;
      if (statMult.dmg) st.dmg = Math.round(st.dmg * statMult.dmg);
      if (statMult.dmg && st.explode) st.explode = { ...st.explode, dmg: Math.round(st.explode.dmg * statMult.dmg), playerDmg: Math.round(st.explode.playerDmg * statMult.dmg) };
      if (statMult.bounty) st.bounty = { wood: Math.round(st.bounty.wood * statMult.bounty), stone: Math.round(st.bounty.stone * statMult.bounty) };
    }
    this.id = id || nextId2++;
    this.type = type;
    this.wave = wave;
    this.st = st;
    this.variant = variant || null;
    this.elite = !!(statMult && statMult.elite);
    this.tintColor = this.elite ? eliteColor(st.color) : tintedColor(st.color, this.variant);
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
    this.rootUntil = 0;
    this.poisonDps = 0;
    this.poisonUntil = 0;
    this.poisonTickCd = 0;
    this.target = null;
    this.diving = !!st.burrows;
    this._dustCd = 0;
    if (this.variant === "dash") {
      this.dashCd = CFG.variants.dash.interval * (0.4 + Math.random() * 0.6);
      this.dashUntil = 0;
    }
    this.mesh = this._makeMesh();
    this.mesh.position.set(x2, 0, z2);
    this.mesh.userData.enemy = this;
    this._bob = Math.random() * 6;
    this._kox = 0;
    this._koz = 0;
    this._punch = 0;
    if (st.boss) {
      this.summonsDone = 0;
      this.castKind = null;
      this.castUntil = 0;
      this.chargeUntil = 0;
      this.chargeCd = CFG.bossPattern.chargeCd * 0.6;
      this.chargeDir = { x: 0, z: 0 };
      this.silenceUntil = 0;
      this.fortifyUntil = 0;
    }
  }
  get isCasting() {
    return this.castUntil > 0;
  }
  get isCharging() {
    return this.chargeUntil > 0;
  }
  _makeMesh() {
    const g2 = new THREE.Group();
    if (this.instanced) {
    } else {
      const mat = new THREE.MeshStandardMaterial({ color: this.tintColor, roughness: 0.75 });
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
    if (this.type === "brute" || this.st.boss) {
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
    const fg = new THREE.Mesh(GEO3.bar, new THREE.MeshBasicMaterial({ color: 16738922, depthTest: false, transparent: true }));
    fg.position.z = 0.01;
    bg.renderOrder = 5;
    fg.renderOrder = 6;
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
  // 저항 변종은 셋 다(둔화·속박·중독) 그냥 무시한다 — 서리탑·덫탑·독탑·얼음도끼가 전부 이 세
  // 메서드 하나씩을 거쳐가므로, 여기서 조용히 리턴하는 것만으로 새 배관 없이 모든 상태이상
  // 소스에 동시에 면역이 적용된다(반대로 기존 필드는 손대지 않으니 slowUntil 등 기본값 0이
  // 그대로 유지돼 "항상 안 걸린 상태"와 동일하게 처리된다).
  applySlow(factor, duration, now) {
    if (this.variant === "resist") return;
    this.slowFactor = Math.min(this.slowFactor, 1 - factor);
    this.slowUntil = Math.max(this.slowUntil, now + duration);
    if (this.bodyMat) {
      this.bodyMat.emissive?.setHex(2781088);
      this.bodyMat.emissiveIntensity = 0.6;
    }
  }
  // 덫탑 전용 — 둔화(비율 감소)와 달리 이동 속도를 완전히 0으로 묶는다. 슬로우와는 별개 상태라
  // 둘 다 걸려도 root 가 우선한다(simulate() 의 speed 계산에서 처리)
  applyRoot(duration, now) {
    if (this.variant === "resist") return;
    this.rootUntil = Math.max(this.rootUntil, now + duration);
    if (this.bodyMat) {
      this.bodyMat.emissive?.setHex(13215862);
      this.bodyMat.emissiveIntensity = 0.6;
    }
  }
  applyPoison(dps, duration, now) {
    if (this.variant === "resist") return;
    this.poisonDps = Math.max(this.poisonDps, dps);
    this.poisonUntil = Math.max(this.poisonUntil, now + duration);
  }
  // 피격 시 히트 플래시 + 타격 방향 반대쪽으로 살짝 넉백 + 펀치 스케일 튐
  // 방패 변종: 정면(진행 방향 기준 앞쪽 144˚)에서 맞으면 피해가 크게 줄어든다 — 등 뒤로 돌아가야 제대로 들어간다
  damage(amount, fromX, fromZ) {
    let applied = amount;
    if (this.fortifyUntil && performance.now() / 1e3 < this.fortifyUntil) {
      applied = amount * (1 - CFG.bossPattern.fortifyMitigation);
    }
    if (this.variant === "shield" && typeof fromX === "number") {
      const v = CFG.variants.shield;
      const angToAttacker = Math.atan2(fromX - this.x, fromZ - this.z);
      let d3 = (angToAttacker - this.mesh.rotation.y + Math.PI) % (Math.PI * 2) - Math.PI;
      if (Math.abs(d3) <= v.frontArc / 2) applied = amount * (1 - v.mitigation);
    }
    this.hp -= applied;
    this._lastHitAt = performance.now() / 1e3;
    this.refreshBar();
    this._flash = 0.12;
    this._punch = 1;
    if (this.bodyMat) this.bodyMat.color.setHex(16777215);
    if (typeof fromX === "number") {
      const dx = this.x - fromX, dz = this.z - fromZ;
      const len = Math.hypot(dx, dz) || 1;
      const kb = Math.min(0.4, 0.06 + applied * 4e-3) / this.st.scale;
      this._kox = clamp(this._kox + dx / len * kb, -0.5, 0.5);
      this._koz = clamp(this._koz + dz / len * kb, -0.5, 0.5);
    }
    if (this.hp <= 0) this.dead = true;
    return { died: this.dead, applied };
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
    this.onSpawn = null;
    this.onBurrowEmerge = null;
    this.onNodeSteal = null;
    this.onRallyPulse = null;
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
  // 웨이브에 속한 적만 — 보물게처럼 독립 이벤트로 나온 개체는 빼고 센다.
  // 웨이브 클리어 판정과 "남은 몬스터" 표시는 반드시 이쪽을 써야 한다.
  get aliveInWave() {
    return this.list.filter((e) => !e.dead && !e.st.event).length;
  }
  spawn(type, wave, x2, z2, id, variant, statMult) {
    if (this.list.length >= CFG.wave.maxAlive) return null;
    const e = new Enemy(type, wave, x2, z2, id, variant, statMult);
    if (e.instanced) {
      e.bodyIdx = this._freeBodyIdx.length ? this._freeBodyIdx.pop() : -1;
    }
    this.root.add(e.mesh);
    this.list.push(e);
    this.fx.ring(x2, z2, 16734834, 2);
    this.onSpawn?.(e);
    return e;
  }
  // 분열 변종이 죽을 때 그 자리에서 더 약한 개체 여러 마리로 갈라진다 (자식은 변종을 물려받지 않는다)
  spawnSplit(parent) {
    const v = CFG.variants.split;
    for (let i = 0; i < v.childCount; i++) {
      const a = Math.PI * 2 * i / v.childCount + Math.random() * 0.6;
      const r = parent.st.radius + 0.5;
      this.spawn(
        parent.type,
        parent.wave,
        parent.x + Math.cos(a) * r,
        parent.z + Math.sin(a) * r,
        void 0,
        null,
        { hp: v.childHpMult, scale: v.childScaleMult }
      );
    }
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
      if (this._isRegenActive(e, now)) {
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * CFG.variants.regen.hpPerSec * dt2);
        e.refreshBar();
        if (e.bodyMat) {
          e.bodyMat.emissive?.setHex(3390720);
          e.bodyMat.emissiveIntensity = 0.5 + Math.sin(now * 5) * 0.15;
        }
      }
      if (e.st.healAura) {
        e._healCd = (e._healCd || 0) - dt2;
        if (e._healCd <= 0) {
          const ha2 = e.st.healAura;
          e._healCd = ha2.interval;
          let healedAny = false;
          for (const o of list) {
            if (o === e || o.dead || o.hp >= o.maxHp) continue;
            if (dist(e.x, e.z, o.x, o.z) > ha2.radius) continue;
            o.hp = Math.min(o.maxHp, o.hp + o.maxHp * ha2.pct);
            o.refreshBar();
            healedAny = true;
          }
          if (healedAny) this.onHealPulse?.(e);
        }
      }
      if (e.st.wild) {
        this._wildTick(e, dt2, now, players);
        continue;
      }
      if (e.st.scout) {
        this._scoutTick(e, dt2, now);
        continue;
      }
      if (e.st.rallyAura) {
        e._rallyCd = (e._rallyCd || 0) - dt2;
        if (e._rallyCd <= 0) {
          const ra2 = e.st.rallyAura;
          e._rallyCd = ra2.interval;
          let rallied = false;
          for (const o of list) {
            if (o === e || o.dead) continue;
            if (dist(e.x, e.z, o.x, o.z) > ra2.radius) continue;
            o.rallyUntil = now + ra2.duration;
            o.rallyMult = ra2.mult;
            rallied = true;
          }
          if (rallied) this.onRallyPulse?.(e);
        }
      }
      if (e.st.boss && this._bossTick(e, dt2, now)) {
        this._applyPosition(e, dt2, now);
        continue;
      }
      if (e.variant === "dash") {
        e.dashCd -= dt2;
        if (e.dashCd <= 0) {
          e.dashCd = CFG.variants.dash.interval;
          e.dashUntil = now + CFG.variants.dash.duration;
        }
      }
      const dashMult = e.variant === "dash" && now < e.dashUntil ? CFG.variants.dash.speedMult : 1;
      const rootMult = now < e.rootUntil ? 0 : 1;
      const rallyMult = now < (e.rallyUntil || 0) ? e.rallyMult : 1;
      const speed = e.st.speed * e.slowFactor * dashMult * rootMult * rallyMult * (e.isCharging ? CFG.bossPattern.chargeSpeed / e.st.speed : 1);
      if (e.st.flees) {
        const p22 = this._nearestPlayer(players, e.x, e.z, 16);
        const fx2 = p22 ? e.x - p22.x : e.x, fz2 = p22 ? e.z - p22.z : e.z;
        const len3 = Math.hypot(fx2, fz2) || 1;
        let mx3 = fx2 / len3 * speed, mz3 = fz2 / len3 * speed;
        const sep3 = this._separation(e);
        mx3 += sep3.x * speed * 0.6;
        mz3 += sep3.z * speed * 0.6;
        e.x += mx3 * dt2;
        e.z += mz3 * dt2;
        this._face(e, e.x + mx3, e.z + mz3, dt2);
        this._applyPosition(e, dt2, now);
        continue;
      }
      if (e.st.burrows && e.diving && Math.hypot(e.x, e.z) <= e.st.emergeRange) {
        e.diving = false;
        this.fx.ring(e.x, e.z, 9127187, 2.4);
        this.fx.burst(e.x, 0.3, e.z, 9127187, 12, 4);
        this.onBurrowEmerge?.(e);
      }
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
      if (e.st.flies || e.st.burrows) {
        const dx2 = -e.x, dz2 = -e.z;
        const len2 = Math.hypot(dx2, dz2) || 1;
        let mx2 = dx2 / len2 * speed, mz2 = dz2 / len2 * speed;
        const sep2 = this._separation(e);
        mx2 += sep2.x * speed * 0.6;
        mz2 += sep2.z * speed * 0.6;
        e.x += mx2 * dt2;
        e.z += mz2 * dt2;
        this._face(e, e.x + mx2, e.z + mz2, dt2);
        if (e.st.burrows && e.diving) {
          e._dustCd -= dt2;
          if (e._dustCd <= 0) {
            e._dustCd = 0.35;
            this.fx.ring(e.x, e.z, 9127187, 0.9);
          }
        }
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
      if (e.st.stealsNodes && (e._stolen || 0) < e.st.stealMax) {
        const target = this._nearestNode(e.x, e.z);
        if (target) {
          const d2 = dist(e.x, e.z, target.x, target.z);
          if (d2 < 1.6 + e.st.radius) {
            e._stealCd = (e._stealCd || 0) - dt2;
            if (e._stealCd <= 0) {
              e._stealCd = e.st.stealInterval;
              e._stolen = (e._stolen || 0) + 1;
              this.onNodeSteal?.(e, target);
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
        if (step.building && step.building.def.blocks) {
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
  // 보스 전용 갱신. 이번 프레임을 보스 패턴이 가져갔으면 true (일반 이동을 건너뛴다).
  _bossTick(e, dt2, now) {
    const P2 = CFG.bossPattern;
    if (e.castUntil > 0) {
      e.castUntil -= dt2;
      if (e.castUntil > 0) {
        e.vx = 0;
        e.vz = 0;
        return true;
      }
      const kind = e.castKind;
      e.castKind = null;
      if (kind === "summon") this._bossSummon(e);
      else if (kind === "silence") this._bossSilence(e);
      else if (kind === "drain") this._bossDrain(e);
      else if (kind === "fortify") this._bossFortify(e);
      else this._bossBeginCharge(e);
      return true;
    }
    if (e.chargeUntil > 0) {
      e.chargeUntil -= dt2;
      const sp2 = P2.chargeSpeed;
      e.x += e.chargeDir.x * sp2 * dt2;
      e.z += e.chargeDir.z * sp2 * dt2;
      this.onBossCharge?.(e);
      if (e.chargeUntil <= 0) e.chargeCd = P2.chargeCd;
      return true;
    }
    const ratio = e.hp / e.maxHp;
    if (e.summonsDone < P2.summonAt.length && ratio <= P2.summonAt[e.summonsDone]) {
      e.summonsDone++;
      const silence = !!e.st.silenceBoss;
      const drain = !!e.st.drainBoss;
      const fortify = !!e.st.fortifyBoss;
      const kind2 = silence ? "silence" : drain ? "drain" : fortify ? "fortify" : "summon";
      e.castKind = kind2;
      e.castUntil = silence ? P2.silenceCast : drain ? P2.drainCast : fortify ? P2.fortifyCast : P2.summonCast;
      const color = silence ? 8011711 : drain ? 16766720 : fortify ? 8945076 : 16733525;
      this.fx.ring(e.x, e.z, color, 5);
      this.onBossTelegraph?.(e, kind2);
      return true;
    }
    e.chargeCd -= dt2;
    if (e.chargeCd <= 0 && Math.hypot(e.x, e.z) > P2.chargeMinDist) {
      e.castKind = "charge";
      e.castUntil = P2.chargeCast;
      this.fx.ring(e.x, e.z, 16755302, 4);
      this.onBossTelegraph?.(e, "charge");
      return true;
    }
    return false;
  }
  _bossSummon(e) {
    const P2 = CFG.bossPattern;
    const variant = e.st.summonVariant || null;
    for (let i = 0; i < P2.summonCount; i++) {
      const a = Math.PI * 2 * i / P2.summonCount + Math.random();
      const r = e.st.radius + 1.6;
      this.spawn(P2.summonType, this.waveOf(e), e.x + Math.cos(a) * r, e.z + Math.sin(a) * r, void 0, variant);
    }
    this.fx.ring(e.x, e.z, 16733525, 7);
    this.onBossSummon?.(e, P2.summonCount);
  }
  // 침묵의 군주 전용 — 자기 발밑에 타워를 멈추는 장판을 깐다 (실제 무력화 판정은 buildings.js 의
  // updateTowers 가 e.silenceUntil 을 직접 읽어서 한다)
  _bossSilence(e) {
    const P2 = CFG.bossPattern;
    e.silenceUntil = performance.now() / 1e3 + P2.silenceTime;
    this.fx.ring(e.x, e.z, 8011711, P2.silenceRadius);
    this.onBossTelegraph?.(e, "silenceGo");
  }
  // 갈취자 전용 — 실제 자원 차감·자기 회복은 팀 자원 풀에 접근해야 해서 game.js 쪽 콜백이 처리한다.
  _bossDrain(e) {
    this.fx.ring(e.x, e.z, 16766720, 6);
    this.onBossDrain?.(e);
  }
  // 강철 수호자 전용 — 자기 자신에게 방벽을 두른다 (실제 피해 감소 판정은 damage() 가
  // fortifyUntil 을 직접 읽어서 한다)
  _bossFortify(e) {
    const P2 = CFG.bossPattern;
    e.fortifyUntil = performance.now() / 1e3 + P2.fortifyTime;
    this.fx.ring(e.x, e.z, 8945076, 5);
    this.onBossTelegraph?.(e, "fortifyGo");
  }
  _bossBeginCharge(e) {
    const P2 = CFG.bossPattern;
    const len = Math.hypot(e.x, e.z) || 1;
    e.chargeDir.x = -e.x / len;
    e.chargeDir.z = -e.z / len;
    e.chargeUntil = P2.chargeTime;
    this.onBossTelegraph?.(e, "chargeGo");
  }
  // 소환된 잡졸의 웨이브 스케일은 보스가 속한 웨이브를 따른다
  waveOf(e) {
    return e.wave || this.currentWave || 1;
  }
  // 재생 변종이 지금 실제로 체력을 회복하는 중인지 (연출 색·회복 계산에 공용으로 쓴다)
  _isRegenActive(e, now) {
    return e.variant === "regen" && e.hp < e.maxHp && now - (e._lastHitAt || 0) >= CFG.variants.regen.quietTime;
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
  // 야생 동물 전용 이동. 셋 다 크리스탈에는 관심이 없다.
  //  - 도망형(토끼·사슴): 사거리 안에 사람이 보이면 반대로 달아나고, 없으면 느긋하게 배회한다.
  //  - 반격형(멧돼지): 평소엔 배회하다가 맞으면 때린 사람을 aggroTime 동안 쫓아가 들이받는다.
  _wildTick(e, dt2, now, players) {
    const st = e.st;
    const speed = st.speed * e.slowFactor * (now < e.rootUntil ? 0 : 1);
    let tx = null, tz = null, chasing = false;
    if (e.aggroUntil > now && e.aggroTarget) {
      const p2 = players.find((p3) => p3.id === e.aggroTarget && p3.alive);
      if (p2) {
        tx = p2.x;
        tz = p2.z;
        chasing = true;
      } else {
        e.aggroUntil = 0;
      }
    }
    if (!chasing && st.hunts) {
      const near2 = this._nearestPlayer(players, e.x, e.z, st.huntRange || 10);
      if (near2) {
        e.aggroTarget = near2.id;
        e.aggroUntil = now + 1;
        tx = near2.x;
        tz = near2.z;
        chasing = true;
      }
    }
    if (!chasing) {
      const near = st.flees ? this._nearestPlayer(players, e.x, e.z, st.fleeRange || 12) : null;
      if (near) {
        tx = e.x + (e.x - near.x);
        tz = e.z + (e.z - near.z);
      } else {
        e._wanderCd = (e._wanderCd || 0) - dt2;
        if (e._wanderCd <= 0) {
          e._wanderCd = 2 + Math.random() * 3;
          e._wanderAng = Math.random() * Math.PI * 2;
        }
        tx = e.x + Math.cos(e._wanderAng) * 4;
        tz = e.z + Math.sin(e._wanderAng) * 4;
      }
    }
    const dx = tx - e.x, dz = tz - e.z;
    const len = Math.hypot(dx, dz) || 1;
    const mult = chasing ? 1 : this._nearestPlayer(players, e.x, e.z, st.fleeRange || 12) ? 1 : 0.35;
    let mx = dx / len * speed * mult, mz = dz / len * speed * mult;
    const sep = this._separation(e);
    mx += sep.x * speed * 0.5;
    mz += sep.z * speed * 0.5;
    e.x += mx * dt2;
    e.z += mz * dt2;
    const lim = CFG.world.size / 2 - 2;
    e.x = clamp(e.x, -lim, lim);
    e.z = clamp(e.z, -lim, lim);
    e.attackCd -= dt2;
    if (chasing && st.dmg > 0) {
      const p2 = players.find((p3) => p3.id === e.aggroTarget);
      if (p2 && dist(e.x, e.z, p2.x, p2.z) <= 1.5 + st.radius && e.attackCd <= 0) {
        e.attackCd = 1 / st.rate;
        this.onPlayerHit?.(e, p2);
      }
    }
    this._face(e, e.x + mx, e.z + mz, dt2);
    this._applyPosition(e, dt2, now);
  }
  // 가장 가까운 포탈을 향해 직선으로 달린다 — 도착 여부(포탈까지 거리) 판정은 game.js 의
  // _updateScout 가 한다(이 메서드는 순수 이동만 담당)
  _scoutTick(e, dt2, now) {
    const portals = this.world.portals;
    if (!portals || !portals.length) return;
    let target = portals[0], bestD = Infinity;
    for (const p2 of portals) {
      const d2 = (p2.x - e.x) ** 2 + (p2.z - e.z) ** 2;
      if (d2 < bestD) {
        bestD = d2;
        target = p2;
      }
    }
    const dx = target.x - e.x, dz = target.z - e.z;
    const len = Math.hypot(dx, dz) || 1;
    const mx = dx / len * e.st.speed, mz = dz / len * e.st.speed;
    e.x += mx * dt2;
    e.z += mz * dt2;
    this._face(e, e.x + mx, e.z + mz, dt2);
    this._applyPosition(e, dt2, now);
  }
  _nearestPlayer(players, x2, z2, range) {
    let best = null, bd2 = range * range;
    for (const p2 of players) {
      if (!p2.alive || p2.invulnerable) continue;
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
      if (b.isTrap) continue;
      const d2 = (b.x - x2) ** 2 + (b.z - z2) ** 2;
      if (d2 < bd2) {
        bd2 = d2;
        best = b;
      }
    }
    return best;
  }
  _nearestNode(x2, z2) {
    let best = null, bd2 = Infinity;
    for (const n of this.world.nodes) {
      if (n.depleted || n.mimic) continue;
      const d2 = (n.x - x2) ** 2 + (n.z - z2) ** 2;
      if (d2 < bd2) {
        bd2 = d2;
        best = n;
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
    const groundY = e.st.burrows && e.diving ? -0.85 : 0;
    e.mesh.position.set(e.x + e._kox, e.st.flies ? CFG.flyHeight : groundY, e.z + e._koz);
    e._bob += dt2 * (6 + e.st.speed);
    if (e.instanced) this._writeInstance(e, now);
    else e.body.position.y = 0.75 + Math.abs(Math.sin(e._bob)) * 0.12;
  }
  // 히트 플래시 · 넉백 오프셋 · 펀치 스케일을 서서히 원상 복귀시킨다
  _settle(e, dt2) {
    if (e._flash > 0) {
      e._flash -= dt2;
      if (e._flash <= 0 && e.bodyMat) e.bodyMat.color.setHex(e.tintColor);
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
    else if (now !== void 0 && now < e.rootUntil) color = _tmpColor.set(e.tintColor).lerp(_rootColor, 0.7);
    else if (now !== void 0 && now < e.poisonUntil) color = _tmpColor.set(e.tintColor).lerp(_poisonColor, 0.6);
    else if (now !== void 0 && now < e.slowUntil) color = _tmpColor.set(e.tintColor).lerp(_slowColor, 0.6);
    else if (now !== void 0 && this._isRegenActive(e, now)) color = _tmpColor.set(e.tintColor).lerp(_regenColor, 0.55);
    else color = _tmpColor.set(e.tintColor);
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
        Math.round(e.mesh.rotation.y * 100) / 100,
        // 보스 예고/돌진 상태 — 참가자도 경고를 보고 피할 수 있어야 한다
        e.castKind ? 1 : e.isCharging ? 2 : 0,
        e.variant || "",
        e.elite ? 1 : 0,
        e.diving ? 1 : 0
      ]);
    }
    return out;
  }
  applySnapshot(list, wave) {
    const seen = /* @__PURE__ */ new Set();
    for (const [id, type, x2, z2, hp, rot, boss, variant, elite, diving] of list) {
      seen.add(id);
      let e = this.byId(id);
      if (!e) {
        const ec = CFG.elite;
        const statMult = elite ? { hp: ec.hpMult, scale: ec.scaleMult, dmg: ec.dmgMult, bounty: ec.bountyMult, elite: true } : void 0;
        e = this.spawn(type, wave, x2, z2, id, variant || null, statMult);
        if (!e) continue;
      }
      e.netTarget = { x: x2, z: z2, rot };
      e.hp = hp;
      e.refreshBar();
      if (e.st.burrows && e.diving && !diving) {
        e.diving = false;
        this.fx.ring(e.x, e.z, 9127187, 2.4);
        this.fx.burst(e.x, 0.3, e.z, 9127187, 12, 4);
        this.onBurrowEmerge?.(e);
      }
      if (boss !== e._netBoss) {
        const prevBoss = e._netBoss;
        e._netBoss = boss;
        if (boss === 1) {
          this.fx.ring(x2, z2, 16755302, 5);
          this.onBossTelegraph?.(e, "netCast");
        } else if (boss === 2) {
          this.onBossTelegraph?.(e, "netCharge");
        } else if (boss === 0 && prevBoss === 1 && e.st.silenceBoss) {
          e.silenceUntil = performance.now() / 1e3 + CFG.bossPattern.silenceTime;
          this.fx.ring(x2, z2, 8011711, CFG.bossPattern.silenceRadius);
        } else if (boss === 0 && prevBoss === 1 && e.st.fortifyBoss) {
          e.fortifyUntil = performance.now() / 1e3 + CFG.bossPattern.fortifyTime;
          this.fx.ring(x2, z2, 8945076, 5);
        }
      }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (!seen.has(e.id)) {
        this.fx.burst(e.x, 1, e.z, e.tintColor, 8, 4);
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
      const groundY = e.st.burrows && e.diving ? -0.85 : 0;
      e.mesh.position.set(e.x + e._kox, e.st.flies ? CFG.flyHeight : groundY, e.z + e._koz);
      e.mesh.rotation.y = e.netTarget.rot;
      e._bob += dt2 * 8;
      if (e.instanced) this._writeInstance(e);
      else e.body.position.y = 0.75 + Math.abs(Math.sin(e._bob)) * 0.12;
    }
  }
};
