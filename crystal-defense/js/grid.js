// 건설 그리드 + 몬스터용 플로우 필드(경로) 계산.
//
// 경로는 "벽을 통과할 수도 있지만 아주 비싸다"는 비용 모델로 만든다.
//  - 길이 열려 있으면 몬스터는 벽을 돌아서 간다.
//  - 완전히 막히면 가장 약한 벽을 뚫는 경로가 최단이 되어 그 벽을 부순다.
// 덕분에 A* 재계산 없이 한 번의 다익스트라로 모든 몬스터가 길을 공유한다.
import { CFG } from './config.js';

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(node, pri) {
    const a = this.a; a.push({ node, pri });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].pri <= a[i].pri) break;
      [a[p], a[i]] = [a[i], a[p]]; i = p;
    }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].pri < a[m].pri) m = l;
        if (r < a.length && a[r].pri < a[m].pri) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}

export class BuildGrid {
  constructor() {
    this.cell = CFG.world.cell;
    this.n = Math.floor(CFG.world.size / this.cell);   // 한 변 칸 수
    this.half = this.n / 2;
    this.occupied = new Array(this.n * this.n).fill(null); // idx -> building
    this.flowDist = new Float32Array(this.n * this.n).fill(Infinity);
    this.flowNext = new Int32Array(this.n * this.n).fill(-1);
    this.dirty = true;
  }

  idx(gx, gz) { return gz * this.n + gx; }
  inBounds(gx, gz) { return gx >= 0 && gz >= 0 && gx < this.n && gz < this.n; }

  toGrid(x, z) {
    return {
      gx: Math.floor(x / this.cell + this.half),
      gz: Math.floor(z / this.cell + this.half),
    };
  }
  toWorld(gx, gz) {
    return {
      x: (gx - this.half + 0.5) * this.cell,
      z: (gz - this.half + 0.5) * this.cell,
    };
  }

  at(gx, gz) { return this.inBounds(gx, gz) ? this.occupied[this.idx(gx, gz)] : null; }
  atWorld(x, z) { const g = this.toGrid(x, z); return this.at(g.gx, g.gz); }

  set(gx, gz, building) {
    if (!this.inBounds(gx, gz)) return;
    this.occupied[this.idx(gx, gz)] = building;
    this.dirty = true;
  }
  clear(gx, gz) { this.set(gx, gz, null); }

  // 건설 가능 판정. 이유 문자열을 함께 돌려준다.
  canPlace(gx, gz, blockers) {
    if (!this.inBounds(gx, gz)) return { ok: false, why: '맵 밖입니다' };
    const w = this.toWorld(gx, gz);
    const d = Math.hypot(w.x, w.z);
    if (d > CFG.world.buildRadius) return { ok: false, why: '건설 가능 구역 밖입니다' };
    if (d < CFG.world.coreRadius) return { ok: false, why: '크리스탈에 너무 가깝습니다' };
    if (this.at(gx, gz)) return { ok: false, why: '이미 건물이 있습니다' };
    if (blockers && blockers(w.x, w.z)) return { ok: false, why: '다른 오브젝트와 겹칩니다' };
    return { ok: true, why: '', x: w.x, z: w.z };
  }

  // 크리스탈(중앙)로 향하는 플로우 필드 재계산
  rebuildFlow() {
    const n = this.n, total = n * n;
    const distArr = this.flowDist, nextArr = this.flowNext;
    distArr.fill(Infinity); nextArr.fill(-1);

    const heap = new MinHeap();
    const targetR = CFG.crystal.hitRange / this.cell;
    const c = this.half;
    for (let gz = 0; gz < n; gz++) {
      for (let gx = 0; gx < n; gx++) {
        const dx = gx - c + 0.5, dz = gz - c + 0.5;
        if (Math.hypot(dx, dz) <= targetR) {
          const i = this.idx(gx, gz);
          distArr[i] = 0;
          heap.push(i, 0);
        }
      }
    }

    const enterCost = (i) => {
      const b = this.occupied[i];
      if (!b) return 1;
      // 벽 체력이 높을수록 뚫기 비싸다 → 자연스럽게 돌아가거나 약한 벽을 노린다.
      return 1 + b.hp / 30;
    };

    while (heap.size) {
      const { node: i, pri } = heap.pop();
      if (pri > distArr[i] + 1e-6) continue;
      const gx = i % n, gz = (i / n) | 0;
      for (let d = 0; d < DIRS.length; d++) {
        const [dx, dz, w] = DIRS[d];
        const nx = gx + dx, nz = gz + dz;
        if (!this.inBounds(nx, nz)) continue;
        // 대각선으로 벽 모서리를 스치듯 지나가지 못하게 막는다
        if (dx && dz) {
          if (this.occupied[this.idx(gx + dx, gz)] || this.occupied[this.idx(gx, gz + dz)]) continue;
        }
        const ni = this.idx(nx, nz);
        const nd = pri + w * enterCost(ni);
        if (nd < distArr[ni] - 1e-6) {
          distArr[ni] = nd;
          nextArr[ni] = i;       // 이 칸에서 나아갈 다음 칸
          heap.push(ni, nd);
        }
      }
    }
    this.dirty = false;
  }

  ensureFlow() { if (this.dirty) this.rebuildFlow(); }

  // 해당 위치에서 크리스탈로 가는 다음 칸의 월드 좌표 (없으면 null)
  nextStep(x, z) {
    this.ensureFlow();
    const g = this.toGrid(x, z);
    if (!this.inBounds(g.gx, g.gz)) {
      return { x: 0, z: 0, building: null }; // 맵 밖이면 일단 중앙으로
    }
    const i = this.idx(g.gx, g.gz);
    const ni = this.flowNext[i];
    if (ni < 0) return null;
    const ngx = ni % this.n, ngz = (ni / this.n) | 0;
    const w = this.toWorld(ngx, ngz);
    return { x: w.x, z: w.z, building: this.occupied[ni] };
  }

  // 원 안에 있는 건물 목록 (스플래시 판정 등)
  buildingsNear(x, z, radius) {
    const out = [];
    const r = Math.ceil(radius / this.cell);
    const g = this.toGrid(x, z);
    for (let gz = g.gz - r; gz <= g.gz + r; gz++) {
      for (let gx = g.gx - r; gx <= g.gx + r; gx++) {
        const b = this.at(gx, gz);
        if (b && !out.includes(b)) out.push(b);
      }
    }
    return out;
  }
}
