// 근접 공격 판정 공용 로직. 공격 모션의 히트 프레임에서 호출된다.
const CRIT_CHANCE = 0.16;
const CRIT_MULT = 1.7;

function rollDamage(attack) {
  const crit = Math.random() < CRIT_CHANCE;
  const dmg = Math.max(1, Math.round(attack * (crit ? CRIT_MULT : 1) * randFloat(0.92, 1.08)));
  return { dmg, crit };
}

// 전방 부채꼴 안의 몬스터 최대 2마리를 때린다. 실제 데미지 적용은 onHit에 위임.
function resolveMeleeAttack(player, enemies, onHit) {
  const dir = player.facing;
  const inRange = [];
  for (const e of enemies) {
    if (e.dead) continue;
    const dx = (e.x - player.x) * dir;
    if (dx > -30 && dx < MELEE_RANGE) inRange.push(e);
  }
  if (!inRange.length) return false;
  inRange.sort((a, b) => Math.abs(a.x - player.x) - Math.abs(b.x - player.x));
  inRange.slice(0, 2).forEach(e => {
    const { dmg, crit } = rollDamage(player.attack);
    onHit(e, dmg, crit, dir);
  });
  return true;
}

// 피격 연출 (데미지 숫자 / 스파크 / 화면 흔들림)
function showHitFeedback(enemy, dmg, crit) {
  const cy = enemy.baseY - enemy.def.height * 0.6;
  FX.damage(enemy.x, cy, dmg, { color: crit ? '#ffd24a' : '#fff6d5', crit });
  FX.hit(enemy.x + randFloat(-6, 6), cy, crit ? '#ffd24a' : '#ffffff', crit ? 16 : 9);
  FX.shake(crit ? 8 : 4, crit ? 0.2 : 0.12);
  if (crit) FX.notice(enemy.x, cy - 26, 'CRITICAL!', '#ffd24a');
}

// 몬스터 사망 보상 지급
function awardKill(gm, enemy) {
  const leveled = gm.player.gainExp(enemy.expReward);
  gm.player.gold += enemy.goldReward;
  FX.notice(enemy.x, enemy.baseY - 100, `+${enemy.expReward} EXP  +${enemy.goldReward} G`, '#ffe27a');
  gm.onEnemyKilled(leveled);
}
