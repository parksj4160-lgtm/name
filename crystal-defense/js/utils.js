// 자잘한 공용 헬퍼.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const dist2 = (ax, az, bx, bz) => {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
};
export const dist = (ax, az, bx, bz) => Math.sqrt(dist2(ax, az, bx, bz));

export function shortId() {
  return Math.random().toString(36).slice(2, 8);
}

export function roomCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// 결정적 난수 (맵 생성용) — 같은 시드면 모든 플레이어가 같은 맵을 본다.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fmtTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// 비용 표시/판정 헬퍼
export function canAfford(res, cost) {
  if (!cost) return false;
  return (res.wood || 0) >= (cost.wood || 0) && (res.stone || 0) >= (cost.stone || 0);
}
export function payCost(res, cost) {
  res.wood -= cost.wood || 0;
  res.stone -= cost.stone || 0;
}
export function costText(cost) {
  if (!cost) return '-';
  const parts = [];
  if (cost.wood) parts.push(`🪵${cost.wood}`);
  if (cost.stone) parts.push(`🪨${cost.stone}`);
  return parts.join(' ');
}
