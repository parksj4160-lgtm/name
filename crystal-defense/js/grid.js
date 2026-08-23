import { CFG } from './config.js';

var DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2]
];
var MinHeap = class {
  constructor() {
    this.a = [];
  }
  get size() {
    return this.a.length;
  }
  push(node, pri) {
    const a = this.a;
    a.push({ node, pri });
    let i = a.length - 1;
    while (i > 0) {
      const p2 = i - 1 >> 1;
      if (a[p2].pri <= a[i].pri) break;
      [a[p2], a[i]] = [a[i], a[p2]];
      i = p2;
    }
  }
  pop() {
    const a = this.a, top = a[0], last2 = a.pop();
    if (a.length) {
      a[0] = last2;
      let i = 0;
      for (; ; ) {
        const l2 = i * 2 + 1, r = l2 + 1;
        let m2 = i;
        if (l2 < a.length && a[l2].pri < a[m2].pri) m2 = l2;
        if (r < a.length && a[r].pri < a[m2].pri) m2 = r;
        if (m2 === i) break;
        [a[m2], a[i]] = [a[i], a[m2]];
        i = m2;
      }
    }
    return top;
  }
};
export var BuildGrid = class {
  constructor() {
    this.cell = CFG.world.cell;
    this.n = Math.floor(CFG.world.size / this.cell);
    this.half = this.n / 2;
    this.occupied = new Array(this.n * this.n).fill(null);
    this.flowDist = new Float32Array(this.n * this.n).fill(Infinity);
    this.flowNext = new Int32Array(this.n * this.n).fill(-1);
    this.dirty = true;
  }
  idx(gx, gz) {
    return gz * this.n + gx;
  }
  inBounds(gx, gz) {
    return gx >= 0 && gz >= 0 && gx < this.n && gz < this.n;
  }
  toGrid(x2, z2) {
    return {
      gx: Math.floor(x2 / this.cell + this.half),
      gz: Math.floor(z2 / this.cell + this.half)
    };
  }
  toWorld(gx, gz) {
    return {
      x: (gx - this.half + 0.5) * this.cell,
      z: (gz - this.half + 0.5) * this.cell
    };
  }
  at(gx, gz) {
    return this.inBounds(gx, gz) ? this.occupied[this.idx(gx, gz)] : null;
  }
  atWorld(x2, z2) {
    const g2 = this.toGrid(x2, z2);
    return this.at(g2.gx, g2.gz);
  }
  set(gx, gz, building) {
    if (!this.inBounds(gx, gz)) return;
    this.occupied[this.idx(gx, gz)] = building;
    this.dirty = true;
  }
  clear(gx, gz) {
    this.set(gx, gz, null);
  }
  // 건설 가능 판정. 이유 문자열을 함께 돌려준다.
  canPlace(gx, gz, blockers) {
    if (!this.inBounds(gx, gz)) return { ok: false, why: "맵 밖입니다" };
    const w2 = this.toWorld(gx, gz);
    const d2 = Math.hypot(w2.x, w2.z);
    if (d2 > CFG.world.buildRadius) return { ok: false, why: "건설 가능 구역 밖입니다" };
    if (d2 < CFG.world.coreRadius) return { ok: false, why: "크리스탈에 너무 가깝습니다" };
    if (this.at(gx, gz)) return { ok: false, why: "이미 건물이 있습니다" };
    if (blockers && blockers(w2.x, w2.z)) return { ok: false, why: "다른 오브젝트와 겹칩니다" };
    return { ok: true, why: "", x: w2.x, z: w2.z };
  }
  // 크리스탈(중앙)로 향하는 플로우 필드 재계산
  rebuildFlow() {
    const n = this.n, total = n * n;
    const distArr = this.flowDist, nextArr = this.flowNext;
    distArr.fill(Infinity);
    nextArr.fill(-1);
    const heap = new MinHeap();
    const targetR = CFG.crystal.hitRange / this.cell;
    const c2 = this.half;
    for (let gz = 0; gz < n; gz++) {
      for (let gx = 0; gx < n; gx++) {
        const dx = gx - c2 + 0.5, dz = gz - c2 + 0.5;
        if (Math.hypot(dx, dz) <= targetR) {
          const i = this.idx(gx, gz);
          distArr[i] = 0;
          heap.push(i, 0);
        }
      }
    }
    const enterCost = (i) => {
      const b = this.occupied[i];
      if (!b || !b.def.blocks) return 1;
      return 1 + b.hp / 30;
    };
    while (heap.size) {
      const { node: i, pri } = heap.pop();
      if (pri > distArr[i] + 1e-6) continue;
      const gx = i % n, gz = i / n | 0;
      for (let d2 = 0; d2 < DIRS.length; d2++) {
        const [dx, dz, w2] = DIRS[d2];
        const nx = gx + dx, nz = gz + dz;
        if (!this.inBounds(nx, nz)) continue;
        if (dx && dz) {
          if (this.occupied[this.idx(gx + dx, gz)] || this.occupied[this.idx(gx, gz + dz)]) continue;
        }
        const ni2 = this.idx(nx, nz);
        const nd2 = pri + w2 * enterCost(ni2);
        if (nd2 < distArr[ni2] - 1e-6) {
          distArr[ni2] = nd2;
          nextArr[ni2] = i;
          heap.push(ni2, nd2);
        }
      }
    }
    this.dirty = false;
  }
  ensureFlow() {
    if (this.dirty) this.rebuildFlow();
  }
  // 해당 위치에서 크리스탈로 가는 다음 칸의 월드 좌표 (없으면 null)
  nextStep(x2, z2) {
    this.ensureFlow();
    const g2 = this.toGrid(x2, z2);
    if (!this.inBounds(g2.gx, g2.gz)) {
      return { x: 0, z: 0, building: null };
    }
    const i = this.idx(g2.gx, g2.gz);
    const ni2 = this.flowNext[i];
    if (ni2 < 0) return null;
    const ngx = ni2 % this.n, ngz = ni2 / this.n | 0;
    const w2 = this.toWorld(ngx, ngz);
    return { x: w2.x, z: w2.z, building: this.occupied[ni2] };
  }
  // 원 안에 있는 건물 목록 (스플래시 판정 등)
  buildingsNear(x2, z2, radius) {
    const out = [];
    const r = Math.ceil(radius / this.cell);
    const g2 = this.toGrid(x2, z2);
    for (let gz = g2.gz - r; gz <= g2.gz + r; gz++) {
      for (let gx = g2.gx - r; gx <= g2.gx + r; gx++) {
        const b = this.at(gx, gz);
        if (b && !out.includes(b)) out.push(b);
      }
    }
    return out;
  }
};
