export var clamp = (v2, a, b) => v2 < a ? a : v2 > b ? b : v2;
export var pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
var dist2 = (ax, az, bx, bz) => {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
};
export var dist = (ax, az, bx, bz) => Math.sqrt(dist2(ax, az, bx, bz));
export function shortId() {
  return Math.random().toString(36).slice(2, 8);
}
export function roomCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s2 = "";
  for (let i = 0; i < 4; i++) s2 += chars[Math.floor(Math.random() * chars.length)];
  return s2;
}
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a |= 0;
    a = a + 1831565813 | 0;
    let t2 = Math.imul(a ^ a >>> 15, 1 | a);
    t2 = t2 + Math.imul(t2 ^ t2 >>> 7, 61 | t2) ^ t2;
    return ((t2 ^ t2 >>> 14) >>> 0) / 4294967296;
  };
}
export function fmtTime(sec) {
  const s2 = Math.max(0, Math.ceil(sec));
  return `${String(Math.floor(s2 / 60)).padStart(2, "0")}:${String(s2 % 60).padStart(2, "0")}`;
}
// 자원 종류와 표시용 아이콘. 새 자원은 여기만 늘리면 비용 계산이 따라온다.
export var RES_ICON = { wood: "🪵", stone: "🪨", iron: "⚙️", shard: "💠" };
var COST_KEYS = ["wood", "stone", "iron"];
export function canAfford(res, cost) {
  if (!cost) return false;
  return COST_KEYS.every((k2) => (res[k2] || 0) >= (cost[k2] || 0));
}
export function payCost(res, cost) {
  for (const k2 of COST_KEYS) if (cost[k2]) res[k2] = (res[k2] || 0) - cost[k2];
}
export function costText(cost) {
  if (!cost) return "-";
  const parts = [];
  for (const k2 of COST_KEYS) if (cost[k2]) parts.push(`${RES_ICON[k2]}${cost[k2]}`);
  return parts.join(" ");
}
